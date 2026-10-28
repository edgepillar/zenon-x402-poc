import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalJson, paymentIntentDigest } from './canonical.js';
import { snapshotPurchasedServiceTerms } from './service-purchase-terms.js';
import { capturePurchaseStorageTerms } from './service-purchase-storage-contract.js';
import { purchasedFulfillmentPolicyDigest } from './service-purchase-fulfillment.js';
import { restoreOriginalPaymentCheckpoint } from './service-credit-pilot-original-payment-checkpoint.js';
import { decodeB64Json, validatePaymentPayloadEnvelope, validatePaymentRequired } from './x402-wire.js';
import {
  captureVerifiedZenonIssuedFunding,
  deriveZenonFundingObserverTarget,
  verifyZenonIssuedFundingWithoutActivation,
} from './service-credit-zenon-funding-evidence.js';

const PROFILE = 'zenon-x402.order-funding.v1';
const CONTEXT = ['version', 'orderId', 'acceptedTermsDigest', 'policyJson', 'offer', 'challenge', 'authorityProfile'];
const FRAME = ['version', 'profile', 'orderId', 'paymentScope', 'paymentRecordJson', 'paymentRecordDigest',
  'maximumVerificationAttempts', 'attempts', 'phase', 'candidateJson', 'candidateDigest',
  'verifiedRecordJson', 'sourceSettlementId', 'verificationObservedAtMs'];
const NATIVE_PROMISE = Promise;
function fail(suffix = 'INVALID_INPUT') {
  const code = 'ORDER_FUNDING_' + suffix, error = new TypeError(code);
  Object.defineProperties(error, { code: { value: code, enumerable: true }, stack: { value: 'TypeError: ' + code } });
  throw Object.freeze(error);
}
function text(raw, cap) {
  if (typeof raw !== 'string' || !raw.length || raw.length > cap || Buffer.byteLength(raw) > cap
      || Buffer.from(raw).toString() !== raw) fail(); return raw;
}
function shape(value, fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== fields.length
      || !fields.every(k => Object.hasOwn(value, k))) fail();
  return Object.fromEntries(fields.map(k => [k, value[k]]));
}
function json(raw, cap = 131072) {
  text(raw, cap); let value; try { value = JSON.parse(raw); } catch { fail(); }
  if (value === null || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value) !== raw) fail(); return value;
}
function decode(raw, fields, cap) {
  const value = shape(json(raw, cap), fields); if (JSON.stringify(value) !== raw) fail(); return value;
}
function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(); return value;
}
function digest(domain, raw) { return 'sha256:' + createHash('sha256').update(domain).update('\0').update(raw).digest('hex'); }
function member(object, name) {
  if (object === null || typeof object !== 'object' || types.isProxy(object) || Object.getPrototypeOf(object) !== Object.prototype) fail();
  const d = Object.getOwnPropertyDescriptor(object, name);
  if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); return d.value;
}
function method(object, name) {
  const fn = member(object, name); if (typeof fn !== 'function' || types.isProxy(fn)) fail();
  return (...args) => Reflect.apply(fn, object, args);
}
function freeze(value) {
  if (value !== null && typeof value === 'object') { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
}
function candidate(raw) {
  const value = decode(raw, ['evidenceVersion', 'artifact'], 16384);
  if (value.evidenceVersion !== 1 || value.artifact === null || typeof value.artifact !== 'object' || Array.isArray(value.artifact)) fail();
  return freeze(value);
}

/**
 * Real checkpoint and issuance codecs; caller-selected independent pins and
 * accepted terms are required. No grant or original API request is required.
 * A paymentRecordDigest is a checksum, not authentication or a storage pin.
 */
export function capturePurchasedOrderPayment(termsJson, termsDigest, paymentCheckpointJson, paymentPinsJson, fundingContextJson) {
  if (arguments.length !== 5) fail();
  const accepted = capturePurchaseStorageTerms(termsJson, termsDigest), terms = snapshotPurchasedServiceTerms(termsJson);
  const context = decode(fundingContextJson, CONTEXT, 65536);
  if (context.version !== 1 || context.orderId !== terms.orderId || context.acceptedTermsDigest !== termsDigest
      || context.offer?.serviceId !== terms.productId
      || purchasedFulfillmentPolicyDigest(context.policyJson) !== terms.conditionsDigest) fail('TERMS_CONFLICT');
  const rules = JSON.parse(context.policyJson);
  const checkpoint = restoreOriginalPaymentCheckpoint(paymentCheckpointJson, json(paymentPinsJson, 4096));
  const options = { maxEncodedBytes: 5464, maxDecodedBytes: 4096 };
  const required = decodeB64Json(checkpoint.originalBytes.paymentRequirements, options);
  const payload = decodeB64Json(checkpoint.originalBytes.paymentPayload, options);
  validatePaymentRequired(required); validatePaymentPayloadEnvelope(payload);
  if (checkpoint.originalBytes.requestBody !== '' || required.accepts.length !== 1
      || canonicalJson(required) !== canonicalJson(context.challenge?.paymentRequired)
      || canonicalJson(payload.accepted) !== canonicalJson(required.accepts[0])
      || canonicalJson(payload.resource) !== canonicalJson(required.resource)
      || payload.payload.intentDigest !== paymentIntentDigest(required, payload.accepted)
      || payload.payload.transaction.hash !== checkpoint.binding.paymentHash
      || payload.payload.transaction.address !== terms.holder
      || payload.accepted.network !== terms.network || payload.accepted.asset !== terms.price.asset
      || terms.price.unit !== 'zenon-atomic' || payload.accepted.amount !== terms.price.amount
      || new URL(required.resource.url).origin !== checkpoint.binding.origin) fail('PAYMENT_CONFLICT');
  const verifierContext = { offer: context.offer, challenge: context.challenge, authorityProfile: context.authorityProfile,
    transactionHash: checkpoint.binding.paymentHash, payer: terms.holder, resourceUrl: required.resource.url };
  const target = deriveZenonFundingObserverTarget(verifierContext);
  if (rules.offerExpiresAtMs !== target.expiresAt) fail('ISSUED_EXPIRY_CONFLICT');
  const chain = payload.accepted.extra.zenonChain;
  const paymentScope = digest('zenon-x402:purchase-payment-scope:v1', JSON.stringify({ network: terms.network,
    chainIdentifier: chain.chainIdentifier, genesisMomentumHash: chain.genesisMomentumHash, paymentHash: checkpoint.binding.paymentHash }));
  const paymentRecordJson = JSON.stringify({ version: 1, profile: PROFILE, termsJson, paymentCheckpointJson, fundingContextJson });
  text(paymentRecordJson, 131072);
  return freeze({ ...accepted, terms, rules, checkpoint, target, verifierContext, paymentScope, paymentRecordJson,
    paymentRecordDigest: digest(PROFILE + ':original', paymentRecordJson), independentPinsChecked: true });
}

/**
 * Fixed receipt-store port MUST durably enforce atomic exact-string CAS,
 * monotonic revisions/fencing and paymentScope uniqueness across orderIds.
 * No delivery, grant, signing, dispatch, payout or resource-release port exists.
 * Acknowledgement loss holds this owner; another owner reconciles the same
 * bytes. Recovering a verified receipt rebinds it but does not reauthenticate it:
 * only the selected trusted writer/store may supply persisted verifier results.
 */
export function createPurchasedOrderFundingOwner(termsJson, termsDigest, paymentCheckpointJson, paymentPinsJson, fundingContextJson, ports) {
  if (arguments.length !== 6) fail();
  const p = capturePurchasedOrderPayment(termsJson, termsDigest, paymentCheckpointJson, paymentPinsJson, fundingContextJson);
  const store = member(ports, 'receiptStore'), load = method(store, 'load'), cas = method(store, 'compareAndSwap');
  const verifyFundingEvidence = member(ports, 'verifyFundingEvidence'), clock = member(ports, 'clock');
  const maximumVerificationAttempts = integer(member(ports, 'maximumVerificationAttempts'), 1, 32);
  if (typeof verifyFundingEvidence !== 'function' || types.isProxy(verifyFundingEvidence)
      || typeof clock !== 'function' || types.isProxy(clock)) fail();
  const binding = { version: 1, profile: PROFILE, orderId: p.orderId, paymentScope: p.paymentScope,
    paymentRecordJson: p.paymentRecordJson, paymentRecordDigest: p.paymentRecordDigest, maximumVerificationAttempts };
  let closed = false, held = false, recovered = false, current = null, active = null, closing = null;
  function alive() { if (closed) fail('CLOSED'); if (held) fail('HELD'); if (active) fail('BUSY'); }
  function afterPort() { if (closed) { held = true; fail('CLOSED'); } }
  function now() {
    let value; try { value = clock(); afterPort(); integer(value); }
    catch { held = true; fail(closed ? 'CLOSED' : 'CLOCK_UNKNOWN'); } return value;
  }
  function start(needsRecovery = true) {
    alive(); if (needsRecovery && !recovered) fail('RECOVERY_REQUIRED');
    let resolve; const done = new NATIVE_PROMISE(r => { resolve = r; }); active = { done, resolve };
  }
  function finish() { const prior = active; active = null; prior.resolve(); }
  function initial() {
    return { ...binding, attempts: 0, phase: 'RETAINED', candidateJson: null, candidateDigest: null,
      verifiedRecordJson: null, sourceSettlementId: null, verificationObservedAtMs: null };
  }
  function state(raw) {
    const s = decode(raw, FRAME, 524288);
    if (!Object.keys(binding).every(k => s[k] === binding[k])) fail('BINDING_CONFLICT');
    integer(s.attempts, 0, maximumVerificationAttempts);
    if (!['RETAINED', 'VERIFYING', 'REJECTED', 'VERIFIED'].includes(s.phase)) fail();
    if (s.phase === 'RETAINED') {
      if (s.attempts !== 0 || s.candidateJson !== null || s.candidateDigest !== null) fail();
    } else {
      if (s.attempts < 1) fail(); candidate(s.candidateJson);
      if (s.candidateDigest !== digest(PROFILE + ':candidate', s.candidateJson)) fail();
    }
    if (s.phase === 'VERIFIED') {
      const verified = captureVerifiedZenonIssuedFunding({ verifiedRecord: json(s.verifiedRecordJson, 16384), ...p.verifierContext });
      if (s.sourceSettlementId !== verified.sourceSettlementId || JSON.stringify(verified.verifiedRecord) !== s.verifiedRecordJson) fail();
      integer(s.verificationObservedAtMs);
    } else if (s.verifiedRecordJson !== null || s.sourceSettlementId !== null || s.verificationObservedAtMs !== null) fail();
    return s;
  }
  function commit(s) {
    const proposed = JSON.stringify(s); state(proposed); let observed;
    try { observed = cas(p.orderId, p.paymentScope, current, proposed); afterPort(); }
    catch { held = true; fail(closed ? 'CLOSED' : 'COMMIT_UNKNOWN'); }
    if (observed !== proposed) { held = true; fail(observed === null ? 'CONFLICT' : 'COMMIT_UNKNOWN'); }
    current = proposed; return s;
  }
  function view(s) {
    const at = now(), verified = s.phase === 'VERIFIED';
    return Object.freeze({ orderId: p.orderId, paymentScope: p.paymentScope, originalRetained: true,
      phase: s.phase, verificationAttempts: s.attempts, maximumVerificationAttempts,
      fundingStatus: verified ? 'SELECTED_VERIFIER_RECORDED' : 'NOT_VERIFIED',
      liability: verified ? 'DELIVERY_OR_COMPENSATION_OWED' : 'PAYMENT_NOT_VERIFIED',
      quantityUnit: p.rules.quantityUnit, purchasedQuantity: p.terms.quantity, quantityOwed: verified ? p.terms.quantity : 0,
      grantFundingUnits: p.target.totalUnits, offerExpired: at >= p.rules.offerExpiresAtMs,
      reservationExpired: at >= p.rules.reservationExpiresAtMs,
      paymentAtMs: null, paymentWasLate: null,
      verificationObservedAtMs: s.verificationObservedAtMs,
      verificationObservedAfterOfferExpiry: verified ? s.verificationObservedAtMs >= p.rules.offerExpiresAtMs : null,
      sourceSettlementId: s.sourceSettlementId, grantCreated: false, deliveryStatus: 'NOT_ESTABLISHED', authority: 'NONE',
      physicalResourceRelease: 'NOT_QUALIFIED' });
  }
  const recover = function recover() {
    if (arguments.length !== 0) fail(); start(false);
    try {
      if (recovered) fail('ALREADY_RECOVERED'); let raw;
      try { raw = load(p.orderId, p.paymentScope); afterPort(); }
      catch { held = true; fail(closed ? 'CLOSED' : 'READ_UNKNOWN'); }
      let s;
      if (raw === null) s = commit(initial());
      else { try { s = state(raw); } catch { held = true; fail('CORRUPT'); } current = raw; }
      recovered = true; return view(s);
    } finally { finish(); }
  };
  const verifyFunding = async function verifyFunding(candidateJson) {
    if (arguments.length !== 1) fail(); start();
    try {
      const evidence = candidate(candidateJson), before = state(current);
      if (before.phase === 'VERIFIED') {
        if (candidateJson !== before.candidateJson) fail('CANDIDATE_CONFLICT'); return view(before);
      }
      if (before.phase === 'VERIFYING' && candidateJson !== before.candidateJson) fail('CANDIDATE_CONFLICT');
      if (before.attempts === maximumVerificationAttempts) fail('ATTEMPTS_EXHAUSTED');
      const pending = commit({ ...before, attempts: before.attempts + 1, phase: 'VERIFYING', candidateJson,
        candidateDigest: digest(PROFILE + ':candidate', candidateJson) });
      let verified = null;
      try { verified = await verifyZenonIssuedFundingWithoutActivation({ ...p.verifierContext,
        fundingEvidence: evidence, verifyFundingEvidence }); } catch { /* No proof is not proof of no payment. */ }
      afterPort();
      if (verified === null) return view(commit({ ...pending, phase: 'REJECTED' }));
      const observedAt = now();
      return view(commit({ ...pending, phase: 'VERIFIED', verifiedRecordJson: JSON.stringify(verified.verifiedRecord),
        sourceSettlementId: verified.sourceSettlementId, verificationObservedAtMs: observedAt }));
    } finally { finish(); }
  };
  const inspect = function inspect() {
    if (arguments.length !== 0) fail(); start(); try { return view(state(current)); } finally { finish(); }
  };
  const exportReceipt = function exportReceipt() {
    if (arguments.length !== 0) fail(); start(); try { state(current); return current; } finally { finish(); }
  };
  const close = function close() {
    if (arguments.length !== 0) fail();
    if (!closing) { closed = true; closing = active ? active.done : NATIVE_PROMISE.resolve(); } return closing;
  };
  return Object.freeze({ recover, verifyFunding, inspect, exportReceipt, close });
}
