import { types as utilTypes } from 'node:util';
import { bindWalletOriginalFundingPreSignContext, beginWalletOriginalFundingPreSignObservation } from './original-funding-signer-context-bridge.js';
import { Buffer } from 'node:buffer';
import { setTimeout as nativeSetTimeout, clearTimeout as nativeClearTimeout } from 'node:timers';
import { createObservedBalanceDynamicPlasmaUserSendAttempt } from './dynamic-plasma-observed-balance-user-send-attempt.js';
import {
  createObservedBalanceDynamicPlasmaUserSendCheckpointReadAdapter,
  createObservedBalanceDynamicPlasmaWalletCandidateReadAdapter,
  createObservedBalanceDynamicPlasmaRetainedSignedCandidateReadAdapter,
} from './dynamic-plasma-observed-balance-user-send-read-adapter.js';

const CREATE_ATTEMPT = createObservedBalanceDynamicPlasmaUserSendAttempt;
const CREATE_CHECKPOINT_READS = createObservedBalanceDynamicPlasmaUserSendCheckpointReadAdapter;
const CREATE_WALLET_READS = createObservedBalanceDynamicPlasmaWalletCandidateReadAdapter;
const CREATE_RETAINED_READS = createObservedBalanceDynamicPlasmaRetainedSignedCandidateReadAdapter;
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
const ErrorType = TypeError;
const BusyError = Error;
const CONFIG = freeze(['readOptions', 'materialExchange']);
const DEADLINE_CONFIG = freeze(['readOptions', 'materialExchange', 'materialWaitMs']);
const WALLET_CONFIG = freeze([...DEADLINE_CONFIG, 'wallet']);
const SET_TIMEOUT = nativeSetTimeout;
const CLEAR_TIMEOUT = nativeClearTimeout;
const READ_OPTIONS = freeze(['transports', 'accountExchange']);
const TRANSPORT = freeze(['callRead']);
const CONTEXT = freeze(['plannerContextVersion', 'readInput']);
const READ_INPUT = freeze([
  'observedUserSendReadVersion', 'phase', 'paymentRequired', 'accepted',
  'payerAddress', 'compiledSporkIds', 'policy', 'runtimeContextDigest',
]);
const MATERIAL = freeze(['materialVersion', 'publicKey', 'nonce']);
const PUBLIC_KEY = /^[A-Za-z0-9+/]{43}=$/;
const NONCE = /^[0-9a-f]{16}$/;

/**
 * Default-off deferred SUPPLIED-material planner over the explicit v3
 * original-quote/balance attempt. Capture that factory ONCE. Options:
 * {readOptions:<existing account/two-DP capabilities>, materialExchange}.
 * Context: {plannerContextVersion:3, readInput:<existing explicit v3 DATA>}.
 * NO supplied balance text, material, replacement plan, quote or block.
 *
 * Snapshot the entire selected context before any callback. Retain one actual
 * attempt: quote -> original work request -> ONE materialExchange handoff ->
 * assembly -> final validation of the SAME original unsigned AccountBlock.
 * Each stage obtains a fresh selected-payer AccountInfo between its own
 * frontier brackets on ONE existing account wire: four three-read cycles.
 * While material is pending this module issues no additional reads. Later
 * stages recheck the original account/quote/price horizon, never re-quote,
 * recreate a wire or ask for replacement material on expiry/failure.
 *
 * materialExchange receives one frozen {materialRequestVersion:1,
 * phase:'UNSIGNED', workRequest:<existing detached original work contract>}.
 * It must return a supported native Promise of the existing v1 material DATA.
 * This closes orchestration, NOT actual work production. No nonce search,
 * key production, signature, actual PREPARE, payment/publication, owner/host,
 * RPC method, retry, reset or cancellation is added. Prior supplied-v1 and
 * deferred-v2 planners, base stub and active SDK path remain unchanged.
 * The capability is trusted and operational, NOT a sandbox or authority to
 * use a real producer/signer. Adoption needs separate qualified authorized
 * owners, resource budgets, current payer/provider/policy authority and gates.
 *
 * One admitted call, including failure. Busy/used precede input inspection;
 * wrong arity alone does not consume admission. The capability is called at
 * most once. Public methods are only prepareUnsigned; no close/reset/resume.
 * This volatile sequence is NOT durable custody or consumed/signer-state proof.
 * Recreating it grants no replacement/re-signing right. Preserve original
 * signed payment/request bytes/hash/payload/requirements/context elsewhere;
 * VALIDATED possible exact-same-signed-block resend remains separate from
 * UNKNOWN/ACKNOWLEDGED. This interface must stop before external signing.
 *
 * AccountInfo has no chain ID/hash: coherent projections are NOT authenticated
 * funds, freshness, atomicity, ancestry, ABA exclusion, real runtime p, provider
 * READY or inclusion evidence. All runtime context/policy remain declared DATA.
 *
 * Observe only supported native Promise mechanics, never a foreign .then.
 * Snapshot fulfilled material inside the native observer before an await can
 * assimilate it. Unsafe/rejected/throwing capabilities fail without inspecting
 * raw reasons. Their owner must prehandle unsafe returned rejections and retain
 * endpoint identity, deadlines and terminal cleanup. No hard lifetime or native
 * cleanup guarantee; indirect dependencies on this run may still deadlock.
 * Captured native intrinsics, loader/Promise/OS behavior remain premises.
 */
export function createObservedBalanceDeferredMaterialDynamicPlasmaTransactionPlanner(options) {
  if (arguments.length !== 1) fail('configuration_rejected');
  return createPlanner(options, false);
}

/**
 * Explicit opt-in plannerContextVersion:4 over the same inputv3/readOptions
 * and one deferred supplied-material capability. Return one frozen powerless
 * {originalPlan, accountBlock, checkpointJson, ...} only after final fresh
 * bracketed balance/price validation. Retain the actual first quote and SAME
 * assembly in this admitted run; never reconstruct an original from the final
 * block, re-quote, call material twice or add a fifth read cycle. Private
 * sequencing is owned here; the captured checkpoint reader owns the same
 * ten-cycle/one-wire read budget. Busy/used/native-Promise and snapshot fences
 * are shared below, not delegated to a caller factory or a wrapper run.
 *
 * The existing factory still requires context version3 and returns only its
 * block. This new result is pre-sign declared DATA, not persistent custody,
 * signer-state detection, consumed authority or permission to replace/pay.
 * No nonce/key producer, SDK, external signing or default buyer is adopted.
 * Expose ONLY prepareUnsignedCheckpoint, not the block-returning
 * prepareUnsigned SPI; this packet cannot masquerade as an AccountBlock.
 */
export function createObservedBalanceDeferredMaterialCheckpointPreparer(options) {
  if (arguments.length !== 1) fail('configuration_rejected');
  return createPlanner(options, true);
}

/**
 * Explicit opt-in context version5, with exact options
 * {readOptions, materialExchange, materialWaitMs:<integer 1..60000>}.
 * The selected budget bounds ONLY waiting for a supported material Promise
 * after the original quote/work stages and ONE handoff. It does not bound a
 * synchronous callback, prior/later reads, the whole run or OS scheduling.
 * It neither stops nor cancels the producer and never grants native cleanup.
 *
 * Expiry permanently consumes this preparer and rejects material_wait_unknown
 * before assembly/further reads. The private rejection/fulfillment observers
 * remain attached: a late outcome is drained without inspecting its value or
 * reason, without replacement, and cannot resume this run. UNKNOWN_PENDING is
 * not CLOSED; even UNKNOWN_DRAINED does not establish external owner cleanup.
 * An unresolved borrowed operation may retain its private observer indefinitely.
 * Its separately qualified owner retains terminal cleanup responsibility.
 *
 * getMaterialWaitSnapshot() returns only detached scalar observations, not a
 * handle, checkpoint, resume/reset or authority. Successful material still
 * undergoes the same original-quote/four-cycle final checks. v3/v4 remain
 * unbounded and retain their exact existing surfaces and context versions.
 * No producer, nonce search, key/signing, SDK, SQL or real PREPARE is adopted.
 */
export function createObservedBalanceDeadlineBoundMaterialCheckpointPreparer(options) {
  if (arguments.length !== 1) fail('configuration_rejected');
  return createPlanner(options, true, true);
}

/**
 * Explicit contextv6 composition: the actual deadline-bound material path ->
 * original unsigned checkpoint/handoff -> ONE borrowed WalletAdapter.sign ->
 * actual fifth bracketed account/balance/price read. Wallet.getAddress must
 * first match the independently selected payer. No wallet/SDK is defaulted.
 * Both wallet methods are operational capabilities, not consent inferred from
 * DATA. Their separately authorized owner retains keys, pending-operation
 * lifetime and any result not safely returned here. materialWaitMs still
 * bounds material waiting ONLY, not wallet/read lifetime or cancellation.
 *
 * Return a signed CANDIDATE, not a verified payment payload. Canonical signature
 * bytes are syntax only: real cryptographic payment preflight and durable
 * original signed-payment custody MUST precede transport/publication. No such
 * transport is exposed. After current-read refusal, volatile inspection keeps
 * a field-bound original candidate without granting retry or re-signing rights.
 * Old v3/v4/v5 factories and the default legacy buyer remain unchanged. This
 * opt-in source is not the separate Phase2C cutover or a runtime qualification.
 */
export function createObservedBalanceDeadlineBoundMaterialWalletCandidatePreparer(options) {
  if (arguments.length !== 1) fail('configuration_rejected');
  return createPlanner(options, true, true, true);
}

/**
 * Explicit contextv7 for original-funding custody integration. Retain the same
 * original signed candidate after the usual five cycles; then expose ONE
 * revalidateSignedOriginal() current cycle before the caller commits custody.
 * That separate operation never calls wallet, material, quote or assembly.
 * Its refusal preserves the original candidate and grants no retry/resigning.
 * No SDK/signature verification, persistence, transport or default is adopted.
 * Contextv6 and all earlier factories keep their existing methods/behavior.
 */
export function createObservedBalanceDeadlineBoundMaterialRetainedCandidatePreparer(options) {
  if (arguments.length !== 1) fail('configuration_rejected');
  return createPlanner(options, true, true, true, true);
}

function createPlanner(options, checkpointEnabled, deadlineEnabled = false,
  walletCandidateEnabled = false, retainedValidationEnabled = false) {
  let steps, exchange, materialWaitMs = null, walletReceiver = null, walletAddress = null, walletSign = null;
  try {
    if (!invariant()) fail('configuration_rejected');
    const top = record(options, walletCandidateEnabled ? WALLET_CONFIG : deadlineEnabled ? DEADLINE_CONFIG : CONFIG);
    if (deadlineEnabled) {
      materialWaitMs = top.materialWaitMs;
      if (!isSafeInteger(materialWaitMs) || materialWaitMs < 1 || materialWaitMs > 60000)
        fail('configuration_rejected');
    }
    const reads = record(top.readOptions, READ_OPTIONS);
    exchange = top.materialExchange;
    if (typeof exchange !== 'function' || isProxy(exchange)
        || exchange === reads.accountExchange) fail('configuration_rejected');
    const transports = twoTransports(reads.transports);
    for (const transport of transports) {
      if (exchange === record(transport, TRANSPORT).callRead) fail('configuration_rejected');
    }
    if (walletCandidateEnabled) {
      walletReceiver = top.wallet;
      walletAddress = captureWalletMethod(walletReceiver, 'getAddress');
      walletSign = captureWalletMethod(walletReceiver, 'sign');
      if (walletAddress === walletSign || walletAddress === exchange || walletSign === exchange
          || walletAddress === reads.accountExchange || walletSign === reads.accountExchange)
        fail('configuration_rejected');
      for (const transport of transports) {
        const read = record(transport, TRANSPORT).callRead;
        if (walletAddress === read || walletSign === read) fail('configuration_rejected');
      }
    }
    const attempt = retainedValidationEnabled ? CREATE_RETAINED_READS(reads)
      : walletCandidateEnabled ? CREATE_WALLET_READS(reads)
      : checkpointEnabled ? CREATE_CHECKPOINT_READS(reads) : CREATE_ATTEMPT(reads);
    steps = freeze({
      quote: attempt.quote, work: attempt.createWorkRequest,
      assemble: attempt.assemble, validate: attempt.validateUnsigned,
    });
  } catch { fail('configuration_rejected'); }
  const EXCHANGE = exchange;
  const WALLET = walletReceiver, WALLET_ADDRESS = walletAddress, WALLET_SIGN = walletSign;
  let active = false, used = false, originalRun = null;
  let walletHandoff = null, walletSignAttempts = 0, walletResultObserved = false;
  let retainedValidationAttempts = 0;
  let retainedCandidateReady = false;
  let waitPhase = 'NOT_STARTED', materialPending = false, timeoutExpired = false;
  let timersStarted = 0, timersCleared = 0, lateOutcomesIgnored = 0;
  exchange = null; options = null; walletReceiver = null; walletAddress = null; walletSign = null;

  async function observeWallet(method, args, signedCandidate) {
    if (!invariant()) fail('operation_rejected');
    const pending = apply(method, WALLET, args);
    if (!invariant() || pending === originalRun || !supportedPromise(pending)) fail('operation_rejected');
    const bridge = apply(nativeThen, pending, [value => {
      try {
        if (!invariant()) return walletReceipt(false, null);
        if (!signedCandidate) return walletReceipt(typeof value === 'string' && value.length <= 128, value);
        return walletReceipt(true, snapshotData(value, 0, { nodes: 2048, characters: 32768 }));
      } catch { return walletReceipt(false, null); }
    }, () => walletReceipt(false, null)]);
    // Return the private null-prototype receipt, never assimilate raw wallet
    // fulfillment or consult a foreign/own then hook on a signed candidate.
    const captured = await shield(bridge);
    if (!invariant() || !captured.accepted) fail('operation_rejected');
    return captured;
  }
  function getSignedOriginalData() {
    if (arguments.length !== 0 || !invariant()) fail('input_rejected');
    const result = create(null);
    put(result, 'observedWalletCandidateInspectionVersion', 1);
    put(result, 'walletSignAttempts', walletSignAttempts);
    put(result, 'walletResultObserved', walletResultObserved);
    put(result, 'candidate', walletHandoff === null ? null : walletHandoff.getSignedOriginalData());
    put(result, 'externalWalletOperation', walletSignAttempts === 0 ? 'NOT_ENTERED'
      : walletResultObserved ? 'RETURNED_DATA' : 'UNKNOWN');
    put(result, 'signatureValidation', 'NOT_PERFORMED');
    put(result, 'persistence', 'NOT_PERFORMED');
    put(result, 'currentAuthority', 'NOT_ESTABLISHED');
    put(result, 'authority', 'NONE');
    if (retainedValidationEnabled) put(result, 'retainedValidationAttempts', retainedValidationAttempts);
    return freeze(result);
  }

  function waitForMaterial(pending) {
    let settled = false, timer = null, resolveObserved;
    const observed = shield(new NativePromise(resolve => { resolveObserved = resolve; }));
    materialPending = true; waitPhase = 'WAITING';
    function clearOwnedTimer() {
      if (timer !== null) {
        apply(CLEAR_TIMEOUT, undefined, [timer]); timer = null; timersCleared += 1;
      }
    }
    function settle(fulfilled, value) {
      materialPending = false;
      if (settled) {
        // Do not inspect even the descriptor/prototype/then of late DATA.
        lateOutcomesIgnored += 1; waitPhase = 'UNKNOWN_DRAINED'; return;
      }
      settled = true; clearOwnedTimer();
      waitPhase = fulfilled ? 'RETURNED' : 'REJECTED';
      resolveObserved(fulfilled ? captureFulfilled(value) : receipt(false, null));
    }
    // Observe the native pending operation, never call a supplied .then.
    // Both handlers return undefined, so this drain cannot assimilate material.
    shield(apply(nativeThen, pending, [value => settle(true, value), () => settle(false, null)]));
    timer = apply(SET_TIMEOUT, undefined, [() => {
      if (settled) return;
      settled = true; clearOwnedTimer(); timeoutExpired = true;
      waitPhase = 'UNKNOWN_PENDING'; resolveObserved(receipt(false, null));
    }, materialWaitMs]);
    timersStarted += 1;
    return observed;
  }
  function getMaterialWaitSnapshot() {
    if (arguments.length !== 0 || !invariant()) fail('input_rejected');
    const result = create(null);
    const values = { materialWaitSnapshotVersion: 1, materialWaitMs, phase: waitPhase,
      active, used, materialPending, timeoutExpired, timersStarted, timersCleared,
      lateOutcomesIgnored, authority: 'NONE', currentAuthority: 'NOT_ESTABLISHED',
      externalOwnerCleanup: 'NOT_ESTABLISHED' };
    for (const key of ownKeys(values)) put(result, key, values[key]);
    return freeze(result);
  }
  async function run(count, context) {
    if (active) fail('busy');
    if (used) fail('used');
    if (count !== 1) fail('input_rejected');
    active = true; used = true;
    try {
      if (!invariant()) fail('operation_rejected');
      const top = record(context, CONTEXT);
      if (top.plannerContextVersion !== (retainedValidationEnabled ? 7 : walletCandidateEnabled ? 6
        : deadlineEnabled ? 5 : checkpointEnabled ? 4 : 3)) fail('input_rejected');
      const input = snapshotInput(top.readInput);
      // Fix/shield our public run identity before any borrowed callback can
      // reenter or return that same receipt as its own material operation.
      await undefined;
      if (!invariant()) fail('operation_rejected');
      if (walletCandidateEnabled) {
        const address = await observeWallet(WALLET_ADDRESS, [], false);
        if (address.value !== input.payerAddress) fail('operation_rejected');
      }
      const originalPlan = await apply(steps.quote, undefined, [input]);
      const work = await apply(steps.work, undefined, checkpointEnabled ? [input, originalPlan] : [input]);
      if (!invariant()) fail('operation_rejected');
      const request = freeze({
        materialRequestVersion: 1, phase: 'UNSIGNED', workRequest: work,
      });
      const pending = apply(EXCHANGE, undefined, [request]);
      if (!invariant() || pending === originalRun || !supportedPromise(pending)) fail('operation_rejected');
      const bridge = deadlineEnabled ? waitForMaterial(pending)
        : apply(nativeThen, pending, [captureFulfilled, () => receipt(false, null)]);
      const captured = await shield(bridge);
      if (!invariant() || !captured.accepted) fail('operation_rejected');
      const assembly = await apply(steps.assemble, undefined,
        checkpointEnabled ? [input, originalPlan, captured.material] : [input, captured.material]);
      // A selected bounded wallet starts its one local window before this
      // actual last read cycle, not after its network/validation latency.
      if (walletCandidateEnabled) beginWalletOriginalFundingPreSignObservation(WALLET);
      const final = await apply(steps.validate, undefined,
        checkpointEnabled ? [input, originalPlan, assembly.accountBlock] : [input]);
      if (!invariant()) fail('operation_rejected');
      if (walletCandidateEnabled) {
        walletHandoff = final;
        bindWalletOriginalFundingPreSignContext(WALLET, final);
        walletSignAttempts += 1;
        const signed = await observeWallet(WALLET_SIGN, [final.originalUnsignedBlock], true);
        walletResultObserved = true;
        const checked = await final.acceptSigned(signed.value);
        if (retainedValidationEnabled) {
          if (!invariant()) fail('operation_rejected');
          retainedCandidateReady = true;
        }
        return checked;
      }
      return checkpointEnabled ? final : assembly.accountBlock;
    } catch { fail(deadlineEnabled && timeoutExpired ? 'material_wait_unknown' : 'operation_rejected'); }
    finally { active = false; }
  }

  function dispatch(count, context) {
    const pending = shield(run(count, context));
    if (originalRun === null && active) originalRun = pending;
    return pending;
  }
  const operation = walletCandidateEnabled
    ? function prepareSignedCandidate(context) { return dispatch(arguments.length, context); }
    : checkpointEnabled
    ? function prepareUnsignedCheckpoint(context) { return dispatch(arguments.length, context); }
    : function prepareUnsigned(context) { return dispatch(arguments.length, context); };
  const revalidateSignedOriginal = freeze(function revalidateSignedOriginal() {
    return shield(revalidate(arguments.length));
  });
  async function revalidate(count) {
    if (active) fail('busy');
    if (count !== 0) fail('input_rejected');
    if (!retainedValidationEnabled || !retainedCandidateReady || !used || walletHandoff === null || !walletResultObserved
        || retainedValidationAttempts !== 0) fail('signed_original_revalidation_unavailable');
    active = true; retainedValidationAttempts = 1; retainedCandidateReady = false;
    try {
      if (!invariant()) fail('operation_rejected');
      const checked = await apply(walletHandoff.revalidateSignedOriginal, undefined, []);
      if (!invariant()) fail('operation_rejected');
      return checked;
    } catch { fail('signed_original_revalidation_unknown_or_refused'); }
    finally { active = false; }
  }
  if (retainedValidationEnabled) return freeze({
    prepareSignedCandidate: freeze(operation), getMaterialWaitSnapshot: freeze(getMaterialWaitSnapshot),
    getSignedOriginalData: freeze(getSignedOriginalData), revalidateSignedOriginal,
  });
  if (walletCandidateEnabled) return freeze({
    prepareSignedCandidate: freeze(operation), getMaterialWaitSnapshot: freeze(getMaterialWaitSnapshot),
    getSignedOriginalData: freeze(getSignedOriginalData),
  });
  if (deadlineEnabled) return freeze({
    prepareUnsignedCheckpoint: freeze(operation), getMaterialWaitSnapshot: freeze(getMaterialWaitSnapshot),
  });
  return freeze(checkpointEnabled
    ? { prepareUnsignedCheckpoint: freeze(operation) }
    : { prepareUnsigned: freeze(operation) });
}

function walletReceipt(accepted, value) {
  const result = create(null);
  put(result, 'accepted', accepted); put(result, 'value', accepted ? value : null);
  return freeze(result);
}
function captureWalletMethod(receiver, name) {
  if (typeof receiver !== 'object' || receiver === null || isProxy(receiver)) fail('configuration_rejected');
  let p = receiver;
  for (let count = 0; count < 8 && p !== null && p !== objectPrototype; count++) {
    if (isProxy(p)) fail('configuration_rejected');
    const d = descriptor(p, name);
    if (d !== undefined) {
      if (!hasOwn(d, 'value') || typeof d.value !== 'function' || isProxy(d.value)) fail('configuration_rejected');
      return d.value;
    }
    p = prototype(p);
  }
  fail('configuration_rejected');
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
  const top = record(value, READ_INPUT);
  if (top.observedUserSendReadVersion !== 3 || top.phase !== 'UNSIGNED') fail('input_rejected');
  return snapshotData(top, 0, { nodes: 32768, characters: 2097152 });
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
  const code = 'zenon_observed_balance_deferred_material_dp_planner_' + kind;
  const error = kind === 'busy' ? new BusyError(code) : new ErrorType(code);
  put(error, 'code', code);
  put(error, 'stack', (kind === 'busy' ? 'Error: ' : 'TypeError: ') + code, false);
  throw freeze(error);
}
