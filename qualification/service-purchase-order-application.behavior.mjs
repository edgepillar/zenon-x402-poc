import assert from 'node:assert/strict';
import { capturePurchasedOrderApplicationSelection as capture, purchasedOrderApplicationSelectionFromRecovery as restore,
  purchasedOrderApplicationRecoveryDigest as digest } from '../src/service-purchase-order-application-core.js';
import { inspectPurchasedOrderFundingEnvelope as fundingEnvelope } from '../src/service-purchase-order-funding-cas-contract.js';
import { inspectPurchasedOrderFulfillmentEnvelope as journalEnvelope } from '../src/service-purchase-order-fulfillment-cas-contract.js';
import { purchasedCompensationOriginalDigest } from '../src/service-purchase-fulfillment.js';
import { applicationHarness as harness, proof, deferred, drain, stop, dispatch } from './service-purchase-order-application.fixture.mjs';
const checks = [], cases = [];
function check(id, run) { checks.push({ id, run }); }
function next(record) { return restore(record.recordJson, record.recordDigest, { fundingOwnerId: 'worker.recovery.funding', fulfillmentOwnerId: 'worker.recovery.journal' }); }
check('construction-and-dormant-refusals-do-not-read-claim-or-verify-either-store', async () => {
  const h = harness(), before = { ...h.h.calls, ...h.calls }, a = h.create();
  assert.throws(() => a.app.readFunding(), /NOT_STARTED/); await assert.rejects(a.app.verifyFunding(proof()), /NOT_STARTED/);
  assert.throws(() => a.app.exportRecoveryRecord(), /NOT_STARTED/); assert.deepEqual({ ...h.h.calls, ...h.calls }, before); await stop(a.app);
});
check('startup-retains-both-original-records-before-any-verifier-entry', async () => {
  const h = harness(), a = h.create(), v = a.app.start(); assert.equal(v.phase, 'RETAINED'); assert.equal(h.record().fundingReceiptJson, null);
  assert.equal(h.record().deliveries.length, 0); assert.equal(h.calls.verifies, 0); assert.equal(v.fulfillmentRecorded, false); await stop(a.app);
});
check('successful-verification-acknowledges-the-liability-copy-before-returning-success', async () => {
  const h = harness(), a = h.create(); a.app.start(); h.verifier = () => {
    assert.equal(h.record().fundingReceiptJson, null); assert.equal(JSON.parse(fundingEnvelope(h.h.fundingRow).receiptJson).phase, 'VERIFYING'); return Promise.resolve(h.h.f.verifiedRecord);
  };
  const v = await a.app.verifyFunding(proof()); assert.equal(v.phase, 'VERIFIED'); assert.equal(v.fulfillmentRecorded, true); assert.equal(v.quantityOwed, 10);
  assert.equal(h.record().fundingReceiptJson, fundingEnvelope(h.h.fundingRow).receiptJson); assert.equal(a.app.readLiability().paymentAtMs, null); await stop(a.app);
});
check('persistent-pending-never-creates-a-liability-receipt-or-replaces-the-payment', async () => {
  const h = harness(), a = h.create(); a.app.start(); h.verifier = () => Promise.reject(Error('synthetic pending'));
  for (let i = 0; i < 3; i++) assert.equal((await a.app.verifyFunding(proof())).phase, 'REJECTED');
  await assert.rejects(a.app.verifyFunding(proof()), /VERIFICATION_REFUSED/); assert.equal(h.calls.verifies, 3);
  assert.equal(h.record().fundingReceiptJson, null); assert.equal(a.app.readLiability().quantityOwed, 0); assert.equal(a.app.snapshot().phase, 'OPEN'); await stop(a.app);
});
check('pending-to-success-retains-the-same-original-payment-and-both-journal-bindings', async () => {
  const h = harness(), a = h.create(); a.app.start(); const original = h.h.p.paymentRecordJson; h.verifier = () => Promise.reject(Error('synthetic pending'));
  await a.app.verifyFunding(proof()); h.verifier = () => Promise.resolve(h.h.f.verifiedRecord); await a.app.verifyFunding(proof());
  assert.equal(JSON.parse(h.record().fundingReceiptJson).paymentRecordJson, original); assert.equal(a.app.readLiability().quantityOwed, 10); await stop(a.app);
});
check('lost-funding-acknowledgement-keeps-journal-unfunded-until-explicit-recovery', async () => {
  const h = harness(), a = h.create(); a.app.start(); h.fundingMode = 'lostVerifiedAck'; await assert.rejects(a.app.verifyFunding(proof()), /FUNDING_UNKNOWN/);
  assert.equal(h.record().fundingReceiptJson, null); assert.equal(JSON.parse(fundingEnvelope(h.h.fundingRow).receiptJson).phase, 'VERIFIED');
  const r = a.app.exportRecoveryRecord(), receipt = fundingEnvelope(h.h.fundingRow).receiptJson; await stop(a.app); h.fundingMode = 'normal';
  const b = h.create(next(r)); assert.equal(b.app.start().fulfillmentRecorded, true); assert.equal(h.record().fundingReceiptJson, receipt); assert.equal(h.calls.verifies, 1); await stop(b.app);
});
check('lost-liability-copy-acknowledgement-holds-without-returning-funded-success', async () => {
  const h = harness(), a = h.create(); a.app.start(); h.h.mode = 'lostAck'; await assert.rejects(a.app.verifyFunding(proof()), /LIABILITY_UNKNOWN/);
  assert.equal(a.app.snapshot().phase, 'HELD'); assert.throws(() => a.app.readFunding(), /UNAVAILABLE/);
  const r = a.app.exportRecoveryRecord(), receipt = h.record().fundingReceiptJson; h.h.mode = 'normal'; await stop(a.app);
  const b = h.create(next(r)); assert.equal(b.app.start().quantityOwed, 10); assert.equal(h.record().fundingReceiptJson, receipt); assert.equal(h.calls.verifies, 1); await stop(b.app);
});
check('startup-recovers-a-verified-source-and-an-unfunded-journal-without-authentication', async () => {
  const h = harness(); await h.h.funding.verifyFunding(proof()); const a = h.create(); h.verifier = () => assert.fail('unexpected verifier');
  assert.equal(a.app.start().fulfillmentRecorded, true); assert.equal(h.calls.verifies, 0); assert.equal(a.app.readLiability().quantityOwed, 10); await stop(a.app);
});
check('journal-claim-ack-loss-preserves-both-partial-startup-records-for-new-epoch-recovery', async () => {
  const h = harness(), a = h.create(); h.h.mode = 'lostAck'; assert.throws(() => a.app.start(), /STARTUP_UNKNOWN/);
  assert.equal(journalEnvelope(h.h.row).recordJson, null); const r = a.app.exportRecoveryRecord(); h.h.mode = 'normal'; await stop(a.app);
  const b = h.create(next(r)); assert.equal(b.app.start().phase, 'RETAINED'); assert.equal(h.calls.verifies, 0); await stop(b.app);
});
check('stale-journal-selection-never-refreshes-or-retries-the-claim', async () => {
  const h = harness(), a = h.create(); a.app.start(); const old = h.selection(); const b = h.create(h.selection('worker.new.funding', 'worker.new.journal')); b.app.start();
  const selected = capture({ funding: h.selection('worker.third.funding').funding, fulfillmentOwnership: old.fulfillmentOwnership });
  const c = h.create(selected), before = h.h.calls.cas; assert.throws(() => c.app.start(), /STARTUP_UNKNOWN/); assert.equal(h.h.calls.cas, before + 1);
  assert.equal(h.calls.verifies, 0); await stop(a.app); await stop(b.app); await stop(c.app);
});
check('protected-recovery-digest-and-both-explicit-new-owners-are-required-before-startup', async () => {
  const h = harness(), a = h.create(); a.app.start(); const r = a.app.exportRecoveryRecord(), before = { ...h.calls, ...h.h.calls };
  assert.equal(digest(r.recordJson), r.recordDigest); assert.equal(r.snapshotAtomicAcrossStores, false); assert.equal(r.mayDispatch, false);
  assert.throws(() => restore(r.recordJson, 'sha256:' + 'f'.repeat(64), { fundingOwnerId: 'worker.a', fulfillmentOwnerId: 'worker.b' }), /RECOVERY_PIN_CONFLICT/);
  assert.throws(() => restore(r.recordJson, r.recordDigest, { fundingOwnerId: 'worker.a' })); assert.deepEqual({ ...h.calls, ...h.h.calls }, before); await stop(a.app);
});
check('same-store-selection-and-foreign-terms-are-refused-before-either-claim', async () => {
  const h = harness(), s = h.selection(); assert.throws(() => capture({ ...s, fulfillmentOwnership: { ...s.fulfillmentOwnership, storeId: s.funding.ownership.storeId } }), /STORE_SELECTION_CONFLICT/);
  const pins = JSON.parse(s.funding.purchase.paymentPinsJson); pins.digests.context = 'f'.repeat(64);
  assert.throws(() => capture({ ...s, funding: { ...s.funding, purchase: { ...s.funding.purchase, paymentPinsJson: JSON.stringify(pins) } } })); assert.equal(h.calls.fundingCAS, 0);
});
check('partial-delivery-updates-the-paired-outstanding-view-on-the-original-payment', async () => {
  const h = harness(), a = h.create(); a.app.start(); await a.app.verifyFunding(proof()); h.h.begin(a.app, 'request.application', 'delivery.application', 3); h.delivery(a.app);
  assert.equal(a.app.readLiability().deliveredQuantity, 3); assert.equal(a.app.readFunding().quantityOwed, 7); assert.equal(a.app.readFunding().liabilityObservationCurrent, false);
  const r = a.app.exportRecoveryRecord(), retained = journalEnvelope(h.h.row).recordJson; await stop(a.app); const b = h.create(next(r)); b.app.start();
  assert.equal(journalEnvelope(h.h.row).recordJson, retained); assert.equal(b.app.readLiability().quantityOwed, 7); assert.equal(h.calls.verifies, 1); await stop(b.app);
});
check('exact-grant-free-compensation-survives-application-recovery-without-a-payout', async () => {
  const h = harness(), a = h.create(); a.app.start(); await a.app.verifyFunding(proof()); const c = h.compensate(a.app), raw = JSON.stringify(c);
  a.app.retainCompensation(raw, purchasedCompensationOriginalDigest(raw)); const r = a.app.exportRecoveryRecord(); await stop(a.app);
  const b = h.create(next(r)); b.app.start(); assert.equal(h.record().compensation.originalJson, raw); h.compensate(b.app, true);
  assert.equal(b.app.readFunding().quantityOwed, 0); assert.equal(h.calls.verifies, 1); await stop(b.app);
});
check('ordinary-business-refusal-leaves-the-paired-application-open', async () => {
  const h = harness(), a = h.create(); a.app.start(); await a.app.verifyFunding(proof()); h.h.begin(a.app);
  const c = h.compensate(a.app), raw = JSON.stringify(c); assert.throws(() => a.app.retainCompensation(raw, purchasedCompensationOriginalDigest(raw)), /COMPENSATION_CONFLICT/);
  assert.equal(a.app.snapshot().phase, 'OPEN'); assert.equal(a.app.readLiability().unresolvedDelivery, true); await stop(a.app);
});
check('concurrent-verification-and-liability-mutation-are-refused-without-clearing-active-work', async () => {
  const h = harness(), gate = deferred(), a = h.create(); a.app.start(); h.verifier = () => gate.promise; const first = a.app.verifyFunding(proof());
  await assert.rejects(a.app.verifyFunding(proof()), /BUSY/); assert.throws(() => a.app.readLiability(), /BUSY/); assert.throws(() => a.app.exportRecoveryRecord(), /BUSY/);
  assert.equal(a.app.snapshot().verificationActive, true); gate.resolve(h.h.f.verifiedRecord); assert.equal((await first).fulfillmentRecorded, true); await stop(a.app);
});
check('close-during-verification-never-copies-a-late-success-into-the-journal', async () => {
  const h = harness(), gate = deferred(), a = h.create(); a.app.start(); h.verifier = () => gate.promise; const op = a.app.verifyFunding(proof()), before = h.h.row, closing = a.app.close();
  a.expire(); await assert.rejects(closing, /CLOSE_UNKNOWN/); gate.resolve(h.h.f.verifiedRecord); await assert.rejects(op, /OPERATION_CLOSED/); await drain();
  assert.equal(h.h.row, before); assert.equal(a.app.snapshot().closeOutcome, 'REJECTED'); assert.equal(a.app.snapshot().phase, 'HELD');
});
check('close-after-funding-commit-before-liability-copy-preserves-the-unpaired-recovery-state', async () => {
  const h = harness(), a = h.create(); a.app.start(); let closing;
  h.onFundingWrite = raw => { if (JSON.parse(fundingEnvelope(raw).receiptJson ?? '{}').phase === 'VERIFIED') closing = a.app.close(); };
  await assert.rejects(a.app.verifyFunding(proof()), /OPERATION_CLOSED/); await assert.rejects(closing, /CLOSE_UNKNOWN/); await drain();
  assert.equal(h.record().fundingReceiptJson, null); assert.equal(JSON.parse(fundingEnvelope(h.h.fundingRow).receiptJson).phase, 'VERIFIED');
  const r = a.app.exportRecoveryRecord(); h.onFundingWrite = null; const b = h.create(next(r)); assert.equal(b.app.start().fulfillmentRecorded, true); assert.equal(h.calls.verifies, 1); await stop(b.app);
});
check('reentrant-verification-during-liability-copy-is-busy-until-both-commits-are-acknowledged', async () => {
  const h = harness(), a = h.create(); a.app.start(); let reentrant;
  h.h.afterWrite = () => { if (h.record().fundingReceiptJson != null) reentrant = a.app.verifyFunding(proof()); };
  assert.equal((await a.app.verifyFunding(proof())).fulfillmentRecorded, true); await assert.rejects(reentrant, /BUSY/);
  assert.equal(h.calls.verifies, 1); assert.equal(a.app.snapshot().phase, 'OPEN'); await stop(a.app);
});
check('close-during-liability-copy-holds-and-preserves-the-committed-copy-for-recovery', async () => {
  const h = harness(), a = h.create(); a.app.start(); let closing;
  h.h.afterWrite = () => { if (h.record().fundingReceiptJson != null) closing = a.app.close(); };
  await assert.rejects(a.app.verifyFunding(proof()), /OPERATION_CLOSED/); await assert.rejects(closing, /CLOSE_UNKNOWN/);
  const r = a.app.exportRecoveryRecord(), receipt = h.record().fundingReceiptJson; assert.ok(receipt); h.h.afterWrite = null;
  const b = h.create(next(r)); assert.equal(b.app.start().fulfillmentRecorded, true); assert.equal(h.record().fundingReceiptJson, receipt);
  assert.equal(h.calls.verifies, 1); await stop(b.app);
});
check('clean-close-is-idempotent-and-never-closes-either-borrowed-backend', async () => {
  const h = harness(), a = h.create(); a.app.start(); const closing = a.app.close(); assert.equal(a.app.close(), closing); assert.equal(await closing, undefined);
  assert.equal(a.app.snapshot().logicalBackendRetirementEligible, true); assert.equal(a.app.snapshot().journalClosed, true); assert.equal(h.h.calls.closes, 0);
});
check('http-bound-response-follows-both-commits-and-has-the-existing-post-wire-format', async () => {
  const h = harness(), a = h.create(h.selection(), true); a.app.start(); const r = dispatch(a.app, h.request()); await drain();
  assert.equal(r.state.status, 202); assert.equal(r.state.body, 'BOUND'); assert.equal(r.state.success, 1); assert.equal(r.headers.Vary, 'PAYMENT-SIGNATURE');
  assert.equal(h.record().fundingReceiptJson, fundingEnvelope(h.h.fundingRow).receiptJson); assert.equal(r.headers['PAYMENT-RESPONSE'], undefined); await stop(a.app);
});
check('http-liability-ack-loss-never-emits-bound-and-exact-recovery-does-not-reauthenticate', async () => {
  const h = harness(), a = h.create(h.selection(), true); a.app.start(); h.h.mode = 'lostAck'; const r = dispatch(a.app, h.request()); await drain();
  assert.equal(r.state.status, 503); assert.equal(a.app.snapshot().phase, 'HELD'); const saved = a.app.exportRecoveryRecord(); h.h.mode = 'normal'; await stop(a.app);
  const b = h.create(next(saved), true); b.app.start(); const replay = dispatch(b.app, h.request()); assert.equal(replay.state.status, 202); assert.equal(h.calls.verifies, 1); await stop(b.app);
});
check('http-response-loss-replays-bound-without-another-verifier-or-journal-write', async () => {
  const h = harness(), a = h.create(h.selection(), true); a.app.start(); const first = dispatch(a.app, h.request(), true); await drain();
  assert.equal(first.state.failure, 1); const before = { ...h.h.calls, ...h.calls }, journal = h.h.row, funding = h.h.fundingRow;
  const replay = dispatch(a.app, h.request()); assert.equal(replay.state.status, 202); assert.deepEqual({ ...h.h.calls, ...h.calls }, before);
  assert.equal(h.h.row, journal); assert.equal(h.h.fundingRow, funding); await stop(a.app);
});
check('http-foreign-or-missing-original-payment-does-not-touch-either-store', async () => {
  const h = harness(), a = h.create(h.selection(), true); a.app.start(); const before = { ...h.h.calls, ...h.calls };
  assert.equal(dispatch(a.app, h.request(null)).state.status, 400); assert.equal(dispatch(a.app, h.request('Zm9yZWlnbg==')).state.status, 409);
  assert.deepEqual({ ...h.h.calls, ...h.calls }, before); await stop(a.app);
});
check('http-close-detaches-the-response-before-a-late-funding-success', async () => {
  const h = harness(), gate = deferred(), a = h.create(h.selection(), true); a.app.start(); h.verifier = () => gate.promise;
  const r = dispatch(a.app, h.request()), before = h.h.row, closing = a.app.close(); a.expire(); await assert.rejects(closing, /CLOSE_UNKNOWN/);
  gate.resolve(h.h.f.verifiedRecord); await drain(); assert.equal(r.state.ends, 0); assert.equal(r.state.failure, 1); assert.equal(h.h.row, before);
});

for (const { id, run } of checks) {
  try { await run(); cases.push({ id, status: 'PASS' }); }
  catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.code ?? e?.message ?? e) }); }
}
const failed = cases.filter(c => c.status !== 'PASS').length;
console.log(JSON.stringify({ qualification: 'PURCHASE_ORDER_PAIRED_APPLICATION_DATA', passed: cases.length - failed, failed, cases,
  actualFundingLiabilityHttpAndDeadlineCores: true, selectedBackendVerifierResponseAndTimerActuators: 'SYNTHETIC_DATA',
  nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, grants: 0, serviceExecutions: 0, payouts: 0,
  atomicAcrossStores: false, nativeDurability: 'NOT_ESTABLISHED', physicalResourceRelease: 'NOT_QUALIFIED', production: 'NOT_ACCEPTED' }));
if (failed) process.exitCode = 1;
