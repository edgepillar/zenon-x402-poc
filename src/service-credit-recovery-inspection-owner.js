import { readServiceCreditExactOriginalBackendRecoveryState } from './service-credit-custodied-backend-recovery-core.js';
import { captureApiCreditRecordedResultInspection } from './api-credit-recorded-result-inspection.js';
import { types } from 'node:util';
import { encodeOriginalPaymentCheckpoint } from './service-credit-pilot-original-payment-checkpoint.js';

const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn, NATIVE_PROMISE = Promise;
const KEYS = Reflect.ownKeys, APPLY = Reflect.apply;
const PP = NATIVE_PROMISE.prototype, THEN = DESC(PP, 'then');
const CONSTRUCTOR = DESC(PP, 'constructor'), SPECIES = DESC(NATIVE_PROMISE, Symbol.species);
const ACTIVE = new Set(), HELD = new Set(), BACKENDS = new WeakSet(), PAYERS = new WeakSet();
function fail(stage) { const e = new TypeError('SERVICE_CREDIT_RECOVERY_INSPECTION_FAILED'); Object.defineProperty(e, 'stage', { value: stage, enumerable: true }); Object.defineProperty(e, 'stack', { value: e.message }); throw F(e); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail('INPUT');
  const out = {};
  for (const name of names) { const d = DESC(value, name); if (!d?.enumerable || !OWN(d, 'value')) fail('INPUT'); out[name] = d.value; }
  return out;
}
function data(value, name) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || !Object.isFrozen(value)) fail('OBSERVATION');
  const d = DESC(value, name); if (!d?.enumerable || !OWN(d, 'value')) fail('OBSERVATION'); return d.value;
}
function method(owner, name) { const fn = data(owner, name); if (typeof fn !== 'function' || types.isProxy(fn) || !Object.isFrozen(fn)) fail('OBSERVATION'); return fn; }
function sameDescriptor(actual, expected) {
  if (actual === undefined || expected === undefined) return false;
  const keys = KEYS(expected);
  if (KEYS(actual).length !== keys.length) return false;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]; if (!OWN(actual, key) || actual[key] !== expected[key]) return false;
  }
  return true;
}
function observe(p, yes, no) {
  if (!sameDescriptor(DESC(PP, 'then'), THEN) || !sameDescriptor(DESC(PP, 'constructor'), CONSTRUCTOR)
      || !sameDescriptor(DESC(NATIVE_PROMISE, Symbol.species), SPECIES)
      || DESC(Object.prototype, 'then') !== undefined || !types.isPromise(p) || types.isProxy(p)
      || Object.getPrototypeOf(p) !== PP) fail('PROMISE');
  const keys = KEYS(p);
  for (let i = 0; i < keys.length; i++) if (keys[i] !== 'constructor') fail('PROMISE');
  const d = DESC(p, 'constructor'); if (d && (!OWN(d, 'value') || d.value !== NATIVE_PROMISE)) fail('PROMISE');
  const bridge = APPLY(THEN.value, p, [yes, no]); APPLY(THEN.value, bridge, [() => {}, () => {}]);
}
function signal() {
  let resolve, reject;
  const promise = new NATIVE_PROMISE((a, b) => { resolve = a; reject = b; });
  Object.defineProperty(promise, 'constructor', { value: NATIVE_PROMISE });
  observe(promise, () => {}, () => {});
  return { promise, resolve, reject };
}
function closedPayer(payer) {
  const view = Reflect.apply(method(payer, 'snapshot'), payer, []), owned = data(view, 'client');
  const resource = data(owned, 'resource'), close = data(owned, 'close');
  return data(view, 'closed') === true && data(view, 'reading') === false && typeof data(view, 'unavailable') === 'boolean'
    && data(view, 'storeOwnership') === 'PAYER_OWNED_BACKEND_BORROWED'
    && data(resource, 'phase') === 'RELEASED' && data(resource, 'slotHeld') === false && data(resource, 'admissionClosed') === true
    && data(resource, 'storeCloseAttempts') === 1 && data(resource, 'storeCloseOutcome') === 'RETURNED'
    && data(close, 'requested') === true && data(close, 'outcome') === 'DRAINED'
    && data(close, 'childUncertainty') === false && data(close, 'unknownUndrained') === false;
}
/** Redact the actual no-dispatch connection's observation. A cached assertion
 * is history only; proof strings, original bodies and signed bytes never exit. */
export function captureServiceCreditRecoveryInspectionResult(observed) {
  for (const name of ['mayDispatchService', 'mayStartPayment', 'maySignPayment', 'deliveryConfirmed']) if (data(observed, name) !== false) fail('REDACTED_RESULT');
  if (data(observed, 'authority') !== 'NONE' || data(observed, 'serviceDelivery') !== 'NOT_ESTABLISHED') fail('REDACTED_RESULT');
  const status = data(observed, 'status'), backend = data(observed, 'backend'), backendStatus = backend === null ? null : data(backend, 'status');
  if (typeof status !== 'string' || !/^[A-Z_]{1,64}$/.test(status) || backendStatus !== null && (typeof backendStatus !== 'string' || !/^[A-Z_]{1,64}$/.test(backendStatus))) fail('REDACTED_RESULT');
  return F({ inspectionVersion: 1, status, backendStatus, originalCheckpointPinsMatched: true,
    localReconciliationRequired: status === 'CLIENT_RECONCILIATION_REQUIRED', authority: 'NONE', mayDispatchService: false,
    mayStartPayment: false, maySignPayment: false, deliveryConfirmed: false, serviceDelivery: 'NOT_ESTABLISHED',
    currentAuthority: 'NOT_ESTABLISHED', sameProcessObservationOnly: true });
}
/** Closed output grammar: no extra proof, body, checkpoint or result payload. */
export function captureServiceCreditRecoveryInspectionOutput(value) {
  if (arguments.length !== 1) fail('REDACTED_RESULT');
  const c = fields(value, ['inspectionVersion', 'status', 'backendStatus', 'originalCheckpointPinsMatched', 'localReconciliationRequired',
    'authority', 'mayDispatchService', 'mayStartPayment', 'maySignPayment', 'deliveryConfirmed', 'serviceDelivery', 'currentAuthority', 'sameProcessObservationOnly']);
  if (c.inspectionVersion !== 1 || c.originalCheckpointPinsMatched !== true || c.authority !== 'NONE' || c.currentAuthority !== 'NOT_ESTABLISHED'
      || c.serviceDelivery !== 'NOT_ESTABLISHED' || c.sameProcessObservationOnly !== true
      || typeof c.status !== 'string' || !/^[A-Z_]{1,64}$/.test(c.status)
      || c.backendStatus !== null && (typeof c.backendStatus !== 'string' || !/^[A-Z_]{1,64}$/.test(c.backendStatus))
      || c.localReconciliationRequired !== (c.status === 'CLIENT_RECONCILIATION_REQUIRED')) fail('REDACTED_RESULT');
  for (const k of ['mayDispatchService', 'mayStartPayment', 'maySignPayment', 'deliveryConfirmed']) if (c[k] !== false) fail('REDACTED_RESULT');
  return F(c);
}
/** Fixed native ports own the real existing stores. DATA controls declare
 * them. An unreturned/unknown payer may already hold a borrowed backend reader:
 * only a returned payer's void stop AND fresh RELEASED view permit backend stop.
 * No retry, competing raw close, snapshot-based repair or external dispatch. */
export async function runServiceCreditRecoveryInspectionOwner(configuration) {
  if (arguments.length !== 1) fail('INPUT'); return runInspection(configuration, false);
}
export async function runServiceCreditRecordedResultInspectionOwner(configuration) {
  if (arguments.length !== 1) fail('INPUT'); return runInspection(configuration, true);
}
async function runInspection(configuration, recorded) {
  if (ACTIVE.size + HELD.size >= 16) fail('INPUT');
  const c = fields(configuration, ['manifest', 'authorizationHeader', 'serializedCheckpoint', 'ports', 'requireOpening']);
  const p = fields(c.ports, ['openBackend', 'openPayer', 'closeBackend']);
  for (const fn of [...Object.values(p), c.requireOpening]) if (typeof fn !== 'function' || types.isProxy(fn) || !Object.isFrozen(fn)) fail('INPUT');
  if (typeof c.authorizationHeader !== 'string' || !c.authorizationHeader.startsWith('ServiceCredit ') || c.authorizationHeader.length > 1024
      || /[\r\n\0]/.test(c.authorizationHeader) || c.serializedCheckpoint !== null && typeof c.serializedCheckpoint !== 'string') fail('INPUT');
  if (recorded && (typeof c.serializedCheckpoint !== 'string' || c.serializedCheckpoint.length === 0 || c.serializedCheckpoint.length > 32768)) fail('INPUT');
  const frame = { backend: null, backendEntered: false, backendKnown: false, payer: null, payerKnown: false, payerEntered: false,
    payerStopEntered: false, payerStop: null, backendStopEntered: false, backendStopReturned: false,
    openingUnknown: false, openingReceipt: null, stage: 'INPUT' };
  ACTIVE.add(frame); let result = null, bad = false, reason = 'INPUT';
  function requireOpening() {
    const receipt = c.requireOpening();
    if (receipt === undefined) return;
    // A returned receipt can still borrow the profile or an acquired owner.
    // Retain it without starting another read or competing with its cleanup.
    frame.openingReceipt = receipt;
    frame.openingUnknown = true;
    try { observe(receipt, () => {}, () => {}); } catch {}
    fail(frame.stage);
  }
  try {
    requireOpening(); frame.stage = 'BACKEND_OPEN'; frame.backendEntered = true;
    frame.backend = p.openBackend(c.manifest);
    if (frame.backend === null || typeof frame.backend !== 'object' || types.isProxy(frame.backend) || types.isPromise(frame.backend) || BACKENDS.has(frame.backend)) fail(frame.stage);
    BACKENDS.add(frame.backend); frame.backendKnown = true;
    requireOpening(); frame.stage = 'PAYER_OPEN'; frame.payerEntered = true;
    const ready = signal();
    observe(p.openPayer(c.manifest, frame.backend), owner => { frame.payer = owner; ready.resolve(undefined); }, ready.reject); await ready.promise;
    if (frame.payer === null || typeof frame.payer !== 'object' || types.isProxy(frame.payer) || PAYERS.has(frame.payer)) fail(frame.stage);
    method(frame.payer, 'close'); method(frame.payer, 'snapshot'); method(frame.payer, 'readOriginalBackendRecoveryState');
    PAYERS.add(frame.payer); frame.payerKnown = true; requireOpening();
    const checkpoint = () => {
      if (c.serializedCheckpoint === null) return;
      const current = Reflect.apply(method(frame.payer, 'readOriginalPaymentCheckpoint'), frame.payer, [c.manifest.expectedCheckpointPins]);
      if (encodeOriginalPaymentCheckpoint(current) !== c.serializedCheckpoint) fail('CHECKPOINT');
    };
    requireOpening(); if (!recorded) checkpoint(); frame.stage = 'ORIGINAL_READ';
    const observed = recorded
      ? readServiceCreditExactOriginalBackendRecoveryState(frame.payer, c.manifest.requestKey, c.authorizationHeader, c.manifest.expectedCheckpointPins, c.serializedCheckpoint)
      : Reflect.apply(method(frame.payer, 'readOriginalBackendRecoveryState'), frame.payer,
        [c.manifest.requestKey, c.authorizationHeader, c.manifest.expectedCheckpointPins]);
    requireOpening(); if (!recorded) checkpoint(); frame.stage = recorded ? 'RECORDED_RESULT' : 'REDACTED_RESULT';
    result = recorded ? captureApiCreditRecordedResultInspection(observed, c.manifest) : captureServiceCreditRecoveryInspectionResult(observed);
  } catch { bad = true; reason = frame.stage; }
  finally {
    let payerClean = !frame.payerEntered && !frame.openingUnknown;
    if (frame.payerKnown && !frame.openingUnknown) {
      frame.payerStopEntered = true;
      try {
        frame.payerStop = Reflect.apply(method(frame.payer, 'close'), frame.payer, []);
        const stopped = signal(); observe(frame.payerStop, value => { if (value === undefined) stopped.resolve(undefined); else stopped.reject(Error('nonvoid stop')); }, stopped.reject);
        await stopped.promise; payerClean = closedPayer(frame.payer);
      } catch { payerClean = false; }
      if (!payerClean) { bad = true; reason = 'PAYER_CLOSE'; }
    }
    if (frame.backendKnown && payerClean) {
      frame.backendStopEntered = true;
      try { const value = p.closeBackend(frame.backend); if (value !== undefined) { try { observe(value, () => {}, () => {}); } catch {} fail('BACKEND_CLOSE'); }
        frame.backendStopReturned = true;
      } catch { bad = true; reason = 'BACKEND_CLOSE'; }
    } else if (frame.backendKnown && !frame.openingUnknown) { bad = true; reason = 'PAYER_CLOSE'; }
    if (!bad && result !== null && frame.backendStopReturned) {
      frame.stage = 'AFTER_CLOSE';
      try { requireOpening(); } catch { bad = true; reason = frame.stage; }
    }
    ACTIVE.delete(frame);
    if (frame.openingUnknown || (frame.backendEntered && !frame.backendStopReturned)) HELD.add(frame);
  }
  if (bad || result === null || !frame.backendStopReturned) fail(reason);
  return result;
}
