import { types as utilTypes } from 'node:util';
import { checkServiceCreditCapacityPacedTimingTraceData } from './service-credit-capacity-paced-timing-trace-data.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, K = Reflect.ownKeys;
const P = Object.getPrototypeOf, O = Object.hasOwn, PROXY = utilTypes.isProxy;
const BASE = checkServiceCreditCapacityPacedTimingTraceData, MAX_NS = (1n << 128n) - 1n, M = 1000000n;

/**
 * Independently reconstruct pacing timer call DATA against the genuine paced
 * trace. This is not timer liveness, physical cancellation, an authenticated
 * clock or native execution. The existing complete paced/parent arithmetic runs
 * once; raw traces are borrowed, not copied, replayed or accepted as authority.
 * Post-stop ledger duration reconstruction remains outside this selection.
 */
export function checkServiceCreditCapacityPacedTimerTraceData(input) {
  if (arguments.length !== 1) fail();
  try { return checked(input); } catch { fail(); }
}

function checked(input) {
  const c = exact(input, ['trace', 'timerTrace', 'report', 'expected']);
  const pacedCheck = BASE(F({ trace: c.trace, report: c.report, expected: c.expected }));
  const expected = exact(c.expected, ['plan', 'recordingLimits', 'laneCount', 'minimumStartGapMs']);
  const limits = exact(expected.recordingLimits, ['maxSamplesPerPhase', 'maxInFlightPerPhase']);
  const t = exact(c.timerTrace, ['pacedTimerTraceVersion', 'scope', 'clockDomain', 'limits', 'laneCount',
    'minimumStartGapMs', 'maximumEvents', 'unknown', 'events', 'rawTokensIncluded', 'additionalClockReads',
    'nativeEventsAuthenticated', 'physicalTimerAbsenceQualified', 'authority']);
  need(t.pacedTimerTraceVersion === 1 && t.scope === 'PRIVATE_PACING_TIMER_CALLS_NOT_NATIVE_AUTHENTICATION'
    && t.clockDomain === 'PARENT_MONOTONIC_SHARED_WITH_PACED_TRACE_NOT_TIMER_LIVENESS'
    && t.unknown === false && t.laneCount === expected.laneCount
    && t.minimumStartGapMs === expected.minimumStartGapMs && t.maximumEvents === 4 * limits.maxSamplesPerPhase + 1
    && t.rawTokensIncluded === false && t.additionalClockReads === 0 && t.nativeEventsAuthenticated === false
    && t.physicalTimerAbsenceQualified === false && t.authority === 'NONE');
  const actualLimits = exact(t.limits, ['maxSamplesPerPhase', 'maxInFlightPerPhase']);
  need(actualLimits.maxSamplesPerPhase === limits.maxSamplesPerPhase && actualLimits.maxInFlightPerPhase === limits.maxInFlightPerPhase);
  const rows = dense(t.events, t.maximumEvents), paced = data(c.trace, 'events');
  const gap = BigInt(expected.minimumStartGapMs) * M;
  let cursor = 0, queued = 0, previousAnchor = 0, latest = null, lastDispatch = null;
  let active = null, expectedDispatchAt = null, attempts = 0, armed = 0, fired = 0, cancelled = 0, finalized = false;
  function observe(at) { need(latest === null || at >= latest); latest = at; }
  function advance(anchor) {
    while (cursor < anchor) {
      const row = paced[cursor++];
      if (expectedDispatchAt !== null) need(row.kind === 'DISPATCH');
      if ('atNs' in row) observe(ns(row.atNs));
      if (row.kind === 'REQUEST') queued++;
      else if (row.kind === 'WITHDRAW') queued--;
      else if (row.kind === 'DISPATCH') {
        need(active === null);
        const at = ns(row.atNs);
        if (expectedDispatchAt !== null) { need(at === expectedDispatchAt); expectedDispatchAt = null; }
        lastDispatch = at; queued--;
      }
      need(queued >= 0 && queued <= expected.laneCount);
    }
  }
  for (let index = 0; index < rows.length; index++) {
    const raw = rows[index], kind = data(raw, 'kind'), anchor = data(raw, 'pacedSequence');
    integer(data(raw, 'sequence'), index + 1, index + 1); integer(anchor, previousAnchor, paced.length);
    need(!finalized); previousAnchor = anchor; advance(anchor);
    if (kind === 'ARM') {
      const row = exact(raw, ['sequence', 'pacedSequence', 'kind', 'timer', 'atNs', 'dueNs', 'delayMs']);
      integer(row.timer, attempts + 1, attempts + 1); integer(row.delayMs, 1, expected.minimumStartGapMs);
      const at = ns(row.atNs), due = ns(row.dueNs);
      need(active === null && expectedDispatchAt === null && queued > 0 && lastDispatch !== null
        && due === lastDispatch + gap && at < due && row.delayMs === Number((due - at + M - 1n) / M)
        && attempts < limits.maxSamplesPerPhase);
      observe(at); active = { id: row.timer, due, armed: false }; attempts++;
    } else if (kind === 'ARMED') {
      const row = exact(raw, ['sequence', 'pacedSequence', 'kind', 'timer']);
      integer(row.timer, 1, attempts); need(active !== null && row.timer === active.id && !active.armed);
      active.armed = true; armed++;
    } else if (kind === 'FIRE') {
      const row = exact(raw, ['sequence', 'pacedSequence', 'kind', 'timer', 'atNs']);
      integer(row.timer, 1, attempts); const at = ns(row.atNs);
      need(active !== null && row.timer === active.id && active.armed && at >= active.due);
      observe(at); active = null; fired++;
      // The genuine callback pumps this exact observed time, not a catchup slot.
      if (queued > 0) expectedDispatchAt = at;
    } else if (kind === 'CANCEL') {
      const row = exact(raw, ['sequence', 'pacedSequence', 'kind', 'timer', 'returned']);
      integer(row.timer, 1, attempts);
      need(active !== null && row.timer === active.id && active.armed && row.returned === true);
      active = null; cancelled++;
    } else {
      exact(raw, ['sequence', 'pacedSequence', 'kind']);
      need(kind === 'FINALIZE' && index === rows.length - 1 && anchor === paced.length); finalized = true;
    }
  }
  need(finalized && cursor === paced.length && queued === 0 && active === null && expectedDispatchAt === null
    && attempts === armed && fired + cancelled === armed && armed === data(c.report, 'pacingTimersStarted'));
  return F({ pacedTimerTraceDataVersion: 1, status: 'COMPLETE_MATCHING_DECLARED_PACING_TIMER_DATA',
    eventsChecked: rows.length, pacedEventsCrossChecked: cursor, armAttemptsChecked: attempts,
    timersStartedChecked: armed, timerFiresChecked: fired, cancelReturnsChecked: cancelled,
    maximumLiveTimersObservedAsData: armed === 0 ? 0 : 1,
    timerEventsIndependentlyRecomputed: true, timerCountAndDispatchAnchorsCrossBound: true,
    pacedAndParentArithmeticPasses: 1, pacedCheck, postStopLedgerDurationSeriesRecomputed: false,
    callerClockAuthenticated: false, nativeEventsAuthenticated: false, physicalTimerAbsenceQualified: false,
    nativeResourcesQualified: false, sustainableCapacityQualified: false, productionQualified: false, authority: 'NONE' });
}
function object(value) {
  need(value !== null && typeof value === 'object' && !PROXY(value)
    && (P(value) === Object.prototype || P(value) === null) && Object.isFrozen(value));
}
function data(value, name) {
  object(value); const d = D(value, name); need(d && O(d, 'value') && d.enumerable); return d.value;
}
function exact(value, fields) {
  object(value); need(K(value).length === fields.length);
  const out = {}; for (const name of fields) out[name] = data(value, name); return out;
}
function dense(value, maximum) {
  need(value !== null && typeof value === 'object' && !PROXY(value) && P(value) === Array.prototype && Object.isFrozen(value));
  const d = D(value, 'length'); need(d && O(d, 'value')); integer(d.value, 1, maximum);
  need(K(value).length === d.value + 1);
  for (let i = 0; i < d.value; i++) { const row = D(value, String(i)); need(row && O(row, 'value') && row.enumerable); }
  return value;
}
function ns(value) {
  need(typeof value === 'string' && /^(0|[1-9][0-9]{0,38})$/.test(value));
  const n = BigInt(value); need(n <= MAX_NS); return n;
}
function integer(value, min, max) { need(Number.isSafeInteger(value) && !Object.is(value, -0) && value >= min && value <= max); }
function need(value) { if (!value) fail(); }
function fail() {
  const e = new TypeError('service_credit_capacity_paced_timer_trace_data_rejected');
  Object.defineProperty(e, 'stack', { value: 'TypeError: service_credit_capacity_paced_timer_trace_data_rejected' });
  throw F(e);
}
