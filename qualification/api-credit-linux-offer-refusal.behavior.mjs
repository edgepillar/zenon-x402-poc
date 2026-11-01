// Actual V7 selection and product bootstrap decoder over declared DATA only.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { decodeNonDpApiCreditOperatorBootstrap } from '../src/api-credit-operator-bootstrap.js';
import { API_CREDIT_PUBLIC_PROFILE_REFUSAL_STDERR as marker } from '../src/api-credit-operator-result.js';
import { closeApiCreditOperatorDataFixtures } from './api-credit-operator.behavior.mjs';
import { createApiCreditLinuxProviderDataFixture } from './api-credit-linux-provider.fixture.mjs';
import { captureApiCreditOfferRefusalAcceptanceSelection as capture,apiCreditOfferRefusalAcceptancePlan as plan,
 apiCreditOfferRefusalNegativeSelection as negative } from './api-credit-linux-offer-refusal-contract.mjs';

const F=Object.freeze,checks=[];let saved=null;
function check(id,fn){checks.push(F({id,fn}));}
async function fixture(){
 if(saved===null){
  const input=(await createApiCreditLinuxProviderDataFixture()).input,run=JSON.parse(input.runProfile),request=JSON.parse(JSON.parse(input.commands.split('\n')[4]).input.originalRequestJson);
  run.operatorBootstrapVersion=3;run.productProfileVersion=3;run.loopbackRead={profile:'LOOPBACK_QUALIFICATION_V1',port:4444};
  const endpoint=path=>({route:{hostname:'localhost',ipv4Address:'127.0.0.1',path},timeoutMs:200,closeGraceMs:100});
  run.configuration.fundingOptions.readSessionOptions={endpoints:[endpoint('/rpc/first'),endpoint('/rpc/second')],accountEndpoint:endpoint('/rpc/account')};
  saved={...input,runProfile:canonicalJson(run),negativeProfile:canonicalJson({negativeAcceptanceVersion:1,foreignGrantId:'acceptance.foreign',changedRequestId:'acceptance.tampered',changedMaxCostUnits:request.maxCostUnits+1}),
   offerRefusalProfile:canonicalJson({offerRefusalVersion:1,offerVersion:JSON.parse(run.purchaseExpectationJson).offer.offerVersion+1})};
 }
 return {...saved};
}
function edit(input,name,fn){const value=JSON.parse(input[name]);fn(value);input[name]=canonicalJson(value);}
check('linux-offer-refusal-retains-the-whole-v6-and-existing-original-transcript',async()=>{
 const input=await fixture(),t=capture(input);assert.equal(t.summary.version,7);assert.equal(negative(t).summary.version,6);assert.equal(t.summary.negativeSelectionDigest,negative(t).summary.selectionDigest);
 assert.equal(t.summary.commandFrames,106);assert.equal(t.summary.distinctRequests,100);assert.equal(t.summary.exactReplays,1);assert.equal(t.summary.negativeServiceRequests,3);assert.equal(Object.keys(t.summary.inputPins).length,12);
});
check('linux-offer-refusal-changes-only-the-preselected-public-purchase-offer-version',async()=>{
 const input=await fixture(),p=plan(capture(input)),old=JSON.parse(input.runProfile),changed=JSON.parse(p.profile),a=JSON.parse(old.purchaseExpectationJson),b=JSON.parse(changed.purchaseExpectationJson);
 assert.equal(b.offer.offerVersion,JSON.parse(input.offerRefusalProfile).offerVersion);b.offer.offerVersion=a.offer.offerVersion;assert.deepEqual(a,b);
 changed.purchaseExpectationJson=old.purchaseExpectationJson;assert.deepEqual(changed,old);
});
check('linux-offer-refusal-uses-the-real-decoder-with-a-valid-positive-control',async()=>{
 const input=await fixture(),valid=decodeNonDpApiCreditOperatorBootstrap(input.runProfile);valid.release();assert.throws(()=>decodeNonDpApiCreditOperatorBootstrap(plan(capture(input)).profile));
});
check('linux-offer-refusal-requires-the-specific-clean-precredential-cli-marker-and-exit',async()=>{
 const p=plan(capture(await fixture()));assert.equal(p.expectedExitCode,1);assert.equal(p.expectedStderr,marker);assert.equal(p.credentialBytesProvided,0);assert.equal(p.commandFrames,0);assert.equal(p.expectedReplyFrames,0);assert.equal(p.credentialEOFIsNotAProfileRefusal,true);
});
check('linux-offer-refusal-keeps-provider-and-credential-ports-unentered-in-its-plan',async()=>{
 const t=capture(await fixture());assert.equal(t.summary.offerRefusalProcesses,1);assert.equal(t.summary.offerRefusalBeforeProviderOrCredential,true);assert.equal(t.summary.offerRefusalCredentialBytes,0);assert.equal(t.summary.offerRefusalCommands,0);assert.equal(Object.isFrozen(plan(t)),true);
});
check('linux-offer-refusal-profile-is-explicit-canonical-closed-and-versioned',async()=>{
 for(const change of [p=>p.offerRefusalVersion=2,p=>p.factory='unselected',p=>delete p.offerVersion]){const input=await fixture();edit(input,'offerRefusalProfile',change);assert.throws(()=>capture(input));}
 const input=await fixture();input.offerRefusalProfile+=' ';assert.throws(()=>capture(input));
});
check('linux-offer-refusal-version-must-be-a-different-positive-safe-integer',async()=>{
 const input=await fixture(),version=JSON.parse(JSON.parse(input.runProfile).purchaseExpectationJson).offer.offerVersion;
 for(const value of [version,0,-1,1.5,'2',null]){const v={...input};edit(v,'offerRefusalProfile',p=>p.offerVersion=value);assert.throws(()=>capture(v));}
});
check('linux-offer-refusal-does-not-adopt-or-repair-an-invalid-positive-purchase',async()=>{
 const input=await fixture();edit(input,'runProfile',r=>{const p=JSON.parse(r.purchaseExpectationJson);p.terms.totalUnits++;r.purchaseExpectationJson=canonicalJson(p);});assert.throws(()=>capture(input));
});
check('linux-offer-refusal-retains-the-same-signer-ledger-and-provider-selection-digests',async()=>{
 const t=capture(await fixture()),n=negative(t);for(const key of ['signerSelectionDigest','budgetSelectionDigest','providerSelectionDigest'])assert.equal(t.summary[key],n.summary[key]);assert.deepEqual(t.summary.providerReplyPins,n.summary.providerReplyPins);
});
check('linux-offer-refusal-does-not-learn-an-expectation-from-child-output',async()=>{
 const input=await fixture(),rows=input.runReplies.trimEnd().split('\n').map(JSON.parse);rows[2].result.transactionHash='f'.repeat(64);input.runReplies=rows.map(r=>canonicalJson(r)+'\n').join('');assert.throws(()=>capture(input));
});
check('linux-offer-refusal-binds-preselected-mutation-and-preserves-the-original-inputs',async()=>{
 const a=await fixture(),original={...a},t=capture(a),oldPlan=plan(t);edit(a,'offerRefusalProfile',p=>p.offerVersion++);const changed=capture(a);
 assert.notEqual(changed.summary.selectionDigest,t.summary.selectionDigest);assert.notEqual(plan(changed).profilePin.sha256,oldPlan.profilePin.sha256);assert.equal(plan(t),oldPlan);
 for(const key of Object.keys(original).filter(k=>k!=='offerRefusalProfile'))assert.equal(a[key],original[key]);
});
check('linux-offer-refusal-summary-exposes-pins-and-no-private-profile-or-proof-bytes',async()=>{
 const input=await fixture(),t=capture(input),text=JSON.stringify(t.summary);assert.ok(Buffer.byteLength(text)<8192);assert.equal(text.includes(plan(t).profile),false);assert.equal(text.includes('/synthetic/'),false);assert.equal(text.includes('ServiceCredit '),false);
});
check('linux-offer-refusal-token-copies-proxies-and-extra-arguments-do-not-select-a-plan',async()=>{
 const t=capture(await fixture());assert.throws(()=>plan(F({...t})));assert.throws(()=>negative(F({...t})));assert.throws(()=>plan(new Proxy(t,{})));assert.throws(()=>plan(t,{}));
});
check('linux-offer-refusal-selection-refuses-accessors-and-proxies-without-hooks',async()=>{
 const input=await fixture();let calls=0;Object.defineProperty(input,'offerRefusalProfile',{enumerable:true,get(){calls++;return '{}';}});assert.throws(()=>capture(input));assert.throws(()=>capture(new Proxy({},{ownKeys(){calls++;return [];}})));assert.equal(calls,0);
});
check('linux-offer-refusal-keeps-native-payment-concurrency-and-product-gates-open',async()=>{
 const t=capture(await fixture());assert.equal(t.summary.publicOfferRefusalAcceptance,'NOT_EXECUTED');assert.equal(t.summary.differentPaymentIdentityAcceptance,'NOT_ESTABLISHED');assert.equal(t.summary.authority,'NONE');assert.equal(t.summary.G1Acceptance,'NOT_ESTABLISHED');assert.equal(t.summary.G2Acceptance,'NOT_ESTABLISHED');
});
export async function runLinuxOfferRefusalBehavior(){
 const cases=[];try{for(const {id,fn}of checks){try{await fn();cases.push({id,status:'PASS'});}catch{cases.push({id,status:'FAIL'});}}}
 finally{await closeApiCreditOperatorDataFixtures();}
 return {qualification:'G1_LINUX_PUBLIC_OFFER_REFUSAL_DATA',passed:cases.filter(c=>c.status==='PASS').length,failed:cases.filter(c=>c.status==='FAIL').length,cases,nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await runLinuxOfferRefusalBehavior();process.stdout.write(JSON.stringify(r)+'\n');if(r.failed)process.exitCode=1;}
