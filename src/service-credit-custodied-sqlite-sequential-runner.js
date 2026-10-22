import { Buffer } from 'node:buffer';
import { dirname, isAbsolute, resolve } from 'node:path';
import { types as utilTypes } from 'node:util';
import {
  openServiceCreditCustodiedSqliteHttpClient,
  openServiceCreditCustodiedSqliteHttpClientV3,
  openServiceCreditCustodiedSqliteHttpClientV4,
} from './service-credit-custodied-sqlite-http-client.js';
import {
  snapshotOriginalServiceRequestCustodyPolicy,
  snapshotOriginalServiceRequestCustodyKey,
  serializeOriginalServiceRequestCustody,
  serializeOriginalServiceDispatchIntent,
} from './service-credit-original-request-custody-contract.js';
import {
  createServiceCreditPilotClientPlan,
} from './service-credit-pilot-client-plan.js';
import {
  createServiceCreditCustodiedRecoveryCollectionCore,
} from './service-credit-custodied-recovery-collection-core.js';
import {
  createServiceCreditCustodiedRecoveryObservationCollectionCore,
} from './service-credit-custodied-recovery-observation-collection-core.js';
import {
  createServiceCreditCustodiedSequentialRunnerCore,
  exact,
  safePromise,
  failure,
} from './service-credit-custodied-sequential-runner-core.js';

const APPLY = Reflect.apply;
const FREEZE = Object.freeze;
const IS = Object.is;
const IS_SAFE = Number.isSafeInteger;
const IS_PROXY = utilTypes.isProxy;
const BYTE_LENGTH = Buffer.byteLength;
const INCLUDES = String.prototype.includes;
const DIRNAME = dirname;
const IS_ABSOLUTE = isAbsolute;
const RESOLVE = resolve;
const OPEN_OWNED = openServiceCreditCustodiedSqliteHttpClient;
const OPEN_OWNED_V3 = openServiceCreditCustodiedSqliteHttpClientV3;
const OPEN_OWNED_V4 = openServiceCreditCustodiedSqliteHttpClientV4;
const CREATE_CORE = createServiceCreditCustodiedSequentialRunnerCore;
const POLICY = snapshotOriginalServiceRequestCustodyPolicy;
const KEY = snapshotOriginalServiceRequestCustodyKey;
const SERIALIZE = serializeOriginalServiceRequestCustody;
const SERIALIZE_INTENT = serializeOriginalServiceDispatchIntent;
const STRINGIFY = JSON.stringify;
const CREATE_PLAN = createServiceCreditPilotClientPlan;
const CREATE_COLLECTION = createServiceCreditCustodiedRecoveryCollectionCore;
const CREATE_OBSERVATION_COLLECTION = createServiceCreditCustodiedRecoveryObservationCollectionCore;
const CONFIG_FIELDS = FREEZE([
  'databasePath', 'allowedRoot', 'fundingResourceUrl', 'custodyPolicy',
  'selectedGrantId', 'requestImpl', 'deadlineMs',
]);

/**
 * One sequential batch bound to one actual EXISTING V2 SQLite HTTP client.
 * Source-only owned binding: SQLite integration remains NOT_RUN.
 *
 * The seven explicit configuration fields have no defaults or mode switch.
 * Pure shape, path, policy and selected-key checks precede acquisition. Only
 * the existing owned client acquires its store and resource slot. This module
 * neither creates another borrowed owner nor creates, migrates, initializes,
 * recovers, funds, resets or directly closes a store.
 *
 * The shared core receives captured actual operations and adapts only the
 * owned snapshot's client member. Normal run and close methods are the core's
 * exact functions. close returns the actual owned root's cached Promise,
 * through the unchanged at-most-once core path, without an async wrapper.
 * Manual close therefore fences admission and queued-next synchronously.
 *
 * readOriginal is the actual owned root's frozen synchronous recovery DATA
 * function. It neither dispatches/replays nor establishes current authority.
 * Reopening a new runner here is same-process reuse, not process restart.
 *
 * createOriginalRecoveryPlan is an opt-in diagnostic connection to that same
 * captured read. It binds the complete validated canonical custody envelope
 * (at most 16384 bytes/units) and derives only paymentHash/requestId identity.
 * Each live observe/getSnapshot rechecks that envelope through the actual root
 * before delegating; root read failures propagate without retry or wrapping.
 * Observations remain explicit DECLARED data under the existing pure planner.
 * No BOUND/read/checksum/callback/close outcome supplies funding or authority.
 * Local plan close calls only the diagnostic planner, clears its read/key/full
 * envelope references and leaves root close ownership and Promise unchanged.
 * Closed plan snapshots are detached historical diagnostics, never authority.
 * This new connection and its separate fixture remain DRAFT / NOT_RUN.
 *
 * createOriginalRecoveryStatePlan couples declared diagnostics to the same
 * captured owned recovery-state read, complete canonical envelope and observed
 * nonregressing funding revision. Raw current UNKNOWN, this plan's observed
 * UNKNOWN latch and persisted historical ambiguity remain distinct. No declared
 * success promotes those local observations into authority. Its local close
 * detaches one cached historical snapshot without closing the owned runner.
 * This additive state-bound connection and its separate fixture are NOT_RUN.
 *
 * Acquisition errors propagate unchanged. If composition fails after a root
 * was returned, no caller has received a submit-capable facade. Cleanup calls
 * that original root close once and observes its original Promise. Rejection
 * or unobservable/HELD state is never described as release and never retried.
 *
 * Snapshots expose only the actual root's redacted resource/close observations
 * and the shared runner's redacted observation. A returned DB close is separate
 * from child uncertainty. The core's legacy synthetic-interface label is no
 * qualification of this changed graph, the backend or the owned composition.
 *
 * Captured pristine intrinsics, current private components, native Promises,
 * synchronous native store close and independent caller transport lifecycle
 * remain premises. No persistence, restart, current authority, real READY,
 * service delivery, OS cleanup or pilot qualification is established.
 */
export async function openServiceCreditCustodiedSqliteSequentialRunner(configuration) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return openRunner(configuration, false);
}
export async function openServiceCreditCustodiedSqliteSequentialRunnerV3(configuration) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return openRunner(configuration, true);
}
/**
 * Explicit existing-store V4 connection through the actual owned V4 HTTP
 * client. The queue, one-shot receipt and close machinery are reused unchanged;
 * only the additional ownership label is accepted by the shared core. Existing
 * scoped recovery reads/plans remain metadata, never resend or payment authority.
 * A released DB slot does not clear persisted quarantine or child uncertainty.
 * No create fallback, migration, default runner adoption or real restart proof.
 */
export async function openServiceCreditCustodiedSqliteSequentialRunnerV4(configuration) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return openRunner(configuration, true, true);
}
async function openRunner(configuration, dispatchIntentEnabled, persistentCustody = false) {

  let input, policy, selected;
  try {
    input = exact(configuration, CONFIG_FIELDS);
    if (typeof input.requestImpl !== 'function' || IS_PROXY(input.requestImpl)
        || !IS_SAFE(input.deadlineMs) || input.deadlineMs < 1
        || input.deadlineMs > 60000 || IS(input.deadlineMs, -0)) {
      throw failure('INVALID_CONFIGURATION');
    }
    pathText(input.databasePath);
    pathText(input.allowedRoot);
    if (!IS_ABSOLUTE(input.databasePath) || !IS_ABSOLUTE(input.allowedRoot)
        || RESOLVE(input.databasePath) !== input.databasePath
        || RESOLVE(input.allowedRoot) !== input.allowedRoot
        || DIRNAME(input.databasePath) !== input.allowedRoot
        || input.databasePath === input.allowedRoot) {
      throw failure('INVALID_CONFIGURATION');
    }
    policy = POLICY(input.custodyPolicy, input.fundingResourceUrl);
    selected = KEY({ grantId: input.selectedGrantId, requestId: 'scope' });
    input.custodyPolicy = policy;
    input.selectedGrantId = selected.grantId;
  } catch {
    input = null;
    policy = null;
    selected = null;
    configuration = null;
    throw failure('INVALID_CONFIGURATION');
  }

  const selectedGrantId = selected.grantId;
  let root;
  // This call is intentionally outside the configuration/composition catches.
  // The actual owner's ACQUISITION_HELD/RESOURCE_HELD and other refusals retain
  // their original meaning. An absent returned root is not ours to release.
  try {
    root = (persistentCustody ? OPEN_OWNED_V4
      : dispatchIntentEnabled ? OPEN_OWNED_V3 : OPEN_OWNED)(input);
  } finally {
    input = null;
    policy = null;
    selected = null;
    configuration = null;
  }

  let ROOT_CLOSE = null;
  let ROOT_SNAPSHOT = null;
  try {
    ROOT_CLOSE = root.close;
    ROOT_SNAPSHOT = root.snapshot;
    const ROOT_SUBMIT = root.submitOriginal;
    const ROOT_READ = root.readOriginal;
    const ROOT_READ_RECOVERY_STATE = root.readOriginalRecoveryState;
    const ROOT_READ_RECOVERY_KEYS = dispatchIntentEnabled ? root.readOriginalRecoveryKeys : null;
    const runner = CREATE_CORE({
      submitOriginal: ROOT_SUBMIT,
      snapshot: () => ROOT_SNAPSHOT().client,
      close: ROOT_CLOSE,
      selectedGrantId,
      storeOwnership: persistentCustody ? 'OWNED_EXISTING_V4_CUSTODY_QUARANTINE'
        : dispatchIntentEnabled ? 'OWNED_EXISTING_V3_DISPATCH_INTENT' : 'OWNED_EXISTING_V2',
    });
    const RUNNER_SNAPSHOT = runner.snapshot;

    function createOriginalRecoveryPlan(key, initialObservationJson) {
      if (arguments.length !== 2) throw failure('INVALID_INPUT');
      // Every V3 plan includes actual persisted service-reconciliation metadata.
      if (dispatchIntentEnabled) return createOriginalRecoveryStatePlan(key, initialObservationJson);
      let boundKey, envelopeJson, declared, original;
      let readActual = ROOT_READ;
      try {
        boundKey = KEY(key);
        original = readActual(boundKey);
        if (original === null) throw failure('ORIGINAL_NOT_FOUND');
        // The actual root returns a validated custody record. This serializer
        // binds the complete canonical envelope, including exact request bytes.
        envelopeJson = SERIALIZE(original);
        declared = CREATE_PLAN(STRINGIFY({
          viewVersion: 1,
          paymentHash: original.paymentHash,
          requestId: original.requestId,
        }), initialObservationJson);
      } finally {
        key = null;
        initialObservationJson = null;
        original = null;
      }

      const PLAN_OBSERVE = declared.observe;
      const PLAN_GET = declared.getSnapshot;
      const PLAN_CLOSE = declared.close;
      declared = null;
      let locallyClosed = false;

      function requireOriginal() {
        let current;
        try {
          current = readActual(boundKey);
          if (current === null || SERIALIZE(current) !== envelopeJson) {
            throw failure('ORIGINAL_BINDING_CHANGED');
          }
        } finally {
          current = null;
        }
      }

      function observe(...args) {
        // Preserve the declared planner's arity/closed errors without a read.
        if (args.length === 1 && !locallyClosed) requireOriginal();
        return APPLY(PLAN_OBSERVE, undefined, args);
      }

      function getSnapshot(...args) {
        if (args.length === 0 && !locallyClosed) requireOriginal();
        return APPLY(PLAN_GET, undefined, args);
      }

      function close(...args) {
        const snapshot = APPLY(PLAN_CLOSE, undefined, args);
        locallyClosed = true;
        readActual = null;
        boundKey = null;
        envelopeJson = null;
        return snapshot;
      }

      return FREEZE({
        observe: FREEZE(observe),
        getSnapshot: FREEZE(getSnapshot),
        close: FREEZE(close),
      });
    }

    function createOriginalRecoveryStatePlan(key, initialObservationJson) {
      if (arguments.length !== 2) throw failure('INVALID_INPUT');
      let readActual = ROOT_READ_RECOVERY_STATE;
      let boundKey = null, envelopeJson = null, initial = null, declared = null;
      let fundingRevision = 0, fundingJson = null, observedFundingUncertain = false;
      let intentEnvelopeJson = null;
      let locallyClosed = false, lastSnapshot = null, lastCoupled = null;
      try {
        // The actual root owns key/error precedence and validates the frozen
        // projection. Envelope and complete funding revision binding are added here.
        initial = readCoupled(key, true);
        const original = initial.recoveryState.original;
        boundKey = KEY({ grantId: original.grantId, requestId: original.requestId });
        envelopeJson = initial.envelopeJson;
        declared = CREATE_PLAN(STRINGIFY({
          viewVersion: 1,
          paymentHash: original.paymentHash,
          requestId: original.requestId,
        }), initialObservationJson);
      } finally {
        key = null;
        initialObservationJson = null;
      }

      const PLAN_OBSERVE = declared.observe;
      const PLAN_GET = declared.getSnapshot;
      const PLAN_CLOSE = declared.close;
      declared = null;
      commit(initial, APPLY(PLAN_GET, undefined, []), false);
      initial = null;

      function readCoupled(value, first) {
        const recoveryState = readActual(value);
        if (recoveryState === null) {
          throw failure(first ? 'ORIGINAL_NOT_FOUND' : 'ORIGINAL_BINDING_CHANGED');
        }
        const text = SERIALIZE(recoveryState.original);
        if (!first && text !== envelopeJson) throw failure('ORIGINAL_BINDING_CHANGED');
        const revision = recoveryState.funding.revision;
        if (!first && revision < fundingRevision) {
          throw failure('FUNDING_REVISION_REGRESSION');
        }
        const fundingText = STRINGIFY(recoveryState.funding);
        if (!first && revision === fundingRevision && fundingText !== fundingJson) {
          throw failure('FUNDING_REVISION_BINDING_CHANGED');
        }
        const current = recoveryState.funding.status === 'OUTCOME_UNKNOWN';
        const observed = observedFundingUncertain || current;
        const uncertainty = recoveryState.uncertainty;
        let nextStep = current ? 'RECONCILE_EXISTING_FUNDING'
          : uncertainty.custody || uncertainty.submission || uncertainty.undrained
            ? 'REVIEW_OWNED_RECOVERY_STATE'
            : observed ? 'REVIEW_PRIOR_FUNDING_UNCERTAINTY'
              : recoveryState.funding.ambiguityLatched
                || uncertainty.declaredFundingAmbiguitySeen
                ? 'REVIEW_HISTORICAL_FUNDING_AMBIGUITY'
                : 'REVIEW_CURRENT_AUTHORITY_FOR_ORIGINAL';
        let intentText = null;
        if (dispatchIntentEnabled) {
          const intent = recoveryState.dispatchIntent;
          intentText = intent === null ? null : SERIALIZE_INTENT(intent);
          if (recoveryState.dispatchStatus !== (intent === null
            ? 'NO_INTENT_RECORDED' : 'POSSIBLY_ATTEMPTED')
              || (!first && intentEnvelopeJson !== null && intentText !== intentEnvelopeJson)) {
            throw failure('DISPATCH_INTENT_BINDING_CHANGED');
          }
          if (intent !== null) nextStep = 'RECONCILIATION_REQUIRED';
        }
        const candidate = { recoveryState, envelopeJson: text, revision, current, observed, nextStep, intentText };
        // Retain complete validated owned history even if declared input rejects.
        fundingRevision = revision;
        fundingJson = fundingText;
        observedFundingUncertain = observed;
        if (dispatchIntentEnabled) intentEnvelopeJson = intentText;
        lastCoupled = candidate;
        return candidate;
      }

      function commit(candidate, declaredPlan, closed) {
        // Owned history is retained by readCoupled before declared acceptance.
        // Private children are already deeply frozen; no user callback follows it.
        const snapshot = FREEZE({
          recoveryState: candidate.recoveryState,
          declaredPlan,
          currentFundingUncertain: candidate.current,
          observedFundingUncertain: candidate.observed,
          closed,
          nextStep: candidate.nextStep,
          evidence: 'OWNED_LOCAL_RECOVERY_BOUND_PLAN',
          qualification: 'UNQUALIFIED',
          authority: 'NONE',
          mayStartPayment: false,
          maySignPayment: false,
          mayDispatchService: false,
          deliveryConfirmed: false,
        });
        lastSnapshot = snapshot;
        return snapshot;
      }

      function observe(...args) {
        if (args.length !== 1 || locallyClosed) {
          return APPLY(PLAN_OBSERVE, undefined, args);
        }
        const candidate = readCoupled(boundKey, false);
        const declaredPlan = APPLY(PLAN_OBSERVE, undefined, args);
        return commit(candidate, declaredPlan, false);
      }

      function getSnapshot(...args) {
        if (args.length !== 0) return APPLY(PLAN_GET, undefined, args);
        if (locallyClosed) return lastSnapshot;
        const candidate = readCoupled(boundKey, false);
        return commit(candidate, APPLY(PLAN_GET, undefined, args), false);
      }

      function close(...args) {
        if (args.length !== 0) return APPLY(PLAN_CLOSE, undefined, args);
        if (locallyClosed) return lastSnapshot;
        const candidate = {
          ...lastCoupled,
          nextStep: 'LOCALLY_CLOSED',
        };
        const snapshot = commit(candidate, APPLY(PLAN_CLOSE, undefined, args), true);
        locallyClosed = true;
        readActual = null;
        boundKey = null;
        envelopeJson = null;
        fundingRevision = null;
        fundingJson = null;
        intentEnvelopeJson = null;
        lastCoupled = null;
        return snapshot;
      }

      return FREEZE({
        observe: FREEZE(observe),
        getSnapshot: FREEZE(getSnapshot),
        close: FREEZE(close),
      });
    }

    // V3-only opt-in lifecycle. Only the captured actual catalog/state-plan
    // operations enter the internal diagnostic component; root close stays here.
    function createOriginalRecoveryCollection(initialObservationsJson) {
      if (arguments.length !== 1) throw failure('INVALID_INPUT');
      return CREATE_COLLECTION({
        readCatalog: ROOT_READ_RECOVERY_KEYS,
        createStatePlan: createOriginalRecoveryStatePlan,
        selectedGrantId,
      }, initialObservationsJson);
    }

    function createOriginalRecoveryObservationCollection(initialObservationsJson) {
      if (arguments.length !== 1) throw failure('INVALID_INPUT');
      return CREATE_OBSERVATION_COLLECTION({
        readCatalog: ROOT_READ_RECOVERY_KEYS,
        createStatePlan: createOriginalRecoveryStatePlan,
        selectedGrantId,
      }, initialObservationsJson);
    }

    function snapshot(...args) {
      if (args.length !== 0) throw failure('INVALID_INPUT');
      const owned = ROOT_SNAPSHOT();
      const sequence = RUNNER_SNAPSHOT();
      return FREEZE({
        resource: owned.resource,
        close: owned.close,
        runner: sequence,
        unknown: sequence.unknown || owned.close.childUncertainty === true
          || owned.close.unknownUndrained === true
          || owned.resource.phase === 'HELD'
          || owned.resource.storeCloseOutcome === 'UNKNOWN',
        unknownUndrained: sequence.unknownUndrained
          || owned.close.unknownUndrained === true,
        qualification: 'UNQUALIFIED',
        backend: 'NOT_ESTABLISHED',
        actualPersistence: 'NOT_ESTABLISHED',
        restart: 'NOT_ESTABLISHED',
        currentAuthority: 'NOT_ESTABLISHED',
        realReady: 'NOT_ESTABLISHED',
        serviceDelivery: 'NOT_ESTABLISHED',
        osCleanup: 'NOT_ESTABLISHED',
        pilot: 'NOT_ESTABLISHED',
      });
    }

    return FREEZE({
      runOriginals: runner.runOriginals,
      readOriginal: ROOT_READ,
      readOriginalRecoveryState: ROOT_READ_RECOVERY_STATE,
      ...(dispatchIntentEnabled ? { readOriginalRecoveryKeys: ROOT_READ_RECOVERY_KEYS } : {}),
      createOriginalRecoveryPlan: FREEZE(createOriginalRecoveryPlan),
      createOriginalRecoveryStatePlan: FREEZE(createOriginalRecoveryStatePlan),
      close: runner.close,
      snapshot: FREEZE(snapshot),
      ...(dispatchIntentEnabled ? {
        createOriginalRecoveryCollection: FREEZE(createOriginalRecoveryCollection),
        createOriginalRecoveryObservationCollection: FREEZE(createOriginalRecoveryObservationCollection),
      } : {}),
    });
  } catch {
    // No core operation has run: its construction invokes no child callback.
    // Keep the actual owner solely responsible for its close and slot state.
    await observeConstructionClose(ROOT_CLOSE, ROOT_SNAPSHOT);
    throw failure('OWNED_CONSTRUCTION_FAILED');
  } finally {
    root = null;
  }
}

function pathText(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096
      || APPLY(BYTE_LENGTH, Buffer, [value, 'utf8']) > 4096
      || APPLY(INCLUDES, value, ['\0'])) {
    throw failure('INVALID_CONFIGURATION');
  }
}

async function observeConstructionClose(closeActual, snapshotActual) {
  let observed;
  try {
    if (typeof closeActual !== 'function' || IS_PROXY(closeActual)) {
      throw failure('OWNED_CONSTRUCTION_CLOSE_UNKNOWN');
    }
    observed = closeActual();
  } catch {
    throw failure('OWNED_CONSTRUCTION_CLOSE_UNKNOWN');
  }
  if (!safePromise(observed)) {
    throw failure('OWNED_CONSTRUCTION_CLOSE_UNOBSERVABLE');
  }

  let returned;
  try {
    returned = await observed;
  } catch {
    throw failure('OWNED_CONSTRUCTION_CLOSE_UNKNOWN');
  }
  if (returned !== undefined) throw failure('OWNED_CONSTRUCTION_CLOSE_UNKNOWN');

  try {
    const view = snapshotActual();
    if (view.resource.phase !== 'RELEASED' || view.resource.slotHeld !== false
        || view.resource.storeAcquired !== true
        || view.resource.admissionClosed !== true
        || view.resource.storeCloseAttempts !== 1
        || view.resource.storeCloseOutcome !== 'RETURNED'
        || view.close.requested !== true
        || view.close.childOutcome !== 'FULFILLED'
        || view.close.childUncertainty !== false
        || view.close.unknownUndrained !== false
        || view.close.outcome !== 'DRAINED') {
      throw failure('OWNED_CONSTRUCTION_CLOSE_UNKNOWN');
    }
  } catch {
    throw failure('OWNED_CONSTRUCTION_CLOSE_UNKNOWN');
  }
}
