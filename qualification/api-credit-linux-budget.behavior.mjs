// Actual pure spending journal + retained pure provider fixture. Memory only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { captureOriginalFundingSpendingSqliteProfile } from '../src/original-funding-spending-sqlite-profile.js';
import { createOriginalFundingSpendingReservations } from '../src/original-funding-spending-reservations.js';
import { captureZenonDynamicPlasmaFundingPostPreparationInput } from '../src/zenon/dynamic-plasma-funding-post-preparation-input.js';
import { createApiCreditLinuxLedgerDataFixture } from './api-credit-linux-ledger.behavior.mjs';
import { captureApiCreditBudgetAcceptanceSelection as select, apiCreditBudgetProbeOptions as options,
  verifyApiCreditAcceptanceSpending as verify, readApiCreditAcceptanceSpending as read,
  readApiCreditAcceptanceProviderLedger as readLedger } from './api-credit-linux-budget-contract.mjs';

const F = Object.freeze, checks = [], copy = v => JSON.parse(JSON.stringify(v));
const hash = text => 'sha256:' + createHash('sha256').update(text).digest('hex');
function check(id, run) { checks.push(F({ id, run })); }
async function fixture() {
  const ledger = await createApiCreditLinuxLedgerDataFixture(), input = ledger.input, profile = JSON.parse(input.runProfile);
  const selected = captureZenonDynamicPlasmaFundingPostPreparationInput(JSON.parse(input.commands.split('\n')[0]).input, profile.configuration.storeOptions.resourceUrl);
  const accepted = selected.challenge.paymentRequired.accepts[0], storage = captureOriginalFundingSpendingSqliteProfile(profile.spendingFile.storageProfile);
  const row = { paymentId: profile.spending.paymentId, originalDigest: hash(JSON.stringify(selected)), network: accepted.network,
    asset: accepted.asset, recipient: accepted.payTo, amount: accepted.amount };
  let raw = null, writes = 0;
  const journal = createOriginalFundingSpendingReservations(storage.policy, F({ load() { return raw; }, compareAndSwap(account, expected, proposed) {
    assert.equal(account, storage.policy.accountId); assert.equal(raw, expected); writes++; return raw = proposed;
  } }));
  journal.reserveSingleOriginal(row, 10); const reserved = raw; journal.observe(row.paymentId, row.originalDigest, 'SPENT', 10); journal.close();
  assert.equal(writes, 2);
  return { input, token: select(input), ledger, profile, selected, row, storage, raw, reserved };
}
const mutate = (raw, work) => { const v = JSON.parse(raw); work(v); return JSON.stringify(v); };
async function refused(work) { const r = await fixture(); const raw = work(r); assert.throws(() => verify(r.token, raw, raw), /API_CREDIT_LINUX_BUDGET_ACCEPTANCE/); }
function owner(r, overrides = {}) {
  const trace = [], state = { revoked: false, closed: false, snapshots: [] };
  const p = {
    load() { trace.push('load'); return r.raw; }, assertCurrent() { trace.push('current'); },
    inspect() { trace.push('inspect'); const v = F({ spendingFileOwnerVersion: 1, lifecycle: state.closed ? 'CLOSED' : state.revoked ? 'REVOKED' : 'OPEN',
      held: false, busy: false, backendClosed: state.revoked, databaseOpen: !state.closed, physicalCloseEntered: state.closed, physicalCloseReturned: state.closed,
      physicalRelease: state.closed ? 'CLOSE_RETURNED' : 'NOT_ESTABLISHED', nativeResourceCleanup: 'NOT_QUALIFIED', authority: 'NONE' }); state.snapshots.push(v); return v; },
    revoke() { trace.push('revoke'); state.revoked = true; }, close() { trace.push('close'); assert.equal(state.revoked, true); state.closed = true; },
  };
  Object.assign(p, overrides); return { p: F(p), trace, state };
}
check('one-spent-original-uses-the-actual-journal-and-original-codec', async () => {
  const r = await fixture(), v = verify(r.token, r.raw, r.raw);
  assert.equal(v.totalExposure, r.row.amount); assert.equal(v.dailyExposure, r.row.amount); assert.equal(v.records, 1); assert.equal(v.spent, 1);
  assert.equal(v.unresolved, 0); assert.equal(v.revision, 2); assert.equal(v.observationDay, 10); assert.equal(v.daySource, 'RECORDED_HISTORY_ONLY');
});
check('spending-selection-reuses-six-inputs-and-the-two-existing-ledger-probes', async () => {
  const r = await fixture(), s = r.token.summary;
  assert.equal(Object.keys(s.inputPins).length, 6); assert.equal(s.version, 3); assert.equal(s.commandFrames, 106);
  assert.equal(s.ledgerProbeProcesses, 2); assert.equal(s.spendingProbeProcesses, 0); assert.equal(s.spendingCurrentGuardsPerProbe, 3);
  assert.equal(s.persistedSpendingAcceptance, 'NOT_EXECUTED'); assert.throws(() => select({ ...r.input, budgetProfile: '{}' }));
});
check('existing-open-retains-the-declared-create-owner-policy-device-and-limits', async () => {
  const r = await fixture(), o = options(r.token), c = r.profile.spendingFile;
  assert.equal(o.spending.storageProfile.mode, 'OPEN_EXISTING'); assert.deepEqual(o.spending.storageProfile.ownerToken, r.storage.ownerToken);
  assert.equal(o.spending.storageProfile.ownerToken.epoch, 1); assert.equal(o.spending.storageProfile.ownerToken.minimumRevision, 0);
  assert.equal(o.spending.storageProfile.databasePath, c.storageProfile.databasePath); assert.deepEqual(o.spending.filePolicy, c.filePolicy);
  assert.equal(o.ledger.databasePath, JSON.parse(r.input.recoveryProfile).backendOptions.databasePath); assert.ok(Object.isFrozen(o.spending.storageProfile));
});
check('an-existing-or-transferred-run-profile-cannot-replace-this-clean-scenario', async () => {
  const r = await fixture(), p = copy(r.profile), s = p.spendingFile.storageProfile;
  p.spendingFile.storageProfile = { version: 1, mode: 'OPEN_EXISTING', databasePath: s.databasePath, policy: s.policy, ownerToken: { ...r.storage.ownerToken, epoch: 2 } };
  assert.throws(() => select({ ...r.input, runProfile: canonicalJson(p) }));
});
check('foreign-payment-id-or-reordered-preparation-digest-refuses', async () => {
  await refused(r => mutate(r.raw, v => { v.reservations[0].paymentId = 'different.original'; }));
  await refused(r => { const reordered = Object.fromEntries(Object.entries(r.selected).reverse()); const changed = hash(JSON.stringify(reordered));
    assert.notEqual(changed, r.row.originalDigest); return mutate(r.raw, v => { v.reservations[0].originalDigest = changed; }); });
});
check('changed-network-asset-or-recipient-cannot-describe-the-funded-original', async () => {
  for (const k of ['network', 'asset', 'recipient']) await refused(r => mutate(r.raw, v => { v.reservations[0][k] = 'foreign'; }));
});
check('a-different-permitted-amount-is-still-a-different-original', async () => {
  await refused(r => mutate(r.raw, v => { v.reservations[0].amount = String(BigInt(r.row.amount) + 1n); }));
});
check('reserved-or-unknown-exposure-never-becomes-a-clean-spent-result', async () => {
  for (const status of ['RESERVED', 'UNKNOWN']) await refused(r => mutate(r.reserved, v => { v.reservations[0].status = status; }));
});
check('an-extra-original-cannot-hide-behind-the-same-total-record', async () => {
  await refused(r => mutate(r.raw, v => { v.reservations.push({ ...v.reservations[0], paymentId: 'second.original', originalDigest: 'sha256:' + 'f'.repeat(64) }); }));
});
check('empty-missing-malformed-or-oversized-state-is-never-created-as-a-fallback', async () => {
  const r = await fixture(); for (const value of [null, '', '{}', 'x'.repeat(1048577), r.raw + '\n']) assert.throws(() => verify(r.token, value, value));
});
check('policy-mutation-and-budget-overflow-are-rejected-by-the-actual-decoder', async () => {
  await refused(r => mutate(r.raw, v => { v.policy.maxTotal = String(BigInt(v.policy.maxTotal) + 1n); }));
  await refused(r => mutate(r.raw, v => { v.reservations[0].amount = String(BigInt(v.policy.maxTotal) + 1n); }));
});
check('changed-canonical-revision-between-reads-is-not-a-stable-observation', async () => {
  const r = await fixture(), changed = mutate(r.raw, v => { v.revision++; }); assert.throws(() => verify(r.token, r.raw, changed));
});
check('a-recorded-later-day-does-not-refund-total-exposure-or-read-the-clock', async () => {
  const r = await fixture(), later = mutate(r.raw, v => { v.lastDay++; v.revision++; }), v = verify(r.token, later, later);
  assert.equal(v.totalExposure, r.row.amount); assert.equal(v.dailyExposure, '0'); assert.equal(v.observationDay, 11); assert.equal(v.mayPrepareFunding, false);
});
check('observations-do-not-publish-payment-owner-account-path-or-proof-data', async () => {
  const r = await fixture(), out = JSON.stringify(verify(r.token, r.raw, r.raw));
  for (const marker of [r.row.paymentId, r.row.originalDigest, r.storage.ownerToken.ownerId, r.storage.policy.accountId, '/synthetic/', 'ServiceCredit ']) assert.equal(out.includes(marker), false);
});
check('provider-units-and-payer-money-are-checked-by-their-separate-real-contracts', async () => {
  const r = await fixture(); let closed = 0;
  const ledger = readLedger(r.token, { load() { return r.ledger.before; }, executions() { return r.ledger.execution; }, close() { closed++; } });
  const spending = read(r.token, owner(r).p); assert.equal(closed, 1); assert.equal(ledger.consumedUnits, 100); assert.equal(spending.totalExposure, r.row.amount);
  assert.equal(ledger.atomicSnapshot, false); assert.equal(spending.atomicSnapshot, false);
});
check('owned-read-guards-both-loads-before-revoke-and-one-close', async () => {
  const r = await fixture(), p = owner(r), v = read(r.token, p.p);
  assert.deepEqual(p.trace, ['inspect', 'current', 'load', 'current', 'load', 'current', 'inspect', 'revoke', 'inspect', 'close', 'inspect']);
  assert.equal(v.storeCloseReturned, true); assert.equal(v.physicalRelease, 'NOT_ESTABLISHED'); assert.equal(p.state.closed, true);
  assert.throws(() => read(r.token, p.p)); assert.equal(p.trace.length, 11);
});
check('a-throwing-load-retains-unknown-without-revoke-close-or-another-read', async () => {
  const r = await fixture(), p = owner(r, { load() { p.trace.push('throw'); throw Error('declared read refusal'); } });
  assert.throws(() => read(r.token, p.p)); assert.deepEqual(p.trace, ['inspect', 'current', 'throw']); assert.throws(() => read(r.token, p.p)); assert.equal(p.trace.length, 3);
});
check('opaque-load-and-guard-receipts-do-not-run-then-getters-or-close', async () => {
  for (const method of ['load', 'assertCurrent']) {
    const r = await fixture(); let entered = 0; const opaque = { get then() { entered++; throw Error(); } };
    const p = owner(r, { [method]() { return opaque; } }); assert.throws(() => read(r.token, p.p)); assert.equal(entered, 0); assert.equal(p.trace.includes('close'), false);
  }
});
check('fencing-at-any-of-the-three-current-guards-withholds-close-and-output', async () => {
  for (let at = 1; at <= 3; at++) {
    const r = await fixture(); let count = 0; const p = owner(r, { assertCurrent() { if (++count === at) throw Error('declared stale owner'); } });
    assert.throws(() => read(r.token, p.p)); assert.equal(count, at); assert.equal(p.trace.includes('revoke'), false); assert.equal(p.trace.includes('close'), false);
  }
});
check('held-busy-or-nonfrozen-owner-views-cannot-enter-a-load', async () => {
  for (const mode of ['held', 'busy', 'mutable']) {
    const r = await fixture(), p = owner(r), base = p.p.inspect();
    const q = { ...p.p, inspect() { const v = { ...base, ...(mode === 'mutable' ? {} : { [mode]: true }) }; return mode === 'mutable' ? v : F(v); } };
    assert.throws(() => read(r.token, q)); assert.equal(p.trace.includes('load'), false);
  }
});
check('a-reused-frozen-owner-view-is-not-a-fresh-close-barrier', async () => {
  const r = await fixture(), p = owner(r), base = p.p.inspect();
  assert.throws(() => read(r.token, { ...p.p, inspect() { return base; } })); assert.equal(p.trace.includes('revoke'), false); assert.equal(p.trace.includes('close'), false);
});
check('known-semantic-conflict-may-revoke-close-once-but-never-publish', async () => {
  const r = await fixture(), p = owner(r, { load() { return r.reserved; } });
  assert.throws(() => read(r.token, p.p)); assert.equal(p.state.closed, true); assert.throws(() => read(r.token, p.p)); assert.equal(p.trace.filter(v => v === 'close').length, 1);
});
check('unknown-or-nonvoid-revoke-prevents-physical-close', async () => {
  for (const throwing of [false, true]) {
    const r = await fixture(), p = owner(r, { revoke() { if (throwing) throw Error('declared revoke refusal'); return true; } });
    assert.throws(() => read(r.token, p.p)); assert.equal(p.trace.includes('close'), false); assert.throws(() => read(r.token, p.p));
  }
});
check('a-missing-revoked-view-cannot-authorize-physical-close', async () => {
  const r = await fixture(), p = owner(r), inspect = p.p.inspect;
  assert.throws(() => read(r.token, { ...p.p, inspect() { return p.state.revoked ? F({}) : inspect(); } })); assert.equal(p.trace.includes('close'), false);
});
check('throwing-or-nonvoid-close-never-publishes-or-retries', async () => {
  for (const throwing of [false, true]) {
    const r = await fixture(); let entered = 0; const p = owner(r, { close() { entered++; if (throwing) throw Error('declared close refusal'); return true; } });
    assert.throws(() => read(r.token, p.p)); assert.throws(() => read(r.token, p.p)); assert.equal(entered, 1);
  }
});
check('a-claimed-close-with-a-still-open-database-withholds-the-result', async () => {
  const r = await fixture(), p = owner(r), inspect = p.p.inspect;
  assert.throws(() => read(r.token, { ...p.p, inspect() { const v = inspect(); return p.state.closed ? F({ ...v, databaseOpen: true }) : v; } }));
  assert.equal(p.state.closed, true);
});
check('reentrant-load-cannot-start-another-owned-read', async () => {
  const r = await fixture(); let refused = 0; const p = owner(r, { load() { assert.throws(() => read(r.token, p.p)); refused++; return r.raw; } });
  assert.equal(read(r.token, p.p).storeCloseReturned, true); assert.equal(refused, 2);
});
check('copied-tokens-extra-write-ports-accessors-and-proxies-enter-no-callbacks', async () => {
  const r = await fixture(), p = owner(r); let entered = 0;
  assert.throws(() => options({ ...r.token })); assert.throws(() => verify(F({ ...r.token }), r.raw, r.raw));
  assert.throws(() => read(r.token, { ...p.p, compareAndSwap() { entered++; } }));
  assert.throws(() => read(r.token, new Proxy({}, { ownKeys() { entered++; return []; } })));
  const q = { ...p.p }; Object.defineProperty(q, 'load', { enumerable: true, get() { entered++; return p.p.load; } });
  assert.throws(() => read(r.token, q)); assert.equal(entered, 0); assert.deepEqual(p.trace, []);
});
check('matching-budget-history-does-not-establish-native-atomicity-release-or-authority', async () => {
  const r = await fixture(), v = verify(r.token, r.raw, r.raw);
  assert.equal(v.authority, 'NONE'); assert.equal(v.mayDispatchService, false); assert.equal(v.mayPrepareFunding, false); assert.equal(v.atomicSnapshot, false);
  assert.equal(v.physicalRelease, 'NOT_ESTABLISHED'); assert.equal(v.G1Acceptance, 'NOT_ESTABLISHED'); assert.equal(v.G2Acceptance, 'NOT_ESTABLISHED');
});

export const createApiCreditLinuxBudgetDataFixture = fixture;
export const apiCreditLinuxBudgetDataCases = F(checks);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = [];
  for (const c of checks) { try { await c.run(); cases.push({ id: c.id, status: 'PASS' }); }
    catch (error) { cases.push({ id: c.id, status: 'FAIL', message: String(error?.message ?? error) + (typeof error?.stage === 'string' ? ':' + error.stage : '') }); break; } }
  const failed = cases.filter(c => c.status !== 'PASS').length;
  process.stdout.write(JSON.stringify({ qualification: 'G1_LINUX_SPENDING_ACCEPTANCE_DATA', passed: cases.length - failed, failed, cases,
    nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0,
    fixtureProvenance: 'DECLARED_MEMORY_SPENDING_JOURNAL_AND_LEDGER', LinuxAcceptance: 'NOT_ESTABLISHED', G1: 'OPEN', G2: 'OPEN' }) + '\n');
  if (failed) process.exitCode = 1;
}
