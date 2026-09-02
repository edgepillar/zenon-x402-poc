import { writeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { types as utilTypes } from 'node:util';

import { GATE_B_TESTNET_FAUCET_RECEIVE_STATUS_LINES } from
  './gate-b-testnet-faucet-receive-schema.js';
import { superviseGateBTestnetFaucetReceive } from
  './gate-b-testnet-faucet-receive-supervisor.js';

const ERROR_CODE = 'gate_b_testnet_faucet_receive_cli_failed';
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

function fail() {
  const error = new Error(ERROR_CODE);
  error.code = ERROR_CODE;
  error.stack = undefined;
  throw error;
}

function exactOptions(value) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) ||
      ARRAY_IS_ARRAY(value) || GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const output = Object.create(null);
  const allowed = ['argv', 'stderr', 'stdout', 'supervise', 'supervisorInjections'];
  const keys = REFLECT_OWN_KEYS(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = typeof key === 'string'
      ? GET_OWN_PROPERTY_DESCRIPTOR(value, key)
      : undefined;
    if (!allowed.includes(key) || !descriptor || !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true) fail();
    output[key] = descriptor.value;
  }
  return output;
}

function exactEmptyArgv(value) {
  if (!ARRAY_IS_ARRAY(value) || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== Array.prototype || value.length !== 0 ||
      REFLECT_OWN_KEYS(value).length !== 1) fail();
}

function writeFixed(writer, line) {
  const result = REFLECT_APPLY(writer, undefined, [line]);
  if (result !== Buffer.byteLength(line, 'utf8')) fail();
}

export async function runGateBTestnetFaucetReceiveCli(options = {}) {
  let failureWriter = line => writeSync(2, line);
  let failureAttempted = false;
  try {
    const supplied = exactOptions(options);
    const argv = HAS_OWN(supplied, 'argv') ? supplied.argv : process.argv.slice(2);
    const stdout = HAS_OWN(supplied, 'stdout')
      ? supplied.stdout
      : line => writeSync(1, line);
    const stderr = HAS_OWN(supplied, 'stderr')
      ? supplied.stderr
      : failureWriter;
    failureWriter = stderr;
    const supervise = HAS_OWN(supplied, 'supervise')
      ? supplied.supervise
      : superviseGateBTestnetFaucetReceive;
    exactEmptyArgv(argv);
    if (typeof stdout !== 'function' || typeof stderr !== 'function' ||
        typeof supervise !== 'function') fail();
    const status = await REFLECT_APPLY(supervise, undefined, [
      HAS_OWN(supplied, 'supervisorInjections')
        ? supplied.supervisorInjections
        : undefined,
    ]);
    if (status === 'complete') {
      writeFixed(stdout, GATE_B_TESTNET_FAUCET_RECEIVE_STATUS_LINES.COMPLETE);
      return 0;
    }
    if (status === 'recovered') {
      writeFixed(stdout, GATE_B_TESTNET_FAUCET_RECEIVE_STATUS_LINES.RECOVERED);
      return 0;
    }
    if (status === 'outcome-unknown') {
      writeFixed(stderr, GATE_B_TESTNET_FAUCET_RECEIVE_STATUS_LINES.OUTCOME_UNKNOWN);
      return 2;
    }
    fail();
  } catch {
    if (!failureAttempted) {
      failureAttempted = true;
      try {
        writeFixed(failureWriter, GATE_B_TESTNET_FAUCET_RECEIVE_STATUS_LINES.FAILURE);
      } catch {}
    }
    return 1;
  }
}

async function launch() {
  if (typeof process.argv[1] !== 'string' ||
      pathToFileURL(process.argv[1]).href !== import.meta.url) return;
  process.exitCode = await runGateBTestnetFaucetReceiveCli();
}

void launch().catch(() => {
  process.exitCode = 1;
});
