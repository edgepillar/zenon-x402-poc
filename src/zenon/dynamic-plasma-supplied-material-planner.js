import { types as utilTypes } from 'node:util';
import { Buffer } from 'node:buffer';
import { createObservedDynamicPlasmaUserSendAttempt } from './dynamic-plasma-observed-user-send-attempt.js';

const CREATE_ATTEMPT = createObservedDynamicPlasmaUserSendAttempt;
const freeze = Object.freeze;
const create = Object.create;
const define = Object.defineProperty;
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const ownKeys = Reflect.ownKeys;
const apply = Reflect.apply;
const hasOwn = Object.hasOwn;
const isArray = Array.isArray;
const isSafeInteger = Number.isSafeInteger;
const same = Object.is;
const isProxy = utilTypes.isProxy;
const test = Function.call.bind(RegExp.prototype.test);
const objectPrototype = Object.prototype;
const arrayPrototype = Array.prototype;
const NativePromise = Promise;
const promisePrototype = NativePromise.prototype;
const species = Symbol.species;
const constructorDescriptor = descriptor(promisePrototype, 'constructor');
const speciesDescriptor = descriptor(NativePromise, species);
const initialObjectThen = descriptor(objectPrototype, 'then');
const ErrorType = TypeError;
const BusyError = Error;
const CONTEXT = freeze(['plannerContextVersion', 'readInput', 'material']);
const READ_INPUT = freeze([
  'observedUserSendReadVersion', 'phase', 'paymentRequired', 'accepted',
  'payerAddress', 'compiledSporkIds', 'policy', 'runtimeContextDigest', 'accountInfoResultJson',
]);
const MATERIAL = freeze(['materialVersion', 'publicKey', 'nonce']);
const PUBLIC_KEY = /^[A-Za-z0-9+/]{43}=$/;
const NONCE = /^[0-9a-f]{16}$/;

/**
 * Opt-in concrete prepareUnsigned(context) SPI using SUPPLIED public-key/nonce
 * DATA, not a work/key producer or SDK. Context is exactly:
 * {plannerContextVersion:1, readInput:<existing v2 DATA>, material:<existing v1>}.
 * The existing selected intent/profile/payer/policy lives in readInput. Capture
 * ALL input/material before any borrowed read callback, then run the SAME one
 * original attempt through quote -> work request -> assembly -> final same-block
 * validation. Return only that original frozen unsigned AccountBlock after the
 * final gate passes. No partial block, replacement, refreshed quote, signature
 * or payment payload is returned. Base planner stub and active SDK unchanged.
 *
 * This structural planner implementation is specifically for supplied work
 * material. It does not obtain/search a nonce, produce/possess a key, run SDK
 * preparation, a real PREPARE action, sign or publish. Existing complete price/
 * hash/work/key consumers check the supplied DATA; these are NOT native chain,
 * current funding, payer/provider/policy authority or real-preparer evidence.
 * Supplied material must already match the plan derived from those reads;
 * a mismatch refuses, never searches for or requests replacement material.
 * Coherent caller-supplied reads can be forged, stale, non-atomic or unrelated
 * to the running node. Live adoption still needs its independent owner gates.
 *
 * One admitted planning call per instance. Busy precedes input inspection;
 * after success OR failure this instance is used permanently. Wrong arity does
 * not admit a call. A new instance grants no replacement/re-signing authority.
 * Original payment/signed bytes/hash/context and consumed authority remain the
 * higher owner's responsibility. This volatile closure is NOT durable custody,
 * a restart/recovery owner, global signer-state proof or a signing capability.
 * No public retry/reset/revalidation API is exposed after the unsigned return.
 *
 * Borrow the existing two DP capabilities and accountExchange through one
 * captured attempt. No new RPC method/native owner/host, transport recreation,
 * retry, fallback, native close/cancel or hard lifetime guarantee. Capability
 * owners retain endpoint identity, deadlines, rejection prehandling and terminal
 * cleanup. Native intrinsic/loader/Promise/OS behavior remains a premise.
 */
export function createSuppliedMaterialDynamicPlasmaTransactionPlanner(options) {
  let steps;
  try {
    if (arguments.length !== 1 || !invariant()) fail('configuration_rejected');
    const attempt = CREATE_ATTEMPT(options);
    steps = freeze({
      quote: attempt.quote, work: attempt.createWorkRequest,
      assemble: attempt.assemble, validate: attempt.validateUnsigned,
    });
  } catch { fail('configuration_rejected'); }
  let active = false, used = false;

  async function run(count, context) {
    if (active) fail('busy');
    if (used) fail('used');
    if (count !== 1) fail('input_rejected');
    active = true; used = true;
    try {
      if (!invariant()) fail('operation_rejected');
      const top = record(context, CONTEXT);
      if (top.plannerContextVersion !== 1) fail('input_rejected');
      const budget = { nodes: 32768, characters: 2097152 };
      const material = snapshotMaterial(top.material, budget);
      const input = snapshotInput(top.readInput, budget);
      // No caller DATA is touched after these detached snapshots or an await.
      await apply(steps.quote, undefined, [input]);
      await apply(steps.work, undefined, [input]);
      const assembly = await apply(steps.assemble, undefined, [input, material]);
      await apply(steps.validate, undefined, [input]);
      if (!invariant()) fail('operation_rejected');
      // The captured attempt validated THIS retained block, not a caller DTO.
      return assembly.accountBlock;
    } catch { fail('operation_rejected'); }
    finally { active = false; }
  }

  return freeze({
    prepareUnsigned: freeze(function prepareUnsigned(context) {
      return shield(run(arguments.length, context));
    }),
  });
}

function snapshotMaterial(value, budget) {
  const material = snapshotData(record(value, MATERIAL), 0, budget);
  if (material.materialVersion !== 1
      || typeof material.publicKey !== 'string' || material.publicKey.length !== 44
      || !test(PUBLIC_KEY, material.publicKey)
      || typeof material.nonce !== 'string' || material.nonce.length !== 16
      || !test(NONCE, material.nonce)) fail('input_rejected');
  const key = Buffer.from(material.publicKey, 'base64');
  if (key.length !== 32 || key.toString('base64') !== material.publicKey) fail('input_rejected');
  return material;
}
function snapshotInput(value, budget) {
  const top = record(value, READ_INPUT), text = top.accountInfoResultJson;
  if (top.observedUserSendReadVersion !== 2 || top.phase !== 'UNSIGNED'
      || typeof text !== 'string' || text.length > 65536
      || Buffer.byteLength(text, 'utf8') > 65536) fail('input_rejected');
  budget.characters -= text.length;
  const base = create(objectPrototype);
  for (const key of READ_INPUT) if (key !== 'accountInfoResultJson') put(base, key, top[key]);
  const stable = snapshotData(base, 0, budget), input = create(objectPrototype);
  for (const key of READ_INPUT) put(input, key, key === 'accountInfoResultJson' ? text : stable[key]);
  return freeze(input);
}
function record(value, fields) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || prototype(value) !== objectPrototype || ownKeys(value).length !== fields.length) fail('input_rejected');
  const result = create(objectPrototype);
  for (const key of fields) {
    const d = descriptor(value, key);
    if (d === undefined || d.enumerable !== true || !hasOwn(d, 'value')) fail('input_rejected');
    put(result, key, d.value);
  }
  return result;
}

// Same finite descriptor-DATA copy grammar as the existing assembly/read seams;
// NOT a new protocol wire parser. Raw balance text is separately bounded above.
function snapshotData(value, depth, budget) {
  if (depth > 16 || --budget.nodes < 0) fail('input_rejected');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    budget.characters -= value.length;
    if (value.length > 8192 || budget.characters < 0) fail('input_rejected');
    return value;
  }
  if (typeof value === 'number') {
    if (!isSafeInteger(value) || value < 0 || same(value, -0)) fail('input_rejected');
    return value;
  }
  if (typeof value !== 'object' || isProxy(value)) fail('input_rejected');
  const proto = prototype(value), keys = ownKeys(value);
  if (proto === arrayPrototype) {
    if (!isArray(value)) fail('input_rejected');
    const length = descriptor(value, 'length');
    if (length === undefined || !hasOwn(length, 'value') || length.enumerable !== false
        || !isSafeInteger(length.value) || length.value < 0 || length.value > 1024
        || keys.length !== length.value + 1) fail('input_rejected');
    const result = [];
    for (let index = 0; index < length.value; index += 1) {
      const d = descriptor(value, String(index));
      if (d === undefined || !hasOwn(d, 'value') || d.enumerable !== true) fail('input_rejected');
      put(result, String(index), snapshotData(d.value, depth + 1, budget));
    }
    return freeze(result);
  }
  if (proto !== objectPrototype || isArray(value) || keys.length > 32) fail('input_rejected');
  const result = create(objectPrototype);
  for (const key of keys) {
    if (typeof key !== 'string' || key.length > 128) fail('input_rejected');
    const d = descriptor(value, key);
    if (d === undefined || !hasOwn(d, 'value') || d.enumerable !== true) fail('input_rejected');
    put(result, key, snapshotData(d.value, depth + 1, budget));
  }
  return freeze(result);
}
function shield(promise) { put(promise, 'constructor', NativePromise, false); return promise; }
function invariant() {
  return initialObjectThen === undefined && descriptor(objectPrototype, 'then') === undefined
    && sameDescriptor(descriptor(promisePrototype, 'constructor'), constructorDescriptor)
    && sameDescriptor(descriptor(NativePromise, species), speciesDescriptor);
}
function sameDescriptor(actual, expected) {
  if (actual === undefined || expected === undefined || ownKeys(actual).length !== ownKeys(expected).length) return false;
  for (const key of ownKeys(expected)) if (!hasOwn(actual, key) || actual[key] !== expected[key]) return false;
  return true;
}
function put(value, key, content, enumerable = true) {
  const d = create(null);
  d.value = content; d.enumerable = enumerable; d.writable = false; d.configurable = false;
  define(value, key, d);
}
function fail(kind) {
  const code = 'zenon_supplied_material_dp_planner_' + kind;
  const error = kind === 'busy' ? new BusyError(code) : new ErrorType(code);
  put(error, 'code', code);
  put(error, 'stack', (kind === 'busy' ? 'Error: ' : 'TypeError: ') + code, false);
  throw freeze(error);
}
