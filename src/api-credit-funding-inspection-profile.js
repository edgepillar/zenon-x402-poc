import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { canonicalJson } from './canonical.js';
import { createFundingPostOriginalPaymentCheckpointClient } from './x402-original-payment-checkpoint-client.js';
import { restoreOriginalPaymentCheckpoint } from './service-credit-pilot-original-payment-checkpoint.js';
import { snapshotOriginalServiceRequestCustodyPolicy } from './service-credit-original-request-custody-contract.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn, PROFILES = new WeakMap();
function fail() { throw new TypeError('API_CREDIT_FUNDING_INSPECTION_PROFILE'); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {}; for (const name of names) { const d = D(value, name); if (!d?.enumerable || !OWN(d, 'value')) fail(); out[name] = d.value; } return out;
}
function freezeJson(value, depth = 0, budget = { nodes: 4096 }) {
  if (--budget.nodes < 0 || depth > 16) fail();
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail(); return; }
  if (typeof value !== 'object') fail(); for (const member of Object.values(value)) freezeJson(member, depth + 1, budget); F(value);
}
function path(value) {
  if (typeof value !== 'string' || value.length < 2 || Buffer.byteLength(value) > 4096 || /[\x00-\x1f\x7f]/.test(value)
      || Buffer.from(value).toString('utf8') !== value || !isAbsolute(value) || resolve(value) !== value) fail(); return value;
}
/** One existing funding original, before any grant/proof is known. Independent
 * bytes/pins are mandatory. No key, service request, backend or new payment. */
export function decodeApiCreditFundingInspectionProfile(text) {
  if (arguments.length !== 1 || typeof text !== 'string' || Buffer.byteLength(text) > 65536 || Buffer.from(text).toString('utf8') !== text) fail();
  let raw; try { raw = JSON.parse(text); freezeJson(raw); } catch { fail(); }
  if (canonicalJson(raw) !== text) fail();
  const c = fields(raw, ['fundingInspectionVersion', 'originalPayment', 'payerOptions']); if (c.fundingInspectionVersion !== 1) fail();
  const original = fields(c.originalPayment, ['resourceUrl', 'serializedCheckpoint', 'expectedPins']);
  const pins = fields(original.expectedPins, ['binding', 'digests']);
  const binding = F(fields(pins.binding, ['requestId', 'paymentHash', 'origin', 'contextId']));
  const digests = F(fields(pins.digests, ['requestBody', 'paymentPayload', 'paymentRequirements', 'context']));
  for (const value of [...Object.values(binding), ...Object.values(digests)]) if (typeof value !== 'string') fail();
  const independent = F({ binding, digests }), checkpoint = restoreOriginalPaymentCheckpoint(original.serializedCheckpoint, independent);
  let core;
  try {
    core = createFundingPostOriginalPaymentCheckpointClient({ ...original, expectedPins: independent,
      readOriginalPaymentCheckpoint: F(function noPreflightReader() { fail(); }) });
    core.selection();
  } finally { if (core !== undefined) core.close(); }
  const p = fields(c.payerOptions, ['databasePath', 'allowedRoot', 'custodyPolicy']);
  const root = path(p.allowedRoot), databasePath = path(p.databasePath), inside = relative(root, databasePath);
  if (dirname(databasePath) !== root || inside === '' || inside === '..' || inside.startsWith('../') || isAbsolute(inside)) fail();
  const custodyPolicy = snapshotOriginalServiceRequestCustodyPolicy(p.custodyPolicy, original.resourceUrl);
  const captured = F({ databasePath, allowedRoot: root, custodyPolicy, fundingResourceUrl: original.resourceUrl,
    serializedCheckpoint: original.serializedCheckpoint, expectedPins: independent, paymentHash: checkpoint.binding.paymentHash,
    challengeHeader: checkpoint.originalBytes.paymentRequirements, paymentHeader: checkpoint.originalBytes.paymentPayload });
  const state = { captured, used: false, released: false };
  const release = F(function release() { if (arguments.length !== 0) fail(); state.released = true; state.captured = null; });
  const checkpointDigest = createHash('sha256').update(captured.serializedCheckpoint).digest('hex');
  const out = F({ fundingInspectionVersion: 1, fundingResourceUrl: captured.fundingResourceUrl, paymentHash: captured.paymentHash, checkpointDigest, release });
  PROFILES.set(out, state); return out;
}
export function consumeApiCreditFundingInspectionProfile(profile) {
  if (arguments.length !== 1 || profile === null || typeof profile !== 'object' || types.isProxy(profile)) fail();
  const state = PROFILES.get(profile); if (!state || state.used || state.released) fail(); state.used = true; return state.captured;
}
export function releaseApiCreditFundingInspectionProfile(profile) {
  if (arguments.length !== 1 || profile === null || typeof profile !== 'object' || types.isProxy(profile) || !PROFILES.has(profile)) fail();
  profile.release();
}
