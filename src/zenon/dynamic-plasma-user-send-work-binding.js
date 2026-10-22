import { validateZenonUnsignedUserSendWork } from './dynamic-plasma-user-send-fixed-work.js';
import { BoundedDynamicPlasmaStrategy } from './bounded-dynamic-plasma-strategy.js';

const VALIDATE_WORK = validateZenonUnsignedUserSendWork;
const BIND_HASH_PRICE = BoundedDynamicPlasmaStrategy.prototype.bindHashedUserSend;
const APPLY = Reflect.apply;
const freeze = Object.freeze;
const define = Object.defineProperty;
const ErrorType = TypeError;

export { validateZenonUnsignedUserSendWork };

/**
 * Check the SAME detached block with the existing intent/hash/price consumer
 * and the independent fixed-cost full hash/nonce validator. Capture both
 * implementations, not a caller's subclass/callback. The price binding has
 * snapshotted the block before this await; the fixed validator deliberately
 * rechecks that immutable block's hash once more. No caller record is reread.
 * Legacy fixed validation is re-exported without changing function identity.
 * No work producer, key, approval or publication capability is returned.
 */
export async function bindZenonUnsignedUserSendWork(context, quote, accountBlock) {
  try {
    if (arguments.length !== 3) reject();
    const hashPriceBinding = await APPLY(BIND_HASH_PRICE, undefined, [context, quote, accountBlock]);
    const work = VALIDATE_WORK(hashPriceBinding.accountBlock).work;
    return freeze({
      unsignedWorkBindingVersion: 1,
      scope: 'DECLARED_UNSIGNED_USER_SEND_HASH_NONCE_AND_PRICE_BINDING',
      hashPriceBinding, work, authority: 'NONE', afterSigningAction: 'NONE',
      keyAddressBinding: 'NOT_PERFORMED', chainAuthentication: 'NOT_ESTABLISHED',
    });
  } catch { reject(); }
}

function reject() {
  const code = 'zenon_user_send_work_input_rejected';
  const error = new ErrorType(code);
  define(error, 'code', { value: code, enumerable: true });
  define(error, 'stack', { value: 'TypeError: ' + code, enumerable: false });
  throw freeze(error);
}
