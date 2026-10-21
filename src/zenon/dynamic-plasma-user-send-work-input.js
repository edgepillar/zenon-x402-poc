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

/**
 * Derive the actual fixed-size PoW input from declared unsigned UserSend DATA:
 * SHA3-256(address20 || previousHash32), with the supplied difficulty unchanged.
 * Source: go-zenon e58d8e80eabd9fd5630ed62e0707424d96b5303c,
 * pow/pow.go GetAccountBlockHash and common/{types,crypto}/hash.go.
 *
 * This is shared by the pre-work request producer and fixed-nonce verifier.
 * It accepts the existing exact unsigned-field grammar, including a draft's
 * zero hash/nonce and empty public key. It does NOT validate the block hash,
 * supplied nonce, intent, current required difficulty, funds, key possession
 * or chain state. In particular, different transfers from the same declared
 * payer/frontier can share this work input; it is not a payment commitment.
 * No nonce is generated, searched, incremented or returned. No signature,
 * SDK, native work provider, signing capability or live operation is used.
 */
export function deriveZenonUserSendWorkInput(input) {
  try {
    if (arguments.length !== 1) reject();
    const fields = SNAPSHOT_FIELDS(input), block = fields.accountBlock;
    const cores = HASH_CORES({
      address: block.address, toAddress: block.toAddress, tokenStandard: block.tokenStandard,
    });
    const preimage = Buffer.concat([
      Buffer.from(cores.address), Buffer.from(block.previousHash, 'hex'),
    ]);
    if (preimage.length !== 52) reject();
    const dataHash = HASH('sha3-256').update(preimage).digest('hex');
    return freeze({
      workInputVersion: 1, scope: 'DECLARED_USER_SEND_WORK_INPUT',
      algorithm: 'GO_ZENON_E58D8E8_SHA3_256_ADDRESS20_PREVIOUS_HASH32',
      preimageBytes: 52, dataHashBytes: 32, dataHash,
      difficulty: block.difficulty, workRequired: block.difficulty > 0,
      address: block.address, previousHash: block.previousHash,
      subjectDigest: fields.subjectDigest, fieldDigest: fields.fieldDigest,
      nonceGeneration: 'NOT_PERFORMED', hashAndNonceValidation: 'NOT_PERFORMED',
      chainAuthentication: 'NOT_ESTABLISHED', authority: 'NONE', afterSigningAction: 'NONE',
    });
  } catch { reject(); }
}

function reject() {
  const code = 'zenon_user_send_work_input_rejected';
  const error = new ErrorType(code);
  define(error, 'code', { value: code, enumerable: true });
  define(error, 'stack', { value: 'TypeError: ' + code, enumerable: false });
  throw freeze(error);
}
