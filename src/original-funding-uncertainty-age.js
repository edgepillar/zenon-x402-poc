import { types } from 'node:util';
import { inspectOriginalFundingSpendingState } from './original-funding-spending-reservations.js';

const F = Object.freeze;
function fail() { throw new TypeError('ORIGINAL_FUNDING_UNCERTAINTY_AGE'); }
function day(value) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < 0 || value > 2147483647) fail();
  return value;
}
function limits(input) {
  const names = ['version', 'maximumUnresolvedAgeDays'];
  if (input === null || typeof input !== 'object' || types.isProxy(input)
      || Object.getPrototypeOf(input) !== Object.prototype || Reflect.ownKeys(input).length !== names.length) fail();
  const out = {};
  for (const name of names) {
    const d = Object.getOwnPropertyDescriptor(input, name);
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail();
    out[name] = d.value;
  }
  if (out.version !== 1) fail();
  day(out.maximumUnresolvedAgeDays);
  return F(out);
}

/** Read-only classification of the existing canonical spending history.
 * The age starts at reservation, not at an unknowable signing/funding instant.
 * Caller-selected UTC day and threshold are observations/policy, not trusted
 * time, durable owner admission, payment expiry or permission to reconcile.
 * No backend, clock callback, mutation, release or external operation exists. */
export function inspectOriginalFundingUncertaintyAge(raw, policy, observedDay, ageLimits) {
  if (arguments.length !== 4) fail();
  const selected = limits(ageLimits), today = day(observedDay);
  const state = inspectOriginalFundingSpendingState(raw, policy);
  if (today < state.lastDay) fail();
  let reserved = 0, unknown = 0, spent = 0, oldestUnresolved = null, oldestUnknown = null;
  for (const row of state.reservations) {
    if (row.status === 'SPENT') { spent++; continue; }
    if (row.status === 'RESERVED') reserved++;
    else { unknown++; oldestUnknown = oldestUnknown === null ? row.reservedDay : Math.min(oldestUnknown, row.reservedDay); }
    oldestUnresolved = oldestUnresolved === null ? row.reservedDay : Math.min(oldestUnresolved, row.reservedDay);
  }
  const oldestAge = oldestUnresolved === null ? null : today - oldestUnresolved;
  const unknownAge = oldestUnknown === null ? null : today - oldestUnknown;
  const exceeded = oldestAge !== null && oldestAge > selected.maximumUnresolvedAgeDays;
  return F({ fundingUncertaintyAgeVersion: 1, policyId: state.policy.policyId,
    recordedDay: state.lastDay, observedDay: today, maximumUnresolvedAgeDays: selected.maximumUnresolvedAgeDays,
    reservedCount: reserved, unknownCount: unknown, spentCount: spent, unresolvedCount: reserved + unknown,
    oldestUnresolvedReservedDay: oldestUnresolved, oldestUnknownReservedDay: oldestUnknown,
    maximumUnresolvedReservationAgeDays: oldestAge, maximumUnknownReservationAgeDays: unknownAge,
    ageLimitExceeded: exceeded, operatorEscalationRequired: exceeded,
    classification: exceeded ? 'UNRESOLVED_RESERVATION_AGE_EXCEEDED'
      : reserved + unknown > 0 ? 'UNRESOLVED_ORIGINAL_RETAINED' : 'NO_UNRESOLVED_ORIGINAL_OBSERVED',
    singleOriginalAdmissionBlockedByHistory: reserved + unknown > 0,
    historicalObservation: true, reconciliationRequired: reserved + unknown > 0,
    spendingReservation: 'UNCHANGED', mayStartPayment: false, maySignPayment: false,
    maySubmitFunding: false, mayDispatchService: false, mayReleaseReservation: false,
    paymentExpiry: 'NOT_ESTABLISHED', nativeResourceRelease: 'NOT_ESTABLISHED', authority: 'NONE' });
}
