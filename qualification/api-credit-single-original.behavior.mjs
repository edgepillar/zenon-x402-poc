// Pure DATA and declared child/CAS ports. No native store, SDK, signer or I/O.
import assert from 'node:assert/strict';
import { apiCreditOperatorDataCases, closeApiCreditOperatorDataFixtures } from './api-credit-operator.behavior.mjs';
import { originalFundingSpendingStoreDataCases } from './original-funding-spending-store.behavior.mjs';
import { originalFundingSpendingDataFixtures as f } from './original-funding-spending.behavior.mjs';
import { apiCreditCommandDataFixtures as commands } from './api-credit-command.behavior.mjs';
import { createOriginalFundingSpendingReservations as journal, requireOriginalFundingSpendingStateTransition as transition } from '../src/original-funding-spending-reservations.js';
import { createSdk105ApiCreditApplicationLifecycle as application } from '../src/zenon/sdk105-api-credit-application-lifecycle.js';
import { createSingleOriginalSpendingBoundedSdk105FundingServiceLifecycle as singleLifecycle } from '../src/zenon/sdk105-funding-service-lifecycle.js';

const F = Object.freeze, checks = [...apiCreditOperatorDataCases, ...originalFundingSpendingStoreDataCases];
function check(id, run) { checks.push({ id, run }); }
function gate() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function app(options = {}) {
  const db = options.db ?? f.memory(), r = { db, file: null, policy: null, prepareGate: options.prepareGate ?? null,
    entered: { prepareOriginalFunding: 0, commitOriginalFunding: 0, submitOriginalFunding: 0, handoffToService: 0, submitOriginal: 0 }, source: null };
  r.h = commands.fixture({ createLifecycle(c) {
    const policy = r.policy = { ...c.spending.policy, maxPayment: '5', maxDaily: '30', maxTotal: '100', maxRecords: 16 };
    db.accountId = policy.accountId;
    if (options.seed) {
      const j = journal(policy, db.backend), a = c.spending.policy;
      j.reserve({ paymentId: 'earlier.payment', originalDigest: f.H, network: a.network, asset: a.asset,
        recipient: a.recipients[0], amount: '5' }, 10);
      if (options.seed !== 'RESERVED') j.observe('earlier.payment', f.H, options.seed, 10); j.close();
    }
    const state = r.file = { revoked: false, held: false, busy: false, databaseOpen: true, closeCalls: 0, revokeCalls: 0 };
    function available() { if (state.revoked || state.held || state.busy || !state.databaseOpen) throw Error('declared file unavailable'); }
    const backend = F({ load(account) { available(); return db.backend.load(account); },
      compareAndSwap(account, expected, proposed) {
        available(); state.busy = true;
        try {
          const observed = db.backend.compareAndSwap(account, expected, proposed);
          if (observed === proposed) {
            // Keep the existing declared child fixture's local read mirror.
            // The actual account admission always uses the shared CAS above.
            c.spending.backend.compareAndSwap(account, c.spending.backend.load(account), proposed);
          }
          return observed;
        } finally { state.busy = false; }
      } });
    const fileOwner = F({ backend, assertCurrent: F(() => { available(); }),
      inspect: F(() => F({ spendingFileOwnerVersion: 1, lifecycle: state.held ? 'HELD' : !state.databaseOpen ? 'CLOSED' : state.revoked ? 'REVOKED' : 'OPEN',
        held: state.held, busy: state.busy, backendClosed: state.revoked, databaseOpen: state.databaseOpen,
        physicalCloseEntered: state.closeCalls > 0, physicalCloseReturned: !state.databaseOpen })),
      revoke: F(() => { state.revokeCalls++; state.revoked = true; if (state.busy) state.held = true; }),
      close: F(() => {
        state.closeCalls++; assert.equal(state.revoked, true); assert.equal(state.held, false);
        assert.equal(c.client.inspect().lifecycle, 'CLOSED'); assert.equal(c.walletOwner.inspect().lifecycle, 'CLOSED');
        state.databaseOpen = false;
      }) });
    const child = {};
    for (const name of Object.keys(r.entered)) child[name] = F(input => {
      r.entered[name]++;
      if (name === 'prepareOriginalFunding' && r.prepareGate !== null) return r.prepareGate.promise;
      const result = Reflect.apply(c.client[name], c.client, [input]);
      if (name === 'prepareOriginalFunding' && options.prepareLoss) return result.then(() => { throw Error('declared preparation result loss'); });
      return result;
    });
    child.inspect = c.client.inspect; child.close = c.client.close; r.source = c;
    return application({ client: F(child), walletOwner: c.walletOwner, fileOwner, fundingResourceUrl: c.fundingResourceUrl,
      spending: { policy, paymentId: options.paymentId ?? 'payment.api.first', readDay: () => options.day ?? 10 } });
  } });
  r.root = r.h.root;
  if (options.changedContext) r.h.f.input.originalRequest.requestId = 'post-input.next-context';
  return r;
}
async function heldStop(r) { const stop = r.root.close(); assert.equal(r.root.close(), stop); await assert.rejects(stop); assert.equal(r.file.closeCalls, 0); }
check('single-original-admission-is-a-live-reservation-not-a-reopened-permit', () => {
  const db = f.memory(), p = f.policy(), j = journal(p, db.backend), r = j.reserveSingleOriginal(f.original(), 10);
  assert.equal(r.status, 'RESERVED'); assert.ok(Object.isFrozen(r)); assert.equal(j.inspect(10).unresolved, 1);
  j.close(); const reopened = journal(p, db.backend); assert.equal(reopened.inspect(11).authority, 'NONE');
  assert.throws(() => reopened.reserveSingleOriginal(f.original('different'), 11), /UNRESOLVED_ORIGINAL/);
  assert.equal(reopened.snapshot().held, true); reopened.close();
});
check('single-original-refuses-both-reserved-and-unknown-with-new-id-and-digest', () => {
  for (const status of ['RESERVED', 'UNKNOWN']) {
    const db = f.memory(), p = f.policy(), first = journal(p, db.backend); first.reserve(f.original(), 10);
    if (status === 'UNKNOWN') first.observe('payment.1', f.H, status, 10); first.close();
    const before = db.read(), writes = db.writes, next = journal(p, db.backend);
    assert.throws(() => next.reserveSingleOriginal(f.original('new.context'), 11), /UNRESOLVED_ORIGINAL/);
    assert.equal(db.read(), before); assert.equal(db.writes, writes); assert.equal(next.snapshot().held, true); next.close();
  }
});
check('single-original-does-not-expire-unresolved-exposure-at-a-later-day', () => {
  const db = f.memory(), p = f.policy(), j = journal(p, db.backend); j.reserve(f.original(), 10); j.observe('payment.1', f.H, 'UNKNOWN', 10); j.close();
  const before = db.read(), reopened = journal(p, db.backend);
  assert.throws(() => reopened.reserveSingleOriginal(f.original('later'), 100000), /UNRESOLVED_ORIGINAL/); assert.equal(db.read(), before); reopened.close();
});
check('single-original-held-instance-cannot-switch-to-legacy-admission-or-observe-a-clear', () => {
  const db = f.memory(), j = journal(f.policy(), db.backend); j.reserve(f.original(), 10);
  assert.throws(() => j.reserveSingleOriginal(f.original('second'), 10)); const before = db.read();
  assert.throws(() => j.reserve(f.original('second'), 10), /HELD/); assert.throws(() => j.observe('payment.1', f.H, 'SPENT', 10), /HELD/);
  assert.equal(db.read(), before); j.close();
});
check('single-original-retains-the-existing-generic-carry-forward-contract', () => {
  const db = f.memory(), j = journal(f.policy(), db.backend); j.reserve(f.original(), 10); j.observe('payment.1', f.H, 'UNKNOWN', 10);
  j.reserve(f.original('legacy.second'), 11); assert.equal(j.inspect(11).unresolved, 2); assert.equal(j.snapshot().held, false); j.close();
});
check('single-original-spent-history-does-not-release-total-or-daily-limits', () => {
  const db = f.memory(), p = f.policy({ maxDaily: '10', maxTotal: '10' }), j = journal(p, db.backend);
  j.reserveSingleOriginal(f.original('a', '5'), 10); j.observe('a', f.original('a').originalDigest, 'SPENT', 10);
  j.reserveSingleOriginal(f.original('b', '5'), 10); j.observe('b', f.original('b').originalDigest, 'SPENT', 10);
  assert.throws(() => j.reserveSingleOriginal(f.original('c', '1'), 11), /TOTAL_LIMIT/); assert.equal(j.inspect(11).totalExposure, '10'); j.close();
});
check('single-original-spent-history-keeps-id-and-original-digest-idempotence', () => {
  const db = f.memory(), j = journal(f.policy(), db.backend); j.reserveSingleOriginal(f.original(), 10); j.observe('payment.1', f.H, 'SPENT', 10);
  assert.throws(() => j.reserveSingleOriginal(f.original('payment.1', '6'), 11), /ORIGINAL_ALREADY_RESERVED/);
  assert.throws(() => j.reserveSingleOriginal(f.original('alias', '5', { originalDigest: f.H }), 11), /ORIGINAL_ALREADY_RESERVED/);
  assert.equal(j.snapshot().held, false); j.reserveSingleOriginal(f.original('next'), 11); assert.equal(j.inspect(11).records, 2); j.close();
});
check('single-original-cas-conflict-stops-a-second-live-reader-before-admission', () => {
  const db = f.memory(), p = f.policy(), a = journal(p, db.backend), b = journal(p, db.backend);
  a.reserveSingleOriginal(f.original('a'), 10); assert.throws(() => b.reserveSingleOriginal(f.original('b'), 10), /CONFLICT/);
  assert.equal(b.snapshot().held, true); assert.equal(JSON.parse(db.read()).reservations.length, 1); a.close(); b.close();
});
check('single-original-lost-reservation-ack-is-not-a-new-preparation-on-reopen', () => {
  const db = f.memory(), p = f.policy(), a = journal(p, db.backend); db.mode = 'lostAck';
  assert.throws(() => a.reserveSingleOriginal(f.original(), 10), /COMMIT_UNKNOWN/); a.close(); db.mode = 'normal';
  const before = db.read(), b = journal(p, db.backend); assert.throws(() => b.reserveSingleOriginal(f.original('different'), 10), /UNRESOLVED_ORIGINAL/);
  assert.equal(db.read(), before); b.close();
});
check('single-original-reentrant-close-after-write-cannot-return-live-authority', () => {
  const db = f.memory(), a = journal(f.policy(), db.backend); db.afterWrite = () => a.close();
  assert.throws(() => a.reserveSingleOriginal(f.original(), 10), /CLOSED/); assert.equal(a.snapshot().held, true);
  assert.equal(JSON.parse(db.read()).reservations[0].status, 'RESERVED');
});
check('single-original-keeps-the-existing-canonical-transition-and-storage-schema', () => {
  const p = f.policy(), db = f.memory(), j = journal(p, db.backend); j.reserveSingleOriginal(f.original(), 10);
  assert.equal(transition(null, db.read(), p).version, 1); assert.deepEqual(Object.keys(JSON.parse(db.read())), ['version', 'policy', 'revision', 'lastDay', 'reservations']);
  const before = db.read(); j.observe('payment.1', f.H, 'UNKNOWN', 10); assert.equal(transition(before, db.read(), p).reservations[0].status, 'UNKNOWN'); j.close();
});
check('single-original-missing-policy-arity-and-foreign-recipient-do-not-write', () => {
  const db = f.memory(), j = journal(f.policy(), db.backend);
  assert.throws(() => j.reserveSingleOriginal(f.original())); assert.throws(() => j.reserveSingleOriginal(f.original(), 10, true));
  assert.throws(() => j.reserveSingleOriginal(f.original('x', '5', { recipient: 'foreign' }), 10));
  assert.equal(db.writes, 0); assert.equal(j.snapshot().held, false); j.close();
});
check('single-original-blocks-only-the-selected-account-policy-ledger', () => {
  const a = f.memory(), b = f.memory(), first = journal(f.policy(), a.backend), other = journal(f.policy(), b.backend);
  first.reserveSingleOriginal(f.original(), 10); other.reserveSingleOriginal(f.original('separate-ledger'), 10);
  assert.equal(first.inspect(10).records, 1); assert.equal(other.inspect(10).records, 1); first.close(); other.close();
});
check('actual-api-credit-application-hardwires-single-original-admission', async () => {
  const r = app(); assert.equal(r.root.inspect().spending.singleOriginalAdmission, true);
  await r.root.prepareOriginalFunding(r.h.f.input); assert.equal(r.entered.prepareOriginalFunding, 1);
  assert.equal(JSON.parse(r.db.read()).reservations[0].status, 'RESERVED'); await r.root.close(); assert.equal(r.file.closeCalls, 1);
});
check('actual-application-refuses-preexisting-uncertainty-before-any-child-preparation', async () => {
  for (const seed of ['RESERVED', 'UNKNOWN']) {
    const r = app({ seed, paymentId: 'changed.payment', changedContext: true, day: 11 }), before = r.db.read(), writes = r.db.writes;
    await assert.rejects(r.root.prepareOriginalFunding(r.h.f.input)); assert.equal(r.entered.prepareOriginalFunding, 0);
    assert.equal(r.entered.submitOriginalFunding, 0); assert.equal(r.db.read(), before); assert.equal(r.db.writes, writes);
    assert.equal(r.root.inspect().held, true); await heldStop(r);
  }
});
check('declared-preparation-result-loss-keeps-account-blocked-for-a-new-application', async () => {
  const first = app({ prepareLoss: true }); await assert.rejects(first.root.prepareOriginalFunding(first.h.f.input));
  assert.equal(first.entered.prepareOriginalFunding, 1); assert.equal(JSON.parse(first.db.read()).reservations[0].status, 'UNKNOWN'); await heldStop(first);
  const before = first.db.read(), next = app({ db: first.db, paymentId: 'new.payment', changedContext: true });
  await assert.rejects(next.root.prepareOriginalFunding(next.h.f.input)); assert.equal(next.entered.prepareOriginalFunding, 0);
  assert.equal(next.db.read(), before); await heldStop(next);
});
check('actual-application-lost-cas-ack-never-enters-preparation-before-or-after-reopen', async () => {
  const first = app(); first.db.mode = 'lostAck'; await assert.rejects(first.root.prepareOriginalFunding(first.h.f.input));
  assert.equal(first.entered.prepareOriginalFunding, 0); first.db.mode = 'normal'; await heldStop(first);
  const before = first.db.read(), next = app({ db: first.db, paymentId: 'new.payment', changedContext: true });
  await assert.rejects(next.root.prepareOriginalFunding(next.h.f.input)); assert.equal(next.entered.prepareOriginalFunding, 0);
  assert.equal(next.db.read(), before); await heldStop(next);
});
check('two-actual-application-instances-share-one-cas-admission-before-child-entry', async () => {
  const db = f.memory(), first = app({ db }), second = app({ db, paymentId: 'competing.payment', changedContext: true });
  const a = first.root.prepareOriginalFunding(first.h.f.input), b = second.root.prepareOriginalFunding(second.h.f.input);
  await a; await assert.rejects(b); assert.equal(first.entered.prepareOriginalFunding, 1); assert.equal(second.entered.prepareOriginalFunding, 0);
  assert.equal(JSON.parse(db.read()).reservations.length, 1); await first.root.close(); await heldStop(second);
});
check('close-and-late-preparation-do-not-release-the-record-or-admit-a-replacement', async () => {
  const late = gate(), first = app({ prepareGate: late }), preparation = first.root.prepareOriginalFunding(first.h.f.input), closing = first.root.close();
  assert.equal(JSON.parse(first.db.read()).reservations[0].status, 'UNKNOWN');
  const before = first.db.read(), next = app({ db: first.db, paymentId: 'late.replacement', changedContext: true });
  await assert.rejects(next.root.prepareOriginalFunding(next.h.f.input)); assert.equal(next.entered.prepareOriginalFunding, 0); await heldStop(next);
  late.resolve(F({ phase: 'AWAITING_INDEPENDENT_PINS', packet: first.h.packet })); await assert.rejects(preparation); await assert.rejects(closing);
  assert.equal(first.db.read(), before); assert.equal(first.entered.prepareOriginalFunding, 1); assert.equal(first.file.closeCalls, 0);
});
check('reopened-spent-history-alone-never-authorizes-commit-or-funding-dispatch', async () => {
  const r = app({ seed: 'SPENT', paymentId: 'next.payment', changedContext: true });
  await assert.rejects(r.root.commitOriginalFunding({ expectedPins: r.h.packet.expectedPins }));
  await assert.rejects(r.root.submitOriginalFunding({ expectedPins: r.h.packet.expectedPins }));
  assert.equal(r.entered.commitOriginalFunding + r.entered.submitOriginalFunding, 0); assert.equal(r.root.inspect().held, false); await r.root.close();
});
check('command-data-cannot-disable-single-original-admission-with-an-extra-flag', () => {
  let reads = 0;
  assert.throws(() => singleLifecycle({ client: {}, walletOwner: {}, fundingResourceUrl: 'https://single.invalid/funding',
    spending: { policy: f.policy(), paymentId: 'new', readDay: () => 10, backend: { load() { reads++; }, compareAndSwap() {} }, singleOriginal: false } }));
  assert.equal(reads, 0);
});

const cases = [];
for (const { id, run } of checks) { try { await run(); cases.push({ id, status: 'PASS' }); } catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? e) }); } }
await closeApiCreditOperatorDataFixtures();
const failed = cases.filter(c => c.status !== 'PASS').length;
console.log(JSON.stringify({ qualification: 'G2_SINGLE_ORIGINAL_ACCOUNT_ADMISSION_DATA', passed: cases.length - failed, failed, cases,
  priorOperatorCases: apiCreditOperatorDataCases.length, priorSpendingStoreCases: originalFundingSpendingStoreDataCases.length,
  declaredChildAndCasPortsOnly: true, nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0,
  nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0, nativeDurability: 'NOT_ESTABLISHED',
  freshProcessAcceptance: 'NOT_ESTABLISHED', signerResponseLossAcceptance: 'NOT_ESTABLISHED', atomicExternalDispatchFencing: 'NOT_ESTABLISHED' }));
if (failed) process.exitCode = 1;
