import { AsyncLocalStorage } from 'node:async_hooks';
import { types as utilTypes } from 'node:util';

import {
  MockServiceCreditActivation,
  ServiceCreditActivationError,
  createMockServiceCreditActivation,
} from './service-credit-activation.js';
import { createServiceCreditHttpHandler } from './service-credit-http.js';
import { ServiceCreditSqliteStore } from './service-credit-sqlite-store.js';

const REFLECT_APPLY = Reflect.apply;
const GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Reflect.getPrototypeOf;
const OWN_KEYS = Reflect.ownKeys;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_CREATE = Object.create;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_IS_FROZEN = Object.isFrozen;
const OBJECT_PROTOTYPE = Object.prototype;
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_PROTOTYPE = Array.prototype;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const SET_HAS = Set.prototype.has;
const NATIVE_PROMISE = Promise;
const WEAK_SET_HAS = WeakSet.prototype.has;
const WEAK_SET_ADD = WeakSet.prototype.add;
const ACTIVATION_ERROR_PROTOTYPE = ServiceCreditActivationError.prototype;
const CREATE_MOCK_ACTIVATION = createMockServiceCreditActivation;
const CREATE_HTTP_HANDLER = createServiceCreditHttpHandler;

const INVALID_CONFIGURATION = 'SERVICE_CREDIT_COMPOSITION_INVALID_CONFIGURATION';
const DEPENDENCY_OWNED = 'SERVICE_CREDIT_COMPOSITION_DEPENDENCY_OWNED';
const OPERATION_FAILED = 'SERVICE_CREDIT_COMPOSITION_OPERATION_FAILED';
const OUTCOME_UNKNOWN = 'SERVICE_CREDIT_ACTIVATION_OUTCOME_UNKNOWN';
const ACTIVATED_UNAVAILABLE = 'SERVICE_CREDIT_COMPOSITION_ACTIVATED_UNAVAILABLE';
const REENTRANT_ACTIVATION = 'SERVICE_CREDIT_COMPOSITION_REENTRANT_ACTIVATION';
const UNAVAILABLE_BODY = '{"error":"service_unavailable"}';
const UNAVAILABLE_BODY_BYTES = Buffer.byteLength(UNAVAILABLE_BODY, 'utf8');
const PRIVATE_HEADERS = OBJECT_FREEZE({
  'Cache-Control': 'private, no-store, max-age=0',
  'Content-Type': 'application/json',
  Vary: 'Authorization',
  'X-Content-Type-Options': 'nosniff',
});
const OWNER_OPTION_KEYS = OBJECT_FREEZE(['store', 'activationOptions', 'execute']);
const ACTIVATION_OPTION_KEYS = OBJECT_FREEZE([
  'verifySettlement',
  'authorityProfile',
  'now',
]);
const STORE_METHOD_NAMES = OBJECT_FREEZE([
  'load',
  'reserveRequest',
  'beginExecution',
  'completeExecution',
  'markOutcomeUnknown',
]);
const CALLBACK_OWN_KEYS = OBJECT_FREEZE([
  'length',
  'name',
  'arguments',
  'caller',
  'prototype',
]);
const ACTIVATION_ERROR_KEYS = OBJECT_FREEZE(['stack', 'message', 'name', 'code']);
const ACTIVATION_CODES = OBJECT_FREEZE(new Set([
  'SERVICE_CREDIT_ACTIVATION_INVALID_CONFIGURATION',
  'SERVICE_CREDIT_ACTIVATION_INVALID_INPUT',
  'SERVICE_CREDIT_ACTIVATION_REJECTED',
  'SERVICE_CREDIT_ACTIVATION_CLOCK_FAILED',
  'SERVICE_CREDIT_ACTIVATION_SETTLED_NOT_GRANTED',
  'SERVICE_CREDIT_ACTIVATION_OUTCOME_UNKNOWN',
  'SERVICE_CREDIT_ACTIVATION_CONFLICT',
]));
const RESULT_KEYS = OBJECT_FREEZE(['activation', 'grant']);
const GRANT_RESULT_KEYS = OBJECT_FREEZE([
  'grantId',
  'modelVersion',
  'activationId',
  'activation',
  'sourceSettlementId',
  'transactionId',
  'providerId',
  'serviceId',
  'resourceId',
  'offerId',
  'offerVersion',
  'holderId',
  'capabilityCommitment',
  'totalUnits',
  'expiresAt',
  'paymentIntent',
  'lifecycle',
  'availableUnits',
  'heldUnits',
  'consumedUnits',
  'exhausted',
]);
const IMMUTABLE_GRANT_KEYS = OBJECT_FREEZE([
  'grantId',
  'modelVersion',
  'activationId',
  'sourceSettlementId',
  'transactionId',
  'providerId',
  'serviceId',
  'resourceId',
  'offerId',
  'offerVersion',
  'holderId',
  'capabilityCommitment',
  'totalUnits',
  'expiresAt',
  'paymentIntent',
]);
const GRANT_LIFECYCLES = OBJECT_FREEZE(new Set(['ACTIVE', 'EXPIRED', 'REVOKED']));
const MAX_JSON_DEPTH = 32;
const MAX_SAFE_QUEUE_INDEX = Number.MAX_SAFE_INTEGER;

class ServiceCreditCompositionError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ServiceCreditCompositionError';
    this.code = code;
    this.stack = `ServiceCreditCompositionError: ${code}`;
  }
}

function compositionFailure(code) {
  return new ServiceCreditCompositionError(code);
}

function failConfiguration() {
  throw compositionFailure(INVALID_CONFIGURATION);
}

function keyIsAllowed(key, allowed) {
  if (typeof key !== 'string') return false;
  for (let index = 0; index < allowed.length; index += 1) {
    if (key === allowed[index]) return true;
  }
  return false;
}

function prototypeMethod(prototype, name) {
  const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(prototype, name);
  if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value') || typeof descriptor.value !== 'function') {
    failConfiguration();
  }
  return descriptor.value;
}

const storeMethods = OBJECT_CREATE(null);
for (let index = 0; index < STORE_METHOD_NAMES.length; index += 1) {
  const name = STORE_METHOD_NAMES[index];
  storeMethods[name] = prototypeMethod(ServiceCreditSqliteStore.prototype, name);
}
const STORE_METHODS = OBJECT_FREEZE(storeMethods);
const CREATE_FUNDING_RESOURCE = prototypeMethod(
  MockServiceCreditActivation.prototype,
  'createFundingResource',
);
const ACTIVATE_FUNDING = prototypeMethod(MockServiceCreditActivation.prototype, 'activate');
const ASYNC_CONTEXT_ENTER_WITH = prototypeMethod(AsyncLocalStorage.prototype, 'enterWith');
const ASYNC_CONTEXT_GET_STORE = prototypeMethod(AsyncLocalStorage.prototype, 'getStore');
const ACTIVATION_CONTEXT = new AsyncLocalStorage();
const OWNED_STORES = new WeakSet();

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
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function captureExactDataObject(value, expectedKeys) {
  if (!isPlainDataObject(value)) return null;
  try {
    const observed = OWN_KEYS(value);
    if (observed.length !== expectedKeys.length) return null;
    for (let index = 0; index < observed.length; index += 1) {
      if (!keyIsAllowed(observed[index], expectedKeys)) return null;
    }
    const captured = OBJECT_CREATE(null);
    for (let index = 0; index < expectedKeys.length; index += 1) {
      const key = expectedKeys[index];
      const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) return null;
      captured[key] = descriptor.value;
    }
    return captured;
  } catch {
    return null;
  }
}

function captureOptions(options) {
  const captured = captureExactDataObject(options, OWNER_OPTION_KEYS);
  if (captured === null) failConfiguration();
  return captured;
}

function captureActivationOptions(options) {
  const captured = captureExactDataObject(options, ACTIVATION_OPTION_KEYS);
  if (captured === null) failConfiguration();
  return captured;
}

function exactUnadornedInstance(value, prototype) {
  try {
    return value !== null
      && typeof value === 'object'
      && !IS_PROXY(value)
      && GET_PROTOTYPE_OF(value) === prototype
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
      if (!keyIsAllowed(key, CALLBACK_OWN_KEYS)) return false;
      const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value')) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function reserveStore(store) {
  let owned;
  try {
    owned = REFLECT_APPLY(WEAK_SET_HAS, OWNED_STORES, [store]);
  } catch {
    failConfiguration();
  }
  if (owned) throw compositionFailure(DEPENDENCY_OWNED);
  try {
    REFLECT_APPLY(WEAK_SET_ADD, OWNED_STORES, [store]);
  } catch {
    failConfiguration();
  }
}

function ownDataDescriptor(value, key) {
  try {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    return descriptor && OBJECT_HAS_OWN(descriptor, 'value') ? descriptor : null;
  } catch {
    return null;
  }
}

function activationErrorCode(error) {
  try {
    if (
      error === null
      || typeof error !== 'object'
      || IS_PROXY(error)
      || GET_PROTOTYPE_OF(error) !== ACTIVATION_ERROR_PROTOTYPE
    ) {
      return null;
    }
    const keys = OWN_KEYS(error);
    if (keys.length !== ACTIVATION_ERROR_KEYS.length) return null;
    for (let index = 0; index < keys.length; index += 1) {
      if (!keyIsAllowed(keys[index], ACTIVATION_ERROR_KEYS)) return null;
    }
    const stack = GET_OWN_PROPERTY_DESCRIPTOR(error, 'stack');
    const message = ownDataDescriptor(error, 'message');
    const name = ownDataDescriptor(error, 'name');
    const code = ownDataDescriptor(error, 'code');
    if (
      !stack
      || stack.enumerable
      || !message
      || message.enumerable
      || !name
      || !name.enumerable
      || name.value !== 'ServiceCreditActivationError'
      || !code
      || !code.enumerable
      || typeof code.value !== 'string'
      || message.value !== code.value
      || !REFLECT_APPLY(SET_HAS, ACTIVATION_CODES, [code.value])
    ) {
      return null;
    }
    return code.value;
  } catch {
    return null;
  }
}

function safeDataValue(value, key) {
  const descriptor = ownDataDescriptor(value, key);
  return descriptor?.enumerable === true ? descriptor.value : undefined;
}

function exactDataKeys(value, expectedKeys) {
  if (!isPlainDataObject(value)) return false;
  try {
    const observed = OWN_KEYS(value);
    if (observed.length !== expectedKeys.length) return false;
    for (let index = 0; index < observed.length; index += 1) {
      if (!keyIsAllowed(observed[index], expectedKeys)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function denseArrayLength(value) {
  try {
    if (
      !ARRAY_IS_ARRAY(value)
      || IS_PROXY(value)
      || GET_PROTOTYPE_OF(value) !== ARRAY_PROTOTYPE
    ) {
      return -1;
    }
    const length = ownDataDescriptor(value, 'length');
    if (
      !length
      || length.enumerable
      || !NUMBER_IS_SAFE_INTEGER(length.value)
      || length.value < 0
    ) {
      return -1;
    }
    const keys = OWN_KEYS(value);
    if (keys.length !== length.value + 1) return -1;
    for (let index = 0; index < length.value; index += 1) {
      const descriptor = ownDataDescriptor(value, String(index));
      if (!descriptor?.enumerable) return -1;
    }
    return length.value;
  } catch {
    return -1;
  }
}

function sameJsonData(left, right, depth = 0) {
  if (depth > MAX_JSON_DEPTH) return false;
  if (left === null || right === null) return left === right;
  const leftType = typeof left;
  const rightType = typeof right;
  if (leftType !== rightType) return false;
  if (leftType !== 'object') {
    return (leftType === 'string' || leftType === 'boolean' || leftType === 'number')
      && left === right;
  }
  try {
    if (IS_PROXY(left) || IS_PROXY(right)) return false;
    const leftIsArray = ARRAY_IS_ARRAY(left);
    if (leftIsArray !== ARRAY_IS_ARRAY(right)) return false;
    if (leftIsArray) {
      const leftLength = denseArrayLength(left);
      const rightLength = denseArrayLength(right);
      if (leftLength < 0 || leftLength !== rightLength) return false;
      for (let index = 0; index < leftLength; index += 1) {
        const leftDescriptor = ownDataDescriptor(left, String(index));
        const rightDescriptor = ownDataDescriptor(right, String(index));
        if (
          !leftDescriptor?.enumerable
          || !rightDescriptor?.enumerable
          || !sameJsonData(leftDescriptor.value, rightDescriptor.value, depth + 1)
        ) {
          return false;
        }
      }
      return true;
    }
    if (!isPlainDataObject(left) || !isPlainDataObject(right)) return false;
    const leftKeys = OWN_KEYS(left);
    const rightKeys = OWN_KEYS(right);
    if (leftKeys.length !== rightKeys.length) return false;
    for (let index = 0; index < leftKeys.length; index += 1) {
      const key = leftKeys[index];
      if (typeof key !== 'string') return false;
      const leftDescriptor = ownDataDescriptor(left, key);
      const rightDescriptor = ownDataDescriptor(right, key);
      if (
        !leftDescriptor?.enumerable
        || !rightDescriptor?.enumerable
        || !sameJsonData(leftDescriptor.value, rightDescriptor.value, depth + 1)
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function sameImmutableGrantBinding(left, right) {
  for (let index = 0; index < IMMUTABLE_GRANT_KEYS.length; index += 1) {
    const key = IMMUTABLE_GRANT_KEYS[index];
    const leftDescriptor = ownDataDescriptor(left, key);
    const rightDescriptor = ownDataDescriptor(right, key);
    if (
      !leftDescriptor?.enumerable
      || !rightDescriptor?.enumerable
      || !sameJsonData(leftDescriptor.value, rightDescriptor.value)
    ) {
      return false;
    }
  }
  return true;
}

function confirmedActivation(result, snapshot) {
  try {
    if (!exactDataKeys(result, RESULT_KEYS) || !OBJECT_IS_FROZEN(result)) return false;
    const activation = safeDataValue(result, 'activation');
    const grant = safeDataValue(result, 'grant');
    if (
      !isPlainDataObject(activation)
      || !isPlainDataObject(grant)
      || !OBJECT_IS_FROZEN(activation)
      || !OBJECT_IS_FROZEN(grant)
      || !exactDataKeys(grant, GRANT_RESULT_KEYS)
    ) {
      return false;
    }

    const activationId = safeDataValue(activation, 'activationId');
    const grantId = safeDataValue(grant, 'grantId');
    const lifecycle = safeDataValue(grant, 'lifecycle');
    const totalUnits = safeDataValue(grant, 'totalUnits');
    const availableUnits = safeDataValue(grant, 'availableUnits');
    const heldUnits = safeDataValue(grant, 'heldUnits');
    const consumedUnits = safeDataValue(grant, 'consumedUnits');
    if (
      typeof activationId !== 'string'
      || !/^activation_[0-9a-f]{64}$/.test(activationId)
      || typeof grantId !== 'string'
      || !/^grant_[0-9a-f]{64}$/.test(grantId)
      || safeDataValue(grant, 'activationId') !== activationId
      || !REFLECT_APPLY(SET_HAS, GRANT_LIFECYCLES, [lifecycle])
      || !NUMBER_IS_SAFE_INTEGER(totalUnits)
      || totalUnits < 0
      || !NUMBER_IS_SAFE_INTEGER(availableUnits)
      || availableUnits < 0
      || !NUMBER_IS_SAFE_INTEGER(heldUnits)
      || heldUnits < 0
      || !NUMBER_IS_SAFE_INTEGER(consumedUnits)
      || consumedUnits < 0
      || totalUnits !== availableUnits + heldUnits + consumedUnits
      || safeDataValue(grant, 'exhausted') !== (availableUnits === 0)
    ) {
      return false;
    }

    const state = safeDataValue(snapshot, 'state');
    const grants = safeDataValue(state, 'grants');
    const grantCount = denseArrayLength(grants);
    if (grantCount < 0) return false;
    let persisted;
    for (let index = 0; index < grantCount; index += 1) {
      const descriptor = ownDataDescriptor(grants, String(index));
      const candidate = descriptor?.enumerable === true ? descriptor.value : undefined;
      if (safeDataValue(candidate, 'grantId') === grantId) {
        persisted = candidate;
        break;
      }
    }
    if (persisted === undefined || !isPlainDataObject(persisted)) return false;
    const persistedActivation = safeDataValue(persisted, 'activation');
    return safeDataValue(persisted, 'activationId') === activationId
      && sameJsonData(activation, persistedActivation)
      && sameJsonData(safeDataValue(grant, 'activation'), persistedActivation)
      && sameImmutableGrantBinding(grant, persisted);
  } catch {
    return false;
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

function runInActivationContext(context, operation) {
  const prior = REFLECT_APPLY(ASYNC_CONTEXT_GET_STORE, ACTIVATION_CONTEXT, []);
  if (prior === context) return operation();
  REFLECT_APPLY(ASYNC_CONTEXT_ENTER_WITH, ACTIVATION_CONTEXT, [context]);
  try {
    return operation();
  } finally {
    REFLECT_APPLY(ASYNC_CONTEXT_ENTER_WITH, ACTIVATION_CONTEXT, [prior]);
  }
}

function sendUnavailable(response) {
  try {
    if (response.destroyed || response.writableEnded) return;
    response.statusCode = 503;
    response.setHeader('Cache-Control', PRIVATE_HEADERS['Cache-Control']);
    response.setHeader('Content-Type', PRIVATE_HEADERS['Content-Type']);
    response.setHeader('Vary', PRIVATE_HEADERS.Vary);
    response.setHeader('X-Content-Type-Options', PRIVATE_HEADERS['X-Content-Type-Options']);
    response.setHeader('Content-Length', UNAVAILABLE_BODY_BYTES);
    response.end(Buffer.from(UNAVAILABLE_BODY, 'utf8'));
  } catch {
    try {
      response.destroy();
    } catch {
      // The peer may already have disconnected.
    }
  }
}

/**
 * Owns the inactive, single-process composition of one trusted SQLite store,
 * one internally constructed mock-only activation adapter, and one application
 * callback. The returned surface contains no raw authority or recovery operation.
 */
export function createServiceCreditCompositionOwner(options) {
  const configuration = captureOptions(options);
  const activationConfiguration = captureActivationOptions(configuration.activationOptions);
  if (
    !exactUnadornedInstance(configuration.store, ServiceCreditSqliteStore.prototype)
    || !safeCallback(activationConfiguration.verifySettlement)
    || !safeCallback(activationConfiguration.now)
    || !safeCallback(configuration.execute)
  ) {
    failConfiguration();
  }

  const store = configuration.store;
  const execute = configuration.execute;
  reserveStore(store);

  let activation;
  try {
    const internalActivationOptions = OBJECT_FREEZE({
      store,
      verifySettlement: activationConfiguration.verifySettlement,
      authorityProfile: activationConfiguration.authorityProfile,
      now: activationConfiguration.now,
    });
    activation = REFLECT_APPLY(CREATE_MOCK_ACTIVATION, undefined, [internalActivationOptions]);
    if (!exactUnadornedInstance(activation, MockServiceCreditActivation.prototype)) {
      failConfiguration();
    }
  } catch {
    failConfiguration();
  }

  let latchedCode = null;
  let currentHandler;

  const guardedExecute = OBJECT_FREEZE(function guardedServiceCreditExecute(identity) {
    if (latchedCode !== null) throw compositionFailure(latchedCode);
    return REFLECT_APPLY(execute, undefined, [identity]);
  });

  function buildHandler() {
    let startupSnapshot;
    const load = OBJECT_FREEZE(() => {
      const snapshot = REFLECT_APPLY(STORE_METHODS.load, store, []);
      startupSnapshot = snapshot;
      return snapshot;
    });
    const reserveRequest = OBJECT_FREEZE(input => REFLECT_APPLY(
      STORE_METHODS.reserveRequest,
      store,
      [input],
    ));
    const beginExecution = OBJECT_FREEZE(input => REFLECT_APPLY(
      STORE_METHODS.beginExecution,
      store,
      [input],
    ));
    const completeExecution = OBJECT_FREEZE(input => REFLECT_APPLY(
      STORE_METHODS.completeExecution,
      store,
      [input],
    ));
    const markOutcomeUnknown = OBJECT_FREEZE(input => REFLECT_APPLY(
      STORE_METHODS.markOutcomeUnknown,
      store,
      [input],
    ));
    const facade = OBJECT_FREEZE({
      load,
      reserveRequest,
      beginExecution,
      completeExecution,
      markOutcomeUnknown,
    });
    const handler = REFLECT_APPLY(CREATE_HTTP_HANDLER, undefined, [{
      store: facade,
      execute: guardedExecute,
    }]);
    if (typeof handler !== 'function' || IS_PROXY(handler) || startupSnapshot === undefined) {
      throw compositionFailure(OPERATION_FAILED);
    }
    return OBJECT_FREEZE({ handler: OBJECT_FREEZE(handler), startupSnapshot });
  }

  try {
    currentHandler = buildHandler().handler;
  } catch {
    failConfiguration();
  }

  function assertAvailable() {
    if (latchedCode !== null) throw compositionFailure(latchedCode);
  }

  const createFundingResource = OBJECT_FREEZE((input) => {
    assertAvailable();
    try {
      return REFLECT_APPLY(CREATE_FUNDING_RESOURCE, activation, [input]);
    } catch (error) {
      if (activationErrorCode(error) !== null) throw error;
      throw compositionFailure(OPERATION_FAILED);
    }
  });

  async function runActivation(input) {
    assertAvailable();
    let result;
    const context = OBJECT_FREEZE(OBJECT_CREATE(null));
    try {
      result = await runInActivationContext(
        context,
        () => REFLECT_APPLY(ACTIVATE_FUNDING, activation, [input]),
      );
    } catch (error) {
      const code = activationErrorCode(error);
      if (code === OUTCOME_UNKNOWN) {
        latchedCode = OUTCOME_UNKNOWN;
        throw compositionFailure(OUTCOME_UNKNOWN);
      }
      if (code !== null) throw error;
      throw compositionFailure(OPERATION_FAILED);
    }

    let replacement;
    try {
      replacement = buildHandler();
      if (!confirmedActivation(result, replacement.startupSnapshot)) {
        throw compositionFailure(ACTIVATED_UNAVAILABLE);
      }
    } catch {
      latchedCode = ACTIVATED_UNAVAILABLE;
      throw compositionFailure(ACTIVATED_UNAVAILABLE);
    }
    currentHandler = replacement.handler;
    return result;
  }

  const activationQueue = OBJECT_CREATE(null);
  let queueHead = 0;
  let queueTail = 0;
  let draining = false;

  async function drainActivationQueue() {
    while (queueHead < queueTail) {
      const index = queueHead;
      queueHead += 1;
      const job = activationQueue[index];
      delete activationQueue[index];
      try {
        const result = await runActivation(job.input);
        job.resolve(result);
      } catch (error) {
        job.reject(error);
      }
    }
    queueHead = 0;
    queueTail = 0;
    draining = false;
  }

  function enqueueActivation(input) {
    if (queueTail === MAX_SAFE_QUEUE_INDEX) {
      return nativeRejected(compositionFailure(OPERATION_FAILED));
    }
    const capability = nativePromiseCapability();
    activationQueue[queueTail] = OBJECT_FREEZE({
      input,
      resolve: capability.resolve,
      reject: capability.reject,
    });
    queueTail += 1;
    if (!draining) {
      draining = true;
      void drainActivationQueue();
    }
    return capability.promise;
  }

  const activateFunding = OBJECT_FREEZE((input) => {
    let callerContext;
    try {
      callerContext = REFLECT_APPLY(ASYNC_CONTEXT_GET_STORE, ACTIVATION_CONTEXT, []);
    } catch {
      return nativeRejected(compositionFailure(OPERATION_FAILED));
    }
    if (callerContext !== undefined) {
      return nativeRejected(compositionFailure(REENTRANT_ACTIVATION));
    }
    if (latchedCode !== null) return nativeRejected(compositionFailure(latchedCode));
    return enqueueActivation(input);
  });

  const handle = OBJECT_FREEZE(async (request, response) => {
    if (latchedCode !== null) {
      sendUnavailable(response);
      return;
    }
    const admittedHandler = currentHandler;
    return REFLECT_APPLY(admittedHandler, undefined, [request, response]);
  });

  return OBJECT_FREEZE({ createFundingResource, activateFunding, handle });
}
