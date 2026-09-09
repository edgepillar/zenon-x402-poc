import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { TextDecoder, types as utilTypes } from 'node:util';
import {
  InMemoryServiceCreditModel,
  REQUEST_STATE,
  SERVICE_CREDIT_MODEL_VERSION,
  SERVICE_CREDIT_STATE_SCHEMA_VERSION,
  ServiceCreditModelError,
} from './service-credit-model.js';
import {
  verifyServiceCreditCapability,
} from './service-credit-capability.js';

export const SERVICE_CREDIT_HTTP_PATH = '/service-credit/v1/execute';
export const SERVICE_CREDIT_HTTP_ROUTE_ID = 'service-credit.execute.v1';

const REFLECT_APPLY = Reflect.apply;
const GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Reflect.getPrototypeOf;
const OWN_KEYS = Reflect.ownKeys;
const OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_IS_FROZEN = Object.isFrozen;
const OBJECT_PROTOTYPE = Object.prototype;
const OBJECT_VALUES = Object.values;
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_PROTOTYPE = Array.prototype;
const ARRAY_SORT = Array.prototype.sort;
const NUMBER_IS_FINITE = Number.isFinite;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const STRING_FROM = String;
const STRING_INCLUDES = String.prototype.includes;
const STRING_SLICE = String.prototype.slice;
const STRING_STARTS_WITH = String.prototype.startsWith;
const STRING_TO_LOWER_CASE = String.prototype.toLowerCase;
const REGEXP_TEST = RegExp.prototype.test;
const MAP_CONSTRUCTOR = Map;
const MAP_GET = Map.prototype.get;
const MAP_HAS = Map.prototype.has;
const MAP_SET = Map.prototype.set;
const SET_CONSTRUCTOR = Set;
const SET_ADD = Set.prototype.add;
const SET_HAS = Set.prototype.has;
const BUFFER_CONSTRUCTOR = Buffer;
const BUFFER_BYTE_LENGTH = Buffer.byteLength;
const BUFFER_FROM = Buffer.from;
const BUFFER_TO_STRING = Buffer.prototype.toString;
const JSON_OBJECT = JSON;
const JSON_PARSE = JSON.parse;
const JSON_STRINGIFY = JSON.stringify;
const TEXT_DECODER_DECODE = TextDecoder.prototype.decode;
const IS_PROXY = utilTypes.isProxy;
const TYPE_ERROR = TypeError;
const HASH_UPDATE = createHash('sha256').update;
const HASH_DIGEST = createHash('sha256').digest;
const MODEL_FROM_STATE = InMemoryServiceCreditModel.fromState;
const MODEL_EXPORT_STATE = InMemoryServiceCreditModel.prototype.exportState;
const VERIFY_CAPABILITY = verifyServiceCreditCapability;

const APPLICATION_CONTENT_TYPE = 'application/json';
const EMPTY_BODY_DIGEST = `sha256:${createHash('sha256').update(Buffer.alloc(0)).digest('hex')}`;
const AUTHORIZATION_SCHEME = 'ServiceCredit ';
const MAX_AUTHORIZATION_BYTES = 1_024;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_COMMITMENT = /^sha256:[0-9a-f]{64}$/;
const RESULT_CODE = IDENTIFIER;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const EXECUTION_ID_DOMAIN = Buffer.from('zenon-x402-service-credit-execution-v1\0', 'ascii');
const REQUEST_OPERATION_DOMAIN = Buffer.from(
  'zenon-x402-service-credit-http-operation-v1\0',
  'ascii',
);
const SERVICE_CREDIT_STORE_ENVELOPE_SCHEMA_VERSION = 1;
const MAX_ADMITTED_GRANTS = 10_000;
const MAX_CANONICAL_ARRAY_LENGTH = 100_000;
const MAX_REQUEST_STARTS_PER_WINDOW = 64;
const REQUEST_START_WINDOW_MS = 1_000;
const MAX_ACTIVE_EXECUTIONS = 8;
const monotonicMilliseconds = performance.now.bind(performance);
const PRIVATE_HEADERS = OBJECT_FREEZE({
  'Cache-Control': 'private, no-store, max-age=0',
  'Content-Type': APPLICATION_CONTENT_TYPE,
  Vary: 'Authorization',
  'X-Content-Type-Options': 'nosniff',
});

function isPlainDataObject(value) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || ARRAY_IS_ARRAY(value)
      || IS_PROXY(value)
      || GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE
    ) {
      return false;
    }
    const keys = OWN_KEYS(value);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key !== 'string') return false;
      const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      if (descriptor?.enumerable !== true || !OBJECT_HAS_OWN(descriptor, 'value')) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function keyAllowed(key, keys) {
  for (let index = 0; index < keys.length; index += 1) {
    if (keys[index] === key) return true;
  }
  return false;
}

function exactDataMethod(value, name) {
  try {
    if (
      value === null
      || (typeof value !== 'object' && typeof value !== 'function')
      || IS_PROXY(value)
    ) return null;
    let descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, name);
    if (descriptor === undefined) {
      const prototype = GET_PROTOTYPE_OF(value);
      if (prototype === null || IS_PROXY(prototype)) return null;
      descriptor = GET_OWN_PROPERTY_DESCRIPTOR(prototype, name);
    }
    if (
      descriptor === undefined
      || !OBJECT_HAS_OWN(descriptor, 'value')
      || typeof descriptor.value !== 'function'
      || IS_PROXY(descriptor.value)
    ) return null;
    return descriptor.value;
  } catch {
    return null;
  }
}

function exactKeys(value, keys) {
  if (!isPlainDataObject(value)) return false;
  const observed = OWN_KEYS(value);
  if (observed.length !== keys.length) return false;
  for (let index = 0; index < observed.length; index += 1) {
    if (!keyAllowed(observed[index], keys)) return false;
  }
  return true;
}

function captureBoundedArray(value, maximumLength) {
  try {
    if (
      !ARRAY_IS_ARRAY(value)
      || IS_PROXY(value)
      || GET_PROTOTYPE_OF(value) !== ARRAY_PROTOTYPE
    ) {
      return null;
    }
    const length = GET_OWN_PROPERTY_DESCRIPTOR(value, 'length');
    if (
      !length
      || length.enumerable
      || !OBJECT_HAS_OWN(length, 'value')
      || !NUMBER_IS_SAFE_INTEGER(length.value)
      || length.value < 0
      || length.value > maximumLength
    ) {
      return null;
    }
    const keys = OWN_KEYS(value);
    if (keys.length !== length.value + 1 || keys[keys.length - 1] !== 'length') return null;
    const captured = [];
    for (let index = 0; index < length.value; index += 1) {
      const key = STRING_FROM(index);
      if (keys[index] !== key) return null;
      const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) return null;
      OBJECT_DEFINE_PROPERTY(captured, key, {
        value: descriptor.value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return captured;
  } catch {
    return null;
  }
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return REFLECT_APPLY(JSON_STRINGIFY, JSON_OBJECT, [value]);
  }
  if (typeof value === 'number') {
    if (!NUMBER_IS_FINITE(value)) throw new TYPE_ERROR('invalid canonical value');
    return REFLECT_APPLY(JSON_STRINGIFY, JSON_OBJECT, [value]);
  }
  if (ARRAY_IS_ARRAY(value)) {
    const captured = captureBoundedArray(value, MAX_CANONICAL_ARRAY_LENGTH);
    if (!captured) throw new TYPE_ERROR('invalid canonical value');
    let output = '[';
    for (let index = 0; index < captured.length; index += 1) {
      if (index !== 0) output += ',';
      output += canonicalJson(captured[index]);
    }
    return `${output}]`;
  }
  if (!isPlainDataObject(value)) throw new TYPE_ERROR('invalid canonical value');
  const keys = OWN_KEYS(value);
  REFLECT_APPLY(ARRAY_SORT, keys, []);
  let output = '{';
  for (let index = 0; index < keys.length; index += 1) {
    if (index !== 0) output += ',';
    const key = keys[index];
    output += `${REFLECT_APPLY(JSON_STRINGIFY, JSON_OBJECT, [key])}:${canonicalJson(ownValue(value, key))}`;
  }
  return `${output}}`;
}

function freezeJson(value) {
  if (value !== null && typeof value === 'object' && !OBJECT_IS_FROZEN(value)) {
    const children = OBJECT_VALUES(value);
    for (let index = 0; index < children.length; index += 1) freezeJson(children[index]);
    OBJECT_FREEZE(value);
  }
  return value;
}

function parseAuthorization(value) {
  try {
    if (
      typeof value !== 'string'
      || REFLECT_APPLY(BUFFER_BYTE_LENGTH, BUFFER_CONSTRUCTOR, [value, 'utf8']) > MAX_AUTHORIZATION_BYTES
      || !REFLECT_APPLY(STRING_STARTS_WITH, value, [AUTHORIZATION_SCHEME])
    ) {
      return null;
    }
    const encoded = REFLECT_APPLY(STRING_SLICE, value, [AUTHORIZATION_SCHEME.length]);
    if (!REFLECT_APPLY(REGEXP_TEST, BASE64URL, [encoded])) return null;
    const bytes = REFLECT_APPLY(BUFFER_FROM, BUFFER_CONSTRUCTOR, [encoded, 'base64url']);
    if (
      bytes.length === 0
      || REFLECT_APPLY(BUFFER_TO_STRING, bytes, ['base64url']) !== encoded
    ) return null;
    const text = REFLECT_APPLY(TEXT_DECODER_DECODE, UTF8_DECODER, [bytes]);
    const proof = REFLECT_APPLY(JSON_PARSE, JSON_OBJECT, [text]);
    if (!isPlainDataObject(proof) || canonicalJson(proof) !== text) return null;
    return freezeJson(proof);
  } catch {
    return null;
  }
}

function rawHeaderValues(request, wantedName) {
  try {
    const rawHeaders = ownValue(request, 'rawHeaders');
    if (
      !ARRAY_IS_ARRAY(rawHeaders)
      || IS_PROXY(rawHeaders)
      || GET_PROTOTYPE_OF(rawHeaders) !== ARRAY_PROTOTYPE
    ) return null;
    const lengthDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(rawHeaders, 'length');
    if (
      lengthDescriptor === undefined
      || !OBJECT_HAS_OWN(lengthDescriptor, 'value')
      || !NUMBER_IS_SAFE_INTEGER(lengthDescriptor.value)
      || lengthDescriptor.value < 0
      || lengthDescriptor.value % 2 !== 0
    ) return null;
    const values = [];
    for (let index = 0; index < lengthDescriptor.value; index += 2) {
      const nameDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(rawHeaders, STRING_FROM(index));
      const valueDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(rawHeaders, STRING_FROM(index + 1));
      if (
        nameDescriptor === undefined
        || valueDescriptor === undefined
        || !OBJECT_HAS_OWN(nameDescriptor, 'value')
        || !OBJECT_HAS_OWN(valueDescriptor, 'value')
      ) return null;
      const name = nameDescriptor.value;
      const value = valueDescriptor.value;
      if (typeof name !== 'string' || typeof value !== 'string') return null;
      if (REFLECT_APPLY(STRING_TO_LOWER_CASE, name, []) === wantedName) {
        OBJECT_DEFINE_PROPERTY(values, STRING_FROM(values.length), {
          value,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    }
    return values;
  } catch {
    return null;
  }
}

function framingIsEmpty(request) {
  const contentTypes = rawHeaderValues(request, 'content-type');
  const transferEncodings = rawHeaderValues(request, 'transfer-encoding');
  const contentLengths = rawHeaderValues(request, 'content-length');
  return contentTypes !== null
    && transferEncodings !== null
    && contentLengths !== null
    && contentTypes.length === 0
    && transferEncodings.length === 0
    && (contentLengths.length === 0 || (
      contentLengths.length === 1 && contentLengths[0] === '0'
    ));
}

function authorizationHeader(request) {
  const values = rawHeaderValues(request, 'authorization');
  return values?.length === 1 ? values[0] : null;
}

function responseDescriptor(statusCode, body, extraHeaders = undefined) {
  return Object.freeze({
    statusCode,
    body: Buffer.from(JSON.stringify(body), 'utf8'),
    extraHeaders,
  });
}

const RESPONSE = Object.freeze({
  badRequest: responseDescriptor(400, { error: 'invalid_request' }),
  unauthorized: responseDescriptor(401, { error: 'unauthorized' }, {
    'WWW-Authenticate': 'ServiceCredit',
  }),
  forbidden: responseDescriptor(403, { error: 'credit_not_authorized' }),
  notFound: responseDescriptor(404, { error: 'not_found' }),
  methodNotAllowed: responseDescriptor(405, { error: 'method_not_allowed' }, { Allow: 'POST' }),
  conflict: responseDescriptor(409, { error: 'request_unavailable' }),
  unavailable: responseDescriptor(503, { error: 'service_unavailable' }),
});

function successfulResponse(cachedResult) {
  if (!validCachedResult(cachedResult)) return RESPONSE.unavailable;
  return responseDescriptor(cachedResult.statusCode, {
    ok: true,
    resultCode: cachedResult.resultCode,
  });
}

function send(response, descriptor) {
  try {
    if (response.destroyed || response.writableEnded) return;
    response.statusCode = descriptor.statusCode;
    for (const [name, value] of Object.entries(PRIVATE_HEADERS)) {
      response.setHeader(name, value);
    }
    if (descriptor.extraHeaders) {
      for (const [name, value] of Object.entries(descriptor.extraHeaders)) {
        response.setHeader(name, value);
      }
    }
    response.setHeader('Content-Length', descriptor.body.length);
    response.end(descriptor.body);
  } catch {
    try {
      response.destroy();
    } catch {
      // The peer may already have disconnected.
    }
  }
}

function validIdentifier(value) {
  return typeof value === 'string'
    && REFLECT_APPLY(REGEXP_TEST, IDENTIFIER, [value])
    && !REFLECT_APPLY(STRING_INCLUDES, value, ['://']);
}

function minimalGrant(value) {
  try {
    if (!isPlainDataObject(value)) return null;
    const grantId = ownValue(value, 'grantId');
    const capabilityCommitment = ownValue(value, 'capabilityCommitment');
    if (
      !validIdentifier(grantId)
      || typeof capabilityCommitment !== 'string'
      || !REFLECT_APPLY(REGEXP_TEST, SHA256_COMMITMENT, [capabilityCommitment])
    ) {
      return null;
    }
    return OBJECT_FREEZE({
      grantId,
      capabilityCommitment,
    });
  } catch {
    return null;
  }
}

function validateStartupState(state) {
  const suppliedCanonicalState = canonicalJson(state);
  let callbackInvoked = false;
  const forbiddenCallback = () => {
    callbackInvoked = true;
    throw new TYPE_ERROR('startup callback invoked');
  };
  const model = REFLECT_APPLY(MODEL_FROM_STATE, InMemoryServiceCreditModel, [{
    deriveCost: forbiddenCallback,
    now: forbiddenCallback,
  }, state]);
  const normalizedState = REFLECT_APPLY(MODEL_EXPORT_STATE, model, []);
  if (
    callbackInvoked
    || ownValue(normalizedState, 'schemaVersion') !== SERVICE_CREDIT_STATE_SCHEMA_VERSION
    || canonicalJson(normalizedState) !== suppliedCanonicalState
  ) {
    throw new TYPE_ERROR('invalid snapshot');
  }
  return normalizedState;
}

function snapshotChecksum(schemaVersion, revision, state) {
  const hash = createHash('sha256');
  REFLECT_APPLY(HASH_UPDATE, hash, [canonicalJson({
    revision,
    schemaVersion,
    state,
  })]);
  return `sha256:${REFLECT_APPLY(HASH_DIGEST, hash, ['hex'])}`;
}

function buildGrantAdmissionIndex(store) {
  try {
    const load = exactDataMethod(store, 'load');
    if (load === null) throw new TYPE_ERROR('invalid snapshot');
    const snapshot = REFLECT_APPLY(load, store, []);
    if (!exactKeys(snapshot, ['schemaVersion', 'revision', 'state', 'checksum'])) {
      throw new TYPE_ERROR('invalid snapshot');
    }
    const schemaVersion = ownValue(snapshot, 'schemaVersion');
    const revision = ownValue(snapshot, 'revision');
    const checksum = ownValue(snapshot, 'checksum');
    const state = ownValue(snapshot, 'state');
    if (
      schemaVersion !== SERVICE_CREDIT_STORE_ENVELOPE_SCHEMA_VERSION
      || !NUMBER_IS_SAFE_INTEGER(revision)
      || revision < 0
      || typeof checksum !== 'string'
      || !REFLECT_APPLY(REGEXP_TEST, SHA256_COMMITMENT, [checksum])
      || !exactKeys(state, ['schemaVersion', 'modelVersion', 'offers', 'grants', 'requests'])
      || ownValue(state, 'schemaVersion') !== SERVICE_CREDIT_STATE_SCHEMA_VERSION
      || ownValue(state, 'modelVersion') !== SERVICE_CREDIT_MODEL_VERSION
    ) {
      throw new TYPE_ERROR('invalid snapshot');
    }
    const normalizedState = validateStartupState(state);
    if (checksum !== snapshotChecksum(schemaVersion, revision, normalizedState)) {
      throw new TYPE_ERROR('invalid snapshot');
    }
    const records = captureBoundedArray(
      ownValue(normalizedState, 'grants'),
      MAX_ADMITTED_GRANTS,
    );
    if (!records) throw new TYPE_ERROR('invalid snapshot');
    const admitted = new MAP_CONSTRUCTOR();
    const commitments = new SET_CONSTRUCTOR();
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      const grant = minimalGrant(record);
      if (
        !grant
        || REFLECT_APPLY(MAP_HAS, admitted, [grant.grantId])
        || REFLECT_APPLY(SET_HAS, commitments, [grant.capabilityCommitment])
      ) {
        throw new TYPE_ERROR('invalid snapshot');
      }
      REFLECT_APPLY(MAP_SET, admitted, [grant.grantId, grant]);
      REFLECT_APPLY(SET_ADD, commitments, [grant.capabilityCommitment]);
    }
    return admitted;
  } catch {
    throw new TYPE_ERROR('SERVICE_CREDIT_HTTP_INVALID_CONFIGURATION');
  }
}

function proofIdentity(proof) {
  try {
    if (!isPlainDataObject(proof)) return null;
    const grantId = ownValue(proof, 'grantId');
    return validIdentifier(grantId) ? grantId : null;
  } catch {
    return null;
  }
}

function buildRequest(proof) {
  try {
    return OBJECT_FREEZE({
      modelVersion: SERVICE_CREDIT_MODEL_VERSION,
      grantId: ownValue(proof, 'grantId'),
      requestId: ownValue(proof, 'requestId'),
      method: 'POST',
      routeId: SERVICE_CREDIT_HTTP_ROUTE_ID,
      canonicalBodyDigest: EMPTY_BODY_DIGEST,
      selectedContentType: APPLICATION_CONTENT_TYPE,
      maxCostUnits: ownValue(proof, 'maxCostUnits'),
    });
  } catch {
    return null;
  }
}

function ownValue(value, key) {
  try {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    return descriptor?.enumerable === true && OBJECT_HAS_OWN(descriptor, 'value')
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

function requestSnapshot(value, expected) {
  const keys = [
    'modelVersion',
    'grantId',
    'requestId',
    'requestDigest',
    'offerId',
    'offerVersion',
    'method',
    'routeId',
    'canonicalBodyDigest',
    'selectedContentType',
    'maxCostUnits',
    'costUnits',
    'state',
    'cachedResult',
  ];
  if (!exactKeys(value, keys)) return null;
  const state = ownValue(value, 'state');
  const requestDigest = ownValue(value, 'requestDigest');
  const cachedResult = ownValue(value, 'cachedResult');
  if (
    ownValue(value, 'modelVersion') !== expected.modelVersion
    || ownValue(value, 'grantId') !== expected.grantId
    || ownValue(value, 'requestId') !== expected.requestId
    || ownValue(value, 'method') !== expected.method
    || ownValue(value, 'routeId') !== expected.routeId
    || ownValue(value, 'canonicalBodyDigest') !== expected.canonicalBodyDigest
    || ownValue(value, 'selectedContentType') !== expected.selectedContentType
    || ownValue(value, 'maxCostUnits') !== expected.maxCostUnits
    || typeof requestDigest !== 'string'
    || !SHA256_COMMITMENT.test(requestDigest)
    || !Object.values(REQUEST_STATE).includes(state)
    || !validIdentifier(ownValue(value, 'offerId'))
    || !Number.isSafeInteger(ownValue(value, 'offerVersion'))
    || ownValue(value, 'offerVersion') <= 0
    || !Number.isSafeInteger(ownValue(value, 'costUnits'))
    || ownValue(value, 'costUnits') <= 0
    || (state === REQUEST_STATE.SUCCEEDED ? !validCachedResult(cachedResult) : cachedResult !== null)
  ) {
    return null;
  }
  return Object.freeze({
    requestDigest,
    state,
    cachedResult,
  });
}

function reservationSnapshot(value, expected) {
  if (!exactKeys(value, ['replayed', 'executionAuthorized', 'request'])) return null;
  if (typeof value.replayed !== 'boolean' || value.executionAuthorized !== false) return null;
  const request = requestSnapshot(value.request, expected);
  return request ? Object.freeze({ replayed: value.replayed, request }) : null;
}

function transitionSnapshot(value, expected, authorizationKey) {
  if (!exactKeys(value, [authorizationKey, 'request'])) return null;
  if (typeof value[authorizationKey] !== 'boolean') return null;
  const request = requestSnapshot(value.request, expected);
  return request
    ? Object.freeze({ flag: value[authorizationKey], request })
    : null;
}

function validCachedResult(value) {
  return exactKeys(value, ['statusCode', 'contentType', 'resultCode'])
    && value.statusCode === 200
    && value.contentType === APPLICATION_CONTENT_TYPE
    && typeof value.resultCode === 'string'
    && RESULT_CODE.test(value.resultCode)
    && !value.resultCode.includes('://');
}

function validCallbackResult(value) {
  return exactKeys(value, ['resultCode'])
    && typeof value.resultCode === 'string'
    && RESULT_CODE.test(value.resultCode)
    && !value.resultCode.includes('://');
}

function referenceFor(request) {
  return Object.freeze({
    grantId: request.grantId,
    requestId: request.requestId,
  });
}

function executionIdFor(request, requestDigest) {
  const binding = canonicalJson({
    grantId: request.grantId,
    requestId: request.requestId,
    requestDigest,
  });
  return `sha256:${createHash('sha256')
    .update(EXECUTION_ID_DOMAIN)
    .update(binding, 'utf8')
    .digest('hex')}`;
}

function requestOperationId(request) {
  return `sha256:${createHash('sha256')
    .update(REQUEST_OPERATION_DOMAIN)
    .update(canonicalJson(request), 'utf8')
    .digest('hex')}`;
}

function createRequestStartAdmission() {
  let windowStartedAt = monotonicMilliseconds();
  let starts = 0;
  return function admitRequestStart() {
    const now = monotonicMilliseconds();
    if (!NUMBER_IS_FINITE(now) || now < windowStartedAt) return false;
    if (now - windowStartedAt >= REQUEST_START_WINDOW_MS) {
      windowStartedAt = now;
      starts = 0;
    }
    if (starts >= MAX_REQUEST_STARTS_PER_WINDOW) return false;
    starts += 1;
    return true;
  };
}

function executionIdentity(executionId) {
  return Object.freeze({ executionId });
}

function modelResponse(error) {
  try {
    if (!(error instanceof ServiceCreditModelError)) return RESPONSE.unavailable;
    const code = ownValue(error, 'code');
    if (['GRANT_NOT_ACTIVE', 'COST_NOT_AUTHORIZED', 'INSUFFICIENT_UNITS'].includes(code)) {
      return RESPONSE.forbidden;
    }
    if (code === 'REQUEST_ID_CONFLICT') return RESPONSE.conflict;
    return RESPONSE.unavailable;
  } catch {
    return RESPONSE.unavailable;
  }
}

function captureConfiguration(options) {
  if (!exactKeys(options, ['store', 'execute'])) {
    throw new TypeError('SERVICE_CREDIT_HTTP_INVALID_CONFIGURATION');
  }
  const store = ownValue(options, 'store');
  const execute = ownValue(options, 'execute');
  if (store === null || (typeof store !== 'object' && typeof store !== 'function')) {
    throw new TypeError('SERVICE_CREDIT_HTTP_INVALID_CONFIGURATION');
  }
  for (const name of [
    'load',
    'reserveRequest',
    'beginExecution',
    'completeExecution',
    'markOutcomeUnknown',
  ]) {
    if (typeof store[name] !== 'function') {
      throw new TypeError('SERVICE_CREDIT_HTTP_INVALID_CONFIGURATION');
    }
  }
  if (typeof execute !== 'function') {
    throw new TypeError('SERVICE_CREDIT_HTTP_INVALID_CONFIGURATION');
  }
  return Object.freeze({ store, execute });
}

async function quarantineOutcome(store, reference, expected) {
  try {
    const outcome = transitionSnapshot(
      store.markOutcomeUnknown(reference),
      expected,
      'transitioned',
    );
    if (!outcome || outcome.request.state !== REQUEST_STATE.OUTCOME_UNKNOWN) {
      return RESPONSE.unavailable;
    }
    return RESPONSE.conflict;
  } catch {
    return RESPONSE.unavailable;
  }
}

async function executeReserved(configuration, expected, reserved, executionId) {
  const reference = referenceFor(expected);
  let begun;
  try {
    begun = transitionSnapshot(
      configuration.store.beginExecution(reference),
      expected,
      'executionAuthorized',
    );
  } catch (error) {
    return modelResponse(error);
  }
  if (!begun) return RESPONSE.unavailable;
  if (!begun.flag) {
    if (begun.request.state === REQUEST_STATE.SUCCEEDED) {
      return successfulResponse(begun.request.cachedResult);
    }
    return RESPONSE.conflict;
  }
  if (
    begun.request.state !== REQUEST_STATE.EXECUTING
    || begun.request.requestDigest !== reserved.requestDigest
  ) {
    return RESPONSE.unavailable;
  }

  let applicationResult;
  try {
    applicationResult = await Reflect.apply(
      configuration.execute,
      undefined,
      [executionIdentity(executionId)],
    );
  } catch {
    return quarantineOutcome(configuration.store, reference, expected);
  }
  if (!validCallbackResult(applicationResult)) {
    return quarantineOutcome(configuration.store, reference, expected);
  }

  const cachedResult = Object.freeze({
    statusCode: 200,
    contentType: APPLICATION_CONTENT_TYPE,
    resultCode: applicationResult.resultCode,
  });
  let completed;
  try {
    completed = transitionSnapshot(
      configuration.store.completeExecution({
        grantId: reference.grantId,
        requestId: reference.requestId,
        cachedResult,
      }),
      expected,
      'transitioned',
    );
  } catch {
    return RESPONSE.unavailable;
  }
  if (
    !completed
    || completed.request.state !== REQUEST_STATE.SUCCEEDED
    || !validCachedResult(completed.request.cachedResult)
    || canonicalJson(completed.request.cachedResult) !== canonicalJson(cachedResult)
  ) {
    return RESPONSE.unavailable;
  }
  return successfulResponse(completed.request.cachedResult);
}

async function processAuthorizedRequest(configuration, normalizedRequest) {
  let reservation;
  try {
    reservation = reservationSnapshot(
      configuration.store.reserveRequest(normalizedRequest),
      normalizedRequest,
    );
  } catch (error) {
    return modelResponse(error);
  }
  if (!reservation) return RESPONSE.unavailable;
  if (reservation.request.state === REQUEST_STATE.SUCCEEDED) {
    return successfulResponse(reservation.request.cachedResult);
  }
  if (reservation.request.state !== REQUEST_STATE.RESERVED) return RESPONSE.conflict;
  const executionId = executionIdFor(
    normalizedRequest,
    reservation.request.requestDigest,
  );
  return executeReserved(
    configuration,
    normalizedRequest,
    reservation.request,
    executionId,
  );
}

function authorizationDecision(status, request = null) {
  return OBJECT_FREEZE({ status, request });
}

function authorizeServiceCreditRequest(request, admittedGrants, admitRequestStart) {
  if (ownValue(request, 'url') !== SERVICE_CREDIT_HTTP_PATH) {
    return authorizationDecision('NOT_FOUND');
  }
  if (ownValue(request, 'method') !== 'POST') {
    return authorizationDecision('METHOD_NOT_ALLOWED');
  }
  if (!framingIsEmpty(request)) {
    return authorizationDecision('BAD_REQUEST');
  }
  if (!admitRequestStart()) {
    return authorizationDecision('UNAVAILABLE');
  }

  const proof = parseAuthorization(authorizationHeader(request));
  const grantId = proofIdentity(proof);
  if (!proof || !grantId) {
    return authorizationDecision('UNAUTHORIZED');
  }
  const grant = REFLECT_APPLY(MAP_GET, admittedGrants, [grantId]);
  if (!grant) {
    return authorizationDecision('UNAUTHORIZED');
  }
  const normalizedRequest = buildRequest(proof);
  if (normalizedRequest === null) return authorizationDecision('UNAUTHORIZED');
  try {
    const result = REFLECT_APPLY(VERIFY_CAPABILITY, undefined, [{
      grant,
      request: normalizedRequest,
      proof,
    }]);
    if (
      !exactKeys(result, ['verified', 'proofVersion', 'grantId', 'requestId', 'maxCostUnits'])
      || !OBJECT_IS_FROZEN(result)
      || ownValue(result, 'verified') !== true
      || ownValue(result, 'proofVersion') !== ownValue(proof, 'proofVersion')
      || ownValue(result, 'grantId') !== ownValue(normalizedRequest, 'grantId')
      || ownValue(result, 'requestId') !== ownValue(normalizedRequest, 'requestId')
      || ownValue(result, 'maxCostUnits') !== ownValue(normalizedRequest, 'maxCostUnits')
    ) {
      throw new TYPE_ERROR('capability mismatch');
    }
  } catch {
    return authorizationDecision('UNAUTHORIZED');
  }
  return authorizationDecision('AUTHORIZED', normalizedRequest);
}

function responseForAuthorizationDecision(status) {
  if (status === 'NOT_FOUND') return RESPONSE.notFound;
  if (status === 'METHOD_NOT_ALLOWED') return RESPONSE.methodNotAllowed;
  if (status === 'BAD_REQUEST') return RESPONSE.badRequest;
  if (status === 'UNAUTHORIZED') return RESPONSE.unauthorized;
  return RESPONSE.unavailable;
}

/**
 * Creates a non-authorizing parser and capability-admission boundary. An
 * accepted decision contains only the normalized request; it performs no
 * reservation, execution, outcome mapping, response write, or retry.
 */
export function createServiceCreditHttpAdmission(options) {
  if (arguments.length !== 1 || !exactKeys(options, ['store'])) {
    throw new TYPE_ERROR('SERVICE_CREDIT_HTTP_INVALID_CONFIGURATION');
  }
  const store = ownValue(options, 'store');
  if (store === null || (typeof store !== 'object' && typeof store !== 'function')) {
    throw new TYPE_ERROR('SERVICE_CREDIT_HTTP_INVALID_CONFIGURATION');
  }
  const admittedGrants = buildGrantAdmissionIndex(store);
  const admitRequestStart = createRequestStartAdmission();
  const admit = OBJECT_FREEZE((request, ...extra) => {
    if (extra.length !== 0) return authorizationDecision('UNAVAILABLE');
    try {
      return authorizeServiceCreditRequest(request, admittedGrants, admitRequestStart);
    } catch {
      return authorizationDecision('UNAVAILABLE');
    }
  });
  return OBJECT_FREEZE({ admit });
}

/**
 * Creates the standalone service-credit execution boundary. It intentionally
 * exposes no credit activation, settlement, administration, or reconciliation
 * operation and does not compose with the existing x402 payment route. Its
 * bounded capability-admission snapshot is immutable; a grant activated later
 * becomes eligible only after the handler is reconstructed. Execution has no
 * timeout here, so the fixed active-execution ceiling remains held while an
 * application callback is pending.
 */
export function createServiceCreditHttpHandler(options) {
  const configuration = captureConfiguration(options);
  const admission = createServiceCreditHttpAdmission({ store: configuration.store });
  const inFlight = new Map();
  let activeExecutions = 0;

  return async function serviceCreditHttpHandler(request, response) {
    let descriptor = RESPONSE.unavailable;
    try {
      const decision = admission.admit(request);
      if (decision.status !== 'AUTHORIZED') {
        descriptor = responseForAuthorizationDecision(decision.status);
      } else {
        const normalizedRequest = decision.request;
        const operationId = requestOperationId(normalizedRequest);
        const existing = inFlight.get(operationId);
        if (existing) {
          descriptor = await existing;
        } else if (activeExecutions >= MAX_ACTIVE_EXECUTIONS) {
          descriptor = RESPONSE.unavailable;
        } else {
          activeExecutions += 1;
          const operation = Promise.resolve().then(() => processAuthorizedRequest(
            configuration,
            normalizedRequest,
          ));
          inFlight.set(operationId, operation);
          try {
            descriptor = await operation;
          } finally {
            if (inFlight.get(operationId) === operation) inFlight.delete(operationId);
            activeExecutions -= 1;
          }
        }
      }
    } catch {
      descriptor = RESPONSE.unavailable;
    }
    send(response, descriptor);
  };
}
