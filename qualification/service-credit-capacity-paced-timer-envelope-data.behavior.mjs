import test from 'node:test';
import assert from 'node:assert/strict';
import './service-credit-capacity-paced-timer-trace-data.behavior.mjs';
import { fixture, complete, ticks, deferred } from './service-credit-capacity-paced-workload-owner-core.behavior.mjs';
import { createServiceCreditCapacityPacedWorkloadOwnerCoreWithPrivateTimerTrace as create } from '../src/service-credit-capacity-paced-workload-owner-core.js';
import { checkServiceCreditCapacityPacedTimerTraceData as check,
  captureServiceCreditCapacityPacedTimerEnvelopeData as capture } from '../src/service-credit-capacity-paced-timer-trace-data.js';
import { checkServiceCreditCapacityParentTimingTraceData as parentCheck } from '../src/service-credit-capacity-parent-timing-trace-data.js';

if (process.env.X402_CAPACITY_PACED_TIMER_ENVELOPE_DATA_SELECTION !== 'paced-private-timer-envelope-data-v1')
  throw new TypeError('PACED_PRIVATE_TIMER_ENVELOPE_DATA_SELECTION_REQUIRED');

const F = Object.freeze, clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); F(value); }
  return value;
}
function input(h, report) {
  return F({ context: F({ runId: 'a'.repeat(64), sourceRowsSha256: 'b'.repeat(64),
    childSourceRowsSha256: 'c'.repeat(64), laneIds: F(h.config.lanes.map((_, i) => 'lane.' + i)) }),
  trace: h.owner.captureTimingEvidence(), timerTrace: h.owner.captureTimerEvidence(), report,
  expected: freeze({ plan: { ...h.config.plan }, recordingLimits: { ...h.config.recordingLimits },
    laneCount: h.config.lanes.length, minimumStartGapMs: h.config.pacing.minimumStartGapMs }) });
}
async function observe(options = {}) {
  const h = fixture({ ...options, factory: create }), report = await complete(h, 4100);
  assert.equal(report.outcome, 'OBSERVED_OWNERS_RETURNED'); return { h, value: input(h, report) };
}
let baseline;
function full() { return baseline ??= observe(); }
function checked(value) { return check(F({ trace: value.trace, timerTrace: value.timerTrace, report: value.report, expected: value.expected })); }

test('timer envelope retains genuine raw references and both actual independent check summaries', async () => {
  const { h, value } = await full(), before = JSON.stringify(value), clocks = h.clockCalls, calls = h.calls;
  const out = capture(value);
  assert.equal(out.pacedTimerCaptureVersion, 1); assert.equal(out.status, 'MATCHING_DECLARED_PACED_TIMER_TRACE');
  assert.equal(out.context, value.context); assert.equal(out.trace, value.trace); assert.equal(out.timerTrace, value.timerTrace);
  assert.equal(out.parentTraceLocation, 'trace.coreParentTimingTrace');
  assert.deepEqual(out.check, checked(value));
  assert.deepEqual(out.parentCheck, parentCheck(F({ trace: value.trace.coreParentTimingTrace, recording: value.report.core.recording })));
  assert.equal(out.check.pacedAndParentArithmeticPasses, 1); assert.equal(h.clockCalls, clocks); assert.equal(h.calls, calls);
  assert.equal(JSON.stringify(value), before);
  for (const v of [out, out.check, out.check.pacedCheck, out.parentCheck]) assert.ok(Object.isFrozen(v));
});
test('timer envelope has no raw report or second parent or paced capsule', async () => {
  const { value } = await full(), out = capture(value);
  assert.deepEqual(Object.keys(out), ['pacedTimerCaptureVersion', 'context', 'trace', 'timerTrace', 'check', 'parentCheck', 'parentTraceLocation', 'status']);
  const text = JSON.stringify(out);
  for (const marker of ['"pacedTimingTraceVersion":1', '"parentTimingTraceVersion":1', '"pacedTimerTraceVersion":1'])
    assert.equal((text.match(new RegExp(marker, 'g')) ?? []).length, 1);
  assert.equal('report' in out, false); assert.equal('trace' in out.check, false); assert.equal('trace' in out.parentCheck, false);
});
test('serializing and decoding preserves complete timer parent and paced source arithmetic', async () => {
  const { value } = await full(), out = capture(value), restored = freeze(clone(out));
  assert.deepEqual(restored.trace, value.trace); assert.deepEqual(restored.timerTrace, value.timerTrace);
  assert.deepEqual(check(F({ trace: restored.trace, timerTrace: restored.timerTrace, report: value.report, expected: value.expected })), out.check);
});
test('safe timer count mismatch retains both raw capsules without a partial parent pass', async () => {
  const { value } = await full(), changed = clone(value); changed.report.pacingTimersStarted = 0;
  const owned = freeze(changed), out = capture(owned);
  assert.equal(out.status, 'UNKNOWN_OR_MISMATCHED_PACED_TIMER_TRACE'); assert.equal(out.check, null); assert.equal(out.parentCheck, null);
  assert.equal(out.trace, owned.trace); assert.equal(out.timerTrace, owned.timerTrace);
});
test('safe anchor mismatch does not repair drop or reorder the original timer rows', async () => {
  const { value } = await full(), changed = clone(value); changed.timerTrace.events[0].pacedSequence = 0;
  const owned = freeze(changed), before = JSON.stringify(owned), out = capture(owned);
  assert.equal(out.status, 'UNKNOWN_OR_MISMATCHED_PACED_TIMER_TRACE'); assert.equal(out.timerTrace, owned.timerTrace);
  assert.equal(out.check, null); assert.equal(out.parentCheck, null); assert.equal(JSON.stringify(owned), before);
});
test('safe mismatch in the earlier paced metrics cannot leave a successful timer-only verdict', async () => {
  const { value } = await full(), changed = clone(value); changed.report.sourceExecuteEntries++;
  const out = capture(freeze(changed)); assert.equal(out.check, null); assert.equal(out.parentCheck, null);
  assert.equal(out.status, 'UNKNOWN_OR_MISMATCHED_PACED_TIMER_TRACE');
});
test('safe synchronous timer delivery diagnostics remain unknown and byte-preserved', async () => {
  const h = fixture({ factory: create, schedule(timer) { if (timer.kind === 'pacing') timer.callback(); return timer.token; } });
  const p = h.owner.run(); await ticks(); const report = await p, value = input(h, report), before = JSON.stringify(value.timerTrace);
  const out = capture(value); assert.equal(report.outcome, 'HELD_UNKNOWN'); assert.equal(out.check, null); assert.equal(out.parentCheck, null);
  assert.equal(out.timerTrace, value.timerTrace); assert.equal(JSON.stringify(out.timerTrace), before);
  assert.ok(out.timerTrace.events.some(r => r.kind === 'EARLY_FIRE'));
});
test('safe registration refusal diagnostic has no invented armed or native-complete verdict', async () => {
  const h = fixture({ factory: create, schedule(timer) {
    if (timer.kind === 'pacing') throw new Error('PRIVATE_REGISTRATION_FAILURE'); return timer.token;
  } });
  const p = h.owner.run(); await ticks(); const value = input(h, await p), out = capture(value);
  assert.equal(out.check, null); assert.equal(out.parentCheck, null); assert.equal(out.timerTrace, value.timerTrace);
  assert.ok(out.timerTrace.events.some(r => r.kind === 'REFUSED'));
  assert.equal(JSON.stringify(out).includes('PRIVATE_REGISTRATION_FAILURE'), false);
});
test('safe uncertain cancellation remains unknown rather than authenticated cancellation', async () => {
  const h = fixture({ factory: create, plan: { warmupCallsPerLane: 0 }, cancel(t) { return t?.kind === 'pacing' ? false : undefined; } });
  const p = h.owner.run(); await ticks(); h.owner.stop(); await ticks(); const out = capture(input(h, await p));
  assert.equal(out.check, null); assert.equal(out.parentCheck, null); assert.equal(out.timerTrace.unknown, true);
  assert.ok(out.timerTrace.events.some(r => r.kind === 'CANCEL' && r.returned === false));
});
test('late source completion does not upgrade the finalized held timer envelope', async () => {
  const cap = deferred(), h = fixture({ factory: create, plan: { warmupCallsPerLane: 0 }, execute() { return cap.promise; } });
  const p = h.owner.run(); await ticks(); h.owner.stop(); await ticks(); h.fireDrain(); await ticks();
  const value = input(h, await p), out = capture(value); cap.resolve('SUCCEEDED'); await ticks();
  const late = capture(value); assert.equal(out.check, null); assert.equal(late.check, null);
  assert.equal(late.trace, out.trace); assert.equal(late.timerTrace, out.timerTrace); assert.equal(late.status, out.status);
});
test('caller context is strictly shaped but is not authenticated run or native graph identity', async () => {
  const { value } = await full(), out = capture(value);
  assert.equal(out.check.callerClockAuthenticated, false); assert.equal(out.check.nativeEventsAuthenticated, false);
  assert.equal(out.check.physicalTimerAbsenceQualified, false); assert.equal(out.check.sustainableCapacityQualified, false);
  assert.equal(out.parentCheck.nativeEventsAuthenticated, false); assert.equal(out.check.authority, 'NONE');
  const foreign = freeze({ ...value, context: { ...value.context, runId: 'd'.repeat(64) } });
  assert.equal(capture(foreign).context, foreign.context); // Declared context only, never a native receipt.
});
test('timer envelope arity context and unknown top-level fields refuse', async () => {
  const { value } = await full(); assert.throws(() => capture(), TypeError); assert.throws(() => capture(value, value), TypeError);
  for (const edit of [v => { v.approved = true; }, v => { delete v.context; },
    v => { v.context.sourceRowsSha256 = v.context.childSourceRowsSha256; },
    v => { v.context.laneIds[1] = v.context.laneIds[0]; }, v => { v.context.runId = 'A'.repeat(64); }]) {
    const changed = clone(value); edit(changed); assert.throws(() => capture(freeze(changed)), TypeError);
  }
});
test('unsafe hooks and raw token fields refuse before returning any UNKNOWN retained envelope', async () => {
  const { value } = await full(); let calls = 0;
  const getter = { ...value };
  Object.defineProperty(getter, 'timerTrace', { enumerable: true, get() { calls++; throw new Error('PRIVATE_HOOK'); } });
  const proxy = new Proxy(value.timerTrace.events, { ownKeys() { calls++; throw new Error('PRIVATE_HOOK'); } });
  for (const v of [F(getter), F({ ...value, timerTrace: F({ ...value.timerTrace, events: proxy }) })])
    assert.throws(() => capture(v), e => e instanceof TypeError && !e.stack.includes('PRIVATE_HOOK'));
  assert.equal(calls, 0);
  const changed = clone(value); changed.timerTrace.events[0].token = 'PRIVATE_TOKEN';
  assert.throws(() => capture(freeze(changed)), TypeError);
});
test('timer envelope rejects unbounded malformed and claimed-native rows without coercion', async () => {
  const { value } = await full();
  for (const edit of [v => { v.timerTrace.maximumEvents++; }, v => { v.timerTrace.events[0].delayMs = '5'; },
    v => { v.timerTrace.events[0].atNs = '01'; }, v => { v.timerTrace.events[0].timer = -0; },
    v => { v.timerTrace.physicalTimerAbsenceQualified = true; }, v => { v.timerTrace.events[0].kind = 'PRIVATE_UNKNOWN_KIND'; },
    v => { v.timerTrace.events = []; }, v => { delete v.timerTrace.events[0]; }]) {
    const changed = clone(value); edit(changed); assert.throws(() => capture(freeze(changed)), TypeError);
  }
});
test('empty timer series still retains its real final row, not a fabricated missing capture', async () => {
  const { value } = await observe({ lanes: 1, execute(lane, command, h) { h.time += 20000000n; return Promise.resolve('SUCCEEDED'); } });
  const out = capture(value); assert.equal(out.status, 'MATCHING_DECLARED_PACED_TIMER_TRACE');
  assert.equal(out.check.timersStartedChecked, 0); assert.equal(out.timerTrace.events.length, 1);
});
test('full 4080-call timer envelope serializes one complete parent paced and timer trace', async () => {
  const { h, value } = await observe({ lanes: 16, gap: 1, limits: { maxSamplesPerPhase: 4096, maxInFlightPerPhase: 16 },
    plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 255, maxLedgerTransactionsPerOperation: 1, measurementWindowMs: 60000 } });
  const clocks = h.clockCalls, out = capture(value), text = JSON.stringify(out);
  assert.equal(out.check.pacedCheck.sourceEntriesChecked, 4080); assert.equal(out.check.eventsChecked, 12238);
  assert.equal(out.trace, value.trace); assert.equal(out.timerTrace, value.timerTrace); assert.equal(h.clockCalls, clocks);
  for (const marker of ['"pacedTimingTraceVersion":1', '"parentTimingTraceVersion":1', '"pacedTimerTraceVersion":1'])
    assert.equal((text.match(new RegExp(marker, 'g')) ?? []).length, 1);
  const duplicateLayout = JSON.stringify({ envelope: out, separateTimerTrace: value.timerTrace });
  assert.ok(duplicateLayout.length - text.length > JSON.stringify(value.timerTrace).length);
  console.log('# timer-envelope-source-DATA-size ' + JSON.stringify({ sourceCalls: 4080,
    timerRows: out.timerTrace.events.length, envelopeBytes: Buffer.byteLength(text),
    duplicateTimerLayoutBytes: Buffer.byteLength(duplicateLayout), sourceTreesCopied: 0,
    nativeExecution: false, sustainableThroughputQualified: false }));
});
