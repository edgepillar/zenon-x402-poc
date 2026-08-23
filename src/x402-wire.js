import { canonicalJson } from './canonical.js';

export const X402_VERSION = 2;
export const MAX_ZENON_AMOUNT = (1n << 255n) - 1n;
export const MAX_ZENON_CHAIN_IDENTIFIER = BigInt(Number.MAX_SAFE_INTEGER);
export const MAX_SETTLEMENT_TIMEOUT_SECONDS = 300;
export const EXPERIMENTAL_LIVE_NETWORK = 'zenon:testnet';
export const MOCK_NETWORK = 'zenon:mock';
export const MOCK_ZENON_CHAIN_PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: Number.MAX_SAFE_INTEGER.toString(),
  // Reserved as the synthetic mock genesis sentinel. Live requirements reject it.
  genesisMomentumHash: '0'.repeat(64),
});

export const HEADERS = Object.freeze({
  PAYMENT_REQUIRED: 'payment-required',
  PAYMENT_SIGNATURE: 'payment-signature',
  PAYMENT_RESPONSE: 'payment-response',
});

const CANONICAL_POSITIVE_DECIMAL = /^[1-9]\d*$/;
const LOWERCASE_HASH = /^[0-9a-f]{64}$/;
const REQUIREMENT_FIELDS = Object.freeze([
  'scheme', 'network', 'asset', 'amount', 'payTo', 'maxTimeoutSeconds', 'extra',
]);
const REQUIREMENT_EXTRA_FIELDS = Object.freeze(['poc', 'settlement', 'zenonChain']);
const REQUIREMENT_EXTRA_OPTIONAL_FIELDS = Object.freeze(['paymentFlow']);
const CHAIN_PROFILE_FIELDS = Object.freeze(['version', 'chainIdentifier', 'genesisMomentumHash']);
const RESOURCE_FIELDS = Object.freeze(['url', 'description', 'mimeType']);
const PAYMENT_REQUIRED_FIELDS = Object.freeze(['x402Version', 'resource', 'accepts']);
const PAYMENT_PAYLOAD_FIELDS = Object.freeze(['x402Version', 'resource', 'accepted', 'payload']);
const INNER_PAYMENT_PAYLOAD_FIELDS = Object.freeze(['transaction', 'intentDigest']);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainObject(value, label) {
  if (!isPlainObject(value)) throw new Error(`${label} must be an object`);
}

function assertExactKeys(value, required, { optional = [], label } = {}) {
  assertPlainObject(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains an unexpected field`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new Error(`${label}.${key} is required`);
  }
}

function sameChainProfile(a, b) {
  return a.version === b.version &&
    a.chainIdentifier === b.chainIdentifier &&
    a.genesisMomentumHash === b.genesisMomentumHash;
}

export function encodeB64Json(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

export function decodeB64Json(value, { maxDecodedBytes = 64 * 1024 } = {}) {
  if (!value) throw new Error('missing base64 JSON value');
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('invalid base64 JSON value');
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) throw new Error('invalid base64 JSON value');
  if (decoded.length > maxDecodedBytes) throw new Error('base64 JSON value is too large');
  const json = new TextDecoder('utf-8', { fatal: true }).decode(decoded);
  const parsed = JSON.parse(json);
  if (!isPlainObject(parsed)) throw new Error('base64 JSON value must contain an object');
  return parsed;
}

export function validateCanonicalZenonAmount(value, label = 'amount') {
  if (typeof value !== 'string' || !CANONICAL_POSITIVE_DECIMAL.test(value) || BigInt(value) > MAX_ZENON_AMOUNT) {
    throw new Error(`${label} must be a canonical positive Zenon atomic integer not exceeding 2^255 - 1`);
  }
}

export function validateZenonChainProfile(profile) {
  assertExactKeys(profile, CHAIN_PROFILE_FIELDS, { label: 'zenonChain' });
  if (profile.version !== 1) throw new Error('zenonChain.version must equal 1');
  if (typeof profile.chainIdentifier !== 'string' || profile.chainIdentifier.length > 20 ||
      !CANONICAL_POSITIVE_DECIMAL.test(profile.chainIdentifier)) {
    throw new Error('zenonChain.chainIdentifier must be a canonical nonzero decimal string');
  }
  const chainIdentifier = BigInt(profile.chainIdentifier);
  if (chainIdentifier > ((1n << 64n) - 1n) || chainIdentifier > MAX_ZENON_CHAIN_IDENTIFIER) {
    throw new Error('zenonChain.chainIdentifier exceeds the safe range of the current TypeScript SDK');
  }
  if (typeof profile.genesisMomentumHash !== 'string' || !LOWERCASE_HASH.test(profile.genesisMomentumHash)) {
    throw new Error('zenonChain.genesisMomentumHash must be 64 lowercase hexadecimal characters');
  }
}

export function sameRequirements(a, b) {
  try {
    validateRequirement(a);
    validateRequirement(b);
    return canonicalJson(a) === canonicalJson(b);
  } catch {
    return false;
  }
}

export function validateRequirement(req) {
  assertExactKeys(req, REQUIREMENT_FIELDS, { label: 'PaymentRequirements' });
  for (const key of ['scheme', 'network', 'asset', 'amount', 'payTo']) {
    if (typeof req[key] !== 'string' || !req[key]) throw new Error(`PaymentRequirements.${key} is required`);
  }
  if (req.asset.length > 128 || req.payTo.length > 128 || req.amount.length > 77) {
    throw new Error('PaymentRequirements contains an oversized payment field');
  }
  if (req.scheme !== 'exact') throw new Error('PoC supports only scheme=exact');
  if (req.network !== EXPERIMENTAL_LIVE_NETWORK && req.network !== MOCK_NETWORK) {
    throw new Error('PoC supports only its exact experimental live or mock network label');
  }
  validateCanonicalZenonAmount(req.amount);
  if (!Number.isSafeInteger(req.maxTimeoutSeconds) || req.maxTimeoutSeconds <= 0 ||
      req.maxTimeoutSeconds > MAX_SETTLEMENT_TIMEOUT_SECONDS) {
    throw new Error(`maxTimeoutSeconds must be between 1 and ${MAX_SETTLEMENT_TIMEOUT_SECONDS}`);
  }

  assertExactKeys(req.extra, REQUIREMENT_EXTRA_FIELDS, {
    optional: REQUIREMENT_EXTRA_OPTIONAL_FIELDS,
    label: 'PaymentRequirements.extra',
  });
  if (req.extra.poc !== true) throw new Error('PaymentRequirements.extra.poc must equal true');
  if (req.extra.settlement !== 'account-block') {
    throw new Error('PaymentRequirements.extra.settlement must equal account-block');
  }
  if (Object.hasOwn(req.extra, 'paymentFlow') && req.extra.paymentFlow !== 'upfront') {
    throw new Error('PaymentRequirements.extra.paymentFlow must equal upfront');
  }
  validateZenonChainProfile(req.extra.zenonChain);
  const isSyntheticMock = sameChainProfile(req.extra.zenonChain, MOCK_ZENON_CHAIN_PROFILE);
  if (req.network === MOCK_NETWORK && !isSyntheticMock) {
    throw new Error('mock requirements must use the reserved synthetic mock chain profile');
  }
  if (req.network !== MOCK_NETWORK &&
      (isSyntheticMock || req.extra.zenonChain.genesisMomentumHash === MOCK_ZENON_CHAIN_PROFILE.genesisMomentumHash)) {
    throw new Error('live requirements cannot use the synthetic mock chain profile');
  }
}

export function validateActiveUpfrontRequirement(req) {
  validateRequirement(req);
  if (!Object.hasOwn(req.extra, 'paymentFlow')) {
    throw new Error('active HTTP payments require PaymentRequirements.extra.paymentFlow=upfront');
  }
}

export function validateResource(resource) {
  assertExactKeys(resource, RESOURCE_FIELDS, { label: 'ResourceInfo' });
  for (const key of RESOURCE_FIELDS) {
    if (typeof resource[key] !== 'string' || !resource[key]) throw new Error(`ResourceInfo.${key} is required`);
  }
  if (resource.url.length > 4096 || resource.description.length > 4096 || resource.mimeType.length > 256) {
    throw new Error('ResourceInfo field is too large');
  }
  let parsed;
  try {
    parsed = new URL(resource.url);
  } catch {
    throw new Error('ResourceInfo.url must be an absolute URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('ResourceInfo.url must use HTTP or HTTPS');
  }
  if (parsed.username || parsed.password) throw new Error('ResourceInfo.url must not contain credentials');
  if (/[\r\n]/.test(resource.mimeType)) throw new Error('ResourceInfo.mimeType is invalid');
}

export function validatePaymentRequired(paymentRequired) {
  assertExactKeys(paymentRequired, PAYMENT_REQUIRED_FIELDS, { optional: ['error'], label: 'PaymentRequired' });
  if (paymentRequired.x402Version !== X402_VERSION) throw new Error('unsupported x402Version');
  validateResource(paymentRequired.resource);
  if (!Array.isArray(paymentRequired.accepts) || paymentRequired.accepts.length === 0) {
    throw new Error('PaymentRequired.accepts must contain at least one requirement');
  }
  for (const requirement of paymentRequired.accepts) validateRequirement(requirement);
  if (Object.hasOwn(paymentRequired, 'error') &&
      (typeof paymentRequired.error !== 'string' || !paymentRequired.error)) {
    throw new Error('PaymentRequired.error must be a non-empty string');
  }
}

export function validatePaymentPayloadEnvelope(paymentPayload) {
  assertExactKeys(paymentPayload, PAYMENT_PAYLOAD_FIELDS, { label: 'PaymentPayload' });
  if (paymentPayload.x402Version !== X402_VERSION) throw new Error('unsupported x402Version');
  validateResource(paymentPayload.resource);
  validateRequirement(paymentPayload.accepted);
  assertExactKeys(paymentPayload.payload, INNER_PAYMENT_PAYLOAD_FIELDS, { label: 'PaymentPayload.payload' });
  assertPlainObject(paymentPayload.payload.transaction, 'PaymentPayload.payload.transaction');
  if (typeof paymentPayload.payload.intentDigest !== 'string' || !LOWERCASE_HASH.test(paymentPayload.payload.intentDigest)) {
    throw new Error('PaymentPayload.payload.intentDigest must be a lowercase 32-byte hexadecimal digest');
  }
}

export function makePaymentRequired({ resourceUrl, description, mimeType, requirement, error }) {
  const result = {
    x402Version: X402_VERSION,
    ...(error ? { error } : {}),
    resource: {
      url: resourceUrl,
      description,
      mimeType,
    },
    accepts: [requirement],
  };
  validatePaymentRequired(result);
  return result;
}
