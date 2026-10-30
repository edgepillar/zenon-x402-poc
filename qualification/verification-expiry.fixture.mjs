// Actual evidence activation and issued owner with a real in-memory model.
// The authenticator/observer/provider are declared DATA ports, not chain proof.
import assert from 'node:assert/strict';
import { expiredOriginalFundingDataFixtures } from './expired-original-funding.behavior.mjs';
import { createZenonFundingEvidenceActivation } from '../src/service-credit-zenon-funding-evidence.js';
import { InMemoryServiceCreditModel } from '../src/service-credit-model.js';
import { createIssuedFundingGrantActivationOwner } from '../src/issued-funding-grant-activation-owner.js';

const F=Object.freeze;
export const copy=v=>JSON.parse(JSON.stringify(v));
export function deep(v){if(v&&typeof v==='object'){for(const x of Object.values(v))deep(x);F(v);}return v;}
export function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
export async function flush(){for(let i=0;i<30;i++)await Promise.resolve();}
export function verificationExpiryFixture(options={}){
  const f=expiredOriginalFundingDataFixtures.context(),expiresAt=f.c.challenge.activationIntent.expiresAt;
  const s={now:1000,phase:'OPEN',rows:[f.row],clockReads:0,verifications:0,offerReads:0,policies:0,mintCalls:0,
    preparations:0,activationCalls:0,admissions:0,closes:0,admitted:null,lastActivation:null,lastCandidate:null,trace:[]};
  const model=new InMemoryServiceCreditModel({now:F(()=>s.now),deriveCost:F(()=>1)});model.registerOffer(f.c.offer);
  const store=F({getOffer:F(selected=>{s.offerReads++;return model.getOffer(selected);}),
    activateGrantFromTrustedRecord:F(record=>{s.mintCalls++;s.lastActivation=record;s.trace.push('grant-store');
      if(options.mint)return options.mint(f,s,record,model);return model.activateGrantFromTrustedRecord(record);})});
  const policy=F(()=>{s.policies++;return{fundingPolicyId:f.c.offer.fundingPolicyId,fundingPolicyVersion:f.c.offer.fundingPolicyVersion,
    totalUnits:f.c.challenge.activationIntent.totalUnits,expiresAt,
    requirement:copy(f.c.challenge.paymentRequired.accepts[0])};});
  const clock=F(()=>{s.clockReads++;s.trace.push('clock');return options.clock?options.clock(f,s):s.now;});
  const verifier=F(candidate=>{s.verifications++;s.lastCandidate=candidate;s.trace.push('verify');
    return options.verify?options.verify(f,s,candidate):Promise.resolve(deep(copy(f.verified)));});
  const activation=createZenonFundingEvidenceActivation({store,deriveFundingTerms:policy,verifyFundingEvidence:verifier,
    authorityProfile:f.c.authorityProfile,now:clock});
  const input={intent:copy(f.c.challenge.activationIntent),paymentRequired:copy(f.c.challenge.paymentRequired),
    fundingEvidence:{evidenceVersion:1,artifact:{declaredSynthetic:true}}};
  const activate=()=>activation.activateWithExpiredFundingOutcome(input),legacy=()=>activation.activate(input);
  const observer=F({declaredObserver:true});let root;
  const snapshot=()=>deep({phase:s.phase,uncertain:false,admissionRevoked:false,activeOperations:0,fundingBusy:false,
    serviceOpening:false,serviceAdmissionOpen:s.admitted!==null,admittedGrantId:s.admitted,
    binding:{boundRetained:true,officialPhase:options.officialPhase??'SETTLED',transactionHash:f.row.binding.transactionHash},
    funding:{intakeBound:true,active:false,held:false}});
  const port=F({providerSnapshot:F(snapshot),providerClose:F(()=>{s.closes++;s.phase='CLOSED';return Promise.resolve(undefined);}),
    loadBound:F(()=>s.rows),prepareActivation:F((selected,row)=>{
      s.preparations++;assert.equal(selected,observer);assert.equal(row.binding.transactionHash,f.c.transactionHash);
      if(options.prepare)return options.prepare(f,s,root,activate);
      return F({status:options.status??'READY_WITH_EXPIRY_OUTCOME',activate:F(()=>{s.activationCalls++;return activate();})});
    }),admitCommittedServiceGrant:F(id=>{s.admissions++;assert.equal(id,s.lastActivation===null?null:model.getGrant(id).grantId);
      s.admitted=id;return F({status:'ADMITTED',grantId:id,authority:'NONE'});})});
  root=createIssuedFundingGrantActivationOwner({selection:f.selection,resourceUrl:f.c.resourceUrl,port});
  return {f,s,model,store,clock,verifier,policy,activation,input,activate,legacy,root,observer,expiresAt,
    run:()=>root.activateOriginalCommittedFunding(observer)};
}
