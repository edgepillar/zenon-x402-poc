import { types as utilTypes } from 'node:util';
import { Buffer } from 'node:buffer';
import { ObservedDynamicPlasmaUserSendAdapter } from './dynamic-plasma-observed-user-send-adapter.js';
import { encodeZenonUnsignedOriginalQuoteCheckpoint } from './dynamic-plasma-unsigned-original-checkpoint.js';

const VALIDATE_ORIGINAL = ObservedDynamicPlasmaUserSendAdapter.prototype.validateUnsigned;
const ENCODE = encodeZenonUnsignedOriginalQuoteCheckpoint;
const freeze = Object.freeze;
const create = Object.create;
const define = Object.defineProperty;
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const ownKeys = Reflect.ownKeys;
const hasOwn = Object.hasOwn;
const apply = Reflect.apply;
const isProxy = utilTypes.isProxy;
const isArray = Array.isArray;
const isSafeInteger = Number.isSafeInteger;
const same = Object.is;
const byteLength = Buffer.byteLength;
const objectPrototype = Object.prototype;
const arrayPrototype = Array.prototype;
const NativePromise = Promise;
const promisePrototype = NativePromise.prototype;
const species = Symbol.species;
const constructorDescriptor = descriptor(promisePrototype, 'constructor');
const speciesDescriptor = descriptor(NativePromise, species);
const initialThen = descriptor(objectPrototype, 'then');
const ErrorType = TypeError;
const VIEW = freeze([
  'observedUserSendViewVersion', 'phase', 'paymentRequired', 'accepted',
  'payerAddress', 'compiledSporkIds', 'accountFrontierResultJson',
  'observation', 'policy', 'runtimeContextDigest',
]);
const PLAN = freeze(['observedUserSendPlanVersion', 'subject', 'quote']);
const MAX_CHECKPOINT_BYTES = 32768;

/**
 * Opt-in application connection from the existing observed UserSend view and
 * independently retained ORIGINAL plan/block to the canonical checkpoint.
 * No prior adapter, planner, active buyer or default is changed. Encoding
 * validates the same original block against the actual observed adapter first:
 * the declared account frontier must still match the original payer/sequence,
 * then its existing intent/hash/fixed-nonce/key/price checks must pass. Reuse
 * the checkpoint encoder with that same detached block and original quote.
 *
 * Validation takes FOUR independent inputs: current view, original plan,
 * original unsigned block, and incoming checkpoint text. Reconstruct the
 * exact canonical bytes from the independent originals under the CURRENT
 * checks, then require byte equality. A coherent different block/nonce/hash
 * or quote cannot substitute merely because the general codec accepts it.
 * No untrusted checkpoint parse or redundant decode is needed on this path.
 * Snapshot all selected DATA synchronously before any await. Never reread or
 * freeze caller records, invoke their getters/toJSON/coercions/Proxy hooks,
 * re-quote, reassemble, repair, search for work, or refresh acknowledgements.
 *
 * The independently retained expectations are still caller-supplied DATA;
 * this module does not store or authenticate them. It is not durable custody,
 * consumed-authority state, a signing capability or an original issuer proof.
 * Changed account projections and expiry refuse without replacement. Coherent
 * fabricated view/originals can still pass. An account projection is NOT an
 * atomic/fresh/authenticated balance, ancestry, funds or inclusion proof.
 *
 * UNSIGNED cannot detect an external signer. Use ONLY before external signing;
 * preserve signed bytes/hash/context and VALIDATED versus UNKNOWN/ACKNOWLEDGED
 * under their independent owner. Repeated DATA checks never renew authority.
 * No RPC/network, SQL, filesystem write/reopen, SDK, key/signature production,
 * actual PREPARE, payment, native owner or live pilot is introduced. Captured
 * native intrinsics/dependencies remain premises. DATA ceilings are not OS
 * memory, wall-clock, cancellation, cleanup or native lifetime guarantees.
 */
export function encodeObservedZenonUnsignedOriginalQuoteCheckpoint(view, originalPlan, originalBlock) {
  return shield(run('encode', arguments.length, view, originalPlan, originalBlock, null));
}

export function validateObservedZenonUnsignedOriginalQuoteCheckpoint(view, originalPlan, originalBlock, checkpointJson) {
  return shield(run('validate', arguments.length, view, originalPlan, originalBlock, checkpointJson));
}

async function run(kind, count, view, originalPlan, originalBlock, checkpointJson) {
  try {
    if (count !== (kind === 'encode' ? 3 : 4) || !invariant()) reject();
    if (kind === 'validate' && (typeof checkpointJson !== 'string'
        || checkpointJson.length > MAX_CHECKPOINT_BYTES
        || apply(byteLength, Buffer, [checkpointJson, 'utf8']) > MAX_CHECKPOINT_BYTES)) reject();
    const budget = { nodes: 32768, characters: 2097152 };
    const stableView = snapshot(record(view, VIEW), 0, budget);
    const stablePlan = snapshot(record(originalPlan, PLAN), 0, budget);
    const stableBlock = snapshot(originalBlock, 0, budget);
    if (stableView.observedUserSendViewVersion !== 1 || stableView.phase !== 'UNSIGNED'
        || stablePlan.observedUserSendPlanVersion !== 1) reject();
    const context = freeze({
      phase: stableView.phase, subject: stablePlan.subject,
      paymentRequired: stableView.paymentRequired, accepted: stableView.accepted,
      payerAddress: stableView.payerAddress, compiledSporkIds: stableView.compiledSporkIds,
      observation: stableView.observation, policy: stableView.policy,
      runtimeContextDigest: stableView.runtimeContextDigest,
    });
    const checked = await apply(VALIDATE_ORIGINAL, undefined, [stableView, stablePlan, stableBlock]);
    if (!invariant()) reject();
    const block = checked.workBinding.hashPriceBinding.accountBlock;
    const expected = await ENCODE(context, stablePlan.quote, block);
    if (!invariant()) reject();
    if (kind === 'encode') return expected;
    if (checkpointJson !== expected) reject();
    const receipt = create(null);
    put(receipt, 'observedOriginalQuoteCheckpointVersion', 1);
    put(receipt, 'scope', 'DECLARED_OBSERVED_UNSIGNED_ORIGINAL_QUOTE_CHECKPOINT');
    put(receipt, 'checkpointJson', expected);
    put(receipt, 'accountBlock', block);
    put(receipt, 'quote', stablePlan.quote);
    put(receipt, 'validation', checked);
    put(receipt, 'originalPacketBinding', 'EXACT_CANONICAL_BYTES_FOR_INDEPENDENT_PLAN_AND_BLOCK');
    put(receipt, 'accountFrontierProjection', 'MATCHES_DECLARED_ORIGINAL_ACCOUNT_FRONTIER');
    put(receipt, 'currentAccountBalance', 'NOT_CHECKED');
    put(receipt, 'persistence', 'NOT_PERFORMED');
    put(receipt, 'signingAuthorization', 'NOT_ESTABLISHED');
    put(receipt, 'chainAuthentication', 'NOT_ESTABLISHED');
    put(receipt, 'authority', 'NONE');
    put(receipt, 'afterSigningAction', 'NONE');
    return freeze(receipt);
  } catch { reject(); }
}

function record(value, fields) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || prototype(value) !== objectPrototype || ownKeys(value).length !== fields.length) reject();
  const result = create(objectPrototype);
  for (const field of fields) {
    const d = descriptor(value, field);
    if (d === undefined || !d.enumerable || !hasOwn(d, 'value')) reject();
    put(result, field, d.value);
  }
  return result;
}

// The same finite descriptor-DATA seam as the retained assembly/read adapters.
// Array entries, including spork snapshots, are detached, dense and undecorated.
// Every key/value contributes to the shared limits across view, plan and block.
function snapshot(value, depth, budget) {
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
  const proto = prototype(value), keys = ownKeys(value);
  if (proto === arrayPrototype) {
    const d = descriptor(value, 'length');
    if (!isArray(value) || d === undefined || !hasOwn(d, 'value')
        || !isSafeInteger(d.value) || d.value < 0 || d.value > 1024
        || keys.length !== d.value + 1 || keys.length > budget.nodes + 1) reject();
    const result = [];
    for (let index = 0; index < d.value; index++) {
      const child = descriptor(value, String(index));
      if (child === undefined || !child.enumerable || !hasOwn(child, 'value')) reject();
      put(result, String(index), snapshot(child.value, depth + 1, budget));
    }
    return freeze(result);
  }
  if (proto !== objectPrototype || keys.length > 1024 || keys.length > budget.nodes) reject();
  const result = create(objectPrototype);
  for (const key of keys) {
    if (typeof key !== 'string' || key.length > 128) reject();
    budget.characters -= key.length;
    if (budget.characters < 0) reject();
    const d = descriptor(value, key);
    if (d === undefined || !d.enumerable || !hasOwn(d, 'value')) reject();
    put(result, key, snapshot(d.value, depth + 1, budget));
  }
  return freeze(result);
}
function shield(promise) { put(promise, 'constructor', NativePromise, false); return promise; }
function invariant() {
  return initialThen === undefined && descriptor(objectPrototype, 'then') === undefined
    && sameDescriptor(descriptor(promisePrototype, 'constructor'), constructorDescriptor)
    && sameDescriptor(descriptor(NativePromise, species), speciesDescriptor);
}
function sameDescriptor(actual, expected) {
  if (actual === undefined || expected === undefined || ownKeys(actual).length !== ownKeys(expected).length)
    return false;
  for (const key of ownKeys(expected)) if (!hasOwn(actual, key) || actual[key] !== expected[key]) return false;
  return true;
}
function put(value, key, content, enumerable = true) {
  const d = create(null);
  d.value = content; d.enumerable = enumerable; d.writable = false; d.configurable = false;
  define(value, key, d);
}
function reject() {
  const code = 'zenon_observed_original_checkpoint_input_rejected';
  const error = new ErrorType(code);
  put(error, 'code', code);
  put(error, 'stack', 'TypeError: ' + code, false);
  throw freeze(error);
}
