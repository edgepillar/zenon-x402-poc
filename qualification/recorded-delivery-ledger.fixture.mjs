// Actual model, purchase codecs, funding/liability owners and new adapter.
// Selected proof, CAS and ownership ports are declared memory DATA only.
import assert from 'node:assert/strict';
import { InMemoryServiceCreditModel } from '../src/service-credit-model.js';
import { createPurchasedOrderRecordedDeliveryVerifier as verifier } from '../src/service-purchase-order-recorded-delivery.js';
import { capturePurchasedOrderPayment, createPurchasedOrderFundingOwner } from '../src/service-purchase-order-funding.js';
import { claimPurchasedOrderFundingOwnership, createPurchasedOrderFundingReceiptPort,
  requirePurchasedOrderFundingEnvelopeTransition } from '../src/service-purchase-order-funding-cas-contract.js';
import { createPurchasedOrderFulfillmentOwner } from '../src/service-purchase-order-fulfillment.js';
import { capturePurchasedServiceOriginal } from '../src/service-credit-purchased-original-recovery.js';
import { capturePurchaseStorageOriginal } from '../src/service-purchase-storage-contract.js';
import { captureOriginalServiceRequestCustody, serializeOriginalServiceRequestCustody } from '../src/service-credit-original-request-custody-contract.js';
import { recordedDeliveryFixture, orderFundingOwnerInputs as inputs, orderFundingProof, NOW } from './service-purchase-order-recorded-delivery.fixture.mjs';

const SERVICE = 'https://order-funding.invalid/service-credit/v1/execute';
function clone(value) { return JSON.parse(JSON.stringify(value)); }
export function recordedDeliveryLedgerFixture(options = {}) {
  const f = recordedDeliveryFixture(options), p = capturePurchasedOrderPayment(...inputs(f)), offer = f.context.offer, r = f.verifiedRecord;
  const calls = { clock: 0, pricing: 0, grant: 0, request: 0, funding: 0, debit: 0, execute: 0, journalWrites: 0, closes: 0 };
  let time = NOW, model = new InMemoryServiceCreditModel({ now() { calls.clock++; return time; }, deriveCost() { calls.pricing++; return 1; } });
  model.registerOffer(offer);
  const activation = { activationVersion: 2, authorityProfileId: r.authorityProfileId, authorityProfileVersion: r.authorityProfileVersion,
    verifierVersion: r.verifierVersion, authorityRecordDigest: r.authorityRecordDigest, fundingPolicyId: r.fundingPolicyId,
    fundingPolicyVersion: r.fundingPolicyVersion, sourceSettlementId: 'declared.recorded.delivery', transactionId: r.transactionId,
    providerId: offer.providerId, serviceId: offer.serviceId, resourceId: offer.resourceId, resourceBinding: offer.resourceBinding,
    offerId: offer.offerId, offerVersion: offer.offerVersion, holderId: f.terms.holder, capabilityCommitment: r.capabilityCommitment,
    totalUnits: r.totalUnits, expiresAt: r.expiresAt, scheme: 'exact', paymentFlow: 'upfront', network: r.network,
    chainProfile: r.chainProfile, asset: r.asset, amount: r.amount, payee: r.payee, payer: r.payer,
    paymentResourceDigest: r.paymentResourceDigest, paymentRequirementDigest: r.paymentRequirementDigest,
    paymentIntentDigest: r.paymentIntentDigest, grantFundingCommitment: r.grantFundingCommitment,
    evidenceState: 'MOMENTUM_INCLUDED', confirmationPolicy: r.confirmationPolicy, evidenceVersion: 1,
    inclusionAuthorizationDigest: 'sha256:' + 'b'.repeat(64) };
  const grant = model.activateGrantFromTrustedRecord(activation), originals = new Map();
  let grantHook = null, requestHook = null, journal = null, fundingRow = null, epoch = 0;
  const ledger = {
    readOriginalFundingGrant(identity) { calls.grant++; return grantHook ? grantHook(identity) : model.readOriginalFundingGrant(identity); },
    getRequest(key) { calls.request++; return requestHook ? requestHook(key) : model.getRequest(key); },
    close() { calls.closes++; },
  };
  const d = verifier(...inputs(f), { ledger, serviceResourceUrl: SERVICE, maximumAttempts: 256 });
  function original(requestId = 'request.recorded.1', serviceResourceUrl = SERVICE) {
    const request = { modelVersion: 1, grantId: grant.grantId, requestId, method: 'POST', routeId: 'service-credit.execute.v1',
      canonicalBodyDigest: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      selectedContentType: 'application/json', maxCostUnits: 1 };
    const custody = captureOriginalServiceRequestCustody({ originalRequestJson: JSON.stringify(request), originalBodyBase64: '', serviceResourceUrl },
      { fundingResourceUrl: f.verifierContext.resourceUrl, paymentHash: f.payload.payload.transaction.hash, network: f.terms.network });
    const c = capturePurchasedServiceOriginal(f.termsJson, serializeOriginalServiceRequestCustody(custody), f.paymentCheckpointJson, f.paymentPinsJson);
    const o = capturePurchaseStorageOriginal(c.recordJson, c.recordDigest, f.paymentPinsJson, f.termsDigest);
    originals.set(requestId, o); return { ...o, request };
  }
  function execute(o, state = 'SUCCEEDED', statusCode = 200) {
    model.reserveRequest(o.request); calls.debit++;
    const key = { grantId: o.grantId, requestId: o.requestId };
    if (state === 'FAILED_RELEASED') { model.releaseBeforeExecution(key); return; }
    if (state === 'RESERVED') return;
    model.beginExecution(key); calls.execute++;
    if (state === 'EXECUTING') return;
    if (state === 'OUTCOME_UNKNOWN') { model.markOutcomeUnknown(key); return; }
    model.completeExecution({ ...key, cachedResult: { statusCode, contentType: 'application/json', resultCode: 'recorded.success' } });
  }
  function context(o, deliveryId = 'delivery.recorded.1') {
    return { version: 1, orderId: p.orderId, termsJson: f.termsJson, termsDigest: f.termsDigest, paymentScope: p.paymentScope,
      paymentRecordDigest: p.paymentRecordDigest, originalJson: o.recordJson, originalDigest: o.recordDigest,
      requestScope: o.requestScope, requestId: o.requestId, grantId: o.grantId, serviceResourceUrl: o.serviceResourceUrl, deliveryId, quantity: 1 };
  }
  const originalStore = { readOriginal(orderId, requestId, termsDigest, digest, pins) {
    const o = originals.get(requestId);
    return o && orderId === p.orderId && termsDigest === f.termsDigest && digest === o.recordDigest && pins === f.paymentPinsJson
      ? { recordJson: o.recordJson, recordDigest: o.recordDigest } : null;
  } };
  const fundingStore = {
    readEnvelope(orderId, scope) { assert.equal(orderId, p.orderId); assert.equal(scope, p.paymentScope); return fundingRow; },
    compareAndSwapEnvelope(orderId, scope, expected, next) {
      assert.equal(orderId, p.orderId); assert.equal(scope, p.paymentScope); requirePurchasedOrderFundingEnvelopeTransition(expected, next);
      if (expected !== fundingRow) return null; fundingRow = next; return next;
    },
  };
  const token = claimPurchasedOrderFundingOwnership('store.recorded.funding', p.orderId, p.paymentScope, null, 'worker.recorded.funding', fundingStore).ownerTokenJson;
  const funding = createPurchasedOrderFundingOwner(...inputs(f), { receiptStore: createPurchasedOrderFundingReceiptPort(token, fundingStore),
    verifyFundingEvidence: () => { calls.funding++; return Promise.resolve(f.verifiedRecord); }, clock: () => NOW, maximumVerificationAttempts: 1 });
  funding.recover();
  function owner(adapter = d) {
    const ownEpoch = ++epoch;
    return createPurchasedOrderFulfillmentOwner(...inputs(f), { fundingStoreId: 'store.recorded.funding', fundingStore, originalStore,
      stateStore: { load() { assert.equal(ownEpoch, epoch); return journal; }, compareAndSwap(orderId, scope, expected, next) {
        assert.equal(ownEpoch, epoch); if (expected !== journal) return null; journal = next; calls.journalWrites++; return next;
      } }, verifier: { verifyDelivery: adapter.verifyDelivery, verifyCompensation() { throw Error('no compensation verifier selected'); } }, clock: () => NOW });
  }
  async function ready() { const o = owner(); o.recover(); await funding.verifyFunding(orderFundingProof()); o.recordVerifiedFunding(); return o; }
  return { f, p, grant, d, ledger, calls, original, execute, context, owner, ready, funding, fundingStore, originalStore,
    get model() { return model; }, set time(value) { time = value; }, get journal() { return journal; },
    set grantHook(fn) { grantHook = fn; }, set requestHook(fn) { requestHook = fn; },
    reopen() { model = InMemoryServiceCreditModel.fromState({ now() { throw Error('no time read'); }, deriveCost() { throw Error('no pricing'); } }, clone(model.exportState()));
      return verifier(...inputs(f), { ledger, serviceResourceUrl: SERVICE, maximumAttempts: 256 }); },
  };
}
