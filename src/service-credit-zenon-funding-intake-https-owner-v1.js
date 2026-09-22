import { types as utilTypes } from 'node:util';

import {
  createServiceCreditBoundedHttpsIngressOwner,
} from './service-credit-bounded-https-ingress-owner.js';
import {
  createServiceCreditBoundedNodeHttpsServerFactory,
} from './service-credit-bounded-node-https-server-factory.js';
import {
  createZenonFundingIntakeHttpPostV1Adapter,
} from './service-credit-zenon-funding-intake-http-post-v1.js';

const NativeArray = Array;
const isArray = NativeArray.isArray;
const NativeObject = Object;
const create = NativeObject.create;
const define = NativeObject.defineProperty;
const descriptor = NativeObject.getOwnPropertyDescriptor;
const names = NativeObject.getOwnPropertyNames;
const freeze = NativeObject.freeze;
const hasOwn = NativeObject.hasOwn;
const isExtensible = NativeObject.isExtensible;
const isFrozen = NativeObject.isFrozen;
const objectPrototype = NativeObject.prototype;
const NativePromise = Promise;
const promisePrototype = NativePromise.prototype;
const promiseThenDescriptor = freeze(descriptor(promisePrototype, 'then'));
const promiseThen = promiseThenDescriptor.value;
const promiseConstructorDescriptor = freeze(descriptor(promisePrototype, 'constructor'));
const promiseSpecies = Symbol.species;
const promiseSpeciesDescriptor = freeze(descriptor(NativePromise, promiseSpecies));
const NativeReflect = Reflect;
const apply = NativeReflect.apply;
const deleteProperty = NativeReflect.deleteProperty;
const getPrototypeOf = NativeReflect.getPrototypeOf;
const ownKeys = NativeReflect.ownKeys;
const objectPrototypePrototype = getPrototypeOf(objectPrototype);
const NativeRegExp = RegExp;
const regexpExec = NativeRegExp.prototype.exec;
const NativeSet = Set;
const setAdd = NativeSet.prototype.add;
const setDelete = NativeSet.prototype.delete;
const setSizeGetter = descriptor(NativeSet.prototype, 'size').get;
const NativeTypeError = TypeError;
const NativeURL = URL;
const isPromise = utilTypes.isPromise;
const isProxy = utilTypes.isProxy;
const objectPrototypeBaseline = snapshotObjectPrototype();

const TOP_KEYS = freeze(['transport', 'funding']);
const TRANSPORT_KEYS = freeze([
  'origin',
  'bind',
  'tlsMaterial',
  'generation',
  'limits',
  'deadlineRuntime',
]);
const FUNDING_KEYS = freeze([
  'store',
  'serviceCreditStore',
  'authorityRecord',
  'deriveFundingTerms',
  'now',
  'observerRoot',
  'observerCatchUp',
  'selection',
  'resourceUrl',
]);
const BIND_KEYS = freeze(['host', 'port', 'exclusive']);
const TLS_KEYS = freeze(['key', 'cert']);
const GENERATION_KEYS = freeze(['generationId', 'generationVersion']);
const LIMIT_KEYS = freeze([
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
const DEADLINE_KEYS = freeze(['schedule', 'cancel']);
const SELECTION_KEYS = freeze([
  'offerId',
  'offerVersion',
  'holderId',
  'capabilityCommitment',
]);
const CATCH_UP_KEYS = freeze([
  'maximumPageEntries',
  'maximumBackfillSpan',
  'maximumMembersPerMomentum',
]);
const ADAPTER_KEYS = freeze(['recover', 'handle', 'close']);
const INGRESS_KEYS = freeze(['start', 'close', 'snapshotMetrics']);
const COMPLETION_KEYS = freeze(['success', 'failure']);
const STATUS_KEYS = freeze(['status']);
const REQUEST_TARGET = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@]+(?:\/[A-Za-z0-9\-._~!$&'()*+,;=:@]+)*$/;
const DOT_SEGMENT = /(?:^|\/)\.{1,2}(?:\/|$)/;
const MAX_REQUEST_TARGET_BYTES = 2_048;

const PHASE = freeze({
  DORMANT: 'DORMANT',
  RECOVERING: 'RECOVERING',
  STARTING: 'STARTING',
  LISTENING: 'LISTENING',
  CLOSING: 'CLOSING',
  CLOSED: 'CLOSED',
  CLOSE_UNCERTAIN: 'CLOSE_UNCERTAIN',
});

const CODE = freeze({
  invalidConfiguration:
    'SERVICE_CREDIT_ZENON_FUNDING_INTAKE_HTTPS_OWNER_V1_INVALID_CONFIGURATION',
  invalidInput:
    'SERVICE_CREDIT_ZENON_FUNDING_INTAKE_HTTPS_OWNER_V1_INVALID_INPUT',
  startUnavailable:
    'SERVICE_CREDIT_ZENON_FUNDING_INTAKE_HTTPS_OWNER_V1_START_UNAVAILABLE',
  recoveryRequired:
    'SERVICE_CREDIT_ZENON_FUNDING_INTAKE_HTTPS_OWNER_V1_RECOVERY_REQUIRED',
  closed:
    'SERVICE_CREDIT_ZENON_FUNDING_INTAKE_HTTPS_OWNER_V1_CLOSED',
  closeUncertain:
    'SERVICE_CREDIT_ZENON_FUNDING_INTAKE_HTTPS_OWNER_V1_CLOSE_UNCERTAIN',
});

const STARTED = freeze({ status: 'LISTENING' });
const CLOSED = freeze({ status: 'CLOSED' });
const OBSERVED = 1;
const NOT_PROMISE = 2;
const UNOBSERVABLE = 3;

function dataDescriptor(value, enumerable, writable, configurable) {
  const result = create(null);
  result.value = value;
  result.enumerable = enumerable;
  result.writable = writable;
  result.configurable = configurable;
  return result;
}

function put(target, key, value, enumerable = true) {
  define(target, key, dataDescriptor(value, enumerable, false, false));
}

function record(fields) {
  const result = create(null);
  const keys = ownKeys(fields);
  for (let index = 0; index < keys.length; index += 1) {
    put(result, keys[index], fields[keys[index]]);
  }
  return freeze(result);
}

function failure(code) {
  const error = new NativeTypeError(code);
  define(error, 'code', dataDescriptor(code, true, false, false));
  define(error, 'stack', dataDescriptor(`TypeError: ${code}`, false, false, false));
  return freeze(error);
}

function sameDescriptor(left, right) {
  if (left === undefined || right === undefined) return left === right;
  if (
    left.configurable !== right.configurable
    || left.enumerable !== right.enumerable
  ) return false;
  const leftData = hasOwn(left, 'value');
  if (leftData !== hasOwn(right, 'value')) return false;
  if (leftData) {
    return left.value === right.value && left.writable === right.writable;
  }
  return left.get === right.get && left.set === right.set;
}

function snapshotObjectPrototype() {
  const baseline = create(null);
  const keys = ownKeys(objectPrototype);
  for (let index = 0; index < keys.length; index += 1) {
    put(baseline, keys[index], freeze(descriptor(objectPrototype, keys[index])));
  }
  return freeze(baseline);
}

function sameObjectPrototype() {
  try {
    if (
      objectPrototypePrototype !== null
      || getPrototypeOf(objectPrototype) !== objectPrototypePrototype
    ) return false;
    const currentKeys = ownKeys(objectPrototype);
    const baselineKeys = ownKeys(objectPrototypeBaseline);
    if (currentKeys.length !== baselineKeys.length) return false;
    for (let index = 0; index < currentKeys.length; index += 1) {
      const key = currentKeys[index];
      if (
        !hasOwn(objectPrototypeBaseline, key)
        || !sameDescriptor(
          descriptor(objectPrototype, key),
          objectPrototypeBaseline[key],
        )
      ) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function runtimeInvariant() {
  try {
    return descriptor(objectPrototype, 'then') === undefined
      && sameObjectPrototype()
      && sameDescriptor(descriptor(promisePrototype, 'then'), promiseThenDescriptor)
      && sameDescriptor(
        descriptor(promisePrototype, 'constructor'),
        promiseConstructorDescriptor,
      )
      && sameDescriptor(descriptor(NativePromise, promiseSpecies), promiseSpeciesDescriptor);
  } catch {
    return false;
  }
}

function exactDataObject(value, expected, requireFrozen = true) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || isProxy(value)
      || isArray(value)
      || getPrototypeOf(value) !== objectPrototype
      || (requireFrozen && !isFrozen(value))
    ) return null;
    const keys = ownKeys(value);
    if (keys.length !== expected.length) return null;
    const result = create(null);
    for (let index = 0; index < expected.length; index += 1) {
      const key = expected[index];
      const item = descriptor(value, key);
      if (
        item === undefined
        || !hasOwn(item, 'value')
        || item.enumerable !== true
        || (requireFrozen && (item.writable !== false || item.configurable !== false))
      ) return null;
      result[key] = item.value;
    }
    if (ownKeys(result).length !== expected.length) return null;
    return result;
  } catch {
    return null;
  }
}

function safeFrozenCallable(value) {
  try {
    return typeof value === 'function' && !isProxy(value) && isFrozen(value);
  } catch {
    return false;
  }
}

function callableRecord(value, expected) {
  const captured = exactDataObject(value, expected);
  if (captured === null) return null;
  for (let index = 0; index < expected.length; index += 1) {
    if (!safeFrozenCallable(captured[expected[index]])) return null;
  }
  return captured;
}

function exactStatusRecord(value, expectedStatus) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || isArray(value)
      || isProxy(value)
      || getPrototypeOf(value) !== objectPrototype
      || !isFrozen(value)
    ) return false;
    const keys = ownKeys(value);
    if (keys.length !== STATUS_KEYS.length || keys[0] !== STATUS_KEYS[0]) return false;
    const item = descriptor(value, 'status');
    return item !== undefined
      && hasOwn(item, 'value')
      && item.value === expectedStatus
      && item.enumerable === true
      && item.writable === false
      && item.configurable === false;
  } catch {
    return false;
  }
}

function regexpMatches(expression, value) {
  try {
    return typeof value === 'string'
      && apply(regexpExec, expression, [value]) !== null;
  } catch {
    return false;
  }
}

function restoreConstructor(promise, original) {
  try {
    if (original === undefined) {
      if (!apply(deleteProperty, NativeReflect, [promise, 'constructor'])) return false;
    } else if (!define(promise, 'constructor', original)) {
      return false;
    }
    return sameDescriptor(descriptor(promise, 'constructor'), original);
  } catch {
    return false;
  }
}

function exactNativePromise(value) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || isProxy(value)
      || !isPromise(value)
      || getPrototypeOf(value) !== promisePrototype
    ) return false;
    const ownNames = names(value);
    if (
      ownNames.length > 1
      || (ownNames.length === 1 && ownNames[0] !== 'constructor')
    ) return false;
    const ownConstructor = descriptor(value, 'constructor');
    if (ownConstructor === undefined) return true;
    return hasOwn(ownConstructor, 'value')
      && ownConstructor.value === undefined
      && ownConstructor.enumerable === false
      && ownConstructor.writable === false
      && ownConstructor.configurable === false;
  } catch {
    return false;
  }
}

function observeNativePromise(value, onFulfilled, onRejected) {
  if (!exactNativePromise(value)) return NOT_PROMISE;
  let original;
  try { original = descriptor(value, 'constructor'); }
  catch { return UNOBSERVABLE; }

  let temporary = false;
  if (original === undefined && !runtimeInvariant()) {
    try {
      if (!isExtensible(value)) return UNOBSERVABLE;
      define(
        value,
        'constructor',
        dataDescriptor(undefined, false, false, true),
      );
      temporary = true;
    } catch {
      return UNOBSERVABLE;
    }
  }

  let enabled = false;
  const fulfilled = valueResult => {
    if (!enabled) return;
    try { apply(onFulfilled, undefined, [valueResult]); } catch {}
  };
  const rejected = error => {
    if (!enabled) return;
    try { apply(onRejected, undefined, [error]); } catch {}
  };
  let attached = false;
  try {
    apply(promiseThen, value, [fulfilled, rejected]);
    attached = true;
  } catch {}
  const restored = temporary ? restoreConstructor(value, original) : true;
  if (!attached || !restored) return UNOBSERVABLE;
  enabled = true;
  return OBSERVED;
}

function pending() {
  let resolve;
  let reject;
  const promise = new NativePromise((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  define(
    promise,
    'constructor',
    dataDescriptor(undefined, false, false, false),
  );
  apply(promiseThen, promise, [() => {}, () => {}]);
  return record({ promise: freeze(promise), resolve, reject });
}

function rejected(error) {
  const capability = pending();
  capability.reject(error);
  return capability.promise;
}

function setAddValue(set, value) {
  return apply(setAdd, set, [value]);
}

function setDeleteValue(set, value) {
  return apply(setDelete, set, [value]);
}

function setSize(set) {
  return apply(setSizeGetter, set, []);
}

function captureConfiguration(options) {
  const top = exactDataObject(options, TOP_KEYS);
  const transport = top === null ? null : exactDataObject(top.transport, TRANSPORT_KEYS);
  const funding = top === null ? null : exactDataObject(top.funding, FUNDING_KEYS);
  if (top === null || transport === null || funding === null) return null;
  if (
    exactDataObject(transport.bind, BIND_KEYS) === null
    || exactDataObject(transport.tlsMaterial, TLS_KEYS) === null
    || exactDataObject(transport.generation, GENERATION_KEYS) === null
    || exactDataObject(transport.limits, LIMIT_KEYS) === null
    || exactDataObject(transport.deadlineRuntime, DEADLINE_KEYS) === null
    || exactDataObject(funding.selection, SELECTION_KEYS) === null
    || exactDataObject(funding.observerCatchUp, CATCH_UP_KEYS) === null
    || !safeFrozenCallable(transport.deadlineRuntime.schedule)
    || !safeFrozenCallable(transport.deadlineRuntime.cancel)
    || !safeFrozenCallable(funding.deriveFundingTerms)
    || !safeFrozenCallable(funding.now)
  ) return null;
  if (
    typeof transport.origin !== 'string'
    || typeof funding.resourceUrl !== 'string'
  ) return null;
  let parsed;
  try {
    parsed = new NativeURL(funding.resourceUrl);
  } catch {
    return null;
  }
  if (
    parsed.href !== funding.resourceUrl
    || parsed.protocol !== 'https:'
    || parsed.username !== ''
    || parsed.password !== ''
    || parsed.search !== ''
    || parsed.hash !== ''
    || parsed.origin !== transport.origin
    || parsed.pathname === '/'
    || parsed.pathname.length > MAX_REQUEST_TARGET_BYTES
    || !regexpMatches(REQUEST_TARGET, parsed.pathname)
    || regexpMatches(DOT_SEGMENT, parsed.pathname)
  ) return null;
  return record({
    transport: top.transport,
    funding: top.funding,
    requestTarget: parsed.pathname,
  });
}

function captureCompletion(value) {
  return callableRecord(value, COMPLETION_KEYS);
}

/**
 * Creates one default-off, unmounted HTTPS owner for the fixed-POST Zenon
 * funding-intake BOUND boundary. Construction creates no listener or socket.
 */
export function createServiceCreditZenonFundingIntakeHttpsOwnerV1(options) {
  if (arguments.length !== 1 || !runtimeInvariant()) {
    throw failure(CODE.invalidConfiguration);
  }
  let configuration = captureConfiguration(options);
  if (configuration === null) throw failure(CODE.invalidConfiguration);

  let adapter;
  try {
    if (!runtimeInvariant()) throw failure(CODE.invalidConfiguration);
    adapter = createZenonFundingIntakeHttpPostV1Adapter(configuration.funding);
    if (!runtimeInvariant()) throw failure(CODE.invalidConfiguration);
  } catch {
    throw failure(CODE.invalidConfiguration);
  }
  const adapterOperations = callableRecord(adapter, ADAPTER_KEYS);
  if (adapterOperations === null) throw failure(CODE.invalidConfiguration);
  const adapterRecover = adapterOperations.recover;
  const adapterHandle = adapterOperations.handle;
  const adapterClose = adapterOperations.close;
  adapter = null;

  let phase = PHASE.DORMANT;
  let bridgeAdmission = false;
  let bridgeTerminal = false;
  let downstreamCloseRequested = false;
  let downstreamCloseCompletion = null;
  let downstreamCloseCompletionSettled = false;
  let adapterCloseSettled = false;
  let adapterCloseClean = false;
  let ingressStart = null;
  let ingressClose = null;
  const activeOperations = new NativeSet();

  function invokeCompletion(completion, clean) {
    try {
      const invariantBefore = runtimeInvariant();
      apply(clean ? completion.success : completion.failure, undefined, []);
      const invariantAfter = runtimeInvariant();
      if (invariantBefore && invariantAfter) return true;
      bridgeTerminal = true;
      bridgeAdmission = false;
      return false;
    } catch {
      bridgeTerminal = true;
      bridgeAdmission = false;
      return false;
    }
  }

  function settleRequest(recordValue, clean) {
    if (recordValue.operationSettled) return;
    recordValue.operationSettled = true;
    setDeleteValue(activeOperations, recordValue);
    const accepted = clean && runtimeInvariant() && !bridgeTerminal;
    if (!accepted) {
      bridgeTerminal = true;
      bridgeAdmission = false;
    }
    if (!recordValue.completionSettled) {
      recordValue.completionSettled = true;
      invokeCompletion(recordValue.completion, accepted);
    }
    maybeFinishDownstreamClose();
  }

  function failRequestObservation(recordValue) {
    bridgeTerminal = true;
    bridgeAdmission = false;
    if (!recordValue.completionSettled) {
      recordValue.completionSettled = true;
      invokeCompletion(recordValue.completion, false);
    }
  }

  function finishDownstreamClose(clean) {
    if (downstreamCloseCompletionSettled || downstreamCloseCompletion === null) return;
    downstreamCloseCompletionSettled = true;
    invokeCompletion(downstreamCloseCompletion, clean);
    downstreamCloseCompletion = null;
  }

  function maybeFinishDownstreamClose() {
    if (!downstreamCloseRequested || !adapterCloseSettled) return;
    if (setSize(activeOperations) !== 0) {
      bridgeTerminal = true;
      return;
    }
    finishDownstreamClose(adapterCloseClean && !bridgeTerminal && runtimeInvariant());
  }

  const downstreamHandle = freeze(function handleFundingIntakeHttpsRequest(
    request,
    response,
    _transportContext,
    completionValue,
  ) {
    const completion = captureCompletion(completionValue);
    if (completion === null) {
      bridgeTerminal = true;
      bridgeAdmission = false;
      return undefined;
    }
    const operation = {
      completion,
      completionSettled: false,
      operationSettled: false,
    };
    setAddValue(activeOperations, operation);
    if (!bridgeAdmission || phase !== PHASE.LISTENING || !runtimeInvariant()) {
      settleRequest(operation, false);
      return undefined;
    }
    let returned;
    try {
      if (!runtimeInvariant()) throw failure(CODE.recoveryRequired);
      returned = apply(adapterHandle, undefined, [request, response]);
    } catch {
      settleRequest(operation, false);
      return undefined;
    }
    const observed = observeNativePromise(
      returned,
      value => settleRequest(operation, value === undefined && runtimeInvariant()),
      () => settleRequest(operation, false),
    );
    returned = null;
    if (observed !== OBSERVED) settleRequest(operation, false);
    else if (!runtimeInvariant()) failRequestObservation(operation);
    return undefined;
  });

  const downstreamClose = freeze(function closeFundingIntakeHttpsDownstream(
    completionValue,
  ) {
    const completion = captureCompletion(completionValue);
    bridgeAdmission = false;
    if (completion === null || downstreamCloseRequested) {
      bridgeTerminal = true;
      if (completion !== null) invokeCompletion(completion, false);
      return undefined;
    }
    downstreamCloseRequested = true;
    downstreamCloseCompletion = completion;
    let returned;
    try {
      if (!runtimeInvariant()) throw failure(CODE.closeUncertain);
      returned = apply(adapterClose, undefined, []);
    } catch {
      adapterCloseSettled = true;
      adapterCloseClean = false;
      maybeFinishDownstreamClose();
      return undefined;
    }
    const observed = observeNativePromise(
      returned,
      value => {
        adapterCloseSettled = true;
        adapterCloseClean = value === undefined && runtimeInvariant();
        if (!adapterCloseClean) bridgeTerminal = true;
        maybeFinishDownstreamClose();
      },
      () => {
        adapterCloseSettled = true;
        adapterCloseClean = false;
        maybeFinishDownstreamClose();
      },
    );
    returned = null;
    if (observed !== OBSERVED) {
      bridgeTerminal = true;
      adapterCloseSettled = true;
      adapterCloseClean = false;
      maybeFinishDownstreamClose();
    } else if (!runtimeInvariant()) {
      bridgeTerminal = true;
      adapterCloseClean = false;
    }
    return undefined;
  });

  const downstream = freeze({ handle: downstreamHandle, close: downstreamClose });
  function initializeIngress() {
    if (configuration === null || ingressStart !== null || ingressClose !== null) return false;
    let candidateFactory;
    let candidateIngress;
    try {
      if (!runtimeInvariant()) return false;
      candidateFactory = createServiceCreditBoundedNodeHttpsServerFactory(freeze({
        bind: configuration.transport.bind,
        tlsMaterial: configuration.transport.tlsMaterial,
      }));
      if (!runtimeInvariant() || !safeFrozenCallable(candidateFactory)) return false;
      if (!runtimeInvariant()) return false;
      candidateIngress = createServiceCreditBoundedHttpsIngressOwner(freeze({
        origin: configuration.transport.origin,
        requestTargets: freeze([configuration.requestTarget]),
        generation: configuration.transport.generation,
        limits: configuration.transport.limits,
        downstream,
        deadlineRuntime: configuration.transport.deadlineRuntime,
        httpsServerFactory: candidateFactory,
      }));
      if (!runtimeInvariant()) return false;
      const ingressOperations = callableRecord(candidateIngress, INGRESS_KEYS);
      if (ingressOperations === null) return false;
      ingressStart = ingressOperations.start;
      ingressClose = ingressOperations.close;
      candidateFactory = null;
      candidateIngress = null;
      configuration = null;
      options = null;
      return true;
    } catch {
      return false;
    } finally {
      candidateFactory = null;
      candidateIngress = null;
    }
  }

  const startCapability = pending();
  const closeCapability = pending();
  const invalidStart = rejected(failure(CODE.invalidInput));
  const invalidClose = rejected(failure(CODE.invalidInput));
  const closedStart = rejected(failure(CODE.closed));
  let startClaimed = false;
  let startSettled = false;
  let closeStarted = false;
  let closeSettled = false;
  let physicalCloseAttempted = false;
  let physicalCloseSettled = false;

  function rejectStart(code) {
    if (startSettled) return;
    startSettled = true;
    startCapability.reject(failure(code));
  }

  function settleClose(clean) {
    if (closeSettled) return;
    closeSettled = true;
    bridgeAdmission = false;
    if (clean && !bridgeTerminal && runtimeInvariant()) {
      phase = PHASE.CLOSED;
      closeCapability.resolve(CLOSED);
    } else {
      phase = PHASE.CLOSE_UNCERTAIN;
      closeCapability.reject(failure(CODE.closeUncertain));
    }
  }

  function settlePhysicalClose(clean) {
    if (physicalCloseSettled) return;
    physicalCloseSettled = true;
    settleClose(clean);
  }

  function attemptPhysicalClose() {
    if (physicalCloseAttempted || physicalCloseSettled) return;
    if (!runtimeInvariant()) {
      settleClose(false);
      return;
    }
    physicalCloseAttempted = true;
    let returned;
    if (ingressClose === null) {
      try {
        const invariantBefore = runtimeInvariant();
        returned = apply(adapterClose, undefined, []);
        const observed = observeNativePromise(
          returned,
          value => settlePhysicalClose(
            invariantBefore
              && value === undefined
              && runtimeInvariant(),
          ),
          () => settlePhysicalClose(false),
        );
        const invariantAfter = runtimeInvariant();
        returned = null;
        if (observed !== OBSERVED || !invariantBefore) settlePhysicalClose(false);
        else if (!invariantAfter) settleClose(false);
      } catch {
        settlePhysicalClose(false);
      }
      return;
    }
    try {
      if (!runtimeInvariant()) throw failure(CODE.closeUncertain);
      returned = apply(ingressClose, undefined, []);
    } catch {
      settlePhysicalClose(false);
      return;
    }
    const observed = observeNativePromise(
      returned,
      value => settlePhysicalClose(
        exactStatusRecord(value, 'CLOSED') && runtimeInvariant(),
      ),
      () => settlePhysicalClose(false),
    );
    const invariantAfter = runtimeInvariant();
    returned = null;
    if (observed !== OBSERVED) settlePhysicalClose(false);
    else if (!invariantAfter) settleClose(false);
  }

  function beginClose() {
    if (!closeStarted) {
      closeStarted = true;
      bridgeAdmission = false;
      if (phase !== PHASE.CLOSED) phase = PHASE.CLOSING;
      if (startClaimed && !startSettled) rejectStart(CODE.closed);
      configuration = null;
      options = null;
    }
    attemptPhysicalClose();
    return closeCapability.promise;
  }

  const start = freeze(function startFundingIntakeHttpsOwnerV1(...args) {
    if (args.length !== 0) return invalidStart;
    if (startClaimed) return startCapability.promise;
    if (closeStarted) return closedStart;
    startClaimed = true;
    phase = PHASE.RECOVERING;
    if (!runtimeInvariant()) {
      bridgeTerminal = true;
      rejectStart(CODE.startUnavailable);
      beginClose();
      return startCapability.promise;
    }
    let recovered;
    try {
      if (!runtimeInvariant()) throw failure(CODE.recoveryRequired);
      recovered = apply(adapterRecover, undefined, []);
      if (!runtimeInvariant() || !exactStatusRecord(recovered, 'RECOVERED')) {
        throw failure(CODE.recoveryRequired);
      }
    } catch {
      recovered = null;
      bridgeTerminal = true;
      rejectStart(CODE.recoveryRequired);
      beginClose();
      return startCapability.promise;
    }
    recovered = null;
    if (closeStarted || !runtimeInvariant()) {
      if (!runtimeInvariant()) bridgeTerminal = true;
      rejectStart(closeStarted ? CODE.closed : CODE.startUnavailable);
      beginClose();
      return startCapability.promise;
    }
    if (!initializeIngress() || ingressStart === null || ingressClose === null) {
      bridgeTerminal = true;
      rejectStart(CODE.startUnavailable);
      beginClose();
      return startCapability.promise;
    }
    phase = PHASE.STARTING;
    let returned;
    try {
      if (!runtimeInvariant()) throw failure(CODE.startUnavailable);
      returned = apply(ingressStart, undefined, []);
    } catch {
      bridgeTerminal = true;
      rejectStart(CODE.startUnavailable);
      beginClose();
      return startCapability.promise;
    }
    const observed = observeNativePromise(
      returned,
      value => {
        if (startSettled) return;
        if (
          closeStarted
          || !runtimeInvariant()
          || !exactStatusRecord(value, 'LISTENING')
        ) {
          if (!closeStarted) bridgeTerminal = true;
          rejectStart(closeStarted ? CODE.closed : CODE.startUnavailable);
          beginClose();
          return;
        }
        phase = PHASE.LISTENING;
        if (!runtimeInvariant()) {
          bridgeTerminal = true;
          rejectStart(CODE.startUnavailable);
          beginClose();
          return;
        }
        bridgeAdmission = true;
        startSettled = true;
        startCapability.resolve(STARTED);
      },
      () => {
        bridgeTerminal = true;
        rejectStart(CODE.startUnavailable);
        beginClose();
      },
    );
    const invariantAfter = runtimeInvariant();
    returned = null;
    if (observed !== OBSERVED || !invariantAfter) {
      bridgeTerminal = true;
      rejectStart(CODE.startUnavailable);
      beginClose();
    }
    return startCapability.promise;
  });

  const close = freeze(function closeFundingIntakeHttpsOwnerV1(...args) {
    if (args.length !== 0) return invalidClose;
    return beginClose();
  });

  return freeze({ start, close });
}
