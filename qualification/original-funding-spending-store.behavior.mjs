import assert from 'node:assert/strict';
import { originalFundingSpendingDataCases, originalFundingSpendingDataFixtures as f } from './original-funding-spending.behavior.mjs';
import { createOriginalFundingSpendingReservations as create, inspectOriginalFundingSpendingState as inspect,
  requireOriginalFundingSpendingStateTransition as transition } from '../src/original-funding-spending-reservations.js';
import { captureOriginalFundingSpendingSqliteProfile as profile, captureOriginalFundingSpendingSqliteOwnership as captureOwner,
  requireOriginalFundingSpendingSqliteOwnership as owner, nextOriginalFundingSpendingSqliteOwnership as nextOwner } from '../src/original-funding-spending-sqlite-profile.js';

const F = Object.freeze, checks = [...originalFundingSpendingDataCases];
function check(id, run) { checks.push({ id, run }); }
function token(edit = {}) { return { version: 1, storeId: 'spending.synthetic.1', accountId: f.policy().accountId,
  ownerId: 'worker.synthetic.1', epoch: 1, minimumRevision: 0, ...edit }; }
function selection(edit = {}) { return { version: 1, mode: 'CREATE_NEW', databasePath: '/synthetic-spending/budget.sqlite',
  policy: f.policy(), storeId: 'spending.synthetic.1', ownerId: 'worker.synthetic.1', ...edit }; }
function prepared() {
  const p = f.policy(), db = f.memory(), s = create(p, db.backend);
  s.reserve(f.original('a'), 1); s.reserve(f.original('b'), 1); return { p, db, s, raw: db.read() };
}
check('canonical-state-inspection-detaches-and-freezes-all-exposed-history', () => {
  const { p, raw } = prepared(), r = inspect(raw, p);
  assert.equal(r.revision, 2); assert.equal(r.reservations.length, 2); assert.ok(Object.isFrozen(r)); assert.ok(Object.isFrozen(r.reservations[0]));
  assert.throws(() => { r.reservations[0].amount = '1'; }); assert.throws(() => r.policy.recipients.push('foreign'));
  assert.equal(inspect(null, p).revision, 0); assert.equal(inspect(raw, p).reservations[0].amount, '5');
});
check('strict-transition-port-accepts-the-actual-reservation-owner-write-sequence', () => {
  const p = f.policy(), db = f.memory(), base = db.backend, accepted = [];
  const strict = F({ load: account => base.load(account), compareAndSwap(account, expected, proposed) {
    accepted.push(transition(expected, proposed, p)); return base.compareAndSwap(account, expected, proposed);
  } });
  const s = create(p, strict), digest = f.original('a').originalDigest;
  s.reserve(f.original('a'), 1); s.observe('a', digest, 'UNKNOWN', 1); s.observe('a', digest, 'UNKNOWN', 2);
  s.observe('a', digest, 'SPENT', 3); s.reserve(f.original('b'), 4);
  assert.equal(accepted.length, 5); assert.equal(s.inspect(4).totalExposure, '10'); assert.equal(s.inspect(4).dailyExposure, '5');
});
check('backend-transition-denies-removal-reordering-original-replacement-and-batches', () => {
  const { p, raw } = prepared();
  for (const edit of [r => r.reservations.pop(), r => { r.reservations[0].amount = '4'; }, r => r.reservations.reverse(),
    r => { r.reservations[0].paymentId = 'alias'; }, r => { r.reservations[0].originalDigest = 'sha256:' + 'd'.repeat(64); },
    r => r.reservations.forEach(x => { x.status = 'UNKNOWN'; })]) {
    const next = JSON.parse(raw); next.revision++; edit(next); assert.throws(() => transition(raw, JSON.stringify(next), p));
  }
});
check('backend-transition-cannot-reset-to-null-or-change-the-budget-policy', () => {
  const { p, raw } = prepared(); assert.throws(() => transition(raw, null, p));
  const changed = JSON.parse(raw); changed.revision++; changed.policy.maxTotal = '31';
  assert.throws(() => transition(raw, JSON.stringify(changed), p)); assert.throws(() => transition(raw, JSON.stringify(changed), changed.policy));
});
check('backend-transition-requires-the-next-revision-and-a-nondecreasing-day', () => {
  const { p, raw } = prepared();
  assert.equal(transition(raw, raw, p).revision, 2);
  for (const edit of [r => { r.revision = 1; }, r => { r.revision += 2; }, r => { r.lastDay = 0; }]) {
    const next = JSON.parse(raw); next.revision++; edit(next); assert.throws(() => transition(raw, JSON.stringify(next), p));
  }
});
check('spent-history-is-terminal-and-unknown-cannot-be-downgraded-to-reserved', () => {
  const p = f.policy(), db = f.memory(), s = create(p, db.backend);
  s.reserve(f.original(), 1); s.observe('payment.1', f.H, 'UNKNOWN', 1); let raw = db.read(), next = JSON.parse(raw);
  next.revision++; next.reservations[0].status = 'RESERVED'; assert.throws(() => transition(raw, JSON.stringify(next), p));
  s.observe('payment.1', f.H, 'SPENT', 2); raw = db.read(); next = JSON.parse(raw); next.revision++; next.lastDay = 3; next.reservations[0].spentDay = 3;
  assert.throws(() => transition(raw, JSON.stringify(next), p));
});
check('new-reservations-must-start-reserved-on-the-current-record-day', () => {
  const p = f.policy(), db = f.memory(), s = create(p, db.backend); s.reserve(f.original(), 1); const raw = db.read();
  const invalid = JSON.parse(raw); invalid.reservations[0].status = 'SPENT'; invalid.reservations[0].spentDay = 1;
  assert.throws(() => transition(null, JSON.stringify(invalid), p));
  const next = JSON.parse(raw); next.revision++; next.lastDay = 2;
  next.reservations.push({ ...f.original('b'), reservedDay: 1, status: 'RESERVED', spentDay: null });
  assert.throws(() => transition(raw, JSON.stringify(next), p));
});
check('create-and-open-selections-are-explicit-and-never-fall-back-to-create', () => {
  const created = profile(selection()); assert.equal(created.mode, 'CREATE_NEW'); assert.deepEqual(created.ownerToken, token());
  const opened = profile({ version: 1, mode: 'OPEN_EXISTING', databasePath: created.databasePath, policy: f.policy(), ownerToken: token() });
  assert.equal(opened.mode, 'OPEN_EXISTING');
  for (const bad of [selection({ mode: undefined }), selection({ mode: 'AUTO' }), selection({ mode: 'OPEN_EXISTING' }),
    selection({ databasePath: 'relative.sqlite' }), selection({ databasePath: '/synthetic/../budget.sqlite' })]) assert.throws(() => profile(bad));
});
check('ownership-capture-is-detached-and-account-bound', () => {
  const raw = token(), selected = captureOwner(raw, f.policy()); raw.ownerId = 'changed'; assert.equal(selected.ownerId, 'worker.synthetic.1');
  assert.throws(() => captureOwner(token({ accountId: 'foreign.account' }), f.policy())); assert.ok(Object.isFrozen(selected));
});
check('explicit-owner-handoff-fences-the-prior-worker-and-preserves-the-revision-floor', () => {
  const p = f.policy(), old = token(), next = nextOwner(old, 'worker.synthetic.2', 5, p);
  assert.equal(next.epoch, 2); assert.equal(next.minimumRevision, 5); assert.equal(next.storeId, old.storeId);
  assert.throws(() => owner(old, next, p), /FENCED/); assert.throws(() => owner(next, old, p), /FENCED/);
  assert.equal(owner(next, { ...next, minimumRevision: 6 }, p).minimumRevision, 6);
  assert.throws(() => owner(next, { ...next, minimumRevision: 4 }, p), /FENCED/);
});
check('same-owner-label-still-requires-a-new-epoch-and-cannot-cross-store-scope', () => {
  const p = f.policy(), old = token(), next = nextOwner(old, old.ownerId, 1, p);
  assert.equal(next.ownerId, old.ownerId); assert.equal(next.epoch, 2); assert.throws(() => owner(old, next, p));
  assert.throws(() => owner(old, token({ storeId: 'different.store' }), p));
});
check('ownership-version-exhaustion-never-wraps-or-reduces-the-floor', () => {
  const p = f.policy(); assert.throws(() => nextOwner(token({ epoch: Number.MAX_SAFE_INTEGER - 1 }), 'new.owner', 1, p));
  assert.throws(() => nextOwner(token({ minimumRevision: 5 }), 'new.owner', 4, p));
  for (const n of [-1, -0, 0.5, Number.MAX_SAFE_INTEGER]) assert.throws(() => captureOwner(token({ minimumRevision: n }), p));
});
check('hostile-profile-and-token-accessors-do-not-enter-a-callback', () => {
  let calls = 0; const s = selection(); Object.defineProperty(s, 'mode', { enumerable: true, get() { calls++; return 'CREATE_NEW'; } });
  const t = token(); Object.defineProperty(t, 'ownerId', { enumerable: true, get() { calls++; return 'worker'; } });
  assert.throws(() => profile(s)); assert.throws(() => captureOwner(t, f.policy())); assert.throws(() => profile(new Proxy(selection(), {}))); assert.equal(calls, 0);
});
check('pending-funding-keeps-unknown-exposure-and-revokes-further-admission', async () => {
  const h = f.application({ mode: 'pending' }); await h.root.prepareOriginalFunding(h.f.input);
  const result = await h.root.submitOriginalFunding({}); assert.equal(result.fundingIntakeStatus, 'PENDING');
  const before = h.db.read(); assert.equal(JSON.parse(before).reservations[0].status, 'UNKNOWN'); assert.equal(h.root.inspect().held, true);
  await assert.rejects(h.root.prepareOriginalFunding(h.f.input)); assert.equal(h.db.read(), before); assert.equal(h.counts().prepares, 1); await assert.rejects(h.root.close());
});
check('malformed-bound-result-cannot-mark-the-budget-spent-or-grant-new-authority', async () => {
  const h = f.application(); await h.root.prepareOriginalFunding(h.f.input); h.submitGate = f.gate(); const operation = h.root.submitOriginalFunding({});
  h.submitGate.resolve(F({ phase: 'FUNDING_INTAKE_BOUND' })); await assert.rejects(operation);
  assert.equal(JSON.parse(h.db.read()).reservations[0].status, 'UNKNOWN'); assert.equal(h.root.inspect().held, true);
  await assert.rejects(h.root.close()); assert.equal(h.counts().prepares, 1);
});
check('lost-spent-ack-retains-the-actual-bound-budget-and-refuses-repreparation', async () => {
  const h = f.application(); await h.root.prepareOriginalFunding(h.f.input); h.db.mode = 'lostAck'; await assert.rejects(h.root.submitOriginalFunding({}));
  assert.equal(JSON.parse(h.db.read()).reservations[0].status, 'SPENT'); assert.equal(h.root.inspect().held, true); await assert.rejects(h.root.close());
  h.db.mode = 'normal'; const reopened = f.application({ db: h.db }); await assert.rejects(reopened.root.prepareOriginalFunding(reopened.f.input));
  assert.equal(reopened.counts().prepares, 0); await reopened.root.close();
});
const cases = [];
for (const { id, run } of checks) { try { await run(); cases.push({ id, status: 'PASS' }); } catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? e) }); } }
const failed = cases.filter(c => c.status !== 'PASS').length;
console.log(JSON.stringify({ qualification: 'G1_SPENDING_STORE_CONTRACT_DATA', passed: cases.length - failed, failed, cases,
  priorSpendingCases: originalFundingSpendingDataCases.length, nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0,
  sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0, nativeStoreExecution: 'NOT_ESTABLISHED', nativeDurability: 'NOT_ESTABLISHED' }));
if (failed) process.exitCode = 1;
