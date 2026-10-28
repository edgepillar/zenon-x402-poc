import assert from 'node:assert/strict';
import { createOriginalFundingSpendingReservations as create, captureOriginalFundingSpendingPolicy as capture } from '../src/original-funding-spending-reservations.js';
import { createSpendingBoundedSdk105FundingServiceLifecycle as join } from '../src/zenon/sdk105-funding-service-lifecycle.js';
import { retainedOriginalInputFixture } from './dynamic-plasma-retained-input.fixture.mjs';
import { assembleZenonDynamicPlasmaOriginalFundingDataV2 as assemble } from '../src/zenon/dynamic-plasma-original-funding-data.js';

const F = Object.freeze, checks = [], H = 'sha256:' + 'a'.repeat(64);
function check(id, run) { checks.push({ id, run }); }
function policy(edit = {}) { return { version: 1, policyId: 'budget.synthetic.1', accountId: 'payer.synthetic.1', network: 'zenon:testnet',
  asset: 'zts1znnxxxxxxxxxxxxx9z4ulx', recipients: ['recipient.synthetic'], maxPayment: '10', maxTotal: '30', maxDaily: '15', maxRecords: 16, ...edit }; }
function original(id = 'payment.1', value = '5', edit = {}) { return { paymentId: id, originalDigest: H, network: 'zenon:testnet',
  asset: 'zts1znnxxxxxxxxxxxxx9z4ulx', recipient: 'recipient.synthetic', amount: value, ...edit }; }
function memory(initial = null) {
  let raw = initial;
  const db = { accountId: 'payer.synthetic.1', mode: 'normal', writes: 0, afterWrite: null, read: () => raw, replace: v => { raw = v; } };
  db.backend = F({ load() { return raw; }, compareAndSwap(account, expected, proposed) {
    assert.equal(account, db.accountId);
    if (db.mode === 'conflict' || raw !== expected) return null;
    raw = proposed; db.writes++; if (db.afterWrite) db.afterWrite();
    if (db.mode === 'lostAck') throw Error('synthetic acknowledgement loss');
    if (db.mode === 'invalidAck') return undefined;
    if (db.mode === 'promiseAck') return Promise.resolve(proposed);
    return proposed;
  } });
  return db;
}
function gate() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function application({ db = memory(), mode = 'bound', accountId = null } = {}) {
  const f = retainedOriginalInputFixture(), packet = assemble(f.input, f.candidate, f.resourceUrl);
  const accepted = f.input.challenge.paymentRequired.accepts[0];
  let walletClosed = false, clientClosed = false, prepares = 0, submits = 0, closes = 0, today = 10;
  const h = { db, f, packet, mode, submitGate: null, onClose: null, setDay: d => { today = d; }, counts: () => ({ prepares, submits, closes }) };
  const wallet = F({ inspect() { return F({ sdk105WalletOwnerVersion: 1, held: false, lifecycle: walletClosed ? 'CLOSED' : 'OPEN',
    clearCalls: walletClosed ? 1 : 0, clearOutcome: walletClosed ? 'CLEAR_RETURNED' : 'NOT_REQUESTED', closeRequested: walletClosed, activeOperation: null }); },
  close() { walletClosed = true; return Promise.resolve(undefined); } });
  const client = F({ prepareOriginalFunding(input) {
    prepares++; assert.notEqual(db.read(), null); assert.deepEqual(input, f.input);
    return h.mode === 'prepareReject' ? Promise.reject(Error('synthetic child rejection')) : Promise.resolve(F({ phase: 'AWAITING_INDEPENDENT_PINS', packet }));
  }, commitOriginalFunding() { return Promise.resolve(F({ phase: 'LOCAL_STORE_READBACK_MATCHED' })); },
  submitOriginalFunding() {
    submits++;
    return h.submitGate ? h.submitGate.promise : Promise.resolve(F(h.mode === 'pending' ? { phase: 'FUNDING_INTAKE_PENDING', fundingIntakeStatus: 'PENDING' }
      : { phase: 'FUNDING_INTAKE_BOUND', fundingIntakeStatus: 'BOUND' }));
  }, handoffToService() { return Promise.reject(Error('not selected')); }, submitOriginal() { return Promise.reject(Error('not selected')); },
  inspect() { return F({ lifecycle: clientClosed ? 'CLOSED' : 'OPEN', held: false }); }, close() {
    closes++; clientClosed = true; if (h.onClose) h.onClose(); return Promise.resolve(undefined);
  } });
  const selected = policy({ recipients: [accepted.payTo], accountId: accountId ?? f.input.plannerContext.readInput.payerAddress });
  db.accountId = selected.accountId;
  h.root = join({ client, walletOwner: wallet, fundingResourceUrl: f.resourceUrl,
    spending: { policy: selected, backend: db.backend, paymentId: 'payment.1', readDay: () => today } });
  return h;
}
check('missing-policy-and-empty-allowlists-fail-before-backend-entry', () => {
  for (const p of [null, {}, policy({ recipients: [] }), policy({ network: '' }), policy({ asset: '' })]) assert.throws(() => capture(p));
});
check('amounts-use-exact-canonical-decimal-integers', () => {
  for (const value of ['0', '01', '1.5', '1e2', '1\n', Number.MAX_SAFE_INTEGER, String(1n << 255n)]) assert.throws(() => capture(policy({ maxPayment: value })));
  const p = capture(policy({ maxPayment: '9007199254740993', maxDaily: '9007199254740993', maxTotal: '9007199254740993' }));
  const s = create(p, memory().backend); s.reserve(original('large', p.maxPayment), 10); assert.equal(s.inspect(10).totalExposure, p.maxPayment);
});
check('per-payment-and-recipient-network-asset-limits-precede-writes', () => {
  const db = memory(), s = create(policy(), db.backend);
  for (const r of [original('x', '11'), original('x', '5', { recipient: 'foreign' }), original('x', '5', { network: 'other' }), original('x', '5', { asset: 'other' })]) assert.throws(() => s.reserve(r, 10));
  assert.equal(db.writes, 0);
});
check('total-cap-includes-spent-and-outstanding-originals', () => {
  const s = create(policy({ maxDaily: '30' }), memory().backend);
  s.reserve(original('a', '10'), 10); s.observe('a', H, 'SPENT', 10);
  s.reserve(original('b', '10'), 11); s.observe('b', H, 'UNKNOWN', 11); s.reserve(original('c', '10'), 12);
  assert.throws(() => s.reserve(original('d', '1'), 13), /TOTAL_LIMIT/); assert.equal(s.inspect(13).totalExposure, '30');
});
check('daily-cap-carries-unknown-and-reserved-exposure-across-days', () => {
  const s = create(policy(), memory().backend); s.reserve(original('a', '10'), 10); s.observe('a', H, 'UNKNOWN', 10);
  assert.throws(() => s.reserve(original('b', '6'), 11), /DAILY_LIMIT/); s.reserve(original('b', '5'), 11);
  assert.equal(s.inspect(12).dailyExposure, '15'); assert.throws(() => s.reserve(original('c', '1'), 12), /DAILY_LIMIT/);
});
check('late-bound-observation-charges-its-day-without-freeing-total-budget', () => {
  const s = create(policy(), memory().backend); s.reserve(original('a', '10'), 10); s.observe('a', H, 'SPENT', 12);
  assert.equal(s.inspect(12).dailyExposure, '10'); assert.equal(s.inspect(13).dailyExposure, '0'); assert.equal(s.inspect(13).totalExposure, '10');
});
check('reopen-retains-counters-and-cannot-authorize-the-original-again', () => {
  const db = memory(), a = create(policy(), db.backend); a.reserve(original(), 10); a.observe('payment.1', H, 'UNKNOWN', 10); a.close();
  const b = create(policy(), db.backend); assert.equal(b.inspect(11).totalExposure, '5'); assert.equal(b.inspect(11).unresolved, 1);
  assert.throws(() => b.reserve(original(), 11), /ORIGINAL_ALREADY_RESERVED/);
});
check('same-id-with-changed-original-is-never-a-new-reservation', () => {
  const db = memory(), s = create(policy(), db.backend); s.reserve(original(), 10); const before = db.read();
  assert.throws(() => s.reserve(original('payment.1', '6'), 10)); assert.equal(db.read(), before);
});
check('two-live-workers-cannot-both-reserve-a-stale-account-snapshot', () => {
  const db = memory(), a = create(policy(), db.backend), b = create(policy(), db.backend);
  a.reserve(original('a', '10'), 10); assert.throws(() => b.reserve(original('b', '10'), 10), /CONFLICT/);
  assert.equal(b.snapshot().held, true); assert.equal(JSON.parse(db.read()).reservations.length, 1);
});
check('lost-reservation-ack-keeps-the-committed-original-and-latches-held', () => {
  const db = memory(), a = create(policy(), db.backend); db.mode = 'lostAck'; assert.throws(() => a.reserve(original(), 10), /COMMIT_UNKNOWN/);
  assert.equal(a.snapshot().held, true); db.mode = 'normal'; const b = create(policy(), db.backend);
  assert.equal(b.inspect(11).totalExposure, '5'); assert.throws(() => b.reserve(original(), 11));
});
check('invalid-ack-and-promise-shaped-ack-cannot-escape-as-reservation-success', () => {
  for (const mode of ['invalidAck', 'promiseAck']) {
    const db = memory(), s = create(policy(), db.backend); db.mode = mode; assert.throws(() => s.reserve(original(), 10)); assert.equal(s.snapshot().held, true);
  }
});
check('reentrant-close-after-cas-write-refuses-the-local-receipt', () => {
  const db = memory(), s = create(policy(), db.backend); db.afterWrite = () => s.close();
  assert.throws(() => s.reserve(original(), 10), /CLOSED/); assert.equal(s.snapshot().held, true); assert.equal(JSON.parse(db.read()).reservations.length, 1);
});
check('clock-rollback-and-terminal-downgrade-are-refused', () => {
  const db = memory(), s = create(policy(), db.backend); s.reserve(original(), 10); s.observe('payment.1', H, 'SPENT', 11);
  assert.throws(() => s.reserve(original('b'), 10), /CLOCK_ROLLBACK/); assert.throws(() => s.observe('payment.1', H, 'UNKNOWN', 11), /DOWNGRADE/);
  assert.equal(JSON.parse(db.read()).reservations[0].status, 'SPENT');
});
check('changed-policy-corrupt-record-and-noncanonical-state-refuse-reopen', () => {
  const db = memory(), s = create(policy(), db.backend); s.reserve(original(), 10);
  assert.throws(() => create(policy({ maxTotal: '31' }), db.backend)); const good = db.read();
  db.replace(good + ' '); assert.throws(() => create(policy(), db.backend));
  const broken = JSON.parse(good); broken.reservations[0].spentDay = 10; db.replace(JSON.stringify(broken)); assert.throws(() => create(policy(), db.backend));
});
check('bounded-record-exhaustion-retains-all-originals', () => {
  const db = memory(), s = create(policy({ maxRecords: 1 }), db.backend); s.reserve(original(), 10); const before = db.read();
  assert.throws(() => s.reserve(original('b'), 10), /RECORD_LIMIT/); assert.equal(db.read(), before);
});
check('accessor-and-proxy-policy-values-are-refused-without-getter-entry', () => {
  let calls = 0; const p = policy(); Object.defineProperty(p, 'maxPayment', { enumerable: true, get() { calls++; return '10'; } });
  assert.throws(() => capture(p)); assert.throws(() => capture(new Proxy(policy(), {}))); assert.equal(calls, 0);
});
check('actual-lifecycle-preparation-sees-the-reservation-before-child-entry', async () => {
  const h = application(); const r = await h.root.prepareOriginalFunding(h.f.input); assert.equal(r.phase, 'AWAITING_INDEPENDENT_PINS');
  assert.equal(h.counts().prepares, 1); assert.equal(JSON.parse(h.db.read()).reservations[0].amount, '5'); await h.root.close();
});
check('actual-lifecycle-funding-bound-keeps-the-same-spend-and-original', async () => {
  const h = application(); await h.root.prepareOriginalFunding(h.f.input); await h.root.commitOriginalFunding({}); h.setDay(12);
  const before = JSON.parse(h.db.read()).reservations[0].originalDigest; await h.root.submitOriginalFunding({});
  const r = JSON.parse(h.db.read()).reservations[0]; assert.equal(r.status, 'SPENT'); assert.equal(r.spentDay, 12); assert.equal(r.originalDigest, before); await h.root.close();
});
check('actual-accepted-terms-are-not-replaced-by-a-cheaper-caller-claim', async () => {
  const h = application(); const changed = structuredClone(h.f.input); changed.challenge.paymentRequired.accepts[0].amount = '1';
  await assert.rejects(h.root.prepareOriginalFunding(changed)); assert.equal(h.counts().prepares, 0); assert.equal(h.db.writes, 0); await h.root.close();
});
check('actual-payer-account-must-match-the-durable-budget-key', async () => {
  const h = application({ accountId: 'foreign.account' }); await assert.rejects(h.root.prepareOriginalFunding(h.f.input), /PAYER_ACCOUNT/);
  assert.equal(h.db.writes, 0); assert.equal(h.counts().prepares, 0); await h.root.close();
});
check('lost-reservation-ack-blocks-the-actual-lifecycle-before-preparation', async () => {
  const h = application(); h.db.mode = 'lostAck'; await assert.rejects(h.root.prepareOriginalFunding(h.f.input)); assert.equal(h.counts().prepares, 0);
  assert.equal(h.root.inspect().held, true); await assert.rejects(h.root.close());
});
check('existing-reservation-blocks-a-second-actual-preparation-after-reopen', async () => {
  const h = application(); await h.root.prepareOriginalFunding(h.f.input); await h.root.close();
  const b = application({ db: h.db }); await assert.rejects(b.root.prepareOriginalFunding(b.f.input)); assert.equal(b.counts().prepares, 0); await b.root.close();
});
check('child-preparation-rejection-retains-unknown-exposure', async () => {
  const h = application({ mode: 'prepareReject' }); await assert.rejects(h.root.prepareOriginalFunding(h.f.input));
  assert.equal(JSON.parse(h.db.read()).reservations[0].status, 'UNKNOWN'); await assert.rejects(h.root.close());
});
check('close-during-funding-prevents-late-bound-from-upgrading-unknown', async () => {
  const h = application(); await h.root.prepareOriginalFunding(h.f.input); h.submitGate = gate(); const submit = h.root.submitOriginalFunding({});
  const closing = h.root.close(); assert.equal(JSON.parse(h.db.read()).reservations[0].status, 'UNKNOWN');
  h.submitGate.resolve(F({ phase: 'FUNDING_INTAKE_BOUND', fundingIntakeStatus: 'BOUND' })); await assert.rejects(submit); await assert.rejects(closing);
  assert.equal(JSON.parse(h.db.read()).reservations[0].status, 'UNKNOWN'); assert.equal(h.root.inspect().held, true);
});
check('close-reentry-uses-one-owned-stop-promise', async () => {
  const h = application(); let reentered; h.onClose = () => { reentered = h.root.close(); };
  const closing = h.root.close(); assert.equal(reentered, closing); assert.equal(h.root.close(), closing); await closing; assert.equal(h.counts().closes, 1);
});
const cases = [];
for (const { id, run } of checks) { try { await run(); cases.push({ id, status: 'PASS' }); } catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? e) }); } }
const failed = cases.filter(c => c.status !== 'PASS').length;
console.log(JSON.stringify({ qualification: 'G1_ORIGINAL_FUNDING_SPENDING_DATA', passed: cases.length - failed, failed, cases,
  nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0,
  actualPrepare: 0, payouts: 0, sourceOnlyProductProfile: true, nativeDurability: 'NOT_ESTABLISHED' }));
if (failed) process.exitCode = 1;
