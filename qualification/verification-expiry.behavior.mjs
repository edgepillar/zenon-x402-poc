// Actual evidence activation, in-memory grant model and issued activation
// owner. Verifier/provider ports are declared DATA, not authenticated funding.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { captureIssuedExpiredFundingResult as sharedCapture } from '../src/issued-expired-funding-receipt.js';
import { captureIssuedFundingActivationTime,captureIssuedExpiredFundingResult as legacyCapture,
  createIssuedExpiredFundingPreparation } from '../src/issued-expired-funding-preparation.js';
import { verificationExpiryFixture as fixture,copy,deep,deferred,flush } from './verification-expiry.fixture.mjs';

const F=Object.freeze,checks=[];
function check(id,run){checks.push({id,run});}
function noGrantAuthority(value){
  assert.equal(value.status,'FUNDED_NO_NEW_GRANT');assert.equal(value.grantActivation,'NOT_ENTERED_THIS_OPERATION');
  assert.equal(value.grantExistence,'NOT_QUERIED');assert.equal(value.deliveryLiability,'RECONCILIATION_REQUIRED');
  assert.equal(value.paymentAt,null);assert.equal(value.serviceDelivery,'NOT_ESTABLISHED');assert.equal(value.compensation,'NOT_ESTABLISHED');
  for(const key of ['mayStartPayment','maySignPayment','mayDispatchService','mayActivateGrant','mayStartCompensation'])assert.equal(value[key],false);
  assert.equal(value.authority,'NONE');
}
check('verification-expiry-unexpired-result-matches-legacy-activation-bytes',async()=>{
  const a=fixture(),b=fixture(),legacy=await a.legacy(),selected=await b.activate();
  assert.equal(canonicalJson(selected),canonicalJson(legacy));assert.equal(a.s.mintCalls,1);assert.equal(b.s.mintCalls,1);
  assert.equal(b.s.verifications,1);assert.equal(selected.grant.totalUnits,100);assert.equal(selected.grant.expiresAt,b.expiresAt);
});
check('verification-expiry-at-the-post-verification-boundary-enters-no-grant-store',async()=>{
  const f=fixture({verify(c,s){s.now=c.c.challenge.activationIntent.expiresAt;return Promise.resolve(deep(copy(c.verified)));}}),r=await f.activate();
  noGrantAuthority(r);assert.equal(r.eligibilityObservedAt,f.expiresAt);assert.equal(f.s.verifications,1);assert.equal(f.s.mintCalls,0);
  assert.equal(r.transactionHash,f.f.c.transactionHash);assert.equal(r.fundingCommitment,f.f.c.challenge.fundingCommitment);
});
check('verification-expiry-after-the-boundary-preserves-original-expiry-and-liability',async()=>{
  const f=fixture({verify(c,s){s.now=c.c.challenge.activationIntent.expiresAt+1000;return Promise.resolve(deep(copy(c.verified)));}}),r=await f.activate();
  noGrantAuthority(r);assert.equal(r.expiresAt,f.expiresAt);assert.equal(r.eligibilityObservedAt,f.expiresAt+1000);
  assert.equal(f.s.mintCalls,0);assert.equal(f.s.verifications,1);
});
check('verification-expiry-already-expired-before-entry-still-authenticates-once-without-mint',async()=>{
  const f=fixture();f.s.now=f.expiresAt;const r=await f.activate();noGrantAuthority(r);assert.equal(f.s.verifications,1);assert.equal(f.s.mintCalls,0);
});
check('verification-expiry-one-tick-before-deadline-retains-normal-grant-activation',async()=>{
  const f=fixture({verify(c,s){s.now=c.c.challenge.activationIntent.expiresAt-1;return Promise.resolve(deep(copy(c.verified)));}}),r=await f.activate();
  assert.equal(Object.hasOwn(r,'expiredFundingVersion'),false);assert.equal(r.grant.totalUnits,100);assert.equal(f.s.mintCalls,1);assert.equal(f.s.verifications,1);
});
check('verification-expiry-legacy-mode-retains-its-expired-result-error',async()=>{
  const f=fixture({verify(c,s){s.now=c.c.challenge.activationIntent.expiresAt;return Promise.resolve(deep(copy(c.verified)));}});
  await assert.rejects(f.legacy(),e=>e.code==='SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_SETTLED_NOT_GRANTED');assert.equal(f.s.mintCalls,0);
  const before=fixture();before.s.now=before.expiresAt;await assert.rejects(before.legacy());assert.equal(before.s.verifications,0);
});
check('verification-expiry-shared-receipt-keeps-the-previous-closed-byte-contract',async()=>{
  const f=fixture();f.s.now=f.expiresAt;const selected=await f.activate(),t=captureIssuedFundingActivationTime(f.expiresAt,F(()=>f.s.now));
  const previous=createIssuedExpiredFundingPreparation(f.f.c,t,F({projectFundingEvidence:F(()=>({evidenceVersion:1,artifact:{declaredSynthetic:true}})),
    verifyFundingEvidence:F(()=>Promise.resolve(deep(copy(f.f.verified))))}));
  assert.equal(sharedCapture,legacyCapture);assert.equal(canonicalJson(await previous.verify()),canonicalJson(selected));
});
check('verification-expiry-foreign-verified-fields-cannot-become-known-late-funding',async()=>{
  const edits=[v=>v.authorityProfileId='other.authority',v=>v.authorityProfileVersion=2,v=>v.verifierVersion=2,
    v=>v.authorityRecordDigest='sha256:'+'f'.repeat(64),v=>v.network='zenon:other',v=>v.chainProfile.chainIdentifier='54321',
    v=>v.payer='other.payer',v=>v.payee='other.payee',v=>v.asset='other.asset',v=>v.amount='101',
    v=>v.paymentResourceDigest='sha256:'+'f'.repeat(64),v=>v.paymentRequirementDigest='sha256:'+'f'.repeat(64),
    v=>v.paymentIntentDigest='sha256:'+'f'.repeat(64),v=>v.resourceBinding='sha256:'+'f'.repeat(64),
    v=>v.offerId='other.offer',v=>v.offerVersion=2,v=>v.fundingPolicyId='other.policy',v=>v.fundingPolicyVersion=2,
    v=>v.capabilityCommitment='sha256:'+'f'.repeat(64),v=>v.totalUnits=101,v=>v.expiresAt++,
    v=>v.grantFundingCommitment='sha256:'+'f'.repeat(64),v=>v.confirmationPolicy.minimumConfirmations=1];
  for(const edit of edits){const f=fixture({verify(c,s){s.now=c.c.challenge.activationIntent.expiresAt;const v=copy(c.verified);edit(v);return Promise.resolve(deep(v));}});
    await assert.rejects(f.activate());assert.equal(f.s.mintCalls,0);assert.equal(f.s.verifications,1);}
});
check('verification-expiry-inclusion-and-success-flags-are-not-authentication',async()=>{
  for(const value of [true,{success:true},{status:'SETTLED'},{phase:'READY'}]){
    const f=fixture({verify(c,s){s.now=c.c.challenge.activationIntent.expiresAt;return Promise.resolve(value);}});
    await assert.rejects(f.activate());assert.equal(f.s.mintCalls,0);
  }
});
check('verification-expiry-wrong-inclusion-identity-is-withheld-before-mint',async()=>{
  const f=fixture({verify(c,s){s.now=c.c.challenge.activationIntent.expiresAt;const v=copy(c.verified);v.inclusionEvidence.transactionHash='f'.repeat(64);return Promise.resolve(deep(v));}});
  await assert.rejects(f.activate());assert.equal(f.s.mintCalls,0);
});
check('verification-expiry-verifier-rejection-is-never-downgraded-to-funded',async()=>{
  const f=fixture({verify(c,s){s.now=c.c.challenge.activationIntent.expiresAt;return Promise.reject(Error('declared verifier failure'));}});
  await assert.rejects(f.activate());assert.equal(f.s.verifications,1);assert.equal(f.s.mintCalls,0);
});
check('verification-expiry-verifier-thenable-hooks-never-run',async()=>{
  let hooks=0;const f=fixture({verify(c,s){s.now=c.c.challenge.activationIntent.expiresAt;return F({get then(){hooks++;throw Error();}});}});
  await assert.rejects(f.activate());assert.equal(hooks,0);assert.equal(f.s.mintCalls,0);
});
check('verification-expiry-invalid-initial-clock-enters-neither-verifier-nor-store',async()=>{
  for(const value of [-1,NaN,Infinity,1.5,undefined]){const f=fixture({clock(){return value;}});await assert.rejects(f.activate());
    assert.equal(f.s.verifications+f.s.mintCalls,0);}
});
check('verification-expiry-invalid-final-clock-remains-unresolved-without-mint',async()=>{
  for(const value of [-1,NaN,Infinity,1.5,undefined]){const f=fixture({clock(c,s){return s.clockReads===1?1000:value;}});
    await assert.rejects(f.activate());assert.equal(f.s.verifications,1);assert.equal(f.s.mintCalls,0);}
});
check('verification-expiry-clock-regression-cannot-restore-an-activation-window',async()=>{
  const f=fixture({clock(c,s){return s.clockReads===1?15000:14999;}});await assert.rejects(f.activate());
  assert.equal(f.s.verifications,1);assert.equal(f.s.mintCalls,0);
});
check('verification-expiry-clock-thenable-is-not-awaited-or-invoked',async()=>{
  let hooks=0;const f=fixture({clock(c,s){return s.clockReads===1?1000:F({get then(){hooks++;throw Error();}});}});
  await assert.rejects(f.activate());assert.equal(hooks,0);assert.equal(f.s.mintCalls,0);
});
check('verification-expiry-caller-intent-mutation-during-verification-does-not-reprice',async()=>{
  const pending=deferred(),f=fixture({verify(){return pending.promise;}}),run=f.activate();await flush();
  f.input.intent.totalUnits=999;f.input.intent.expiresAt=999999;f.input.paymentRequired.accepts[0].amount='999';f.s.now=f.expiresAt;
  pending.resolve(deep(copy(f.f.verified)));const r=await run;noGrantAuthority(r);assert.equal(r.expiresAt,f.expiresAt);assert.equal(f.s.mintCalls,0);
});
check('verification-expiry-store-commit-unknown-is-not-known-expired-funding',async()=>{
  const f=fixture({mint(c,s){s.now=c.c.challenge.activationIntent.expiresAt;const e=Error('declared lost commit acknowledgement');e.code='SERVICE_CREDIT_STORE_COMMIT_FAILED';throw e;}});
  await assert.rejects(f.activate(),e=>e.code==='SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_OUTCOME_UNKNOWN');assert.equal(f.s.mintCalls,1);
});
check('verification-expiry-expiry-after-store-entry-remains-an-error-not-a-fallback',async()=>{
  const f=fixture({mint(c,s,record,model){s.now=c.c.challenge.activationIntent.expiresAt;return model.activateGrantFromTrustedRecord(record);}});
  await assert.rejects(f.activate(),e=>e.code==='SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_SETTLED_NOT_GRANTED');assert.equal(f.s.mintCalls,1);
});
check('verification-expiry-store-commit-may-exist-after-ack-loss-without-second-write',async()=>{
  const f=fixture({mint(c,s,record,model){model.activateGrantFromTrustedRecord(record);const e=Error('declared post-commit response loss');e.code='SERVICE_CREDIT_STORE_COMMIT_FAILED';throw e;}});
  await assert.rejects(f.run());assert.equal(f.s.mintCalls,1);assert.equal(f.s.admissions,0);assert.equal(f.root.snapshot().held,true);
  await assert.rejects(f.run());assert.equal(f.s.mintCalls,1);await assert.rejects(f.root.close());
});
check('verification-expiry-owner-accepts-only-the-explicit-mode-known-no-grant-result',async()=>{
  const f=fixture({verify(c,s){s.now=c.c.challenge.activationIntent.expiresAt;return Promise.resolve(deep(copy(c.verified)));}}),r=await f.run();
  noGrantAuthority(r);assert.equal(f.s.mintCalls+f.s.admissions,0);assert.equal(f.root.snapshot().fundedWithoutGrantObserved,true);
  assert.equal(f.root.snapshot().held,false);assert.equal(f.root.snapshot().activationResultMode,'ACTIVATION_OR_EXPIRED_FUNDING');
  assert.equal(f.s.verifications,1);assert.equal(f.s.closes,0);await f.root.close();assert.equal(f.s.closes,1);
});
check('verification-expiry-owner-does-not-repeat-verification-or-reenter-grant-admission',async()=>{
  const f=fixture({verify(c,s){s.now=c.c.challenge.activationIntent.expiresAt;return Promise.resolve(deep(copy(c.verified)));}});
  await f.run();await assert.rejects(f.run());assert.equal(f.s.activationCalls,1);assert.equal(f.s.verifications,1);assert.equal(f.s.admissions,0);await f.root.close();
});
check('verification-expiry-owner-unexpired-mode-keeps-one-real-memory-grant-and-admission',async()=>{
  const f=fixture(),r=await f.run();assert.equal(r.status,'ADMITTED');assert.equal(f.s.mintCalls,1);assert.equal(f.s.admissions,1);
  assert.equal(f.model.getGrant(r.grantId).totalUnits,100);assert.equal(f.root.snapshot().fundedWithoutGrantObserved,false);await f.root.close();
});
check('verification-expiry-owner-rejects-a-validly-shaped-foreign-transaction-receipt',async()=>{
  const f=fixture({verify(c,s){s.now=c.c.challenge.activationIntent.expiresAt;const v=copy(c.verified);
    v.transactionId='zenontx:'+'f'.repeat(64);v.inclusionEvidence.transactionHash='f'.repeat(64);return Promise.resolve(deep(v));}});
  await assert.rejects(f.run());assert.equal(f.s.mintCalls+f.s.admissions,0);assert.equal(f.root.snapshot().held,true);await assert.rejects(f.root.close());
});
check('verification-expiry-legacy-ready-protocol-cannot-implicitly-upgrade-a-receipt',async()=>{
  const f=fixture({status:'READY',verify(c,s){s.now=c.c.challenge.activationIntent.expiresAt;return Promise.resolve(deep(copy(c.verified)));}});
  await assert.rejects(f.run());assert.equal(f.root.snapshot().held,true);assert.equal(f.s.admissions,0);assert.equal(f.s.mintCalls,0);await assert.rejects(f.root.close());
});
check('verification-expiry-owner-pending-official-outcome-does-not-start-the-new-mode',async()=>{
  const f=fixture({officialPhase:'PENDING'}),r=await f.run();assert.equal(r.status,'NOT_READY');
  assert.equal(f.s.preparations+f.s.verifications+f.s.mintCalls,0);await f.root.close();
});
check('verification-expiry-close-during-verification-withholds-late-known-result',async()=>{
  const pending=deferred(),f=fixture({verify(){return pending.promise;}}),run=f.run();await flush();await assert.rejects(f.root.close());
  f.s.now=f.expiresAt;pending.resolve(deep(copy(f.f.verified)));await assert.rejects(run);
  assert.equal(f.s.mintCalls+f.s.admissions,0);assert.equal(f.s.closes,1);assert.equal(f.root.snapshot().held,true);
});
check('verification-expiry-owner-row-drift-prevents-publication-of-late-receipt',async()=>{
  const pending=deferred(),f=fixture({verify(){return pending.promise;}}),run=f.run();await flush();
  f.s.rows=[deep({...copy(f.f.row),binding:{...copy(f.f.row.binding),transactionHash:'f'.repeat(64)}})];
  f.s.now=f.expiresAt;pending.resolve(deep(copy(f.f.verified)));await assert.rejects(run);
  assert.equal(f.s.mintCalls+f.s.admissions,0);assert.equal(f.root.snapshot().held,true);await assert.rejects(f.root.close());
});
check('verification-expiry-proxy-preparation-cannot-run-reflection-hooks',async()=>{
  let hooks=0;const f=fixture({prepare(){return new Proxy({}, {isExtensible(){hooks++;throw Error();},ownKeys(){hooks++;throw Error();}});}});
  await assert.rejects(f.run());assert.equal(hooks,0);assert.equal(f.s.verifications+f.s.mintCalls,0);await assert.rejects(f.root.close());
});
check('verification-expiry-accessor-preparation-cannot-enter-an-activation-hook',async()=>{
  let hooks=0;const f=fixture({prepare(){return F(Object.defineProperty({status:'READY_WITH_EXPIRY_OUTCOME'},'activate',{enumerable:true,get(){hooks++;throw Error();}}));}});
  await assert.rejects(f.run());assert.equal(hooks,0);assert.equal(f.s.verifications+f.s.mintCalls,0);await assert.rejects(f.root.close());
});
check('verification-expiry-known-receipt-cannot-claim-delivery-or-compensation',async()=>{
  const f=fixture();f.s.now=f.expiresAt;const r=await f.activate();
  for(const [key,value]of [['serviceDelivery','DELIVERED'],['grantExistence','ABSENT'],['mayStartCompensation',true],['mayActivateGrant',true]]){
    assert.throws(()=>sharedCapture(F({...r,[key]:value}),F({transactionHash:r.transactionHash,fundingCommitment:r.fundingCommitment,expiresAt:r.expiresAt})));
  }
});

export const verificationExpiryDataCases=F([...checks]);
if(process.argv[1]!==undefined&&fileURLToPath(import.meta.url)===process.argv[1]){
  const cases=[];let current=null,reported=false;
  function report(){if(reported)return;reported=true;const failed=cases.filter(v=>v.status!=='PASS').length;
    console.log(JSON.stringify({qualification:'G1_G2_VERIFICATION_EXPIRY_OUTCOME_DATA',passed:cases.length-failed,failed,cases,
      actualEvidenceActivationMemoryModelAndIssuedOwner:true,authenticatorObserverAndProvider:'DECLARED_MEMORY_DATA',
      nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
      nativeFundingAuthentication:'NOT_ESTABLISHED',nativeDurability:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED'}));
    if(failed)process.exitCode=1;
  }
  function unsettled(){if(current!==null){cases.push({id:current,status:'FAIL',error:'UNSETTLED_DECLARED_DATA_PROMISE'});report();}}
  process.once('beforeExit',unsettled);
  for(const {id,run}of checks){current=id;try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??'unknown').slice(0,256)});}current=null;}
  process.off('beforeExit',unsettled);report();
}
