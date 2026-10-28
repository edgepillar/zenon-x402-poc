import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  claimPurchasedFulfillmentOwnership as claim,
  releasePurchasedFulfillmentOwnership as release,
  createPurchasedFulfillmentStatePort as statePort,
  inspectPurchasedFulfillmentEnvelope as inspect,
  requirePurchasedFulfillmentEnvelopeTransition as transition,
} from '../src/service-purchase-fulfillment-cas-contract.js';
import { createPurchasedServiceFulfillmentOwner as fulfillment, purchasedFulfillmentPolicyDigest, purchasedCompensationOriginalDigest } from '../src/service-purchase-fulfillment.js';
import { purchaseStorageFixture } from './service-purchase-original-storage.fixture.mjs';

// Actual ownership/session/fulfillment code; a synthetic atomic envelope backend
// and selected original/verifier ports. This does not import node:sqlite.
const cases = [];
const check = (id, run) => { run(); cases.push({ id, status: 'PASS' }); };
const casError = name => error => error?.code === 'FULFILLMENT_CAS_' + name;
const ownerError = name => error => error?.code === 'PURCHASE_FULFILLMENT_' + name;
function checksum(recordJson) { return 'sha256:' + createHash('sha256').update('zenon-x402:fulfillment-cas-record:v1\0').update(recordJson).digest('hex'); }
function changed(raw, changeRecord = null, changeEnvelope = null) {
  const e = JSON.parse(raw); e.revision++;
  if (changeRecord) { const r = JSON.parse(e.recordJson); changeRecord(r); e.recordJson = JSON.stringify(r); e.recordDigest = checksum(e.recordJson); }
  changeEnvelope?.(e); return JSON.stringify(e);
}
function harness() {
  const policyJson = JSON.stringify({ version: 1, quantityUnit: 'api-call', offerExpiresAtMs: 100,
    reservationExpiresAtMs: 200, maximumDeliveries: 8, compensationRule: 'PRO_RATA_CEILING_ATOMIC_V1' });
  const conditions = purchasedFulfillmentPolicyDigest(policyJson).slice(7);
  const first = purchaseStorageFixture({ conditions }), second = purchaseStorageFixture({ conditions, requestId: 'request.storage.2' });
  const originals = new Map([[first.requestId, first], [second.requestId, second]]), rows = new Map(), accepted = new Map();
  const calls = { reads: 0, writes: 0, funding: 0, delivery: 0, compensation: 0, closes: 0 };
  let mode = 'normal', afterWrite = null;
  const backend = { readEnvelope(orderId) { calls.reads++; return rows.get(orderId) ?? null; },
    compareAndSwapEnvelope(orderId, expected, proposed) {
      calls.writes++; transition(expected, proposed);
      if (mode === 'conflict' || (rows.get(orderId) ?? null) !== expected) return null;
      rows.set(orderId, proposed); afterWrite?.();
      if (mode === 'lostAck') throw Error('private synthetic storage reply lost');
      return mode === 'booleanAck' ? true : proposed;
    }, close() { calls.closes++; } };
  const originalStore = { readOriginal(orderId, requestId, termsDigest, recordDigest, pinsJson) {
    const f = originals.get(requestId);
    return f && f.orderId === orderId && f.termsDigest === termsDigest && f.recordDigest === recordDigest && f.paymentPinsJson === pinsJson
      ? { recordJson: f.recordJson, recordDigest: f.recordDigest } : null;
  } };
  function verify(kind, candidate, ctx) {
    calls[kind]++; assert.ok(Object.isFrozen(ctx)); const raw = accepted.get(kind + ':' + candidate);
    if (!raw) throw Error('private unverified synthetic candidate'); return raw;
  }
  const verifier = { verifyFunding: (c, x) => verify('funding', c, x), verifyDelivery: (c, x) => verify('delivery', c, x),
    verifyCompensation: (c, x) => verify('compensation', c, x) };
  function proof(kind, name, value) { accepted.set(kind + ':' + name, JSON.stringify(value)); return name; }
  function makeOwner(port) { return fulfillment(first.recordJson, first.recordDigest, first.paymentPinsJson,
    first.termsDigest, policyJson, { originalStore, stateStore: port, verifier, clock: () => 300 }); }
  function acquire(ownerId = 'worker.1') {
    const result = claim('store.synthetic.1', first.orderId, backend.readEnvelope(first.orderId), ownerId, backend);
    const port = statePort(result.ownerTokenJson, backend); return { ...result, port, owner: makeOwner(port) };
  }
  function fund(o) {
    const r = JSON.parse(o.exportRecord()); return o.recordFunding(proof('funding', 'funding', {
      version: 1, kind: 'ZENON_EXACT_FUNDING_V1', paymentScope: r.paymentScope,
      termsDigest: first.termsDigest, evidenceId: 'funding.evidence', paymentAtMs: 150 }));
  }
  function ready(funded = true) { const a = acquire(); a.owner.recover(); if (funded) fund(a.owner); return a; }
  function begin(o, f = first, deliveryId = 'delivery.1', quantity = 1) {
    return o.beginDelivery(f.recordJson, f.recordDigest, f.paymentPinsJson, deliveryId, quantity);
  }
  function delivery(o, status = 'UNKNOWN', evidenceId = 'delivery.evidence.a', deliveryId = 'delivery.1') {
    const d = JSON.parse(o.exportRecord()).deliveries.find(d => d.deliveryId === deliveryId);
    const p = { version: 1, kind: 'EXACT_SERVICE_DELIVERY_V1', deliveryId, requestScope: d.requestScope,
      originalDigest: d.originalDigest, quantity: d.quantity, status,
      resultDigest: status === 'DELIVERED' ? 'sha256:' + 'd'.repeat(64) : null, evidenceId };
    return o.recordDelivery(deliveryId, proof('delivery', evidenceId, p));
  }
  function compensate(o) {
    const r = JSON.parse(o.exportRecord()), quantity = o.read().quantityOwed;
    const originalJson = JSON.stringify({ version: 1, kind: 'ZENON_COMPENSATION_ORIGINAL_V1', compensationId: 'compensation.1',
      termsDigest: first.termsDigest, paymentScope: r.paymentScope, network: 'zenon:mock', asset: 'zts1syntheticasset',
      payee: 'z1syntheticpayer', quantity, amountAtomic: String(quantity * 10), transactionHash: 'f'.repeat(64),
      originalBytesBase64: Buffer.from('synthetic retained compensation').toString('base64') });
    o.retainCompensation(originalJson, purchasedCompensationOriginalDigest(originalJson)); return originalJson;
  }
  return { backend, calls, first, second, acquire, ready, makeOwner, fund, begin, delivery, compensate,
    get row() { return rows.get(first.orderId) ?? null; }, set row(raw) { rows.set(first.orderId, raw); },
    set mode(value) { mode = value; }, set afterWrite(value) { afterWrite = value; } };
}

check('CLAIM-IS-EXPLICIT-AND-DOES-NOT-CREATE-A-FULFILLMENT-OR-PAYMENT', () => {
  const h = harness(), a = h.acquire(), e = inspect(h.row); assert.equal(e.epoch, 1); assert.equal(e.revision, 1);
  assert.equal(e.recordJson, null); assert.equal(h.calls.funding, 0); assert.equal(h.calls.delivery, 0);
  assert.equal(a.port.snapshot().loaded, false); assert.equal(a.authority, 'NONE'); assert.equal(a.physicalRelease, 'NOT_QUALIFIED');
});
check('ACTUAL-FULFILLMENT-OWNER-WRITES-THROUGH-THE-VERSIONED-STATE-PORT', () => {
  const h = harness(), a = h.ready(); assert.equal(inspect(h.row).revision, 3);
  assert.equal(a.owner.read().quantityOwed, 10); assert.equal(a.owner.read().paymentWasLate, true);
  assert.equal(inspect(h.row).recordJson, a.owner.exportRecord()); assert.equal(a.port.snapshot().revision, 3);
});
check('DISTINCT-ORIGINAL-DELIVERIES-SHARE-ONE-FENCED-PURCHASE', () => {
  const h = harness(), a = h.ready(); h.begin(a.owner); h.begin(a.owner, h.second, 'delivery.2', 2);
  h.delivery(a.owner, 'DELIVERED', 'delivery.evidence.1'); h.delivery(a.owner, 'DELIVERED', 'delivery.evidence.2', 'delivery.2');
  assert.equal(a.owner.read().deliveredQuantity, 3); assert.equal(a.owner.read().quantityOwed, 7);
  assert.equal(inspect(h.row).epoch, 1); assert.equal(inspect(h.row).revision, 7);
});
check('EXPLICIT-HANDOFF-PRESERVES-THE-EXACT-UNKNOWN-DELIVERY-RECORD', () => {
  const h = harness(), first = h.ready(); h.begin(first.owner); h.delivery(first.owner);
  const before = inspect(h.row), next = h.acquire('worker.2'), after = inspect(h.row);
  assert.equal(after.epoch, before.epoch + 1); assert.equal(after.revision, before.revision + 1);
  assert.equal(after.recordJson, before.recordJson); assert.equal(after.recordDigest, before.recordDigest);
  assert.equal(next.owner.recover().unresolvedDelivery, true);
  assert.equal(next.owner.read().quantityOwed, 10); assert.equal(h.calls.funding, 1);
});
check('STALE-WORKER-CANNOT-COMMIT-AFTER-OWNERSHIP-HANDOFF', () => {
  const h = harness(), first = h.ready(); h.begin(first.owner); const next = h.acquire('worker.2'); next.owner.recover();
  const retained = h.row; assert.throws(() => h.delivery(first.owner), ownerError('STATE_CONFLICT'));
  assert.equal(h.row, retained); assert.equal(first.owner.snapshot().unavailable, true); assert.equal(first.port.snapshot().unavailable, true);
});
check('REUSING-A-WORKER-NAME-STILL-RETIRES-THE-OLD-EPOCH', () => {
  const h = harness(), first = h.ready(); const next = h.acquire('worker.1');
  assert.equal(JSON.parse(next.ownerTokenJson).ownerId, JSON.parse(first.ownerTokenJson).ownerId);
  assert.equal(JSON.parse(next.ownerTokenJson).epoch, JSON.parse(first.ownerTokenJson).epoch + 1);
  next.owner.recover(); assert.throws(() => h.begin(first.owner), ownerError('STATE_CONFLICT'));
  assert.equal(JSON.parse(inspect(h.row).recordJson).deliveries.length, 0);
});
check('ABA-BUSINESS-JSON-CANNOT-BYPASS-THE-CACHED-ENVELOPE-REVISION', () => {
  const h = harness(), active = h.ready(); h.begin(active.owner); h.delivery(active.owner, 'UNKNOWN', 'evidence.a');
  const stalePort = statePort(active.ownerTokenJson, h.backend), stale = h.makeOwner(stalePort); stale.recover();
  const prior = inspect(h.row); h.delivery(active.owner, 'UNKNOWN', 'evidence.b'); h.delivery(active.owner, 'UNKNOWN', 'evidence.a');
  assert.equal(inspect(h.row).recordJson, prior.recordJson); assert.equal(inspect(h.row).revision, prior.revision + 2);
  const retained = h.row; assert.throws(() => h.delivery(stale, 'UNKNOWN', 'evidence.c'), ownerError('STATE_CONFLICT'));
  assert.equal(h.row, retained); assert.equal(stalePort.snapshot().unavailable, true);
});
check('LOST-CAS-ACK-RECOVERS-THE-SAME-FUNDED-STATE-WITHOUT-ANOTHER-VERIFIER-CALL', () => {
  const h = harness(), a = h.ready(false); h.mode = 'lostAck';
  assert.throws(() => h.fund(a.owner), ownerError('COMMIT_UNKNOWN'));
  assert.equal(a.port.snapshot().unavailable, true); assert.equal(a.owner.snapshot().unavailable, true);
  h.mode = 'normal'; const next = h.acquire('worker.2'); assert.equal(next.owner.recover().quantityOwed, 10);
  assert.equal(h.calls.funding, 1); assert.equal(next.owner.read().mayStartPayment, false);
});
check('MALFORMED-ACK-AFTER-COMMIT-IS-UNKNOWN-AND-DOES-NOT-ADVANCE-LOCAL-CACHE', () => {
  const h = harness(), a = h.ready(false), revision = a.port.snapshot().revision; h.mode = 'booleanAck';
  assert.throws(() => h.fund(a.owner), ownerError('COMMIT_UNKNOWN'));
  assert.equal(a.port.snapshot().revision, revision); assert.equal(inspect(h.row).revision, revision + 1);
  h.mode = 'normal'; const next = h.acquire('worker.2'); assert.equal(next.owner.recover().quantityOwed, 10);
});
check('LOST-COMPENSATION-ACK-PRESERVES-ORIGINAL-BYTES-ACROSS-A-NEW-OWNER', () => {
  const h = harness(), a = h.ready(); h.mode = 'lostAck';
  assert.throws(() => h.compensate(a.owner), ownerError('COMMIT_UNKNOWN'));
  const retained = JSON.parse(inspect(h.row).recordJson).compensation.originalJson; h.mode = 'normal';
  const next = h.acquire('worker.2'); assert.equal(next.owner.recover().compensationStatus, 'RETAINED');
  assert.equal(JSON.parse(next.owner.exportRecord()).compensation.originalJson, retained);
  assert.equal(h.calls.compensation, 0); assert.equal(next.owner.read().mayStartCompensation, false);
});
check('LOST-CLAIM-ACK-DOES-NOT-AUTOMATICALLY-ACQUIRE-OR-READ-AGAIN', () => {
  const h = harness(); h.mode = 'lostAck';
  assert.throws(() => claim('store.synthetic.1', h.first.orderId, null, 'worker.1', h.backend), casError('OWNERSHIP_ACK_UNKNOWN'));
  assert.equal(h.calls.writes, 1); assert.equal(h.calls.reads, 0); assert.equal(inspect(h.row).epoch, 1);
  h.mode = 'normal'; const next = h.acquire('worker.2'); assert.equal(JSON.parse(next.ownerTokenJson).epoch, 2);
});
check('LOGICAL-RELEASE-RETAINS-LIABILITY-AND-DOES-NOT-PROVE-PHYSICAL-RELEASE', () => {
  const h = harness(), a = h.ready(), before = inspect(h.row);
  const released = release(a.ownerTokenJson, h.row, h.backend), after = inspect(h.row);
  assert.equal(after.ownerId, null); assert.equal(after.epoch, before.epoch + 1); assert.equal(after.recordJson, before.recordJson);
  assert.equal(released.physicalRelease, 'NOT_QUALIFIED'); assert.equal(h.calls.closes, 0);
  assert.throws(() => h.begin(a.owner), ownerError('STATE_CONFLICT'));
  const next = h.acquire('worker.2'); assert.equal(next.owner.recover().quantityOwed, 10); assert.equal(inspect(h.row).epoch, 3);
});
check('STALE-RELEASE-CANNOT-RETIRE-A-NEWER-WORKER', () => {
  const h = harness(), a = h.ready(), old = h.row; h.acquire('worker.2'); const retained = h.row;
  assert.throws(() => release(a.ownerTokenJson, retained, h.backend), casError('FENCED'));
  assert.throws(() => release(a.ownerTokenJson, old, h.backend), casError('OWNERSHIP_CONFLICT')); assert.equal(h.row, retained);
});
check('FOREIGN-STORE-OR-EPOCH-TOKEN-IS-REFUSED-BEFORE-STATE-IS-EXPOSED', () => {
  const h = harness(), a = h.ready();
  for (const edit of [t => { t.storeId = 'foreign.store'; }, t => { t.ownerId = 'foreign.worker'; }, t => { t.epoch++; }]) {
    const token = JSON.parse(a.ownerTokenJson); edit(token); const port = statePort(JSON.stringify(token), h.backend);
    assert.throws(() => port.load(h.first.orderId), casError('FENCED')); assert.equal(port.snapshot().unavailable, true);
  }
});
check('AN-EMPTY-SLOT-CANNOT-SKIP-THE-UNFUNDED-INITIAL-RECORD', () => {
  const h = harness(), a = h.ready(), funded = a.owner.exportRecord();
  const b = h.acquire('worker.2'), e = inspect(h.row);
  const empty = JSON.stringify({ ...e, recordJson: null, recordDigest: null });
  const injected = JSON.stringify({ ...e, revision: e.revision + 1, recordJson: funded, recordDigest: checksum(funded) });
  assert.throws(() => transition(empty, injected), casError('INITIAL_RECORD_NOT_EMPTY')); assert.ok(b.ownerTokenJson);
});
check('STORAGE-TRANSITIONS-CANNOT-ERASE-FUNDING-OR-CHANGE-ORDER-BINDING', () => {
  const h = harness(); h.ready(); const before = h.row;
  assert.throws(() => transition(before, changed(before, r => { r.fundingJson = null; })), casError('RECORD_BINDING_CHANGED'));
  assert.throws(() => transition(before, changed(before, r => { r.termsDigest = 'sha256:' + 'c'.repeat(64); })), casError('RECORD_BINDING_CHANGED'));
  assert.throws(() => transition(before, changed(before, null, e => { e.storeId = 'other.store'; })), casError('ENVELOPE_BINDING_CHANGED'));
  assert.equal(h.row, before);
});
check('DELIVERY-HISTORY-AND-TERMINAL-RESULT-CANNOT-BE-REPLACED', () => {
  const h = harness(), a = h.ready(); h.begin(a.owner); h.delivery(a.owner, 'DELIVERED'); const before = h.row;
  assert.throws(() => transition(before, changed(before, r => { r.deliveries = []; })), casError('DELIVERY_REMOVAL'));
  assert.throws(() => transition(before, changed(before, r => { r.deliveries[0].quantity++; })), casError('DELIVERY_REPLACEMENT'));
  assert.throws(() => transition(before, changed(before, r => { r.deliveries[0].status = 'UNKNOWN'; })), casError('TERMINAL_DELIVERY_CHANGED'));
});
check('COMPENSATION-ORIGINAL-CANNOT-BE-REMOVED-OR-REPLACED', () => {
  const h = harness(), a = h.ready(); h.compensate(a.owner); const before = h.row;
  assert.throws(() => transition(before, changed(before, r => { r.compensation = null; })), casError('COMPENSATION_REPLACEMENT'));
  assert.throws(() => transition(before, changed(before, r => { r.compensation.originalDigest = 'sha256:' + 'c'.repeat(64); })), casError('COMPENSATION_REPLACEMENT'));
});
check('COUNTER-EXHAUSTION-REFUSES-WRITES-INSTEAD-OF-WRAPPING', () => {
  const h = harness(), a = h.ready(), e = inspect(h.row);
  const raw = JSON.stringify({ ...e, epoch: Number.MAX_SAFE_INTEGER, revision: Number.MAX_SAFE_INTEGER }), count = h.calls.writes;
  assert.throws(() => claim(e.storeId, e.orderId, raw, 'worker.2', h.backend), casError('VERSION_EXHAUSTED'));
  assert.equal(h.calls.writes, count); assert.ok(a.ownerTokenJson);
});
check('CORRUPT-OR-NONCANONICAL-ENVELOPE-IS-HELD-WITHOUT-REPAIR', () => {
  const h = harness(), a = h.ready(); h.row = ' ' + h.row; const before = h.row, count = h.calls.writes;
  const port = statePort(a.ownerTokenJson, h.backend); assert.throws(() => port.load(h.first.orderId), casError('CORRUPT'));
  assert.equal(port.snapshot().unavailable, true); assert.equal(h.row, before); assert.equal(h.calls.writes, count);
});
check('SESSION-LOAD-CANNOT-SILENTLY-REFRESH-A-STALE-CAS-BASELINE', () => {
  const h = harness(), a = h.ready(), revision = a.port.snapshot().revision;
  assert.throws(() => a.port.load(h.first.orderId), casError('ALREADY_LOADED')); assert.equal(a.port.snapshot().revision, revision);
  const unopened = statePort(a.ownerTokenJson, h.backend);
  assert.throws(() => unopened.compareAndSwap(h.first.orderId, null, a.owner.exportRecord()), casError('RECOVERY_REQUIRED'));
});
check('CLOSE-DURING-CAS-CANNOT-RETURN-A-CLEAN-ACKNOWLEDGEMENT', () => {
  const h = harness(), a = h.ready(false); h.afterWrite = () => a.port.close();
  assert.throws(() => h.fund(a.owner), ownerError('COMMIT_UNKNOWN'));
  assert.equal(a.port.snapshot().closed, true); assert.equal(a.port.snapshot().unavailable, true); assert.equal(h.calls.closes, 0);
  h.afterWrite = null; const next = h.acquire('worker.2'); assert.equal(next.owner.recover().quantityOwed, 10);
});
check('BORROWED-BACKEND-ACCESSORS-ARE-NOT-EXECUTED-DURING-ADMISSION', () => {
  const h = harness(), a = h.ready(); let calls = 0;
  const bad = { readEnvelope: h.backend.readEnvelope, get compareAndSwapEnvelope() { calls++; return h.backend.compareAndSwapEnvelope; } };
  assert.throws(() => statePort(a.ownerTokenJson, bad), casError('INVALID_INPUT')); assert.equal(calls, 0);
  a.owner.close(); a.port.close(); assert.equal(h.calls.closes, 0);
});

console.log(JSON.stringify({ qualification: 'FULFILLMENT_FENCED_CAS_DATA_COMPOSITION', cases, passed: cases.length, failed: 0,
  actualFulfillmentOwnerAndStatePort: true, atomicEnvelopeBackend: 'SYNTHETIC', verifierAndOriginalStore: 'SYNTHETIC',
  nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, payouts: 0,
  actualProcessInterruption: 0, nativeSQLiteAdapter: 'NOT_EXECUTED', physicalRelease: 'NOT_QUALIFIED', fullP1P2Acceptance: 'OPEN' }));
