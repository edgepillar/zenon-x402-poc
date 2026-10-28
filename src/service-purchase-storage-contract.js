import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { snapshotPurchasedServiceTerms } from './service-purchase-terms.js';
import { restorePurchasedServiceOriginal } from './service-credit-purchased-original-recovery.js';
import { decodeB64Json } from './x402-wire.js';

const HASH = /^sha256:[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
export function purchaseStorageFailure(suffix) {
  const code = `PURCHASE_STORAGE_${suffix}`;
  const error = new TypeError(code);
  Object.defineProperties(error, { code: { value: code, enumerable: true }, stack: { value: `TypeError: ${code}` } });
  return Object.freeze(error);
}
function fail(suffix = 'INVALID_INPUT') { throw purchaseStorageFailure(suffix); }
function matches(pattern, value) { return typeof value === 'string' && pattern.exec(value)?.[0] === value; }
export function purchaseStorageIdentifier(value) { if (!matches(ID, value)) fail(); return value; }
export function purchaseStorageDigest(value) { if (!matches(HASH, value)) fail(); return value; }
export function purchaseStorageText(value, maxBytes) {
  if (typeof value !== 'string' || !value.length || value.length > maxBytes || Buffer.byteLength(value) > maxBytes
      || Buffer.from(value).toString() !== value) fail();
  return value;
}
function digest(domain, text) { return 'sha256:' + createHash('sha256').update(domain).update('\0').update(text).digest('hex'); }

/** A checksum candidate, not payment verification or signing authority. */
export function purchasedTermsStorageDigest(termsJson) {
  if (arguments.length !== 1) fail();
  snapshotPurchasedServiceTerms(termsJson);
  return digest('zenon-x402:purchased-terms-storage:v1', termsJson);
}

export function capturePurchaseStorageTerms(termsJson, independentlySelectedDigest) {
  if (arguments.length !== 2) fail();
  purchaseStorageDigest(independentlySelectedDigest);
  const termsDigest = purchasedTermsStorageDigest(termsJson);
  if (termsDigest !== independentlySelectedDigest) fail('TERMS_CONFLICT');
  return Object.freeze({ orderId: snapshotPurchasedServiceTerms(termsJson).orderId, termsJson, termsDigest });
}

export function purchaseStorageLimits(input) {
  if (input === null || typeof input !== 'object' || types.isProxy(input)
      || Object.getPrototypeOf(input) !== Object.prototype || Reflect.ownKeys(input).length !== 2) fail();
  const out = {};
  for (const [key, maximum] of [['maxOrders', 1024], ['maxOriginals', 4096]]) {
    const d = Object.getOwnPropertyDescriptor(input, key);
    if (!d?.enumerable || !Object.hasOwn(d, 'value') || !Number.isSafeInteger(d.value) || d.value < 1 || d.value > maximum) fail();
    out[key] = d.value;
  }
  return Object.freeze(out);
}

/** Real codecs, independent purchase/checkpoint/terms pins, no SQL or SDK. */
export function capturePurchaseStorageOriginal(recordJson, recordDigest, paymentPinsJson, termsDigest) {
  if (arguments.length !== 4) fail();
  purchaseStorageText(paymentPinsJson, 4096);
  const purchase = restorePurchasedServiceOriginal(recordJson, purchaseStorageDigest(recordDigest), paymentPinsJson);
  const termsJson = JSON.parse(recordJson).termsJson;
  const accepted = capturePurchaseStorageTerms(termsJson, termsDigest);
  const payload = decodeB64Json(purchase.checkpoint.originalBytes.paymentPayload,
    { maxEncodedBytes: 5464, maxDecodedBytes: 4096 });
  const chain = payload.accepted.extra.zenonChain;
  const network = purchase.original.network;
  const chainBinding = { network, chainIdentifier: chain.chainIdentifier, genesisMomentumHash: chain.genesisMomentumHash };
  const paymentScope = digest('zenon-x402:purchase-payment-scope:v1', JSON.stringify({ ...chainBinding, paymentHash: purchase.original.paymentHash }));
  const requestScope = digest('zenon-x402:purchase-request-scope:v1', JSON.stringify({ ...chainBinding,
    serviceResourceUrl: purchase.original.serviceResourceUrl, grantId: purchase.original.grantId, requestId: purchase.original.requestId }));
  return Object.freeze({ ...accepted, paymentScope, requestScope,
    grantId: purchase.original.grantId, requestId: purchase.original.requestId,
    serviceResourceUrl: purchase.original.serviceResourceUrl,
    paymentCheckpointJson: JSON.parse(recordJson).paymentCheckpointJson,
    recordJson, recordDigest, independentPinsChecked: true });
}

/**
 * Corruption check for already stored bytes only. Derived DB digests are NOT
 * independent pins. Public reads still require the caller's separate pins.
 */
export function inspectStoredPurchaseOriginal(recordJson, recordDigest) {
  if (arguments.length !== 2) fail();
  purchaseStorageText(recordJson, 65536);
  let record, checkpoint;
  try { record = JSON.parse(recordJson); checkpoint = JSON.parse(record.paymentCheckpointJson); }
  catch { fail('CORRUPT'); }
  const pinsJson = JSON.stringify({ binding: checkpoint.binding, digests: checkpoint.digests });
  const original = capturePurchaseStorageOriginal(recordJson, recordDigest, pinsJson, purchasedTermsStorageDigest(record.termsJson));
  return Object.freeze({ ...original, independentPinsChecked: false });
}
