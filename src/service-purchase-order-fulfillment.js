import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { capturePurchasedOrderPayment } from './service-purchase-order-funding.js';
import { inspectPurchasedOrderFundingEnvelope, inspectPurchasedOrderFundingReceipt } from './service-purchase-order-funding-cas-contract.js';
import { capturePurchaseStorageOriginal } from './service-purchase-storage-contract.js';
import { purchasedCompensationOriginalDigest } from './service-purchase-fulfillment.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, HASH = /^sha256:[0-9a-f]{64}$/;
const PROFILE = 'zenon-x402.purchase-order-fulfillment.v1';
const FIELDS = ['version', 'profile', 'orderId', 'termsDigest', 'paymentScope', 'paymentRecordDigest', 'fundingStoreId', 'fundingReceiptJson', 'deliveries', 'compensation'];
const DELIVERY = ['deliveryId', 'originalJson', 'originalDigest', 'requestScope', 'requestId', 'grantId', 'serviceResourceUrl', 'quantity', 'status', 'proofJson'];
function error(suffix) {
  const code = 'ORDER_FULFILLMENT_' + suffix, e = new TypeError(code);
  Object.defineProperties(e, { code: { value: code, enumerable: true }, stack: { value: 'TypeError: ' + code } }); return F(e);
}
function fail(suffix = 'INVALID_INPUT') { throw error(suffix); }
function id(value) { if (typeof value !== 'string' || ID.exec(value)?.[0] !== value) fail(); return value; }
function hash(value) { if (typeof value !== 'string' || HASH.exec(value)?.[0] !== value) fail(); return value; }
function integer(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < minimum || value > maximum) fail(); return value;
}
function text(raw, cap) { if (typeof raw !== 'string' || !raw.length || Buffer.byteLength(raw) > cap || Buffer.from(raw).toString() !== raw) fail(); return raw; }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) { const d = D(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); out[name] = d.value; }
  return out;
}
function member(value, name) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const d = D(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); return d.value;
}
function method(value, name) { const fn = member(value, name); if (typeof fn !== 'function' || types.isProxy(fn)) fail(); return (...args) => Reflect.apply(fn, value, args); }
function decode(raw, names, cap = 4096) {
  text(raw, cap); let value; try { value = JSON.parse(raw); } catch { fail(); }
  const out = fields(value, names); if (JSON.stringify(out) !== raw) fail(); return out;
}
function counts(s) {
  let delivered = 0n, reserved = 0n, uncertain = 0n;
  for (const d of s.deliveries) {
    if (d.status !== 'NOT_PERFORMED') reserved += BigInt(d.quantity);
    if (d.status === 'DELIVERED') delivered += BigInt(d.quantity);
    if (d.status === 'PENDING' || d.status === 'UNKNOWN') uncertain += BigInt(d.quantity);
  }
  return { delivered, reserved, uncertain };
}

/**
 * Grant-free order liability, using the actual funding receipt and original
 * service-request codecs. A real retained grant-bound request is required only
 * when a delivery is recorded, never to acknowledge the funded order or retain
 * its compensation original. Payment time stays unknown; no grant is fabricated.
 *
 * The selected funding/original stores and fenced exact-string state CAS are
 * trusted capabilities. Proof callbacks must synchronously authenticate exact
 * delivery/compensation witnesses. Checksums and stored tags do not authenticate
 * them. No signer, sender, grant activator, service executor or payout exists.
 */
export function createPurchasedOrderFulfillmentOwner(termsJson, termsDigest, paymentCheckpointJson, paymentPinsJson, fundingContextJson, ports) {
  if (arguments.length !== 6) fail();
  const p = capturePurchasedOrderPayment(termsJson, termsDigest, paymentCheckpointJson, paymentPinsJson, fundingContextJson);
  const storeId = id(member(ports, 'fundingStoreId')), fundingStore = member(ports, 'fundingStore'), stateStore = member(ports, 'stateStore');
  const readFunding = method(fundingStore, 'readEnvelope'), load = method(stateStore, 'load'), cas = method(stateStore, 'compareAndSwap');
  const readOriginal = method(member(ports, 'originalStore'), 'readOriginal'), verifier = member(ports, 'verifier');
  const verifyDelivery = method(verifier, 'verifyDelivery'), verifyCompensation = method(verifier, 'verifyCompensation');
  const clock = member(ports, 'clock'); if (typeof clock !== 'function' || types.isProxy(clock)) fail();
  const binding = F({ version: 1, profile: PROFILE, orderId: p.orderId, termsDigest, paymentScope: p.paymentScope,
    paymentRecordDigest: p.paymentRecordDigest, fundingStoreId: storeId });
  let current = null, cached = null, recovered = false, closed = false, held = false, busy = false, validations = 0;
  function alive() { if (closed) fail('CLOSED'); if (held) fail('HELD'); if (busy) fail('BUSY'); }
  function afterPort() { if (closed) { held = true; fail('CLOSED'); } }
  function now() { try { const at = clock(); afterPort(); return integer(at); } catch { held = true; fail(closed ? 'CLOSED' : 'CLOCK_UNKNOWN'); } }
  function operation(work, needsRecovery = true) {
    alive(); if (needsRecovery && !recovered) fail('RECOVERY_REQUIRED'); busy = true;
    try { return work(); } finally { busy = false; }
  }
  function fundingReceipt(raw) {
    const f = inspectPurchasedOrderFundingReceipt(raw).receipt;
    if (f.phase !== 'VERIFIED' || f.orderId !== p.orderId || f.paymentScope !== p.paymentScope
        || f.paymentRecordJson !== p.paymentRecordJson || f.paymentRecordDigest !== p.paymentRecordDigest) fail('FUNDING_CONFLICT');
    return f;
  }
  function sourceFunding() {
    let raw; try { raw = readFunding(p.orderId, p.paymentScope); afterPort(); } catch { held = true; fail(closed ? 'CLOSED' : 'FUNDING_READ_UNKNOWN'); }
    if (raw === null) return null;
    try {
      const e = inspectPurchasedOrderFundingEnvelope(raw);
      if (e.storeId !== storeId || e.orderId !== p.orderId || e.paymentScope !== p.paymentScope) fail();
      if (e.receiptJson === null) return null;
      const f = inspectPurchasedOrderFundingReceipt(e.receiptJson).receipt;
      if (f.paymentRecordJson !== p.paymentRecordJson || f.paymentRecordDigest !== p.paymentRecordDigest) fail();
      if (f.phase !== 'VERIFIED') return null; fundingReceipt(e.receiptJson); return e.receiptJson;
    } catch { held = true; fail('FUNDING_READ_UNKNOWN'); }
  }
  function original(raw, digest) {
    const o = capturePurchaseStorageOriginal(raw, digest, paymentPinsJson, termsDigest);
    if (o.orderId !== p.orderId || o.termsJson !== termsJson || o.paymentScope !== p.paymentScope || o.paymentCheckpointJson !== paymentCheckpointJson) fail('ORIGINAL_CONFLICT');
    return o;
  }
  function retainedOriginal(raw, digest) {
    const o = original(raw, digest); let observed;
    try { observed = readOriginal(o.orderId, o.requestId, termsDigest, digest, paymentPinsJson); afterPort(); }
    catch { held = true; fail(closed ? 'CLOSED' : 'ORIGINAL_READ_UNKNOWN'); }
    if (observed === null || member(observed, 'recordJson') !== raw || member(observed, 'recordDigest') !== digest) fail('ORIGINAL_NOT_RETAINED'); return o;
  }
  function deliveryProof(raw, entry) {
    const f = decode(raw, ['version', 'kind', 'deliveryId', 'requestScope', 'originalDigest', 'quantity', 'status', 'resultDigest', 'evidenceId']);
    if (f.version !== 1 || f.kind !== 'EXACT_SERVICE_DELIVERY_V1' || f.deliveryId !== entry.deliveryId || f.requestScope !== entry.requestScope
        || f.originalDigest !== entry.originalDigest || f.quantity !== entry.quantity || !['UNKNOWN', 'NOT_PERFORMED', 'DELIVERED'].includes(f.status)) fail();
    id(f.evidenceId); if (f.status === 'DELIVERED') hash(f.resultDigest); else if (f.resultDigest !== null) fail(); return f;
  }
  function compensationTerms(s, raw, digest) {
    if (purchasedCompensationOriginalDigest(raw) !== hash(digest)) fail('COMPENSATION_CONFLICT');
    const c = JSON.parse(raw), n = counts(s), remaining = BigInt(p.terms.quantity) - n.delivered;
    const amount = (BigInt(p.terms.price.amount) * remaining + BigInt(p.terms.quantity) - 1n) / BigInt(p.terms.quantity);
    if (remaining <= 0n || n.uncertain !== 0n || c.quantity !== Number(remaining) || c.amountAtomic !== String(amount)
        || c.termsDigest !== termsDigest || c.paymentScope !== p.paymentScope || c.network !== p.terms.network
        || c.asset !== p.terms.price.asset || c.payee !== p.terms.holder || c.transactionHash === p.checkpoint.binding.paymentHash) fail('COMPENSATION_CONFLICT');
    return c;
  }
  function compensationProof(raw, original, digest) {
    const f = decode(raw, ['version', 'kind', 'compensationId', 'originalDigest', 'transactionHash', 'paymentScope', 'status', 'evidenceId']);
    if (f.version !== 1 || f.kind !== 'ZENON_EXACT_COMPENSATION_V1' || f.compensationId !== original.compensationId || f.originalDigest !== digest
        || f.transactionHash !== original.transactionHash || f.paymentScope !== p.paymentScope || !['UNKNOWN', 'CONFIRMED'].includes(f.status)) fail();
    id(f.evidenceId); return f;
  }
  function validate(raw) {
    const s = decode(raw, FIELDS, 1048576); if (!Object.keys(binding).every(k => s[k] === binding[k])) fail();
    if (s.fundingReceiptJson !== null) fundingReceipt(s.fundingReceiptJson);
    if (!Array.isArray(s.deliveries) || s.deliveries.length > p.rules.maximumDeliveries) fail();
    const ids = new Set(), requests = new Set(); let selection = null;
    s.deliveries = s.deliveries.map(value => {
      const d = fields(value, DELIVERY), o = original(d.originalJson, d.originalDigest);
      id(d.deliveryId); integer(d.quantity, 1, p.terms.quantity);
      if (d.requestScope !== o.requestScope || d.requestId !== o.requestId || d.grantId !== o.grantId || d.serviceResourceUrl !== o.serviceResourceUrl
          || ids.has(d.deliveryId) || requests.has(d.requestScope) || !['PENDING', 'UNKNOWN', 'DELIVERED', 'NOT_PERFORMED'].includes(d.status)) fail();
      const next = d.grantId + '\0' + d.serviceResourceUrl; if (selection !== null && selection !== next) fail(); selection = next;
      ids.add(d.deliveryId); requests.add(d.requestScope);
      if (d.status === 'PENDING') { if (d.proofJson !== null) fail(); } else if (deliveryProof(d.proofJson, d).status !== d.status) fail();
      return F(d);
    });
    if (counts(s).reserved > BigInt(p.terms.quantity)) fail();
    if (s.compensation !== null) {
      const c = fields(s.compensation, ['originalJson', 'originalDigest', 'status', 'proofJson']), o = compensationTerms(s, c.originalJson, c.originalDigest);
      if (!['RETAINED', 'UNKNOWN', 'CONFIRMED'].includes(c.status)) fail();
      if (c.status === 'RETAINED') { if (c.proofJson !== null) fail(); } else if (compensationProof(c.proofJson, o, c.originalDigest).status !== c.status) fail();
      s.compensation = F(c);
    }
    if (s.fundingReceiptJson === null && (s.deliveries.length || s.compensation !== null)) fail();
    if (JSON.stringify(s) !== raw) fail(); validations++; s.deliveries = F(s.deliveries); return F(s);
  }
  function view(s, changed = false) {
    const at = now(), n = counts(s), f = s.fundingReceiptJson === null ? null : JSON.parse(s.fundingReceiptJson);
    const compensated = s.compensation?.status === 'CONFIRMED' ? BigInt(JSON.parse(s.compensation.originalJson).quantity) : 0n;
    const owed = f === null ? 0n : BigInt(p.terms.quantity) - n.delivered - compensated;
    return F({ orderId: p.orderId, changed, quantityUnit: p.rules.quantityUnit, purchasedQuantity: p.terms.quantity, grantFundingUnits: p.target.totalUnits,
      fundingStatus: f === null ? 'NOT_RECORDED' : 'SELECTED_STORE_VERIFIED_RECEIPT_RECORDED', fundingObservationCurrent: false,
      deliveredQuantity: Number(n.delivered), uncertainDeliveryQuantity: Number(n.uncertain), compensatedQuantity: Number(compensated), quantityOwed: Number(owed),
      liability: f === null ? 'PAYMENT_NOT_VERIFIED' : owed === 0n ? 'SATISFIED' : 'DELIVERY_OR_COMPENSATION_OWED',
      offerExpired: at >= p.rules.offerExpiresAtMs, reservationExpired: at >= p.rules.reservationExpiresAtMs, paymentAtMs: null, paymentWasLate: null,
      verificationObservedAtMs: f?.verificationObservedAtMs ?? null,
      verificationObservedAfterOfferExpiry: f === null ? null : f.verificationObservedAtMs >= p.rules.offerExpiresAtMs,
      grantSelectedForDelivery: s.deliveries.length !== 0, unresolvedDelivery: n.uncertain !== 0n, compensationStatus: s.compensation?.status ?? 'NONE',
      requiresReconciliation: n.uncertain !== 0n || s.compensation !== null && s.compensation.status !== 'CONFIRMED',
      authority: 'NONE', mayStartPayment: false, maySignPayment: false, mayDispatchService: false, mayStartCompensation: false, physicalResourceRelease: 'NOT_QUALIFIED' });
  }
  function working() { return { ...cached, deliveries: cached.deliveries.map(d => ({ ...d })), compensation: cached.compensation === null ? null : { ...cached.compensation } }; }
  function commit(next) {
    const raw = JSON.stringify(next), checked = validate(raw); if (raw === current) return view(cached);
    let observed; try { observed = cas(p.orderId, p.paymentScope, current, raw); afterPort(); }
    catch { held = true; fail(closed ? 'CLOSED' : 'COMMIT_UNKNOWN'); }
    if (observed !== raw) { held = true; fail('COMMIT_UNKNOWN'); }
    current = raw; cached = checked; return view(cached, true);
  }
  function verified(fn, candidate, context) {
    text(candidate, 16384); let raw;
    try { raw = fn(candidate, F(context)); afterPort(); text(raw, 4096); }
    catch { if (closed) held = true; fail(closed ? 'CLOSED' : 'PROOF_REJECTED'); } return raw;
  }
  const recover = F(function recover() {
    if (arguments.length !== 0) fail(); return operation(() => {
      if (recovered) fail('ALREADY_RECOVERED'); let raw;
      try { raw = load(p.orderId, p.paymentScope); afterPort(); } catch { held = true; fail(closed ? 'CLOSED' : 'READ_UNKNOWN'); }
      if (raw === null) {
        const result = commit({ ...binding, fundingReceiptJson: null, deliveries: [], compensation: null }); recovered = true; return result;
      }
      let s; try { s = validate(raw); } catch { held = true; fail('CORRUPT'); }
      if (s.fundingReceiptJson !== null && sourceFunding() !== s.fundingReceiptJson) { held = true; fail('FUNDING_SOURCE_CONFLICT'); }
      try { for (const d of s.deliveries) retainedOriginal(d.originalJson, d.originalDigest); }
      catch { held = true; fail(closed ? 'CLOSED' : 'ORIGINAL_RECOVERY_UNKNOWN'); }
      current = raw; cached = s; recovered = true; return view(cached);
    }, false);
  });
  const recordVerifiedFunding = F(function recordVerifiedFunding() {
    if (arguments.length !== 0) fail(); return operation(() => {
      const raw = sourceFunding(); if (raw === null) fail('FUNDING_NOT_VERIFIED');
      if (cached.fundingReceiptJson !== null) { if (cached.fundingReceiptJson !== raw) { held = true; fail('FUNDING_SOURCE_CONFLICT'); } return view(cached); }
      const s = working(); s.fundingReceiptJson = raw; return commit(s);
    });
  });
  const beginDelivery = F(function beginDelivery(raw, digest, deliveryId, quantity) {
    if (arguments.length !== 4) fail(); id(deliveryId); integer(quantity, 1, p.terms.quantity);
    return operation(() => {
      if (cached.fundingReceiptJson === null) fail('FUNDING_REQUIRED');
      const o = retainedOriginal(raw, digest), prior = cached.deliveries.find(d => d.deliveryId === deliveryId || d.requestScope === o.requestScope);
      if (prior) {
        if (prior.deliveryId !== deliveryId || prior.originalJson !== raw || prior.originalDigest !== digest || prior.quantity !== quantity) fail('DELIVERY_CONFLICT'); return view(cached);
      }
      if (cached.compensation !== null) fail('COMPENSATION_ALREADY_RETAINED');
      const first = cached.deliveries[0]; if (first && (first.grantId !== o.grantId || first.serviceResourceUrl !== o.serviceResourceUrl)) fail('SERVICE_SELECTION_CONFLICT');
      if (cached.deliveries.length >= p.rules.maximumDeliveries) fail('DELIVERY_LIMIT');
      if (counts(cached).reserved + BigInt(quantity) > BigInt(p.terms.quantity)) fail('QUANTITY_LIMIT');
      const s = working(); s.deliveries.push({ deliveryId, originalJson: raw, originalDigest: digest, requestScope: o.requestScope, requestId: o.requestId,
        grantId: o.grantId, serviceResourceUrl: o.serviceResourceUrl, quantity, status: 'PENDING', proofJson: null }); return commit(s);
    });
  });
  const recordDelivery = F(function recordDelivery(deliveryId, candidate) {
    if (arguments.length !== 2) fail(); id(deliveryId); return operation(() => {
      const s = working(), d = s.deliveries.find(value => value.deliveryId === deliveryId); if (!d) fail('DELIVERY_NOT_RETAINED');
      const raw = verified(verifyDelivery, candidate, { ...binding, termsJson, fundingReceiptJson: s.fundingReceiptJson, ...d });
      let proof; try { proof = deliveryProof(raw, d); } catch { fail('PROOF_REJECTED'); }
      if (d.status === 'DELIVERED' || d.status === 'NOT_PERFORMED') { if (d.proofJson !== raw) fail('DELIVERY_CONFLICT'); return view(cached); }
      if (s.compensation !== null) fail('COMPENSATION_ALREADY_RETAINED'); d.status = proof.status; d.proofJson = raw; return commit(s);
    });
  });
  const retainCompensation = F(function retainCompensation(raw, digest) {
    if (arguments.length !== 2) fail(); return operation(() => {
      if (cached.fundingReceiptJson === null) fail('FUNDING_REQUIRED'); compensationTerms(cached, raw, digest);
      if (cached.compensation !== null) { if (cached.compensation.originalJson !== raw || cached.compensation.originalDigest !== digest) fail('COMPENSATION_CONFLICT'); return view(cached); }
      const s = working(); s.compensation = { originalJson: raw, originalDigest: digest, status: 'RETAINED', proofJson: null }; return commit(s);
    });
  });
  const recordCompensation = F(function recordCompensation(candidate) {
    if (arguments.length !== 1) fail(); return operation(() => {
      const s = working(), c = s.compensation; if (c === null) fail('COMPENSATION_NOT_RETAINED');
      const original = compensationTerms(s, c.originalJson, c.originalDigest);
      const raw = verified(verifyCompensation, candidate, { ...binding, termsJson, fundingReceiptJson: s.fundingReceiptJson,
        originalJson: c.originalJson, originalDigest: c.originalDigest });
      let proof; try { proof = compensationProof(raw, original, c.originalDigest); } catch { fail('PROOF_REJECTED'); }
      if (c.status === 'CONFIRMED') { if (c.proofJson !== raw) fail('COMPENSATION_CONFLICT'); return view(cached); }
      c.status = proof.status; c.proofJson = raw; return commit(s);
    });
  });
  return F({ recover, recordVerifiedFunding, beginDelivery, recordDelivery, retainCompensation, recordCompensation,
    read: F(function read() { if (arguments.length !== 0) fail(); return operation(() => view(cached)); }),
    exportRecord: F(function exportRecord() { if (arguments.length !== 0) fail(); return operation(() => current); }),
    close: F(function close() { if (arguments.length !== 0) fail(); closed = true; }),
    snapshot: F(function snapshot() { if (arguments.length !== 0) fail(); return F({ closed, held, busy, recovered, fullStateValidations: validations,
      authority: 'NONE', stores: 'BORROWED_NOT_CLOSED', fundingAuthenticationPerformed: false, physicalResourceRelease: 'NOT_QUALIFIED' }); }) });
}
