// Actual inspection coordinator/codecs with declared channel and timer ports.
// Existing invalid signature-shaped transaction DATA is never signed or sent.
import assert from 'node:assert/strict';
import { retainedOriginalInputFixture } from './dynamic-plasma-retained-input.fixture.mjs';
import { assembleZenonDynamicPlasmaOriginalFundingDataV2 as assemble } from '../src/zenon/dynamic-plasma-original-funding-data.js';
import { canonicalJson } from '../src/canonical.js';
import { consumeApiCreditRecoveryInspectionProfile as consume, releaseApiCreditRecoveryInspectionProfile as release } from '../src/api-credit-recovery-inspection-profile.js';
import { captureServiceCreditRecoveryInspectionResult as redact } from '../src/service-credit-recovery-inspection-owner.js';
import { createApiCreditRecoveryInspectionCoordinator as createRecovery,
 createApiCreditSignerInspectionCoordinator as createSigner, createApiCreditRecordedResultInspectionCoordinator as createRecorded,
 createApiCreditFundingInspectionCoordinator as createFunding, createApiCreditOriginalGrantQueryCoordinator as createGrant,
 runApiCreditRecoveryInspectionCoordinator as legacy } from '../src/api-credit-recovery-inspection-coordinator.js';

const F=Object.freeze,checks=[];
const MODES=F([
 F({mode:'INSPECT',fd:'inspectionFd',create:createRecovery}),F({mode:'SIGNER_INSPECT',fd:'signerInspectionFd',create:createSigner}),
 F({mode:'RECORDED_RESULT',fd:'recordedResultFd',create:createRecorded}),F({mode:'FUNDING_INSPECT',fd:'fundingInspectionFd',create:createFunding}),
 F({mode:'ORIGINAL_GRANT_QUERY',fd:'originalGrantQueryFd',create:createGrant}),
]);
function check(id,run){checks.push({id,run});}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
async function drain(){for(let i=0;i<24;i++)await Promise.resolve();}
function profileText(){
 const f=retainedOriginalInputFixture(),packet=assemble(f.input,f.candidate,f.resourceUrl);
 return canonicalJson({recoveryInspectionVersion:1,selection:{originalPayment:{resourceUrl:f.resourceUrl,
  serializedCheckpoint:packet.serializedCheckpoint,expectedPins:packet.expectedPins},selectedGrantId:'grant.synthetic',paymentRequiredHeader:f.input.challenge.paymentRequiredHeader},
  payerOptions:{databasePath:'/synthetic/recovery-stop/payer.sqlite',allowedRoot:'/synthetic/recovery-stop',fundingResourceUrl:f.resourceUrl,
   custodyPolicy:{policyVersion:1,serviceResourceUrl:new URL(f.resourceUrl).origin+'/service-credit/v1/execute',maxRequests:128},selectedGrantId:'grant.synthetic',deadlineMs:500},
  backendOptions:{databasePath:'/synthetic/recovery-stop/backend.sqlite',limits:{busyTimeoutMs:20,maxStateBytes:65536,maxOffers:8,maxGrants:8,maxRequests:128}},
  requestKey:{grantId:'grant.synthetic',requestId:'request.original'},authorizationHeader:'ServiceCredit declared-original-proof'});
}
function observed(){return redact(F({status:'CACHED_SUCCESS',backend:F({status:'CACHED_SUCCESS'}),authority:'NONE',mayDispatchService:false,
 mayStartPayment:false,maySignPayment:false,deliveryConfirmed:false,serviceDelivery:'NOT_ESTABLISHED'}));}
function fixture(selected=MODES[0],options={}){
 const input=deferred(),inspection=deferred(),write=deferred();
 const s={now:0n,clocks:0,reads:0,inspections:0,writes:[],closes:0,closed:false,timers:[],profile:null,guard:null,joined:null};
 let controller;
 const ports=F({
  readProfile:F(g=>{s.reads++;g();return options.pendingInput?input.promise:Promise.resolve(profileText());}),
  inspectOriginal:F((profile,g)=>{g();s.inspections++;s.profile=profile;s.guard=g;consume(profile);
   if(options.pendingInspection)return inspection.promise.finally(()=>release(profile));
   release(profile);return Promise.resolve(observed());}),
  writeResult:F((line,g)=>{g();s.writes.push(line);return options.pendingWrite?write.promise:Promise.resolve(undefined);}),
  close:F(()=>{s.closes++;s.closed=true;return Promise.resolve(undefined);}),
  inspect:F(()=>F({lifecycle:s.closed?'CLOSED':'OPEN',held:false,reading:false,writing:false})),
  clock:F(()=>{s.clocks++;if(options.clockHook)options.clockHook(s,controller);return s.now;}),
  armTimer:F((budget,callback)=>{const token={budget,callback,cancels:0,afterClose:s.closes!==0};s.timers.push(token);
   if(options.armHook)options.armHook(s,controller,token);return token;}),
  cancelTimer:F(token=>{token.cancels++;if(options.cancelHook)options.cancelHook(s,controller,token);}),
 });
 const configuration=F({arguments:F({mode:selected.mode,[selected.fd]:3,outputFd:6,bootstrapMs:1000}),ports});
 controller=selected.create(configuration);return{s,controller,configuration,input,inspection,write};
}
function unknown(result,f){
 assert.equal(result.status,'CLOSE_UNKNOWN');assert.equal(result.exitCode,4);assert.equal(result.authority,'NONE');
 assert.equal(result.mayDispatchService,false);assert.equal(result.mayStartPayment,false);assert.equal(result.maySignPayment,false);
 assert.equal(result.automaticRetry,false);assert.equal(result.nativeResourceRelease,'NOT_ESTABLISHED');assert.equal(f.s.closes,1);
 assert.ok(f.s.timers.every(t=>t.cancels===1));
}

check('inspection-stop-all-five-factories-are-inert-and-expose-only-run-and-stop',()=>{
 for(const m of MODES){const f=fixture(m);assert.deepEqual(Reflect.ownKeys(f.controller),['run','requestStop']);
  assert.equal(Object.isFrozen(f.controller),true);assert.equal(Object.isFrozen(f.controller.run),true);assert.equal(Object.isFrozen(f.controller.requestStop),true);
  assert.deepEqual([f.s.clocks,f.s.reads,f.s.inspections,f.s.writes.length,f.s.closes,f.s.timers.length],[0,0,0,0,0,0]);}
});
check('inspection-stop-cached-run-retains-the-legacy-clean-output-and-single-close',async()=>{
 const f=fixture(),first=f.controller.run();assert.equal(f.controller.run(),first);const value=await first;
 const prior=fixture(),before=await legacy(prior.configuration);assert.deepEqual(value,before);
 assert.deepEqual(f.s.writes,prior.s.writes);assert.equal(value.status,'CLOSED');assert.equal(value.exitCode,0);
 assert.deepEqual([f.s.reads,f.s.inspections,f.s.writes.length,f.s.closes],[1,1,1,1]);assert.equal(f.controller.run(),first);
});
check('inspection-stop-clock-reentry-joins-the-run-reserved-before-any-port',async()=>{
 const f=fixture(MODES[0],{clockHook(s,c){if(s.joined===null)s.joined=c.run();}}),first=f.controller.run();
 assert.equal(f.s.joined,first);assert.equal((await first).status,'CLOSED');assert.deepEqual([f.s.reads,f.s.inspections,f.s.closes],[1,1,1]);
});
check('inspection-stop-wrong-method-arity-does-not-consume-the-run-or-request-stop',async()=>{
 const f=fixture();assert.throws(()=>f.controller.run(1));assert.throws(()=>f.controller.requestStop(1));
 assert.deepEqual([f.s.clocks,f.s.reads,f.s.closes],[0,0,0]);assert.equal((await f.controller.run()).status,'CLOSED');
 for(const m of MODES)assert.throws(()=>m.create(f.configuration,{}));
});
check('inspection-stop-after-terminal-clean-result-keeps-its-historical-receipt',async()=>{
 const f=fixture(),p=f.controller.run(),value=await p,counts=[f.s.reads,f.s.inspections,f.s.writes.length,f.s.closes,f.s.timers.length];
 assert.equal(f.controller.requestStop(),undefined);assert.equal(f.controller.requestStop(),undefined);await drain();
 assert.equal(f.controller.run(),p);assert.equal(await p,value);assert.equal(value.status,'CLOSED');assert.equal(Object.isFrozen(value),true);
 assert.deepEqual([f.s.reads,f.s.inspections,f.s.writes.length,f.s.closes,f.s.timers.length],counts);
});
for(const m of MODES){
 check('inspection-stop-before-input-'+m.mode.toLowerCase(),async()=>{
  const f=fixture(m);assert.equal(f.controller.requestStop(),undefined);const p=f.controller.run();assert.equal(f.controller.run(),p);
  const value=await p;unknown(value,f);assert.deepEqual([f.s.reads,f.s.inspections,f.s.writes.length],[0,0,0]);
  assert.ok(f.s.timers.every(t=>t.afterClose));f.controller.requestStop();assert.equal(f.s.closes,1);
 });
}
for(const m of MODES){
 check('inspection-stop-pending-profile-'+m.mode.toLowerCase(),async()=>{
  const f=fixture(m,{pendingInput:true}),p=f.controller.run();await drain();assert.equal(f.s.reads,1);
  f.controller.requestStop();const value=await p;unknown(value,f);assert.deepEqual([f.s.inspections,f.s.writes.length],[0,0]);
  f.input.resolve(profileText());await drain();assert.equal(await p,value);assert.deepEqual([f.s.reads,f.s.inspections,f.s.writes.length,f.s.closes],[1,0,0,1]);
 });
}
check('inspection-stop-during-first-clock-refuses-startup-timer-and-profile-entry',async()=>{
 let stopped=false;const f=fixture(MODES[0],{clockHook(s,c){if(!stopped){stopped=true;c.requestStop();}}});
 unknown(await f.controller.run(),f);assert.equal(f.s.reads,0);assert.ok(f.s.timers.every(t=>t.afterClose));
});
check('inspection-stop-during-timer-arm-retires-the-returned-handle-once',async()=>{
 let stopped=false;const f=fixture(MODES[0],{armHook(s,c,t){if(!stopped&&!t.afterClose){stopped=true;c.requestStop();}}});
 unknown(await f.controller.run(),f);assert.equal(f.s.reads,0);assert.equal(f.s.timers.filter(t=>!t.afterClose).length,1);
 assert.equal(f.s.timers[0].cancels,1);
});
check('inspection-stop-pending-original-inspection-revokes-guard-and-ignores-late-success',async()=>{
 const f=fixture(MODES[0],{pendingInspection:true}),p=f.controller.run();await drain();assert.equal(f.s.inspections,1);
 f.controller.requestStop();assert.throws(()=>f.s.guard());const value=await p;unknown(value,f);assert.equal(f.s.writes.length,0);
 f.inspection.resolve(observed());await drain();assert.equal(await p,value);assert.deepEqual([f.s.reads,f.s.inspections,f.s.writes.length,f.s.closes],[1,1,0,1]);
});
check('inspection-stop-pending-output-never-repeats-the-write-or-upgrades-unknown',async()=>{
 const f=fixture(MODES[0],{pendingWrite:true}),p=f.controller.run();await drain();assert.equal(f.s.writes.length,1);
 f.controller.requestStop();const value=await p;unknown(value,f);assert.equal(value.outputWriteObserved,false);
 f.write.resolve(undefined);await drain();assert.equal(await p,value);assert.equal(f.s.writes.length,1);assert.equal(f.s.closes,1);
});
check('inspection-stop-during-startup-timer-retirement-keeps-one-absolute-close-window',async()=>{
 let stopped=false;const f=fixture(MODES[0],{cancelHook(s,c,t){if(!stopped&&!t.afterClose){stopped=true;s.now+=500000000n;c.requestStop();}}});
 const value=await f.controller.run();unknown(value,f);assert.equal(value.outputWriteObserved,true);
 assert.equal(f.s.timers.filter(t=>t.afterClose).length,1);assert.ok(f.s.timers.find(t=>t.afterClose).budget<=500);
 assert.equal(f.s.inspections,1);assert.equal(f.s.writes.length,1);
});

const cases=[];
for(const{id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??e)});}}
const failed=cases.filter(c=>c.status!=='PASS').length;
console.log(JSON.stringify({qualification:'G2_RECOVERY_INSPECTION_STOP_DATA',passed:cases.length-failed,failed,cases,
 actualInspectionCoordinatorAndCodecs:true,channelInspectionAndTimers:'DECLARED_MEMORY_PORTS_ONLY',
 actualSignals:0,nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
 nativePhysicalRelease:'NOT_ESTABLISHED',freshProcessAcceptance:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED',G0G5Acceptance:'OPEN'}));
if(failed)process.exitCode=1;
