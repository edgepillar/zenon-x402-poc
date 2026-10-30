import { types } from 'node:util';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, O = Object.hasOwn;
function fail() { throw F(new TypeError('ISSUED_PROVIDER_CLOSE_OBSERVATION')); }
function own(value, key) {
  if (value === null || typeof value !== 'object' || types.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype || !Object.isFrozen(value)) fail();
  const d = D(value, key);
  if (!d?.enumerable || !O(d, 'value')) fail();
  return d.value;
}
function provider(value) {
  if (own(value, 'phase') !== 'CLOSED' || own(value, 'held') !== false
      || own(value, 'released') !== true || own(value, 'activeOperations') !== 0) fail();
}
function auxiliary(value) {
  if (own(value, 'closed') !== true || own(value, 'held') !== false
      || own(value, 'active') !== false) fail();
}
function channel(value) {
  if (own(value, 'lifecycle') !== 'CLOSED' || own(value, 'held') !== false
      || own(value, 'reading') !== false || own(value, 'writing') !== false
      || own(value, 'writeCallbackPending') !== false || own(value, 'inputClosed') !== true
      || own(value, 'outputClosed') !== true || own(value, 'historicalClose') !== 'FULFILLED_UNDEFINED') fail();
}

/** Current returned-owner observations, not atomic fencing or physical-release
 * proof. Callers collect fresh views after their own asynchronous close steps.
 * No stop, release, callback, retry, store or economic capability is entered. */
export function requireIssuedProviderClosedAuxiliary(providerView, auxiliaryView) {
  if (arguments.length !== 2) fail();
  provider(providerView); auxiliary(auxiliaryView);
}

/** The same final contract is used by the controller and fixed native launcher.
 * A prior successful stop cannot substitute for any supplied current view. */
export function requireIssuedProviderClosedOwners(providerView, auxiliaryView, channelView) {
  if (arguments.length !== 3) fail();
  provider(providerView); auxiliary(auxiliaryView); channel(channelView);
}
