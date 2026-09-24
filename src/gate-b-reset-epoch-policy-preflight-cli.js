import { Buffer } from 'node:buffer';
import { writeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { TextDecoder, types as utilTypes } from 'node:util';

import { parseGateBResetEpochPolicyPreflight } from './gate-b-reset-epoch-policy-preflight.js';

const MAXIMUM_INPUT_BYTES = 2048;
const SUCCESS =
  'GATE_B_RESET_EPOCH_POLICY_PREFLIGHT_VALID_RUN_NOT_AUTHORIZED\n';
const FAILURE =
  'GATE_B_RESET_EPOCH_POLICY_PREFLIGHT_INVALID_RUN_NOT_AUTHORIZED\n';
const OPTION_FIELDS = Object.freeze(['argv', 'stderr', 'stdin', 'stdout']);

function fail() {
  const error = new Error('gate_b_reset_epoch_policy_preflight_cli_failed');
  error.name = 'GateBResetEpochPolicyPreflightCliError';
  error.stack = undefined;
  throw error;
}

function snapshotOptions(options) {
  if (options === null || typeof options !== 'object' ||
      utilTypes.isProxy(options) || Array.isArray(options) ||
      Object.getPrototypeOf(options) !== Object.prototype) fail();
  const output = Object.create(null);
  const keys = Reflect.ownKeys(options);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (typeof key !== 'string' || !OPTION_FIELDS.includes(key) || !descriptor ||
        !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) fail();
    output[key] = descriptor.value;
  }
  return output;
}

function validateNoArguments(argv) {
  if (utilTypes.isProxy(argv) || !Array.isArray(argv) ||
      Object.getPrototypeOf(argv) !== Array.prototype || argv.length !== 0) fail();
  const keys = Reflect.ownKeys(argv);
  if (keys.length !== 1 || keys[0] !== 'length') fail();
}

async function readBoundedRawInput(stdin) {
  if (stdin === null || (typeof stdin !== 'object' && typeof stdin !== 'function') ||
      utilTypes.isProxy(stdin)) fail();
  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of stdin) {
      if (!Buffer.isBuffer(chunk)) fail();
      total += chunk.length;
      if (!Number.isSafeInteger(total) || total > MAXIMUM_INPUT_BYTES) fail();
      chunks.push(Buffer.from(chunk));
    }
  } catch {
    fail();
  }
  return Buffer.concat(chunks, total);
}

function decodeRawUtf8(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xef &&
      bytes[1] === 0xbb && bytes[2] === 0xbf) fail();
  try {
    const input = new TextDecoder('utf-8', {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
    if (input.codePointAt(0) === 0xfeff) fail();
    return input;
  } catch {
    fail();
  }
}

function writeFixedDescriptor(descriptor, line) {
  const bytes = Buffer.from(line, 'utf8');
  const written = writeSync(descriptor, bytes, 0, bytes.length);
  if (written !== bytes.length) fail();
  return written;
}

async function emitFixed(writer, line) {
  const written = await writer(line);
  if (!Number.isInteger(written) || written !== Buffer.byteLength(line, 'utf8')) fail();
}

export async function runGateBResetEpochPolicyPreflightCli(options = {}) {
  let stderr = line => writeFixedDescriptor(2, line);
  try {
    const supplied = snapshotOptions(options);
    const argv = Object.hasOwn(supplied, 'argv')
      ? supplied.argv
      : process.argv.slice(2);
    const stdin = Object.hasOwn(supplied, 'stdin') ? supplied.stdin : process.stdin;
    const stdout = Object.hasOwn(supplied, 'stdout')
      ? supplied.stdout
      : line => writeFixedDescriptor(1, line);
    stderr = Object.hasOwn(supplied, 'stderr') ? supplied.stderr : stderr;
    if (typeof stdout !== 'function' || typeof stderr !== 'function') fail();
    validateNoArguments(argv);
    const bytes = await readBoundedRawInput(stdin);
    const input = decodeRawUtf8(bytes);
    parseGateBResetEpochPolicyPreflight(input);
    await emitFixed(stdout, SUCCESS);
    return true;
  } catch {
    try {
      await emitFixed(stderr, FAILURE);
    } catch {
      // A nonzero result remains the only available fail-closed signal.
    }
    return false;
  }
}

async function launch() {
  if (typeof process.argv[1] !== 'string' ||
      pathToFileURL(process.argv[1]).href !== import.meta.url) return;
  if (!await runGateBResetEpochPolicyPreflightCli()) process.exitCode = 1;
}

void launch().catch(() => {
  process.exitCode = 1;
  try {
    writeFixedDescriptor(2, FAILURE);
  } catch {
    // Exit status remains available if stderr cannot be written.
  }
});
