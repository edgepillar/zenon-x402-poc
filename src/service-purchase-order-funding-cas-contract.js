import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { capturePurchasedOrderPayment } from './service-purchase-order-funding.js';
import { purchasedTermsStorageDigest } from './service-purchase-storage-contract.js';
import { captureVerifiedZenonIssuedFunding } from './service-credit-zenon-funding-evidence.js';

const PROFILE = 'zenon-x402.order-funding.v1';
const FRAME = ['version', 'profile', 'orderId', 'paymentScope', 'paymentRecordJson', 'paymentRecordDigest',
  'maximumVerificationAttempts', 'attempts', 'phase', 'candidateJson', 'candidateDigest',
  'verifiedRecordJson', 'sourceSettlementId', 'verificationObservedAtMs'];
const BINDING = FRAME.slice(0, 7);
const ENVELOPE = ['version', 'storeId', 'orderId', 'paymentScope', 'ownerId', 'epoch', 'revision', 'receiptJson', 'receiptDigest'];
const TOKEN = ['version', 'storeId', 'orderId', 'paymentScope', 'ownerId', 'epoch'];
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
function fail(suffix = 'INVALID_INPUT') {
  const code = 'ORDER_FUNDING_CAS_' + suffix, e = new TypeError(code);
  Object.defineProperties(e, { code: { value: code, enumerable: true }, stack: { value: 'TypeError: ' + code } });
  throw Object.freeze(e);
}
function matches(pattern, value) { return typeof value === 'string' && pattern.exec(value)?.[0] === value; }
function id(value) { if (!matches(ID, value)) fail(); return value; }
function hash(value) { if (!matches(HASH, value)) fail(); return value; }
function integer(value, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(); return value;
}
function next(value) { integer(value); if (value === Number.MAX_SAFE_INTEGER) fail('VERSION_EXHAUSTED'); return value + 1; }
function json(raw, fields, cap) {
  if (typeof raw !== 'string' || !raw.length || raw.length > cap || Buffer.byteLength(raw) > cap || Buffer.from(raw).toString() !== raw) fail();
  let value; try { value = JSON.parse(raw); } catch { fail(); }
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== fields.length
      || !fields.every(k => Object.hasOwn(value, k))) fail();
  const result = Object.fromEntries(fields.map(k => [k, value[k]])); if (JSON.stringify(result) !== raw) fail(); return result;
}
function digest(domain, raw) { return 'sha256:' + createHash('sha256').update(domain).update('\0').update(raw).digest('hex'); }
function candidate(raw) {
  const value = json(raw, ['evidenceVersion', 'artifact'], 16384);
  if (value.evidenceVersion !== 1 || value.artifact === null || typeof value.artifact !== 'object' || Array.isArray(value.artifact)) fail();
}
function receipt(raw) {
  const s = json(raw, FRAME, 524288);
  if (s.version !== 1 || s.profile !== PROFILE) fail(); id(s.orderId); hash(s.paymentScope); hash(s.paymentRecordDigest);
  integer(s.maximumVerificationAttempts, 1, 32); integer(s.attempts, 0, s.maximumVerificationAttempts);
  const original = json(s.paymentRecordJson, ['version', 'profile', 'termsJson', 'paymentCheckpointJson', 'fundingContextJson'], 131072);
  if (original.version !== 1 || original.profile !== PROFILE) fail();
  // Corruption check only. These derived pins are NOT the independent inputs
  // required by the actual order owner on every new recovery session.
  let checkpoint; try { checkpoint = JSON.parse(original.paymentCheckpointJson); } catch { fail(); }
  const p = capturePurchasedOrderPayment(original.termsJson, purchasedTermsStorageDigest(original.termsJson), original.paymentCheckpointJson,
    JSON.stringify({ binding: checkpoint?.binding, digests: checkpoint?.digests }), original.fundingContextJson);
  if (p.orderId !== s.orderId || p.paymentScope !== s.paymentScope || p.paymentRecordJson !== s.paymentRecordJson
      || p.paymentRecordDigest !== s.paymentRecordDigest) fail('RECEIPT_BINDING_CHANGED');
  if (!['RETAINED', 'VERIFYING', 'REJECTED', 'VERIFIED'].includes(s.phase)) fail();
  if (s.phase === 'RETAINED') {
    if (s.attempts !== 0 || s.candidateJson !== null || s.candidateDigest !== null) fail();
  } else {
    integer(s.attempts); candidate(s.candidateJson);
    if (s.candidateDigest !== digest(PROFILE + ':candidate', s.candidateJson)) fail();
  }
  if (s.phase === 'VERIFIED') {
    let record; try { record = JSON.parse(s.verifiedRecordJson); } catch { fail(); }
    const verified = captureVerifiedZenonIssuedFunding({ ...p.verifierContext, verifiedRecord: record });
    if (JSON.stringify(verified.verifiedRecord) !== s.verifiedRecordJson || s.sourceSettlementId !== verified.sourceSettlementId) fail();
    integer(s.verificationObservedAtMs, 0);
  } else if (s.verifiedRecordJson !== null || s.sourceSettlementId !== null || s.verificationObservedAtMs !== null) fail();
  return s;
}
/** Stored-byte consistency only; no independent pins, authentication or economic authority. */
export function inspectPurchasedOrderFundingReceipt(receiptJson) {
  if (arguments.length !== 1) fail(); return Object.freeze({ receipt: Object.freeze(receipt(receiptJson)), independentPinsChecked: false });
}
function receiptDigest(raw) { return digest('zenon-x402:order-funding-cas-receipt:v1', raw); }
function envelope(raw) {
  const e = json(raw, ENVELOPE, 1048576); if (e.version !== 1) fail();
  id(e.storeId); id(e.orderId); hash(e.paymentScope); if (e.ownerId !== null) id(e.ownerId);
  integer(e.epoch); integer(e.revision, e.epoch);
  if (e.receiptJson === null) { if (e.receiptDigest !== null) fail(); }
  else {
    const s = receipt(e.receiptJson);
    if (s.orderId !== e.orderId || s.paymentScope !== e.paymentScope || e.receiptDigest !== receiptDigest(e.receiptJson)) fail();
  }
  return e;
}
function encode(e) { const raw = JSON.stringify(e); envelope(raw); return raw; }
export function inspectPurchasedOrderFundingEnvelope(envelopeJson) {
  if (arguments.length !== 1) fail(); return Object.freeze(envelope(envelopeJson));
}
function receiptTransition(before, after) {
  if (after === null) fail('RECEIPT_REMOVAL'); const b = receipt(after);
  if (before === null) { if (b.phase !== 'RETAINED') fail('ORIGINAL_REQUIRED'); return; }
  const a = receipt(before); if (!BINDING.every(k => a[k] === b[k])) fail('RECEIPT_BINDING_CHANGED');
  if (before === after) fail('RECEIPT_CHANGE_REQUIRED');
  if (a.phase === 'VERIFIED') fail('VERIFIED_RECEIPT_CHANGED');
  if (b.phase === 'VERIFYING') {
    if (a.attempts >= a.maximumVerificationAttempts || b.attempts !== a.attempts + 1) fail('ATTEMPT_REQUIRED');
    if (a.phase === 'VERIFYING' && a.candidateJson !== b.candidateJson) fail('PENDING_CANDIDATE_CHANGED');
  } else {
    if (a.phase !== 'VERIFYING' || !['REJECTED', 'VERIFIED'].includes(b.phase)
        || a.attempts !== b.attempts || a.candidateJson !== b.candidateJson || a.candidateDigest !== b.candidateDigest) fail('ATTEMPT_REQUIRED');
  }
}
/** Structural/monotonic storage contract. The owner still checks independent purchase pins. */
export function requirePurchasedOrderFundingEnvelopeTransition(expectedJson, nextJson) {
  if (arguments.length !== 2) fail(); const b = envelope(nextJson);
  if (expectedJson === null) {
    if (b.ownerId === null || b.epoch !== 1 || b.revision !== 1 || b.receiptJson !== null) fail('INVALID_INITIAL_CLAIM');
    return Object.freeze(b);
  }
  const a = envelope(expectedJson);
  if (!['storeId', 'orderId', 'paymentScope'].every(k => a[k] === b[k])) fail('ENVELOPE_BINDING_CHANGED');
  if (expectedJson === nextJson) return Object.freeze(b);
  if (b.revision !== next(a.revision)) fail('REVISION_REQUIRED');
  if (b.epoch === a.epoch) {
    if (a.ownerId === null || b.ownerId !== a.ownerId) fail('OWNER_EPOCH_REQUIRED');
    receiptTransition(a.receiptJson, b.receiptJson);
  } else {
    if (b.epoch !== next(a.epoch) || b.receiptJson !== a.receiptJson || b.receiptDigest !== a.receiptDigest) fail('HANDOFF_CHANGED_RECEIPT');
    if (a.ownerId === null && b.ownerId === null) fail('ALREADY_RELEASED');
  }
  return Object.freeze(b);
}
function method(object, name) {
  if (object === null || typeof object !== 'object' || types.isProxy(object) || Object.getPrototypeOf(object) !== Object.prototype) fail();
  const d = Object.getOwnPropertyDescriptor(object, name);
  if (!d?.enumerable || !Object.hasOwn(d, 'value') || typeof d.value !== 'function' || types.isProxy(d.value)) fail();
  return (...args) => Reflect.apply(d.value, object, args);
}
function token(raw) {
  const t = json(raw, TOKEN, 4096); if (t.version !== 1) fail();
  id(t.storeId); id(t.orderId); hash(t.paymentScope); id(t.ownerId); integer(t.epoch); return t;
}
function sameOwner(e, t) { return e.ownerId !== null && ['storeId', 'orderId', 'paymentScope', 'ownerId', 'epoch'].every(k => e[k] === t[k]); }
function acknowledged(cas, e, expectedJson, proposed) {
  let observed; try { observed = cas(e.orderId, e.paymentScope, expectedJson, proposed); } catch { fail('OWNERSHIP_ACK_UNKNOWN'); }
  if (observed === null) fail('OWNERSHIP_CONFLICT'); if (observed !== proposed) fail('OWNERSHIP_ACK_UNKNOWN');
}
/** Explicit privileged handoff only. No TTL, automatic takeover or physical-release assertion. */
export function claimPurchasedOrderFundingOwnership(storeId, orderId, paymentScope, expectedJson, ownerId, backend) {
  if (arguments.length !== 6) fail(); id(storeId); id(orderId); hash(paymentScope); id(ownerId);
  const cas = method(backend, 'compareAndSwapEnvelope'), old = expectedJson === null ? null : envelope(expectedJson);
  if (old !== null && (old.storeId !== storeId || old.orderId !== orderId || old.paymentScope !== paymentScope)) fail('ENVELOPE_BINDING_CHANGED');
  const proposed = encode({ version: 1, storeId, orderId, paymentScope, ownerId, epoch: old === null ? 1 : next(old.epoch),
    revision: old === null ? 1 : next(old.revision), receiptJson: old?.receiptJson ?? null, receiptDigest: old?.receiptDigest ?? null });
  const e = requirePurchasedOrderFundingEnvelopeTransition(expectedJson, proposed); acknowledged(cas, e, expectedJson, proposed);
  const ownerTokenJson = JSON.stringify({ version: 1, storeId, orderId, paymentScope, ownerId, epoch: e.epoch });
  return Object.freeze({ envelopeJson: proposed, ownerTokenJson, authority: 'NONE', physicalRelease: 'NOT_QUALIFIED' });
}
export function releasePurchasedOrderFundingOwnership(ownerTokenJson, expectedJson, backend) {
  if (arguments.length !== 3) fail(); const t = token(ownerTokenJson), e = envelope(expectedJson);
  if (!sameOwner(e, t)) fail('FENCED'); const cas = method(backend, 'compareAndSwapEnvelope');
  const proposed = encode({ ...e, ownerId: null, epoch: next(e.epoch), revision: next(e.revision) });
  requirePurchasedOrderFundingEnvelopeTransition(expectedJson, proposed); acknowledged(cas, e, expectedJson, proposed);
  return Object.freeze({ envelopeJson: proposed, authority: 'NONE', physicalRelease: 'NOT_QUALIFIED' });
}
/** Dedicated receiptStore port for the actual grant-free purchased-order owner. */
export function createPurchasedOrderFundingReceiptPort(ownerTokenJson, backend) {
  if (arguments.length !== 2) fail(); const t = token(ownerTokenJson);
  const read = method(backend, 'readEnvelope'), cas = method(backend, 'compareAndSwapEnvelope');
  let closed = false, busy = false, held = false, loaded = false, currentJson = null;
  function usable() { if (closed) fail('CLOSED'); if (held) fail('HELD'); if (busy) fail('BUSY'); }
  function after() { if (closed) { held = true; fail('CLOSED'); } }
  function binding(orderId, paymentScope) { if (orderId !== t.orderId || paymentScope !== t.paymentScope) fail('BINDING_CONFLICT'); }
  const load = function load(orderId, paymentScope) {
    if (arguments.length !== 2) fail(); binding(orderId, paymentScope); usable(); if (loaded) fail('ALREADY_LOADED'); busy = true;
    try {
      let raw; try { raw = read(orderId, paymentScope); after(); } catch { held = true; fail(closed ? 'CLOSED' : 'READ_UNKNOWN'); }
      let e; try { e = envelope(raw); } catch { held = true; fail('CORRUPT'); }
      if (!sameOwner(e, t)) { held = true; fail('FENCED'); }
      currentJson = raw; loaded = true; return e.receiptJson;
    } finally { busy = false; }
  };
  const compareAndSwap = function compareAndSwap(orderId, paymentScope, expectedReceiptJson, nextReceiptJson) {
    if (arguments.length !== 4) fail(); binding(orderId, paymentScope); usable(); if (!loaded) fail('RECOVERY_REQUIRED'); busy = true;
    try {
      const e = envelope(currentJson); if (e.receiptJson !== expectedReceiptJson) fail('EXPECTATION_CONFLICT');
      const s = receipt(nextReceiptJson); if (s.orderId !== orderId || s.paymentScope !== paymentScope) fail('BINDING_CONFLICT');
      const proposed = nextReceiptJson === expectedReceiptJson ? currentJson : encode({ ...e, revision: next(e.revision),
        receiptJson: nextReceiptJson, receiptDigest: receiptDigest(nextReceiptJson) });
      requirePurchasedOrderFundingEnvelopeTransition(currentJson, proposed); let observed;
      try { observed = cas(orderId, paymentScope, currentJson, proposed); after(); }
      catch { held = true; fail(closed ? 'CLOSED' : 'COMMIT_UNKNOWN'); }
      if (observed === null) { held = true; return null; }
      if (observed !== proposed) { held = true; fail('COMMIT_UNKNOWN'); }
      currentJson = proposed; return nextReceiptJson;
    } finally { busy = false; }
  };
  return Object.freeze({ load, compareAndSwap,
    close() { if (arguments.length !== 0) fail(); closed = true; },
    snapshot() { return Object.freeze({ closed, busy, held, loaded, epoch: t.epoch,
      revision: currentJson === null ? null : envelope(currentJson).revision, authority: 'NONE', physicalRelease: 'NOT_QUALIFIED' }); } });
}
