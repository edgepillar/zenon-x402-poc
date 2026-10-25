import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServiceCreditCapacityOfferedWindowOwnerCore as create } from '../src/service-credit-capacity-offered-window-owner-core.js';

if (process.version !== 'v24.19.0' || process.env.X402_OFFERED_WINDOW_DATA_SELECTION !== 'source-offered-window-data-v1')
  throw new TypeError('EXACT_OFFERED_WINDOW_DATA_SELECTION_REQUIRED');
const F = Object.freeze, MS = 1000000n;
let entered = 0, completed = 0;
const names = [];
function check(name, body) {
  names.push(name);
  test(name, { concurrency: false }, async () => { entered++; await body(); completed++; });
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function flush() { for (let i = 0; i < 32; i++) await undefined; }
const BALANCE = F({ availableUnits: 100n, heldUnits: 0n, consumedUnits: 0n });
const MATCH = F({ observed: BALANCE, expected: BALANCE });
function fixture(options = {}) {
  const h = { now: 0n, timers: [], events: [], entries: [], clockCalls: 0, cancellations: [], owner: null, openCalls: 0, balanceCalls: 0, stopCalls: 0 };
  const runtime = {
    monotonicNowNs: F(function monotonicNowNs() {
      h.clockCalls++; return options.clock ? options.clock(h) : h.now;
    }),
    schedule: F(function schedule(callback, delay) {
      const item = { token: F({ timer: h.timers.length + 1 }), callback, delay, due: h.now + BigInt(delay) * MS, fired: false, cancelled: false };
      h.timers.push(item);
      h.peakTimers = Math.max(h.peakTimers ?? 0, h.timers.filter(v => !v.fired && !v.cancelled).length);
      if (options.schedule) return options.schedule(item, h);
      return item.token;
    }),
    cancel: F(function cancel(token) {
      h.cancellations.push(token); const item = h.timers.find(t => t.token === token);
      if (item) item.cancelled = true;
      return options.cancel ? options.cancel(token, h) : undefined;
    }),
  };
  const lanes = F(Array.from({ length: options.laneCount ?? 2 }, (_, lane) => F({
    execute: F(function execute(command) {
      const item = { lane, at: h.now, command, receiver: this }; h.entries.push(item);
      return options.execute ? options.execute(item, h) : Promise.resolve('SUCCEEDED');
    }),
    checkBalances: F(function checkBalances() {
      h.events.push({ kind: 'balance', lane, at: h.now, receiver: this }); h.balanceCalls++;
      return options.balance ? options.balance(lane, h) : Promise.resolve(MATCH);
    }),
    openMeasurementWindow: F(function openMeasurementWindow() {
      h.events.push({ kind: 'open', lane, at: h.now, receiver: this }); h.openCalls++;
      return options.open ? options.open(lane, h) : Promise.resolve(undefined);
    }),
    stopMeasurementWindow: F(function stopMeasurementWindow() {
      h.events.push({ kind: 'stop', lane, at: h.now, receiver: this }); h.stopCalls++;
      return options.stop ? options.stop(lane, h) : Promise.resolve(undefined);
    }),
  })));
  h.configuration = { plan: { setupBudgetMs: 20, measurementWindowMs: 12, arrivalIntervalMs: 4,
    drainGraceMs: 10, maxLedgerTransactionsPerOperation: 1, ...options.plan },
    runtime, lanes, recordingLimits: { maxSamplesPerPhase: 128, maxInFlightPerPhase: 16, ...options.limits } };
  if (!options.noCreate) h.owner = create(h.configuration);
  h.fire = async function fire(item, at = item.due / MS, args = []) {
    h.now = BigInt(at) * MS; item.fired = true; item.callback(...args); await flush();
  };
  h.next = () => h.timers.filter(t => !t.fired && !t.cancelled).sort((a, b) => a.due < b.due ? -1 : a.due > b.due ? 1 : 0)[0];
  h.drive = async function drive(maximum = 10000) {
    await flush();
    for (let n = 0; n < maximum && !h.owner.inspect().finalCached; n++) {
      const item = h.next(); assert.ok(item, 'a pending source needs its original bounded timer, not a test retry');
      await h.fire(item);
    }
    assert.equal(h.owner.inspect().finalCached, true, 'bounded synthetic driver must terminate');
    return h.owner.run();
  };
  return h;
}
function accounting(result) {
  assert.equal(result.scheduledSlots, result.sourceEntries + result.busyRejectedOffers + result.schedulerMissedSlots + result.withdrawnSlots);
  assert.equal(result.evaluatedOffers, result.sourceEntries + result.busyRejectedOffers);
  assert.equal(result.queueCapacity, 0);
  assert.equal(result.borrowedResourcesClosed, false);
  assert.equal(result.fixedOfferedRateQualified, false);
  assert.equal(result.sustainableCapacityQualified, false);
  assert.equal(result.nativeResourcesQualified, false);
  assert.equal(result.productionQualified, false);
}
check('construction is inert and captures four fixed lane methods without native resources', () => {
  const h = fixture(); assert.equal(h.clockCalls, 0); assert.equal(h.timers.length, 0); assert.equal(h.events.length, 0);
  assert.equal(h.owner.inspect().phase, 'IDLE'); assert.deepEqual(Object.keys(h.owner), ['run', 'stop', 'inspect']);
});
check('fixed nominal arrivals follow successful all-lane balance and open barriers', async () => {
  const h = fixture(), p = h.owner.run(); const result = await h.drive(); assert.equal(await p, result); accounting(result);
  assert.equal(result.outcome, 'OBSERVED_SOURCES_SETTLED'); assert.equal(result.sourceEntries, 3);
  assert.deepEqual(h.entries.map(v => v.at / MS), [0n, 4n, 8n]); assert.deepEqual(h.entries.map(v => v.lane), [0, 1, 0]);
  assert.deepEqual(h.entries.map(v => v.command.ordinal), [0, 0, 1]);
  assert.ok(h.events.slice(0, 2).every(v => v.kind === 'balance')); assert.ok(h.events.slice(2, 4).every(v => v.kind === 'open'));
  assert.equal(result.opensObserved, 2); assert.equal(result.stopsObserved, 2); assert.equal(result.balanceChecks, 4);
  assert.ok(h.events.every(v => v.receiver === undefined)); assert.ok(h.entries.every(v => v.receiver === undefined));
  assert.equal(result.pendingOriginalOperations, 0); assert.equal(result.dispatchedCallRecording.phases.FUNDED_CALL.entered, 3);
});
check('busy lanes reject an independent offer without queuing and settlement creates no extra arrival', async () => {
  const first = [deferred(), deferred()];
  const h = fixture({ plan: { measurementWindowMs: 16 }, execute: item => item.command.ordinal === 0 ? first[item.lane].promise : Promise.resolve('SUCCEEDED') });
  const p = h.owner.run(); await flush();
  await h.fire(h.next(), 4); await h.fire(h.next(), 8);
  assert.equal(h.entries.length, 2); assert.equal(h.owner.inspect().busyRejectedOffers, 1);
  h.now = 9n * MS; first.forEach(d => d.resolve('SUCCEEDED')); await flush(); assert.equal(h.entries.length, 2);
  const result = await h.drive(); assert.equal(await p, result); accounting(result);
  assert.equal(result.sourceEntries, 3); assert.equal(result.busyRejectedOffers, 1); assert.equal(result.peakConcurrentOriginals, 2);
});
check('a full 16-lane 4096-slot overload never replaces an entered original', async () => {
  const pending = deferred(); const h = fixture({ laneCount: 16, plan: { measurementWindowMs: 4096, arrivalIntervalMs: 1 },
    limits: { maxSamplesPerPhase: 4096 }, execute: () => pending.promise });
  h.owner.run(); const result = await h.drive(); accounting(result);
  assert.equal(result.sourceEntries, 16); assert.equal(result.busyRejectedOffers, 4080);
  assert.equal(result.pendingOriginalOperations, 16); assert.equal(result.outcome, 'HELD_UNKNOWN');
  assert.equal(h.entries.length, 16); assert.ok(h.peakTimers <= 2);
  pending.resolve('SUCCEEDED'); await flush();
  assert.equal(h.owner.inspect().pendingOriginalOperations, 0); assert.equal(h.owner.run(), h.owner.stop());
  assert.equal((await h.owner.run()), result); assert.equal(result.pendingOriginalOperations, 16);
});
check('a late wake records missed calendar slots and admits one current offer only', async () => {
  const h = fixture({ plan: { measurementWindowMs: 20 } }); h.owner.run(); await flush();
  const arrival = h.next(); await h.fire(arrival, 10);
  assert.equal(h.entries.length, 2); assert.equal(h.entries[1].at, 10n * MS);
  assert.equal(h.owner.inspect().schedulerMissedSlots, 1); assert.equal(h.next().due, 12n * MS);
  const result = await h.drive(); accounting(result); assert.equal(result.sourceEntries, 4); assert.equal(result.schedulerMissedSlots, 1);
  assert.equal(result.sourceStartDelayRecording.phases.FUNDED_CALL.terminalLatencyNanoseconds.max, String(2n * MS));
});
check('time spent in a source callback cannot cause recursive catch-up dispatch', async () => {
  let first = true;
  const h = fixture({ plan: { measurementWindowMs: 20 }, execute: (_item, host) => {
    if (first) { first = false; host.now = 10n * MS; } return Promise.resolve('SUCCEEDED');
  } });
  h.owner.run(); await flush(); assert.equal(h.entries.length, 1); assert.equal(h.next().due, 11n * MS);
  const result = await h.drive(); accounting(result); assert.equal(result.schedulerMissedSlots, 1);
});
check('known request rejection remains in the latency denominator without becoming scheduler loss', async () => {
  const h = fixture({ execute: item => Promise.resolve(item.command.ordinal === 0 ? 'REJECTED' : 'SUCCEEDED') });
  h.owner.run(); const result = await h.drive(); const phase = result.dispatchedCallRecording.phases.FUNDED_CALL;
  accounting(result); assert.equal(result.outcome, 'OBSERVED_SOURCES_SETTLED'); assert.equal(phase.rejected, 2);
  assert.equal(phase.terminalLatencyNanoseconds.samples, 3); assert.equal(phase.successfulLatencyNanoseconds.samples, 1);
  assert.deepEqual({ ...phase.nonSuccessFraction }, { numerator: 2, denominator: 3 });
});
check('manual stop withdraws only future slots and attempts each entered window stop before drain', async () => {
  const work = deferred(), h = fixture({ execute: () => work.promise }), p = h.owner.run(); await flush();
  assert.equal(h.owner.stop(), p); await flush(); assert.equal(h.stopCalls, 2); assert.equal(h.entries.length, 1);
  assert.equal(h.owner.inspect().withdrawnSlots, 2); work.resolve('SUCCEEDED'); await flush();
  const result = await p; accounting(result); assert.equal(result.outcome, 'OBSERVED_SOURCES_SETTLED');
});
check('stop before run enters no clock-dependent lane callback or measurement barrier', async () => {
  const h = fixture(), p = h.owner.stop(); await flush();
  assert.deepEqual(h.events, []); const result = await p; accounting(result); assert.equal(result.sourceEntries, 0);
  assert.equal(result.withdrawnSlots, 3); assert.equal(h.owner.run(), p); assert.equal(h.timers.length, 0);
});
check('run and stop reserve one shared Promise before trusted clock reentry', async () => {
  let seen = null;
  const h = fixture({ clock: host => { if (host.owner && seen === null) seen = host.owner.run(); return host.now; } });
  const p = h.owner.run(); assert.equal(seen, p); await h.drive(); assert.equal(h.owner.stop(), p);
});
check('wrong arity never consumes the run or calls a lane', async () => {
  const h = fixture(); await assert.rejects(h.owner.run(1), TypeError); await assert.rejects(h.owner.stop(1), TypeError);
  assert.throws(() => h.owner.inspect(1), TypeError); assert.equal(h.events.length, 0); assert.equal(h.timers.length, 0);
  assert.equal(h.owner.inspect().phase, 'IDLE');
});
check('a clock reentering stop before source entry fences the reserved current offer', async () => {
  let done = false;
  const h = fixture({ clock: host => {
    if (host.owner && !done && host.owner.inspect().phase === 'MEASURING') { done = true; host.owner.stop(); }
    return host.now;
  } });
  const p = h.owner.run(); const result = await h.drive(); assert.equal(await p, result);
  accounting(result); assert.equal(h.entries.length, 0); assert.equal(result.sourceEntries, 0);
});
check('source callback reentry cannot start another offer after stop', async () => {
  let stopped;
  const h = fixture({ execute: (_item, host) => { stopped = host.owner.stop(); return Promise.resolve('SUCCEEDED'); } });
  const p = h.owner.run(); const result = await h.drive(); assert.equal(stopped, p); accounting(result); assert.equal(h.entries.length, 1);
});
check('stop during timer installation cancels the exact late token once', async () => {
  let reentered = false, token;
  const h = fixture({ schedule: (item, host) => {
    if (!reentered) { reentered = true; token = item.token; host.owner.stop(); } return item.token;
  } });
  const p = h.owner.run(); await flush(); const result = await p; accounting(result);
  assert.equal(h.cancellations.filter(v => v === token).length, 1); assert.equal(h.entries.length, 0);
});
check('synchronous timer delivery is HELD rather than an admission permit', async () => {
  const h = fixture({ schedule: item => { item.callback(); item.fired = true; return item.token; } });
  h.owner.run(); const result = await h.drive(); accounting(result); assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(h.entries.length, 0);
});
check('a reused timer token is refused without an implicit new observation budget', async () => {
  let previous;
  const h = fixture({ schedule: item => { if (previous === undefined) previous = item.token; return previous; } });
  h.owner.run(); const result = await h.drive(); accounting(result); assert.equal(result.outcome, 'HELD_UNKNOWN');
  assert.equal(h.entries.length, 0);
});
for (const [name, cancel] of [['non-undefined cancellation', () => false], ['throwing cancellation', () => { throw new Error('PRIVATE'); }]]) {
  check(name + ' withholds clean source success', async () => {
    const h = fixture({ cancel }); h.owner.run(); const result = await h.drive(); accounting(result);
    assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  });
}
check('early timer delivery refuses rather than reducing the fixed interval', async () => {
  const h = fixture(); h.owner.run(); await flush(); const arrival = h.next(); await h.fire(arrival, 3);
  const result = await h.drive(); accounting(result); assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(h.entries.length, 1);
});
check('wrong callback arity cannot launch another original', async () => {
  const h = fixture(); h.owner.run(); await flush(); await h.fire(h.next(), 4, [1]);
  const result = await h.drive(); accounting(result); assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(h.entries.length, 1);
});
check('a duplicate completed callback cannot resurrect a finalized window', async () => {
  const h = fixture(); h.owner.run(); await flush(); const old = h.next(); await h.fire(old);
  const result = await h.drive(); const calls = h.entries.length; old.callback(); await flush();
  assert.equal(h.entries.length, calls); assert.equal(await h.owner.run(), result);
});
check('late natural expiry does not renew the original drain deadline', async () => {
  const work = deferred(), h = fixture({ execute: () => work.promise }); h.owner.run(); await flush();
  const window = h.timers.find(t => !t.cancelled && t.delay === 12); await h.fire(window, 30);
  assert.equal(h.owner.inspect().finalCached, true); const result = await h.owner.run(); accounting(result);
  assert.equal(result.pendingOriginalOperations, 1); assert.equal(result.outcome, 'HELD_UNKNOWN');
  assert.equal(h.timers.filter(t => t.delay === 10).length, 0);
  work.resolve('SUCCEEDED'); await flush(); assert.equal(await h.owner.run(), result);
});
check('an arrival delivered beyond the window records misses without a final service entry', async () => {
  const h = fixture(); h.owner.run(); await flush(); await h.fire(h.next(), 14);
  const result = await h.drive(); accounting(result); assert.equal(h.entries.length, 1); assert.equal(result.schedulerMissedSlots, 2);
});
for (const [name, factory] of [
  ['throw', () => { throw new Error('PRIVATE_SOURCE'); }],
  ['plain return', () => 'SUCCEEDED'],
  ['thenable getter', () => Object.defineProperty({}, 'then', { get() { throw new Error('THENABLE_HOOK'); } })],
  ['proxied Promise', () => new Proxy(Promise.resolve('SUCCEEDED'), { get() { throw new Error('PROXY_HOOK'); } })],
]) {
  check('unobservable source ' + name + ' retains an UNKNOWN original through bounded drain', async () => {
    const h = fixture({ execute: factory }); h.owner.run(); const result = await h.drive(); accounting(result);
    assert.equal(result.sourceEntries, 1); assert.equal(result.pendingOriginalOperations, 1); assert.equal(result.outcome, 'HELD_UNKNOWN');
    assert.ok(!JSON.stringify(result).includes('PRIVATE_SOURCE'));
  });
}
for (const [name, execute] of [
  ['Promise rejection', () => Promise.reject(new Error('PRIVATE_REASON'))],
  ['unknown value', () => Promise.resolve('UNKNOWN')],
  ['invalid value', () => Promise.resolve({ status: 'SUCCEEDED' })],
]) {
  check(name + ' stops offered admission without retrying or replacing', async () => {
    const h = fixture({ execute }); h.owner.run(); const result = await h.drive(); accounting(result);
    assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(result.sourceEntries, 1); assert.equal(result.pendingOriginalOperations, 0);
    assert.equal(result.dispatchedCallRecording.phases.FUNDED_CALL.unknown, 1);
  });
}
check('ledger timing is explicit and never inferred from a funded-call Promise', async () => {
  const h = fixture({ execute: item => {
    const ledger = item.command.beginLedgerTransaction(); ledger.finish('SUCCEEDED'); return Promise.resolve('SUCCEEDED');
  } });
  h.owner.run(); const result = await h.drive(); accounting(result);
  assert.equal(result.ledgerStarts, 3); assert.equal(result.dispatchedCallRecording.phases.LEDGER_TRANSACTION.entered, 3);
  assert.equal(result.outcome, 'OBSERVED_SOURCES_SETTLED');
});
check('already-entered post-stop ledger work has a separate recorder and no new service offer', async () => {
  const work = deferred(); let command;
  const h = fixture({ execute: item => { command = item.command; return work.promise; } }), p = h.owner.run();
  await flush(); h.owner.stop(); await flush();
  const ledger = command.beginLedgerTransaction(); ledger.finish('SUCCEEDED'); work.resolve('SUCCEEDED'); await flush();
  const result = await p; accounting(result); assert.equal(result.sourceEntries, 1);
  assert.equal(result.dispatchedCallRecording.phases.LEDGER_TRANSACTION.entered, 0);
  assert.equal(result.postStopLedgerRecording.phases.LEDGER_TRANSACTION.entered, 1);
});
check('a settled source cannot free its lane while its ledger boundary is unresolved', async () => {
  let ledger;
  const h = fixture({ execute: item => { ledger = item.command.beginLedgerTransaction(); return Promise.resolve('SUCCEEDED'); } });
  const p = h.owner.run(); await flush(); assert.equal(h.owner.inspect().pendingOriginalOperations, 1);
  assert.equal(h.owner.inspect().pendingLedgerObservations, 1); ledger.finish('SUCCEEDED'); await flush();
  const result = await p; accounting(result); assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(h.entries.length, 1);
});
check('duplicate ledger finish cannot decrement pending work twice', async () => {
  const h = fixture({ execute: item => {
    const ledger = item.command.beginLedgerTransaction(); ledger.finish('SUCCEEDED'); assert.throws(() => ledger.finish('SUCCEEDED'), TypeError);
    return Promise.resolve('SUCCEEDED');
  } });
  h.owner.run(); const result = await h.drive(); accounting(result);
  assert.equal(result.pendingLedgerObservations, 0); assert.equal(result.pendingOriginalOperations, 0); assert.equal(result.outcome, 'HELD_UNKNOWN');
});
check('a ledger capability retained after its original settles cannot admit new work', async () => {
  let original;
  const h = fixture({ execute: item => { original ??= item.command; return Promise.resolve('SUCCEEDED'); } });
  h.owner.run(); await flush(); assert.throws(() => original.beginLedgerTransaction(), TypeError);
  const result = await h.drive(); accounting(result); assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(result.sourceEntries, 1);
});
check('a pre-measurement balance mismatch opens no service window', async () => {
  const h = fixture({ balance: () => Promise.resolve(F({ observed: F({ ...BALANCE, availableUnits: 99n }), expected: BALANCE })) });
  h.owner.run(); const result = await h.drive(); accounting(result); assert.equal(result.outcome, 'HELD_UNKNOWN');
  assert.equal(h.openCalls, 0); assert.equal(h.entries.length, 0);
});
check('post-drain balance mismatch withholds clean completion', async () => {
  const h = fixture({ balance: (_lane, host) => Promise.resolve(host.balanceCalls <= 2 ? MATCH
    : F({ observed: F({ ...BALANCE, consumedUnits: 1n }), expected: BALANCE })) });
  h.owner.run(); const result = await h.drive(); accounting(result); assert.equal(result.outcome, 'HELD_UNKNOWN');
  assert.equal(result.sourceEntries, 3);
});
check('a never-settling postcheck retains the same original drain timer', async () => {
  const later = deferred();
  const h = fixture({ balance: (_lane, host) => host.balanceCalls <= 2 ? Promise.resolve(MATCH) : later.promise });
  h.owner.run(); await flush(); await h.fire(h.next()); await h.fire(h.next()); await h.fire(h.next());
  assert.equal(h.owner.inspect().phase, 'POSTCHECK'); assert.ok(h.next(), 'postcheck must remain inside the original fixed drain budget');
  const result = await h.drive(); accounting(result); assert.equal(result.outcome, 'HELD_UNKNOWN');
  later.resolve(MATCH); await flush(); assert.equal(await h.owner.run(), result);
});
check('a never-settling precheck is bounded without opening or replacing a lane', async () => {
  const pending = deferred(), h = fixture({ balance: () => pending.promise }); h.owner.run(); const result = await h.drive();
  accounting(result); assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(result.sourceEntries, 0); assert.equal(h.openCalls, 0);
  pending.resolve(MATCH); await flush(); assert.equal(await h.owner.run(), result);
});
check('late precheck microtasks cannot cancel the expired setup deadline and open a window', async () => {
  const pending = deferred(), h = fixture({ balance: () => pending.promise });
  h.owner.run(); await flush(); h.now = 21n * MS; pending.resolve(MATCH); await flush();
  assert.equal(h.owner.inspect().finalCached, true); const result = await h.owner.run(); accounting(result);
  assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(h.openCalls, 0); assert.equal(h.entries.length, 0);
});
check('late window-open acknowledgement cannot begin measured work before a queued expiry callback', async () => {
  const pending = deferred(), h = fixture({ open: () => pending.promise });
  h.owner.run(); await flush(); h.now = 21n * MS; pending.resolve(undefined); await flush();
  const result = await h.drive(); accounting(result); assert.equal(result.outcome, 'HELD_UNKNOWN');
  assert.equal(h.entries.length, 0); assert.equal(h.stopCalls, 2);
});
check('one blocking precheck cannot enter the next lane after the fixed setup budget', async () => {
  const h = fixture({ balance: (_lane, host) => { host.now = 21n * MS; return Promise.resolve(MATCH); } });
  h.owner.run(); await flush(); const result = await h.drive(); accounting(result);
  assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(h.balanceCalls, 1); assert.equal(h.openCalls, 0);
});
check('very late setup acknowledgements do not renew grace from their arrival time', async () => {
  const pending = deferred(), h = fixture({ open: () => pending.promise });
  h.owner.run(); await flush(); h.now = 45n * MS; pending.resolve(undefined); await flush();
  assert.equal(h.owner.inspect().finalCached, true); const result = await h.owner.run(); accounting(result);
  assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(h.entries.length, 0);
  assert.equal(h.timers.filter(t => t.delay === 10).length, 0); assert.equal(h.stopCalls, 2);
});
check('late postcheck microtasks cannot beat the expired original drain timer', async () => {
  const pending = deferred(), h = fixture({ balance: (_lane, host) => host.balanceCalls <= 2 ? Promise.resolve(MATCH) : pending.promise });
  h.owner.run(); await flush(); await h.fire(h.next()); await h.fire(h.next()); await h.fire(h.next());
  assert.equal(h.owner.inspect().phase, 'POSTCHECK'); h.now = 30n * MS; pending.resolve(MATCH); await flush();
  assert.equal(h.owner.inspect().finalCached, true); const result = await h.owner.run(); accounting(result);
  assert.equal(result.outcome, 'HELD_UNKNOWN');
});
check('late original settlement cannot begin fresh balance reads beyond drain expiry', async () => {
  const pending = deferred(), h = fixture({ execute: () => pending.promise });
  h.owner.run(); await flush(); h.owner.stop(); await flush();
  h.now = 20n * MS; pending.resolve('SUCCEEDED'); await flush();
  assert.equal(h.balanceCalls, 2); assert.equal(h.owner.inspect().finalCached, true);
  const result = await h.owner.run(); accounting(result); assert.equal(result.outcome, 'HELD_UNKNOWN');
});
check('a blocking postcheck cannot enter another lane beyond the original deadline', async () => {
  const h = fixture({ balance: (_lane, host) => { if (host.balanceCalls > 2) host.now = 30n * MS; return Promise.resolve(MATCH); } });
  h.owner.run(); const result = await h.drive(); accounting(result); assert.equal(result.outcome, 'HELD_UNKNOWN');
  assert.equal(h.balanceCalls, 3);
});
check('failure to arm the only drain timer publishes HELD with the entered original still pending', async () => {
  const pending = deferred(), h = fixture({ execute: () => pending.promise,
    schedule: item => { if (item.delay === 10) throw new Error('PRIVATE_DRAIN'); return item.token; } });
  h.owner.run(); await flush(); h.owner.stop(); await flush();
  assert.equal(h.owner.inspect().finalCached, true); const result = await h.owner.run(); accounting(result);
  assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(result.pendingOriginalOperations, 1);
  pending.resolve('SUCCEEDED'); await flush(); assert.equal(await h.owner.run(), result);
});
check('wrong arity on the only drain callback cannot strand its original observation', async () => {
  const pending = deferred(), h = fixture({ execute: () => pending.promise });
  h.owner.run(); await flush(); h.owner.stop(); await flush(); await h.fire(h.next(), 10, [1]);
  assert.equal(h.owner.inspect().finalCached, true); const result = await h.owner.run(); accounting(result);
  assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(result.pendingOriginalOperations, 1);
  pending.resolve('SUCCEEDED'); await flush();
});
check('final cancellation cannot hide that the fixed drain deadline expired before publication', async () => {
  const h = fixture({ cancel: (token, host) => { if (host.timers.find(t => t.token === token)?.delay === 10) host.now = 30n * MS; } });
  h.owner.run(); const result = await h.drive(); accounting(result); assert.equal(result.outcome, 'HELD_UNKNOWN');
});
check('clock reentry during stop initialization cannot publish before every window stop is attempted', async () => {
  let reentered = false; const pending = deferred();
  const h = fixture({ execute: () => pending.promise, clock: host => {
    if (host.owner && !reentered && host.owner.inspect().phase === 'DRAINING') { reentered = true; host.owner.stop(); }
    return host.now;
  } });
  const p = h.owner.run(); await flush(); h.owner.stop(); await flush();
  assert.equal(h.stopCalls, 2); assert.equal(h.owner.inspect().finalCached, false);
  pending.resolve('SUCCEEDED'); await flush(); const result = await p; accounting(result);
  assert.equal(result.outcome, 'OBSERVED_SOURCES_SETTLED');
});
check('cancel reentry during stop initialization cannot detach uncalled window-stop capabilities', async () => {
  let reentered = false;
  const h = fixture({ cancel: (_token, host) => {
    if (host.owner && !reentered && host.owner.inspect().phase === 'DRAINING') { reentered = true; host.owner.stop(); }
  } });
  h.owner.run(); await flush(); h.owner.stop(); const result = await h.drive(); accounting(result);
  assert.equal(h.stopCalls, 2); assert.equal(result.outcome, 'OBSERVED_SOURCES_SETTLED');
});
check('manual stop beyond window expiry cannot reset grace or relabel scheduler misses as withdrawals', async () => {
  const pending = deferred(), h = fixture({ execute: () => pending.promise });
  h.owner.run(); await flush(); h.now = 30n * MS; h.owner.stop(); await flush();
  assert.equal(h.owner.inspect().finalCached, true); const result = await h.owner.run(); accounting(result);
  assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(result.stopReason, 'WINDOW_EXPIRED');
  assert.equal(result.schedulerMissedSlots, 2); assert.equal(result.withdrawnSlots, 0); assert.equal(h.stopCalls, 2);
  assert.equal(h.timers.filter(t => t.delay === 10).length, 0); pending.resolve('SUCCEEDED'); await flush();
});
check('manual stop beyond setup expiry cannot obtain a new grace period', async () => {
  const pending = deferred(), h = fixture({ balance: () => pending.promise });
  h.owner.run(); await flush(); h.now = 40n * MS; h.owner.stop(); await flush();
  assert.equal(h.owner.inspect().finalCached, true); const result = await h.owner.run(); accounting(result);
  assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(result.stopReason, 'SETUP_EXPIRED');
  assert.equal(h.timers.filter(t => t.delay === 10).length, 0); assert.equal(h.openCalls, 0);
  pending.resolve(MATCH); await flush();
});
check('one unknown stop cannot suppress the remaining independent stop attempts', async () => {
  const h = fixture({ stop: lane => lane === 0 ? undefined : Promise.resolve(undefined) });
  h.owner.run(); const result = await h.drive(); accounting(result); assert.equal(h.stopCalls, 2);
  assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(result.pendingControlObservations, 1);
});
check('an unresolved window-open Promise stays pending after an observed stop', async () => {
  const pending = deferred(), h = fixture({ open: () => pending.promise }); h.owner.run(); await flush();
  h.owner.stop(); const result = await h.drive(); accounting(result); assert.equal(h.stopCalls, 2);
  assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(result.sourceEntries, 0);
  pending.resolve(undefined); await flush(); assert.equal(await h.owner.run(), result);
});
check('clock regression fails closed without a renewed measurement window', async () => {
  let call = 0; const h = fixture({ clock: host => (++call === 3 ? -1n : host.now) });
  h.owner.run(); const result = await h.drive(); accounting(result); assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(h.entries.length, 0);
});
check('clock range overflow cannot arm an out-of-range future deadline', async () => {
  const h = fixture({ clock: () => (1n << 128n) - 1n }); h.owner.run(); await flush();
  assert.equal(h.owner.inspect().finalCached, true); const result = await h.owner.run(); accounting(result);
  assert.equal(result.outcome, 'HELD_UNKNOWN'); assert.equal(h.entries.length, 0);
});
for (const [name, edit] of [
  ['zero interval', c => { c.plan.arrivalIntervalMs = 0; }],
  ['boolean interval', c => { c.plan.arrivalIntervalMs = true; }],
  ['negative zero duration', c => { c.plan.measurementWindowMs = -0; }],
  ['unbounded slots', c => { c.plan.measurementWindowMs = 60000; c.plan.arrivalIntervalMs = 1; }],
  ['ledger reservation overflow', c => { c.plan.maxLedgerTransactionsPerOperation = 8; c.recordingLimits.maxSamplesPerPhase = 16; }],
  ['too few in-flight observations', c => { c.recordingLimits.maxInFlightPerPhase = 1; }],
  ['extra lane close callback', c => { c.lanes = F([F({ ...c.lanes[0], close: F(() => undefined) })]); }],
  ['duplicate lane', c => { c.lanes = F([c.lanes[0], c.lanes[0]]); }],
  ['mutable lanes', c => { c.lanes = [...c.lanes]; }],
  ['accessor plan', c => { Object.defineProperty(c.plan, 'arrivalIntervalMs', { enumerable: true, get() { throw new Error('HOOK'); } }); }],
]) {
  check('configuration rejects ' + name + ' before any trusted callback', () => {
    const h = fixture({ noCreate: true }); edit(h.configuration); assert.throws(() => create(h.configuration), TypeError);
    assert.equal(h.clockCalls, 0); assert.equal(h.events.length, 0); assert.equal(h.timers.length, 0);
  });
}
after(() => console.log('# actual-offered-window-source-data ' + JSON.stringify({
  entered, completed, names, sourceLanesAreDeclared: true, sourceLedgerAndBalanceCallbacksAreDeclared: true,
  hostClockAndTimersAreDeclared: true, SDK: false, SQLite: false, signatures: 0, sockets: 0, borrowedResourcesClosed: false,
  nativeCapacityQualified: false,
})));
