import test from 'node:test';
import assert from 'node:assert/strict';
import './service-credit-capacity-paced-timing-trace-data.behavior.mjs';
import { fixture, complete, ticks, deferred } from './service-credit-capacity-paced-workload-owner-core.behavior.mjs';
import { createServiceCreditCapacityPacedWorkloadOwnerCoreWithPrivateTimingTrace as create } from '../src/service-credit-capacity-paced-workload-owner-core.js';
import { checkServiceCreditCapacityPacedTimingTraceData as check,
  captureServiceCreditCapacityPacedTimingEnvelopeData as capture } from '../src/service-credit-capacity-paced-timing-trace-data.js';
import { checkServiceCreditCapacityParentTimingTraceData as checkParent } from '../src/service-credit-capacity-parent-timing-trace-data.js';

if (process.env.X402_CAPACITY_PACED_ENVELOPE_DATA_SELECTION !== 'paced-timing-envelope-data-v2')
  throw new TypeError('PACED_TIMING_ENVELOPE_DATA_SELECTION_REQUIRED');

const F = Object.freeze;
function freeze(value) {
  if (value && typeof value === 'object') { for (const v of Object.values(value)) freeze(v); F(value); }
  return value;
}
function expected(h) {
  return freeze({ plan: { ...h.config.plan }, recordingLimits: { ...h.config.recordingLimits },
    laneCount: h.config.lanes.length, minimumStartGapMs: h.config.pacing.minimumStartGapMs });
}
function context(h) {
  // Declared private DATA, not a native namespace or authenticated source.
  return F({ runId: 'a'.repeat(64), sourceRowsSha256: 'b'.repeat(64),
    childSourceRowsSha256: 'c'.repeat(64), laneIds: F(h.config.lanes.map((_, n) => 'lane.' + n)) });
}
async function observe(options = {}) {
  const h = fixture({ ...options, factory: create }), exp = expected(h);
  const report = await complete(h, 4100);
  assert.equal(report.outcome, 'OBSERVED_OWNERS_RETURNED');
  return { h, input: F({ context: context(h), trace: h.owner.captureTimingEvidence(), report, expected: exp }) };
}
let baseline;
function full() { return baseline ??= observe(); }

test('v2 envelope retains one genuine capsule and both independently matching check summaries', async () => {
  const { h, input } = await full(), clocks = h.clockCalls, calls = h.calls;
  const value = capture(input);
  assert.equal(value.pacedTimingCaptureVersion, 2);
  assert.equal(value.status, 'MATCHING_DECLARED_PACED_TRACE');
  assert.equal(value.context, input.context); assert.equal(value.trace, input.trace);
  assert.equal(value.parentTraceLocation, 'trace.coreParentTimingTrace');
  assert.deepEqual(value.check, check(F({ trace: input.trace, report: input.report, expected: input.expected })));
  assert.deepEqual(value.parentCheck, checkParent(F({ trace: input.trace.coreParentTimingTrace, recording: input.report.core.recording })));
  assert.equal(h.clockCalls, clocks); assert.equal(h.calls, calls);
  assert.ok(Object.isFrozen(value)); assert.ok(Object.isFrozen(value.check)); assert.ok(Object.isFrozen(value.parentCheck));
});

test('envelope has no second raw parent trace, report copy or separately supplied check', async () => {
  const { input } = await full(), value = capture(input);
  assert.deepEqual(Object.keys(value), ['pacedTimingCaptureVersion', 'context', 'trace', 'check', 'parentCheck', 'parentTraceLocation', 'status']);
  assert.equal('parentTimingData' in value, false); assert.equal('report' in value, false);
  assert.equal('trace' in value.parentCheck, false);
  assert.equal((JSON.stringify(value).match(/"parentTimingTraceVersion":1/g) ?? []).length, 1);
  assert.equal(value.check.nativeEventsAuthenticated, false); assert.equal(value.parentCheck.nativeEventsAuthenticated, false);
  assert.equal(value.check.authority, 'NONE'); assert.equal(value.parentCheck.authority, 'NONE');
});

test('safe HELD evidence is preserved as UNKNOWN and cannot upgrade after late completion', async () => {
  const cap = deferred(), h = fixture({ factory: create,
    plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 1 }, execute() { return cap.promise; } });
  const exp = expected(h), p = h.owner.run(); await ticks(); h.owner.stop(); await ticks(); h.fireDrain(); await ticks();
  const report = await p, trace = h.owner.captureTimingEvidence();
  const input = F({ context: context(h), trace, report, expected: exp }), value = capture(input);
  assert.equal(value.status, 'UNKNOWN_OR_MISMATCHED_PACED_TRACE'); assert.equal(value.trace, trace);
  assert.equal(value.check, null); assert.equal(value.parentCheck, null);
  cap.resolve('SUCCEEDED'); await ticks();
  assert.equal(h.owner.inspect().pendingSourceObservations, 0);
  const late = capture(input);
  assert.equal(late.status, value.status); assert.equal(late.trace, trace); assert.equal(late.check, null);
});

test('safe mismatched arithmetic stays in the one raw capsule without a partial parent pass', async () => {
  const { input } = await full(), changed = JSON.parse(JSON.stringify(input));
  changed.report.sourceExecuteEntries++;
  const owned = freeze(changed), value = capture(owned);
  assert.equal(value.status, 'UNKNOWN_OR_MISMATCHED_PACED_TRACE');
  assert.equal(value.trace, owned.trace); assert.equal(value.check, null); assert.equal(value.parentCheck, null);
  assert.throws(() => check(F({ trace: owned.trace, report: owned.report, expected: owned.expected })), TypeError);
});

test('unsafe getters and proxies refuse without hooks or an UNKNOWN unsafe payload', async () => {
  const { input } = await full(); let calls = 0;
  const getter = { ...input };
  Object.defineProperty(getter, 'trace', { enumerable: true, get() { calls++; throw new Error('MUST_NOT_RUN'); } });
  assert.throws(() => capture(F(getter)), TypeError);
  const proxy = new Proxy(input, { ownKeys() { calls++; throw new Error('MUST_NOT_RUN'); } });
  assert.throws(() => capture(proxy), TypeError); assert.equal(calls, 0);
});

test('envelope context and arity are exact DATA, not caller authentication or authority', async () => {
  const { input } = await full();
  assert.throws(() => capture(), TypeError); assert.throws(() => capture(input, input), TypeError);
  for (const mutate of [
    v => { v.context.extra = true; }, v => { v.context.runId = 'A'.repeat(64); },
    v => { v.context.sourceRowsSha256 = v.context.childSourceRowsSha256; },
    v => { v.context.laneIds[1] = v.context.laneIds[0]; }, v => { v.context.laneIds.pop(); },
    v => { v.context.laneIds[0] = 'bad lane'; }, v => { v.extraCheck = true; },
  ]) {
    const value = JSON.parse(JSON.stringify(input)); mutate(value);
    assert.throws(() => capture(freeze(value)), TypeError);
  }
  const value = capture(input);
  assert.equal(value.check.runOrNativeSourceContextAuthenticated, false);
  assert.equal(value.check.callerExpectationsAuthenticated, false);
});

test('v2 serialization roundtrip retains every genuine inner and paced event for independent checking', async () => {
  const { input } = await full(), value = capture(input), decoded = freeze(JSON.parse(JSON.stringify(value)));
  assert.deepEqual(decoded.trace, input.trace);
  assert.deepEqual(check(F({ trace: decoded.trace, report: input.report, expected: input.expected })), value.check);
  assert.deepEqual(checkParent(F({ trace: decoded.trace.coreParentTimingTrace, recording: input.report.core.recording })), value.parentCheck);
});

test('4080-call DATA serialization removes a whole duplicate core trace, not samples or checks', async () => {
  const { h, input } = await observe({ lanes: 16, gap: 1,
    limits: { maxSamplesPerPhase: 4096, maxInFlightPerPhase: 16 },
    plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 255, maxLedgerTransactionsPerOperation: 1, measurementWindowMs: 60000 } });
  const clocks = h.clockCalls, value = capture(input), ctx = input.context;
  // Reconstruct only the OLD JSON LAYOUT using current genuine source DATA.
  // This is NOT execution/replay of the old native entry or a native result.
  const oldLayout = {
    parentTimingData: { parentTimingCaptureVersion: 1,
      context: { runId: ctx.runId, sourceRowsSha256: ctx.sourceRowsSha256, laneIds: ctx.laneIds },
      trace: input.trace.coreParentTimingTrace, check: value.parentCheck, status: 'MATCHING_DECLARED_PARENT_TRACE' },
    pacedTimingData: { pacedTimingCaptureVersion: 1, context: ctx, trace: input.trace,
      check: value.check, status: 'MATCHING_DECLARED_PACED_TRACE' },
  };
  const before = JSON.stringify(oldLayout), after = JSON.stringify({ pacedTimingData: value });
  const coreBytes = Buffer.byteLength(JSON.stringify(input.trace.coreParentTimingTrace));
  const oldBytes = Buffer.byteLength(before), newBytes = Buffer.byteLength(after);
  assert.equal((before.match(/"parentTimingTraceVersion":1/g) ?? []).length, 2);
  assert.equal((after.match(/"parentTimingTraceVersion":1/g) ?? []).length, 1);
  assert.equal(value.check.sourceEntriesChecked, 4080);
  assert.equal(value.trace, input.trace); assert.equal(h.clockCalls, clocks);
  assert.ok(oldBytes - newBytes >= coreBytes); assert.ok(newBytes < oldBytes);
  console.log('# paced-envelope-v2-DATA-size ' + JSON.stringify({
    sourceCalls: 4080, parentEvents: input.trace.coreParentTimingTrace.events.length,
    pacedEvents: input.trace.events.length, oldTimingLayoutBytes: oldBytes, newTimingLayoutBytes: newBytes,
    singleCoreTraceBytes: coreBytes, bytesRemoved: oldBytes - newBytes,
    rawParentTraceOccurrencesBefore: 2, rawParentTraceOccurrencesAfter: 1,
    oldLayoutReconstructedAsDataOnly: true, oldNativeEntryExecuted: false, nativeBenchmark: false,
  }));
});
