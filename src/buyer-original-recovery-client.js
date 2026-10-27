import { types as utilTypes } from 'node:util';
import { Buffer } from 'node:buffer';
import { createServiceCreditCustodiedBackendRecoveryCore } from './service-credit-custodied-backend-recovery-core.js';
import { captureOriginalFundingServiceHandoffRequest } from './zenon/dynamic-plasma-original-funding-service-handoff-request.js';
import { createFundingPostOriginalPaymentCheckpointClient } from './x402-original-payment-checkpoint-client.js';
import { restoreOriginalPaymentCheckpoint } from './service-credit-pilot-original-payment-checkpoint.js';
import { decodeB64Json } from './x402-wire.js';
import {
  snapshotOriginalServiceRequestCustodyKey, validateOriginalServiceRequestCustody,
} from './service-credit-original-request-custody-contract.js';

const F = Object.freeze, APPLY = Reflect.apply, DESC = Object.getOwnPropertyDescriptor;
const PROTO = Object.getPrototypeOf, OWN = Object.hasOwn, PROXY = utilTypes.isProxy;
const NativePromise = Promise, PROMISE = NativePromise.prototype, THEN = PROMISE.then;
const BINDING = F(['requestId', 'paymentHash', 'origin', 'contextId']);
const DIGESTS = F(['requestBody', 'paymentPayload', 'paymentRequirements', 'context']);
const SERVICE_FIELDS = F(['grantId', 'requestId', 'originalRequestJson', 'originalBodyBase64',
  'serviceResourceUrl', 'authorizationHeader']);
const UNCERTAINTY = F(['custody', 'submission', 'undrained', 'declaredFundingAmbiguitySeen']);
const NATIVE_PROFILE = 'NATIVE_OFFICIAL_X402_FUNDING_POST_ORIGINAL_V6_CLIENT';

/** Capture EXTERNAL original bytes, pins, challenge and selected grant.
 * The existing handoff DATA codec validates them without opening a reader.
 * This is not durable retention, funding, current grant or network authority. */
export function captureBuyerOriginalRecoverySelection(configuration) {
  if (arguments.length !== 1) fail('configuration_rejected');
  const c = fields(configuration, ['originalPayment', 'selectedGrantId', 'paymentRequiredHeader']);
  const original = fields(c.originalPayment, ['resourceUrl', 'serializedCheckpoint', 'expectedPins']);
  return captureOriginalFundingServiceHandoffRequest(c, {
    resourceUrl: original.resourceUrl, serializedCheckpoint: original.serializedCheckpoint,
    paymentRequiredHeader: c.paymentRequiredHeader,
  });
}

/**
 * Own the existing native official/V6 ORIGINAL client, not a fresh funder or
 * signer. Restoration returns only its exact retained header. Reads use fresh
 * caller pins before/after the real local recovery read. An explicit service
 * call can use only an already retained, unchanged, never-attempted original.
 * Local state and observed success are never delivery/retry authority.
 */
export function createBuyerOriginalRecoveryClient(configuration) {
  if (arguments.length !== 1) fail('configuration_rejected');
  return createClient(configuration, false);
}

/** Same original owner with an explicitly supplied existing backend reader.
 * The actual shared V6 recovery core performs the exact-original query and
 * both rereads. No second payer, submission or remote status endpoint. */
export function createBuyerOriginalBackendRecoveryClient(configuration) {
  if (arguments.length !== 1) fail('configuration_rejected');
  return createClient(configuration, true);
}

function createClient(configuration, withBackend) {
  const c = fields(configuration, withBackend ? ['client', 'selection', 'backend'] : ['client', 'selection']);
  const child = c.client;
  const selection = captureBuyerOriginalRecoverySelection({
    originalPayment: data(c.selection, 'originalPayment'),
    selectedGrantId: data(c.selection, 'selectedGrantId'),
    paymentRequiredHeader: data(c.selection, 'paymentRequiredHeader'),
  });
  const RESTORE = method(child, 'restoreOriginalPayment'), SUBMIT = method(child, 'submitOriginal');
  const READ = method(child, 'readOriginalRecoveryState'), CHECKPOINT = method(child, 'readOriginalPaymentCheckpoint');
  const VIEW = method(child, 'snapshot'), CLOSE = method(child, 'close');
  const backend = withBackend ? c.backend : null;
  const BACKEND_READ = withBackend ? method(backend, 'readExactOriginal') : null;
  const BACKEND_CLOSE = withBackend ? method(backend, 'close') : null;
  const ORIGINAL = withBackend ? method(child, 'readOriginal') : null;
  const KEYS = withBackend ? method(child, 'readOriginalRecoveryKeys') : null;
  const decoded = restoreOriginalPaymentCheckpoint(selection.originalPayment.serializedCheckpoint,
    selection.originalPayment.expectedPins);
  const originalHeader = decoded.originalBytes.paymentPayload;
  const network = decodeB64Json(originalHeader, { maxEncodedBytes: 5464, maxDecodedBytes: 4096 }).accepted.network;
  let active = null, closing = null, held = false, lifecycle = 'OPEN', restored = false, attempts = 0;
  let uncertaintyLatched = false, lastRecovery = null, childStop = null, childLeg = 'NOT_REQUESTED';
  let historicalClose = 'NOT_REQUESTED', closeTerminal = false;
  let connection = null, lastCheckpoint = null, lastBackendRecovery = null;
  let backendStop = null, backendLeg = withBackend ? 'NOT_REQUESTED' : 'NOT_PROVIDED';
  const core = createFundingPostOriginalPaymentCheckpointClient({ ...selection.originalPayment,
    readOriginalPaymentCheckpoint: F(pins => {
      if (active === null || closing !== null) fail('read_unavailable');
      active.entered = true;
      const value = APPLY(CHECKPOINT, child, [pins]);
      lastCheckpoint = value;
      return value;
    }) });
  function hold() { held = true; lifecycle = 'HELD'; }
  function view() {
    const s = APPLY(VIEW, child, []);
    if (data(s, 'profile') !== NATIVE_PROFILE) fail('native_view_unknown');
    const n = data(s, 'native');
    return { lifecycle: data(s, 'lifecycle'), operationActive: data(s, 'operationActive'),
      nativePhase: data(n, 'phase'), nativeUnknown: data(n, 'unknown') };
  }
  function live() {
    const s = view();
    return s.lifecycle === 'OPEN' && s.operationActive === false
      && s.nativePhase === 'OPEN' && s.nativeUnknown === false;
  }
  function clean() {
    try {
      const s = view();
      return s.lifecycle === 'CLOSED' && s.operationActive === false && s.nativePhase === 'CLOSED'
        && s.nativeUnknown === false && core.snapshot().uncertain === false;
    } catch { return false; }
  }
  function finishClose() {
    if (closing === null || closeTerminal || active !== null || childLeg === 'PENDING') return;
    closeTerminal = true;
    if (held || childLeg !== 'CLOSED' || withBackend && backendLeg !== 'CLOSED' || !clean()) {
      hold(); historicalClose = 'REJECTED'; closing.reject(error('close_unknown'));
    } else { lifecycle = 'CLOSED'; historicalClose = 'FULFILLED_UNDEFINED'; closing.resolve(undefined); }
  }
  function pins(input) {
    const p = fields(input, ['binding', 'digests']);
    const binding = fields(p.binding, BINDING), digests = fields(p.digests, DIGESTS);
    const expected = selection.originalPayment.expectedPins;
    for (const key of BINDING) if (typeof binding[key] !== 'string' || binding[key] !== expected.binding[key]) fail('pins_rejected');
    for (const key of DIGESTS) if (typeof digests[key] !== 'string' || digests[key] !== expected.digests[key]) fail('pins_rejected');
    return F({ binding: F(binding), digests: F(digests) });
  }
  function key(input) {
    const k = snapshotOriginalServiceRequestCustodyKey(input);
    if (k.grantId !== selection.selectedGrantId) fail('foreign_grant');
    return k;
  }
  function fence(expectedPins) {
    core.captureChallenge({ paymentRequiredHeader: selection.paymentRequiredHeader, expectedPins });
    const observed = lastCheckpoint; lastCheckpoint = null;
    if (closing !== null || held || !live()) fail('read_unknown');
    return observed;
  }
  function observeState(k, expectedPins) {
    fence(expectedPins);
    active.entered = true;
    const state = APPLY(READ, child, [k]);
    if (closing !== null || held) fail('read_unknown');
    fence(expectedPins);
    return captureState(k, state);
  }
  function captureState(k, state) {
    if (state === null) {
      uncertaintyLatched = true;
      const summary = F({ buyerOriginalRecoveryObservationVersion: 1, recordPresent: false,
        grantId: k.grantId, requestId: k.requestId, fundingStatus: null,
        reconciliationRequired: true, priorAttemptRecorded: false, mayDispatchService: false,
        serviceDelivery: 'NOT_ESTABLISHED', authority: 'NONE' });
      lastRecovery = summary;
      return { summary, original: null };
    }
    const original = validateOriginalServiceRequestCustody(data(state, 'original'));
    const funding = data(state, 'funding'), uncertainty = data(state, 'uncertainty');
    if (original.grantId !== k.grantId || original.requestId !== k.requestId
        || original.fundingResourceUrl !== selection.originalPayment.resourceUrl
        || original.paymentHash !== selection.originalPayment.expectedPins.binding.paymentHash || original.network !== network
        || data(funding, 'fundingResourceUrl') !== original.fundingResourceUrl
        || data(funding, 'paymentHash') !== original.paymentHash || data(funding, 'network') !== network) fail('binding_changed');
    const status = data(funding, 'status'), ambiguity = data(funding, 'ambiguityLatched');
    if (!['PREPARED', 'ATTEMPT_FENCED', 'OUTCOME_UNKNOWN', 'BOUND', 'PAYMENT_REJECTED', 'PAYMENT_CONFLICT'].includes(status)
        || typeof ambiguity !== 'boolean') fail('state_unknown');
    let uncertain = status !== 'BOUND' || ambiguity;
    for (const name of UNCERTAINTY) {
      const flag = data(uncertainty, name);
      if (typeof flag !== 'boolean') fail('state_unknown');
      uncertain ||= flag;
    }
    const intent = data(state, 'dispatchIntent'), response = data(state, 'responseObservation');
    const responseStatus = data(state, 'responseStatus');
    if (responseStatus !== (response === null ? 'NOT_OBSERVED' : 'LOCAL_DECLARED_SUCCESS_RESPONSE_OBSERVED')) fail('state_unknown');
    const prior = intent !== null || response !== null;
    uncertaintyLatched ||= uncertain || prior;
    const summary = F({ buyerOriginalRecoveryObservationVersion: 1, recordPresent: true,
      grantId: k.grantId, requestId: k.requestId, fundingStatus: status, ambiguityLatched: ambiguity,
      priorAttemptRecorded: prior, responseStatus, reconciliationRequired: uncertaintyLatched,
      mayDispatchService: false, serviceDelivery: 'NOT_ESTABLISHED', authority: 'NONE' });
    lastRecovery = summary;
    return { summary, original };
  }
  function backendStatus(value) {
    const status = data(value, 'status');
    if (!['CACHED_SUCCESS', 'NOT_RECORDED', 'RECONCILIATION_REQUIRED', 'OUTCOME_UNKNOWN', 'NOT_INVOKED',
      'ORIGINAL_BINDING_MISMATCH', 'REQUEST_ID_CONFLICT', 'CLOSED', 'UNAVAILABLE', 'UNAUTHORIZED',
      'NOT_FOUND', 'METHOD_NOT_ALLOWED', 'BAD_REQUEST'].includes(status)
        || data(value, 'executionAuthorized') !== false || data(value, 'paymentAuthorized') !== false
        || data(value, 'signingAuthorized') !== false || data(value, 'deliveryStatus') !== 'NOT_ESTABLISHED') fail('backend_unknown');
    return status;
  }
  function requestChildStop() {
    if (childLeg !== 'NOT_REQUESTED') return childStop;
    childLeg = 'PENDING';
    try {
      childStop = APPLY(CLOSE, child, []);
      observe(childStop, value => {
        childLeg = value === undefined ? 'CLOSED' : 'UNKNOWN';
        if (value !== undefined) hold();
        finishClose();
      }, () => { childLeg = 'UNKNOWN'; hold(); finishClose(); });
    } catch { childLeg = 'UNKNOWN'; hold(); finishClose(); }
    return childStop;
  }
  function requestBackendStop() {
    if (!withBackend) return;
    if (backendLeg !== 'NOT_REQUESTED') {
      if (backendLeg !== 'CLOSED') fail('backend_close_unknown');
      return;
    }
    backendLeg = 'PENDING';
    try {
      // The real backend reader returns its CLOSED DATA record, not void.
      // It fences only the reader; the existing backend store is borrowed.
      backendStop = APPLY(BACKEND_CLOSE, backend, []);
      if (backendStatus(backendStop) !== 'CLOSED') fail('backend_close_unknown');
      backendLeg = 'CLOSED';
    } catch { backendLeg = 'UNKNOWN'; hold(); fail('backend_close_unknown'); }
  }
  function start(work, count, input) {
    if (count !== 1 || active !== null || closing !== null || held) return rejected('operation_unavailable');
    const out = pending(); out.entered = false; active = out;
    function finish(ok, value) {
      active = null;
      if (!ok || closing !== null || held) {
        if (out.entered) hold();
        out.reject(error('operation_refused_or_unknown'));
      } else out.resolve(value);
      finishClose();
    }
    try {
      if (!live()) fail('native_view_unknown');
      observe(work(input), value => finish(true, value), () => finish(false));
    } catch { finish(false); }
    return out.promise;
  }
  const close = F(function close() {
    if (arguments.length !== 0) return rejected('input_rejected');
    if (closing !== null) return closing.promise;
    closing = pending(); lifecycle = held ? 'HELD' : 'CLOSING';
    try { core.close(); } catch { hold(); }
    lastCheckpoint = null;
    if (connection !== null) { try { connection.close(); } catch { hold(); } }
    // A synchronous backend stop failure cannot suppress the native stop.
    try { requestBackendStop(); } catch { hold(); }
    requestChildStop();
    finishClose(); return closing.promise;
  });
  if (withBackend) {
    const local = F({
      readOriginalRecoveryState: F(function readState(k) {
        if (active === null || closing !== null || held) fail('read_unavailable');
        active.entered = true;
        const state = APPLY(READ, child, [k]);
        if (closing !== null || held) fail('read_unknown');
        captureState(k, state);
        return state;
      }),
      readOriginalPaymentCheckpoint: F(function readCheckpoint(expectedPins) { return fence(expectedPins); }),
      readOriginal: ORIGINAL, readOriginalRecoveryKeys: KEYS,
      snapshot: VIEW, close: F(function stopNative() { return requestChildStop(); }),
    });
    const reader = F({ readExactOriginal: F(function readBackend(envelope, expected) {
      if (active === null || closing !== null || held) fail('read_unavailable');
      active.entered = true;
      const value = APPLY(BACKEND_READ, backend, [envelope, expected]);
      backendStatus(value);
      return value;
    }), close: F(function stopBackend() { return requestBackendStop(); }) });
    connection = createServiceCreditCustodiedBackendRecoveryCore(local, reader,
      selection.selectedGrantId, 'NATIVE_PAYER_OWNED_BACKEND_STORE_BORROWED', false, true, true);
  }
  // Validate the source-bound public native profile without acquiring anything.
  if (!live()) fail('configuration_rejected');
  return F({
    ...(withBackend ? { readOriginalBackendRecoveryState: F(function readOriginalBackendRecoveryState(input) {
      return start(value => {
        const c = fields(value, ['key', 'authorizationHeader', 'expectedPins']);
        const k = key(c.key), expectedPins = pins(c.expectedPins), header = c.authorizationHeader;
        if (typeof header !== 'string' || !header.startsWith('ServiceCredit ') || header.length <= 14
            || Buffer.byteLength(header, 'utf8') > 1024 || /[\r\n\0]/.test(header)) fail('proof_rejected');
        active.entered = true;
        const result = connection.readOriginalBackendRecoveryState(k, header, expectedPins);
        if (closing !== null || held || data(result, 'authority') !== 'NONE'
            || data(result, 'mayDispatchService') !== false || data(result, 'mayStartPayment') !== false
            || data(result, 'maySignPayment') !== false || data(result, 'deliveryConfirmed') !== false
            || data(result, 'serviceDelivery') !== 'NOT_ESTABLISHED') fail('backend_unknown');
        const observed = data(result, 'backend'), status = data(result, 'status');
        const observedStatus = observed === null ? null : backendStatus(observed);
        if (!['CLIENT_ORIGINAL_NOT_RECORDED', 'CLIENT_RECONCILIATION_REQUIRED', observedStatus].includes(status)) fail('backend_unknown');
        const localReconciliation = lastRecovery === null || lastRecovery.reconciliationRequired;
        // This command observes a combined local/backend assertion only.
        // Never turn cached success or absence into permission to resend.
        uncertaintyLatched = true;
        lastBackendRecovery = F({ buyerOriginalBackendRecoveryObservationVersion: 1,
          grantId: k.grantId, requestId: k.requestId, status, backendStatus: observedStatus,
          originalCheckpointPinsMatched: true, localReconciliationRequired: localReconciliation,
          reconciliationRequired: true, mayStartPayment: false, maySignPayment: false,
          mayDispatchService: false, deliveryConfirmed: false, serviceDelivery: 'NOT_ESTABLISHED',
          sameProcessObservationOnly: true, currentAuthority: 'NOT_ESTABLISHED', authority: 'NONE' });
        const out = pending(); out.resolve(lastBackendRecovery); return out.promise;
      }, arguments.length, input);
    }) } : {}),
    restoreOriginalPayment: F(function restoreOriginalPayment(input) {
      return start(value => {
        const request = fields(value, ['paymentRequiredHeader', 'expectedPins']), expectedPins = pins(request.expectedPins);
        if (request.paymentRequiredHeader !== selection.paymentRequiredHeader || attempts !== 0) fail('restore_unavailable');
        attempts++; active.entered = true;
        const out = pending();
        observe(APPLY(RESTORE, child, [{ paymentRequiredHeader: selection.paymentRequiredHeader, expectedPins }]), result => {
          try {
            if (data(result, 'resourceUrl') !== selection.originalPayment.resourceUrl
                || data(result, 'paymentSignatureHeader') !== originalHeader
                || data(result, 'source') !== 'EXACT_RETAINED_V6_ORIGINAL'
                || data(result, 'signatureCreated') !== false || data(result, 'transport') !== 'NOT_INVOKED'
                || closing !== null || held || !live()) fail('restore_unknown');
            restored = true; out.resolve(result);
          } catch { out.reject(error('restore_unknown')); }
        }, () => out.reject(error('restore_unknown')));
        return out.promise;
      }, arguments.length, input);
    }),
    readOriginalRecoveryState: F(function readOriginalRecoveryState(input) {
      return start(value => {
        const c = fields(value, ['key', 'expectedPins']), k = key(c.key), expectedPins = pins(c.expectedPins);
        const observed = observeState(k, expectedPins);
        const out = pending(); out.resolve(observed.summary); return out.promise;
      }, arguments.length, input);
    }),
    submitOriginal: F(function submitOriginal(input) {
      return start(value => {
        if (!restored || uncertaintyLatched) fail('service_unavailable');
        const c = fields(value, [...SERVICE_FIELDS, 'expectedPins']);
        const k = key({ grantId: c.grantId, requestId: c.requestId }), expectedPins = pins(c.expectedPins);
        const observed = observeState(k, expectedPins), original = observed.original;
        if (observed.summary.reconciliationRequired || original === null) fail('service_reconciliation_required');
        if (c.originalRequestJson !== original.originalRequestJson || c.originalBodyBase64 !== original.originalBodyBase64
            || c.serviceResourceUrl !== original.serviceResourceUrl) fail('original_request_changed');
        const request = {};
        for (const name of SERVICE_FIELDS) Object.defineProperty(request, name, { value: c[name], enumerable: true });
        active.entered = true;
        const out = pending();
        observe(APPLY(SUBMIT, child, [F(request)]), result => {
          if (result === undefined) out.resolve(undefined); else out.reject(error('service_unknown'));
        }, () => out.reject(error('service_unknown')));
        return out.promise;
      }, arguments.length, input);
    }),
    inspect: F(function inspect() {
      if (arguments.length !== 0) fail('input_rejected');
      if (lifecycle === 'CLOSED' && !clean()) hold();
      return F({ buyerOriginalRecoveryClientVersion: 1, lifecycle, held,
        ...(withBackend ? { buyerOriginalBackendRecoveryClientVersion: 1 } : {}),
        phase: restored ? 'ORIGINAL_RESTORED' : 'AWAITING_ORIGINAL_RESTORE',
        publicOperationActive: active !== null, restoreAttempts: attempts, restored,
        uncertaintyLatched, lastRecovery, closeRequested: closing !== null,
        childClose: childLeg, childStopRetained: childStop !== null, historicalClose,
        backendRecoveryAvailable: withBackend, backendReaderClose: backendLeg,
        backendStopRetained: backendStop !== null, lastBackendRecovery,
        signerCalls: 0, fundingTransportProvided: false, authority: 'NONE',
        serviceDelivery: 'NOT_ESTABLISHED', nativeResourceCleanup: 'NOT_QUALIFIED' });
    }),
    close,
  });
}
function fields(value, names) {
  if (value === null || typeof value !== 'object' || PROXY(value) || PROTO(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail('input_rejected');
  const out = {};
  for (const name of names) {
    const d = DESC(value, name);
    if (!d || !OWN(d, 'value') || !d.enumerable) fail('input_rejected');
    Object.defineProperty(out, name, { value: d.value, enumerable: true });
  }
  return out;
}
function method(owner, name) {
  if (owner === null || typeof owner !== 'object' || PROXY(owner) || !Object.isFrozen(owner)) fail('configuration_rejected');
  const d = DESC(owner, name);
  if (!d || !OWN(d, 'value') || typeof d.value !== 'function' || PROXY(d.value)) fail('configuration_rejected');
  return d.value;
}
function data(value, name) {
  if (value === null || typeof value !== 'object' || PROXY(value) || !Object.isFrozen(value)
      || (PROTO(value) !== Object.prototype && PROTO(value) !== null)) fail('observation_rejected');
  const d = DESC(value, name);
  if (!d || !OWN(d, 'value') || !d.enumerable) fail('observation_rejected');
  return d.value;
}
function observe(value, yes, no) {
  if (PROXY(value) || !utilTypes.isPromise(value) || PROTO(value) !== PROMISE
      || Object.getOwnPropertyNames(value).some(k => k !== 'constructor')) fail('observation_rejected');
  const d = DESC(value, 'constructor');
  if (d !== undefined && (!OWN(d, 'value') || d.value !== NativePromise)) fail('observation_rejected');
  APPLY(THEN, APPLY(THEN, value, [yes, no]), [() => {}, () => {}]);
}
function pending() {
  let resolve, reject; const promise = new NativePromise((yes, no) => { resolve = yes; reject = no; });
  Object.defineProperty(promise, 'constructor', { value: NativePromise });
  APPLY(THEN, promise, [() => {}, () => {}]);
  return { promise, resolve, reject };
}
function rejected(kind) { const p = pending(); p.reject(error(kind)); return p.promise; }
function error(kind) {
  const code = 'buyer_original_recovery_client_' + kind, value = new TypeError(code);
  Object.defineProperty(value, 'code', { value: code, enumerable: true });
  Object.defineProperty(value, 'stack', { value: 'TypeError: ' + code });
  return F(value);
}
function fail(kind) { throw error(kind); }
