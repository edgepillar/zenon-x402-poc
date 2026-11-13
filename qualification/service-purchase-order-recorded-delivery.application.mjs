// Actual paired application/fencing/ledger code; all stores and timing ports
// are declared memory DATA. No SQL, listener, process recovery or signing.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { recordedDeliveryLedgerFixture } from './recorded-delivery-ledger.fixture.mjs';
import { orderFundingOwnerInputs as inputs, orderFundingProof, NOW } from './service-purchase-order-recorded-delivery.fixture.mjs';
import { createPurchasedOrderRecordedDeliveryVerifier } from '../src/service-purchase-order-recorded-delivery.js';
import { createPurchasedOrderApplicationCore, capturePurchasedOrderApplicationSelection,
  purchasedOrderApplicationSelectionFromRecovery } from '../src/service-purchase-order-application-core.js';
import { requirePurchasedOrderFulfillmentEnvelopeTransition, inspectPurchasedOrderFulfillmentEnvelope } from '../src/service-purchase-order-fulfillment-cas-contract.js';
import { createServiceCreditApplicationDeadlineOwnerCore } from '../src/service-credit-application-deadline-owner-core.js';

const checks = [], SERVICE = 'https://order-funding.invalid/service-credit/v1/execute';
function check(id, run) { checks.push({ id, run }); }
async function fixture() {
  const h = recordedDeliveryLedgerFixture();
  // End the fixture's initial memory receipt owner before claiming its SAME
  // record in the application. This is not a second funding/verification.
  await h.funding.close();
  let journalRow = null, fault = null, epoch = 0;
  const calls = { funding: 0, journalWrites: 0 };
  const fulfillmentBackend = {
    readEnvelope(orderId, scope) { assert.equal(orderId, h.p.orderId); assert.equal(scope, h.p.paymentScope); return journalRow; },
    compareAndSwapEnvelope(orderId, scope, expected, proposed) {
      assert.equal(orderId, h.p.orderId); assert.equal(scope, h.p.paymentScope);
      requirePurchasedOrderFulfillmentEnvelopeTransition(expected, proposed);
      if (expected !== journalRow) return null;
      journalRow = proposed; calls.journalWrites++;
      const raw = inspectPurchasedOrderFulfillmentEnvelope(proposed).recordJson;
      if (fault === 'DELIVERY_ACK_LOSS' && raw !== null && JSON.parse(raw).deliveries.some(d => d.status === 'DELIVERED')) {
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
      ownership: { storeId: 'store.recorded.funding', ownerId: 'worker.application.funding.' + n,
        expectedEnvelopeJson: h.fundingStore.readEnvelope(h.p.orderId, h.p.paymentScope) },
      maximumVerificationAttempts: 1, closeBudgetMs: 10,
    }, fulfillmentOwnership: { storeId: 'store.recorded.fulfillment', ownerId: 'worker.application.journal.' + n,
      expectedEnvelopeJson: journalRow } });
  }
  function create(selected = selection(), adapter = h.d) {
    const deadlines = createServiceCreditApplicationDeadlineOwnerCore({ maxScheduleStarts: 1, maxConcurrentTimers: 1, maxDelayMs: 10,
      armTimer() { return { cancelled: false }; }, cancelTimer(handle) { handle.cancelled = true; }, readMonotonicTime() { return 0n; } });
    return createPurchasedOrderApplicationCore({ selection: selected, fundingBackend: h.fundingStore, fulfillmentBackend,
      originalStore: h.originalStore, verifyFundingEvidence() { calls.funding++; return Promise.resolve(h.f.verifiedRecord); },
      verifier: { verifyDelivery: adapter.verifyDelivery, verifyCompensation() { throw Error('no compensation evidence selected'); } },
      clock: () => NOW, deadlines });
  }
  async function ready() { const app = create(); app.start(); await app.verifyFunding(orderFundingProof()); return app; }
  function restore(record, adapter) {
    const n = ++epoch;
    return create(purchasedOrderApplicationSelectionFromRecovery(record.recordJson, record.recordDigest,
      { fundingOwnerId: 'worker.recovery.funding.' + n, fulfillmentOwnerId: 'worker.recovery.journal.' + n }), adapter);
  }
  function row() { return JSON.parse(inspectPurchasedOrderFulfillmentEnvelope(journalRow).recordJson); }
  return { h, calls, create, ready, restore, row,
    set fault(value) { fault = value; },
    freshAdapter() { return createPurchasedOrderRecordedDeliveryVerifier(...inputs(h.f),
      { ledger: h.ledger, serviceResourceUrl: SERVICE, maximumAttempts: 256 }); },
    get rawJournal() { return journalRow; },
  };
}
async function close(app) { try { await app.close(); } catch { assert.equal(app.snapshot().phase, 'HELD'); } }

check('recorded-application-one-funding-one-grant-one-hundred-exact-deliveries', async () => {
  const f = await fixture(), app = await f.ready();
  for (let i = 0; i < 100; i++) {
    const o = f.h.original('application.request.' + i), deliveryId = 'application.delivery.' + i;
    f.h.execute(o); app.beginDelivery(o.recordJson, o.recordDigest, deliveryId, 1); app.recordDelivery(deliveryId, o.recordDigest);
  }
  assert.equal(app.readFunding().quantityOwed, 0); assert.equal(app.readLiability().deliveredQuantity, 100);
  assert.equal(f.calls.funding, 1); assert.equal(f.h.calls.debit, 100); assert.equal(f.h.calls.execute, 100);
  assert.equal(f.h.model.exportState().grants.length, 1); assert.equal(f.h.model.getGrant(f.h.grant.grantId).consumedUnits, 100);
  await close(app); f.h.d.close(); assert.equal(f.h.calls.closes, 0);
});
check('recorded-application-result-repeat-does-not-change-either-original-journal', async () => {
  const f = await fixture(), app = await f.ready(), o = f.h.original(); f.h.execute(o);
  app.beginDelivery(o.recordJson, o.recordDigest, 'delivery.recorded.1', 1); app.recordDelivery('delivery.recorded.1', o.recordDigest);
  const journal = f.rawJournal, writes = f.calls.journalWrites, state = JSON.stringify(f.h.model.exportState());
  app.recordDelivery('delivery.recorded.1', o.recordDigest);
  assert.equal(f.rawJournal, journal); assert.equal(f.calls.journalWrites, writes); assert.equal(JSON.stringify(f.h.model.exportState()), state);
  assert.equal(app.readFunding().quantityOwed, 99); assert.equal(f.calls.funding, 1); await close(app);
});
check('recorded-application-memory-recovery-keeps-delivery-without-a-second-verification', async () => {
  const f = await fixture(), app = await f.ready(), o = f.h.original(); f.h.execute(o);
  app.beginDelivery(o.recordJson, o.recordDigest, 'delivery.recorded.1', 1); app.recordDelivery('delivery.recorded.1', o.recordDigest);
  const record = app.exportRecoveryRecord(), original = f.row().deliveries[0].originalJson;
  await close(app); f.h.d.close(); const next = f.restore(record, f.h.reopen()); next.start();
  next.recordDelivery('delivery.recorded.1', o.recordDigest); assert.equal(next.readFunding().quantityOwed, 99);
  assert.equal(f.row().deliveries[0].originalJson, original); assert.equal(f.calls.funding, 1);
  assert.equal(f.h.calls.debit, 1); assert.equal(f.h.calls.execute, 1); await close(next);
});
check('recorded-application-delivery-ack-loss-recovers-only-the-committed-original', async () => {
  const f = await fixture(), app = await f.ready(), o = f.h.original(); f.h.execute(o);
  app.beginDelivery(o.recordJson, o.recordDigest, 'delivery.recorded.1', 1); f.fault = 'DELIVERY_ACK_LOSS';
  assert.throws(() => app.recordDelivery('delivery.recorded.1', o.recordDigest), /COMMIT_UNKNOWN/);
  assert.equal(app.snapshot().phase, 'HELD'); assert.equal(f.row().deliveries[0].status, 'DELIVERED');
  const record = app.exportRecoveryRecord(), original = f.row().deliveries[0].originalJson;
  await close(app); f.h.d.close(); const next = f.restore(record, f.h.reopen()); next.start();
  next.recordDelivery('delivery.recorded.1', o.recordDigest); assert.equal(next.readFunding().quantityOwed, 99);
  assert.equal(f.row().deliveries[0].originalJson, original); assert.equal(f.calls.funding, 1);
  assert.equal(f.h.calls.debit, 1); assert.equal(f.h.calls.execute, 1); await close(next);
});
check('recorded-application-unknown-execution-retains-pending-liability', async () => {
  const f = await fixture(), app = await f.ready(), o = f.h.original(); f.h.execute(o, 'OUTCOME_UNKNOWN');
  app.beginDelivery(o.recordJson, o.recordDigest, 'delivery.recorded.1', 1);
  const before = f.rawJournal; assert.throws(() => app.recordDelivery('delivery.recorded.1', o.recordDigest), /PROOF_REJECTED/);
  assert.equal(f.rawJournal, before); assert.equal(app.readFunding().quantityOwed, 100);
  assert.equal(app.readLiability().unresolvedDelivery, true); assert.equal(f.row().deliveries[0].status, 'PENDING');
  assert.equal(f.h.model.getGrant(o.grantId).heldUnits, 1); await close(app);
});
check('recorded-application-close-during-ledger-read-cannot-discharge-late-delivery', async () => {
  const f = await fixture(), app = await f.ready(), o = f.h.original(); f.h.execute(o);
  app.beginDelivery(o.recordJson, o.recordDigest, 'delivery.recorded.1', 1); const before = f.rawJournal; let closing;
  f.h.requestHook = key => { f.h.d.close(); closing = app.close(); return f.h.model.getRequest(key); };
  assert.throws(() => app.recordDelivery('delivery.recorded.1', o.recordDigest)); await assert.rejects(closing);
  assert.equal(f.rawJournal, before); assert.equal(f.row().deliveries[0].status, 'PENDING');
  assert.equal(app.snapshot().phase, 'HELD'); assert.equal(f.h.calls.closes, 0); assert.equal(f.calls.funding, 1);
});

export const recordedDeliveryApplicationDataCases = Object.freeze([...checks]);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = [];
  for (const { id, run } of checks) {
    try { await run(); cases.push({ id, status: 'PASS' }); }
    catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.code ?? e?.message ?? 'unknown').slice(0, 256) }); }
  }
  const failed = cases.filter(c => c.status === 'FAIL').length;
  process.stdout.write(JSON.stringify({ qualification: 'G1_RECORDED_ORDER_DELIVERY_APPLICATION_DATA', passed: cases.length - failed, failed, cases,
    nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0 }) + '\n');
  process.exitCode = failed ? 1 : 0;
}
