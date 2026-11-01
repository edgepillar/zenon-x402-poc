import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { captureApiCreditSignerInspectionExpected } from './api-credit-signer-inspection-profile.js';
import { decodeOriginalFundingSignerContextRecord, projectOriginalFundingSignerContextRecord } from './original-funding-signer-context-custody.js';
import { restoreOriginalPaymentCheckpoint, encodeOriginalPaymentCheckpoint } from './service-credit-pilot-original-payment-checkpoint.js';
import { captureOriginalFundingSpendingFileProfile } from './original-funding-spending-file-profile.js';
import { inspectOriginalFundingSpendingState } from './original-funding-spending-reservations.js';
import { captureOriginalFundingUncertaintyAgeLimits, inspectOriginalFundingUncertaintyAge } from './original-funding-uncertainty-age.js';

const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn, PP = Promise.prototype, THEN = PP.then;
const CTOR = DESC(PP, 'constructor'), SPECIES = DESC(Promise, Symbol.species), ACTIVE = new Set(), FAILED = new Set(), SEEN = new WeakSet();
const AGE_OUTPUTS = new WeakSet();
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
  if (arguments.length !== 1) fail('OUTPUT');
  if (value !== null && typeof value === 'object' && !types.isProxy(value)) {
    const version = DESC(value, 'signerInspectionVersion');
    if (version?.enumerable && OWN(version, 'value') && version.value === 2) {
      if (!AGE_OUTPUTS.has(value)) fail('OUTPUT'); return value;
    }
  }
  const c = fields(value, OUTPUT); captureApiCreditSignerInspectionExpected({ paymentId: c.paymentId, originalDigest: c.originalDigest, fundingResourceUrl: c.fundingResourceUrl });
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
function ageResult(signer, raw, spending, expected, observedDay, ageLimits) {
  const row = spending.reservations.find(r => r.paymentId === expected.paymentId);
  if (row ? row.originalDigest !== expected.originalDigest : signer.status !== 'NOT_RECORDED') fail('SPENDING_ORIGINAL_MISMATCH');
  const uncertaintyAge = inspectOriginalFundingUncertaintyAge(raw, spending.policy, observedDay, ageLimits);
  const result = F({ ...signer, signerInspectionVersion: 2,
    spendingOriginalStatus: row?.status ?? 'NOT_RECORDED', spendingOriginalReservedDay: row?.reservedDay ?? null,
    spendingOriginalAgeDays: !row || row.status === 'SPENT' ? null : observedDay - row.reservedDay, uncertaintyAge });
  if (Buffer.byteLength(canonicalJson(result)) > 131071) fail('OUTPUT');
  AGE_OUTPUTS.add(result); return result;
}
/** Fixed synchronous file-owner protocol. The native caller hardwires the real
 * context-required opener; DATA controls declare it. Never raw-close an
 * unreturned/malformed owner or retry an uncertain revoke/physical close. */
export function runApiCreditSignerInspectionOwner(configuration) {
  if (arguments.length !== 1) fail('LIMIT'); return run(configuration, false);
}
/** Version two borrows only the same owner's synchronous history reader.
 * It cannot reserve, sign, submit, release or normalize a stored original. */
export function runApiCreditSignerInspectionWithUncertaintyAgeOwner(configuration) {
  if (arguments.length !== 1) fail('LIMIT'); return run(configuration, true);
}
function run(configuration, withAge) {
  if (ACTIVE.size + FAILED.size >= 16) fail('LIMIT');
  const c = fields(configuration, ['fileConfiguration', 'expectedOriginal', 'ports', 'requireOpening',
    ...(withAge ? ['uncertaintyAgeLimits', 'readDay'] : [])]), p = fields(c.ports, ['openFile']);
  const expected = captureApiCreditSignerInspectionExpected(c.expectedOriginal);
  for (const fn of [p.openFile, c.requireOpening]) if (typeof fn !== 'function' || types.isProxy(fn) || !Object.isFrozen(fn)) fail('INPUT');
  const file = withAge ? captureOriginalFundingSpendingFileProfile(c.fileConfiguration) : c.fileConfiguration;
  const ageLimits = withAge ? captureOriginalFundingUncertaintyAgeLimits(c.uncertaintyAgeLimits) : null;
  if (withAge && (file.storageProfile.mode !== 'OPEN_EXISTING' || typeof c.readDay !== 'function' || types.isProxy(c.readDay) || !Object.isFrozen(c.readDay))) fail('INPUT');
  const frame = { owner: null, known: false, revoke: null, close: null, view: null, revoked: false, closed: false, revokeEntered: false, closeEntered: false,
    readUnknown: false, opaqueRead: null, stage: 'OPEN' };
  ACTIVE.add(frame); let bad = false, result = null;
  function view() { return Reflect.apply(frame.view, frame.owner, []); }
  function state(v, phase, databaseOpen) {
    return data(v, 'spendingFileOwnerVersion') === 1 && data(v, 'lifecycle') === phase && data(v, 'held') === false && data(v, 'busy') === false
      && data(v, 'backendClosed') === (phase !== 'OPEN') && data(v, 'databaseOpen') === databaseOpen
      && data(v, 'physicalCloseEntered') === (phase === 'CLOSED') && data(v, 'physicalCloseReturned') === (phase === 'CLOSED');
  }
  function readDay() {
    c.requireOpening(); const value = Reflect.apply(c.readDay, undefined, []); c.requireOpening();
    if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < 0 || value > 2147483647) fail('CLOCK');
    return value;
  }
  function readRaw(fn, receiver, args) {
    c.requireOpening(); let value;
    try { value = Reflect.apply(fn, receiver, args); } catch { frame.readUnknown = true; throw new TypeError('ORIGINAL_FUNDING_SIGNER_READ_UNKNOWN'); }
    if (value !== null && typeof value !== 'string') {
      frame.readUnknown = true; frame.opaqueRead = value; discardUnexpectedPromise(value); fail('READ_UNKNOWN');
    }
    c.requireOpening(); return value;
  }
  try {
    c.requireOpening(); const firstDay = withAge ? readDay() : null;
    const openConfiguration = withAge ? F({ storageProfile: file.storageProfile, allowedRoot: file.allowedRoot, filePolicy: file.filePolicy }) : file;
    frame.owner = p.openFile(openConfiguration); discardUnexpectedPromise(frame.owner);
    if (frame.owner === null || typeof frame.owner !== 'object' || types.isProxy(frame.owner) || types.isPromise(frame.owner) || SEEN.has(frame.owner)) fail('OWNER');
    frame.view = method(frame.owner, 'inspect'); frame.revoke = method(frame.owner, 'revoke'); frame.close = method(frame.owner, 'close');
    const custody = data(frame.owner, 'signerCustody'), read = method(custody, 'readSignerRecord'); if (data(custody, 'requirePreparationContext') !== true) fail('OWNER');
    let before = null, spending = null, load = null, backend = null, current = null;
    if (withAge) {
      current = method(frame.owner, 'assertCurrent'); backend = data(frame.owner, 'backend');
      // The actual file owner's frozen backend has ordinary, non-frozen
      // function values. Capture its own load value; never call its CAS.
      load = data(backend, 'load'); if (typeof load !== 'function' || types.isProxy(load)) fail('OWNER');
    }
    SEEN.add(frame.owner); frame.known = true; c.requireOpening(); if (!state(view(), 'OPEN', true)) fail('OWNER');
    function currentOwner() {
      c.requireOpening(); let value;
      try { value = Reflect.apply(current, frame.owner, []); } catch { frame.readUnknown = true; fail('OWNER'); }
      if (value !== undefined) { frame.readUnknown = true; frame.opaqueRead = value; discardUnexpectedPromise(value); fail('OWNER'); }
      c.requireOpening(); if (!state(view(), 'OPEN', true)) fail('OWNER');
    }
    function spendingRead() {
      currentOwner(); const value = readRaw(load, backend, [file.storageProfile.policy.accountId]); currentOwner(); return value;
    }
    if (withAge) {
      frame.stage = 'SPENDING_READ'; before = spendingRead();
      spending = inspectOriginalFundingSpendingState(before, file.storageProfile.policy);
      if (firstDay < spending.lastDay) fail('CLOCK_ROLLBACK');
    }
    frame.stage = 'READ'; const raw = withAge ? readRaw(read, custody, [expected.paymentId]) : Reflect.apply(read, custody, [expected.paymentId]);
    discardUnexpectedPromise(raw); c.requireOpening(); result = captureApiCreditSignerInspectionResult(raw, expected);
    c.requireOpening(); if (!state(view(), 'OPEN', true)) fail('OWNER');
    if (withAge) {
      frame.stage = 'SPENDING_RECHECK'; const after = spendingRead(); if (after !== before) fail('SPENDING_CHANGED');
      frame.stage = 'AGE'; const lastDay = readDay(); if (lastDay < firstDay) fail('CLOCK_ROLLBACK');
      result = ageResult(result, after, spending, expected, lastDay, ageLimits);
      c.requireOpening(); if (!state(view(), 'OPEN', true)) fail('OWNER');
    }
  } catch { bad = true; }
  finally {
    if (frame.known) {
      frame.revokeEntered = true;
      try { voidReceipt(Reflect.apply(frame.revoke, frame.owner, [])); frame.revoked = state(view(), 'REVOKED', true); } catch {}
      if (frame.revoked && !frame.readUnknown) {
        frame.closeEntered = true;
        try { voidReceipt(Reflect.apply(frame.close, frame.owner, [])); frame.closed = state(view(), 'CLOSED', false); } catch {}
      }
    }
    ACTIVE.delete(frame); if (bad || !frame.closed) FAILED.add(frame);
  }
  if (bad || result === null || !frame.closed) fail(frame.stage);
  try { c.requireOpening(); } catch { FAILED.add(frame); fail('AFTER_CLOSE'); } return result;
}
