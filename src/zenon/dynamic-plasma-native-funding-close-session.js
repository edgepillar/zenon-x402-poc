import { types as utilTypes } from 'node:util';

const FREEZE = Object.freeze, CREATE = Object.create, DEFINE = Object.defineProperty;
const DESC = Object.getOwnPropertyDescriptor, PROTO = Object.getPrototypeOf;
const KEYS = Reflect.ownKeys, NAMES = Object.getOwnPropertyNames, HAS = Object.hasOwn, APPLY = Reflect.apply;
const FROZEN = Object.isFrozen, IS = Object.is, ARRAY_IS = Array.isArray;
const IS_PROXY = utilTypes.isProxy, IS_PROMISE = utilTypes.isPromise;
const OBJECT = Object.prototype, ARRAY = Array.prototype, FUNCTION = Function.prototype;
const NativePromise = Promise, PROMISE = NativePromise.prototype, THEN = PROMISE.then, SPECIES = Symbol.species;
const THEN_DESC = DESC(PROMISE, 'then'), CTOR_DESC = DESC(PROMISE, 'constructor');
const SPECIES_DESC = DESC(NativePromise, SPECIES), OBJECT_THEN = DESC(OBJECT, 'then'), ErrorType = TypeError;
const READ_FIELDS = FREEZE(['readOptions', 'close', 'inspect', 'inspectNativeCustody']);
const FUND_FIELDS = FREEZE(['fetchImpl', 'close', 'snapshot']);
const READ_MATCH = FREEZE({ retainedReadSessionVersion: 1, lifecycle: 'CLOSED', closeUncertaintyLatched: false,
  closeRequested: 3, closeSettled: 3, closeFulfilledUndefined: 3 });
const OWNER_MATCH = FREEZE({ nativeReadCustodyVersion: 1, closeRequested: true, closePromiseSettled: true,
  uncertaintyLatched: false, retiredErrorObserved: false, activeGeneration: false, closeObserved: true,
  trackedRequests: 0, trackedResponses: 0, trackedSockets: 0, trackedAgents: 0, ownedTimers: 0 });
const FUND_MATCH = FREEZE({ phase: 'CLOSED', unknown: false, trackedRequests: 0, trackedSockets: 0, ownedTimers: 0 });
const CLOSE_MATCH = FREEZE({ phase: 'CLOSED', unknown: false, closeRequested: true,
  closePromiseOutcome: 'CLOSED', observing: false, quiescenceObserved: true });
const COUNT_MATCH = FREEZE({ requests: 0, sockets: 0, timers: 0 });
const RELEASE_MATCH = FREEZE({ attempts: 1, outcome: 'RETURNED' });
const OWNER_INDEX = FREEZE(['0', '1', '2']);

/**
 * Internal join used by the actual default-off native DP factory.
 * The factory supplies genuine retained-read/funding owners. Declared owners in
 * component tests are DATA, not native brands or physical-drain evidence.
 *
 * Construction is inert and reserves a cached prehandled close Promise.
 * Both child close attempts start independently, even on throw/drift/refusal.
 * Current immutable own-data views of all three read owners AND the funding
 * client must match before each funding/store-close permit. No property getter,
 * proxy, thenable or a historical CLOSED Promise substitutes for that view.
 *
 * The public close settles once. Later uncertainty permanently vetoes permits
 * without rewriting an earlier fulfilled Promise. Cached inspection starts no
 * observation, timer or I/O. The actual V4 bounded join supplies the enclosing
 * cooperative deadline; this join adds no timer, retry, reopen or store close.
 * An already entered/returned store close cannot be undone. No SDK, SQL, socket,
 * signature, nonce, OS cancellation or physical-cleanup authority is supplied.
 */
export function createNativeOriginalFundingCloseSession(reads, funding) {
  let r, f;
  try {
    if (arguments.length !== 2 || !invariant()) refuse('configuration_rejected');
    r = exact(reads, READ_FIELDS); f = exact(funding, FUND_FIELDS);
    dataRecord(r.readOptions);
    for (const callback of [r.close, r.inspect, r.inspectNativeCustody, f.fetchImpl, f.close, f.snapshot])
      method(callback);
  } catch { refuse('configuration_rejected'); }
  const READ_OPTIONS = r.readOptions, CLOSE_READS = r.close, INSPECT_READS = r.inspect;
  const INSPECT_NATIVE_READS = r.inspectNativeCustody, CLOSE_FUNDING = f.close, INSPECT_FUNDING = f.snapshot;
  reads = null; funding = null; r = null; f = null;
  const done = pending(), invalidClose = pending(), unknownError = problem('close_unknown');
  invalidClose.reject(problem('input_rejected'));
  let started = false, unknown = false, lifecycle = 'OPEN', firstRefusal = null;
  let closePromiseOutcome = 'NOT_REQUESTED', checking = false, snapshotChecks = 0, lastSnapshotCheck = 'NOT_CHECKED';
  const requested = [false, false], settled = [false, false], outcomes = ['NOT_REQUESTED', 'NOT_REQUESTED'];
  const childPromises = [null, null];

  function hold(reason) {
    if (!unknown) firstRefusal = reason;
    unknown = true; lifecycle = 'CLOSE_OUTCOME_UNKNOWN';
    if (closePromiseOutcome === 'PENDING') { closePromiseOutcome = 'UNKNOWN'; done.reject(unknownError); }
  }
  const canCloseFunding = FREEZE(function canCloseFunding() {
    if (arguments.length !== 0 || !started || unknown || outcomes[0] !== 'CLOSED' || outcomes[1] !== 'CLOSED') return false;
    if (checking) { hold('REENTRANT_INSPECTION'); return false; }
    checking = true; snapshotChecks++;
    try {
      if (!invariant()) refuse('intrinsic_drift');
      const read = APPLY(INSPECT_READS, undefined, []);
      const native = APPLY(INSPECT_NATIVE_READS, undefined, []);
      const post = APPLY(INSPECT_FUNDING, undefined, []);
      matches(read, READ_MATCH);
      if (field(native, 'nativeReadSessionCustodyVersion') !== 2) refuse('snapshot_rejected');
      const owners = field(native, 'owners');
      if (typeof owners !== 'object' || owners === null || IS_PROXY(owners) || !ARRAY_IS(owners)
          || PROTO(owners) !== ARRAY || !FROZEN(owners) || KEYS(owners).length !== 4
          || DESC(owners, 'length').value !== 3) refuse('snapshot_rejected');
      for (let index = 0; index < 3; index++) {
        const owner = DESC(owners, OWNER_INDEX[index]);
        if (!owner || !HAS(owner, 'value') || !owner.enumerable) refuse('snapshot_rejected');
        matches(owner.value, OWNER_MATCH);
      }
      matches(post, FUND_MATCH);
      const close = field(post, 'close');
      matches(close, CLOSE_MATCH);
      matches(field(close, 'lastObservedCounts'), COUNT_MATCH);
      matches(field(close, 'localMaterialRelease'), RELEASE_MATCH);
      if (unknown || !invariant()) refuse('snapshot_rejected');
      lastSnapshotCheck = 'MATCHED';
      return true;
    } catch {
      lastSnapshotCheck = 'REFUSED'; hold('CURRENT_NATIVE_VIEW_UNKNOWN'); return false;
    } finally { checking = false; }
  });
  function finish() {
    if (unknown || !settled[0] || !settled[1]) return;
    if (!canCloseFunding()) { hold('CURRENT_NATIVE_VIEW_UNKNOWN'); return; }
    lifecycle = 'CLOSED'; closePromiseOutcome = 'CLOSED'; done.resolve(undefined);
  }
  function request(index, callback) {
    requested[index] = true; outcomes[index] = 'PENDING';
    let promise;
    try { promise = APPLY(callback, undefined, []); }
    catch { settled[index] = true; outcomes[index] = 'THREW'; hold('CHILD_CLOSE_THREW'); return; }
    if (promise === done.promise || (index === 1 && promise === childPromises[0])) {
      settled[index] = true; outcomes[index] = 'ALIASED_PROMISE'; hold('CHILD_CLOSE_CYCLE_OR_ALIAS'); return;
    }
    childPromises[index] = promise;
    if (!observe(promise, value => {
      settled[index] = true;
      let clean = value === undefined;
      if (index === 1) {
        try { clean = field(value, 'phase') === 'CLOSED'; } catch { clean = false; }
      }
      outcomes[index] = clean ? 'CLOSED' : 'INVALID_VALUE';
      if (!clean) hold('CHILD_CLOSE_VALUE_UNKNOWN'); else finish();
    }, () => { settled[index] = true; outcomes[index] = 'REJECTED'; hold('CHILD_CLOSE_REJECTED'); })) {
      settled[index] = true; outcomes[index] = 'UNOBSERVABLE'; hold('CHILD_CLOSE_UNOBSERVABLE');
    }
  }
  const close = FREEZE(function close() {
    if (arguments.length !== 0) return invalidClose.promise;
    if (started) return done.promise;
    started = true; lifecycle = 'CLOSING'; closePromiseOutcome = 'PENDING';
    if (unknown || !invariant()) hold('INTRINSIC_DRIFT');
    // No await or short-circuit between the TWO source-owned close attempts.
    request(0, CLOSE_READS); request(1, CLOSE_FUNDING);
    return done.promise;
  });
  const inspect = FREEZE(function inspect() {
    if (arguments.length !== 0) refuse('input_rejected');
    return record({ nativeOriginalFundingCloseSessionVersion: 1, lifecycle, started, unknown, firstRefusal,
      closePromiseOutcome, readCloseRequested: requested[0], fundingCloseRequested: requested[1],
      readCloseSettled: settled[0], fundingCloseSettled: settled[1],
      readOutcome: outcomes[0], fundingOutcome: outcomes[1], snapshotChecks, lastSnapshotCheck, checking,
      inspectionIsCached: true, currentPermitRequiresFreshViews: true, automaticRetry: false,
      storeLifetime: 'NOT_OWNED', nativeResourceCleanup: 'NOT_QUALIFIED', nativeGraphQualified: false, authority: 'NONE' });
  });
  return FREEZE({ readSession: FREEZE({ readOptions: READ_OPTIONS, close, inspect }), canCloseFunding });
}
function exact(value, fields) {
  dataRecord(value);
  if (PROTO(value) !== OBJECT || KEYS(value).length !== fields.length) refuse('configuration_rejected');
  const out = CREATE(null);
  for (const name of fields) put(out, name, ownData(value, name));
  return FREEZE(out);
}
function method(value) {
  if (typeof value !== 'function' || IS_PROXY(value) || PROTO(value) !== FUNCTION || !FROZEN(value))
    refuse('configuration_rejected');
}
function dataRecord(value) {
  if (typeof value !== 'object' || value === null || IS_PROXY(value)
      || (PROTO(value) !== OBJECT && PROTO(value) !== null) || !FROZEN(value)) refuse('snapshot_rejected');
}
function field(value, name) {
  dataRecord(value);
  return ownData(value, name);
}
function ownData(value, name) {
  const d = DESC(value, name);
  if (!d || !HAS(d, 'value') || !d.enumerable) refuse('snapshot_rejected');
  return d.value;
}
function matches(value, expected) {
  dataRecord(value);
  for (const name of KEYS(expected)) if (!IS(ownData(value, name), expected[name])) refuse('snapshot_rejected');
}
function nativePromise(value) {
  if (!invariant() || typeof value !== 'object' || value === null || IS_PROXY(value)
      || !IS_PROMISE(value) || PROTO(value) !== PROMISE) return false;
  const names = NAMES(value);
  if (names.length === 0) return true;
  if (names.length !== 1 || names[0] !== 'constructor') return false;
  const d = DESC(value, 'constructor');
  return d && HAS(d, 'value') && d.value === NativePromise && !d.enumerable && !d.writable && !d.configurable;
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
  return record({ promise: FREEZE(promise), resolve, reject });
}
function invariant() {
  return OBJECT_THEN === undefined && DESC(OBJECT, 'then') === undefined
    && same(DESC(PROMISE, 'then'), THEN_DESC) && same(DESC(PROMISE, 'constructor'), CTOR_DESC)
    && same(DESC(NativePromise, SPECIES), SPECIES_DESC);
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
  const code = 'native_original_funding_close_session_' + kind, value = new ErrorType(code);
  put(value, 'code', code); put(value, 'stack', 'TypeError: ' + code, false); return FREEZE(value);
}
function refuse(kind) { throw problem(kind); }
function discard() {}
