import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { captureOriginalFundingSpendingFileProfile } from './original-funding-spending-file-profile.js';
import { captureFundingPostCheckpointRoute } from './x402-funding-post-checkpoint-route.js';
import { captureOriginalFundingUncertaintyAgeLimits } from './original-funding-uncertainty-age.js';

const F = Object.freeze, PROFILES = new WeakMap(), CAPTURED = new WeakMap();
function fail() { throw new TypeError('API_CREDIT_SIGNER_INSPECTION_PROFILE'); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) { const d = Object.getOwnPropertyDescriptor(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); out[name] = d.value; }
  return out;
}
function freezeJson(value, depth = 0, budget = { nodes: 1024 }) {
  if (--budget.nodes < 0 || depth > 16) fail();
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail(); return; }
  if (typeof value !== 'object') fail(); for (const child of Object.values(value)) freezeJson(child, depth + 1, budget); F(value);
}
export function captureApiCreditSignerInspectionExpected(input) {
  if (arguments.length !== 1) fail(); const c = fields(input, ['paymentId', 'originalDigest', 'fundingResourceUrl']);
  if (typeof c.paymentId !== 'string' || /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.exec(c.paymentId)?.[0] !== c.paymentId
      || typeof c.originalDigest !== 'string' || /^sha256:[0-9a-f]{64}$/.exec(c.originalDigest)?.[0] !== c.originalDigest) fail();
  captureFundingPostCheckpointRoute(c.fundingResourceUrl); return F(c);
}
/** Closed keyless operator input. No SDK/key/module/transport, owner discovery,
 * creation or migration. An independent existing-store token is mandatory. */
export function decodeApiCreditSignerInspectionProfile(text) {
  if (arguments.length !== 1 || typeof text !== 'string' || Buffer.byteLength(text) > 16384 || Buffer.from(text).toString('utf8') !== text) fail();
  let decoded; try { decoded = JSON.parse(text); freezeJson(decoded); } catch { fail(); }
  if (canonicalJson(decoded) !== text) fail();
  const version = Object.getOwnPropertyDescriptor(decoded, 'signerInspectionVersion')?.value;
  if (version !== 1 && version !== 2 && version !== 3) fail();
  const c = fields(decoded, ['signerInspectionVersion', 'spendingFile', 'expectedOriginal',
    ...(version >= 2 ? ['uncertaintyAgeLimits'] : []), ...(version === 3 ? ['spendingStoreProfile'] : [])]);
  if (version === 3 && c.spendingStoreProfile !== 'GRANT_RECOVERY_V1') fail();
  const file = captureOriginalFundingSpendingFileProfile(c.spendingFile), expected = captureApiCreditSignerInspectionExpected(c.expectedOriginal);
  if (file.storageProfile.mode !== 'OPEN_EXISTING' || file.storageProfile.policy.recipients.length !== 1) fail();
  const ageLimits = version >= 2 ? captureOriginalFundingUncertaintyAgeLimits(c.uncertaintyAgeLimits) : null;
  const state = { file, expected, ageLimits, spendingStoreProfile: version === 3 ? 'GRANT_RECOVERY_V1' : 'SIGNER_CONTEXT_V1', consumed: false, released: false };
  const release = F(function release() { if (arguments.length !== 0) fail(); if (state.released) return;
    state.released = true; state.file = null; state.expected = null; state.ageLimits = null; });
  const profile = F({ signerInspectionVersion: version, paymentId: expected.paymentId, originalDigest: expected.originalDigest,
    fundingResourceUrl: expected.fundingResourceUrl,
    ...(version >= 2 ? { uncertaintyAgeLimits: ageLimits, spendingPolicyId: file.storageProfile.policy.policyId } : {}),
    ...(version === 3 ? { spendingStoreProfile: state.spendingStoreProfile } : {}),
    release }); PROFILES.set(profile, state); return profile;
}
export function consumeApiCreditSignerInspectionProfile(profile) {
  if (arguments.length !== 1 || profile === null || typeof profile !== 'object' || types.isProxy(profile)) fail();
  const state = PROFILES.get(profile); if (!state || state.consumed || state.released) fail(); state.consumed = true;
  const captured = F({ fileConfiguration: F({ storageProfile: state.file.storageProfile, allowedRoot: state.file.allowedRoot, filePolicy: state.file.filePolicy }), expectedOriginal: state.expected,
    ...(state.ageLimits === null ? {} : { uncertaintyAgeLimits: state.ageLimits }) });
  CAPTURED.set(captured, { state, portsIssued: false }); return captured;
}
/** Fixed native ports are supplied by the literal existing-store import.
 * V1/V2 retain their three-table context owner. Explicit V3 selects only the
 * current four-table grant-recovery owner, with no schema discovery/fallback.
 * The genuine consumed profile may issue one opener and enter it once. */
export function createApiCreditSignerInspectionFilePorts(captured, requireOpening, openers) {
  if (arguments.length !== 3 || captured === null || typeof captured !== 'object' || types.isProxy(captured) || !CAPTURED.has(captured)) fail();
  const selected = CAPTURED.get(captured), state = selected.state;
  if (state.released || selected.portsIssued || typeof requireOpening !== 'function' || types.isProxy(requireOpening) || !Object.isFrozen(requireOpening)) fail();
  const p = fields(openers, ['signerContext', 'grantRecovery']);
  if (!Object.isFrozen(openers) || Object.values(p).some(fn => typeof fn !== 'function' || types.isProxy(fn) || !Object.isFrozen(fn))) fail();
  selected.portsIssued = true; let entered = false;
  return F({ openFile: F(function openExistingSignerInspection(configuration) {
    if (arguments.length !== 1 || entered || state.released) fail(); entered = true;
    const file = captureOriginalFundingSpendingFileProfile(configuration);
    if (file.storageProfile.mode !== 'OPEN_EXISTING' || canonicalJson(file) !== canonicalJson(state.file)) fail();
    requireOpening(); if (state.released) fail();
    // Pass only the real opener's closed three-field API. requiredFreeBytes
    // belongs to the internal captured view, not the constructor input.
    const request = F({ storageProfile: file.storageProfile, allowedRoot: file.allowedRoot, filePolicy: file.filePolicy });
    const open = state.spendingStoreProfile === 'GRANT_RECOVERY_V1' ? p.grantRecovery : p.signerContext;
    return Reflect.apply(open, undefined, [request]);
  }) });
}
export function releaseApiCreditSignerInspectionProfile(profile) {
  if (arguments.length !== 1 || profile === null || typeof profile !== 'object' || types.isProxy(profile) || !PROFILES.has(profile)) fail(); profile.release();
}
