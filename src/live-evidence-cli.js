import { constants as fsConstants } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { link, lstat, open, realpath, unlink } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { types as utilTypes } from 'node:util';

import {
  assembleLiveEvidenceBundle,
  createLiveEvidenceTemplate,
  parseLiveEvidenceBundle,
  parseLiveEvidenceFragment,
  serializeLiveEvidenceBundle,
  serializeLiveEvidenceTemplate,
  verifyLiveEvidenceBundle,
} from './live-evidence.js';

const FAILURE = 'LIVE_EVIDENCE_FAILED\n';
const SUCCESS = Object.freeze({
  template: 'LIVE_EVIDENCE_TEMPLATE_CREATED\n',
  assemble: 'LIVE_EVIDENCE_BUNDLE_ASSEMBLED\n',
  verify: 'LIVE_EVIDENCE_VALID\n',
});
const INPUT_LIMITS = Object.freeze({
  manifest: 64 * 1024,
  chain: 64 * 1024,
  http: 128 * 1024,
  journal: 192 * 1024,
  timing: 64 * 1024,
  bundle: 512 * 1024,
});
const OUTPUT_LIMIT = 512 * 1024;
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_PROTOTYPE = Array.prototype;
const BUFFER_BYTE_LENGTH = Buffer.byteLength;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_KEYS = Object.keys;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

function cliFailure() {
  throw new Error('live_evidence_cli_failed');
}

function plainOptions(options) {
  if (!options || typeof options !== 'object' || IS_PROXY(options) || ARRAY_IS_ARRAY(options)) cliFailure();
  let prototype;
  let keys;
  try {
    prototype = GET_PROTOTYPE_OF(options);
    keys = REFLECT_OWN_KEYS(options);
  } catch {
    cliFailure();
  }
  if (prototype !== OBJECT_PROTOTYPE) cliFailure();
  const allowed = new Set(['argv', 'readFile', 'writeExclusiveFile', 'stdout', 'stderr']);
  const snapshot = {};
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== 'string' || !allowed.has(key)) cliFailure();
    let descriptor;
    try {
      descriptor = GET_OWN_PROPERTY_DESCRIPTOR(options, key);
    } catch {
      cliFailure();
    }
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) cliFailure();
    Object.defineProperty(snapshot, key, {
      value: descriptor.value, enumerable: true, configurable: true, writable: true,
    });
  }
  return snapshot;
}

function snapshotArgv(argv) {
  if (!ARRAY_IS_ARRAY(argv) || IS_PROXY(argv) || GET_PROTOTYPE_OF(argv) !== ARRAY_PROTOTYPE) cliFailure();
  const keys = REFLECT_OWN_KEYS(argv);
  const length = argv.length;
  if (!Number.isSafeInteger(length) || length < 1 || length > 32 || keys.length !== length + 1) cliFailure();
  const output = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(argv, String(index));
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true ||
        typeof descriptor.value !== 'string' || descriptor.value.length === 0 ||
        descriptor.value.includes('\0')) cliFailure();
    Object.defineProperty(output, String(index), {
      value: descriptor.value, enumerable: true, configurable: true, writable: true,
    });
  }
  return output;
}

function parseArguments(argv) {
  const values = snapshotArgv(argv);
  const command = values[0];
  const specifications = {
    template: ['out'],
    assemble: ['manifest', 'chain', 'http', 'journal', 'timing', 'out'],
    verify: ['bundle'],
  };
  if (!HAS_OWN(specifications, command)) cliFailure();
  const expected = specifications[command];
  if (values.length !== 1 + (expected.length * 2)) cliFailure();
  const parsed = {};
  for (let index = 1; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!flag.startsWith('--') || flag.includes('=') || typeof value !== 'string' || value.startsWith('--')) {
      cliFailure();
    }
    const name = flag.slice(2);
    if (!expected.includes(name) || HAS_OWN(parsed, name)) cliFailure();
    Object.defineProperty(parsed, name, {
      value, enumerable: true, configurable: true, writable: true,
    });
  }
  if (OBJECT_KEYS(parsed).length !== expected.length) cliFailure();
  return { command, values: parsed };
}

function isMissing(error) {
  return error && typeof error === 'object' && error.code === 'ENOENT';
}

async function defaultReadFile(filename, maximumBytes) {
  let handle;
  try {
    const before = await lstat(filename);
    if (!before.isFile() || before.isSymbolicLink() || before.size > maximumBytes) cliFailure();
    handle = await open(filename, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > maximumBytes ||
        opened.dev !== before.dev || opened.ino !== before.ino) cliFailure();
    const bytes = await handle.readFile();
    if (bytes.length > maximumBytes) cliFailure();
    const after = await handle.stat();
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size ||
        after.mtimeMs !== opened.mtimeMs) cliFailure();
    const text = bytes.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(bytes)) cliFailure();
    return text;
  } catch {
    cliFailure();
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // The fixed CLI failure boundary suppresses close diagnostics.
      }
    }
  }
}

async function defaultWriteExclusiveFile(filename, text) {
  if (typeof text !== 'string' || BUFFER_BYTE_LENGTH(text, 'utf8') > OUTPUT_LIMIT ||
      typeof filename !== 'string' || filename.length === 0 || filename.includes('\0')) cliFailure();
  const output = resolve(filename);
  const parent = dirname(output);
  if (basename(output) === '.' || basename(output) === '..') cliFailure();
  try {
    const parentEntry = await lstat(parent);
    if (!parentEntry.isDirectory() || parentEntry.isSymbolicLink()) cliFailure();
    await realpath(parent);
  } catch {
    cliFailure();
  }
  try {
    await lstat(output);
    cliFailure();
  } catch (error) {
    if (!isMissing(error)) cliFailure();
  }

  const temporary = resolve(parent, `.live-evidence-${randomBytes(16).toString('hex')}.tmp`);
  let handle;
  let temporaryCreated = false;
  let outputLinked = false;
  let succeeded = false;
  try {
    handle = await open(temporary, 'wx', 0o600);
    temporaryCreated = true;
    await handle.writeFile(text, { encoding: 'utf8' });
    await handle.sync();
    await handle.close();
    handle = undefined;
    await link(temporary, output);
    outputLinked = true;
    const result = await lstat(output);
    if (!result.isFile() || result.isSymbolicLink() || (result.mode & 0o077) !== 0 ||
        result.size !== BUFFER_BYTE_LENGTH(text, 'utf8')) cliFailure();
    await unlink(temporary);
    temporaryCreated = false;
    succeeded = true;
  } catch {
    cliFailure();
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // Cleanup cannot disclose or replace the fixed failure category.
      }
    }
    if (!succeeded && outputLinked) {
      try {
        await unlink(output);
      } catch {
        // The output was created by this call; cleanup remains best effort.
      }
    }
    if (temporaryCreated) {
      try {
        await unlink(temporary);
      } catch {
        // The temporary name is never exposed.
      }
    }
  }
  if (!succeeded) cliFailure();
}

function resolvedAlias(left, right) {
  try {
    return resolve(left) === resolve(right);
  } catch {
    cliFailure();
  }
}

async function boundedRead(readFile, filename, maximumBytes) {
  const text = await readFile(filename, maximumBytes);
  if (typeof text !== 'string' || BUFFER_BYTE_LENGTH(text, 'utf8') > maximumBytes) cliFailure();
  return text;
}

async function executeCommand(command, values, readFile, writeExclusiveFile) {
  if (command === 'template') {
    const output = serializeLiveEvidenceTemplate(createLiveEvidenceTemplate());
    await writeExclusiveFile(values.out, output);
    return;
  }
  if (command === 'verify') {
    const text = await boundedRead(readFile, values.bundle, INPUT_LIMITS.bundle);
    const bundle = parseLiveEvidenceBundle(text);
    await verifyLiveEvidenceBundle(bundle);
    return;
  }

  const inputNames = ['manifest', 'chain', 'http', 'journal', 'timing'];
  for (let index = 0; index < inputNames.length; index += 1) {
    if (resolvedAlias(values[inputNames[index]], values.out)) cliFailure();
  }
  const fragments = {};
  for (let index = 0; index < inputNames.length; index += 1) {
    const name = inputNames[index];
    const text = await boundedRead(readFile, values[name], INPUT_LIMITS[name]);
    Object.defineProperty(fragments, name, {
      value: parseLiveEvidenceFragment(text, name),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  const bundle = await assembleLiveEvidenceBundle(fragments);
  const output = await serializeLiveEvidenceBundle(bundle);
  await writeExclusiveFile(values.out, output);
}

export async function runLiveEvidenceCli(options = {}) {
  let stderr = line => process.stderr.write(line);
  try {
    const supplied = plainOptions(options);
    const argv = HAS_OWN(supplied, 'argv') ? supplied.argv : process.argv.slice(2);
    const readFile = HAS_OWN(supplied, 'readFile') ? supplied.readFile : defaultReadFile;
    const writeExclusiveFile = HAS_OWN(supplied, 'writeExclusiveFile')
      ? supplied.writeExclusiveFile
      : defaultWriteExclusiveFile;
    const stdout = HAS_OWN(supplied, 'stdout') ? supplied.stdout : line => process.stdout.write(line);
    stderr = HAS_OWN(supplied, 'stderr') ? supplied.stderr : stderr;
    if (typeof readFile !== 'function' || typeof writeExclusiveFile !== 'function' ||
        typeof stdout !== 'function' || typeof stderr !== 'function') cliFailure();
    const parsed = parseArguments(argv);
    await executeCommand(parsed.command, parsed.values, readFile, writeExclusiveFile);
    await stdout(SUCCESS[parsed.command]);
    return true;
  } catch {
    try {
      await stderr(FAILURE);
    } catch {
      // A nonzero direct-entry status remains the final fixed signal.
    }
    return false;
  }
}

async function launch() {
  if (typeof process.argv[1] !== 'string' || pathToFileURL(process.argv[1]).href !== import.meta.url) return;
  const success = await runLiveEvidenceCli();
  if (!success) process.exitCode = 1;
}

void launch().catch(() => {
  process.exitCode = 1;
  try {
    process.stderr.write(FAILURE);
  } catch {
    // The exit status remains available if stderr is unavailable.
  }
});
