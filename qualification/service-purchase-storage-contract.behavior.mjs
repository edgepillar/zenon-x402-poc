import assert from 'node:assert/strict';
import {
  purchasedTermsStorageDigest, capturePurchaseStorageTerms, capturePurchaseStorageOriginal,
  inspectStoredPurchaseOriginal, purchaseStorageLimits,
} from '../src/service-purchase-storage-contract.js';
import { purchaseStorageFixture } from './service-purchase-original-storage.fixture.mjs';

const cases = [];
function check(id, run) { run(); cases.push({ id, status: 'PASS' }); }
const capture = f => capturePurchaseStorageOriginal(f.recordJson, f.recordDigest, f.paymentPinsJson, f.termsDigest);
const rejected = work => assert.throws(work, TypeError);

check('CANONICAL-TERMS-HAVE-A-STABLE-INDEPENDENT-DIGEST', () => {
  const f = purchaseStorageFixture(), view = capturePurchaseStorageTerms(f.termsJson, f.termsDigest);
  assert.equal(view.orderId, f.orderId); assert.equal(view.termsJson, f.termsJson); assert.equal(view.termsDigest, f.termsDigest);
  assert.ok(Object.isFrozen(view)); assert.equal(purchasedTermsStorageDigest(f.termsJson), f.termsDigest);
});
check('CHANGED-CONDITIONS-CANNOT-REUSE-THE-ACCEPTED-TERMS-DIGEST', () => {
  const first = purchaseStorageFixture(), changed = purchaseStorageFixture({ conditions: 'c'.repeat(64) });
  rejected(() => capturePurchaseStorageTerms(changed.termsJson, first.termsDigest));
  rejected(() => capturePurchaseStorageOriginal(changed.recordJson, changed.recordDigest, changed.paymentPinsJson, first.termsDigest));
});
check('ONE-PAYMENT-SUPPORTS-DISTINCT-ORIGINAL-REQUEST-IDENTITIES', () => {
  const a = capture(purchaseStorageFixture()), b = capture(purchaseStorageFixture({ requestId: 'request.storage.2' }));
  assert.equal(a.paymentScope, b.paymentScope); assert.equal(a.paymentCheckpointJson, b.paymentCheckpointJson);
  assert.equal(a.grantId, b.grantId); assert.notEqual(a.requestScope, b.requestScope);
});
check('PAYMENT-UNIQUENESS-KEY-DOES-NOT-INCLUDE-ORDER-ID', () => {
  const a = capture(purchaseStorageFixture()), b = capture(purchaseStorageFixture({ orderId: 'order.storage.2' }));
  assert.notEqual(a.orderId, b.orderId); assert.equal(a.paymentScope, b.paymentScope);
});
check('PAYMENT-KEY-MATCHES-EXACT-HASH-NOT-AMOUNT', () => {
  const a = capture(purchaseStorageFixture()), b = capture(purchaseStorageFixture({ paymentHash: 'e'.repeat(64) }));
  assert.notEqual(a.paymentScope, b.paymentScope);
});
check('CHAIN-IDENTITY-IS-PART-OF-THE-PAYMENT-KEY', () => {
  const a = capture(purchaseStorageFixture({ chainIdentifier: '100' }));
  const b = capture(purchaseStorageFixture({ chainIdentifier: '101' }));
  assert.notEqual(a.paymentScope, b.paymentScope); assert.notEqual(a.requestScope, b.requestScope);
});
check('SAME-REQUEST-ID-WITH-CHANGED-COST-STILL-CONFLICTS-ON-THE-KEY', () => {
  const a = capture(purchaseStorageFixture()), b = capture(purchaseStorageFixture({ maxCostUnits: 3 }));
  assert.equal(a.requestScope, b.requestScope); assert.notEqual(a.recordDigest, b.recordDigest);
});
check('CHANGED-GRANT-IS-NOT-A-DIFFERENT-PAYMENT', () => {
  const a = capture(purchaseStorageFixture()), b = capture(purchaseStorageFixture({ grantId: 'grant.storage.2' }));
  assert.equal(a.paymentScope, b.paymentScope); assert.notEqual(a.requestScope, b.requestScope);
});
check('CONTEXT-CHANGE-CANNOT-BE-HIDDEN-BY-THE-SAME-HASH', () => {
  const a = capture(purchaseStorageFixture()), b = capture(purchaseStorageFixture({ contextId: 'context.storage.2' }));
  assert.equal(a.paymentScope, b.paymentScope); assert.notEqual(a.paymentCheckpointJson, b.paymentCheckpointJson);
});
check('CORRUPTION-INSPECTION-DOES-NOT-INVENT-INDEPENDENT-AUTHORITY', () => {
  const f = purchaseStorageFixture(), trusted = capture(f), inspected = inspectStoredPurchaseOriginal(f.recordJson, f.recordDigest);
  assert.equal(trusted.independentPinsChecked, true); assert.equal(inspected.independentPinsChecked, false);
  assert.equal(inspected.paymentScope, trusted.paymentScope); assert.equal(inspected.recordJson, f.recordJson);
});
check('INDEPENDENT-PURCHASE-CHECKPOINT-AND-TERMS-PINS-ARE-REQUIRED', () => {
  const f = purchaseStorageFixture(), wrong = 'sha256:' + 'c'.repeat(64), pins = JSON.parse(f.paymentPinsJson);
  rejected(() => capturePurchaseStorageOriginal(f.recordJson, wrong, f.paymentPinsJson, f.termsDigest));
  rejected(() => capturePurchaseStorageOriginal(f.recordJson, f.recordDigest, f.paymentPinsJson, wrong));
  pins.digests.context = 'c'.repeat(64);
  rejected(() => capturePurchaseStorageOriginal(f.recordJson, f.recordDigest, JSON.stringify(pins), f.termsDigest));
});
check('LIMITS-ARE-EXPLICIT-BOUNDED-SNAPSHOTS', () => {
  const input = { maxOrders: 2, maxOriginals: 4 }, result = purchaseStorageLimits(input);
  input.maxOrders = 999; assert.deepEqual(result, { maxOrders: 2, maxOriginals: 4 }); assert.ok(Object.isFrozen(result));
  for (const value of [{}, { maxOrders: 0, maxOriginals: 4 }, { maxOrders: 2, maxOriginals: 4097 },
    { maxOrders: 2, maxOriginals: 4, ttl: 1 }]) rejected(() => purchaseStorageLimits(value));
});
check('INVALID-INPUTS-DO-NOT-INVOKE-ACCESSORS-OR-CONVERSIONS', () => {
  let calls = 0;
  rejected(() => purchasedTermsStorageDigest({ toString() { calls++; return '{}'; } }));
  rejected(() => purchaseStorageLimits({ get maxOrders() { calls++; return 2; }, maxOriginals: 4 }));
  assert.equal(calls, 0);
});
console.log(JSON.stringify({ qualification: 'PURCHASE_STORAGE_CONTRACT_DATA_ONLY', cases, passed: cases.length, failed: 0,
  nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0,
  durableStoreExecution: 'NOT_EXECUTED', paymentVerification: 'NOT_PERFORMED', delivery: 'NOT_ESTABLISHED' }));
