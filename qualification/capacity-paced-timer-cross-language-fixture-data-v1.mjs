// Genuine paced source owner + recorders; synthetic DATA callbacks only.
// No native namespace, managed task, application/SDK, SQL, key, signature,
// nonce, host timer, socket or worker is constructed by this fixture producer.
import assert from 'node:assert/strict';
import { createServiceCreditCapacityPacedWorkloadOwnerCoreWithPrivateTimerTrace as create } from '../src/service-credit-capacity-paced-workload-owner-core.js';
import { captureServiceCreditCapacityPacedTimerEnvelopeData as capture } from '../src/service-credit-capacity-paced-timer-trace-data.js';

if (process.version !== 'v24.19.0' || process.env.X402_PACED_TIMER_PYTHON_FIXTURE_DATA !== 'paced-timer-cross-language-fixture-v1')
  throw new TypeError('PACED_TIMER_PYTHON_FIXTURE_DATA_SELECTION_REQUIRED');
const F = Object.freeze, M = 1000000n;
function freeze(value) { if (value && typeof value === 'object') { for (const v of Object.values(value)) freeze(v); F(value); } return value; }
async function ticks() { for (let i = 0; i < 100; i++) await Promise.resolve(); }
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
const units = F({ availableUnits: 8n, heldUnits: 0n, consumedUnits: 2n }), balances = F({ observed: units, expected: units });
function fixture(options = {}) {
  const h = { time: 100n, timers: [], calls: 0, clocks: 0, owner: null };
  const config = {
    plan: { warmupCallsPerLane: 1, measurementCallsPerLane: 2, setupBudgetMs: 500,
      measurementWindowMs: 100, drainGraceMs: 10, maxLedgerTransactionsPerOperation: 3, ...options.plan },
    recordingLimits: { maxSamplesPerPhase: 128, maxInFlightPerPhase: 4, ...options.limits },
    pacing: { minimumStartGapMs: options.gap ?? 5 },
    runtime: {
      monotonicNowNs: F(function now() { h.clocks++; return options.now ? options.now(h) : ++h.time; }),
      schedule: F(function schedule(callback, milliseconds) {
        const timer = { callback, milliseconds, kind: callback.name === 'pacingTick' ? 'pacing' : 'core',
          due: h.time + BigInt(milliseconds) * M, token: F({ n: h.timers.length + 1 }), cancelled: false, fired: false };
        h.timers.push(timer); return options.schedule ? options.schedule(timer, h) : timer.token;
      }),
      cancel: F(function cancel(token) { const timer = h.timers.find(t => t.token === token); assert.ok(timer); timer.cancelled = true; return options.cancel ? options.cancel(timer, h) : undefined; }),
    },
    lanes: F(Array.from({ length: options.lanes ?? 2 }, (_, lane) => F({
      fund: F(function fund(command) {
        if (options.ledger) { const observed = command.beginLedgerTransaction(); h.time += 3n; observed.finish('SUCCEEDED'); }
        return Promise.resolve('SUCCEEDED');
      }),
      execute: F(function execute(command) {
        h.calls++;
        if (options.execute) return options.execute(lane, command, h);
        const outcome = options.reject && command.cohort === 'MEASUREMENT' && lane === 0 ? 'REJECTED' : 'SUCCEEDED';
        if (options.ledger) { const observed = command.beginLedgerTransaction(); h.time += 3n; observed.finish(outcome); }
        return Promise.resolve(outcome);
      }),
      checkBalances: F(function checkBalances() { return Promise.resolve(balances); }),
      openMeasurementWindow: F(function openMeasurementWindow() { return Promise.resolve(undefined); }),
      stopMeasurementWindow: F(function stopMeasurementWindow() { return Promise.resolve(undefined); }),
      close: F(function close() { return Promise.resolve(undefined); }),
    }))),
  };
  h.fire = timer => { assert.equal(timer.cancelled, false); assert.equal(timer.fired, false);
    h.time = timer.due + BigInt(options.fireLateMs ?? 0) * M; timer.fired = true; timer.callback(); };
  h.config = config; h.owner = create(config);
  return h;
}
function expectations(h) {
  return freeze({ plan: { ...h.config.plan }, recordingLimits: { ...h.config.recordingLimits },
    laneIds: h.config.lanes.map((_, n) => 'lane.' + n), minimumStartGapMs: h.config.pacing.minimumStartGapMs,
    runId: 'a'.repeat(64), parentSourceRowsSha256: '0e0533ba2e3bfdf97b2670a0ee693c64ddc04ea93bf52b4e779d9d073cb51c90', childSourceRowsSha256: 'd756740994aeb53ebeee47320d732583d96381dfa8c00e18a30f414e70a77027' });
}
function packed(h, report, expected) {
  const clocks = h.clocks, calls = h.calls;
  const jsExpected = F({ plan: expected.plan, recordingLimits: expected.recordingLimits,
    laneCount: expected.laneIds.length, minimumStartGapMs: expected.minimumStartGapMs });
  const capsule = capture(F({ context: F({ runId: expected.runId, sourceRowsSha256: expected.parentSourceRowsSha256,
    childSourceRowsSha256: expected.childSourceRowsSha256, laneIds: expected.laneIds }),
    trace: h.owner.captureTimingEvidence(), timerTrace: h.owner.captureTimerEvidence(), report, expected: jsExpected }));
  assert.equal(h.clocks, clocks); assert.equal(h.calls, calls);
  return F({ capsule, report, expected });
}
async function complete(h) {
  const promise = h.owner.run();
  for (let i = 0; i < h.config.recordingLimits.maxSamplesPerPhase + 4; i++) {
    await ticks();
    if (h.owner.inspect().finalCached) return promise;
    const timers = h.timers.filter(t => t.kind === 'pacing' && !t.cancelled && !t.fired);
    assert.ok(timers.length <= 1);
    if (timers.length) h.fire(timers[0]);
  }
  throw new TypeError('BOUNDED_PACED_SOURCE_FIXTURE_NOT_COMPLETE');
}
const cases = {};
for (const [name, options] of [
  ['full', { ledger: true }], ['mixed', { ledger: true, reject: true }],
  ['lateTimer', { ledger: true, fireLateMs: 3 }],
  ['noTimer', { lanes: 1, execute(_lane, _command, h) { h.time += 20000000n; return Promise.resolve('SUCCEEDED'); } }],
  ['maximumCalls', { lanes: 16, gap: 1, limits: { maxSamplesPerPhase: 4096, maxInFlightPerPhase: 16 },
    plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 255, maxLedgerTransactionsPerOperation: 1, measurementWindowMs: 60000 } }],
  ['sixteenLanes', { lanes: 16, limits: { maxInFlightPerPhase: 16 }, gap: 1,
    plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 3, maxLedgerTransactionsPerOperation: 1 } }],
]) {
  const h = fixture(options), expected = expectations(h), report = await complete(h);
  cases[name] = packed(h, report, expected);
}
{
  const h = fixture({ plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 1 } }), expected = expectations(h);
  const promise = h.owner.run(); await ticks(); h.owner.stop(); await ticks();
  cases.withdrawal = packed(h, await promise, expected);
}
{
  const h = fixture({ now(host) {
    if (host.owner && !host.clockStopped && host.owner.inspect().pendingQueuedCalls) { host.clockStopped = true; host.owner.stop(); }
    return ++host.time;
  } }), expected = expectations(h), promise = h.owner.run(); await ticks();
  cases.preWaitWithdrawal = packed(h, await promise, expected);
}
{
  let original; const pending = deferred();
  const h = fixture({ lanes: 1, plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 1 },
    execute(lane, command) { original = command; return pending.promise; } }), expected = expectations(h);
  const promise = h.owner.run(); await ticks(); h.owner.stop(); await ticks();
  const ledger = original.beginLedgerTransaction(); h.time += 10n; ledger.finish('SUCCEEDED');
  pending.resolve('SUCCEEDED'); await ticks(); cases.postStopLedger = packed(h, await promise, expected);
}
const cleanNames = Object.keys(cases);
for (const name of cleanNames) {
  assert.equal(cases[name].capsule.status, 'MATCHING_DECLARED_PACED_TIMER_TRACE');
  assert.equal(cases[name].report.outcome, 'OBSERVED_OWNERS_RETURNED');
}
{
  const pending = deferred(), h = fixture({ lanes: 1, plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 1 },
    execute() { return pending.promise; } }), expected = expectations(h);
  const promise = h.owner.run(); await ticks(); h.owner.stop(); await ticks();
  const drain = h.timers.find(t => t.kind === 'core' && t.milliseconds === h.config.plan.drainGraceMs && !t.cancelled && !t.fired);
  assert.ok(drain); h.fire(drain); await ticks();
  const report = await promise, before = packed(h, report, expected);
  assert.equal(before.capsule.status, 'UNKNOWN_OR_MISMATCHED_PACED_TIMER_TRACE');
  assert.equal(before.capsule.check, null); assert.equal(before.capsule.parentCheck, null);
  const bytes = JSON.stringify(before); pending.resolve('SUCCEEDED'); await ticks();
  assert.equal(JSON.stringify(packed(h, report, expected)), bytes);
  cases.heldAfterLateCompletion = before;
}
for (const [name, options] of [
  ['earlyFireUnknown', { schedule(timer) { if (timer.kind === 'pacing') timer.callback(); return timer.token; } }],
  ['registrationUnknown', { schedule(timer) { if (timer.kind === 'pacing') throw new Error('SYNTHETIC_REGISTRATION_REFUSAL'); return timer.token; } }],
  ['cancelUnknown', { plan: { warmupCallsPerLane: 0 }, cancel(timer) { return timer.kind === 'pacing' ? false : undefined; } }],
]) {
  const h = fixture(options), expected = expectations(h), promise = h.owner.run(); await ticks();
  if (name === 'cancelUnknown') { h.owner.stop(); await ticks(); }
  const report = await promise, value = packed(h, report, expected);
  assert.equal(report.outcome, 'HELD_UNKNOWN'); assert.equal(value.capsule.check, null);
  assert.equal(value.capsule.parentCheck, null); assert.equal(value.capsule.status, 'UNKNOWN_OR_MISMATCHED_PACED_TIMER_TRACE');
  cases[name] = value;
}
const unknownNames = Object.keys(cases).filter(name => !cleanNames.includes(name));
assert.equal(cases.maximumCalls.capsule.check.pacedCheck.sourceEntriesChecked, 4080);
assert.equal(cases.maximumCalls.capsule.check.eventsChecked, 12238);
assert.equal(cases.noTimer.capsule.timerTrace.events.length, 1);
const result = F({ fixtureVersion: 1, kind: 'GENUINE_PACED_TIMER_SOURCE_SYNTHETIC_DATA_NOT_NATIVE_EVIDENCE',
  cleanScenarioNames: F(cleanNames), unknownScenarioNames: F(unknownNames), heldLateSnapshotUnchanged: true, cases: F(cases),
  SDK: false, SQLite: false, keys: false, signatures: false, nonceSearch: false, sockets: false,
  hostTimers: false, nativeChildren: false, authority: 'NONE' });
const encoded = JSON.stringify(result);
assert.ok(Buffer.byteLength(encoded) + 1 <= 8 * 1048576);
process.stdout.write(encoded + '\n');
