import { writeSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { types as utilTypes } from 'node:util';

import { superviseGateBBuyerWalletChild } from './gate-b-buyer-wallet-supervisor.js';

const SUCCESS = 'GATE_B_BUYER_WALLET_CREATED\n';
const FAILURE = 'GATE_B_BUYER_WALLET_CREATION_FAILED\n';
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

function fail() {
  throw new Error('gate_b_buyer_wallet_cli_failed');
}

function snapshotArgv(value) {
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
  if (length !== 3 || keys.length !== 4) fail();
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
  const allowed = ['argv', 'stdout', 'stderr', 'supervise', 'supervisorInjections'];
  const result = {};
  const keys = REFLECT_OWN_KEYS(options);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = typeof key === 'string'
      ? GET_OWN_PROPERTY_DESCRIPTOR(options, key)
      : undefined;
    if (!allowed.includes(key) || !descriptor || !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true) fail();
    Object.defineProperty(result, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}

function parseArguments(argv) {
  const values = snapshotArgv(argv);
  if (values[0] !== 'create' || values[1] !== '--workspace' ||
      !isAbsolute(values[2]) || values[2].length > 4096) fail();
  return values[2];
}

export async function runGateBBuyerWalletCli(options = {}) {
  let stderr = line => writeSync(2, line);
  try {
    const supplied = snapshotOptions(options);
    const argv = HAS_OWN(supplied, 'argv') ? supplied.argv : process.argv.slice(2);
    const stdout = HAS_OWN(supplied, 'stdout')
      ? supplied.stdout
      : line => writeSync(1, line);
    stderr = HAS_OWN(supplied, 'stderr') ? supplied.stderr : stderr;
    const supervise = HAS_OWN(supplied, 'supervise')
      ? supplied.supervise
      : superviseGateBBuyerWalletChild;
    if (typeof stdout !== 'function' || typeof stderr !== 'function' ||
        typeof supervise !== 'function') fail();
    const workspaceRoot = parseArguments(argv);
    const result = await Reflect.apply(supervise, undefined, [
      workspaceRoot,
      HAS_OWN(supplied, 'supervisorInjections')
        ? supplied.supervisorInjections
        : undefined,
    ]);
    if (!result || typeof result !== 'object' || IS_PROXY(result) ||
        ARRAY_IS_ARRAY(result) || GET_PROTOTYPE_OF(result) !== OBJECT_PROTOTYPE ||
        REFLECT_OWN_KEYS(result).length !== 1 || result.status !== 'created') fail();
    await stdout(SUCCESS);
    return true;
  } catch {
    try { await stderr(FAILURE); } catch {}
    return false;
  }
}

async function launch() {
  if (typeof process.argv[1] !== 'string' ||
      pathToFileURL(process.argv[1]).href !== import.meta.url) return;
  if (!await runGateBBuyerWalletCli()) process.exitCode = 1;
}

void launch().catch(() => {
  process.exitCode = 1;
  try { writeSync(2, FAILURE); } catch {}
});
