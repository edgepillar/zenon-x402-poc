import { pathToFileURL } from 'node:url';
import { types as utilTypes } from 'node:util';

import {
  executeLiveEvidenceRun,
  preflightLiveEvidenceRun,
} from './live-evidence-runner.js';

const FAILURE = 'LIVE_EVIDENCE_RUN_FAILED\n';
const PREFLIGHT_SUCCESS = 'LIVE_EVIDENCE_RUN_PREFLIGHT_VALID\n';
const COMPLETE_SUCCESS = 'LIVE_EVIDENCE_RUN_COMPLETE\n';
const RESOLVED_SUCCESS = 'LIVE_EVIDENCE_RUN_RESOLVED_NONPUBLISHABLE\n';
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const FLAGS = Object.freeze({
  '--config': 'configPath',
  '--buyer-rpc': 'buyerRpcPath',
  '--buyer-wallet': 'buyerWalletPath',
  '--facilitator-rpc': 'facilitatorRpcPath',
  '--workspace': 'workspaceRoot',
  '--run-name': 'runName',
});

function fail() {
  throw new Error('live_evidence_run_cli_failed');
}

function snapshotArray(value) {
  if (IS_PROXY(value) || !ARRAY_IS_ARRAY(value) || GET_PROTOTYPE_OF(value) !== Array.prototype) fail();
  let keys;
  let length;
  try {
    keys = REFLECT_OWN_KEYS(value);
    length = value.length;
  } catch {
    fail();
  }
  if (!Number.isSafeInteger(length) || length < 1 || length > 32 || keys.length !== length + 1) fail();
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
  if (!options || typeof options !== 'object' || IS_PROXY(options) || ARRAY_IS_ARRAY(options) ||
      GET_PROTOTYPE_OF(options) !== OBJECT_PROTOTYPE) fail();
  const allowed = new Set([
    'argv', 'stdout', 'stderr', 'preflight', 'execute', 'executeInjections',
  ]);
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
  if (command !== 'preflight' && command !== 'run') fail();
  if (values.length !== 13) fail();
  const parsed = {};
  for (let index = 1; index < values.length; index += 2) {
    const flag = values[index];
    const field = FLAGS[flag];
    if (!field || HAS_OWN(parsed, field)) fail();
    Object.defineProperty(parsed, field, {
      value: values[index + 1],
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  if (Object.keys(parsed).length !== 6) fail();
  return { command, options: parsed };
}

function exactPreflightSuccess(value) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
      GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const keys = REFLECT_OWN_KEYS(value);
  const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, 'valid');
  if (keys.length !== 1 || keys[0] !== 'valid' || !descriptor ||
      !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true ||
      descriptor.value !== true) fail();
  return true;
}

export async function runLiveEvidenceRunnerCli(options = {}) {
  let stderr = line => process.stderr.write(line);
  try {
    const supplied = snapshotOptions(options);
    const argv = HAS_OWN(supplied, 'argv') ? supplied.argv : process.argv.slice(2);
    const stdout = HAS_OWN(supplied, 'stdout') ? supplied.stdout : line => process.stdout.write(line);
    stderr = HAS_OWN(supplied, 'stderr') ? supplied.stderr : stderr;
    const preflight = HAS_OWN(supplied, 'preflight') ? supplied.preflight : preflightLiveEvidenceRun;
    const execute = HAS_OWN(supplied, 'execute') ? supplied.execute : executeLiveEvidenceRun;
    if (typeof stdout !== 'function' || typeof stderr !== 'function' ||
        typeof preflight !== 'function' || typeof execute !== 'function') fail();
    const parsed = parseArguments(argv);
    if (parsed.command === 'preflight') {
      if (HAS_OWN(supplied, 'executeInjections')) fail();
      exactPreflightSuccess(await preflight(parsed.options));
      await stdout(PREFLIGHT_SUCCESS);
    } else {
      const result = await execute(
        parsed.options,
        HAS_OWN(supplied, 'executeInjections') ? supplied.executeInjections : undefined,
      );
      if (result?.status === 'complete' && result?.evidenceEligible === true) {
        await stdout(COMPLETE_SUCCESS);
      } else if (result?.status === 'resolved' && result?.evidenceEligible === false) {
        await stdout(RESOLVED_SUCCESS);
      } else {
        fail();
      }
    }
    return true;
  } catch {
    try { await stderr(FAILURE); } catch {}
    return false;
  }
}

async function launch() {
  if (typeof process.argv[1] !== 'string' || pathToFileURL(process.argv[1]).href !== import.meta.url) return;
  if (!await runLiveEvidenceRunnerCli()) process.exitCode = 1;
}

void launch().catch(() => {
  process.exitCode = 1;
  try { process.stderr.write(FAILURE); } catch {}
});
