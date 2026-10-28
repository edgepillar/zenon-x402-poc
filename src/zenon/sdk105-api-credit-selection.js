import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { captureSdk105FundingServiceConfiguration } from './sdk105-funding-service-lifecycle.js';
import { captureSdk105OriginalFundingSpendingConfiguration } from './sdk105-spending-bounded-client.js';
import { captureOriginalFundingSpendingFileProfile } from '../original-funding-spending-file-profile.js';

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
 * no key method, clock, SQL, network or cryptographic operation is invoked. */
export function captureSdk105ApiCreditSelection(configuration) {
  if (arguments.length !== 1) fail();
  const c = fields(configuration, ['configuration', 'spendingFile', 'spending']);
  const selected = captureSdk105FundingServiceConfiguration(c.configuration);
  const file = captureOriginalFundingSpendingFileProfile(c.spendingFile), spending = fields(c.spending, ['paymentId', 'readDay']);
  const policy = file.storageProfile.policy;
  captureSdk105OriginalFundingSpendingConfiguration({ ...spending, policy, backend: null });
  const official = fields(selected.serviceOptions.official, ['validateChallenge', 'assetInfo', 'contextLimit']);
  const assetInfo = fields(official.assetInfo, ['asset', 'decimals', 'symbol']);
  if (policy.accountId !== selected.walletOptions.expectedAddress || policy.asset !== assetInfo.asset
      || typeof spending.readDay !== 'function' || !Object.isFrozen(spending.readDay) || types.isProxy(spending.readDay)
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
  const state = { released: false, consumed: false };
  function release() { if (arguments.length !== 0) fail(); if (state.released) return; state.released = true; for (const b of copies) Reflect.apply(FILL, b, [0]); }
  try {
    const store = snapshot(selected.storeOptions, 'storeOptions'), funding = snapshot(selected.fundingOptions, 'fundingOptions');
    const service = snapshot(selected.serviceOptions, 'serviceOptions');
    const result = F({ configuration: F({ storeOptions: store, fundingOptions: F({ ...funding, keyPair: selected.walletOptions.keyPair,
      expectedAddress: selected.walletOptions.expectedAddress }), serviceOptions: service }), spendingFile: file,
      spending: F({ policy, ...spending }), release: F(release) });
    SELECTED.set(result, state); return result;
  } catch { release(); fail(); }
}

export function consumeSdk105ApiCreditSelection(selection) {
  if (arguments.length !== 1 || selection === null || typeof selection !== 'object' || types.isProxy(selection)) fail();
  const state = SELECTED.get(selection); if (!state || state.consumed || state.released) fail(); state.consumed = true;
  return selection;
}
