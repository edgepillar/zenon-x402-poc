import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { captureServiceCreditCapacityOfferedPlanData as capture } from '../src/service-credit-capacity-offered-plan-data.js';
import { createServiceCreditCapacityOfferedWorkloadOwnerCore as owner } from '../src/service-credit-capacity-offered-workload-owner-core.js';
if (process.version !== 'v24.19.0' || process.env.X402_OFFERED_PLAN_DATA_SELECTION !== 'source-offered-plan-data-v1')
  throw new TypeError('EXACT_OFFERED_PLAN_DATA_SELECTION_REQUIRED');
const F = Object.freeze, MS = 1000000n;
let entered = 0, completed = 0; const names = [];
function check(name, body) {
  names.push(name); test(name, { concurrency: false }, async () => { entered++; await body(); completed++; });
}
function input(overrides = {}) {
  const { plan, recordingLimits, ...rest } = overrides;
  return {
    plan: { warmupCallsPerLane: 1, measurementCallsPerLane: 3, setupBudgetMs: 20,
      measurementWindowMs: 12, drainGraceMs: 10, maxLedgerTransactionsPerOperation: 1, arrivalIntervalMs: 4, ...plan },
    recordingLimits: { maxSamplesPerPhase: 128, maxInFlightPerPhase: 16, ...recordingLimits },
    laneCount: 2, commandBudgetMs: 1000, closeBudgetMs: 6000, ...rest,
  };
}
function rejects(value) { assert.throws(() => capture(value), { code: 'SERVICE_CREDIT_CAPACITY_OFFERED_PLAN_DATA_REJECTED' }); }
function frozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value)); for (const child of Object.values(value)) frozen(child);
}
function boundary(value) {
  assert.equal(value.actualEffectsExecuted, false); assert.equal(value.nativeAllowanceGranted, false);
  assert.equal(value.storageAdmissionQualified, false); assert.equal(value.sourceAndPackagesAuthenticated, false);
  assert.equal(value.osDeadlineGuaranteed, false); assert.equal(value.offeredRateQualified, false);
  assert.equal(value.sustainableCapacityQualified, false); assert.equal(value.productionQualified, false);
  assert.equal(value.authority, 'NONE'); assert.equal(value.queueCapacity, 0);
  assert.equal(value.laneShareAssumedEqual, false); assert.equal(value.unusedReservationsReplayed, false);
  frozen(value);
}
async function flush() { for (let i = 0; i < 512; i++) await undefined; }
function pipeline(captured, options = {}) {
  let now = 0n; const timers = [], calls = [], balances = [], closes = [], funding = [];
  const balance = F({ availableUnits: 100n, heldUnits: 0n, consumedUnits: 0n });
  const runtime = {
    monotonicNowNs: F(() => now),
    schedule: F((callback, ms) => {
      const item = { callback, due: now + BigInt(ms) * MS, live: true }; timers.push(item); return item;
    }),
    cancel: F(item => { item.live = false; return undefined; }),
  };
  const lanes = F(Array.from({ length: captured.laneCount }, (_, lane) => F({
    fund: F(() => { funding.push(lane); return Promise.resolve('SUCCEEDED'); }),
    execute: F(command => {
      const record = { lane, cohort: command.cohort, ordinal: command.ordinal, at: now }; calls.push(record);
      return options.execute ? options.execute(record) : Promise.resolve('SUCCEEDED');
    }),
    checkBalances: F(() => { balances.push(lane); return Promise.resolve(F({ observed: balance, expected: balance })); }),
    openMeasurementWindow: F(() => Promise.resolve(undefined)),
    stopMeasurementWindow: F(() => Promise.resolve(undefined)),
    close: F(() => { closes.push(lane); return Promise.resolve(undefined); }),
  })));
  const actual = owner({ plan: captured.ownerPlan, recordingLimits: captured.recordingLimits, runtime, lanes });
  async function drive() {
    await flush();
    for (let i = 0; i < 600 && !actual.inspect().finalCached; i++) {
      const next = timers.filter(t => t.live).sort((a, b) => a.due < b.due ? -1 : a.due > b.due ? 1 : 0)[0];
      assert.ok(next); now = next.due; next.live = false; next.callback(); await flush();
    }
    assert.equal(actual.inspect().finalCached, true); return actual.run();
  }
  return { actual, drive, calls, funding, balances, closes };
}
check('captures the complete native source plan without assuming equal lane shares', () => {
  const got = capture(input()); boundary(got);
  assert.equal(got.globalScheduledOffers, 3); assert.equal(got.serviceCallReservationPerLane, 4);
  assert.equal(got.serviceCallReservationAllLanes, 8); assert.equal(got.syntheticFundingUnitsPerLane, 8);
  assert.equal(got.measuredOriginalsAtMost, 3); assert.equal(got.fundingOriginalsReserved, 2);
  assert.equal(got.warmupOriginalsReserved, 2); assert.equal(got.childProcessesReserved, 4);
  assert.equal(got.balanceBarrierCallsReserved, 6); assert.equal(got.cooperativeWholePlanBudgetMs, 6042);
  assert.equal(got.ownerPlan.closeGraceMs, 6000); assert.equal(Object.hasOwn(got.adapterPlan, 'closeGraceMs'), false);
});
check('captures mutable inputs once and returns no caller-owned nested objects', () => {
  const original = input(), got = capture(original); original.plan.arrivalIntervalMs = 99;
  original.recordingLimits.maxSamplesPerPhase = 1; original.laneCount = 16;
  assert.equal(got.adapterPlan.arrivalIntervalMs, 4); assert.equal(got.recordingLimits.maxSamplesPerPhase, 128);
  assert.equal(got.laneCount, 2); boundary(got);
});
check('native source plan and genuine funded offered coordinator compose', async () => {
  const selected = capture(input()), h = pipeline(selected), pending = h.actual.run(), got = await h.drive();
  assert.equal(await pending, got); assert.equal(got.outcome, 'OBSERVED_SOURCE_OWNERS_RETURNED');
  assert.equal(got.fundingEntries, selected.fundingOriginalsReserved); assert.equal(got.warmupEntries, selected.warmupOriginalsReserved);
  assert.equal(h.calls.filter(c => c.cohort === 'MEASUREMENT').length, selected.globalScheduledOffers);
  assert.equal(h.balances.length, selected.balanceBarrierCallsReserved); assert.equal(h.closes.length, selected.laneCount);
  assert.equal(got.offeredMeasurement.schedulerMissedSlots, 0); assert.equal(got.offeredMeasurement.busyRejectedOffers, 0);
});
check('non-divisible window uses ceil offers and does not allocate another call at its endpoint', async () => {
  const selected = capture(input({ plan: { measurementWindowMs: 10 } })), h = pipeline(selected);
  h.actual.run(); const got = await h.drive();
  assert.equal(got.outcome, 'OBSERVED_SOURCE_OWNERS_RETURNED'); assert.equal(selected.globalScheduledOffers, 3);
  assert.deepEqual(h.calls.filter(c => c.cohort === 'MEASUREMENT').map(c => String(c.at)), ['0', '4000000', '8000000']);
});
check('zero warmup and one lane still execute three genuine fresh balance barriers', async () => {
  const selected = capture(input({ laneCount: 1, plan: { warmupCallsPerLane: 0 } })), h = pipeline(selected);
  h.actual.run(); const got = await h.drive(); assert.equal(got.outcome, 'OBSERVED_SOURCE_OWNERS_RETURNED');
  assert.equal(h.calls.length, 3); assert.equal(h.balances.length, 3); assert.equal(h.funding.length, 1);
});
check('maximum sixteen-lane budget composes without dividing global offers among lanes', async () => {
  const selected = capture(input({ laneCount: 16 })), h = pipeline(selected);
  h.actual.run(); const got = await h.drive(); assert.equal(got.outcome, 'OBSERVED_SOURCE_OWNERS_RETURNED');
  assert.equal(selected.serviceCallReservationAllLanes, 64); assert.equal(selected.globalScheduledOffers, 3);
  assert.equal(h.funding.length, 16); assert.equal(h.balances.length, 48); assert.equal(h.closes.length, 16);
  assert.equal(h.calls.filter(c => c.cohort === 'MEASUREMENT').length, 3);
});
check('rejected offered originals cannot increase the selected funding or call budget', async () => {
  const selected = capture(input()), h = pipeline(selected, { execute: record => Promise.resolve(record.cohort === 'MEASUREMENT' ? 'REJECTED' : 'SUCCEEDED') });
  h.actual.run(); const got = await h.drive(); assert.equal(got.outcome, 'OBSERVED_SOURCE_OWNERS_RETURNED');
  assert.equal(h.calls.filter(c => c.cohort === 'MEASUREMENT').length, 3); assert.equal(h.funding.length, 2);
  assert.equal(got.offeredMeasurement.sourceEntries, 3); assert.equal(selected.unusedReservationsReplayed, false);
});
check('full 256-call per-lane reservation remains finite at sixteen lanes', () => {
  const got = capture(input({ laneCount: 16, plan: { warmupCallsPerLane: 255, measurementCallsPerLane: 1,
    measurementWindowMs: 1, arrivalIntervalMs: 1 }, recordingLimits: { maxSamplesPerPhase: 4096, maxInFlightPerPhase: 16 } }));
  boundary(got); assert.equal(got.serviceCallReservationPerLane, 256); assert.equal(got.syntheticFundingUnitsPerLane, 512);
  assert.equal(got.serviceCallReservationAllLanes, 4096); assert.equal(got.requiredSamplesPerPhase, 4096);
});
check('ledger and balance sample requirements match genuine owner construction', async () => {
  const got = capture(input({ laneCount: 3, plan: { warmupCallsPerLane: 2, maxLedgerTransactionsPerOperation: 8 },
    recordingLimits: { maxSamplesPerPhase: 72, maxInFlightPerPhase: 3 } }));
  assert.equal(got.prefixLedgerSlotsReserved, 72); assert.equal(got.measuredLedgerSlotsReserved, 24);
  assert.equal(got.requiredSamplesPerPhase, 72); const h = pipeline(got); h.actual.run();
  assert.equal((await h.drive()).outcome, 'OBSERVED_SOURCE_OWNERS_RETURNED');
});
check('exact cooperative whole-plan ceiling is admitted without becoming an OS deadline', () => {
  const got = capture(input({ plan: { setupBudgetMs: 53978 } })); boundary(got);
  assert.equal(got.cooperativeWholePlanBudgetMs, 60000);
});
const refusals = [
  ['zero lanes', { laneCount: 0 }], ['seventeenth lane', { laneCount: 17 }],
  ['fractional lane count', { laneCount: 1.5 }], ['negative zero warmup', { plan: { warmupCallsPerLane: -0 } }],
  ['equal-share underfunding', { plan: { measurementCallsPerLane: 2 } }],
  ['implicit extra per-lane funding', { plan: { measurementCallsPerLane: 4 } }],
  ['257 calls per native lane', { plan: { warmupCallsPerLane: 254 } }],
  ['expired setup', { plan: { setupBudgetMs: 0 } }], ['expired drain', { plan: { drainGraceMs: 0 } }],
  ['zero measurement interval', { plan: { arrivalIntervalMs: 0 } }],
  ['too coarse interval', { plan: { arrivalIntervalMs: 1001 } }],
  ['zero measurement window', { plan: { measurementWindowMs: 0 } }],
  ['renewed total deadline', { plan: { setupBudgetMs: 53979 } }],
  ['insufficient prefix ledger recording', { laneCount: 3, plan: { warmupCallsPerLane: 2, maxLedgerTransactionsPerOperation: 8 },
    recordingLimits: { maxSamplesPerPhase: 71, maxInFlightPerPhase: 3 } }],
  ['insufficient measurement ledger recording', { laneCount: 1, plan: { warmupCallsPerLane: 0, maxLedgerTransactionsPerOperation: 8 },
    recordingLimits: { maxSamplesPerPhase: 23, maxInFlightPerPhase: 1 } }],
  ['insufficient two-round balance recording', { laneCount: 16, plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 1, measurementWindowMs: 1, arrivalIntervalMs: 1 },
    recordingLimits: { maxSamplesPerPhase: 31, maxInFlightPerPhase: 16 } }],
  ['insufficient in-flight lane recording', { laneCount: 3, recordingLimits: { maxInFlightPerPhase: 2 } }],
  ['in-flight slots exceeding sample slots', { recordingLimits: { maxSamplesPerPhase: 4, maxInFlightPerPhase: 5 } }],
  ['excessive source sample count', { recordingLimits: { maxSamplesPerPhase: 4097 } }],
  ['excessive per-operation ledger budget', { plan: { maxLedgerTransactionsPerOperation: 9 } }],
  ['short native close ceiling', { closeBudgetMs: 5999 }], ['long native close ceiling', { closeBudgetMs: 15001 }],
  ['short child command ceiling', { commandBudgetMs: 999 }], ['long child command ceiling', { commandBudgetMs: 60001 }],
  ['string numeric authority', { laneCount: '2' }], ['NaN numeric authority', { commandBudgetMs: NaN }],
];
for (const [name, mutation] of refusals) check('refuses ' + name, () => rejects(input(mutation)));
check('rejects an injected runtime or native owner instead of entering it', () => {
  let calls = 0; const value = input(); value.runtime = () => { calls++; }; rejects(value); assert.equal(calls, 0);
});
check('rejects accessors without invoking them', () => {
  let calls = 0; const value = input(); Object.defineProperty(value.plan, 'arrivalIntervalMs', { enumerable: true, get() { calls++; return 4; } });
  rejects(value); assert.equal(calls, 0);
});
check('rejects proxy and numeric coercion without entering traps', () => {
  let calls = 0; rejects(new Proxy(input(), { ownKeys() { calls++; throw Error(); } })); assert.equal(calls, 0);
  rejects(input({ laneCount: { valueOf() { calls++; return 2; } } })); assert.equal(calls, 0);
});
check('rejects symbol extras, sparse-shaped arrays and inherited plans', () => {
  const a = input(); a[Symbol('extra')] = true; rejects(a);
  const b = input(); b.recordingLimits = []; rejects(b);
  const c = input(); c.plan = Object.create(c.plan); rejects(c);
});
check('rejects missing fields and wrong argument counts', () => {
  const value = input(); delete value.closeBudgetMs; rejects(value);
  assert.throws(() => capture()); assert.throws(() => capture(input(), input()));
});
after(() => {
  assert.equal(entered, names.length); assert.equal(completed, names.length);
  process.stdout.write('OFFERED_PLAN_DATA_SUMMARY ' + JSON.stringify({ entered, completed, names,
    nativeExecutions: 0, SDK: 0, SQL: 0, keys: 0, signatures: 0, nonceSearch: 0, sockets: 0,
    actualSourcePipelineImported: true, nativeBindingImported: false }) + '\n');
});
