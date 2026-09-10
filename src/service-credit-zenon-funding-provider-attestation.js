import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from 'node:crypto';
import { types as utilTypes } from 'node:util';

export const ZENON_FUNDING_PROVIDER_ATTESTATION_AUTHORITY_VERSION = 1;
export const ZENON_FUNDING_PROVIDER_ATTESTATION_REQUEST_VERSION = 1;
export const ZENON_FUNDING_PROVIDER_ATTESTATION_ENVELOPE_VERSION = 1;

const AUTHORITY_RECORD_DOMAIN = 'zenon-x402:funding-provider-attestation-authority-v1';
const AUTHORITY_GENERATION_DOMAIN = 'zenon-x402:funding-provider-attestation-generation-v1';
const FUNDING_EVIDENCE_DOMAIN = 'zenon-x402:funding-provider-attestation-evidence-v1';
const ATTESTATION_ID_DOMAIN = 'zenon-x402:funding-provider-attestation-id-v1';
const ENVELOPE_DOMAIN = 'zenon-x402:funding-provider-attestation-envelope-v1';
const SIGNING_DOMAIN = Buffer.from(
  'zenon-x402:funding-provider-attestation-signature-v1\0',
  'ascii',
);
const REQUEST_TYPE = 'zenon-funding-provider-attestation-request';
const EVIDENCE_TYPE = 'zenon-authenticated-funding-evidence';
const EVIDENCE_VERSION = 1;
const NETWORK = 'zenon:testnet';
const ALGORITHM = 'Ed25519';
const CONFIRMATION_POLICY_ID = 'zenon.authenticated-momentum-inclusion';
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const COMMITMENT = /^sha256:[0-9a-f]{64}$/;
const HASH = /^[0-9a-f]{64}$/;
const TRANSACTION_ID = /^zenontx:([0-9a-f]{64})$/;
const POSITIVE_DECIMAL = /^[1-9][0-9]*$/;
const RAW_PUBLIC_KEY = /^[A-Za-z0-9_-]{43}$/;
const RAW_SIGNATURE = /^[A-Za-z0-9_-]{86}$/;
const MAX_CHAIN_IDENTIFIER = '9007199254740991';
const ZERO_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
const HARD_MAX_CANONICAL_BYTES = 512 * 1024;
const MAX_AUTHORITY_RECORD_BYTES = 64 * 1024;
const MAX_INPUT_NODES = 16_384;
const MAX_INPUT_MEMBERS = 16_384;
const MAX_INPUT_KEY_BYTES = 64 * 1024;
const MAX_INPUT_STRING_BYTES = 512 * 1024;
const MAX_ARRAY_LENGTH = 8_192;
const MAX_DEPTH = 32;

const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_JOIN = Array.prototype.join;
const ARRAY_SORT = Array.prototype.sort;
const BUFFER_BYTE_LENGTH = Buffer.byteLength;
const BUFFER_CONCAT = Buffer.concat;
const BUFFER_EQUALS = Buffer.prototype.equals;
const BUFFER_FROM = Buffer.from;
const BUFFER_TO_STRING = Buffer.prototype.toString;
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
const REGEXP_EXEC = RegExp.prototype.exec;
const REGEXP_TEST = RegExp.prototype.test;
const STRING_INCLUDES = String.prototype.includes;
const STRING_SLICE = String.prototype.slice;
const IS_PROXY = utilTypes.isProxy;
const HASH_PROTOTYPE = REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [
  createHash('sha256'),
]);
const HASH_UPDATE = HASH_PROTOTYPE.update;
const HASH_DIGEST = HASH_PROTOTYPE.digest;
const NATIVE_WEAK_SET = WeakSet;
const WEAK_SET_ADD = NATIVE_WEAK_SET.prototype.add;
const WEAK_SET_HAS = NATIVE_WEAK_SET.prototype.has;
const PARSED_AUTHORITIES = new NATIVE_WEAK_SET();

export class ZenonFundingProviderAttestationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ZenonFundingProviderAttestationError';
    this.code = code;
    this.stack = `ZenonFundingProviderAttestationError: ${code}`;
  }
}

function failure(code) {
  return new ZenonFundingProviderAttestationError(code);
}

function failAuthority() {
  throw failure('ZENON_FUNDING_PROVIDER_ATTESTATION_INVALID_AUTHORITY');
}

function failInput() {
  throw failure('ZENON_FUNDING_PROVIDER_ATTESTATION_INVALID_INPUT');
}

function failRejected() {
  throw failure('ZENON_FUNDING_PROVIDER_ATTESTATION_REJECTED');
}

function byteLength(value) {
  return REFLECT_APPLY(BUFFER_BYTE_LENGTH, Buffer, [value, 'utf8']);
}

function addBudget(budget, field, amount, maximum, onFailure) {
  budget[field] += amount;
  if (budget[field] > maximum) onFailure();
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
      addBudget(budget, 'stringBytes', byteLength(input), MAX_INPUT_STRING_BYTES, onFailure);
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
        prototype !== Array.prototype
        || !lengthDescriptor
        || lengthDescriptor.enumerable
        || !OBJECT_HAS_OWN(lengthDescriptor, 'value')
        || !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [lengthDescriptor.value])
        || lengthDescriptor.value < 0
        || lengthDescriptor.value > MAX_ARRAY_LENGTH
      ) {
        onFailure();
      }
      const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [input]);
      if (keys.length !== lengthDescriptor.value + 1 || keys[keys.length - 1] !== 'length') {
        onFailure();
      }
      addBudget(budget, 'members', lengthDescriptor.value, MAX_INPUT_MEMBERS, onFailure);
      const output = [];
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        const key = `${index}`;
        if (keys[index] !== key) onFailure();
        addBudget(budget, 'keyBytes', byteLength(key), MAX_INPUT_KEY_BYTES, onFailure);
        const descriptor = REFLECT_APPLY(
          REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
          Reflect,
          [input, key],
        );
        if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) onFailure();
        append(output, copyJson(descriptor.value, budget, depth + 1, onFailure));
      }
      return output;
    }
    if (prototype !== OBJECT_PROTOTYPE) onFailure();
    // This internal contract requires its ingress to bound serialized input
    // before materializing a plain object. Reflect.ownKeys cannot prebound an
    // already-created object with an enormous key set.
    const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [input]);
    if (keys.length > MAX_ARRAY_LENGTH) onFailure();
    addBudget(budget, 'members', keys.length, MAX_INPUT_MEMBERS, onFailure);
    const output = {};
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
      REFLECT_APPLY(OBJECT_DEFINE_PROPERTY, undefined, [output, key, {
        configurable: true,
        enumerable: true,
        value: copyJson(descriptor.value, budget, depth + 1, onFailure),
        writable: true,
      }]);
    }
    return output;
  } catch (error) {
    if (error instanceof ZenonFundingProviderAttestationError) throw error;
    onFailure();
  }
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return REFLECT_APPLY(JSON_STRINGIFY, JSON, [value]);
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
    append(entries, `${REFLECT_APPLY(JSON_STRINGIFY, JSON, [key])}:${canonicalJson(value[key])}`);
  }
  return `{${REFLECT_APPLY(ARRAY_JOIN, entries, [','])}}`;
}

function snapshotJson(input, onFailure = failInput, maximumBytes = HARD_MAX_CANONICAL_BYTES) {
  const output = copyJson(input, {
    keyBytes: 0,
    members: 0,
    nodes: 0,
    seen: new NATIVE_WEAK_SET(),
    stringBytes: 0,
  }, 0, onFailure);
  if (byteLength(canonicalJson(output)) > maximumBytes) onFailure();
  return deepFreeze(output);
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

function exactObject(input, keys, onFailure = failInput) {
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
    let permitted = false;
    for (let expectedIndex = 0; expectedIndex < keys.length; expectedIndex += 1) {
      if (observed[index] === keys[expectedIndex]) {
        permitted = true;
        break;
      }
    }
    if (typeof observed[index] !== 'string' || !permitted) onFailure();
  }
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      Reflect,
      [input, keys[index]],
    );
    if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) onFailure();
  }
  return input;
}

function commitment(domain, value) {
  const hash = createHash('sha256');
  REFLECT_APPLY(HASH_UPDATE, hash, [domain, 'ascii']);
  REFLECT_APPLY(HASH_UPDATE, hash, ['\0', 'ascii']);
  REFLECT_APPLY(HASH_UPDATE, hash, [canonicalJson(value), 'utf8']);
  return `sha256:${REFLECT_APPLY(HASH_DIGEST, hash, ['hex'])}`;
}

function sameJson(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function assertIdentifier(value, onFailure) {
  if (
    typeof value !== 'string'
    || !REFLECT_APPLY(REGEXP_TEST, IDENTIFIER, [value])
    || REFLECT_APPLY(STRING_INCLUDES, value, ['://'])
  ) {
    onFailure();
  }
}

function assertCommitment(value, onFailure) {
  if (typeof value !== 'string' || !REFLECT_APPLY(REGEXP_TEST, COMMITMENT, [value])) {
    onFailure();
  }
}

function assertHash(value, onFailure) {
  if (
    typeof value !== 'string'
    || !REFLECT_APPLY(REGEXP_TEST, HASH, [value])
    || value === ZERO_HASH
  ) {
    onFailure();
  }
}

function assertPositiveInteger(value, onFailure) {
  if (!REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [value]) || value <= 0) onFailure();
}

function assertNonnegativeInteger(value, onFailure) {
  if (!REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [value]) || value < 0) onFailure();
}

function decodeBase64url(value, expression, expectedBytes, onFailure) {
  if (typeof value !== 'string' || !REFLECT_APPLY(REGEXP_TEST, expression, [value])) onFailure();
  let decoded;
  try {
    decoded = REFLECT_APPLY(BUFFER_FROM, Buffer, [value, 'base64url']);
  } catch {
    onFailure();
  }
  if (
    decoded.length !== expectedBytes
    || REFLECT_APPLY(BUFFER_TO_STRING, decoded, ['base64url']) !== value
  ) {
    onFailure();
  }
  return decoded;
}

function normalizeChainProfile(input, onFailure) {
  const value = exactObject(input, ['version', 'chainIdentifier', 'genesisMomentumHash'], onFailure);
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

function normalizeObserverPolicy(input, onFailure) {
  const value = exactObject(input, ['policyId', 'policyVersion', 'verifierVersion'], onFailure);
  assertIdentifier(value.policyId, onFailure);
  assertPositiveInteger(value.policyVersion, onFailure);
  assertPositiveInteger(value.verifierVersion, onFailure);
  return deepFreeze({ ...value });
}

function normalizeConfirmationPolicy(input, onFailure) {
  const value = exactObject(input, [
    'policyId',
    'policyVersion',
    'minimumConfirmations',
  ], onFailure);
  if (value.policyId !== CONFIRMATION_POLICY_ID || value.policyVersion !== 1) onFailure();
  assertPositiveInteger(value.minimumConfirmations, onFailure);
  if (value.minimumConfirmations < 2 || value.minimumConfirmations > 30) onFailure();
  return deepFreeze({ ...value });
}

function normalizeCheckpoint(input, onFailure) {
  const value = exactObject(input, ['height', 'hash'], onFailure);
  assertNonnegativeInteger(value.height, onFailure);
  assertHash(value.hash, onFailure);
  return deepFreeze({ ...value });
}

function validatePublicKey(value, onFailure) {
  const raw = decodeBase64url(value, RAW_PUBLIC_KEY, 32, onFailure);
  const der = REFLECT_APPLY(BUFFER_CONCAT, Buffer, [[ED25519_SPKI_PREFIX, raw]]);
  try {
    const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ed25519') onFailure();
    const exported = key.export({ format: 'der', type: 'spki' });
    if (!REFLECT_APPLY(BUFFER_EQUALS, exported, [der])) onFailure();
  } catch {
    onFailure();
  }
}

const AUTHORITY_KEYS = [
  'authorityRecordVersion',
  'authorityProfileId',
  'authorityProfileVersion',
  'verifierVersion',
  'providerAuthorityId',
  'generationId',
  'generationVersion',
  'keyId',
  'algorithm',
  'publicKey',
  'network',
  'chainProfile',
  'observerPolicy',
  'confirmationPolicy',
  'bootstrapCheckpoint',
  'sourcePolicyCommitment',
  'maximumAttestationBytes',
  'maximumCanonicalBytes',
  'maximumInitialAgeSeconds',
  'maximumFutureSkewSeconds',
  'maximumValiditySeconds',
];

function normalizeAuthorityFields(input) {
  const value = exactObject(input, AUTHORITY_KEYS, failAuthority);
  if (
    value.authorityRecordVersion !== ZENON_FUNDING_PROVIDER_ATTESTATION_AUTHORITY_VERSION
    || value.algorithm !== ALGORITHM
    || value.network !== NETWORK
  ) {
    failAuthority();
  }
  for (const field of [
    'authorityProfileId',
    'providerAuthorityId',
    'generationId',
    'keyId',
  ]) {
    assertIdentifier(value[field], failAuthority);
  }
  for (const field of [
    'authorityProfileVersion',
    'verifierVersion',
    'generationVersion',
    'maximumAttestationBytes',
    'maximumCanonicalBytes',
    'maximumInitialAgeSeconds',
    'maximumValiditySeconds',
  ]) {
    assertPositiveInteger(value[field], failAuthority);
  }
  assertNonnegativeInteger(value.maximumFutureSkewSeconds, failAuthority);
  if (
    value.maximumAttestationBytes < 512
    || value.maximumAttestationBytes > 64 * 1024
    || value.maximumCanonicalBytes < 1024
    || value.maximumCanonicalBytes > HARD_MAX_CANONICAL_BYTES
    || value.maximumInitialAgeSeconds > 86_400
    || value.maximumFutureSkewSeconds > 300
    || value.maximumValiditySeconds > 86_400
  ) {
    failAuthority();
  }
  validatePublicKey(value.publicKey, failAuthority);
  const chainProfile = normalizeChainProfile(value.chainProfile, failAuthority);
  const observerPolicy = normalizeObserverPolicy(value.observerPolicy, failAuthority);
  const confirmationPolicy = normalizeConfirmationPolicy(
    value.confirmationPolicy,
    failAuthority,
  );
  const bootstrapCheckpoint = normalizeCheckpoint(value.bootstrapCheckpoint, failAuthority);
  assertCommitment(value.sourcePolicyCommitment, failAuthority);
  if (observerPolicy.verifierVersion !== value.verifierVersion) failAuthority();
  return deepFreeze({
    authorityRecordVersion: value.authorityRecordVersion,
    authorityProfileId: value.authorityProfileId,
    authorityProfileVersion: value.authorityProfileVersion,
    verifierVersion: value.verifierVersion,
    providerAuthorityId: value.providerAuthorityId,
    generationId: value.generationId,
    generationVersion: value.generationVersion,
    keyId: value.keyId,
    algorithm: ALGORITHM,
    publicKey: value.publicKey,
    network: NETWORK,
    chainProfile,
    observerPolicy,
    confirmationPolicy,
    bootstrapCheckpoint,
    sourcePolicyCommitment: value.sourcePolicyCommitment,
    maximumAttestationBytes: value.maximumAttestationBytes,
    maximumCanonicalBytes: value.maximumCanonicalBytes,
    maximumInitialAgeSeconds: value.maximumInitialAgeSeconds,
    maximumFutureSkewSeconds: value.maximumFutureSkewSeconds,
    maximumValiditySeconds: value.maximumValiditySeconds,
  });
}

function decorateAuthority(fields, canonicalText) {
  const authorityGeneration = deepFreeze({
    generationId: fields.generationId,
    generationVersion: fields.generationVersion,
    generationCommitment: commitment(AUTHORITY_GENERATION_DOMAIN, {
      providerAuthorityId: fields.providerAuthorityId,
      generationId: fields.generationId,
      generationVersion: fields.generationVersion,
      keyId: fields.keyId,
      algorithm: fields.algorithm,
      publicKey: fields.publicKey,
      network: fields.network,
      chainProfile: fields.chainProfile,
      observerPolicy: fields.observerPolicy,
      confirmationPolicy: fields.confirmationPolicy,
      bootstrapCheckpoint: fields.bootstrapCheckpoint,
      sourcePolicyCommitment: fields.sourcePolicyCommitment,
    }),
  });
  const authorityRecordDigest = commitment(AUTHORITY_RECORD_DOMAIN, fields);
  const authorityProfile = deepFreeze({
    profileId: fields.authorityProfileId,
    profileVersion: fields.authorityProfileVersion,
    verifierVersion: fields.verifierVersion,
    recordDigest: authorityRecordDigest,
    network: fields.network,
    chainProfile: fields.chainProfile,
    confirmationPolicy: fields.confirmationPolicy,
  });
  const decorated = deepFreeze({
    ...fields,
    canonicalText,
    authorityRecordDigest,
    authorityGeneration,
    authorityProfile,
  });
  REFLECT_APPLY(WEAK_SET_ADD, PARSED_AUTHORITIES, [decorated]);
  return decorated;
}

export function parseZenonFundingProviderAttestationAuthorityRecord(canonicalJsonText) {
  try {
    if (
      typeof canonicalJsonText !== 'string'
      || canonicalJsonText.length === 0
      || canonicalJsonText.length > MAX_AUTHORITY_RECORD_BYTES
      || byteLength(canonicalJsonText) > MAX_AUTHORITY_RECORD_BYTES
    ) {
      failAuthority();
    }
    let parsed;
    try {
      parsed = REFLECT_APPLY(JSON_PARSE, JSON, [canonicalJsonText]);
    } catch {
      failAuthority();
    }
    const fields = normalizeAuthorityFields(snapshotJson(
      parsed,
      failAuthority,
      MAX_AUTHORITY_RECORD_BYTES,
    ));
    if (canonicalJson(fields) !== canonicalJsonText) failAuthority();
    return decorateAuthority(fields, canonicalJsonText);
  } catch (error) {
    if (error instanceof ZenonFundingProviderAttestationError) throw error;
    failAuthority();
  }
}

function captureAuthority(input) {
  try {
    if (
      input === null
      || typeof input !== 'object'
      || !REFLECT_APPLY(WEAK_SET_HAS, PARSED_AUTHORITIES, [input])
      || !REFLECT_APPLY(OBJECT_IS_FROZEN, Object, [input])
    ) {
      failAuthority();
    }
    return input;
  } catch (error) {
    if (error instanceof ZenonFundingProviderAttestationError) throw error;
    failAuthority();
  }
}

function requestIdentity(input) {
  return {
    requestVersion: ZENON_FUNDING_PROVIDER_ATTESTATION_REQUEST_VERSION,
    requestType: REQUEST_TYPE,
    recordKey: input.recordKey,
    authorityRecordDigest: input.authorityRecordDigest,
    generationCommitment: input.generationCommitment,
    keyId: input.keyId,
    audienceDigest: input.audienceDigest,
    observerRecordId: input.observerRecordId,
    targetBindingDigest: input.targetBindingDigest,
    candidateDigest: input.candidateDigest,
    inclusionAuthorizationId: input.inclusionAuthorizationId,
    bootstrapCheckpoint: input.bootstrapCheckpoint,
    sourcePolicyCommitment: input.sourcePolicyCommitment,
    unsignedFundingEvidenceDigest: input.unsignedFundingEvidenceDigest,
  };
}

const REQUEST_KEYS = [
  'requestVersion',
  'requestType',
  'attestationId',
  'recordKey',
  'authorityRecordDigest',
  'generationCommitment',
  'keyId',
  'audienceDigest',
  'observerRecordId',
  'targetBindingDigest',
  'candidateDigest',
  'inclusionAuthorizationId',
  'bootstrapCheckpoint',
  'sourcePolicyCommitment',
  'unsignedFundingEvidenceDigest',
  'unsignedFundingEvidence',
];

function normalizeVerifiedRecord(input) {
  const keys = [
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
  ];
  const value = exactObject(input, keys, failInput);
  if (
    value.evidenceVersion !== EVIDENCE_VERSION
    || value.evidenceType !== EVIDENCE_TYPE
    || value.network !== NETWORK
    || typeof value.transactionId !== 'string'
    || !REFLECT_APPLY(REGEXP_TEST, TRANSACTION_ID, [value.transactionId])
    || typeof value.amount !== 'string'
    || !REFLECT_APPLY(REGEXP_TEST, POSITIVE_DECIMAL, [value.amount])
    || value.amount.length > 77
  ) {
    failInput();
  }
  for (const identifier of [
    value.authorityProfileId,
    value.payer,
    value.payee,
    value.asset,
    value.offerId,
    value.fundingPolicyId,
  ]) {
    assertIdentifier(identifier, failInput);
  }
  for (const integer of [
    value.authorityProfileVersion,
    value.verifierVersion,
    value.offerVersion,
    value.fundingPolicyVersion,
    value.totalUnits,
    value.expiresAt,
  ]) {
    assertPositiveInteger(integer, failInput);
  }
  for (const digest of [
    value.authorityRecordDigest,
    value.paymentResourceDigest,
    value.paymentRequirementDigest,
    value.paymentIntentDigest,
    value.resourceBinding,
    value.capabilityCommitment,
    value.grantFundingCommitment,
  ]) {
    assertCommitment(digest, failInput);
  }
  const chainProfile = normalizeChainProfile(value.chainProfile, failInput);
  const confirmationPolicy = normalizeConfirmationPolicy(
    value.confirmationPolicy,
    failInput,
  );
  const inclusion = exactObject(value.inclusionEvidence, [
    'state',
    'transactionHash',
    'momentumHeight',
    'momentumHash',
    'observedConfirmations',
  ], failInput);
  const transactionMatch = REFLECT_APPLY(REGEXP_EXEC, TRANSACTION_ID, [
    value.transactionId,
  ]);
  if (
    inclusion.state !== 'MOMENTUM_INCLUDED'
    || typeof inclusion.transactionHash !== 'string'
    || !REFLECT_APPLY(REGEXP_TEST, HASH, [inclusion.transactionHash])
    || inclusion.transactionHash !== transactionMatch?.[1]
    || !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [inclusion.momentumHeight])
    || inclusion.momentumHeight <= 0
    || typeof inclusion.momentumHash !== 'string'
    || !REFLECT_APPLY(REGEXP_TEST, HASH, [inclusion.momentumHash])
    || inclusion.momentumHash === inclusion.transactionHash
    || !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [inclusion.observedConfirmations])
    || inclusion.observedConfirmations < confirmationPolicy.minimumConfirmations
  ) {
    failInput();
  }
  return deepFreeze({
    evidenceVersion: EVIDENCE_VERSION,
    evidenceType: EVIDENCE_TYPE,
    authorityProfileId: value.authorityProfileId,
    authorityProfileVersion: value.authorityProfileVersion,
    verifierVersion: value.verifierVersion,
    authorityRecordDigest: value.authorityRecordDigest,
    network: NETWORK,
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
    inclusionEvidence: deepFreeze({
      state: inclusion.state,
      transactionHash: inclusion.transactionHash,
      momentumHeight: inclusion.momentumHeight,
      momentumHash: inclusion.momentumHash,
      observedConfirmations: inclusion.observedConfirmations,
    }),
    confirmationPolicy,
  });
}

function normalizeRequest(input, authority = null) {
  const value = exactObject(snapshotJson(input), REQUEST_KEYS);
  if (
    value.requestVersion !== ZENON_FUNDING_PROVIDER_ATTESTATION_REQUEST_VERSION
    || value.requestType !== REQUEST_TYPE
  ) {
    failInput();
  }
  for (const field of [
    'attestationId',
    'recordKey',
    'authorityRecordDigest',
    'generationCommitment',
    'audienceDigest',
    'observerRecordId',
    'targetBindingDigest',
    'candidateDigest',
    'inclusionAuthorizationId',
    'sourcePolicyCommitment',
    'unsignedFundingEvidenceDigest',
  ]) {
    assertCommitment(value[field], failInput);
  }
  assertIdentifier(value.keyId, failInput);
  const bootstrapCheckpoint = normalizeCheckpoint(value.bootstrapCheckpoint, failInput);
  const unsignedFundingEvidence = normalizeVerifiedRecord(value.unsignedFundingEvidence);
  if (
    commitment(FUNDING_EVIDENCE_DOMAIN, unsignedFundingEvidence)
      !== value.unsignedFundingEvidenceDigest
    || commitment(ATTESTATION_ID_DOMAIN, requestIdentity({
      ...value,
      bootstrapCheckpoint,
    })) !== value.attestationId
  ) {
    failInput();
  }
  if (
    authority !== null
    && (
      value.authorityRecordDigest !== authority.authorityRecordDigest
      || value.generationCommitment !== authority.authorityGeneration.generationCommitment
      || value.keyId !== authority.keyId
      || value.sourcePolicyCommitment !== authority.sourcePolicyCommitment
      || !sameJson(bootstrapCheckpoint, authority.bootstrapCheckpoint)
      || value.unsignedFundingEvidence.authorityRecordDigest
        !== authority.authorityRecordDigest
      || value.unsignedFundingEvidence.authorityProfileId !== authority.authorityProfileId
      || value.unsignedFundingEvidence.authorityProfileVersion
        !== authority.authorityProfileVersion
      || value.unsignedFundingEvidence.verifierVersion !== authority.verifierVersion
      || value.unsignedFundingEvidence.network !== authority.network
      || !sameJson(value.unsignedFundingEvidence.chainProfile, authority.chainProfile)
      || !sameJson(
        value.unsignedFundingEvidence.confirmationPolicy,
        authority.confirmationPolicy,
      )
    )
  ) {
    failRejected();
  }
  const normalized = deepFreeze({
    ...value,
    bootstrapCheckpoint,
    unsignedFundingEvidence,
  });
  if (
    authority !== null
    && byteLength(canonicalJson(normalized)) > authority.maximumCanonicalBytes
  ) {
    failRejected();
  }
  return normalized;
}

export function parseZenonFundingProviderAttestationRequest(input) {
  try {
    const value = exactObject(input, ['authorityRecord', 'request']);
    const authority = captureAuthority(value.authorityRecord);
    return normalizeRequest(value.request, authority);
  } catch (error) {
    if (error instanceof ZenonFundingProviderAttestationError) throw error;
    failInput();
  }
}

function captureSigningInput(input) {
  const original = exactObject(input, ['request', 'issuedAt', 'validUntil']);
  const request = normalizeRequest(original.request);
  assertNonnegativeInteger(original.issuedAt, failInput);
  assertPositiveInteger(original.validUntil, failInput);
  if (original.validUntil <= original.issuedAt) failInput();
  return deepFreeze({
    signaturePayloadVersion: 1,
    algorithm: ALGORITHM,
    request,
    issuedAt: original.issuedAt,
    validUntil: original.validUntil,
  });
}

export function createZenonFundingProviderAttestationSigningBytes(input) {
  try {
    const payload = captureSigningInput(input);
    return REFLECT_APPLY(BUFFER_CONCAT, Buffer, [[
      SIGNING_DOMAIN,
      REFLECT_APPLY(BUFFER_FROM, Buffer, [canonicalJson(payload), 'utf8']),
    ]]);
  } catch (error) {
    if (error instanceof ZenonFundingProviderAttestationError) throw error;
    failInput();
  }
}

const ENVELOPE_KEYS = [
  'envelopeVersion',
  'attestationId',
  'keyId',
  'issuedAt',
  'validUntil',
  'signature',
];

function normalizeEnvelope(input, authority) {
  const value = exactObject(snapshotJson(input), ENVELOPE_KEYS, failRejected);
  if (
    value.envelopeVersion !== ZENON_FUNDING_PROVIDER_ATTESTATION_ENVELOPE_VERSION
    || value.keyId !== authority.keyId
  ) {
    failRejected();
  }
  assertCommitment(value.attestationId, failRejected);
  assertNonnegativeInteger(value.issuedAt, failRejected);
  assertPositiveInteger(value.validUntil, failRejected);
  if (
    value.validUntil <= value.issuedAt
    || value.validUntil - value.issuedAt > authority.maximumValiditySeconds
  ) {
    failRejected();
  }
  decodeBase64url(value.signature, RAW_SIGNATURE, 64, failRejected);
  const normalized = deepFreeze({ ...value });
  if (byteLength(canonicalJson(normalized)) > authority.maximumAttestationBytes) failRejected();
  return normalized;
}

export function verifyZenonFundingProviderAttestationEnvelope(input) {
  try {
    const original = exactObject(input, [
      'authorityRecord',
      'request',
      'envelope',
      'nowEpochSeconds',
      'replayMode',
    ]);
    const authority = captureAuthority(original.authorityRecord);
    const request = normalizeRequest(original.request, authority);
    const envelope = normalizeEnvelope(original.envelope, authority);
    assertNonnegativeInteger(original.nowEpochSeconds, failInput);
    if (
      original.replayMode !== 'INITIAL'
      && original.replayMode !== 'COMMITTED_REPLAY'
    ) {
      failInput();
    }
    if (
      envelope.attestationId !== request.attestationId
      || (
        original.replayMode === 'INITIAL'
        && (
          envelope.issuedAt > original.nowEpochSeconds + authority.maximumFutureSkewSeconds
          || original.nowEpochSeconds - envelope.issuedAt
            > authority.maximumInitialAgeSeconds
          || envelope.validUntil <= original.nowEpochSeconds
        )
      )
    ) {
      failRejected();
    }
    const publicKey = decodeBase64url(authority.publicKey, RAW_PUBLIC_KEY, 32, failRejected);
    const der = REFLECT_APPLY(BUFFER_CONCAT, Buffer, [[ED25519_SPKI_PREFIX, publicKey]]);
    const signature = decodeBase64url(envelope.signature, RAW_SIGNATURE, 64, failRejected);
    let valid = false;
    try {
      const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
      valid = verifySignature(
        null,
        createZenonFundingProviderAttestationSigningBytes({
          request,
          issuedAt: envelope.issuedAt,
          validUntil: envelope.validUntil,
        }),
        key,
        signature,
      );
    } catch {
      failRejected();
    }
    if (valid !== true) failRejected();
    return deepFreeze({
      attestationId: request.attestationId,
      envelopeDigest: commitment(ENVELOPE_DOMAIN, envelope),
    });
  } catch (error) {
    if (error instanceof ZenonFundingProviderAttestationError) throw error;
    failRejected();
  }
}
