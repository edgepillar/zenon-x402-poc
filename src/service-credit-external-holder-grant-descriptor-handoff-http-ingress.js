import { types as utilTypes } from 'node:util';

import {
  createServiceCreditExternalHolderGrantDescriptorHandoffHttpAdapter,
} from './service-credit-external-holder-grant-descriptor-handoff-http.js';

const NATIVE_BUFFER = Buffer;
const BUFFER_FROM = NATIVE_BUFFER.from;
const NATIVE_NUMBER = Number;
const NUMBER_IS_SAFE_INTEGER = NATIVE_NUMBER.isSafeInteger;
const NUMBER_MAX_SAFE_INTEGER = NATIVE_NUMBER.MAX_SAFE_INTEGER;
const NATIVE_OBJECT = Object;
const OBJECT_CREATE = NATIVE_OBJECT.create;
const OBJECT_DEFINE_PROPERTY = NATIVE_OBJECT.defineProperty;
const OBJECT_FREEZE = NATIVE_OBJECT.freeze;
const OBJECT_HAS_OWN = NATIVE_OBJECT.hasOwn;
const OBJECT_IS_EXTENSIBLE = NATIVE_OBJECT.isExtensible;
const OBJECT_IS_FROZEN = NATIVE_OBJECT.isFrozen;
const OBJECT_PROTOTYPE = NATIVE_OBJECT.prototype;
const NATIVE_PROMISE = Promise;
const NATIVE_REFLECT = Reflect;
const REFLECT_APPLY = NATIVE_REFLECT.apply;
const REFLECT_DEFINE_PROPERTY = NATIVE_REFLECT.defineProperty;
const REFLECT_DELETE_PROPERTY = NATIVE_REFLECT.deleteProperty;
const REFLECT_GET_OWN_PROPERTY_DESCRIPTOR = NATIVE_REFLECT.getOwnPropertyDescriptor;
const REFLECT_GET_PROTOTYPE_OF = NATIVE_REFLECT.getPrototypeOf;
const REFLECT_OWN_KEYS = NATIVE_REFLECT.ownKeys;
const PROMISE_PROTOTYPE = NATIVE_PROMISE.prototype;
const PROMISE_THEN_DESCRIPTOR = OBJECT_FREEZE(REFLECT_APPLY(
  REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
  NATIVE_REFLECT,
  [PROMISE_PROTOTYPE, 'then'],
));
const PROMISE_THEN = PROMISE_THEN_DESCRIPTOR.value;
const PROMISE_PROTOTYPE_CONSTRUCTOR_DESCRIPTOR = OBJECT_FREEZE(REFLECT_APPLY(
  REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
  NATIVE_REFLECT,
  [PROMISE_PROTOTYPE, 'constructor'],
));
const PROMISE_SPECIES = Symbol.species;
const PROMISE_SPECIES_DESCRIPTOR = OBJECT_FREEZE(REFLECT_APPLY(
  REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
  NATIVE_REFLECT,
  [NATIVE_PROMISE, PROMISE_SPECIES],
));
const NATIVE_STRING = String;
const STRING_FROM = NATIVE_STRING;
const NATIVE_TYPE_ERROR = TypeError;
const IS_PROMISE = utilTypes.isPromise;
const IS_PROXY = utilTypes.isProxy;

const REQUIRED_CONFIGURATION_KEYS = OBJECT_FREEZE([
  'origin',
  'selection',
  'challengeLifetimeMs',
  'now',
  'getActiveGrantDescriptorForSelection',
  'challengeRequestTarget',
  'redemptionRequestTarget',
  'admitRequest',
  'deadlineRuntime',
  'bodyDeadlineMs',
  'responseDeadlineMs',
  'closeGraceMs',
  'metricsCounterLimit',
]);
const OPTIONAL_CONFIGURATION_KEYS = OBJECT_FREEZE(['eventSink']);
const DEADLINE_RUNTIME_KEYS = OBJECT_FREEZE(['schedule', 'cancel']);
const TRANSPORT_CONTEXT_KEYS = OBJECT_FREEZE(['peerToken', 'abort']);
const ADAPTER_ADMISSION_KEYS = OBJECT_FREEZE(['operation', 'declaredBodyBytes']);
const MAX_DEADLINE_MS = 60_000;
const FAILURE_TEXT = '{"error":"unavailable"}';
const JSON_CONTENT_TYPE = 'application/json';

const PHASE = OBJECT_FREEZE({
  OPEN: 'OPEN',
  CLOSING: 'CLOSING',
  CLOSED: 'CLOSED',
  QUARANTINED: 'QUARANTINED',
  CLOSE_UNCERTAIN: 'CLOSE_UNCERTAIN',
});

const EVENT = OBJECT_FREEZE({
  requestRejected: 'REQUEST_REJECTED',
  requestAdmitted: 'REQUEST_ADMITTED',
  bodyAborted: 'BODY_ABORTED',
  responseFinished: 'RESPONSE_FINISHED',
  responseFailed: 'RESPONSE_FAILED',
  closeStarted: 'CLOSE_STARTED',
  closeClean: 'CLOSE_CLEAN',
  closeUncertain: 'CLOSE_UNCERTAIN',
});

const CODE = OBJECT_FREEZE({
  invalidConfiguration:
    'SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_INGRESS_INVALID_CONFIGURATION',
  invalidInput:
    'SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_INGRESS_INVALID_INPUT',
  closeUncertain:
    'SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_INGRESS_CLOSE_UNCERTAIN',
});

const DEADLINE_OUTCOME = OBJECT_FREEZE({
  ACTIVE: 'ACTIVE',
  TERMINATED: 'TERMINATED',
  FAILED: 'FAILED',
});

const PROMISE_OBSERVATION = OBJECT_FREEZE({
  NOT_PROMISE: 'NOT_PROMISE',
  OBSERVED: 'OBSERVED',
  UNOBSERVABLE: 'UNOBSERVABLE',
});

function failure(code) {
  const error = new NATIVE_TYPE_ERROR(code);
  OBJECT_DEFINE_PROPERTY(error, 'code', {
    value: code,
    enumerable: true,
    writable: false,
    configurable: false,
  });
  OBJECT_DEFINE_PROPERTY(error, 'stack', {
    value: `TypeError: ${code}`,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return OBJECT_FREEZE(error);
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

function allowedKey(requiredKeys, optionalKeys, candidate) {
  for (let index = 0; index < requiredKeys.length; index += 1) {
    if (requiredKeys[index] === candidate) return true;
  }
  for (let index = 0; index < optionalKeys.length; index += 1) {
    if (optionalKeys[index] === candidate) return true;
  }
  return false;
}

function exactDataObject(
  value,
  requiredKeys,
  optionalKeys = OBJECT_FREEZE([]),
  requireFrozen = false,
) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || REFLECT_APPLY(IS_PROXY, undefined, [value])
      || REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [value]) !== OBJECT_PROTOTYPE
      || (requireFrozen && !REFLECT_APPLY(OBJECT_IS_FROZEN, NATIVE_OBJECT, [value]))
    ) return null;
    const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, NATIVE_REFLECT, [value]);
    if (keys.length < requiredKeys.length || keys.length > requiredKeys.length + optionalKeys.length) {
      return null;
    }
    const captured = REFLECT_APPLY(OBJECT_CREATE, NATIVE_OBJECT, [null]);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (
        typeof key !== 'string'
        || !allowedKey(requiredKeys, optionalKeys, key)
      ) return null;
      const descriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [value, key],
      );
      if (
        descriptor === undefined
        || descriptor.enumerable !== true
        || !OBJECT_HAS_OWN(descriptor, 'value')
      ) return null;
      captured[key] = descriptor.value;
    }
    for (let index = 0; index < requiredKeys.length; index += 1) {
      if (!OBJECT_HAS_OWN(captured, requiredKeys[index])) return null;
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
    const descriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [value, key],
    );
    return descriptor?.enumerable === true && OBJECT_HAS_OWN(descriptor, 'value')
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

function safeCallable(value) {
  try {
    return typeof value === 'function' && !REFLECT_APPLY(IS_PROXY, undefined, [value]);
  } catch {
    return false;
  }
}

function boundedDeadline(value) {
  return NUMBER_IS_SAFE_INTEGER(value) && value >= 1 && value <= MAX_DEADLINE_MS;
}

function captureDeadlineRuntime(value) {
  const captured = exactDataObject(value, DEADLINE_RUNTIME_KEYS, undefined, true);
  if (
    captured === null
    || !safeCallable(captured.schedule)
    || !safeCallable(captured.cancel)
  ) return null;
  return OBJECT_FREEZE({ schedule: captured.schedule, cancel: captured.cancel });
}

function captureTransportContext(value) {
  const captured = exactDataObject(value, TRANSPORT_CONTEXT_KEYS, undefined, true);
  if (
    captured === null
    || typeof captured.peerToken !== 'symbol'
    || !safeCallable(captured.abort)
  ) return null;
  return OBJECT_FREEZE({ peerToken: captured.peerToken, abort: captured.abort });
}

function captureEmitter(value) {
  try {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return null;
    const once = value.once;
    const removeListener = value.removeListener;
    if (!safeCallable(once) || !safeCallable(removeListener)) return null;
    return OBJECT_FREEZE({ once, removeListener });
  } catch {
    return null;
  }
}

function sendUnavailable(response) {
  const body = REFLECT_APPLY(BUFFER_FROM, NATIVE_BUFFER, [FAILURE_TEXT, 'utf8']);
  try {
    response.statusCode = 503;
    response.setHeader('Content-Type', JSON_CONTENT_TYPE);
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Length', STRING_FROM(body.length));
    response.setHeader('Connection', 'close');
    response.end(body);
  } catch {}
}

/**
 * Creates a default-off, listenerless ingress lifecycle around one private
 * external-holder HTTP adapter. The caller retains parser creation, TLS,
 * authenticated peer derivation, listener, socket, and durable-owner custody.
 */
export function createServiceCreditExternalHolderGrantDescriptorHandoffHttpIngress(options) {
  if (arguments.length !== 1) throw failure(CODE.invalidConfiguration);
  const configuration = exactDataObject(
    options,
    REQUIRED_CONFIGURATION_KEYS,
    OPTIONAL_CONFIGURATION_KEYS,
  );
  const deadlineRuntime = configuration === null
    ? null
    : captureDeadlineRuntime(configuration.deadlineRuntime);
  if (
    configuration === null
    || deadlineRuntime === null
    || !safeCallable(configuration.admitRequest)
    || !safeCallable(configuration.now)
    || !safeCallable(configuration.getActiveGrantDescriptorForSelection)
    || !boundedDeadline(configuration.bodyDeadlineMs)
    || !boundedDeadline(configuration.responseDeadlineMs)
    || !boundedDeadline(configuration.closeGraceMs)
    || !NUMBER_IS_SAFE_INTEGER(configuration.metricsCounterLimit)
    || configuration.metricsCounterLimit < 1
    || configuration.metricsCounterLimit > NUMBER_MAX_SAFE_INTEGER
    || (OBJECT_HAS_OWN(configuration, 'eventSink')
      && !safeCallable(configuration.eventSink))
  ) throw failure(CODE.invalidConfiguration);

  const trustedAdmission = configuration.admitRequest;
  const trustedNow = configuration.now;
  const trustedDescriptorOwner = configuration.getActiveGrantDescriptorForSelection;
  const eventSink = OBJECT_HAS_OWN(configuration, 'eventSink')
    ? configuration.eventSink
    : null;
  const schedule = deadlineRuntime.schedule;
  const cancel = deadlineRuntime.cancel;
  const bodyDeadlineMs = configuration.bodyDeadlineMs;
  const responseDeadlineMs = configuration.responseDeadlineMs;
  const closeGraceMs = configuration.closeGraceMs;
  const metricsCounterLimit = configuration.metricsCounterLimit;

  let phase = PHASE.OPEN;
  let adapter = null;
  let adapterHandle = null;
  let adapterClose = null;
  let adapterCloseSettled = false;
  let adapterCloseClean = false;
  let adapterCloseObserved = false;
  let currentAdapterInvocation = null;
  let closeCapability = null;
  let closePromise = null;
  let closeTerminal = false;
  let closeHadUncertainty = false;
  const closeState = { deadline: null };
  const activeInvocations = new Set();
  const unexpectedNativePromises = new Set();
  const counters = {
    requests: 0,
    requestsRejected: 0,
    requestsAdmitted: 0,
    bodyAborted: 0,
    responsesAttempted: 0,
    responsesFinished: 0,
    responsesFailed: 0,
    telemetryFailures: 0,
    closeStarted: 0,
    closeClean: 0,
    closeUncertain: 0,
  };

  function isNativePromise(value) {
    try {
      return (
        value !== null
        && typeof value === 'object'
        && !REFLECT_APPLY(IS_PROXY, undefined, [value])
        && REFLECT_APPLY(IS_PROMISE, undefined, [value]) === true
      );
    } catch {
      return false;
    }
  }

  function samePropertyDescriptor(left, right) {
    if (left === undefined || right === undefined) return left === right;
    if (
      left.configurable !== right.configurable
      || left.enumerable !== right.enumerable
    ) return false;
    const leftIsData = OBJECT_HAS_OWN(left, 'value');
    if (leftIsData !== OBJECT_HAS_OWN(right, 'value')) return false;
    if (leftIsData) {
      return left.writable === right.writable && left.value === right.value;
    }
    return left.get === right.get && left.set === right.set;
  }

  function capturedNativePromiseRouteIsCurrent() {
    try {
      const constructorDescriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [PROMISE_PROTOTYPE, 'constructor'],
      );
      const speciesDescriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [NATIVE_PROMISE, PROMISE_SPECIES],
      );
      return (
        OBJECT_HAS_OWN(PROMISE_THEN_DESCRIPTOR, 'value')
        && safeCallable(PROMISE_THEN)
        && OBJECT_HAS_OWN(PROMISE_PROTOTYPE_CONSTRUCTOR_DESCRIPTOR, 'value')
        && PROMISE_PROTOTYPE_CONSTRUCTOR_DESCRIPTOR.value === NATIVE_PROMISE
        && !OBJECT_HAS_OWN(PROMISE_SPECIES_DESCRIPTOR, 'value')
        && safeCallable(PROMISE_SPECIES_DESCRIPTOR.get)
        && PROMISE_SPECIES_DESCRIPTOR.set === undefined
        && samePropertyDescriptor(
          constructorDescriptor,
          PROMISE_PROTOTYPE_CONSTRUCTOR_DESCRIPTOR,
        )
        && samePropertyDescriptor(speciesDescriptor, PROMISE_SPECIES_DESCRIPTOR)
      );
    } catch {
      return false;
    }
  }

  function hasSafeDirectPromiseRoute(promise, constructorDescriptor) {
    if (constructorDescriptor !== undefined) {
      if (!OBJECT_HAS_OWN(constructorDescriptor, 'value')) return false;
      if (constructorDescriptor.value === undefined) return true;
      return (
        constructorDescriptor.value === NATIVE_PROMISE
        && capturedNativePromiseRouteIsCurrent()
      );
    }
    try {
      return (
        REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [promise])
          === PROMISE_PROTOTYPE
        && capturedNativePromiseRouteIsCurrent()
      );
    } catch {
      return false;
    }
  }

  function temporaryPromiseConstructorDescriptor(promise, originalDescriptor) {
    if (originalDescriptor === undefined) {
      try {
        if (!REFLECT_APPLY(OBJECT_IS_EXTENSIBLE, NATIVE_OBJECT, [promise])) return null;
      } catch {
        return null;
      }
      return {
        configurable: true,
        enumerable: false,
        writable: false,
        value: undefined,
      };
    }
    if (
      OBJECT_HAS_OWN(originalDescriptor, 'value')
      && originalDescriptor.value === undefined
    ) return null;
    if (originalDescriptor.configurable === true) {
      return {
        configurable: true,
        enumerable: originalDescriptor.enumerable,
        writable: false,
        value: undefined,
      };
    }
    if (
      OBJECT_HAS_OWN(originalDescriptor, 'value')
      && originalDescriptor.writable === true
    ) {
      return {
        configurable: false,
        enumerable: originalDescriptor.enumerable,
        writable: true,
        value: undefined,
      };
    }
    return null;
  }

  function restorePromiseConstructorDescriptor(promise, originalDescriptor) {
    try {
      if (originalDescriptor === undefined) {
        if (!REFLECT_APPLY(REFLECT_DELETE_PROPERTY, NATIVE_REFLECT, [promise, 'constructor'])) {
          return false;
        }
      } else if (!REFLECT_APPLY(
        REFLECT_DEFINE_PROPERTY,
        NATIVE_REFLECT,
        [promise, 'constructor', originalDescriptor],
      )) return false;
      const restoredDescriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [promise, 'constructor'],
      );
      return samePropertyDescriptor(restoredDescriptor, originalDescriptor);
    } catch {
      return false;
    }
  }

  function observeNativePromise(promise, fulfilled, rejected) {
    if (!isNativePromise(promise)) return PROMISE_OBSERVATION.NOT_PROMISE;
    let constructorDescriptor;
    try {
      constructorDescriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [promise, 'constructor'],
      );
    } catch {
      return PROMISE_OBSERVATION.UNOBSERVABLE;
    }

    let callbacksEnabled = false;
    const onFulfilled = value => {
      if (!callbacksEnabled) return;
      try { REFLECT_APPLY(fulfilled, undefined, [value]); } catch {}
    };
    const onRejected = reason => {
      if (!callbacksEnabled) return;
      try { REFLECT_APPLY(rejected, undefined, [reason]); } catch {}
    };
    if (hasSafeDirectPromiseRoute(promise, constructorDescriptor)) {
      try {
        REFLECT_APPLY(PROMISE_THEN, promise, [onFulfilled, onRejected]);
      } catch {
        return PROMISE_OBSERVATION.UNOBSERVABLE;
      }
      callbacksEnabled = true;
      return PROMISE_OBSERVATION.OBSERVED;
    }

    const temporaryDescriptor = temporaryPromiseConstructorDescriptor(
      promise,
      constructorDescriptor,
    );
    if (temporaryDescriptor === null) return PROMISE_OBSERVATION.UNOBSERVABLE;

    let installed = false;
    try {
      installed = REFLECT_APPLY(
        REFLECT_DEFINE_PROPERTY,
        NATIVE_REFLECT,
        [promise, 'constructor', temporaryDescriptor],
      );
      if (!installed) return PROMISE_OBSERVATION.UNOBSERVABLE;
      const installedDescriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [promise, 'constructor'],
      );
      if (!samePropertyDescriptor(installedDescriptor, temporaryDescriptor)) {
        restorePromiseConstructorDescriptor(promise, constructorDescriptor);
        return PROMISE_OBSERVATION.UNOBSERVABLE;
      }
    } catch {
      if (installed) restorePromiseConstructorDescriptor(promise, constructorDescriptor);
      return PROMISE_OBSERVATION.UNOBSERVABLE;
    }

    let attached = false;
    try {
      REFLECT_APPLY(PROMISE_THEN, promise, [onFulfilled, onRejected]);
      attached = true;
    } catch {}
    const restored = restorePromiseConstructorDescriptor(promise, constructorDescriptor);
    if (!attached || !restored) return PROMISE_OBSERVATION.UNOBSERVABLE;
    callbacksEnabled = true;
    return PROMISE_OBSERVATION.OBSERVED;
  }

  function requestAdapterClose() {
    if (adapter === null || adapterClose === null) return null;
    let operation = null;
    try {
      operation = REFLECT_APPLY(adapterClose, undefined, []);
    } catch {
      adapterCloseSettled = true;
      adapterCloseClean = false;
      return null;
    }
    if (!adapterCloseObserved) {
      adapterCloseObserved = true;
      const observation = observeNativePromise(
        operation,
        () => {
          adapterCloseSettled = true;
          adapterCloseClean = true;
          maybeFinishClose();
        },
        () => {
          adapterCloseSettled = true;
          adapterCloseClean = false;
          closeHadUncertainty = true;
          maybeFinishClose();
        },
      );
      if (observation === PROMISE_OBSERVATION.NOT_PROMISE) {
        adapterCloseSettled = true;
        adapterCloseClean = false;
        closeHadUncertainty = true;
        maybeFinishClose();
      } else if (observation === PROMISE_OBSERVATION.UNOBSERVABLE) {
        unexpectedNativePromises.add(operation);
        adapterCloseClean = false;
        closeHadUncertainty = true;
        if (phase !== PHASE.CLOSED && phase !== PHASE.CLOSE_UNCERTAIN) {
          phase = PHASE.QUARANTINED;
        }
      }
    }
    return operation;
  }

  function quarantine() {
    if (phase === PHASE.CLOSED || phase === PHASE.CLOSE_UNCERTAIN) return;
    phase = PHASE.QUARANTINED;
    closeHadUncertainty = true;
    requestAdapterClose();
  }

  function trackUnexpectedNativePromise(promise) {
    if (!isNativePromise(promise)) return false;
    if (!unexpectedNativePromises.has(promise)) {
      unexpectedNativePromises.add(promise);
      const settled = () => {
        unexpectedNativePromises.delete(promise);
        maybeFinishClose();
      };
      observeNativePromise(promise, settled, settled);
    }
    quarantine();
    return true;
  }

  function increment(name) {
    const current = counters[name];
    if (!NUMBER_IS_SAFE_INTEGER(current) || current < 0 || current >= metricsCounterLimit) {
      quarantine();
      return false;
    }
    counters[name] = current + 1;
    return true;
  }

  function emitEvent(event) {
    if (eventSink === null) return true;
    try {
      REFLECT_APPLY(eventSink, undefined, [event]);
      return true;
    } catch {
      return increment('telemetryFailures');
    }
  }

  function emitCounted(name, event) {
    const counted = increment(name);
    const delivered = event === null ? true : emitEvent(event);
    return counted && delivered && phase !== PHASE.QUARANTINED;
  }

  function cancelHandle(handle) {
    let result;
    try {
      result = REFLECT_APPLY(cancel, undefined, [handle]);
    } catch {
      quarantine();
      return false;
    }
    if (trackUnexpectedNativePromise(result)) return false;
    return true;
  }

  function cancelTicket(owner, slot) {
    const ticket = owner[slot];
    if (ticket === null) return true;
    if (owner[slot] === ticket) owner[slot] = null;
    if (ticket.active !== true) return true;
    ticket.active = false;
    return ticket.handleReady ? cancelHandle(ticket.handle) : true;
  }

  function scheduleTicket(owner, slot, milliseconds, callback) {
    const ticket = {
      active: true,
      handle: undefined,
      handleReady: false,
    };
    owner[slot] = ticket;
    const onDeadline = OBJECT_FREEZE(() => {
      if (owner[slot] !== ticket || ticket.active !== true) return;
      ticket.active = false;
      owner[slot] = null;
      REFLECT_APPLY(callback, undefined, []);
    });
    let handle;
    try {
      handle = REFLECT_APPLY(schedule, undefined, [onDeadline, milliseconds]);
    } catch {
      if (owner[slot] === ticket) owner[slot] = null;
      ticket.active = false;
      quarantine();
      return DEADLINE_OUTCOME.FAILED;
    }
    if (isNativePromise(handle)) {
      if (owner[slot] === ticket) owner[slot] = null;
      ticket.active = false;
      trackUnexpectedNativePromise(handle);
      return DEADLINE_OUTCOME.FAILED;
    }
    if (owner[slot] === ticket && ticket.active === true) {
      ticket.handle = handle;
      ticket.handleReady = true;
      return DEADLINE_OUTCOME.ACTIVE;
    }
    ticket.active = false;
    return cancelHandle(handle)
      ? DEADLINE_OUTCOME.TERMINATED
      : DEADLINE_OUTCOME.FAILED;
  }

  function removeObservedListener(target, observer, name, callback) {
    if (observer === null) return;
    try {
      REFLECT_APPLY(observer.removeListener, target, [name, callback]);
    } catch {
      quarantine();
    }
  }

  function cleanupInvocation(invocation) {
    cancelTicket(invocation, 'bodyDeadline');
    cancelTicket(invocation, 'responseDeadline');
    if (invocation.request !== null) {
      removeObservedListener(
        invocation.request,
        invocation.requestObserver,
        'end',
        invocation.onRequestEnd,
      );
    }
    if (invocation.response !== null) {
      removeObservedListener(
        invocation.response,
        invocation.responseObserver,
        'finish',
        invocation.onResponseFinish,
      );
      removeObservedListener(
        invocation.response,
        invocation.responseObserver,
        'close',
        invocation.onResponseClose,
      );
      removeObservedListener(
        invocation.response,
        invocation.responseObserver,
        'error',
        invocation.onResponseError,
      );
    }
    invocation.request = null;
    invocation.response = null;
    invocation.abort = null;
    invocation.peerToken = null;
    invocation.requestObserver = null;
    invocation.responseObserver = null;
    invocation.onRequestEnd = null;
    invocation.onResponseFinish = null;
    invocation.onResponseClose = null;
    invocation.onResponseError = null;
  }

  function maybeSettleInvocation(invocation) {
    if (
      invocation.settled
      || !invocation.adapterSettled
      || invocation.responseDisposition === null
    ) return;
    invocation.settled = true;
    if (invocation.tracked) activeInvocations.delete(invocation);
    cleanupInvocation(invocation);
    invocation.capability.resolve(undefined);
    maybeFinishClose();
  }

  function cancelBodyDeadline(invocation) {
    cancelTicket(invocation, 'bodyDeadline');
  }

  function cancelResponseDeadline(invocation) {
    cancelTicket(invocation, 'responseDeadline');
  }

  function markResponseFinished(invocation) {
    if (invocation.responseDisposition !== null) return;
    markResponseAttempted(invocation);
    invocation.responseDisposition = 'FINISHED';
    cancelBodyDeadline(invocation);
    cancelResponseDeadline(invocation);
    emitCounted('responsesFinished', EVENT.responseFinished);
    maybeSettleInvocation(invocation);
  }

  function markResponseFailed(invocation) {
    if (invocation.responseDisposition !== null) return;
    invocation.responseDisposition = 'FAILED';
    cancelBodyDeadline(invocation);
    cancelResponseDeadline(invocation);
    emitCounted('responsesFailed', EVENT.responseFailed);
    maybeSettleInvocation(invocation);
  }

  function invokeAbort(invocation) {
    if (invocation.abortInvoked || invocation.abort === null) return;
    invocation.abortInvoked = true;
    cancelBodyDeadline(invocation);
    emitCounted('bodyAborted', EVENT.bodyAborted);
    try {
      const result = REFLECT_APPLY(invocation.abort, undefined, []);
      trackUnexpectedNativePromise(result);
    } catch {
      quarantine();
    }
  }

  function startResponseDeadline(invocation) {
    if (
      invocation.responseDisposition !== null
      || invocation.responseDeadline !== null
      || invocation.settled
    ) return;
    if (invocation.responseObserver === null) {
      invokeAbort(invocation);
      quarantine();
      markResponseFailed(invocation);
      return;
    }
    const outcome = scheduleTicket(invocation, 'responseDeadline', responseDeadlineMs, () => {
      invokeAbort(invocation);
      quarantine();
      markResponseFailed(invocation);
    });
    if (outcome !== DEADLINE_OUTCOME.ACTIVE) {
      invokeAbort(invocation);
      markResponseFailed(invocation);
    }
  }

  function markResponseAttempted(invocation) {
    if (invocation.responseAttempted) return;
    invocation.responseAttempted = true;
    emitCounted('responsesAttempted', null);
  }

  function markRejected(invocation) {
    if (invocation.rejected || invocation.admitted) return;
    invocation.rejected = true;
    emitCounted('requestsRejected', EVENT.requestRejected);
  }

  function attemptUnavailable(invocation) {
    markResponseAttempted(invocation);
    sendUnavailable(invocation.response);
    if (invocation.responseDisposition === null) startResponseDeadline(invocation);
  }

  function rejectInvocation(invocation) {
    markRejected(invocation);
    invocation.adapterSettled = true;
    attemptUnavailable(invocation);
    maybeSettleInvocation(invocation);
  }

  function registerRequestObserver(invocation) {
    const observer = captureEmitter(invocation.request);
    invocation.requestObserver = observer;
    if (observer === null) return;
    const onRequestEnd = OBJECT_FREEZE(() => {
      cancelBodyDeadline(invocation);
      if (invocation.admitted) startResponseDeadline(invocation);
    });
    invocation.onRequestEnd = onRequestEnd;
    try {
      REFLECT_APPLY(observer.once, invocation.request, ['end', onRequestEnd]);
    } catch {
      invocation.requestObserver = null;
      invocation.onRequestEnd = null;
      quarantine();
    }
  }

  function registerResponseObserver(invocation) {
    const observer = captureEmitter(invocation.response);
    invocation.responseObserver = observer;
    if (observer === null) return;
    const onResponseFinish = OBJECT_FREEZE(() => markResponseFinished(invocation));
    const onResponseClose = OBJECT_FREEZE(() => markResponseFailed(invocation));
    const onResponseError = OBJECT_FREEZE(() => markResponseFailed(invocation));
    invocation.onResponseFinish = onResponseFinish;
    invocation.onResponseClose = onResponseClose;
    invocation.onResponseError = onResponseError;
    try {
      REFLECT_APPLY(observer.once, invocation.response, ['finish', onResponseFinish]);
      REFLECT_APPLY(observer.once, invocation.response, ['close', onResponseClose]);
      REFLECT_APPLY(observer.once, invocation.response, ['error', onResponseError]);
    } catch {
      removeObservedListener(invocation.response, observer, 'finish', onResponseFinish);
      removeObservedListener(invocation.response, observer, 'close', onResponseClose);
      removeObservedListener(invocation.response, observer, 'error', onResponseError);
      invocation.responseObserver = null;
      invocation.onResponseFinish = null;
      invocation.onResponseClose = null;
      invocation.onResponseError = null;
      quarantine();
    }
  }

  function newInvocation(request, response) {
    const capability = nativePromiseCapability();
    const invocation = {
      request,
      response,
      abort: null,
      peerToken: null,
      admitted: false,
      rejected: false,
      tracked: phase === PHASE.OPEN,
      adapterSettled: false,
      responseAttempted: false,
      responseDisposition: null,
      abortInvoked: false,
      settled: false,
      bodyDeadline: null,
      responseDeadline: null,
      requestObserver: null,
      responseObserver: null,
      onRequestEnd: null,
      onResponseFinish: null,
      onResponseClose: null,
      onResponseError: null,
      capability,
    };
    if (invocation.tracked) activeInvocations.add(invocation);
    registerResponseObserver(invocation);
    return invocation;
  }

  const adapterAdmission = OBJECT_FREEZE(adapterRecord => {
    const invocation = currentAdapterInvocation;
    const record = exactDataObject(adapterRecord, ADAPTER_ADMISSION_KEYS, undefined, true);
    if (
      invocation === null
      || record === null
      || invocation.admitted
      || invocation.rejected
      || phase !== PHASE.OPEN
      || (record.operation !== 'CHALLENGE' && record.operation !== 'REDEMPTION')
      || !NUMBER_IS_SAFE_INTEGER(record.declaredBodyBytes)
      || record.declaredBodyBytes < 0
    ) {
      if (invocation !== null) markRejected(invocation);
      return false;
    }
    const admission = OBJECT_FREEZE({
      peerToken: invocation.peerToken,
      operation: record.operation,
      declaredBodyBytes: record.declaredBodyBytes,
    });
    let admitted = false;
    try {
      const result = REFLECT_APPLY(trustedAdmission, undefined, [admission]);
      admitted = !trackUnexpectedNativePromise(result) && result === true;
    } catch {
      admitted = false;
    }
    if (!admitted || phase !== PHASE.OPEN) {
      markRejected(invocation);
      return false;
    }
    invocation.admitted = true;
    if (!emitCounted('requestsAdmitted', EVENT.requestAdmitted)) {
      invokeAbort(invocation);
      return false;
    }
    const outcome = scheduleTicket(invocation, 'bodyDeadline', bodyDeadlineMs, () => {
      invokeAbort(invocation);
    });
    if (outcome !== DEADLINE_OUTCOME.ACTIVE || phase !== PHASE.OPEN) {
      invokeAbort(invocation);
      return false;
    }
    return true;
  });

  const guardedNow = OBJECT_FREEZE((...args) => {
    const result = REFLECT_APPLY(trustedNow, undefined, args);
    return trackUnexpectedNativePromise(result) ? undefined : result;
  });

  const guardedDescriptorOwner = OBJECT_FREEZE((...args) => {
    const result = REFLECT_APPLY(trustedDescriptorOwner, undefined, args);
    return trackUnexpectedNativePromise(result) ? null : result;
  });

  try {
    adapter = createServiceCreditExternalHolderGrantDescriptorHandoffHttpAdapter({
      origin: configuration.origin,
      selection: configuration.selection,
      challengeLifetimeMs: configuration.challengeLifetimeMs,
      now: guardedNow,
      getActiveGrantDescriptorForSelection: guardedDescriptorOwner,
      challengeRequestTarget: configuration.challengeRequestTarget,
      redemptionRequestTarget: configuration.redemptionRequestTarget,
      admitRequest: adapterAdmission,
    });
    adapterHandle = adapter.handle;
    adapterClose = adapter.close;
  } catch {
    throw failure(CODE.invalidConfiguration);
  }

  function adapterSettled(invocation) {
    invocation.adapterSettled = true;
    cancelBodyDeadline(invocation);
    if (!invocation.admitted) markRejected(invocation);
    markResponseAttempted(invocation);
    if (invocation.responseDisposition === null) startResponseDeadline(invocation);
    maybeSettleInvocation(invocation);
  }

  const handle = OBJECT_FREEZE(function serviceCreditExternalHolderHandoffHttpIngressHandle(
    request,
    response,
    transport,
    ...extra
  ) {
    const invocation = newInvocation(request, response);
    if (!increment('requests')) {
      rejectInvocation(invocation);
      return invocation.capability.promise;
    }
    if (phase !== PHASE.OPEN || extra.length !== 0) {
      rejectInvocation(invocation);
      return invocation.capability.promise;
    }
    const capturedTransport = captureTransportContext(transport);
    const httpVersion = ownDataValue(request, 'httpVersion');
    if (capturedTransport === null || httpVersion !== '1.1') {
      rejectInvocation(invocation);
      return invocation.capability.promise;
    }
    invocation.peerToken = capturedTransport.peerToken;
    invocation.abort = capturedTransport.abort;
    if (currentAdapterInvocation !== null) {
      rejectInvocation(invocation);
      return invocation.capability.promise;
    }
    registerRequestObserver(invocation);
    let operation = null;
    currentAdapterInvocation = invocation;
    try {
      operation = REFLECT_APPLY(adapterHandle, undefined, [request, response]);
    } catch {
      operation = null;
    }
    currentAdapterInvocation = null;
    if (operation === null) {
      adapterSettled(invocation);
      return invocation.capability.promise;
    }
    const observation = observeNativePromise(
      operation,
      () => adapterSettled(invocation),
      () => adapterSettled(invocation),
    );
    if (observation !== PROMISE_OBSERVATION.OBSERVED) {
      if (observation === PROMISE_OBSERVATION.UNOBSERVABLE) {
        unexpectedNativePromises.add(operation);
      }
      quarantine();
    }
    return invocation.capability.promise;
  });

  function clearCloseDeadline() {
    return cancelTicket(closeState, 'deadline');
  }

  function finishCloseUncertain() {
    if (closeTerminal || closeCapability === null) return;
    closeTerminal = true;
    clearCloseDeadline();
    phase = PHASE.CLOSE_UNCERTAIN;
    increment('closeUncertain');
    emitEvent(EVENT.closeUncertain);
    closeCapability.reject(failure(CODE.closeUncertain));
  }

  function finishCloseClean() {
    if (closeTerminal || closeCapability === null) return;
    const cancellationClean = clearCloseDeadline();
    if (
      !cancellationClean
      || closeHadUncertainty
      || phase === PHASE.QUARANTINED
      || unexpectedNativePromises.size !== 0
    ) {
      finishCloseUncertain();
      return;
    }
    if (!increment('closeClean')) {
      finishCloseUncertain();
      return;
    }
    closeTerminal = true;
    phase = PHASE.CLOSED;
    emitEvent(EVENT.closeClean);
    closeCapability.resolve(undefined);
  }

  function maybeFinishClose() {
    if (
      closeCapability === null
      || closeTerminal
      || !adapterCloseSettled
      || activeInvocations.size !== 0
      || unexpectedNativePromises.size !== 0
    ) return;
    if (
      closeHadUncertainty
      || phase === PHASE.QUARANTINED
      || !adapterCloseClean
    ) finishCloseUncertain();
    else finishCloseClean();
  }

  const close = OBJECT_FREEZE(function closeServiceCreditExternalHolderHandoffHttpIngress(
    ...args
  ) {
    if (args.length !== 0) return nativeRejected(failure(CODE.invalidInput));
    if (closePromise !== null) return closePromise;
    closeCapability = nativePromiseCapability();
    closePromise = closeCapability.promise;
    if (phase === PHASE.QUARANTINED || phase === PHASE.CLOSE_UNCERTAIN) {
      closeHadUncertainty = true;
    } else if (phase !== PHASE.CLOSED) {
      phase = PHASE.CLOSING;
    }

    requestAdapterClose();
    if (!emitCounted('closeStarted', EVENT.closeStarted)) closeHadUncertainty = true;
    for (const invocation of activeInvocations) {
      if (invocation.admitted) invokeAbort(invocation);
    }
    const outcome = scheduleTicket(closeState, 'deadline', closeGraceMs, () => {
      for (const invocation of activeInvocations) {
        if (invocation.admitted) invokeAbort(invocation);
      }
      finishCloseUncertain();
    });
    if (outcome === DEADLINE_OUTCOME.FAILED) {
      closeHadUncertainty = true;
      finishCloseUncertain();
      return closePromise;
    }
    maybeFinishClose();
    return closePromise;
  });

  const snapshotMetrics = OBJECT_FREEZE(function snapshotServiceCreditIngressMetrics() {
    return OBJECT_FREEZE({
      phase,
      requests: counters.requests,
      requestsRejected: counters.requestsRejected,
      requestsAdmitted: counters.requestsAdmitted,
      bodyAborted: counters.bodyAborted,
      responsesAttempted: counters.responsesAttempted,
      responsesFinished: counters.responsesFinished,
      responsesFailed: counters.responsesFailed,
      telemetryFailures: counters.telemetryFailures,
      closeStarted: counters.closeStarted,
      closeClean: counters.closeClean,
      closeUncertain: counters.closeUncertain,
    });
  });

  return OBJECT_FREEZE({ handle, close, snapshotMetrics });
}
