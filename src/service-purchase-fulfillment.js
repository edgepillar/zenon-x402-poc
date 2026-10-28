import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { snapshotPurchasedServiceTerms } from './service-purchase-terms.js';
import { capturePurchaseStorageOriginal } from './service-purchase-storage-contract.js';

const PROFILE = 'zenon-x402.purchase-fulfillment.v1';
const HASH = /^sha256:[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TX = /^[0-9a-f]{64}$/;
const POLICY_FIELDS = ['version', 'quantityUnit', 'offerExpiresAtMs', 'reservationExpiresAtMs', 'maximumDeliveries', 'compensationRule'];
const STATE_FIELDS = ['version', 'profile', 'orderId', 'termsDigest', 'policyJson', 'paymentScope', 'checkpointDigest', 'grantId', 'serviceResourceUrl', 'fundingJson', 'deliveries', 'compensation'];
const DELIVERY_FIELDS = ['deliveryId', 'requestScope', 'requestId', 'originalDigest', 'quantity', 'status', 'proofJson'];
const COMP_FIELDS = ['originalJson', 'originalDigest', 'status', 'proofJson'];
const COMP_ORIGINAL_FIELDS = ['version', 'kind', 'compensationId', 'termsDigest', 'paymentScope', 'network', 'asset', 'payee', 'quantity', 'amountAtomic', 'transactionHash', 'originalBytesBase64'];
function fail(suffix = 'INVALID_INPUT') {
  const code = `PURCHASE_FULFILLMENT_${suffix}`, error = new TypeError(code);
  Object.defineProperties(error, { code: { value: code, enumerable: true }, stack: { value: `TypeError: ${code}` } });
  throw Object.freeze(error);
}
function test(pattern, value) { return typeof value === 'string' && pattern.exec(value)?.[0] === value; }
function id(value) { if (!test(ID, value)) fail(); return value; }
function hash(value) { if (!test(HASH, value)) fail(); return value; }
function integer(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(); return value;
}
function text(value, cap) {
  if (typeof value !== 'string' || !value.length || value.length > cap || Buffer.byteLength(value) > cap
      || Buffer.from(value).toString() !== value) fail(); return value;
}
function shape(value, fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== fields.length
      || !fields.every(key => Object.hasOwn(value, key))) fail();
  return Object.fromEntries(fields.map(key => [key, value[key]]));
}
function decode(raw, fields, cap = 4096) {
  text(raw, cap); let value; try { value = JSON.parse(raw); } catch { fail(); }
  const result = shape(value, fields); if (JSON.stringify(result) !== raw) fail(); return result;
}
function digest(domain, raw) { return 'sha256:' + createHash('sha256').update(domain).update('\0').update(raw).digest('hex'); }
function policy(raw) {
  const p = decode(raw, POLICY_FIELDS);
  if (p.version !== 1 || p.compensationRule !== 'PRO_RATA_CEILING_ATOMIC_V1') fail();
  id(p.quantityUnit); integer(p.offerExpiresAtMs, 1); integer(p.reservationExpiresAtMs, 1); integer(p.maximumDeliveries, 1, 64);
  return p;
}
export function purchasedFulfillmentPolicyDigest(policyJson) {
  if (arguments.length !== 1) fail(); policy(policyJson); return digest(PROFILE + ':policy', policyJson);
}
function compensationOriginal(raw) {
  const c = decode(raw, COMP_ORIGINAL_FIELDS, 16384);
  if (c.version !== 1 || c.kind !== 'ZENON_COMPENSATION_ORIGINAL_V1' || !test(TX, c.transactionHash)
      || !test(/^[1-9][0-9]{0,77}$/, c.amountAtomic)) fail();
  id(c.compensationId); hash(c.termsDigest); hash(c.paymentScope); id(c.asset); id(c.payee);
  text(c.network, 256); integer(c.quantity, 1); text(c.originalBytesBase64, 5464);
  const bytes = Buffer.from(c.originalBytesBase64, 'base64');
  if (!bytes.length || bytes.length > 4096 || bytes.toString('base64') !== c.originalBytesBase64) fail();
  return c;
}
/** Checksum of exact retained compensation bytes; no signature/payment verification. */
export function purchasedCompensationOriginalDigest(originalJson) {
  if (arguments.length !== 1) fail(); compensationOriginal(originalJson); return digest(PROFILE + ':compensation', originalJson);
}
function method(object, name) {
  if (object === null || typeof object !== 'object' || types.isProxy(object) || Object.getPrototypeOf(object) !== Object.prototype) fail();
  const d = Object.getOwnPropertyDescriptor(object, name);
  if (!d?.enumerable || !Object.hasOwn(d, 'value') || typeof d.value !== 'function') fail();
  return (...args) => Reflect.apply(d.value, object, args);
}
function member(object, name) {
  if (object === null || typeof object !== 'object' || types.isProxy(object) || Object.getPrototypeOf(object) !== Object.prototype) fail();
  const d = Object.getOwnPropertyDescriptor(object, name);
  if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); return d.value;
}

/**
 * Opt-in synchronous owner. The fixed verifier ports authenticate evidence;
 * the fixed store provides durable atomic exact-string CAS and exclusive/fenced
 * ownership. This module performs neither proof verification nor dispatch/payout.
 * CAS acknowledgement loss fences this owner. A new owner must recover the same
 * store; no callback, retry, replacement, deletion or expiry-driven write exists.
 */
export function createPurchasedServiceFulfillmentOwner(recordJson, recordDigest, paymentPinsJson, termsDigest, policyJson, ports) {
  if (arguments.length !== 6) fail();
  const initial = capturePurchaseStorageOriginal(recordJson, recordDigest, paymentPinsJson, termsDigest);
  const terms = snapshotPurchasedServiceTerms(initial.termsJson), rules = policy(policyJson);
  if (terms.conditionsDigest !== purchasedFulfillmentPolicyDigest(policyJson)) fail('POLICY_CONFLICT');
  const checkpointDigest = digest(PROFILE + ':checkpoint', initial.paymentCheckpointJson);
  const paymentHash = JSON.parse(initial.paymentCheckpointJson).binding.paymentHash;
  const originalStore = member(ports, 'originalStore'), stateStore = member(ports, 'stateStore'), verifier = member(ports, 'verifier');
  const readOriginal = method(originalStore, 'readOriginal'), load = method(stateStore, 'load'), cas = method(stateStore, 'compareAndSwap');
  const verifyFunding = method(verifier, 'verifyFunding'), verifyDelivery = method(verifier, 'verifyDelivery'), verifyCompensation = method(verifier, 'verifyCompensation');
  const clock = member(ports, 'clock'); if (typeof clock !== 'function') fail();
  let closed = false, busy = false, unavailable = false, current = null, recovered = false;
  const binding = Object.freeze({ version: 1, profile: PROFILE, orderId: initial.orderId, termsDigest, policyJson,
    paymentScope: initial.paymentScope, checkpointDigest, grantId: initial.grantId, serviceResourceUrl: initial.serviceResourceUrl });
  const baseState = () => ({ ...binding, fundingJson: null, deliveries: [], compensation: null });
  function alive() { if (closed) fail('CLOSED'); if (unavailable) fail('HELD'); if (busy) fail('BUSY'); }
  function afterPort() { if (closed) fail('CLOSED'); }
  function now() { const value = clock(); afterPort(); return integer(value); }
  function operation(work, needsRecovery = true) {
    alive(); if (needsRecovery && !recovered) fail('RECOVERY_REQUIRED'); busy = true;
    try { return work(); } finally { busy = false; }
  }
  function retained(raw, expectedDigest, pins) {
    const p = capturePurchaseStorageOriginal(raw, expectedDigest, pins, termsDigest);
    if (p.orderId !== initial.orderId || p.termsJson !== initial.termsJson || p.paymentScope !== initial.paymentScope
        || p.paymentCheckpointJson !== initial.paymentCheckpointJson || p.grantId !== initial.grantId
        || p.serviceResourceUrl !== initial.serviceResourceUrl) fail('ORIGINAL_CONFLICT');
    let stored;
    try { stored = readOriginal(p.orderId, p.requestId, termsDigest, p.recordDigest, pins); afterPort(); }
    catch { unavailable = true; fail(closed ? 'CLOSED' : 'ORIGINAL_READ_UNKNOWN'); }
    if (stored === null || member(stored, 'recordJson') !== raw || member(stored, 'recordDigest') !== expectedDigest) fail('ORIGINAL_NOT_RETAINED');
    return p;
  }
  function funding(raw) {
    const f = decode(raw, ['version', 'kind', 'paymentScope', 'termsDigest', 'evidenceId', 'paymentAtMs']);
    if (f.version !== 1 || f.kind !== 'ZENON_EXACT_FUNDING_V1' || f.paymentScope !== initial.paymentScope || f.termsDigest !== termsDigest) fail();
    id(f.evidenceId); integer(f.paymentAtMs); return f;
  }
  function deliveryProof(raw, entry) {
    const p = decode(raw, ['version', 'kind', 'deliveryId', 'requestScope', 'originalDigest', 'quantity', 'status', 'resultDigest', 'evidenceId']);
    if (p.version !== 1 || p.kind !== 'EXACT_SERVICE_DELIVERY_V1' || p.deliveryId !== entry.deliveryId
        || p.requestScope !== entry.requestScope || p.originalDigest !== entry.originalDigest || p.quantity !== entry.quantity
        || !['UNKNOWN', 'NOT_PERFORMED', 'DELIVERED'].includes(p.status)) fail();
    id(p.evidenceId); if (p.status === 'DELIVERED') hash(p.resultDigest); else if (p.resultDigest !== null) fail();
    return p;
  }
  function delivered(state) { return state.deliveries.filter(d => d.status === 'DELIVERED').reduce((sum, d) => sum + BigInt(d.quantity), 0n); }
  function unresolved(state) { return state.deliveries.some(d => d.status === 'PENDING' || d.status === 'UNKNOWN'); }
  function compensationTerms(state, raw, expectedDigest) {
    const c = compensationOriginal(raw);
    if (purchasedCompensationOriginalDigest(raw) !== hash(expectedDigest)) fail('COMPENSATION_CONFLICT');
    const remaining = BigInt(terms.quantity) - delivered(state);
    const amount = (BigInt(terms.price.amount) * remaining + BigInt(terms.quantity) - 1n) / BigInt(terms.quantity);
    if (remaining <= 0n || unresolved(state) || c.quantity !== Number(remaining) || c.amountAtomic !== String(amount)
        || c.termsDigest !== termsDigest || c.paymentScope !== initial.paymentScope || c.network !== terms.network
        || c.asset !== terms.price.asset || c.payee !== terms.holder || c.transactionHash === paymentHash) fail('COMPENSATION_CONFLICT');
    return c;
  }
  function compensationProof(raw, original, originalDigest) {
    const p = decode(raw, ['version', 'kind', 'compensationId', 'originalDigest', 'transactionHash', 'paymentScope', 'status', 'evidenceId']);
    if (p.version !== 1 || p.kind !== 'ZENON_EXACT_COMPENSATION_V1' || p.compensationId !== original.compensationId
        || p.originalDigest !== originalDigest || p.transactionHash !== original.transactionHash || p.paymentScope !== initial.paymentScope
        || !['UNKNOWN', 'CONFIRMED'].includes(p.status)) fail();
    id(p.evidenceId); return p;
  }
  function state(raw) {
    const s = decode(raw, STATE_FIELDS, 131072);
    if (!Object.keys(binding).every(k => s[k] === binding[k]) || !Array.isArray(s.deliveries)
        || s.deliveries.length > rules.maximumDeliveries) fail();
    if (s.fundingJson !== null) funding(s.fundingJson);
    const ids = new Set(), requests = new Set(); let reserved = 0n;
    s.deliveries = s.deliveries.map(row => {
      const d = shape(row, DELIVERY_FIELDS); id(d.deliveryId); hash(d.requestScope); id(d.requestId); hash(d.originalDigest); integer(d.quantity, 1, terms.quantity);
      if (ids.has(d.deliveryId) || requests.has(d.requestScope)) fail(); ids.add(d.deliveryId); requests.add(d.requestScope);
      if (!['PENDING', 'UNKNOWN', 'DELIVERED', 'NOT_PERFORMED'].includes(d.status)) fail();
      if (d.status === 'PENDING') { if (d.proofJson !== null) fail(); }
      else if (deliveryProof(d.proofJson, d).status !== d.status) fail();
      if (d.status !== 'NOT_PERFORMED') reserved += BigInt(d.quantity); return d;
    });
    if (reserved > BigInt(terms.quantity)) fail();
    if (s.compensation !== null) {
      const c = shape(s.compensation, COMP_FIELDS), original = compensationTerms(s, c.originalJson, c.originalDigest);
      if (!['RETAINED', 'UNKNOWN', 'CONFIRMED'].includes(c.status)) fail();
      if (c.status === 'RETAINED') { if (c.proofJson !== null) fail(); }
      else if (compensationProof(c.proofJson, original, c.originalDigest).status !== c.status) fail();
      s.compensation = c;
    }
    if (s.fundingJson === null && (s.deliveries.length || s.compensation !== null)) fail();
    if (JSON.stringify(s) !== raw) fail(); return s;
  }
  function view(s, changed = false, at = now()) {
    const complete = delivered(s), compensated = s.compensation?.status === 'CONFIRMED' ? BigInt(compensationOriginal(s.compensation.originalJson).quantity) : 0n;
    const owed = s.fundingJson === null ? 0n : BigInt(terms.quantity) - complete - compensated;
    return Object.freeze({ orderId: initial.orderId, changed, quantityUnit: rules.quantityUnit,
      fundingStatus: s.fundingJson === null ? 'NOT_RECORDED' : 'TRUSTED_VERIFIER_RECORDED',
      deliveredQuantity: Number(complete), compensatedQuantity: Number(compensated), quantityOwed: Number(owed),
      liability: s.fundingJson === null ? 'PAYMENT_NOT_VERIFIED' : owed === 0n ? 'SATISFIED' : 'DELIVERY_OR_COMPENSATION_OWED',
      offerExpired: at >= rules.offerExpiresAtMs, reservationExpired: at >= rules.reservationExpiresAtMs,
      paymentWasLate: s.fundingJson === null ? null : funding(s.fundingJson).paymentAtMs >= rules.offerExpiresAtMs,
      unresolvedDelivery: unresolved(s), compensationStatus: s.compensation?.status ?? 'NONE',
      requiresReconciliation: unresolved(s) || (s.compensation !== null && s.compensation.status !== 'CONFIRMED'),
      authority: 'NONE', mayStartPayment: false, maySignPayment: false, mayDispatchService: false, mayStartCompensation: false });
  }
  function commit(next) {
    const raw = JSON.stringify(next); state(raw);
    if (raw === current) return view(next);
    let observed;
    try { observed = cas(initial.orderId, current, raw); afterPort(); }
    catch { unavailable = true; fail(closed ? 'CLOSED' : 'COMMIT_UNKNOWN'); }
    if (observed !== raw) { unavailable = true; fail('STATE_CONFLICT'); }
    current = raw; return view(next, true);
  }
  function verified(fn, candidateJson, context) {
    text(candidateJson, 16384); let raw;
    try { raw = fn(candidateJson, Object.freeze(context)); afterPort(); text(raw, 4096); }
    catch { fail(closed ? 'CLOSED' : 'PROOF_REJECTED'); }
    return raw;
  }
  const recover = function recover() {
    if (arguments.length !== 0) fail();
    return operation(() => {
      if (recovered) fail('ALREADY_RECOVERED'); retained(recordJson, recordDigest, paymentPinsJson);
      let raw; try { raw = load(initial.orderId); afterPort(); } catch { unavailable = true; fail(closed ? 'CLOSED' : 'READ_UNKNOWN'); }
      if (raw !== null) { try { state(raw); } catch { unavailable = true; fail('CORRUPT'); } }
      current = raw; const result = raw === null ? commit(baseState()) : view(state(raw)); recovered = true; return result;
    }, false);
  };
  const recordFunding = function recordFunding(candidateJson) {
    if (arguments.length !== 1) fail();
    return operation(() => {
      const s = state(current), raw = verified(verifyFunding, candidateJson, { ...binding, termsJson: initial.termsJson,
        originalPurchaseJson: recordJson, originalRecordDigest: recordDigest, paymentPinsJson });
      let f; try { f = funding(raw); } catch { fail('PROOF_REJECTED'); }
      if (f.paymentAtMs > now()) fail('PROOF_REJECTED');
      if (s.fundingJson !== null && s.fundingJson !== raw) fail('FUNDING_CONFLICT');
      s.fundingJson = raw; return commit(s);
    });
  };
  const beginDelivery = function beginDelivery(originalJson, originalDigest, pins, deliveryId, quantity) {
    if (arguments.length !== 5) fail(); id(deliveryId); integer(quantity, 1, terms.quantity);
    return operation(() => {
      const s = state(current); if (s.fundingJson === null) fail('FUNDING_REQUIRED');
      if (s.compensation !== null) fail('COMPENSATION_ALREADY_RETAINED');
      const p = retained(originalJson, originalDigest, pins);
      const entry = { deliveryId, requestScope: p.requestScope, requestId: p.requestId, originalDigest, quantity, status: 'PENDING', proofJson: null };
      const prior = s.deliveries.find(d => d.deliveryId === deliveryId || d.requestScope === p.requestScope);
      if (prior) {
        if (!['deliveryId', 'requestScope', 'requestId', 'originalDigest', 'quantity'].every(k => prior[k] === entry[k])) fail('DELIVERY_CONFLICT');
        return view(s);
      }
      if (s.deliveries.length >= rules.maximumDeliveries) fail('DELIVERY_LIMIT');
      const reserved = s.deliveries.filter(d => d.status !== 'NOT_PERFORMED').reduce((sum, d) => sum + BigInt(d.quantity), 0n);
      if (reserved + BigInt(quantity) > BigInt(terms.quantity)) fail('QUANTITY_LIMIT');
      s.deliveries.push(entry); return commit(s);
    });
  };
  const recordDelivery = function recordDelivery(deliveryId, candidateJson) {
    if (arguments.length !== 2) fail(); id(deliveryId);
    return operation(() => {
      const s = state(current), entry = s.deliveries.find(d => d.deliveryId === deliveryId);
      if (!entry) fail('DELIVERY_NOT_RETAINED');
      const raw = verified(verifyDelivery, candidateJson, { ...binding, ...entry });
      let p; try { p = deliveryProof(raw, entry); } catch { fail('PROOF_REJECTED'); }
      if (entry.status === 'DELIVERED' || entry.status === 'NOT_PERFORMED') {
        if (entry.proofJson !== raw) fail('DELIVERY_CONFLICT'); return view(s);
      }
      if (s.compensation !== null) fail('COMPENSATION_ALREADY_RETAINED');
      entry.status = p.status; entry.proofJson = raw; return commit(s);
    });
  };
  const retainCompensation = function retainCompensation(originalJson, originalDigest) {
    if (arguments.length !== 2) fail();
    return operation(() => {
      const s = state(current); if (s.fundingJson === null) fail('FUNDING_REQUIRED');
      compensationTerms(s, originalJson, originalDigest);
      if (s.compensation !== null) {
        if (s.compensation.originalJson !== originalJson || s.compensation.originalDigest !== originalDigest) fail('COMPENSATION_CONFLICT');
        return view(s);
      }
      s.compensation = { originalJson, originalDigest, status: 'RETAINED', proofJson: null }; return commit(s);
    });
  };
  const recordCompensation = function recordCompensation(candidateJson) {
    if (arguments.length !== 1) fail();
    return operation(() => {
      const s = state(current), c = s.compensation; if (c === null) fail('COMPENSATION_NOT_RETAINED');
      const original = compensationTerms(s, c.originalJson, c.originalDigest);
      const raw = verified(verifyCompensation, candidateJson, { ...binding, originalPurchaseJson: recordJson,
        paymentPinsJson, originalJson: c.originalJson, originalDigest: c.originalDigest });
      let p; try { p = compensationProof(raw, original, c.originalDigest); } catch { fail('PROOF_REJECTED'); }
      if (c.status === 'CONFIRMED') { if (c.proofJson !== raw) fail('COMPENSATION_CONFLICT'); return view(s); }
      c.status = p.status; c.proofJson = raw; return commit(s);
    });
  };
  return Object.freeze({ recover, recordFunding, beginDelivery, recordDelivery, retainCompensation, recordCompensation,
    read() { if (arguments.length !== 0) fail(); return operation(() => view(state(current))); },
    exportRecord() { if (arguments.length !== 0) fail(); return operation(() => current); },
    close() { if (arguments.length !== 0) fail(); closed = true; },
    snapshot() { return Object.freeze({ closed, busy, unavailable, recovered, authority: 'NONE' }); } });
}
