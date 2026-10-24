import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, complete, ticks, deferred } from './service-credit-capacity-paced-workload-owner-core.behavior.mjs';
import { createServiceCreditCapacityPacedWorkloadOwnerCoreWithPrivateTimingTrace as create } from '../src/service-credit-capacity-paced-workload-owner-core.js';
import { checkServiceCreditCapacityParentTimingTraceData as checkCore } from '../src/service-credit-capacity-parent-timing-trace-data.js';

if (process.env.X402_CAPACITY_PACED_PRIVATE_DATA_SELECTION !== 'paced-source-private-timing-data-v1')
  throw new TypeError('PACED_SOURCE_PRIVATE_DATA_SELECTION_REQUIRED');
console.log('# paced-source-private-data-runtime ' + JSON.stringify({ Node: process.version,
  platform: process.platform, arch: process.arch, eventsDeclared: true, nativeEffects: false }));

const F = Object.freeze, plain = value => JSON.parse(JSON.stringify(value));
function histogram(values) {
  if (!values.length) return { samples: 0, min: null, p50: null, p95: null, p99: null, max: null };
  const rows = [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const rank = percentage => String(rows[Math.floor((rows.length * percentage - 1) / 100)]);
  return { samples: rows.length, min: String(rows[0]), p50: rank(50), p95: rank(95), p99: rank(99), max: String(rows.at(-1)) };
}
function series() { return { entered: 0, settled: 0, active: 0, peak: 0, succeeded: 0, rejected: 0, all: [], success: [], first: null, last: null }; }
function touch(s, at) { s.first ??= at; s.last = at; }
function begin(s, at) { s.entered++; s.active++; s.peak = Math.max(s.peak, s.active); touch(s, at); }
function end(s, started, at, outcome) {
  s.settled++; s.active--; s[outcome === 'SUCCEEDED' ? 'succeeded' : 'rejected']++;
  s.all.push(at - started); if (outcome === 'SUCCEEDED') s.success.push(at - started); touch(s, at);
}
function expected(s, limits) {
  const empty = series();
  function phase(v) {
    return { entered: v.entered, settled: v.settled, pending: v.active, succeeded: v.succeeded, rejected: v.rejected,
      unknown: 0, peakInFlight: v.peak, nonSuccessFraction: v.settled ? { numerator: v.rejected, denominator: v.settled } : null,
      terminalLatencyNanoseconds: histogram(v.all), successfulLatencyNanoseconds: histogram(v.success) };
  }
  return { capacityRecorderVersion: 1, scope: 'CALLER_DECLARED_OBSERVATIONS_ONLY',
    clock: 'CALLER_SUPPLIED_MONOTONIC_NANOSECONDS', percentileMethod: 'NEAREST_RANK',
    recordingState: s.entered ? 'COMPLETE' : 'EMPTY', recordingIssue: null, stopReason: null, limits,
    refusedStarts: 0, pendingObservations: 0, observedSpanNanoseconds: s.first === null ? null : String(s.last - s.first),
    phases: { FUNDING: phase(empty), FUNDED_CALL: phase(s), LEDGER_TRANSACTION: phase(empty) },
    ledgerBalanceChecks: { samples: 0, mismatches: 0, result: 'NOT_RECORDED' }, capacityQualification: 'NOT_ESTABLISHED',
    ledgerCorrectness: 'NOT_ESTABLISHED', authenticatedExecution: false, liveOrProduction: false, authority: 'NONE' };
}
// Independent test arithmetic, not recorder replay and not a native verifier.
function verify(capture, result) {
  assert.equal(capture.unknown, false); assert.ok(Object.isFrozen(capture));
  assert.equal(capture.maximumEvents, 4 * capture.limits.maxSamplesPerPhase + 1);
  assert.ok(capture.events.length <= capture.maximumEvents);
  assert.equal(capture.additionalClockReads, 0); assert.equal(capture.rawIdentifiersIncluded, false);
  const wait = series(), source = series(), requests = new Map(), fifo = [], lanes = new Map(), ordinals = new Map();
  let previous = null, lastDispatch = null, entries = 0, withdrawals = 0;
  for (let i = 0; i < capture.events.length; i++) {
    const row = capture.events[i]; assert.ok(Object.isFrozen(row)); assert.equal(row.sequence, i + 1);
    let at = null;
    if ('atNs' in row) {
      assert.match(row.atNs, /^(0|[1-9][0-9]*)$/); at = BigInt(row.atNs);
      assert.ok(previous === null || at >= previous); previous = at;
    }
    if (row.kind === 'REQUEST') {
      assert.equal(row.request, requests.size + 1); assert.ok(!lanes.has(row.lane));
      assert.ok(row.lane >= 0 && row.lane < capture.laneCount);
      assert.equal(row.ordinal, ordinals.get(row.lane) ?? 0); ordinals.set(row.lane, row.ordinal + 1);
      requests.set(row.request, { state: 'RESERVED', lane: row.lane }); lanes.set(row.lane, row.request); fifo.push(row.request);
    } else if (row.kind === 'WAIT_BEGIN') {
      const r = requests.get(row.request); assert.equal(r.state, 'RESERVED');
      r.state = 'WAITING'; r.waitAt = at; begin(wait, at);
    } else if (row.kind === 'DISPATCH') {
      const r = requests.get(row.request); assert.equal(r.state, 'WAITING'); assert.equal(fifo.shift(), row.request);
      assert.ok(lastDispatch === null || at - lastDispatch >= BigInt(capture.minimumStartGapMs) * 1000000n);
      lastDispatch = at; end(wait, r.waitAt, at, 'SUCCEEDED'); begin(source, at);
      r.state = 'ENTERED'; r.sourceAt = at; entries++;
    } else if (row.kind === 'SOURCE_TERMINAL') {
      const r = requests.get(row.request); assert.equal(r.state, 'ENTERED');
      assert.ok(row.outcome === 'SUCCEEDED' || row.outcome === 'REJECTED');
      end(source, r.sourceAt, at, row.outcome); r.state = 'DONE'; lanes.delete(r.lane);
    } else if (row.kind === 'WITHDRAW') {
      const r = requests.get(row.request); assert.ok(r.state === 'RESERVED' || r.state === 'WAITING');
      assert.equal(row.recordedWait, r.state === 'WAITING'); assert.equal(fifo.shift(), row.request);
      if (row.recordedWait) end(wait, r.waitAt, at, 'REJECTED');
      r.state = 'WITHHELD'; lanes.delete(r.lane); withdrawals++;
    } else {
      assert.equal(row.kind, 'FINALIZE'); assert.equal(i, capture.events.length - 1);
    }
  }
  assert.equal(fifo.length, 0); assert.equal(lanes.size, 0);
  assert.equal(requests.size, result.requestedMeasuredCalls);
  assert.equal(entries, result.sourceExecuteEntries); assert.equal(withdrawals, result.preEntryWithheld);
  assert.deepEqual(plain(result.queueWaitRecording), expected(wait, plain(capture.limits)));
  assert.deepEqual(plain(result.dispatchedCallRecording), expected(source, plain(capture.limits)));
  const core = checkCore(F({ trace: capture.coreParentTimingTrace, recording: result.core.recording }));
  assert.equal(core.status, 'COMPLETE_MATCHING_DECLARED_PARENT_TRACE_DATA');
  for (const k of ['nativeEventsAuthenticated', 'nativeResourcesQualified', 'sustainableCapacityQualified'])
    assert.equal(capture[k], false);
  assert.equal(capture.authority, 'NONE');
  return { requests: requests.size, entries, withdrawals };
}
function traced(options = {}) { return fixture({ ...options, factory: create }); }

test('private factory adds one explicit capability but remains inert before run', () => {
  const h = traced();
  assert.deepEqual(Object.keys(h.owner), ['run', 'stop', 'inspect', 'captureTimingEvidence']);
  assert.deepEqual(Object.keys(fixture().owner), ['run', 'stop', 'inspect']);
  assert.throws(() => h.owner.captureTimingEvidence(), TypeError);
  assert.equal(h.clockCalls, 0); assert.equal(h.timers.length, 0); assert.deepEqual(h.events, []);
});
test('genuine private core plus queue and source events independently reproduce every recorder field', async () => {
  const h = traced(), s = await complete(h), capture = h.owner.captureTimingEvidence();
  assert.deepEqual(verify(capture, s), { requests: 4, entries: 4, withdrawals: 0 });
  assert.equal(capture.events.length, 17); assert.equal(capture.maximumEvents, 513);
  assert.equal(h.owner.captureTimingEvidence(), capture);
});
test('private capture adds zero clock scheduler cancel or source calls versus ordinary selection', async () => {
  const a = fixture(), b = traced(), sa = await complete(a), sb = await complete(b);
  assert.deepEqual(plain(sa), plain(sb)); assert.equal(a.clockCalls, b.clockCalls);
  assert.equal(a.timers.length, b.timers.length); assert.equal(a.cancelCalls, b.cancelCalls);
  assert.deepEqual(a.entries.map(e => [e.lane, String(e.at)]), b.entries.map(e => [e.lane, String(e.at)]));
  const before = b.clockCalls; b.owner.captureTimingEvidence(); assert.equal(b.clockCalls, before);
});
test('ordinary reports and inspect do not contain raw paced or core event arrays', async () => {
  const h = traced(), s = await complete(h);
  for (const value of [s, h.owner.inspect()]) {
    const raw = JSON.stringify(value);
    for (const marker of ['pacedTimingTraceVersion', 'WAIT_BEGIN', 'coreParentTimingTrace', '"events"'])
      assert.equal(raw.includes(marker), false);
  }
  assert.ok(h.owner.captureTimingEvidence().coreParentTimingTrace.events.length > 0);
});
test('withdrawn queued request remains absent from the genuine dispatched source series', async () => {
  const h = traced({ plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 1 } }), p = h.owner.run();
  await ticks(); h.owner.stop(); await ticks(); const s = await p;
  assert.deepEqual(verify(h.owner.captureTimingEvidence(), s), { requests: 2, entries: 1, withdrawals: 1 });
});
test('clock reentry before wait admission records reservation and withdrawal without fabricated wait latency', async () => {
  const h = traced({ now(host) {
    if (host.owner && !host.clockStopped && host.owner.inspect().pendingQueuedCalls) {
      host.clockStopped = true; host.owner.stop();
    }
    return ++host.time;
  } }), p = h.owner.run();
  await ticks(); const s = await p, capture = h.owner.captureTimingEvidence();
  assert.deepEqual(verify(capture, s), { requests: 1, entries: 0, withdrawals: 1 });
  assert.deepEqual(capture.events.map(r => r.kind), ['REQUEST', 'WITHDRAW', 'FINALIZE']);
  assert.equal(capture.events[1].recordedWait, false);
});
test('declared source rejection keeps separate successful and terminal percentile denominators', async () => {
  const h = traced({ execute(lane, command) {
    return Promise.resolve(command.cohort === 'MEASUREMENT' && lane === 0 ? 'REJECTED' : 'SUCCEEDED');
  } }), s = await complete(h), capture = h.owner.captureTimingEvidence();
  verify(capture, s);
  assert.equal(s.dispatchedCallRecording.phases.FUNDED_CALL.rejected, 2);
  assert.equal(s.queueWaitRecording.phases.FUNDED_CALL.rejected, 0);
});
test('late wakeup trace shows one actual source entry, no replayed missed slots', async () => {
  const h = traced(), p = h.owner.run(); await ticks();
  const timer = h.pacing()[0]; h.fire(timer, timer.due + 30n * 1000000n); await ticks();
  assert.equal(h.entries.length, 2); await complete(h); const s = await p;
  verify(h.owner.captureTimingEvidence(), s);
});
test('forced drain freezes private incomplete evidence and late completion cannot append or upgrade it', async () => {
  const cap = deferred(), h = traced({ plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 1 },
    execute() { return cap.promise; } }), p = h.owner.run();
  await ticks(); h.owner.stop(); await ticks(); h.fireDrain(); await ticks();
  const s = await p, capture = h.owner.captureTimingEvidence(), raw = JSON.stringify(capture);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(capture.unknown, true);
  assert.equal(capture.events.at(-1).kind, 'FINALIZE');
  assert.equal(capture.events.some(r => r.kind === 'SOURCE_TERMINAL'), false);
  cap.resolve('SUCCEEDED'); await ticks();
  assert.equal(h.owner.inspect().pendingSourceObservations, 0);
  assert.equal(h.owner.captureTimingEvidence(), capture); assert.equal(JSON.stringify(capture), raw);
  assert.throws(() => capture.events.push({}), TypeError);
});
for (const mode of ['throw', 'thenable', 'subclass', 'undefined']) {
  test('unobservable ' + mode + ' retains explicit private uncertainty, never error payload or terminal success', async () => {
    const h = traced({ execute(lane, command) {
      if (command.cohort !== 'MEASUREMENT') return Promise.resolve('SUCCEEDED');
      if (mode === 'throw') throw new Error('PRIVATE_SOURCE_ERROR');
      if (mode === 'thenable') return { then() { throw new Error('MUST_NOT_RUN'); } };
      if (mode === 'subclass') return new (class extends Promise {})(yes => yes('SUCCEEDED'));
      return undefined;
    } }), p = h.owner.run(); await ticks();
    const s = await p, capture = h.owner.captureTimingEvidence();
    assert.equal(capture.unknown, true); assert.equal(s.pendingSourceObservations, 1);
    assert.equal(capture.events.filter(r => r.kind === 'UNOBSERVABLE').length, 1);
    assert.equal(capture.events.some(r => r.kind === 'SOURCE_TERMINAL'), false);
    assert.equal(JSON.stringify(capture).includes('PRIVATE_SOURCE_ERROR'), false);
  });
}
test('clock failure with unavailable genuine core trace still finalizes one private UNKNOWN capsule', async () => {
  const h = traced({ now(host) { return host.badClock ? 0n : ++host.time; },
    execute(lane, command, host) {
      if (command.cohort === 'MEASUREMENT') host.badClock = true;
      return Promise.resolve('SUCCEEDED');
    } }), p = h.owner.run();
  await ticks(); if (!h.owner.inspect().finalCached) { h.owner.stop(); await ticks(); }
  if (!h.owner.inspect().finalCached) { h.fireDrain(); await ticks(); }
  const s = await p, capture = h.owner.captureTimingEvidence();
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(capture.unknown, true);
  assert.equal(capture.coreParentTimingTrace, null); assert.equal(h.owner.captureTimingEvidence(), capture);
});
test('early timer uncertainty is not upgraded by a complete-looking underlying core trace', async () => {
  const h = traced(), p = h.owner.run(); await ticks();
  const timer = h.pacing()[0]; h.fire(timer, timer.due - 2000000n); await ticks();
  const s = await p, capture = h.owner.captureTimingEvidence();
  assert.equal(s.issue, 'PACING_EARLY_TIMER_UNKNOWN'); assert.equal(capture.unknown, true);
  assert.equal(h.entries.length, 1); assert.equal(capture.events.at(-1).kind, 'FINALIZE');
});
test('stop-before-run is not a fabricated completed measurement and capture arity is strict', async () => {
  const h = traced(), p = h.owner.stop(); await ticks(); const s = await p, capture = h.owner.captureTimingEvidence();
  assert.equal(s.sourceExecuteEntries, 0); assert.equal(capture.unknown, true);
  assert.deepEqual(capture.events.map(e => e.kind), ['FINALIZE']);
  assert.throws(() => h.owner.captureTimingEvidence(1), TypeError);
  assert.equal(h.owner.captureTimingEvidence(), capture);
});
test('each private row and the shared genuine core trace are frozen and contain only bounded DATA', async () => {
  const h = traced(), s = await complete(h), capture = h.owner.captureTimingEvidence(); verify(capture, s);
  assert.ok(Object.isFrozen(capture.events)); assert.ok(Object.isFrozen(capture.coreParentTimingTrace));
  assert.ok(Object.isFrozen(capture.coreParentTimingTrace.events));
  for (const row of capture.events) {
    assert.ok(Object.isFrozen(row));
    for (const value of Object.values(row)) assert.ok(value === null || ['string', 'number', 'boolean'].includes(typeof value));
    for (const field of ['authorizationKey', 'transaction', 'grantId', 'requestId', 'address', 'balance', 'error', 'command'])
      assert.equal(Object.hasOwn(row, field), false);
  }
  assert.throws(() => { capture.events[0].kind = 'CHANGED'; }, TypeError);
});
test('full 4080-entry private DATA stress remains bounded and independently matches genuine recorders', async () => {
  const h = traced({ lanes: 16, gap: 1, limits: { maxSamplesPerPhase: 4096, maxInFlightPerPhase: 16 },
    plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 255, maxLedgerTransactionsPerOperation: 1, measurementWindowMs: 60000 } });
  const s = await complete(h, 4100), capture = h.owner.captureTimingEvidence();
  assert.deepEqual(verify(capture, s), { requests: 4080, entries: 4080, withdrawals: 0 });
  assert.equal(capture.events.length, 16321); assert.equal(capture.maximumEvents, 16385);
  assert.ok(capture.coreParentTimingTrace.events.length <= 7 * 4096 + 4);
});
test('private factory configuration rejects without entering a host or a fallback owner', () => {
  assert.throws(() => create(), TypeError); assert.throws(() => create({}, {}), TypeError);
  assert.throws(() => create(new Proxy({}, { ownKeys() { throw new Error('MUST_NOT_RUN'); } })), TypeError);
});
