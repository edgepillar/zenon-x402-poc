// Actual coordinator and diagnostic DATA over explicitly declared memory ports.
// Native CLI/pipes, SDK/core, SQLite, keys, signatures and sockets stay unexecuted.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { createNonDpApiCreditOperatorCoordinator } from '../src/api-credit-operator-coordinator.js';
import { captureApiCreditCliArguments } from '../src/api-credit-cli-arguments.js';
import { assertSdk105NonDpApiCreditProductSelection } from '../src/zenon/sdk105-api-credit-product-profile.js';
import { apiCreditOperatorDataFixtures,closeApiCreditOperatorDataFixtures } from './api-credit-operator.behavior.mjs';
import { isApiCreditPublicProfileRefusal as known,API_CREDIT_PUBLIC_PROFILE_REFUSAL_STDERR as marker } from '../src/api-credit-operator-result.js';

const F=Object.freeze,checks=[];
function check(id,fn){checks.push(F({id,fn}));}
function editOffer(r){const p=JSON.parse(r.purchaseExpectationJson);p.offer.offerVersion++;r.purchaseExpectationJson=canonicalJson(p);}
const args=captureApiCreditCliArguments(['--profile-fd','3','--key-fd','4','--input-fd','5','--output-fd','6','--bootstrap-ms','1000']);
function nonDp(options={}){
 const r=apiCreditOperatorDataFixtures.declaredOperator(options),raw=JSON.parse(r.profile.toString('utf8'));
 const funding=raw.configuration.fundingOptions;funding.expectedPublicKey=funding.materialOptions.publicKey;delete funding.materialOptions;delete funding.materialWaitMs;
 r.profile.fill(0);r.profile=Buffer.from(canonicalJson(raw));r.nonDpRaw=raw;
 r.ports.openSession=F((selection,guard,limits)=>{guard();r.guards.session=guard;r.trace.push('session');r.calls.session++;r.selection=selection;
  assert.equal(assertSdk105NonDpApiCreditProductSelection(selection),selection);assert.ok(limits.maxCommands>=106);selection.release();return Promise.resolve(r.session);});
 r.start=()=>createNonDpApiCreditOperatorCoordinator({arguments:args,ports:F(r.ports)}).run();return r;
}
function refused(){return apiCreditOperatorDataFixtures.declaredOperator({edit:editOffer});}
function baseline(){return F({apiCreditOperatorCliVersion:1,status:'BOOTSTRAP_REFUSED',exitCode:1,stage:'PROFILE',publicProfileAdmission:'REFUSED',credentialReadEntered:false,
 keyCreationEntered:false,sessionOpeningEntered:false,sessionAccepted:false,knownStopsObserved:true,keyLease:null,historicalObservation:true,keyErasure:'NOT_ESTABLISHED',
 nativeResourceRelease:'NOT_ESTABLISHED',serviceDelivery:'NOT_ESTABLISHED',automaticRetry:false,authority:'NONE'});}

check('public-profile-refusal-comes-from-the-real-purchase-decoder-before-credential',async()=>{
 const r=refused(),result=await r.start();assert.equal(result.publicProfileAdmission,'REFUSED');assert.equal(result.credentialReadEntered,false);
 assert.equal(known(result),true);assert.equal(result.exitCode,1);assert.equal(result.status,'BOOTSTRAP_REFUSED');assert.deepEqual(r.trace,['profile','inputs-close']);
 assert.equal(r.calls.key+r.calls.session+r.calls.host,0);assert.equal(r.calls.inputs,1);assert.ok(r.profile.every(v=>v===0));
});
check('public-profile-refusal-also-classifies-the-fixed-non-dp-coordinator',async()=>{
 const r=nonDp({edit:editOffer}),result=await r.start();assert.equal(known(result),true);assert.equal(result.publicProfileAdmission,'REFUSED');assert.equal(result.credentialReadEntered,false);assert.equal(r.calls.key,0);
});
check('public-profile-success-remains-the-existing-closed-operator-result',async()=>{
 const r=apiCreditOperatorDataFixtures.declaredOperator(),result=await r.start();assert.equal(result.status,'CLOSED');assert.equal(result.exitCode,0);
 assert.equal(result.publicProfileAdmission,'ACCEPTED');assert.equal(result.credentialReadEntered,true);assert.equal(known(result),false);
 assert.equal(r.calls.key,1);assert.equal(r.calls.session,1);assert.equal(r.calls.host,1);assert.equal(r.calls.keyStop,1);assert.equal(r.calls.inputs,1);
});
check('public-profile-valid-non-dp-bootstrap-gets-no-refusal-label',async()=>{
 const r=nonDp(),result=await r.start();assert.equal(result.publicProfileAdmission,'ACCEPTED');assert.equal(result.credentialReadEntered,true);assert.equal(result.status,'CLOSED');assert.equal(known(result),false);
});
check('public-profile-read-rejection-is-not-a-decoder-refusal',async()=>{
 const r=apiCreditOperatorDataFixtures.declaredOperator({readProfile:()=>Promise.reject(Error('private I/O'))}),v=await r.start();
 assert.equal(v.publicProfileAdmission,'NOT_ATTEMPTED');assert.equal(v.credentialReadEntered,false);assert.equal(known(v),false);assert.equal(v.status,'BOOTSTRAP_REFUSED');assert.equal(JSON.stringify(v).includes('private I/O'),false);
});
check('public-profile-malformed-byte-view-is-not-misreported-as-offer-admission',async()=>{
 const r=apiCreditOperatorDataFixtures.declaredOperator();r.profile=Buffer.from([255,254]);const v=await r.start();assert.equal(v.publicProfileAdmission,'NOT_ATTEMPTED');assert.equal(v.credentialReadEntered,false);assert.equal(known(v),false);assert.equal(r.calls.key,0);
});
check('public-profile-nonbuffer-read-is-not-misreported-as-a-decoder-refusal',async()=>{
 const r=apiCreditOperatorDataFixtures.declaredOperator({readProfile:()=>Promise.resolve('unselected')}),v=await r.start();assert.equal(v.publicProfileAdmission,'NOT_ATTEMPTED');assert.equal(known(v),false);assert.equal(v.credentialReadEntered,false);
});
check('public-profile-truncated-json-reaches-the-decoder-and-is-known-only-after-clean-stop',async()=>{
 const r=apiCreditOperatorDataFixtures.declaredOperator({text:'{'}),v=await r.start();assert.equal(v.publicProfileAdmission,'REFUSED');assert.equal(v.knownStopsObserved,true);assert.equal(known(v),true);assert.equal(r.calls.inputs,1);
});
check('public-profile-empty-credential-after-valid-data-cannot-pass-the-refusal-scenario',async()=>{
 const r=apiCreditOperatorDataFixtures.declaredOperator({keyBytes:0}),v=await r.start();assert.equal(v.publicProfileAdmission,'ACCEPTED');assert.equal(v.credentialReadEntered,true);
 assert.equal(v.status,'BOOTSTRAP_REFUSED');assert.equal(v.keyCreationEntered,false);assert.equal(known(v),false);assert.deepEqual(r.trace,['profile','credential','inputs-close']);
});
check('public-profile-credential-read-rejection-keeps-the-generic-bootstrap-diagnostic',async()=>{
 const r=apiCreditOperatorDataFixtures.declaredOperator({readCredential:()=>Promise.reject(Error('private credential'))}),v=await r.start();
 assert.equal(v.publicProfileAdmission,'ACCEPTED');assert.equal(v.credentialReadEntered,true);assert.equal(known(v),false);assert.equal(JSON.stringify(v).includes('private credential'),false);
});
check('public-profile-shared-credential-refusal-is-not-attributed-to-the-profile',async()=>{
 const r=apiCreditOperatorDataFixtures.declaredOperator();r.credential=Buffer.from(new SharedArrayBuffer(32));const v=await r.start();assert.equal(v.publicProfileAdmission,'ACCEPTED');assert.equal(v.credentialReadEntered,true);assert.equal(known(v),false);
});
check('public-profile-key-opener-failure-remains-unknown-with-no-refusal-label',async()=>{
 const r=apiCreditOperatorDataFixtures.declaredOperator({createKey:()=>Promise.reject(Error('declared unreturned key'))}),v=await r.start();assert.equal(v.status,'CLOSE_UNKNOWN');assert.equal(v.publicProfileAdmission,'ACCEPTED');assert.equal(v.keyCreationEntered,true);assert.equal(known(v),false);assert.equal(r.calls.key,1);
});
check('public-profile-decoder-refusal-cannot-hide-input-close-failure',async()=>{
 const r=apiCreditOperatorDataFixtures.declaredOperator({edit:editOffer,closeInputs:()=>Promise.reject(Error('declared close'))}),v=await r.start();assert.equal(v.publicProfileAdmission,'REFUSED');assert.equal(v.status,'CLOSE_UNKNOWN');assert.equal(known(v),false);assert.equal(r.calls.key,0);
});
check('public-profile-decoder-refusal-cannot-hide-nonvoid-input-close',async()=>{
 const r=apiCreditOperatorDataFixtures.declaredOperator({edit:editOffer,closeInputs:()=>Promise.resolve(true)}),v=await r.start();assert.equal(v.publicProfileAdmission,'REFUSED');assert.equal(v.status,'CLOSE_UNKNOWN');assert.equal(known(v),false);assert.equal(r.calls.inputs,1);
});
check('public-profile-decoder-refusal-cannot-hide-timer-cancellation-failure',async()=>{
 const r=refused();r.ports.cancelTimer=F(()=>{throw Error('declared timer');});const v=await r.start();assert.equal(v.publicProfileAdmission,'REFUSED');assert.equal(v.status,'CLOSE_UNKNOWN');assert.equal(known(v),false);
});
check('public-profile-earlier-refusal-metadata-cannot-relabel-a-later-credential-failure',async()=>{
 const first=await refused().start(),r=apiCreditOperatorDataFixtures.declaredOperator({readCredential:()=>Promise.reject(first)}),v=await r.start();assert.equal(known(first),true);assert.equal(v.publicProfileAdmission,'ACCEPTED');assert.equal(v.credentialReadEntered,true);assert.equal(known(v),false);
});
check('public-profile-refusal-is-sanitized-and-contains-no-original-private-diagnostics',async()=>{
 const r=refused(),raw=r.profile.toString(),v=await r.start(),s=JSON.stringify(v);assert.equal(s.includes(raw),false);assert.equal(s.includes('-----BEGIN'),false);assert.equal(s.includes('ServiceCredit '),false);assert.equal(s.includes('/synthetic/'),false);
});
check('public-profile-result-fields-do-not-create-key-erasure-release-delivery-or-retry-authority',async()=>{
 const v=await refused().start();for(const k of ['keyErasure','nativeResourceRelease','serviceDelivery'])assert.equal(v[k],'NOT_ESTABLISHED');assert.equal(v.authority,'NONE');assert.equal(v.automaticRetry,false);assert.equal(v.keyLease,null);
});
check('public-profile-constant-cli-marker-contains-no-private-context',()=>{assert.equal(marker,'API_CREDIT_OPERATOR_PUBLIC_PROFILE_REFUSED\n');assert.ok(Buffer.byteLength(marker)<128);});
check('public-profile-classifier-accepts-only-its-complete-frozen-own-data-contract',()=>{
 const v=baseline();assert.equal(known(v),true);assert.equal(known({...v}),false);for(const key of Object.keys(v)){const x={...v};delete x[key];assert.equal(known(F(x)),false);}
});
check('public-profile-classifier-refuses-any-entered-credential-key-or-session',()=>{
 for(const key of ['credentialReadEntered','keyCreationEntered','sessionOpeningEntered','sessionAccepted'])assert.equal(known(F({...baseline(),[key]:true})),false);
});
check('public-profile-classifier-refuses-accepted-unattempted-or-other-stage-metadata',()=>{
 for(const value of ['ACCEPTED','NOT_ATTEMPTED',null,undefined])assert.equal(known(F({...baseline(),publicProfileAdmission:value})),false);
 for(const stage of ['CREDENTIAL','KEY','SESSION','COMMANDS'])assert.equal(known(F({...baseline(),stage})),false);
});
check('public-profile-classifier-refuses-unknown-or-success-status-and-exit-combinations',()=>{
 for(const [status,exitCode]of [['CLOSED',0],['CLOSE_UNKNOWN',4],['BOOTSTRAP_REFUSED',4],['CLOSED',1]])assert.equal(known(F({...baseline(),status,exitCode})),false);
});
check('public-profile-classifier-requires-known-stop-and-no-key-lease',()=>{
 assert.equal(known(F({...baseline(),knownStopsObserved:false})),false);assert.equal(known(F({...baseline(),keyLease:F({close:F(()=>{})})})),false);
});
check('public-profile-classifier-cannot-claim-established-release-or-new-authority',()=>{
 for(const key of ['keyErasure','nativeResourceRelease','serviceDelivery'])assert.equal(known(F({...baseline(),[key]:'ESTABLISHED'})),false);
 assert.equal(known(F({...baseline(),authority:'GRANT'})),false);assert.equal(known(F({...baseline(),automaticRetry:true})),false);
});
check('public-profile-classifier-does-not-enter-accessors',()=>{
 for(const key of Object.keys(baseline())){let calls=0;const v={...baseline()};Object.defineProperty(v,key,{enumerable:true,get(){calls++;return baseline()[key];}});F(v);assert.equal(known(v),false);assert.equal(calls,0);}
});
check('public-profile-classifier-does-not-enter-proxy-hooks',()=>{
 let calls=0;const v=new Proxy({}, {get(){calls++;},ownKeys(){calls++;return [];},getPrototypeOf(){calls++;return Object.prototype;}});assert.equal(known(v),false);assert.equal(calls,0);
});
check('public-profile-classifier-does-not-accept-inherited-or-wrong-prototype-facts',()=>{
 assert.equal(known(F(Object.create(baseline()))),false);assert.equal(known(F(Object.assign(Object.create(null),baseline()))),false);
});
check('public-profile-classifier-refuses-primitives-functions-arrays-and-extra-call-arguments',()=>{
 for(const v of [null,undefined,0,'refused',F([]),F(()=>{})])assert.equal(known(v),false);assert.equal(known(),false);assert.equal(known(baseline(),{}),false);
});
check('public-profile-classifier-uses-captured-intrinsics-after-module-admission',()=>{
 const v=baseline(),p=[Object.getPrototypeOf,Object.isFrozen,Object.getOwnPropertyDescriptor,Object.entries,types.isProxy];
 try{Object.getPrototypeOf=()=>{throw Error('changed');};Object.isFrozen=()=>false;Object.getOwnPropertyDescriptor=()=>{throw Error('changed');};Object.entries=()=>{throw Error('changed');};types.isProxy=()=>true;assert.equal(known(v),true);}
 finally{[Object.getPrototypeOf,Object.isFrozen,Object.getOwnPropertyDescriptor,Object.entries,types.isProxy]=p;}
});

export async function runPublicProfileRefusalBehavior(){
 const cases=[];try{for(const {id,fn}of checks){try{await fn();cases.push({id,status:'PASS'});}catch{cases.push({id,status:'FAIL'});}}}
 finally{await closeApiCreditOperatorDataFixtures();}
 return {qualification:'G1_PUBLIC_PROFILE_REFUSAL_DATA',passed:cases.filter(c=>c.status==='PASS').length,failed:cases.filter(c=>c.status==='FAIL').length,cases,nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await runPublicProfileRefusalBehavior();process.stdout.write(JSON.stringify(r)+'\n');if(r.failed)process.exitCode=1;}
