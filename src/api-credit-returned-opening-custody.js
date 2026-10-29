import { types } from 'node:util';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn, APPLY = Reflect.apply;
const NP = Promise, PP = NP.prototype, THEN = PP.then, FILES = new WeakMap(), HELD = new Set();
const BASE = [[PP, 'then', D(PP, 'then')], [PP, 'constructor', D(PP, 'constructor')], [NP, Symbol.species, D(NP, Symbol.species)]];
function fail() { throw new TypeError('API_CREDIT_RETURNED_OPENING_CUSTODY'); }
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

/** Own a failed opening after the actual client and wallet returned, before
 * a joined application did. Native code supplies its fixed owners; tests use
 * declared DATA ports. Both original stop attempts are independent and cached.
 * A former successful callback never substitutes for the other owner's current
 * view at physical file close. UNKNOWN is sticky and never permits a retry. */
export function createApiCreditReturnedOpeningCustody(configuration) {
  if (arguments.length !== 1 || !invariant()) fail();
  const names = ['fileOwner', 'clientOwner', 'walletOwner'];
  if (configuration === null || typeof configuration !== 'object' || types.isProxy(configuration)
      || !Object.isFrozen(configuration) || Object.getPrototypeOf(configuration) !== Object.prototype
      || Reflect.ownKeys(configuration).length !== names.length) fail();
  const c = {}; for (const name of names) c[name] = data(configuration, name);
  if (c.fileOwner === c.clientOwner || c.fileOwner === c.walletOwner || c.clientOwner === c.walletOwner) fail();
  const REVOKE = method(c.fileOwner, 'revoke'), CLOSE = method(c.fileOwner, 'close'), FILE_VIEW = method(c.fileOwner, 'inspect');
  const CLIENT_STOP = method(c.clientOwner, 'close'), CLIENT_VIEW = method(c.clientOwner, 'inspect');
  const WALLET_STOP = method(c.walletOwner, 'close'), WALLET_VIEW = method(c.walletOwner, 'inspect');
  const previous = FILES.get(c.fileOwner);
  if (previous !== undefined) {
    if (previous.client !== c.clientOwner || previous.wallet !== c.walletOwner) fail(); return previous.controller;
  }
  if (HELD.size >= 16) fail();
  const frame = { file: c.fileOwner, client: c.clientOwner, wallet: c.walletOwner, held: false,
    armed: false, busy: false, checking: false, revokeEntered: false, revokeReturned: false, revokeResult: null,
    clientStopEntered: false, clientStop: null, clientStopReturned: false,
    walletStopEntered: false, walletStop: null, walletStopReturned: false,
    closeEntered: false, closeReturned: false, closeResult: null, controller: null };
  function hold() { frame.held = true; HELD.add(frame); }
  function clientStopped() {
    const v = APPLY(CLIENT_VIEW, frame.client, []);
    return data(v, 'nativeFundingServiceClientVersion') === 1 && data(v, 'lifecycle') === 'CLOSED'
      && data(v, 'held') === false && data(v, 'publicOperationActive') === false;
  }
  function walletStopped() {
    const v = APPLY(WALLET_VIEW, frame.wallet, []);
    return data(v, 'sdk105WalletOwnerVersion') === 1 && data(v, 'lifecycle') === 'CLOSED' && data(v, 'held') === false
      && data(v, 'activeOperation') === null && data(v, 'clearCalls') === 1 && data(v, 'clearOutcome') === 'CLEAR_RETURNED';
  }
  function fileView() { const v = APPLY(FILE_VIEW, frame.file, []); if (data(v, 'spendingFileOwnerVersion') !== 1) fail(); return v; }
  function fileStopped(v) {
    return data(v, 'lifecycle') === 'CLOSED' && data(v, 'held') === false && data(v, 'busy') === false
      && data(v, 'backendClosed') === true && data(v, 'databaseOpen') === false
      && data(v, 'physicalCloseEntered') === true && data(v, 'physicalCloseReturned') === true;
  }
  function currentStoppedOwners() { return invariant() && clientStopped() && walletStopped() && !frame.held; }
  function closeFile() {
    if (!frame.armed || frame.held || frame.busy || frame.closeEntered || !frame.revokeReturned
        || !frame.clientStopReturned || !frame.walletStopReturned) return;
    frame.busy = true;
    try {
      const before = fileView();
      if (data(before, 'lifecycle') !== 'REVOKED' || data(before, 'held') !== false || data(before, 'busy') !== false
          || data(before, 'backendClosed') !== true || data(before, 'databaseOpen') !== true
          || data(before, 'physicalCloseEntered') !== false || data(before, 'physicalCloseReturned') !== false
          || !currentStoppedOwners()) fail();
      frame.closeEntered = true;
      frame.closeResult = APPLY(CLOSE, frame.file, []); frame.closeReturned = frame.closeResult === undefined;
      if (!frame.closeReturned || !invariant()) { discard(frame.closeResult); fail(); }
      // Retain the real void return, even when the following observation fails.
      if (!fileStopped(fileView()) || !currentStoppedOwners()) fail();
    } catch { hold(); }
    finally { frame.busy = false; }
  }
  const inspect = F(function inspect() {
    if (arguments.length !== 0) fail();
    if (frame.closeReturned && !frame.held) {
      if (frame.checking || frame.busy) hold();
      else {
        frame.checking = true;
        try { if (!fileStopped(fileView()) || !currentStoppedOwners()) fail(); }
        catch { hold(); }
        finally { frame.checking = false; }
      }
    }
    return F({ apiCreditReturnedOpeningCustodyVersion: 1,
      lifecycle: frame.held ? 'HELD' : frame.closeReturned ? 'CLOSED' : 'CLOSING', held: frame.held,
      clientStopEntered: frame.clientStopEntered, clientStopReturned: frame.clientStopReturned,
      walletStopEntered: frame.walletStopEntered, walletStopReturned: frame.walletStopReturned,
      fileRevokeEntered: frame.revokeEntered, fileRevokeReturned: frame.revokeReturned,
      fileCloseEntered: frame.closeEntered, fileCloseReturned: frame.closeReturned,
      fileOwnerRetained: frame.held || !frame.closeReturned, clientOwnerRetained: true, walletOwnerRetained: true,
      openingMayResume: false, authority: 'NONE', nativeResourceRelease: 'NOT_ESTABLISHED' });
  });
  frame.controller = F({ inspect }); FILES.set(frame.file, frame);
  // Publish ownership before trusted callbacks. The wallet stop and logical
  // revocation are still attempted when the client's stop throws or is unknown.
  frame.clientStopEntered = true;
  try {
    frame.clientStop = APPLY(CLIENT_STOP, frame.client, []);
    observe(frame.clientStop, value => {
      try { if (value !== undefined || !invariant() || !clientStopped()) { discard(value); fail(); }
        frame.clientStopReturned = true; closeFile(); } catch { hold(); }
    }, hold);
  } catch { hold(); }
  frame.walletStopEntered = true;
  try {
    frame.walletStop = APPLY(WALLET_STOP, frame.wallet, []);
    observe(frame.walletStop, value => {
      try { if (value !== undefined || !invariant() || !walletStopped()) { discard(value); fail(); }
        frame.walletStopReturned = true; closeFile(); } catch { hold(); }
    }, hold);
  } catch { hold(); }
  frame.revokeEntered = true;
  try {
    frame.revokeResult = APPLY(REVOKE, frame.file, []); frame.revokeReturned = frame.revokeResult === undefined;
    if (!frame.revokeReturned || !invariant()) { discard(frame.revokeResult); fail(); }
  } catch { hold(); }
  frame.armed = true; closeFile();
  return frame.controller;
}
