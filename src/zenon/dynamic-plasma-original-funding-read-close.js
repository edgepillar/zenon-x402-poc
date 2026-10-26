import { types as utilTypes } from 'node:util';

const FREEZE = Object.freeze, CREATE = Object.create, DEFINE = Object.defineProperty;
const DESCRIPTOR = Object.getOwnPropertyDescriptor, PROTOTYPE = Object.getPrototypeOf;
const KEYS = Reflect.ownKeys, NAMES = Object.getOwnPropertyNames, HAS = Object.hasOwn, APPLY = Reflect.apply;
const IS_PROXY = utilTypes.isProxy, IS_PROMISE = utilTypes.isPromise, IS_FROZEN = Object.isFrozen;
const OBJECT = Object.prototype, FUNCTION = Function.prototype;
const NativePromise = Promise, PROMISE = NativePromise.prototype, SPECIES = Symbol.species;
const THEN = PROMISE.then, ErrorType = TypeError;
const INITIAL_THEN = DESCRIPTOR(PROMISE, 'then'), INITIAL_CTOR = DESCRIPTOR(PROMISE, 'constructor');
const INITIAL_SPECIES = DESCRIPTOR(NativePromise, SPECIES), INITIAL_OBJECT_THEN = DESCRIPTOR(OBJECT, 'then');
const FIELDS = FREEZE(['startReadClose', 'snapshotOperation', 'closeFunding', 'canCloseFunding']);

/**
 * Internal cooperative close join for the actual original-funding V3 owner.
 * Construction is inert. The caller first blocks its own operation/submit
 * entry and assigns this reserved Promise, THEN starts this coordinator.
 * Start read close immediately; join the current operation without inspecting
 * its value/reason; enter actual payer/store close only after both are settled
 * and read close fulfilled undefined. Source-owner guards must hold before
 * funding close and after its CLOSED result. A held outcome is permanent.
 *
 * Operational callbacks are trusted source-owned capabilities, not a sandbox
 * or native brand. Actual owners must prehandle rejected Promises themselves.
 * This module imports no SDK/SQL/network/nonce/signer and never closes a DB
 * directly, retries, reopens, resigns, recreates a quote or upgrades an unknown
 * operation. CLOSED is joined close-contract DATA, not physical cleanup or
 * payment success. Pending/indirect callback cycles still need external HOLD.
 */
export function createOriginalFundingReadCloseCoordinator(options) {
  let callbacks;
  try {
    if (arguments.length !== 1 || !invariant() || typeof options !== 'object' || options === null
        || IS_PROXY(options) || PROTOTYPE(options) !== OBJECT || !IS_FROZEN(options)
        || KEYS(options).length !== FIELDS.length) reject('configuration_rejected');
    const out = CREATE(null);
    for (let i = 0; i < FIELDS.length; i++) {
      const name = FIELDS[i], d = DESCRIPTOR(options, name);
      if (!d || d.enumerable !== true || !HAS(d, 'value') || typeof d.value !== 'function'
          || IS_PROXY(d.value) || PROTOTYPE(d.value) !== FUNCTION || !IS_FROZEN(d.value))
        reject('configuration_rejected');
      put(out, name, d.value);
    }
    callbacks = FREEZE(out);
  } catch { reject('configuration_rejected'); }
  const done = pending(), invalidStart = pending(), unknown = problem('close_unknown');
  invalidStart.reject(problem('input_rejected'));
  let started = false, held = false, lifecycle = 'OPEN', stage = 'IDLE';
  let readCloseStarted = false, readCloseSettled = false, readCloseClean = false;
  let operationSnapshotTaken = false, operationSettled = false;
  let fundingCloseStarted = false, fundingCloseSettled = false;
  let readPromise = null, operationPromise = null;

  function hold() {
    if (held) return;
    held = true; lifecycle = 'CLOSE_OUTCOME_UNKNOWN'; stage = 'HELD';
    done.reject(unknown);
  }
  function guard() {
    if (!invariant()) return false;
    try { return APPLY(callbacks.canCloseFunding, undefined, []) === true && invariant(); }
    catch { return false; }
  }
  function maybeCloseFunding() {
    if (!started || held || fundingCloseStarted || !readCloseClean || !operationSettled) return;
    if (!guard()) { hold(); return; }
    fundingCloseStarted = true; stage = 'FUNDING_CLOSE';
    let promise;
    try { promise = APPLY(callbacks.closeFunding, undefined, []); }
    catch { hold(); return; }
    if (promise === done.promise || promise === readPromise || promise === operationPromise) { hold(); return; }
    if (!observe(promise, value => {
      fundingCloseSettled = true;
      if (held) return;
      if (!closed(value) || !guard()) { hold(); return; }
      lifecycle = 'CLOSED'; stage = 'CLOSED';
      done.resolve(record({ originalFundingReadCloseVersion: 1, lifecycle,
        readClose: 'FULFILLED_UNDEFINED', operation: 'SETTLED', fundingClose: 'CLOSED',
        operationOutcome: 'NOT_ESTABLISHED', nativeResourceCleanup: 'NOT_QUALIFIED', authority: 'NONE' }));
      // A clean joined close no longer needs captured source capabilities.
      // Drop only our references; active and HELD owners remain untouched.
      callbacks = null;
      readPromise = null;
      operationPromise = null;
    }, () => { fundingCloseSettled = true; hold(); })) hold();
  }
  function operationFinished() {
    operationSettled = true;
    if (!invariant()) { hold(); return; }
    maybeCloseFunding();
  }
  const start = FREEZE(function start() {
    if (arguments.length !== 0) return invalidStart.promise;
    if (started) return done.promise;
    started = true; lifecycle = 'CLOSING'; stage = 'READ_CLOSE';
    readCloseStarted = true; // Before the callback, including close reentry.
    try { readPromise = APPLY(callbacks.startReadClose, undefined, []); }
    catch { hold(); return done.promise; }
    // Native read close is attempted even during drift; that owner owns its
    // cached prehandled rejection. Never attach unsafe new reactions afterward.
    if (!invariant() || readPromise === done.promise || !nativePromise(readPromise)) { hold(); return done.promise; }
    try { operationPromise = APPLY(callbacks.snapshotOperation, undefined, []); operationSnapshotTaken = true; }
    catch { hold(); return done.promise; }
    if (operationPromise !== null && (operationPromise === done.promise || operationPromise === readPromise
        || !nativePromise(operationPromise))) { hold(); return done.promise; }
    operationSettled = operationPromise === null;
    if (!observe(readPromise, value => {
      readCloseSettled = true;
      if (held) return;
      if (value !== undefined || !invariant()) { hold(); return; }
      readCloseClean = true; stage = operationSettled ? 'READ_CLOSE' : 'OPERATION_JOIN';
      maybeCloseFunding();
    }, () => { readCloseSettled = true; hold(); })) hold();
    if (operationPromise !== null && !observe(operationPromise, operationFinished, operationFinished)) hold();
    return done.promise;
  });
  const inspect = FREEZE(function inspect() {
    if (arguments.length !== 0) reject('input_rejected');
    return record({ originalFundingReadCloseVersion: 1, lifecycle, stage, started, held,
      readCloseStarted, readCloseSettled, readCloseClean, operationSnapshotTaken, operationSettled,
      fundingCloseStarted, fundingCloseSettled, automaticRetry: false, authority: 'NONE',
      operationOutcome: 'NOT_ESTABLISHED', nativeResourceCleanup: 'NOT_QUALIFIED' });
  });
  return FREEZE({ promise: done.promise, start, inspect });
}
function closed(value) {
  if (typeof value !== 'object' || value === null || IS_PROXY(value) || PROTOTYPE(value) !== OBJECT || !IS_FROZEN(value)) return false;
  const d = DESCRIPTOR(value, 'status');
  return d !== undefined && d.enumerable === true && HAS(d, 'value') && d.value === 'CLOSED';
}
function nativePromise(value) {
  if (!invariant() || typeof value !== 'object' || value === null || IS_PROXY(value)
      || !IS_PROMISE(value) || PROTOTYPE(value) !== PROMISE) return false;
  // Ignore Node async-context symbols, never their values; string hooks stay closed.
  const names = NAMES(value);
  if (names.length === 0) return true;
  if (names.length !== 1 || names[0] !== 'constructor') return false;
  const d = DESCRIPTOR(value, 'constructor');
  return d !== undefined && HAS(d, 'value') && d.value === NativePromise
    && d.enumerable === false && d.writable === false && d.configurable === false;
}
function observe(value, accepted, rejected) {
  if (!nativePromise(value)) return false;
  try {
    const bridge = APPLY(THEN, value, [accepted, rejected]);
    if (!nativePromise(bridge)) return false;
    return nativePromise(APPLY(THEN, bridge, [discard, discard]));
  } catch { return false; }
}
function pending() {
  let resolve, rejectPromise;
  const promise = new NativePromise((accept, refuse) => { resolve = accept; rejectPromise = refuse; });
  put(promise, 'constructor', NativePromise, false);
  APPLY(THEN, promise, [discard, discard]);
  return record({ promise: FREEZE(promise), resolve, reject: rejectPromise });
}
function invariant() {
  return INITIAL_OBJECT_THEN === undefined && DESCRIPTOR(OBJECT, 'then') === undefined
    && same(DESCRIPTOR(PROMISE, 'then'), INITIAL_THEN)
    && same(DESCRIPTOR(PROMISE, 'constructor'), INITIAL_CTOR)
    && same(DESCRIPTOR(NativePromise, SPECIES), INITIAL_SPECIES);
}
function same(actual, expected) {
  if (!actual || !expected || KEYS(actual).length !== KEYS(expected).length) return false;
  const names = KEYS(expected);
  for (let i = 0; i < names.length; i++) if (!HAS(actual, names[i]) || actual[names[i]] !== expected[names[i]]) return false;
  return true;
}
function record(fields) {
  const out = CREATE(null), names = KEYS(fields);
  for (let i = 0; i < names.length; i++) put(out, names[i], fields[names[i]]);
  return FREEZE(out);
}
function put(target, name, value, enumerable = true) {
  const d = CREATE(null); d.value = value; d.enumerable = enumerable; DEFINE(target, name, d);
}
function problem(kind) {
  const code = 'original_funding_read_close_' + kind, error = new ErrorType(code);
  put(error, 'code', code); put(error, 'stack', 'TypeError: ' + code, false);
  return FREEZE(error);
}
function reject(kind) { throw problem(kind); }
function discard() {}
