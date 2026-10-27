import { Buffer } from 'node:buffer';
import { isAbsolute, relative, resolve } from 'node:path';
import { types as utilTypes } from 'node:util';
import { canonicalJson } from './canonical.js';
import { captureBuyerOriginalRecoverySelection } from './buyer-original-recovery-client.js';
import { snapshotOriginalServiceRequestCustodyPolicy } from './service-credit-original-request-custody-contract.js';
import { restoreOriginalPaymentCheckpoint } from './service-credit-pilot-original-payment-checkpoint.js';
import { decodeB64Json } from './x402-wire.js';

const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn;
const PROXY = utilTypes.isProxy;

/** Capture the first explicit command-pipe line before loading native modules.
 * All originals, pins, selected grant, CA and asset metadata come from this
 * external DATA, never from a store or a previous returned result. Capturing
 * shapes/digests is not authentication, signing, opening or send authority. */
export function decodeBuyerOriginalRecoveryPipeBootstrap(line, expectedRoot) {
  if (arguments.length !== 2 || typeof line !== 'string' || Buffer.byteLength(line) > 262144
      || Buffer.from(line).toString('utf8') !== line) fail();
  const root = captureBuyerOriginalRecoveryPipeRoot(expectedRoot);
  let parsed;
  try { parsed = JSON.parse(line); } catch { fail(); }
  const c = fields(parsed, ['recoveryPipeBootstrapVersion', 'selection', 'payerOptions', 'official', 'transportOptions']);
  if (c.recoveryPipeBootstrapVersion !== 1) fail();
  const selection = captureBuyerOriginalRecoverySelection(c.selection);
  const payer = fields(c.payerOptions, ['databasePath', 'allowedRoot', 'fundingResourceUrl',
    'custodyPolicy', 'selectedGrantId', 'deadlineMs']);
  for (const name of ['databasePath', 'allowedRoot']) {
    const p = payer[name];
    if (typeof p !== 'string' || p.length < 2 || Buffer.byteLength(p) > 4096 || /[\x00-\x1f\x7f]/.test(p)
        || !isAbsolute(p) || resolve(p) !== p) fail();
  }
  const subpath = relative(payer.allowedRoot, payer.databasePath);
  if (payer.allowedRoot !== root || subpath === '' || subpath === '..' || subpath.startsWith('../') || isAbsolute(subpath)
      || payer.fundingResourceUrl !== selection.originalPayment.resourceUrl
      || payer.selectedGrantId !== selection.selectedGrantId) fail();
  integer(payer.deadlineMs, 1, 60000);
  const policy = snapshotOriginalServiceRequestCustodyPolicy(payer.custodyPolicy, payer.fundingResourceUrl);
  const official = fields(c.official, ['assetInfo', 'contextLimit']);
  const asset = fields(official.assetInfo, ['asset', 'decimals', 'symbol']);
  const checkpoint = restoreOriginalPaymentCheckpoint(selection.originalPayment.serializedCheckpoint,
    selection.originalPayment.expectedPins);
  const payload = decodeB64Json(checkpoint.originalBytes.paymentPayload, { maxEncodedBytes: 5464, maxDecodedBytes: 4096 });
  if (asset.asset !== payload.accepted.asset || typeof asset.symbol !== 'string'
      || !/^[\x21-\x7e]{1,32}$/.test(asset.symbol)) fail();
  integer(asset.decimals, 0, 18); integer(official.contextLimit, 1, 64);
  const transport = fields(c.transportOptions, ['origin', 'caPem', 'maxRequestStarts', 'maxConcurrentRequests',
    'requestDeadlineMs', 'handshakeDeadlineMs', 'closeGraceMs']);
  if (typeof transport.origin !== 'string' || transport.origin.length > 2048 || /[^\x21-\x7e]/.test(transport.origin)) fail();
  let url;
  try { url = new URL(transport.origin); } catch { fail(); }
  if (url.protocol !== 'https:' || url.origin !== transport.origin || url.href !== transport.origin + '/'
      || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== ''
      || selection.originalPayment.resourceUrl !== transport.origin + '/funding'
      || policy.serviceResourceUrl !== transport.origin + '/service-credit/v1/execute') fail();
  if (typeof transport.caPem !== 'string' || Buffer.byteLength(transport.caPem) > 65536
      || !transport.caPem.startsWith('-----BEGIN CERTIFICATE-----\n')
      || !transport.caPem.endsWith('-----END CERTIFICATE-----\n')
      || /[^\x09\x0a\x0d\x20-\x7e]/.test(transport.caPem)) fail();
  integer(transport.maxRequestStarts, 1, Math.min(256, policy.maxRequests));
  if (transport.maxConcurrentRequests !== 1) fail();
  integer(transport.requestDeadlineMs, 1, Math.min(30000, payer.deadlineMs));
  integer(transport.handshakeDeadlineMs, 1, transport.requestDeadlineMs);
  integer(transport.closeGraceMs, 1, Math.min(1000, payer.deadlineMs));
  // Closed bounded fields above also bound JSON depth before canonicalization.
  if (canonicalJson(parsed) !== line) fail();
  return F({ recoveryPipeBootstrapVersion: 1, selection,
    payerOptions: F({ ...payer, custodyPolicy: policy }),
    official: F({ assetInfo: F(asset), contextLimit: official.contextLimit }), transportOptions: F(transport) });
}

/** The operator supplies this separately from pipe DATA. Lexical capture does
 * not open a directory or replace the native owner's physical-path checks. */
export function captureBuyerOriginalRecoveryPipeRoot(root) {
  if (arguments.length !== 1 || typeof root !== 'string' || root.length < 2 || Buffer.byteLength(root) > 4096
      || /[\x00-\x1f\x7f]/.test(root) || !isAbsolute(root) || resolve(root) !== root) fail();
  return root;
}

function fields(value, names) {
  if (value === null || typeof value !== 'object' || PROXY(value)
      || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) {
    const d = DESC(value, name);
    if (!d || !OWN(d, 'value') || !d.enumerable) fail();
    Object.defineProperty(out, name, { value: d.value, enumerable: true });
  }
  return out;
}
function integer(value, low, high) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < low || value > high) fail();
}
function fail() {
  const code = 'buyer_original_recovery_pipe_bootstrap_rejected', e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code }); throw F(e);
}
