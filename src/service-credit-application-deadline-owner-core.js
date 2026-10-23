import { types as utilTypes } from 'node:util';

const FREEZE = Object.freeze, APPLY = Reflect.apply, NativePromise = Promise;
const DESC = Object.getOwnPropertyDescriptor, PROTO = Object.getPrototypeOf;
const KEYS = Reflect.ownKeys, OWN = Object.hasOwn, IS_PROXY = utilTypes.isProxy;

/**
 * Deadline ownership used by the explicit native application binding.
 * This core performs no timer/clock/SDK/SQL/socket operation itself. The three
 * captured callbacks are TRUSTED capabilities privately supplied by that binding;
 * fake capabilities establish declared component behavior, not native drain.
 *
 * Ingress cancel is boolean; service cancel is void. Opaque per-kind tickets
 * never expose an actuator handle. Failed arm/cancel is not retried. Late wakes
 * may release a retained uncertain row but never repair a rejected close.
 * Close waits for a callback already delivering. Counters are observations, not
 * an OS quota, physical-drain certificate, deadline guarantee or payment authority.
 */
export function createServiceCreditApplicationDeadlineOwnerCore(configuration) {
  if (arguments.length !== 1) fail('input_rejected');
  const c = record(configuration, ['maxScheduleStarts','maxConcurrentTimers','maxDelayMs',
    'armTimer','cancelTimer','readMonotonicTime']);
  integer(c.maxScheduleStarts, 1, 65536); integer(c.maxConcurrentTimers, 1, 1024);
  integer(c.maxDelayMs, 1, 2_147_483_646);
  if (c.maxConcurrentTimers > c.maxScheduleStarts) fail('input_rejected');
  for (const name of ['armTimer','cancelTimer','readMonotonicTime'])
    if (typeof c[name] !== 'function' || IS_PROXY(c[name])) fail('input_rejected');
  const STARTS = c.maxScheduleStarts, CONCURRENT = c.maxConcurrentTimers, DELAY = c.maxDelayMs;
  const ARM = c.armTimer, CANCEL = c.cancelTimer, NOW = c.readMonotonicTime;
  configuration = null;
  const tickets = new WeakMap(), active = new Map();
  let phase = 'OPEN', unknown = false, starts = 0, delivered = 0, cancelled = 0, suppressed = 0;
  let delivering = 0, clockReads = 0, clockAttempts = 0, lastNow = 0n;
  let closing = null, closeOutcome = 'NOT_REQUESTED', resolveClose = null, rejectClose = null;
  let armCalls = 0, cancelCalls = 0, failedControl = false, prematureWakes = 0;

  function finishClose() {
    if (closing === null || closeOutcome !== 'PENDING' || delivering !== 0) return;
    if (active.size !== 0 && !failedControl) return;
    if (active.size !== 0) unknown = true;
    phase = unknown ? 'CLOSE_UNKNOWN' : 'CLOSED'; closeOutcome = phase;
    const yes = resolveClose, no = rejectClose; resolveClose = null; rejectClose = null;
    if (unknown) no(error('close_unknown')); else yes(undefined);
  }
  function markUnknown() {
    unknown = true;
    if (phase === 'CLOSED') phase = 'CLOSE_UNKNOWN';
  }
  function uncertain() { markUnknown(); failedControl = true; }
  function cancelRow(token, row) {
    // Claim before entering the actuator, including reentrant close/cancel.
    if (row.state === 'CANCELLING') { uncertain(); fail('cancel_unknown'); }
    if (row.state === 'CANCEL_UNKNOWN' || row.state === 'ARM_UNKNOWN') {
      uncertain(); fail('cancel_unknown'); // Never retry a failed/unknown actuator.
    }
    if (row.state === 'ARMING') { uncertain(); fail('cancel_unknown'); }
    if (row.state !== 'ARMED') return true;
    row.state = 'CANCELLING'; cancelCalls++;
    try {
      if (APPLY(CANCEL, undefined, [row.handle]) !== undefined) fail('cancel_unknown');
    } catch {
      row.state = 'CANCEL_UNKNOWN'; uncertain(); finishClose(); throw error('cancel_unknown');
    }
    row.state = 'CANCELLED'; row.handle = null; row.callback = null;
    active.delete(token); cancelled++; finishClose(); return true;
  }
  function cancelTicket(kind, token) {
    if (typeof token !== 'object' || token === null || IS_PROXY(token)) fail('input_rejected');
    const row = tickets.get(token);
    if (row === undefined || row.kind !== kind) fail('input_rejected');
    return cancelRow(token, row);
  }
  function wake(token, row) {
    if (row.state === 'CANCELLED' || row.state === 'FIRED' || row.state === 'DELIVERING') return;
    if (row.state === 'ARMING') {
      // A synchronous arm callback violates the trusted native-like contract.
      prematureWakes++; suppressed++; row.premature = true; uncertain(); return;
    }
    const old = row.state, work = row.callback;
    row.handle = null; row.callback = null; active.delete(token);
    if (old !== 'ARMED' || phase !== 'OPEN' || unknown) {
      if (old === 'CANCELLING') uncertain();
      row.state = 'FIRED'; suppressed++; finishClose(); return;
    }
    row.state = 'DELIVERING'; delivering++; delivered++;
    try { if (APPLY(work, undefined, []) !== undefined) markUnknown(); }
    catch { markUnknown(); }
    finally { row.state = 'FIRED'; delivering--; finishClose(); }
  }
  function schedule(kind, callback, milliseconds) {
    if (phase !== 'OPEN' || unknown || starts >= STARTS || active.size >= CONCURRENT) fail('unavailable');
    if (typeof callback !== 'function' || IS_PROXY(callback)) fail('input_rejected');
    integer(milliseconds, 1, DELAY);
    const token = FREEZE({}), row = { kind, state: 'ARMING', handle: null, callback, premature: false };
    tickets.set(token, row); active.set(token, row); starts++; armCalls++;
    let handle;
    try { handle = APPLY(ARM, undefined, [FREEZE(() => wake(token, row)), milliseconds]); }
    catch {
      row.state = 'ARM_UNKNOWN'; row.callback = null; uncertain(); finishClose(); throw error('schedule_unknown');
    }
    if (handle === null || typeof handle !== 'object' || IS_PROXY(handle)) {
      row.state = 'ARM_UNKNOWN'; row.callback = null; uncertain(); finishClose(); fail('schedule_unknown');
    }
    row.handle = handle; row.state = 'ARMED';
    if (row.premature || phase !== 'OPEN' || unknown) {
      // The handle became known only after a reentrant close/early wake.
      // One late cancellation is cleanup, not a retry or verdict repair.
      uncertain(); row.callback = null;
      try { cancelRow(token, row); } catch {}
      finishClose(); fail('schedule_unknown');
    }
    return token;
  }
  const ingress = FREEZE({
    schedule: FREEZE(function scheduleIngress(callback, milliseconds) {
      if (arguments.length !== 2) fail('input_rejected');
      return schedule('INGRESS', callback, milliseconds);
    }),
    cancel: FREEZE(function cancelIngress(token) {
      if (arguments.length !== 1) fail('input_rejected');
      return cancelTicket('INGRESS', token);
    }),
  });
  const service = FREEZE({
    monotonicNowNs: FREEZE(function monotonicNowNs() {
      if (arguments.length !== 0) fail('input_rejected');
      if (phase !== 'OPEN' || unknown) fail('unavailable');
      clockAttempts++;
      let value;
      try { value = APPLY(NOW, undefined, []); }
      catch { markUnknown(); throw error('clock_unknown'); }
      if (phase !== 'OPEN' || unknown || typeof value !== 'bigint' || value < lastNow) {
        markUnknown(); throw error('clock_unknown');
      }
      lastNow = value; clockReads++; return value;
    }),
    schedule: FREEZE(function scheduleService(callback, milliseconds) {
      if (arguments.length !== 2) fail('input_rejected');
      return schedule('SERVICE', callback, milliseconds);
    }),
    cancel: FREEZE(function cancelService(token) {
      if (arguments.length !== 1) fail('input_rejected');
      cancelTicket('SERVICE', token); // Deliberately void, even for fired tickets.
    }),
  });
  const close = FREEZE(function close() {
    if (arguments.length !== 0) fail('input_rejected');
    if (closing !== null) return closing;
    closing = new NativePromise((yes, no) => { resolveClose = yes; rejectClose = no; });
    Object.defineProperty(closing, 'constructor', { value: NativePromise });
    phase = 'CLOSING'; closeOutcome = 'PENDING';
    for (const [token, row] of active) {
      if (row.state === 'CANCELLING') continue; // Wait for the in-flight actuator.
      try { cancelRow(token, row); }
      catch { uncertain(); }
    }
    finishClose(); return closing;
  });
  const snapshot = FREEZE(function snapshot() {
    if (arguments.length !== 0) fail('input_rejected');
    return FREEZE({ phase, unknown, closePromiseOutcome: closeOutcome, scheduleStarts: starts,
      activeTimers: active.size, deliveringCallbacks: delivering, deliveredCallbacks: delivered,
      cancelledTimers: cancelled, suppressedWakes: suppressed, prematureWakes,
      clockReads, clockReadAttempts: clockAttempts, armCalls, cancelCalls,
      maxScheduleStarts: STARTS, maxConcurrentTimers: CONCURRENT, maxDelayMs: DELAY,
      controlUncertain: failedControl, ingressCancelContract: 'BOOLEAN',
      serviceCancelContract: 'UNDEFINED', nativeBinding: false, nativeIoPerformed: false,
      runtimeQualified: false, authority: 'NONE', physicalTimerDrain: 'NOT_ESTABLISHED' });
  });
  return FREEZE({ ingressRuntime: ingress, serviceRuntime: service, close, snapshot });
}
function record(value, fields) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || PROTO(value) !== Object.prototype || KEYS(value).length !== fields.length) fail('input_rejected');
  const out = {};
  for (const key of fields) {
    const d = DESC(value, key);
    if (!d || !OWN(d, 'value') || !d.enumerable) fail('input_rejected');
    Object.defineProperty(out, key, { value: d.value, enumerable: true });
  }
  return out;
}
function integer(value, low, high) {
  if (!Number.isSafeInteger(value) || value < low || value > high || Object.is(value, -0)) fail('input_rejected');
}
function error(kind) {
  const code = 'SERVICE_CREDIT_APPLICATION_DEADLINE_CORE_' + kind.toUpperCase(), e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code }); return FREEZE(e);
}
function fail(kind) { throw error(kind); }

