import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { dirname, isAbsolute, normalize } from 'node:path';
import { captureFundingPostCheckpointRoute } from '../x402-funding-post-checkpoint-route.js';
import { snapshotOriginalServiceRequestCustodyPolicy } from '../service-credit-original-request-custody-contract.js';
import { captureNativePublicHttpsReadRoute } from './native-public-https-read-route.js';

const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn;
const STORAGE = DESC(Object.getPrototypeOf(Uint8Array.prototype), 'buffer').get;
function fail() { const e = new TypeError('NATIVE_FUNDING_SERVICE_CONFIGURATION'); Object.defineProperty(e, 'stack', { value: e.message }); throw F(e); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) { const d = DESC(value, name); if (!d?.enumerable || !OWN(d, 'value')) fail(); out[name] = d.value; }
  return out;
}
function integer(value, low, high) { if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < low || value > high) fail(); }
function path(value) { if (typeof value !== 'string' || value.length < 1 || value.length > 4096 || /[^\x20-\x7e]/.test(value)
  || !isAbsolute(value) || normalize(value) !== value || value.endsWith('/')) fail(); return value; }
function caBytes(value) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || !Buffer.isBuffer(value)
      || Object.getPrototypeOf(value) !== Buffer.prototype || types.isSharedArrayBuffer(Reflect.apply(STORAGE, value, []))) fail();
  const names = Reflect.ownKeys(value); if (names.length < 1 || names.length > 65536) fail();
  for (let i = 0; i < names.length; i++) { const d = DESC(value, String(i)); if (!d?.enumerable || !OWN(d, 'value') || !Number.isInteger(d.value) || d.value < 0 || d.value > 255) fail(); }
  return names.length;
}
function reads(value, local) {
  const c = fields(value, ['endpoints', 'accountEndpoint']), endpoints = c.endpoints;
  if (!Object.isFrozen(value)) fail();
  if (!Array.isArray(endpoints) || types.isProxy(endpoints) || Object.getPrototypeOf(endpoints) !== Array.prototype || !Object.isFrozen(endpoints)
      || Reflect.ownKeys(endpoints).length !== 3 || DESC(endpoints, 'length')?.value !== 2) fail();
  function endpoint(input, role) {
    const e = fields(input, ['route', 'timeoutMs', 'closeGraceMs']); if (!Object.isFrozen(input)) fail();
    const r = fields(e.route, ['hostname', 'path', 'ipv4Address']); if (!Object.isFrozen(e.route)) fail();
    integer(e.timeoutMs, 1, 60000); integer(e.closeGraceMs, 1, 60000);
    if (local) {
      if (r.hostname !== 'localhost' || r.ipv4Address !== '127.0.0.1'
          || (role === 'account' ? r.path !== '/rpc/account' : r.path !== '/rpc/first' && r.path !== '/rpc/second')) fail();
    } else captureNativePublicHttpsReadRoute(F(r));
    return F({ route: F(r), timeoutMs: e.timeoutMs, closeGraceMs: e.closeGraceMs });
  }
  const d0 = DESC(endpoints, '0'), d1 = DESC(endpoints, '1');
  if (!d0?.enumerable || !d1?.enumerable || !OWN(d0, 'value') || !OWN(d1, 'value')) fail();
  const first = endpoint(d0.value, 'dp'), second = endpoint(d1.value, 'dp'), account = endpoint(c.accountEndpoint, 'account');
  if (first.route.hostname === second.route.hostname && first.route.path === second.route.path && first.route.ipv4Address === second.route.ipv4Address) fail();
  return F({ endpoints: F([first, second]), accountEndpoint: account });
}
/** Shared inert operational grammar. No wallet/key capability is accepted,
 * no CA is parsed or cleared, and no filesystem, SDK, work search or network
 * capability is entered. Named native local qualification alone selects the
 * second argument; the public API-credit selector always uses PUBLIC. */
export function captureNativeFundingServiceOperationalConfiguration(configuration, mode = 'PUBLIC') {
  if (arguments.length < 1 || arguments.length > 2 || !['PUBLIC', 'LOCAL_QUALIFICATION'].includes(mode)) fail();
  return captureOperational(configuration, mode, false);
}
/** Explicit source selection; no work/nonce/wait field is accepted or synthesized. */
export function captureNativeNonDpFundingServiceOperationalConfiguration(configuration) {
  if (arguments.length !== 1) fail();
  return captureOperational(configuration, 'PUBLIC', true);
}
/** Separately named non-DP local qualification. It retains the closed three
 * role paths; no public-route fallback, work fields or native owner is added. */
export function captureNativeNonDpFundingServiceOperationalConfigurationForLocalQualification(configuration) {
  if (arguments.length !== 1) fail();
  return captureOperational(configuration, 'LOCAL_QUALIFICATION', true);
}
function captureOperational(configuration, mode, nonDp) {
  const c = fields(configuration, ['storeOptions', 'fundingOptions', 'serviceOptions']);
  const store = fields(c.storeOptions, ['databasePath', 'allowedRoot', 'resourceUrl', 'custodyPolicy']);
  path(store.databasePath); path(store.allowedRoot); if (dirname(store.databasePath) !== store.allowedRoot) fail();
  captureFundingPostCheckpointRoute(store.resourceUrl);
  const policy = snapshotOriginalServiceRequestCustodyPolicy(store.custodyPolicy, store.resourceUrl);
  const f = fields(c.fundingOptions, nonDp
    ? ['readSessionOptions', 'expectedPublicKey', 'deadlineMs', 'fundingTransportOptions']
    : ['readSessionOptions', 'materialOptions', 'materialWaitMs', 'deadlineMs', 'fundingTransportOptions']);
  let material = null, limits = null;
  if (!nonDp) {
    material = fields(f.materialOptions, ['publicKey', 'startNonce', 'limits']); limits = fields(material.limits, ['maxAttempts', 'maxDifficulty']);
    integer(limits.maxAttempts, 0, 4096); integer(limits.maxDifficulty, 0, Number.MAX_SAFE_INTEGER);
    if (typeof material.startNonce !== 'string' || material.startNonce.length !== 16 || !/^[0-9a-f]{16}$/.test(material.startNonce)) fail();
  }
  const publicKey = nonDp ? f.expectedPublicKey : material.publicKey;
  if (typeof publicKey !== 'string' || publicKey.length !== 44 || !/^[A-Za-z0-9+/]{43}=$/.test(publicKey)
      || Buffer.from(publicKey, 'base64').length !== 32 || Buffer.from(publicKey, 'base64').toString('base64') !== publicKey) fail();
  const funding = fields(f.fundingTransportOptions, ['resourceUrl', 'ca', 'maxRequestStarts', 'requestDeadlineMs', 'handshakeDeadlineMs', 'closeGraceMs']);
  const service = fields(c.serviceOptions, ['official', 'transportOptions', 'deadlineMs']);
  const transport = fields(service.transportOptions, ['origin', 'ca', 'maxRequestStarts', 'maxConcurrentRequests', 'requestDeadlineMs', 'handshakeDeadlineMs', 'closeGraceMs']);
  const official = fields(service.official, ['validateChallenge', 'assetInfo', 'contextLimit']), asset = fields(official.assetInfo, ['asset', 'decimals', 'symbol']);
  if (typeof official.validateChallenge !== 'function' || types.isProxy(official.validateChallenge) || Object.getPrototypeOf(official.validateChallenge) !== Function.prototype
      || typeof asset.asset !== 'string' || asset.asset.length < 1 || asset.asset.length > 256 || typeof asset.symbol !== 'string' || /^[\x21-\x7e]{1,32}$/.exec(asset.symbol)?.[0] !== asset.symbol) fail();
  integer(asset.decimals, 0, 18); integer(official.contextLimit, 1, 64);
  if (!nonDp) integer(f.materialWaitMs, 1, 60000);
  integer(f.deadlineMs, 1, 60000); integer(service.deadlineMs, 1, 60000);
  integer(funding.requestDeadlineMs, 1, 60000); integer(funding.handshakeDeadlineMs, 1, funding.requestDeadlineMs); integer(funding.closeGraceMs, 1, Math.min(f.deadlineMs, 1000));
  integer(transport.maxRequestStarts, 1, 256); integer(transport.requestDeadlineMs, 1, 30000);
  integer(transport.handshakeDeadlineMs, 1, transport.requestDeadlineMs); integer(transport.closeGraceMs, 1, Math.min(service.deadlineMs, 1000));
  if (funding.maxRequestStarts !== 1 || funding.resourceUrl !== store.resourceUrl || funding.requestDeadlineMs > f.deadlineMs || transport.maxConcurrentRequests !== 1
      || typeof transport.origin !== 'string' || store.resourceUrl !== transport.origin + '/funding' || policy.serviceResourceUrl !== transport.origin + '/service-credit/v1/execute'
      || transport.maxRequestStarts > policy.maxRequests || transport.requestDeadlineMs > service.deadlineMs) fail();
  const length = caBytes(funding.ca); if (caBytes(transport.ca) !== length) fail();
  for (let i = 0; i < length; i++) if (funding.ca[i] !== transport.ca[i]) fail();
  const readSessionOptions = reads(f.readSessionOptions, mode === 'LOCAL_QUALIFICATION');
  const fundingOptions = { ...f, readSessionOptions, fundingTransportOptions: F(funding) };
  if (!nonDp) fundingOptions.materialOptions = F({ ...material, limits: F(limits) });
  return F({ storeOptions: F({ ...store, custodyPolicy: policy }), fundingOptions: F(fundingOptions),
    serviceOptions: F({ ...service, official: F({ ...official, assetInfo: F(asset) }), transportOptions: F(transport) }) });
}
