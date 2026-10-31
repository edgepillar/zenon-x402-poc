// Actual product writes, reference-model reconstruction, combined V6 read core,
// owner and coordinator. SQL/proof/file/epoch/channel ports are declared DATA.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { recordedResultFixture } from './api-credit-recorded-result.fixture.mjs';
import { InMemoryServiceCreditModel } from '../src/service-credit-model.js';
import { createServiceCreditExecutionContract, prepareServiceCreditExecution, fenceServiceCreditExecution,
 completeServiceCreditExecution } from '../src/service-credit-execution-contract.js';
import { canonicalJson } from '../src/canonical.js';
import { restoreOriginalPaymentCheckpoint } from '../src/service-credit-pilot-original-payment-checkpoint.js';
import { createServiceCreditCustodiedBackendRecoveryCore } from '../src/service-credit-custodied-backend-recovery-core.js';
import { decodeApiCreditRecoveryInspectionProfile, consumeApiCreditRecoveryInspectionProfile,
 releaseApiCreditRecoveryInspectionProfile } from '../src/api-credit-recovery-inspection-profile.js';
import { runServiceCreditRecordedResultInspectionOwner } from '../src/service-credit-recovery-inspection-owner.js';
import { runApiCreditRecordedResultInspectionCoordinator } from '../src/api-credit-recovery-inspection-coordinator.js';

const F=Object.freeze,NOW=2_000_000_000_000;
export function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
export async function resultInspectionFixture(options={}){
 const setup=recordedResultFixture({requestBudget:100});await setup.start();const input=setup.request();await setup.root.submitOriginal(input);
 if(options.fullGrant)for(let i=1;i<100;i++)await setup.root.submitOriginal(setup.request('item.'+i));
 const packet=setup.h.packet,key=F({grantId:input.grantId,requestId:input.requestId}),saved=setup.records.get(input.requestId);
 const model=InMemoryServiceCreditModel.fromState({now:()=>NOW,deriveCost:()=>{throw Error('inspection cannot price');}},JSON.parse(JSON.stringify(setup.h.model.exportState())));
 const originalCounts=F({...setup.h.counts});await setup.cleanup();
 let local=options.missingResponse?F({...saved,responseObservation:null,responseStatus:'NOT_OBSERVED',uncertainty:F({...saved.uncertainty,submission:true})}):saved;
 const root='/synthetic/recovery',raw={recoveryInspectionVersion:1,
  selection:{originalPayment:{resourceUrl:setup.h.f.resourceUrl,serializedCheckpoint:packet.serializedCheckpoint,expectedPins:packet.expectedPins},selectedGrantId:key.grantId,paymentRequiredHeader:packet.paymentRequiredHeader??setup.h.f.input.challenge.paymentRequiredHeader},
  payerOptions:{databasePath:root+'/payer.sqlite',allowedRoot:root,fundingResourceUrl:setup.h.f.resourceUrl,
   custodyPolicy:{policyVersion:1,maxRequests:100,serviceResourceUrl:input.serviceResourceUrl},selectedGrantId:key.grantId,deadlineMs:500},
  backendOptions:{databasePath:root+'/backend.sqlite',limits:{busyTimeoutMs:20,maxStateBytes:65536,maxOffers:8,maxGrants:8,maxRequests:100}},requestKey:key,authorizationHeader:input.authorizationHeader};
 const r={raw,text:canonicalJson(raw),input,key,packet,model,originalCounts,local,backendHandle:{},trace:[],localClosed:false,readerClosed:false,
  epochCurrent:true,backendClosed:false,payerCloseCalls:0,backendCloseCalls:0,backendReads:0,localReads:0,checkpointReads:0,ownerReads:0,now:0n,timers:[],writes:[],channelClosed:false,channelCloses:0};
 const checkpoint=restoreOriginalPaymentCheckpoint(packet.serializedCheckpoint,packet.expectedPins);
 const ledgerRequest=model.getRequest(key),executionRequest={};
 for(const name of ['modelVersion','grantId','requestId','requestDigest','method','routeId','canonicalBodyDigest','selectedContentType','maxCostUnits','costUnits'])executionRequest[name]=ledgerRequest[name];
 // Real pure execution-contract transitions over declared memory DATA only.
 // The result commitment uses the existing store's v1 DATA byte contract.
 // This remains a declared memory fixture, not a SQL read/checksum proof.
 const policy=F({policyId:'inspection.execution.fixture',policyVersion:1,maxDurationMs:100});
 const empty=createServiceCreditExecutionContract({ledgerId:'inspection.execution.fixture',policy,capacity:1});
 const prepared=prepareServiceCreditExecution({state:empty,request:executionRequest,policy,selectedDurationMs:100,wallClockStartMs:0});
 const fenced=fenceServiceCreditExecution({state:prepared.state,executionId:prepared.execution.executionId,wallClockNowMs:1}).fenceTransitionCandidate;
 const resultCommitment='sha256:'+createHash('sha256').update('zenon-x402:service-credit-sqlite-result-v1\0').update(canonicalJson(ledgerRequest.cachedResult)).digest('hex');
 const completed=completeServiceCreditExecution({state:fenced.state,executionId:fenced.execution.executionId,resultCommitment,wallClockNowMs:2});
 assert.equal(completed.winner,'SUCCEEDED');r.execution=completed.execution;
 r.outcome=()=>{
  const request=model.getRequest(key),status=options.backendStatus??'CACHED_SUCCESS';
  return F({status,revision:7,originalRequest:request,execution:r.execution,cachedResult:status==='CACHED_SUCCESS'?request.cachedResult:null,
   executionAuthorized:false,paymentAuthorized:false,signingAuthorized:false,deliveryStatus:'NOT_ESTABLISHED'});
 };
 r.manifest=()=>{const profile=decodeApiCreditRecoveryInspectionProfile(r.text),c=consumeApiCreditRecoveryInspectionProfile(profile);releaseApiCreditRecoveryInspectionProfile(profile);return c.manifest;};
 r.observation=()=>F({recoveryVersion:1,status:'CLIENT_RECONCILIATION_REQUIRED',local:r.local,backend:r.outcome(),authority:'NONE',
  mayStartPayment:false,maySignPayment:false,mayDispatchService:false,deliveryConfirmed:false,serviceDelivery:'NOT_ESTABLISHED',currentAuthority:'NOT_ESTABLISHED',nextStep:'RECONCILIATION_REQUIRED'});
 r.ports=F({
  openBackend:F(()=>{r.trace.push('backend-open');return r.backendHandle;}),
  openPayer:F((manifest,backend)=>{
   assert.equal(backend,r.backendHandle);r.trace.push('payer-open');
   const localClient=F({
    readOriginalRecoveryState:F(given=>{assert.deepEqual(given,key);r.localReads++;if(!r.epochCurrent||r.localClosed)throw Error('declared stale owner');return options.absentOriginal?null:r.local;}),
    readOriginal:F(()=>r.local.original),readOriginalRecoveryKeys:F(()=>F([key])),
    readOriginalPaymentCheckpoint:F(pins=>{r.checkpointReads++;assert.deepEqual(pins,packet.expectedPins);
     if(options.changedCheckpoint&&r.checkpointReads>=2)return F({...checkpoint,authorization:'changed'});return checkpoint;}),
    close:F(()=>{r.payerCloseCalls++;r.trace.push('payer-close');if(options.closeThrow)throw Error('declared payer close refused');
     if(options.closePromise)return options.closePromise;r.localClosed=true;return Promise.resolve(options.nonvoidClose?true:undefined);}),
    snapshot:F(()=>F({resource:F({phase:r.localClosed?'RELEASED':'OPEN',slotHeld:!r.localClosed,admissionClosed:r.localClosed,
     storeCloseAttempts:r.localClosed?1:0,storeCloseOutcome:r.localClosed?'RETURNED':'NOT_ATTEMPTED'}),
     close:F({requested:r.payerCloseCalls===1,outcome:r.localClosed?'DRAINED':'WAITING',childUncertainty:false,unknownUndrained:false})}))
   });
   const backendReader=F({readExactOriginal:F((envelope,expected)=>{
    r.backendReads++;r.trace.push('backend-read');assert.equal(envelope.rawHeaders[1],input.authorizationHeader);assert.deepEqual(expected,JSON.parse(input.originalRequestJson));
    if(options.revokeDuringRead)r.epochCurrent=false;
    if(options.changeOriginalDuringRead)r.local=F({...r.local,uncertainty:F({...r.local.uncertainty,custody:true})});
    return options.outcome?options.outcome(r.outcome(),r):r.outcome();
   }),close:F(()=>{r.readerClosed=true;})});
   r.localClient=localClient;r.backendReader=backendReader;
   r.payer=createServiceCreditCustodiedBackendRecoveryCore(localClient,backendReader,key.grantId,'PAYER_OWNED_BACKEND_BORROWED',false,true,true);
   if(options.openPromise)return options.openPromise;return Promise.resolve(r.payer);
  }),
  closeBackend:F(handle=>{assert.equal(handle,r.backendHandle);r.backendCloseCalls++;r.trace.push('backend-close');
   if(options.backendCloseThrow)throw Error('declared backend close refused');r.backendClosed=true;return undefined;})
 });
 r.guard=F(()=>{if(r.expired)throw Error('declared expired read');});
 r.run=async()=>{
  const p=decodeApiCreditRecoveryInspectionProfile(r.text),c=consumeApiCreditRecoveryInspectionProfile(p);
  try{return await runServiceCreditRecordedResultInspectionOwner({manifest:c.manifest,authorizationHeader:c.authorizationHeader,serializedCheckpoint:c.serializedCheckpoint,ports:r.ports,requireOpening:r.guard});}
  finally{releaseApiCreditRecoveryInspectionProfile(p);}
 };
 r.coordinatorPorts=F({
  readProfile:F(g=>{g();return options.readProfile?options.readProfile(r):Promise.resolve(r.text);}),
  inspectOriginal:F(async(profile,g)=>{g();r.ownerReads++;if(options.inspect)return options.inspect(profile,r,g);
   const c=consumeApiCreditRecoveryInspectionProfile(profile);
   try{return await runServiceCreditRecordedResultInspectionOwner({manifest:c.manifest,authorizationHeader:c.authorizationHeader,serializedCheckpoint:c.serializedCheckpoint,ports:r.ports,requireOpening:g});}
   finally{releaseApiCreditRecoveryInspectionProfile(profile);}
  }),
  writeResult:F((line,g)=>{g();r.writes.push(line);return options.write?options.write(r):Promise.resolve(undefined);}),
  close:F(()=>{r.channelCloses++;r.channelClosed=true;return Promise.resolve(undefined);}),
  inspect:F(()=>F({lifecycle:r.channelClosed?'CLOSED':'OPEN',held:false,reading:false,writing:false})),clock:F(()=>r.now),
  armTimer:F((budget,callback)=>{const token=F({budget,callback});r.timers.push(token);return token;}),cancelTimer:F(()=>undefined)
 });
 r.coordinate=()=>runApiCreditRecordedResultInspectionCoordinator({arguments:F({mode:'RECORDED_RESULT',recordedResultFd:3,outputFd:6,bootstrapMs:1000}),ports:r.coordinatorPorts});
 return r;
}
