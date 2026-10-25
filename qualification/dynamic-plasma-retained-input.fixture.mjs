// Fixed public DATA and deliberately invalid signature-shaped bytes only.
// No key, signature, nonce search, planner, SDK, SQLite, socket or wallet call.
import { Buffer } from 'node:buffer';
import { paymentIntentDigest } from '../src/canonical.js';
import { computeZenonUnsignedUserSendHash } from '../src/zenon/transaction-planner.js';
import { fundingPostPreparationInputFixture } from './dynamic-plasma-funding-post-input.fixture.mjs';

const PUBLIC_KEY = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=';
const PAYER = 'z1qrv8fqk3ha78tpwegtmx2k5qyp6g28kymvqlfy';
const ZERO = '0'.repeat(64);
const INVALID_SIGNATURE_DATA = Buffer.alloc(64, 42).toString('base64');

export function retainedOriginalInputFixture(options) {
  const f = fundingPostPreparationInputFixture(options);
  f.input.plannerContext.readInput.payerAddress = PAYER;
  const r = f.input.plannerContext.readInput;
  const originalUnsignedBlock = {
    version: 1, chainIdentifier: 73404, blockType: 2, hash: ZERO,
    previousHash: '66'.repeat(32), height: 7,
    momentumAcknowledged: { hash: '33'.repeat(32), height: 100 },
    address: PAYER, toAddress: r.accepted.payTo, amount: r.accepted.amount,
    tokenStandard: r.accepted.asset, fromBlockHash: ZERO,
    data: Buffer.from(paymentIntentDigest(r.paymentRequired, r.accepted), 'hex').toString('base64'),
    fusedPlasma: 21000, difficulty: 0, nonce: '0000000000000000',
    publicKey: PUBLIC_KEY, signature: '',
  };
  // A fixed unsigned DTO hash, not actual PREPARE or nonce generation.
  originalUnsignedBlock.hash = computeZenonUnsignedUserSendHash(originalUnsignedBlock);
  return { ...f, candidate: { originalUnsignedBlock,
    accountBlock: { ...originalUnsignedBlock, signature: INVALID_SIGNATURE_DATA } } };
}
