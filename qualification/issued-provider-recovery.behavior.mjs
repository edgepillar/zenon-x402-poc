// Actual recorded backend, provider controller/binding and in-memory ledger.
// All store, session, writer, listener and verifier ports are declared DATA.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { officialOutcomeCustodyDataFixture } from './official-outcome-custody.behavior.mjs';
import { createOfficialFundingPostEnteredRecord as entered,createOfficialFundingPostOutcomeRecord as outcome,
 createOfficialFundingPostObservationRecord as observing,officialFundingPostCustodyRecordDigest as outcomeDigest } from '../src/official-funding-post-custody-record.js';
import { issuedFundingGrantBoundRowDigest as boundDigest,captureIssuedFundingGrantRecoveryExpectation as expectation,
 captureIssuedFundingGrantRecoveryRows as captureRows,restoreIssuedFundingGrantRecordedBackend as backend } from '../src/x402-issued-funding-grant-recovery.js';
import { restoreIssuedFundingGrantApplicationCore as application } from '../src/x402-issued-funding-grant-application-core.js';
import { InMemoryServiceCreditModel } from '../src/service-credit-model.js';

const F=Object.freeze,checks=[],clone=v=>JSON.parse(JSON.stringify(v));
function check(id,run){checks.push({id,run});}
function deep(v){if(v!==null&&typeof v==='object'){for(const k of Object.keys(v))deep(v[k]);F(v);}return v;}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function flush(){for(let i=0;i<24;i++)await Promise.resolve();}
function data(phase='SETTLED',maximum=2){
 const d=officialOutcomeCustodyDataFixture(maximum);let raw=entered(d.selected,d.header,d.bound);
 if(phase!=='FIRST_IN_FLIGHT'){
  if(phase==='SETTLED')raw=outcome(raw,d.result());
  else{raw=outcome(raw,d.result('PENDING'));
   if(phase==='OBSERVATION_IN_FLIGHT'||phase==='PENDING_OBSERVED')raw=observing(raw);
   if(phase==='PENDING_OBSERVED')raw=outcome(raw,d.result('PENDING'));
   if(phase==='EXHAUSTED')for(let i=0;i<maximum;i++)raw=outcome(observing(raw),d.result(i===maximum-1?'EXHAUSTED':'PENDING'));
  }
 }
 const row={issue:{selection:clone(d.config.serviceSelection),resourceUrl:d.config.resourceUrl,frame:clone(d.config.issuedFrame)},status:'BOUND',
   binding:{transactionHash:d.bound.transactionHash,observerRecordKey:d.bound.observerRecordKey,observerFileName:d.bound.observerFileName,
     publication:{paymentPayload:JSON.parse(Buffer.from(d.header,'base64').toString('utf8'))}}};
 const expected={boundRowDigest:boundDigest(row),outcomeRecordDigest:outcomeDigest(raw)};
 return {d,row,raw,expected};
}
function request(d,header=d.header){return {method:'POST',url:'/funding',httpVersion:'1.1',socket:{encrypted:true},
 rawHeaders:['Host',new URL(d.config.resourceUrl).host,'Content-Length','0',...(header===null?[]:['PAYMENT-SIGNATURE',header])]};}
function fixture(options={}){
 const x=data(options.phase??'SETTLED',options.maximum??2),s={rows:[x.row],raw:x.raw,reads:0,loads:0,storeCloses:0,SDK:0,observations:0,writes:0};let owner=null;
 const port=F({loadBound:F(()=>{s.loads++;return options.load?options.load(s,x,owner):s.rows;}),
   readOfficialOutcome:F(()=>{s.reads++;return options.read?options.read(s,x,owner):s.raw;})});
 const config={expectation:x.expected,serviceSelection:x.d.config.serviceSelection,resourceUrl:x.d.config.resourceUrl,
   maximumPendingReconciliations:x.d.config.maximumPendingReconciliations,port};
 if(options.configure)options.configure(config,s,x);owner=backend(config);return {x,s,owner,port,config};
}
function response(){const r={statusCode:0,headers:{},body:null,destroyed:false,writableEnded:false};r.setHeader=F((k,v)=>{r.headers[k]=v;});r.end=F(v=>{r.body=v;r.writableEnded=true;});return r;}
function completion(){const counts={success:0,failure:0};return {counts,cap:F({success:F(()=>{counts.success++;}),failure:F(()=>{counts.failure++;})})};}
function model(x,state=null){
 const options={now(){return 100;},deriveCost(){return 1;}},m=state===null?new InMemoryServiceCreditModel(options):InMemoryServiceCreditModel.fromState(options,state),id=x.d.d.profile.originalFunding;
 if(state===null)m.registerOffer({modelVersion:1,providerId:'provider.fixed',serviceId:'service.fixed',resourceId:'resource.fixed',resourceBinding:'sha256:'+'e'.repeat(64),
   offerId:id.offerId,offerVersion:id.offerVersion,costPolicyId:'cost.fixed',fundingPolicyId:'funding.fixed',fundingPolicyVersion:1});
 function activate(){return m.activateGrantFromTrustedRecord({activationVersion:2,authorityProfileId:'declared.authority',authorityProfileVersion:1,verifierVersion:1,
  authorityRecordDigest:'sha256:'+'b'.repeat(64),fundingPolicyId:'funding.fixed',fundingPolicyVersion:1,sourceSettlementId:'declared.settlement',providerId:'provider.fixed',serviceId:'service.fixed',resourceId:'resource.fixed',resourceBinding:'sha256:'+'e'.repeat(64),
  ...id,totalUnits:100,expiresAt:1000,scheme:'exact',paymentFlow:'upfront',payer:id.holderId,evidenceVersion:1,inclusionAuthorizationDigest:'sha256:'+'d'.repeat(64),evidenceState:'MOMENTUM_INCLUDED',
  confirmationPolicy:{policyId:'zenon.authenticated-momentum-inclusion',policyVersion:1,minimumConfirmations:2}});}
 return {m,activate};
}
async function app(options={}){
 const f=fixture(options),s={backend:f,creates:0,ingressCreates:0,sessions:0,executions:0,debits:0,queryReads:0,closed:false,grantReads:0},ledger=model(f.x,options.state??null),noop=F(()=>{});
 const intake=F({declaredIntake:true}),service=F({declaredService:true}),runtime=F({monotonicNowNs:F(()=>0n),schedule:F(()=>F({declaredTimer:true})),cancel:noop});
 const config={funding:{intake:{store:intake,serviceCreditStore:service,authorityRecord:'declared-authority-data',deriveFundingTerms:noop,now:F(()=>100),observerRoot:'/synthetic/observer',
   observerCatchUp:F({maximumPageEntries:1,maximumBackfillSpan:1,maximumMembersPerMomentum:1}),selection:f.x.d.config.serviceSelection,resourceUrl:f.x.d.config.resourceUrl},
   official:{localFacilitator:F({declaredNotEntered:true}),validateChallenge:noop,reconcilePendingSettlement:noop,maxPendingReconciliations:f.x.d.config.maximumPendingReconciliations},maxIntakeAttempts:16,closeBudgetMs:1000},
   service:{store:service,execute:noop,deadlineRuntime:runtime,selectedDurationMs:10},recovery:f.x.expected,
   transport:{origin:new URL(f.x.d.config.resourceUrl).origin,generation:F({generationId:'generation.recovered',generationVersion:2}),
     limits:F({maxHeaderBytes:16384,maxHeaderCount:64,maxConcurrentSockets:8,maxConnectionStarts:128,maxConcurrentRequests:8,maxRequestStarts:128,
       tlsHandshakeDeadlineMs:50,headerDeadlineMs:50,requestResponseDeadlineMs:100,idleSocketDeadlineMs:100,startDeadlineMs:100,closeGraceMs:200,metricsCounterLimit:1000}),
     deadlineRuntime:F({schedule:runtime.schedule,cancel:noop}),httpsServerFactory:F(()=>{throw Error('DATA listener forbidden');})}};
 const ports=F({validateStores:F((i,c)=>{assert.equal(i,intake);assert.equal(c,service);}),loadBound:F(()=>options.startupRows?options.startupRows(s,f):f.s.rows),
   createFunding:F(async c=>{s.creates++;assert.deepEqual(c.recovery,f.x.expected);if(options.construct)options.construct(s,f);return options.fundingView?options.fundingView(f.owner):f.owner;}),
   readCommittedGrant:F((store,id)=>{assert.equal(store,service);s.grantReads++;if(options.grantRead)return options.grantRead(s,f,ledger,id);return ledger.m.getGrant(id);}),
   createServiceSession:F(c=>{s.sessions++;assert.equal(c.store,service);return F({close:F(()=>Promise.resolve(undefined)),handle:F((req,res)=>{
     const id=req.declaredRequestId??'request.original',g=c.admittedGrantId,input={modelVersion:1,grantId:g,requestId:id,method:'POST',routeId:'api.fixed',canonicalBodyDigest:'sha256:'+'a'.repeat(64),selectedContentType:'application/json',maxCostUnits:1};
     const r=ledger.m.reserveRequest(input);if(!r.replayed){s.debits++;const b=ledger.m.beginExecution({grantId:g,requestId:id});if(b.executionAuthorized){s.executions++;ledger.m.completeExecution({grantId:g,requestId:id,cachedResult:{statusCode:200,contentType:'application/json',resultCode:'result.fixed'}});}}
     res.statusCode=200;res.end('{"result":"fixed"}');return Promise.resolve(undefined);
   })});}),
   createQueryDownstream:F(()=>F({inspect:F(()=>F({authority:'NONE'})),reject:F((req,res,ctx,done)=>{res.statusCode=503;res.end('unavailable');done.success();}),
     downstream:F({close:F(done=>{done.success();}),handle:F((req,res,ctx,done)=>{s.queryReads++;res.statusCode=200;res.end('declared history');done.success();})})})),
   createIngress:F(c=>{s.ingressCreates++;s.transport=c;let closing=null;return F({start:F(()=>Promise.resolve(undefined)),snapshotMetrics:F(()=>F({phase:s.closed?'CLOSED':'OPEN'})),
     close:F(()=>{if(closing)return closing;const p=deferred();closing=p.promise;s.closed=true;c.downstream.close(F({success:F(()=>p.resolve(undefined)),failure:F(()=>p.reject(Error('declared close held')))}));return closing;})});}),
 });
 const root=await application(config,ports);
 function send(req){const res=response(),done=completion();s.transport.downstream.handle(req,res,F({declaredContext:true}),done.cap);return {res,done};}
 function serviceRequest(id='request.original'){return {method:'POST',url:'/service-credit/v1/execute',httpVersion:'1.1',socket:{encrypted:true},declaredRequestId:id,
   rawHeaders:['Host',new URL(f.x.d.config.resourceUrl).host,'Content-Type','application/json','Content-Length','2','Authorization','ServiceCredit DECLARED']};}
 return {root,s,f,ledger,send,serviceRequest,config,ports};
}

check('provider-recovery-independent-expectation-is-closed-and-descriptor-safe',()=>{const x=data();assert.deepEqual(expectation(x.expected),x.expected);let hooks=0;const p={...x.expected};Object.defineProperty(p,'boundRowDigest',{enumerable:true,get(){hooks++;throw Error();}});assert.throws(()=>expectation(p));assert.throws(()=>expectation(new Proxy({}, {ownKeys(){hooks++;throw Error();}})));assert.equal(hooks,0);assert.throws(()=>expectation({...x.expected,extra:true}));});
check('provider-recovery-requires-one-exact-selected-bound-row',()=>{const x=data();for(const rows of [[],[x.row,x.row],new Proxy([x.row],{})])assert.throws(()=>captureRows(rows,x.d.config.serviceSelection,x.d.config.resourceUrl,x.expected));assert.equal(captureRows([x.row],x.d.config.serviceSelection,x.d.config.resourceUrl,x.expected).row.status,'BOUND');});
check('provider-recovery-foreign-selection-origin-or-row-pin-is-refused',()=>{const x=data();assert.throws(()=>captureRows([x.row],{...x.d.config.serviceSelection,holderId:'foreign'},x.d.config.resourceUrl,x.expected));assert.throws(()=>captureRows([x.row],x.d.config.serviceSelection,'https://foreign.invalid/funding',x.expected));assert.throws(()=>captureRows([x.row],x.d.config.serviceSelection,x.d.config.resourceUrl,{...x.expected,boundRowDigest:'sha256:'+'0'.repeat(64)}));});
check('provider-recovery-row-getters-and-json-hooks-never-run',()=>{const x=data();let hooks=0;const row={...x.row};Object.defineProperty(row,'binding',{enumerable:true,get(){hooks++;throw Error();}});assert.throws(()=>boundDigest(row));assert.throws(()=>boundDigest({...x.row,issue:{...x.row.issue,toJSON(){hooks++;}}}));assert.equal(hooks,0);});
check('provider-recovery-outcome-digest-precedes-parsing-the-record',()=>{const f=fixture(),saved=JSON.parse;let calls=0;JSON.parse=()=>{calls++;throw Error();};try{assert.throws(()=>backend({...f.config,expectation:{...f.x.expected,outcomeRecordDigest:'sha256:'+'0'.repeat(64)}}));assert.equal(calls,0);}finally{JSON.parse=saved;}});
check('provider-recovery-full-original-publication-is-compared',()=>{assert.throws(()=>fixture({configure(c,s,x){s.rows[0].binding.publication.paymentPayload.payload.intentDigest='f'.repeat(64);c.expectation={...x.expected,boundRowDigest:boundDigest(s.rows[0])};}}));});
check('provider-recovery-settled-replay-is-the-full-exact-original-outcome',async()=>{const f=fixture(),r=await f.owner.processHttpRequest(request(f.x.d));assert.equal(canonicalJson(r),f.x.d.result&&canonicalJson(f.x.d.result()));assert.equal(Object.getPrototypeOf(r.intake),null);assert.equal(f.s.SDK+f.s.observations+f.s.writes,0);assert.equal(f.s.raw,f.x.raw);await f.owner.close();});
check('provider-recovery-pending-keeps-consumed-observations-and-has-no-continuation',async()=>{const f=fixture({phase:'PENDING_OBSERVED'});assert.equal(f.owner.snapshot().observations,1);assert.equal((await f.owner.processHttpRequest(request(f.x.d))).phase,'INTAKE_BOUND_OFFICIAL_PENDING');await assert.rejects(f.owner.resumeOriginalSettlement());assert.equal(f.owner.snapshot().observations,1);await f.owner.close();});
check('provider-recovery-exhausted-budget-is-never-renewed',async()=>{const f=fixture({phase:'EXHAUSTED'});await assert.rejects(f.owner.resumeOriginalSettlement());assert.equal(f.owner.snapshot().observations,2);assert.equal((await f.owner.processHttpRequest(request(f.x.d))).phase,'INTAKE_BOUND_OFFICIAL_EXHAUSTED');await f.owner.close();});
check('provider-recovery-first-inflight-remains-outcome-unknown',async()=>{const f=fixture({phase:'FIRST_IN_FLIGHT'});assert.equal(f.owner.getRecordedOutcome(),null);assert.equal(f.owner.snapshot().recoveryHeld,true);await assert.rejects(f.owner.processHttpRequest(request(f.x.d)));assert.equal(f.owner.snapshot().recordedPhase,'FIRST_IN_FLIGHT');await f.owner.close();});
check('provider-recovery-observation-inflight-does-not-publish-the-previous-pending-outcome',async()=>{const f=fixture({phase:'OBSERVATION_IN_FLIGHT'});assert.equal(f.owner.getRecordedOutcome(),null);assert.equal(f.owner.snapshot().observations,1);await assert.rejects(f.owner.processHttpRequest(request(f.x.d)));await assert.rejects(f.owner.resumeOriginalSettlement());await f.owner.close();});
check('provider-recovery-zero-observer-budget-remains-zero',async()=>{const f=fixture({phase:'PENDING',maximum:0});await assert.rejects(f.owner.resumeOriginalSettlement());assert.equal(f.owner.snapshot().maximumPendingReconciliations,0);await f.owner.close();});
check('provider-recovery-policy-change-is-not-a-budget-reset',()=>{assert.throws(()=>fixture({configure(c){c.maximumPendingReconciliations=3;}}));});
check('provider-recovery-changed-frame-is-not-a-new-issued-context',()=>{assert.throws(()=>fixture({configure(c,s,x){s.rows[0].issue.frame.body='different';c.expectation={...x.expected,boundRowDigest:boundDigest(s.rows[0])};}}));});
check('provider-recovery-missing-record-never-falls-back-to-fresh-funding',()=>{assert.throws(()=>fixture({read(){return null;}}));assert.throws(()=>fixture({load(){return [];}}));});
check('provider-recovery-foreign-original-header-is-rejected-before-store-read',async()=>{const f=fixture(),reads=f.s.reads;await assert.rejects(f.owner.processHttpRequest(request(f.x.d,'FOREIGN')));assert.equal(f.s.reads,reads);assert.equal(f.owner.snapshot().held,false);await f.owner.close();});
check('provider-recovery-wrong-method-or-host-is-rejected-before-store-read',async()=>{const f=fixture(),reads=f.s.reads;await assert.rejects(f.owner.processHttpRequest({...request(f.x.d),method:'GET'}));const r=request(f.x.d);r.rawHeaders[1]='foreign.invalid';await assert.rejects(f.owner.processHttpRequest(r));assert.equal(f.s.reads,reads);await f.owner.close();});
check('provider-recovery-changed-record-latches-held-without-repair',async()=>{const f=fixture();f.s.raw=f.x.raw+'\n';await assert.rejects(f.owner.processHttpRequest(request(f.x.d)));assert.equal(f.owner.snapshot().held,true);f.s.raw=f.x.raw;assert.throws(()=>f.owner.getRecordedOutcome());await assert.rejects(f.owner.close());});
check('provider-recovery-row-change-across-read-is-held',async()=>{let change=false;const f=fixture({load(s){if(change&&s.loads%2===0)return [];return s.rows;}});change=true;await assert.rejects(f.owner.processHttpRequest(request(f.x.d)));assert.equal(f.owner.snapshot().held,true);await assert.rejects(f.owner.close());});
check('provider-recovery-lost-read-receipt-is-not-retried',async()=>{let lose=false;const f=fixture({read(s){if(lose)throw Error('declared receipt lost');return s.raw;}});lose=true;await assert.rejects(f.owner.processHttpRequest(request(f.x.d)));const reads=f.s.reads;lose=false;assert.throws(()=>f.owner.getRecordedOutcome());assert.equal(f.s.reads,reads);await assert.rejects(f.owner.close());});
check('provider-recovery-rejected-promise-read-is-observed-with-no-late-repair',async()=>{const p=deferred();assert.throws(()=>fixture({read(){return p.promise;}}));p.reject(Error('declared read'));await flush();});
check('provider-recovery-opaque-thenable-is-retained-without-invoking-hooks',()=>{let hooks=0;assert.throws(()=>fixture({read(){return {get then(){hooks++;throw Error();}};}}));assert.equal(hooks,0);});
check('provider-recovery-reentrant-close-during-read-prevents-a-reply',async()=>{let stop=false,p;const f=fixture({read(s,x,o){if(stop)p=o.close();return s.raw;}});stop=true;await assert.rejects(f.owner.processHttpRequest(request(f.x.d)));await assert.rejects(p);assert.equal(f.owner.snapshot().held,true);});
check('provider-recovery-close-is-logical-idempotent-and-never-closes-borrowed-store',async()=>{const f=fixture(),reads=f.s.reads+f.s.loads;await f.owner.close();await f.owner.close();assert.throws(()=>f.owner.getRecordedOutcome());await assert.rejects(f.owner.processHttpRequest(request(f.x.d)));assert.equal(f.s.reads+f.s.loads,reads);assert.equal(f.s.storeCloses,0);assert.equal(f.owner.snapshot().stores,'BORROWED_NOT_CLOSED');});
check('provider-recovery-actual-controller-starts-with-history-and-no-service-session',async()=>{const f=await app();assert.equal(f.root.snapshot().binding.officialPhase,'SETTLED');assert.equal(f.s.sessions,0);assert.equal(f.f.s.SDK,0);assert.equal(f.s.creates,1);await f.root.close();});
check('provider-recovery-unpaid-request-cannot-issue-another-challenge',async()=>{const f=await app(),r=f.send(request(f.f.x.d,null));assert.equal(r.res.statusCode,503);assert.equal(f.root.snapshot().challengeCalls,0);await f.root.close();});
check('provider-recovery-original-paid-replay-returns-bound-with-no-sdk-entry',async()=>{const f=await app(),r=f.send(request(f.f.x.d));await flush();assert.equal(r.res.statusCode,202);assert.equal(r.res.body,'BOUND');assert.equal(r.res.headers['PAYMENT-RESPONSE'],undefined);assert.equal(f.f.s.SDK+f.f.s.writes,0);await f.root.close();});
check('provider-recovery-pending-controller-never-creates-grant-or-observes-again',async()=>{const f=await app({phase:'PENDING_OBSERVED'}),g=f.ledger.activate();assert.throws(()=>f.root.admitCommittedServiceGrant(g.grantId));await assert.rejects(f.root.resumeOriginalSettlement());assert.equal(f.s.sessions,0);assert.equal(f.f.owner.snapshot().observations,1);await f.root.close();});
check('provider-recovery-inflight-http-remains-503-with-controlled-history',async()=>{const f=await app({phase:'OBSERVATION_IN_FLIGHT'}),r=f.send(request(f.f.x.d));await flush();assert.equal(r.res.statusCode,503);assert.equal(f.root.snapshot().phase,'OPEN');assert.equal(f.root.snapshot().binding.boundRetained,false);assert.equal(f.f.s.SDK,0);await f.root.close();});
check('provider-recovery-service-needs-the-external-committed-original-grant',async()=>{const f=await app(),r=f.send(f.serviceRequest());assert.equal(r.res.statusCode,503);const g=f.ledger.activate();assert.equal(f.root.admitCommittedServiceGrant(g.grantId).status,'ADMITTED');assert.equal(f.s.sessions,1);await f.root.close();});
check('provider-recovery-foreign-committed-grant-is-refused-before-session',async()=>{const f=await app({grantRead(s,b,m,id){const g=m.m.getGrant(id);return {...g,transactionId:'zenontx:'+'f'.repeat(64)};}}),g=f.ledger.activate();assert.throws(()=>f.root.admitCommittedServiceGrant(g.grantId));assert.equal(f.s.sessions,0);await f.root.close();});
check('provider-recovery-outcome-change-during-grant-read-prevents-session',async()=>{const f=await app({grantRead(s,b,m,id){b.s.raw+='\n';return m.m.getGrant(id);}}),g=f.ledger.activate();assert.throws(()=>f.root.admitCommittedServiceGrant(g.grantId));assert.equal(f.s.sessions,0);await assert.rejects(f.root.close());});
check('provider-recovery-grant-read-reentrant-close-prevents-session',async()=>{let root,closing;const f=await app({grantRead(s,b,m,id){closing=root.close();return m.m.getGrant(id);}});root=f.root;const g=f.ledger.activate();assert.throws(()=>root.admitCommittedServiceGrant(g.grantId));assert.equal(f.s.sessions,0);await closing;});
check('provider-recovery-model-100-requests-and-exact-replay-use-one-original-grant',async()=>{const f=await app(),g=f.ledger.activate();f.root.admitCommittedServiceGrant(g.grantId);for(let i=0;i<100;i++){const r=f.send(f.serviceRequest('request.'+i));await flush();assert.equal(r.res.statusCode,200);}const replay=f.send(f.serviceRequest('request.0'));await flush();assert.equal(replay.res.statusCode,200);assert.equal(f.s.debits,100);assert.equal(f.s.executions,100);assert.equal(f.ledger.m.getGrant(g.grantId).availableUnits,0);await f.root.close();});
check('provider-recovery-second-controller-preserves-model-counters-and-exact-replay',async()=>{const first=await app(),g=first.ledger.activate();first.root.admitCommittedServiceGrant(g.grantId);first.send(first.serviceRequest('original'));await flush();const state=first.ledger.m.exportState();await first.root.close();const next=await app({state});next.root.admitCommittedServiceGrant(g.grantId);next.send(next.serviceRequest('original'));await flush();assert.equal(next.s.debits+next.s.executions,0);assert.equal(next.ledger.m.getGrant(g.grantId).consumedUnits,1);await next.root.close();});
check('provider-recovery-model-unknown-execution-stays-reserved-after-state-reconstruction',async()=>{const first=await app(),g=first.ledger.activate(),input={modelVersion:1,grantId:g.grantId,requestId:'unknown',method:'POST',routeId:'api.fixed',canonicalBodyDigest:'sha256:'+'a'.repeat(64),selectedContentType:'application/json',maxCostUnits:1};first.ledger.m.reserveRequest(input);first.ledger.m.beginExecution({grantId:g.grantId,requestId:'unknown'});first.ledger.m.markOutcomeUnknown({grantId:g.grantId,requestId:'unknown'});const state=first.ledger.m.exportState();await first.root.close();const next=await app({state});assert.equal(next.ledger.m.getGrant(g.grantId).heldUnits,1);assert.throws(()=>next.ledger.m.reserveRequest({...input,requestId:'different'}));assert.equal(next.s.executions,0);await next.root.close();});
check('provider-recovery-startup-row-change-after-factory-await-refuses-listener',async()=>{await assert.rejects(app({construct(s,f){f.s.rows=[];}}));});

check('provider-recovery-inflight-refusal-uses-one-snapshot-before-settling-completion',async()=>{let armed=false,views=0;const f=await app({phase:'FIRST_IN_FLIGHT',fundingView(owner){return F({...owner,snapshot:F(()=>{if(armed&&++views>1)throw Error('declared second view');return owner.snapshot();})});}});armed=true;const r=f.send(request(f.f.x.d));await flush();assert.equal(r.res.statusCode,503);assert.equal(r.done.counts.success,1);assert.equal(views,1);armed=false;assert.equal(f.root.snapshot().activeOperations,0);await f.root.close();});

export const issuedProviderRecoveryDataCases=F([...checks]);
export const issuedProviderRecoveryDataFixture=app;
export const issuedProviderRecoveryDataFlush=flush;
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const cases=[];let current=null,reported=false;
 function report(){if(reported)return;reported=true;const failed=cases.filter(c=>c.status==='FAIL').length;console.log(JSON.stringify({qualification:'G2_ISSUED_PROVIDER_RECORDED_RECOVERY_DATA',passed:cases.length-failed,failed,cases,
   actualRecordedBackendProviderBindingAndModel:true,storeSessionWriterListenerAndVerifierPorts:'DECLARED_MEMORY_ONLY',activation:'UNAUTHENTICATED_TRUSTED_METADATA_DATA',
   nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,freshProcess:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED',externalOwnerFencing:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED'}));if(failed)process.exitCode=1;}
 function unsettled(){if(current!==null){cases.push({id:current,status:'FAIL',error:'UNSETTLED_DECLARED_DATA_PROMISE'});report();}}
 process.once('beforeExit',unsettled);for(const {id,run}of checks){current=id;try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??'unknown').slice(0,256)});}current=null;}
 process.off('beforeExit',unsettled);report();
}
