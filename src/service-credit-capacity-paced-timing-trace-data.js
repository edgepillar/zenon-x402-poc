import { types as utilTypes } from 'node:util';
import { checkServiceCreditCapacityParentTimingTraceData } from './service-credit-capacity-parent-timing-trace-data.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, K = Reflect.ownKeys, P = Object.getPrototypeOf;
const O = Object.hasOwn, PROXY = utilTypes.isProxy, MAX_NS = (1n << 128n) - 1n;
const CORE_CHECK = checkServiceCreditCapacityParentTimingTraceData;
const PLAN_FIELDS = F(['warmupCallsPerLane', 'measurementCallsPerLane', 'setupBudgetMs',
  'measurementWindowMs', 'drainGraceMs', 'maxLedgerTransactionsPerOperation']);
const BASE_FIELDS = F(['capacityRecorderVersion', 'scope', 'clock', 'percentileMethod', 'recordingState',
  'recordingIssue', 'stopReason', 'limits', 'refusedStarts', 'pendingObservations', 'observedSpanNanoseconds',
  'phases', 'ledgerBalanceChecks', 'capacityQualification', 'ledgerCorrectness', 'authenticatedExecution', 'liveOrProduction', 'authority']);

/**
 * Strict, no-input-tree-copy arithmetic over frozen paced parent DATA.
 * Caller expectations are independent inputs, never learned from a report.
 * This does not import/replay recorders, observe timers, open a resource or
 * authenticate caller/run/source/ledger/child execution. Post-stop ledger
 * durations are bounded declared DATA, not independently recomputed events.
 */
export function checkServiceCreditCapacityPacedTimingTraceData(input) {
  if (arguments.length !== 1) fail();
  bounded(input);
  const c = exact(input, ['trace', 'report', 'expected']);
  const e = exact(c.expected, ['plan', 'recordingLimits', 'laneCount', 'minimumStartGapMs']);
  const plan = exact(e.plan, PLAN_FIELDS), limits = exact(e.recordingLimits, ['maxSamplesPerPhase', 'maxInFlightPerPhase']);
  integer(e.laneCount, 1, 16); integer(e.minimumStartGapMs, 1, 1000);
  integer(limits.maxSamplesPerPhase, 1, 4096); integer(limits.maxInFlightPerPhase, 1, 64);
  integer(plan.warmupCallsPerLane, 0, 256); integer(plan.measurementCallsPerLane, 1, 256);
  integer(plan.setupBudgetMs, 1, 60000); integer(plan.measurementWindowMs, 1, 60000);
  integer(plan.drainGraceMs, 1, 1000); integer(plan.maxLedgerTransactionsPerOperation, 1, 16);
  need(limits.maxInFlightPerPhase <= limits.maxSamplesPerPhase && e.laneCount <= limits.maxInFlightPerPhase
    && 3 * e.laneCount <= limits.maxSamplesPerPhase
    && (1 + plan.warmupCallsPerLane + plan.measurementCallsPerLane) * e.laneCount
      * plan.maxLedgerTransactionsPerOperation <= limits.maxSamplesPerPhase);

  const t = exact(c.trace, ['pacedTimingTraceVersion', 'scope', 'clockDomain', 'limits', 'laneCount',
    'minimumStartGapMs', 'maximumEvents', 'unknown', 'events', 'coreParentTimingTrace',
    'rawIdentifiersIncluded', 'additionalClockReads', 'nativeEventsAuthenticated',
    'nativeResourcesQualified', 'sustainableCapacityQualified', 'authority']);
  need(t.pacedTimingTraceVersion === 1 && t.scope === 'PRIVATE_PACED_PARENT_SOURCE_DATA_NOT_NATIVE_AUTHENTICATION'
    && t.clockDomain === 'PARENT_MONOTONIC_SHARED_WITH_CORE_NOT_CHILD_OR_SQL' && t.unknown === false
    && t.rawIdentifiersIncluded === false && t.additionalClockReads === 0 && t.nativeEventsAuthenticated === false
    && t.nativeResourcesQualified === false && t.sustainableCapacityQualified === false && t.authority === 'NONE');
  match(t.limits, limits); need(t.laneCount === e.laneCount && t.minimumStartGapMs === e.minimumStartGapMs
    && t.maximumEvents === 4 * limits.maxSamplesPerPhase + 1);

  const r = exact(c.report, ['pacedCapacityWorkloadOwnerVersion', 'scope', 'outcome', 'issue',
    'minimumStartGapMs', 'pacingAppliesTo', 'pacingModel', 'requestedMeasuredCalls', 'sourceExecuteEntries',
    'preEntryWithheld', 'pendingQueuedCalls', 'pendingSourceObservations', 'peakQueuedCalls', 'pacingTimersStarted',
    'maximumLivePacingTimers', 'coreLatenciesIncludePacingWait', 'sourceLatencyExcludesPacingWait',
    'queueWaitRecording', 'dispatchedCallRecording', 'core', 'nativeEventsAuthenticated', 'nativeResourcesQualified',
    'fixedOfferedRateQualified', 'sustainableCapacityQualified', 'productionQualified', 'authority']);
  need(r.pacedCapacityWorkloadOwnerVersion === 1 && r.scope === 'TRUSTED_PACED_SOURCE_LANES_NOT_NATIVE_QUALIFICATION'
    && r.outcome === 'OBSERVED_OWNERS_RETURNED' && r.issue === null && r.minimumStartGapMs === e.minimumStartGapMs
    && r.pacingAppliesTo === 'MEASUREMENT_ONLY' && r.pacingModel === 'CLOSED_LOOP_MINIMUM_GAP_NO_CATCHUP_NOT_FIXED_OFFERED_RATE'
    && r.pendingQueuedCalls === 0 && r.pendingSourceObservations === 0 && r.maximumLivePacingTimers === 1
    && r.coreLatenciesIncludePacingWait === true && r.sourceLatencyExcludesPacingWait === true
    && r.nativeEventsAuthenticated === false && r.nativeResourcesQualified === false && r.fixedOfferedRateQualified === false
    && r.sustainableCapacityQualified === false && r.productionQualified === false && r.authority === 'NONE');
  for (const name of ['requestedMeasuredCalls', 'sourceExecuteEntries', 'preEntryWithheld'])
    integer(r[name], 0, limits.maxSamplesPerPhase);
  integer(r.peakQueuedCalls, 0, e.laneCount);
  // Timer events are not in this trace: validate only the declared finite bound.
  integer(r.pacingTimersStarted, 0, r.requestedMeasuredCalls);

  const core = exact(r.core, ['capacityWorkloadOwnerVersion', 'scope', 'outcome', 'reason', 'uncertainty',
    'measurementStatus', 'plan', 'plannedCallsCompleted', 'laneCount', 'pendingOperations', 'pendingLedgerBoundaries',
    'returnedCloses', 'unknownCloses', 'pendingCloses', 'balanceBarriersObserved', 'pendingBalanceReads',
    'balanceBarrierPending', 'balanceReadAttempts', 'completedBalanceBarriers', 'pendingWindowStarts', 'pendingWindowStops',
    'windowOpenBarrierPending', 'windowStartsObserved', 'windowStopsObserved', 'windowHandoffContract',
    'measurementWindowIsolationQualified', 'balanceContract', 'recording', 'postStopLedgerRecording',
    'ledgerBoundariesStarted', 'nativeClockAuthenticated', 'nativeResourcesQualified', 'benchmarkQualified', 'capacityQualified', 'authority']);
  need(core.capacityWorkloadOwnerVersion === 3 && core.scope === 'TRUSTED_WINDOWED_ASYNC_SOURCE_LANES_NOT_NATIVE_QUALIFICATION'
    && core.outcome === 'OBSERVED_OWNERS_RETURNED' && core.uncertainty === null && core.measurementStatus === 'OBSERVED_COMPONENT_ONLY'
    && core.laneCount === e.laneCount && core.returnedCloses === e.laneCount && core.unknownCloses === 0 && core.pendingCloses === 0
    && core.pendingOperations === 0 && core.pendingLedgerBoundaries === 0 && core.pendingBalanceReads === 0
    && core.balanceBarrierPending === false && core.balanceReadAttempts === 3 * e.laneCount && core.completedBalanceBarriers === 3
    && core.pendingWindowStarts === 0 && core.pendingWindowStops === 0 && core.windowOpenBarrierPending === false
    && core.windowStartsObserved === e.laneCount && core.windowStopsObserved === e.laneCount
    && core.windowHandoffContract === 'GENUINE_PROMISE_SERVICE_CHILD_MARKERS_NOT_PARENT_CLOCK_ALIGNMENT'
    && core.balanceContract === 'GENUINE_PROMISE_FRESH_READ_NOT_SYNC_CACHE'
    && core.measurementWindowIsolationQualified === false && core.nativeClockAuthenticated === false
    && core.nativeResourcesQualified === false && core.benchmarkQualified === false && core.capacityQualified === false && core.authority === 'NONE');
  need(['PLAN_COMPLETE', 'MANUAL_MEASUREMENT_STOP', 'MEASUREMENT_WINDOW_ELAPSED'].includes(core.reason));
  match(core.plan, plan); match(data(core.recording, 'limits'), limits);
  CORE_CHECK(F({ trace: t.coreParentTimingTrace, recording: core.recording }));
  match(data(t.coreParentTimingTrace, 'limits'), limits);
  need(core.balanceBarriersObserved === data(data(core.recording, 'ledgerBalanceChecks'), 'samples'));
  integer(core.ledgerBoundariesStarted, 0, limits.maxSamplesPerPhase);
  const post = declaredPostStop(core.postStopLedgerRecording, limits);
  need(core.ledgerBoundariesStarted === data(data(data(core.recording, 'phases'), 'LEDGER_TRANSACTION'), 'enteredAcrossCohorts') + post);

  const coreBegins = [], coreFinishes = new Map(), measured = new Set();
  for (const row of data(t.coreParentTimingTrace, 'events')) {
    if (row.kind === 'BEGIN' && row.phase === 'FUNDED_CALL' && row.cohort === 'MEASUREMENT') {
      coreBegins.push(row); measured.add(row.observation);
    } else if (row.kind === 'FINISH' && measured.has(row.observation)) coreFinishes.set(row.observation, row);
  }

  const rows = dense(t.events, t.maximumEvents), requests = new Map(), occupied = new Map(), ordinals = new Map(), fifo = [];
  const wait = series(), source = series();
  let lastTime = null, lastStart = null, entries = 0, withdrawals = 0, peakQueue = 0, finalized = false;
  for (let index = 0; index < rows.length; index++) {
    const raw = rows[index], kind = data(raw, 'kind'); need(!finalized);
    integer(data(raw, 'sequence'), index + 1, index + 1);
    let at = null;
    if (O(raw, 'atNs')) { at = ns(data(raw, 'atNs')); need(lastTime === null || at >= lastTime); lastTime = at; }
    if (kind === 'REQUEST') {
      const v = exact(raw, ['sequence', 'kind', 'request', 'lane', 'ordinal']);
      integer(v.request, requests.size + 1, requests.size + 1); integer(v.lane, 0, e.laneCount - 1);
      integer(v.ordinal, 0, plan.measurementCallsPerLane - 1);
      need(requests.size < limits.maxSamplesPerPhase && !occupied.has(v.lane) && v.ordinal === (ordinals.get(v.lane) ?? 0));
      const original = coreBegins[v.request - 1]; need(original !== undefined);
      const finish = coreFinishes.get(original.observation); need(finish !== undefined);
      requests.set(v.request, { state: 'RESERVED', lane: v.lane, begin: ns(original.atNs), finish: ns(finish.atNs), outcome: finish.outcome });
      occupied.set(v.lane, v.request); ordinals.set(v.lane, v.ordinal + 1); fifo.push(v.request);
      need(fifo.length <= e.laneCount); peakQueue = Math.max(peakQueue, fifo.length);
    } else if (kind === 'WAIT_BEGIN') {
      const v = exact(raw, ['sequence', 'kind', 'request', 'atNs']), item = request(requests, v.request);
      need(item.state === 'RESERVED' && item.begin <= at && at <= item.finish);
      item.state = 'WAITING'; item.waitAt = at; begin(wait, at);
    } else if (kind === 'DISPATCH') {
      const v = exact(raw, ['sequence', 'kind', 'request', 'atNs']), item = request(requests, v.request);
      need(item.state === 'WAITING' && fifo.shift() === v.request && item.begin <= at && at <= item.finish
        && (lastStart === null || at - lastStart >= BigInt(e.minimumStartGapMs) * 1000000n));
      lastStart = at; terminal(wait, item.waitAt, at, 'SUCCEEDED'); begin(source, at);
      item.sourceAt = at; item.state = 'ENTERED'; entries++;
    } else if (kind === 'SOURCE_TERMINAL') {
      const v = exact(raw, ['sequence', 'kind', 'request', 'outcome', 'atNs']), item = request(requests, v.request);
      need(item.state === 'ENTERED' && (v.outcome === 'SUCCEEDED' || v.outcome === 'REJECTED')
        && v.outcome === item.outcome && item.sourceAt <= at && at <= item.finish);
      terminal(source, item.sourceAt, at, v.outcome); item.state = 'DONE'; occupied.delete(item.lane);
    } else if (kind === 'WITHDRAW') {
      const v = exact(raw, ['sequence', 'kind', 'request', 'recordedWait', 'atNs']), item = request(requests, v.request);
      need((item.state === 'RESERVED' || item.state === 'WAITING') && typeof v.recordedWait === 'boolean'
        && v.recordedWait === (item.state === 'WAITING') && fifo.shift() === v.request
        && item.begin <= at && at <= item.finish && item.outcome === 'REJECTED');
      if (v.recordedWait) terminal(wait, item.waitAt, at, 'REJECTED');
      item.state = 'WITHHELD'; occupied.delete(item.lane); withdrawals++;
    } else {
      exact(raw, ['sequence', 'kind']); need(kind === 'FINALIZE' && index === rows.length - 1); finalized = true;
    }
  }
  need(finalized && fifo.length === 0 && occupied.size === 0 && wait.active === 0 && source.active === 0
    && coreBegins.length === requests.size && requests.size === r.requestedMeasuredCalls
    && entries === r.sourceExecuteEntries && withdrawals === r.preEntryWithheld && peakQueue === r.peakQueuedCalls);
  need(core.plannedCallsCompleted === (Array.from({ length: e.laneCount }, (_, lane) => ordinals.get(lane) ?? 0)
    .every(count => count === plan.measurementCallsPerLane)));
  match(c.report.queueWaitRecording, baseReport(wait, limits));
  match(c.report.dispatchedCallRecording, baseReport(source, limits));
  return F({ pacedTimingTraceDataVersion: 1, status: 'COMPLETE_MATCHING_DECLARED_PACED_TIMING_DATA',
    eventsChecked: rows.length, requestsChecked: requests.size, sourceEntriesChecked: entries,
    preEntryWithdrawalsChecked: withdrawals, queueAndSourceRecordersRecomputed: true,
    coreParentRecorderIndependentlyChecked: true, coreLogicalFundedCallsCrossBound: true,
    timerEventsIndependentlyRecomputed: false, postStopLedgerDurationSeriesRecomputed: false,
    callerExpectationsAuthenticated: false, runOrNativeSourceContextAuthenticated: false,
    nativeEventsAuthenticated: false, nativeResourcesQualified: false, sustainableCapacityQualified: false, authority: 'NONE' });
}

function series() { return { entered: 0, settled: 0, active: 0, peak: 0, succeeded: 0, rejected: 0, all: [], success: null, first: null, last: null }; }
function touch(s, at) { if (s.first === null) s.first = at; s.last = at; }
function begin(s, at) { s.entered++; s.active++; s.peak = Math.max(s.peak, s.active); touch(s, at); }
function terminal(s, start, at, outcome) {
  need(at >= start && s.active > 0); const elapsed = at - start;
  // Share the sorted terminal summary on all-success paths. Only the first
  // rejection needs a separate bounded successful-duration subset.
  if (outcome === 'REJECTED' && s.success === null) s.success = s.all.slice();
  else if (outcome === 'SUCCEEDED' && s.success !== null) s.success.push(elapsed);
  s.all.push(elapsed); s.settled++; s.active--; s[outcome === 'SUCCEEDED' ? 'succeeded' : 'rejected']++; touch(s, at);
}
function histogram(values) {
  if (values.length === 0) return { samples: 0, min: null, p50: null, p95: null, p99: null, max: null };
  values.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const rank = p => String(values[Math.floor((values.length * p - 1) / 100)]);
  return { samples: values.length, min: String(values[0]), p50: rank(50), p95: rank(95), p99: rank(99), max: String(values.at(-1)) };
}
function phase(s) {
  const all = histogram(s.all), success = s.success === null ? all : histogram(s.success);
  return { entered: s.entered, settled: s.settled, pending: s.active, succeeded: s.succeeded, rejected: s.rejected,
    unknown: 0, peakInFlight: s.peak, nonSuccessFraction: s.settled ? { numerator: s.rejected, denominator: s.settled } : null,
    terminalLatencyNanoseconds: all, successfulLatencyNanoseconds: success };
}
function baseReport(s, limits) {
  return { capacityRecorderVersion: 1, scope: 'CALLER_DECLARED_OBSERVATIONS_ONLY',
    clock: 'CALLER_SUPPLIED_MONOTONIC_NANOSECONDS', percentileMethod: 'NEAREST_RANK',
    recordingState: s.entered ? 'COMPLETE' : 'EMPTY', recordingIssue: null, stopReason: null, limits,
    refusedStarts: 0, pendingObservations: 0, observedSpanNanoseconds: s.first === null ? null : String(s.last - s.first),
    phases: { FUNDING: phase(series()), FUNDED_CALL: phase(s), LEDGER_TRANSACTION: phase(series()) },
    ledgerBalanceChecks: { samples: 0, mismatches: 0, result: 'NOT_RECORDED' }, capacityQualification: 'NOT_ESTABLISHED',
    ledgerCorrectness: 'NOT_ESTABLISHED', authenticatedExecution: false, liveOrProduction: false, authority: 'NONE' };
}
function declaredPostStop(value, limits) {
  const v = exact(value, BASE_FIELDS); match(v.limits, limits);
  need(v.capacityRecorderVersion === 1 && v.scope === 'CALLER_DECLARED_OBSERVATIONS_ONLY'
    && v.clock === 'CALLER_SUPPLIED_MONOTONIC_NANOSECONDS' && v.percentileMethod === 'NEAREST_RANK'
    && (v.recordingState === 'EMPTY' || v.recordingState === 'COMPLETE') && v.recordingIssue === null
    && v.stopReason === null && v.refusedStarts === 0 && v.pendingObservations === 0
    && v.capacityQualification === 'NOT_ESTABLISHED' && v.ledgerCorrectness === 'NOT_ESTABLISHED'
    && v.authenticatedExecution === false && v.liveOrProduction === false && v.authority === 'NONE');
  const phases = exact(v.phases, ['FUNDING', 'FUNDED_CALL', 'LEDGER_TRANSACTION']);
  match(phases.FUNDING, phase(series())); match(phases.FUNDED_CALL, phase(series()));
  const q = exact(phases.LEDGER_TRANSACTION, ['entered', 'settled', 'pending', 'succeeded', 'rejected', 'unknown',
    'peakInFlight', 'nonSuccessFraction', 'terminalLatencyNanoseconds', 'successfulLatencyNanoseconds']);
  integer(q.entered, 0, limits.maxSamplesPerPhase); integer(q.succeeded, 0, q.entered); integer(q.rejected, 0, q.entered);
  integer(q.peakInFlight, q.entered ? 1 : 0, Math.min(q.entered, limits.maxInFlightPerPhase));
  need(q.settled === q.entered && q.pending === 0 && q.unknown === 0 && q.succeeded + q.rejected === q.entered);
  match(q.nonSuccessFraction, q.entered ? { numerator: q.rejected, denominator: q.entered } : null);
  const span = q.entered ? ns(v.observedSpanNanoseconds) : null;
  if (!q.entered) need(v.observedSpanNanoseconds === null);
  need(v.recordingState === (q.entered ? 'COMPLETE' : 'EMPTY'));
  declaredHistogram(q.terminalLatencyNanoseconds, q.entered, span);
  declaredHistogram(q.successfulLatencyNanoseconds, q.succeeded, span);
  match(v.ledgerBalanceChecks, { samples: 0, mismatches: 0, result: 'NOT_RECORDED' });
  return q.entered;
}
function declaredHistogram(value, count, span) {
  const q = exact(value, ['samples', 'min', 'p50', 'p95', 'p99', 'max']); need(q.samples === count);
  if (!count) { match(value, histogram([])); return; }
  const rows = ['min', 'p50', 'p95', 'p99', 'max'].map(k => ns(q[k]));
  need(rows.every((v, i) => (i === 0 || rows[i - 1] <= v) && v <= span));
}
function request(map, id) { integer(id, 1, 4096); const row = map.get(id); need(row !== undefined); return row; }
function object(v) { need(v !== null && typeof v === 'object' && !PROXY(v) && (P(v) === Object.prototype || P(v) === null) && Object.isFrozen(v)); }
function data(v, name) { object(v); const d = D(v, name); need(d && O(d, 'value') && d.enumerable); return d.value; }
function exact(v, fields) { object(v); need(K(v).length === fields.length); const out = {}; for (const k of fields) out[k] = data(v, k); return out; }
function dense(v, maximum) {
  need(v !== null && typeof v === 'object' && !PROXY(v) && P(v) === Array.prototype && Object.isFrozen(v));
  const n = D(v, 'length'); need(n && O(n, 'value')); integer(n.value, 1, maximum); need(K(v).length === n.value + 1);
  for (let i = 0; i < n.value; i++) { const d = D(v, String(i)); need(d && O(d, 'value') && d.enumerable); }
  return v;
}
function bounded(value) {
  let nodes = 0;
  function visit(v, depth) {
    need(++nodes <= 1000000 && depth <= 32);
    if (v === null || typeof v === 'boolean') return;
    if (typeof v === 'string') { need(v.length <= 65536 && /^[\x20-\x7e]*$/.test(v)); return; }
    if (typeof v === 'number') { need(Number.isSafeInteger(v) && !Object.is(v, -0)); return; }
    need(typeof v === 'object' && !PROXY(v) && Object.isFrozen(v));
    if (P(v) === Array.prototype) {
      const n = D(v, 'length'); need(n && O(n, 'value')); integer(n.value, 0, 30000); need(K(v).length === n.value + 1);
      for (let i = 0; i < n.value; i++) { const d = D(v, String(i)); need(d && O(d, 'value') && d.enumerable); visit(d.value, depth + 1); }
    } else {
      object(v); need(K(v).length <= 64);
      for (const key of K(v)) { need(typeof key === 'string' && /^[\x20-\x7e]{1,256}$/.test(key)); visit(data(v, key), depth + 1); }
    }
  }
  visit(value, 0);
}
function match(actual, expected) {
  if (expected === null || typeof expected !== 'object') { need(Object.is(actual, expected)); return; }
  const keys = K(expected), values = exact(actual, keys); for (const key of keys) match(values[key], expected[key]);
}
function ns(v) { need(typeof v === 'string' && /^(0|[1-9][0-9]{0,38})$/.test(v)); const n = BigInt(v); need(n <= MAX_NS); return n; }
function integer(v, low, high) { need(Number.isSafeInteger(v) && !Object.is(v, -0) && v >= low && v <= high); }
function need(v) { if (!v) fail(); }
function fail() {
  const error = new TypeError('service_credit_capacity_paced_timing_trace_data_rejected');
  Object.defineProperty(error, 'stack', { value: 'TypeError: service_credit_capacity_paced_timing_trace_data_rejected' }); throw F(error);
}
