import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { capturePurchasedOrderPayment } from './service-purchase-order-funding.js';
import { capturePurchaseStorageOriginal } from './service-purchase-storage-contract.js';
import { restorePurchasedServiceOriginal } from './service-credit-purchased-original-recovery.js';
import { snapshotOriginalServiceRequestCustodyPolicy } from './service-credit-original-request-custody-contract.js';
import {
  captureServiceCreditOriginalFundingIdentity,
  captureServiceCreditOriginalFundingGrantResult,
} from './service-credit-original-funding-grant.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, APPLY = Reflect.apply;
const NP = Promise, PP = NP.prototype, THEN = PP.then;
const CTOR = D(PP, 'constructor'), SPECIES = D(NP, Symbol.species);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, HASH = /^sha256:[0-9a-f]{64}$/;
const REQUEST = ['modelVersion', 'grantId', 'requestId', 'requestDigest', 'offerId', 'offerVersion',
  'method', 'routeId', 'canonicalBodyDigest', 'selectedContentType', 'maxCostUnits', 'costUnits', 'state', 'cachedResult'];
function fail(suffix = 'INPUT') {
  const code = 'ORDER_RECORDED_DELIVERY_' + suffix, e = new TypeError(code);
  Object.defineProperties(e, { code: { value: code, enumerable: true }, stack: { value: 'TypeError: ' + code } }); throw F(e);
}
function member(value, key) {
  if (value === null || typeof value !== 'object' || types.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const d = D(value, key); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); return d.value;
}
function fields(value, names) {
  const out = {};
  for (const key of names) out[key] = member(value, key);
  if (Reflect.ownKeys(value).length !== names.length) fail(); return out;
}
function method(value, key) {
  const fn = member(value, key); if (typeof fn !== 'function' || types.isProxy(fn)) fail();
  return (...args) => APPLY(fn, value, args);
}
function identifier(value) { if (typeof value !== 'string' || ID.exec(value)?.[0] !== value) fail(); return value; }
function hash(value) { if (typeof value !== 'string' || HASH.exec(value)?.[0] !== value) fail(); return value; }
function integer(value) { if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < 1) fail(); return value; }
function digest(domain, value) { return 'sha256:' + createHash('sha256').update(domain).update('\0').update(canonicalJson(value)).digest('hex'); }
function sameDescriptor(a, b) {
  if (!a || !b) return false;
  const keys = Reflect.ownKeys(b); if (Reflect.ownKeys(a).length !== keys.length) return false;
  for (let i = 0; i < keys.length; i++) if (!Object.hasOwn(a, keys[i]) || a[keys[i]] !== b[keys[i]]) return false;
  return true;
}
function discardKnownPromise(value) {
  // Never assimilate thenables or inspect a proxy/species hook. A non-synchronous
  // reader still poisons this adapter; observation only avoids an unhandled
  // rejection for the unchanged native Promise shape.
  try {
    if (value === null || typeof value !== 'object' || types.isProxy(value) || !types.isPromise(value)
        || Object.getPrototypeOf(value) !== PP || D(value, 'then') !== undefined
        || !sameDescriptor(D(PP, 'constructor'), CTOR) || !sameDescriptor(D(NP, Symbol.species), SPECIES)) return;
    const ctor = D(value, 'constructor');
    if (ctor === undefined) Object.defineProperty(value, 'constructor', { value: NP });
    else if (!Object.hasOwn(ctor, 'value') || ctor.value !== NP) return;
    APPLY(THEN, value, [() => undefined, () => undefined]);
  } catch { /* The unavailable synchronous result is never repaired. */ }
}

/**
 * Opt-in bridge from the selected provider ledger's recorded success to the
 * existing order-liability verifier port. The ledger is a trusted, synchronous,
 * read-only capability; this module does not authenticate a backend or funding.
 *
 * One api-call is one successful 2xx recorded request. All other results refuse
 * a delivery receipt, including missing records and FAILED_RELEASED. They never
 * become NOT_PERFORMED or compensation evidence. Original expiry/revocation do
 * not erase completed delivery. No clock, pricing, grant activation, debit,
 * dispatch, reconciliation, signing, payment or borrowed-store close is called.
 */
export function createPurchasedOrderRecordedDeliveryVerifier(termsJson, termsDigest, paymentCheckpointJson, paymentPinsJson, fundingContextJson, ports) {
  if (arguments.length !== 6) fail();
  const p = capturePurchasedOrderPayment(termsJson, termsDigest, paymentCheckpointJson, paymentPinsJson, fundingContextJson);
  if (p.rules.quantityUnit !== 'api-call') fail('QUANTITY_UNIT');
  const config = fields(ports, ['ledger', 'serviceResourceUrl', 'maximumAttempts']);
  const service = snapshotOriginalServiceRequestCustodyPolicy({ policyVersion: 1, maxRequests: 1,
    serviceResourceUrl: config.serviceResourceUrl }, p.verifierContext.resourceUrl).serviceResourceUrl;
  const readGrant = method(config.ledger, 'readOriginalFundingGrant'), readRequest = method(config.ledger, 'getRequest');
  const limit = integer(config.maximumAttempts); if (limit > 4096) fail();
  const target = p.target, identity = captureServiceCreditOriginalFundingIdentity({
    transactionId: target.transactionId, network: target.network, chainProfile: p.verifierContext.authorityProfile.chainProfile,
    asset: target.asset, amount: target.amount, payee: target.payee, offerId: target.offerId, offerVersion: target.offerVersion,
    holderId: p.terms.holder, capabilityCommitment: target.capabilityCommitment, paymentResourceDigest: target.paymentResourceDigest,
    paymentRequirementDigest: target.paymentRequirementDigest, paymentIntentDigest: target.paymentIntentDigest,
    grantFundingCommitment: target.grantFundingCommitment,
  });
  let attempts = 0, busy = false, held = false, closed = false;
  function after() { if (closed || held) { held = true; fail(closed ? 'CLOSED' : 'HELD'); } }
  function read(fn, argument, capture) {
    let result;
    try { result = fn(argument); after(); return capture(result); }
    catch { held = true; discardKnownPromise(result); fail(closed ? 'CLOSED' : 'READ_UNKNOWN'); }
  }
  const verifyDelivery = F(function verifyDelivery(candidate, context) {
    if (arguments.length !== 2) fail();
    if (closed || held || busy) { if (busy) held = true; fail(closed ? 'CLOSED' : held ? 'HELD' : 'BUSY'); }
    // Validate all caller-provided bindings before borrowing either reader.
    if (candidate !== hash(member(context, 'originalDigest'))) fail('ORIGINAL_CONFLICT');
    const o = capturePurchaseStorageOriginal(member(context, 'originalJson'), candidate, paymentPinsJson, termsDigest);
    if (o.orderId !== p.orderId || o.termsJson !== termsJson || o.paymentScope !== p.paymentScope
        || o.paymentCheckpointJson !== paymentCheckpointJson || member(context, 'termsJson') !== termsJson
        || member(context, 'termsDigest') !== termsDigest || member(context, 'orderId') !== p.orderId
        || member(context, 'paymentScope') !== p.paymentScope || member(context, 'paymentRecordDigest') !== p.paymentRecordDigest
        || member(context, 'requestScope') !== o.requestScope || member(context, 'requestId') !== o.requestId
        || member(context, 'grantId') !== o.grantId || member(context, 'serviceResourceUrl') !== o.serviceResourceUrl
        || o.serviceResourceUrl !== service
        || member(context, 'quantity') !== 1) fail('ORIGINAL_CONFLICT');
    const deliveryId = identifier(member(context, 'deliveryId'));
    const original = restorePurchasedServiceOriginal(o.recordJson, candidate, paymentPinsJson).original;
    const expected = JSON.parse(original.originalRequestJson);
    if (attempts >= limit) fail('ATTEMPT_LIMIT');
    attempts++; busy = true;
    try {
      const grant = read(readGrant, identity, value => captureServiceCreditOriginalFundingGrantResult(value, identity));
      if (grant.status !== 'RECORDED' || grant.record.grantId !== o.grantId
          || grant.record.totalUnits !== target.totalUnits || grant.record.expiresAt !== target.expiresAt) fail('GRANT_CONFLICT');
      const key = F({ grantId: o.grantId, requestId: o.requestId });
      const row = read(readRequest, key, value => value === null ? null : fields(value, REQUEST));
      if (row === null) fail('NOT_RECORDED');
      for (const key of Object.keys(expected)) if (row[key] !== expected[key]) fail('REQUEST_CONFLICT');
      if (row.offerId !== target.offerId || row.offerVersion !== target.offerVersion) fail('REQUEST_CONFLICT');
      const cost = integer(row.costUnits);
      if (cost > expected.maxCostUnits || cost > target.totalUnits) fail('REQUEST_CONFLICT');
      // The model uses plain canonical SHA-256 for requestDigest (no domain).
      const exactDigest = 'sha256:' + createHash('sha256').update(canonicalJson({ modelVersion: row.modelVersion,
        grantId: row.grantId, offerId: row.offerId, offerVersion: row.offerVersion, method: row.method, routeId: row.routeId,
        canonicalBodyDigest: row.canonicalBodyDigest, selectedContentType: row.selectedContentType,
        maxCostUnits: row.maxCostUnits, costUnits: cost })).digest('hex');
      if (hash(row.requestDigest) !== exactDigest) fail('REQUEST_CONFLICT');
      if (row.state !== 'SUCCEEDED') fail('NOT_SUCCEEDED');
      const result = fields(row.cachedResult, ['statusCode', 'contentType', 'resultCode']);
      if (!Number.isSafeInteger(result.statusCode) || result.statusCode < 200 || result.statusCode > 299
          || result.contentType !== expected.selectedContentType) fail('RESULT_NOT_DELIVERED');
      identifier(result.resultCode); after();
      const resultDigest = digest('zenon-x402:recorded-api-delivery:v1', { originalDigest: candidate,
        paymentScope: p.paymentScope, requestScope: o.requestScope, requestDigest: exactDigest, cachedResult: result });
      return JSON.stringify({ version: 1, kind: 'EXACT_SERVICE_DELIVERY_V1', deliveryId, requestScope: o.requestScope,
        originalDigest: candidate, quantity: 1, status: 'DELIVERED', resultDigest,
        evidenceId: 'recorded.' + resultDigest.slice(7) });
    } finally { busy = false; }
  });
  return F({ verifyDelivery,
    close: F(function close() { if (arguments.length !== 0) fail(); closed = true; if (busy) held = true; }),
    snapshot: F(function snapshot() { if (arguments.length !== 0) fail(); return F({ attempts, maximumAttempts: limit, busy, closed, held,
      authority: 'NONE', ledger: 'BORROWED_READ_ONLY_NOT_CLOSED', physicalResourceRelease: 'NOT_QUALIFIED' }); }),
  });
}
