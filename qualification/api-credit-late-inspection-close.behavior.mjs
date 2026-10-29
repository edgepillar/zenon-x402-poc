// Actual product/reference reconstruction, combined read core, inspection owner
// and coordinator. SQL/proof/file/epoch/channel/clock ports are declared DATA.
// No native release, process restart or OS deadline is established here.
import assert from 'node:assert/strict';
import { resultInspectionFixture as fixture, deferred } from './api-credit-recorded-result-inspection.fixture.mjs';
import { runApiCreditRecordedResultInspectionCoordinator as coordinate } from '../src/api-credit-recovery-inspection-coordinator.js';
import { consumeApiCreditRecoveryInspectionProfile as consume } from '../src/api-credit-recovery-inspection-profile.js';

const F=Object.freeze,checks=[];
function check(id,run){checks.push({id,run});}
async function flush(){for(let i=0;i<48;i++)await Promise.resolve();}
function state(r){return {model:JSON.stringify(r.model.exportState()),local:JSON.stringify(r.local),checkpoint:r.packet.serializedCheckpoint,pins:JSON.stringify(r.packet.expectedPins)};}
function preserved(r,before){assert.deepEqual(state(r),before);assert.equal(r.originalCounts.funding,1);assert.equal(r.originalCounts.grants,1);}
function unknown(v){assert.equal(v.status,'CLOSE_UNKNOWN');assert.equal(v.exitCode,4);assert.equal(Object.isFrozen(v),true);
 assert.equal(v.authority,'NONE');assert.equal(v.automaticRetry,false);assert.equal(v.nativeResourceRelease,'NOT_ESTABLISHED');
 for(const k of ['mayStartPayment','maySignPayment','mayDispatchService'])assert.equal(v[k],false);}
function start(r,{channelStop}={}){
 const p=r.coordinatorPorts;r.inspectionSettled=false;r.inspectionFailed=false;r.inspectionValue=null;
 const ports=F({...p,inspectOriginal:F((profile,g)=>{
  r.enteredProfile=profile;const promise=p.inspectOriginal(profile,g);
  promise.then(value=>{r.inspectionSettled=true;r.inspectionValue=value;},()=>{r.inspectionSettled=true;r.inspectionFailed=true;});return promise;
 }),...(channelStop?{close:F(()=>{r.channelCloses++;return channelStop.promise;})}:{})});
 return coordinate({arguments:F({mode:'RECORDED_RESULT',recordedResultFd:3,outputFd:6,bootstrapMs:1000}),ports});
}
function expire(r){r.now=1000000000n;assert.equal(r.timers[0].budget,1000);r.timers[0].callback();}
function oneQuery(r){assert.equal(r.ownerReads,1);assert.equal(r.backendReads,1);assert.equal(r.localReads,2);assert.equal(r.checkpointReads,2);assert.equal(r.payerCloseCalls,1);}
function releasedProfile(r){assert.throws(()=>consume(r.enteredProfile));}

check('late-inspection-clean-payer-stop-is-joined-before-the-single-cache-output',async()=>{
 const stop=deferred(),r=await fixture({closePromise:stop.promise}),before=state(r),running=start(r);await flush();
 oneQuery(r);assert.equal(r.backendCloseCalls,0);assert.equal(r.inspectionSettled,false);assert.deepEqual(r.writes,[]);
 r.localClosed=true;stop.resolve(undefined);const value=await running;
 assert.equal(value.status,'CLOSED');assert.equal(value.exitCode,0);assert.equal(r.inspectionFailed,false);assert.equal(r.backendCloseCalls,1);assert.equal(r.channelCloses,1);
 assert.equal(r.writes.length,1);assert.equal(JSON.parse(r.writes[0]).requestId,r.key.requestId);releasedProfile(r);preserved(r,before);
});
check('late-inspection-expired-query-retains-the-borrowed-backend-until-its-original-payer-stop-completes',async()=>{
 const stop=deferred(),r=await fixture({closePromise:stop.promise}),before=state(r),running=start(r);await flush();oneQuery(r);expire(r);
 const value=await running,saved=JSON.stringify(value);unknown(value);assert.equal(value.stage,'INSPECTION');assert.equal(value.outputWriteObserved,false);
 assert.equal(r.inspectionSettled,false);assert.equal(r.backendCloseCalls,0);assert.equal(r.localClosed,false);assert.equal(r.channelCloses,1);assert.deepEqual(r.writes,[]);
 r.localClosed=true;stop.resolve(undefined);await flush();
 assert.equal(r.inspectionSettled,true);assert.equal(r.inspectionFailed,true);assert.equal(r.backendCloseCalls,1);assert.equal(r.channelCloses,1);assert.deepEqual(r.writes,[]);
 assert.equal(JSON.stringify(value),saved);oneQuery(r);releasedProfile(r);preserved(r,before);
});
check('late-inspection-rejected-payer-stop-retains-backend-without-a-competing-close-or-output',async()=>{
 const stop=deferred(),r=await fixture({closePromise:stop.promise}),before=state(r),running=start(r);await flush();expire(r);const value=await running;unknown(value);
 stop.reject(Error('declared late payer stop failure'));await flush();assert.equal(r.inspectionFailed,true);assert.equal(r.backendCloseCalls,0);assert.equal(r.channelCloses,1);
 assert.deepEqual(r.writes,[]);oneQuery(r);releasedProfile(r);preserved(r,before);
});
check('late-inspection-nonvoid-payer-stop-cannot-release-the-borrowed-backend-even-with-a-clean-looking-view',async()=>{
 const stop=deferred(),r=await fixture({closePromise:stop.promise}),before=state(r),running=start(r);await flush();expire(r);const value=await running;unknown(value);
 r.localClosed=true;stop.resolve(true);await flush();assert.equal(r.inspectionFailed,true);assert.equal(r.backendCloseCalls,0);assert.deepEqual(r.writes,[]);
 oneQuery(r);releasedProfile(r);preserved(r,before);
});
check('late-inspection-void-payer-stop-without-a-fresh-released-view-keeps-backend-held',async()=>{
 const stop=deferred(),r=await fixture({closePromise:stop.promise}),before=state(r),running=start(r);await flush();expire(r);const value=await running;unknown(value);
 stop.resolve(undefined);await flush();assert.equal(r.localClosed,false);assert.equal(r.inspectionFailed,true);assert.equal(r.backendCloseCalls,0);assert.deepEqual(r.writes,[]);
 oneQuery(r);releasedProfile(r);preserved(r,before);
});
check('late-inspection-known-payer-open-after-expiry-is-closed-once-without-querying-or-reopening',async()=>{
 const opened=deferred(),r=await fixture({openPromise:opened.promise}),before=state(r),running=start(r);await flush();
 assert.deepEqual(r.trace,['backend-open','payer-open']);assert.equal(r.payerCloseCalls,0);expire(r);const value=await running;unknown(value);assert.equal(r.backendCloseCalls,0);
 opened.resolve(r.payer);await flush();assert.equal(r.inspectionFailed,true);assert.equal(r.backendReads+r.localReads+r.checkpointReads,0);
 assert.equal(r.payerCloseCalls,1);assert.equal(r.backendCloseCalls,1);assert.equal(r.channelCloses,1);assert.deepEqual(r.writes,[]);releasedProfile(r);preserved(r,before);
});
check('late-inspection-rejected-unreturned-payer-open-does-not-invent-a-raw-backend-close',async()=>{
 const opened=deferred(),r=await fixture({openPromise:opened.promise}),before=state(r),running=start(r);await flush();expire(r);const value=await running;unknown(value);
 opened.reject(Error('declared unreturned owner'));await flush();assert.equal(r.inspectionFailed,true);assert.equal(r.backendReads+r.localReads+r.checkpointReads+r.payerCloseCalls+r.backendCloseCalls,0);
 assert.equal(r.ownerReads,1);assert.equal(r.channelCloses,1);assert.deepEqual(r.writes,[]);releasedProfile(r);preserved(r,before);
});
check('late-inspection-output-completion-after-expiry-cannot-change-unknown-or-repeat-the-query',async()=>{
 const written=deferred(),r=await fixture({write:()=>written.promise}),before=state(r),running=start(r);await flush();oneQuery(r);
 assert.equal(r.backendClosed,true);assert.equal(r.writes.length,1);expire(r);const value=await running,saved=JSON.stringify(value);unknown(value);
 assert.equal(value.stage,'OUTPUT');assert.equal(value.outputWriteObserved,false);written.resolve(undefined);await flush();
 assert.equal(JSON.stringify(value),saved);assert.equal(r.writes.length,1);assert.equal(r.backendCloseCalls,1);assert.equal(r.channelCloses,1);oneQuery(r);releasedProfile(r);preserved(r,before);
});
check('late-inspection-output-rejection-after-expiry-keeps-the-original-query-and-history',async()=>{
 const written=deferred(),r=await fixture({write:()=>written.promise}),before=state(r),running=start(r);await flush();expire(r);const value=await running;unknown(value);
 written.reject(Error('declared late output loss'));await flush();assert.equal(value.outputWriteObserved,false);assert.equal(r.writes.length,1);assert.equal(r.backendCloseCalls,1);
 assert.equal(r.channelCloses,1);oneQuery(r);releasedProfile(r);preserved(r,before);
});
check('late-inspection-channel-drain-expiry-is-not-upgraded-by-a-later-clean-channel-stop',async()=>{
 const stop=deferred(),r=await fixture(),before=state(r),running=start(r,{channelStop:stop});await flush();oneQuery(r);
 assert.equal(r.writes.length,1);assert.equal(r.backendCloseCalls,1);assert.equal(r.channelCloses,1);assert.equal(r.timers.length,2);
 r.now=1000000000n;r.timers[1].callback();const value=await running,saved=JSON.stringify(value);unknown(value);
 assert.equal(value.outputWriteObserved,true);assert.equal(value.channelClosedObserved,false);r.channelClosed=true;stop.resolve(undefined);await flush();
 assert.equal(JSON.stringify(value),saved);assert.equal(r.channelCloses,1);assert.equal(r.writes.length,1);releasedProfile(r);preserved(r,before);
});
check('late-inspection-nonvoid-channel-stop-cannot-become-success-or-retry-a-complete-query',async()=>{
 const stop=deferred(),r=await fixture(),before=state(r),running=start(r,{channelStop:stop});await flush();r.channelClosed=true;stop.resolve(true);
 const value=await running;unknown(value);assert.equal(value.outputWriteObserved,true);assert.equal(value.channelClosedObserved,false);
 assert.equal(r.channelCloses,1);assert.equal(r.backendCloseCalls,1);assert.equal(r.writes.length,1);oneQuery(r);releasedProfile(r);preserved(r,before);
});
check('late-inspection-exhausted-grant-and-lost-client-response-stay-unchanged-through-late-close',async()=>{
 const stop=deferred(),r=await fixture({fullGrant:true,missingResponse:true,closePromise:stop.promise}),before=state(r),running=start(r);await flush();expire(r);const value=await running;unknown(value);
 r.localClosed=true;stop.resolve(undefined);await flush();oneQuery(r);assert.equal(r.backendCloseCalls,1);assert.deepEqual(r.writes,[]);
 const grant=r.model.getGrant(r.key.grantId);assert.deepEqual([grant.availableUnits,grant.heldUnits,grant.consumedUnits],[0,0,100]);assert.equal(r.originalCounts.executions,100);
 assert.equal(r.local.uncertainty.submission,true);assert.equal(r.local.responseObservation,null);releasedProfile(r);preserved(r,before);
});

const cases=[];for(const{id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??e)});}}
const failed=cases.filter(c=>c.status!=='PASS').length;
console.log(JSON.stringify({qualification:'G2_LATE_INSPECTION_CLOSE_COMPOSITION_DATA',passed:cases.length-failed,failed,cases,
 actualProductReferenceCoreOwnerAndCoordinator:true,declaredSQLProofFileEpochChannelAndClockPortsOnly:true,cutpoints:'OBSERVED_PORT_ENTRY_AND_CONTROLLED_PROMISE_COMPLETION',randomSleep:false,
 nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
 nativeReopenAcceptance:'NOT_ESTABLISHED',nativeRelease:'NOT_ESTABLISHED',nativeLateCloseAcceptance:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED',fullG2:'NOT_ESTABLISHED'}));
if(failed)process.exitCode=1;
