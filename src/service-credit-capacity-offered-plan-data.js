import { types as utilTypes } from 'node:util';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, O = Object.hasOwn;
const PLAN = F(['warmupCallsPerLane', 'measurementCallsPerLane', 'setupBudgetMs',
  'measurementWindowMs', 'drainGraceMs', 'maxLedgerTransactionsPerOperation', 'arrivalIntervalMs']);

/**
 * Pure admission of the complete offered workload's finite source plan.
 * Used by the real parent and adapter BEFORE acquiring any native lane.
 * No root/file/namespace authentication, resource admission or execution.
 * The global calendar is not divided equally among lanes: one fast lane can
 * receive every offer. Unused funded reservations are never replay authority.
 */
export function captureServiceCreditCapacityOfferedPlanData(configuration) {
  if (arguments.length !== 1) fail();
  const c = exact(configuration, ['plan', 'recordingLimits', 'laneCount', 'commandBudgetMs', 'closeBudgetMs']);
  const plan = F(exact(c.plan, PLAN));
  const recordingLimits = F(exact(c.recordingLimits, ['maxSamplesPerPhase', 'maxInFlightPerPhase']));
  integer(c.laneCount, 1, 16); integer(c.commandBudgetMs, 1000, 60000); integer(c.closeBudgetMs, 6000, 15000);
  integer(plan.warmupCallsPerLane, 0, 255); integer(plan.measurementCallsPerLane, 1, 256);
  for (const name of ['setupBudgetMs', 'measurementWindowMs', 'drainGraceMs']) integer(plan[name], 1, 60000);
  integer(plan.arrivalIntervalMs, 1, 1000); integer(plan.maxLedgerTransactionsPerOperation, 1, 8);
  integer(recordingLimits.maxSamplesPerPhase, 1, 4096); integer(recordingLimits.maxInFlightPerPhase, 1, 64);
  const offers = Math.ceil(plan.measurementWindowMs / plan.arrivalIntervalMs);
  const perLane = plan.warmupCallsPerLane + offers;
  const prefixSlots = c.laneCount * (1 + plan.warmupCallsPerLane);
  const prefixLedgerSlots = prefixSlots * plan.maxLedgerTransactionsPerOperation;
  const measuredLedgerSlots = offers * plan.maxLedgerTransactionsPerOperation;
  const totalBudgetMs = plan.setupBudgetMs + plan.measurementWindowMs + plan.drainGraceMs + c.closeBudgetMs;
  const requiredSamples = Math.max(prefixLedgerSlots, measuredLedgerSlots, 2 * c.laneCount);
  if (plan.measurementCallsPerLane !== offers || perLane > 256 || totalBudgetMs > 60000
      || recordingLimits.maxSamplesPerPhase < requiredSamples
      || recordingLimits.maxInFlightPerPhase < c.laneCount
      || recordingLimits.maxInFlightPerPhase > recordingLimits.maxSamplesPerPhase) fail();
  return F({
    offeredPlanDataVersion: 1,
    scope: 'FINITE_SOURCE_PLAN_NOT_NATIVE_OR_STORAGE_ADMISSION',
    adapterPlan: plan, ownerPlan: F({ ...plan, closeGraceMs: c.closeBudgetMs }),
    recordingLimits, laneCount: c.laneCount, commandBudgetMs: c.commandBudgetMs, closeBudgetMs: c.closeBudgetMs,
    globalScheduledOffers: offers,
    serviceCallReservationPerLane: perLane,
    serviceCallReservationAllLanes: c.laneCount * perLane,
    syntheticFundingUnitsPerLane: 2 * perLane,
    fundingOriginalsReserved: c.laneCount, warmupOriginalsReserved: c.laneCount * plan.warmupCallsPerLane,
    measuredOriginalsAtMost: offers,
    prefixLedgerSlotsReserved: prefixLedgerSlots, measuredLedgerSlotsReserved: measuredLedgerSlots,
    requiredSamplesPerPhase: requiredSamples, balanceBarrierCallsReserved: 3 * c.laneCount,
    childProcessesReserved: 2 * c.laneCount, cooperativeWholePlanBudgetMs: totalBudgetMs,
    laneShareAssumedEqual: false, unusedReservationsReplayed: false, queueCapacity: 0,
    actualEffectsExecuted: false, sourceAndPackagesAuthenticated: false,
    storageAdmissionQualified: false, nativeAllowanceGranted: false,
    osDeadlineGuaranteed: false, offeredRateQualified: false, sustainableCapacityQualified: false,
    productionQualified: false, authority: 'NONE',
  });
}
function exact(value, names) {
  if (value === null || typeof value !== 'object' || utilTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) {
    const item = D(value, name);
    if (!item || !O(item, 'value') || !item.enumerable) fail();
    Object.defineProperty(out, name, { value: item.value, enumerable: true });
  }
  return out;
}
function integer(value, low, high) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < low || value > high) fail();
}
function fail() {
  const code = 'SERVICE_CREDIT_CAPACITY_OFFERED_PLAN_DATA_REJECTED', error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code }); throw F(error);
}
