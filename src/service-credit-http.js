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
const PRIVATE_HEADERS = Object.freeze({
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
      || Array.isArray(value)
      || utilTypes.isProxy(value)
      || Reflect.getPrototypeOf(value) !== Object.prototype
    ) {
      return false;
    }
    return Reflect.ownKeys(value).every(key => {
      if (typeof key !== 'string') return false;
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
    });
  } catch {
    return false;
  }
}

function exactKeys(value, keys) {
  if (!isPlainDataObject(value)) return false;
  const observed = Reflect.ownKeys(value);
  return observed.length === keys.length && observed.every(key => keys.includes(key));
}

function captureBoundedArray(value, maximumLength) {
  try {
    if (
      !Array.isArray(value)
      || utilTypes.isProxy(value)
      || Reflect.getPrototypeOf(value) !== Array.prototype
    ) {
      return null;
    }
    const length = Reflect.getOwnPropertyDescriptor(value, 'length');
    if (
      !length
      || length.enumerable
      || !Object.hasOwn(length, 'value')
      || !Number.isSafeInteger(length.value)
      || length.value < 0
      || length.value > maximumLength
    ) {
      return null;
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length.value + 1 || keys.at(-1) !== 'length') return null;
    const captured = [];
    for (let index = 0; index < length.value; index += 1) {
      if (keys[index] !== String(index)) return null;
      const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
      captured.push(descriptor.value);
    }
    return captured;
  } catch {
    return null;
  }
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('invalid canonical value');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const captured = captureBoundedArray(value, MAX_CANONICAL_ARRAY_LENGTH);
    if (!captured) throw new TypeError('invalid canonical value');
    return `[${captured.map(canonicalJson).join(',')}]`;
  }
  if (!isPlainDataObject(value)) throw new TypeError('invalid canonical value');
  const keys = Reflect.ownKeys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function freezeJson(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}

function parseAuthorization(value) {
  try {
    if (
      typeof value !== 'string'
      || Buffer.byteLength(value, 'utf8') > MAX_AUTHORIZATION_BYTES
      || !value.startsWith(AUTHORIZATION_SCHEME)
    ) {
      return null;
    }
    const encoded = value.slice(AUTHORIZATION_SCHEME.length);
    if (!BASE64URL.test(encoded)) return null;
    const bytes = Buffer.from(encoded, 'base64url');
    if (bytes.length === 0 || bytes.toString('base64url') !== encoded) return null;
    const text = UTF8_DECODER.decode(bytes);
    const proof = JSON.parse(text);
    if (!isPlainDataObject(proof) || canonicalJson(proof) !== text) return null;
    return freezeJson(proof);
  } catch {
    return null;
  }
}

function rawHeaderValues(request, wantedName) {
  try {
    if (!Array.isArray(request.rawHeaders) || request.rawHeaders.length % 2 !== 0) return null;
    const values = [];
    for (let index = 0; index < request.rawHeaders.length; index += 2) {
      const name = request.rawHeaders[index];
      const value = request.rawHeaders[index + 1];
      if (typeof name !== 'string' || typeof value !== 'string') return null;
      if (name.toLowerCase() === wantedName) values.push(value);
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
  return typeof value === 'string' && IDENTIFIER.test(value) && !value.includes('://');
}

function minimalGrant(value) {
  try {
    if (!isPlainDataObject(value)) return null;
    const grantId = ownValue(value, 'grantId');
    const capabilityCommitment = ownValue(value, 'capabilityCommitment');
    if (
      !validIdentifier(grantId)
      || typeof capabilityCommitment !== 'string'
      || !SHA256_COMMITMENT.test(capabilityCommitment)
    ) {
      return null;
    }
    return Object.freeze({
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
    throw new TypeError('startup callback invoked');
  };
  const normalizedState = InMemoryServiceCreditModel.fromState({
    deriveCost: forbiddenCallback,
    now: forbiddenCallback,
  }, state).exportState();
  if (
    callbackInvoked
    || ownValue(normalizedState, 'schemaVersion') !== SERVICE_CREDIT_STATE_SCHEMA_VERSION
    || canonicalJson(normalizedState) !== suppliedCanonicalState
  ) {
    throw new TypeError('invalid snapshot');
  }
  return normalizedState;
}

function snapshotChecksum(schemaVersion, revision, state) {
  return `sha256:${createHash('sha256').update(canonicalJson({
    revision,
    schemaVersion,
    state,
  })).digest('hex')}`;
}

function buildGrantAdmissionIndex(store) {
  try {
    const snapshot = Reflect.apply(store.load, store, []);
    if (!exactKeys(snapshot, ['schemaVersion', 'revision', 'state', 'checksum'])) {
      throw new TypeError('invalid snapshot');
    }
    const schemaVersion = ownValue(snapshot, 'schemaVersion');
    const revision = ownValue(snapshot, 'revision');
    const checksum = ownValue(snapshot, 'checksum');
    const state = ownValue(snapshot, 'state');
    if (
      schemaVersion !== SERVICE_CREDIT_STORE_ENVELOPE_SCHEMA_VERSION
      || !Number.isSafeInteger(revision)
      || revision < 0
      || typeof checksum !== 'string'
      || !SHA256_COMMITMENT.test(checksum)
      || !exactKeys(state, ['schemaVersion', 'modelVersion', 'offers', 'grants', 'requests'])
      || ownValue(state, 'schemaVersion') !== SERVICE_CREDIT_STATE_SCHEMA_VERSION
      || ownValue(state, 'modelVersion') !== SERVICE_CREDIT_MODEL_VERSION
    ) {
      throw new TypeError('invalid snapshot');
    }
    const normalizedState = validateStartupState(state);
    if (checksum !== snapshotChecksum(schemaVersion, revision, normalizedState)) {
      throw new TypeError('invalid snapshot');
    }
    const records = captureBoundedArray(
      ownValue(normalizedState, 'grants'),
      MAX_ADMITTED_GRANTS,
    );
    if (!records) throw new TypeError('invalid snapshot');
    const admitted = new Map();
    const commitments = new Set();
    for (const record of records) {
      const grant = minimalGrant(record);
      if (
        !grant
        || admitted.has(grant.grantId)
        || commitments.has(grant.capabilityCommitment)
      ) {
        throw new TypeError('invalid snapshot');
      }
      admitted.set(grant.grantId, grant);
      commitments.add(grant.capabilityCommitment);
    }
    return admitted;
  } catch {
    throw new TypeError('SERVICE_CREDIT_HTTP_INVALID_CONFIGURATION');
  }
}

function proofIdentity(proof) {
  try {
    if (!isPlainDataObject(proof) || !validIdentifier(proof.grantId)) return null;
    return proof.grantId;
  } catch {
    return null;
  }
}

function buildRequest(proof) {
  try {
    return Object.freeze({
      modelVersion: SERVICE_CREDIT_MODEL_VERSION,
      grantId: proof.grantId,
      requestId: proof.requestId,
      method: 'POST',
      routeId: SERVICE_CREDIT_HTTP_ROUTE_ID,
      canonicalBodyDigest: EMPTY_BODY_DIGEST,
      selectedContentType: APPLICATION_CONTENT_TYPE,
      maxCostUnits: proof.maxCostUnits,
    });
  } catch {
    return null;
  }
}

function ownValue(value, key) {
  try {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value')
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
    if (!Number.isFinite(now) || now < windowStartedAt) return false;
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
  const admittedGrants = buildGrantAdmissionIndex(configuration.store);
  const admitRequestStart = createRequestStartAdmission();
  const inFlight = new Map();
  let activeExecutions = 0;

  return async function serviceCreditHttpHandler(request, response) {
    let descriptor = RESPONSE.unavailable;
    try {
      if (request.url !== SERVICE_CREDIT_HTTP_PATH) {
        descriptor = RESPONSE.notFound;
      } else if (request.method !== 'POST') {
        descriptor = RESPONSE.methodNotAllowed;
      } else if (!framingIsEmpty(request)) {
        descriptor = RESPONSE.badRequest;
      } else if (!admitRequestStart()) {
        descriptor = RESPONSE.unavailable;
      } else {
        const proof = parseAuthorization(authorizationHeader(request));
        const grantId = proofIdentity(proof);
        if (!proof || !grantId) {
          descriptor = RESPONSE.unauthorized;
        } else {
          const grant = admittedGrants.get(grantId);
          if (!grant) {
            descriptor = RESPONSE.unauthorized;
          } else {
            const normalizedRequest = buildRequest(proof);
            let verified = false;
            try {
              const result = verifyServiceCreditCapability({
                grant,
                request: normalizedRequest,
                proof,
              });
              if (
                result.verified !== true
                || result.grantId !== normalizedRequest.grantId
                || result.requestId !== normalizedRequest.requestId
                || result.maxCostUnits !== normalizedRequest.maxCostUnits
              ) {
                throw new TypeError('capability mismatch');
              }
              verified = true;
            } catch {
              descriptor = RESPONSE.unauthorized;
            }

            if (verified) {
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
          }
        }
      }
    } catch {
      descriptor = RESPONSE.unavailable;
    }
    send(response, descriptor);
  };
}
