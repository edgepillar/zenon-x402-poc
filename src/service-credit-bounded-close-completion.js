import { types as utilTypes } from 'node:util';
import { observeServiceCreditOperationDrain } from './service-credit-bounded-operation-drain.js';

const DRAIN = observeServiceCreditOperationDrain, F = Object.freeze, CREATE = Object.create;
const DESC = Object.getOwnPropertyDescriptor, PROTO = Object.getPrototypeOf, DEFINE = Object.defineProperty;
const KEYS = Reflect.ownKeys, NAMES = Object.getOwnPropertyNames, OWN = Object.hasOwn, APPLY = Reflect.apply;
const IS_PROXY = utilTypes.isProxy, IS_PROMISE = utilTypes.isPromise, INTEGER = Number.isSafeInteger;
const OBJECT = Object.prototype, NativePromise = Promise, PROMISE = NativePromise.prototype;
const THEN = PROMISE.then, SPECIES = Symbol.species, ErrorType = TypeError;
const INITIAL_THEN = DESC(PROMISE, 'then'), INITIAL_CTOR = DESC(PROMISE, 'constructor');
const INITIAL_SPECIES = DESC(NativePromise, SPECIES), INITIAL_OBJECT_THEN = DESC(OBJECT, 'then');

/**
 * One cooperative observation budget for a source owner's WHOLE close join.
 * Start before independent child stops. Complete only after the owner observes
 * all operation/child/store conditions; the notification is not a close permit.
 * The owner must recheck current resource guards after this Promise fulfills.
 *
 * Construction is inert. One pending completion signal replaces operation-only
 * polling. Expiry/refusal is permanent, including when no operation was active.
 * Late completion never repairs UNKNOWN, releases a resource, retries or reopens.
 * This component owns no SDK/SQL/socket, cancellation, native brand or OS deadline.
 */
export function createServiceCreditBoundedCloseCompletion(budgetMs) {
  if (arguments.length !== 1 || !invariant() || !INTEGER(budgetMs) || budgetMs < 1 || budgetMs > 1000)
    refuse('configuration_rejected');
  const done = pending(), progress = pending(), invalidStart = pending();
  invalidStart.reject(problem('input_rejected'));
  let started = false, offered = false, outcome = 'NOT_STARTED', refusal = null;
  let observationStarts = 0, completionProbeEntries = 0;
  function hold(reason) {
    if (outcome === 'CLOSED' || outcome === 'UNKNOWN') return;
    outcome = 'UNKNOWN'; refusal = reason;
    progress.resolve('UNKNOWN'); done.reject(problem('close_unknown'));
  }
  const start = F(function start() {
    if (arguments.length !== 0) return invalidStart.promise;
    if (started) return done.promise;
    started = true; outcome = 'PENDING';
    if (!invariant()) { hold('INTRINSIC_DRIFT'); return done.promise; }
    try {
      observationStarts++;
      const observed = DRAIN(F(function completionProbe() {
        completionProbeEntries++; return progress.promise;
      }), budgetMs);
      if (!observe(observed, clean => {
        if (outcome !== 'PENDING') return;
        if (clean !== true || !offered || !invariant()) { hold('COMPLETION_NOT_ESTABLISHED'); return; }
        outcome = 'CLOSED'; done.resolve(undefined);
      }, () => hold('OBSERVATION_REJECTED'))) hold('OBSERVATION_UNOBSERVABLE');
    } catch { hold('OBSERVATION_START_FAILED'); }
    return done.promise;
  });
  const complete = F(function complete() {
    if (arguments.length !== 0) refuse('input_rejected');
    if (!started || offered || outcome !== 'PENDING') return false;
    if (!invariant()) { hold('INTRINSIC_DRIFT'); return false; }
    offered = true; progress.resolve('DRAINED'); return true;
  });
  const inspect = F(function inspect() {
    if (arguments.length !== 0) refuse('input_rejected');
    return record({ boundedCloseCompletionVersion: 1, budgetMs, started, completionOffered: offered,
      outcome, refusal, observationStarts, completionProbeEntries, inspectionIsCached: true,
      currentResourceGuardsRequired: true, resourcesOwned: false, automaticRetry: false,
      physicalDrain: 'NOT_ESTABLISHED', authority: 'NONE' });
  });
  return F({ promise: done.promise, start, complete, inspect });
}
function nativePromise(value) {
  if (!invariant() || typeof value !== 'object' || value === null || IS_PROXY(value)
      || !IS_PROMISE(value) || PROTO(value) !== PROMISE) return false;
  const names = NAMES(value);
  if (names.length === 0) return true;
  if (names.length !== 1 || names[0] !== 'constructor') return false;
  const d = DESC(value, 'constructor');
  return d && OWN(d, 'value') && d.value === NativePromise && !d.enumerable && !d.writable && !d.configurable;
}
function observe(value, yes, no) {
  if (!nativePromise(value)) return false;
  try {
    const bridge = APPLY(THEN, value, [yes, no]);
    return nativePromise(bridge) && nativePromise(APPLY(THEN, bridge, [discard, discard]));
  } catch { return false; }
}
function pending() {
  let resolve, reject;
  const promise = new NativePromise((yes, no) => { resolve = yes; reject = no; });
  put(promise, 'constructor', NativePromise, false);
  APPLY(THEN, promise, [discard, discard]);
  return record({ promise: F(promise), resolve, reject });
}
function invariant() {
  return INITIAL_OBJECT_THEN === undefined && DESC(OBJECT, 'then') === undefined
    && same(DESC(PROMISE, 'then'), INITIAL_THEN) && same(DESC(PROMISE, 'constructor'), INITIAL_CTOR)
    && same(DESC(NativePromise, SPECIES), INITIAL_SPECIES);
}
function same(actual, expected) {
  if (!actual || !expected || KEYS(actual).length !== KEYS(expected).length) return false;
  for (const name of KEYS(expected)) if (!OWN(actual, name) || actual[name] !== expected[name]) return false;
  return true;
}
function record(fields) {
  const out = CREATE(null);
  for (const name of KEYS(fields)) put(out, name, fields[name]);
  return F(out);
}
function put(target, name, value, enumerable = true) {
  const d = CREATE(null); d.value = value; d.enumerable = enumerable; DEFINE(target, name, d);
}
function problem(kind) {
  const code = 'service_credit_bounded_close_completion_' + kind, value = new ErrorType(code);
  put(value, 'code', code); put(value, 'stack', 'TypeError: ' + code, false); return F(value);
}
function refuse(kind) { throw problem(kind); }
function discard() {}
