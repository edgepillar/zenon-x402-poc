import { createHash } from 'node:crypto';
import { types as utilTypes } from 'node:util';

import {
  parseZenonFundingProviderAttestationRequest,
  ZENON_FUNDING_PROVIDER_ATTESTATION_ENVELOPE_VERSION,
} from './service-credit-zenon-funding-provider-attestation.js';

export const ZENON_FUNDING_PROVIDER_SIGNING_CHILD_PROTOCOL_VERSION = 1;
export const ZENON_FUNDING_PROVIDER_SIGNING_CHILD_RESPONSE_STATUS = Object.freeze({
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  READY: 'READY',
  REJECTED: 'REJECTED',
});

const REQUEST_TYPE = 'zenon-funding-provider-signing-request';
const RESPONSE_TYPE = 'zenon-funding-provider-signing-response';
const OPERATION_ID_DOMAIN = 'zenon-x402:funding-provider-signing-operation-v1';
const DEFAULT_MAXIMUM_PAYLOAD_BYTES = 512 * 1024;
const HARD_MAXIMUM_PAYLOAD_BYTES = 1024 * 1024;
const MAX_DEPTH = 32;
const MAX_ARRAY_LENGTH = 8_192;
const MAX_NODES = 16_384;
const MAX_MEMBERS = 16_384;
const MAX_KEY_BYTES = 64 * 1024;
const MAX_STRING_BYTES = 512 * 1024;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/;
const REJECTED_REASONS = Object.freeze([
  'AUTHORITY_RETIRED',
  'OPERATION_CONFLICT',
  'POLICY_REJECTED',
]);

const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_INCLUDES = Array.prototype.includes;
const ARRAY_JOIN = Array.prototype.join;
const ARRAY_MAP = Array.prototype.map;
const ARRAY_SORT = Array.prototype.sort;
const BUFFER_ALLOC = Buffer.alloc;
const BUFFER_BYTE_LENGTH = Buffer.byteLength;
const BUFFER_CONCAT = Buffer.concat;
const BUFFER_FROM = Buffer.from;
const BUFFER_IS_BUFFER = Buffer.isBuffer;
const BUFFER_READ_UINT32_BE = Buffer.prototype.readUInt32BE;
const BUFFER_SUBARRAY = Buffer.prototype.subarray;
const BUFFER_TO_STRING = Buffer.prototype.toString;
const BUFFER_WRITE_UINT32_BE = Buffer.prototype.writeUInt32BE;
const HASH_PROTOTYPE = Reflect.getPrototypeOf(createHash('sha256'));
const HASH_UPDATE = HASH_PROTOTYPE.update;
const HASH_DIGEST = HASH_PROTOTYPE.digest;
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
const REGEXP_TEST = RegExp.prototype.test;
const IS_PROXY = utilTypes.isProxy;
const NATIVE_WEAK_SET = WeakSet;
const WEAK_SET_ADD = NATIVE_WEAK_SET.prototype.add;
const WEAK_SET_HAS = NATIVE_WEAK_SET.prototype.has;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const TEXT_DECODER_DECODE = TextDecoder.prototype.decode;

export class ZenonFundingProviderSigningChildProtocolError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ZenonFundingProviderSigningChildProtocolError';
    this.code = code;
    this.stack = `ZenonFundingProviderSigningChildProtocolError: ${code}`;
  }
}

function failure(code) {
  return new ZenonFundingProviderSigningChildProtocolError(code);
}

function fail(code) {
  throw failure(code);
}

function byteLength(value) {
  return REFLECT_APPLY(BUFFER_BYTE_LENGTH, Buffer, [value, 'utf8']);
}

function append(array, value) {
  REFLECT_APPLY(OBJECT_DEFINE_PROPERTY, undefined, [array, `${array.length}`, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  }]);
}

function addBudget(budget, field, amount, maximum, code) {
  budget[field] += amount;
  if (budget[field] > maximum) fail(code);
}

function copyJson(input, budget, depth, code) {
  try {
    if (depth > MAX_DEPTH) fail(code);
    addBudget(budget, 'nodes', 1, MAX_NODES, code);
    if (input === null || typeof input === 'boolean') return input;
    if (typeof input === 'string') {
      if (input.length > MAX_STRING_BYTES) fail(code);
      addBudget(budget, 'stringBytes', byteLength(input), MAX_STRING_BYTES, code);
      return input;
    }
    if (typeof input === 'number') {
      if (!REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [input])) fail(code);
      return REFLECT_APPLY(OBJECT_IS, Object, [input, -0]) ? 0 : input;
    }
    if (
      typeof input !== 'object'
      || REFLECT_APPLY(IS_PROXY, undefined, [input])
      || REFLECT_APPLY(WEAK_SET_HAS, budget.seen, [input])
    ) {
      fail(code);
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
        fail(code);
      }
      const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [input]);
      if (keys.length !== lengthDescriptor.value + 1 || keys[keys.length - 1] !== 'length') {
        fail(code);
      }
      addBudget(budget, 'members', lengthDescriptor.value, MAX_MEMBERS, code);
      const output = [];
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        const key = `${index}`;
        if (keys[index] !== key) fail(code);
        const descriptor = REFLECT_APPLY(
          REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
          Reflect,
          [input, key],
        );
        if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) fail(code);
        append(output, copyJson(descriptor.value, budget, depth + 1, code));
      }
      return output;
    }
    if (prototype !== OBJECT_PROTOTYPE && prototype !== null) fail(code);
    const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [input]);
    if (keys.length > MAX_MEMBERS) fail(code);
    addBudget(budget, 'members', keys.length, MAX_MEMBERS, code);
    const output = {};
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key !== 'string' || key.length > MAX_KEY_BYTES) fail(code);
      addBudget(budget, 'keyBytes', byteLength(key), MAX_KEY_BYTES, code);
      const descriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [input, key],
      );
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) fail(code);
      REFLECT_APPLY(OBJECT_DEFINE_PROPERTY, undefined, [output, key, {
        configurable: true,
        enumerable: true,
        value: copyJson(descriptor.value, budget, depth + 1, code),
        writable: true,
      }]);
    }
    return output;
  } catch (error) {
    if (error instanceof ZenonFundingProviderSigningChildProtocolError) throw error;
    fail(code);
  }
}

function snapshotJson(input, code) {
  return copyJson(input, {
    keyBytes: 0,
    members: 0,
    nodes: 0,
    seen: new NATIVE_WEAK_SET(),
    stringBytes: 0,
  }, 0, code);
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return REFLECT_APPLY(JSON_STRINGIFY, JSON, [value]);
  }
  if (REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [value])) {
    return `[${REFLECT_APPLY(ARRAY_JOIN, REFLECT_APPLY(ARRAY_MAP, value, [canonicalJson]), [','])}]`;
  }
  const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [value]);
  REFLECT_APPLY(ARRAY_SORT, keys, []);
  const parts = REFLECT_APPLY(ARRAY_MAP, keys, [
    key => `${REFLECT_APPLY(JSON_STRINGIFY, JSON, [key])}:${canonicalJson(value[key])}`,
  ]);
  return `{${REFLECT_APPLY(ARRAY_JOIN, parts, [','])}}`;
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
  return deepFreeze(REFLECT_APPLY(JSON_PARSE, JSON, [canonicalJson(value)]));
}

function exactObject(input, fields, code) {
  const value = snapshotJson(input, code);
  if (
    value === null
    || typeof value !== 'object'
    || REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [value])
  ) {
    fail(code);
  }
  const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [value]);
  if (keys.length !== fields.length) fail(code);
  for (let index = 0; index < fields.length; index += 1) {
    if (!OBJECT_HAS_OWN(value, fields[index])) fail(code);
  }
  return value;
}

function captureDataObject(input, fields, code) {
  try {
    if (
      input === null
      || typeof input !== 'object'
      || REFLECT_APPLY(IS_PROXY, undefined, [input])
      || REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [input])
      || REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [input]) !== OBJECT_PROTOTYPE
    ) fail(code);
    const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [input]);
    if (keys.length !== fields.length) fail(code);
    const output = REFLECT_APPLY(OBJECT_CREATE, Object, [null]);
    for (let index = 0; index < fields.length; index += 1) {
      const key = fields[index];
      if (!REFLECT_APPLY(ARRAY_INCLUDES, keys, [key])) fail(code);
      const descriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        Reflect,
        [input, key],
      );
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) fail(code);
      output[key] = descriptor.value;
    }
    return output;
  } catch (error) {
    if (error instanceof ZenonFundingProviderSigningChildProtocolError) throw error;
    fail(code);
  }
}

function assertDigest(value, code) {
  if (typeof value !== 'string' || !REFLECT_APPLY(REGEXP_TEST, DIGEST, [value])) fail(code);
}

function assertIdentifier(value, code) {
  if (typeof value !== 'string' || !REFLECT_APPLY(REGEXP_TEST, IDENTIFIER, [value])) fail(code);
}

function assertInteger(value, positive, code) {
  if (
    !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [value])
    || value < (positive ? 1 : 0)
  ) fail(code);
}

function hashCommitment(domain, value) {
  const hash = createHash('sha256');
  REFLECT_APPLY(HASH_UPDATE, hash, [domain, 'utf8']);
  REFLECT_APPLY(HASH_UPDATE, hash, ['\0', 'utf8']);
  REFLECT_APPLY(HASH_UPDATE, hash, [canonicalJson(value), 'utf8']);
  return `sha256:${REFLECT_APPLY(HASH_DIGEST, hash, ['hex'])}`;
}

function captureMaximum(value, code) {
  if (
    !REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [value])
    || value < 1
    || value > HARD_MAXIMUM_PAYLOAD_BYTES
  ) fail(code);
  return value;
}

export function deriveZenonFundingProviderSigningOperationId(input) {
  const code = 'ZENON_FUNDING_PROVIDER_SIGNING_PROTOCOL_INVALID_INPUT';
  const value = exactObject(input, [
    'authorityRecordDigest',
    'generationCommitment',
    'keyId',
    'attestationId',
  ], code);
  assertDigest(value.authorityRecordDigest, code);
  assertDigest(value.generationCommitment, code);
  assertIdentifier(value.keyId, code);
  assertDigest(value.attestationId, code);
  return hashCommitment(OPERATION_ID_DOMAIN, {
    protocolVersion: ZENON_FUNDING_PROVIDER_SIGNING_CHILD_PROTOCOL_VERSION,
    authorityRecordDigest: value.authorityRecordDigest,
    generationCommitment: value.generationCommitment,
    keyId: value.keyId,
    attestationId: value.attestationId,
  });
}

export function createZenonFundingProviderSigningChildRequest(input) {
  const code = 'ZENON_FUNDING_PROVIDER_SIGNING_PROTOCOL_INVALID_REQUEST';
  const value = captureDataObject(input, ['authorityRecord', 'request'], code);
  let request;
  try {
    request = parseZenonFundingProviderAttestationRequest({
      authorityRecord: value.authorityRecord,
      request: value.request,
    });
  } catch {
    fail(code);
  }
  const operationId = deriveZenonFundingProviderSigningOperationId({
    authorityRecordDigest: request.authorityRecordDigest,
    generationCommitment: request.generationCommitment,
    keyId: request.keyId,
    attestationId: request.attestationId,
  });
  return cloneTrusted({
    protocolVersion: ZENON_FUNDING_PROVIDER_SIGNING_CHILD_PROTOCOL_VERSION,
    messageType: REQUEST_TYPE,
    operationId,
    authorityRecordDigest: request.authorityRecordDigest,
    generationCommitment: request.generationCommitment,
    keyId: request.keyId,
    attestationId: request.attestationId,
    attestationRequest: request,
  });
}

function normalizeRequest(input, authorityRecord = null) {
  const code = 'ZENON_FUNDING_PROVIDER_SIGNING_PROTOCOL_INVALID_REQUEST';
  const value = exactObject(input, [
    'protocolVersion',
    'messageType',
    'operationId',
    'authorityRecordDigest',
    'generationCommitment',
    'keyId',
    'attestationId',
    'attestationRequest',
  ], code);
  if (
    value.protocolVersion !== ZENON_FUNDING_PROVIDER_SIGNING_CHILD_PROTOCOL_VERSION
    || value.messageType !== REQUEST_TYPE
  ) fail(code);
  assertDigest(value.operationId, code);
  assertDigest(value.authorityRecordDigest, code);
  assertDigest(value.generationCommitment, code);
  assertIdentifier(value.keyId, code);
  assertDigest(value.attestationId, code);
  let request = exactObject(value.attestationRequest, [
    'requestVersion', 'requestType', 'attestationId', 'recordKey',
    'authorityRecordDigest', 'generationCommitment', 'keyId', 'audienceDigest',
    'observerRecordId', 'targetBindingDigest', 'candidateDigest',
    'inclusionAuthorizationId', 'bootstrapCheckpoint', 'sourcePolicyCommitment',
    'unsignedFundingEvidenceDigest', 'unsignedFundingEvidence',
  ], code);
  if (authorityRecord !== null) {
    try {
      request = parseZenonFundingProviderAttestationRequest({
        authorityRecord,
        request,
      });
    } catch {
      fail(code);
    }
  }
  if (
    request.attestationId !== value.attestationId
    || request.authorityRecordDigest !== value.authorityRecordDigest
    || request.generationCommitment !== value.generationCommitment
    || request.keyId !== value.keyId
    || deriveZenonFundingProviderSigningOperationId({
      authorityRecordDigest: value.authorityRecordDigest,
      generationCommitment: value.generationCommitment,
      keyId: value.keyId,
      attestationId: value.attestationId,
    }) !== value.operationId
  ) fail(code);
  return cloneTrusted({ ...value, attestationRequest: request });
}

function normalizeEnvelope(input, code) {
  const value = exactObject(input, [
    'envelopeVersion', 'attestationId', 'keyId', 'issuedAt', 'validUntil', 'signature',
  ], code);
  if (value.envelopeVersion !== ZENON_FUNDING_PROVIDER_ATTESTATION_ENVELOPE_VERSION) fail(code);
  assertDigest(value.attestationId, code);
  assertIdentifier(value.keyId, code);
  assertInteger(value.issuedAt, false, code);
  assertInteger(value.validUntil, true, code);
  let signature;
  if (
    value.validUntil <= value.issuedAt
    || typeof value.signature !== 'string'
    || !REFLECT_APPLY(REGEXP_TEST, SIGNATURE, [value.signature])
  ) fail(code);
  try {
    signature = REFLECT_APPLY(BUFFER_FROM, Buffer, [value.signature, 'base64url']);
  } catch {
    fail(code);
  }
  if (
    signature.length !== 64
    || REFLECT_APPLY(BUFFER_TO_STRING, signature, ['base64url']) !== value.signature
  ) fail(code);
  return value;
}

function normalizeResponse(input, expectedOperationId = null) {
  const code = 'ZENON_FUNDING_PROVIDER_SIGNING_PROTOCOL_INVALID_RESPONSE';
  const value = exactObject(input, [
    'protocolVersion', 'messageType', 'operationId', 'status', 'reasonCode', 'envelope',
  ], code);
  if (
    value.protocolVersion !== ZENON_FUNDING_PROVIDER_SIGNING_CHILD_PROTOCOL_VERSION
    || value.messageType !== RESPONSE_TYPE
  ) fail(code);
  assertDigest(value.operationId, code);
  if (expectedOperationId !== null && value.operationId !== expectedOperationId) fail(code);
  if (value.status === ZENON_FUNDING_PROVIDER_SIGNING_CHILD_RESPONSE_STATUS.READY) {
    if (value.reasonCode !== null || value.envelope === null) fail(code);
    const envelope = normalizeEnvelope(value.envelope, code);
    if (envelope.attestationId !== null && typeof envelope.attestationId !== 'string') fail(code);
    return cloneTrusted({ ...value, envelope });
  }
  if (value.envelope !== null) fail(code);
  if (value.status === ZENON_FUNDING_PROVIDER_SIGNING_CHILD_RESPONSE_STATUS.APPROVAL_REQUIRED) {
    if (value.reasonCode !== 'OPERATOR_APPROVAL_REQUIRED') fail(code);
  } else if (value.status === ZENON_FUNDING_PROVIDER_SIGNING_CHILD_RESPONSE_STATUS.REJECTED) {
    if (!REFLECT_APPLY(ARRAY_INCLUDES, REJECTED_REASONS, [value.reasonCode])) fail(code);
  } else {
    fail(code);
  }
  return cloneTrusted(value);
}

export function createZenonFundingProviderSigningChildResponse(input) {
  return normalizeResponse(input);
}

function framePayload(value, maximumPayloadBytes, code) {
  const maximum = captureMaximum(maximumPayloadBytes, code);
  const text = canonicalJson(value);
  if (text.length === 0 || text.length > maximum || byteLength(text) > maximum) fail(code);
  const payload = REFLECT_APPLY(BUFFER_FROM, Buffer, [text, 'utf8']);
  const prefix = REFLECT_APPLY(BUFFER_ALLOC, Buffer, [4]);
  REFLECT_APPLY(BUFFER_WRITE_UINT32_BE, prefix, [payload.length, 0]);
  return REFLECT_APPLY(BUFFER_CONCAT, Buffer, [[prefix, payload]]);
}

function parseFrame(frame, maximumPayloadBytes, normalize, code) {
  try {
    const maximum = captureMaximum(maximumPayloadBytes, code);
    if (
      !REFLECT_APPLY(BUFFER_IS_BUFFER, Buffer, [frame])
      || REFLECT_APPLY(IS_PROXY, undefined, [frame])
      || frame.length < 5
      || frame.length > maximum + 4
    ) fail(code);
    const copy = REFLECT_APPLY(BUFFER_FROM, Buffer, [frame]);
    const length = REFLECT_APPLY(BUFFER_READ_UINT32_BE, copy, [0]);
    if (length < 1 || length > maximum || copy.length !== length + 4) fail(code);
    let text;
    try {
      text = REFLECT_APPLY(TEXT_DECODER_DECODE, UTF8_DECODER, [
        REFLECT_APPLY(BUFFER_SUBARRAY, copy, [4]),
      ]);
    } catch {
      fail(code);
    }
    if (text.length === 0 || text.length > maximum || byteLength(text) !== length) fail(code);
    let parsed;
    try {
      parsed = REFLECT_APPLY(JSON_PARSE, JSON, [text]);
    } catch {
      fail(code);
    }
    const normalized = normalize(parsed);
    if (canonicalJson(normalized) !== text) fail(code);
    return normalized;
  } catch (error) {
    if (error instanceof ZenonFundingProviderSigningChildProtocolError) throw error;
    fail(code);
  }
}

export function frameZenonFundingProviderSigningChildRequest(
  input,
  authorityRecord,
  maximumPayloadBytes = DEFAULT_MAXIMUM_PAYLOAD_BYTES,
) {
  if (authorityRecord === undefined || authorityRecord === null) {
    fail('ZENON_FUNDING_PROVIDER_SIGNING_PROTOCOL_INVALID_REQUEST');
  }
  return framePayload(
    normalizeRequest(input, authorityRecord),
    maximumPayloadBytes,
    'ZENON_FUNDING_PROVIDER_SIGNING_PROTOCOL_INVALID_REQUEST',
  );
}

export function parseZenonFundingProviderSigningChildRequestFrame(
  frame,
  authorityRecord,
  maximumPayloadBytes = DEFAULT_MAXIMUM_PAYLOAD_BYTES,
) {
  if (authorityRecord === undefined || authorityRecord === null) {
    fail('ZENON_FUNDING_PROVIDER_SIGNING_PROTOCOL_INVALID_REQUEST');
  }
  return parseFrame(
    frame,
    maximumPayloadBytes,
    value => normalizeRequest(value, authorityRecord),
    'ZENON_FUNDING_PROVIDER_SIGNING_PROTOCOL_INVALID_REQUEST',
  );
}

export function frameZenonFundingProviderSigningChildResponse(
  input,
  maximumPayloadBytes = DEFAULT_MAXIMUM_PAYLOAD_BYTES,
) {
  return framePayload(
    normalizeResponse(input),
    maximumPayloadBytes,
    'ZENON_FUNDING_PROVIDER_SIGNING_PROTOCOL_INVALID_RESPONSE',
  );
}

export function parseZenonFundingProviderSigningChildResponseFrame(
  frame,
  expectedOperationId,
  maximumPayloadBytes = DEFAULT_MAXIMUM_PAYLOAD_BYTES,
) {
  assertDigest(
    expectedOperationId,
    'ZENON_FUNDING_PROVIDER_SIGNING_PROTOCOL_INVALID_RESPONSE',
  );
  return parseFrame(
    frame,
    maximumPayloadBytes,
    value => normalizeResponse(value, expectedOperationId),
    'ZENON_FUNDING_PROVIDER_SIGNING_PROTOCOL_INVALID_RESPONSE',
  );
}
