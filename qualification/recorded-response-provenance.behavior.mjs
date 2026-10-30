import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { recordedResultFixture as fixture } from './api-credit-recorded-result.fixture.mjs';
import { closeApiCreditOperatorDataFixtures } from './api-credit-operator.behavior.mjs';
import { captureOriginalServiceRequestCustody, captureOriginalServiceDispatchIntent,
 serializeOriginalServiceRequestCustody, serializeOriginalServiceDispatchIntent } from '../src/service-credit-original-request-custody-contract.js';

// Actual product, lifecycle, byte contracts and reference ledger; history/file,
// funding, grant activation and native children remain declared memory ports.
const F=Object.freeze,checks=[];
const check=(id,run)=>checks.push({id,run});
const digest='sha256:'+'f'.repeat(64);
async function ready(){const r=fixture();await r.start();return r;}
function response(v,changes){return F({...v,responseObservation:F({...v.responseObservation,...changes})});}
function intent(v,changes){return F({...v,dispatchIntent:F({...v.dispatchIntent,...changes})});}
function omit(v,key){const next={...v.responseObservation};delete next[key];return F({...v,responseObservation:F(next)});}
async function refuse(edit,{afterFirstDispatch=false}={}){
 const r=await ready(),input=r.request();
 try{
  if(!afterFirstDispatch)await r.root.submitOriginal(input);
  const state=JSON.stringify(r.h.model.exportState()),payment=r.h.raw();
  r.onRead=v=>v===null?null:edit(v);
  await assert.rejects(r.root.submitOriginal(input));
  assert.deepEqual([r.submissions,r.reserves,r.begins,r.completes],[1,1,1,1]);
  assert.equal(r.h.raw(),payment);
  if(!afterFirstDispatch)assert.equal(JSON.stringify(r.h.model.exportState()),state);
  assert.equal(r.root.inspect().recordedServiceResults.held,true);
  const reads=r.reads;
  await assert.rejects(r.root.submitOriginal(r.request('next')));
  assert.equal(r.reads,reads);assert.equal(r.submissions,1);
 }finally{await r.cleanup();}
}
check('response-provenance-normal-fresh-calls-and-exact-replay-preserve-one-funding',async()=>{
 const r=await ready();try{
  const a=r.request(),first=await r.root.submitOriginal(a),v=r.records.get(a.requestId);
  assert.equal(serializeOriginalServiceRequestCustody(v.original).length>0,true);
  assert.equal(serializeOriginalServiceDispatchIntent(v.dispatchIntent).length>0,true);
  assert.equal(Object.keys(v.responseObservation).length,23);
  const before=JSON.stringify(r.h.model.exportState()),payment=r.h.raw(),replay=await r.root.submitOriginal({...a});
  assert.equal(replay.responseJson,first.responseJson);assert.equal(replay.replayed,true);
  assert.equal(JSON.stringify(r.h.model.exportState()),before);assert.equal(r.h.raw(),payment);
  const second=await r.root.submitOriginal(r.request('second'));
  assert.equal(second.replayed,false);assert.equal(second.resultCode,'api.second');
  assert.deepEqual([r.h.counts.funding,r.h.counts.grants,r.submissions,r.reserves,r.begins,r.completes],[1,1,2,2,2,2]);
 }finally{await r.cleanup();}
});
check('response-provenance-valid-intent-for-a-different-original-under-the-same-key-is-refused',async()=>{
 await refuse(v=>{
  const request=JSON.parse(v.original.originalRequestJson);request.maxCostUnits++;
  const original=captureOriginalServiceRequestCustody({originalRequestJson:JSON.stringify(request),originalBodyBase64:'',serviceResourceUrl:v.original.serviceResourceUrl},
   {fundingResourceUrl:v.funding.fundingResourceUrl,paymentHash:v.funding.paymentHash,network:v.funding.network});
  const dispatchIntent=captureOriginalServiceDispatchIntent(original,{fundingRevision:v.funding.revision,
   challengeDigest:v.responseObservation.challengeDigest,paymentDigest:v.responseObservation.paymentDigest,custodyPolicy:v.responseObservation.custodyPolicy});
  assert.equal(dispatchIntent.grantId,v.dispatchIntent.grantId);assert.equal(dispatchIntent.requestId,v.dispatchIntent.requestId);
  assert.notEqual(dispatchIntent.originalChecksum,v.dispatchIntent.originalChecksum);
  return F({...v,dispatchIntent});
 });
});
check('response-provenance-invalid-intent-checksum-is-refused',async()=>{await refuse(v=>intent(v,{checksum:digest}));});
check('response-provenance-unsupported-intent-version-is-refused',async()=>{await refuse(v=>intent(v,{intentVersion:2}));});
check('response-provenance-foreign-intent-state-is-refused',async()=>{await refuse(v=>intent(v,{state:'UNCOMMITTED'}));});
check('response-provenance-foreign-intent-profile-is-refused',async()=>{await refuse(v=>intent(v,{profile:'foreign'}));});
check('response-provenance-missing-response-original-digest-is-refused',async()=>{await refuse(v=>omit(v,'originalDigest'));});
check('response-provenance-changed-response-original-digest-is-refused',async()=>{await refuse(v=>response(v,{originalDigest:digest}));});
check('response-provenance-missing-response-intent-digest-is-refused',async()=>{await refuse(v=>omit(v,'dispatchIntentDigest'));});
check('response-provenance-changed-response-intent-digest-is-refused',async()=>{await refuse(v=>response(v,{dispatchIntentDigest:digest}));});
check('response-provenance-changed-challenge-commitment-is-refused',async()=>{await refuse(v=>response(v,{challengeDigest:digest}));});
check('response-provenance-changed-payment-commitment-is-refused',async()=>{await refuse(v=>response(v,{paymentDigest:digest}));});
check('response-provenance-changed-custody-capacity-is-refused',async()=>{
 await refuse(v=>response(v,{custodyPolicy:F({...v.responseObservation.custodyPolicy,maxRequests:129})}));
});
check('response-provenance-changed-custody-endpoint-is-refused',async()=>{
 await refuse(v=>response(v,{custodyPolicy:F({...v.responseObservation.custodyPolicy,serviceResourceUrl:v.original.serviceResourceUrl+'/other'})}));
});
check('response-provenance-corrupt-retained-original-checksum-is-refused',async()=>{
 await refuse(v=>F({...v,original:F({...v.original,checksum:digest})}));
});
check('response-provenance-response-digest-accessor-is-not-entered',async()=>{
 let hooks=0;await refuse(v=>{
  const r={...v.responseObservation};Object.defineProperty(r,'originalDigest',{enumerable:true,get(){hooks++;throw Error('unselected');}});
  return F({...v,responseObservation:F(r)});
 });assert.equal(hooks,0);
});
check('response-provenance-custody-policy-proxy-hooks-are-not-entered',async()=>{
 let hooks=0;await refuse(v=>response(v,{custodyPolicy:new Proxy(v.responseObservation.custodyPolicy,{
  get(){hooks++;throw Error('unselected');},ownKeys(){hooks++;throw Error('unselected');},getPrototypeOf(){hooks++;throw Error('unselected');}})}));assert.equal(hooks,0);
});
check('response-provenance-intent-checksum-accessor-is-not-entered',async()=>{
 let hooks=0;await refuse(v=>{
  const next={...v.dispatchIntent};Object.defineProperty(next,'checksum',{enumerable:true,get(){hooks++;throw Error('unselected');}});
  return F({...v,dispatchIntent:F(next)});
 });assert.equal(hooks,0);
});
check('response-provenance-first-dispatch-with-a-mismatched-record-withholds-result-without-resend',async()=>{
 await refuse(v=>response(v,{dispatchIntentDigest:digest}),{afterFirstDispatch:true});
});
check('response-provenance-input-conflict-keeps-the-unchanged-original-replay-available',async()=>{
 const r=await ready();try{
  const input=r.request(),first=await r.root.submitOriginal(input);
  await assert.rejects(r.root.submitOriginal(r.request('request.1',{maxCostUnits:2})));
  assert.equal(r.root.inspect().recordedServiceResults.held,false);
  assert.equal((await r.root.submitOriginal(input)).responseJson,first.responseJson);assert.equal(r.submissions,1);
 }finally{await r.cleanup();}
});
check('response-provenance-unknown-history-does-not-consume-response-commitments',async()=>{
 let hooks=0;await refuse(v=>{
  const r={...v.responseObservation};Object.defineProperty(r,'originalDigest',{enumerable:true,get(){hooks++;throw Error('unselected');}});
  return F({...v,uncertainty:F({...v.uncertainty,submission:true}),responseObservation:F(r)});
 });assert.equal(hooks,0);
});
check('response-provenance-extra-intent-authority-field-is-refused',async()=>{await refuse(v=>intent(v,{mayDispatchService:true}));});

export const recordedResponseProvenanceDataCases=F(checks.map(c=>F(c)));
if(typeof process.argv[1]==='string'&&fileURLToPath(import.meta.url)===process.argv[1]){
 const cases=[];for(const{id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??e)});}}
 await closeApiCreditOperatorDataFixtures();const failed=cases.filter(c=>c.status!=='PASS').length;
 console.log(JSON.stringify({qualification:'G1_RECORDED_RESPONSE_PROVENANCE_DATA',passed:cases.length-failed,failed,cases,
  actualProductLifecycleAndOriginalIntentByteContracts:true,declaredMemoryHistoryFileFundingAndNativePortsOnly:true,
  nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
  nativeAdaptersExecuted:false,nativePersistence:'NOT_ESTABLISHED',fullG1:'NOT_ESTABLISHED',fullG2:'NOT_ESTABLISHED'}));
 if(failed)process.exitCode=1;
}
