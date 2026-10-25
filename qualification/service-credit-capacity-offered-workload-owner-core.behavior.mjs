import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServiceCreditCapacityOfferedWorkloadOwnerCore as create } from '../src/service-credit-capacity-offered-workload-owner-core.js';
if (process.version !== 'v24.19.0' || process.env.X402_OFFERED_WORKLOAD_DATA_SELECTION !== 'source-offered-workload-data-v1')
  throw new TypeError('EXACT_OFFERED_WORKLOAD_DATA_SELECTION_REQUIRED');
const F = Object.freeze, MS = 1000000n;
const BALANCE = F({ availableUnits: 100n, heldUnits: 0n, consumedUnits: 0n });
const MATCH = F({ observed: BALANCE, expected: BALANCE });
let entered = 0, completed = 0;
const names = [];
function check(name, body) {
  names.push(name); test(name, { concurrency: false }, async () => { entered++; await body(); completed++; });
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function flush() { for (let i = 0; i < 64; i++) await undefined; }
function fixture(options = {}) {
  const h = { now: 0n, timers: [], events: [], owner: null, balances: [], entries: [], closes: [], funding: [], clockCalls: 0, cancellations: [] };
  const runtime = {
    monotonicNowNs: F(function now() { h.clockCalls++; return options.clock ? options.clock(h) : h.now; }),
    schedule: F(function schedule(callback, delay) {
      const item = { token: F({ timer: h.timers.length + 1 }), callback, delay, due: h.now + BigInt(delay) * MS, cancelled: false, fired: false };
      h.timers.push(item); h.maximumLiveTimers = Math.max(h.maximumLiveTimers ?? 0, h.timers.filter(t => !t.cancelled && !t.fired).length);
      return options.schedule ? options.schedule(item, h) : item.token;
    }),
    cancel: F(function cancel(token) {
      h.cancellations.push(token); const item = h.timers.find(t => t.token === token); if (item) item.cancelled = true;
      return options.cancel ? options.cancel(token, h) : undefined;
    }),
  };
  const lanes = F(Array.from({ length: options.laneCount ?? 2 }, (_, lane) => F({
    fund: F(function fund(command) {
      const item = { kind: 'fund', lane, command, at: h.now, receiver: this }; h.events.push(item); h.funding.push(item);
      return options.fund ? options.fund(item, h) : Promise.resolve('SUCCEEDED');
    }),
    execute: F(function execute(command) {
      const item = { kind: command.cohort, lane, command, at: h.now, receiver: this }; h.events.push(item); h.entries.push(item);
      return options.execute ? options.execute(item, h) : Promise.resolve('SUCCEEDED');
    }),
    checkBalances: F(function balances() {
      const item = { kind: 'balance', lane, at: h.now, receiver: this }; h.events.push(item); h.balances.push(item);
      return options.balance ? options.balance(item, h) : Promise.resolve(MATCH);
    }),
    openMeasurementWindow: F(function open() {
      const item = { kind: 'open', lane, at: h.now, receiver: this }; h.events.push(item);
      return options.open ? options.open(item, h) : Promise.resolve(undefined);
    }),
    stopMeasurementWindow: F(function stop() {
      const item = { kind: 'stop', lane, at: h.now, receiver: this }; h.events.push(item);
      return options.stop ? options.stop(item, h) : Promise.resolve(undefined);
    }),
    close: F(function close() {
      const item = { kind: 'close', lane, at: h.now, receiver: this }; h.events.push(item); h.closes.push(item);
      return options.close ? options.close(item, h) : Promise.resolve(undefined);
    }),
  })));
  h.configuration = {
    plan: { warmupCallsPerLane: 1, measurementCallsPerLane: 3, setupBudgetMs: 20,
      measurementWindowMs: 12, arrivalIntervalMs: 4, drainGraceMs: 10, closeGraceMs: 10,
      maxLedgerTransactionsPerOperation: 1, ...options.plan },
    recordingLimits: { maxSamplesPerPhase: 128, maxInFlightPerPhase: 16, ...options.limits },
    runtime, lanes,
  };
  if (!options.noCreate) h.owner = create(h.configuration);
  h.next = () => h.timers.filter(t => !t.cancelled && !t.fired).sort((a, b) => a.due < b.due ? -1 : a.due > b.due ? 1 : 0)[0];
  h.fire = async (item, at = item.due > h.now ? item.due / MS : h.now / MS, args = []) => {
    h.now = BigInt(at) * MS; item.fired = true; item.callback(...args); await flush();
  };
  h.drive = async (maximum = 10000) => {
    await flush();
    for (let i = 0; i < maximum && !h.owner.inspect().finalCached; i++) {
      const item = h.next(); assert.ok(item, 'a pending pipeline must keep its original bounded deadline');
      await h.fire(item);
    }
    assert.equal(h.owner.inspect().finalCached, true, 'synthetic pipeline driver must terminate'); return h.owner.run();
  };
  return h;
}
function boundary(result) {
  assert.equal(result.nativeResourcesQualified, false); assert.equal(result.sustainedCapacityQualified, false);
  assert.equal(result.productionQualified, false); assert.equal(result.automaticRetry, false); assert.equal(result.replacement, false);
  assert.equal(result.sourceOwnersCloseRequested, true); assert.ok(result.lanes.every(l => l.closeEntered));
  if (result.offeredMeasurement) {
    const m = result.offeredMeasurement;
    assert.equal(m.scheduledSlots, m.sourceEntries + m.busyRejectedOffers + m.schedulerMissedSlots + m.withdrawnSlots);
    assert.equal(m.borrowedResourcesClosed, false);
  }
}
check('pipeline construction is inert and captures the genuine measurement factory', () => {
  const h = fixture(); assert.equal(h.events.length, 0); assert.equal(h.timers.length, 0); assert.equal(h.clockCalls, 0);
  assert.deepEqual(Object.keys(h.owner), ['run', 'stop', 'inspect']); assert.equal(h.owner.inspect().measurementPhase, null);
});
check('one funding, warmup, three fresh balance barriers, genuine offered measurement and close compose', async () => {
  const h = fixture(), p = h.owner.run(), result = await h.drive(); boundary(result);
  assert.equal(await p, result); assert.equal(result.outcome, 'OBSERVED_SOURCE_OWNERS_RETURNED');
  assert.equal(h.funding.length, 2); assert.equal(result.fundingEntries, 2); assert.equal(result.warmupEntries, 2);
  assert.equal(h.entries.filter(e => e.kind === 'WARMUP').length, 2);
  assert.deepEqual(h.entries.filter(e => e.kind === 'MEASUREMENT').map(e => e.at / MS), [0n, 4n, 8n]);
  assert.equal(h.balances.length, 6); assert.equal(h.closes.length, 2);
  for (const lane of [0, 1]) {
    assert.equal(h.funding.filter(e => e.lane === lane).length, 1);
    assert.equal(h.closes.filter(e => e.lane === lane).length, 1);
    assert.equal(h.balances.filter(e => e.lane === lane).length, 3);
  }
  assert.equal(result.offeredMeasurement.outcome, 'OBSERVED_SOURCES_SETTLED');
  assert.equal(result.offeredMeasurement.balanceChecks, 4); assert.equal(result.fundingBalanceChecks, 2);
  assert.ok(h.events.every(e => e.receiver === undefined));
  assert.ok(h.events.findIndex(e => e.kind === 'close') > h.events.map(e => e.kind).lastIndexOf('balance'));
  assert.ok(h.maximumLiveTimers <= 3);
});
check('zero warmup still preserves funding and all three fresh balance barriers', async () => {
  const h = fixture({ plan: { warmupCallsPerLane: 0 } }); h.owner.run(); const result = await h.drive(); boundary(result);
  assert.equal(result.warmupEntries, 0); assert.equal(h.funding.length, 2); assert.equal(h.balances.length, 6);
  assert.equal(result.offeredMeasurement.sourceEntries, 3);
});
check('one slow funding prevents every later balance, warmup and measured call', async () => {
  const pending = deferred(), h = fixture({ fund: item => item.lane === 0 ? pending.promise : Promise.resolve('SUCCEEDED') });
  h.owner.run(); await flush(); assert.equal(h.balances.length, 0); assert.equal(h.entries.length, 0);
  h.now = 5n * MS; pending.resolve('SUCCEEDED'); await flush();
  const result = await h.drive(); boundary(result); assert.equal(result.outcome, 'OBSERVED_SOURCE_OWNERS_RETURNED');
  assert.equal(h.funding.length, 2);
});
check('per-lane warmup advances independently without a slow-lane round barrier', async () => {
  const pending = deferred();
  const h = fixture({ plan: { warmupCallsPerLane: 2 }, execute: item => item.kind === 'WARMUP' && item.lane === 1 && item.command.ordinal === 0
    ? pending.promise : Promise.resolve('SUCCEEDED') });
  h.owner.run(); await flush();
  assert.equal(h.entries.filter(e => e.kind === 'WARMUP' && e.lane === 0).length, 2);
  assert.equal(h.entries.filter(e => e.kind === 'WARMUP' && e.lane === 1).length, 1);
  assert.equal(h.events.filter(e => e.kind === 'open').length, 0);
  h.now = 5n * MS; pending.resolve('SUCCEEDED'); await flush();
  const result = await h.drive(); boundary(result); assert.equal(result.warmupEntries, 4);
  assert.equal(result.outcome, 'OBSERVED_SOURCE_OWNERS_RETURNED');
});
check('offered overload never turns dropped offers into another funding or retry', async () => {
  const pending = [deferred(), deferred()];
  const h = fixture({ plan: { measurementWindowMs: 16, measurementCallsPerLane: 4 }, execute: item =>
    item.kind === 'MEASUREMENT' && item.command.ordinal === 0 ? pending[item.lane].promise : Promise.resolve('SUCCEEDED') });
  h.owner.run(); await flush(); await h.fire(h.next(), 4); await h.fire(h.next(), 8);
  assert.equal(h.entries.filter(e => e.kind === 'MEASUREMENT').length, 2);
  h.now = 9n * MS; pending.forEach(d => d.resolve('SUCCEEDED')); await flush();
  assert.equal(h.entries.filter(e => e.kind === 'MEASUREMENT').length, 2);
  const result = await h.drive(); boundary(result);
  assert.equal(result.offeredMeasurement.sourceEntries, 3); assert.equal(result.offeredMeasurement.busyRejectedOffers, 1);
  assert.equal(result.fundingEntries, 2); assert.equal(result.outcome, 'OBSERVED_SOURCE_OWNERS_RETURNED');
});
check('all 16 source owners fund once and warm once before a 64-slot calendar', async () => {
  const h = fixture({ laneCount: 16, plan: { measurementWindowMs: 64, arrivalIntervalMs: 1, measurementCallsPerLane: 64 } });
  h.owner.run(); const result = await h.drive(); boundary(result);
  assert.equal(result.fundingEntries, 16); assert.equal(result.warmupEntries, 16); assert.equal(result.offeredMeasurement.sourceEntries, 64);
  assert.equal(h.balances.length, 48); assert.equal(h.closes.length, 16);
});
for (const [name, fund] of [
  ['known rejection', () => Promise.resolve('REJECTED')],
  ['unknown outcome', () => Promise.resolve('UNKNOWN')],
  ['rejected Promise', () => Promise.reject(new Error('PRIVATE_FUND'))],
]) {
  check('funding ' + name + ' fences warmup and closes all captured owners once', async () => {
    const h = fixture({ fund }); h.owner.run(); const result = await h.drive(); boundary(result);
    assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(h.entries.length, 0); assert.equal(h.balances.length, 0);
    assert.equal(h.closes.length, 2); assert.ok(!JSON.stringify(result).includes('PRIVATE_FUND'));
  });
}
for (const [name, fund] of [
  ['throw', () => { throw new Error('PRIVATE_THROW'); }],
  ['plain return', () => 'SUCCEEDED'],
  ['thenable', () => Object.defineProperty({}, 'then', { get() { throw new Error('HOOK'); } })],
  ['proxy', () => new Proxy(Promise.resolve('SUCCEEDED'), { get() { throw new Error('PROXY_HOOK'); } })],
]) {
  check('unobservable funding ' + name + ' retains pending originals without replacement', async () => {
    const h = fixture({ fund }); h.owner.run(); const result = await h.drive(); boundary(result);
    assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.ok(result.pendingPrefixOriginals > 0);
    assert.equal(h.entries.length, 0); assert.equal(h.closes.length, 2);
  });
}
check('a refused warmup cannot open measurement or re-fund', async () => {
  const h = fixture({ execute: item => Promise.resolve(item.kind === 'WARMUP' ? 'REJECTED' : 'SUCCEEDED') });
  h.owner.run(); const result = await h.drive(); boundary(result); assert.equal(result.outcome, 'HELD_UNKNOWN');
  assert.equal(h.events.filter(e => e.kind === 'open').length, 0); assert.equal(h.funding.length, 2); assert.equal(h.closes.length, 2);
});
check('prefix ledger timing uses explicit operation capabilities rather than Promise duration', async () => {
  const instrument = item => { const tx = item.command.beginLedgerTransaction(); tx.finish('SUCCEEDED'); return Promise.resolve('SUCCEEDED'); };
  const h = fixture({ fund: instrument, execute: instrument }); h.owner.run(); const result = await h.drive(); boundary(result);
  assert.equal(result.prefixLedgerStarts, 4); assert.equal(result.prefixRecording.phases.LEDGER_TRANSACTION.entered, 4);
  assert.equal(result.offeredMeasurement.ledgerStarts, 3); assert.equal(result.outcome, 'OBSERVED_SOURCE_OWNERS_RETURNED');
});
check('a prefix source settling with ledger work pending cannot release its slot or enter measurement', async () => {
  let tx;
  const h = fixture({ laneCount: 1, fund: item => { tx = item.command.beginLedgerTransaction(); return Promise.resolve('SUCCEEDED'); } });
  const p = h.owner.run(); await flush(); assert.equal(h.owner.inspect().pendingPrefixOriginals, 1);
  assert.equal(h.closes.length, 1); tx.finish('SUCCEEDED'); await flush();
  const result = await p; boundary(result); assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(h.entries.length, 0);
});
check('post-stop ledger work from an entered prefix original stays in a separate recorder', async () => {
  const pending = deferred(); let original;
  const h = fixture({ laneCount: 1, fund: item => { original = item.command; return pending.promise; } });
  const p = h.owner.run(); await flush(); h.owner.stop(); await flush();
  const tx = original.beginLedgerTransaction(); tx.finish('SUCCEEDED'); pending.resolve('SUCCEEDED'); await flush();
  const result = await p; boundary(result); assert.equal(result.postStopPrefixLedgerRecording.phases.LEDGER_TRANSACTION.entered, 1);
  assert.equal(result.prefixRecording.phases.LEDGER_TRANSACTION.entered, 0); assert.equal(h.entries.length, 0);
});
check('stop before run closes captured owners only and never funds or opens a window', async () => {
  const h = fixture(), p = h.owner.stop(); await flush(); const result = await p; boundary(result);
  assert.equal(h.closes.length, 2); assert.equal(h.funding.length, 0); assert.equal(h.balances.length, 0); assert.equal(h.entries.length, 0);
  assert.equal(h.owner.run(), p); assert.equal(h.owner.stop(), p);
});
check('run reserves its public Promise before the first trusted clock can reenter', async () => {
  let original;
  const h = fixture({ clock: host => { if (host.owner && original === undefined) original = host.owner.run(); return host.now; } });
  const p = h.owner.run(); assert.equal(original, p); await h.drive(); assert.equal(h.owner.stop(), p);
});
check('wrong arity makes no operational entry', async () => {
  const h = fixture(); await assert.rejects(h.owner.run(1), TypeError); await assert.rejects(h.owner.stop(1), TypeError);
  assert.throws(() => h.owner.inspect(1), TypeError); assert.equal(h.clockCalls, 0); assert.equal(h.events.length, 0);
});
check('stop at the last prefix timestamp cannot enter a new funding capability afterward', async () => {
  let stopped = false;
  const h = fixture({ clock: host => {
    if (host.owner && !stopped && host.clockCalls === 3) { stopped = true; host.owner.stop(); } return host.now;
  } });
  h.owner.run(); const result = await h.drive(); boundary(result); assert.equal(h.funding.length, 0); assert.equal(h.closes.length, 2);
});
check('reentrant stop while inner run is returning preserves its original Promise without false UNKNOWN', async () => {
  let stopped = false, shared;
  const h = fixture({ clock: host => {
    if (host.owner && !stopped && host.owner.inspect().measurementPhase === 'PRECHECK') {
      stopped = true; shared = host.owner.stop();
    }
    return host.now;
  } });
  const p = h.owner.run(); const result = await h.drive(); boundary(result); assert.equal(shared, p);
  assert.equal(result.outcome, 'OBSERVED_SOURCE_OWNERS_RETURNED'); assert.equal(h.entries.filter(e => e.kind === 'MEASUREMENT').length, 0);
  assert.equal(h.closes.length, 2);
});
check('a measured source can reenter stop without replacement or duplicated owner close', async () => {
  let stopped;
  const h = fixture({ execute: (item, host) => {
    if (item.kind === 'MEASUREMENT') stopped = host.owner.stop(); return Promise.resolve('SUCCEEDED');
  } });
  const p = h.owner.run(); const result = await h.drive(); boundary(result); assert.equal(stopped, p);
  assert.equal(h.entries.filter(e => e.kind === 'MEASUREMENT').length, 1); assert.equal(h.closes.length, 2);
});
check('one reentrant source close cannot suppress or duplicate another captured close', async () => {
  const h = fixture({ close: (item, host) => { if (item.lane === 0) host.owner.stop(); return Promise.resolve(undefined); } });
  h.owner.run(); const result = await h.drive(); boundary(result); assert.equal(h.closes.length, 2);
  assert.equal(result.outcome, 'OBSERVED_SOURCE_OWNERS_RETURNED');
});
check('stop-clock reentry cannot publish before every captured owner close is attempted', async () => {
  let reentered = false;
  const h = fixture({ clock: host => {
    if (host.owner && !reentered && host.owner.inspect().phase === 'STOPPING') { reentered = true; host.owner.stop(); }
    return host.now;
  } });
  const p = h.owner.stop(); await flush(); const result = await p; boundary(result); assert.equal(h.closes.length, 2);
});
check('late funding microtasks cannot beat the original setup deadline', async () => {
  const pending = deferred(), h = fixture({ fund: () => pending.promise }); h.owner.run(); await flush();
  h.now = 21n * MS; pending.resolve('SUCCEEDED'); await flush();
  const result = await h.drive(); boundary(result); assert.equal(result.outcome, 'HELD_UNKNOWN');
  assert.equal(h.balances.length, 0); assert.equal(h.entries.length, 0); assert.equal(h.closes.length, 2);
});
check('late warmup acknowledgement cannot construct and enter measurement', async () => {
  const pending = deferred(), h = fixture({ execute: () => pending.promise }); h.owner.run(); await flush();
  h.now = 21n * MS; pending.resolve('SUCCEEDED'); await flush();
  const result = await h.drive(); boundary(result); assert.equal(result.outcome, 'HELD_UNKNOWN');
  assert.equal(h.events.filter(e => e.kind === 'open').length, 0); assert.equal(h.closes.length, 2);
});
check('late after-funding balance observations cannot open the next setup phase', async () => {
  const pending = deferred(), h = fixture({ balance: () => pending.promise }); h.owner.run(); await flush();
  h.now = 21n * MS; pending.resolve(MATCH); await flush();
  const result = await h.drive(); boundary(result); assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(h.entries.length, 0);
});
check('post-measurement close microtasks cannot outrun the original stop deadline', async () => {
  const pending = deferred(), h = fixture({ close: () => pending.promise }); h.owner.run(); await flush();
  await h.fire(h.next()); await h.fire(h.next()); await h.fire(h.next()); assert.equal(h.closes.length, 2);
  h.now = 30n * MS; pending.resolve(undefined); await flush();
  const result = await h.drive(); boundary(result); assert.equal(result.outcome, 'HELD_UNKNOWN');
});
check('unresolved owner close stays HELD after expiry and never upgrades on a late return', async () => {
  const pending = deferred(), h = fixture({ close: item => item.lane === 0 ? pending.promise : Promise.resolve(undefined) });
  h.owner.run(); const result = await h.drive(); boundary(result); assert.equal(result.outcome, 'HELD_UNKNOWN');
  assert.equal(result.pendingOwnerCloses, 1); pending.resolve(undefined); await flush();
  assert.equal(h.owner.inspect().pendingOwnerCloses, 0); assert.equal(await h.owner.run(), result);
});
check('unavailable stop timer preserves unobserved work and still attempts all closes', async () => {
  const pending = deferred();
  const h = fixture({ fund: () => pending.promise, schedule: (item, host) => {
    if (host.owner?.inspect().phase === 'STOPPING') throw new Error('PRIVATE_TIMER'); return item.token;
  } });
  h.owner.run(); await flush(); h.owner.stop(); await flush(); const result = await h.owner.run(); boundary(result);
  assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(h.closes.length, 2); assert.ok(result.pendingPrefixOriginals > 0);
  pending.resolve('SUCCEEDED'); await flush(); assert.equal(await h.owner.run(), result);
});
check('synchronous setup timer delivery cannot enter funding', async () => {
  const h = fixture({ schedule: item => { item.callback(); item.fired = true; return item.token; } });
  h.owner.run(); const result = await h.drive(); boundary(result); assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(h.funding.length, 0);
});
check('reused timer tokens do not create another setup or funding attempt', async () => {
  let first;
  const h = fixture({ schedule: item => { first ??= item.token; return first; } });
  h.owner.run(); const result = await h.drive(); boundary(result); assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(h.funding.length, 0);
});
check('cancel uncertainty stops measured admission while preserving one delegated close', async () => {
  const h = fixture({ cancel: () => false }); h.owner.run(); const result = await h.drive(); boundary(result);
  assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(h.entries.filter(e => e.kind === 'MEASUREMENT').length, 0);
  assert.equal(h.closes.length, 2);
});
check('failure of only the outer setup cancellation fences the otherwise healthy inner calendar', async () => {
  const h = fixture({ cancel: (token, host) => token === host.timers[1]?.token ? false : undefined });
  h.owner.run(); const result = await h.drive(); boundary(result);
  assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(h.entries.filter(e => e.kind === 'MEASUREMENT').length, 0);
  assert.equal(h.closes.length, 2);
});
check('inner balance uncertainty remains HELD even after all source close acknowledgements', async () => {
  const h = fixture({ balance: (item, host) => Promise.resolve(host.balances.length <= 2 ? MATCH
    : F({ observed: F({ ...BALANCE, heldUnits: 1n }), expected: BALANCE })) });
  h.owner.run(); const result = await h.drive(); boundary(result); assert.equal(result.outcome, 'HELD_UNKNOWN');
  assert.equal(h.closes.length, 2); assert.equal(h.entries.filter(e => e.kind === 'MEASUREMENT').length, 0);
});
check('invalid close return is not a clean native resource assertion', async () => {
  const h = fixture({ close: () => Promise.resolve(false) }); h.owner.run(); const result = await h.drive(); boundary(result);
  assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(result.pendingOwnerCloses, 0);
  assert.ok(result.lanes.every(l => l.closeOutcome === 'UNKNOWN'));
});
for (const [name, edit] of [
  ['funding capacity lower than the global offer budget', c => { c.plan.measurementCallsPerLane = 2; }],
  ['more than one minute of cooperative total budget', c => { c.plan.setupBudgetMs = 60000; }],
  ['prefix ledger budget overrun', c => { c.plan.warmupCallsPerLane = 255; }],
  ['a supplied replacement inner factory', c => { c.innerFactory = F(() => { throw new Error('HOOK'); }); }],
  ['duplicate owner capability', c => { c.lanes = F([c.lanes[0], c.lanes[0]]); }],
  ['mutable owner array', c => { c.lanes = [...c.lanes]; }],
  ['non-DATA plan accessor', c => { Object.defineProperty(c.plan, 'arrivalIntervalMs', { enumerable: true, get() { throw new Error('HOOK'); } }); }],
]) {
  check('configuration refuses ' + name + ' without a clock or source entry', () => {
    const h = fixture({ noCreate: true }); edit(h.configuration); assert.throws(() => create(h.configuration), TypeError);
    assert.equal(h.clockCalls, 0); assert.equal(h.events.length, 0); assert.equal(h.timers.length, 0);
  });
}
after(() => console.log('# actual-offered-workload-source-data ' + JSON.stringify({
  entered, completed, names, genuineOfferedWindowAndRecorders: true,
  sourceOwnersClockTimersBalancesAndLedgerAreDeclared: true, nativeAdapterExecuted: false,
  SDK: false, SQLite: false, signatures: 0, nonce: 0, sockets: 0, nativeCapacityQualified: false,
})));
