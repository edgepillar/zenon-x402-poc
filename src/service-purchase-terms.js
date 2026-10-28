/**
 * Small purchased-terms contract. Inputs are bounded canonical JSON, rather
 * than objects with callbacks or accessors. Retain the original text durably
 * before relying on comparisons; this module neither stores it nor verifies
 * payment, delivery, compensation, a signature or current dispatch authority.
 */

const TERM_FIELDS = Object.freeze([
  'termsVersion', 'orderId', 'productId', 'beneficiary', 'holder',
  'price', 'quantity', 'network', 'conditionsDigest',
]);
const PRICE_FIELDS = Object.freeze(['asset', 'unit', 'amount']);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const NETWORK = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const AMOUNT = /^[1-9][0-9]{0,77}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

function reject(code = 'service_purchase_terms_rejected') {
  const error = new TypeError(code);
  Object.defineProperties(error, {
    code: { value: code, enumerable: true },
    stack: { value: `TypeError: ${code}`, configurable: false, writable: false },
  });
  throw Object.freeze(error);
}

function record(value, fields) {
  // JSON.parse is the only producer: there are no user-supplied object hooks.
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== fields.length) reject();
  for (const field of fields) if (!Object.hasOwn(value, field)) reject();
  return value;
}

function matches(pattern, value) {
  return typeof value === 'string' && pattern.exec(value)?.[0] === value;
}

/** Canonical field order and integer price units are part of version 1. */
export function snapshotPurchasedServiceTerms(text) {
  if (arguments.length !== 1 || typeof text !== 'string'
      || text.length === 0 || text.length > 4096) reject();
  let decoded;
  try { decoded = JSON.parse(text); } catch { reject(); }
  const t = record(decoded, TERM_FIELDS);
  const price = record(t.price, PRICE_FIELDS);
  if (t.termsVersion !== 1 || !matches(ID, t.orderId)
      || !matches(ID, t.productId) || !matches(ID, t.beneficiary)
      || !matches(ID, t.holder) || !matches(ID, price.asset)
      || !matches(ID, price.unit) || !matches(AMOUNT, price.amount)
      || !Number.isSafeInteger(t.quantity) || t.quantity <= 0
      || !matches(NETWORK, t.network) || !matches(DIGEST, t.conditionsDigest)) reject();
  const result = {
    termsVersion: 1,
    orderId: t.orderId,
    productId: t.productId,
    beneficiary: t.beneficiary,
    holder: t.holder,
    price: Object.freeze({ asset: price.asset, unit: price.unit, amount: price.amount }),
    quantity: t.quantity,
    network: t.network,
    conditionsDigest: t.conditionsDigest,
  };
  // Reject duplicate fields, whitespace aliases, numeric aliases and unknown
  // fields instead of silently changing the retained purchased terms.
  if (JSON.stringify(result) !== text) reject();
  return Object.freeze(result);
}

/** Compare against the retained original, never a newly generated substitute. */
export function requireSamePurchasedServiceTerms(originalText, observedText) {
  if (arguments.length !== 2) reject();
  const original = snapshotPurchasedServiceTerms(originalText);
  snapshotPurchasedServiceTerms(observedText);
  if (originalText !== observedText) reject('service_purchase_terms_conflict');
  return original;
}
