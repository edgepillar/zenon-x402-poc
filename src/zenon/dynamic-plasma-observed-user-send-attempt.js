import { types as utilTypes } from 'node:util';
import { createObservedDynamicPlasmaUserSendReadAdapter } from './dynamic-plasma-observed-user-send-read-adapter.js';

const CREATE_READS = createObservedDynamicPlasmaUserSendReadAdapter;
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
 * One opt-in, volatile UNSIGNED attempt over the existing read/stage adapter.
 * Retain its ORIGINAL subject/quote/ack in this closure, and after assembly
 * retain that SAME unsigned block. Later calls cannot supply a replacement
 * plan/block or re-quote, reassemble, reset or refresh the originals. Sequence:
 * quote(input) -> createWorkRequest(input) -> assemble(input, material) ->
 * validateUnsigned(input), with further validation of that same block allowed.
 * Every admitted operation requires explicit read input v2; v1 remains usable
 * separately in the lower-level adapter but cannot bypass this attempt's
 * balance gate. Returned stage contracts are unchanged, detached frozen DATA.
 *
 * The existing factory is called ONCE; its captured capabilities, account
 * call/ID budget, two-read bracketing, busy/hold and no retry/fallback remain.
 * An admitted operation failure holds this attempt permanently, even if the
 * lower-level refusal happened before a read. Wrong arity/order refuses before
 * inspecting input and does not change state. Busy/held precede hostile input.
 * No native close/cancel, lifetime, endpoint or terminal-cleanup promise is
 * added: borrowed accountExchange/callRead owners retain those obligations.
 *
 * This is local DATA sequencing, NOT payment custody, consumed authority,
 * unforgeable signing permission or a durable/recoverable owner. A new instance
 * grants no right to replace/re-sign any payment. UNSIGNED and supplied balance
 * are declarations, not signer-state, account/funds authentication or freshness.
 * External signing cannot be detected here; callers must stop these methods
 * before signing and preserve original signed bytes/hash/context elsewhere.
 *
 * No SDK/current-state preparation, real PREPARE, work/key production, signer,
 * publication, payment, new RPC method/native owner, retry, restart recovery or
 * active buyer cutover. Supplied public key/nonce DATA is checked by the same
 * existing assembly consumer; this module never produces or changes that DATA.
 */
export function createObservedDynamicPlasmaUserSendAttempt(options) {
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
      requireV2(input);
      // Each captured existing method snapshots input/material synchronously
      // before its first await. No await, callback or input access intervenes.
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
      // Never forget/replace originals on failure, expose raw errors or reset.
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

function requireV2(value) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || prototype(value) !== objectPrototype) fail('operation_rejected');
  const d = descriptor(value, 'observedUserSendReadVersion');
  if (d === undefined || d.enumerable !== true || !hasOwn(d, 'value') || d.value !== 2) fail('operation_rejected');
}
function shield(promise) {
  put(promise, 'constructor', NativePromise, false);
  return promise;
}
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
  const code = 'zenon_observed_dp_attempt_' + kind;
  const error = kind === 'busy' ? new BusyError(code) : new ErrorType(code);
  put(error, 'code', code);
  put(error, 'stack', (kind === 'busy' ? 'Error: ' : 'TypeError: ') + code, false);
  throw freeze(error);
}
