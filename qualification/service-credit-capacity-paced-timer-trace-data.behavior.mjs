import test from 'node:test';
import assert from 'node:assert/strict';
import './service-credit-capacity-paced-timing-envelope-v2.behavior.mjs';
import { fixture, complete, ticks, deferred } from './service-credit-capacity-paced-workload-owner-core.behavior.mjs';
import { createServiceCreditCapacityPacedWorkloadOwnerCoreWithPrivateTimingTrace as prior,
  createServiceCreditCapacityPacedWorkloadOwnerCoreWithPrivateTimerTrace as create } from '../src/service-credit-capacity-paced-workload-owner-core.js';
import { checkServiceCreditCapacityPacedTimerTraceData as check } from '../src/service-credit-capacity-paced-timer-trace-data.js';

if (process.env.X402_CAPACITY_PACED_TIMER_DATA_SELECTION !== 'paced-private-timer-data-v1')
  throw new TypeError('PACED_PRIVATE_TIMER_DATA_SELECTION_REQUIRED');

const F = Object.freeze, M = 1000000n, clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); F(value); }
  return value;
}
function expected(h) {
  return freeze({ plan: { ...h.config.plan }, recordingLimits: { ...h.config.recordingLimits },
    laneCount: h.config.lanes.length, minimumStartGapMs: h.config.pacing.minimumStartGapMs });
}
function input(h, report) {
  return F({ trace: h.owner.captureTimingEvidence(), timerTrace: h.owner.captureTimerEvidence(), report, expected: expected(h) });
}
async function observe(options = {}) {
  const h = fixture({ ...options, factory: create }), report = await complete(h, 4100);
  assert.equal(report.outcome, 'OBSERVED_OWNERS_RETURNED');
  return { h, report, value: input(h, report) };
}
let baseline;
function full() { return baseline ??= observe(); }
function reject(name, edit) {
  test('timer DATA rejects ' + name, async () => {
    const { value } = await full(), changed = clone(value); edit(changed);
    assert.throws(() => check(freeze(changed)), TypeError);
  });
}

test('timer selection is inert and adds only its explicit private capture method', () => {
  const h = fixture({ factory: create });
  assert.deepEqual(Object.keys(h.owner), ['run', 'stop', 'inspect', 'captureTimingEvidence', 'captureTimerEvidence']);
  assert.deepEqual(Object.keys(fixture({ factory: prior }).owner), ['run', 'stop', 'inspect', 'captureTimingEvidence']);
  assert.equal(h.clockCalls, 0); assert.equal(h.timers.length, 0); assert.equal(h.events.length, 0);
  assert.throws(() => h.owner.captureTimerEvidence(), TypeError);
  assert.throws(() => create(), TypeError); assert.throws(() => create(h.config, h.config), TypeError);
});
test('actual timer producer and independent checker reconstruct every armed and fired slot', async () => {
  const { h, value } = await full(), before = JSON.stringify(value), clocks = h.clockCalls, calls = h.calls;
  const result = check(value), actual = h.timers.filter(t => t.kind === 'pacing');
  assert.equal(result.status, 'COMPLETE_MATCHING_DECLARED_PACING_TIMER_DATA');
  assert.equal(result.timersStartedChecked, actual.length); assert.equal(result.timersStartedChecked, value.report.pacingTimersStarted);
  assert.equal(result.timerFiresChecked, actual.filter(t => t.fired).length); assert.equal(result.cancelReturnsChecked, 0);
  assert.equal(result.eventsChecked, actual.length * 3 + 1); assert.equal(result.maximumLiveTimersObservedAsData, 1);
  assert.equal(result.timerEventsIndependentlyRecomputed, true); assert.equal(result.timerCountAndDispatchAnchorsCrossBound, true);
  assert.equal(result.pacedAndParentArithmeticPasses, 1); assert.equal(result.pacedCheck.timerEventsIndependentlyRecomputed, false);
  assert.equal(result.postStopLedgerDurationSeriesRecomputed, false);
  for (const k of ['callerClockAuthenticated', 'nativeEventsAuthenticated', 'physicalTimerAbsenceQualified',
    'nativeResourcesQualified', 'sustainableCapacityQualified', 'productionQualified']) assert.equal(result[k], false);
  assert.equal(result.authority, 'NONE'); assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.pacedCheck));
  assert.equal(JSON.stringify(value), before); assert.equal(h.clockCalls, clocks); assert.equal(h.calls, calls);
});
test('timer capture preserves old report clock scheduler cancel and source behavior', async () => {
  const a = fixture({ factory: prior }), b = fixture({ factory: create });
  const ar = await complete(a), br = await complete(b);
  assert.deepEqual(clone(ar), clone(br)); assert.deepEqual(a.owner.captureTimingEvidence(), b.owner.captureTimingEvidence());
  assert.equal(a.clockCalls, b.clockCalls); assert.equal(a.timers.length, b.timers.length); assert.equal(a.cancelCalls, b.cancelCalls);
  assert.deepEqual(a.entries.map(e => [e.lane, String(e.at)]), b.entries.map(e => [e.lane, String(e.at)]));
  const before = b.clockCalls, trace = b.owner.captureTimerEvidence();
  assert.equal(b.owner.captureTimerEvidence(), trace); assert.equal(b.clockCalls, before);
  assert.throws(() => b.owner.captureTimerEvidence(1), TypeError);
  assert.ok(Object.isFrozen(trace)); assert.ok(Object.isFrozen(trace.events)); assert.ok(trace.events.every(Object.isFrozen));
});
test('late timer fire cross-binds the real fresh dispatch, not a historical catchup slot', async () => {
  const h = fixture({ factory: create }), p = h.owner.run(); await ticks();
  const timer = h.pacing()[0]; h.fire(timer, timer.due + 30n * M); await ticks();
  await complete(h); const report = await p, value = input(h, report), result = check(value);
  assert.equal(report.outcome, 'OBSERVED_OWNERS_RETURNED'); assert.ok(result.timerFiresChecked > 0);
  const fire = value.timerTrace.events.find(e => e.kind === 'FIRE');
  assert.equal(value.trace.events[fire.pacedSequence].kind, 'DISPATCH');
  assert.equal(value.trace.events[fire.pacedSequence].atNs, fire.atNs);
});
test('cancellation return is recomputed without claiming physical timer removal', async () => {
  const h = fixture({ factory: create, plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 1 } });
  const p = h.owner.run(); await ticks(); h.owner.stop(); await ticks(); const report = await p;
  const value = input(h, report), result = check(value);
  assert.equal(report.outcome, 'OBSERVED_OWNERS_RETURNED'); assert.equal(result.cancelReturnsChecked, 1);
  assert.equal(result.timerFiresChecked, 0); assert.equal(result.physicalTimerAbsenceQualified, false);
  const before = h.calls; h.pacing();
  const timer = h.timers.find(t => t.kind === 'pacing'); timer.callback(); await ticks();
  assert.equal(h.calls, before); assert.equal(h.owner.captureTimerEvidence(), value.timerTrace);
});
test('no timer is fabricated when a genuine source operation outlasts the gap', async () => {
  const { value } = await observe({ lanes: 1, plan: { warmupCallsPerLane: 0 }, execute(lane, command, h) {
    h.time += 20n * M; return Promise.resolve('SUCCEEDED');
  } });
  const result = check(value); assert.equal(result.timersStartedChecked, 0); assert.equal(result.maximumLiveTimersObservedAsData, 0);
  assert.deepEqual(value.timerTrace.events.map(e => e.kind), ['FINALIZE']);
});
test('reentrant stop during registration retains the exact late token cancellation', async () => {
  const h = fixture({ factory: create, plan: { warmupCallsPerLane: 0 }, schedule(timer, host) {
    if (timer.kind === 'pacing') host.owner.stop(); return timer.token;
  } });
  const p = h.owner.run(); await ticks(); const report = await p, value = input(h, report);
  assert.equal(report.outcome, 'OBSERVED_OWNERS_RETURNED');
  assert.deepEqual(value.timerTrace.events.map(e => e.kind), ['ARM', 'ARMED', 'CANCEL', 'FINALIZE']);
  assert.equal(check(value).cancelReturnsChecked, 1); assert.equal(h.entries.length, 1);
  const timer = h.timers.find(t => t.kind === 'pacing'); assert.equal(timer.cancelled, true);
});
test('clock-reentrant stop at timer firing records a fire without fabricating a source dispatch', async () => {
  const h = fixture({ factory: create, plan: { warmupCallsPerLane: 0 }, now(host) {
    if (host.stopOnTick && !host.stoppedTick) { host.stoppedTick = true; host.owner.stop(); }
    return ++host.time;
  } });
  const p = h.owner.run(); await ticks(); h.stopOnTick = true; h.fire(h.pacing()[0]); await ticks();
  const report = await p, value = input(h, report), result = check(value);
  assert.equal(report.outcome, 'OBSERVED_OWNERS_RETURNED'); assert.equal(h.entries.length, 1);
  assert.equal(result.timerFiresChecked, 1); assert.equal(result.cancelReturnsChecked, 0);
});
test('the genuine measurement deadline cancels the pacing slot and keeps the entered original', async () => {
  const h = fixture({ factory: create, plan: { warmupCallsPerLane: 0 } }), p = h.owner.run(); await ticks();
  const timer = h.timers.find(t => t.kind === 'core' && t.milliseconds === 100 && !t.cancelled && !t.fired);
  h.fire(timer); await ticks(); const report = await p, value = input(h, report);
  assert.equal(report.outcome, 'OBSERVED_OWNERS_RETURNED'); assert.equal(report.core.reason, 'MEASUREMENT_WINDOW_ELAPSED');
  assert.equal(check(value).cancelReturnsChecked, 1); assert.equal(h.entries.length, 1);
});
test('mixed successful and rejected genuine source outcomes keep their real timer accounting', async () => {
  const { value } = await observe({ execute(lane, command) {
    return Promise.resolve(command.cohort === 'MEASUREMENT' && lane === 0 ? 'REJECTED' : 'SUCCEEDED');
  } });
  assert.equal(check(value).timersStartedChecked, value.report.pacingTimersStarted);
  assert.equal(value.report.dispatchedCallRecording.phases.FUNDED_CALL.rejected, 2);
});
test('synchronous timer refusal retains raw unknown evidence and never qualifies it', async () => {
  const h = fixture({ factory: create, schedule(timer) {
    if (timer.kind === 'pacing') timer.callback(); return timer.token;
  } });
  const p = h.owner.run(); await ticks(); const report = await p, value = input(h, report);
  assert.equal(report.outcome, 'HELD_UNKNOWN'); assert.equal(value.timerTrace.unknown, true);
  assert.ok(value.timerTrace.events.some(e => e.kind === 'EARLY_FIRE'));
  assert.throws(() => check(value), TypeError);
});
test('throwing timer registration keeps the refusal rather than inventing an armed slot', async () => {
  const h = fixture({ factory: create, schedule(timer) {
    if (timer.kind === 'pacing') throw new Error('PRIVATE_TIMER_FAILURE'); return timer.token;
  } });
  const p = h.owner.run(); await ticks(); const report = await p, value = input(h, report);
  assert.equal(report.outcome, 'HELD_UNKNOWN'); assert.equal(value.timerTrace.unknown, true);
  assert.ok(value.timerTrace.events.some(e => e.kind === 'REFUSED'));
  assert.throws(() => check(value), TypeError);
  assert.equal(JSON.stringify(value.timerTrace).includes('PRIVATE_TIMER_FAILURE'), false);
});
test('uncertain cancellation is retained and cannot be repaired by a late callback', async () => {
  const h = fixture({ factory: create, plan: { warmupCallsPerLane: 0 }, cancel(timer) {
    return timer?.kind === 'pacing' ? false : undefined;
  } });
  const p = h.owner.run(); await ticks(); const timer = h.pacing()[0]; h.owner.stop(); await ticks();
  const report = await p, value = input(h, report);
  assert.equal(report.outcome, 'HELD_UNKNOWN'); assert.equal(value.timerTrace.unknown, true);
  assert.ok(value.timerTrace.events.some(e => e.kind === 'CANCEL' && !e.returned));
  timer.callback(); await ticks(); assert.equal(h.owner.captureTimerEvidence(), value.timerTrace);
  assert.throws(() => check(value), TypeError);
});
test('pending source and late completion never upgrade a finalized held timer capsule', async () => {
  const cap = deferred(), h = fixture({ factory: create, plan: { warmupCallsPerLane: 0 }, execute() { return cap.promise; } });
  const p = h.owner.run(); await ticks(); h.owner.stop(); await ticks(); h.fireDrain(); await ticks();
  const report = await p, value = input(h, report); assert.equal(report.outcome, 'HELD_UNKNOWN');
  cap.resolve('SUCCEEDED'); await ticks(); assert.equal(h.owner.captureTimerEvidence(), value.timerTrace);
  assert.throws(() => check(value), TypeError);
});
test('timer DATA roundtrip keeps the one genuine paced and parent trace', async () => {
  const { value } = await full(), decoded = freeze(clone(value));
  assert.deepEqual(check(decoded), check(value));
  assert.equal((JSON.stringify(value).match(/"parentTimingTraceVersion":1/g) ?? []).length, 1);
  assert.equal(value.timerTrace.rawTokensIncluded, false); assert.equal(value.timerTrace.additionalClockReads, 0);
  for (const marker of ['token', 'callback', 'PRIVATE_TIMER_FAILURE']) assert.equal(JSON.stringify(value.timerTrace).includes(marker), false);
});
test('getters and proxies are refused without hooks or private errors', async () => {
  const { value } = await full(); let called = 0;
  const getter = { ...value };
  Object.defineProperty(getter, 'timerTrace', { enumerable: true, get() { called++; throw new Error('PRIVATE_TIMER_FAILURE'); } });
  const proxy = new Proxy(value, { ownKeys() { called++; throw new Error('PRIVATE_TIMER_FAILURE'); } });
  for (const v of [F(getter), proxy]) assert.throws(() => check(v), e => e instanceof TypeError
    && e.message === 'service_credit_capacity_paced_timer_trace_data_rejected' && !e.stack.includes('PRIVATE_TIMER_FAILURE'));
  assert.equal(called, 0);
  assert.throws(() => check(), TypeError); assert.throws(() => check(value, value), TypeError);
});
test('nested timer event and event-array hooks never run', async () => {
  const { value } = await full(); let calls = 0;
  const first = { ...value.timerTrace.events[0] };
  Object.defineProperty(first, 'timer', { enumerable: true, get() { calls++; throw new Error('PRIVATE_TIMER_FAILURE'); } });
  const events = F([F(first), ...value.timerTrace.events.slice(1)]);
  assert.throws(() => check(F({ ...value, timerTrace: F({ ...value.timerTrace, events }) })), TypeError);
  const proxy = new Proxy(value.timerTrace.events, { getPrototypeOf() { calls++; throw new Error('PRIVATE_TIMER_FAILURE'); } });
  assert.throws(() => check(F({ ...value, timerTrace: F({ ...value.timerTrace, events: proxy }) })), TypeError);
  assert.equal(calls, 0);
});

reject('a declared count changed within the old finite bound', v => { v.report.pacingTimersStarted = 0; });
reject('missing timer capsule', v => { delete v.timerTrace; });
reject('extra authority field', v => { v.timerTrace.approved = true; });
reject('unknown capsule', v => { v.timerTrace.unknown = true; });
reject('boolean version', v => { v.timerTrace.pacedTimerTraceVersion = true; });
reject('foreign clock', v => { v.timerTrace.clockDomain = 'SERVICE_CHILD_LOCAL'; });
reject('false physical cancellation claim', v => { v.timerTrace.physicalTimerAbsenceQualified = true; });
reject('false native authenticity', v => { v.timerTrace.nativeEventsAuthenticated = true; });
reject('forged event limit', v => { v.timerTrace.maximumEvents++; });
reject('different lane count', v => { v.timerTrace.laneCount++; });
reject('different start gap', v => { v.timerTrace.minimumStartGapMs++; });
reject('different limits', v => { v.timerTrace.limits.maxSamplesPerPhase--; });
reject('missing terminal event', v => { v.timerTrace.events.pop(); });
reject('truncated raw timer trace', v => { v.timerTrace.events.splice(0, 3); });
reject('out of order sequence', v => { v.timerTrace.events[0].sequence = 2; });
reject('anchor beyond paced trace', v => { v.timerTrace.events[0].pacedSequence = v.trace.events.length + 1; });
reject('anchor before a real dispatch', v => { v.timerTrace.events[0].pacedSequence = 0; });
reject('negative zero anchor', v => { v.timerTrace.events[0].pacedSequence = -0; });
reject('duplicate timer ordinal', v => { v.timerTrace.events.find(e => e.timer === 2 && e.kind === 'ARM').timer = 1; });
reject('arming without the prior return', v => { v.timerTrace.events[1].kind = 'ARM'; });
reject('fire for foreign timer', v => { v.timerTrace.events.find(e => e.kind === 'FIRE').timer = 999; });
reject('forged due time', v => { v.timerTrace.events[0].dueNs = String(BigInt(v.timerTrace.events[0].dueNs) + 1n); });
reject('forged rounded delay', v => { v.timerTrace.events[0].delayMs--; });
reject('early firing', v => { const r = v.timerTrace.events.find(e => e.kind === 'FIRE'); r.atNs = v.timerTrace.events[0].atNs; });
reject('late firing detached from its actual dispatch', v => {
  const r = v.timerTrace.events.find(e => e.kind === 'FIRE'); r.atNs = String(BigInt(r.atNs) + 1n);
});
reject('a token in raw output', v => { v.timerTrace.events[0].token = 'PRIVATE_TIMER_FAILURE'; });
reject('noncanonical nanoseconds', v => { v.timerTrace.events[0].atNs = '01'; });
reject('overflow nanoseconds', v => { v.timerTrace.events[0].atNs = String(1n << 128n); });
reject('primitive coercion', v => { v.timerTrace.events[0].delayMs = '5'; });
reject('events after finalization', v => { v.timerTrace.events.push({ ...v.timerTrace.events.at(-1) }); });
reject('underlying paced metric drift', v => { v.report.sourceExecuteEntries++; });

test('4080 actual source-DATA calls retain bounded timer rows without copying the input tree', async () => {
  const { h, value } = await observe({ lanes: 16, gap: 1,
    limits: { maxSamplesPerPhase: 4096, maxInFlightPerPhase: 16 },
    plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 255, maxLedgerTransactionsPerOperation: 1, measurementWindowMs: 60000 } });
  const clocks = h.clockCalls, result = check(value);
  assert.equal(result.pacedCheck.sourceEntriesChecked, 4080); assert.equal(result.timersStartedChecked, 4079);
  assert.equal(result.eventsChecked, 4079 * 3 + 1); assert.ok(result.eventsChecked < value.timerTrace.maximumEvents);
  assert.equal(result.pacedEventsCrossChecked, value.trace.events.length); assert.equal(h.clockCalls, clocks);
  assert.equal(h.owner.captureTimerEvidence(), value.timerTrace);
});
