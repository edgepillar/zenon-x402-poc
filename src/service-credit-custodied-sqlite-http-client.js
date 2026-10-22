import { Buffer } from 'node:buffer';
import { dirname, isAbsolute, resolve } from 'node:path';
import { types as utilTypes } from 'node:util';
import {
  openZenonFundingPayerRecoveryCustodySqliteStoreV2,
  openZenonFundingPayerRecoveryDispatchIntentSqliteStoreV3,
  openZenonFundingPayerRecoveryCustodyQuarantineSqliteStoreV4,
  openZenonFundingPayerRecoveryResponseObservationSqliteStoreV5,
  openZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6,
  ZenonFundingPayerRecoverySqliteStore,
  ZenonFundingPayerRecoverySqliteStoreError,
} from './service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js';
import {
  createServiceCreditCustodiedHttpClient,
  createServiceCreditCustodiedHttpClientV3,
  createServiceCreditCustodiedHttpClientV4,
  createServiceCreditCustodiedHttpClientV5,
} from './service-credit-custodied-http-client.js';
import {
  snapshotOriginalServiceRequestCustodyPolicy,
  snapshotOriginalServiceRequestCustodyKey,
} from './service-credit-original-request-custody-contract.js';

const APPLY = Reflect.apply;
const OWN_KEYS = Reflect.ownKeys;
const DESCRIPTOR = Object.getOwnPropertyDescriptor;
const PROTOTYPE = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const DEFINE = Object.defineProperty;
const FREEZE = Object.freeze;
const IS = Object.is;
const IS_SAFE = Number.isSafeInteger;
const IS_PROXY = utilTypes.isProxy;
const IS_PROMISE = utilTypes.isPromise;
const OBJECT_PROTOTYPE = Object.prototype;
const TYPE_ERROR = TypeError;
const BYTE_LENGTH = Buffer.byteLength;
const INCLUDES = String.prototype.includes;
const DIRNAME = dirname;
const IS_ABSOLUTE = isAbsolute;
const RESOLVE = resolve;
const NativePromise = Promise;
const PROMISE_PROTOTYPE = NativePromise.prototype;
const THEN = PROMISE_PROTOTYPE.then;
const SPECIES = Symbol.species;
const NATIVE_SPECIES = DESCRIPTOR(NativePromise, SPECIES);
const OPEN_V2 = openZenonFundingPayerRecoveryCustodySqliteStoreV2;
const OPEN_V3 = openZenonFundingPayerRecoveryDispatchIntentSqliteStoreV3;
const OPEN_V4 = openZenonFundingPayerRecoveryCustodyQuarantineSqliteStoreV4;
const OPEN_V5 = openZenonFundingPayerRecoveryResponseObservationSqliteStoreV5;
const OPEN_V6 = openZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6;
const CREATE_CLIENT = createServiceCreditCustodiedHttpClient;
const CREATE_CLIENT_V3 = createServiceCreditCustodiedHttpClientV3;
const CREATE_CLIENT_V4 = createServiceCreditCustodiedHttpClientV4;
const CREATE_CLIENT_V5 = createServiceCreditCustodiedHttpClientV5;
const POLICY = snapshotOriginalServiceRequestCustodyPolicy;
const KEY = snapshotOriginalServiceRequestCustodyKey;
const STORE_PROTOTYPE = ZenonFundingPayerRecoverySqliteStore.prototype;
const STORE_ERROR_PROTOTYPE = ZenonFundingPayerRecoverySqliteStoreError.prototype;
const STORE_CLOSE = DESCRIPTOR(STORE_PROTOTYPE, 'close')?.value;
const STORE_READ_CHECKPOINT = DESCRIPTOR(STORE_PROTOTYPE, 'getOriginalPaymentCheckpoint')?.value;
const PREFIX = 'SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_';
const STORE_PREFIX = 'ZENON_FUNDING_PAYER_RECOVERY_STORE_';
const CONFIG_FIELDS = FREEZE([
  'databasePath', 'allowedRoot', 'fundingResourceUrl', 'custodyPolicy',
  'selectedGrantId', 'requestImpl', 'deadlineMs',
]);

// Only these current store refusals have a reviewed non-held acquisition path.
// OPEN_FAILED, CLOSE_FAILED and unrecognized native exceptions are not included.
// Releasing this local resource slot is not a rollback or OS-cleanup receipt.
const RELEASABLE_REFUSALS = FREEZE([
  'INVALID_CONFIGURATION',
  'UNSAFE_DIRECTORY',
  'UNSAFE_FILE',
  'UNEXPECTED_SIDECAR',
  'SCHEMA_UNSUPPORTED',
  'CORRUPT',
  'OWNER_BUSY',
]);

// One resource slot per evaluated module instance. This is neither a payment
// admission counter nor an OS/process-global lock. No reset API is provided.
let resourceSlot = null;

/**
 * Opt-in ownership of one EXISTING V2 SQLite store and the actual HTTP client.
 * Source implementation draft: native SQLite integration remains NOT_RUN.
 * Static review and syntax checks do not qualify this resource owner.
 *
 * No create fallback, migration, initialization, funding/preparation/recovery
 * operation, signer, verifier, default transport or operational entry point.
 * Successful open advances the store's existing owner_epoch only. That is not
 * consumed-context, payer/provider/policy/proof or restart authority.
 *
 * Pure configuration checks finish before the store factory can perform I/O.
 * The actual store owns schema, journal, funding and custody validation.
 * The actual child owns request preflight, retention and dispatch lifecycle.
 *
 * Root close is a new cached native Promise. It closes admission synchronously,
 * observes child close settlement and then attempts the original store.close
 * exactly once. It never returns the child's Promise as the root Promise.
 *
 * The current store sets its closed bit before DatabaseSync.close(). A thrown
 * native close must remain HELD; a later no-op cannot establish cleanup.
 *
 * Normal DB close releases only this module resource slot. A rejected child
 * remains unknown and root close still rejects. UNKNOWN_UNDRAINED remains
 * explicit. DB closure proves neither network cleanup, service delivery,
 * durability, commit certainty nor current authority.
 *
 * Native intrinsics, current component implementations, synchronous native
 * store close and caller transport behavior remain premises. This library
 * establishes no real READY, live activation, restart or pilot qualification.
 */
export function openServiceCreditCustodiedSqliteHttpClient(configuration) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return openOwnedClient(configuration, false);
}
export function openServiceCreditCustodiedSqliteHttpClientV3(configuration) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return openOwnedClient(configuration, true);
}
/**
 * Explicit ownership of one EXISTING V4 store and the V4 HTTP child. There is
 * no create fallback, migration, funding or implicit live transport. A fresh
 * child reads the stored grant quarantine before any new submission. Child
 * uncertainty still rejects root close even when the owned store close returns
 * and releases this module's resource slot. Closing/reopening never resets the
 * marker or establishes restart, payment, cleanup or service authority.
 */
export function openServiceCreditCustodiedSqliteHttpClientV4(configuration) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return openOwnedClient(configuration, true, true);
}
/**
 * Explicit ownership of one EXISTING V5 response-observation store and the V5
 * HTTP child. Reuses the original slot, acquisition-refusal and one-close path.
 * No create fallback, V4 adoption, migration, funding, signing, replay or
 * implicit transport selection. Selected unobserved intents remain fenced.
 * Successful response storage/normal reopen establishes local DATA only,
 * never authenticated delivery, process/crash durability or new authority.
 */
export function openServiceCreditCustodiedSqliteHttpClientV5(configuration) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return openOwnedClient(configuration, true, true, true);
}
/**
 * Explicit EXISTING V6 owner. The existing V5 child/one-close lifecycle is
 * reused. Only a caller-pinned, read-only original-payment checkpoint view is
 * added; it never calls funding prepare/recovery, dispatch or signing. It is
 * not returned by snapshots or reduced to grant/service-request metadata.
 * No V5 adoption, missing-checkpoint repair, new transport or default cutover.
 * Normal close/reopen proves neither restart safety nor payment authority.
 */
export function openServiceCreditCustodiedSqliteHttpClientV6(configuration) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return openOwnedClient(configuration, true, true, true, true);
}
function openOwnedClient(configuration, dispatchIntentEnabled, persistentCustody = false,
  responseObservationEnabled = false, originalPaymentCheckpointEnabled = false) {

  let input, policy, selected;
  try {
    input = exact(configuration, CONFIG_FIELDS);
    if (typeof input.requestImpl !== 'function' || IS_PROXY(input.requestImpl)
        || !IS_SAFE(input.deadlineMs) || input.deadlineMs < 1
        || input.deadlineMs > 60000 || IS(input.deadlineMs, -0)
        || typeof STORE_CLOSE !== 'function' || IS_PROXY(STORE_CLOSE)
        || (originalPaymentCheckpointEnabled && (typeof STORE_READ_CHECKPOINT !== 'function'
          || IS_PROXY(STORE_READ_CHECKPOINT)))) {
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
    selected = KEY({
      grantId: input.selectedGrantId,
      requestId: 'scope',
    });
  } catch {
    throw failure('INVALID_CONFIGURATION');
  }

  if (resourceSlot !== null) {
    throw failure(resourceSlot.phase === 'HELD'
      ? 'RESOURCE_HELD' : 'RESOURCE_BUSY');
  }

  const slot = {
    phase: 'ACQUIRING',
    store: null,
    storeAcquired: false,
    admissionClosed: false,
    storeCloseAttempts: 0,
    storeCloseOutcome: 'NOT_ATTEMPTED',
  };
  resourceSlot = slot;

  try {
    slot.store = (originalPaymentCheckpointEnabled ? OPEN_V6
      : responseObservationEnabled ? OPEN_V5 : persistentCustody ? OPEN_V4
      : dispatchIntentEnabled ? OPEN_V3 : OPEN_V2)({
      databasePath: input.databasePath,
      allowedRoot: input.allowedRoot,
      resourceUrl: input.fundingResourceUrl,
      custodyPolicy: policy,
    });
    slot.storeAcquired = true;
    if (typeof slot.store !== 'object' || slot.store === null
        || IS_PROXY(slot.store) || PROTOTYPE(slot.store) !== STORE_PROTOTYPE) {
      slot.phase = 'HELD';
      throw failure('ACQUISITION_HELD');
    }
    const facade = composeOwned(slot, input, policy, selected.grantId,
      dispatchIntentEnabled, persistentCustody, responseObservationEnabled, originalPaymentCheckpointEnabled);
    slot.phase = 'OPEN';
    return facade;
  } catch (error) {
    slot.admissionClosed = true;
    if (slot.storeAcquired) {
      // No facade was returned and no submission was exposed during
      // construction. Attempt the owned close once, including composition
      // failure. A failed close retains the exact store reference.
      if (!closeOwnedStore(slot)) throw failure('ACQUISITION_HELD');
      throw failure('ACQUISITION_FAILED');
    }
    if (releasableRefusal(error)) {
      slot.phase = 'RELEASED';
      if (resourceSlot === slot) resourceSlot = null;
      throw failure('ACQUISITION_FAILED');
    }
    slot.phase = 'HELD';
    throw failure('ACQUISITION_HELD');
  } finally {
    input = null;
    policy = null;
    selected = null;
    configuration = null;
  }
}

function composeOwned(slot, input, policy, selectedGrantId, dispatchIntentEnabled, persistentCustody,
  responseObservationEnabled, originalPaymentCheckpointEnabled) {
  let child = (responseObservationEnabled ? CREATE_CLIENT_V5 : persistentCustody ? CREATE_CLIENT_V4
    : dispatchIntentEnabled ? CREATE_CLIENT_V3 : CREATE_CLIENT)({
    store: slot.store,
    fundingResourceUrl: input.fundingResourceUrl,
    custodyPolicy: policy,
    selectedGrantId,
    requestImpl: input.requestImpl,
    deadlineMs: input.deadlineMs,
  });
  const CHILD_SUBMIT = child.submitOriginal;
  const CHILD_READ = child.readOriginal;
  const CHILD_READ_RECOVERY_STATE = child.readOriginalRecoveryState;
  const CHILD_READ_RECOVERY_KEYS = dispatchIntentEnabled ? child.readOriginalRecoveryKeys : null;
  const CHILD_SNAPSHOT = child.snapshot;
  const CHILD_CLOSE = child.close;
  child = null;
  input = null;
  policy = null;
  selectedGrantId = null;

  let closeCapability = null;
  let closeFinished = false;
  let childCloseOutcome = 'NOT_REQUESTED';
  let childUncertainty = false;
  let unknownUndrained = false;
  let closeOutcome = 'NOT_REQUESTED';

  function holdUnobservableChild() {
    if (closeFinished) return;
    closeFinished = true;
    childCloseOutcome = 'UNOBSERVABLE';
    childUncertainty = true;
    unknownUndrained = true;
    closeOutcome = 'UNOBSERVABLE_CHILD';
    slot.phase = 'HELD';
    closeCapability.reject(failure('CHILD_CLOSE_UNOBSERVABLE'));
  }

  function childSettled(fulfilled, value) {
    if (closeFinished) return;
    childCloseOutcome = fulfilled
      ? value === undefined ? 'FULFILLED' : 'INVALID_VALUE'
      : 'REJECTED';

    let view, flags;
    try {
      view = CHILD_SNAPSHOT();
      flags = childFlags(view);
      // The actual child closes admission before returning its close Promise.
      // Do not close a store if that private contract is unobservable.
      if (view.owner.closed !== true || view.owner.active !== false) {
        holdUnobservableChild();
        return;
      }
    } catch {
      holdUnobservableChild();
      return;
    }

    childUncertainty = !fulfilled || value !== undefined || flags.unknown;
    unknownUndrained = unknownUndrained || flags.undrained;

    // Child settlement is observed before the independent owned DB release.
    // No future submit/read can pass this root's synchronous closed gate.
    const storeReturned = closeOwnedStore(slot);
    closeFinished = true;
    if (!storeReturned) {
      closeOutcome = childUncertainty ? 'BOTH_UNKNOWN' : 'STORE_UNKNOWN';
      closeCapability.reject(failure(childUncertainty
        ? 'CHILD_AND_STORE_UNKNOWN' : 'STORE_CLOSE_UNKNOWN'));
    } else if (childUncertainty) {
      closeOutcome = 'CHILD_UNKNOWN';
      closeCapability.reject(failure('CHILD_OUTCOME_UNKNOWN'));
    } else {
      closeOutcome = 'DRAINED';
      closeCapability.resolve(undefined);
    }
  }

  function submitOriginal(...args) {
    if (args.length !== 1) return rejected('INVALID_INPUT');
    if (slot.admissionClosed) return rejected('CLOSED');
    return CHILD_SUBMIT(args[0]);
  }

  function readOriginal(...args) {
    if (args.length !== 1) throw failure('INVALID_INPUT');
    if (slot.admissionClosed) throw failure('CLOSED');
    return CHILD_READ(args[0]);
  }

  function readOriginalRecoveryState(key) {
    if (arguments.length !== 1) throw failure('INVALID_INPUT');
    if (slot.admissionClosed) throw failure('CLOSED');
    return CHILD_READ_RECOVERY_STATE(key);
  }

  function readOriginalRecoveryKeys() {
    if (arguments.length !== 0) throw failure('INVALID_INPUT');
    if (slot.admissionClosed) throw failure('CLOSED');
    return CHILD_READ_RECOVERY_KEYS();
  }

  function readOriginalPaymentCheckpoint(expectedPins) {
    if (arguments.length !== 1) throw failure('INVALID_INPUT');
    if (slot.admissionClosed) throw failure('CLOSED');
    if (CHILD_SNAPSHOT().owner.active) throw failure('BUSY');
    // Captured store method, not a second resource owner or recovery action.
    return APPLY(STORE_READ_CHECKPOINT, slot.store, [expectedPins]);
  }

  function snapshot(...args) {
    if (args.length !== 0) throw failure('INVALID_INPUT');
    const view = CHILD_SNAPSHOT();
    const flags = childFlags(view);
    return FREEZE({
      resource: FREEZE({
        phase: slot.phase,
        slotHeld: resourceSlot === slot,
        ownership: originalPaymentCheckpointEnabled ? 'OWNED_EXISTING_V6_ORIGINAL_PAYMENT'
          : responseObservationEnabled ? 'OWNED_EXISTING_V5_RESPONSE_OBSERVATION'
          : persistentCustody ? 'OWNED_EXISTING_V4_CUSTODY_QUARANTINE'
          : dispatchIntentEnabled ? 'OWNED_EXISTING_V3_DISPATCH_INTENT' : 'OWNED_EXISTING_V2',
        storeAcquired: slot.storeAcquired,
        admissionClosed: slot.admissionClosed,
        storeCloseAttempts: slot.storeCloseAttempts,
        storeCloseOutcome: slot.storeCloseOutcome,
      }),
      close: FREEZE({
        requested: closeCapability !== null,
        childOutcome: childCloseOutcome,
        childUncertainty: childUncertainty || flags.unknown,
        unknownUndrained: unknownUndrained || flags.undrained,
        outcome: closeOutcome,
      }),
      client: view,
      qualification: 'UNQUALIFIED',
      actualPersistence: 'NOT_ESTABLISHED',
      restart: 'NOT_ESTABLISHED',
      currentAuthority: 'NOT_ESTABLISHED',
      realReady: 'NOT_ESTABLISHED',
      serviceDelivery: 'NOT_ESTABLISHED',
      osCleanup: 'NOT_ESTABLISHED',
    });
  }

  function close(...args) {
    if (args.length !== 0) return rejected('INVALID_INPUT');
    if (closeCapability !== null) return closeCapability.promise;

    // Cache root identity and close admission before invoking private child
    // code, so synchronous reentrancy sees a closed root and occupied slot.
    closeCapability = capability();
    slot.admissionClosed = true;
    slot.phase = 'CLOSING';
    childCloseOutcome = 'WAITING';
    closeOutcome = 'WAITING';

    try {
      const observed = CHILD_CLOSE();
      if (observed === closeCapability.promise || !safePromise(observed)) {
        holdUnobservableChild();
      } else {
        APPLY(THEN, observed, [
          value => { childSettled(true, value); },
          () => { childSettled(false, undefined); },
        ]);
      }
    } catch {
      holdUnobservableChild();
    }
    return closeCapability.promise;
  }

  return FREEZE({
    submitOriginal: FREEZE(submitOriginal),
    readOriginal: FREEZE(readOriginal),
    readOriginalRecoveryState: FREEZE(readOriginalRecoveryState),
    ...(dispatchIntentEnabled ? { readOriginalRecoveryKeys: FREEZE(readOriginalRecoveryKeys) } : {}),
    ...(originalPaymentCheckpointEnabled ? { readOriginalPaymentCheckpoint: FREEZE(readOriginalPaymentCheckpoint) } : {}),
    snapshot: FREEZE(snapshot),
    close: FREEZE(close),
  });
}

function childFlags(view) {
  const uncertainty = view.owner.uncertainty;
  const transport = view.lastTransport;
  const undrained = uncertainty.undrained === true
    || transport?.undrained === true;
  return {
    unknown: uncertainty.custody === true || uncertainty.submission === true
      || undrained || transport?.unknown === true,
    undrained,
  };
}

function closeOwnedStore(slot) {
  if (slot.storeCloseAttempts !== 0) {
    return slot.storeCloseOutcome === 'RETURNED';
  }
  slot.storeCloseAttempts = 1;
  slot.storeCloseOutcome = 'WAITING';
  slot.phase = 'CLOSING';
  try {
    if (slot.store === null) throw failure('STORE_CLOSE_UNKNOWN');
    const returned = APPLY(STORE_CLOSE, slot.store, []);
    if (returned !== undefined) throw failure('STORE_CLOSE_UNKNOWN');
  } catch {
    slot.storeCloseOutcome = 'UNKNOWN';
    slot.phase = 'HELD';
    return false;
  }
  slot.storeCloseOutcome = 'RETURNED';
  slot.store = null;
  slot.phase = 'RELEASED';
  if (resourceSlot === slot) resourceSlot = null;
  return true;
}

function releasableRefusal(error) {
  try {
    if (typeof error !== 'object' || error === null || IS_PROXY(error)
        || PROTOTYPE(error) !== STORE_ERROR_PROTOTYPE) return false;
    const code = ownValue(error, 'code');
    if (typeof code !== 'string'
        || ownValue(error, 'name') !== 'ZenonFundingPayerRecoverySqliteStoreError'
        || ownValue(error, 'message') !== code
        || ownValue(error, 'stack')
          !== 'ZenonFundingPayerRecoverySqliteStoreError: ' + code) return false;
    for (let index = 0; index < RELEASABLE_REFUSALS.length; index++) {
      if (code === STORE_PREFIX + RELEASABLE_REFUSALS[index]) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function ownValue(value, field) {
  const descriptor = DESCRIPTOR(value, field);
  if (descriptor === undefined || !HAS_OWN(descriptor, 'value')) {
    throw failure('INVALID_INPUT');
  }
  return descriptor.value;
}

function exact(value, fields) {
  if (typeof value !== 'object' || value === null || IS_PROXY(value)
      || PROTOTYPE(value) !== OBJECT_PROTOTYPE) {
    throw failure('INVALID_CONFIGURATION');
  }
  const keys = OWN_KEYS(value);
  if (keys.length !== fields.length) throw failure('INVALID_CONFIGURATION');
  const result = {};
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index];
    const descriptor = DESCRIPTOR(value, field);
    if (descriptor === undefined || descriptor.enumerable !== true
        || !HAS_OWN(descriptor, 'value')) throw failure('INVALID_CONFIGURATION');
    result[field] = descriptor.value;
  }
  return result;
}

function pathText(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096
      || APPLY(BYTE_LENGTH, Buffer, [value, 'utf8']) > 4096
      || APPLY(INCLUDES, value, ['\0'])) {
    throw failure('INVALID_CONFIGURATION');
  }
}

function safePromise(value) {
  try {
    if (typeof value !== 'object' || value === null || IS_PROXY(value)
        || !IS_PROMISE(value) || PROTOTYPE(value) !== PROMISE_PROTOTYPE) return false;
    const ownConstructor = DESCRIPTOR(value, 'constructor');
    if (ownConstructor !== undefined
        && (!HAS_OWN(ownConstructor, 'value')
          || ownConstructor.value !== NativePromise)) return false;
    const constructor = DESCRIPTOR(PROMISE_PROTOTYPE, 'constructor');
    if (!constructor || !HAS_OWN(constructor, 'value')
        || constructor.value !== NativePromise) return false;
    const species = DESCRIPTOR(NativePromise, SPECIES);
    if (!species || !NATIVE_SPECIES) return false;
    if (HAS_OWN(NATIVE_SPECIES, 'value')) {
      return HAS_OWN(species, 'value') && species.value === NATIVE_SPECIES.value;
    }
    return !HAS_OWN(species, 'value') && species.get === NATIVE_SPECIES.get
      && species.set === NATIVE_SPECIES.set;
  } catch {
    return false;
  }
}

function capability() {
  let resolvePromise, rejectPromise;
  const promise = new NativePromise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return FREEZE({
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  });
}

function rejected(suffix) {
  const result = capability();
  result.reject(failure(suffix));
  return result.promise;
}

function failure(suffix) {
  const code = PREFIX + suffix;
  const error = new TYPE_ERROR(code);
  DEFINE(error, 'code', { value: code, enumerable: true });
  DEFINE(error, 'stack', {
    value: 'TypeError: ' + code,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return FREEZE(error);
}
