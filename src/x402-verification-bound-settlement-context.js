import { types as utilTypes } from 'node:util';
import { createSelectedSettlementContextOwner } from './x402-selected-settlement-context.js';

const CREATE_OWNER = createSelectedSettlementContextOwner;
const freeze = Object.freeze, create = Object.create, define = Object.defineProperty;
const descriptor = Object.getOwnPropertyDescriptor, prototype = Object.getPrototypeOf;
const ownKeys = Reflect.ownKeys, apply = Reflect.apply, hasOwn = Object.hasOwn;
const isProxy = utilTypes.isProxy, isPromise = utilTypes.isPromise;
const objectPrototype = Object.prototype;
const NativePromise = Promise, promisePrototype = NativePromise.prototype;
const nativeThen = promisePrototype.then, species = Symbol.species;
const constructorDescriptor = descriptor(promisePrototype, 'constructor');
const speciesDescriptor = descriptor(NativePromise, species);
const initialObjectThen = descriptor(objectPrototype, 'then');
const TypeErrorType = TypeError, ErrorType = Error;
const CONFIG = freeze([
  'original', 'verifyOriginal', 'settleFirst', 'reconcilePending', 'maxPendingReconciliations',
]);
const BINDING = freeze(['payloadJson', 'requirementsJson', 'challengeJson', 'paymentHash', 'network']);
const VERIFIED = freeze(['isValid']);

/**
 * Default-off verification-bound orchestration over ONE existing selected
 * settlement owner. Snapshot the declared original five-string binding BEFORE
 * the verifier can run, not by reconstructing it at first settlement. The
 * underlying owner validates its existing bounds and retains that SAME binding.
 *
 * Options are exactly CONFIG. verifyOriginal, settleFirst and the optional
 * reconcilePending must be distinct reviewed non-proxy functions. Every role
 * receives one fresh frozen binding. Verification returns exactly {isValid:
 * boolean}, synchronously or through a supported native Promise. Settlement
 * callbacks keep the EXISTING owner packet interface, not a new wire schema.
 * Use the existing result normalizer at a separately reviewed SDK boundary.
 *
 * Public methods: verifyOriginal(binding), attempt(binding), getSnapshot().
 * A matching declared true verification is required before attempt. Wrong
 * arity, foreign/missing/changed bindings and stage errors perform no callback.
 * Verification itself is admitted once, including false/throw/reject/unsafe
 * results; no reset/reverify/fallback exists. Busy precedes input inspection.
 * The original settlement owner alone controls first-call consumption, pending
 * observer budgets, terminality, publication declarations and one-positive
 * response behavior. It is constructed ONCE and never recreated or reset.
 *
 * This enforces byte-for-byte equality of DECLARED serializations only. It
 * neither parses/re-serializes them nor authenticates original HTTP or signed
 * transaction bytes. A verifier Boolean, this instance or its state is NOT a
 * signature proof, current context/funding/payer/provider/policy authority,
 * durable custody, restart recovery, provider READY or service-delivery proof.
 * Callbacks are trusted operational capabilities, NOT a sandbox/permission
 * to submit, sign, prepare or use a real observer. Indirect wrappers cannot be
 * classified as read-only here. Independent owner review remains required.
 *
 * No official SDK, active buyer, native/RPC/HTTP owner, storage, keys, nonce
 * search, payment signing/publication or real PREPARE is imported or added.
 * Original payment/request bytes/hash/payload/requirements/context and consumed
 * authority remain unchanged. VALIDATED possible exact-same-signed-block resend
 * remains separate from UNKNOWN/ACKNOWLEDGED; no replacement or re-signing right.
 *
 * Only captured native Promise mechanics observe verifier results. Snapshot a
 * fulfilled record inside the native reaction before await assimilation; never
 * inspect raw rejection reasons or a foreign .then. Unsafe returned rejections
 * must be prehandled by their owner. No timeout, hard lifetime, cancellation,
 * native cleanup or OS/network sandbox guarantee is provided. An indirect
 * dependency on this run can deadlock. Native intrinsics/loader/OS and unchanged
 * dependency behavior remain premises, not broad runtime qualification.
 */
export function createVerificationBoundSelectedSettlementContext(configuration) {
  let original, verify, owner;
  try {
    if (arguments.length !== 1 || !invariant()) fail('configuration_rejected');
    const c = record(configuration, CONFIG);
    original = freeze(record(c.original, BINDING));
    verify = callable(c.verifyOriginal);
    const first = callable(c.settleFirst);
    const observer = c.reconcilePending === null ? null : callable(c.reconcilePending);
    if (verify === first || verify === observer || (observer !== null && first === observer))
      fail('configuration_rejected');
    // Existing constructor supplies all original string/hash/network/budget
    // validation. No first or observer callback is invoked by construction.
    owner = CREATE_OWNER({
      original,
      settleFirst: binding => guarded(first, binding),
      reconcilePending: observer === null ? null : binding => guarded(observer, binding),
      maxPendingReconciliations: c.maxPendingReconciliations,
    });
  } catch { fail('configuration_rejected'); }
  const VERIFY = verify, ATTEMPT = owner.attempt, SNAPSHOT = owner.getSnapshot;
  let active = false, verification = 'NEW', verificationCalls = 0, originalVerification = null;
  configuration = null; verify = null; owner = null;

  async function runVerification(count, supplied) {
    if (active) fail('busy');
    if (verification !== 'NEW') fail('stage_rejected');
    if (count !== 1) fail('input_rejected');
    const input = matching(supplied);
    if (!invariant()) fail('operation_rejected');
    active = true; verification = 'VERIFYING'; verificationCalls++;
    try {
      // Fix/shield the public receipt before the borrowed verifier can reenter
      // or return that receipt as its own operation.
      await undefined;
      if (!invariant()) fail('operation_rejected');
      const value = apply(VERIFY, undefined, [input]);
      if (!invariant() || value === originalVerification) fail('operation_rejected');
      let observed;
      if (typeof value === 'object' && value !== null && !isProxy(value) && isPromise(value)) {
        if (!supportedPromise(value)) fail('operation_rejected');
        const bridge = apply(nativeThen, value, [captureVerification, () => receipt(false, false)]);
        observed = await shield(bridge);
      } else observed = captureVerification(value);
      if (!invariant() || !observed.accepted) fail('operation_rejected');
      verification = observed.isValid ? 'MATCHED_DECLARED_VALID' : 'DECLARED_INVALID';
      return observed.isValid;
    } catch {
      verification = 'UNKNOWN';
      fail('operation_rejected');
    } finally { active = false; }
  }

  async function runAttempt(count, supplied) {
    if (active) fail('busy');
    if (verification !== 'MATCHED_DECLARED_VALID') fail('stage_rejected');
    if (count !== 1) fail('input_rejected');
    const input = matching(supplied);
    if (!invariant()) fail('operation_rejected');
    active = true;
    try {
      const pending = apply(ATTEMPT, undefined, [input]);
      const result = await shield(pending); // Trusted captured owner returns a native Promise of a STRING.
      if (!invariant() || typeof result !== 'string') fail('operation_rejected');
      return result;
    } catch { fail('operation_rejected'); }
    finally { active = false; }
  }

  function matching(value) {
    const input = record(value, BINDING);
    for (const field of BINDING) if (input[field] !== original[field]) fail('input_rejected');
    return freeze(input);
  }

  return freeze({
    verifyOriginal: freeze(function verifyOriginal(binding) {
      const pending = shield(runVerification(arguments.length, binding));
      if (originalVerification === null && active && verification === 'VERIFYING')
        originalVerification = pending;
      return pending;
    }),
    attempt: freeze(function attempt(binding) { return shield(runAttempt(arguments.length, binding)); }),
    getSnapshot: freeze(function getSnapshot() {
      if (arguments.length !== 0 || !invariant()) fail('input_rejected');
      return freeze({
        verification, verificationCalls, inFlight: active,
        settlement: apply(SNAPSHOT, undefined, []),
        verificationEvidence: 'DECLARED_CALLBACK_BOOLEAN_ONLY',
        bindingScope: 'EXACT_DECLARED_SERIALIZED_CONTEXT_ONLY',
        persistence: 'MEMORY_ONLY', recoveryAuthority: 'NONE',
      });
    }),
  });
}

function guarded(callback, binding) {
  if (!invariant()) fail('operation_rejected');
  const value = apply(callback, undefined, [binding]);
  if (!invariant()) fail('operation_rejected');
  return value;
}
function captureVerification(value) {
  try {
    if (!invariant()) return receipt(false, false);
    const result = record(value, VERIFIED);
    if (typeof result.isValid !== 'boolean') return receipt(false, false);
    return receipt(true, result.isValid);
  } catch { return receipt(false, false); }
}
function receipt(accepted, isValid) {
  const result = create(null); put(result, 'accepted', accepted); put(result, 'isValid', isValid);
  return freeze(result);
}
function supportedPromise(value) {
  if (prototype(value) !== promisePrototype) return false;
  const c = descriptor(value, 'constructor');
  return c === undefined || (hasOwn(c, 'value') && c.value === NativePromise);
}
function callable(value) {
  if (typeof value !== 'function' || isProxy(value)) fail('configuration_rejected');
  return value;
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
function shield(value) { put(value, 'constructor', NativePromise, false); return value; }
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
  const d = create(null); d.value = content; d.enumerable = enumerable; d.writable = false; d.configurable = false;
  define(value, key, d);
}
function fail(kind) {
  const code = 'verification_bound_settlement_' + kind;
  const error = kind === 'busy' ? new ErrorType(code) : new TypeErrorType(code);
  put(error, 'code', code); put(error, 'stack', (kind === 'busy' ? 'Error: ' : 'TypeError: ') + code, false);
  throw freeze(error);
}
