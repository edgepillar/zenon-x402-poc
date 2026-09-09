import { AsyncLocalStorage } from 'node:async_hooks';
import { types as utilTypes } from 'node:util';

import {
  ServiceCreditSqliteStore,
  ServiceCreditSqliteStoreError,
} from './service-credit-sqlite-store.js';
import {
  SERVICE_CREDIT_MODEL_VERSION,
  ServiceCreditModelError,
} from './service-credit-model.js';

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
const ARRAY_IS_ARRAY = Array.isArray;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const REGEXP_EXEC = RegExp.prototype.exec;
const STRING_INCLUDES = String.prototype.includes;
const IS_PROXY = utilTypes.isProxy;
const BIGINT_FROM = BigInt;
const NUMBER_FROM = Number;
const NATIVE_PROMISE = Promise;
const PROMISE_RESOLVE = Promise.resolve;
const PROMISE_THEN = Promise.prototype.then;
const NATIVE_ABORT_CONTROLLER = AbortController;
const WEAK_SET_HAS = WeakSet.prototype.has;
const WEAK_SET_ADD = WeakSet.prototype.add;

const INVALID_CONFIGURATION = 'SERVICE_CREDIT_DURABLE_OWNER_INVALID_CONFIGURATION';
const INVALID_INPUT = 'SERVICE_CREDIT_DURABLE_OWNER_INVALID_INPUT';
const CONFLICT = 'SERVICE_CREDIT_DURABLE_OWNER_CONFLICT';
const BUSY = 'SERVICE_CREDIT_DURABLE_OWNER_BUSY';
const CLOSED = 'SERVICE_CREDIT_DURABLE_OWNER_CLOSED';
const CALLBACK_CONTEXT_ERROR = 'SERVICE_CREDIT_DURABLE_OWNER_CALLBACK_CONTEXT';
const QUARANTINED = 'SERVICE_CREDIT_DURABLE_OWNER_QUARANTINED';
const OPERATION_FAILED = 'SERVICE_CREDIT_DURABLE_OWNER_OPERATION_FAILED';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const METHOD = /^[A-Z][A-Z0-9_-]{0,15}$/;
const CONTENT_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/;
const CHECKSUM = /^sha256:[0-9a-f]{64}$/;

const OWNER_KEYS = OBJECT_FREEZE(['store', 'execute', 'deadlineRuntime']);
const DEADLINE_RUNTIME_KEYS = OBJECT_FREEZE(['monotonicNowNs', 'schedule', 'cancel']);
const RUN_KEYS = OBJECT_FREEZE(['request', 'selectedDurationMs']);
const REQUEST_KEYS = OBJECT_FREEZE([
  'modelVersion',
  'grantId',
  'requestId',
  'method',
  'routeId',
  'canonicalBodyDigest',
  'selectedContentType',
  'maxCostUnits',
]);
const CALLBACK_RESULT_KEYS = OBJECT_FREEZE(['resultCode']);
const CACHED_RESULT_KEYS = OBJECT_FREEZE(['statusCode', 'contentType', 'resultCode']);
const SNAPSHOT_RECEIPT_KEYS = OBJECT_FREEZE(['revision', 'executionState']);
const PREPARE_RECEIPT_KEYS = OBJECT_FREEZE([
  'disposition',
  'revision',
  'request',
  'execution',
]);
const FENCE_RECEIPT_KEYS = OBJECT_FREEZE([
  'disposition',
  'revision',
  'fenceWallClockNowMs',
  'execution',
]);
const COMPLETION_RECEIPT_KEYS = OBJECT_FREEZE([
  'disposition',
  'revision',
  'winner',
  'completionWallClockNowMs',
  'request',
  'execution',
]);
const UNKNOWN_RECEIPT_KEYS = OBJECT_FREEZE([
  'disposition',
  'revision',
  'winner',
  'request',
  'execution',
]);
const EXECUTION_KEYS = OBJECT_FREEZE([
  'executionVersion',
  'executionId',
  'generationId',
  'request',
  'policy',
  'selectedDurationMs',
  'wallClockStartMs',
  'wallClockDeadlineMs',
  'fencePhase',
  'terminalClassification',
  'terminalReason',
  'resultCommitment',
  'uncertaintyReason',
]);
const LEDGER_REQUEST_KEYS = OBJECT_FREEZE([
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
]);
const CALLBACK_OWN_KEYS = OBJECT_FREEZE([
  'length',
  'name',
  'arguments',
  'caller',
  'prototype',
]);
const NANOSECONDS_PER_MILLISECOND = 1_000_000n;
const TIMER_ROUNDING_NANOSECONDS = NANOSECONDS_PER_MILLISECOND - 1n;
const MAX_TIMER_CHUNK_MS = 2_147_483_646;
const MAX_SYNCHRONOUS_EARLY_WAKES = 16;
const ABORT_REASON = 'SERVICE_CREDIT_DURABLE_EXECUTION_OUTCOME_UNKNOWN';

const STORE_METHOD_NAMES = OBJECT_FREEZE([
  'getDurableExecutionSnapshot',
  'prepareDurableExecution',
  'persistDurableExecutionFence',
  'completeDurableExecution',
  'markDurableExecutionUnknown',
  'getRequest',
]);

class ServiceCreditDurableExecutionOwnerError extends Error {
  constructor(code) {
    super(code);
    OBJECT_DEFINE_PROPERTY(this, 'name', {
      value: 'ServiceCreditDurableExecutionOwnerError',
      enumerable: true,
      writable: false,
      configurable: false,
    });
    OBJECT_DEFINE_PROPERTY(this, 'code', {
      value: code,
      enumerable: true,
      writable: false,
      configurable: false,
    });
    OBJECT_DEFINE_PROPERTY(this, 'stack', {
      value: `ServiceCreditDurableExecutionOwnerError: ${code}`,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }
}

function ownerFailure(code) {
  return OBJECT_FREEZE(new ServiceCreditDurableExecutionOwnerError(code));
}

function failOwner(code) {
  throw ownerFailure(code);
}

function prototypeMethod(prototype, name) {
  const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(prototype, name);
  if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value') || typeof descriptor.value !== 'function') {
    failOwner(INVALID_CONFIGURATION);
  }
  return descriptor.value;
}

function prototypeGetter(prototype, name) {
  const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(prototype, name);
  if (!descriptor || typeof descriptor.get !== 'function') {
    failOwner(INVALID_CONFIGURATION);
  }
  return descriptor.get;
}

const storeMethods = OBJECT_CREATE(null);
for (let index = 0; index < STORE_METHOD_NAMES.length; index += 1) {
  const name = STORE_METHOD_NAMES[index];
  OBJECT_DEFINE_PROPERTY(storeMethods, name, {
    value: prototypeMethod(ServiceCreditSqliteStore.prototype, name),
    enumerable: true,
    writable: false,
    configurable: false,
  });
}
const STORE_METHODS = OBJECT_FREEZE(storeMethods);
const ASYNC_CONTEXT_RUN = prototypeMethod(AsyncLocalStorage.prototype, 'run');
const ASYNC_CONTEXT_GET_STORE = prototypeMethod(AsyncLocalStorage.prototype, 'getStore');
const ABORT_CONTROLLER_ABORT = prototypeMethod(NATIVE_ABORT_CONTROLLER.prototype, 'abort');
const ABORT_CONTROLLER_SIGNAL = prototypeGetter(NATIVE_ABORT_CONTROLLER.prototype, 'signal');
const CALLBACK_CONTEXT = new AsyncLocalStorage();
OBJECT_DEFINE_PROPERTY(CALLBACK_CONTEXT, 'getStore', {
  value: ASYNC_CONTEXT_GET_STORE,
  enumerable: false,
  writable: false,
  configurable: false,
});
const OWNED_STORES = new WeakSet();

function keyAllowed(key, expected) {
  if (typeof key !== 'string') return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (key === expected[index]) return true;
  }
  return false;
}

function exactDataObject(value, expected) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || ARRAY_IS_ARRAY(value)
      || IS_PROXY(value)
      || GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE
    ) {
      return null;
    }
    const keys = OWN_KEYS(value);
    if (keys.length !== expected.length) return null;
    for (let index = 0; index < keys.length; index += 1) {
      if (!keyAllowed(keys[index], expected)) return null;
    }
    const result = OBJECT_CREATE(null);
    for (let index = 0; index < expected.length; index += 1) {
      const key = expected[index];
      const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) return null;
      OBJECT_DEFINE_PROPERTY(result, key, {
        value: descriptor.value,
        enumerable: true,
        writable: false,
        configurable: false,
      });
    }
    return result;
  } catch {
    return null;
  }
}

function regexpMatches(expression, value) {
  return REFLECT_APPLY(REGEXP_EXEC, expression, [value]) !== null;
}

function validIdentifier(value) {
  return typeof value === 'string'
    && regexpMatches(IDENTIFIER, value)
    && !REFLECT_APPLY(STRING_INCLUDES, value, ['://']);
}

function exactUnadornedStore(value) {
  try {
    return value !== null
      && typeof value === 'object'
      && !IS_PROXY(value)
      && GET_PROTOTYPE_OF(value) === ServiceCreditSqliteStore.prototype
      && OWN_KEYS(value).length === 0;
  } catch {
    return false;
  }
}

function safeCallback(value) {
  try {
    if (typeof value !== 'function' || IS_PROXY(value)) return false;
    const keys = OWN_KEYS(value);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (!keyAllowed(key, CALLBACK_OWN_KEYS)) return false;
      const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value')) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function captureDeadlineRuntime(value) {
  const runtime = exactDataObject(value, DEADLINE_RUNTIME_KEYS);
  if (
    runtime === null
    || !safeCallback(runtime.monotonicNowNs)
    || !safeCallback(runtime.schedule)
    || !safeCallback(runtime.cancel)
  ) {
    return null;
  }
  return OBJECT_FREEZE({
    monotonicNowNs: runtime.monotonicNowNs,
    schedule: runtime.schedule,
    cancel: runtime.cancel,
  });
}

function reserveStore(store) {
  try {
    if (REFLECT_APPLY(WEAK_SET_HAS, OWNED_STORES, [store])) {
      failOwner(INVALID_CONFIGURATION);
    }
    REFLECT_APPLY(WEAK_SET_ADD, OWNED_STORES, [store]);
  } catch (error) {
    if (error instanceof ServiceCreditDurableExecutionOwnerError) throw error;
    failOwner(INVALID_CONFIGURATION);
  }
}

function captureRunInput(value) {
  const input = exactDataObject(value, RUN_KEYS);
  if (input === null) failOwner(INVALID_INPUT);
  const request = exactDataObject(input.request, REQUEST_KEYS);
  if (
    request === null
    || request.modelVersion !== SERVICE_CREDIT_MODEL_VERSION
    || !validIdentifier(request.grantId)
    || !validIdentifier(request.requestId)
    || typeof request.method !== 'string'
    || !regexpMatches(METHOD, request.method)
    || !validIdentifier(request.routeId)
    || typeof request.canonicalBodyDigest !== 'string'
    || !regexpMatches(CHECKSUM, request.canonicalBodyDigest)
    || typeof request.selectedContentType !== 'string'
    || !regexpMatches(CONTENT_TYPE, request.selectedContentType)
    || !NUMBER_IS_SAFE_INTEGER(request.maxCostUnits)
    || request.maxCostUnits < 1
    || !NUMBER_IS_SAFE_INTEGER(input.selectedDurationMs)
    || input.selectedDurationMs < 1
  ) {
    failOwner(INVALID_INPUT);
  }
  const detachedRequest = OBJECT_FREEZE({
    modelVersion: request.modelVersion,
    grantId: request.grantId,
    requestId: request.requestId,
    method: request.method,
    routeId: request.routeId,
    canonicalBodyDigest: request.canonicalBodyDigest,
    selectedContentType: request.selectedContentType,
    maxCostUnits: request.maxCostUnits,
  });
  return OBJECT_FREEZE({
    request: detachedRequest,
    selectedDurationMs: input.selectedDurationMs,
  });
}

function captureCallbackResult(value) {
  const input = exactDataObject(value, CALLBACK_RESULT_KEYS);
  if (input === null || !validIdentifier(input.resultCode)) failOwner(INVALID_INPUT);
  return input.resultCode;
}

function captureCachedResult(value) {
  const input = exactDataObject(value, CACHED_RESULT_KEYS);
  if (
    input === null
    || !NUMBER_IS_SAFE_INTEGER(input.statusCode)
    || input.statusCode < 100
    || input.statusCode > 599
    || typeof input.contentType !== 'string'
    || !regexpMatches(CONTENT_TYPE, input.contentType)
    || !validIdentifier(input.resultCode)
  ) {
    return null;
  }
  return OBJECT_FREEZE({
    statusCode: input.statusCode,
    contentType: input.contentType,
    resultCode: input.resultCode,
  });
}

function sameCanonicalCachedResult(first, second) {
  return first.statusCode === second.statusCode
    && first.contentType === second.contentType
    && first.resultCode === second.resultCode;
}

function captureTrustedObject(value, expected) {
  const captured = exactDataObject(value, expected);
  if (captured === null || !OBJECT_IS_FROZEN(value)) failOwner(QUARANTINED);
  return captured;
}

function captureExecution(value) {
  if (value === null) return null;
  const execution = captureTrustedObject(value, EXECUTION_KEYS);
  if (
    !validIdentifier(execution.executionId)
    || !validIdentifier(execution.generationId)
    || (execution.fencePhase !== 'PREPARED' && execution.fencePhase !== 'MAY_HAVE_STARTED')
    || !(
      execution.terminalClassification === 'NONE'
      || execution.terminalClassification === 'NOT_INVOKED'
      || execution.terminalClassification === 'SUCCEEDED'
      || execution.terminalClassification === 'OUTCOME_UNKNOWN'
    )
  ) {
    failOwner(QUARANTINED);
  }
  return execution;
}

function captureLedgerRequest(value) {
  if (value === null) return null;
  return captureTrustedObject(value, LEDGER_REQUEST_KEYS);
}

function result(status, cachedResult = null) {
  return OBJECT_FREEZE({ status, cachedResult });
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

function errorCode(error, prototype) {
  try {
    if (
      error === null
      || typeof error !== 'object'
      || IS_PROXY(error)
      || GET_PROTOTYPE_OF(error) !== prototype
    ) {
      return null;
    }
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(error, 'code');
    return descriptor && OBJECT_HAS_OWN(descriptor, 'value')
      && typeof descriptor.value === 'string'
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

function durableDisposition(value) {
  return value === 'APPLIED' || value === 'UNCHANGED' || value === 'STALE';
}

function requestReference(execution) {
  const request = exactDataObject(execution.request, [
    'modelVersion',
    'grantId',
    'requestId',
    'requestDigest',
    'method',
    'routeId',
    'canonicalBodyDigest',
    'selectedContentType',
    'maxCostUnits',
    'costUnits',
  ]);
  if (request === null || !validIdentifier(request.grantId) || !validIdentifier(request.requestId)) {
    failOwner(QUARANTINED);
  }
  return OBJECT_FREEZE({ grantId: request.grantId, requestId: request.requestId });
}

function executionFromSnapshot(executionState, executionId) {
  try {
    if (
      executionState === null
      || typeof executionState !== 'object'
      || IS_PROXY(executionState)
      || !OBJECT_IS_FROZEN(executionState)
      || GET_PROTOTYPE_OF(executionState) !== OBJECT_PROTOTYPE
    ) {
      return null;
    }
    const executionsDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(executionState, 'executions');
    const executions = executionsDescriptor?.enumerable === true
      && OBJECT_HAS_OWN(executionsDescriptor, 'value')
      ? executionsDescriptor.value
      : null;
    if (!ARRAY_IS_ARRAY(executions) || IS_PROXY(executions) || !OBJECT_IS_FROZEN(executions)) {
      return null;
    }
    const length = GET_OWN_PROPERTY_DESCRIPTOR(executions, 'length');
    if (!length || !NUMBER_IS_SAFE_INTEGER(length.value) || length.value < 0) return null;
    for (let index = 0; index < length.value; index += 1) {
      const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(executions, `${index}`);
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) return null;
      const execution = captureExecution(descriptor.value);
      if (execution.executionId === executionId) return descriptor.value;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Creates an inert owner for one already-initialized durable service-credit
 * store, one trusted application callback, and one trusted monotonic deadline
 * runtime. The owner neither initializes nor recovers durable state and exposes
 * no reusable invocation authority.
 */
export function createDurableServiceCreditExecutionOwner(options) {
  if (arguments.length !== 1) failOwner(INVALID_CONFIGURATION);
  const configuration = exactDataObject(options, OWNER_KEYS);
  const deadlineRuntime = configuration === null
    ? null
    : captureDeadlineRuntime(configuration.deadlineRuntime);
  if (
    configuration === null
    || !exactUnadornedStore(configuration.store)
    || !safeCallback(configuration.execute)
    || deadlineRuntime === null
  ) {
    failOwner(INVALID_CONFIGURATION);
  }

  const store = configuration.store;
  const execute = configuration.execute;
  reserveStore(store);

  let active = false;
  let closing = false;
  let latched = false;
  let closeCapability = null;

  function inCallbackContext() {
    try {
      return REFLECT_APPLY(ASYNC_CONTEXT_GET_STORE, CALLBACK_CONTEXT, []) !== undefined;
    } catch {
      latched = true;
      return true;
    }
  }

  function settleClose() {
    if (closing && !active && closeCapability !== null) closeCapability.resolve(undefined);
  }

  function releaseActive() {
    active = false;
    settleClose();
  }

  function latchAndThrow() {
    latched = true;
    throw ownerFailure(QUARANTINED);
  }

  function callStore(name, args) {
    return REFLECT_APPLY(STORE_METHODS[name], store, args);
  }

  function mapStoreFailure(error) {
    const storeCode = errorCode(error, ServiceCreditSqliteStoreError.prototype);
    const modelCode = errorCode(error, ServiceCreditModelError.prototype);
    if (
      modelCode === 'UNRESOLVED_EXECUTION'
      || storeCode === 'SERVICE_CREDIT_STORE_EXECUTION_GENERATION_SEALED'
      || storeCode === 'SERVICE_CREDIT_STORE_CAPACITY_EXCEEDED'
      || storeCode === 'SERVICE_CREDIT_STORE_DURABLE_EXECUTION_DISABLED'
      || storeCode === 'SERVICE_CREDIT_STORE_EXECUTION_INVALID_TRANSITION'
    ) {
      return 'RECOVERY_REQUIRED';
    }
    if (
      modelCode === 'REQUEST_ID_CONFLICT'
      || modelCode === 'RESULT_CONFLICT'
      || storeCode === 'SERVICE_CREDIT_STORE_EXECUTION_CONFLICT'
    ) {
      throw ownerFailure(CONFLICT);
    }
    if (storeCode === 'SERVICE_CREDIT_STORE_INVALID_EXECUTION_INPUT') {
      throw ownerFailure(INVALID_INPUT);
    }
    if (
      modelCode === 'COST_NOT_AUTHORIZED'
      || modelCode === 'GRANT_NOT_ACTIVE'
      || modelCode === 'GRANT_NOT_FOUND'
      || modelCode === 'INSUFFICIENT_UNITS'
      || modelCode === 'OFFER_NOT_FOUND'
      || modelCode === 'REQUEST_CAPACITY_EXCEEDED'
    ) {
      throw ownerFailure(OPERATION_FAILED);
    }
    latchAndThrow();
  }

  function invokeStore(name, args) {
    try {
      return callStore(name, args);
    } catch (error) {
      const classification = mapStoreFailure(error);
      if (classification !== undefined) return classification;
      throw ownerFailure(OPERATION_FAILED);
    }
  }

  function cachedResultForExecution(execution, suppliedRequest = null) {
    let request = suppliedRequest;
    if (request === null) {
      const reference = requestReference(execution);
      request = invokeStore('getRequest', [reference]);
      if (typeof request === 'string') latchAndThrow();
    }
    const captured = captureLedgerRequest(request);
    const cached = captured === null ? null : captureCachedResult(captured.cachedResult);
    if (captured === null || captured.state !== 'SUCCEEDED' || cached === null) latchAndThrow();
    return cached;
  }

  function classifyExecution(
    executionValue,
    requestValue = null,
    callbackStarted = false,
    localCachedResult = null,
  ) {
    const execution = captureExecution(executionValue);
    if (execution === null) return result('RECOVERY_REQUIRED');
    if (execution.terminalClassification === 'NOT_INVOKED') return result('NOT_INVOKED');
    if (execution.terminalClassification === 'OUTCOME_UNKNOWN') return result('OUTCOME_UNKNOWN');
    if (execution.terminalClassification === 'SUCCEEDED') {
      const cached = cachedResultForExecution(execution, requestValue);
      if (
        localCachedResult !== null
        && !sameCanonicalCachedResult(cached, localCachedResult)
      ) {
        latchAndThrow();
      }
      return result(callbackStarted ? 'SUCCEEDED' : 'CACHED_SUCCESS', cached);
    }
    if (
      execution.terminalClassification === 'NONE'
      && (execution.fencePhase === 'PREPARED' || execution.fencePhase === 'MAY_HAVE_STARTED')
    ) {
      return result('RECOVERY_REQUIRED');
    }
    latchAndThrow();
  }

  function classifyCurrent(executionId, callbackStarted, localCachedResult = null) {
    const snapshotValue = invokeStore('getDurableExecutionSnapshot', []);
    if (typeof snapshotValue === 'string') latchAndThrow();
    const snapshot = captureTrustedObject(snapshotValue, SNAPSHOT_RECEIPT_KEYS);
    const execution = executionFromSnapshot(snapshot.executionState, executionId);
    if (execution === null) latchAndThrow();
    if (callbackStarted && execution.terminalClassification === 'NONE') latchAndThrow();
    return classifyExecution(execution, null, callbackStarted, localCachedResult);
  }

  function invokeApplication(identity) {
    const outcome = nativePromiseCapability();
    let callbackPromise;
    try {
      callbackPromise = REFLECT_APPLY(ASYNC_CONTEXT_RUN, CALLBACK_CONTEXT, [
        identity,
        () => {
          const value = REFLECT_APPLY(execute, undefined, [identity]);
          return REFLECT_APPLY(PROMISE_RESOLVE, NATIVE_PROMISE, [value]);
        },
      ]);
      REFLECT_APPLY(PROMISE_THEN, callbackPromise, [
        callbackResult => {
          try {
            const resultCode = captureCallbackResult(callbackResult);
            outcome.resolve(OBJECT_FREEZE({
              ok: true,
              cachedResult: OBJECT_FREEZE({
                statusCode: 200,
                contentType: null,
                resultCode,
              }),
            }));
          } catch {
            outcome.resolve(OBJECT_FREEZE({ ok: false, cachedResult: null }));
          }
        },
        () => outcome.resolve(OBJECT_FREEZE({ ok: false, cachedResult: null })),
      ]);
    } catch {
      outcome.resolve(OBJECT_FREEZE({ ok: false, cachedResult: null }));
    }
    return outcome.promise;
  }

  function createDeadlineTimer(targetNs, readNow, onExpired, onFault) {
    let stopped = false;
    let current = null;
    let cleanupCertain = true;

    function cancelToken(token) {
      token.active = false;
      if (current === token) current = null;
      let cancelResult;
      try {
        cancelResult = REFLECT_APPLY(deadlineRuntime.cancel, undefined, [token.handle]);
      } catch {
        cleanupCertain = false;
        throw ownerFailure(QUARANTINED);
      }
      if (cancelResult !== undefined) {
        cleanupCertain = false;
        throw ownerFailure(QUARANTINED);
      }
    }

    function processWake(token) {
      if (stopped || current !== token || token.active !== true) return;
      try {
        cancelToken(token);
        const nowNs = readNow();
        if (nowNs >= targetNs) {
          stopped = true;
          onExpired();
          return;
        }
        arm();
      } catch {
        stopped = true;
        onFault(cleanupCertain);
      }
    }

    function arm() {
      let synchronousWakeCount = 0;
      while (!stopped) {
        const nowNs = readNow();
        if (nowNs >= targetNs) {
          stopped = true;
          onExpired();
          return 'EXPIRED';
        }
        const remainingNs = targetNs - nowNs;
        let delayMs = (remainingNs + TIMER_ROUNDING_NANOSECONDS)
          / NANOSECONDS_PER_MILLISECOND;
        const maximumDelay = BIGINT_FROM(MAX_TIMER_CHUNK_MS);
        if (delayMs > maximumDelay) delayMs = maximumDelay;
        const token = OBJECT_CREATE(null);
        token.active = true;
        token.handle = undefined;
        current = token;
        let returned = false;
        let synchronousWake = false;
        const wake = () => {
          if (stopped || current !== token || token.active !== true) return;
          if (!returned) {
            synchronousWake = true;
            return;
          }
          processWake(token);
        };
        let handle;
        try {
          handle = REFLECT_APPLY(deadlineRuntime.schedule, undefined, [
            wake,
            NUMBER_FROM(delayMs),
          ]);
        } catch {
          token.active = false;
          current = null;
          cleanupCertain = false;
          throw ownerFailure(QUARANTINED);
        }
        token.handle = handle;
        returned = true;
        if (!synchronousWake) return 'ARMED';
        cancelToken(token);
        synchronousWakeCount += 1;
        if (synchronousWakeCount > MAX_SYNCHRONOUS_EARLY_WAKES) {
          throw ownerFailure(QUARANTINED);
        }
      }
      return 'STOPPED';
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      if (current !== null) cancelToken(current);
    }

    return OBJECT_FREEZE({
      start: OBJECT_FREEZE(arm),
      stop: OBJECT_FREEZE(stop),
      cleanupCertain: OBJECT_FREEZE(() => cleanupCertain),
    });
  }

  function performDeadlineRun(input, fenced, execution, monotonicBeforeFenceNs) {
    const runCapability = nativePromiseCapability();
    let operationSettled = false;
    let callbackStarted = false;
    let callbackSettled = false;
    let callbackObserved = false;
    let localCachedResult = null;
    let terminalClaimed = false;
    let cleanupCertain = true;
    let lastMonotonicNs = monotonicBeforeFenceNs;
    let timer = null;
    let abortDispatched = false;
    let controller;
    let signal;
    let identity;

    const remainingWallMs = execution.wallClockDeadlineMs - fenced.fenceWallClockNowMs;
    if (
      !NUMBER_IS_SAFE_INTEGER(fenced.fenceWallClockNowMs)
      || fenced.fenceWallClockNowMs < execution.wallClockStartMs
      || remainingWallMs < 1
    ) {
      latchAndThrow();
    }
    const targetNs = monotonicBeforeFenceNs
      + BIGINT_FROM(remainingWallMs) * NANOSECONDS_PER_MILLISECOND;

    function releaseWhenSafe() {
      if (!cleanupCertain || (callbackStarted && (!callbackSettled || !callbackObserved))) return;
      releaseActive();
    }

    function resolveOnce(value) {
      if (operationSettled) return;
      operationSettled = true;
      runCapability.resolve(value);
    }

    function rejectOnce() {
      if (operationSettled) return;
      operationSettled = true;
      runCapability.reject(ownerFailure(QUARANTINED));
    }

    function quarantine() {
      latched = true;
      rejectOnce();
      releaseWhenSafe();
    }

    function readMonotonicNow() {
      let value;
      try {
        value = REFLECT_APPLY(deadlineRuntime.monotonicNowNs, undefined, []);
      } catch {
        throw ownerFailure(QUARANTINED);
      }
      if (typeof value !== 'bigint' || value < 0n || value < lastMonotonicNs) {
        throw ownerFailure(QUARANTINED);
      }
      lastMonotonicNs = value;
      return value;
    }

    function currentWinner(executionId) {
      const snapshotValue = invokeStore('getDurableExecutionSnapshot', []);
      if (typeof snapshotValue === 'string') return null;
      const snapshot = captureTrustedObject(snapshotValue, SNAPSHOT_RECEIPT_KEYS);
      const currentExecution = executionFromSnapshot(snapshot.executionState, executionId);
      if (currentExecution === null) return null;
      const captured = captureExecution(currentExecution);
      if (captured.terminalClassification === 'OUTCOME_UNKNOWN') {
        return OBJECT_FREEZE({
          winner: 'OUTCOME_UNKNOWN',
          execution: currentExecution,
          request: null,
        });
      }
      if (captured.terminalClassification === 'SUCCEEDED') {
        return OBJECT_FREEZE({
          winner: 'SUCCEEDED',
          execution: currentExecution,
          request: null,
        });
      }
      return null;
    }

    function winnerFromUnknownReceipt(value) {
      const unknown = captureTrustedObject(value, UNKNOWN_RECEIPT_KEYS);
      if (!durableDisposition(unknown.disposition)) return null;
      if (unknown.disposition === 'STALE') return currentWinner(execution.executionId);
      if (unknown.winner !== 'SUCCEEDED' && unknown.winner !== 'OUTCOME_UNKNOWN') return null;
      return OBJECT_FREEZE({
        winner: unknown.winner,
        execution: unknown.execution,
        request: unknown.request,
      });
    }

    function abortAfterUnknown() {
      if (!callbackStarted || abortDispatched) return;
      let abortResult;
      try {
        abortResult = REFLECT_APPLY(ASYNC_CONTEXT_RUN, CALLBACK_CONTEXT, [
          identity,
          () => REFLECT_APPLY(ABORT_CONTROLLER_ABORT, controller, [ABORT_REASON]),
        ]);
      } catch {
        throw ownerFailure(QUARANTINED);
      }
      if (abortResult !== undefined) throw ownerFailure(QUARANTINED);
      abortDispatched = true;
    }

    function settleWinner(winner, abortOnUnknown, failureAfterWinner) {
      if (winner === null) {
        quarantine();
        return;
      }
      let durableExecution;
      try {
        durableExecution = captureExecution(winner.execution);
      } catch {
        quarantine();
        return;
      }
      if (
        durableExecution === null
        || durableExecution.terminalClassification !== winner.winner
      ) {
        quarantine();
        return;
      }
      if (winner.winner === 'OUTCOME_UNKNOWN') {
        latched = true;
        if (abortOnUnknown) {
          try {
            abortAfterUnknown();
          } catch {
            quarantine();
            return;
          }
        }
        if (failureAfterWinner) rejectOnce();
        else resolveOnce(result('OUTCOME_UNKNOWN'));
        releaseWhenSafe();
        return;
      }
      if (!callbackSettled || localCachedResult === null) {
        quarantine();
        return;
      }
      try {
        const classified = classifyExecution(
          winner.execution,
          winner.request,
          true,
          localCachedResult,
        );
        if (classified.status !== 'SUCCEEDED') {
          quarantine();
          return;
        }
        resolveOnce(classified);
      } catch {
        quarantine();
        return;
      }
      releaseWhenSafe();
    }

    function attemptUnknown(reason, abortOnUnknown, failureAfterWinner = false) {
      let unknownValue;
      try {
        unknownValue = invokeStore('markDurableExecutionUnknown', [{
          expectedRevision: fenced.revision,
          executionId: execution.executionId,
          reason,
        }]);
        if (typeof unknownValue === 'string') {
          quarantine();
          return;
        }
        settleWinner(
          winnerFromUnknownReceipt(unknownValue),
          abortOnUnknown,
          failureAfterWinner,
        );
      } catch {
        quarantine();
      }
    }

    function stopTimer() {
      if (timer === null) return true;
      try {
        timer.stop();
      } catch {
        cleanupCertain = timer.cleanupCertain();
        return false;
      }
      cleanupCertain = timer.cleanupCertain();
      return cleanupCertain;
    }

    function deadlineExpired() {
      if (terminalClaimed) return;
      terminalClaimed = true;
      attemptUnknown('DEADLINE_EXPIRED', true);
    }

    function timerFault(timerCleanupCertain) {
      if (terminalClaimed) return;
      cleanupCertain = timerCleanupCertain;
      terminalClaimed = true;
      attemptUnknown('LOST_CONTROL', true, true);
    }

    function completeCallback(cachedResult) {
      let completedValue;
      try {
        completedValue = invokeStore('completeDurableExecution', [{
          expectedRevision: fenced.revision,
          executionId: execution.executionId,
          cachedResult,
        }]);
        if (typeof completedValue === 'string') {
          quarantine();
          return;
        }
        const completed = captureTrustedObject(completedValue, COMPLETION_RECEIPT_KEYS);
        if (!durableDisposition(completed.disposition)) {
          quarantine();
          return;
        }
        if (
          (completed.disposition === 'APPLIED'
            && (
              !NUMBER_IS_SAFE_INTEGER(completed.completionWallClockNowMs)
              || completed.completionWallClockNowMs < 0
            ))
          || (completed.disposition !== 'APPLIED'
            && completed.completionWallClockNowMs !== null)
        ) {
          quarantine();
          return;
        }
        if (completed.disposition === 'STALE') {
          const current = currentWinner(execution.executionId);
          settleWinner(current, current?.winner === 'OUTCOME_UNKNOWN', false);
          return;
        }
        if (
          completed.winner !== 'SUCCEEDED'
          && completed.winner !== 'OUTCOME_UNKNOWN'
        ) {
          quarantine();
          return;
        }
        settleWinner(OBJECT_FREEZE({
          winner: completed.winner,
          execution: completed.execution,
          request: completed.request,
        }), completed.winner === 'OUTCOME_UNKNOWN', false);
      } catch {
        quarantine();
      }
    }

    function callbackFinished(callback) {
      callbackSettled = true;
      if (terminalClaimed) {
        releaseWhenSafe();
        return;
      }
      terminalClaimed = true;
      if (!stopTimer()) {
        attemptUnknown('LOST_CONTROL', false, true);
        return;
      }
      let monotonicNowNs;
      try {
        monotonicNowNs = readMonotonicNow();
      } catch {
        attemptUnknown('LOST_CONTROL', true, true);
        return;
      }
      if (!callback.ok) {
        attemptUnknown('LOST_CONTROL', false);
        return;
      }
      localCachedResult = OBJECT_FREEZE({
        statusCode: callback.cachedResult.statusCode,
        contentType: input.request.selectedContentType,
        resultCode: callback.cachedResult.resultCode,
      });
      if (monotonicNowNs >= targetNs) {
        attemptUnknown('DEADLINE_EXPIRED', true);
        return;
      }
      completeCallback(localCachedResult);
    }

    try {
      controller = new NATIVE_ABORT_CONTROLLER();
      signal = REFLECT_APPLY(ABORT_CONTROLLER_SIGNAL, controller, []);
      if (signal === null || typeof signal !== 'object' || IS_PROXY(signal)) latchAndThrow();
      identity = OBJECT_FREEZE({ executionId: execution.executionId, signal });
      timer = createDeadlineTimer(
        targetNs,
        readMonotonicNow,
        deadlineExpired,
        timerFault,
      );
      timer.start();
    } catch {
      cleanupCertain = timer === null ? true : timer.cleanupCertain();
      terminalClaimed = true;
      attemptUnknown('LOST_CONTROL', false, true);
      return runCapability.promise;
    }
    if (terminalClaimed) return runCapability.promise;

    callbackStarted = true;
    const callbackPromise = invokeApplication(identity);
    try {
      REFLECT_APPLY(PROMISE_THEN, callbackPromise, [
        callback => {
          callbackObserved = true;
          try {
            callbackFinished(callback);
          } catch {
            quarantine();
          }
        },
        () => {
          callbackObserved = false;
          quarantine();
        },
      ]);
      callbackObserved = true;
    } catch {
      callbackObserved = false;
      terminalClaimed = true;
      attemptUnknown('LOST_CONTROL', true, true);
    }
    return runCapability.promise;
  }

  function performRun(input) {
    try {
      const snapshotValue = invokeStore('getDurableExecutionSnapshot', []);
      if (typeof snapshotValue === 'string') {
        releaseActive();
        return REFLECT_APPLY(PROMISE_RESOLVE, NATIVE_PROMISE, [result(snapshotValue)]);
      }
      const snapshot = captureTrustedObject(snapshotValue, SNAPSHOT_RECEIPT_KEYS);
      if (!NUMBER_IS_SAFE_INTEGER(snapshot.revision) || snapshot.revision < 0) latchAndThrow();
      if (snapshot.executionState === null) {
        releaseActive();
        return REFLECT_APPLY(PROMISE_RESOLVE, NATIVE_PROMISE, [
          result('RECOVERY_REQUIRED'),
        ]);
      }

      const preparedValue = invokeStore('prepareDurableExecution', [{
        expectedRevision: snapshot.revision,
        request: input.request,
        selectedDurationMs: input.selectedDurationMs,
      }]);
      if (typeof preparedValue === 'string') {
        releaseActive();
        return REFLECT_APPLY(PROMISE_RESOLVE, NATIVE_PROMISE, [result(preparedValue)]);
      }
      const prepared = captureTrustedObject(preparedValue, PREPARE_RECEIPT_KEYS);
      if (!durableDisposition(prepared.disposition)) latchAndThrow();
      if (prepared.disposition === 'STALE') {
        releaseActive();
        return REFLECT_APPLY(PROMISE_RESOLVE, NATIVE_PROMISE, [result('STALE')]);
      }
      if (prepared.disposition === 'UNCHANGED') {
        const classification = classifyExecution(prepared.execution, prepared.request);
        releaseActive();
        return REFLECT_APPLY(PROMISE_RESOLVE, NATIVE_PROMISE, [classification]);
      }
      const preparedExecution = captureExecution(prepared.execution);
      if (
        preparedExecution === null
        || preparedExecution.fencePhase !== 'PREPARED'
        || preparedExecution.terminalClassification !== 'NONE'
      ) {
        latchAndThrow();
      }

      let monotonicBeforeFenceNs;
      try {
        monotonicBeforeFenceNs = REFLECT_APPLY(
          deadlineRuntime.monotonicNowNs,
          undefined,
          [],
        );
      } catch {
        latchAndThrow();
      }
      if (typeof monotonicBeforeFenceNs !== 'bigint' || monotonicBeforeFenceNs < 0n) {
        latchAndThrow();
      }

      const fencedValue = invokeStore('persistDurableExecutionFence', [{
        expectedRevision: prepared.revision,
        executionId: preparedExecution.executionId,
      }]);
      if (typeof fencedValue === 'string') {
        releaseActive();
        return REFLECT_APPLY(PROMISE_RESOLVE, NATIVE_PROMISE, [result(fencedValue)]);
      }
      const fenced = captureTrustedObject(fencedValue, FENCE_RECEIPT_KEYS);
      if (!durableDisposition(fenced.disposition)) latchAndThrow();
      if (
        (fenced.disposition === 'APPLIED'
          && (
            !NUMBER_IS_SAFE_INTEGER(fenced.fenceWallClockNowMs)
            || fenced.fenceWallClockNowMs < 0
          ))
        || (fenced.disposition !== 'APPLIED' && fenced.fenceWallClockNowMs !== null)
      ) {
        latchAndThrow();
      }
      if (fenced.disposition === 'STALE') {
        releaseActive();
        return REFLECT_APPLY(PROMISE_RESOLVE, NATIVE_PROMISE, [result('STALE')]);
      }
      if (fenced.disposition === 'UNCHANGED') {
        const classification = classifyExecution(fenced.execution);
        releaseActive();
        return REFLECT_APPLY(PROMISE_RESOLVE, NATIVE_PROMISE, [classification]);
      }
      const execution = captureExecution(fenced.execution);
      if (execution === null) latchAndThrow();
      if (execution.terminalClassification === 'NOT_INVOKED') {
        releaseActive();
        return REFLECT_APPLY(PROMISE_RESOLVE, NATIVE_PROMISE, [result('NOT_INVOKED')]);
      }
      if (
        execution.terminalClassification !== 'NONE'
        || execution.fencePhase !== 'MAY_HAVE_STARTED'
      ) {
        latchAndThrow();
      }
      return performDeadlineRun(input, fenced, execution, monotonicBeforeFenceNs);
    } catch (error) {
      releaseActive();
      return nativeRejected(error);
    }
  }

  const run = OBJECT_FREEZE((input, ...extra) => {
    if (inCallbackContext()) return nativeRejected(ownerFailure(CALLBACK_CONTEXT_ERROR));
    if (extra.length !== 0) return nativeRejected(ownerFailure(INVALID_INPUT));
    let captured;
    try {
      captured = captureRunInput(input);
    } catch (error) {
      return nativeRejected(error);
    }
    if (latched) return nativeRejected(ownerFailure(QUARANTINED));
    if (closing) return nativeRejected(ownerFailure(CLOSED));
    if (active) return nativeRejected(ownerFailure(BUSY));
    active = true;
    return performRun(captured);
  });

  const close = OBJECT_FREEZE((...args) => {
    if (inCallbackContext()) return nativeRejected(ownerFailure(CALLBACK_CONTEXT_ERROR));
    if (args.length !== 0) return nativeRejected(ownerFailure(INVALID_INPUT));
    if (closeCapability !== null) return closeCapability.promise;
    closeCapability = nativePromiseCapability();
    closing = true;
    settleClose();
    return closeCapability.promise;
  });

  return OBJECT_FREEZE({ run, close });
}
