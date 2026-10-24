import { lstatSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import { openZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6,
  ZenonFundingPayerRecoverySqliteStore } from '../service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js';
import { createFundingPostNativeHttpsTransport } from '../service-credit-funding-post-native-https-transport.js';
import { createRetainedDynamicPlasmaHttpsReadSessionV2,
  createRetainedDynamicPlasmaHttpsReadSessionForLocalQualification } from './dynamic-plasma-retained-https-read-session.js';
import { captureNativeFundingServiceLoopbackReadSelection } from './native-funding-service-loopback-read-selection.js';
import { createNativeOriginalFundingCloseSession } from './dynamic-plasma-native-funding-close-session.js';
import { createBoundedNonceDynamicPlasmaMaterialExchange } from './dynamic-plasma-bounded-material-exchange.js';
import { createZenonDynamicPlasmaOriginalFundingSubmissionV4 } from './dynamic-plasma-original-funding-submission.js';
import { captureZenonDynamicPlasmaOriginalFundingInputV2 } from './dynamic-plasma-original-funding-data.js';
import { captureOriginalFundingServiceHandoffRequest } from './dynamic-plasma-original-funding-service-handoff-request.js';
import { captureFundingPostCheckpointRoute } from '../x402-funding-post-checkpoint-route.js';
import { snapshotOriginalServiceRequestCustodyPolicy } from '../service-credit-original-request-custody-contract.js';
import { openNativeOfficialV6FundingPostOriginalPaymentClientWithFundingHandoffGuard } from '../x402-native-v6-funding-post-client.js';
import { observeServiceCreditOperationDrain } from '../service-credit-bounded-operation-drain.js';

const OPEN_STORE = openZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6;
const FUNDING = createFundingPostNativeHttpsTransport, READS = createRetainedDynamicPlasmaHttpsReadSessionV2;
const LOCAL_READS = createRetainedDynamicPlasmaHttpsReadSessionForLocalQualification;
const LOCAL_SELECTION = captureNativeFundingServiceLoopbackReadSelection;
const SESSION = createNativeOriginalFundingCloseSession, MATERIAL = createBoundedNonceDynamicPlasmaMaterialExchange;
const SUBMISSION = createZenonDynamicPlasmaOriginalFundingSubmissionV4;
const ORIGINAL_INPUT = captureZenonDynamicPlasmaOriginalFundingInputV2;
const HANDOFF = captureOriginalFundingServiceHandoffRequest;
const SERVICE = openNativeOfficialV6FundingPostOriginalPaymentClientWithFundingHandoffGuard;
const ROUTE = captureFundingPostCheckpointRoute, POLICY = snapshotOriginalServiceRequestCustodyPolicy;
const DRAIN = observeServiceCreditOperationDrain, STAT = lstatSync, F = Object.freeze;
const DESC = Object.getOwnPropertyDescriptor, PROTO = Object.getPrototypeOf, KEYS = Reflect.ownKeys;
const OWN = Object.hasOwn, APPLY = Reflect.apply, IS_PROXY = utilTypes.isProxy, IS_PROMISE = utilTypes.isPromise;
const NativePromise = Promise, PROMISE = NativePromise.prototype, THEN = DESC(PROMISE, 'then');
const CTOR = DESC(PROMISE, 'constructor'), SPECIES = DESC(NativePromise, Symbol.species);
const STORE = ZenonFundingPayerRecoverySqliteStore.prototype;
const STORE_LOAD = DESC(STORE, 'load').value, STORE_CLOSE = DESC(STORE, 'close').value;
const FILL = Buffer.prototype.fill, ARRAY_BUFFER = DESC(PROTO(Uint8Array.prototype), 'buffer').get;
// One application owner per module instance, not an OS lock or cross-process lease.
let applicationSlot = null;

/**
 * SOURCE ONLY, default OFF. Own one EXISTING EMPTY V6 file from DP preparation
 * through ONE explicit original funding POST, clean native funding/store close,
 * same-file existing-V6 reopen, actual official POST-original restoration and
 * explicitly selected-grant native service operations. Actual constructors are
 * hardwired. No borrowed store/native/SDK/fetch factory and no missing-file
 * creation, migration, new signing on recovery or default buyer cutover.
 *
 * BOUND is only funding intake. The caller must independently retain original
 * bytes/pins and explicitly supply a selected grant and each service proof.
 * Handoff does not issue/verify an economic grant, resend funding, or dispatch
 * a service. The original transaction is never rebuilt or replaced.
 *
 * The private actual native funding session survives handoff. Fresh native
 * views, returned funding DB close and the retained file identity are rechecked
 * at service construction/admission AND the real service-store close boundary.
 * A stale fulfilled close Promise alone cannot permit handoff. HELD never
 * resets; post-return uncertainty cannot undo an already-returned close.
 *
 * This new SDK/SQL/native graph is NOT_EXECUTED. File identity checks are
 * cooperative pre/post observations, not an atomic filesystem lease, rollback
 * resistance, OS/hostile-code sandbox, physical-drain or production proof.
 */
export async function openZenonDynamicPlasmaNativeFundingServiceClient(configuration) {
  if (arguments.length !== 1) fail('configuration_or_owner_unavailable');
  return openClient(configuration, null, false);
}

/**
 * Named SOURCE-ONLY local qualification, never selected by the public entry.
 * The actual three retained read owners authenticate localhost/127.0.0.1 on
 * one explicit unprivileged RPC port with the same detached CA as funding and
 * service. Their closed role paths and budgets stay enforced by the native
 * core. No supplied owner/fetch/SDK factory or production/default fallback.
 * This wider actual graph has NOT_EXECUTED status; selection is not authority.
 */
export async function openZenonDynamicPlasmaNativeFundingServiceClientForLocalQualification(configuration, localReadOptions) {
  if (arguments.length !== 2) fail('configuration_or_owner_unavailable');
  return openClient(configuration, localReadOptions, true);
}

async function openClient(configuration, localReadOptions, localQualification) {
  if (!invariant() || applicationSlot !== null) fail('configuration_or_owner_unavailable');
  let storeOptions, fundingOptions, serviceOptions, policy, materialOptions, fundingTransportOptions;
  let reads = null, post = null, session = null, funder = null, service = null, store = null;
  let fileIdentity = null, openingStore = false, transferred = false, held = false, checking = false;
  let phase = 'STARTING', lifecycle = 'OPEN', packet = null, retained = null, bound = false;
  let pending = null, closing = null, handoffAttempts = 0, serviceOpenEntered = false;
  let fundingClose = null, fundingCloseOutcome = 'NOT_REQUESTED', serviceClose = null, serviceCloseOutcome = 'NOT_REQUESTED';
  let operationDrain = 'NOT_REQUESTED', historicalClose = 'NOT_REQUESTED', closeError = null;
  let privateCa = null, localReadSelection = null;
  const slot = { phase: 'STARTING', store: null, funder: null, service: null,
    reads: null, post: null, session: null };
  function hold(reason) {
    held = true; if (closeError === null) closeError = reason;
    slot.phase = 'HELD'; lifecycle = 'CLOSE_UNKNOWN';
  }
  function sameFile() {
    try { return fileIdentity !== null && identity(storeOptions.databasePath) === fileIdentity; }
    catch { return false; }
  }
  function releaseCa() {
    if (privateCa !== null) { APPLY(FILL, privateCa, [0]); privateCa = null; }
  }
  function releaseLocalReadSelection() {
    if (localReadSelection !== null) { APPLY(FILL, localReadSelection.ca, [0]); localReadSelection = null; }
  }
  function fundingNativeClean() {
    try { return !held && invariant() && session !== null && session.canCloseFunding() === true; }
    catch { return false; }
  }
  function fundingClosedFresh() {
    if (held || fundingCloseOutcome !== 'CLOSED' || checking || !sameFile()) return false;
    checking = true;
    try {
      const s = funder.inspectOriginalFunding(), n = data(s, 'nativeResourceClose');
      const j = data(s, 'joinedReadClose');
      return data(s, 'originalFundingSubmissionInspectionVersion') === 4
        && data(s, 'lifecycle') === 'CLOSED' && data(s, 'publicOperationActive') === false
        && data(j, 'completed') === true && data(j, 'held') === false
        && data(n, 'nativeResourceCloseGuardVersion') === 2 && data(n, 'phase') === 'CLOSED'
        && data(n, 'quarantined') === false && data(n, 'closeRequested') === true
        && data(n, 'nativeCloseStage') === 'CLOSED' && data(n, 'nativeGuardRefusal') === null
        && data(n, 'storeCloseCallEntered') === true && data(n, 'storeCloseCallReturned') === true
        && fundingNativeClean() && sameFile();
    } catch { return false; }
    finally { checking = false; }
  }
  const fundingHandoffGuard = F(function fundingHandoffGuard() {
    const clean = fundingClosedFresh();
    if (!clean) hold('FUNDING_HANDOFF_CURRENT_VIEW_UNKNOWN');
    return clean;
  });
  try {
    const c = exact(configuration, ['storeOptions','fundingOptions','serviceOptions']);
    storeOptions = F(exact(c.storeOptions, ['databasePath','allowedRoot','resourceUrl','custodyPolicy']));
    fundingOptions = exact(c.fundingOptions, ['readSessionOptions','materialOptions','materialWaitMs','wallet','deadlineMs','fundingTransportOptions']);
    serviceOptions = F(exact(c.serviceOptions, ['official','transportOptions','deadlineMs']));
    ROUTE(storeOptions.resourceUrl);
    policy = POLICY(storeOptions.custodyPolicy, storeOptions.resourceUrl);
    storeOptions = F({ ...storeOptions, custodyPolicy: policy });
    materialOptions = exact(fundingOptions.materialOptions, ['publicKey','startNonce','limits']);
    materialOptions = F({ ...materialOptions, limits: F(exact(materialOptions.limits, ['maxAttempts','maxDifficulty'])) });
    fundingTransportOptions = F(exact(fundingOptions.fundingTransportOptions,
      ['resourceUrl','ca','maxRequestStarts','requestDeadlineMs','handshakeDeadlineMs','closeGraceMs']));
    let serviceTransport = exact(serviceOptions.transportOptions,
      ['origin','ca','maxRequestStarts','maxConcurrentRequests','requestDeadlineMs','handshakeDeadlineMs','closeGraceMs']);
    const configuredOfficial = exact(serviceOptions.official, ['validateChallenge','assetInfo','contextLimit']);
    const assetInfo = F(exact(configuredOfficial.assetInfo, ['asset','decimals','symbol']));
    if (typeof configuredOfficial.validateChallenge !== 'function' || IS_PROXY(configuredOfficial.validateChallenge)
        || PROTO(configuredOfficial.validateChallenge) !== Function.prototype
        || typeof assetInfo.asset !== 'string' || assetInfo.asset.length < 1 || assetInfo.asset.length > 256
        || typeof assetInfo.symbol !== 'string' || !/^[\x21-\x7e]{1,32}$/.test(assetInfo.symbol))
      fail('configuration_or_owner_unavailable');
    integer(assetInfo.decimals, 0, 18); integer(configuredOfficial.contextLimit, 1, 64);
    const official = F({ ...configuredOfficial, assetInfo });
    integer(fundingOptions.materialWaitMs, 1, 60000); integer(fundingOptions.deadlineMs, 1, 60000);
    integer(serviceOptions.deadlineMs, 1, 60000);
    integer(fundingTransportOptions.requestDeadlineMs, 1, 60000);
    integer(fundingTransportOptions.handshakeDeadlineMs, 1, fundingTransportOptions.requestDeadlineMs);
    integer(fundingTransportOptions.closeGraceMs, 1, Math.min(fundingOptions.deadlineMs, 1000));
    integer(serviceTransport.maxRequestStarts, 1, 256);
    integer(serviceTransport.requestDeadlineMs, 1, 30000);
    integer(serviceTransport.handshakeDeadlineMs, 1, serviceTransport.requestDeadlineMs);
    integer(serviceTransport.closeGraceMs, 1, Math.min(serviceOptions.deadlineMs, 1000));
    if (typeof serviceTransport.origin !== 'string'
        || fundingTransportOptions.resourceUrl !== storeOptions.resourceUrl || fundingTransportOptions.maxRequestStarts !== 1
        || fundingTransportOptions.requestDeadlineMs > fundingOptions.deadlineMs
        || storeOptions.resourceUrl !== serviceTransport.origin + '/funding'
        || policy.serviceResourceUrl !== serviceTransport.origin + '/service-credit/v1/execute'
        || serviceTransport.maxConcurrentRequests !== 1 || serviceTransport.maxRequestStarts > policy.maxRequests
        || serviceTransport.requestDeadlineMs > serviceOptions.deadlineMs) fail('configuration_or_owner_unavailable');
    // Detach operator trust DATA before the funding lifetime starts. A caller
    // cannot swap the later service CA while funding/signing is in progress.
    privateCa = captureCa(serviceTransport.ca);
    const fundingCa = captureCa(fundingTransportOptions.ca);
    let sameCa = fundingCa.length === privateCa.length;
    for (let i = 0; i < fundingCa.length; i++) if (fundingCa[i] !== privateCa[i]) sameCa = false;
    APPLY(FILL, fundingCa, [0]);
    if (!sameCa) fail('configuration_or_owner_unavailable');
    // Capture before any await/native owner/store construction. The read CA
    // must match the already detached funding/service trust, not a later
    // caller mutation. Each actual read owner makes its own independent copy.
    if (localQualification) localReadSelection = LOCAL_SELECTION(localReadOptions, privateCa);
    serviceTransport = F({ ...serviceTransport, ca: privateCa });
    fundingTransportOptions = F({ ...fundingTransportOptions, ca: privateCa });
    serviceOptions = F({ ...serviceOptions, official, transportOptions: serviceTransport });
    applicationSlot = slot; // No await before claiming this module's application owner.
    const material = MATERIAL(materialOptions); // Inert; no search/signing.
    post = FUNDING(fundingTransportOptions); slot.post = post;
    try {
      reads = localQualification ? LOCAL_READS(fundingOptions.readSessionOptions, localReadSelection)
        : READS(fundingOptions.readSessionOptions);
      slot.reads = reads;
    } finally { releaseLocalReadSelection(); } // Only our temporary copy; owners retain their own bytes.
    session = SESSION(reads, post); slot.session = session;
    fileIdentity = identity(storeOptions.databasePath);
    openingStore = true;
    store = OPEN_STORE(storeOptions); slot.store = store;
    if (!sameFile() || APPLY(STORE_LOAD, store, []) !== null) fail('existing_empty_v6_required');
    // The genuine payer can consume a store-object claim even on construction
    // failure. After this boundary only that actual owner may close/quarantine it.
    transferred = true;
    funder = SUBMISSION({
      preparerOptions: { readOptions: session.readSession.readOptions, materialExchange: material,
        materialWaitMs: fundingOptions.materialWaitMs, wallet: fundingOptions.wallet },
      store, fundingResourceUrl: storeOptions.resourceUrl, deadlineMs: fundingOptions.deadlineMs,
      fetchImpl: post.fetchImpl, readSession: session.readSession,
      nativeResourceCloseGuard: F(function currentFundingNativeGuard() { return fundingNativeClean(); }),
    });
    slot.funder = funder; slot.phase = phase = 'FUNDING';
  } catch {
    let unpublishedStoreCloseReturned = false;
    // No operation escaped. Start both actual native stops even when one
    // constructor/close refused. A consumed/hidden store claim stays HELD.
    if (session !== null) {
      try { await boundedSettlement(session.readSession.close(), 1000, true); } catch { hold('CONSTRUCTION_NATIVE_CLOSE_UNKNOWN'); }
    } else {
      const stops = [];
      for (const owner of [reads, post]) if (owner !== null) {
        try { stops.push(owner.close()); } catch { hold('CONSTRUCTION_NATIVE_CLOSE_UNKNOWN'); }
      }
      for (const stop of stops) {
        try { await boundedSettlement(stop, 1000, false); } catch { hold('CONSTRUCTION_NATIVE_CLOSE_UNKNOWN'); }
      }
    }
    if (store !== null && !transferred && !held && sameFile()) {
      try {
        if (APPLY(STORE_CLOSE, store, []) !== undefined) throw error('close_unknown');
        unpublishedStoreCloseReturned = true; store = null; slot.store = null;
      }
      catch { hold('CONSTRUCTION_STORE_CLOSE_UNKNOWN'); }
    }
    if (transferred || store !== null || openingStore && !unpublishedStoreCloseReturned)
      hold('CONSTRUCTION_STORE_OWNERSHIP_HELD');
    if (!held && applicationSlot === slot) { slot.phase = 'RELEASED'; applicationSlot = null; }
    releaseCa(); // No service constructor escaped this failed construction.
    fail(held ? 'construction_close_unknown' : 'configuration_or_owner_unavailable');
  } finally {
    releaseLocalReadSelection();
    localReadOptions = null;
    configuration = null; materialOptions = null; fundingTransportOptions = null;
  }
  const FUNDING_DEADLINE = fundingOptions.deadlineMs;
  fundingOptions = null;
  const JOIN_BUDGET = Math.min(FUNDING_DEADLINE, serviceOptions.deadlineMs, 1000);

  function operation(name, input) {
    if (phase !== 'FUNDING' || closing !== null || held) fail('funding_unavailable');
    return funder[name](input);
  }
  function launch(work, count, input) {
    if (count !== 1 || !invariant() || lifecycle !== 'OPEN' || held || pending !== null || closing !== null)
      return rejected('operation_unavailable');
    const c = capability(); pending = c.promise;
    observe(c.promise, () => { if (pending === c.promise) pending = null; finishClose(); },
      () => { if (pending === c.promise) pending = null; finishClose(); });
    try {
      observe(work(input), value => {
        if (lifecycle !== 'OPEN' || held || closing !== null) c.reject(error('operation_unavailable'));
        else c.resolve(value);
      }, () => c.reject(error('operation_unavailable')));
    } catch { c.reject(error('operation_unavailable')); }
    return c.promise;
  }
  async function prepare(input) {
    const original = ORIGINAL_INPUT(input, storeOptions.resourceUrl);
    // Reject a misconfigured official asset before the real signer/preparer.
    // This DATA capture is not another current read or a renewed work budget.
    if (original.challenge.paymentRequired.accepts[0].asset !== serviceOptions.official.assetInfo.asset)
      fail('funding_unavailable');
    const value = await operation('prepareOriginalFunding', original);
    if (data(value, 'phase') !== 'AWAITING_INDEPENDENT_PINS') fail('funding_unavailable');
    packet = data(value, 'packet');
    retained = F({ resourceUrl: storeOptions.resourceUrl, serializedCheckpoint: data(packet, 'serializedCheckpoint'),
      paymentRequiredHeader: data(data(data(packet, 'pair'), 'challenge'), 'paymentRequiredHeader') });
    return value;
  }
  async function commit(input) { return operation('commitOriginalFunding', input); }
  async function submit(input) {
    const value = await operation('submitOriginalFunding', input);
    bound = data(value, 'phase') === 'FUNDING_INTAKE_BOUND' && data(value, 'fundingIntakeStatus') === 'BOUND';
    return value; // Still not a grant, publication/inclusion or service authority.
  }
  function closeFundingOnce() {
    if (fundingClose !== null) return fundingClose;
    const c = capability(); fundingClose = c.promise; fundingCloseOutcome = 'PENDING';
    try {
      observe(funder.close(), value => {
        try {
          if (data(value, 'lifecycle') !== 'CLOSED') fail('close_unknown');
          fundingCloseOutcome = 'CLOSED';
          if (!fundingClosedFresh()) fail('close_unknown');
          slot.store = null; store = null; c.resolve(undefined);
        } catch { fundingCloseOutcome = 'UNKNOWN'; hold('FUNDING_CLOSE_UNKNOWN'); c.reject(error('close_unknown')); }
        finishClose();
      }, () => { fundingCloseOutcome = 'UNKNOWN'; hold('FUNDING_CLOSE_UNKNOWN'); c.reject(error('close_unknown')); finishClose(); });
    } catch { fundingCloseOutcome = 'UNKNOWN'; hold('FUNDING_CLOSE_UNKNOWN'); c.reject(error('close_unknown')); }
    return fundingClose;
  }
  function closeServiceOnce() {
    if (service === null) return null;
    if (serviceClose !== null) return serviceClose;
    const c = capability(); serviceClose = c.promise; serviceCloseOutcome = 'PENDING';
    try {
      observe(service.close(), value => {
        try {
          if (value !== undefined || !fundingClosedFresh() || data(service.snapshot(), 'lifecycle') !== 'CLOSED')
            fail('close_unknown');
          serviceCloseOutcome = 'CLOSED'; c.resolve(undefined);
        } catch { serviceCloseOutcome = 'UNKNOWN'; hold('SERVICE_CLOSE_UNKNOWN'); c.reject(error('close_unknown')); }
        finishClose();
      }, () => { serviceCloseOutcome = 'UNKNOWN'; hold('SERVICE_CLOSE_UNKNOWN'); c.reject(error('close_unknown')); finishClose(); });
    } catch { serviceCloseOutcome = 'UNKNOWN'; hold('SERVICE_CLOSE_UNKNOWN'); c.reject(error('close_unknown')); }
    return serviceClose;
  }
  async function handoff(input) {
    if (phase !== 'FUNDING' || !bound || retained === null || handoffAttempts !== 0) fail('handoff_unavailable');
    // Reject malformed external originals/pins/grant/challenge BEFORE consuming
    // handoff or asking the actual funder to close. Nothing is learned from DB.
    const selected = HANDOFF(input, retained);
    handoffAttempts = 1; slot.phase = phase = 'HANDING_OFF';
    await closeFundingOnce();
    if (held || closing !== null || !fundingHandoffGuard()) fail('handoff_unavailable');
    serviceOpenEntered = true;
    try {
      service = await SERVICE({
        payerOptions: { databasePath: storeOptions.databasePath, allowedRoot: storeOptions.allowedRoot,
          fundingResourceUrl: storeOptions.resourceUrl, custodyPolicy: policy,
          selectedGrantId: selected.selectedGrantId, deadlineMs: serviceOptions.deadlineMs },
        originalPayment: selected.originalPayment, official: serviceOptions.official,
        transportOptions: serviceOptions.transportOptions, fundingHandoffGuard,
      });
      slot.service = service;
      if (closing !== null) { closeServiceOnce(); fail('handoff_unavailable'); }
      if (!fundingHandoffGuard()) fail('handoff_unavailable');
      // Explicit handoff includes the real official creator/restoration, but
      // it releases ONLY the retained header and never sends another funding POST.
      const restored = await service.restoreOriginalPayment({
        paymentRequiredHeader: selected.paymentRequiredHeader, expectedPins: selected.originalPayment.expectedPins });
      if (held || closing !== null || !fundingHandoffGuard()) fail('handoff_unavailable');
      slot.phase = phase = 'SERVICE';
      return F({ phase: 'SERVICE_CLIENT_OPEN_ORIGINAL_RESTORED', original: restored,
        selectedGrantId: selected.selectedGrantId, sameFileObserved: true, authority: 'NONE',
        grantActivation: 'NOT_ESTABLISHED', serviceDelivery: 'NOT_ESTABLISHED' });
    } catch {
      // An acquisition failure can hide a HELD actual root even during close.
      // Do not report clean outer cleanup merely because no facade returned.
      if (service === null || closing === null) hold('SERVICE_HANDOFF_UNKNOWN_OR_REFUSED');
      // No automatic close/reopen/retry after unknown service acquisition or
      // restoration. Explicit outer close still requests owned native stop.
      fail('handoff_unavailable');
    } finally { releaseCa(); } // Actual native service constructor owns its copy.
  }
  function serviceWork(input) {
    if (phase !== 'SERVICE' || service === null || !fundingHandoffGuard()) fail('service_unavailable');
    return service.submitOriginal(input);
  }
  let closeCapability = null;
  function finishClose() {
    if (closing === null || historicalClose !== 'PENDING') return;
    if (held || fundingCloseOutcome === 'UNKNOWN' || serviceCloseOutcome === 'UNKNOWN' || operationDrain === 'UNKNOWN') {
      historicalClose = 'REJECTED'; hold('CLOSE_OUTCOME_UNKNOWN'); closeCapability.reject(error('close_unknown')); return;
    }
    if (fundingCloseOutcome !== 'CLOSED' || operationDrain !== 'DRAINED' || pending !== null) return;
    if (service !== null) {
      if (serviceClose === null) { closeServiceOnce(); return; }
      if (serviceCloseOutcome !== 'CLOSED') return;
    }
    if (!fundingClosedFresh()) {
      historicalClose = 'REJECTED'; hold('LATE_FUNDING_VIEW_UNKNOWN'); closeCapability.reject(error('close_unknown')); return;
    }
    historicalClose = 'FULFILLED_UNDEFINED'; lifecycle = 'CLOSED'; slot.phase = 'RELEASED';
    releaseCa();
    if (applicationSlot === slot) applicationSlot = null;
    closeCapability.resolve(undefined);
  }
  const close = F(function close() {
    if (arguments.length !== 0) return rejected('input_rejected');
    if (closing !== null) return closing;
    closeCapability = capability(); closing = closeCapability.promise; lifecycle = 'CLOSING'; historicalClose = 'PENDING';
    const active = pending;
    if (!serviceOpenEntered) releaseCa(); // A pending handoff checks closing before opening.
    // Independent stop attempts, no await/short-circuit. The actual funder and
    // service owners retain their own native/budget/store-close fences.
    closeFundingOnce(); closeServiceOnce();
    operationDrain = active === null ? 'DRAINED' : 'PENDING';
    if (active !== null) {
      const settled = capability();
      observe(active, () => settled.resolve('DRAINED'), () => settled.resolve('DRAINED'));
      const observed = DRAIN(F(function currentOperationSettlement() { return settled.promise; }), JOIN_BUDGET);
      observe(observed, value => {
        operationDrain = value === true ? 'DRAINED' : 'UNKNOWN';
        if (operationDrain === 'UNKNOWN') hold('OPERATION_JOIN_UNKNOWN');
        finishClose();
      }, () => { operationDrain = 'UNKNOWN'; hold('OPERATION_JOIN_UNKNOWN'); finishClose(); });
    }
    finishClose(); return closing;
  });
  const inspect = F(function inspect() {
    if (arguments.length !== 0 || !invariant()) fail('input_rejected');
    if (fundingCloseOutcome === 'CLOSED' && !fundingClosedFresh()) hold('CURRENT_FUNDING_HANDOFF_UNKNOWN');
    const serviceView = service === null ? null : service.snapshot();
    if (lifecycle === 'CLOSED' && serviceView !== null && data(serviceView, 'lifecycle') !== 'CLOSED')
      hold('CURRENT_SERVICE_CLOSE_UNKNOWN');
    return F({ nativeFundingServiceClientVersion: 1, phase, lifecycle, held, closeError,
      applicationSlotHeld: applicationSlot === slot, applicationSlotPhase: slot.phase,
      publicOperationActive: pending !== null, fundingBound: bound, handoffAttempts, serviceOpenEntered,
      fundingCloseOutcome, serviceCloseOutcome, operationDrain, historicalClose,
      funding: funder.inspectOriginalFunding(), service: serviceView,
      defaultEnabled: false, automaticReplay: false, sameFileIsAtomicLease: false,
      nativeResourceCleanup: 'NOT_QUALIFIED', grantActivation: 'NOT_ESTABLISHED',
      serviceDelivery: 'NOT_ESTABLISHED', fullP1: 'NOT_ESTABLISHED', authority: 'NONE' });
  });
  return F({
    prepareOriginalFunding: F(function prepareOriginalFunding(input) { return launch(prepare, arguments.length, input); }),
    commitOriginalFunding: F(function commitOriginalFunding(input) { return launch(commit, arguments.length, input); }),
    submitOriginalFunding: F(function submitOriginalFunding(input) { return launch(submit, arguments.length, input); }),
    handoffToService: F(function handoffToService(input) { return launch(handoff, arguments.length, input); }),
    submitOriginal: F(function submitOriginal(input) { return launch(serviceWork, arguments.length, input); }),
    inspect, close,
  });
}
function identity(path) {
  const s = STAT(path, { bigint: true });
  if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1n || (s.mode & 0o077n) !== 0n) fail('file_identity_unavailable');
  return [s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink].map(String).join(':');
}
function captureCa(value) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) || !Buffer.isBuffer(value)
      || PROTO(value) !== Buffer.prototype || utilTypes.isSharedArrayBuffer(APPLY(ARRAY_BUFFER, value, [])))
    fail('input_rejected');
  const names = KEYS(value);
  if (names.length < 1 || names.length > 65536) fail('input_rejected');
  const out = Buffer.alloc(names.length);
  for (let i = 0; i < names.length; i++) {
    const d = DESC(value, String(i));
    if (!d || !OWN(d, 'value') || !d.enumerable || !Number.isInteger(d.value) || d.value < 0 || d.value > 255)
      fail('input_rejected');
    out[i] = d.value;
  }
  return out;
}
function exact(value, fields) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || PROTO(value) !== Object.prototype || KEYS(value).length !== fields.length) fail('input_rejected');
  const out = {};
  for (const name of fields) {
    const d = DESC(value, name);
    if (!d || !OWN(d, 'value') || !d.enumerable) fail('input_rejected');
    Object.defineProperty(out, name, { value: d.value, enumerable: true });
  }
  return out;
}
function data(value, field) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || (PROTO(value) !== Object.prototype && PROTO(value) !== null) || !Object.isFrozen(value)) fail('observation_rejected');
  const d = DESC(value, field);
  if (!d || !OWN(d, 'value') || !d.enumerable) fail('observation_rejected');
  return d.value;
}
function integer(value, low, high) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < low || value > high) fail('input_rejected');
}
function invariant() {
  return DESC(Object.prototype, 'then') === undefined && DESC(Object.prototype, 'toJSON') === undefined
    && same(DESC(PROMISE, 'then'), THEN) && same(DESC(PROMISE, 'constructor'), CTOR)
    && same(DESC(NativePromise, Symbol.species), SPECIES);
}
function same(a, b) { return !!a && !!b && KEYS(a).length === KEYS(b).length && KEYS(b).every(k => OWN(a,k) && a[k] === b[k]); }
function safe(value) {
  if (!invariant() || !IS_PROMISE(value) || IS_PROXY(value) || PROTO(value) !== PROMISE) return false;
  const d = DESC(value, 'constructor');
  return d === undefined || OWN(d, 'value') && d.value === NativePromise && !d.enumerable && !d.writable && !d.configurable;
}
function observe(value, yes, no) {
  if (!safe(value)) fail('observation_rejected');
  const bridge = APPLY(THEN.value, value, [yes,no]);
  if (!safe(bridge)) fail('observation_rejected');
  APPLY(THEN.value, bridge, [discard,discard]);
}
function capability() {
  let resolve, reject; const promise = new NativePromise((yes,no) => { resolve = yes; reject = no; });
  Object.defineProperty(promise, 'constructor', { value: NativePromise });
  APPLY(THEN.value, promise, [discard,discard]); return { promise, resolve, reject };
}
function boundedSettlement(promise, budget, requireUndefined) {
  const c = capability();
  observe(promise, value => {
    if (requireUndefined && value !== undefined) c.resolve('UNKNOWN'); else c.resolve('DRAINED');
  }, () => c.resolve('UNKNOWN'));
  const out = capability();
  observe(DRAIN(F(function settlement() { return c.promise; }), budget),
    clean => { if (clean === true) out.resolve(undefined); else out.reject(error('close_unknown')); },
    () => out.reject(error('close_unknown')));
  return out.promise;
}
function rejected(kind) { const c = capability(); c.reject(error(kind)); return c.promise; }
function error(kind) {
  const code = 'zenon_native_funding_service_client_' + kind, e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code }); return F(e);
}
function fail(kind) { throw error(kind); }
function discard() {}

