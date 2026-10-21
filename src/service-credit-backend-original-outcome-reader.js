import { types as utilTypes } from 'node:util';
import { ServiceCreditSqliteStore } from './service-credit-sqlite-store.js';
import { createServiceCreditHttpAdmission } from './service-credit-http.js';

const APPLY = Reflect.apply;
const DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const PROTOTYPE = Reflect.getPrototypeOf;
const OWN_KEYS = Reflect.ownKeys;
const HAS_OWN = Object.hasOwn;
const FREEZE = Object.freeze;
const IS_PROXY = utilTypes.isProxy;
const STORE_PROTOTYPE = ServiceCreditSqliteStore.prototype;
const STORE_LOAD = STORE_PROTOTYPE.load;
const STORE_READ = STORE_PROTOTYPE.getOriginalRequestExecutionSnapshot;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TEST = RegExp.prototype.test;
const ORIGINAL_FIELDS = FREEZE([
  'modelVersion', 'grantId', 'requestId', 'method', 'routeId',
  'canonicalBodyDigest', 'selectedContentType', 'maxCostUnits',
]);

function exactData(value, keys) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || PROTOTYPE(value) !== Object.prototype) return null;
  const observed = OWN_KEYS(value);
  if (observed.length !== keys.length) return null;
  const result = Object.create(null);
  for (const key of keys) {
    const descriptor = DESCRIPTOR(value, key);
    if (!descriptor?.enumerable || !HAS_OWN(descriptor, 'value')) return null;
    result[key] = descriptor.value;
  }
  return result;
}

function outcome(status, snapshot = null, cachedResult = null) {
  return FREEZE({
    status,
    revision: snapshot === null ? null : snapshot.revision,
    originalRequest: snapshot === null ? null : snapshot.request,
    execution: snapshot === null ? null : snapshot.execution,
    cachedResult,
    executionAuthorized: false,
    paymentAuthorized: false,
    signingAuthorized: false,
    deliveryStatus: 'NOT_ESTABLISHED',
  });
}

function matchesExpectedOriginal(request, expected) {
  const captured = exactData(expected, ORIGINAL_FIELDS);
  if (captured === null) return false;
  for (const name of ORIGINAL_FIELDS) {
    if (request[name] !== captured[name]) return false;
  }
  return true;
}

function project(snapshot) {
  // The captured native method supplies detached, deeply frozen records and has
  // already validated the envelope, request identity and durable cross-links.
  if (snapshot.request === null) return outcome('NOT_RECORDED', snapshot);
  const execution = snapshot.execution;
  if (execution === null || execution.terminalClassification === 'NONE') {
    return outcome('RECONCILIATION_REQUIRED', snapshot);
  }
  if (execution.terminalClassification === 'OUTCOME_UNKNOWN') {
    return outcome('OUTCOME_UNKNOWN', snapshot);
  }
  if (execution.terminalClassification === 'NOT_INVOKED') {
    return outcome('NOT_INVOKED', snapshot);
  }
  const cached = snapshot.request.cachedResult;
  if (execution.terminalClassification === 'SUCCEEDED'
      && snapshot.request.state === 'SUCCEEDED'
      && cached !== null && cached.statusCode === 200
      && cached.contentType === 'application/json'
      && typeof cached.resultCode === 'string'
      && APPLY(TEST, IDENTIFIER, [cached.resultCode])) {
    return outcome('CACHED_SUCCESS', snapshot, cached);
  }
  return outcome('RECONCILIATION_REQUIRED', snapshot);
}

/**
 * Opt-in, synchronous local read capability for an existing backend store. The
 * caller supplies the original empty POST envelope and its existing capability
 * proof. The existing admission validates the complete startup ledger and then
 * narrows to the required admittedGrantId before any original-outcome read.
 *
 * This is NOT an HTTP status endpoint, execution owner, retry or client cutover.
 * It never reserves, prepares, invokes, reconciles, signs, pays or resends. A
 * cached result is only the recorded backend assertion, not delivery evidence.
 * Missing, PREPARED and uncertain outcomes grant no new execution permission.
 * Admission binds an immutable startup capability commitment; it does not assert
 * current grant lifecycle, funding, payer/provider policy, READY or live context.
 * Reads still use the store's existing BEGIN IMMEDIATE transaction machinery.
 * Same-UID code, native SQLite and the filesystem remain trusted premises.
 * readExactOriginal(envelope, expectedRequest) additionally binds the admitted
 * proof to all eight expected request fields BEFORE any backend outcome query,
 * including when no backend record exists. It grants no additional authority.
 *
 * close() fences this reader only, including an in-flight reentrant close. It
 * never closes the borrowed store or another execution owner. Reopening a store
 * requires constructing another reader; no saved proof or handle is revived.
 */
export function createServiceCreditBackendOriginalOutcomeReader(options) {
  let configuration;
  try {
    configuration = arguments.length === 1 ? exactData(options, ['store', 'admittedGrantId']) : null;
    const store = configuration?.store;
    if (!configuration || store === null || typeof store !== 'object' || IS_PROXY(store)
        || PROTOTYPE(store) !== STORE_PROTOTYPE || OWN_KEYS(store).length !== 0
        || typeof configuration.admittedGrantId !== 'string'
        || !APPLY(TEST, IDENTIFIER, [configuration.admittedGrantId])) {
      throw new TypeError();
    }
  } catch {
    throw new TypeError('SERVICE_CREDIT_BACKEND_READER_INVALID_CONFIGURATION');
  }
  let store = configuration.store;
  let admission;
  try {
    // Do not resolve a caller-supplied store.load getter or method replacement.
    // The private-field brand check also rejects Object.create(storePrototype).
    const nativeLoad = FREEZE(function load() { return APPLY(STORE_LOAD, store, []); });
    admission = createServiceCreditHttpAdmission({
      store: FREEZE({ load: nativeLoad }),
      admittedGrantId: configuration.admittedGrantId,
    });
  } catch {
    throw new TypeError('SERVICE_CREDIT_BACKEND_READER_INVALID_CONFIGURATION');
  }
  configuration = null;
  let closed = false;
  let reading = false;
  const closedOutcome = outcome('CLOSED');
  const unavailable = outcome('UNAVAILABLE');

  function readBound(request, expected, requireExact) {
    if (closed) return closedOutcome;
    if (reading) return unavailable;
    reading = true;
    try {
      const decision = admission.admit(request);
      if (closed) return closedOutcome;
      if (decision.status !== 'AUTHORIZED') return outcome(decision.status);
      if (requireExact && !matchesExpectedOriginal(decision.request, expected)) {
        return outcome('ORIGINAL_BINDING_MISMATCH');
      }
      const snapshot = APPLY(STORE_READ, store, [decision.request]);
      if (closed) return closedOutcome;
      return project(snapshot);
    } catch (error) {
      if (closed) return closedOutcome;
      const code = error !== null && typeof error === 'object' && !IS_PROXY(error)
        ? DESCRIPTOR(error, 'code') : null;
      return code && HAS_OWN(code, 'value') && code.value === 'REQUEST_ID_CONFLICT'
        ? outcome('REQUEST_ID_CONFLICT') : unavailable;
    } finally {
      reading = false;
    }
  }
  const read = FREEZE(function read(request) {
    if (closed) return closedOutcome;
    if (arguments.length !== 1) return unavailable;
    return readBound(request, null, false);
  });
  const readExactOriginal = FREEZE(function readExactOriginal(request, expected) {
    if (closed) return closedOutcome;
    if (arguments.length !== 2) return unavailable;
    return readBound(request, expected, true);
  });
  const close = FREEZE(function close() {
    if (arguments.length !== 0) return unavailable;
    closed = true;
    admission = null;
    store = null;
    return closedOutcome;
  });
  return FREEZE({ read, readExactOriginal, close });
}
