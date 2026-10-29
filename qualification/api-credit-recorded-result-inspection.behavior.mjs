// New product-only result inspection. Declared DATA I/O and reconstructed
// reference state do not qualify native SQL, proof verification or restart.
import assert from 'node:assert/strict';
import { resultInspectionFixture as fixture,deferred } from './api-credit-recorded-result-inspection.fixture.mjs';
import { captureApiCreditRecordedResultInspection as project,captureApiCreditRecordedResultInspectionOutput as output } from '../src/api-credit-recorded-result-inspection.js';
import { captureServiceCreditRecoveryInspectionResult as redact,captureServiceCreditRecoveryInspectionOutput as redactedOutput } from '../src/service-credit-recovery-inspection-owner.js';
import { captureApiCreditCliArguments as args } from '../src/api-credit-cli-arguments.js';
import { consumeApiCreditRecoveryInspectionProfile as consume,releaseApiCreditRecoveryInspectionProfile as release } from '../src/api-credit-recovery-inspection-profile.js';

const F=Object.freeze,checks=[];function check(id,run){checks.push({id,run});}
async function flush(){for(let i=0;i<32;i++)await Promise.resolve();}
function powerless(v){assert.equal(v.authority,'NONE');for(const key of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed'])assert.equal(v[key],false);
 assert.equal(v.serviceDelivery,'NOT_ESTABLISHED');assert.equal(v.currentAuthority,'NOT_ESTABLISHED');assert.equal(v.sameProcessObservationOnly,true);assert.equal(v.snapshotAtomicAcrossStores,false);}
function unchanged(r,before){assert.equal(JSON.stringify(r.model.exportState()),before);assert.equal(r.originalCounts.funding,1);assert.equal(r.originalCounts.grants,1);}

check('recorded-inspection-arguments-select-an-explicit-keyless-mode-with-distinct-owned-fds',()=>{
 assert.deepEqual(args(['--recorded-result-fd','3','--output-fd','6','--bootstrap-ms','1000']),{mode:'RECORDED_RESULT',recordedResultFd:3,outputFd:6,bootstrapMs:1000});
 for(const a of [['--recorded-result-fd','3','--output-fd','3','--bootstrap-ms','1000'],['--recorded-result-fd','03','--output-fd','6','--bootstrap-ms','1000'],
  ['--recorded-result-fd','3','--output-fd','6','--bootstrap-ms','0'],['--recorded-result-fd','3','--output-fd','6','--bootstrap-ms','1000','--key-fd','4']])assert.throws(()=>args(a));
 assert.equal(args(['--inspect-fd','3','--output-fd','6','--bootstrap-ms','1000']).mode,'INSPECT');
 assert.equal(args(['--signer-inspect-fd','3','--output-fd','6','--bootstrap-ms','1000']).mode,'SIGNER_INSPECT');
});
check('recorded-inspection-legacy-redaction-still-withholds-cache-and-exact-response-payload',async()=>{
 const r=await fixture(),legacy=redactedOutput(redact(r.observation())),current=project(r.observation(),r.manifest());
 assert.equal(Object.hasOwn(legacy,'cachedResult'),false);assert.equal(Object.hasOwn(legacy,'responseJson'),false);assert.throws(()=>redactedOutput(current));assert.equal(current.resultAvailable,true);
});
check('recorded-inspection-actual-combined-read-core-checks-pins-around-one-query-and-closes-in-owner-order',async()=>{
 const r=await fixture(),before=JSON.stringify(r.model.exportState()),v=await r.run();powerless(v);
 assert.equal(v.grantId,r.key.grantId);assert.equal(v.requestId,r.key.requestId);assert.equal(v.responseJson,r.local.responseObservation.responseJson);
 assert.equal(v.cachedResult.resultCode,r.model.getRequest(r.key).cachedResult.resultCode);assert.equal(v.source,'LOCAL_RESPONSE_AND_BACKEND_CACHE');
 assert.deepEqual(r.trace,['backend-open','payer-open','backend-read','payer-close','backend-close']);assert.equal(r.backendReads,1);assert.equal(r.localReads,2);assert.equal(r.checkpointReads,4);
 assert.equal(r.payerCloseCalls,1);assert.equal(r.backendCloseCalls,1);assert.equal(r.readerClosed,true);unchanged(r,before);
});
check('recorded-inspection-exhausted-100-request-reference-reconstruction-returns-one-cache-with-no-new-debit',async()=>{
 const r=await fixture({fullGrant:true}),before=JSON.stringify(r.model.exportState()),v=await r.run(),grant=r.model.getGrant(r.key.grantId);
 assert.equal(v.resultAvailable,true);assert.deepEqual([grant.availableUnits,grant.heldUnits,grant.consumedUnits],[0,0,100]);
 assert.equal(r.originalCounts.executions,100);assert.equal(r.backendReads,1);unchanged(r,before);powerless(v);
});
check('recorded-inspection-lost-local-response-returns-only-backend-cache-and-keeps-client-reconciliation',async()=>{
 const r=await fixture({missingResponse:true}),before=JSON.stringify(r.model.exportState()),v=await r.run();
 assert.equal(v.resultAvailable,true);assert.equal(v.responseJson,null);assert.equal(v.source,'BACKEND_CACHE');assert.equal(v.localReconciliationRequired,true);
 assert.equal(v.status,'CLIENT_RECONCILIATION_REQUIRED');assert.equal(r.local.uncertainty.submission,true);assert.equal(r.local.responseObservation,null);powerless(v);unchanged(r,before);
});
check('recorded-inspection-unauthorized-backend-never-releases-even-an-existing-local-response',async()=>{
 const r=await fixture({backendStatus:'UNAUTHORIZED'}),v=await r.run();assert.equal(v.backendStatus,'UNAUTHORIZED');assert.equal(v.resultAvailable,false);
 assert.equal(v.cachedResult,null);assert.equal(v.responseJson,null);assert.equal(v.source,'NONE');powerless(v);
});
check('recorded-inspection-unknown-and-unrecorded-backend-outcomes-return-no-cache-or-new-authority',async()=>{
 for(const backendStatus of ['OUTCOME_UNKNOWN','NOT_RECORDED','RECONCILIATION_REQUIRED']){const r=await fixture({backendStatus}),v=await r.run();
  assert.equal(v.backendStatus,backendStatus);assert.equal(v.resultAvailable,false);assert.equal(v.responseJson,null);powerless(v);}
});
check('recorded-inspection-absent-client-original-does-not-query-the-backend-or-create-one',async()=>{
 const r=await fixture({absentOriginal:true}),before=JSON.stringify(r.model.exportState()),v=await r.run();assert.equal(v.status,'CLIENT_ORIGINAL_NOT_RECORDED');
 assert.equal(v.backendStatus,null);assert.equal(v.resultAvailable,false);assert.equal(r.backendReads,0);assert.equal(r.backendCloseCalls,1);unchanged(r,before);
});
check('recorded-inspection-checkpoint-drift-refuses-output-and-never-repeats-the-query',async()=>{
 const r=await fixture({changedCheckpoint:true});await assert.rejects(r.run());assert.equal(r.backendReads,1);assert.equal(r.payerCloseCalls,1);assert.equal(r.backendCloseCalls,1);
});
check('recorded-inspection-stale-owner-during-backend-read-refuses-output-without-resend',async()=>{
 const r=await fixture({revokeDuringRead:true});await assert.rejects(r.run());assert.equal(r.backendReads,1);assert.equal(r.payerCloseCalls,1);assert.equal(r.backendCloseCalls,1);
});
check('recorded-inspection-changed-client-history-around-query-cannot-become-a-result',async()=>{
 const r=await fixture({changeOriginalDuringRead:true});await assert.rejects(r.run());assert.equal(r.backendReads,1);assert.equal(r.backendCloseCalls,1);
});
check('recorded-inspection-nonvoid-payer-stop-retains-the-borrowed-backend-and-withholds-result',async()=>{
 const r=await fixture({nonvoidClose:true});await assert.rejects(r.run());assert.equal(r.payerCloseCalls,1);assert.equal(r.backendCloseCalls,0);
});
check('recorded-inspection-backend-close-failure-is-retained-without-a-second-stop-or-result',async()=>{
 const r=await fixture({backendCloseThrow:true});await assert.rejects(r.run());assert.equal(r.payerCloseCalls,1);assert.equal(r.backendCloseCalls,1);
});
check('recorded-inspection-foreign-request-grant-or-original-body-never-matches-the-local-record',async()=>{
 const r=await fixture(),v=r.observation(),m=r.manifest();
 for(const [key,value]of [['grantId','foreign'],['requestId','foreign'],['canonicalBodyDigest','sha256:'+'f'.repeat(64)],['maxCostUnits',2]])
  assert.throws(()=>project(F({...v,backend:F({...v.backend,originalRequest:F({...v.backend.originalRequest,[key]:value})})}),m));
 assert.throws(()=>project(v,F({...m,requestKey:F({...m.requestKey,requestId:'foreign'})})));
});
check('recorded-inspection-unknown-execution-or-conflicting-cache-cannot-become-cached-success',async()=>{
 const r=await fixture(),v=r.observation(),m=r.manifest();
 for(const edit of [b=>F({...b,execution:F({...b.execution,terminalClassification:'OUTCOME_UNKNOWN'})}),b=>F({...b,cachedResult:F({...b.cachedResult,resultCode:'different'})}),
  b=>F({...b,originalRequest:F({...b.originalRequest,state:'OUTCOME_UNKNOWN'})}),b=>F({...b,cachedResult:F({...b.cachedResult,statusCode:201})}),b=>F({...b,cachedResult:F({...b.cachedResult,contentType:'text/plain'})})])assert.throws(()=>project(F({...v,backend:edit(v.backend)}),m));
});
check('recorded-inspection-local-response-must-match-backend-code-and-funding-context',async()=>{
 const r=await fixture(),v=r.observation(),m=r.manifest(),response=v.local.responseObservation;
 for(const edit of [{resultCode:'different'},{paymentHash:'f'.repeat(64)},{fundingRevision:99},{network:'zenon:foreign'},
  {fundingResourceUrl:'https://foreign.example.test/funding'},{responseJson:' {"ok":true,"resultCode":"different"}'},{deliveryConfirmed:true}])
  assert.throws(()=>project(F({...v,local:F({...v.local,responseObservation:F({...response,...edit})})}),m));
});
check('recorded-inspection-output-cannot-gain-signing-payment-dispatch-or-confirmed-delivery-authority',async()=>{
 const r=await fixture(),v=project(r.observation(),r.manifest());
 for(const edit of [{authority:'EXECUTE'},{mayStartPayment:true},{maySignPayment:true},{mayDispatchService:true},{deliveryConfirmed:true},
  {serviceDelivery:'CONFIRMED'},{currentAuthority:'LIVE'},{snapshotAtomicAcrossStores:true},{sameProcessObservationOnly:false},{originalCheckpointPinsMatched:false},
  {localReconciliationRequired:false},{recordedResultInspectionVersion:2}])assert.throws(()=>output(F({...v,...edit})));
});
check('recorded-inspection-closed-output-refuses-proof-raw-original-checkpoint-and-unbounded-payload-fields',async()=>{
 const r=await fixture(),v=project(r.observation(),r.manifest());
 for(const key of ['authorizationHeader','serializedCheckpoint','originalRequestJson','paymentHash'])assert.throws(()=>output(F({...v,[key]:'not selected'})));
 assert.throws(()=>output({...v}));assert.throws(()=>output(F({...v,responseJson:'a'.repeat(4097)})));assert.throws(()=>output(F({...v,cachedResult:F({...v.cachedResult,secret:'not selected'})})));
});
check('recorded-inspection-proxy-and-accessor-data-refuse-without-entering-user-hooks',async()=>{
 const r=await fixture(),v=r.observation(),m=r.manifest();let entered=0;
 const accessor={...v};Object.defineProperty(accessor,'backend',{enumerable:true,get(){entered++;throw Error('unselected hook');}});F(accessor);assert.throws(()=>project(accessor,m));
 assert.throws(()=>project(new Proxy(v,{get(){entered++;throw Error('unselected hook');},getPrototypeOf(){entered++;throw Error('unselected hook');}}),m));assert.equal(entered,0);
});
check('recorded-inspection-actual-coordinator-writes-one-bounded-cache-after-the-store-owner-close',async()=>{
 const r=await fixture({write:r=>{assert.equal(r.backendClosed,true);return Promise.resolve(undefined);}}),before=JSON.stringify(r.model.exportState()),result=await r.coordinate();
 assert.equal(result.status,'CLOSED');assert.equal(result.exitCode,0);assert.equal(result.inspectionEntered,true);assert.equal(result.apiCreditRecordedResultInspectionVersion,1);
 assert.equal(r.writes.length,1);assert.equal(r.ownerReads,1);assert.equal(r.backendReads,1);assert.equal(r.channelCloses,1);assert.ok(Buffer.byteLength(r.writes[0])<=4096);
 const value=JSON.parse(r.writes[0]);assert.equal(value.responseJson,r.local.responseObservation.responseJson);powerless(value);unchanged(r,before);
});
check('recorded-inspection-invalid-profile-is-refused-before-any-existing-store-entry',async()=>{
 const r=await fixture();r.text='{}';const result=await r.coordinate();assert.equal(result.status,'BOOTSTRAP_REFUSED');assert.equal(r.ownerReads,0);assert.equal(r.backendReads,0);assert.equal(r.writes.length,0);assert.equal(r.channelCloses,1);
});
check('recorded-inspection-coordinator-rejects-a-result-for-a-foreign-request-before-output',async()=>{
 const r=await fixture({inspect:(profile,r)=>{const c=consume(profile);release(profile);return Promise.resolve(F({...project(r.observation(),c.manifest),requestId:'foreign'}));}}),result=await r.coordinate();
 assert.equal(result.status,'CLOSE_UNKNOWN');assert.equal(r.writes.length,0);assert.equal(r.ownerReads,1);assert.equal(r.channelCloses,1);
});
check('recorded-inspection-expired-result-cannot-write-late-or-upgrade-the-earlier-unknown',async()=>{
 const wait=deferred(),r=await fixture({inspect:(profile)=>{consume(profile);release(profile);return wait.promise;}}),run=r.coordinate();await flush();
 r.now=1000000000n;r.timers[0].callback();const result=await run;assert.equal(result.status,'CLOSE_UNKNOWN');
 wait.resolve(project(r.observation(),r.manifest()));await flush();assert.equal(r.writes.length,0);assert.equal(r.ownerReads,1);assert.equal(r.backendReads,0);assert.equal(r.channelCloses,1);
});
check('recorded-inspection-output-loss-does-not-repeat-the-owner-query-or-clear-model-state',async()=>{
 const r=await fixture({write:()=>Promise.reject(Error('declared output lost'))}),before=JSON.stringify(r.model.exportState()),result=await r.coordinate();
 assert.equal(result.status,'CLOSE_UNKNOWN');assert.equal(r.ownerReads,1);assert.equal(r.backendReads,1);assert.equal(r.writes.length,1);assert.equal(r.channelCloses,1);unchanged(r,before);
});
check('recorded-inspection-output-does-not-echo-capability-proof-payment-checkpoint-or-original-body',async()=>{
 const r=await fixture(),v=await r.run(),text=JSON.stringify(v);for(const secret of [r.input.authorizationHeader,r.packet.serializedCheckpoint,r.input.originalRequestJson])assert.equal(text.includes(secret),false);
 assert.equal(Object.hasOwn(v,'paymentHash'),false);assert.equal(Object.hasOwn(v,'originalRequestJson'),false);assert.equal(v.originalCheckpointPinsMatched,true);
});

const cases=[];for(const{id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??e)});}}
const failed=cases.filter(c=>c.status!=='PASS').length;
console.log(JSON.stringify({qualification:'G1_G2_RECORDED_RESULT_INSPECTION_DATA',passed:cases.length-failed,failed,cases,
 actualProductCommandReferenceModelAndCombinedReadCore:true,declaredSQLProofFileEpochAndChannelPortsOnly:true,inMemoryReferenceReconstructionOnly:true,
 nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
 nativeReopenAcceptance:'NOT_ESTABLISHED',nativeProofVerification:'NOT_ESTABLISHED',nativeRelease:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED',fullG1G2:'NOT_ESTABLISHED'}));
if(failed)process.exitCode=1;
