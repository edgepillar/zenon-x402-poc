// Actual controller/binding/reader/model DATA with declared funding, service,
// listener, verifier, writer and timer ports. No SQL/core/TLS/keys/signatures.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { canonicalJson,paymentIntentDigest } from '../src/canonical.js';
import { InMemoryServiceCreditModel } from '../src/service-credit-model.js';
import { createIssuedFundingGrantApplicationCore as application } from '../src/x402-issued-funding-grant-application-core.js';
import { captureIssuedFundingGrantRoutes as routes,captureIssuedFundingGrantRequest as admit } from '../src/x402-issued-funding-grant-request-binding.js';
import { captureOriginalFundingGrantRoute as route,createOriginalFundingGrantWireRequest as wire,captureOriginalFundingGrantHttpResponse as responseData } from '../src/service-credit-original-grant-http-binding.js';
import { captureServiceCreditOriginalFundingGrantQuery as query } from '../src/service-credit-original-funding-grant.js';
import { createServiceCreditOriginalFundingGrantReaderCore as reader } from '../src/service-credit-original-funding-grant-reader-core.js';
import { createOriginalFundingGrantHttpReaderCore as httpReader } from '../src/service-credit-original-grant-http-reader-core.js';
import { createOriginalFundingGrantHttpDownstreamCore as downstream } from '../src/service-credit-original-grant-http-downstream-core.js';
import { runApiCreditOriginalGrantQueryOwner as holder } from '../src/api-credit-original-grant-query-owner.js';
import { createNativeHttpsClientCloseOwner as closeOwner } from '../src/service-credit-native-client-close-owner.js';

const F=Object.freeze,checks=[],URL='https://provider.invalid:8443/funding',HASH='a'.repeat(64),SERVICE='/service-credit/v1/execute';
const clone=v=>JSON.parse(JSON.stringify(v)),encode=v=>Buffer.from(canonicalJson(v)).toString('base64');
function check(id,run){checks.push({id,run});}
function deep(v){if(v!==null&&typeof v==='object'){for(const k of Object.keys(v))deep(v[k]);F(v);}return v;}
function digest(domain,v){return 'sha256:'+createHash('sha256').update(domain+'\0','ascii').update(canonicalJson(v)).digest('hex');}
function required(){return {x402Version:2,resource:{url:URL,tags:['x402-service-credit-funding-v1','1'.repeat(32),'2'.repeat(32)]},accepts:[{
  scheme:'exact',network:'zenon:testnet',asset:'zts1declaredasset',amount:'1',payTo:'z1declaredpayee',maxTimeoutSeconds:60,
  extra:{paymentFlow:'upfront',poc:true,settlement:'account-block',zenonChain:{version:1,chainIdentifier:'73479',genesisMomentumHash:'4'.repeat(64)}}}]};}
function identity(r=required()){const a=r.accepts[0];return {transactionId:'zenontx:'+HASH,network:a.network,chainProfile:a.extra.zenonChain,
  asset:a.asset,amount:a.amount,payee:a.payTo,offerId:'offer.fixed',offerVersion:1,holderId:'z1declaredholder',capabilityCommitment:'sha256:'+'6'.repeat(64),
  paymentResourceDigest:digest('zenon-x402-service-credit-payment-resource-v1',r.resource),paymentRequirementDigest:digest('zenon-x402-service-credit-payment-requirement-v1',a),
  paymentIntentDigest:'sha256:'+paymentIntentDigest(r,a),grantFundingCommitment:'sha256:'+'1'.repeat(32)+'2'.repeat(32)};}
const selection=()=>({offerId:'offer.fixed',offerVersion:1,holderId:'z1declaredholder',capabilityCommitment:'sha256:'+'6'.repeat(64)});
function proof(q){return {proofVersion:1,grantId:query(q).request.grantId,requestId:q.requestId,publicKey:'declared-key-data',maxCostUnits:1,signature:'declared-proof-data'};}
function queryRequest(change=null){const q={queryVersion:1,requestId:'query-1',originalFunding:identity()};if(change)change(q);const selected=route(URL,q.originalFunding.paymentResourceDigest),w=wire(selected,q,proof(q));
  return {method:'GET',url:selected.requestTarget,httpVersion:'1.1',rawHeaders:['Host',selected.authority,'Connection','close',...Object.entries(w.headers).flat()],socket:{encrypted:true}};}
function fundingRequest(paid=false){return {method:'POST',url:'/funding',httpVersion:'1.1',socket:{encrypted:true},rawHeaders:['Host',new globalThis.URL(URL).host,'Content-Length','0',...(paid?['PAYMENT-SIGNATURE','DECLARED_ORIGINAL']:[])]};}
function serviceRequest(){return {method:'POST',url:SERVICE,httpVersion:'1.1',socket:{encrypted:true},rawHeaders:['Host',new globalThis.URL(URL).host,'Content-Type','application/json','Content-Length','2','Authorization','ServiceCredit DECLARED']};}
function response(){const r={statusCode:0,destroyed:false,writableEnded:false,headers:{},body:null};r.setHeader=F((k,v)=>{r.headers[k]=v;});r.end=F(body=>{r.body=body;r.writableEnded=true;});return r;}
function context(){return F({peerToken:F(Object.create(null)),abort:F(()=>{throw Error('abort not owned by controller');})});}
function completion(){const counts={success:0,failure:0},cap=F({success:F(()=>{counts.success++;}),failure:F(()=>{counts.failure++;})});return {counts,cap};}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function flush(){for(let i=0;i<16;i++)await Promise.resolve();}
function outcome(phase='SETTLED',hash=HASH){return F({phase:'INTAKE_BOUND_OFFICIAL_'+phase,
  intake:F(Object.assign(Object.create(null),{status:'BOUND',transactionHash:hash,observerRecordKey:'sha256:'+'7'.repeat(64),observerFileName:'funding-observer-'+hash+'.sqlite'})),
  official:deep(phase==='SETTLED'?{type:'settled',settlement:{success:true}}:{type:'payment-error',response:{status:402,headers:{},body:'pending'}}),
  transactionHash:hash,acknowledgementDomainsIndependent:true,authority:'NONE',grantActivation:'NOT_ESTABLISHED',serviceDelivery:'NOT_ESTABLISHED'});}
function writer(response,frame){response.statusCode=frame.statusCode;response.setHeader('Content-Type',frame.contentType);for(const [k,v]of Object.entries(frame.headers))response.setHeader(k,v);
  response.setHeader('Content-Length',String(Buffer.byteLength(frame.body)));response.end(frame.body);return true;}
function modelFixture(){const stats={clock:0,pricing:0},model=new InMemoryServiceCreditModel({now(){stats.clock++;return 100;},deriveCost(){stats.pricing++;return 1;}}),q=identity();
  model.registerOffer({modelVersion:1,providerId:'provider.fixed',serviceId:'service.fixed',resourceId:'resource.fixed',resourceBinding:'sha256:'+'e'.repeat(64),offerId:q.offerId,offerVersion:1,costPolicyId:'cost.fixed',fundingPolicyId:'funding.fixed',fundingPolicyVersion:1});
  function activate(){return model.activateGrantFromTrustedRecord({activationVersion:2,authorityProfileId:'declared.authority',authorityProfileVersion:1,verifierVersion:1,
    authorityRecordDigest:'sha256:'+'b'.repeat(64),fundingPolicyId:'funding.fixed',fundingPolicyVersion:1,sourceSettlementId:'declared.settlement',providerId:'provider.fixed',serviceId:'service.fixed',resourceId:'resource.fixed',resourceBinding:'sha256:'+'e'.repeat(64),
    ...q,totalUnits:100,expiresAt:1000,scheme:'exact',paymentFlow:'upfront',payer:q.holderId,evidenceVersion:1,inclusionAuthorizationDigest:'sha256:'+'d'.repeat(64),evidenceState:'MOMENTUM_INCLUDED',
    confirmationPolicy:{policyId:'zenon.authenticated-momentum-inclusion',policyVersion:1,minimumConfirmations:2}});}
  return {model,stats,activate};}
async function fixture(options={}){
  const m=modelFixture(),s={fundingCreates:0,ingressCreates:0,queries:0,verifies:0,reads:0,storeCloses:0,fundingCloses:0,serviceCloses:0,queryCloses:0,serviceCreates:0,serviceCalls:0,paid:0,closed:false,model:m.model,root:null};
  const intakeStore=F({declaredIntake:true}),serviceStore=F({declaredService:true}),payment=deferred(),service=deferred();
  const funding=F({getIssuedChallenge:F(()=>F({status:402,paymentRequiredHeader:encode(required()),body:'Payment Required'})),
    processHttpRequest:F(request=>{s.paid++;if(options.payment)return options.payment(s,payment,request);s.bound=true;return Promise.resolve(outcome(options.pending?'PENDING':'SETTLED'));}),
    resumeOriginalSettlement:F(()=>Promise.resolve(outcome('SETTLED'))),close:F(()=>{s.fundingCloses++;return Promise.resolve(undefined);}),
    snapshot:F(()=>F({held:false,active:false,intakeBound:!!s.bound}))});
  const noop=F(()=>{}),runtime=F({monotonicNowNs:F(()=>0n),schedule:F(()=>F({declaredTimer:true})),cancel:noop});
  const limits=F({maxHeaderBytes:16384,maxHeaderCount:64,maxConcurrentSockets:8,maxConnectionStarts:128,maxConcurrentRequests:8,maxRequestStarts:128,
    tlsHandshakeDeadlineMs:50,headerDeadlineMs:50,requestResponseDeadlineMs:100,idleSocketDeadlineMs:100,startDeadlineMs:100,closeGraceMs:200,metricsCounterLimit:1000});
  const configuration={funding:{intake:{store:intakeStore,serviceCreditStore:serviceStore,authorityRecord:F({declared:true}),deriveFundingTerms:noop,now:F(()=>100),observerRoot:'/synthetic/observer',
    observerCatchUp:F({maximumPageEntries:1,maximumBackfillSpan:1,maximumMembersPerMomentum:1}),selection:selection(),resourceUrl:URL},
    official:{localFacilitator:F({declared:true}),validateChallenge:noop,reconcilePendingSettlement:noop,maxPendingReconciliations:1},maxIntakeAttempts:16,closeBudgetMs:1000},
    service:{store:serviceStore,execute:noop,deadlineRuntime:runtime,selectedDurationMs:10},transport:{origin:new globalThis.URL(URL).origin,generation:F({generationId:'generation.fixed',generationVersion:1}),limits,
      deadlineRuntime:F({schedule:runtime.schedule,cancel:noop}),httpsServerFactory:F(()=>{throw Error('DATA must not construct native server');})}};
  if(options.configure)options.configure(configuration);
  const ports=F({createFunding:F(c=>{s.fundingCreates++;return options.fundingCreate?options.fundingCreate(s,c):Promise.resolve(funding);}),
    validateStores:F((i,c)=>{assert.equal(i,intakeStore);assert.equal(c,serviceStore);}),loadBound:F(()=>options.nonempty?[F({status:'BOUND'})]:[]),
    readCommittedGrant:F((store,id)=>{assert.equal(store,serviceStore);if(options.onGrant)options.onGrant(s);return m.model.getGrant(id);}),
    createServiceSession:F(c=>{s.serviceCreates++;assert.equal(c.store,serviceStore);return F({handle:F((req,res)=>{s.serviceCalls++;if(options.service)return options.service(s,service,req,res);res.statusCode=200;res.end('declared service');return Promise.resolve(undefined);}),
      close:F(()=>{s.serviceCloses++;return Promise.resolve(undefined);})});}),
    createQueryDownstream:F((store,selected)=>{assert.equal(store,serviceStore);s.queryRoute=selected;
      const r=reader({readOriginalFundingGrant:F(q=>{s.reads++;if(options.onRead)options.onRead(s);return m.model.readOriginalFundingGrant(q);}),
        verifyCapability:F(input=>{s.verifies++;if(options.badProof)throw Error('declared proof refusal');return F({verified:true,proofVersion:1,grantId:input.request.grantId,requestId:input.request.requestId,maxCostUnits:1});})});
      const bridge=downstream(httpReader(selected,r),F((res,frame)=>{s.queries++;if(options.writer)return options.writer(s,res,frame);return writer(res,frame);}));s.bridge=bridge;
      if(options.query)return options.query(s,bridge);return bridge;}),
    createIngress:F((c,selected)=>{s.ingressCreates++;s.transport=c;s.selected=selected;let receipt=null;
      return F({start:F(()=>Promise.resolve(undefined)),snapshotMetrics:F(()=>F({phase:s.closed?'CLOSED':'OPEN',trackedSockets:0,trackedRequests:0,trackedHandlers:0,ownedTimers:0})),
        close:F(()=>{if(receipt)return receipt;const d=deferred();receipt=d.promise;s.closed=true;c.downstream.close(F({success:F(()=>d.resolve(undefined)),failure:F(()=>d.reject(Error('declared uncertain close')))}));return receipt;})});}),
  });
  s.root=await application(configuration,ports);
  function send(request,ctx=context(),done=completion()){const res=response();s.transport.downstream.handle(request,res,ctx,done.cap);return {response:res,done};}
  return {s,m,payment,service,send,configuration,ports};
}
function rewrite(req,key,value){const i=req.rawHeaders.findIndex(k=>k.toLowerCase()===key.toLowerCase());assert.ok(i>=0);req.rawHeaders[i+1]=value;}
function decoded(res){return responseData({statusCode:res.statusCode,rawHeaders:Object.entries(res.headers).flat(),body:res.body},identity());}
async function funded(options={}){const f=await fixture(options);f.send(fundingRequest(true));await flush();return f;}
async function admitted(options={}){const f=await funded(options),grant=f.m.activate();assert.equal(f.s.root.admitCommittedServiceGrant(grant.grantId).status,'ADMITTED');return {...f,grant};}

check('issued-provider-three-fixed-routes-share-one-origin-and-one-listener-capability',async()=>{const f=await fixture();assert.equal(f.s.ingressCreates,1);assert.deepEqual(f.s.transport.requestTargets,['/funding',SERVICE,'/service-credit/v1/original-funding-grant']);assert.equal(f.s.transport.origin,new globalThis.URL(URL).origin);await f.s.root.close();});
check('issued-provider-unpaid-funding-retains-original-402-post-contract',async()=>{const f=await fixture(),x=f.send(fundingRequest());assert.equal(x.response.statusCode,402);assert.equal(x.response.body,'Payment Required');assert.equal(x.response.headers.Vary,'PAYMENT-SIGNATURE');assert.equal(f.s.paid,0);await f.s.root.close();});
check('issued-provider-paid-bound-retains-202-without-activation',async()=>{const f=await funded();assert.equal(f.s.root.snapshot().binding.officialPhase,'SETTLED');assert.equal(f.s.serviceCreates,0);assert.equal(f.s.model.exportState().grants.length,0);await f.s.root.close();});
check('issued-provider-query-before-grant-is-not-recorded-with-no-authority',async()=>{const f=await fixture(),x=f.send(queryRequest());assert.equal(x.done.counts.success,1);const r=decoded(x.response);assert.equal(r.status,'NOT_RECORDED');assert.equal(r.mayStartPayment,false);assert.equal(r.spendingReservation,'UNCHANGED');assert.equal(f.s.paid,0);await f.s.root.close();});
check('issued-provider-committed-original-is-found-without-service-admission',async()=>{const f=await funded(),g=f.m.activate(),before=canonicalJson(f.m.model.exportState()),x=f.send(queryRequest()),r=decoded(x.response);assert.equal(r.record.grantId,g.grantId);assert.equal(r.mayDispatchService,false);assert.equal(f.s.serviceCreates,0);assert.equal(canonicalJson(f.m.model.exportState()),before);await f.s.root.close();});
check('issued-provider-query-never-refreshes-price-time-or-debits',async()=>{const f=await fixture();f.m.activate();const before={...f.m.stats};f.send(queryRequest());assert.deepEqual(f.m.stats,before);await f.s.root.close();});
check('issued-provider-query-and-service-use-separate-response-vary-contracts',async()=>{const f=await admitted(),q=f.send(queryRequest()),r=f.send(serviceRequest());await flush();assert.equal(q.response.headers.Vary,'Authorization, Original-Funding-Query');assert.equal(q.response.statusCode,200);assert.equal(r.response.statusCode,200);assert.equal(f.s.serviceCalls,1);await f.s.root.close();});
check('issued-provider-service-requires-explicit-committed-grant-admission',async()=>{const f=await funded(),x=f.send(serviceRequest());await flush();assert.equal(x.response.statusCode,503);assert.equal(f.s.serviceCreates,0);assert.equal(f.s.serviceCalls,0);await f.s.root.close();});
check('issued-provider-query-is-blocked-while-funding-operation-is-active',async()=>{const f=await fixture({payment(s,d){return d.promise;}});f.send(fundingRequest(true));const x=f.send(queryRequest());assert.equal(x.response.statusCode,503);assert.equal(f.s.reads,0);f.s.bound=true;f.payment.resolve(outcome());await flush();await f.s.root.close();});
check('issued-provider-query-is-blocked-while-service-operation-is-active',async()=>{const f=await admitted({service(s,d){return d.promise;}});f.send(serviceRequest());const x=f.send(queryRequest());assert.equal(x.response.statusCode,503);assert.equal(f.s.reads,0);f.service.resolve(undefined);await flush();await f.s.root.close();});
check('issued-provider-query-is-blocked-during-external-grant-read-admission',async()=>{let reply;const f=await funded({onGrant(s){reply=f.send(queryRequest()).response;}}),g=f.m.activate();f.s.root.admitCommittedServiceGrant(g.grantId);assert.equal(reply.statusCode,503);assert.equal(f.s.reads,0);await f.s.root.close();});
check('issued-provider-query-history-does-not-advance-pending-official-settlement',async()=>{const f=await funded({pending:true});f.m.activate();const x=f.send(queryRequest());assert.equal(decoded(x.response).status,'RECORDED');assert.equal(f.s.root.snapshot().binding.officialPhase,'PENDING');assert.equal(f.s.serviceCreates,0);await f.s.root.close();});
check('issued-provider-unknown-query-read-holds-all-application-admission',async()=>{const f=await fixture({onRead(){throw Error('declared store ambiguity');}}),x=f.send(queryRequest());assert.equal(x.done.counts.failure,1);assert.equal(f.s.root.snapshot().uncertain,true);const y=f.send(fundingRequest());assert.equal(y.response.statusCode,503);await assert.rejects(f.s.root.close());});
check('issued-provider-bad-proof-does-not-read-store-or-hold-healthy-root',async()=>{const f=await fixture({badProof:true}),x=f.send(queryRequest());assert.equal(x.response.statusCode,401);assert.equal(x.done.counts.success,1);assert.equal(f.s.reads,0);assert.equal(f.s.root.snapshot().uncertain,false);await f.s.root.close();});
check('issued-provider-funding-response-write-loss-cannot-admit-new-authority',async()=>{const f=await fixture(),res=response();res.end=F(()=>{throw Error('declared lost write');});const d=completion();f.s.transport.downstream.handle(fundingRequest(true),res,context(),d.cap);await flush();assert.equal(d.counts.failure,1);const x=f.send(queryRequest());assert.equal(x.response.statusCode,503);assert.equal(f.s.reads,0);await assert.rejects(f.s.root.close());});
check('issued-provider-close-retires-query-service-and-funding-without-closing-stores',async()=>{const f=await admitted();await f.s.root.close();assert.equal(f.s.fundingCloses,1);assert.equal(f.s.serviceCloses,1);assert.equal(f.s.bridge.inspect().closed,true);assert.equal(f.s.storeCloses,0);assert.equal(f.s.root.snapshot().phase,'CLOSED');});
check('issued-provider-close-reuses-the-same-native-close-receipt',async()=>{const f=await fixture(),a=f.s.root.close(),b=f.s.root.close();assert.equal(a,b);await a;assert.equal(f.s.fundingCloses,1);});
check('issued-provider-rejects-nonempty-startup-without-sdk-or-listener-entry',async()=>{await assert.rejects(fixture({nonempty:true}));});
check('issued-provider-rejects-invalid-limits-before-funding-construction',async()=>{let creates=0;await assert.rejects(fixture({configure(c){c.transport.limits={...c.transport.limits,maxConcurrentRequests:100};},fundingCreate(){creates++;return Promise.reject(Error());}}));assert.equal(creates,0);});
check('issued-provider-query-callback-success-with-nonvoid-return-stays-held',async()=>{const f=await fixture({query(s,b){return F({...b,downstream:F({close:b.downstream.close,handle:F((r,p,c,d)=>{d.success();return true;})})});}}),x=f.send(queryRequest());assert.equal(x.done.counts.success,0);assert.equal(x.done.counts.failure,1);assert.equal(f.s.root.snapshot().uncertain,true);await assert.rejects(f.s.root.close());});
check('issued-provider-query-close-nonvoid-after-inline-success-cannot-publish-closed',async()=>{const f=await fixture({query(s,b){return F({...b,downstream:F({handle:b.downstream.handle,close:F(d=>{d.success();return true;})})});}});await assert.rejects(f.s.root.close());assert.equal(f.s.root.snapshot().phase,'CLOSE_UNCERTAIN');});
check('issued-provider-wrong-method-and-path-never-enter-provider-ports',async()=>{const f=await fixture();for(const r of [queryRequest(),fundingRequest(),serviceRequest()]){r.method='DELETE';const x=f.send(r);assert.equal(x.response.statusCode,400);}assert.equal(f.s.paid+f.s.reads+f.s.serviceCalls,0);await f.s.root.close();});
check('issued-provider-foreign-host-is-rejected-for-all-three-routes',async()=>{const f=await fixture();for(const r of [queryRequest(),fundingRequest(true),serviceRequest()]){rewrite(r,'Host','foreign.invalid');assert.equal(f.send(r).response.statusCode,400);}assert.equal(f.s.paid+f.s.reads+f.s.serviceCalls,0);await f.s.root.close();});
check('issued-provider-query-method-cannot-reach-funding-or-service',async()=>{const selected=routes(route(URL,identity().paymentResourceDigest));for(const r of [fundingRequest(true),serviceRequest()]){r.method='GET';assert.throws(()=>admit(r,selected));}});
check('issued-provider-post-cannot-reach-original-grant-query',()=>{const r=queryRequest();r.method='POST';assert.throws(()=>admit(r,routes(route(URL,identity().paymentResourceDigest))));});
check('issued-provider-service-chunked-or-query-headers-are-rejected',()=>{for(const extra of [['Transfer-Encoding','chunked'],['Original-Funding-Query','DECLARED'],['PAYMENT-SIGNATURE','DECLARED']]){const r=serviceRequest();r.rawHeaders.push(...extra);assert.throws(()=>admit(r,routes(route(URL,identity().paymentResourceDigest))));}});
check('issued-provider-service-body-size-and-content-type-are-closed',()=>{for(const [k,v]of [['Content-Length','16385'],['Content-Type','text/plain'],['Content-Length','02']]){const r=serviceRequest();rewrite(r,k,v);assert.throws(()=>admit(r,routes(route(URL,identity().paymentResourceDigest))));}});
check('issued-provider-query-foreign-resource-is-rejected-before-verifier',async()=>{const f=await fixture(),r=queryRequest();const q={queryVersion:1,requestId:'query-1',originalFunding:{...identity(),paymentResourceDigest:'sha256:'+'f'.repeat(64)}};rewrite(r,'Original-Funding-Query',Buffer.from(canonicalJson(q)).toString('base64url'));assert.equal(f.send(r).response.statusCode,400);assert.equal(f.s.verifies,0);await f.s.root.close();});
check('issued-provider-descriptor-only-metadata-never-enters-a-getter',()=>{let hooks=0;const r=serviceRequest();Object.defineProperty(r,'method',{get(){hooks++;throw Error();}});assert.throws(()=>admit(r,routes(route(URL,identity().paymentResourceDigest))));assert.equal(hooks,0);});
check('issued-provider-proxy-metadata-never-enters-a-trap',()=>{let hooks=0;const r=new Proxy({}, {getOwnPropertyDescriptor(){hooks++;throw Error();}});assert.throws(()=>admit(r,routes(route(URL,identity().paymentResourceDigest))));assert.equal(hooks,0);});
check('issued-provider-duplicate-host-and-sparse-headers-are-rejected',()=>{for(const mutate of [r=>r.rawHeaders.push('host',new globalThis.URL(URL).host),r=>{delete r.rawHeaders[1];}]){const r=serviceRequest();mutate(r);assert.throws(()=>admit(r,routes(route(URL,identity().paymentResourceDigest))));}});
check('issued-provider-query-four-argument-seam-claims-completion-before-read',async()=>{const f=await fixture(),res=response(),d=completion();f.s.bridge.downstream.handle(queryRequest(),res,context(),d.cap);assert.equal(d.counts.success,1);assert.equal(f.s.reads,1);await f.s.root.close();});
check('issued-provider-query-legacy-three-argument-call-does-not-read',async()=>{const f=await fixture(),d=completion();f.s.bridge.downstream.handle(queryRequest(),response(),d.cap);assert.equal(f.s.reads,0);assert.equal(f.s.bridge.inspect().held,true);await assert.rejects(f.s.root.close());});
check('issued-provider-query-malformed-completion-is-rejected-before-reader',async()=>{const f=await fixture();f.s.bridge.downstream.handle(queryRequest(),response(),context(),F({success:F(()=>{})}));assert.equal(f.s.reads,0);assert.equal(f.s.bridge.inspect().held,true);await assert.rejects(f.s.root.close());});
check('issued-provider-query-completion-cannot-be-reused',async()=>{const f=await fixture(),d=completion();f.s.bridge.downstream.handle(queryRequest(),response(),context(),d.cap);f.s.bridge.downstream.handle(queryRequest(),response(),context(),d.cap);assert.equal(f.s.reads,1);assert.equal(d.counts.success,1);await assert.rejects(f.s.root.close());});
check('issued-provider-query-opaque-context-is-not-wire-authentication',async()=>{const f=await fixture(),d=completion();f.s.bridge.downstream.handle(queryRequest(),response(),F({peerToken:F({})}),d.cap);assert.equal(f.s.reads,0);assert.equal(d.counts.failure,1);await assert.rejects(f.s.root.close());});
check('issued-provider-query-writer-failure-holds-with-no-store-close',async()=>{const f=await fixture({writer(){return false;}}),x=f.send(queryRequest());assert.equal(x.done.counts.failure,1);assert.equal(f.s.storeCloses,0);await assert.rejects(f.s.root.close());});
check('issued-provider-query-refusal-uses-no-verifier-or-store',async()=>{const f=await fixture(),d=completion(),res=response();f.s.bridge.reject(queryRequest(),res,context(),d.cap);assert.equal(res.statusCode,503);assert.equal(f.s.verifies+f.s.reads,0);assert.equal(d.counts.success,1);await f.s.root.close();});
check('issued-provider-query-close-is-logical-and-late-reads-cannot-enter-store',async()=>{const f=await fixture();await f.s.root.close();const d=completion();f.s.bridge.downstream.handle(queryRequest(),response(),context(),d.cap);assert.equal(f.s.reads,0);assert.equal(f.s.storeCloses,0);assert.equal(d.counts.failure,1);});
check('issued-provider-query-reentry-latches-held-before-a-second-read',async()=>{let inner;const f=await fixture({onRead(s){inner=completion();s.bridge.downstream.handle(queryRequest(),response(),context(),inner.cap);}}),x=f.send(queryRequest());assert.equal(f.s.reads,1);assert.equal(inner.counts.failure,1);assert.equal(x.done.counts.failure,1);await assert.rejects(f.s.root.close());});
check('issued-provider-actual-holder-owner-consumes-shared-root-history-after-close',async()=>{
  const f=await funded(),g=f.m.activate(),q={queryVersion:1,requestId:'query-1',originalFunding:identity()},selected=query(q),r=route(URL,identity().paymentResourceDigest),state={starts:0};
  const closer=closeOwner({readObservedCounts:F(()=>F({requests:0,sockets:0,timers:0})),releaseLocalMaterial:F(()=>{})});
  const p=F({route:r,query:selected.query,proof:deep(proof(q)),transport:F({caBase64:'REFUQQ==',requestDeadlineMs:100,handshakeDeadlineMs:50,closeGraceMs:100}),checkpointDigest:'c'.repeat(64),queryDigest:selected.request.canonicalBodyDigest});
  const token=F({declared:true});const ports=F({openTransport:F(()=>token),read:F(()=>{state.starts++;const x=f.send(queryRequest());return Promise.resolve(decoded(x.response));}),
    inspect:F(()=>{const v=closer.snapshot();return F({phase:v.phase,unknown:v.unknown,requestStarts:state.starts,trackedRequests:0,trackedSockets:0,ownedTimers:0,close:v});}),
    close:F(()=>{const receipt=closer.beginClose();closer.observe();return receipt;}),clock:F(()=>0n),armTimer:F(()=>F({declaredTimer:true})),cancelTimer:F(()=>{})});
  const result=await holder(F({profile:p,ports,requireOpening:F(()=>{})}));assert.equal(result.history.record.grantId,g.grantId);assert.equal(result.history.mayDispatchService,false);
  assert.equal(result.spendingReservation,'UNCHANGED');assert.equal(f.s.serviceCreates,0);assert.equal(f.s.storeCloses,0);await f.s.root.close();
});

export const issuedProviderDataFixture=fixture;
export const issuedProviderFundingRequest=fundingRequest;
export const issuedProviderServiceRequest=serviceRequest;
export const issuedProviderRequired=required;
export const issuedProviderSelection=selection;
export const issuedProviderFlush=flush;

if(process.argv[1]===fileURLToPath(import.meta.url)){
// Retain a bounded DATA result if a declared Promise never settles. No timer,
// process interruption, native cleanup or automatic retry is introduced.
const cases=[];let current=null,reported=false;
function report(){if(reported)return;reported=true;const failed=cases.filter(c=>c.status==='FAIL').length;
console.log(JSON.stringify({qualification:'G2_ISSUED_FUNDING_GRANT_PROVIDER_DATA',passed:cases.length-failed,failed,cases,actualControllerBindingBridgeReaderModelAndHolder:true,
  fundingServiceVerifierListenerAndTimerPorts:'DECLARED_DATA_ONLY',activation:'DECLARED_TRUSTED_RECORD_METADATA_ONLY',nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
  nativePhysicalRelease:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED'}));if(failed)process.exitCode=1;}
function unsettled(){if(current===null)return;cases.push({id:current,status:'FAIL',error:'UNSETTLED_DECLARED_DATA_PROMISE'});process.exitCode=1;report();}
process.once('beforeExit',unsettled);
for(const {id,run}of checks){current=id;try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??'unknown').slice(0,256)});}current=null;}
process.off('beforeExit',unsettled);report();
}
