import { createHash } from 'node:crypto';
import { types as utilTypes } from 'node:util';

import {
  ServiceCreditSqliteStore,
} from './service-credit-sqlite-store.js';
import {
  ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS,
  ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_VERSION,
  ZenonFundingObserverSqliteStore,
  ZENON_FUNDING_OBSERVER_SQLITE_STORE_SCHEMA_VERSION,
} from './service-credit-zenon-funding-observer-sqlite-store.js';
import {
  ZENON_FUNDING_OBSERVER_STATE_SCHEMA_VERSION,
  ZENON_FUNDING_OBSERVER_STATUS,
  ZENON_FUNDING_OBSERVER_TRUST_CLASSIFICATION,
} from './service-credit-zenon-funding-observer-state.js';
import {
  parseZenonFundingProviderAttestationAuthorityRecord,
} from './service-credit-zenon-funding-provider-attestation.js';
import {
  createZenonFundingEvidenceActivation,
  ZenonFundingEvidenceActivation,
} from './service-credit-zenon-funding-evidence.js';

const NATIVE_PROMISE = Promise;
const PROMISE_PROTOTYPE = NATIVE_PROMISE.prototype;
const PROMISE_THEN = PROMISE_PROTOTYPE.then;
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_PROTOTYPE = Array.prototype;
const ARRAY_JOIN = Array.prototype.join;
const ARRAY_MAP = Array.prototype.map;
const ARRAY_SORT = Array.prototype.sort;
const NATIVE_BUFFER = Buffer;
const BUFFER_BYTE_LENGTH = Buffer.byteLength;
const NATIVE_JSON = JSON;
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
const OBJECT_VALUES = Object.values;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const REFLECT_GET_PROTOTYPE_OF = Reflect.getPrototypeOf;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const IS_PROXY = utilTypes.isProxy;
const NATIVE_WEAK_SET = WeakSet;
const WEAK_SET_ADD = NATIVE_WEAK_SET.prototype.add;
const WEAK_SET_HAS = NATIVE_WEAK_SET.prototype.has;
const REGEXP_TEST = RegExp.prototype.test;
const HASH_PROTOTYPE = REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [
  createHash('sha256'),
]);
const HASH_UPDATE = HASH_PROTOTYPE.update;
const HASH_DIGEST = HASH_PROTOTYPE.digest;

const SERVICE_STORE_PROTOTYPE = ServiceCreditSqliteStore.prototype;
const SERVICE_GET_OFFER = SERVICE_STORE_PROTOTYPE.getOffer;
const SERVICE_ACTIVATE_GRANT = SERVICE_STORE_PROTOTYPE.activateGrantFromTrustedRecord;
const OBSERVER_STORE_PROTOTYPE = ZenonFundingObserverSqliteStore.prototype;
const OBSERVER_LOAD = OBSERVER_STORE_PROTOTYPE.load;
const OBSERVER_PROJECT = OBSERVER_STORE_PROTOTYPE.projectCommittedFundingEvidence;
const OBSERVER_MATCH = OBSERVER_STORE_PROTOTYPE.matchReadyFundingEvidence;
const ACTIVATION_PROTOTYPE = ZenonFundingEvidenceActivation.prototype;
const ACTIVATION_CREATE_RESOURCE = ACTIVATION_PROTOTYPE.createFundingResource;
const ACTIVATION_ACTIVATE = ACTIVATION_PROTOTYPE.activate;

const MAX_DEPTH = 24;
const MAX_ARRAY_LENGTH = 4_096;
const MAX_INPUT_NODES = 8_192;
const MAX_INPUT_MEMBERS = 8_192;
const MAX_INPUT_KEY_BYTES = 64 * 1024;
const MAX_INPUT_STRING_BYTES = 256 * 1024;
const MAX_INPUT_BYTES = 512 * 1024;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const OBSERVER_RECORD_KEY_DOMAIN = 'zenon-x402:funding-observer-sqlite-record-v2';
const RESOURCE_BINDING_DOMAIN = 'zenon-x402-service-credit-resource-binding-v1';
const RESOURCE_DIGEST_DOMAIN = 'zenon-x402-service-credit-payment-resource-v1';
const REQUIREMENT_DIGEST_DOMAIN = 'zenon-x402-service-credit-payment-requirement-v1';

export class ZenonFundingCompositionError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ZenonFundingCompositionError';
    this.code = code;
    this.stack = `ZenonFundingCompositionError: ${code}`;
  }
}

function failure(code) {
  return new ZenonFundingCompositionError(code);
}

function fail(code) {
  throw failure(code);
}

function errorCode(error) {
  try {
    const descriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      Reflect,
      [error, 'code'],
    );
    return descriptor && OBJECT_HAS_OWN(descriptor, 'value')
      && typeof descriptor.value === 'string'
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

function exactDataObject(input, requiredKeys, code) {
  try {
    if (
      input === null
      || typeof input !== 'object'
      || REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [input])
      || REFLECT_APPLY(IS_PROXY, undefined, [input])
      || REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [input]) !== OBJECT_PROTOTYPE
    ) {
      fail(code);
    }
    const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [input]);
    if (keys.length !== requiredKeys.length) fail(code);
    const captured = REFLECT_APPLY(OBJECT_CREATE, Object, [null]);
    for (let requiredIndex = 0; requiredIndex < requiredKeys.length; requiredIndex += 1) {
      const key = requiredKeys[requiredIndex];
      let present = false;
      for (let observedIndex = 0; observedIndex < keys.length; observedIndex += 1) {
        const observed = keys[observedIndex];
        if (observed === key) {
          present = true;
          break;
        }
      }
      if (!present) fail(code);
      const descriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [input, key],
      );
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) fail(code);
      captured[key] = descriptor.value;
    }
    return captured;
  } catch (error) {
    if (error instanceof ZenonFundingCompositionError) throw error;
    fail(code);
  }
}

function byteLength(value) {
  return REFLECT_APPLY(BUFFER_BYTE_LENGTH, NATIVE_BUFFER, [value, 'utf8']);
}

function addBudget(budget, field, amount, maximum) {
  budget[field] += amount;
  if (budget[field] > maximum) {
    fail('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_INVALID_INPUT');
  }
}

function copyJson(input, budget, depth = 0) {
  const invalid = 'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_INVALID_INPUT';
  try {
    if (depth > MAX_DEPTH) fail(invalid);
    addBudget(budget, 'nodes', 1, MAX_INPUT_NODES);
    if (input === null || typeof input === 'boolean') return input;
    if (typeof input === 'string') {
      if (input.length > MAX_INPUT_STRING_BYTES) fail(invalid);
      addBudget(budget, 'stringBytes', byteLength(input), MAX_INPUT_STRING_BYTES);
      return input;
    }
    if (typeof input === 'number') {
      if (!REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [input])) fail(invalid);
      return REFLECT_APPLY(OBJECT_IS, Object, [input, -0]) ? 0 : input;
    }
    if (typeof input !== 'object' || REFLECT_APPLY(IS_PROXY, undefined, [input])) {
      fail(invalid);
    }
    if (REFLECT_APPLY(WEAK_SET_HAS, budget.seen, [input])) fail(invalid);
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
        fail(invalid);
      }
      const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [input]);
      if (keys.length !== lengthDescriptor.value + 1 || keys[keys.length - 1] !== 'length') {
        fail(invalid);
      }
      addBudget(budget, 'members', lengthDescriptor.value, MAX_INPUT_MEMBERS);
      const copy = [];
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        const key = `${index}`;
        if (keys[index] !== key) fail(invalid);
        addBudget(budget, 'keyBytes', key.length, MAX_INPUT_KEY_BYTES);
        const descriptor = REFLECT_APPLY(
          REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
          Reflect,
          [input, key],
        );
        if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) fail(invalid);
        REFLECT_APPLY(OBJECT_DEFINE_PROPERTY, undefined, [copy, key, {
          configurable: true,
          enumerable: true,
          writable: true,
          value: copyJson(descriptor.value, budget, depth + 1),
        }]);
      }
      return copy;
    }
    if (prototype !== OBJECT_PROTOTYPE) fail(invalid);
    const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [input]);
    if (keys.length > MAX_INPUT_MEMBERS) fail(invalid);
    addBudget(budget, 'members', keys.length, MAX_INPUT_MEMBERS);
    const copy = {};
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key !== 'string' || key.length > MAX_INPUT_KEY_BYTES) fail(invalid);
      addBudget(budget, 'keyBytes', byteLength(key), MAX_INPUT_KEY_BYTES);
      const descriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [input, key],
      );
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) fail(invalid);
      REFLECT_APPLY(OBJECT_DEFINE_PROPERTY, undefined, [copy, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: copyJson(descriptor.value, budget, depth + 1),
      }]);
    }
    return copy;
  } catch (error) {
    if (error instanceof ZenonFundingCompositionError) throw error;
    fail(invalid);
  }
}

function snapshotJson(input) {
  const copy = copyJson(input, {
    seen: new NATIVE_WEAK_SET(),
    nodes: 0,
    members: 0,
    keyBytes: 0,
    stringBytes: 0,
  });
  const canonical = canonicalJson(copy);
  if (canonical.length > MAX_INPUT_BYTES || byteLength(canonical) > MAX_INPUT_BYTES) {
    fail('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_INVALID_INPUT');
  }
  return copy;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return REFLECT_APPLY(JSON_STRINGIFY, NATIVE_JSON, [value]);
  }
  if (REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [value])) {
    const parts = REFLECT_APPLY(ARRAY_MAP, value, [canonicalJson]);
    return `[${REFLECT_APPLY(ARRAY_JOIN, parts, [','])}]`;
  }
  const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [value]);
  REFLECT_APPLY(ARRAY_SORT, keys, []);
  const parts = REFLECT_APPLY(ARRAY_MAP, keys, [
    key => `${REFLECT_APPLY(JSON_STRINGIFY, NATIVE_JSON, [key])}:${canonicalJson(value[key])}`,
  ]);
  return `{${REFLECT_APPLY(ARRAY_JOIN, parts, [','])}}`;
}

function sameJson(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function hashText(value) {
  const hash = createHash('sha256');
  REFLECT_APPLY(HASH_UPDATE, hash, [value, 'utf8']);
  return REFLECT_APPLY(HASH_DIGEST, hash, ['hex']);
}

function commitment(domain, value) {
  return `sha256:${hashText(`${domain}\0${canonicalJson(value)}`)}`;
}

function assertFundingResourceMatchesTarget(
  result,
  target,
  resourceUrl,
  chainProfile,
  confirmationPolicy,
) {
  const rejected = 'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REJECTED';
  try {
    const activationIntent = result.activationIntent;
    const paymentRequired = result.paymentRequired;
    const accepted = paymentRequired.accepts[0];
    if (
      paymentRequired.accepts.length !== 1
      || activationIntent.providerId !== target.providerId
      || activationIntent.serviceId !== target.serviceId
      || activationIntent.resourceId !== target.resourceId
      || activationIntent.offerId !== target.offerId
      || activationIntent.offerVersion !== target.offerVersion
      || activationIntent.holderId !== target.payer
      || activationIntent.capabilityCommitment !== target.capabilityCommitment
      || activationIntent.totalUnits !== target.totalUnits
      || activationIntent.expiresAt !== target.expiresAt
      || accepted.scheme !== target.scheme
      || accepted.network !== target.network
      || accepted.asset !== target.asset
      || accepted.amount !== target.amount
      || accepted.payTo !== target.payee
      || accepted.extra.paymentFlow !== target.paymentFlow
      || accepted.extra.settlement !== target.settlement
      || !sameJson(accepted.extra.zenonChain, chainProfile)
      || accepted.extra.minimumMomentumConfirmations
        !== confirmationPolicy.minimumConfirmations
      || commitment(RESOURCE_BINDING_DOMAIN, {
        resourceId: activationIntent.resourceId,
        resourceUrl,
      }) !== target.resourceBinding
      || commitment(RESOURCE_DIGEST_DOMAIN, paymentRequired.resource)
        !== target.paymentResourceDigest
      || commitment(REQUIREMENT_DIGEST_DOMAIN, accepted)
        !== target.paymentRequirementDigest
      || `sha256:${hashText(canonicalJson({
        x402Version: paymentRequired.x402Version,
        resource: paymentRequired.resource,
        accepted,
      }))}` !== target.paymentIntentDigest
      || result.fundingCommitment !== target.grantFundingCommitment
    ) {
      fail(rejected);
    }
  } catch (error) {
    if (error instanceof ZenonFundingCompositionError) throw error;
    fail(rejected);
  }
}

function deepFreeze(value) {
  if (
    value === null
    || typeof value !== 'object'
    || REFLECT_APPLY(OBJECT_IS_FROZEN, Object, [value])
  ) return value;
  const children = REFLECT_APPLY(OBJECT_VALUES, Object, [value]);
  for (let index = 0; index < children.length; index += 1) deepFreeze(children[index]);
  return REFLECT_APPLY(OBJECT_FREEZE, Object, [value]);
}

function cloneTrusted(value) {
  return deepFreeze(REFLECT_APPLY(JSON_PARSE, NATIVE_JSON, [canonicalJson(value)]));
}

function exactPrototypeMethod(prototype, name, expected) {
  const descriptor = REFLECT_APPLY(
    REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
    Reflect,
    [prototype, name],
  );
  return descriptor?.value === expected
    && descriptor.enumerable === false
    && descriptor.get === undefined
    && descriptor.set === undefined;
}

function exactStore(value, prototype, methods) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || REFLECT_APPLY(IS_PROXY, undefined, [value])
      || REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [value]) !== prototype
      || REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [value]).length !== 0
      || REFLECT_APPLY(REFLECT_GET_OWN_PROPERTY_DESCRIPTOR, Reflect, [prototype, 'then'])
        !== undefined
      || REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [OBJECT_PROTOTYPE, 'then'],
      ) !== undefined
    ) {
      return false;
    }
    for (let index = 0; index < methods.length; index += 1) {
      const [name, expected] = methods[index];
      if (
        REFLECT_APPLY(REFLECT_GET_OWN_PROPERTY_DESCRIPTOR, Reflect, [value, name]) !== undefined
        || !exactPrototypeMethod(prototype, name, expected)
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function validCallable(value) {
  try {
    return typeof value === 'function'
      && !REFLECT_APPLY(IS_PROXY, undefined, [value])
      && REFLECT_APPLY(REFLECT_GET_OWN_PROPERTY_DESCRIPTOR, Reflect, [value, 'then'])
        === undefined;
  } catch {
    return false;
  }
}

function assertAuthorityBinding(
  loaded,
  authority,
  invalid = 'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_INVALID_CONFIGURATION',
) {
  try {
    const record = exactDataObject(
      loaded,
      ['storeSchemaVersion', 'recordKey', 'authorityRecordDigest', 'state', 'outbox'],
      invalid,
    );
    const outbox = exactDataObject(
      record.outbox,
      ['outboxVersion', 'revision', 'status'],
      invalid,
    );
    if (
      record.storeSchemaVersion !== ZENON_FUNDING_OBSERVER_SQLITE_STORE_SCHEMA_VERSION
      || typeof record.recordKey !== 'string'
      || !REFLECT_APPLY(REGEXP_TEST, DIGEST, [record.recordKey])
      || record.authorityRecordDigest !== authority.authorityRecordDigest
      || record.state === null
      || typeof record.state !== 'object'
      || record.state.schemaVersion !== ZENON_FUNDING_OBSERVER_STATE_SCHEMA_VERSION
      || record.state.trustClassification
        !== ZENON_FUNDING_OBSERVER_TRUST_CLASSIFICATION
      || outbox.outboxVersion !== ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_VERSION
      || !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [outbox.revision])
      || outbox.revision < 0
      || commitment(OBSERVER_RECORD_KEY_DOMAIN, {
        storeSchemaVersion: record.storeSchemaVersion,
        observerRecordId: record.state.observerRecordId,
        targetBindingDigest: record.state.targetBindingDigest,
        authorityRecordDigest: authority.authorityRecordDigest,
      }) !== record.recordKey
      || !sameJson(record.state.authorityGeneration, authority.authorityGeneration)
      || !sameJson(record.state.chainProfile, authority.chainProfile)
      || !sameJson(record.state.observerPolicy, authority.observerPolicy)
      || !sameJson(record.state.confirmationPolicy, authority.confirmationPolicy)
    ) {
      fail(invalid);
    }
    record.outbox = outbox;
    return record;
  } catch (error) {
    if (error instanceof ZenonFundingCompositionError) throw error;
    fail(invalid);
  }
}

function immutableObserverBinding(record) {
  const observer = record.state;
  return cloneTrusted({
    storeSchemaVersion: record.storeSchemaVersion,
    recordKey: record.recordKey,
    authorityRecordDigest: record.authorityRecordDigest,
    stateSchemaVersion: observer.schemaVersion,
    observerPolicy: observer.observerPolicy,
    authorityGeneration: observer.authorityGeneration,
    observerRecordId: observer.observerRecordId,
    chainProfile: observer.chainProfile,
    confirmationPolicy: observer.confirmationPolicy,
    target: observer.target,
    targetBindingDigest: observer.targetBindingDigest,
    catchUpConfiguration: {
      maximumPageEntries: observer.catchUp.maximumPageEntries,
      maximumBackfillSpan: observer.catchUp.maximumBackfillSpan,
      maximumMembersPerMomentum: observer.catchUp.maximumMembersPerMomentum,
    },
    trustClassification: observer.trustClassification,
  });
}

function assertChallengeEligible(record, expectedBinding) {
  const rejected = 'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REJECTED';
  const observerStatus = record.state.status;
  const outboxStatus = record.outbox.status;
  if (
    !sameJson(immutableObserverBinding(record), expectedBinding)
    || (
      observerStatus !== ZENON_FUNDING_OBSERVER_STATUS.AWAITING_INCLUSION
      && observerStatus !== ZENON_FUNDING_OBSERVER_STATUS.INCLUDED_BELOW_THRESHOLD
      && observerStatus !== ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED
    )
    || (
      outboxStatus !== ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.NONE
      && outboxStatus !== ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.PREPARED
      && outboxStatus !== ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.READY
    )
  ) {
    fail(rejected);
  }
  return record;
}

function assertServiceOfferBinding(serviceCreditStore, target) {
  const invalid = 'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_INVALID_CONFIGURATION';
  try {
    const raw = REFLECT_APPLY(SERVICE_GET_OFFER, serviceCreditStore, [{
      offerId: target.offerId,
      offerVersion: target.offerVersion,
    }]);
    const offer = exactDataObject(raw, [
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
    ], invalid);
    if (
      offer.providerId !== target.providerId
      || offer.serviceId !== target.serviceId
      || offer.resourceId !== target.resourceId
      || offer.resourceBinding !== target.resourceBinding
      || offer.offerId !== target.offerId
      || offer.offerVersion !== target.offerVersion
      || offer.fundingPolicyId !== target.fundingPolicyId
      || offer.fundingPolicyVersion !== target.fundingPolicyVersion
    ) {
      fail(invalid);
    }
  } catch (error) {
    if (error instanceof ZenonFundingCompositionError) throw error;
    fail(invalid);
  }
}

function mappedActivationFailure(error, state) {
  if (error instanceof ZenonFundingCompositionError) return error;
  const code = errorCode(error);
  if (state.callbackReentryAttempted) {
    return failure('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REENTRANT_OPERATION');
  }
  if (code === 'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_OUTCOME_UNKNOWN') {
    state.latched = true;
    return failure('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_OUTCOME_UNKNOWN');
  }
  if (code === 'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_CONFLICT') {
    return failure('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_CONFLICT');
  }
  return failure('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REJECTED');
}

/**
 * Offline owner that privately connects one committed READY provider assertion
 * to the existing durable service-credit activation. It performs no network,
 * wallet, signing, listener, or source operation. The two SQLite stores remain
 * independent durability domains; READY is retained as the recovery source and
 * is never marked consumed here.
 */
export function createZenonFundingComposition(options) {
  const invalidConfiguration = 'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_INVALID_CONFIGURATION';
  const value = exactDataObject(options, [
    'serviceCreditStore',
    'fundingObserverStore',
    'authorityRecord',
    'deriveFundingTerms',
    'now',
  ], invalidConfiguration);
  if (
    !exactStore(value.serviceCreditStore, SERVICE_STORE_PROTOTYPE, [
      ['getOffer', SERVICE_GET_OFFER],
      ['activateGrantFromTrustedRecord', SERVICE_ACTIVATE_GRANT],
    ])
    || !exactStore(value.fundingObserverStore, OBSERVER_STORE_PROTOTYPE, [
      ['load', OBSERVER_LOAD],
      ['projectCommittedFundingEvidence', OBSERVER_PROJECT],
      ['matchReadyFundingEvidence', OBSERVER_MATCH],
    ])
    || typeof value.authorityRecord !== 'string'
    || value.authorityRecord.length > MAX_INPUT_STRING_BYTES
    || !validCallable(value.deriveFundingTerms)
    || !validCallable(value.now)
  ) {
    fail(invalidConfiguration);
  }

  let authority;
  let loaded;
  try {
    authority = parseZenonFundingProviderAttestationAuthorityRecord(value.authorityRecord);
    loaded = REFLECT_APPLY(OBSERVER_LOAD, value.fundingObserverStore, []);
  } catch {
    fail(invalidConfiguration);
  }
  const initialObserverRecord = assertAuthorityBinding(loaded, authority);
  assertServiceOfferBinding(value.serviceCreditStore, initialObserverRecord.state.target);

  const serviceCreditStore = value.serviceCreditStore;
  const fundingObserverStore = value.fundingObserverStore;
  const providerPolicy = value.deriveFundingTerms;
  const clock = value.now;
  const observerTargetBinding = cloneTrusted(loaded.state.target);
  const observerChainProfile = cloneTrusted(loaded.state.chainProfile);
  const observerConfirmationPolicy = cloneTrusted(loaded.state.confirmationPolicy);
  const observerImmutableBinding = immutableObserverBinding(initialObserverRecord);
  const state = {
    callbackActive: false,
    callbackReentryAttempted: false,
    synchronousOperationActive: false,
    activationStarting: false,
    inFlightFingerprint: null,
    inFlightPromise: null,
    completedFingerprint: null,
    latched: false,
  };

  let owner;
  function rejectPublicReentry() {
    if (state.callbackActive) {
      state.callbackReentryAttempted = true;
      fail('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REENTRANT_OPERATION');
    }
  }
  function assertBoundStores() {
    if (
      !exactStore(serviceCreditStore, SERVICE_STORE_PROTOTYPE, [
        ['getOffer', SERVICE_GET_OFFER],
        ['activateGrantFromTrustedRecord', SERVICE_ACTIVATE_GRANT],
      ])
      || !exactStore(fundingObserverStore, OBSERVER_STORE_PROTOTYPE, [
        ['load', OBSERVER_LOAD],
        ['projectCommittedFundingEvidence', OBSERVER_PROJECT],
        ['matchReadyFundingEvidence', OBSERVER_MATCH],
      ])
    ) {
      fail('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_INVALID_CONFIGURATION');
    }
  }
  function assertUsable() {
    rejectPublicReentry();
    if (state.latched) fail('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_LATCHED');
    assertBoundStores();
  }
  function loadChallengeEligibleObserver() {
    assertBoundStores();
    let fresh;
    try {
      fresh = REFLECT_APPLY(OBSERVER_LOAD, fundingObserverStore, []);
    } catch {
      fail('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REJECTED');
    }
    return assertChallengeEligible(
      assertAuthorityBinding(
        fresh,
        authority,
        'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REJECTED',
      ),
      observerImmutableBinding,
    );
  }
  function invokeTrusted(callback, args) {
    if (state.callbackActive) {
      state.callbackReentryAttempted = true;
      fail('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REENTRANT_OPERATION');
    }
    state.callbackActive = true;
    let result;
    let failed = false;
    try {
      result = REFLECT_APPLY(callback, undefined, args);
    } catch {
      failed = true;
    }
    state.callbackActive = false;
    if (state.callbackReentryAttempted) {
      fail('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REENTRANT_OPERATION');
    }
    if (failed) fail('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REJECTED');
    return result;
  }

  const fixedStore = OBJECT_FREEZE({
    getOffer(input) {
      assertBoundStores();
      return REFLECT_APPLY(SERVICE_GET_OFFER, serviceCreditStore, [input]);
    },
    activateGrantFromTrustedRecord(input) {
      assertBoundStores();
      return REFLECT_APPLY(SERVICE_ACTIVATE_GRANT, serviceCreditStore, [input]);
    },
  });
  const fixedProviderPolicy = input => snapshotJson(invokeTrusted(providerPolicy, [input]));
  const fixedClock = () => invokeTrusted(clock, []);
  const fixedVerifier = input => new NATIVE_PROMISE((resolve, reject) => {
    try {
      assertBoundStores();
      resolve(REFLECT_APPLY(OBSERVER_MATCH, fundingObserverStore, [input]));
    } catch {
      reject(failure('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REJECTED'));
    }
  });
  const activation = createZenonFundingEvidenceActivation({
    store: fixedStore,
    deriveFundingTerms: fixedProviderPolicy,
    verifyFundingEvidence: fixedVerifier,
    authorityProfile: cloneTrusted(authority.authorityProfile),
    now: fixedClock,
  });

  function createFundingResource(input) {
    assertUsable();
    if (state.activationStarting || state.inFlightPromise !== null) {
      fail('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_BUSY');
    }
    if (state.synchronousOperationActive) {
      fail('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REENTRANT_OPERATION');
    }
    const captured = snapshotJson(input);
    loadChallengeEligibleObserver();
    state.synchronousOperationActive = true;
    state.callbackReentryAttempted = false;
    try {
      const result = REFLECT_APPLY(ACTIVATION_CREATE_RESOURCE, activation, [captured]);
      if (state.callbackReentryAttempted) {
        fail('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REENTRANT_OPERATION');
      }
      loadChallengeEligibleObserver();
      assertFundingResourceMatchesTarget(
        result,
        observerTargetBinding,
        captured.resourceUrl,
        observerChainProfile,
        observerConfirmationPolicy,
      );
      return result;
    } catch (error) {
      throw mappedActivationFailure(error, state);
    } finally {
      state.synchronousOperationActive = false;
      state.callbackReentryAttempted = false;
    }
  }

  function activateCommittedFunding(input) {
    assertUsable();
    const capturedTop = exactDataObject(
      input,
      ['intent', 'paymentRequired'],
      'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_INVALID_INPUT',
    );
    const captured = snapshotJson({
      intent: capturedTop.intent,
      paymentRequired: capturedTop.paymentRequired,
    });
    const fingerprint = canonicalJson(captured);
    if (
      state.completedFingerprint !== null
      && state.completedFingerprint !== fingerprint
    ) {
      fail('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_CONFLICT');
    }
    if (state.activationStarting) {
      fail('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REENTRANT_OPERATION');
    }
    if (state.inFlightPromise !== null) {
      if (fingerprint === state.inFlightFingerprint) return state.inFlightPromise;
      fail('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_BUSY');
    }

    state.activationStarting = true;
    state.inFlightFingerprint = fingerprint;
    state.callbackReentryAttempted = false;
    const operation = new NATIVE_PROMISE((resolve, reject) => {
      let artifact;
      let sourcePromise;
      try {
        artifact = REFLECT_APPLY(OBSERVER_PROJECT, fundingObserverStore, []);
        if (artifact === null) {
          fail('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_NOT_READY');
        }
        artifact = snapshotJson(artifact);
        sourcePromise = REFLECT_APPLY(ACTIVATION_ACTIVATE, activation, [{
          intent: captured.intent,
          paymentRequired: captured.paymentRequired,
          fundingEvidence: artifact,
        }]);
      } catch (error) {
        reject(mappedActivationFailure(error, state));
        return;
      }
      REFLECT_APPLY(PROMISE_THEN, sourcePromise, [
        result => {
          if (state.callbackReentryAttempted) {
            reject(failure('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REENTRANT_OPERATION'));
            return;
          }
          resolve(result);
        },
        error => reject(mappedActivationFailure(error, state)),
      ]);
    });
    state.activationStarting = false;
    const completed = new NATIVE_PROMISE((resolve, reject) => {
      REFLECT_APPLY(PROMISE_THEN, operation, [
        result => {
          state.completedFingerprint = fingerprint;
          state.inFlightPromise = null;
          state.inFlightFingerprint = null;
          state.callbackReentryAttempted = false;
          resolve(result);
        },
        error => {
          state.inFlightPromise = null;
          state.inFlightFingerprint = null;
          state.callbackReentryAttempted = false;
          reject(error);
        },
      ]);
    });
    state.inFlightPromise = completed;
    return completed;
  }

  owner = OBJECT_FREEZE({ createFundingResource, activateCommittedFunding });
  return owner;
}
