import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { claimPurchasedOrderFulfillmentOwnership as claimJournal, createPurchasedOrderFulfillmentStatePort as statePort, inspectPurchasedOrderFulfillmentEnvelope as inspectJournal, requirePurchasedOrderFulfillmentEnvelopeTransition as journalTransition } from '../src/service-purchase-order-fulfillment-cas-contract.js';
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
const H = letter => 'sha256:' + letter.repeat(64);
export function orderFulfillmentCasHarness(options = {}) {
  const f = fixture(options), p = capturePurchasedOrderPayment(...inputs(f)), storeId = 'store.order.liability.synthetic';
  let fundingRow = null, at = NOW + 30000, mode = 'normal', afterWrite = null, afterProof = null;
  let authentication = () => Promise.resolve(f.verifiedRecord);
  const rows = new Map(), scopes = new Map();
  const originals = new Map(), proofs = new Map(), calls = { funding: 0, delivery: 0, compensation: 0, originalReads: 0, reads: 0, cas: 0, writes: 0, closes: 0 };
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
  const journalStoreId = 'store.order.fulfillment.synthetic';
  const journalBackend = {
    readEnvelope(orderId, scope) {
      calls.reads++; if (mode === 'readThrows') throw Error('synthetic read failure');
      const raw = rows.get(orderId) ?? null; return raw === null || JSON.parse(raw).paymentScope === scope ? raw : null;
    }, compareAndSwapEnvelope(orderId, scope, expected, next) {
      calls.cas++; journalTransition(expected, next);
      if (mode === 'conflict' || (rows.get(orderId) ?? null) !== expected || (scopes.has(scope) && scopes.get(scope) !== orderId)) return null;
      if (next !== expected) { rows.set(orderId, next); scopes.set(scope, orderId); calls.writes++; afterWrite?.(); }
      if (mode === 'lostAck') throw Error('synthetic lost acknowledgement');
      return mode === 'booleanAck' ? true : next;
    }, close() { calls.closes++; },
  };
  function owner(port, selected = f) {
    return create(...inputs(selected), { fundingStoreId: storeId, fundingStore: backend, stateStore: port, originalStore, verifier, clock: () => at });
  }
  function acquire(ownerId = 'worker.fulfillment.1', expected = rows.get(p.orderId) ?? null) {
    const claimed = claimJournal(journalStoreId, p.orderId, p.paymentScope, expected, ownerId, journalBackend);
    const port = statePort(claimed.ownerTokenJson, journalBackend); return { ...claimed, port, owner: owner(port) };
  }
  async function ready(funded = true) {
    const active = acquire(); active.owner.recover();
    if (funded) { await funding.verifyFunding(proof()); active.owner.recordVerifiedFunding(); } return active;
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
  return { f, p, storeId, backend, journalStoreId, journalBackend, originalStore, verifier, owner, acquire, ready, funding, original, originals, begin, delivery, compensation, retain, compResult, evidence, calls,
    get row() { return rows.get(p.orderId) ?? null; }, set row(v) { if (v === null) rows.delete(p.orderId); else rows.set(p.orderId, v); }, get fundingRow() { return fundingRow; }, set fundingRow(v) { fundingRow = v; },
    set mode(v) { mode = v; }, set afterWrite(v) { afterWrite = v; }, set afterProof(v) { afterProof = v; }, set time(v) { at = v; },
    set authentication(v) { authentication = v; } };
}
export function repackOrderFulfillmentEnvelope(before, recordJson, edit = () => {}) {
  const e = JSON.parse(before); e.revision++; e.recordJson = recordJson;
  e.recordDigest = 'sha256:' + createHash('sha256').update('zenon-x402:order-fulfillment-cas-record:v1\0').update(recordJson).digest('hex');
  edit(e); return JSON.stringify(e);
}
