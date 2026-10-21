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
const isPromise = utilTypes.isPromise;
const test = Function.call.bind(RegExp.prototype.test);
const objectPrototype = Object.prototype;
const arrayPrototype = Array.prototype;
const NativePromise = Promise;
const promisePrototype = NativePromise.prototype;
const nativeThen = promisePrototype.then;
const species = Symbol.species;
const constructorDescriptor = descriptor(promisePrototype, 'constructor');
const speciesDescriptor = descriptor(NativePromise, species);
const initialObjectThen = descriptor(objectPrototype, 'then');
const bufferFrom = Buffer.from;
const bufferToString = Buffer.prototype.toString;
const byteLength = Buffer.byteLength;
const ErrorType = TypeError;
const BusyError = Error;
const CONFIG = freeze(['readOptions', 'materialExchange']);
const READ_OPTIONS = freeze(['transports', 'accountExchange']);
const TRANSPORT = freeze(['callRead']);
const CONTEXT = freeze(['plannerContextVersion', 'readInput']);
const READ_INPUT = freeze([
  'observedUserSendReadVersion', 'phase', 'paymentRequired', 'accepted',
  'payerAddress', 'compiledSporkIds', 'policy', 'runtimeContextDigest', 'accountInfoResultJson',
]);
const MATERIAL = freeze(['materialVersion', 'publicKey', 'nonce']);
const PUBLIC_KEY = /^[A-Za-z0-9+/]{43}=$/;
const NONCE = /^[0-9a-f]{16}$/;

/**
 * Opt-in deferred SUPPLIED-material planner, not a work/key producer or SDK.
 * Options: {readOptions:<existing account/two-DP capabilities>, materialExchange}.
 * Context: {plannerContextVersion:2, readInput:<existing explicit v2 DATA>}.
 *
 * Snapshot the entire selected context before any callback. Retain one actual
 * existing attempt: quote -> work request -> ONE materialExchange handoff ->
 * assembly -> final validation of the SAME original unsigned AccountBlock.
 * materialExchange receives one frozen {materialRequestVersion:1,
 * phase:'UNSIGNED', workRequest:<existing detached original work contract>}.
 * It must return a supported native Promise of the existing v1 material DATA.
 * No material/plan/block/quote replacement is accepted through the context.
 *
 * This closes orchestration after quote, not actual work production. The
 * separate supplied-material-v1 SPI, base planner stub and active SDK path are
 * unchanged. No nonce search, key production, signature, actual PREPARE,
 * payment/publication, owner/host, RPC method, retry or cancellation is added.
 * The material capability is trusted and operational, NOT a sandbox or grant
 * to use a real producer/signer. Actual adoption requires separate qualified,
 * authorized owners, resource budgets, current authority and runtime gates.
 *
 * While material is pending no additional read cycle is issued here. Existing
 * assembly/final reads then recheck the original account/quote/price horizon,
 * never refresh an expired quote or request replacement material. Supplied
 * balance and coherent read projections are not authenticated funds, freshness,
 * atomicity, real runtime p, provider READY or inclusion evidence.
 *
 * One admitted call, including failure. Busy/used precede input inspection;
 * wrong arity alone does not consume admission. The capability is called at
 * most once. Public methods are only prepareUnsigned; no close/reset/resume.
 * This volatile local sequence is NOT durable custody, consumed authority or
 * signer-state proof. Recreating it grants no replacement/re-signing right.
 * Preserve original signed payment/request bytes/hash/context elsewhere.
 *
 * Observe only supported native Promise mechanics, never a foreign .then.
 * Snapshot fulfilled material inside the native observer before an await can
 * assimilate it. Unsafe/rejected/throwing capabilities fail without inspecting
 * raw reasons. Their owner must prehandle unsafe returned rejections and retain
 * endpoint identity, deadlines and terminal cleanup. No hard lifetime or native
 * cleanup guarantee; indirect dependencies on this run may still deadlock.
 * Captured native intrinsics, loader/Promise/OS behavior remain premises.
 */
export function createDeferredMaterialDynamicPlasmaTransactionPlanner(options) {
  let steps, exchange;
  try {
    if (arguments.length !== 1 || !invariant()) fail('configuration_rejected');
    const top = record(options, CONFIG);
    const reads = record(top.readOptions, READ_OPTIONS);
    exchange = top.materialExchange;
    if (typeof exchange !== 'function' || isProxy(exchange)
        || exchange === reads.accountExchange) fail('configuration_rejected');
    const transports = twoTransports(reads.transports);
    for (const transport of transports) {
      if (exchange === record(transport, TRANSPORT).callRead) fail('configuration_rejected');
    }
    const attempt = CREATE_ATTEMPT(reads);
    steps = freeze({
      quote: attempt.quote, work: attempt.createWorkRequest,
      assemble: attempt.assemble, validate: attempt.validateUnsigned,
    });
  } catch { fail('configuration_rejected'); }
  const EXCHANGE = exchange;
  let active = false, used = false, originalRun = null;
  exchange = null; options = null;

  async function run(count, context) {
    if (active) fail('busy');
    if (used) fail('used');
    if (count !== 1) fail('input_rejected');
    active = true; used = true;
    try {
      if (!invariant()) fail('operation_rejected');
      const top = record(context, CONTEXT);
      if (top.plannerContextVersion !== 2) fail('input_rejected');
      const input = snapshotInput(top.readInput);
      // Fix/shield our public run identity before any borrowed callback can
      // reenter or return that same receipt as its own material operation.
      await undefined;
      if (!invariant()) fail('operation_rejected');
      await apply(steps.quote, undefined, [input]);
      const work = await apply(steps.work, undefined, [input]);
      if (!invariant()) fail('operation_rejected');
      const request = freeze({
        materialRequestVersion: 1, phase: 'UNSIGNED', workRequest: work,
      });
      const pending = apply(EXCHANGE, undefined, [request]);
      if (!invariant() || pending === originalRun || !supportedPromise(pending)) fail('operation_rejected');
      const bridge = apply(nativeThen, pending, [captureFulfilled, () => receipt(false, null)]);
      const captured = await shield(bridge);
      if (!invariant() || !captured.accepted) fail('operation_rejected');
      const assembly = await apply(steps.assemble, undefined, [input, captured.material]);
      await apply(steps.validate, undefined, [input]);
      if (!invariant()) fail('operation_rejected');
      return assembly.accountBlock;
    } catch { fail('operation_rejected'); }
    finally { active = false; }
  }

  return freeze({
    prepareUnsigned: freeze(function prepareUnsigned(context) {
      const pending = shield(run(arguments.length, context));
      if (originalRun === null && active) originalRun = pending;
      return pending;
    }),
  });
}

function captureFulfilled(value) {
  try {
    if (!invariant()) return receipt(false, null);
    const material = record(value, MATERIAL);
    if (material.materialVersion !== 1
        || typeof material.publicKey !== 'string' || material.publicKey.length !== 44
        || !test(PUBLIC_KEY, material.publicKey)
        || typeof material.nonce !== 'string' || material.nonce.length !== 16
        || !test(NONCE, material.nonce)) return receipt(false, null);
    const key = apply(bufferFrom, Buffer, [material.publicKey, 'base64']);
    if (key.length !== 32 || apply(bufferToString, key, ['base64']) !== material.publicKey)
      return receipt(false, null);
    return receipt(true, freeze(material));
  } catch { return receipt(false, null); }
}
function receipt(accepted, material) {
  const result = create(null);
  put(result, 'accepted', accepted); put(result, 'material', material);
  return freeze(result);
}
function supportedPromise(value) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || !isPromise(value) || prototype(value) !== promisePrototype) return false;
  const c = descriptor(value, 'constructor');
  return c === undefined || (hasOwn(c, 'value') && c.value === NativePromise);
}
function twoTransports(value) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || !isArray(value) || prototype(value) !== arrayPrototype) fail('configuration_rejected');
  const keys = ownKeys(value), length = descriptor(value, 'length');
  if (length === undefined || !hasOwn(length, 'value') || length.value !== 2
      || keys.length !== 3 || keys[0] !== '0' || keys[1] !== '1' || keys[2] !== 'length')
    fail('configuration_rejected');
  const result = [];
  for (let index = 0; index < 2; index += 1) {
    const d = descriptor(value, String(index));
    if (d === undefined || d.enumerable !== true || !hasOwn(d, 'value')) fail('configuration_rejected');
    put(result, String(index), d.value);
  }
  return freeze(result);
}
function snapshotInput(value) {
  const top = record(value, READ_INPUT), text = top.accountInfoResultJson;
  if (top.observedUserSendReadVersion !== 2 || top.phase !== 'UNSIGNED'
      || typeof text !== 'string' || text.length > 65536
      || apply(byteLength, Buffer, [text, 'utf8']) > 65536) fail('input_rejected');
  const budget = { nodes: 32768, characters: 2097152 - text.length };
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

// Reuse the finite descriptor-DATA grammar at the existing planner/read seams;
// this is not a protocol wire parser or caller-object freezing operation.
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
  const code = 'zenon_deferred_material_dp_planner_' + kind;
  const error = kind === 'busy' ? new BusyError(code) : new ErrorType(code);
  put(error, 'code', code);
  put(error, 'stack', (kind === 'busy' ? 'Error: ' : 'TypeError: ') + code, false);
  throw freeze(error);
}
