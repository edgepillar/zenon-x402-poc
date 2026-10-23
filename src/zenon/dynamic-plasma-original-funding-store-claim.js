import { types as utilTypes } from 'node:util';

const NativeWeakSet = WeakSet;
const HAS = NativeWeakSet.prototype.has, ADD = NativeWeakSet.prototype.add;
const APPLY = Reflect.apply, FREEZE = Object.freeze;
const CREATE = Object.create, DEFINE = Object.defineProperty;
const IS_PROXY = utilTypes.isProxy, ErrorType = TypeError;
const CLAIMED = new NativeWeakSet();
const RECEIPT = CREATE(null);
for (const [name, value] of [
  ['storeClaimVersion', 1],
  ['scope', 'ONE_STORE_OBJECT_IN_THIS_MODULE_INSTANCE'],
  ['released', false],
  ['authority', 'NONE'],
]) put(RECEIPT, name, value, true);
FREEZE(RECEIPT);

/**
 * SDK/SQL-free one-use ownership fence for one opaque store OBJECT. The actual
 * effectful owner must FIRST check the real store class/profile and finish
 * non-operational preparer configuration, then call this before exposing its
 * prepared interface. A second owner of the same object cannot gain a new
 * candidate-preparation attempt. No property, getter, prototype or method of
 * the store is inspected/invoked here; the registry does not authenticate it.
 *
 * Claims never release, even on refusal, close, timeout or unknown commit.
 * This intentionally has no reset/inspection/retry API and stores only weak
 * object identity. It neither retains a store handle in returned DATA nor
 * closes, reads, creates, writes or reopens a database.
 *
 * Scope is this evaluated module instance and this object, NOT a DB path,
 * another object for the same file, another module namespace, process or
 * restart. Existing DB state, exclusive lifetime, external originals/pins and
 * fail-closed recovery remain the actual owners' duties. A receipt is the
 * same DATA for every first claim, not a transferable capability, proof of
 * durable custody, signer consent, payment or authority.
 */
export const claimZenonDynamicPlasmaOriginalFundingStore = FREEZE(
  function claimZenonDynamicPlasmaOriginalFundingStore(store) {
    if (arguments.length !== 1 || typeof store !== 'object' || store === null || IS_PROXY(store))
      fail('input_rejected');
    if (APPLY(HAS, CLAIMED, [store])) fail('already_claimed');
    APPLY(ADD, CLAIMED, [store]);
    return RECEIPT;
  },
);

function put(target, name, value, enumerable) {
  const d = CREATE(null);
  d.value = value; d.enumerable = enumerable; d.writable = false; d.configurable = false;
  DEFINE(target, name, d);
}
function fail(kind) {
  const code = 'zenon_dynamic_plasma_original_funding_store_claim_' + kind;
  const error = new ErrorType(code);
  put(error, 'code', code, true);
  put(error, 'stack', 'TypeError: ' + code, false);
  throw FREEZE(error);
}
