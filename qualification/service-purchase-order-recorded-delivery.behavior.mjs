// Actual model, purchase codecs, funding/liability owners and new adapter.
// Selected proof, CAS and ownership ports are declared memory DATA only.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
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

const checks = [], code = name => e => e?.code === 'ORDER_RECORDED_DELIVERY_' + name;
const SERVICE = 'https://order-funding.invalid/service-credit/v1/execute';
function check(id, run) { checks.push({ id, run }); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function deep(value) { if (value !== null && typeof value === 'object') { for (const v of Object.values(value)) deep(v); Object.freeze(value); } return value; }
function fixture(options = {}) {
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
  return { f, p, grant, d, ledger, calls, original, execute, context, owner, ready,
    get model() { return model; }, set time(value) { time = value; }, get journal() { return journal; },
    set grantHook(fn) { grantHook = fn; }, set requestHook(fn) { requestHook = fn; },
    reopen() { model = InMemoryServiceCreditModel.fromState({ now() { throw Error('no time read'); }, deriveCost() { throw Error('no pricing'); } }, clone(model.exportState()));
      return verifier(...inputs(f), { ledger, serviceResourceUrl: SERVICE, maximumAttempts: 256 }); },
  };
}
function record(h, o = h.original()) { h.execute(o); const before = JSON.stringify(h.model.exportState()); const result = h.d.verifyDelivery(o.recordDigest, h.context(o)); assert.equal(JSON.stringify(h.model.exportState()), before); return { o, result: JSON.parse(result) }; }

check('recorded-delivery-actual-ledger-success-produces-only-one-delivery-receipt', () => {
  const h = fixture(), { o, result } = record(h);
  assert.equal(result.status, 'DELIVERED'); assert.equal(result.quantity, 1); assert.equal(result.originalDigest, o.recordDigest);
  assert.equal(h.calls.debit, 1); assert.equal(h.calls.execute, 1); assert.equal(h.calls.grant, 1); assert.equal(h.calls.request, 1);
});
check('recorded-delivery-receipt-connects-to-actual-funding-and-liability-owners', async () => {
  const h = fixture(), owner = await h.ready(), o = h.original(); h.execute(o);
  owner.beginDelivery(o.recordJson, o.recordDigest, 'delivery.recorded.1', 1);
  const before = JSON.stringify(h.model.exportState()), view = owner.recordDelivery('delivery.recorded.1', o.recordDigest);
  assert.equal(view.deliveredQuantity, 1); assert.equal(view.quantityOwed, 99); assert.equal(h.calls.funding, 1);
  assert.equal(JSON.stringify(h.model.exportState()), before); assert.equal(h.calls.debit, 1); assert.equal(h.calls.execute, 1);
});
check('recorded-delivery-one-funding-one-grant-one-hundred-distinct-results', async () => {
  const h = fixture(), owner = await h.ready();
  for (let i = 0; i < 100; i++) { const o = h.original('request.recorded.' + i), id = 'delivery.' + i; h.execute(o);
    owner.beginDelivery(o.recordJson, o.recordDigest, id, 1); owner.recordDelivery(id, o.recordDigest); }
  const view = owner.read(), state = h.model.exportState();
  assert.equal(view.deliveredQuantity, 100); assert.equal(view.quantityOwed, 0); assert.equal(view.liability, 'SATISFIED');
  assert.equal(state.grants.length, 1); assert.equal(h.calls.funding, 1); assert.equal(h.calls.debit, 100); assert.equal(h.calls.execute, 100);
  assert.equal(h.model.getGrant(h.grant.grantId).consumedUnits, 100);
});
check('recorded-delivery-exact-repeat-does-not-debit-execute-or-write-liability-twice', async () => {
  const h = fixture(), owner = await h.ready(), o = h.original(); h.execute(o); owner.beginDelivery(o.recordJson, o.recordDigest, 'delivery.recorded.1', 1);
  owner.recordDelivery('delivery.recorded.1', o.recordDigest); const before = h.journal, writes = h.calls.journalWrites;
  owner.recordDelivery('delivery.recorded.1', o.recordDigest); assert.equal(h.journal, before); assert.equal(h.calls.journalWrites, writes);
  assert.equal(h.calls.debit, 1); assert.equal(h.calls.execute, 1);
});
check('recorded-delivery-memory-reconstruction-preserves-original-result-and-liability', async () => {
  const h = fixture(), owner = await h.ready(), o = h.original(); h.execute(o); owner.beginDelivery(o.recordJson, o.recordDigest, 'delivery.recorded.1', 1);
  owner.recordDelivery('delivery.recorded.1', o.recordDigest); const before = h.journal; owner.close(); h.d.close();
  const adapter = h.reopen(), next = h.owner(adapter); next.recover(); next.recordDelivery('delivery.recorded.1', o.recordDigest);
  assert.equal(h.journal, before); assert.equal(next.read().quantityOwed, 99); assert.equal(h.calls.execute, 1);
});
check('recorded-delivery-expired-or-revoked-history-never-refreshes-time-or-pricing', () => {
  for (const lifecycle of ['EXPIRED', 'REVOKED']) { const h = fixture(), o = h.original(); h.execute(o);
    if (lifecycle === 'REVOKED') h.model.revokeGrant({ grantId: o.grantId }); else { h.time = NOW + 30000; h.model.getGrant(o.grantId); }
    const clock = h.calls.clock, pricing = h.calls.pricing; assert.equal(JSON.parse(h.d.verifyDelivery(o.recordDigest, h.context(o))).status, 'DELIVERED');
    assert.equal(h.calls.clock, clock); assert.equal(h.calls.pricing, pricing); }
});
check('recorded-delivery-unfinished-and-released-requests-never-become-compensation-evidence', () => {
  for (const state of ['RESERVED', 'EXECUTING', 'OUTCOME_UNKNOWN', 'FAILED_RELEASED']) { const h = fixture(), o = h.original(); h.execute(o, state);
    const before = JSON.stringify(h.model.exportState()); assert.throws(() => h.d.verifyDelivery(o.recordDigest, h.context(o)), code('NOT_SUCCEEDED'));
    assert.equal(JSON.stringify(h.model.exportState()), before); }
});
check('recorded-delivery-absent-request-refuses-without-inferring-not-performed', () => {
  const h = fixture(), o = h.original(); assert.throws(() => h.d.verifyDelivery(o.recordDigest, h.context(o)), code('NOT_RECORDED'));
  assert.equal(h.calls.debit + h.calls.execute, 0);
});
check('recorded-delivery-non-success-http-result-does-not-discharge-liability', () => {
  const h = fixture(), o = h.original(); h.execute(o, 'SUCCEEDED', 503);
  assert.throws(() => h.d.verifyDelivery(o.recordDigest, h.context(o)), code('RESULT_NOT_DELIVERED'));
});
check('recorded-delivery-foreign-grant-stops-before-reading-a-request', () => {
  const h = fixture(), o = h.original(); h.execute(o); h.grantHook = identity => { const v = clone(h.model.readOriginalFundingGrant(identity)); v.record.grantId = 'grant_' + 'f'.repeat(64); return deep(v); };
  assert.throws(() => h.d.verifyDelivery(o.recordDigest, h.context(o)), code('GRANT_CONFLICT')); assert.equal(h.calls.request, 0);
});
check('recorded-delivery-original-and-quantity-bindings-precede-all-ledger-calls', () => {
  const h = fixture(), o = h.original(); h.execute(o);
  for (const edit of [c => { c.quantity = 2; }, c => { c.requestId = 'foreign'; }, c => { c.paymentScope = 'sha256:' + 'f'.repeat(64); },
    c => { c.serviceResourceUrl = 'https://foreign.invalid/service'; }, c => { c.termsDigest = 'sha256:' + 'f'.repeat(64); }]) {
    const c = h.context(o); edit(c); assert.throws(() => h.d.verifyDelivery(o.recordDigest, c)); }
  assert.equal(h.calls.grant + h.calls.request, 0); assert.equal(h.d.snapshot().attempts, 0);
});
check('recorded-delivery-changed-stored-request-is-not-the-original', () => {
  for (const key of ['method', 'routeId', 'canonicalBodyDigest', 'selectedContentType', 'maxCostUnits']) {
    const h = fixture(), o = h.original(); h.execute(o); h.requestHook = ref => ({ ...h.model.getRequest(ref), [key]: key === 'maxCostUnits' ? 2 : 'foreign' });
    assert.throws(() => h.d.verifyDelivery(o.recordDigest, h.context(o)), code('REQUEST_CONFLICT')); }
});
check('recorded-delivery-another-original-url-cannot-claim-the-selected-ledger-result', () => {
  const h = fixture(), o = h.original('request.recorded.1', 'https://order-funding.invalid/another-api'); h.execute(o);
  assert.throws(() => h.d.verifyDelivery(o.recordDigest, h.context(o)), code('ORIGINAL_CONFLICT'));
  assert.equal(h.calls.grant + h.calls.request, 0);
});
check('recorded-delivery-cost-and-request-digest-cannot-be-replaced', () => {
  for (const edit of [r => { r.costUnits = 2; }, r => { r.requestDigest = 'sha256:' + 'f'.repeat(64); }]) {
    const h = fixture(), o = h.original(); h.execute(o); h.requestHook = ref => { const r = clone(h.model.getRequest(ref)); edit(r); return r; };
    assert.throws(() => h.d.verifyDelivery(o.recordDigest, h.context(o)), code('REQUEST_CONFLICT')); }
});
check('recorded-delivery-accessor-result-is-refused-without-invoking-it', () => {
  const h = fixture(), o = h.original(); h.execute(o); let hooks = 0;
  h.requestHook = ref => { const r = clone(h.model.getRequest(ref)); Object.defineProperty(r.cachedResult, 'resultCode', { enumerable: true, get() { hooks++; throw Error(); } }); return r; };
  assert.throws(() => h.d.verifyDelivery(o.recordDigest, h.context(o))); assert.equal(hooks, 0);
});
check('recorded-delivery-reader-throw-remains-held-and-is-not-retried', () => {
  const h = fixture(), o = h.original(); h.execute(o); h.requestHook = () => { throw Error('private failure'); };
  assert.throws(() => h.d.verifyDelivery(o.recordDigest, h.context(o)), code('READ_UNKNOWN'));
  assert.throws(() => h.d.verifyDelivery(o.recordDigest, h.context(o)), code('HELD')); assert.equal(h.calls.request, 1);
});
check('recorded-delivery-asynchronous-reader-is-observed-but-never-repaired', async () => {
  const h = fixture(), o = h.original(); h.execute(o); h.requestHook = () => Promise.reject(Error('declared synchronous-port mismatch'));
  assert.throws(() => h.d.verifyDelivery(o.recordDigest, h.context(o)), code('READ_UNKNOWN')); await Promise.resolve();
  assert.equal(h.d.snapshot().held, true); assert.equal(h.calls.request, 1);
});
check('recorded-delivery-close-during-grant-read-refuses-before-request-and-does-not-close-ledger', () => {
  const h = fixture(), o = h.original(); h.execute(o); h.grantHook = identity => { h.d.close(); return h.model.readOriginalFundingGrant(identity); };
  assert.throws(() => h.d.verifyDelivery(o.recordDigest, h.context(o)), code('CLOSED')); assert.equal(h.calls.request, 0);
  assert.equal(h.d.snapshot().held, true); assert.equal(h.calls.closes, 0);
});
check('recorded-delivery-swallowed-reader-reentry-still-fences-the-outer-result', () => {
  const h = fixture(), o = h.original(); h.execute(o); h.requestHook = ref => { assert.throws(() => h.d.verifyDelivery(o.recordDigest, h.context(o))); return h.model.getRequest(ref); };
  assert.throws(() => h.d.verifyDelivery(o.recordDigest, h.context(o)), code('READ_UNKNOWN')); assert.equal(h.calls.request, 1);
});
check('recorded-delivery-explicit-attempt-bound-stops-before-another-ledger-read', () => {
  const h = fixture(), o = h.original(); h.execute(o); const d = verifier(...inputs(h.f), { ledger: h.ledger, serviceResourceUrl: SERVICE, maximumAttempts: 1 });
  d.verifyDelivery(o.recordDigest, h.context(o)); assert.throws(() => d.verifyDelivery(o.recordDigest, h.context(o)), code('ATTEMPT_LIMIT'));
  assert.equal(h.calls.grant, 1); assert.equal(h.calls.request, 1); assert.equal(d.snapshot().attempts, 1);
});
check('recorded-delivery-port-getters-and-invalid-limits-are-refused-before-use', () => {
  const h = fixture(); let hooks = 0; const ledger = { getRequest: h.ledger.getRequest };
  Object.defineProperty(ledger, 'readOriginalFundingGrant', { enumerable: true, get() { hooks++; throw Error(); } });
  assert.throws(() => verifier(...inputs(h.f), { ledger, serviceResourceUrl: SERVICE, maximumAttempts: 1 })); assert.equal(hooks, 0);
  for (const maximumAttempts of [0, -0, 4097, 1.5]) assert.throws(() => verifier(...inputs(h.f), { ledger: h.ledger, serviceResourceUrl: SERVICE, maximumAttempts }));
});

export const recordedDeliveryDataCases = Object.freeze([...checks]);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = [];
  for (const { id, run } of checks) {
    try { await run(); cases.push({ id, status: 'PASS' }); }
    catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.code ?? e?.message ?? 'unknown').slice(0, 256) }); }
  }
  const failed = cases.filter(c => c.status === 'FAIL').length;
  process.stdout.write(JSON.stringify({ qualification: 'G1_RECORDED_ORDER_DELIVERY_DATA', passed: cases.length - failed, failed,
    cases, nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0 }) + '\n');
  process.exitCode = failed ? 1 : 0;
}
