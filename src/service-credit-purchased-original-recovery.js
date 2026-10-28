import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { snapshotPurchasedServiceTerms } from './service-purchase-terms.js';
import {
  parseOriginalServiceRequestCustody,
  serializeOriginalServiceRequestCustody,
} from './service-credit-original-request-custody-contract.js';
import { restoreOriginalPaymentCheckpoint } from './service-credit-pilot-original-payment-checkpoint.js';
import {
  decodeB64Json, encodeB64Json, validatePaymentRequired, validatePaymentPayloadEnvelope,
  validateActiveUpfrontRequirement, sameRequirements, sameResource,
} from './x402-wire.js';
import { paymentIntentDigest } from './canonical.js';

const PROFILE = 'zenon-x402.purchased-original.v1';
const FIELDS = ['purchaseVersion', 'profile', 'termsJson', 'serviceRequestCustodyJson', 'paymentCheckpointJson'];
const MAX_RECORD_BYTES = 65536;
const freeze = Object.freeze;

function reject(suffix = 'INVALID_INPUT') {
  const code = `PURCHASED_ORIGINAL_RECOVERY_${suffix}`;
  const error = new TypeError(code);
  Object.defineProperties(error, {
    code: { value: code, enumerable: true },
    stack: { value: `TypeError: ${code}` },
  });
  throw freeze(error);
}

function text(value, limit) {
  if (typeof value !== 'string' || !value.length || value.length > limit
      || Buffer.byteLength(value) > limit || Buffer.from(value).toString() !== value) reject();
  return value;
}

function parse(value, limit) {
  text(value, limit);
  try { return JSON.parse(value); } catch { reject(); }
}

function data(value, key) {
  if (value === null || typeof value !== 'object' || types.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype) reject();
  const d = Object.getOwnPropertyDescriptor(value, key);
  if (!d?.enumerable || !Object.hasOwn(d, 'value')) reject();
  return d.value;
}

function digest(recordJson) {
  return 'sha256:' + createHash('sha256').update(PROFILE).update('\0').update(recordJson).digest('hex');
}

function checkedJoin(termsJson, serviceRequestCustodyJson, paymentCheckpointJson, paymentPinsJson) {
  const terms = snapshotPurchasedServiceTerms(termsJson);
  const original = parseOriginalServiceRequestCustody(serviceRequestCustodyJson);
  const checkpoint = restoreOriginalPaymentCheckpoint(paymentCheckpointJson, parse(paymentPinsJson, 4096));
  const options = { maxDecodedBytes: 4096, maxEncodedBytes: 5464 };
  const required = decodeB64Json(checkpoint.originalBytes.paymentRequirements, options);
  const payload = decodeB64Json(checkpoint.originalBytes.paymentPayload, options);
  validatePaymentRequired(required);
  validatePaymentPayloadEnvelope(payload);
  const selected = payload.accepted;
  validateActiveUpfrontRequirement(selected);
  // Amount is the total quoted integer amount. Quantity is not a multiplier.
  // Beneficiary denotes the purchased service beneficiary, not the payee.
  if (checkpoint.originalBytes.requestBody !== '' || required.accepts.length !== 1
      || encodeB64Json(required) !== checkpoint.originalBytes.paymentRequirements
      || encodeB64Json(payload) !== checkpoint.originalBytes.paymentPayload
      || !sameResource(required.resource, payload.resource)
      || !sameRequirements(required.accepts[0], selected)
      || required.resource.url !== original.fundingResourceUrl
      || new URL(original.fundingResourceUrl).origin !== checkpoint.binding.origin
      || original.paymentHash !== checkpoint.binding.paymentHash
      || original.network !== selected.network || terms.network !== selected.network
      || terms.price.asset !== selected.asset || terms.price.amount !== selected.amount
      || terms.price.unit !== 'zenon-atomic'
      || payload.payload.transaction.hash !== checkpoint.binding.paymentHash
      || payload.payload.transaction.address !== terms.holder
      || payload.payload.intentDigest !== paymentIntentDigest(required, selected)) {
    reject('ORIGINAL_BINDING_MISMATCH');
  }
  return freeze({ terms, original, checkpoint });
}

function joined(termsJson, serviceRequestCustodyJson, paymentCheckpointJson, paymentPinsJson) {
  try { return checkedJoin(termsJson, serviceRequestCustodyJson, paymentCheckpointJson, paymentPinsJson); }
  catch { reject('ORIGINAL_BINDING_MISMATCH'); }
}

/**
 * Bind retained terms to the real custody/checkpoint codecs. Independent
 * checkpoint pins are mandatory. Hashes and declared wire fields are metadata
 * comparisons; no signature, chain payment, delivery or authority is verified.
 * Persist recordJson and retain recordDigest separately before relying on it.
 */
export function capturePurchasedServiceOriginal(termsJson, serviceRequestCustodyJson,
  paymentCheckpointJson, paymentPinsJson) {
  if (arguments.length !== 4) reject();
  joined(termsJson, serviceRequestCustodyJson, paymentCheckpointJson, paymentPinsJson);
  const recordJson = JSON.stringify({ purchaseVersion: 1, profile: PROFILE,
    termsJson, serviceRequestCustodyJson, paymentCheckpointJson });
  text(recordJson, MAX_RECORD_BYTES);
  return freeze({ recordJson, recordDigest: digest(recordJson) });
}

export function restorePurchasedServiceOriginal(recordJson, expectedDigest, paymentPinsJson) {
  if (arguments.length !== 3 || typeof expectedDigest !== 'string'
      || !/^sha256:[0-9a-f]{64}$/.test(expectedDigest)) reject();
  const record = parse(recordJson, MAX_RECORD_BYTES);
  if (record === null || typeof record !== 'object' || Array.isArray(record)
      || Object.keys(record).length !== FIELDS.length
      || !FIELDS.every(key => Object.hasOwn(record, key))
      || record.purchaseVersion !== 1 || record.profile !== PROFILE) reject();
  const canonical = JSON.stringify(Object.fromEntries(FIELDS.map(key => [key, record[key]])));
  if (canonical !== recordJson || digest(recordJson) !== expectedDigest) reject('PURCHASE_CHANGED');
  return freeze({ recordJson, recordDigest: expectedDigest,
    ...joined(record.termsJson, record.serviceRequestCustodyJson, record.paymentCheckpointJson, paymentPinsJson) });
}

function noAuthority(state) {
  if (data(state, 'recoveryVersion') !== 1 || data(state, 'authority') !== 'NONE'
      || data(state, 'mayStartPayment') !== false || data(state, 'maySignPayment') !== false
      || data(state, 'mayDispatchService') !== false || data(state, 'deliveryConfirmed') !== false
      || data(state, 'serviceDelivery') !== 'NOT_ESTABLISHED'
      || data(state, 'currentAuthority') !== 'NOT_ESTABLISHED') reject('UNSAFE_RECOVERY_VIEW');
}

function status(value) {
  if (typeof value !== 'string' || /^[A-Z][A-Z0-9_]{0,127}$/.exec(value)?.[0] !== value) reject();
  return value;
}

/**
 * Wrap an existing V6 readOriginalBackendRecoveryState capability. Acquisition,
 * store ownership, admission and before/after read fencing remain in that core.
 * This wrapper fixes the purchased original and independent checkpoint pins;
 * it neither acquires nor closes the borrowed core or its stores.
 */
export function createPurchasedServiceOriginalRecoveryReader(recordJson, expectedDigest,
  paymentPinsJson, originalRecovery) {
  if (arguments.length !== 4) reject();
  const purchase = restorePurchasedServiceOriginal(recordJson, expectedDigest, paymentPinsJson);
  let read = data(originalRecovery, 'readOriginalBackendRecoveryState');
  if (typeof read !== 'function') reject();
  let dependency = originalRecovery;
  const key = freeze({ grantId: purchase.original.grantId, requestId: purchase.original.requestId });
  const pins = freeze({ binding: purchase.checkpoint.binding, digests: purchase.checkpoint.digests });
  const expected = freeze(JSON.parse(purchase.original.originalRequestJson));
  const originalText = serializeOriginalServiceRequestCustody(purchase.original);
  let closed = false, busy = false, unavailable = false;

  function readOriginalPurchaseRecovery(authorizationHeader) {
    if (closed) reject('CLOSED');
    if (busy) reject('BUSY');
    if (unavailable) reject('UNAVAILABLE');
    if (arguments.length !== 1 || typeof authorizationHeader !== 'string'
        || !authorizationHeader.length || Buffer.byteLength(authorizationHeader) > 1024) reject();
    busy = true;
    try {
      const observed = Reflect.apply(read, dependency, [key, authorizationHeader, pins]);
      if (closed) reject('CLOSED');
      noAuthority(observed);
      const recoveryStatus = status(data(observed, 'status'));
      const local = data(observed, 'local'), backend = data(observed, 'backend');
      if (local === null) {
        if (backend !== null) reject('ORIGINAL_BINDING_MISMATCH');
      } else if (serializeOriginalServiceRequestCustody(data(local, 'original')) !== originalText) {
        reject('ORIGINAL_BINDING_MISMATCH');
      }
      let reportedBackendStatus = null;
      if (backend !== null) {
        reportedBackendStatus = status(data(backend, 'status'));
        if (data(backend, 'deliveryStatus') !== 'NOT_ESTABLISHED'
            || data(backend, 'executionAuthorized') !== false
            || data(backend, 'paymentAuthorized') !== false
            || data(backend, 'signingAuthorized') !== false) reject('UNSAFE_RECOVERY_VIEW');
        const request = data(backend, 'originalRequest');
        const execution = data(backend, 'execution');
        for (const observedRequest of [request, execution === null ? null : data(execution, 'request')]) {
          if (observedRequest !== null && !Object.keys(expected).every(name => data(observedRequest, name) === expected[name])) {
            reject('ORIGINAL_BINDING_MISMATCH');
          }
        }
        if (reportedBackendStatus === 'CACHED_SUCCESS' && (request === null || execution === null)) {
          reject('ORIGINAL_BINDING_MISMATCH');
        }
      }
      return freeze({ purchaseVersion: 1, orderId: purchase.terms.orderId,
        productId: purchase.terms.productId, recordDigest: purchase.recordDigest,
        originalMatched: local !== null, recoveryStatus, reportedBackendStatus,
        deliveryStatus: 'NOT_ESTABLISHED', deliveredQuantity: null,
        paymentVerification: 'NOT_PERFORMED', compensationStatus: 'NOT_ESTABLISHED',
        authority: 'NONE', mayStartPayment: false, maySignPayment: false,
        mayDispatchService: false, requiresReconciliation: true });
    } catch {
      unavailable = true;
      if (closed) reject('CLOSED');
      // Omit private headers, transactions and callback diagnostics.
      reject('READ_FAILED');
    } finally {
      busy = false;
      authorizationHeader = null;
    }
  }

  return freeze({ readOriginalPurchaseRecovery,
    close() { closed = true; read = null; dependency = null; },
    snapshot() { return freeze({ closed, busy, unavailable, authority: 'NONE' }); } });
}
