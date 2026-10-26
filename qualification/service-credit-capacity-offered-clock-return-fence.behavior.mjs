import assert from 'node:assert/strict';
import { createServiceCreditCapacityOfferedWindowOwnerCore as create } from '../src/service-credit-capacity-offered-window-owner-core.js';

// Pure SOURCE callback controls: virtual time/timers and synthetic lane results.
// Descriptor edits are confined to this process and restored before every case exits.
const MODE = process.env.X402_OFFERED_CLOCK_RETURN_SELECTION;
assert.equal(process.version, 'v24.19.0');
assert.ok(['observe-original-clock-return-v1', 'require-clock-return-fence-v1'].includes(MODE));
const F = Object.freeze, D = Object.getOwnPropertyDescriptor, DEFINE = Object.defineProperty;
const MS = 1000000n, rows = [];
const TARGETS = [
  ['then', Promise.prototype, 'then'],
  ['constructor', Promise.prototype, 'constructor'],
  ['species', Promise, Symbol.species],
];
const BALANCE = F({ availableUnits: 100n, heldUnits: 0n, consumedUnits: 0n });
const MATCH = F({ observed: BALANCE, expected: BALANCE });
async function flush() { for (let i = 0; i < 64; i++) await undefined; }

async function scenario(boundary, target) {
  const [intrinsic, object, name] = target;
  const original = D(object, name);
  const h = { now: 0n, calls: 0, timers: [], mutated: false, armedLedger: false,
    scheduleUnderChange: 0, balanceUnderChange: 0, sourceUnderChange: 0,
    ledgerHandleUnderChange: 0, sourceEntries: 0, owner: null };
  const changed = () => D(object, name).enumerable !== original.enumerable;
  const restore = () => DEFINE(object, name, original);
  const runtime = {
    monotonicNowNs: F(function monotonicNowNs() {
      h.calls++;
      const selected = boundary === 'initial-clock' && h.calls === 1
        || boundary === 'precheck-clock' && h.calls === 2
        || boundary === 'dispatch-clock' && h.owner.inspect().phase === 'MEASURING'
        || boundary === 'ledger-clock' && h.armedLedger;
      if (boundary !== 'baseline' && !h.mutated && selected) {
        h.mutated = true;
        DEFINE(object, name, { ...original, enumerable: !original.enumerable });
        // The application must fence work synchronously before this restoration.
        queueMicrotask(restore);
      }
      return h.now;
    }),
    schedule: F(function schedule(callback, delay) {
      if (changed()) h.scheduleUnderChange++;
      const item = { token: F({ ordinal: h.timers.length + 1 }), callback,
        due: h.now + BigInt(delay) * MS, fired: false, cancelled: false };
      h.timers.push(item); return item.token;
    }),
    cancel: F(function cancel(token) {
      const item = h.timers.find(value => value.token === token);
      if (item) item.cancelled = true;
    }),
  };
  const lane = F({
    execute: F(function execute(command) {
      h.sourceEntries++; if (changed()) h.sourceUnderChange++;
      if (boundary === 'ledger-clock') {
        h.armedLedger = true;
        try {
          const handle = command.beginLedgerTransaction();
          if (changed()) h.ledgerHandleUnderChange++;
          handle.finish('SUCCEEDED');
        } catch (error) { assert.ok(error instanceof TypeError); }
        finally { h.armedLedger = false; }
      }
      return Promise.resolve('SUCCEEDED');
    }),
    checkBalances: F(function checkBalances() {
      if (changed()) h.balanceUnderChange++;
      return Promise.resolve(MATCH);
    }),
    openMeasurementWindow: F(function openMeasurementWindow() { return Promise.resolve(undefined); }),
    stopMeasurementWindow: F(function stopMeasurementWindow() { return Promise.resolve(undefined); }),
  });
  try {
    h.owner = create({ plan: { setupBudgetMs: 20, measurementWindowMs: 12,
      arrivalIntervalMs: 4, drainGraceMs: 10, maxLedgerTransactionsPerOperation: 1 },
    recordingLimits: { maxSamplesPerPhase: 32, maxInFlightPerPhase: 1 },
    runtime, lanes: F([lane]) });
    const running = h.owner.run();
    await flush();
    for (let count = 0; count < 32 && !h.owner.inspect().finalCached; count++) {
      const item = h.timers.filter(value => !value.fired && !value.cancelled)
        .sort((a, b) => a.due < b.due ? -1 : a.due > b.due ? 1 : 0)[0];
      assert.ok(item, 'a pending observation retains its original virtual timer');
      h.now = item.due; item.fired = true; item.callback(); await flush();
    }
    assert.equal(h.owner.inspect().finalCached, true);
    const result = await running;
    assert.equal(h.owner.run(), running); assert.equal(h.owner.stop(), running);
    assert.equal(result.scheduledSlots, result.sourceEntries + result.busyRejectedOffers
      + result.schedulerMissedSlots + result.withdrawnSlots);
    assert.equal(result.borrowedResourcesClosed, false);
    assert.equal(result.nativeResourcesQualified, false); assert.equal(result.authority, 'NONE');
    const unintendedEntry = h.scheduleUnderChange + h.balanceUnderChange
      + h.sourceUnderChange + h.ledgerHandleUnderChange;
    if (boundary === 'baseline') {
      assert.equal(h.mutated, false); assert.equal(unintendedEntry, 0);
      assert.equal(result.sourceEntries, 3); assert.equal(result.outcome, 'OBSERVED_SOURCES_SETTLED');
    } else {
      assert.equal(h.mutated, true); assert.equal(result.outcome, 'HELD_UNKNOWN');
      if (MODE === 'require-clock-return-fence-v1') assert.equal(unintendedEntry, 0);
      else assert.ok(unintendedEntry > 0, 'the original behavior must actually reproduce');
    }
    rows.push({ boundary, intrinsic, mutationReached: h.mutated, unintendedEntry,
      scheduleUnderChange: h.scheduleUnderChange, balanceUnderChange: h.balanceUnderChange,
      sourceUnderChange: h.sourceUnderChange, ledgerHandleUnderChange: h.ledgerHandleUnderChange,
      sourceEntries: result.sourceEntries, pendingOriginalOperations: result.pendingOriginalOperations,
      outcome: result.outcome, issue: result.issue });
  } finally { restore(); await flush(); assert.deepEqual(D(object, name), original); }
}

await scenario('baseline', TARGETS[0]);
for (const boundary of ['initial-clock', 'precheck-clock', 'dispatch-clock', 'ledger-clock'])
  for (const target of TARGETS) await scenario(boundary, target);
console.log(JSON.stringify({
  event: 'OFFERED_CLOCK_RETURN_FENCE_ACTUAL_SOURCE_DATA', mode: MODE, valid: true,
  cases: rows.length, rows, virtualClockAndTimers: true, callbacksAreDeclared: true,
  SDK: false, SQLite: false, signatures: false, nonce: false, sockets: false,
  nativeApplications: 0, storageRootRead: false, authority: 'NONE',
}));
