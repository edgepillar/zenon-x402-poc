import { types as utilTypes } from 'node:util';

import { paymentIntentDigest } from './canonical.js';
import {
  parseResetEpochWssOnceApproval,
  parseResetEpochWssOnceRunConfig,
  resetEpochWssOnceConfigDigest,
} from './live-evidence-runner.js';

const ERROR_CODE = 'gate_b_reset_epoch_v4_review_invalid';
const RUN_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const LOWERCASE_HASH_64 = /^[0-9a-f]{64}$/;
const REVIEW_VERSION = 1;
const MAX_CAPTURE_DEPTH = 32;
const MAX_CAPTURE_NODES = 4096;
const MAX_CAPTURE_KEYS = 256;
const MAX_CAPTURE_ARRAY_LENGTH = 256;
const MAX_CAPTURE_STRING_LENGTH = 65_536;

const REVIEW_FIELDS = Object.freeze([
  'reviewVersion', 'runName', 'runnerVersion', 'executionMode', 'eventId',
  'sourceRevision', 'profileName', 'payer', 'rpcEndpoint', 'quickTunnel',
  'expectedPaymentRequired', 'acknowledgements', 'runtime', 'configDigest',
  'paymentIntentDigest',
]);
const CONFIG_FIELDS = Object.freeze([
  'runnerVersion', 'executionMode', 'eventId', 'rpcEndpoint',
  'sourceRevision', 'profileName', 'payer', 'acknowledgements',
  'expectedPaymentRequired', 'quickTunnel', 'runtime',
]);

const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_PROTOTYPE = Array.prototype;
const IS_FINITE = Number.isFinite;
const IS_SAFE_INTEGER = Number.isSafeInteger;
const JSON_STRINGIFY = JSON.stringify;
const OBJECT_CREATE = Object.create;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const REGEXP_TEST = RegExp.prototype.test;
const SET_ADD = Set.prototype.add;
const SET_DELETE = Set.prototype.delete;
const SET_HAS = Set.prototype.has;
const SET = Set;
const STRING = String;
const TYPE_ERROR = TypeError;
const IS_PROXY = utilTypes.isProxy;

function fail() {
  throw new TYPE_ERROR(ERROR_CODE);
}

function exactRunName(value) {
  if (typeof value !== 'string' || !REFLECT_APPLY(REGEXP_TEST, RUN_NAME, [value])) fail();
  return value;
}

function exactDigest(value) {
  if (typeof value !== 'string' ||
      !REFLECT_APPLY(REGEXP_TEST, LOWERCASE_HASH_64, [value])) fail();
  return value;
}

function has(set, value) {
  return REFLECT_APPLY(SET_HAS, set, [value]);
}

function add(set, value) {
  REFLECT_APPLY(SET_ADD, set, [value]);
}

function remove(set, value) {
  REFLECT_APPLY(SET_DELETE, set, [value]);
}

function dataFields(value, expectedFields) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) ||
      OBJECT_GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const keys = REFLECT_OWN_KEYS(value);
  if (keys.length !== expectedFields.length) fail();
  const descriptors = OBJECT_CREATE(null);
  for (const key of keys) {
    if (typeof key !== 'string') fail();
    let expected = false;
    for (const field of expectedFields) {
      if (key === field) {
        expected = true;
        break;
      }
    }
    if (!expected) fail();
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (descriptor === undefined || !('value' in descriptor)) fail();
    descriptors[key] = descriptor.value;
  }
  return descriptors;
}

function captureJsonValue(value, state, depth = 0) {
  state.nodes += 1;
  if (state.nodes > MAX_CAPTURE_NODES || depth > MAX_CAPTURE_DEPTH) fail();
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > MAX_CAPTURE_STRING_LENGTH) fail();
    return value;
  }
  if (typeof value === 'number') {
    if (!IS_FINITE(value)) fail();
    return value;
  }
  if (typeof value !== 'object' || IS_PROXY(value) || has(state.ancestors, value)) fail();

  add(state.ancestors, value);
  try {
    if (ARRAY_IS_ARRAY(value)) {
      if (OBJECT_GET_PROTOTYPE_OF(value) !== ARRAY_PROTOTYPE) fail();
      const lengthDescriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, 'length');
      if (lengthDescriptor === undefined || !('value' in lengthDescriptor) ||
          !IS_SAFE_INTEGER(lengthDescriptor.value) ||
          lengthDescriptor.value < 0 ||
          lengthDescriptor.value > MAX_CAPTURE_ARRAY_LENGTH) fail();
      const keys = REFLECT_OWN_KEYS(value);
      if (keys.length !== lengthDescriptor.value + 1) fail();
      const captured = [];
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, STRING(index));
        if (descriptor === undefined || !('value' in descriptor)) fail();
        captured[index] = captureJsonValue(descriptor.value, state, depth + 1);
      }
      return OBJECT_FREEZE(captured);
    }

    if (OBJECT_GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
    const keys = REFLECT_OWN_KEYS(value);
    if (keys.length > MAX_CAPTURE_KEYS) fail();
    const captured = OBJECT_CREATE(null);
    for (const key of keys) {
      if (typeof key !== 'string') fail();
      const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      if (descriptor === undefined || !('value' in descriptor)) fail();
      captured[key] = captureJsonValue(descriptor.value, state, depth + 1);
    }
    return OBJECT_FREEZE(captured);
  } finally {
    remove(state.ancestors, value);
  }
}

function reviewDescriptor(config, runName, configDigest, intentDigest) {
  return OBJECT_FREEZE({
    reviewVersion: REVIEW_VERSION,
    runName,
    runnerVersion: config.runnerVersion,
    executionMode: config.executionMode,
    eventId: config.eventId,
    sourceRevision: config.sourceRevision,
    profileName: config.profileName,
    payer: config.payer,
    rpcEndpoint: config.rpcEndpoint,
    quickTunnel: config.quickTunnel,
    expectedPaymentRequired: config.expectedPaymentRequired,
    acknowledgements: config.acknowledgements,
    runtime: config.runtime,
    configDigest,
    paymentIntentDigest: intentDigest,
  });
}

function validatedReview(value) {
  const fields = dataFields(value, REVIEW_FIELDS);
  if (fields.reviewVersion !== REVIEW_VERSION) fail();
  const runName = exactRunName(fields.runName);
  const configDigest = exactDigest(fields.configDigest);
  const intentDigest = exactDigest(fields.paymentIntentDigest);
  const state = { ancestors: new SET(), nodes: 0 };
  const captured = OBJECT_CREATE(null);
  for (const field of CONFIG_FIELDS) {
    captured[field] = captureJsonValue(fields[field], state);
  }
  const candidate = {
    runnerVersion: captured.runnerVersion,
    executionMode: captured.executionMode,
    eventId: captured.eventId,
    rpcEndpoint: captured.rpcEndpoint,
    sourceRevision: captured.sourceRevision,
    profileName: captured.profileName,
    payer: captured.payer,
    acknowledgements: captured.acknowledgements,
    quickTunnel: captured.quickTunnel,
    expectedPaymentRequired: captured.expectedPaymentRequired,
    runtime: captured.runtime,
  };
  const parsed = parseResetEpochWssOnceRunConfig(`${JSON_STRINGIFY(candidate)}\n`);
  const expectedConfigDigest = resetEpochWssOnceConfigDigest(parsed);
  const expectedIntentDigest = paymentIntentDigest(
    parsed.expectedPaymentRequired,
    parsed.expectedPaymentRequired.accepts[0],
  );
  if (configDigest !== expectedConfigDigest || intentDigest !== expectedIntentDigest) fail();
  return reviewDescriptor(parsed, runName, configDigest, intentDigest);
}

function sameJson(left, right) {
  return JSON_STRINGIFY(left) === JSON_STRINGIFY(right);
}

export function prepareGateBResetEpochV4Review(runConfigJson, runName) {
  try {
    if (typeof runConfigJson !== 'string') fail();
    const exactRun = exactRunName(runName);
    const config = parseResetEpochWssOnceRunConfig(runConfigJson);
    const configDigest = resetEpochWssOnceConfigDigest(config);
    const intentDigest = paymentIntentDigest(
      config.expectedPaymentRequired,
      config.expectedPaymentRequired.accepts[0],
    );
    return reviewDescriptor(config, exactRun, configDigest, intentDigest);
  } catch {
    fail();
  }
}

export function bindGateBResetEpochV4Approval(
  approvalJson,
  reviewedConfigDigest,
  preparedReview,
) {
  try {
    if (typeof approvalJson !== 'string') fail();
    const reviewedDigest = exactDigest(reviewedConfigDigest);
    const review = validatedReview(preparedReview);
    if (reviewedDigest !== review.configDigest) fail();
    const approval = parseResetEpochWssOnceApproval(approvalJson);
    if (approval.runName !== review.runName ||
        approval.payer !== review.payer ||
        approval.eventId !== review.eventId ||
        approval.profileName !== review.profileName ||
        approval.sourceRevision !== review.sourceRevision ||
        approval.rpcEndpoint !== review.rpcEndpoint ||
        approval.executionMode !== review.executionMode ||
        approval.configDigest !== review.configDigest ||
        approval.paymentIntentDigest !== review.paymentIntentDigest ||
        !sameJson(approval.quickTunnel, review.quickTunnel)) fail();
    return OBJECT_FREEZE({
      bindingVersion: 1,
      reviewedConfigDigest: reviewedDigest,
      review,
      approval,
    });
  } catch {
    fail();
  }
}
