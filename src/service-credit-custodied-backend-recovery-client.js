import { createServiceCreditCustodiedBackendRecoveryCore } from './service-credit-custodied-backend-recovery-core.js';
import { types as utilTypes } from 'node:util';
import { createServiceCreditCustodiedHttpClientV3 } from './service-credit-custodied-http-client.js';
import { openServiceCreditCustodiedSqliteHttpClientV3 } from './service-credit-custodied-sqlite-http-client.js';
import { openServiceCreditCustodiedSqliteHttpClientV4 } from './service-credit-custodied-sqlite-http-client.js';
import { openServiceCreditCustodiedSqliteHttpClientV5 } from './service-credit-custodied-sqlite-http-client.js';
import { openServiceCreditCustodiedSqliteHttpClientV6 } from './service-credit-custodied-sqlite-http-client.js';
import { openServiceCreditCustodiedSqliteRecoveryReaderV5 } from './service-credit-custodied-sqlite-recovery-reader.js';
import { openServiceCreditCustodiedSqliteRecoveryReaderV6 } from './service-credit-custodied-sqlite-recovery-reader.js';
import { createServiceCreditBackendOriginalOutcomeReader } from './service-credit-backend-original-outcome-reader.js';
import { createServiceCreditCustodiedSequentialRunnerCore } from './service-credit-custodied-sequential-runner-core.js';
import {
  snapshotOriginalServiceRequestCustodyKey,
} from './service-credit-original-request-custody-contract.js';

const KEYS = Reflect.ownKeys;
const DESCRIPTOR = Object.getOwnPropertyDescriptor;
const PROTOTYPE = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const FREEZE = Object.freeze;
const DEFINE = Object.defineProperty;
const IS_PROXY = utilTypes.isProxy;
const KEY = snapshotOriginalServiceRequestCustodyKey;
const CONNECT_BACKEND = createServiceCreditCustodiedBackendRecoveryCore;
const CREATE_CLIENT = createServiceCreditCustodiedHttpClientV3;
const OPEN_SQLITE_CLIENT = openServiceCreditCustodiedSqliteHttpClientV3;
const OPEN_SQLITE_CLIENT_V4 = openServiceCreditCustodiedSqliteHttpClientV4;
const OPEN_SQLITE_CLIENT_V5 = openServiceCreditCustodiedSqliteHttpClientV5;
const OPEN_SQLITE_CLIENT_V6 = openServiceCreditCustodiedSqliteHttpClientV6;
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
  return CONNECT_BACKEND(client, backend, selectedGrantId, 'BOTH_BORROWED');
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
    const connection = CONNECT_BACKEND(
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

/**
 * Connect existing diagnostic plan/collection consumers to V6 persistent
 * original-payment custody and the actual borrowed backend. All diagnostic
 * factories capture the SAME owned reader; they do not open another payer.
 * Combined backend reads require the original independent checkpoint pins
 * on every query, as in the existing V6 client. Explicit checkpoint reads
 * remain separate powerless DATA and are absent from snapshots/plans.
 *
 * Diagnostic close detaches local cached history only. Root close remains
 * the original cached Promise, including UNKNOWN, and never closes the
 * borrowed backend. No submission, batch, caller transport, root/store,
 * creation, migration, signer, replay/reset or payment authority is exposed.
 * Existing V5 consumer and default/application entry points are unchanged.
 */
export async function openServiceCreditCustodiedSqliteBackendRecoveryConsumerV6(options) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  let config = null, backend = null, reader = null;
  try {
    config = exact(options, SQLITE_FIELDS);
    const selectedGrantId = KEY({ grantId: config.selectedGrantId, requestId: 'scope' }).grantId;
    backend = CREATE_BACKEND({ store: config.backendStore, admittedGrantId: selectedGrantId });
    reader = await openServiceCreditCustodiedSqliteRecoveryReaderV6({
      databasePath: config.databasePath,
      allowedRoot: config.allowedRoot,
      fundingResourceUrl: config.fundingResourceUrl,
      custodyPolicy: config.custodyPolicy,
      selectedGrantId,
      deadlineMs: config.deadlineMs,
    });
    const connection = CONNECT_BACKEND(
      reader, backend, selectedGrantId, 'PAYER_OWNED_BACKEND_BORROWED', false, true, true,
    );
    const consumer = FREEZE({
      readOriginal: connection.readOriginal,
      readOriginalRecoveryState: connection.readOriginalRecoveryState,
      readOriginalRecoveryKeys: connection.readOriginalRecoveryKeys,
      readOriginalBackendRecoveryState: connection.readOriginalBackendRecoveryState,
      readOriginalPaymentCheckpoint: connection.readOriginalPaymentCheckpoint,
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
    const connected = CONNECT_BACKEND(
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
