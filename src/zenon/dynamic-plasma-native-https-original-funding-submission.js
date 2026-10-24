import { types as utilTypes } from 'node:util';
import { captureZenonDynamicPlasmaBoundedOriginalFundingConfiguration } from './dynamic-plasma-bounded-original-funding-configuration.js';
import { createBoundedNonceDynamicPlasmaMaterialExchange } from './dynamic-plasma-bounded-material-exchange.js';
import { createRetainedDynamicPlasmaHttpsReadSessionV2 } from './dynamic-plasma-retained-https-read-session.js';
import { createZenonDynamicPlasmaOriginalFundingSubmissionV4 } from './dynamic-plasma-original-funding-submission.js';
import { createFundingPostNativeHttpsTransport } from '../service-credit-funding-post-native-https-transport.js';
import { createNativeOriginalFundingCloseSession } from './dynamic-plasma-native-funding-close-session.js';

const CAPTURE = captureZenonDynamicPlasmaBoundedOriginalFundingConfiguration;
const MATERIAL = createBoundedNonceDynamicPlasmaMaterialExchange;
const READS = createRetainedDynamicPlasmaHttpsReadSessionV2, SUBMIT = createZenonDynamicPlasmaOriginalFundingSubmissionV4;
const FUNDING = createFundingPostNativeHttpsTransport, FREEZE = Object.freeze;
const JOIN = createNativeOriginalFundingCloseSession;
const DESC = Object.getOwnPropertyDescriptor, PROTO = Object.getPrototypeOf, KEYS = Reflect.ownKeys;
const OWN = Object.hasOwn, APPLY = Reflect.apply, IS_PROXY = utilTypes.isProxy, IS_PROMISE = utilTypes.isPromise;
const NativePromise = Promise, PROMISE = NativePromise.prototype, THEN = PROMISE.then;

/**
 * SOURCE-ONLY full native read AND funding-POST selection, default off.
 * Builds actual bounded work, actual three-owner RPC read session, actual native
 * TLS POST transport and actual V4/guarded-payer/SDK/V6 owner. No fetch/request/owner factory
 * injection, key production, alternate preflight/store, retry or default cutover.
 *
 * The already supplied original challenge is used; this selection allows ONE
 * original funding POST, not an extra challenge round trip or replay.
 * Resource URLs must match and the transport deadline may not exceed the
 * existing payer deadline. All methods on the returned actual V4 owner are
 * preserved directly, including explicit pins/commit and cached close Promise.
 *
 * V4 closes its operation admission before the combined read-close capability
 * requests both native sides to close. Both child close attempts are started
 * independently, even if one throws. Only clean read close and a clean native
 * POST owner allow V4 to enter the actual payer close after operation join.
 * The private guard is rechecked by the genuine payer after its own async
 * joins, immediately before/after actual store.close. Pre-entry refusal holds
 * the open store. A post-entry failure cannot undo an already returned close.
 * Pre-entry uncertainty vetoes that entry permanently and holds the open store.
 * Original bytes/identity remain retained; a post-return refusal cannot claim
 * that the already-closed handle is still open. No wallet CPU cancellation or
 * OS/drain/restart proof is established.
 *
 * Construction performs no native request, search, signing or SQL. Failure asks
 * constructed inert owners to close, without claiming cleanup. A consumed store
 * claim stays consumed; caller retains store close/quarantine on refusal.
 * The same private read/funding join now lives in its own SDK/SQL/network-free
 * component, with own-data current-view checks and cached inspection. The
 * actual owners are still hardwired above; no caller-supplied factory is added.
 * Component or previous callback tests do NOT qualify this new native graph.
 */
export function createZenonDynamicPlasmaNativeHttpsOriginalFundingSubmission(configuration) {
  let reads = null, funding = null;
  try {
    if (arguments.length !== 1) fail('configuration_rejected');
    const c = record(configuration, ['readSessionOptions', 'materialOptions', 'materialWaitMs',
      'wallet', 'store', 'fundingResourceUrl', 'deadlineMs', 'fundingTransportOptions']);
    const f = record(c.fundingTransportOptions, ['resourceUrl', 'ca', 'maxRequestStarts',
      'requestDeadlineMs', 'handshakeDeadlineMs', 'closeGraceMs']);
    if (f.resourceUrl !== c.fundingResourceUrl || f.maxRequestStarts !== 1
        || !Number.isSafeInteger(c.deadlineMs) || !Number.isSafeInteger(f.requestDeadlineMs)
        || f.requestDeadlineMs > c.deadlineMs)
      fail('configuration_rejected');
    funding = FUNDING(f); // Inert actual native constructor; no test factory.
    const selected = CAPTURE({ readOptions: c.readSessionOptions, materialOptions: c.materialOptions,
      materialWaitMs: c.materialWaitMs, wallet: c.wallet, store: c.store,
      fundingResourceUrl: c.fundingResourceUrl, deadlineMs: c.deadlineMs, fetchImpl: funding.fetchImpl });
    const materialExchange = MATERIAL(selected.materialOptions);
    reads = READS(selected.readOptions);
    const session = JOIN(reads, funding);
    return SUBMIT({ preparerOptions: { readOptions: session.readSession.readOptions, materialExchange,
      materialWaitMs: selected.materialWaitMs, wallet: selected.wallet }, store: selected.store,
      fundingResourceUrl: selected.fundingResourceUrl, deadlineMs: selected.deadlineMs,
      fetchImpl: funding.fetchImpl, readSession: session.readSession,
      nativeResourceCloseGuard: session.canCloseFunding });
  } catch {
    for (const owner of [reads, funding]) if (owner !== null) {
      try { prehandle(APPLY(owner.close, undefined, [])); } catch {}
    }
    fail('configuration_rejected');
  }
}
function record(value, fields) {
  if (typeof value !== 'object' || value === null || IS_PROXY(value)
      || PROTO(value) !== Object.prototype || KEYS(value).length !== fields.length) fail('input_rejected');
  const out = {};
  for (const name of fields) {
    const d = DESC(value, name);
    if (!d || !d.enumerable || !OWN(d, 'value')) fail('input_rejected');
    Object.defineProperty(out, name, { value: d.value, enumerable: true });
  }
  return out;
}
function observe(value, yes, no) {
  if (!IS_PROMISE(value) || IS_PROXY(value) || PROTO(value) !== PROMISE || DESC(value, 'then')) return false;
  const d = DESC(value, 'constructor');
  if (d && (!OWN(d, 'value') || d.value !== NativePromise || d.enumerable || d.writable || d.configurable)) return false;
  try { APPLY(THEN, value, [yes, no]); return true; } catch { return false; }
}
function prehandle(promise) { observe(promise, () => undefined, () => undefined); }
function error(kind) {
  const code = 'ZENON_DP_NATIVE_HTTPS_ORIGINAL_FUNDING_' + kind.toUpperCase(), e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code }); return FREEZE(e);
}
function fail(kind) { throw error(kind); }
