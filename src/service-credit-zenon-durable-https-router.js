import { types as utilTypes } from 'node:util';

import {
  encodeB64Json,
  HEADERS,
  MAX_X402_HEADER_ENCODED_BYTES,
} from './x402-wire.js';

const NATIVE_ARRAY = Array;
const ARRAY_IS_ARRAY = NATIVE_ARRAY.isArray;
const ARRAY_PROTOTYPE = NATIVE_ARRAY.prototype;
const NATIVE_BUFFER = Buffer;
const BUFFER_FROM = NATIVE_BUFFER.from;
const NATIVE_NUMBER = Number;
const NUMBER_IS_FINITE = NATIVE_NUMBER.isFinite;
const NUMBER_IS_SAFE_INTEGER = NATIVE_NUMBER.isSafeInteger;
const NATIVE_OBJECT = Object;
const OBJECT_CREATE = NATIVE_OBJECT.create;
const OBJECT_DEFINE_PROPERTY = NATIVE_OBJECT.defineProperty;
const OBJECT_FREEZE = NATIVE_OBJECT.freeze;
const OBJECT_HAS_OWN = NATIVE_OBJECT.hasOwn;
const OBJECT_IS_EXTENSIBLE = NATIVE_OBJECT.isExtensible;
const OBJECT_IS_FROZEN = NATIVE_OBJECT.isFrozen;
const OBJECT_PROTOTYPE = NATIVE_OBJECT.prototype;
const NATIVE_PROMISE = Promise;
const PROMISE_PROTOTYPE = NATIVE_PROMISE.prototype;
const NATIVE_REFLECT = Reflect;
const REFLECT_APPLY = NATIVE_REFLECT.apply;
const REFLECT_DEFINE_PROPERTY = NATIVE_REFLECT.defineProperty;
const REFLECT_DELETE_PROPERTY = NATIVE_REFLECT.deleteProperty;
const REFLECT_GET_OWN_PROPERTY_DESCRIPTOR = NATIVE_REFLECT.getOwnPropertyDescriptor;
const REFLECT_GET_PROTOTYPE_OF = NATIVE_REFLECT.getPrototypeOf;
const REFLECT_OWN_KEYS = NATIVE_REFLECT.ownKeys;
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
const NATIVE_SYMBOL = Symbol;
const PROMISE_SPECIES = NATIVE_SYMBOL.species;
const PROMISE_SPECIES_DESCRIPTOR = OBJECT_FREEZE(REFLECT_APPLY(
  REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
  NATIVE_REFLECT,
  [NATIVE_PROMISE, PROMISE_SPECIES],
));
const NATIVE_REGEXP = RegExp;
const REGEXP_EXEC = NATIVE_REGEXP.prototype.exec;
const NATIVE_SET = Set;
const SET_ADD = NATIVE_SET.prototype.add;
const SET_DELETE = NATIVE_SET.prototype.delete;
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
const NATIVE_WEAK_SET = WeakSet;
const WEAK_SET_ADD = NATIVE_WEAK_SET.prototype.add;
const WEAK_SET_HAS = NATIVE_WEAK_SET.prototype.has;
const NATIVE_STRING = String;
const STRING_FROM = NATIVE_STRING;
const NATIVE_TYPE_ERROR = TypeError;
const IS_PROMISE = utilTypes.isPromise;
const IS_PROXY = utilTypes.isProxy;
const ENCODE_B64_JSON = encodeB64Json;

const CONFIGURATION_KEYS = OBJECT_FREEZE([
  'requestTargets',
  'getPhase',
  'fundingComposition',
  'fundingResource',
  'durableComposition',
  'handoffController',
]);
const REQUEST_TARGET_KEYS = OBJECT_FREEZE([
  'serviceCredit',
  'handoffChallenge',
  'handoffRedemption',
]);
const FUNDING_COMPOSITION_KEYS = OBJECT_FREEZE(['createFundingResource']);
const FUNDING_RESOURCE_KEYS = OBJECT_FREEZE(['selection', 'resourceUrl']);
const FUNDING_SELECTION_KEYS = OBJECT_FREEZE([
  'offerId',
  'offerVersion',
  'holderId',
  'capabilityCommitment',
]);
const DURABLE_COMPOSITION_KEYS = OBJECT_FREEZE(['handle']);
const HANDOFF_CONTROLLER_KEYS = OBJECT_FREEZE(['handle', 'close']);
const COMPLETION_KEYS = OBJECT_FREEZE(['success', 'failure']);
const FUNDING_CHALLENGE_KEYS = OBJECT_FREEZE([
  'activationIntent',
  'fundingCommitment',
  'paymentRequired',
]);

const REQUEST_TARGET = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@]+(?:\/[A-Za-z0-9\-._~!$&'()*+,;=:@]+)*$/;
const MAX_TARGET_LENGTH = 2_048;
const MAX_POLICY_STRING_LENGTH = 8_192;
const MAX_FROZEN_DATA_DEPTH = 24;
const MAX_FROZEN_DATA_NODES = 8_192;
const FAILURE_TEXT = '{"error":"unavailable"}';
const CHALLENGE_TEXT = '{"error":"payment_required"}';
const JSON_CONTENT_TYPE = 'application/json';

const ROUTING_PHASE = OBJECT_FREEZE({
  UNAVAILABLE: 'UNAVAILABLE',
  CHALLENGE: 'CHALLENGE',
  ACTIVE: 'ACTIVE',
});

const OWNER_PHASE = OBJECT_FREEZE({
  OPEN: 'OPEN',
  QUARANTINED: 'QUARANTINED',
  CLOSING: 'CLOSING',
  CLOSED: 'CLOSED',
  CLOSE_UNCERTAIN: 'CLOSE_UNCERTAIN',
});

const PROMISE_OBSERVATION = OBJECT_FREEZE({
  NOT_PROMISE: 'NOT_PROMISE',
  OBSERVED: 'OBSERVED',
  UNOBSERVABLE: 'UNOBSERVABLE',
});

const CODE = OBJECT_FREEZE({
  invalidConfiguration:
    'SERVICE_CREDIT_ZENON_DURABLE_HTTPS_ROUTER_INVALID_CONFIGURATION',
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

function setAdd(collection, value) {
  return REFLECT_APPLY(SET_ADD, collection, [value]);
}

function setDelete(collection, value) {
  return REFLECT_APPLY(SET_DELETE, collection, [value]);
}

function setSize(collection) {
  return REFLECT_APPLY(SET_SIZE_GETTER, collection, []);
}

function weakSetAdd(collection, value) {
  return REFLECT_APPLY(WEAK_SET_ADD, collection, [value]);
}

function weakSetHas(collection, value) {
  return REFLECT_APPLY(WEAK_SET_HAS, collection, [value]);
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

function allowedKey(expected, candidate) {
  if (typeof candidate !== 'string') return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index] === candidate) return true;
  }
  return false;
}

function exactFrozenDataObject(value, expected) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || REFLECT_APPLY(IS_PROXY, undefined, [value])
      || REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [value]) !== OBJECT_PROTOTYPE
      || !REFLECT_APPLY(OBJECT_IS_FROZEN, NATIVE_OBJECT, [value])
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

function safeFrozenCallable(value) {
  try {
    return typeof value === 'function'
      && !REFLECT_APPLY(IS_PROXY, undefined, [value])
      && REFLECT_APPLY(OBJECT_IS_FROZEN, NATIVE_OBJECT, [value]);
  } catch {
    return false;
  }
}

function regexpMatches(expression, value) {
  return REFLECT_APPLY(REGEXP_EXEC, expression, [value]) !== null;
}

function captureRequestTargets(value) {
  const captured = exactFrozenDataObject(value, REQUEST_TARGET_KEYS);
  if (captured === null) return null;
  const values = [];
  for (let index = 0; index < REQUEST_TARGET_KEYS.length; index += 1) {
    const target = captured[REQUEST_TARGET_KEYS[index]];
    if (
      typeof target !== 'string'
      || target.length === 0
      || target.length > MAX_TARGET_LENGTH
      || !regexpMatches(REQUEST_TARGET, target)
    ) return null;
    for (let prior = 0; prior < values.length; prior += 1) {
      if (values[prior] === target) return null;
    }
    values[values.length] = target;
  }
  return OBJECT_FREEZE({
    serviceCredit: captured.serviceCredit,
    handoffChallenge: captured.handoffChallenge,
    handoffRedemption: captured.handoffRedemption,
  });
}

function captureSingleOperation(value, keys) {
  const captured = exactFrozenDataObject(value, keys);
  if (captured === null) return null;
  for (let index = 0; index < keys.length; index += 1) {
    if (!safeFrozenCallable(captured[keys[index]])) return null;
  }
  return captured;
}

function captureFundingResource(value) {
  const captured = exactFrozenDataObject(value, FUNDING_RESOURCE_KEYS);
  const selection = captured === null
    ? null
    : exactFrozenDataObject(captured.selection, FUNDING_SELECTION_KEYS);
  if (
    selection === null
    || typeof selection.offerId !== 'string'
    || selection.offerId.length === 0
    || selection.offerId.length > MAX_POLICY_STRING_LENGTH
    || !NUMBER_IS_SAFE_INTEGER(selection.offerVersion)
    || selection.offerVersion < 1
    || typeof selection.holderId !== 'string'
    || selection.holderId.length === 0
    || selection.holderId.length > MAX_POLICY_STRING_LENGTH
    || typeof selection.capabilityCommitment !== 'string'
    || selection.capabilityCommitment.length === 0
    || selection.capabilityCommitment.length > MAX_POLICY_STRING_LENGTH
    || typeof captured.resourceUrl !== 'string'
    || captured.resourceUrl.length === 0
    || captured.resourceUrl.length > MAX_POLICY_STRING_LENGTH
  ) return null;
  return OBJECT_FREEZE({
    selection: OBJECT_FREEZE({
      offerId: selection.offerId,
      offerVersion: selection.offerVersion,
      holderId: selection.holderId,
      capabilityCommitment: selection.capabilityCommitment,
    }),
    resourceUrl: captured.resourceUrl,
  });
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
      && typeof PROMISE_THEN === 'function'
      && !REFLECT_APPLY(IS_PROXY, undefined, [PROMISE_THEN])
      && OBJECT_HAS_OWN(PROMISE_PROTOTYPE_CONSTRUCTOR_DESCRIPTOR, 'value')
      && PROMISE_PROTOTYPE_CONSTRUCTOR_DESCRIPTOR.value === NATIVE_PROMISE
      && !OBJECT_HAS_OWN(PROMISE_SPECIES_DESCRIPTOR, 'value')
      && typeof PROMISE_SPECIES_DESCRIPTOR.get === 'function'
      && !REFLECT_APPLY(IS_PROXY, undefined, [PROMISE_SPECIES_DESCRIPTOR.get])
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

function exactNativePromise(value) {
  try {
    return value !== null
      && typeof value === 'object'
      && !REFLECT_APPLY(IS_PROXY, undefined, [value])
      && REFLECT_APPLY(IS_PROMISE, undefined, [value]) === true
      && REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [value])
        === PROMISE_PROTOTYPE;
  } catch {
    return false;
  }
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
  if (!exactNativePromise(promise)) return PROMISE_OBSERVATION.NOT_PROMISE;
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

  let useDirectRoute = false;
  if (constructorDescriptor === undefined) {
    useDirectRoute = capturedNativePromiseRouteIsCurrent();
  } else if (
    OBJECT_HAS_OWN(constructorDescriptor, 'value')
    && constructorDescriptor.value === undefined
  ) {
    useDirectRoute = true;
  } else if (
    OBJECT_HAS_OWN(constructorDescriptor, 'value')
    && constructorDescriptor.value === NATIVE_PROMISE
  ) {
    useDirectRoute = capturedNativePromiseRouteIsCurrent();
  } else {
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
  if (useDirectRoute) {
    try {
      REFLECT_APPLY(PROMISE_THEN, promise, [onFulfilled, onRejected]);
    } catch {
      return PROMISE_OBSERVATION.UNOBSERVABLE;
    }
    callbacksEnabled = true;
    return PROMISE_OBSERVATION.OBSERVED;
  }

  if (
    constructorDescriptor !== undefined
    || !REFLECT_APPLY(OBJECT_IS_EXTENSIBLE, NATIVE_OBJECT, [promise])
  ) return PROMISE_OBSERVATION.UNOBSERVABLE;
  const temporaryDescriptor = {
    configurable: true,
    enumerable: false,
    writable: false,
    value: undefined,
  };
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

function captureCompletion(value) {
  const captured = exactFrozenDataObject(value, COMPLETION_KEYS);
  if (
    captured === null
    || !safeFrozenCallable(captured.success)
    || !safeFrozenCallable(captured.failure)
    || captured.success === captured.failure
  ) return null;
  return OBJECT_FREEZE({
    source: value,
    success: captured.success,
    failure: captured.failure,
  });
}

function captureRequestTarget(value) {
  try {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
      return null;
    }
    if (REFLECT_APPLY(IS_PROXY, undefined, [value])) return null;
    const descriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [value, 'url'],
    );
    if (
      descriptor === undefined
      || !OBJECT_HAS_OWN(descriptor, 'value')
      || typeof descriptor.value !== 'string'
    ) return null;
    return OBJECT_FREEZE({
      request: value,
      descriptor: OBJECT_FREEZE(descriptor),
      target: descriptor.value,
    });
  } catch {
    return null;
  }
}

function requestTargetIsCurrent(snapshot) {
  if (snapshot === null) return false;
  try {
    const descriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [snapshot.request, 'url'],
    );
    return samePropertyDescriptor(descriptor, snapshot.descriptor);
  } catch {
    return false;
  }
}

function captureInheritedCallable(value, key) {
  try {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
      return null;
    }
    let candidate = value;
    for (let depth = 0; depth < MAX_FROZEN_DATA_DEPTH && candidate !== null; depth += 1) {
      if (REFLECT_APPLY(IS_PROXY, undefined, [candidate])) return null;
      const descriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [candidate, key],
      );
      if (descriptor !== undefined) {
        if (!OBJECT_HAS_OWN(descriptor, 'value')) return null;
        return typeof descriptor.value === 'function'
          && !REFLECT_APPLY(IS_PROXY, undefined, [descriptor.value])
          ? descriptor.value
          : null;
      }
      candidate = REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [candidate]);
    }
    return null;
  } catch {
    return null;
  }
}

function frozenDataTree(value, budget, depth = 0) {
  if (
    value === null
    || value === undefined
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) return true;
  if (typeof value === 'number') return NUMBER_IS_FINITE(value);
  if (typeof value !== 'object' || depth > MAX_FROZEN_DATA_DEPTH) return false;
  try {
    if (
      REFLECT_APPLY(IS_PROXY, undefined, [value])
      || !REFLECT_APPLY(OBJECT_IS_FROZEN, NATIVE_OBJECT, [value])
    ) return false;
    const prototype = REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [value]);
    const isArray = REFLECT_APPLY(ARRAY_IS_ARRAY, NATIVE_ARRAY, [value]);
    if (prototype !== (isArray ? ARRAY_PROTOTYPE : OBJECT_PROTOTYPE)) return false;
    const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, NATIVE_REFLECT, [value]);
    budget.nodes += 1;
    if (budget.nodes > MAX_FROZEN_DATA_NODES) return false;
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key !== 'string') return false;
      if (isArray && key === 'length') continue;
      const descriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [value, key],
      );
      if (
        descriptor === undefined
        || !OBJECT_HAS_OWN(descriptor, 'value')
        || !frozenDataTree(descriptor.value, budget, depth + 1)
      ) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function captureFundingChallenge(value) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || REFLECT_APPLY(IS_PROXY, undefined, [value])
    ) return null;
    const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, NATIVE_REFLECT, [value]);
    if (keys.length !== FUNDING_CHALLENGE_KEYS.length) return null;
    for (let index = 0; index < FUNDING_CHALLENGE_KEYS.length; index += 1) {
      const key = keys[index];
      if (!allowedKey(FUNDING_CHALLENGE_KEYS, key)) return null;
      const keyDescriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [value, key],
      );
      if (keyDescriptor === undefined || !OBJECT_HAS_OWN(keyDescriptor, 'value')) {
        return null;
      }
    }
    const descriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [value, 'paymentRequired'],
    );
    if (
      descriptor === undefined
      || !OBJECT_HAS_OWN(descriptor, 'value')
      || descriptor.value === null
      || typeof descriptor.value !== 'object'
      || !frozenDataTree(descriptor.value, { nodes: 0 })
    ) return null;
    return descriptor.value;
  } catch {
    return null;
  }
}

function attemptResponse(response, statusCode, headers, body) {
  const writeHead = captureInheritedCallable(response, 'writeHead');
  const end = captureInheritedCallable(response, 'end');
  const destroy = captureInheritedCallable(response, 'destroy');
  if (writeHead === null || end === null) {
    if (destroy !== null) {
      try { REFLECT_APPLY(destroy, response, []); } catch {}
    }
    return false;
  }
  try {
    if (headers === null) REFLECT_APPLY(writeHead, response, [statusCode]);
    else REFLECT_APPLY(writeHead, response, [statusCode, headers]);
    if (body === null) REFLECT_APPLY(end, response, []);
    else REFLECT_APPLY(end, response, [body]);
    return true;
  } catch {
    if (destroy !== null) {
      try { REFLECT_APPLY(destroy, response, []); } catch {}
    }
    return false;
  }
}

function sendUnavailable(response) {
  return attemptResponse(response, 503, null, null);
}

function sendHandoffUnavailable(response) {
  const body = REFLECT_APPLY(BUFFER_FROM, NATIVE_BUFFER, [FAILURE_TEXT, 'utf8']);
  return attemptResponse(response, 503, {
    'Content-Type': JSON_CONTENT_TYPE,
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': STRING_FROM(body.length),
    Connection: 'close',
  }, body);
}

function sendFundingChallenge(response, paymentRequired) {
  let encoded;
  try {
    encoded = REFLECT_APPLY(ENCODE_B64_JSON, undefined, [paymentRequired, {
      maxEncodedBytes: MAX_X402_HEADER_ENCODED_BYTES,
    }]);
  } catch {
    return false;
  }
  return attemptResponse(response, 402, {
    'Content-Type': JSON_CONTENT_TYPE,
    'Cache-Control': 'private, no-store',
    [HEADERS.PAYMENT_REQUIRED]: encoded,
  }, CHALLENGE_TEXT);
}

/**
 * Creates one inert, listenerless downstream lifecycle for the bounded HTTPS
 * ingress owner. Routing is fixed at construction and no operation runs until
 * handle or close is called.
 */
export function createServiceCreditZenonDurableHttpsRouter(options) {
  if (arguments.length !== 1) throw failure(CODE.invalidConfiguration);
  let configuration = exactFrozenDataObject(options, CONFIGURATION_KEYS);
  const requestTargets = configuration === null
    ? null
    : captureRequestTargets(configuration.requestTargets);
  const fundingComposition = configuration === null
    ? null
    : captureSingleOperation(
      configuration.fundingComposition,
      FUNDING_COMPOSITION_KEYS,
    );
  const fundingResource = configuration === null
    ? null
    : captureFundingResource(configuration.fundingResource);
  const durableComposition = configuration === null
    ? null
    : captureSingleOperation(
      configuration.durableComposition,
      DURABLE_COMPOSITION_KEYS,
    );
  const handoffController = configuration === null
    ? null
    : captureSingleOperation(
      configuration.handoffController,
      HANDOFF_CONTROLLER_KEYS,
    );
  if (
    configuration === null
    || requestTargets === null
    || fundingComposition === null
    || fundingResource === null
    || durableComposition === null
    || handoffController === null
    || !safeFrozenCallable(configuration.getPhase)
  ) throw failure(CODE.invalidConfiguration);

  let getPhase = configuration.getPhase;
  let createFundingResource = fundingComposition.createFundingResource;
  let durableHandle = durableComposition.handle;
  let handoffHandle = handoffController.handle;
  let handoffClose = handoffController.close;
  configuration = null;
  options = null;

  let phase = OWNER_PHASE.OPEN;
  let uncertainty = false;
  let closeStarted = false;
  let closeTerminal = null;
  let handoffCloseSettled = false;
  let handoffCloseClean = false;
  const activeOperations = new NATIVE_SET();
  const observedUnexpectedOperations = new NATIVE_SET();
  const closeCompletions = new NATIVE_SET();
  const consumedCompletions = new NATIVE_WEAK_SET();
  const closeCompletionSources = new NATIVE_WEAK_SET();

  function markUncertain() {
    uncertainty = true;
    if (phase === OWNER_PHASE.OPEN) phase = OWNER_PHASE.QUARANTINED;
  }

  function consumeCompletion(value) {
    const completion = captureCompletion(value);
    if (completion === null) return null;
    if (weakSetHas(consumedCompletions, completion.source)) {
      markUncertain();
      return null;
    }
    weakSetAdd(consumedCompletions, completion.source);
    return completion;
  }

  function invokeCompletion(completion, clean) {
    if (completion === null) return false;
    let completed = false;
    try {
      REFLECT_APPLY(clean ? completion.success : completion.failure, undefined, []);
      completed = true;
    } catch {
      markUncertain();
    }
    return completed;
  }

  function maybeFinishClose() {
    if (
      !closeStarted
      || closeTerminal !== null
      || !handoffCloseSettled
      || setSize(activeOperations) !== 0
      || setSize(observedUnexpectedOperations) !== 0
    ) return;
    const clean = !uncertainty && handoffCloseClean;
    closeTerminal = clean ? OWNER_PHASE.CLOSED : OWNER_PHASE.CLOSE_UNCERTAIN;
    phase = closeTerminal;
    const completions = snapshotSetValues(closeCompletions);
    for (let index = 0; index < completions.length; index += 1) {
      const cell = completions[index];
      if (cell.settled) continue;
      cell.settled = true;
      invokeCompletion(cell.completion, clean);
      cell.completion = null;
      setDelete(closeCompletions, cell);
    }
    getPhase = null;
    createFundingResource = null;
    durableHandle = null;
    handoffHandle = null;
    handoffClose = null;
  }

  function beginHandle(completionValue) {
    const completion = consumeCompletion(completionValue);
    if (completion === null) return null;
    const operation = {
      completion,
      settled: false,
    };
    setAdd(activeOperations, operation);
    return operation;
  }

  function settleHandle(operation, clean) {
    if (operation === null || operation.settled) return;
    operation.settled = true;
    if (!clean) markUncertain();
    invokeCompletion(operation.completion, clean);
    operation.completion = null;
    setDelete(activeOperations, operation);
    maybeFinishClose();
  }

  function trackUnexpectedNativePromise(value) {
    if (!exactNativePromise(value)) return false;
    const record = { settled: false };
    setAdd(observedUnexpectedOperations, record);
    const settled = () => {
      if (record.settled) return;
      record.settled = true;
      setDelete(observedUnexpectedOperations, record);
      maybeFinishClose();
    };
    const observation = observeNativePromise(value, settled, settled);
    if (observation !== PROMISE_OBSERVATION.OBSERVED) {
      setDelete(observedUnexpectedOperations, record);
      return false;
    }
    return true;
  }

  function failHandle(operation, response, handoffFailure) {
    if (handoffFailure) sendHandoffUnavailable(response);
    else sendUnavailable(response);
    settleHandle(operation, false);
  }

  function observeHandleOperation(operation, returned, response, handoffFailure) {
    const observation = observeNativePromise(
      returned,
      () => settleHandle(operation, true),
      () => failHandle(operation, response, handoffFailure),
    );
    if (observation !== PROMISE_OBSERVATION.OBSERVED) {
      failHandle(operation, response, handoffFailure);
    }
  }

  function invokeAsyncOwner(operation, callback, args, response, handoffFailure) {
    let returned;
    try {
      returned = REFLECT_APPLY(callback, undefined, args);
    } catch {
      failHandle(operation, response, handoffFailure);
      return;
    }
    observeHandleOperation(operation, returned, response, handoffFailure);
    returned = undefined;
  }

  const handle = OBJECT_FREEZE(function serviceCreditZenonDurableHttpsRouterHandle(
    request,
    response,
    transportContext,
    completionValue,
  ) {
    const operation = beginHandle(completionValue);
    const targetSnapshot = captureRequestTarget(request);
    const target = targetSnapshot === null ? null : targetSnapshot.target;
    const handoffTarget = target === requestTargets.handoffChallenge
      || target === requestTargets.handoffRedemption;
    if (operation === null) {
      markUncertain();
      if (handoffTarget) sendHandoffUnavailable(response);
      else sendUnavailable(response);
      return undefined;
    }
    if (arguments.length !== 4 || phase !== OWNER_PHASE.OPEN) {
      failHandle(operation, response, handoffTarget);
      return undefined;
    }
    if (
      target !== requestTargets.serviceCredit
      && target !== requestTargets.handoffChallenge
      && target !== requestTargets.handoffRedemption
    ) {
      failHandle(operation, response, false);
      return undefined;
    }

    let routingPhase;
    try {
      routingPhase = REFLECT_APPLY(getPhase, undefined, []);
    } catch {
      failHandle(operation, response, handoffTarget);
      return undefined;
    }
    if (
      routingPhase !== ROUTING_PHASE.UNAVAILABLE
      && routingPhase !== ROUTING_PHASE.CHALLENGE
      && routingPhase !== ROUTING_PHASE.ACTIVE
    ) {
      if (trackUnexpectedNativePromise(routingPhase)) markUncertain();
      failHandle(operation, response, handoffTarget);
      return undefined;
    }
    if (phase !== OWNER_PHASE.OPEN || !requestTargetIsCurrent(targetSnapshot)) {
      failHandle(operation, response, handoffTarget);
      return undefined;
    }

    if (handoffTarget) {
      if (routingPhase !== ROUTING_PHASE.ACTIVE) {
        const clean = sendHandoffUnavailable(response);
        settleHandle(operation, clean);
        return undefined;
      }
      invokeAsyncOwner(
        operation,
        handoffHandle,
        [request, response, transportContext],
        response,
        true,
      );
      return undefined;
    }

    if (routingPhase === ROUTING_PHASE.UNAVAILABLE) {
      const clean = sendUnavailable(response);
      settleHandle(operation, clean);
      return undefined;
    }
    if (routingPhase === ROUTING_PHASE.ACTIVE) {
      invokeAsyncOwner(
        operation,
        durableHandle,
        [request, response],
        response,
        false,
      );
      return undefined;
    }

    let challenge;
    try {
      challenge = REFLECT_APPLY(createFundingResource, undefined, [fundingResource]);
    } catch {
      failHandle(operation, response, false);
      return undefined;
    }
    const paymentRequired = captureFundingChallenge(challenge);
    if (
      paymentRequired === null
      || phase !== OWNER_PHASE.OPEN
      || !requestTargetIsCurrent(targetSnapshot)
    ) {
      if (trackUnexpectedNativePromise(challenge)) markUncertain();
      failHandle(operation, response, false);
      return undefined;
    }
    const clean = sendFundingChallenge(response, paymentRequired);
    settleHandle(operation, clean);
    return undefined;
  });

  function startHandoffClose() {
    let returned;
    try {
      returned = REFLECT_APPLY(handoffClose, undefined, []);
    } catch {
      handoffCloseSettled = true;
      handoffCloseClean = false;
      markUncertain();
      maybeFinishClose();
      return;
    }
    const observation = observeNativePromise(
      returned,
      () => {
        if (handoffCloseSettled) return;
        handoffCloseSettled = true;
        handoffCloseClean = true;
        maybeFinishClose();
      },
      () => {
        if (handoffCloseSettled) return;
        handoffCloseSettled = true;
        handoffCloseClean = false;
        markUncertain();
        maybeFinishClose();
      },
    );
    if (observation !== PROMISE_OBSERVATION.OBSERVED) {
      handoffCloseSettled = true;
      handoffCloseClean = false;
      markUncertain();
      maybeFinishClose();
    }
    returned = undefined;
  }

  const close = OBJECT_FREEZE(function closeServiceCreditZenonDurableHttpsRouter(
    completionValue,
  ) {
    const completion = captureCompletion(completionValue);
    if (completion === null) {
      markUncertain();
      if (!closeStarted) {
        closeStarted = true;
        phase = OWNER_PHASE.CLOSING;
        startHandoffClose();
      }
      maybeFinishClose();
      return undefined;
    }
    if (weakSetHas(closeCompletionSources, completion.source)) return undefined;
    if (weakSetHas(consumedCompletions, completion.source)) {
      markUncertain();
      if (!closeStarted) {
        closeStarted = true;
        phase = OWNER_PHASE.CLOSING;
        startHandoffClose();
      }
      maybeFinishClose();
      return undefined;
    }
    weakSetAdd(consumedCompletions, completion.source);
    weakSetAdd(closeCompletionSources, completion.source);
    if (arguments.length !== 1) markUncertain();
    const cell = { completion, settled: false };
    if (closeTerminal !== null) {
      cell.settled = true;
      invokeCompletion(completion, closeTerminal === OWNER_PHASE.CLOSED);
      cell.completion = null;
      return undefined;
    }
    setAdd(closeCompletions, cell);
    if (!closeStarted) {
      closeStarted = true;
      phase = OWNER_PHASE.CLOSING;
      startHandoffClose();
    }
    maybeFinishClose();
    return undefined;
  });

  return OBJECT_FREEZE({ handle, close });
}
