import { writeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { types as utilTypes } from 'node:util';

import {
  GATE_B_PUBLIC_WS_INPUT_OPERATIONS,
  GATE_B_PUBLIC_WS_INPUT_STATUS_LINES,
} from './gate-b-public-ws-inputs-schema.js';
import { superviseGateBPublicWsInputs } from './gate-b-public-ws-inputs-supervisor.js';

const ERROR_CODE = 'gate_b_public_ws_inputs_cli_failed';
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

function fail() {
  throw new Error(ERROR_CODE);
}

function exactOptions(value) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
      GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const output = {};
  const allowed = ['argv', 'stdout', 'stderr', 'supervise', 'supervisorInjections'];
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

function exactOperationArgv(value) {
  if (!ARRAY_IS_ARRAY(value) || IS_PROXY(value) || GET_PROTOTYPE_OF(value) !== Array.prototype ||
      value.length !== 1 || REFLECT_OWN_KEYS(value).length !== 2) fail();
  const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, '0');
  if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true ||
      !Object.values(GATE_B_PUBLIC_WS_INPUT_OPERATIONS).includes(descriptor.value)) fail();
  return descriptor.value;
}

function expectedStatus(operation) {
  if (operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PROVISION_ENDPOINT) {
    return 'endpoint-provisioned';
  }
  if (operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PREPARE) return 'prepared';
  if (operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.AUTHORIZE) return 'authorized';
  fail();
}

export async function runGateBPublicWsInputsCli(options = {}) {
  let stderr = line => writeSync(2, line);
  try {
    const supplied = exactOptions(options);
    const argv = HAS_OWN(supplied, 'argv') ? supplied.argv : process.argv.slice(2);
    const stdout = HAS_OWN(supplied, 'stdout')
      ? supplied.stdout
      : line => writeSync(1, line);
    stderr = HAS_OWN(supplied, 'stderr') ? supplied.stderr : stderr;
    const supervise = HAS_OWN(supplied, 'supervise')
      ? supplied.supervise
      : superviseGateBPublicWsInputs;
    if (typeof stdout !== 'function' || typeof stderr !== 'function' ||
        typeof supervise !== 'function') fail();
    const operation = exactOperationArgv(argv);
    const result = await Reflect.apply(supervise, undefined, [
      operation,
      HAS_OWN(supplied, 'supervisorInjections')
        ? supplied.supervisorInjections
        : undefined,
    ]);
    if (!result || typeof result !== 'object' || IS_PROXY(result) ||
        ARRAY_IS_ARRAY(result) || GET_PROTOTYPE_OF(result) !== OBJECT_PROTOTYPE ||
        REFLECT_OWN_KEYS(result).length !== 1 ||
        result.status !== expectedStatus(operation)) fail();
    await stdout(GATE_B_PUBLIC_WS_INPUT_STATUS_LINES[operation]);
    return true;
  } catch {
    try { await stderr(GATE_B_PUBLIC_WS_INPUT_STATUS_LINES.FAILURE); } catch {}
    return false;
  }
}

async function launch() {
  if (typeof process.argv[1] !== 'string' ||
      pathToFileURL(process.argv[1]).href !== import.meta.url) return;
  if (!await runGateBPublicWsInputsCli()) process.exitCode = 1;
}

void launch().catch(() => {
  process.exitCode = 1;
});
