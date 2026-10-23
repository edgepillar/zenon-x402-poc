import { types as utilTypes } from 'node:util';
import { Buffer } from 'node:buffer';

const FREEZE = Object.freeze, CREATE = Object.create, DEFINE = Object.defineProperty;
const DESCRIPTOR = Object.getOwnPropertyDescriptor, PROTOTYPE = Object.getPrototypeOf;
const KEYS = Reflect.ownKeys, HAS = Object.hasOwn, APPLY = Reflect.apply;
const IS_PROXY = utilTypes.isProxy, INTEGER = Number.isSafeInteger, SAME = Object.is;
const OBJECT = Object.prototype, ErrorType = TypeError;
const FROM = Buffer.from, TO_STRING = Buffer.prototype.toString;
const TEST = Function.call.bind(RegExp.prototype.test);
const FIELDS = FREEZE(['readOptions', 'materialOptions', 'materialWaitMs', 'wallet',
  'store', 'fundingResourceUrl', 'deadlineMs', 'fetchImpl']);
const MATERIAL = FREEZE(['publicKey', 'startNonce', 'limits']);
const LIMITS = FREEZE(['maxAttempts', 'maxDifficulty']);
const KEY = /^[A-Za-z0-9+/]{43}=$/, NONCE = /^[0-9a-f]{16}$/;

/**
 * DATA-only configuration capture for the explicitly bounded funding adapter.
 * No SDK, nonce producer/search, crypto, wallet, SQLite, fetch or I/O is loaded
 * or invoked. Public bytes/cursor and count/wait budgets are detached now;
 * read/wallet/store/fetch handles remain borrowed references, not deep-frozen.
 *
 * This does NOT validate actual transport/wallet methods, store brand/schema,
 * payer/key possession, current price, funding or consent. The real material
 * producer and V2 owner must perform their unchanged validations on the same
 * supplied handles. A captured record is not a prepared block, operation,
 * renewed work budget, signing/dispatch permission or native qualification.
 */
export function captureZenonDynamicPlasmaBoundedOriginalFundingConfiguration(input) {
  try {
    if (arguments.length !== 1) reject();
    const top = record(input, FIELDS), material = record(top.materialOptions, MATERIAL);
    const limits = record(material.limits, LIMITS);
    if (typeof material.publicKey !== 'string' || material.publicKey.length !== 44
        || !TEST(KEY, material.publicKey)
        || typeof material.startNonce !== 'string' || material.startNonce.length !== 16
        || !TEST(NONCE, material.startNonce)
        || !budget(limits.maxAttempts, 0, 4096)
        || !budget(limits.maxDifficulty, 0, Number.MAX_SAFE_INTEGER)
        || !budget(top.materialWaitMs, 1, 60000) || !budget(top.deadlineMs, 1, 60000)
        || typeof top.fundingResourceUrl !== 'string' || top.fundingResourceUrl.length < 1
        || top.fundingResourceUrl.length > 4096
        || !objectHandle(top.readOptions) || !objectHandle(top.wallet) || !objectHandle(top.store)
        || typeof top.fetchImpl !== 'function' || IS_PROXY(top.fetchImpl)) reject();
    const bytes = APPLY(FROM, Buffer, [material.publicKey, 'base64']);
    if (bytes.length !== 32 || APPLY(TO_STRING, bytes, ['base64']) !== material.publicKey) reject();
    const out = CREATE(null);
    for (const field of FIELDS) {
      put(out, field, field === 'materialOptions' ? FREEZE({
        publicKey: material.publicKey, startNonce: material.startNonce,
        limits: FREEZE({ maxAttempts: limits.maxAttempts, maxDifficulty: limits.maxDifficulty }),
      }) : top[field]);
    }
    return FREEZE(out);
  } catch { reject(); }
}
function budget(value, lower, upper) {
  return INTEGER(value) && !SAME(value, -0) && value >= lower && value <= upper;
}
function objectHandle(value) {
  return typeof value === 'object' && value !== null && !IS_PROXY(value);
}
function record(value, fields) {
  if (!objectHandle(value) || PROTOTYPE(value) !== OBJECT || KEYS(value).length !== fields.length) reject();
  const out = CREATE(null);
  for (const field of fields) {
    const d = DESCRIPTOR(value, field);
    if (!d || d.enumerable !== true || !HAS(d, 'value')) reject();
    put(out, field, d.value);
  }
  return out;
}
function put(target, key, value) {
  const d = CREATE(null); d.value = value; d.enumerable = true;
  d.writable = false; d.configurable = false; DEFINE(target, key, d);
}
function reject() {
  const code = 'zenon_bounded_original_funding_configuration_rejected';
  const error = new ErrorType(code); put(error, 'code', code);
  const d = CREATE(null); d.value = 'TypeError: ' + code;
  DEFINE(error, 'stack', d); throw FREEZE(error);
}
