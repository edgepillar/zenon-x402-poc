import { captureIssuedFundingGrantRecoveryExpectation,captureIssuedFundingGrantRecoveryRows } from './x402-issued-funding-grant-recovery.js';
import { writeIssuedApplicationResponse as WRITE } from './x402-issued-application-response-writer.js';
import { types as utilTypes } from 'node:util';
import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical.js';
import { createIssuedFundingPostApplicationBinding, captureIssuedFundingPostServiceSelection } from './x402-issued-funding-post-application-binding.js';
import { createIssuedRecordedResultGrantBinding, createIssuedOriginalResultGrantBinding } from './issued-recorded-result-grant-binding.js';
import { createIssuedFundingPostSdkResourceBinding } from './x402-issued-funding-post-sdk-resource.js';
import { captureOfficialFundingPostHttpsRoute, captureOfficialFundingPostHttpsRequest } from './x402-official-funding-post-https-request-binding.js';
import { captureOriginalFundingGrantRoute, ORIGINAL_FUNDING_GRANT_PATH } from './service-credit-original-grant-http-binding.js';
import { captureIssuedFundingGrantRoutes, captureIssuedFundingGrantRequest } from './x402-issued-funding-grant-request-binding.js';
import { captureServiceCreditBoundedHttpsIngressLimits, SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_LIMIT_FIELDS } from './service-credit-bounded-https-ingress-limits.js';
const SERVICE_SELECTION=captureIssuedFundingPostServiceSelection,ROUTE=captureOfficialFundingPostHttpsRoute,REQUEST=captureOfficialFundingPostHttpsRequest;
const F=Object.freeze,D=Object.getOwnPropertyDescriptor,P=Object.getPrototypeOf,K=Reflect.ownKeys,O=Object.hasOwn,A=Reflect.apply;
const IS_PROXY=utilTypes.isProxy,IS_PROMISE=utilTypes.isPromise,NativePromise=Promise,PP=NativePromise.prototype;
const THEN=D(PP,'then'),CTOR=D(PP,'constructor'),SPECIES=D(NativePromise,Symbol.species);
const CREDIT='/service-credit/v1/execute',MAX_ACTIVE=64;
const HELD=new Set();
const LIMITS=SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_LIMIT_FIELDS;
const BAD=frame(400,'Bad Request'),UNAVAILABLE=frame(503,'Service Unavailable');
const SERVICE_UNAVAILABLE=F({statusCode:503,contentType:'application/json',body:'{"error":"service_unavailable"}',headers:F({})});

/**
 * Actual source controller with declared component ports. Native bindings are separate.
 * The protected provider predecessor and default funding client are preserved.
 * Declared ports qualify this control flow as DATA only. The separate native
 * binding remains NOT_EXECUTED.
 *
 * Native binding target: issued funding POST + scoped durable service on
 * ONE existing bounded native HTTPS owner. The old GET/paid app is unchanged.
 * This explicit fresh-intake profile rejects actual startup BOUND rows rather
 * than asserting recovery or opening historical observer files. Existing ISSUED
 * selection reuse remains the actual intake's original-frame operation.
 *
 * Native construction may read/write SQL/observer state through actual owners; no
 * listener is started and TLS material/factory are supplied explicitly. Owned
 * funding/service admission/continuations close through the actual ingress.
 * Both configured SQL stores stay borrowed and are NEVER closed by this root.
 *
 * Service is initially unavailable. After an EXTERNAL authorized activation has
 * committed a grant, an explicit LOCAL admitCommittedServiceGrant(grantId) call
 * supplies its resulting ID and reads that actual store record. The ID need not
 * exist before funding. Check its exact ID, original transaction, issued
 * digests and holder/capability selection. It THEN constructs the actual scoped
 * session. No HTTP request, BOUND or settlement receipt activates a grant.
 * Restored EXPIRED/REVOKED originals instead select the fixed recorded-result
 * reader: the same scoped proof and original request are required, and no
 * execution owner is constructed. Fresh admission remains ACTIVE-only.
 *
 * Original header replay is cache-only, not another first settlement/resend.
 * Pending observation is local/explicit on the same continuation. UNKNOWN and
 * uncertain close remain held; no force-close/reopen or replacement. Runtime,
 * SDK, SQLite, TLS, activation, native release and production are NOT qualified.
 */
export async function createIssuedFundingGrantApplicationCore(options, ports) {
  if(arguments.length!==2)fail('configuration');return createCore(options,ports,false);
}
/** Explicit recorded recovery; never choose this mode from an HTTP request. */
export async function restoreIssuedFundingGrantApplicationCore(options,ports){
  if(arguments.length!==2)fail('configuration');return createCore(options,ports,true);
}
async function createCore(options,ports,restoring){
  if(!invariant()||HELD.size>=64)fail('configuration');
  const caps=exact(ports,['createFunding','createIngress','createServiceSession','validateStores','loadBound','readCommittedGrant','createQueryDownstream'],true);
  for(const fn of Object.values(caps))if(!callable(fn))fail('configuration');
  const FUNDING=caps.createFunding,INGRESS=caps.createIngress,SESSION=caps.createServiceSession,BINDING=createIssuedFundingPostApplicationBinding;
  const fresh=store=>captureFreshRows(caps.loadBound(store));
  let fundingConfig,serviceConfig,transport,selection,route,recovery=null;
  try {
    const c=exact(options,restoring?['funding','service','transport','recovery']:['funding','service','transport']);
    if(restoring)recovery=captureIssuedFundingGrantRecoveryExpectation(c.recovery);
    const f=exact(c.funding,['intake','official','maxIntakeAttempts','closeBudgetMs']);
    const i=exact(f.intake,['store','serviceCreditStore','authorityRecord','deriveFundingTerms','now',
      'observerRoot','observerCatchUp','selection','resourceUrl']);
    const chosen=F(exact(i.selection,['offerId','offerVersion','holderId','capabilityCommitment']));
    const official=F(exact(f.official,['localFacilitator','validateChallenge','reconcilePendingSettlement','maxPendingReconciliations']));
    const s=exact(c.service,['store','execute','deadlineRuntime','selectedDurationMs']);
    selection=SERVICE_SELECTION(chosen);
    if(s.store!==i.serviceCreditStore||typeof s.execute!=='function'||IS_PROXY(s.execute)
        ||!Number.isSafeInteger(s.selectedDurationMs)||s.selectedDurationMs<1)fail('configuration');
    if(caps.validateStores(i.store,s.store)!==undefined)fail('configuration');
    // The actual durable execution owner requires its monotonic clock as well
    // as schedule/cancel. Do not drop that capability at this composition seam
    // or synthesize a clock; the separate ingress runtime remains two-field.
    serviceConfig=F({...s,deadlineRuntime:F(exact(s.deadlineRuntime,['monotonicNowNs','schedule','cancel']))});
    const t=exact(c.transport,['origin','generation','limits','deadlineRuntime','httpsServerFactory']);
    // Admit the SAME complete limit contract as the actual native owner before
    // fresh()/FUNDING can enter SQL, issue a challenge or initialize the SDK.
    const ingressLimits=captureServiceCreditBoundedHttpsIngressLimits(F(exact(t.limits,LIMITS)));
    if(ingressLimits===null)fail('configuration');
    transport=F({origin:t.origin,generation:F(exact(t.generation,['generationId','generationVersion'])),
      limits:ingressLimits,deadlineRuntime:F(exact(t.deadlineRuntime,['schedule','cancel'])),
      httpsServerFactory:t.httpsServerFactory});
    route=ROUTE(i.resourceUrl);
    if(typeof transport.origin!=='string'||route.resourceUrl!==transport.origin+'/funding'
        ||typeof transport.httpsServerFactory!=='function'||IS_PROXY(transport.httpsServerFactory))fail('configuration');
    fundingConfig=F({...f,official,intake:F({...i,selection:chosen,
      observerCatchUp:F(exact(i.observerCatchUp,['maximumPageEntries','maximumBackfillSpan','maximumMembersPerMomentum']))})});
    if(restoring)captureIssuedFundingGrantRecoveryRows(caps.loadBound(i.store),selection,route.resourceUrl,recovery);else fresh(i.store);
  }catch{fail('configuration');}finally{options=null;}

  let funding=null,binding=null,recordedResultBinding=null,originalResultBinding=null,ingress=null,service=null,query=null,mixedRoutes=null,opening=false;
  let closed=false,admissionRevoked=false,uncertain=false,terminal=null,rootCloseStarted=false,rootCloseDone=false;
  let serviceCloseStarted=false,serviceCloseDone=false,active=0,fundingBusy=false,admittedGrantId=null,serviceAdmissionMode=null;
  let queryCloseStarted=false,queryCloseDone=false,queryCalls=0,queryRefusals=0;
  let paidCalls=0,challengeCalls=0,serviceCalls=0,pendingObservations=0,admissionAttempts=0;
  const operations=new Set(),seen=new WeakSet(),waiters=[],opaqueQueryReturns=new Set();
  const serviceOptions=serviceConfig,fixedSelection=selection,routed=route,fundingStore=fundingConfig.intake.store;
  const retained=F(()=>[funding,binding,ingress,service,query,operations,opaqueQueryReturns]);
  function hold(){uncertain=true;HELD.add(retained);if(terminal==='CLOSED')terminal='CLOSE_UNCERTAIN';}
  function available(){return invariant()&&!admissionRevoked&&!closed&&!uncertain;}
  function captureRestoredOutcome(){
    if(!restoring)return;
    const value=funding.getRecordedOutcome();
    if(IS_PROMISE(value)||IS_PROXY(value)){opaqueQueryReturns.add(value);discardNative(value);hold();fail('recovery_unknown');}
    if(value===null){if(binding.inspect().boundRetained){hold();fail('recovery_unknown');}return;}
    binding.captureBoundOutcome(value);
    if(!available())fail('recovery_unknown');
  }
  function finish(done,clean){try{if(A(clean?done.success:done.failure,undefined,[])!==undefined)hold();}catch{hold();}}
  function isQueryTarget(request){try{return own(request,'url')===ORIGINAL_FUNDING_GRANT_PATH;}catch{return false;}}
  function invokeQuery(method,args,onDone){
    let returned=false,settled=false,observed=false,clean=false,bad=false;
    function flush(){if(returned&&observed&&!settled){settled=true;onDone(clean&&!bad);}}
    function complete(ok){if(observed){bad=true;hold();return;}observed=true;clean=ok;flush();}
    try{const value=A(method,undefined,[...args,F({success:F(()=>complete(true)),failure:F(()=>complete(false))})]);
      if(value!==undefined){opaqueQueryReturns.add(value);discardNative(value);bad=true;hold();if(!observed){observed=true;clean=false;}}
    }catch{bad=true;hold();if(!observed){observed=true;clean=false;}}
    finally{returned=true;flush();}
  }
  function completion(value){
    const c=exact(value,['success','failure'],true);
    if(!callable(c.success)||!callable(c.failure)||seen.has(value))fail('completion');
    seen.add(value);return c;
  }
  function finishClose(){
    if(!closed||terminal!==null||active!==0||opening||!rootCloseDone||!serviceCloseDone||!queryCloseDone)return;
    terminal=uncertain?'CLOSE_UNCERTAIN':'CLOSED';
    for(const done of waiters.splice(0))finish(done,!uncertain);
  }
  function closeService(){
    if(opening||serviceCloseStarted)return;
    serviceCloseStarted=true;
    if(service===null){serviceCloseDone=true;finishClose();return;}
    const complete=clean=>{if(serviceCloseDone){hold();return;}serviceCloseDone=true;if(!clean)hold();finishClose();};
    try{observe(service.close(),value=>complete(value===undefined),()=>complete(false));}
    catch{complete(false);}
  }
  function closeFunding(){
    if(rootCloseStarted)return;rootCloseStarted=true;
    if(funding===null){rootCloseDone=true;finishClose();return;}
    const complete=clean=>{if(rootCloseDone){hold();return;}rootCloseDone=true;if(!clean)hold();finishClose();};
    try{observe(funding.close(),value=>complete(value===undefined),()=>complete(false));}
    catch{complete(false);}
  }
  function closeQuery(){
    if(queryCloseStarted)return;queryCloseStarted=true;
    if(query===null){queryCloseDone=true;finishClose();return;}
    const complete=clean=>{if(queryCloseDone){hold();return;}queryCloseDone=true;if(!clean)hold();finishClose();};
    invokeQuery(query.downstream.close,[],complete);
  }
  const downstreamClose=F(function close(completionValue){
    let done;
    try{done=completion(completionValue);}catch{hold();return undefined;}
    if(arguments.length!==1){finish(done,false);return undefined;}
    if(terminal!==null){finish(done,terminal==='CLOSED');return undefined;}
    if(waiters.length>=MAX_ACTIVE){hold();finish(done,false);return undefined;}
    waiters.push(done);
    if(closed)return undefined;
    admissionRevoked=true;closed=true;
    for(const cell of operations){
      hold();if(cell.completion!==null)finish(cell.completion,false);
      cell.completion=null;cell.response=null;
    }
    closeFunding();closeService();closeQuery();finishClose();return undefined;
  });
  function acquire(response,done,isFunding){
    active++;if(isFunding)fundingBusy=true;
    const cell={response,completion:done,settled:false};operations.add(cell);
    return {cell,settle(clean){
      if(cell.settled){hold();return;}cell.settled=true;active--;if(isFunding)fundingBusy=false;
      if(!clean)hold();if(cell.completion!==null)finish(cell.completion,clean);
      cell.response=null;cell.completion=null;operations.delete(cell);finishClose();
    }};
  }
  const handle=F(function handle(request,response,transportContext,completionValue){
    let done;
    try{done=completion(completionValue);}catch{hold();return undefined;}
    if(arguments.length!==4||!available()||active>=MAX_ACTIVE){
      if(arguments.length===4&&isQueryTarget(request)&&query!==null){
        queryRefusals++;invokeQuery(query.reject,[request,response,transportContext],clean=>{if(!clean)hold();finish(done,clean);});
      }else finish(done,write(response,UNAVAILABLE));return undefined;
    }
    let target,captured;
    try{
      const admitted=captureIssuedFundingGrantRequest(request,mixedRoutes);target=admitted.target;
      if(target==='/funding')captured=REQUEST(request,routed);
    }catch{finish(done,write(response,BAD));return undefined;}
    if(restoring){try{captureRestoredOutcome();}catch{hold();finish(done,write(response,UNAVAILABLE,target));return undefined;}}
    if(target===ORIGINAL_FUNDING_GRANT_PATH){
      if(fundingBusy||opening||active!==0){queryRefusals++;invokeQuery(query.reject,[request,response,transportContext],clean=>{if(!clean)hold();finish(done,clean);});return undefined;}
      const op=acquire(response,done,false);queryCalls++;
      invokeQuery(query.downstream.handle,[request,response,transportContext],clean=>op.settle(clean));
      return undefined;
    }
    if(target==='/funding'&&fundingBusy){finish(done,write(response,UNAVAILABLE,target));return undefined;}
    if(target===CREDIT&&service===null){finish(done,write(response,SERVICE_UNAVAILABLE,target));return undefined;}
    if(target==='/funding'&&captured.paymentSignature===null){
      if(restoring){finish(done,write(response,UNAVAILABLE,target));return undefined;}
      challengeCalls++;finish(done,write(response,binding.getChallenge(),target));return undefined;
    }
    const op=acquire(response,done,target==='/funding');
    try{
      const promise=target==='/funding'?funding.processHttpRequest(request):service.handle(request,response);
      if(target==='/funding')paidCalls++;else serviceCalls++;
      observe(promise,value=>{
        if(!available()||op.cell.response===null){op.settle(false);return;}
        try{
          if(target==='/funding'){const reply=binding.captureBoundOutcome(value);op.settle(write(op.cell.response,reply,target));}
          else op.settle(value===undefined);
        }catch{write(op.cell.response,UNAVAILABLE,target);op.settle(false);}
      },()=>{
        if(!available()||op.cell.response===null){op.settle(false);return;}
        // The actual root distinguishes pre-SDK refusal from unknown side effects.
        let known=false,waiting=false;
        try{const state=target==='/funding'?funding.snapshot():null;
          known=state!==null&&!state.held;waiting=restoring&&known&&state.recoveryHeld===true;}catch{}
        const sent=write(op.cell.response,waiting?UNAVAILABLE:known?BAD:UNAVAILABLE,target);
        op.settle(known&&sent);
      });
    }catch{if(!closed&&op.cell.response!==null)write(op.cell.response,UNAVAILABLE,target);op.settle(false);}
    request=null;response=null;transportContext=null;done=null;return undefined;
  });

  try{
    const opened=capability();let pending;
    try{pending=FUNDING(restoring?F({funding:fundingConfig,recovery}):fundingConfig);observe(pending,value=>{
      try{for(const name of (restoring?['getIssuedChallenge','getRecordedOutcome','processHttpRequest','resumeOriginalSettlement','close','snapshot']:['getIssuedChallenge','processHttpRequest','resumeOriginalSettlement','close','snapshot']))
        if(!callable(own(value,name))||!Object.isFrozen(value)||P(value)!==Object.prototype||D(value,'then')!==undefined)fail('construction');
        if(!invariant())fail('construction');opened.resolve(value);
      }catch{hold();opened.reject(error('construction_close_unknown'));}
    },()=>{hold();opened.reject(error('construction_close_unknown'));});}catch{hold();discardNative(pending);opened.reject(error('construction_close_unknown'));}
    funding=await opened.promise;
    // Reinspect actual startup state across the SDK-initialization await.
    if(restoring)captureIssuedFundingGrantRecoveryRows(caps.loadBound(fundingConfig.intake.store),fixedSelection,routed.resourceUrl,recovery);else fresh(fundingConfig.intake.store);
    const issuedFrame=funding.getIssuedChallenge();
    binding=BINDING({issuedFrame,resourceUrl:routed.resourceUrl,serviceSelection:fixedSelection});
    if(restoring)recordedResultBinding=createIssuedRecordedResultGrantBinding(F({issuedFrame,resourceUrl:routed.resourceUrl,selection:fixedSelection}));
    if(restoring)originalResultBinding=createIssuedOriginalResultGrantBinding(F({issuedFrame,resourceUrl:routed.resourceUrl,selection:fixedSelection}));
    captureRestoredOutcome();
    const issued=createIssuedFundingPostSdkResourceBinding(issuedFrame,routed.resourceUrl).selection();
    const resourceDigest='sha256:'+createHash('sha256').update('zenon-x402-service-credit-payment-resource-v1\0','ascii').update(canonicalJson(issued.resource)).digest('hex');
    const queryRoute=captureOriginalFundingGrantRoute(routed.resourceUrl,resourceDigest);
    mixedRoutes=captureIssuedFundingGrantRoutes(queryRoute);
    query=caps.createQueryDownstream(serviceOptions.store,queryRoute);
    const queryShape=exact(query,['downstream','reject','inspect'],true),downstream=exact(queryShape.downstream,['handle','close'],true);
    if(![queryShape.reject,queryShape.inspect,downstream.handle,downstream.close].every(callable))fail('construction');
    ingress=INGRESS({...transport,requestTargets:mixedRoutes.requestTargets,downstream:F({handle,close:downstreamClose})},queryRoute);
    const ownedIngress=exact(ingress,['start','close','snapshotMetrics'],true);
    if(!Object.values(ownedIngress).every(callable))fail('construction');
  }catch{
    hold();
    const c=capability();
    downstreamClose(F({success:F(()=>c.resolve(undefined)),failure:F(()=>c.reject(error('construction_close_unknown')))}));
    try{await c.promise;}catch{fail('construction_close_unknown');}fail('construction');
  }finally{fundingConfig=null;serviceConfig=null;transport=null;selection=null;route=null;}
  const NATIVE=ingress;ingress=null;
  // No callback, store read or observer acquisition is entered here. Only the
  // fixed native operator receives this local selection capability; HTTP never
  // dispatches it. Activation repeats its actual current-owner/evidence checks.
  const selectOriginalActivationObserver=F(function selectOriginalActivationObserver(input){
    if(arguments.length!==1||restoring||!available()||fundingBusy||opening||active!==0||service!==null)
      fail('observer_selection_unavailable');
    return binding.captureOriginalActivationObserver(input);
  });
  const admitCommittedServiceGrant=F(function admitCommittedServiceGrant(grantId,mode){
    const recordedOnly=arguments.length===2&&mode==='RECORDED_RESULT_ONLY';
    if((arguments.length!==1&&(!restoring||!recordedOnly))||typeof grantId!=='string'||!/^grant_[0-9a-f]{64}$/.test(grantId)
        ||!available()||opening||service!==null||fundingBusy||active!==0||admissionAttempts>=16)fail('service_unavailable');
    captureRestoredOutcome();
    const state=binding.inspect(),actual=funding.snapshot();
    if(!state.boundRetained||state.officialPhase!=='SETTLED'||!actual.intakeBound||actual.active||actual.held)fail('service_not_ready');
    opening=true;admissionAttempts++;
    try{
      if(caps.validateStores(fundingStore,serviceOptions.store)!==undefined)fail('configuration');
      let committed;
      try{committed=caps.readCommittedGrant(serviceOptions.store,grantId);}
      catch{hold();fail('service_unknown');}
      if(!available())fail('service_unavailable');
      if(committed===null)return F({status:'NOT_READY',authority:'NONE'});
      // This is a genuine read from the fixed actual store, never HTTP input.
      captureRestoredOutcome();
      const replayOnly=restoring&&(recordedOnly||own(committed,'lifecycle')!=='ACTIVE');
      const selectedResultBinding=recordedOnly?originalResultBinding:recordedResultBinding;
      const pin=replayOnly?selectedResultBinding.captureCommittedGrant(committed,grantId,state.transactionHash):binding.captureCommittedGrant(committed,grantId);
      admittedGrantId=pin.admittedGrantId;
      serviceAdmissionMode=replayOnly?'RECORDED_RESULT_ONLY':'DURABLE_EXECUTION';
      try{service=SESSION({...serviceOptions,admittedGrantId,...(replayOnly?{replayOnly:true}:{})});const session=exact(service,['handle','close'],true);
        if(!Object.values(session).every(callable))fail('service_unknown');}catch{discardNative(service);hold();fail('service_unknown');}
      if(!available())fail('service_unavailable');
      return F({status:'ADMITTED',grantId:admittedGrantId,authority:'NONE'});
    }finally{opening=false;if(closed)closeService();finishClose();}
  });
  const resumeOriginalSettlement=F(function resumeOriginalSettlement(){
    if(arguments.length!==0||!available()||fundingBusy||active!==0)return rejected('pending_unavailable');
    if(restoring||binding.inspect().officialPhase!=='PENDING')return rejected('pending_unavailable');
    const c=capability(),op=acquire(null,null,true);
    pendingObservations++;
    try{observe(funding.resumeOriginalSettlement(),value=>{
      try{binding.captureBoundOutcome(value);if(!available())fail('pending_unavailable');c.resolve(F({phase:binding.inspect().officialPhase,authority:'NONE'}));op.settle(true);}
      catch{c.reject(error('pending_unknown'));op.settle(false);}
    },()=>{c.reject(error('pending_unknown'));op.settle(false);});}
    catch{c.reject(error('pending_unknown'));op.settle(false);}return c.promise;
  });
  const snapshot=F(function snapshot(){
    if(arguments.length!==0||!invariant())fail('input');
    return F({profile:'ISSUED_FUNDING_GRANT_APPLICATION_CORE',phase:terminal??(closed||admissionRevoked?'CLOSING':uncertain?'HELD':'OPEN'),
      activeOperations:active,fundingBusy,paidCalls,challengeCalls,serviceCalls,pendingObservations,
      serviceAdmissionAttempts:admissionAttempts,serviceAdmissionOpen:service!==null,serviceOpening:opening,admissionRevoked,admittedGrantId,serviceAdmissionMode,
      queryCalls,queryRefusals,queryCloseDone,query:query===null?null:query.inspect(),
      fundingCloseDone:rootCloseDone,serviceCloseDone,uncertain,ingress:NATIVE.snapshotMetrics(),funding:funding.snapshot(),
      binding:binding.inspect(),serviceStore:'BORROWED_NOT_CLOSED',intakeStore:'BORROWED_NOT_CLOSED',
      grantActivation:'EXTERNAL_EXPLICIT_AUTHORITY_REQUIRED',automaticRecovery:false,persistence:restoring?'PINNED_RECORDED_HISTORY_NO_LIVE_CONTINUATION':'MEMORY_ONLY_PENDING',
      ...(restoring?{recoveryMode:'PINNED_RECORDED_OUTCOME',newSDKEntries:0,restoredObservationBudgetRenewed:false}:{}),
      nativeQualified:false,production:'NOT_ESTABLISHED'});});
  let nativeCloseClaimed=false,nativeCloseReceipt=null;
  const close=F(function close(){
    if(arguments.length!==0)return rejected('input');
    if(nativeCloseClaimed)return nativeCloseReceipt??rejected('close_unknown');
    // Fence local operator operations BEFORE entering the actual native owner.
    nativeCloseClaimed=true;admissionRevoked=true;
    try{nativeCloseReceipt=NATIVE.close();return nativeCloseReceipt;}
    catch{hold();nativeCloseReceipt=rejected('close_unknown');return nativeCloseReceipt;}
  });
  return F({start:NATIVE.start,close,...(restoring?{}:{selectOriginalActivationObserver}),admitCommittedServiceGrant,resumeOriginalSettlement,snapshot});
}
function captureFreshRows(rows){
  if(rows===null||typeof rows!=='object'||IS_PROXY(rows)||!Array.isArray(rows)||P(rows)!==Array.prototype
      ||K(rows).length!==1||D(rows,'length').value!==0)fail('startup_recovery_required');
}
function frame(statusCode,body){return F({statusCode,contentType:'text/plain; charset=utf-8',body,headers:F({})});}
function write(response,value,target=null){return WRITE(response,value,target);}
function callable(v){return typeof v==='function'&&!IS_PROXY(v)&&Object.isFrozen(v);}
function exact(value,names,frozen=false){if(value===null||typeof value!=='object'||IS_PROXY(value)||P(value)!==Object.prototype
    ||K(value).length!==names.length||frozen&&!Object.isFrozen(value))fail('input');
  const out={};for(const name of names)Object.defineProperty(out,name,{value:own(value,name),enumerable:true});return out;}
function own(value,name){if(value===null||typeof value!=='object'||IS_PROXY(value))fail('input');
  const d=D(value,name);if(!d||!O(d,'value')||!d.enumerable)fail('input');return d.value;}
function same(a,b){return !!a&&!!b&&K(a).length===K(b).length&&K(b).every(k=>O(a,k)&&a[k]===b[k]);}
function invariant(){return D(Object.prototype,'then')===undefined&&D(Object.prototype,'toJSON')===undefined
  &&same(D(PP,'then'),THEN)&&same(D(PP,'constructor'),CTOR)&&same(D(NativePromise,Symbol.species),SPECIES);}
function safe(value){if(!invariant()||!IS_PROMISE(value)||IS_PROXY(value)||P(value)!==PP||D(value,'then')!==undefined)return false;
  const d=D(value,'constructor');return d===undefined||O(d,'value')&&d.value===NativePromise&&!d.enumerable&&!d.writable&&!d.configurable;}
function observe(value,yes,no){if(!safe(value))fail('observation');const branch=A(THEN.value,value,[yes,no]);
  if(!safe(branch))fail('observation');A(THEN.value,branch,[discard,discard]);}
function capability(){let resolve,reject;const promise=new NativePromise((yes,no)=>{resolve=yes;reject=no;});
  Object.defineProperty(promise,'constructor',{value:NativePromise});A(THEN.value,promise,[discard,discard]);return{promise,resolve,reject};}
function rejected(kind){const c=capability();c.reject(error(kind));return c.promise;}
function error(kind){const code='issued_funding_grant_application_core_'+kind,e=new TypeError(code);
  Object.defineProperty(e,'code',{value:code,enumerable:true});Object.defineProperty(e,'stack',{value:'TypeError: '+code});return F(e);}
function fail(kind){throw error(kind);}function discard(){}
function discardNative(value){try{if(safe(value))observe(value,discard,discard);}catch{}}
