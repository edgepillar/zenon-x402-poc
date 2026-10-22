import { types as utilTypes } from 'node:util';
import { Buffer } from 'node:buffer';
import { createRequestBoundDynamicPlasmaObservationCollector } from './dynamic-plasma-observation-collector.js';
import { createZenonAccountStateReadTransport } from './dynamic-plasma-account-state-read-transport.js';
import { decodeZenonAccountFrontierReadResult } from './dynamic-plasma-account-frontier-read.js';
import { createZenonUserSendObservationInput, snapshotZenonUserSendPolicyBinding } from './transaction-planner.js';
import { validateZenonUserSendBalanceRead } from './dynamic-plasma-user-send-balance-read.js';
import { ObservedDynamicPlasmaUserSendAdapter } from './dynamic-plasma-observed-user-send-adapter.js';
import { encodeObservedZenonUnsignedOriginalQuoteCheckpoint, validateObservedZenonUnsignedOriginalQuoteCheckpoint } from './dynamic-plasma-observed-original-checkpoint.js';

const COLLECTOR = createRequestBoundDynamicPlasmaObservationCollector;
const ACCOUNT_WIRE = createZenonAccountStateReadTransport;
const FRONTIER = decodeZenonAccountFrontierReadResult;
const REQUEST = createZenonUserSendObservationInput;
const BINDING = snapshotZenonUserSendPolicyBinding;
const BALANCE = validateZenonUserSendBalanceRead;
const CHECKPOINT = encodeObservedZenonUnsignedOriginalQuoteCheckpoint;
const READ_CHECKPOINT = validateObservedZenonUnsignedOriginalQuoteCheckpoint;
const byteLength = Buffer.byteLength;
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
 * Explicit inputv3 read/stage composition. Unlike unchanged v1/v2 readers,
 * accept NO supplied accountInfoResultJson or balance DTO. Each operation:
 * account-frontier-before -> selected-payer AccountInfo -> existing dual DP
 * observations -> account-frontier-after -> existing captured DATA stage.
 * Reuse the existing balance consumer after the first frontier and before DP;
 * the current original subject is checked BEFORE requesting balance or DP.
 * Compare payer/chain/hash/height across the two account brackets. Later stages
 * retain the supplied ORIGINAL plan/quote/ack; never silently re-quote.
 *
 * One shared32-handoff account wire is constructed once. At most10 admitted
 * three-read cycles are allowed, leaving no partial eleventh cycle. This local
 * cycle bound is not a deadline. Failures after the first handoff permanently
 * hold this instance; no retry, reset, wire recreation or fallback exists.
 * Busy/held/cycle guards precede input inspection. Pre-read input rejection
 * performs no handoff and does not consume a cycle. All input/plan/extra DATA
 * is detached before any callback. Stage/plan outputs remain unchanged.
 *
 * AccountInfo has neither chain ID nor block hash. Matching height plus two
 * frontier projections is NOT atomicity, freshness, ancestry, authentic funds
 * or spendability; ABA/unobserved changes and fabricated replies remain
 * possible. Native go-zenon may omit unknown-token entries: missing never
 * means zero. UNSIGNED, p, policy and runtime context remain declared DATA.
 * Source: go-zenon e58d8e80eabd9fd5630ed62e0707424d96b5303c
 * rpc/api/ledger.go GetAccountInfoByAddress and ledger_types.go AccountInfo.
 *
 * No active buyer, prior reader/attempt/planner, HTTPS owner or allowlist is
 * changed. This is not adoption into the deferred planner or qualification of
 * a native RPC owner. Borrowed exchanges own endpoint identity/authentication,
 * deadlines/cancellation, unsafe-Promise rejection prehandling and terminal
 * cleanup. They are operational capabilities, NOT a sandbox/read-only proof.
 * No new native helper/host, SDK, work/key producer, signing, actual PREPARE,
 * payment, publication, durable custody, restart or provider READY is added.
 * Original signed payment/request bytes/hash/context and consumed authority
 * remain external and unchanged. Native loader/Promise/dependency behavior is
 * a premise, not a lifetime, cancellation or hard resource guarantee.
 */
export function createObservedBalanceDynamicPlasmaUserSendReadAdapter(options) {
  if (arguments.length !== 1) fail('configuration_rejected');
  return createReadAdapter(options, false);
}

/**
 * Explicit opt-in checkpoint stage variant over the SAME v3 read contract.
 * Its quote/work/assembly stages are unchanged. Its final validateUnsigned
 * stage returns the detached ORIGINAL plan/block and canonical checkpoint,
 * only after the existing fresh account/balance/DP/bracket checks. Reuse the
 * captured original-checkpoint encoder's exact same-block validation, not a
 * second read cycle or re-quote. The previous factory remains block/check
 * DATA only. No signing, durable custody, native owner or default is added.
 */
export function createObservedBalanceDynamicPlasmaUserSendCheckpointReadAdapter(options) {
  if (arguments.length !== 1) fail('configuration_rejected');
  return createReadAdapter(options, true);
}

/**
 * Default-off read-only checkpoint reuse over the SAME inputv3, one account
 * wire and ten-cycle budget. Expose ONLY validateUnsignedCheckpoint(input,
 * originalPlan, originalBlock, checkpointJson). All four independent inputs
 * are captured before the first borrowed callback. Originals must remain
 * under separate caller custody: incoming checkpoint fields never select
 * the expectation, the current read context, a new quote or replacement work.
 *
 * One fresh frontier -> balance -> dual DP -> frontier cycle first checks
 * the original account/intent and current declared funds/price horizon. The
 * existing observed checkpoint validator then requires the exact canonical
 * bytes for those independent originals. No packet is returned before the
 * final account bracket, and no partial eleventh cycle can start. A failure
 * after the first handoff holds this instance; no retry/reset or new owner
 * can grant replacement, signing, renewal or payment authority.
 *
 * This does NOT restore persistent custody or detect external signing. Use
 * only BEFORE signing; retain signed originals and consumed authority under
 * their separate owner. AccountInfo still lacks a chain/hash anchor and the
 * bracket is not atomic, fresh/authenticated funds, ABA exclusion, runtime
 * qualification or inclusion evidence. Borrowed exchanges, supported native
 * Promises and unchanged dependencies retain their existing trust/lifetime
 * premises. No material capability, nonce/key/signature, SDK, SQL/storage,
 * actual PREPARE, native RPC owner, live payment or default buyer is added.
 */
export function createObservedBalanceDynamicPlasmaUnsignedCheckpointReader(options) {
  if (arguments.length !== 1) fail('configuration_rejected');
  return createReadAdapter(options, false, true);
}

function createReadAdapter(options, checkpointEnabled, checkpointReadOnly = false) {
  let collect, accountRead;
  try {
    if (!invariant()) fail('configuration_rejected');
    const top = record(options, OPTIONS);
    collect = COLLECTOR({ transports: top.transports }).collect;
    accountRead = ACCOUNT_WIRE({ exchange: top.accountExchange }).callRead;
  } catch { fail('configuration_rejected'); }
  let active = false, held = false, cycles = 0;

  function dispatch(kind, count, input, originalPlan, extra, checkpointJson) {
    return shield(run(kind, count, input, originalPlan, extra, checkpointJson));
  }
  async function run(kind, count, input, originalPlan, extra, checkpointJson) {
    if (active) fail('busy');
    if (held) fail('held');
    if (cycles >= 10) fail('exhausted');
    active = true;
    let readIssued = false;
    try {
      if (!invariant()) fail('input_rejected');
      const expectedCount = kind === 'quote' ? 1 : kind === 'work' ? 2 : kind === 'checkpoint' ? 4 : 3;
      if (count !== expectedCount) fail('input_rejected');
      const incomingCheckpoint = kind === 'checkpoint' ? checkpointText(checkpointJson) : null;
      const budget = { nodes: 32768, characters: 2097152 };
      const stable = snapshotData(record(input, INPUT), 0, budget);
      if (stable.observedUserSendReadVersion !== 3 || stable.phase !== 'UNSIGNED'
          || typeof stable.runtimeContextDigest !== 'string'
          || stable.runtimeContextDigest.length !== 71 || !test(DIGEST, stable.runtimeContextDigest))
        fail('input_rejected');
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
      const params = freeze([stable.payerAddress]);
      const frontierRequest = freeze({ method: 'ledger.getFrontierAccountBlock', params });
      const balanceRequest = freeze({ method: 'ledger.getAccountInfoByAddress', params });
      cycles += 1; readIssued = true;
      const beforeText = await readAccount(frontierRequest);
      if (!invariant()) fail('input_rejected');
      const before = decode(beforeText, stable, request);
      if (originalSubject !== null && !sameOriginal(before, originalSubject)) fail('input_rejected');
      const balanceText = await readAccount(balanceRequest);
      if (!invariant()) fail('input_rejected');
      BALANCE({
        balanceReadVersion: 1, phase: stable.phase, paymentRequired: stable.paymentRequired,
        accepted: stable.accepted, payerAddress: stable.payerAddress, compiledSporkIds: stable.compiledSporkIds,
        accountFrontier: before, resultJson: balanceText,
      });
      const collected = await shield(apply(collect, undefined, [request]));
      if (!invariant() || collected.normalization.classification !== 'DP_ACTIVE'
          || collected.normalization.requestContextBinding !== 'MATCHES_DECLARED_EXPECTED_REQUEST_CONTEXT')
        fail('input_rejected');
      const afterText = await readAccount(frontierRequest);
      if (!invariant()) fail('input_rejected');
      const after = decode(afterText, stable, request);
      if (!sameFrontier(before, after)) fail('input_rejected');
      const view = {
        observedUserSendViewVersion: 1, phase: stable.phase, paymentRequired: stable.paymentRequired,
        accepted: stable.accepted, payerAddress: stable.payerAddress, compiledSporkIds: stable.compiledSporkIds,
        accountFrontierResultJson: afterText, observation: collected.observation,
        policy: stable.policy, runtimeContextDigest: stable.runtimeContextDigest,
      };
      if (checkpointReadOnly && kind === 'checkpoint') {
        const checked = await READ_CHECKPOINT(view, plan, detail, incomingCheckpoint);
        if (!invariant()) fail('input_rejected');
        const result = create(null);
        put(result, 'observedBalanceCheckpointReadVersion', 1);
        put(result, 'phase', 'UNSIGNED');
        put(result, 'originalPlan', plan);
        put(result, 'accountBlock', checked.accountBlock);
        put(result, 'checkpointJson', checked.checkpointJson);
        put(result, 'validation', checked.validation);
        put(result, 'originalPacketBinding', checked.originalPacketBinding);
        put(result, 'accountFrontierProjection', checked.accountFrontierProjection);
        put(result, 'declaredBalanceRead', 'VALIDATED_IN_THIS_BRACKETED_READ_CYCLE');
        put(result, 'currentAuthority', 'NOT_ESTABLISHED');
        put(result, 'signingAuthorization', 'NOT_ESTABLISHED');
        put(result, 'chainAuthentication', 'NOT_ESTABLISHED');
        put(result, 'persistence', 'NOT_PERFORMED');
        put(result, 'authority', 'NONE');
        put(result, 'afterSigningAction', 'NONE');
        return freeze(result);
      }
      if (checkpointEnabled && kind === 'validate') {
        // CHECKPOINT reuses the captured SAME existing unsigned validator.
        // Keep this cycle's account/balance/price DATA; do not obtain a fifth
        // cycle, refresh the quote, reassemble or parse an incoming packet.
        const checkpointJson = await CHECKPOINT(view, plan, detail);
        if (!invariant()) fail('input_rejected');
        const result = create(null);
        put(result, 'observedUnsignedCheckpointVersion', 1);
        put(result, 'phase', 'UNSIGNED');
        put(result, 'originalPlan', plan);
        put(result, 'accountBlock', detail);
        put(result, 'checkpointJson', checkpointJson);
        put(result, 'declaredBalanceRead', 'VALIDATED_IN_THIS_BRACKETED_READ_CYCLE');
        put(result, 'currentAuthority', 'NOT_ESTABLISHED');
        put(result, 'signingAuthorization', 'NOT_ESTABLISHED');
        put(result, 'chainAuthentication', 'NOT_ESTABLISHED');
        put(result, 'persistence', 'NOT_PERFORMED');
        put(result, 'authority', 'NONE');
        return freeze(result);
      }
      const args = kind === 'quote' ? [view] : kind === 'work' ? [view, plan] : [view, plan, detail];
      const result = await shield(apply(STAGES[kind], undefined, args));
      if (!invariant()) fail('input_rejected');
      return result;
    } catch {
      if (readIssued) held = true;
      fail(readIssued ? 'read_or_stage_rejected' : 'input_rejected');
    } finally { active = false; }
  }
  function readAccount(request) {
    if (!invariant()) fail('input_rejected');
    const pending = apply(accountRead, undefined, [request]);
    if (!invariant() || typeof pending !== 'object' || pending === null || isProxy(pending)
        || !isPromise(pending) || prototype(pending) !== promisePrototype) fail('input_rejected');
    const c = descriptor(pending, 'constructor');
    if (c !== undefined && (!hasOwn(c, 'value') || c.value !== NativePromise)) fail('input_rejected');
    const bridge = apply(nativeThen, pending, [fulfilled, rejected]);
    return shield(unpack(bridge));
  }
  async function unpack(bridge) {
    const value = await shield(bridge);
    if (!invariant() || !value.accepted) fail('input_rejected');
    return value.text;
  }
  if (checkpointReadOnly) return freeze({
    validateUnsignedCheckpoint: freeze(function validateUnsignedCheckpoint(input, plan, block, text) {
      return dispatch('checkpoint', arguments.length, input, plan, block, text);
    }),
  });
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
function checkpointText(value) {
  if (typeof value !== 'string' || value.length > 32768
      || apply(byteLength, Buffer, [value, 'utf8']) > 32768) fail('input_rejected');
  return value;
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
// The unchanged finite descriptor-DATA grammar at the existing read seam.
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
  const code = 'zenon_observed_balance_dp_read_adapter_' + kind;
  const error = kind === 'busy' ? new BusyError(code) : new ErrorType(code);
  put(error, 'code', code); put(error, 'stack', (kind === 'busy' ? 'Error: ' : 'TypeError: ') + code, false);
  throw freeze(error);
}
