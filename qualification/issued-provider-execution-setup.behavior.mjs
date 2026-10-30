// Actual pure setup/configuration owners. Store, initializer and TLS arguments
// are declared memory DATA; no native factory, SQL, SDK, socket or key is loaded.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { createServiceCreditExecutionContract as contract } from '../src/service-credit-execution-contract.js';
import { captureIssuedProviderExecutionSetup as capture, createIssuedProviderExecutionSetupOwner as create } from '../src/issued-provider-execution-setup.js';
import { decodeIssuedProviderOperatorBootstrap as decode, readIssuedProviderOperatorBootstrap as read, bindIssuedProviderOperatorBootstrap as bind } from '../src/issued-provider-operator-bootstrap.js';
import { captureIssuedProviderOwnedConfiguration as owned } from '../src/issued-provider-owned-configuration.js';
import { issuedProviderCliPublicDataProfile as legacyProfile } from './issued-provider-cli.behavior.mjs';

const F=Object.freeze,clone=v=>JSON.parse(JSON.stringify(v)),checks=[];
function check(id,run){checks.push({id,run});}
function setup(){return {ledgerId:'receipt.provider.once',policy:{policyId:'receipt.execution.v1',policyVersion:1,maxDurationMs:1000},capacity:128};}
function fixture(options={}){
  const selected=setup(),candidate=contract(selected),s={reads:0,inits:0,trace:[],state:options.existing?candidate:null,revision:7};let owner;
  const read=F(()=>{s.reads++;s.trace.push('read');return options.read?options.read(s,owner):F({revision:s.revision,executionState:s.state});});
  const initialize=F(input=>{s.inits++;s.trace.push('initialize');s.input=input;if(options.initialize)return options.initialize(s,input,owner);
    s.revision++;s.state=candidate;return F({disposition:'APPLIED',revision:s.revision,executionState:s.state});});
  owner=create(selected,options.mode??'CREATE_NEW',F({read,...(options.mode==='OPEN_EXISTING'?{}:{initialize})}));return {owner,s,candidate};
}
function profile(mode='FRESH'){const p=legacyProfile(mode);p.providerBootstrapVersion=3;p.funding.pendingObservationMode='JOURNAL_ONLY';p.executionSetup=setup();return p;}
function memoryBinding(p){let calls=0;const now=F(()=>{calls++;throw Error('unexpected clock');}),official=F({localFacilitator:F({}),validateChallenge:F(()=>{calls++;}),reconcilePendingSettlement:F(()=>{calls++;}),maxPendingReconciliations:2});
  const prepared=decode(canonicalJson(p)),bound=bind(prepared,official,{key:Buffer.from('declared unparsed TLS marker'),cert:Buffer.from('declared unparsed TLS marker')},now,null);return {prepared,bound,calls:()=>calls};}

check('execution-setup-explicit-policy-and-capacity-admit-within-both-bounds',()=>{for(const capacity of [100,128,10000]){const v=setup();v.capacity=capacity;const r=capture(v,1000,10000);assert.deepEqual(r,v);assert.equal(Object.isFrozen(r.policy),true);}});
check('execution-setup-missing-or-extra-terms-never-default',()=>{for(const k of ['ledgerId','policy','capacity']){const v=setup();delete v[k];assert.throws(()=>capture(v,100,128));}assert.throws(()=>capture({...setup(),default:true},100,128));});
check('execution-setup-capacity-must-cover-100-and-fit-selected-store',()=>{for(const capacity of [0,99,129,10001,Number.MAX_SAFE_INTEGER]){const v=setup();v.capacity=capacity;assert.throws(()=>capture(v,100,128));}});
check('execution-setup-duration-must-fit-explicit-policy-without-clamping',()=>{const v=setup();assert.throws(()=>capture(v,1001,128));for(const maxDurationMs of [0,60001]){v.policy.maxDurationMs=maxDurationMs;assert.throws(()=>capture(v,100,128));}});
check('execution-setup-rejects-accessor-without-invoking-it',()=>{let calls=0;const v=setup();Object.defineProperty(v,'ledgerId',{enumerable:true,get(){calls++;return 'other';}});assert.throws(()=>capture(v,100,128));assert.equal(calls,0);});
check('execution-setup-rejects-proxy-without-entering-traps',()=>{let calls=0;const v=new Proxy(setup(),{get(){calls++;},ownKeys(){calls++;return [];}});assert.throws(()=>capture(v,100,128));assert.equal(calls,0);});
check('execution-setup-construction-does-not-enter-store-ports',()=>{const f=fixture();assert.deepEqual(f.s.trace,[]);assert.equal(f.owner.inspect().phase,'NEW');});
check('execution-setup-fresh-one-cas-and-exact-durable-readback',()=>{const f=fixture(),result=f.owner.run();assert.deepEqual(f.s.trace,['read','initialize','read']);assert.equal(f.s.input.expectedRevision,7);assert.equal(result.status,'INITIALIZED');assert.equal(result.revision,8);assert.equal(result.authority,'NONE');assert.deepEqual(f.s.state,f.candidate);});
check('execution-setup-fresh-refuses-already-initialized-store-without-writing',()=>{const f=fixture({existing:true});assert.throws(()=>f.owner.run());assert.equal(f.s.inits,0);assert.equal(f.owner.inspect().phase,'HELD');});
check('execution-setup-lost-initialization-result-is-held-with-no-retry',()=>{const f=fixture({initialize(s){s.revision++;s.state=contract(setup());throw Error('declared result loss');}});assert.throws(()=>f.owner.run());assert.throws(()=>f.owner.run());assert.equal(f.s.inits,1);assert.equal(f.s.reads,1);assert.equal(f.owner.inspect().phase,'HELD');assert.ok(f.s.state);});
check('execution-setup-stale-receipt-never-retries-or-opens-next-leg',()=>{const f=fixture({initialize:s=>F({disposition:'STALE',revision:s.revision,executionState:null})});assert.throws(()=>f.owner.run());assert.deepEqual(f.s.trace,['read','initialize']);});
check('execution-setup-wrong-ack-revision-is-held',()=>{const f=fixture({initialize:s=>F({disposition:'APPLIED',revision:s.revision+2,executionState:contract(setup())})});assert.throws(()=>f.owner.run());assert.equal(f.owner.inspect().phase,'HELD');});
check('execution-setup-ack-cannot-substitute-ledger-policy-or-capacity',()=>{for(const field of ['ledgerId','policy','capacity']){const v=setup();if(field==='ledgerId')v.ledgerId='foreign';else if(field==='policy')v.policy.policyVersion++;else v.capacity++;
  const f=fixture({initialize:s=>F({disposition:'APPLIED',revision:s.revision+1,executionState:contract(v)})});assert.throws(()=>f.owner.run());assert.equal(f.s.reads,1);}});
check('execution-setup-ack-readback-revision-must-still-match',()=>{const f=fixture({read(s){return F({revision:s.revision+(s.reads===2?1:0),executionState:s.state});}});assert.throws(()=>f.owner.run());assert.equal(f.s.inits,1);assert.equal(f.s.reads,2);});
check('execution-setup-ack-readback-state-must-still-match',()=>{const f=fixture({read(s){return F({revision:s.revision,executionState:s.reads===2?null:s.state});}});assert.throws(()=>f.owner.run());assert.equal(f.owner.inspect().phase,'HELD');});
check('execution-setup-opaque-read-result-is-never-awaited',()=>{const f=fixture({read:()=>Promise.resolve({revision:1,executionState:null})});assert.throws(()=>f.owner.run());assert.equal(f.s.inits,0);});
check('execution-setup-opaque-initializer-result-is-never-awaited',()=>{const f=fixture({initialize:()=>Promise.resolve(true)});assert.throws(()=>f.owner.run());assert.equal(f.s.reads,1);assert.equal(f.s.inits,1);});
check('execution-setup-reentry-stays-held-before-initialization',()=>{const f=fixture({read(s,owner){assert.throws(()=>owner.run());return F({revision:s.revision,executionState:s.state});}});assert.throws(()=>f.owner.run());assert.equal(f.s.inits,0);assert.equal(f.owner.inspect().phase,'HELD');});
check('execution-setup-existing-mode-only-reads-and-preserves-generation',()=>{const f=fixture({mode:'OPEN_EXISTING',existing:true}),before=canonicalJson(f.s.state),result=f.owner.run();assert.deepEqual(f.s.trace,['read']);assert.equal(result.status,'EXISTING');assert.equal(result.revision,7);assert.equal(canonicalJson(f.s.state),before);assert.equal(f.s.inits,0);});
check('execution-setup-existing-mode-never-initializes-a-missing-contract',()=>{const f=fixture({mode:'OPEN_EXISTING'});assert.throws(()=>f.owner.run());assert.equal(f.s.inits,0);assert.equal(f.owner.inspect().phase,'HELD');});
check('execution-setup-existing-mode-refuses-a-different-original-profile',()=>{const v=setup();v.ledgerId='foreign';const f=fixture({mode:'OPEN_EXISTING',read:()=>F({revision:7,executionState:contract(v)})});assert.throws(()=>f.owner.run());assert.equal(f.s.inits,0);});
check('execution-setup-existing-mode-refuses-an-initializer-capability',()=>{let calls=0;assert.throws(()=>create(setup(),'OPEN_EXISTING',F({read:F(()=>{calls++;}),initialize:F(()=>{calls++;})})));assert.equal(calls,0);});
check('execution-setup-max-revision-refuses-before-initialization',()=>{const f=fixture({read:()=>F({revision:Number.MAX_SAFE_INTEGER,executionState:null})});assert.throws(()=>f.owner.run());assert.equal(f.s.inits,0);});
check('execution-setup-v3-real-bootstrap-binding-and-owned-capture-preserve-terms',()=>{for(const mode of ['FRESH','RECORDED','JOURNAL','WITNESSED']){const p=profile(mode),f=memoryBinding(p);
  const observation=mode==='JOURNAL'?F({journal:F({})}):mode==='WITNESSED'?F({journal:F({}),transitionWitness:F({})}):null;
  const lease=owned({...f.bound,observation});assert.deepEqual(lease.configuration.executionSetup,p.executionSetup);assert.equal(f.calls(),0);lease.release();}});
check('execution-setup-v3-missing-terms-and-duration-conflict-refuse-in-decoder',()=>{const p=profile();delete p.executionSetup;assert.throws(()=>decode(canonicalJson(p)));const q=profile();q.service.selectedDurationMs=1001;assert.throws(()=>decode(canonicalJson(q)));});
check('execution-setup-legacy-v1-v2-data-decoders-cannot-smuggle-new-terms',()=>{for(const version of [1,2]){const p=legacyProfile();p.providerBootstrapVersion=version;if(version===2)p.funding.pendingObservationMode='JOURNAL_ONLY';assert.equal(read(decode(canonicalJson(p))).providerBootstrapVersion,version);p.executionSetup=setup();assert.throws(()=>decode(canonicalJson(p)));}});

export const issuedProviderExecutionSetupDataCases=F([...checks]);
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const cases=[];for(const c of checks){try{c.run();cases.push({id:c.id,status:'PASS'});}catch(e){cases.push({id:c.id,status:'FAIL',error:String(e?.message??'UNKNOWN').slice(0,500)});}}
  const failed=cases.filter(v=>v.status==='FAIL').length;console.log(JSON.stringify({qualification:'G1_ISSUED_PROVIDER_EXECUTION_SETUP_DATA',passed:cases.length-failed,failed,cases,
    actualPureSetupAndConfiguration:true,storeAndTLSInputs:'DECLARED_MEMORY_ONLY',nativeExecutions:0,SDK:0,SQLite:0,sockets:0,keys:0,signatures:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
    nativeSetup:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED',G1G2:'OPEN'}));if(failed)process.exitCode=1;
}
