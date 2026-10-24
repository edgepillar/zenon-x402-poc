import { types as utilTypes } from 'node:util';
import { performance } from 'node:perf_hooks';
import { createOriginalFundingReadCloseCoordinator } from './dynamic-plasma-original-funding-read-close.js';
import { observeServiceCreditOperationDrain } from '../service-credit-bounded-operation-drain.js';

const JOIN = createOriginalFundingReadCloseCoordinator, DRAIN = observeServiceCreditOperationDrain;
const FREEZE = Object.freeze, CREATE = Object.create, DEFINE = Object.defineProperty;
const DESC = Object.getOwnPropertyDescriptor, PROTO = Object.getPrototypeOf, KEYS = Reflect.ownKeys;
const NAMES = Object.getOwnPropertyNames, HAS = Object.hasOwn, APPLY = Reflect.apply;
const IS_PROXY = utilTypes.isProxy, IS_PROMISE = utilTypes.isPromise, IS_FROZEN = Object.isFrozen;
const OBJECT = Object.prototype, FUNCTION = Function.prototype;
const NativePromise = Promise, PROMISE = NativePromise.prototype, SPECIES = Symbol.species;
const THEN = PROMISE.then, NOW = performance.now, FINITE = Number.isFinite;
const INTEGER = Number.isSafeInteger, MAX_NUMBER = Number.MAX_SAFE_INTEGER, ErrorType = TypeError;
const INITIAL_THEN = DESC(PROMISE, 'then'), INITIAL_CTOR = DESC(PROMISE, 'constructor');
const INITIAL_SPECIES = DESC(NativePromise, SPECIES), INITIAL_OBJECT_THEN = DESC(OBJECT, 'then');
const FIELDS = FREEZE(['startReadClose', 'snapshotOperation', 'closeFunding', 'canCloseFunding']);

/**
 * Actual V4's cooperative close-budget owner. Construction starts no timer.
 * Start requests actual read close immediately and observes the genuine join
 * with the existing bounded-drain helper. A pending read/operation/funding
 * Promise cannot indefinitely keep this public close pending on a responsive
 * event loop. Expiry/refusal is permanent; late close never restores entry.
 *
 * The actual payer must ALSO call canCloseFunding immediately before/after
 * store.close, after its own awaits. Earlier coordinator admission is not a
 * store-entry lease. Once funding close has entered, UNKNOWN cannot claim the
 * store stayed open or undo a returned close. No cancellation, SDK/SQL/network,
 * retry, signing or native physical-drain authority is supplied here.
 */
export function createOriginalFundingBoundedReadCloseCoordinator(options, budgetMs) {
  let callbacks;
  try {
    if (arguments.length !== 2 || !invariant() || !INTEGER(budgetMs)
        || budgetMs < 1 || budgetMs > 1000 || typeof options !== 'object' || options === null
        || IS_PROXY(options) || PROTO(options) !== OBJECT || !IS_FROZEN(options)
        || KEYS(options).length !== FIELDS.length) refuse('configuration_rejected');
    callbacks = CREATE(null);
    for (const name of FIELDS) {
      const d = DESC(options, name);
      if (!d || !HAS(d, 'value') || d.enumerable !== true || typeof d.value !== 'function'
          || IS_PROXY(d.value) || PROTO(d.value) !== FUNCTION || !IS_FROZEN(d.value)) refuse('configuration_rejected');
      put(callbacks, name, d.value);
    }
    FREEZE(callbacks);
  } catch { refuse('configuration_rejected'); }
  const outward = pending(), progress = pending(), invalidStart = pending();
  invalidStart.reject(problem('input_rejected'));
  let inner = null, started = false, held = false, completed = false;
  let lifecycle = 'OPEN', holdReason = null, budgetExpired = false;
  let startedAt = null, deadline = null, lastTime = null, innerResult = null;
  let innerSettled = false, innerFulfilled = false, observationSettled = false;
  let observationOutcome = 'NOT_STARTED', fundingCallbackEntries = 0;
  let completionProbeEntries = 0;
  function hold(reason) {
    if (held || completed) return;
    held = true; lifecycle = 'CLOSE_OUTCOME_UNKNOWN'; holdReason = reason;
    progress.resolve('UNKNOWN'); outward.reject(problem('close_unknown'));
  }
  function timedLive() {
    if (!started || held || completed) return false;
    if (!invariant()) { hold('INTRINSIC_DRIFT'); return false; }
    try {
      const now = APPLY(NOW, performance, []);
      if (!FINITE(now) || now < lastTime || now < startedAt) { hold('CLOCK_UNKNOWN'); return false; }
      lastTime = now;
      if (now >= deadline) { budgetExpired = true; hold('BUDGET_EXPIRED'); return false; }
      return true;
    } catch { hold('CLOCK_UNKNOWN'); return false; }
  }
  const canCloseFunding = FREEZE(function canCloseFunding() {
    if (arguments.length !== 0 || !timedLive()) return false;
    try {
      const state = inner.inspect();
      if (state.held) { hold('JOIN_REFUSED'); return false; }
      return state.readCloseClean === true && state.operationSettled === true;
    } catch { hold('JOIN_INSPECTION_UNKNOWN'); return false; }
  });
  function noCycle(value) {
    if (value === outward.promise) { hold('PUBLIC_CLOSE_CYCLE'); throw problem('close_unknown'); }
    return value;
  }
  inner = JOIN(FREEZE({
    // Even a failed budget/clock must still request owned read stop.
    startReadClose: FREEZE(function startReadClose() { return noCycle(APPLY(callbacks.startReadClose, undefined, [])); }),
    snapshotOperation: FREEZE(function snapshotOperation() { return noCycle(APPLY(callbacks.snapshotOperation, undefined, [])); }),
    closeFunding: FREEZE(function closeFunding() {
      if (!canCloseFunding()) throw problem('close_unknown');
      fundingCallbackEntries++;
      return noCycle(APPLY(callbacks.closeFunding, undefined, []));
    }),
    canCloseFunding: FREEZE(function sourceGuard() {
      if (!canCloseFunding()) return false;
      let accepted = false;
      try { accepted = APPLY(callbacks.canCloseFunding, undefined, []) === true; } catch {}
      if (!accepted) { hold('SOURCE_GUARD_REFUSED'); return false; }
      return canCloseFunding(); // Same monotonic bound after the source guard.
    }),
  }));
  // Install before caller callbacks can reenter or alter Promise descriptors.
  if (!observe(inner.promise, value => {
    innerSettled = true; innerFulfilled = true;
    if (!timedLive()) return;
    innerResult = value; progress.resolve('DRAINED');
  }, () => { innerSettled = true; hold('JOIN_REFUSED'); })) refuse('configuration_rejected');
  const start = FREEZE(function start() {
    if (arguments.length !== 0) return invalidStart.promise;
    if (started) return outward.promise;
    started = true; lifecycle = 'CLOSING';
    try {
      startedAt = APPLY(NOW, performance, []); lastTime = startedAt; deadline = startedAt + budgetMs;
      if (!invariant() || !FINITE(startedAt) || startedAt < 0 || !FINITE(deadline)
          || deadline > MAX_NUMBER) hold('CLOCK_OR_INTRINSIC_UNKNOWN');
    } catch { hold('CLOCK_UNKNOWN'); }
    if (!held) {
      observationOutcome = 'PENDING';
      try {
        // One pending, owned completion Promise, not repeated BUSY polling.
        const observed = DRAIN(FREEZE(function completionProbe() {
          completionProbeEntries++; return progress.promise;
        }), budgetMs);
        if (!observe(observed, drained => {
          observationSettled = true; observationOutcome = drained === true ? 'DRAINED' : 'NOT_DRAINED';
          if (held || completed) return;
          if (drained !== true) {
            // A false drain result can also mean refusal/cancellation failure;
            // only our own clock observation may label the budget expired.
            timedLive(); hold('DRAIN_NOT_ESTABLISHED'); return;
          }
          if (!innerFulfilled || innerResult === null || !timedLive()) { hold('JOIN_NOT_ESTABLISHED'); return; }
          completed = true; lifecycle = 'CLOSED'; outward.resolve(innerResult);
        }, () => { observationSettled = true; observationOutcome = 'UNKNOWN'; hold('DRAIN_REJECTED'); })) hold('DRAIN_UNOBSERVABLE');
      } catch { hold('DRAIN_START_FAILED'); }
    }
    try { inner.start(); } catch { hold('READ_STOP_START_FAILED'); }
    return outward.promise;
  });
  const inspect = FREEZE(function inspect() {
    if (arguments.length !== 0) refuse('input_rejected');
    if (started && !held && !completed) timedLive();
    return record({ originalFundingBoundedReadCloseVersion: 1, lifecycle, started, held, completed,
      holdReason, budgetMs, budgetExpired, innerSettled, innerFulfilled, observationSettled,
      observationOutcome, completionProbeEntries, fundingCallbackEntries, joinedReadClose: inner.inspect(),
      runtimeOperationCancelled: false, storeCloseState: 'SEE_ACTUAL_PAYER_INSPECTION',
      automaticRetry: false, nativeResourceCleanup: 'NOT_QUALIFIED', authority: 'NONE' });
  });
  return FREEZE({ promise: outward.promise, start, inspect, canCloseFunding });
}
function nativePromise(value) {
  if (!invariant() || typeof value !== 'object' || value === null || IS_PROXY(value)
      || !IS_PROMISE(value) || PROTO(value) !== PROMISE) return false;
  const names = NAMES(value);
  if (names.length === 0) return true;
  if (names.length !== 1 || names[0] !== 'constructor') return false;
  const d = DESC(value, 'constructor');
  return d && HAS(d, 'value') && d.value === NativePromise && d.enumerable === false
    && d.writable === false && d.configurable === false;
}
function observe(value, accepted, rejected) {
  if (!nativePromise(value)) return false;
  try {
    const bridge = APPLY(THEN, value, [accepted, rejected]);
    return nativePromise(bridge) && nativePromise(APPLY(THEN, bridge, [discard, discard]));
  } catch { return false; }
}
function pending() {
  let resolve, reject;
  const promise = new NativePromise((yes, no) => { resolve = yes; reject = no; });
  put(promise, 'constructor', NativePromise, false);
  APPLY(THEN, promise, [discard, discard]);
  return record({ promise: FREEZE(promise), resolve, reject });
}
function invariant() {
  return INITIAL_OBJECT_THEN === undefined && DESC(OBJECT, 'then') === undefined
    && same(DESC(PROMISE, 'then'), INITIAL_THEN) && same(DESC(PROMISE, 'constructor'), INITIAL_CTOR)
    && same(DESC(NativePromise, SPECIES), INITIAL_SPECIES);
}
function same(actual, expected) {
  if (!actual || !expected || KEYS(actual).length !== KEYS(expected).length) return false;
  for (const name of KEYS(expected)) if (!HAS(actual, name) || actual[name] !== expected[name]) return false;
  return true;
}
function record(fields) {
  const out = CREATE(null);
  for (const name of KEYS(fields)) put(out, name, fields[name]);
  return FREEZE(out);
}
function put(target, name, value, enumerable = true) {
  const d = CREATE(null); d.value = value; d.enumerable = enumerable; DEFINE(target, name, d);
}
function problem(kind) {
  const code = 'original_funding_bounded_read_close_' + kind, value = new ErrorType(code);
  put(value, 'code', code); put(value, 'stack', 'TypeError: ' + code, false); return FREEZE(value);
}
function refuse(kind) { throw problem(kind); }
function discard() {}
