import { types as utilTypes } from 'node:util';
import { createRequestBoundDynamicPlasmaObservationCollector } from './dynamic-plasma-observation-collector.js';
import { createZenonAccountFrontierReadTransport } from './dynamic-plasma-account-frontier-read-transport.js';
import { decodeZenonAccountFrontierReadResult } from './dynamic-plasma-account-frontier-read.js';
import { createZenonUserSendObservationInput, snapshotZenonUserSendPolicyBinding } from './transaction-planner.js';
import { ObservedDynamicPlasmaUserSendAdapter } from './dynamic-plasma-observed-user-send-adapter.js';

const COLLECTOR = createRequestBoundDynamicPlasmaObservationCollector;
const ACCOUNT_WIRE = createZenonAccountFrontierReadTransport;
const FRONTIER = decodeZenonAccountFrontierReadResult;
const REQUEST = createZenonUserSendObservationInput;
const BINDING = snapshotZenonUserSendPolicyBinding;
const STAGES = Object.freeze({
  quote: ObservedDynamicPlasmaUserSendAdapter.prototype.quote,
  work: ObservedDynamicPlasmaUserSendAdapter.prototype.createWorkRequest,
  assemble: ObservedDynamicPlasmaUserSendAdapter.prototype.assemble,
  validate: ObservedDynamicPlasmaUserSendAdapter.prototype.validateUnsigned,
});
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
const objectPrototype = Object.prototype;
const arrayPrototype = Array.prototype;
const NativePromise = Promise;
const promisePrototype = NativePromise.prototype;
const nativeThen = promisePrototype.then;
const species = Symbol.species;
const constructorDescriptor = descriptor(promisePrototype, 'constructor');
const speciesDescriptor = descriptor(NativePromise, species);
const initialObjectThen = descriptor(objectPrototype, 'then');
const ErrorType = TypeError;
const BusyError = Error;
const test = Function.call.bind(RegExp.prototype.test);
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const OPTIONS = freeze(['transports', 'accountExchange']);
const INPUT = freeze([
  'observedUserSendReadVersion', 'phase', 'paymentRequired', 'accepted',
  'payerAddress', 'compiledSporkIds', 'policy', 'runtimeContextDigest',
]);
const PLAN = freeze(['observedUserSendPlanVersion', 'subject', 'quote']);

/**
 * Opt-in read/stage composition, not a native connection or payment owner.
 * Borrow the existing two frozen DP callRead capabilities; construct only the
 * existing closed account wire over the caller's exchange. Capture all DATA
 * and capabilities before callbacks. One explicit operation performs:
 * account-before -> existing request-bound dual DP reads -> account-after.
 * Require the same projected payer/chain/hash/height around those reads, then
 * invoke the captured existing observed DATA adapter stage. Later stages keep
 * the ORIGINAL subject/quote/ack; a changed original account refuses before DP.
 *
 * Matching projections are NOT atomicity, ancestry, authentication, current
 * account/funds or full previous-block evidence; ABA/unobserved changes remain
 * possible. DP_ACTIVE is supplied-read consistency, not runtime activation.
 * No native endpoint/host/HTTPS owner, SDK/preparer, work/key producer, signer,
 * publication, payment, durable custody, restart or provider READY is created.
 * Phase/policy/runtime/plan remain declared DATA, never authority.
 *
 * Options are caller-owned operational capabilities, not a read-only sandbox.
 * Their owner retains endpoint identity, deadlines/cancellation, terminal
 * cleanup and unsafe-Promise rejection prehandling obligations. No timer or
 * close/cancel guarantee is added. Existing per-wire call/ID budgets remain:
 * no transport recreation, counter reset, fallback or retry inside operations.
 * The captured account wire admits32 handoffs: at most16 complete two-read
 * cycles, fewer when failures consume handoffs. Exhaustion also holds here.
 *
 * One operation may be active. Once any issued read/stage fails, this instance
 * holds all later calls without further reads. There is no reset. Pre-read
 * input refusal does not consume a read cycle. This local hold is not durable
 * or consumed payment authority; a new instance grants no replacement right.
 * Original payment/signed bytes/hash/context and uncertainty remain external.
 */
export function createObservedDynamicPlasmaUserSendReadAdapter(options) {
  let collect, accountRead;
  try {
    if (arguments.length !== 1 || !invariant()) fail('configuration_rejected');
    const top = record(options, OPTIONS);
    // Both existing constructors validate and capture their own closed inputs.
    collect = COLLECTOR({ transports: top.transports }).collect;
    accountRead = ACCOUNT_WIRE({ exchange: top.accountExchange }).callRead;
  } catch { fail('configuration_rejected'); }
  let active = false, held = false;

  function dispatch(kind, count, input, originalPlan, extra) {
    // This is our own async operation, never an injected Promise/thenable.
    // Protect await from a capability-mutated inherited constructor.
    return shield(run(kind, count, input, originalPlan, extra));
  }

  async function run(kind, count, input, originalPlan, extra) {
    if (active) fail('busy'); // Before hostile/reentrant input inspection.
    if (held) fail('held');
    if (!invariant()) fail('configuration_rejected');
    active = true;
    let readIssued = false;
    try {
      const expectedCount = kind === 'quote' ? 1 : kind === 'work' ? 2 : 3;
      if (count !== expectedCount) fail('input_rejected');
      const budget = { nodes: 32768, characters: 2097152 };
      const stable = snapshotData(record(input, INPUT), 0, budget);
      if (stable.observedUserSendReadVersion !== 1 || stable.phase !== 'UNSIGNED'
          || typeof stable.runtimeContextDigest !== 'string'
          || stable.runtimeContextDigest.length !== 71 || !test(DIGEST, stable.runtimeContextDigest)) fail('input_rejected');
      const plan = kind === 'quote' ? null : snapshotData(originalPlan, 0, budget);
      const detail = kind === 'quote' || kind === 'work' ? null : snapshotData(extra, 0, budget);
      const request = REQUEST({
        observationIntentVersion: 1, phase: stable.phase, paymentRequired: stable.paymentRequired,
        accepted: stable.accepted, payerAddress: stable.payerAddress, compiledSporkIds: stable.compiledSporkIds,
      });
      let originalSubject = null;
      if (kind !== 'quote') {
        const p = record(plan, PLAN);
        if (p.observedUserSendPlanVersion !== 1) fail('input_rejected');
        originalSubject = BINDING({
          bindingVersion: 1, subject: p.subject, paymentRequired: stable.paymentRequired,
          accepted: stable.accepted, payerAddress: stable.payerAddress, compiledSporkIds: stable.compiledSporkIds,
        }).subject;
      }
      const readRequest = freeze({
        method: 'ledger.getFrontierAccountBlock', params: freeze([stable.payerAddress]),
      });
      readIssued = true;
      const beforeText = await readAccount(readRequest);
      if (!invariant()) fail('configuration_rejected');
      const before = decode(beforeText, stable, request);
      if (originalSubject !== null && !sameOriginal(before, originalSubject)) fail('input_rejected');
      const collected = await shield(apply(collect, undefined, [request]));
      if (!invariant() || collected.normalization.classification !== 'DP_ACTIVE'
          || collected.normalization.requestContextBinding !== 'MATCHES_DECLARED_EXPECTED_REQUEST_CONTEXT') fail('input_rejected');
      const afterText = await readAccount(readRequest);
      if (!invariant()) fail('configuration_rejected');
      const after = decode(afterText, stable, request);
      if (!sameFrontier(before, after)) fail('input_rejected');
      const view = {
        observedUserSendViewVersion: 1, phase: stable.phase, paymentRequired: stable.paymentRequired,
        accepted: stable.accepted, payerAddress: stable.payerAddress, compiledSporkIds: stable.compiledSporkIds,
        accountFrontierResultJson: afterText, observation: collected.observation,
        policy: stable.policy, runtimeContextDigest: stable.runtimeContextDigest,
      };
      const args = kind === 'quote' ? [view] : kind === 'work' ? [view, plan] : [view, plan, detail];
      const result = await shield(apply(STAGES[kind], undefined, args));
      // No await or caller hook between this gate and ordinary DATA return.
      if (!invariant()) fail('configuration_rejected');
      return result;
    } catch {
      if (readIssued) held = true;
      fail(readIssued ? 'read_or_stage_rejected' : 'input_rejected');
    } finally { active = false; }
  }

  function readAccount(request) {
    if (!invariant()) fail('configuration_rejected');
    const pending = apply(accountRead, undefined, [request]);
    // The captured closed core owns/prehandles this Promise, including its
    // frozen cached failures. Never decorate it or await a foreign thenable.
    // Drain via the captured native then only while its mechanics are safe.
    if (!invariant() || typeof pending !== 'object' || pending === null || isProxy(pending)
        || !isPromise(pending) || prototype(pending) !== promisePrototype) fail('configuration_rejected');
    const c = descriptor(pending, 'constructor');
    if (c !== undefined && (!hasOwn(c, 'value') || c.value !== NativePromise)) fail('configuration_rejected');
    const bridge = apply(nativeThen, pending, [fulfilled, rejected]);
    return shield(unpack(bridge));
  }

  async function unpack(bridge) {
    const value = await shield(bridge);
    if (!invariant() || !value.accepted) fail('input_rejected');
    return value.text; // Primitive, never caller-object then assimilation.
  }

  return freeze({
    quote: freeze(function quote(input) { return dispatch('quote', arguments.length, input); }),
    createWorkRequest: freeze(function createWorkRequest(input, plan) {
      return dispatch('work', arguments.length, input, plan);
    }),
    assemble: freeze(function assemble(input, plan, material) {
      return dispatch('assemble', arguments.length, input, plan, material);
    }),
    validateUnsigned: freeze(function validateUnsigned(input, plan, block) {
      return dispatch('validate', arguments.length, input, plan, block);
    }),
  });
}

function decode(text, input, request) {
  return FRONTIER({
    frontierReadVersion: 1, phase: input.phase,
    expectedChainIdentifier: request.expectedChainProfile.chainIdentifier,
    payerAddress: input.payerAddress, resultJson: text,
  });
}
function sameFrontier(a, b) {
  return a.address === b.address && a.chainIdentifier === b.chainIdentifier && a.hash === b.hash && a.height === b.height;
}
function sameOriginal(frontier, subject) {
  return frontier.address === subject.address && frontier.chainIdentifier === subject.chainIdentifier
    && frontier.hash === subject.previousHash && frontier.height + 1 === subject.height;
}
function fulfilled(value) {
  const output = create(null);
  put(output, 'accepted', typeof value === 'string');
  put(output, 'text', typeof value === 'string' ? value : null);
  return freeze(output);
}
function rejected() { return fulfilled(null); }
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
function record(value, fields) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || prototype(value) !== objectPrototype || ownKeys(value).length !== fields.length) fail('input_rejected');
  const result = create(objectPrototype);
  for (const field of fields) {
    const d = descriptor(value, field);
    if (d === undefined || d.enumerable !== true || !hasOwn(d, 'value')) fail('input_rejected');
    put(result, field, d.value);
  }
  return result;
}

// Same finite descriptor-only DATA grammar used at the existing assembly
// seam, extended to the initial selected input + original plan + extra DATA.
// No input getters/proxies/toJSON/iterators/coercion are invoked or frozen.
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
function put(value, key, content, enumerable = true) {
  const d = create(null);
  d.value = content; d.enumerable = enumerable; d.writable = false; d.configurable = false;
  define(value, key, d);
}
function fail(kind) {
  const code = 'zenon_observed_dp_read_adapter_' + kind;
  const error = kind === 'busy' ? new BusyError(code) : new ErrorType(code);
  put(error, 'code', code); put(error, 'stack', (kind === 'busy' ? 'Error: ' : 'TypeError: ') + code, false);
  throw freeze(error);
}
