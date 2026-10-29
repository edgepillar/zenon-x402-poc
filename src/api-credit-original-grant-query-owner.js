import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { captureServiceCreditOriginalFundingGrantQuery, captureServiceCreditOriginalFundingGrantResult } from './service-credit-original-funding-grant.js';
import { captureOriginalFundingGrantSelectedRoute, captureOriginalFundingGrantRoute, createOriginalFundingGrantWireRequest } from './service-credit-original-grant-http-binding.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn, A = Reflect.apply;
const NP = Promise, PP = NP.prototype, THEN = PP.then, USED = new WeakSet(), HELD = new Set();
const BASE = [[PP, 'then', D(PP, 'then')], [PP, 'constructor', D(PP, 'constructor')], [NP, Symbol.species, D(NP, Symbol.species)]];
function fail() { throw new TypeError('API_CREDIT_ORIGINAL_GRANT_QUERY_UNKNOWN'); }
function invariant() {
  return D(Object.prototype, 'then') === undefined && BASE.every(([object, key, expected]) => {
    const actual = D(object, key); return actual && Reflect.ownKeys(actual).length === Reflect.ownKeys(expected).length
      && Reflect.ownKeys(expected).every(k => OWN(actual, k) && actual[k] === expected[k]);
  });
}
function data(v, key) {
  if (v === null || typeof v !== 'object' || types.isProxy(v) || Object.getPrototypeOf(v) !== Object.prototype || !Object.isFrozen(v)) fail();
  const d = D(v, key); if (!d?.enumerable || !OWN(d, 'value')) fail(); return d.value;
}
function fields(v, keys) { const out = {}; for (const key of keys) out[key] = data(v, key); if (Reflect.ownKeys(v).length !== keys.length) fail(); return out; }
function observe(value, yes, no) {
  if (!invariant() || !types.isPromise(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== PP
      || Reflect.ownKeys(value).some(k => k !== 'constructor')) fail();
  const ctor = D(value, 'constructor'); if (ctor && (!OWN(ctor, 'value') || ctor.value !== NP)) fail();
  const branch = A(THEN, value, [yes, no]); A(THEN, branch, [() => {}, () => {}]);
}
function capability() {
  let resolve, reject; const promise = new NP((yes, no) => { resolve = yes; reject = no; });
  Object.defineProperty(promise, 'constructor', { value: NP }); observe(promise, () => {}, () => {}); return { promise, resolve, reject };
}
function hash(v) { return typeof v === 'string' && /^[0-9a-f]{64}$/.exec(v)?.[0] === v; }
function closeReceipt(v) {
  const c = fields(v, ['phase', 'trackedRequests', 'trackedSockets', 'ownedTimers', 'serviceDelivery']);
  return c.phase === 'CLOSED' && c.trackedRequests === 0 && c.trackedSockets === 0 && c.ownedTimers === 0 && c.serviceDelivery === 'NOT_ESTABLISHED';
}
function closedView(v) {
  const close = data(v, 'close'), material = data(close, 'localMaterialRelease');
  return data(v, 'phase') === 'CLOSED' && data(v, 'unknown') === false && data(v, 'requestStarts') === 1
    && data(v, 'trackedRequests') === 0 && data(v, 'trackedSockets') === 0 && data(v, 'ownedTimers') === 0
    && data(close, 'phase') === 'CLOSED' && data(close, 'unknown') === false && data(close, 'closeRequested') === true
    && data(close, 'closePromiseOutcome') === 'CLOSED' && data(close, 'observing') === false && data(close, 'quiescenceObserved') === true
    && data(material, 'attempts') === 1 && data(material, 'outcome') === 'RETURNED';
}
/** One explicit query and one owner close. The fixed native binding supplies
 * the transport; DATA ports cannot establish native drain. A pending/opaque
 * read is never competed with by another close. Late results cannot undo HELD. */
export function runApiCreditOriginalGrantQueryOwner(configuration) {
  if (arguments.length !== 1 || !invariant() || HELD.size >= 64) fail();
  const c = fields(configuration, ['profile', 'ports', 'requireOpening']);
  const profile = fields(c.profile, ['route', 'query', 'proof', 'transport', 'checkpointDigest', 'queryDigest']);
  const p = fields(c.ports, ['openTransport', 'read', 'inspect', 'close', 'clock', 'armTimer', 'cancelTimer']);
  for (const fn of [...Object.values(p), c.requireOpening]) if (typeof fn !== 'function' || types.isProxy(fn) || !Object.isFrozen(fn)) fail();
  if (USED.has(c.profile)) fail();
  const route = captureOriginalFundingGrantSelectedRoute(profile.route), selected = captureServiceCreditOriginalFundingGrantQuery(profile.query);
  createOriginalFundingGrantWireRequest(route, selected.query, profile.proof);
  if (!hash(profile.checkpointDigest) || profile.queryDigest !== selected.request.canonicalBodyDigest) fail();
  const t = fields(profile.transport, ['caBase64', 'requestDeadlineMs', 'handshakeDeadlineMs', 'closeGraceMs']);
  if (![t.requestDeadlineMs, t.handshakeDeadlineMs, t.closeGraceMs].every(n => Number.isSafeInteger(n) && n > 0)
      || t.requestDeadlineMs > 60000 || t.handshakeDeadlineMs > t.requestDeadlineMs || t.closeGraceMs > 30000
      || t.requestDeadlineMs + t.closeGraceMs > 60000) fail(); USED.add(c.profile);
  const out = capability(), frame = { profile: c.profile, transport: null, opaqueOpen: null, readReceipt: null, closeReceipt: null,
    readEntered: false, readSettled: false, closeEntered: false, candidate: null, timer: null, timerCancelled: false,
    last: null, deadline: null, held: false, terminal: false };
  function hold() {
    frame.held = true; frame.candidate = null; HELD.add(frame);
    if (!frame.terminal) { frame.terminal = true; out.reject(new TypeError('API_CREDIT_ORIGINAL_GRANT_QUERY_UNKNOWN')); }
  }
  function clock() { const now = p.clock(); if (typeof now !== 'bigint' || frame.last !== null && now < frame.last) fail(); frame.last = now; return now; }
  function guard() {
    if (frame.held || frame.terminal || !invariant()) fail(); c.requireOpening();
    if (clock() >= frame.deadline) fail();
  }
  function cancelTimer() {
    if (frame.timer === null || frame.timerCancelled) return; frame.timerCancelled = true;
    if (p.cancelTimer(frame.timer) !== undefined) fail(); frame.timer = null;
  }
  function requestClose() {
    if (frame.transport === null || frame.closeEntered || frame.readEntered && !frame.readSettled) return;
    frame.closeEntered = true;
    try {
      frame.closeReceipt = p.close(frame.transport);
      observe(frame.closeReceipt, value => {
        try {
          if (!closeReceipt(value) || !closedView(p.inspect(frame.transport))) fail();
          if (frame.held) { try { cancelTimer(); } catch {} return; }
          guard(); cancelTimer(); guard();
          if (!closedView(p.inspect(frame.transport)) || !invariant()) fail(); guard();
          const result = captureApiCreditOriginalGrantQueryOutput(F({ apiCreditOriginalGrantQueryVersion: 1,
            fundingResourceUrl: route.fundingResourceUrl, paymentHash: selected.query.originalFunding.transactionId.slice(8),
            requestId: selected.query.requestId, checkpointDigest: profile.checkpointDigest, queryDigest: profile.queryDigest,
            history: frame.candidate, transportCloseObserved: true, localPayerStore: 'NOT_OPENED',
            historicalObservation: true, reconciliationRequired: true, spendingReservation: 'UNCHANGED',
            mayStartPayment: false, maySignPayment: false, mayDispatchService: false, mayActivateGrant: false,
            nativeResourceRelease: 'NOT_ESTABLISHED', authority: 'NONE' }));
          guard(); frame.terminal = true; frame.candidate = null; out.resolve(result);
        } catch { hold(); }
      }, () => { hold(); try { cancelTimer(); } catch {} });
    } catch { hold(); }
  }
  function settled(value, rejected) {
    frame.readSettled = true;
    try {
      if (rejected || frame.held) fail(); guard();
      frame.candidate = captureServiceCreditOriginalFundingGrantResult(value, selected.query.originalFunding); guard();
    } catch { hold(); }
    requestClose();
  }
  try {
    frame.deadline = clock() + BigInt(t.requestDeadlineMs + t.closeGraceMs) * 1000000n;
    frame.timer = p.armTimer(t.requestDeadlineMs + t.closeGraceMs, F(() => { frame.timer = null; hold(); requestClose(); }));
    if (frame.timer === null || frame.timer === undefined) fail(); guard();
    frame.opaqueOpen = p.openTransport(c.profile); frame.transport = frame.opaqueOpen;
    if (frame.transport === null || typeof frame.transport !== 'object' || types.isProxy(frame.transport) || types.isPromise(frame.transport)) {
      frame.transport = null; fail();
    }
    guard(); const view = p.inspect(frame.transport);
    if (data(view, 'phase') !== 'OPEN' || data(view, 'unknown') !== false || data(view, 'requestStarts') !== 0
        || data(view, 'trackedRequests') !== 0 || data(view, 'trackedSockets') !== 0 || data(view, 'ownedTimers') !== 0) fail(); guard();
    frame.readEntered = true; frame.readReceipt = p.read(frame.transport, selected.query, profile.proof);
    observe(frame.readReceipt, value => settled(value, false), () => settled(null, true));
  } catch { hold(); requestClose(); if (!frame.readEntered) { try { cancelTimer(); } catch {} } }
  return out.promise;
}
export function captureApiCreditOriginalGrantQueryOutput(input) {
  if (arguments.length !== 1) fail();
  const c = fields(input, ['apiCreditOriginalGrantQueryVersion', 'fundingResourceUrl', 'paymentHash', 'requestId', 'checkpointDigest', 'queryDigest',
    'history', 'transportCloseObserved', 'localPayerStore', 'historicalObservation', 'reconciliationRequired', 'spendingReservation',
    'mayStartPayment', 'maySignPayment', 'mayDispatchService', 'mayActivateGrant', 'nativeResourceRelease', 'authority']);
  const identity = data(c.history, 'originalFunding'), selected = captureServiceCreditOriginalFundingGrantQuery({ queryVersion: 1, requestId: c.requestId, originalFunding: identity });
  captureOriginalFundingGrantRoute(c.fundingResourceUrl, selected.query.originalFunding.paymentResourceDigest);
  c.history = captureServiceCreditOriginalFundingGrantResult(c.history, selected.query.originalFunding);
  if (c.apiCreditOriginalGrantQueryVersion !== 1 || !hash(c.paymentHash) || 'zenontx:' + c.paymentHash !== selected.query.originalFunding.transactionId
      || !hash(c.checkpointDigest) || c.queryDigest !== selected.request.canonicalBodyDigest || c.transportCloseObserved !== true
      || c.localPayerStore !== 'NOT_OPENED' || c.historicalObservation !== true || c.reconciliationRequired !== true
      || c.spendingReservation !== 'UNCHANGED' || c.nativeResourceRelease !== 'NOT_ESTABLISHED' || c.authority !== 'NONE') fail();
  for (const key of ['mayStartPayment', 'maySignPayment', 'mayDispatchService', 'mayActivateGrant']) if (c[key] !== false) fail();
  const out = F(c); if (Buffer.byteLength(canonicalJson(out)) + 1 > 8192 || !invariant()) fail(); return out;
}
