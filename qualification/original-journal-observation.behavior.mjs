// Actual observation owner, codecs, normalizer and restored provider core.
// Provider/store/journal/listener ports are declared memory DATA only.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { canonicalJson,sha256Hex,paymentIntentDigest } from '../src/canonical.js';
import { officialOutcomeCustodyDataFixture } from './official-outcome-custody.behavior.mjs';
import { computeZenonUnsignedUserSendHash } from '../src/zenon/transaction-planner.js';
import { captureOfficialFundingPostCustodyContext as context,createOfficialFundingPostEnteredRecord as entered,
 createOfficialFundingPostOutcomeRecord as completed,createOfficialFundingPostObservationRecord as observing,
 inspectOfficialFundingPostCustodyRecord as inspect,officialFundingPostCustodyRecordDigest as digest,
 requireOfficialFundingPostCustodyTransition as transition } from '../src/official-funding-post-custody-record.js';
import { issuedFundingGrantBoundRowDigest as rowDigest,restoreIssuedFundingGrantRecordedBackend as backend } from '../src/x402-issued-funding-grant-recovery.js';
import { restoreIssuedFundingGrantApplicationCore as application } from '../src/x402-issued-funding-grant-application-core.js';
import { createOriginalFundingJournalObservation as create } from '../src/official-funding-post-original-journal-observation.js';

const F=Object.freeze,checks=[],clone=v=>JSON.parse(JSON.stringify(v));
function check(id,run){checks.push({id,run});}
function deep(v){if(v!==null&&typeof v==='object'){for(const k of Object.keys(v))deep(v[k]);F(v);}return v;}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function flush(){for(let i=0;i<24;i++)await Promise.resolve();}
function data(options={}){
 const b=officialOutcomeCustodyDataFixture(options.maximum??2),config=clone(b.config),required=JSON.parse(Buffer.from(config.issuedFrame.paymentRequiredHeader,'base64').toString('utf8'));
 let payload=JSON.parse(Buffer.from(b.header,'base64').toString('utf8')),header=b.header;
 // A synthetic policy variant hashes an unsigned DTO; retained signature text
 // is unauthenticated DATA and is never produced or verified by this fixture.
 if(options.minimum){required.accepts[0].extra.minimumMomentumConfirmations=options.minimum;payload.accepted=clone(required.accepts[0]);
  payload.payload.intentDigest=paymentIntentDigest(required,payload.accepted);payload.payload.transaction.data=Buffer.from(payload.payload.intentDigest,'hex').toString('base64');
  payload.payload.transaction.hash=computeZenonUnsignedUserSendHash({...payload.payload.transaction,signature:''});header=Buffer.from(canonicalJson(payload)).toString('base64');
  config.issuedFrame.paymentRequiredHeader=Buffer.from(canonicalJson(required)).toString('base64');}
 const hash=payload.payload.transaction.hash,bound=F(Object.assign(Object.create(null),{status:'BOUND',transactionHash:hash,observerRecordKey:'sha256:'+'c'.repeat(64),observerFileName:'funding-observer-'+hash+'.sqlite'}));
 function result(phase){return F({phase:'INTAKE_BOUND_OFFICIAL_'+phase,intake:bound,official:deep(phase==='SETTLED'?{type:'settled',settlement:{success:true,transaction:hash,network:payload.accepted.network}}:
   {type:'payment-error',response:{status:402,body:'declared pending',headers:{}}}),transactionHash:hash,acknowledgementDomainsIndependent:true,authority:'NONE',grantActivation:'NOT_ESTABLISHED',serviceDelivery:'NOT_ESTABLISHED'});}
 let raw=entered(context(config),header,bound);if(options.phase!=='FIRST_IN_FLIGHT')raw=completed(raw,result(options.phase==='SETTLED'?'SETTLED':'PENDING'));
 if(options.phase==='OBSERVATION_IN_FLIGHT')raw=observing(raw);
 const resourceDigest=sha256Hex(payload.resource),authorizationKey=sha256Hex({domain:'zenon-x402-authorization-v1',chainProfile:payload.accepted.extra.zenonChain,
   intentDigest:payload.payload.intentDigest,resourceDigest,transactionHash:hash});
 const original={authorizationKey,transactionHash:hash,chainProfile:clone(payload.accepted.extra.zenonChain),intentDigest:payload.payload.intentDigest,
   resourceIdentity:clone(payload.resource),resourceDigest,payer:payload.payload.transaction.address,signedAccountBlock:clone(payload.payload.transaction)};
 const row={issue:{frame:clone(config.issuedFrame),resourceUrl:config.resourceUrl,selection:clone(config.serviceSelection)},status:'BOUND',binding:{...clone(bound),authorizationKey,publication:{paymentPayload:clone(payload)}}};
 const at='2026-10-29T00:00:00.000Z',journal={revision:1,kind:'record',entry:{...clone(original),evidenceState:'MOMENTUM_INCLUDED',momentumEvidence:{observedAt:at,
   confirmationDetail:{numConfirmations:options.confirmations??3,momentumHeight:100,momentumHash:'e'.repeat(64),momentumTimestamp:1000}},deliveryState:'NONE',cachedResponse:null,createdAt:at,updatedAt:at}};
 return {config,header,bound,row,raw,journal,original,expected:{boundRowDigest:rowDigest(row),outcomeRecordDigest:digest(raw)}};
}
function cleanView(s){return deep({phase:s.providerClosed?'CLOSED':'OPEN',uncertain:false,admissionRevoked:s.providerClosed,activeOperations:0,fundingBusy:false,serviceOpening:false,
 fundingCloseDone:true,serviceCloseDone:true,queryCloseDone:true,ingress:{phase:s.providerClosed?'CLOSED':'OPEN',closeClean:1,closeUncertain:0,trackedSockets:0,trackedRequests:0,trackedHandlers:0,ownedTimers:0},
 funding:{closed:s.providerClosed,held:false,active:false}});}
function fixture(options={}){
 const d=data(options),pending=deferred(),s={raw:d.raw,rows:[d.row],journal:d.journal,providerClosed:false,closeCalls:0,inspections:0,loads:0,reads:0,writes:0,journalReads:0,trace:[],SDK:0,publish:0,activate:0};let owner;
 const port=F({closeProvider:F(()=>{s.closeCalls++;s.trace.push('close');if(options.close)return options.close(s,d,pending,owner);s.providerClosed=true;return Promise.resolve(undefined);}),
   inspectProvider:F(()=>{s.inspections++;s.trace.push('inspect');return options.view?options.view(s,d,owner):cleanView(s);}),
   loadBound:F(()=>{s.loads++;s.trace.push('load');return options.load?options.load(s,d,owner):s.rows;}),
   readOfficialOutcome:F(()=>{s.reads++;s.trace.push('read');return options.read?options.read(s,d,pending,owner):s.raw;}),
   compareAndSwap:F((expected,next)=>{s.writes++;s.trace.push('cas');if(options.cas)return options.cas(s,d,pending,owner,expected,next);transition(expected,next);assert.equal(s.raw,expected);s.raw=next;return next;}),
   readJournal:F(original=>{s.journalReads++;s.trace.push('journal');assert.deepEqual(original,d.original);return options.journal?options.journal(s,d,pending,owner):Promise.resolve(s.journal);}),
 });
 const configuration={expectation:d.expected,serviceSelection:d.config.serviceSelection,resourceUrl:d.config.resourceUrl,maximumPendingReconciliations:d.config.maximumPendingReconciliations,port};
 if(options.configure)options.configure(configuration,s,d);owner=create(configuration);return {d,s,owner,pending,port,configuration};
}
async function held(f){await assert.rejects(f.owner.observe());assert.equal(f.owner.snapshot().held,true);await assert.rejects(f.owner.close());}

async function coreRoot(f,expectation=f.d.expected){
 const noop=F(()=>{}),store=F({declared:true}),runtime=F({monotonicNowNs:F(()=>0n),schedule:F(()=>F({declared:true})),cancel:noop});let transport,closed=false;
 const root=await application({recovery:expectation,funding:{intake:{store,serviceCreditStore:store,authorityRecord:'declared',deriveFundingTerms:noop,now:F(()=>100),observerRoot:'/synthetic/observer',
   observerCatchUp:F({maximumPageEntries:1,maximumBackfillSpan:1,maximumMembersPerMomentum:1}),selection:f.d.config.serviceSelection,resourceUrl:f.d.config.resourceUrl},
   official:{localFacilitator:F({notEntered:true}),validateChallenge:noop,reconcilePendingSettlement:noop,maxPendingReconciliations:f.d.config.maximumPendingReconciliations},maxIntakeAttempts:1,closeBudgetMs:1000},
   service:{store,execute:noop,deadlineRuntime:runtime,selectedDurationMs:1},transport:{origin:new URL(f.d.config.resourceUrl).origin,generation:F({generationId:'generation.fixture',generationVersion:1}),
     limits:F({maxHeaderBytes:16384,maxHeaderCount:64,maxConcurrentSockets:8,maxConnectionStarts:128,maxConcurrentRequests:8,maxRequestStarts:128,tlsHandshakeDeadlineMs:50,headerDeadlineMs:50,
       requestResponseDeadlineMs:100,idleSocketDeadlineMs:100,startDeadlineMs:100,closeGraceMs:200,metricsCounterLimit:1000}),deadlineRuntime:F({schedule:runtime.schedule,cancel:noop}),httpsServerFactory:noop}},
  F({validateStores:noop,loadBound:F(()=>f.s.rows),readCommittedGrant:F(()=>null),createServiceSession:F(()=>{throw Error('no grant activation');}),
   createFunding:F(async()=>backend({expectation,serviceSelection:f.d.config.serviceSelection,resourceUrl:f.d.config.resourceUrl,maximumPendingReconciliations:f.d.config.maximumPendingReconciliations,
     port:F({loadBound:F(()=>f.s.rows),readOfficialOutcome:F(()=>f.s.raw)})})),
   createQueryDownstream:F(()=>F({inspect:F(()=>F({authority:'NONE'})),reject:F((req,res,ctx,done)=>{done.success();}),downstream:F({handle:F((req,res,ctx,done)=>{done.success();}),close:F(done=>{done.success();})})})),
   createIngress:F(c=>{transport=c;return F({start:F(()=>Promise.resolve(undefined)),snapshotMetrics:F(()=>cleanView({providerClosed:closed}).ingress),close:F(()=>{
     closed=true;const p=deferred();transport.downstream.close(F({success:F(()=>p.resolve(undefined)),failure:F(()=>p.reject(Error('declared close unknown')))}));return p.promise;})});})}));return root;
}

check('journal-observation-construction-captures-no-io-and-rejects-foreign-capability-shapes',()=>{const f=fixture();assert.equal(f.s.closeCalls+f.s.loads+f.s.journalReads,0);assert.throws(()=>create({...f.configuration,extra:true}));assert.throws(()=>create({...f.configuration,port:{...f.port,readJournal:f.port.closeProvider}}));});
check('journal-observation-closes-the-same-provider-before-any-store-or-journal-read',async()=>{const f=fixture(),r=await f.owner.observe();assert.equal(f.s.trace[0],'close');assert.ok(f.s.trace.indexOf('cas')<f.s.trace.indexOf('journal'));assert.equal(inspect(f.s.raw).phase,'SETTLED');assert.equal(f.s.closeCalls,1);assert.equal(r.authority,'NONE');await f.owner.close();});
check('journal-observation-waits-for-a-void-close-and-a-fresh-quiescent-view',async()=>{const f=fixture({close(s,d,p){return p.promise;}}),work=f.owner.observe();await flush();assert.equal(f.s.loads+f.s.writes+f.s.journalReads,0);f.s.providerClosed=true;f.pending.resolve(undefined);await work;await f.owner.close();});
check('journal-observation-sync-or-nonvoid-close-cannot-acquire-custody',async()=>{for(const close of [()=>undefined,(s)=>{s.providerClosed=true;return Promise.resolve(true);},()=>Promise.reject(Error('declared close'))]){const f=fixture({close});await held(f);assert.equal(f.s.loads+f.s.writes+f.s.journalReads,0);}});
check('journal-observation-nonclosed-or-active-provider-never-writes',async()=>{const f=fixture({view(s){return deep({...cleanView(s),activeOperations:1});}});await held(f);assert.equal(f.s.writes+f.s.journalReads,0);});
check('journal-observation-unreleased-native-metrics-prevent-custody',async()=>{const f=fixture({view(s){const v=clone(cleanView(s));v.ingress.trackedSockets=1;return deep(v);}});await held(f);assert.equal(f.s.writes+f.s.journalReads,0);});
check('journal-observation-current-closed-view-is-rechecked-after-close-await',async()=>{const f=fixture({view(s){return deep({...cleanView(s),uncertain:s.inspections>1});}});await held(f);assert.equal(f.s.writes+f.s.journalReads,0);});
check('journal-observation-independent-outcome-pin-is-checked-before-reservation',async()=>{const f=fixture({configure(c){c.expectation={...c.expectation,outcomeRecordDigest:'sha256:'+'0'.repeat(64)};}});await held(f);assert.equal(f.s.writes+f.s.journalReads,0);});
check('journal-observation-zero-budget-and-existing-settled-state-never-call-journal',async()=>{for(const options of [{maximum:0},{phase:'SETTLED'},{phase:'OBSERVATION_IN_FLIGHT'}]){const f=fixture(options),before=f.s.raw;await assert.rejects(f.owner.observe());assert.equal(f.owner.snapshot().held,false);assert.equal(f.s.raw,before);assert.equal(f.s.writes+f.s.journalReads,0);await f.owner.close();}});
check('journal-observation-lost-reservation-ack-retains-count-without-reading-journal',async()=>{const f=fixture({cas(s,d,p,o,e,n){s.raw=n;throw Error('declared lost claim');}});await held(f);assert.equal(inspect(f.s.raw).phase,'OBSERVATION_IN_FLIGHT');assert.equal(inspect(f.s.raw).observations,1);assert.equal(f.s.journalReads,0);});
check('journal-observation-strict-cas-refuses-a-stale-identical-claim',async()=>{const f=fixture({cas(s,d,p,o,e,n){s.raw=n;assert.equal(s.raw,e);}});await held(f);assert.equal(f.s.writes,1);assert.equal(f.s.journalReads,0);});
check('journal-observation-missing-claim-readback-does-not-fall-back-to-a-second-claim',async()=>{const f=fixture({read(s){return s.reads>1?null:s.raw;}});await held(f);assert.equal(f.s.writes,1);assert.equal(f.s.journalReads,0);});
check('journal-observation-promise-cas-rejection-is-observed-without-invoking-journal',async()=>{const f=fixture({cas(s,d,p,o,e,n){s.raw=n;return p.promise;}}),work=f.owner.observe();await assert.rejects(work);f.pending.reject(Error('declared ack'));await flush();assert.equal(f.s.journalReads,0);await assert.rejects(f.owner.close());});
check('journal-observation-acknowledged-journal-state-stays-pending',async()=>{const f=fixture({journal(s){const v=clone(s.journal);v.entry.evidenceState='SUBMISSION_ACKNOWLEDGED';v.entry.momentumEvidence=null;return Promise.resolve(v);}}),r=await f.owner.observe();assert.equal(r.history.phase,'PENDING');assert.equal(r.history.observations,1);assert.equal(f.s.SDK+f.s.publish+f.s.activate,0);await f.owner.close();});
check('journal-observation-original-confirmation-threshold-is-not-lowered',async()=>{const f=fixture({minimum:3,confirmations:2}),r=await f.owner.observe();assert.equal(r.history.phase,'PENDING');assert.equal(JSON.parse(r.history.outcomeJson).official.settlement.success,false);await f.owner.close();});
check('journal-observation-included-original-at-threshold-records-settled-data',async()=>{const f=fixture({minimum:3,confirmations:3}),r=await f.owner.observe(),o=JSON.parse(r.history.outcomeJson);assert.equal(r.history.phase,'SETTLED');assert.equal(o.official.observationSource.SDKReentered,false);assert.equal(o.official.observationSource.currentCanonicality,'NOT_ESTABLISHED');assert.equal(o.serviceDelivery,'NOT_ESTABLISHED');await f.owner.close();});
check('journal-observation-last-pending-count-exhausts-the-original-policy',async()=>{const f=fixture({maximum:1,journal(s){const v=clone(s.journal);v.entry.evidenceState='SUBMISSION_ACKNOWLEDGED';v.entry.momentumEvidence=null;return Promise.resolve(v);}}),r=await f.owner.observe();assert.equal(r.history.phase,'EXHAUSTED');assert.equal(r.history.observations,1);await assert.rejects(f.owner.observe());assert.equal(f.s.closeCalls,1);assert.equal(f.s.journalReads,1);await f.owner.close();});
check('journal-observation-repeated-explicit-observations-share-one-provider-close-and-budget',async()=>{let calls=0;const f=fixture({journal(s){const v=clone(s.journal);if(++calls===1){v.entry.evidenceState='SUBMISSION_ACKNOWLEDGED';v.entry.momentumEvidence=null;}return Promise.resolve(v);}});assert.equal((await f.owner.observe()).history.phase,'PENDING');assert.equal((await f.owner.observe()).history.phase,'SETTLED');assert.equal(f.s.closeCalls,1);assert.equal(inspect(f.s.raw).observations,2);await f.owner.close();});
check('journal-observation-foreign-transaction-or-signed-bytes-remain-inflight',async()=>{for(const change of [v=>v.entry.transactionHash='f'.repeat(64),v=>v.entry.signedAccountBlock.signature='foreign-signature-data']){const f=fixture({journal(s){const v=clone(s.journal);change(v);return Promise.resolve(v);}});await held(f);assert.equal(inspect(f.s.raw).phase,'OBSERVATION_IN_FLIGHT');assert.equal(f.s.writes,1);}});
check('journal-observation-tombstones-and-publication-unknown-do-not-become-settlement',async()=>{for(const change of [v=>v.kind='tombstone',v=>{v.entry.evidenceState='SUBMISSION_OUTCOME_UNKNOWN';v.entry.momentumEvidence=null;}]){const f=fixture({journal(s){const v=clone(s.journal);change(v);return Promise.resolve(v);}});await held(f);assert.equal(f.s.writes,1);}});
check('journal-observation-delivery-and-compensation-are-not-inferred-from-inclusion',async()=>{const f=fixture({journal(s){const v=clone(s.journal);v.entry.deliveryState='DELIVERY_PENDING';return Promise.resolve(v);}});await held(f);assert.equal(f.s.activate,0);});
check('journal-observation-journal-getters-never-run-and-uncertainty-is-retained',async()=>{let hooks=0;const f=fixture({journal(s){const v=clone(s.journal);Object.defineProperty(v.entry,'payer',{enumerable:true,get(){hooks++;throw Error();}});return Promise.resolve(v);}});await held(f);assert.equal(hooks,0);});
check('journal-observation-rejected-journal-read-never-refunds-the-reservation',async()=>{const f=fixture({journal(){return Promise.reject(Error('declared read loss'));}});await held(f);assert.equal(inspect(f.s.raw).observations,1);assert.equal(f.s.writes,1);});
check('journal-observation-lost-outcome-ack-is-not-repaired-by-matching-storage',async()=>{const f=fixture({cas(s,d,p,o,e,n){transition(e,n);assert.equal(s.raw,e);s.raw=n;if(s.writes===2)throw Error('declared result ack');return n;}});await held(f);assert.equal(inspect(f.s.raw).phase,'SETTLED');const reads=f.s.reads;await assert.rejects(f.owner.observe());assert.equal(f.s.reads,reads);});
check('journal-observation-row-change-during-journal-read-blocks-result-commit',async()=>{const f=fixture({journal(s){s.rows=[];return Promise.resolve(s.journal);}});await held(f);assert.equal(f.s.writes,1);});
check('journal-observation-concurrent-call-cannot-start-a-second-observer',async()=>{const f=fixture({journal(s,d,p){return p.promise;}}),first=f.owner.observe();await flush();await assert.rejects(f.owner.observe());assert.equal(f.s.journalReads,1);f.pending.resolve(f.s.journal);await first;await f.owner.close();});
check('journal-observation-close-during-read-retains-held-and-never-persists-a-late-result',async()=>{const f=fixture({journal(s,d,p){return p.promise;}}),work=f.owner.observe();await flush();await assert.rejects(f.owner.close());f.pending.resolve(f.s.journal);await assert.rejects(work);assert.equal(f.s.writes,1);assert.equal(inspect(f.s.raw).phase,'OBSERVATION_IN_FLIGHT');assert.equal(f.s.closeCalls,1);});
check('journal-observation-result-is-an-independent-pin-candidate-with-none-authority',async()=>{const f=fixture(),r=await f.owner.observe();assert.equal(r.independentPinRetentionRequired,true);assert.equal(r.recoveryExpectation.boundRowDigest,f.d.expected.boundRowDigest);assert.equal(r.recoveryExpectation.outcomeRecordDigest,digest(f.s.raw));assert.equal(r.history.mayEnterSdk,false);assert.equal(r.history.mayActivateGrant,false);assert.equal(r.history.mayDispatchService,false);assert.equal(r.providerReopened,false);await f.owner.close();});
check('journal-observation-actual-restored-controller-closes-before-observation-and-needs-explicit-reopen',async()=>{const f=fixture(),root=await coreRoot(f),owner=create({...f.configuration,port:F({...f.port,closeProvider:root.close,inspectProvider:root.snapshot})});const r=await owner.observe();assert.equal(root.snapshot().phase,'CLOSED');assert.equal(root.snapshot().serviceAdmissionOpen,false);assert.equal(inspect(f.s.raw).phase,'SETTLED');const next=await coreRoot(f,r.recoveryExpectation);assert.equal(next.snapshot().binding.officialPhase,'SETTLED');assert.equal(next.snapshot().serviceAdmissionOpen,false);assert.equal(f.s.SDK+f.s.publish+f.s.activate,0);await next.close();await owner.close();});

export const originalJournalObservationDataCases=F([...checks]);
export const originalJournalObservationDataFixture=fixture;
export const originalJournalObservationDataProvider=coreRoot;
export const originalJournalObservationDataFlush=flush;
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const cases=[];let current=null,reported=false;
 function report(){if(reported)return;reported=true;const failed=cases.filter(c=>c.status==='FAIL').length;console.log(JSON.stringify({qualification:'G2_ORIGINAL_FUNDING_JOURNAL_OBSERVATION_DATA',passed:cases.length-failed,failed,cases,
  actualObservationOwnerCodecsNormalizerAndRestoredController:true,providerStoreJournalListenerPorts:'DECLARED_MEMORY_ONLY',signatureData:'UNAUTHENTICATED_EXISTING_FIELDS',nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
  nativeJournalIO:'NOT_ESTABLISHED',currentCanonicality:'NOT_ESTABLISHED',freshProcess:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED'}));if(failed)process.exitCode=1;}
 function unsettled(){if(current!==null){cases.push({id:current,status:'FAIL',error:'UNSETTLED_DECLARED_DATA_PROMISE'});report();}}
 process.once('beforeExit',unsettled);for(const {id,run}of checks){current=id;try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??'unknown').slice(0,256)});}current=null;}
 process.off('beforeExit',unsettled);report();
}
