// Actual fixed-offer, recovery, result and command gates over declared memory
// children. Native application source is parsed only; no SDK/key/signature/IO.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { bindSdk105ApiCreditProductLifecycle as bind } from '../src/zenon/sdk105-api-credit-product-profile.js';
import { createApiCreditNonDpPurchasedGrantRecoveryApplication as nonDpRecovery } from '../src/api-credit-funding-grant-recovery-application.js';
import { captureZenonDynamicPlasmaFundingPostPreparationInput as captureInput } from '../src/zenon/dynamic-plasma-funding-post-preparation-input.js';
import { captureOriginalFundingSignerPreparation as captureOriginal } from '../src/original-funding-signer-context-custody.js';
import { encodeB64Json } from '../src/x402-wire.js';
import { purchasedGrantHandoffFixture, copy, flush } from './purchased-grant-handoff.fixture.mjs';

const F=Object.freeze,checks=[],owned=[];
function check(id,run){checks.push(F({id,run}));}
function fixture({legacyOrder=false,nonDp=false,prepare=null,submit=null,...options}={}){
 const f=purchasedGrantHandoffFixture({...options,...(submit?{submit}:{}),wrapDeclaredApplication(state,child){
  state.preparationEntries=0;state.preparationInputs=[];
  return F({...child,prepareOriginalFunding:F(input=>{
   state.preparationEntries++;state.preparationInputs.push(input);
   return prepare?prepare(state,input):child.prepareOriginalFunding(input);
  })});
 }});
 f.good=copy(f.h.f.input);
 if(nonDp){
  const policy={policyVersion:1,maxFusedPlasma:30000,maxMomentumAdvances:2};
  // The declared child still requires exact equality with its expected DATA.
  // Select the same non-DP policy in both copies before any preparation.
  f.h.f.input.plannerContext.readInput.policy=copy(policy);
  f.good.plannerContext.readInput.policy=copy(policy);f.root=nonDpRecovery(f.configuration);
 }
 f.recovery=f.root;f.originalBudget=f.h.raw();
 // Same outer stateless binding as the fixed native source. Preserve every
 // inner recovery/result/stop owner and its original close promise.
 if(!legacyOrder)f.root=bind(f.recovery,f.r.profile);
 f.prepare=()=>f.root.prepareOriginalFunding(f.good);owned.push(f);return f;
}
function otherOffer(f,edit){
 const input=copy(f.good),payment=copy(input.challenge.paymentRequired);edit(payment);
 input.challenge.paymentRequired=payment;input.challenge.paymentRequiredHeader=encodeB64Json(payment);
 input.plannerContext.readInput.paymentRequired=copy(payment);input.plannerContext.readInput.accepted=copy(payment.accepts[0]);
 assert.doesNotThrow(()=>captureInput(input,f.h.f.resourceUrl));
 assert.doesNotThrow(()=>captureOriginal(input,f.h.f.resourceUrl));return input;
}
function untouched(f){
 const view=f.root.inspect();assert.equal(view.lifecycle,'OPEN');assert.equal(view.held,false);
 assert.equal(view.grantQueryRecovery.prepareClaimed,false);assert.equal(view.grantQueryRecovery.phase,'NOT_CAPTURED');
 assert.deepEqual([f.preparationEntries,f.h.counts.prepares,f.h.counts.funding,f.retains,f.reads,f.currentCalls,f.queries,f.handoffs],[0,0,0,0,0,0,0,0]);
 assert.equal(f.raw,null);assert.equal(f.h.raw(),f.originalBudget);assert.equal(f.r.reads+f.r.submissions,0);
 assert.equal(f.r.profileFixture.keyCalls+f.r.profileFixture.clockCalls,0);
}

check('original-offer-legacy-order-reproducer-claims-before-its-inner-fixed-gate-refuses',async()=>{
 const f=fixture({legacyOrder:true}),wrong=otherOffer(f,p=>{p.accepts[0].amount='4';});
 await assert.rejects(f.root.prepareOriginalFunding(wrong));const view=f.root.inspect();
 assert.equal(view.grantQueryRecovery.prepareClaimed,true);assert.equal(view.held,true);assert.equal(f.preparationEntries,1);
 assert.equal(f.h.counts.prepares,0);assert.equal(f.h.raw(),null);assert.equal(f.retains+f.queries+f.h.counts.funding,0);
});
async function refusesCoherentOffer(edit){
 const f=fixture(),wrong=otherOffer(f,edit);await assert.rejects(f.root.prepareOriginalFunding(wrong));untouched(f);
}
check('original-offer-cheaper-price-refuses-before-recovery-spending-or-query-entry',()=>refusesCoherentOffer(p=>{p.accepts[0].amount='4';}));
check('original-offer-higher-price-refuses-before-recovery-spending-or-query-entry',()=>refusesCoherentOffer(p=>{p.accepts[0].amount='6';}));
check('original-offer-changed-product-description-refuses-before-recovery-spending-or-query-entry',()=>refusesCoherentOffer(p=>{p.resource.description='another declared product';}));
check('original-offer-equivalent-header-reencoding-is-not-the-original-byte-selection',async()=>{
 const f=fixture(),input=copy(f.good);
 input.challenge.paymentRequiredHeader=Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(input.challenge.paymentRequired).reverse()))).toString('base64');
 assert.notEqual(input.challenge.paymentRequiredHeader,f.good.challenge.paymentRequiredHeader);
 assert.doesNotThrow(()=>captureInput(input,f.h.f.resourceUrl));
 await assert.rejects(f.root.prepareOriginalFunding(input));untouched(f);
});
check('original-offer-valid-correction-keeps-one-claimed-preparation-and-identical-digest',async()=>{
 const f=fixture(),original=captureOriginal(f.good,f.h.f.resourceUrl);
 await assert.rejects(f.root.prepareOriginalFunding(otherOffer(f,p=>{p.accepts[0].amount='4';})));untouched(f);
 const result=await f.prepare();assert.equal(result.phase,'AWAITING_INDEPENDENT_PINS');
 assert.equal(f.preparationEntries,1);assert.equal(f.h.counts.prepares,1);assert.equal(f.recovery.inspect().grantQueryRecovery.prepareClaimed,true);
 const actual=captureOriginal(f.preparationInputs[0],f.h.f.resourceUrl);
 assert.equal(actual.originalDigest,original.originalDigest);assert.equal(actual.preparationInputJson,original.preparationInputJson);
 assert.equal(f.h.counts.funding+f.queries+f.retains,0);
});
check('original-offer-rejection-after-valid-preparation-does-not-destroy-its-existing-commit',async()=>{
 const f=fixture();await f.prepare();const budget=f.h.raw();
 await assert.rejects(f.root.prepareOriginalFunding(otherOffer(f,p=>{p.accepts[0].amount='6';})));
 assert.equal(f.root.inspect().held,false);assert.equal(f.preparationEntries,1);assert.equal(f.h.raw(),budget);
 await f.commit();assert.equal(f.retains,1);assert.equal(f.h.counts.prepares,1);assert.equal(f.h.counts.funding,0);
});
check('original-offer-getters-and-proxies-enter-no-caller-code-or-recovery-claim',async()=>{
 const f=fixture();let calls=0;const input=copy(f.good);
 Object.defineProperty(input,'challenge',{enumerable:true,get(){calls++;throw Error('unexpected getter');}});
 await assert.rejects(f.root.prepareOriginalFunding(input));untouched(f);
 await assert.rejects(f.root.prepareOriginalFunding(new Proxy(f.good,{get(){calls++;throw Error('unexpected proxy');},ownKeys(){calls++;throw Error('unexpected proxy');}})));
 assert.equal(calls,0);untouched(f);
});
check('original-offer-parent-and-all-original-field-admission-stays-inert-at-construction',()=>{
 const f=fixture();untouched(f);assert.equal(f.clientCloses,0);assert.deepEqual(f.trace,[]);
});
check('original-offer-non-dp-recovery-also-rejects-a-foreign-price-before-its-policy-claim',async()=>{
 const f=fixture({nonDp:true});await assert.rejects(f.root.prepareOriginalFunding(otherOffer(f,p=>{p.accepts[0].amount='4';})));untouched(f);
 await f.prepare();assert.equal(f.preparationEntries,1);assert.equal(f.root.inspect().held,false);
 assert.equal(f.root.inspect().grantQueryRecovery.prepareClaimed,true);
});
check('original-offer-non-dp-policy-refusal-still-leaves-the-same-original-attempt-available',async()=>{
 const f=fixture({nonDp:true}),wrong=copy(f.good);wrong.plannerContext.readInput.policy.maxFusedPlasma=0;
 await assert.rejects(f.root.prepareOriginalFunding(wrong));untouched(f);await f.prepare();assert.equal(f.preparationEntries,1);
});
check('original-offer-admitted-child-refusal-remains-held-and-never-authorizes-retry',async()=>{
 const f=fixture({prepare:()=>Promise.reject(Error('declared child acknowledgement loss'))});
 await assert.rejects(f.prepare());assert.equal(f.root.inspect().held,true);assert.equal(f.preparationEntries,1);
 await assert.rejects(f.prepare());assert.equal(f.preparationEntries,1);assert.equal(f.h.counts.funding+f.queries,0);
});
check('original-offer-one-funding-query-grant-100-distinct-results-and-exact-replay-survive-preclaim-refusal',async()=>{
 const f=fixture();await assert.rejects(f.root.prepareOriginalFunding(otherOffer(f,p=>{p.accepts[0].amount='4';})));untouched(f);
 await f.fund();await f.handoff();let first;
 for(let i=0;i<100;i++){const result=await f.root.submitOriginal(f.r.request('item.'+i));assert.equal(result.replayed,false);if(i===0)first=result;}
 const replay=await f.root.submitOriginal(f.r.request('item.0'));assert.equal(replay.replayed,true);assert.equal(replay.responseJson,first.responseJson);
 assert.deepEqual([f.preparationEntries,f.h.counts.prepares,f.h.counts.funding,f.h.counts.grants,f.queries,f.queryReads,f.queryCloses,f.handoffs],[1,1,1,1,1,1,1,1]);
 assert.deepEqual([f.r.submissions,f.r.reserves,f.r.begins,f.r.completes],[100,100,100,100]);
 const grant=f.h.model.getGrant(f.h.grant.grantId);assert.deepEqual([grant.availableUnits,grant.heldUnits,grant.consumedUnits],[0,0,100]);
 assert.equal(f.root.inspect().held,false);assert.equal(replay.authority,'NONE');assert.equal(replay.serviceDelivery,'NOT_ESTABLISHED');
});
check('original-offer-unknown-funding-retains-held-and-enters-no-grant-query-or-service',async()=>{
 const f=fixture({submit:()=>Promise.resolve(F({phase:'SUBMISSION_OUTCOME_UNKNOWN',fundingIntakeStatus:'UNKNOWN'}))});
 await f.prepare();await f.commit();await assert.rejects(f.submit());
 // No grant exists after unknown funding. Do not ask the fixture to invent
 // a default handoff from a null mock grant; submit explicit refused DATA.
 await assert.rejects(f.handoff({}));assert.equal(f.root.inspect().held,true);assert.equal(f.queries+f.handoffs,0);
});
check('original-offer-fixed-gate-forwards-the-same-one-shot-close-promise',async()=>{
 const f=fixture();const original=f.recovery.close();assert.equal(f.root.close(),original);assert.equal(f.root.close(),original);
 await original;assert.equal(f.clientCloses,1);assert.equal(f.root.inspect().lifecycle,'CLOSED');
});
check('original-offer-close-while-grant-query-is-borrowing-keeps-the-existing-held-boundary',async()=>{
 const f=fixture({queryRead:s=>s.queryRead.promise});await f.fund();const pending=f.handoff();pending.catch(()=>{});await flush();
 assert.equal(f.queries,1);const stop=f.root.close();await assert.rejects(stop);assert.equal(f.clientCloses,0);
 f.queryRead.resolve(f.history());await assert.rejects(pending);assert.equal(f.root.inspect().held,true);
 assert.equal(f.root.close(),stop);assert.equal(f.queries,1);assert.equal(f.h.counts.funding,1);
});

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const cases=[];for(const c of checks){try{await c.run();cases.push({id:c.id,status:'PASS'});}catch(e){cases.push({id:c.id,status:'FAIL',message:String(e?.message??e)});break;}}
 for(const f of owned)await f.cleanup().catch(()=>{});
 const failed=cases.filter(c=>c.status!=='PASS').length;
 process.stdout.write(JSON.stringify({qualification:'G1_ORIGINAL_OFFER_PRECLAIM_ADMISSION_DATA',passed:cases.length-failed,failed,cases,
  actualPureOfferRecoveryResultAndQueryOwners:true,declaredMemoryFundingHistoryAndMockGrant:true,nativeWiring:'SOURCE_REVIEW_AND_PARSER_ONLY',
  signatureShapedFixtureBytesAreNotCryptographicSignatures:true,cryptographicSignatureAlgorithms:0,
  nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
  freshProcessReopen:'NOT_EXECUTED',chainAuthentication:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED',G0G5Acceptance:'OPEN'})+'\n');
 if(failed||cases.length!==checks.length)process.exitCode=1;
}
