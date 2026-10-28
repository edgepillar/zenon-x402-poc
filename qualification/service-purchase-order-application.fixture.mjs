import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createPurchasedOrderApplicationCore, capturePurchasedOrderApplicationSelection } from '../src/service-purchase-order-application-core.js';
import { createPurchasedOrderHttpApplicationCore } from '../src/service-purchase-order-http-application.js';
import { createServiceCreditApplicationDeadlineOwnerCore } from '../src/service-credit-application-deadline-owner-core.js';
import { inspectPurchasedOrderFundingEnvelope } from '../src/service-purchase-order-funding-cas-contract.js';
import { inspectPurchasedOrderFulfillmentEnvelope } from '../src/service-purchase-order-fulfillment-cas-contract.js';
import { orderFulfillmentCasHarness } from './service-purchase-order-fulfillment-cas.fixture.mjs';
import { orderFundingOwnerInputs, orderFundingProof, NOW } from './service-purchase-order-fulfillment.fixture.mjs';

export const proof = orderFundingProof;
export function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
export async function drain() { for (let i = 0; i < 32; i++) await Promise.resolve(); }
export async function stop(app) { try { await app.close(); } catch { assert.equal(app.snapshot().phase, 'HELD'); } }
export function applicationHarness() {
  const h = orderFulfillmentCasHarness(), calls = { verifies: 0, fundingReads: 0, fundingCAS: 0 };
  let verifier = () => Promise.resolve(h.f.verifiedRecord), fundingMode = 'normal', onFundingWrite = null;
  const fundingBackend = {
    readEnvelope(...args) { calls.fundingReads++; return h.backend.readEnvelope(...args); },
    compareAndSwapEnvelope(...args) {
      calls.fundingCAS++; const raw = h.backend.compareAndSwapEnvelope(...args); onFundingWrite?.(raw);
      if (fundingMode === 'lostVerifiedAck' && JSON.parse(inspectPurchasedOrderFundingEnvelope(raw).receiptJson ?? '{}').phase === 'VERIFIED') throw Error('synthetic funding acknowledgement loss');
      return raw;
    },
  };
  function selection(fundingOwnerId = 'worker.application.funding', journalOwnerId = 'worker.application.journal') {
    return capturePurchasedOrderApplicationSelection({ funding: {
      purchase: Object.fromEntries(['termsJson', 'termsDigest', 'paymentCheckpointJson', 'paymentPinsJson', 'fundingContextJson'].map((k, i) => [k, orderFundingOwnerInputs(h.f)[i]])),
      ownership: { storeId: h.storeId, ownerId: fundingOwnerId, expectedEnvelopeJson: h.fundingRow }, maximumVerificationAttempts: 3, closeBudgetMs: 10 },
      fulfillmentOwnership: { storeId: h.journalStoreId, ownerId: journalOwnerId, expectedEnvelopeJson: h.row } });
  }
  function create(selected = selection(), http = false, clock = () => NOW + 30000) {
    const timers = []; let time = 0n;
    const deadlines = createServiceCreditApplicationDeadlineOwnerCore({ maxScheduleStarts: 1, maxConcurrentTimers: 1, maxDelayMs: 10,
      armTimer(wake, ms) { const handle = { wake, ms, cancelled: false }; timers.push(handle); return handle; },
      cancelTimer(handle) { handle.cancelled = true; }, readMonotonicTime() { return time; } });
    const common = { fundingBackend, fulfillmentBackend: h.journalBackend, originalStore: h.originalStore,
      verifyFundingEvidence: value => { calls.verifies++; return verifier(value); }, verifier: h.verifier, clock, deadlines };
    const app = http ? createPurchasedOrderHttpApplicationCore({ purchaseHttp: { selection: selected.funding, fundingCandidateJson: proof() }, fulfillmentOwnership: selected.fulfillmentOwnership, ...common })
      : createPurchasedOrderApplicationCore({ selection: selected, ...common });
    return { app, expire() { time = 10000000n; assert.equal(timers.length, 1); timers[0].wake(); } };
  }
  function record() { return JSON.parse(inspectPurchasedOrderFulfillmentEnvelope(h.row).recordJson); }
  function delivery(app, status = 'DELIVERED') {
    const d = record().deliveries[0];
    return app.recordDelivery(d.deliveryId, h.evidence('delivery', { version: 1, kind: 'EXACT_SERVICE_DELIVERY_V1', deliveryId: d.deliveryId,
      requestScope: d.requestScope, originalDigest: d.originalDigest, quantity: d.quantity, status,
      resultDigest: status === 'DELIVERED' ? 'sha256:' + 'd'.repeat(64) : null, evidenceId: 'delivery.application.' + status }));
  }
  function compensate(app, confirmed = false) {
    const owed = app.readLiability().quantityOwed;
    if (!confirmed) {
      const value = { version: 1, kind: 'ZENON_COMPENSATION_ORIGINAL_V1', compensationId: 'comp.application', termsDigest: h.f.termsDigest,
        paymentScope: h.p.paymentScope, network: h.f.terms.network, asset: h.f.terms.price.asset, payee: h.f.terms.holder, quantity: owed,
        amountAtomic: String(10n * BigInt(owed)), transactionHash: 'f'.repeat(64), originalBytesBase64: Buffer.from('synthetic compensation; no signature').toString('base64') };
      return value;
    }
    const c = record().compensation, original = JSON.parse(c.originalJson);
    return app.recordCompensation(h.evidence('compensation', { version: 1, kind: 'ZENON_EXACT_COMPENSATION_V1', compensationId: original.compensationId,
      originalDigest: c.originalDigest, transactionHash: original.transactionHash, paymentScope: h.p.paymentScope, status: 'CONFIRMED', evidenceId: 'compensation.application' }));
  }
  function request(signature = h.p.checkpoint.originalBytes.paymentPayload) {
    return { method: 'POST', url: '/funding', httpVersion: '1.1', socket: { encrypted: true },
      rawHeaders: ['Host', 'order-funding.invalid', 'Content-Length', '0', ...(signature === null ? [] : ['PAYMENT-SIGNATURE', signature])] };
  }
  return { h, calls, fundingBackend, selection, create, record, delivery, compensate, request,
    set verifier(value) { verifier = value; }, set fundingMode(value) { fundingMode = value; }, set onFundingWrite(value) { onFundingWrite = value; } };
}
export function dispatch(app, request, lost = false) {
  const state = { status: null, body: null, ends: 0, success: 0, failure: 0 }, headers = {};
  const response = { destroyed: false, writableEnded: false, statusCode: 0, setHeader(name, value) { headers[name] = value; },
    end(body) { state.status = this.statusCode; state.body = body; state.ends++; if (lost) throw Error('synthetic response loss'); this.writableEnded = true; } };
  const done = Object.freeze({ success: Object.freeze(() => { state.success++; }), failure: Object.freeze(() => { state.failure++; }) });
  app.handle(request, response, Object.freeze({ data: true }), done); return { state, headers };
}
