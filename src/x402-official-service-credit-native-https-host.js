import { types as utilTypes } from 'node:util';
import { createOfficialServiceCreditHttpsApplication } from './x402-official-service-credit-https-application.js';
import { createServiceCreditBoundedNodeHttpsServerFactory } from './service-credit-bounded-node-https-server-factory.js';
import { createServiceCreditNativeApplicationDeadlineOwner } from './service-credit-native-application-deadline-owner.js';

const APPLICATION = createOfficialServiceCreditHttpsApplication;
const SERVER = createServiceCreditBoundedNodeHttpsServerFactory;
const CLOCK = createServiceCreditNativeApplicationDeadlineOwner;
const NativePromise = Promise, THEN = NativePromise.prototype.then;
const FREEZE = Object.freeze, DESC = Object.getOwnPropertyDescriptor, PROTO = Object.getPrototypeOf;
const KEYS = Reflect.ownKeys, OWN = Object.hasOwn, APPLY = Reflect.apply, IS_PROXY = utilTypes.isProxy;
const IS_PROMISE = utilTypes.isPromise, PROMISE = NativePromise.prototype;
const LIMITS = FREEZE(['maxHeaderBytes','maxHeaderCount','maxConcurrentSockets','maxConnectionStarts',
  'maxConcurrentRequests','maxRequestStarts','tlsHandshakeDeadlineMs','headerDeadlineMs',
  'requestResponseDeadlineMs','idleSocketDeadlineMs','startDeadlineMs','closeGraceMs','metricsCounterLimit']);
const DEADLINES = FREEZE(['tlsHandshakeDeadlineMs','headerDeadlineMs','requestResponseDeadlineMs',
  'idleSocketDeadlineMs','startDeadlineMs','closeGraceMs']);

/**
 * Default-off native host for the actual single-origin x402/credit application.
 * Owns the actual bounded native server factory and native deadline runtime.
 * No injected HTTPS/timer/clock/SDK factory. The already-initialized SQL ledger
 * is BORROWED and is NEVER opened/initialized/migrated/closed by this host.
 * The payer V6 owner stays on the client side; no extra server-side payer DB.
 *
 * There is no implicit listener: only start() calls the actual app's start.
 * Close revokes host admission, waits for actual app close settlement FIRST,
 * then closes its deadline owner once. Unobservable app close leaves clocks
 * HELD; a late result cannot reopen the host or repair CLOSE_UNKNOWN.
 * Only clean actual child/clock settlements and zero tracked snapshots permit
 * a local borrowed-store handoff observation. UNKNOWN means KEEP_HELD.
 *
 * No grant activation, funding promotion, retry, signer, nonce, SDK PREPARE or
 * live/economic authority. Native intrinsics/trusted callbacks remain premises.
 * This source is not runtime, OS-drain, restart or production qualification.
 */
export async function createNativeOfficialServiceCreditHttpsApplication(configuration) {
  let official, service, transport, deadlines, clock = null, app = null, factory;
  try {
    if (arguments.length !== 1) fail('CONFIGURATION');
    const c = record(configuration, ['official','service','transport','deadlines']);
    official = record(c.official, ['requirement','resource','localFacilitator','validateChallenge',
      'reconcilePendingSettlement','maxPendingReconciliations','contextLimit']);
    service = record(c.service, ['store','execute','selectedDurationMs','admittedGrantId']);
    const t = record(c.transport, ['origin','generation','limits','bind','tlsMaterial']);
    const resource = record(official.resource, ['url','description','mimeType']);
    official = FREEZE({ ...official, resource });
    transport = FREEZE({ origin: t.origin, generation: record(t.generation, ['generationId','generationVersion']),
      limits: record(t.limits, LIMITS), bind: record(t.bind, ['host','port','exclusive']),
      tlsMaterial: record(t.tlsMaterial, ['key','cert']) });
    deadlines = record(c.deadlines, ['maxScheduleStarts','maxConcurrentTimers','maxDelayMs']);
    if (typeof transport.origin !== 'string' || resource.url !== transport.origin + '/paid')
      fail('CONFIGURATION');
    for (const key of LIMITS) {
      if (!Number.isSafeInteger(transport.limits[key]) || transport.limits[key] < 1) fail('CONFIGURATION');
    }
    if (!Number.isSafeInteger(service.selectedDurationMs) || service.selectedDurationMs < 1
        || !Number.isSafeInteger(deadlines.maxDelayMs)) fail('CONFIGURATION');
    for (const key of DEADLINES) {
      if (transport.limits[key] > deadlines.maxDelayMs) fail('CONFIGURATION');
    }
    if (service.selectedDurationMs > deadlines.maxDelayMs) fail('CONFIGURATION');
    // Existing factory captures/copies TLS material before the first await.
    factory = SERVER({ bind: transport.bind, tlsMaterial: transport.tlsMaterial });
    clock = CLOCK(deadlines);
    app = await APPLICATION({ official, service: { ...service, deadlineRuntime: clock.serviceRuntime },
      transport: { origin: transport.origin, generation: transport.generation, limits: transport.limits,
        deadlineRuntime: clock.ingressRuntime, httpsServerFactory: factory } });
  } catch (cause) {
    const causeCode = cause !== null && typeof cause === 'object' && !IS_PROXY(cause)
      ? DESC(cause, 'code') : undefined;
    const borrowedCleanupUnknown = causeCode && OWN(causeCode, 'value')
      && causeCode.value === 'OFFICIAL_X402_SERVICE_CREDIT_HTTPS_APPLICATION_CONSTRUCTION_CLOSE_UNCERTAIN';
    // The actual application constructor owns its pre-listener session cleanup.
    if (clock !== null) {
      try { await clock.close(); } catch { fail('CONSTRUCTION_CLOSE_UNKNOWN'); }
    }
    if (borrowedCleanupUnknown) fail('CONSTRUCTION_CLOSE_UNKNOWN');
    fail('CONSTRUCTION_UNAVAILABLE');
  } finally { configuration = null; official = null; service = null; transport = null; deadlines = null; factory = null; }
  const APP = app, CLOCK_OWNER = clock, START = APP.start, CLOSE = APP.close;
  app = null; clock = null;
  let phase = 'CREATED', unknown = false, startCell = null, closeCell = null;
  let applicationCloseOutcome = 'NOT_REQUESTED', deadlineCloseOutcome = 'NOT_REQUESTED';
  let deadlineCloseCalls = 0, handoff = false;

  function failStart() {
    unknown = true; handoff = false;
    if (phase === 'CLOSED') phase = 'CLOSE_UNKNOWN';
    else if (phase !== 'CLOSING' && phase !== 'CLOSE_UNKNOWN') phase = 'START_UNKNOWN';
    startCell.reject(error('START_UNAVAILABLE'));
  }
  const start = FREEZE(function start() {
    if (arguments.length !== 0) return rejected('INPUT');
    if (startCell !== null) return startCell.promise;
    if (phase !== 'CREATED') return rejected('CLOSED');
    startCell = capability(); phase = 'STARTING';
    try {
      const result = APPLY(START, APP, []);
      if (!observe(result, value => {
        try {
          const started = record(value, ['status']);
          if (started.status !== 'LISTENING' || phase !== 'STARTING') { failStart(); return; }
          phase = 'LISTENING'; startCell.resolve(FREEZE({ status: 'LISTENING' }));
        } catch { failStart(); }
      }, failStart)) failStart();
    } catch { failStart(); }
    return startCell.promise;
  });
  function finishClose(clean) {
    handoff = false;
    try {
      const a = APP.snapshot(), d = CLOCK_OWNER.snapshot(), i = a.ingress, r = a.router;
      handoff = clean && !unknown && applicationCloseOutcome === 'FULFILLED_CLOSED'
        && deadlineCloseOutcome === 'FULFILLED_VOID' && i.phase === 'CLOSED'
        && ['trackedSockets','trackedRequests','trackedHandlers','ownedTimers'].every(key => i[key] === 0)
        && r.phase === 'CLOSED' && r.activeOperations === 0 && r.pendingCloses === 0
        && r.serviceSessionClosed === true && r.uncertain === false
        && d.phase === 'CLOSED' && !d.unknown && d.activeTimers === 0 && d.deliveringCallbacks === 0;
    } catch { unknown = true; }
    if (!handoff) unknown = true;
    phase = unknown ? 'CLOSE_UNKNOWN' : 'CLOSED';
    if (unknown) closeCell.reject(error('CLOSE_UNKNOWN'));
    else closeCell.resolve(FREEZE({ status: 'CLOSED', borrowedStoreClosed: false,
      borrowedStoreHandoff: 'CLEAN_LOCAL_OWNER_CLOSE_OBSERVED', authority: 'NONE' }));
  }
  function closeDeadlines() {
    if (deadlineCloseCalls !== 0) { unknown = true; finishClose(false); return; }
    deadlineCloseCalls = 1; deadlineCloseOutcome = 'WAITING';
    try {
      const result = CLOCK_OWNER.close();
      if (!observe(result, value => {
        deadlineCloseOutcome = value === undefined ? 'FULFILLED_VOID' : 'INVALID_VALUE';
        if (value !== undefined) unknown = true;
        finishClose(value === undefined);
      }, () => { deadlineCloseOutcome = 'REJECTED'; unknown = true; finishClose(false); })) {
        deadlineCloseOutcome = 'UNOBSERVABLE'; unknown = true; finishClose(false);
      }
    } catch { deadlineCloseOutcome = 'THREW'; unknown = true; finishClose(false); }
  }
  const close = FREEZE(function close() {
    if (arguments.length !== 0) return rejected('INPUT');
    if (closeCell !== null) return closeCell.promise;
    closeCell = capability(); phase = 'CLOSING'; applicationCloseOutcome = 'WAITING';
    try {
      const result = APPLY(CLOSE, APP, []);
      if (!observe(result, value => {
        try {
          const ended = record(value, ['status']);
          if (ended.status !== 'CLOSED') throw error('CLOSE_UNKNOWN');
          applicationCloseOutcome = 'FULFILLED_CLOSED';
        } catch { applicationCloseOutcome = 'INVALID_VALUE'; unknown = true; }
        closeDeadlines();
      }, () => { applicationCloseOutcome = 'REJECTED'; unknown = true; closeDeadlines(); })) {
        // No trustworthy child settlement: do not cut off its closing clocks.
        applicationCloseOutcome = 'UNOBSERVABLE'; unknown = true; phase = 'CLOSE_UNKNOWN';
        closeCell.reject(error('CLOSE_UNKNOWN'));
      }
    } catch {
      applicationCloseOutcome = 'THREW'; unknown = true; phase = 'CLOSE_UNKNOWN';
      closeCell.reject(error('CLOSE_UNKNOWN'));
    }
    return closeCell.promise;
  });
  const snapshot = FREEZE(function snapshot() {
    if (arguments.length !== 0) fail('INPUT');
    const actual = APP.snapshot();
    return FREEZE({ profile: 'NATIVE_OFFICIAL_X402_SCOPED_HTTPS_HOST_SOURCE',
      phase, unknown, application: actual, ingress: actual.ingress, nativeDeadlines: CLOCK_OWNER.snapshot(),
      applicationCloseOutcome, deadlineCloseOutcome, deadlineCloseCalls,
      borrowedStoreClosed: false, borrowedStoreHandoff: handoff
        ? 'CLEAN_LOCAL_OWNER_CLOSE_OBSERVED' : 'KEEP_HELD',
      defaultEnabled: false, authority: 'NONE', nativeRuntimeQualified: false,
      fullP1: 'NOT_ESTABLISHED', serviceDelivery: 'NOT_ESTABLISHED' });
  });
  return FREEZE({ start, close, snapshot });
}
function record(value, fields) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || PROTO(value) !== Object.prototype || KEYS(value).length !== fields.length) fail('INPUT');
  const out = {};
  for (const key of fields) {
    const d = DESC(value, key);
    if (!d || !OWN(d, 'value') || !d.enumerable) fail('INPUT');
    Object.defineProperty(out, key, { value: d.value, enumerable: true });
  }
  return FREEZE(out);
}
function observe(value, yes, no) {
  if (!IS_PROMISE(value) || IS_PROXY(value) || PROTO(value) !== PROMISE || DESC(value, 'then') !== undefined)
    return false;
  const d = DESC(value, 'constructor');
  if (d !== undefined && (!OWN(d, 'value') || d.value !== NativePromise
      || d.enumerable !== false || d.writable !== false || d.configurable !== false)) return false;
  APPLY(THEN, value, [yes, no]); return true;
}
function capability() {
  let resolve, reject;
  const promise = new NativePromise((yes, no) => { resolve = yes; reject = no; });
  Object.defineProperty(promise, 'constructor', { value: NativePromise });
  return { promise, resolve, reject };
}
function rejected(kind) { const c = capability(); c.reject(error(kind)); return c.promise; }
function error(kind) {
  const code = 'OFFICIAL_X402_NATIVE_HTTPS_HOST_' + kind, e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code }); return FREEZE(e);
}
function fail(kind) { throw error(kind); }

