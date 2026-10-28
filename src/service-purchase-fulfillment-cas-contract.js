import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';

const PROFILE = 'zenon-x402.purchase-fulfillment.v1';
const FIELDS = ['version', 'storeId', 'orderId', 'ownerId', 'epoch', 'revision', 'recordJson', 'recordDigest'];
const TOKEN = ['version', 'storeId', 'orderId', 'ownerId', 'epoch'];
const RECORD = ['version', 'profile', 'orderId', 'termsDigest', 'policyJson', 'paymentScope', 'checkpointDigest', 'grantId', 'serviceResourceUrl', 'fundingJson', 'deliveries', 'compensation'];
const BINDING = RECORD.slice(0, 9);
const DELIVERY = ['deliveryId', 'requestScope', 'requestId', 'originalDigest', 'quantity', 'status', 'proofJson'];
const DELIVERY_IDENTITY = DELIVERY.slice(0, 5);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
function fail(suffix = 'INVALID_INPUT') {
  const code = 'FULFILLMENT_CAS_' + suffix, e = new TypeError(code);
  Object.defineProperties(e, { code: { value: code, enumerable: true }, stack: { value: 'TypeError: ' + code } });
  throw Object.freeze(e);
}
function matches(pattern, value) { return typeof value === 'string' && pattern.exec(value)?.[0] === value; }
function id(value) { if (!matches(ID, value)) fail(); return value; }
function integer(value) { if (!Number.isSafeInteger(value) || value < 1) fail(); return value; }
function next(value) { integer(value); if (value === Number.MAX_SAFE_INTEGER) fail('VERSION_EXHAUSTED'); return value + 1; }
function text(value, limit) {
  if (typeof value !== 'string' || !value.length || value.length > limit || Buffer.byteLength(value) > limit
      || Buffer.from(value).toString() !== value) fail(); return value;
}
function fields(value, names) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== names.length
      || !names.every(k => Object.hasOwn(value, k))) fail();
  return Object.fromEntries(names.map(k => [k, value[k]]));
}
function json(raw, limit) {
  text(raw, limit); let value; try { value = JSON.parse(raw); } catch { fail(); }
  if (value === null || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value) !== raw) fail(); return value;
}
function record(raw, orderId) {
  const r = fields(json(raw, 131072), RECORD);
  if (r.version !== 1 || r.profile !== PROFILE || r.orderId !== orderId
      || !['termsDigest', 'paymentScope', 'checkpointDigest'].every(k => matches(HASH, r[k]))) fail();
  id(r.orderId); id(r.grantId); text(r.serviceResourceUrl, 4096); json(r.policyJson, 4096);
  if (r.fundingJson !== null) json(r.fundingJson, 4096);
  if (!Array.isArray(r.deliveries) || r.deliveries.length > 64) fail();
  const ids = new Set(), requests = new Set();
  r.deliveries = r.deliveries.map(value => {
    const d = fields(value, DELIVERY); id(d.deliveryId); id(d.requestId); integer(d.quantity);
    if (!matches(HASH, d.requestScope) || !matches(HASH, d.originalDigest)
        || ids.has(d.deliveryId) || requests.has(d.requestScope)
        || !['PENDING', 'UNKNOWN', 'NOT_PERFORMED', 'DELIVERED'].includes(d.status)) fail();
    ids.add(d.deliveryId); requests.add(d.requestScope);
    if (d.status === 'PENDING') { if (d.proofJson !== null) fail(); } else json(d.proofJson, 4096);
    return d;
  });
  if (r.compensation !== null) {
    if (r.deliveries.some(d => d.status === 'PENDING' || d.status === 'UNKNOWN')) fail();
    const c = fields(r.compensation, ['originalJson', 'originalDigest', 'status', 'proofJson']);
    if (!matches(HASH, c.originalDigest) || !['RETAINED', 'UNKNOWN', 'CONFIRMED'].includes(c.status)) fail();
    json(c.originalJson, 16384);
    if (c.status === 'RETAINED') { if (c.proofJson !== null) fail(); } else json(c.proofJson, 4096);
    r.compensation = c;
  }
  if (r.fundingJson === null && (r.deliveries.length || r.compensation !== null)) fail();
  if (JSON.stringify(r) !== raw) fail(); return r;
}
function recordDigest(raw) {
  return 'sha256:' + createHash('sha256').update('zenon-x402:fulfillment-cas-record:v1\0').update(raw).digest('hex');
}
function envelope(raw) {
  const e = fields(json(raw, 524288), FIELDS);
  if (e.version !== 1) fail(); id(e.storeId); id(e.orderId); if (e.ownerId !== null) id(e.ownerId);
  integer(e.epoch); integer(e.revision); if (e.revision < e.epoch) fail();
  if (e.recordJson === null) { if (e.recordDigest !== null) fail(); }
  else { record(e.recordJson, e.orderId); if (recordDigest(e.recordJson) !== e.recordDigest) fail(); }
  if (JSON.stringify(e) !== raw) fail(); return e;
}
function encode(e) { const raw = JSON.stringify(e); envelope(raw); return raw; }
function token(raw) {
  const t = fields(json(raw, 4096), TOKEN);
  if (t.version !== 1) fail(); id(t.storeId); id(t.orderId); id(t.ownerId); integer(t.epoch);
  if (JSON.stringify(t) !== raw) fail(); return t;
}
function sameOwner(e, t) { return e.ownerId !== null && ['storeId', 'orderId', 'ownerId', 'epoch'].every(k => e[k] === t[k]); }
function monotonicRecord(before, after, orderId) {
  if (after === null) fail('RECORD_REMOVAL'); const b = record(after, orderId);
  if (before === null) {
    if (b.fundingJson !== null || b.deliveries.length || b.compensation !== null) fail('INITIAL_RECORD_NOT_EMPTY'); return;
  }
  const a = record(before, orderId);
  if (!BINDING.every(k => a[k] === b[k]) || (a.fundingJson !== null && a.fundingJson !== b.fundingJson)) fail('RECORD_BINDING_CHANGED');
  if (b.deliveries.length < a.deliveries.length) fail('DELIVERY_REMOVAL');
  for (let i = 0; i < a.deliveries.length; i++) {
    const old = a.deliveries[i], item = b.deliveries[i];
    if (!DELIVERY_IDENTITY.every(k => old[k] === item[k])) fail('DELIVERY_REPLACEMENT');
    if (['NOT_PERFORMED', 'DELIVERED'].includes(old.status) && JSON.stringify(old) !== JSON.stringify(item)) fail('TERMINAL_DELIVERY_CHANGED');
    if (old.status === 'UNKNOWN' && item.status === 'PENDING') fail('DELIVERY_DOWNGRADE');
  }
  for (const item of b.deliveries.slice(a.deliveries.length)) if (item.status !== 'PENDING') fail('DELIVERY_INTENT_REQUIRED');
  if (a.compensation !== null) {
    const old = a.compensation, item = b.compensation;
    if (item === null || old.originalJson !== item.originalJson || old.originalDigest !== item.originalDigest) fail('COMPENSATION_REPLACEMENT');
    if ((old.status === 'CONFIRMED' && JSON.stringify(old) !== JSON.stringify(item))
        || (old.status === 'UNKNOWN' && item.status === 'RETAINED')) fail('COMPENSATION_DOWNGRADE');
    if (b.deliveries.length !== a.deliveries.length) fail('COMPENSATION_ALREADY_RETAINED');
  } else if (b.compensation !== null && b.compensation.status !== 'RETAINED') fail('COMPENSATION_ORIGINAL_REQUIRED');
}

/** Structural/storage invariants only; the fulfillment owner verifies its own business binding. */
export function requirePurchasedFulfillmentEnvelopeTransition(expectedJson, nextJson) {
  if (arguments.length !== 2) fail(); const b = envelope(nextJson);
  if (expectedJson === null) {
    if (b.ownerId === null || b.epoch !== 1 || b.revision !== 1 || b.recordJson !== null) fail('INVALID_INITIAL_CLAIM');
    return Object.freeze(b);
  }
  const a = envelope(expectedJson);
  if (a.storeId !== b.storeId || a.orderId !== b.orderId) fail('ENVELOPE_BINDING_CHANGED');
  if (expectedJson === nextJson) return Object.freeze(b);
  if (b.revision !== next(a.revision)) fail('REVISION_REQUIRED');
  if (b.epoch === a.epoch) {
    if (a.ownerId === null || b.ownerId !== a.ownerId) fail('OWNER_EPOCH_REQUIRED');
    monotonicRecord(a.recordJson, b.recordJson, a.orderId);
  } else {
    if (b.epoch !== next(a.epoch) || b.recordJson !== a.recordJson || b.recordDigest !== a.recordDigest) fail('HANDOFF_CHANGED_RECORD');
    if (a.ownerId === null && b.ownerId === null) fail('ALREADY_RELEASED');
  }
  return Object.freeze(b);
}
export function inspectPurchasedFulfillmentEnvelope(envelopeJson) {
  if (arguments.length !== 1) fail(); return Object.freeze(envelope(envelopeJson));
}
function method(object, name) {
  if (object === null || typeof object !== 'object' || types.isProxy(object) || Object.getPrototypeOf(object) !== Object.prototype) fail();
  const d = Object.getOwnPropertyDescriptor(object, name);
  if (!d?.enumerable || !Object.hasOwn(d, 'value') || typeof d.value !== 'function') fail();
  return (...args) => Reflect.apply(d.value, object, args);
}
function acknowledged(cas, orderId, expected, proposed) {
  let observed; try { observed = cas(orderId, expected, proposed); } catch { fail('OWNERSHIP_ACK_UNKNOWN'); }
  if (observed === null) fail('OWNERSHIP_CONFLICT'); if (observed !== proposed) fail('OWNERSHIP_ACK_UNKNOWN');
}
/** Explicit privileged handoff; no TTL, liveness inference, retry or resource-release assertion. */
export function claimPurchasedFulfillmentOwnership(storeId, orderId, expectedJson, ownerId, backend) {
  if (arguments.length !== 5) fail(); id(storeId); id(orderId); id(ownerId);
  const cas = method(backend, 'compareAndSwapEnvelope'), old = expectedJson === null ? null : envelope(expectedJson);
  if (old !== null && (old.storeId !== storeId || old.orderId !== orderId)) fail('ENVELOPE_BINDING_CHANGED');
  const value = { version: 1, storeId, orderId, ownerId, epoch: old === null ? 1 : next(old.epoch),
    revision: old === null ? 1 : next(old.revision), recordJson: old?.recordJson ?? null, recordDigest: old?.recordDigest ?? null };
  const proposed = encode(value); requirePurchasedFulfillmentEnvelopeTransition(expectedJson, proposed);
  acknowledged(cas, orderId, expectedJson, proposed);
  const ownerTokenJson = JSON.stringify({ version: 1, storeId, orderId, ownerId, epoch: value.epoch });
  return Object.freeze({ envelopeJson: proposed, ownerTokenJson, authority: 'NONE', physicalRelease: 'NOT_QUALIFIED' });
}
export function releasePurchasedFulfillmentOwnership(ownerTokenJson, expectedJson, backend) {
  if (arguments.length !== 3) fail(); const t = token(ownerTokenJson), e = envelope(expectedJson);
  if (!sameOwner(e, t)) fail('FENCED'); const cas = method(backend, 'compareAndSwapEnvelope');
  const proposed = encode({ ...e, ownerId: null, epoch: next(e.epoch), revision: next(e.revision) });
  requirePurchasedFulfillmentEnvelopeTransition(expectedJson, proposed); acknowledged(cas, e.orderId, expectedJson, proposed);
  return Object.freeze({ envelopeJson: proposed, authority: 'NONE', physicalRelease: 'NOT_QUALIFIED' });
}

/** Dedicated stateStore port for createPurchasedServiceFulfillmentOwner. */
export function createPurchasedFulfillmentStatePort(ownerTokenJson, backend) {
  if (arguments.length !== 2) fail(); const t = token(ownerTokenJson);
  const read = method(backend, 'readEnvelope'), cas = method(backend, 'compareAndSwapEnvelope');
  let closed = false, busy = false, unavailable = false, loaded = false, observedJson = null;
  function usable() { if (closed) fail('CLOSED'); if (unavailable) fail('HELD'); if (busy) fail('BUSY'); }
  function after() { if (closed) { unavailable = true; fail('CLOSED'); } }
  const load = function load(orderId) {
    if (arguments.length !== 1 || orderId !== t.orderId) fail(); usable(); if (loaded) fail('ALREADY_LOADED'); busy = true;
    try {
      let raw; try { raw = read(orderId); after(); } catch { unavailable = true; fail(closed ? 'CLOSED' : 'READ_UNKNOWN'); }
      let e; try { e = envelope(raw); } catch { unavailable = true; fail('CORRUPT'); }
      if (!sameOwner(e, t)) { unavailable = true; fail('FENCED'); }
      observedJson = raw; loaded = true; return e.recordJson;
    } finally { busy = false; }
  };
  const compareAndSwap = function compareAndSwap(orderId, expectedRecordJson, nextRecordJson) {
    if (arguments.length !== 3 || orderId !== t.orderId) fail(); usable(); if (!loaded) fail('RECOVERY_REQUIRED'); busy = true;
    try {
      const e = envelope(observedJson);
      if (e.recordJson !== expectedRecordJson) fail('EXPECTATION_CONFLICT');
      record(nextRecordJson, orderId);
      const proposed = nextRecordJson === expectedRecordJson ? observedJson : encode({ ...e, revision: next(e.revision), recordJson: nextRecordJson, recordDigest: recordDigest(nextRecordJson) });
      requirePurchasedFulfillmentEnvelopeTransition(observedJson, proposed);
      let result;
      try { result = cas(orderId, observedJson, proposed); after(); }
      catch { unavailable = true; fail(closed ? 'CLOSED' : 'COMMIT_UNKNOWN'); }
      if (result === null) { unavailable = true; return null; }
      if (result !== proposed) { unavailable = true; fail('COMMIT_UNKNOWN'); }
      observedJson = proposed; return nextRecordJson;
    } finally { busy = false; }
  };
  return Object.freeze({ load, compareAndSwap,
    close() { if (arguments.length !== 0) fail(); closed = true; },
    snapshot() { return Object.freeze({ closed, busy, unavailable, loaded, epoch: t.epoch,
      revision: observedJson === null ? null : envelope(observedJson).revision, authority: 'NONE', physicalRelease: 'NOT_QUALIFIED' }); } });
}
