import { types as utilTypes } from 'node:util';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  snapshotZenonUnsignedUserSendFields,
  computeZenonUnsignedUserSendHash,
} from './transaction-planner.js';
import { deriveZenonUserSendWorkInput } from './dynamic-plasma-user-send-work-input.js';
import { validateZenonUnsignedUserSendWork } from './dynamic-plasma-user-send-fixed-work.js';

const SNAPSHOT_FIELDS = snapshotZenonUnsignedUserSendFields;
const WORK_INPUT = deriveZenonUserSendWorkInput;
const COMPUTE_HASH = computeZenonUnsignedUserSendHash;
const VERIFY_WORK = validateZenonUnsignedUserSendWork;
const HASH = createHash;
const freeze = Object.freeze;
const create = Object.create;
const define = Object.defineProperty;
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const ownKeys = Reflect.ownKeys;
const hasOwn = Object.hasOwn;
const isSafeInteger = Number.isSafeInteger;
const same = Object.is;
const isProxy = utilTypes.isProxy;
const test = Function.call.bind(RegExp.prototype.test);
const objectPrototype = Object.prototype;
const ErrorType = TypeError;
const RANGE = 1n << 64n;
const ZERO_HASH = '0'.repeat(64);
const ZERO_NONCE = '0'.repeat(16);
const NONCE = /^[0-9a-f]{16}$/;
const INPUT = freeze(['nonceSearchVersion', 'phase', 'accountBlock', 'startNonce', 'limits']);
const LIMITS = freeze(['maxAttempts', 'maxDifficulty']);
const ALGORITHM = 'GO_ZENON_E58D8E8_SHA3_256_LE64_GE_THRESHOLD';

/**
 * Opt-in bounded local nonce SEARCH for an explicit declared pre-work UserSend
 * draft. Not connected to a planner/SDK/native owner or active buyer. This
 * operation really evaluates candidate nonces; fixed-nonce/metadata approval
 * alone does NOT authorize executing it or qualify a native work provider.
 *
 * Reuse the existing closed field snapshot and52-byte address/previous-hash
 * work-input derivation. Source: go-zenon
 * e58d8e80eabd9fd5630ed62e0707424d96b5303c pow/pow.go and
 * common/crypto/hash.go. Evaluate SHA3-256(nonce8 || dataHash32); compare the
 * first8 digest bytes as unsigned LE64 against2^64-floor(2^64/difficulty).
 * The existing safe-number difficulty domain is intentionally narrower than
 * the node's uint64 domain. Difficulty0 returns the supplied draft's existing
 * placeholder nonce with zero candidate attempts, not work or Plasma proof.
 *
 * Require hash0/nonce0/empty publicKey/signature pre-work placeholders. Never
 * accept/repair an existing prepared or signed block. Deterministically start
 * at the explicit8-byte LE64 cursor, with at most4096 candidate attempts and
 * the declared difficulty ceiling per call. NO randomness, entropy, key,
 * native provider, thread, subprocess, timer or implicit retry/resume exists.
 * Stop before nonce wrap; never increment into the immutable dataHash bytes.
 * This differs deliberately from copying the node's unbounded40-byte quickInc
 * loop. A count ceiling is NOT a wall-clock/cancellation/CPU-time guarantee.
 *
 * On success, independently consume one private candidate through the existing
 * full hash/fixed-nonce validator. Return nonce/receipt DATA only, not the
 * temporary candidate, a new account block, payment hash, signature or payload.
 * workInput retains its original pre-search derivation flags; the outer
 * nonceCandidateEvaluation/nonceProduction fields describe this search only.
 * Caller input is never changed/frozen. BUDGET_EXHAUSTED and RANGE_EXHAUSTED
 * return no nonce; nextNonce is a DATA cursor only, never permission to resume
 * with a changed quote, subject, context, payment or consumed authority.
 *
 * A matching work predicate is not sufficient current Plasma, current runtime
 * p/price, full transfer commitment, signer/payer/provider/policy authority,
 * native preparation, inclusion, recovery or READY evidence. Different sends
 * can share the address/previous-hash work input. A higher original-quote owner
 * must revalidate the SAME unsigned block/quote before signing; this module
 * does not sign, publish, replace/re-sign a payment, reset authority or perform
 * a real PREPARE. UNSIGNED is DATA and cannot reveal external signer state.
 */
export function searchZenonUnsignedUserSendNonce(input) {
  try {
    if (arguments.length !== 1) reject();
    const top = record(input, INPUT), declared = record(top.limits, LIMITS);
    if (top.nonceSearchVersion !== 1 || top.phase !== 'UNSIGNED'
        || !isSafeInteger(declared.maxAttempts) || declared.maxAttempts < 0
        || declared.maxAttempts > 4096 || same(declared.maxAttempts, -0)
        || !isSafeInteger(declared.maxDifficulty) || declared.maxDifficulty < 0
        || same(declared.maxDifficulty, -0)
        || typeof top.startNonce !== 'string' || top.startNonce.length !== 16
        || !test(NONCE, top.startNonce)) reject();
    const fields = SNAPSHOT_FIELDS(top.accountBlock), block = fields.accountBlock;
    if (block.hash !== ZERO_HASH || block.nonce !== ZERO_NONCE
        || block.publicKey !== '' || block.signature !== ''
        || block.difficulty > declared.maxDifficulty) reject();
    const limits = freeze({ maxAttempts: declared.maxAttempts, maxDifficulty: declared.maxDifficulty });
    const workInput = WORK_INPUT(block), startNonce = top.startNonce;
    if (workInput.difficulty === 0) {
      return receipt(workInput, limits, startNonce, 'WORK_NOT_REQUIRED', block.nonce, 0, null, null);
    }
    const threshold = RANGE - RANGE / BigInt(workInput.difficulty);
    const message = Buffer.alloc(40);
    Buffer.from(workInput.dataHash, 'hex').copy(message, 8);
    let cursor = Buffer.from(startNonce, 'hex').readBigUInt64LE(0), attempts = 0;
    for (; attempts < limits.maxAttempts;) {
      message.writeBigUInt64LE(cursor, 0);
      const digest = HASH('sha3-256').update(message).digest();
      attempts += 1;
      if (digest.readBigUInt64LE(0) >= threshold) {
        const nonce = message.subarray(0, 8).toString('hex');
        const candidate = { ...block, nonce };
        candidate.hash = COMPUTE_HASH(candidate);
        const verified = VERIFY_WORK(candidate).work;
        if (verified.validation !== 'MATCHES_DECLARED_DIFFICULTY'
            || verified.dataHash !== workInput.dataHash
            || verified.nonceDigest !== digest.toString('hex')
            || verified.threshold !== threshold.toString(10)) reject();
        return receipt(workInput, limits, startNonce, 'FOUND', nonce, attempts, null, verified);
      }
      if (cursor === RANGE - 1n) {
        return receipt(workInput, limits, startNonce, 'RANGE_EXHAUSTED', null, attempts, null, null);
      }
      cursor += 1n;
    }
    const next = Buffer.alloc(8); next.writeBigUInt64LE(cursor, 0);
    return receipt(workInput, limits, startNonce, 'BUDGET_EXHAUSTED', null, attempts, next.toString('hex'), null);
  } catch { reject(); }
}

function receipt(workInput, limits, startNonce, status, nonce, attempts, nextNonce, verification) {
  return freeze({
    nonceSearchVersion: 1, scope: 'DECLARED_UNSIGNED_USER_SEND_BOUNDED_NONCE_SEARCH',
    algorithm: ALGORITHM, workInput, limits, startNonce, status, nonce, attempts, nextNonce, verification,
    nonceCandidateEvaluation: attempts === 0 ? 'NOT_PERFORMED' : 'PERFORMED_WITHIN_ATTEMPT_LIMIT',
    nonceProduction: status === 'FOUND' ? 'FOUND_BY_BOUNDED_SEARCH'
      : status === 'WORK_NOT_REQUIRED' ? 'NOT_REQUIRED_BY_DECLARED_ZERO_DIFFICULTY' : 'NO_NONCE_FOUND',
    authority: 'NONE', afterSigningAction: 'NONE', chainAuthentication: 'NOT_ESTABLISHED',
    currentPriceAndAccountState: 'NOT_CHECKED', keyPossession: 'NOT_ESTABLISHED',
    preparation: 'NOT_PERFORMED', signing: 'NOT_PERFORMED', publication: 'NOT_PERFORMED',
  });
}
function record(value, fields) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || prototype(value) !== objectPrototype || ownKeys(value).length !== fields.length) reject();
  const result = create(null);
  for (const key of fields) {
    const d = descriptor(value, key);
    if (d === undefined || d.enumerable !== true || !hasOwn(d, 'value')) reject();
    result[key] = d.value;
  }
  return result;
}
function reject() {
  const code = 'zenon_user_send_nonce_search_input_rejected';
  const error = new ErrorType(code);
  define(error, 'code', { value: code, enumerable: true });
  define(error, 'stack', { value: 'TypeError: ' + code, enumerable: false });
  throw freeze(error);
}
