import assert from 'node:assert/strict';
import {
  snapshotPurchasedServiceTerms,
  requireSamePurchasedServiceTerms,
} from '../src/service-purchase-terms.js';

// Synthetic metadata only. No SDK, store, key, signature, network or work search.
const terms = {
  termsVersion: 1,
  orderId: 'order.synthetic.1',
  productId: 'metered-api.v1',
  beneficiary: 'beneficiary.synthetic.1',
  holder: 'holder.synthetic.1',
  price: { asset: 'ZNN', unit: 'znn-atomic', amount: '100000000' },
  quantity: 10,
  network: 'zenon:synthetic:current-rules',
  conditionsDigest: 'sha256:' + 'a'.repeat(64),
};
const text = JSON.stringify(terms);
const rejected = error => error?.code === 'service_purchase_terms_rejected';
const conflict = error => error?.code === 'service_purchase_terms_conflict';
const cases = [];
function check(id, run) { run(); cases.push({ id, status: 'PASS' }); }
function changed(edit) { const copy = JSON.parse(text); edit(copy); return JSON.stringify(copy); }

check('ORDER-CANONICAL-ROUNDTRIP', () => {
  assert.equal(JSON.stringify(snapshotPurchasedServiceTerms(text)), text);
  assert.equal(JSON.stringify(requireSamePurchasedServiceTerms(text, text)), text);
});
check('ORDER-SNAPSHOT-CANNOT-BE-MUTATED', () => {
  const snapshot = snapshotPurchasedServiceTerms(text);
  assert.throws(() => { snapshot.productId = 'different'; }, TypeError);
  assert.throws(() => { snapshot.price.amount = '1'; }, TypeError);
  assert.equal(JSON.stringify(snapshot), text);
});
for (const [field, value] of [
  ['orderId', 'order.synthetic.2'], ['productId', 'metered-api.v2'],
  ['beneficiary', 'beneficiary.synthetic.2'], ['holder', 'holder.synthetic.2'],
  ['quantity', 11], ['network', 'zenon:synthetic:dp-rules'],
  ['conditionsDigest', 'sha256:' + 'b'.repeat(64)],
]) check('ORDER-IMMUTABLE-' + field, () => {
  assert.throws(() => requireSamePurchasedServiceTerms(text, changed(t => { t[field] = value; })), conflict);
});
for (const [field, value] of [['amount', '100000001'], ['asset', 'QSR'], ['unit', 'znn-display']]) {
  check('ORDER-IMMUTABLE-price.' + field, () => {
    assert.throws(() => requireSamePurchasedServiceTerms(text, changed(t => { t.price[field] = value; })), conflict);
  });
}
check('ORDER-PRICE-REPRESENTATIONS-ARE-NOT-ALIASES', () => {
  for (const amount of ['01', '0', '-1', '1.0', '1e8', ' 1', '1\n', 100000000, '1'.repeat(79)]) {
    assert.throws(() => snapshotPurchasedServiceTerms(changed(t => { t.price.amount = amount; })), rejected);
  }
});
check('ORDER-QUANTITY-MUST-BE-A-POSITIVE-SAFE-INTEGER', () => {
  for (const quantity of [0, -1, 0.5, '10', Number.MAX_SAFE_INTEGER + 1, null]) {
    assert.throws(() => snapshotPurchasedServiceTerms(changed(t => { t.quantity = quantity; })), rejected);
  }
});
check('ORDER-UNKNOWN-FIELDS-AND-VERSIONS-ARE-REJECTED', () => {
  for (const edit of [t => { t.refundAllowed = true; }, t => { t.termsVersion = 2; },
    t => { t.price.currency = 'ZNN'; }, t => { delete t.holder; }]) {
    assert.throws(() => snapshotPurchasedServiceTerms(changed(edit)), rejected);
  }
});
check('ORDER-TEXT-ALIASES-AND-DUPLICATE-FIELDS-ARE-REJECTED', () => {
  for (const alias of [' ' + text, JSON.stringify(terms, null, 2),
    text.replace('"quantity":10', '"quantity":10,"quantity":10'),
    text.replace('"quantity":10', '"quantity":1e1')]) {
    assert.throws(() => snapshotPurchasedServiceTerms(alias), rejected);
  }
});
check('ORDER-IDENTIFIERS-ARE-BOUNDED-EXACT-TEXT', () => {
  for (const value of ['', 'holder.synthetic.1\n', 'https://synthetic.invalid', 'a'.repeat(129)]) {
    assert.throws(() => snapshotPurchasedServiceTerms(changed(t => { t.holder = value; })), rejected);
  }
});
check('ORDER-INPUT-AND-ERRORS-DO-NOT-CALL-USER-HOOKS', () => {
  let calls = 0;
  assert.throws(() => snapshotPurchasedServiceTerms({ toString() { calls++; return text; } }), rejected);
  assert.equal(calls, 0);
  assert.throws(() => snapshotPurchasedServiceTerms('x'.repeat(4097)), rejected);
  assert.throws(() => snapshotPurchasedServiceTerms('{}'), rejected);
});
console.log(JSON.stringify({
  qualification: 'DATA_COMPONENT_ONLY',
  cases,
  passed: cases.length,
  failed: 0,
  paymentVerification: 'NOT_PERFORMED',
  deliveryOrCompensation: 'NOT_ESTABLISHED',
  durableStoreIntegration: 'NOT_ESTABLISHED',
  nativeExecutions: 0,
}));
