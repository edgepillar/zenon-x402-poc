import { Buffer } from 'node:buffer';
import { constants as fsConstants, writeSync as fsWriteSync } from 'node:fs';
import { lstat as fsLstat, open as fsOpen } from 'node:fs/promises';
import { join as pathJoin, parse as pathParse, resolve as pathResolve, sep as pathSeparator } from 'node:path';
import { pathToFileURL } from 'node:url';

import { verifyOperatorTrustedObservation } from './operator-trusted-observation.js';

const SUCCESS = 'OPERATOR_TRUSTED_OBSERVATION_SELF_CONSISTENT\n';
const FAILURE = 'OPERATOR_TRUSTED_OBSERVATION_FAILED\n';
const FILE_MAX_BYTES = 64 * 1024;
const STAT_FIELDS = Object.freeze([
  'dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs',
]);
const OPTION_FIELDS = Object.freeze(['argv', 'readFile', 'stdout', 'stderr']);
const DEPENDENCY_FIELDS = Object.freeze(['constants', 'lstat', 'open', 'resolve']);
const DEFAULT_DEPENDENCIES = Object.freeze({
  constants: fsConstants,
  lstat: fsLstat,
  open: fsOpen,
  resolve: pathResolve,
});

function cliError() {
  const error = new Error('operator_trusted_observation_cli_failed');
  Object.defineProperty(error, 'name', {
    configurable: false,
    enumerable: false,
    value: 'OperatorTrustedObservationCliError',
    writable: false,
  });
  Object.defineProperty(error, 'stack', {
    configurable: false,
    enumerable: false,
    value: undefined,
    writable: false,
  });
  return error;
}

function fail() {
  throw cliError();
}

function exactRecord(value, allowedFields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail();
  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    if (typeof key !== 'string' || !allowedFields.includes(key)) fail();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) fail();
  }
  return value;
}

function optionsSnapshot(options) {
  const value = exactRecord(options, OPTION_FIELDS);
  const output = Object.create(null);
  for (const key of Object.keys(value)) output[key] = value[key];
  return output;
}

function dependenciesSnapshot(dependencies) {
  if (dependencies === undefined) return DEFAULT_DEPENDENCIES;
  const value = exactRecord(dependencies, DEPENDENCY_FIELDS);
  if (Object.keys(value).length !== DEPENDENCY_FIELDS.length) fail();
  if (value.constants === null || typeof value.constants !== 'object' ||
      typeof value.lstat !== 'function' || typeof value.open !== 'function' ||
      typeof value.resolve !== 'function') fail();
  return {
    constants: value.constants,
    lstat: value.lstat,
    open: value.open,
    resolve: value.resolve,
  };
}

function snapshotArgv(argv) {
  if (!Array.isArray(argv) || Object.getPrototypeOf(argv) !== Array.prototype) fail();
  const keys = Reflect.ownKeys(argv);
  if (argv.length !== 2 || keys.length !== 3 || !keys.includes('length') ||
      !keys.includes('0') || !keys.includes('1')) fail();
  const values = [];
  for (let index = 0; index < 2; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(argv, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true ||
        typeof descriptor.value !== 'string') fail();
    values.push(descriptor.value);
  }
  if (values[0] !== '--file' || values[1].length === 0 || values[1].includes('\0')) fail();
  return values[1];
}

function openFlags(constants) {
  const { O_RDONLY, O_NOFOLLOW } = constants;
  if (!Number.isInteger(O_RDONLY) || !Number.isInteger(O_NOFOLLOW) || O_NOFOLLOW === 0) fail();
  const nonblock = Number.isInteger(constants.O_NONBLOCK) ? constants.O_NONBLOCK : 0;
  const cloexec = Number.isInteger(constants.O_CLOEXEC) ? constants.O_CLOEXEC : 0;
  return O_RDONLY | O_NOFOLLOW | nonblock | cloexec;
}

function modeConstants(constants) {
  if (!Number.isInteger(constants.S_IFMT) || !Number.isInteger(constants.S_IFREG) ||
      !Number.isInteger(constants.S_IFDIR)) fail();
  return {
    mask: BigInt(constants.S_IFMT),
    regular: BigInt(constants.S_IFREG),
    directory: BigInt(constants.S_IFDIR),
  };
}

function resolvedComponents(filePath, resolvePath) {
  if (typeof filePath !== 'string' || filePath.length === 0 || filePath.includes('\0')) fail();
  let absolute;
  try {
    absolute = resolvePath(filePath);
  } catch {
    fail();
  }
  if (typeof absolute !== 'string' || absolute.length === 0 || absolute.includes('\0')) fail();
  const parsed = pathParse(absolute);
  if (!parsed.root || !absolute.startsWith(parsed.root)) fail();
  const names = absolute.slice(parsed.root.length).split(pathSeparator).filter(Boolean);
  const components = [parsed.root];
  let cursor = parsed.root;
  for (const name of names) {
    cursor = pathJoin(cursor, name);
    components.push(cursor);
  }
  return { absolute, components };
}

function snapshotStat(stat) {
  if (stat === null || typeof stat !== 'object') fail();
  const output = Object.create(null);
  for (const field of STAT_FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(stat, field);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail();
    const value = descriptor.value;
    if (typeof value !== 'bigint' || value < 0n) fail();
    output[field] = value;
  }
  return output;
}

function sameStat(left, right) {
  for (const field of STAT_FIELDS) if (left[field] !== right[field]) return false;
  return true;
}

function validatePathSnapshots(snapshots, modes) {
  if (snapshots.length < 1) fail();
  for (let index = 0; index < snapshots.length - 1; index += 1) {
    if ((snapshots[index].mode & modes.mask) !== modes.directory) fail();
  }
  const leaf = snapshots.at(-1);
  if ((leaf.mode & modes.mask) !== modes.regular || leaf.nlink !== 1n ||
      leaf.size > BigInt(FILE_MAX_BYTES)) fail();
}

async function lstatComponents(components, lstatPath, modes) {
  const snapshots = [];
  for (const component of components) {
    const stat = await lstatPath(component, { bigint: true });
    snapshots.push(snapshotStat(stat));
  }
  validatePathSnapshots(snapshots, modes);
  return snapshots;
}

/** Read one explicitly named, stable regular file without following symlinks. */
export async function readOperatorTrustedObservationFile(filePath, dependencies) {
  let handle;
  let failure = false;
  let output;
  try {
    const supplied = dependenciesSnapshot(dependencies);
    const flags = openFlags(supplied.constants);
    const modes = modeConstants(supplied.constants);
    const resolved = resolvedComponents(filePath, supplied.resolve);
    const beforePath = await lstatComponents(resolved.components, supplied.lstat, modes);
    handle = await supplied.open(resolved.absolute, flags);
    if (handle === null || typeof handle !== 'object' || typeof handle.stat !== 'function' ||
        typeof handle.read !== 'function' || typeof handle.close !== 'function') fail();
    const opened = snapshotStat(await handle.stat({ bigint: true }));
    const beforeLeaf = beforePath.at(-1);
    if (!sameStat(opened, beforeLeaf)) fail();
    validatePathSnapshots([opened], modes);

    const buffer = Buffer.alloc(FILE_MAX_BYTES + 1);
    const readResult = await handle.read(buffer, 0, buffer.length, 0);
    if (readResult === null || typeof readResult !== 'object') fail();
    const bytesReadDescriptor = Object.getOwnPropertyDescriptor(readResult, 'bytesRead');
    const bufferDescriptor = Object.getOwnPropertyDescriptor(readResult, 'buffer');
    if (!bytesReadDescriptor || !Object.hasOwn(bytesReadDescriptor, 'value') ||
        !bufferDescriptor || !Object.hasOwn(bufferDescriptor, 'value') ||
        bufferDescriptor.value !== buffer || !Number.isInteger(bytesReadDescriptor.value) ||
        bytesReadDescriptor.value < 0 || bytesReadDescriptor.value > buffer.length ||
        BigInt(bytesReadDescriptor.value) !== opened.size) fail();
    const bytesRead = bytesReadDescriptor.value;
    const afterHandle = snapshotStat(await handle.stat({ bigint: true }));
    if (!sameStat(opened, afterHandle)) fail();
    validatePathSnapshots([afterHandle], modes);
    const afterPath = await lstatComponents(resolved.components, supplied.lstat, modes);
    if (beforePath.length !== afterPath.length) fail();
    for (let index = 0; index < beforePath.length; index += 1) {
      if (!sameStat(beforePath[index], afterPath[index])) fail();
    }
    output = Buffer.from(buffer.subarray(0, bytesRead));
  } catch {
    failure = true;
  } finally {
    if (handle !== undefined) {
      try {
        await handle.close();
      } catch {
        failure = true;
      }
    }
  }
  if (failure) fail();
  return output;
}

function writeFixedDescriptor(descriptor, line) {
  const bytes = Buffer.from(line, 'utf8');
  const written = fsWriteSync(descriptor, bytes, 0, bytes.length);
  if (written !== bytes.length) fail();
  return written;
}

async function emitFixed(writer, line) {
  const written = await writer(line);
  if (!Number.isInteger(written) || written !== Buffer.byteLength(line, 'utf8')) fail();
}

export async function runOperatorTrustedObservationCli(options = {}) {
  let stderr = line => writeFixedDescriptor(2, line);
  try {
    const supplied = optionsSnapshot(options);
    const argv = Object.hasOwn(supplied, 'argv') ? supplied.argv : process.argv.slice(2);
    const readFile = Object.hasOwn(supplied, 'readFile')
      ? supplied.readFile
      : readOperatorTrustedObservationFile;
    const stdout = Object.hasOwn(supplied, 'stdout')
      ? supplied.stdout
      : line => writeFixedDescriptor(1, line);
    stderr = Object.hasOwn(supplied, 'stderr') ? supplied.stderr : stderr;
    if (typeof readFile !== 'function' || typeof stdout !== 'function' || typeof stderr !== 'function') {
      fail();
    }
    const filePath = snapshotArgv(argv);
    const input = await readFile(filePath);
    verifyOperatorTrustedObservation(input);
    await emitFixed(stdout, SUCCESS);
    return true;
  } catch {
    try {
      await emitFixed(stderr, FAILURE);
    } catch {
      // The nonzero result remains the only signal when stderr is unavailable.
    }
    return false;
  }
}

async function launch() {
  if (typeof process.argv[1] !== 'string' || pathToFileURL(process.argv[1]).href !== import.meta.url) return;
  const success = await runOperatorTrustedObservationCli();
  if (!success) process.exitCode = 1;
}

void launch().catch(() => {
  process.exitCode = 1;
  try {
    writeFixedDescriptor(2, FAILURE);
  } catch {
    // Exit status remains available if stderr cannot be written.
  }
});
