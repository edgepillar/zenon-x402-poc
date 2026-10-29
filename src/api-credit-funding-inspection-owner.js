import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { encodeOriginalPaymentCheckpoint } from './service-credit-pilot-original-payment-checkpoint.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn, USED = new WeakSet(), HELD = new Set();
const THEN = Promise.prototype.then;
const STATUSES = F(['PREPARED', 'ATTEMPT_FENCED', 'OUTCOME_UNKNOWN', 'BOUND', 'PAYMENT_REJECTED', 'PAYMENT_CONFLICT']);
const RESULT = ['apiCreditFundingInspectionVersion', 'fundingResourceUrl', 'paymentHash', 'recordPresent', 'localStatus', 'revision',
  'ambiguityLatched', 'originalCheckpointMatched', 'serializedCheckpoint', 'historicalObservation', 'reconciliationRequired',
  'mayStartPayment', 'maySignPayment', 'maySubmitFunding', 'mayDispatchService', 'mayActivateGrant', 'fundingAcknowledgement',
  'providerFundingStatus', 'grantActivation', 'serviceDelivery', 'spendingReservation', 'storeCloseObserved', 'nativeResourceRelease', 'authority'];
function fail() { throw new TypeError('API_CREDIT_FUNDING_INSPECTION_UNKNOWN'); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || !Object.isFrozen(value) || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {}; for (const name of names) { const d = D(value, name); if (!d?.enumerable || !OWN(d, 'value')) fail(); out[name] = d.value; } return out;
}
function data(value, name) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || !Object.isFrozen(value) || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const d = D(value, name); if (!d?.enumerable || !OWN(d, 'value')) fail(); return d.value;
}
function state(raw, profile) {
  if (raw === null) return null;
  const c = fields(raw, ['revision', 'status', 'ambiguityLatched', 'resourceUrl', 'challengeHeader', 'paymentHeader', 'paymentRequired', 'paymentPayload', 'requirement']);
  if (!Number.isSafeInteger(c.revision) || c.revision < 1 || !STATUSES.includes(c.status) || typeof c.ambiguityLatched !== 'boolean'
      || c.status === 'OUTCOME_UNKNOWN' && !c.ambiguityLatched || ['PREPARED', 'PAYMENT_REJECTED', 'PAYMENT_CONFLICT'].includes(c.status) && c.ambiguityLatched
      || c.resourceUrl !== profile.fundingResourceUrl || c.challengeHeader !== profile.challengeHeader || c.paymentHeader !== profile.paymentHeader) fail();
  return F({ revision: c.revision, status: c.status, ambiguityLatched: c.ambiguityLatched });
}
function view(raw, closed) {
  return data(raw, 'payerFundingInspectionLifecycleVersion') === 1 && data(raw, 'active') === false && data(raw, 'quarantined') === false
    && data(raw, 'closed') === closed && data(raw, 'databaseOpen') === !closed;
}
function checkpoint(raw) {
  const c = fields(raw, ['version', 'authorization', 'binding', 'originalBytes', 'digests']);
  const binding = fields(c.binding, ['requestId', 'paymentHash', 'origin', 'contextId']);
  const originalBytes = fields(c.originalBytes, ['requestBody', 'paymentPayload', 'paymentRequirements', 'context']);
  const digests = fields(c.digests, ['requestBody', 'paymentPayload', 'paymentRequirements', 'context']);
  for (const value of [...Object.values(binding), ...Object.values(originalBytes), ...Object.values(digests)]) if (typeof value !== 'string') fail();
  return encodeOriginalPaymentCheckpoint(F({ version: c.version, authorization: c.authorization, binding: F(binding), originalBytes: F(originalBytes), digests: F(digests) }));
}
function discard(value) {
  if (types.isProxy(value) || !types.isPromise(value) || Object.getPrototypeOf(value) !== Promise.prototype
      || Reflect.ownKeys(value).some(key => key !== 'constructor') || Promise.prototype.then !== THEN) return;
  const ctor = D(value, 'constructor'); if (ctor && (!OWN(ctor, 'value') || ctor.value !== Promise)) return;
  try { const bridge = Reflect.apply(THEN, value, [() => {}, () => {}]); Reflect.apply(THEN, bridge, [() => {}, () => {}]); } catch {}
}
/** Synchronous existing-V6 owner: four bounded reads, same external pins and
 * exact original bytes before/after. No restart normalization, writer, SDK,
 * grant/proof query or transport exists in its fixed native ports. */
export function runApiCreditFundingInspectionOwner(configuration) {
  if (arguments.length !== 1 || HELD.size >= 16) fail();
  const c = fields(configuration, ['profile', 'ports', 'requireOpening']), profile = fields(c.profile,
    ['databasePath', 'allowedRoot', 'custodyPolicy', 'fundingResourceUrl', 'serializedCheckpoint', 'expectedPins', 'paymentHash', 'challengeHeader', 'paymentHeader']);
  const p = fields(c.ports, ['openExisting', 'readState', 'readCheckpoint', 'inspectStore', 'closeStore']);
  for (const fn of [...Object.values(p), c.requireOpening]) if (typeof fn !== 'function' || types.isProxy(fn) || !Object.isFrozen(fn)) fail();
  if (USED.has(c.profile)) fail(); USED.add(c.profile);
  const frame = { profile: c.profile, store: null, openEntered: false, closeEntered: false, closeReturned: false, closed: false, unknown: false, opaqueOpen: null, opaqueClose: null, opaqueRead: null };
  let result = null, failed = false;
  const guard = () => c.requireOpening();
  function read(invoke) {
    guard(); const value = invoke();
    if (types.isProxy(value) || types.isPromise(value)) { frame.opaqueRead = value; frame.unknown = true; discard(value); fail(); }
    guard(); return value;
  }
  try {
    guard(); frame.openEntered = true; frame.opaqueOpen = p.openExisting(c.profile);
    if (frame.opaqueOpen === null || typeof frame.opaqueOpen !== 'object' || types.isProxy(frame.opaqueOpen) || types.isPromise(frame.opaqueOpen)) { discard(frame.opaqueOpen); fail(); }
    frame.store = frame.opaqueOpen; guard(); if (!view(p.inspectStore(frame.store), false)) fail();
    const firstCheckpoint = read(() => p.readCheckpoint(frame.store, profile.expectedPins));
    const before = state(read(() => p.readState(frame.store)), profile);
    const after = state(read(() => p.readState(frame.store)), profile);
    const lastCheckpoint = read(() => p.readCheckpoint(frame.store, profile.expectedPins));
    if (canonicalJson(before) !== canonicalJson(after)) fail();
    if (before === null ? firstCheckpoint !== null || lastCheckpoint !== null
      : checkpoint(firstCheckpoint) !== profile.serializedCheckpoint || checkpoint(lastCheckpoint) !== profile.serializedCheckpoint) fail();
    result = F({ apiCreditFundingInspectionVersion: 1, fundingResourceUrl: profile.fundingResourceUrl, paymentHash: profile.paymentHash,
      recordPresent: before !== null, localStatus: before?.status ?? 'ABSENT', revision: before?.revision ?? null,
      ambiguityLatched: before?.ambiguityLatched ?? false, originalCheckpointMatched: before !== null,
      serializedCheckpoint: before === null ? null : profile.serializedCheckpoint,
      historicalObservation: true, reconciliationRequired: true, mayStartPayment: false, maySignPayment: false, maySubmitFunding: false,
      mayDispatchService: false, mayActivateGrant: false, fundingAcknowledgement: 'NOT_ESTABLISHED', providerFundingStatus: 'NOT_QUERIED',
      grantActivation: 'NOT_ESTABLISHED', serviceDelivery: 'NOT_ESTABLISHED', spendingReservation: 'UNCHANGED', storeCloseObserved: true,
      nativeResourceRelease: 'NOT_ESTABLISHED', authority: 'NONE' });
    guard();
  } catch { failed = true; }
  finally {
    if (frame.store !== null && !frame.unknown) {
      try {
        // Never compete with an observed still-active store. Cleanup itself
        // is not cancelled by the expired outer observation window.
        if (data(p.inspectStore(frame.store), 'active') !== false) fail();
        frame.closeEntered = true; frame.opaqueClose = p.closeStore(frame.store); frame.closeReturned = frame.opaqueClose === undefined;
        if (!frame.closeReturned) { discard(frame.opaqueClose); fail(); }
        if (!view(p.inspectStore(frame.store), true)) fail(); frame.closed = true;
      } catch { frame.unknown = true; }
    } else if (frame.openEntered) frame.unknown = true;
    if (frame.unknown) HELD.add(frame);
  }
  if (failed || !frame.closed || result === null) fail();
  return captureApiCreditFundingInspectionOutput(result);
}
/** Only bounded historical DATA. Even BOUND does not authorize a retry, grant,
 * delivery claim or a change to the separate spending reservation. */
export function captureApiCreditFundingInspectionOutput(input) {
  if (arguments.length !== 1) fail(); const c = fields(input, RESULT);
  if (c.apiCreditFundingInspectionVersion !== 1 || typeof c.fundingResourceUrl !== 'string' || Buffer.byteLength(c.fundingResourceUrl) > 4096
      || typeof c.paymentHash !== 'string' || !/^[0-9a-fA-F]{64}$/.test(c.paymentHash) || typeof c.recordPresent !== 'boolean'
      || typeof c.ambiguityLatched !== 'boolean' || c.originalCheckpointMatched !== c.recordPresent
      || c.recordPresent && (c.localStatus === 'OUTCOME_UNKNOWN' && !c.ambiguityLatched
        || ['PREPARED', 'PAYMENT_REJECTED', 'PAYMENT_CONFLICT'].includes(c.localStatus) && c.ambiguityLatched)
      || (c.recordPresent ? !STATUSES.includes(c.localStatus) || !Number.isSafeInteger(c.revision) || c.revision < 1
        || typeof c.serializedCheckpoint !== 'string' || Buffer.byteLength(c.serializedCheckpoint) > 32768
        : c.localStatus !== 'ABSENT' || c.revision !== null || c.serializedCheckpoint !== null || c.ambiguityLatched)) fail();
  for (const name of ['historicalObservation', 'reconciliationRequired', 'storeCloseObserved']) if (c[name] !== true) fail();
  for (const name of ['mayStartPayment', 'maySignPayment', 'maySubmitFunding', 'mayDispatchService', 'mayActivateGrant']) if (c[name] !== false) fail();
  for (const name of ['fundingAcknowledgement', 'grantActivation', 'serviceDelivery', 'nativeResourceRelease']) if (c[name] !== 'NOT_ESTABLISHED') fail();
  if (c.providerFundingStatus !== 'NOT_QUERIED' || c.spendingReservation !== 'UNCHANGED' || c.authority !== 'NONE') fail();
  const out = F(c); if (Buffer.byteLength(canonicalJson(out)) + 1 > 65536) fail(); return out;
}
