import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { validateZenonUnsignedUserSendHash } from './transaction-planner.js';
import { deriveZenonUserSendWorkInput } from './dynamic-plasma-user-send-work-input.js';

const VALIDATE_HASH = validateZenonUnsignedUserSendHash;
const WORK_INPUT = deriveZenonUserSendWorkInput;
const HASH = createHash;
const freeze = Object.freeze;
const define = Object.defineProperty;
const ErrorType = TypeError;
const RANGE = 1n << 64n;
const ALGORITHM = 'GO_ZENON_E58D8E8_SHA3_256_LE64_GE_THRESHOLD';

// Fixed-cost validator only. Keep the price/strategy binding in the legacy
// work-binding module so hash/nonce-only consumers do not load that graph.
// No nonce search, key generation, SDK, callback or active default is added.

/**
 * Fixed-cost declared nonce consistency, not a work producer or a planner.
 * Source: go-zenon e58d8e80eabd9fd5630ed62e0707424d96b5303c,
 * pow/pow.go, common/{crypto,types}/hash.go, chain/nom/account_block.go,
 * and verifier/account_block.go. The nonce is already supplied: never search,
 * increment, generate, replace or re-sign it. Reuse the exact unsigned hash
 * checker first; its safe-number difficulty bound is deliberately narrower
 * than the node's uint64 domain. No SDK or native PoW provider is imported.
 * A matching predicate does not establish current required difficulty, Plasma
 * sufficiency, key ownership, chain state, inclusion or signing authority.
 */
export function validateZenonUnsignedUserSendWork(input) {
  try {
    if (arguments.length !== 1) reject();
    const hashBinding = VALIDATE_HASH(input);
    const work = checkDeclaredWork(hashBinding.accountBlock);
    return freeze({
      unsignedWorkValidationVersion: 1,
      scope: 'DECLARED_UNSIGNED_USER_SEND_HASH_AND_NONCE_CONSISTENCY',
      hashBinding, work, authority: 'NONE', afterSigningAction: 'NONE',
      keyAddressBinding: 'NOT_PERFORMED', chainAuthentication: 'NOT_ESTABLISHED',
    });
  } catch { reject(); }
}

function checkDeclaredWork(block) {
  // The existing hash checker has validated and detached every field.
  // The node verifier does not evaluate PoW when Difficulty == 0; do not
  // invent a zero-nonce requirement or call this proof of sufficient Plasma.
  if (block.difficulty === 0) {
    return freeze({
      algorithm: ALGORITHM, difficulty: 0,
      validation: 'NOT_REQUIRED_BY_DECLARED_ZERO_DIFFICULTY',
      dataHash: null, nonceDigest: null, value: null, threshold: null,
    });
  }
  const dataHash = Buffer.from(WORK_INPUT(block).dataHash, 'hex');
  const nonceDigest = HASH('sha3-256').update(Buffer.concat([
    Buffer.from(block.nonce, 'hex'), dataHash,
  ])).digest();
  let value = 0n;
  for (let index = 7; index >= 0; index -= 1) value = (value << 8n) | BigInt(nonceDigest[index]);
  const threshold = RANGE - RANGE / BigInt(block.difficulty);
  if (value < threshold) reject();
  return freeze({
    algorithm: ALGORITHM, difficulty: block.difficulty,
    validation: 'MATCHES_DECLARED_DIFFICULTY',
    dataHash: dataHash.toString('hex'), nonceDigest: nonceDigest.toString('hex'),
    value: value.toString(10), threshold: threshold.toString(10),
  });
}

function reject() {
  const code = 'zenon_user_send_work_input_rejected';
  const error = new ErrorType(code);
  define(error, 'code', { value: code, enumerable: true });
  define(error, 'stack', { value: 'TypeError: ' + code, enumerable: false });
  throw freeze(error);
}
