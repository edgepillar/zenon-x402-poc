// The actual application, fencing and recorded-result adapter over memory DATA.
// No SQL, installed package, listener, real timer, signing or process recovery.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createPurchasedOrderRecordedApplicationCore as create } from '../src/service-purchase-order-recorded-application-core.js';
import { capturePurchasedOrderApplicationSelection, purchasedOrderApplicationSelectionFromRecovery } from '../src/service-purchase-order-application-core.js';
import { requirePurchasedOrderFulfillmentEnvelopeTransition, inspectPurchasedOrderFulfillmentEnvelope } from '../src/service-purchase-order-fulfillment-cas-contract.js';
import { createServiceCreditApplicationDeadlineOwnerCore } from '../src/service-credit-application-deadline-owner-core.js';
import { recordedDeliveryLedgerFixture } from './recorded-delivery-ledger.fixture.mjs';
import { orderFundingOwnerInputs as inputs, orderFundingProof, NOW } from './service-purchase-order-recorded-delivery.fixture.mjs';

const checks = [], SERVICE = 'https://order-funding.invalid/service-credit/v1/execute';
function check(id, run) { checks.push({ id, run }); }
async function fixture({ maximumAttempts = 256 } = {}) {
  const h = recordedDeliveryLedgerFixture();
  await h.funding.close();
  let journal = null, fault = null, epoch = 0;
  const calls = { funding: 0, writes: 0 };
  const fulfillmentBackend = {
    readEnvelope(orderId, scope) { assert.equal(orderId, h.p.orderId); assert.equal(scope, h.p.paymentScope); return journal; },
    compareAndSwapEnvelope(orderId, scope, expected, proposed) {
      assert.equal(orderId, h.p.orderId); assert.equal(scope, h.p.paymentScope);
      requirePurchasedOrderFulfillmentEnvelopeTransition(expected, proposed);
      if (expected !== journal) return null;
      journal = proposed; calls.writes++;
      const record = inspectPurchasedOrderFulfillmentEnvelope(proposed).recordJson;
      if (fault === 'DELIVERY_ACK_LOSS' && record !== null && JSON.parse(record).deliveries.some(d => d.status === 'DELIVERED')) {
        fault = null; throw Error('declared memory delivery acknowledgement loss');
      }
      return proposed;
    },
  };
  function selection() {
    const n = ++epoch;
    return capturePurchasedOrderApplicationSelection({ funding: {
      purchase: Object.fromEntries(['termsJson', 'termsDigest', 'paymentCheckpointJson', 'paymentPinsJson', 'fundingContextJson']
        .map((key, i) => [key, inputs(h.f)[i]])),
      ownership: { storeId: 'store.recorded.funding', ownerId: 'worker.owned.funding.' + n,
        expectedEnvelopeJson: h.fundingStore.readEnvelope(h.p.orderId, h.p.paymentScope) },
      maximumVerificationAttempts: 1, closeBudgetMs: 10,
    }, fulfillmentOwnership: { storeId: 'store.recorded.fulfillment', ownerId: 'worker.owned.journal.' + n,
      expectedEnvelopeJson: journal } });
  }
  function options(selected = selection()) {
    const deadlines = createServiceCreditApplicationDeadlineOwnerCore({ maxScheduleStarts: 1, maxConcurrentTimers: 1, maxDelayMs: 10,
      armTimer() { return { cancelled: false }; }, cancelTimer(handle) { handle.cancelled = true; }, readMonotonicTime() { return 0n; } });
    return { selection: selected, fundingBackend: h.fundingStore, fulfillmentBackend, originalStore: h.originalStore,
      verifyFundingEvidence() { calls.funding++; return Promise.resolve(h.f.verifiedRecord); },
      verifyCompensation() { throw Error('no compensation evidence selected'); },
      recordedDelivery: { ledger: h.ledger, serviceResourceUrl: SERVICE, maximumAttempts }, clock: () => NOW, deadlines };
  }
  async function ready(o = options()) { const app = create(o); app.start(); await app.verifyFunding(orderFundingProof()); return app; }
  function restore(record) {
    const n = ++epoch;
    return create(options(purchasedOrderApplicationSelectionFromRecovery(record.recordJson, record.recordDigest,
      { fundingOwnerId: 'worker.owned.recovery.funding.' + n, fulfillmentOwnerId: 'worker.owned.recovery.journal.' + n })));
  }
  function row() { return JSON.parse(inspectPurchasedOrderFulfillmentEnvelope(journal).recordJson); }
  return { h, calls, options, ready, restore, row, get journal() { return journal; }, set fault(value) { fault = value; } };
}
async function retiredHeld(app) { await assert.rejects(app.close()); assert.equal(app.snapshot().phase, 'HELD'); }

check('recorded-owned-construction-borrows-no-ledger-and-opens-no-funding', async () => {
  const f = await fixture(), app = create(f.options());
  assert.equal(app.snapshot().phase, 'CREATED'); assert.equal(app.recordedDeliverySnapshot().attempts, 0);
  assert.equal(app.recordedDeliverySnapshot().closed, false);
  assert.equal(f.h.calls.grant, 0); assert.equal(f.h.calls.request, 0); assert.equal(f.calls.funding, 0);
  assert.equal(await app.close(), undefined); assert.equal(app.recordedDeliverySnapshot().closed, true);
  assert.equal(f.h.calls.closes, 0); f.h.d.close();
});
check('recorded-owned-one-funding-one-grant-one-hundred-originals-and-replay', async () => {
  const f = await fixture(), app = await f.ready();
  let last;
  for (let i = 0; i < 100; i++) {
    const o = f.h.original('owned.request.' + i), deliveryId = 'owned.delivery.' + i;
    app.beginDelivery(o.recordJson, o.recordDigest, deliveryId, 1); f.h.execute(o);
    app.recordDelivery(deliveryId, o.recordDigest); last = { o, deliveryId };
  }
  const journal = f.journal, writes = f.calls.writes, state = JSON.stringify(f.h.model.exportState());
  app.recordDelivery(last.deliveryId, last.o.recordDigest);
  assert.equal(f.journal, journal); assert.equal(f.calls.writes, writes); assert.equal(JSON.stringify(f.h.model.exportState()), state);
  assert.equal(app.readFunding().quantityOwed, 0); assert.equal(app.readLiability().deliveredQuantity, 100);
  assert.equal(f.calls.funding, 1); assert.equal(f.h.model.exportState().grants.length, 1);
  assert.equal(f.h.calls.debit, 100); assert.equal(f.h.calls.execute, 100);
  assert.equal(f.h.model.getGrant(last.o.grantId).consumedUnits, 100);
  assert.equal(app.recordedDeliverySnapshot().attempts, 100);
  assert.equal(await app.close(), undefined); assert.equal(app.recordedDeliverySnapshot().closed, true);
  assert.equal(f.h.calls.closes, 0); f.h.d.close();
});
check('recorded-owned-delivery-and-exact-repeat-use-one-funding-and-one-model-effect', async () => {
  const f = await fixture(), app = await f.ready(), o = f.h.original();
  app.beginDelivery(o.recordJson, o.recordDigest, 'delivery.owned.1', 1); f.h.execute(o);
  app.recordDelivery('delivery.owned.1', o.recordDigest);
  const journal = f.journal, writes = f.calls.writes;
  app.recordDelivery('delivery.owned.1', o.recordDigest);
  assert.equal(f.journal, journal); assert.equal(f.calls.writes, writes);
  assert.equal(app.readFunding().quantityOwed, 99); assert.equal(f.calls.funding, 1);
  assert.equal(f.h.calls.debit, 1); assert.equal(f.h.calls.execute, 1);
  assert.equal(f.h.model.getGrant(o.grantId).consumedUnits, 1); assert.equal(app.recordedDeliverySnapshot().attempts, 1);
  assert.equal(await app.close(), undefined); assert.equal(f.h.calls.closes, 0); f.h.d.close();
});
check('recorded-owned-close-inside-grant-read-prevents-the-request-read', async () => {
  const f = await fixture(), app = await f.ready(), o = f.h.original(); f.h.execute(o);
  app.beginDelivery(o.recordJson, o.recordDigest, 'delivery.owned.1', 1);
  const before = f.journal; let closing;
  f.h.grantHook = identity => { closing = app.close(); return f.h.model.readOriginalFundingGrant(identity); };
  assert.throws(() => app.recordDelivery('delivery.owned.1', o.recordDigest)); await assert.rejects(closing);
  assert.equal(f.h.calls.grant, 1); assert.equal(f.h.calls.request, 0); assert.equal(f.h.calls.closes, 0);
  assert.equal(f.journal, before); assert.equal(f.row().deliveries[0].status, 'PENDING');
  assert.equal(app.recordedDeliverySnapshot().closed, true); assert.equal(app.recordedDeliverySnapshot().held, true);
  assert.equal(app.snapshot().phase, 'HELD'); f.h.d.close();
});
check('recorded-owned-close-inside-request-read-revokes-before-the-late-result', async () => {
  const f = await fixture(), app = await f.ready(), o = f.h.original(); f.h.execute(o);
  app.beginDelivery(o.recordJson, o.recordDigest, 'delivery.owned.1', 1);
  const before = f.journal; let closing;
  f.h.requestHook = key => { closing = app.close(); return f.h.model.getRequest(key); };
  assert.throws(() => app.recordDelivery('delivery.owned.1', o.recordDigest)); await assert.rejects(closing);
  assert.equal(f.journal, before); assert.equal(f.row().deliveries[0].status, 'PENDING');
  assert.equal(app.recordedDeliverySnapshot().closed, true); assert.equal(app.recordedDeliverySnapshot().held, true);
  const reads = [f.h.calls.grant, f.h.calls.request];
  assert.throws(() => app.recordDelivery('delivery.owned.1', o.recordDigest));
  assert.deepEqual([f.h.calls.grant, f.h.calls.request], reads); assert.equal(f.h.calls.closes, 0); f.h.d.close();
});
check('recorded-owned-repeated-close-returns-the-exact-existing-promise', async () => {
  const f = await fixture(), app = await f.ready(), a = app.close(), b = app.close();
  assert.equal(a, b); assert.equal(await a, undefined); assert.equal(app.close(), a);
  assert.equal(app.recordedDeliverySnapshot().closed, true); assert.equal(app.recordedDeliverySnapshot().attempts, 0);
  assert.equal(f.h.calls.closes, 0); f.h.d.close();
});
check('recorded-owned-close-before-start-and-invalid-close-arguments-preserve-the-fence', async () => {
  const f = await fixture(), app = create(f.options());
  assert.throws(() => app.close('ignored'), /ORDER_RECORDED_APPLICATION_INPUT/);
  assert.equal(app.recordedDeliverySnapshot().closed, false);
  const closing = app.close(); assert.equal(app.recordedDeliverySnapshot().closed, true);
  assert.throws(() => app.start()); assert.throws(() => app.recordDelivery('foreign', 'sha256:' + 'f'.repeat(64)));
  assert.equal(await closing, undefined); assert.equal(f.h.calls.grant, 0); assert.equal(f.h.calls.request, 0);
  assert.equal(f.calls.funding, 0); assert.equal(f.h.calls.closes, 0); f.h.d.close();
});
check('recorded-owned-construction-refusal-does-not-touch-a-borrowed-backend', async () => {
  const f = await fixture(), o = f.options(); o.fulfillmentBackend = o.fundingBackend;
  assert.throws(() => create(o), /STORE_SELECTION_CONFLICT/);
  assert.equal(f.calls.funding, 0); assert.equal(f.h.calls.grant, 0); assert.equal(f.h.calls.request, 0);
  assert.equal(f.h.calls.closes, 0); f.h.d.close();
});
check('recorded-owned-caller-mutation-cannot-replace-the-captured-result-reader', async () => {
  const f = await fixture(), options = f.options(), app = create(options);
  options.selection = null; options.verifyFundingEvidence = () => assert.fail('replacement funding callback');
  options.recordedDelivery.serviceResourceUrl = 'https://foreign.invalid/service';
  options.recordedDelivery.ledger.getRequest = () => assert.fail('replacement reader');
  app.start(); await app.verifyFunding(orderFundingProof());
  const o = f.h.original(); app.beginDelivery(o.recordJson, o.recordDigest, 'delivery.owned.1', 1); f.h.execute(o);
  app.recordDelivery('delivery.owned.1', o.recordDigest);
  assert.equal(app.readFunding().quantityOwed, 99); assert.equal(f.calls.funding, 1);
  assert.equal(f.h.calls.request, 1); assert.equal(await app.close(), undefined); f.h.d.close();
});
check('recorded-owned-known-unknown-result-keeps-liability-and-the-inspection-bound', async () => {
  const f = await fixture({ maximumAttempts: 1 }), app = await f.ready(), o = f.h.original();
  app.beginDelivery(o.recordJson, o.recordDigest, 'delivery.owned.1', 1); f.h.execute(o, 'OUTCOME_UNKNOWN');
  const before = f.journal;
  assert.throws(() => app.recordDelivery('delivery.owned.1', o.recordDigest), /PROOF_REJECTED/);
  const reads = [f.h.calls.grant, f.h.calls.request];
  assert.throws(() => app.recordDelivery('delivery.owned.1', o.recordDigest), /PROOF_REJECTED/);
  assert.deepEqual([f.h.calls.grant, f.h.calls.request], reads); assert.equal(app.recordedDeliverySnapshot().attempts, 1);
  assert.equal(f.journal, before); assert.equal(app.readFunding().quantityOwed, 100);
  assert.equal(f.h.model.getGrant(o.grantId).heldUnits, 1); assert.equal(await app.close(), undefined); f.h.d.close();
});
check('recorded-owned-memory-recovery-keeps-the-receipt-with-no-new-verification', async () => {
  const f = await fixture(), app = await f.ready(), o = f.h.original();
  app.beginDelivery(o.recordJson, o.recordDigest, 'delivery.owned.1', 1); f.h.execute(o); app.recordDelivery('delivery.owned.1', o.recordDigest);
  const record = app.exportRecoveryRecord(), original = f.row().deliveries[0].originalJson;
  assert.equal(await app.close(), undefined); const next = f.restore(record); next.start();
  next.recordDelivery('delivery.owned.1', o.recordDigest);
  assert.equal(next.readFunding().quantityOwed, 99); assert.equal(f.row().deliveries[0].originalJson, original);
  assert.equal(f.calls.funding, 1); assert.equal(f.h.calls.debit, 1); assert.equal(f.h.calls.execute, 1);
  assert.equal(next.recordedDeliverySnapshot().attempts, 0); assert.equal(app.recordedDeliverySnapshot().closed, true);
  assert.equal(await next.close(), undefined); assert.equal(f.h.calls.closes, 0); f.h.d.close();
});
check('recorded-owned-delivery-ack-loss-recovers-the-same-committed-original', async () => {
  const f = await fixture(), app = await f.ready(), o = f.h.original();
  app.beginDelivery(o.recordJson, o.recordDigest, 'delivery.owned.1', 1); f.h.execute(o); f.fault = 'DELIVERY_ACK_LOSS';
  assert.throws(() => app.recordDelivery('delivery.owned.1', o.recordDigest), /COMMIT_UNKNOWN/);
  const record = app.exportRecoveryRecord(), original = f.row().deliveries[0].originalJson;
  assert.equal(f.row().deliveries[0].status, 'DELIVERED'); await retiredHeld(app);
  assert.equal(app.recordedDeliverySnapshot().closed, true);
  const next = f.restore(record); next.start(); next.recordDelivery('delivery.owned.1', o.recordDigest);
  assert.equal(next.readFunding().quantityOwed, 99); assert.equal(f.row().deliveries[0].originalJson, original);
  assert.equal(f.calls.funding, 1); assert.equal(f.h.calls.debit, 1); assert.equal(f.h.calls.execute, 1);
  assert.equal(await next.close(), undefined); assert.equal(f.h.calls.closes, 0); f.h.d.close();
});
check('recorded-owned-proxy-and-accessor-options-run-no-input-hooks', async () => {
  const f = await fixture(), o = f.options(); let hooks = 0;
  const proxy = new Proxy(o, { getPrototypeOf() { hooks++; throw Error('trap'); }, ownKeys() { hooks++; throw Error('trap'); },
    getOwnPropertyDescriptor() { hooks++; throw Error('trap'); } });
  assert.throws(() => create(proxy), /ORDER_RECORDED_APPLICATION_INPUT/);
  const accessor = { ...o }; Object.defineProperty(accessor, 'recordedDelivery', { enumerable: true, get() { hooks++; return o.recordedDelivery; } });
  assert.throws(() => create(accessor), /ORDER_RECORDED_APPLICATION_INPUT/);
  assert.equal(hooks, 0); assert.equal(f.h.calls.grant, 0); assert.equal(f.h.calls.request, 0); f.h.d.close();
});
check('recorded-owned-custom-delivery-authority-and-missing-compensation-are-refused', async () => {
  const f = await fixture(), o = f.options();
  assert.throws(() => create({ ...o, verifier: { verifyDelivery() { assert.fail('replacement delivery verifier'); } } }), /ORDER_RECORDED_APPLICATION_INPUT/);
  assert.throws(() => create({ ...o, verifyCompensation: null }), /ORDER_RECORDED_APPLICATION_INPUT/);
  assert.equal(f.calls.funding, 0); assert.equal(f.h.calls.grant, 0); assert.equal(f.h.calls.request, 0); f.h.d.close();
});

export const recordedOwnedApplicationDataCases = Object.freeze([...checks]);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = [];
  for (const { id, run } of checks) {
    try { await run(); cases.push({ id, status: 'PASS' }); }
    catch (error) { cases.push({ id, status: 'FAIL', error: String(error?.code ?? error?.message ?? 'unknown').slice(0, 256) }); }
  }
  const failed = cases.filter(c => c.status === 'FAIL').length;
  process.stdout.write(JSON.stringify({ qualification: 'G1_RECORDED_OWNED_APPLICATION_DATA', passed: cases.length - failed, failed, cases,
    nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0 }) + '\n');
  process.exitCode = failed ? 1 : 0;
}
