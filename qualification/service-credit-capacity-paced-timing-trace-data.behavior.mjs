import test from 'node:test';
import assert from 'node:assert/strict';
import './service-credit-capacity-paced-private-timing.behavior.mjs';
import { fixture, complete, ticks, deferred } from './service-credit-capacity-paced-workload-owner-core.behavior.mjs';
import { createServiceCreditCapacityPacedWorkloadOwnerCoreWithPrivateTimingTrace as create } from '../src/service-credit-capacity-paced-workload-owner-core.js';
import { checkServiceCreditCapacityPacedTimingTraceData as check } from '../src/service-credit-capacity-paced-timing-trace-data.js';

if (process.env.X402_CAPACITY_PACED_CHECK_DATA_SELECTION !== 'paced-source-independent-check-data-v1')
  throw new TypeError('PACED_INDEPENDENT_CHECK_DATA_SELECTION_REQUIRED');

const F = Object.freeze;
function freeze(value) {
  if (value && typeof value === 'object') { for (const v of Object.values(value)) freeze(v); F(value); }
  return value;
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function expected(h) {
  // Owned input configuration is independent of the returned capture/report.
  return freeze({ plan: { ...h.config.plan }, recordingLimits: { ...h.config.recordingLimits },
    laneCount: h.config.lanes.length, minimumStartGapMs: h.config.pacing.minimumStartGapMs });
}
async function observation(options = {}) {
  const h = fixture({ ...options, factory: create }), exp = expected(h), result = await complete(h, 4100);
  assert.equal(result.outcome, 'OBSERVED_OWNERS_RETURNED');
  return { h, data: F({ trace: h.owner.captureTimingEvidence(), report: result, expected: exp }) };
}
let baseline;
function full() { return baseline ??= observation(); }
function reject(name, edit) {
  test('independent checker rejects ' + name, async () => {
    const { data } = await full(), changed = clone(data); edit(changed);
    assert.throws(() => check(freeze(changed)), TypeError);
  });
}

test('runtime checker matches genuine private producer and does not read host clock or mutate DATA', async () => {
  const { h, data } = await full(), before = JSON.stringify(data), clocks = h.clockCalls, calls = h.calls;
  const value = check(data);
  assert.equal(value.status, 'COMPLETE_MATCHING_DECLARED_PACED_TIMING_DATA');
  assert.equal(value.requestsChecked, 4); assert.equal(value.sourceEntriesChecked, 4);
  assert.equal(value.preEntryWithdrawalsChecked, 0); assert.equal(value.coreLogicalFundedCallsCrossBound, true);
  assert.equal(value.queueAndSourceRecordersRecomputed, true); assert.ok(Object.isFrozen(value));
  for (const key of ['timerEventsIndependentlyRecomputed', 'postStopLedgerDurationSeriesRecomputed',
    'callerExpectationsAuthenticated', 'runOrNativeSourceContextAuthenticated', 'nativeEventsAuthenticated',
    'nativeResourcesQualified', 'sustainableCapacityQualified']) assert.equal(value[key], false);
  assert.equal(JSON.stringify(data), before); assert.equal(h.clockCalls, clocks); assert.equal(h.calls, calls);
  assert.equal(value.authority, 'NONE');
});
test('runtime checker accepts genuine mixed outcomes with independently expected plan', async () => {
  const { data } = await observation({ execute(lane, command) {
    return Promise.resolve(command.cohort === 'MEASUREMENT' && lane === 0 ? 'REJECTED' : 'SUCCEEDED');
  } });
  assert.equal(check(data).sourceEntriesChecked, 4);
  assert.equal(data.report.dispatchedCallRecording.phases.FUNDED_CALL.rejected, 2);
});
test('runtime checker accepts clean pre-entry withdrawal without calling it a source entry', async () => {
  const h = fixture({ factory: create, plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 1 } }), exp = expected(h);
  const p = h.owner.run(); await ticks(); h.owner.stop(); await ticks(); const result = await p;
  const value = check(F({ trace: h.owner.captureTimingEvidence(), report: result, expected: exp }));
  assert.equal(value.requestsChecked, 2); assert.equal(value.sourceEntriesChecked, 1); assert.equal(value.preEntryWithdrawalsChecked, 1);
});
test('runtime checker accepts clock-reentrant withdrawal before queue measurement begins', async () => {
  const h = fixture({ factory: create, now(host) {
    if (host.owner && !host.clockStopped && host.owner.inspect().pendingQueuedCalls) {
      host.clockStopped = true; host.owner.stop();
    }
    return ++host.time;
  } }), exp = expected(h), p = h.owner.run(); await ticks(); const result = await p;
  const value = check(F({ trace: h.owner.captureTimingEvidence(), report: result, expected: exp }));
  assert.equal(value.requestsChecked, 1); assert.equal(value.sourceEntriesChecked, 0);
  assert.equal(result.queueWaitRecording.recordingState, 'EMPTY');
});
test('post-stop declared ledger remains bounded but is not falsely called independently timed evidence', async () => {
  let command; const cap = deferred();
  const h = fixture({ factory: create, lanes: 1, plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 1 },
    execute(lane, value) { command = value; return cap.promise; } }), exp = expected(h);
  const p = h.owner.run(); await ticks(); h.owner.stop(); await ticks();
  const ledger = command.beginLedgerTransaction(); h.time += 10n; ledger.finish('SUCCEEDED');
  cap.resolve('SUCCEEDED'); await ticks(); const result = await p;
  assert.equal(result.outcome, 'OBSERVED_OWNERS_RETURNED');
  const value = check(F({ trace: h.owner.captureTimingEvidence(), report: result, expected: exp }));
  assert.equal(value.postStopLedgerDurationSeriesRecomputed, false);
  assert.equal(result.core.postStopLedgerRecording.phases.LEDGER_TRANSACTION.entered, 1);
});
test('checker refuses held late-completion evidence, even after live source counters drain', async () => {
  const cap = deferred(), h = fixture({ factory: create,
    plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 1 }, execute() { return cap.promise; } }), exp = expected(h);
  const p = h.owner.run(); await ticks(); h.owner.stop(); await ticks(); h.fireDrain(); await ticks();
  const result = await p, trace = h.owner.captureTimingEvidence();
  assert.throws(() => check(F({ trace, report: result, expected: exp })), TypeError);
  cap.resolve('SUCCEEDED'); await ticks();
  assert.equal(h.owner.inspect().pendingSourceObservations, 0);
  assert.throws(() => check(F({ trace, report: result, expected: exp })), TypeError);
});
test('self-consistent paced clock shift cannot detach new series from genuine core intervals', async () => {
  const { data } = await full(), changed = clone(data);
  for (const row of changed.trace.events) if ('atNs' in row) row.atNs = String(BigInt(row.atNs) + 100000000000000000000n);
  assert.throws(() => check(freeze(changed)), TypeError);
});
test('internally matching rejected source metrics cannot replace genuine successful core outcomes', async () => {
  const a = await full(), b = await observation({ execute(lane, command) {
    return Promise.resolve(command.cohort === 'MEASUREMENT' ? 'REJECTED' : 'SUCCEEDED');
  } }), changed = clone(a.data);
  changed.trace.events = clone(b.data.trace.events);
  changed.report.dispatchedCallRecording = clone(b.data.report.dispatchedCallRecording);
  assert.throws(() => check(freeze(changed)), TypeError);
});

reject('missing independent expectation', v => { delete v.expected; });
reject('unrelated top-level field', v => { v.approved = true; });
reject('different expected lane count', v => { v.expected.laneCount = 1; });
reject('different expected gap', v => { v.expected.minimumStartGapMs = 4; });
reject('different expected sample limit', v => { v.expected.recordingLimits.maxSamplesPerPhase = 127; });
reject('different expected core plan', v => { v.expected.plan.measurementCallsPerLane = 3; });
reject('boolean plan count', v => { v.expected.plan.measurementCallsPerLane = true; });
reject('fractional expected gap', v => { v.expected.minimumStartGapMs = 1.5; });
reject('negative-zero expected gap', v => { v.expected.minimumStartGapMs = -0; });
reject('unknown trace', v => { v.trace.unknown = true; });
reject('boolean trace version', v => { v.trace.pacedTimingTraceVersion = true; });
reject('forged trace limits', v => { v.trace.limits.maxSamplesPerPhase = 129; });
reject('forged maximum event count', v => { v.trace.maximumEvents = 999; });
reject('foreign clock domain', v => { v.trace.clockDomain = 'SERVICE_CHILD_LOCAL'; });
reject('raw private identifier field', v => { v.trace.transaction = 'PRIVATE_SENTINEL_DO_NOT_ECHO'; });
reject('claimed trace authority', v => { v.trace.authority = 'PRODUCTION'; });
reject('claimed event authentication', v => { v.trace.nativeEventsAuthenticated = true; });
reject('extra event clock read claim', v => { v.trace.additionalClockReads = 1; });
reject('empty event sequence', v => { v.trace.events = []; });
reject('missing final event', v => { v.trace.events.pop(); });
reject('event after finalize', v => { v.trace.events.push({ sequence: v.trace.events.length + 1, kind: 'FINALIZE' }); });
reject('wrong sequence', v => { v.trace.events[0].sequence = 2; });
reject('boolean sequence', v => { v.trace.events[0].sequence = true; });
reject('duplicate request ordinal', v => { v.trace.events.find(e => e.kind === 'REQUEST' && e.request === 2).request = 1; });
reject('out-of-range lane', v => { v.trace.events[0].lane = 2; });
reject('per-lane ordinal reset', v => { v.trace.events.find(e => e.kind === 'REQUEST' && e.ordinal === 1).ordinal = 0; });
reject('overlapping same lane declaration', v => { v.trace.events.find(e => e.kind === 'REQUEST' && e.request === 2).lane = 0; });
reject('wrong FIFO dispatch request', v => { v.trace.events.find(e => e.kind === 'DISPATCH' && e.request === 2).request = 3; });
reject('insufficient real start gap', v => {
  const rows = v.trace.events.filter(e => e.kind === 'DISPATCH'); rows[1].atNs = String(BigInt(rows[0].atNs) + 1000n);
});
reject('noncanonical nanosecond string', v => { v.trace.events.find(e => e.kind === 'WAIT_BEGIN').atNs = '001'; });
reject('numeric nanosecond value', v => { v.trace.events.find(e => e.kind === 'WAIT_BEGIN').atNs = 1; });
reject('overflowed nanosecond range', v => { v.trace.events.find(e => e.kind === 'WAIT_BEGIN').atNs = String(1n << 128n); });
reject('backward event time', v => { v.trace.events.find(e => e.kind === 'SOURCE_TERMINAL').atNs = '0'; });
reject('duplicate source completion', v => {
  const row = v.trace.events.find(e => e.kind === 'SOURCE_TERMINAL');
  v.trace.events.find(e => e.kind === 'DISPATCH' && e.request === 2).request = row.request;
});
reject('unknown source outcome', v => { v.trace.events.find(e => e.kind === 'SOURCE_TERMINAL').outcome = 'UNKNOWN'; });
reject('mismatched core outcome', v => { v.trace.events.find(e => e.kind === 'SOURCE_TERMINAL').outcome = 'REJECTED'; });
reject('unobservable event in complete data', v => {
  const row = v.trace.events.find(e => e.kind === 'SOURCE_TERMINAL'); row.kind = 'UNOBSERVABLE';
});
reject('false recorder p95', v => { v.report.dispatchedCallRecording.phases.FUNDED_CALL.terminalLatencyNanoseconds.p95 = '999'; });
reject('false recorder denominator', v => { v.report.dispatchedCallRecording.phases.FUNDED_CALL.nonSuccessFraction.denominator = 3; });
reject('false queue peak', v => { v.report.queueWaitRecording.phases.FUNDED_CALL.peakInFlight = 99; });
reject('false queue span', v => { v.report.queueWaitRecording.observedSpanNanoseconds = '0'; });
reject('nonempty funding in source recorder', v => { v.report.dispatchedCallRecording.phases.FUNDING.entered = 1; });
reject('recording uncertainty', v => { v.report.queueWaitRecording.recordingState = 'INCOMPLETE'; });
reject('extra recorder field', v => { v.report.queueWaitRecording.retryAllowed = true; });
reject('false source entry count', v => { v.report.sourceExecuteEntries = 3; });
reject('false request count', v => { v.report.requestedMeasuredCalls = 3; });
reject('false withdrawal count', v => { v.report.preEntryWithheld = 1; });
reject('false queued peak', v => { v.report.peakQueuedCalls = 0; });
reject('unbounded declared timer count', v => { v.report.pacingTimersStarted = 999; });
reject('claimed fixed offered rate', v => { v.report.fixedOfferedRateQualified = true; });
reject('pending source counter', v => { v.report.pendingSourceObservations = 1; });
reject('claimed report success with issue', v => { v.report.issue = 'UNKNOWN'; });
reject('extra report field', v => { v.report.restartAllowed = true; });
reject('different returned core plan', v => { v.report.core.plan.measurementCallsPerLane = 3; });
reject('changed core parent event clock', v => { v.trace.coreParentTimingTrace.events[1].atNs = '0'; });
reject('false core recorder value', v => { v.report.core.recording.pendingObservations = 1; });
reject('false core balance counter', v => { v.report.core.balanceBarriersObserved = 0; });
reject('false core close count', v => { v.report.core.returnedCloses = 1; });
reject('unknown core close', v => { v.report.core.unknownCloses = 1; });
reject('pending core operation', v => { v.report.core.pendingOperations = 1; });
reject('false core planned completion', v => { v.report.core.plannedCallsCompleted = false; });
reject('false core ledger count', v => { v.report.core.ledgerBoundariesStarted = 1; });
reject('declared post-stop authority', v => { v.report.core.postStopLedgerRecording.authority = 'PAYMENT'; });
reject('invented post-stop funding phase', v => { v.report.core.postStopLedgerRecording.phases.FUNDING.entered = 1; });
reject('claimed production', v => { v.report.productionQualified = true; });
reject('UTF8 input instead of exact ASCII data', v => { v.expected.extra = '\u00e7'; });

test('all declared timer counts inside the bound remain only declarations, not independent timer proof', async () => {
  const { data } = await full(), changed = clone(data); changed.report.pacingTimersStarted = 0;
  const value = check(freeze(changed)); assert.equal(value.timerEventsIndependentlyRecomputed, false);
});
test('frozen input getters and proxies are rejected without hooks or source execution', async () => {
  const { data } = await full(); let calls = 0;
  const accessor = { ...data };
  Object.defineProperty(accessor, 'trace', { get() { calls++; throw new Error('MUST_NOT_RUN'); }, enumerable: true });
  assert.throws(() => check(F(accessor)), TypeError);
  const proxy = new Proxy(data, { ownKeys() { calls++; throw new Error('MUST_NOT_RUN'); } });
  assert.throws(() => check(proxy), TypeError); assert.equal(calls, 0);
});
test('checker enforces frozen own DATA without mutating caller input', async () => {
  const { data } = await full(), copy = clone(data); assert.throws(() => check(copy), TypeError);
  Object.freeze(copy); assert.throws(() => check(copy), TypeError);
  assert.throws(() => check(), TypeError); assert.throws(() => check(data, data), TypeError);
});
test('rejection does not echo private input or raw exception payload', async () => {
  const { data } = await full(), changed = clone(data); changed.expected.laneCount = 'PRIVATE_SENTINEL_DO_NOT_ECHO';
  let error; try { check(freeze(changed)); } catch (e) { error = e; }
  assert.ok(error instanceof TypeError); assert.equal(String(error).includes('PRIVATE_SENTINEL'), false);
  assert.equal(error.stack.includes('PRIVATE_SENTINEL'), false);
});
test('bounded cycles and deep input are rejected without unbounded traversal', async () => {
  const { data } = await full(), cycle = { ...data }; cycle.extra = cycle;
  assert.throws(() => check(F(cycle)), TypeError);
  const deep = { ...data }; let at = deep; for (let i = 0; i < 40; i++) { at.extra = {}; at = at.extra; }
  assert.throws(() => check(freeze(deep)), TypeError);
});
test('full 4080-call genuine private workload is checked at runtime and again without any host calls', async () => {
  const { h, data } = await observation({ lanes: 16, gap: 1,
    limits: { maxSamplesPerPhase: 4096, maxInFlightPerPhase: 16 },
    plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 255, maxLedgerTransactionsPerOperation: 1, measurementWindowMs: 60000 } });
  const before = h.clockCalls, value = check(data);
  assert.equal(value.sourceEntriesChecked, 4080); assert.equal(value.eventsChecked, 16321);
  assert.equal(h.clockCalls, before); assert.equal(h.owner.captureTimingEvidence(), data.trace);
});
