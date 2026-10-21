import { types as utilTypes } from 'node:util';
import { createObservedBalanceDynamicPlasmaUserSendReadAdapter } from './dynamic-plasma-observed-balance-user-send-read-adapter.js';

const CREATE_READS = createObservedBalanceDynamicPlasmaUserSendReadAdapter;
const freeze = Object.freeze;
const create = Object.create;
const define = Object.defineProperty;
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const ownKeys = Reflect.ownKeys;
const apply = Reflect.apply;
const hasOwn = Object.hasOwn;
const isProxy = utilTypes.isProxy;
const objectPrototype = Object.prototype;
const NativePromise = Promise;
const promisePrototype = NativePromise.prototype;
const species = Symbol.species;
const constructorDescriptor = descriptor(promisePrototype, 'constructor');
const speciesDescriptor = descriptor(NativePromise, species);
const initialObjectThen = descriptor(objectPrototype, 'then');
const ErrorType = TypeError;
const BusyError = Error;

/**
 * One default-off volatile UNSIGNED attempt over the existing explicit v3
 * balance/read-stage adapter. Capture that factory ONCE. Retain its ORIGINAL
 * subject/quote/ack in this closure and, after assembly, the SAME unsigned
 * block. Later methods accept no replacement plan, quote or block. Sequence:
 * quote(inputv3) -> createWorkRequest(inputv3) -> assemble(inputv3,material) ->
 * validateUnsigned(inputv3). Further validation of the retained block is
 * allowed only within the same underlying ten-cycle/one-wire budget.
 *
 * Every stage obtains its own selected-payer AccountInfo through that existing
 * closed exchange between frontier brackets. v1/v2 and supplied balance text
 * cannot downgrade this owner. Do not recreate a wire or silently refresh an
 * expired original quote. All stage outputs remain detached frozen DATA.
 * The lower reader snapshots selected DATA before its first borrowed callback.
 *
 * Busy/held precede input inspection. Any admitted operation failure holds the
 * attempt permanently, even when the underlying rejection occurred before a
 * read. Wrong arity/order rejects without changing state or inspecting input.
 * No reset, re-quote, reassembly, fallback, close/cancel or lifetime guarantee
 * exists. Native owners retain endpoint identity, authentication, deadline,
 * unsafe-Promise prehandling and terminal-cleanup obligations. Captured native
 * intrinsics, loader/Promise and unchanged dependency behavior are premises.
 *
 * This is original-quote sequencing, NOT durable custody, consumed payment
 * authority, actual SDK/current-state preparation, a work/key producer or an
 * unforgeable permission to sign. UNSIGNED, p, balance and coherent replies are
 * declared DATA, not authenticated funds, atomicity, freshness, chain ancestry
 * or provider READY. A new instance grants no replacement/re-signing right.
 * External signing cannot be detected here: stop this API before signing and
 * preserve the original signed bytes/hash/payload/requirements/context under
 * their independent recovery owner. VALIDATED possible same-block resend and
 * UNKNOWN/ACKNOWLEDGED boundaries remain separate.
 *
 * The previous v2 attempt, supplied/deferred planners, active buyer, signer and
 * native HTTPS/RPC owners are unchanged. No SDK import, actual RPC, nonce
 * search, signing, publication, payment, real PREPARE, persistence or restart
 * recovery is introduced by this module.
 */
export function createObservedBalanceDynamicPlasmaUserSendAttempt(options) {
  let methods;
  try {
    if (arguments.length !== 1 || !invariant()) fail('configuration_rejected');
    const reads = CREATE_READS(options);
    methods = freeze({
      quote: reads.quote, work: reads.createWorkRequest,
      assemble: reads.assemble, validate: reads.validateUnsigned,
    });
  } catch { fail('configuration_rejected'); }
  let stage = 'NEW', active = false, originalPlan = null, originalAssembly = null;

  function dispatch(kind, count, input, material) {
    return shield(run(kind, count, input, material));
  }
  async function run(kind, count, input, material) {
    if (active) fail('busy');
    if (stage === 'HELD') fail('held');
    const expectedCount = kind === 'assemble' ? 2 : 1;
    const allowed = kind === 'quote' ? stage === 'NEW'
      : kind === 'work' ? stage === 'QUOTED'
      : kind === 'assemble' ? stage === 'WORK_REQUESTED'
      : stage === 'ASSEMBLED' || stage === 'VALIDATED';
    if (count !== expectedCount || !allowed) fail('stage_rejected');
    active = true;
    try {
      if (!invariant()) fail('operation_rejected');
      requireV3(input);
      const args = kind === 'quote' ? [input] : kind === 'work' ? [input, originalPlan]
        : kind === 'assemble' ? [input, originalPlan, material]
        : [input, originalPlan, originalAssembly.accountBlock];
      const result = await apply(methods[kind], undefined, args);
      if (!invariant()) fail('operation_rejected');
      if (kind === 'quote') { originalPlan = result; stage = 'QUOTED'; }
      else if (kind === 'work') stage = 'WORK_REQUESTED';
      else if (kind === 'assemble') { originalAssembly = result; stage = 'ASSEMBLED'; }
      else stage = 'VALIDATED';
      return result;
    } catch {
      stage = 'HELD';
      fail('operation_rejected');
    } finally { active = false; }
  }
  return freeze({
    quote: freeze(function quote(input) { return dispatch('quote', arguments.length, input); }),
    createWorkRequest: freeze(function createWorkRequest(input) {
      return dispatch('work', arguments.length, input);
    }),
    assemble: freeze(function assemble(input, material) {
      return dispatch('assemble', arguments.length, input, material);
    }),
    validateUnsigned: freeze(function validateUnsigned(input) {
      return dispatch('validate', arguments.length, input);
    }),
  });
}
function requireV3(value) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || prototype(value) !== objectPrototype) fail('operation_rejected');
  const d = descriptor(value, 'observedUserSendReadVersion');
  if (d === undefined || d.enumerable !== true || !hasOwn(d, 'value') || d.value !== 3)
    fail('operation_rejected');
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
  const code = 'zenon_observed_balance_dp_attempt_' + kind;
  const error = kind === 'busy' ? new BusyError(code) : new ErrorType(code);
  put(error, 'code', code); put(error, 'stack', (kind === 'busy' ? 'Error: ' : 'TypeError: ') + code, false);
  throw freeze(error);
}
