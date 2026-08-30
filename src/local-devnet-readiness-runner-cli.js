import { Buffer } from 'node:buffer';
import { writeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { types as utilTypes } from 'node:util';

import {
  runOperatorTrustedLocalDevnetReadiness,
} from './local-devnet-readiness-runner.js';

const SUCCESS_LINE = 'LOCAL_DEVNET_READINESS_READY\n';
const FAILURE_LINE = 'LOCAL_DEVNET_READINESS_FAILED\n';
const FLAGS = Object.freeze([
  '--acknowledgement',
  '--artifact-file',
  '--rpc-url',
  '--timeout-ms',
]);
const EXPECTED_ARGV_KEYS = Object.freeze([
  '0', '1', '2', '3', '4', '5', '6', '7', 'length',
]);
const APPLY = Reflect.apply;
const ARRAY_INCLUDES = Array.prototype.includes;
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_PROTOTYPE = Array.prototype;
const BUFFER_BYTE_LENGTH = Buffer.byteLength;
const CREATE = Object.create;
const DEFINE_PROPERTY = Object.defineProperty;
const ERROR = Error;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const NUMBER = Number;
const NUMBER_CONSTRUCTOR = Number;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const PROMISE_THEN = Promise.prototype.then;
const REFLECT_CONSTRUCT = Reflect.construct;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const STRING = String;
const PROCESS = process;
const PROCESS_ARGV = process.argv;
const URL_HREF_GET = Object.getOwnPropertyDescriptor(URL.prototype, 'href').get;
const WRITE_SYNC = writeSync;

function fail() {
  throw APPLY(REFLECT_CONSTRUCT, undefined, [ERROR, ['local_devnet_readiness_cli_failed']]);
}

function isProxy(value) {
  return APPLY(IS_PROXY, undefined, [value]);
}

function dataDescriptor(value, key) {
  let result;
  try {
    result = APPLY(GET_OWN_PROPERTY_DESCRIPTOR, undefined, [value, key]);
  } catch {
    fail();
  }
  if (!result || !APPLY(HAS_OWN, undefined, [result, 'value'])) fail();
  return result;
}

function ownValue(value, key) {
  return dataDescriptor(value, key).value;
}

function fixedIncludes(values, candidate) {
  return APPLY(ARRAY_INCLUDES, values, [candidate]);
}

function exactArrayShape(value, expectedKeys, expectedLength) {
  if (value === null || typeof value !== 'object' || isProxy(value) ||
      !APPLY(ARRAY_IS_ARRAY, undefined, [value])) fail();
  let prototype;
  let keys;
  try {
    prototype = APPLY(GET_PROTOTYPE_OF, undefined, [value]);
    keys = APPLY(REFLECT_OWN_KEYS, undefined, [value]);
  } catch {
    fail();
  }
  if (prototype !== ARRAY_PROTOTYPE || keys.length !== expectedKeys.length) fail();
  const lengthDescriptor = dataDescriptor(value, 'length');
  if (lengthDescriptor.value !== expectedLength || lengthDescriptor.enumerable !== false ||
      lengthDescriptor.configurable !== false || lengthDescriptor.writable !== true) fail();
  for (let index = 0; index < expectedLength; index += 1) {
    const item = dataDescriptor(value, APPLY(STRING, undefined, [index]));
    if (item.enumerable !== true || item.configurable !== true || item.writable !== true) fail();
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== 'string' || !fixedIncludes(expectedKeys, keys[index])) fail();
  }
  return value;
}

function parseArgv(argv) {
  exactArrayShape(argv, EXPECTED_ARGV_KEYS, 8);
  const values = APPLY(CREATE, undefined, [null]);
  for (let index = 0; index < 8; index += 2) {
    const flag = ownValue(argv, APPLY(STRING, undefined, [index]));
    const value = ownValue(argv, APPLY(STRING, undefined, [index + 1]));
    if (typeof flag !== 'string' || typeof value !== 'string' || !fixedIncludes(FLAGS, flag) ||
        APPLY(HAS_OWN, undefined, [values, flag])) fail();
    APPLY(DEFINE_PROPERTY, undefined, [values, flag, {
      configurable: false,
      enumerable: true,
      value,
      writable: false,
    }]);
  }
  for (let index = 0; index < FLAGS.length; index += 1) {
    if (!APPLY(HAS_OWN, undefined, [values, FLAGS[index]])) fail();
  }
  const timeoutMs = APPLY(NUMBER, undefined, [values['--timeout-ms']]);
  if (!APPLY(NUMBER_IS_SAFE_INTEGER, NUMBER_CONSTRUCTOR, [timeoutMs]) ||
      APPLY(STRING, undefined, [timeoutMs]) !== values['--timeout-ms']) fail();
  const options = APPLY(CREATE, undefined, [null]);
  const optionEntries = [
    ['acknowledgement', values['--acknowledgement']],
    ['artifactFileName', values['--artifact-file']],
    ['rpcUrl', values['--rpc-url']],
    ['timeoutMs', timeoutMs],
  ];
  for (let index = 0; index < optionEntries.length; index += 1) {
    const key = optionEntries[index][0];
    const value = optionEntries[index][1];
    APPLY(DEFINE_PROPERTY, undefined, [options, key, {
      configurable: false,
      enumerable: true,
      value,
      writable: false,
    }]);
  }
  return options;
}

function writeFixed(fd, line) {
  try {
    const expected = APPLY(BUFFER_BYTE_LENGTH, Buffer, [line, 'utf8']);
    const written = APPLY(WRITE_SYNC, undefined, [fd, line]);
    return written === expected;
  } catch {
    return false;
  }
}

async function main(argv) {
  let succeeded = false;
  try {
    const options = parseArgv(argv);
    const result = await runOperatorTrustedLocalDevnetReadiness(options);
    succeeded = result === true;
  } catch {}
  if (succeeded && writeFixed(1, SUCCESS_LINE)) return true;
  writeFixed(2, FAILURE_LINE);
  return false;
}

function entryPointState() {
  if (PROCESS_ARGV === null || typeof PROCESS_ARGV !== 'object' || isProxy(PROCESS_ARGV)) return -1;
  if (!APPLY(ARRAY_IS_ARRAY, undefined, [PROCESS_ARGV]) ||
      APPLY(GET_PROTOTYPE_OF, undefined, [PROCESS_ARGV]) !== ARRAY_PROTOTYPE) return -1;
  let script;
  try {
    script = ownValue(PROCESS_ARGV, '1');
  } catch {
    return -1;
  }
  if (typeof script !== 'string') return 0;
  try {
    const converted = pathToFileURL(script);
    return APPLY(URL_HREF_GET, converted, []) === import.meta.url ? 1 : 0;
  } catch {
    return -1;
  }
}

function snapshotProcessArguments() {
  if (isProxy(PROCESS_ARGV) || !APPLY(ARRAY_IS_ARRAY, undefined, [PROCESS_ARGV]) ||
      APPLY(GET_PROTOTYPE_OF, undefined, [PROCESS_ARGV]) !== ARRAY_PROTOTYPE) fail();
  const length = ownValue(PROCESS_ARGV, 'length');
  if (!APPLY(NUMBER_IS_SAFE_INTEGER, NUMBER_CONSTRUCTOR, [length]) || length < 2 || length > 34) fail();
  const expectedKeys = [];
  for (let index = 0; index < length; index += 1) {
    APPLY(DEFINE_PROPERTY, undefined, [expectedKeys, expectedKeys.length, {
      configurable: true,
      enumerable: true,
      value: APPLY(STRING, undefined, [index]),
      writable: true,
    }]);
  }
  APPLY(DEFINE_PROPERTY, undefined, [expectedKeys, expectedKeys.length, {
    configurable: true,
    enumerable: true,
    value: 'length',
    writable: true,
  }]);
  exactArrayShape(PROCESS_ARGV, expectedKeys, length);
  const argv = [];
  for (let index = 2; index < length; index += 1) {
    APPLY(DEFINE_PROPERTY, undefined, [argv, argv.length, {
      configurable: true,
      enumerable: true,
      value: ownValue(PROCESS_ARGV, APPLY(STRING, undefined, [index])),
      writable: true,
    }]);
  }
  return argv;
}

const entryState = entryPointState();
if (entryState === -1) {
  writeFixed(2, FAILURE_LINE);
  PROCESS.exitCode = 1;
} else if (entryState === 1) {
  let argv;
  try {
    argv = snapshotProcessArguments();
  } catch {
    writeFixed(2, FAILURE_LINE);
    PROCESS.exitCode = 1;
  }
  if (argv !== undefined) {
    const completion = main(argv);
    void APPLY(PROMISE_THEN, completion, [success => {
      if (success !== true) PROCESS.exitCode = 1;
    }, () => {
      PROCESS.exitCode = 1;
    }]);
  }
}
