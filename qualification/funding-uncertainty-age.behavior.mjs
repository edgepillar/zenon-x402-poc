import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createOriginalFundingSpendingReservations as journal } from '../src/original-funding-spending-reservations.js';
import { inspectOriginalFundingUncertaintyAge as inspect } from '../src/original-funding-uncertainty-age.js';

const F = Object.freeze, checks = [];
const check = (id, run) => checks.push({ id, run });
const policy = F({ version: 1, policyId: 'synthetic.age.1', accountId: 'synthetic.payer', network: 'zenon:testnet',
  asset: 'synthetic.asset', recipients: F(['synthetic.payee']), maxPayment: '10', maxTotal: '30', maxDaily: '30', maxRecords: 16 });
const threshold = days => ({ version: 1, maximumUnresolvedAgeDays: days });
const original = i => ({ paymentId: 'payment.' + i, originalDigest: 'sha256:' + String(i).padStart(64, '0'),
  network: policy.network, asset: policy.asset, recipient: policy.recipients[0], amount: '1' });
function memory() {
  const s = { raw: null, loads: 0, writes: 0, loseAck: false };
  s.backend = F({ load() { s.loads++; return s.raw; }, compareAndSwap(account, before, after) {
    assert.equal(account, policy.accountId); if (s.raw !== before) return null;
    s.raw = after; s.writes++; if (s.loseAck) throw Error('declared lost acknowledgement'); return after;
  } });
  return s;
}
function history(status = 'UNKNOWN', reservedDay = 10, observedDay = reservedDay) {
  const s = memory(), j = journal(policy, s.backend), r = original(1); j.reserve(r, reservedDay);
  if (status !== 'RESERVED') j.observe(r.paymentId, r.originalDigest, status, observedDay);
  j.close(); return s;
}
function inert(v) {
  assert.equal(Object.isFrozen(v), true); assert.equal(v.authority, 'NONE');
  for (const key of ['mayStartPayment', 'maySignPayment', 'maySubmitFunding', 'mayDispatchService', 'mayReleaseReservation']) assert.equal(v[key], false);
  assert.equal(v.spendingReservation, 'UNCHANGED'); assert.equal(v.paymentExpiry, 'NOT_ESTABLISHED');
  assert.equal(v.nativeResourceRelease, 'NOT_ESTABLISHED'); assert.equal(v.historicalObservation, true);
}
check('age-empty-observation-never-issues-new-work-authority', () => {
  const v = inspect(null, policy, 0, threshold(0)); inert(v);
  assert.equal(v.classification, 'NO_UNRESOLVED_ORIGINAL_OBSERVED');
  assert.deepEqual([v.reservedCount, v.unknownCount, v.spentCount, v.unresolvedCount], [0, 0, 0, 0]);
  assert.equal(v.oldestUnresolvedReservedDay, null); assert.equal(v.maximumUnresolvedReservationAgeDays, null);
  assert.equal(v.maximumUnknownReservationAgeDays, null); assert.equal(v.operatorEscalationRequired, false);
});
check('age-threshold-equality-retains-the-original-without-escalating', () => {
  const s = history(), v = inspect(s.raw, policy, 13, threshold(3)); inert(v);
  assert.equal(v.maximumUnresolvedReservationAgeDays, 3); assert.equal(v.maximumUnknownReservationAgeDays, 3);
  assert.equal(v.ageLimitExceeded, false); assert.equal(v.classification, 'UNRESOLVED_ORIGINAL_RETAINED');
  assert.equal(v.singleOriginalAdmissionBlockedByHistory, true); assert.equal(v.reconciliationRequired, true);
});
check('age-one-day-above-the-explicit-maximum-requires-escalation', () => {
  const v = inspect(history().raw, policy, 14, threshold(3)); inert(v);
  assert.equal(v.ageLimitExceeded, true); assert.equal(v.operatorEscalationRequired, true);
  assert.equal(v.classification, 'UNRESOLVED_RESERVATION_AGE_EXCEEDED');
});
check('age-zero-day-policy-is-not-an-instantaneous-payment-expiry', () => {
  const s = history(), same = inspect(s.raw, policy, 10, threshold(0)), later = inspect(s.raw, policy, 11, threshold(0));
  assert.equal(same.operatorEscalationRequired, false); assert.equal(later.operatorEscalationRequired, true); inert(same); inert(later);
});
check('age-reserved-preparation-ambiguity-also-requires-escalation', () => {
  const v = inspect(history('RESERVED').raw, policy, 12, threshold(1)); inert(v);
  assert.deepEqual([v.reservedCount, v.unknownCount, v.unresolvedCount], [1, 0, 1]);
  assert.equal(v.maximumUnknownReservationAgeDays, null); assert.equal(v.operatorEscalationRequired, true);
});
check('age-unknown-duration-is-measured-from-original-reservation', () => {
  const v = inspect(history('UNKNOWN', 10, 20).raw, policy, 22, threshold(5));
  assert.equal(v.recordedDay, 20); assert.equal(v.observedDay, 22); assert.equal(v.oldestUnknownReservedDay, 10);
  assert.equal(v.maximumUnknownReservationAgeDays, 12); assert.equal(v.operatorEscalationRequired, true);
});
check('age-observation-does-not-renew-at-repeated-unknown-records', () => {
  const s = history(), j = journal(policy, s.backend), r = original(1);
  j.observe(r.paymentId, r.originalDigest, 'UNKNOWN', 30); j.close();
  const v = inspect(s.raw, policy, 31, threshold(20)); assert.equal(v.maximumUnknownReservationAgeDays, 21);
  assert.equal(v.operatorEscalationRequired, true); assert.equal(v.oldestUnknownReservedDay, 10);
});
check('age-mixed-history-selects-unresolved-and-unknown-origins-separately', () => {
  const s = memory(), j = journal(policy, s.backend);
  j.reserve(original(1), 2); j.observe('payment.1', original(1).originalDigest, 'SPENT', 3);
  j.reserve(original(2), 4); j.reserve(original(3), 6); j.observe('payment.3', original(3).originalDigest, 'UNKNOWN', 7); j.close();
  const v = inspect(s.raw, policy, 10, threshold(5)); inert(v);
  assert.deepEqual([v.reservedCount, v.unknownCount, v.spentCount, v.unresolvedCount], [1, 1, 1, 2]);
  assert.deepEqual([v.oldestUnresolvedReservedDay, v.oldestUnknownReservedDay], [4, 6]);
  assert.deepEqual([v.maximumUnresolvedReservationAgeDays, v.maximumUnknownReservationAgeDays], [6, 4]);
  assert.equal(v.operatorEscalationRequired, true);
});
check('age-spent-history-is-not-an-unresolved-reservation', () => {
  const v = inspect(history('SPENT', 10, 12).raw, policy, 100000, threshold(0)); inert(v);
  assert.equal(v.spentCount, 1); assert.equal(v.unresolvedCount, 0); assert.equal(v.operatorEscalationRequired, false);
  assert.equal(v.oldestUnknownReservedDay, null); assert.equal(v.singleOriginalAdmissionBlockedByHistory, false);
});
check('age-classification-preserves-exact-history-and-enters-no-backend', () => {
  const s = history(), raw = s.raw, counts = [s.loads, s.writes];
  for (const d of [10, 12, 100000]) inert(inspect(raw, policy, d, threshold(1)));
  assert.equal(s.raw, raw); assert.deepEqual([s.loads, s.writes], counts);
});
check('age-result-is-detached-from-later-policy-threshold-mutation', () => {
  const limits = threshold(2), v = inspect(history().raw, policy, 13, limits);
  limits.maximumUnresolvedAgeDays = 100; assert.equal(v.maximumUnresolvedAgeDays, 2); assert.equal(v.operatorEscalationRequired, true);
  assert.throws(() => { v.mayReleaseReservation = true; }, TypeError);
});
check('age-lost-commit-ack-classifies-the-retained-reserved-original', () => {
  const s = memory(), j = journal(policy, s.backend); s.loseAck = true;
  assert.throws(() => j.reserveSingleOriginal(original(1), 10), /COMMIT_UNKNOWN/); assert.equal(j.snapshot().held, true);
  const v = inspect(s.raw, policy, 15, threshold(1)); inert(v); assert.equal(v.reservedCount, 1); assert.equal(v.operatorEscalationRequired, true);
  assert.equal(j.snapshot().held, true); s.loseAck = false; j.close();
});
check('age-exceeded-reopen-never-releases-single-original-admission', () => {
  const s = history(), before = s.raw, v = inspect(before, policy, 100000, threshold(1));
  assert.equal(v.operatorEscalationRequired, true);
  const reopened = journal(policy, s.backend); assert.throws(() => reopened.reserveSingleOriginal(original(2), 100000), /UNRESOLVED_ORIGINAL/);
  assert.equal(s.raw, before); assert.equal(reopened.snapshot().held, true); reopened.close();
});
check('age-exact-late-bound-history-preserves-lifetime-exposure', () => {
  const s = history(), r = original(1), j = journal(policy, s.backend);
  inspect(s.raw, policy, 30, threshold(1)); j.observe(r.paymentId, r.originalDigest, 'SPENT', 30); j.close();
  const v = inspect(s.raw, policy, 31, threshold(1)); assert.equal(v.unresolvedCount, 0); assert.equal(v.spentCount, 1);
  const reopened = journal(policy, s.backend); assert.equal(reopened.inspect(31).totalExposure, '1'); reopened.close(); inert(v);
});
check('age-stale-clock-cannot-understate-the-recorded-history', () => {
  const s = history('UNKNOWN', 10, 20); assert.throws(() => inspect(s.raw, policy, 19, threshold(1)));
  assert.equal(inspect(s.raw, policy, 20, threshold(1)).maximumUnresolvedReservationAgeDays, 10);
});
check('age-explicit-day-domain-refuses-negative-zero-and-nonintegers', () => {
  for (const d of [-0, -1, 1.5, NaN, Infinity, '10', 2147483648, null, undefined]) assert.throws(() => inspect(null, policy, d, threshold(1)));
});
check('age-explicit-maximum-domain-refuses-negative-zero-and-nonintegers', () => {
  for (const d of [-0, -1, 1.5, NaN, Infinity, '10', 2147483648, null, undefined]) assert.throws(() => inspect(null, policy, 10, threshold(d)));
});
check('age-maximum-day-arithmetic-remains-an-exact-safe-integer', () => {
  const s = history('UNKNOWN', 0, 0), v = inspect(s.raw, policy, 2147483647, threshold(2147483647));
  assert.equal(v.maximumUnknownReservationAgeDays, 2147483647); assert.equal(v.ageLimitExceeded, false); inert(v);
});
check('age-missing-extra-or-version-drifted-policy-fails-closed', () => {
  for (const l of [null, {}, { version: 1 }, { maximumUnresolvedAgeDays: 1 }, { ...threshold(1), extra: true }, { ...threshold(1), version: 2 }])
    assert.throws(() => inspect(null, policy, 10, l));
});
check('age-threshold-descriptors-do-not-invoke-accessors-or-proxies', () => {
  let entered = 0; const getter = { version: 1, get maximumUnresolvedAgeDays() { entered++; return 1; } };
  const proxy = new Proxy(threshold(1), { get() { entered++; throw Error('must not enter'); }, ownKeys() { entered++; throw Error('must not enter'); } });
  const hidden = Object.defineProperty({ version: 1 }, 'maximumUnresolvedAgeDays', { value: 1 });
  for (const l of [getter, proxy, hidden, Object.assign(Object.create(null), threshold(1))]) assert.throws(() => inspect(null, policy, 10, l));
  assert.equal(entered, 0);
});
check('age-malformed-and-noncanonical-history-is-not-reinterpreted', () => {
  const raw = history().raw;
  for (const value of [undefined, {}, '', raw + '\n', ' ' + raw, raw.replace('"UNKNOWN"', '"EXPIRED"'), raw.replace('"reservedDay":10', '"reservedDay":100')])
    assert.throws(() => inspect(value, policy, 20, threshold(1)));
});
check('age-foreign-policy-and-missing-history-fields-withhold-a-result', () => {
  const raw = history().raw, broken = JSON.parse(raw); delete broken.reservations[0].originalDigest;
  assert.throws(() => inspect(raw, { ...policy, policyId: 'foreign.policy' }, 20, threshold(1)));
  assert.throws(() => inspect(JSON.stringify(broken), policy, 20, threshold(1)));
});
check('age-input-arity-is-exact-and-has-no-default-threshold', () => {
  assert.throws(() => inspect(null, policy, 10)); assert.throws(() => inspect(null, policy, 10, threshold(1), true));
});
check('age-does-not-expose-original-identities-amounts-or-authorization', () => {
  const v = inspect(history().raw, policy, 20, threshold(1)), text = JSON.stringify(v); inert(v);
  for (const fragment of ['synthetic.payer', 'synthetic.payee', 'payment.1', 'sha256:', 'originalDigest', '"amount"']) assert.equal(text.includes(fragment), false);
});

export const fundingUncertaintyAgeDataCases = F(checks.map(c => F(c)));
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = [];
  for (const { id, run } of checks) {
    try { await run(); cases.push({ id, status: 'PASS' }); }
    catch (error) { cases.push({ id, status: 'FAIL', error: String(error?.message ?? error) }); }
  }
  const failed = cases.filter(c => c.status !== 'PASS').length;
  console.log(JSON.stringify({ qualification: 'G2_ORIGINAL_FUNDING_UNCERTAINTY_AGE_DATA', passed: cases.length - failed, failed, cases,
    actualCanonicalSpendingJournalAndSingleOriginalAdmission: true, declaredMemoryCASOnly: true,
    nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0,
    actualPrepare: 0, payouts: 0, nativeReopen: 'NOT_ESTABLISHED', LinuxAcceptance: 'NOT_ESTABLISHED', G0G5Acceptance: 'OPEN' }));
  if (failed) process.exitCode = 1;
}
