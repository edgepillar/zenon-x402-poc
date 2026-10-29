import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { canonicalJson } from './canonical.js';
import { decodeB64Json, validateActiveUpfrontRequirement } from './x402-wire.js';
import { captureBuyerOriginalRecoverySelection } from './buyer-original-recovery-client.js';
import { snapshotOriginalServiceRequestCustodyPolicy, snapshotOriginalServiceRequestCustodyKey } from './service-credit-original-request-custody-contract.js';

const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn, PROFILES = new WeakMap();
function fail() { throw new TypeError('API_CREDIT_RECOVERY_PROFILE'); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) { const d = DESC(value, name); if (!d?.enumerable || !OWN(d, 'value')) fail(); out[name] = d.value; }
  return out;
}
function freezeJson(value, depth = 0, budget = { nodes: 4096 }) {
  if (--budget.nodes < 0 || depth > 16) fail();
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number') { if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail(); return; }
  if (typeof value !== 'object') fail();
  for (const v of Object.values(value)) freezeJson(v, depth + 1, budget); F(value);
}
function path(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > 4096 || value.length < 2 || /[\x00-\x1f\x7f]/.test(value)
      || Buffer.from(value).toString('utf8') !== value || !isAbsolute(value) || resolve(value) !== value) fail(); return value;
}
function inside(root, value) { const r = relative(root, value); return r !== '' && r !== '..' && !r.startsWith('../') && !isAbsolute(r); }
function integer(n, minimum, maximum) { if (!Number.isSafeInteger(n) || Object.is(n, -0) || n < minimum || n > maximum) fail(); return n; }
/** One original, its independently retained exact funding bytes/pins, and the
 * existing service proof. No wallet key, module, callback, new grant or store.
 * Captured secret strings are not persisted/echoed; erasure is not promised. */
export function decodeApiCreditRecoveryInspectionProfile(text) {
  if (arguments.length !== 1 || typeof text !== 'string' || Buffer.byteLength(text) > 65536 || Buffer.from(text).toString('utf8') !== text) fail();
  let raw; try { raw = JSON.parse(text); freezeJson(raw); } catch { fail(); }
  if (canonicalJson(raw) !== text) fail();
  const c = fields(raw, ['recoveryInspectionVersion', 'selection', 'payerOptions', 'backendOptions', 'requestKey', 'authorizationHeader']);
  if (c.recoveryInspectionVersion !== 1) fail();
  const selection = captureBuyerOriginalRecoverySelection(c.selection);
  const challenge = decodeB64Json(selection.paymentRequiredHeader, { maxEncodedBytes: 5464, maxDecodedBytes: 4096 });
  if (challenge.accepts.length !== 1) fail(); validateActiveUpfrontRequirement(challenge.accepts[0]);
  const payer = fields(c.payerOptions, ['databasePath', 'allowedRoot', 'fundingResourceUrl', 'custodyPolicy', 'selectedGrantId', 'deadlineMs']);
  const root = path(payer.allowedRoot), payerPath = path(payer.databasePath), backend = fields(c.backendOptions, ['databasePath', 'limits']);
  const backendPath = path(backend.databasePath);
  if (!inside(root, payerPath) || !inside(root, backendPath) || dirname(payerPath) !== root || dirname(backendPath) !== root
      || ['', '-wal', '-shm', '-journal'].some(s => payerPath === backendPath + s || backendPath === payerPath + s)
      || payer.fundingResourceUrl !== selection.originalPayment.resourceUrl || payer.selectedGrantId !== selection.selectedGrantId) fail();
  const policy = snapshotOriginalServiceRequestCustodyPolicy(payer.custodyPolicy, payer.fundingResourceUrl);
  const key = snapshotOriginalServiceRequestCustodyKey(c.requestKey); if (key.grantId !== selection.selectedGrantId) fail();
  integer(payer.deadlineMs, 1, 60000);
  const limits = fields(backend.limits, ['busyTimeoutMs', 'maxStateBytes', 'maxOffers', 'maxGrants', 'maxRequests']);
  integer(limits.busyTimeoutMs, 1, 5000); integer(limits.maxStateBytes, 512, 1048576);
  for (const n of ['maxOffers', 'maxGrants', 'maxRequests']) integer(limits[n], 1, 1024);
  const proof = c.authorizationHeader;
  if (typeof proof !== 'string' || !proof.startsWith('ServiceCredit ') || proof.length <= 14 || Buffer.byteLength(proof) > 1024
      || Buffer.from(proof).toString('utf8') !== proof || /[\r\n\0]/.test(proof)) fail();
  const manifest = F({ inspectionVersion: 1, payerDatabasePath: payerPath, backendDatabasePath: backendPath, allowedRoot: root,
    fundingResourceUrl: payer.fundingResourceUrl, custodyPolicy: policy, selectedGrantId: selection.selectedGrantId,
    deadlineMs: payer.deadlineMs, requestKey: key, expectedCheckpointPins: selection.originalPayment.expectedPins, backendLimits: F(limits) });
  const state = { manifest, selection, authorizationHeader: proof, consumed: false, released: false };
  const release = F(function release() { if (arguments.length !== 0) fail(); if (state.released) return;
    state.released = true; state.manifest = null; state.selection = null; state.authorizationHeader = null; });
  const out = F({ recoveryInspectionVersion: 1, requestKey: key, release }); PROFILES.set(out, state); return out;
}
export function consumeApiCreditRecoveryInspectionProfile(profile) {
  if (arguments.length !== 1 || profile === null || typeof profile !== 'object' || types.isProxy(profile)) fail();
  const state = PROFILES.get(profile); if (!state || state.consumed || state.released) fail(); state.consumed = true;
  return F({ manifest: state.manifest, authorizationHeader: state.authorizationHeader,
    serializedCheckpoint: state.selection.originalPayment.serializedCheckpoint });
}
export function releaseApiCreditRecoveryInspectionProfile(profile) {
  if (arguments.length !== 1 || profile === null || typeof profile !== 'object' || types.isProxy(profile) || !PROFILES.has(profile)) fail();
  profile.release();
}
