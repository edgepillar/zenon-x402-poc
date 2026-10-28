import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  claimPurchasedOrderFundingOwnership as claim, releasePurchasedOrderFundingOwnership as release,
  createPurchasedOrderFundingReceiptPort as receiptPort, inspectPurchasedOrderFundingEnvelope as inspect,
  inspectPurchasedOrderFundingReceipt, requirePurchasedOrderFundingEnvelopeTransition as transition,
} from '../src/service-purchase-order-funding-cas-contract.js';
import { capturePurchasedOrderPayment, createPurchasedOrderFundingOwner as createOwner } from '../src/service-purchase-order-funding.js';
import { orderFundingFixture as fixture, orderFundingOwnerInputs as inputs, orderFundingProof as proof, NOW } from './service-purchase-order-funding.fixture.mjs';

// Actual order owner, read-only verifier binding and receipt/envelope contracts;
// a synthetic atomic unique-payment backend and fixed synthetic authenticator.
function harness() {
  const f = fixture(), p = capturePurchasedOrderPayment(...inputs(f)), rows = new Map(), scopes = new Map();
  const counts = { reads: 0, casCalls: 0, commits: 0, verifies: 0, closes: 0 };
  let afterWrite = null, mode = 'normal', selectedVerifier = () => Promise.resolve(f.verifiedRecord);
  const backend = {
    readEnvelope(orderId, scope) {
      counts.reads++; const raw = rows.get(orderId) ?? null;
      return raw !== null && inspect(raw).paymentScope === scope ? raw : null;
    },
    compareAndSwapEnvelope(orderId, scope, expected, proposed) {
      counts.casCalls++; transition(expected, proposed);
      if ((rows.get(orderId) ?? null) !== expected || (scopes.has(scope) && scopes.get(scope) !== orderId)) return null;
      if (expected !== proposed) { rows.set(orderId, proposed); scopes.set(scope, orderId); counts.commits++; }
      afterWrite?.(proposed); if (mode === 'lostAck') throw Error('synthetic lost acknowledgement');
      return mode === 'booleanAck' ? true : proposed;
    },
    close() { counts.closes++; },
  };
  function acquire(ownerId = 'worker.1', selected = f) {
    const captured = capturePurchasedOrderPayment(...inputs(selected));
    const a = claim('store.order.synthetic', captured.orderId, captured.paymentScope,
      backend.readEnvelope(captured.orderId, captured.paymentScope), ownerId, backend);
    const port = receiptPort(a.ownerTokenJson, backend);
    const owner = createOwner(...inputs(selected), { receiptStore: port,
      verifyFundingEvidence: value => { counts.verifies++; return selectedVerifier(value); },
      clock: () => NOW + 30000, maximumVerificationAttempts: 3 });
    return { ...a, port, owner };
  }
  function pending() { const a = acquire(); a.owner.recover(); return a; }
  function raw() { return rows.get(f.terms.orderId) ?? null; }
  return { f, p, backend, counts, acquire, pending, raw,
    get mode() { return mode; }, set mode(value) { mode = value; },
    set afterWrite(value) { afterWrite = value; }, set verifier(value) { selectedVerifier = value; },
    setRaw(value) { rows.set(f.terms.orderId, value); } };
}
function changed(raw, editReceipt = null, editEnvelope = null) {
  const e = JSON.parse(raw); e.revision++;
  if (editReceipt) {
    const r = JSON.parse(e.receiptJson); editReceipt(r); e.receiptJson = JSON.stringify(r);
    e.receiptDigest = 'sha256:' + createHash('sha256').update('zenon-x402:order-funding-cas-receipt:v1\0').update(e.receiptJson).digest('hex');
  }
  editEnvelope?.(e); return JSON.stringify(e);
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const checks = [];
function check(id, run) { checks.push({ id, run }); }
check('explicit-claim-binds-payment-scope-with-no-receipt-or-authority', () => {
  const h = harness(), a = h.acquire(), e = inspect(h.raw());
  assert.equal(e.epoch, 1); assert.equal(e.revision, 1); assert.equal(e.paymentScope, h.p.paymentScope); assert.equal(e.receiptJson, null);
  assert.equal(a.authority, 'NONE'); assert.equal(a.physicalRelease, 'NOT_QUALIFIED'); assert.equal(h.counts.verifies, 0);
});
check('actual-grant-free-owner-retains-and-verifies-through-versioned-port', async () => {
  const h = harness(), a = h.pending(); assert.equal(inspect(h.raw()).revision, 2);
  const v = await a.owner.verifyFunding(proof()); assert.equal(inspect(h.raw()).revision, 4);
  assert.equal(v.quantityOwed, 10); assert.equal(v.grantFundingUnits, 27); assert.equal(v.paymentAtMs, null); assert.equal(v.grantCreated, false);
  assert.equal(inspect(h.raw()).receiptJson, a.owner.exportReceipt()); assert.equal(h.counts.verifies, 1);
});
check('verified-receipt-handoff-preserves-original-liability-without-verification', async () => {
  const h = harness(), a = h.pending(); await a.owner.verifyFunding(proof()); const before = inspect(h.raw());
  h.verifier = () => { assert.fail('recovery must not authenticate again'); };
  const b = h.acquire('worker.2'), after = inspect(h.raw());
  assert.equal(after.epoch, before.epoch + 1); assert.equal(after.revision, before.revision + 1);
  assert.equal(after.receiptJson, before.receiptJson); assert.equal(after.receiptDigest, before.receiptDigest);
  assert.equal(b.owner.recover().quantityOwed, 10); assert.equal(h.counts.verifies, 1);
});
check('late-old-worker-cannot-write-after-explicit-handoff', async () => {
  const gate = deferred(), h = harness(), a = h.pending(); h.verifier = () => gate.promise;
  const old = a.owner.verifyFunding(proof()); const pendingJson = inspect(h.raw()).receiptJson;
  const b = h.acquire('worker.2'); assert.equal(inspect(h.raw()).receiptJson, pendingJson); b.owner.recover();
  h.verifier = () => Promise.resolve(h.f.verifiedRecord); const v = await b.owner.verifyFunding(proof()); assert.equal(v.verificationAttempts, 2);
  const retained = h.raw(); gate.resolve(h.f.verifiedRecord); await assert.rejects(old, /CONFLICT/);
  assert.equal(h.raw(), retained); assert.equal(a.port.snapshot().held, true); assert.equal(h.counts.verifies, 2);
});
check('reused-worker-name-retires-old-token-even-with-identical-receipt', async () => {
  const h = harness(), a = h.pending(), b = h.acquire('worker.1'); b.owner.recover();
  assert.equal(JSON.parse(a.ownerTokenJson).ownerId, JSON.parse(b.ownerTokenJson).ownerId);
  assert.equal(JSON.parse(b.ownerTokenJson).epoch, 2); const retained = h.raw();
  await assert.rejects(a.owner.verifyFunding(proof()), /CONFLICT/); assert.equal(h.counts.verifies, 0); assert.equal(h.raw(), retained);
  assert.throws(() => receiptPort(a.ownerTokenJson, h.backend).load(h.p.orderId, h.p.paymentScope), /FENCED/);
});
check('lost-verified-ack-recovers-same-receipt-on-new-epoch', async () => {
  const h = harness(), a = h.pending();
  h.afterWrite = raw => { if (JSON.parse(JSON.parse(raw).receiptJson ?? '{}').phase === 'VERIFIED') h.mode = 'lostAck'; };
  await assert.rejects(a.owner.verifyFunding(proof()), /COMMIT_UNKNOWN/); const retained = inspect(h.raw()).receiptJson;
  assert.equal(JSON.parse(retained).phase, 'VERIFIED'); assert.equal(a.port.snapshot().held, true); assert.equal(a.port.snapshot().revision, 3);
  h.afterWrite = null; h.mode = 'normal'; const b = h.acquire('worker.2'); assert.equal(b.owner.recover().quantityOwed, 10);
  assert.equal(b.owner.exportReceipt(), retained); assert.equal(h.counts.verifies, 1);
});
check('malformed-ack-after-commit-does-not-advance-cached-envelope', async () => {
  const h = harness(), a = h.pending(); h.mode = 'booleanAck'; const revision = a.port.snapshot().revision;
  await assert.rejects(a.owner.verifyFunding(proof()), /COMMIT_UNKNOWN/);
  assert.equal(a.port.snapshot().revision, revision); assert.equal(inspect(h.raw()).revision, revision + 1); assert.equal(h.counts.verifies, 0);
});
check('lost-claim-ack-does-not-auto-read-or-auto-retry', () => {
  const h = harness(); h.mode = 'lostAck';
  assert.throws(() => claim('store.order.synthetic', h.p.orderId, h.p.paymentScope, null, 'worker.1', h.backend), /OWNERSHIP_ACK_UNKNOWN/);
  assert.equal(h.counts.casCalls, 1); assert.equal(h.counts.reads, 0); assert.equal(inspect(h.raw()).epoch, 1);
});
check('duplicate-payment-scope-cannot-be-claimed-for-a-second-order', () => {
  const h = harness(); h.pending(); const before = h.raw(), another = fixture('order.second');
  assert.throws(() => h.acquire('worker.second', another), /OWNERSHIP_CONFLICT/);
  assert.equal(h.raw(), before); assert.equal(h.counts.commits, 2); assert.equal(h.counts.verifies, 0);
});
check('logical-release-retains-verified-liability-without-physical-release-claim', async () => {
  const h = harness(), a = h.pending(); await a.owner.verifyFunding(proof()); const before = inspect(h.raw());
  const r = release(a.ownerTokenJson, h.raw(), h.backend), after = inspect(h.raw());
  assert.equal(after.ownerId, null); assert.equal(after.epoch, before.epoch + 1); assert.equal(after.receiptJson, before.receiptJson);
  assert.equal(r.authority, 'NONE'); assert.equal(r.physicalRelease, 'NOT_QUALIFIED'); assert.equal(h.counts.closes, 0);
  const b = h.acquire('worker.2'); assert.equal(b.owner.recover().quantityOwed, 10); assert.equal(h.counts.verifies, 1);
});
check('lost-release-ack-fences-the-old-writer-without-deleting-its-proof', async () => {
  const h = harness(), a = h.pending(), before = inspect(h.raw()).receiptJson; h.mode = 'lostAck';
  assert.throws(() => release(a.ownerTokenJson, h.raw(), h.backend), /OWNERSHIP_ACK_UNKNOWN/);
  assert.equal(inspect(h.raw()).ownerId, null); assert.equal(inspect(h.raw()).receiptJson, before);
  h.mode = 'normal'; await assert.rejects(a.owner.verifyFunding(proof()), /CONFLICT/); assert.equal(h.counts.verifies, 0);
});
check('pending-proof-resume-is-explicit-and-candidate-stays-identical', async () => {
  const gate = deferred(), h = harness(), a = h.pending(); h.verifier = () => gate.promise;
  const old = a.owner.verifyFunding(proof()); const b = h.acquire('worker.2'); b.owner.recover();
  await assert.rejects(b.owner.verifyFunding(proof('different')), /CANDIDATE_CONFLICT/); assert.equal(h.counts.verifies, 1);
  const closing = a.owner.close(); gate.reject(Error('synthetic unavailable')); await assert.rejects(old, /CLOSED/); await closing;
  h.verifier = () => Promise.resolve(h.f.verifiedRecord); assert.equal((await b.owner.verifyFunding(proof())).verificationAttempts, 2);
});
check('rejected-proof-can-be-refreshed-only-with-a-monotonic-attempt', async () => {
  const h = harness(), a = h.pending(); h.verifier = () => Promise.reject(Error('synthetic rejection'));
  assert.equal((await a.owner.verifyFunding(proof())).phase, 'REJECTED'); const original = JSON.parse(a.owner.exportReceipt()).paymentRecordJson;
  h.verifier = () => Promise.resolve(h.f.verifiedRecord); assert.equal((await a.owner.verifyFunding(proof('new-proof'))).verificationAttempts, 2);
  assert.equal(JSON.parse(a.owner.exportReceipt()).paymentRecordJson, original);
});
check('verified-receipt-cannot-be-downgraded-or-erased', async () => {
  const h = harness(), a = h.pending(); await a.owner.verifyFunding(proof()); const old = h.raw();
  const downgraded = changed(old, r => { r.phase = 'REJECTED'; r.verifiedRecordJson = null; r.sourceSettlementId = null; r.verificationObservedAtMs = null; });
  assert.throws(() => transition(old, downgraded), /VERIFIED_RECEIPT_CHANGED/);
  assert.throws(() => transition(old, changed(old, null, e => { e.receiptJson = null; e.receiptDigest = null; })), /RECEIPT_REMOVAL/);
});
check('initial-receipt-must-be-retained-before-any-verification-result', async () => {
  const h = harness(), a = h.pending(); await a.owner.verifyFunding(proof()); const complete = inspect(h.raw());
  const initial = JSON.parse(a.envelopeJson); const proposed = { ...initial, revision: 2, receiptJson: complete.receiptJson, receiptDigest: complete.receiptDigest };
  assert.throws(() => transition(a.envelopeJson, JSON.stringify(proposed)), /ORIGINAL_REQUIRED/);
});
check('attempt-reset-and-pending-candidate-replacement-are-refused', async () => {
  const gate = deferred(), h = harness(), a = h.pending(); h.verifier = () => gate.promise;
  const pending = a.owner.verifyFunding(proof()), old = h.raw();
  assert.throws(() => transition(old, changed(old, r => { r.phase = 'RETAINED'; r.attempts = 0; r.candidateJson = null; r.candidateDigest = null; })), /ATTEMPT_REQUIRED/);
  assert.throws(() => transition(old, changed(old, r => {
    r.attempts++; r.candidateJson = proof('other');
    r.candidateDigest = 'sha256:' + createHash('sha256').update('zenon-x402.order-funding.v1:candidate\0').update(r.candidateJson).digest('hex');
  })), /PENDING_CANDIDATE_CHANGED/);
  gate.resolve(h.f.verifiedRecord); await pending;
});
check('attempt-budget-is-immutable-in-the-durable-binding', () => {
  const h = harness(); h.pending(); const old = h.raw();
  assert.throws(() => transition(old, changed(old, r => { r.maximumVerificationAttempts++; })), /RECEIPT_BINDING_CHANGED/);
});
check('handoff-cannot-rewrite-a-valid-receipt-or-move-payment-scope', async () => {
  const h = harness(), a = h.pending(); await a.owner.verifyFunding(proof()); const old = h.raw();
  assert.throws(() => transition(old, changed(old, r => { r.verificationObservedAtMs++; }, e => { e.epoch++; e.ownerId = 'worker.2'; })), /HANDOFF_CHANGED_RECEIPT/);
  assert.throws(() => transition(old, changed(old, null, e => { e.paymentScope = 'sha256:' + 'f'.repeat(64); })));
});
check('revision-owner-and-epoch-rollback-or-overflow-are-refused', () => {
  const h = harness(); h.pending(); const old = h.raw();
  assert.throws(() => transition(old, changed(old, null, e => { e.revision -= 2; })), /REVISION_REQUIRED/);
  assert.throws(() => transition(old, changed(old, null, e => { e.ownerId = 'foreign.worker'; })), /OWNER_EPOCH_REQUIRED/);
  assert.throws(() => transition(old, changed(old, null, e => { e.epoch += 2; e.ownerId = 'foreign.worker'; })));
  const exhausted = JSON.parse(old); exhausted.epoch = exhausted.revision = Number.MAX_SAFE_INTEGER;
  assert.throws(() => claim(exhausted.storeId, exhausted.orderId, exhausted.paymentScope, JSON.stringify(exhausted), 'next.worker', h.backend), /VERSION_EXHAUSTED/);
});
check('wrong-checksum-or-self-consistent-invalid-authority-is-corruption', async () => {
  const h = harness(), a = h.pending(); await a.owner.verifyFunding(proof()); const old = h.raw(), e = JSON.parse(old);
  e.receiptDigest = 'sha256:' + 'f'.repeat(64); assert.throws(() => inspect(JSON.stringify(e)));
  assert.throws(() => inspect(changed(old, r => { const v = JSON.parse(r.verifiedRecordJson); v.amount = '101'; r.verifiedRecordJson = JSON.stringify(v); })));
  const checked = inspectPurchasedOrderFundingReceipt(inspect(old).receiptJson);
  assert.equal(checked.independentPinsChecked, false); assert.equal(checked.receipt.phase, 'VERIFIED');
});
check('receipt-port-accepts-only-token-bound-order-and-payment', () => {
  const h = harness(), a = h.acquire();
  assert.throws(() => a.port.load('order.other', h.p.paymentScope), /BINDING_CONFLICT/);
  assert.throws(() => a.port.load(h.p.orderId, 'sha256:' + 'f'.repeat(64)), /BINDING_CONFLICT/); assert.equal(a.port.snapshot().loaded, false);
  const token = JSON.parse(a.ownerTokenJson); token.paymentScope = 'sha256:' + 'f'.repeat(64);
  assert.throws(() => receiptPort(JSON.stringify(token), h.backend).load(h.p.orderId, token.paymentScope), /CORRUPT/);
});
check('port-cannot-commit-before-load-and-load-cannot-be-repeated', () => {
  const h = harness(), a = h.acquire(); assert.throws(() => a.port.compareAndSwap(h.p.orderId, h.p.paymentScope, null, '{}'), /RECOVERY_REQUIRED/);
  a.owner.recover(); assert.throws(() => a.port.load(h.p.orderId, h.p.paymentScope), /ALREADY_LOADED/);
});
check('lost-or-malformed-envelope-read-holds-before-verification', () => {
  const h = harness(), a = h.acquire(); h.setRaw('{}'); assert.throws(() => a.owner.recover(), /READ_UNKNOWN/);
  assert.equal(a.port.snapshot().held, true); assert.equal(h.counts.verifies, 0);
});
check('reentrant-port-close-after-native-like-commit-preserves-unknown', async () => {
  const h = harness(), a = h.pending(); h.afterWrite = () => a.port.close();
  await assert.rejects(a.owner.verifyFunding(proof()), /COMMIT_UNKNOWN/);
  assert.equal(a.port.snapshot().closed, true); assert.equal(a.port.snapshot().held, true);
  assert.equal(JSON.parse(inspect(h.raw()).receiptJson).phase, 'VERIFYING'); assert.equal(h.counts.verifies, 0); assert.equal(h.counts.closes, 0);
});
check('independent-checkpoint-pins-still-required-after-envelope-recovery', () => {
  const h = harness(), a = h.pending(), pin = JSON.parse(h.f.paymentPinsJson); pin.digests.context = 'f'.repeat(64);
  const bad = { ...h.f, paymentPinsJson: JSON.stringify(pin) };
  assert.throws(() => createOwner(...inputs(bad), { receiptStore: a.port, clock: () => NOW,
    maximumVerificationAttempts: 3, verifyFundingEvidence: () => Promise.resolve(h.f.verifiedRecord) }));
  assert.equal(h.counts.verifies, 0);
});
check('identical-receipt-cas-checks-current-envelope-without-increment', () => {
  const h = harness(), a = h.pending(), before = h.raw(), e = inspect(before);
  assert.equal(a.port.compareAndSwap(h.p.orderId, h.p.paymentScope, e.receiptJson, e.receiptJson), e.receiptJson);
  assert.equal(h.raw(), before); assert.equal(a.port.snapshot().revision, e.revision);
  h.acquire('worker.2'); assert.equal(a.port.compareAndSwap(h.p.orderId, h.p.paymentScope, e.receiptJson, e.receiptJson), null);
  assert.equal(a.port.snapshot().held, true);
});

const cases = [];
for (const { id, run } of checks) {
  try { await run(); cases.push({ id, status: 'PASS' }); }
  catch (error) { cases.push({ id, status: 'FAIL', error: String(error?.message ?? 'unknown') }); }
}
const failed = cases.filter(r => r.status !== 'PASS').length;
process.stdout.write(JSON.stringify({ qualification: 'PURCHASE_ORDER_FUNDING_FENCED_CAS_DATA', passed: cases.length - failed, failed, cases,
  actualOwnerAndEnvelopeCode: true, selectedAuthenticator: 'SYNTHETIC', backend: 'SYNTHETIC_ATOMIC_UNIQUE_PAYMENT_CAS',
  nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, grants: 0,
  serviceExecutions: 0, payouts: 0, freshProcessRecovery: false, physicalResourceRelease: 'NOT_QUALIFIED' }) + '\n');
if (failed) process.exitCode = 1;
