// Declared clocks, callback lanes and deadline delivery; no native resources.
import assert from 'node:assert/strict';
const F = Object.freeze, MS = 1000000n;
const BALANCE = F({ availableUnits: 100n, heldUnits: 0n, consumedUnits: 0n });
const MATCH = F({ observed: BALANCE, expected: BALANCE });
export function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function flush() { for (let i = 0; i < 32; i++) await undefined; }
async function flushWorkload() { for (let i = 0; i < 64; i++) await undefined; }
export function createWindowFixture(create, options = {}) {
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
export function createWorkloadFixture(create, options = {}) {
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
    h.now = BigInt(at) * MS; item.fired = true; item.callback(...args); await flushWorkload();
  };
  h.drive = async (maximum = 10000) => {
    await flushWorkload();
    for (let i = 0; i < maximum && !h.owner.inspect().finalCached; i++) {
      const item = h.next(); assert.ok(item, 'a pending pipeline must keep its original bounded deadline');
      await h.fire(item);
    }
    assert.equal(h.owner.inspect().finalCached, true, 'synthetic pipeline driver must terminate'); return h.owner.run();
  };
  return h;
}
