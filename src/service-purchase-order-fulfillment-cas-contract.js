import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { inspectPurchasedOrderFundingReceipt } from './service-purchase-order-funding-cas-contract.js';
import { inspectStoredPurchaseOriginal, purchasedTermsStorageDigest } from './service-purchase-storage-contract.js';
import { purchasedCompensationOriginalDigest } from './service-purchase-fulfillment.js';

const F = Object.freeze, PROFILE = 'zenon-x402.purchase-order-fulfillment.v1';
const ENVELOPE = ['version', 'storeId', 'orderId', 'paymentScope', 'ownerId', 'epoch', 'revision', 'recordJson', 'recordDigest'];
const TOKEN = ['version', 'storeId', 'orderId', 'paymentScope', 'ownerId', 'epoch'];
const RECORD = ['version', 'profile', 'orderId', 'termsDigest', 'paymentScope', 'paymentRecordDigest', 'fundingStoreId', 'fundingReceiptJson', 'deliveries', 'compensation'];
const BINDING = RECORD.slice(0, 7);
const DELIVERY = ['deliveryId', 'originalJson', 'originalDigest', 'requestScope', 'requestId', 'grantId', 'serviceResourceUrl', 'quantity', 'status', 'proofJson'];
const IDENTITY = DELIVERY.slice(0, 8);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, HASH = /^sha256:[0-9a-f]{64}$/;
function fail(suffix = 'INVALID_INPUT') {
  const code = 'ORDER_FULFILLMENT_CAS_' + suffix, e = new TypeError(code);
  Object.defineProperties(e, { code: { value: code, enumerable: true }, stack: { value: 'TypeError: ' + code } }); throw F(e);
}
function id(v) { if (typeof v !== 'string' || ID.exec(v)?.[0] !== v) fail(); return v; }
function hash(v) { if (typeof v !== 'string' || HASH.exec(v)?.[0] !== v) fail(); return v; }
function integer(v) { if (!Number.isSafeInteger(v) || v < 1 || Object.is(v, -0)) fail(); return v; }
function next(v) { integer(v); if (v === Number.MAX_SAFE_INTEGER) fail('VERSION_EXHAUSTED'); return v + 1; }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const key of names) { const d = Object.getOwnPropertyDescriptor(value, key); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); out[key] = d.value; }
  return out;
}
function decode(raw, names, cap) {
  if (typeof raw !== 'string' || !raw.length || raw.length > cap || Buffer.byteLength(raw) > cap || Buffer.from(raw).toString() !== raw) fail();
  let value; try { value = JSON.parse(raw); } catch { fail(); }
  const out = fields(value, names); if (JSON.stringify(out) !== raw) fail(); return out;
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function digest(raw) { return 'sha256:' + createHash('sha256').update('zenon-x402:order-fulfillment-cas-record:v1\0').update(raw).digest('hex'); }
function record(raw, orderId, paymentScope) {
  const r = decode(raw, RECORD, 1048576);
  if (r.version !== 1 || r.profile !== PROFILE || r.orderId !== orderId || r.paymentScope !== paymentScope) fail();
  id(r.orderId); hash(r.paymentScope); hash(r.termsDigest); hash(r.paymentRecordDigest); id(r.fundingStoreId);
  let funded = null, purchase = null, terms = null;
  if (r.fundingReceiptJson !== null) {
    funded = inspectPurchasedOrderFundingReceipt(r.fundingReceiptJson).receipt;
    if (funded.phase !== 'VERIFIED' || funded.orderId !== orderId || funded.paymentScope !== paymentScope || funded.paymentRecordDigest !== r.paymentRecordDigest) fail();
    purchase = JSON.parse(funded.paymentRecordJson); terms = JSON.parse(purchase.termsJson);
    // The receipt inspector checks its original codecs and derived digests.
    // Independent purchase/source provenance remains the actual owner's job.
    if (terms.orderId !== orderId || purchasedTermsStorageDigest(purchase.termsJson) !== r.termsDigest) fail();
  }
  const maxDeliveries = funded === null ? 64 : JSON.parse(JSON.parse(purchase.fundingContextJson).policyJson).maximumDeliveries;
  if (!Array.isArray(r.deliveries) || r.deliveries.length > maxDeliveries) fail();
  const ids = new Set(), requests = new Set(); let delivered = 0n, reserved = 0n, unresolved = false, selection = null;
  r.deliveries = r.deliveries.map(value => {
    const d = fields(value, DELIVERY); id(d.deliveryId); integer(d.quantity);
    if (funded === null || ids.has(d.deliveryId) || requests.has(d.requestScope) || !['PENDING', 'UNKNOWN', 'NOT_PERFORMED', 'DELIVERED'].includes(d.status)) fail();
    const o = inspectStoredPurchaseOriginal(d.originalJson, d.originalDigest), original = JSON.parse(d.originalJson);
    if (o.orderId !== orderId || o.paymentScope !== paymentScope || o.termsDigest !== r.termsDigest || original.termsJson !== purchase.termsJson
        || o.paymentCheckpointJson !== purchase.paymentCheckpointJson || d.quantity > terms.quantity
        || !['requestScope', 'requestId', 'grantId', 'serviceResourceUrl'].every(k => d[k] === o[k])) fail();
    const selected = d.grantId + '\0' + d.serviceResourceUrl; if (selection !== null && selected !== selection) fail(); selection = selected;
    ids.add(d.deliveryId); requests.add(d.requestScope);
    if (d.status === 'PENDING') { if (d.proofJson !== null) fail(); }
    else {
      const p = decode(d.proofJson, ['version', 'kind', 'deliveryId', 'requestScope', 'originalDigest', 'quantity', 'status', 'resultDigest', 'evidenceId'], 4096);
      if (p.version !== 1 || p.kind !== 'EXACT_SERVICE_DELIVERY_V1' || !['deliveryId', 'requestScope', 'originalDigest', 'quantity', 'status'].every(k => p[k] === d[k])) fail();
      id(p.evidenceId); if (d.status === 'DELIVERED') hash(p.resultDigest); else if (p.resultDigest !== null) fail();
    }
    if (d.status === 'DELIVERED') delivered += BigInt(d.quantity);
    if (d.status !== 'NOT_PERFORMED') reserved += BigInt(d.quantity);
    if (d.status === 'PENDING' || d.status === 'UNKNOWN') unresolved = true; return F(d);
  });
  if (funded !== null && reserved > BigInt(terms.quantity)) fail();
  if (r.compensation !== null) {
    const c = fields(r.compensation, ['originalJson', 'originalDigest', 'status', 'proofJson']);
    if (funded === null || unresolved || purchasedCompensationOriginalDigest(c.originalJson) !== hash(c.originalDigest)) fail();
    const o = JSON.parse(c.originalJson), remaining = BigInt(terms.quantity) - delivered;
    const checkpoint = JSON.parse(purchase.paymentCheckpointJson);
    if (remaining <= 0n || o.quantity !== Number(remaining) || o.amountAtomic !== String((BigInt(terms.price.amount) * remaining + BigInt(terms.quantity) - 1n) / BigInt(terms.quantity))
        || o.termsDigest !== r.termsDigest || o.paymentScope !== paymentScope || o.network !== terms.network || o.asset !== terms.price.asset
        || o.payee !== terms.holder || o.transactionHash === checkpoint.binding.paymentHash || !['RETAINED', 'UNKNOWN', 'CONFIRMED'].includes(c.status)) fail();
    if (c.status === 'RETAINED') { if (c.proofJson !== null) fail(); }
    else {
      const p = decode(c.proofJson, ['version', 'kind', 'compensationId', 'originalDigest', 'transactionHash', 'paymentScope', 'status', 'evidenceId'], 4096);
      if (p.version !== 1 || p.kind !== 'ZENON_EXACT_COMPENSATION_V1' || p.compensationId !== o.compensationId || p.originalDigest !== c.originalDigest
          || p.transactionHash !== o.transactionHash || p.paymentScope !== paymentScope || p.status !== c.status) fail(); id(p.evidenceId);
    }
    r.compensation = F(c);
  }
  if (funded === null && (r.deliveries.length || r.compensation !== null)) fail();
  if (JSON.stringify(r) !== raw) fail(); r.deliveries = F(r.deliveries); return F(r);
}
function envelope(raw) {
  // The nested canonical record can expand when encoded as a JSON string.
  const e = decode(raw, ENVELOPE, 4194304); if (e.version !== 1) fail();
  id(e.storeId); id(e.orderId); hash(e.paymentScope); if (e.ownerId !== null) id(e.ownerId);
  integer(e.epoch); integer(e.revision); if (e.revision < e.epoch) fail();
  if (e.recordJson === null) { if (e.recordDigest !== null) fail(); }
  else { record(e.recordJson, e.orderId, e.paymentScope); if (digest(e.recordJson) !== e.recordDigest) fail(); }
  return F(e);
}
function encode(e) { const raw = JSON.stringify(e); envelope(raw); return raw; }
function token(raw) {
  const t = decode(raw, TOKEN, 4096); if (t.version !== 1) fail(); id(t.storeId); id(t.orderId); hash(t.paymentScope); id(t.ownerId); integer(t.epoch); return F(t);
}
function sameOwner(e, t) { return e.ownerId !== null && TOKEN.slice(1).every(k => e[k] === t[k]); }
function recordTransition(before, after, orderId, paymentScope) {
  if (after === null) fail('RECORD_REMOVAL'); const b = record(after, orderId, paymentScope);
  if (before === null) {
    if (b.fundingReceiptJson !== null || b.deliveries.length || b.compensation !== null) fail('INITIAL_RECORD_NOT_EMPTY'); return;
  }
  const a = record(before, orderId, paymentScope);
  if (!BINDING.every(k => a[k] === b[k])) fail('RECORD_BINDING_CHANGED');
  if (a.fundingReceiptJson !== b.fundingReceiptJson) {
    if (a.fundingReceiptJson !== null || b.fundingReceiptJson === null || !same(a.deliveries, b.deliveries) || !same(a.compensation, b.compensation)) fail('FUNDING_REPLACEMENT'); return;
  }
  if (a.fundingReceiptJson === null) fail('FUNDED_TRANSITION_REQUIRED');
  if (same(a.deliveries, b.deliveries)) {
    if (same(a.compensation, b.compensation)) fail('RECORD_CHANGE_REQUIRED');
    if (a.compensation === null) { if (b.compensation === null || b.compensation.status !== 'RETAINED') fail('COMPENSATION_ORIGINAL_REQUIRED'); return; }
    const old = a.compensation, item = b.compensation;
    if (item === null || old.originalJson !== item.originalJson || old.originalDigest !== item.originalDigest) fail('COMPENSATION_REPLACEMENT');
    if (old.status === 'CONFIRMED' || item.status === 'RETAINED') fail('COMPENSATION_DOWNGRADE'); return;
  }
  if (a.compensation !== null || b.compensation !== null) fail('COMPENSATION_ALREADY_RETAINED');
  if (b.deliveries.length === a.deliveries.length + 1) {
    if (!a.deliveries.every((v, i) => same(v, b.deliveries[i])) || b.deliveries.at(-1).status !== 'PENDING') fail('DELIVERY_INTENT_REQUIRED'); return;
  }
  if (b.deliveries.length !== a.deliveries.length) fail('DELIVERY_REMOVAL_OR_BATCH');
  let changed = 0;
  for (let i = 0; i < a.deliveries.length; i++) {
    const old = a.deliveries[i], item = b.deliveries[i]; if (same(old, item)) continue; changed++;
    if (!IDENTITY.every(k => old[k] === item[k])) fail('DELIVERY_REPLACEMENT');
    if (['DELIVERED', 'NOT_PERFORMED'].includes(old.status)) fail('TERMINAL_DELIVERY_CHANGED');
    if (item.status === 'PENDING') fail('DELIVERY_DOWNGRADE');
  }
  if (changed !== 1) fail('ONE_DELIVERY_TRANSITION_REQUIRED');
}
/** Stored-byte consistency and monotonic history, not independent pins or authentication. */
export function inspectPurchasedOrderFulfillmentEnvelope(raw) { if (arguments.length !== 1) fail(); return envelope(raw); }
export function requirePurchasedOrderFulfillmentEnvelopeTransition(expected, proposed) {
  if (arguments.length !== 2) fail(); const b = envelope(proposed);
  if (expected === null) {
    if (b.ownerId === null || b.epoch !== 1 || b.revision !== 1 || b.recordJson !== null) fail('INVALID_INITIAL_CLAIM'); return b;
  }
  const a = envelope(expected); if (!['storeId', 'orderId', 'paymentScope'].every(k => a[k] === b[k])) fail('ENVELOPE_BINDING_CHANGED');
  if (expected === proposed) return b;
  if (b.revision !== next(a.revision)) fail('REVISION_REQUIRED');
  if (b.epoch === a.epoch) {
    if (a.ownerId === null || b.ownerId !== a.ownerId) fail('OWNER_EPOCH_REQUIRED');
    recordTransition(a.recordJson, b.recordJson, a.orderId, a.paymentScope);
  } else {
    if (b.epoch !== next(a.epoch) || b.recordJson !== a.recordJson || b.recordDigest !== a.recordDigest) fail('HANDOFF_CHANGED_RECORD');
    if (a.ownerId === null && b.ownerId === null) fail('ALREADY_RELEASED');
  }
  return b;
}
function method(value, name) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const d = Object.getOwnPropertyDescriptor(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value') || typeof d.value !== 'function' || types.isProxy(d.value)) fail();
  return (...args) => Reflect.apply(d.value, value, args);
}
function acknowledged(cas, orderId, paymentScope, expected, proposed) {
  let value; try { value = cas(orderId, paymentScope, expected, proposed); } catch { fail('OWNERSHIP_ACK_UNKNOWN'); }
  if (value === null) fail('OWNERSHIP_CONFLICT'); if (value !== proposed) fail('OWNERSHIP_ACK_UNKNOWN');
}
/** Explicit privileged handoff; no TTL, automatic takeover or resource-release assertion. */
export function claimPurchasedOrderFulfillmentOwnership(storeId, orderId, paymentScope, expected, ownerId, backend) {
  if (arguments.length !== 6) fail(); id(storeId); id(orderId); hash(paymentScope); id(ownerId);
  const cas = method(backend, 'compareAndSwapEnvelope'), old = expected === null ? null : envelope(expected);
  if (old !== null && (old.storeId !== storeId || old.orderId !== orderId || old.paymentScope !== paymentScope)) fail('ENVELOPE_BINDING_CHANGED');
  const value = { version: 1, storeId, orderId, paymentScope, ownerId, epoch: old === null ? 1 : next(old.epoch), revision: old === null ? 1 : next(old.revision),
    recordJson: old?.recordJson ?? null, recordDigest: old?.recordDigest ?? null };
  const proposed = encode(value); requirePurchasedOrderFulfillmentEnvelopeTransition(expected, proposed); acknowledged(cas, orderId, paymentScope, expected, proposed);
  return F({ envelopeJson: proposed, ownerTokenJson: JSON.stringify({ version: 1, storeId, orderId, paymentScope, ownerId, epoch: value.epoch }), authority: 'NONE', physicalRelease: 'NOT_QUALIFIED' });
}
export function releasePurchasedOrderFulfillmentOwnership(ownerTokenJson, expected, backend) {
  if (arguments.length !== 3) fail(); const t = token(ownerTokenJson), e = envelope(expected); if (!sameOwner(e, t)) fail('FENCED');
  const proposed = encode({ ...e, ownerId: null, epoch: next(e.epoch), revision: next(e.revision) });
  requirePurchasedOrderFulfillmentEnvelopeTransition(expected, proposed); acknowledged(method(backend, 'compareAndSwapEnvelope'), e.orderId, e.paymentScope, expected, proposed);
  return F({ envelopeJson: proposed, authority: 'NONE', physicalRelease: 'NOT_QUALIFIED' });
}
/** Exact stateStore interface for the actual grant-free order fulfillment owner. */
export function createPurchasedOrderFulfillmentStatePort(ownerTokenJson, backend) {
  if (arguments.length !== 2) fail(); const t = token(ownerTokenJson), read = method(backend, 'readEnvelope'), cas = method(backend, 'compareAndSwapEnvelope');
  let closed = false, busy = false, held = false, loaded = false, current = null, cached = null;
  function usable() { if (closed) fail('CLOSED'); if (held) fail('HELD'); if (busy) fail('BUSY'); }
  function after() { if (closed) { held = true; fail('CLOSED'); } }
  function binding(orderId, paymentScope) { if (orderId !== t.orderId || paymentScope !== t.paymentScope) fail('BINDING_CONFLICT'); }
  const load = function load(orderId, paymentScope) {
    if (arguments.length !== 2) fail(); binding(orderId, paymentScope); usable(); if (loaded) fail('ALREADY_LOADED'); busy = true;
    try {
      let raw; try { raw = read(orderId, paymentScope); after(); } catch { held = true; fail(closed ? 'CLOSED' : 'READ_UNKNOWN'); }
      let e; try { e = envelope(raw); } catch { held = true; fail('CORRUPT'); }
      if (!sameOwner(e, t)) { held = true; fail('FENCED'); } current = raw; cached = e; loaded = true; return e.recordJson;
    } finally { busy = false; }
  };
  const compareAndSwap = function compareAndSwap(orderId, paymentScope, expectedRecord, proposedRecord) {
    if (arguments.length !== 4) fail(); binding(orderId, paymentScope); usable(); if (!loaded) fail('RECOVERY_REQUIRED'); busy = true;
    try {
      if (cached.recordJson !== expectedRecord) fail('EXPECTATION_CONFLICT');
      if (typeof proposedRecord !== 'string') fail('INVALID_RECORD');
      const proposed = proposedRecord === expectedRecord ? current : encode({ ...cached, revision: next(cached.revision), recordJson: proposedRecord, recordDigest: digest(proposedRecord) });
      const checked = requirePurchasedOrderFulfillmentEnvelopeTransition(current, proposed); let observed;
      try { observed = cas(orderId, paymentScope, current, proposed); after(); } catch { held = true; fail(closed ? 'CLOSED' : 'COMMIT_UNKNOWN'); }
      if (observed === null) { held = true; return null; } if (observed !== proposed) { held = true; fail('COMMIT_UNKNOWN'); }
      current = proposed; cached = checked; return proposedRecord;
    } finally { busy = false; }
  };
  return F({ load, compareAndSwap, close() { if (arguments.length !== 0) fail(); closed = true; current = null; cached = null; },
    snapshot() { if (arguments.length !== 0) fail(); return F({ closed, busy, held, loaded, epoch: t.epoch, revision: cached?.revision ?? null,
      authority: 'NONE', physicalRelease: 'NOT_QUALIFIED' }); } });
}
