// Actual product/reference/read-owner/coordinator and pure byte contracts.
// SQL, proof, file, epoch and channel ports remain declared memory DATA.
import assert from 'node:assert/strict';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { resultInspectionFixture as fixture } from './api-credit-recorded-result-inspection.fixture.mjs';
import { captureApiCreditRecordedResultInspection as project } from '../src/api-credit-recorded-result-inspection.js';
import { validateApiCreditRecordedResponseBinding as validate } from '../src/api-credit-recorded-service-result.js';
import { captureOriginalServiceRequestCustody, captureOriginalServiceDispatchIntent } from '../src/service-credit-original-request-custody-contract.js';

const F=Object.freeze,checks=[],DIGEST='sha256:'+'f'.repeat(64);
function check(id,run){checks.push(F({id,run}));}
const response=(local,changes)=>F({...local,responseObservation:F({...local.responseObservation,...changes})});
const intent=(local,changes)=>F({...local,dispatchIntent:F({...local.dispatchIntent,...changes})});
function omitResponse(local,key){const next={...local.responseObservation};delete next[key];return F({...local,responseObservation:F(next)});}
function noAuthority(result){
 assert.equal(result.authority,'NONE');assert.equal(result.currentAuthority,'NOT_ESTABLISHED');
 for(const key of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed'])assert.equal(result[key],false);
 assert.equal(result.serviceDelivery,'NOT_ESTABLISHED');assert.equal(result.snapshotAtomicAcrossStores,false);
}
async function refuse(edit){
 const r=await fixture(),before=JSON.stringify(r.model.exportState()),observed=r.observation();
 assert.throws(()=>project(F({...observed,local:edit(observed.local)}),r.manifest()));
 assert.equal(JSON.stringify(r.model.exportState()),before);
 assert.deepEqual([r.originalCounts.funding,r.originalCounts.grants,r.originalCounts.executions],[1,1,1]);
 assert.deepEqual([r.backendReads,r.payerCloseCalls,r.backendCloseCalls],[0,0,0]);
}
check('recovery-response-valid-binding-preserves-exact-body-and-no-authority',async()=>{
 const r=await fixture(),before=JSON.stringify(r.model.exportState()),result=project(r.observation(),r.manifest());
 assert.equal(result.resultAvailable,true);assert.equal(result.source,'LOCAL_RESPONSE_AND_BACKEND_CACHE');
 assert.equal(result.responseJson,r.local.responseObservation.responseJson);assert.equal(result.localReconciliationRequired,true);
 noAuthority(result);assert.equal(JSON.stringify(r.model.exportState()),before);
 assert.equal(validate(r.local.original,r.local.funding,r.local.dispatchIntent,r.local.responseObservation),undefined);
});
check('recovery-response-shared-validator-rejects-arity-and-construction-before-data',async()=>{
 const r=await fixture(),args=[r.local.original,r.local.funding,r.local.dispatchIntent,r.local.responseObservation];
 assert.throws(()=>validate());assert.throws(()=>validate(...args,undefined));assert.throws(()=>new validate(...args));
 assert.equal(validate(...args),undefined);assert.equal(r.backendReads,0);
});
check('recovery-response-changed-original-digest-withholds-local-bytes',async()=>{await refuse(local=>response(local,{originalDigest:DIGEST}));});
check('recovery-response-changed-intent-digest-withholds-local-bytes',async()=>{await refuse(local=>response(local,{dispatchIntentDigest:DIGEST}));});
check('recovery-response-missing-original-digest-withholds-local-bytes',async()=>{await refuse(local=>omitResponse(local,'originalDigest'));});
check('recovery-response-missing-intent-digest-withholds-local-bytes',async()=>{await refuse(local=>omitResponse(local,'dispatchIntentDigest'));});
check('recovery-response-changed-challenge-cannot-reuse-the-intent',async()=>{await refuse(local=>response(local,{challengeDigest:DIGEST}));});
check('recovery-response-changed-payment-commitment-cannot-reuse-the-intent',async()=>{await refuse(local=>response(local,{paymentDigest:DIGEST}));});
check('recovery-response-changed-custody-capacity-cannot-reuse-the-intent',async()=>{
 await refuse(local=>response(local,{custodyPolicy:F({...local.responseObservation.custodyPolicy,maxRequests:99})}));
});
check('recovery-response-changed-custody-endpoint-cannot-reuse-the-intent',async()=>{
 await refuse(local=>response(local,{custodyPolicy:F({...local.responseObservation.custodyPolicy,serviceResourceUrl:'https://other.example/service-credit/v1/execute'})}));
});
check('recovery-response-missing-local-intent-withholds-local-bytes',async()=>{
 await refuse(local=>{const {dispatchIntent,...rest}=local;return F(rest);});
});
check('recovery-response-null-local-intent-withholds-local-bytes',async()=>{await refuse(local=>F({...local,dispatchIntent:null}));});
check('recovery-response-invalid-intent-checksum-withholds-local-bytes',async()=>{await refuse(local=>intent(local,{checksum:DIGEST}));});
check('recovery-response-valid-foreign-intent-under-the-same-key-is-refused',async()=>{
 await refuse(local=>{
  const request=JSON.parse(local.original.originalRequestJson);request.maxCostUnits++;
  const original=captureOriginalServiceRequestCustody({originalRequestJson:JSON.stringify(request),originalBodyBase64:'',serviceResourceUrl:local.original.serviceResourceUrl},
   {fundingResourceUrl:local.funding.fundingResourceUrl,paymentHash:local.funding.paymentHash,network:local.funding.network});
  const dispatchIntent=captureOriginalServiceDispatchIntent(original,{fundingRevision:local.funding.revision,
   challengeDigest:local.responseObservation.challengeDigest,paymentDigest:local.responseObservation.paymentDigest,custodyPolicy:local.responseObservation.custodyPolicy});
  assert.equal(dispatchIntent.requestId,local.dispatchIntent.requestId);assert.notEqual(dispatchIntent.originalChecksum,local.dispatchIntent.originalChecksum);
  return F({...local,dispatchIntent});
 });
});
check('recovery-response-original-digest-accessor-is-not-entered',async()=>{
 let hooks=0;await refuse(local=>{const next={...local.responseObservation};Object.defineProperty(next,'originalDigest',{enumerable:true,get(){hooks++;throw Error('declared getter');}});return F({...local,responseObservation:F(next)});});
 assert.equal(hooks,0);
});
check('recovery-response-intent-digest-accessor-is-not-entered',async()=>{
 let hooks=0;await refuse(local=>{const next={...local.responseObservation};Object.defineProperty(next,'dispatchIntentDigest',{enumerable:true,get(){hooks++;throw Error('declared getter');}});return F({...local,responseObservation:F(next)});});
 assert.equal(hooks,0);
});
check('recovery-response-intent-proxy-hooks-are-not-entered',async()=>{
 let hooks=0;await refuse(local=>F({...local,dispatchIntent:new Proxy(local.dispatchIntent,{get(){hooks++;throw Error('declared proxy');},ownKeys(){hooks++;throw Error('declared proxy');},getOwnPropertyDescriptor(){hooks++;throw Error('declared proxy');}})}));
 assert.equal(hooks,0);
});
check('recovery-response-custody-policy-proxy-hooks-are-not-entered',async()=>{
 let hooks=0;await refuse(local=>response(local,{custodyPolicy:new Proxy(local.responseObservation.custodyPolicy,{get(){hooks++;throw Error('declared proxy');},ownKeys(){hooks++;throw Error('declared proxy');},getOwnPropertyDescriptor(){hooks++;throw Error('declared proxy');}})}));
 assert.equal(hooks,0);
});
check('recovery-response-actual-read-owner-withholds-mismatch-and-closes-once',async()=>{
 const r=await fixture();r.local=response(r.local,{originalDigest:DIGEST});const before=JSON.stringify(r.model.exportState());
 await assert.rejects(r.run());assert.deepEqual([r.backendReads,r.payerCloseCalls,r.backendCloseCalls],[1,1,1]);
 assert.deepEqual(r.trace,['backend-open','payer-open','backend-read','payer-close','backend-close']);
 assert.equal(JSON.stringify(r.model.exportState()),before);assert.equal(r.originalCounts.executions,1);
});
check('recovery-response-coordinator-withholds-mismatch-without-requery',async()=>{
 const r=await fixture();r.local=response(r.local,{dispatchIntentDigest:DIGEST});const before=JSON.stringify(r.model.exportState()),result=await r.coordinate();
 assert.equal(result.status,'CLOSE_UNKNOWN');assert.equal(result.exitCode,4);assert.equal(r.writes.length,0);
 assert.deepEqual([r.ownerReads,r.backendReads,r.payerCloseCalls,r.backendCloseCalls,r.channelCloses],[1,1,1,1,1]);
 assert.equal(JSON.stringify(r.model.exportState()),before);assert.deepEqual([r.originalCounts.funding,r.originalCounts.grants,r.originalCounts.executions],[1,1,1]);
});
check('recovery-response-backend-only-history-does-not-consume-local-intent',async()=>{
 const r=await fixture({missingResponse:true}),local={...r.local};let hooks=0;
 Object.defineProperty(local,'dispatchIntent',{enumerable:true,get(){hooks++;throw Error('unexpected intent');}});
 const result=project(F({...r.observation(),local:F(local)}),r.manifest());
 assert.equal(result.resultAvailable,true);assert.equal(result.responseJson,null);assert.equal(result.source,'BACKEND_CACHE');
 assert.equal(result.localReconciliationRequired,true);assert.equal(hooks,0);noAuthority(result);
});
check('recovery-response-unknown-backend-does-not-consume-local-response',async()=>{
 const r=await fixture({backendStatus:'OUTCOME_UNKNOWN'}),local={...r.local};let hooks=0;
 Object.defineProperty(local,'responseObservation',{enumerable:true,get(){hooks++;throw Error('unexpected response');}});
 const result=project(F({...r.observation(),local:F(local)}),r.manifest());
 assert.equal(result.resultAvailable,false);assert.equal(result.responseJson,null);assert.equal(result.cachedResult,null);
 assert.equal(result.localReconciliationRequired,true);assert.equal(hooks,0);noAuthority(result);
});
check('recovery-response-full-reference-grant-is-read-without-another-debit-or-execution',async()=>{
 const r=await fixture({fullGrant:true}),before=JSON.stringify(r.model.exportState()),result=await r.run();
 assert.deepEqual([r.originalCounts.funding,r.originalCounts.grants,r.originalCounts.executions],[1,1,100]);
 assert.equal(result.resultAvailable,true);assert.equal(result.responseJson,r.local.responseObservation.responseJson);noAuthority(result);
 assert.equal(JSON.stringify(r.model.exportState()),before);assert.deepEqual([r.backendReads,r.payerCloseCalls,r.backendCloseCalls],[1,1,1]);
});

export const recoveryResponseProvenanceDataCases=F([...checks]);
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const cases=[];let current=null,reported=false;
 function report(){
  if(reported)return;reported=true;const failed=cases.filter(c=>c.status!=='PASS').length;
  console.log(JSON.stringify({qualification:'G1_G2_RECOVERY_RESPONSE_PROVENANCE_DATA',passed:cases.length-failed,failed,cases,
   actualProductReferenceReadOwnerAndCoordinator:true,sharedPureOriginalIntentBinding:true,declaredMemoryPorts:true,componentCooperativeTimers:true,
   nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
   nativeReaderBypass:'NOT_ESTABLISHED',nativeReopen:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED',G0G5Acceptance:'OPEN'}));
  if(failed)process.exitCode=1;
 }
 process.once('beforeExit',()=>{if(cases.length!==checks.length){cases.push({id:current??'incomplete',status:'FAIL',error:'UNSETTLED_DATA_PROMISE'});report();process.exitCode=1;}});
 for(const c of checks){current=c.id;try{await c.run();cases.push({id:c.id,status:'PASS'});}catch{cases.push({id:c.id,status:'FAIL',error:'DATA_ASSERTION'});}}
 report();
}
