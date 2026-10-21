import { types as utilTypes } from 'node:util';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { paymentIntentDigest, sha256Hex } from '../canonical.js';
import {
  EXPERIMENTAL_LIVE_NETWORK,
  snapshotActiveUpfrontRequirement,
  sameRequirements,
  validatePaymentRequired,
  validateCanonicalZenonAmount,
} from '../x402-wire.js';
import {
  snapshotDynamicPlasmaQuoteRequest,
  decodeZenonUserSendHashCores,
} from './dynamic-plasma-json-rpc-read-transport.js';

const freeze = Object.freeze;
const create = Object.create;
const ownKeys = Reflect.ownKeys;
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const hasOwn = Object.hasOwn;
const same = Object.is;
const define = Object.defineProperty;
const isProxy = utilTypes.isProxy;
const isSafeInteger = Number.isSafeInteger;
const isArray = Array.isArray;
const testRegExp = Function.call.bind(RegExp.prototype.test);
const objectPrototype = Object.prototype;
const arrayPrototype = Array.prototype;
const ErrorType = TypeError;
const SNAPSHOT_REQUEST = snapshotDynamicPlasmaQuoteRequest;
const SNAPSHOT_REQUIREMENT = snapshotActiveUpfrontRequirement;
const SAME_REQUIREMENT = sameRequirements;
const VALIDATE_CHALLENGE = validatePaymentRequired;
const VALIDATE_AMOUNT = validateCanonicalZenonAmount;
const INTENT_DIGEST = paymentIntentDigest;
const SUBJECT_DIGEST = sha256Hex;
const HASH_CORES = decodeZenonUserSendHashCores;
const CREATE_HASH = createHash;
const HASH = /^[0-9a-f]{64}$/;
const NONCE = /^[0-9a-f]{16}$/;
const PUBLIC_KEY = /^[A-Za-z0-9+/]{43}=$/;
const TOKEN = /^[\x21-\x7e]{10,128}$/;
const ZERO_HASH = '0'.repeat(64);
const SUBJECT_INPUT_FIELDS = freeze([
  'subjectInputVersion', 'phase', 'paymentRequired', 'accepted', 'payerAddress',
  'compiledSporkIds', 'accountFrontier', 'momentumAcknowledged',
]);
const ACCOUNT_FRONTIER_FIELDS = freeze(['address', 'chainIdentifier', 'hash', 'height']);
const BINDING_FIELDS = freeze([
  'bindingVersion', 'subject', 'paymentRequired', 'accepted', 'payerAddress', 'compiledSporkIds',
]);
const SUBJECT_FIELDS = freeze([
  'subjectVersion', 'version', 'chainIdentifier', 'blockType', 'previousHash',
  'height', 'momentumAcknowledged', 'address', 'toAddress', 'amount',
  'tokenStandard', 'fromBlockHash', 'data',
]);
const ACK_FIELDS = freeze(['hash', 'height']);
const COMPILED_FIELDS = freeze(['dynamicPlasmaId', 'libp2pId']);
const UNSIGNED_FIELDS = freeze([
  'version', 'chainIdentifier', 'blockType', 'hash', 'previousHash', 'height',
  'momentumAcknowledged', 'address', 'toAddress', 'amount', 'tokenStandard',
  'fromBlockHash', 'data', 'fusedPlasma', 'difficulty', 'nonce', 'publicKey', 'signature',
]);

/**
 * Central Zenon payment-planning boundary.
 *
 * A planner consumes a payment intent, ChainProfile, payer address, and
 * PlasmaStrategy and returns a fully prepared unsigned AccountBlock. It must
 * not receive a WalletAdapter or private key, sign or publish the block, or
 * construct the surrounding x402 PaymentPayload.
 */
export class ZenonTransactionPlanner {
  async prepareUnsigned(_context) {
    return notImplemented('ZenonTransactionPlanner', 'prepareUnsigned()');
  }
}

export function assertZenonTransactionPlanner(value) {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    throw new TypeError('ZenonTransactionPlanner must be an object');
  }
  if (typeof value.prepareUnsigned !== 'function') {
    throw new TypeError('ZenonTransactionPlanner.prepareUnsigned() must be implemented');
  }
  return value;
}

/**
 * Build the concrete UserSend subject from a selected intent and an explicit
 * declared account frontier, rather than copying caller-selected transfer or
 * next-sequence fields. Derive height=frontier.height+1 and previousHash from
 * the same address/chain-bound declaration. Source: go-zenon
 * e58d8e80eabd9fd5630ed62e0707424d96b5303c verifier/account_block.go
 * previous(), plus the existing exact subject and selected-intent contract.
 *
 * Null/missing/unavailable frontier is NEVER inferred to mean an empty
 * account. Only explicit height0+zeroHash DATA can describe an empty frontier;
 * that declaration is not proof of a new/empty or current account. Every
 * returned field is detached and the existing complete policy binder checks
 * the derived subject again. The operation is synchronous, with no caller
 * callback or await; its UNSIGNED phase is DATA, not authority.
 *
 * This does not read account state, authenticate a frontier/acknowledgement,
 * check funds, run SDK/current-state preparation or a real PREPARE, produce
 * work, sign, publish, refresh a quote or replace a payment. The planner stub,
 * active buyer, real signer and independent acceptance gates are unchanged.
 */
export function createZenonUserSendSubject(input) {
  try {
    if (arguments.length !== 1) rejectBinding();
    const top = bindingRecord(input, SUBJECT_INPUT_FIELDS);
    if (top.subjectInputVersion !== 1 || top.phase !== 'UNSIGNED') rejectBinding();
    const frontier = bindingRecord(top.accountFrontier, ACCOUNT_FRONTIER_FIELDS);
    positiveInteger(frontier.chainIdentifier);
    requireHash(frontier.hash);
    if (!isSafeInteger(frontier.height) || frontier.height < 0 || same(frontier.height, -0)
        || (frontier.height === 0) !== (frontier.hash === ZERO_HASH)
        || frontier.address !== top.payerAddress) rejectBinding();
    const height = frontier.height + 1;
    positiveInteger(height);
    const { challenge, accepted } = snapshotSelectedUpfrontIntent(top.paymentRequired, top.accepted);
    const intentDigest = INTENT_DIGEST(challenge, accepted);
    const subject = {
      subjectVersion: 1, version: 1, chainIdentifier: frontier.chainIdentifier,
      blockType: 2, previousHash: frontier.hash, height,
      momentumAcknowledged: top.momentumAcknowledged,
      address: frontier.address, toAddress: accepted.payTo, amount: accepted.amount,
      tokenStandard: accepted.asset, fromBlockHash: ZERO_HASH,
      data: Buffer.from(intentDigest, 'hex').toString('base64'),
    };
    // Both passes are synchronous and descriptor-closed. The independent
    // existing binder rechecks all selected intent/profile/payer/spork fields;
    // no input hook can run between deriving the intent and this final check.
    return snapshotZenonUserSendPolicyBinding({
      bindingVersion: 1, subject, paymentRequired: top.paymentRequired, accepted: top.accepted,
      payerAddress: top.payerAddress, compiledSporkIds: top.compiledSporkIds,
    }).subject;
  } catch { rejectBinding(); }
}

/**
 * Detached pricing-input binding only, NOT prepareUnsigned() or a block hash.
 * The declared subject excludes Plasma fields, nonce, hash, public key and
 * signature. Plasma selection is bound separately by the shared policy; work,
 * hash/signature validity, actual account/frontier state, token checksum and
 * authenticated payment/chain authority remain separate acceptance gates.
 *
 * Reuse the existing selected-upfront wire validators and payment-intent
 * digest. A one-offer challenge is the buyer's existing selected-offer view,
 * not a new offer-selection algorithm or official x402 conformance claim.
 * A matching payer/requirement is caller-declared DATA, not wallet authority.
 */
export function snapshotZenonUserSendPolicyBinding(input) {
  try {
    if (arguments.length !== 1) rejectBinding();
    const top = bindingRecord(input, BINDING_FIELDS);
    if (top.bindingVersion !== 1) rejectBinding();
    const subject = snapshotSubject(top.subject);
    const { challenge, accepted } = snapshotSelectedUpfrontIntent(top.paymentRequired, top.accepted);
    if (typeof top.payerAddress !== 'string' || top.payerAddress !== subject.address
        || subject.toAddress !== accepted.payTo || subject.amount !== accepted.amount
        || subject.tokenStandard !== accepted.asset
        || String(subject.chainIdentifier) !== accepted.extra.zenonChain.chainIdentifier) rejectBinding();
    const intentDigest = INTENT_DIGEST(challenge, accepted);
    if (subject.data !== Buffer.from(intentDigest, 'hex').toString('base64')) rejectBinding();
    const compiledSporkIds = snapshotCompiledSporks(top.compiledSporkIds);
    const request = SNAPSHOT_REQUEST({
      address: subject.address, blockType: subject.blockType,
      toAddress: subject.toAddress, data: subject.data,
    });
    return freeze({
      bindingVersion: 1,
      subject,
      subjectDigest: 'sha256:' + SUBJECT_DIGEST(['zenon-x402-user-send-subject/v1', subject]),
      intentDigest,
      expectedQuoteRequestContext: freeze({
        requestContextVersion: 1, expectedChainProfile: accepted.extra.zenonChain,
        compiledSporkIds, quoteRequest: request.quoteRequest,
      }),
    });
  } catch { rejectBinding(); }
}

/**
 * Detached declared unsigned AccountBlock JSON, not an SDK preparation result
 * or permission to sign. Extract the actual subject and Plasma pair from this
 * same record; do not validate a separate caller-supplied selection instead.
 * Hash/nonce/public-key checks are syntax only. fieldDigest commits these JSON
 * fields under its own domain: it is NOT the Zenon block hash, work proof,
 * payer-key authentication or a prepared-runtime capability. Empty signature
 * refuses already signed blocks; an empty public key is allowed pre-signing.
 */
export function snapshotZenonUnsignedUserSendFields(input) {
  try {
    if (arguments.length !== 1) rejectBinding();
    const block = bindingRecord(input, UNSIGNED_FIELDS);
    const subjectInput = { subjectVersion: 1 };
    for (const field of SUBJECT_FIELDS) {
      if (field !== 'subjectVersion') subjectInput[field] = block[field];
    }
    const subject = snapshotSubject(subjectInput);
    requireHash(block.hash);
    if (typeof block.nonce !== 'string' || block.nonce.length !== 16
        || !testRegExp(NONCE, block.nonce) || block.signature !== '') rejectBinding();
    if (typeof block.publicKey !== 'string') rejectBinding();
    if (block.publicKey !== '') {
      if (block.publicKey.length !== 44 || !testRegExp(PUBLIC_KEY, block.publicKey)) rejectBinding();
      const key = Buffer.from(block.publicKey, 'base64');
      if (key.length !== 32 || key.toString('base64') !== block.publicKey) rejectBinding();
    }
    for (const field of ['fusedPlasma', 'difficulty']) {
      if (!isSafeInteger(block[field]) || block[field] < 0 || same(block[field], -0)) rejectBinding();
    }
    const accountBlock = freeze({
      version: subject.version, chainIdentifier: subject.chainIdentifier, blockType: subject.blockType,
      hash: block.hash, previousHash: subject.previousHash, height: subject.height,
      momentumAcknowledged: subject.momentumAcknowledged, address: subject.address,
      toAddress: subject.toAddress, amount: subject.amount, tokenStandard: subject.tokenStandard,
      fromBlockHash: subject.fromBlockHash, data: subject.data,
      fusedPlasma: block.fusedPlasma, difficulty: block.difficulty, nonce: block.nonce,
      publicKey: block.publicKey, signature: '',
    });
    return freeze({
      accountBlock, subject,
      subjectDigest: 'sha256:' + SUBJECT_DIGEST(['zenon-x402-user-send-subject/v1', subject]),
      selection: freeze({ fusedPlasma: block.fusedPlasma, difficulty: block.difficulty }),
      fieldDigest: 'sha256:' + SUBJECT_DIGEST(['zenon-x402-unsigned-user-send-fields/v1', accountBlock]),
    });
  } catch { rejectBinding(); }
}

/**
 * Check one declared unsigned UserSend's hash using the existing SDK1.0.5
 * 306-byte encoding contract, without importing/evaluating the SDK. Reuse the
 * closed raw-field snapshot and address codec; ZTS cores require checksum.
 * This is NOT preparation, PoW/nonce validity, key/address binding, signing,
 * authenticated account/chain state, SDK qualification or signing authority.
 * Public key/signature are not part of this hash preimage; signature stays
 * empty through the unsigned-field snapshot. The original input is unchanged.
 */
export function validateZenonUnsignedUserSendHash(input) {
  try {
    if (arguments.length !== 1) rejectBinding();
    const fields = snapshotZenonUnsignedUserSendFields(input);
    const block = fields.accountBlock;
    const computedHash = computeUnsignedHashFromSnapshot(block);
    if (block.hash !== computedHash) rejectBinding();
    return freeze({
      unsignedHashValidationVersion: 1, scope: 'DECLARED_UNSIGNED_USER_SEND_HASH_CONSISTENCY',
      encoding: 'SDK105_ACCOUNT_BLOCK_V1_USER_SEND_306_BYTES', preimageBytes: 306,
      algorithm: 'sha3-256', computedHash, accountBlock: fields.accountBlock,
      subjectDigest: fields.subjectDigest, fieldDigest: fields.fieldDigest,
      hashValidation: 'MATCHES_SUPPLIED_FIELDS', workValidation: 'NOT_PERFORMED',
      keyAddressBinding: 'NOT_PERFORMED', chainAuthentication: 'NOT_ESTABLISHED',
      authority: 'NONE', afterSigningAction: 'NONE',
    });
  } catch { rejectBinding(); }
}

/**
 * Pure hash computation for an exact declared UNSIGNED UserSend DTO.
 * The hash field is still syntax-checked, but this function neither trusts
 * that field nor rewrites it. Signature must remain empty. This is not SDK
 * preparation, nonce generation, signing, publication or signing authority.
 * The exact306-byte encoder is shared with the independent hash validator.
 */
export function computeZenonUnsignedUserSendHash(input) {
  try {
    if (arguments.length !== 1) rejectBinding();
    const fields = snapshotZenonUnsignedUserSendFields(input);
    return computeUnsignedHashFromSnapshot(fields.accountBlock);
  } catch { rejectBinding(); }
}

function computeUnsignedHashFromSnapshot(block) {
  const cores = HASH_CORES({
    address: block.address, toAddress: block.toAddress, tokenStandard: block.tokenStandard,
  });
  const sha3 = value => CREATE_HASH('sha3-256').update(value).digest();
  const preimage = Buffer.concat([
    unsignedBE(block.version, 8), unsignedBE(block.chainIdentifier, 8), unsignedBE(block.blockType, 8),
    Buffer.from(block.previousHash, 'hex'), unsignedBE(block.height, 8),
    Buffer.from(block.momentumAcknowledged.hash, 'hex'), unsignedBE(block.momentumAcknowledged.height, 8),
    Buffer.from(cores.address), Buffer.from(cores.toAddress), unsignedBE(block.amount, 32),
    Buffer.from(cores.tokenStandard), Buffer.from(block.fromBlockHash, 'hex'),
    sha3(Buffer.alloc(0)), sha3(Buffer.from(block.data, 'base64')),
    unsignedBE(block.fusedPlasma, 8), unsignedBE(block.difficulty, 8), Buffer.from(block.nonce, 'hex'),
  ]);
  if (preimage.length !== 306) rejectBinding();
  return sha3(preimage).toString('hex');
}

function unsignedBE(value, width) {
  let integer = BigInt(value);
  if (integer < 0n) rejectBinding();
  const bytes = Buffer.alloc(width);
  for (let index = width - 1; index >= 0; index -= 1) {
    bytes[index] = Number(integer & 255n); integer >>= 8n;
  }
  if (integer !== 0n) rejectBinding();
  return bytes;
}

function snapshotSubject(value) {
  const subject = bindingRecord(value, SUBJECT_FIELDS);
  if (subject.subjectVersion !== 1 || subject.version !== 1 || subject.blockType !== 2) rejectBinding();
  positiveInteger(subject.chainIdentifier); positiveInteger(subject.height);
  requireHash(subject.previousHash); requireHash(subject.fromBlockHash);
  if ((subject.height === 1) !== (subject.previousHash === ZERO_HASH)
      || subject.fromBlockHash !== ZERO_HASH) rejectBinding();
  const ack = bindingRecord(subject.momentumAcknowledged, ACK_FIELDS);
  positiveInteger(ack.height); requireHash(ack.hash);
  if (typeof subject.amount !== 'string' || subject.amount.length > 77) rejectBinding();
  VALIDATE_AMOUNT(subject.amount);
  if (typeof subject.tokenStandard !== 'string' || !testRegExp(TOKEN, subject.tokenStandard)) rejectBinding();
  const request = SNAPSHOT_REQUEST({
    address: subject.address, blockType: subject.blockType,
    toAddress: subject.toAddress, data: subject.data,
  });
  return freeze({
    subjectVersion: 1, version: subject.version, chainIdentifier: subject.chainIdentifier,
    blockType: subject.blockType, previousHash: subject.previousHash, height: subject.height,
    momentumAcknowledged: freeze({ hash: ack.hash, height: ack.height }),
    address: request.quoteRequest.address, toAddress: request.quoteRequest.toAddress,
    amount: subject.amount, tokenStandard: subject.tokenStandard,
    fromBlockHash: subject.fromBlockHash, data: request.quoteRequest.data,
  });
}

function bindingRecord(value, fields) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || prototype(value) !== objectPrototype || ownKeys(value).length !== fields.length) rejectBinding();
  const result = create(null);
  for (const field of fields) {
    const d = descriptor(value, field);
    if (d === undefined || d.enumerable !== true || !hasOwn(d, 'value')) rejectBinding();
    result[field] = d.value;
  }
  return result;
}

// Clone bounded JSON DATA before legacy wire validation/canonicalization:
// do not invoke caller getters, proxies, iterators, toJSON or coercion hooks.
function snapshotJson(value, depth, budget) {
  if (depth > 8 || --budget.nodes < 0) rejectBinding();
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    budget.characters -= value.length;
    if (value.length > 8192 || budget.characters < 0) rejectBinding();
    return value;
  }
  if (typeof value === 'number') {
    if (!isSafeInteger(value) || value < 0 || same(value, -0)) rejectBinding();
    return value;
  }
  if (typeof value !== 'object' || isProxy(value)) rejectBinding();
  const p = prototype(value), keys = ownKeys(value);
  if (p === arrayPrototype) {
    if (!isArray(value)) rejectBinding();
    const length = descriptor(value, 'length');
    if (length === undefined || !hasOwn(length, 'value') || length.enumerable !== false
        || !isSafeInteger(length.value) || length.value < 0 || length.value > 16
        || keys.length !== length.value + 1) rejectBinding();
    const array = [];
    for (let index = 0; index < length.value; index++) {
      const d = descriptor(value, String(index));
      if (d === undefined || d.enumerable !== true || !hasOwn(d, 'value')) rejectBinding();
      array[index] = snapshotJson(d.value, depth + 1, budget);
    }
    return freeze(array);
  }
  if (p !== objectPrototype || isArray(value) || keys.length > 32) rejectBinding();
  const result = create(null);
  for (const key of keys) {
    if (typeof key !== 'string' || key.length > 128) rejectBinding();
    const d = descriptor(value, key);
    if (d === undefined || d.enumerable !== true || !hasOwn(d, 'value')) rejectBinding();
    result[key] = snapshotJson(d.value, depth + 1, budget);
  }
  return freeze(result);
}

function positiveInteger(value) {
  if (!isSafeInteger(value) || value <= 0 || same(value, -0)) rejectBinding();
}

function requireHash(value) {
  if (typeof value !== 'string' || value.length !== 64 || !testRegExp(HASH, value)) rejectBinding();
}

function rejectBinding() {
  const code = 'zenon_user_send_binding_input_rejected';
  const error = new ErrorType(code);
  define(error, 'code', { value: code, enumerable: true });
  define(error, 'stack', { value: 'TypeError: ' + code, enumerable: false });
  throw freeze(error);
}

function notImplemented(contract, method) {
  throw new TypeError(`${contract}.${method} must be implemented`);
}

const OBSERVATION_INTENT_FIELDS = freeze([
  'observationIntentVersion', 'phase', 'paymentRequired', 'accepted',
  'payerAddress', 'compiledSporkIds',
]);

/**
 * Initial schema3 DP read input from the selected intent alone. A quote read
 * needs payer/type/recipient/intent data, not an account sequence or an already
 * selected Momentum acknowledgement. Reuse the exact selected-upfront snapshot,
 * canonical intent digest, compiled IDs and closed payer/request codec used by
 * the existing subject/binder. No placeholder frontier/ack is invented.
 *
 * Returned frozen collection input works directly with the existing explicit
 * request-bound collector, which derives its expected digest before reading.
 * This function is synchronous DATA only: no collector, callback, Promise,
 * endpoint, work producer, wallet, signer or operation is constructed/invoked.
 * It does not admit a UserSend subject/block or quote reuse. Actual account
 * state/sequence, the original acknowledgement, policy/runtime, funds and
 * payer/provider/signing authority remain independent later gates. The phase
 * is declared metadata, not proof of signer state or replacement permission.
 */
export function createZenonUserSendObservationInput(input) {
  try {
    if (arguments.length !== 1) rejectBinding();
    const top = bindingRecord(input, OBSERVATION_INTENT_FIELDS);
    if (top.observationIntentVersion !== 1 || top.phase !== 'UNSIGNED') rejectBinding();
    const { challenge, accepted } = snapshotSelectedUpfrontIntent(top.paymentRequired, top.accepted);
    const compiledSporkIds = snapshotCompiledSporks(top.compiledSporkIds);
    const intentDigest = INTENT_DIGEST(challenge, accepted);
    const request = SNAPSHOT_REQUEST({
      address: top.payerAddress, blockType: 2, toAddress: accepted.payTo,
      data: Buffer.from(intentDigest, 'hex').toString('base64'),
    });
    return freeze({
      phase: 'UNSIGNED', expectedChainProfile: accepted.extra.zenonChain,
      compiledSporkIds, quoteRequest: request.quoteRequest,
      requiredFusedObservationVersion: 1, quoteRequestContextVersion: 1,
    });
  } catch { rejectBinding(); }
}

// Same checks and ordering as the two original inline selected-intent paths.
// Keep digest computation and later subject equality at their original sites.
function snapshotSelectedUpfrontIntent(paymentRequired, requirement) {
  const challenge = snapshotJson(paymentRequired, 0, { nodes: 512, characters: 32768 });
  VALIDATE_CHALLENGE(challenge);
  if (challenge.accepts.length !== 1 || new URL(challenge.resource.url).protocol !== 'https:') rejectBinding();
  const accepted = SNAPSHOT_REQUIREMENT(requirement);
  if (accepted.network !== EXPERIMENTAL_LIVE_NETWORK
      || !SAME_REQUIREMENT(accepted, challenge.accepts[0])) rejectBinding();
  return freeze({ challenge, accepted });
}

function snapshotCompiledSporks(value) {
  const compiled = bindingRecord(value, COMPILED_FIELDS);
  requireHash(compiled.dynamicPlasmaId); requireHash(compiled.libp2pId);
  if (compiled.dynamicPlasmaId === compiled.libp2pId) rejectBinding();
  return freeze({ dynamicPlasmaId: compiled.dynamicPlasmaId, libp2pId: compiled.libp2pId });
}
