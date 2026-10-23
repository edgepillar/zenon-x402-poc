import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import { snapshotZenonUnsignedUserSendFields } from './transaction-planner.js';
import { bindZenonUnsignedUserSendKeyBinding } from './dynamic-plasma-user-send-key-binding.js';

const SNAPSHOT = snapshotZenonUnsignedUserSendFields;
const BIND = bindZenonUnsignedUserSendKeyBinding;
const APPLY = Reflect.apply;
const KEYS = Reflect.ownKeys;
const DESCRIPTOR = Object.getOwnPropertyDescriptor;
const PROTOTYPE = Object.getPrototypeOf;
const DEFINE = Object.defineProperty;
const CREATE = Object.create;
const FREEZE = Object.freeze;
const HAS = Object.hasOwn;
const IS = Object.is;
const IS_SAFE = Number.isSafeInteger;
const IS_PROXY = utilTypes.isProxy;
const OBJECT = Object.prototype;
const FROM = Buffer.from;
const BASE64 = Buffer.prototype.toString;
const NativePromise = Promise;
const PROMISE = NativePromise.prototype;
const SPECIES = Symbol.species;
const CONSTRUCTOR_DESCRIPTOR = DESCRIPTOR(PROMISE, 'constructor');
const SPECIES_DESCRIPTOR = DESCRIPTOR(NativePromise, SPECIES);
const INITIAL_THEN = DESCRIPTOR(OBJECT, 'then');
const ErrorType = TypeError;
const TEST = Function.call.bind(RegExp.prototype.test);
const SIGNATURE = /^[A-Za-z0-9+/]{86}==$/;

/**
 * Default-off DATA boundary between one original DP unsigned block and the
 * block returned by an external wallet. Capture and validate the original
 * quote/block before exposing acceptSigned(). Accept exactly one candidate;
 * all fields except signature must remain equal, INCLUDING publicKey (which
 * is not covered by the Zenon account-block hash). Then revalidate the SAME
 * original quote/block against the independently supplied CURRENT context.
 * No refresh, reassembly, replacement nonce, resign, retry or publish exists.
 *
 * This is not a signer or signature verifier. A canonical 64-byte signature
 * is syntax only. The result MUST pass the real signature/payment preflight
 * and original signed-payment custody owner before transport/publication.
 * It is NOT a replacement for either, and does not persist the DP checkpoint.
 * Never feed a signed block into the pre-sign-only checkpoint reader/codec.
 *
 * The one-candidate latch is local to this facade, NOT a global admission,
 * durable consumed flag or proof that an external wallet signed only once.
 * A refusal after external signing must remain with that operation's owner;
 * constructing another facade does not grant replacement/signing authority.
 * Current context, funds, price and runtime remain declared DATA, not chain
 * authentication, atomic freshness or signing permission. No SDK, wallet,
 * nonce search, keys, signature operation, SQL, I/O or callback is invoked.
 * Existing buyer/legacy defaults and the separate Phase 2C gate are unchanged.
 */
export function createZenonDynamicPlasmaSignedOriginalHandoff(context, originalQuote, unsignedBlock) {
  return shield(capture(arguments.length, context, originalQuote, unsignedBlock));
}

async function capture(count, context, quote, unsignedBlock) {
  try {
    if (count !== 3 || !invariant()) reject();
    const original = SNAPSHOT(unsignedBlock).accountBlock;
    const stableQuote = snapshotQuote(quote, 0, { nodes: 2048, characters: 32768 });
    // BIND captures the independent context synchronously before its await.
    await BIND(context, stableQuote, original);
    if (!invariant()) reject();
    let consumed = false;

    function acceptSigned(candidate, currentContext) {
      return shield(accept(arguments.length, candidate, currentContext));
    }
    async function accept(arity, candidate, currentContext) {
      // Consume before inspecting any candidate or issuing async validation.
      // An invalid/expired response is terminal for this handoff, not a retry.
      if (consumed) reject();
      consumed = true;
      try {
        if (arity !== 2 || !invariant()) reject();
        const signed = snapshotCandidate(original, candidate);
        const checked = await BIND(currentContext, stableQuote, original);
        if (!invariant()) reject();
        const result = CREATE(null);
        put(result, 'signedOriginalHandoffVersion', 1);
        put(result, 'scope', 'DECLARED_SIGNED_ORIGINAL_FIELD_AND_CURRENT_PRICE_BINDING');
        put(result, 'accountBlock', signed);
        put(result, 'originalUnsignedBlock', original);
        put(result, 'originalQuote', stableQuote);
        put(result, 'currentValidation', checked);
        put(result, 'fieldPreservation', 'ALL_ORIGINAL_FIELDS_EXCEPT_SIGNATURE_MATCH');
        put(result, 'signatureValidation', 'NOT_PERFORMED');
        put(result, 'persistence', 'NOT_PERFORMED');
        put(result, 'chainAuthentication', 'NOT_ESTABLISHED');
        put(result, 'authority', 'NONE');
        return FREEZE(result);
      } catch { reject(); }
    }
    const facade = CREATE(null);
    put(facade, 'originalUnsignedBlock', original);
    put(facade, 'acceptSigned', acceptSigned);
    return FREEZE(facade);
  } catch { reject(); }
}

function snapshotCandidate(original, candidate) {
  if (typeof candidate !== 'object' || candidate === null || IS_PROXY(candidate)
      || PROTOTYPE(candidate) !== OBJECT) reject();
  const fields = KEYS(original);
  if (KEYS(candidate).length !== fields.length) reject();
  const projected = CREATE(OBJECT);
  let signature;
  for (const field of fields) {
    const d = DESCRIPTOR(candidate, field);
    if (d === undefined || !d.enumerable || !HAS(d, 'value')) reject();
    if (field === 'signature') {
      signature = signatureText(d.value);
      put(projected, field, '');
    } else put(projected, field, d.value);
  }
  // The actual closed unsigned DTO snapshot checks nested ACK descriptors,
  // field formats and bounds. It never invokes a caller's toJSON/coercion.
  const block = SNAPSHOT(projected).accountBlock;
  for (const field of fields) {
    if (field === 'momentumAcknowledged') {
      if (block[field].height !== original[field].height
          || block[field].hash !== original[field].hash) reject();
    } else if (!IS(block[field], original[field])) reject();
  }
  const signed = CREATE(OBJECT);
  for (const field of fields) put(signed, field, field === 'signature' ? signature : block[field]);
  return FREEZE(signed);
}

function signatureText(value) {
  if (typeof value !== 'string' || value.length !== 88 || !TEST(SIGNATURE, value)) reject();
  const bytes = APPLY(FROM, Buffer, [value, 'base64']);
  if (bytes.length !== 64 || APPLY(BASE64, bytes, ['base64']) !== value) reject();
  return value;
}

// Existing quote contracts contain records/scalars, not arrays. Retain only
// bounded detached DATA; never caller prototypes, getters, hooks or objects.
function snapshotQuote(value, depth, budget) {
  if (depth > 16 || --budget.nodes < 0) reject();
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    budget.characters -= value.length;
    if (value.length > 8192 || budget.characters < 0) reject();
    return value;
  }
  if (typeof value === 'number') {
    if (!IS_SAFE(value) || value < 0 || IS(value, -0)) reject();
    return value;
  }
  if (typeof value !== 'object' || IS_PROXY(value) || PROTOTYPE(value) !== OBJECT) reject();
  const keys = KEYS(value);
  if (keys.length > 64 || keys.length > budget.nodes) reject();
  const result = CREATE(OBJECT);
  for (const key of keys) {
    if (typeof key !== 'string' || key.length > 128) reject();
    budget.characters -= key.length;
    if (budget.characters < 0) reject();
    const d = DESCRIPTOR(value, key);
    if (d === undefined || !d.enumerable || !HAS(d, 'value')) reject();
    put(result, key, snapshotQuote(d.value, depth + 1, budget));
  }
  return FREEZE(result);
}
function shield(promise) { put(promise, 'constructor', NativePromise, false); return promise; }
function invariant() {
  return INITIAL_THEN === undefined && DESCRIPTOR(OBJECT, 'then') === undefined
    && sameDescriptor(DESCRIPTOR(PROMISE, 'constructor'), CONSTRUCTOR_DESCRIPTOR)
    && sameDescriptor(DESCRIPTOR(NativePromise, SPECIES), SPECIES_DESCRIPTOR);
}
function sameDescriptor(actual, expected) {
  if (actual === undefined || expected === undefined || KEYS(actual).length !== KEYS(expected).length) return false;
  for (const key of KEYS(expected)) if (!HAS(actual, key) || actual[key] !== expected[key]) return false;
  return true;
}
function put(value, key, content, enumerable = true) {
  const d = CREATE(null);
  d.value = content; d.enumerable = enumerable; d.writable = false; d.configurable = false;
  DEFINE(value, key, d);
}
function reject() {
  const code = 'zenon_dynamic_plasma_signed_original_handoff_rejected';
  const error = new ErrorType(code);
  put(error, 'code', code);
  put(error, 'stack', 'TypeError: ' + code, false);
  throw FREEZE(error);
}
