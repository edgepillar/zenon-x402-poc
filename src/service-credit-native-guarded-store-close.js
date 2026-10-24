import { types as utilTypes } from 'node:util';

const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, PROTO = Object.getPrototypeOf;
const KEYS = Reflect.ownKeys, OWN = Object.hasOwn, APPLY = Reflect.apply, IS_PROXY = utilTypes.isProxy;

/**
 * One synchronous close boundary, used INSIDE the actual owned V6 root after
 * its async child join. The root supplies its captured actual store.close and
 * a private current native-resource guard. Neither callback is a native brand.
 * No SQL/SDK/network/timer module, resource creation or retry is provided here.
 *
 * Check the guard immediately BEFORE actual close entry and AFTER its void
 * return. Reentry, false/nonboolean/throw and close throw/invalid return latch
 * UNKNOWN. No second attempt is possible. A post-return refusal cannot undo or
 * deny a close that already returned. Only the source root can quarantine or
 * release its own resource slot. These facts do not establish physical drain.
 */
export function createNativeGuardedStoreCloseBoundary(configuration) {
  if (arguments.length !== 1 || configuration === null || typeof configuration !== 'object'
      || IS_PROXY(configuration) || PROTO(configuration) !== Object.prototype
      || !Object.isFrozen(configuration) || KEYS(configuration).length !== 2) fail();
  const c = {};
  for (const name of ['nativeGuard', 'closeResource']) {
    const d = DESC(configuration, name);
    if (!d || !OWN(d, 'value') || !d.enumerable || typeof d.value !== 'function'
        || IS_PROXY(d.value) || PROTO(d.value) !== Function.prototype || !Object.isFrozen(d.value)) fail();
    c[name] = d.value;
  }
  const GUARD = c.nativeGuard, CLOSE = c.closeResource;
  configuration = null;
  let attempted = false, running = false, held = false, clean = false;
  let entered = false, returned = false, guardChecks = 0, firstRefusal = null;
  let stage = 'NOT_REQUESTED', closeOutcome = 'NOT_ENTERED';
  function hold(reason) {
    if (!held) firstRefusal = reason;
    held = true; clean = false; stage = returned ? 'HELD_AFTER_CLOSE_RETURN' : entered ? 'HELD_DURING_CLOSE' : 'HELD_BEFORE_CLOSE';
  }
  function guard(label) {
    guardChecks++;
    let allowed = false;
    try { allowed = APPLY(GUARD, undefined, []) === true; }
    catch { hold(label + '_THREW'); return false; }
    if (!allowed) hold(label + '_REFUSED');
    return allowed && !held;
  }
  const close = F(function close() {
    if (arguments.length !== 0) fail();
    if (running) { hold('REENTRANT_CLOSE'); return false; }
    if (attempted) return clean;
    attempted = true; running = true; stage = 'CHECKING_BEFORE_CLOSE';
    try {
      if (!guard('BEFORE')) return false;
      entered = true; stage = 'RESOURCE_CLOSE'; closeOutcome = 'PENDING';
      let value;
      try { value = APPLY(CLOSE, undefined, []); }
      catch { closeOutcome = 'THREW'; hold('RESOURCE_CLOSE_THREW'); return false; }
      // A non-void value is not the actual synchronous store close contract.
      if (value !== undefined) { closeOutcome = 'INVALID_RETURN'; hold('RESOURCE_CLOSE_INVALID_RETURN'); return false; }
      returned = true; closeOutcome = 'VOID_RETURNED';
      stage = held ? 'HELD_AFTER_CLOSE_RETURN' : 'CHECKING_AFTER_CLOSE';
      if (!guard('AFTER')) return false;
      clean = true; stage = 'CLOSED'; return true;
    } finally { running = false; }
  });
  const snapshot = F(function snapshot() {
    if (arguments.length !== 0) fail();
    return F({ nativeGuardedStoreCloseVersion: 1, attempted, running, held, clean, stage,
      firstRefusal, guardChecks, resourceCloseEntered: entered, resourceCloseReturned: returned,
      resourceCloseOutcome: closeOutcome, automaticRetry: false, authority: 'NONE',
      nativeHandleBrandAuthenticated: false, physicalDrain: 'NOT_ESTABLISHED' });
  });
  return F({ close, snapshot });
}
function fail() {
  const code = 'native_guarded_store_close_input_rejected', error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code });
  throw F(error);
}
