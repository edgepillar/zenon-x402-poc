import { types as utilTypes } from 'node:util';

const F = Object.freeze, APPLY = Reflect.apply, DESC = Object.getOwnPropertyDescriptor;
const OWN = Object.hasOwn, PROTO = Object.getPrototypeOf, PROXY = utilTypes.isProxy;
const NativePromise = Promise, PROMISE = NativePromise.prototype, THEN = PROMISE.then;
const HOSTS = new WeakMap(), GET = WeakMap.prototype.get, SET = WeakMap.prototype.set;
const MODES = F(['FUNDING_ORIGINAL', 'RECOVER_EXISTING_ORIGINAL', 'RECOVER_EXISTING_ORIGINAL_WITH_BACKEND']);

/** Own one fresh actual command session. Cache its original run and close
 * observations, join its existing close budget, and return only bounded host
 * status DATA. No new owner, I/O, timer, signer, payment, result replay or retry.
 * A returned receipt is historical; it does not prove future resource state,
 * physical cleanup, grant validity, settlement or delivery. */
export function runBuyerOriginalCommandHost(session) {
  if (arguments.length !== 1 || session === null || typeof session !== 'object' || PROXY(session)) return rejected();
  const previous = APPLY(GET, HOSTS, [session]);
  if (previous !== undefined) return previous.promise;
  let RUN, CLOSE, VIEW;
  try {
    if (!Object.isFrozen(session) || PROTO(session) !== Object.prototype
        || Reflect.ownKeys(session).length !== 4) fail();
    RUN = method(session, 'run'); CLOSE = method(session, 'close'); VIEW = method(session, 'inspect');
    method(session, 'retainedResult');
  } catch { return rejected(); }
  const entry = pending(); entry.runReceipt = null; entry.closeReceipt = null;
  APPLY(SET, HOSTS, [session, entry]);
  let first;
  try {
    first = snapshot(APPLY(VIEW, session, []));
    // Never adopt or interrupt another caller's active/already-closed session.
    if (first.lifecycle !== 'OPEN' || first.held || first.runRequested || first.closeRequested
        || !first.executionDone || first.activeKind !== null || first.admittedOperations !== 0
        || first.commands !== 0 || first.currentOwnersClosed) fail();
  } catch { entry.reject(error()); return entry.promise; }
  async function call(fn, name) {
    try {
      const value = APPLY(fn, session, []); entry[name] = value;
      return await settle(value);
    } catch { return 'THREW'; }
  }
  async function execute() {
    let runCompletion = 'NOT_REQUESTED', closeCompletion = 'NOT_REQUESTED';
    try { runCompletion = await call(RUN, 'runReceipt'); }
    finally { closeCompletion = await call(CLOSE, 'closeReceipt'); }
    let current = null;
    try { current = snapshot(APPLY(VIEW, session, [])); } catch {}
    let status = 'CLOSE_UNKNOWN', exitCode = 4;
    const observedStopped = current !== null && current.executionDone && current.activeKind === null
      && current.currentOwnersClosed && current.clientClose === 'CLOSED' && current.channelClose === 'CLOSED';
    if (observedStopped && ['FULFILLED_UNDEFINED', 'REJECTED'].includes(closeCompletion)) {
      if (runCompletion === 'FULFILLED_UNDEFINED' && closeCompletion === 'FULFILLED_UNDEFINED'
          && current.lifecycle === 'CLOSED' && !current.held && !current.outputOutcomeUnknown
          && !current.fundingOutcomeUnknown && !current.recoveryOutcomeUnknown) {
        status = 'CLOSED'; exitCode = 0;
      } else if (runCompletion === 'REJECTED' && closeCompletion === 'REJECTED'
          && current.recoveryOutcomeUnknown && !current.outputOutcomeUnknown && !current.fundingOutcomeUnknown) {
        status = 'RECONCILIATION_REQUIRED'; exitCode = 2;
      } else if (runCompletion === 'REJECTED' && current.admittedOperations === 0
          && !current.outputOutcomeUnknown && !current.fundingOutcomeUnknown && !current.recoveryOutcomeUnknown) {
        status = 'INPUT_REFUSED'; exitCode = 1;
      } else { status = 'OUTCOME_UNKNOWN'; exitCode = 3; }
    }
    entry.resolve(F({ buyerOriginalCommandHostResultVersion: 1, status, exitCode, mode: first.mode,
      runCompletion, closeCompletion, sessionLifecycle: current?.lifecycle ?? 'UNKNOWN',
      sessionHeld: current?.held ?? true, ownersClosedObserved: observedStopped,
      outputOutcomeUnknown: current?.outputOutcomeUnknown ?? true,
      fundingOutcomeUnknown: current?.fundingOutcomeUnknown ?? true,
      recoveryOutcomeUnknown: current?.recoveryOutcomeUnknown ?? true,
      retainedResult: current?.retainedResult ?? false,
      localWriteCallbackCompleted: current?.retainedWriteCallbackCompleted ?? false,
      historicalObservation: true, authority: 'NONE', grantActivation: 'NOT_ESTABLISHED',
      serviceDelivery: 'NOT_ESTABLISHED', nativeResourceCleanup: 'NOT_QUALIFIED' }));
  }
  try {
    APPLY(THEN, execute(), [() => {}, () => entry.resolve(buyerOriginalCommandHostRefusalResult('HOST_REFUSED'))]);
  } catch { entry.resolve(buyerOriginalCommandHostRefusalResult('HOST_REFUSED')); }
  return entry.promise;
}

/** Sanitized entry failure. No assertion that partial native acquisitions
 * were released; their existing quarantine/owner cleanup rules remain. */
export function buyerOriginalCommandHostRefusalResult(stage) {
  if (arguments.length !== 1 || !['OPEN_REFUSED', 'HOST_REFUSED'].includes(stage)) fail();
  return F({ buyerOriginalCommandHostResultVersion: 1, status: stage,
    exitCode: stage === 'OPEN_REFUSED' ? 1 : 4, returnedSession: stage === 'HOST_REFUSED',
    resourceRelease: 'NOT_ESTABLISHED', historicalObservation: true,
    authority: 'NONE', grantActivation: 'NOT_ESTABLISHED', serviceDelivery: 'NOT_ESTABLISHED',
    nativeResourceCleanup: 'NOT_QUALIFIED' });
}
function snapshot(value) {
  if (data(value, 'buyerOriginalFundingCommandSessionVersion') !== 1) fail();
  const names = ['mode', 'lifecycle', 'held', 'runRequested', 'closeRequested', 'executionDone', 'activeKind',
    'admittedOperations', 'commands', 'clientClose', 'channelClose', 'historicalClose', 'outputOutcomeUnknown',
    'fundingOutcomeUnknown', 'recoveryOutcomeUnknown', 'retainedResult', 'retainedWriteCallbackCompleted', 'currentOwnersClosed'];
  const out = {};
  for (const name of names) Object.defineProperty(out, name, { value: data(value, name), enumerable: true });
  if (!MODES.includes(out.mode) || !['OPEN', 'CLOSING', 'CLOSED', 'HELD'].includes(out.lifecycle)
      || ![null, 'READ', 'EXECUTE', 'INSPECT', 'WRITE'].includes(out.activeKind)
      || !Number.isSafeInteger(out.admittedOperations) || out.admittedOperations < 0 || out.admittedOperations > 64
      || !Number.isSafeInteger(out.commands) || out.commands < 0 || out.commands > 64
      || !['NOT_REQUESTED', 'FULFILLED_UNDEFINED', 'REJECTED'].includes(out.historicalClose)) fail();
  for (const leg of ['clientClose', 'channelClose']) if (!['NOT_REQUESTED', 'PENDING', 'CLOSED', 'UNKNOWN'].includes(out[leg])) fail();
  for (const flag of ['held', 'runRequested', 'closeRequested', 'executionDone', 'outputOutcomeUnknown',
    'fundingOutcomeUnknown', 'recoveryOutcomeUnknown', 'retainedResult', 'retainedWriteCallbackCompleted', 'currentOwnersClosed'])
    if (typeof out[flag] !== 'boolean') fail();
  return F(out);
}
function method(value, name) {
  const d = DESC(value, name);
  if (!d || !OWN(d, 'value') || !d.enumerable || typeof d.value !== 'function' || PROXY(d.value) || !Object.isFrozen(d.value)) fail();
  return d.value;
}
function data(value, name) {
  if (value === null || typeof value !== 'object' || PROXY(value) || !Object.isFrozen(value)
      || PROTO(value) !== Object.prototype) fail();
  const d = DESC(value, name);
  if (!d || !OWN(d, 'value') || !d.enumerable) fail();
  return d.value;
}
function settle(value) {
  const out = pending();
  if (PROXY(value) || !utilTypes.isPromise(value) || PROTO(value) !== PROMISE
      || Object.getOwnPropertyNames(value).some(k => k !== 'constructor')) {
    out.resolve('INVALID_RETURN'); return out.promise;
  }
  const d = DESC(value, 'constructor');
  if (d !== undefined && (!OWN(d, 'value') || d.value !== NativePromise)) {
    out.resolve('INVALID_RETURN'); return out.promise;
  }
  try { APPLY(THEN, value, [result => out.resolve(result === undefined ? 'FULFILLED_UNDEFINED' : 'FULFILLED_NONVOID'),
    () => out.resolve('REJECTED')]); } catch { out.resolve('INVALID_RETURN'); }
  return out.promise;
}
function pending() {
  let resolve, reject; const promise = new NativePromise((yes, no) => { resolve = yes; reject = no; });
  Object.defineProperty(promise, 'constructor', { value: NativePromise });
  APPLY(THEN, promise, [() => {}, () => {}]); return { promise, resolve, reject };
}
function rejected() { const out = pending(); out.reject(error()); return out.promise; }
function error() {
  const code = 'buyer_original_command_host_entry_refused', value = new TypeError(code);
  Object.defineProperty(value, 'code', { value: code, enumerable: true });
  Object.defineProperty(value, 'stack', { value: 'TypeError: ' + code }); return F(value);
}
function fail() { throw error(); }
