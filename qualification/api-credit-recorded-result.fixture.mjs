// Actual application/command/reference model. History/file/native children are
// declared memory ports; the trusted mock activation is not funding evidence.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { apiCreditCommandDataFixtures as commands } from './api-credit-command.behavior.mjs';
import { apiCreditApplicationDataFixtures as applications } from './api-credit-application.behavior.mjs';
import { createSdk105ApiCreditApplicationLifecycle } from '../src/zenon/sdk105-api-credit-application-lifecycle.js';
import { captureSdk105ApiCreditProductSelection, consumeSdk105ApiCreditProductSelection,
 bindSdk105ApiCreditProductLifecycleWithRecordedResults } from '../src/zenon/sdk105-api-credit-product-profile.js';
import { captureOriginalServiceRequestCustody, captureOriginalServiceDispatchIntent } from '../src/service-credit-original-request-custody-contract.js';
import { InMemoryServiceCreditModel } from '../src/service-credit-model.js';

const F=Object.freeze,NOW=2_000_000_000_000;
const EMPTY='sha256:'+createHash('sha256').update('').digest('hex');
const digest=c=>'sha256:'+c.repeat(64);
export function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
export function recordedResultFixture({onRead=null,onSubmit=null,requestBudget=128}={}){
 let h,s;
 h=commands.fixture({createLifecycle(c){
  s={current:true,closed:false,held:false,currentCalls:0,reads:0,submissions:0,reserves:0,begins:0,completes:0,records:new Map(),onRead,onSubmit};
  const owner=F({backend:c.spending.backend,assertCurrent:F(()=>{s.currentCalls++;if(!s.current||s.closed){s.held=true;throw Error('declared owner unavailable');}}),
   inspect:F(()=>F({spendingFileOwnerVersion:1,lifecycle:s.held?'HELD':s.closed?'CLOSED':'OPEN',held:s.held,busy:false,
    backendClosed:s.closed,databaseOpen:!s.closed,physicalCloseEntered:s.closed,physicalCloseReturned:s.closed})),
   revoke:F(()=>{s.closed=true;}),close:F(()=>{s.closed=true;})});
  s.owner=owner;
  const client=F({...c.client,submitOriginal:F(async function submitOriginal(input){
   s.submissions++;const request=JSON.parse(input.originalRequestJson),key={grantId:input.grantId,requestId:input.requestId};
   assert.equal(input.serviceResourceUrl,new URL(c.fundingResourceUrl).origin+'/service-credit/v1/execute');
   s.reserves++;const reserved=h.model.reserveRequest(request);assert.equal(reserved.replayed,false);
   s.begins++;assert.equal(h.model.beginExecution(key).executionAuthorized,true);h.counts.executions++;
   if(s.onSubmit)await s.onSubmit(input);
   const responseJson=JSON.stringify({ok:true,resultCode:'api.'+input.requestId});
   h.model.completeExecution({...key,cachedResult:{statusCode:200,contentType:'application/json',resultCode:'api.'+input.requestId}});s.completes++;
   const original=captureOriginalServiceRequestCustody({originalRequestJson:input.originalRequestJson,originalBodyBase64:'',serviceResourceUrl:input.serviceResourceUrl},
    {fundingResourceUrl:c.fundingResourceUrl,paymentHash:h.f.candidate.accountBlock.hash,network:h.policy.network});
   const funding=F({revision:3,status:'BOUND',ambiguityLatched:false,fundingResourceUrl:c.fundingResourceUrl,paymentHash:original.paymentHash,network:original.network});
   const dispatchIntent=captureOriginalServiceDispatchIntent(original,{fundingRevision:3,challengeDigest:digest('a'),paymentDigest:digest('b'),
    custodyPolicy:{policyVersion:1,maxRequests:requestBudget,serviceResourceUrl:input.serviceResourceUrl}});
   const responseObservation=F({responseObservationVersion:1,scope:'LOCAL_DECLARED_HTTP_SUCCESS_RESPONSE',status:'DECLARED_SUCCESS_RESPONSE_OBSERVED',
    grantId:input.grantId,requestId:input.requestId,paymentHash:original.paymentHash,network:original.network,fundingResourceUrl:c.fundingResourceUrl,fundingRevision:3,
    responseJson,resultCode:'api.'+input.requestId,authority:'NONE',mayStartPayment:false,maySignPayment:false,mayDispatchService:false,deliveryConfirmed:false,serviceDelivery:'NOT_ESTABLISHED'});
   s.records.set(input.requestId,F({original,funding,dispatchIntent,responseObservation,
    uncertainty:F({custody:false,submission:false,undrained:false,declaredFundingAmbiguitySeen:false}),
    evidence:'LOCAL_STORE_DECLARED_RECOVERY_STATE',qualification:'UNQUALIFIED',authority:'NONE',serviceOutcome:'NOT_ESTABLISHED',
    dispatchStatus:'POSSIBLY_ATTEMPTED',responseStatus:'LOCAL_DECLARED_SUCCESS_RESPONSE_OBSERVED'}));
   return undefined;
  })});
  return createSdk105ApiCreditApplicationLifecycle({client,walletOwner:c.walletOwner,fileOwner:owner,fundingResourceUrl:c.fundingResourceUrl,
   spending:{policy:c.spending.policy,paymentId:c.spending.paymentId,readDay:c.spending.readDay}});
 }});
 const profileFixture=applications.capturedConfiguration(),config=profileFixture.input.configuration.serviceOptions,{official,...transport}=config;
 profileFixture.input.configuration.serviceOptions={...transport,assetInfo:official.assetInfo,contextLimit:official.contextLimit};
 profileFixture.input.productProfileVersion=1;profileFixture.input.paymentRequiredHeader=h.f.input.challenge.paymentRequiredHeader;
 profileFixture.input.configuration.storeOptions.custodyPolicy.maxRequests=requestBudget;
 profileFixture.input.configuration.serviceOptions.transportOptions.maxRequestStarts=requestBudget;
 const selected=captureSdk105ApiCreditProductSelection(profileFixture.input),profile=consumeSdk105ApiCreditProductSelection(selected).profile;
 s.readState=F(key=>{s.owner.assertCurrent();s.reads++;if(key.grantId!==h.grant?.grantId)throw Error('declared foreign grant');
  let value=s.records.get(key.requestId)??null;if(s.onRead)value=s.onRead(value,key,s);s.owner.assertCurrent();return value;});
 s.h=h;s.profile=profile;s.base=h.root;s.profileFixture=profileFixture;s.selection=selected;
 s.bind=()=>bindSdk105ApiCreditProductLifecycleWithRecordedResults(s.base,profile,s.readState);
 h.root=s.bind();s.root=h.root;
 s.request=(id='request.1',changes={})=>{
  const request={modelVersion:1,grantId:h.grant.grantId,requestId:id,method:'POST',routeId:'service-credit.execute.v1',canonicalBodyDigest:EMPTY,selectedContentType:'application/json',maxCostUnits:1,...changes};
  const proof={grantId:request.grantId,maxCostUnits:request.maxCostUnits,proofVersion:1,publicKey:'DECLARED_PUBLIC_BYTES',requestId:request.requestId,signature:'DECLARED_INVALID_SIGNATURE_BYTES'};
  return{grantId:request.grantId,requestId:request.requestId,originalRequestJson:JSON.stringify(request),originalBodyBase64:'',
   serviceResourceUrl:new URL(h.f.resourceUrl).origin+'/service-credit/v1/execute',authorizationHeader:'ServiceCredit '+Buffer.from(JSON.stringify(proof)).toString('base64url')};
 };
 s.start=async()=>{await s.root.prepareOriginalFunding(h.f.input);await s.root.commitOriginalFunding({expectedPins:h.packet.expectedPins});
  await s.root.submitOriginalFunding({expectedPins:h.packet.expectedPins});await s.root.handoffToService(h.handoff());};
 s.hydrate=()=>{h.model=InMemoryServiceCreditModel.fromState({now:()=>NOW,deriveCost:()=>1},JSON.parse(JSON.stringify(h.model.exportState())));};
 s.cleanup=async()=>{await s.root.close().catch(()=>{});selected.release();await profileFixture.h.root.close().catch(()=>{});
  for(const r of [h,profileFixture.h]){r.input.destroy();r.output.destroy();}};
 return s;
}
