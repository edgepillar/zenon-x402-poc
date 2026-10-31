// Actual pure capture/recovery owners; declared child/custody acknowledgements.
// No native application, cryptographic signature, key, SQLite or socket exists.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { captureNonDpFusedResourcePolicy as policy } from '../src/zenon/non-dp-fused-resource-policy.js';
import { captureOriginalFundingSignerPreparation as legacyCapture,
  captureNonDpOriginalFundingSignerPreparation as capture } from '../src/original-funding-signer-context-custody.js';
import { createApiCreditNonDpPurchasedGrantRecoveryApplication as create,
  createApiCreditPurchasedGrantRecoveryApplication as legacyCreate } from '../src/api-credit-funding-grant-recovery-application.js';
import { fundingPostPreparationInputFixture } from './dynamic-plasma-funding-post-input.fixture.mjs';

const F=Object.freeze,copy=x=>JSON.parse(JSON.stringify(x)),checks=[],owners=[];
const selected=()=>({policyVersion:1,maxFusedPlasma:30000,maxMomentumAdvances:2});
function check(id,run){checks.push({id,run});}
function input(p=selected()){
  const f=fundingPostPreparationInputFixture();f.input.plannerContext.readInput.policy=p;return f;
}
function fixture(options={}){
  const f=input(),r={f,prepares:0,commits:0,funding:0,service:0,handoffs:0,closes:0,retains:0,reads:0,current:0,queries:0,lifecycle:'OPEN',lastInput:null,viewHook:null};
  const unexpected=()=>Promise.reject(new TypeError('DECLARED_OPERATION_NOT_SELECTED'));
  const child=F({prepareOriginalFunding:F(incoming=>{
    r.prepares++;r.lastInput=incoming;
    if(options.refuseChild)return Promise.reject(new TypeError('DECLARED_DOWNSTREAM_REFUSAL'));
    return Promise.resolve(F({phase:'AWAITING_INDEPENDENT_PINS',packet:F({serializedCheckpoint:f.checkpoint().serializedCheckpoint})}));
  }),commitOriginalFunding:F(()=>{r.commits++;return unexpected();}),submitOriginalFunding:F(()=>{r.funding++;return unexpected();}),
  handoffToService:F(()=>{r.handoffs++;return unexpected();}),submitOriginal:F(()=>{r.service++;return unexpected();}),
  inspect:F(()=>{const hook=r.viewHook;r.viewHook=null;if(hook)hook();return F({lifecycle:r.lifecycle,held:false,publicOperationActive:false,closeRequested:r.lifecycle!=='OPEN',phase:'FUNDING'});}),
  close:F(()=>{r.closes++;r.lifecycle='CLOSED';return Promise.resolve(undefined);})});
  const custody=F({retain:F(()=>{r.retains++;throw Error('unexpected custody');}),read:F(()=>{r.reads++;throw Error('unexpected custody');}),assertCurrent:F(()=>{r.current++;})});
  const c=F({application:child,custody,paymentId:'synthetic.prepare-admission',fundingResourceUrl:f.resourceUrl,
    purchase:F({declaredUnusedPurchase:true}),inspectGrant:F(()=>{r.queries++;return unexpected();}),lookupPolicy:F({declaredUnusedLookup:true})});
  r.root=(options.legacy?legacyCreate:create)(c);owners.push(r);return r;
}
function untouched(r){
  assert.deepEqual([r.prepares,r.commits,r.funding,r.service,r.handoffs,r.retains,r.reads,r.current,r.queries],[0,0,0,0,0,0,0,0,0]);
  const s=r.root.inspect();assert.equal(s.held,false);assert.equal(s.lifecycle,'OPEN');assert.equal(s.grantQueryRecovery.prepareClaimed,false);
  assert.equal(s.grantQueryRecovery.phase,'NOT_CAPTURED');
}
check('non-dp-policy-admission-is-detached-frozen-and-preserves-input',()=>{
  const p=selected(),before=copy(p),out=policy(p);assert.deepEqual(out,before);assert.notEqual(out,p);assert.ok(Object.isFrozen(out));assert.deepEqual(p,before);
  p.maxFusedPlasma=1;assert.equal(out.maxFusedPlasma,30000);
});
check('non-dp-policy-keeps-its-existing-boundary-values-without-defaults',()=>{
  for(const [fused,advances]of [[1,0],[Number.MAX_SAFE_INTEGER,128],[30000,2]])assert.deepEqual(policy({policyVersion:1,maxFusedPlasma:fused,maxMomentumAdvances:advances}),{policyVersion:1,maxFusedPlasma:fused,maxMomentumAdvances:advances});
  for(const field of ['policyVersion','maxFusedPlasma','maxMomentumAdvances']){const p=selected();delete p[field];assert.throws(()=>policy(p));}
});
check('non-dp-policy-rejects-work-fields-modes-and-schema-upgrades',()=>{
  for(const field of ['maxDifficulty','maxPriceChangePercent','startNonce','mode','authority'])assert.throws(()=>policy({...selected(),[field]:0}));
  for(const version of [0,2,undefined,'1',true])assert.throws(()=>policy({...selected(),policyVersion:version}));
});
check('non-dp-policy-rejects-invalid-fusion-caps-and-height-windows',()=>{
  for(const value of [0,-1,-0,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'30000',null])assert.throws(()=>policy({...selected(),maxFusedPlasma:value}));
  for(const value of [-1,-0,129,1.5,NaN,Infinity,'2',null])assert.throws(()=>policy({...selected(),maxMomentumAdvances:value}));
});
check('non-dp-policy-does-not-enter-getters-proxies-or-constructor-use',()=>{
  let reads=0;const p=selected();Object.defineProperty(p,'maxFusedPlasma',{enumerable:true,get(){reads++;return 30000;}});
  assert.throws(()=>policy(p));assert.equal(reads,0);assert.throws(()=>policy(new Proxy(selected(),{get(){reads++;throw Error('trap');}})));assert.equal(reads,0);
  assert.throws(()=>new policy(selected()));assert.throws(()=>policy(selected(),{}));assert.throws(()=>policy(Object.assign(Object.create(null),selected())));
});
check('non-dp-preparation-capture-keeps-exact-generic-original-bytes-and-digest',()=>{
  const f=input(),a=legacyCapture(f.input,f.resourceUrl),b=capture(f.input,f.resourceUrl);assert.deepEqual(b,a);assert.equal(b.preparationInputJson,a.preparationInputJson);assert.equal(b.originalDigest,a.originalDigest);
});
check('non-dp-policy-admission-never-reorders-the-retained-preparation-json',()=>{
  const f=input({maxMomentumAdvances:2,maxFusedPlasma:30000,policyVersion:1});
  const before=JSON.stringify(f.input),a=legacyCapture(f.input,f.resourceUrl),b=capture(f.input,f.resourceUrl);
  assert.equal(b.preparationInputJson,a.preparationInputJson);assert.equal(b.originalDigest,a.originalDigest);
  assert.deepEqual(a,b);assert.equal(JSON.stringify(f.input),before);
  assert.deepEqual(JSON.parse(b.preparationInputJson).plannerContext.readInput.policy,f.input.plannerContext.readInput.policy);
});
check('non-dp-capture-refuses-dp-policy-which-the-generic-capture-still-retains',()=>{
  const f=fundingPostPreparationInputFixture();assert.doesNotThrow(()=>legacyCapture(f.input,f.resourceUrl));assert.throws(()=>capture(f.input,f.resourceUrl));
});
check('non-dp-capture-retains-existing-resource-and-original-header-checks',()=>{
  const f=input();assert.throws(()=>capture(f.input,'https://other.invalid/funding'));const broken=copy(f.input);broken.challenge.paymentRequiredHeader='invalid';assert.throws(()=>capture(broken,f.resourceUrl));
});
check('non-dp-preparation-owner-rejects-dp-policy-before-claim-or-child-entry',async()=>{
  const r=fixture(),bad=fundingPostPreparationInputFixture();await assert.rejects(r.root.prepareOriginalFunding(bad.input));untouched(r);
});
check('non-dp-preparation-owner-rejects-incomplete-policy-without-custody-or-budget-entry',async()=>{
  const r=fixture();delete r.f.input.plannerContext.readInput.policy.maxFusedPlasma;await assert.rejects(r.root.prepareOriginalFunding(r.f.input));untouched(r);
});
check('non-dp-preparation-owner-rejects-unsupported-range-without-consuming-attempt',async()=>{
  const r=fixture();r.f.input.plannerContext.readInput.policy.maxMomentumAdvances=129;await assert.rejects(r.root.prepareOriginalFunding(r.f.input));untouched(r);
});
check('non-dp-known-policy-refusal-can-be-corrected-before-the-first-child-call',async()=>{
  const r=fixture(),bad=copy(r.f.input);bad.plannerContext.readInput.policy.maxFusedPlasma=0;
  await assert.rejects(r.root.prepareOriginalFunding(bad));untouched(r);
  const result=await r.root.prepareOriginalFunding(r.f.input);assert.equal(result.phase,'AWAITING_INDEPENDENT_PINS');assert.equal(r.prepares,1);
  const s=r.root.inspect();assert.equal(s.held,false);assert.equal(s.grantQueryRecovery.prepareClaimed,true);assert.equal(r.retains+r.current+r.queries,0);
});
check('non-dp-admitted-prepare-still-consumes-one-child-attempt',async()=>{
  const r=fixture();await r.root.prepareOriginalFunding(r.f.input);await assert.rejects(r.root.prepareOriginalFunding(r.f.input));assert.equal(r.prepares,1);
});
check('non-dp-admitted-child-refusal-remains-held-and-cannot-be-retried',async()=>{
  const r=fixture({refuseChild:true});await assert.rejects(r.root.prepareOriginalFunding(r.f.input));assert.equal(r.root.inspect().held,true);
  assert.equal(r.root.inspect().grantQueryRecovery.prepareClaimed,true);await assert.rejects(r.root.prepareOriginalFunding(r.f.input));assert.equal(r.prepares,1);
});
check('generic-purchased-owner-retains-its-dp-policy-and-child-failure-contract',async()=>{
  const r=fixture({legacy:true,refuseChild:true}),f=fundingPostPreparationInputFixture();await assert.rejects(r.root.prepareOriginalFunding(f.input));
  assert.equal(r.prepares,1);assert.equal(r.root.inspect().held,true);assert.equal(r.root.inspect().grantQueryRecovery.prepareClaimed,true);
});
check('non-dp-policy-getter-refusal-enters-neither-caller-code-nor-child',async()=>{
  const r=fixture();let entered=0;Object.defineProperty(r.f.input.plannerContext.readInput.policy,'maxFusedPlasma',{enumerable:true,get(){entered++;return 30000;}});
  await assert.rejects(r.root.prepareOriginalFunding(r.f.input));assert.equal(entered,0);untouched(r);
});
check('non-dp-preparation-close-remains-the-same-one-shot-child-stop',async()=>{
  const r=fixture(),bad=copy(r.f.input);bad.plannerContext.readInput.policy.maxFusedPlasma=0;await assert.rejects(r.root.prepareOriginalFunding(bad));
  const first=r.root.close();assert.equal(r.root.close(),first);await first;assert.equal(r.closes,1);await assert.rejects(r.root.prepareOriginalFunding(r.f.input));assert.equal(r.prepares,0);
});
check('non-dp-close-during-existing-inspection-fences-policy-and-child-admission',async()=>{
  const r=fixture();let stop;r.viewHook=()=>{stop=r.root.close();stop.catch(()=>{});};await assert.rejects(r.root.prepareOriginalFunding(r.f.input));await stop;
  assert.equal(r.prepares,0);assert.equal(r.root.inspect().grantQueryRecovery.prepareClaimed,false);assert.equal(r.closes,1);
});
export const nonDpPrepareAdmissionDataCases=F(checks.map(F));
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const results=[];for(const c of checks){try{await c.run();results.push({id:c.id,status:'PASS'});}catch(e){results.push({id:c.id,status:'FAIL',message:String(e?.message??e)});break;}}
  for(const r of owners)await r.root.close().catch(()=>{});
  const passed=results.filter(r=>r.status==='PASS').length,failed=results.filter(r=>r.status==='FAIL').length;
  process.stdout.write(JSON.stringify({qualification:'G1_NON_DP_PREPARE_ADMISSION_DATA',passed,failed,cases:results,
    nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
    childPreparationIsDeclaredAcknowledgement:true,cryptographicPaymentValidity:'NOT_ESTABLISHED',G0G5Acceptance:'OPEN'})+'\n');if(failed)process.exitCode=1;
}
