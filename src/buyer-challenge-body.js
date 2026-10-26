import { ReadableStream } from 'node:stream/web';
import { types as utilTypes } from 'node:util';
import { observeServiceCreditOperationDrain } from './service-credit-bounded-operation-drain.js';

const CANCEL = ReadableStream.prototype.cancel, APPLY = Reflect.apply;
const NativePromise = Promise, PROTOTYPE = Object.getPrototypeOf;
const PROMISE = NativePromise.prototype, THEN = PROMISE.then;
const DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn;
const IS_PROMISE = utilTypes.isPromise, IS_PROXY = utilTypes.isProxy;
const INTEGER = Number.isSafeInteger, F = Object.freeze;
const DRAIN = observeServiceCreditOperationDrain;

/**
 * Cancel only the buyer's discarded initial 402 body before payment creation.
 * No body buffering, fetch, payment, key, retry, store or transport is owned here.
 * A settled Web Stream cancellation is not physical socket-close evidence.
 * The 1..1000 ms budget is cooperative; a blocked event loop can delay it.
 * Missing/null bodies retain response-like fixture compatibility.
 */
export async function cancelBuyerChallengeBody(response, budgetMs = 1000) {
  if (arguments.length < 1 || arguments.length > 2 || !INTEGER(budgetMs)
      || budgetMs < 1 || budgetMs > 1000 || response === null
      || (typeof response !== 'object' && typeof response !== 'function') || IS_PROXY(response)) return false;
  let body = null;
  try {
    body = response.body;
    if (body === null || body === undefined) return true;
    if ((typeof body !== 'object' && typeof body !== 'function') || IS_PROXY(body)) return false;
    return await DRAIN(F(function cancelOnce() {
      // The observer arms its deadline before entering the trusted stream.
      // Native cancellation bypasses caller replacement methods/accessors.
      const result = APPLY(CANCEL, body, []);
      if (!IS_PROMISE(result) || IS_PROXY(result) || PROTOTYPE(result) !== PROMISE) return 'UNKNOWN';
      const ctor = DESC(result, 'constructor');
      if (ctor !== undefined && (!OWN(ctor, 'value') || ctor.value !== NativePromise)) return 'UNKNOWN';
      return APPLY(THEN, result, [() => 'DRAINED', () => 'UNKNOWN']);
    }), budgetMs);
  } catch {
    return false;
  } finally {
    body = null;
    response = null;
  }
}
