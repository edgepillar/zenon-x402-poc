import { types as utilTypes } from 'node:util';
import { createZenonDynamicPlasmaOriginalFundingPreparation } from './dynamic-plasma-original-funding-preparation.js';
import { snapshotZenonDynamicPlasmaOriginalFundingPins } from './dynamic-plasma-original-funding-data.js';
import { createZenonFundingPostV1PayerRecoveryOwner } from '../service-credit-zenon-funding-post-v1-payer-recovery-owner.js';
import { ZenonFundingPayerRecoverySqliteStore } from '../service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js';
import { encodeOriginalPaymentCheckpoint } from '../service-credit-pilot-original-payment-checkpoint.js';

const PREPARATION = createZenonDynamicPlasmaOriginalFundingPreparation;
const PAYER = createZenonFundingPostV1PayerRecoveryOwner;
const PINS = snapshotZenonDynamicPlasmaOriginalFundingPins, ENCODE = encodeOriginalPaymentCheckpoint;
const FREEZE = Object.freeze, CREATE = Object.create, DEFINE = Object.defineProperty;
const DESCRIPTOR = Object.getOwnPropertyDescriptor, PROTOTYPE = Object.getPrototypeOf, HAS = Object.hasOwn;
const KEYS = Reflect.ownKeys, APPLY = Reflect.apply;
const IS_PROXY = utilTypes.isProxy, IS_PROMISE = utilTypes.isPromise;
const OBJECT = Object.prototype, ARRAY = Array.prototype;
const NativePromise = Promise, PROMISE = NativePromise.prototype, REJECT = NativePromise.reject;
const THEN_DESCRIPTOR = DESCRIPTOR(PROMISE, 'then'), THEN = THEN_DESCRIPTOR.value;
const SPECIES_KEY = Symbol.species;
const CONSTRUCTOR = DESCRIPTOR(PROMISE, 'constructor'), SPECIES = DESCRIPTOR(NativePromise, SPECIES_KEY);
const ErrorType = TypeError;
const STORE = ZenonFundingPayerRecoverySqliteStore.prototype;
const STORE_METHODS = FREEZE(['resourceUrl', 'load', 'prepare', 'prepareWithOriginalPaymentCheckpoint',
  'getOriginalPaymentCheckpoint', 'fenceAttempt', 'finishAttempt', 'recoverAfterRestart', 'close']);
const STORE_DESCRIPTORS = FREEZE(STORE_METHODS.map(name => FREEZE(DESCRIPTOR(STORE, name))));
const LOAD = DESCRIPTOR(STORE, 'load')?.value;
const CHECKPOINT = DESCRIPTOR(STORE, 'getOriginalPaymentCheckpoint')?.value;
const RESOURCE = DESCRIPTOR(STORE, 'resourceUrl')?.get;
const PHASES = FREEZE({ BOUND: 'FUNDING_INTAKE_BOUND', OUTCOME_UNKNOWN: 'SUBMISSION_OUTCOME_UNKNOWN',
  PAYMENT_REJECTED: 'FUNDING_INTAKE_REJECTED', PAYMENT_CONFLICT: 'FUNDING_INTAKE_CONFLICT' });

/**
 * SOURCE-ONLY application composition; NOT imported, tested or default-enabled.
 * Imports the real SDK preflight, native V6 store and actual funding POST owner.
 * This is NOT the SDK/SQL-free DATA helper. No substitute preflight, store,
 * preparer/client factory or success callback is accepted.
 *
 * The caller must supply one exclusively owned, already opened genuine V6
 * store and an explicitly selected fetch capability. Successful construction
 * transfers that store's lifetime to this composition's actual payer owner;
 * the real DP preparation owner borrows it. Construction does no signing,
 * DB initialization/recovery, transport or chain publication. On construction
 * failure the caller still owns close/quarantine; a store-object claim may
 * already be consumed. Claims are never reset, released or a cross-restart
 * fence. No other store owner may operate concurrently.
 * V6 is a caller precondition, not a factory-time private-schema inspection.
 * The actual checkpoint commit refuses a non-V6 store before any submission;
 * a signature may already exist then and must remain inspectable, not retried.
 *
 * Prepare -> independently retain pins -> commit remain explicit operations.
 * submitOriginalFunding requires those caller pins again, matches V6 bytes
 * and PREPARED revision 1, explicitly recovers the actual payer owner without
 * transport, matches the same state again, then delegates ONE submitPrepared.
 * The real owner performs preflight, durable ATTEMPT_FENCED and the real
 * funding POST client. Original headers are never reconstructed/re-encoded
 * for sending. A separate first operation is not inferred from cached DATA.
 *
 * BOUND is funding-intake acknowledgement, NOT chain publication/inclusion,
 * a grant, credit activation, service delivery or a completed economic pilot.
 * Ambiguity, any failed post-entry readback and even close preserve the exact
 * original packet and the old operation phase. No replayUnknown, replacement,
 * new challenge, wallet retry, reopening or reset is exposed. Recovery after
 * closing is a separately selected operation using independent retained pins.
 *
 * close delegates once to the actual payer owner after an active operation
 * settles. A close request before the submitPrepared entry prevents that entry;
 * it is NOT cancellation after entry or a hard deadline/resource-drain proof.
 * Existing callback cycles or undrained transport may still require external
 * hold/quarantine. No OS, hostile-code, crash or current-main qualification is
 * claimed by these cooperative intrinsic/descriptor checks.
 */
export function createZenonDynamicPlasmaOriginalFundingSubmission(configuration) {
  let preparer, payer, store, resource;
  try {
    if (arguments.length !== 1 || !invariant()) fail('configuration_rejected');
    const input = record(configuration, ['preparerOptions', 'store', 'fundingResourceUrl', 'deadlineMs', 'fetchImpl']);
    store = input.store; resource = input.fundingResourceUrl;
    if (typeof store !== 'object' || store === null || IS_PROXY(store) || PROTOTYPE(store) !== STORE
        || STORE_METHODS.some(name => DESCRIPTOR(store, name) !== undefined)
        || typeof resource !== 'string' || typeof RESOURCE !== 'function'
        || APPLY(RESOURCE, store, []) !== resource
        || !Number.isSafeInteger(input.deadlineMs) || input.deadlineMs < 1 || input.deadlineMs > 60000
        || typeof input.fetchImpl !== 'function' || IS_PROXY(input.fetchImpl)) fail('configuration_rejected');
    preparer = PREPARATION({ preparerOptions: input.preparerOptions, store, fundingResourceUrl: resource });
    payer = PAYER({ store, deadlineMs: input.deadlineMs, fetchImpl: input.fetchImpl });
    if (!invariant()) fail('configuration_rejected');
  } catch { fail('configuration_rejected'); }
  const STORAGE = store, URL = resource, PREPARER = preparer, PAYER_OWNER = payer;
  const PREPARE = method(PREPARER, 'prepareOriginalFunding');
  const COMMIT = method(PREPARER, 'commitOriginalFunding');
  const INSPECT = method(PREPARER, 'inspectOriginalFunding');
  const RECOVER = method(PAYER_OWNER, 'recover'), SUBMIT = method(PAYER_OWNER, 'submitPrepared');
  const CLOSE = method(PAYER_OWNER, 'close');
  let phase = 'IDLE', lifecycle = 'OPEN', packet = null, pending = null, closing = null;
  let prepareAttempts = 0, commitAttempts = 0, submissionAttempts = 0, submissionEntered = false;
  let fundingIntakeStatus = null;
  configuration = null; preparer = null; payer = null; store = null; resource = null;

  function retained(pins, status, revision) {
    if (!invariant()) fail('original_state_rejected');
    const row = APPLY(LOAD, STORAGE, []);
    if (value(row, 'status') !== status || value(row, 'revision') !== revision
        || value(row, 'ambiguityLatched') !== (status === 'OUTCOME_UNKNOWN')
        || value(row, 'resourceUrl') !== URL
        || value(row, 'challengeHeader') !== packet.pair.challenge.paymentRequiredHeader
        || value(row, 'paymentHeader') !== packet.pair.paymentSignatureHeader
        || ENCODE(APPLY(CHECKPOINT, STORAGE, [pins])) !== packet.serializedCheckpoint
        || !invariant()) fail('original_state_rejected');
  }
  async function prepare(input) {
    if (phase !== 'IDLE' || prepareAttempts !== 0) fail('prepare_unavailable');
    prepareAttempts = 1; phase = 'PREPARING';
    try {
      const result = await APPLY(PREPARE, PREPARER, [input]);
      if (!invariant() || value(result, 'phase') !== 'AWAITING_INDEPENDENT_PINS') fail('prepare_refused');
      packet = value(result, 'packet'); phase = 'AWAITING_INDEPENDENT_PINS';
      return result;
    } catch { phase = 'PREPARATION_REFUSED'; fail('prepare_refused'); }
  }
  async function commit(input) {
    if (phase !== 'AWAITING_INDEPENDENT_PINS' || commitAttempts !== 0) fail('commit_unavailable');
    commitAttempts = 1; phase = 'COMMITTING';
    try {
      const result = await APPLY(COMMIT, PREPARER, [input]);
      if (!invariant() || value(result, 'phase') !== 'LOCAL_STORE_READBACK_MATCHED') fail('commit_refused');
      phase = 'LOCAL_STORE_READBACK_MATCHED';
      return result; // Still no recovery, funding POST or chain publication.
    } catch { phase = 'COMMIT_OUTCOME_UNKNOWN_OR_REFUSED'; fail('commit_unknown_or_refused'); }
  }
  async function submit(input) {
    if (phase !== 'LOCAL_STORE_READBACK_MATCHED' || submissionAttempts !== 0) fail('submission_unavailable');
    // Reject bad caller DATA before any SQL, counter consumption or recovery.
    const pins = PINS(packet.serializedCheckpoint, record(input, ['expectedPins']).expectedPins);
    submissionAttempts = 1; phase = 'CHECKING_ORIGINAL_BEFORE_INTAKE';
    try {
      retained(pins, 'PREPARED', 1);
      const recovered = await APPLY(RECOVER, PAYER_OWNER, []);
      if (!invariant() || value(recovered, 'status') !== 'PREPARED') fail('original_state_rejected');
      retained(pins, 'PREPARED', 1);
      if (lifecycle !== 'OPEN') fail('close_requested_before_submission');
      submissionEntered = true; phase = 'INTAKE_SUBMISSION_IN_FLIGHT';
      const result = await APPLY(SUBMIT, PAYER_OWNER, []);
      if (!invariant()) fail('submission_unknown');
      const status = value(result, 'status');
      if (typeof status !== 'string' || !HAS(PHASES, status)) fail('submission_unknown');
      retained(pins, status, 3); // PREPARED -> actual durable fence -> actual completion.
      fundingIntakeStatus = status; phase = PHASES[status];
      return FREEZE({ originalFundingSubmissionVersion: 1, phase, fundingIntakeStatus,
        transactionHash: packet.transactionHash, authority: 'NONE', chainPublication: 'NOT_ESTABLISHED',
        inclusion: 'NOT_ESTABLISHED', grant: 'NOT_ESTABLISHED', serviceDelivery: 'NOT_ESTABLISHED' });
    } catch {
      phase = submissionEntered ? 'SUBMISSION_OUTCOME_UNKNOWN' : 'HELD_BEFORE_SUBMISSION';
      fail(submissionEntered ? 'submission_unknown' : 'submission_held');
    }
  }
  function launch(operation, count, input) {
    try {
      if (count !== 1 || !invariant()) fail('input_rejected');
      if (lifecycle !== 'OPEN') fail('closed');
      if (pending !== null) fail('busy');
    } catch { return rejected('operation_unavailable'); }
    // Claim before reentry, without delaying the real owner's input capture.
    let resolvePublic, rejectPublic;
    const promise = shield(new NativePromise((resolve, reject) => {
      resolvePublic = resolve; rejectPublic = reject;
    }));
    pending = promise;
    const clear = () => { if (pending === promise) pending = null; };
    APPLY(THEN, promise, [clear, clear]);
    try {
      const work = shield(operation(input));
      APPLY(THEN, work, [resolvePublic, rejectPublic]);
    } catch { rejectPublic(error('operation_unavailable')); }
    return promise;
  }
  function close() {
    if (arguments.length !== 0 || !invariant()) return rejected('input_rejected');
    if (closing !== null) return closing;
    lifecycle = 'CLOSING';
    closing = shield((async () => {
      const active = pending;
      if (active !== null) { try { await active; } catch {} }
      try {
        if (!invariant()) fail('close_unknown');
        const result = await APPLY(CLOSE, PAYER_OWNER, []);
        if (!invariant() || value(result, 'status') !== 'CLOSED') fail('close_unknown');
        lifecycle = 'CLOSED';
        return FREEZE({ lifecycle, originalOperationPhase: phase, authority: 'NONE' });
      } catch { lifecycle = 'CLOSE_OUTCOME_UNKNOWN'; fail('close_unknown'); }
    })());
    return closing;
  }
  function inspectOriginalFunding() {
    if (arguments.length !== 0 || !invariant()) fail('input_rejected');
    return FREEZE({ originalFundingSubmissionInspectionVersion: 1, phase, lifecycle, publicOperationActive: pending !== null,
      prepareAttempts, commitAttempts, submissionAttempts, submissionEntered, fundingIntakeStatus,
      preparation: APPLY(INSPECT, PREPARER, []), authority: 'NONE', automaticReplay: false,
      chainPublication: 'NOT_ESTABLISHED', grant: 'NOT_ESTABLISHED', serviceDelivery: 'NOT_ESTABLISHED',
      transportDrain: 'NOT_EXPOSED_BY_THIS_VIEW' });
  }
  return FREEZE({
    prepareOriginalFunding: FREEZE(function prepareOriginalFunding(input) { return launch(prepare, arguments.length, input); }),
    commitOriginalFunding: FREEZE(function commitOriginalFunding(input) { return launch(commit, arguments.length, input); }),
    submitOriginalFunding: FREEZE(function submitOriginalFunding(input) { return launch(submit, arguments.length, input); }),
    inspectOriginalFunding: FREEZE(inspectOriginalFunding), close: FREEZE(close),
  });
}
function record(input, fields) {
  if (typeof input !== 'object' || input === null || IS_PROXY(input)
      || PROTOTYPE(input) !== OBJECT || KEYS(input).length !== fields.length) fail('input_rejected');
  const output = CREATE(OBJECT);
  for (const field of fields) put(output, field, value(input, field));
  return FREEZE(output);
}
function value(input, field) {
  if (typeof input !== 'object' || input === null || IS_PROXY(input)) fail('input_rejected');
  const d = DESCRIPTOR(input, field);
  if (!d || !d.enumerable || !HAS(d, 'value')) fail('input_rejected');
  return d.value;
}
function method(owner, name) {
  const found = value(owner, name);
  if (typeof found !== 'function' || IS_PROXY(found)) fail('configuration_rejected');
  return found;
}
function shield(promise) {
  if (!IS_PROMISE(promise) || IS_PROXY(promise) || PROTOTYPE(promise) !== PROMISE) fail('operation_rejected');
  put(promise, 'constructor', NativePromise, false); return promise;
}
function rejected(kind) { return shield(APPLY(REJECT, NativePromise, [error(kind)])); }
function invariant() {
  return DESCRIPTOR(OBJECT, 'then') === undefined && DESCRIPTOR(OBJECT, 'toJSON') === undefined
    && DESCRIPTOR(ARRAY, 'toJSON') === undefined
    && same(DESCRIPTOR(PROMISE, 'then'), THEN_DESCRIPTOR)
    && same(DESCRIPTOR(PROMISE, 'constructor'), CONSTRUCTOR)
    && same(DESCRIPTOR(NativePromise, SPECIES_KEY), SPECIES)
    && STORE_METHODS.every((name, index) => same(DESCRIPTOR(STORE, name), STORE_DESCRIPTORS[index]));
}
function same(actual, expected) {
  if (!actual || !expected || KEYS(actual).length !== KEYS(expected).length) return false;
  for (const key of KEYS(expected)) if (!HAS(actual, key) || actual[key] !== expected[key]) return false;
  return true;
}
function put(target, key, content, enumerable = true) {
  const d = CREATE(null); d.value = content; d.enumerable = enumerable;
  d.writable = false; d.configurable = false; DEFINE(target, key, d);
}
function error(kind) {
  const code = 'zenon_dynamic_plasma_original_funding_submission_' + kind;
  const problem = new ErrorType(code); put(problem, 'code', code);
  put(problem, 'stack', 'TypeError: ' + code, false); return FREEZE(problem);
}
function fail(kind) { throw error(kind); }
