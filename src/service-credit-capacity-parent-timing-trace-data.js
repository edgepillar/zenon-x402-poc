import { types as utilTypes } from 'node:util';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, K = Reflect.ownKeys;
const P = Object.getPrototypeOf, O = Object.hasOwn, IS_PROXY = utilTypes.isProxy;
const PHASES = F(['FUNDING', 'FUNDED_CALL', 'LEDGER_TRANSACTION']);
const COHORTS = F(['WARMUP', 'MEASUREMENT']), MAX_NS = (1n << 128n) - 1n;

/**
 * Independent arithmetic over bounded frozen private recorder-event DATA.
 * Does not replay the recorder, import an application or read a clock/store.
 * Full latencies, cohort counters, peaks, carry/spill and exact window ratios
 * are recomputed. A matching pair of declarations is not native authentication,
 * original-request identity, pure SQL latency, physical drain or capacity proof.
 */
export function checkServiceCreditCapacityParentTimingTraceData(input) {
  if (arguments.length !== 1) fail();
  const c = exact(input, ['trace', 'recording']);
  const t = exact(c.trace, ['parentTimingTraceVersion', 'scope', 'clockDomain', 'limits',
    'unknown', 'maximumEvents', 'events', 'rawIdentifiersIncluded', 'postStopLedgerTraceIncluded',
    'nativeEventsAuthenticated', 'nativeResourcesQualified', 'sustainableCapacityQualified', 'authority']);
  if (t.parentTimingTraceVersion !== 1 || t.scope !== 'PRIVATE_PARENT_RECORDER_EVENTS_NOT_NATIVE_AUTHENTICATION'
      || t.clockDomain !== 'PARENT_MONOTONIC_RECORDER_EVENT_ORDER' || t.unknown !== false
      || t.rawIdentifiersIncluded !== false || t.postStopLedgerTraceIncluded !== false
      || t.nativeEventsAuthenticated !== false || t.nativeResourcesQualified !== false
      || t.sustainableCapacityQualified !== false || t.authority !== 'NONE') fail();
  const limits = exact(t.limits, ['maxSamplesPerPhase', 'maxInFlightPerPhase']);
  integer(limits.maxSamplesPerPhase, 1, 4096); integer(limits.maxInFlightPerPhase, 1, 64);
  if (limits.maxInFlightPerPhase > limits.maxSamplesPerPhase
      || t.maximumEvents !== 7 * limits.maxSamplesPerPhase + 4) fail();
  const rows = dense(t.events, t.maximumEvents), lanes = {}, cohorts = {}, active = new Map();
  for (const name of PHASES) lanes[name] = {
    entered: 0, active: 0, peak: 0, windowPeak: 0, warmupActive: 0, measuredActive: 0,
    warmupAtStart: 0, warmupAtStop: 0, measuredAtStop: 0,
    warmupInside: counters(), measuredInside: counters(), warmupAfter: counters(), measuredAfter: counters(),
  };
  for (const name of COHORTS) {
    const phases = {};
    for (const phase of PHASES) phases[phase] = {
      entered: 0, settled: 0, succeeded: 0, rejected: 0, active: 0, peak: 0, all: [], success: [],
    };
    cohorts[name] = { phases, first: null, last: null, balances: 0 };
  }
  const stages = { WARMUP: { samples: 0, mismatches: 0 }, MEASURING: { samples: 0, mismatches: 0 },
    DRAINING: { samples: 0, mismatches: 0 } };
  let stage = 'CREATED', runStart = null, warmupStart = null, start = null, stop = null, ended = null;
  let previous = null, observation = 0, balanceChecks = 0;
  function tick(meta, at) { if (meta.first === null) meta.first = at; meta.last = at; }
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index], sequence = data(row, 'sequence'), kind = data(row, 'kind');
    if (sequence !== index + 1 || ended !== null) fail();
    const at = ns(data(row, 'atNs'));
    if (previous !== null && at < previous) fail();
    previous = at;
    if (kind === 'START_WARMUP') {
      exact(row, ['sequence', 'kind', 'atNs']);
      if (stage !== 'CREATED') fail();
      warmupStart = at; runStart = at; stage = 'WARMUP';
    } else if (kind === 'START_MEASUREMENT') {
      exact(row, ['sequence', 'kind', 'atNs']);
      if (stage !== 'CREATED' && stage !== 'WARMUP') fail();
      if (runStart === null) runStart = at;
      start = at; stage = 'MEASURING';
      for (const phase of PHASES) {
        lanes[phase].warmupAtStart = lanes[phase].warmupActive;
        lanes[phase].windowPeak = lanes[phase].active;
      }
    } else if (kind === 'STOP_MEASUREMENT') {
      exact(row, ['sequence', 'kind', 'atNs']);
      if (stage !== 'MEASURING' || at <= start) fail();
      stop = at; stage = 'DRAINING';
      for (const phase of PHASES) {
        lanes[phase].warmupAtStop = lanes[phase].warmupActive;
        lanes[phase].measuredAtStop = lanes[phase].measuredActive;
      }
    } else if (kind === 'BEGIN') {
      const r = exact(row, ['sequence', 'kind', 'observation', 'phase', 'cohort', 'atNs']);
      const cohort = stage === 'WARMUP' ? 'WARMUP' : 'MEASUREMENT';
      if ((stage !== 'WARMUP' && stage !== 'MEASURING') || !PHASES.includes(r.phase)
          || r.cohort !== cohort || r.observation !== observation + 1) fail();
      const lane = lanes[r.phase], group = cohorts[cohort].phases[r.phase];
      if (lane.entered >= limits.maxSamplesPerPhase || lane.active >= limits.maxInFlightPerPhase) fail();
      observation++; lane.entered++; lane.active++; group.entered++; group.active++;
      if (cohort === 'WARMUP') lane.warmupActive++; else lane.measuredActive++;
      lane.peak = Math.max(lane.peak, lane.active); group.peak = Math.max(group.peak, group.active);
      if (stage === 'MEASURING') lane.windowPeak = Math.max(lane.windowPeak, lane.active);
      tick(cohorts[cohort], at); active.set(r.observation, { at, phase: r.phase, cohort });
    } else if (kind === 'FINISH') {
      const r = exact(row, ['sequence', 'kind', 'observation', 'outcome', 'atNs']);
      integer(r.observation, 1, 3 * limits.maxSamplesPerPhase);
      const begun = active.get(r.observation);
      if (!begun || (r.outcome !== 'SUCCEEDED' && r.outcome !== 'REJECTED')) fail();
      active.delete(r.observation);
      const lane = lanes[begun.phase], meta = cohorts[begun.cohort], group = meta.phases[begun.phase];
      lane.active--; group.active--; group.settled++;
      if (begun.cohort === 'WARMUP') lane.warmupActive--; else lane.measuredActive--;
      const elapsed = at - begun.at; group.all.push(elapsed);
      if (r.outcome === 'SUCCEEDED') { group.succeeded++; group.success.push(elapsed); } else group.rejected++;
      tick(meta, at);
      if (stage === 'MEASURING') add(begun.cohort === 'WARMUP' ? lane.warmupInside : lane.measuredInside, r.outcome);
      else if (stage === 'DRAINING') add(begun.cohort === 'WARMUP' ? lane.warmupAfter : lane.measuredAfter, r.outcome);
    } else if (kind === 'BALANCE_CHECK') {
      const r = exact(row, ['sequence', 'kind', 'matches', 'atNs']);
      if (!O(stages, stage) || r.matches !== true || balanceChecks >= limits.maxSamplesPerPhase) fail();
      balanceChecks++; stages[stage].samples++;
      cohorts[stage === 'WARMUP' ? 'WARMUP' : 'MEASUREMENT'].balances++;
    } else if (kind === 'FINALIZE') {
      exact(row, ['sequence', 'kind', 'atNs']);
      if (stage !== 'DRAINING' || active.size !== 0 || index !== rows.length - 1) fail();
      ended = at;
    } else fail();
  }
  if (ended === null || start === null || stop === null) fail();
  const summaries = {}, phaseSummaries = {};
  for (const cohort of COHORTS) {
    const meta = cohorts[cohort], phases = {}; let entered = 0;
    for (const name of PHASES) {
      const group = meta.phases[name]; entered += group.entered;
      phases[name] = { entered: group.entered, settled: group.settled, pending: 0,
        succeeded: group.succeeded, rejected: group.rejected, unknown: 0, peakInFlight: group.peak,
        nonSuccessFraction: group.settled === 0 ? null : { numerator: group.rejected, denominator: group.settled },
        terminalLatencyNanoseconds: metrics(group.all), successfulLatencyNanoseconds: metrics(group.success) };
    }
    summaries[cohort] = { capacityRecorderVersion: 1, scope: 'CALLER_DECLARED_OBSERVATIONS_ONLY',
      clock: 'CALLER_SUPPLIED_MONOTONIC_NANOSECONDS', percentileMethod: 'NEAREST_RANK',
      recordingState: entered === 0 ? 'EMPTY' : 'COMPLETE', recordingIssue: null, stopReason: null, limits,
      refusedStarts: 0, pendingObservations: 0,
      observedSpanNanoseconds: meta.first === null ? null : String(meta.last - meta.first), phases,
      ledgerBalanceChecks: { samples: meta.balances, mismatches: 0,
        result: meta.balances === 0 ? 'NOT_RECORDED' : 'MATCHES_CALLER_DECLARED_EXPECTATIONS' },
      capacityQualification: 'NOT_ESTABLISHED', ledgerCorrectness: 'NOT_ESTABLISHED',
      authenticatedExecution: false, liveOrProduction: false, authority: 'NONE' };
  }
  for (const name of PHASES) {
    const lane = lanes[name], measured = cohorts.MEASUREMENT.phases[name];
    const rateStatus = measured.entered === 0 ? 'NO_MEASUREMENT_STARTS' : 'OBSERVED_WINDOW_RATIO_ONLY';
    phaseSummaries[name] = { enteredAcrossCohorts: lane.entered, peakInFlightAcrossCohorts: lane.peak,
      peakInFlightDuringMeasurement: lane.windowPeak, warmupInFlightAtStart: lane.warmupAtStart,
      warmupInFlightAtStop: lane.warmupAtStop, measurementInFlightAtStop: lane.measuredAtStop,
      warmupTerminalsDuringMeasurement: lane.warmupInside, measurementTerminalsDuringMeasurement: lane.measuredInside,
      warmupTerminalsAfterMeasurement: lane.warmupAfter, measurementTerminalsAfterMeasurement: lane.measuredAfter,
      successfulWindowCompletionRatio: rateStatus === 'NO_MEASUREMENT_STARTS' ? null : {
        numerator: String(BigInt(lane.measuredInside.succeeded) * 1000000000n), denominator: String(stop - start),
        unit: 'CALLER_OBSERVED_SUCCESSFUL_COMPLETIONS_PER_SECOND' }, rateStatus };
  }
  const expected = { capacityWindowRecorderVersion: 1, scope: 'CALLER_DECLARED_BOUNDARIES_NOT_BENCHMARK_EXECUTION',
    boundaryOrder: 'EXPLICIT_CALL_ORDER_ON_NONDECREASING_TIMESTAMPS', recordingState: observation === 0 ? 'EMPTY' : 'COMPLETE',
    recordingIssue: null, stopReason: null, limits, refusedStarts: 0, pendingObservations: 0,
    warmupNanoseconds: warmupStart === null ? null : String(start - warmupStart), measurementNanoseconds: String(stop - start),
    drainNanoseconds: String(ended - stop), runNanoseconds: String(ended - runStart), phases: phaseSummaries, cohorts: summaries,
    ledgerBalanceChecks: { samples: balanceChecks, mismatches: 0, stages, expectedBalances: 'CALLER_DECLARED_NOT_AUTHENTICATED' },
    capacityQualification: 'NOT_ESTABLISHED', sustainableThroughput: 'NOT_ESTABLISHED', nativeClockAuthenticated: false,
    physicalDrainQualified: false, liveOrProduction: false, authority: 'NONE' };
  match(c.recording, expected);
  return F({ parentTimingTraceDataVersion: 1, status: 'COMPLETE_MATCHING_DECLARED_PARENT_TRACE_DATA',
    eventsChecked: rows.length, observationsChecked: observation, measurementNanoseconds: String(stop - start),
    allPhaseSummariesRecomputed: true, rawIdentifiersIncluded: false, parentAndChildClocksSubtracted: false,
    postStopLedgerTraceQualified: false, nativeEventsAuthenticated: false, nativeResourcesQualified: false,
    sustainableCapacityQualified: false, authority: 'NONE' });
}

function metrics(values) {
  if (values.length === 0) return { samples: 0, min: null, p50: null, p95: null, p99: null, max: null };
  values.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const rank = percent => String(values[Math.floor((values.length * percent + 99) / 100) - 1]);
  return { samples: values.length, min: String(values[0]), p50: rank(50), p95: rank(95), p99: rank(99),
    max: String(values[values.length - 1]) };
}
function counters() { return { settled: 0, succeeded: 0, rejected: 0, unknown: 0 }; }
function add(c, outcome) { c.settled++; if (outcome === 'SUCCEEDED') c.succeeded++; else c.rejected++; }
function object(v) {
  if (v === null || typeof v !== 'object' || IS_PROXY(v) || (P(v) !== Object.prototype && P(v) !== null)
      || !Object.isFrozen(v)) fail();
}
function data(v, name) {
  object(v); const d = D(v, name);
  if (!d || !O(d, 'value') || !d.enumerable) fail();
  return d.value;
}
function exact(v, names) {
  object(v); if (K(v).length !== names.length) fail();
  const out = {};
  for (const name of names) out[name] = data(v, name);
  return out;
}
function dense(v, maximum) {
  if (v === null || typeof v !== 'object' || IS_PROXY(v) || P(v) !== Array.prototype || !Object.isFrozen(v)) fail();
  const n = D(v, 'length'); if (!n || !O(n, 'value')) fail(); integer(n.value, 1, maximum);
  if (K(v).length !== n.value + 1) fail();
  for (let i = 0; i < n.value; i++) {
    const d = D(v, String(i)); if (!d || !O(d, 'value') || !d.enumerable) fail();
  }
  return v;
}
function match(actual, expected) {
  if (expected === null || typeof expected !== 'object') {
    if (actual !== expected || typeof expected === 'number' && !Object.is(actual, expected)) fail();
    return;
  }
  const names = K(expected), values = exact(actual, names);
  for (const name of names) match(values[name], expected[name]);
}
function ns(v) {
  if (typeof v !== 'string' || !/^(0|[1-9][0-9]{0,38})$/.test(v)) fail();
  const n = BigInt(v); if (n > MAX_NS) fail(); return n;
}
function integer(v, low, high) {
  if (!Number.isSafeInteger(v) || Object.is(v, -0) || v < low || v > high) fail();
}
function fail() {
  const error = new TypeError('service_credit_capacity_parent_timing_trace_data_rejected');
  Object.defineProperty(error, 'stack', { value: 'TypeError: service_credit_capacity_parent_timing_trace_data_rejected' });
  throw F(error);
}
