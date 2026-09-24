import { isAbsolute, resolve } from 'node:path';
import { types as utilTypes } from 'node:util';

import { canonicalJson } from './canonical.js';
import {
  selectPublicTestnetDynamicPlasmaResetEpochExecutionPolicy,
} from './zenon/operator-trusted-testnet-profile.js';

const ERROR_CODE = 'gate_b_reset_epoch_artifact_v3_invalid';
const MAXIMUM_ARTIFACT_BYTES = 16 * 1024;
const LOWERCASE_DIGEST = /^[0-9a-f]{64}$/;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

const POLICY_SELECTION_FIELDS = Object.freeze([
  'eventId',
  'liveAcknowledgement',
  'operatorTrustAcknowledgement',
  'profileName',
  'rpcEndpoint',
  'wssAcknowledgement',
]);

export const GATE_B_RESET_EPOCH_ARTIFACT_FAMILY_V3 =
  'gate-b-reset-epoch-pre-wallet-offline-v3';

export const GATE_B_RESET_EPOCH_ARTIFACT_LEAVES_V3 = Object.freeze({
  authorization: 'gate-b-reset-epoch-authorization-v3.json',
  bootstrap: 'gate-b-reset-epoch-bootstrap-v3.json',
  configuration: 'gate-b-reset-epoch-configuration-v3.json',
  review: 'gate-b-reset-epoch-review-v3.json',
});

export const GATE_B_RESET_EPOCH_STATUS_V3 = Object.freeze({
  PREFLIGHT_VALID: 'PREFLIGHT_VALID_RUN_NOT_AUTHORIZED',
  REVIEW_VALID: 'REVIEW_VALID_RUN_NOT_AUTHORIZED',
  RUN_NOT_AUTHORIZED: 'RUN_NOT_AUTHORIZED',
});

export class GateBResetEpochArtifactV3Error extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBResetEpochArtifactV3Error';
    this.code = ERROR_CODE;
    this.stack = undefined;
  }
}

function fail() {
  throw new GateBResetEpochArtifactV3Error();
}

function exactPlainObject(value, fields) {
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

function exactPolicySelection(value) {
  const snapshot = exactPlainObject(value, POLICY_SELECTION_FIELDS);
  for (let index = 0; index < POLICY_SELECTION_FIELDS.length; index += 1) {
    if (typeof snapshot[POLICY_SELECTION_FIELDS[index]] !== 'string') fail();
  }
  const candidate = {
    eventId: snapshot.eventId,
    liveAcknowledgement: snapshot.liveAcknowledgement,
    operatorTrustAcknowledgement: snapshot.operatorTrustAcknowledgement,
    profileName: snapshot.profileName,
    rpcEndpoint: snapshot.rpcEndpoint,
    wssAcknowledgement: snapshot.wssAcknowledgement,
  };
  try {
    selectPublicTestnetDynamicPlasmaResetEpochExecutionPolicy(candidate);
  } catch {
    fail();
  }
  return Object.freeze(candidate);
}

function samePolicySelection(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function artifactPolicySelection(value) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) ||
      ARRAY_IS_ARRAY(value) || GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, 'policySelection');
  if (!descriptor || !HAS_OWN(descriptor, 'value') ||
      descriptor.enumerable !== true) fail();
  return descriptor.value;
}

function exactBinding(value) {
  const snapshot = exactPlainObject(value, [
    'policySelection', 'preflightVersion', 'schemaVersion', 'status', 'workspaceRoot',
  ]);
  if (snapshot.preflightVersion !== 1 || snapshot.schemaVersion !== 3 ||
      snapshot.status !== GATE_B_RESET_EPOCH_STATUS_V3.RUN_NOT_AUTHORIZED ||
      typeof snapshot.workspaceRoot !== 'string' || snapshot.workspaceRoot.length < 1 ||
      snapshot.workspaceRoot.length > 4096 ||
      /[\u0000-\u001f\u007f]/u.test(snapshot.workspaceRoot) ||
      !isAbsolute(snapshot.workspaceRoot) ||
      resolve(snapshot.workspaceRoot) !== snapshot.workspaceRoot) fail();
  return Object.freeze({
    policySelection: exactPolicySelection(snapshot.policySelection),
    preflightVersion: 1,
    schemaVersion: 3,
    status: GATE_B_RESET_EPOCH_STATUS_V3.RUN_NOT_AUTHORIZED,
    workspaceRoot: snapshot.workspaceRoot,
  });
}

function freezeBootstrap(value) {
  const snapshot = exactPlainObject(value, [
    'artifactFamily', 'bootstrapVersion', 'policySelection', 'schemaVersion', 'status',
  ]);
  if (snapshot.artifactFamily !== GATE_B_RESET_EPOCH_ARTIFACT_FAMILY_V3 ||
      snapshot.bootstrapVersion !== 3 || snapshot.schemaVersion !== 3 ||
      snapshot.status !== GATE_B_RESET_EPOCH_STATUS_V3.RUN_NOT_AUTHORIZED) fail();
  return Object.freeze({
    artifactFamily: GATE_B_RESET_EPOCH_ARTIFACT_FAMILY_V3,
    bootstrapVersion: 3,
    policySelection: exactPolicySelection(snapshot.policySelection),
    schemaVersion: 3,
    status: GATE_B_RESET_EPOCH_STATUS_V3.RUN_NOT_AUTHORIZED,
  });
}

function freezeConfiguration(value) {
  const snapshot = exactPlainObject(value, [
    'artifactFamily', 'configurationVersion', 'offlineOnly', 'policySelection',
    'runAuthorized', 'status',
  ]);
  if (snapshot.artifactFamily !== GATE_B_RESET_EPOCH_ARTIFACT_FAMILY_V3 ||
      snapshot.configurationVersion !== 3 || snapshot.offlineOnly !== true ||
      snapshot.runAuthorized !== false ||
      snapshot.status !== GATE_B_RESET_EPOCH_STATUS_V3.RUN_NOT_AUTHORIZED) fail();
  return Object.freeze({
    artifactFamily: GATE_B_RESET_EPOCH_ARTIFACT_FAMILY_V3,
    configurationVersion: 3,
    offlineOnly: true,
    policySelection: exactPolicySelection(snapshot.policySelection),
    runAuthorized: false,
    status: GATE_B_RESET_EPOCH_STATUS_V3.RUN_NOT_AUTHORIZED,
  });
}

function freezeReview(value) {
  const snapshot = exactPlainObject(value, [
    'artifactFamily', 'configurationDigest', 'policySelection', 'reviewVersion', 'status',
  ]);
  if (snapshot.artifactFamily !== GATE_B_RESET_EPOCH_ARTIFACT_FAMILY_V3 ||
      snapshot.reviewVersion !== 3 ||
      snapshot.status !== GATE_B_RESET_EPOCH_STATUS_V3.REVIEW_VALID ||
      typeof snapshot.configurationDigest !== 'string' ||
      !LOWERCASE_DIGEST.test(snapshot.configurationDigest)) fail();
  return Object.freeze({
    artifactFamily: GATE_B_RESET_EPOCH_ARTIFACT_FAMILY_V3,
    configurationDigest: snapshot.configurationDigest,
    policySelection: exactPolicySelection(snapshot.policySelection),
    reviewVersion: 3,
    status: GATE_B_RESET_EPOCH_STATUS_V3.REVIEW_VALID,
  });
}

function freezeAuthorization(value) {
  const snapshot = exactPlainObject(value, [
    'artifactFamily', 'authorizationVersion', 'configurationDigest', 'offlineOnly',
    'policySelection', 'reviewVersion', 'runAuthorized', 'status',
  ]);
  if (snapshot.artifactFamily !== GATE_B_RESET_EPOCH_ARTIFACT_FAMILY_V3 ||
      snapshot.authorizationVersion !== 3 || snapshot.reviewVersion !== 3 ||
      snapshot.offlineOnly !== true || snapshot.runAuthorized !== false ||
      snapshot.status !== GATE_B_RESET_EPOCH_STATUS_V3.RUN_NOT_AUTHORIZED ||
      typeof snapshot.configurationDigest !== 'string' ||
      !LOWERCASE_DIGEST.test(snapshot.configurationDigest)) fail();
  return Object.freeze({
    artifactFamily: GATE_B_RESET_EPOCH_ARTIFACT_FAMILY_V3,
    authorizationVersion: 3,
    configurationDigest: snapshot.configurationDigest,
    offlineOnly: true,
    policySelection: exactPolicySelection(snapshot.policySelection),
    reviewVersion: 3,
    runAuthorized: false,
    status: GATE_B_RESET_EPOCH_STATUS_V3.RUN_NOT_AUTHORIZED,
  });
}

function parseArtifact(bytes, validator) {
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length < 3 ||
        bytes.length > MAXIMUM_ARTIFACT_BYTES || bytes[bytes.length - 1] !== 0x0a) fail();
    const body = bytes.subarray(0, bytes.length - 1);
    if (body.includes(0x0a) || body.includes(0x0d)) fail();
    const text = UTF8_DECODER.decode(body);
    if (Buffer.byteLength(text, 'utf8') !== body.length) fail();
    const validated = validator(JSON.parse(text));
    if (canonicalJson(validated) !== text) fail();
    return validated;
  } catch {
    fail();
  }
}

function exactKnownArtifact(value) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) ||
      ARRAY_IS_ARRAY(value) || GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const candidates = [
    ['authorizationVersion', freezeAuthorization],
    ['bootstrapVersion', freezeBootstrap],
    ['configurationVersion', freezeConfiguration],
    ['reviewVersion', freezeReview],
  ];
  for (let index = 0; index < candidates.length; index += 1) {
    const [field, validator] = candidates[index];
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, field);
    if (descriptor && HAS_OWN(descriptor, 'value') && descriptor.enumerable === true) {
      return validator(value);
    }
  }
  fail();
}

export function serializeGateBResetEpochArtifactV3(value) {
  try {
    const validated = exactKnownArtifact(value);
    const bytes = Buffer.from(`${canonicalJson(validated)}\n`, 'utf8');
    if (bytes.length < 3 || bytes.length > MAXIMUM_ARTIFACT_BYTES) {
      bytes.fill(0);
      fail();
    }
    return bytes;
  } catch {
    fail();
  }
}

export function createGateBResetEpochBootstrapArtifactV3(binding) {
  const snapshot = exactBinding(binding);
  return freezeBootstrap({
    artifactFamily: GATE_B_RESET_EPOCH_ARTIFACT_FAMILY_V3,
    bootstrapVersion: 3,
    policySelection: snapshot.policySelection,
    schemaVersion: 3,
    status: GATE_B_RESET_EPOCH_STATUS_V3.RUN_NOT_AUTHORIZED,
  });
}

export function createGateBResetEpochConfigurationArtifactV3(binding) {
  const snapshot = exactBinding(binding);
  return freezeConfiguration({
    artifactFamily: GATE_B_RESET_EPOCH_ARTIFACT_FAMILY_V3,
    configurationVersion: 3,
    offlineOnly: true,
    policySelection: snapshot.policySelection,
    runAuthorized: false,
    status: GATE_B_RESET_EPOCH_STATUS_V3.RUN_NOT_AUTHORIZED,
  });
}

export function createGateBResetEpochAuthorizationArtifactV3(
  binding,
  configuration,
  review,
) {
  const bound = exactBinding(binding);
  const parsedConfiguration = freezeConfiguration(configuration);
  const parsedReview = freezeReview(review);
  if (!samePolicySelection(bound.policySelection, parsedConfiguration.policySelection) ||
      !samePolicySelection(bound.policySelection, parsedReview.policySelection)) fail();
  return freezeAuthorization({
    artifactFamily: GATE_B_RESET_EPOCH_ARTIFACT_FAMILY_V3,
    authorizationVersion: 3,
    configurationDigest: parsedReview.configurationDigest,
    offlineOnly: true,
    policySelection: bound.policySelection,
    reviewVersion: 3,
    runAuthorized: false,
    status: GATE_B_RESET_EPOCH_STATUS_V3.RUN_NOT_AUTHORIZED,
  });
}

export function parseGateBResetEpochBootstrapArtifactV3(bytes) {
  return parseArtifact(bytes, freezeBootstrap);
}

export function parseGateBResetEpochConfigurationArtifactV3(bytes) {
  return parseArtifact(bytes, freezeConfiguration);
}

export function parseGateBResetEpochReviewArtifactV3(bytes) {
  return parseArtifact(bytes, freezeReview);
}

export function parseGateBResetEpochAuthorizationArtifactV3(bytes) {
  return parseArtifact(bytes, freezeAuthorization);
}

export function assertGateBResetEpochArtifactPolicyBindingV3(...artifacts) {
  try {
    if (artifacts.length < 2) fail();
    const first = artifactPolicySelection(artifacts[0]);
    exactPolicySelection(first);
    for (let index = 1; index < artifacts.length; index += 1) {
      if (!samePolicySelection(first, artifactPolicySelection(artifacts[index]))) fail();
    }
    return true;
  } catch {
    fail();
  }
}

export function rejectGateBResetEpochPhase3RunV3() {
  fail();
}
