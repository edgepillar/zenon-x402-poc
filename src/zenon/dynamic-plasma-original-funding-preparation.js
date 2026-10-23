import { types as utilTypes } from 'node:util';
import { canonicalJson } from '../canonical.js';
import { preflightZenonPayment } from '../zenon-payment.js';
import { ZenonFundingPayerRecoverySqliteStore } from '../service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js';
import { encodeOriginalPaymentCheckpoint } from '../service-credit-pilot-original-payment-checkpoint.js';
import { createObservedBalanceDeadlineBoundMaterialWalletCandidatePreparer } from './dynamic-plasma-observed-balance-deferred-material-planner.js';
import {
  captureZenonDynamicPlasmaOriginalFundingInput,
  assembleZenonDynamicPlasmaOriginalFundingData,
  snapshotZenonDynamicPlasmaOriginalFundingPins,
} from './dynamic-plasma-original-funding-data.js';

const CREATE_PREPARER = createObservedBalanceDeadlineBoundMaterialWalletCandidatePreparer;
const CAPTURE = captureZenonDynamicPlasmaOriginalFundingInput;
const ASSEMBLE = assembleZenonDynamicPlasmaOriginalFundingData;
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
  let preparer, resource, store;
  try {
    if (arguments.length !== 1 || !invariant()) fail('configuration_rejected');
    const input = record(configuration, ['preparerOptions', 'store', 'fundingResourceUrl']);
    store = input.store;
    if (typeof store !== 'object' || store === null || IS_PROXY(store)
        || PROTOTYPE(store) !== STORE_PROTOTYPE
        || typeof input.fundingResourceUrl !== 'string') fail('configuration_rejected');
    for (const method of [STORE_RESOURCE, STORE_LOAD, STORE_PREPARE, STORE_CHECKPOINT])
      if (typeof method !== 'function' || IS_PROXY(method)) fail('configuration_rejected');
    resource = APPLY(STORE_RESOURCE, store, []);
    if (resource !== input.fundingResourceUrl) fail('configuration_rejected');
    preparer = CREATE_PREPARER(input.preparerOptions);
  } catch { fail('configuration_rejected'); }
  const STORE = store, RESOURCE = resource;
  const PREPARE_CANDIDATE = preparer.prepareSignedCandidate;
  const INSPECT_CANDIDATE = preparer.getSignedOriginalData;
  let used = false, active = false, phase = 'IDLE', packet = null, originals = null;
  let preflightPassed = false, commitAttempts = 0, storeEntered = false, storeReturned = false;
  configuration = null; store = null; resource = null; preparer = null;

  async function prepare(count, incoming) {
    if (active) fail('busy');
    if (used) fail('used');
    if (count !== 1) fail('input_rejected');
    used = true; active = true; phase = 'PREPARING';
    try {
      if (!invariant()) fail('operation_rejected');
      originals = CAPTURE(incoming, RESOURCE);
      await undefined;
      if (!invariant() || APPLY(STORE_LOAD, STORE, []) !== null) fail('occupied_or_unusable_store');
      const candidate = await APPLY(PREPARE_CANDIDATE, undefined, [originals.plannerContext]);
      if (!invariant()) fail('operation_rejected');
      packet = ASSEMBLE(originals, {
        originalUnsignedBlock: candidate.originalUnsignedBlock, accountBlock: candidate.accountBlock,
      }, RESOURCE);
      const checked = await PREFLIGHT(packet.paymentPayload, packet.requirement, packet.paymentRequired);
      if (!invariant() || value(checked, 'transactionHash') !== packet.transactionHash
          || value(checked, 'intentDigest') !== packet.paymentPayload.payload.intentDigest
          || CANONICAL(value(checked, 'signedAccountBlock')) !== CANONICAL(packet.paymentPayload.payload.transaction))
        fail('operation_rejected');
      preflightPassed = true; phase = 'AWAITING_INDEPENDENT_PINS';
      return FREEZE({ originalFundingPreparationVersion: 1, phase,
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
      return FREEZE({ originalFundingCommitVersion: 1, phase, transactionHash: packet.transactionHash,
        pair: packet.pair, expectedPins: pins, signatureValidation: 'ACTUAL_LOCAL_PREFLIGHT_RETURNED',
        crashDurability: 'NOT_QUALIFIED', publication: 'NOT_PERFORMED', authority: 'NONE' });
    } catch {
      phase = storeEntered ? 'COMMIT_OUTCOME_UNKNOWN' : 'HELD_BEFORE_COMMIT';
      fail('commit_unknown_or_refused');
    } finally { active = false; }
  }
  function inspectOriginalFunding() {
    if (arguments.length !== 0 || !invariant()) fail('input_rejected');
    return FREEZE({ originalFundingInspectionVersion: 1, phase, active, used,
      originals, packet, candidate: APPLY(INSPECT_CANDIDATE, undefined, []), preflightPassed,
      commitAttempts, storeEntered, storeReturned, authority: 'NONE',
      publication: 'NOT_PERFORMED', externalStoreLifetime: 'CALLER_OWNED' });
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
