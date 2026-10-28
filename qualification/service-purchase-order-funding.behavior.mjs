import assert from 'node:assert/strict';
import { canonicalJson, paymentIntentDigest } from '../src/canonical.js';
import { captureOriginalPaymentCheckpoint, encodeOriginalPaymentCheckpoint } from '../src/service-credit-pilot-original-payment-checkpoint.js';
import { deriveServiceCreditResourceBinding } from '../src/service-credit-activation.js';
import { purchasedTermsStorageDigest } from '../src/service-purchase-storage-contract.js';
import { purchasedFulfillmentPolicyDigest } from '../src/service-purchase-fulfillment.js';
import { encodeB64Json } from '../src/x402-wire.js';
import {
  captureVerifiedZenonIssuedFunding, deriveZenonFundingObserverTarget,
  prepareZenonFundingResource, verifyZenonIssuedFundingWithoutActivation,
} from '../src/service-credit-zenon-funding-evidence.js';
import { capturePurchasedOrderPayment, createPurchasedOrderFundingOwner } from '../src/service-purchase-order-funding.js';

const NOW = 2_000_000_000_000, EXPIRES = NOW + 10000;
const clone = x => JSON.parse(JSON.stringify(x));
const hash = letter => 'sha256:' + letter.repeat(64);
const proof = (id = 'proof.one') => JSON.stringify({ evidenceVersion: 1, artifact: { format: 'synthetic-selected-verifier', id } });
function fixture(orderId = 'order.funding.1') {
  const resourceUrl = 'https://order-funding.invalid/funding';
  const authorityProfile = { profileId: 'authority.synthetic', profileVersion: 1, verifierVersion: 1, recordDigest: hash('d'),
    network: 'zenon:testnet', chainProfile: { version: 1, chainIdentifier: '12345', genesisMomentumHash: '1'.repeat(64) },
    confirmationPolicy: { policyId: 'zenon.authenticated-momentum-inclusion', policyVersion: 1, minimumConfirmations: 2 } };
  const offer = { modelVersion: 1, providerId: 'provider.synthetic', serviceId: 'metered-api.v1', resourceId: 'resource.funding',
    resourceBinding: deriveServiceCreditResourceBinding({ resourceId: 'resource.funding', resourceUrl }),
    offerId: 'offer.synthetic', offerVersion: 1, costPolicyId: 'cost.fixed', fundingPolicyId: 'funding.exact', fundingPolicyVersion: 1 };
  const selection = { offerId: offer.offerId, offerVersion: 1, holderId: 'z1syntheticpayer', capabilityCommitment: hash('a') };
  const issued = prepareZenonFundingResource({ offer, selection, resourceUrl, authorityProfile, now: () => NOW,
    deriveFundingTerms: () => ({ fundingPolicyId: offer.fundingPolicyId, fundingPolicyVersion: 1, totalUnits: 27, expiresAt: EXPIRES,
      requirement: { scheme: 'exact', network: 'zenon:testnet', asset: 'zts1syntheticasset', amount: '100', payTo: 'z1syntheticpayee',
        maxTimeoutSeconds: 30, extra: { paymentFlow: 'upfront', poc: true, settlement: 'account-block',
          zenonChain: clone(authorityProfile.chainProfile), minimumMomentumConfirmations: 2 } } }) });
  const required = issued.challenge.paymentRequired;
  const payload = { x402Version: 2, resource: clone(required.resource), accepted: clone(required.accepts[0]),
    payload: { transaction: { hash: 'c'.repeat(64), address: selection.holderId }, intentDigest: paymentIntentDigest(required, required.accepts[0]) } };
  const policyJson = JSON.stringify({ version: 1, quantityUnit: 'api-call', offerExpiresAtMs: EXPIRES,
    reservationExpiresAtMs: EXPIRES + 10000, maximumDeliveries: 16, compensationRule: 'PRO_RATA_CEILING_ATOMIC_V1' });
  const terms = { termsVersion: 1, orderId, productId: offer.serviceId, beneficiary: 'beneficiary.synthetic', holder: selection.holderId,
    price: { asset: payload.accepted.asset, unit: 'zenon-atomic', amount: '100' }, quantity: 10,
    network: 'zenon:testnet', conditionsDigest: purchasedFulfillmentPolicyDigest(policyJson) };
  const termsJson = JSON.stringify(terms), termsDigest = purchasedTermsStorageDigest(termsJson);
  const captured = captureOriginalPaymentCheckpoint({ binding: { requestId: 'funding.original', paymentHash: payload.payload.transaction.hash,
    origin: new URL(resourceUrl).origin, contextId: 'context.original' }, originalBytes: { requestBody: '', paymentPayload: encodeB64Json(payload),
    paymentRequirements: encodeB64Json(required), context: Buffer.from('{}').toString('base64') } });
  const paymentCheckpointJson = encodeOriginalPaymentCheckpoint(captured.checkpoint), paymentPinsJson = JSON.stringify(captured.pins);
  const context = { version: 1, orderId, acceptedTermsDigest: termsDigest, policyJson,
    offer: issued.offer, challenge: issued.challenge, authorityProfile };
  const fundingContextJson = JSON.stringify(context), verifierContext = { offer: issued.offer, challenge: issued.challenge, authorityProfile,
    transactionHash: payload.payload.transaction.hash, payer: terms.holder, resourceUrl };
  const target = deriveZenonFundingObserverTarget(verifierContext);
  const verifiedRecord = { evidenceVersion: 1, evidenceType: 'zenon-authenticated-funding-evidence',
    authorityProfileId: authorityProfile.profileId, authorityProfileVersion: 1, verifierVersion: 1,
    authorityRecordDigest: authorityProfile.recordDigest, network: target.network, chainProfile: clone(authorityProfile.chainProfile),
    transactionId: target.transactionId, payer: target.payer, payee: target.payee, asset: target.asset, amount: target.amount,
    paymentResourceDigest: target.paymentResourceDigest, paymentRequirementDigest: target.paymentRequirementDigest,
    paymentIntentDigest: target.paymentIntentDigest, resourceBinding: target.resourceBinding,
    offerId: target.offerId, offerVersion: target.offerVersion, fundingPolicyId: target.fundingPolicyId,
    fundingPolicyVersion: target.fundingPolicyVersion, capabilityCommitment: target.capabilityCommitment,
    totalUnits: target.totalUnits, expiresAt: target.expiresAt, grantFundingCommitment: target.grantFundingCommitment,
    inclusionEvidence: { state: 'MOMENTUM_INCLUDED', transactionHash: payload.payload.transaction.hash,
      momentumHeight: 100, momentumHash: 'e'.repeat(64), observedConfirmations: 2 }, confirmationPolicy: clone(authorityProfile.confirmationPolicy) };
  return { terms, termsJson, termsDigest, paymentCheckpointJson, paymentPinsJson, fundingContextJson,
    verifierContext, verifiedRecord, payload, required, context };
}
function inputs(f) { return [f.termsJson, f.termsDigest, f.paymentCheckpointJson, f.paymentPinsJson, f.fundingContextJson]; }
function statePort() {
  const rows = new Map(), paymentOrders = new Map();
  const state = { rows, paymentOrders, writes: 0, reads: 0, onLoad: null, onCAS: null };
  state.port = {
    load(orderId, scope) {
      state.reads++; if (state.onLoad) state.onLoad();
      if (paymentOrders.has(scope) && paymentOrders.get(scope) !== orderId) throw Error('synthetic-unique-payment-conflict');
      return rows.get(orderId) ?? null;
    },
    compareAndSwap(orderId, scope, before, after) {
      if ((paymentOrders.has(scope) && paymentOrders.get(scope) !== orderId) || (rows.get(orderId) ?? null) !== before) return null;
      rows.set(orderId, after); paymentOrders.set(scope, orderId); state.writes++;
      return state.onCAS ? state.onCAS(after) : after;
    },
  };
  return state;
}
function owner(f = fixture(), options = {}) {
  const store = options.store ?? statePort();
  const control = { calls: 0, now: NOW, fixedVerifier: options.verify ?? (() => Promise.resolve(clone(f.verifiedRecord))) };
  const o = createPurchasedOrderFundingOwner(...inputs(f), { receiptStore: store.port,
    verifyFundingEvidence: value => { control.calls++; return control.fixedVerifier(value); },
    clock: options.clock ?? (() => control.now), maximumVerificationAttempts: options.maximum ?? 3 });
  return { f, store, control, o };
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function changedCheckpoint(f, change) {
  const old = JSON.parse(f.paymentCheckpointJson); change(old);
  const c = captureOriginalPaymentCheckpoint({ binding: old.binding, originalBytes: old.originalBytes });
  return { ...f, paymentCheckpointJson: encodeOriginalPaymentCheckpoint(c.checkpoint), paymentPinsJson: JSON.stringify(c.pins) };
}
const checks = [];
function check(id, run) { checks.push({ id, run }); }

check('grant-free-original-retained-before-first-verifier-call', async () => {
  const t = owner(); assert.equal(t.control.calls, 0);
  assert.equal(t.o.recover().phase, 'RETAINED'); assert.equal(t.store.writes, 1);
  t.control.fixedVerifier = input => {
    const saved = JSON.parse(t.store.rows.get(t.f.terms.orderId));
    assert.equal(saved.phase, 'VERIFYING'); assert.equal(saved.paymentRecordJson, capturePurchasedOrderPayment(...inputs(t.f)).paymentRecordJson);
    assert.equal(Object.isFrozen(input.artifact), true); return Promise.resolve(t.f.verifiedRecord);
  };
  const result = await t.o.verifyFunding(proof()); assert.equal(result.grantCreated, false); assert.equal(result.quantityOwed, 10);
});
check('purchase-quantity-and-grant-units-are-distinct', async () => {
  const { o } = owner(); o.recover(); const v = await o.verifyFunding(proof());
  assert.equal(v.purchasedQuantity, 10); assert.equal(v.grantFundingUnits, 27); assert.equal(v.quantityUnit, 'api-call');
  assert.equal(v.deliveryStatus, 'NOT_ESTABLISHED'); assert.equal(v.authority, 'NONE');
});
check('expired-offer-keeps-full-liability-with-unknown-payment-time', async () => {
  const { o, control } = owner(); control.now = EXPIRES + 20001; o.recover();
  const v = await o.verifyFunding(proof()); assert.equal(v.offerExpired, true); assert.equal(v.reservationExpired, true);
  assert.equal(v.verificationObservedAfterOfferExpiry, true); assert.equal(v.quantityOwed, 10);
  assert.equal(v.paymentAtMs, null); assert.equal(v.paymentWasLate, null); assert.equal(v.liability, 'DELIVERY_OR_COMPENSATION_OWED');
});
check('verified-repeat-is-idempotent-and-recovery-does-not-call-verifier', async () => {
  const t = owner(); t.o.recover(); const first = await t.o.verifyFunding(proof());
  const raw = t.o.exportReceipt(), writes = t.store.writes;
  assert.deepEqual(await t.o.verifyFunding(proof()), first); assert.equal(t.control.calls, 1); assert.equal(t.store.writes, writes);
  const next = owner(t.f, { store: t.store, verify: () => { assert.fail('no verifier during recovery'); } });
  assert.equal(next.o.recover().quantityOwed, 10); assert.equal(next.o.exportReceipt(), raw); assert.equal(next.control.calls, 0);
  await assert.rejects(next.o.verifyFunding(proof('other')), /CANDIDATE_CONFLICT/);
});
check('known-rejection-allows-explicit-new-proof-of-same-payment', async () => {
  const t = owner(undefined, { verify: () => Promise.reject(Error('synthetic unavailable evidence')) }); t.o.recover();
  assert.equal((await t.o.verifyFunding(proof())).phase, 'REJECTED'); assert.equal(t.o.inspect().liability, 'PAYMENT_NOT_VERIFIED');
  const original = JSON.parse(t.o.exportReceipt()).paymentRecordJson;
  t.control.fixedVerifier = () => Promise.resolve(t.f.verifiedRecord);
  assert.equal((await t.o.verifyFunding(proof('proof.two'))).quantityOwed, 10);
  assert.equal(JSON.parse(t.o.exportReceipt()).paymentRecordJson, original); assert.equal(t.control.calls, 2);
});
check('verification-attempt-limit-survives-owner-recovery', async () => {
  const t = owner(undefined, { maximum: 1, verify: () => Promise.reject(Error('no proof')) }); t.o.recover(); await t.o.verifyFunding(proof());
  const next = owner(t.f, { store: t.store, maximum: 1 }); next.o.recover();
  await assert.rejects(next.o.verifyFunding(proof('proof.two')), /ATTEMPTS_EXHAUSTED/); assert.equal(next.control.calls, 0);
  assert.throws(() => owner(t.f, { store: t.store, maximum: 2 }).o.recover(), /CORRUPT/);
});
check('initial-commit-ack-loss-holds-before-any-verification', async () => {
  const store = statePort(); store.onCAS = () => { throw Error('synthetic lost ack'); }; const t = owner(undefined, { store });
  assert.throws(() => t.o.recover(), /COMMIT_UNKNOWN/); assert.equal(t.control.calls, 0); assert.throws(() => t.o.inspect(), /HELD/);
  store.onCAS = null; const next = owner(t.f, { store }); assert.equal(next.o.recover().phase, 'RETAINED'); assert.equal(store.writes, 1);
});
check('pending-commit-ack-loss-retains-proof-without-calling-verifier', async () => {
  const t = owner(); t.o.recover(); t.store.onCAS = () => { throw Error('ack lost'); };
  await assert.rejects(t.o.verifyFunding(proof()), /COMMIT_UNKNOWN/); assert.equal(t.control.calls, 0);
  const retained = JSON.parse(t.store.rows.get(t.f.terms.orderId)); assert.equal(retained.phase, 'VERIFYING'); assert.equal(retained.attempts, 1);
  t.store.onCAS = null; const next = owner(t.f, { store: t.store }); next.o.recover();
  await assert.rejects(next.o.verifyFunding(proof('changed')), /CANDIDATE_CONFLICT/); assert.equal(next.control.calls, 0);
  assert.equal((await next.o.verifyFunding(proof())).verificationAttempts, 2);
});
check('verified-commit-ack-loss-recovers-exact-receipt-without-reverification', async () => {
  const t = owner(); t.o.recover();
  t.store.onCAS = raw => { if (JSON.parse(raw).phase === 'VERIFIED') throw Error('ack lost'); return raw; };
  await assert.rejects(t.o.verifyFunding(proof()), /COMMIT_UNKNOWN/); assert.equal(t.control.calls, 1);
  t.store.onCAS = null; const raw = t.store.rows.get(t.f.terms.orderId), next = owner(t.f, { store: t.store });
  assert.equal(next.o.recover().quantityOwed, 10); assert.equal(next.o.exportReceipt(), raw); assert.equal(next.control.calls, 0);
});
check('malformed-ack-does-not-become-clean-positive', async () => {
  const t = owner(); t.o.recover(); t.store.onCAS = () => ({ success: true });
  await assert.rejects(t.o.verifyFunding(proof()), /COMMIT_UNKNOWN/); assert.equal(t.control.calls, 0);
});
check('duplicate-payment-cannot-fund-second-order-on-selected-unique-store', async () => {
  const t = owner(); t.o.recover(); await t.o.verifyFunding(proof());
  const second = owner(fixture('order.funding.2'), { store: t.store });
  assert.throws(() => second.o.recover(), /READ_UNKNOWN/); assert.equal(second.control.calls, 0); assert.equal(t.store.rows.size, 1);
});
check('stale-owner-cas-refusal-prevents-second-verifier-call', async () => {
  const t = owner(); t.o.recover(); const stale = owner(t.f, { store: t.store }); stale.o.recover();
  await t.o.verifyFunding(proof()); await assert.rejects(stale.o.verifyFunding(proof()), /CONFLICT/); assert.equal(stale.control.calls, 0);
});
check('busy-owner-does-not-start-concurrent-verification-or-read', async () => {
  const gate = deferred(), t = owner(undefined, { verify: () => gate.promise }); t.o.recover(); const pending = t.o.verifyFunding(proof());
  await assert.rejects(t.o.verifyFunding(proof()), /BUSY/); assert.throws(() => t.o.inspect(), /BUSY/); assert.equal(t.control.calls, 1);
  gate.resolve(t.f.verifiedRecord); await pending;
});
check('close-drains-late-success-without-clearing-verifying', async () => {
  const gate = deferred(), t = owner(undefined, { verify: () => gate.promise }); t.o.recover(); const pending = t.o.verifyFunding(proof());
  let drained = false; const close = t.o.close(); assert.equal(t.o.close(), close); close.then(() => { drained = true; });
  await Promise.resolve(); assert.equal(drained, false); gate.resolve(t.f.verifiedRecord);
  await assert.rejects(pending, /CLOSED/); await close; assert.equal(drained, true);
  assert.equal(JSON.parse(t.store.rows.get(t.f.terms.orderId)).phase, 'VERIFYING'); assert.throws(() => t.o.recover(), /CLOSED/);
});
check('close-drains-late-error-without-clearing-unknown-proof', async () => {
  const gate = deferred(), t = owner(undefined, { verify: () => gate.promise }); t.o.recover(); const pending = t.o.verifyFunding(proof());
  const close = t.o.close(); gate.reject(Error('synthetic private diagnostic'));
  await assert.rejects(pending, /CLOSED/); await close; assert.equal(JSON.parse(t.store.rows.get(t.f.terms.orderId)).phase, 'VERIFYING');
});
check('close-reentered-by-initial-cas-preserves-original-but-refuses-success', async () => {
  const t = owner(); t.store.onCAS = value => { t.o.close(); return value; };
  assert.throws(() => t.o.recover(), /CLOSED/); assert.equal(t.control.calls, 0);
  assert.equal(JSON.parse(t.store.rows.get(t.f.terms.orderId)).phase, 'RETAINED'); await t.o.close();
});
check('clock-failure-after-verification-holds-with-original-pending', async () => {
  let broken = false; const t = owner(undefined, { clock: () => { if (broken) throw Error('private clock'); return NOW; } }); t.o.recover();
  t.control.fixedVerifier = () => { broken = true; return Promise.resolve(t.f.verifiedRecord); };
  await assert.rejects(t.o.verifyFunding(proof()), /CLOCK_UNKNOWN/); assert.equal(JSON.parse(t.store.rows.get(t.f.terms.orderId)).phase, 'VERIFYING');
  assert.throws(() => t.o.inspect(), /HELD/);
});
check('corrupt-persisted-authority-record-is-held-before-verifier-call', async () => {
  const t = owner(); t.o.recover(); await t.o.verifyFunding(proof()); const row = JSON.parse(t.o.exportReceipt());
  const verified = JSON.parse(row.verifiedRecordJson); verified.amount = '101'; row.verifiedRecordJson = JSON.stringify(verified);
  t.store.rows.set(t.f.terms.orderId, JSON.stringify(row)); const next = owner(t.f, { store: t.store });
  assert.throws(() => next.o.recover(), /CORRUPT/); assert.equal(next.control.calls, 0);
});
check('independent-terms-and-checkpoint-pins-required', () => {
  const f = fixture(), pins = JSON.parse(f.paymentPinsJson); pins.digests.paymentPayload = 'f'.repeat(64);
  assert.throws(() => capturePurchasedOrderPayment(...inputs({ ...f, paymentPinsJson: JSON.stringify(pins) })));
  assert.throws(() => capturePurchasedOrderPayment(...inputs({ ...f, termsDigest: hash('f') })));
});
check('rebound-payload-amount-and-intent-still-cannot-change-purchased-price', () => {
  const f = fixture(), payload = clone(f.payload); payload.accepted.amount = '101';
  payload.payload.intentDigest = paymentIntentDigest(f.required, payload.accepted);
  const changed = changedCheckpoint(f, c => { c.originalBytes.paymentPayload = encodeB64Json(payload); });
  assert.throws(() => capturePurchasedOrderPayment(...inputs(changed)), /PAYMENT_CONFLICT/);
});
check('different-network-payer-hash-origin-and-funding-body-rejected', () => {
  const f = fixture();
  for (const edit of [
    c => { c.binding.origin = 'https://foreign.invalid'; },
    c => { c.binding.paymentHash = 'f'.repeat(64); },
    c => { c.originalBytes.requestBody = Buffer.from('{}').toString('base64'); },
    c => { const p = clone(f.payload); p.payload.transaction.address = 'z1foreignpayer'; c.originalBytes.paymentPayload = encodeB64Json(p); },
    c => { const p = clone(f.payload); p.accepted.network = 'zenon:mock'; c.originalBytes.paymentPayload = encodeB64Json(p); },
  ]) assert.throws(() => capturePurchasedOrderPayment(...inputs(changedCheckpoint(f, edit))));
});
check('changed-product-policy-or-issued-resource-rejected', () => {
  const f = fixture();
  for (const edit of [
    c => { c.offer.serviceId = 'different-product'; },
    c => { c.acceptedTermsDigest = hash('f'); },
    c => { c.policyJson = c.policyJson.replace('api-call', 'other-unit'); },
    c => { c.challenge.paymentRequired.resource.url = 'https://foreign.invalid/funding'; },
  ]) { const c = clone(f.context); edit(c); assert.throws(() => capturePurchasedOrderPayment(...inputs({ ...f, fundingContextJson: JSON.stringify(c) }))); }
});
check('read-only-verifier-captures-context-before-await', async () => {
  const f = fixture(), context = clone(f.verifierContext), gate = deferred(); let calls = 0;
  const pending = verifyZenonIssuedFundingWithoutActivation({ ...context, fundingEvidence: JSON.parse(proof()),
    verifyFundingEvidence: () => { calls++; return gate.promise; } });
  context.authorityProfile.profileId = 'changed.during.await'; context.offer.serviceId = 'changed.service';
  gate.resolve(f.verifiedRecord); assert.equal((await pending).verifiedRecord.transactionId, f.verifiedRecord.transactionId); assert.equal(calls, 1);
});
check('read-only-verifier-never-invokes-custom-thenable-getter', async () => {
  const f = fixture(); let reads = 0;
  const thenable = Object.defineProperty({}, 'then', { get() { reads++; assert.fail('custom thenable invoked'); } });
  await assert.rejects(verifyZenonIssuedFundingWithoutActivation({ ...f.verifierContext, fundingEvidence: JSON.parse(proof()),
    verifyFundingEvidence: () => thenable })); assert.equal(reads, 0);
});
check('success-and-cached-success-flags-are-not-funding-evidence', async () => {
  for (const value of [{ success: true }, { status: 'CACHED_SUCCESS' }, { status: 'BOUND' }]) {
    const t = owner(undefined, { verify: () => Promise.resolve(value) }); t.o.recover();
    const result = await t.o.verifyFunding(proof()); assert.equal(result.phase, 'REJECTED'); assert.equal(result.quantityOwed, 0);
  }
});
check('full-authenticated-record-binding-matrix-rejected', () => {
  const f = fixture(), edits = [
    v => { v.authorityProfileId = 'other.authority'; }, v => { v.authorityProfileVersion++; }, v => { v.verifierVersion++; },
    v => { v.authorityRecordDigest = hash('f'); }, v => { v.chainProfile.chainIdentifier = '12346'; },
    v => { v.chainProfile.genesisMomentumHash = 'f'.repeat(64); }, v => { v.network = 'zenon:mock'; },
    v => { v.payer = 'z1otherpayer'; }, v => { v.payee = 'z1otherpayee'; }, v => { v.asset = 'zts1otherasset'; }, v => { v.amount = '101'; },
    v => { v.paymentResourceDigest = hash('f'); }, v => { v.paymentRequirementDigest = hash('f'); }, v => { v.paymentIntentDigest = hash('f'); },
    v => { v.resourceBinding = hash('f'); }, v => { v.offerId = 'other.offer'; }, v => { v.offerVersion++; },
    v => { v.fundingPolicyId = 'other.policy'; }, v => { v.fundingPolicyVersion++; }, v => { v.capabilityCommitment = hash('f'); },
    v => { v.totalUnits++; }, v => { v.expiresAt++; }, v => { v.grantFundingCommitment = hash('f'); },
    v => { v.confirmationPolicy.minimumConfirmations = 3; v.inclusionEvidence.observedConfirmations = 3; },
    v => { v.inclusionEvidence.observedConfirmations = 1; }, v => { v.inclusionEvidence.momentumHash = v.inclusionEvidence.transactionHash; },
    v => { v.transactionId = 'zenontx:' + 'f'.repeat(64); v.inclusionEvidence.transactionHash = 'f'.repeat(64); },
  ];
  for (const edit of edits) { const value = clone(f.verifiedRecord); edit(value);
    assert.throws(() => captureVerifiedZenonIssuedFunding({ ...f.verifierContext, verifiedRecord: value })); }
});
check('binding-capture-is-not-authentication-and-creates-no-grant', () => {
  const f = fixture(), result = captureVerifiedZenonIssuedFunding({ ...f.verifierContext, verifiedRecord: f.verifiedRecord });
  assert.equal(Object.isFrozen(result.verifiedRecord.inclusionEvidence), true); assert.equal(result.target.totalUnits, 27);
  assert.deepEqual(Object.keys(result), ['verifiedRecord', 'target', 'sourceSettlementId']);
  assert.match(result.sourceSettlementId, /^settlement_[0-9a-f]{64}$/);
});
check('candidate-byte-aliases-and-extra-outcome-fields-rejected-before-verifier', async () => {
  const t = owner(); t.o.recover();
  for (const raw of [' ' + proof(), JSON.stringify({ evidenceVersion: 1, artifact: {}, success: true }),
    JSON.stringify({ artifact: {}, evidenceVersion: 1 }), JSON.stringify({ evidenceVersion: 1, artifact: [] })]) {
    await assert.rejects(t.o.verifyFunding(raw));
  }
  assert.equal(t.control.calls, 0); assert.equal(t.o.inspect().verificationAttempts, 0);
});
check('unrecovered-owner-cannot-authenticate-or-export-original', async () => {
  const { o, control, store } = owner(); await assert.rejects(o.verifyFunding(proof()), /RECOVERY_REQUIRED/);
  assert.throws(() => o.exportReceipt(), /RECOVERY_REQUIRED/); assert.equal(control.calls, 0); assert.equal(store.writes, 0);
});
check('retained-payment-and-receipt-do-not-leak-through-ordinary-view', async () => {
  const { o } = owner(); o.recover(); await o.verifyFunding(proof()); const view = JSON.stringify(o.inspect());
  for (const token of ['paymentCheckpointJson', 'originalBytes', 'artifact', 'verifiedRecordJson', 'capabilityCommitment']) assert.equal(view.includes(token), false);
  assert.equal(canonicalJson(JSON.parse(o.exportReceipt())).includes('paymentCheckpointJson'), true);
});

const results = [];
for (const { id, run } of checks) {
  try { await run(); results.push({ id, status: 'PASS' }); }
  catch (error) { results.push({ id, status: 'FAIL', error: String(error?.message ?? 'unknown') }); }
}
const failed = results.filter(r => r.status !== 'PASS').length;
process.stdout.write(JSON.stringify({ qualification: 'PURCHASE_ORDER_FUNDING_DATA_COMPOSITION', passed: results.length - failed, failed, cases: results,
  realCheckpointAndIssuanceCodecs: true, selectedAuthenticator: 'SYNTHETIC', receiptStore: 'SYNTHETIC_ATOMIC_UNIQUE_PAYMENT_CAS',
  freshProcessOrNativeDurability: false, paymentTimestamp: 'UNKNOWN', nativeExecutions: 0, SDK: 0, SQLite: 0,
  keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, grants: 0, serviceExecutions: 0, payouts: 0 }) + '\n');
if (failed) process.exitCode = 1;
