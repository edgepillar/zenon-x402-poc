import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import {
  snapshotOriginalServiceRequestCustodyKey,
} from './service-credit-original-request-custody-contract.js';

const APPLY = Reflect.apply;
const OWN_KEYS = Reflect.ownKeys;
const DESCRIPTOR = Object.getOwnPropertyDescriptor;
const PROTOTYPE = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const DEFINE = Object.defineProperty;
const FREEZE = Object.freeze;
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_PROTOTYPE = Array.prototype;
const OBJECT_PROTOTYPE = Object.prototype;
const IS_SAFE = Number.isSafeInteger;
const IS_PROXY = utilTypes.isProxy;
const IS_PROMISE = utilTypes.isPromise;
const BYTE_LENGTH = Buffer.byteLength;
const TYPE_ERROR = TypeError;
const NativePromise = Promise;
const PROMISE_PROTOTYPE = NativePromise.prototype;
const THEN = PROMISE_PROTOTYPE.then;
const SPECIES = Symbol.species;
const NATIVE_SPECIES = DESCRIPTOR(NativePromise, SPECIES);
const NativeWeakSet = WeakSet;
const WEAK_ADD = NativeWeakSet.prototype.add;
const WEAK_HAS = NativeWeakSet.prototype.has;
const KEY = snapshotOriginalServiceRequestCustodyKey;
const PREFIX = 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_';
const CORE_FIELDS = FREEZE([
  'submitOriginal', 'snapshot', 'close', 'selectedGrantId', 'storeOwnership',
]);
const INPUT_FIELDS = FREEZE([
  'grantId', 'requestId', 'originalRequestJson', 'originalBodyBase64',
  'serviceResourceUrl', 'authorizationHeader',
]);

/**
 * Internal sequential state machine for captured private child operations.
 *
 * Construction accepts no component factory and invokes no child operation.
 * The explicit ownership labels describe an existing binding; they confer no
 * authority and do not acquire, release or qualify any resource.
 *
 * The shared queue, admission, observation and close paths retain the borrowed
 * runner's native/private component premises. The public bindings alone select
 * the actual child and own configuration validation. No SQL dependency belongs
 * in this module.
 */
export function createServiceCreditCustodiedSequentialRunnerCore(configuration) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  let config, selected;
  try {
    config = exact(configuration, CORE_FIELDS);
    if (typeof config.submitOriginal !== 'function'
        || IS_PROXY(config.submitOriginal)
        || typeof config.snapshot !== 'function' || IS_PROXY(config.snapshot)
        || typeof config.close !== 'function' || IS_PROXY(config.close)
        || (config.storeOwnership !== 'BORROWED'
          && config.storeOwnership !== 'OWNED_EXISTING_V2'
          && config.storeOwnership !== 'OWNED_EXISTING_V3_DISPATCH_INTENT')) {
      throw failure('INVALID_CONFIGURATION');
    }
    selected = KEY({ grantId: config.selectedGrantId, requestId: 'scope' });
  } catch {
    throw failure('INVALID_CONFIGURATION');
  }
  const selectedGrantId = selected.grantId;
  const CHILD_SUBMIT = config.submitOriginal;
  const CHILD_SNAPSHOT = config.snapshot;
  const CHILD_CLOSE = config.close;
  const storeOwnership = config.storeOwnership;
  const acceptedArray = new NativeWeakSet();
  config = null;
  selected = null;
  configuration = null;

  let runCapability = null;
  let closePromise = null;
  let queue = null;
  let queueReferences = 0;
  let next = 0;
  let planned = 0;
  let attempted = 0;
  let completed = 0;
  let active = false;
  let closed = false;
  let runFinished = false;
  let desired = null;
  let phase = 'IDLE';
  let outcome = 'NOT_RUN';
  let failureKind = 'NONE';
  let closeOutcome = 'NOT_REQUESTED';
  let closeCalls = 0;
  let observationUndrained = false;

  function releaseQueue() {
    if (queue !== null) {
      for (let index = 0; index < queue.length; index++) queue[index] = null;
      queue = null;
    }
    queueReferences = 0;
  }

  function flags(view) {
    const owner = view.owner.uncertainty;
    const transport = view.lastTransport;
    const undrained = observationUndrained || owner.undrained === true
      || transport?.undrained === true;
    return {
      unknown: owner.custody === true || owner.submission === true
        || undrained || transport?.unknown === true,
      undrained,
    };
  }

  function settleRun() {
    if (runCapability === null || runFinished || active || desired === null
        || closeOutcome === 'NOT_REQUESTED' || closeOutcome === 'WAITING') return;
    let uncertain = true;
    try { uncertain = flags(CHILD_SNAPSHOT()).unknown; }
    catch {
      observationUndrained = true;
      failureKind = 'OBSERVATION_UNKNOWN';
    }
    releaseQueue();
    runFinished = true;
    if (desired === 'COMPLETE' && closeOutcome === 'FULFILLED' && !uncertain) {
      phase = 'COMPLETED';
      outcome = 'CALLBACKS_COMPLETED';
      runCapability.resolve(undefined);
    } else {
      phase = 'FAILED';
      outcome = 'RUN_FAILED';
      if (failureKind === 'NONE') failureKind = 'CLOSE_FAILED';
      runCapability.reject(failure('RUN_FAILED'));
    }
  }

  function closeSettled(fulfilled, value) {
    closeOutcome = fulfilled && value === undefined ? 'FULFILLED' : 'REJECTED';
    if (closeOutcome === 'REJECTED' && failureKind === 'NONE') {
      failureKind = 'CLOSE_FAILED';
    }
    if (runCapability === null) phase = 'CLOSED';
    settleRun();
  }

  function ensureClose() {
    closed = true;
    releaseQueue();
    // Latch the invocation before entering the child, independently of its
    // return value. A throw, null return or reentrant close must not retry it.
    if (closeCalls !== 0) return closePromise;
    closeCalls = 1;
    closeOutcome = 'WAITING';
    phase = runCapability === null ? 'CLOSED' : 'WAITING_CLOSE';

    // The actual private child closes admission synchronously and returns its
    // native cached close Promise. No substitute or chained Promise is returned.
    try { closePromise = CHILD_CLOSE(); }
    catch {
      // No native close Promise was obtained. Reuse the unobservable failure
      // path below without exposing the thrown value or inventing a receipt.
      closePromise = undefined;
    }
    if (closePromise === runCapability?.promise || !safePromise(closePromise)) {
      observationUndrained = true;
      failureKind = 'CLOSE_UNOBSERVABLE';
      closeOutcome = 'UNOBSERVABLE';
      desired = 'FAILED';
      settleRun();
      return closePromise;
    }
    try {
      APPLY(THEN, closePromise, [
        value => { closeSettled(true, value); },
        () => { closeSettled(false, undefined); },
      ]);
    } catch {
      observationUndrained = true;
      failureKind = 'CLOSE_UNOBSERVABLE';
      closeOutcome = 'UNOBSERVABLE';
      desired = 'FAILED';
      settleRun();
    }
    return closePromise;
  }

  function stop(kind) {
    desired = 'FAILED';
    failureKind = kind;
    releaseQueue();
    ensureClose();
    settleRun();
  }

  function entryRejected() {
    active = false;
    stop('ENTRY_REJECTED');
  }

  function entryCompleted(value) {
    active = false;
    if (value !== undefined) {
      stop('INVALID_COMPLETION');
      return;
    }
    completed++;
    try {
      if (flags(CHILD_SNAPSHOT()).unknown) {
        stop('CHILD_UNCERTAINTY');
        return;
      }
    } catch {
      observationUndrained = true;
      stop('OBSERVATION_UNKNOWN');
      return;
    }
    if (closed || desired !== null) {
      settleRun();
    } else {
      launchNext();
    }
  }

  function launchNext() {
    if (runFinished || active || desired !== null) return;
    if (closed) {
      desired = 'STOPPED';
      failureKind = 'CLOSE_REQUESTED';
      ensureClose();
      settleRun();
      return;
    }
    if (next === planned) {
      desired = 'COMPLETE';
      ensureClose();
      settleRun();
      return;
    }

    let entry = queue[next];
    queue[next] = null;
    next++;
    queueReferences--;
    attempted++;
    active = true;
    phase = 'RUNNING';
    try {
      const observed = CHILD_SUBMIT(entry);
      if (observed === runCapability.promise || observed === closePromise
          || !safePromise(observed)) {
        active = false;
        observationUndrained = true;
        stop('SUBMIT_UNOBSERVABLE');
        return;
      }
      APPLY(THEN, observed, [
        entryCompleted,
        entryRejected,
      ]);
    } catch {
      active = false;
      observationUndrained = true;
      stop('SUBMIT_UNOBSERVABLE');
    } finally {
      entry = null;
    }
  }

  function runOriginals(...args) {
    if (args.length !== 1) return rejected('INVALID_INPUT');
    const supplied = args[0];
    if (APPLY(WEAK_HAS, acceptedArray, [supplied])) {
      return runCapability.promise;
    }
    if (!ordinaryArray(supplied)) return rejected('INVALID_INPUT');
    if (runCapability !== null) {
      return APPLY(WEAK_HAS, acceptedArray, [supplied])
        ? runCapability.promise : rejected('ALREADY_RUN');
    }
    if (closed) return rejected('CLOSED');

    let captured;
    try {
      captured = captureBatch(supplied, selectedGrantId);
    } catch {
      return rejected('INVALID_INPUT');
    }
    runCapability = capability();
    APPLY(WEAK_ADD, acceptedArray, [supplied]);
    queue = captured;
    captured = null;
    planned = queue.length;
    queueReferences = planned;
    outcome = 'PENDING';
    phase = 'RUNNING';

    // Identity and all batch data are fixed before the first possible
    // synchronous store/transport callback.
    try { launchNext(); }
    finally { args = null; }
    return runCapability.promise;
  }

  function close(...args) {
    if (args.length !== 0) return rejected('INVALID_INPUT');
    closed = true;
    if (runCapability !== null && desired === null) {
      desired = 'STOPPED';
      failureKind = 'CLOSE_REQUESTED';
    }
    releaseQueue();
    const observed = ensureClose();
    settleRun();
    return observed;
  }

  function snapshot(...args) {
    if (args.length !== 0) throw failure('INVALID_INPUT');
    const view = CHILD_SNAPSHOT();
    const uncertainty = flags(view);
    return FREEZE({
      phase,
      outcome,
      failure: failureKind,
      closed,
      active,
      runClaimed: runCapability !== null,
      runSettled: runFinished,
      planned,
      attempted,
      completed,
      notAttempted: planned - attempted,
      queuedReferences: queueReferences,
      closeCalls,
      closeOutcome,
      unknown: uncertainty.unknown || closeOutcome === 'REJECTED',
      unknownUndrained: uncertainty.undrained,
      limits: FREEZE({
        maxOriginals: 8,
        maxRequestJsonUtf8Bytes: 4096,
        maxAuthorizationUtf8Bytes: 1024,
        maxUrlUtf8Bytes: 4096,
        maxBodyUtf8Bytes: 0,
        maxBatchStringUtf8Bytes: 75776,
      }),
      client: view,
      storeOwnership,
      qualification: 'SYNTHETIC_SEQUENTIAL_INTERFACE_ONLY',
      serviceDelivery: 'NOT_ESTABLISHED',
      currentAuthority: 'NOT_ESTABLISHED',
      realReady: 'NOT_ESTABLISHED',
      durability: 'NOT_ESTABLISHED',
      restart: 'NOT_ESTABLISHED',
      osCleanup: 'NOT_ESTABLISHED',
    });
  }

  return FREEZE({
    runOriginals: FREEZE(runOriginals),
    snapshot: FREEZE(snapshot),
    close: FREEZE(close),
  });
}

function ordinaryArray(value) {
  return typeof value === 'object' && value !== null && !IS_PROXY(value)
    && ARRAY_IS_ARRAY(value) && PROTOTYPE(value) === ARRAY_PROTOTYPE;
}

function captureBatch(value, selectedGrantId) {
  const lengthDescriptor = DESCRIPTOR(value, 'length');
  if (!lengthDescriptor || !HAS_OWN(lengthDescriptor, 'value')
      || !IS_SAFE(lengthDescriptor.value) || lengthDescriptor.value < 1
      || lengthDescriptor.value > 8) throw failure('INVALID_INPUT');
  const length = lengthDescriptor.value;
  const keys = OWN_KEYS(value);
  if (keys.length !== length + 1 || keys[length] !== 'length') {
    throw failure('INVALID_INPUT');
  }
  const result = [];
  for (let index = 0; index < length; index++) {
    const field = '' + index;
    if (keys[index] !== field) throw failure('INVALID_INPUT');
    const descriptor = DESCRIPTOR(value, field);
    if (!descriptor || descriptor.enumerable !== true
        || !HAS_OWN(descriptor, 'value')) throw failure('INVALID_INPUT');
    const entry = exact(descriptor.value, INPUT_FIELDS);
    const key = KEY({ grantId: entry.grantId, requestId: entry.requestId });
    if (key.grantId !== selectedGrantId) throw failure('INVALID_INPUT');
    bounded(entry.originalRequestJson, 4096);
    bounded(entry.authorizationHeader, 1024);
    bounded(entry.serviceResourceUrl, 4096);
    if (entry.originalBodyBase64 !== '') throw failure('INVALID_INPUT');
    for (let earlier = 0; earlier < index; earlier++) {
      if (result[earlier].grantId === key.grantId
          && result[earlier].requestId === key.requestId) {
        throw failure('INVALID_INPUT');
      }
    }
    result[index] = FREEZE({
      grantId: key.grantId,
      requestId: key.requestId,
      originalRequestJson: entry.originalRequestJson,
      originalBodyBase64: entry.originalBodyBase64,
      serviceResourceUrl: entry.serviceResourceUrl,
      authorizationHeader: entry.authorizationHeader,
    });
  }
  return result;
}

export function exact(value, fields) {
  if (typeof value !== 'object' || value === null || IS_PROXY(value)
      || PROTOTYPE(value) !== OBJECT_PROTOTYPE) throw failure('INVALID_INPUT');
  const keys = OWN_KEYS(value);
  if (keys.length !== fields.length) throw failure('INVALID_INPUT');
  const result = {};
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index];
    const descriptor = DESCRIPTOR(value, field);
    if (!descriptor || descriptor.enumerable !== true
        || !HAS_OWN(descriptor, 'value')) throw failure('INVALID_INPUT');
    result[field] = descriptor.value;
  }
  return result;
}

function bounded(value, limit) {
  if (typeof value !== 'string' || value.length === 0 || value.length > limit
      || APPLY(BYTE_LENGTH, Buffer, [value, 'utf8']) > limit) {
    throw failure('INVALID_INPUT');
  }
}

export function safePromise(value) {
  try {
    if (typeof value !== 'object' || value === null || IS_PROXY(value)
        || !IS_PROMISE(value) || PROTOTYPE(value) !== PROMISE_PROTOTYPE) return false;
    const ownConstructor = DESCRIPTOR(value, 'constructor');
    if (ownConstructor !== undefined
        && (!HAS_OWN(ownConstructor, 'value')
          || ownConstructor.value !== NativePromise)) return false;
    const constructor = DESCRIPTOR(PROMISE_PROTOTYPE, 'constructor');
    if (!constructor || !HAS_OWN(constructor, 'value')
        || constructor.value !== NativePromise) return false;
    const species = DESCRIPTOR(NativePromise, SPECIES);
    if (!species || !NATIVE_SPECIES) return false;
    if (HAS_OWN(NATIVE_SPECIES, 'value')) {
      return HAS_OWN(species, 'value') && species.value === NATIVE_SPECIES.value;
    }
    return !HAS_OWN(species, 'value') && species.get === NATIVE_SPECIES.get
      && species.set === NATIVE_SPECIES.set;
  } catch {
    return false;
  }
}

function capability() {
  let resolvePromise, rejectPromise;
  const promise = new NativePromise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return FREEZE({ promise, resolve: resolvePromise, reject: rejectPromise });
}

function rejected(suffix) {
  const result = capability();
  result.reject(failure(suffix));
  return result.promise;
}

export function failure(suffix) {
  const code = PREFIX + suffix;
  const error = new TYPE_ERROR(code);
  DEFINE(error, 'code', { value: code, enumerable: true });
  DEFINE(error, 'stack', {
    value: 'TypeError: ' + code,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return FREEZE(error);
}
