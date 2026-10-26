import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types as utilTypes } from 'node:util';
import { validateZenonUnsignedUserSendHash } from './transaction-planner.js';
import { decodeZenonUserSendHashCores } from './dynamic-plasma-json-rpc-read-transport.js';

const VALIDATE = validateZenonUnsignedUserSendHash, CORES = decodeZenonUserSendHashCores;
const APPLY = Reflect.apply, DESC = Object.getOwnPropertyDescriptor;
const PROTO = Object.getPrototypeOf, KEYS = Reflect.ownKeys, OWN = Object.hasOwn;
const F = Object.freeze, IS_PROXY = utilTypes.isProxy, IS_PROMISE = utilTypes.isPromise;
const NativePromise = Promise, PROMISE = NativePromise.prototype, THEN = PROMISE.then;
const THEN_DESC = DESC(PROMISE, 'then'), CTOR = DESC(PROMISE, 'constructor');
const SPECIES = DESC(NativePromise, Symbol.species);
const BYTES = PROTO(Uint8Array.prototype);
const LENGTH = DESC(BYTES, 'byteLength').get, BUFFER = DESC(BYTES, 'buffer').get;
const FROM = Buffer.from, TEXT = Buffer.prototype.toString, FILL = Buffer.prototype.fill;
const IS_BUFFER = Buffer.isBuffer, SHARED = utilTypes.isSharedArrayBuffer;
const HASH = createHash;

/**
 * Sign-only bridge for a borrowed KeyPair-compatible owner. Its synchronous
 * getAddress() returns a string or Address-like object; sign(hashBytes) returns
 * a native Promise for 64 signature bytes. No SDK preparer or network is used.
 *
 * One sign attempt snapshots and recomputes the complete original unsigned
 * DTO hash, binds its public bytes/address to the independently selected
 * identity, then passes ONLY that 32-byte hash to the captured signer. It adds
 * only the returned signature. It never repairs/replans an invalid block.
 *
 * The borrowed owner must already have signing authority and retain uncertain
 * operations. This adapter neither owns/clears its private key nor authenticates
 * that owner. It does not verify the signature, nonce, price or current chain;
 * the real DP validators, cryptographic preflight and durable custody still run
 * before transport. Recreating this adapter grants no replacement authority.
 * A pending signer keeps this attempt pending, with no superficial timeout.
 */
export function createPreparedHashWalletAdapter(configuration) {
  if (arguments.length !== 1 || !invariant()) fail('configuration_rejected');
  const c = record(configuration, ['keyPair', 'expectedAddress', 'expectedPublicKey']);
  let receiver = c.keyPair;
  const ADDRESS = method(receiver, 'getAddress'), SIGN = method(receiver, 'sign');
  const address = c.expectedAddress, publicKey = c.expectedPublicKey;
  if (typeof address !== 'string' || address.length < 1 || address.length > 128
      || typeof publicKey !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(publicKey)) fail('configuration_rejected');
  const publicBytes = APPLY(FROM, Buffer, [publicKey, 'base64']);
  if (publicBytes.length !== 32 || APPLY(TEXT, publicBytes, ['base64']) !== publicKey) fail('configuration_rejected');
  configuration = null;
  let phase = 'IDLE', used = false, addressActive = false, signerEntered = false;
  let original = null, signedOriginal = null, hashBytes = null;

  function currentAddress() {
    if (addressActive || receiver === null) fail('address_unavailable');
    addressActive = true;
    try {
      const value = APPLY(ADDRESS, receiver, []);
      const text = typeof value === 'string' ? value : APPLY(method(value, 'toString'), value, []);
      if (!invariant() || text !== address) fail('address_unavailable');
      return text;
    } finally { addressActive = false; }
  }
  const getAddress = F(function getAddress() {
    const out = capability();
    try {
      if (arguments.length !== 0 || phase !== 'IDLE' || !invariant()) fail('address_unavailable');
      out.resolve(currentAddress());
    } catch { out.reject(error('address_unavailable')); }
    return out.promise;
  });
  const sign = F(function sign(input) {
    const out = capability();
    let admitted = false;
    try {
      if (arguments.length !== 1 || used || addressActive || !invariant()) fail('sign_unavailable');
      admitted = true;
      used = true; phase = 'VALIDATING_ORIGINAL';
      original = VALIDATE(input).accountBlock;
      if (original.address !== address || original.publicKey !== publicKey) fail('original_rejected');
      const cores = CORES({ address, toAddress: original.toAddress, tokenStandard: original.tokenStandard });
      const expected = HASH('sha3-256').update(publicBytes).digest();
      if (cores.address[0] !== 0 || cores.address.length !== 20) fail('original_rejected');
      for (let i = 0; i < 19; i++) if (cores.address[i + 1] !== expected[i]) fail('original_rejected');
      currentAddress();
      hashBytes = APPLY(FROM, Buffer, [original.hash, 'hex']);
      phase = 'SIGNING'; signerEntered = true;
      const pending = APPLY(SIGN, receiver, [hashBytes]);
      if (!safePromise(pending)) fail('signer_outcome_unknown');
      APPLY(THEN, pending, [value => {
        try {
          if (!invariant() || APPLY(TEXT, hashBytes, ['hex']) !== original.hash) fail('signer_outcome_unknown');
          const signature = signatureText(value);
          signedOriginal = F({ ...original, signature });
          phase = 'SIGNED_DATA_RETURNED'; release(); out.resolve(signedOriginal);
        } catch { refused(); out.reject(error('signer_outcome_unknown')); }
      }, () => { refused(); out.reject(error('signer_outcome_unknown')); }]);
    } catch {
      // Reentry or a second call cannot overwrite the original attempt's state.
      if (admitted) {
        refused(); out.reject(error(signerEntered ? 'signer_outcome_unknown' : 'original_rejected'));
      } else out.reject(error('sign_unavailable'));
    }
    return out.promise;
  });
  function release() {
    receiver = null;
    if (hashBytes !== null) { APPLY(FILL, hashBytes, [0]); hashBytes = null; }
  }
  function refused() { phase = signerEntered ? 'SIGNING_OUTCOME_UNKNOWN' : 'ORIGINAL_REJECTED'; release(); }
  const inspect = F(function inspect() {
    if (arguments.length !== 0 || !invariant()) fail('inspection_rejected');
    return F({ preparedHashWalletVersion: 1, phase, used, signerEntered,
      originalUnsignedBlock: original, signedOriginal, expectedAddress: address, expectedPublicKey: publicKey,
      signatureValidation: 'NOT_PERFORMED', persistence: 'NOT_PERFORMED', authority: 'NONE' });
  });
  return F({ getAddress, sign, inspect });
}

function signatureText(value) {
  if (typeof value !== 'object' || value === null || IS_PROXY(value)
      || (PROTO(value) !== Buffer.prototype && PROTO(value) !== Uint8Array.prototype)
      || (PROTO(value) === Buffer.prototype && !IS_BUFFER(value))
      || APPLY(LENGTH, value, []) !== 64 || SHARED(APPLY(BUFFER, value, []))) fail('signer_outcome_unknown');
  const bytes = Buffer.alloc(64);
  for (let i = 0; i < 64; i++) {
    const d = DESC(value, String(i));
    if (!d || !OWN(d, 'value') || !Number.isInteger(d.value) || d.value < 0 || d.value > 255) fail('signer_outcome_unknown');
    bytes[i] = d.value;
  }
  return APPLY(TEXT, bytes, ['base64']);
}
function method(receiver, name) {
  if (typeof receiver !== 'object' || receiver === null || IS_PROXY(receiver)) fail('configuration_rejected');
  let p = receiver;
  for (let i = 0; i < 8 && p !== null && p !== Object.prototype; i++) {
    if (IS_PROXY(p)) fail('configuration_rejected');
    const d = DESC(p, name);
    if (d !== undefined) {
      if (!OWN(d, 'value') || typeof d.value !== 'function' || IS_PROXY(d.value)) fail('configuration_rejected');
      return d.value;
    }
    p = PROTO(p);
  }
  fail('configuration_rejected');
}
function record(value, fields) {
  if (typeof value !== 'object' || value === null || IS_PROXY(value)
      || PROTO(value) !== Object.prototype || KEYS(value).length !== fields.length) fail('configuration_rejected');
  const out = Object.create(null);
  for (const field of fields) {
    const d = DESC(value, field);
    if (!d || !OWN(d, 'value') || !d.enumerable) fail('configuration_rejected');
    out[field] = d.value;
  }
  return out;
}
function safePromise(value) {
  if (!invariant() || !IS_PROMISE(value) || IS_PROXY(value) || PROTO(value) !== PROMISE) return false;
  const d = DESC(value, 'constructor');
  return d === undefined || OWN(d, 'value') && d.value === NativePromise;
}
function invariant() {
  return DESC(Object.prototype, 'then') === undefined && same(DESC(PROMISE, 'then'), THEN_DESC)
    && same(DESC(PROMISE, 'constructor'), CTOR) && same(DESC(NativePromise, Symbol.species), SPECIES);
}
function same(a, b) { return !!a && !!b && KEYS(a).length === KEYS(b).length && KEYS(b).every(k => OWN(a,k) && a[k] === b[k]); }
function capability() {
  let resolve, reject; const promise = new NativePromise((yes, no) => { resolve = yes; reject = no; });
  Object.defineProperty(promise, 'constructor', { value: NativePromise });
  return { promise, resolve, reject };
}
function error(kind) {
  const code = 'zenon_prepared_hash_wallet_' + kind, e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code }); return F(e);
}
function fail(kind) { throw error(kind); }
