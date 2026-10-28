import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { decodeApiCreditOperatorBootstrap, bindApiCreditOperatorBootstrap } from './api-credit-operator-bootstrap.js';

const F = Object.freeze, NP = Promise, PP = NP.prototype, THEN = PP.then, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn;
const FILL = Buffer.prototype.fill, TEXT = Buffer.prototype.toString, EQUALS = Buffer.prototype.equals;
const TYPED = Object.getPrototypeOf(Uint8Array.prototype), ARRAY_BUFFER = DESC(TYPED, 'buffer').get, LENGTH = DESC(TYPED, 'length').get;
const FAILED = new Set();
function fail() { throw new TypeError('API_CREDIT_OPERATOR_UNKNOWN'); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) { const d = DESC(value, name); if (!d?.enumerable || !OWN(d, 'value')) fail(); out[name] = d.value; }
  return out;
}
function own(value, name) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || !Object.isFrozen(value)) fail();
  const d = DESC(value, name); if (!d?.enumerable || !OWN(d, 'value')) fail(); return d.value;
}
function method(value, name) { const fn = own(value, name); if (typeof fn !== 'function' || types.isProxy(fn) || !Object.isFrozen(fn)) fail(); return fn; }
function observe(promise, yes, no) {
  if (PP.then !== THEN || DESC(Object.prototype, 'then') !== undefined || !types.isPromise(promise) || types.isProxy(promise)
      || Object.getPrototypeOf(promise) !== PP || Reflect.ownKeys(promise).some(k => k !== 'constructor')) fail();
  const d = DESC(promise, 'constructor'); if (d && (!OWN(d, 'value') || d.value !== NP)) fail();
  const bridge = Reflect.apply(THEN, promise, [yes, no]); Reflect.apply(THEN, bridge, [() => {}, () => {}]);
}
function capability() { let resolve, reject; const promise = new NP((yes, no) => { resolve = yes; reject = no; });
  Object.defineProperty(promise, 'constructor', { value: NP }); observe(promise, () => {}, () => {}); return { promise, resolve, reject }; }
function wipe(value) { if (value !== null && typeof value === 'object' && !types.isProxy(value) && Buffer.isBuffer(value)
  && Object.getPrototypeOf(value) === Buffer.prototype && !types.isSharedArrayBuffer(Reflect.apply(ARRAY_BUFFER, value, []))) Reflect.apply(FILL, value, [0]); }
/** Trusted operational ports are supplied only by the fixed native launcher.
 * JSON/argv cannot select them. DATA controls declare these ports explicitly.
 * All transitions are explicit commands after bootstrap; no pins are adopted
 * from replies and no prepare/funding/service operation is generated here. */
export async function runApiCreditOperatorCoordinator(configuration) {
  if (arguments.length !== 1 || FAILED.size >= 16) fail();
  const c = fields(configuration, ['arguments', 'ports']);
  const a = fields(c.arguments, ['mode', 'profileFd', 'keyFd', 'inputFd', 'outputFd', 'bootstrapMs']);
  if (a.mode !== 'RUN' || !Number.isSafeInteger(a.bootstrapMs) || a.bootstrapMs < 1 || a.bootstrapMs > 60000) fail();
  if ([a.profileFd, a.keyFd, a.inputFd, a.outputFd].some(fd => !Number.isSafeInteger(fd) || fd < 3 || fd > 1023)
      || new Set([a.profileFd, a.keyFd, a.inputFd, a.outputFd]).size !== 4) fail();
  const p = fields(c.ports, ['readProfile', 'readCredential', 'createKeyLease', 'openSession', 'runHost', 'closeInputs', 'readDay', 'clock', 'armTimer', 'cancelTimer']);
  for (const fn of Object.values(p)) if (typeof fn !== 'function' || types.isProxy(fn) || !Object.isFrozen(fn)) fail();
  const frame = { stage: 'PROFILE', prepared: null, profileBytes: null, credential: null, key: null, selection: null, session: null, host: null,
    opening: true, unknown: false, accepted: false, timer: null, current: null, deadline: null, lastClock: null,
    stops: new Map(), inputStop: null, stopUnknown: false, stopTerminal: false, observed: null, selectionTransferred: false,
    lateOwners: [], lateFacts: [], keyCreationEntered: false, sessionOpeningEntered: false };
  function clock() { const n = p.clock(); if (typeof n !== 'bigint' || frame.lastClock !== null && n < frame.lastClock) fail(); frame.lastClock = n; return n; }
  function rejectOpening() { if (!frame.opening) return; frame.unknown = true; frame.opening = false; if (frame.current !== null) frame.current.out.reject(new TypeError('API_CREDIT_BOOTSTRAP_EXPIRED')); FAILED.add(frame); }
  const guard = F(function requireOpening() {
    if (arguments.length !== 0 || !frame.opening || frame.unknown) fail();
    try { if (clock() >= frame.deadline) { rejectOpening(); fail(); } } catch { rejectOpening(); fail(); }
  });
  function requestStop(owner) {
    if (frame.stops.has(owner)) return frame.stops.get(owner);
    const receipt = { owner, promise: null, terminal: false, clean: false }; frame.stops.set(owner, receipt);
    try { receipt.promise = Reflect.apply(method(owner, 'close'), owner, []); observe(receipt.promise,
      value => { receipt.terminal = true; receipt.clean = value === undefined; if (!receipt.clean) frame.stopUnknown = true; },
      () => { receipt.terminal = true; frame.stopUnknown = true; }); }
    catch { receipt.terminal = true; frame.stopUnknown = true; }
    return receipt;
  }
  function late(kind, value) {
    if (kind === 'PROFILE' || kind === 'CREDENTIAL') { wipe(value); return; }
    try { method(value, 'close'); frame.lateOwners.push(value); requestStop(value); }
    catch { frame.lateFacts.push({ kind, unknown: true }); frame.stopUnknown = true; }
    FAILED.add(frame);
  }
  function opening(kind, invoke) {
    guard(); const ticket = { kind, out: capability(), actual: null, accepted: false }; frame.current = ticket;
    const stageGuard = F(function requireCurrentStage() {
      if (arguments.length !== 0 || frame.current !== ticket || ticket.accepted) fail(); guard();
    });
    try {
      ticket.actual = invoke(stageGuard);
      observe(ticket.actual, value => {
        if (!frame.opening || frame.current !== ticket || frame.unknown) { late(kind, value); return; }
        try { guard(); ticket.accepted = true; frame.current = null; frame.observed = value; ticket.out.resolve(undefined); }
        catch { late(kind, value); ticket.out.reject(new TypeError('API_CREDIT_BOOTSTRAP_EXPIRED')); }
      }, () => { if (frame.current === ticket && frame.opening) { frame.current = null; ticket.out.reject(new TypeError('API_CREDIT_BOOTSTRAP_REFUSED')); } });
    } catch { frame.unknown = true; frame.opening = false; ticket.out.reject(new TypeError('API_CREDIT_BOOTSTRAP_UNKNOWN')); }
    return ticket.out.promise;
  }
  async function native(promise) { const out = capability(); try { observe(promise, out.resolve, out.reject); } catch { out.reject(new TypeError('API_CREDIT_OPERATOR_UNKNOWN')); } return out.promise; }
  function stopView() {
    let v = null;
    if (frame.key !== null) {
      try { const current = Reflect.apply(method(frame.key, 'inspect'), frame.key, []);
        if (own(current, 'sdk105ExistingKeyLeaseVersion') !== 1) fail();
        v = F({ lifecycle: own(current, 'lifecycle'), held: own(current, 'held'), rawClearCalls: own(current, 'rawClearCalls'), rawClearReturned: own(current, 'rawClearReturned') });
        if (!['UNCLAIMED', 'CLAIMED', 'CLOSING', 'CLOSED', 'HELD'].includes(v.lifecycle) || typeof v.held !== 'boolean'
            || ![0, 1].includes(v.rawClearCalls) || typeof v.rawClearReturned !== 'boolean') fail();
      } catch { frame.stopUnknown = true; v = null; }
    }
    return v;
  }
  async function closeKnown() {
    const closeStart = clock(), budget = frame.prepared?.limits.closeWaitMs ?? 1000, deadline = closeStart + BigInt(budget) * 1000000n;
    if (frame.session !== null) requestStop(frame.session);
    if (frame.key !== null) requestStop(frame.key);
    try { frame.inputStop = p.closeInputs(); } catch { frame.stopUnknown = true; }
    const inputs = { terminal: false, clean: false };
    try { observe(frame.inputStop, v => { inputs.terminal = true; inputs.clean = v === undefined; if (!inputs.clean) frame.stopUnknown = true; }, () => { inputs.terminal = true; frame.stopUnknown = true; }); }
    catch { inputs.terminal = true; frame.stopUnknown = true; }
    const done = capability(); let timer = null;
    function decide() {
      if (frame.stopTerminal) return;
      try {
        if (clock() >= deadline) { frame.stopUnknown = true; frame.stopTerminal = true; done.resolve(false); return; }
        if (!inputs.terminal || [...frame.stops.values()].some(r => !r.terminal)) return;
        frame.stopTerminal = true;
        if (timer !== null) { p.cancelTimer(timer); timer = null; }
        done.resolve(!frame.stopUnknown && inputs.clean && [...frame.stops.values()].every(r => r.clean));
      } catch { frame.stopUnknown = true; frame.stopTerminal = true; done.resolve(false); }
    }
    // Observe the already-entered stops; never invoke a second stop on expiry.
    for (const receipt of frame.stops.values()) if (receipt.promise !== null) { try { observe(receipt.promise, decide, decide); } catch {} }
    try { observe(frame.inputStop, decide, decide); } catch {}
    try { timer = p.armTimer(budget, F(() => { if (frame.stopTerminal) return; frame.stopUnknown = true; frame.stopTerminal = true; done.resolve(false); })); } catch { frame.stopUnknown = true; frame.stopTerminal = true; done.resolve(false); }
    decide(); return native(done.promise);
  }
  let stopped = false, keyView = null;
  try {
    frame.deadline = clock() + BigInt(a.bootstrapMs) * 1000000n;
    frame.timer = p.armTimer(a.bootstrapMs, F(rejectOpening));
    await opening('PROFILE', stageGuard => p.readProfile(stageGuard)); frame.profileBytes = frame.observed; frame.observed = null; guard();
    if (types.isProxy(frame.profileBytes) || !Buffer.isBuffer(frame.profileBytes) || Object.getPrototypeOf(frame.profileBytes) !== Buffer.prototype
        || Reflect.apply(LENGTH, frame.profileBytes, []) > 262144 || types.isSharedArrayBuffer(Reflect.apply(ARRAY_BUFFER, frame.profileBytes, []))) fail();
    const text = Reflect.apply(TEXT, frame.profileBytes, ['utf8']); if (!Reflect.apply(EQUALS, Buffer.from(text), [frame.profileBytes])) fail();
    frame.prepared = decodeApiCreditOperatorBootstrap(text); wipe(frame.profileBytes); frame.profileBytes = null;
    frame.stage = 'CREDENTIAL'; await opening('CREDENTIAL', stageGuard => p.readCredential(stageGuard)); frame.credential = frame.observed; frame.observed = null; guard();
    if (types.isProxy(frame.credential) || !Buffer.isBuffer(frame.credential) || Object.getPrototypeOf(frame.credential) !== Buffer.prototype
        || Reflect.apply(LENGTH, frame.credential, []) !== 32 || types.isSharedArrayBuffer(Reflect.apply(ARRAY_BUFFER, frame.credential, []))) fail();
    frame.stage = 'KEY'; await opening('KEY', stageGuard => { frame.keyCreationEntered = true; return p.createKeyLease(frame.credential, frame.prepared.expectedIdentity, stageGuard); });
    frame.key = frame.observed; frame.observed = null;
    wipe(frame.credential); frame.credential = null; guard();
    method(frame.key, 'close'); method(frame.key, 'inspect');
    frame.selection = bindApiCreditOperatorBootstrap(frame.prepared, own(frame.key, 'keyPair'), p.readDay); guard();
    frame.stage = 'SESSION'; await opening('SESSION', stageGuard => { frame.sessionOpeningEntered = true; frame.selectionTransferred = true; return p.openSession(frame.selection, stageGuard, frame.prepared.limits); });
    frame.session = frame.observed; frame.observed = null; guard();
    method(frame.session, 'close'); method(frame.session, 'inspect');
    frame.accepted = true; frame.opening = false; if (frame.timer !== null) { p.cancelTimer(frame.timer); frame.timer = null; }
    frame.stage = 'COMMANDS';
    const hostDone = capability(); observe(p.runHost(frame.session), value => { frame.host = value; hostDone.resolve(undefined); }, hostDone.reject); await hostDone.promise;
    if (own(frame.host, 'buyerOriginalCommandHostResultVersion') !== 1 || own(frame.host, 'mode') !== 'FUNDING_API_CREDIT'
        || own(frame.host, 'exitCode') !== 0 || own(frame.host, 'status') !== 'CLOSED'
        || own(frame.host, 'ownersClosedObserved') !== true || own(frame.host, 'sessionLifecycle') !== 'CLOSED'
        || own(frame.host, 'sessionHeld') !== false || own(frame.host, 'outputOutcomeUnknown') !== false
        || own(frame.host, 'fundingOutcomeUnknown') !== false || own(frame.host, 'recoveryOutcomeUnknown') !== false) frame.unknown = true;
  } catch { frame.unknown = frame.unknown || frame.keyCreationEntered || frame.sessionOpeningEntered || frame.key !== null || frame.session !== null; }
  finally {
    frame.opening = false;
    if (frame.timer !== null) { try { p.cancelTimer(frame.timer); } catch { frame.unknown = true; } frame.timer = null; }
    wipe(frame.profileBytes); wipe(frame.credential);
    if (frame.selection !== null && !frame.selectionTransferred) { try { frame.selection.release(); } catch { frame.unknown = true; } }
    if (frame.prepared !== null) { try { frame.prepared.release(); } catch { frame.unknown = true; } }
    try { stopped = await closeKnown(); keyView = stopView(); } catch { frame.stopUnknown = true; }
  }
  const keyClean = frame.key === null || keyView !== null && keyView.lifecycle === 'CLOSED' && !keyView.held && keyView.rawClearCalls === 1 && keyView.rawClearReturned;
  const clean = stopped && keyClean && !frame.unknown && !frame.stopUnknown;
  const success = clean && frame.accepted && frame.host !== null;
  if (!clean) FAILED.add(frame);
  return F({ apiCreditOperatorCliVersion: 1, status: success ? 'CLOSED' : clean ? 'BOOTSTRAP_REFUSED' : 'CLOSE_UNKNOWN', exitCode: success ? 0 : clean ? 1 : 4,
    stage: frame.stage, keyCreationEntered: frame.keyCreationEntered, sessionOpeningEntered: frame.sessionOpeningEntered,
    sessionAccepted: frame.accepted, knownStopsObserved: stopped, keyLease: keyView, historicalObservation: true,
    keyErasure: 'NOT_ESTABLISHED', nativeResourceRelease: 'NOT_ESTABLISHED', serviceDelivery: 'NOT_ESTABLISHED', automaticRetry: false, authority: 'NONE' });
}
