import { types as utilTypes } from 'node:util';
import { selectBoundedJsonRpcReadAdmissionProfile } from './bounded-json-rpc-read-admission.js';

const FREEZE = Object.freeze, CREATE = Object.create, DEFINE = Object.defineProperty;
const DESCRIPTOR = Object.getOwnPropertyDescriptor, PROTOTYPE = Object.getPrototypeOf;
const KEYS = Reflect.ownKeys, HAS = Object.hasOwn, APPLY = Reflect.apply;
const NAMES = Object.getOwnPropertyNames;
const IS_FROZEN = Object.isFrozen, IS_PROXY = utilTypes.isProxy, IS_PROMISE = utilTypes.isPromise;
const OBJECT = Object.prototype, FUNCTION = Function.prototype;
const NativePromise = Promise, PROMISE = NativePromise.prototype, SPECIES = Symbol.species;
const THEN = PROMISE.then, ErrorType = TypeError;
const INITIAL_THEN = DESCRIPTOR(PROMISE, 'then'), INITIAL_CTOR = DESCRIPTOR(PROMISE, 'constructor');
const INITIAL_SPECIES = DESCRIPTOR(NativePromise, SPECIES), INITIAL_OBJECT_THEN = DESCRIPTOR(OBJECT, 'then');
const DP = selectBoundedJsonRpcReadAdmissionProfile('dynamic_plasma_retained_candidate');
const ACCOUNT = selectBoundedJsonRpcReadAdmissionProfile('zenon_account_state_retained_candidate');

/**
 * Internal, non-native lifecycle composition for the actual retained HTTPS
 * factory. Capture two DP owners and one account owner, then give the actual
 * retained preparer its unchanged {transports, accountExchange} readOptions.
 * Returned reads preserve original input and Promise identity. No factory,
 * re-encoding, request, budget reset, retry or automatic preparation is added.
 *
 * close starts all THREE closes before waiting on any read/close settlement.
 * Every underlying close must fulfill undefined; rejection, malformed Promise,
 * runtime drift or another value permanently means CLOSE_OUTCOME_UNKNOWN.
 * A late fulfillment cannot upgrade that result. Reads are refused from the
 * instant closing begins, including through previously retained readOptions.
 *
 * Captured profiles/callbacks are DATA, not a native brand or authentication.
 * The real factory must supply actual owners that prehandle all returned
 * rejected Promises. This core neither opens resources nor proves OS cleanup,
 * hard cancellation, crash durability, operation success or store release.
 * It owns no wallet/store lifetime. Its caller must retain/quarantine those
 * resources on uncertain close and separately join all operation lifetimes.
 */
export function createRetainedDynamicPlasmaReadSessionCore(options) {
  let first, second, account;
  try {
    if (arguments.length !== 1 || !invariant()) reject('configuration_rejected');
    const input = exact(options, ['firstOwner', 'secondOwner', 'accountOwner']);
    first = dpOwner(input.firstOwner); second = dpOwner(input.secondOwner);
    const owner = exact(input.accountOwner, ['exchange', 'close', 'requestBudget']);
    if (owner.requestBudget !== ACCOUNT) reject('configuration_rejected');
    account = record({ read: method(owner.exchange), close: method(owner.close) });
    const methods = [first.read, second.read, account.read, first.close, second.close, account.close];
    for (let i = 0; i < methods.length; i++)
      for (let j = 0; j < i; j++) if (methods[i] === methods[j]) reject('configuration_rejected');
  } catch { reject('configuration_rejected'); }
  const owners = FREEZE([first, second, account]);
  const unavailable = failed('unavailable'), invalidClose = failed('input_rejected');
  const closeUnknown = problem('close_unknown'), closing = pending();
  let lifecycle = 'OPEN', closeStarted = false, unknown = false;
  let readRefused = false;
  const requested = [false, false, false], settled = [false, false, false], clean = [false, false, false];
  const closeResults = [null, null, null];

  function markUnknown() {
    unknown = true; lifecycle = 'CLOSE_OUTCOME_UNKNOWN';
    closing.reject(closeUnknown);
  }
  function finish() {
    if (!closeStarted || unknown || !settled[0] || !settled[1] || !settled[2]) return;
    if (!invariant() || !clean[0] || !clean[1] || !clean[2]) { markUnknown(); return; }
    lifecycle = 'CLOSED'; closing.resolve(undefined);
  }
  function settle(index, accepted) {
    if (settled[index]) return;
    settled[index] = true; clean[index] = accepted && invariant();
    if (!clean[index]) markUnknown();
    finish();
  }
  function requestClose(index) {
    if (requested[index]) return;
    requested[index] = true; // Before the borrowed callback, including reentry.
    let promise;
    try { promise = APPLY(owners[index].close, undefined, []); }
    catch { settle(index, false); return; }
    if (promise === closing.promise) { settle(index, false); return; }
    for (let i = 0; i < index; i++) {
      if (promise === closeResults[i]) { settle(index, false); return; }
    }
    closeResults[index] = promise;
    // Actual native owners prehandle close rejections themselves. Attach a
    // direct reaction only with trusted mechanics, never assimilate thenables.
    if (!observe(promise, value => settle(index, value === undefined), () => settle(index, false)))
      settle(index, false);
  }
  function startClose() {
    if (closeStarted) return;
    closeStarted = true; lifecycle = 'CLOSING';
    // Do not stop at the first failed/unknown owner or await an active read.
    requestClose(0); requestClose(1); requestClose(2);
    finish();
  }
  function guardedRead(index) {
    return FREEZE(function read(request) {
      if (lifecycle !== 'OPEN') return unavailable;
      if (arguments.length !== 1 || !invariant()) {
        readRefused = true; startClose(); return unavailable;
      }
      try { return APPLY(owners[index].read, undefined, [request]); }
      catch { readRefused = true; startClose(); return unavailable; }
    });
  }
  const readOptions = FREEZE({
    transports: FREEZE([FREEZE({ callRead: guardedRead(0) }), FREEZE({ callRead: guardedRead(1) })]),
    accountExchange: guardedRead(2),
  });
  const close = FREEZE(function close() {
    if (arguments.length !== 0) return invalidClose;
    if (!closeStarted) startClose();
    return closing.promise;
  });
  const inspect = FREEZE(function inspect() {
    if (arguments.length !== 0) reject('input_rejected');
    return record({ retainedReadSessionVersion: 1, lifecycle, readRefused,
      closeRequested: (requested[0] ? 1 : 0) + (requested[1] ? 1 : 0) + (requested[2] ? 1 : 0),
      closeSettled: (settled[0] ? 1 : 0) + (settled[1] ? 1 : 0) + (settled[2] ? 1 : 0),
      closeFulfilledUndefined: (clean[0] ? 1 : 0) + (clean[1] ? 1 : 0) + (clean[2] ? 1 : 0),
      closeUncertaintyLatched: unknown, nativeResourceCleanup: 'NOT_QUALIFIED',
      operationOutcome: 'NOT_ESTABLISHED', storeLifetime: 'NOT_OWNED',
      automaticRetry: false, authority: 'NONE' });
  });
  return FREEZE({ readOptions, close, inspect });
}
function dpOwner(value) {
  const owner = exact(value, ['transport', 'close', 'requestBudget']);
  const transport = exact(owner.transport, ['callRead']);
  if (owner.requestBudget !== DP) reject('configuration_rejected');
  return record({ read: method(transport.callRead), close: method(owner.close) });
}
function exact(value, fields) {
  if (typeof value !== 'object' || value === null || IS_PROXY(value) || PROTOTYPE(value) !== OBJECT
      || !IS_FROZEN(value) || KEYS(value).length !== fields.length) reject('configuration_rejected');
  const out = CREATE(null);
  for (let i = 0; i < fields.length; i++) {
    const name = fields[i], d = DESCRIPTOR(value, name);
    if (!d || d.enumerable !== true || !HAS(d, 'value')) reject('configuration_rejected');
    put(out, name, d.value);
  }
  return FREEZE(out);
}
function method(value) {
  if (typeof value !== 'function' || IS_PROXY(value) || PROTOTYPE(value) !== FUNCTION || !IS_FROZEN(value))
    reject('configuration_rejected');
  return value;
}
function observe(value, accepted, rejected) {
  if (!nativePromise(value)) return false;
  try {
    const bridge = APPLY(THEN, value, [accepted, rejected]);
    if (!nativePromise(bridge)) return false;
    const drain = APPLY(THEN, bridge, [discard, discard]);
    return nativePromise(drain);
  } catch { return false; }
}
function nativePromise(value) {
  if (!invariant() || typeof value !== 'object' || value === null || IS_PROXY(value)
      || !IS_PROMISE(value) || PROTOTYPE(value) !== PROMISE) return false;
  // Node async-context symbols are not Promise hooks. Inspect own string
  // names without reading symbol values; then/constructor remain closed.
  const keys = NAMES(value);
  if (keys.length === 0) return true;
  if (keys.length !== 1 || keys[0] !== 'constructor') return false;
  const d = DESCRIPTOR(value, 'constructor');
  return d !== undefined && HAS(d, 'value') && d.value === NativePromise
    && d.enumerable === false && d.writable === false && d.configurable === false;
}
function pending() {
  let resolve, rejectPromise;
  const promise = new NativePromise((accept, refuse) => { resolve = accept; rejectPromise = refuse; });
  put(promise, 'constructor', NativePromise, false);
  APPLY(THEN, promise, [discard, discard]);
  return record({ promise: FREEZE(promise), resolve, reject: rejectPromise });
}
function failed(kind) { const p = pending(); p.reject(problem(kind)); return p.promise; }
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
  const code = 'retained_dynamic_plasma_read_session_' + kind, error = new ErrorType(code);
  put(error, 'code', code); put(error, 'stack', 'TypeError: ' + code, false);
  return FREEZE(error);
}
function reject(kind) { throw problem(kind); }
function discard() {}
