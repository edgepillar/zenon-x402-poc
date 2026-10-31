import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { captureSdk105FundingServiceConfiguration, captureSdk105NonDpFundingServiceConfiguration } from './sdk105-funding-service-lifecycle.js';
import { captureSdk105OriginalFundingSpendingConfiguration } from './sdk105-spending-bounded-client.js';
import { captureOriginalFundingSpendingFileProfile } from '../original-funding-spending-file-profile.js';
import { captureNativeFundingServiceOperationalConfiguration, captureNativeNonDpFundingServiceOperationalConfiguration } from './native-funding-service-configuration.js';

const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn;
const ARRAY_BUFFER = DESC(Object.getPrototypeOf(Uint8Array.prototype), 'buffer').get;
const FILL = Buffer.prototype.fill, SELECTED = new WeakMap();
function fail() { throw new TypeError('SDK105_API_CREDIT_SELECTION'); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) { const d = DESC(value, name); if (!d?.enumerable || !OWN(d, 'value')) fail(); out[name] = d.value; }
  return out;
}
/** Detach operator trust/configuration before deferred native loading. Only the
 * already existing key and explicit challenge/day capabilities remain opaque;
 * only CA byte hashing runs; no key method, clock, SQL, network or signing operation is invoked. */
export function captureSdk105ApiCreditSelection(configuration) {
  if (arguments.length !== 1) fail();
  return captureSelection(configuration, false);
}
export function captureSdk105NonDpApiCreditSelection(configuration) {
  if (arguments.length !== 1) fail();
  return captureSelection(configuration, true);
}
function captureSelection(configuration, nonDp) {
  const c = fields(configuration, ['configuration', 'spendingFile', 'spending']);
  const selected = (nonDp ? captureSdk105NonDpFundingServiceConfiguration : captureSdk105FundingServiceConfiguration)(c.configuration);
  existingKeyShape(selected.walletOptions.keyPair);
  const file = captureOriginalFundingSpendingFileProfile(c.spendingFile), spending = fields(c.spending, ['paymentId', 'readDay']);
  const policy = file.storageProfile.policy;
  captureSdk105OriginalFundingSpendingConfiguration({ ...spending, policy, backend: null });
  const official = fields(selected.serviceOptions.official, ['validateChallenge', 'assetInfo', 'contextLimit']);
  const assetInfo = fields(official.assetInfo, ['asset', 'decimals', 'symbol']);
  if (policy.accountId !== selected.walletOptions.expectedAddress || policy.asset !== assetInfo.asset
      || typeof spending.readDay !== 'function' || types.isProxy(spending.readDay) || !Object.isFrozen(spending.readDay)
      || typeof official.validateChallenge !== 'function' || types.isProxy(official.validateChallenge)) fail();
  const fundingRoot = selected.storeOptions.allowedRoot;
  if (typeof fundingRoot !== 'string' || file.allowedRoot === fundingRoot || file.allowedRoot.startsWith(fundingRoot + '/')
      || fundingRoot.startsWith(file.allowedRoot + '/') || file.storageProfile.databasePath === selected.storeOptions.databasePath) fail();
  const copies = [], active = new WeakSet(); let nodes = 0;
  function snapshot(value, path, depth = 0) {
    if (++nodes > 4096 || depth > 16) fail();
    if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') { if (Buffer.byteLength(value) > 65536) fail(); return value; }
    if (typeof value === 'function' && path === 'serviceOptions.official.validateChallenge' && value === official.validateChallenge) return value;
    if (value === null || typeof value !== 'object' || types.isProxy(value) || active.has(value)) fail();
    if (Buffer.isBuffer(value)) {
      if (Object.getPrototypeOf(value) !== Buffer.prototype || types.isSharedArrayBuffer(Reflect.apply(ARRAY_BUFFER, value, []))) fail();
      const names = Reflect.ownKeys(value); if (names.length < 1 || names.length > 65536) fail();
      const b = Buffer.alloc(names.length); copies.push(b);
      for (let i = 0; i < names.length; i++) { const d = DESC(value, String(i)); if (!d?.enumerable || !OWN(d, 'value') || !Number.isInteger(d.value) || d.value < 0 || d.value > 255) fail(); b[i] = d.value; }
      return b;
    }
    active.add(value); let out;
    if (Array.isArray(value)) {
      const length = DESC(value, 'length')?.value;
      if (Object.getPrototypeOf(value) !== Array.prototype || !Number.isSafeInteger(length) || length > 64 || Reflect.ownKeys(value).length !== length + 1) fail();
      out = []; for (let i = 0; i < length; i++) { const d = DESC(value, String(i)); if (!d?.enumerable || !OWN(d, 'value')) fail(); out.push(snapshot(d.value, path + '.' + i, depth + 1)); }
    } else {
      if (Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length > 64) fail();
      out = {}; for (const key of Reflect.ownKeys(value)) { const d = DESC(value, key); if (typeof key !== 'string' || !d?.enumerable || !OWN(d, 'value')) fail();
        Object.defineProperty(out, key, { value: snapshot(d.value, path + '.' + key, depth + 1), enumerable: true }); }
    }
    active.delete(value); return F(out);
  }
  const state = { released: false, consumed: false, caDigests: null, nonDp };
  function release() { if (arguments.length !== 0) fail(); if (state.released) return; state.released = true; for (const b of copies) Reflect.apply(FILL, b, [0]); }
  try {
    const store = snapshot(selected.storeOptions, 'storeOptions'), funding = snapshot(selected.fundingOptions, 'fundingOptions');
    const service = snapshot(selected.serviceOptions, 'serviceOptions');
    const admitted = (nonDp ? captureNativeNonDpFundingServiceOperationalConfiguration : captureNativeFundingServiceOperationalConfiguration)({ storeOptions: store, fundingOptions: funding, serviceOptions: service });
    state.caDigests = caDigests(admitted);
    const result = F({ configuration: F({ storeOptions: admitted.storeOptions, fundingOptions: F({ ...admitted.fundingOptions, keyPair: selected.walletOptions.keyPair,
      expectedAddress: selected.walletOptions.expectedAddress }), serviceOptions: admitted.serviceOptions }), spendingFile: file,
      spending: F({ policy, ...spending }), release: F(release) });
    SELECTED.set(result, state); return result;
  } catch { release(); fail(); }
}

export function consumeSdk105ApiCreditSelection(selection) {
  if (arguments.length !== 1 || selection === null || typeof selection !== 'object' || types.isProxy(selection)) fail();
  return consumeSelection(selection, false);
}
export function consumeSdk105NonDpApiCreditSelection(selection) {
  if (arguments.length !== 1 || selection === null || typeof selection !== 'object' || types.isProxy(selection)) fail();
  return consumeSelection(selection, true);
}
function consumeSelection(selection, nonDp) {
  const state = SELECTED.get(selection); if (!state || state.nonDp !== nonDp || state.consumed || state.released) fail(); state.consumed = true;
  try {
    const c = (nonDp ? captureSdk105NonDpFundingServiceConfiguration : captureSdk105FundingServiceConfiguration)(selection.configuration);
    existingKeyShape(c.walletOptions.keyPair);
    const admitted = (nonDp ? captureNativeNonDpFundingServiceOperationalConfiguration : captureNativeFundingServiceOperationalConfiguration)({ storeOptions: c.storeOptions, fundingOptions: c.fundingOptions, serviceOptions: c.serviceOptions });
    const current = caDigests(admitted);
    if (current[0] !== state.caDigests[0] || current[1] !== state.caDigests[1]) fail();
    return selection;
  } catch { selection.release(); fail(); }
}
function caDigests(c) { return F([c.fundingOptions.fundingTransportOptions.ca, c.serviceOptions.transportOptions.ca]
  .map(value => createHash('sha256').update(value).digest('hex'))); }
function existingKeyShape(receiver) {
  if (receiver === null || typeof receiver !== 'object' || types.isProxy(receiver)) fail();
  for (const name of ['getAddress', 'getPublicKey', 'sign', 'clear']) {
    let at = receiver, found = false;
    for (let i = 0; i < 8 && at !== null && at !== Object.prototype; i++) {
      if (types.isProxy(at)) fail(); const d = DESC(at, name);
      if (d !== undefined) { if (!OWN(d, 'value') || typeof d.value !== 'function' || types.isProxy(d.value)) fail(); found = true; break; }
      at = Object.getPrototypeOf(at);
    }
    if (!found) fail();
  }
}
