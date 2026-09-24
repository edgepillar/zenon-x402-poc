import { writeSync } from 'node:fs';
import { types as utilTypes } from 'node:util';

import { canonicalJson } from './canonical.js';
import { GATE_B_RESET_EPOCH_STATUS_V3 } from './gate-b-reset-epoch-artifacts-v3.js';
import { executeGateBResetEpochOperatorV3 } from './gate-b-reset-epoch-operator-v3.js';

const ERROR_CODE = 'gate_b_reset_epoch_operator_v3_cli_failed';
const ARGUMENT = '--reset-epoch-v3';
const MAXIMUM_INPUT_BYTES = 8192;
const SUCCESS = 'GATE_B_RESET_EPOCH_V3_PREFLIGHT_VALID_RUN_NOT_AUTHORIZED\n';
const FAILURE = 'GATE_B_RESET_EPOCH_V3_PREFLIGHT_INVALID_RUN_NOT_AUTHORIZED\n';
const OPTION_FIELDS = Object.freeze(['argv', 'execute', 'stderr', 'stdin', 'stdout']);
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROMISE = utilTypes.isPromise;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

class GateBResetEpochOperatorV3CliError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBResetEpochOperatorV3CliError';
    this.code = ERROR_CODE;
    this.stack = undefined;
  }
}

function fail() {
  throw new GateBResetEpochOperatorV3CliError();
}

function snapshotOptions(options) {
  if (options === null || typeof options !== 'object' || IS_PROXY(options) ||
      ARRAY_IS_ARRAY(options) || GET_PROTOTYPE_OF(options) !== OBJECT_PROTOTYPE) fail();
  const output = Object.create(null);
  const keys = REFLECT_OWN_KEYS(options);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = typeof key === 'string'
      ? GET_OWN_PROPERTY_DESCRIPTOR(options, key)
      : undefined;
    if (!OPTION_FIELDS.includes(key) || !descriptor || !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true) fail();
    output[key] = descriptor.value;
  }
  return output;
}

function exactArguments(argv) {
  if (!ARRAY_IS_ARRAY(argv) || IS_PROXY(argv) ||
      GET_PROTOTYPE_OF(argv) !== Array.prototype || argv.length !== 1 ||
      REFLECT_OWN_KEYS(argv).length !== 2) fail();
  const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(argv, '0');
  if (!descriptor || !HAS_OWN(descriptor, 'value') ||
      descriptor.enumerable !== true || descriptor.value !== ARGUMENT) fail();
}

function exactNativePromise(value) {
  if (!IS_PROMISE(value) || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== Promise.prototype ||
      GET_OWN_PROPERTY_DESCRIPTOR(value, 'then') !== undefined) fail();
  return value;
}

function exactExecutionResult(value) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) ||
      ARRAY_IS_ARRAY(value) || GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const keys = REFLECT_OWN_KEYS(value);
  if (keys.length !== 2 || !keys.includes('schemaVersion') || !keys.includes('status')) fail();
  const schemaVersion = GET_OWN_PROPERTY_DESCRIPTOR(value, 'schemaVersion');
  const status = GET_OWN_PROPERTY_DESCRIPTOR(value, 'status');
  if (!schemaVersion || !HAS_OWN(schemaVersion, 'value') ||
      schemaVersion.enumerable !== true || schemaVersion.value !== 3 ||
      !status || !HAS_OWN(status, 'value') || status.enumerable !== true ||
      status.value !== GATE_B_RESET_EPOCH_STATUS_V3.PREFLIGHT_VALID) fail();
  return true;
}

async function readBoundedRawInput(stdin) {
  if (stdin === null || (typeof stdin !== 'object' && typeof stdin !== 'function') ||
      IS_PROXY(stdin)) fail();
  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of stdin) {
      if (!Buffer.isBuffer(chunk)) fail();
      total += chunk.length;
      if (!Number.isSafeInteger(total) || total > MAXIMUM_INPUT_BYTES) fail();
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks, total);
  } catch {
    fail();
  } finally {
    for (let index = 0; index < chunks.length; index += 1) chunks[index].fill(0);
  }
}

function parseCanonicalInput(bytes) {
  let text;
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length < 2 ||
        bytes.length > MAXIMUM_INPUT_BYTES || bytes.includes(0x00) ||
        (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb &&
          bytes[2] === 0xbf)) fail();
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (text.codePointAt(0) === 0xfeff || /[\r\n]/u.test(text)) fail();
    const parsed = JSON.parse(text);
    if (canonicalJson(parsed) !== text) fail();
    return parsed;
  } catch {
    fail();
  } finally {
    text = undefined;
  }
}

function writeFixedDescriptor(descriptor, line) {
  const bytes = Buffer.from(line, 'utf8');
  try {
    const written = writeSync(descriptor, bytes, 0, bytes.length);
    if (written !== bytes.length) fail();
    return written;
  } finally {
    bytes.fill(0);
  }
}

async function emitFixed(writer, line) {
  const result = Reflect.apply(writer, undefined, [line]);
  const written = IS_PROMISE(result)
    ? await exactNativePromise(result)
    : result;
  if (!Number.isInteger(written) || written !== Buffer.byteLength(line, 'utf8')) fail();
}

export async function runGateBResetEpochOperatorV3Cli(options = {}) {
  let stderr = line => writeFixedDescriptor(2, line);
  let bytes;
  try {
    const supplied = snapshotOptions(options);
    const argv = HAS_OWN(supplied, 'argv') ? supplied.argv : process.argv.slice(2);
    const execute = HAS_OWN(supplied, 'execute')
      ? supplied.execute
      : executeGateBResetEpochOperatorV3;
    const stdin = HAS_OWN(supplied, 'stdin') ? supplied.stdin : process.stdin;
    const stdout = HAS_OWN(supplied, 'stdout')
      ? supplied.stdout
      : line => writeFixedDescriptor(1, line);
    stderr = HAS_OWN(supplied, 'stderr') ? supplied.stderr : stderr;
    if (typeof execute !== 'function' || IS_PROXY(execute) ||
        typeof stdout !== 'function' || IS_PROXY(stdout) ||
        typeof stderr !== 'function' || IS_PROXY(stderr)) fail();
    exactArguments(argv);
    bytes = await readBoundedRawInput(stdin);
    const entry = parseCanonicalInput(bytes);
    const result = await exactNativePromise(Reflect.apply(execute, undefined, [entry]));
    exactExecutionResult(result);
    await emitFixed(stdout, SUCCESS);
    return true;
  } catch {
    try { await emitFixed(stderr, FAILURE); } catch {}
    return false;
  } finally {
    if (Buffer.isBuffer(bytes)) bytes.fill(0);
  }
}

export const GATE_B_RESET_EPOCH_OPERATOR_V3_ARGUMENT = ARGUMENT;
export const GATE_B_RESET_EPOCH_OPERATOR_V3_STATUS_LINES = Object.freeze({
  FAILURE,
  SUCCESS,
});
