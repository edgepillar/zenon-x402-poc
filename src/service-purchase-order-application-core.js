import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { capturePurchasedOrderPayment } from './service-purchase-order-funding.js';
import { capturePurchasedOrderFundingApplicationSelection, createPurchasedOrderFundingApplicationCore, purchasedOrderFundingSelectionFromRecovery } from './service-purchase-order-funding-application-core.js';
import { inspectPurchasedOrderFundingEnvelope } from './service-purchase-order-funding-cas-contract.js';
import { createPurchasedOrderFulfillmentOwner } from './service-purchase-order-fulfillment.js';
import { claimPurchasedOrderFulfillmentOwnership, createPurchasedOrderFulfillmentStatePort, inspectPurchasedOrderFulfillmentEnvelope } from './service-purchase-order-fulfillment-cas-contract.js';

const F = Object.freeze, NP = Promise, PP = NP.prototype, THEN = PP.then, D = Object.getOwnPropertyDescriptor;
const T = D(PP, 'then'), C = D(PP, 'constructor'), S = D(NP, Symbol.species), selections = new WeakMap();
const PURCHASE = ['termsJson', 'termsDigest', 'paymentCheckpointJson', 'paymentPinsJson', 'fundingContextJson'];
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
function error(suffix) {
  const code = 'PURCHASE_ORDER_APPLICATION_' + suffix, e = new TypeError(code);
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

function bindJournal(selection, purchase, raw, fundingEnvelope) {
  if (raw === null) return;
  const e = inspectPurchasedOrderFulfillmentEnvelope(raw);
  if (e.storeId !== selection.fulfillmentOwnership.storeId || e.orderId !== purchase.orderId || e.paymentScope !== purchase.paymentScope) fail('ORIGINAL_CONFLICT');
  if (e.recordJson !== null) {
    const r = JSON.parse(e.recordJson);
    if (r.termsDigest !== purchase.termsDigest || r.paymentRecordDigest !== purchase.paymentRecordDigest || r.fundingStoreId !== selection.funding.ownership.storeId) fail('ORIGINAL_CONFLICT');
    if (r.fundingReceiptJson !== null && (fundingEnvelope === null || inspectPurchasedOrderFundingEnvelope(fundingEnvelope).receiptJson !== r.fundingReceiptJson)) fail('RECEIPT_CONFLICT');
  }
}
/** Pure selection; neither a paired snapshot nor its checksum is economic authority. */
export function capturePurchasedOrderApplicationSelection(input) {
  if (arguments.length !== 1) fail(); if (selections.has(input)) return input;
  const c = fields(input, ['funding', 'fulfillmentOwnership']);
  c.funding = capturePurchasedOrderFundingApplicationSelection(c.funding);
  c.fulfillmentOwnership = F(fields(c.fulfillmentOwnership, ['storeId', 'ownerId', 'expectedEnvelopeJson']));
  id(c.fulfillmentOwnership.storeId); id(c.fulfillmentOwnership.ownerId);
  if (c.fulfillmentOwnership.storeId === c.funding.ownership.storeId) fail('STORE_SELECTION_CONFLICT');
  const p = capturePurchasedOrderPayment(...PURCHASE.map(k => c.funding.purchase[k]));
  bindJournal(c, p, c.fulfillmentOwnership.expectedEnvelopeJson, c.funding.ownership.expectedEnvelopeJson);
  const chosen = F(c); selections.set(chosen, p); return chosen;
}
/** Checksum only. Protect the returned recovery digest independently before use. */
export function purchasedOrderApplicationRecoveryDigest(raw) {
  if (arguments.length !== 1 || typeof raw !== 'string' || !raw.length || Buffer.byteLength(raw) > 16777216 || Buffer.from(raw).toString() !== raw) fail();
  return 'sha256:' + createHash('sha256').update('zenon-x402:purchase-order-application-recovery:v1\0').update(raw).digest('hex');
}
export function purchasedOrderApplicationSelectionFromRecovery(raw, selectedDigest, nextOwners) {
  if (arguments.length !== 3 || purchasedOrderApplicationRecoveryDigest(raw) !== selectedDigest) fail('RECOVERY_PIN_CONFLICT');
  let decoded; try { decoded = JSON.parse(raw); } catch { fail(); }
  const r = fields(decoded, ['version', 'profile', 'fundingRecoveryJson', 'fundingRecoveryDigest', 'fulfillmentStoreId', 'fulfillmentExpectedEnvelopeJson']);
  if (r.version !== 1 || r.profile !== 'PURCHASE_ORDER_APPLICATION_V1' || JSON.stringify(r) !== raw) fail();
  const owners = fields(nextOwners, ['fundingOwnerId', 'fulfillmentOwnerId']);
  return capturePurchasedOrderApplicationSelection({
    funding: purchasedOrderFundingSelectionFromRecovery(r.fundingRecoveryJson, r.fundingRecoveryDigest, owners.fundingOwnerId),
    fulfillmentOwnership: { storeId: r.fulfillmentStoreId, ownerId: owners.fulfillmentOwnerId, expectedEnvelopeJson: r.fulfillmentExpectedEnvelopeJson },
  });
}

/**
 * Actual funding application and grant-free liability owner with both fenced
 * ports. Stores and authenticators remain trusted selected capabilities. The
 * two commits are not an atomic distributed transaction: verified funding is
 * durable first, and success is returned only after its liability copy is
 * acknowledged. An interrupted/unknown second commit holds the application.
 * Explicit new-epoch recovery uses the same funding receipt, never a resend.
 */
export function createPurchasedOrderApplicationCore(options) {
  if (arguments.length !== 1 || !invariant()) fail();
  const o = fields(options, ['selection', 'fundingBackend', 'fulfillmentBackend', 'originalStore', 'verifyFundingEvidence', 'verifier', 'clock', 'deadlines']);
  const selection = capturePurchasedOrderApplicationSelection(o.selection), purchase = selections.get(selection);
  if (o.fundingBackend === o.fulfillmentBackend) fail('STORE_SELECTION_CONFLICT');
  const readJournal = method(o.fulfillmentBackend, 'readEnvelope'); method(o.fulfillmentBackend, 'compareAndSwapEnvelope');
  method(o.originalStore, 'readOriginal'); method(o.verifier, 'verifyDelivery'); method(o.verifier, 'verifyCompensation');
  const funding = createPurchasedOrderFundingApplicationCore({ selection: selection.funding, backend: o.fundingBackend,
    verifyFundingEvidence: o.verifyFundingEvidence, clock: o.clock, deadlines: o.deadlines });
  let held = false, startRequested = false, starting = false, started = false, active = false, synchronous = false;
  let liability = null, port = null, closing = null, closeOutcome = 'NOT_REQUESTED', journalClosed = false, last = null, liabilityLast = null;
  function live() { if (held || closing !== null || !invariant()) fail('UNAVAILABLE'); }
  function available() { live(); if (!started) fail('NOT_STARTED'); if (active || synchronous) fail('BUSY'); }
  function after() { if (closing !== null || held) fail('OPERATION_CLOSED'); }
  function view() {
    return F({ ...last, quantityOwed: liabilityLast?.quantityOwed ?? 0, fulfillmentRecorded: liabilityLast?.fundingStatus === 'SELECTED_STORE_VERIFIED_RECEIPT_RECORDED',
      liabilityQuantityOwed: liabilityLast?.quantityOwed ?? 0, liabilityObservationCurrent: false, authority: 'NONE' });
  }
  function pairFunding() {
    if (last.phase === 'VERIFIED') liabilityLast = liability.recordVerifiedFunding(); else liabilityLast = liability.read();
    after();
    if (last.phase === 'VERIFIED' && liabilityLast.fundingStatus !== 'SELECTED_STORE_VERIFIED_RECEIPT_RECORDED') fail('LIABILITY_UNKNOWN');
  }
  const start = F(function start() {
    if (arguments.length !== 0) fail(); live(); if (startRequested) fail('ALREADY_STARTED'); startRequested = true; starting = true;
    try {
      last = funding.start(); after();
      const claim = claimPurchasedOrderFulfillmentOwnership(selection.fulfillmentOwnership.storeId, purchase.orderId, purchase.paymentScope,
        selection.fulfillmentOwnership.expectedEnvelopeJson, selection.fulfillmentOwnership.ownerId, o.fulfillmentBackend);
      after(); port = createPurchasedOrderFulfillmentStatePort(claim.ownerTokenJson, o.fulfillmentBackend);
      liability = createPurchasedOrderFulfillmentOwner(...PURCHASE.map(k => selection.funding.purchase[k]), {
        fundingStoreId: selection.funding.ownership.storeId, fundingStore: o.fundingBackend, stateStore: port,
        originalStore: o.originalStore, verifier: o.verifier, clock: o.clock });
      liabilityLast = liability.recover(); after(); pairFunding(); started = true; return view();
    } catch { held = true; throw error('STARTUP_UNKNOWN'); }
    finally { starting = false; if (closing !== null) closeJournal(); }
  });
  const verifyFunding = F(function verifyFunding(raw) {
    const done = pending(); let launched = false;
    try {
      if (arguments.length !== 1) fail(); available(); active = true; launched = true;
      observe(funding.verifyFunding(raw), value => {
        if (closing !== null) { active = false; held = true; done.reject(error('OPERATION_CLOSED')); return; }
        synchronous = true;
        try { last = value; pairFunding(); active = false; done.resolve(view()); }
        catch { active = false; held = true; done.reject(error(closing !== null ? 'OPERATION_CLOSED' : 'LIABILITY_UNKNOWN')); }
        finally { synchronous = false; if (closing !== null) closeJournal(); }
      }, () => {
        active = false; if (funding.snapshot().phase === 'HELD' || closing !== null) held = true;
        done.reject(error(closing !== null ? 'OPERATION_CLOSED' : held ? 'FUNDING_UNKNOWN' : 'VERIFICATION_REFUSED'));
      });
    } catch (e) { if (launched) { active = false; held = true; } done.reject(e); }
    return done.promise;
  });
  function operation(name, args) {
    available(); synchronous = true;
    try { const result = Reflect.apply(liability[name], liability, args); after(); liabilityLast = result; return result; }
    catch (e) { if (liability.snapshot().held || port.snapshot().held || closing !== null) held = true; throw e; }
    finally { synchronous = false; if (closing !== null) closeJournal(); }
  }
  function closeJournal() {
    if (journalClosed || starting || synchronous) return;
    try {
      if (liability !== null && liability.close() !== undefined) fail('CLOSE_UNKNOWN');
      if (port !== null && port.close() !== undefined) fail('CLOSE_UNKNOWN'); journalClosed = true;
    } catch { held = true; }
  }
  const close = F(function close() {
    if (arguments.length !== 0) fail(); if (closing !== null) return closing.promise;
    closing = pending(); closeOutcome = 'PENDING'; if (starting || synchronous || active) held = true;
    closeJournal();
    try { observe(funding.close(), value => {
      closeJournal();
      if (value !== undefined || !journalClosed || held) { held = true; closeOutcome = 'REJECTED'; closing.reject(error('CLOSE_UNKNOWN')); }
      else { closeOutcome = 'FULFILLED_UNDEFINED'; closing.resolve(undefined); }
    }, () => { held = true; closeOutcome = 'REJECTED'; closing.reject(error('CLOSE_UNKNOWN')); }); }
    catch { held = true; closeOutcome = 'REJECTED'; closing.reject(error('CLOSE_UNKNOWN')); }
    return closing.promise;
  });
  const exportRecoveryRecord = F(function exportRecoveryRecord() {
    if (arguments.length !== 0) fail(); if (!startRequested) fail('NOT_STARTED'); if (starting || active || synchronous) fail('BUSY');
    try {
      const f = funding.exportRecoveryRecord(), raw = readJournal(purchase.orderId, purchase.paymentScope);
      const selectedFunding = purchasedOrderFundingSelectionFromRecovery(f.recordJson, f.recordDigest, selection.funding.ownership.ownerId);
      bindJournal({ ...selection, funding: selectedFunding }, purchase, raw, selectedFunding.ownership.expectedEnvelopeJson);
      const recordJson = JSON.stringify({ version: 1, profile: 'PURCHASE_ORDER_APPLICATION_V1', fundingRecoveryJson: f.recordJson,
        fundingRecoveryDigest: f.recordDigest, fulfillmentStoreId: selection.fulfillmentOwnership.storeId, fulfillmentExpectedEnvelopeJson: raw });
      return F({ recordJson, recordDigest: purchasedOrderApplicationRecoveryDigest(recordJson), authority: 'NONE',
        snapshotAtomicAcrossStores: false, mayDispatch: false });
    } catch { held = true; fail('RECOVERY_READ_UNKNOWN'); }
  });
  return F({ start, verifyFunding, close, exportRecoveryRecord,
    readFunding: F(function readFunding() { if (arguments.length !== 0) fail(); available(); return view(); }),
    readLiability: F(function readLiability() { if (arguments.length !== 0) fail(); available(); return liability.read(); }),
    beginDelivery: F(function beginDelivery(...args) { return operation('beginDelivery', args); }),
    recordDelivery: F(function recordDelivery(...args) { return operation('recordDelivery', args); }),
    retainCompensation: F(function retainCompensation(...args) { return operation('retainCompensation', args); }),
    recordCompensation: F(function recordCompensation(...args) { return operation('recordCompensation', args); }),
    snapshot: F(function snapshot() {
      if (arguments.length !== 0) fail(); const f = funding.snapshot();
      return F({ profile: 'PURCHASE_ORDER_APPLICATION_V1', phase: held || f.phase === 'HELD' ? 'HELD' : closing !== null
        ? closeOutcome === 'FULFILLED_UNDEFINED' ? 'CLOSED' : 'CLOSING' : started ? 'OPEN' : 'CREATED',
        startRequested, startupComplete: started, startupActive: starting, verificationActive: active, journalOperationActive: synchronous, closeOutcome,
        journalClosed, funding: f, journal: port?.snapshot() ?? null,
        logicalBackendRetirementEligible: closing !== null && !starting && !synchronous && !active && journalClosed && f.logicalBackendRetirementEligible,
        pairedFundingObserved: last?.phase === 'VERIFIED' && liabilityLast?.fundingStatus === 'SELECTED_STORE_VERIFIED_RECEIPT_RECORDED',
        automaticRetry: false, atomicAcrossStores: false, authority: 'NONE', physicalRelease: 'CALLER_OWNED_NOT_QUALIFIED' });
    }) });
}
