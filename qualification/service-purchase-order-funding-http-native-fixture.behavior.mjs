import assert from 'node:assert/strict';
import { capturePurchasedOrderPayment } from '../src/service-purchase-order-funding.js';
import { capturePurchasedOrderFundingHttpSelection } from '../src/service-purchase-order-funding-http-application.js';
import { nativeOrderFundingHttpFixture as fixture, orderFundingOwnerInputs as inputs, orderFundingProof as proof } from './service-purchase-order-funding-http-native.fixture.mjs';

const AT = 2_000_000_000_000, URL_A = 'https://127.0.0.1:49371/funding', URL_B = 'https://127.0.0.1:49372/funding';
const checks = [];
function check(id, run) { checks.push({ id, run }); }
check('loopback-fixture-captures-exact-resource-original-and-independent-pins', () => {
  const f = fixture('native.fixture.a', URL_A, AT), p = capturePurchasedOrderPayment(...inputs(f));
  assert.equal(p.independentPinsChecked, true); assert.equal(p.verifierContext.resourceUrl, URL_A);
  assert.equal(p.checkpoint.binding.origin, 'https://127.0.0.1:49371'); assert.equal(p.checkpoint.originalBytes.requestBody, '');
  assert.equal(p.checkpoint.binding.paymentHash, f.payload.payload.transaction.hash); assert.equal(f.verifiedRecord.expiresAt, AT + 10000);
});
check('different-native-port-has-a-different-original-payment-and-context', () => {
  const a = fixture('native.fixture.a', URL_A, AT), b = fixture('native.fixture.a', URL_B, AT);
  const p = capturePurchasedOrderPayment(...inputs(a)), q = capturePurchasedOrderPayment(...inputs(b));
  assert.notEqual(p.paymentScope, q.paymentScope); assert.notEqual(a.paymentCheckpointJson, b.paymentCheckpointJson);
  assert.notEqual(a.payload.payload.intentDigest, b.payload.payload.intentDigest); assert.notEqual(a.verifiedRecord.paymentResourceDigest, b.verifiedRecord.paymentResourceDigest);
});
check('independent-native-orders-do-not-reuse-one-synthetic-payment-hash', () => {
  const a = fixture('native.fixture.a', URL_A, AT), b = fixture('native.fixture.b', URL_A, AT);
  assert.notEqual(a.payload.payload.transaction.hash, b.payload.payload.transaction.hash);
  assert.notEqual(capturePurchasedOrderPayment(...inputs(a)).paymentScope, capturePurchasedOrderPayment(...inputs(b)).paymentScope);
});
check('non-loopback-noncanonical-and-unbounded-time-fixtures-are-refused', () => {
  for (const url of ['https://external.invalid:49371/funding', 'http://127.0.0.1:49371/funding', 'https://127.0.0.1:0/funding',
    'https://127.0.0.1:49371/funding?changed=1', 'https://127.0.0.1:49371/paid']) assert.throws(() => fixture('native.fixture.a', url, AT));
  for (const at of [-1, 0.5, Number.MAX_SAFE_INTEGER, NaN]) assert.throws(() => fixture('native.fixture.a', URL_A, at));
});
check('actual-http-selection-detaches-original-native-fixture-inputs-without-io', () => {
  const f = fixture('native.fixture.a', URL_A, AT);
  const purchase = Object.fromEntries(['termsJson', 'termsDigest', 'paymentCheckpointJson', 'paymentPinsJson', 'fundingContextJson'].map((name, i) => [name, inputs(f)[i]]));
  const input = { selection: { purchase, ownership: { storeId: 'store.native.fixture', ownerId: 'worker.native.fixture', expectedEnvelopeJson: null },
    maximumVerificationAttempts: 3, closeBudgetMs: 1000 }, fundingCandidateJson: proof() };
  const captured = capturePurchasedOrderFundingHttpSelection(input); purchase.paymentCheckpointJson = '{}';
  assert.equal(captured.selection.purchase.paymentCheckpointJson, f.paymentCheckpointJson); assert.equal(captured.selection.closeBudgetMs, 1000);
  assert.equal(Object.isFrozen(captured), true); assert.equal(Object.isFrozen(captured.selection.purchase), true);
  assert.equal(captured.selection.ownership.expectedEnvelopeJson, null);
});
const cases = [];
for (const { id, run } of checks) { try { run(); cases.push({ id, status: 'PASS' }); } catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? 'unknown') }); } }
const failed = cases.filter(r => r.status !== 'PASS').length;
process.stdout.write(JSON.stringify({ qualification: 'PURCHASE_ORDER_FUNDING_HTTP_NATIVE_FIXTURE_DATA', passed: cases.length - failed, failed, cases,
  nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, grants: 0, serviceExecutions: 0, payouts: 0,
  nativeHttpApplicationExecuted: false, actualNativeTrial: 'NOT_PERFORMED' }) + '\n');
if (failed) process.exitCode = 1;
