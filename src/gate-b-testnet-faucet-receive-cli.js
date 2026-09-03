import { writeSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { types as utilTypes } from 'node:util';

import { selectGateBBuyerWalletWorkspace } from './gate-b-buyer-wallet-selector.js';
import {
  GATE_B_TESTNET_FAUCET_RECEIVE_STATUS_LINES,
  GATE_B_TESTNET_FAUCET_RECEIVE_WORKSPACE_OPTION,
} from
  './gate-b-testnet-faucet-receive-schema.js';
import {
  superviseGateBTestnetFaucetReceive,
  superviseGateBTestnetFaucetReceiveForWorkspace,
} from
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
  const allowed = [
    'argv', 'stderr', 'stdout', 'supervise', 'superviseGenerated',
    'supervisorInjections',
  ];
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

function parseArguments(value) {
  if (!ARRAY_IS_ARRAY(value) || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== Array.prototype ||
      (value.length !== 0 && value.length !== 2) ||
      REFLECT_OWN_KEYS(value).length !== value.length + 1) fail();
  if (value.length === 0) return undefined;
  const values = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, String(index));
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true ||
        typeof descriptor.value !== 'string' || descriptor.value.length < 1 ||
        descriptor.value.includes('\0')) fail();
    values.push(descriptor.value);
  }
  if (values[0] !== GATE_B_TESTNET_FAUCET_RECEIVE_WORKSPACE_OPTION ||
      values[1].length > 4096 || !isAbsolute(values[1]) || resolve(values[1]) !== values[1]) {
    fail();
  }
  try {
    if (selectGateBBuyerWalletWorkspace(values[1], dirname(values[1])).generationToken === null) {
      fail();
    }
  } catch {
    fail();
  }
  return values[1];
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
    const superviseGenerated = HAS_OWN(supplied, 'superviseGenerated')
      ? supplied.superviseGenerated
      : superviseGateBTestnetFaucetReceiveForWorkspace;
    const workspaceRoot = parseArguments(argv);
    if (typeof stdout !== 'function' || typeof stderr !== 'function' ||
        typeof supervise !== 'function' || typeof superviseGenerated !== 'function') fail();
    const supervisorInjections = HAS_OWN(supplied, 'supervisorInjections')
      ? supplied.supervisorInjections
      : undefined;
    const status = workspaceRoot === undefined
      ? await REFLECT_APPLY(supervise, undefined, [supervisorInjections])
      : await REFLECT_APPLY(superviseGenerated, undefined, [
          workspaceRoot,
          supervisorInjections,
        ]);
    if (status === 'complete' || status === 'partial-complete') {
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
