import { types as utilTypes } from 'node:util';

import {
  createDurableServiceCreditExecutionOwner,
} from './service-credit-durable-execution-owner.js';
import {
  createServiceCreditHttpAdmission,
} from './service-credit-http.js';
import { ServiceCreditSqliteStore } from './service-credit-sqlite-store.js';

const REFLECT_APPLY = Reflect.apply;
const GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Reflect.getPrototypeOf;
const OWN_KEYS = Reflect.ownKeys;
const OBJECT_CREATE = Object.create;
const OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_IS_FROZEN = Object.isFrozen;
const OBJECT_PROTOTYPE = Object.prototype;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const REGEXP_EXEC = RegExp.prototype.exec;
const STRING_INCLUDES = String.prototype.includes;
const IS_PROXY = utilTypes.isProxy;
const NATIVE_TYPE_ERROR = TypeError;
const NATIVE_PROMISE = Promise;
const PROMISE_THEN = Promise.prototype.then;
const JSON_STRINGIFY = JSON.stringify;
const BUFFER_FROM = Buffer.from;

const SESSION_KEYS = OBJECT_FREEZE([
  'store',
  'execute',
  'deadlineRuntime',
  'selectedDurationMs',
]);
const SNAPSHOT_KEYS = OBJECT_FREEZE(['revision', 'executionState']);
const EXECUTION_STATE_KEYS = OBJECT_FREEZE([
  'contractVersion',
  'ledgerId',
  'policy',
  'capacity',
  'generation',
  'executions',
]);
const POLICY_KEYS = OBJECT_FREEZE(['policyId', 'policyVersion', 'maxDurationMs']);
const OWNER_KEYS = OBJECT_FREEZE(['run', 'close']);
const ADMISSION_KEYS = OBJECT_FREEZE(['admit']);
const DECISION_KEYS = OBJECT_FREEZE(['status', 'request']);
const OUTCOME_KEYS = OBJECT_FREEZE(['status', 'cachedResult']);
const CACHED_RESULT_KEYS = OBJECT_FREEZE(['statusCode', 'contentType', 'resultCode']);
const RESULT_CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const APPLICATION_CONTENT_TYPE = 'application/json';
const INVALID_CONFIGURATION = 'SERVICE_CREDIT_DURABLE_HTTP_SESSION_INVALID_CONFIGURATION';
const INVALID_INPUT = 'SERVICE_CREDIT_DURABLE_HTTP_SESSION_INVALID_INPUT';
const CLOSE_FAILED = 'SERVICE_CREDIT_DURABLE_HTTP_SESSION_CLOSE_FAILED';
const OWNER_CONFLICT = 'SERVICE_CREDIT_DURABLE_OWNER_CONFLICT';

const PRIVATE_HEADERS = OBJECT_FREEZE({
  'Cache-Control': 'private, no-store, max-age=0',
  'Content-Type': APPLICATION_CONTENT_TYPE,
  Vary: 'Authorization',
  'X-Content-Type-Options': 'nosniff',
});

function prototypeMethod(prototype, name) {
  const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(prototype, name);
  if (
    descriptor === undefined
    || !OBJECT_HAS_OWN(descriptor, 'value')
    || typeof descriptor.value !== 'function'
    || IS_PROXY(descriptor.value)
  ) {
    throw new NATIVE_TYPE_ERROR(INVALID_CONFIGURATION);
  }
  return descriptor.value;
}

const STORE_PROTOTYPE = ServiceCreditSqliteStore.prototype;
const STORE_GET_DURABLE_SNAPSHOT = prototypeMethod(
  STORE_PROTOTYPE,
  'getDurableExecutionSnapshot',
);

function failure(code) {
  const error = new NATIVE_TYPE_ERROR(code);
  OBJECT_DEFINE_PROPERTY(error, 'stack', {
    value: `TypeError: ${code}`,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return OBJECT_FREEZE(error);
}

function keyAllowed(key, expectedKeys) {
  for (let index = 0; index < expectedKeys.length; index += 1) {
    if (expectedKeys[index] === key) return true;
  }
  return false;
}

function exactDataObject(value, expectedKeys, requireFrozen = false) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || IS_PROXY(value)
      || GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE
      || (requireFrozen && !OBJECT_IS_FROZEN(value))
    ) {
      return null;
    }
    const keys = OWN_KEYS(value);
    if (keys.length !== expectedKeys.length) return null;
    const captured = OBJECT_CREATE(null);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key !== 'string' || !keyAllowed(key, expectedKeys)) return null;
      const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) return null;
      captured[key] = descriptor.value;
    }
    return captured;
  } catch {
    return null;
  }
}

function ownDataValue(value, key) {
  try {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
      return undefined;
    }
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    return descriptor?.enumerable === true && OBJECT_HAS_OWN(descriptor, 'value')
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

function regexpMatches(expression, value) {
  return REFLECT_APPLY(REGEXP_EXEC, expression, [value]) !== null;
}

function captureCallableSurface(value, keys) {
  const surface = exactDataObject(value, keys, true);
  if (surface === null) throw failure(INVALID_CONFIGURATION);
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof surface[keys[index]] !== 'function' || IS_PROXY(surface[keys[index]])) {
      throw failure(INVALID_CONFIGURATION);
    }
  }
  return surface;
}

function validateDurableCutover(store, selectedDurationMs) {
  if (
    store === null
    || typeof store !== 'object'
    || IS_PROXY(store)
    || GET_PROTOTYPE_OF(store) !== STORE_PROTOTYPE
  ) {
    throw failure(INVALID_CONFIGURATION);
  }
  let snapshotValue;
  try {
    snapshotValue = REFLECT_APPLY(STORE_GET_DURABLE_SNAPSHOT, store, []);
  } catch {
    throw failure(INVALID_CONFIGURATION);
  }
  const snapshot = exactDataObject(snapshotValue, SNAPSHOT_KEYS, true);
  const executionState = snapshot === null
    ? null
    : exactDataObject(snapshot.executionState, EXECUTION_STATE_KEYS, true);
  const policy = executionState === null
    ? null
    : exactDataObject(executionState.policy, POLICY_KEYS, true);
  if (
    snapshot === null
    || !NUMBER_IS_SAFE_INTEGER(snapshot.revision)
    || snapshot.revision < 0
    || executionState === null
    || policy === null
    || !NUMBER_IS_SAFE_INTEGER(policy.maxDurationMs)
    || policy.maxDurationMs < 1
    || selectedDurationMs > policy.maxDurationMs
  ) {
    throw failure(INVALID_CONFIGURATION);
  }
}

function nativePromiseCapability() {
  let resolve;
  let reject;
  const promise = new NATIVE_PROMISE((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return OBJECT_FREEZE({ promise, resolve, reject });
}

function nativeRejected(error) {
  const capability = nativePromiseCapability();
  capability.reject(error);
  return capability.promise;
}

function responseDescriptor(statusCode, body, extraHeaderName = null, extraHeaderValue = null) {
  return OBJECT_FREEZE({
    statusCode,
    body: REFLECT_APPLY(BUFFER_FROM, Buffer, [
      REFLECT_APPLY(JSON_STRINGIFY, JSON, [body]),
      'utf8',
    ]),
    extraHeaderName,
    extraHeaderValue,
  });
}

const RESPONSE = OBJECT_FREEZE({
  badRequest: responseDescriptor(400, { error: 'invalid_request' }),
  unauthorized: responseDescriptor(
    401,
    { error: 'unauthorized' },
    'WWW-Authenticate',
    'ServiceCredit',
  ),
  notFound: responseDescriptor(404, { error: 'not_found' }),
  methodNotAllowed: responseDescriptor(405, { error: 'method_not_allowed' }, 'Allow', 'POST'),
  conflict: responseDescriptor(409, { error: 'request_unavailable' }),
  unavailable: responseDescriptor(503, { error: 'service_unavailable' }),
});

function successfulResponse(value) {
  const cached = exactDataObject(value, CACHED_RESULT_KEYS, true);
  if (
    cached === null
    || cached.statusCode !== 200
    || cached.contentType !== APPLICATION_CONTENT_TYPE
    || typeof cached.resultCode !== 'string'
    || !regexpMatches(RESULT_CODE, cached.resultCode)
    || REFLECT_APPLY(STRING_INCLUDES, cached.resultCode, ['://'])
  ) {
    return RESPONSE.unavailable;
  }
  const body = OBJECT_CREATE(null);
  OBJECT_DEFINE_PROPERTY(body, 'ok', {
    value: true,
    enumerable: true,
    writable: false,
    configurable: false,
  });
  OBJECT_DEFINE_PROPERTY(body, 'resultCode', {
    value: cached.resultCode,
    enumerable: true,
    writable: false,
    configurable: false,
  });
  return responseDescriptor(200, OBJECT_FREEZE(body));
}

function responseForAdmission(value) {
  const decision = exactDataObject(value, DECISION_KEYS, true);
  if (decision === null) return OBJECT_FREEZE({ descriptor: RESPONSE.unavailable, request: null });
  if (decision.status === 'AUTHORIZED' && decision.request !== null) {
    return OBJECT_FREEZE({ descriptor: null, request: decision.request });
  }
  if (decision.request !== null) {
    return OBJECT_FREEZE({ descriptor: RESPONSE.unavailable, request: null });
  }
  if (decision.status === 'NOT_FOUND') {
    return OBJECT_FREEZE({ descriptor: RESPONSE.notFound, request: null });
  }
  if (decision.status === 'METHOD_NOT_ALLOWED') {
    return OBJECT_FREEZE({ descriptor: RESPONSE.methodNotAllowed, request: null });
  }
  if (decision.status === 'BAD_REQUEST') {
    return OBJECT_FREEZE({ descriptor: RESPONSE.badRequest, request: null });
  }
  if (decision.status === 'UNAUTHORIZED') {
    return OBJECT_FREEZE({ descriptor: RESPONSE.unauthorized, request: null });
  }
  return OBJECT_FREEZE({ descriptor: RESPONSE.unavailable, request: null });
}

function responseForOutcome(value) {
  const outcome = exactDataObject(value, OUTCOME_KEYS, true);
  if (outcome === null) return RESPONSE.unavailable;
  if (outcome.status === 'SUCCEEDED' || outcome.status === 'CACHED_SUCCESS') {
    return successfulResponse(outcome.cachedResult);
  }
  if (outcome.cachedResult !== null) return RESPONSE.unavailable;
  return outcome.status === 'NOT_INVOKED' ? RESPONSE.conflict : RESPONSE.unavailable;
}

function responseForOwnerFailure(error) {
  return ownDataValue(error, 'code') === OWNER_CONFLICT
    ? RESPONSE.conflict
    : RESPONSE.unavailable;
}

function send(response, descriptor) {
  try {
    if (response.destroyed || response.writableEnded) return;
    response.statusCode = descriptor.statusCode;
    response.setHeader('Cache-Control', PRIVATE_HEADERS['Cache-Control']);
    response.setHeader('Content-Type', PRIVATE_HEADERS['Content-Type']);
    response.setHeader('Vary', PRIVATE_HEADERS.Vary);
    response.setHeader('X-Content-Type-Options', PRIVATE_HEADERS['X-Content-Type-Options']);
    if (descriptor.extraHeaderName !== null) {
      response.setHeader(descriptor.extraHeaderName, descriptor.extraHeaderValue);
    }
    response.setHeader('Content-Length', descriptor.body.length);
    response.end(descriptor.body);
  } catch {
    try { response.destroy(); } catch {}
  }
}

/**
 * Creates an opt-in HTTP session over one already-initialized durable store.
 * The session owns neither initialization, recovery, reconciliation, nor the
 * borrowed store, and it never mounts itself on the active resource server.
 */
export function createDurableServiceCreditHttpSession(options) {
  if (arguments.length !== 1) throw failure(INVALID_CONFIGURATION);
  const configuration = exactDataObject(options, SESSION_KEYS);
  if (
    configuration === null
    || !NUMBER_IS_SAFE_INTEGER(configuration.selectedDurationMs)
    || configuration.selectedDurationMs < 1
  ) {
    throw failure(INVALID_CONFIGURATION);
  }

  validateDurableCutover(configuration.store, configuration.selectedDurationMs);

  let admission;
  let owner;
  try {
    admission = captureCallableSurface(
      createServiceCreditHttpAdmission({ store: configuration.store }),
      ADMISSION_KEYS,
    );
    owner = captureCallableSurface(createDurableServiceCreditExecutionOwner({
      store: configuration.store,
      execute: configuration.execute,
      deadlineRuntime: configuration.deadlineRuntime,
    }), OWNER_KEYS);
  } catch {
    throw failure(INVALID_CONFIGURATION);
  }

  const admit = admission.admit;
  const ownerRun = owner.run;
  const ownerClose = owner.close;
  let admissionClosed = false;
  let pendingCloses = null;
  let completedClose = null;
  let completedOwnerClose = null;

  function findPendingClose(ownerCloseResult) {
    let current = pendingCloses;
    while (current !== null) {
      if (current.ownerCloseResult === ownerCloseResult) return current;
      current = current.next;
    }
    return null;
  }

  function removePendingClose(record) {
    if (pendingCloses === record) {
      pendingCloses = record.next;
      return;
    }
    let current = pendingCloses;
    while (current !== null && current.next !== record) current = current.next;
    if (current !== null) current.next = record.next;
  }

  const handle = OBJECT_FREEZE(async function durableServiceCreditHttpHandler(
    request,
    response,
    ...extra
  ) {
    let descriptor = RESPONSE.unavailable;
    try {
      if (!admissionClosed && extra.length === 0) {
        const decision = responseForAdmission(REFLECT_APPLY(admit, undefined, [request]));
        if (decision.descriptor !== null) {
          descriptor = decision.descriptor;
        } else if (!admissionClosed) {
          try {
            const outcome = await REFLECT_APPLY(ownerRun, undefined, [OBJECT_FREEZE({
              request: decision.request,
              selectedDurationMs: configuration.selectedDurationMs,
            })]);
            descriptor = responseForOutcome(outcome);
          } catch (error) {
            descriptor = responseForOwnerFailure(error);
          }
        }
      }
    } catch {
      descriptor = RESPONSE.unavailable;
    }
    send(response, descriptor);
  });

  const close = OBJECT_FREEZE((...args) => {
    if (args.length !== 0) return nativeRejected(failure(INVALID_INPUT));
    let ownerCloseResult;
    try {
      ownerCloseResult = REFLECT_APPLY(ownerClose, undefined, []);
    } catch {
      return nativeRejected(failure(CLOSE_FAILED));
    }
    if (completedClose !== null && ownerCloseResult === completedOwnerClose) {
      return completedClose;
    }
    const existing = findPendingClose(ownerCloseResult);
    if (existing !== null) return existing.capability.promise;

    const capability = nativePromiseCapability();
    const record = { ownerCloseResult, capability, next: pendingCloses };
    pendingCloses = record;
    try {
      REFLECT_APPLY(PROMISE_THEN, ownerCloseResult, [
        () => {
          admissionClosed = true;
          completedOwnerClose = ownerCloseResult;
          completedClose = capability.promise;
          removePendingClose(record);
          capability.resolve(undefined);
        },
        () => {
          removePendingClose(record);
          capability.reject(failure(CLOSE_FAILED));
        },
      ]);
    } catch {
      removePendingClose(record);
      capability.reject(failure(CLOSE_FAILED));
    }
    return capability.promise;
  });

  return OBJECT_FREEZE({ handle, close });
}
