import { createHash } from 'node:crypto';
import { types as utilTypes } from 'node:util';

import {
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
  TESTNET_LIVE_ACKNOWLEDGEMENT,
} from './zenon/operator-trusted-testnet-profile.js';

const ERROR_CODE = 'gate_b_reset_epoch_independent_review_v3_invalid';
const ARTIFACT_FAMILY = 'gate-b-reset-epoch-pre-wallet-offline-v3';
const REVIEW_STATUS = 'REVIEW_VALID_RUN_NOT_AUTHORIZED';
const RUN_STATUS = 'RUN_NOT_AUTHORIZED';
const DIGEST_DOMAIN = 'zenon-x402-gate-b-reset-epoch-pre-wallet-config-v3';
const MAXIMUM_CONFIGURATION_BYTES = 16 * 1024;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

const POLICY_FIELDS = Object.freeze([
  'eventId',
  'liveAcknowledgement',
  'operatorTrustAcknowledgement',
  'profileName',
  'rpcEndpoint',
  'wssAcknowledgement',
]);

export class GateBResetEpochIndependentReviewV3Error extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBResetEpochIndependentReviewV3Error';
    this.code = ERROR_CODE;
    this.stack = undefined;
  }
}

function fail() {
  throw new GateBResetEpochIndependentReviewV3Error();
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

function independentCanonicalJson(value, state = { depth: 0, nodes: 0 }) {
  state.nodes += 1;
  if (state.nodes > 128 || state.depth > 8) fail();
  if (value === null || typeof value !== 'object') {
    const scalar = JSON.stringify(value);
    if (scalar === undefined) fail();
    return scalar;
  }
  if (ARRAY_IS_ARRAY(value) || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const keys = REFLECT_OWN_KEYS(value);
  const strings = [];
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = typeof key === 'string'
      ? GET_OWN_PROPERTY_DESCRIPTOR(value, key)
      : undefined;
    if (!descriptor || !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true) fail();
    strings.push(key);
  }
  strings.sort();
  const priorDepth = state.depth;
  state.depth += 1;
  const result = `{${strings.map(key => `${JSON.stringify(key)}:${
    independentCanonicalJson(GET_OWN_PROPERTY_DESCRIPTOR(value, key).value, state)
  }`).join(',')}}`;
  state.depth = priorDepth;
  return result;
}

function exactPolicySelection(value) {
  const policy = exactPlainObject(value, POLICY_FIELDS);
  if (policy.eventId !== PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID ||
      policy.liveAcknowledgement !== TESTNET_LIVE_ACKNOWLEDGEMENT ||
      policy.operatorTrustAcknowledgement !==
        PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT ||
      policy.profileName !== PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME ||
      policy.rpcEndpoint !== PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT ||
      policy.wssAcknowledgement !==
        PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT) fail();
  return Object.freeze({
    eventId: policy.eventId,
    liveAcknowledgement: policy.liveAcknowledgement,
    operatorTrustAcknowledgement: policy.operatorTrustAcknowledgement,
    profileName: policy.profileName,
    rpcEndpoint: policy.rpcEndpoint,
    wssAcknowledgement: policy.wssAcknowledgement,
  });
}

function parseConfiguration(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 3 ||
      bytes.length > MAXIMUM_CONFIGURATION_BYTES || bytes[bytes.length - 1] !== 0x0a) fail();
  const body = bytes.subarray(0, bytes.length - 1);
  if (body.includes(0x0a) || body.includes(0x0d)) fail();
  const text = UTF8_DECODER.decode(body);
  if (Buffer.byteLength(text, 'utf8') !== body.length) fail();
  const value = JSON.parse(text);
  const configuration = exactPlainObject(value, [
    'artifactFamily', 'configurationVersion', 'offlineOnly', 'policySelection',
    'runAuthorized', 'status',
  ]);
  if (configuration.artifactFamily !== ARTIFACT_FAMILY ||
      configuration.configurationVersion !== 3 || configuration.offlineOnly !== true ||
      configuration.runAuthorized !== false || configuration.status !== RUN_STATUS) fail();
  const policySelection = exactPolicySelection(configuration.policySelection);
  const validated = {
    artifactFamily: ARTIFACT_FAMILY,
    configurationVersion: 3,
    offlineOnly: true,
    policySelection,
    runAuthorized: false,
    status: RUN_STATUS,
  };
  if (independentCanonicalJson(validated) !== text) fail();
  return Object.freeze(validated);
}

export function independentlyReviewGateBResetEpochConfigurationV3(bytes) {
  try {
    const configuration = parseConfiguration(bytes);
    const canonical = independentCanonicalJson(configuration);
    const configurationDigest = createHash('sha256')
      .update(`${DIGEST_DOMAIN}\n${canonical}`, 'utf8')
      .digest('hex');
    return Object.freeze({
      artifactFamily: ARTIFACT_FAMILY,
      configurationDigest,
      policySelection: configuration.policySelection,
      reviewVersion: 3,
      status: REVIEW_STATUS,
    });
  } catch {
    fail();
  }
}
