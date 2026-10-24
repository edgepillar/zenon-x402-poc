import { types as utilTypes } from 'node:util';
import { createServiceCreditNativeHttpsClientTransport } from './service-credit-native-https-client-transport.js';
import { openOfficialV6GuardedFundingPostOriginalPaymentClient } from './x402-official-v6-original-payment-client.js';
import { captureFundingPostCheckpointRoute } from './x402-funding-post-checkpoint-route.js';
import { snapshotOriginalServiceRequestCustodyPolicy } from './service-credit-original-request-custody-contract.js';
import { createOriginalFundingBoundedReadCloseCoordinator } from './zenon/dynamic-plasma-original-funding-bounded-read-close.js';

const TRANSPORT = createServiceCreditNativeHttpsClientTransport;
const OPEN = openOfficialV6GuardedFundingPostOriginalPaymentClient;
const ROUTE = captureFundingPostCheckpointRoute, POLICY = snapshotOriginalServiceRequestCustodyPolicy;
const JOIN = createOriginalFundingBoundedReadCloseCoordinator;
const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, PROTO = Object.getPrototypeOf;
const KEYS = Reflect.ownKeys, NAMES = Object.getOwnPropertyNames, OWN = Object.hasOwn, APPLY = Reflect.apply;
const IS_PROXY = utilTypes.isProxy, IS_PROMISE = utilTypes.isPromise;
const NativePromise = Promise, PROMISE = NativePromise.prototype;
const THEN = DESC(PROMISE, 'then'), CTOR = DESC(PROMISE, 'constructor');
const SPECIES = DESC(NativePromise, Symbol.species);

/**
 * Default-OFF SOURCE-ONLY composition of the ACTUAL native HTTPS client, actual
 * official POST-original client and ONE actual existing guarded V6 store owner.
 * No injected transport/SDK/store factory. Construction opens the existing DB
 * (may advance owner_epoch), not a socket, missing DB or second payer.
 *
 * POST /funding is the retained checkpoint profile, NOT a new funding sender.
 * restoreOriginalPayment only revalidates the exact original bytes via SDK DATA.
 * Only explicit submitOriginal uses native HTTPS /service-credit/v1/execute.
 * It still requires the selected grant and original proof/intent/quarantine.
 * No funding resend, signer, nonce, grant activation or automatic recovery.
 *
 * close revokes public admission first and immediately requests native stop.
 * A bounded cooperative join waits for native close and the current operation.
 * Only then may the actual official/V6 close run. Its private native/budget guard
 * runs AGAIN immediately before/after actual store.close, after all child awaits.
 * A native/budget refusal holds the actual root slot, with NO force-close,
 * retry or reopen. Post-return UNKNOWN cannot deny/undo a returned DB close.
 *
 * A cached fulfilled close Promise is historical, not a current handoff permit:
 * snapshot can report later native UNKNOWN without rewriting that Promise.
 * This source graph has NOT run with TLS/SQLite/SDK. No physical-drain, full P1,
 * installed namespace, restart, pilot or production qualification is inferred.
 */
export async function openNativeOfficialV6FundingPostOriginalPaymentClient(configuration) {
  if (arguments.length !== 1 || !invariant()) fail('configuration_rejected');
  let native = null, client = null, joined = null, constructing = true;
  let payerOptions, originalPayment, official, transportOptions, policy, budget;
  let lifecycle = 'OPEN', pending = null, closing = null, historicalClose = 'NOT_REQUESTED';
  function nativeView() { return NATIVE_SNAPSHOT(); }
  function cleanNative() {
    try { return closedNativeView(nativeView()); } catch { return false; }
  }
  function unusedNative() {
    try {
      const n = nativeView(), c = data(n, 'close'), release = data(c, 'localMaterialRelease');
      return data(n, 'requestStarts') === 0 && data(n, 'unknown') === false && zeroOwned(n)
        && (closedNativeView(n) || data(n, 'phase') === 'OPEN'
          && data(c, 'phase') === 'OPEN' && data(c, 'unknown') === false
          && data(c, 'closeRequested') === false && data(c, 'observing') === false
          && data(c, 'closePromiseOutcome') === 'NOT_REQUESTED'
          && data(release, 'attempts') === 0 && data(release, 'outcome') === 'NOT_ATTEMPTED');
    } catch { return false; }
  }
  // This capability is never accepted from caller DATA or exposed publicly.
  const actualStoreCloseGuard = F(function actualStoreCloseGuard() {
    if (!invariant()) return false;
    if (constructing) return unusedNative(); // No request has been exposed.
    return joined !== null && joined.canCloseFunding() && cleanNative() && joined.canCloseFunding();
  });
  let NATIVE_CLOSE, NATIVE_SNAPSHOT, CLIENT_CLOSE, CLIENT_SNAPSHOT;
  function normalizedNativeClose() {
    const c = capability();
    try {
      observe(APPLY(NATIVE_CLOSE, native, []), value => {
        try {
          if (data(value, 'phase') !== 'CLOSED' || !zeroOwned(value) || !cleanNative())
            fail('close_unknown');
          c.resolve(undefined);
        } catch { c.reject(error('close_unknown')); }
      }, () => c.reject(error('close_unknown')));
    } catch { c.reject(error('close_unknown')); }
    return c.promise;
  }
  function normalizedClientClose() {
    const c = capability();
    try {
      observe(APPLY(CLIENT_CLOSE, client, []), value => {
        try {
          const s = APPLY(CLIENT_SNAPSHOT, client, []), p = data(s, 'payer');
          const r = data(p, 'resource'), g = data(p, 'nativeClose');
          if (value !== undefined || data(s, 'lifecycle') !== 'CLOSED'
              || data(r, 'phase') !== 'RELEASED' || data(r, 'slotHeld') !== false
              || data(r, 'storeCloseAttempts') !== 1 || data(r, 'storeCloseOutcome') !== 'RETURNED'
              || data(g, 'clean') !== true || data(g, 'resourceCloseReturned') !== true || !cleanNative())
            fail('close_unknown');
          c.resolve(F({ status: 'CLOSED' }));
        } catch { c.reject(error('close_unknown')); }
      }, () => c.reject(error('close_unknown')));
    } catch { c.reject(error('close_unknown')); }
    return c.promise;
  }
  try {
    const c = exact(configuration, ['payerOptions', 'originalPayment', 'official', 'transportOptions']);
    payerOptions = exact(c.payerOptions, ['databasePath', 'allowedRoot', 'fundingResourceUrl',
      'custodyPolicy', 'selectedGrantId', 'deadlineMs']);
    originalPayment = exact(c.originalPayment, ['resourceUrl', 'serializedCheckpoint', 'expectedPins']);
    official = exact(c.official, ['validateChallenge', 'assetInfo', 'contextLimit']);
    transportOptions = exact(c.transportOptions, ['origin', 'ca', 'maxRequestStarts', 'maxConcurrentRequests',
      'requestDeadlineMs', 'handshakeDeadlineMs', 'closeGraceMs']);
    const route = ROUTE(originalPayment.resourceUrl);
    policy = POLICY(payerOptions.custodyPolicy, payerOptions.fundingResourceUrl);
    budget = transportOptions.closeGraceMs;
    if (route.resourceUrl !== payerOptions.fundingResourceUrl
        || route.resourceUrl !== transportOptions.origin + '/funding'
        || policy.serviceResourceUrl !== transportOptions.origin + '/service-credit/v1/execute'
        || !Number.isSafeInteger(payerOptions.deadlineMs) || payerOptions.deadlineMs < 1
        || payerOptions.deadlineMs > 60000 || Object.is(payerOptions.deadlineMs, -0)
        || !Number.isSafeInteger(budget) || budget < 1 || budget > 1000
        || budget > payerOptions.deadlineMs || transportOptions.maxConcurrentRequests !== 1
        || transportOptions.maxRequestStarts > policy.maxRequests
        || transportOptions.requestDeadlineMs > payerOptions.deadlineMs) fail('configuration_rejected');
    native = TRANSPORT(transportOptions);
    NATIVE_CLOSE = native.close; NATIVE_SNAPSHOT = native.snapshot;
    client = await OPEN({ payerOptions: { ...payerOptions, custodyPolicy: policy,
      requestImpl: native.requestImpl, nativeResourceCloseGuard: actualStoreCloseGuard }, originalPayment, official });
    CLIENT_CLOSE = client.close; CLIENT_SNAPSHOT = client.snapshot;
    joined = JOIN(F({
      startReadClose: F(function startReadClose() { return normalizedNativeClose(); }),
      snapshotOperation: F(function snapshotOperation() { return pending; }),
      closeFunding: F(function closeFunding() { return normalizedClientClose(); }),
      canCloseFunding: F(function canCloseFunding() { return cleanNative(); }),
    }), budget);
    if (!invariant() || !unusedNative()) fail('construction_close_unknown');
  } catch (caught) {
    let unknown = constructionHeld(caught);
    // Keep the guard in construction mode while cleaning only unpublished
    // owners. Never reach into a hidden HELD root or reopen a DB on failure.
    if (native !== null) {
      try { await normalizedNativeClose(); } catch { unknown = true; }
    }
    if (client !== null) {
      try { await normalizedClientClose(); } catch { unknown = true; }
    }
    fail(unknown ? 'construction_close_unknown' : 'configuration_rejected');
  } finally {
    configuration = null; payerOptions = null; originalPayment = null; official = null;
    transportOptions = null; policy = null;
  }

  function live() {
    if (!invariant() || lifecycle !== 'OPEN' || closing !== null) return false;
    try {
      const s = nativeView();
      return data(s, 'phase') === 'OPEN' && data(s, 'unknown') === false;
    } catch { return false; }
  }
  function launch(name, args) {
    if (args.length !== 1 || !live() || pending !== null) return rejected('operation_unavailable');
    const c = capability(); pending = c.promise;
    observe(c.promise, () => { if (pending === c.promise) pending = null; },
      () => { if (pending === c.promise) pending = null; });
    try {
      observe(APPLY(client[name], client, args), value => {
        // A close begun during an async SDK/service operation cannot emit a late
        // restored header or a late application success through this facade.
        if (!live()) c.reject(error('operation_unavailable'));
        else c.resolve(value);
      }, () => c.reject(error('operation_unavailable')));
    } catch { c.reject(error('operation_unavailable')); }
    return c.promise;
  }
  function read(name, args, arity) {
    if (args.length !== arity || !live() || pending !== null) fail('read_unavailable');
    return APPLY(client[name], client, args);
  }
  const close = F(function close() {
    if (arguments.length !== 0) return rejected('input_rejected');
    if (closing !== null) return closing;
    const c = capability();
    closing = c.promise; lifecycle = 'CLOSING'; historicalClose = 'PENDING';
    function closeUnknown() {
      if (historicalClose !== 'PENDING') return;
      lifecycle = 'CLOSE_UNKNOWN'; historicalClose = 'REJECTED'; c.reject(error('close_unknown'));
    }
    try {
      observe(joined.promise, value => {
        if (historicalClose !== 'PENDING') return;
        try {
          if (data(value, 'lifecycle', true) !== 'CLOSED' || !cleanNative()) fail('close_unknown');
          lifecycle = 'CLOSED'; historicalClose = 'FULFILLED_UNDEFINED'; c.resolve(undefined);
        } catch { closeUnknown(); }
      }, closeUnknown);
    } catch { closeUnknown(); }
    // Even an observation/intrinsic refusal must attempt owned native stop.
    // A later join completion cannot repair an already-rejected public close.
    try { joined.start(); } catch { closeUnknown(); }
    return closing;
  });
  const snapshot = F(function snapshot() {
    if (arguments.length !== 0 || !invariant()) fail('input_rejected');
    const n = nativeView();
    // Only downgrade the current view. No second close or replacement Promise.
    if (lifecycle === 'CLOSED' && !closedNativeView(n)) lifecycle = 'CLOSE_UNKNOWN';
    return F({ profile: 'NATIVE_OFFICIAL_X402_FUNDING_POST_ORIGINAL_V6_CLIENT',
      lifecycle, historicalClose, operationActive: pending !== null,
      native: n, client: APPLY(CLIENT_SNAPSHOT, client, []), closeJoin: joined.inspect(),
      defaultEnabled: false, fundingPostTransport: 'NOT_PROVIDED', authority: 'NONE',
      serviceDelivery: 'NOT_ESTABLISHED', fullP1: 'NOT_ESTABLISHED',
      nativeResourceCleanup: 'NOT_QUALIFIED', automaticRetry: false });
  });
  const facade = F({
    restoreOriginalPayment: F(function restoreOriginalPayment(...args) { return launch('restoreOriginalPayment', args); }),
    submitOriginal: F(function submitOriginal(...args) { return launch('submitOriginal', args); }),
    readOriginal: F(function readOriginal(...args) { return read('readOriginal', args, 1); }),
    readOriginalRecoveryState: F(function readOriginalRecoveryState(...args) { return read('readOriginalRecoveryState', args, 1); }),
    readOriginalRecoveryKeys: F(function readOriginalRecoveryKeys(...args) { return read('readOriginalRecoveryKeys', args, 0); }),
    readOriginalPaymentCheckpoint: F(function readOriginalPaymentCheckpoint(...args) {
      return read('readOriginalPaymentCheckpoint', args, 1);
    }),
    snapshot, close,
  });
  constructing = false;
  return facade;
}
function data(value, field, allowNullPrototype = false) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || (PROTO(value) !== Object.prototype && !(allowNullPrototype && PROTO(value) === null))
      || !Object.isFrozen(value)) fail('observation_rejected');
  const d = DESC(value, field);
  if (!d || !OWN(d, 'value') || !d.enumerable) fail('observation_rejected');
  return d.value;
}
function zeroOwned(value) {
  return data(value, 'trackedRequests') === 0 && data(value, 'trackedSockets') === 0 && data(value, 'ownedTimers') === 0;
}
function closedNativeView(value) {
  if (!zeroOwned(value) || data(value, 'phase') !== 'CLOSED' || data(value, 'unknown') !== false) return false;
  const c = data(value, 'close'), counts = data(c, 'lastObservedCounts'), released = data(c, 'localMaterialRelease');
  return data(c, 'phase') === 'CLOSED' && data(c, 'unknown') === false
    && data(c, 'closeRequested') === true && data(c, 'closePromiseOutcome') === 'CLOSED'
    && data(c, 'observing') === false && data(c, 'quiescenceObserved') === true
    && data(counts, 'requests') === 0 && data(counts, 'sockets') === 0 && data(counts, 'timers') === 0
    && data(released, 'attempts') === 1 && data(released, 'outcome') === 'RETURNED';
}
function exact(value, fields) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || PROTO(value) !== Object.prototype || KEYS(value).length !== fields.length) fail('configuration_rejected');
  const out = {};
  for (const name of fields) {
    const d = DESC(value, name);
    if (!d || !OWN(d, 'value') || !d.enumerable) fail('configuration_rejected');
    Object.defineProperty(out, name, { value: d.value, enumerable: true });
  }
  return out;
}
function constructionHeld(value) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || PROTO(value) !== TypeError.prototype) return false;
  const d = DESC(value, 'code');
  return d !== undefined && OWN(d, 'value') && (d.value === 'x402_official_v6_original_payment_client_construction_close_unknown'
    || d.value === 'native_official_v6_funding_post_client_construction_close_unknown');
}
function same(actual, expected) {
  if (!actual || !expected || KEYS(actual).length !== KEYS(expected).length) return false;
  return KEYS(expected).every(k => OWN(actual, k) && actual[k] === expected[k]);
}
function invariant() {
  return DESC(Object.prototype, 'then') === undefined && DESC(Object.prototype, 'toJSON') === undefined
    && same(DESC(PROMISE, 'then'), THEN) && same(DESC(PROMISE, 'constructor'), CTOR)
    && same(DESC(NativePromise, Symbol.species), SPECIES);
}
function safe(value) {
  if (!invariant() || !IS_PROMISE(value) || IS_PROXY(value) || PROTO(value) !== PROMISE) return false;
  const names = NAMES(value);
  if (names.length === 0) return true;
  if (names.length !== 1 || names[0] !== 'constructor') return false;
  const d = DESC(value, 'constructor');
  return d && OWN(d, 'value') && d.value === NativePromise
    && !d.enumerable && !d.writable && !d.configurable;
}
function observe(value, accepted, refused) {
  if (!safe(value)) fail('observation_rejected');
  const bridge = APPLY(THEN.value, value, [accepted, refused]);
  if (!safe(bridge) || !safe(APPLY(THEN.value, bridge, [discard, discard]))) fail('observation_rejected');
}
function capability() {
  let resolve, reject;
  const promise = new NativePromise((yes, no) => { resolve = yes; reject = no; });
  Object.defineProperty(promise, 'constructor', { value: NativePromise });
  APPLY(THEN.value, promise, [discard, discard]);
  return { promise, resolve, reject };
}
function rejected(kind) { const c = capability(); c.reject(error(kind)); return c.promise; }
function error(kind) {
  const code = 'native_official_v6_funding_post_client_' + kind, e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code });
  return F(e);
}
function fail(kind) { throw error(kind); }
function discard() {}

