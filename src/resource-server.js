import http from 'node:http';
import { Address } from 'znn-typescript-sdk';
import { sha256Hex } from './canonical.js';
import {
  decodeB64Json,
  encodeB64Json,
  EXPERIMENTAL_LIVE_NETWORK,
  HEADERS,
  makePaymentRequired,
  MOCK_NETWORK,
  validatePaymentPayloadEnvelope,
  validateRequirement,
} from './x402-wire.js';

const MAX_PAYMENT_HEADER_BYTES = 8 * 1024;
const MAX_CACHED_RESPONSE_BYTES = 64 * 1024;
const MAX_JSON_DEPTH = 20;
const PAID_VARY_HEADER = 'PAYMENT-SIGNATURE';
const HASH_HEX = /^[0-9a-f]{64}$/;
const MOCK_PAYER = /^mock-[0-9a-f]{32}$/;
const DEFINITIVE_SETTLEMENT_FAILURE = 'payment_settlement_failed';
const RECOVERY_STATES = new Set([
  'SUBMISSION_ACKNOWLEDGED',
  'SUBMISSION_OUTCOME_UNKNOWN',
  'DELIVERY_PENDING',
]);

export function createResourceServer({
  facilitator,
  requirement,
  port = 0,
  host = '127.0.0.1',
  advertisedBaseUrl,
  resourceHandler,
}) {
  const configuredRequirement = structuredClone(requirement);
  validateRequirement(configuredRequirement);
  let actualPort = port;
  const inFlight = new Map();

  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/paid') setPaidResponsePolicy(res);
      if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true });
      if (req.method !== 'GET' || req.url !== '/paid') return json(res, 404, { error: 'not_found' });

      const base = advertisedBaseUrl ?? `http://${host}:${actualPort}`;
      const paymentRequired = makePaymentRequired({
        resourceUrl: `${base}/paid`,
        description: 'Zenon x402 PoC protected resource',
        mimeType: 'application/json',
        requirement: configuredRequirement,
      });

      const signatureHeader = req.headers[HEADERS.PAYMENT_SIGNATURE];
      if (!signatureHeader) return requirePayment(res, paymentRequired);
      if (Array.isArray(signatureHeader) || typeof signatureHeader !== 'string' ||
          Buffer.byteLength(signatureHeader, 'utf8') > MAX_PAYMENT_HEADER_BYTES) {
        return requirePayment(res, { ...paymentRequired, error: 'invalid_payment_header' });
      }

      let paymentPayload;
      try {
        paymentPayload = decodeB64Json(signatureHeader, { maxDecodedBytes: MAX_PAYMENT_HEADER_BYTES });
        validatePaymentPayloadEnvelope(paymentPayload);
        validateJsonValue(paymentPayload);
      } catch {
        return requirePayment(res, { ...paymentRequired, error: 'invalid_payment_header' });
      }

      // Generic JSON depth and size are bounded before canonicalization. This
      // makes semantically identical payloads converge even if object members
      // arrived in a different JSON order, without accepting an unbounded
      // attacker-controlled recursive structure.
      const requestKey = sha256Hex({
        domain: 'zenon-x402-resource-request-v1',
        paymentPayload,
      });
      const outcome = await converge(inFlight, requestKey, () => authorizeAndDeliver({
        facilitator,
        paymentPayload,
        requirement: configuredRequirement,
        paymentRequired,
        resourceHandler,
      }));

      if (outcome.kind === 'definite-rejection') {
        return definiteRejectionResponse(res, paymentRequired, outcome.settlement);
      }
      if (outcome.kind === 'payment-required') {
        return requirePayment(res, { ...paymentRequired, error: DEFINITIVE_SETTLEMENT_FAILURE });
      }
      if (outcome.kind === 'recovery') return recoveryResponse(res, outcome.settlement);
      if (outcome.kind !== 'delivered') return json(res, 500, { error: 'internal_error' });

      const cached = normalizeCachedResponse(outcome.cached);
      res.statusCode = cached.status;
      for (const [name, value] of Object.entries(cached.headers)) res.setHeader(name, value);
      setPaidResponsePolicy(res);
      res.setHeader(HEADERS.PAYMENT_RESPONSE, encodeB64Json(publicSettlement(outcome.settlement)));
      res.end(JSON.stringify(cached.body, null, 2));
    } catch {
      json(res, 500, { error: 'internal_error' });
    }
  });

  return {
    server,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          actualPort = server.address().port;
          resolve();
        });
      });
      return { host, port: actualPort, url: `http://${host}:${actualPort}` };
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}

async function converge(inFlight, key, operation) {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const running = Promise.resolve().then(operation);
  inFlight.set(key, running);
  try {
    return await running;
  } finally {
    if (inFlight.get(key) === running) inFlight.delete(key);
  }
}

async function authorizeAndDeliver({ facilitator, paymentPayload, requirement, paymentRequired, resourceHandler }) {
  // Settlement owns strict offline verification, journal reconciliation,
  // frontier-sensitive checks, publication and Momentum-inclusion observation.
  // Calling verify() first would reject a safe retry after its frontier moved.
  const submittedIdentity = {
    network: requirement.network,
    acceptedNetwork: paymentPayload.accepted.network,
    transaction: paymentPayload.payload.transaction.hash,
    payer: paymentPayload.payload.transaction.address,
  };
  const settlement = await facilitator.settle(
    structuredClone(paymentPayload),
    structuredClone(requirement),
    structuredClone(paymentRequired),
  );
  if (!settlement?.success) {
    const rejection = definiteRejectionEvidence(settlement, submittedIdentity);
    if (rejection) return { kind: 'definite-rejection', settlement: rejection };
    const recoverable = settlement?.retrySamePayment === true || RECOVERY_STATES.has(settlement?.state);
    return { kind: recoverable ? 'recovery' : 'payment-required', settlement };
  }
  if (settlement.state !== 'MOMENTUM_INCLUDED') {
    return { kind: 'recovery', settlement: { ...settlement, retrySamePayment: true } };
  }
  if (typeof facilitator.markDeliveryPending !== 'function' ||
      typeof facilitator.markDelivered !== 'function') {
    return deliveryRecovery(settlement, 'delivery_state_unavailable');
  }
  if (settlement.deliveryState === 'DELIVERED' && settlement.cachedResponse) {
    try {
      return { kind: 'delivered', settlement, cached: normalizeCachedResponse(settlement.cachedResponse) };
    } catch {
      return deliveryRecovery(settlement, 'delivery_cache_unavailable');
    }
  }
  if (settlement.deliveryState === 'DELIVERY_PENDING') {
    return deliveryRecovery(settlement, 'delivery_outcome_unknown', 'DELIVERY_PENDING');
  }

  let claim;
  try {
    claim = await facilitator.markDeliveryPending(settlement);
    if (claim?.deliveryState === 'DELIVERED' && claim.cachedResponse) {
      return {
        kind: 'delivered',
        settlement: { ...settlement, deliveryState: 'DELIVERED' },
        cached: normalizeCachedResponse(claim.cachedResponse),
      };
    }
  } catch {
    return deliveryRecovery(settlement, 'delivery_outcome_unknown', 'DELIVERY_PENDING');
  }
  if (claim?.deliveryClaimed !== true || claim.deliveryState !== 'DELIVERY_PENDING') {
    return deliveryRecovery(settlement, 'delivery_outcome_unknown', 'DELIVERY_PENDING');
  }

  let cached;
  try {
    const body = resourceHandler
      ? await resourceHandler({ settlement: publicSettlement(settlement) })
      : {
          ok: true,
          message: 'paid resource unlocked',
          network: settlement.network,
          payer: settlement.payer,
          transaction: settlement.transaction,
          generatedAt: new Date().toISOString(),
        };
    cached = normalizeCachedResponse({
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body,
    });
  } catch {
    return deliveryRecovery(settlement, 'delivery_outcome_unknown', 'DELIVERY_PENDING');
  }

  try {
    const delivered = await facilitator.markDelivered(settlement, cached);
    if (delivered?.deliveryState !== 'DELIVERED' || !delivered.cachedResponse) {
      return deliveryRecovery(settlement, 'delivery_outcome_unknown', 'DELIVERY_PENDING');
    }
    const persisted = normalizeCachedResponse(delivered.cachedResponse);
    if (JSON.stringify(persisted) !== JSON.stringify(cached)) {
      return deliveryRecovery(settlement, 'delivery_outcome_unknown', 'DELIVERY_PENDING');
    }
  } catch {
    return deliveryRecovery(settlement, 'delivery_outcome_unknown', 'DELIVERY_PENDING');
  }
  return { kind: 'delivered', settlement: { ...settlement, deliveryState: 'DELIVERED' }, cached };
}

function definiteRejectionEvidence(settlement, submitted) {
  if (!isPlainObject(settlement)) return null;
  const requiredFields = [
    'success', 'network', 'transaction', 'payer', 'state', 'retrySamePayment', 'deliveryState',
  ];
  const evidence = {};
  for (const field of requiredFields) {
    const descriptor = Object.getOwnPropertyDescriptor(settlement, field);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null;
    evidence[field] = descriptor.value;
  }

  if (evidence.success !== false ||
      evidence.state !== 'VALIDATED' ||
      evidence.retrySamePayment !== false ||
      evidence.deliveryState !== 'NONE' ||
      evidence.network !== submitted.network ||
      submitted.acceptedNetwork !== submitted.network ||
      typeof submitted.transaction !== 'string' || !HASH_HEX.test(submitted.transaction) ||
      evidence.transaction !== submitted.transaction ||
      typeof evidence.transaction !== 'string' || !HASH_HEX.test(evidence.transaction) ||
      !isCanonicalPayer(submitted.payer, submitted.network) ||
      !isCanonicalPayer(evidence.payer, submitted.network) ||
      evidence.payer !== submitted.payer) {
    return null;
  }

  // This compound state is the facilitator's proof that publication and
  // delivery were never attempted. Snapshot only transaction-bound public
  // evidence; facilitator error details and causes stay private.
  return {
    success: false,
    network: submitted.network,
    transaction: submitted.transaction,
    payer: submitted.payer,
    state: 'VALIDATED',
    errorReason: DEFINITIVE_SETTLEMENT_FAILURE,
  };
}

function isCanonicalPayer(value, network) {
  if (typeof value !== 'string' || !value || value.length > 128) return false;
  if (network === MOCK_NETWORK) return MOCK_PAYER.test(value);
  if (network !== EXPERIMENTAL_LIVE_NETWORK) return false;
  try {
    const address = Address.parse(value);
    return address.toString() === value && address.getBytes()[0] === Address.userByte;
  } catch {
    return false;
  }
}

function deliveryRecovery(settlement, errorReason, deliveryState = settlement?.deliveryState) {
  return {
    kind: 'recovery',
    settlement: {
      ...settlement,
      success: false,
      ...(typeof deliveryState === 'string' ? { deliveryState } : {}),
      errorReason,
      retrySamePayment: true,
    },
  };
}

function normalizeCachedResponse(value) {
  if (!isPlainObject(value) || !exactKeys(value, ['status', 'headers', 'body']) ||
      value.status !== 200 || !isPlainObject(value.headers) ||
      !exactKeys(value.headers, ['content-type']) ||
      value.headers['content-type'] !== 'application/json; charset=utf-8') {
    throw new Error('invalid cached response');
  }
  const cloned = cloneBoundedJson(value, MAX_CACHED_RESPONSE_BYTES);
  if (Buffer.byteLength(JSON.stringify(cloned.body, null, 2), 'utf8') > MAX_CACHED_RESPONSE_BYTES) {
    throw new Error('cached response is too large');
  }
  return cloned;
}

function cloneBoundedJson(value, maximumBytes) {
  validateJsonValue(value);
  const encoded = JSON.stringify(value);
  if (encoded === undefined || Buffer.byteLength(encoded, 'utf8') > maximumBytes) {
    throw new Error('JSON value is too large');
  }
  return JSON.parse(encoded);
}

function validateJsonValue(value, depth = 0, seen = new Set()) {
  if (depth > MAX_JSON_DEPTH) throw new Error('JSON value is too deep');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) throw new Error('invalid JSON number');
    return;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) throw new Error('invalid JSON value');
  if (!Array.isArray(value) && !isPlainObject(value)) throw new Error('invalid JSON object');
  seen.add(value);
  const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
  for (const [key, item] of entries) {
    if (!Array.isArray(value) && ['__proto__', 'prototype', 'constructor'].includes(key)) {
      throw new Error('invalid JSON key');
    }
    validateJsonValue(item, depth + 1, seen);
  }
  seen.delete(value);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function recoveryResponse(res, settlement = {}) {
  const unknown = settlement.state === 'SUBMISSION_OUTCOME_UNKNOWN' ||
    settlement.errorReason === 'submission_outcome_unknown';
  const deliveryUnknown = settlement.deliveryState === 'DELIVERY_PENDING' ||
    settlement.errorReason === 'delivery_outcome_unknown';
  const error = deliveryUnknown
    ? 'resource_delivery_outcome_unknown'
    : unknown
      ? 'payment_outcome_unknown'
      : 'payment_reconciliation_required';
  const response = {
    ...publicSettlement(settlement),
    success: false,
    errorReason: error,
    retrySamePayment: true,
  };
  res.statusCode = 409;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader(HEADERS.PAYMENT_RESPONSE, encodeB64Json(response));
  res.end(JSON.stringify({
    error,
    action: 'reuse_and_reconcile_same_payment',
    transaction: typeof settlement.transaction === 'string' ? settlement.transaction : '',
  }, null, 2));
}

function publicSettlement(settlement = {}) {
  return {
    success: settlement.success === true,
    network: typeof settlement.network === 'string' ? settlement.network : '',
    transaction: typeof settlement.transaction === 'string' ? settlement.transaction : '',
    payer: typeof settlement.payer === 'string' ? settlement.payer : '',
    state: typeof settlement.state === 'string' ? settlement.state : 'UNKNOWN',
    ...(typeof settlement.errorReason === 'string' ? { errorReason: settlement.errorReason } : {}),
    ...(settlement.retrySamePayment === true ? { retrySamePayment: true } : {}),
  };
}

function definiteRejectionResponse(res, paymentRequired, settlement) {
  res.statusCode = 402;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader(HEADERS.PAYMENT_REQUIRED, encodeB64Json(paymentRequired));
  res.setHeader(HEADERS.PAYMENT_RESPONSE, encodeB64Json(settlement));
  res.end(JSON.stringify({ error: DEFINITIVE_SETTLEMENT_FAILURE }, null, 2));
}

function requirePayment(res, paymentRequired) {
  res.statusCode = 402;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader(HEADERS.PAYMENT_REQUIRED, encodeB64Json(paymentRequired));
  res.end(JSON.stringify({ error: paymentRequired.error ?? 'payment_required' }, null, 2));
}

function json(res, status, value) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(value, null, 2));
}

function setPaidResponsePolicy(res) {
  res.setHeader('cache-control', 'private, no-store, max-age=0');
  res.setHeader('vary', PAID_VARY_HEADER);
}
