import { EventEmitter } from 'node:events';
import { OutgoingMessage } from 'node:http';
import { isIP } from 'node:net';
import { types as utilTypes } from 'node:util';

const NATIVE_ARRAY = Array;
const ARRAY_IS_ARRAY = NATIVE_ARRAY.isArray;
const ARRAY_PROTOTYPE = NATIVE_ARRAY.prototype;
const NATIVE_BUFFER = Buffer;
const BUFFER_BYTE_LENGTH = NATIVE_BUFFER.byteLength;
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
const EVENT_EMITTER_ON = EventEmitter.prototype.on;
const EVENT_EMITTER_REMOVE_LISTENER = EventEmitter.prototype.removeListener;
const NATIVE_PROMISE = Promise;
const PROMISE_PROTOTYPE = NATIVE_PROMISE.prototype;
const NATIVE_REFLECT = Reflect;
const REFLECT_APPLY = NATIVE_REFLECT.apply;
const REFLECT_DEFINE_PROPERTY = NATIVE_REFLECT.defineProperty;
const REFLECT_DELETE_PROPERTY = NATIVE_REFLECT.deleteProperty;
const REFLECT_GET_OWN_PROPERTY_DESCRIPTOR = NATIVE_REFLECT.getOwnPropertyDescriptor;
const REFLECT_GET_PROTOTYPE_OF = NATIVE_REFLECT.getPrototypeOf;
const REFLECT_OWN_KEYS = NATIVE_REFLECT.ownKeys;
const OUTGOING_MESSAGE_PROTOTYPE = OutgoingMessage.prototype;
const OUTGOING_MESSAGE_HEADERS_SENT_DESCRIPTOR = OBJECT_FREEZE(REFLECT_APPLY(
  REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
  NATIVE_REFLECT,
  [OUTGOING_MESSAGE_PROTOTYPE, 'headersSent'],
));
const OUTGOING_MESSAGE_WRITABLE_ENDED_DESCRIPTOR = OBJECT_FREEZE(REFLECT_APPLY(
  REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
  NATIVE_REFLECT,
  [OUTGOING_MESSAGE_PROTOTYPE, 'writableEnded'],
));
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
const NATIVE_REGEXP = RegExp;
const REGEXP_EXEC = NATIVE_REGEXP.prototype.exec;
const NATIVE_SET = Set;
const NATIVE_MAP = Map;
const NATIVE_WEAK_MAP = WeakMap;
const NATIVE_WEAK_SET = WeakSet;
const SET_ADD = NATIVE_SET.prototype.add;
const SET_DELETE = NATIVE_SET.prototype.delete;
const SET_HAS = NATIVE_SET.prototype.has;
const SET_SIZE_GETTER = REFLECT_APPLY(
  REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
  NATIVE_REFLECT,
  [NATIVE_SET.prototype, 'size'],
).get;
const SET_VALUES = NATIVE_SET.prototype.values;
const SET_ITERATOR_PROTOTYPE = REFLECT_APPLY(
  REFLECT_GET_PROTOTYPE_OF,
  NATIVE_REFLECT,
  [REFLECT_APPLY(SET_VALUES, new NATIVE_SET(), [])],
);
const SET_ITERATOR_NEXT = REFLECT_APPLY(
  REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
  NATIVE_REFLECT,
  [SET_ITERATOR_PROTOTYPE, 'next'],
).value;
const MAP_DELETE = NATIVE_MAP.prototype.delete;
const MAP_GET = NATIVE_MAP.prototype.get;
const MAP_HAS = NATIVE_MAP.prototype.has;
const MAP_SET = NATIVE_MAP.prototype.set;
const MAP_SIZE_GETTER = REFLECT_APPLY(
  REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
  NATIVE_REFLECT,
  [NATIVE_MAP.prototype, 'size'],
).get;
const MAP_VALUES = NATIVE_MAP.prototype.values;
const MAP_ITERATOR_PROTOTYPE = REFLECT_APPLY(
  REFLECT_GET_PROTOTYPE_OF,
  NATIVE_REFLECT,
  [REFLECT_APPLY(MAP_VALUES, new NATIVE_MAP(), [])],
);
const MAP_ITERATOR_NEXT = REFLECT_APPLY(
  REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
  NATIVE_REFLECT,
  [MAP_ITERATOR_PROTOTYPE, 'next'],
).value;
const WEAK_MAP_DELETE = NATIVE_WEAK_MAP.prototype.delete;
const WEAK_MAP_GET = NATIVE_WEAK_MAP.prototype.get;
const WEAK_MAP_SET = NATIVE_WEAK_MAP.prototype.set;
const WEAK_SET_ADD = NATIVE_WEAK_SET.prototype.add;
const WEAK_SET_HAS = NATIVE_WEAK_SET.prototype.has;
const NATIVE_STRING = String;
const STRING_FROM = NATIVE_STRING;
const STRING_TO_LOWER_CASE = NATIVE_STRING.prototype.toLowerCase;
const NATIVE_SYMBOL = Symbol;
const NATIVE_TYPE_ERROR = TypeError;
const NATIVE_URL = URL;
const IS_IP = isIP;
const IS_PROMISE = utilTypes.isPromise;
const IS_PROXY = utilTypes.isProxy;
const PROMISE_CONTAINMENT_NOOP = OBJECT_FREEZE(() => {});
const INERT_CALLBACK_DISPATCH = OBJECT_FREEZE({});

function setAdd(collection, value) {
  return REFLECT_APPLY(SET_ADD, collection, [value]);
}

function setDelete(collection, value) {
  return REFLECT_APPLY(SET_DELETE, collection, [value]);
}

function setHas(collection, value) {
  return REFLECT_APPLY(SET_HAS, collection, [value]);
}

function setSize(collection) {
  return REFLECT_APPLY(SET_SIZE_GETTER, collection, []);
}

function mapDelete(collection, key) {
  return REFLECT_APPLY(MAP_DELETE, collection, [key]);
}

function mapGet(collection, key) {
  return REFLECT_APPLY(MAP_GET, collection, [key]);
}

function mapHas(collection, key) {
  return REFLECT_APPLY(MAP_HAS, collection, [key]);
}

function mapSet(collection, key, value) {
  return REFLECT_APPLY(MAP_SET, collection, [key, value]);
}

function mapSize(collection) {
  return REFLECT_APPLY(MAP_SIZE_GETTER, collection, []);
}

function weakMapGet(collection, key) {
  return REFLECT_APPLY(WEAK_MAP_GET, collection, [key]);
}

function weakMapDelete(collection, key) {
  return REFLECT_APPLY(WEAK_MAP_DELETE, collection, [key]);
}

function weakMapSet(collection, key, value) {
  return REFLECT_APPLY(WEAK_MAP_SET, collection, [key, value]);
}

function snapshotSetValues(collection) {
  const snapshot = [];
  const iterator = REFLECT_APPLY(SET_VALUES, collection, []);
  while (true) {
    const step = REFLECT_APPLY(SET_ITERATOR_NEXT, iterator, []);
    if (step.done) return snapshot;
    snapshot[snapshot.length] = step.value;
  }
}

function snapshotMapValues(collection) {
  const snapshot = [];
  const iterator = REFLECT_APPLY(MAP_VALUES, collection, []);
  while (true) {
    const step = REFLECT_APPLY(MAP_ITERATOR_NEXT, iterator, []);
    if (step.done) return snapshot;
    snapshot[snapshot.length] = step.value;
  }
}

function firstSetValue(collection) {
  const iterator = REFLECT_APPLY(SET_VALUES, collection, []);
  const step = REFLECT_APPLY(SET_ITERATOR_NEXT, iterator, []);
  return step.done ? undefined : step.value;
}

const CONFIGURATION_KEYS = OBJECT_FREEZE([
  'origin',
  'requestTargets',
  'generation',
  'limits',
  'downstream',
  'deadlineRuntime',
  'httpsServerFactory',
]);
const GENERATION_KEYS = OBJECT_FREEZE(['generationId', 'generationVersion']);
const LIMIT_KEYS = OBJECT_FREEZE([
  'maxHeaderBytes',
  'maxHeaderCount',
  'maxConcurrentSockets',
  'maxConnectionStarts',
  'maxConcurrentRequests',
  'maxRequestStarts',
  'tlsHandshakeDeadlineMs',
  'headerDeadlineMs',
  'requestResponseDeadlineMs',
  'idleSocketDeadlineMs',
  'startDeadlineMs',
  'closeGraceMs',
  'metricsCounterLimit',
]);
const DOWNSTREAM_KEYS = OBJECT_FREEZE(['handle', 'close']);
const DEADLINE_RUNTIME_KEYS = OBJECT_FREEZE(['schedule', 'cancel']);
const SERVER_CAPABILITY_KEYS = OBJECT_FREEZE(['listen', 'close', 'closeAllConnections']);
const SERVER_CALLBACK_KEYS = OBJECT_FREEZE([
  'connection',
  'secureConnection',
  'request',
  'checkContinue',
  'checkExpectation',
  'upgrade',
  'connect',
  'clientError',
  'tlsClientError',
  'dropRequest',
  'drop',
  'timeout',
  'listening',
  'close',
  'error',
]);

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REQUEST_TARGET = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@]+(?:\/[A-Za-z0-9\-._~!$&'()*+,;=:@]+)*$/;
const DOT_SEGMENT = /(?:^|\/)\.{1,2}(?:\/|$)/;
const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const HEADER_VALUE = /^[\t\x20-\x7e\x80-\xff]*$/;
const MAX_ORIGIN_BYTES = 2_048;
const MAX_REQUEST_TARGET_BYTES = 2_048;
const MAX_REQUEST_TARGETS = 16;
const MAX_GENERATION_VERSION = 1_000_000;
const MAX_HEADER_BYTES = 65_536;
const MAX_HEADER_COUNT = 256;
const MAX_CONCURRENT = 10_000;
const MAX_LIFETIME_STARTS = 1_000_000;
const MAX_DEADLINE_MS = 60_000;
const MAX_PROMISE_PROTOTYPE_DEPTH = 16;
const MAX_PROPERTY_PROTOTYPE_DEPTH = 32;
const METRIC_RESERVE = 32;
const FAILURE_TEXT = '{"error":"unavailable"}';

const PHASE = OBJECT_FREEZE({
  DORMANT: 'DORMANT',
  STARTING: 'STARTING',
  LISTENING: 'LISTENING',
  EXHAUSTED: 'EXHAUSTED',
  QUARANTINED: 'QUARANTINED',
  CLOSING: 'CLOSING',
  CLOSED: 'CLOSED',
  CLOSE_UNCERTAIN: 'CLOSE_UNCERTAIN',
});

const SECURE_SETUP = OBJECT_FREEZE({
  INSTALLING_HEADER_DEADLINE: 'INSTALLING_HEADER_DEADLINE',
  REQUEST_ELIGIBLE: 'REQUEST_ELIGIBLE',
});

const CODE = OBJECT_FREEZE({
  invalidConfiguration:
    'SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_OWNER_INVALID_CONFIGURATION',
  invalidInput: 'SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_OWNER_INVALID_INPUT',
  startUncertain: 'SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_OWNER_START_UNCERTAIN',
  closeUncertain: 'SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_OWNER_CLOSE_UNCERTAIN',
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

function allowedKey(expected, candidate) {
  if (typeof candidate !== 'string') return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index] === candidate) return true;
  }
  return false;
}

function exactDataObject(value, expected, requireFrozen = false) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || REFLECT_APPLY(ARRAY_IS_ARRAY, NATIVE_ARRAY, [value])
      || REFLECT_APPLY(IS_PROXY, undefined, [value])
      || REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [value]) !== OBJECT_PROTOTYPE
      || (requireFrozen && !REFLECT_APPLY(OBJECT_IS_FROZEN, NATIVE_OBJECT, [value]))
    ) return null;
    const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, NATIVE_REFLECT, [value]);
    if (keys.length !== expected.length) return null;
    const captured = REFLECT_APPLY(OBJECT_CREATE, NATIVE_OBJECT, [null]);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (!allowedKey(expected, key)) return null;
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
    for (let index = 0; index < expected.length; index += 1) {
      if (!OBJECT_HAS_OWN(captured, expected[index])) return null;
    }
    return captured;
  } catch {
    return null;
  }
}

function safeCallable(value, requireFrozen = false) {
  try {
    return typeof value === 'function'
      && !REFLECT_APPLY(IS_PROXY, undefined, [value])
      && (!requireFrozen || REFLECT_APPLY(OBJECT_IS_FROZEN, NATIVE_OBJECT, [value]));
  } catch {
    return false;
  }
}

function regexpMatches(expression, value) {
  return REFLECT_APPLY(REGEXP_EXEC, expression, [value]) !== null;
}

function byteLength(value) {
  try {
    return REFLECT_APPLY(BUFFER_BYTE_LENGTH, NATIVE_BUFFER, [value, 'utf8']);
  } catch {
    return NUMBER_MAX_SAFE_INTEGER;
  }
}

function captureOrigin(value) {
  try {
    if (
      typeof value !== 'string'
      || value.length === 0
      || byteLength(value) > MAX_ORIGIN_BYTES
    ) return null;
    const parsed = new NATIVE_URL(value);
    if (
      parsed.protocol !== 'https:'
      || parsed.username !== ''
      || parsed.password !== ''
      || parsed.pathname !== '/'
      || parsed.search !== ''
      || parsed.hash !== ''
      || parsed.origin !== value
      || parsed.hostname.length === 0
      || parsed.hostname.endsWith('.')
    ) return null;
    const unbracketed = parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
      ? parsed.hostname.slice(1, -1)
      : parsed.hostname;
    const ipVersion = REFLECT_APPLY(IS_IP, undefined, [unbracketed]);
    return OBJECT_FREEZE({
      canonicalOrigin: value,
      authority: parsed.host,
      servername: ipVersion === 0 ? parsed.hostname : null,
    });
  } catch {
    return null;
  }
}

function captureRequestTargets(value) {
  try {
    if (
      !REFLECT_APPLY(ARRAY_IS_ARRAY, NATIVE_ARRAY, [value])
      || REFLECT_APPLY(IS_PROXY, undefined, [value])
      || REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [value]) !== ARRAY_PROTOTYPE
    ) return null;
    const lengthDescriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [value, 'length'],
    );
    if (
      lengthDescriptor === undefined
      || !OBJECT_HAS_OWN(lengthDescriptor, 'value')
      || !NUMBER_IS_SAFE_INTEGER(lengthDescriptor.value)
      || lengthDescriptor.value < 1
      || lengthDescriptor.value > MAX_REQUEST_TARGETS
    ) return null;
    const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, NATIVE_REFLECT, [value]);
    if (keys.length !== lengthDescriptor.value + 1 || keys[keys.length - 1] !== 'length') {
      return null;
    }
    const observed = new NATIVE_SET();
    const captured = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const key = STRING_FROM(index);
      if (keys[index] !== key) return null;
      const descriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [value, key],
      );
      if (
        descriptor === undefined
        || descriptor.enumerable !== true
        || !OBJECT_HAS_OWN(descriptor, 'value')
        || typeof descriptor.value !== 'string'
        || byteLength(descriptor.value) > MAX_REQUEST_TARGET_BYTES
        || !regexpMatches(REQUEST_TARGET, descriptor.value)
        || regexpMatches(DOT_SEGMENT, descriptor.value)
        || setHas(observed, descriptor.value)
      ) return null;
      setAdd(observed, descriptor.value);
      captured.push(descriptor.value);
    }
    return OBJECT_FREEZE(captured);
  } catch {
    return null;
  }
}

function captureGeneration(value) {
  const captured = exactDataObject(value, GENERATION_KEYS);
  if (
    captured === null
    || typeof captured.generationId !== 'string'
    || !regexpMatches(IDENTIFIER, captured.generationId)
    || !NUMBER_IS_SAFE_INTEGER(captured.generationVersion)
    || captured.generationVersion < 1
    || captured.generationVersion > MAX_GENERATION_VERSION
  ) return null;
  return OBJECT_FREEZE({
    generationId: captured.generationId,
    generationVersion: captured.generationVersion,
  });
}

function boundedInteger(value, minimum, maximum) {
  return NUMBER_IS_SAFE_INTEGER(value) && value >= minimum && value <= maximum;
}

function captureLimits(value) {
  const captured = exactDataObject(value, LIMIT_KEYS);
  if (
    captured === null
    || !boundedInteger(captured.maxHeaderBytes, 512, MAX_HEADER_BYTES)
    || !boundedInteger(captured.maxHeaderCount, 1, MAX_HEADER_COUNT)
    || !boundedInteger(captured.maxConcurrentSockets, 1, MAX_CONCURRENT)
    || !boundedInteger(captured.maxConnectionStarts, 1, MAX_LIFETIME_STARTS)
    || !boundedInteger(captured.maxConcurrentRequests, 1, MAX_CONCURRENT)
    || !boundedInteger(captured.maxRequestStarts, 1, MAX_LIFETIME_STARTS)
    || !boundedInteger(captured.tlsHandshakeDeadlineMs, 1, MAX_DEADLINE_MS)
    || !boundedInteger(captured.headerDeadlineMs, 1, MAX_DEADLINE_MS)
    || !boundedInteger(captured.requestResponseDeadlineMs, 1, MAX_DEADLINE_MS)
    || !boundedInteger(captured.idleSocketDeadlineMs, 1, MAX_DEADLINE_MS)
    || !boundedInteger(captured.startDeadlineMs, 1, MAX_DEADLINE_MS)
    || !boundedInteger(captured.closeGraceMs, 1, MAX_DEADLINE_MS)
    || !boundedInteger(captured.metricsCounterLimit, 1, NUMBER_MAX_SAFE_INTEGER)
    || captured.maxConcurrentRequests > captured.maxConcurrentSockets
    || captured.maxConnectionStarts < captured.maxConcurrentSockets
    || captured.maxRequestStarts < captured.maxConcurrentRequests
    || captured.maxRequestStarts > captured.maxConnectionStarts
    || captured.headerDeadlineMs > captured.requestResponseDeadlineMs
    || captured.requestResponseDeadlineMs > captured.closeGraceMs
    || captured.tlsHandshakeDeadlineMs > captured.idleSocketDeadlineMs
    || captured.metricsCounterLimit
      < captured.maxConnectionStarts + captured.maxRequestStarts + METRIC_RESERVE
  ) return null;
  const result = {};
  for (let index = 0; index < LIMIT_KEYS.length; index += 1) {
    const key = LIMIT_KEYS[index];
    result[key] = captured[key];
  }
  return OBJECT_FREEZE(result);
}

function captureLifecycle(value) {
  const captured = exactDataObject(value, DOWNSTREAM_KEYS, true);
  if (
    captured === null
    || !safeCallable(captured.handle, true)
    || !safeCallable(captured.close, true)
  ) return null;
  return OBJECT_FREEZE({ handle: captured.handle, close: captured.close });
}

function captureDeadlineRuntime(value) {
  const captured = exactDataObject(value, DEADLINE_RUNTIME_KEYS, true);
  if (
    captured === null
    || !safeCallable(captured.schedule, true)
    || !safeCallable(captured.cancel, true)
  ) return null;
  return OBJECT_FREEZE({ schedule: captured.schedule, cancel: captured.cancel });
}

function captureServerCapability(value) {
  const captured = exactDataObject(value, SERVER_CAPABILITY_KEYS, true);
  if (captured === null) return null;
  for (let index = 0; index < SERVER_CAPABILITY_KEYS.length; index += 1) {
    if (!safeCallable(captured[SERVER_CAPABILITY_KEYS[index]], true)) return null;
  }
  return OBJECT_FREEZE({
    listen: captured.listen,
    close: captured.close,
    closeAllConnections: captured.closeAllConnections,
  });
}

function samePropertyDescriptor(left, right) {
  if (left === undefined || right === undefined) return left === right;
  if (left.configurable !== right.configurable || left.enumerable !== right.enumerable) {
    return false;
  }
  const leftIsData = OBJECT_HAS_OWN(left, 'value');
  if (leftIsData !== OBJECT_HAS_OWN(right, 'value')) return false;
  if (leftIsData) return left.writable === right.writable && left.value === right.value;
  return left.get === right.get && left.set === right.set;
}

function sameDataPropertyDescriptorSurface(left, right) {
  return left !== undefined
    && right !== undefined
    && OBJECT_HAS_OWN(left, 'value')
    && OBJECT_HAS_OWN(right, 'value')
    && left.configurable === right.configurable
    && left.enumerable === right.enumerable
    && left.writable === right.writable;
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

function isSameRealmNativePromise(value) {
  try {
    return value !== null
      && typeof value === 'object'
      && !REFLECT_APPLY(IS_PROXY, undefined, [value])
      && REFLECT_APPLY(IS_PROMISE, undefined, [value]) === true
      && REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [value]) === PROMISE_PROTOTYPE;
  } catch {
    return false;
  }
}

function isSameRealmGenuinePromise(value) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || REFLECT_APPLY(IS_PROXY, undefined, [value])
      || REFLECT_APPLY(IS_PROMISE, undefined, [value]) !== true
    ) return false;
    let prototype = REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [value]);
    for (let depth = 0; depth < MAX_PROMISE_PROTOTYPE_DEPTH; depth += 1) {
      if (prototype === PROMISE_PROTOTYPE) return true;
      if (
        prototype === null
        || (typeof prototype !== 'object' && typeof prototype !== 'function')
        || REFLECT_APPLY(IS_PROXY, undefined, [prototype])
      ) return false;
      prototype = REFLECT_APPLY(
        REFLECT_GET_PROTOTYPE_OF,
        NATIVE_REFLECT,
        [prototype],
      );
    }
    return false;
  } catch {
    return false;
  }
}

function isGenuinePromise(value) {
  try {
    return value !== null
      && typeof value === 'object'
      && !REFLECT_APPLY(IS_PROXY, undefined, [value])
      && REFLECT_APPLY(IS_PROMISE, undefined, [value]) === true;
  } catch {
    return false;
  }
}

function hasSafeDirectPromiseRoute(promise, constructorDescriptor) {
  if (constructorDescriptor !== undefined) {
    if (!OBJECT_HAS_OWN(constructorDescriptor, 'value')) return false;
    if (constructorDescriptor.value === undefined) return true;
    return constructorDescriptor.value === NATIVE_PROMISE
      && capturedNativePromiseRouteIsCurrent();
  }
  return capturedNativePromiseRouteIsCurrent();
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
  if (OBJECT_HAS_OWN(originalDescriptor, 'value') && originalDescriptor.value === undefined) {
    return null;
  }
  if (originalDescriptor.configurable === true) {
    return {
      configurable: true,
      enumerable: originalDescriptor.enumerable,
      writable: false,
      value: undefined,
    };
  }
  if (OBJECT_HAS_OWN(originalDescriptor, 'value') && originalDescriptor.writable === true) {
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
    const restored = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [promise, 'constructor'],
    );
    return samePropertyDescriptor(restored, originalDescriptor);
  } catch {
    return false;
  }
}

function containDiscardedPromiseRejection(promise) {
  if (!isSameRealmGenuinePromise(promise)) return false;
  let constructorDescriptor;
  let directRoute = false;
  try {
    constructorDescriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [promise, 'constructor'],
    );
    const promisePrototype = REFLECT_APPLY(
      REFLECT_GET_PROTOTYPE_OF,
      NATIVE_REFLECT,
      [promise],
    );
    directRoute = (
      promisePrototype === PROMISE_PROTOTYPE
      || constructorDescriptor !== undefined
    ) && hasSafeDirectPromiseRoute(promise, constructorDescriptor);
  } catch {
    return false;
  }
  if (directRoute) {
    try {
      REFLECT_APPLY(PROMISE_THEN, promise, [
        PROMISE_CONTAINMENT_NOOP,
        PROMISE_CONTAINMENT_NOOP,
      ]);
      return true;
    } catch {
      return false;
    }
  }
  const temporaryDescriptor = temporaryPromiseConstructorDescriptor(
    promise,
    constructorDescriptor,
  );
  if (temporaryDescriptor === null) return false;
  let installed = false;
  try {
    installed = REFLECT_APPLY(
      REFLECT_DEFINE_PROPERTY,
      NATIVE_REFLECT,
      [promise, 'constructor', temporaryDescriptor],
    );
    if (!installed) return false;
    const observedDescriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [promise, 'constructor'],
    );
    if (!samePropertyDescriptor(observedDescriptor, temporaryDescriptor)) {
      restorePromiseConstructorDescriptor(promise, constructorDescriptor);
      return false;
    }
  } catch {
    if (installed) restorePromiseConstructorDescriptor(promise, constructorDescriptor);
    return false;
  }
  let attached = false;
  try {
    REFLECT_APPLY(PROMISE_THEN, promise, [
      PROMISE_CONTAINMENT_NOOP,
      PROMISE_CONTAINMENT_NOOP,
    ]);
    attached = true;
  } catch {}
  const restored = restorePromiseConstructorDescriptor(promise, constructorDescriptor);
  return attached && restored;
}

function observeNativePromise(promise, fulfilled, rejected) {
  if (!isSameRealmNativePromise(promise)) return PROMISE_OBSERVATION.NOT_PROMISE;
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
    const observedDescriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [promise, 'constructor'],
    );
    if (!samePropertyDescriptor(observedDescriptor, temporaryDescriptor)) {
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

function ownOrInheritedValue(value, key) {
  try {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
      return undefined;
    }
    return value[key];
  } catch {
    return undefined;
  }
}

function captureDataProperty(value, key) {
  try {
    if (
      value === null
      || (typeof value !== 'object' && typeof value !== 'function')
      || REFLECT_APPLY(IS_PROXY, undefined, [value])
    ) return null;
    let owner = value;
    for (let depth = 0; depth < MAX_PROPERTY_PROTOTYPE_DEPTH; depth += 1) {
      if (
        owner === null
        || (typeof owner !== 'object' && typeof owner !== 'function')
        || REFLECT_APPLY(IS_PROXY, undefined, [owner])
      ) return null;
      const descriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [owner, key],
      );
      if (descriptor !== undefined) {
        if (!OBJECT_HAS_OWN(descriptor, 'value')) return null;
        return OBJECT_FREEZE({
          owner,
          descriptor: OBJECT_FREEZE(descriptor),
          value: descriptor.value,
        });
      }
      owner = REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [owner]);
    }
    return null;
  } catch {
    return null;
  }
}

function captureOwnDataProperty(value, key) {
  try {
    if (
      value === null
      || (typeof value !== 'object' && typeof value !== 'function')
      || REFLECT_APPLY(IS_PROXY, undefined, [value])
    ) return null;
    const descriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [value, key],
    );
    if (descriptor === undefined || !OBJECT_HAS_OWN(descriptor, 'value')) return null;
    return OBJECT_FREEZE({
      descriptor: OBJECT_FREEZE(descriptor),
      value: descriptor.value,
    });
  } catch {
    return null;
  }
}

function sameCapturedOwnDataProperty(value, key, captured) {
  if (captured === null) return false;
  const current = captureOwnDataProperty(value, key);
  return current !== null
    && samePropertyDescriptor(captured.descriptor, current.descriptor);
}

function sameCapturedDataProperty(value, key, captured) {
  if (captured === null) return false;
  const current = captureDataProperty(value, key);
  return current !== null
    && current.owner === captured.owner
    && samePropertyDescriptor(captured.descriptor, current.descriptor);
}

function capturePropertyRoute(value, key) {
  try {
    if (
      value === null
      || (typeof value !== 'object' && typeof value !== 'function')
      || REFLECT_APPLY(IS_PROXY, undefined, [value])
    ) return null;
    let owner = value;
    for (let depth = 0; depth < MAX_PROPERTY_PROTOTYPE_DEPTH; depth += 1) {
      if (
        owner === null
        || (typeof owner !== 'object' && typeof owner !== 'function')
        || REFLECT_APPLY(IS_PROXY, undefined, [owner])
      ) return null;
      const descriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [owner, key],
      );
      if (descriptor !== undefined) {
        return OBJECT_FREEZE({ owner, descriptor: OBJECT_FREEZE(descriptor) });
      }
      owner = REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [owner]);
    }
    return null;
  } catch {
    return null;
  }
}

function captureResponseTerminalProperty(response, key, nativeDescriptor, backingKey) {
  const route = capturePropertyRoute(response, key);
  if (route === null) return null;
  if (OBJECT_HAS_OWN(route.descriptor, 'value')) {
    if (route.owner !== response || route.descriptor.value !== false) return null;
    return OBJECT_FREEZE({ route, backing: null });
  }
  if (
    route.owner !== OUTGOING_MESSAGE_PROTOTYPE
    || nativeDescriptor === undefined
    || OBJECT_HAS_OWN(nativeDescriptor, 'value')
    || !safeCallable(nativeDescriptor.get)
    || nativeDescriptor.set !== undefined
    || !samePropertyDescriptor(nativeDescriptor, route.descriptor)
  ) return null;
  const backing = captureDataProperty(response, backingKey);
  const expectedBacking = backingKey === '_header' ? null : false;
  if (
    backing === null
    || backing.owner !== response
    || backing.value !== expectedBacking
  ) return null;
  try {
    if (REFLECT_APPLY(nativeDescriptor.get, response, []) !== false) return null;
  } catch {
    return null;
  }
  return OBJECT_FREEZE({ route, backing });
}

function sameResponseTerminalProperty(
  response,
  key,
  captured,
  nativeDescriptor,
  backingKey,
) {
  if (captured === null) return false;
  const route = capturePropertyRoute(response, key);
  if (
    route === null
    || route.owner !== captured.route.owner
    || !samePropertyDescriptor(captured.route.descriptor, route.descriptor)
  ) return false;
  if (captured.backing === null) return true;
  if (
    route.owner !== OUTGOING_MESSAGE_PROTOTYPE
    || nativeDescriptor === undefined
    || !samePropertyDescriptor(nativeDescriptor, route.descriptor)
    || !sameCapturedDataProperty(response, backingKey, captured.backing)
  ) return false;
  try {
    return REFLECT_APPLY(nativeDescriptor.get, response, []) === false;
  } catch {
    return false;
  }
}

function captureEmitter(value) {
  const once = captureDataProperty(value, 'once');
  const removeListener = captureDataProperty(value, 'removeListener');
  if (
    once === null
    || removeListener === null
    || !safeCallable(once.value)
    || !safeCallable(removeListener.value)
  ) return null;
  return OBJECT_FREEZE({ once: once.value, removeListener: removeListener.value });
}

function captureResponseEmitter(value) {
  const on = captureDataProperty(value, 'on');
  const removeListener = captureDataProperty(value, 'removeListener');
  if (
    on === null
    || removeListener === null
    || on.value !== EVENT_EMITTER_ON
    || removeListener.value !== EVENT_EMITTER_REMOVE_LISTENER
  ) return null;
  return OBJECT_FREEZE({
    on: EVENT_EMITTER_ON,
    removeListener: EVENT_EMITTER_REMOVE_LISTENER,
    onProperty: on,
    removeListenerProperty: removeListener,
  });
}

function sameResponseMethodSurface(response, emitter, setHeader) {
  return emitter !== null
    && sameCapturedDataProperty(response, 'setHeader', setHeader)
    && sameCapturedDataProperty(response, 'on', emitter.onProperty)
    && sameCapturedDataProperty(
      response,
      'removeListener',
      emitter.removeListenerProperty,
    );
}

function captureResponseBookkeeping(response) {
  const eventsCount = captureDataProperty(response, '_eventsCount');
  const maxListeners = captureDataProperty(response, '_maxListeners');
  if (
    eventsCount === null
    || maxListeners === null
    || eventsCount.owner !== response
    || maxListeners.owner !== response
    || !NUMBER_IS_SAFE_INTEGER(eventsCount.value)
    || eventsCount.value < 0
    || eventsCount.descriptor.writable !== true
    || (
      maxListeners.value !== undefined
      && (
        !NUMBER_IS_SAFE_INTEGER(maxListeners.value)
        || maxListeners.value < 0
      )
    )
  ) return null;
  return OBJECT_FREEZE({ eventsCount, maxListeners });
}

function captureResponseAdmission(response) {
  try {
    if (
      response === null
      || (typeof response !== 'object' && typeof response !== 'function')
      || REFLECT_APPLY(IS_PROXY, undefined, [response])
    ) return null;
    const finished = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [response, 'finished'],
    );
    const destroyed = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [response, 'destroyed'],
    );
    const events = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [response, '_events'],
    );
    const headersSent = captureResponseTerminalProperty(
      response,
      'headersSent',
      OUTGOING_MESSAGE_HEADERS_SENT_DESCRIPTOR,
      '_header',
    );
    const writableEnded = captureResponseTerminalProperty(
      response,
      'writableEnded',
      OUTGOING_MESSAGE_WRITABLE_ENDED_DESCRIPTOR,
      'finished',
    );
    const bookkeeping = captureResponseBookkeeping(response);
    if (
      finished === undefined
      || destroyed === undefined
      || events === undefined
      || headersSent === null
      || writableEnded === null
      || bookkeeping === null
      || !OBJECT_HAS_OWN(finished, 'value')
      || !OBJECT_HAS_OWN(destroyed, 'value')
      || !OBJECT_HAS_OWN(events, 'value')
      || finished.value !== false
      || destroyed.value !== false
      || events.value === null
      || typeof events.value !== 'object'
      || REFLECT_APPLY(IS_PROXY, undefined, [events.value])
      || REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [events.value]) !== null
      || !REFLECT_APPLY(OBJECT_IS_EXTENSIBLE, NATIVE_OBJECT, [events.value])
      || REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [events.value, 'newListener'],
      ) !== undefined
      || REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [events.value, 'removeListener'],
      ) !== undefined
    ) return null;
    return OBJECT_FREEZE({
      finished: OBJECT_FREEZE(finished),
      destroyed: OBJECT_FREEZE(destroyed),
      headersSent,
      writableEnded,
      events: OBJECT_FREEZE(events),
      eventsCount: bookkeeping.eventsCount,
      maxListeners: bookkeeping.maxListeners,
    });
  } catch {
    return null;
  }
}

function sameResponseAdmission(
  response,
  captured,
  expectedEventsCount,
  expectedMaxListeners,
) {
  if (
    captured === null
    || expectedEventsCount === null
    || expectedMaxListeners === null
  ) return false;
  try {
    const finished = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [response, 'finished'],
    );
    const destroyed = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [response, 'destroyed'],
    );
    const events = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [response, '_events'],
    );
    return samePropertyDescriptor(captured.finished, finished)
      && samePropertyDescriptor(captured.destroyed, destroyed)
      && sameResponseTerminalProperty(
        response,
        'headersSent',
        captured.headersSent,
        OUTGOING_MESSAGE_HEADERS_SENT_DESCRIPTOR,
        '_header',
      )
      && sameResponseTerminalProperty(
        response,
        'writableEnded',
        captured.writableEnded,
        OUTGOING_MESSAGE_WRITABLE_ENDED_DESCRIPTOR,
        'finished',
      )
      && samePropertyDescriptor(captured.events, events)
      && sameCapturedDataProperty(
        response,
        '_eventsCount',
        expectedEventsCount,
      )
      && sameCapturedDataProperty(
        response,
        '_maxListeners',
        expectedMaxListeners,
      );
  } catch {
    return false;
  }
}

function scanRawHeaders(rawHeaders, authority, limits) {
  try {
    if (
      !REFLECT_APPLY(ARRAY_IS_ARRAY, NATIVE_ARRAY, [rawHeaders])
      || REFLECT_APPLY(IS_PROXY, undefined, [rawHeaders])
      || REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [rawHeaders])
        !== ARRAY_PROTOTYPE
    ) return null;
    const lengthDescriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [rawHeaders, 'length'],
    );
    if (
      lengthDescriptor === undefined
      || !OBJECT_HAS_OWN(lengthDescriptor, 'value')
      || !NUMBER_IS_SAFE_INTEGER(lengthDescriptor.value)
      || lengthDescriptor.value < 2
      || lengthDescriptor.value % 2 !== 0
      || lengthDescriptor.value / 2 > limits.maxHeaderCount
    ) return null;
    const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, NATIVE_REFLECT, [rawHeaders]);
    if (keys.length !== lengthDescriptor.value + 1 || keys[keys.length - 1] !== 'length') {
      return null;
    }
    const names = new NATIVE_SET();
    const descriptors = [];
    let hostCount = 0;
    let bytes = 2;
    for (let index = 0; index < lengthDescriptor.value; index += 2) {
      const nameKey = STRING_FROM(index);
      const valueKey = STRING_FROM(index + 1);
      if (keys[index] !== nameKey || keys[index + 1] !== valueKey) return null;
      const nameDescriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [rawHeaders, nameKey],
      );
      const valueDescriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [rawHeaders, valueKey],
      );
      if (
        nameDescriptor === undefined
        || valueDescriptor === undefined
        || nameDescriptor.enumerable !== true
        || valueDescriptor.enumerable !== true
        || !OBJECT_HAS_OWN(nameDescriptor, 'value')
        || !OBJECT_HAS_OWN(valueDescriptor, 'value')
        || typeof nameDescriptor.value !== 'string'
        || typeof valueDescriptor.value !== 'string'
        || !regexpMatches(HEADER_NAME, nameDescriptor.value)
        || !regexpMatches(HEADER_VALUE, valueDescriptor.value)
      ) return null;
      descriptors.push(OBJECT_FREEZE(nameDescriptor), OBJECT_FREEZE(valueDescriptor));
      const lowerName = REFLECT_APPLY(
        STRING_TO_LOWER_CASE,
        nameDescriptor.value,
        [],
      );
      if (setHas(names, lowerName)) return null;
      setAdd(names, lowerName);
      bytes += byteLength(nameDescriptor.value) + byteLength(valueDescriptor.value) + 4;
      if (bytes > limits.maxHeaderBytes) return null;
      if (lowerName === 'host') {
        hostCount += 1;
        if (valueDescriptor.value !== authority) return null;
      }
      if (
        lowerName === 'expect'
        || lowerName === 'upgrade'
        || lowerName === 'transfer-encoding'
        || (lowerName === 'connection'
          && REFLECT_APPLY(STRING_TO_LOWER_CASE, valueDescriptor.value, []) !== 'close')
      ) return null;
    }
    if (hostCount !== 1) return null;
    return OBJECT_FREEZE({
      rawHeaders,
      lengthDescriptor: OBJECT_FREEZE(lengthDescriptor),
      descriptors: OBJECT_FREEZE(descriptors),
    });
  } catch {
    return null;
  }
}

function captureRequestAdmission(request, authority, limits, allowedTargets) {
  try {
    if (
      request === null
      || (typeof request !== 'object' && typeof request !== 'function')
      || REFLECT_APPLY(IS_PROXY, undefined, [request])
    ) return null;
    const descriptors = REFLECT_APPLY(OBJECT_CREATE, NATIVE_OBJECT, [null]);
    for (const key of ['socket', 'method', 'url', 'httpVersion', 'rawHeaders']) {
      const descriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [request, key],
      );
      if (descriptor === undefined || !OBJECT_HAS_OWN(descriptor, 'value')) return null;
      descriptors[key] = OBJECT_FREEZE(descriptor);
    }
    const rawHeaders = scanRawHeaders(descriptors.rawHeaders.value, authority, limits);
    const protocolValid = descriptors.method.value === 'POST'
      && typeof descriptors.url.value === 'string'
      && setHas(allowedTargets, descriptors.url.value)
      && descriptors.httpVersion.value === '1.1'
      && rawHeaders !== null;
    return OBJECT_FREEZE({
      request,
      descriptors: OBJECT_FREEZE(descriptors),
      rawHeaders,
      protocolValid,
      socket: descriptors.socket.value,
    });
  } catch {
    return null;
  }
}

function sameRequestAdmission(left, right) {
  if (
    left === null
    || right === null
    || left.request !== right.request
    || left.socket !== right.socket
    || left.protocolValid !== true
    || right.protocolValid !== true
    || left.rawHeaders === null
    || right.rawHeaders === null
    || left.rawHeaders.rawHeaders !== right.rawHeaders.rawHeaders
    || !samePropertyDescriptor(
      left.rawHeaders.lengthDescriptor,
      right.rawHeaders.lengthDescriptor,
    )
    || left.rawHeaders.descriptors.length !== right.rawHeaders.descriptors.length
  ) return false;
  for (const key of ['socket', 'method', 'url', 'httpVersion', 'rawHeaders']) {
    if (!samePropertyDescriptor(left.descriptors[key], right.descriptors[key])) return false;
  }
  for (let index = 0; index < left.rawHeaders.descriptors.length; index += 1) {
    if (!samePropertyDescriptor(
      left.rawHeaders.descriptors[index],
      right.rawHeaders.descriptors[index],
    )) return false;
  }
  return true;
}

/**
 * Creates one default-off owner for a bounded HTTPS generation. The injected
 * factory is the sole trusted seam for server-authentication material and bind
 * configuration; construction never invokes it.
 */
export function createServiceCreditBoundedHttpsIngressOwner(options) {
  if (arguments.length !== 1) throw failure(CODE.invalidConfiguration);
  let configuration = exactDataObject(options, CONFIGURATION_KEYS);
  const origin = configuration === null ? null : captureOrigin(configuration.origin);
  const requestTargets = configuration === null
    ? null
    : captureRequestTargets(configuration.requestTargets);
  const generation = configuration === null
    ? null
    : captureGeneration(configuration.generation);
  const limits = configuration === null ? null : captureLimits(configuration.limits);
  let downstream = configuration === null
    ? null
    : captureLifecycle(configuration.downstream);
  let deadlineRuntime = configuration === null
    ? null
    : captureDeadlineRuntime(configuration.deadlineRuntime);
  if (
    configuration === null
    || origin === null
    || requestTargets === null
    || generation === null
    || limits === null
    || downstream === null
    || deadlineRuntime === null
    || !safeCallable(configuration.httpsServerFactory, true)
  ) throw failure(CODE.invalidConfiguration);

  let trustedFactory = configuration.httpsServerFactory;
  let downstreamHandle = downstream.handle;
  let downstreamClose = downstream.close;
  let schedule = deadlineRuntime.schedule;
  let cancel = deadlineRuntime.cancel;
  configuration = null;
  downstream = null;
  deadlineRuntime = null;
  options = null;
  const allowedTargets = new NATIVE_SET();
  for (let index = 0; index < requestTargets.length; index += 1) {
    setAdd(allowedTargets, requestTargets[index]);
  }

  const serverOptions = OBJECT_FREEZE({
    minVersion: 'TLSv1.3',
    maxVersion: 'TLSv1.3',
    ALPNProtocols: OBJECT_FREEZE(['http/1.1']),
    requestCert: false,
    handshakeTimeout: limits.tlsHandshakeDeadlineMs,
    maxHeaderSize: limits.maxHeaderBytes,
    insecureHTTPParser: false,
    requireHostHeader: true,
    joinDuplicateHeaders: false,
    rejectNonStandardBodyWrites: true,
    headersTimeout: limits.headerDeadlineMs,
    requestTimeout: limits.requestResponseDeadlineMs,
    keepAliveTimeout: limits.idleSocketDeadlineMs,
    maxHeadersCount: limits.maxHeaderCount,
    maxRequestsPerSocket: 1,
    maxConnections: limits.maxConcurrentSockets,
    timeout: limits.idleSocketDeadlineMs,
  });

  let phase = PHASE.DORMANT;
  let admissionOpen = true;
  let acceptingConnections = true;
  let acceptingRequests = true;
  let permanentUncertainty = false;
  let serverCapability = null;
  let listenerCloseRequested = false;
  let listenerClosed = false;
  let closeAllInvoked = false;
  let factoryReturned = false;
  let listenInvoked = false;
  let listenReturned = false;
  let listeningObserved = false;
  let startCapability = null;
  let startPromise = null;
  let startSettled = false;
  let closeCapability = null;
  let closePromise = null;
  let closeTerminal = false;
  let terminalMetricsSnapshot = null;
  let downstreamCloseInvoked = false;
  let downstreamCloseSettled = false;
  let downstreamCloseClean = false;
  let timerRuntimeOperationsInFlight = 0;
  let rawConnectionOperationsInFlight = 0;

  const timerState = { start: null, close: null };
  const ownedTimers = new NATIVE_SET();
  const trackedSockets = new NATIVE_SET();
  const acceptedConnections = new NATIVE_SET();
  const connectionAdmissions = new NATIVE_MAP();
  const pendingSecureAdmissions = new NATIVE_SET();
  const socketCapabilities = new NATIVE_WEAK_MAP();
  const seenSecureSockets = new NATIVE_WEAK_SET();
  const secureSockets = new NATIVE_MAP();
  const activeRequests = new NATIVE_SET();
  const activeHandlers = new NATIVE_SET();
  const downstreamOwnedRequests = new NATIVE_SET();
  const activeAbortCapabilities = new NATIVE_SET();
  const callbackDispatchCell = { target: INERT_CALLBACK_DISPATCH };

  const counters = {
    startAttempts: 0,
    startSucceeded: 0,
    startUncertain: 0,
    connectionStarts: 0,
    connectionsAccepted: 0,
    connectionsRejected: 0,
    tlsRejected: 0,
    requestStarts: 0,
    requestsAdmitted: 0,
    requestsRejected: 0,
    handlersSettled: 0,
    handlerFailures: 0,
    aborts: 0,
    socketsDestroyed: 0,
    deadlineExpirations: 0,
    listenerErrors: 0,
    closeStarted: 0,
    closeClean: 0,
    closeUncertain: 0,
  };

  function increment(name) {
    if (closeTerminal) return false;
    const current = counters[name];
    if (!NUMBER_IS_SAFE_INTEGER(current) || current < 0 || current >= limits.metricsCounterLimit) {
      permanentUncertainty = true;
      admissionOpen = false;
      acceptingConnections = false;
      acceptingRequests = false;
      if (!closeTerminal) phase = PHASE.QUARANTINED;
      return false;
    }
    counters[name] = current + 1;
    return true;
  }

  function cancelHandle(handle, cancellationOperation = cancel) {
    let result;
    try {
      result = REFLECT_APPLY(cancellationOperation, undefined, [handle]);
    } catch {
      markPermanentUncertainty();
      return false;
    }
    if (isGenuinePromise(result)) containDiscardedPromiseRejection(result);
    const cancellationClean = result === true;
    if (!cancellationClean) markPermanentUncertainty();
    return cancellationClean;
  }

  function cancelTicket(owner, slot) {
    const ticket = owner[slot];
    if (ticket === null) return true;
    if (owner[slot] === ticket) owner[slot] = null;
    if (ticket.active !== true) return true;
    ticket.active = false;
    setDelete(ownedTimers, ticket);
    if (!ticket.handleReady) return true;
    timerRuntimeOperationsInFlight += 1;
    const cancellationClean = cancelHandle(ticket.handle);
    timerRuntimeOperationsInFlight -= 1;
    return cancellationClean;
  }

  function scheduleTicket(owner, slot, milliseconds, callback) {
    const ticket = {
      active: true,
      handle: undefined,
      handleReady: false,
    };
    const cancellationOperation = cancel;
    owner[slot] = ticket;
    setAdd(ownedTimers, ticket);
    const onDeadline = OBJECT_FREEZE(() => {
      if (owner[slot] !== ticket || ticket.active !== true) return;
      ticket.active = false;
      owner[slot] = null;
      setDelete(ownedTimers, ticket);
      REFLECT_APPLY(callback, undefined, []);
    });
    let handle;
    timerRuntimeOperationsInFlight += 1;
    try {
      handle = REFLECT_APPLY(schedule, undefined, [onDeadline, milliseconds]);
    } catch {
      if (owner[slot] === ticket) owner[slot] = null;
      ticket.active = false;
      setDelete(ownedTimers, ticket);
      timerRuntimeOperationsInFlight -= 1;
      return false;
    }
    if (isGenuinePromise(handle)) {
      containDiscardedPromiseRejection(handle);
      if (owner[slot] === ticket) owner[slot] = null;
      ticket.active = false;
      setDelete(ownedTimers, ticket);
      timerRuntimeOperationsInFlight -= 1;
      return false;
    }
    if (handle === null || handle === undefined) {
      if (owner[slot] === ticket) owner[slot] = null;
      ticket.active = false;
      setDelete(ownedTimers, ticket);
      timerRuntimeOperationsInFlight -= 1;
      return false;
    }
    if (owner[slot] === ticket && ticket.active === true) {
      ticket.handle = handle;
      ticket.handleReady = true;
      timerRuntimeOperationsInFlight -= 1;
      return true;
    }
    ticket.active = false;
    setDelete(ownedTimers, ticket);
    const cancellationClean = cancelHandle(handle, cancellationOperation);
    timerRuntimeOperationsInFlight -= 1;
    return cancellationClean;
  }

  function markPermanentUncertainty() {
    permanentUncertainty = true;
    admissionOpen = false;
    acceptingConnections = false;
    acceptingRequests = false;
    if (!closeTerminal && phase !== PHASE.CLOSED) phase = PHASE.QUARANTINED;
  }

  function deactivateAbortCapability(abortCapabilityCell) {
    if (abortCapabilityCell === null) return;
    abortCapabilityCell.operation = null;
    abortCapabilityCell.socket = null;
    abortCapabilityCell.context = null;
    setDelete(activeAbortCapabilities, abortCapabilityCell);
  }

  function captureSocketCapability(socket) {
    try {
      if (
        socket === null
        || (typeof socket !== 'object' && typeof socket !== 'function')
        || REFLECT_APPLY(IS_PROXY, undefined, [socket])
        || closeTerminal
      ) return null;
      const existing = weakMapGet(socketCapabilities, socket);
      if (existing !== undefined) return existing;
      const emitter = captureEmitter(socket);
      const destroy = ownOrInheritedValue(socket, 'destroy');
      if (emitter === null || !safeCallable(destroy) || closeTerminal) return null;
      const reentrantCapability = weakMapGet(socketCapabilities, socket);
      if (reentrantCapability !== undefined) return reentrantCapability;
      const capability = {
        socket,
        emitter,
        destroy,
        destroyRequested: false,
        tracked: false,
        listenersInstalled: false,
        closed: false,
        onClose: null,
        onError: null,
      };
      if (closeTerminal) return null;
      weakMapSet(socketCapabilities, socket, capability);
      return capability;
    } catch {
      return null;
    }
  }

  function removeListener(target, emitter, name, callback) {
    if (emitter === null || callback === null) return true;
    try {
      REFLECT_APPLY(emitter.removeListener, target, [name, callback]);
      return true;
    } catch {
      markPermanentUncertainty();
      return false;
    }
  }

  function removeSocketSetupListenersBestEffort(
    socket,
    emitter,
    onClose,
    onError,
  ) {
    for (const [name, callback] of [['close', onClose], ['error', onError]]) {
      try {
        REFLECT_APPLY(emitter.removeListener, socket, [name, callback]);
      } catch {
        // Setup cleanup cannot revise an already fixed terminal result.
      }
    }
  }

  function socketSetupOwned(socket, capability) {
    return !closeTerminal
      && closePromise === null
      && !permanentUncertainty
      && setHas(trackedSockets, socket)
      && weakMapGet(socketCapabilities, socket) === capability
      && capability.socket === socket
      && capability.closed === false
      && capability.destroyRequested === false
      && capability.tracked === true;
  }

  function maybeFinishClose() {
    if (closeCapability === null || closeTerminal) return;
    if (permanentUncertainty) {
      finishCloseUncertain();
      return;
    }
    if (timerRuntimeOperationsInFlight !== 0) return;
    if (rawConnectionOperationsInFlight !== 0) return;
    if (
      !downstreamCloseSettled
      || !downstreamCloseClean
      || !listenerClosed
      || setSize(trackedSockets) !== 0
      || setSize(acceptedConnections) !== 0
      || mapSize(connectionAdmissions) !== 0
      || setSize(pendingSecureAdmissions) !== 0
      || mapSize(secureSockets) !== 0
      || setSize(activeRequests) !== 0
      || setSize(activeHandlers) !== 0
      || setSize(downstreamOwnedRequests) !== 0
    ) return;
    const cancellationClean = cancelTicket(timerState, 'close');
    if (closeTerminal) return;
    if (permanentUncertainty || !cancellationClean || setSize(ownedTimers) !== 0) {
      markPermanentUncertainty();
      finishCloseUncertain();
      return;
    }
    if (!increment('closeClean')) {
      finishCloseUncertain();
      return;
    }
    phase = PHASE.CLOSED;
    closeTerminal = true;
    const terminalCloseCapability = closeCapability;
    const terminalCleanup = detachTerminalOwnerReferences();
    terminalMetricsSnapshot = captureMetricsSnapshot();
    terminalCloseCapability.resolve(OBJECT_FREEZE({ status: 'CLOSED' }));
    runBestEffortTerminalCleanup(terminalCleanup);
  }

  function destroySocket(socket) {
    if (closeTerminal) return false;
    const capability = captureSocketCapability(socket);
    if (capability === null) {
      markPermanentUncertainty();
      maybeFinishClose();
      return false;
    }
    if (capability.closed || capability.destroyRequested) return true;
    capability.destroyRequested = true;
    increment('socketsDestroyed');
    try {
      REFLECT_APPLY(capability.destroy, socket, []);
      return true;
    } catch {
      markPermanentUncertainty();
      maybeFinishClose();
      return false;
    }
  }

  function removeResponseListener(
    requestState,
    name,
    callback,
    slotSnapshot,
    eventObserved,
  ) {
    if (slotSnapshot === null) return true;
    if (callback === null) {
      markPermanentUncertainty();
      destroySocket(requestState.socket);
      return false;
    }
    let matches = 0;
    for (let index = 0; index < slotSnapshot.entries.length; index += 1) {
      if (slotSnapshot.entries[index].listener === callback) matches += 1;
    }
    if (
      matches !== 1
      || slotSnapshot.entries[slotSnapshot.entries.length - 1].listener !== callback
    ) {
      markPermanentUncertainty();
      destroySocket(requestState.socket);
      return false;
    }
    const currentSlot = captureResponseEventSlot(requestState, name);
    const exactSnapshot = sameResponseEventSlotSnapshot(slotSnapshot, currentSlot);
    const settledSubset = !exactSnapshot
      && eventObserved
      && sameSettledResponseEventSlotSubset(slotSnapshot, currentSlot, callback);
    if (exactSnapshot || settledSubset) {
      const removed = removeListener(
        requestState.response,
        requestState.responseEmitter,
        name,
        callback,
      );
      if (!removed) destroySocket(requestState.socket);
      return removed;
    }
    markPermanentUncertainty();
    destroySocket(requestState.socket);
    return false;
  }

  function cleanupRequest(requestState) {
    cancelTicket(requestState, 'deadline');
    removeResponseListener(
      requestState,
      'finish',
      requestState.onResponseFinish,
      requestState.responseFinishSlotSnapshot,
      requestState.responseFinishObserved,
    );
    removeResponseListener(
      requestState,
      'close',
      requestState.onResponseClose,
      requestState.responseCloseSlotSnapshot,
      requestState.responseCloseObserved,
    );
    removeResponseListener(
      requestState,
      'error',
      requestState.onResponseError,
      requestState.responseErrorSlotSnapshot,
      requestState.responseErrorObserved,
    );
    requestState.socket = null;
    requestState.request = null;
    requestState.response = null;
    requestState.responseEmitter = null;
    requestState.onResponseFinish = null;
    requestState.onResponseClose = null;
    requestState.onResponseError = null;
    requestState.responseFinishSlotSnapshot = null;
    requestState.responseCloseSlotSnapshot = null;
    requestState.responseErrorSlotSnapshot = null;
    requestState.transportContext = null;
    requestState.requestAdmission = null;
    requestState.responseAdmission = null;
    requestState.responseEventsCount = null;
    requestState.responseMaxListeners = null;
    requestState.socketCapability = null;
    requestState.secureState = null;
    requestState.responseSetHeader = null;
    requestState.responseSetHeaderProperty = null;
    requestState.responseListenersInstalled = false;
    requestState.responseFinishObserved = false;
    requestState.responseCloseObserved = false;
    requestState.responseErrorObserved = false;
    setDelete(downstreamOwnedRequests, requestState);
  }

  function maybeCompleteRequest(requestState) {
    if (
      requestState.terminalDetached
      || closeTerminal
      || requestState.completed
      || !requestState.handlerSettled
      || !requestState.responseSettled
    ) return;
    requestState.completed = true;
    cleanupRequest(requestState);
    setDelete(activeRequests, requestState);
    maybeFinishClose();
  }

  function settleResponse(requestState, clean) {
    if (requestState.terminalDetached || closeTerminal || requestState.responseSettled) return;
    requestState.responseSettled = true;
    requestState.responseClean = clean;
    maybeCompleteRequest(requestState);
  }

  function onSocketClose(socket) {
    if (closeTerminal) return;
    const capability = weakMapGet(socketCapabilities, socket);
    if (capability !== undefined) {
      if (capability.closed) return;
      capability.closed = true;
      capability.tracked = false;
      capability.listenersInstalled = false;
      removeListener(socket, capability.emitter, 'close', capability.onClose);
      removeListener(socket, capability.emitter, 'error', capability.onError);
      capability.onClose = null;
      capability.onError = null;
    }
    setDelete(trackedSockets, socket);
    setDelete(acceptedConnections, socket);
    const connectionAdmission = mapGet(connectionAdmissions, socket);
    if (connectionAdmission !== undefined) {
      setDelete(pendingSecureAdmissions, connectionAdmission);
      mapDelete(connectionAdmissions, socket);
    }
    const secureState = mapGet(secureSockets, socket);
    if (secureState !== undefined) {
      cancelTicket(secureState, 'headerDeadline');
      mapDelete(secureSockets, socket);
      deactivateAbortCapability(secureState.abortCapabilityCell);
      if (secureState.requestState !== null) settleResponse(secureState.requestState, false);
    }
    maybeFinishClose();
  }

  function trackSocket(socket) {
    if (closeTerminal || closePromise !== null) return null;
    if (!setHas(trackedSockets, socket)) setAdd(trackedSockets, socket);
    if (closeTerminal || closePromise !== null || !setHas(trackedSockets, socket)) {
      return null;
    }
    const capability = captureSocketCapability(socket);
    if (capability === null) return null;
    if (
      closeTerminal
      || closePromise !== null
      || weakMapGet(socketCapabilities, socket) !== capability
      || !setHas(trackedSockets, socket)
    ) return null;
    if (capability.closed || capability.destroyRequested) return null;
    if (capability.tracked) {
      if (socketSetupOwned(socket, capability) && capability.listenersInstalled) {
        return capability;
      }
      markPermanentUncertainty();
      return null;
    }
    const onClose = OBJECT_FREEZE(() => onSocketClose(socket));
    const onError = OBJECT_FREEZE(() => {
      if (closeTerminal) return;
      destroySocket(socket);
    });
    const emitter = capability.emitter;
    capability.onClose = onClose;
    capability.onError = onError;
    capability.tracked = true;
    try {
      REFLECT_APPLY(emitter.once, socket, ['close', onClose]);
      if (!socketSetupOwned(socket, capability)) {
        removeSocketSetupListenersBestEffort(
          socket,
          emitter,
          onClose,
          onError,
        );
        return null;
      }
      REFLECT_APPLY(emitter.once, socket, ['error', onError]);
    } catch {
      removeSocketSetupListenersBestEffort(socket, emitter, onClose, onError);
      if (!closeTerminal) {
        capability.onClose = null;
        capability.onError = null;
        capability.listenersInstalled = false;
        if (capability.closed) {
          capability.tracked = false;
          setDelete(trackedSockets, socket);
        }
      }
      return null;
    }
    if (!socketSetupOwned(socket, capability)) {
      removeSocketSetupListenersBestEffort(socket, emitter, onClose, onError);
      return null;
    }
    capability.listenersInstalled = true;
    return capability;
  }

  function markFirstSecureSocketAppearance(socket) {
    try {
      if (
        socket === null
        || (typeof socket !== 'object' && typeof socket !== 'function')
        || REFLECT_APPLY(IS_PROXY, undefined, [socket])
        || REFLECT_APPLY(WEAK_SET_HAS, seenSecureSockets, [socket])
      ) return false;
      REFLECT_APPLY(WEAK_SET_ADD, seenSecureSockets, [socket]);
      return true;
    } catch {
      return false;
    }
  }

  function sendUnavailable(response) {
    try {
      if (
        response === null
        || (typeof response !== 'object' && typeof response !== 'function')
        || ownOrInheritedValue(response, 'headersSent') === true
        || ownOrInheritedValue(response, 'writableEnded') === true
      ) return false;
      const setHeader = ownOrInheritedValue(response, 'setHeader');
      const end = ownOrInheritedValue(response, 'end');
      if (!safeCallable(setHeader) || !safeCallable(end)) return false;
      const body = REFLECT_APPLY(BUFFER_FROM, NATIVE_BUFFER, [FAILURE_TEXT, 'utf8']);
      response.statusCode = 503;
      REFLECT_APPLY(setHeader, response, ['Cache-Control', 'private, no-store, max-age=0']);
      REFLECT_APPLY(setHeader, response, ['Connection', 'close']);
      REFLECT_APPLY(setHeader, response, ['Content-Length', STRING_FROM(body.length)]);
      REFLECT_APPLY(setHeader, response, ['Content-Type', 'application/json']);
      REFLECT_APPLY(setHeader, response, ['X-Content-Type-Options', 'nosniff']);
      REFLECT_APPLY(end, response, [body]);
      return true;
    } catch {
      return false;
    }
  }

  function rejectParsed(response, socket, destroy = false) {
    increment('requestsRejected');
    const framed = sendUnavailable(response);
    if (destroy || !framed) destroySocket(socket);
    return framed;
  }

  function stopAccepting() {
    acceptingConnections = false;
    if (serverCapability === null || listenerClosed || listenerCloseRequested) return true;
    listenerCloseRequested = true;
    let result;
    try {
      result = REFLECT_APPLY(serverCapability.close, undefined, []);
    } catch {
      markPermanentUncertainty();
      return false;
    }
    if (result !== undefined) {
      if (isGenuinePromise(result)) containDiscardedPromiseRejection(result);
      markPermanentUncertainty();
      return false;
    }
    return true;
  }

  function detachTerminalTicket(owner, slot, cancellationHandles) {
    const ticket = owner[slot];
    if (ticket === null) return;
    if (owner[slot] === ticket) owner[slot] = null;
    const cancellationRequired = ticket.active === true && ticket.handleReady === true;
    ticket.active = false;
    setDelete(ownedTimers, ticket);
    if (cancellationRequired) {
      cancellationHandles[cancellationHandles.length] = ticket.handle;
    }
    ticket.handle = undefined;
    ticket.handleReady = false;
  }

  function detachTerminalOwnerReferences() {
    const cleanup = {
      cancelOperation: cancel,
      cancellationHandles: [],
      responseOperations: [],
      socketOperations: [],
    };
    const cancellationHandles = cleanup.cancellationHandles;
    const responseOperations = cleanup.responseOperations;
    const socketOperations = cleanup.socketOperations;
    const terminalRequests = new NATIVE_SET();
    const terminalSecureStates = new NATIVE_SET();
    const terminalAdmissions = new NATIVE_SET();
    const terminalSockets = new NATIVE_SET();

    callbackDispatchCell.target = INERT_CALLBACK_DISPATCH;

    let values = snapshotSetValues(activeRequests);
    for (let index = 0; index < values.length; index += 1) {
      setAdd(terminalRequests, values[index]);
    }
    values = snapshotSetValues(activeHandlers);
    for (let index = 0; index < values.length; index += 1) {
      setAdd(terminalRequests, values[index]);
    }
    values = snapshotSetValues(downstreamOwnedRequests);
    for (let index = 0; index < values.length; index += 1) {
      setAdd(terminalRequests, values[index]);
    }
    values = snapshotMapValues(secureSockets);
    for (let index = 0; index < values.length; index += 1) {
      setAdd(terminalSecureStates, values[index]);
    }
    values = snapshotMapValues(connectionAdmissions);
    for (let index = 0; index < values.length; index += 1) {
      setAdd(terminalAdmissions, values[index]);
    }
    values = snapshotSetValues(pendingSecureAdmissions);
    for (let index = 0; index < values.length; index += 1) {
      setAdd(terminalAdmissions, values[index]);
    }

    let secureStates = snapshotSetValues(terminalSecureStates);
    for (let index = 0; index < secureStates.length; index += 1) {
      const secureState = secureStates[index];
      if (secureState.requestState !== null) {
        setAdd(terminalRequests, secureState.requestState);
      }
      if (secureState.socket !== null) setAdd(terminalSockets, secureState.socket);
    }
    let requestStates = snapshotSetValues(terminalRequests);
    for (let index = 0; index < requestStates.length; index += 1) {
      const requestState = requestStates[index];
      if (requestState.secureState !== null) {
        setAdd(terminalSecureStates, requestState.secureState);
      }
      if (requestState.socket !== null) setAdd(terminalSockets, requestState.socket);
    }
    secureStates = snapshotSetValues(terminalSecureStates);
    for (let index = 0; index < secureStates.length; index += 1) {
      const secureState = secureStates[index];
      if (secureState.requestState !== null) {
        setAdd(terminalRequests, secureState.requestState);
      }
      if (secureState.socket !== null) setAdd(terminalSockets, secureState.socket);
    }
    requestStates = snapshotSetValues(terminalRequests);

    let admissions = snapshotSetValues(terminalAdmissions);
    for (let index = 0; index < admissions.length; index += 1) {
      if (admissions[index].socket !== null) setAdd(terminalSockets, admissions[index].socket);
    }
    values = snapshotSetValues(trackedSockets);
    for (let index = 0; index < values.length; index += 1) {
      setAdd(terminalSockets, values[index]);
    }
    values = snapshotSetValues(acceptedConnections);
    for (let index = 0; index < values.length; index += 1) {
      setAdd(terminalSockets, values[index]);
    }

    for (let index = 0; index < requestStates.length; index += 1) {
      const requestState = requestStates[index];
      requestState.terminalDetached = true;
      setDelete(activeRequests, requestState);
      setDelete(activeHandlers, requestState);
      setDelete(downstreamOwnedRequests, requestState);
      detachTerminalTicket(requestState, 'deadline', cancellationHandles);
      requestState.abortRequested = true;
      if (
        requestState.response !== null
        && requestState.responseEmitter !== null
        && requestState.onResponseFinish !== null
      ) responseOperations[responseOperations.length] = {
        target: requestState.response,
        emitter: requestState.responseEmitter,
        name: 'finish',
        callback: requestState.onResponseFinish,
      };
      if (
        requestState.response !== null
        && requestState.responseEmitter !== null
        && requestState.onResponseClose !== null
      ) responseOperations[responseOperations.length] = {
        target: requestState.response,
        emitter: requestState.responseEmitter,
        name: 'close',
        callback: requestState.onResponseClose,
      };
      if (
        requestState.response !== null
        && requestState.responseEmitter !== null
        && requestState.onResponseError !== null
      ) responseOperations[responseOperations.length] = {
        target: requestState.response,
        emitter: requestState.responseEmitter,
        name: 'error',
        callback: requestState.onResponseError,
      };
      if (requestState.secureState?.requestState === requestState) {
        requestState.secureState.requestState = null;
      }
    }

    for (let index = 0; index < secureStates.length; index += 1) {
      const secureState = secureStates[index];
      detachTerminalTicket(secureState, 'headerDeadline', cancellationHandles);
      if (secureState.socket !== null) mapDelete(secureSockets, secureState.socket);
      secureState.requestState = null;
    }
    for (let index = 0; index < admissions.length; index += 1) {
      const admission = admissions[index];
      setDelete(pendingSecureAdmissions, admission);
      if (admission.socket !== null) mapDelete(connectionAdmissions, admission.socket);
    }

    values = snapshotSetValues(activeRequests);
    for (let index = 0; index < values.length; index += 1) {
      setDelete(activeRequests, values[index]);
    }
    values = snapshotSetValues(activeHandlers);
    for (let index = 0; index < values.length; index += 1) {
      setDelete(activeHandlers, values[index]);
    }
    values = snapshotSetValues(downstreamOwnedRequests);
    for (let index = 0; index < values.length; index += 1) {
      setDelete(downstreamOwnedRequests, values[index]);
    }
    values = snapshotSetValues(pendingSecureAdmissions);
    for (let index = 0; index < values.length; index += 1) {
      setDelete(pendingSecureAdmissions, values[index]);
    }

    const sockets = snapshotSetValues(terminalSockets);
    for (let index = 0; index < sockets.length; index += 1) {
      const socket = sockets[index];
      setDelete(trackedSockets, socket);
      setDelete(acceptedConnections, socket);
      const capability = weakMapGet(socketCapabilities, socket);
      if (capability === undefined) continue;
      weakMapDelete(socketCapabilities, socket);
      const operation = {
        socket,
        emitter: capability.emitter,
        onClose: capability.onClose,
        onError: capability.onError,
        destroy: null,
      };
      if (
        !capability.closed
        && !capability.destroyRequested
        && capability.destroy !== null
      ) {
        capability.destroyRequested = true;
        operation.destroy = capability.destroy;
      }
      capability.tracked = false;
      capability.listenersInstalled = false;
      capability.socket = null;
      capability.emitter = null;
      capability.destroy = null;
      capability.onClose = null;
      capability.onError = null;
      socketOperations[socketOperations.length] = operation;
    }

    detachTerminalTicket(timerState, 'start', cancellationHandles);
    detachTerminalTicket(timerState, 'close', cancellationHandles);
    values = snapshotSetValues(ownedTimers);
    for (let index = 0; index < values.length; index += 1) {
      const ticket = values[index];
      const cancellationRequired = ticket.active === true && ticket.handleReady === true;
      ticket.active = false;
      setDelete(ownedTimers, ticket);
      if (cancellationRequired) {
        cancellationHandles[cancellationHandles.length] = ticket.handle;
      }
      ticket.handle = undefined;
      ticket.handleReady = false;
    }

    values = snapshotSetValues(activeAbortCapabilities);
    for (let index = 0; index < values.length; index += 1) {
      const abortCapabilityCell = values[index];
      abortCapabilityCell.operation = null;
      abortCapabilityCell.socket = null;
      abortCapabilityCell.context = null;
      setDelete(activeAbortCapabilities, abortCapabilityCell);
    }

    for (let index = 0; index < requestStates.length; index += 1) {
      const requestState = requestStates[index];
      requestState.socket = null;
      requestState.request = null;
      requestState.response = null;
      requestState.responseEmitter = null;
      requestState.onResponseFinish = null;
      requestState.onResponseClose = null;
      requestState.onResponseError = null;
      requestState.responseFinishSlotSnapshot = null;
      requestState.responseCloseSlotSnapshot = null;
      requestState.responseErrorSlotSnapshot = null;
      requestState.transportContext = null;
      requestState.requestAdmission = null;
      requestState.responseAdmission = null;
      requestState.responseEventsCount = null;
      requestState.responseMaxListeners = null;
      requestState.socketCapability = null;
      requestState.secureState = null;
      requestState.responseSetHeader = null;
      requestState.responseSetHeaderProperty = null;
      requestState.responseListenersInstalled = false;
      requestState.deadline = null;
    }
    for (let index = 0; index < secureStates.length; index += 1) {
      const secureState = secureStates[index];
      secureState.socket = null;
      secureState.abort = null;
      secureState.abortCapabilityCell = null;
      secureState.transportContext = null;
      secureState.requestState = null;
      secureState.tlsPolicySnapshot = null;
      secureState.headerDeadline = null;
      secureState.setupState = null;
    }
    admissions = snapshotSetValues(terminalAdmissions);
    for (let index = 0; index < admissions.length; index += 1) {
      admissions[index].socket = null;
    }

    trustedFactory = null;
    downstreamHandle = null;
    downstreamClose = null;
    schedule = null;
    cancel = null;
    serverCapability = null;
    startCapability = null;
    closeCapability = null;
    return cleanup;
  }

  function runBestEffortTerminalCleanup(cleanup) {
    const cancelOperation = cleanup.cancelOperation;
    if (cancelOperation !== null) {
      for (let index = 0; index < cleanup.cancellationHandles.length; index += 1) {
        let result;
        try {
          result = REFLECT_APPLY(
            cancelOperation,
            undefined,
            [cleanup.cancellationHandles[index]],
          );
        } catch {
          continue;
        }
        if (isGenuinePromise(result)) containDiscardedPromiseRejection(result);
      }
    }
    for (let index = 0; index < cleanup.responseOperations.length; index += 1) {
      const operation = cleanup.responseOperations[index];
      try {
        REFLECT_APPLY(operation.emitter.removeListener, operation.target, [
          operation.name,
          operation.callback,
        ]);
      } catch {
        // Terminal cleanup is advisory and cannot rewrite the published result.
      }
      operation.target = null;
      operation.emitter = null;
      operation.callback = null;
    }
    for (let index = 0; index < cleanup.socketOperations.length; index += 1) {
      const operation = cleanup.socketOperations[index];
      if (operation.emitter !== null && operation.onClose !== null) {
        try {
          REFLECT_APPLY(operation.emitter.removeListener, operation.socket, [
            'close',
            operation.onClose,
          ]);
        } catch {
          // Terminal cleanup is advisory and cannot rewrite the published result.
        }
      }
      if (operation.emitter !== null && operation.onError !== null) {
        try {
          REFLECT_APPLY(operation.emitter.removeListener, operation.socket, [
            'error',
            operation.onError,
          ]);
        } catch {
          // Terminal cleanup is advisory and cannot rewrite the published result.
        }
      }
      if (operation.destroy !== null) {
        let result;
        try {
          result = REFLECT_APPLY(operation.destroy, operation.socket, []);
        } catch {
          result = undefined;
        }
        if (isGenuinePromise(result)) containDiscardedPromiseRejection(result);
      }
      operation.socket = null;
      operation.emitter = null;
      operation.onClose = null;
      operation.onError = null;
      operation.destroy = null;
    }
    cleanup.cancelOperation = null;
    cleanup.cancellationHandles.length = 0;
    cleanup.responseOperations.length = 0;
    cleanup.socketOperations.length = 0;
  }

  function finishCloseUncertain() {
    if (closeCapability === null || closeTerminal) return;
    permanentUncertainty = true;
    admissionOpen = false;
    acceptingConnections = false;
    acceptingRequests = false;
    phase = PHASE.CLOSE_UNCERTAIN;
    if (startCapability !== null && !startSettled) {
      startSettled = true;
      if (counters.startUncertain === 0) increment('startUncertain');
      startCapability.reject(failure(CODE.startUncertain));
    }
    if (counters.closeUncertain === 0) increment('closeUncertain');
    closeTerminal = true;
    const terminalCloseCapability = closeCapability;
    const terminalCleanup = detachTerminalOwnerReferences();
    terminalMetricsSnapshot = captureMetricsSnapshot();
    terminalCloseCapability.reject(failure(CODE.closeUncertain));
    runBestEffortTerminalCleanup(terminalCleanup);
  }

  function failStart() {
    markPermanentUncertainty();
    stopAccepting();
    const sockets = snapshotSetValues(trackedSockets);
    for (let index = 0; index < sockets.length; index += 1) {
      destroySocket(sockets[index]);
    }
    if (startCapability === null || startSettled) return;
    const cancellationClean = cancelTicket(timerState, 'start');
    if (!cancellationClean) markPermanentUncertainty();
    startSettled = true;
    if (counters.startUncertain === 0) increment('startUncertain');
    startCapability.reject(failure(CODE.startUncertain));
  }

  function finishStartIfReady() {
    if (
      startCapability === null
      || startSettled
      || !factoryReturned
      || !listenInvoked
      || !listenReturned
      || !listeningObserved
      || permanentUncertainty
    ) return;
    if (!cancelTicket(timerState, 'start')) {
      failStart();
      return;
    }
    if (
      startSettled
      || permanentUncertainty
      || listenerCloseRequested
      || listenerClosed
      || counters.listenerErrors !== 0
      || phase !== PHASE.STARTING
    ) {
      failStart();
      return;
    }
    if (!increment('startSucceeded')) {
      failStart();
      return;
    }
    startSettled = true;
    phase = PHASE.LISTENING;
    startCapability.resolve(OBJECT_FREEZE({ status: 'LISTENING' }));
  }

  function onConnection(socket) {
    if (!startSettled || !listeningObserved) {
      increment('connectionsRejected');
      markPermanentUncertainty();
      destroySocket(socket);
      failStart();
      return;
    }
    if (
      permanentUncertainty
      || !admissionOpen
      || !acceptingConnections
      || counters.connectionStarts >= limits.maxConnectionStarts
      || setSize(acceptedConnections) >= limits.maxConcurrentSockets
      || setHas(acceptedConnections, socket)
      || setHas(trackedSockets, socket)
    ) {
      increment('connectionsRejected');
      destroySocket(socket);
      return;
    }
    if (!increment('connectionStarts')) {
      destroySocket(socket);
      return;
    }
    const connectionBudgetSealed = counters.connectionStarts === limits.maxConnectionStarts;
    if (connectionBudgetSealed) {
      acceptingConnections = false;
      if (phase === PHASE.LISTENING) phase = PHASE.EXHAUSTED;
    }
    setAdd(acceptedConnections, socket);
    setAdd(trackedSockets, socket);
    const capability = trackSocket(socket);
    if (
      capability === null
      || capability.closed
      || capability.destroyRequested
      || !capability.tracked
      || !capability.listenersInstalled
      || permanentUncertainty
    ) {
      increment('connectionsRejected');
      markPermanentUncertainty();
      if (connectionBudgetSealed) stopAccepting();
      destroySocket(socket);
      return;
    }
    if (
      !startSettled
      || !listeningObserved
      || permanentUncertainty
      || !admissionOpen
      || (!acceptingConnections && !connectionBudgetSealed)
      || counters.connectionStarts > limits.maxConnectionStarts
      || setSize(acceptedConnections) > limits.maxConcurrentSockets
      || !setHas(acceptedConnections, socket)
      || mapHas(connectionAdmissions, socket)
      || weakMapGet(socketCapabilities, socket) !== capability
      || capability.closed
      || capability.destroyRequested
      || !capability.tracked
      || !capability.listenersInstalled
      || !setHas(trackedSockets, socket)
    ) {
      increment('connectionsRejected');
      if (connectionBudgetSealed) stopAccepting();
      destroySocket(socket);
      return;
    }
    if (!increment('connectionsAccepted')) {
      if (connectionBudgetSealed) stopAccepting();
      destroySocket(socket);
      return;
    }
    const connectionAdmission = { socket };
    mapSet(connectionAdmissions, socket, connectionAdmission);
    setAdd(pendingSecureAdmissions, connectionAdmission);
    if (connectionBudgetSealed) stopAccepting();
  }

  function applicableServernameValid(value) {
    if (origin.servername === null) {
      return value === undefined || value === null || value === false || value === '';
    }
    return value === origin.servername;
  }

  function captureTlsPolicySnapshot(socket) {
    const alpn = captureOwnDataProperty(socket, 'alpnProtocol');
    if (alpn === null || alpn.value !== 'http/1.1') return null;
    const servername = captureOwnDataProperty(socket, 'servername');
    if (servername === null || !applicableServernameValid(servername.value)) return null;
    return OBJECT_FREEZE({ alpn, servername });
  }

  function sameTlsPolicySnapshot(socket, snapshot) {
    return snapshot !== null
      && sameCapturedOwnDataProperty(socket, 'alpnProtocol', snapshot.alpn)
      && sameCapturedOwnDataProperty(socket, 'servername', snapshot.servername);
  }

  function secureHeaderSetupOwned(socket, capability, secureState) {
    const ticket = secureState.headerDeadline;
    return !closeTerminal
      && closePromise === null
      && startSettled
      && listeningObserved
      && !permanentUncertainty
      && admissionOpen
      && timerRuntimeOperationsInFlight === 0
      && secureState.setupState === SECURE_SETUP.INSTALLING_HEADER_DEADLINE
      && secureState.socket === socket
      && secureState.requestStarted === false
      && secureState.requestState === null
      && secureState.tlsPolicySnapshot !== null
      && secureState.abort !== null
      && secureState.abortCapabilityCell !== null
      && secureState.abortCapabilityCell.socket === socket
      && secureState.abortCapabilityCell.context === secureState.transportContext
      && secureState.transportContext !== null
      && setHas(activeAbortCapabilities, secureState.abortCapabilityCell)
      && mapGet(secureSockets, socket) === secureState
      && weakMapGet(socketCapabilities, socket) === capability
      && capability.socket === socket
      && capability.closed === false
      && capability.destroyRequested === false
      && capability.tracked === true
      && capability.listenersInstalled === true
      && setHas(trackedSockets, socket)
      && ticket !== null
      && ticket.active === true
      && ticket.handleReady === true
      && setHas(ownedTimers, ticket);
  }

  function onSecureConnection(socket) {
    if (!markFirstSecureSocketAppearance(socket)) {
      increment('tlsRejected');
      destroySocket(socket);
      return;
    }
    if (!startSettled || !listeningObserved) {
      increment('tlsRejected');
      markPermanentUncertainty();
      destroySocket(socket);
      failStart();
      return;
    }
    if (permanentUncertainty || !admissionOpen) {
      increment('tlsRejected');
      destroySocket(socket);
      return;
    }
    const existing = mapGet(secureSockets, socket);
    if (existing !== undefined) {
      increment('tlsRejected');
      destroySocket(socket);
      return;
    }
    const connectionAdmission = firstSetValue(pendingSecureAdmissions);
    const connectionCapability = connectionAdmission === undefined
      ? undefined
      : weakMapGet(socketCapabilities, connectionAdmission.socket);
    if (
      connectionAdmission === undefined
      || !setHas(pendingSecureAdmissions, connectionAdmission)
      || mapGet(connectionAdmissions, connectionAdmission.socket) !== connectionAdmission
      || connectionCapability === undefined
      || connectionCapability.closed
      || connectionCapability.destroyRequested
      || !connectionCapability.tracked
      || !connectionCapability.listenersInstalled
      || !setHas(acceptedConnections, connectionAdmission.socket)
      || !setHas(trackedSockets, connectionAdmission.socket)
    ) {
      increment('tlsRejected');
      destroySocket(socket);
      return;
    }
    setDelete(pendingSecureAdmissions, connectionAdmission);
    mapDelete(connectionAdmissions, connectionAdmission.socket);
    const secureCapability = socket === connectionAdmission.socket
      ? connectionCapability
      : trackSocket(socket);
    if (
      permanentUncertainty
      || !admissionOpen
      || secureCapability === null
      || secureCapability === undefined
      || secureCapability.closed
      || secureCapability.destroyRequested
      || !secureCapability.tracked
      || !secureCapability.listenersInstalled
      || !setHas(trackedSockets, socket)
    ) {
      increment('tlsRejected');
      destroySocket(socket);
      return;
    }
    const tlsPolicySnapshot = captureTlsPolicySnapshot(socket);
    if (
      permanentUncertainty
      || !admissionOpen
      || secureCapability.closed
      || secureCapability.destroyRequested
      || !secureCapability.tracked
      || !secureCapability.listenersInstalled
      || !setHas(trackedSockets, socket)
      || tlsPolicySnapshot === null
    ) {
      increment('tlsRejected');
      destroySocket(socket);
      return;
    }
    const peerToken = REFLECT_APPLY(NATIVE_SYMBOL, undefined, []);
    const secureState = {
      socket,
      abort: null,
      abortCapabilityCell: null,
      transportContext: null,
      requestStarted: false,
      requestState: null,
      tlsPolicySnapshot,
      headerDeadline: null,
      setupState: SECURE_SETUP.INSTALLING_HEADER_DEADLINE,
    };
    const abortCapabilityCell = {
      operation: null,
      socket,
      context: null,
    };
    const abort = OBJECT_FREEZE(function abortOwnedHttpsSocket() {
      const operation = abortCapabilityCell.operation;
      if (operation === null) return;
      REFLECT_APPLY(operation, undefined, []);
    });
    const transportContext = OBJECT_FREEZE({
      peerToken,
      abort,
    });
    abortCapabilityCell.context = transportContext;
    abortCapabilityCell.operation = OBJECT_FREEZE(function performOwnedHttpsSocketAbort() {
      const ownedSocket = abortCapabilityCell.socket;
      if (ownedSocket === null) return;
      increment('aborts');
      destroySocket(ownedSocket);
    });
    secureState.abort = abort;
    secureState.abortCapabilityCell = abortCapabilityCell;
    secureState.transportContext = transportContext;
    setAdd(activeAbortCapabilities, abortCapabilityCell);
    mapSet(secureSockets, socket, secureState);
    const scheduled = scheduleTicket(
      secureState,
      'headerDeadline',
      limits.headerDeadlineMs,
      () => {
        increment('deadlineExpirations');
        destroySocket(socket);
      },
    );
    if (closeTerminal) return;
    if (!scheduled) {
      markPermanentUncertainty();
      destroySocket(socket);
      return;
    }
    if (
      !secureHeaderSetupOwned(socket, secureCapability, secureState)
      || !sameTlsPolicySnapshot(socket, tlsPolicySnapshot)
    ) {
      markPermanentUncertainty();
      destroySocket(socket);
      return;
    }
    secureState.setupState = SECURE_SETUP.REQUEST_ELIGIBLE;
  }

  function settleHandler(requestState, clean) {
    if (requestState.terminalDetached || closeTerminal || requestState.handlerSettled) return;
    requestState.handlerSettled = true;
    setDelete(activeHandlers, requestState);
    increment('handlersSettled');
    if (!clean) {
      increment('handlerFailures');
      destroySocket(requestState.socket);
    }
    maybeCompleteRequest(requestState);
  }

  function captureResponseListener(listener) {
    try {
      if (
        typeof listener !== 'function'
        || REFLECT_APPLY(IS_PROXY, undefined, [listener])
      ) return null;
      const listenerDescriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [listener, 'listener'],
      );
      if (
        listenerDescriptor !== undefined
        && !OBJECT_HAS_OWN(listenerDescriptor, 'value')
      ) return null;
      return OBJECT_FREEZE({
        listener,
        listenerDescriptor: listenerDescriptor === undefined
          ? undefined
          : OBJECT_FREEZE(listenerDescriptor),
      });
    } catch {
      return null;
    }
  }

  function captureResponseEventSlot(requestState, name, requireExactEvents = true) {
    try {
      const eventsDescriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [requestState.response, '_events'],
      );
      if (
        !(requireExactEvents
          ? samePropertyDescriptor(requestState.responseAdmission.events, eventsDescriptor)
          : sameDataPropertyDescriptorSurface(
            requestState.responseAdmission.events,
            eventsDescriptor,
          ))
        || !OBJECT_HAS_OWN(eventsDescriptor, 'value')
        || eventsDescriptor.value === null
        || typeof eventsDescriptor.value !== 'object'
        || REFLECT_APPLY(IS_PROXY, undefined, [eventsDescriptor.value])
        || REFLECT_APPLY(
          REFLECT_GET_PROTOTYPE_OF,
          NATIVE_REFLECT,
          [eventsDescriptor.value],
        ) !== null
        || REFLECT_APPLY(
          REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
          NATIVE_REFLECT,
          [eventsDescriptor.value, 'newListener'],
        ) !== undefined
        || REFLECT_APPLY(
          REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
          NATIVE_REFLECT,
          [eventsDescriptor.value, 'removeListener'],
        ) !== undefined
      ) return null;
      const eventDescriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [eventsDescriptor.value, name],
      );
      if (eventDescriptor === undefined) {
        return OBJECT_FREEZE({
          eventsDescriptor: OBJECT_FREEZE(eventsDescriptor),
          eventDescriptor: undefined,
          container: undefined,
          array: false,
          lengthDescriptor: undefined,
          indexDescriptors: OBJECT_FREEZE([]),
          entries: OBJECT_FREEZE([]),
        });
      }
      if (!OBJECT_HAS_OWN(eventDescriptor, 'value')) return null;
      const container = eventDescriptor.value;
      if (
        container === null
        || (typeof container !== 'object' && typeof container !== 'function')
        || REFLECT_APPLY(IS_PROXY, undefined, [container])
      ) return null;
      const entries = [];
      const indexDescriptors = [];
      let lengthDescriptor;
      const array = REFLECT_APPLY(ARRAY_IS_ARRAY, NATIVE_ARRAY, [container]);
      if (array) {
        if (
          REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [container])
            !== ARRAY_PROTOTYPE
        ) return null;
        lengthDescriptor = REFLECT_APPLY(
          REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
          NATIVE_REFLECT,
          [container, 'length'],
        );
        if (
          lengthDescriptor === undefined
          || !OBJECT_HAS_OWN(lengthDescriptor, 'value')
          || !NUMBER_IS_SAFE_INTEGER(lengthDescriptor.value)
          || lengthDescriptor.value < 1
          || lengthDescriptor.value > MAX_HEADER_COUNT
        ) return null;
      } else {
        const entry = captureResponseListener(container);
        if (entry === null) return null;
        entries.push(entry);
        return OBJECT_FREEZE({
          eventsDescriptor: OBJECT_FREEZE(eventsDescriptor),
          eventDescriptor: OBJECT_FREEZE(eventDescriptor),
          container,
          array: false,
          lengthDescriptor: undefined,
          indexDescriptors: OBJECT_FREEZE(indexDescriptors),
          entries: OBJECT_FREEZE(entries),
        });
      }
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        const candidateDescriptor = REFLECT_APPLY(
          REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
          NATIVE_REFLECT,
          [container, STRING_FROM(index)],
        );
        if (
          candidateDescriptor === undefined
          || !OBJECT_HAS_OWN(candidateDescriptor, 'value')
        ) return null;
        const entry = captureResponseListener(candidateDescriptor.value);
        if (entry === null) return null;
        indexDescriptors.push(OBJECT_FREEZE(candidateDescriptor));
        entries.push(entry);
      }
      return OBJECT_FREEZE({
        eventsDescriptor: OBJECT_FREEZE(eventsDescriptor),
        eventDescriptor: OBJECT_FREEZE(eventDescriptor),
        container,
        array: true,
        lengthDescriptor: OBJECT_FREEZE(lengthDescriptor),
        indexDescriptors: OBJECT_FREEZE(indexDescriptors),
        entries: OBJECT_FREEZE(entries),
      });
    } catch {
      return null;
    }
  }

  function sameResponseEventSlotSnapshot(expected, current) {
    if (expected === null || current === null) return false;
    if (
      !samePropertyDescriptor(expected.eventsDescriptor, current.eventsDescriptor)
      || !samePropertyDescriptor(expected.eventDescriptor, current.eventDescriptor)
      || expected.container !== current.container
      || expected.array !== current.array
      || !samePropertyDescriptor(expected.lengthDescriptor, current.lengthDescriptor)
      || expected.indexDescriptors.length !== current.indexDescriptors.length
      || expected.entries.length !== current.entries.length
    ) return false;
    for (let index = 0; index < expected.entries.length; index += 1) {
      if (
        !samePropertyDescriptor(
          expected.indexDescriptors[index],
          current.indexDescriptors[index],
        )
        || expected.entries[index].listener !== current.entries[index].listener
        || !samePropertyDescriptor(
          expected.entries[index].listenerDescriptor,
          current.entries[index].listenerDescriptor,
        )
      ) return false;
    }
    return true;
  }

  function sameSettledResponseEventSlotSubset(expected, current, callback) {
    if (
      expected === null
      || current === null
      || !expected.array
      || expected.entries.length < 2
      || expected.indexDescriptors.length !== expected.entries.length
      || !samePropertyDescriptor(expected.eventsDescriptor, current.eventsDescriptor)
      || !sameDataPropertyDescriptorSurface(
        expected.eventDescriptor,
        current.eventDescriptor,
      )
      || current.entries.length < 1
      || current.entries.length > expected.entries.length
    ) return false;
    const expectedOwnerIndex = expected.entries.length - 1;
    const currentOwnerIndex = current.entries.length - 1;
    if (
      expected.entries[expectedOwnerIndex].listener !== callback
      || expected.entries[expectedOwnerIndex].listenerDescriptor !== undefined
      || current.entries[currentOwnerIndex].listener !== callback
      || current.entries[currentOwnerIndex].listenerDescriptor !== undefined
    ) return false;
    let ownerMatches = 0;
    for (let index = 0; index < current.entries.length; index += 1) {
      const entry = current.entries[index];
      if (entry.listener === callback) ownerMatches += 1;
      if (entry.listenerDescriptor?.value === callback) return false;
    }
    if (ownerMatches !== 1) return false;
    if (current.array) {
      if (
        current.entries.length < 2
        || !sameDataPropertyDescriptorSurface(
          expected.lengthDescriptor,
          current.lengthDescriptor,
        )
        || current.lengthDescriptor.value !== current.entries.length
        || current.indexDescriptors.length !== current.entries.length
      ) return false;
    } else if (
      current.entries.length !== 1
      || current.container !== callback
      || current.lengthDescriptor !== undefined
      || current.indexDescriptors.length !== 0
    ) return false;
    let expectedIndex = 0;
    for (let currentIndex = 0; currentIndex < currentOwnerIndex; currentIndex += 1) {
      let matched = false;
      while (expectedIndex < expectedOwnerIndex) {
        if (
          expected.entries[expectedIndex].listener
            === current.entries[currentIndex].listener
          && samePropertyDescriptor(
            expected.entries[expectedIndex].listenerDescriptor,
            current.entries[currentIndex].listenerDescriptor,
          )
          && samePropertyDescriptor(
            expected.indexDescriptors[expectedIndex],
            current.indexDescriptors[currentIndex],
          )
        ) {
          matched = true;
          expectedIndex += 1;
          break;
        }
        expectedIndex += 1;
      }
      if (!matched) return false;
    }
    return !current.array || samePropertyDescriptor(
      expected.indexDescriptors[expectedOwnerIndex],
      current.indexDescriptors[currentOwnerIndex],
    );
  }

  function responseEventSlotCanAppend(slot) {
    if (slot === null || slot.entries.length >= MAX_HEADER_COUNT) return false;
    if (slot.eventDescriptor === undefined) {
      return REFLECT_APPLY(
        OBJECT_IS_EXTENSIBLE,
        NATIVE_OBJECT,
        [slot.eventsDescriptor.value],
      );
    }
    if (slot.eventDescriptor.writable !== true) return false;
    if (!slot.array) return true;
    return slot.lengthDescriptor.writable === true
      && REFLECT_APPLY(OBJECT_IS_EXTENSIBLE, NATIVE_OBJECT, [slot.container]);
  }

  function standardAssignedDataProperty(descriptor, value) {
    return descriptor !== undefined
      && OBJECT_HAS_OWN(descriptor, 'value')
      && descriptor.value === value
      && descriptor.configurable === true
      && descriptor.enumerable === true
      && descriptor.writable === true;
  }

  function captureRegisteredResponseCallback(
    requestState,
    name,
    callback,
    beforeSlot,
    beforeEventsCount,
  ) {
    const afterBookkeeping = captureResponseBookkeeping(requestState.response);
    const afterSlot = captureResponseEventSlot(requestState, name);
    const countIncrement = beforeSlot.eventDescriptor === undefined ? 1 : 0;
    const expectedCount = beforeEventsCount.value + countIncrement;
    if (
      afterBookkeeping === null
      || afterSlot === null
      || !NUMBER_IS_SAFE_INTEGER(expectedCount)
      || afterBookkeeping.eventsCount.owner !== beforeEventsCount.owner
      || !sameDataPropertyDescriptorSurface(
        beforeEventsCount.descriptor,
        afterBookkeeping.eventsCount.descriptor,
      )
      || afterBookkeeping.eventsCount.value !== expectedCount
      || !sameCapturedDataProperty(
        requestState.response,
        '_maxListeners',
        requestState.responseMaxListeners,
      )
      || !samePropertyDescriptor(beforeSlot.eventsDescriptor, afterSlot.eventsDescriptor)
      || afterSlot.entries.length !== beforeSlot.entries.length + 1
      || afterSlot.entries[afterSlot.entries.length - 1].listener !== callback
      || afterSlot.entries[afterSlot.entries.length - 1].listenerDescriptor !== undefined
    ) return null;
    for (let index = 0; index < beforeSlot.entries.length; index += 1) {
      if (
        beforeSlot.entries[index].listener !== afterSlot.entries[index].listener
        || !samePropertyDescriptor(
          beforeSlot.entries[index].listenerDescriptor,
          afterSlot.entries[index].listenerDescriptor,
        )
      ) return null;
    }
    if (beforeSlot.eventDescriptor === undefined) {
      if (
        afterSlot.array
        || afterSlot.container !== callback
        || !standardAssignedDataProperty(afterSlot.eventDescriptor, callback)
        || afterSlot.lengthDescriptor !== undefined
        || afterSlot.indexDescriptors.length !== 0
      ) return null;
    } else if (!beforeSlot.array) {
      if (
        !afterSlot.array
        || !sameDataPropertyDescriptorSurface(
          beforeSlot.eventDescriptor,
          afterSlot.eventDescriptor,
        )
        || afterSlot.container === beforeSlot.container
        || afterSlot.lengthDescriptor?.value !== 2
        || afterSlot.indexDescriptors.length !== 2
        || !standardAssignedDataProperty(
          afterSlot.indexDescriptors[0],
          beforeSlot.container,
        )
        || !standardAssignedDataProperty(afterSlot.indexDescriptors[1], callback)
      ) return null;
    } else {
      if (
        !afterSlot.array
        || afterSlot.container !== beforeSlot.container
        || !samePropertyDescriptor(
          beforeSlot.eventDescriptor,
          afterSlot.eventDescriptor,
        )
        || !sameDataPropertyDescriptorSurface(
          beforeSlot.lengthDescriptor,
          afterSlot.lengthDescriptor,
        )
        || afterSlot.lengthDescriptor.value !== beforeSlot.lengthDescriptor.value + 1
        || afterSlot.indexDescriptors.length !== beforeSlot.indexDescriptors.length + 1
      ) return null;
      for (let index = 0; index < beforeSlot.indexDescriptors.length; index += 1) {
        if (!samePropertyDescriptor(
          beforeSlot.indexDescriptors[index],
          afterSlot.indexDescriptors[index],
        )) return null;
      }
      if (!standardAssignedDataProperty(
        afterSlot.indexDescriptors[afterSlot.indexDescriptors.length - 1],
        callback,
      )) return null;
    }
    return OBJECT_FREEZE({
      slotSnapshot: afterSlot,
      eventsCount: afterBookkeeping.eventsCount,
    });
  }

  function responseSettlementOwned(requestState) {
    for (const [name, callback] of [
      ['finish', requestState.onResponseFinish],
      ['close', requestState.onResponseClose],
      ['error', requestState.onResponseError],
    ]) {
      const slotSnapshot = name === 'finish'
        ? requestState.responseFinishSlotSnapshot
        : name === 'close'
          ? requestState.responseCloseSlotSnapshot
          : requestState.responseErrorSlotSnapshot;
      if (callback === null || slotSnapshot === null) return false;
      const currentSlot = captureResponseEventSlot(requestState, name);
      if (!sameResponseEventSlotSnapshot(slotSnapshot, currentSlot)) return false;
      const entries = currentSlot.entries;
      let matches = 0;
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry.listener === callback) {
          if (entry.listenerDescriptor !== undefined) return false;
          matches += 1;
          continue;
        }
        if (entry.listenerDescriptor?.value === callback) return false;
      }
      if (
        matches !== 1
        || entries[entries.length - 1].listener !== callback
      ) return false;
    }
    return true;
  }

  function inspectRequestAdmission(requestState, requireDeadline = false) {
    const currentAdmission = captureRequestAdmission(
      requestState.request,
      origin.authority,
      limits,
      allowedTargets,
    );
    if (!sameRequestAdmission(requestState.requestAdmission, currentAdmission)) {
      return 'DRIFT';
    }
    if (requestState.responseSettled) return 'SETTLED';
    if (!sameResponseAdmission(
      requestState.response,
      requestState.responseAdmission,
      requestState.responseEventsCount,
      requestState.responseMaxListeners,
    )) {
      return 'OWNERSHIP';
    }
    if (!sameResponseMethodSurface(
      requestState.response,
      requestState.responseEmitter,
      requestState.responseSetHeaderProperty,
    )) return 'OWNERSHIP';
    if (
      requestState.responseListenersInstalled
      && !responseSettlementOwned(requestState)
    ) return 'OWNERSHIP';
    if (permanentUncertainty) return 'UNCERTAIN';
    if (!admissionOpen || closePromise !== null) return 'CLOSED';
    if (
      requestState.completed
      || requestState.handlerSettled
      || !setHas(activeRequests, requestState)
      || !setHas(activeHandlers, requestState)
      || weakMapGet(socketCapabilities, requestState.socket) !== requestState.socketCapability
      || requestState.socketCapability.closed
      || requestState.socketCapability.destroyRequested
      || !requestState.socketCapability.tracked
      || !requestState.socketCapability.listenersInstalled
      || !setHas(trackedSockets, requestState.socket)
      || mapGet(secureSockets, requestState.socket) !== requestState.secureState
      || requestState.secureState.setupState !== SECURE_SETUP.REQUEST_ELIGIBLE
      || requestState.secureState.requestStarted !== true
      || requestState.secureState.requestState !== requestState
    ) return 'OWNERSHIP';
    if (!sameTlsPolicySnapshot(
      requestState.socket,
      requestState.secureState.tlsPolicySnapshot,
    )) return 'TLS_POLICY';
    if (
      !requestState.requestStartReserved
      && (
        !acceptingRequests
        || counters.requestStarts >= limits.maxRequestStarts
      )
    ) return 'CAPACITY';
    if (requireDeadline && requestState.deadline === null) return 'DEADLINE';
    if (setSize(activeRequests) > limits.maxConcurrentRequests) return 'CAPACITY';
    return 'READY';
  }

  function settleUnstartedHandler(requestState) {
    if (requestState.handlerSettled) return;
    requestState.handlerSettled = true;
    setDelete(activeHandlers, requestState);
  }

  function abandonRequestAdmission(requestState, uncertain) {
    increment('requestsRejected');
    if (uncertain) markPermanentUncertainty();
    destroySocket(requestState.socket);
    settleUnstartedHandler(requestState);
    maybeCompleteRequest(requestState);
  }

  function rejectOwnedRequest(requestState) {
    increment('requestsRejected');
    const framed = sendUnavailable(requestState.response);
    if (!framed) destroySocket(requestState.socket);
    settleUnstartedHandler(requestState);
    maybeCompleteRequest(requestState);
  }

  function handleRequestAdmissionFailure(requestState, status) {
    if (status === 'CAPACITY') {
      rejectOwnedRequest(requestState);
      return;
    }
    const uncertain = status === 'DRIFT'
      || status === 'OWNERSHIP'
      || status === 'TLS_POLICY'
      || status === 'DEADLINE'
      || (status === 'SETTLED' && closePromise === null);
    abandonRequestAdmission(requestState, uncertain);
  }

  function registerResponse(requestState) {
    const emitter = requestState.responseEmitter;
    const onFinish = OBJECT_FREEZE(() => {
      if (requestState.terminalDetached || closeTerminal) return;
      requestState.responseFinishObserved = true;
      settleResponse(requestState, true);
    });
    const onClose = OBJECT_FREEZE(() => {
      if (requestState.terminalDetached || closeTerminal) return;
      requestState.responseCloseObserved = true;
      settleResponse(requestState, false);
    });
    const onError = OBJECT_FREEZE(() => {
      if (requestState.terminalDetached || closeTerminal) return;
      requestState.responseErrorObserved = true;
      settleResponse(requestState, false);
    });
    requestState.onResponseFinish = onFinish;
    requestState.onResponseClose = onClose;
    requestState.onResponseError = onError;
    try {
      const beforeFinish = captureResponseEventSlot(requestState, 'finish');
      if (
        !responseEventSlotCanAppend(beforeFinish)
        || requestState.responseEventsCount.value === NUMBER_MAX_SAFE_INTEGER
      ) return 'OWNERSHIP';
      REFLECT_APPLY(emitter.on, requestState.response, ['finish', onFinish]);
      const finishCapture = captureRegisteredResponseCallback(
        requestState,
        'finish',
        onFinish,
        beforeFinish,
        requestState.responseEventsCount,
      );
      if (finishCapture === null) return 'OWNERSHIP';
      requestState.responseFinishSlotSnapshot = finishCapture.slotSnapshot;
      requestState.responseEventsCount = finishCapture.eventsCount;
      let status = inspectRequestAdmission(requestState);
      if (status !== 'READY') return status;
      const beforeClose = captureResponseEventSlot(requestState, 'close');
      if (
        !responseEventSlotCanAppend(beforeClose)
        || requestState.responseEventsCount.value === NUMBER_MAX_SAFE_INTEGER
      ) return 'OWNERSHIP';
      REFLECT_APPLY(emitter.on, requestState.response, ['close', onClose]);
      const closeCapture = captureRegisteredResponseCallback(
        requestState,
        'close',
        onClose,
        beforeClose,
        requestState.responseEventsCount,
      );
      if (closeCapture === null) return 'OWNERSHIP';
      requestState.responseCloseSlotSnapshot = closeCapture.slotSnapshot;
      requestState.responseEventsCount = closeCapture.eventsCount;
      status = inspectRequestAdmission(requestState);
      if (status !== 'READY') return status;
      const beforeError = captureResponseEventSlot(requestState, 'error');
      if (
        !responseEventSlotCanAppend(beforeError)
        || requestState.responseEventsCount.value === NUMBER_MAX_SAFE_INTEGER
      ) return 'OWNERSHIP';
      REFLECT_APPLY(emitter.on, requestState.response, ['error', onError]);
      const errorCapture = captureRegisteredResponseCallback(
        requestState,
        'error',
        onError,
        beforeError,
        requestState.responseEventsCount,
      );
      if (errorCapture === null) return 'OWNERSHIP';
      requestState.responseErrorSlotSnapshot = errorCapture.slotSnapshot;
      requestState.responseEventsCount = errorCapture.eventsCount;
      requestState.responseListenersInstalled = true;
      return inspectRequestAdmission(requestState);
    } catch {
      return 'OWNERSHIP';
    }
  }

  function requestAbort(requestState) {
    if (requestState.abortRequested) return true;
    requestState.abortRequested = true;
    try {
      REFLECT_APPLY(requestState.transportContext.abort, undefined, []);
      return true;
    } catch {
      markPermanentUncertainty();
      return false;
    }
  }

  function requestDeadline(requestState) {
    if (requestState.terminalDetached || closeTerminal) return;
    increment('deadlineExpirations');
    markPermanentUncertainty();
    requestAbort(requestState);
  }

  function onRequest(request, response, forcedRejection = false) {
    const requestAdmission = captureRequestAdmission(
      request,
      origin.authority,
      limits,
      allowedTargets,
    );
    if (requestAdmission === null) {
      increment('requestsRejected');
      markPermanentUncertainty();
      const sockets = snapshotSetValues(trackedSockets);
      for (let index = 0; index < sockets.length; index += 1) {
        destroySocket(sockets[index]);
      }
      return;
    }
    const socket = requestAdmission.socket;
    const secureState = mapGet(secureSockets, socket);
    if (!startSettled || !listeningObserved || secureState === undefined) {
      increment('requestsRejected');
      if (!startSettled || !listeningObserved) {
        markPermanentUncertainty();
        destroySocket(socket);
        failStart();
      } else {
        const framed = sendUnavailable(response);
        if (!framed) destroySocket(socket);
      }
      return;
    }
    const socketCapability = weakMapGet(socketCapabilities, socket);
    if (
      socketCapability === undefined
      || socketCapability.closed
      || socketCapability.destroyRequested
      || !socketCapability.tracked
      || !socketCapability.listenersInstalled
      || !setHas(trackedSockets, socket)
    ) {
      increment('requestsRejected');
      destroySocket(socket);
      return;
    }
    if (
      secureState.setupState !== SECURE_SETUP.REQUEST_ELIGIBLE
      || !sameTlsPolicySnapshot(socket, secureState.tlsPolicySnapshot)
    ) {
      secureState.requestStarted = true;
      increment('requestsRejected');
      markPermanentUncertainty();
      destroySocket(socket);
      return;
    }
    if (secureState.requestStarted) {
      increment('requestsRejected');
      destroySocket(socket);
      return;
    }
    secureState.requestStarted = true;
    if (
      !admissionOpen
      || !acceptingRequests
      || counters.requestStarts >= limits.maxRequestStarts
    ) {
      cancelTicket(secureState, 'headerDeadline');
      rejectParsed(response, socket);
      return;
    }
    if (!increment('requestStarts')) {
      destroySocket(socket);
      return;
    }
    const requestBudgetSealed = counters.requestStarts === limits.maxRequestStarts;
    if (requestBudgetSealed) {
      acceptingRequests = false;
      if (phase === PHASE.LISTENING) phase = PHASE.EXHAUSTED;
    }
    if (
      forcedRejection
      || setSize(activeRequests) >= limits.maxConcurrentRequests
      || requestAdmission.protocolValid !== true
    ) {
      cancelTicket(secureState, 'headerDeadline');
      rejectParsed(response, socket);
      if (requestBudgetSealed) stopAccepting();
      return;
    }
    const responseAdmission = captureResponseAdmission(response);
    const responseEmitter = responseAdmission === null
      ? null
      : captureResponseEmitter(response);
    const responseSetHeader = captureDataProperty(response, 'setHeader');
    if (
      responseEmitter === null
      || responseAdmission === null
      || responseSetHeader === null
      || !safeCallable(responseSetHeader.value)
    ) {
      increment('requestsRejected');
      markPermanentUncertainty();
      if (requestBudgetSealed) stopAccepting();
      destroySocket(socket);
      return;
    }
    const requestState = {
      socket,
      request,
      response,
      responseEmitter,
      onResponseFinish: null,
      onResponseClose: null,
      onResponseError: null,
      responseFinishSlotSnapshot: null,
      responseCloseSlotSnapshot: null,
      responseErrorSlotSnapshot: null,
      transportContext: secureState.transportContext,
      requestAdmission,
      responseAdmission,
      responseEventsCount: responseAdmission.eventsCount,
      responseMaxListeners: responseAdmission.maxListeners,
      socketCapability,
      secureState,
      responseSetHeader: responseSetHeader.value,
      responseSetHeaderProperty: responseSetHeader,
      responseListenersInstalled: false,
      responseFinishObserved: false,
      responseCloseObserved: false,
      responseErrorObserved: false,
      requestStartReserved: true,
      abortRequested: false,
      terminalDetached: false,
      handlerSettled: false,
      responseSettled: false,
      responseClean: false,
      completed: false,
      deadline: null,
    };
    secureState.requestState = requestState;
    setAdd(activeRequests, requestState);
    setAdd(activeHandlers, requestState);
    let status = registerResponse(requestState);
    if (status !== 'READY') {
      handleRequestAdmissionFailure(requestState, status);
      return;
    }
    if (requestBudgetSealed) {
      stopAccepting();
      status = inspectRequestAdmission(requestState);
      if (status !== 'READY') {
        handleRequestAdmissionFailure(requestState, status);
        return;
      }
    }
    cancelTicket(secureState, 'headerDeadline');
    status = inspectRequestAdmission(requestState);
    if (status !== 'READY') {
      handleRequestAdmissionFailure(requestState, status);
      return;
    }
    if (!scheduleTicket(
      requestState,
      'deadline',
      limits.requestResponseDeadlineMs,
      () => requestDeadline(requestState),
    )) {
      markPermanentUncertainty();
      handleRequestAdmissionFailure(requestState, 'UNCERTAIN');
      return;
    }
    status = inspectRequestAdmission(requestState, true);
    if (status !== 'READY') {
      handleRequestAdmissionFailure(requestState, status);
      return;
    }
    try {
      REFLECT_APPLY(requestState.responseSetHeader, response, ['Connection', 'close']);
    } catch {
      handleRequestAdmissionFailure(requestState, 'OWNERSHIP');
      return;
    }
    status = inspectRequestAdmission(requestState, true);
    if (status !== 'READY') {
      handleRequestAdmissionFailure(requestState, status);
      return;
    }
    setAdd(downstreamOwnedRequests, requestState);
    if (!increment('requestsAdmitted')) {
      handleRequestAdmissionFailure(requestState, 'UNCERTAIN');
      return;
    }
    let operation;
    status = inspectRequestAdmission(requestState, true);
    if (status !== 'READY') {
      handleRequestAdmissionFailure(requestState, status);
      return;
    }
    try {
      operation = REFLECT_APPLY(downstreamHandle, undefined, [
        request,
        response,
        secureState.transportContext,
      ]);
    } catch {
      increment('handlerFailures');
      setDelete(activeHandlers, requestState);
      requestState.handlerSettled = true;
      markPermanentUncertainty();
      destroySocket(socket);
      maybeCompleteRequest(requestState);
      return;
    }
    const observation = observeNativePromise(
      operation,
      () => settleHandler(requestState, true),
      () => settleHandler(requestState, false),
    );
    if (observation !== PROMISE_OBSERVATION.OBSERVED) {
      containDiscardedPromiseRejection(operation);
      increment('handlerFailures');
      if (observation === PROMISE_OBSERVATION.NOT_PROMISE) {
        setDelete(activeHandlers, requestState);
        requestState.handlerSettled = true;
      }
      markPermanentUncertainty();
      destroySocket(socket);
    }
  }

  function onRawSocketEvent(socket) {
    increment('connectionsRejected');
    if (!startSettled || !listeningObserved) {
      markPermanentUncertainty();
      failStart();
    }
    destroySocket(socket);
  }

  function onListening() {
    if (!listenInvoked || startSettled || listeningObserved || listenerCloseRequested) {
      failStart();
      return;
    }
    listeningObserved = true;
    finishStartIfReady();
  }

  function onListenerClose() {
    if (!listenerCloseRequested) {
      listenerClosed = true;
      if (!startSettled) failStart();
      else markPermanentUncertainty();
    } else {
      listenerClosed = true;
    }
    maybeFinishClose();
  }

  function onListenerError() {
    increment('listenerErrors');
    failStart();
    maybeFinishClose();
  }

  callbackDispatchCell.target = OBJECT_FREEZE({
    connection: OBJECT_FREEZE(function activeBoundedHttpsConnection(socket) {
      rawConnectionOperationsInFlight += 1;
      try {
        onConnection(socket);
      } finally {
        rawConnectionOperationsInFlight -= 1;
        maybeFinishClose();
      }
    }),
    secureConnection: OBJECT_FREEZE(function activeBoundedHttpsSecureConnection(socket) {
      onSecureConnection(socket);
    }),
    request: OBJECT_FREEZE(function activeBoundedHttpsRequest(request, response) {
      onRequest(request, response, false);
    }),
    checkContinue: OBJECT_FREEZE(function activeBoundedHttpsCheckContinue(request, response) {
      onRequest(request, response, true);
    }),
    checkExpectation: OBJECT_FREEZE(function activeBoundedHttpsCheckExpectation(request, response) {
      onRequest(request, response, true);
    }),
    upgrade: OBJECT_FREEZE(function activeBoundedHttpsUpgrade(_request, socket, _head) {
      onRawSocketEvent(socket);
    }),
    connect: OBJECT_FREEZE(function activeBoundedHttpsConnect(_request, socket, _head) {
      onRawSocketEvent(socket);
    }),
    clientError: OBJECT_FREEZE(function activeBoundedHttpsClientError(_error, socket) {
      onRawSocketEvent(socket);
    }),
    tlsClientError: OBJECT_FREEZE(function activeBoundedHttpsTlsClientError(_error, socket) {
      increment('tlsRejected');
      if (!startSettled || !listeningObserved) {
        markPermanentUncertainty();
        failStart();
      }
      destroySocket(socket);
    }),
    dropRequest: OBJECT_FREEZE(function activeBoundedHttpsDropRequest(_request, socket) {
      onRawSocketEvent(socket);
    }),
    drop: OBJECT_FREEZE(function activeBoundedHttpsDrop(_data) {
      increment('connectionsRejected');
      if (!startSettled || !listeningObserved) {
        markPermanentUncertainty();
        failStart();
      }
    }),
    timeout: OBJECT_FREEZE(function activeBoundedHttpsTimeout(socket) {
      increment('deadlineExpirations');
      if (!startSettled || !listeningObserved) {
        markPermanentUncertainty();
        failStart();
      }
      destroySocket(socket);
    }),
    listening: OBJECT_FREEZE(function activeBoundedHttpsListening() {
      onListening();
    }),
    close: OBJECT_FREEZE(function activeBoundedHttpsClose() {
      onListenerClose();
    }),
    error: OBJECT_FREEZE(function activeBoundedHttpsError(_error) {
      onListenerError();
    }),
  });

  const callbacks = OBJECT_FREEZE({
    connection: OBJECT_FREEZE(function boundedHttpsConnection(socket) {
      const dispatchTarget = callbackDispatchCell.target;
      if (dispatchTarget === INERT_CALLBACK_DISPATCH) return;
      REFLECT_APPLY(dispatchTarget.connection, undefined, [socket]);
    }),
    secureConnection: OBJECT_FREEZE(function boundedHttpsSecureConnection(socket) {
      const dispatchTarget = callbackDispatchCell.target;
      if (dispatchTarget === INERT_CALLBACK_DISPATCH) return;
      REFLECT_APPLY(dispatchTarget.secureConnection, undefined, [socket]);
    }),
    request: OBJECT_FREEZE(function boundedHttpsRequest(request, response) {
      const dispatchTarget = callbackDispatchCell.target;
      if (dispatchTarget === INERT_CALLBACK_DISPATCH) return;
      REFLECT_APPLY(dispatchTarget.request, undefined, [request, response]);
    }),
    checkContinue: OBJECT_FREEZE(function boundedHttpsCheckContinue(request, response) {
      const dispatchTarget = callbackDispatchCell.target;
      if (dispatchTarget === INERT_CALLBACK_DISPATCH) return;
      REFLECT_APPLY(dispatchTarget.checkContinue, undefined, [request, response]);
    }),
    checkExpectation: OBJECT_FREEZE(function boundedHttpsCheckExpectation(request, response) {
      const dispatchTarget = callbackDispatchCell.target;
      if (dispatchTarget === INERT_CALLBACK_DISPATCH) return;
      REFLECT_APPLY(dispatchTarget.checkExpectation, undefined, [request, response]);
    }),
    upgrade: OBJECT_FREEZE(function boundedHttpsUpgrade(request, socket, head) {
      const dispatchTarget = callbackDispatchCell.target;
      if (dispatchTarget === INERT_CALLBACK_DISPATCH) return;
      REFLECT_APPLY(dispatchTarget.upgrade, undefined, [request, socket, head]);
    }),
    connect: OBJECT_FREEZE(function boundedHttpsConnect(request, socket, head) {
      const dispatchTarget = callbackDispatchCell.target;
      if (dispatchTarget === INERT_CALLBACK_DISPATCH) return;
      REFLECT_APPLY(dispatchTarget.connect, undefined, [request, socket, head]);
    }),
    clientError: OBJECT_FREEZE(function boundedHttpsClientError(error, socket) {
      const dispatchTarget = callbackDispatchCell.target;
      if (dispatchTarget === INERT_CALLBACK_DISPATCH) return;
      REFLECT_APPLY(dispatchTarget.clientError, undefined, [error, socket]);
    }),
    tlsClientError: OBJECT_FREEZE(function boundedHttpsTlsClientError(error, socket) {
      const dispatchTarget = callbackDispatchCell.target;
      if (dispatchTarget === INERT_CALLBACK_DISPATCH) return;
      REFLECT_APPLY(dispatchTarget.tlsClientError, undefined, [error, socket]);
    }),
    dropRequest: OBJECT_FREEZE(function boundedHttpsDropRequest(request, socket) {
      const dispatchTarget = callbackDispatchCell.target;
      if (dispatchTarget === INERT_CALLBACK_DISPATCH) return;
      REFLECT_APPLY(dispatchTarget.dropRequest, undefined, [request, socket]);
    }),
    drop: OBJECT_FREEZE(function boundedHttpsDrop(data) {
      const dispatchTarget = callbackDispatchCell.target;
      if (dispatchTarget === INERT_CALLBACK_DISPATCH) return;
      REFLECT_APPLY(dispatchTarget.drop, undefined, [data]);
    }),
    timeout: OBJECT_FREEZE(function boundedHttpsTimeout(socket) {
      const dispatchTarget = callbackDispatchCell.target;
      if (dispatchTarget === INERT_CALLBACK_DISPATCH) return;
      REFLECT_APPLY(dispatchTarget.timeout, undefined, [socket]);
    }),
    listening: OBJECT_FREEZE(function boundedHttpsListening() {
      const dispatchTarget = callbackDispatchCell.target;
      if (dispatchTarget === INERT_CALLBACK_DISPATCH) return;
      REFLECT_APPLY(dispatchTarget.listening, undefined, []);
    }),
    close: OBJECT_FREEZE(function boundedHttpsClose() {
      const dispatchTarget = callbackDispatchCell.target;
      if (dispatchTarget === INERT_CALLBACK_DISPATCH) return;
      REFLECT_APPLY(dispatchTarget.close, undefined, []);
    }),
    error: OBJECT_FREEZE(function boundedHttpsError(error) {
      const dispatchTarget = callbackDispatchCell.target;
      if (dispatchTarget === INERT_CALLBACK_DISPATCH) return;
      REFLECT_APPLY(dispatchTarget.error, undefined, [error]);
    }),
  });

  function requestDownstreamClose() {
    if (downstreamCloseInvoked) return;
    downstreamCloseInvoked = true;
    let operation;
    try {
      operation = REFLECT_APPLY(downstreamClose, undefined, []);
    } catch {
      downstreamCloseSettled = true;
      downstreamCloseClean = false;
      markPermanentUncertainty();
      return;
    }
    const observation = observeNativePromise(
      operation,
      () => {
        if (closeTerminal) return;
        downstreamCloseSettled = true;
        downstreamCloseClean = true;
        maybeFinishClose();
      },
      () => {
        if (closeTerminal) return;
        downstreamCloseSettled = true;
        downstreamCloseClean = false;
        markPermanentUncertainty();
        maybeFinishClose();
      },
    );
    if (observation !== PROMISE_OBSERVATION.OBSERVED) {
      containDiscardedPromiseRejection(operation);
      downstreamCloseClean = false;
      markPermanentUncertainty();
    }
  }

  function disposeLocalServerCapabilityBestEffort(capability) {
    for (const operation of [capability.close, capability.closeAllConnections]) {
      let result;
      try {
        result = REFLECT_APPLY(operation, undefined, []);
      } catch {
        continue;
      }
      if (isGenuinePromise(result)) containDiscardedPromiseRejection(result);
    }
  }

  const start = OBJECT_FREEZE(function startServiceCreditBoundedHttpsIngressOwner(...args) {
    if (args.length !== 0) return nativeRejected(failure(CODE.invalidInput));
    if (startPromise !== null) return startPromise;
    if (closeTerminal) return nativeRejected(failure(CODE.startUncertain));
    startCapability = nativePromiseCapability();
    startPromise = startCapability.promise;
    increment('startAttempts');
    if (phase !== PHASE.DORMANT || closePromise !== null) {
      startSettled = true;
      increment('startUncertain');
      startCapability.reject(failure(CODE.startUncertain));
      return startPromise;
    }
    phase = PHASE.STARTING;
    if (!scheduleTicket(timerState, 'start', limits.startDeadlineMs, failStart)) {
      failStart();
      return startPromise;
    }
    if (startSettled || permanentUncertainty || timerState.start === null) {
      failStart();
      return startPromise;
    }
    const attemptStartCapability = startCapability;
    const attemptStartPromise = startPromise;
    const attemptStartTicket = timerState.start;
    let returned;
    try {
      returned = REFLECT_APPLY(trustedFactory, undefined, [serverOptions, callbacks]);
    } catch {
      failStart();
      return startPromise;
    }
    let returnedCapability = null;
    if (isGenuinePromise(returned)) {
      containDiscardedPromiseRejection(returned);
    } else {
      returnedCapability = captureServerCapability(returned);
    }
    returned = null;
    if (returnedCapability === null) {
      if (!closeTerminal) failStart();
      return startPromise;
    }
    if (
      closeTerminal
      || closePromise !== null
      || phase !== PHASE.STARTING
      || startSettled
      || permanentUncertainty
      || startCapability !== attemptStartCapability
      || startPromise !== attemptStartPromise
      || timerState.start !== attemptStartTicket
      || attemptStartTicket.active !== true
      || attemptStartTicket.handleReady !== true
    ) {
      disposeLocalServerCapabilityBestEffort(returnedCapability);
      returnedCapability = null;
      if (!closeTerminal) failStart();
      return startPromise;
    }
    factoryReturned = true;
    serverCapability = returnedCapability;
    returnedCapability = null;
    listenInvoked = true;
    let listenResult;
    try {
      listenResult = REFLECT_APPLY(serverCapability.listen, undefined, []);
    } catch {
      failStart();
      return startPromise;
    }
    listenReturned = true;
    if (listenResult !== undefined) {
      if (isGenuinePromise(listenResult)) {
        containDiscardedPromiseRejection(listenResult);
      }
      failStart();
      return startPromise;
    }
    finishStartIfReady();
    return startPromise;
  });

  const close = OBJECT_FREEZE(function closeServiceCreditBoundedHttpsIngressOwner(...args) {
    if (args.length !== 0) return nativeRejected(failure(CODE.invalidInput));
    if (closePromise !== null) return closePromise;
    closeCapability = nativePromiseCapability();
    closePromise = closeCapability.promise;
    admissionOpen = false;
    acceptingConnections = false;
    acceptingRequests = false;
    increment('closeStarted');
    if (!permanentUncertainty && phase !== PHASE.CLOSED) phase = PHASE.CLOSING;

    requestDownstreamClose();
    if (startPromise !== null && !startSettled) failStart();
    if (serverCapability === null) {
      listenerClosed = true;
    } else {
      stopAccepting();
    }
    const secureStates = snapshotMapValues(secureSockets);
    for (let index = 0; index < secureStates.length; index += 1) {
      if (!cancelTicket(secureStates[index], 'headerDeadline')) markPermanentUncertainty();
    }
    const requestStates = snapshotSetValues(activeRequests);
    for (let index = 0; index < requestStates.length; index += 1) {
      const requestState = requestStates[index];
      if (!cancelTicket(requestState, 'deadline')) markPermanentUncertainty();
      requestAbort(requestState);
    }
    const sockets = snapshotSetValues(trackedSockets);
    for (let index = 0; index < sockets.length; index += 1) {
      destroySocket(sockets[index]);
    }
    if (serverCapability !== null && !closeAllInvoked) {
      closeAllInvoked = true;
      let result;
      try {
        result = REFLECT_APPLY(serverCapability.closeAllConnections, undefined, []);
      } catch {
        markPermanentUncertainty();
      }
      if (result !== undefined) {
        if (isGenuinePromise(result)) containDiscardedPromiseRejection(result);
        markPermanentUncertainty();
      }
    }
    if (
      !closeTerminal
      && !scheduleTicket(timerState, 'close', limits.closeGraceMs, finishCloseUncertain)
    ) {
      markPermanentUncertainty();
    }
    if (permanentUncertainty) finishCloseUncertain();
    else maybeFinishClose();
    return closePromise;
  });

  function captureMetricsSnapshot() {
    return OBJECT_FREEZE({
      phase,
      startAttempts: counters.startAttempts,
      startSucceeded: counters.startSucceeded,
      startUncertain: counters.startUncertain,
      connectionStarts: counters.connectionStarts,
      connectionsAccepted: counters.connectionsAccepted,
      connectionsRejected: counters.connectionsRejected,
      tlsRejected: counters.tlsRejected,
      requestStarts: counters.requestStarts,
      requestsAdmitted: counters.requestsAdmitted,
      requestsRejected: counters.requestsRejected,
      handlersSettled: counters.handlersSettled,
      handlerFailures: counters.handlerFailures,
      aborts: counters.aborts,
      socketsDestroyed: counters.socketsDestroyed,
      deadlineExpirations: counters.deadlineExpirations,
      listenerErrors: counters.listenerErrors,
      closeStarted: counters.closeStarted,
      closeClean: counters.closeClean,
      closeUncertain: counters.closeUncertain,
      trackedSockets: setSize(trackedSockets),
      trackedRequests: setSize(activeRequests),
      trackedHandlers: setSize(activeHandlers),
      ownedTimers: setSize(ownedTimers),
    });
  }

  const snapshotMetrics = OBJECT_FREEZE(function snapshotBoundedHttpsIngressMetrics(...args) {
    if (args.length !== 0) throw failure(CODE.invalidInput);
    if (terminalMetricsSnapshot !== null) return terminalMetricsSnapshot;
    return captureMetricsSnapshot();
  });

  return OBJECT_FREEZE({ start, close, snapshotMetrics });
}
