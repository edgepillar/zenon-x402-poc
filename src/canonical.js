import crypto from 'node:crypto';

/** Deterministic JSON for objects composed of JSON-safe values. */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

export function sha256Hex(value) {
  const input = typeof value === 'string' ? value : canonicalJson(value);
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Bind a payment to both its exact requirements and the resource being bought.
 * The 32-byte digest can fit in a Zenon account block's data field.
 */
export function paymentIntentDigest(paymentRequired, accepted) {
  return sha256Hex({
    x402Version: paymentRequired.x402Version,
    resource: paymentRequired.resource,
    accepted,
  });
}
