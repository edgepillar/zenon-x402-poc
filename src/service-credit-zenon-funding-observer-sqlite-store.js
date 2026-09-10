import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { types as utilTypes } from 'node:util';
import {
  applyZenonFundingInclusionObservation,
  applyZenonFundingObserverPage,
  createZenonFundingObserverState,
  parseZenonFundingObserverState,
  planZenonFundingObserverBackfill,
  projectZenonFundingObservationCandidate,
  serializeZenonFundingObserverState,
  ZENON_FUNDING_OBSERVATION_CANDIDATE_TYPE,
  ZENON_FUNDING_OBSERVER_STATUS,
  ZENON_FUNDING_OBSERVER_STATE_SCHEMA_VERSION,
  ZENON_FUNDING_OBSERVER_TRUST_CLASSIFICATION,
  ZenonFundingObserverStateError,
} from './service-credit-zenon-funding-observer-state.js';
import {
  parseZenonFundingProviderAttestationAuthorityRecord,
  parseZenonFundingProviderAttestationRequest,
  verifyZenonFundingProviderAttestationEnvelope,
  ZenonFundingProviderAttestationError,
} from './service-credit-zenon-funding-provider-attestation.js';

export const ZENON_FUNDING_OBSERVER_SQLITE_STORE_SCHEMA_VERSION = 2;
export const ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_VERSION = 1;
export const ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS = Object.freeze({
  NONE: 'NONE',
  PREPARED: 'PREPARED',
  READY: 'READY',
  INVALIDATED: 'INVALIDATED',
  EQUIVOCATED: 'EQUIVOCATED',
});

const APPLICATION_ID = 0x5a464f53;
const TABLE_NAME = 'zenon_funding_observer_state';
const INDEX_NAME = 'zenon_funding_observer_state_record_key';
const TABLE_SQL = 'CREATE TABLE zenon_funding_observer_state(singleton INTEGER PRIMARY KEY CHECK(singleton = 1), record_key TEXT NOT NULL, envelope TEXT NOT NULL) STRICT';
const INDEX_SQL = 'CREATE UNIQUE INDEX zenon_funding_observer_state_record_key ON zenon_funding_observer_state(record_key)';
const RECORD_KEY_DOMAIN = 'zenon-x402:funding-observer-sqlite-record-v2';
const ENVELOPE_DOMAIN = 'zenon-x402:funding-observer-sqlite-envelope-v2';
const READY_ARTIFACT_DOMAIN = 'zenon-x402:funding-observer-ready-artifact-v1';
const ATTESTATION_AUDIENCE_DOMAIN = 'zenon-x402:funding-provider-attestation-audience-v1';
const ATTESTATION_CANDIDATE_DOMAIN = 'zenon-x402:funding-provider-attestation-candidate-v1';
const ATTESTATION_EVIDENCE_DOMAIN = 'zenon-x402:funding-provider-attestation-evidence-v1';
const ATTESTATION_ID_DOMAIN = 'zenon-x402:funding-provider-attestation-id-v1';
const ATTESTATION_REQUEST_TYPE = 'zenon-funding-provider-attestation-request';
const ENVELOPE_VERSION = 2;
const DEFAULT_BUSY_TIMEOUT_MS = 5_000;
const MAX_BUSY_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_STATE_BYTES = 512 * 1024;
const HARD_MAX_STATE_BYTES = 1024 * 1024;
const MAX_ENVELOPE_OVERHEAD_BYTES = 256 * 1024;
const RECORD_KEY_BYTES = 71;
const MAX_INPUT_NODES = 16_384;
const MAX_INPUT_MEMBERS = 16_384;
const MAX_INPUT_KEY_BYTES = 64 * 1024;
const MAX_INPUT_STRING_BYTES = 512 * 1024;
const MAX_ARRAY_LENGTH = 8_192;
const MAX_DEPTH = 32;
const CHECKSUM = /^sha256:[0-9a-f]{64}$/;
const CONSTRUCTOR_TOKEN = Symbol('ZenonFundingObserverSqliteStore');

const ARRAY_IS_ARRAY = Array.isArray;
const BUFFER_BYTE_LENGTH = Buffer.byteLength;
const JSON_PARSE = JSON.parse;
const JSON_STRINGIFY = JSON.stringify;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const OBJECT_CREATE = Object.create;
const OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_KEYS = Object.keys;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const REFLECT_GET_PROTOTYPE_OF = Reflect.getPrototypeOf;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const ARRAY_SORT = Array.prototype.sort;
const STRING_SLICE = String.prototype.slice;
const STRING_STARTS_WITH = String.prototype.startsWith;
const IS_PROXY = utilTypes.isProxy;
const HASH_PROTOTYPE = REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [
  createHash('sha256'),
]);
const HASH_UPDATE = HASH_PROTOTYPE.update;
const HASH_DIGEST = HASH_PROTOTYPE.digest;

export class ZenonFundingObserverSqliteStoreError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ZenonFundingObserverSqliteStoreError';
    this.code = code;
    this.stack = `ZenonFundingObserverSqliteStoreError: ${code}`;
  }
}

function failure(code) {
  return new ZenonFundingObserverSqliteStoreError(code);
}

function fail(code) {
  throw failure(code);
}

function storeErrorCode(error) {
  try {
    if (!(error instanceof ZenonFundingObserverSqliteStoreError)) return null;
    const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(error, 'code');
    return descriptor && OBJECT_HAS_OWN(descriptor, 'value')
      && typeof descriptor.value === 'string'
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

function observerErrorCode(error) {
  try {
    if (!(error instanceof ZenonFundingObserverStateError)) return null;
    const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(error, 'code');
    return descriptor && OBJECT_HAS_OWN(descriptor, 'value')
      && typeof descriptor.value === 'string'
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

function attestationErrorCode(error) {
  try {
    if (!(error instanceof ZenonFundingProviderAttestationError)) return null;
    const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(error, 'code');
    return descriptor && OBJECT_HAS_OWN(descriptor, 'value')
      && typeof descriptor.value === 'string'
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

function byteLength(value) {
  return REFLECT_APPLY(BUFFER_BYTE_LENGTH, Buffer, [value, 'utf8']);
}

function hashCommitment(domain, value) {
  const hash = createHash('sha256');
  REFLECT_APPLY(HASH_UPDATE, hash, [domain, 'ascii']);
  REFLECT_APPLY(HASH_UPDATE, hash, ['\0', 'ascii']);
  REFLECT_APPLY(HASH_UPDATE, hash, [canonicalJson(value), 'utf8']);
  return `sha256:${REFLECT_APPLY(HASH_DIGEST, hash, ['hex'])}`;
}

function isPlainObject(value) {
  return value !== null
    && typeof value === 'object'
    && !IS_PROXY(value)
    && !ARRAY_IS_ARRAY(value)
    && REFLECT_GET_PROTOTYPE_OF(value) === OBJECT_PROTOTYPE;
}

function exactDataObject(value, requiredKeys, optionalKeys = [], code = 'ZENON_FUNDING_OBSERVER_STORE_INVALID_CONFIGURATION') {
  try {
    if (!isPlainObject(value)) fail(code);
    const keys = REFLECT_OWN_KEYS(value);
    if (keys.length < requiredKeys.length || keys.length > requiredKeys.length + optionalKeys.length) {
      fail(code);
    }
    const allowed = new Set([...requiredKeys, ...optionalKeys]);
    const captured = OBJECT_CREATE(null);
    for (const key of keys) {
      if (typeof key !== 'string' || !allowed.has(key)) fail(code);
      const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) fail(code);
      OBJECT_DEFINE_PROPERTY(captured, key, {
        configurable: false,
        enumerable: true,
        value: descriptor.value,
        writable: false,
      });
    }
    for (const key of requiredKeys) {
      if (!OBJECT_HAS_OWN(captured, key)) fail(code);
    }
    return captured;
  } catch (error) {
    const known = storeErrorCode(error);
    throw failure(known ?? code);
  }
}

function addBudget(budget, key, amount, maximum) {
  budget[key] += amount;
  if (budget[key] > maximum) fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
}

function snapshotValue(input, budget, seen, depth) {
  if (depth > MAX_DEPTH) fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
  addBudget(budget, 'nodes', 1, MAX_INPUT_NODES);
  if (input === null || typeof input === 'boolean') return input;
  if (typeof input === 'string') {
    if (input.length > MAX_INPUT_STRING_BYTES) {
      fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    }
    addBudget(budget, 'stringBytes', byteLength(input), MAX_INPUT_STRING_BYTES);
    return input;
  }
  if (typeof input === 'number') {
    if (!NUMBER_IS_SAFE_INTEGER(input)) fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    return Object.is(input, -0) ? 0 : input;
  }
  if (
    typeof input !== 'object'
    || IS_PROXY(input)
    || seen.has(input)
    || (
      !ARRAY_IS_ARRAY(input)
      && REFLECT_GET_PROTOTYPE_OF(input) !== OBJECT_PROTOTYPE
    )
  ) {
    fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
  }
  seen.add(input);
  if (ARRAY_IS_ARRAY(input)) {
    const lengthDescriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(input, 'length');
    if (
      !lengthDescriptor
      || !OBJECT_HAS_OWN(lengthDescriptor, 'value')
      || !NUMBER_IS_SAFE_INTEGER(lengthDescriptor.value)
      || lengthDescriptor.value < 0
      || lengthDescriptor.value > MAX_ARRAY_LENGTH
    ) {
      fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    }
    const keys = REFLECT_OWN_KEYS(input);
    if (keys.length !== lengthDescriptor.value + 1) {
      fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    }
    addBudget(budget, 'members', lengthDescriptor.value, MAX_INPUT_MEMBERS);
    const output = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const key = `${index}`;
      const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(input, key);
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) {
        fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
      }
      OBJECT_DEFINE_PROPERTY(output, key, {
        configurable: true,
        enumerable: true,
        value: snapshotValue(descriptor.value, budget, seen, depth + 1),
        writable: true,
      });
    }
    return output;
  }
  const keys = REFLECT_OWN_KEYS(input);
  addBudget(budget, 'members', keys.length, MAX_INPUT_MEMBERS);
  const output = {};
  for (const key of keys) {
    if (typeof key !== 'string' || key.length > MAX_INPUT_KEY_BYTES) {
      fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    }
    addBudget(budget, 'keyBytes', byteLength(key), MAX_INPUT_KEY_BYTES);
    const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(input, key);
    if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) {
      fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    }
    OBJECT_DEFINE_PROPERTY(output, key, {
      configurable: true,
      enumerable: true,
      value: snapshotValue(descriptor.value, budget, seen, depth + 1),
      writable: true,
    });
  }
  return output;
}

function snapshotJson(input) {
  try {
    return snapshotValue(input, {
      keyBytes: 0,
      members: 0,
      nodes: 0,
      stringBytes: 0,
    }, new WeakSet(), 0);
  } catch (error) {
    const known = storeErrorCode(error);
    throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
  }
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON_STRINGIFY(value);
  if (ARRAY_IS_ARRAY(value)) {
    let output = '[';
    for (let index = 0; index < value.length; index += 1) {
      if (index > 0) output += ',';
      output += canonicalJson(value[index]);
    }
    return `${output}]`;
  }
  const keys = OBJECT_KEYS(value);
  REFLECT_APPLY(ARRAY_SORT, keys, []);
  let output = '{';
  for (let index = 0; index < keys.length; index += 1) {
    if (index > 0) output += ',';
    const key = keys[index];
    output += `${JSON_STRINGIFY(key)}:${canonicalJson(value[key])}`;
  }
  return `${output}}`;
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return OBJECT_FREEZE(value);
}

function cloneTrusted(value) {
  return deepFreeze(REFLECT_APPLY(JSON_PARSE, JSON, [canonicalJson(value)]));
}

function validDigest(value) {
  return typeof value === 'string' && CHECKSUM.test(value);
}

function authorityStateMatches(authority, state, requireBootstrapProof) {
  const sameBootstrap = canonicalJson(state.checkpoint)
    === canonicalJson(authority.bootstrapCheckpoint);
  const retainedBootstrap = canonicalJson(
    state.firstThreshold?.lineageReceipt?.startCheckpoint
      ?? state.catchUp?.lastAppliedPage?.startCheckpoint
      ?? null,
  ) === canonicalJson(authority.bootstrapCheckpoint);
  return state.target.network === authority.network
    && canonicalJson(state.authorityGeneration) === canonicalJson(authority.authorityGeneration)
    && canonicalJson(state.chainProfile) === canonicalJson(authority.chainProfile)
    && canonicalJson(state.observerPolicy) === canonicalJson(authority.observerPolicy)
    && canonicalJson(state.confirmationPolicy) === canonicalJson(authority.confirmationPolicy)
    && state.checkpoint.height >= authority.bootstrapCheckpoint.height
    && (
      state.checkpoint.height !== authority.bootstrapCheckpoint.height
      || state.checkpoint.hash === authority.bootstrapCheckpoint.hash
    )
    && (!requireBootstrapProof || sameBootstrap || retainedBootstrap);
}

function assertAuthorityState(authority, state, requireBootstrapProof = false) {
  if (!authorityStateMatches(authority, state, requireBootstrapProof)) {
    fail('ZENON_FUNDING_OBSERVER_STORE_AUTHORITY_MISMATCH');
  }
}

function assertPristineInitialState(authority, state, code) {
  try {
    const reconstructed = createZenonFundingObserverState({
      observerPolicy: cloneTrusted(state.observerPolicy),
      authorityGeneration: cloneTrusted(state.authorityGeneration),
      chainProfile: cloneTrusted(state.chainProfile),
      confirmationPolicy: cloneTrusted(state.confirmationPolicy),
      target: cloneTrusted(state.target),
      checkpoint: cloneTrusted(authority.bootstrapCheckpoint),
      catchUp: {
        maximumPageEntries: state.catchUp.maximumPageEntries,
        maximumBackfillSpan: state.catchUp.maximumBackfillSpan,
        maximumMembersPerMomentum: state.catchUp.maximumMembersPerMomentum,
      },
    });
    if (canonicalJson(reconstructed) !== canonicalJson(state)) fail(code);
  } catch (error) {
    const known = storeErrorCode(error);
    throw failure(known ?? code);
  }
}

function emptyOutbox() {
  return deepFreeze({
    outboxVersion: ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_VERSION,
    revision: 0,
    status: ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.NONE,
    attestationId: null,
    request: null,
    envelope: null,
    envelopeDigest: null,
    conflictingEnvelope: null,
    conflictingEnvelopeDigest: null,
    priorStatus: null,
    invalidationReason: null,
  });
}

function candidateForState(state) {
  try {
    const projected = projectZenonFundingObservationCandidate(cloneTrusted(state));
    if (projected !== null) return projected;
    if (
      state.status !== ZENON_FUNDING_OBSERVER_STATUS.QUARANTINED
      || state.inclusion === null
      || state.firstThreshold === null
    ) {
      return null;
    }
    return deepFreeze({
      candidateVersion: 1,
      candidateType: ZENON_FUNDING_OBSERVATION_CANDIDATE_TYPE,
      trustClassification: ZENON_FUNDING_OBSERVER_TRUST_CLASSIFICATION,
      authorization: 'NONE',
      observerRecordId: state.observerRecordId,
      targetBindingDigest: state.targetBindingDigest,
      transactionId: state.target.transactionId,
      chainProfile: cloneTrusted(state.chainProfile),
      confirmationPolicy: cloneTrusted(state.confirmationPolicy),
      inclusionAuthorizationId: state.inclusion.inclusionAuthorizationId,
      inclusion: deepFreeze({
        transactionId: state.inclusion.transactionId,
        targetBindingDigest: state.inclusion.targetBindingDigest,
        momentumHeight: state.inclusion.momentumHeight,
        momentumHash: state.inclusion.momentumHash,
      }),
      firstThreshold: cloneTrusted(state.firstThreshold),
    });
  } catch (error) {
    mapObserverFailure(error, true);
  }
}

function requestForState(authority, recordKey, state) {
  const candidate = candidateForState(state);
  if (candidate === null) return null;
  try {
    const target = state.target;
    const unsignedFundingEvidence = deepFreeze({
      evidenceVersion: 1,
      evidenceType: 'zenon-authenticated-funding-evidence',
      authorityProfileId: authority.authorityProfileId,
      authorityProfileVersion: authority.authorityProfileVersion,
      verifierVersion: authority.verifierVersion,
      authorityRecordDigest: authority.authorityRecordDigest,
      network: authority.network,
      chainProfile: cloneTrusted(authority.chainProfile),
      transactionId: target.transactionId,
      payer: target.payer,
      payee: target.payee,
      asset: target.asset,
      amount: target.amount,
      paymentResourceDigest: target.paymentResourceDigest,
      paymentRequirementDigest: target.paymentRequirementDigest,
      paymentIntentDigest: target.paymentIntentDigest,
      resourceBinding: target.resourceBinding,
      offerId: target.offerId,
      offerVersion: target.offerVersion,
      fundingPolicyId: target.fundingPolicyId,
      fundingPolicyVersion: target.fundingPolicyVersion,
      capabilityCommitment: target.capabilityCommitment,
      totalUnits: target.totalUnits,
      expiresAt: target.expiresAt,
      grantFundingCommitment: target.grantFundingCommitment,
      inclusionEvidence: deepFreeze({
        state: 'MOMENTUM_INCLUDED',
        transactionHash: REFLECT_APPLY(STRING_SLICE, target.transactionId, [
          'zenontx:'.length,
        ]),
        momentumHeight: candidate.inclusion.momentumHeight,
        momentumHash: candidate.inclusion.momentumHash,
        observedConfirmations: candidate.firstThreshold.confirmations,
      }),
      confirmationPolicy: cloneTrusted(authority.confirmationPolicy),
    });
    const base = {
      requestVersion: 1,
      requestType: ATTESTATION_REQUEST_TYPE,
      recordKey,
      authorityRecordDigest: authority.authorityRecordDigest,
      generationCommitment: authority.authorityGeneration.generationCommitment,
      keyId: authority.keyId,
      audienceDigest: hashCommitment(ATTESTATION_AUDIENCE_DOMAIN, target),
      observerRecordId: state.observerRecordId,
      targetBindingDigest: state.targetBindingDigest,
      candidateDigest: hashCommitment(ATTESTATION_CANDIDATE_DOMAIN, candidate),
      inclusionAuthorizationId: candidate.inclusionAuthorizationId,
      bootstrapCheckpoint: cloneTrusted(authority.bootstrapCheckpoint),
      sourcePolicyCommitment: authority.sourcePolicyCommitment,
      unsignedFundingEvidenceDigest: hashCommitment(
        ATTESTATION_EVIDENCE_DOMAIN,
        unsignedFundingEvidence,
      ),
    };
    return parseZenonFundingProviderAttestationRequest({
      authorityRecord: authority,
      request: {
        ...base,
        attestationId: hashCommitment(ATTESTATION_ID_DOMAIN, base),
        unsignedFundingEvidence,
      },
    });
  } catch (error) {
    if (attestationErrorCode(error) !== null) {
      fail('ZENON_FUNDING_OBSERVER_STORE_ATTESTATION_REJECTED');
    }
    fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
  }
}

function preparedOutbox(authority, recordKey, state) {
  const request = requestForState(authority, recordKey, state);
  if (request === null) return emptyOutbox();
  return deepFreeze({
    ...emptyOutbox(),
    revision: 1,
    status: ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.PREPARED,
    attestationId: request.attestationId,
    request,
  });
}

function publicOutbox(outbox) {
  return deepFreeze({
    outboxVersion: outbox.outboxVersion,
    revision: outbox.revision,
    status: outbox.status,
  });
}

function fundingEvidenceArtifact(recordKey, authority, outbox) {
  const artifact = {
    artifactVersion: 1,
    artifactType: 'zenon-provider-attestation-ready-reference',
    recordKey,
    authorityRecordDigest: authority.authorityRecordDigest,
    attestationId: outbox.attestationId,
    envelopeDigest: outbox.envelopeDigest,
  };
  return deepFreeze({
    evidenceVersion: 1,
    artifact: deepFreeze({
      ...artifact,
      artifactDigest: hashCommitment(READY_ARTIFACT_DOMAIN, artifact),
    }),
  });
}

function recordKeyFor(state, authority) {
  return hashCommitment(RECORD_KEY_DOMAIN, {
    storeSchemaVersion: ZENON_FUNDING_OBSERVER_SQLITE_STORE_SCHEMA_VERSION,
    observerRecordId: state.observerRecordId,
    targetBindingDigest: state.targetBindingDigest,
    authorityRecordDigest: authority.authorityRecordDigest,
  });
}

export function deriveZenonFundingObserverSqliteRecordKey(initialState, authorityRecordText) {
  try {
    const authority = parseZenonFundingProviderAttestationAuthorityRecord(authorityRecordText);
    const stateBytes = serializeZenonFundingObserverState(initialState);
    if (
      stateBytes.length === 0
      || stateBytes.length > HARD_MAX_STATE_BYTES
      || byteLength(stateBytes) > HARD_MAX_STATE_BYTES
    ) {
      fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    }
    const state = parseZenonFundingObserverState(stateBytes);
    if (canonicalJson(state.checkpoint) !== canonicalJson(authority.bootstrapCheckpoint)) {
      fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    }
    assertAuthorityState(authority, state, true);
    assertPristineInitialState(authority, state, 'ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    return recordKeyFor(state, authority);
  } catch (error) {
    const known = storeErrorCode(error);
    throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
  }
}

function envelopeFor(recordKey, authority, stateBytes, observerRevision, outbox) {
  const withoutChecksum = {
    envelopeVersion: ENVELOPE_VERSION,
    storeSchemaVersion: ZENON_FUNDING_OBSERVER_SQLITE_STORE_SCHEMA_VERSION,
    observerRevision,
    observerStateSchemaVersion: ZENON_FUNDING_OBSERVER_STATE_SCHEMA_VERSION,
    outboxRevision: outbox.revision,
    recordKey,
    authorityRecordDigest: authority.authorityRecordDigest,
    authorityRecordText: authority.canonicalText,
    bootstrapCheckpoint: authority.bootstrapCheckpoint,
    stateBytes,
    outbox,
  };
  return {
    ...withoutChecksum,
    checksum: hashCommitment(ENVELOPE_DOMAIN, withoutChecksum),
  };
}

function captureHooks(input) {
  if (input === undefined) return OBJECT_FREEZE({});
  const hooks = exactDataObject(input, [], [
    'beforeBegin',
    'afterBegin',
    'beforeWrite',
    'afterWrite',
    'beforeCommit',
    'commitAttempt',
    'afterCommit',
  ]);
  const captured = {};
  for (const key of OBJECT_KEYS(hooks)) {
    if (typeof hooks[key] !== 'function') {
      fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_CONFIGURATION');
    }
    captured[key] = hooks[key];
  }
  return OBJECT_FREEZE(captured);
}

function boundedInteger(value, minimum, maximum) {
  return NUMBER_IS_SAFE_INTEGER(value) && value >= minimum && value <= maximum;
}

function captureCommon(value) {
  if (
    typeof value.databasePath !== 'string'
    || typeof value.allowedRoot !== 'string'
    || !isAbsolute(value.databasePath)
    || !isAbsolute(value.allowedRoot)
  ) {
    fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_CONFIGURATION');
  }
  const databasePath = resolve(value.databasePath);
  const allowedRoot = resolve(value.allowedRoot);
  if (databasePath !== value.databasePath || allowedRoot !== value.allowedRoot) {
    fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_CONFIGURATION');
  }
  const busyTimeoutMs = value.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
  const maxStateBytes = value.maxStateBytes ?? DEFAULT_MAX_STATE_BYTES;
  if (
    !boundedInteger(busyTimeoutMs, 1, MAX_BUSY_TIMEOUT_MS)
    || !boundedInteger(maxStateBytes, 4_096, HARD_MAX_STATE_BYTES)
  ) {
    fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_CONFIGURATION');
  }
  return {
    allowedRoot,
    busyTimeoutMs,
    databasePath,
    maxStateBytes,
    testHooks: captureHooks(value.testHooks),
  };
}

function captureCreateConfiguration(options) {
  const value = exactDataObject(options, [
    'databasePath',
    'allowedRoot',
    'initialState',
    'authorityRecord',
  ], ['busyTimeoutMs', 'maxStateBytes', 'testHooks']);
  const common = captureCommon(value);
  let state;
  let authority;
  try {
    authority = parseZenonFundingProviderAttestationAuthorityRecord(value.authorityRecord);
    const stateBytes = serializeZenonFundingObserverState(value.initialState);
    if (byteLength(stateBytes) > common.maxStateBytes) {
      fail('ZENON_FUNDING_OBSERVER_STORE_CAPACITY_EXCEEDED');
    }
    state = parseZenonFundingObserverState(stateBytes);
    if (canonicalJson(state.checkpoint) !== canonicalJson(authority.bootstrapCheckpoint)) {
      fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_CONFIGURATION');
    }
    assertAuthorityState(authority, state, true);
    assertPristineInitialState(
      authority,
      state,
      'ZENON_FUNDING_OBSERVER_STORE_INVALID_CONFIGURATION',
    );
  } catch (error) {
    const known = storeErrorCode(error);
    throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_INVALID_CONFIGURATION');
  }
  return OBJECT_FREEZE({ ...common, initialState: state, authority });
}

function captureOpenConfiguration(options) {
  const value = exactDataObject(options, [
    'databasePath',
    'allowedRoot',
    'expectedRecordKey',
    'authorityRecord',
  ], ['busyTimeoutMs', 'maxStateBytes', 'testHooks']);
  const common = captureCommon(value);
  if (!validDigest(value.expectedRecordKey)) {
    fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_CONFIGURATION');
  }
  let authority;
  try {
    authority = parseZenonFundingProviderAttestationAuthorityRecord(value.authorityRecord);
  } catch {
    fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_CONFIGURATION');
  }
  return OBJECT_FREEZE({
    ...common,
    expectedRecordKey: value.expectedRecordKey,
    authority,
  });
}

function within(root, candidate) {
  const fromRoot = relative(root, candidate);
  return fromRoot === '' || (
    fromRoot !== '..'
    && !REFLECT_APPLY(STRING_STARTS_WITH, fromRoot, [`..${sep}`])
    && !isAbsolute(fromRoot)
  );
}

function privateDirectory(stat, uid) {
  return stat.isDirectory()
    && !stat.isSymbolicLink()
    && stat.uid === BigInt(uid)
    && (stat.mode & 0o777n) === 0o700n
    && (stat.mode & 0o7000n) === 0n;
}

function safeDatabaseFile(stat, uid) {
  return stat.isFile()
    && !stat.isSymbolicLink()
    && stat.uid === BigInt(uid)
    && stat.nlink === 1n
    && (stat.mode & 0o777n) === 0o600n
    && (stat.mode & 0o7000n) === 0n;
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameGeneration(left, right) {
  return sameIdentity(left, right)
    && left.uid === right.uid
    && left.gid === right.gid
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function validatePathBoundary(configuration) {
  try {
    if (typeof process.getuid !== 'function') {
      fail('ZENON_FUNDING_OBSERVER_STORE_UNSAFE_DIRECTORY');
    }
    const uid = process.getuid();
    if (!NUMBER_IS_SAFE_INTEGER(uid) || uid < 0) {
      fail('ZENON_FUNDING_OBSERVER_STORE_UNSAFE_DIRECTORY');
    }
    const parent = dirname(configuration.databasePath);
    if (
      configuration.databasePath === configuration.allowedRoot
      || !within(configuration.allowedRoot, configuration.databasePath)
      || !within(configuration.allowedRoot, parent)
    ) {
      fail('ZENON_FUNDING_OBSERVER_STORE_PATH_OUTSIDE_ALLOWED_ROOT');
    }
    const fromRoot = relative(configuration.allowedRoot, parent);
    const components = fromRoot === '' ? [] : fromRoot.split(sep);
    let current = configuration.allowedRoot;
    for (const component of ['', ...components]) {
      if (component !== '') current = resolve(current, component);
      const stat = lstatSync(current, { bigint: true });
      if (!privateDirectory(stat, uid) || realpathSync(current) !== current) {
        fail('ZENON_FUNDING_OBSERVER_STORE_UNSAFE_DIRECTORY');
      }
    }
    if (!within(realpathSync(configuration.allowedRoot), realpathSync(parent))) {
      fail('ZENON_FUNDING_OBSERVER_STORE_PATH_OUTSIDE_ALLOWED_ROOT');
    }
    return { uid };
  } catch (error) {
    const known = storeErrorCode(error);
    throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_UNSAFE_DIRECTORY');
  }
}

function inspectSidecars(configuration, uid, creating = false) {
  try {
    const parent = dirname(configuration.databasePath);
    const basename = REFLECT_APPLY(STRING_SLICE, configuration.databasePath, [
      parent.length + 1,
    ]);
    let hotJournal = false;
    for (const entry of readdirSync(parent)) {
      if (!REFLECT_APPLY(STRING_STARTS_WITH, entry, [`${basename}-`])) continue;
      if (creating || entry !== `${basename}-journal`) {
        fail('ZENON_FUNDING_OBSERVER_STORE_UNEXPECTED_SIDECAR');
      }
      const stat = lstatSync(resolve(parent, entry), { bigint: true });
      if (!safeDatabaseFile(stat, uid)) {
        fail('ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE');
      }
      hotJournal = true;
    }
    return hotJournal;
  } catch (error) {
    const known = storeErrorCode(error);
    throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE');
  }
}

function createExclusiveDatabaseFile(configuration, boundary) {
  let descriptor;
  try {
    const { O_CLOEXEC = 0, O_CREAT, O_EXCL, O_NOFOLLOW = 0, O_RDWR } = fsConstants;
    if (O_NOFOLLOW === 0) fail('ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE');
    descriptor = openSync(
      configuration.databasePath,
      O_RDWR | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC,
      0o600,
    );
    fchmodSync(descriptor, 0o600);
    const opened = fstatSync(descriptor, { bigint: true });
    if (!safeDatabaseFile(opened, boundary.uid)) {
      fail('ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE');
    }
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    const current = lstatSync(configuration.databasePath, { bigint: true });
    if (!safeDatabaseFile(current, boundary.uid) || !sameGeneration(opened, current)) {
      fail('ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE');
    }
    return current;
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch {}
    }
    const known = storeErrorCode(error);
    if (known !== null) throw failure(known);
    let exists = false;
    try {
      const descriptorCode = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(error, 'code');
      exists = descriptorCode && OBJECT_HAS_OWN(descriptorCode, 'value')
        && descriptorCode.value === 'EEXIST';
    } catch {}
    throw failure(exists
      ? 'ZENON_FUNDING_OBSERVER_STORE_ALREADY_EXISTS'
      : 'ZENON_FUNDING_OBSERVER_STORE_CREATE_FAILED');
  }
}

function inspectExistingDatabaseFile(configuration, boundary) {
  try {
    const stat = lstatSync(configuration.databasePath, { bigint: true });
    if (
      !safeDatabaseFile(stat, boundary.uid)
      || realpathSync(configuration.databasePath) !== configuration.databasePath
    ) {
      fail('ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE');
    }
    return stat;
  } catch (error) {
    const known = storeErrorCode(error);
    if (known !== null) throw failure(known);
    let missing = false;
    try {
      const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(error, 'code');
      missing = descriptor && OBJECT_HAS_OWN(descriptor, 'value')
        && descriptor.value === 'ENOENT';
    } catch {}
    if (missing) fail('ZENON_FUNDING_OBSERVER_STORE_MISSING');
    fail('ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE');
  }
}

function pragmaValue(database, sql, field) {
  return database.prepare(sql).get()?.[field];
}

function assertConnection(database, busyTimeoutMs) {
  if (
    pragmaValue(database, 'PRAGMA journal_mode', 'journal_mode') !== 'delete'
    || pragmaValue(database, 'PRAGMA busy_timeout', 'timeout') !== busyTimeoutMs
    || pragmaValue(database, 'PRAGMA synchronous', 'synchronous') !== 2
    || pragmaValue(database, 'PRAGMA foreign_keys', 'foreign_keys') !== 1
    || pragmaValue(database, 'PRAGMA trusted_schema', 'trusted_schema') !== 0
    || pragmaValue(database, 'PRAGMA recursive_triggers', 'recursive_triggers') !== 0
    || (
      process.platform === 'darwin'
      && pragmaValue(database, 'PRAGMA fullfsync', 'fullfsync') !== 1
    )
  ) {
    fail('ZENON_FUNDING_OBSERVER_STORE_CONFIGURATION_FAILED');
  }
}

function configureConnection(database, configuration, creating) {
  try {
    database.exec(`PRAGMA busy_timeout = ${configuration.busyTimeoutMs}`);
    const mode = pragmaValue(
      database,
      creating ? 'PRAGMA journal_mode = DELETE' : 'PRAGMA journal_mode',
      'journal_mode',
    );
    if (mode !== 'delete') fail('ZENON_FUNDING_OBSERVER_STORE_SCHEMA_UNSUPPORTED');
    database.exec('PRAGMA synchronous = FULL');
    database.exec('PRAGMA foreign_keys = ON');
    database.exec('PRAGMA trusted_schema = OFF');
    database.exec('PRAGMA recursive_triggers = OFF');
    if (process.platform === 'darwin') database.exec('PRAGMA fullfsync = ON');
    assertConnection(database, configuration.busyTimeoutMs);
  } catch (error) {
    const known = storeErrorCode(error);
    throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_CONFIGURATION_FAILED');
  }
}

function openDatabase(configuration, before, creating, boundary) {
  let database;
  try {
    const hotJournal = inspectSidecars(configuration, boundary.uid, creating);
    database = new DatabaseSync(configuration.databasePath, {
      allowExtension: false,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      readOnly: false,
      timeout: configuration.busyTimeoutMs,
    });
    const after = lstatSync(configuration.databasePath, { bigint: true });
    if (
      !safeDatabaseFile(after, boundary.uid)
      || (hotJournal ? !sameIdentity(before, after) : !sameGeneration(before, after))
    ) {
      fail('ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE');
    }
    configureConnection(database, configuration, creating);
    return database;
  } catch (error) {
    try { database?.close(); } catch {}
    const known = storeErrorCode(error);
    throw failure(known ?? (creating
      ? 'ZENON_FUNDING_OBSERVER_STORE_OPEN_FAILED'
      : 'ZENON_FUNDING_OBSERVER_STORE_CORRUPT'));
  }
}

function mapObserverFailure(error, persisted = false) {
  const code = observerErrorCode(error);
  if (code === null) {
    throw failure(persisted
      ? 'ZENON_FUNDING_OBSERVER_STORE_CORRUPT'
      : 'ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
  }
  if (code === 'ZENON_FUNDING_OBSERVER_STALE_REVISION') {
    throw failure('ZENON_FUNDING_OBSERVER_STORE_STALE_REVISION');
  }
  throw failure(persisted
    ? 'ZENON_FUNDING_OBSERVER_STORE_CORRUPT'
    : 'ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
}

function captureExpectedRevision(value) {
  if (!NUMBER_IS_SAFE_INTEGER(value) || value < 0) {
    fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
  }
  return value;
}

const OUTBOX_KEYS = [
  'outboxVersion',
  'revision',
  'status',
  'attestationId',
  'request',
  'envelope',
  'envelopeDigest',
  'conflictingEnvelope',
  'conflictingEnvelopeDigest',
  'priorStatus',
  'invalidationReason',
];

function outboxHasPayload(value) {
  for (let index = 3; index < OUTBOX_KEYS.length; index += 1) {
    if (value[OUTBOX_KEYS[index]] !== null) return true;
  }
  return false;
}

function parseStoredRequest(authority, request) {
  try {
    return parseZenonFundingProviderAttestationRequest({
      authorityRecord: authority,
      request: cloneTrusted(request),
    });
  } catch {
    fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
  }
}

function requestMatchesState(request, state, recordKey) {
  const evidence = request.unsignedFundingEvidence;
  const target = state.target;
  return request.recordKey === recordKey
    && request.observerRecordId === state.observerRecordId
    && request.targetBindingDigest === state.targetBindingDigest
    && request.inclusionAuthorizationId === state.inclusion?.inclusionAuthorizationId
    && evidence.transactionId === target.transactionId
    && evidence.payer === target.payer
    && evidence.payee === target.payee
    && evidence.asset === target.asset
    && evidence.amount === target.amount
    && evidence.paymentResourceDigest === target.paymentResourceDigest
    && evidence.paymentRequirementDigest === target.paymentRequirementDigest
    && evidence.paymentIntentDigest === target.paymentIntentDigest
    && evidence.resourceBinding === target.resourceBinding
    && evidence.offerId === target.offerId
    && evidence.offerVersion === target.offerVersion
    && evidence.fundingPolicyId === target.fundingPolicyId
    && evidence.fundingPolicyVersion === target.fundingPolicyVersion
    && evidence.capabilityCommitment === target.capabilityCommitment
    && evidence.totalUnits === target.totalUnits
    && evidence.expiresAt === target.expiresAt
    && evidence.grantFundingCommitment === target.grantFundingCommitment
    && evidence.inclusionEvidence?.transactionHash === REFLECT_APPLY(
      STRING_SLICE,
      target.transactionId,
      ['zenontx:'.length],
    )
    && evidence.inclusionEvidence?.momentumHeight === state.inclusion?.momentumHeight
    && evidence.inclusionEvidence?.momentumHash === state.inclusion?.momentumHash
    && evidence.inclusionEvidence?.observedConfirmations === state.firstThreshold?.confirmations;
}

function verifyStoredEnvelope(authority, request, envelope, expectedDigest) {
  try {
    const verified = verifyZenonFundingProviderAttestationEnvelope({
      authorityRecord: authority,
      request: cloneTrusted(request),
      envelope: cloneTrusted(envelope),
      nowEpochSeconds: 0,
      replayMode: 'COMMITTED_REPLAY',
    });
    if (verified.envelopeDigest !== expectedDigest) {
      fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
    }
    return deepFreeze({
      ...verified,
      verifiedRecord: cloneTrusted(request.unsignedFundingEvidence),
    });
  } catch (error) {
    const known = storeErrorCode(error);
    throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
  }
}

function normalizeOutbox(input, authority, state, recordKey) {
  const value = exactDataObject(
    snapshotJson(input),
    OUTBOX_KEYS,
    [],
    'ZENON_FUNDING_OBSERVER_STORE_CORRUPT',
  );
  if (
    value.outboxVersion !== ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_VERSION
    || !NUMBER_IS_SAFE_INTEGER(value.revision)
    || value.revision < 0
    || (
      value.status !== ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.NONE
      && value.status !== ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.PREPARED
      && value.status !== ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.READY
      && value.status !== ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.INVALIDATED
      && value.status !== ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.EQUIVOCATED
    )
  ) {
    fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
  }
  if (value.status === ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.NONE) {
    if (
      value.revision !== 0
      || state.firstThreshold !== null
      || outboxHasPayload(value)
    ) {
      fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
    }
    return emptyOutbox();
  }
  if (value.request === null || value.attestationId === null) {
    fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
  }
  const request = parseStoredRequest(authority, value.request);
  if (
    request.attestationId !== value.attestationId
    || !requestMatchesState(request, state, recordKey)
  ) {
    fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
  }
  const expected = requestForState(authority, recordKey, state);
  if (expected === null || canonicalJson(expected) !== canonicalJson(request)) {
    fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
  }
  if (value.status === ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.PREPARED) {
    if (
      value.revision !== 1
      || state.status !== ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED
      || value.envelope !== null
      || value.envelopeDigest !== null
      || value.conflictingEnvelope !== null
      || value.conflictingEnvelopeDigest !== null
      || value.priorStatus !== null
      || value.invalidationReason !== null
    ) {
      fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
    }
  } else if (value.status === ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.READY) {
    if (
      value.revision !== 2
      || state.status !== ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED
      || value.envelope === null
      || !validDigest(value.envelopeDigest)
      || value.conflictingEnvelope !== null
      || value.conflictingEnvelopeDigest !== null
      || value.priorStatus !== null
      || value.invalidationReason !== null
    ) {
      fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
    }
    verifyStoredEnvelope(authority, request, value.envelope, value.envelopeDigest);
  } else if (
    value.status === ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.INVALIDATED
  ) {
    const fromPrepared = value.priorStatus
      === ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.PREPARED;
    const fromReady = value.priorStatus
      === ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.READY;
    if (
      (!fromPrepared && !fromReady)
      || value.revision !== (fromPrepared ? 2 : 3)
      || state.status !== ZENON_FUNDING_OBSERVER_STATUS.QUARANTINED
      || value.invalidationReason !== state.quarantine?.reason
      || value.conflictingEnvelope !== null
      || value.conflictingEnvelopeDigest !== null
      || (fromPrepared && (value.envelope !== null || value.envelopeDigest !== null))
      || (fromReady && (value.envelope === null || !validDigest(value.envelopeDigest)))
    ) {
      fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
    }
    if (fromReady) {
      verifyStoredEnvelope(authority, request, value.envelope, value.envelopeDigest);
    }
  } else if (value.status === ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.EQUIVOCATED) {
    if (
      value.revision !== 3
      || (
        state.status !== ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED
        && state.status !== ZENON_FUNDING_OBSERVER_STATUS.QUARANTINED
      )
      || value.priorStatus !== ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.READY
      || value.invalidationReason !== null
      || value.envelope === null
      || value.conflictingEnvelope === null
      || !validDigest(value.envelopeDigest)
      || !validDigest(value.conflictingEnvelopeDigest)
      || canonicalJson(value.envelope) === canonicalJson(value.conflictingEnvelope)
    ) {
      fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
    }
    verifyStoredEnvelope(authority, request, value.envelope, value.envelopeDigest);
    verifyStoredEnvelope(
      authority,
      request,
      value.conflictingEnvelope,
      value.conflictingEnvelopeDigest,
    );
  }
  return deepFreeze({
    outboxVersion: value.outboxVersion,
    revision: value.revision,
    status: value.status,
    attestationId: value.attestationId,
    request,
    envelope: value.envelope === null ? null : cloneTrusted(value.envelope),
    envelopeDigest: value.envelopeDigest,
    conflictingEnvelope: value.conflictingEnvelope === null
      ? null
      : cloneTrusted(value.conflictingEnvelope),
    conflictingEnvelopeDigest: value.conflictingEnvelopeDigest,
    priorStatus: value.priorStatus,
    invalidationReason: value.invalidationReason,
  });
}

function reconcileOutbox(authority, recordKey, previous, nextState) {
  if (nextState.status === ZENON_FUNDING_OBSERVER_STATUS.QUARANTINED) {
    if (
      previous.status === ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.PREPARED
      || previous.status === ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.READY
    ) {
      return deepFreeze({
        ...previous,
        revision: previous.revision + 1,
        status: ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.INVALIDATED,
        priorStatus: previous.status,
        invalidationReason: nextState.quarantine.reason,
      });
    }
    return previous;
  }
  const expectedRequest = requestForState(authority, recordKey, nextState);
  if (expectedRequest === null) return previous;
  if (previous.status === ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.NONE) {
    return deepFreeze({
      ...emptyOutbox(),
      revision: 1,
      status: ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.PREPARED,
      attestationId: expectedRequest.attestationId,
      request: expectedRequest,
    });
  }
  if (
    previous.status === ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.PREPARED
    || previous.status === ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.READY
  ) {
    if (canonicalJson(previous.request) !== canonicalJson(expectedRequest)) {
      fail('ZENON_FUNDING_OBSERVER_STORE_INVARIANT_VIOLATION');
    }
  }
  return previous;
}

function captureFundingEvidenceReference(input) {
  const value = exactDataObject(
    snapshotJson(input),
    ['evidenceVersion', 'artifact'],
    [],
    'ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT',
  );
  const artifact = exactDataObject(
    value.artifact,
    [
      'artifactVersion',
      'artifactType',
      'recordKey',
      'authorityRecordDigest',
      'attestationId',
      'envelopeDigest',
      'artifactDigest',
    ],
    [],
    'ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT',
  );
  if (
    value.evidenceVersion !== 1
    || artifact.artifactVersion !== 1
    || artifact.artifactType !== 'zenon-provider-attestation-ready-reference'
  ) {
    fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
  }
  for (const key of [
    'recordKey',
    'authorityRecordDigest',
    'attestationId',
    'envelopeDigest',
    'artifactDigest',
  ]) {
    if (!validDigest(artifact[key])) fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
  }
  const withoutDigest = {
    artifactVersion: artifact.artifactVersion,
    artifactType: artifact.artifactType,
    recordKey: artifact.recordKey,
    authorityRecordDigest: artifact.authorityRecordDigest,
    attestationId: artifact.attestationId,
    envelopeDigest: artifact.envelopeDigest,
  };
  if (hashCommitment(READY_ARTIFACT_DOMAIN, withoutDigest) !== artifact.artifactDigest) {
    fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
  }
  return deepFreeze({ evidenceVersion: 1, artifact: deepFreeze({ ...artifact }) });
}

function publicRecord(recordKey, authority, state, outbox) {
  return deepFreeze({
    storeSchemaVersion: ZENON_FUNDING_OBSERVER_SQLITE_STORE_SCHEMA_VERSION,
    recordKey,
    authorityRecordDigest: authority.authorityRecordDigest,
    state: cloneTrusted(state),
    outbox: publicOutbox(outbox),
  });
}

function publicTransition(state, outbox, disposition) {
  return deepFreeze({
    state: cloneTrusted(state),
    outbox: publicOutbox(outbox),
    disposition,
  });
}

export class ZenonFundingObserverSqliteStore {
  #configuration;
  #database;
  #identity;
  #recordKey;
  #authority;
  #closed = false;
  #quarantined = false;
  #operationActive = false;
  #hookActive = false;
  #hookReentry = false;

  constructor(token, configuration, database, identity, recordKey, authority) {
    if (token !== CONSTRUCTOR_TOKEN) {
      fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_CONFIGURATION');
    }
    if (!validDigest(recordKey)) {
      fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_CONFIGURATION');
    }
    this.#configuration = configuration;
    this.#database = database;
    this.#identity = identity;
    this.#recordKey = recordKey;
    this.#authority = authority;
  }

  static create(options) {
    const configuration = captureCreateConfiguration(options);
    const recordKey = deriveZenonFundingObserverSqliteRecordKey(
      configuration.initialState,
      configuration.authority.canonicalText,
    );
    const boundary = validatePathBoundary(configuration);
    inspectSidecars(configuration, boundary.uid, true);
    const before = createExclusiveDatabaseFile(configuration, boundary);
    const database = openDatabase(configuration, before, true, boundary);
    const store = new ZenonFundingObserverSqliteStore(
      CONSTRUCTOR_TOKEN,
      configuration,
      database,
      before,
      recordKey,
      configuration.authority,
    );
    try {
      store.#initialize();
      return store;
    } catch (error) {
      store.#closeAfterFailure();
      const known = storeErrorCode(error);
      throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_CREATE_FAILED');
    }
  }

  static openExisting(options) {
    const configuration = captureOpenConfiguration(options);
    const boundary = validatePathBoundary(configuration);
    const before = inspectExistingDatabaseFile(configuration, boundary);
    const database = openDatabase(configuration, before, false, boundary);
    const store = new ZenonFundingObserverSqliteStore(
      CONSTRUCTOR_TOKEN,
      configuration,
      database,
      before,
      configuration.expectedRecordKey,
      configuration.authority,
    );
    try {
      const loaded = store.#readCommitted();
      if (loaded.recordKey !== configuration.expectedRecordKey) {
        fail('ZENON_FUNDING_OBSERVER_STORE_RECORD_KEY_MISMATCH');
      }
      store.#refreshIdentity();
      return store;
    } catch (error) {
      store.#closeAfterFailure();
      const known = storeErrorCode(error);
      throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_OPEN_FAILED');
    }
  }

  load() {
    return this.#runPublic(() => {
      const loaded = this.#safeRead();
      return publicRecord(loaded.recordKey, this.#authority, loaded.state, loaded.outbox);
    });
  }

  planBackfill(input) {
    const captured = exactDataObject(input, ['expectedRevision', 'frontier'], [],
      'ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    const expectedRevision = captureExpectedRevision(captured.expectedRevision);
    const frontier = snapshotJson(captured.frontier);
    return this.#runPublic(() => {
      const loaded = this.#safeRead();
      if (loaded.state.revision !== expectedRevision) {
        fail('ZENON_FUNDING_OBSERVER_STORE_STALE_REVISION');
      }
      const outcome = this.#derivePlanOutcome(loaded, expectedRevision, frontier);
      if (canonicalJson(outcome.state) !== canonicalJson(loaded.state)) {
        if (outcome.disposition !== 'QUARANTINED' || outcome.plan !== null) {
          fail('ZENON_FUNDING_OBSERVER_STORE_INVARIANT_VIOLATION');
        }
        return this.#persistPlanningQuarantine(expectedRevision, frontier);
      }
      return cloneTrusted(outcome);
    });
  }

  applyPage(input) {
    const captured = exactDataObject(input, ['expectedRevision', 'plan', 'momentums'], [],
      'ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    const expectedRevision = captureExpectedRevision(captured.expectedRevision);
    const plan = snapshotJson(captured.plan);
    const momentums = snapshotJson(captured.momentums);
    return this.#mutate('applyPage', expectedRevision, loaded => {
      if (
        plan.observerRecordId !== loaded.state.observerRecordId
        || plan.targetBindingDigest !== loaded.state.targetBindingDigest
        || canonicalJson(plan.authorityGeneration) !== canonicalJson(loaded.state.authorityGeneration)
        || canonicalJson(plan.chainProfile) !== canonicalJson(loaded.state.chainProfile)
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CONTEXT_MISMATCH');
      }
      const page = {
        pageVersion: 1,
        observerRecordId: loaded.state.observerRecordId,
        targetBindingDigest: loaded.state.targetBindingDigest,
        authorityGeneration: cloneTrusted(loaded.state.authorityGeneration),
        chainProfile: cloneTrusted(loaded.state.chainProfile),
        planId: plan.planId,
        startCheckpoint: cloneTrusted(plan.startCheckpoint),
        frontier: cloneTrusted(plan.frontier),
        entries: cloneTrusted(momentums),
      };
      try {
        return applyZenonFundingObserverPage({
          state: cloneTrusted(loaded.state),
          expectedRevision,
          plan: cloneTrusted(plan),
          page,
        });
      } catch (error) {
        mapObserverFailure(error, false);
      }
    });
  }

  applyInclusion(input) {
    const captured = exactDataObject(input, [
      'expectedRevision',
      'target',
      'observation',
    ], [], 'ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    const expectedRevision = captureExpectedRevision(captured.expectedRevision);
    const target = snapshotJson(captured.target);
    const observation = snapshotJson(captured.observation);
    return this.#mutate('applyInclusion', expectedRevision, loaded => {
      if (canonicalJson(target) !== canonicalJson(loaded.state.target)) {
        fail('ZENON_FUNDING_OBSERVER_STORE_TARGET_MISMATCH');
      }
      try {
        return applyZenonFundingInclusionObservation({
          state: cloneTrusted(loaded.state),
          expectedRevision,
          observerRecordId: loaded.state.observerRecordId,
          targetBindingDigest: loaded.state.targetBindingDigest,
          authorityGeneration: cloneTrusted(loaded.state.authorityGeneration),
          chainProfile: cloneTrusted(loaded.state.chainProfile),
          observation: cloneTrusted(observation),
        });
      } catch (error) {
        mapObserverFailure(error, false);
      }
    });
  }

  projectCommittedCandidate() {
    return this.#runPublic(() => {
      const loaded = this.#safeRead();
      if (
        loaded.outbox.status
          === ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.INVALIDATED
        || loaded.outbox.status
          === ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.EQUIVOCATED
      ) {
        return null;
      }
      let candidate;
      try {
        candidate = projectZenonFundingObservationCandidate(cloneTrusted(loaded.state));
      } catch (error) {
        mapObserverFailure(error, true);
      }
      return candidate === null ? null : cloneTrusted(candidate);
    });
  }

  peekPreparedAttestation() {
    return this.#runPublic(() => {
      const loaded = this.#safeRead();
      if (
        loaded.outbox.status
        !== ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.PREPARED
      ) {
        return null;
      }
      return cloneTrusted(loaded.outbox.request);
    });
  }

  commitAuthenticatedEnvelope(input) {
    const captured = exactDataObject(input, [
      'expectedObserverRevision',
      'expectedOutboxRevision',
      'attestationId',
      'envelope',
      'nowEpochSeconds',
    ], [], 'ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    const expectedObserverRevision = captureExpectedRevision(
      captured.expectedObserverRevision,
    );
    const expectedOutboxRevision = captureExpectedRevision(captured.expectedOutboxRevision);
    if (!validDigest(captured.attestationId)) {
      fail('ZENON_FUNDING_OBSERVER_STORE_INVALID_INPUT');
    }
    const envelope = snapshotJson(captured.envelope);
    const nowEpochSeconds = captureExpectedRevision(captured.nowEpochSeconds);
    return this.#runPublic(() => this.#runTransaction(
      'commitAuthenticatedEnvelope',
      () => {
        this.#validateDatabase();
        const loaded = this.#readRecord();
        if (
          loaded.state.revision !== expectedObserverRevision
          || loaded.outbox.attestationId !== captured.attestationId
        ) {
          fail('ZENON_FUNDING_OBSERVER_STORE_STALE_REVISION');
        }
        if (
          loaded.outbox.status
          === ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.READY
          && canonicalJson(loaded.outbox.envelope) === canonicalJson(envelope)
          && (
            expectedOutboxRevision === loaded.outbox.revision
            || expectedOutboxRevision === loaded.outbox.revision - 1
          )
        ) {
          verifyStoredEnvelope(
            this.#authority,
            loaded.outbox.request,
            loaded.outbox.envelope,
            loaded.outbox.envelopeDigest,
          );
          return {
            changed: false,
            expectedEnvelopeText: loaded.envelopeText,
            expectedStateBytes: loaded.stateBytes,
            expectedOutbox: loaded.outbox,
            recordKey: loaded.recordKey,
          };
        }
        if (
          loaded.outbox.status
            !== ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.PREPARED
          && loaded.outbox.status
            !== ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.READY
        ) {
          fail('ZENON_FUNDING_OBSERVER_STORE_ATTESTATION_UNAVAILABLE');
        }
        const permittedRevision = expectedOutboxRevision === loaded.outbox.revision
          || (
            loaded.outbox.status
              === ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.READY
            && expectedOutboxRevision === loaded.outbox.revision - 1
          );
        if (!permittedRevision) {
          fail('ZENON_FUNDING_OBSERVER_STORE_STALE_REVISION');
        }
        let verified;
        try {
          verified = verifyZenonFundingProviderAttestationEnvelope({
            authorityRecord: this.#authority,
            request: cloneTrusted(loaded.outbox.request),
            envelope: cloneTrusted(envelope),
            nowEpochSeconds,
            replayMode: 'INITIAL',
          });
        } catch (error) {
          if (attestationErrorCode(error) !== null) {
            fail('ZENON_FUNDING_OBSERVER_STORE_ATTESTATION_REJECTED');
          }
          fail('ZENON_FUNDING_OBSERVER_STORE_TRANSACTION_FAILED');
        }
        let nextOutbox;
        if (
          loaded.outbox.status
          === ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.PREPARED
        ) {
          nextOutbox = deepFreeze({
            ...loaded.outbox,
            revision: loaded.outbox.revision + 1,
            status: ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.READY,
            envelope: cloneTrusted(envelope),
            envelopeDigest: verified.envelopeDigest,
          });
        } else {
          nextOutbox = deepFreeze({
            ...loaded.outbox,
            revision: loaded.outbox.revision + 1,
            status: ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.EQUIVOCATED,
            conflictingEnvelope: cloneTrusted(envelope),
            conflictingEnvelopeDigest: verified.envelopeDigest,
            priorStatus: ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.READY,
          });
        }
        const nextEnvelope = envelopeFor(
          loaded.recordKey,
          this.#authority,
          loaded.stateBytes,
          loaded.state.revision,
          nextOutbox,
        );
        this.#assertEnvelopeCapacity(nextEnvelope);
        const expectedEnvelopeText = canonicalJson(nextEnvelope);
        this.#invokeHook('beforeWrite', 'commitAuthenticatedEnvelope', true);
        const updated = this.#database.prepare(
          `UPDATE ${TABLE_NAME} SET envelope = ? WHERE singleton = 1 AND record_key = ? AND envelope = ?`,
        ).run(expectedEnvelopeText, loaded.recordKey, loaded.envelopeText);
        if (updated.changes !== 1) {
          fail('ZENON_FUNDING_OBSERVER_STORE_CONCURRENT_CONFLICT');
        }
        this.#invokeHook('afterWrite', 'commitAuthenticatedEnvelope', true);
        return {
          changed: true,
          expectedEnvelopeText,
          expectedStateBytes: loaded.stateBytes,
          expectedOutbox: nextOutbox,
          recordKey: loaded.recordKey,
        };
      },
      transactionResult => {
        this.#validateDatabase();
        const committed = this.#readRecord();
        if (
          committed.recordKey !== transactionResult.recordKey
          || committed.stateBytes !== transactionResult.expectedStateBytes
          || committed.envelopeText !== transactionResult.expectedEnvelopeText
          || canonicalJson(committed.outbox)
            !== canonicalJson(transactionResult.expectedOutbox)
        ) {
          fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
        }
        if (
          committed.outbox.status
          === ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.EQUIVOCATED
        ) {
          return deepFreeze({ disposition: 'EQUIVOCATED', fundingEvidence: null });
        }
        if (
          committed.outbox.status
          !== ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.READY
        ) {
          fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
        }
        return deepFreeze({
          disposition: 'READY',
          fundingEvidence: fundingEvidenceArtifact(
            committed.recordKey,
            this.#authority,
            committed.outbox,
          ),
        });
      },
    ));
  }

  projectCommittedFundingEvidence() {
    return this.#runPublic(() => {
      const loaded = this.#safeRead();
      if (
        loaded.outbox.status
        !== ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.READY
      ) {
        return null;
      }
      verifyStoredEnvelope(
        this.#authority,
        loaded.outbox.request,
        loaded.outbox.envelope,
        loaded.outbox.envelopeDigest,
      );
      return fundingEvidenceArtifact(loaded.recordKey, this.#authority, loaded.outbox);
    });
  }

  matchReadyFundingEvidence(input) {
    const reference = captureFundingEvidenceReference(input);
    return this.#runPublic(() => {
      const loaded = this.#safeRead();
      if (
        loaded.outbox.status
        !== ZENON_FUNDING_OBSERVER_ATTESTATION_OUTBOX_STATUS.READY
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_ATTESTATION_UNAVAILABLE');
      }
      const expected = fundingEvidenceArtifact(
        loaded.recordKey,
        this.#authority,
        loaded.outbox,
      );
      if (canonicalJson(reference) !== canonicalJson(expected)) {
        fail('ZENON_FUNDING_OBSERVER_STORE_ATTESTATION_REJECTED');
      }
      return cloneTrusted(verifyStoredEnvelope(
        this.#authority,
        loaded.outbox.request,
        loaded.outbox.envelope,
        loaded.outbox.envelopeDigest,
      ).verifiedRecord);
    });
  }

  close() {
    if (this.#closed) return;
    if (this.#operationActive) {
      if (this.#hookActive) this.#hookReentry = true;
      fail('ZENON_FUNDING_OBSERVER_STORE_REENTRANT_OPERATION');
    }
    this.#operationActive = true;
    try {
      this.#database.close();
      this.#closed = true;
    } catch {
      this.#quarantined = true;
      this.#closeAfterFailure();
      throw failure('ZENON_FUNDING_OBSERVER_STORE_CLOSE_FAILED');
    } finally {
      this.#operationActive = false;
    }
  }

  #initialize() {
    const stateBytes = serializeZenonFundingObserverState(this.#configuration.initialState);
    const recordKey = this.#recordKey;
    const outbox = preparedOutbox(
      this.#authority,
      recordKey,
      this.#configuration.initialState,
    );
    const envelope = envelopeFor(
      recordKey,
      this.#authority,
      stateBytes,
      this.#configuration.initialState.revision,
      outbox,
    );
    this.#assertEnvelopeCapacity(envelope);
    this.#runTransaction('create', () => {
      this.#database.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
      this.#database.exec(
        `PRAGMA user_version = ${ZENON_FUNDING_OBSERVER_SQLITE_STORE_SCHEMA_VERSION}`,
      );
      this.#database.exec(TABLE_SQL);
      this.#database.exec(INDEX_SQL);
      this.#database.prepare(
        `INSERT INTO ${TABLE_NAME}(singleton, record_key, envelope) VALUES (1, ?, ?)`,
      ).run(recordKey, canonicalJson(envelope));
      this.#validateDatabase();
      const loaded = this.#readRecord();
      if (loaded.recordKey !== recordKey || loaded.stateBytes !== stateBytes) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      return { changed: true, envelopeText: canonicalJson(envelope), recordKey, stateBytes };
    }, outcome => {
      const loaded = this.#readRecord();
      if (
        loaded.recordKey !== outcome.recordKey
        || loaded.stateBytes !== outcome.stateBytes
        || loaded.envelopeText !== outcome.envelopeText
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      return null;
    });
  }

  #mutate(operation, expectedRevision, transition) {
    return this.#runPublic(() => this.#runTransaction(operation, () => {
      this.#validateDatabase();
      const loaded = this.#readRecord();
      if (loaded.state.revision !== expectedRevision) {
        fail('ZENON_FUNDING_OBSERVER_STORE_STALE_REVISION');
      }
      const outcome = transition(loaded);
      if (
        outcome === null
        || typeof outcome !== 'object'
        || typeof outcome.disposition !== 'string'
        || outcome.state === null
        || typeof outcome.state !== 'object'
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_INVARIANT_VIOLATION');
      }
      let nextStateBytes;
      try {
        nextStateBytes = serializeZenonFundingObserverState(outcome.state);
      } catch (error) {
        mapObserverFailure(error, true);
      }
      if (byteLength(nextStateBytes) > this.#configuration.maxStateBytes) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CAPACITY_EXCEEDED');
      }
      assertAuthorityState(this.#authority, outcome.state);
      const nextOutbox = reconcileOutbox(
        this.#authority,
        loaded.recordKey,
        loaded.outbox,
        outcome.state,
      );
      const changed = nextStateBytes !== loaded.stateBytes
        || canonicalJson(nextOutbox) !== canonicalJson(loaded.outbox);
      let expectedEnvelopeText = loaded.envelopeText;
      if (changed) {
        this.#invokeHook('beforeWrite', operation, true);
        const nextEnvelope = envelopeFor(
          loaded.recordKey,
          this.#authority,
          nextStateBytes,
          outcome.state.revision,
          nextOutbox,
        );
        this.#assertEnvelopeCapacity(nextEnvelope);
        expectedEnvelopeText = canonicalJson(nextEnvelope);
        const updated = this.#database.prepare(
          `UPDATE ${TABLE_NAME} SET envelope = ? WHERE singleton = 1 AND record_key = ? AND envelope = ?`,
        ).run(expectedEnvelopeText, loaded.recordKey, loaded.envelopeText);
        if (updated.changes !== 1) {
          fail('ZENON_FUNDING_OBSERVER_STORE_CONCURRENT_CONFLICT');
        }
        this.#invokeHook('afterWrite', operation, true);
      }
      return {
        changed,
        disposition: outcome.disposition,
        expectedEnvelopeText,
        expectedOutbox: nextOutbox,
        expectedStateBytes: nextStateBytes,
        recordKey: loaded.recordKey,
      };
    }, transactionResult => {
      this.#validateDatabase();
      const committed = this.#readRecord();
      if (
        committed.recordKey !== transactionResult.recordKey
        || committed.stateBytes !== transactionResult.expectedStateBytes
        || committed.envelopeText !== transactionResult.expectedEnvelopeText
        || canonicalJson(committed.outbox)
          !== canonicalJson(transactionResult.expectedOutbox)
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      return publicTransition(committed.state, committed.outbox, transactionResult.disposition);
    }));
  }

  #derivePlanOutcome(loaded, expectedRevision, frontier) {
    try {
      return planZenonFundingObserverBackfill({
        state: cloneTrusted(loaded.state),
        expectedRevision,
        observerRecordId: loaded.state.observerRecordId,
        targetBindingDigest: loaded.state.targetBindingDigest,
        authorityGeneration: cloneTrusted(loaded.state.authorityGeneration),
        chainProfile: cloneTrusted(loaded.state.chainProfile),
        source: {
          status: 'AVAILABLE',
          frontier: cloneTrusted(frontier),
          checkpointHash: frontier.height < loaded.state.checkpoint.height
            ? null
            : loaded.state.checkpoint.hash,
        },
      });
    } catch (error) {
      mapObserverFailure(error, false);
    }
  }

  #persistPlanningQuarantine(expectedRevision, frontier) {
    return this.#runTransaction('planBackfill', () => {
      this.#validateDatabase();
      const loaded = this.#readRecord();
      if (loaded.state.revision !== expectedRevision) {
        fail('ZENON_FUNDING_OBSERVER_STORE_STALE_REVISION');
      }
      const outcome = this.#derivePlanOutcome(loaded, expectedRevision, frontier);
      let nextStateBytes;
      try {
        nextStateBytes = serializeZenonFundingObserverState(outcome.state);
      } catch (error) {
        mapObserverFailure(error, true);
      }
      if (
        outcome.disposition !== 'QUARANTINED'
        || outcome.plan !== null
        || nextStateBytes === loaded.stateBytes
        || byteLength(nextStateBytes) > this.#configuration.maxStateBytes
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_INVARIANT_VIOLATION');
      }
      this.#invokeHook('beforeWrite', 'planBackfill', true);
      assertAuthorityState(this.#authority, outcome.state);
      const nextOutbox = reconcileOutbox(
        this.#authority,
        loaded.recordKey,
        loaded.outbox,
        outcome.state,
      );
      const nextEnvelope = envelopeFor(
        loaded.recordKey,
        this.#authority,
        nextStateBytes,
        outcome.state.revision,
        nextOutbox,
      );
      this.#assertEnvelopeCapacity(nextEnvelope);
      const expectedEnvelopeText = canonicalJson(nextEnvelope);
      const updated = this.#database.prepare(
        `UPDATE ${TABLE_NAME} SET envelope = ? WHERE singleton = 1 AND record_key = ? AND envelope = ?`,
      ).run(expectedEnvelopeText, loaded.recordKey, loaded.envelopeText);
      if (updated.changes !== 1) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CONCURRENT_CONFLICT');
      }
      this.#invokeHook('afterWrite', 'planBackfill', true);
      return {
        changed: true,
        disposition: outcome.disposition,
        expectedEnvelopeText,
        expectedOutbox: nextOutbox,
        expectedStateBytes: nextStateBytes,
        recordKey: loaded.recordKey,
      };
    }, transactionResult => {
      this.#validateDatabase();
      const committed = this.#readRecord();
      if (
        committed.recordKey !== transactionResult.recordKey
        || committed.stateBytes !== transactionResult.expectedStateBytes
        || committed.envelopeText !== transactionResult.expectedEnvelopeText
        || canonicalJson(committed.outbox)
          !== canonicalJson(transactionResult.expectedOutbox)
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      return cloneTrusted({
        state: committed.state,
        disposition: transactionResult.disposition,
        plan: null,
      });
    });
  }

  #safeRead() {
    this.#assertUsable();
    try {
      return this.#readSnapshot(() => {
        this.#validateDatabase();
        return this.#readRecord();
      });
    } catch (error) {
      const code = storeErrorCode(error);
      if (code !== null && this.#mustLatch(code)) this.#quarantine();
      throw failure(code ?? 'ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
    }
  }

  #readCommitted() {
    return this.#readSnapshot(() => {
      this.#validateDatabase();
      return this.#readRecord();
    });
  }

  #readRecord() {
    try {
      const count = this.#database.prepare(`SELECT count(*) AS entries FROM ${TABLE_NAME}`).get();
      if (count?.entries !== 1) fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      const size = this.#database.prepare(
        `SELECT singleton, typeof(record_key) AS record_kind, length(CAST(record_key AS BLOB)) AS record_key_bytes, typeof(envelope) AS envelope_kind, length(CAST(envelope AS BLOB)) AS bytes FROM ${TABLE_NAME}`,
      ).get();
      if (
        size?.singleton !== 1
        || size?.record_kind !== 'text'
        || size?.record_key_bytes !== RECORD_KEY_BYTES
        || size?.envelope_kind !== 'text'
        || !NUMBER_IS_SAFE_INTEGER(size?.bytes)
        || size.bytes < 1
        || size.bytes > this.#configuration.maxStateBytes + MAX_ENVELOPE_OVERHEAD_BYTES
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      const row = this.#database.prepare(
        `SELECT record_key, envelope FROM ${TABLE_NAME} WHERE singleton = 1`,
      ).get();
      if (
        typeof row?.envelope !== 'string'
        || byteLength(row.envelope) !== size.bytes
        || !validDigest(row.record_key)
        || byteLength(row.record_key) !== RECORD_KEY_BYTES
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      let envelope;
      try {
        envelope = REFLECT_APPLY(JSON_PARSE, JSON, [row.envelope]);
      } catch {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      if (
        !isPlainObject(envelope)
        || REFLECT_OWN_KEYS(envelope).length !== 12
        || ![
          'envelopeVersion',
          'storeSchemaVersion',
          'observerRevision',
          'observerStateSchemaVersion',
          'outboxRevision',
          'recordKey',
          'authorityRecordDigest',
          'authorityRecordText',
          'bootstrapCheckpoint',
          'stateBytes',
          'outbox',
          'checksum',
        ].every(key => {
          const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(envelope, key);
          return descriptor?.enumerable && OBJECT_HAS_OWN(descriptor, 'value');
        })
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      if (
        envelope.envelopeVersion !== ENVELOPE_VERSION
        || envelope.storeSchemaVersion
          !== ZENON_FUNDING_OBSERVER_SQLITE_STORE_SCHEMA_VERSION
        || envelope.observerStateSchemaVersion !== ZENON_FUNDING_OBSERVER_STATE_SCHEMA_VERSION
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_SCHEMA_UNSUPPORTED');
      }
      if (
        !NUMBER_IS_SAFE_INTEGER(envelope.observerRevision)
        || envelope.observerRevision < 0
        || !NUMBER_IS_SAFE_INTEGER(envelope.outboxRevision)
        || envelope.outboxRevision < 0
        || !validDigest(envelope.recordKey)
        || envelope.recordKey !== row.record_key
        || !validDigest(envelope.authorityRecordDigest)
        || typeof envelope.authorityRecordText !== 'string'
        || envelope.authorityRecordText.length === 0
        || envelope.authorityRecordText.length > 64 * 1024
        || byteLength(envelope.authorityRecordText) > 64 * 1024
        || typeof envelope.stateBytes !== 'string'
        || envelope.stateBytes.length === 0
        || envelope.stateBytes.length > this.#configuration.maxStateBytes
        || byteLength(envelope.stateBytes) > this.#configuration.maxStateBytes
        || !validDigest(envelope.checksum)
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      if (envelope.recordKey !== this.#recordKey) {
        fail('ZENON_FUNDING_OBSERVER_STORE_RECORD_KEY_MISMATCH');
      }
      const withoutChecksum = { ...envelope };
      delete withoutChecksum.checksum;
      if (
        hashCommitment(ENVELOPE_DOMAIN, withoutChecksum) !== envelope.checksum
        || canonicalJson(envelope) !== row.envelope
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      let authority;
      try {
        authority = parseZenonFundingProviderAttestationAuthorityRecord(
          envelope.authorityRecordText,
        );
      } catch {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      if (
        authority.authorityRecordDigest !== envelope.authorityRecordDigest
        || authority.authorityRecordDigest !== this.#authority.authorityRecordDigest
        || authority.canonicalText !== this.#authority.canonicalText
        || canonicalJson(envelope.bootstrapCheckpoint)
          !== canonicalJson(authority.bootstrapCheckpoint)
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_AUTHORITY_MISMATCH');
      }
      let state;
      try {
        state = parseZenonFundingObserverState(envelope.stateBytes);
      } catch (error) {
        mapObserverFailure(error, true);
      }
      if (
        state.schemaVersion !== envelope.observerStateSchemaVersion
        || state.revision !== envelope.observerRevision
        || recordKeyFor(state, authority) !== envelope.recordKey
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      assertAuthorityState(authority, state);
      let outbox;
      try {
        outbox = normalizeOutbox(
          envelope.outbox,
          authority,
          state,
          envelope.recordKey,
        );
      } catch {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      if (outbox.revision !== envelope.outboxRevision) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      const expectedEnvelope = envelopeFor(
        envelope.recordKey,
        authority,
        envelope.stateBytes,
        envelope.observerRevision,
        outbox,
      );
      if (
        expectedEnvelope.checksum !== envelope.checksum
        || canonicalJson(expectedEnvelope) !== row.envelope
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      return {
        envelopeText: row.envelope,
        recordKey: envelope.recordKey,
        state,
        stateBytes: envelope.stateBytes,
        outbox,
      };
    } catch (error) {
      const known = storeErrorCode(error);
      throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
    }
  }

  #validateDatabase() {
    try {
      assertConnection(this.#database, this.#configuration.busyTimeoutMs);
      const integrity = this.#database.prepare('PRAGMA integrity_check').all();
      if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      if (
        pragmaValue(this.#database, 'PRAGMA application_id', 'application_id') !== APPLICATION_ID
        || pragmaValue(this.#database, 'PRAGMA user_version', 'user_version')
          !== ZENON_FUNDING_OBSERVER_SQLITE_STORE_SCHEMA_VERSION
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_SCHEMA_UNSUPPORTED');
      }
      const schema = this.#database.prepare(
        'SELECT type, name, tbl_name, sql FROM main.sqlite_schema ORDER BY type, name',
      ).all();
      if (
        schema.length !== 2
        || schema[0]?.type !== 'index'
        || schema[0]?.name !== INDEX_NAME
        || schema[0]?.tbl_name !== TABLE_NAME
        || schema[0]?.sql !== INDEX_SQL
        || schema[1]?.type !== 'table'
        || schema[1]?.name !== TABLE_NAME
        || schema[1]?.tbl_name !== TABLE_NAME
        || schema[1]?.sql !== TABLE_SQL
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      const columns = this.#database.prepare(`PRAGMA table_xinfo(${TABLE_NAME})`).all();
      if (
        columns.length !== 3
        || columns[0]?.name !== 'singleton'
        || columns[0]?.type !== 'INTEGER'
        || columns[0]?.pk !== 1
        || columns[1]?.name !== 'record_key'
        || columns[1]?.type !== 'TEXT'
        || columns[1]?.notnull !== 1
        || columns[2]?.name !== 'envelope'
        || columns[2]?.type !== 'TEXT'
        || columns[2]?.notnull !== 1
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      const index = this.#database.prepare(`PRAGMA index_xinfo(${INDEX_NAME})`).all();
      if (
        index.length !== 2
        || index[0]?.seqno !== 0
        || index[0]?.cid !== 1
        || index[0]?.name !== 'record_key'
        || index[0]?.key !== 1
        || index[1]?.cid !== -1
        || index[1]?.key !== 0
        || this.#database.prepare('PRAGMA foreign_key_check').all().length !== 0
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
      const table = this.#database.prepare('PRAGMA table_list').all()
        .find(row => row?.schema === 'main' && row?.name === TABLE_NAME);
      if (table?.type !== 'table' || table?.ncol !== 3 || table?.wr !== 0 || table?.strict !== 1) {
        fail('ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
      }
    } catch (error) {
      const known = storeErrorCode(error);
      throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_CORRUPT');
    }
  }

  #assertEnvelopeCapacity(envelope) {
    if (
      typeof envelope.stateBytes !== 'string'
      || byteLength(envelope.stateBytes) > this.#configuration.maxStateBytes
      || byteLength(canonicalJson(envelope))
        > this.#configuration.maxStateBytes + MAX_ENVELOPE_OVERHEAD_BYTES
    ) {
      fail('ZENON_FUNDING_OBSERVER_STORE_CAPACITY_EXCEEDED');
    }
  }

  #runTransaction(operation, body, postCommit) {
    this.#assertUsable();
    this.#assertFileIdentity();
    let started = false;
    let commitAttempted = false;
    let committed = false;
    try {
      this.#invokeHook('beforeBegin', operation, false);
      this.#database.exec('BEGIN IMMEDIATE');
      started = true;
      this.#invokeHook('afterBegin', operation, false);
      const outcome = body();
      this.#invokeHook('beforeCommit', operation, outcome?.changed === true);
      commitAttempted = true;
      this.#invokeHook('commitAttempt', operation, outcome?.changed === true);
      this.#database.exec('COMMIT');
      started = false;
      committed = true;
      this.#invokeHook('afterCommit', operation, outcome?.changed === true);
      this.#refreshIdentity();
      return this.#readSnapshot(() => postCommit(outcome));
    } catch (error) {
      if (started && this.#database?.isTransaction) {
        try {
          this.#database.exec('ROLLBACK');
          started = false;
        } catch {
          this.#quarantine();
          throw failure('ZENON_FUNDING_OBSERVER_STORE_ROLLBACK_FAILED');
        }
      }
      if (commitAttempted || committed) {
        this.#quarantine();
        throw failure('ZENON_FUNDING_OBSERVER_STORE_COMMIT_OUTCOME_UNKNOWN');
      }
      const known = storeErrorCode(error);
      if (known !== null && this.#mustLatch(known)) this.#quarantine();
      throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_TRANSACTION_FAILED');
    } finally {
      if (started) {
        try { this.#database.exec('ROLLBACK'); } catch { this.#quarantine(); }
      }
    }
  }

  #runPublic(operation) {
    this.#assertUsable();
    if (this.#operationActive) {
      if (this.#hookActive) this.#hookReentry = true;
      fail('ZENON_FUNDING_OBSERVER_STORE_REENTRANT_OPERATION');
    }
    this.#operationActive = true;
    try {
      return operation();
    } finally {
      this.#operationActive = false;
    }
  }

  #readSnapshot(body) {
    this.#assertUsable();
    this.#assertFileIdentity();
    let started = false;
    try {
      this.#database.exec('BEGIN');
      started = true;
      const value = body();
      this.#database.exec('COMMIT');
      started = false;
      this.#assertFileIdentity();
      return value;
    } catch (error) {
      if (started && this.#database?.isTransaction) {
        try {
          this.#database.exec('ROLLBACK');
          started = false;
        } catch {
          this.#quarantine();
          throw failure('ZENON_FUNDING_OBSERVER_STORE_ROLLBACK_FAILED');
        }
      }
      const known = storeErrorCode(error);
      throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_READ_FAILED');
    } finally {
      if (started) {
        try { this.#database.exec('ROLLBACK'); } catch { this.#quarantine(); }
      }
    }
  }

  #invokeHook(name, operation, changed) {
    const hook = this.#configuration.testHooks[name];
    if (!hook) return;
    this.#hookActive = true;
    this.#hookReentry = false;
    let failed = false;
    let result;
    try {
      result = REFLECT_APPLY(hook, undefined, [OBJECT_FREEZE({ operation, changed })]);
    } catch {
      failed = true;
    }
    const reentered = this.#hookReentry;
    this.#hookActive = false;
    this.#hookReentry = false;
    if (failed || reentered || result !== undefined) {
      fail('ZENON_FUNDING_OBSERVER_STORE_TEST_HOOK_FAILED');
    }
  }

  #assertUsable() {
    if (this.#closed) fail('ZENON_FUNDING_OBSERVER_STORE_CLOSED');
    if (this.#quarantined || this.#database?.isOpen !== true) {
      fail('ZENON_FUNDING_OBSERVER_STORE_QUARANTINED');
    }
  }

  #assertFileIdentity() {
    try {
      const boundary = validatePathBoundary(this.#configuration);
      inspectSidecars(this.#configuration, boundary.uid);
      const current = lstatSync(this.#configuration.databasePath, { bigint: true });
      if (
        !safeDatabaseFile(current, boundary.uid)
        || !sameIdentity(this.#identity, current)
        || realpathSync(this.#configuration.databasePath) !== this.#configuration.databasePath
      ) {
        fail('ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE');
      }
    } catch (error) {
      const known = storeErrorCode(error);
      throw failure(known ?? 'ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE');
    }
  }

  #refreshIdentity() {
    this.#assertFileIdentity();
    this.#identity = lstatSync(this.#configuration.databasePath, { bigint: true });
  }

  #mustLatch(code) {
    return code === 'ZENON_FUNDING_OBSERVER_STORE_CORRUPT'
      || code === 'ZENON_FUNDING_OBSERVER_STORE_SCHEMA_UNSUPPORTED'
      || code === 'ZENON_FUNDING_OBSERVER_STORE_RECORD_KEY_MISMATCH'
      || code === 'ZENON_FUNDING_OBSERVER_STORE_AUTHORITY_MISMATCH'
      || code === 'ZENON_FUNDING_OBSERVER_STORE_UNSAFE_FILE'
      || code === 'ZENON_FUNDING_OBSERVER_STORE_UNEXPECTED_SIDECAR';
  }

  #quarantine() {
    this.#quarantined = true;
    this.#closeAfterFailure();
  }

  #closeAfterFailure() {
    try { this.#database?.close(); } catch {}
    this.#closed = true;
  }
}

export function createZenonFundingObserverSqliteStore(options) {
  return ZenonFundingObserverSqliteStore.create(options);
}

export function openZenonFundingObserverSqliteStore(options) {
  return ZenonFundingObserverSqliteStore.openExisting(options);
}
