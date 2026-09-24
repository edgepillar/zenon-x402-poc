import {
  selectPublicTestnetDynamicPlasmaResetEpochExecutionPolicy,
} from './zenon/operator-trusted-testnet-profile.js';

const ERROR_CODE = 'gate_b_reset_epoch_policy_preflight_invalid';
const MAXIMUM_CANONICAL_BYTES = 2048;
const RUN_NOT_AUTHORIZED = 'RUN_NOT_AUTHORIZED';
const TOP_LEVEL_FIELDS = Object.freeze(['policySelection', 'preflightVersion']);
const POLICY_SELECTION_FIELDS = Object.freeze([
  'eventId',
  'liveAcknowledgement',
  'operatorTrustAcknowledgement',
  'profileName',
  'rpcEndpoint',
  'wssAcknowledgement',
]);

class GateBResetEpochPolicyPreflightError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBResetEpochPolicyPreflightError';
    this.code = ERROR_CODE;
    this.stack = undefined;
  }
}

function fail() {
  throw new GateBResetEpochPolicyPreflightError();
}

function exactPlainObject(value, fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) fail();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length) fail();
  for (let index = 0; index < fields.length; index += 1) {
    if (!Object.hasOwn(value, fields[index])) fail();
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== 'string' || !fields.includes(keys[index])) fail();
  }
  return value;
}

function canonicalPreflight(policySelection) {
  const selectionMembers = POLICY_SELECTION_FIELDS.map(field =>
    `${JSON.stringify(field)}:${JSON.stringify(policySelection[field])}`);
  return `{"policySelection":{${selectionMembers.join(',')}},"preflightVersion":1}`;
}

function inertDescriptor(policySelection) {
  const selection = Object.freeze({
    eventId: policySelection.eventId,
    liveAcknowledgement: policySelection.liveAcknowledgement,
    operatorTrustAcknowledgement: policySelection.operatorTrustAcknowledgement,
    profileName: policySelection.profileName,
    rpcEndpoint: policySelection.rpcEndpoint,
    wssAcknowledgement: policySelection.wssAcknowledgement,
  });
  return Object.freeze({
    policySelection: selection,
    preflightVersion: 1,
    status: RUN_NOT_AUTHORIZED,
  });
}

export function parseGateBResetEpochPolicyPreflight(input) {
  try {
    if (typeof input !== 'string' || input.length < 1 ||
        input.length > MAXIMUM_CANONICAL_BYTES ||
        Buffer.byteLength(input, 'utf8') > MAXIMUM_CANONICAL_BYTES) fail();
    const value = JSON.parse(input);
    exactPlainObject(value, TOP_LEVEL_FIELDS);
    if (value.preflightVersion !== 1) fail();
    const policySelection = exactPlainObject(
      value.policySelection,
      POLICY_SELECTION_FIELDS,
    );
    for (let index = 0; index < POLICY_SELECTION_FIELDS.length; index += 1) {
      if (typeof policySelection[POLICY_SELECTION_FIELDS[index]] !== 'string') fail();
    }
    if (canonicalPreflight(policySelection) !== input) fail();
    selectPublicTestnetDynamicPlasmaResetEpochExecutionPolicy(policySelection);
    return inertDescriptor(policySelection);
  } catch {
    fail();
  }
}
