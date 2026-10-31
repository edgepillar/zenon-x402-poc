import { types } from 'node:util';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn, APPLY = Reflect.apply;
const NP = Promise, PP = NP.prototype, THEN = PP.then, FILES = new WeakMap(), HELD = new Set();
const BASE = [[PP, 'then', D(PP, 'then')], [PP, 'constructor', D(PP, 'constructor')], [NP, Symbol.species, D(NP, Symbol.species)]];
function fail() { throw new TypeError('API_CREDIT_OPENING_FAILURE_CUSTODY'); }
function invariant() {
  return D(Object.prototype, 'then') === undefined && BASE.every(([object, name, expected]) => {
    const actual = D(object, name); return actual && Reflect.ownKeys(actual).length === Reflect.ownKeys(expected).length
      && Reflect.ownKeys(expected).every(key => OWN(actual, key) && actual[key] === expected[key]);
  });
}
function data(value, name) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || !Object.isFrozen(value)
      || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const d = D(value, name); if (!d?.enumerable || !OWN(d, 'value')) fail(); return d.value;
}
function method(value, name) { const fn = data(value, name); if (typeof fn !== 'function' || types.isProxy(fn) || !Object.isFrozen(fn)) fail(); return fn; }
function observe(promise, yes, no) {
  if (!invariant() || types.isProxy(promise) || !types.isPromise(promise) || Object.getPrototypeOf(promise) !== PP
      || Reflect.ownKeys(promise).some(key => key !== 'constructor')) fail();
  const ctor = D(promise, 'constructor'); if (ctor && (!OWN(ctor, 'value') || ctor.value !== NP)) fail();
  const bridge = APPLY(THEN, promise, [yes, no]); APPLY(THEN, bridge, [() => {}, () => {}]);
}
function discard(value) { try { observe(value, () => {}, () => {}); } catch {} }

/** Own the failed opening's budget file while no client/application facade
 * has returned. The native binding supplies actual owners; DATA tests declare
 * them. An entered unreturned borrower is not proof of a released borrower.
 * Revoke admission, retain those owners, and never close that physical file.
 * A known wallet with no client entry is stopped once before file release. */
export function createApiCreditOpeningFailureCustody(configuration) {
  if (arguments.length !== 1 || !invariant()) fail();
  const names = ['fileOwner', 'walletOwner', 'walletOpeningEntered', 'clientOpeningEntered'];
  if (configuration === null || typeof configuration !== 'object' || types.isProxy(configuration)
      || !Object.isFrozen(configuration) || Object.getPrototypeOf(configuration) !== Object.prototype
      || Reflect.ownKeys(configuration).length !== names.length) fail();
  const c = {}; for (const name of names) c[name] = data(configuration, name);
  if (typeof c.walletOpeningEntered !== 'boolean' || typeof c.clientOpeningEntered !== 'boolean'
      || c.walletOwner !== null && !c.walletOpeningEntered
      || c.clientOpeningEntered && (c.walletOwner === null || !c.walletOpeningEntered)) fail();
  const REVOKE = method(c.fileOwner, 'revoke'), CLOSE = method(c.fileOwner, 'close'), VIEW = method(c.fileOwner, 'inspect');
  let STOP = null, WALLET_VIEW = null;
  if (c.walletOwner !== null) { STOP = method(c.walletOwner, 'close'); WALLET_VIEW = method(c.walletOwner, 'inspect'); }
  const previous = FILES.get(c.fileOwner);
  if (previous !== undefined) {
    if (previous.wallet !== c.walletOwner || previous.walletEntered !== c.walletOpeningEntered || previous.clientEntered !== c.clientOpeningEntered) fail();
    return previous.controller;
  }
  if (HELD.size >= 16) fail();
  const frame = { file: c.fileOwner, wallet: c.walletOwner, walletEntered: c.walletOpeningEntered, clientEntered: c.clientOpeningEntered,
    held: false, busy: false, checking: false, revokeEntered: false, revokeReturned: false, revokeResult: null, walletStopEntered: false,
    walletStop: null, walletStopReturned: false, closeEntered: false, closeReturned: false, closeResult: null, controller: null };
  function hold() { frame.held = true; HELD.add(frame); }
  function fileView() { const value = APPLY(VIEW, frame.file, []); if (data(value, 'spendingFileOwnerVersion') !== 1) fail(); return value; }
  function walletStopped() {
    const value = APPLY(WALLET_VIEW, frame.wallet, []);
    return data(value, 'sdk105WalletOwnerVersion') === 1 && data(value, 'lifecycle') === 'CLOSED' && data(value, 'held') === false
      && data(value, 'activeOperation') === null && data(value, 'clearCalls') === 1 && data(value, 'clearOutcome') === 'CLEAR_RETURNED';
  }
  function fileStopped(value) {
    return data(value, 'lifecycle') === 'CLOSED' && data(value, 'held') === false && data(value, 'busy') === false
      && data(value, 'backendClosed') === true && data(value, 'databaseOpen') === false
      && data(value, 'physicalCloseEntered') === true && data(value, 'physicalCloseReturned') === true;
  }
  function closeFile() {
    if (frame.held || frame.busy || frame.closeEntered || !frame.revokeReturned
        || frame.clientEntered || frame.walletEntered && frame.wallet === null) return;
    frame.busy = true;
    try {
      if (!invariant() || frame.wallet !== null && (!frame.walletStopReturned || !walletStopped())) fail();
      const before = fileView();
      if (frame.held || data(before, 'lifecycle') !== 'REVOKED' || data(before, 'held') !== false || data(before, 'busy') !== false
          || data(before, 'backendClosed') !== true || data(before, 'databaseOpen') !== true
          || data(before, 'physicalCloseEntered') !== false || data(before, 'physicalCloseReturned') !== false) fail();
      frame.closeEntered = true;
      frame.closeResult = APPLY(CLOSE, frame.file, []); frame.closeReturned = frame.closeResult === undefined;
      if (!frame.closeReturned || !invariant()) { discard(frame.closeResult); fail(); }
      // Preserve the actual void return even if a subsequent view is unknown.
      if (!fileStopped(fileView()) || frame.wallet !== null && !walletStopped()) fail();
    } catch { hold(); }
    finally { frame.busy = false; }
  }
  const inspect = F(function inspect() {
    if (arguments.length !== 0) fail();
    // The close method's historical void receipt is immutable. A new read
    // still needs the same returned owners' current closed observations; it
    // never repeats cleanup or creates permission to resume opening.
    if (frame.closeReturned && !frame.held) {
      if (frame.checking || frame.busy) hold();
      else {
        frame.checking = true;
        try {
          if (!invariant() || !fileStopped(fileView())
              || frame.wallet !== null && !walletStopped() || frame.held) fail();
        } catch { hold(); }
        finally { frame.checking = false; }
      }
    }
    return F({ apiCreditOpeningFailureCustodyVersion: 1, lifecycle: frame.held ? 'HELD' : frame.closeReturned ? 'CLOSED' : 'CLOSING',
      held: frame.held, walletOpeningEntered: frame.walletEntered, clientOpeningEntered: frame.clientEntered,
      unreturnedBorrower: frame.clientEntered || frame.walletEntered && frame.wallet === null,
      fileRevokeEntered: frame.revokeEntered, fileRevokeReturned: frame.revokeReturned,
      walletStopEntered: frame.walletStopEntered, walletStopReturned: frame.walletStopReturned,
      fileCloseEntered: frame.closeEntered, fileCloseReturned: frame.closeReturned,
      fileOwnerRetained: frame.held || !frame.closeReturned, walletOwnerRetained: frame.wallet !== null,
      historicalObservation: true, openingMayResume: false, authority: 'NONE', nativeResourceRelease: 'NOT_ESTABLISHED' });
  });
  frame.controller = F({ inspect }); FILES.set(frame.file, frame);
  if (frame.clientEntered || frame.walletEntered && frame.wallet === null) hold();
  // Publish the one owner before invoking any trusted callback. Reentrant
  // construction can join the same observation, never request another stop.
  frame.revokeEntered = true;
  try {
    frame.revokeResult = APPLY(REVOKE, frame.file, []); frame.revokeReturned = frame.revokeResult === undefined;
    if (!frame.revokeReturned || !invariant()) { discard(frame.revokeResult); fail(); }
  }
  catch { hold(); }
  if (frame.clientEntered || frame.walletEntered && frame.wallet === null) return frame.controller;
  if (frame.wallet === null) closeFile();
  else {
    frame.walletStopEntered = true;
    try {
      frame.walletStop = APPLY(STOP, frame.wallet, []);
      observe(frame.walletStop, value => {
        try {
          if (value !== undefined || !invariant() || !walletStopped()) fail(); frame.walletStopReturned = true;
          if (!frame.held) closeFile();
        } catch { hold(); }
      }, hold);
    } catch { hold(); }
  }
  return frame.controller;
}
