import { Buffer } from 'node:buffer';
import {
  snapshotOriginalServiceRequestCustodyKey,
  serializeOriginalServiceRequestCustody,
  serializeOriginalServiceDispatchIntent,
} from './service-credit-original-request-custody-contract.js';
import { encodeOriginalPaymentCheckpoint } from './service-credit-pilot-original-payment-checkpoint.js';

const APPLY = Reflect.apply;
const FREEZE = Object.freeze;
const DEFINE = Object.defineProperty;
const NativePromise = Promise;
const BYTE_LENGTH = Buffer.byteLength;
const PARSE = JSON.parse;
const STRINGIFY = JSON.stringify;
const KEY = snapshotOriginalServiceRequestCustodyKey;
const SERIALIZE = serializeOriginalServiceRequestCustody;
const SERIALIZE_INTENT = serializeOriginalServiceDispatchIntent;
const CHECKPOINT_TEXT = encodeOriginalPaymentCheckpoint;

/**
 * Internal connection for already captured private child capabilities.
 * This module acquires no payer/backend, SQL store, transport or grant.
 * The native bindings retain their exact acquisition and ownership contracts.
 * Mocked capability DATA tests do not qualify those native contracts.
 */
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

export function createServiceCreditCustodiedBackendRecoveryCore(client, backend, selectedGrantId, storeOwnership, serviceDispatchEnabled = false,
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
      if (closed) throw failure('CLOSED');
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
        // Child reads can synchronously close this connection.
        if (closed) throw failure('CLOSED');
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
      // The standalone read joins the same synchronous admission fence.
      reading = true;
      try {
        const value = LOCAL_CHECKPOINT(expectedPins);
        if (closed) throw failure('CLOSED');
        return value;
      } catch (error) {
        if (closed) throw failure('CLOSED');
        throw error;
      } finally {
        reading = false;
        expectedPins = null;
      }
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
