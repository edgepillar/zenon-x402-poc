import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceCreditCapacityWindowedAsyncWorkloadOwnerCore as legacy,
  createServiceCreditCapacityWindowedAsyncWorkloadOwnerCoreWithPrivateTimingTrace as traced } from '../src/service-credit-capacity-windowed-async-workload-owner-core.js';
import { createServiceCreditCapacityWindowRecorder as recorder } from '../src/service-credit-capacity-window-recorder.js';
import { checkServiceCreditCapacityParentTimingTraceData as check } from '../src/service-credit-capacity-parent-timing-trace-data.js';

if (process.version !== 'v24.19.0' || process.env.X402_CAPACITY_PARENT_TRACE_DATA_SELECTION !== 'parent-recorder-trace-data-v1')
  throw new TypeError('CAPACITY_PARENT_TRACE_DATA_SELECTION_REQUIRED');
console.log('# parent-recorder-trace-selected-data ' + JSON.stringify({ Node: process.version,
  platform: process.platform, arch: process.arch, syntheticEventDataOnly: true, nativeEffects: false }));

const F = Object.freeze, empty = F({ availableUnits: 10n, heldUnits: 0n, consumedUnits: 0n });
const balances = F({ observed: empty, expected: empty });
function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); F(value); }
  return value;
}
const copy = value => JSON.parse(JSON.stringify(value));
const input = (trace, recording) => F({ trace, recording });
async function ticks(n = 100) { for (let i = 0; i < n; i++) await Promise.resolve(); }
function pending() {
  let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve };
}
function fixture(options = {}) {
  const host = { now: 0n, clocks: 0, calls: [], timers: [], owner: null };
  function operation(kind, index, command) {
    host.calls.push([kind, index, command.cohort, command.ordinal]);
    if (options.ledger !== false) { const tx = command.beginLedgerTransaction(); tx.finish('SUCCEEDED'); }
    return options.operation ? options.operation(kind, index, command, host) : Promise.resolve('SUCCEEDED');
  }
  const config = {
    plan: { warmupCallsPerLane: 1, measurementCallsPerLane: 2, setupBudgetMs: 50, measurementWindowMs: 20,
      drainGraceMs: 10, maxLedgerTransactionsPerOperation: 1, ...options.plan },
    recordingLimits: { maxSamplesPerPhase: 128, maxInFlightPerPhase: 4 },
    runtime: { monotonicNowNs: F(() => { host.clocks++; return ++host.now; }),
      schedule: F((callback, budget) => { const token = F({ n: host.timers.length });
        host.timers.push({ callback, budget, token, cancelled: false }); return token; }),
      cancel: F(token => { host.timers.find(t => t.token === token).cancelled = true; return undefined; }) },
    lanes: F(Array.from({ length: options.lanes ?? 2 }, (_, index) => F({
      fund: F(command => operation('FUNDING', index, command)), execute: F(command => operation('FUNDED_CALL', index, command)),
      checkBalances: F(() => Promise.resolve(balances)), openMeasurementWindow: F(() => Promise.resolve(undefined)),
      stopMeasurementWindow: F(() => Promise.resolve(undefined)), close: F(() => Promise.resolve(undefined)),
    }))),
  };
  host.owner = (options.legacy ? legacy : traced)(config);
  host.fire = budget => { const t = host.timers.find(t => t.budget === budget && !t.cancelled);
    assert.ok(t); t.cancelled = true; t.callback(); };
  return host;
}
async function finish(host) {
  const promise = host.owner.run(); await ticks(); assert.equal(host.owner.inspect().finalCached, true); return promise;
}

// Explicit declared event DATA over the genuine recorder; no native clock,
// process, SQL, request or alternate recorder implementation is installed.
function declared(actions, options = {}) {
  const limits = F({ maxSamplesPerPhase: 16, maxInFlightPerPhase: 4 }), actual = recorder(limits), handles = new Map(), events = [];
  let next = 0, cohort = null, result;
  for (const action of actions) {
    const [kind, at, detail, outcome] = action;
    let row;
    if (kind === 'START_WARMUP') { actual.startWarmup(at); cohort = 'WARMUP'; row = { kind }; }
    else if (kind === 'START_MEASUREMENT') { actual.startMeasurement(at); cohort = 'MEASUREMENT'; row = { kind }; }
    else if (kind === 'STOP_MEASUREMENT') { actual.stopMeasurement(at); row = { kind }; }
    else if (kind === 'BEGIN') { const id = ++next; handles.set(id, actual.begin(detail, at)); row = { kind, observation: id, phase: detail, cohort }; }
    else if (kind === 'FINISH') { handles.get(detail).finish(outcome ?? 'SUCCEEDED', at); row = { kind, observation: detail, outcome: outcome ?? 'SUCCEEDED' }; }
    else if (kind === 'BALANCE_CHECK') { const matches = actual.recordLedgerBalanceCheck(balances, at); row = { kind, matches }; }
    else { assert.equal(kind, 'FINALIZE'); result = actual.finalize(at); row = { kind }; }
    events.push(F({ sequence: events.length + 1, ...row, atNs: String(at) }));
  }
  return { recording: result, trace: F({ parentTimingTraceVersion: 1,
    scope: 'PRIVATE_PARENT_RECORDER_EVENTS_NOT_NATIVE_AUTHENTICATION', clockDomain: 'PARENT_MONOTONIC_RECORDER_EVENT_ORDER',
    limits, unknown: false, maximumEvents: 7 * limits.maxSamplesPerPhase + 4, events: F(events),
    rawIdentifiersIncluded: false, postStopLedgerTraceIncluded: false, nativeEventsAuthenticated: false,
    nativeResourcesQualified: false, sustainableCapacityQualified: false, authority: 'NONE', ...options }) };
}
const crossing = () => declared([
  ['START_WARMUP', 0n], ['BEGIN', 1n, 'FUNDING'], ['FINISH', 11n, 1], ['BALANCE_CHECK', 11n],
  ['BEGIN', 12n, 'FUNDED_CALL'], ['START_MEASUREMENT', 20n], ['BEGIN', 21n, 'FUNDED_CALL'],
  ['BEGIN', 22n, 'LEDGER_TRANSACTION'], ['FINISH', 25n, 2], ['FINISH', 28n, 4], ['FINISH', 31n, 3],
  ['BEGIN', 32n, 'FUNDED_CALL'], ['BALANCE_CHECK', 35n], ['STOP_MEASUREMENT', 40n],
  ['FINISH', 45n, 5], ['BALANCE_CHECK', 46n], ['FINALIZE', 50n],
]);

test('private trace selection is inert and legacy owner keeps its exact old surface', () => {
  const old = fixture({ legacy: true }), h = fixture();
  assert.deepEqual(Object.keys(old.owner), ['run', 'stop', 'inspect']);
  assert.deepEqual(Object.keys(h.owner), ['run', 'stop', 'inspect', 'captureTimingEvidence']);
  assert.equal(h.clocks, 0); assert.equal(h.calls.length, 0); assert.equal(h.timers.length, 0);
  assert.throws(() => h.owner.captureTimingEvidence()); assert.equal(h.owner.inspect().held, false);
});
test('actual traced core retains exact accepted events and independently matches every recorder field', async () => {
  const h = fixture(), result = await finish(h), trace = h.owner.captureTimingEvidence();
  const checked = check(input(trace, result.recording));
  assert.equal(result.outcome, 'OBSERVED_OWNERS_RETURNED'); assert.equal(checked.observationsChecked, 16);
  assert.equal(checked.allPhaseSummariesRecomputed, true); assert.equal(trace.events.length, 42);
  assert.ok(trace.events.length <= trace.maximumEvents); assert.equal(trace.unknown, false);
});
test('trace does not add clock reads host calls timers or change the legacy recording', async () => {
  const a = fixture({ legacy: true }), b = fixture();
  const first = await finish(a), second = await finish(b);
  assert.deepEqual(first, second); assert.deepEqual(a.calls, b.calls);
  assert.equal(a.clocks, b.clocks); assert.equal(a.timers.length, b.timers.length);
  check(input(b.owner.captureTimingEvidence(), second.recording));
});
test('actual single-lane funding call and explicit ledger latencies remain separate known values', async () => {
  const h = fixture({ lanes: 1 }), result = await finish(h);
  const phases = result.recording.cohorts.WARMUP.phases;
  assert.equal(phases.FUNDING.successfulLatencyNanoseconds.p50, '3');
  assert.equal(phases.FUNDED_CALL.successfulLatencyNanoseconds.p50, '3');
  assert.equal(phases.LEDGER_TRANSACTION.successfulLatencyNanoseconds.p50, '1');
  check(input(h.owner.captureTimingEvidence(), result.recording));
});
test('private capture is one frozen cached graph absent from the ordinary report', async () => {
  const h = fixture(), result = await finish(h), a = h.owner.captureTimingEvidence();
  assert.equal(a, h.owner.captureTimingEvidence()); assert.equal(Object.isFrozen(a.events), true);
  assert.ok(a.events.every(Object.isFrozen)); assert.throws(() => a.events.push({}));
  assert.equal(JSON.stringify(result).includes('parentTimingTraceVersion'), false);
  assert.throws(() => h.owner.captureTimingEvidence('extra')); assert.equal(a, h.owner.captureTimingEvidence());
});
test('source trace UNKNOWN is permanent and cannot be accepted as a successful matching run', async () => {
  const h = fixture({ operation: () => Promise.resolve('UNKNOWN') }), result = await finish(h), trace = h.owner.captureTimingEvidence();
  assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(trace.unknown, true);
  assert.throws(() => check(input(trace, result.recording)));
  h.owner.run(); h.owner.stop(); await ticks(); assert.equal(h.owner.captureTimingEvidence(), trace);
});
test('pending originals remain visible after drain expiry and late completion cannot rewrite the trace', async () => {
  const gate = pending(), h = fixture({ lanes: 1, ledger: false, plan: { warmupCallsPerLane: 0 },
    operation: kind => kind === 'FUNDING' ? Promise.resolve('SUCCEEDED') : gate.promise });
  const promise = h.owner.run(); await ticks(); h.fire(20); await ticks(); h.fire(10); await ticks();
  const result = await promise, trace = h.owner.captureTimingEvidence(), before = JSON.stringify(trace);
  assert.equal(result.pendingOperations, 1); assert.equal(trace.unknown, true);
  assert.throws(() => check(input(trace, result.recording)));
  gate.resolve('SUCCEEDED'); await ticks(); assert.equal(JSON.stringify(trace), before);
});
test('manual stop before run preserves EMPTY evidence rather than inventing a measurement window', async () => {
  const h = fixture(); const promise = h.owner.stop(); await ticks(); const result = await promise;
  assert.equal(result.recording.recordingState, 'EMPTY'); assert.equal(h.calls.length, 0);
  assert.throws(() => check(input(h.owner.captureTimingEvidence(), result.recording)));
});
test('independent DATA arithmetic keeps full carry-in spill-out percentiles and explicit rate denominator', () => {
  const c = crossing(), checked = check(F(c)), phase = c.recording.phases.FUNDED_CALL;
  assert.equal(checked.measurementNanoseconds, '20'); assert.equal(checked.observationsChecked, 5);
  assert.equal(phase.warmupInFlightAtStart, 1); assert.equal(phase.measurementInFlightAtStop, 1);
  assert.equal(phase.peakInFlightDuringMeasurement, 2);
  assert.equal(phase.successfulWindowCompletionRatio.numerator, '1000000000');
  assert.equal(phase.successfulWindowCompletionRatio.denominator, '20');
  assert.deepEqual({ ...c.recording.cohorts.MEASUREMENT.phases.FUNDED_CALL.successfulLatencyNanoseconds },
    { samples: 2, min: '10', p50: '10', p95: '13', p99: '13', max: '13' });
});
for (const after of [false, true]) test('equal-timestamp terminal ' + (after ? 'after' : 'before') + ' STOP keeps explicit event order', () => {
  const finishRow = ['FINISH', 10n, 1], stopRow = ['STOP_MEASUREMENT', 10n];
  const c = declared([['START_MEASUREMENT', 1n], ['BEGIN', 2n, 'FUNDED_CALL'],
    ...(after ? [stopRow, finishRow] : [finishRow, stopRow]), ['FINALIZE', 11n]]);
  check(F(c)); assert.equal(c.recording.phases.FUNDED_CALL.successfulWindowCompletionRatio.numerator,
    after ? '0' : '1000000000');
});
test('empty closed window is not fabricated as observed service throughput', () => {
  const c = declared([['START_MEASUREMENT', 1n], ['STOP_MEASUREMENT', 2n], ['FINALIZE', 3n]]);
  const checked = check(F(c)); assert.equal(checked.observationsChecked, 0);
  assert.equal(c.recording.phases.FUNDED_CALL.successfulWindowCompletionRatio, null);
});
test('rejected calls remain in complete latency samples and the non-success fraction', () => {
  const c = declared([['START_MEASUREMENT', 1n], ['BEGIN', 2n, 'FUNDED_CALL'], ['FINISH', 7n, 1, 'REJECTED'],
    ['STOP_MEASUREMENT', 8n], ['FINALIZE', 9n]]);
  check(F(c)); assert.equal(c.recording.cohorts.MEASUREMENT.phases.FUNDED_CALL.nonSuccessFraction.numerator, 1);
});
test('exact 128-bit-boundary timestamps are not converted through floating point', () => {
  const n = (1n << 128n) - 5n, c = declared([['START_MEASUREMENT', n], ['BEGIN', n + 1n, 'FUNDING'],
    ['FINISH', n + 2n, 1], ['STOP_MEASUREMENT', n + 3n], ['FINALIZE', n + 4n]]);
  assert.equal(check(F(c)).measurementNanoseconds, '3');
});

const reportMutations = {
  funding_latency: c => { c.recording.cohorts.WARMUP.phases.FUNDING.successfulLatencyNanoseconds.p50 = '9'; },
  call_p99: c => { c.recording.cohorts.MEASUREMENT.phases.FUNDED_CALL.successfulLatencyNanoseconds.p99 = '12'; },
  ledger_latency: c => { c.recording.cohorts.MEASUREMENT.phases.LEDGER_TRANSACTION.terminalLatencyNanoseconds.max = '5'; },
  window_denominator: c => { c.recording.phases.FUNDED_CALL.successfulWindowCompletionRatio.denominator = '19'; },
  spill_in_numerator: c => { c.recording.phases.FUNDED_CALL.successfulWindowCompletionRatio.numerator = '2000000000'; },
  carry_in_count: c => { c.recording.phases.FUNDED_CALL.warmupInFlightAtStart = 0; },
  measured_pending_at_stop: c => { c.recording.phases.FUNDED_CALL.measurementInFlightAtStop = 0; },
  peak: c => { c.recording.phases.FUNDED_CALL.peakInFlightDuringMeasurement = 1; },
  balance_stage: c => { c.recording.ledgerBalanceChecks.stages.DRAINING.samples = 0; },
  total_balance_checks: c => { c.recording.ledgerBalanceChecks.samples = 2; },
  duration: c => { c.recording.measurementNanoseconds = '19'; },
  drain: c => { c.recording.drainNanoseconds = '9'; },
  warmup: c => { c.recording.warmupNanoseconds = '19'; },
  run: c => { c.recording.runNanoseconds = '49'; },
  extra: c => { c.recording.productionQualified = true; },
  authority: c => { c.recording.authority = 'AUTHORIZED'; },
};
for (const [name, mutate] of Object.entries(reportMutations)) test('report mismatch refuses ' + name, () => {
  const c = copy(crossing()); mutate(c); assert.throws(() => check(freeze(c)));
});
const traceMutations = {
  missing_finish: c => { c.trace.events.splice(10, 1); },
  ordinal: c => { c.trace.events[2].observation = 9; },
  sequence: c => { c.trace.events[2].sequence = 99; },
  cohort: c => { c.trace.events[6].cohort = 'WARMUP'; },
  unknown: c => { c.trace.unknown = true; },
  unknown_outcome: c => { c.trace.events[2].outcome = 'UNKNOWN'; },
  changed_clock: c => { c.trace.events[2].atNs = '10'; },
  backwards_clock: c => { c.trace.events[2].atNs = '0'; },
  expanded_limit: c => { c.trace.maximumEvents++; },
  unsafe_timestamp: c => { c.trace.events[0].atNs = String(1n << 128n); },
  noncanonical_timestamp: c => { c.trace.events[0].atNs = '00'; },
  missing_stop: c => { c.trace.events[13].kind = 'FINALIZE'; },
  failed_balance: c => { c.trace.events[3].matches = false; },
  repeated_start: c => { c.trace.events[5].kind = 'START_WARMUP'; },
  false_native_claim: c => { c.trace.nativeEventsAuthenticated = true; },
  extra_row_data: c => { c.trace.events[2].payment = 'not-allowed'; },
};
for (const [name, mutate] of Object.entries(traceMutations)) test('trace mismatch refuses ' + name, () => {
  const c = copy(crossing()); mutate(c); assert.throws(() => check(freeze(c)));
});
test('descriptor-backed report getters and trace Proxies are refused without invoking their hooks', () => {
  let hooks = 0; const c = crossing(), bad = copy(c.recording);
  Object.defineProperty(bad, 'measurementNanoseconds', { enumerable: true, get() { hooks++; return '20'; } }); F(bad);
  assert.throws(() => check(input(c.trace, bad)));
  const proxy = new Proxy(c.trace, { get() { hooks++; throw Error(); }, ownKeys() { hooks++; throw Error(); } });
  assert.throws(() => check(input(proxy, c.recording))); assert.equal(hooks, 0);
});
test('sparse arrays mutable data wrong arity and negative-zero counters are rejected', () => {
  const c = crossing(); assert.throws(() => check(c)); // Selection itself must be frozen.
  assert.throws(() => check(F(c), 'extra'));
  const sparse = copy(c); delete sparse.trace.events[2]; assert.throws(() => check(freeze(sparse)));
  const zero = copy(c); zero.recording.refusedStarts = -0; assert.throws(() => check(freeze(zero)));
});
test('a complete matching declaration never authenticates native time or grants operational authority', () => {
  const c = crossing(), result = check(F(c));
  assert.equal(result.nativeEventsAuthenticated, false); assert.equal(result.nativeResourcesQualified, false);
  assert.equal(result.sustainableCapacityQualified, false); assert.equal(result.postStopLedgerTraceQualified, false);
  assert.equal(result.parentAndChildClocksSubtracted, false); assert.equal(result.authority, 'NONE');
});
