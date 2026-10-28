import assert from 'node:assert/strict';
import {
  claimPurchasedOrderFulfillmentOwnership as claim, releasePurchasedOrderFulfillmentOwnership as release,
  createPurchasedOrderFulfillmentStatePort as statePort, inspectPurchasedOrderFulfillmentEnvelope as inspect,
  requirePurchasedOrderFulfillmentEnvelopeTransition as transition,
} from '../src/service-purchase-order-fulfillment-cas-contract.js';
import { orderFundingProof as fundingProof } from './service-purchase-order-fulfillment.fixture.mjs';
import { orderFulfillmentCasHarness as harness, repackOrderFulfillmentEnvelope as repack } from './service-purchase-order-fulfillment-cas.fixture.mjs';

// Actual order owner, exact custody/funding codecs, monotonic journal contract
// and fenced state port. Only atomic backend I/O and witness authentication are
// synthetic. This entry imports no native SQLite, TLS, SDK or key APIs.
const ownerError = suffix => e => e?.code === 'ORDER_FULFILLMENT_' + suffix;
const casError = suffix => e => e?.code === 'ORDER_FULFILLMENT_CAS_' + suffix;
const checks = [], cases = [];
function check(id, run) { checks.push({ id, run }); }
function record(h) { return JSON.parse(inspect(h.row).recordJson); }
function mutate(h, edit) { const r = record(h); edit(r); return repack(h.row, JSON.stringify(r)); }
check('claim-creates-only-an-empty-slot-and-state-port-requires-explicit-load', async () => {
  const h = harness(), a = h.acquire(); assert.equal(inspect(h.row).recordJson, null); assert.equal(h.calls.reads, 0);
  const before = h.calls.cas;
  assert.throws(() => a.port.compareAndSwap(h.p.orderId, h.p.paymentScope, null, '{}'), casError('RECOVERY_REQUIRED'));
  assert.equal(h.calls.cas, before); a.owner.recover(); assert.equal(record(h).fundingReceiptJson, null);
  assert.equal(a.port.snapshot().revision, 2);
});
check('actual-funding-owner-receipt-enters-grant-free-liability-through-the-fenced-port', async () => {
  const h = harness(), a = await h.ready(), s = a.owner.read(); assert.equal(s.quantityOwed, 10); assert.equal(s.grantSelectedForDelivery, false);
  assert.equal(h.calls.funding, 1); assert.equal(record(h).deliveries.length, 0); assert.equal(record(h).compensation, null);
  assert.equal(inspect(h.row).paymentScope, h.p.paymentScope); assert.equal(a.port.snapshot().authority, 'NONE');
});
check('partial-deliveries-and-exact-remaining-compensation-use-one-original-payment', async () => {
  const h = harness({ quantity: 3 }), a = await h.ready(); h.begin(a.owner); h.delivery(a.owner); const c = h.retain(a.owner);
  assert.equal(JSON.parse(c.originalJson).amountAtomic, '67'); h.compResult(a.owner, 'UNKNOWN'); assert.equal(a.owner.read().quantityOwed, 2);
  h.compResult(a.owner); assert.equal(a.owner.read().quantityOwed, 0); assert.equal(h.calls.funding, 1); assert.equal(h.calls.closes, 0);
});
check('same-worker-name-reacquisition-advances-epoch-without-changing-liability-bytes', async () => {
  const h = harness(), a = await h.ready(), before = inspect(h.row), b = h.acquire(); b.owner.recover(); const after = inspect(h.row);
  assert.equal(after.ownerId, before.ownerId); assert.equal(after.epoch, before.epoch + 1); assert.equal(after.revision, before.revision + 1);
  assert.equal(after.recordJson, before.recordJson); assert.equal(b.owner.read().quantityOwed, 10); assert.equal(h.calls.funding, 1); a.owner.close();
});
check('old-worker-cannot-overwrite-after-an-explicit-new-epoch', async () => {
  const h = harness(), a = await h.ready(), b = h.acquire('worker.fulfillment.2'); b.owner.recover(); const before = h.row;
  assert.throws(() => h.begin(a.owner), ownerError('COMMIT_UNKNOWN')); assert.equal(h.row, before);
  assert.equal(a.owner.snapshot().held, true); assert.equal(a.port.snapshot().held, true); assert.equal(b.owner.read().quantityOwed, 10);
});
check('same-epoch-aba-record-recurrence-does-not-defeat-envelope-revision-fencing', async () => {
  const h = harness(), a = await h.ready(); h.begin(a.owner); h.delivery(a.owner, 'delivery.1', 'UNKNOWN', v => { v.evidenceId = 'evidence.a'; });
  const stalePort = statePort(a.ownerTokenJson, h.journalBackend), stale = h.owner(stalePort); stale.recover(); const old = inspect(h.row);
  h.delivery(a.owner, 'delivery.1', 'UNKNOWN', v => { v.evidenceId = 'evidence.b'; });
  h.delivery(a.owner, 'delivery.1', 'UNKNOWN', v => { v.evidenceId = 'evidence.a'; });
  assert.equal(inspect(h.row).recordJson, old.recordJson); assert.equal(inspect(h.row).revision, old.revision + 2); const before = h.row;
  assert.throws(() => h.delivery(stale, 'delivery.1', 'UNKNOWN', v => { v.evidenceId = 'evidence.c'; }), ownerError('COMMIT_UNKNOWN'));
  assert.equal(h.row, before); assert.equal(stalePort.snapshot().held, true);
});
check('lost-funding-commit-acknowledgement-recovers-the-same-receipt-without-reauthentication', async () => {
  const h = harness(), a = await h.ready(false); await h.funding.verifyFunding(fundingProof()); h.mode = 'lostAck';
  assert.throws(() => a.owner.recordVerifiedFunding(), ownerError('COMMIT_UNKNOWN')); const receipt = record(h).fundingReceiptJson;
  assert.equal(a.port.snapshot().held, true); h.mode = 'normal'; const b = h.acquire('worker.recovery'); b.owner.recover();
  assert.equal(record(h).fundingReceiptJson, receipt); assert.equal(b.owner.read().quantityOwed, 10); assert.equal(h.calls.funding, 1);
});
check('lost-delivery-acknowledgement-does-not-remove-or-repeat-the-terminal-record', async () => {
  const h = harness(), a = await h.ready(); h.begin(a.owner); h.mode = 'lostAck'; assert.throws(() => h.delivery(a.owner), ownerError('COMMIT_UNKNOWN'));
  const retained = inspect(h.row).recordJson; h.mode = 'normal'; const b = h.acquire('worker.recovery'); b.owner.recover();
  assert.equal(b.owner.read().deliveredQuantity, 1); assert.equal(inspect(h.row).recordJson, retained); const before = h.calls.writes; h.delivery(b.owner);
  assert.equal(h.calls.writes, before);
});
check('lost-compensation-acknowledgement-preserves-the-exact-original-on-recovery', async () => {
  const h = harness(), a = await h.ready(), c = h.compensation(a.owner); h.mode = 'lostAck';
  assert.throws(() => h.retain(a.owner, c), ownerError('COMMIT_UNKNOWN')); assert.equal(record(h).compensation.originalJson, c.originalJson);
  h.mode = 'normal'; const b = h.acquire('worker.recovery'); b.owner.recover();
  assert.equal(b.owner.read().compensationStatus, 'RETAINED'); assert.equal(b.owner.read().quantityOwed, 10); assert.equal(h.calls.compensation, 0);
});
check('boolean-commit-acknowledgement-holds-without-advancing-the-local-port-cache', async () => {
  const h = harness(), a = await h.ready(), revision = a.port.snapshot().revision; h.mode = 'booleanAck';
  assert.throws(() => h.begin(a.owner), ownerError('COMMIT_UNKNOWN')); assert.equal(a.port.snapshot().revision, revision);
  assert.equal(inspect(h.row).revision, revision + 1); assert.equal(a.port.snapshot().held, true);
});
check('lost-claim-acknowledgement-does-not-read-or-acquire-again-automatically', async () => {
  const h = harness(); h.mode = 'lostAck'; assert.throws(() => h.acquire(), casError('OWNERSHIP_ACK_UNKNOWN'));
  assert.equal(h.calls.cas, 1); assert.equal(h.calls.reads, 0); assert.equal(inspect(h.row).epoch, 1);
  h.mode = 'normal'; const b = h.acquire('worker.recovery'); b.owner.recover(); assert.equal(inspect(h.row).epoch, 2);
});
check('logical-release-retains-liability-and-never-certifies-physical-release', async () => {
  const h = harness(), a = await h.ready(), before = inspect(h.row), out = release(a.ownerTokenJson, h.row, h.journalBackend);
  const released = inspect(h.row); assert.equal(released.ownerId, null); assert.equal(released.recordJson, before.recordJson);
  assert.equal(released.epoch, before.epoch + 1); assert.equal(out.physicalRelease, 'NOT_QUALIFIED'); assert.equal(h.calls.closes, 0);
  assert.throws(() => h.begin(a.owner), ownerError('COMMIT_UNKNOWN')); const b = h.acquire('worker.recovery'); b.owner.recover(); assert.equal(b.owner.read().quantityOwed, 10);
});
check('stale-release-cannot-retire-a-new-worker-even-with-the-same-worker-name', async () => {
  const h = harness(), a = await h.ready(), old = h.row; h.acquire(); const before = h.row;
  assert.throws(() => release(a.ownerTokenJson, before, h.journalBackend), casError('FENCED'));
  assert.throws(() => release(a.ownerTokenJson, old, h.journalBackend), casError('OWNERSHIP_CONFLICT')); assert.equal(h.row, before);
});
check('foreign-store-owner-epoch-or-scope-token-is-rejected-before-record-exposure', async () => {
  const h = harness(), a = await h.ready();
  for (const edit of [t => { t.storeId = 'foreign.store'; }, t => { t.ownerId = 'foreign.worker'; }, t => { t.epoch++; }, t => { t.paymentScope = 'sha256:' + 'a'.repeat(64); }]) {
    const t = JSON.parse(a.ownerTokenJson); edit(t); const p = statePort(JSON.stringify(t), h.journalBackend);
    assert.throws(() => p.load(t.orderId, t.paymentScope)); assert.equal(p.snapshot().held, true);
  }
});
check('port-binding-and-single-load-contracts-reject-before-another-backend-call', async () => {
  const h = harness(), a = await h.ready(), before = { ...h.calls };
  assert.throws(() => a.port.load(h.p.orderId, h.p.paymentScope), casError('ALREADY_LOADED'));
  assert.throws(() => a.port.load('other.order', h.p.paymentScope), casError('BINDING_CONFLICT'));
  assert.throws(() => a.port.compareAndSwap(h.p.orderId, 'sha256:' + 'a'.repeat(64), null, '{}'), casError('BINDING_CONFLICT'));
  assert.deepEqual(h.calls, before);
});
check('read-failure-holds-the-port-and-does-not-trigger-a-hidden-read-retry', async () => {
  const h = harness(), a = h.acquire(); h.mode = 'readThrows'; assert.throws(() => a.owner.recover(), ownerError('READ_UNKNOWN'));
  assert.equal(a.port.snapshot().held, true); assert.equal(h.calls.reads, 1); assert.throws(() => a.owner.recover(), ownerError('HELD')); assert.equal(h.calls.reads, 1);
});
check('corrupt-envelope-checksum-is-held-without-repairing-the-persisted-row', async () => {
  const h = harness(), a = await h.ready(), corrupted = JSON.parse(h.row); corrupted.recordDigest = 'sha256:' + 'a'.repeat(64); h.row = JSON.stringify(corrupted);
  const before = h.row, p = statePort(a.ownerTokenJson, h.journalBackend); assert.throws(() => p.load(h.p.orderId, h.p.paymentScope), casError('CORRUPT'));
  assert.equal(p.snapshot().held, true); assert.equal(h.row, before);
});
check('a-new-empty-slot-cannot-start-from-an-already-funded-record', async () => {
  const h = harness(), a = await h.ready(), e = JSON.parse(h.row); e.epoch = e.revision = 1;
  assert.throws(() => transition(null, JSON.stringify(e)), casError('INVALID_INITIAL_CLAIM'));
  e.recordJson = null; e.recordDigest = null; const empty = JSON.stringify(e); transition(null, empty);
  const funded = repack(empty, a.owner.exportRecord()); assert.throws(() => transition(empty, funded), casError('INITIAL_RECORD_NOT_EMPTY'));
});
check('immutable-funding-receipt-cannot-be-replaced-even-by-another-consistent-receipt', async () => {
  const h = harness(), a = await h.ready(), before = h.row;
  const next = mutate(h, r => { const receipt = JSON.parse(r.fundingReceiptJson); receipt.verificationObservedAtMs++; r.fundingReceiptJson = JSON.stringify(receipt); });
  inspect(next); assert.throws(() => transition(before, next), casError('FUNDING_REPLACEMENT')); assert.equal(h.row, before); a.owner.close();
});
check('stored-receipt-checksum-cannot-substitute-for-the-accepted-terms-digest', async () => {
  const h = harness(); await h.ready(); const next = mutate(h, r => { r.termsDigest = 'sha256:' + 'a'.repeat(64); });
  assert.throws(() => inspect(next));
});
check('delivery-tombstones-cannot-be-removed-reordered-or-rebound', async () => {
  const h = harness(), a = await h.ready(); h.begin(a.owner, 'request.1', 'delivery.1'); h.delivery(a.owner, 'delivery.1', 'NOT_PERFORMED');
  h.begin(a.owner, 'request.2', 'delivery.2'); const before = h.row;
  for (const edit of [r => { r.deliveries.shift(); }, r => { r.deliveries.reverse(); }, r => { r.deliveries[0].deliveryId = 'replacement.delivery';
    const p = JSON.parse(r.deliveries[0].proofJson); p.deliveryId = 'replacement.delivery'; r.deliveries[0].proofJson = JSON.stringify(p); }]) {
    assert.throws(() => transition(before, mutate(h, edit)));
  }
  assert.equal(h.row, before);
});
check('terminal-delivery-evidence-cannot-change-under-a-fresh-checksum', async () => {
  const h = harness(), a = await h.ready(); h.begin(a.owner); h.delivery(a.owner); const before = h.row;
  const next = mutate(h, r => { const d = r.deliveries[0], p = JSON.parse(d.proofJson); p.evidenceId = 'different.evidence'; d.proofJson = JSON.stringify(p); });
  inspect(next); assert.throws(() => transition(before, next), casError('TERMINAL_DELIVERY_CHANGED'));
});
check('unknown-delivery-cannot-return-to-unobserved-pending', async () => {
  const h = harness(), a = await h.ready(); h.begin(a.owner); h.delivery(a.owner, 'delivery.1', 'UNKNOWN'); const before = h.row;
  const next = mutate(h, r => { r.deliveries[0].status = 'PENDING'; r.deliveries[0].proofJson = null; });
  inspect(next); assert.throws(() => transition(before, next), casError('DELIVERY_DOWNGRADE'));
});
check('one-revision-cannot-bundle-funding-and-a-service-delivery-intent', async () => {
  const h = harness(), a = await h.ready(false), unfunded = h.row; await h.funding.verifyFunding(fundingProof()); a.owner.recordVerifiedFunding(); h.begin(a.owner);
  const bundled = repack(unfunded, a.owner.exportRecord()); inspect(bundled);
  assert.throws(() => transition(unfunded, bundled), casError('FUNDING_REPLACEMENT'));
});
check('one-revision-cannot-complete-two-service-deliveries', async () => {
  const h = harness(), a = await h.ready(); h.begin(a.owner, 'request.1', 'delivery.1'); h.begin(a.owner, 'request.2', 'delivery.2'); const before = h.row;
  h.delivery(a.owner, 'delivery.1'); h.delivery(a.owner, 'delivery.2'); const bundled = repack(before, a.owner.exportRecord());
  inspect(bundled); assert.throws(() => transition(before, bundled), casError('ONE_DELIVERY_TRANSITION_REQUIRED'));
});
check('compensation-original-and-confirmed-witness-cannot-be-replaced-or-downgraded', async () => {
  const h = harness(), a = await h.ready(); h.retain(a.owner); h.compResult(a.owner, 'UNKNOWN'); const unknown = h.row;
  const downgrade = mutate(h, r => { r.compensation.status = 'RETAINED'; r.compensation.proofJson = null; });
  inspect(downgrade); assert.throws(() => transition(unknown, downgrade), casError('COMPENSATION_DOWNGRADE'));
  const replacement = mutate(h, r => { const c = h.compensation(a.owner, v => { v.compensationId = 'replacement.original'; }); r.compensation = { ...c, status: 'RETAINED', proofJson: null }; });
  inspect(replacement); assert.throws(() => transition(unknown, replacement), casError('COMPENSATION_REPLACEMENT'));
  h.compResult(a.owner); const confirmed = h.row, changed = mutate(h, r => { const p = JSON.parse(r.compensation.proofJson); p.evidenceId = 'changed.evidence'; r.compensation.proofJson = JSON.stringify(p); });
  inspect(changed); assert.throws(() => transition(confirmed, changed), casError('COMPENSATION_DOWNGRADE'));
});
check('logical-state-noop-still-checks-the-complete-current-envelope', async () => {
  const h = harness(), a = await h.ready(), before = h.calls.writes, raw = inspect(h.row).recordJson;
  assert.equal(a.port.compareAndSwap(h.p.orderId, h.p.paymentScope, raw, raw), raw); assert.equal(h.calls.writes, before);
  h.acquire('worker.new'); const retained = h.row;
  assert.equal(a.port.compareAndSwap(h.p.orderId, h.p.paymentScope, raw, raw), null); assert.equal(a.port.snapshot().held, true); assert.equal(h.row, retained);
});
check('record-noop-cannot-burn-a-revision-or-mutate-bindings', async () => {
  const h = harness(); await h.ready(); const before = h.row, next = repack(before, inspect(before).recordJson);
  assert.throws(() => transition(before, next), casError('RECORD_CHANGE_REQUIRED'));
  for (const edit of [e => { e.storeId = 'different.store'; }, e => { e.orderId = 'different.order'; }, e => { e.paymentScope = 'sha256:' + 'a'.repeat(64); }])
    assert.throws(() => transition(before, repack(before, inspect(before).recordJson, edit)));
});
check('backend-global-payment-uniqueness-retains-released-slots-as-tombstones', async () => {
  const h = harness(), a = await h.ready(); release(a.ownerTokenJson, h.row, h.journalBackend); const before = h.row;
  assert.throws(() => claim(h.journalStoreId, 'another.order', h.p.paymentScope, null, 'worker.other', h.journalBackend), casError('OWNERSHIP_CONFLICT'));
  assert.equal(h.row, before); assert.equal(inspect(h.row).ownerId, null);
});
check('exhausted-epoch-or-revision-is-refused-without-a-backend-write', async () => {
  const h = harness(); await h.ready(); const e = JSON.parse(h.row); e.epoch = e.revision = Number.MAX_SAFE_INTEGER; const before = h.calls.cas;
  assert.throws(() => claim(h.journalStoreId, h.p.orderId, h.p.paymentScope, JSON.stringify(e), 'worker.next', h.journalBackend), casError('VERSION_EXHAUSTED'));
  assert.equal(h.calls.cas, before);
});
check('reentrant-port-close-after-cas-holds-the-owner-and-preserves-the-committed-row', async () => {
  const h = harness(), a = await h.ready(); h.afterWrite = () => a.port.close(); assert.throws(() => h.begin(a.owner), ownerError('COMMIT_UNKNOWN'));
  assert.equal(a.port.snapshot().closed, true); assert.equal(a.port.snapshot().held, true); assert.equal(record(h).deliveries.length, 1); assert.equal(h.calls.closes, 0);
});
check('cached-snapshots-and-owner-reads-do-not-refresh-or-revalidate-entire-stored-history', async () => {
  const h = harness(), a = await h.ready(); h.begin(a.owner); h.delivery(a.owner); const before = { ...h.calls }, validations = a.owner.snapshot().fullStateValidations;
  const revision = inspect(h.row).revision;
  for (let i = 0; i < 100; i++) { assert.equal(a.port.snapshot().revision, revision); assert.equal(a.owner.read().quantityOwed, 9); }
  assert.deepEqual(h.calls, before); assert.equal(a.owner.snapshot().fullStateValidations, validations);
});
check('closed-port-cannot-load-and-never-closes-the-borrowed-backend', async () => {
  const h = harness(), a = h.acquire(); a.port.close(); const before = { ...h.calls };
  assert.throws(() => a.port.load(h.p.orderId, h.p.paymentScope), casError('CLOSED')); assert.deepEqual(h.calls, before); assert.equal(h.calls.closes, 0);
});

for (const { id, run } of checks) {
  try { await run(); cases.push({ id, status: 'PASS' }); }
  catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.code ?? e?.message ?? e) }); }
}
const failed = cases.filter(c => c.status !== 'PASS').length;
console.log(JSON.stringify({ qualification: 'PURCHASE_ORDER_FULFILLMENT_FENCED_CAS_DATA', passed: cases.length - failed, failed, cases,
  actualOrderOwnerAndStatePort: true, selectedBackendAndWitnessAuthentication: 'SYNTHETIC_DATA', nativeExecutions: 0,
  SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, grants: 0, serviceExecutions: 0, payouts: 0,
  nativeDurability: 'NOT_ESTABLISHED', physicalResourceRelease: 'NOT_QUALIFIED', production: 'NOT_ACCEPTED' }));
if (failed) process.exitCode = 1;
