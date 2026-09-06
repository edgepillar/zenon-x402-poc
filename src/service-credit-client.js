import { types as utilTypes } from 'node:util';

import {
  SERVICE_CREDIT_CAPABILITY_PROOF_VERSION,
  verifyServiceCreditCapability,
} from './service-credit-capability.js';

const AUTHORIZATION_PREFIX = 'ServiceCredit ';
const MAX_AUTHORIZATION_BYTES = 1_024;
const ROOT_KEYS = Object.freeze(['grant', 'request', 'proof']);
const GRANT_KEYS = Object.freeze(['grantId', 'capabilityCommitment']);
const REQUEST_KEYS = Object.freeze([
  'modelVersion',
  'grantId',
  'requestId',
  'method',
  'routeId',
  'canonicalBodyDigest',
  'selectedContentType',
  'maxCostUnits',
]);
const PROOF_KEYS = Object.freeze([
  'proofVersion',
  'grantId',
  'requestId',
  'publicKey',
  'maxCostUnits',
  'signature',
]);
const CANONICAL_PROOF_KEYS = Object.freeze([...PROOF_KEYS].sort());
const VERIFIED_KEYS = Object.freeze([
  'verified',
  'proofVersion',
  'grantId',
  'requestId',
  'maxCostUnits',
]);
const BASE64URL = /^[A-Za-z0-9_-]+$/;

class ServiceCreditClientError extends Error {
  constructor() {
    super('SERVICE_CREDIT_AUTHORIZATION_FAILED');
    this.name = 'ServiceCreditClientError';
    this.code = 'SERVICE_CREDIT_AUTHORIZATION_FAILED';
    this.stack = 'ServiceCreditClientError: SERVICE_CREDIT_AUTHORIZATION_FAILED';
  }
}

function failClient() {
  throw new ServiceCreditClientError();
}

function captureExactPlainObject(value, expectedKeys) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || utilTypes.isProxy(value)
    || Reflect.getPrototypeOf(value) !== Object.prototype
  ) {
    failClient();
  }
  const observed = Reflect.ownKeys(value);
  if (
    observed.length !== expectedKeys.length
    || observed.some(key => typeof key !== 'string' || !expectedKeys.includes(key))
  ) {
    failClient();
  }
  const captured = {};
  for (const key of expectedKeys) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) failClient();
    captured[key] = descriptor.value;
  }
  return Object.freeze(captured);
}

function captureInput(input) {
  const root = captureExactPlainObject(input, ROOT_KEYS);
  return Object.freeze({
    grant: captureExactPlainObject(root.grant, GRANT_KEYS),
    request: captureExactPlainObject(root.request, REQUEST_KEYS),
    proof: captureExactPlainObject(root.proof, PROOF_KEYS),
  });
}

function bindingIsExact(verified, captured) {
  const result = captureExactPlainObject(verified, VERIFIED_KEYS);
  return Object.isFrozen(verified)
    && result.verified === true
    && result.proofVersion === SERVICE_CREDIT_CAPABILITY_PROOF_VERSION
    && result.proofVersion === captured.proof.proofVersion
    && result.grantId === captured.grant.grantId
    && result.grantId === captured.request.grantId
    && result.grantId === captured.proof.grantId
    && result.requestId === captured.request.requestId
    && result.requestId === captured.proof.requestId
    && result.maxCostUnits === captured.request.maxCostUnits
    && result.maxCostUnits === captured.proof.maxCostUnits;
}

function canonicalProof(proof) {
  return `{${CANONICAL_PROOF_KEYS.map(
    key => `${JSON.stringify(key)}:${JSON.stringify(proof[key])}`,
  ).join(',')}}`;
}

/**
 * Validates and serializes one already-signed service-credit request proof.
 * This function accepts no signer or private key and performs no I/O. The
 * returned string is a bearer-like credential for one exact idempotent request
 * and must not be logged or persisted. Temporary UTF-8 bytes are cleared, but
 * JavaScript strings cannot be reliably erased from process memory.
 */
export function createServiceCreditAuthorization(input) {
  try {
    if (arguments.length !== 1) failClient();
    const captured = captureInput(input);
    const verified = verifyServiceCreditCapability(captured);
    if (!bindingIsExact(verified, captured)) failClient();

    const proofBytes = Buffer.from(canonicalProof(captured.proof), 'utf8');
    let encoded;
    try {
      encoded = proofBytes.toString('base64url');
    } finally {
      proofBytes.fill(0);
    }
    if (!BASE64URL.test(encoded) || encoded.includes('=')) failClient();
    const authorization = `${AUTHORIZATION_PREFIX}${encoded}`;
    if (Buffer.byteLength(authorization, 'utf8') > MAX_AUTHORIZATION_BYTES) failClient();
    return authorization;
  } catch {
    throw new ServiceCreditClientError();
  }
}
