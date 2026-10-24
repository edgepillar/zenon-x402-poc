import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceCreditCapacityPacedWorkloadOwnerCore as create } from '../src/service-credit-capacity-paced-workload-owner-core.js';

if (process.version !== 'v24.19.0' || process.env.X402_CAPACITY_PACED_DATA_SELECTION !== 'paced-source-owner-data-v1')
  throw new TypeError('PACED_SOURCE_DATA_SELECTION_REQUIRED');
console.log('# paced-source-owner-data-runtime ' + JSON.stringify({ Node: process.version,
  platform: process.platform, arch: process.arch, declaredClockAndHost: true, nativeEffects: false }));

const F = Object.freeze, M = 1000000n;
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  promise.catch(() => undefined);
  return { promise, resolve, reject };
}
async function ticks(n = 70) { for (let i = 0; i < n; i++) await Promise.resolve(); }
function balances() {
  return F({ observed: F({ availableUnits: 8n, heldUnits: 0n, consumedUnits: 2n }),
    expected: F({ availableUnits: 8n, heldUnits: 0n, consumedUnits: 2n }) });
}
function fixture(options = {}) {
  const h = { time: 100n, events: [], entries: [], timers: [], calls: 0, owner: null, clockCalls: 0, cancelCalls: 0 };
  const config = {
    plan: { warmupCallsPerLane: 1, measurementCallsPerLane: 2, setupBudgetMs: 500,
      measurementWindowMs: 100, drainGraceMs: 10, maxLedgerTransactionsPerOperation: 3, ...options.plan },
    recordingLimits: { maxSamplesPerPhase: 128, maxInFlightPerPhase: 4, ...options.limits },
    pacing: { minimumStartGapMs: options.gap ?? 5 },
    runtime: {
      monotonicNowNs: F(function now() {
        h.clockCalls++;
        return options.now ? options.now(h) : ++h.time;
      }),
      schedule: F(function schedule(callback, milliseconds) {
        const timer = { callback, milliseconds, kind: callback.name === 'pacingTick' ? 'pacing' : 'core',
          due: h.time + BigInt(milliseconds) * M, token: F({ n: h.timers.length + 1 }), cancelled: false, fired: false };
        h.timers.push(timer);
        return options.schedule ? options.schedule(timer, h) : timer.token;
      }),
      cancel: F(function cancel(token) {
        h.cancelCalls++;
        const timer = h.timers.find(t => t.token === token);
        if (timer) timer.cancelled = true;
        return options.cancel ? options.cancel(timer, h) : undefined;
      }),
    },
    lanes: F(Array.from({ length: options.lanes ?? 2 }, (_, lane) => F({
      fund: F(function fund(command) {
        h.events.push({ kind: 'fund', lane, command, receiver: this });
        return options.fund ? options.fund(lane, command, h) : Promise.resolve('SUCCEEDED');
      }),
      execute: F(function execute(command) {
        h.events.push({ kind: 'execute', lane, command, receiver: this });
        if (command.cohort === 'MEASUREMENT') h.entries.push({ lane, at: h.time, command });
        h.calls++;
        return options.execute ? options.execute(lane, command, h) : Promise.resolve('SUCCEEDED');
      }),
      checkBalances: F(function checkBalances() {
        h.events.push({ kind: 'balance', lane, receiver: this });
        return Promise.resolve(balances());
      }),
      openMeasurementWindow: F(function openMeasurementWindow() {
        h.events.push({ kind: 'open', lane, receiver: this });
        return Promise.resolve(undefined);
      }),
      stopMeasurementWindow: F(function stopMeasurementWindow() {
        h.events.push({ kind: 'stop', lane, receiver: this });
        return Promise.resolve(undefined);
      }),
      close: F(function close() {
        h.events.push({ kind: 'close', lane, receiver: this });
        return options.close ? options.close(lane, h) : Promise.resolve(undefined);
      }),
    }))),
  };
  h.fire = (timer, at = timer.due, args = []) => {
    assert.equal(timer.cancelled, false); assert.equal(timer.fired, false);
    h.time = at; timer.fired = true;
    Reflect.apply(timer.callback, undefined, args);
  };
  h.pacing = () => h.timers.filter(t => t.kind === 'pacing' && !t.cancelled && !t.fired);
  h.fireDrain = () => {
    const timer = h.timers.find(t => t.kind === 'core' && t.milliseconds === config.plan.drainGraceMs && !t.cancelled && !t.fired);
    assert.ok(timer); h.fire(timer);
  };
  if (options.before) options.before(config, h);
  h.config = config; h.owner = (options.factory ?? create)(config);
  return h;
}
async function complete(h, bound = 40) {
  const promise = h.owner.run();
  for (let i = 0; i < bound; i++) {
    await ticks();
    if (h.owner.inspect().finalCached) return promise;
    const timers = h.pacing();
    assert.ok(timers.length <= 1, 'more than one live pacing timer');
    if (timers.length) h.fire(timers[0]);
  }
  throw new Error('BOUNDED_DATA_FIXTURE_DID_NOT_FINISH');
}
const phase = s => s.phases.FUNDED_CALL;
function assertData(s) {
  assert.equal(s.authority, 'NONE');
  for (const key of ['nativeEventsAuthenticated', 'nativeResourcesQualified', 'fixedOfferedRateQualified',
    'sustainableCapacityQualified', 'productionQualified']) assert.equal(s[key], false);
}

test('paced construction is inert and retains the genuine owner without host entry', () => {
  const h = fixture();
  assert.deepEqual(h.events, []); assert.equal(h.clockCalls, 0); assert.equal(h.timers.length, 0);
  assert.equal(h.owner.inspect().core.phase, 'CREATED');
});

// Reuse explicit DATA host fixtures, not a copied SDK/application substitute.
export { fixture, complete, ticks, deferred };
test('one funding and unchanged warmup precede globally spaced measured calls', async () => {
  const h = fixture(), s = await complete(h);
  assert.equal(s.outcome, 'OBSERVED_OWNERS_RETURNED'); assertData(s);
  assert.equal(h.events.filter(e => e.kind === 'fund').length, 2);
  assert.equal(h.events.filter(e => e.kind === 'execute' && e.command.cohort === 'WARMUP').length, 2);
  assert.equal(s.sourceExecuteEntries, 4); assert.equal(s.requestedMeasuredCalls, 4);
  assert.equal(s.preEntryWithheld, 0); assert.equal(s.core.balanceReadAttempts, 6);
  assert.equal(s.core.returnedCloses, 2); assert.equal(s.pendingSourceObservations, 0);
  for (let i = 1; i < h.entries.length; i++) assert.ok(h.entries[i].at - h.entries[i - 1].at >= 5n * M);
  assert.deepEqual(h.entries.map(e => e.lane), [0, 1, 0, 1]);
});
test('separate queue and dispatched-call distributions do not call queue delay API latency', async () => {
  const h = fixture(), s = await complete(h);
  const q = phase(s.queueWaitRecording), a = phase(s.dispatchedCallRecording);
  assert.equal(q.succeeded, 4); assert.equal(a.succeeded, 4);
  assert.ok(BigInt(q.terminalLatencyNanoseconds.max) >= 5n * M);
  assert.ok(BigInt(a.terminalLatencyNanoseconds.max) < 100n);
  assert.ok(BigInt(s.core.recording.cohorts.MEASUREMENT.phases.FUNDED_CALL.terminalLatencyNanoseconds.max) >= 5n * M);
  assert.equal(s.coreLatenciesIncludePacingWait, true); assert.equal(s.sourceLatencyExcludesPacingWait, true);
});
test('a late wakeup enters only one original and anchors a fresh future gap without catchup burst', async () => {
  const h = fixture({ plan: { warmupCallsPerLane: 0 } });
  h.owner.run(); await ticks();
  assert.equal(h.entries.length, 1); assert.equal(h.pacing().length, 1);
  const t = h.pacing()[0]; h.fire(t, t.due + 30n * M); await ticks();
  assert.equal(h.entries.length, 2); assert.equal(h.pacing().length, 1);
  assert.equal(h.pacing()[0].milliseconds, 5);
  await complete(h);
});
test('busy lane is never overlapped or replaced while independent lane can enter', async () => {
  const gates = [];
  const h = fixture({ plan: { warmupCallsPerLane: 0 }, execute(lane, command) {
    const cap = deferred(); gates.push({ lane, command, cap }); return cap.promise;
  } });
  const p = h.owner.run(); await ticks();
  assert.equal(gates.length, 1);
  h.fire(h.pacing()[0]); await ticks(); assert.equal(gates.length, 2);
  assert.equal(new Set(gates.map(g => g.lane)).size, 2);
  assert.equal(h.pacing().length, 0); assert.equal(h.owner.inspect().pendingSourceObservations, 2);
  gates[0].cap.resolve('SUCCEEDED'); await ticks();
  assert.equal(h.entries.length, 2);
  h.fire(h.pacing()[0]); await ticks(); assert.equal(gates.length, 3);
  assert.equal(gates[2].lane, gates[0].lane);
  gates[1].cap.resolve('SUCCEEDED'); await ticks(); h.fire(h.pacing()[0]); await ticks();
  gates[2].cap.resolve('SUCCEEDED'); gates[3].cap.resolve('SUCCEEDED'); await ticks();
  assert.equal((await p).outcome, 'OBSERVED_OWNERS_RETURNED');
});
test('forwarded exact original command keeps the genuine operation-scoped ledger capability', async () => {
  const commands = [];
  const h = fixture({ execute(lane, command, host) {
    commands.push(command); assert.ok(Object.isFrozen(command));
    const observed = command.beginLedgerTransaction(); host.time += 3n; observed.finish('SUCCEEDED');
    return Promise.resolve('SUCCEEDED');
  } });
  const s = await complete(h);
  assert.equal(s.core.ledgerBoundariesStarted, 6);
  assert.equal(new Set(commands).size, 6);
  assert.ok(h.events.every(e => e.receiver === undefined));
  assert.equal(h.entries[0].command, commands[2]);
});
test('manual stop withdraws queued originals without claiming they entered the source', async () => {
  const h = fixture({ plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 1 } });
  const p = h.owner.run(); await ticks(); const timer = h.pacing()[0];
  assert.equal(h.entries.length, 1); assert.equal(h.owner.inspect().pendingQueuedCalls, 1);
  assert.equal(h.owner.stop(), p); await ticks(); const s = await p;
  assert.equal(s.preEntryWithheld, 1); assert.equal(s.sourceExecuteEntries, 1);
  assert.equal(phase(s.dispatchedCallRecording).entered, 1);
  assert.equal(phase(s.queueWaitRecording).rejected, 1);
  assert.equal(s.core.recording.cohorts.MEASUREMENT.phases.FUNDED_CALL.rejected, 1);
  assert.equal(timer.cancelled, true); assert.equal(h.pacing().length, 0);
  timer.callback(); await ticks(); assert.equal(h.entries.length, 1);
  assertData(s);
});
test('stop marks service windows before an entered source settles and retains HELD after drain expiry', async () => {
  const gate = deferred();
  const h = fixture({ plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 1 },
    execute() { return gate.promise; } });
  const p = h.owner.run(); await ticks(); h.owner.stop(); await ticks();
  assert.equal(h.events.filter(e => e.kind === 'stop').length, 2);
  assert.equal(h.events.filter(e => e.kind === 'close').length, 0);
  h.fireDrain(); await ticks(); const s = await p;
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.pendingSourceObservations, 1);
  assert.equal(s.dispatchedCallRecording.recordingState, 'INCOMPLETE');
  assert.equal(h.events.filter(e => e.kind === 'close').length, 2);
  gate.resolve('SUCCEEDED'); await ticks();
  assert.equal(h.owner.inspect().pendingSourceObservations, 0);
  assert.equal(await h.owner.run(), s); assert.equal(s.pendingSourceObservations, 1);
  assert.equal(h.entries.length, 1); assertData(s);
});
test('measurement deadline cancels the sole pacing waiter instead of extending the window', async () => {
  const h = fixture({ plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 2 } });
  const p = h.owner.run(); await ticks();
  const window = h.timers.find(t => t.kind === 'core' && t.milliseconds === 100 && !t.cancelled && !t.fired);
  h.fire(window); await ticks(); const s = await p;
  assert.equal(s.core.reason, 'MEASUREMENT_WINDOW_ELAPSED');
  assert.equal(h.entries.length, 1); assert.ok(s.preEntryWithheld >= 1); assert.equal(h.pacing().length, 0);
});
test('stop before run closes only the already-captured owners without funding or dispatch', async () => {
  const h = fixture(), p = h.owner.stop(); await ticks(); const s = await p;
  assert.equal(h.owner.run(), p); assert.equal(s.sourceExecuteEntries, 0);
  assert.equal(h.events.filter(e => e.kind === 'fund' || e.kind === 'execute' || e.kind === 'open').length, 0);
  assert.equal(h.events.filter(e => e.kind === 'close').length, 2);
});
test('reentrant run at funding observes the pre-reserved outer Promise', async () => {
  let reentered;
  const h = fixture({ fund(lane, command, host) {
    if (lane === 0) reentered = host.owner.run();
    return Promise.resolve('SUCCEEDED');
  } });
  const p = h.owner.run(); assert.equal(reentered, p);
  await complete(h); assert.equal(h.owner.run(), p); assert.equal(h.owner.stop(), p);
});
test('reentrant source stop prevents all later admission without replacing the entered original', async () => {
  let stop;
  const h = fixture({ plan: { warmupCallsPerLane: 0 }, execute(lane, command, host) {
    stop = host.owner.stop(); return Promise.resolve('SUCCEEDED');
  } });
  const p = h.owner.run(); await ticks(); const s = await p;
  assert.equal(stop, p); assert.equal(h.entries.length, 1); assert.equal(s.sourceExecuteEntries, 1);
  assert.equal(h.events.filter(e => e.kind === 'fund').length, 2);
});
test('stop during pacing timer installation cancels the exact late returned token once', async () => {
  let token;
  const h = fixture({ plan: { warmupCallsPerLane: 0 }, schedule(t, host) {
    if (t.kind === 'pacing') { token = t.token; host.owner.stop(); }
    return t.token;
  } });
  const p = h.owner.run(); await ticks(); const s = await p;
  assert.equal(h.entries.length, 1); assert.ok(token);
  assert.equal(h.timers.find(t => t.token === token).cancelled, true);
  assert.equal(s.pendingQueuedCalls, 0);
});
test('synchronous pacing timer delivery refuses without calling the next source', async () => {
  const h = fixture({ schedule(t) { if (t.kind === 'pacing') t.callback(); return t.token; } });
  const p = h.owner.run(); await ticks(); const s = await p;
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.issue, 'PACING_SYNCHRONOUS_TIMER_UNKNOWN');
  assert.equal(h.entries.length, 1); assert.equal(h.pacing().length, 0);
});
test('early pacing delivery is UNKNOWN instead of an automatically repeated timer', async () => {
  const h = fixture(); const p = h.owner.run(); await ticks();
  const timer = h.pacing()[0]; h.fire(timer, timer.due - 2n * M); await ticks(); const s = await p;
  assert.equal(s.issue, 'PACING_EARLY_TIMER_UNKNOWN'); assert.equal(s.outcome, 'HELD_UNKNOWN');
  assert.equal(h.entries.length, 1); assert.equal(h.timers.filter(t => t.kind === 'pacing').length, 1);
});
test('wrong timer callback arity refuses with no extra source entry', async () => {
  const h = fixture(), p = h.owner.run(); await ticks();
  h.fire(h.pacing()[0], h.pacing()[0].due, [1]); await ticks(); const s = await p;
  assert.equal(s.issue, 'PACING_TIMER_PROTOCOL_UNKNOWN'); assert.equal(h.entries.length, 1);
});
test('pacing scheduler throw stays UNKNOWN and does not retry', async () => {
  const h = fixture({ schedule(t) { if (t.kind === 'pacing') throw new Error('PRIVATE_PAYLOAD'); return t.token; } });
  const p = h.owner.run(); await ticks(); const s = await p;
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.issue, 'PACING_TIMER_SETUP_UNKNOWN');
  assert.equal(h.entries.length, 1); assert.equal(JSON.stringify(s).includes('PRIVATE_PAYLOAD'), false);
});
test('timer token reuse across core and pacer is refused before unrelated cancellation', async () => {
  let setup;
  const h = fixture({ schedule(t) {
    if (!setup) setup = t.token;
    return t.kind === 'pacing' ? setup : t.token;
  } });
  const p = h.owner.run(); await ticks(); const s = await p;
  assert.equal(s.issue, 'PACING_TIMER_SETUP_UNKNOWN'); assert.equal(s.outcome, 'HELD_UNKNOWN');
  assert.equal(h.entries.length, 1);
});
test('non-void pacing cancellation cannot masquerade as clean closure', async () => {
  const h = fixture({ cancel(t) { return t?.kind === 'pacing' ? true : undefined; } });
  const p = h.owner.run(); await ticks(); h.owner.stop(); await ticks(); const s = await p;
  assert.equal(s.issue, 'PACING_CANCEL_UNKNOWN'); assert.equal(s.outcome, 'HELD_UNKNOWN');
});
test('clock regression stops admission while retaining no success qualification', async () => {
  const h = fixture({ now(host) { return host.badClock ? 0n : ++host.time; },
    execute(lane, command, host) { if (command.cohort === 'MEASUREMENT') host.badClock = true; return Promise.resolve('SUCCEEDED'); } });
  const p = h.owner.run(); await ticks();
  if (!h.owner.inspect().finalCached) { h.owner.stop(); await ticks(); }
  if (!h.owner.inspect().finalCached) { h.fireDrain(); await ticks(); }
  const s = await p;
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(h.entries.length, 1); assertData(s);
});
for (const [name, value] of [['thenable', { then() { throw new Error('MUST_NOT_RUN'); } }],
  ['subclass', class Other extends Promise {}], ['plain', 'SUCCEEDED'], ['undefined', undefined]]) {
  test('unobservable ' + name + ' retains an UNKNOWN source observation slot', async () => {
    const h = fixture({ execute(lane, command) {
      if (command.cohort !== 'MEASUREMENT') return Promise.resolve('SUCCEEDED');
      return name === 'subclass' ? new value(yes => yes('SUCCEEDED')) : value;
    } });
    const p = h.owner.run(); await ticks(); const s = await p;
    assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.pendingSourceObservations, 1);
    assert.equal(s.issue, 'SOURCE_PROMISE_UNKNOWN'); assert.equal(h.entries.length, 1); assertData(s);
  });
}
test('source synchronous throw retains unobservability instead of claiming cancellation', async () => {
  const h = fixture({ execute(lane, command) {
    if (command.cohort === 'MEASUREMENT') throw new Error('PRIVATE_OPERATION_ERROR');
    return Promise.resolve('SUCCEEDED');
  } });
  const p = h.owner.run(); await ticks(); const s = await p;
  assert.equal(s.pendingSourceObservations, 1); assert.equal(s.outcome, 'HELD_UNKNOWN');
  assert.equal(JSON.stringify(s).includes('PRIVATE_OPERATION_ERROR'), false);
});
for (const [name, produce] of [
  ['rejection', () => Promise.reject(new Error('PRIVATE_REJECTION'))],
  ['unknown', () => Promise.resolve('UNKNOWN')],
  ['invalid-outcome', () => Promise.resolve(true)],
]) {
  test('observed ' + name + ' stops future admission without forgetting actual settlement', async () => {
    const h = fixture({ execute(lane, command) { return command.cohort === 'MEASUREMENT' ? produce() : Promise.resolve('SUCCEEDED'); } });
    const p = h.owner.run(); await ticks(); const s = await p;
    assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.pendingSourceObservations, 0);
    assert.equal(s.issue, 'SOURCE_OUTCOME_UNKNOWN'); assert.equal(h.entries.length, 1); assertData(s);
  });
}
test('configuration is detached before trusted work begins', async () => {
  const h = fixture(); h.config.pacing.minimumStartGapMs = 999; h.config.plan.measurementCallsPerLane = 100;
  h.config.runtime.schedule = () => { throw new Error('NOT_CAPTURED'); };
  const s = await complete(h);
  assert.equal(s.minimumStartGapMs, 5); assert.equal(s.sourceExecuteEntries, 4);
});
test('sixteen real lane slots remain FIFO and bounded by one live pacing timer', async () => {
  const h = fixture({ lanes: 16, plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 1, maxLedgerTransactionsPerOperation: 1 },
    limits: { maxInFlightPerPhase: 16 } });
  const s = await complete(h);
  assert.equal(s.sourceExecuteEntries, 16); assert.ok(s.peakQueuedCalls <= 16);
  assert.deepEqual(h.entries.map(e => e.lane), Array.from({ length: 16 }, (_, i) => i));
  assert.equal(s.maximumLivePacingTimers, 1); assertData(s);
});
for (const value of [0, -0, -1, true, 1.5, 1001, '5', null, Infinity]) {
  test('invalid minimum gap ' + String(value) + ':' + typeof value + ' is inertly rejected', () => {
    let h;
    assert.throws(() => fixture({ gap: value, before(c, host) { h = host; c.pacing.minimumStartGapMs = value; } }), TypeError);
    assert.deepEqual(h.events, []); assert.equal(h.clockCalls, 0);
  });
}
for (const [name, alter] of [
  ['unknown configuration field', c => { c.extra = true; }],
  ['accessor pacing', c => { Object.defineProperty(c, 'pacing', { get() { throw new Error('MUST_NOT_RUN'); }, enumerable: true }); }],
  ['proxy configuration', c => new Proxy(c, { ownKeys() { throw new Error('MUST_NOT_RUN'); } })],
  ['duplicate lane', c => { c.lanes = F([c.lanes[0], c.lanes[0]]); }],
  ['aliased source function', c => { c.lanes = F([F({ ...c.lanes[0], execute: c.lanes[0].fund })]); }],
  ['unfrozen source function', c => { c.runtime.monotonicNowNs = () => 0n; }],
  ['unfrozen lane array', c => { c.lanes = [...c.lanes]; }],
]) {
  test(name + ' rejects before host capabilities', () => {
    let captured;
    assert.throws(() => fixture({ before(c, h) {
      captured = h;
      const returned = alter(c);
      if (returned) create(returned);
    } }), TypeError);
    assert.equal(captured.clockCalls, 0); assert.deepEqual(captured.events, []);
  });
}
test('wrong public method arity has no admission or hidden recovery effect', async () => {
  const h = fixture();
  await assert.rejects(h.owner.run(1), TypeError); await assert.rejects(h.owner.stop(1), TypeError);
  assert.throws(() => h.owner.inspect(1), TypeError);
  assert.deepEqual(h.events, []); assert.equal(h.clockCalls, 0);
});
test('Promise own-then accessor is never invoked or assimilated', async () => {
  let hooks = 0;
  const h = fixture({ execute(lane, command) {
    const value = Promise.resolve('SUCCEEDED');
    if (command.cohort === 'MEASUREMENT') Object.defineProperty(value, 'then', { get() { hooks++; throw new Error('MUST_NOT_RUN'); } });
    return value;
  } });
  const p = h.owner.run(); await ticks(); const s = await p;
  assert.equal(hooks, 0); assert.equal(s.pendingSourceObservations, 1); assert.equal(s.outcome, 'HELD_UNKNOWN');
});
test('Promise constructor accessor is never invoked while refusing an unobservable return', async () => {
  let hooks = 0;
  const h = fixture({ execute(lane, command) {
    const value = Promise.resolve('SUCCEEDED');
    if (command.cohort === 'MEASUREMENT') Object.defineProperty(value, 'constructor', { get() { hooks++; throw new Error('MUST_NOT_RUN'); } });
    return value;
  } });
  const p = h.owner.run(); await ticks(); const s = await p;
  assert.equal(hooks, 0); assert.equal(s.pendingSourceObservations, 1); assert.equal(s.outcome, 'HELD_UNKNOWN');
});
test('Promise proxy traps are not a compatibility or observation fallback', async () => {
  let hooks = 0;
  const h = fixture({ execute(lane, command) {
    const value = Promise.resolve('SUCCEEDED');
    return command.cohort === 'MEASUREMENT'
      ? new Proxy(value, { get() { hooks++; throw new Error('MUST_NOT_RUN'); } }) : value;
  } });
  const p = h.owner.run(); await ticks(); const s = await p;
  assert.equal(hooks, 0); assert.equal(s.pendingSourceObservations, 1); assert.equal(s.outcome, 'HELD_UNKNOWN');
});
test('clock reentry can withdraw a reserved waiter before any source entry', async () => {
  const h = fixture({ now(host) {
    if (host.owner && !host.stoppedByClock && host.owner.inspect().pendingQueuedCalls) {
      host.stoppedByClock = true; host.owner.stop();
    }
    return ++host.time;
  } });
  const p = h.owner.run(); await ticks(); const s = await p;
  assert.equal(h.stoppedByClock, true); assert.equal(s.requestedMeasuredCalls, 1);
  assert.equal(s.preEntryWithheld, 1); assert.equal(s.sourceExecuteEntries, 0);
  assert.equal(phase(s.dispatchedCallRecording).entered, 0); assert.equal(h.entries.length, 0);
  assert.equal(s.outcome, 'OBSERVED_OWNERS_RETURNED'); assertData(s);
});
test('end-of-range timestamps are not wrapped to create a new pacing gap', async () => {
  const h = fixture({ now() { return (1n << 128n) - 1000000n; } });
  const p = h.owner.run(); await ticks(); const s = await p;
  assert.equal(s.issue, 'PACING_CLOCK_RANGE_UNKNOWN'); assert.equal(s.outcome, 'HELD_UNKNOWN');
  assert.equal(h.entries.length, 0);
});
test('throwing cancellation reports UNKNOWN without entering a queued original', async () => {
  const h = fixture({ cancel(t) { if (t?.kind === 'pacing') throw new Error('PRIVATE_CANCEL'); } });
  const p = h.owner.run(); await ticks(); h.owner.stop(); await ticks(); const s = await p;
  assert.equal(s.issue, 'PACING_CANCEL_UNKNOWN'); assert.equal(s.outcome, 'HELD_UNKNOWN');
  assert.equal(h.entries.length, 1); assert.equal(JSON.stringify(s).includes('PRIVATE_CANCEL'), false);
});
test('unknown source-owner close preserves core HELD rather than pacing success', async () => {
  const h = fixture({ close() { return Promise.resolve(true); } }), s = await complete(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.core.outcome, 'HELD_UNKNOWN');
  assert.equal(s.core.unknownCloses, 2); assertData(s);
});
test('minimum-gap timers are cancelled after ordinary complete without residual pacing work', async () => {
  const h = fixture(), s = await complete(h);
  assert.equal(s.pacingTimersStarted, s.sourceExecuteEntries - 1);
  assert.equal(h.pacing().length, 0); assert.equal(h.owner.inspect().pacingTimerPending, false);
  assert.ok(h.timers.every(t => t.cancelled || t.fired));
});
test('full 4096-slot source plan processes 4080 measured originals with bounded lanes and no files', async () => {
  const h = fixture({ lanes: 16, gap: 1, limits: { maxSamplesPerPhase: 4096, maxInFlightPerPhase: 16 },
    plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 255, maxLedgerTransactionsPerOperation: 1,
      measurementWindowMs: 60000 } });
  const s = await complete(h, 4100);
  assert.equal(s.outcome, 'OBSERVED_OWNERS_RETURNED'); assert.equal(s.core.plannedCallsCompleted, true);
  assert.equal(s.sourceExecuteEntries, 4080); assert.equal(s.requestedMeasuredCalls, 4080);
  assert.equal(s.preEntryWithheld, 0); assert.ok(s.peakQueuedCalls <= 16);
  assert.equal(phase(s.dispatchedCallRecording).succeeded, 4080);
  assert.equal(h.events.filter(e => e.kind === 'fund').length, 16);
  assert.equal(h.events.filter(e => e.kind === 'balance').length, 48);
  assert.equal(h.owner.inspect().pendingSourceObservations, 0); assertData(s);
});
