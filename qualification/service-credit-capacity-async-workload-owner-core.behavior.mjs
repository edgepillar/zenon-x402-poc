import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceCreditCapacityAsyncWorkloadOwnerCore as create } from '../src/service-credit-capacity-async-workload-owner-core.js';

if (process.version !== 'v24.19.0' || process.env.X402_CAPACITY_WORKLOAD_DATA_SELECTION !== 'owner-core-async-data-v2')
  throw new TypeError('CAPACITY_WORKLOAD_DATA_SELECTION_REQUIRED');
console.log('# capacity-async-workload-data-runtime ' + JSON.stringify({ Node: process.version,
  platform: process.platform, arch: process.arch, eventsDeclared: true, nativeEffects: false }));

const F = Object.freeze;
let hooks = 0;
function deferred() {
  let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  promise.catch(() => undefined); return { promise, resolve, reject };
}
async function ticks(n = 40) { for (let i = 0; i < n; i++) await Promise.resolve(); }
const equalBalances = () => F({ observed: F({ availableUnits: 8n, heldUnits: 0n, consumedUnits: 2n }),
  expected: F({ availableUnits: 8n, heldUnits: 0n, consumedUnits: 2n }) });

function fixture(options = {}) {
  const host = { events: [], timers: [], clockCalls: 0, scheduleCalls: 0, cancelCalls: 0,
    owner: null, time: 0n, controls: [], closeCalls: 0 };
  const config = {
    plan: { warmupCallsPerLane: 1, measurementCallsPerLane: 2, setupBudgetMs: 500, measurementWindowMs: 100,
      drainGraceMs: 10, maxLedgerTransactionsPerOperation: 3, ...options.plan },
    recordingLimits: { maxSamplesPerPhase: 128, maxInFlightPerPhase: 4, ...options.recordingLimits },
    runtime: {
      monotonicNowNs: F(function now() {
        host.clockCalls++; return options.now ? options.now(host) : ++host.time;
      }),
      schedule: F(function schedule(callback, budget) {
        host.scheduleCalls++;
        const token = F({ token: host.timers.length + 1 });
        const timer = { callback, budget, token, cancelled: false, fired: false };
        host.timers.push(timer);
        return options.schedule ? options.schedule(timer, host) : token;
      }),
      cancel: F(function cancel(token) {
        host.cancelCalls++;
        const timer = host.timers.find(t => t.token === token);
        if (timer) timer.cancelled = true;
        if (options.cancel) return options.cancel(token, host);
        return undefined;
      }),
    },
    lanes: F(Array.from({ length: options.laneCount ?? 2 }, (_, index) => F({
      fund: F(function fund(command) {
        host.events.push('fund:' + index); host.controls.push({ index, funding: true, command });
        return options.fund ? options.fund(index, command, host) : Promise.resolve('SUCCEEDED');
      }),
      execute: F(function execute(command) {
        host.events.push('call:' + index + ':' + command.cohort + ':' + command.ordinal);
        host.controls.push({ index, funding: false, command });
        return options.execute ? options.execute(index, command, host) : Promise.resolve('SUCCEEDED');
      }),
      checkBalances: F(function checkBalances() {
        host.events.push('balance:' + index);
        if (options.rawBalance) return options.rawBalance(index, host);
        // This DATA fixture explicitly returns the new Promise contract.
        return Promise.resolve(options.balance ? options.balance(index, host) : equalBalances());
      }),
      close: F(function close() {
        host.events.push('close:' + index); host.closeCalls++;
        return options.close ? options.close(index, host) : Promise.resolve(undefined);
      }),
    }))),
  };
  host.fire = index => {
    const timer = host.timers[index];
    assert.ok(timer && !timer.cancelled && !timer.fired);
    timer.fired = true; timer.callback();
  };
  host.fireBudget = budget => host.fire(host.timers.findIndex(t => t.budget === budget && !t.cancelled && !t.fired));
  host.config = config;
  if (options.beforeCreate) options.beforeCreate(config, host);
  host.owner = create(config);
  return host;
}
async function result(host) {
  host.owner.run(); await ticks(80);
  assert.equal(host.owner.inspect().finalCached, true, 'bounded DATA microtask observation did not finish');
  return host.owner.run();
}
const measured = summary => summary.recording.cohorts.MEASUREMENT.phases.FUNDED_CALL;

test('workload construction is inert and does not read a clock or invoke lane capabilities', () => {
  const h = fixture();
  assert.equal(h.owner.inspect().phase, 'CREATED');
  assert.deepEqual(h.events, []); assert.equal(h.clockCalls, 0);
  assert.equal(h.scheduleCalls, 0); assert.equal(h.closeCalls, 0);
});

test('workload joins genuine recorder funding warmup measurement balance and close contracts', async () => {
  const h = fixture(), s = await result(h);
  assert.equal(s.outcome, 'OBSERVED_OWNERS_RETURNED'); assert.equal(s.reason, 'PLAN_COMPLETE');
  assert.equal(s.plannedCallsCompleted, true); assert.equal(s.returnedCloses, 2);
  assert.equal(s.pendingOperations, 0); assert.equal(s.pendingLedgerBoundaries, 0);
  assert.equal(s.balanceBarriersObserved, 6);
  assert.equal(s.recording.cohorts.WARMUP.phases.FUNDING.succeeded, 2);
  assert.equal(s.recording.cohorts.WARMUP.phases.FUNDED_CALL.succeeded, 2);
  assert.equal(measured(s).succeeded, 4); assert.equal(s.recording.recordingState, 'COMPLETE');
  assert.equal(h.owner.inspect().phase, 'CLOSED');
});

test('workload reserves and reuses one run Promise before trusted lane reentry', async () => {
  let reentered;
  const h = fixture({ fund(i, c, host) { if (i === 0) reentered = host.owner.run(); return Promise.resolve('SUCCEEDED'); } });
  const p = h.owner.run(); assert.equal(h.owner.run(), p); assert.equal(reentered, p);
  await ticks(80); assert.equal(await p, await h.owner.run());
});

test('workload funding is an all-lane barrier before the first funded call', async () => {
  const gates = [deferred(), deferred()];
  const h = fixture({ fund(i) { return gates[i].promise; } });
  h.owner.run(); assert.equal(h.owner.inspect().activeOperations, 2);
  gates[0].resolve('SUCCEEDED'); await ticks();
  assert.equal(h.events.some(e => e.startsWith('call:')), false);
  gates[1].resolve('SUCCEEDED'); const s = await result(h);
  assert.equal(s.outcome, 'OBSERVED_OWNERS_RETURNED');
  assert.ok(h.events.indexOf('fund:1') < h.events.findIndex(e => e.startsWith('call:')));
});

test('workload parallel lanes never overlap two operations within the same lane', async () => {
  const entered = [[], []];
  const h = fixture({ plan: { warmupCallsPerLane: 0 }, execute(i, c) {
    const g = deferred(); entered[i].push({ ordinal: c.ordinal, g }); return g.promise;
  } });
  h.owner.run(); await ticks();
  assert.equal(entered[0].length, 1); assert.equal(entered[1].length, 1);
  assert.equal(h.owner.inspect().activeOperations, 2);
  entered[0][0].g.resolve('SUCCEEDED'); await ticks();
  assert.equal(entered[0].length, 2); assert.equal(entered[1].length, 1);
  assert.equal(h.owner.inspect().activeOperations, 2);
  entered[0][1].g.resolve('SUCCEEDED'); entered[1][0].g.resolve('SUCCEEDED'); await ticks();
  assert.equal(entered[1].length, 2); entered[1][1].g.resolve('SUCCEEDED');
  assert.equal((await result(h)).plannedCallsCompleted, true);
});

test('workload operation ordinals are bounded and never reset for repeated run calls', async () => {
  const h = fixture({ laneCount: 1 }), s = await result(h);
  assert.deepEqual(h.events.filter(e => e.startsWith('call:')),
    ['call:0:WARMUP:0', 'call:0:MEASUREMENT:0', 'call:0:MEASUREMENT:1']);
  h.owner.run(); h.owner.stop(); await ticks();
  assert.equal(h.events.filter(e => e.startsWith('fund:')).length, 1); assert.equal(s.returnedCloses, 1);
});

test('workload window expiry stops dispatch but waits for entered operation drain before close', async () => {
  const g = deferred();
  const h = fixture({ laneCount: 1, plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 10 },
    execute() { return g.promise; } });
  h.owner.run(); await ticks(); assert.equal(h.timers[0].budget, 500); assert.equal(h.timers[0].cancelled, true);
  h.fireBudget(100); assert.equal(h.owner.inspect().stopRequested, true); assert.equal(h.closeCalls, 0);
  g.resolve('SUCCEEDED'); const s = await result(h);
  assert.equal(s.reason, 'MEASUREMENT_WINDOW_ELAPSED'); assert.equal(s.plannedCallsCompleted, false);
  assert.equal(h.controls.filter(c => !c.funding).length, 1);
  assert.equal(s.recording.phases.FUNDED_CALL.measurementTerminalsAfterMeasurement.succeeded, 1);
  assert.equal(s.recording.phases.FUNDED_CALL.successfulWindowCompletionRatio.numerator, '0');
});

test('workload manual stop shares the run Promise and never launches queued replacements', async () => {
  const g = deferred();
  const h = fixture({ laneCount: 1, plan: { warmupCallsPerLane: 0 }, execute() { return g.promise; } });
  const p = h.owner.run(); await ticks(); assert.equal(h.owner.stop(), p); assert.equal(h.closeCalls, 0);
  g.resolve('SUCCEEDED'); const s = await result(h);
  assert.equal(s.reason, 'MANUAL_MEASUREMENT_STOP'); assert.equal(h.controls.filter(c => !c.funding).length, 1);
});

test('workload stop before run closes owned lanes without funding or balance reads', async () => {
  const h = fixture(); const p = h.owner.stop(); assert.equal(h.owner.run(), p);
  const s = await result(h);
  assert.equal(h.events.filter(e => e.startsWith('fund:') || e.startsWith('call:') || e.startsWith('balance:')).length, 0);
  assert.equal(s.recording.recordingState, 'EMPTY'); assert.equal(s.returnedCloses, 2);
});

test('workload UNKNOWN funding prevents all funded-call admission without another funding attempt', async () => {
  const h = fixture({ fund(i) { return Promise.resolve(i === 0 ? 'UNKNOWN' : 'SUCCEEDED'); } });
  const s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(h.controls.filter(c => !c.funding).length, 0);
  assert.equal(h.events.filter(e => e.startsWith('fund:')).length, 2); assert.equal(s.returnedCloses, 2);
});

test('workload rejected funding remains recorded and does not activate service', async () => {
  const h = fixture({ laneCount: 1, fund() { return Promise.resolve('REJECTED'); } }), s = await result(h);
  assert.equal(s.recording.cohorts.WARMUP.phases.FUNDING.rejected, 1);
  assert.equal(h.controls.filter(c => !c.funding).length, 0); assert.equal(s.capacityQualified, false);
});

test('workload declared service rejection remains in error fractions while finite work continues', async () => {
  const h = fixture({ laneCount: 1, plan: { warmupCallsPerLane: 0 },
    execute(i, c) { return Promise.resolve(c.ordinal === 0 ? 'REJECTED' : 'SUCCEEDED'); } });
  const s = await result(h);
  assert.equal(s.outcome, 'OBSERVED_OWNERS_RETURNED');
  assert.equal(measured(s).rejected, 1); assert.equal(measured(s).succeeded, 1);
  assert.equal(measured(s).nonSuccessFraction.numerator, 1); assert.equal(measured(s).nonSuccessFraction.denominator, 2);
});

test('workload service UNKNOWN stops all lanes and late success cannot reopen dispatch', async () => {
  const g = deferred();
  const h = fixture({ plan: { warmupCallsPerLane: 0 }, execute(i) { return i === 0 ? Promise.resolve('UNKNOWN') : g.promise; } });
  h.owner.run(); await ticks(); assert.equal(h.closeCalls, 0);
  g.resolve('SUCCEEDED'); const s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(measured(s).unknown, 1);
  assert.equal(h.controls.filter(c => !c.funding).length, 2);
});

test('workload rejected operation Promise is UNKNOWN and never leaks its error', async () => {
  const h = fixture({ laneCount: 1, plan: { warmupCallsPerLane: 0 },
    execute() { return Promise.reject(new Error('DECLARED_PRIVATE_ERROR')); } });
  const s = await result(h);
  assert.equal(measured(s).unknown, 1); assert.equal(JSON.stringify(s).includes('DECLARED_PRIVATE_ERROR'), false);
});

test('workload synchronous throw after capability entry is not a definite no-effect result', async () => {
  const h = fixture({ laneCount: 1, plan: { warmupCallsPerLane: 0 }, execute() { throw new Error('DECLARED_PRIVATE'); } });
  const s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(measured(s).unknown, 1);
});

test('workload does not assimilate returned thenables or invoke their getters', async () => {
  const value = {}; Object.defineProperty(value, 'then', { get() { hooks++; return () => {}; } });
  const h = fixture({ laneCount: 1, plan: { warmupCallsPerLane: 0 }, execute() { return value; } });
  const s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(hooks, 0); assert.equal(measured(s).unknown, 1);
});

test('workload does not infer ledger transactions from funded-call results', async () => {
  const h = fixture(), s = await result(h);
  assert.equal(s.recording.cohorts.WARMUP.phases.LEDGER_TRANSACTION.entered, 0);
  assert.equal(s.recording.cohorts.MEASUREMENT.phases.LEDGER_TRANSACTION.entered, 0);
});

test('workload explicit operation-bound ledger capabilities record actual component timing paths', async () => {
  const instrument = (i, c) => {
    const t = c.beginLedgerTransaction(); t.finish('SUCCEEDED'); return Promise.resolve('SUCCEEDED');
  };
  const h = fixture({ fund: instrument, execute: instrument }), s = await result(h);
  assert.equal(s.outcome, 'OBSERVED_OWNERS_RETURNED');
  assert.equal(s.recording.cohorts.WARMUP.phases.LEDGER_TRANSACTION.succeeded, 4);
  assert.equal(s.recording.cohorts.MEASUREMENT.phases.LEDGER_TRANSACTION.succeeded, 4);
});

test('workload ledger UNKNOWN is sticky even when the enclosing operation later succeeds', async () => {
  const h = fixture({ laneCount: 1, plan: { warmupCallsPerLane: 0 }, execute(i, c) {
    c.beginLedgerTransaction().finish('UNKNOWN'); return Promise.resolve('SUCCEEDED');
  } });
  const s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.uncertainty, 'LEDGER_OUTCOME_UNKNOWN');
  assert.equal(s.recording.cohorts.MEASUREMENT.phases.LEDGER_TRANSACTION.unknown, 1);
});

test('workload unfinished ledger boundary blocks normal close until its actual declared completion', async () => {
  let ledger;
  const h = fixture({ laneCount: 1, plan: { warmupCallsPerLane: 0 }, execute(i, c) {
    ledger = c.beginLedgerTransaction(); return Promise.resolve('SUCCEEDED');
  } });
  h.owner.run(); await ticks();
  assert.equal(h.owner.inspect().pendingLedgerBoundaries, 1); assert.equal(h.closeCalls, 0);
  ledger.finish('SUCCEEDED'); const s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.pendingLedgerBoundaries, 0);
  assert.equal(h.controls.filter(c => !c.funding).length, 1);
});

test('workload drain expiry requests closes once and retains honest pending operation counts', async () => {
  const g = deferred();
  const h = fixture({ laneCount: 1, plan: { warmupCallsPerLane: 0 }, execute() { return g.promise; } });
  const p = h.owner.run(); await ticks(); h.owner.stop(); await ticks();
  assert.equal(h.closeCalls, 0); h.fireBudget(10); const s = await p;
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.pendingOperations, 1);
  assert.equal(h.closeCalls, 1); assert.equal(s.measurementStatus, 'WITHHELD_OWNER_UNKNOWN');
  g.resolve('SUCCEEDED'); await ticks();
  assert.equal(h.owner.inspect().activeOperations, 0); assert.equal(h.owner.inspect().phase, 'HELD');
  assert.equal(await h.owner.run(), s); assert.equal(s.pendingOperations, 1); assert.equal(h.closeCalls, 1);
});

test('workload never-settling close uses the same bounded drain timer without renewing it', async () => {
  const g = deferred();
  const h = fixture({ laneCount: 1, close() { return g.promise; } });
  const p = h.owner.run(); await ticks(80);
  assert.equal(h.owner.inspect().phase, 'CLOSING'); assert.equal(h.timers.length, 3);
  h.fireBudget(10); const s = await p;
  assert.equal(s.pendingCloses, 1); assert.equal(s.outcome, 'HELD_UNKNOWN');
  h.owner.stop(); h.timers.find(t => t.budget === 10).callback(); await ticks();
  assert.equal(h.timers.length, 3); assert.equal(h.closeCalls, 1);
  g.resolve(undefined); await ticks(); assert.equal(h.owner.inspect().returnedCloses, 1);
  assert.equal(h.owner.inspect().phase, 'HELD'); assert.equal(s.pendingCloses, 1);
});

test('workload close rejection does not skip independent owner close attempts', async () => {
  const h = fixture({ close(i) { return i === 0 ? Promise.reject(new Error('PRIVATE_CLOSE')) : Promise.resolve(undefined); } });
  const s = await result(h);
  assert.equal(h.closeCalls, 2); assert.equal(s.returnedCloses, 1); assert.equal(s.unknownCloses, 1);
  assert.equal(s.uncertainty, 'OWNER_CLOSE_UNKNOWN'); assert.equal(JSON.stringify(s).includes('PRIVATE_CLOSE'), false);
});

test('workload non-undefined close return never becomes a returned owner close', async () => {
  const h = fixture({ laneCount: 1, close() { return Promise.resolve(true); } });
  const s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.unknownCloses, 1); assert.equal(s.returnedCloses, 0);
});

test('workload timer cancellation throw is sticky even after all owner closes return', async () => {
  const h = fixture({ cancel() { throw new Error('PRIVATE_TIMER'); } }), s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.uncertainty, 'TIMER_CANCEL_UNKNOWN');
  assert.equal(s.returnedCloses, 2); assert.equal(h.cancelCalls, 2);
  assert.equal(JSON.stringify(s).includes('PRIVATE_TIMER'), false);
});

test('workload timer setup throw cannot dispatch measured work or trigger unbounded retry', async () => {
  const h = fixture({ schedule() { throw new Error('PRIVATE_TIMER'); } });
  const s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(h.scheduleCalls, 2);
  assert.equal(h.controls.filter(c => !c.funding && c.command.cohort === 'MEASUREMENT').length, 0);
  assert.equal(h.closeCalls, 2);
});

test('workload synchronous timer callback is refused and its exact returned token is stopped', async () => {
  const h = fixture({ schedule(timer, host) {
    if (host.scheduleCalls === 1) timer.callback(); return timer.token;
  } });
  const s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.uncertainty, 'SYNCHRONOUS_TIMER_UNKNOWN');
  assert.equal(h.timers[0].cancelled, true);
  assert.equal(h.controls.filter(c => !c.funding && c.command.cohort === 'MEASUREMENT').length, 0);
});

test('workload cancellation requires the explicit undefined contract rather than literal true', async () => {
  const h = fixture({ cancel() { return true; } }), s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.uncertainty, 'TIMER_CANCEL_UNKNOWN');
  assert.equal(s.nativeResourcesQualified, false);
});

test('workload repeated timer token is unknown and cannot renew the observation budget', async () => {
  const h = fixture({ schedule(timer, host) { return host.timers[0].token; } });
  const s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(h.scheduleCalls, 3);
  assert.equal(s.uncertainty, 'TIMER_SETUP_UNKNOWN'); assert.equal(h.closeCalls, 2);
});

test('workload mismatched balance at the funding barrier stops all service work', async () => {
  const h = fixture({ balance() {
    return F({ observed: F({ availableUnits: 9n, heldUnits: 0n, consumedUnits: 1n }),
      expected: equalBalances().expected });
  } });
  const s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(h.controls.filter(c => !c.funding).length, 0);
  assert.equal(s.recording.ledgerBalanceChecks.mismatches, 1);
});

test('workload final balances are observed before close and never read after returned close', async () => {
  const h = fixture({ laneCount: 1 }), s = await result(h);
  assert.equal(s.balanceBarriersObserved, 3);
  assert.equal(h.events.filter(e => e.startsWith('balance:')).length, 3);
  assert.ok(h.events.lastIndexOf('balance:0') < h.events.indexOf('close:0'));
  h.owner.stop(); await ticks(); assert.equal(h.events.filter(e => e.startsWith('balance:')).length, 3);
});

test('workload final balance mismatch retains observed calls but withholds overall measurement', async () => {
  let seen = 0;
  const h = fixture({ laneCount: 1, balance() {
    seen++;
    return seen < 3 ? equalBalances()
      : F({ observed: F({ availableUnits: 6n, heldUnits: 0n, consumedUnits: 4n }), expected: equalBalances().expected });
  } });
  const s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.measurementStatus, 'WITHHELD_OWNER_UNKNOWN');
  assert.equal(measured(s).succeeded, 2); assert.equal(s.returnedCloses, 1);
  assert.equal(s.recording.ledgerBalanceChecks.stages.DRAINING.mismatches, 1);
});

test('workload failed clock before dispatch never fabricates a funding entry', async () => {
  const h = fixture({ now(host) { if (host.clockCalls === 1) throw new Error('PRIVATE_CLOCK'); return ++host.time; } });
  const s = await result(h);
  assert.equal(h.events.some(e => e.startsWith('fund:')), false);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.uncertainty, 'RECORDER_OR_CLOCK_UNKNOWN');
  assert.equal(s.recording.recordingState, 'EMPTY');
});

test('workload clock failure at a terminal observation retains incomplete recorder coverage', async () => {
  const h = fixture({ laneCount: 1, now(host) {
    if (host.clockCalls === 3) return { valueOf() { hooks++; return 3n; } }; return ++host.time;
  } });
  const s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.pendingOperations, 0);
  assert.equal(s.recording.recordingState, 'INCOMPLETE');
  assert.equal(s.recording.pendingObservations, 1); assert.equal(hooks, 0);
});

test('workload trusted callback reentrant stop gets the reserved run and no next service command', async () => {
  let reentered;
  const h = fixture({ laneCount: 1, plan: { warmupCallsPerLane: 0 }, execute(i, c, host) {
    reentered = host.owner.stop(); return Promise.resolve('SUCCEEDED');
  } });
  const p = h.owner.run(); const s = await result(h);
  assert.equal(reentered, p); assert.equal(h.controls.filter(c => !c.funding).length, 1);
  assert.equal(s.reason, 'MANUAL_MEASUREMENT_STOP');
});

test('workload stale ledger capability cannot be reused during a newer active operation', async () => {
  let stale, second = deferred();
  const h = fixture({ laneCount: 1, plan: { warmupCallsPerLane: 0 }, execute(i, c) {
    if (c.ordinal === 0) { stale = c.beginLedgerTransaction; return Promise.resolve('SUCCEEDED'); }
    return second.promise;
  } });
  h.owner.run(); await ticks(); assert.equal(h.owner.inspect().activeOperations, 1);
  assert.throws(() => stale()); second.resolve('SUCCEEDED');
  const s = await result(h); assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.uncertainty, 'LEDGER_BOUNDARY_UNKNOWN');
});

test('workload ledger observation budget cannot be expanded by repeated completed markers', async () => {
  const h = fixture({ laneCount: 1, plan: { warmupCallsPerLane: 0, maxLedgerTransactionsPerOperation: 1 }, execute(i, c) {
    c.beginLedgerTransaction().finish('SUCCEEDED'); c.beginLedgerTransaction(); return Promise.resolve('SUCCEEDED');
  } });
  const s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN');
  assert.equal(s.recording.cohorts.MEASUREMENT.phases.LEDGER_TRANSACTION.entered, 1);
});

test('workload source capabilities and plan are captured without running getters proxies or coercion', () => {
  const proxy = new Proxy([], { getPrototypeOf() { hooks++; return Array.prototype; }, ownKeys() { hooks++; return []; } });
  assert.throws(() => fixture({ beforeCreate(c) { c.lanes = proxy; } }));
  assert.throws(() => fixture({ beforeCreate(c) {
    Object.defineProperty(c.runtime, 'schedule', { enumerable: true, get() { hooks++; return F(() => undefined); } });
  } }));
  assert.throws(() => fixture({ beforeCreate(c) {
    c.recordingLimits.maxSamplesPerPhase = { valueOf() { hooks++; return 128; } };
  } }));
  assert.throws(() => fixture({ beforeCreate(c) { c.lanes = F([c.lanes[0], c.lanes[0]]); } }));
  assert.equal(hooks, 0);
});

test('workload plan mutation and public arity errors cannot replace already captured work', async () => {
  const h = fixture({ laneCount: 1 });
  h.config.plan.measurementCallsPerLane = 100;
  h.config.runtime.monotonicNowNs = F(() => { throw new Error('SHADOWED'); });
  await assert.rejects(h.owner.run('extra')); await assert.rejects(h.owner.stop('extra'));
  assert.throws(() => h.owner.inspect('extra')); assert.equal(h.owner.inspect().runRequested, false);
  const s = await result(h);
  assert.equal(measured(s).entered, 2); assert.equal(s.plan.measurementCallsPerLane, 2);
});

test('workload returned balance proxy is refused before its descriptor hooks can execute', async () => {
  const proxy = new Proxy({}, { getPrototypeOf() { hooks++; return Object.prototype; },
    ownKeys() { hooks++; return []; }, preventExtensions() { hooks++; return false; } });
  const h = fixture({ laneCount: 1, balance() { return proxy; } }), s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(hooks, 0);
});

test('workload ledger work starting after stop drains separately without changing the application operation', async () => {
  let control; const g = deferred();
  const h = fixture({ laneCount: 1, plan: { warmupCallsPerLane: 0 }, execute(i, c) { control = c; return g.promise; } });
  const p = h.owner.run(); await ticks(); h.owner.stop();
  const ledger = control.beginLedgerTransaction(); ledger.finish('SUCCEEDED');
  assert.equal(h.closeCalls, 0); g.resolve('SUCCEEDED'); const s = await result(h);
  assert.equal(await p, s); assert.equal(s.outcome, 'OBSERVED_OWNERS_RETURNED');
  assert.equal(s.postStopLedgerRecording.phases.LEDGER_TRANSACTION.succeeded, 1);
  assert.equal(s.recording.cohorts.MEASUREMENT.phases.LEDGER_TRANSACTION.entered, 0);
  assert.equal(s.recording.phases.FUNDED_CALL.measurementTerminalsAfterMeasurement.succeeded, 1);
  assert.equal(s.recording.phases.FUNDED_CALL.successfulWindowCompletionRatio.numerator, '0');
  assert.equal(s.ledgerBoundariesStarted, 1);
});

test('workload trusted clock reentrant stop cannot dispatch an operation after admission closed', async () => {
  const h = fixture({ now(host) {
    if (host.clockCalls === 2) host.owner.stop(); return ++host.time;
  } });
  const s = await result(h);
  assert.equal(h.events.some(e => e.startsWith('fund:') || e.startsWith('call:')), false);
  assert.equal(s.pendingOperations, 0); assert.equal(s.returnedCloses, 2);
});

test('workload reentrant drain deadline at the last balance read preserves terminal HELD', async () => {
  let count = 0;
  const h = fixture({ laneCount: 1, balance(i, host) {
    if (++count === 3) host.fireBudget(10); return equalBalances();
  } });
  const s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.uncertainty, 'DRAIN_DEADLINE_UNKNOWN');
  assert.equal(h.owner.inspect().phase, 'HELD'); assert.equal(h.closeCalls, 1);
});

test('workload timer token returned after reentrant finalization is stopped exactly once', async () => {
  const h = fixture({ laneCount: 1, plan: { warmupCallsPerLane: 0 }, schedule(timer, host) {
    if (host.scheduleCalls === 1) host.owner.stop();
    else timer.callback();
    return timer.token;
  } });
  const s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(h.timers.length, 2);
  assert.equal(h.timers[0].cancelled, true); assert.equal(h.timers[1].cancelled, true);
  assert.equal(h.cancelCalls, 2); assert.equal(h.owner.inspect().phase, 'HELD');
});

test('workload reentrant clock cannot exceed the per-operation ledger budget before marker admission', async () => {
  let control = null, attempted = false, refused = false;
  const h = fixture({ laneCount: 1,
    plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 1, maxLedgerTransactionsPerOperation: 1 },
    now(host) {
      if (control !== null && !attempted) {
        attempted = true; try { control.beginLedgerTransaction(); } catch { refused = true; }
      }
      return ++host.time;
    },
    execute(i, c) {
      control = c; const ledger = c.beginLedgerTransaction(); ledger.finish('SUCCEEDED');
      return Promise.resolve('SUCCEEDED');
    },
  });
  const s = await result(h);
  assert.equal(refused, true); assert.equal(s.outcome, 'HELD_UNKNOWN');
  assert.equal(s.ledgerBoundariesStarted, 1);
  const count = s.recording.cohorts.MEASUREMENT.phases.LEDGER_TRANSACTION.entered
    + s.postStopLedgerRecording.phases.LEDGER_TRANSACTION.entered;
  assert.equal(count, 1);
});

test('workload funding that never settles is bounded by setup then one drain deadline', async () => {
  const g = deferred();
  const h = fixture({ laneCount: 1, fund() { return g.promise; } });
  const p = h.owner.run(); await ticks();
  assert.equal(h.owner.inspect().phase, 'FUNDING'); assert.equal(h.timers[0].budget, 500);
  h.fireBudget(500); assert.equal(h.owner.inspect().stopRequested, true); assert.equal(h.closeCalls, 0);
  h.fireBudget(10); const s = await p;
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.uncertainty, 'SETUP_DEADLINE_UNKNOWN');
  assert.equal(s.pendingOperations, 1); assert.equal(h.timers.length, 2);
  g.resolve('SUCCEEDED'); await ticks(); assert.equal(h.controls.filter(c => !c.funding).length, 0);
  assert.equal(await h.owner.run(), s); assert.equal(s.pendingOperations, 1);
});

test('workload warmup that never settles cannot postpone measurement startup without a bound', async () => {
  const g = deferred();
  const h = fixture({ laneCount: 1, execute() { return g.promise; } });
  const p = h.owner.run(); await ticks();
  assert.equal(h.owner.inspect().phase, 'WARMUP');
  h.fireBudget(500); h.fireBudget(10); const s = await p;
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.reason, 'SETUP_DEADLINE_UNKNOWN');
  assert.equal(s.pendingOperations, 1);
  assert.equal(h.controls.filter(c => !c.funding && c.command.cohort === 'MEASUREMENT').length, 0);
  g.resolve('SUCCEEDED'); await ticks(); assert.equal(h.owner.inspect().phase, 'HELD');
});

test('workload malformed drain callback cannot consume the only deadline and leave run pending', async () => {
  const g = deferred();
  const h = fixture({ laneCount: 1, close() { return g.promise; } });
  const p = h.owner.run(); await ticks(80);
  assert.equal(h.owner.inspect().phase, 'CLOSING');
  h.timers.find(t => t.budget === 10).callback('unexpected');
  const s = await p;
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.uncertainty, 'TIMER_PROTOCOL_UNKNOWN');
  assert.equal(s.pendingCloses, 1); assert.equal(h.closeCalls, 1);
  g.resolve(undefined); await ticks(); assert.equal(h.owner.inspect().phase, 'HELD');
});


test('async balance source barrier waits for every real Promise before warmup', async () => {
  const gates = [deferred(), deferred()]; let first = true, entries = 0;
  const h = fixture({ rawBalance(i) { entries++; if (entries > 2) return Promise.resolve(equalBalances()); return gates[i].promise; } });
  h.owner.run(); await ticks();
  assert.equal(h.owner.inspect().pendingBalanceReads, 2); assert.equal(h.owner.inspect().balanceBarrierPending, true);
  assert.equal(h.controls.some(c => !c.funding), false); assert.equal(h.closeCalls, 0);
  gates[1].resolve(equalBalances()); await ticks(); assert.equal(h.owner.inspect().pendingBalanceReads, 1);
  assert.equal(h.controls.some(c => !c.funding), false); gates[0].resolve(equalBalances());
  const s = await result(h); assert.equal(s.outcome, 'OBSERVED_OWNERS_RETURNED');
  assert.equal(s.completedBalanceBarriers, 3); assert.equal(s.balanceReadAttempts, 6); assert.equal(s.pendingBalanceReads, 0);
  assert.equal(s.capacityWorkloadOwnerVersion, 2); assert.equal(s.balanceContract, 'GENUINE_PROMISE_FRESH_READ_NOT_SYNC_CACHE');
});

test('async warmup balance retains the setup deadline and starts no measurement timer early', async () => {
  const gate = deferred(); let calls = 0;
  const h = fixture({ laneCount: 1, rawBalance() { return ++calls === 2 ? gate.promise : Promise.resolve(equalBalances()); } });
  h.owner.run(); await ticks();
  assert.equal(h.owner.inspect().phase, 'WARMUP'); assert.equal(h.owner.inspect().pendingBalanceReads, 1);
  assert.equal(h.timers.length, 1); assert.equal(h.timers[0].cancelled, false);
  assert.equal(h.controls.some(c => c.command.cohort === 'MEASUREMENT'), false);
  gate.resolve(equalBalances()); const s = await result(h);
  assert.equal(s.outcome, 'OBSERVED_OWNERS_RETURNED'); assert.equal(h.timers.length, 3);
});

test('async final balance blocks normal close until the actual read settles', async () => {
  const gate = deferred(); let calls = 0;
  const h = fixture({ laneCount: 1, rawBalance() { return ++calls === 3 ? gate.promise : Promise.resolve(equalBalances()); } });
  const p = h.owner.run(); await ticks(80);
  assert.equal(h.owner.inspect().phase, 'DRAINING'); assert.equal(h.owner.inspect().pendingBalanceReads, 1);
  assert.equal(h.owner.inspect().finalCached, false); assert.equal(h.closeCalls, 0);
  gate.resolve(equalBalances()); const s = await result(h); assert.equal(await p, s);
  assert.equal(s.outcome, 'OBSERVED_OWNERS_RETURNED'); assert.equal(s.completedBalanceBarriers, 3); assert.equal(h.closeCalls, 1);
});

test('async rejected balance stops dispatch but still observes a sibling already entered read', async () => {
  const gate = deferred(); let calls = 0;
  const h = fixture({ rawBalance(i) { calls++; return i === 0 ? Promise.reject(new Error('PRIVATE_BALANCE_ERROR')) : gate.promise; } });
  h.owner.run(); await ticks(); assert.equal(h.owner.inspect().stopRequested, true);
  assert.equal(h.owner.inspect().pendingBalanceReads, 1); assert.equal(h.closeCalls, 0);
  assert.equal(h.controls.filter(c => !c.funding).length, 0); gate.resolve(equalBalances());
  const s = await result(h); assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(calls, 2);
  assert.equal(h.closeCalls, 2); assert.equal(JSON.stringify(s).includes('PRIVATE_BALANCE_ERROR'), false);
});

test('async balance throw after entry never starts a replacement read or skips owned close', async () => {
  const h = fixture({ rawBalance() { throw new Error('PRIVATE_BALANCE_THROW'); } }), s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.balanceReadAttempts, 1);
  assert.equal(h.events.filter(e => e.startsWith('balance:')).length, 1); assert.equal(h.closeCalls, 2);
  assert.equal(h.controls.filter(c => !c.funding).length, 0);
});

test('async balance refuses synchronous cached DATA rather than adding a compatibility fallback', async () => {
  const h = fixture({ laneCount: 1, rawBalance() { return equalBalances(); } }), s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.completedBalanceBarriers, 0);
  assert.equal(s.balanceBarriersObserved, 0); assert.equal(h.controls.filter(c => !c.funding).length, 0);
});

test('async balance never assimilates a thenable or reads its then getter', async () => {
  let calls = 0; const thenable = F(Object.defineProperty({}, 'then', { get() { calls++; throw new Error('unreachable'); } }));
  const h = fixture({ laneCount: 1, rawBalance() { return thenable; } }), s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(calls, 0); assert.equal(s.pendingBalanceReads, 0);
});

test('async balance Promise with own then accessor is refused without invoking it', async () => {
  let calls = 0; const promise = Promise.resolve(equalBalances());
  Object.defineProperty(promise, 'then', { get() { calls++; throw new Error('unreachable'); } });
  const h = fixture({ laneCount: 1, rawBalance() { return promise; } }), s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(calls, 0); assert.equal(s.balanceBarriersObserved, 0);
});

test('async balance rejects subclass Promises without treating them as observed native work', async () => {
  class OtherPromise extends Promise {}
  const h = fixture({ laneCount: 1, rawBalance() { return new OtherPromise(resolve => resolve(equalBalances())); } }), s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.completedBalanceBarriers, 0);
});

test('async funding balance timeout retains one pending read in the cached HELD result', async () => {
  const gate = deferred(); const h = fixture({ laneCount: 1, rawBalance() { return gate.promise; } });
  const p = h.owner.run(); await ticks(); h.fireBudget(500); assert.equal(h.closeCalls, 0);
  h.fireBudget(10); const s = await p;
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.pendingBalanceReads, 1); assert.equal(s.balanceBarrierPending, true);
  assert.equal(s.uncertainty, 'SETUP_DEADLINE_UNKNOWN'); assert.equal(h.closeCalls, 1);
  gate.resolve(equalBalances()); await ticks();
  assert.equal(h.owner.inspect().pendingBalanceReads, 0); assert.equal(h.owner.inspect().balanceBarrierPending, false);
  assert.equal(await h.owner.run(), s); assert.equal(s.pendingBalanceReads, 1); assert.equal(h.closeCalls, 1);
  assert.equal(h.controls.filter(c => !c.funding).length, 0);
});

test('async manual stop during a read preserves interruption and drains without launching another read', async () => {
  const gate = deferred(); const h = fixture({ laneCount: 1, rawBalance() { return gate.promise; } });
  const p = h.owner.run(); await ticks(); assert.equal(h.owner.stop(), p); assert.equal(h.closeCalls, 0);
  gate.resolve(equalBalances()); const s = await result(h);
  assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.uncertainty, 'BALANCE_BARRIER_INTERRUPTED');
  assert.equal(s.balanceReadAttempts, 1); assert.equal(h.controls.filter(c => !c.funding).length, 0); assert.equal(h.closeCalls, 1);
});

test('async final balance drain expiry cannot renew the timer or upgrade after late completion', async () => {
  const gate = deferred(); let calls = 0;
  const h = fixture({ laneCount: 1, rawBalance() { return ++calls === 3 ? gate.promise : Promise.resolve(equalBalances()); } });
  const p = h.owner.run(); await ticks(80); h.fireBudget(10); const s = await p;
  assert.equal(s.pendingBalanceReads, 1); assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(h.timers.length, 3);
  gate.resolve(equalBalances()); await ticks(); h.owner.stop();
  assert.equal(h.timers.length, 3); assert.equal(h.closeCalls, 1); assert.equal(await h.owner.run(), s);
  assert.equal(h.owner.inspect().pendingBalanceReads, 0); assert.equal(s.completedBalanceBarriers, 2);
});

test('async balance capability reentry sees its owned pending read before stop can close', async () => {
  const gate = deferred(); let snapshot, closeCount;
  const h = fixture({ laneCount: 1, rawBalance(i, host) {
    snapshot = host.owner.inspect(); host.owner.stop(); closeCount = host.closeCalls; return gate.promise;
  } });
  h.owner.run(); await ticks(); assert.equal(snapshot.pendingBalanceReads, 1); assert.equal(closeCount, 0);
  assert.equal(h.closeCalls, 0); gate.resolve(equalBalances());
  const s = await result(h); assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(h.closeCalls, 1);
});

test('async balance clock reentry cannot mutate the recorder after forced finalization', async () => {
  let third = false; let calls = 0;
  const h = fixture({ laneCount: 1, rawBalance() { if (++calls === 3) third = true; return Promise.resolve(equalBalances()); },
    now(host) { if (third) { third = false; host.fireBudget(10); } return ++host.time; } });
  const s = await result(h); assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(s.uncertainty, 'DRAIN_DEADLINE_UNKNOWN');
  assert.equal(s.recording.ledgerBalanceChecks.samples, 2); assert.equal(s.completedBalanceBarriers, 2);
  assert.equal(s.pendingBalanceReads, 0); assert.equal(s.balanceBarrierPending, true);
});

test('async late malformed balance data never invokes getters or upgrades finalized state', async () => {
  const gate = deferred(); let calls = 0;
  const h = fixture({ laneCount: 1, rawBalance() { return gate.promise; } });
  const p = h.owner.run(); await ticks(); h.fireBudget(500); h.fireBudget(10); const s = await p;
  const value = F({ get observed() { calls++; throw new Error('unreachable'); }, expected: equalBalances().expected });
  gate.resolve(value); await ticks(); assert.equal(calls, 0); assert.equal(await h.owner.run(), s);
  assert.equal(s.pendingBalanceReads, 1); assert.equal(h.owner.inspect().pendingBalanceReads, 0);
});

test('async fulfilled balance DATA must still be frozen exact and independently matching', async () => {
  for (const value of [{ ...equalBalances() }, F({ ...equalBalances(), extra: true }),
    F({ observed: F({ availableUnits: 1n, heldUnits: 0n, consumedUnits: 0n }), expected: equalBalances().expected })]) {
    const h = fixture({ laneCount: 1, rawBalance() { return Promise.resolve(value); } }), s = await result(h);
    assert.equal(s.outcome, 'HELD_UNKNOWN'); assert.equal(h.controls.filter(c => !c.funding).length, 0);
  }
});

test('async stop before run never enters any balance Promise or native operation capability', async () => {
  const h = fixture({ rawBalance() { throw new Error('unreachable'); } }), p = h.owner.stop();
  await ticks(); const s = await p; assert.equal(s.balanceReadAttempts, 0); assert.equal(s.pendingBalanceReads, 0);
  assert.equal(s.completedBalanceBarriers, 0); assert.equal(h.closeCalls, 2); assert.equal(s.capacityQualified, false);
});
