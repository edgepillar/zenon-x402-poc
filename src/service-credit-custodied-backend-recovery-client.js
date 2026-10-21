import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import { createServiceCreditCustodiedHttpClientV3 } from './service-credit-custodied-http-client.js';
import { createServiceCreditBackendOriginalOutcomeReader } from './service-credit-backend-original-outcome-reader.js';
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
const IS_PROXY = utilTypes.isProxy;
const BYTE_LENGTH = Buffer.byteLength;
const PARSE = JSON.parse;
const STRINGIFY = JSON.stringify;
const KEY = snapshotOriginalServiceRequestCustodyKey;
const SERIALIZE = serializeOriginalServiceRequestCustody;
const SERIALIZE_INTENT = serializeOriginalServiceDispatchIntent;
const CREATE_CLIENT = createServiceCreditCustodiedHttpClientV3;
const CREATE_BACKEND = createServiceCreditBackendOriginalOutcomeReader;
const FIELDS = FREEZE([
  'store', 'backendStore', 'fundingResourceUrl', 'custodyPolicy', 'selectedGrantId', 'deadlineMs',
]);
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

function exact(value) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || PROTOTYPE(value) !== Object.prototype || KEYS(value).length !== FIELDS.length) {
    throw failure('INVALID_CONFIGURATION');
  }
  const captured = {};
  for (const name of FIELDS) {
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
  const LOCAL_READ = client.readOriginalRecoveryState;
  const LOCAL_CLOSE = client.close;
  const LOCAL_SNAPSHOT = client.snapshot;
  const BACKEND_READ = backend.readExactOriginal;
  const BACKEND_CLOSE = backend.close;
  const LOCAL_ORIGINAL = client.readOriginal;
  const LOCAL_KEYS = client.readOriginalRecoveryKeys;
  client = null;
  backend = null;
  let closed = false, reading = false, unavailable = false;

  const readOriginalBackendRecoveryState = FREEZE(function readOriginalBackendRecoveryState(keyValue, authorizationHeader) {
    if (closed) throw failure('CLOSED');
    if (reading) throw failure('BUSY');
    if (unavailable) throw failure('UNAVAILABLE');
    if (arguments.length !== 2 || typeof authorizationHeader !== 'string'
        || authorizationHeader.length === 0 || authorizationHeader.length > 1024
        || APPLY(BYTE_LENGTH, Buffer, [authorizationHeader, 'utf8']) > 1024) {
      throw failure('INVALID_INPUT');
    }
    let key = KEY(keyValue);
    if (key.grantId !== selectedGrantId) throw failure('FOREIGN_GRANT');
    reading = true;
    let before = null, after = null, expected = null, envelope = null;
    try {
      before = LOCAL_READ(key);
      if (closed) throw failure('CLOSED');
      if (before === null) return view('CLIENT_ORIGINAL_NOT_RECORDED');
      const originalText = SERIALIZE(before.original);
      const fundingText = STRINGIFY(before.funding);
      const uncertaintyText = STRINGIFY(before.uncertainty);
      const dispatchText = intentText(before);
      expected = PARSE(before.original.originalRequestJson);
      envelope = FREEZE({ url: '/service-credit/v1/execute', method: 'POST',
        rawHeaders: FREEZE(['Authorization', authorizationHeader]) });
      const observed = BACKEND_READ(envelope, expected);
      if (closed) throw failure('CLOSED');
      after = LOCAL_READ(key);
      if (closed) throw failure('CLOSED');
      if (after === null || SERIALIZE(after.original) !== originalText
          || STRINGIFY(after.funding) !== fundingText || STRINGIFY(after.uncertainty) !== uncertaintyText
          || intentText(after) !== dispatchText) {
        throw failure('CLIENT_BINDING_CHANGED');
      }
      const uncertain = after.funding.status !== 'BOUND' || after.funding.ambiguityLatched
        || after.uncertainty.custody || after.uncertainty.submission || after.uncertainty.undrained
        || after.uncertainty.declaredFundingAmbiguitySeen;
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
    }
  });
  const close = FREEZE(function close(...args) {
    if (args.length !== 0) return APPLY(LOCAL_CLOSE, undefined, args);
    if (!closed) { closed = true; BACKEND_CLOSE(); }
    return LOCAL_CLOSE();
  });
  const snapshot = FREEZE(function snapshot() {
    if (arguments.length !== 0) throw failure('INVALID_INPUT');
    return FREEZE({ client: LOCAL_SNAPSHOT(), closed, reading, unavailable,
      storeOwnership: 'BOTH_BORROWED', authority: 'NONE', serviceDelivery: 'NOT_ESTABLISHED' });
  });
  return FREEZE({
    readOriginal: LOCAL_ORIGINAL,
    readOriginalRecoveryState: LOCAL_READ,
    readOriginalRecoveryKeys: LOCAL_KEYS,
    readOriginalBackendRecoveryState,
    snapshot,
    close,
  });
}
