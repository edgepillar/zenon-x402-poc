// Actual lifecycle and spending owner with declared memory-only children.
// Fixed, invalid signature-shaped DATA; no signing, SDK, SQL or transport.
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createSdk105FundingServiceLifecycle as lifecycle,
  createSingleOriginalSpendingBoundedSdk105FundingServiceLifecycle as spendingLifecycle } from '../src/zenon/sdk105-funding-service-lifecycle.js';
import { createOriginalFundingSpendingReservations as journal } from '../src/original-funding-spending-reservations.js';
import { originalFundingSpendingDataFixtures } from './original-funding-spending.behavior.mjs';
import { retainedOriginalInputFixture } from './dynamic-plasma-retained-input.fixture.mjs';
import { assembleZenonDynamicPlasmaOriginalFundingDataV2 as assemble } from '../src/zenon/dynamic-plasma-original-funding-data.js';

const F = Object.freeze, checks = [], copy = value => structuredClone(value);
function check(id, run) { checks.push({ id, run }); }
function gate() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
function fixture({ bounded = true, db = originalFundingSpendingDataFixtures.memory(), paymentId = 'receipt.original.1' } = {}) {
  const original = retainedOriginalInputFixture(), packet = assemble(original.input, original.candidate, original.resourceUrl);
  const tx = packet.paymentPayload.payload.transaction, accepted = original.input.challenge.paymentRequired.accepts[0];
  const policy = { version: 1, policyId: 'receipt.budget.1', accountId: original.input.plannerContext.readInput.payerAddress,
    network: accepted.network, asset: accepted.asset, recipients: [accepted.payTo], maxPayment: '10', maxTotal: '30', maxDaily: '15', maxRecords: 16 };
  db.accountId = policy.accountId;
  const counts = { prepares: 0, commits: 0, submits: 0, handoffs: 0, services: 0, childCloses: 0, walletCloses: 0 };
  let clientClosed = false, walletClosed = false, today = 10;
  const h = { original, packet, db, policy, counts, reply: F({ phase: 'FUNDING_INTAKE_BOUND', fundingIntakeStatus: 'BOUND', transactionHash: tx.hash }),
    submitGate: null, onSubmit: null, day(value) { today = value; } };
  const client = F({
    prepareOriginalFunding: F(function prepare(input) { counts.prepares++; assert.deepEqual(input, original.input);
      return Promise.resolve(F({ phase: 'AWAITING_INDEPENDENT_PINS', packet })); }),
    commitOriginalFunding: F(function commit() { counts.commits++; return Promise.resolve(F({ phase: 'LOCAL_STORE_READBACK_MATCHED', transactionHash: tx.hash })); }),
    submitOriginalFunding: F(function submit() { counts.submits++; if (h.onSubmit) h.onSubmit(); return h.submitGate?.promise ?? Promise.resolve(h.reply); }),
    handoffToService: F(function handoff() { counts.handoffs++; return Promise.resolve(F({ phase: 'SERVICE_CLIENT_OPEN_ORIGINAL_RESTORED' })); }),
    submitOriginal: F(function service() { counts.services++; return Promise.resolve(undefined); }),
    inspect: F(function inspect() { return F({ lifecycle: clientClosed ? 'CLOSED' : 'OPEN', held: false }); }),
    close: F(function close() { counts.childCloses++; clientClosed = true; return Promise.resolve(undefined); }),
  });
  const wallet = F({ inspect: F(function inspect() { return F({ sdk105WalletOwnerVersion: 1, held: false,
    lifecycle: walletClosed ? 'CLOSED' : 'OPEN', clearCalls: counts.walletCloses,
    clearOutcome: walletClosed ? 'CLEAR_RETURNED' : 'NOT_REQUESTED', closeRequested: walletClosed, activeOperation: null,
    signingOutcome: 'RETURNED_DATA', wallet: F({ signedOriginal: F({ hash: tx.hash, signature: tx.signature, publicKey: tx.publicKey }) }) }); }),
    close: F(function close() { counts.walletCloses++; walletClosed = true; return Promise.resolve(undefined); }) });
  const selected = { client, walletOwner: wallet, fundingResourceUrl: original.resourceUrl };
  h.root = bounded ? spendingLifecycle({ ...selected, spending: { policy, backend: db.backend, paymentId, readDay: () => today } }) : lifecycle(selected);
  h.prepare = () => h.root.prepareOriginalFunding(original.input);
  h.commit = () => h.root.commitOriginalFunding({ expectedPins: copy(packet.expectedPins) });
  h.submit = () => h.root.submitOriginalFunding({ expectedPins: copy(packet.expectedPins) });
  h.ready = async () => { await h.prepare(); await h.commit(); };
  h.request = () => ({ originalPayment: { resourceUrl: original.resourceUrl, serializedCheckpoint: packet.serializedCheckpoint,
    expectedPins: copy(packet.expectedPins) }, selectedGrantId: 'grant.receipt.1', paymentRequiredHeader: original.input.challenge.paymentRequiredHeader });
  h.row = () => JSON.parse(db.read()).reservations[0];
  return h;
}
async function refused(h) {
  await assert.rejects(h.submit());
  assert.equal(h.root.inspect().fundingBound, false); assert.equal(h.root.inspect().held, true);
  assert.equal(h.row().status, 'UNKNOWN'); assert.equal(h.counts.submits, 1);
  await assert.rejects(h.root.handoffToService(h.request()));
  assert.equal(h.counts.handoffs + h.counts.services + h.counts.walletCloses, 0);
  await assert.rejects(h.root.close());
  assert.equal(h.counts.childCloses, 1); assert.equal(h.counts.walletCloses, 1);
}

check('exact-original-bound-keeps-normal-handoff-and-service-available', async () => {
  const h = fixture(); await h.ready(); const before = h.row(), receipt = await h.submit();
  assert.equal(receipt, h.reply); assert.equal(h.root.inspect().fundingBound, true);
  assert.equal(h.row().status, 'SPENT'); assert.equal(h.row().originalDigest, before.originalDigest); assert.equal(h.row().amount, before.amount);
  await h.root.handoffToService(h.request()); assert.equal(await h.root.submitOriginal(F({ request: 'declared.1' })), undefined);
  assert.equal(h.counts.handoffs, 1); assert.equal(h.counts.services, 1); assert.equal(h.counts.prepares, 1);
  await h.root.close(); assert.equal(h.root.inspect().lifecycle, 'CLOSED');
});
check('foreign-bound-hash-retains-unknown-budget-and-no-service', async () => {
  const h = fixture(); await h.ready(); h.reply = F({ ...h.reply, transactionHash: 'b'.repeat(64) }); await refused(h);
});
check('missing-bound-hash-cannot-promote-the-original-reservation', async () => {
  const h = fixture(); await h.ready(); const { transactionHash, ...rest } = h.reply; h.reply = F(rest); await refused(h);
});
check('nontext-bound-hash-cannot-promote-the-original-reservation', async () => {
  const h = fixture(); await h.ready(); h.reply = F({ ...h.reply, transactionHash: 1 }); await refused(h);
});
check('noncanonical-hash-case-cannot-substitute-for-exact-original-bytes', async () => {
  const h = fixture(); await h.ready(); const upper = h.reply.transactionHash.toUpperCase(); assert.notEqual(upper, h.reply.transactionHash);
  h.reply = F({ ...h.reply, transactionHash: upper }); await refused(h);
});
check('receipt-hash-accessor-is-refused-without-running-the-getter', async () => {
  const h = fixture(); await h.ready(); let getters = 0; const reply = { ...h.reply };
  Object.defineProperty(reply, 'transactionHash', { enumerable: true, get() { getters++; return h.packet.transactionHash; } });
  h.reply = F(reply); await refused(h); assert.equal(getters, 0);
});
check('receipt-proxy-is-refused-without-entering-proxy-hooks', async () => {
  const h = fixture(); await h.ready(); let hooks = 0;
  h.reply = new Proxy(h.reply, { getPrototypeOf() { hooks++; throw Error('unexpected hook'); } });
  await refused(h); assert.equal(hooks, 0);
});
check('inherited-hash-is-not-an-original-funding-receipt', async () => {
  const h = fixture(); await h.ready(); const { transactionHash, ...rest } = h.reply;
  h.reply = F(Object.assign(Object.create(F({ transactionHash })), rest)); await refused(h);
});
check('exact-hash-with-unknown-status-keeps-the-same-reservation-charged', async () => {
  const h = fixture(); await h.ready(); const before = h.row();
  h.reply = F({ ...h.reply, phase: 'SUBMISSION_OUTCOME_UNKNOWN', fundingIntakeStatus: 'UNKNOWN' });
  assert.equal(await h.submit(), h.reply); assert.equal(h.root.inspect().fundingBound, false); assert.equal(h.row().status, 'UNKNOWN');
  assert.equal(h.row().originalDigest, before.originalDigest); assert.equal(h.row().amount, before.amount);
  const read = journal(h.policy, h.db.backend); assert.equal(read.inspect(12).dailyExposure, before.amount); read.close();
  await assert.rejects(h.root.close());
});
check('exact-hash-with-inconsistent-bound-status-never-charges-spent', async () => {
  const h = fixture(); await h.ready(); h.reply = F({ ...h.reply, fundingIntakeStatus: 'UNKNOWN' });
  await h.submit(); assert.equal(h.row().status, 'UNKNOWN'); assert.equal(h.root.inspect().fundingBound, false); await assert.rejects(h.root.close());
});
check('foreign-unknown-receipt-is-not-an-observation-of-the-original', async () => {
  const h = fixture(); await h.ready(); h.reply = F({ phase: 'SUBMISSION_OUTCOME_UNKNOWN', fundingIntakeStatus: 'UNKNOWN', transactionHash: 'c'.repeat(64) });
  await refused(h);
});
check('unprepared-lifecycle-refuses-before-the-funding-child-is-entered', async () => {
  const h = fixture({ bounded: false }); await assert.rejects(h.submit());
  assert.equal(h.counts.submits, 0); assert.equal(h.root.inspect().fundingBound, false); await h.root.close();
});
check('matching-bound-after-close-cannot-upgrade-local-or-budget-state', async () => {
  const h = fixture(); await h.ready(); h.submitGate = gate(); const pending = h.submit(), rejected = assert.rejects(pending);
  const closing = h.root.close(), closeRejected = assert.rejects(closing); const before = h.db.read();
  assert.equal(h.row().status, 'UNKNOWN'); h.submitGate.resolve(h.reply); await rejected; await closeRejected;
  assert.equal(h.db.read(), before); assert.equal(h.root.inspect().fundingBound, false); assert.equal(h.root.inspect().held, true);
  assert.equal(h.counts.handoffs + h.counts.services, 0); assert.equal(h.root.close(), closing);
});
check('standalone-lifecycle-rejects-a-late-matching-bound-receipt', async () => {
  const h = fixture({ bounded: false }); await h.ready(); h.submitGate = gate(); const pending = h.submit(), rejected = assert.rejects(pending);
  const closing = h.root.close(), closeRejected = assert.rejects(closing); h.submitGate.resolve(h.reply); await rejected; await closeRejected;
  assert.equal(h.root.inspect().fundingBound, false); assert.equal(h.root.inspect().held, true); assert.equal(h.counts.submits, 1);
});
check('reentrant-close-before-receipt-observation-cannot-admit-handoff', async () => {
  const h = fixture(); await h.ready(); let closing, closeRejected;
  h.onSubmit = () => { closing = h.root.close(); closeRejected = assert.rejects(closing); };
  await assert.rejects(h.submit()); await closeRejected;
  assert.equal(h.row().status, 'UNKNOWN'); assert.equal(h.root.inspect().fundingBound, false); assert.equal(h.counts.handoffs, 0);
});
check('mismatched-receipt-cannot-be-repaired-by-another-submit-or-prepare', async () => {
  const h = fixture(); await h.ready(); const correct = h.reply; h.reply = F({ ...correct, transactionHash: 'd'.repeat(64) });
  await assert.rejects(h.submit()); const retained = h.db.read(); h.reply = correct;
  await assert.rejects(h.submit()); await assert.rejects(h.prepare()); assert.equal(h.db.read(), retained);
  assert.equal(h.counts.prepares, 1); assert.equal(h.counts.submits, 1); await assert.rejects(h.root.close());
});
check('new-memory-owner-keeps-unknown-exposure-and-refuses-another-original', async () => {
  const h = fixture(); await h.ready(); h.reply = F({ ...h.reply, transactionHash: 'e'.repeat(64) }); await assert.rejects(h.submit());
  const before = h.db.read(); await assert.rejects(h.root.close()); const reopened = fixture({ db: h.db, paymentId: 'receipt.new.label' });
  await assert.rejects(reopened.prepare()); assert.equal(reopened.counts.prepares, 0); assert.equal(h.db.read(), before);
  const view = journal(h.policy, h.db.backend); assert.equal(view.inspect(12).unresolved, 1); assert.equal(view.inspect(12).dailyExposure, '5'); view.close();
  await assert.rejects(reopened.root.close());
});
check('stale-budget-cas-cannot-promote-a-matching-funding-receipt', async () => {
  const h = fixture(); await h.ready(); const prior = h.row(), another = journal(h.policy, h.db.backend);
  another.observe(prior.paymentId, prior.originalDigest, 'UNKNOWN', 11); another.close(); const retained = h.db.read(); h.day(11);
  await assert.rejects(h.submit()); assert.equal(h.db.read(), retained); assert.equal(h.row().status, 'UNKNOWN');
  assert.equal(h.root.inspect().held, true); assert.equal(h.counts.handoffs + h.counts.services, 0); await assert.rejects(h.root.close());
});

export const originalFundingReceiptDataCases = F(checks.map(row => F(row)));
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = [];
  for (const { id, run } of checks) {
    try { await run(); cases.push({ id, status: 'PASS' }); }
    catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? e) }); }
  }
  const failed = cases.filter(row => row.status !== 'PASS').length;
  console.log(JSON.stringify({ qualification: 'G1_G2_ORIGINAL_FUNDING_RECEIPT_DATA', passed: cases.length - failed, failed, cases,
    nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0,
    nativeFundingAcknowledgement: 'NOT_ESTABLISHED', nativeReopen: 'NOT_ESTABLISHED', physicalRelease: 'NOT_ESTABLISHED' }));
  if (failed) process.exitCode = 1;
}
