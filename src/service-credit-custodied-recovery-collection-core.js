import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import {
  snapshotOriginalServiceRequestCustodyKey,
  serializeOriginalServiceRequestCustody,
  serializeOriginalServiceDispatchIntent,
} from './service-credit-original-request-custody-contract.js';
import { exact, failure } from './service-credit-custodied-sequential-runner-core.js';

const APPLY = Reflect.apply;
const FREEZE = Object.freeze;
const PARSE = JSON.parse;
const STRINGIFY = JSON.stringify;
const ARRAY = Array.isArray;
const IS_PROXY = utilTypes.isProxy;
const DESCRIPTOR = Object.getOwnPropertyDescriptor;
const HAS_OWN = Object.hasOwn;
const BYTE_LENGTH = Buffer.byteLength;
const KEY = snapshotOriginalServiceRequestCustodyKey;
const SERIALIZE = serializeOriginalServiceRequestCustody;
const SERIALIZE_INTENT = serializeOriginalServiceDispatchIntent;
const CONFIG = FREEZE(['readCatalog', 'createStatePlan', 'selectedGrantId']);
const ENTRY = FREEZE(['grantId', 'requestId', 'observationJson']);
const MAX_ENTRIES = 8;
const MAX_INPUT = 65536;

/**
 * Internal diagnostic lifecycle over captured private owned operations only.
 * The V3 binding supplies the actual catalog read and state-plan constructor;
 * no store, root close, transport or submit capability enters this component.
 * Direct declared-interface controls do not qualify the SQLite binding.
 *
 * Input is canonical JSON.stringify DATA with ordered entry fields
 * grantId,requestId,observationJson, at most eight entries and 65536 UTF-16
 * units/UTF-8 bytes. Each observation string is at most 1024 units; the actual
 * state plan validates its canonical declared DTO and original identity.
 * Exact complete selected catalog order is required; no truncation or paging.
 *
 * Each published live snapshot follows catalog / all child snapshots / catalog
 * agreement on membership, complete funding view and owner uncertainty. Full
 * canonical originals and intents (including absence) bind at the first complete
 * read. Identity is fixed, revisions never regress, and a changed funding view
 * requires a later revision. These bookends are not an SQL transaction, an
 * authenticated snapshot, or protection against a concurrent same-user writer.
 *
 * A returned collection's first live failure propagates unchanged and latches
 * only this collection unavailable. Further live reads refuse without retry;
 * last complete DATA stays historical. Close invokes each diagnostic child
 * close at most once, drops live read/key/envelope references and returns one
 * cached detached snapshot. Its entries retain the last complete read-time DATA,
 * including their read-time closed fields; they are never partial refresh DATA.
 * Child close observations are diagnostic, not root/store/native finalization.
 * Root close ownership and its original Promise remain outside this interface.
 *
 * Invalid arity is INVALID_INPUT before any lifecycle check/read. Closed valid
 * getSnapshot/close return the same cached history. Unavailable valid
 * getSnapshot refuses RECOVERY_COLLECTION_UNAVAILABLE. Local close still works
 * after root close/fault. All observations/flags remain declared and powerless.
 * Pristine intrinsics and current synchronous private frozen children are
 * premises; callbacks, arbitrary injected factories and hostile getters are not
 * part of the public V3 surface or a new threat-model qualification.
 */
export function createServiceCreditCustodiedRecoveryCollectionCore(
  configuration, initialObservationsJson,
) {
  if (arguments.length !== 2) throw failure('INVALID_INPUT');
  let readCatalog, createStatePlan, selectedGrantId, observations;
  try {
    const config = exact(configuration, CONFIG);
    if (typeof config.readCatalog !== 'function' || IS_PROXY(config.readCatalog)
        || typeof config.createStatePlan !== 'function' || IS_PROXY(config.createStatePlan)) {
      throw failure('INVALID_INPUT');
    }
    selectedGrantId = KEY({ grantId: config.selectedGrantId, requestId: 'scope' }).grantId;
    readCatalog = config.readCatalog;
    createStatePlan = config.createStatePlan;
    if (typeof initialObservationsJson !== 'string'
        || initialObservationsJson.length > MAX_INPUT
        || APPLY(BYTE_LENGTH, Buffer, [initialObservationsJson, 'utf8']) > MAX_INPUT) {
      throw failure('INVALID_INPUT');
    }
    const parsed = PARSE(initialObservationsJson);
    if (!ARRAY(parsed) || parsed.length > MAX_ENTRIES) throw failure('INVALID_INPUT');
    observations = [];
    for (let index = 0; index < parsed.length; index++) {
      const item = exact(parsed[index], ENTRY), key = KEY(itemKey(item));
      if (key.grantId !== selectedGrantId || typeof item.observationJson !== 'string'
          || item.observationJson.length > 1024) throw failure('INVALID_INPUT');
      for (let prior = 0; prior < index; prior++) {
        if (observations[prior].requestId === key.requestId) throw failure('INVALID_INPUT');
      }
      observations[index] = FREEZE({
        grantId: key.grantId, requestId: key.requestId, observationJson: item.observationJson,
      });
    }
    if (STRINGIFY(observations) !== initialObservationsJson) throw failure('INVALID_INPUT');
  } catch {
    throw failure('INVALID_INPUT');
  } finally {
    configuration = null;
    initialObservationsJson = null;
  }

  let keys = FREEZE(observations.map(item => KEY(itemKey(item))));
  let membershipJson = STRINGIFY(keys), children = [];
  let envelopes = null, intents = null, fundingIdentity = null;
  let fundingRevision = 0, fundingJson = null, observedFundingUncertain = false;
  let locallyClosed = false, unavailable = false, lastComplete = null, closedSnapshot = null;
  let childCloseAttempts = 0, childCloseUnknown = false;

  function itemKey(item) {
    return { grantId: item.grantId, requestId: item.requestId };
  }

  function catalog(first) {
    const value = readCatalog();
    if (value.keys.length > MAX_ENTRIES) throw failure('RECOVERY_COLLECTION_LIMIT');
    if (value.grantId !== selectedGrantId || STRINGIFY(value.keys) !== membershipJson) {
      throw failure(first ? 'INVALID_INPUT' : 'RECOVERY_COLLECTION_MEMBERSHIP_CHANGED');
    }
    return value;
  }

  function complete(start, first) {
    const identity = STRINGIFY({
      fundingResourceUrl: start.funding.fundingResourceUrl,
      paymentHash: start.funding.paymentHash,
      network: start.funding.network,
    });
    const wholeFunding = STRINGIFY(start.funding), uncertainty = STRINGIFY(start.uncertainty);
    if (!first && identity !== fundingIdentity) throw failure('RECOVERY_COLLECTION_FUNDING_CHANGED');
    if (!first && start.funding.revision < fundingRevision) {
      throw failure('FUNDING_REVISION_REGRESSION');
    }
    if (!first && start.funding.revision === fundingRevision && wholeFunding !== fundingJson) {
      throw failure('RECOVERY_COLLECTION_FUNDING_CHANGED');
    }
    const entries = [], nextEnvelopes = [], nextIntents = [];
    let observed = observedFundingUncertain || start.funding.status === 'OUTCOME_UNKNOWN';
    let reconciliation = false;
    for (let index = 0; index < children.length; index++) {
      const plan = APPLY(children[index].get, undefined, []);
      const state = plan.recoveryState, original = state.original;
      const envelope = SERIALIZE(original);
      const intent = state.dispatchIntent === null ? null : SERIALIZE_INTENT(state.dispatchIntent);
      if (original.grantId !== keys[index].grantId || original.requestId !== keys[index].requestId
          || original.fundingResourceUrl !== start.funding.fundingResourceUrl
          || original.paymentHash !== start.funding.paymentHash
          || original.network !== start.funding.network
          || (!first && envelope !== envelopes[index])) throw failure('ORIGINAL_BINDING_CHANGED');
      if ((!first && intent !== intents[index]) || state.dispatchStatus !== (intent === null
        ? 'NO_INTENT_RECORDED' : 'POSSIBLY_ATTEMPTED')) {
        throw failure('DISPATCH_INTENT_BINDING_CHANGED');
      }
      if (plan.closed !== false || STRINGIFY(state.funding) !== wholeFunding
          || STRINGIFY(state.uncertainty) !== uncertainty
          || plan.currentFundingUncertain !== (start.funding.status === 'OUTCOME_UNKNOWN')
          || typeof plan.observedFundingUncertain !== 'boolean'
          || (plan.currentFundingUncertain && !plan.observedFundingUncertain)) {
        throw failure('RECOVERY_COLLECTION_VIEW_CHANGED');
      }
      nextEnvelopes[index] = envelope;
      nextIntents[index] = intent;
      observed = observed || plan.observedFundingUncertain;
      reconciliation = reconciliation || intent !== null;
      entries[index] = FREEZE({ key: keys[index], recoveryPlan: plan });
    }
    const end = catalog(first);
    if (STRINGIFY(end.funding) !== wholeFunding || STRINGIFY(end.uncertainty) !== uncertainty) {
      throw failure('RECOVERY_COLLECTION_VIEW_CHANGED');
    }
    const rawUnknown = start.funding.status === 'OUTCOME_UNKNOWN';
    const ownerUnknown = start.uncertainty.custody || start.uncertainty.submission || start.uncertainty.undrained;
    const nextStep = reconciliation ? 'RECONCILIATION_REQUIRED'
      : rawUnknown ? 'RECONCILE_EXISTING_FUNDING'
        : ownerUnknown ? 'REVIEW_OWNED_RECOVERY_STATE'
          : observed ? 'REVIEW_PRIOR_FUNDING_UNCERTAINTY'
            : start.funding.ambiguityLatched || start.uncertainty.declaredFundingAmbiguitySeen
              ? 'REVIEW_HISTORICAL_FUNDING_AMBIGUITY'
              : keys.length === 0 ? 'NO_RETAINED_ORIGINALS' : 'REVIEW_CURRENT_AUTHORITY_FOR_ORIGINALS';
    const snapshot = FREEZE({
      collectionVersion: 1,
      grantId: selectedGrantId,
      keys,
      funding: start.funding,
      uncertainty: start.uncertainty,
      entries: FREEZE(entries),
      currentFundingUncertain: rawUnknown,
      observedFundingUncertain: observed,
      closed: false,
      unavailable: false,
      failureKind: 'NONE',
      snapshotKind: 'COMPLETE_OWNED_READ',
      childCloseAttempts: 0,
      childCloseOutcome: 'NOT_REQUESTED',
      nextStep,
      evidence: 'OWNED_LOCAL_CATALOG_BOUND_RECOVERY_COLLECTION',
      qualification: 'UNQUALIFIED',
      authority: 'NONE',
      mayStartPayment: false,
      maySignPayment: false,
      mayDispatchService: false,
      deliveryConfirmed: false,
    });
    fundingIdentity = identity;
    fundingRevision = start.funding.revision;
    fundingJson = wholeFunding;
    observedFundingUncertain = observed;
    envelopes = nextEnvelopes;
    intents = nextIntents;
    lastComplete = snapshot;
    return snapshot;
  }

  function detach() {
    for (let index = 0; index < children.length; index++) {
      const child = children[index];
      if (!child.closeAttempted) {
        child.closeAttempted = true;
        childCloseAttempts++;
        try { APPLY(child.close, undefined, []); } catch { childCloseUnknown = true; }
      }
      child.get = null;
      child.close = null;
      children[index] = null;
    }
    children = null;
    readCatalog = null;
    createStatePlan = null;
    observations = null;
    keys = null;
    membershipJson = null;
    envelopes = null;
    intents = null;
    fundingIdentity = null;
    fundingRevision = null;
    fundingJson = null;
    selectedGrantId = null;
  }

  try {
    const start = catalog(true);
    for (let index = 0; index < keys.length; index++) {
      const returned = createStatePlan(keys[index], observations[index].observationJson);
      // Register each returned diagnostic close before validating other members.
      // An unobservable returned close is cleanup UNKNOWN, never a root close.
      if (typeof returned !== 'object' || returned === null || IS_PROXY(returned)) {
        childCloseUnknown = true;
        throw failure('RECOVERY_COLLECTION_CHILD_INVALID');
      }
      const closer = DESCRIPTOR(returned, 'close');
      if (!closer || !HAS_OWN(closer, 'value') || typeof closer.value !== 'function'
          || IS_PROXY(closer.value)) {
        childCloseUnknown = true;
        throw failure('RECOVERY_COLLECTION_CHILD_INVALID');
      }
      const child = { get: null, close: closer.value, closeAttempted: false };
      children[index] = child;
      const captured = exact(returned, ['observe', 'getSnapshot', 'close']);
      if (typeof captured.getSnapshot !== 'function' || IS_PROXY(captured.getSnapshot)) {
        throw failure('RECOVERY_COLLECTION_CHILD_INVALID');
      }
      child.get = captured.getSnapshot;
    }
    complete(start, true);
    createStatePlan = null;
    observations = null;
  } catch (error) {
    detach();
    if (childCloseUnknown) throw failure('RECOVERY_COLLECTION_CLEANUP_UNKNOWN');
    throw error;
  }

  function getSnapshot(...args) {
    if (args.length !== 0) throw failure('INVALID_INPUT');
    if (locallyClosed) return closedSnapshot;
    if (unavailable) throw failure('RECOVERY_COLLECTION_UNAVAILABLE');
    try { return complete(catalog(false), false); }
    catch (error) { unavailable = true; throw error; }
  }

  function close(...args) {
    if (args.length !== 0) throw failure('INVALID_INPUT');
    if (locallyClosed) return closedSnapshot;
    detach();
    unavailable = unavailable || childCloseUnknown;
    closedSnapshot = FREEZE({
      ...lastComplete,
      closed: true,
      unavailable,
      failureKind: childCloseUnknown ? 'LOCAL_CLOSE_UNKNOWN' : unavailable ? 'LIVE_READ_FAILED' : 'NONE',
      snapshotKind: 'DETACHED_HISTORICAL',
      childCloseAttempts,
      childCloseOutcome: childCloseUnknown ? 'UNKNOWN' : 'RETURNED',
      nextStep: 'LOCALLY_CLOSED',
    });
    locallyClosed = true;
    lastComplete = null;
    return closedSnapshot;
  }

  return FREEZE({
    getSnapshot: FREEZE(getSnapshot),
    close: FREEZE(close),
  });
}
