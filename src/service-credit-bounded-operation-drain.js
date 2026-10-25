import { types as utilTypes } from 'node:util';
import { performance } from 'node:perf_hooks';

const NativePromise = Promise, THEN = NativePromise.prototype.then;
const PROMISE_PROTOTYPE = NativePromise.prototype;
const APPLY = Reflect.apply, DESCRIPTOR = Object.getOwnPropertyDescriptor;
const PROTOTYPE = Object.getPrototypeOf, HAS = Object.hasOwn;
const KEYS = Reflect.ownKeys, CREATE = Object.create, DEFINE = Object.defineProperty;
const IS_PROMISE = utilTypes.isPromise, IS_PROXY = utilTypes.isProxy;
const SPECIES = Symbol.species;
const THEN_DESCRIPTOR = DESCRIPTOR(PROMISE_PROTOTYPE, 'then');
const CONSTRUCTOR_DESCRIPTOR = DESCRIPTOR(PROMISE_PROTOTYPE, 'constructor');
const SPECIES_DESCRIPTOR = DESCRIPTOR(NativePromise, SPECIES);
const SET_TIMEOUT = setTimeout, CLEAR_TIMEOUT = clearTimeout;
const NOW = performance.now.bind(performance), FINITE = Number.isFinite;
const INTEGER = Number.isSafeInteger, MIN = Math.min, CEIL = Math.ceil;
const MAX_OBSERVATIONS = 64, MAX_DELAY_MS = 32;

/**
 * Cooperatively observe a caller-owned operation, without dispatch authority.
 * Only DRAINED before the monotonic deadline can resolve true. BUSY is retried
 * with 1/2/4/.../32 ms backoff; UNKNOWN, errors, invalid results, 64 observations
 * or the deadline resolve false. A pending probe does not block the watchdog.
 *
 * A terminal result is never upgraded by late completion and no new probe is
 * scheduled afterward. This does not cancel the probe, prove native resource
 * release, close a store or authorize a retry. A blocked event loop can delay
 * the watchdog: this is NOT an OS or hostile-code hard-timeout guarantee.
 * Captured Promise descriptors must remain stable before/after a probe and at
 * completion. Drift is UNKNOWN, never a fresh DRAINED permit. No inherited
 * constructor/species getter may substitute for the supported native boundary.
 * Returned promises pin their own constructor without consulting a getter.
 */
export function observeServiceCreditOperationDrain(probe, budgetMs) {
  if (arguments.length !== 2 || typeof probe !== 'function' || IS_PROXY(probe)
      || !INTEGER(budgetMs) || budgetMs < 1 || budgetMs > 1000 || !invariant()) {
    return shield(new NativePromise(resolve => resolve(false)));
  }
  return shield(new NativePromise(resolve => {
    let terminal = false, watchdog = null, wake = null, observations = 0, delayMs = 1;
    let started, deadline;
    function finish(drained) {
      if (terminal) return;
      terminal = true;
      let cancelled = true;
      for (const handle of [watchdog, wake]) {
        if (handle === null) continue;
        try { CLEAR_TIMEOUT(handle); } catch { cancelled = false; }
      }
      watchdog = null; wake = null;
      resolve(drained === true && cancelled && invariant());
    }
    function beforeDeadline() {
      if (terminal) return false;
      if (!invariant()) { finish(false); return false; }
      let now;
      try { now = NOW(); } catch { finish(false); return false; }
      if (!FINITE(now) || now < started || now >= deadline) {
        finish(false); return false;
      }
      return true;
    }
    function accept(value) {
      if (!beforeDeadline()) return;
      if (value === 'DRAINED') { finish(true); return; }
      if (value !== 'BUSY' || observations >= MAX_OBSERVATIONS) {
        finish(false); return;
      }
      try {
        const remaining = deadline - NOW();
        if (!FINITE(remaining) || remaining <= 0) { finish(false); return; }
        const waitMs = MIN(delayMs, CEIL(remaining));
        delayMs = MIN(delayMs * 2, MAX_DELAY_MS);
        wake = SET_TIMEOUT(() => { wake = null; check(); }, waitMs);
      } catch { finish(false); }
    }
    function check() {
      if (!beforeDeadline()) return;
      if (++observations > MAX_OBSERVATIONS) { finish(false); return; }
      let result;
      try { result = APPLY(probe, undefined, []); }
      catch { finish(false); return; }
      if (!beforeDeadline()) return;
      if (typeof result === 'string') { accept(result); return; }
      // Never assimilate an arbitrary thenable or touch its then getter.
      if (!IS_PROMISE(result) || IS_PROXY(result) || PROTOTYPE(result) !== PROMISE_PROTOTYPE) {
        finish(false); return;
      }
      const constructor = DESCRIPTOR(result, 'constructor');
      if (constructor !== undefined && (!HAS(constructor, 'value') || constructor.value !== NativePromise)) {
        finish(false); return;
      }
      try { APPLY(THEN, result, [accept, () => finish(false)]); }
      catch { finish(false); }
    }
    try {
      started = NOW(); deadline = started + budgetMs;
      if (!FINITE(started) || !FINITE(deadline)) { finish(false); return; }
      watchdog = SET_TIMEOUT(() => finish(false), budgetMs);
      check();
    } catch { finish(false); }
  }));
}

function invariant() {
  return same(DESCRIPTOR(PROMISE_PROTOTYPE, 'then'), THEN_DESCRIPTOR)
    && same(DESCRIPTOR(PROMISE_PROTOTYPE, 'constructor'), CONSTRUCTOR_DESCRIPTOR)
    && same(DESCRIPTOR(NativePromise, SPECIES), SPECIES_DESCRIPTOR);
}
function same(actual, expected) {
  if (!actual || !expected || KEYS(actual).length !== KEYS(expected).length) return false;
  for (const key of KEYS(expected)) if (!HAS(actual, key) || actual[key] !== expected[key]) return false;
  return true;
}
function shield(promise) {
  const descriptor = CREATE(null); descriptor.value = NativePromise;
  DEFINE(promise, 'constructor', descriptor); return promise;
}
