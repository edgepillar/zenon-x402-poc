// Real result projection, request/execution contracts and reference ledger.
// All file, SQL, proof, epoch and channel capabilities remain declared DATA.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resultInspectionFixture as fixture } from './api-credit-recorded-result-inspection.fixture.mjs';
import { captureApiCreditRecordedResultInspection as project } from '../src/api-credit-recorded-result-inspection.js';

const F=Object.freeze,checks=[];
const check=(id,run)=>checks.push({id,run});
function execution(v,patch){return F({...v,backend:F({...v.backend,execution:F({...v.backend.execution,...patch})})});}
function caches(v,cached){return F({...v,backend:F({...v.backend,cachedResult:cached,originalRequest:F({...v.backend.originalRequest,cachedResult:cached})})});}
function commitment(cached,domain='zenon-x402:service-credit-sqlite-result-v1\0'){
 return 'sha256:'+createHash('sha256').update(domain).update(JSON.stringify({contentType:cached.contentType,resultCode:cached.resultCode,statusCode:cached.statusCode})).digest('hex');
}
async function refuse(edit){
 const r=await fixture({missingResponse:true}),before=JSON.stringify(r.model.exportState()),observed=r.observation();
 assert.throws(()=>project(edit(observed),r.manifest()));
 assert.equal(JSON.stringify(r.model.exportState()),before);
 assert.deepEqual([r.originalCounts.funding,r.originalCounts.grants,r.originalCounts.executions],[1,1,1]);
 assert.equal(r.backendReads+r.payerCloseCalls+r.backendCloseCalls,0);
}
check('result-commitment-original-cache-and-execution-preserve-exact-local-response',async()=>{
 const r=await fixture(),before=JSON.stringify(r.model.exportState()),observed=r.observation();
 assert.equal(observed.backend.execution.resultCommitment,commitment(observed.backend.cachedResult));
 const out=await r.run();assert.equal(out.source,'LOCAL_RESPONSE_AND_BACKEND_CACHE');assert.equal(out.responseJson,r.local.responseObservation.responseJson);
 assert.equal(out.resultAvailable,true);assert.equal(out.authority,'NONE');assert.equal(out.mayDispatchService,false);
 assert.equal(JSON.stringify(r.model.exportState()),before);assert.equal(r.backendReads,1);
});
check('result-commitment-agreeing-cache-copies-cannot-replace-the-executed-result',async()=>{
 await refuse(v=>{
  const next=caches(v,F({...v.backend.cachedResult,resultCode:'different.result'}));
  assert.deepEqual(next.backend.cachedResult,next.backend.originalRequest.cachedResult);
  assert.equal(next.backend.execution.terminalClassification,'SUCCEEDED');
  assert.notEqual(commitment(next.backend.cachedResult),next.backend.execution.resultCommitment);return next;
 });
});
check('result-commitment-foreign-terminal-commitment-withholds-cache',async()=>{await refuse(v=>execution(v,{resultCommitment:'sha256:'+'f'.repeat(64)}));});
check('result-commitment-null-terminal-commitment-withholds-cache',async()=>{await refuse(v=>execution(v,{resultCommitment:null}));});
check('result-commitment-missing-terminal-commitment-withholds-cache',async()=>{
 await refuse(v=>{const{resultCommitment,...rest}=v.backend.execution;return F({...v,backend:F({...v.backend,execution:F(rest)})});});
});
check('result-commitment-bare-digest-is-not-the-versioned-commitment',async()=>{await refuse(v=>execution(v,{resultCommitment:v.backend.execution.resultCommitment.slice(7)}));});
check('result-commitment-uppercase-digest-is-refused',async()=>{await refuse(v=>execution(v,{resultCommitment:v.backend.execution.resultCommitment.toUpperCase()}));});
check('result-commitment-domain-separator-is-required',async()=>{await refuse(v=>execution(v,{resultCommitment:commitment(v.backend.cachedResult,'zenon-x402:service-credit-sqlite-result-v1')}));});
check('result-commitment-other-domain-is-refused',async()=>{await refuse(v=>execution(v,{resultCommitment:commitment(v.backend.cachedResult,'zenon-x402:service-credit-sqlite-result-v2\0')}));});
check('result-commitment-accessor-is-refused-without-getter-entry',async()=>{
 let getters=0;await refuse(v=>{const e={...v.backend.execution};Object.defineProperty(e,'resultCommitment',{enumerable:true,get(){getters++;throw Error('unselected');}});
  return F({...v,backend:F({...v.backend,execution:F(e)})});});assert.equal(getters,0);
});
check('result-commitment-proxy-is-refused-without-proxy-entry',async()=>{
 let hooks=0;await refuse(v=>execution(v,{resultCommitment:new Proxy(F({}),{get(){hooks++;throw Error('unselected');}})}));assert.equal(hooks,0);
});
check('result-commitment-cache-property-order-preserves-the-canonical-binding',async()=>{
 const r=await fixture({missingResponse:true}),v=r.observation(),c=v.backend.cachedResult;
 const out=project(caches(v,F({resultCode:c.resultCode,statusCode:c.statusCode,contentType:c.contentType})),r.manifest());
 assert.equal(out.resultAvailable,true);assert.equal(out.source,'BACKEND_CACHE');assert.equal(out.responseJson,null);assert.equal(out.mayDispatchService,false);
});
check('result-commitment-fixed-vector-matches-the-v1-store-byte-contract',async()=>{
 const r=await fixture({missingResponse:true}),c=F({statusCode:200,contentType:'application/json',resultCode:'fixed.vector'});
 const expected='sha256:7903d7a3ab8b7c4b2e34aabc8684023d8b0c1cfd609c9b081e1edee5eec1f5ba';assert.equal(commitment(c),expected);
 const out=project(execution(caches(r.observation(),c),{resultCommitment:expected}),r.manifest());
 assert.equal(out.cachedResult.resultCode,'fixed.vector');assert.equal(out.responseJson,null);assert.equal(out.currentAuthority,'NOT_ESTABLISHED');
});
check('result-commitment-unknown-history-does-not-consume-a-late-commitment',async()=>{
 const r=await fixture({backendStatus:'OUTCOME_UNKNOWN'}),v=r.observation();let getters=0;const e={...v.backend.execution};
 Object.defineProperty(e,'resultCommitment',{enumerable:true,get(){getters++;throw Error('unselected');}});
 const out=project(F({...v,backend:F({...v.backend,execution:F(e)})}),r.manifest());
 assert.equal(out.resultAvailable,false);assert.equal(out.cachedResult,null);assert.equal(out.responseJson,null);assert.equal(getters,0);
});
check('result-commitment-absent-local-response-still-needs-the-original-commitment',async()=>{
 const r=await fixture({missingResponse:true}),out=await r.run();assert.equal(out.resultAvailable,true);assert.equal(out.source,'BACKEND_CACHE');
 assert.equal(out.responseJson,null);assert.equal(out.localReconciliationRequired,true);assert.equal(out.deliveryConfirmed,false);
});
check('result-commitment-owner-withholds-history-and-closes-the-original-readers-once',async()=>{
 const r=await fixture({missingResponse:true,outcome:b=>F({...b,execution:F({...b.execution,resultCommitment:null})})}),before=JSON.stringify(r.model.exportState());
 await assert.rejects(r.run());assert.equal(r.backendReads,1);assert.equal(r.payerCloseCalls,1);assert.equal(r.backendCloseCalls,1);
 assert.deepEqual(r.trace,['backend-open','payer-open','backend-read','payer-close','backend-close']);assert.equal(JSON.stringify(r.model.exportState()),before);
 assert.deepEqual([r.originalCounts.funding,r.originalCounts.grants,r.originalCounts.executions],[1,1,1]);
});
check('result-commitment-coordinator-emits-no-result-and-never-requeries-or-redispatches',async()=>{
 const r=await fixture({missingResponse:true,outcome:b=>F({...b,execution:F({...b.execution,resultCommitment:null})})}),before=JSON.stringify(r.model.exportState());
 const out=await r.coordinate();assert.equal(out.status,'CLOSE_UNKNOWN');assert.equal(out.exitCode,4);assert.equal(r.writes.length,0);
 assert.equal(r.backendReads,1);assert.equal(r.ownerReads,1);assert.equal(r.payerCloseCalls,1);assert.equal(r.backendCloseCalls,1);assert.equal(r.channelCloses,1);
 assert.equal(JSON.stringify(r.model.exportState()),before);assert.equal(out.authority,'NONE');assert.equal(out.mayStartPayment,false);
});
check('result-commitment-one-funding-full-grant-history-is-read-without-new-debits',async()=>{
 const r=await fixture({fullGrant:true}),before=JSON.stringify(r.model.exportState()),out=await r.run();
 assert.equal(out.resultAvailable,true);assert.equal(out.responseJson,r.local.responseObservation.responseJson);
 assert.deepEqual([r.originalCounts.funding,r.originalCounts.grants,r.originalCounts.executions],[1,1,100]);
 assert.equal(JSON.stringify(r.model.exportState()),before);assert.equal(r.backendReads,1);assert.equal(out.mayDispatchService,false);
});

export const recordedResultCommitmentDataCases=F(checks.map(c=>F(c)));
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const cases=[];for(const{id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??e)});}}
 const failed=cases.filter(c=>c.status!=='PASS').length;
 console.log(JSON.stringify({qualification:'G1_G2_RECORDED_RESULT_COMMITMENT_DATA',passed:cases.length-failed,failed,cases,
  declaredMemoryFileSqlProofEpochAndChannelPortsOnly:true,nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
  nativeDurability:'NOT_ESTABLISHED',nativeProofAuthentication:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED'}));
 if(failed)process.exitCode=1;
}
