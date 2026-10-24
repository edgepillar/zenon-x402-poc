import { types as utilTypes } from 'node:util';
import { createServiceCreditCapacityRecorder } from './service-credit-capacity-recorder.js';

const F = Object.freeze, P = Object.getPrototypeOf, D = Object.getOwnPropertyDescriptor;
const K = Reflect.ownKeys, O = Object.hasOwn, DEFINE = Object.defineProperty, CREATE = Object.create;
const IS_PROXY = utilTypes.isProxy, BASE = createServiceCreditCapacityRecorder;
const PHASES = F(['FUNDING', 'FUNDED_CALL', 'LEDGER_TRANSACTION']);
const MAX_NS = (1n << 128n) - 1n;
const OUTCOMES = F(['SUCCEEDED', 'REJECTED', 'UNKNOWN']);

/**
 * Bounded P4 measurement-window accounting over the genuine capacity recorder.
 * This component starts no workload, reads no clock and owns no resource.
 * Explicit caller event order disambiguates equal monotonic timestamps.
 *
 * Warmup handles may cross into measurement; measurement handles may finish
 * during drain. Their full latencies remain in their START cohort. Only
 * measurement-cohort successes observed BEFORE stopMeasurement contribute to
 * the window ratio. Carry-in, spill-out, errors and pending work stay visible.
 * Never infer throughput from a sum/mean of overlapping request durations.
 *
 * Limits cover BOTH cohorts together. Refusal never evicts an observation.
 * An input issue is sticky. UNKNOWN/balance mismatch stops new observations,
 * not actual operations. Finish/drain existing handles without retry/re-sign
 * authority. Incomplete/stopped/undrained recording withholds window ratios.
 *
 * Exact rational strings are caller-observed arithmetic, not authenticated
 * native time, a sustainable TPS benchmark, ledger correctness or delivery.
 * No SDK, SQLite, socket, key, signature, timer, CLI or default runtime wiring.
 */
export function createServiceCreditCapacityWindowRecorder(options) {
  if (arguments.length !== 1) fail('configuration_rejected');
  let limits;
  try {
    const c = exact(options, ['maxSamplesPerPhase', 'maxInFlightPerPhase']);
    if (!integer(c.maxSamplesPerPhase, 1, 4096) || !integer(c.maxInFlightPerPhase, 1, 64)
        || c.maxInFlightPerPhase > c.maxSamplesPerPhase) fail('configuration_rejected');
    limits = scalar(c);
  } catch { fail('configuration_rejected'); }
  const cohorts = F({
    WARMUP: BASE({ maxSamplesPerPhase: limits.maxSamplesPerPhase, maxInFlightPerPhase: limits.maxInFlightPerPhase }),
    MEASUREMENT: BASE({ maxSamplesPerPhase: limits.maxSamplesPerPhase, maxInFlightPerPhase: limits.maxInFlightPerPhase }),
  });
  const lanes = CREATE(null), activeEntries = new Set();
  for (const name of PHASES) lanes[name] = {
    entered: 0, active: 0, peak: 0, windowPeak: 0,
    cohortActive: { WARMUP: 0, MEASUREMENT: 0 },
    warmupInFlightAtStart: 0, warmupInFlightAtStop: 0, measurementInFlightAtStop: 0,
    warmupInside: counters(), measuredInside: counters(), warmupAfter: counters(), measuredAfter: counters(),
  };
  const balances = { WARMUP: { samples: 0, mismatches: 0 }, MEASURING: { samples: 0, mismatches: 0 },
    DRAINING: { samples: 0, mismatches: 0 } };
  let phase = 'CREATED', issue = null, stopped = null, lastTime = null, runStart = null;
  let warmupStart = null, measurementStart = null, measurementEnd = null, finalizedAt = null, final = null;
  let refusedStarts = 0, balanceChecks = 0, balanceMismatches = 0;
  function taint(kind) {
    if (issue === null) issue = kind;
    if (stopped === null) stopped = kind;
    fail(kind);
  }
  function open() { if (final !== null) fail('finalized'); }
  function clock(at) {
    if (typeof at !== 'bigint' || at < 0n || at > MAX_NS || (lastTime !== null && at < lastTime))
      taint('clock_rejected');
    return at;
  }
  function tick(at) { if (runStart === null) runStart = at; lastTime = at; }
  function allowedStart() { if (stopped !== null) taint('recording_stopped'); }
  const startWarmup = F(function startWarmup(at) {
    open();
    if (arguments.length !== 1 || phase !== 'CREATED') taint('warmup_boundary_rejected');
    allowedStart(); at = clock(at); tick(at); warmupStart = at; phase = 'WARMUP';
  });
  const startMeasurement = F(function startMeasurement(at) {
    open();
    if (arguments.length !== 1 || (phase !== 'CREATED' && phase !== 'WARMUP'))
      taint('measurement_boundary_rejected');
    allowedStart(); at = clock(at); tick(at); measurementStart = at; phase = 'MEASURING';
    for (const name of PHASES) {
      lanes[name].warmupInFlightAtStart = lanes[name].cohortActive.WARMUP;
      lanes[name].windowPeak = lanes[name].active;
    }
  });
  const stopMeasurement = F(function stopMeasurement(at) {
    open();
    if (arguments.length !== 1 || phase !== 'MEASURING') taint('measurement_boundary_rejected');
    at = clock(at);
    if (at <= measurementStart) taint('empty_measurement_window');
    tick(at); measurementEnd = at; phase = 'DRAINING';
    for (const name of PHASES) {
      lanes[name].warmupInFlightAtStop = lanes[name].cohortActive.WARMUP;
      lanes[name].measurementInFlightAtStop = lanes[name].cohortActive.MEASUREMENT;
    }
  });
  const begin = F(function begin(name, at) {
    open();
    const refuse = kind => { refusedStarts++; taint(kind); };
    if (stopped !== null) refuse('recording_stopped');
    if (arguments.length !== 2 || !PHASES.includes(name)
        || (phase !== 'WARMUP' && phase !== 'MEASURING')) refuse('begin_rejected');
    try { at = clock(at); } catch (error) { refusedStarts++; throw error; }
    const lane = lanes[name], cohort = phase === 'WARMUP' ? 'WARMUP' : 'MEASUREMENT';
    if (lane.entered >= limits.maxSamplesPerPhase) refuse('sample_limit');
    if (lane.active >= limits.maxInFlightPerPhase) refuse('in_flight_limit');
    const base = cohorts[cohort].begin(name, at);
    const entry = { finished: false };
    lane.entered++; lane.active++; lane.cohortActive[cohort]++; activeEntries.add(entry);
    lane.peak = Math.max(lane.peak, lane.active);
    if (phase === 'MEASURING') lane.windowPeak = Math.max(lane.windowPeak, lane.active);
    tick(at);
    const finish = F(function finish(outcome, ended) {
      open();
      if (entry.finished) taint('duplicate_finish');
      if (arguments.length !== 2 || !OUTCOMES.includes(outcome)) taint('finish_rejected');
      ended = clock(ended);
      base.finish(outcome, ended);
      entry.finished = true; activeEntries.delete(entry);
      lane.active--; lane.cohortActive[cohort]--; tick(ended);
      if (phase === 'MEASURING') add(cohort === 'WARMUP' ? lane.warmupInside : lane.measuredInside, outcome);
      else if (phase === 'DRAINING') add(cohort === 'WARMUP' ? lane.warmupAfter : lane.measuredAfter, outcome);
      if (outcome === 'UNKNOWN' && stopped === null) stopped = 'outcome_unknown';
    });
    return scalar({ finish });
  });
  const recordLedgerBalanceCheck = F(function recordLedgerBalanceCheck(input, at) {
    open();
    if (arguments.length !== 2 || (phase !== 'WARMUP' && phase !== 'MEASURING' && phase !== 'DRAINING'))
      taint('balance_boundary_rejected');
    at = clock(at);
    if (balanceChecks >= limits.maxSamplesPerPhase) taint('balance_sample_limit');
    let matches;
    try { matches = cohorts[phase === 'WARMUP' ? 'WARMUP' : 'MEASUREMENT'].recordLedgerBalanceCheck(input); }
    catch { taint('balance_input_rejected'); }
    balanceChecks++; balances[phase].samples++; tick(at);
    if (!matches) {
      balanceMismatches++; balances[phase].mismatches++;
      if (stopped === null) stopped = 'balance_mismatch';
    }
    return matches;
  });
  const inspect = F(function inspect() {
    if (arguments.length !== 0) { if (final !== null) fail('input_rejected'); taint('input_rejected'); }
    return scalar({ phase, recordingIssue: issue, stopReason: stopped, refusedStarts,
      pendingObservations: final === null ? activeEntries.size : final.pendingObservations,
      retainedHandleReferences: activeEntries.size,
      retainedDurationReferences: cohorts.WARMUP.inspect().retainedDurationReferences
        + cohorts.MEASUREMENT.inspect().retainedDurationReferences,
      capacityQualification: 'NOT_ESTABLISHED', authority: 'NONE' });
  });
  const finalize = F(function finalize(at) {
    if (final !== null) {
      if (arguments.length !== 1 || at !== finalizedAt) fail('finalized_boundary_changed');
      return final;
    }
    if (arguments.length !== 1) taint('finalization_boundary_rejected');
    at = clock(at);
    const pending = activeEntries.size, entered = PHASES.reduce((n, name) => n + lanes[name].entered, 0);
    if (issue === null && measurementStart === null && phase !== 'CREATED') issue = 'measurement_not_started';
    if (issue === null && measurementStart !== null && measurementEnd === null) issue = 'measurement_not_stopped';
    if (issue === null && pending !== 0) issue = 'in_flight_at_finalize';
    const warmup = cohorts.WARMUP.finalize(), measurement = cohorts.MEASUREMENT.finalize();
    if (issue === null) issue = warmup.recordingIssue || measurement.recordingIssue;
    const duration = measurementEnd === null ? null : measurementEnd - measurementStart;
    const phases = CREATE(null);
    for (const name of PHASES) {
      const lane = lanes[name];
      const rateStatus = issue !== null ? 'WITHHELD_INCOMPLETE_INPUT'
        : stopped !== null ? 'WITHHELD_STOPPED_RECORDING'
          : duration === null ? 'WITHHELD_NO_CLOSED_WINDOW'
            : measurement.phases[name].entered === 0 ? 'NO_MEASUREMENT_STARTS' : 'OBSERVED_WINDOW_RATIO_ONLY';
      const ratio = rateStatus === 'OBSERVED_WINDOW_RATIO_ONLY'
        ? scalar({ numerator: String(BigInt(lane.measuredInside.succeeded) * 1000000000n),
          denominator: String(duration), unit: 'CALLER_OBSERVED_SUCCESSFUL_COMPLETIONS_PER_SECOND' }) : null;
      put(phases, name, scalar({
        enteredAcrossCohorts: lane.entered, peakInFlightAcrossCohorts: lane.peak,
        peakInFlightDuringMeasurement: lane.windowPeak, warmupInFlightAtStart: lane.warmupInFlightAtStart,
        warmupInFlightAtStop: lane.warmupInFlightAtStop, measurementInFlightAtStop: lane.measurementInFlightAtStop,
        warmupTerminalsDuringMeasurement: scalar(lane.warmupInside),
        measurementTerminalsDuringMeasurement: scalar(lane.measuredInside),
        warmupTerminalsAfterMeasurement: scalar(lane.warmupAfter),
        measurementTerminalsAfterMeasurement: scalar(lane.measuredAfter),
        successfulWindowCompletionRatio: ratio, rateStatus,
      }));
    }
    const stageBalances = CREATE(null);
    for (const stage of ['WARMUP', 'MEASURING', 'DRAINING']) put(stageBalances, stage, scalar(balances[stage]));
    finalizedAt = at;
    final = scalar({
      capacityWindowRecorderVersion: 1, scope: 'CALLER_DECLARED_BOUNDARIES_NOT_BENCHMARK_EXECUTION',
      boundaryOrder: 'EXPLICIT_CALL_ORDER_ON_NONDECREASING_TIMESTAMPS',
      recordingState: issue !== null ? 'INCOMPLETE' : entered === 0 ? 'EMPTY' : 'COMPLETE',
      recordingIssue: issue, stopReason: stopped, limits, refusedStarts, pendingObservations: pending,
      warmupNanoseconds: warmupStart === null || measurementStart === null ? null : String(measurementStart - warmupStart),
      measurementNanoseconds: duration === null ? null : String(duration),
      drainNanoseconds: measurementEnd === null ? null : String(at - measurementEnd),
      runNanoseconds: runStart === null ? null : String(at - runStart),
      phases: F(phases), cohorts: scalar({ WARMUP: warmup, MEASUREMENT: measurement }),
      ledgerBalanceChecks: scalar({ samples: balanceChecks, mismatches: balanceMismatches, stages: F(stageBalances),
        expectedBalances: 'CALLER_DECLARED_NOT_AUTHENTICATED' }),
      capacityQualification: 'NOT_ESTABLISHED', sustainableThroughput: 'NOT_ESTABLISHED',
      nativeClockAuthenticated: false, physicalDrainQualified: false, liveOrProduction: false, authority: 'NONE',
    });
    phase = 'FINALIZED'; activeEntries.clear();
    return final;
  });
  return scalar({ startWarmup, startMeasurement, stopMeasurement, begin, recordLedgerBalanceCheck, inspect, finalize });
}
function counters() { return { settled: 0, succeeded: 0, rejected: 0, unknown: 0 }; }
function add(value, outcome) {
  value.settled++;
  if (outcome === 'SUCCEEDED') value.succeeded++;
  else if (outcome === 'REJECTED') value.rejected++;
  else value.unknown++;
}
function integer(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max && !Object.is(value, -0);
}
function exact(input, names) {
  if (input === null || typeof input !== 'object' || IS_PROXY(input) || P(input) !== Object.prototype
      || K(input).length !== names.length) fail('input_rejected');
  const out = CREATE(null);
  for (const name of names) {
    const d = D(input, name);
    if (!d || !O(d, 'value') || !d.enumerable) fail('input_rejected');
    put(out, name, d.value);
  }
  return out;
}
function scalar(fields) {
  const out = CREATE(null);
  for (const name of K(fields)) put(out, name, fields[name]);
  return F(out);
}
function put(object, name, value) {
  const d = CREATE(null); d.value = value; d.enumerable = true; DEFINE(object, name, d);
}
function fail(kind) {
  const code = 'service_credit_capacity_window_' + kind, error = new TypeError(code);
  put(error, 'code', code);
  const d = CREATE(null); d.value = 'TypeError: ' + code; DEFINE(error, 'stack', d);
  throw F(error);
}
