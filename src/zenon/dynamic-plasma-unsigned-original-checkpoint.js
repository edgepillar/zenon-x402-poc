import { types as utilTypes } from 'node:util';
import { Buffer } from 'node:buffer';
import { bindZenonUnsignedUserSendKeyBinding } from './dynamic-plasma-user-send-key-binding.js';

const BIND = bindZenonUnsignedUserSendKeyBinding;
const freeze = Object.freeze;
const create = Object.create;
const define = Object.defineProperty;
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const ownKeys = Reflect.ownKeys;
const hasOwn = Object.hasOwn;
const apply = Reflect.apply;
const isProxy = utilTypes.isProxy;
const isSafeInteger = Number.isSafeInteger;
const same = Object.is;
const parse = JSON.parse;
const stringify = JSON.stringify;
const byteLength = Buffer.byteLength;
const sort = Array.prototype.sort;
const objectPrototype = Object.prototype;
const NativePromise = Promise;
const promisePrototype = NativePromise.prototype;
const species = Symbol.species;
const constructorDescriptor = descriptor(promisePrototype, 'constructor');
const speciesDescriptor = descriptor(NativePromise, species);
const initialThen = descriptor(objectPrototype, 'then');
const ErrorType = TypeError;
const FIELDS = freeze(['accountBlock', 'checkpointVersion', 'phase', 'quote']);
const MAX_BYTES = 32768;

/**
 * Opt-in pre-sign DATA handoff of ONE original unsigned block AND its original
 * UserSend price quote. Encoding validates that pair against an independently
 * supplied existing context. Reading accepts only canonical bounded version1
 * JSON, then reuses the SAME intent/hash/fixed-nonce/key/price consumer against
 * an independently supplied CURRENT context. There is no re-quote, block/hash
 * repair, nonce production, material callback, signing, payment or dispatch.
 *
 * The checkpoint contains no replacement context or self-declared current
 * observation: the reader must supply its own context and original intent.
 * Changed p, subject, runtime digest, quote, selected resources or expiry must
 * still pass the existing consumer; this codec never weakens those checks.
 * The full field digest and supplied public bytes remain checked even though
 * publicKey is not covered by the account-block hash. Signed blocks refuse.
 * All selected quote/block DATA is detached synchronously before any await;
 * no caller object, accessor, toJSON, coercion or Proxy hook is invoked.
 *
 * Canonical equality detects ambiguous encodings, NOT malicious coherent DATA
 * or replacement of a complete checkpoint. This is neither authenticated
 * issuance nor an original-payment custody owner. Callers must independently
 * retain the original context/intent and prevent checkpoint substitution.
 * Repeated validation is not renewed or consumed signing/payment authority.
 * An external signer cannot be detected: use ONLY before external signing;
 * do not serialize signed payments here. Original signed bytes/hash/context
 * and VALIDATED versus UNKNOWN/ACKNOWLEDGED remain with their separate owner.
 *
 * This module performs no storage, reopen/restart, current account/balance
 * read, RPC, SDK, actual PREPARE, key generation or signature. A current
 * context is declared DATA, not authentic runtime p, ancestry, funds, payer
 * authority, provider READY, inclusion, durability or live-pilot evidence.
 * Limits are local DATA bounds, not OS memory, lifetime or cancellation
 * guarantees. Captured native intrinsics and unchanged dependencies remain
 * premises. No active buyer, planner, signer or default is changed.
 */
export function encodeZenonUnsignedOriginalQuoteCheckpoint(context, quote, accountBlock) {
  return shield(encode(arguments.length, context, quote, accountBlock));
}

export function validateZenonUnsignedOriginalQuoteCheckpoint(context, checkpointJson) {
  return shield(validate(arguments.length, context, checkpointJson));
}

async function encode(count, context, quote, accountBlock) {
  try {
    if (count !== 3 || !invariant()) reject();
    const budget = { nodes: 2048, characters: MAX_BYTES };
    const stableQuote = snapshot(quote, 0, budget);
    const stableBlock = snapshot(accountBlock, 0, budget);
    // BIND snapshots the selected independent context synchronously before
    // its first await. Only its detached validated block is used afterward.
    const checked = await BIND(context, stableQuote, stableBlock);
    if (!invariant()) reject();
    const value = create(null);
    put(value, 'accountBlock', checked.workBinding.hashPriceBinding.accountBlock);
    put(value, 'checkpointVersion', 1);
    put(value, 'phase', 'UNSIGNED');
    put(value, 'quote', stableQuote);
    const text = render(value, 0);
    if (apply(byteLength, Buffer, [text, 'utf8']) > MAX_BYTES) reject();
    return text;
  } catch { reject(); }
}

async function validate(count, context, checkpointJson) {
  try {
    if (count !== 2 || !invariant() || typeof checkpointJson !== 'string'
        || checkpointJson.length > MAX_BYTES
        || apply(byteLength, Buffer, [checkpointJson, 'utf8']) > MAX_BYTES) reject();
    const value = snapshot(parse(checkpointJson), 0, { nodes: 2048, characters: MAX_BYTES });
    const keys = ownKeys(value);
    if (keys.length !== FIELDS.length) reject();
    for (let index = 0; index < FIELDS.length; index++) {
      if (keys[index] !== FIELDS[index]) reject();
    }
    if (value.checkpointVersion !== 1 || value.phase !== 'UNSIGNED'
        || render(value, 0) !== checkpointJson) reject();
    const checked = await BIND(context, value.quote, value.accountBlock);
    if (!invariant()) reject();
    const receipt = create(null);
    put(receipt, 'unsignedOriginalQuoteCheckpointVersion', 1);
    put(receipt, 'scope', 'DECLARED_UNSIGNED_ORIGINAL_QUOTE_CHECKPOINT');
    put(receipt, 'accountBlock', checked.workBinding.hashPriceBinding.accountBlock);
    put(receipt, 'quote', value.quote);
    put(receipt, 'validation', checked);
    put(receipt, 'persistence', 'NOT_PERFORMED');
    put(receipt, 'currentAccountAndBalance', 'NOT_CHECKED');
    put(receipt, 'signingAuthorization', 'NOT_ESTABLISHED');
    put(receipt, 'chainAuthentication', 'NOT_ESTABLISHED');
    put(receipt, 'authority', 'NONE');
    put(receipt, 'afterSigningAction', 'NONE');
    return freeze(receipt);
  } catch { reject(); }
}

// Quote and block contracts contain records/scalars, not arrays. Sort every
// own string key and install DATA descriptors, avoiding inherited setters.
// Finite depth also refuses cycles. Never freeze or retain caller records.
function snapshot(value, depth, budget) {
  if (depth > 16 || --budget.nodes < 0) reject();
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    budget.characters -= value.length;
    if (value.length > 8192 || budget.characters < 0) reject();
    return value;
  }
  if (typeof value === 'number') {
    if (!isSafeInteger(value) || value < 0 || same(value, -0)) reject();
    return value;
  }
  if (typeof value !== 'object' || isProxy(value)
      || prototype(value) !== objectPrototype) reject();
  const keys = ownKeys(value);
  if (keys.length > 64 || keys.length > budget.nodes) reject();
  for (const key of keys) {
    if (typeof key !== 'string' || key.length > 128) reject();
    budget.characters -= key.length;
    if (budget.characters < 0) reject();
  }
  apply(sort, keys, []);
  const result = create(objectPrototype);
  for (const key of keys) {
    const d = descriptor(value, key);
    if (d === undefined || !d.enumerable || !hasOwn(d, 'value')) reject();
    put(result, key, snapshot(d.value, depth + 1, budget));
  }
  return freeze(result);
}

// Only private detached DATA reaches this renderer. JSON.stringify is called
// on primitive strings/numbers/booleans ONLY, never an object with toJSON.
function render(value, depth) {
  if (depth > 16) reject();
  if (value === null || typeof value !== 'object') return stringify(value);
  const keys = ownKeys(value);
  apply(sort, keys, []);
  let text = '{';
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    text += (index === 0 ? '' : ',') + stringify(key) + ':' + render(value[key], depth + 1);
    if (text.length >= MAX_BYTES) reject();
  }
  return text + '}';
}
function shield(promise) { put(promise, 'constructor', NativePromise, false); return promise; }
function invariant() {
  return initialThen === undefined && descriptor(objectPrototype, 'then') === undefined
    && sameDescriptor(descriptor(promisePrototype, 'constructor'), constructorDescriptor)
    && sameDescriptor(descriptor(NativePromise, species), speciesDescriptor);
}
function sameDescriptor(actual, expected) {
  if (actual === undefined || expected === undefined || ownKeys(actual).length !== ownKeys(expected).length)
    return false;
  for (const key of ownKeys(expected)) if (!hasOwn(actual, key) || actual[key] !== expected[key]) return false;
  return true;
}
function put(value, key, content, enumerable = true) {
  const d = create(null);
  d.value = content; d.enumerable = enumerable; d.writable = false; d.configurable = false;
  define(value, key, d);
}
function reject() {
  const code = 'zenon_unsigned_original_checkpoint_input_rejected';
  const error = new ErrorType(code);
  put(error, 'code', code);
  put(error, 'stack', 'TypeError: ' + code, false);
  throw freeze(error);
}
