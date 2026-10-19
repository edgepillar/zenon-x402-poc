import { types as utilTypes } from 'node:util';
import {
  snapshotOriginalServiceRequestCustodyKey,
} from './service-credit-original-request-custody-contract.js';
import { exact, failure } from './service-credit-custodied-sequential-runner-core.js';
import {
  createServiceCreditCustodiedRecoveryCollectionCore,
} from './service-credit-custodied-recovery-collection-core.js';

const APPLY = Reflect.apply;
const FREEZE = Object.freeze;
const DESCRIPTOR = Object.getOwnPropertyDescriptor;
const HAS_OWN = Object.hasOwn;
const IS_FROZEN = Object.isFrozen;
const IS_PROXY = utilTypes.isProxy;
const KEY = snapshotOriginalServiceRequestCustodyKey;
const CREATE = createServiceCreditCustodiedRecoveryCollectionCore;
const CONFIG = FREEZE(['readCatalog', 'createStatePlan', 'selectedGrantId']);

/**
 * Opt-in declared observation facade over the unchanged collection lifecycle.
 * Only current synchronous private frozen children/pristine intrinsics are
 * premises; this is not an arbitrary-factory or hostile-getter boundary.
 * The actual children are returned unchanged to the existing core. Their
 * own read-before-declared-acceptance/history semantics remain untouched.
 *
 * Arity always wins. observeOriginal then validates an exact historical member
 * key before lifecycle checks or any owned operation. Malformed keys are
 * INVALID_INPUT; foreign/unknown keys are MEMBER_NOT_FOUND, without latching.
 * Closed valid members refuse CLOSED; unavailable valid members refuse
 * UNAVAILABLE, without reads. Even after detach, only immutable history keys
 * are consulted. Observation validation belongs to the actual child: a member
 * call is admitted before the whole pre-read, so any pre-read, observe or
 * post-read refusal latches this facade and preserves its last published
 * COMPLETE view. No payload is treated as custody, funding or authority.
 *
 * An observe returns only after old-core whole refresh / one actual member
 * observe / old-core whole refresh. The pre-read is not separately published.
 * Close delegates once; entries/funding remain last-publication history even
 * if the underlying core retained a newer pre-read. Both facade failure and
 * underlying close UNKNOWN are exposed. An unexpected delegate-close throw
 * propagates once; repeat close/get return cached UNKNOWN history (unknown
 * child-close count is null). No root/store/transport close capability enters.
 */
export function createServiceCreditCustodiedRecoveryObservationCollectionCore(
  configuration, initialObservationsJson,
) {
  if (arguments.length !== 2) throw failure('INVALID_INPUT');
  let config = null, factory = null, readCatalog = null, core = null;
  let children = [], baseGet = null, baseClose = null, lastComplete = null;
  let locallyClosed = false, unavailable = false, closedSnapshot = null;
  let observationFailure = 'NONE';

  function project(value) {
    const complete = FREEZE({
      ...value,
      observationCollectionVersion: 1,
      evidence: 'OWNED_LOCAL_CATALOG_BOUND_RECOVERY_OBSERVATION_COLLECTION',
      observationFailureKind: 'NONE',
      underlyingUnavailable: value.unavailable,
      underlyingFailureKind: value.failureKind,
      observationCloseOutcome: 'NOT_REQUESTED',
    });
    lastComplete = complete;
    return complete;
  }

  function capture(key, observationJson) {
    const returned = APPLY(factory, undefined, [key, observationJson]);
    // Let the old core register/validate close before we validate observe.
    let descriptor = null, frozen = false;
    if (returned !== null && typeof returned === 'object' && !IS_PROXY(returned)) {
      descriptor = DESCRIPTOR(returned, 'observe');
      frozen = IS_FROZEN(returned);
    }
    children.push({
      key: KEY(key),
      observe: descriptor && HAS_OWN(descriptor, 'value') ? descriptor.value : null,
      frozen,
    });
    return returned;
  }

  function drop() {
    if (children !== null) {
      for (const child of children) { child.observe = null; child.key = null; }
    }
    children = null;
    baseGet = null;
    baseClose = null;
    factory = null;
    readCatalog = null;
    config = null;
    core = null;
  }

  try {
    config = exact(configuration, CONFIG);
    if (typeof config.readCatalog !== 'function' || IS_PROXY(config.readCatalog)
        || typeof config.createStatePlan !== 'function' || IS_PROXY(config.createStatePlan)) {
      throw failure('INVALID_INPUT');
    }
    factory = config.createStatePlan;
    readCatalog = config.readCatalog;
    core = CREATE({
      readCatalog,
      createStatePlan: FREEZE(capture),
      selectedGrantId: config.selectedGrantId,
    }, initialObservationsJson);
    baseGet = core.getSnapshot;
    baseClose = core.close;
    for (const child of children) {
      if (!child.frozen || typeof child.observe !== 'function' || IS_PROXY(child.observe)) {
        throw failure('RECOVERY_COLLECTION_CHILD_INVALID');
      }
    }
    // Cache one whole owned read for this facade; do not inspect child DTOs here.
    project(APPLY(baseGet, undefined, []));
  } catch (error) {
    let unknown = false;
    if (baseClose !== null) {
      try { unknown = APPLY(baseClose, undefined, []).childCloseOutcome === 'UNKNOWN'; }
      catch { unknown = true; }
    }
    drop();
    if (unknown) throw failure('RECOVERY_OBSERVATION_COLLECTION_CLEANUP_UNKNOWN');
    throw error;
  } finally {
    configuration = null;
    initialObservationsJson = null;
    config = null;
    factory = null;
    readCatalog = null;
    core = null;
  }

  function member(value) {
    let key;
    try { key = KEY(value); } catch { throw failure('INVALID_INPUT'); }
    const keys = (locallyClosed ? closedSnapshot : lastComplete).keys;
    for (let index = 0; index < keys.length; index++) {
      if (keys[index].grantId === key.grantId && keys[index].requestId === key.requestId) return index;
    }
    throw failure('RECOVERY_OBSERVATION_COLLECTION_MEMBER_NOT_FOUND');
  }

  function live() {
    if (locallyClosed) throw failure('RECOVERY_OBSERVATION_COLLECTION_CLOSED');
    if (unavailable) throw failure('RECOVERY_OBSERVATION_COLLECTION_UNAVAILABLE');
  }

  function latch(error, kind) {
    unavailable = true;
    observationFailure = kind;
    throw error;
  }

  function observeOriginal(...args) {
    if (args.length !== 2) throw failure('INVALID_INPUT');
    const index = member(args[0]);
    live();
    try { APPLY(baseGet, undefined, []); }
    catch (error) { latch(error, 'PRE_OBSERVE_REFRESH_FAILED'); }
    try { APPLY(children[index].observe, undefined, [args[1]]); }
    catch (error) { latch(error, 'OBSERVE_FAILED'); }
    try { return project(APPLY(baseGet, undefined, [])); }
    catch (error) { return latch(error, 'POST_OBSERVE_REFRESH_FAILED'); }
  }

  function getSnapshot(...args) {
    if (args.length !== 0) throw failure('INVALID_INPUT');
    if (locallyClosed) return closedSnapshot;
    live();
    try { return project(APPLY(baseGet, undefined, [])); }
    catch (error) { return latch(error, 'WHOLE_REFRESH_FAILED'); }
  }

  function close(...args) {
    if (args.length !== 0) throw failure('INVALID_INPUT');
    if (locallyClosed) return closedSnapshot;
    let detached = null, closeError = null;
    try { detached = APPLY(baseClose, undefined, []); }
    catch (error) { closeError = error; }
    finally { drop(); }
    const unknown = detached === null || detached.childCloseOutcome === 'UNKNOWN';
    closedSnapshot = FREEZE({
      ...lastComplete,
      closed: true,
      unavailable: unavailable || unknown || detached.unavailable,
      failureKind: unknown ? 'LOCAL_CLOSE_UNKNOWN'
        : unavailable ? observationFailure === 'OBSERVE_FAILED'
          ? 'LIVE_OBSERVATION_FAILED' : 'LIVE_READ_FAILED' : detached.failureKind,
      observationFailureKind: observationFailure,
      underlyingUnavailable: detached === null ? true : detached.unavailable,
      underlyingFailureKind: detached === null ? 'LOCAL_CLOSE_UNKNOWN' : detached.failureKind,
      observationCloseOutcome: detached === null ? 'UNKNOWN' : 'RETURNED',
      snapshotKind: 'DETACHED_HISTORICAL',
      childCloseAttempts: detached === null ? null : detached.childCloseAttempts,
      childCloseOutcome: detached === null ? 'UNKNOWN' : detached.childCloseOutcome,
      nextStep: 'LOCALLY_CLOSED',
    });
    locallyClosed = true;
    lastComplete = null;
    if (detached === null) throw closeError;
    return closedSnapshot;
  }

  return FREEZE({
    observeOriginal: FREEZE(observeOriginal),
    getSnapshot: FREEZE(getSnapshot),
    close: FREEZE(close),
  });
}
