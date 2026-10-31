// Actual buyer wire capture, fixed provider cost/receipt callbacks and model.
// The model grant/activation and execution IDs below are declared mock DATA.
// No provider funding, capability authentication, native store or transport.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { canonicalJson,sha256Hex } from '../src/canonical.js';
import { captureServiceCreditHttpExecuteOriginalInput as captureWire } from '../src/service-credit-http-execute-dispatch.js';
import { decodeIssuedProviderOperatorBootstrap as decode,bindIssuedProviderOperatorBootstrap as bind } from '../src/issued-provider-operator-bootstrap.js';
import { InMemoryServiceCreditModel } from '../src/service-credit-model.js';
import { issuedProviderCliPublicDataProfile as publicProfile } from './issued-provider-cli.behavior.mjs';

const F=Object.freeze,checks=[],EMPTY='sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const hash=c=>'sha256:'+c.repeat(64),NOW=F(()=>1000);
function check(id,run){checks.push(F({id,run}));}
export function createProviderWireRouteFixture(){
 const raw=publicProfile(),prepared=decode(canonicalJson(raw));
 const official=F({localFacilitator:F({declared:true}),validateChallenge:F(()=>{}),reconcilePendingSettlement:F(()=>{}),maxPendingReconciliations:2});
 // These are ordinary declared bytes, never parsed as TLS or key material.
 const config=bind(prepared,official,{key:Buffer.from('DECLARED_TLS_DATA'),cert:Buffer.from('DECLARED_CERT_DATA')},NOW,null);
 const offer=config.offer,selection=config.funding.intake.selection;
 const model=new InMemoryServiceCreditModel({deriveCost:config.serviceStore.deriveCost,now:NOW});model.registerOffer(offer);
 const grant=model.activateGrantFromTrustedRecord({activationVersion:1,authorityProfileId:'declared.mock.authority',authorityProfileVersion:1,
  verifierVersion:1,authorityRecordDigest:hash('a'),fundingPolicyId:offer.fundingPolicyId,fundingPolicyVersion:offer.fundingPolicyVersion,
  sourceSettlementId:'declared.mock.settlement',transactionId:'mocktx:'+'b'.repeat(64),providerId:offer.providerId,serviceId:offer.serviceId,
  resourceId:offer.resourceId,resourceBinding:offer.resourceBinding,offerId:offer.offerId,offerVersion:offer.offerVersion,
  holderId:selection.holderId,capabilityCommitment:selection.capabilityCommitment,totalUnits:100,expiresAt:9999999999999,
  scheme:'exact',paymentFlow:'upfront',network:'zenon:mock',chainProfile:{version:1,chainIdentifier:String(Number.MAX_SAFE_INTEGER),genesisMomentumHash:'0'.repeat(64)},
  asset:'declared.mock.asset',amount:'100',payee:'declared.mock.payee',payer:selection.holderId,
  paymentResourceDigest:hash('c'),paymentRequirementDigest:hash('d'),paymentIntentDigest:hash('e'),grantFundingCommitment:hash('f'),
  evidenceState:'MOMENTUM_INCLUDED',confirmationPolicy:{policyId:'mock.momentum-included',policyVersion:1,minimumConfirmations:1}});
 const r={raw,config,model,grant,executions:0,serviceUrl:new URL(config.funding.intake.resourceUrl).origin+'/service-credit/v1/execute'};
 r.wire=(id='request.0',changes={})=>{
  const request={modelVersion:1,grantId:grant.grantId,requestId:id,method:'POST',routeId:'service-credit.execute.v1',
   canonicalBodyDigest:EMPTY,selectedContentType:'application/json',maxCostUnits:1,...changes};
  const proof={grantId:request.grantId,maxCostUnits:request.maxCostUnits,proofVersion:1,publicKey:'DECLARED_PUBLIC_BYTES',
   requestId:request.requestId,signature:'DECLARED_INVALID_SIGNATURE_BYTES'};
  return F({originalRequestJson:JSON.stringify(request),authorizationHeader:'ServiceCredit '+Buffer.from(JSON.stringify(proof)).toString('base64url')});
 };
 r.capture=input=>captureWire({resourceUrl:r.serviceUrl,...input});
 r.context=input=>{const request=JSON.parse(input.originalRequestJson),selected={};
  for(const name of ['modelVersion','grantId','requestId','method','routeId','canonicalBodyDigest','selectedContentType'])selected[name]=request[name];
  return {modelVersion:1,offer:{providerId:offer.providerId,serviceId:offer.serviceId,offerId:offer.offerId,offerVersion:offer.offerVersion,costPolicyId:offer.costPolicyId},
   grant:{grantId:grant.grantId,offerId:offer.offerId,offerVersion:offer.offerVersion},request:selected};};
 r.rawPrice=input=>config.serviceStore.deriveCost(r.context(input));
 r.price=input=>{r.capture(input);return r.rawPrice(input);};
 r.reserve=input=>{r.capture(input);return r.model.reserveRequest(JSON.parse(input.originalRequestJson));};
 r.invoke=input=>{
  const reserved=r.reserve(input),request=JSON.parse(input.originalRequestJson),key={grantId:request.grantId,requestId:request.requestId};
  if(reserved.replayed)return F({replayed:true,executionAuthorized:false,request:reserved.request,cachedResult:reserved.request.cachedResult});
  assert.equal(r.model.beginExecution(key).executionAuthorized,true);
  const executionId='sha256:'+sha256Hex({domain:'DECLARED_WIRE_ROUTE_EXECUTION',requestId:request.requestId,requestDigest:reserved.request.requestDigest});
  const receipt=config.service.execute({executionId,signal:new AbortController().signal});r.executions++;
  const cachedResult=F({statusCode:200,contentType:'application/json',resultCode:receipt.resultCode});
  r.model.completeExecution({...key,cachedResult});return F({replayed:false,executionAuthorized:false,cachedResult});
 };
 r.restore=()=>{r.model=InMemoryServiceCreditModel.fromState({deriveCost:config.serviceStore.deriveCost,now:NOW},JSON.parse(JSON.stringify(r.model.exportState())));};
 return r;
}

check('provider-wire-canonical-buyer-request-is-priced-by-the-fixed-provider',()=>{
 const r=createProviderWireRouteFixture(),input=r.wire();assert.equal(r.capture(input).grantId,r.grant.grantId);
 assert.equal(r.price(input),1);assert.equal(r.config.offer.costPolicyId,'execution-receipt-unit-v1');assert.equal(r.executions,0);
});
check('provider-wire-product-name-is-not-an-alternate-wire-route',()=>{
 const r=createProviderWireRouteFixture(),input=r.wire('request.legacy',{routeId:'execution-receipt.v1'});
 assert.throws(()=>r.capture(input));assert.throws(()=>r.rawPrice(input));assert.equal(r.executions,0);
});
check('provider-wire-100-reference-calls-and-exact-replay-charge-and-execute-once',()=>{
 const r=createProviderWireRouteFixture();let first;
 for(let i=0;i<100;i++){const v=r.invoke(r.wire('request.'+i));assert.equal(v.replayed,false);if(i===0)first=v.cachedResult;}
 const grant=r.model.getGrant(r.grant.grantId),state=JSON.stringify(r.model.exportState()),replay=r.invoke(r.wire('request.0'));
 assert.deepEqual([grant.totalUnits,grant.availableUnits,grant.heldUnits,grant.consumedUnits],[100,0,0,100]);
 assert.equal(replay.replayed,true);assert.deepEqual(replay.cachedResult,first);assert.equal(replay.executionAuthorized,false);
 assert.equal(r.executions,100);assert.equal(JSON.stringify(r.model.exportState()),state);
});
check('provider-wire-reference-reconstruction-keeps-original-replay-and-balances',()=>{
 const r=createProviderWireRouteFixture();let original;
 for(let i=0;i<100;i++){const v=r.invoke(r.wire('request.'+i));if(i===0)original=v.cachedResult;}
 r.restore();const before=JSON.stringify(r.model.exportState()),replay=r.invoke(r.wire('request.0'));
 assert.deepEqual(replay.cachedResult,original);assert.equal(replay.replayed,true);assert.equal(r.executions,100);
 assert.equal(JSON.stringify(r.model.exportState()),before);assert.equal(r.model.getGrant(r.grant.grantId).consumedUnits,100);
});
check('provider-wire-held-reservations-count-toward-the-reference-grant-budget',()=>{
 const r=createProviderWireRouteFixture();for(let i=0;i<100;i++)assert.equal(r.reserve(r.wire('request.'+i)).replayed,false);
 const before=JSON.stringify(r.model.exportState());assert.throws(()=>r.reserve(r.wire('request.overflow')));
 const grant=r.model.getGrant(r.grant.grantId);assert.deepEqual([grant.availableUnits,grant.heldUnits,grant.consumedUnits],[0,100,0]);
 assert.equal(JSON.stringify(r.model.exportState()),before);assert.equal(r.executions,0);
});
check('provider-wire-unknown-reservation-survives-reference-reconstruction-without-retry',()=>{
 const r=createProviderWireRouteFixture(),input=r.wire(),key={grantId:r.grant.grantId,requestId:'request.0'};
 r.reserve(input);assert.equal(r.model.beginExecution(key).executionAuthorized,true);r.model.markOutcomeUnknown(key);r.restore();
 const before=JSON.stringify(r.model.exportState()),replay=r.invoke(input);assert.equal(replay.request.state,'OUTCOME_UNKNOWN');
 assert.equal(replay.replayed,true);assert.equal(replay.executionAuthorized,false);assert.equal(replay.cachedResult,null);
 assert.throws(()=>r.invoke(r.wire('request.next')));assert.equal(r.executions,0);assert.equal(JSON.stringify(r.model.exportState()),before);
 const grant=r.model.getGrant(r.grant.grantId);assert.deepEqual([grant.availableUnits,grant.heldUnits,grant.consumedUnits],[99,1,0]);
});
check('provider-wire-malformed-input-is-refused-before-reference-charge-or-receipt',()=>{
 const r=createProviderWireRouteFixture(),before=JSON.stringify(r.model.exportState());
 for(const changes of [{method:'GET'},{routeId:'execution-receipt.v1'},{canonicalBodyDigest:hash('f')},{selectedContentType:'text/plain'},{maxCostUnits:0}]){
  assert.throws(()=>r.invoke(r.wire('request.bad',changes)));assert.equal(JSON.stringify(r.model.exportState()),before);
 }
 assert.equal(r.executions,0);assert.equal(r.model.getGrant(r.grant.grantId).availableUnits,100);
});
check('provider-wire-fixed-price-cannot-be-borrowed-by-a-foreign-offer-or-grant',()=>{
 const r=createProviderWireRouteFixture(),base=r.context(r.wire());assert.equal(r.config.serviceStore.deriveCost(base),1);
 for(const edited of [{...base,offer:{...base.offer,costPolicyId:'other.cost'}},{...base,grant:{...base.grant,offerId:'other.offer'}},
  {...base,request:{...base.request,grantId:'other.grant'}}])assert.throws(()=>r.config.serviceStore.deriveCost(edited));
 assert.equal(r.executions,0);assert.equal(r.model.getGrant(r.grant.grantId).availableUnits,100);
});

export const providerWireRouteDataCases=F([...checks]);
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const cases=[];let current=null,reported=false;
 function report(){if(reported)return;reported=true;const failed=cases.filter(c=>c.status!=='PASS').length;
  console.log(JSON.stringify({qualification:'G1_PROVIDER_WIRE_ROUTE_DATA',passed:cases.length-failed,failed,cases,
   actualBuyerWireCaptureAndProviderCostAndReceipt:true,referenceLedger:true,declaredMockActivation:true,componentCooperativeTimers:false,newCaseTimerInvocations:0,
   nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
   providerFunding:'NOT_AUTHENTICATED',capabilityProof:'NOT_AUTHENTICATED',nativeReopen:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED',G0G5Acceptance:'OPEN'}));
  if(failed)process.exitCode=1;
 }
 process.once('beforeExit',()=>{if(cases.length!==checks.length){cases.push({id:current??'incomplete',status:'FAIL',error:'UNSETTLED_DATA_PROMISE'});report();process.exitCode=1;}});
 for(const c of checks){current=c.id;try{await c.run();cases.push({id:c.id,status:'PASS'});}catch{cases.push({id:c.id,status:'FAIL',error:'DATA_ASSERTION'});}}report();
}
