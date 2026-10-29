import { types as utilTypes } from 'node:util';
import { createZenonFundingIntake, ZenonFundingIntakeError } from './service-credit-zenon-funding-intake.js';
import { createOfficialIssuedFundingPostSelectedSettlementServer } from './x402-official-selected-settlement-server.js';
import { createIssuedFundingPostSdkResourceBinding } from './x402-issued-funding-post-sdk-resource.js';
import { captureOfficialFundingPostHttpsRoute, captureOfficialFundingPostHttpsRequest } from './x402-official-funding-post-https-request-binding.js';
import { decodeB64Json, validatePaymentPayloadEnvelope, sameResource, sameRequirements } from './x402-wire.js';
import { observeServiceCreditOperationDrain } from './service-credit-bounded-operation-drain.js';
import { ZenonFundingIntakeSqliteStore } from './service-credit-zenon-funding-intake-sqlite-store.js';
import { createOfficialFundingPostOutcomeCustody } from './official-funding-post-outcome-custody.js';

const INTAKE = createZenonFundingIntake, SERVER = createOfficialIssuedFundingPostSelectedSettlementServer;
const BINDING = createIssuedFundingPostSdkResourceBinding, ROUTE = captureOfficialFundingPostHttpsRoute;
const REQUEST = captureOfficialFundingPostHttpsRequest, DRAIN = observeServiceCreditOperationDrain;
const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, PROTO = Object.getPrototypeOf;
const KEYS = Reflect.ownKeys, OWN = Object.hasOwn, APPLY = Reflect.apply;
const IS_PROXY = utilTypes.isProxy, IS_PROMISE = utilTypes.isPromise;
const NativePromise = Promise, PROMISE = NativePromise.prototype, THEN = DESC(PROMISE,'then');
const CTOR = DESC(PROMISE,'constructor'), SPECIES = DESC(NativePromise,Symbol.species);
const STORE = ZenonFundingIntakeSqliteStore.prototype, CUSTODY_PORT = DESC(STORE,'officialOutcomeCustody').value;

/**
 * SOURCE ONLY listenerless funding backend. Construct the ACTUAL intake with
 * actual borrowed stores/authority, issue ONE actual durable original frame,
 * and configure the ACTUAL official SDK server from that exact url/tags frame.
 * Construction can read/write SQL/observer state through the actual intake.
 * No SDK/intake/factory substitute, automatic recovery, signer or default cutover.
 *
 * For an original paid POST: bind through actual intake/preflight FIRST, retain
 * its genuine BOUND result, THEN enter official verification/first settlement.
 * BOUND and official settlement are independent results, NEVER response aliases.
 * No chain publication/inclusion/grant/delivery authority follows from BOUND.
 * Trusted localFacilitator remains an explicit operational capability.
 *
 * Same original header only reads its retained result. Pending observation is
 * a separate explicit method on the SAME continuation, never another first
 * settle/verifier or funding resend. The caller mounts a qualified native
 * ingress/response writer and scoped service session separately.
 *
 * Close fences admission and closes intake admission/pending continuation,
 * joining the active operation under a cooperative budget. Borrowed SQL stores
 * are NEVER closed here; unknown requires host HOLD, not force-close/reopen.
 * No actual SDK/SQL/native run or full P1/production qualification is established.
 */
export async function createOfficialFundingPostIntakeComposition(options) {
  if (arguments.length !== 1) fail('configuration_rejected');
  return createComposition(options, false);
}
/** Explicit durable profile. Legacy callers keep their original constructor;
 * this named source entry requires the new selected three-table store. */
export async function createDurableOfficialFundingPostIntakeComposition(options) {
  if (arguments.length !== 1) fail('configuration_rejected');
  return createComposition(options, true);
}
async function createComposition(options, durable) {
  if (!invariant()) fail('configuration_rejected');
  let intake = null, official = null, custody = null, fixed, maxAttempts, budget, route;
  try {
    const c = exact(options,['intake','official','maxIntakeAttempts','closeBudgetMs']);
    const i = exact(c.intake,['store','serviceCreditStore','authorityRecord','deriveFundingTerms','now',
      'observerRoot','observerCatchUp','selection','resourceUrl']);
    const selection = F(exact(i.selection,['offerId','offerVersion','holderId','capabilityCommitment']));
    const sdk = exact(c.official,['localFacilitator','validateChallenge','reconcilePendingSettlement','maxPendingReconciliations']);
    integer(c.maxIntakeAttempts,1,16); integer(c.closeBudgetMs,1,1000);
    maxAttempts = c.maxIntakeAttempts; budget = c.closeBudgetMs; route = ROUTE(i.resourceUrl);
    let custodyPort = null;
    if (durable) {
      if (i.store === null || typeof i.store !== 'object' || IS_PROXY(i.store) || PROTO(i.store) !== STORE
          || OWN(i.store,'officialOutcomeCustody') || DESC(STORE,'officialOutcomeCustody')?.value !== CUSTODY_PORT) fail('configuration_rejected');
      // Profile refusal precedes intake construction/issuance and SDK loading.
      custodyPort = APPLY(CUSTODY_PORT,i.store,[selection]);
    }
    intake = INTAKE({ store:i.store, serviceCreditStore:i.serviceCreditStore, authorityRecord:i.authorityRecord,
      deriveFundingTerms:i.deriveFundingTerms, now:i.now, observerRoot:i.observerRoot, observerCatchUp:i.observerCatchUp });
    const issuedFrame = intake.issue({ selection, resourceUrl:i.resourceUrl });
    const selected = BINDING(issuedFrame,i.resourceUrl).selection(); fixed = selected;
    if (durable) custody = createOfficialFundingPostOutcomeCustody(F({ context:F({ issuedFrame:selected.frame,
      resourceUrl:i.resourceUrl,serviceSelection:selection,maximumPendingReconciliations:sdk.maxPendingReconciliations }),port:custodyPort }));
    official = await SERVER({ ...sdk, issuedFrame:selected.frame, resourceUrl:i.resourceUrl, contextLimit:1 });
  } catch {
    if (custody !== null) { try { if (custody.close() !== undefined) fail('construction_close_unknown'); } catch { fail('construction_close_unknown'); } }
    if (intake !== null) {
      try { if (intake.close() !== undefined) fail('construction_close_unknown'); }
      catch { fail('construction_close_unknown'); }
    }
    fail('configuration_rejected');
  } finally { options = null; }
  const IN = intake, SDK = official, FIXED = fixed, ROUTED = route, CUSTODY = custody;
  intake = null; official = null; custody = null; fixed = null; route = null;
  let phase = 'OPEN', held = false, active = null, attempts = 0, sdkEntered = false;
  let originalHeader = null, originalHash = null, bound = null, cached = null, pending = null;
  let custodyCandidate = null;
  let closing = null, closeCapability = null, progress = null, closeOutcome = 'NOT_REQUESTED';
  let intakeClosed = false, pendingClose = null, pendingCloseRequested = false, pendingCloseDone = false;
  function hold() { held = true; phase = 'HELD'; }
  function live() { return invariant() && !held && closing === null && phase !== 'CLOSED'; }
  function releaseProgress() {
    if (progress !== null && intakeClosed && active === null && (pending === null || pendingCloseDone))
      progress.resolve('DRAINED');
  }
  function closePending() {
    if (pending === null || pendingCloseRequested) return;
    pendingCloseRequested = true; // Claim before even a throwing close callback.
    try {
      pendingClose = pending.close();
      observe(pendingClose, value => {
        pendingCloseDone = true; if (value !== undefined) hold(); releaseProgress();
      }, () => { pendingCloseDone = true; hold(); releaseProgress(); });
    } catch { pendingCloseDone = true; hold(); releaseProgress(); }
  }
  function publicOfficial(value) {
    const type = data(value,'type');
    if (type === 'settled') return F({ type, settlement:data(value,'settlement') });
    if (type === 'payment-error') return F({ type, response:data(value,'response') });
    fail('official_outcome_unknown');
  }
  function result(officialResult, resultPhase) {
    return F({ phase:resultPhase, intake:bound, official:officialResult,
      transactionHash:originalHash, acknowledgementDomainsIndependent:true, authority:'NONE',
      grantActivation:'NOT_ESTABLISHED', serviceDelivery:'NOT_ESTABLISHED' });
  }
  function launch(work) {
    if (!live() || active !== null) return rejected('operation_unavailable');
    const c = capability(); active = c.promise;
    observe(c.promise, () => { if (active === c.promise) active = null; releaseProgress(); },
      () => { if (active === c.promise) active = null; releaseProgress(); });
    try {
      observe(work(), value => {
        if (!live()) c.reject(error('operation_unavailable')); else c.resolve(value);
      }, () => c.reject(error('operation_unavailable')));
    } catch { c.reject(error('operation_unavailable')); }
    return c.promise;
  }
  async function process(captured) {
    if (originalHeader !== null) {
      if (captured.paymentSignature !== originalHeader || cached === null) fail('original_unavailable');
      if (CUSTODY !== null) { try { CUSTODY.assertCurrent(); } catch { hold(); fail('custody_unknown'); } }
      return cached; // No intake, verifier, first settle or observer on replay.
    }
    if (attempts >= maxAttempts || captured.paymentSignature === null) fail('original_unavailable');
    const payload = decodeB64Json(captured.paymentSignature,{maxEncodedBytes:5464,maxDecodedBytes:4096});
    validatePaymentPayloadEnvelope(payload);
    if (!sameResource(payload.resource,FIXED.resource) || !sameRequirements(payload.accepted,FIXED.requirement))
      fail('original_unavailable');
    attempts++;
    let actualBound;
    try { actualBound = await IN.bind(payload); }
    catch (caught) {
      // Only the actual intake's known REJECTED refusal precedes SDK entry.
      // No SDK context/hash claim was made, so this is not an authority reset.
      if (!knownRejected(caught)) hold();
      fail('intake_unavailable');
    }
    try {
      if (data(actualBound,'status') !== 'BOUND' || data(actualBound,'transactionHash') !== payload.payload.transaction.hash)
        fail('intake_outcome_unknown');
      bound = actualBound; originalHash = payload.payload.transaction.hash; originalHeader = captured.paymentSignature;
      if (!live()) fail('closed_before_official');
      if (CUSTODY !== null) { CUSTODY.enter(originalHeader,bound); CUSTODY.assertCurrent(); }
      if (!live()) fail('closed_before_official');
      sdkEntered = true; // Before a facilitator/schema callback can reenter.
      const returned = await SDK.processRequest(originalHeader);
      const type = data(returned,'type'), continuation = data(returned,'pending');
      if (continuation !== null) pending = continuation; // Retain before any refusal/serialization.
      let candidate;
      if (type === 'settled' && data(data(returned,'settlement'),'success') === true && pending === null) {
        candidate = result(publicOfficial(returned),'INTAKE_BOUND_OFFICIAL_SETTLED');
      } else if (type === 'payment-error' && pending !== null && data(pending.getSnapshot(),'phase') === 'PENDING') {
        candidate = result(publicOfficial(returned),'INTAKE_BOUND_OFFICIAL_PENDING');
      } else { fail('official_outcome_unknown'); }
      if (CUSTODY === null) cached = candidate;
      else { custodyCandidate = candidate; CUSTODY.record(candidate); }
      if (!live()) fail('closed_after_official');
      cached = candidate; custodyCandidate = null;
      phase = 'ORIGINAL_RETAINED'; return cached;
    } catch { hold(); fail('official_outcome_unknown'); }
    finally { if (closing !== null) closePending(); }
  }
  const processHttpRequest = F(function processHttpRequest(request) {
    if (arguments.length !== 1 || !live()) return rejected('input_rejected');
    let captured;
    try { captured = REQUEST(request,ROUTED); if (captured.paymentSignature === null) fail('input_rejected'); }
    catch { return rejected('input_rejected'); }
    // The actual request is not retained across intake/SDK awaits. Its exact
    // admitted header goes to the actual server's configured POST scalar API.
    return launch(() => process(captured));
  });
  const resumeOriginalSettlement = F(function resumeOriginalSettlement() {
    if (arguments.length !== 0) return rejected('input_rejected');
    return launch(async () => {
      if (pending === null || cached === null || cached.phase !== 'INTAKE_BOUND_OFFICIAL_PENDING') fail('pending_unavailable');
      try {
        if (CUSTODY !== null) { CUSTODY.beginObservation(); CUSTODY.assertCurrent(); }
        if (!live()) fail('closed_before_observation');
        const observed = await pending.resume();
        const settlement = data(observed,'settlement'), headers = data(observed,'headers');
        const success = data(settlement,'success');
        const view = pending.getSnapshot();
        const candidate = result(F({ type:'observed-settlement', settlement, headers }), success
          ? 'INTAKE_BOUND_OFFICIAL_SETTLED' : data(view,'phase') === 'PENDING'
            ? 'INTAKE_BOUND_OFFICIAL_PENDING' : 'INTAKE_BOUND_OFFICIAL_EXHAUSTED');
        if (CUSTODY === null) cached = candidate;
        else { custodyCandidate = candidate; CUSTODY.record(candidate); }
        if (!live()) fail('closed_after_observation');
        cached = candidate; custodyCandidate = null;
        return cached;
      } catch { hold(); fail('official_outcome_unknown'); }
    });
  });
  const close = F(function close() {
    if (arguments.length !== 0) return rejected('input_rejected');
    if (closing !== null) return closing;
    closeCapability = capability(); closing = closeCapability.promise; progress = capability();
    phase = 'CLOSING'; closeOutcome = 'PENDING';
    if (CUSTODY !== null) {
      try { if (CUSTODY.close() !== undefined || CUSTODY.snapshot().held) hold(); } catch { hold(); }
    }
    // Independent admission/continuation closes; borrowed stores stay owned by host.
    try { if (IN.close() !== undefined) hold(); else intakeClosed = true; } catch { hold(); }
    closePending(); releaseProgress();
    try {
      observe(DRAIN(F(function joinedSettlement() { return progress.promise; }),budget), drained => {
        if (drained === true && !held && intakeClosed && active === null && (pending === null || pendingCloseDone)) {
          phase='CLOSED';closeOutcome='FULFILLED_UNDEFINED';closeCapability.resolve(undefined);
        } else { hold();closeOutcome='REJECTED';closeCapability.reject(error('close_unknown')); }
      }, () => { hold();closeOutcome='REJECTED';closeCapability.reject(error('close_unknown')); });
    } catch { hold();closeOutcome='REJECTED';closeCapability.reject(error('close_unknown')); }
    return closing;
  });
  const snapshot = F(function snapshot() {
    if (arguments.length !== 0 || !invariant()) fail('input_rejected');
    return F({ officialFundingPostIntakeVersion:1,phase,held,active:active!==null,intakeAttempts:attempts,
      maxIntakeAttempts:maxAttempts,sdkEntered,originalRetained:originalHeader!==null,transactionHash:originalHash,
      intakeBound:bound!==null,officialOutcome:cached===null?null:cached.phase,closeOutcome,intakeClosed,
      pendingRetained:pending!==null,pendingCloseRequested,pendingCloseDone,official:SDK.getSnapshot(),stores:'BORROWED_NOT_CLOSED',
      automaticReplay:false,recovery:'EXTERNAL_EXPLICIT_OPERATION',nativeIoQualified:false,
      ...(CUSTODY===null?{}:{officialCustody:CUSTODY.snapshot(),officialCandidateRetained:custodyCandidate!==null}),
      grantActivation:'NOT_ESTABLISHED',serviceDelivery:'NOT_ESTABLISHED',authority:'NONE' });
  });
  return F({ getIssuedChallenge:F(function getIssuedChallenge() {
    if (arguments.length !== 0 || !live()) fail('input_rejected');return FIXED.frame;
  }),processHttpRequest,resumeOriginalSettlement,close,snapshot,
    ...(CUSTODY===null?{}:{exportOfficialOutcomeRecord:F(function exportOfficialOutcomeRecord(){
      if(arguments.length!==0||!live())fail('input_rejected');return CUSTODY.exportRecordedState();
    })}) });
}
function knownRejected(value) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || PROTO(value)!==ZenonFundingIntakeError.prototype) return false;
  const d=DESC(value,'code');return d&&OWN(d,'value')&&d.value==='ZENON_FUNDING_INTAKE_REJECTED';
}
function exact(value,fields) {
  if(value===null||typeof value!=='object'||IS_PROXY(value)||PROTO(value)!==Object.prototype||KEYS(value).length!==fields.length)fail('input_rejected');
  const out={};for(const field of fields){const d=DESC(value,field);if(!d||!OWN(d,'value')||!d.enumerable)fail('input_rejected');
    Object.defineProperty(out,field,{value:d.value,enumerable:true});}return out;
}
function data(value,field) {
  if(value===null||typeof value!=='object'||IS_PROXY(value)||(PROTO(value)!==Object.prototype&&PROTO(value)!==null)||!Object.isFrozen(value))fail('input_rejected');
  const d=DESC(value,field);if(!d||!OWN(d,'value')||!d.enumerable)fail('input_rejected');return d.value;
}
function integer(v,lo,hi){if(!Number.isSafeInteger(v)||Object.is(v,-0)||v<lo||v>hi)fail('input_rejected');}
function same(a,b){return !!a&&!!b&&KEYS(a).length===KEYS(b).length&&KEYS(b).every(k=>OWN(a,k)&&a[k]===b[k]);}
function invariant(){return DESC(Object.prototype,'then')===undefined&&DESC(Object.prototype,'toJSON')===undefined
  &&same(DESC(PROMISE,'then'),THEN)&&same(DESC(PROMISE,'constructor'),CTOR)&&same(DESC(NativePromise,Symbol.species),SPECIES);}
function safe(value){if(!invariant()||!IS_PROMISE(value)||IS_PROXY(value)||PROTO(value)!==PROMISE)return false;
  const d=DESC(value,'constructor');return d===undefined||OWN(d,'value')&&d.value===NativePromise&&!d.enumerable&&!d.writable&&!d.configurable;}
function observe(value,yes,no){if(!safe(value))fail('observation_rejected');const b=APPLY(THEN.value,value,[yes,no]);
  if(!safe(b))fail('observation_rejected');APPLY(THEN.value,b,[discard,discard]);}
function capability(){let resolve,reject;const promise=new NativePromise((yes,no)=>{resolve=yes;reject=no;});
  Object.defineProperty(promise,'constructor',{value:NativePromise});APPLY(THEN.value,promise,[discard,discard]);return{promise,resolve,reject};}
function rejected(kind){const c=capability();c.reject(error(kind));return c.promise;}
function error(kind){const code='official_funding_post_intake_'+kind,e=new TypeError(code);Object.defineProperty(e,'code',{value:code,enumerable:true});
  Object.defineProperty(e,'stack',{value:'TypeError: '+code});return F(e);}
function fail(kind){throw error(kind);}function discard(){}

