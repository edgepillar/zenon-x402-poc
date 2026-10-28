import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { captureBuyerApiCreditCommandLimits } from './buyer-original-funding-command.js';
import { captureSdk105ApiCreditProductOperatorData, captureSdk105ApiCreditProductSelection } from './zenon/sdk105-api-credit-product-profile.js';

const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn, PREPARED = new WeakMap();
function fail() { throw new TypeError('API_CREDIT_OPERATOR_BOOTSTRAP'); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) { const d = DESC(value, name); if (!d?.enumerable || !OWN(d, 'value')) fail(); out[name] = d.value; }
  return out;
}
function freezeJson(value, depth = 0, budget = { nodes: 4096 }) {
  if (--budget.nodes < 0 || depth > 16) fail();
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') { if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail(); return value; }
  if (typeof value !== 'object' || types.isProxy(value)) fail();
  if (Array.isArray(value)) { for (const item of value) freezeJson(item, depth + 1, budget); return F(value); }
  if (Object.getPrototypeOf(value) !== Object.prototype) fail();
  for (const name of Reflect.ownKeys(value)) { const d = DESC(value, name); if (typeof name !== 'string' || !d?.enumerable || !OWN(d, 'value')) fail(); freezeJson(d.value, depth + 1, budget); }
  return F(value);
}
/** Canonical non-secret operator DATA, completely admitted before reading the
 * separate credential channel. No key/clock placeholder or SDK is constructed. */
export function decodeApiCreditOperatorBootstrap(text) {
  if (arguments.length !== 1 || typeof text !== 'string' || Buffer.byteLength(text) > 262144 || Buffer.from(text).toString('utf8') !== text) fail();
  let raw; try { raw = freezeJson(JSON.parse(text)); } catch { fail(); }
  if (canonicalJson(raw) !== text) fail();
  const c = fields(raw, ['operatorBootstrapVersion', 'productProfileVersion', 'paymentRequiredHeader', 'publicCaPem', 'configuration', 'spendingFile', 'spending', 'limits']);
  if (c.operatorBootstrapVersion !== 1 || c.productProfileVersion !== 1 || typeof c.publicCaPem !== 'string'
      || Buffer.byteLength(c.publicCaPem) > 65536 || !c.publicCaPem.startsWith('-----BEGIN CERTIFICATE-----\n')
      || !c.publicCaPem.endsWith('-----END CERTIFICATE-----\n') || /[^\x09\x0a\x0d\x20-\x7e]/.test(c.publicCaPem)) fail();
  const config = fields(c.configuration, ['storeOptions', 'fundingOptions', 'serviceOptions']);
  const funding = fields(config.fundingOptions, ['readSessionOptions', 'materialOptions', 'materialWaitMs', 'expectedAddress', 'deadlineMs', 'fundingTransportOptions']);
  const fundingTransport = fields(funding.fundingTransportOptions, ['resourceUrl', 'maxRequestStarts', 'requestDeadlineMs', 'handshakeDeadlineMs', 'closeGraceMs']);
  const service = fields(config.serviceOptions, ['assetInfo', 'contextLimit', 'transportOptions', 'deadlineMs']);
  const serviceTransport = fields(service.transportOptions, ['origin', 'maxRequestStarts', 'maxConcurrentRequests', 'requestDeadlineMs', 'handshakeDeadlineMs', 'closeGraceMs']);
  const ca = Buffer.from(c.publicCaPem, 'ascii');
  let admitted;
  try {
    admitted = captureSdk105ApiCreditProductOperatorData({ productProfileVersion: 1, paymentRequiredHeader: c.paymentRequiredHeader,
      configuration: { storeOptions: config.storeOptions, fundingOptions: { ...funding, fundingTransportOptions: { ...fundingTransport, ca } },
        serviceOptions: { ...service, transportOptions: { ...serviceTransport, ca } } }, spendingFile: c.spendingFile, spending: c.spending });
    const limits = captureBuyerApiCreditCommandLimits(c.limits); if (limits.maxCommands < 106) fail();
    const state = { admitted, header: c.paymentRequiredHeader, consumed: false, released: false };
    const release = F(function release() { if (arguments.length !== 0) fail(); if (!state.released) { state.released = true; ca.fill(0); } });
    const prepared = F({ operatorBootstrapVersion: 1, expectedIdentity: admitted.walletIdentity, product: admitted.profile, limits, release });
    PREPARED.set(prepared, state); return prepared;
  } catch { ca.fill(0); fail(); }
}
/** Attach explicit operational key/day capabilities to the previously admitted
 * product DATA. This calls no key method; the native wallet still verifies its
 * identity. The actual selector takes independent CA copies before release. */
export function bindApiCreditOperatorBootstrap(prepared, keyPair, readDay) {
  if (arguments.length !== 3 || prepared === null || typeof prepared !== 'object' || types.isProxy(prepared)) fail();
  const state = PREPARED.get(prepared); if (!state || state.consumed || state.released) fail(); state.consumed = true;
  const c = state.admitted, service = c.configuration.serviceOptions;
  try {
    return captureSdk105ApiCreditProductSelection({ productProfileVersion: 1, paymentRequiredHeader: state.header,
      configuration: { storeOptions: c.configuration.storeOptions, fundingOptions: { ...c.configuration.fundingOptions, keyPair, expectedAddress: c.walletIdentity.expectedAddress },
        serviceOptions: { assetInfo: service.official.assetInfo, contextLimit: service.official.contextLimit, transportOptions: service.transportOptions, deadlineMs: service.deadlineMs } },
      spendingFile: { storageProfile: c.spendingFile.storageProfile, allowedRoot: c.spendingFile.allowedRoot, filePolicy: c.spendingFile.filePolicy },
      spending: { paymentId: c.spending.paymentId, readDay } });
  } finally { prepared.release(); }
}
