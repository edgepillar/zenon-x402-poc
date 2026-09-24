import { isAbsolute, resolve } from 'node:path';
import { types as utilTypes } from 'node:util';

import {
  parseGateBResetEpochPolicyPreflight,
} from './gate-b-reset-epoch-policy-preflight.js';

const ERROR_CODE = 'gate_b_reset_epoch_pre_wallet_entry_v3_invalid';
const BOOTSTRAP_FIELDS = Object.freeze([
  'policyPreflight', 'schemaVersion', 'workspaceRoot',
]);
const ENTRY_FIELDS = Object.freeze(['policyPreflight', 'schemaVersion']);
const PREFLIGHT_FIELDS = Object.freeze([
  'policySelection', 'preflightVersion', 'status',
]);
const POLICY_SELECTION_FIELDS = Object.freeze([
  'eventId',
  'liveAcknowledgement',
  'operatorTrustAcknowledgement',
  'profileName',
  'rpcEndpoint',
  'wssAcknowledgement',
]);
const RUN_NOT_AUTHORIZED = 'RUN_NOT_AUTHORIZED';
const SCHEMA_VERSION = 3;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

class GateBResetEpochPreWalletEntryV3Error extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBResetEpochPreWalletEntryV3Error';
    this.code = ERROR_CODE;
    this.stack = undefined;
  }
}

function fail() {
  throw new GateBResetEpochPreWalletEntryV3Error();
}

function snapshotExactPlainObject(value, fields) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) ||
      ARRAY_IS_ARRAY(value) || GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const keys = REFLECT_OWN_KEYS(value);
  if (keys.length !== fields.length) fail();
  const snapshot = Object.create(null);
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, field);
    if (!descriptor || !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true) fail();
    snapshot[field] = descriptor.value;
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== 'string' || !fields.includes(keys[index])) fail();
  }
  return snapshot;
}

function bindPreflight(value) {
  const preflight = snapshotExactPlainObject(value, PREFLIGHT_FIELDS);
  if (preflight.preflightVersion !== 1 ||
      preflight.status !== RUN_NOT_AUTHORIZED) fail();
  const selection = snapshotExactPlainObject(
    preflight.policySelection,
    POLICY_SELECTION_FIELDS,
  );
  for (let index = 0; index < POLICY_SELECTION_FIELDS.length; index += 1) {
    if (typeof selection[POLICY_SELECTION_FIELDS[index]] !== 'string') fail();
  }
  return Object.freeze({
    policySelection: Object.freeze({
      eventId: selection.eventId,
      liveAcknowledgement: selection.liveAcknowledgement,
      operatorTrustAcknowledgement: selection.operatorTrustAcknowledgement,
      profileName: selection.profileName,
      rpcEndpoint: selection.rpcEndpoint,
      wssAcknowledgement: selection.wssAcknowledgement,
    }),
    preflightVersion: 1,
    schemaVersion: SCHEMA_VERSION,
    status: RUN_NOT_AUTHORIZED,
  });
}

function exactWorkspaceRoot(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 4096 ||
      /[\u0000-\u001f\u007f]/u.test(value) || !isAbsolute(value) ||
      resolve(value) !== value) fail();
  return value;
}

export function bindGateBResetEpochPreWalletEntryV3(entry) {
  try {
    const snapshot = snapshotExactPlainObject(entry, ENTRY_FIELDS);
    if (snapshot.schemaVersion !== SCHEMA_VERSION ||
        typeof snapshot.policyPreflight !== 'string') fail();
    return bindPreflight(
      parseGateBResetEpochPolicyPreflight(snapshot.policyPreflight),
    );
  } catch {
    fail();
  }
}

export function bindGateBResetEpochOperatorBootstrapV3(entry) {
  try {
    const snapshot = snapshotExactPlainObject(entry, BOOTSTRAP_FIELDS);
    if (snapshot.schemaVersion !== SCHEMA_VERSION ||
        typeof snapshot.policyPreflight !== 'string') fail();
    const bound = bindPreflight(
      parseGateBResetEpochPolicyPreflight(snapshot.policyPreflight),
    );
    const workspaceRoot = exactWorkspaceRoot(snapshot.workspaceRoot);
    return Object.freeze({
      policySelection: bound.policySelection,
      preflightVersion: bound.preflightVersion,
      schemaVersion: SCHEMA_VERSION,
      status: RUN_NOT_AUTHORIZED,
      workspaceRoot,
    });
  } catch {
    fail();
  }
}
