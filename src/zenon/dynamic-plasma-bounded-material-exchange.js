import { types as utilTypes } from 'node:util';
import { Buffer } from 'node:buffer';
import { snapshotZenonUnsignedUserSendFields } from './transaction-planner.js';
import { deriveZenonUserSendWorkInput } from './dynamic-plasma-user-send-work-input.js';
import { validateZenonUnsignedUserSendPreWorkKeyBinding } from './dynamic-plasma-user-send-pre-work-key-binding.js';
import { searchZenonUnsignedUserSendNonce } from './dynamic-plasma-user-send-nonce-search.js';

const SNAPSHOT_FIELDS = snapshotZenonUnsignedUserSendFields;
const WORK_INPUT = deriveZenonUserSendWorkInput;
const CHECK_PRE_WORK_KEY = validateZenonUnsignedUserSendPreWorkKeyBinding;
const SEARCH = searchZenonUnsignedUserSendNonce;
const freeze = Object.freeze;
const create = Object.create;
const define = Object.defineProperty;
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const ownKeys = Reflect.ownKeys;
const hasOwn = Object.hasOwn;
const apply = Reflect.apply;
const isSafeInteger = Number.isSafeInteger;
const same = Object.is;
const isProxy = utilTypes.isProxy;
const test = Function.call.bind(RegExp.prototype.test);
const objectPrototype = Object.prototype;
const NativePromise = Promise;
const promisePrototype = NativePromise.prototype;
const species = Symbol.species;
const constructorDescriptor = descriptor(promisePrototype, 'constructor');
const speciesDescriptor = descriptor(NativePromise, species);
const initialObjectThen = descriptor(objectPrototype, 'then');
const bufferFrom = Buffer.from;
const bufferToString = Buffer.prototype.toString;
const ErrorType = TypeError;
const BusyError = Error;
const CONFIG = freeze(['publicKey', 'startNonce', 'limits']);
const LIMITS = freeze(['maxAttempts', 'maxDifficulty']);
const REQUEST = freeze(['materialRequestVersion', 'phase', 'workRequest']);
const WORK = freeze([
  'unsignedWorkRequestVersion', 'scope', 'stage', 'preparation', 'accountBlock',
  'selection', 'workInput', 'subjectDigest', 'intentDigest', 'fieldDigest',
  'hashAndNonceValidation', 'keyAddressBinding', 'chainAuthentication', 'authority', 'afterSigningAction',
]);
const SELECTION = freeze(['fusedPlasma', 'difficulty']);
const PUBLIC_KEY = /^[A-Za-z0-9+/]{43}=$/;
const NONCE = /^[0-9a-f]{16}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const ZERO_HASH = '0'.repeat(64);
const ZERO_NONCE = '0'.repeat(16);

/**
 * Opt-in materialExchange capability for the deferred-material planner. This
 * source is an UNEXECUTED local integration draft until its candidate-search
 * qualification is explicitly admitted. Importing/evaluating this module also
 * imports the separate bounded nonce-search draft; fixed-material/metadata
 * approval alone is NOT authority to execute it. No active default is changed.
 *
 * Configuration supplies an existing canonical publicKey, an explicit start
 * cursor and one maxAttempts<=4096/maxDifficulty budget. Construction performs
 * no search, key production or callback. Return only a frozen function accepting
 * the planner's exact v1 material request and returning a native Promise of v1
 * material DATA. One admitted invocation consumes the capability, even on bad
 * input or exhaustion. Busy/used precede inspection; wrong arity alone does not
 * consume it. No reset, continuation, retry, quote refresh or replacement exists.
 *
 * Snapshot all selected DATA synchronously, before yielding. Reuse the existing
 * exact unsigned-field snapshot and work-input derivation; compare the actual
 * original block with every declared work-input field, selection and digest.
 * Require zero hash/nonce and empty key/signature pre-work placeholders. Require
 * the intent digest to match the block's existing intent bytes. This checks
 * declared internal consistency, NOT quote issuance, chain origin, authority or
 * a full external intent commitment. Coherent forged DATA is still possible.
 *
 * Before yielding or searching, check the configured public bytes against
 * this detached block's actual payer address through the fixed-cost pre-work
 * key validator. A mismatch consumes admission but returns no material and
 * never spends a search budget or enters later assembly/read cycles. Preserve
 * the original work-request evidence flags; this local consistency check does
 * not relabel their earlier keyAddressBinding or authorize signing.
 *
 * After one yield, call the captured bounded search once. Only FOUND or declared
 * WORK_NOT_REQUIRED produces material. Exhaustion is terminal, with no nonce or
 * next cursor disclosed and no fallback request. The producer never changes a
 * caller block or returns a prepared/signed block, hash, payload or raw failure.
 * Zero difficulty uses the unchanged placeholder with zero candidate work; it
 * is NOT proof of sufficient current Plasma. Matching public bytes are not
 * key possession or payer authority: unchanged subsequent assembly must STILL
 * validate key/address, original quote/account and final horizon on the SAME
 * block. The pre-work guard never substitutes for those full later checks.
 *
 * Count ceilings are NOT hard lifetime, CPU-time, cancellation or cleanup
 * guarantees. No SDK, wallet/key generation, signer, RPC, I/O, native producer
 * owner, timer, worker or host is added. Native loader/Promise/crypto/dependency
 * behavior remains a premise. Recreating this volatile capability does not
 * renew consumed payment authority or allow replacement/re-signing. This does
 * not establish current runtime p, funding/authority, provider READY, inclusion,
 * durability/restart recovery, real PREPARE or live-pilot acceptance.
 */
export function createBoundedNonceDynamicPlasmaMaterialExchange(options) {
  let configured;
  try {
    if (arguments.length !== 1 || !invariant()) fail('configuration_rejected');
    const top = record(options, CONFIG), limits = record(top.limits, LIMITS);
    if (typeof top.publicKey !== 'string' || top.publicKey.length !== 44
        || !test(PUBLIC_KEY, top.publicKey)
        || typeof top.startNonce !== 'string' || top.startNonce.length !== 16
        || !test(NONCE, top.startNonce)
        || !budget(limits.maxAttempts) || limits.maxAttempts > 4096
        || !budget(limits.maxDifficulty)) fail('configuration_rejected');
    const key = apply(bufferFrom, Buffer, [top.publicKey, 'base64']);
    if (key.length !== 32 || apply(bufferToString, key, ['base64']) !== top.publicKey)
      fail('configuration_rejected');
    configured = freeze({ publicKey: top.publicKey, startNonce: top.startNonce,
      limits: freeze(limits) });
  } catch { fail('configuration_rejected'); }
  const CONFIGURED = configured;
  configured = null; options = null;
  let active = false, used = false;

  async function run(count, request) {
    if (active) fail('busy');
    if (used) fail('used');
    if (count !== 1) fail('input_rejected');
    active = true; used = true;
    try {
      if (!invariant()) fail('operation_rejected');
      const block = snapshotRequest(request, CONFIGURED.limits.maxDifficulty);
      CHECK_PRE_WORK_KEY({ ...block, publicKey: CONFIGURED.publicKey });
      // Fix/shield the public Promise before doing candidate work. All input
      // DATA above is detached; never reread caller records after this yield.
      await undefined;
      if (!invariant()) fail('operation_rejected');
      const found = SEARCH({ nonceSearchVersion: 1, phase: 'UNSIGNED', accountBlock: block,
        startNonce: CONFIGURED.startNonce, limits: CONFIGURED.limits });
      if (!invariant()) fail('operation_rejected');
      if (found.status === 'WORK_NOT_REQUIRED') {
        if (block.difficulty !== 0 || found.attempts !== 0 || found.nonce !== ZERO_NONCE
            || found.nextNonce !== null || found.verification !== null) fail('operation_rejected');
      } else if (found.status === 'FOUND') {
        if (block.difficulty === 0 || !isSafeInteger(found.attempts) || found.attempts < 1
            || found.attempts > CONFIGURED.limits.maxAttempts || found.nextNonce !== null
            || found.verification.validation !== 'MATCHES_DECLARED_DIFFICULTY') fail('operation_rejected');
      } else fail('operation_rejected');
      if (typeof found.nonce !== 'string' || found.nonce.length !== 16 || !test(NONCE, found.nonce))
        fail('operation_rejected');
      return freeze({ materialVersion: 1, publicKey: CONFIGURED.publicKey, nonce: found.nonce });
    } catch { fail('operation_rejected'); }
    finally { active = false; }
  }
  return freeze(function materialExchange(request) {
    return shield(run(arguments.length, request));
  });
}

function snapshotRequest(value, maximum) {
  const top = record(value, REQUEST), work = record(top.workRequest, WORK);
  if (top.materialRequestVersion !== 1 || top.phase !== 'UNSIGNED'
      || work.unsignedWorkRequestVersion !== 1 || work.scope !== 'DECLARED_USER_SEND_WORK_REQUEST'
      || work.stage !== 'BEFORE_NONCE_GENERATION' || work.preparation !== 'NOT_PERFORMED'
      || work.hashAndNonceValidation !== 'NOT_PERFORMED' || work.keyAddressBinding !== 'NOT_PERFORMED'
      || work.chainAuthentication !== 'NOT_ESTABLISHED' || work.authority !== 'NONE'
      || work.afterSigningAction !== 'NONE') fail('input_rejected');
  const fields = SNAPSHOT_FIELDS(work.accountBlock), block = fields.accountBlock;
  if (block.hash !== ZERO_HASH || block.nonce !== ZERO_NONCE || block.publicKey !== ''
      || block.signature !== '' || block.difficulty > maximum
      || work.subjectDigest !== fields.subjectDigest || work.fieldDigest !== fields.fieldDigest
      || typeof work.intentDigest !== 'string' || work.intentDigest.length !== 64
      || !test(DIGEST, work.intentDigest)) fail('input_rejected');
  const intent = apply(bufferFrom, Buffer, [work.intentDigest, 'hex']);
  if (apply(bufferToString, intent, ['base64']) !== block.data) fail('input_rejected');
  const selection = record(work.selection, SELECTION);
  if (!same(selection.fusedPlasma, block.fusedPlasma) || !same(selection.difficulty, block.difficulty))
    fail('input_rejected');
  const derived = WORK_INPUT(block), keys = ownKeys(derived), supplied = record(work.workInput, keys);
  for (const key of keys) if (!same(supplied[key], derived[key])) fail('input_rejected');
  return block;
}
function budget(value) { return isSafeInteger(value) && value >= 0 && !same(value, -0); }
function record(value, fields) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || prototype(value) !== objectPrototype || ownKeys(value).length !== fields.length)
    fail('input_rejected');
  const result = create(objectPrototype);
  for (const key of fields) {
    const d = descriptor(value, key);
    if (d === undefined || d.enumerable !== true || !hasOwn(d, 'value')) fail('input_rejected');
    put(result, key, d.value);
  }
  return result;
}
function shield(promise) { put(promise, 'constructor', NativePromise, false); return promise; }
function invariant() {
  return initialObjectThen === undefined && descriptor(objectPrototype, 'then') === undefined
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
function fail(kind) {
  const code = 'zenon_bounded_material_dp_exchange_' + kind;
  const error = kind === 'busy' ? new BusyError(code) : new ErrorType(code);
  put(error, 'code', code);
  put(error, 'stack', (kind === 'busy' ? 'Error: ' : 'TypeError: ') + code, false);
  throw freeze(error);
}
