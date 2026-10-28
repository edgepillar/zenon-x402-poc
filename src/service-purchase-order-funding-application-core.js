import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { capturePurchasedOrderPayment, createPurchasedOrderFundingOwner } from './service-purchase-order-funding.js';
import {
  claimPurchasedOrderFundingOwnership, createPurchasedOrderFundingReceiptPort,
  inspectPurchasedOrderFundingEnvelope, inspectPurchasedOrderFundingReceipt,
} from './service-purchase-order-funding-cas-contract.js';

const F = Object.freeze, NP = Promise, PP = NP.prototype, THEN = PP.then, D = Object.getOwnPropertyDescriptor;
const T = D(PP, 'then'), C = D(PP, 'constructor'), S = D(NP, Symbol.species), selections = new WeakMap();
const PURCHASE = ['termsJson', 'termsDigest', 'paymentCheckpointJson', 'paymentPinsJson', 'fundingContextJson'];
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
function error(suffix) {
  const code = 'ORDER_FUNDING_APPLICATION_' + suffix, e = new TypeError(code);
  Object.defineProperties(e, { code: { value: code, enumerable: true }, stack: { value: 'TypeError: ' + code } }); return F(e);
}
function fail(suffix = 'INPUT_REJECTED') { throw error(suffix); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail();
  const result = {};
  for (const k of names) { const d = D(value, k); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); result[k] = d.value; }
  return result;
}
function member(value, name) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const d = D(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); return d.value;
}
function callable(value) { return typeof value === 'function' && !types.isProxy(value); }
function method(object, name) { const fn = member(object, name); if (!callable(fn)) fail(); return (...args) => Reflect.apply(fn, object, args); }
function integer(value, min, max) { if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < min || value > max) fail(); return value; }
function id(value) { if (typeof value !== 'string' || ID.exec(value)?.[0] !== value) fail(); return value; }
function invariant() {
  return [D(PP, 'then'), D(PP, 'constructor'), D(NP, Symbol.species)].every((v, i) => {
    const expected = [T, C, S][i]; return v && Reflect.ownKeys(v).length === Reflect.ownKeys(expected).length
      && Reflect.ownKeys(expected).every(k => Object.hasOwn(v, k) && v[k] === expected[k]);
  });
}
function pending() {
  let resolve, reject; const promise = new NP((a, b) => { resolve = a; reject = b; });
  Object.defineProperty(promise, 'constructor', { value: NP });
  Reflect.apply(THEN, promise, [undefined, () => {}]); return { promise, resolve, reject };
}
function observe(promise, yes, no) {
  try {
    if (!invariant() || !types.isPromise(promise) || types.isProxy(promise) || Object.getPrototypeOf(promise) !== PP
        || D(promise, 'then') !== undefined) fail('PROMISE_UNKNOWN');
    const ctor = D(promise, 'constructor');
    if (ctor === undefined) Object.defineProperty(promise, 'constructor', { value: NP });
    else if (!Object.hasOwn(ctor, 'value') || ctor.value !== NP) fail('PROMISE_UNKNOWN');
    Reflect.apply(THEN, promise, [value => invariant() ? yes(value) : no(error('PROMISE_UNKNOWN')), no]);
  } catch { no(error('PROMISE_UNKNOWN')); }
}
function candidate(raw) {
  if (typeof raw !== 'string' || !raw.length || Buffer.byteLength(raw) > 16384 || Buffer.from(raw).toString() !== raw) fail();
  let v; try { v = JSON.parse(raw); } catch { fail(); }
  const c = fields(v, ['evidenceVersion', 'artifact']);
  if (c.evidenceVersion !== 1 || c.artifact === null || typeof c.artifact !== 'object' || Array.isArray(c.artifact)) fail();
  const queue = [[c.artifact, 0]]; let nodes = 0;
  while (queue.length) {
    const [value, depth] = queue.pop(); if (++nodes > 8192 || depth > 20) fail();
    if (value !== null && typeof value === 'object') {
      if (Array.isArray(value) && value.length > 4096) fail();
      for (const x of Object.values(value)) queue.push([x, depth + 1]);
    }
  }
  if (JSON.stringify(c) !== raw) fail();
}
function bindExpected(c, purchase, raw) {
  if (raw === null) return;
  const e = inspectPurchasedOrderFundingEnvelope(raw);
  if (e.storeId !== c.ownership.storeId || e.orderId !== purchase.orderId || e.paymentScope !== purchase.paymentScope) fail('ORIGINAL_CONFLICT');
  if (e.receiptJson !== null) {
    const s = inspectPurchasedOrderFundingReceipt(e.receiptJson).receipt;
    if (s.paymentRecordJson !== purchase.paymentRecordJson || s.paymentRecordDigest !== purchase.paymentRecordDigest
        || s.maximumVerificationAttempts !== c.maximumVerificationAttempts) fail('ORIGINAL_CONFLICT');
  }
}
/** Pure startup capture. Existing receipt bytes do not replace independent payment/terms pins. */
export function capturePurchasedOrderFundingApplicationSelection(input) {
  if (arguments.length !== 1) fail(); if (selections.has(input)) return input;
  const c = fields(input, ['purchase', 'ownership', 'maximumVerificationAttempts', 'closeBudgetMs']);
  c.purchase = F(fields(c.purchase, PURCHASE)); c.ownership = F(fields(c.ownership, ['storeId', 'ownerId', 'expectedEnvelopeJson']));
  id(c.ownership.storeId); id(c.ownership.ownerId); integer(c.maximumVerificationAttempts, 1, 32); integer(c.closeBudgetMs, 1, 1000);
  const p = capturePurchasedOrderPayment(...PURCHASE.map(k => c.purchase[k])); bindExpected(c, p, c.ownership.expectedEnvelopeJson);
  const result = F(c); selections.set(result, p); return result;
}
/** Protected operator DATA, with no selected new owner and no new authority. */
export function capturePurchasedOrderFundingApplicationRecoveryRecord(selection, envelopeJson) {
  if (arguments.length !== 2) fail(); const c = capturePurchasedOrderFundingApplicationSelection(selection), p = selections.get(c);
  bindExpected(c, p, envelopeJson);
  const recordJson = JSON.stringify({ version: 1, purchase: c.purchase, storeId: c.ownership.storeId, expectedEnvelopeJson: envelopeJson,
    maximumVerificationAttempts: c.maximumVerificationAttempts, closeBudgetMs: c.closeBudgetMs });
  return F({ recordJson, recordDigest: purchasedOrderFundingApplicationRecoveryDigest(recordJson), authority: 'NONE' });
}
/** Checksum candidate. Recovery still requires a separately selected trusted digest. */
export function purchasedOrderFundingApplicationRecoveryDigest(recordJson) {
  if (arguments.length !== 1 || typeof recordJson !== 'string' || !recordJson.length || Buffer.byteLength(recordJson) > 3145728
      || Buffer.from(recordJson).toString() !== recordJson) fail();
  return 'sha256:' + createHash('sha256').update('zenon-x402:order-funding-application-recovery:v1\0').update(recordJson).digest('hex');
}
export function purchasedOrderFundingSelectionFromRecovery(recordJson, independentlySelectedDigest, nextOwnerId) {
  if (arguments.length !== 3 || purchasedOrderFundingApplicationRecoveryDigest(recordJson) !== independentlySelectedDigest) fail('RECOVERY_PIN_CONFLICT');
  let v; try { v = JSON.parse(recordJson); } catch { fail(); }
  const r = fields(v, ['version', 'purchase', 'storeId', 'expectedEnvelopeJson', 'maximumVerificationAttempts', 'closeBudgetMs']);
  if (r.version !== 1 || JSON.stringify(r) !== recordJson) fail();
  return capturePurchasedOrderFundingApplicationSelection({ purchase: r.purchase,
    ownership: { storeId: r.storeId, ownerId: nextOwnerId, expectedEnvelopeJson: r.expectedEnvelopeJson },
    maximumVerificationAttempts: r.maximumVerificationAttempts, closeBudgetMs: r.closeBudgetMs });
}

/**
 * Application startup and bounded close. The actual owner, receipt port and
 * ownership functions are fixed imports. The backend and fresh deadline owner
 * are trusted borrowed/application-owned capabilities respectively. The native
 * entry hardwires their real constructors. DATA ports do not qualify native I/O.
 * No automatic ownership refresh, funding send, grant, delivery or payout exists.
 */
export function createPurchasedOrderFundingApplicationCore(options) {
  if (arguments.length !== 1 || !invariant()) fail();
  const o = fields(options, ['selection', 'backend', 'verifyFundingEvidence', 'clock', 'deadlines']);
  const selection = capturePurchasedOrderFundingApplicationSelection(o.selection), purchase = selections.get(selection);
  if (!callable(o.verifyFundingEvidence) || !callable(o.clock)) fail();
  const backendRead = method(o.backend, 'readEnvelope'), backendCAS = method(o.backend, 'compareAndSwapEnvelope');
  const backend = F({ readEnvelope: backendRead, compareAndSwapEnvelope: backendCAS });
  const runtime = member(o.deadlines, 'serviceRuntime'), schedule = method(runtime, 'schedule'), cancel = method(runtime, 'cancel');
  const now = method(runtime, 'monotonicNowNs'), stopDeadlines = method(o.deadlines, 'close'), deadlineView = method(o.deadlines, 'snapshot');
  const fresh = deadlineView();
  if (member(fresh, 'phase') !== 'OPEN' || member(fresh, 'unknown') !== false || member(fresh, 'activeTimers') !== 0
      || member(fresh, 'deliveringCallbacks') !== 0 || member(fresh, 'scheduleStarts') !== 0
      || member(fresh, 'closePromiseOutcome') !== 'NOT_REQUESTED') fail('DEADLINE_OWNER_NOT_FRESH');
  let held = false, starting = false, startRequested = false, started = false, active = false;
  let owner = null, port = null, claim = null, last = null, calls = 0, closing = null, closeOutcome = 'NOT_REQUESTED';
  let ownerStop = 'NOT_REQUESTED', deadlineStop = 'NOT_REQUESTED', portClosed = false, timer = null, timerState = 'NONE';
  let closeDeadline = null, terminal = false, deadlineClean = false;
  function hold() { held = true; }
  function live() { if (held || closing !== null) fail('UNAVAILABLE'); }
  function settleClose(clean) {
    if (terminal) return; terminal = true;
    if (!clean || held) { hold(); closeOutcome = 'REJECTED'; closing.reject(error('CLOSE_UNKNOWN')); }
    else { closeOutcome = 'FULFILLED_UNDEFINED'; closing.resolve(undefined); }
  }
  function stopTimerOwner() {
    if (deadlineStop !== 'NOT_REQUESTED') return; deadlineStop = 'PENDING';
    let promise; try { promise = stopDeadlines(); } catch { deadlineStop = 'UNKNOWN'; hold(); settleClose(false); return; }
    observe(promise, value => {
      try {
        const s = deadlineView(); deadlineClean = value === undefined && member(s, 'phase') === 'CLOSED' && member(s, 'unknown') === false
          && member(s, 'activeTimers') === 0 && member(s, 'deliveringCallbacks') === 0;
      } catch { deadlineClean = false; }
      deadlineStop = deadlineClean ? 'DRAINED' : 'UNKNOWN'; if (!deadlineClean) hold(); finishClose();
    }, () => { deadlineStop = 'UNKNOWN'; hold(); settleClose(false); });
  }
  function finishClose() {
    if (closing === null) return;
    if (starting || active || !['DRAINED', 'NOT_CREATED'].includes(ownerStop)) return;
    if (port !== null && !portClosed) {
      try { if (port.close() !== undefined) fail('PORT_CLOSE_UNKNOWN'); portClosed = true; }
      catch { hold(); settleClose(false); return; }
    }
    if (timerState === 'ARMED') {
      try { if (now() >= closeDeadline) { hold(); settleClose(false); } } catch { hold(); settleClose(false); }
      timerState = 'CANCELLING';
      try { if (cancel(timer) !== undefined) fail('TIMER_CLOSE_UNKNOWN'); timerState = 'CANCELLED'; timer = null; }
      catch { timerState = 'UNKNOWN'; hold(); settleClose(false); }
      try { if (now() >= closeDeadline) { hold(); settleClose(false); } } catch { hold(); settleClose(false); }
    }
    stopTimerOwner();
    if (deadlineStop === 'DRAINED') settleClose(true);
    else if (deadlineStop === 'UNKNOWN') settleClose(false);
  }
  function requestOwnerStop() {
    if (ownerStop !== 'NOT_REQUESTED') return;
    if (owner === null) { ownerStop = 'NOT_CREATED'; finishClose(); return; }
    ownerStop = 'PENDING'; let promise;
    try { promise = owner.close(); } catch { ownerStop = 'UNKNOWN'; hold(); settleClose(false); return; }
    observe(promise, value => {
      ownerStop = value === undefined ? 'DRAINED' : 'UNKNOWN'; if (ownerStop === 'UNKNOWN') hold(); finishClose();
    }, () => { ownerStop = 'UNKNOWN'; hold(); settleClose(false); });
  }
  const close = F(function close() {
    if (arguments.length !== 0) fail(); if (closing !== null) return closing.promise;
    closing = pending(); closeOutcome = 'PENDING';
    if (starting || active) hold();
    try {
      const before = now(); if (typeof before !== 'bigint' || before < 0n) fail('CLOCK_UNKNOWN');
      closeDeadline = before + BigInt(selection.closeBudgetMs) * 1000000n; timerState = 'ARMING';
      timer = schedule(F(() => {
        if (terminal) return;
        timerState = 'FIRED'; timer = null;
        try { if (now() < closeDeadline) fail('EARLY_CLOSE_WAKE'); } catch { hold(); }
        hold(); settleClose(false); stopTimerOwner();
      }), selection.closeBudgetMs);
      timerState = 'ARMED';
    } catch { timerState = 'UNKNOWN'; hold(); settleClose(false); }
    requestOwnerStop(); finishClose(); return closing.promise;
  });
  const start = F(function start() {
    if (arguments.length !== 0) fail(); live(); if (startRequested) fail('ALREADY_STARTED'); startRequested = true; starting = true;
    try {
      claim = claimPurchasedOrderFundingOwnership(selection.ownership.storeId, purchase.orderId, purchase.paymentScope,
        selection.ownership.expectedEnvelopeJson, selection.ownership.ownerId, backend);
      live(); port = createPurchasedOrderFundingReceiptPort(claim.ownerTokenJson, backend);
      owner = createPurchasedOrderFundingOwner(...PURCHASE.map(k => selection.purchase[k]), { receiptStore: port,
        verifyFundingEvidence: o.verifyFundingEvidence, clock: o.clock, maximumVerificationAttempts: selection.maximumVerificationAttempts });
      live(); last = owner.recover(); live(); started = true; return last;
    } catch { hold(); throw error('STARTUP_UNKNOWN'); }
    finally { starting = false; if (closing !== null) { requestOwnerStop(); finishClose(); } }
  });
  const verifyFunding = F(function verifyFunding(raw) {
    const done = pending(); let launched = false;
    try {
      if (arguments.length !== 1) fail(); live(); if (!started) fail('NOT_STARTED'); if (active) fail('BUSY'); candidate(raw);
      active = true; launched = true; calls++; const promise = owner.verifyFunding(raw);
      observe(promise, value => {
        active = false;
        if (closing !== null) { hold(); done.reject(error('OPERATION_CLOSED')); finishClose(); return; }
        last = value; done.resolve(value);
      }, caught => {
        active = false; const code = typeof caught === 'object' && caught !== null && !types.isProxy(caught) ? D(caught, 'code')?.value : null;
        const known = ['ORDER_FUNDING_INVALID_INPUT', 'ORDER_FUNDING_CANDIDATE_CONFLICT', 'ORDER_FUNDING_ATTEMPTS_EXHAUSTED'].includes(code);
        if (!known || closing !== null) hold(); done.reject(error(closing !== null ? 'OPERATION_CLOSED' : known ? 'VERIFICATION_REFUSED' : 'VERIFICATION_UNKNOWN')); finishClose();
      });
    } catch (caught) { if (launched) { active = false; hold(); } done.reject(caught); finishClose(); }
    return done.promise;
  });
  const readFunding = F(function readFunding() {
    if (arguments.length !== 0) fail(); live(); if (!started) fail('NOT_STARTED'); if (active) fail('BUSY'); return last;
  });
  const exportRecoveryRecord = F(function exportRecoveryRecord() {
    if (arguments.length !== 0) fail(); if (!startRequested || starting || active || ownerStop === 'PENDING') fail('BUSY');
    let raw; try { raw = backendRead(purchase.orderId, purchase.paymentScope); } catch { hold(); fail('RECOVERY_READ_UNKNOWN'); }
    try { return capturePurchasedOrderFundingApplicationRecoveryRecord(selection, raw); } catch { hold(); fail('RECOVERY_READ_UNKNOWN'); }
  });
  const snapshot = F(function snapshot() {
    if (arguments.length !== 0) fail();
    const eligible = closing !== null && !starting && !active && ['DRAINED', 'NOT_CREATED'].includes(ownerStop)
      && (port === null || portClosed) && deadlineStop === 'DRAINED' && deadlineClean;
    return F({ profile: 'PURCHASE_ORDER_FUNDING_APPLICATION_V1', phase: held ? 'HELD' : terminal ? 'CLOSED' : closing !== null ? 'CLOSING' : started ? 'OPEN' : 'CREATED',
      startRequested, startupComplete: started, startupActive: starting, verificationActive: active, verificationCalls: calls,
      claimAcknowledged: claim !== null, lastObservedFundingPhase: last?.phase ?? null, fundingObservationCurrent: started && !held && closing === null && !active,
      ownerClose: ownerStop, receiptPortClosed: portClosed, deadlineOwnerClose: deadlineStop, closeOutcome,
      closeBudgetMs: selection.closeBudgetMs, watchdog: timerState, logicalBackendRetirementEligible: eligible,
      automaticOwnershipRefresh: false, automaticFundingRetry: false, grantActivation: 'NOT_ESTABLISHED', serviceDelivery: 'NOT_ESTABLISHED',
      authority: 'NONE', physicalDatabaseRelease: 'CALLER_OWNED_NOT_QUALIFIED' });
  });
  return F({ start, verifyFunding, readFunding, exportRecoveryRecord, close, snapshot });
}
