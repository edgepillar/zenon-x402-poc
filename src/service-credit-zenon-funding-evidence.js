import { createHash } from 'node:crypto';
import { types as utilTypes } from 'node:util';

import {
  SERVICE_CREDIT_ACTIVATION_VERSION,
  SERVICE_CREDIT_MODEL_VERSION,
  SERVICE_CREDIT_ZENON_ACTIVATION_RECORD_VERSION,
} from './service-credit-model.js';
import {
  EXPERIMENTAL_LIVE_NETWORK,
  snapshotActiveUpfrontRequirement,
  validatePaymentRequired,
} from './x402-wire.js';

const NATIVE_PROMISE = Promise;
const PROMISE_PROTOTYPE = NATIVE_PROMISE.prototype;
const PROMISE_THEN = PROMISE_PROTOTYPE.then;
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_JOIN = Array.prototype.join;
const ARRAY_PROTOTYPE = Array.prototype;
const ARRAY_SORT = Array.prototype.sort;
const NATIVE_BUFFER = Buffer;
const BUFFER_BYTE_LENGTH = NATIVE_BUFFER.byteLength;
const NATIVE_JSON = JSON;
const JSON_STRINGIFY = NATIVE_JSON.stringify;
const NATIVE_URL = URL;
const NATIVE_WEAK_SET = WeakSet;
const WEAK_SET_ADD = NATIVE_WEAK_SET.prototype.add;
const WEAK_SET_HAS = NATIVE_WEAK_SET.prototype.has;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const OBJECT_CREATE = Object.create;
const OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_IS_EXTENSIBLE = Object.isExtensible;
const OBJECT_IS = Object.is;
const OBJECT_IS_FROZEN = Object.isFrozen;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const REFLECT_GET_PROTOTYPE_OF = Reflect.getPrototypeOf;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const REGEXP_EXEC = RegExp.prototype.exec;
const REGEXP_TEST = RegExp.prototype.test;
const STRING_INDEX_OF = String.prototype.indexOf;
const STRING_SLICE = String.prototype.slice;
const IS_PROMISE = utilTypes.isPromise;
const IS_PROXY = utilTypes.isProxy;
const HASH_PROTOTYPE = REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [createHash('sha256')]);
const HASH_UPDATE = HASH_PROTOTYPE.update;
const HASH_DIGEST = HASH_PROTOTYPE.digest;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_COMMITMENT = /^sha256:[0-9a-f]{64}$/;
const LOWERCASE_HASH = /^[0-9a-f]{64}$/;
const POSITIVE_DECIMAL = /^[1-9][0-9]*$/;
const TRANSACTION_REFERENCE = /^zenontx:([0-9a-f]{64})$/;
const FUNDING_TAG = 'x402-service-credit-funding-v1';
const EVIDENCE_VERSION = 1;
const VERIFIED_EVIDENCE_TYPE = 'zenon-authenticated-funding-evidence';
const CONFIRMATION_POLICY_ID = 'zenon.authenticated-momentum-inclusion';
const MAX_INPUT_BYTES = 512 * 1024;
const MAX_DEPTH = 20;
const MAX_ARRAY_LENGTH = 4096;
const MAX_INPUT_NODES = 8192;
const MAX_INPUT_MEMBERS = 8192;
const MAX_INPUT_KEY_BYTES = 64 * 1024;
const MAX_INPUT_STRING_BYTES = 256 * 1024;
const MAX_SDK_CHAIN_IDENTIFIER = '9007199254740991';
const ZERO_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
const RESOURCE_BINDING_DOMAIN = 'zenon-x402-service-credit-resource-binding-v1';
const FUNDING_COMMITMENT_DOMAIN = 'zenon-x402-service-credit-grant-funding-v1';
const REQUIREMENT_DIGEST_DOMAIN = 'zenon-x402-service-credit-payment-requirement-v1';
const RESOURCE_DIGEST_DOMAIN = 'zenon-x402-service-credit-payment-resource-v1';
const INCLUSION_AUTHORIZATION_DOMAIN = 'zenon-x402-service-credit-inclusion-authorization-v1';
const AUTHORITY_SETTLEMENT_DOMAIN = 'zenon-x402-service-credit-source-settlement-v1';
const PINNED_PROMISE_CONSTRUCTOR = OBJECT_FREEZE({
  configurable: false,
  enumerable: false,
  writable: false,
  value: NATIVE_PROMISE,
});
const IGNORE_PROMISE_REJECTION = OBJECT_FREEZE(() => undefined);

export class ServiceCreditZenonFundingEvidenceError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ServiceCreditZenonFundingEvidenceError';
    this.code = code;
    this.stack = `ServiceCreditZenonFundingEvidenceError: ${code}`;
  }
}

function failure(code) {
  return new ServiceCreditZenonFundingEvidenceError(code);
}

function failConfiguration() {
  throw failure('SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_INVALID_CONFIGURATION');
}

function failInput() {
  throw failure('SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_INVALID_INPUT');
}

function failRejected() {
  throw failure('SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED');
}

function exactDataObject(input, keys, onFailure = failInput) {
  try {
    if (
      input === null
      || typeof input !== 'object'
      || REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [input])
      || REFLECT_APPLY(IS_PROXY, undefined, [input])
      || REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [input]) !== OBJECT_PROTOTYPE
    ) {
      onFailure();
    }
    const observed = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [input]);
    if (observed.length !== keys.length) onFailure();
    for (let index = 0; index < observed.length; index += 1) {
      const observedKey = observed[index];
      let permitted = false;
      for (let expectedIndex = 0; expectedIndex < keys.length; expectedIndex += 1) {
        if (observedKey === keys[expectedIndex]) {
          permitted = true;
          break;
        }
      }
      if (typeof observedKey !== 'string' || !permitted) onFailure();
    }
    const result = REFLECT_APPLY(OBJECT_CREATE, Object, [null]);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const descriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [input, key],
      );
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) onFailure();
      result[key] = descriptor.value;
    }
    return result;
  } catch (error) {
    if (error instanceof ServiceCreditZenonFundingEvidenceError) throw error;
    onFailure();
  }
}

function addBudget(budget, field, amount, maximum, onFailure) {
  budget[field] += amount;
  if (budget[field] > maximum) onFailure();
}

function byteLength(value) {
  return REFLECT_APPLY(BUFFER_BYTE_LENGTH, NATIVE_BUFFER, [value, 'utf8']);
}

function copyJson(input, budget, depth = 0, onFailure = failInput) {
  try {
    if (depth > MAX_DEPTH) onFailure();
    addBudget(budget, 'nodes', 1, MAX_INPUT_NODES, onFailure);
    if (input === null || typeof input === 'boolean') return input;
    if (typeof input === 'string') {
      if (input.length > MAX_INPUT_STRING_BYTES) onFailure();
      addBudget(
        budget,
        'stringBytes',
        byteLength(input),
        MAX_INPUT_STRING_BYTES,
        onFailure,
      );
      return input;
    }
    if (typeof input === 'number') {
      if (!REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [input])) onFailure();
      return REFLECT_APPLY(OBJECT_IS, Object, [input, -0]) ? 0 : input;
    }
    if (typeof input !== 'object' || REFLECT_APPLY(IS_PROXY, undefined, [input])) onFailure();
    if (REFLECT_APPLY(WEAK_SET_HAS, budget.seen, [input])) onFailure();
    REFLECT_APPLY(WEAK_SET_ADD, budget.seen, [input]);
    const prototype = REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [input]);
    if (REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [input])) {
      const length = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [input, 'length'],
      );
      if (
        prototype !== ARRAY_PROTOTYPE
        || !length
        || length.enumerable
        || !OBJECT_HAS_OWN(length, 'value')
        || !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [length.value])
        || length.value < 0
        || length.value > MAX_ARRAY_LENGTH
      ) {
        onFailure();
      }
      const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [input]);
      if (keys.length !== length.value + 1 || keys[keys.length - 1] !== 'length') {
        onFailure();
      }
      addBudget(budget, 'members', length.value, MAX_INPUT_MEMBERS, onFailure);
      const copy = [];
      for (let index = 0; index < length.value; index += 1) {
        const indexKey = `${index}`;
        if (keys[index] !== indexKey) onFailure();
        if (indexKey.length > MAX_INPUT_KEY_BYTES) onFailure();
        addBudget(budget, 'keyBytes', byteLength(indexKey), MAX_INPUT_KEY_BYTES, onFailure);
        const descriptor = REFLECT_APPLY(
          REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
          Reflect,
          [input, indexKey],
        );
        if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) onFailure();
        REFLECT_APPLY(OBJECT_DEFINE_PROPERTY, undefined, [copy, indexKey, {
          configurable: true,
          enumerable: true,
          value: copyJson(descriptor.value, budget, depth + 1, onFailure),
          writable: true,
        }]);
      }
      return copy;
    }
    if (prototype !== OBJECT_PROTOTYPE) onFailure();
    // This module is not an ingress/body parser. A trusted composition layer
    // must enforce a serialized input-size ceiling before materializing plain
    // objects; Reflect.ownKeys cannot itself prebound an existing key set.
    const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [input]);
    if (keys.length > MAX_ARRAY_LENGTH) onFailure();
    addBudget(budget, 'members', keys.length, MAX_INPUT_MEMBERS, onFailure);
    const copy = {};
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (
        typeof key !== 'string'
        || key === '__proto__'
        || key === 'constructor'
        || key === 'prototype'
      ) {
        onFailure();
      }
      if (key.length > MAX_INPUT_KEY_BYTES) onFailure();
      addBudget(budget, 'keyBytes', byteLength(key), MAX_INPUT_KEY_BYTES, onFailure);
      const descriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [input, key],
      );
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) onFailure();
      REFLECT_APPLY(OBJECT_DEFINE_PROPERTY, undefined, [copy, key, {
        configurable: true,
        enumerable: true,
        value: copyJson(descriptor.value, budget, depth + 1, onFailure),
        writable: true,
      }]);
    }
    return copy;
  } catch (error) {
    if (error instanceof ServiceCreditZenonFundingEvidenceError) throw error;
    onFailure();
  }
}

function deepFreeze(value) {
  if (
    value !== null
    && typeof value === 'object'
    && !REFLECT_APPLY(OBJECT_IS_FROZEN, Object, [value])
  ) {
    const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [value]);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const descriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [value, key],
      );
      if (descriptor && OBJECT_HAS_OWN(descriptor, 'value')) deepFreeze(descriptor.value);
    }
    REFLECT_APPLY(OBJECT_FREEZE, Object, [value]);
  }
  return value;
}

function snapshotJson(input, onFailure = failInput) {
  const budget = {
    keyBytes: 0,
    members: 0,
    nodes: 0,
    seen: new NATIVE_WEAK_SET(),
    stringBytes: 0,
  };
  const copy = copyJson(input, budget, 0, onFailure);
  if (byteLength(canonicalJson(copy)) > MAX_INPUT_BYTES) onFailure();
  return deepFreeze(copy);
}

function append(array, value) {
  REFLECT_APPLY(OBJECT_DEFINE_PROPERTY, undefined, [array, `${array.length}`, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  }]);
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return REFLECT_APPLY(JSON_STRINGIFY, NATIVE_JSON, [value]);
  }
  if (REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [value])) {
    const entries = [];
    for (let index = 0; index < value.length; index += 1) {
      append(entries, canonicalJson(value[index]));
    }
    return `[${REFLECT_APPLY(ARRAY_JOIN, entries, [','])}]`;
  }
  const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [value]);
  REFLECT_APPLY(ARRAY_SORT, keys, []);
  const entries = [];
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    append(entries, `${REFLECT_APPLY(JSON_STRINGIFY, NATIVE_JSON, [key])}:${canonicalJson(value[key])}`);
  }
  return `{${REFLECT_APPLY(ARRAY_JOIN, entries, [','])}}`;
}

function sha256Hex(value) {
  const hash = createHash('sha256');
  REFLECT_APPLY(HASH_UPDATE, hash, [canonicalJson(value), 'utf8']);
  return REFLECT_APPLY(HASH_DIGEST, hash, ['hex']);
}

function paymentIntentDigest(paymentRequired, accepted) {
  return sha256Hex({
    x402Version: paymentRequired.x402Version,
    resource: paymentRequired.resource,
    accepted,
  });
}

function commitment(domain, value) {
  const hash = createHash('sha256');
  REFLECT_APPLY(HASH_UPDATE, hash, [`${domain}\0`, 'ascii']);
  REFLECT_APPLY(HASH_UPDATE, hash, [canonicalJson(value), 'utf8']);
  return `sha256:${REFLECT_APPLY(HASH_DIGEST, hash, ['hex'])}`;
}

function sameJson(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function assertIdentifier(value, onFailure = failInput) {
  if (
    typeof value !== 'string'
    || !REFLECT_APPLY(REGEXP_TEST, IDENTIFIER, [value])
    || REFLECT_APPLY(STRING_INDEX_OF, value, ['://']) !== -1
  ) onFailure();
}

function assertPositiveInteger(value, onFailure = failInput) {
  if (!REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [value]) || value <= 0) onFailure();
}

function assertCommitment(value, onFailure = failInput) {
  if (
    typeof value !== 'string'
    || !REFLECT_APPLY(REGEXP_TEST, SHA256_COMMITMENT, [value])
  ) onFailure();
}

function assertProviderDerivedGrantTerms(intent, requirement) {
  assertPositiveInteger(intent.totalUnits, failRejected);
  assertPositiveInteger(intent.expiresAt, failRejected);
  assertIdentifier(requirement.asset, failRejected);
  assertIdentifier(requirement.payTo, failRejected);
  if (
    typeof requirement.amount !== 'string'
    || !REFLECT_APPLY(REGEXP_TEST, POSITIVE_DECIMAL, [requirement.amount])
    || requirement.amount.length > 77
  ) {
    failRejected();
  }
}

function readClock(now, failureCode) {
  let observed;
  try {
    observed = REFLECT_APPLY(now, undefined, []);
  } catch {
    throw failure(failureCode);
  }
  if (
    !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [observed])
    || observed < 0
  ) {
    throw failure(failureCode);
  }
  return observed;
}

function normalizeChainProfile(input, onFailure) {
  const value = exactDataObject(input, [
    'version',
    'chainIdentifier',
    'genesisMomentumHash',
  ], onFailure);
  if (
    value.version !== 1
    || typeof value.chainIdentifier !== 'string'
    || !REFLECT_APPLY(REGEXP_TEST, POSITIVE_DECIMAL, [value.chainIdentifier])
    || value.chainIdentifier.length > MAX_SDK_CHAIN_IDENTIFIER.length
    || (
      value.chainIdentifier.length === MAX_SDK_CHAIN_IDENTIFIER.length
      && value.chainIdentifier > MAX_SDK_CHAIN_IDENTIFIER
    )
    || typeof value.genesisMomentumHash !== 'string'
    || !REFLECT_APPLY(REGEXP_TEST, LOWERCASE_HASH, [value.genesisMomentumHash])
    || value.genesisMomentumHash === ZERO_HASH
  ) {
    onFailure();
  }
  return deepFreeze({
    version: 1,
    chainIdentifier: value.chainIdentifier,
    genesisMomentumHash: value.genesisMomentumHash,
  });
}

function normalizeConfirmationPolicy(input, onFailure) {
  const value = exactDataObject(input, [
    'policyId',
    'policyVersion',
    'minimumConfirmations',
  ], onFailure);
  if (
    value.policyId !== CONFIRMATION_POLICY_ID
    || value.policyVersion !== 1
    || !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [value.minimumConfirmations])
    || value.minimumConfirmations < 2
    || value.minimumConfirmations > 30
  ) {
    onFailure();
  }
  return deepFreeze({
    policyId: value.policyId,
    policyVersion: value.policyVersion,
    minimumConfirmations: value.minimumConfirmations,
  });
}

function normalizeAuthority(input) {
  const value = exactDataObject(input, [
    'profileId',
    'profileVersion',
    'verifierVersion',
    'recordDigest',
    'network',
    'chainProfile',
    'confirmationPolicy',
  ], failConfiguration);
  assertIdentifier(value.profileId, failConfiguration);
  assertPositiveInteger(value.profileVersion, failConfiguration);
  assertPositiveInteger(value.verifierVersion, failConfiguration);
  assertCommitment(value.recordDigest, failConfiguration);
  if (value.network !== EXPERIMENTAL_LIVE_NETWORK) failConfiguration();
  return deepFreeze({
    profileId: value.profileId,
    profileVersion: value.profileVersion,
    verifierVersion: value.verifierVersion,
    recordDigest: value.recordDigest,
    network: value.network,
    chainProfile: normalizeChainProfile(value.chainProfile, failConfiguration),
    confirmationPolicy: normalizeConfirmationPolicy(
      value.confirmationPolicy,
      failConfiguration,
    ),
  });
}

function normalizeIntent(input) {
  const value = exactDataObject(input, [
    'modelVersion',
    'activationVersion',
    'providerId',
    'serviceId',
    'resourceId',
    'offerId',
    'offerVersion',
    'holderId',
    'capabilityCommitment',
    'totalUnits',
    'expiresAt',
  ]);
  if (
    value.modelVersion !== SERVICE_CREDIT_MODEL_VERSION
    || value.activationVersion !== SERVICE_CREDIT_ACTIVATION_VERSION
  ) {
    failInput();
  }
  const identifiers = [
    value.providerId,
    value.serviceId,
    value.resourceId,
    value.offerId,
    value.holderId,
  ];
  for (let index = 0; index < identifiers.length; index += 1) {
    assertIdentifier(identifiers[index]);
  }
  assertPositiveInteger(value.offerVersion);
  assertCommitment(value.capabilityCommitment);
  assertPositiveInteger(value.totalUnits);
  assertPositiveInteger(value.expiresAt);
  return deepFreeze({
    modelVersion: value.modelVersion,
    activationVersion: value.activationVersion,
    providerId: value.providerId,
    serviceId: value.serviceId,
    resourceId: value.resourceId,
    offerId: value.offerId,
    offerVersion: value.offerVersion,
    holderId: value.holderId,
    capabilityCommitment: value.capabilityCommitment,
    totalUnits: value.totalUnits,
    expiresAt: value.expiresAt,
  });
}

function normalizeFundingSelection(input) {
  const value = exactDataObject(input, [
    'offerId',
    'offerVersion',
    'holderId',
    'capabilityCommitment',
  ]);
  assertIdentifier(value.offerId);
  assertPositiveInteger(value.offerVersion);
  assertIdentifier(value.holderId);
  assertCommitment(value.capabilityCommitment);
  return deepFreeze({ ...value });
}

function selectionFromIntent(intent) {
  return deepFreeze({
    offerId: intent.offerId,
    offerVersion: intent.offerVersion,
    holderId: intent.holderId,
    capabilityCommitment: intent.capabilityCommitment,
  });
}

function normalizeOffer(input, selection) {
  const value = exactDataObject(input, [
    'modelVersion',
    'providerId',
    'serviceId',
    'resourceId',
    'resourceBinding',
    'offerId',
    'offerVersion',
    'costPolicyId',
    'fundingPolicyId',
    'fundingPolicyVersion',
  ], failRejected);
  if (
    value.modelVersion !== SERVICE_CREDIT_MODEL_VERSION
    || value.offerId !== selection.offerId
    || value.offerVersion !== selection.offerVersion
  ) {
    failRejected();
  }
  assertIdentifier(value.providerId, failRejected);
  assertIdentifier(value.serviceId, failRejected);
  assertIdentifier(value.resourceId, failRejected);
  assertIdentifier(value.offerId, failRejected);
  assertPositiveInteger(value.offerVersion, failRejected);
  assertCommitment(value.resourceBinding, failRejected);
  assertIdentifier(value.costPolicyId, failRejected);
  assertIdentifier(value.fundingPolicyId, failRejected);
  assertPositiveInteger(value.fundingPolicyVersion, failRejected);
  return deepFreeze({ ...value });
}

function snapshotRequirement(input, authority) {
  try {
    const snapshot = snapshotJson(input, failRejected);
    const normalized = snapshotActiveUpfrontRequirement(snapshot);
    if (
      normalized.scheme !== 'exact'
      || normalized.network !== authority.network
      || normalized.extra.paymentFlow !== 'upfront'
      || normalized.extra.poc !== true
      || normalized.extra.settlement !== 'account-block'
      || normalized.extra.minimumMomentumConfirmations
        !== authority.confirmationPolicy.minimumConfirmations
      || !sameJson(normalized.extra.zenonChain, authority.chainProfile)
    ) {
      failRejected();
    }
    return snapshotJson(normalized, failRejected);
  } catch (error) {
    if (error instanceof ServiceCreditZenonFundingEvidenceError) throw error;
    failRejected();
  }
}

function rejectAsyncPolicyResult(input) {
  let promise;
  try {
    promise = REFLECT_APPLY(IS_PROMISE, undefined, [input]);
  } catch {
    failRejected();
  }
  if (!promise) return;
  // A safely classifiable native Promise receives a rejection observer before
  // this synchronous-policy violation is rejected. Unsafe Promise shapes are a
  // violation by privileged composition code and receive no stronger guarantee.
  safeNativePromise(input);
  failRejected();
}

function deriveProviderTerms(deriveFundingTerms, authority, offer, selection) {
  const policyInput = deepFreeze({
    offer,
    holderId: selection.holderId,
    capabilityCommitment: selection.capabilityCommitment,
  });
  let rawTerms;
  try {
    rawTerms = REFLECT_APPLY(deriveFundingTerms, undefined, [policyInput]);
  } catch {
    failRejected();
  }
  rejectAsyncPolicyResult(rawTerms);
  const snapshot = snapshotJson(rawTerms, failRejected);
  const value = exactDataObject(snapshot, [
    'fundingPolicyId',
    'fundingPolicyVersion',
    'totalUnits',
    'expiresAt',
    'requirement',
  ], failRejected);
  if (
    value.fundingPolicyId !== offer.fundingPolicyId
    || value.fundingPolicyVersion !== offer.fundingPolicyVersion
  ) {
    failRejected();
  }
  assertPositiveInteger(value.totalUnits, failRejected);
  assertPositiveInteger(value.expiresAt, failRejected);
  const accepted = snapshotRequirement(value.requirement, authority);
  const activationIntent = deepFreeze({
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    activationVersion: SERVICE_CREDIT_ACTIVATION_VERSION,
    providerId: offer.providerId,
    serviceId: offer.serviceId,
    resourceId: offer.resourceId,
    offerId: offer.offerId,
    offerVersion: offer.offerVersion,
    holderId: selection.holderId,
    capabilityCommitment: selection.capabilityCommitment,
    totalUnits: value.totalUnits,
    expiresAt: value.expiresAt,
  });
  assertProviderDerivedGrantTerms(activationIntent, accepted);
  return deepFreeze({ activationIntent, accepted });
}

function resourceBinding(resourceId, resourceUrl) {
  if (typeof resourceUrl !== 'string' || resourceUrl.length === 0 || resourceUrl.length > 4096) {
    failInput();
  }
  let parsed;
  try {
    parsed = new NATIVE_URL(resourceUrl);
  } catch {
    failInput();
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || parsed.href !== resourceUrl
  ) {
    failInput();
  }
  return commitment(RESOURCE_BINDING_DOMAIN, { resourceId, resourceUrl });
}

function fundingCommitment(authority, offer, intent, requirement) {
  return commitment(FUNDING_COMMITMENT_DOMAIN, {
    modelVersion: intent.modelVersion,
    activationVersion: intent.activationVersion,
    activationRecordVersion: SERVICE_CREDIT_ZENON_ACTIVATION_RECORD_VERSION,
    evidenceVersion: EVIDENCE_VERSION,
    evidenceType: VERIFIED_EVIDENCE_TYPE,
    authorityProfileId: authority.profileId,
    authorityProfileVersion: authority.profileVersion,
    verifierVersion: authority.verifierVersion,
    authorityRecordDigest: authority.recordDigest,
    confirmationPolicy: authority.confirmationPolicy,
    fundingPolicyId: offer.fundingPolicyId,
    fundingPolicyVersion: offer.fundingPolicyVersion,
    costPolicyId: offer.costPolicyId,
    providerId: intent.providerId,
    serviceId: intent.serviceId,
    resourceId: intent.resourceId,
    resourceBinding: offer.resourceBinding,
    offerId: intent.offerId,
    offerVersion: intent.offerVersion,
    holderId: intent.holderId,
    capabilityCommitment: intent.capabilityCommitment,
    totalUnits: intent.totalUnits,
    expiresAt: intent.expiresAt,
    scheme: requirement.scheme,
    paymentFlow: requirement.extra.paymentFlow,
    settlement: requirement.extra.settlement,
    poc: requirement.extra.poc,
    maxTimeoutSeconds: requirement.maxTimeoutSeconds,
    network: requirement.network,
    chainProfile: requirement.extra.zenonChain,
    asset: requirement.asset,
    amount: requirement.amount,
    payee: requirement.payTo,
  });
}

function fundingResource(resourceUrl, funding) {
  const hex = REFLECT_APPLY(STRING_SLICE, funding, ['sha256:'.length]);
  return deepFreeze({
    url: resourceUrl,
    tags: [
      FUNDING_TAG,
      REFLECT_APPLY(STRING_SLICE, hex, [0, 32]),
      REFLECT_APPLY(STRING_SLICE, hex, [32]),
    ],
  });
}

function assertFundingResource(resource, resourceId, expectedBinding, expectedFunding) {
  const value = exactDataObject(resource, ['url', 'tags'], failRejected);
  if (
    resourceBinding(resourceId, value.url) !== expectedBinding
    || !REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [value.tags])
    || REFLECT_APPLY(IS_PROXY, undefined, [value.tags])
    || REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [value.tags]) !== ARRAY_PROTOTYPE
    || value.tags.length !== 3
    || value.tags[0] !== FUNDING_TAG
    || value.tags[1] !== REFLECT_APPLY(STRING_SLICE, expectedFunding, [7, 39])
    || value.tags[2] !== REFLECT_APPLY(STRING_SLICE, expectedFunding, [39])
  ) {
    failRejected();
  }
}

function captureEvidenceCandidate(input) {
  const value = exactDataObject(input, ['evidenceVersion', 'artifact']);
  if (value.evidenceVersion !== EVIDENCE_VERSION) failInput();
  const artifact = snapshotJson(value.artifact);
  if (
    artifact === null
    || typeof artifact !== 'object'
    || REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [artifact])
  ) failInput();
  return deepFreeze({ evidenceVersion: EVIDENCE_VERSION, artifact });
}

function captureVerifiedRecord(input) {
  const value = exactDataObject(input, [
    'evidenceVersion',
    'evidenceType',
    'authorityProfileId',
    'authorityProfileVersion',
    'verifierVersion',
    'authorityRecordDigest',
    'network',
    'chainProfile',
    'transactionId',
    'payer',
    'payee',
    'asset',
    'amount',
    'paymentResourceDigest',
    'paymentRequirementDigest',
    'paymentIntentDigest',
    'resourceBinding',
    'offerId',
    'offerVersion',
    'fundingPolicyId',
    'fundingPolicyVersion',
    'capabilityCommitment',
    'totalUnits',
    'expiresAt',
    'grantFundingCommitment',
    'inclusionEvidence',
    'confirmationPolicy',
  ], failRejected);
  if (
    value.evidenceVersion !== EVIDENCE_VERSION
    || value.evidenceType !== VERIFIED_EVIDENCE_TYPE
    || value.network !== EXPERIMENTAL_LIVE_NETWORK
    || typeof value.transactionId !== 'string'
    || !REFLECT_APPLY(REGEXP_TEST, TRANSACTION_REFERENCE, [value.transactionId])
    || typeof value.amount !== 'string'
    || !REFLECT_APPLY(REGEXP_TEST, POSITIVE_DECIMAL, [value.amount])
    || value.amount.length > 77
  ) {
    failRejected();
  }
  const identifiers = [
    value.authorityProfileId,
    value.payer,
    value.payee,
    value.asset,
    value.offerId,
    value.fundingPolicyId,
  ];
  for (let index = 0; index < identifiers.length; index += 1) {
    assertIdentifier(identifiers[index], failRejected);
  }
  assertPositiveInteger(value.authorityProfileVersion, failRejected);
  assertPositiveInteger(value.verifierVersion, failRejected);
  assertPositiveInteger(value.offerVersion, failRejected);
  assertPositiveInteger(value.fundingPolicyVersion, failRejected);
  assertPositiveInteger(value.totalUnits, failRejected);
  assertPositiveInteger(value.expiresAt, failRejected);
  const commitments = [
    value.authorityRecordDigest,
    value.paymentResourceDigest,
    value.paymentRequirementDigest,
    value.paymentIntentDigest,
    value.resourceBinding,
    value.capabilityCommitment,
    value.grantFundingCommitment,
  ];
  for (let index = 0; index < commitments.length; index += 1) {
    assertCommitment(commitments[index], failRejected);
  }
  const chainProfile = normalizeChainProfile(value.chainProfile, failRejected);
  const confirmationPolicy = normalizeConfirmationPolicy(
    value.confirmationPolicy,
    failRejected,
  );
  const inclusion = exactDataObject(value.inclusionEvidence, [
    'state',
    'transactionHash',
    'momentumHeight',
    'momentumHash',
    'observedConfirmations',
  ], failRejected);
  const transactionMatch = REFLECT_APPLY(REGEXP_EXEC, TRANSACTION_REFERENCE, [
    value.transactionId,
  ]);
  if (
    inclusion.state !== 'MOMENTUM_INCLUDED'
    || typeof inclusion.transactionHash !== 'string'
    || !REFLECT_APPLY(REGEXP_TEST, LOWERCASE_HASH, [inclusion.transactionHash])
    || inclusion.transactionHash !== transactionMatch?.[1]
    || !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [inclusion.momentumHeight])
    || inclusion.momentumHeight <= 0
    || typeof inclusion.momentumHash !== 'string'
    || !REFLECT_APPLY(REGEXP_TEST, LOWERCASE_HASH, [inclusion.momentumHash])
    || inclusion.momentumHash === inclusion.transactionHash
    || !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [inclusion.observedConfirmations])
    || inclusion.observedConfirmations < confirmationPolicy.minimumConfirmations
  ) {
    failRejected();
  }
  return deepFreeze({
    evidenceVersion: EVIDENCE_VERSION,
    evidenceType: VERIFIED_EVIDENCE_TYPE,
    authorityProfileId: value.authorityProfileId,
    authorityProfileVersion: value.authorityProfileVersion,
    verifierVersion: value.verifierVersion,
    authorityRecordDigest: value.authorityRecordDigest,
    network: value.network,
    chainProfile,
    transactionId: value.transactionId,
    payer: value.payer,
    payee: value.payee,
    asset: value.asset,
    amount: value.amount,
    paymentResourceDigest: value.paymentResourceDigest,
    paymentRequirementDigest: value.paymentRequirementDigest,
    paymentIntentDigest: value.paymentIntentDigest,
    resourceBinding: value.resourceBinding,
    offerId: value.offerId,
    offerVersion: value.offerVersion,
    fundingPolicyId: value.fundingPolicyId,
    fundingPolicyVersion: value.fundingPolicyVersion,
    capabilityCommitment: value.capabilityCommitment,
    totalUnits: value.totalUnits,
    expiresAt: value.expiresAt,
    grantFundingCommitment: value.grantFundingCommitment,
    inclusionEvidence: {
      state: inclusion.state,
      transactionHash: inclusion.transactionHash,
      momentumHeight: inclusion.momentumHeight,
      momentumHash: inclusion.momentumHash,
      observedConfirmations: inclusion.observedConfirmations,
    },
    confirmationPolicy,
  });
}

function exactPromiseConstructorDescriptor(descriptor, expected) {
  try {
    if (!descriptor) return false;
    const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [descriptor]);
    return (
      keys.length === 4
      && OBJECT_HAS_OWN(descriptor, 'configurable')
      && OBJECT_HAS_OWN(descriptor, 'enumerable')
      && OBJECT_HAS_OWN(descriptor, 'value')
      && OBJECT_HAS_OWN(descriptor, 'writable')
      && descriptor.configurable === expected.configurable
      && descriptor.enumerable === expected.enumerable
      && descriptor.value === expected.value
      && descriptor.writable === expected.writable
    );
  } catch {
    return false;
  }
}

function attachPromiseRejectionObserver(input) {
  try {
    REFLECT_APPLY(PROMISE_THEN, input, [undefined, IGNORE_PROMISE_REJECTION]);
    return true;
  } catch {
    return false;
  }
}

function safeNativePromise(input) {
  let promise;
  try {
    promise = REFLECT_APPLY(IS_PROMISE, undefined, [input]);
  } catch {
    failRejected();
  }
  if (!promise) failRejected();

  let constructorDescriptor;
  let ownThenDescriptor;
  let prototype;
  try {
    constructorDescriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      Reflect,
      [input, 'constructor'],
    );
    ownThenDescriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      Reflect,
      [input, 'then'],
    );
    prototype = REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [input]);
  } catch {
    failRejected();
  }

  const safeShape = (
    prototype === PROMISE_PROTOTYPE
    && ownThenDescriptor === undefined
    && REFLECT_APPLY(OBJECT_IS_EXTENSIBLE, Object, [input])
  );
  if (safeShape && exactPromiseConstructorDescriptor(
    constructorDescriptor,
    PINNED_PROMISE_CONSTRUCTOR,
  )) {
    if (!attachPromiseRejectionObserver(input)) failRejected();
    return input;
  }

  if (safeShape && constructorDescriptor === undefined) {
    try {
      REFLECT_APPLY(OBJECT_DEFINE_PROPERTY, undefined, [
        input,
        'constructor',
        PINNED_PROMISE_CONSTRUCTOR,
      ]);
      const pinned = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [input, 'constructor'],
      );
      if (exactPromiseConstructorDescriptor(pinned, PINNED_PROMISE_CONSTRUCTOR)) {
        if (!attachPromiseRejectionObserver(input)) failRejected();
        return input;
      }
    } catch {}
  }

  failRejected();
}

function errorCode(error) {
  try {
    const descriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      Reflect,
      [error, 'code'],
    );
    return descriptor && OBJECT_HAS_OWN(descriptor, 'value') && typeof descriptor.value === 'string'
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

/**
 * Default-inactive offline composition boundary from an opaque Zenon evidence
 * candidate to one durable service-credit grant. Constructor-fixed provider
 * policy is the sole authority for economic terms, and the constructor-fixed
 * verifier is the sole authority for the complete evidence record. Both are
 * trusted application code. This module does not implement an authenticated
 * evidence producer, authenticate a node, or accept caller-chosen terms or a
 * caller assertion as settlement evidence.
 */
export class ZenonFundingEvidenceActivation {
  #store;
  #getOffer;
  #activateGrantFromTrustedRecord;
  #deriveFundingTerms;
  #verifyFundingEvidence;
  #authority;
  #now;

  constructor(options) {
    const value = exactDataObject(options, [
      'store',
      'deriveFundingTerms',
      'verifyFundingEvidence',
      'authorityProfile',
      'now',
    ], failConfiguration);
    if (value.store === null || typeof value.store !== 'object') failConfiguration();
    let getOffer;
    let activateGrantFromTrustedRecord;
    try {
      getOffer = value.store.getOffer;
      activateGrantFromTrustedRecord = value.store.activateGrantFromTrustedRecord;
    } catch {
      failConfiguration();
    }
    if (
      typeof getOffer !== 'function'
      || typeof activateGrantFromTrustedRecord !== 'function'
      || typeof value.deriveFundingTerms !== 'function'
      || REFLECT_APPLY(IS_PROXY, undefined, [value.deriveFundingTerms])
      || typeof value.verifyFundingEvidence !== 'function'
      || REFLECT_APPLY(IS_PROXY, undefined, [value.verifyFundingEvidence])
      || typeof value.now !== 'function'
      || REFLECT_APPLY(IS_PROXY, undefined, [value.now])
    ) {
      failConfiguration();
    }
    this.#store = value.store;
    this.#getOffer = getOffer;
    this.#activateGrantFromTrustedRecord = activateGrantFromTrustedRecord;
    this.#deriveFundingTerms = value.deriveFundingTerms;
    this.#verifyFundingEvidence = value.verifyFundingEvidence;
    this.#authority = normalizeAuthority(value.authorityProfile);
    this.#now = value.now;
  }

  createFundingResource(input) {
    const value = exactDataObject(input, ['selection', 'resourceUrl']);
    const selection = normalizeFundingSelection(value.selection);
    let storedOffer;
    try {
      storedOffer = REFLECT_APPLY(this.#getOffer, this.#store, [{
        offerId: selection.offerId,
        offerVersion: selection.offerVersion,
      }]);
    } catch {
      failRejected();
    }
    if (storedOffer === null) failRejected();
    const activationOffer = normalizeOffer(storedOffer, selection);
    const { activationIntent, accepted } = deriveProviderTerms(
      this.#deriveFundingTerms,
      this.#authority,
      activationOffer,
      selection,
    );
    const challengeTime = readClock(
      this.#now,
      'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_CLOCK_FAILED',
    );
    if (activationIntent.expiresAt <= challengeTime) failRejected();
    if (
      resourceBinding(activationIntent.resourceId, value.resourceUrl)
      !== activationOffer.resourceBinding
    ) {
      failRejected();
    }
    const funding = fundingCommitment(
      this.#authority,
      activationOffer,
      activationIntent,
      accepted,
    );
    const resource = fundingResource(value.resourceUrl, funding);
    return deepFreeze({
      activationIntent,
      fundingCommitment: funding,
      paymentRequired: {
        x402Version: 2,
        resource,
        accepts: [accepted],
      },
    });
  }

  async activate(input) {
    const value = exactDataObject(input, ['intent', 'paymentRequired', 'fundingEvidence']);
    const activationIntent = normalizeIntent(value.intent);
    const selection = selectionFromIntent(activationIntent);
    exactDataObject(value.paymentRequired, ['x402Version', 'resource', 'accepts']);
    const paymentRequired = snapshotJson(value.paymentRequired);
    try {
      validatePaymentRequired(paymentRequired);
    } catch {
      failRejected();
    }
    if (paymentRequired.accepts.length !== 1) failRejected();
    const accepted = snapshotRequirement(paymentRequired.accepts[0], this.#authority);
    const evidenceCandidate = captureEvidenceCandidate(value.fundingEvidence);

    let storedOffer;
    try {
      storedOffer = REFLECT_APPLY(this.#getOffer, this.#store, [{
        offerId: selection.offerId,
        offerVersion: selection.offerVersion,
      }]);
    } catch {
      failRejected();
    }
    if (storedOffer === null) failRejected();
    const activationOffer = normalizeOffer(storedOffer, selection);
    const authorized = deriveProviderTerms(
      this.#deriveFundingTerms,
      this.#authority,
      activationOffer,
      selection,
    );
    if (
      !sameJson(activationIntent, authorized.activationIntent)
      || !sameJson(accepted, authorized.accepted)
    ) {
      failRejected();
    }
    const expectedFunding = fundingCommitment(
      this.#authority,
      activationOffer,
      authorized.activationIntent,
      authorized.accepted,
    );
    assertFundingResource(
      paymentRequired.resource,
      activationIntent.resourceId,
      activationOffer.resourceBinding,
      expectedFunding,
    );

    const beforeVerification = readClock(
      this.#now,
      'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_CLOCK_FAILED',
    );
    if (activationIntent.expiresAt <= beforeVerification) failRejected();

    let verificationPromise;
    try {
      verificationPromise = REFLECT_APPLY(
        this.#verifyFundingEvidence,
        undefined,
        [evidenceCandidate],
      );
    } catch {
      failRejected();
    }
    const safePromise = safeNativePromise(verificationPromise);
    let verifiedInput;
    try {
      verifiedInput = await safePromise;
    } catch {
      failRejected();
    }
    const verified = captureVerifiedRecord(verifiedInput);

    const afterVerification = readClock(
      this.#now,
      'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_SETTLED_NOT_GRANTED',
    );
    if (activationIntent.expiresAt <= afterVerification) {
      throw failure('SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_SETTLED_NOT_GRANTED');
    }

    const expectedResourceDigest = commitment(
      RESOURCE_DIGEST_DOMAIN,
      paymentRequired.resource,
    );
    const expectedRequirementDigest = commitment(REQUIREMENT_DIGEST_DOMAIN, accepted);
    const expectedIntentDigest = `sha256:${paymentIntentDigest(paymentRequired, accepted)}`;
    if (
      verified.authorityProfileId !== this.#authority.profileId
      || verified.authorityProfileVersion !== this.#authority.profileVersion
      || verified.verifierVersion !== this.#authority.verifierVersion
      || verified.authorityRecordDigest !== this.#authority.recordDigest
      || verified.network !== this.#authority.network
      || !sameJson(verified.chainProfile, this.#authority.chainProfile)
      || verified.payer !== activationIntent.holderId
      || verified.payee !== accepted.payTo
      || verified.asset !== accepted.asset
      || verified.amount !== accepted.amount
      || verified.paymentResourceDigest !== expectedResourceDigest
      || verified.paymentRequirementDigest !== expectedRequirementDigest
      || verified.paymentIntentDigest !== expectedIntentDigest
      || verified.resourceBinding !== activationOffer.resourceBinding
      || verified.offerId !== activationIntent.offerId
      || verified.offerVersion !== activationIntent.offerVersion
      || verified.fundingPolicyId !== activationOffer.fundingPolicyId
      || verified.fundingPolicyVersion !== activationOffer.fundingPolicyVersion
      || verified.capabilityCommitment !== activationIntent.capabilityCommitment
      || verified.totalUnits !== activationIntent.totalUnits
      || verified.expiresAt !== activationIntent.expiresAt
      || verified.grantFundingCommitment !== expectedFunding
      || !sameJson(verified.confirmationPolicy, this.#authority.confirmationPolicy)
    ) {
      failRejected();
    }

    const inclusionAuthorizationDigest = commitment(
      INCLUSION_AUTHORIZATION_DOMAIN,
      {
        state: verified.inclusionEvidence.state,
        transactionHash: verified.inclusionEvidence.transactionHash,
        momentumHeight: verified.inclusionEvidence.momentumHeight,
        momentumHash: verified.inclusionEvidence.momentumHash,
        satisfiedPolicy: {
          policyId: this.#authority.confirmationPolicy.policyId,
          policyVersion: this.#authority.confirmationPolicy.policyVersion,
          minimumConfirmations: this.#authority.confirmationPolicy.minimumConfirmations,
        },
      },
    );
    const sourceSettlementCommitment = commitment(AUTHORITY_SETTLEMENT_DOMAIN, {
      authorityProfileId: this.#authority.profileId,
      authorityProfileVersion: this.#authority.profileVersion,
      authorityRecordDigest: this.#authority.recordDigest,
      transactionId: verified.transactionId,
    });
    const sourceSettlementId = `settlement_${REFLECT_APPLY(
      STRING_SLICE,
      sourceSettlementCommitment,
      ['sha256:'.length],
    )}`;
    const activation = {
      activationVersion: SERVICE_CREDIT_ZENON_ACTIVATION_RECORD_VERSION,
      evidenceVersion: EVIDENCE_VERSION,
      authorityProfileId: this.#authority.profileId,
      authorityProfileVersion: this.#authority.profileVersion,
      verifierVersion: this.#authority.verifierVersion,
      authorityRecordDigest: this.#authority.recordDigest,
      fundingPolicyId: activationOffer.fundingPolicyId,
      fundingPolicyVersion: activationOffer.fundingPolicyVersion,
      sourceSettlementId,
      transactionId: verified.transactionId,
      providerId: activationIntent.providerId,
      serviceId: activationIntent.serviceId,
      resourceId: activationIntent.resourceId,
      resourceBinding: activationOffer.resourceBinding,
      offerId: activationIntent.offerId,
      offerVersion: activationIntent.offerVersion,
      holderId: activationIntent.holderId,
      capabilityCommitment: activationIntent.capabilityCommitment,
      totalUnits: activationIntent.totalUnits,
      expiresAt: activationIntent.expiresAt,
      scheme: accepted.scheme,
      paymentFlow: accepted.extra.paymentFlow,
      network: accepted.network,
      chainProfile: accepted.extra.zenonChain,
      asset: accepted.asset,
      amount: accepted.amount,
      payee: accepted.payTo,
      payer: verified.payer,
      paymentResourceDigest: expectedResourceDigest,
      paymentRequirementDigest: expectedRequirementDigest,
      paymentIntentDigest: expectedIntentDigest,
      grantFundingCommitment: expectedFunding,
      inclusionAuthorizationDigest,
      evidenceState: verified.inclusionEvidence.state,
      confirmationPolicy: this.#authority.confirmationPolicy,
    };

    let grant;
    try {
      grant = REFLECT_APPLY(
        this.#activateGrantFromTrustedRecord,
        this.#store,
        [activation],
      );
    } catch (error) {
      const code = errorCode(error);
      if (code === 'SERVICE_CREDIT_STORE_COMMIT_FAILED') {
        throw failure('SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_OUTCOME_UNKNOWN');
      }
      if (
        code === 'GRANT_IDENTITY_CONFLICT'
        || code === 'OFFER_VERSION_CONFLICT'
        || code === 'OFFER_SCOPE_MISMATCH'
      ) {
        throw failure('SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_CONFLICT');
      }
      throw failure('SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_SETTLED_NOT_GRANTED');
    }
    return deepFreeze({ activation: grant.activation, grant });
  }
}

export function createZenonFundingEvidenceActivation(options) {
  return new ZenonFundingEvidenceActivation(options);
}

export { EVIDENCE_VERSION as ZENON_FUNDING_EVIDENCE_VERSION };
