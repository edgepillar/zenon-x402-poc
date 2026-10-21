import { types as utilTypes } from 'node:util';
import { Buffer } from 'node:buffer';
import { BoundedDynamicPlasmaStrategy } from './bounded-dynamic-plasma-strategy.js';
import { computeZenonUnsignedUserSendHash } from './transaction-planner.js';
import { bindZenonUnsignedUserSendKeyBinding } from './dynamic-plasma-user-send-key-binding.js';
import { snapshotDynamicPlasmaObservationCollectionInput } from './dynamic-plasma-observation-collector.js';

const CREATE_DRAFT = BoundedDynamicPlasmaStrategy.prototype.createUnsignedUserSendDraft;
const COMPUTE_HASH = computeZenonUnsignedUserSendHash;
const BIND_KEY = bindZenonUnsignedUserSendKeyBinding;
const SNAPSHOT_COLLECTION = snapshotDynamicPlasmaObservationCollectionInput;
const apply = Reflect.apply;
const ownKeys = Reflect.ownKeys;
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const hasOwn = Object.hasOwn;
const create = Object.create;
const define = Object.defineProperty;
const freeze = Object.freeze;
const same = Object.is;
const isSafeInteger = Number.isSafeInteger;
const isArray = Array.isArray;
const isProxy = utilTypes.isProxy;
const test = Function.call.bind(RegExp.prototype.test);
const objectPrototype = Object.prototype;
const arrayPrototype = Array.prototype;
const ErrorType = TypeError;
const PUBLIC_KEY = /^[A-Za-z0-9+/]{43}=$/;
const NONCE = /^[0-9a-f]{16}$/;
const MATERIAL_FIELDS = freeze(['materialVersion', 'publicKey', 'nonce']);

/**
 * Assemble NEW declared unsigned UserSend DATA from the independent subject/
 * intent and ORIGINAL quote, plus supplied public-key and nonce byte strings.
 * Never accept or rewrite a caller's account block, hash, signature, payment,
 * requirement, quote or consumed authority. Never refresh a quote or choose/
 * search/increment a nonce. Signature stays empty. This is NOT
 * ZenonTransactionPlanner.prepareUnsigned(), current account-state/SDK
 * preparation, a real PREPARE action, approval or a signing capability.
 *
 * Snapshot all input DATA before the first await. Reuse the existing draft
 * producer, one shared306-byte hash encoder, and the independent complete
 * intent/hash/nonce/key/price consumer on the SAME assembled block. The input
 * snapshots, receipts and result are still caller-declared DATA; no frozen
 * object or matching field proves current chain truth or signer authority.
 */
export async function assembleZenonUnsignedUserSend(context, quote, material) {
  try {
    if (arguments.length !== 3) reject();
    const bytes = snapshotMaterial(material);
    const budget = { nodes: 32768, characters: 2097152 };
    const stableContext = snapshotData(context, 0, budget);
    const stableQuote = snapshotData(quote, 0, budget);
    const request = SNAPSHOT_COLLECTION({
      phase: stableContext.phase, requiredFusedObservationVersion: 1, quoteRequestContextVersion: 1,
      expectedChainProfile: stableContext.accepted.extra.zenonChain,
      compiledSporkIds: stableContext.compiledSporkIds,
      quoteRequest: {
        address: stableContext.subject.address, blockType: stableContext.subject.blockType,
        toAddress: stableContext.subject.toAddress, data: stableContext.subject.data,
      },
    });
    const draft = await apply(CREATE_DRAFT, undefined, [stableContext, stableQuote]);
    const candidate = {
      ...draft.accountBlock, nonce: bytes.nonce, publicKey: bytes.publicKey,
    };
    candidate.hash = COMPUTE_HASH(candidate);
    const validation = await BIND_KEY(stableContext, stableQuote, candidate);
    const accountBlock = validation.workBinding.hashPriceBinding.accountBlock;
    return freeze({
      unsignedAssemblyVersion: 1, scope: 'DECLARED_UNSIGNED_USER_SEND_ASSEMBLY',
      stage: 'UNSIGNED_DECLARED_FIELDS_ONLY', preparation: 'NOT_PERFORMED',
      accountBlock, validation, quoteRequestContextDigest: request.expectedRequestContextDigest,
      authority: 'NONE', afterSigningAction: 'NONE',
      keyPossession: 'NOT_ESTABLISHED', signatureValidation: 'NOT_PERFORMED',
      chainAuthentication: 'NOT_ESTABLISHED',
    });
  } catch { reject(); }
}

function snapshotMaterial(value) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || prototype(value) !== objectPrototype || ownKeys(value).length !== 3) reject();
  const result = create(null);
  for (const field of MATERIAL_FIELDS) {
    const d = descriptor(value, field);
    if (d === undefined || d.enumerable !== true || !hasOwn(d, 'value')) reject();
    result[field] = d.value;
  }
  if (result.materialVersion !== 1
      || typeof result.publicKey !== 'string' || result.publicKey.length !== 44
      || !test(PUBLIC_KEY, result.publicKey)
      || typeof result.nonce !== 'string' || result.nonce.length !== 16
      || !test(NONCE, result.nonce)) reject();
  const key = Buffer.from(result.publicKey, 'base64');
  if (key.length !== 32 || key.toString('base64') !== result.publicKey) reject();
  return freeze(result);
}

// Bounded descriptor-only JSON copy for this composition seam, not a new wire
// grammar. Existing component validators still enforce every original field
// contract afterward. Arrays allow the normalizer's up-to1024 spork list;
// total nodes/chars span BOTH context and quote. Undefined/functions/symbols,
// non-DATA fields, proxies, foreign prototypes, sparse/decorated arrays and
// excessive depth/size refuse without invoking caller hooks. Cycles refuse
// at the finite depth/node bounds. No caller object is frozen or mutated.
function snapshotData(value, depth, budget) {
  if (depth > 16 || --budget.nodes < 0) reject();
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    budget.characters -= value.length;
    if (value.length > 8192 || budget.characters < 0) reject();
    return value;
  }
  if (typeof value === 'number') {
    if (!isSafeInteger(value) || value < 0 || same(value, -0)) reject();
    return value;
  }
  if (typeof value !== 'object' || isProxy(value)) reject();
  const p = prototype(value), keys = ownKeys(value);
  if (p === arrayPrototype) {
    if (!isArray(value)) reject();
    const length = descriptor(value, 'length');
    if (length === undefined || !hasOwn(length, 'value') || length.enumerable !== false
        || !isSafeInteger(length.value) || length.value < 0 || length.value > 1024
        || keys.length !== length.value + 1) reject();
    const result = [];
    for (let index = 0; index < length.value; index += 1) {
      const d = descriptor(value, String(index));
      if (d === undefined || !hasOwn(d, 'value') || d.enumerable !== true) reject();
      put(result, String(index), snapshotData(d.value, depth + 1, budget));
    }
    return freeze(result);
  }
  if (p !== objectPrototype || isArray(value) || keys.length > 32) reject();
  const result = create(objectPrototype);
  for (const key of keys) {
    if (typeof key !== 'string' || key.length > 128) reject();
    const d = descriptor(value, key);
    if (d === undefined || !hasOwn(d, 'value') || d.enumerable !== true) reject();
    put(result, key, snapshotData(d.value, depth + 1, budget));
  }
  return freeze(result);
}

function put(target, key, value) {
  const attributes = create(null);
  attributes.value = value; attributes.enumerable = true;
  attributes.writable = false; attributes.configurable = false;
  define(target, key, attributes);
}

function reject() {
  const code = 'zenon_user_send_assembly_input_rejected';
  const error = new ErrorType(code);
  put(error, 'code', code);
  const attributes = create(null);
  attributes.value = 'TypeError: ' + code; attributes.enumerable = false;
  attributes.writable = false; attributes.configurable = false;
  define(error, 'stack', attributes);
  throw freeze(error);
}
