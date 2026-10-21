import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { snapshotZenonUnsignedUserSendFields } from './transaction-planner.js';
import { decodeZenonUserSendHashCores } from './dynamic-plasma-json-rpc-read-transport.js';

const SNAPSHOT_FIELDS = snapshotZenonUnsignedUserSendFields;
const HASH_CORES = decodeZenonUserSendHashCores;
const HASH = createHash;
const freeze = Object.freeze;
const define = Object.defineProperty;
const ErrorType = TypeError;
const ZERO_HASH = '0'.repeat(64);
const ZERO_NONCE = '0'.repeat(16);

/**
 * Fixed-cost declared public-key/address consistency BEFORE candidate work.
 * Reuse the unchanged exact unsigned-field snapshot and address codec. The
 * user-address rule is the existing post-work check's SHA3-256(publicKey32)
 * prefix: go-zenon e58d8e80eabd9fd5630ed62e0707424d96b5303c,
 * common/types/address.go. This is not another planner or material producer.
 *
 * Input is one exact AccountBlock DATA record, with a present canonical
 * publicKey, zero hash/nonce and empty signature. The original caller/work
 * request is not changed or frozen. This checks the detached block's actual
 * address, never a separate caller-provided payer or a self-asserted receipt.
 * Return a frozen consistency receipt only, not an unsigned/prepared block.
 *
 * The one 32-byte public-key digest is NOT a nonce predicate or nonce search.
 * No quote, prices, work, block-hash validity, curve-point validity, key
 * possession, signer state, funding/chain truth, approval or signing authority
 * is established. A positive difficulty is DATA only and performs no work.
 * Full original-quote/hash/work/key checks at assembly must remain in place.
 * Default-off; no active buyer, SDK, wallet, provider or publication is wired.
 * Native crypto/Buffer/loader behavior remains a premise, not a sandbox.
 */
export function validateZenonUnsignedUserSendPreWorkKeyBinding(input) {
  try {
    if (arguments.length !== 1) reject();
    const fields = SNAPSHOT_FIELDS(input), block = fields.accountBlock;
    if (block.hash !== ZERO_HASH || block.nonce !== ZERO_NONCE || block.publicKey === '') reject();
    const key = Buffer.from(block.publicKey, 'base64');
    if (key.length !== 32) reject();
    const digest = HASH('sha3-256').update(key).digest();
    const expectedCore = Buffer.concat([Buffer.from([0]), digest.subarray(0, 19)]);
    const cores = HASH_CORES({
      address: block.address, toAddress: block.toAddress, tokenStandard: block.tokenStandard,
    });
    if (!expectedCore.equals(Buffer.from(cores.address))) reject();
    return freeze({
      preWorkKeyValidationVersion: 1,
      scope: 'DECLARED_PRE_WORK_USER_SEND_PUBLIC_KEY_ADDRESS_CONSISTENCY',
      stage: 'BEFORE_NONCE_GENERATION',
      algorithm: 'GO_ZENON_E58D8E8_SHA3_256_PUBLIC_KEY_USER_ADDRESS',
      subjectDigest: fields.subjectDigest, fieldDigest: fields.fieldDigest,
      publicKey: block.publicKey, address: block.address,
      addressCoreHex: expectedCore.toString('hex'),
      keyAddressBinding: 'MATCHES_SUPPLIED_PUBLIC_KEY_BYTES',
      keyPossession: 'NOT_ESTABLISHED',
      hashValidation: 'NOT_PERFORMED', workValidation: 'NOT_PERFORMED',
      nonceGeneration: 'NOT_PERFORMED', signatureValidation: 'NOT_PERFORMED',
      preparation: 'NOT_PERFORMED', signing: 'NOT_PERFORMED', publication: 'NOT_PERFORMED',
      chainAuthentication: 'NOT_ESTABLISHED', authority: 'NONE', afterSigningAction: 'NONE',
    });
  } catch { reject(); }
}

function reject() {
  const code = 'zenon_user_send_pre_work_key_binding_input_rejected';
  const error = new ErrorType(code);
  define(error, 'code', { value: code, enumerable: true });
  define(error, 'stack', { value: 'TypeError: ' + code, enumerable: false });
  throw freeze(error);
}
