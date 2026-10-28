// Real opt-in bindings. Syntax or DATA-core tests do not qualify this entry.
import { types } from 'node:util';
import {
  createNewPurchasedOrderFundingSqliteStore, openExistingPurchasedOrderFundingSqliteStore,
} from './service-purchase-order-funding-sqlite-store.js';
import { capturePurchasedOrderPayment } from './service-purchase-order-funding.js';
import { createServiceCreditNativeApplicationDeadlineOwner } from './service-credit-native-application-deadline-owner.js';
import {
  capturePurchasedOrderFundingApplicationSelection, capturePurchasedOrderFundingApplicationRecoveryRecord,
  createPurchasedOrderFundingApplicationCore,
} from './service-purchase-order-funding-application-core.js';

const F = Object.freeze, NP = Promise, PP = NP.prototype, THEN = PP.then, NOW = Date.now, D = Object.getOwnPropertyDescriptor;
const PROMISE_DESCRIPTORS = [D(PP, 'then'), D(PP, 'constructor'), D(NP, Symbol.species)];
const PURCHASE = ['termsJson', 'termsDigest', 'paymentCheckpointJson', 'paymentPinsJson', 'fundingContextJson'];
function error(suffix) {
  const code = 'ORDER_FUNDING_NATIVE_APPLICATION_' + suffix, e = new TypeError(code);
  Object.defineProperties(e, { code: { value: code, enumerable: true }, stack: { value: 'TypeError: ' + code } }); return F(e);
}
function fail(suffix = 'INPUT_REJECTED') { throw error(suffix); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail();
  const result = {};
  for (const k of names) { const d = Object.getOwnPropertyDescriptor(value, k); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); result[k] = d.value; }
  return result;
}
function limits(value) {
  const c = fields(value, ['maxRecords']); if (!Number.isSafeInteger(c.maxRecords) || c.maxRecords < 1 || c.maxRecords > 1024) fail(); return F(c);
}
function pending() {
  let resolve, reject; const promise = new NP((a, b) => { resolve = a; reject = b; });
  Object.defineProperty(promise, 'constructor', { value: NP }); Reflect.apply(THEN, promise, [undefined, () => {}]); return { promise, resolve, reject };
}
function observe(promise, yes, no) {
  try {
    const stable = () => [D(PP, 'then'), D(PP, 'constructor'), D(NP, Symbol.species)].every((v, i) => {
      const expected = PROMISE_DESCRIPTORS[i]; return v && Reflect.ownKeys(v).length === Reflect.ownKeys(expected).length
        && Reflect.ownKeys(expected).every(k => Object.hasOwn(v, k) && v[k] === expected[k]);
    });
    if (!stable() || !types.isPromise(promise) || types.isProxy(promise) || Object.getPrototypeOf(promise) !== PP
        || Object.getOwnPropertyDescriptor(promise, 'then') !== undefined
        || Object.getOwnPropertyDescriptor(promise, 'constructor')?.value !== NP) fail('PROMISE_UNKNOWN');
    Reflect.apply(THEN, promise, [value => stable() ? yes(value) : no(error('PROMISE_UNKNOWN')), no]);
  } catch { no(error('PROMISE_UNKNOWN')); }
}

/**
 * One explicit original-payment application. The fixed real SQLite store and
 * native timer owner are constructed only by start(). The caller owns the
 * dedicated configured database, file identity, lease, quotas and physical
 * close. CREATE_NEW never adopts an existing schema. OPEN_EXISTING takes an
 * explicit expected envelope; no read/refresh/claim retry is performed for it.
 */
export function createPurchasedOrderFundingNativeApplication(options) {
  if (arguments.length !== 1) fail();
  const c = fields(options, ['database', 'databaseMode', 'limits', 'selection', 'verifyFundingEvidence']);
  const selection = capturePurchasedOrderFundingApplicationSelection(c.selection), storeLimits = limits(c.limits);
  if (!['CREATE_NEW', 'OPEN_EXISTING'].includes(c.databaseMode) || typeof c.verifyFundingEvidence !== 'function'
      || types.isProxy(c.verifyFundingEvidence) || c.database === null || typeof c.database !== 'object' || types.isProxy(c.database)
      || (c.databaseMode === 'CREATE_NEW' && selection.ownership.expectedEnvelopeJson !== null)) fail();
  const mode = c.databaseMode, verifier = c.verifyFundingEvidence;
  let database = c.database, backend = null, deadlines = null, core = null, startRequested = false, starting = false;
  let held = false, closed = false, closing = null, closeOutcome = 'NOT_REQUESTED', retired = false, recovery = null;
  function coreView() { try { return core === null ? null : core.snapshot(); } catch { held = true; return null; } }
  function live() { if (held || closed || coreView()?.phase === 'HELD') fail('UNAVAILABLE'); }
  function retainAndRetire() {
    if (retired) return;
    const view = coreView();
    if (backend === null || view?.logicalBackendRetirementEligible !== true || backend.snapshot().busy !== false) fail('DRAIN_NOT_OBSERVED');
    try { recovery = core.exportRecoveryRecord(); } catch { held = true; fail('RECOVERY_READ_UNKNOWN'); }
    if (backend.close() !== undefined) { held = true; fail('BACKEND_CLOSE_UNKNOWN'); }
    retired = true; database = null;
  }
  const start = F(function start() {
    if (arguments.length !== 0) fail(); live(); if (startRequested) fail('ALREADY_STARTED'); startRequested = true; starting = true;
    try {
      const open = mode === 'CREATE_NEW' ? createNewPurchasedOrderFundingSqliteStore : openExistingPurchasedOrderFundingSqliteStore;
      backend = open(database, selection.ownership.storeId, storeLimits); live();
      deadlines = createServiceCreditNativeApplicationDeadlineOwner({ maxScheduleStarts: 1, maxConcurrentTimers: 1, maxDelayMs: selection.closeBudgetMs });
      core = createPurchasedOrderFundingApplicationCore({ selection, backend, verifyFundingEvidence: verifier,
        clock: F(() => Reflect.apply(NOW, Date, [])), deadlines });
      const result = core.start(); live(); return result;
    } catch { held = true; throw error('STARTUP_UNKNOWN'); }
    finally { starting = false; }
  });
  const verifyFunding = F(function verifyFunding(candidateJson) {
    if (arguments.length !== 1) fail(); live(); if (core === null) fail('NOT_STARTED'); return core.verifyFunding(candidateJson);
  });
  const readFunding = F(function readFunding() {
    if (arguments.length !== 0) fail(); live(); if (core === null) fail('NOT_STARTED'); return core.readFunding();
  });
  const exportRecoveryRecord = F(function exportRecoveryRecord() {
    if (arguments.length !== 0) fail(); if (retired && recovery !== null) return recovery;
    if (core === null || starting) fail('NOT_READY'); recovery = core.exportRecoveryRecord(); return recovery;
  });
  const close = F(function close() {
    if (arguments.length !== 0) fail(); if (closing !== null) return closing.promise;
    closing = pending(); closed = true; closeOutcome = 'PENDING';
    if (starting) { held = true; closeOutcome = 'REJECTED'; closing.reject(error('CLOSE_UNKNOWN')); return closing.promise; }
    if (core === null) {
      if (startRequested || backend !== null || deadlines !== null) { held = true; closeOutcome = 'REJECTED'; closing.reject(error('CLOSE_UNKNOWN')); }
      else { database = null; closeOutcome = 'FULFILLED_UNDEFINED'; closing.resolve(undefined); }
      return closing.promise;
    }
    let promise; try { promise = core.close(); } catch { held = true; closeOutcome = 'REJECTED'; closing.reject(error('CLOSE_UNKNOWN')); return closing.promise; }
    function complete(clean) {
      if (!clean) held = true;
      try { if (coreView()?.logicalBackendRetirementEligible === true) retainAndRetire(); } catch { held = true; }
      if (clean && !held && retired) { closeOutcome = 'FULFILLED_UNDEFINED'; closing.resolve(undefined); }
      else { held = true; closeOutcome = 'REJECTED'; closing.reject(error('CLOSE_UNKNOWN')); }
    }
    observe(promise, value => complete(value === undefined), () => complete(false)); return closing.promise;
  });
  const retireLogicalBackendAfterDrain = F(function retireLogicalBackendAfterDrain() {
    if (arguments.length !== 0 || !closed || closing === null || closeOutcome === 'PENDING' || starting) fail('NOT_READY');
    retainAndRetire();
    return F({ retired, applicationOutcome: held ? 'HELD' : 'LOGICALLY_CLOSED', recoveryRecordRetained: recovery !== null,
      authority: 'NONE', physicalDatabaseClose: 'CALLER_OWNED_NOT_QUALIFIED' });
  });
  const snapshot = F(function snapshot() {
    if (arguments.length !== 0) fail(); const v = coreView(), uncertain = held || v?.phase === 'HELD';
    return F({ profile: 'PURCHASE_ORDER_FUNDING_NATIVE_APPLICATION_V1',
      phase: uncertain ? 'HELD' : closed ? closeOutcome === 'FULFILLED_UNDEFINED' ? 'CLOSED' : 'CLOSING' : v?.phase ?? 'CREATED',
      startRequested, starting, closeRequested: closed, closeOutcome, application: v,
      databaseMode: mode, borrowedDatabaseReferenceRetained: database !== null,
      logicalBackendCreated: backend !== null, logicalBackendRetired: retired, recoveryRecordRetained: recovery !== null,
      authority: 'NONE', physicalDatabaseOwned: false, physicalDatabaseRelease: 'CALLER_OWNED_NOT_QUALIFIED',
      SDK: false, fundingSend: false, grantActivation: 'NOT_ESTABLISHED', serviceDelivery: 'NOT_ESTABLISHED' });
  });
  return F({ start, verifyFunding, readFunding, exportRecoveryRecord, close, retireLogicalBackendAfterDrain, snapshot });
}

/** Explicit protected selection read, without claiming an epoch or verifying funding. */
export function readPurchasedOrderFundingNativeRecoveryRecord(options) {
  if (arguments.length !== 1) fail();
  const c = fields(options, ['database', 'limits', 'selection']), selection = capturePurchasedOrderFundingApplicationSelection(c.selection);
  const p = capturePurchasedOrderPayment(...PURCHASE.map(k => selection.purchase[k]));
  let backend = null;
  try {
    backend = openExistingPurchasedOrderFundingSqliteStore(c.database, selection.ownership.storeId, limits(c.limits));
    const raw = backend.readEnvelope(p.orderId, p.paymentScope);
    return capturePurchasedOrderFundingApplicationRecoveryRecord(selection, raw);
  } catch { fail('RECOVERY_READ_UNKNOWN'); }
  finally { if (backend !== null) backend.close(); }
}
