import { types } from 'node:util';

const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn, APPLY = Reflect.apply;
const NP = Promise, PP = NP.prototype, THEN = PP.then, OP = Object.prototype;
const BASELINES = [[PP, 'then', DESC(PP, 'then')], [PP, 'constructor', DESC(PP, 'constructor')], [NP, Symbol.species, DESC(NP, Symbol.species)]];
const LEASES = new Set(), SEEN = new WeakSet(), HANDLES = new WeakMap();
function error() { const e = new TypeError('SDK105_API_CREDIT_KEY_LEASE_UNKNOWN'); Object.defineProperty(e, 'stack', { value: e.message }); return F(e); }
function fail() { throw error(); }
function invariant() {
  return DESC(OP, 'then') === undefined && BASELINES.every(([object, name, expected]) => {
    const actual = DESC(object, name); return !!actual && Reflect.ownKeys(actual).length === Reflect.ownKeys(expected).length
      && Reflect.ownKeys(expected).every(k => OWN(actual, k) && actual[k] === expected[k]);
  });
}
function data(value, name) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || !Object.isFrozen(value)) fail();
  const d = DESC(value, name); if (!d?.enumerable || !OWN(d, 'value')) fail(); return d.value;
}
function sdkMethod(receiver, name) {
  let at = receiver;
  for (let depth = 0; depth < 8 && at !== null && at !== OP; depth++) {
    if (types.isProxy(at)) fail(); const d = DESC(at, name);
    if (d !== undefined) { if (!OWN(d, 'value') || typeof d.value !== 'function' || types.isProxy(d.value)) fail(); return d.value; }
    at = Object.getPrototypeOf(at);
  }
  fail();
}
function observe(promise, yes, no) {
  if (!invariant() || !types.isPromise(promise) || types.isProxy(promise) || Object.getPrototypeOf(promise) !== PP
      || Reflect.ownKeys(promise).some(k => k !== 'constructor')) fail();
  const d = DESC(promise, 'constructor'); if (d !== undefined && (!OWN(d, 'value') || d.value !== NP)) fail();
  const bridge = APPLY(THEN, promise, [yes, no]); APPLY(THEN, bridge, [discard, discard]);
}
function capability() {
  if (!invariant()) fail(); let resolve, reject;
  const promise = new NP((yes, no) => { resolve = yes; reject = no; });
  Object.defineProperty(promise, 'constructor', { value: NP }); observe(promise, discard, discard); return { promise, resolve, reject };
}
function discard() {}
function hold(state) { state.held = true; state.lifecycle = 'HELD'; LEASES.add(state); }
function finish(state) {
  if (state.held || !invariant() || state.rawClearCalls !== 1 || !state.rawClearReturned) { hold(state); state.closing.reject(error()); return; }
  state.lifecycle = 'CLOSED'; state.receiver = null; LEASES.delete(state); state.closing.resolve(undefined);
}
function rawClear(state) {
  if (state.keyActive || state.rawClearCalls !== 0 || state.receiver === null || !invariant()) fail();
  state.rawClearCalls = 1;
  try {
    const value = APPLY(state.raw.clear, state.receiver, []);
    if (value !== undefined || !invariant()) {
      state.unobservedClearResult = value; hold(state);
      // Suppress only a descriptor-safe native rejection. No thenable getter,
      // assimilation, second clear, authority reset or claimed completion.
      try { observe(value, discard, discard); } catch {}
      fail();
    }
    state.rawClearReturned = true; return undefined;
  } catch { hold(state); fail(); }
}
function ownerStopped(state) {
  const v = APPLY(state.ownerInspect, state.owner, []);
  return data(v, 'sdk105WalletOwnerVersion') === 1 && data(v, 'lifecycle') === 'CLOSED' && data(v, 'held') === false
    && data(v, 'activeOperation') === null && data(v, 'clearCalls') === 1 && data(v, 'clearOutcome') === 'CLEAR_RETURNED';
}
function stopOwner(state) {
  if (state.ownerStopEntered) return;
  state.ownerStopEntered = true;
  try {
    state.ownerStop = APPLY(state.ownerClose, state.owner, []);
    observe(state.ownerStop, value => {
      try {
        state.ownerStopReturned = value === undefined && ownerStopped(state);
        if (!state.ownerStopReturned) fail();
        // A late known stop can improve only its retained cleanup facts.
        // The first UNKNOWN/HELD close never changes into success.
        if (state.held) return;
        finish(state);
      } catch { hold(state); state.closing.reject(error()); }
    }, () => { hold(state); state.closing.reject(error()); });
  } catch { hold(state); state.closing.reject(error()); }
}
/** Own one EXCLUSIVE already-existing SDK KeyPair; construction calls no key
 * method and never constructs a key. Before native claim, close revokes that
 * claim and clears once. After claim, close delegates only to the same bound
 * wallet owner's stop; it never competes with that owner by clearing directly.
 * SDK clear return is a receipt, not proof of memory erasure or signer recovery. */
export function createSdk105ApiCreditExistingKeyLease(keyPair) {
  if (arguments.length !== 1 || !invariant() || keyPair === null || typeof keyPair !== 'object' || types.isProxy(keyPair)
      || SEEN.has(keyPair) || LEASES.size >= 16) fail();
  const raw = {};
  for (const name of ['getAddress', 'getPublicKey', 'sign', 'clear']) raw[name] = sdkMethod(keyPair, name);
  const state = { receiver: keyPair, raw, lifecycle: 'UNCLAIMED', claimed: false, stopRequested: false, held: false,
    keyActive: false, keyMethodEntries: 0, rawClearCalls: 0, rawClearReturned: false, unobservedClearResult: null,
    owner: null, ownerClose: null, ownerInspect: null, ownerStopEntered: false, ownerStop: null, ownerStopReturned: false, closing: null };
  const handle = {};
  for (const name of ['getAddress', 'getPublicKey', 'sign']) handle[name] = F(function method(input) {
    if (arguments.length !== (name === 'sign' ? 1 : 0) || !invariant() || !state.claimed || state.owner === null
        || state.stopRequested || state.held || state.keyActive || state.rawClearCalls !== 0) fail();
    state.keyActive = true; state.keyMethodEntries++;
    try { return APPLY(raw[name], state.receiver, name === 'sign' ? [input] : []); }
    catch { fail(); }
    finally { state.keyActive = false; }
  });
  handle.clear = F(function clear() {
    if (arguments.length !== 0 || !state.claimed || state.owner === null) fail();
    return rawClear(state);
  });
  const close = F(function close() {
    if (arguments.length !== 0) fail(); if (state.closing !== null) return state.closing.promise;
    state.closing = capability(); state.stopRequested = true; state.lifecycle = 'CLOSING';
    if (!state.claimed) {
      try { rawClear(state); finish(state); } catch { hold(state); state.closing.reject(error()); }
    } else if (state.owner === null) { hold(state); state.closing.reject(error()); }
    else stopOwner(state);
    return state.closing.promise;
  });
  const inspect = F(function inspect() {
    if (arguments.length !== 0) fail(); if (!invariant()) hold(state);
    return F({ sdk105ExistingKeyLeaseVersion: 1, lifecycle: state.lifecycle, held: state.held, nativeClaimed: state.claimed,
      walletOwnerBound: state.owner !== null, stopRequested: state.stopRequested, keyOperationActive: state.keyActive,
      keyMethodEntries: state.keyMethodEntries, rawClearCalls: state.rawClearCalls, rawClearReturned: state.rawClearReturned,
      ownerStopEntered: state.ownerStopEntered, ownerStopReturned: state.ownerStopReturned,
      unobservedClearResultHeld: state.unobservedClearResult !== null, historicalObservation: true,
      keyErasure: 'NOT_ESTABLISHED', signerRecovery: 'NOT_ESTABLISHED', authority: 'NONE' });
  });
  F(handle); const lease = F({ keyPair: handle, close, inspect });
  HANDLES.set(handle, state); SEEN.add(keyPair); LEASES.add(state); return lease;
}
/** Called synchronously by the fixed native application immediately before
 * constructing its wallet owner. Bare legacy keys retain their old contract. */
export function claimSdk105ApiCreditExistingKeyLease(keyPair) {
  if (arguments.length !== 1 || keyPair === null || typeof keyPair !== 'object' || types.isProxy(keyPair)) fail();
  const state = HANDLES.get(keyPair); if (!state) return false;
  if (!invariant() || state.claimed || state.stopRequested || state.held || state.lifecycle !== 'UNCLAIMED') fail();
  state.claimed = true; state.lifecycle = 'CLAIMED'; return true;
}
/** The fixed binding supplies the actual wallet owner, never operator JSON.
 * A late owner is stopped once even when the original close is already HELD. */
export function bindSdk105ApiCreditExistingKeyLeaseOwner(keyPair, owner) {
  if (arguments.length !== 2 || keyPair === null || typeof keyPair !== 'object' || types.isProxy(keyPair)) fail();
  const state = HANDLES.get(keyPair); if (!state) return false;
  if (!invariant() || !state.claimed || state.owner !== null) fail();
  const close = data(owner, 'close'), inspect = data(owner, 'inspect');
  for (const fn of [close, inspect]) if (typeof fn !== 'function' || types.isProxy(fn) || !Object.isFrozen(fn)) fail();
  state.owner = owner; state.ownerClose = close; state.ownerInspect = inspect;
  if (state.stopRequested) { stopOwner(state); fail(); }
  return true;
}
