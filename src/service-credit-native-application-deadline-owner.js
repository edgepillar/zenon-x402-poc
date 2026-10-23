import { setTimeout as nativeSchedule, clearTimeout as nativeCancel } from 'node:timers';
import { hrtime } from 'node:process';
import { types as utilTypes } from 'node:util';

const SCHEDULE = nativeSchedule, CANCEL = nativeCancel, NOW = hrtime.bigint;
const NativePromise = Promise, APPLY = Reflect.apply, FREEZE = Object.freeze;
const DESC = Object.getOwnPropertyDescriptor, PROTO = Object.getPrototypeOf;
const KEYS = Reflect.ownKeys, OWN = Object.hasOwn, IS_PROXY = utilTypes.isProxy;

/**
 * Default-off native deadline owner for the actual HTTPS application.
 * Construction schedules nothing. Only explicit runtime.schedule starts a timer.
 * Shared private tickets, but DISTINCT contracts: ingress cancel -> boolean;
 * durable-service cancel -> undefined (including a known fired ticket).
 * No injected clock/timer factory, SDK, SQL, network, signer or installation.
 *
 * Opaque handles prevent consumers from mutating Node Timeout internals. A
 * known cancelled/fired ticket acknowledges that no future wake is armed.
 * Reentrant close waits for an already-delivering callback before clean close.
 * A failed native cancellation settles UNKNOWN with retained handle references;
 * a later wake is suppressed and cannot repair that verdict.
 * Counters/native intrinsics are cooperative observations, not an OS sandbox,
 * hard CPU deadline, physical timer-drain certificate or service authority.
 */
export function createServiceCreditNativeApplicationDeadlineOwner(configuration) {
  if (arguments.length !== 1) fail('input_rejected');
  const c = record(configuration, ['maxScheduleStarts', 'maxConcurrentTimers', 'maxDelayMs']);
  integer(c.maxScheduleStarts, 1, 65536); integer(c.maxConcurrentTimers, 1, 1024);
  integer(c.maxDelayMs, 1, 2_147_483_646);
  if (c.maxConcurrentTimers > c.maxScheduleStarts) fail('input_rejected');
  const STARTS = c.maxScheduleStarts, CONCURRENT = c.maxConcurrentTimers, DELAY = c.maxDelayMs;
  configuration = null;
  const tickets = new WeakMap(), active = new Map();
  let phase = 'OPEN', unknown = false, starts = 0, delivered = 0, cancelled = 0, suppressed = 0;
  let delivering = 0, clockReads = 0, lastNow = 0n, closing = null, settled = false;
  let resolveClose = null, rejectClose = null, cancellationFailed = false;

  function finishClose() {
    if (closing === null || settled || delivering !== 0) return;
    if (active.size !== 0 && !cancellationFailed) return;
    if (active.size !== 0) unknown = true;
    settled = true; phase = unknown ? 'CLOSE_UNKNOWN' : 'CLOSED';
    const yes = resolveClose, no = rejectClose; resolveClose = null; rejectClose = null;
    if (unknown) no(error('close_unknown')); else yes(undefined);
  }
  function cancelTicket(kind, token) {
    if (typeof token !== 'object' || token === null || IS_PROXY(token)) fail('input_rejected');
    const row = tickets.get(token);
    if (row === undefined || row.kind !== kind) fail('input_rejected');
    if (row.state === 'ARMED') {
      try {
        if (APPLY(CANCEL, undefined, [row.handle]) !== undefined) fail('cancel_unknown');
      } catch { unknown = true; cancellationFailed = true; throw error('cancel_unknown'); }
      row.state = 'CANCELLED'; row.handle = null; row.callback = null;
      active.delete(token); cancelled++;
    }
    return true; // Known ticket: cancelled/fired/delivering has no future arm.
  }
  function schedule(kind, callback, milliseconds) {
    if (phase !== 'OPEN' || unknown || starts >= STARTS || active.size >= CONCURRENT)
      fail('unavailable');
    if (typeof callback !== 'function' || IS_PROXY(callback)) fail('input_rejected');
    integer(milliseconds, 1, DELAY);
    const token = FREEZE({}), row = { kind, state: 'ARMED', handle: null, callback };
    tickets.set(token, row); active.set(token, row); starts++;
    try {
      row.handle = APPLY(SCHEDULE, undefined, [() => {
        if (row.state !== 'ARMED') return;
        row.handle = null; active.delete(token);
        const work = row.callback; row.callback = null;
        if (phase !== 'OPEN' || unknown) {
          row.state = 'FIRED'; suppressed++; finishClose(); return;
        }
        row.state = 'DELIVERING'; delivering++; delivered++;
        try { if (APPLY(work, undefined, []) !== undefined) unknown = true; }
        catch { unknown = true; }
        finally { row.state = 'FIRED'; delivering--; finishClose(); }
      }, milliseconds]);
    } catch {
      row.state = 'ARM_UNKNOWN'; row.callback = null; unknown = true;
      // Do not invent a native handle or a successful cancellation.
      cancellationFailed = true; throw error('schedule_unknown');
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
      let value;
      try { value = APPLY(NOW, hrtime, []); }
      catch { unknown = true; throw error('clock_unknown'); }
      if (typeof value !== 'bigint' || value < lastNow) {
        unknown = true; throw error('clock_unknown');
      }
      lastNow = value; clockReads++; return value;
    }),
    schedule: FREEZE(function scheduleService(callback, milliseconds) {
      if (arguments.length !== 2) fail('input_rejected');
      return schedule('SERVICE', callback, milliseconds);
    }),
    cancel: FREEZE(function cancelService(token) {
      if (arguments.length !== 1) fail('input_rejected');
      cancelTicket('SERVICE', token); // Deliberately no return value.
    }),
  });
  const close = FREEZE(function close() {
    if (arguments.length !== 0) fail('input_rejected');
    if (closing !== null) return closing;
    closing = new NativePromise((yes, no) => { resolveClose = yes; rejectClose = no; });
    Object.defineProperty(closing, 'constructor', { value: NativePromise });
    phase = 'CLOSING';
    for (const [token, row] of active) {
      try { cancelTicket(row.kind, token); }
      catch { unknown = true; cancellationFailed = true; }
    }
    finishClose(); return closing;
  });
  const snapshot = FREEZE(function snapshot() {
    if (arguments.length !== 0) fail('input_rejected');
    return FREEZE({ phase, unknown, scheduleStarts: starts, activeTimers: active.size,
      deliveringCallbacks: delivering, deliveredCallbacks: delivered, cancelledTimers: cancelled,
      suppressedWakes: suppressed, clockReads, maxScheduleStarts: STARTS, maxConcurrentTimers: CONCURRENT,
      maxDelayMs: DELAY, cancellationFailed, ingressCancelContract: 'BOOLEAN',
      serviceCancelContract: 'UNDEFINED', nativeBinding: true, runtimeQualified: false,
      authority: 'NONE', physicalTimerDrain: 'NOT_ESTABLISHED' });
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
  const code = 'SERVICE_CREDIT_NATIVE_APPLICATION_DEADLINE_' + kind.toUpperCase(), e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code }); return FREEZE(e);
}
function fail(kind) { throw error(kind); }

