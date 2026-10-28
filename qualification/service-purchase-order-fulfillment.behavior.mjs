import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { MAX_ZENON_AMOUNT } from '../src/x402-wire.js';
import { createPurchasedOrderFulfillmentOwner as create } from '../src/service-purchase-order-fulfillment.js';
import { capturePurchasedOrderPayment, createPurchasedOrderFundingOwner } from '../src/service-purchase-order-funding.js';
import {
  claimPurchasedOrderFundingOwnership as claim, createPurchasedOrderFundingReceiptPort as receiptPort,
  inspectPurchasedOrderFundingEnvelope as envelope, requirePurchasedOrderFundingEnvelopeTransition as transition,
} from '../src/service-purchase-order-funding-cas-contract.js';
import { purchasedCompensationOriginalDigest as compensationDigest } from '../src/service-purchase-fulfillment.js';
import { capturePurchasedServiceOriginal } from '../src/service-credit-purchased-original-recovery.js';
import { capturePurchaseStorageOriginal } from '../src/service-purchase-storage-contract.js';
import { captureOriginalServiceRequestCustody, serializeOriginalServiceRequestCustody } from '../src/service-credit-original-request-custody-contract.js';
import { orderLiabilityFixture as fixture, orderFundingOwnerInputs as inputs, orderFundingProof as proof, NOW } from './service-purchase-order-fulfillment.fixture.mjs';

// Actual funding owner/receipt transitions, independent original-payment pins
// and service-request codecs. Selected stores, ownership fencing and proof
// authentication are synthetic DATA ports. No real grant is issued or used.
const code = suffix => e => e?.code === 'ORDER_FULFILLMENT_' + suffix;
const H = letter => 'sha256:' + letter.repeat(64), cases = [], checks = [];
function check(id, run) { checks.push({ id, run }); }
function harness(options = {}) {
  const f = fixture(options), p = capturePurchasedOrderPayment(...inputs(f)), storeId = 'store.order.liability.synthetic';
  let fundingRow = null, row = null, at = NOW + 30000, mode = 'normal', afterWrite = null, afterProof = null;
  let journalEpoch = 0, authentication = () => Promise.resolve(f.verifiedRecord);
  const originals = new Map(), proofs = new Map(), calls = { funding: 0, delivery: 0, compensation: 0, originalReads: 0, writes: 0, closes: 0 };
  const backend = {
    readEnvelope(orderId, scope) { assert.equal(orderId, p.orderId); assert.equal(scope, p.paymentScope); return fundingRow; },
    compareAndSwapEnvelope(orderId, scope, expected, next) {
      assert.equal(orderId, p.orderId); assert.equal(scope, p.paymentScope); transition(expected, next);
      if (expected !== fundingRow) return null; fundingRow = next; return next;
    }, close() { calls.closes++; },
  };
  const token = claim(storeId, p.orderId, p.paymentScope, null, 'worker.funding.1', backend).ownerTokenJson;
  const funding = createPurchasedOrderFundingOwner(...inputs(f), { receiptStore: receiptPort(token, backend),
    verifyFundingEvidence: value => { calls.funding++; return authentication(value); }, clock: () => at, maximumVerificationAttempts: 3 });
  funding.recover();
  function original(requestId = 'request.liability.1', grantId = 'grant.declared.synthetic.1', servicePath = '/service-credit/v1/execute') {
    const serviceResourceUrl = 'https://order-funding.invalid' + servicePath;
    const originalRequestJson = JSON.stringify({ modelVersion: 1, grantId, requestId, method: 'POST', routeId: 'service-credit.execute.v1',
      canonicalBodyDigest: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', selectedContentType: 'application/json', maxCostUnits: 1 });
    const custody = captureOriginalServiceRequestCustody({ originalRequestJson, originalBodyBase64: '', serviceResourceUrl },
      { fundingResourceUrl: f.verifierContext.resourceUrl, paymentHash: f.payload.payload.transaction.hash, network: f.terms.network });
    const c = capturePurchasedServiceOriginal(f.termsJson, serializeOriginalServiceRequestCustody(custody), f.paymentCheckpointJson, f.paymentPinsJson);
    return capturePurchaseStorageOriginal(c.recordJson, c.recordDigest, f.paymentPinsJson, f.termsDigest);
  }
  const originalStore = { readOriginal(orderId, requestId, termsDigest, digest, pins) {
    calls.originalReads++; const o = originals.get(requestId);
    return o && orderId === p.orderId && termsDigest === f.termsDigest && o.recordDigest === digest && pins === f.paymentPinsJson
      ? { recordJson: o.recordJson, recordDigest: o.recordDigest } : null;
  }, close() { calls.closes++; } };
  const verifier = {
    verifyDelivery: (candidate, context) => verify('delivery', candidate, context),
    verifyCompensation: (candidate, context) => verify('compensation', candidate, context),
  };
  function verify(kind, candidate, context) {
    calls[kind]++; assert.ok(Object.isFrozen(context)); const raw = proofs.get(kind + ':' + candidate);
    if (!raw) throw Error('synthetic witness rejected'); afterProof?.(); return raw;
  }
  function owner() {
    // Declared exclusive fenced synthetic session. This is not a native backend.
    const epoch = ++journalEpoch;
    const stateStore = { load(orderId, scope) {
      assert.equal(orderId, p.orderId); assert.equal(scope, p.paymentScope); if (epoch !== journalEpoch) throw Error('synthetic fenced'); return row;
    }, compareAndSwap(orderId, scope, expected, next) {
      assert.equal(orderId, p.orderId); assert.equal(scope, p.paymentScope);
      if (epoch !== journalEpoch || mode === 'conflict' || expected !== row) return null;
      row = next; calls.writes++; afterWrite?.(); if (mode === 'lostAck') throw Error('synthetic lost acknowledgement'); return mode === 'booleanAck' ? true : next;
    }, close() { calls.closes++; } };
    return create(...inputs(f), { fundingStoreId: storeId, fundingStore: backend, stateStore, originalStore, verifier, clock: () => at });
  }
  async function ready(funded = true) {
    const o = owner(); o.recover(); if (funded) { await funding.verifyFunding(proof()); o.recordVerifiedFunding(); } return o;
  }
  function begin(o, requestId = 'request.liability.1', deliveryId = 'delivery.1', quantity = 1, grantId, path) {
    const r = original(requestId, grantId, path); originals.set(requestId, r); return o.beginDelivery(r.recordJson, r.recordDigest, deliveryId, quantity);
  }
  function evidence(kind, value, candidate = 'selected.' + kind) { proofs.set(kind + ':' + candidate, JSON.stringify(value)); return candidate; }
  function delivery(o, deliveryId = 'delivery.1', status = 'DELIVERED', edit = () => {}, candidate) {
    const d = JSON.parse(o.exportRecord()).deliveries.find(d => d.deliveryId === deliveryId);
    const v = { version: 1, kind: 'EXACT_SERVICE_DELIVERY_V1', deliveryId, requestScope: d.requestScope, originalDigest: d.originalDigest,
      quantity: d.quantity, status, resultDigest: status === 'DELIVERED' ? H('d') : null, evidenceId: 'delivery.evidence.' + status };
    edit(v); return o.recordDelivery(deliveryId, evidence('delivery', v, candidate));
  }
  function compensation(o, edit = () => {}) {
    const owed = o.read().quantityOwed, v = { version: 1, kind: 'ZENON_COMPENSATION_ORIGINAL_V1', compensationId: 'compensation.original.1',
      termsDigest: f.termsDigest, paymentScope: p.paymentScope, network: f.terms.network, asset: f.terms.price.asset, payee: f.terms.holder,
      quantity: owed, amountAtomic: String((BigInt(f.terms.price.amount) * BigInt(owed) + BigInt(f.terms.quantity) - 1n) / BigInt(f.terms.quantity)),
      transactionHash: 'f'.repeat(64), originalBytesBase64: Buffer.from('declared synthetic compensation bytes; no signature').toString('base64') };
    edit(v); const originalJson = JSON.stringify(v); return { originalJson, originalDigest: compensationDigest(originalJson) };
  }
  function retain(o, c = compensation(o)) { o.retainCompensation(c.originalJson, c.originalDigest); return c; }
  function compResult(o, status = 'CONFIRMED', edit = () => {}) {
    const c = JSON.parse(o.exportRecord()).compensation, original = JSON.parse(c.originalJson);
    const v = { version: 1, kind: 'ZENON_EXACT_COMPENSATION_V1', compensationId: original.compensationId, originalDigest: c.originalDigest,
      transactionHash: original.transactionHash, paymentScope: p.paymentScope, status, evidenceId: 'compensation.evidence.' + status };
    edit(v); return o.recordCompensation(evidence('compensation', v));
  }
  return { f, p, storeId, backend, originalStore, verifier, owner, ready, funding, original, originals, begin, delivery, compensation, retain, compResult, evidence, calls,
    get row() { return row; }, set row(v) { row = v; }, get fundingRow() { return fundingRow; }, set fundingRow(v) { fundingRow = v; },
    set mode(v) { mode = v; }, set afterWrite(v) { afterWrite = v; }, set afterProof(v) { afterProof = v; }, set time(v) { at = v; },
    set authentication(v) { authentication = v; } };
}
check('recovery-is-explicit-before-any-liability-transition', async () => {
  const h = harness(), o = h.owner(); assert.throws(() => o.recordVerifiedFunding(), code('RECOVERY_REQUIRED')); assert.equal(h.calls.writes, 0);
  o.recover(); assert.throws(() => o.recover(), code('ALREADY_RECOVERED')); assert.equal(h.calls.writes, 1);
});
check('unverified-expired-order-cannot-become-a-delivery-or-compensation-claim', async () => {
  const h = harness(), o = await h.ready(false), s = o.read(); assert.equal(s.offerExpired, true); assert.equal(s.reservationExpired, true);
  assert.equal(s.quantityOwed, 0); assert.equal(s.liability, 'PAYMENT_NOT_VERIFIED'); assert.throws(() => h.begin(o), code('FUNDING_REQUIRED'));
  const c = h.compensation(o, v => { v.quantity = 10; v.amountAtomic = '100'; });
  assert.throws(() => o.retainCompensation(c.originalJson, c.originalDigest), code('FUNDING_REQUIRED'));
});
check('actual-verified-funding-receipt-creates-full-liability-without-a-grant', async () => {
  const h = harness(), o = await h.ready(), s = o.read(); assert.equal(s.quantityOwed, 10); assert.equal(s.grantFundingUnits, 27);
  assert.equal(s.grantSelectedForDelivery, false); assert.equal(h.calls.originalReads, 0); assert.equal(h.calls.funding, 1);
  assert.equal(s.paymentAtMs, null); assert.equal(s.paymentWasLate, null); assert.equal(s.verificationObservedAfterOfferExpiry, true);
  assert.equal(s.fundingObservationCurrent, false); assert.equal(s.authority, 'NONE'); assert.equal(s.mayStartPayment || s.maySignPayment || s.mayDispatchService, false);
});
check('grant-free-full-compensation-retains-one-original-and-never-sends-it', async () => {
  const h = harness(), o = await h.ready(), c = h.retain(o); assert.equal(h.calls.originalReads, 0);
  assert.equal(o.read().quantityOwed, 10); assert.equal(o.read().compensationStatus, 'RETAINED'); assert.equal(o.read().mayStartCompensation, false);
  assert.equal(JSON.parse(c.originalJson).amountAtomic, '100'); h.compResult(o); assert.equal(o.read().quantityOwed, 0); assert.equal(o.read().liability, 'SATISFIED');
});
check('pending-funding-receipt-is-never-treated-as-verified', async () => {
  const h = harness(), o = await h.ready(false); h.authentication = () => Promise.reject(Error('synthetic pending')); await h.funding.verifyFunding(proof());
  assert.throws(() => o.recordVerifiedFunding(), code('FUNDING_NOT_VERIFIED')); assert.equal(o.read().quantityOwed, 0);
});
check('funding-copy-replay-does-not-reauthenticate-or-write', async () => {
  const h = harness(), o = await h.ready(), before = { ...h.calls }, raw = h.row; o.recordVerifiedFunding(); o.recordVerifiedFunding();
  assert.equal(h.row, raw); assert.deepEqual(h.calls, before);
});
check('source-epoch-handoff-preserves-receipt-and-allows-readonly-liability-recovery', async () => {
  const h = harness(), a = await h.ready(), retained = h.row, receipt = envelope(h.fundingRow).receiptJson; a.close();
  claim(h.storeId, h.p.orderId, h.p.paymentScope, h.fundingRow, 'worker.funding.2', h.backend);
  assert.equal(envelope(h.fundingRow).receiptJson, receipt); const b = h.owner(); b.recover();
  assert.equal(h.row, retained); assert.equal(b.read().quantityOwed, 10); assert.equal(h.calls.funding, 1);
});
check('missing-funding-source-on-recovery-holds-the-existing-liability', async () => {
  const h = harness(), a = await h.ready(), before = h.row; a.close(); h.fundingRow = null; const b = h.owner();
  assert.throws(() => b.recover(), code('FUNDING_SOURCE_CONFLICT')); assert.equal(b.snapshot().held, true); assert.equal(h.row, before);
});
check('wrong-source-store-is-held-before-a-funding-copy', async () => {
  const h = harness(), o = await h.ready(false); await h.funding.verifyFunding(proof());
  const changed = JSON.parse(h.fundingRow); changed.storeId = 'foreign.store'; h.fundingRow = JSON.stringify(changed); const before = h.row;
  assert.throws(() => o.recordVerifiedFunding(), code('FUNDING_READ_UNKNOWN')); assert.equal(o.snapshot().held, true); assert.equal(h.row, before);
});
check('two-retained-original-requests-track-partial-service-quantity-on-one-payment', async () => {
  const h = harness(), o = await h.ready(); h.begin(o, 'request.1', 'delivery.1', 3); h.delivery(o); h.begin(o, 'request.2', 'delivery.2', 2); h.delivery(o, 'delivery.2');
  assert.equal(o.read().deliveredQuantity, 5); assert.equal(o.read().quantityOwed, 5); assert.equal(h.calls.funding, 1);
  assert.equal(new Set(JSON.parse(o.exportRecord()).deliveries.map(d => d.grantId)).size, 1);
});
check('unretained-service-original-cannot-become-a-delivery-reservation', async () => {
  const h = harness(), o = await h.ready(), r = h.original(), before = h.row;
  assert.throws(() => o.beginDelivery(r.recordJson, r.recordDigest, 'delivery.1', 1), code('ORIGINAL_NOT_RETAINED')); assert.equal(h.row, before);
});
check('another-grant-and-out-of-profile-resource-cannot-rebind-delivery', async () => {
  const h = harness(), o = await h.ready(); h.begin(o); const before = h.row;
  assert.throws(() => h.begin(o, 'request.other', 'delivery.2', 1, 'grant.foreign'), code('SERVICE_SELECTION_CONFLICT'));
  assert.throws(() => h.begin(o, 'request.path', 'delivery.3', 1, undefined, '/other')); assert.equal(h.row, before);
});
check('purchased-service-quantity-caps-reservations-independently-of-funding-units', async () => {
  const h = harness(), o = await h.ready(); h.begin(o, 'request.1', 'delivery.1', 10);
  assert.throws(() => h.begin(o, 'request.2', 'delivery.2', 1), code('QUANTITY_LIMIT')); assert.equal(o.read().uncertainDeliveryQuantity, 10);
});
check('unknown-delivery-blocks-compensation-without-erasing-owed-quantity', async () => {
  const h = harness(), o = await h.ready(); h.begin(o); h.delivery(o, 'delivery.1', 'UNKNOWN'); const c = h.compensation(o);
  assert.throws(() => o.retainCompensation(c.originalJson, c.originalDigest), code('COMPENSATION_CONFLICT'));
  assert.equal(o.read().quantityOwed, 10); assert.equal(o.read().requiresReconciliation, true);
});
check('not-performed-releases-quantity-but-keeps-the-original-request-tombstone', async () => {
  const h = harness(), o = await h.ready(); h.begin(o, 'request.1', 'delivery.1', 10); h.delivery(o, 'delivery.1', 'NOT_PERFORMED');
  const before = h.row; h.begin(o, 'request.1', 'delivery.1', 10); assert.equal(h.row, before);
  assert.throws(() => h.begin(o, 'request.1', 'delivery.new', 10), code('DELIVERY_CONFLICT'));
  h.begin(o, 'request.2', 'delivery.2', 10); h.delivery(o, 'delivery.2'); assert.equal(o.read().quantityOwed, 0);
});
check('terminal-delivery-proof-is-immutable-and-exact-replay-does-not-write', async () => {
  const h = harness(), o = await h.ready(); h.begin(o); h.delivery(o); const writes = h.calls.writes, before = h.row; h.delivery(o);
  assert.equal(h.row, before); assert.equal(h.calls.writes, writes);
  assert.throws(() => h.delivery(o, 'delivery.1', 'NOT_PERFORMED'), code('DELIVERY_CONFLICT'));
});
check('delivery-proof-for-another-original-or-quantity-is-rejected', async () => {
  const h = harness(), o = await h.ready(); h.begin(o); const before = h.row;
  for (const edit of [v => { v.quantity++; }, v => { v.originalDigest = H('a'); }, v => { v.requestScope = H('b'); }])
    assert.throws(() => h.delivery(o, 'delivery.1', 'DELIVERED', edit), code('PROOF_REJECTED'));
  assert.equal(h.row, before);
});
check('partial-compensation-rounds-up-with-exact-bigint-arithmetic', async () => {
  const h = harness({ quantity: 3, priceAmount: '100' }), o = await h.ready(); h.begin(o, 'request.1', 'delivery.1', 1); h.delivery(o);
  const c = h.retain(o); assert.equal(JSON.parse(c.originalJson).amountAtomic, '67'); h.compResult(o); assert.equal(o.read().quantityOwed, 0);
});
check('large-atomic-price-does-not-round-through-number', async () => {
  const price = String(MAX_ZENON_AMOUNT), h = harness({ quantity: 3, priceAmount: price }), o = await h.ready(); h.begin(o); h.delivery(o);
  const c = h.retain(o); assert.equal(JSON.parse(c.originalJson).amountAtomic, String((BigInt(price) * 2n + 2n) / 3n));
});
check('funding-amount-above-the-existing-2-to-255-limit-is-refused', async () => {
  assert.throws(() => harness({ priceAmount: String(MAX_ZENON_AMOUNT + 1n) }));
});
check('funding-amount-beyond-the-existing-77-digit-profile-is-refused', async () => {
  assert.throws(() => harness({ priceAmount: '1' + '0'.repeat(77) }));
});
check('foreign-compensation-binding-or-price-is-refused-before-retention', async () => {
  const h = harness(), o = await h.ready(), before = h.row;
  for (const edit of [v => { v.paymentScope = H('a'); }, v => { v.termsDigest = H('b'); }, v => { v.network = 'zenon:foreign'; },
    v => { v.asset = 'zts1foreign'; }, v => { v.payee = 'z1foreign'; }, v => { v.quantity--; }, v => { v.amountAtomic = '99'; }, v => { v.transactionHash = 'c'.repeat(64); }]) {
    const c = h.compensation(o, edit); assert.throws(() => o.retainCompensation(c.originalJson, c.originalDigest), code('COMPENSATION_CONFLICT'));
  }
  assert.equal(h.row, before);
});
check('retained-compensation-is-not-replaced-after-an-unknown-outcome', async () => {
  const h = harness(), o = await h.ready(), c = h.retain(o); h.compResult(o, 'UNKNOWN');
  assert.equal(o.read().quantityOwed, 10); assert.equal(o.read().compensatedQuantity, 0); assert.equal(o.read().requiresReconciliation, true);
  const changed = h.compensation(o, v => { v.compensationId = 'compensation.replacement'; v.transactionHash = 'a'.repeat(64); });
  assert.throws(() => o.retainCompensation(changed.originalJson, changed.originalDigest), code('COMPENSATION_CONFLICT'));
  o.retainCompensation(c.originalJson, c.originalDigest); assert.throws(() => h.begin(o), code('COMPENSATION_ALREADY_RETAINED'));
});
check('confirmed-compensation-replay-is-idempotent-and-proof-binding-is-exact', async () => {
  const h = harness(), o = await h.ready(); h.retain(o); h.compResult(o); const before = h.row, writes = h.calls.writes; h.compResult(o);
  assert.equal(h.row, before); assert.equal(h.calls.writes, writes);
  assert.throws(() => h.compResult(o, 'CONFIRMED', v => { v.transactionHash = 'b'.repeat(64); }), code('PROOF_REJECTED'));
  assert.throws(() => h.compResult(o, 'CONFIRMED', v => { v.evidenceId = 'changed.evidence'; }), code('COMPENSATION_CONFLICT'));
});
check('lost-funding-copy-acknowledgement-is-held-and-new-session-recovers-exact-record', async () => {
  const h = harness(), o = await h.ready(false); await h.funding.verifyFunding(proof()); h.mode = 'lostAck';
  assert.throws(() => o.recordVerifiedFunding(), code('COMMIT_UNKNOWN')); assert.equal(o.snapshot().held, true); const before = h.row;
  h.mode = 'normal'; const b = h.owner(); b.recover(); assert.equal(h.row, before); assert.equal(b.read().quantityOwed, 10); assert.equal(h.calls.funding, 1);
});
check('lost-delivery-acknowledgement-does-not-deliver-twice-on-recovery', async () => {
  const h = harness(), o = await h.ready(); h.begin(o); h.mode = 'lostAck'; assert.throws(() => h.delivery(o), code('COMMIT_UNKNOWN'));
  const before = h.row; h.mode = 'normal'; const b = h.owner(); b.recover(); assert.equal(b.read().deliveredQuantity, 1); h.delivery(b);
  assert.equal(h.row, before); assert.equal(h.calls.funding, 1);
});
check('lost-compensation-acknowledgement-preserves-confirmed-original-without-another-payout', async () => {
  const h = harness(), o = await h.ready(); const c = h.retain(o); h.mode = 'lostAck'; assert.throws(() => h.compResult(o), code('COMMIT_UNKNOWN'));
  const before = h.row; h.mode = 'normal'; const b = h.owner(); b.recover(); assert.equal(b.read().quantityOwed, 0);
  assert.equal(JSON.parse(b.exportRecord()).compensation.originalJson, c.originalJson); h.compResult(b); assert.equal(h.row, before);
});
check('boolean-cas-acknowledgement-never-certifies-an-accepted-commit', async () => {
  const h = harness(), o = await h.ready(); h.mode = 'booleanAck'; assert.throws(() => h.begin(o), code('COMMIT_UNKNOWN')); assert.equal(o.snapshot().held, true);
});
check('fenced-old-session-cannot-overwrite-a-new-session-delivery', async () => {
  const h = harness(), a = await h.ready(), b = h.owner(); b.recover(); h.begin(b); const before = h.row;
  assert.throws(() => h.begin(a, 'request.other', 'delivery.2', 1), code('COMMIT_UNKNOWN')); assert.equal(h.row, before); assert.equal(a.snapshot().held, true);
});
check('reentrant-close-after-cas-does-not-return-a-success-view', async () => {
  const h = harness(), o = await h.ready(); h.afterWrite = () => o.close(); assert.throws(() => h.begin(o), code('CLOSED'));
  assert.equal(o.snapshot().closed, true); assert.equal(o.snapshot().held, true); assert.equal(h.calls.closes, 0);
});
check('reentrant-close-after-proof-cannot-commit-delivery', async () => {
  const h = harness(), o = await h.ready(); h.begin(o); const before = h.row; h.afterProof = () => o.close();
  assert.throws(() => h.delivery(o), code('CLOSED')); assert.equal(h.row, before); assert.equal(h.calls.closes, 0);
});
check('missing-retained-original-on-recovery-holds-without-erasing-state', async () => {
  const h = harness(), a = await h.ready(); h.begin(a); const before = h.row; a.close(); h.originals.clear(); const b = h.owner();
  assert.throws(() => b.recover(), code('ORIGINAL_RECOVERY_UNKNOWN')); assert.equal(b.snapshot().held, true); assert.equal(h.row, before);
});
check('corrupt-state-is-not-repaired-or-canonicalized-during-recovery', async () => {
  const h = harness(), a = await h.ready(); a.close(); const v = JSON.parse(h.row); v.paymentRecordDigest = H('a'); h.row = JSON.stringify(v);
  const before = h.row, b = h.owner(); assert.throws(() => b.recover(), code('CORRUPT')); assert.equal(h.row, before); assert.equal(b.snapshot().held, true);
});
check('stable-read-and-export-reuse-validated-state-without-whole-history-reparse', async () => {
  const h = harness(), o = await h.ready(); h.begin(o); h.delivery(o); const before = o.snapshot().fullStateValidations, row = h.row;
  for (let i = 0; i < 50; i++) { assert.equal(o.read().quantityOwed, 9); assert.equal(o.exportRecord(), row); }
  assert.equal(o.snapshot().fullStateValidations, before); assert.equal(h.row, row);
});
check('public-views-omit-private-original-bytes-and-close-never-closes-borrowed-stores', async () => {
  const h = harness(), o = await h.ready(); h.begin(o); const view = JSON.stringify(o.read());
  assert.equal(/originalJson|paymentCheckpointJson|paymentPinsJson|proofJson|originalBytesBase64/.test(view), false);
  assert.ok(Object.isFrozen(o.read())); assert.equal(o.close(), undefined); assert.throws(() => o.read(), code('CLOSED'));
  assert.equal(h.calls.closes, 0); assert.equal(o.snapshot().physicalResourceRelease, 'NOT_QUALIFIED');
});

for (const { id, run } of checks) {
  try { await run(); cases.push({ id, status: 'PASS' }); }
  catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.code ?? e?.message ?? e) }); }
}
const failed = cases.filter(c => c.status !== 'PASS').length;
console.log(JSON.stringify({ qualification: 'PURCHASE_ORDER_GRANT_FREE_FULFILLMENT_DATA', passed: cases.length - failed, failed, cases,
  fundingAndOriginalCodecs: 'ACTUAL', selectedStoresAndAuthentication: 'SYNTHETIC_DATA', nativeExecutions: 0, SDK: 0, SQLite: 0,
  keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, grants: 0, serviceExecutions: 0, payouts: 0,
  nativeDurability: 'NOT_ESTABLISHED', production: 'NOT_ACCEPTED' }));
if (failed) process.exitCode = 1;
