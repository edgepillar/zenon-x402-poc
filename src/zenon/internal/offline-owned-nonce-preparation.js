/**
 * ISOLATED OFFLINE QUALIFICATION ONLY.
 *
 * This connector binds one locally recorded preparation to zero or one owned
 * nonce-production attempt. It does not refresh or authenticate observations,
 * authorize signing, plan a live payment, establish pricing freshness, prove
 * throughput, or provide shared-session, admission, or payer locking.
 */

import { composeOfflinePreparationTrace } from
  './offline-observation-to-preparation-contract.js';
import { composeOfflinePreparationWithNonceProof } from
  './offline-preparation-nonce-contract.js';
import { produceOfflineZenonNonce } from './offline-pow-producer-owner.js';
import { prepareUnsignedZenonPaymentBlock } from
  './pre-sign-account-block-preparation.js';

const QUALIFICATION = 'OFFLINE_OWNED_PREPARATION_ONLY';
const PLACEHOLDER_NONCE = '0'.repeat(16);
const FIXED_ERROR_MESSAGE = 'Offline owned nonce preparation rejected';
const INPUT_REJECTED = 'OFFLINE_OWNED_NONCE_PREPARATION_INPUT_REJECTED';
const POST_PRODUCTION_REJECTED =
  'OFFLINE_OWNED_NONCE_PREPARATION_POST_PRODUCTION_REJECTED';
const PRODUCER_FIELDS = Object.freeze([
  'qualification',
  'status',
  'nonce',
  'recordedProofScope',
  'lifecycle',
  'trust',
]);
const COMPOSITION_FIELDS = Object.freeze([
  'qualification',
  'preparation',
  'nonceProof',
  'recordedContext',
  'recordedTrustLabel',
  'trust',
]);
const SCOPE_FIELDS = Object.freeze([
  'payer',
  'previousAccountHash',
  'difficulty',
]);
const TRUST_FIELDS = Object.freeze([
  'sourceAuthentication',
  'chainAuthentication',
  'canonicality',
  'finality',
  'liveFreshness',
  'signingAuthorization',
]);
const EXPECTED_LIFECYCLE = Object.freeze({
  status: 'COMPLETED',
  attemptCount: 1,
  ready: 'OBSERVED',
  wrapperInvocation: 'JS_WRAPPER_INVOKED',
  nativeOrWasmEntry: 'NOT_ESTABLISHED',
  terminal: 'SUCCESS',
  processExit: 'ZERO',
  processClose: 'OBSERVED',
  stdioClose: 'OBSERVED',
  termination: 'NOT_REQUESTED',
  retry: 'NOT_PERFORMED',
  networkBoundary: 'TRUSTED_ARTIFACT_JS_DENIAL_FACADE_NOT_OS_SANDBOX',
});

const clone = globalThis.structuredClone;
const defineProperty = Object.defineProperty;
const freeze = Object.freeze;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const getPrototypeOf = Object.getPrototypeOf;
const hasOwn = Object.hasOwn;
const isFrozen = Object.isFrozen;
const ownKeys = Reflect.ownKeys;
const objectPrototype = Object.prototype;
const objectPrototypeThenAtImport = getOwnPropertyDescriptor(
  objectPrototype,
  'then',
);

export async function produceOfflineUnsignedPreparation(trace) {
  if (arguments.length !== 1) rejectInput();

  let snapshot;
  let initialPreparation;
  let originalScope;
  try {
    composeOfflinePreparationTrace(trace);
    snapshot = deepFreeze(clone(trace));
    const staged = composeOfflinePreparationTrace(snapshot);
    initialPreparation = prepareUnsignedZenonPaymentBlock(
      staged.preparationInput,
    );
    const block = initialPreparation.block;
    originalScope = freeze({
      payer: block.address,
      previousAccountHash: block.previousHash,
      difficulty: block.difficulty,
    });
    if (block.signature !== '') rejectInput();
    if (block.difficulty > 0 &&
        snapshot.capturedTrace.nonceRecord?.nonce !== PLACEHOLDER_NONCE) {
      rejectInput();
    }
  } catch {
    rejectInput();
  }

  if (originalScope.difficulty === 0) {
    try {
      const composition = composeOfflinePreparationWithNonceProof(snapshot);
      if (!validComposition(
        composition,
        initialPreparation,
        originalScope,
        'NOT_REQUIRED',
        initialPreparation.block.nonce,
      )) rejectInput();
      const result = wrapper(composition, null);
      if (!asyncResultBoundaryIsSafe()) rejectInput();
      return result;
    } catch {
      rejectInput();
    }
  }

  const producerEvidence = await produceOfflineZenonNonce({
    payer: originalScope.payer,
    previousAccountHash: originalScope.previousAccountHash,
    difficulty: originalScope.difficulty,
  });

  try {
    if (!validProducerEvidence(producerEvidence, originalScope)) {
      rejectPostProduction();
    }
    const finalTrace = clone(snapshot);
    finalTrace.capturedTrace.nonceRecord = {
      nonce: producerEvidence.nonce,
      payer: originalScope.payer,
      previousAccountHash: originalScope.previousAccountHash,
      difficulty: originalScope.difficulty,
    };
    deepFreeze(finalTrace);
    const composition = composeOfflinePreparationWithNonceProof(finalTrace);
    if (!validComposition(
      composition,
      initialPreparation,
      originalScope,
      'VALID',
      producerEvidence.nonce,
    )) rejectPostProduction();
    const result = wrapper(composition, producerEvidence);
    if (!asyncResultBoundaryIsSafe()) rejectPostProduction();
    return result;
  } catch {
    rejectPostProduction();
  }
}

function asyncResultBoundaryIsSafe() {
  if (objectPrototypeThenAtImport !== undefined) return false;
  try {
    return getOwnPropertyDescriptor(objectPrototype, 'then') === undefined;
  } catch {
    return false;
  }
}

function validProducerEvidence(value, originalScope) {
  if (!exactRecord(value, PRODUCER_FIELDS) ||
      value.qualification !== 'OFFLINE_NONCE_PRODUCER_ONLY' ||
      value.status !== 'VALID' ||
      typeof value.nonce !== 'string' ||
      !/^[0-9a-f]{16}$/u.test(value.nonce) ||
      !sameScope(value.recordedProofScope, originalScope) ||
      !sameRecord(value.lifecycle, EXPECTED_LIFECYCLE) ||
      !notEstablishedTrust(value.trust)) return false;
  return deeplyFrozenData(value);
}

function validComposition(
  value,
  initialPreparation,
  originalScope,
  proofStatus,
  nonce,
) {
  if (!exactRecord(value, COMPOSITION_FIELDS) ||
      value.qualification !== 'OFFLINE_PREPARATION_NONCE_ONLY' ||
      value.nonceProof?.status !== proofStatus ||
      !sameScope(value.nonceProof?.recordedProofScope, originalScope) ||
      !notEstablishedTrust(value.nonceProof?.trust) ||
      !notEstablishedTrust(value.trust)) return false;
  const block = value.preparation?.block;
  return block?.signature === '' && block.nonce === nonce &&
    block.fusedPlasma === initialPreparation.block.fusedPlasma &&
    value.preparation.classification === initialPreparation.classification &&
    sameScope({
      payer: block.address,
      previousAccountHash: block.previousHash,
      difficulty: block.difficulty,
    }, originalScope) && deeplyFrozenData(value);
}

function wrapper(composition, producerEvidence) {
  const value = freeze({
    qualification: QUALIFICATION,
    composition,
    producerEvidence,
  });
  if (!deeplyFrozenData(value)) rejectPostProduction();
  return value;
}

function sameScope(left, right) {
  return exactRecord(left, SCOPE_FIELDS) &&
    left.payer === right.payer &&
    left.previousAccountHash === right.previousAccountHash &&
    left.difficulty === right.difficulty;
}

function notEstablishedTrust(value) {
  return exactRecord(value, TRUST_FIELDS) && TRUST_FIELDS.every(
    field => value[field] === 'NOT_ESTABLISHED',
  );
}

function sameRecord(value, expected) {
  const fields = ownKeys(expected);
  return exactRecord(value, fields) && fields.every(
    field => value[field] === expected[field],
  );
}

function exactRecord(value, fields) {
  if (typeof value !== 'object' || value === null ||
      getPrototypeOf(value) !== Object.prototype) return false;
  const keys = ownKeys(value);
  if (keys.length !== fields.length) return false;
  for (const field of fields) {
    const descriptor = getOwnPropertyDescriptor(value, field);
    if (descriptor === undefined || descriptor.enumerable !== true ||
        !hasOwn(descriptor, 'value')) return false;
  }
  return true;
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of ownKeys(value)) {
    const descriptor = getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && hasOwn(descriptor, 'value')) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return freeze(value);
}

function deeplyFrozenData(value, seen = new Set()) {
  if (typeof value === 'function') return false;
  if (value === null || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  if (getPrototypeOf(value) !== Object.prototype || !isFrozen(value)) return false;
  seen.add(value);
  for (const key of ownKeys(value)) {
    const descriptor = getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !hasOwn(descriptor, 'value') ||
        !deeplyFrozenData(descriptor.value, seen)) return false;
  }
  return true;
}

function sanitizedError(code) {
  const error = new TypeError(FIXED_ERROR_MESSAGE);
  defineProperty(error, 'stack', {
    configurable: false,
    enumerable: false,
    value: undefined,
    writable: false,
  });
  defineProperty(error, 'code', {
    configurable: false,
    enumerable: true,
    value: code,
    writable: false,
  });
  return freeze(error);
}

function rejectInput() {
  throw sanitizedError(INPUT_REJECTED);
}

function rejectPostProduction() {
  throw sanitizedError(POST_PRODUCTION_REJECTED);
}
