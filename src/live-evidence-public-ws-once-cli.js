import { pathToFileURL } from 'node:url';
import { types as utilTypes } from 'node:util';

import { supervisePublicWsOnceChild } from './live-evidence-public-ws-once-supervisor.js';

const FAILURE = 'LIVE_EVIDENCE_PUBLIC_WS_ONCE_FAILED\n';
const PREFLIGHT_SUCCESS = 'LIVE_EVIDENCE_PUBLIC_WS_ONCE_PREFLIGHT_VALID\n';
const PENDING_SUCCESS =
  'LIVE_EVIDENCE_PUBLIC_WS_ONCE_PENDING_INDEPENDENT_VERIFICATION\n';
const INDEPENDENT_SUCCESS = 'INDEPENDENT_VERIFICATION_SUCCESS\n';
const INDEPENDENT_FAILURE = 'INDEPENDENT_VERIFICATION_FAILED\n';
const INDEPENDENT_COMMAND = 'finalize-independent-public-ws-once';
const LEGACY_FLAGS = Object.freeze({
  '--config': 'configPath',
  '--buyer-rpc': 'buyerRpcPath',
  '--buyer-wallet': 'buyerWalletPath',
  '--facilitator-rpc': 'facilitatorRpcPath',
  '--authorization': 'authorizationPath',
  '--workspace': 'workspaceRoot',
  '--run-name': 'runName',
  '--transport-exception': 'transportException',
});
const INDEPENDENT_FLAGS = Object.freeze({
  '--endpoint-config': 'endpointConfigPath',
  '--operator-review': 'operatorReviewPath',
  '--workspace': 'workspaceRoot',
  '--run-name': 'runName',
  '--attempt-id': 'attemptId',
});
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

function fail() {
  throw new Error('live_evidence_public_ws_once_cli_failed');
}

function snapshotArray(value) {
  if (IS_PROXY(value) || !ARRAY_IS_ARRAY(value) ||
      GET_PROTOTYPE_OF(value) !== Array.prototype) fail();
  let keys;
  let length;
  try {
    keys = REFLECT_OWN_KEYS(value);
    length = value.length;
  } catch {
    fail();
  }
  if ((length !== 17 && length !== 11) || keys.length !== length + 1) fail();
  const result = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, String(index));
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true ||
        typeof descriptor.value !== 'string' || descriptor.value.length === 0 ||
        descriptor.value.includes('\0')) fail();
    Object.defineProperty(result, String(index), {
      value: descriptor.value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}

function snapshotOptions(options) {
  if (!options || typeof options !== 'object' || IS_PROXY(options) ||
      ARRAY_IS_ARRAY(options) || GET_PROTOTYPE_OF(options) !== OBJECT_PROTOTYPE) fail();
  const allowed = new Set(['argv', 'stdout', 'stderr', 'supervise', 'supervisorInjections']);
  const output = {};
  const keys = REFLECT_OWN_KEYS(options);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(options, key);
    if (typeof key !== 'string' || !allowed.has(key) || !descriptor ||
        !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
    Object.defineProperty(output, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return output;
}

function parseArguments(argv) {
  const values = snapshotArray(argv);
  const command = values[0];
  const independent = command === INDEPENDENT_COMMAND;
  if (!independent && command !== 'preflight-public-ws-once' &&
      command !== 'run-public-ws-once') fail();
  const flags = independent ? INDEPENDENT_FLAGS : LEGACY_FLAGS;
  const expectedFields = independent ? 5 : 8;
  if (values.length !== expectedFields * 2 + 1) fail();
  const parsed = {};
  for (let index = 1; index < values.length; index += 2) {
    const field = flags[values[index]];
    if (!field || HAS_OWN(parsed, field)) fail();
    Object.defineProperty(parsed, field, {
      value: values[index + 1],
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  if (Object.keys(parsed).length !== expectedFields) fail();
  return { command, options: parsed };
}

function exactSupervisorSuccess(value, command) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
      GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const keys = REFLECT_OWN_KEYS(value);
  const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, 'status');
  const expected = command === 'preflight-public-ws-once'
    ? 'preflight-valid'
    : command === INDEPENDENT_COMMAND
      ? 'independent-verification-complete'
      : 'pending-independent-verification';
  if (keys.length !== 1 || keys[0] !== 'status' || !descriptor ||
      !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true ||
      descriptor.value !== expected) fail();
}

export async function runPublicWsOnceRunnerCli(options = {}) {
  let stderr = line => process.stderr.write(line);
  let failure = FAILURE;
  try {
    const supplied = snapshotOptions(options);
    const argv = HAS_OWN(supplied, 'argv') ? supplied.argv : process.argv.slice(2);
    const stdout = HAS_OWN(supplied, 'stdout') ? supplied.stdout : line => process.stdout.write(line);
    stderr = HAS_OWN(supplied, 'stderr') ? supplied.stderr : stderr;
    if (!IS_PROXY(argv) && ARRAY_IS_ARRAY(argv)) {
      const commandDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(argv, '0');
      if (commandDescriptor && HAS_OWN(commandDescriptor, 'value') &&
          commandDescriptor.value === INDEPENDENT_COMMAND) failure = INDEPENDENT_FAILURE;
    }
    const supervise = HAS_OWN(supplied, 'supervise')
      ? supplied.supervise
      : supervisePublicWsOnceChild;
    if (typeof stdout !== 'function' || typeof stderr !== 'function' ||
        typeof supervise !== 'function') fail();
    const parsed = parseArguments(argv);
    const result = await supervise(
      parsed.command,
      parsed.options,
      HAS_OWN(supplied, 'supervisorInjections') ? supplied.supervisorInjections : undefined,
    );
    exactSupervisorSuccess(result, parsed.command);
    if (parsed.command === 'preflight-public-ws-once') {
      await stdout(PREFLIGHT_SUCCESS);
    } else if (parsed.command === INDEPENDENT_COMMAND) {
      await stdout(INDEPENDENT_SUCCESS);
    } else {
      await stdout(PENDING_SUCCESS);
    }
    return true;
  } catch {
    try { await stderr(failure); } catch {}
    return false;
  }
}

async function launch() {
  if (typeof process.argv[1] !== 'string' ||
      pathToFileURL(process.argv[1]).href !== import.meta.url) return;
  if (!await runPublicWsOnceRunnerCli()) process.exitCode = 1;
}

void launch().catch(() => {
  process.exitCode = 1;
  try { process.stderr.write(FAILURE); } catch {}
});
