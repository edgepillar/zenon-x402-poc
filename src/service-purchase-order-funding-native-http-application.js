// Real opt-in HTTP/SQLite/timer wiring. Syntax checks do not qualify native I/O.
import { types } from 'node:util';
import { capturePurchasedOrderPayment } from './service-purchase-order-funding.js';
import { createPurchasedOrderFundingNativeApplication } from './service-purchase-order-funding-native-application.js';
import {
  capturePurchasedOrderFundingHttpSelection, bindPurchasedOrderFundingHttpApplication,
} from './service-purchase-order-funding-http-application.js';
import { createServiceCreditBoundedHttpsIngressOwner } from './service-credit-bounded-https-ingress-owner.js';
import { captureServiceCreditBoundedHttpsIngressLimits } from './service-credit-bounded-https-ingress-limits.js';
import { createServiceCreditNativeApplicationDeadlineOwner } from './service-credit-native-application-deadline-owner.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, NP = Promise, PP = NP.prototype, THEN = PP.then;
const BASE = [D(PP, 'then'), D(PP, 'constructor'), D(NP, Symbol.species)];
const PURCHASE = ['termsJson', 'termsDigest', 'paymentCheckpointJson', 'paymentPinsJson', 'fundingContextJson'];
function error(suffix) {
  const code = 'ORDER_FUNDING_NATIVE_HTTP_APPLICATION_' + suffix, e = new TypeError(code);
  Object.defineProperties(e, { code: { value: code, enumerable: true }, stack: { value: 'TypeError: ' + code } }); return F(e);
}
function fail(suffix = 'INPUT_REJECTED') { throw error(suffix); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail();
  const result = {};
  for (const name of names) { const d = D(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); result[name] = d.value; }
  return result;
}
function invariant() {
  return [D(PP, 'then'), D(PP, 'constructor'), D(NP, Symbol.species)].every((v, i) => {
    const b = BASE[i]; return v && Reflect.ownKeys(v).length === Reflect.ownKeys(b).length
      && Reflect.ownKeys(b).every(k => Object.hasOwn(v, k) && v[k] === b[k]);
  });
}
function pending() {
  let resolve, reject; const promise = new NP((a, b) => { resolve = a; reject = b; });
  Object.defineProperty(promise, 'constructor', { value: NP }); Reflect.apply(THEN, promise, [undefined, () => {}]); return { promise, resolve, reject };
}
function observe(promise, yes, no) {
  try {
    if (!invariant() || !types.isPromise(promise) || types.isProxy(promise) || Object.getPrototypeOf(promise) !== PP || D(promise, 'then')) fail('PROMISE_UNKNOWN');
    const d = D(promise, 'constructor');
    if (!d) Object.defineProperty(promise, 'constructor', { value: NP }); else if (!Object.hasOwn(d, 'value') || d.value !== NP) fail('PROMISE_UNKNOWN');
    Reflect.apply(THEN, promise, [value => invariant() ? yes(value) : no(error('PROMISE_UNKNOWN')), no]);
  } catch { no(error('PROMISE_UNKNOWN')); }
}

/**
 * One existing original order on the actual bounded native HTTPS ingress.
 * Startup retains its independently pinned payment before listener start.
 * Fixed factories construct the real receipt SQLite store, native deadline
 * owners and HTTP binding. The caller supplies its dedicated configured DB
 * and trusted TLS/server factory, and owns physical DB close, storage admission
 * and actual authentication of the read-only funding verifier. No SDK, wallet,
 * funding sender, grant activation, service executor or compensation port exists.
 * The previous fresh-intake/service profile and default wiring are unchanged.
 */
export function createPurchasedOrderFundingNativeHttpApplication(options) {
  if (arguments.length !== 1 || !invariant()) fail();
  const c = fields(options, ['database', 'databaseMode', 'limits', 'purchaseHttp', 'verifyFundingEvidence', 'transport']);
  const purchaseHttp = capturePurchasedOrderFundingHttpSelection(c.purchaseHttp);
  const original = capturePurchasedOrderPayment(...PURCHASE.map(k => purchaseHttp.selection.purchase[k]));
  const t = fields(c.transport, ['origin', 'generation', 'limits', 'deadlineLimits', 'httpsServerFactory']);
  const generation = F(fields(t.generation, ['generationId', 'generationVersion']));
  const ingressLimits = captureServiceCreditBoundedHttpsIngressLimits(t.limits);
  const timerLimits = F(fields(t.deadlineLimits, ['maxScheduleStarts', 'maxConcurrentTimers', 'maxDelayMs']));
  if (ingressLimits === null || t.origin !== new URL(original.verifierContext.resourceUrl).origin
      || typeof t.httpsServerFactory !== 'function' || types.isProxy(t.httpsServerFactory) || !Object.isFrozen(t.httpsServerFactory)
      || timerLimits.maxDelayMs < Math.max(ingressLimits.startDeadlineMs, ingressLimits.closeGraceMs, ingressLimits.requestResponseDeadlineMs,
        ingressLimits.idleSocketDeadlineMs, ingressLimits.tlsHandshakeDeadlineMs, ingressLimits.headerDeadlineMs)) fail();
  const deadlines = createServiceCreditNativeApplicationDeadlineOwner(timerLimits);
  const order = createPurchasedOrderFundingNativeApplication({ database: c.database, databaseMode: c.databaseMode, limits: c.limits,
    selection: purchaseHttp.selection, verifyFundingEvidence: c.verifyFundingEvidence });
  const binding = bindPurchasedOrderFundingHttpApplication(purchaseHttp, order);
  const ingress = createServiceCreditBoundedHttpsIngressOwner({ origin: t.origin, requestTargets: F(['/funding']), generation,
    limits: ingressLimits, downstream: binding.downstream, deadlineRuntime: deadlines.ingressRuntime, httpsServerFactory: t.httpsServerFactory });
  let startRequested = false, startupComplete = false, starting = null, closed = false, held = false, closing = null;
  let appClose = 'NOT_REQUESTED', ingressClose = 'NOT_REQUESTED', timerClose = 'NOT_REQUESTED', closeOutcome = 'NOT_REQUESTED';
  const start = F(function start() {
    if (arguments.length !== 0) fail(); if (closed || held || startRequested) fail('UNAVAILABLE');
    startRequested = true; starting = pending();
    try {
      binding.start(); if (closed || held) fail('STARTUP_UNKNOWN');
      observe(ingress.start(), value => {
        let listening = false; try { listening = Object.isFrozen(value) && fields(value, ['status']).status === 'LISTENING'; } catch {}
        if (!listening || closed || held) { held = true; starting.reject(error('STARTUP_UNKNOWN')); return; }
        startupComplete = true; starting.resolve(undefined);
      }, () => { held = true; starting.reject(error('STARTUP_UNKNOWN')); });
    } catch { held = true; starting.reject(error('STARTUP_UNKNOWN')); }
    return starting.promise;
  });
  function finishClose() {
    if (closing === null || closeOutcome !== 'PENDING' || ['NOT_REQUESTED', 'PENDING'].includes(appClose) || ['NOT_REQUESTED', 'PENDING'].includes(ingressClose)) return;
    if (appClose !== 'DRAINED' || ingressClose !== 'DRAINED') {
      held = true; closeOutcome = 'REJECTED'; closing.reject(error('CLOSE_UNKNOWN')); return;
    }
    if (timerClose === 'NOT_REQUESTED') {
      const view = ingress.snapshotMetrics();
      if (view.phase !== 'CLOSED' || view.ownedTimers !== 0 || view.trackedSockets !== 0 || view.trackedRequests !== 0 || view.trackedHandlers !== 0) {
        held = true; closeOutcome = 'REJECTED'; closing.reject(error('CLOSE_UNKNOWN')); return;
      }
      timerClose = 'PENDING';
      try { observe(deadlines.close(), value => {
        const v = deadlines.snapshot();
        timerClose = value === undefined && v.phase === 'CLOSED' && v.unknown === false && v.activeTimers === 0 && v.deliveringCallbacks === 0 ? 'DRAINED' : 'UNKNOWN';
        finishClose();
      }, () => { timerClose = 'UNKNOWN'; finishClose(); }); }
      catch { timerClose = 'UNKNOWN'; }
    }
    if (timerClose === 'PENDING') return;
    if (timerClose !== 'DRAINED' || held) { held = true; closeOutcome = 'REJECTED'; closing.reject(error('CLOSE_UNKNOWN')); }
    else { closeOutcome = 'FULFILLED_UNDEFINED'; closing.resolve(undefined); }
  }
  const close = F(function close() {
    if (arguments.length !== 0) fail(); if (closing !== null) return closing.promise;
    closing = pending(); closed = true; closeOutcome = 'PENDING';
    if (starting !== null && !startupComplete) { held = true; starting.reject(error('STARTUP_UNKNOWN')); }
    appClose = ingressClose = 'PENDING';
    try { observe(binding.close(), value => { appClose = value === undefined ? 'DRAINED' : 'UNKNOWN'; finishClose(); }, () => { appClose = 'UNKNOWN'; finishClose(); }); }
    catch { appClose = 'UNKNOWN'; held = true; }
    try { observe(ingress.close(), value => {
      let stopped = false; try { stopped = Object.isFrozen(value) && fields(value, ['status']).status === 'CLOSED'; } catch {}
      ingressClose = stopped ? 'DRAINED' : 'UNKNOWN'; finishClose();
    }, () => { ingressClose = 'UNKNOWN'; finishClose(); }); }
    catch { ingressClose = 'UNKNOWN'; held = true; }
    finishClose(); return closing.promise;
  });
  const exportRecoveryRecord = F(function exportRecoveryRecord() { if (arguments.length !== 0) fail(); return binding.exportRecoveryRecord(); });
  const snapshot = F(function snapshot() {
    if (arguments.length !== 0) fail();
    const application = binding.snapshot();
    return F({ profile: 'PURCHASE_ORDER_FUNDING_NATIVE_HTTP_V1', phase: held || application.phase === 'HELD' ? 'HELD'
      : closed ? closeOutcome === 'FULFILLED_UNDEFINED' ? 'CLOSED' : 'CLOSING' : startupComplete ? 'OPEN' : 'CREATED',
      startRequested, startupComplete, closeRequested: closed, closeOutcome, appClose, ingressClose, timerClose,
      application, ingress: ingress.snapshotMetrics(), deadlineOwner: deadlines.snapshot(),
      existingOriginalOnly: true, defaultFreshIntakeChanged: false, nativeQualified: false, physicalDatabaseClose: 'CALLER_OWNED_NOT_QUALIFIED',
      fundingSend: false, grantActivation: 'NOT_ESTABLISHED', serviceDelivery: 'NOT_ESTABLISHED', authority: 'NONE' });
  });
  return F({ start, close, exportRecoveryRecord, snapshot });
}
