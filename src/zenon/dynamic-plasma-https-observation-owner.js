import { types as utilTypes } from 'node:util';
import { createDynamicPlasmaHttpsReadTransportOwner } from './dynamic-plasma-https-read-transport-owner.js';
import { createDynamicPlasmaObservationCollector } from './dynamic-plasma-observation-collector.js';
import { normalizeDynamicPlasmaObservation } from './dynamic-plasma-observation-normalizer.js';

// One-shot, default-off composition boundary. Construction is inert. The
// returned capability can only collect and normalize one detached UNSIGNED
// observation, or close both private transport owners. It never persists or
// promotes the observation and never exposes either transport.

const freeze = Object.freeze;
const create = Object.create;
const define = Object.defineProperty;
const descriptor = Object.getOwnPropertyDescriptor;
const names = Object.getOwnPropertyNames;
const prototype = Object.getPrototypeOf;
const keys = Reflect.ownKeys;
const apply = Reflect.apply;
const hasOwn = Object.hasOwn;
const isFrozen = Object.isFrozen;
const same = Object.is;
const isArray = Array.isArray;
const isSafeInteger = Number.isSafeInteger;
const toString = String;
const isProxy = utilTypes.isProxy;
const isPromise = utilTypes.isPromise;
const objectPrototype = Object.prototype;
const arrayPrototype = Array.prototype;
const functionPrototype = Function.prototype;
const NativePromise = Promise;
const promisePrototype = Promise.prototype;
const promiseThen = Promise.prototype.then;
const promiseSpecies = Symbol.species;
const promiseConstructorDescriptor = descriptor(promisePrototype, 'constructor');
const promiseSpeciesDescriptor = descriptor(NativePromise, promiseSpecies);
const promiseThenDescriptor = descriptor(promisePrototype, 'then');
const initialObjectThenDescriptor = descriptor(objectPrototype, 'then');
const initialObjectPrototype = prototype(objectPrototype);
const objectBaseline = snapshotObjectPrototype();
const NativeError = Error;
const NativeTypeError = TypeError;

const OPTION_FIELDS = freeze(['endpoints']);
const ENDPOINT_FIELDS = freeze(['route', 'timeoutMs', 'closeGraceMs']);
const ROUTE_FIELDS = freeze(['hostname', 'path', 'ipv4Address']);
const OWNER_FIELDS = freeze(['transport', 'close']);
const TRANSPORT_FIELDS = freeze(['callRead']);
const MAX_MILLISECONDS = 60000;
const INVALID = Symbol('invalid');
const NEW = 0;
const OBSERVING = 1;
const CLOSING = 2;
const CLOSED = 3;
const CLOSE_UNCERTAIN = 4;

function put(target, key, value, enumerable = true) {
  const attributes = create(null);
  attributes.value = value;
  attributes.enumerable = enumerable;
  attributes.writable = false;
  attributes.configurable = false;
  define(target, key, attributes);
}

function dataDescriptor(value, enumerable, writable, configurable) {
  const result = create(null);
  result.value = value;
  result.enumerable = enumerable;
  result.writable = writable;
  result.configurable = configurable;
  return result;
}

function record(fields) {
  const result = create(null);
  const fieldsKeys = keys(fields);
  for (let index = 0; index < fieldsKeys.length; index += 1) {
    const key = fieldsKeys[index];
    put(result, key, fields[key]);
  }
  return freeze(result);
}

function invalid() { throw INVALID; }

function sameDescriptor(actual, expected) {
  if (actual === undefined || expected === undefined) return actual === expected;
  const expectedKeys = keys(expected);
  if (keys(actual).length !== expectedKeys.length) return false;
  for (let index = 0; index < expectedKeys.length; index += 1) {
    const key = expectedKeys[index];
    if (!hasOwn(actual, key) || !same(actual[key], expected[key])) return false;
  }
  return true;
}

function snapshotObjectPrototype() {
  const baseline = create(null);
  const own = keys(objectPrototype);
  for (let index = 0; index < own.length; index += 1) {
    put(baseline, own[index], freeze(descriptor(objectPrototype, own[index])));
  }
  return freeze(baseline);
}

function sameObjectPrototype() {
  if (initialObjectPrototype !== null || prototype(objectPrototype) !== null) return false;
  const own = keys(objectPrototype);
  if (own.length !== keys(objectBaseline).length) return false;
  for (let index = 0; index < own.length; index += 1) {
    const key = own[index];
    if (!hasOwn(objectBaseline, key) || !sameDescriptor(descriptor(objectPrototype, key), objectBaseline[key])) return false;
  }
  return true;
}

function invariant() {
  return initialObjectThenDescriptor === undefined && descriptor(objectPrototype, 'then') === undefined &&
    sameObjectPrototype() &&
    sameDescriptor(descriptor(promisePrototype, 'constructor'), promiseConstructorDescriptor) &&
    sameDescriptor(descriptor(NativePromise, promiseSpecies), promiseSpeciesDescriptor) &&
    sameDescriptor(descriptor(promisePrototype, 'then'), promiseThenDescriptor);
}

function fixedError(kind) {
  const typed = kind === 'configuration_rejected' || kind === 'input_rejected';
  let label = 'unavailable';
  if (kind === 'configuration_rejected') label = 'configuration rejected';
  else if (kind === 'input_rejected') label = 'input rejected';
  else if (kind === 'busy') label = 'busy';
  else if (kind === 'closed') label = 'closed';
  else if (kind === 'close_uncertain') label = 'close uncertain';
  const message = `Dynamic Plasma HTTPS observation owner ${label}`;
  const error = typed ? new NativeTypeError(message) : new NativeError(message);
  define(error, 'stack', dataDescriptor(
    `${typed ? 'TypeError' : 'Error'}: ${message}`, false, false, false,
  ));
  put(error, 'code', `dynamic_plasma_https_observation_owner_${kind}`);
  return freeze(error);
}

function discard() {}

function pending() {
  let resolve;
  let reject;
  const promise = new NativePromise((accept, refuse) => { resolve = accept; reject = refuse; });
  const bridge = apply(promiseThen, promise, [discard, discard]);
  if (!nativePromise(bridge)) invalid();
  return record({ promise: freeze(promise), resolve, reject });
}

function rejectedError(error) {
  const result = pending();
  result.reject(error);
  return result.promise;
}

function nativePromise(value) {
  if (value === null || typeof value !== 'object' || isProxy(value) || !isPromise(value) ||
      prototype(value) !== promisePrototype || names(value).length !== 0 || !invariant()) return false;
  const ownConstructor = descriptor(value, 'constructor');
  return ownConstructor === undefined ||
    (hasOwn(ownConstructor, 'value') && ownConstructor.value === NativePromise &&
      ownConstructor.writable === false && ownConstructor.enumerable === false &&
      ownConstructor.configurable === false);
}

function observePromise(value, accepted, rejectedValue) {
  if (!nativePromise(value)) return false;
  let bridge;
  try { bridge = apply(promiseThen, value, [accepted, rejectedValue]); }
  catch { return false; }
  if (!nativePromise(bridge)) return false;
  try {
    const drain = apply(promiseThen, bridge, [discard, discard]);
    return nativePromise(drain);
  } catch { return false; }
}

function exact(value, fields, expectedPrototype) {
  if (value === null || typeof value !== 'object' || isProxy(value) ||
      prototype(value) !== expectedPrototype || !isFrozen(value) || keys(value).length !== fields.length) invalid();
  const result = create(null);
  for (let index = 0; index < fields.length; index += 1) {
    const key = fields[index];
    const item = descriptor(value, key);
    if (item === undefined || !hasOwn(item, 'value') || item.enumerable !== true ||
        item.writable !== false || item.configurable !== false) invalid();
    put(result, key, item.value);
  }
  return freeze(result);
}

function exactArray(value, length) {
  if (value === null || typeof value !== 'object' || isProxy(value) || !isArray(value) ||
      prototype(value) !== arrayPrototype || !isFrozen(value) || keys(value).length !== length + 1) invalid();
  const lengthDescriptor = descriptor(value, 'length');
  if (lengthDescriptor === undefined || !hasOwn(lengthDescriptor, 'value') || lengthDescriptor.value !== length ||
      lengthDescriptor.writable !== false || lengthDescriptor.enumerable !== false ||
      lengthDescriptor.configurable !== false) invalid();
  const result = [];
  for (let index = 0; index < length; index += 1) {
    const item = descriptor(value, toString(index));
    if (item === undefined || !hasOwn(item, 'value') || item.enumerable !== true ||
        item.writable !== false || item.configurable !== false) invalid();
    define(result, toString(index), dataDescriptor(item.value, true, false, false));
  }
  return freeze(result);
}

function milliseconds(value) {
  if (!isSafeInteger(value) || same(value, -0) || value < 1 || value > MAX_MILLISECONDS) invalid();
  return value;
}

function nonemptyString(value) {
  if (typeof value !== 'string' || value.length === 0) invalid();
  return value;
}

function snapshotEndpoint(value) {
  const endpoint = exact(value, ENDPOINT_FIELDS, objectPrototype);
  const route = exact(endpoint.route, ROUTE_FIELDS, objectPrototype);
  return freeze({
    route: freeze({
      hostname: nonemptyString(route.hostname),
      path: nonemptyString(route.path),
      ipv4Address: nonemptyString(route.ipv4Address),
    }),
    timeoutMs: milliseconds(endpoint.timeoutMs),
    closeGraceMs: milliseconds(endpoint.closeGraceMs),
  });
}

function snapshotOptions(options) {
  if (!invariant()) invalid();
  const top = exact(options, OPTION_FIELDS, objectPrototype);
  const endpoints = exactArray(top.endpoints, 2);
  const first = snapshotEndpoint(endpoints[0]);
  const second = snapshotEndpoint(endpoints[1]);
  if (first.route.hostname === second.route.hostname && first.route.path === second.route.path &&
      first.route.ipv4Address === second.route.ipv4Address) invalid();
  return freeze([first, second]);
}

function snapshotOwner(value) {
  const owner = exact(value, OWNER_FIELDS, objectPrototype);
  const transport = exact(owner.transport, TRANSPORT_FIELDS, objectPrototype);
  if (typeof transport.callRead !== 'function' || isProxy(transport.callRead) ||
      prototype(transport.callRead) !== functionPrototype || !isFrozen(transport.callRead) ||
      typeof owner.close !== 'function' || isProxy(owner.close) ||
      prototype(owner.close) !== functionPrototype || !isFrozen(owner.close)) invalid();
  return record({ callRead: transport.callRead, close: owner.close });
}

function phaseIsUnsigned(input) {
  if (input === null || typeof input !== 'object' || isProxy(input) || prototype(input) !== objectPrototype) return false;
  const phase = descriptor(input, 'phase');
  return phase !== undefined && hasOwn(phase, 'value') && phase.enumerable === true && phase.value === 'UNSIGNED';
}

function requestConstructionCleanup(owners) {
  for (let index = 0; index < owners.length; index += 1) {
    try {
      const result = apply(owners[index].close, undefined, []);
      if (nativePromise(result)) observePromise(result, discard, discard);
    } catch { /* construction remains rejected and no diagnostic escapes */ }
  }
}

export function createDynamicPlasmaHttpsObservationOwner(options) {
  let endpointOptions;
  let owners = [];
  try {
    if (arguments.length !== 1) invalid();
    endpointOptions = snapshotOptions(options);
    const first = snapshotOwner(createDynamicPlasmaHttpsReadTransportOwner(endpointOptions[0]));
    owners = [first];
    const second = snapshotOwner(createDynamicPlasmaHttpsReadTransportOwner(endpointOptions[1]));
    owners = [first, second];
    if (first.callRead === second.callRead || first.close === second.close) invalid();
  } catch {
    requestConstructionCleanup(owners);
    throw fixedError('configuration_rejected');
  }

  const errors = record({
    configurationRejected: fixedError('configuration_rejected'),
    inputRejected: fixedError('input_rejected'),
    busy: fixedError('busy'),
    closed: fixedError('closed'),
    unavailable: fixedError('unavailable'),
    closeUncertain: fixedError('close_uncertain'),
  });
  const invalidObserve = rejectedError(errors.inputRejected);
  const busyObserve = rejectedError(errors.busy);
  const closedObserve = rejectedError(errors.closed);
  const invalidClose = rejectedError(errors.configurationRejected);
  const terminalUnavailableRead = rejectedError(errors.unavailable);
  const reservedObservation = pending();
  const closeCapability = pending();
  const firstReadCapability = pending();
  let state = NEW;
  let explicitClose = false;
  let attemptDone = true;
  let observationCapability = null;
  let observationCandidate = null;
  let observationFailure = null;
  let runtimeDrifted = false;
  let firstReadRequest = null;
  let firstReadRequested = false;
  let firstReadReleased = false;
  const closeRequested = [false, false];
  const closeSettled = [false, false];
  const closeClean = [false, false];
  // Private per-endpoint settlement lets B admission await physical A closure
  // without exposing either lifecycle capability publicly.
  const endpointCloseCapabilities = [pending(), pending()];
  let bAdmitted = false;

  function maybeSettle() {
    if (state !== CLOSING || !attemptDone || !closeSettled[0] || !closeSettled[1]) return;
    if (!closeClean[0] || !closeClean[1] || !invariant()) {
      state = CLOSE_UNCERTAIN;
      closeCapability.reject(errors.closeUncertain);
      if (observationCapability !== null) observationCapability.reject(errors.closeUncertain);
      observationCandidate = null;
      return;
    }
    state = CLOSED;
    closeCapability.resolve(undefined);
    if (observationCapability === null) return;
    if (explicitClose) observationCapability.reject(errors.closed);
    else if (observationFailure === 'input_rejected') observationCapability.reject(errors.inputRejected);
    else if (observationFailure !== null) observationCapability.reject(errors.unavailable);
    else observationCapability.resolve(observationCandidate);
    observationCandidate = null;
  }

  function settleClose(index, clean) {
    if (closeSettled[index]) return;
    endpointCloseCapabilities[index][clean ? 'resolve' : 'reject'](undefined);
    closeSettled[index] = true;
    closeClean[index] = clean && invariant();
    maybeSettle();
  }

  function requestOwnerClose(index) {
    if (closeRequested[index]) return;
    closeRequested[index] = true;
    let result;
    try { result = apply(owners[index].close, undefined, []); }
    catch { settleClose(index, false); return; }
    // The imported owner contract prehandles every returned close Promise.
    // When mechanics remain trusted, attach our reaction immediately before
    // performing any other fallible work. Drift makes closure uncertain while
    // leaving that owner-prehandled rejection safely drained.
    if (!observePromise(result, () => settleClose(index, true), () => settleClose(index, false))) {
      settleClose(index, false);
    }
  }

  function startClosing() {
    if (state !== CLOSED && state !== CLOSE_UNCERTAIN) state = CLOSING;
    requestOwnerClose(0);
    requestOwnerClose(1);
    maybeSettle();
  }

  function proxySecondRead(request) {
    const outward = pending();
    function invokeSecond() {
      if (state !== OBSERVING || !closeClean[0] || !invariant()) {
        outward.reject(errors.unavailable);
        return;
      }
      let result;
      try { result = apply(owners[1].callRead, undefined, [request]); }
      catch { outward.reject(errors.unavailable); return; }
      // The private owner also prehandles unsafe returned read Promises. When
      // mechanics are still trusted, attach before any subsequent work.
      if (!observePromise(result,
        value => {
          if (state === OBSERVING && invariant() && typeof value === 'string') outward.resolve(value);
          else outward.reject(errors.unavailable);
        },
        () => outward.reject(errors.unavailable))) outward.reject(errors.unavailable);
    }
    if (!bAdmitted) {
      bAdmitted = true;
      requestOwnerClose(0);
      if (closeSettled[0]) invokeSecond();
      else {
        const wait = closeCapabilityForEndpoint(0);
        if (!observePromise(wait, invokeSecond, () => outward.reject(errors.unavailable))) {
          outward.reject(errors.unavailable);
        }
      }
    } else invokeSecond();
    return outward.promise;
  }

  function closeCapabilityForEndpoint(index) { return endpointCloseCapabilities[index].promise; }

  function settleFirstReadUnavailable() {
    if (!invariant()) runtimeDrifted = true;
    firstReadRequest = null;
    firstReadCapability.reject(errors.unavailable);
  }

  function releaseFirstRead() {
    if (!firstReadRequested || firstReadReleased) return;
    firstReadReleased = true;
    const request = firstReadRequest;
    firstReadRequest = null;
    if (state !== OBSERVING || !invariant()) {
      if (!invariant()) runtimeDrifted = true;
      firstReadCapability.reject(errors.unavailable);
      return;
    }
    let result;
    try { result = apply(owners[0].callRead, undefined, [request]); }
    catch { settleFirstReadUnavailable(); return; }
    // The collector Promise is already directly drained before this native
    // capability can run. The imported owner contract prehandles unsafe
    // returned rejections; attach our reaction only while mechanics are safe.
    if (!observePromise(result,
      value => {
        if (state === OBSERVING && invariant() && typeof value === 'string') firstReadCapability.resolve(value);
        else settleFirstReadUnavailable();
      },
      settleFirstReadUnavailable)) settleFirstReadUnavailable();
  }

  const firstCallRead = freeze(function callRead(request) {
    if (arguments.length !== 1 || state !== OBSERVING || !invariant()) return terminalUnavailableRead;
    if (!firstReadRequested) {
      firstReadRequested = true;
      firstReadRequest = request;
      return firstReadCapability.promise;
    }
    // Only the first call is gated. Once its settlement releases the
    // collector, later A calls retain the reviewed transport contract.
    return apply(owners[0].callRead, undefined, [request]);
  });

  const secondCallRead = freeze(function callRead(request) {
    // This terminal Promise was created and prehandled during construction.
    // Admission failure therefore performs no Promise work after drift.
    if (arguments.length !== 1 || state !== OBSERVING || runtimeDrifted || !invariant()) {
      return terminalUnavailableRead;
    }
    return proxySecondRead(request);
  });
  const secondTransport = freeze({ callRead: secondCallRead });
  let collector;
  try {
    collector = createDynamicPlasmaObservationCollector(freeze({
      transports: freeze([freeze({ callRead: firstCallRead }), secondTransport]),
    }));
  } catch {
    attemptDone = true;
    state = CLOSING;
    startClosing();
    throw errors.configurationRejected;
  }

  function collected(value) {
    if (runtimeDrifted) observationFailure = 'unavailable';
    else if (state === OBSERVING && invariant()) {
      try { observationCandidate = normalizeDynamicPlasmaObservation(value); }
      catch { observationFailure = 'unavailable'; }
    } else observationFailure = explicitClose ? 'closed' : 'unavailable';
    attemptDone = true;
    startClosing();
  }

  function collectionRejected() {
    observationFailure = explicitClose ? 'closed' : runtimeDrifted || !invariant() ? 'unavailable' : 'input_rejected';
    attemptDone = true;
    startClosing();
  }

  const observe = freeze(function observe(input) {
    if (arguments.length !== 1) return invalidObserve;
    if (state === OBSERVING) return busyObserve;
    if (state !== NEW) return closedObserve;
    observationCapability = reservedObservation;
    observationCandidate = null;
    observationFailure = null;
    attemptDone = false;
    state = OBSERVING;
    if (!invariant() || !phaseIsUnsigned(input)) {
      observationFailure = 'input_rejected';
      attemptDone = true;
      startClosing();
      return observationCapability.promise;
    }
    let collection;
    try { collection = apply(collector.collect, undefined, [input]); }
    catch {
      observationFailure = 'unavailable';
      attemptDone = true;
      startClosing();
      return observationCapability.promise;
    }
    // firstCallRead returned only a construction-time deferred, so no native
    // transport capability has run. Drain the actual collector Promise
    // directly before releasing that deferred and invoking endpoint A.
    if (!observePromise(collection, collected, collectionRejected)) {
      observationFailure = 'unavailable';
      attemptDone = true;
      startClosing();
      return observationCapability.promise;
    }
    releaseFirstRead();
    return observationCapability.promise;
  });

  const close = freeze(function close() {
    if (arguments.length !== 0) return invalidClose;
    if (state === CLOSED || state === CLOSE_UNCERTAIN) return closeCapability.promise;
    explicitClose = true;
    if (state === NEW) attemptDone = true;
    startClosing();
    return closeCapability.promise;
  });

  return freeze({ observe, close });
}
