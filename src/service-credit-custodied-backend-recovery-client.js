import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import { createServiceCreditCustodiedHttpClientV3 } from './service-credit-custodied-http-client.js';
import { openServiceCreditCustodiedSqliteHttpClientV3 } from './service-credit-custodied-sqlite-http-client.js';
import { openServiceCreditCustodiedSqliteHttpClientV4 } from './service-credit-custodied-sqlite-http-client.js';
import { openServiceCreditCustodiedSqliteHttpClientV5 } from './service-credit-custodied-sqlite-http-client.js';
import { openServiceCreditCustodiedSqliteHttpClientV6 } from './service-credit-custodied-sqlite-http-client.js';
import { encodeOriginalPaymentCheckpoint } from './service-credit-pilot-original-payment-checkpoint.js';
import { openServiceCreditCustodiedSqliteRecoveryReaderV5 } from './service-credit-custodied-sqlite-recovery-reader.js';
import { createServiceCreditBackendOriginalOutcomeReader } from './service-credit-backend-original-outcome-reader.js';
import { createServiceCreditCustodiedSequentialRunnerCore } from './service-credit-custodied-sequential-runner-core.js';
import {
  snapshotOriginalServiceRequestCustodyKey,
  serializeOriginalServiceRequestCustody,
  serializeOriginalServiceDispatchIntent,
} from './service-credit-original-request-custody-contract.js';

const APPLY = Reflect.apply;
const KEYS = Reflect.ownKeys;
const DESCRIPTOR = Object.getOwnPropertyDescriptor;
const PROTOTYPE = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const FREEZE = Object.freeze;
const DEFINE = Object.defineProperty;
const NativePromise = Promise;
const IS_PROXY = utilTypes.isProxy;
const BYTE_LENGTH = Buffer.byteLength;
const PARSE = JSON.parse;
const STRINGIFY = JSON.stringify;
const KEY = snapshotOriginalServiceRequestCustodyKey;
const SERIALIZE = serializeOriginalServiceRequestCustody;
const SERIALIZE_INTENT = serializeOriginalServiceDispatchIntent;
const CREATE_CLIENT = createServiceCreditCustodiedHttpClientV3;
const OPEN_SQLITE_CLIENT = openServiceCreditCustodiedSqliteHttpClientV3;
const OPEN_SQLITE_CLIENT_V4 = openServiceCreditCustodiedSqliteHttpClientV4;
const OPEN_SQLITE_CLIENT_V5 = openServiceCreditCustodiedSqliteHttpClientV5;
const OPEN_SQLITE_CLIENT_V6 = openServiceCreditCustodiedSqliteHttpClientV6;
const CHECKPOINT_TEXT = encodeOriginalPaymentCheckpoint;
const CREATE_BACKEND = createServiceCreditBackendOriginalOutcomeReader;
const CREATE_RUNNER = createServiceCreditCustodiedSequentialRunnerCore;
const FIELDS = FREEZE([
  'store', 'backendStore', 'fundingResourceUrl', 'custodyPolicy', 'selectedGrantId', 'deadlineMs',
]);
const SQLITE_FIELDS = FREEZE([
  'databasePath', 'allowedRoot', 'backendStore', 'fundingResourceUrl',
  'custodyPolicy', 'selectedGrantId', 'deadlineMs',
]);
const SQLITE_DISPATCH_FIELDS = FREEZE([...SQLITE_FIELDS, 'requestImpl']);
const NO_DISPATCH = FREEZE(function recoveryDispatchForbidden() {
  throw failure('DISPATCH_FORBIDDEN');
});

function failure(suffix) {
  const code = `SERVICE_CREDIT_CUSTODIED_BACKEND_RECOVERY_${suffix}`;
  const error = new TypeError(code);
  DEFINE(error, 'code', { value: code, enumerable: true });
  DEFINE(error, 'stack', { value: `TypeError: ${code}` });
  return FREEZE(error);
}

function rejected(suffix) {
  return new NativePromise((resolve, reject) => { reject(failure(suffix)); });
}

function exact(value, fields = FIELDS) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || PROTOTYPE(value) !== Object.prototype || KEYS(value).length !== fields.length) {
    throw failure('INVALID_CONFIGURATION');
  }
  const captured = {};
  for (const name of fields) {
    const descriptor = DESCRIPTOR(value, name);
    if (!descriptor?.enumerable || !HAS_OWN(descriptor, 'value')) {
      throw failure('INVALID_CONFIGURATION');
    }
    captured[name] = descriptor.value;
  }
  return captured;
}

function intentText(state) {
  return state.dispatchIntent === null ? null : SERIALIZE_INTENT(state.dispatchIntent);
}

function view(status, local = null, backend = null) {
  return FREEZE({
    recoveryVersion: 1,
    status,
    local,
    backend,
    authority: 'NONE',
    mayStartPayment: false,
    maySignPayment: false,
    mayDispatchService: false,
    deliveryConfirmed: false,
    serviceDelivery: 'NOT_ESTABLISHED',
    currentAuthority: 'NOT_ESTABLISHED',
    nextStep: 'RECONCILIATION_REQUIRED',
  });
}

/**
 * Opt-in no-dispatch client recovery connection to the actual local backend.
 * Constructs one existing V3 custodied HTTP client with a private forbidden
 * transport and one selected-grant native backend reader. Neither submit nor a
 * caller transport/factory is exposed. Existing execution/client defaults and
 * their import graphs remain unchanged unless this module is explicitly used.
 *
 * The client store is the existing TRUSTED synchronous custody interface, not a
 * new store brand or an assertion of SQLite durability. backendStore must be an
 * actual ServiceCreditSqliteStore. BOTH stores are borrowed and never closed.
 * The original proof is supplied explicitly per read, forwarded without
 * regeneration, and never persisted or returned. String erasure is not promised.
 *
 * The retained original's exact eight fields must match the verified proof even
 * on backend absence. Complete custody, funding revision/status/identity, intent
 * and uncertainty projections are reread after the backend query; a change or
 * live read failure latches only this connection unavailable, without retry.
 * These fences do not supply an atomic transaction across two stores. Same-UID
 * code, the reviewed synchronous client-store semantics, captured components,
 * native SQLite/Promises and OS/filesystem behavior remain premises.
 *
 * Backend success never clears client funding/custody uncertainty or establishes
 * current authority, real READY, service delivery, restart or pilot acceptance.
 * A committed dispatch intent also requires client reconciliation, including
 * after a normal reopen with fresh false in-memory uncertainty flags. Intent
 * is not a durable response receipt. The exact backend assertion stays nested
 * in backend; local funding, intent and uncertainty facts are not rewritten.
 * close fences combined reads synchronously, closes only the local backend
 * reader, and returns the actual client's cached native close Promise unchanged.
 */
export function createServiceCreditCustodiedBackendRecoveryClientV3(options) {
  let client = null, backend = null, selectedGrantId;
  try {
    if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
    const config = exact(options);
    selectedGrantId = KEY({ grantId: config.selectedGrantId, requestId: 'scope' }).grantId;
    client = CREATE_CLIENT({
      store: config.store,
      fundingResourceUrl: config.fundingResourceUrl,
      custodyPolicy: config.custodyPolicy,
      selectedGrantId,
      requestImpl: NO_DISPATCH,
      deadlineMs: config.deadlineMs,
    });
    backend = CREATE_BACKEND({ store: config.backendStore, admittedGrantId: selectedGrantId });
  } catch {
    // A newly constructed client has no active work or held store resources;
    // its existing close settles its idle local owner, never either store.
    if (backend !== null) backend.close();
    if (client !== null) client.close();
    throw failure('INVALID_CONFIGURATION');
  } finally {
    options = null;
  }
  return connectClientBackend(client, backend, selectedGrantId, 'BOTH_BORROWED');
}

/**
 * Opt-in owned EXISTING V3 payer SQLite connection to the borrowed backend.
 * Reuses the current SQLite HTTP client's acquisition, resource slot and exact
 * close lifecycle. No creation fallback, migration, recovery operation, caller
 * transport or submission method is exposed. Successful open may advance the
 * existing payer owner_epoch; this is not a SQLite readOnly connection.
 *
 * Configuration and selected grant are captured without invoking accessors.
 * The backend reader is constructed first; its whole-ledger admission remains
 * independent of payer acquisition. A failed payer acquisition fences that
 * reader and preserves the existing owner's failure/HELD policy. If composition
 * fails after acquisition, the actual owner's close is awaited exactly once;
 * any rejection is propagated, never treated as successful release or retried.
 *
 * The shared connection below retains the exact-original and reread fences.
 * close() returns the owned client's cached native Promise unchanged, while
 * fencing the backend reader synchronously. It never closes backendStore.
 * No cross-store transaction, authenticated funding, process restart, physical
 * durability, real READY, delivery or pilot acceptance is established here.
 */
export async function openServiceCreditCustodiedSqliteBackendRecoveryClientV3(options) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return openOwnedBackendClient(options, false);
}

/**
 * Separate opt-in service-credit submission capability plus backend recovery.
 * Uses the same existing owned V3 client, original custody and insert-only
 * dispatch-intent fence as the no-dispatch reader. requestImpl is an explicit
 * trusted caller capability: there is no default transport or active cutover.
 *
 * Only an explicit submitOriginal call can invoke it. Backend reads never
 * dispatch, retry, re-sign, replace a payment or clear uncertainty. A latched
 * combined-read failure blocks submission; a read while the actual client is
 * busy is refused without poisoning the later completed outcome. The original
 * supplied Authorization remains excluded from persistent custody metadata.
 *
 * The existing owner still decides retained-original, intent, funding and
 * uncertainty refusals. Neither BOUND nor a cached backend result supplies
 * payer/provider/policy authority, real READY, delivery or pilot acceptance.
 * The separate no-dispatch factories expose no submission method.
 */
export async function openServiceCreditCustodiedSqliteBackendClientV3(options) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return openOwnedBackendClient(options, true);
}

/**
 * One opt-in bounded batch connected to the same owned V3 payer and borrowed
 * backend recovery reader. An explicit trusted requestImpl is still required.
 * The existing sequential core owns queue capture, stop-on-uncertainty and
 * synchronous queued-next fencing. It returns the actual root close Promise;
 * there is no second store owner, acquisition, native close or lifecycle.
 *
 * The returned surface has no single-submit escape hatch. Combined reads use
 * the actual connection's exact-original, selected-grant and active-read fences.
 * They cannot dispatch, retry, authorize a new payment or clear uncertainty.
 * Callback completion and cached backend data are not delivery or authority.
 * This is normal local reopen, not fresh-process or physical-durability proof.
 */
export async function openServiceCreditCustodiedSqliteBackendSequentialRunnerV3(options) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return openOwnedBackendClient(options, true, true);
}

/**
 * Explicit EXISTING V4 payer bindings to the same borrowed backend reader.
 * These entries reuse the V4 client's persisted selected-grant quarantine and
 * unchanged owned close lifecycle. Cached backend success never clears that
 * marker or authorizes payment, signing, dispatch or delivery. There is no
 * create fallback, migration or active/default/CLI adoption; V3 stays separate.
 * The recovery entry exposes neither submission nor caller transport. The
 * other two require the existing explicit trusted requestImpl capability.
 */
export async function openServiceCreditCustodiedSqliteBackendRecoveryClientV4(options) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return openOwnedBackendClient(options, false, false, true);
}

export async function openServiceCreditCustodiedSqliteBackendClientV4(options) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return openOwnedBackendClient(options, true, false, true);
}

export async function openServiceCreditCustodiedSqliteBackendSequentialRunnerV4(options) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return openOwnedBackendClient(options, true, true, true);
}

/**
 * Explicit EXISTING V5 payer connections to the same borrowed backend reader.
 * The actual V5 HTTP owner retains declared response observations; its original
 * intent and quarantine remain reconciliation requirements, not send authority.
 * Combined reads additionally bind the complete local response projection on
 * both sides of the backend query. This is not an atomic two-store transaction
 * or an authenticated delivery receipt. Only the two explicit dispatch entries
 * accept a caller transport; the recovery entry remains no-dispatch.
 * One payer owner and one close lifecycle are reused. No V4 migration, create
 * fallback, default/CLI adoption, payment/signing or implicit replay is added.
 */
export async function openServiceCreditCustodiedSqliteBackendRecoveryClientV5(options) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return openOwnedBackendClient(options, false, false, true, true);
}

export async function openServiceCreditCustodiedSqliteBackendClientV5(options) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return openOwnedBackendClient(options, true, false, true, true);
}

export async function openServiceCreditCustodiedSqliteBackendSequentialRunnerV5(options) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return openOwnedBackendClient(options, true, true, true, true);
}

/**
 * Explicit EXISTING V6 payer connections. Reuses ONE V6 HTTP owner, the same
 * borrowed backend reader and, for batches, the existing sequential core.
 * No V5 adoption, new owner, transport default, funding or retry path is added.
 *
 * readOriginalBackendRecoveryState(key, originalProof, expectedCheckpointPins)
 * requires the original externally retained checkpoint pins on EVERY V6 read.
 * The same complete canonical checkpoint is read before and after the backend
 * query, in addition to the existing original/funding/intent/response fences.
 * A mismatch latches only this connection unavailable; cached backend success
 * cannot clear uncertainty, reset payment authority or authorize dispatch.
 * There is still no atomic transaction across the two stores.
 *
 * readOriginalPaymentCheckpoint(pins) returns explicit powerless local DATA,
 * even if combined backend reads became unavailable. It never queries the
 * backend or submits a request. Closed/busy reads remain refused; snapshots
 * and ordinary recovery views never include the raw payment checkpoint.
 * The no-dispatch entry exposes no submission or caller transport. The other
 * entries retain the existing explicit service-only submission capability.
 * Normal reopen is not real restart, rollback resistance or pilot acceptance.
 */
export async function openServiceCreditCustodiedSqliteBackendRecoveryClientV6(options) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return openOwnedBackendClient(options, false, false, true, true, true);
}

export async function openServiceCreditCustodiedSqliteBackendClientV6(options) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return openOwnedBackendClient(options, true, false, true, true, true);
}

export async function openServiceCreditCustodiedSqliteBackendSequentialRunnerV6(options) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return openOwnedBackendClient(options, true, true, true, true, true);
}

/**
 * Explicit no-dispatch V5 consumer over ONE existing owned payer and the same
 * borrowed native backend. Reuses the actual recovery reader's four diagnostic
 * plan/collection factories; it does not open a second payer or copy an owner.
 * Local diagnostics read the same root's validated custody state. Only the
 * combined backend read accepts the explicit original public proof; diagnostics
 * do not query/authenticate the backend or promote declared observations.
 *
 * Diagnostic child close is local history detachment, not root/native close.
 * Root close fences live reads and returns the original cached native Promise,
 * including UNKNOWN; it never closes the borrowed backend store. Local plans
 * may still detach their cached history after root close or a live read failure.
 * All DATA/action, original intent/quarantine and exact-proof boundaries remain
 * unchanged. No submit, batch, caller transport, root/store, signer, payment,
 * creation, migration, implicit replay, default cutover or restart assurance.
 */
export async function openServiceCreditCustodiedSqliteBackendRecoveryConsumerV5(options) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  let config = null, backend = null, reader = null;
  try {
    config = exact(options, SQLITE_FIELDS);
    const selectedGrantId = KEY({ grantId: config.selectedGrantId, requestId: 'scope' }).grantId;
    backend = CREATE_BACKEND({ store: config.backendStore, admittedGrantId: selectedGrantId });
    reader = await openServiceCreditCustodiedSqliteRecoveryReaderV5({
      databasePath: config.databasePath,
      allowedRoot: config.allowedRoot,
      fundingResourceUrl: config.fundingResourceUrl,
      custodyPolicy: config.custodyPolicy,
      selectedGrantId,
      deadlineMs: config.deadlineMs,
    });
    const connection = connectClientBackend(
      reader, backend, selectedGrantId, 'PAYER_OWNED_BACKEND_BORROWED', false, true,
    );
    const consumer = FREEZE({
      readOriginal: connection.readOriginal,
      readOriginalRecoveryState: connection.readOriginalRecoveryState,
      readOriginalRecoveryKeys: connection.readOriginalRecoveryKeys,
      readOriginalBackendRecoveryState: connection.readOriginalBackendRecoveryState,
      createOriginalRecoveryPlan: reader.createOriginalRecoveryPlan,
      createOriginalRecoveryStatePlan: reader.createOriginalRecoveryStatePlan,
      createOriginalRecoveryCollection: reader.createOriginalRecoveryCollection,
      createOriginalRecoveryObservationCollection: reader.createOriginalRecoveryObservationCollection,
      snapshot: connection.snapshot,
      close: connection.close,
    });
    reader = null;
    backend = null;
    return consumer;
  } catch (error) {
    if (backend !== null) backend.close();
    if (reader !== null) await reader.close();
    throw error;
  } finally {
    config = null;
    options = null;
  }
}

async function openOwnedBackendClient(options, serviceDispatchEnabled, sequentialEnabled = false,
  persistentCustody = false, responseObservationEnabled = false, originalPaymentCheckpointEnabled = false) {
  let client = null, backend = null, config = null;
  try {
    config = exact(options, serviceDispatchEnabled ? SQLITE_DISPATCH_FIELDS : SQLITE_FIELDS);
    if (serviceDispatchEnabled
        && (typeof config.requestImpl !== 'function' || IS_PROXY(config.requestImpl))) {
      throw failure('INVALID_CONFIGURATION');
    }
    const selectedGrantId = KEY({ grantId: config.selectedGrantId, requestId: 'scope' }).grantId;
    backend = CREATE_BACKEND({ store: config.backendStore, admittedGrantId: selectedGrantId });
    const OPEN = originalPaymentCheckpointEnabled ? OPEN_SQLITE_CLIENT_V6
      : responseObservationEnabled ? OPEN_SQLITE_CLIENT_V5
      : persistentCustody ? OPEN_SQLITE_CLIENT_V4 : OPEN_SQLITE_CLIENT;
    client = OPEN({
      databasePath: config.databasePath,
      allowedRoot: config.allowedRoot,
      fundingResourceUrl: config.fundingResourceUrl,
      custodyPolicy: config.custodyPolicy,
      selectedGrantId,
      requestImpl: serviceDispatchEnabled ? config.requestImpl : NO_DISPATCH,
      deadlineMs: config.deadlineMs,
    });
    const connected = connectClientBackend(
      client, backend, selectedGrantId, 'PAYER_OWNED_BACKEND_BORROWED', serviceDispatchEnabled,
      responseObservationEnabled,
      originalPaymentCheckpointEnabled,
    );
    const result = sequentialEnabled ? connectSequentialBackendClient(
      connected, selectedGrantId, persistentCustody, responseObservationEnabled,
      originalPaymentCheckpointEnabled,
    ) : connected;
    client = null;
    backend = null;
    return result;
  } catch (error) {
    if (backend !== null) backend.close();
    if (client !== null) await client.close();
    throw error;
  } finally {
    config = null;
    options = null;
  }
}

function connectSequentialBackendClient(client, selectedGrantId, persistentCustody = false,
  responseObservationEnabled = false, originalPaymentCheckpointEnabled = false) {
  const ROOT_SNAPSHOT = client.snapshot;
  const ROOT_CLOSE = client.close;
  const ROOT_ORIGINAL = client.readOriginal;
  const ROOT_STATE = client.readOriginalRecoveryState;
  const ROOT_KEYS = client.readOriginalRecoveryKeys;
  const ROOT_BACKEND = client.readOriginalBackendRecoveryState;
  const ROOT_CHECKPOINT = originalPaymentCheckpointEnabled ? client.readOriginalPaymentCheckpoint : null;
  const runner = CREATE_RUNNER({
    submitOriginal: client.submitOriginal,
    snapshot: () => ROOT_SNAPSHOT().client.client,
    close: ROOT_CLOSE,
    selectedGrantId,
    storeOwnership: originalPaymentCheckpointEnabled ? 'OWNED_EXISTING_V6_ORIGINAL_PAYMENT'
      : responseObservationEnabled ? 'OWNED_EXISTING_V5_RESPONSE_OBSERVATION'
      : persistentCustody ? 'OWNED_EXISTING_V4_CUSTODY_QUARANTINE' : 'OWNED_EXISTING_V3_DISPATCH_INTENT',
  });
  const RUNNER_SNAPSHOT = runner.snapshot;
  client = null;
  const snapshot = FREEZE(function snapshot() {
    if (arguments.length !== 0) throw failure('INVALID_INPUT');
    const connection = ROOT_SNAPSHOT(), sequence = RUNNER_SNAPSHOT();
    const owned = connection.client;
    return FREEZE({
      connection,
      runner: sequence,
      unknown: sequence.unknown || connection.unavailable
        || owned.close.childUncertainty === true || owned.close.unknownUndrained === true
        || owned.resource.phase === 'HELD' || owned.resource.storeCloseOutcome === 'UNKNOWN',
      unknownUndrained: sequence.unknownUndrained || owned.close.unknownUndrained === true,
      storeOwnership: 'PAYER_OWNED_BACKEND_BORROWED',
      serviceDispatchCapability: 'EXPLICIT_SEQUENTIAL_BATCH_ONLY',
      qualification: 'UNQUALIFIED',
      authority: 'NONE',
      currentAuthority: 'NOT_ESTABLISHED',
      realReady: 'NOT_ESTABLISHED',
      serviceDelivery: 'NOT_ESTABLISHED',
      restart: 'NOT_ESTABLISHED',
      physicalDurability: 'NOT_ESTABLISHED',
      pilot: 'NOT_ESTABLISHED',
    });
  });
  return FREEZE({
    runOriginals: runner.runOriginals,
    readOriginal: ROOT_ORIGINAL,
    readOriginalRecoveryState: ROOT_STATE,
    readOriginalRecoveryKeys: ROOT_KEYS,
    readOriginalBackendRecoveryState: ROOT_BACKEND,
    ...(originalPaymentCheckpointEnabled ? { readOriginalPaymentCheckpoint: ROOT_CHECKPOINT } : {}),
    snapshot,
    close: runner.close,
  });
}

function connectClientBackend(client, backend, selectedGrantId, storeOwnership, serviceDispatchEnabled = false,
  responseObservationEnabled = false, originalPaymentCheckpointEnabled = false) {
  const LOCAL_READ = client.readOriginalRecoveryState;
  const LOCAL_CLOSE = client.close;
  const LOCAL_SNAPSHOT = client.snapshot;
  const BACKEND_READ = backend.readExactOriginal;
  const BACKEND_CLOSE = backend.close;
  const LOCAL_ORIGINAL = client.readOriginal;
  const LOCAL_KEYS = client.readOriginalRecoveryKeys;
  const LOCAL_SUBMIT = serviceDispatchEnabled ? client.submitOriginal : null;
  const LOCAL_CHECKPOINT = originalPaymentCheckpointEnabled ? client.readOriginalPaymentCheckpoint : null;
  client = null;
  backend = null;
  let closed = false, reading = false, unavailable = false;

  const readOriginalBackendRecoveryState = FREEZE(function readOriginalBackendRecoveryState(keyValue, authorizationHeader) {
    if (closed) throw failure('CLOSED');
    if (reading) throw failure('BUSY');
    if (unavailable) throw failure('UNAVAILABLE');
    if (LOCAL_SUBMIT !== null) {
      let active;
      try { active = LOCAL_SNAPSHOT().client.owner.active; }
      catch { unavailable = true; throw failure('UNAVAILABLE'); }
      if (active === true) throw failure('BUSY');
      if (active !== false) { unavailable = true; throw failure('UNAVAILABLE'); }
    }
    if (arguments.length !== (originalPaymentCheckpointEnabled ? 3 : 2)
        || (originalPaymentCheckpointEnabled && arguments[2] === undefined)
        || typeof authorizationHeader !== 'string'
        || authorizationHeader.length === 0 || authorizationHeader.length > 1024
        || APPLY(BYTE_LENGTH, Buffer, [authorizationHeader, 'utf8']) > 1024) {
      throw failure('INVALID_INPUT');
    }
    let key = KEY(keyValue);
    if (key.grantId !== selectedGrantId) throw failure('FOREIGN_GRANT');
    reading = true;
    let before = null, after = null, expected = null, envelope = null;
    let checkpoint = null, checkpointText = null, checkpointPins = null;
    try {
      if (originalPaymentCheckpointEnabled) {
        checkpoint = LOCAL_CHECKPOINT(arguments[2]);
        if (checkpoint === null) throw failure('ORIGINAL_PAYMENT_CHECKPOINT_UNAVAILABLE');
        checkpointText = CHECKPOINT_TEXT(checkpoint);
        // The first read matched the caller's independent pins. Its frozen
        // binding/digests are now this query's fixed witness, not mutable pins
        // borrowed from the backend callback or a new trust root from the DB.
        checkpointPins = FREEZE({ binding: checkpoint.binding, digests: checkpoint.digests });
        checkpoint = null;
      }
      before = LOCAL_READ(key);
      if (closed) throw failure('CLOSED');
      if (before === null) return view('CLIENT_ORIGINAL_NOT_RECORDED');
      const originalText = SERIALIZE(before.original);
      const fundingText = STRINGIFY(before.funding);
      const uncertaintyText = STRINGIFY(before.uncertainty);
      const dispatchText = intentText(before);
      const responseText = responseObservationEnabled ? STRINGIFY(before.responseObservation) : null;
      const responseStatus = responseObservationEnabled ? before.responseStatus : null;
      expected = PARSE(before.original.originalRequestJson);
      envelope = FREEZE({ url: '/service-credit/v1/execute', method: 'POST',
        rawHeaders: FREEZE(['Authorization', authorizationHeader]) });
      const observed = BACKEND_READ(envelope, expected);
      if (closed) throw failure('CLOSED');
      after = LOCAL_READ(key);
      if (closed) throw failure('CLOSED');
      if (originalPaymentCheckpointEnabled) {
        checkpoint = LOCAL_CHECKPOINT(checkpointPins);
        if (checkpoint === null || CHECKPOINT_TEXT(checkpoint) !== checkpointText) {
          throw failure('ORIGINAL_PAYMENT_CHECKPOINT_CHANGED');
        }
        if (closed) throw failure('CLOSED');
        checkpoint = null;
      }
      if (after === null || SERIALIZE(after.original) !== originalText
          || STRINGIFY(after.funding) !== fundingText || STRINGIFY(after.uncertainty) !== uncertaintyText
          || intentText(after) !== dispatchText
          || (responseObservationEnabled && (STRINGIFY(after.responseObservation) !== responseText
            || after.responseStatus !== responseStatus))) {
        throw failure('CLIENT_BINDING_CHANGED');
      }
      const uncertain = after.funding.status !== 'BOUND' || after.funding.ambiguityLatched
        || after.uncertainty.custody || after.uncertainty.submission || after.uncertainty.undrained
        || after.uncertainty.declaredFundingAmbiguitySeen
        || after.dispatchIntent !== null;
      if (observed.status === 'UNAVAILABLE' || observed.status === 'CLOSED') unavailable = true;
      return view(uncertain ? 'CLIENT_RECONCILIATION_REQUIRED' : observed.status, after, observed);
    } catch (error) {
      if (closed) throw failure('CLOSED');
      unavailable = true;
      // Preserve the actual client's fixed read error instead of retrying it.
      throw error;
    } finally {
      reading = false;
      key = null;
      keyValue = null;
      authorizationHeader = null;
      before = null;
      after = null;
      expected = null;
      envelope = null;
      checkpoint = null;
      checkpointText = null;
      checkpointPins = null;
    }
  });
  const readOriginalPaymentCheckpoint = LOCAL_CHECKPOINT === null ? null
    : FREEZE(function readOriginalPaymentCheckpoint(expectedPins) {
      if (arguments.length !== 1) throw failure('INVALID_INPUT');
      if (closed) throw failure('CLOSED');
      if (reading) throw failure('BUSY');
      return LOCAL_CHECKPOINT(expectedPins);
    });
  const submitOriginal = LOCAL_SUBMIT === null ? null : FREEZE(function submitOriginal(...args) {
    if (args.length !== 1) return rejected('INVALID_INPUT');
    if (closed) return rejected('CLOSED');
    if (reading) return rejected('BUSY');
    if (unavailable) return rejected('UNAVAILABLE');
    return LOCAL_SUBMIT(args[0]);
  });
  const close = FREEZE(function close(...args) {
    if (args.length !== 0) return APPLY(LOCAL_CLOSE, undefined, args);
    if (!closed) { closed = true; BACKEND_CLOSE(); }
    return LOCAL_CLOSE();
  });
  const snapshot = FREEZE(function snapshot() {
    if (arguments.length !== 0) throw failure('INVALID_INPUT');
    return FREEZE({ client: LOCAL_SNAPSHOT(), closed, reading, unavailable,
      storeOwnership, authority: 'NONE', serviceDelivery: 'NOT_ESTABLISHED',
      ...(LOCAL_SUBMIT === null ? {} : { serviceDispatchCapability: 'EXPLICIT_CALLER_TRANSPORT_ONLY' }) });
  });
  return FREEZE({
    ...(LOCAL_SUBMIT === null ? {} : { submitOriginal }),
    readOriginal: LOCAL_ORIGINAL,
    readOriginalRecoveryState: LOCAL_READ,
    readOriginalRecoveryKeys: LOCAL_KEYS,
    readOriginalBackendRecoveryState,
    ...(LOCAL_CHECKPOINT === null ? {} : { readOriginalPaymentCheckpoint }),
    snapshot,
    close,
  });
}
