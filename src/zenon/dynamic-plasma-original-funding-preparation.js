import { types as utilTypes } from 'node:util';
import { canonicalJson } from '../canonical.js';
import { preflightZenonPayment } from '../zenon-payment.js';
import { ZenonFundingPayerRecoverySqliteStore } from '../service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js';
import { encodeOriginalPaymentCheckpoint } from '../service-credit-pilot-original-payment-checkpoint.js';
import {
  createObservedBalanceDeadlineBoundMaterialWalletCandidatePreparer,
  createObservedBalanceDeadlineBoundMaterialRetainedCandidatePreparer,
} from './dynamic-plasma-observed-balance-deferred-material-planner.js';
import { claimZenonDynamicPlasmaOriginalFundingStore } from './dynamic-plasma-original-funding-store-claim.js';
import {
  captureZenonDynamicPlasmaOriginalFundingInput,
  assembleZenonDynamicPlasmaOriginalFundingData,
  retainCapturedZenonDynamicPlasmaOriginalFundingInputV2,
  assembleZenonDynamicPlasmaOriginalFundingDataV2,
  snapshotZenonDynamicPlasmaOriginalFundingPins,
} from './dynamic-plasma-original-funding-data.js';

const CREATE_PREPARER = createObservedBalanceDeadlineBoundMaterialWalletCandidatePreparer;
const CREATE_RETAINED_PREPARER = createObservedBalanceDeadlineBoundMaterialRetainedCandidatePreparer;
const CLAIM_STORE = claimZenonDynamicPlasmaOriginalFundingStore;
const CAPTURE = captureZenonDynamicPlasmaOriginalFundingInput;
const ASSEMBLE = assembleZenonDynamicPlasmaOriginalFundingData;
const CAPTURE_V2 = retainCapturedZenonDynamicPlasmaOriginalFundingInputV2;
const ASSEMBLE_V2 = assembleZenonDynamicPlasmaOriginalFundingDataV2;
const PINS = snapshotZenonDynamicPlasmaOriginalFundingPins;
const PREFLIGHT = preflightZenonPayment, CANONICAL = canonicalJson;
const ENCODE_CHECKPOINT = encodeOriginalPaymentCheckpoint;
const FREEZE = Object.freeze, CREATE = Object.create, DEFINE = Object.defineProperty;
const DESCRIPTOR = Object.getOwnPropertyDescriptor, PROTOTYPE = Object.getPrototypeOf, HAS = Object.hasOwn;
const KEYS = Reflect.ownKeys, APPLY = Reflect.apply;
const IS_PROXY = utilTypes.isProxy, IS_PROMISE = utilTypes.isPromise;
const OBJECT = Object.prototype, ARRAY = Array.prototype;
const NativePromise = Promise, PROMISE = NativePromise.prototype, SPECIES = Symbol.species;
const CONSTRUCTOR_DESCRIPTOR = DESCRIPTOR(PROMISE, 'constructor');
const SPECIES_DESCRIPTOR = DESCRIPTOR(NativePromise, SPECIES);
const ErrorType = TypeError, BusyError = Error;
const STORE_PROTOTYPE = ZenonFundingPayerRecoverySqliteStore.prototype;
const STORE_RESOURCE = DESCRIPTOR(STORE_PROTOTYPE, 'resourceUrl')?.get;
const STORE_LOAD = DESCRIPTOR(STORE_PROTOTYPE, 'load')?.value;
const STORE_PREPARE = DESCRIPTOR(STORE_PROTOTYPE, 'prepareWithOriginalPaymentCheckpoint')?.value;
const STORE_CHECKPOINT = DESCRIPTOR(STORE_PROTOTYPE, 'getOriginalPaymentCheckpoint')?.value;

/**
 * SOURCE IMPLEMENTATION: real SDK/preflight + native V6 composition has NOT
 * been qualified by data-only tests or syntax checking. Default-off, no active
 * buyer cutover, store open/create/migration, transport or automatic recovery.
 * Importing this module loads the real native store module; it is NOT the
 * SDK/SQL-free data library. Do not run it under a source/data-only permission.
 *
 * Borrow one caller-owned, already opened V6 store for EXCLUSIVE use until this
 * operation settles. Its independent resource owner retains lifetime/close,
 * quarantine and restart duties. The store's own captured prototype methods
 * enforce its actual profile/transactions. No caller-supplied validator, store
 * writer, preparer factory or replacement-wallet callback is substituted.
 * The configured wallet/read/material capabilities remain operational trust
 * premises, not consent inferred from DATA or a hard lifetime/cycle sandbox.
 * They must not depend on this owner's public preparation Promise. Unresolved
 * or indirect callback dependencies still require their owner to stop/hold.
 * This module's store-object claim also refuses a second local owner of the
 * same store instance before any wallet/read operation. It never releases on
 * failure or close. It is NOT a DB-path, cross-namespace or restart fence.
 *
 * prepareOriginalFunding captures originals -> rejects an occupied store ->
 * calls the actual context-v6 candidate preparer -> encodes the original wire
 * and checkpoint -> awaits the REAL cryptographic payment preflight. It does
 * NOT write the DB or expose a createPaymentPayload/dispatch interface.
 *
 * The caller must durably retain the returned pins independently of the DB
 * before commitOriginalFunding({expectedPins}). Matching pins are DATA
 * consistency, NOT proof that the caller actually retained them durably.
 * One commit attempt invokes the actual V6 atomic method and readback. A throw
 * after entering that method is UNKNOWN here even if it may have committed.
 * Never retry, re-sign, replace, reopen, reset or publish automatically. Keep
 * the original packet/candidate inspectable in this volatile owner instead.
 * Successful local readback is neither crash qualification nor payer/provider,
 * network, dispatch, delivery, inclusion or economic-pilot authority.
 */
export function createZenonDynamicPlasmaOriginalFundingPreparation(configuration) {
  if (arguments.length !== 1) fail('configuration_rejected');
  return createPreparation(configuration, false);
}

/**
 * SOURCE-ONLY v2 owner: hardwire contextv7, actual preflight and ONE retained
 * candidate current read AFTER independent pins, immediately BEFORE entering
 * the existing V6 atomic custody method. No reassembly, re-signing, re-quote,
 * replacement, new owner or retry on refusal. The old v1 entry stays on v6.
 * Neither pure DATA tests nor the contextv7 component result qualifies this
 * SDK/signature/SQLite composition. Do not import it in DATA-only tests.
 */
export function createZenonDynamicPlasmaOriginalFundingPreparationV2(configuration) {
  if (arguments.length !== 1) fail('configuration_rejected');
  return createPreparation(configuration, true);
}

function createPreparation(configuration, retainedValidationEnabled) {
  let preparer, resource, store;
  try {
    if (!invariant()) fail('configuration_rejected');
    const input = record(configuration, ['preparerOptions', 'store', 'fundingResourceUrl']);
    store = input.store;
    if (typeof store !== 'object' || store === null || IS_PROXY(store)
        || PROTOTYPE(store) !== STORE_PROTOTYPE
        || typeof input.fundingResourceUrl !== 'string') fail('configuration_rejected');
    for (const method of [STORE_RESOURCE, STORE_LOAD, STORE_PREPARE, STORE_CHECKPOINT])
      if (typeof method !== 'function' || IS_PROXY(method)) fail('configuration_rejected');
    resource = APPLY(STORE_RESOURCE, store, []);
    if (resource !== input.fundingResourceUrl) fail('configuration_rejected');
    preparer = (retainedValidationEnabled ? CREATE_RETAINED_PREPARER : CREATE_PREPARER)(input.preparerOptions);
    // Finish non-operational checks first; no reset or released claim exists.
    CLAIM_STORE(store);
  } catch { fail('configuration_rejected'); }
  const STORE = store, RESOURCE = resource;
  const PREPARE_CANDIDATE = preparer.prepareSignedCandidate;
  const INSPECT_CANDIDATE = preparer.getSignedOriginalData;
  const REVALIDATE_CANDIDATE = retainedValidationEnabled ? preparer.revalidateSignedOriginal : null;
  const CAPTURE_INPUT = retainedValidationEnabled ? CAPTURE_V2 : CAPTURE;
  const ASSEMBLE_DATA = retainedValidationEnabled ? ASSEMBLE_V2 : ASSEMBLE;
  let used = false, active = false, phase = 'IDLE', packet = null, originals = null;
  let preflightPassed = false, commitAttempts = 0, storeEntered = false, storeReturned = false;
  let originalUnsignedJson = null, preSignCheckpointJson = null;
  let preCustodyRevalidationAttempts = 0, preCustodyRevalidationPassed = false;
  configuration = null; store = null; resource = null; preparer = null;

  async function prepare(count, incoming) {
    if (active) fail('busy');
    if (used) fail('used');
    if (count !== 1) fail('input_rejected');
    used = true; active = true; phase = 'PREPARING';
    try {
      if (!invariant()) fail('operation_rejected');
      // V2 may reuse only a fully detached immutable capture from the DATA
      // module. Actual reads, signing and pre-custody revalidation stay below.
      originals = CAPTURE_INPUT(incoming, RESOURCE);
      await undefined;
      if (!invariant() || APPLY(STORE_LOAD, STORE, []) !== null) fail('occupied_or_unusable_store');
      const candidate = await APPLY(PREPARE_CANDIDATE, undefined, [originals.plannerContext]);
      if (!invariant()) fail('operation_rejected');
      packet = ASSEMBLE_DATA(originals, {
        originalUnsignedBlock: candidate.originalUnsignedBlock, accountBlock: candidate.accountBlock,
      }, RESOURCE);
      if (retainedValidationEnabled) {
        originalUnsignedJson = CANONICAL(value(candidate, 'originalUnsignedBlock'));
        preSignCheckpointJson = value(candidate, 'preSignCheckpointJson');
      }
      const checked = await PREFLIGHT(packet.paymentPayload, packet.requirement, packet.paymentRequired);
      if (!invariant() || value(checked, 'transactionHash') !== packet.transactionHash
          || value(checked, 'intentDigest') !== packet.paymentPayload.payload.intentDigest
          || CANONICAL(value(checked, 'signedAccountBlock')) !== CANONICAL(packet.paymentPayload.payload.transaction))
        fail('operation_rejected');
      preflightPassed = true; phase = 'AWAITING_INDEPENDENT_PINS';
      return FREEZE({ originalFundingPreparationVersion: retainedValidationEnabled ? 2 : 1, phase,
        packet, preflight: 'ACTUAL_LOCAL_PREFLIGHT_RETURNED', persistence: 'NOT_PERFORMED', authority: 'NONE' });
    } catch {
      phase = 'PREPARE_REFUSED';
      fail('prepare_refused');
    } finally { active = false; }
  }
  async function commit(count, incoming) {
    if (active) fail('busy');
    if (phase !== 'AWAITING_INDEPENDENT_PINS' || !preflightPassed || commitAttempts !== 0) fail('commit_unavailable');
    if (count !== 1) fail('input_rejected');
    active = true; commitAttempts = 1; phase = 'COMMITTING';
    try {
      if (!invariant()) fail('operation_rejected');
      const pins = PINS(packet.serializedCheckpoint, record(incoming, ['expectedPins']).expectedPins);
      await undefined;
      if (!invariant()) fail('operation_rejected');
      if (retainedValidationEnabled) {
        preCustodyRevalidationAttempts = 1; phase = 'REVALIDATING_BEFORE_COMMIT';
        const checked = await APPLY(REVALIDATE_CANDIDATE, undefined, []);
        if (!invariant() || value(checked, 'observedSignedCandidateVersion') !== 2
            || value(checked, 'validationPurpose') !== 'BEFORE_ORIGINAL_SIGNED_CUSTODY'
            || value(checked, 'signing') !== 'NOT_INVOKED'
            || value(checked, 'candidateFieldValidation') !== 'MATCHES_CAPTURED_ORIGINAL'
            || value(checked, 'preSignCheckpointJson') !== preSignCheckpointJson
            || CANONICAL(value(checked, 'originalUnsignedBlock')) !== originalUnsignedJson
            || CANONICAL(value(checked, 'accountBlock')) !== CANONICAL(packet.paymentPayload.payload.transaction))
          fail('operation_rejected');
        preCustodyRevalidationPassed = true; phase = 'COMMITTING';
      }
      // No await, wallet, encoder or caller callback between this gate and the
      // captured atomic store entry. The read itself remains non-atomic DATA.
      storeEntered = true;
      const stored = APPLY(STORE_PREPARE, STORE, [{ pair: packet.pair,
        serializedCheckpoint: packet.serializedCheckpoint, expectedPins: pins }]);
      if (!invariant() || IS_PROMISE(stored) || value(stored, 'status') !== 'PREPARED'
          || value(stored, 'ambiguityLatched') !== false || value(stored, 'revision') !== 1
          || value(stored, 'resourceUrl') !== RESOURCE
          || value(stored, 'challengeHeader') !== packet.pair.challenge.paymentRequiredHeader
          || value(stored, 'paymentHeader') !== packet.pair.paymentSignatureHeader) fail('operation_rejected');
      storeReturned = true;
      const checkpoint = APPLY(STORE_CHECKPOINT, STORE, [pins]);
      if (!invariant() || ENCODE_CHECKPOINT(checkpoint) !== packet.serializedCheckpoint) fail('operation_rejected');
      phase = 'LOCAL_STORE_READBACK_MATCHED';
      const result = { originalFundingCommitVersion: retainedValidationEnabled ? 2 : 1, phase, transactionHash: packet.transactionHash,
        pair: packet.pair, expectedPins: pins, signatureValidation: 'ACTUAL_LOCAL_PREFLIGHT_RETURNED',
        crashDurability: 'NOT_QUALIFIED', publication: 'NOT_PERFORMED', authority: 'NONE' };
      if (retainedValidationEnabled) put(result, 'preCustodyRevalidation', 'SAME_ORIGINAL_CURRENT_READ_VALIDATED');
      return FREEZE(result);
    } catch {
      phase = storeEntered ? 'COMMIT_OUTCOME_UNKNOWN' : 'HELD_BEFORE_COMMIT';
      fail('commit_unknown_or_refused');
    } finally { active = false; }
  }
  function inspectOriginalFunding() {
    if (arguments.length !== 0 || !invariant()) fail('input_rejected');
    const result = { originalFundingInspectionVersion: retainedValidationEnabled ? 2 : 1, phase, active, used,
      originals, packet, candidate: APPLY(INSPECT_CANDIDATE, undefined, []), preflightPassed,
      commitAttempts, storeEntered, storeReturned, authority: 'NONE',
      publication: 'NOT_PERFORMED', externalStoreLifetime: 'CALLER_OWNED' };
    if (retainedValidationEnabled) {
      put(result, 'preCustodyRevalidationAttempts', preCustodyRevalidationAttempts);
      put(result, 'preCustodyRevalidationPassed', preCustodyRevalidationPassed);
    }
    return FREEZE(result);
  }
  return FREEZE({
    prepareOriginalFunding: FREEZE(function prepareOriginalFunding(input) { return shield(prepare(arguments.length, input)); }),
    commitOriginalFunding: FREEZE(function commitOriginalFunding(input) { return shield(commit(arguments.length, input)); }),
    inspectOriginalFunding: FREEZE(inspectOriginalFunding),
  });
}
function record(input, fields) {
  if (typeof input !== 'object' || input === null || IS_PROXY(input)
      || PROTOTYPE(input) !== OBJECT || KEYS(input).length !== fields.length) fail('input_rejected');
  const out = CREATE(OBJECT);
  for (const field of fields) put(out, field, value(input, field));
  return FREEZE(out);
}
function value(input, field) {
  if (typeof input !== 'object' || input === null || IS_PROXY(input)) fail('input_rejected');
  const d = DESCRIPTOR(input, field);
  if (!d || !d.enumerable || !HAS(d, 'value')) fail('input_rejected');
  return d.value;
}
function shield(promise) { put(promise, 'constructor', NativePromise, false); return promise; }
function invariant() {
  return DESCRIPTOR(OBJECT, 'then') === undefined && DESCRIPTOR(OBJECT, 'toJSON') === undefined
    && DESCRIPTOR(ARRAY, 'toJSON') === undefined
    && sameDescriptor(DESCRIPTOR(PROMISE, 'constructor'), CONSTRUCTOR_DESCRIPTOR)
    && sameDescriptor(DESCRIPTOR(NativePromise, SPECIES), SPECIES_DESCRIPTOR);
}
function sameDescriptor(actual, expected) {
  if (!actual || !expected || KEYS(actual).length !== KEYS(expected).length) return false;
  for (const key of KEYS(expected)) if (!HAS(actual, key) || actual[key] !== expected[key]) return false;
  return true;
}
function put(target, key, content, enumerable = true) {
  const d = CREATE(null); d.value = content; d.enumerable = enumerable;
  d.writable = false; d.configurable = false; DEFINE(target, key, d);
}
function fail(kind) {
  const code = 'zenon_dynamic_plasma_original_funding_preparation_' + kind;
  const error = kind === 'busy' ? new BusyError(code) : new ErrorType(code);
  put(error, 'code', code); put(error, 'stack', (kind === 'busy' ? 'Error: ' : 'TypeError: ') + code, false);
  throw FREEZE(error);
}
