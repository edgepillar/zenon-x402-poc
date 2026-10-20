import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  validateZenonUnsignedUserSendWork,
  bindZenonUnsignedUserSendWork,
} from './dynamic-plasma-user-send-work-binding.js';
import { decodeZenonUserSendHashCores } from './dynamic-plasma-json-rpc-read-transport.js';

const VALIDATE_WORK = validateZenonUnsignedUserSendWork;
const BIND_WORK = bindZenonUnsignedUserSendWork;
const HASH_CORES = decodeZenonUserSendHashCores;
const HASH = createHash;
const freeze = Object.freeze;
const define = Object.defineProperty;
const ErrorType = TypeError;

/**
 * Additional declared public-byte/address consistency, not key possession or
 * a signature check. Source: go-zenon
 * e58d8e80eabd9fd5630ed62e0707424d96b5303c, common/types/address.go.
 * The existing unsigned snapshot requires canonical Base64 for a present
 * 32-byte publicKey. This opt-in stage additionally requires it to be present
 * and match the actual payer address; empty keys remain permitted only by
 * the unchanged earlier APIs. No SDK, wallet, key or signature is produced.
 * Hash validity alone cannot bind publicKey because it is not hash-covered.
 */
export function validateZenonUnsignedUserSendKeyBinding(input) {
  try {
    if (arguments.length !== 1) reject();
    const workBinding = VALIDATE_WORK(input);
    const keyBinding = checkPublicKey(workBinding.hashBinding.accountBlock);
    return freeze({
      unsignedKeyValidationVersion: 1,
      scope: 'DECLARED_UNSIGNED_USER_SEND_HASH_NONCE_AND_KEY_ADDRESS_CONSISTENCY',
      workBinding, keyBinding, keyAddressBinding: 'MATCHES_SUPPLIED_PUBLIC_KEY_BYTES',
      keyPossession: 'NOT_ESTABLISHED', signatureValidation: 'NOT_PERFORMED',
      chainAuthentication: 'NOT_ESTABLISHED', authority: 'NONE', afterSigningAction: 'NONE',
    });
  } catch { reject(); }
}

/**
 * Bind the same detached block to intent, original selected price fields,
 * declared nonce predicate and supplied public-key bytes. The existing work
 * binding snapshots before await; never reread the caller's mutable block.
 * Matching public bytes establish neither a valid curve point, private-key
 * ownership, signer state, approval, chain truth nor a capability to sign.
 * Active preparation/signing/publication and all existing APIs are unchanged.
 */
export async function bindZenonUnsignedUserSendKeyBinding(context, quote, accountBlock) {
  try {
    if (arguments.length !== 3) reject();
    const workBinding = await BIND_WORK(context, quote, accountBlock);
    const keyBinding = checkPublicKey(workBinding.hashPriceBinding.accountBlock);
    return freeze({
      unsignedKeyBindingVersion: 1,
      scope: 'DECLARED_UNSIGNED_USER_SEND_HASH_NONCE_KEY_AND_PRICE_BINDING',
      workBinding, keyBinding, keyAddressBinding: 'MATCHES_SUPPLIED_PUBLIC_KEY_BYTES',
      keyPossession: 'NOT_ESTABLISHED', signatureValidation: 'NOT_PERFORMED',
      chainAuthentication: 'NOT_ESTABLISHED', authority: 'NONE', afterSigningAction: 'NONE',
    });
  } catch { reject(); }
}

function checkPublicKey(block) {
  // The reused unsigned hash/work stage has already validated and detached
  // all fields; no caller getter, coercion or key-provider callback is read.
  const key = Buffer.from(block.publicKey, 'base64');
  if (key.length !== 32) reject();
  const digest = HASH('sha3-256').update(key).digest();
  const expectedCore = Buffer.concat([Buffer.from([0]), digest.subarray(0, 19)]);
  const cores = HASH_CORES({
    address: block.address, toAddress: block.toAddress, tokenStandard: block.tokenStandard,
  });
  if (!expectedCore.equals(Buffer.from(cores.address))) reject();
  return freeze({
    algorithm: 'GO_ZENON_E58D8E8_SHA3_256_PUBLIC_KEY_USER_ADDRESS',
    publicKey: block.publicKey, address: block.address,
    addressCoreHex: expectedCore.toString('hex'),
    validation: 'MATCHES_SUPPLIED_PUBLIC_KEY_BYTES',
    keyPossession: 'NOT_ESTABLISHED', signatureValidation: 'NOT_PERFORMED',
  });
}

function reject() {
  const code = 'zenon_user_send_key_binding_input_rejected';
  const error = new ErrorType(code);
  define(error, 'code', { value: code, enumerable: true });
  define(error, 'stack', { value: 'TypeError: ' + code, enumerable: false });
  throw freeze(error);
}
