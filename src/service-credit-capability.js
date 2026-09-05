import {
  createHash,
  createPublicKey,
  timingSafeEqual,
  verify,
} from 'node:crypto';
import { types as utilTypes } from 'node:util';
import { SERVICE_CREDIT_MODEL_VERSION } from './service-credit-model.js';

export const SERVICE_CREDIT_CAPABILITY_PROOF_VERSION = 1;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const METHOD = /^[A-Z][A-Z0-9_-]{0,15}$/;
const CONTENT_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/;
const SHA256_COMMITMENT = /^sha256:[0-9a-f]{64}$/;
const RAW_PUBLIC_KEY = /^[A-Za-z0-9_-]{43}$/;
const RAW_SIGNATURE = /^[A-Za-z0-9_-]{86}$/;
const KEY_COMMITMENT_DOMAIN = Buffer.from(
  'zenon-x402-service-credit-capability-key-v1\0',
  'ascii',
);
const REQUEST_SIGNATURE_DOMAIN = Buffer.from(
  'zenon-x402-service-credit-request-v1\0',
  'ascii',
);
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export class ServiceCreditCapabilityError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ServiceCreditCapabilityError';
    this.code = code;
    this.stack = `ServiceCreditCapabilityError: ${code}`;
  }
}

function capabilityFailure(code) {
  return new ServiceCreditCapabilityError(code);
}

function failInput() {
  throw capabilityFailure('SERVICE_CREDIT_CAPABILITY_INVALID_INPUT');
}

function failRejected() {
  throw capabilityFailure('SERVICE_CREDIT_CAPABILITY_REJECTED');
}

function captureExactObject(input, keys) {
  try {
    if (
      input === null
      || typeof input !== 'object'
      || Array.isArray(input)
      || utilTypes.isProxy(input)
      || Reflect.getPrototypeOf(input) !== Object.prototype
    ) {
      failInput();
    }
    const observed = Reflect.ownKeys(input);
    if (
      observed.length !== keys.length
      || observed.some(key => typeof key !== 'string' || !keys.includes(key))
    ) {
      failInput();
    }
    const result = Object.create(null);
    for (const key of keys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) failInput();
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    failInput();
  }
}

function assertIdentifier(value) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value) || value.includes('://')) failInput();
}

function assertPositiveSafeInteger(value) {
  if (!Number.isSafeInteger(value) || value <= 0) failInput();
}

function decodeCanonicalBase64url(value, expression, expectedBytes) {
  if (typeof value !== 'string' || !expression.test(value)) failInput();
  let decoded;
  try {
    decoded = Buffer.from(value, 'base64url');
  } catch {
    failInput();
  }
  if (decoded.length !== expectedBytes || decoded.toString('base64url') !== value) failInput();
  return decoded;
}

function normalizeRequest(input) {
  const value = captureExactObject(input, [
    'modelVersion',
    'grantId',
    'requestId',
    'method',
    'routeId',
    'canonicalBodyDigest',
    'selectedContentType',
    'maxCostUnits',
  ]);
  if (value.modelVersion !== SERVICE_CREDIT_MODEL_VERSION) failInput();
  assertIdentifier(value.grantId);
  assertIdentifier(value.requestId);
  if (typeof value.method !== 'string' || !METHOD.test(value.method)) failInput();
  assertIdentifier(value.routeId);
  if (
    typeof value.canonicalBodyDigest !== 'string'
    || !SHA256_COMMITMENT.test(value.canonicalBodyDigest)
  ) {
    failInput();
  }
  if (typeof value.selectedContentType !== 'string' || !CONTENT_TYPE.test(value.selectedContentType)) {
    failInput();
  }
  assertPositiveSafeInteger(value.maxCostUnits);
  return Object.freeze({
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    grantId: value.grantId,
    requestId: value.requestId,
    method: value.method,
    routeId: value.routeId,
    canonicalBodyDigest: value.canonicalBodyDigest,
    selectedContentType: value.selectedContentType,
    maxCostUnits: value.maxCostUnits,
  });
}

function normalizePublicKey(input) {
  const value = captureExactObject(input, ['publicKey']);
  return decodeCanonicalBase64url(value.publicKey, RAW_PUBLIC_KEY, 32);
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function commitmentBytes(publicKey) {
  return createHash('sha256')
    .update(KEY_COMMITMENT_DOMAIN)
    .update(publicKey)
    .digest();
}

function requestSigningBytes(normalized) {
  return Buffer.concat([
    REQUEST_SIGNATURE_DOMAIN,
    Buffer.from(canonicalJson(normalized), 'utf8'),
  ]);
}

/**
 * Derives the public commitment stored on a grant. The input is a canonical
 * raw Ed25519 public key; no private key or bearer secret is accepted.
 */
export function deriveServiceCreditCapabilityCommitment(input) {
  try {
    const publicKey = normalizePublicKey(input);
    return `sha256:${commitmentBytes(publicKey).toString('hex')}`;
  } catch {
    throw capabilityFailure('SERVICE_CREDIT_CAPABILITY_INVALID_INPUT');
  }
}

/**
 * Returns fresh caller-owned bytes for the exact version-1 request message.
 * The caller may pass them to an external signer; this module never handles a
 * private key and exports no signing function.
 */
export function createServiceCreditCapabilitySigningBytes(input) {
  try {
    return requestSigningBytes(normalizeRequest(input));
  } catch {
    throw capabilityFailure('SERVICE_CREDIT_CAPABILITY_INVALID_INPUT');
  }
}

/**
 * Verifies possession of the public key committed by one exact grant and binds
 * that proof to the complete normalized service request. This is not wallet,
 * human, settlement, or chain identity. Node/OpenSSL verification behavior is
 * used as provided and no stronger signature-validation claim is made.
 * Exact-proof replay remains possible: the durable request store must enforce
 * request-id idempotency and conflicts. The caller must separately enforce the
 * grant lifecycle, expiry, revocation, route selection, body canonicalization,
 * pricing, and privileged reconciliation policy before authorizing service.
 */
export function verifyServiceCreditCapability(input) {
  try {
    const root = captureExactObject(input, ['grant', 'request', 'proof']);
    const grant = captureExactObject(root.grant, ['grantId', 'capabilityCommitment']);
    const request = normalizeRequest(root.request);
    const proof = captureExactObject(root.proof, [
      'proofVersion',
      'grantId',
      'requestId',
      'publicKey',
      'maxCostUnits',
      'signature',
    ]);

    assertIdentifier(grant.grantId);
    if (
      typeof grant.capabilityCommitment !== 'string'
      || !SHA256_COMMITMENT.test(grant.capabilityCommitment)
      || proof.proofVersion !== SERVICE_CREDIT_CAPABILITY_PROOF_VERSION
      || proof.grantId !== grant.grantId
      || proof.grantId !== request.grantId
      || proof.requestId !== request.requestId
      || proof.maxCostUnits !== request.maxCostUnits
    ) {
      failRejected();
    }
    assertIdentifier(proof.grantId);
    assertIdentifier(proof.requestId);
    assertPositiveSafeInteger(proof.maxCostUnits);

    const publicKey = decodeCanonicalBase64url(proof.publicKey, RAW_PUBLIC_KEY, 32);
    const signature = decodeCanonicalBase64url(proof.signature, RAW_SIGNATURE, 64);
    const expectedCommitment = commitmentBytes(publicKey);
    const storedCommitment = Buffer.from(grant.capabilityCommitment.slice('sha256:'.length), 'hex');
    if (
      storedCommitment.length !== expectedCommitment.length
      || !timingSafeEqual(storedCommitment, expectedCommitment)
    ) {
      failRejected();
    }

    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, publicKey]),
      format: 'der',
      type: 'spki',
    });
    if (!verify(null, requestSigningBytes(request), key, signature)) failRejected();

    return Object.freeze({
      verified: true,
      proofVersion: SERVICE_CREDIT_CAPABILITY_PROOF_VERSION,
      grantId: request.grantId,
      requestId: request.requestId,
      maxCostUnits: request.maxCostUnits,
    });
  } catch {
    throw capabilityFailure('SERVICE_CREDIT_CAPABILITY_REJECTED');
  }
}
