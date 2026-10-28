import { types } from 'node:util';
import { createSpendingBoundedSdk105FundingServiceLifecycle } from './sdk105-funding-service-lifecycle.js';
import { captureSdk105OriginalFundingSpendingConfiguration } from './sdk105-spending-bounded-client.js';

const F = Object.freeze, NP = Promise, PP = NP.prototype, THEN = PP.then;
const OPERATIONS = ['prepareOriginalFunding', 'commitOriginalFunding', 'submitOriginalFunding', 'handoffToService', 'submitOriginal'];
function fail(code) { throw new TypeError('SDK105_API_CREDIT_' + code); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail('INPUT');
  const out = {};
  for (const name of names) { const d = Object.getOwnPropertyDescriptor(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail('INPUT'); out[name] = d.value; }
  return out;
}
function data(value, name) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || !Object.isFrozen(value) || Object.getPrototypeOf(value) !== Object.prototype) fail('CHILD');
  const d = Object.getOwnPropertyDescriptor(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail('CHILD'); return d.value;
}
function method(value, name) { const fn = data(value, name); if (typeof fn !== 'function' || types.isProxy(fn) || !Object.isFrozen(fn)) fail('CHILD'); return fn; }
function safe(value) {
  if (!types.isPromise(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== PP || Reflect.ownKeys(value).some(k => k !== 'constructor')) return false;
  const d = Object.getOwnPropertyDescriptor(value, 'constructor'); return d === undefined || Object.hasOwn(d, 'value') && d.value === NP;
}
/** Join the existing spending/lifecycle owner to its actual file owner. Native
 * bindings supply these children; DATA controls declare their capabilities.
 * Revoke the budget synchronously, then request physical close only after the
 * original client/wallet close completes and its current view is clean. */
export function createSdk105ApiCreditApplicationLifecycle(configuration) {
  if (arguments.length !== 1) fail('INPUT');
  const c = fields(configuration, ['client', 'walletOwner', 'fileOwner', 'fundingResourceUrl', 'spending']);
  const owner = c.fileOwner, VIEW = method(owner, 'inspect'), CURRENT = method(owner, 'assertCurrent');
  const REVOKE = method(owner, 'revoke'), CLOSE = method(owner, 'close');
  const backend = data(owner, 'backend'), spending = fields(c.spending, ['policy', 'paymentId', 'readDay']);
  const selected = captureSdk105OriginalFundingSpendingConfiguration({ ...spending, backend });
  const first = Reflect.apply(VIEW, owner, []);
  if (data(first, 'spendingFileOwnerVersion') !== 1 || data(first, 'lifecycle') !== 'OPEN' || data(first, 'held')
      || data(first, 'busy') || data(first, 'backendClosed') || data(first, 'databaseOpen') !== true || data(first, 'physicalCloseEntered')) fail('FILE_OWNER');
  const client = createSpendingBoundedSdk105FundingServiceLifecycle({ client: c.client, walletOwner: c.walletOwner,
    fundingResourceUrl: c.fundingResourceUrl, spending: selected });
  let closing = null, held = false, clientClose = null, fileCloseEntered = false, closeReturned = false;
  function fileView() { const v = Reflect.apply(VIEW, owner, []); if (data(v, 'spendingFileOwnerVersion') !== 1) fail('FILE_OWNER'); return v; }
  function clientStopped() { const v = client.inspect(); return data(v, 'lifecycle') === 'CLOSED' && !data(v, 'held') && !data(v, 'publicOperationActive'); }
  function fileStopped() { const v = fileView(); return data(v, 'lifecycle') === 'CLOSED' && !data(v, 'held') && !data(v, 'busy')
    && data(v, 'backendClosed') && data(v, 'databaseOpen') === false && data(v, 'physicalCloseReturned') === true; }
  const out = {};
  for (const name of OPERATIONS) out[name] = F(function (input) {
    if (arguments.length !== 1 || closing !== null || held) return NP.reject(new TypeError('SDK105_API_CREDIT_UNAVAILABLE'));
    try {
      const v = fileView(); if (data(v, 'held') || data(v, 'busy') || data(v, 'backendClosed') || data(v, 'physicalCloseEntered')
        || data(v, 'lifecycle') !== 'OPEN' || data(v, 'databaseOpen') !== true) fail('FILE_OWNER');
      if (Reflect.apply(CURRENT, owner, []) !== undefined || closing !== null || held) fail('FILE_OWNER');
      const current = fileView(); if (data(current, 'held') || data(current, 'lifecycle') !== 'OPEN' || data(current, 'databaseOpen') !== true) fail('FILE_OWNER');
    }
    catch { held = true; return NP.reject(new TypeError('SDK105_API_CREDIT_FILE_OWNER')); }
    return Reflect.apply(client[name], client, [input]);
  });
  out.inspect = F(function inspect() {
    if (arguments.length !== 0) fail('INPUT');
    const v = client.inspect(), file = fileView(), result = {};
    if (data(file, 'held') || closeReturned && (!fileStopped() || !clientStopped())) held = true;
    for (const key of Reflect.ownKeys(v)) { if (typeof key !== 'string' || key === 'apiCredit') fail('CHILD'); Object.defineProperty(result, key, { value: data(v, key), enumerable: true, configurable: true }); }
    if (held) { Object.defineProperty(result, 'held', { value: true, enumerable: true }); Object.defineProperty(result, 'lifecycle', { value: 'HELD', enumerable: true }); }
    else if (closing !== null && !closeReturned) Object.defineProperty(result, 'lifecycle', { value: 'CLOSING', enumerable: true });
    Object.defineProperty(result, 'apiCredit', { value: F({ applicationVersion: 1, closeRequested: closing !== null, fileCloseEntered,
      file, nativeProductAcceptance: 'NOT_ESTABLISHED', authority: 'NONE' }), enumerable: true }); return F(result);
  });
  out.close = F(function close() {
    if (arguments.length !== 0) return NP.reject(new TypeError('SDK105_API_CREDIT_INPUT'));
    if (closing !== null) return closing;
    let resolve, reject; closing = new NP((yes, no) => { resolve = yes; reject = no; }); Object.defineProperty(closing, 'constructor', { value: NP });
    const bad = () => { held = true; reject(new TypeError('SDK105_API_CREDIT_CLOSE_UNKNOWN')); };
    // Existing close synchronously records active UNKNOWN and revokes all
    // operation admission. The separate backend is logically revoked once.
    try { clientClose = client.close(); } catch { held = true; }
    try { if (Reflect.apply(REVOKE, owner, []) !== undefined) held = true; } catch { held = true; }
    if (!safe(clientClose)) { bad(); return closing; }
    Reflect.apply(THEN, clientClose, [value => {
      try {
        if (value !== undefined || held || !clientStopped()) fail('CLOSE_UNKNOWN');
        fileCloseEntered = true;
        if (Reflect.apply(CLOSE, owner, []) !== undefined || !fileStopped() || !clientStopped()) fail('CLOSE_UNKNOWN');
        closeReturned = true; resolve(undefined);
      } catch { bad(); }
    }, bad]);
    return closing;
  });
  return F(out);
}
