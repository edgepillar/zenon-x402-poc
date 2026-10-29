import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { captureApiCreditSignerInspectionExpected } from './api-credit-signer-inspection-profile.js';
import { decodeOriginalFundingSignerContextRecord, projectOriginalFundingSignerContextRecord } from './original-funding-signer-context-custody.js';
import { restoreOriginalPaymentCheckpoint, encodeOriginalPaymentCheckpoint } from './service-credit-pilot-original-payment-checkpoint.js';

const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn, PP = Promise.prototype, THEN = PP.then;
const CTOR = DESC(PP, 'constructor'), SPECIES = DESC(Promise, Symbol.species), ACTIVE = new Set(), FAILED = new Set(), SEEN = new WeakSet();
const OUTPUT = ['signerInspectionVersion', 'status', 'paymentId', 'originalDigest', 'fundingResourceUrl', 'inputDigestMatched', 'transactionHash',
  'serializedCheckpoint', 'expectedPins', 'authority', 'maySignPayment', 'mayStartPayment', 'mayDispatchFunding', 'mayDispatchService',
  'currentAuthority', 'signatureValidation', 'historicalObservation', 'nativeDurability', 'automaticRetry'];
function fail(stage = 'UNKNOWN') { const e = new TypeError('ORIGINAL_FUNDING_SIGNER_INSPECTION'); Object.defineProperty(e, 'stage', { value: stage, enumerable: true }); Object.defineProperty(e, 'stack', { value: e.message }); throw F(e); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== names.length) fail('INPUT');
  const out = {};
  for (const name of names) { const d = DESC(value, name); if (!d?.enumerable || !OWN(d, 'value')) fail('INPUT'); out[name] = d.value; } return out;
}
function data(value, name) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || !Object.isFrozen(value)) fail('OWNER');
  const d = DESC(value, name); if (!d?.enumerable || !OWN(d, 'value')) fail('OWNER'); return d.value;
}
function method(owner, name) { const fn = data(owner, name); if (typeof fn !== 'function' || types.isProxy(fn) || !Object.isFrozen(fn)) fail('OWNER'); return fn; }
function same(a, b) { return !!a && !!b && Reflect.ownKeys(a).length === Reflect.ownKeys(b).length && Reflect.ownKeys(b).every(k => OWN(a, k) && a[k] === b[k]); }
function discardUnexpectedPromise(value) {
  if (types.isPromise(value) && !types.isProxy(value) && Object.getPrototypeOf(value) === PP && PP.then === THEN
      && DESC(Object.prototype, 'then') === undefined && same(DESC(PP, 'constructor'), CTOR) && same(DESC(Promise, Symbol.species), SPECIES)) {
    const d = DESC(value, 'constructor'); if (!d || OWN(d, 'value') && d.value === Promise) { try { Reflect.apply(THEN, value, [() => {}, () => {}]); } catch {} }
  }
}
function voidReceipt(value) { if (value !== undefined) { discardUnexpectedPromise(value); fail('CLOSE_UNKNOWN'); } }
export function captureApiCreditSignerInspectionResult(raw, expectedInput) {
  if (arguments.length !== 2) fail('INPUT'); const expected = captureApiCreditSignerInspectionExpected(expectedInput);
  let record = null, projection = null;
  if (raw !== null) {
    record = decodeOriginalFundingSignerContextRecord(raw);
    if (record.paymentId !== expected.paymentId || record.originalDigest !== expected.originalDigest || record.fundingResourceUrl !== expected.fundingResourceUrl) fail('ORIGINAL_MISMATCH');
    if (record.phase === 'SIGNED') projection = projectOriginalFundingSignerContextRecord(raw, { paymentId: expected.paymentId, originalDigest: expected.originalDigest });
  }
  return captureApiCreditSignerInspectionOutput(F({ signerInspectionVersion: 1, status: record === null ? 'NOT_RECORDED' : projection === null ? 'INTENT_ONLY' : 'SIGNED_DATA',
    ...expected, inputDigestMatched: record !== null, transactionHash: record === null ? null : record.transactionHash,
    serializedCheckpoint: projection === null ? null : projection.packet.serializedCheckpoint, expectedPins: projection === null ? null : projection.packet.expectedPins,
    authority: 'NONE', maySignPayment: false, mayStartPayment: false, mayDispatchFunding: false, mayDispatchService: false,
    currentAuthority: 'NOT_ESTABLISHED', signatureValidation: 'NOT_PERFORMED', historicalObservation: true, nativeDurability: 'NOT_ESTABLISHED', automaticRetry: false }));
}
/** Sensitive signed-payment DATA goes only to the owned private result pipe.
 * Its closed grammar never grants current signing/replay/delivery authority. */
export function captureApiCreditSignerInspectionOutput(value) {
  if (arguments.length !== 1) fail('OUTPUT'); const c = fields(value, OUTPUT); captureApiCreditSignerInspectionExpected({ paymentId: c.paymentId, originalDigest: c.originalDigest, fundingResourceUrl: c.fundingResourceUrl });
  if (c.signerInspectionVersion !== 1 || !['NOT_RECORDED', 'INTENT_ONLY', 'SIGNED_DATA'].includes(c.status) || c.inputDigestMatched !== (c.status !== 'NOT_RECORDED')
      || c.authority !== 'NONE' || c.currentAuthority !== 'NOT_ESTABLISHED' || c.signatureValidation !== 'NOT_PERFORMED' || c.historicalObservation !== true || c.nativeDurability !== 'NOT_ESTABLISHED') fail('OUTPUT');
  for (const name of ['maySignPayment', 'mayStartPayment', 'mayDispatchFunding', 'mayDispatchService', 'automaticRetry']) if (c[name] !== false) fail('OUTPUT');
  if (c.status === 'NOT_RECORDED' ? c.transactionHash !== null : typeof c.transactionHash !== 'string' || /^[0-9a-f]{64}$/.exec(c.transactionHash)?.[0] !== c.transactionHash) fail('OUTPUT');
  if (c.status === 'SIGNED_DATA') {
    const checkpoint = restoreOriginalPaymentCheckpoint(c.serializedCheckpoint, c.expectedPins);
    const binding = data(c.expectedPins, 'binding');
    if (encodeOriginalPaymentCheckpoint(checkpoint) !== c.serializedCheckpoint || data(binding, 'paymentHash') !== c.transactionHash
        || data(binding, 'origin') !== new URL(c.fundingResourceUrl).origin) fail('OUTPUT');
  } else if (c.serializedCheckpoint !== null || c.expectedPins !== null) fail('OUTPUT');
  if (Buffer.byteLength(canonicalJson(c)) > 131071) fail('OUTPUT'); return F(c);
}
/** Fixed synchronous file-owner protocol. The native caller hardwires the real
 * context-required opener; DATA controls declare it. Never raw-close an
 * unreturned/malformed owner or retry an uncertain revoke/physical close. */
export function runApiCreditSignerInspectionOwner(configuration) {
  if (arguments.length !== 1 || ACTIVE.size + FAILED.size >= 16) fail('LIMIT');
  const c = fields(configuration, ['fileConfiguration', 'expectedOriginal', 'ports', 'requireOpening']), p = fields(c.ports, ['openFile']);
  const expected = captureApiCreditSignerInspectionExpected(c.expectedOriginal);
  for (const fn of [p.openFile, c.requireOpening]) if (typeof fn !== 'function' || types.isProxy(fn) || !Object.isFrozen(fn)) fail('INPUT');
  const frame = { owner: null, known: false, revoke: null, close: null, view: null, revoked: false, closed: false, revokeEntered: false, closeEntered: false, stage: 'OPEN' };
  ACTIVE.add(frame); let bad = false, result = null;
  function view() { return Reflect.apply(frame.view, frame.owner, []); }
  function state(v, phase, databaseOpen) {
    return data(v, 'spendingFileOwnerVersion') === 1 && data(v, 'lifecycle') === phase && data(v, 'held') === false && data(v, 'busy') === false
      && data(v, 'backendClosed') === (phase !== 'OPEN') && data(v, 'databaseOpen') === databaseOpen
      && data(v, 'physicalCloseEntered') === (phase === 'CLOSED') && data(v, 'physicalCloseReturned') === (phase === 'CLOSED');
  }
  try {
    c.requireOpening(); frame.owner = p.openFile(c.fileConfiguration); discardUnexpectedPromise(frame.owner);
    if (frame.owner === null || typeof frame.owner !== 'object' || types.isProxy(frame.owner) || types.isPromise(frame.owner) || SEEN.has(frame.owner)) fail('OWNER');
    frame.view = method(frame.owner, 'inspect'); frame.revoke = method(frame.owner, 'revoke'); frame.close = method(frame.owner, 'close');
    const custody = data(frame.owner, 'signerCustody'), read = method(custody, 'readSignerRecord'); if (data(custody, 'requirePreparationContext') !== true) fail('OWNER');
    SEEN.add(frame.owner); frame.known = true; c.requireOpening(); if (!state(view(), 'OPEN', true)) fail('OWNER');
    frame.stage = 'READ'; const raw = Reflect.apply(read, custody, [expected.paymentId]); discardUnexpectedPromise(raw); c.requireOpening();
    result = captureApiCreditSignerInspectionResult(raw, expected); c.requireOpening(); if (!state(view(), 'OPEN', true)) fail('OWNER');
  } catch { bad = true; }
  finally {
    if (frame.known) {
      frame.revokeEntered = true;
      try { voidReceipt(Reflect.apply(frame.revoke, frame.owner, [])); frame.revoked = state(view(), 'REVOKED', true); } catch {}
      if (frame.revoked) {
        frame.closeEntered = true;
        try { voidReceipt(Reflect.apply(frame.close, frame.owner, [])); frame.closed = state(view(), 'CLOSED', false); } catch {}
      }
    }
    ACTIVE.delete(frame); if (bad || !frame.closed) FAILED.add(frame);
  }
  if (bad || result === null || !frame.closed) fail(frame.stage);
  try { c.requireOpening(); } catch { FAILED.add(frame); fail('AFTER_CLOSE'); } return result;
}
