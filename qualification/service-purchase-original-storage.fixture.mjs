import { capturePurchasedServiceOriginal } from '../src/service-credit-purchased-original-recovery.js';
import { purchasedTermsStorageDigest } from '../src/service-purchase-storage-contract.js';
import { captureOriginalServiceRequestCustody, serializeOriginalServiceRequestCustody } from '../src/service-credit-original-request-custody-contract.js';
import { captureOriginalPaymentCheckpoint, encodeOriginalPaymentCheckpoint } from '../src/service-credit-pilot-original-payment-checkpoint.js';
import { encodeB64Json } from '../src/x402-wire.js';
import { paymentIntentDigest } from '../src/canonical.js';

// Synthetic declared metadata. No signature, key, SDK, SQL or network import.
export function purchaseStorageFixture({ orderId = 'order.storage.1', requestId = 'request.storage.1',
  grantId = 'grant.storage.1', paymentHash = 'a'.repeat(64), conditions = 'b'.repeat(64),
  contextId = 'context.storage.1', maxCostUnits = 2, chainIdentifier = null } = {}) {
  const network = chainIdentifier === null ? 'zenon:mock' : 'zenon:testnet';
  const selected = { scheme: 'exact', network, asset: 'zts1syntheticasset', amount: '100',
    payTo: 'z1syntheticprovider', maxTimeoutSeconds: 60,
    extra: { paymentFlow: 'upfront', poc: true, settlement: 'account-block',
      zenonChain: { version: 1, chainIdentifier: chainIdentifier ?? String(Number.MAX_SAFE_INTEGER),
        genesisMomentumHash: chainIdentifier === null ? '0'.repeat(64) : 'd'.repeat(64) },
      ...(chainIdentifier === null ? {} : { minimumMomentumConfirmations: 2 }) } };
  const required = { x402Version: 2, resource: { url: 'https://purchase-store.invalid/funding', mimeType: 'application/json' }, accepts: [selected] };
  const payload = { x402Version: 2, resource: { ...required.resource }, accepted: selected,
    payload: { transaction: { hash: paymentHash, address: 'z1syntheticpayer' }, intentDigest: paymentIntentDigest(required, selected) } };
  const terms = { termsVersion: 1, orderId, productId: 'metered-api.v1',
    beneficiary: 'beneficiary.storage.1', holder: 'z1syntheticpayer',
    price: { asset: selected.asset, unit: 'zenon-atomic', amount: '100' }, quantity: 10,
    network, conditionsDigest: 'sha256:' + conditions };
  const termsJson = JSON.stringify(terms), termsDigest = purchasedTermsStorageDigest(termsJson);
  const request = { modelVersion: 1, grantId, requestId, method: 'POST', routeId: 'service-credit.execute.v1',
    canonicalBodyDigest: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    selectedContentType: 'application/json', maxCostUnits };
  const original = captureOriginalServiceRequestCustody({ originalRequestJson: JSON.stringify(request),
    originalBodyBase64: '', serviceResourceUrl: 'https://purchase-store.invalid/service-credit/v1/execute' },
  { fundingResourceUrl: required.resource.url, paymentHash, network });
  const payment = captureOriginalPaymentCheckpoint({ binding: { requestId: 'funding.storage.1', paymentHash,
    origin: 'https://purchase-store.invalid', contextId },
  originalBytes: { requestBody: '', paymentPayload: encodeB64Json(payload), paymentRequirements: encodeB64Json(required),
    context: Buffer.from('{}').toString('base64') } });
  const paymentPinsJson = JSON.stringify(payment.pins);
  const purchase = capturePurchasedServiceOriginal(termsJson, serializeOriginalServiceRequestCustody(original),
    encodeOriginalPaymentCheckpoint(payment.checkpoint), paymentPinsJson);
  return Object.freeze({ orderId, requestId, grantId, termsJson, termsDigest, paymentPinsJson, ...purchase });
}

export function purchaseStorageNativeFixtures() {
  return Object.freeze({ first: purchaseStorageFixture(), second: purchaseStorageFixture({ requestId: 'request.storage.2' }),
    otherOrder: purchaseStorageFixture({ orderId: 'order.storage.2' }),
    changedTerms: purchaseStorageFixture({ conditions: 'c'.repeat(64) }),
    changedGrant: purchaseStorageFixture({ grantId: 'grant.storage.2' }),
    changedPayment: purchaseStorageFixture({ paymentHash: 'e'.repeat(64) }),
    changedContext: purchaseStorageFixture({ contextId: 'context.storage.2' }),
    changedCost: purchaseStorageFixture({ maxCostUnits: 3 }),
    capacity: purchaseStorageFixture({ orderId: 'order.capacity.1' }),
    capacitySecond: purchaseStorageFixture({ orderId: 'order.capacity.1', requestId: 'request.capacity.2' }) });
}
