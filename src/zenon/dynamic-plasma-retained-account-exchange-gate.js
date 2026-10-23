import { types as utilTypes } from 'node:util';
import { snapshotDynamicPlasmaQuoteRequest } from './dynamic-plasma-json-rpc-read-transport.js';

const CHECK_PAYER = snapshotDynamicPlasmaQuoteRequest;
const FREEZE = Object.freeze, CREATE = Object.create, DEFINE = Object.defineProperty;
const DESCRIPTOR = Object.getOwnPropertyDescriptor, PROTOTYPE = Object.getPrototypeOf;
const KEYS = Reflect.ownKeys, HAS = Object.hasOwn, APPLY = Reflect.apply;
const IS_PROXY = utilTypes.isProxy, OBJECT = Object.prototype, ErrorType = TypeError;
const IS_FROZEN = Object.isFrozen;
const NativePromise = Promise, THEN = NativePromise.prototype.then;
const PROMISE = NativePromise.prototype, SPECIES = Symbol.species;
const INITIAL_CTOR = DESCRIPTOR(PROMISE, 'constructor'), INITIAL_SPECIES = DESCRIPTOR(NativePromise, SPECIES);
const INITIAL_THEN = DESCRIPTOR(PROMISE, 'then'), INITIAL_OBJECT_THEN = DESCRIPTOR(OBJECT, 'then');
const REGEX = RegExp.prototype.exec;
const BODY = /^\{"jsonrpc":"2\.0","id":([1-9]|1[0-8]),"method":"(ledger\.getFrontierAccountBlock|ledger\.getAccountInfoByAddress)","params":\["(z1[a-z0-9]{38})"\]\}$/;
const EMPTY_INTENT = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

/**
 * Closed byte-preserving account-exchange adapter for ONE contextv7 run.
 * Only the existing account-state core's exact generated eighteen-ID grammar
 * is forwarded, with the actual address codec. No JSON re-encoding, ID reset,
 * funding/publish method, new request, replacement or normalization fallback.
 * The supplied owner retains the genuine count/HTTPS/close duties and MUST
 * prehandle its own rejected promises. This gate alone is not a native owner
 * brand, endpoint authentication, native drain proof or dispatch authority.
 */
export function createRetainedAccountStateExchangeGate(owner) {
  let exchange, close;
  try {
    if (arguments.length !== 1 || !invariant() || typeof owner !== 'object' || owner === null || IS_PROXY(owner)
        || PROTOTYPE(owner) !== OBJECT || !IS_FROZEN(owner) || KEYS(owner).length !== 2) reject();
    exchange = method(owner, 'exchange'); close = method(owner, 'close');
  } catch { reject(); }
  const EXCHANGE = exchange, CLOSE = close;
  const unavailable = prehandledFailure();
  let blocked = false;
  function block() {
    if (!blocked) {
      blocked = true;
      // Observe only through the actual owner's returned close contract.
      // It must prehandle failure; never infer successful native cleanup here.
      try { APPLY(CLOSE, undefined, []); } catch {}
    }
    return unavailable;
  }
  const guardedExchange = FREEZE(function exchange(body) {
    if (blocked) return unavailable;
    if (!invariant()) return block();
    try {
      if (arguments.length !== 1 || typeof body !== 'string' || body.length > 1024) return block();
      const match = APPLY(REGEX, BODY, [body]);
      if (match === null) return block();
      const payer = match[3];
      CHECK_PAYER({ address: payer, blockType: 2, toAddress: payer, data: EMPTY_INTENT });
      return APPLY(EXCHANGE, undefined, [body]);
    } catch { return block(); }
  });
  return FREEZE({ exchange: guardedExchange, close: CLOSE });
}
function prehandledFailure() {
  const promise = new NativePromise((_, rejectPromise) => rejectPromise(problem()));
  const d = CREATE(null); d.value = NativePromise; DEFINE(promise, 'constructor', d);
  APPLY(THEN, promise, [undefined, () => undefined]);
  return FREEZE(promise);
}
function problem() {
  const code = 'retained_account_state_exchange_unavailable', error = new ErrorType(code);
  const d = CREATE(null); d.value = code; d.enumerable = true; DEFINE(error, 'code', d);
  const stack = CREATE(null); stack.value = 'TypeError: ' + code;
  DEFINE(error, 'stack', stack); return FREEZE(error);
}
function method(owner, name) {
  const d = DESCRIPTOR(owner, name);
  if (!d || d.enumerable !== true || !HAS(d, 'value') || typeof d.value !== 'function' || IS_PROXY(d.value)) reject();
  return d.value;
}
function same(actual, expected) {
  if (actual === undefined || expected === undefined) return actual === expected;
  const names = KEYS(expected); if (KEYS(actual).length !== names.length) return false;
  for (let i = 0; i < names.length; i++) if (!HAS(actual, names[i]) || actual[names[i]] !== expected[names[i]]) return false;
  return true;
}
function invariant() {
  return INITIAL_OBJECT_THEN === undefined && DESCRIPTOR(OBJECT, 'then') === undefined
    && same(DESCRIPTOR(PROMISE, 'constructor'), INITIAL_CTOR)
    && same(DESCRIPTOR(PROMISE, 'then'), INITIAL_THEN)
    && same(DESCRIPTOR(NativePromise, SPECIES), INITIAL_SPECIES);
}
function reject() { throw problem(); }
