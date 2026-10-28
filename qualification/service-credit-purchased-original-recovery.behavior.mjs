import assert from 'node:assert/strict';
import {
  capturePurchasedServiceOriginal as capture,
  restorePurchasedServiceOriginal as restore,
  createPurchasedServiceOriginalRecoveryReader as createReader,
} from '../src/service-credit-purchased-original-recovery.js';
import {
  captureOriginalServiceRequestCustody, serializeOriginalServiceRequestCustody,
} from '../src/service-credit-original-request-custody-contract.js';
import {
  captureOriginalPaymentCheckpoint, encodeOriginalPaymentCheckpoint,
} from '../src/service-credit-pilot-original-payment-checkpoint.js';
import { encodeB64Json } from '../src/x402-wire.js';
import { paymentIntentDigest } from '../src/canonical.js';

// Declared metadata and a read-capability fixture. No SDK/SQL/key/signature/socket.
const copy = value => JSON.parse(JSON.stringify(value));
const paymentHash = 'a'.repeat(64), fundingUrl = 'https://purchase.invalid/funding';
const request = { modelVersion: 1, grantId: 'grant.synthetic.1', requestId: 'service.synthetic.1',
  method: 'POST', routeId: 'service-credit.execute.v1',
  canonicalBodyDigest: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  selectedContentType: 'application/json', maxCostUnits: 2 };
function fixture(edit = () => {}) {
  const selected = { scheme: 'exact', network: 'zenon:mock', asset: 'zts1syntheticasset',
    amount: '100', payTo: 'z1syntheticprovider', maxTimeoutSeconds: 60,
    extra: { paymentFlow: 'upfront', poc: true, settlement: 'account-block',
      zenonChain: { version: 1, chainIdentifier: String(Number.MAX_SAFE_INTEGER), genesisMomentumHash: '0'.repeat(64) } } };
  const required = { x402Version: 2, resource: { url: fundingUrl, mimeType: 'application/json' }, accepts: [selected] };
  const payload = { x402Version: 2, resource: copy(required.resource), accepted: copy(selected),
    payload: { transaction: { hash: paymentHash, address: 'z1syntheticpayer' },
      intentDigest: paymentIntentDigest(required, selected) } };
  const terms = { termsVersion: 1, orderId: 'order.synthetic.1', productId: 'metered-api.v1',
    beneficiary: 'service-beneficiary.synthetic.1', holder: 'z1syntheticpayer',
    price: { asset: selected.asset, unit: 'zenon-atomic', amount: '100' }, quantity: 10,
    network: selected.network, conditionsDigest: 'sha256:' + 'b'.repeat(64) };
  const f = { required, payload, terms, fundingUrl, paymentHash };
  edit(f);
  const custody = captureOriginalServiceRequestCustody({ originalRequestJson: JSON.stringify(request),
    originalBodyBase64: '', serviceResourceUrl: 'https://purchase.invalid/service-credit/v1/execute' },
  { fundingResourceUrl: f.fundingUrl, paymentHash: f.paymentHash, network: selected.network });
  const checkpoint = captureOriginalPaymentCheckpoint({ binding: { requestId: 'funding.synthetic.1',
    paymentHash, origin: 'https://purchase.invalid', contextId: 'funding-context.synthetic.1' },
  originalBytes: { requestBody: '', paymentPayload: encodeB64Json(payload),
    paymentRequirements: encodeB64Json(required), context: Buffer.from('{}').toString('base64') } });
  f.args = [JSON.stringify(terms), serializeOriginalServiceRequestCustody(custody),
    encodeOriginalPaymentCheckpoint(checkpoint.checkpoint), JSON.stringify(checkpoint.pins)];
  f.custody = custody;
  return f;
}
function saved(f = fixture()) {
  const captured = capture(...f.args);
  return { ...f, ...captured, restore: () => restore(captured.recordJson, captured.recordDigest, f.args[3]) };
}
function recovery(f) {
  return { recoveryVersion: 1, status: 'CLIENT_RECONCILIATION_REQUIRED',
    local: { original: f.custody }, backend: { status: 'CACHED_SUCCESS', revision: 7,
      originalRequest: { ...copy(request), state: 'SUCCEEDED' },
      execution: { request: copy(request), terminalClassification: 'SUCCEEDED' },
      cachedResult: { statusCode: 200, contentType: 'application/json', resultCode: 'CACHED' },
      executionAuthorized: false, paymentAuthorized: false, signingAuthorized: false, deliveryStatus: 'NOT_ESTABLISHED' },
    authority: 'NONE', mayStartPayment: false, maySignPayment: false, mayDispatchService: false,
    deliveryConfirmed: false, serviceDelivery: 'NOT_ESTABLISHED', currentAuthority: 'NOT_ESTABLISHED',
    nextStep: 'RECONCILIATION_REQUIRED' };
}
function reader(f = saved(), read = () => recovery(f)) {
  const core = { readOriginalBackendRecoveryState: read };
  return createReader(f.recordJson, f.recordDigest, f.args[3], core);
}
const rejected = fn => assert.throws(fn, TypeError);
const cases = [];
function check(id, run) { run(); cases.push({ id, status: 'PASS' }); }

check('EXACT-ORIGINAL-ROUNDTRIP-AND-FROZEN-VIEW', () => {
  const f = saved(), result = f.restore();
  assert.equal(result.recordJson, f.recordJson);
  assert.equal(JSON.stringify(result.terms), f.args[0]);
  assert.equal(serializeOriginalServiceRequestCustody(result.original), f.args[1]);
  assert.equal(encodeOriginalPaymentCheckpoint(result.checkpoint), f.args[2]);
  rejected(() => { result.terms.price.amount = '1'; });
});
check('FUNDING-AND-SERVICE-IDS-REMAIN-DISTINCT', () => {
  const f = saved().restore();
  assert.equal(f.original.requestId, 'service.synthetic.1');
  assert.equal(f.checkpoint.binding.requestId, 'funding.synthetic.1');
  assert.notEqual(f.terms.beneficiary, 'z1syntheticprovider');
});
check('QUANTITY-DOES-NOT-MULTIPLY-TOTAL-QUOTED-PRICE', () => {
  const f = saved().restore(); assert.equal(f.terms.quantity, 10); assert.equal(f.terms.price.amount, '100');
});
check('EXACT-AMOUNT-ASSET-UNIT-NETWORK-AND-HOLDER-REQUIRED', () => {
  for (const edit of [f => { f.terms.price.amount = '101'; }, f => { f.terms.price.asset = 'ZNN'; },
    f => { f.terms.price.unit = 'znn-display'; }, f => { f.terms.network = 'zenon:testnet'; },
    f => { f.terms.holder = 'z1otherpayer'; }]) rejected(() => capture(...fixture(edit).args));
});
check('ORIGINAL-FUNDING-RESOURCE-AND-SELECTED-OFFER-REQUIRED', () => {
  for (const edit of [f => { f.fundingUrl += '-other'; },
    f => { f.payload.resource.url += '-other'; }, f => { f.payload.accepted.payTo = 'z1different'; }]) {
    rejected(() => capture(...fixture(edit).args));
  }
});
check('ORIGINAL-INTENT-DIGEST-REQUIRED', () => {
  rejected(() => capture(...fixture(f => { f.payload.payload.intentDigest = 'c'.repeat(64); }).args));
});
check('ACTIVE-SINGLE-OFFER-PROFILE-REQUIRED', () => {
  for (const edit of [f => { delete f.payload.accepted.extra.paymentFlow; },
    f => { f.required.accepts.push(copy(f.required.accepts[0])); }]) {
    rejected(() => capture(...fixture(edit).args));
  }
});
check('CHECKPOINT-WIRE-JSON-ALIASES-ARE-REJECTED', () => {
  const f = fixture(), checkpoint = JSON.parse(f.args[2]);
  checkpoint.originalBytes.paymentPayload = Buffer.from(JSON.stringify(f.payload, null, 2)).toString('base64');
  const captured = captureOriginalPaymentCheckpoint({ binding: checkpoint.binding, originalBytes: checkpoint.originalBytes });
  f.args[2] = encodeOriginalPaymentCheckpoint(captured.checkpoint); f.args[3] = JSON.stringify(captured.pins);
  rejected(() => capture(...f.args));
});
check('TRANSACTION-HASH-MUST-MATCH-CHECKPOINT', () => {
  rejected(() => capture(...fixture(f => { f.payload.payload.transaction.hash = 'c'.repeat(64); }).args));
});
check('SERVICE-CUSTODY-MUST-MATCH-PAYMENT-HASH', () => {
  rejected(() => capture(...fixture(f => { f.paymentHash = 'c'.repeat(64); }).args));
});
check('INDEPENDENT-PAYMENT-PINS-CANNOT-BE-REPLACED-BY-RECORD', () => {
  const f = saved(), pins = JSON.parse(f.args[3]); pins.digests.context = 'c'.repeat(64);
  rejected(() => restore(f.recordJson, f.recordDigest, JSON.stringify(pins)));
  rejected(() => restore(f.recordJson, f.recordDigest, '{}'));
});
check('PURCHASE-CANONICAL-SHAPE-AND-VERSION-REQUIRED', () => {
  const f = saved(), value = JSON.parse(f.recordJson);
  for (const alias of [' ' + f.recordJson, JSON.stringify(value, null, 2),
    f.recordJson.replace('"purchaseVersion":1', '"purchaseVersion":1,"purchaseVersion":1')]) {
    rejected(() => restore(alias, f.recordDigest, f.args[3]));
  }
  value.purchaseVersion = 2; rejected(() => restore(JSON.stringify(value), f.recordDigest, f.args[3]));
});
check('INDEPENDENT-PURCHASE-DIGEST-PROTECTS-TERMS-AND-QUANTITY', () => {
  const f = saved();
  for (const edit of [v => { v.terms.beneficiary = 'another-beneficiary'; },
    v => { v.terms.quantity = 11; }, v => { v.terms.conditionsDigest = 'sha256:' + 'c'.repeat(64); }]) {
    const next = saved(fixture(edit));
    rejected(() => restore(next.recordJson, f.recordDigest, f.args[3]));
  }
});
check('BOUNDED-STRING-INPUTS-DO-NOT-INVOKE-USER-HOOKS', () => {
  const f = saved(); let calls = 0;
  rejected(() => restore({ toString() { calls++; return f.recordJson; } }, f.recordDigest, f.args[3]));
  rejected(() => restore('x'.repeat(65537), f.recordDigest, f.args[3]));
  assert.equal(calls, 0);
});
check('REAL-CORE-READ-SHAPE-USES-PINNED-KEY-AND-CHECKPOINT', () => {
  const f = saved(); let calls = 0;
  const r = reader(f, (key, auth, pins) => {
    calls++; assert.deepEqual(key, { grantId: request.grantId, requestId: request.requestId });
    assert.equal(auth, 'synthetic-authorization'); assert.deepEqual(pins, JSON.parse(f.args[3]));
    assert.ok(Object.isFrozen(key) && Object.isFrozen(pins) && Object.isFrozen(pins.digests));
    return recovery(f);
  });
  const result = r.readOriginalPurchaseRecovery('synthetic-authorization');
  assert.equal(calls, 1); assert.equal(result.orderId, 'order.synthetic.1'); assert.equal(result.originalMatched, true);
});
check('CACHED-SUCCESS-NEVER-BECOMES-DELIVERY-OR-AUTHORITY', () => {
  const result = reader().readOriginalPurchaseRecovery('synthetic-authorization');
  assert.equal(result.reportedBackendStatus, 'CACHED_SUCCESS');
  assert.equal(result.deliveryStatus, 'NOT_ESTABLISHED'); assert.equal(result.deliveredQuantity, null);
  assert.equal(result.paymentVerification, 'NOT_PERFORMED'); assert.equal(result.requiresReconciliation, true);
  for (const name of ['mayStartPayment', 'maySignPayment', 'mayDispatchService']) assert.equal(result[name], false);
  assert.equal(result.authority, 'NONE'); assert.ok(Object.isFrozen(result));
  assert.equal(JSON.stringify(result).includes('synthetic-authorization'), false);
  assert.equal(JSON.stringify(result).includes('paymentCheckpointJson'), false);
});
check('UNKNOWN-AND-MISSING-RECORDS-REMAIN-UNRESOLVED', () => {
  for (const backendStatus of ['OUTCOME_UNKNOWN', 'RECONCILIATION_REQUIRED', 'NOT_RECORDED']) {
    const f = saved(), view = recovery(f); view.backend.status = backendStatus;
    view.backend.execution = null; view.backend.originalRequest = backendStatus === 'NOT_RECORDED' ? null : view.backend.originalRequest;
    const result = reader(f, () => view).readOriginalPurchaseRecovery('synthetic-authorization');
    assert.equal(result.reportedBackendStatus, backendStatus); assert.equal(result.deliveryStatus, 'NOT_ESTABLISHED');
  }
  const f = saved(), view = recovery(f); view.local = null; view.backend = null; view.status = 'CLIENT_ORIGINAL_NOT_RECORDED';
  assert.equal(reader(f, () => view).readOriginalPurchaseRecovery('synthetic-authorization').originalMatched, false);
});
check('CHANGED-LOCAL-CUSTODY-IS-REJECTED', () => {
  const f = saved(), view = recovery(f); view.local.original = fixture(v => { v.paymentHash = 'c'.repeat(64); }).custody;
  rejected(() => reader(f, () => view).readOriginalPurchaseRecovery('synthetic-authorization'));
});
check('ALL-EIGHT-BACKEND-ORIGINAL-FIELDS-MUST-MATCH', () => {
  for (const name of Object.keys(request)) {
    const f = saved(), view = recovery(f);
    view.backend.originalRequest[name] = typeof request[name] === 'number' ? request[name] + 1 : request[name] + '.other';
    rejected(() => reader(f, () => view).readOriginalPurchaseRecovery('synthetic-authorization'));
  }
});
check('FOREIGN-EXECUTION-AND-INCOMPLETE-CACHE-ARE-REJECTED', () => {
  for (const edit of [v => { v.backend.execution.request.grantId = 'grant.foreign'; },
    v => { v.backend.execution = null; }, v => { v.backend.originalRequest = null; }]) {
    const f = saved(), view = recovery(f); edit(view);
    rejected(() => reader(f, () => view).readOriginalPurchaseRecovery('synthetic-authorization'));
  }
});
check('CALLER-DELIVERY-AND-AUTHORITY-CLAIMS-ARE-REJECTED', () => {
  for (const edit of [v => { v.deliveryConfirmed = true; }, v => { v.mayDispatchService = true; },
    v => { v.backend.deliveryStatus = 'DELIVERED'; }, v => { v.backend.executionAuthorized = true; }]) {
    const f = saved(), view = recovery(f); edit(view);
    rejected(() => reader(f, () => view).readOriginalPurchaseRecovery('synthetic-authorization'));
  }
});
check('REENTRANT-CLOSE-DISCARDS-IN-FLIGHT-OBSERVATION', () => {
  const f = saved(); let calls = 0, r;
  r = reader(f, () => { calls++; r.close(); return recovery(f); });
  rejected(() => r.readOriginalPurchaseRecovery('synthetic-authorization'));
  rejected(() => r.readOriginalPurchaseRecovery('synthetic-authorization')); assert.equal(calls, 1);
});
check('READ-FAILURE-IS-PRIVATE-AND-DISABLES-RETRY', () => {
  let calls = 0;
  const r = reader(saved(), () => { calls++; throw Error('PRIVATE-AUTHORIZATION-HEADER'); });
  assert.throws(() => r.readOriginalPurchaseRecovery('synthetic-authorization'), error =>
    error.code === 'PURCHASED_ORIGINAL_RECOVERY_READ_FAILED' && !String(error.stack).includes('PRIVATE'));
  assert.throws(() => r.readOriginalPurchaseRecovery('synthetic-authorization'), error =>
    error.code === 'PURCHASED_ORIGINAL_RECOVERY_UNAVAILABLE'); assert.equal(calls, 1);
});
check('CLOSE-FENCES-WRAPPER-WITHOUT-CLOSING-BORROWED-CORE', () => {
  const f = saved(); let closed = 0, calls = 0;
  const r = createReader(f.recordJson, f.recordDigest, f.args[3], {
    readOriginalBackendRecoveryState() { calls++; return recovery(f); }, close() { closed++; } });
  r.close(); r.close(); rejected(() => r.readOriginalPurchaseRecovery('synthetic-authorization'));
  assert.equal(closed, 0); assert.equal(calls, 0); assert.equal(r.snapshot().closed, true);
});
check('INVALID-AUTHORIZATION-DOES-NOT-ENTER-CORE', () => {
  let calls = 0; const r = reader(saved(), () => { calls++; });
  for (const value of [undefined, '', 'x'.repeat(1025), {}]) rejected(() => r.readOriginalPurchaseRecovery(value));
  rejected(() => r.readOriginalPurchaseRecovery('synthetic-authorization', 'extra')); assert.equal(calls, 0);
});
check('CORE-METHOD-ACCESSORS-ARE-NOT-INVOKED', () => {
  const f = saved(); let calls = 0;
  rejected(() => createReader(f.recordJson, f.recordDigest, f.args[3], {
    get readOriginalBackendRecoveryState() { calls++; return () => recovery(f); } })); assert.equal(calls, 0);
});
check('BUSY-FENCE-PREVENTS-REENTRANT-CORE-READ', () => {
  const f = saved(); let calls = 0, r;
  r = reader(f, () => { calls++;
    assert.throws(() => r.readOriginalPurchaseRecovery('synthetic-authorization'), error => error.code === 'PURCHASED_ORIGINAL_RECOVERY_BUSY');
    return recovery(f); });
  r.readOriginalPurchaseRecovery('synthetic-authorization'); assert.equal(calls, 1);
});
check('PURCHASE-MISMATCH-IS-REJECTED-BEFORE-CORE-READ', () => {
  const f = saved(); let calls = 0;
  rejected(() => createReader(f.recordJson, 'sha256:' + 'c'.repeat(64), f.args[3], {
    readOriginalBackendRecoveryState() { calls++; return recovery(f); } })); assert.equal(calls, 0);
});
check('DETACHED-RESULT-DOES-NOT-EXPOSE-RAW-CUSTODY-OR-CALLBACKS', () => {
  const f = saved(), view = recovery(f), result = reader(f, () => view).readOriginalPurchaseRecovery('synthetic-authorization');
  view.backend.status = 'OUTCOME_UNKNOWN'; assert.equal(result.reportedBackendStatus, 'CACHED_SUCCESS');
  assert.deepEqual(Object.values(result).filter(value => typeof value === 'object'), [null]);
});
console.log(JSON.stringify({ qualification: 'PURCHASED_ORIGINAL_RECOVERY_DATA_COMPONENT_ONLY',
  cases, passed: cases.length, failed: 0, nativeExecutions: 0, SDK: 0, SQLite: 0,
  keys: 0, signatures: 0, sockets: 0, nonceSearches: 0,
  actualBackendCoreOrLedger: 'NOT_EXECUTED', durablePurchasePersistence: 'NOT_ESTABLISHED',
  paymentVerification: 'NOT_PERFORMED', deliveryOrCompensation: 'NOT_ESTABLISHED' }));
