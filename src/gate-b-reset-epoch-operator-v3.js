import { types as utilTypes } from 'node:util';

import {
  GATE_B_RESET_EPOCH_STATUS_V3,
  rejectGateBResetEpochPhase3RunV3,
} from './gate-b-reset-epoch-artifacts-v3.js';
import {
  prepareAndPreflightGateBResetEpochArtifactsV3,
} from './gate-b-reset-epoch-filesystem-preflight-v3.js';
import {
  bindGateBResetEpochPreWalletEntryV3,
  bindGateBResetEpochOperatorBootstrapV3,
} from './gate-b-reset-epoch-pre-wallet-entry-v3.js';

const ERROR_CODE = 'gate_b_reset_epoch_operator_v3_invalid';
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROMISE = utilTypes.isPromise;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

export class GateBResetEpochOperatorV3Error extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBResetEpochOperatorV3Error';
    this.code = ERROR_CODE;
    this.stack = undefined;
  }
}

function fail() {
  throw new GateBResetEpochOperatorV3Error();
}

function captureDependencies(injected) {
  if (injected === undefined) return Object.freeze({
    currentWorkspaceRoot: () => process.cwd(),
    prepareAndPreflight: prepareAndPreflightGateBResetEpochArtifactsV3,
  });
  if (injected === null || typeof injected !== 'object' || IS_PROXY(injected) ||
      ARRAY_IS_ARRAY(injected) || GET_PROTOTYPE_OF(injected) !== OBJECT_PROTOTYPE) fail();
  const keys = REFLECT_OWN_KEYS(injected);
  if (keys.length !== 2 || !keys.includes('currentWorkspaceRoot') ||
      !keys.includes('prepareAndPreflight')) fail();
  const output = Object.create(null);
  for (const field of ['currentWorkspaceRoot', 'prepareAndPreflight']) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(injected, field);
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true ||
        typeof descriptor.value !== 'function' || IS_PROXY(descriptor.value)) fail();
    output[field] = descriptor.value;
  }
  return Object.freeze(output);
}

function exactNativePromise(value) {
  if (!IS_PROMISE(value) || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== Promise.prototype ||
      GET_OWN_PROPERTY_DESCRIPTOR(value, 'then') !== undefined) fail();
  return value;
}

function exactResult(value) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) ||
      ARRAY_IS_ARRAY(value) || GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const keys = REFLECT_OWN_KEYS(value);
  if (keys.length !== 2 || !keys.includes('schemaVersion') || !keys.includes('status')) fail();
  for (const field of ['schemaVersion', 'status']) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, field);
    if (!descriptor || !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true) fail();
  }
  if (value.schemaVersion !== 3 ||
      value.status !== GATE_B_RESET_EPOCH_STATUS_V3.PREFLIGHT_VALID) fail();
  return Object.freeze({
    schemaVersion: 3,
    status: GATE_B_RESET_EPOCH_STATUS_V3.PREFLIGHT_VALID,
  });
}

export async function executeGateBResetEpochOperatorV3(entry, injected = undefined) {
  try {
    // This pure binding is deliberately first. Invalid policy selection cannot
    // reach dependency capture, filesystem work, or any legacy Gate-B lane.
    bindGateBResetEpochPreWalletEntryV3(entry);
    const dependencies = captureDependencies(injected);
    const workspaceRoot = Reflect.apply(dependencies.currentWorkspaceRoot, undefined, []);
    const policyPreflight = GET_OWN_PROPERTY_DESCRIPTOR(entry, 'policyPreflight')?.value;
    const binding = bindGateBResetEpochOperatorBootstrapV3({
      policyPreflight,
      schemaVersion: 3,
      workspaceRoot,
    });
    const pending = Reflect.apply(dependencies.prepareAndPreflight, undefined, [binding]);
    return exactResult(await exactNativePromise(pending));
  } catch {
    fail();
  }
}

export function rejectGateBResetEpochOperatorPhase3V3() {
  try {
    rejectGateBResetEpochPhase3RunV3();
  } catch {
    fail();
  }
}
