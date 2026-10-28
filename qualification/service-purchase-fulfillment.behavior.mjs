import assert from 'node:assert/strict';
import {
  createPurchasedServiceFulfillmentOwner as create,
  purchasedFulfillmentPolicyDigest as policyDigest,
  purchasedCompensationOriginalDigest as compensationDigest,
} from '../src/service-purchase-fulfillment.js';
import { purchasedTermsStorageDigest } from '../src/service-purchase-storage-contract.js';
import { capturePurchasedServiceOriginal } from '../src/service-credit-purchased-original-recovery.js';
import { purchaseStorageFixture } from './service-purchase-original-storage.fixture.mjs';

// Real pure codecs and owner, synthetic selected verifier/CAS/original-store
// ports. No SDK, SQL, socket, key, signature, nonce search or payout callback.
const cases = [];
const check = (id, work) => { work(); cases.push({ id, status: 'PASS' }); };
const code = suffix => error => error?.code === 'PURCHASE_FULFILLMENT_' + suffix;
function harness({ quantity = 10, maximumDeliveries = 8 } = {}) {
  let at = 300, row = null, commits = 0, mode = 'normal', afterCommit = null, afterFunding = null;
  const policy = { version: 1, quantityUnit: 'api-call', offerExpiresAtMs: 100, reservationExpiresAtMs: 200,
    maximumDeliveries, compensationRule: 'PRO_RATA_CEILING_ATOMIC_V1' };
  const policyJson = JSON.stringify(policy), conditions = policyDigest(policyJson).slice(7), originals = new Map(), proofs = new Map();
  const calls = { funding: 0, delivery: 0, compensation: 0, originalReads: 0, closes: 0 };
  function original(requestId = 'request.storage.1', extra = {}) {
    const f = purchaseStorageFixture({ requestId, conditions, ...extra });
    if (quantity !== 10) {
      const r = JSON.parse(f.recordJson), t = JSON.parse(f.termsJson); t.quantity = quantity;
      const termsJson = JSON.stringify(t), purchase = capturePurchasedServiceOriginal(termsJson,
        r.serviceRequestCustodyJson, r.paymentCheckpointJson, f.paymentPinsJson);
      return Object.freeze({ ...f, termsJson, termsDigest: purchasedTermsStorageDigest(termsJson), ...purchase });
    }
    return f;
  }
  const first = original(), second = original('request.storage.2');
  function retain(f) { originals.set(f.requestId, f); return f; }
  retain(first); retain(second);
  const originalStore = { readOriginal(orderId, requestId, termsDigest, recordDigest, pins) {
    calls.originalReads++; const f = originals.get(requestId);
    return f && f.orderId === orderId && f.termsDigest === termsDigest && f.recordDigest === recordDigest && f.paymentPinsJson === pins
      ? { recordJson: f.recordJson, recordDigest: f.recordDigest } : null;
  }, close() { calls.closes++; } };
  const stateStore = { load(orderId) { assert.equal(orderId, first.orderId); return row; },
    compareAndSwap(orderId, expected, next) {
      assert.equal(orderId, first.orderId); if (mode === 'conflict' || row !== expected) return null;
      row = next; commits++; afterCommit?.(); if (mode === 'lostAck') throw Error('private synthetic acknowledgement loss'); return next;
    }, close() { calls.closes++; } };
  function verify(kind, candidate, context) {
    calls[kind]++; assert.ok(Object.isFrozen(context)); const raw = proofs.get(kind + ':' + candidate);
    if (!raw) throw Error('private synthetic proof not accepted');
    if (kind === 'funding') afterFunding?.(); return raw;
  }
  const verifier = { verifyFunding: (candidate, ctx) => verify('funding', candidate, ctx),
    verifyDelivery: (candidate, ctx) => verify('delivery', candidate, ctx),
    verifyCompensation: (candidate, ctx) => verify('compensation', candidate, ctx) };
  function owner(f = first) { return create(f.recordJson, f.recordDigest, f.paymentPinsJson, f.termsDigest, policyJson,
    { originalStore, stateStore, verifier, clock: () => at }); }
  function proof(kind, name, value) { proofs.set(kind + ':' + name, JSON.stringify(value)); return name; }
  function fund(o, edit = null, name = 'fund') {
    const value = { version: 1, kind: 'ZENON_EXACT_FUNDING_V1', paymentScope: JSON.parse(o.exportRecord()).paymentScope,
      termsDigest: first.termsDigest, evidenceId: 'funding.evidence.1', paymentAtMs: 150 };
    edit?.(value); return o.recordFunding(proof('funding', name, value));
  }
  function begin(o, f = first, deliveryId = 'delivery.1', units = 1) {
    return o.beginDelivery(f.recordJson, f.recordDigest, f.paymentPinsJson, deliveryId, units);
  }
  function delivery(o, deliveryId = 'delivery.1', status = 'DELIVERED', edit = null, name = 'delivery.' + status) {
    const d = JSON.parse(o.exportRecord()).deliveries.find(d => d.deliveryId === deliveryId);
    const value = { version: 1, kind: 'EXACT_SERVICE_DELIVERY_V1', deliveryId, requestScope: d.requestScope,
      originalDigest: d.originalDigest, quantity: d.quantity, status,
      resultDigest: status === 'DELIVERED' ? 'sha256:' + 'd'.repeat(64) : null, evidenceId: 'delivery.evidence.' + status };
    edit?.(value); return o.recordDelivery(deliveryId, proof('delivery', name, value));
  }
  function compensation(o, edit = null) {
    const s = JSON.parse(o.exportRecord()), owed = o.read().quantityOwed;
    const value = { version: 1, kind: 'ZENON_COMPENSATION_ORIGINAL_V1', compensationId: 'compensation.1',
      termsDigest: first.termsDigest, paymentScope: s.paymentScope, network: 'zenon:mock', asset: 'zts1syntheticasset',
      payee: 'z1syntheticpayer', quantity: owed,
      amountAtomic: String((100n * BigInt(owed) + BigInt(quantity) - 1n) / BigInt(quantity)),
      transactionHash: 'f'.repeat(64), originalBytesBase64: Buffer.from('synthetic compensation original bytes').toString('base64') };
    edit?.(value); const originalJson = JSON.stringify(value); return { originalJson, originalDigest: compensationDigest(originalJson) };
  }
  function retainComp(o, c = compensation(o)) { o.retainCompensation(c.originalJson, c.originalDigest); return c; }
  function compResult(o, status = 'CONFIRMED', edit = null, name = 'comp.' + status) {
    const c = JSON.parse(o.exportRecord()).compensation, original = JSON.parse(c.originalJson);
    const value = { version: 1, kind: 'ZENON_EXACT_COMPENSATION_V1', compensationId: original.compensationId,
      originalDigest: c.originalDigest, transactionHash: original.transactionHash,
      paymentScope: original.paymentScope, status, evidenceId: 'compensation.evidence.' + status };
    edit?.(value); return o.recordCompensation(proof('compensation', name, value));
  }
  function ready(funded = true) { const o = owner(); o.recover(); if (funded) fund(o); return o; }
  return { owner, ready, first, second, original, retain, fund, begin, delivery, compensation, retainComp, compResult, calls, policyJson,
    originalStore, stateStore, verifier, proof,
    get row() { return row; }, set row(v) { row = v; }, get commits() { return commits; },
    set time(v) { at = v; }, set mode(v) { mode = v; }, set afterCommit(v) { afterCommit = v; }, set afterFunding(v) { afterFunding = v; } };
}

check('RECOVERY-AND-ACCEPTED-POLICY-ARE-REQUIRED-BEFORE-TRANSITIONS', () => {
  const h = harness(), o = h.owner(); assert.throws(() => o.recordFunding('candidate'), code('RECOVERY_REQUIRED'));
  assert.equal(h.commits, 0); assert.equal(h.calls.funding, 0); o.recover();
  assert.throws(() => o.recover(), code('ALREADY_RECOVERED'));
  const p = JSON.parse(h.policyJson); p.quantityUnit = 'different-unit';
  assert.throws(() => create(h.first.recordJson, h.first.recordDigest, h.first.paymentPinsJson, h.first.termsDigest,
    JSON.stringify(p), { originalStore: h.originalStore, stateStore: h.stateStore, verifier: h.verifier, clock: () => 300 }), code('POLICY_CONFLICT'));
});
check('EXPIRED-UNVERIFIED-PAYMENT-DOES-NOT-BECOME-A-DELIVERY-CLAIM', () => {
  const h = harness(), o = h.ready(false), s = o.read(); assert.equal(s.offerExpired, true); assert.equal(s.reservationExpired, true);
  assert.equal(s.liability, 'PAYMENT_NOT_VERIFIED'); assert.equal(s.deliveredQuantity, 0);
  assert.throws(() => h.begin(o), code('FUNDING_REQUIRED'));
  assert.throws(() => o.recordFunding('{"success":true}'), code('PROOF_REJECTED'));
});
check('LATE-VERIFIED-PAYMENT-CREATES-THE-FULL-OWED-QUANTITY', () => {
  const h = harness(), o = h.ready(), s = o.read(); assert.equal(s.paymentWasLate, true);
  assert.equal(s.quantityOwed, 10); assert.equal(s.deliveredQuantity, 0); assert.equal(s.compensatedQuantity, 0);
  assert.equal(s.liability, 'DELIVERY_OR_COMPENSATION_OWED');
});
check('OFFER-AND-RESERVATION-EXPIRY-CANNOT-ERASE-FUNDED-LIABILITY', () => {
  const h = harness(); h.time = 150; const o = h.ready(), raw = o.exportRecord(), count = h.commits;
  h.time = Number.MAX_SAFE_INTEGER; const s = o.read(); assert.equal(s.quantityOwed, 10); assert.equal(s.reservationExpired, true);
  assert.equal(o.exportRecord(), raw); assert.equal(h.commits, count);
});
check('FUNDING-IS-BOUND-TO-EXACT-CHAIN-PAYMENT-AND-TERMS', () => {
  const h = harness(), o = h.ready(false), before = o.exportRecord();
  for (const edit of [f => { f.paymentScope = 'sha256:' + 'c'.repeat(64); }, f => { f.termsDigest = 'sha256:' + 'c'.repeat(64); },
    f => { f.kind = 'LIGHTNING_CLAIM'; }, f => { f.paymentAtMs = 301; }]) {
    assert.throws(() => h.fund(o, edit), code('PROOF_REJECTED')); assert.equal(o.exportRecord(), before);
  }
});
check('EXACT-FUNDING-REPEAT-DOES-NOT-CREATE-ANOTHER-OBLIGATION', () => {
  const h = harness(), o = h.ready(), before = h.commits; assert.equal(h.fund(o).changed, false);
  assert.equal(h.commits, before); assert.equal(o.read().quantityOwed, 10);
  assert.throws(() => h.fund(o, f => { f.evidenceId = 'replacement.funding'; }), code('FUNDING_CONFLICT'));
});
check('ONE-PAYMENT-DELIVERS-SEVERAL-DISTINCT-ORIGINAL-REQUESTS', () => {
  const h = harness(), o = h.ready(); h.begin(o, h.first, 'delivery.1', 1); h.begin(o, h.second, 'delivery.2', 2);
  assert.equal(o.read().deliveredQuantity, 0); assert.equal(o.read().quantityOwed, 10);
  h.delivery(o, 'delivery.1'); const s = h.delivery(o, 'delivery.2');
  assert.equal(s.deliveredQuantity, 3); assert.equal(s.quantityOwed, 7); assert.equal(s.quantityUnit, 'api-call');
});
check('ORIGINAL-RETENTION-IS-CHECKED-BEFORE-A-DELIVERY-INTENT', () => {
  const h = harness(), o = h.ready(), before = o.exportRecord();
  const different = h.original('unretained.request');
  assert.throws(() => h.begin(o, different), code('ORIGINAL_NOT_RETAINED')); assert.equal(o.exportRecord(), before);
  const changedCost = h.original(h.first.requestId, { maxCostUnits: 3 });
  assert.throws(() => h.begin(o, changedCost), code('ORIGINAL_NOT_RETAINED'));
});
check('A-FOREIGN-GRANT-OR-PAYMENT-CANNOT-BECOME-THIS-DELIVERY', () => {
  const h = harness(), o = h.ready();
  for (const extra of [{ grantId: 'foreign.grant' }, { paymentHash: 'c'.repeat(64) }, { contextId: 'foreign.context' }]) {
    const f = h.retain(h.original('foreign.request', extra)); assert.throws(() => h.begin(o, f), code('ORIGINAL_CONFLICT'));
  }
  assert.equal(JSON.parse(o.exportRecord()).deliveries.length, 0);
});
check('REPEATED-DELIVERY-INTENT-DOES-NOT-AUTHORIZE-ANOTHER-EXECUTION', () => {
  const h = harness(), o = h.ready(); h.begin(o); const before = h.commits;
  assert.equal(h.begin(o).changed, false); h.delivery(o); assert.equal(h.begin(o).changed, false);
  assert.equal(h.commits, before + 1); assert.equal(o.read().mayDispatchService, false);
  assert.throws(() => h.begin(o, h.first, 'replacement.delivery'), code('DELIVERY_CONFLICT'));
});
check('UNKNOWN-DELIVERY-KEEPS-BOTH-QUANTITY-AND-COMPENSATION-HELD', () => {
  const h = harness(), o = h.ready(); h.begin(o, h.first, 'delivery.1', 10); const s = h.delivery(o, 'delivery.1', 'UNKNOWN');
  assert.equal(s.quantityOwed, 10); assert.equal(s.deliveredQuantity, 0); assert.equal(s.requiresReconciliation, true);
  assert.throws(() => h.begin(o, h.second, 'delivery.2'), code('QUANTITY_LIMIT'));
  const c = h.compensation(o); assert.throws(() => h.retainComp(o, c), code('COMPENSATION_CONFLICT'));
});
check('NOT-PERFORMED-RESOLVES-AN-UNKNOWN-WITHOUT-AUTOMATIC-REDISPATCH', () => {
  const h = harness(), o = h.ready(); h.begin(o, h.first, 'delivery.1', 10); h.delivery(o, 'delivery.1', 'UNKNOWN');
  h.delivery(o, 'delivery.1', 'NOT_PERFORMED'); const before = h.commits;
  assert.equal(h.begin(o, h.first, 'delivery.1', 10).changed, false); assert.equal(h.commits, before);
  assert.equal(h.begin(o, h.second, 'delivery.2', 10).quantityOwed, 10);
});
check('DECLARED-CACHED-SUCCESS-IS-NOT-DELIVERY-PROOF', () => {
  const h = harness(), o = h.ready(); h.begin(o);
  assert.throws(() => h.delivery(o, 'delivery.1', 'DELIVERED', p => { p.kind = 'CACHED_SUCCESS'; }), code('PROOF_REJECTED'));
  assert.equal(o.read().deliveredQuantity, 0); assert.equal(o.read().unresolvedDelivery, true);
});
check('DELIVERY-PROOF-CANNOT-CHANGE-ORIGINAL-QUANTITY-OR-RESULT', () => {
  const h = harness(), o = h.ready(); h.begin(o);
  for (const edit of [p => { p.originalDigest = 'sha256:' + 'c'.repeat(64); }, p => { p.quantity = 2; }, p => { p.resultDigest = null; }]) {
    assert.throws(() => h.delivery(o, 'delivery.1', 'DELIVERED', edit), code('PROOF_REJECTED'));
  }
  h.delivery(o); const before = o.exportRecord();
  assert.throws(() => h.delivery(o, 'delivery.1', 'UNKNOWN'), code('DELIVERY_CONFLICT'));
  assert.throws(() => h.delivery(o, 'delivery.1', 'DELIVERED', p => { p.resultDigest = 'sha256:' + 'e'.repeat(64); }), code('DELIVERY_CONFLICT'));
  assert.equal(o.exportRecord(), before); assert.equal(o.read().deliveredQuantity, 1);
});
check('QUANTITY-AND-ENTRY-LIMITS-REJECT-WITHOUT-CHANGING-THE-RECORD', () => {
  const h = harness({ maximumDeliveries: 1 }), o = h.ready(); h.begin(o);
  const before = o.exportRecord(); assert.throws(() => h.begin(o, h.second, 'delivery.2'), code('DELIVERY_LIMIT'));
  assert.equal(o.exportRecord(), before);
  for (const q of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => h.begin(o, h.first, 'delivery.1', q), code('INVALID_INPUT'));
});
check('PARTIAL-DELIVERY-COMPENSATION-USES-EXPLICIT-ATOMIC-CEILING-RULE', () => {
  const h = harness({ quantity: 3 }), o = h.ready(); h.begin(o); h.delivery(o);
  const c = h.compensation(o); assert.equal(JSON.parse(c.originalJson).amountAtomic, '67');
  assert.equal(JSON.parse(c.originalJson).quantity, 2);
  for (const amount of ['66', '68', '0.67']) {
    if (amount === '0.67') { assert.throws(() => h.compensation(o, c => { c.amountAtomic = amount; }), code('INVALID_INPUT')); continue; }
    assert.throws(() => h.retainComp(o, h.compensation(o, c => { c.amountAtomic = amount; })), code('COMPENSATION_CONFLICT'));
  }
  h.retainComp(o, c); assert.equal(o.read().quantityOwed, 2);
});
check('LOST-COMPENSATION-REPLY-PRESERVES-ONE-EXACT-ORIGINAL', () => {
  const h = harness(), o = h.ready(), c = h.retainComp(o); const s = h.compResult(o, 'UNKNOWN');
  assert.equal(s.quantityOwed, 10); assert.equal(s.compensationStatus, 'UNKNOWN'); assert.equal(s.requiresReconciliation, true);
  const before = h.commits; assert.equal(o.retainCompensation(c.originalJson, c.originalDigest).changed, false); assert.equal(h.commits, before);
  assert.throws(() => h.retainComp(o, h.compensation(o, c => { c.compensationId = 'compensation.2'; })), code('COMPENSATION_CONFLICT'));
  assert.throws(() => h.begin(o), code('COMPENSATION_ALREADY_RETAINED'));
});
check('CONFIRMED-ORIGINAL-COMPENSATION-SATISFIES-ONLY-REMAINING-QUANTITY', () => {
  const h = harness(), o = h.ready(); h.begin(o, h.first, 'delivery.1', 3); h.delivery(o); h.retainComp(o);
  const s = h.compResult(o); assert.equal(s.deliveredQuantity, 3); assert.equal(s.compensatedQuantity, 7);
  assert.equal(s.quantityOwed, 0); assert.equal(s.liability, 'SATISFIED');
  assert.equal(h.compResult(o).changed, false);
  assert.throws(() => h.compResult(o, 'UNKNOWN'), code('COMPENSATION_CONFLICT'));
});
check('COMPENSATION-CANNOT-SUBSTITUTE-PROOF-TYPE-TRANSACTION-OR-PAYEE', () => {
  const h = harness(), o = h.ready();
  assert.throws(() => h.retainComp(o, h.compensation(o, c => { c.payee = 'different.payee'; })), code('COMPENSATION_CONFLICT'));
  h.retainComp(o); const before = o.exportRecord();
  for (const edit of [p => { p.transactionHash = 'c'.repeat(64); }, p => { p.kind = 'LIGHTNING_DUPLICATE_SETTLEMENT'; },
    p => { p.originalDigest = 'sha256:' + 'c'.repeat(64); }]) {
    assert.throws(() => h.compResult(o, 'CONFIRMED', edit), code('PROOF_REJECTED')); assert.equal(o.exportRecord(), before);
  }
});
check('LOST-FUNDING-CAS-ACK-FENCES-OWNER-AND-RECOVERS-SAME-RECORD', () => {
  const h = harness(), o = h.ready(false); h.mode = 'lostAck';
  assert.throws(() => h.fund(o), code('COMMIT_UNKNOWN')); assert.equal(o.snapshot().unavailable, true);
  assert.throws(() => o.read(), code('HELD')); const count = h.calls.funding; h.mode = 'normal';
  const next = h.owner(), s = next.recover(); assert.equal(s.quantityOwed, 10); assert.equal(h.calls.funding, count);
  assert.equal(s.deliveredQuantity, 0); assert.equal(s.mayStartPayment, false);
});
check('LOST-COMPENSATION-CAS-ACK-CANNOT-CREATE-A-SECOND-PAYOUT', () => {
  const h = harness(), o = h.ready(), c = h.compensation(o); h.mode = 'lostAck';
  assert.throws(() => h.retainComp(o, c), code('COMMIT_UNKNOWN')); h.mode = 'normal';
  const next = h.owner(); assert.equal(next.recover().compensationStatus, 'RETAINED');
  assert.equal(next.retainCompensation(c.originalJson, c.originalDigest).changed, false);
  assert.throws(() => h.retainComp(next, h.compensation(next, c => { c.transactionHash = 'c'.repeat(64); })), code('COMPENSATION_CONFLICT'));
  assert.equal(next.read().mayStartCompensation, false); assert.equal(h.calls.compensation, 0);
});
check('STALE-OWNER-CAS-CONFLICT-DOES-NOT-OVERWRITE-NEWER-FUNDING', () => {
  const h = harness(), first = h.ready(false), stale = h.owner(); stale.recover(); h.fund(first); const retained = h.row;
  assert.throws(() => h.fund(stale), code('STATE_CONFLICT')); assert.equal(stale.snapshot().unavailable, true);
  assert.equal(h.row, retained); assert.equal(first.read().quantityOwed, 10);
});
check('CLOSE-DURING-COMMIT-KEEPS-ACK-UNCERTAINTY-AND-BORROWED-OWNERS', () => {
  const h = harness(), o = h.ready(false); h.afterCommit = () => o.close();
  assert.throws(() => h.fund(o), code('CLOSED')); assert.equal(o.snapshot().closed, true); assert.equal(o.snapshot().unavailable, true);
  assert.equal(h.calls.closes, 0); h.afterCommit = null;
  const next = h.owner(); assert.equal(next.recover().quantityOwed, 10); assert.equal(next.read().maySignPayment, false);
});
check('CORRUPT-OR-NONCANONICAL-STORED-STATE-IS-HELD-WITHOUT-REPAIR', () => {
  const h = harness(); h.ready(); h.row = ' ' + h.row; const original = h.row, count = h.commits, next = h.owner();
  assert.throws(() => next.recover(), code('CORRUPT')); assert.equal(next.snapshot().unavailable, true);
  assert.equal(h.row, original); assert.equal(h.commits, count);
});
check('ACCESSOR-PORTS-ARE-REFUSED-WITHOUT-CALLING-THE-GETTER', () => {
  const h = harness(); let reads = 0;
  const p = { originalStore: h.originalStore, stateStore: h.stateStore, verifier: h.verifier,
    get clock() { reads++; return () => 300; } };
  assert.throws(() => create(h.first.recordJson, h.first.recordDigest, h.first.paymentPinsJson, h.first.termsDigest, h.policyJson, p), code('INVALID_INPUT'));
  assert.equal(reads, 0); assert.equal(h.commits, 0);
});
check('NO-JOURNAL-RESULT-CREATES-ECONOMIC-OR-DISPATCH-AUTHORITY', () => {
  const h = harness(), o = h.ready(); h.retainComp(o); h.compResult(o);
  for (const flag of ['mayStartPayment', 'maySignPayment', 'mayDispatchService', 'mayStartCompensation']) assert.equal(o.read()[flag], false);
  assert.equal(o.read().authority, 'NONE'); o.close(); assert.equal(h.calls.closes, 0);
});

console.log(JSON.stringify({ qualification: 'PURCHASE_FULFILLMENT_DATA_PORT_COMPOSITION', cases, passed: cases.length, failed: 0,
  actualOwnerAndCodecs: true, verifierAndAtomicStorePorts: 'SYNTHETIC', nativeExecutions: 0,
  SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, payouts: 0,
  durableSQLiteIntegration: 'NOT_ESTABLISHED', nativeCrashRecovery: 'NOT_ESTABLISHED', production: 'NOT_ACCEPTED' }));
