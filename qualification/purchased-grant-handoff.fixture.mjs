// Actual product/custody/query controllers over explicitly declared memory
// history, file, credential, funding and transport ports. No native owner.
import assert from 'node:assert/strict';
import { canonicalJson } from '../src/canonical.js';
import { recordedResultFixture } from './api-credit-recorded-result.fixture.mjs';
import { fundingGrantCustodyDataFixture } from './funding-grant-custody.behavior.mjs';
import { createApiCreditFundingGrantRecoveryRecord } from '../src/api-credit-funding-grant-recovery-record.js';
import { createApiCreditPurchasedGrantRecoveryApplication, createApiCreditFundingGrantRecoveryApplication } from '../src/api-credit-funding-grant-recovery-application.js';
import { decodeApiCreditOriginalGrantQueryProfile, consumeApiCreditOriginalGrantQueryProfile,
 releaseApiCreditOriginalGrantQueryProfile } from '../src/api-credit-original-grant-query-profile.js';
import { runApiCreditOriginalGrantQueryOwner } from '../src/api-credit-original-grant-query-owner.js';
import { createServiceCreditOriginalFundingGrantResult } from '../src/service-credit-original-funding-grant.js';

const F=Object.freeze,copy=v=>JSON.parse(JSON.stringify(v));
export function frozenData(value){if(value&&typeof value==='object'){for(const v of Object.values(value))frozenData(v);F(value);}return value;}
export function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
export async function flush(){for(let i=0;i<40;i++)await Promise.resolve();}
export function purchasedGrantHandoffFixture(options={}){
 const r=recordedResultFixture({requestBudget:100}),h=r.h;
 const lookupPolicy=F({caBase64:r.selection.configuration.serviceOptions.transportOptions.ca.toString('base64'),
  maxTotalMs:r.selection.configuration.serviceOptions.deadlineMs});
 const d=fundingGrantCustodyDataFixture({fundingFixture:h.f,purchase:r.profile.purchase,paymentId:'payment.api.synthetic',caBase64:lookupPolicy.caBase64});
 // Explicit test transport limits; no real clock, deadline or socket is used.
 d.profile.transport.requestDeadlineMs=20;d.profile.transport.handshakeDeadlineMs=10;d.profile.transport.closeGraceMs=20;
 d.text=canonicalJson(d.profile);assert.equal(d.packet.serializedCheckpoint,h.packet.serializedCheckpoint);
 const s={r,h,d,lookupPolicy,purchase:r.profile.purchase,raw:null,currentCalls:0,retains:0,reads:0,queries:0,
  opens:0,queryReads:0,queryCloses:0,queryClosed:false,work:0,now:0n,timers:[],cancelled:0,
  handoffs:0,clientCloses:0,trace:[],queryContext:null,lastOutput:null,root:null,queryRead:deferred(),queryClose:deferred()};
 const completeRead=s.queryRead.resolve;s.queryRead.resolve=value=>{s.work=0;completeRead(value);};
 const completeClose=s.queryClose.resolve;s.queryClose.resolve=value=>{s.queryClosed=true;completeClose(value);};
 const client=F({...r.root,submitOriginalFunding:F(input=>options.submit?options.submit(s,input):r.root.submitOriginalFunding(input)),
  handoffToService:F(input=>{s.handoffs++;s.trace.push('child-handoff');
  if(options.handoff)return options.handoff(s,input);
  return r.root.handoffToService(input).then(value=>F({...value,selectedGrantId:input.selectedGrantId}));}),
  close:F(()=>{s.clientCloses++;s.trace.push('child-close');return r.root.close();})});
 const custody=F({
  retain:F((id,text)=>{assert.equal(id,d.row.paymentId);s.retains++;s.trace.push('retain');
   if(options.retain)return options.retain(s,text);assert.equal(s.raw,null);return s.raw=createApiCreditFundingGrantRecoveryRecord(d.row,d.signer,text);}),
  read:F(id=>{assert.equal(id,d.row.paymentId);s.reads++;s.trace.push('custody-read');return options.read?options.read(s):s.raw;}),
  assertCurrent:F(()=>{s.currentCalls++;r.owner.assertCurrent();if(options.current)return options.current(s);})
 });
 s.history=()=>{
  const identity=s.queryContext.query.originalFunding,model=h.model.getGrant(h.grant.grantId),p=s.purchase;
  // The reference mock grant and declared lookup response are not verified
  // Zenon funding/activation. Their fields exercise the actual comparison.
  const declared=F({activation:identity,transactionId:identity.transactionId,offerId:identity.offerId,offerVersion:identity.offerVersion,
   holderId:identity.holderId,capabilityCommitment:identity.capabilityCommitment,grantId:model.grantId,activationId:model.activationId,
   totalUnits:p.totalUnits,expiresAt:p.expiresAt,lifecycle:'ACTIVE',availableUnits:p.totalUnits,heldUnits:0,consumedUnits:0});
  return createServiceCreditOriginalFundingGrantResult(identity,declared);
 };
 const closeReceipt=()=>F({phase:'CLOSED',trackedRequests:0,trackedSockets:0,ownedTimers:0,serviceDelivery:'NOT_ESTABLISHED'});
 s.closeReceipt=closeReceipt;
 const view=()=>F({phase:s.queryClosed?'CLOSED':'OPEN',unknown:false,requestStarts:s.queryReads,trackedRequests:s.work,trackedSockets:0,ownedTimers:0,
  close:F({phase:s.queryClosed?'CLOSED':'OPEN',unknown:false,closeRequested:s.queryCloses>0,closePromiseOutcome:s.queryClosed?'CLOSED':'PENDING',
   observing:false,quiescenceObserved:s.queryClosed,localMaterialRelease:F({attempts:s.queryClosed?1:0,outcome:s.queryClosed?'RETURNED':'NOT_ATTEMPTED'})})});
 s.queryPorts=F({
  openTransport:F(profile=>{s.opens++;s.trace.push('query-open');assert.equal(profile,s.queryContext);return F({declaredTransport:true});}),
  read:F((handle,query,proof)=>{s.queryReads++;s.trace.push('query-read');assert.deepEqual(query,s.queryContext.query);assert.equal(proof,s.queryContext.proof);
   if(options.queryRead){s.work=1;return options.queryRead(s);}let value=s.history();if(options.history)value=options.history(s,value);return Promise.resolve(value);}),
  inspect:F(()=>options.queryView?options.queryView(s,view()):view()),
  close:F(()=>{s.queryCloses++;s.trace.push('query-close');if(options.queryClose)return options.queryClose(s);
   s.queryClosed=true;return Promise.resolve(closeReceipt());}),
  clock:F(()=>s.now),armTimer:F((budget,callback)=>{const token={budget,callback,cancelled:false};s.timers.push(token);return token;}),
  cancelTimer:F(token=>{s.cancelled++;token.cancelled=true;if(options.cancel)return options.cancel(s);})
 });
 const inspectGrant=F(function inspectGrant(profileJson,requireCurrent){
  assert.equal(arguments.length,2);s.queries++;s.trace.push('lookup');
  if(options.inspectGrant)return options.inspectGrant(s,profileJson,requireCurrent);
  assert.equal(profileJson,JSON.parse(s.raw).profileJson);let token;
  try{token=decodeApiCreditOriginalGrantQueryProfile(profileJson);s.queryContext=consumeApiCreditOriginalGrantQueryProfile(token);}
  finally{if(token!==undefined)releaseApiCreditOriginalGrantQueryProfile(token);}
  return runApiCreditOriginalGrantQueryOwner(F({profile:s.queryContext,ports:s.queryPorts,requireOpening:requireCurrent})).then(value=>{
   s.lastOutput=value;return options.output?options.output(s,value):value;
  });
 });
 s.configuration=F({application:client,custody,paymentId:d.row.paymentId,fundingResourceUrl:d.f.resourceUrl,
  purchase:s.purchase,inspectGrant,lookupPolicy});
 s.root=options.legacy?createApiCreditFundingGrantRecoveryApplication(F({application:client,custody,paymentId:d.row.paymentId,fundingResourceUrl:d.f.resourceUrl}))
  :createApiCreditPurchasedGrantRecoveryApplication(s.configuration);
 s.prepare=()=>s.root.prepareOriginalFunding(h.f.input);
 s.commit=(text=d.text)=>s.root.commitOriginalFunding(F({expectedPins:h.packet.expectedPins,originalGrantQueryProfile:text}));
 s.submit=()=>s.root.submitOriginalFunding(F({expectedPins:h.packet.expectedPins}));
 s.fund=async()=>{await s.prepare();await s.commit();await s.submit();};
 s.handoff=(request=h.handoff())=>s.root.handoffToService(request);
 s.cleanup=async()=>{
  await s.root.close().catch(()=>{});
  const state=s.root.inspect().grantQueryRecovery.purchasedGrantHandoff??{queryActive:false,queryUnknown:false};
  if(!state.queryActive&&!state.queryUnknown)await r.cleanup();
  h.input.destroy();h.output.destroy();
 };
 return s;
}
export {copy};
