import { createHash } from 'node:crypto';
import { types as utilTypes } from 'node:util';

const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_JOIN = Array.prototype.join;
const ARRAY_PROTOTYPE = Array.prototype;
const ARRAY_SORT = Array.prototype.sort;
const BUFFER_BYTE_LENGTH = Buffer.byteLength;
const JSON_PARSE = JSON.parse;
const JSON_STRINGIFY = JSON.stringify;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const OBJECT_CREATE = Object.create;
const OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_IS = Object.is;
const OBJECT_IS_FROZEN = Object.isFrozen;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const REFLECT_GET_PROTOTYPE_OF = Reflect.getPrototypeOf;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const REGEXP_TEST = RegExp.prototype.test;
const STRING_INCLUDES = String.prototype.includes;
const IS_PROXY = utilTypes.isProxy;
const NATIVE_SET = Set;
const SET_ADD = NATIVE_SET.prototype.add;
const SET_HAS = NATIVE_SET.prototype.has;
const NATIVE_WEAK_SET = WeakSet;
const WEAK_SET_ADD = NATIVE_WEAK_SET.prototype.add;
const WEAK_SET_HAS = NATIVE_WEAK_SET.prototype.has;
const HASH_PROTOTYPE = REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [createHash('sha256')]);
const HASH_UPDATE = HASH_PROTOTYPE.update;
const HASH_DIGEST = HASH_PROTOTYPE.digest;

export const ZENON_FUNDING_OBSERVER_STATE_SCHEMA_VERSION = 1;
export const ZENON_FUNDING_OBSERVATION_CANDIDATE_TYPE =
  'zenon-funding-observation-candidate';
export const ZENON_FUNDING_OBSERVER_TRUST_CLASSIFICATION =
  'injected-observation-only';
export const ZENON_FUNDING_OBSERVER_STATUS = OBJECT_FREEZE({
  AWAITING_INCLUSION: 'AWAITING_INCLUSION',
  INCLUDED_BELOW_THRESHOLD: 'INCLUDED_BELOW_THRESHOLD',
  THRESHOLD_OBSERVED: 'THRESHOLD_OBSERVED',
  QUARANTINED: 'QUARANTINED',
});

const OBSERVER_RECORD_DOMAIN = 'zenon-x402-funding-observer-record-v1';
const TARGET_BINDING_DOMAIN = 'zenon-x402-funding-observer-target-v1';
const PLAN_DOMAIN = 'zenon-x402-funding-observer-backfill-plan-v1';
const PAGE_DOMAIN = 'zenon-x402-funding-observer-page-v1';
const INCLUSION_AUTHORIZATION_DOMAIN = 'zenon-x402-funding-observer-inclusion-v1';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const COMMITMENT = /^sha256:[0-9a-f]{64}$/;
const LOWERCASE_HASH = /^[0-9a-f]{64}$/;
const TRANSACTION_REFERENCE = /^zenontx:[0-9a-f]{64}$/;
const POSITIVE_DECIMAL = /^[1-9][0-9]*$/;
const MAX_CHAIN_IDENTIFIER = '9007199254740991';
const MAX_ZENON_AMOUNT_DIGITS = 77;
const ZERO_HASH = '0'.repeat(64);
const MAX_PAGE_ENTRIES = 64;
const MAX_BACKFILL_SPAN = 4096;
const MAX_MEMBERS_PER_MOMENTUM = 256;
const MAX_INPUT_BYTES = 512 * 1024;
const MAX_INPUT_NODES = 8192;
const MAX_INPUT_MEMBERS = 8192;
const MAX_INPUT_KEY_BYTES = 64 * 1024;
const MAX_INPUT_STRING_BYTES = 256 * 1024;
const MAX_ARRAY_LENGTH = 4096;
const MAX_DEPTH = 24;
const QUARANTINE_REASONS = OBJECT_FREEZE(new NATIVE_SET([
  'CHECKPOINT_HASH_MISMATCH',
  'CONTEXT_DRIFT',
  'FRONTIER_REPLACEMENT',
  'INCLUSION_DISAPPEARED',
  'INCLUSION_TUPLE_DRIFT',
  'MEMBERSHIP_NOT_LINKED',
  'PAGE_GAP',
  'PAGE_HEIGHT_CONFLICT',
  'PAGE_MEMBER_CONFLICT',
  'PAGE_PARENT_MISMATCH',
  'PLAN_CONTEXT_DRIFT',
  'TARGET_BINDING_DRIFT',
]));

export class ZenonFundingObserverStateError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ZenonFundingObserverStateError';
    this.code = code;
    this.stack = `ZenonFundingObserverStateError: ${code}`;
  }
}

function failure(code) {
  return new ZenonFundingObserverStateError(code);
}

function failInput() {
  throw failure('ZENON_FUNDING_OBSERVER_INVALID_INPUT');
}

function failState() {
  throw failure('ZENON_FUNDING_OBSERVER_INVALID_STATE');
}

function failStaleRevision() {
  throw failure('ZENON_FUNDING_OBSERVER_STALE_REVISION');
}

function byteLength(value) {
  return REFLECT_APPLY(BUFFER_BYTE_LENGTH, Buffer, [value, 'utf8']);
}

function addBudget(budget, key, amount, maximum, onFailure) {
  budget[key] += amount;
  if (budget[key] > maximum) onFailure();
}

function append(array, value) {
  REFLECT_APPLY(OBJECT_DEFINE_PROPERTY, undefined, [array, `${array.length}`, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  }]);
}

function copyJson(input, budget, depth, onFailure) {
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
    if (
      typeof input !== 'object'
      || REFLECT_APPLY(IS_PROXY, undefined, [input])
      || REFLECT_APPLY(WEAK_SET_HAS, budget.seen, [input])
    ) {
      onFailure();
    }
    REFLECT_APPLY(WEAK_SET_ADD, budget.seen, [input]);
    const prototype = REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [input]);
    if (REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [input])) {
      const lengthDescriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [input, 'length'],
      );
      if (
        prototype !== ARRAY_PROTOTYPE
        || !lengthDescriptor
        || lengthDescriptor.enumerable
        || !OBJECT_HAS_OWN(lengthDescriptor, 'value')
        || !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [lengthDescriptor.value])
        || lengthDescriptor.value < 0
        || lengthDescriptor.value > MAX_ARRAY_LENGTH
      ) {
        onFailure();
      }
      const length = lengthDescriptor.value;
      const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [input]);
      if (keys.length !== length + 1 || keys[keys.length - 1] !== 'length') onFailure();
      addBudget(budget, 'members', length, MAX_INPUT_MEMBERS, onFailure);
      const copy = [];
      for (let index = 0; index < length; index += 1) {
        const key = `${index}`;
        if (keys[index] !== key) onFailure();
        addBudget(budget, 'keyBytes', byteLength(key), MAX_INPUT_KEY_BYTES, onFailure);
        const descriptor = REFLECT_APPLY(
          REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
          Reflect,
          [input, key],
        );
        if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) onFailure();
        append(copy, copyJson(descriptor.value, budget, depth + 1, onFailure));
      }
      return copy;
    }
    if (prototype !== OBJECT_PROTOTYPE) onFailure();
    // This is an internal state contract, not an ingress parser. Its caller
    // must bound serialized/body size before materializing a plain object,
    // because Reflect.ownKeys cannot prebound an already-created key set.
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
        || key.length > MAX_INPUT_KEY_BYTES
      ) {
        onFailure();
      }
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
    if (error instanceof ZenonFundingObserverStateError) throw error;
    onFailure();
  }
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return REFLECT_APPLY(JSON_STRINGIFY, JSON, [value]);
  }
  if (REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [value])) {
    const values = [];
    for (let index = 0; index < value.length; index += 1) {
      append(values, canonicalJson(value[index]));
    }
    return `[${REFLECT_APPLY(ARRAY_JOIN, values, [','])}]`;
  }
  const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [value]);
  REFLECT_APPLY(ARRAY_SORT, keys, []);
  const values = [];
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    append(values, `${REFLECT_APPLY(JSON_STRINGIFY, JSON, [key])}:${canonicalJson(value[key])}`);
  }
  return `{${REFLECT_APPLY(ARRAY_JOIN, values, [','])}}`;
}

function deepFreeze(value) {
  if (
    value !== null
    && typeof value === 'object'
    && !REFLECT_APPLY(OBJECT_IS_FROZEN, Object, [value])
  ) {
    const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [value]);
    for (let index = 0; index < keys.length; index += 1) {
      const descriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [value, keys[index]],
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

function exactObject(input, keys, onFailure = failInput) {
  if (
    input === null
    || typeof input !== 'object'
    || REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [input])
    || REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [input]) !== OBJECT_PROTOTYPE
  ) {
    onFailure();
  }
  const observed = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [input]);
  if (observed.length !== keys.length) onFailure();
  for (let index = 0; index < keys.length; index += 1) {
    if (!OBJECT_HAS_OWN(input, keys[index])) onFailure();
  }
  for (let index = 0; index < observed.length; index += 1) {
    let allowed = false;
    for (let expected = 0; expected < keys.length; expected += 1) {
      if (observed[index] === keys[expected]) allowed = true;
    }
    if (!allowed) onFailure();
  }
  return input;
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
    || REFLECT_APPLY(STRING_INCLUDES, value, ['://'])
  ) {
    onFailure();
  }
}

function assertCommitment(value, onFailure = failInput) {
  if (typeof value !== 'string' || !REFLECT_APPLY(REGEXP_TEST, COMMITMENT, [value])) {
    onFailure();
  }
}

function assertHash(value, onFailure = failInput) {
  if (
    typeof value !== 'string'
    || !REFLECT_APPLY(REGEXP_TEST, LOWERCASE_HASH, [value])
    || value === ZERO_HASH
  ) {
    onFailure();
  }
}

function assertTransactionId(value, onFailure = failInput) {
  if (
    typeof value !== 'string'
    || !REFLECT_APPLY(REGEXP_TEST, TRANSACTION_REFERENCE, [value])
  ) {
    onFailure();
  }
}

function assertPositiveInteger(value, onFailure = failInput) {
  if (!REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [value]) || value <= 0) onFailure();
}

function assertNonnegativeInteger(value, onFailure = failInput) {
  if (!REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [value]) || value < 0) onFailure();
}

function normalizeObserverPolicy(input, onFailure = failInput) {
  const value = exactObject(input, ['policyId', 'policyVersion', 'verifierVersion'], onFailure);
  assertIdentifier(value.policyId, onFailure);
  assertPositiveInteger(value.policyVersion, onFailure);
  assertPositiveInteger(value.verifierVersion, onFailure);
  return deepFreeze({ ...value });
}

function normalizeAuthorityGeneration(input, onFailure = failInput) {
  const value = exactObject(
    input,
    ['generationId', 'generationVersion', 'generationCommitment'],
    onFailure,
  );
  assertIdentifier(value.generationId, onFailure);
  assertPositiveInteger(value.generationVersion, onFailure);
  assertCommitment(value.generationCommitment, onFailure);
  return deepFreeze({ ...value });
}

function normalizeChainProfile(input, onFailure = failInput) {
  const value = exactObject(
    input,
    ['version', 'chainIdentifier', 'genesisMomentumHash'],
    onFailure,
  );
  if (
    value.version !== 1
    || typeof value.chainIdentifier !== 'string'
    || !REFLECT_APPLY(REGEXP_TEST, POSITIVE_DECIMAL, [value.chainIdentifier])
    || value.chainIdentifier.length > MAX_CHAIN_IDENTIFIER.length
    || (
      value.chainIdentifier.length === MAX_CHAIN_IDENTIFIER.length
      && value.chainIdentifier > MAX_CHAIN_IDENTIFIER
    )
  ) {
    onFailure();
  }
  assertHash(value.genesisMomentumHash, onFailure);
  return deepFreeze({ ...value });
}

function normalizeConfirmationPolicy(input, onFailure = failInput) {
  const value = exactObject(
    input,
    ['policyId', 'policyVersion', 'minimumConfirmations'],
    onFailure,
  );
  assertIdentifier(value.policyId, onFailure);
  assertPositiveInteger(value.policyVersion, onFailure);
  assertPositiveInteger(value.minimumConfirmations, onFailure);
  return deepFreeze({ ...value });
}

function normalizeCheckpoint(input, onFailure = failInput) {
  const value = exactObject(input, ['height', 'hash'], onFailure);
  assertNonnegativeInteger(value.height, onFailure);
  assertHash(value.hash, onFailure);
  return deepFreeze({ ...value });
}

function normalizeTarget(input, onFailure = failInput) {
  const keys = [
    'transactionId',
    'payer',
    'payee',
    'asset',
    'amount',
    'scheme',
    'paymentFlow',
    'settlement',
    'network',
    'providerId',
    'serviceId',
    'resourceId',
    'resourceBinding',
    'paymentResourceDigest',
    'paymentRequirementDigest',
    'paymentIntentDigest',
    'offerId',
    'offerVersion',
    'fundingPolicyId',
    'fundingPolicyVersion',
    'capabilityCommitment',
    'totalUnits',
    'expiresAt',
    'grantFundingCommitment',
  ];
  const value = exactObject(input, keys, onFailure);
  assertTransactionId(value.transactionId, onFailure);
  for (const field of [
    'payer',
    'payee',
    'asset',
    'providerId',
    'serviceId',
    'resourceId',
    'offerId',
    'fundingPolicyId',
  ]) {
    assertIdentifier(value[field], onFailure);
  }
  if (
    typeof value.amount !== 'string'
    || !REFLECT_APPLY(REGEXP_TEST, POSITIVE_DECIMAL, [value.amount])
    || value.amount.length > MAX_ZENON_AMOUNT_DIGITS
    || value.scheme !== 'exact'
    || value.paymentFlow !== 'upfront'
    || value.settlement !== 'account-block'
    || value.network !== 'zenon:testnet'
  ) {
    onFailure();
  }
  for (const field of [
    'resourceBinding',
    'paymentResourceDigest',
    'paymentRequirementDigest',
    'paymentIntentDigest',
    'capabilityCommitment',
    'grantFundingCommitment',
  ]) {
    assertCommitment(value[field], onFailure);
  }
  assertPositiveInteger(value.offerVersion, onFailure);
  assertPositiveInteger(value.fundingPolicyVersion, onFailure);
  assertPositiveInteger(value.totalUnits, onFailure);
  assertPositiveInteger(value.expiresAt, onFailure);
  return deepFreeze({ ...value });
}

function normalizeCatchUpConfiguration(input, onFailure = failInput) {
  const value = exactObject(
    input,
    ['maximumPageEntries', 'maximumBackfillSpan', 'maximumMembersPerMomentum'],
    onFailure,
  );
  assertPositiveInteger(value.maximumPageEntries, onFailure);
  assertPositiveInteger(value.maximumBackfillSpan, onFailure);
  assertPositiveInteger(value.maximumMembersPerMomentum, onFailure);
  if (
    value.maximumPageEntries > MAX_PAGE_ENTRIES
    || value.maximumBackfillSpan > MAX_BACKFILL_SPAN
    || value.maximumMembersPerMomentum > MAX_MEMBERS_PER_MOMENTUM
  ) {
    onFailure();
  }
  return deepFreeze({ ...value });
}

function normalizeMembership(input, onFailure = failState) {
  const value = exactObject(
    input,
    ['transactionId', 'targetBindingDigest', 'momentumHeight', 'momentumHash'],
    onFailure,
  );
  assertTransactionId(value.transactionId, onFailure);
  assertCommitment(value.targetBindingDigest, onFailure);
  assertPositiveInteger(value.momentumHeight, onFailure);
  assertHash(value.momentumHash, onFailure);
  return deepFreeze({ ...value });
}

function normalizeLastAppliedPage(input, onFailure = failState) {
  if (input === null) return null;
  const value = exactObject(input, [
    'planId',
    'pageDigest',
    'startCheckpoint',
    'endCheckpoint',
    'frontier',
    'entryCount',
    'lineage',
    'targetMembership',
    'thresholdCheckpoint',
  ], onFailure);
  assertCommitment(value.planId, onFailure);
  assertCommitment(value.pageDigest, onFailure);
  const startCheckpoint = normalizeCheckpoint(value.startCheckpoint, onFailure);
  const endCheckpoint = normalizeCheckpoint(value.endCheckpoint, onFailure);
  const frontier = normalizeCheckpoint(value.frontier, onFailure);
  assertPositiveInteger(value.entryCount, onFailure);
  if (
    endCheckpoint.height <= startCheckpoint.height
    || endCheckpoint.height - startCheckpoint.height !== value.entryCount
    || frontier.height < endCheckpoint.height
    || !REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [value.lineage])
    || value.lineage.length !== value.entryCount
    || value.lineage.length > MAX_PAGE_ENTRIES
  ) {
    onFailure();
  }
  const lineage = [];
  for (let index = 0; index < value.lineage.length; index += 1) {
    const entry = exactObject(
      value.lineage[index],
      ['height', 'hash', 'previousHash'],
      onFailure,
    );
    assertPositiveInteger(entry.height, onFailure);
    assertHash(entry.hash, onFailure);
    assertHash(entry.previousHash, onFailure);
    append(lineage, deepFreeze({ ...entry }));
  }
  const targetMembership = value.targetMembership === null
    ? null
    : normalizeMembership(value.targetMembership, onFailure);
  const thresholdCheckpoint = value.thresholdCheckpoint === null
    ? null
    : normalizeCheckpoint(value.thresholdCheckpoint, onFailure);
  return deepFreeze({
    planId: value.planId,
    pageDigest: value.pageDigest,
    startCheckpoint,
    endCheckpoint,
    frontier,
    entryCount: value.entryCount,
    lineage: deepFreeze(lineage),
    targetMembership,
    thresholdCheckpoint,
  });
}

function normalizeCatchUpState(input, onFailure = failState) {
  const value = exactObject(input, [
    'maximumPageEntries',
    'maximumBackfillSpan',
    'maximumMembersPerMomentum',
    'lastAppliedPage',
  ], onFailure);
  const configuration = normalizeCatchUpConfiguration({
    maximumPageEntries: value.maximumPageEntries,
    maximumBackfillSpan: value.maximumBackfillSpan,
    maximumMembersPerMomentum: value.maximumMembersPerMomentum,
  }, onFailure);
  return deepFreeze({
    ...configuration,
    lastAppliedPage: normalizeLastAppliedPage(value.lastAppliedPage, onFailure),
  });
}

function inclusionAuthorizationId(observerRecordId, transactionId, momentumHeight, momentumHash, threshold) {
  return commitment(INCLUSION_AUTHORIZATION_DOMAIN, {
    observerRecordId,
    transactionId,
    momentumHeight,
    momentumHash,
    threshold,
  });
}

function normalizeInclusion(input, observerRecordId, threshold, onFailure = failState) {
  if (input === null) return null;
  const value = exactObject(input, [
    'transactionId',
    'targetBindingDigest',
    'momentumHeight',
    'momentumHash',
    'inclusionAuthorizationId',
    'currentConfirmations',
  ], onFailure);
  const membership = normalizeMembership({
    transactionId: value.transactionId,
    targetBindingDigest: value.targetBindingDigest,
    momentumHeight: value.momentumHeight,
    momentumHash: value.momentumHash,
  }, onFailure);
  assertCommitment(value.inclusionAuthorizationId, onFailure);
  assertPositiveInteger(value.currentConfirmations, onFailure);
  const expected = inclusionAuthorizationId(
    observerRecordId,
    membership.transactionId,
    membership.momentumHeight,
    membership.momentumHash,
    threshold,
  );
  if (value.inclusionAuthorizationId !== expected) onFailure();
  return deepFreeze({
    ...membership,
    inclusionAuthorizationId: value.inclusionAuthorizationId,
    currentConfirmations: value.currentConfirmations,
  });
}

function normalizeFirstThreshold(input, onFailure = failState) {
  if (input === null) return null;
  const value = exactObject(
    input,
    ['checkpoint', 'confirmations', 'lineageReceipt'],
    onFailure,
  );
  const checkpoint = normalizeCheckpoint(value.checkpoint, onFailure);
  assertPositiveInteger(value.confirmations, onFailure);
  const lineageReceipt = normalizeLastAppliedPage(value.lineageReceipt, onFailure);
  if (lineageReceipt === null) onFailure();
  return deepFreeze({ checkpoint, confirmations: value.confirmations, lineageReceipt });
}

function normalizeQuarantine(input, onFailure = failState) {
  if (input === null) return null;
  const value = exactObject(input, ['reason'], onFailure);
  if (!REFLECT_APPLY(SET_HAS, QUARANTINE_REASONS, [value.reason])) onFailure();
  return deepFreeze({ reason: value.reason });
}

function observerRecordId(observerPolicy, authorityGeneration, chainProfile, confirmationPolicy, transactionId) {
  return commitment(OBSERVER_RECORD_DOMAIN, {
    schemaVersion: ZENON_FUNDING_OBSERVER_STATE_SCHEMA_VERSION,
    observerPolicy,
    authorityGeneration,
    chainProfile,
    confirmationPolicy,
    transactionId,
  });
}

function pageReceiptDigest(receipt, {
  observerRecordId: recordId,
  targetBindingDigest,
  authorityGeneration,
  chainProfile,
}) {
  return commitment(PAGE_DOMAIN, {
    pageVersion: 1,
    observerRecordId: recordId,
    targetBindingDigest,
    authorityGeneration,
    chainProfile,
    planId: receipt.planId,
    startCheckpoint: receipt.startCheckpoint,
    endCheckpoint: receipt.endCheckpoint,
    frontier: receipt.frontier,
    entryCount: receipt.entryCount,
    lineage: receipt.lineage,
    targetMembership: receipt.targetMembership,
  });
}

function validatePageReceipt(receipt, {
  observerRecordId: recordId,
  targetBindingDigest,
  authorityGeneration,
  chainProfile,
  confirmationPolicy,
  target,
  catchUp,
  inclusion,
}, onFailure = failState) {
  const planData = {
    planVersion: 1,
    observerRecordId: recordId,
    targetBindingDigest,
    authorityGeneration,
    chainProfile,
    startCheckpoint: receipt.startCheckpoint,
    frontier: receipt.frontier,
    fromHeight: receipt.startCheckpoint.height + 1,
    throughHeight: receipt.endCheckpoint.height,
    entryCount: receipt.entryCount,
  };
  const boundedThroughHeight = Math.min(
    receipt.frontier.height,
    receipt.startCheckpoint.height + catchUp.maximumPageEntries,
    receipt.startCheckpoint.height + catchUp.maximumBackfillSpan,
  );
  if (
    receipt.planId !== commitment(PLAN_DOMAIN, planData)
    || receipt.pageDigest !== pageReceiptDigest(receipt, {
      observerRecordId: recordId,
      targetBindingDigest,
      authorityGeneration,
      chainProfile,
    })
    || receipt.endCheckpoint.height !== boundedThroughHeight
    || receipt.lineage.length !== receipt.entryCount
    || receipt.lineage.length > catchUp.maximumPageEntries
    || (
      receipt.endCheckpoint.height === receipt.frontier.height
      && receipt.endCheckpoint.hash !== receipt.frontier.hash
    )
  ) {
    onFailure();
  }
  let previousHash = receipt.startCheckpoint.hash;
  for (let index = 0; index < receipt.lineage.length; index += 1) {
    const entry = receipt.lineage[index];
    if (
      entry.height !== receipt.startCheckpoint.height + index + 1
      || entry.previousHash !== previousHash
    ) {
      onFailure();
    }
    previousHash = entry.hash;
  }
  const lastEntry = receipt.lineage[receipt.lineage.length - 1];
  if (
    lastEntry.height !== receipt.endCheckpoint.height
    || lastEntry.hash !== receipt.endCheckpoint.hash
  ) {
    onFailure();
  }
  if (receipt.targetMembership !== null) {
    let linkedEntry = null;
    for (let index = 0; index < receipt.lineage.length; index += 1) {
      if (receipt.lineage[index].height === receipt.targetMembership.momentumHeight) {
        linkedEntry = receipt.lineage[index];
      }
    }
    if (
      receipt.targetMembership.transactionId !== target.transactionId
      || receipt.targetMembership.targetBindingDigest !== targetBindingDigest
      || receipt.targetMembership.momentumHeight <= receipt.startCheckpoint.height
      || receipt.targetMembership.momentumHeight > receipt.endCheckpoint.height
      || linkedEntry === null
      || receipt.targetMembership.momentumHash !== linkedEntry.hash
    ) {
      onFailure();
    }
  }
  const membership = receipt.targetMembership ?? inclusion;
  if (receipt.thresholdCheckpoint !== null) {
    const derivedConfirmations = membership === null
      ? 0
      : receipt.endCheckpoint.height - membership.momentumHeight + 1;
    if (
      membership === null
      || derivedConfirmations < confirmationPolicy.minimumConfirmations
      || receipt.thresholdCheckpoint.height <= receipt.startCheckpoint.height
      || !sameJson(receipt.thresholdCheckpoint, receipt.endCheckpoint)
    ) {
      onFailure();
    }
  }
}

function normalizeStateSnapshot(input) {
  const value = exactObject(input, [
    'schemaVersion',
    'revision',
    'observerPolicy',
    'authorityGeneration',
    'observerRecordId',
    'chainProfile',
    'confirmationPolicy',
    'target',
    'targetBindingDigest',
    'checkpoint',
    'catchUp',
    'status',
    'inclusion',
    'firstThreshold',
    'trustClassification',
    'quarantine',
  ], failState);
  if (value.schemaVersion !== ZENON_FUNDING_OBSERVER_STATE_SCHEMA_VERSION) failState();
  assertNonnegativeInteger(value.revision, failState);
  const observerPolicy = normalizeObserverPolicy(value.observerPolicy, failState);
  const authorityGeneration = normalizeAuthorityGeneration(value.authorityGeneration, failState);
  const chainProfile = normalizeChainProfile(value.chainProfile, failState);
  const confirmationPolicy = normalizeConfirmationPolicy(value.confirmationPolicy, failState);
  const target = normalizeTarget(value.target, failState);
  assertCommitment(value.observerRecordId, failState);
  assertCommitment(value.targetBindingDigest, failState);
  const expectedObserverRecordId = observerRecordId(
    observerPolicy,
    authorityGeneration,
    chainProfile,
    confirmationPolicy,
    target.transactionId,
  );
  if (
    value.observerRecordId !== expectedObserverRecordId
    || value.targetBindingDigest !== commitment(TARGET_BINDING_DOMAIN, target)
    || value.trustClassification !== ZENON_FUNDING_OBSERVER_TRUST_CLASSIFICATION
  ) {
    failState();
  }
  const checkpoint = normalizeCheckpoint(value.checkpoint, failState);
  const catchUp = normalizeCatchUpState(value.catchUp, failState);
  const receipt = catchUp.lastAppliedPage;
  if (
    receipt !== null
    && !sameJson(receipt.endCheckpoint, checkpoint)
  ) {
    failState();
  }
  const inclusion = normalizeInclusion(
    value.inclusion,
    value.observerRecordId,
    confirmationPolicy.minimumConfirmations,
    failState,
  );
  const firstThreshold = normalizeFirstThreshold(value.firstThreshold, failState);
  const quarantine = normalizeQuarantine(value.quarantine, failState);
  const receiptContext = {
    observerRecordId: value.observerRecordId,
    targetBindingDigest: value.targetBindingDigest,
    authorityGeneration,
    chainProfile,
    confirmationPolicy,
    target,
    catchUp,
    inclusion,
  };
  if (receipt !== null) validatePageReceipt(receipt, receiptContext, failState);
  if (
    value.status !== ZENON_FUNDING_OBSERVER_STATUS.AWAITING_INCLUSION
    && value.status !== ZENON_FUNDING_OBSERVER_STATUS.INCLUDED_BELOW_THRESHOLD
    && value.status !== ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED
    && value.status !== ZENON_FUNDING_OBSERVER_STATUS.QUARANTINED
  ) {
    failState();
  }
  if (inclusion !== null) {
    if (
      inclusion.transactionId !== target.transactionId
      || inclusion.targetBindingDigest !== value.targetBindingDigest
      || inclusion.momentumHeight > checkpoint.height
      || inclusion.currentConfirmations !== checkpoint.height - inclusion.momentumHeight + 1
    ) {
      failState();
    }
  }
  if (firstThreshold !== null) {
    const derivedFirstThresholdConfirmations = inclusion === null
      ? 0
      : firstThreshold.checkpoint.height - inclusion.momentumHeight + 1;
    if (
      inclusion === null
      || firstThreshold.confirmations !== derivedFirstThresholdConfirmations
      || firstThreshold.confirmations < confirmationPolicy.minimumConfirmations
      || firstThreshold.checkpoint.height > checkpoint.height
      || !sameJson(
        firstThreshold.lineageReceipt.thresholdCheckpoint,
        firstThreshold.checkpoint,
      )
      || !sameJson(
        firstThreshold.lineageReceipt.endCheckpoint,
        firstThreshold.checkpoint,
      )
    ) {
      failState();
    }
    validatePageReceipt(firstThreshold.lineageReceipt, receiptContext, failState);
    const thresholdMembership = firstThreshold.lineageReceipt.targetMembership ?? inclusion;
    if (
      thresholdMembership === null
      || thresholdMembership.momentumHeight !== inclusion.momentumHeight
      || thresholdMembership.momentumHash !== inclusion.momentumHash
      || thresholdMembership.transactionId !== inclusion.transactionId
      || thresholdMembership.targetBindingDigest !== inclusion.targetBindingDigest
    ) {
      failState();
    }
  } else if (
    inclusion !== null
    && inclusion.currentConfirmations >= confirmationPolicy.minimumConfirmations
  ) {
    failState();
  }
  if (receipt !== null) {
    const receiptMembership = receipt.targetMembership ?? inclusion;
    const receiptMeetsThreshold = (
      receiptMembership !== null
      && receipt.endCheckpoint.height - receiptMembership.momentumHeight + 1
        >= confirmationPolicy.minimumConfirmations
    );
    const receiptIsFirstThreshold = (
      firstThreshold !== null
      && sameJson(receipt, firstThreshold.lineageReceipt)
    );
    const thresholdReceiptExpected = firstThreshold === null
      ? receiptMeetsThreshold
      : receiptIsFirstThreshold;
    if ((receipt.thresholdCheckpoint !== null) !== thresholdReceiptExpected) failState();
  }
  if (receipt !== null && receipt.targetMembership !== null) {
    if (
      inclusion !== null
      && (
        receipt.targetMembership.momentumHeight !== inclusion.momentumHeight
        || receipt.targetMembership.momentumHash !== inclusion.momentumHash
      )
    ) {
      failState();
    }
  }
  if (
    receipt !== null
    && receipt.thresholdCheckpoint !== null
    && firstThreshold !== null
    && !sameJson(receipt.thresholdCheckpoint, firstThreshold.checkpoint)
  ) {
    failState();
  }
  if (value.status === ZENON_FUNDING_OBSERVER_STATUS.AWAITING_INCLUSION) {
    if (inclusion !== null || firstThreshold !== null || quarantine !== null) failState();
  } else if (value.status === ZENON_FUNDING_OBSERVER_STATUS.INCLUDED_BELOW_THRESHOLD) {
    if (
      inclusion === null
      || inclusion.currentConfirmations >= confirmationPolicy.minimumConfirmations
      || firstThreshold !== null
      || quarantine !== null
    ) {
      failState();
    }
  } else if (value.status === ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED) {
    if (
      inclusion === null
      || inclusion.currentConfirmations < confirmationPolicy.minimumConfirmations
      || firstThreshold === null
      || quarantine !== null
    ) {
      failState();
    }
  } else {
    if (quarantine === null) failState();
    if (
      (inclusion === null && firstThreshold !== null)
      || (
        inclusion !== null
        && inclusion.currentConfirmations < confirmationPolicy.minimumConfirmations
        && firstThreshold !== null
      )
    ) {
      failState();
    }
  }
  return deepFreeze({
    schemaVersion: ZENON_FUNDING_OBSERVER_STATE_SCHEMA_VERSION,
    revision: value.revision,
    observerPolicy,
    authorityGeneration,
    observerRecordId: value.observerRecordId,
    chainProfile,
    confirmationPolicy,
    target,
    targetBindingDigest: value.targetBindingDigest,
    checkpoint,
    catchUp,
    status: value.status,
    inclusion,
    firstThreshold,
    trustClassification: ZENON_FUNDING_OBSERVER_TRUST_CLASSIFICATION,
    quarantine,
  });
}

function normalizeState(input) {
  try {
    return normalizeStateSnapshot(snapshotJson(input, failState));
  } catch (error) {
    if (error instanceof ZenonFundingObserverStateError) throw error;
    failState();
  }
}

function cloneState(state, changes) {
  return normalizeStateSnapshot({ ...state, ...changes });
}

function quarantineState(state, reason) {
  if (state.status === ZENON_FUNDING_OBSERVER_STATUS.QUARANTINED) return state;
  return cloneState(state, {
    revision: state.revision + 1,
    status: ZENON_FUNDING_OBSERVER_STATUS.QUARANTINED,
    quarantine: { reason },
  });
}

function result(state, disposition, plan = undefined) {
  const value = plan === undefined ? { state, disposition } : { state, disposition, plan };
  return deepFreeze(value);
}

function assertExpectedRevision(state, expectedRevision) {
  assertNonnegativeInteger(expectedRevision);
  if (expectedRevision !== state.revision) failStaleRevision();
}

function contextMatches(state, input) {
  return (
    input.observerRecordId === state.observerRecordId
    && input.targetBindingDigest === state.targetBindingDigest
    && sameJson(input.authorityGeneration, state.authorityGeneration)
    && sameJson(input.chainProfile, state.chainProfile)
  );
}

function normalizeContext(value, onFailure = failInput) {
  assertCommitment(value.observerRecordId, onFailure);
  assertCommitment(value.targetBindingDigest, onFailure);
  return deepFreeze({
    observerRecordId: value.observerRecordId,
    targetBindingDigest: value.targetBindingDigest,
    authorityGeneration: normalizeAuthorityGeneration(value.authorityGeneration, onFailure),
    chainProfile: normalizeChainProfile(value.chainProfile, onFailure),
  });
}

function normalizeSource(input) {
  if (input?.status === 'UNAVAILABLE') {
    const value = exactObject(input, ['status', 'reason']);
    if (value.reason !== 'TIMEOUT' && value.reason !== 'UNAVAILABLE') failInput();
    return deepFreeze({ ...value });
  }
  const value = exactObject(input, ['status', 'frontier', 'checkpointHash']);
  if (value.status !== 'AVAILABLE') failInput();
  const frontier = normalizeCheckpoint(value.frontier);
  if (value.checkpointHash !== null) assertHash(value.checkpointHash);
  return deepFreeze({ status: value.status, frontier, checkpointHash: value.checkpointHash });
}

function makePlan(state, frontier) {
  const fromHeight = state.checkpoint.height + 1;
  const maximumThrough = Math.min(
    state.checkpoint.height + state.catchUp.maximumPageEntries,
    state.checkpoint.height + state.catchUp.maximumBackfillSpan,
  );
  const throughHeight = Math.min(frontier.height, maximumThrough);
  const planData = {
    planVersion: 1,
    observerRecordId: state.observerRecordId,
    targetBindingDigest: state.targetBindingDigest,
    authorityGeneration: state.authorityGeneration,
    chainProfile: state.chainProfile,
    startCheckpoint: state.checkpoint,
    frontier,
    fromHeight,
    throughHeight,
    entryCount: throughHeight - fromHeight + 1,
  };
  return deepFreeze({
    ...planData,
    planId: commitment(PLAN_DOMAIN, planData),
  });
}

function makeDetachedPlan(state, frontier) {
  return normalizePlan(snapshotJson(makePlan(state, frontier)));
}

function normalizePlan(input) {
  const value = exactObject(input, [
    'planVersion',
    'observerRecordId',
    'targetBindingDigest',
    'authorityGeneration',
    'chainProfile',
    'startCheckpoint',
    'frontier',
    'fromHeight',
    'throughHeight',
    'entryCount',
    'planId',
  ]);
  if (value.planVersion !== 1) failInput();
  const context = normalizeContext(value);
  const startCheckpoint = normalizeCheckpoint(value.startCheckpoint);
  const frontier = normalizeCheckpoint(value.frontier);
  assertPositiveInteger(value.fromHeight);
  assertPositiveInteger(value.throughHeight);
  assertPositiveInteger(value.entryCount);
  assertCommitment(value.planId);
  const normalized = {
    planVersion: 1,
    ...context,
    startCheckpoint,
    frontier,
    fromHeight: value.fromHeight,
    throughHeight: value.throughHeight,
    entryCount: value.entryCount,
  };
  if (value.planId !== commitment(PLAN_DOMAIN, normalized)) failInput();
  return deepFreeze({ ...normalized, planId: value.planId });
}

function normalizeMember(input) {
  const value = exactObject(input, ['transactionId', 'targetBindingDigest']);
  assertTransactionId(value.transactionId);
  assertCommitment(value.targetBindingDigest);
  return deepFreeze({ ...value });
}

function normalizePage(input, state) {
  const value = exactObject(input, [
    'pageVersion',
    'observerRecordId',
    'targetBindingDigest',
    'authorityGeneration',
    'chainProfile',
    'planId',
    'startCheckpoint',
    'frontier',
    'entries',
  ]);
  if (value.pageVersion !== 1) failInput();
  const pageContext = normalizeContext(value);
  assertCommitment(value.planId);
  const startCheckpoint = normalizeCheckpoint(value.startCheckpoint);
  const frontier = normalizeCheckpoint(value.frontier);
  if (!REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [value.entries])) failInput();
  if (value.entries.length === 0 || value.entries.length > state.catchUp.maximumPageEntries) {
    failInput();
  }
  const entries = [];
  let totalMembers = 0;
  for (let index = 0; index < value.entries.length; index += 1) {
    const raw = exactObject(value.entries[index], ['height', 'hash', 'previousHash', 'members']);
    assertPositiveInteger(raw.height);
    assertHash(raw.hash);
    assertHash(raw.previousHash);
    if (
      !REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [raw.members])
      || raw.members.length > state.catchUp.maximumMembersPerMomentum
    ) {
      failInput();
    }
    totalMembers += raw.members.length;
    if (totalMembers > MAX_INPUT_MEMBERS) failInput();
    const members = [];
    for (let memberIndex = 0; memberIndex < raw.members.length; memberIndex += 1) {
      append(members, normalizeMember(raw.members[memberIndex]));
    }
    append(entries, deepFreeze({
      height: raw.height,
      hash: raw.hash,
      previousHash: raw.previousHash,
      members: deepFreeze(members),
    }));
  }
  return deepFreeze({
    pageVersion: 1,
    ...pageContext,
    planId: value.planId,
    startCheckpoint,
    frontier,
    entries: deepFreeze(entries),
  });
}

function updateIncludedState(state, checkpoint, catchUp) {
  if (state.inclusion === null) {
    return cloneState(state, {
      revision: state.revision + 1,
      checkpoint,
      catchUp,
    });
  }
  const currentConfirmations = checkpoint.height - state.inclusion.momentumHeight + 1;
  if (currentConfirmations < state.inclusion.currentConfirmations) {
    return quarantineState(state, 'INCLUSION_TUPLE_DRIFT');
  }
  const inclusion = deepFreeze({ ...state.inclusion, currentConfirmations });
  let firstThreshold = state.firstThreshold;
  if (
    firstThreshold === null
    && currentConfirmations >= state.confirmationPolicy.minimumConfirmations
  ) {
    if (!sameJson(catchUp.lastAppliedPage?.thresholdCheckpoint, checkpoint)) {
      return quarantineState(state, 'PAGE_GAP');
    }
    firstThreshold = deepFreeze({
      checkpoint,
      confirmations: currentConfirmations,
      lineageReceipt: catchUp.lastAppliedPage,
    });
  }
  return cloneState(state, {
    revision: state.revision + 1,
    checkpoint,
    catchUp,
    status: firstThreshold === null
      ? ZENON_FUNDING_OBSERVER_STATUS.INCLUDED_BELOW_THRESHOLD
      : ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED,
    inclusion,
    firstThreshold,
  });
}

export function createZenonFundingObserverState(input) {
  const value = exactObject(snapshotJson(input), [
    'observerPolicy',
    'authorityGeneration',
    'chainProfile',
    'confirmationPolicy',
    'target',
    'checkpoint',
    'catchUp',
  ]);
  const observerPolicy = normalizeObserverPolicy(value.observerPolicy);
  const authorityGeneration = normalizeAuthorityGeneration(value.authorityGeneration);
  const chainProfile = normalizeChainProfile(value.chainProfile);
  const confirmationPolicy = normalizeConfirmationPolicy(value.confirmationPolicy);
  const normalizedTarget = normalizeTarget(value.target);
  const checkpoint = normalizeCheckpoint(value.checkpoint);
  const catchUpConfiguration = normalizeCatchUpConfiguration(value.catchUp);
  const recordId = observerRecordId(
    observerPolicy,
    authorityGeneration,
    chainProfile,
    confirmationPolicy,
    normalizedTarget.transactionId,
  );
  return normalizeStateSnapshot({
    schemaVersion: ZENON_FUNDING_OBSERVER_STATE_SCHEMA_VERSION,
    revision: 0,
    observerPolicy,
    authorityGeneration,
    observerRecordId: recordId,
    chainProfile,
    confirmationPolicy,
    target: normalizedTarget,
    targetBindingDigest: commitment(TARGET_BINDING_DOMAIN, normalizedTarget),
    checkpoint,
    catchUp: { ...catchUpConfiguration, lastAppliedPage: null },
    status: ZENON_FUNDING_OBSERVER_STATUS.AWAITING_INCLUSION,
    inclusion: null,
    firstThreshold: null,
    trustClassification: ZENON_FUNDING_OBSERVER_TRUST_CLASSIFICATION,
    quarantine: null,
  });
}

export function planZenonFundingObserverBackfill(input) {
  const value = exactObject(snapshotJson(input), [
    'state',
    'expectedRevision',
    'observerRecordId',
    'targetBindingDigest',
    'authorityGeneration',
    'chainProfile',
    'source',
  ]);
  const state = normalizeStateSnapshot(value.state);
  assertExpectedRevision(state, value.expectedRevision);
  const suppliedContext = normalizeContext(value);
  if (state.status === ZENON_FUNDING_OBSERVER_STATUS.QUARANTINED) {
    return result(state, 'QUARANTINED', null);
  }
  if (!contextMatches(state, suppliedContext)) {
    return result(quarantineState(state, 'CONTEXT_DRIFT'), 'QUARANTINED', null);
  }
  const source = normalizeSource(value.source);
  if (source.status === 'UNAVAILABLE') return result(state, 'SOURCE_UNAVAILABLE', null);
  if (source.frontier.height < state.checkpoint.height) {
    if (source.checkpointHash !== null) failInput();
    return result(state, 'SOURCE_BEHIND', null);
  }
  if (source.checkpointHash !== state.checkpoint.hash) {
    return result(
      quarantineState(state, 'CHECKPOINT_HASH_MISMATCH'),
      'QUARANTINED',
      null,
    );
  }
  if (source.frontier.height === state.checkpoint.height) {
    if (source.frontier.hash !== state.checkpoint.hash) {
      return result(
        quarantineState(state, 'CHECKPOINT_HASH_MISMATCH'),
        'QUARANTINED',
        null,
      );
    }
    if (
      state.inclusion === null
      && state.catchUp.lastAppliedPage !== null
      && state.catchUp.lastAppliedPage.targetMembership !== null
    ) {
      return result(state, 'INCLUSION_OBSERVATION_REQUIRED', null);
    }
    return result(state, 'AT_FRONTIER', null);
  }
  if (
    state.inclusion === null
    && state.catchUp.lastAppliedPage !== null
    && state.catchUp.lastAppliedPage.targetMembership !== null
  ) {
    return result(state, 'INCLUSION_OBSERVATION_REQUIRED', null);
  }
  return result(state, 'BACKFILL_REQUIRED', makeDetachedPlan(state, source.frontier));
}

export function applyZenonFundingObserverPage(input) {
  const value = exactObject(snapshotJson(input), [
    'state',
    'expectedRevision',
    'plan',
    'page',
  ]);
  const state = normalizeStateSnapshot(value.state);
  assertExpectedRevision(state, value.expectedRevision);
  if (state.status === ZENON_FUNDING_OBSERVER_STATUS.QUARANTINED) {
    return result(state, 'QUARANTINED');
  }
  const plan = normalizePlan(value.plan);
  const page = normalizePage(value.page, state);
  if (!contextMatches(state, plan) || !contextMatches(state, page)) {
    return result(quarantineState(state, 'CONTEXT_DRIFT'), 'QUARANTINED');
  }
  if (
    page.planId !== plan.planId
    || !sameJson(page.startCheckpoint, plan.startCheckpoint)
    || !sameJson(page.frontier, plan.frontier)
  ) {
    return result(quarantineState(state, 'PLAN_CONTEXT_DRIFT'), 'QUARANTINED');
  }
  if (page.entries.length !== plan.entryCount) {
    return result(quarantineState(state, 'PAGE_GAP'), 'QUARANTINED');
  }
  let previousHash = page.startCheckpoint.hash;
  let targetMembership = null;
  const lineage = [];
  for (let index = 0; index < page.entries.length; index += 1) {
    const entry = page.entries[index];
    const expectedHeight = plan.fromHeight + index;
    if (entry.height !== expectedHeight) {
      return result(quarantineState(state, 'PAGE_HEIGHT_CONFLICT'), 'QUARANTINED');
    }
    if (entry.previousHash !== previousHash) {
      return result(quarantineState(state, 'PAGE_PARENT_MISMATCH'), 'QUARANTINED');
    }
    const memberIds = new NATIVE_SET();
    for (let memberIndex = 0; memberIndex < entry.members.length; memberIndex += 1) {
      const member = entry.members[memberIndex];
      if (REFLECT_APPLY(SET_HAS, memberIds, [member.transactionId])) {
        return result(quarantineState(state, 'PAGE_MEMBER_CONFLICT'), 'QUARANTINED');
      }
      REFLECT_APPLY(SET_ADD, memberIds, [member.transactionId]);
      if (member.transactionId === state.target.transactionId) {
        if (member.targetBindingDigest !== state.targetBindingDigest) {
          return result(quarantineState(state, 'TARGET_BINDING_DRIFT'), 'QUARANTINED');
        }
        const discovered = deepFreeze({
          transactionId: member.transactionId,
          targetBindingDigest: member.targetBindingDigest,
          momentumHeight: entry.height,
          momentumHash: entry.hash,
        });
        if (targetMembership !== null && !sameJson(targetMembership, discovered)) {
          return result(quarantineState(state, 'INCLUSION_TUPLE_DRIFT'), 'QUARANTINED');
        }
        targetMembership = discovered;
      }
    }
    append(lineage, deepFreeze({
      height: entry.height,
      hash: entry.hash,
      previousHash: entry.previousHash,
    }));
    previousHash = entry.hash;
  }
  const endEntry = page.entries[page.entries.length - 1];
  if (endEntry.height !== plan.throughHeight) {
    return result(quarantineState(state, 'PAGE_GAP'), 'QUARANTINED');
  }
  if (endEntry.height === page.frontier.height && endEntry.hash !== page.frontier.hash) {
    return result(quarantineState(state, 'FRONTIER_REPLACEMENT'), 'QUARANTINED');
  }
  const endCheckpoint = deepFreeze({ height: endEntry.height, hash: endEntry.hash });
  const receiptWithoutDerivedThreshold = {
    planId: plan.planId,
    startCheckpoint: page.startCheckpoint,
    endCheckpoint,
    frontier: page.frontier,
    entryCount: page.entries.length,
    lineage: deepFreeze(lineage),
    targetMembership,
  };
  const pageDigest = pageReceiptDigest(receiptWithoutDerivedThreshold, state);
  if (
    state.catchUp.lastAppliedPage !== null
    && state.catchUp.lastAppliedPage.planId === plan.planId
    && state.catchUp.lastAppliedPage.pageDigest === pageDigest
  ) {
    return result(state, 'REPLAY');
  }
  if (
    state.inclusion === null
    && state.catchUp.lastAppliedPage !== null
    && state.catchUp.lastAppliedPage.targetMembership !== null
  ) {
    return result(state, 'INCLUSION_OBSERVATION_REQUIRED');
  }
  const expectedPlan = makePlan(state, plan.frontier);
  if (!sameJson(plan, expectedPlan)) {
    return result(quarantineState(state, 'PLAN_CONTEXT_DRIFT'), 'QUARANTINED');
  }
  if (state.inclusion !== null && targetMembership !== null) {
    const sameTuple = (
      targetMembership.momentumHeight === state.inclusion.momentumHeight
      && targetMembership.momentumHash === state.inclusion.momentumHash
    );
    if (!sameTuple) {
      return result(quarantineState(state, 'INCLUSION_TUPLE_DRIFT'), 'QUARANTINED');
    }
  }
  const inclusionHeight = state.inclusion?.momentumHeight ?? targetMembership?.momentumHeight;
  const reachesThreshold = (
    state.firstThreshold === null
    && inclusionHeight !== undefined
    && endCheckpoint.height - inclusionHeight + 1
      >= state.confirmationPolicy.minimumConfirmations
  );
  const thresholdCheckpoint = reachesThreshold ? endCheckpoint : null;
  const catchUp = deepFreeze({
    maximumPageEntries: state.catchUp.maximumPageEntries,
    maximumBackfillSpan: state.catchUp.maximumBackfillSpan,
    maximumMembersPerMomentum: state.catchUp.maximumMembersPerMomentum,
    lastAppliedPage: deepFreeze({
      ...receiptWithoutDerivedThreshold,
      pageDigest,
      thresholdCheckpoint,
    }),
  });
  return result(
    updateIncludedState(state, endCheckpoint, catchUp),
    'APPLIED',
  );
}

function normalizeObservation(input) {
  if (input?.status === 'UNAVAILABLE') {
    const value = exactObject(input, ['status', 'reason']);
    if (value.reason !== 'TIMEOUT' && value.reason !== 'UNAVAILABLE') failInput();
    return deepFreeze({ ...value });
  }
  if (input?.status === 'NOT_FOUND') {
    const value = exactObject(input, ['status', 'transactionId']);
    assertTransactionId(value.transactionId);
    return deepFreeze({ ...value });
  }
  const value = exactObject(input, [
    'status',
    'transactionId',
    'targetBindingDigest',
    'momentumHeight',
    'momentumHash',
    'pageDigest',
  ]);
  if (value.status !== 'FOUND') failInput();
  assertTransactionId(value.transactionId);
  assertCommitment(value.targetBindingDigest);
  assertPositiveInteger(value.momentumHeight);
  assertHash(value.momentumHash);
  assertCommitment(value.pageDigest);
  return deepFreeze({ ...value });
}

export function applyZenonFundingInclusionObservation(input) {
  const value = exactObject(snapshotJson(input), [
    'state',
    'expectedRevision',
    'observerRecordId',
    'targetBindingDigest',
    'authorityGeneration',
    'chainProfile',
    'observation',
  ]);
  const state = normalizeStateSnapshot(value.state);
  assertExpectedRevision(state, value.expectedRevision);
  const suppliedContext = normalizeContext(value);
  if (state.status === ZENON_FUNDING_OBSERVER_STATUS.QUARANTINED) {
    return result(state, 'QUARANTINED');
  }
  if (!contextMatches(state, suppliedContext)) {
    return result(quarantineState(state, 'CONTEXT_DRIFT'), 'QUARANTINED');
  }
  const observation = normalizeObservation(value.observation);
  if (observation.status === 'UNAVAILABLE') return result(state, 'SOURCE_UNAVAILABLE');
  if (observation.transactionId !== state.target.transactionId) {
    return result(quarantineState(state, 'INCLUSION_TUPLE_DRIFT'), 'QUARANTINED');
  }
  if (observation.status === 'NOT_FOUND') {
    if (
      state.inclusion === null
      && (
        state.catchUp.lastAppliedPage === null
        || state.catchUp.lastAppliedPage.targetMembership === null
      )
    ) {
      return result(state, 'UNCHANGED');
    }
    return result(quarantineState(state, 'INCLUSION_DISAPPEARED'), 'QUARANTINED');
  }
  if (observation.targetBindingDigest !== state.targetBindingDigest) {
    return result(quarantineState(state, 'TARGET_BINDING_DRIFT'), 'QUARANTINED');
  }
  if (state.inclusion !== null) {
    if (
      observation.momentumHeight !== state.inclusion.momentumHeight
      || observation.momentumHash !== state.inclusion.momentumHash
    ) {
      return result(quarantineState(state, 'INCLUSION_TUPLE_DRIFT'), 'QUARANTINED');
    }
    return result(state, 'UNCHANGED');
  }
  const receipt = state.catchUp.lastAppliedPage;
  if (
    receipt === null
    || receipt.targetMembership === null
    || receipt.pageDigest !== observation.pageDigest
    || receipt.targetMembership.transactionId !== observation.transactionId
    || receipt.targetMembership.targetBindingDigest !== observation.targetBindingDigest
    || receipt.targetMembership.momentumHeight !== observation.momentumHeight
    || receipt.targetMembership.momentumHash !== observation.momentumHash
  ) {
    return result(quarantineState(state, 'MEMBERSHIP_NOT_LINKED'), 'QUARANTINED');
  }
  const currentConfirmations = state.checkpoint.height - observation.momentumHeight + 1;
  if (currentConfirmations <= 0) {
    return result(quarantineState(state, 'MEMBERSHIP_NOT_LINKED'), 'QUARANTINED');
  }
  const inclusion = deepFreeze({
    transactionId: observation.transactionId,
    targetBindingDigest: observation.targetBindingDigest,
    momentumHeight: observation.momentumHeight,
    momentumHash: observation.momentumHash,
    inclusionAuthorizationId: inclusionAuthorizationId(
      state.observerRecordId,
      observation.transactionId,
      observation.momentumHeight,
      observation.momentumHash,
      state.confirmationPolicy.minimumConfirmations,
    ),
    currentConfirmations,
  });
  let firstThreshold = null;
  if (currentConfirmations >= state.confirmationPolicy.minimumConfirmations) {
    if (receipt.thresholdCheckpoint === null) {
      return result(quarantineState(state, 'PAGE_GAP'), 'QUARANTINED');
    }
    firstThreshold = deepFreeze({
      checkpoint: receipt.thresholdCheckpoint,
      confirmations: currentConfirmations,
      lineageReceipt: receipt,
    });
  }
  return result(cloneState(state, {
    revision: state.revision + 1,
    status: firstThreshold === null
      ? ZENON_FUNDING_OBSERVER_STATUS.INCLUDED_BELOW_THRESHOLD
      : ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED,
    inclusion,
    firstThreshold,
  }), 'APPLIED');
}

export function projectZenonFundingObservationCandidate(input) {
  const state = normalizeState(input);
  if (state.status !== ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED) return null;
  return deepFreeze({
    candidateVersion: 1,
    candidateType: ZENON_FUNDING_OBSERVATION_CANDIDATE_TYPE,
    trustClassification: ZENON_FUNDING_OBSERVER_TRUST_CLASSIFICATION,
    authorization: 'NONE',
    observerRecordId: state.observerRecordId,
    targetBindingDigest: state.targetBindingDigest,
    transactionId: state.target.transactionId,
    chainProfile: state.chainProfile,
    confirmationPolicy: state.confirmationPolicy,
    inclusionAuthorizationId: state.inclusion.inclusionAuthorizationId,
    inclusion: deepFreeze({
      transactionId: state.inclusion.transactionId,
      targetBindingDigest: state.inclusion.targetBindingDigest,
      momentumHeight: state.inclusion.momentumHeight,
      momentumHash: state.inclusion.momentumHash,
    }),
    firstThreshold: state.firstThreshold,
  });
}

export function serializeZenonFundingObserverState(input) {
  return canonicalJson(normalizeState(input));
}

export function parseZenonFundingObserverState(input) {
  if (
    typeof input !== 'string'
    || input.length === 0
    || input.length > MAX_INPUT_BYTES
    || byteLength(input) > MAX_INPUT_BYTES
  ) {
    failInput();
  }
  let parsed;
  try {
    parsed = REFLECT_APPLY(JSON_PARSE, JSON, [input]);
  } catch {
    failInput();
  }
  const state = normalizeState(parsed);
  if (canonicalJson(state) !== input) failInput();
  return state;
}
