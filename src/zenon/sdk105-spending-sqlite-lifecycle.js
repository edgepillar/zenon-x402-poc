// Source-only native assembly. It has not been executed with SQLite or an SDK.
import { types } from 'node:util';
import { openOriginalFundingSpendingSqliteStore } from '../original-funding-spending-sqlite-store.js';
import { captureOriginalFundingSpendingSqliteProfile } from '../original-funding-spending-sqlite-profile.js';
import { captureSdk105OriginalFundingSpendingConfiguration } from './sdk105-spending-bounded-client.js';
import { createSpendingBoundedSdk105FundingServiceLifecycle } from './sdk105-funding-service-lifecycle.js';
import { captureFundingPostCheckpointRoute } from '../x402-funding-post-checkpoint-route.js';

const F = Object.freeze, NP = Promise, PP = NP.prototype, THEN = PP.then;
const METHODS = ['prepareOriginalFunding', 'commitOriginalFunding', 'submitOriginalFunding', 'handoffToService', 'submitOriginal', 'inspect', 'close'];
let refusedAssembly = null;
function fail(code) { const e = new TypeError('SDK105_SPENDING_SQLITE_' + code); Object.defineProperty(e, 'stack', { value: e.message }); throw F(e); }
function record(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail('INPUT');
  const out = {};
  for (const name of names) { const d = Object.getOwnPropertyDescriptor(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail('INPUT'); out[name] = d.value; }
  return out;
}
function methods(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || !Object.isFrozen(value)) fail('CHILD');
  for (const name of names) { const d = Object.getOwnPropertyDescriptor(value, name); if (!d || !Object.hasOwn(d, 'value') || typeof d.value !== 'function' || types.isProxy(d.value)) fail('CHILD'); }
}
function safe(value) {
  if (PP.then !== THEN || !types.isPromise(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== PP
      || Reflect.ownKeys(value).some(k => k !== 'constructor')) return false;
  const d = Object.getOwnPropertyDescriptor(value, 'constructor'); return d === undefined || Object.hasOwn(d, 'value') && d.value === NP;
}
/** Hardwire the actual spending backend and existing pure SDK105 lifecycle.
 * Database, client and wallet were acquired by the caller. File pinning,
 * configured pragmas, exclusive child admission and physical close remain its
 * duties. No supplied backend factory, file opener, retry or fallback is used. */
export function createSdk105SpendingSqliteLifecycle(configuration) {
  if (arguments.length !== 1 || refusedAssembly !== null) fail('UNAVAILABLE');
  const c = record(configuration, ['database', 'storageProfile', 'client', 'walletOwner', 'fundingResourceUrl', 'paymentId', 'readDay']);
  const profile = captureOriginalFundingSpendingSqliteProfile(c.storageProfile);
  captureFundingPostCheckpointRoute(c.fundingResourceUrl);
  methods(c.client, METHODS); methods(c.walletOwner, ['inspect', 'close']);
  // Validate the selected policy/ID/day capability before entering SQLite.
  captureSdk105OriginalFundingSpendingConfiguration({ policy: profile.policy, backend: null, paymentId: c.paymentId, readDay: c.readDay });
  const selection = { version: 1, mode: profile.mode, databasePath: profile.databasePath, policy: profile.policy,
    ...(profile.mode === 'CREATE_NEW' ? { storeId: profile.ownerToken.storeId, ownerId: profile.ownerToken.ownerId } : { ownerToken: profile.ownerToken }) };
  const store = openOriginalFundingSpendingSqliteStore(c.database, selection);
  let client;
  try {
    client = createSpendingBoundedSdk105FundingServiceLifecycle({ client: c.client, walletOwner: c.walletOwner, fundingResourceUrl: c.fundingResourceUrl,
      spending: { policy: profile.policy, backend: store, paymentId: c.paymentId, readDay: c.readDay } });
  } catch {
    // Preserve partial construction; never assert physical release or reset a
    // newly committed schema. The caller still has its original child handles.
    refusedAssembly = F({ store, client: c.client, walletOwner: c.walletOwner, database: c.database });
    try { store.close(); } catch {}
    fail('ASSEMBLY_REFUSED');
  }
  let closing = null, held = false;
  const out = {};
  for (const name of METHODS.slice(0, 5)) out[name] = F(function (input) {
    if (arguments.length !== 1 || closing !== null || held) return NP.reject(new TypeError('SDK105_SPENDING_SQLITE_UNAVAILABLE'));
    return Reflect.apply(client[name], client, [input]);
  });
  out.inspect = F(function inspect() {
    if (arguments.length !== 0) fail('INPUT');
    const value = client.inspect(), view = {};
    if (value === null || typeof value !== 'object' || types.isProxy(value) || !Object.isFrozen(value)) fail('CHILD');
    for (const key of Reflect.ownKeys(value)) {
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || key === 'nativeSpending' || !d?.enumerable || !Object.hasOwn(d, 'value')) fail('CHILD');
      Object.defineProperty(view, key, { value: d.value, enumerable: true, configurable: true });
    }
    const state = store.snapshot();
    if (held || state.held) {
      Object.defineProperty(view, 'held', { value: true, enumerable: true });
      Object.defineProperty(view, 'lifecycle', { value: 'HELD', enumerable: true });
    }
    Object.defineProperty(view, 'nativeSpending', { value: state, enumerable: true }); return F(view);
  });
  out.close = F(function close() {
    if (arguments.length !== 0) return NP.reject(new TypeError('SDK105_SPENDING_SQLITE_INPUT'));
    if (closing !== null) return closing;
    let resolve, reject; closing = new NP((yes, no) => { resolve = yes; reject = no; });
    Object.defineProperty(closing, 'constructor', { value: NP });
    let receipt;
    // The client revokes its admission and records any active UNKNOWN first.
    // Request the store's logical revocation independently, without waiting.
    try { receipt = client.close(); } catch { held = true; }
    try { store.close(); } catch { held = true; }
    function bad() { held = true; reject(new TypeError('SDK105_SPENDING_SQLITE_CLOSE_UNKNOWN')); }
    if (!safe(receipt)) { bad(); return closing; }
    Reflect.apply(THEN, receipt, [value => {
      if (value !== undefined || held || store.snapshot().held || !store.snapshot().closed) bad(); else resolve(undefined);
    }, bad]);
    return closing;
  });
  return F(out);
}
