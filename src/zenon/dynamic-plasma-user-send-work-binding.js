import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { validateZenonUnsignedUserSendHash } from './transaction-planner.js';
import { decodeZenonUserSendHashCores } from './dynamic-plasma-json-rpc-read-transport.js';
import { BoundedDynamicPlasmaStrategy } from './bounded-dynamic-plasma-strategy.js';

const VALIDATE_HASH = validateZenonUnsignedUserSendHash;
const HASH_CORES = decodeZenonUserSendHashCores;
const BIND_HASH_PRICE = BoundedDynamicPlasmaStrategy.prototype.bindHashedUserSend;
const APPLY = Reflect.apply;
const HASH = createHash;
const freeze = Object.freeze;
const define = Object.defineProperty;
const ErrorType = TypeError;
const RANGE = 1n << 64n;
const ALGORITHM = 'GO_ZENON_E58D8E8_SHA3_256_LE64_GE_THRESHOLD';

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

/**
 * Check the SAME detached block with the existing intent/hash/price consumer
 * and the fixed-cost nonce predicate. Capture the existing implementation,
 * not a caller's subclass/callback. Its returned block is already snapshotted
 * before this await; later input mutation cannot replace checked work bytes.
 * Legacy field/hash-only APIs and the active buyer remain unchanged.
 * No work, key, approval or publication capability is returned.
 */
export async function bindZenonUnsignedUserSendWork(context, quote, accountBlock) {
  try {
    if (arguments.length !== 3) reject();
    const hashPriceBinding = await APPLY(BIND_HASH_PRICE, undefined, [context, quote, accountBlock]);
    const work = checkDeclaredWork(hashPriceBinding.accountBlock);
    return freeze({
      unsignedWorkBindingVersion: 1,
      scope: 'DECLARED_UNSIGNED_USER_SEND_HASH_NONCE_AND_PRICE_BINDING',
      hashPriceBinding, work, authority: 'NONE', afterSigningAction: 'NONE',
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
  const cores = HASH_CORES({
    address: block.address, toAddress: block.toAddress, tokenStandard: block.tokenStandard,
  });
  const dataHash = HASH('sha3-256').update(Buffer.concat([
    Buffer.from(cores.address), Buffer.from(block.previousHash, 'hex'),
  ])).digest();
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
