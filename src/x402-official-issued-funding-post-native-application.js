import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import { createOfficialFundingPostIntakeComposition } from './x402-official-funding-post-intake-composition.js';
import { createIssuedFundingPostApplicationBinding, captureIssuedFundingPostServiceSelection } from './x402-issued-funding-post-application-binding.js';
import { captureOfficialFundingPostHttpsRoute, captureOfficialFundingPostHttpsRequest } from './x402-official-funding-post-https-request-binding.js';
import { createServiceCreditBoundedHttpsIngressOwner } from './service-credit-bounded-https-ingress-owner.js';
import { createDurableServiceCreditHttpSession } from './service-credit-durable-http-session.js';
import { ZenonFundingIntakeSqliteStore } from './service-credit-zenon-funding-intake-sqlite-store.js';
import { ServiceCreditSqliteStore } from './service-credit-sqlite-store.js';

const FUNDING=createOfficialFundingPostIntakeComposition,INGRESS=createServiceCreditBoundedHttpsIngressOwner;
const SESSION=createDurableServiceCreditHttpSession,BINDING=createIssuedFundingPostApplicationBinding;
const SERVICE_SELECTION=captureIssuedFundingPostServiceSelection;
const ROUTE=captureOfficialFundingPostHttpsRoute,REQUEST=captureOfficialFundingPostHttpsRequest;
const F=Object.freeze,D=Object.getOwnPropertyDescriptor,P=Object.getPrototypeOf,K=Reflect.ownKeys,O=Object.hasOwn,A=Reflect.apply;
const IS_PROXY=utilTypes.isProxy,IS_PROMISE=utilTypes.isPromise,NativePromise=Promise,PP=NativePromise.prototype;
const THEN=D(PP,'then'),CTOR=D(PP,'constructor'),SPECIES=D(NativePromise,Symbol.species);
const INTAKE_PROTO=ZenonFundingIntakeSqliteStore.prototype,SERVICE_PROTO=ServiceCreditSqliteStore.prototype;
const LOAD_BOUND=D(INTAKE_PROTO,'loadBound').value,GET_GRANT=D(SERVICE_PROTO,'getGrant').value;
const CREDIT='/service-credit/v1/execute',MAX_ACTIVE=64;
const LIMITS=['maxHeaderBytes','maxHeaderCount','maxConcurrentSockets','maxConnectionStarts',
  'maxConcurrentRequests','maxRequestStarts','tlsHandshakeDeadlineMs','headerDeadlineMs',
  'requestResponseDeadlineMs','idleSocketDeadlineMs','startDeadlineMs','closeGraceMs','metricsCounterLimit'];
const BAD=frame(400,'Bad Request'),UNAVAILABLE=frame(503,'Service Unavailable');
const SERVICE_UNAVAILABLE=F({statusCode:503,contentType:'application/json',body:'{"error":"service_unavailable"}',headers:F({})});

/**
 * SOURCE ONLY: actual issued funding POST + actual scoped durable service on
 * ONE existing bounded native HTTPS owner. The old GET/paid app is unchanged.
 * This explicit fresh-intake profile rejects actual startup BOUND rows rather
 * than asserting recovery or opening historical observer files. Existing ISSUED
 * selection reuse remains the actual intake's original-frame operation.
 *
 * Construction may read/write SQL/observer state through actual owners; no
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
 *
 * Original header replay is cache-only, not another first settlement/resend.
 * Pending observation is local/explicit on the same continuation. UNKNOWN and
 * uncertain close remain held; no force-close/reopen or replacement. Runtime,
 * SDK, SQLite, TLS, activation, native release and production are NOT qualified.
 */
export async function createOfficialIssuedFundingPostNativeApplication(options) {
  if(arguments.length!==1||!invariant())fail('configuration');
  let fundingConfig,serviceConfig,transport,selection,route;
  try {
    const c=exact(options,['funding','service','transport']);
    const f=exact(c.funding,['intake','official','maxIntakeAttempts','closeBudgetMs']);
    const i=exact(f.intake,['store','serviceCreditStore','authorityRecord','deriveFundingTerms','now',
      'observerRoot','observerCatchUp','selection','resourceUrl']);
    const chosen=F(exact(i.selection,['offerId','offerVersion','holderId','capabilityCommitment']));
    const official=F(exact(f.official,['localFacilitator','validateChallenge','reconcilePendingSettlement','maxPendingReconciliations']));
    const s=exact(c.service,['store','execute','deadlineRuntime','selectedDurationMs']);
    selection=SERVICE_SELECTION(chosen);
    if(s.store!==i.serviceCreditStore||typeof s.execute!=='function'||IS_PROXY(s.execute)
        ||!Number.isSafeInteger(s.selectedDurationMs)||s.selectedDurationMs<1)fail('configuration');
    brand(i.store,INTAKE_PROTO,'loadBound');brand(s.store,SERVICE_PROTO,'getGrant');
    // The actual durable execution owner requires its monotonic clock as well
    // as schedule/cancel. Do not drop that capability at this composition seam
    // or synthesize a clock; the separate ingress runtime remains two-field.
    serviceConfig=F({...s,deadlineRuntime:F(exact(s.deadlineRuntime,['monotonicNowNs','schedule','cancel']))});
    const t=exact(c.transport,['origin','generation','limits','deadlineRuntime','httpsServerFactory']);
    transport=F({origin:t.origin,generation:F(exact(t.generation,['generationId','generationVersion'])),
      limits:F(exact(t.limits,LIMITS)),deadlineRuntime:F(exact(t.deadlineRuntime,['schedule','cancel'])),
      httpsServerFactory:t.httpsServerFactory});
    route=ROUTE(i.resourceUrl);
    if(typeof transport.origin!=='string'||route.resourceUrl!==transport.origin+'/funding'
        ||typeof transport.httpsServerFactory!=='function'||IS_PROXY(transport.httpsServerFactory))fail('configuration');
    fundingConfig=F({...f,official,intake:F({...i,selection:chosen,
      observerCatchUp:F(exact(i.observerCatchUp,['maximumPageEntries','maximumBackfillSpan','maximumMembersPerMomentum']))})});
    fresh(i.store);
  }catch{fail('configuration');}finally{options=null;}

  let funding=null,binding=null,ingress=null,service=null,opening=false;
  let closed=false,admissionRevoked=false,uncertain=false,terminal=null,rootCloseStarted=false,rootCloseDone=false;
  let serviceCloseStarted=false,serviceCloseDone=false,active=0,fundingBusy=false,admittedGrantId=null;
  let paidCalls=0,challengeCalls=0,serviceCalls=0,pendingObservations=0,admissionAttempts=0;
  const operations=new Set(),seen=new WeakSet(),waiters=[];
  const serviceOptions=serviceConfig,fixedSelection=selection,routed=route;
  function hold(){uncertain=true;if(terminal==='CLOSED')terminal='CLOSE_UNCERTAIN';}
  function available(){return invariant()&&!admissionRevoked&&!closed&&!uncertain;}
  function finish(done,clean){try{if(A(clean?done.success:done.failure,undefined,[])!==undefined)hold();}catch{hold();}}
  function completion(value){
    const c=exact(value,['success','failure'],true);
    if(!callable(c.success)||!callable(c.failure)||seen.has(value))fail('completion');
    seen.add(value);return c;
  }
  function finishClose(){
    if(!closed||terminal!==null||active!==0||opening||!rootCloseDone||!serviceCloseDone)return;
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
    closeFunding();closeService();finishClose();return undefined;
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
      finish(done,write(response,UNAVAILABLE));return undefined;
    }
    let target,captured;
    try{
      const method=own(request,'method');target=own(request,'url');
      if(method!=='POST'||(target!=='/funding'&&target!==CREDIT))fail('input');
      if(target==='/funding')captured=REQUEST(request,routed);
    }catch{finish(done,write(response,BAD));return undefined;}
    if(target==='/funding'&&fundingBusy){finish(done,write(response,UNAVAILABLE));return undefined;}
    if(target===CREDIT&&service===null){finish(done,write(response,SERVICE_UNAVAILABLE));return undefined;}
    if(target==='/funding'&&captured.paymentSignature===null){
      challengeCalls++;finish(done,write(response,binding.getChallenge()));return undefined;
    }
    const op=acquire(response,done,target==='/funding');
    try{
      const promise=target==='/funding'?funding.processHttpRequest(request):service.handle(request,response);
      if(target==='/funding')paidCalls++;else serviceCalls++;
      observe(promise,value=>{
        if(!available()||op.cell.response===null){op.settle(false);return;}
        try{
          if(target==='/funding'){const reply=binding.captureBoundOutcome(value);op.settle(write(op.cell.response,reply));}
          else op.settle(value===undefined);
        }catch{write(op.cell.response,UNAVAILABLE);op.settle(false);}
      },()=>{
        if(!available()||op.cell.response===null){op.settle(false);return;}
        // The actual root distinguishes pre-SDK refusal from unknown side effects.
        let known=false;
        try{known=target==='/funding'&&!funding.snapshot().held;}catch{}
        const sent=write(op.cell.response,known?BAD:UNAVAILABLE);
        op.settle(known&&sent);
      });
    }catch{if(!closed&&op.cell.response!==null)write(op.cell.response,UNAVAILABLE);op.settle(false);}
    request=null;response=null;transportContext=null;done=null;return undefined;
  });

  try{
    funding=await FUNDING(fundingConfig);
    // Reinspect actual startup state across the SDK-initialization await.
    fresh(fundingConfig.intake.store);
    binding=BINDING({issuedFrame:funding.getIssuedChallenge(),resourceUrl:routed.resourceUrl,serviceSelection:fixedSelection});
    ingress=INGRESS({...transport,requestTargets:F(['/funding',CREDIT]),
      downstream:F({handle,close:downstreamClose})});
  }catch{
    const c=capability();
    downstreamClose(F({success:F(()=>c.resolve(undefined)),failure:F(()=>c.reject(error('construction_close_unknown')))}));
    try{await c.promise;}catch{fail('construction_close_unknown');}fail('construction');
  }finally{fundingConfig=null;serviceConfig=null;transport=null;selection=null;route=null;}
  const NATIVE=ingress;ingress=null;
  const admitCommittedServiceGrant=F(function admitCommittedServiceGrant(grantId){
    if(arguments.length!==1||typeof grantId!=='string'||!/^grant_[0-9a-f]{64}$/.test(grantId)
        ||!available()||opening||service!==null||fundingBusy||admissionAttempts>=16)fail('service_unavailable');
    const state=binding.inspect(),actual=funding.snapshot();
    if(!state.boundRetained||state.officialPhase!=='SETTLED'||!actual.intakeBound||actual.active||actual.held)fail('service_not_ready');
    opening=true;admissionAttempts++;
    try{
      brand(serviceOptions.store,SERVICE_PROTO,'getGrant');
      let committed;
      try{committed=A(GET_GRANT,serviceOptions.store,[grantId]);}
      catch{hold();fail('service_unknown');}
      if(!available())fail('service_unavailable');
      if(committed===null)return F({status:'NOT_READY',authority:'NONE'});
      // This is a genuine read from the fixed actual store, never HTTP input.
      const pin=binding.captureCommittedGrant(committed,grantId);
      admittedGrantId=pin.admittedGrantId;
      try{service=SESSION({...serviceOptions,admittedGrantId});}catch{hold();fail('service_unknown');}
      if(!available())fail('service_unavailable');
      return F({status:'ADMITTED',grantId:admittedGrantId,authority:'NONE'});
    }finally{opening=false;if(closed)closeService();finishClose();}
  });
  const resumeOriginalSettlement=F(function resumeOriginalSettlement(){
    if(arguments.length!==0||!available()||fundingBusy||active>=MAX_ACTIVE)return rejected('pending_unavailable');
    if(binding.inspect().officialPhase!=='PENDING')return rejected('pending_unavailable');
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
    return F({profile:'OFFICIAL_ISSUED_FUNDING_POST_FRESH_INTAKE_NATIVE_APP_V1',phase:terminal??(closed||admissionRevoked?'CLOSING':uncertain?'HELD':'OPEN'),
      activeOperations:active,fundingBusy,paidCalls,challengeCalls,serviceCalls,pendingObservations,
      serviceAdmissionAttempts:admissionAttempts,serviceAdmissionOpen:service!==null,serviceOpening:opening,admissionRevoked,admittedGrantId,
      fundingCloseDone:rootCloseDone,serviceCloseDone,uncertain,ingress:NATIVE.snapshotMetrics(),funding:funding.snapshot(),
      binding:binding.inspect(),serviceStore:'BORROWED_NOT_CLOSED',intakeStore:'BORROWED_NOT_CLOSED',
      grantActivation:'EXTERNAL_EXPLICIT_AUTHORITY_REQUIRED',automaticRecovery:false,persistence:'MEMORY_ONLY_PENDING',
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
  return F({start:NATIVE.start,close,admitCommittedServiceGrant,resumeOriginalSettlement,snapshot});
}
function brand(value,prototype,method){
  if(value===null||typeof value!=='object'||IS_PROXY(value)||P(value)!==prototype||O(value,method))fail('configuration');
}
function fresh(store){
  brand(store,INTAKE_PROTO,'loadBound');const rows=A(LOAD_BOUND,store,[]);
  if(rows===null||typeof rows!=='object'||IS_PROXY(rows)||!Array.isArray(rows)||P(rows)!==Array.prototype
      ||K(rows).length!==1||D(rows,'length').value!==0)fail('startup_recovery_required');
}
function frame(statusCode,body){return F({statusCode,contentType:'text/plain; charset=utf-8',body,headers:F({})});}
function write(response,value){
  if(response===null||typeof response!=='object'||IS_PROXY(response))return false;
  try{
    if(response.destroyed||response.writableEnded)return false;
    response.statusCode=value.statusCode;response.setHeader('Cache-Control','private, no-store, max-age=0');
    response.setHeader('Content-Type',value.contentType);response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Vary','PAYMENT-SIGNATURE, Authorization');response.setHeader('Connection','close');
    for(const name of K(value.headers))response.setHeader(name,value.headers[name]);
    response.setHeader('Content-Length',String(Buffer.byteLength(value.body)));response.end(value.body);return true;
  }catch{return false;}
}
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
function error(kind){const code='official_issued_funding_post_native_application_'+kind,e=new TypeError(code);
  Object.defineProperty(e,'code',{value:code,enumerable:true});Object.defineProperty(e,'stack',{value:'TypeError: '+code});return F(e);}
function fail(kind){throw error(kind);}function discard(){}
