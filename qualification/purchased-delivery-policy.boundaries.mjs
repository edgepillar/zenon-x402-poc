// Policy bytes and actual memory owners only. No authenticated funding,
// native store, SDK, key, signature, nonce, listener or payment is exercised.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { purchasedFulfillmentPolicyDigest as digest } from '../src/service-purchase-fulfillment.js';
import { capturePurchasedOrderPayment } from '../src/service-purchase-order-funding.js';
import { createPurchasedOrderFulfillmentOwner } from '../src/service-purchase-order-fulfillment.js';
import { recordedDeliveryLedgerFixture } from './recorded-delivery-ledger.fixture.mjs';
import { recordedDeliveryFixture, orderFundingOwnerInputs as inputs, NOW } from './service-purchase-order-recorded-delivery.fixture.mjs';

const checks = [];
function check(id, run) { checks.push({ id, run }); }
function policy(maximumDeliveries) { return JSON.stringify({ version: 1, quantityUnit: 'api-call', offerExpiresAtMs: 100,
  reservationExpiresAtMs: 200, maximumDeliveries, compensationRule: 'PRO_RATA_CEILING_ATOMIC_V1' }); }

check('delivery-policy-existing-sixty-four-byte-digest-is-unchanged', () => {
  // Independently computed Python SHA-256 vector for the unchanged domain and
  // exact canonical policy text. This is a checksum, not authentication.
  assert.equal(digest(policy(64)), 'sha256:81ca223e9e174534c6ac11f6e297f04ad1571cd46d3a1d182e37ea9230dffcd1');
});
check('delivery-policy-sixty-five-one-hundred-and-one-twenty-eight-are-admitted', () => {
  const expected = [
    [65, 'sha256:50edf4159b45abc7eba5129608f94d44721d1b6abdb9f7e9eb67fd6867b87674'],
    [100, 'sha256:3998337dcbba7c22e1a4f8dcca2912020121c8c8e03a8ac2c571ec4455ed3f9d'],
    [128, 'sha256:5ca63fbfb51f72d610d154f4f56656a299faf1bca1706405d4f8fa7f980710d6'],
  ];
  for (const [count, value] of expected) assert.equal(digest(policy(count)), value);
});
check('delivery-policy-invalid-and-above-one-twenty-eight-counts-remain-refused', () => {
  for (const count of [0, -1, 129, Number.MAX_SAFE_INTEGER, 1.5, '100', null]) assert.throws(() => digest(policy(count)));
  assert.throws(() => recordedDeliveryFixture({ maximumDeliveries: 129 }));
});
check('delivery-policy-larger-admission-does-not-accept-numeric-or-json-aliases', () => {
  const raw = policy(100);
  assert.throws(() => digest(raw.replace('"maximumDeliveries":100', '"maximumDeliveries":1e2')));
  assert.throws(() => digest(' ' + raw));
  assert.throws(() => digest(raw.replace('"version":1,', '"version":1,"version":1,')));
});
check('delivery-policy-existing-sixty-four-order-still-denies-its-sixty-fifth-delivery', async () => {
  const h = recordedDeliveryLedgerFixture({ maximumDeliveries: 64 }), owner = await h.ready();
  for (let i = 0; i < 64; i++) {
    const original = h.original('policy.request.' + i), id = 'policy.delivery.' + i;
    owner.beginDelivery(original.recordJson, original.recordDigest, id, 1);
    h.execute(original); owner.recordDelivery(id, original.recordDigest);
  }
  const extra = h.original('policy.request.64'), before = h.journal, state = JSON.stringify(h.model.exportState());
  assert.throws(() => owner.beginDelivery(extra.recordJson, extra.recordDigest, 'policy.delivery.64', 1), /DELIVERY_LIMIT/);
  assert.equal(h.journal, before); assert.equal(JSON.stringify(h.model.exportState()), state);
  assert.equal(owner.read().deliveredQuantity, 64); assert.equal(owner.read().quantityOwed, 36);
  assert.equal(h.calls.debit, 64); assert.equal(h.calls.execute, 64); assert.equal(h.calls.funding, 1);
  owner.close(); h.d.close(); await h.funding.close();
});
check('delivery-policy-new-context-cannot-upgrade-independently-pinned-old-terms', () => {
  const f = recordedDeliveryFixture({ maximumDeliveries: 64 }), context = JSON.parse(f.fundingContextJson);
  const rules = JSON.parse(context.policyJson); rules.maximumDeliveries = 128; context.policyJson = JSON.stringify(rules);
  assert.throws(() => capturePurchasedOrderPayment(f.termsJson, f.termsDigest, f.paymentCheckpointJson,
    f.paymentPinsJson, JSON.stringify(context)), /TERMS_CONFLICT/);
  const terms = JSON.parse(f.termsJson); terms.conditionsDigest = digest(context.policyJson);
  assert.throws(() => capturePurchasedOrderPayment(JSON.stringify(terms), f.termsDigest, f.paymentCheckpointJson,
    f.paymentPinsJson, JSON.stringify(context)), /TERMS_CONFLICT/);
});
check('delivery-policy-recovery-does-not-rewrite-an-old-sixty-four-order-as-one-twenty-eight', async () => {
  const h = recordedDeliveryLedgerFixture({ maximumDeliveries: 64 }), old = await h.ready(), before = h.journal;
  const next = recordedDeliveryFixture({ maximumDeliveries: 128 }); let writes = 0;
  const owner = createPurchasedOrderFulfillmentOwner(...inputs(next), { fundingStoreId: 'store.recorded.funding',
    fundingStore: h.fundingStore, originalStore: h.originalStore,
    stateStore: { load() { return before; }, compareAndSwap() { writes++; assert.fail('old record replacement is forbidden'); } },
    verifier: { verifyDelivery: h.d.verifyDelivery, verifyCompensation() { assert.fail('no compensation authentication selected'); } }, clock: () => NOW });
  assert.throws(() => owner.recover(), /CORRUPT/); assert.equal(owner.snapshot().held, true);
  assert.equal(writes, 0); assert.equal(h.journal, before); assert.equal(h.calls.funding, 1);
  old.close(); owner.close(); h.d.close(); await h.funding.close();
});

export const purchasedDeliveryPolicyBoundaryDataCases = Object.freeze([...checks]);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = [];
  for (const { id, run } of checks) {
    try { await run(); cases.push({ id, status: 'PASS' }); }
    catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.code ?? e?.message ?? 'unknown').slice(0, 256) }); }
  }
  const failed = cases.filter(c => c.status === 'FAIL').length;
  process.stdout.write(JSON.stringify({ qualification: 'G1_PURCHASED_DELIVERY_POLICY_128_DATA', passed: cases.length - failed, failed, cases,
    nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0 }) + '\n');
  process.exitCode = failed ? 1 : 0;
}
