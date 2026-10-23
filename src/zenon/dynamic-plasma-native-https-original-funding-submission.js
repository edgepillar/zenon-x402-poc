import { types as utilTypes } from 'node:util';
import { captureZenonDynamicPlasmaBoundedOriginalFundingConfiguration } from './dynamic-plasma-bounded-original-funding-configuration.js';
import { createBoundedNonceDynamicPlasmaMaterialExchange } from './dynamic-plasma-bounded-material-exchange.js';
import { createRetainedDynamicPlasmaHttpsReadSession } from './dynamic-plasma-retained-https-read-session.js';
import { createZenonDynamicPlasmaOriginalFundingSubmissionV3 } from './dynamic-plasma-original-funding-submission.js';
import { createFundingPostNativeHttpsTransport } from '../service-credit-funding-post-native-https-transport.js';

const CAPTURE = captureZenonDynamicPlasmaBoundedOriginalFundingConfiguration;
const MATERIAL = createBoundedNonceDynamicPlasmaMaterialExchange;
const READS = createRetainedDynamicPlasmaHttpsReadSession, SUBMIT = createZenonDynamicPlasmaOriginalFundingSubmissionV3;
const FUNDING = createFundingPostNativeHttpsTransport, FREEZE = Object.freeze;
const DESC = Object.getOwnPropertyDescriptor, PROTO = Object.getPrototypeOf, KEYS = Reflect.ownKeys;
const OWN = Object.hasOwn, APPLY = Reflect.apply, IS_PROXY = utilTypes.isProxy, IS_PROMISE = utilTypes.isPromise;
const NativePromise = Promise, PROMISE = NativePromise.prototype, THEN = PROMISE.then;

/**
 * SOURCE-ONLY full native read AND funding-POST selection, default off.
 * Builds actual bounded work, actual three-owner RPC read session, actual native
 * TLS POST transport and actual V3/SDK/V6 owner. No fetch/request/owner factory
 * injection, key production, alternate preflight/store, retry or default cutover.
 *
 * The already supplied original challenge is used; this selection allows ONE
 * original funding POST, not an extra challenge round trip or replay.
 * Resource URLs must match and the transport deadline may not exceed the
 * existing payer deadline. All methods on the returned actual V3 owner are
 * preserved directly, including explicit pins/commit and cached close Promise.
 *
 * V3 closes its operation admission before the combined read-close capability
 * requests both native sides to close. Both child close attempts are started
 * independently, even if one throws. Only clean read close and a clean native
 * POST owner allow V3 to enter the actual payer/store close after operation join.
 * Any uncertainty vetoes that entry permanently; original bytes and store stay
 * HELD. This does not cancel wallet CPU or establish OS/drain/restart proof.
 *
 * Construction performs no native request, search, signing or SQL. Failure asks
 * constructed inert owners to close, without claiming cleanup. A consumed store
 * claim stays consumed; caller retains store close/quarantine on refusal.
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
    const session = joinedSession(reads, funding);
    return SUBMIT({ preparerOptions: { readOptions: session.readOptions, materialExchange,
      materialWaitMs: selected.materialWaitMs, wallet: selected.wallet }, store: selected.store,
      fundingResourceUrl: selected.fundingResourceUrl, deadlineMs: selected.deadlineMs,
      fetchImpl: funding.fetchImpl, readSession: session });
  } catch {
    for (const owner of [reads, funding]) if (owner !== null) {
      try { prehandle(APPLY(owner.close, undefined, [])); } catch {}
    }
    fail('configuration_rejected');
  }
}
function joinedSession(reads, funding) {
  let closing = null, unknown = false, readOutcome = 'NOT_REQUESTED', fundingOutcome = 'NOT_REQUESTED';
  const close = FREEZE(function close() {
    if (arguments.length !== 0) return rejected('input_rejected');
    if (closing !== null) return closing;
    const cell = capability(); closing = cell.promise; // Before either child callback.
    let readSettled = false, fundingSettled = false;
    function hold() { unknown = true; cell.reject(error('read_or_funding_close_unknown')); }
    function finish() {
      if (unknown || !readSettled || !fundingSettled) return;
      try {
        const state = funding.snapshot();
        if (state.phase !== 'CLOSED' || state.unknown || state.trackedRequests !== 0
            || state.trackedSockets !== 0 || state.ownedTimers !== 0) { hold(); return; }
        cell.resolve(undefined); // V3's existing read-close contract, no authority.
      } catch { hold(); }
    }
    // No await/short-circuit between independent native close attempts.
    try {
      const p = APPLY(reads.close, undefined, []);
      if (!observe(p, value => {
        readSettled = true; readOutcome = value === undefined ? 'CLOSED' : 'INVALID_VALUE';
        if (value !== undefined) hold(); else finish();
      }, () => { readSettled = true; readOutcome = 'REJECTED'; hold(); })) {
        readOutcome = 'UNOBSERVABLE'; hold();
      }
    } catch { readOutcome = 'THREW'; hold(); }
    try {
      const p = APPLY(funding.close, undefined, []);
      if (!observe(p, value => {
        fundingSettled = true;
        const d = value !== null && typeof value === 'object' && !IS_PROXY(value) ? DESC(value, 'phase') : null;
        fundingOutcome = d && OWN(d, 'value') && d.value === 'CLOSED' ? 'CLOSED' : 'INVALID_VALUE';
        if (fundingOutcome !== 'CLOSED') hold(); else finish();
      }, () => { fundingSettled = true; fundingOutcome = 'REJECTED'; hold(); })) {
        fundingOutcome = 'UNOBSERVABLE'; hold();
      }
    } catch { fundingOutcome = 'THREW'; hold(); }
    return closing;
  });
  const inspect = FREEZE(function inspect() {
    if (arguments.length !== 0) fail('input_rejected');
    return FREEZE({ reads: reads.inspect(), funding: funding.snapshot(), unknown,
      readOutcome, fundingOutcome, authority: 'NONE', nativeGraphQualified: false });
  });
  return FREEZE({ readOptions: reads.readOptions, close, inspect });
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
function capability() {
  let resolve, reject;
  const promise = new NativePromise((yes, no) => { resolve = yes; reject = no; });
  Object.defineProperty(promise, 'constructor', { value: NativePromise });
  APPLY(THEN, promise, [() => undefined, () => undefined]);
  return { promise, resolve, reject };
}
function prehandle(promise) { observe(promise, () => undefined, () => undefined); }
function error(kind) {
  const code = 'ZENON_DP_NATIVE_HTTPS_ORIGINAL_FUNDING_' + kind.toUpperCase(), e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code }); return FREEZE(e);
}
function fail(kind) { throw error(kind); }
function rejected(kind) { const c = capability(); c.reject(error(kind)); return c.promise; }
