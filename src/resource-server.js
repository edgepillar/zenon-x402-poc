import http from 'node:http';
import { Address } from 'znn-typescript-sdk';
import { paymentIntentDigest, sha256Hex } from './canonical.js';
import {
  decodeB64Json,
  encodeB64Json,
  EXPERIMENTAL_LIVE_NETWORK,
  HEADERS,
  MAX_X402_HEADER_ENCODED_BYTES,
  makePaymentRequired,
  MOCK_NETWORK,
  sameResource,
  sameRequirements,
  validateActiveUpfrontRequirement,
  validatePaymentPayloadEnvelope,
  validatePaymentPayloadStructure,
} from './x402-wire.js';

const MAX_CACHED_RESPONSE_BYTES = 64 * 1024;
const MAX_CACHED_RESPONSE_MEMBERS = 4096;
const MAX_CACHED_RESPONSE_NODES = 4096;
const MAX_JSON_DEPTH = 20;
const PAID_VARY_HEADER = 'PAYMENT-SIGNATURE';
const HASH_HEX = /^[0-9a-f]{64}$/;
const MOCK_PAYER = /^mock-[0-9a-f]{32}$/;
const DEFINITIVE_SETTLEMENT_FAILURE = 'payment_settlement_failed';
const MALFORMED_DEFINITE_REJECTION = Symbol('malformed-definite-rejection');
const RECOVERY_STATES = new Set([
  'SUBMISSION_ACKNOWLEDGED',
  'SUBMISSION_OUTCOME_UNKNOWN',
  'DELIVERY_PENDING',
]);
const POSITIVE_DELIVERY_STATES = new Set(['NONE', 'DELIVERY_PENDING', 'DELIVERED']);

export function createResourceServer({
  facilitator,
  requirement,
  port = 0,
  host = '127.0.0.1',
  advertisedBaseUrl,
  resourceHandler,
}) {
  if (resourceHandler !== undefined && typeof resourceHandler !== 'function') {
    throw new Error('resourceHandler must be a function');
  }
  const configuredRequirement = structuredClone(requirement);
  validateActiveUpfrontRequirement(configuredRequirement);
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
      if (signatureHeader === undefined) return requirePayment(res, paymentRequired);
      if (Array.isArray(signatureHeader) || typeof signatureHeader !== 'string') {
        return invalidPayment(res);
      }

      let paymentPayload;
      try {
        paymentPayload = decodeB64Json(signatureHeader, {
          maxDecodedBytes: MAX_X402_HEADER_ENCODED_BYTES,
          maxEncodedBytes: MAX_X402_HEADER_ENCODED_BYTES,
        });
        validateJsonValue(paymentPayload, 0, new Set(), { requireSafeIntegers: false });
        validatePaymentPayloadStructure(paymentPayload);
      } catch {
        return invalidPayment(res);
      }

      try {
        validatePaymentPayloadEnvelope(paymentPayload);
        validateActiveUpfrontRequirement(paymentPayload.accepted);
        if (!sameRequirements(paymentPayload.accepted, configuredRequirement)) {
          throw new Error('submitted payment requirement does not match the configured requirement');
        }
        if (!sameResource(paymentPayload.resource, paymentRequired.resource)) {
          throw new Error('submitted payment resource does not match the current challenge');
        }
      } catch {
        return requirePayment(res, { ...paymentRequired, error: 'invalid_payment_header' });
      }

      try {
        validateJsonValue(paymentPayload);
      } catch {
        return invalidPayment(res);
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

      const paymentResponseHeader = encodeX402Header(publicSettlement(outcome.settlement));
      const cached = outcome.cached;
      res.statusCode = cached.status;
      for (const [name, value] of Object.entries(cached.headers)) res.setHeader(name, value);
      setPaidResponsePolicy(res);
      res.setHeader(HEADERS.PAYMENT_RESPONSE, paymentResponseHeader);
      res.end(JSON.stringify(cached.body, null, 2));
    } catch {
      internalError(res);
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

function inspectOwnProperty(value, field) {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return { kind: 'invalid' };
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor) return { kind: 'missing' };
    if (!Object.hasOwn(descriptor, 'value')) return { kind: 'accessor' };
    return { kind: 'data', value: descriptor.value };
  } catch {
    return { kind: 'error' };
  }
}

function ownDataSnapshot(value, fields) {
  try {
    if (!isPlainObject(value)) return null;
  } catch {
    return null;
  }
  const snapshot = Object.create(null);
  for (const field of fields) {
    const property = inspectOwnProperty(value, field);
    if (property.kind !== 'data') return null;
    snapshot[field] = property.value;
  }
  return snapshot;
}

function submittedSettlementIdentity(paymentPayload, requirement, paymentRequired) {
  const transaction = paymentPayload.payload.transaction.hash;
  const intentDigest = paymentIntentDigest(paymentRequired, requirement);
  const resourceDigest = sha256Hex(paymentRequired.resource);
  return {
    network: requirement.network,
    acceptedNetwork: paymentPayload.accepted.network,
    transaction,
    payer: paymentPayload.payload.transaction.address,
    authorizationKey: sha256Hex({
      domain: 'zenon-x402-authorization-v1',
      chainProfile: requirement.extra.zenonChain,
      intentDigest,
      resourceDigest,
      transactionHash: transaction,
    }),
  };
}

function positiveSettlementEvidence(value, submitted) {
  const evidence = ownDataSnapshot(value, [
    'success', 'network', 'transaction', 'payer', 'state', 'authorizationKey', 'deliveryState',
  ]);
  if (!evidence || evidence.success !== true || evidence.state !== 'MOMENTUM_INCLUDED' ||
      !POSITIVE_DELIVERY_STATES.has(evidence.deliveryState) ||
      evidence.network !== submitted.network || submitted.acceptedNetwork !== submitted.network ||
      evidence.transaction !== submitted.transaction || !HASH_HEX.test(evidence.transaction) ||
      evidence.payer !== submitted.payer || !isCanonicalPayer(evidence.payer, submitted.network) ||
      evidence.authorizationKey !== submitted.authorizationKey ||
      !HASH_HEX.test(evidence.authorizationKey)) {
    return null;
  }
  const transactionHash = inspectOwnProperty(value, 'transactionHash');
  if ((transactionHash.kind !== 'missing' && transactionHash.kind !== 'data') ||
      (transactionHash.kind === 'data' && transactionHash.value !== evidence.transaction)) {
    return null;
  }
  return evidence;
}

function positiveTransitionEvidence(value, submitted, requiredFields) {
  const evidence = ownDataSnapshot(value, ['authorizationKey', 'payer', ...requiredFields]);
  if (!evidence) return null;
  const transaction = inspectOwnProperty(value, 'transaction');
  const transactionHash = inspectOwnProperty(value, 'transactionHash');
  if ((transaction.kind !== 'missing' && transaction.kind !== 'data') ||
      (transactionHash.kind !== 'missing' && transactionHash.kind !== 'data') ||
      (transaction.kind === 'missing' && transactionHash.kind === 'missing')) {
    return null;
  }
  if (transaction.kind === 'data' && transactionHash.kind === 'data' &&
      transaction.value !== transactionHash.value) {
    return null;
  }
  const normalizedTransaction = transaction.kind === 'data' ? transaction.value : transactionHash.value;
  if (evidence.authorizationKey !== submitted.authorizationKey ||
      evidence.payer !== submitted.payer || normalizedTransaction !== submitted.transaction) {
    return null;
  }
  return { ...evidence, transaction: normalizedTransaction };
}

function submittedPaymentRecovery(submitted, state = 'SUBMISSION_OUTCOME_UNKNOWN') {
  const outcomeUnknown = state === 'SUBMISSION_OUTCOME_UNKNOWN';
  return {
    kind: 'recovery',
    settlement: {
      success: false,
      network: submitted.network,
      transaction: submitted.transaction,
      payer: submitted.payer,
      state,
      errorReason: outcomeUnknown ? 'payment_outcome_unknown' : 'payment_reconciliation_required',
      retrySamePayment: true,
    },
  };
}

function submittedDeliveryRecovery(submitted) {
  return {
    kind: 'recovery',
    settlement: {
      success: false,
      network: submitted.network,
      transaction: submitted.transaction,
      payer: submitted.payer,
      state: 'DELIVERY_PENDING',
      deliveryState: 'DELIVERY_PENDING',
      errorReason: 'resource_delivery_outcome_unknown',
      retrySamePayment: true,
    },
  };
}

function deliveryCapabilities(facilitator) {
  try {
    const markDeliveryPending = facilitator.markDeliveryPending;
    const markDelivered = facilitator.markDelivered;
    if (typeof markDeliveryPending !== 'function' || typeof markDelivered !== 'function') return null;
    return { receiver: facilitator, markDeliveryPending, markDelivered };
  } catch {
    return null;
  }
}

function nonPositiveSettlementOutcome(value, submitted, success) {
  if (success.kind === 'accessor' || success.kind === 'error') {
    return submittedPaymentRecovery(submitted);
  }
  const retrySamePayment = inspectOwnProperty(value, 'retrySamePayment');
  const state = inspectOwnProperty(value, 'state');
  const isIncluded = state.kind === 'data' && state.value === 'MOMENTUM_INCLUDED';
  const deliveryState = isIncluded ? inspectOwnProperty(value, 'deliveryState') : { kind: 'missing' };
  const isRecognizedIncludedRecovery = isIncluded && deliveryState.kind === 'data' &&
    (deliveryState.value === 'NONE' || deliveryState.value === 'DELIVERY_PENDING');
  if (isRecognizedIncludedRecovery) return submittedDeliveryRecovery(submitted);
  if (isIncluded) return submittedDeliveryRecovery(submitted);
  if (retrySamePayment.kind === 'accessor' || retrySamePayment.kind === 'error' ||
      state.kind === 'accessor' || state.kind === 'error') {
    return submittedPaymentRecovery(submitted);
  }
  if (state.kind === 'data' && state.value === 'DELIVERY_PENDING') {
    return submittedDeliveryRecovery(submitted);
  }
  if (state.kind === 'data' && state.value === 'SUBMISSION_ACKNOWLEDGED') {
    return submittedPaymentRecovery(submitted, state.value);
  }
  if (state.kind === 'data' && state.value === 'VALIDATED' &&
      retrySamePayment.kind === 'data' && retrySamePayment.value === true) {
    return submittedPaymentRecovery(submitted, state.value);
  }
  if ((retrySamePayment.kind === 'data' && retrySamePayment.value === true) ||
      (state.kind === 'data' && RECOVERY_STATES.has(state.value))) {
    return submittedPaymentRecovery(submitted);
  }
  return { kind: 'payment-required' };
}

async function authorizeAndDeliver({ facilitator, paymentPayload, requirement, paymentRequired, resourceHandler }) {
  // Settlement owns strict offline verification, journal reconciliation,
  // frontier-sensitive checks, publication and Momentum-inclusion observation.
  // Calling verify() first would reject a safe retry after its frontier moved.
  const submittedIdentity = submittedSettlementIdentity(paymentPayload, requirement, paymentRequired);
  const settlementResult = await facilitator.settle(
    structuredClone(paymentPayload),
    structuredClone(requirement),
    structuredClone(paymentRequired),
  );
  const success = inspectOwnProperty(settlementResult, 'success');
  if (success.kind !== 'data' || success.value !== true) {
    const rejection = definiteRejectionEvidence(settlementResult, submittedIdentity);
    if (rejection === MALFORMED_DEFINITE_REJECTION) {
      return submittedPaymentRecovery(submittedIdentity);
    }
    if (rejection) return { kind: 'definite-rejection', settlement: rejection };
    return nonPositiveSettlementOutcome(settlementResult, submittedIdentity, success);
  }
  const settlement = positiveSettlementEvidence(settlementResult, submittedIdentity);
  if (!settlement) return submittedPaymentRecovery(submittedIdentity);
  const capabilities = deliveryCapabilities(facilitator);
  if (!capabilities) return submittedDeliveryRecovery(submittedIdentity);
  if (settlement.deliveryState === 'DELIVERED') {
    const cachedResponse = inspectOwnProperty(settlementResult, 'cachedResponse');
    if (cachedResponse.kind !== 'data') return submittedDeliveryRecovery(submittedIdentity);
    try {
      return {
        kind: 'delivered',
        settlement,
        cached: normalizeCachedResponse(cachedResponse.value),
      };
    } catch {
      return submittedDeliveryRecovery(submittedIdentity);
    }
  }
  if (settlement.deliveryState === 'DELIVERY_PENDING') {
    return deliveryRecovery(settlement, 'delivery_outcome_unknown', 'DELIVERY_PENDING');
  }

  let claim;
  try {
    const claimResult = await capabilities.markDeliveryPending.call(
      capabilities.receiver,
      structuredClone(settlement),
    );
    claim = positiveTransitionEvidence(
      claimResult,
      submittedIdentity,
      ['deliveryState', 'deliveryClaimed'],
    );
    if (!claim || !POSITIVE_DELIVERY_STATES.has(claim.deliveryState)) {
      return submittedDeliveryRecovery(submittedIdentity);
    }
    if (claim.deliveryState === 'DELIVERED') {
      if (claim.deliveryClaimed !== false) return submittedDeliveryRecovery(submittedIdentity);
      const cachedResponse = inspectOwnProperty(claimResult, 'cachedResponse');
      if (cachedResponse.kind !== 'data') return submittedDeliveryRecovery(submittedIdentity);
      return {
        kind: 'delivered',
        settlement: { ...settlement, deliveryState: 'DELIVERED' },
        cached: normalizeCachedResponse(cachedResponse.value),
      };
    }
  } catch {
    return submittedDeliveryRecovery(submittedIdentity);
  }
  if (claim.deliveryClaimed !== true || claim.deliveryState !== 'DELIVERY_PENDING') {
    return submittedDeliveryRecovery(submittedIdentity);
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
    const deliveredResult = await capabilities.markDelivered.call(
      capabilities.receiver,
      structuredClone(settlement),
      structuredClone(cached),
    );
    const delivered = positiveTransitionEvidence(
      deliveredResult,
      submittedIdentity,
      ['deliveryState', 'cachedResponse'],
    );
    if (!delivered || delivered.deliveryState !== 'DELIVERED') {
      return submittedDeliveryRecovery(submittedIdentity);
    }
    const persisted = normalizeCachedResponse(delivered.cachedResponse);
    if (JSON.stringify(persisted) !== JSON.stringify(cached)) {
      return submittedDeliveryRecovery(submittedIdentity);
    }
  } catch {
    return submittedDeliveryRecovery(submittedIdentity);
  }
  return { kind: 'delivered', settlement: { ...settlement, deliveryState: 'DELIVERED' }, cached };
}

function definiteRejectionEvidence(settlement, submitted) {
  const requiredFields = [
    'success', 'network', 'transaction', 'payer', 'state', 'retrySamePayment', 'deliveryState',
  ];
  const evidence = ownDataSnapshot(settlement, requiredFields);
  if (!evidence) return null;

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

  const transactionHash = inspectOwnProperty(settlement, 'transactionHash');
  if ((transactionHash.kind !== 'missing' && transactionHash.kind !== 'data') ||
      (transactionHash.kind === 'data' && transactionHash.value !== evidence.transaction)) {
    return MALFORMED_DEFINITE_REJECTION;
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
  const snapshot = cloneBoundedJson(value, MAX_CACHED_RESPONSE_BYTES);
  if (!isPlainObject(snapshot) || !exactKeys(snapshot, ['status', 'headers', 'body']) ||
      snapshot.status !== 200 || !isPlainObject(snapshot.headers) ||
      !exactKeys(snapshot.headers, ['content-type']) ||
      snapshot.headers['content-type'] !== 'application/json; charset=utf-8') {
    throw new Error('invalid cached response');
  }
  if (Buffer.byteLength(JSON.stringify(snapshot.body, null, 2), 'utf8') > MAX_CACHED_RESPONSE_BYTES) {
    throw new Error('cached response is too large');
  }
  return snapshot;
}

function cloneBoundedJson(value, maximumBytes) {
  const snapshot = snapshotJsonValue(value, 0, new Set(), {
    bytes: 0,
    members: 0,
    nodes: 0,
    maximumBytes,
    maximumMembers: MAX_CACHED_RESPONSE_MEMBERS,
    maximumNodes: MAX_CACHED_RESPONSE_NODES,
  });
  const encoded = JSON.stringify(snapshot);
  if (encoded === undefined || Buffer.byteLength(encoded, 'utf8') > maximumBytes) {
    throw new Error('JSON value is too large');
  }
  return snapshot;
}

function snapshotJsonValue(value, depth, seen, budget) {
  if (depth > MAX_JSON_DEPTH) throw new Error('JSON value is too deep');
  consumeBudget(budget, 'nodes', 1, budget.maximumNodes);
  if (value === null) {
    consumeBytes(budget, 4);
    return value;
  }
  if (typeof value === 'string') {
    consumeJsonString(budget, value);
    return value;
  }
  if (typeof value === 'boolean') {
    consumeBytes(budget, value ? 4 : 5);
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
      throw new Error('invalid JSON number');
    }
    consumeBytes(budget, Buffer.byteLength(String(value), 'utf8'));
    return value;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) throw new Error('invalid JSON value');

  let array;
  let prototype;
  let keys;
  try {
    array = Array.isArray(value);
    prototype = array ? Array.prototype : Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
  } catch {
    throw new Error('invalid JSON object');
  }
  if (!array && prototype !== Object.prototype && prototype !== null) {
    throw new Error('invalid JSON object');
  }

  seen.add(value);
  try {
    if (array) {
      if (keys.some(key => typeof key !== 'string') || !keys.includes('length')) {
        throw new Error('invalid JSON array');
      }
      const memberKeys = keys.filter(key => key !== 'length');
      consumeBudget(budget, 'members', memberKeys.length, budget.maximumMembers);
      const length = safeOwnDataDescriptor(value, 'length');
      if (!length || !Number.isSafeInteger(length.value) || length.value < 0 ||
          length.value !== memberKeys.length) {
        throw new Error('invalid JSON array');
      }
      const expectedKeys = new Set(Array.from({ length: length.value }, (_, index) => String(index)));
      if (memberKeys.some(key => !expectedKeys.has(key))) throw new Error('invalid JSON array');
      consumeBytes(budget, 2 + Math.max(0, length.value - 1));
      const snapshot = [];
      Object.setPrototypeOf(snapshot, null);
      for (let index = 0; index < length.value; index += 1) {
        const descriptor = safeOwnDataDescriptor(value, String(index), { enumerable: true });
        if (!descriptor) throw new Error('invalid JSON array');
        snapshot[index] = snapshotJsonValue(descriptor.value, depth + 1, seen, budget);
      }
      return Object.freeze(snapshot);
    }

    if (keys.some(key => typeof key !== 'string')) throw new Error('invalid JSON key');
    consumeBudget(budget, 'members', keys.length, budget.maximumMembers);
    consumeBytes(budget, 2 + Math.max(0, keys.length - 1));
    for (const key of keys) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) {
        throw new Error('invalid JSON key');
      }
      consumeJsonString(budget, key);
      consumeBytes(budget, 1);
    }

    const snapshot = Object.create(null);
    for (const key of keys) {
      const descriptor = safeOwnDataDescriptor(value, key, { enumerable: true });
      if (!descriptor) throw new Error('invalid JSON property');
      snapshot[key] = snapshotJsonValue(descriptor.value, depth + 1, seen, budget);
    }
    return Object.freeze(snapshot);
  } finally {
    seen.delete(value);
  }
}

function safeOwnDataDescriptor(value, key, { enumerable } = {}) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null;
    if (enumerable !== undefined && descriptor.enumerable !== enumerable) return null;
    return descriptor;
  } catch {
    return null;
  }
}

function consumeBudget(budget, field, amount, maximum) {
  if (!Number.isSafeInteger(amount) || amount < 0 || budget[field] > maximum - amount) {
    throw new Error('JSON value is too large');
  }
  budget[field] += amount;
}

function consumeBytes(budget, amount) {
  consumeBudget(budget, 'bytes', amount, budget.maximumBytes);
}

function consumeJsonString(budget, value) {
  const rawBytes = Buffer.byteLength(value, 'utf8');
  if (rawBytes > budget.maximumBytes - budget.bytes - 2) {
    throw new Error('JSON value is too large');
  }
  const encoded = JSON.stringify(value);
  consumeBytes(budget, Buffer.byteLength(encoded, 'utf8'));
}

function validateJsonValue(value, depth = 0, seen = new Set(), { requireSafeIntegers = true } = {}) {
  if (depth > MAX_JSON_DEPTH) throw new Error('JSON value is too deep');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (requireSafeIntegers && !Number.isSafeInteger(value))) {
      throw new Error('invalid JSON number');
    }
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
    validateJsonValue(item, depth + 1, seen, { requireSafeIntegers });
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
  const paymentResponseHeader = encodeX402Header(response);
  res.statusCode = 409;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader(HEADERS.PAYMENT_RESPONSE, paymentResponseHeader);
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
  const paymentRequiredHeader = encodeX402Header(paymentRequired);
  const paymentResponseHeader = encodeX402Header(settlement);
  res.statusCode = 402;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader(HEADERS.PAYMENT_REQUIRED, paymentRequiredHeader);
  res.setHeader(HEADERS.PAYMENT_RESPONSE, paymentResponseHeader);
  res.end(JSON.stringify({ error: DEFINITIVE_SETTLEMENT_FAILURE }, null, 2));
}

function invalidPayment(res) {
  res.removeHeader(HEADERS.PAYMENT_REQUIRED);
  res.removeHeader(HEADERS.PAYMENT_RESPONSE);
  return json(res, 400, { error: 'invalid_payment' });
}

function requirePayment(res, paymentRequired) {
  const paymentRequiredHeader = encodeX402Header(paymentRequired);
  res.statusCode = 402;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader(HEADERS.PAYMENT_REQUIRED, paymentRequiredHeader);
  res.end(JSON.stringify({ error: paymentRequired.error ?? 'payment_required' }, null, 2));
}

function encodeX402Header(value) {
  return encodeB64Json(value, { maxEncodedBytes: MAX_X402_HEADER_ENCODED_BYTES });
}

function internalError(res) {
  res.removeHeader(HEADERS.PAYMENT_REQUIRED);
  res.removeHeader(HEADERS.PAYMENT_RESPONSE);
  return json(res, 500, { error: 'internal_error' });
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
