import { types as utilTypes } from 'node:util';

const FREEZE = Object.freeze, DESC = Object.getOwnPropertyDescriptor, PROTO = Object.getPrototypeOf;
const KEYS = Reflect.ownKeys, OWN = Object.hasOwn, APPLY = Reflect.apply;
const IS_PROXY = utilTypes.isProxy, NativePromise = Promise, DEFINE = Object.defineProperty;
const OBJECT = Object.prototype;
const COUNT_FIELDS = FREEZE(['requests', 'sockets', 'timers']);

/**
 * Close lifecycle shared by the explicit native HTTPS client.
 *
 * SDK/SQL/socket/timer-free: this component never performs native I/O. Its two
 * captured callbacks are trusted capabilities supplied privately by that client.
 * readObservedCounts observes the client's ACTUAL owned sets. It excludes only
 * its close-grace timer, which releaseLocalMaterial must cancel before returning
 * undefined. Counts supplied by another host are declared DATA, not drain proof.
 *
 * The close Promise settles once. A deadline/observation/release failure keeps
 * CLOSE_UNKNOWN permanently. Later zero-count observations can still release
 * local material ONCE; they never replace an uncertain verdict with CLOSED.
 * Release failure is not retried. A late error can downgrade the current phase,
 * but cannot change the historical settlement of an already-settled Promise.
 * A clean receipt handoff refuses any inherited Object.prototype.then member
 * by descriptor, without invoking it. Check after both trusted callbacks so
 * Promise resolution cannot enter a getter/thenable introduced during release.
 *
 * Releasing this client's local CA copy/close timer is not secure erasure,
 * authenticated service delivery, OS physical drain, or new payment authority.
 */
export function createNativeHttpsClientCloseOwner(configuration) {
  if (arguments.length !== 1) fail('input_rejected');
  const config = record(configuration, ['readObservedCounts', 'releaseLocalMaterial']);
  for (const key of ['readObservedCounts', 'releaseLocalMaterial']) {
    if (typeof config[key] !== 'function' || IS_PROXY(config[key])) fail('input_rejected');
  }
  const READ = config.readObservedCounts, RELEASE = config.releaseLocalMaterial;
  configuration = null;
  let phase = 'OPEN', unknown = false, closing = null, resolveClose = null, rejectClose = null;
  let settledOutcome = 'NOT_REQUESTED', observing = false, observations = 0, failures = 0;
  let lastCounts = null, quiescent = false, releaseAttempts = 0, releaseOutcome = 'NOT_ATTEMPTED';

  function unknownState() {
    unknown = true;
    if (phase === 'CLOSED') phase = 'CLOSE_UNKNOWN';
  }
  function finish(clean) {
    if (closing === null || settledOutcome !== 'PENDING') return;
    // Promise resolution reads even an inherited then on this plain receipt.
    // Never let that read enter host code or turn a CLOSED verdict into a
    // pending/assimilated Promise. Rejection does not assimilate its reason.
    if (clean && !unknown && DESC(OBJECT, 'then') !== undefined) unknownState();
    const yes = resolveClose, no = rejectClose;
    resolveClose = null; rejectClose = null;
    phase = clean && !unknown ? 'CLOSED' : 'CLOSE_UNKNOWN';
    settledOutcome = phase;
    if (phase === 'CLOSED') yes(FREEZE({ phase: 'CLOSED', trackedRequests: 0,
      trackedSockets: 0, ownedTimers: 0, serviceDelivery: 'NOT_ESTABLISHED' }));
    else no(closeUnknown());
  }
  function readCounts() {
    observations++;
    const raw = APPLY(READ, undefined, []);
    if (raw === null || typeof raw !== 'object' || IS_PROXY(raw)
        || PROTO(raw) !== Object.prototype || !Object.isFrozen(raw)) fail('observation_rejected');
    const value = record(raw, COUNT_FIELDS);
    for (const key of COUNT_FIELDS) {
      if (!Number.isSafeInteger(value[key]) || value[key] < 0 || Object.is(value[key], -0))
        fail('observation_rejected');
    }
    lastCounts = FREEZE(value);
    quiescent = value.requests === 0 && value.sockets === 0 && value.timers === 0;
    return quiescent;
  }
  const observe = FREEZE(function observe() {
    if (arguments.length !== 0) fail('input_rejected');
    if (closing === null) return undefined;
    if (observing) {
      failures++; unknownState(); finish(false); return undefined;
    }
    observing = true;
    try {
      if (!readCounts()) {
        if (releaseAttempts !== 0) { unknownState(); finish(false); }
        return undefined;
      }
      if (releaseAttempts === 0) {
        // Claim before entering the trusted releaser; no reentrant second call.
        releaseAttempts = 1; releaseOutcome = 'WAITING';
        try {
          if (APPLY(RELEASE, undefined, []) !== undefined) fail('release_rejected');
          releaseOutcome = 'RETURNED';
        } catch {
          releaseOutcome = 'UNKNOWN'; unknownState(); finish(false); return undefined;
        }
        // Do not silently accept a releaser that creates more observed work.
        if (!readCounts()) { unknownState(); finish(false); return undefined; }
      }
      if (releaseOutcome === 'RETURNED' && quiescent) finish(!unknown);
      else if (releaseOutcome === 'UNKNOWN') { unknownState(); finish(false); }
    } catch {
      failures++; lastCounts = null; quiescent = false; unknownState(); finish(false);
    } finally { observing = false; }
    return undefined;
  });
  const beginClose = FREEZE(function beginClose() {
    if (arguments.length !== 0) fail('input_rejected');
    if (closing !== null) return closing;
    closing = new NativePromise((yes, no) => { resolveClose = yes; rejectClose = no; });
    DEFINE(closing, 'constructor', { value: NativePromise });
    phase = 'CLOSING'; settledOutcome = 'PENDING';
    // The caller installs its grace timer/destroys owned handles BEFORE observe.
    return closing;
  });
  const markUnknown = FREEZE(function markUnknown() {
    if (arguments.length !== 0) fail('input_rejected');
    unknownState();
    return undefined;
  });
  const deadlineExpired = FREEZE(function deadlineExpired() {
    if (arguments.length !== 0) fail('input_rejected');
    if (closing === null) fail('close_not_requested');
    // A cancelled grace callback arriving after clean settlement is inert.
    if (settledOutcome === 'CLOSED') return undefined;
    unknownState(); finish(false); observe();
    return undefined;
  });
  const snapshot = FREEZE(function snapshot() {
    if (arguments.length !== 0) fail('input_rejected');
    return FREEZE({ phase, unknown, closeRequested: closing !== null,
      closePromiseOutcome: settledOutcome, observing, observations, observationFailures: failures,
      lastObservedCounts: lastCounts, quiescenceObserved: quiescent,
      localMaterialRelease: FREEZE({ attempts: releaseAttempts, outcome: releaseOutcome }),
      nativeIoPerformed: false, authority: 'NONE', osPhysicalDrain: 'NOT_ESTABLISHED',
      serviceDelivery: 'NOT_ESTABLISHED' });
  });
  return FREEZE({ beginClose, observe, markUnknown, deadlineExpired, snapshot });
}
function record(value, fields) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || PROTO(value) !== Object.prototype || KEYS(value).length !== fields.length) fail('input_rejected');
  const result = {};
  for (const key of fields) {
    const d = DESC(value, key);
    if (!d || !OWN(d, 'value') || !d.enumerable) fail('input_rejected');
    DEFINE(result, key, { value: d.value, enumerable: true });
  }
  return result;
}
function error(code) {
  const value = new TypeError(code);
  DEFINE(value, 'code', { value: code, enumerable: true });
  DEFINE(value, 'stack', { value: 'TypeError: ' + code });
  return FREEZE(value);
}
function closeUnknown() { return error('service_credit_native_https_client_close_unknown'); }
function fail(kind) { throw error('service_credit_native_client_close_' + kind); }

