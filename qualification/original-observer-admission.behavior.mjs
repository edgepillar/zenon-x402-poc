// Actual binding, provider core and owner; observer/file ports are memory DATA.
import assert from 'node:assert/strict';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { enterIssuedProviderOriginalObserver as enter } from '../src/issued-provider-original-observer-admission.js';
import { issuedProviderDataFixture, issuedProviderFundingRequest, issuedProviderFlush as flush } from './issued-grant-provider.behavior.mjs';
import { createIssuedProviderStoreOwnerDataFixture as owned } from './issued-provider-store-owner.behavior.mjs';

const F=Object.freeze,checks=[],tuple=()=>({observerFileName:'funding-observer-'+'a'.repeat(64)+'.sqlite',recordKey:'sha256:'+'7'.repeat(64)});
function check(id,run){checks.push(F({id,run}));}
async function funded(options={}){const f=await issuedProviderDataFixture(options);f.send(issuedProviderFundingRequest(true));await flush();return f;}
function ports(f,options={}){
  const s={trace:[],opens:0},owner=F({declaredObserver:true});
  return {s,owner,p:F({check:F(()=>{s.trace.push('check');return options.check?.(s);}),
    select:F(value=>{s.trace.push('select');return options.select?options.select(value):f.s.root.selectOriginalActivationObserver(value);}),
    open:F(value=>{s.trace.push('open');s.opens++;assert.deepEqual(value,tuple());return options.open?options.open(value):owner;})})};
}
check('original-observer-same-retained-tuple-precedes-one-declared-file-entry',async()=>{
  const f=await funded(),r=ports(f);assert.equal(enter(tuple(),r.p),r.owner);
  assert.deepEqual(r.s.trace,['check','select','check','open']);assert.equal(r.s.opens,1);await f.s.root.close();
});
check('original-observer-selection-does-not-read-or-write-a-store-or-activate-a-grant',async()=>{
  const f=await funded(),before=canonicalJson(f.s.model.exportState()),calls={reads:f.s.reads,service:f.s.serviceCreates,paid:f.s.paid};
  const selected=f.s.root.selectOriginalActivationObserver(tuple());assert.deepEqual(selected,tuple());assert.ok(Object.isFrozen(selected));
  assert.equal(canonicalJson(f.s.model.exportState()),before);assert.deepEqual({reads:f.s.reads,service:f.s.serviceCreates,paid:f.s.paid},calls);
  assert.equal(f.s.model.exportState().grants.length,0);assert.equal(f.s.root.snapshot().serviceAdmissionOpen,false);await f.s.root.close();
});
check('original-observer-before-funding-has-no-file-entry',async()=>{
  const f=await issuedProviderDataFixture(),r=ports(f);assert.throws(()=>enter(tuple(),r.p));assert.equal(r.s.opens,0);await f.s.root.close();
});
check('original-observer-pending-bound-ack-cannot-choose-an-observer',async()=>{
  const f=await funded({pending:true}),r=ports(f);assert.equal(f.s.root.snapshot().binding.officialPhase,'PENDING');
  assert.throws(()=>enter(tuple(),r.p));assert.equal(r.s.opens,0);assert.equal(f.s.root.snapshot().uncertain,false);await f.s.root.close();
});
check('original-observer-active-funding-cannot-enter-another-owner',async()=>{
  const f=await issuedProviderDataFixture({payment(s,d){return d.promise;}});f.send(issuedProviderFundingRequest(true));
  const r=ports(f);assert.throws(()=>enter(tuple(),r.p));assert.equal(r.s.opens,0);
  // This case only exercises the pre-entry guard. A known memory rejection
  // closes through the existing provider protocol; it does not simulate kill.
  f.payment.reject(Error('declared funding refusal'));await flush();await f.s.root.close();
});
check('original-observer-foreign-filename-is-refused-before-file-entry',async()=>{
  const f=await funded(),r=ports(f);assert.throws(()=>enter({...tuple(),observerFileName:'funding-observer-'+'b'.repeat(64)+'.sqlite'},r.p));
  assert.equal(r.s.opens,0);assert.equal(f.s.root.snapshot().uncertain,false);assert.deepEqual(f.s.root.selectOriginalActivationObserver(tuple()),tuple());await f.s.root.close();
});
check('original-observer-foreign-record-key-is-refused-before-file-entry',async()=>{
  const f=await funded(),r=ports(f);assert.throws(()=>enter({...tuple(),recordKey:'sha256:'+'8'.repeat(64)},r.p));assert.equal(r.s.opens,0);
  assert.deepEqual(f.s.root.selectOriginalActivationObserver(tuple()),tuple());await f.s.root.close();
});
check('original-observer-extra-path-or-loader-fields-are-not-an-opening-capability',async()=>{
  const f=await funded(),r=ports(f);for(const extra of [{path:'/synthetic/other.sqlite'},{module:'arbitrary.js'},{close:()=>{}}])assert.throws(()=>enter({...tuple(),...extra},r.p));
  assert.equal(r.s.opens,0);assert.deepEqual(r.s.trace,[]);await f.s.root.close();
});
check('original-observer-malformed-or-partial-tuples-are-refused-before-selection',async()=>{
  const f=await funded(),r=ports(f);for(const input of [null,{},[],{...tuple(),recordKey:'sha256:bad'},{...tuple(),observerFileName:'../other.sqlite'}])assert.throws(()=>enter(input,r.p));
  assert.deepEqual(r.s.trace,[]);await f.s.root.close();
});
check('original-observer-accessor-and-proxy-inputs-invoke-no-hooks',async()=>{
  const f=await funded(),r=ports(f);let calls=0;const input=tuple();Object.defineProperty(input,'recordKey',{enumerable:true,get(){calls++;return tuple().recordKey;}});
  assert.throws(()=>enter(input,r.p));assert.throws(()=>enter(new Proxy({}, {get(){calls++;},ownKeys(){calls++;return [];}}),r.p));
  assert.equal(calls,0);assert.deepEqual(r.s.trace,[]);await f.s.root.close();
});
check('original-observer-current-guard-is-required-again-after-selection',async()=>{
  const f=await funded(),r=ports(f,{check(s){if(s.trace.length>1)throw Error('declared stopped owner');}});assert.throws(()=>enter(tuple(),r.p));
  assert.deepEqual(r.s.trace,['check','select','check']);assert.equal(r.s.opens,0);await f.s.root.close();
});
check('original-observer-nonvoid-guard-never-enters-the-opener',async()=>{
  const f=await funded();for(const value of [null,true,F({}),Promise.resolve(undefined)]){const r=ports(f,{check(){return value;}});assert.throws(()=>enter(tuple(),r.p));assert.equal(r.s.opens,0);}
  await f.s.root.close();
});
check('original-observer-different-selected-tuple-cannot-replace-the-command',async()=>{
  const f=await funded(),r=ports(f,{select(){return F({...tuple(),recordKey:'sha256:'+'8'.repeat(64)});}});assert.throws(()=>enter(tuple(),r.p));assert.equal(r.s.opens,0);await f.s.root.close();
});
check('original-observer-opaque-selection-does-not-read-then-or-open',async()=>{
  const f=await funded();let hooks=0;const opaque=F(Object.defineProperty({},'then',{get(){hooks++;throw Error();}})),r=ports(f,{select(){return opaque;}});
  assert.throws(()=>enter(tuple(),r.p));assert.equal(hooks,0);assert.equal(r.s.opens,0);await f.s.root.close();
});
check('original-observer-actual-opener-return-is-forwarded-without-normalization',async()=>{
  const f=await funded();let hooks=0;const opaque=Object.defineProperty({},'then',{get(){hooks++;throw Error();}}),r=ports(f,{open(){return opaque;}});
  assert.equal(enter(tuple(),r.p),opaque);assert.equal(hooks,0);assert.equal(r.s.opens,1);await f.s.root.close();
});
check('original-observer-opening-failure-never-retries-or-closes-another-owner',async()=>{
  const f=await funded(),r=ports(f,{open(){throw Error('declared opening ambiguity');}});assert.throws(()=>enter(tuple(),r.p));assert.equal(r.s.opens,1);
  assert.deepEqual(r.s.trace,['check','select','check','open']);await f.s.root.close();
});
check('original-observer-closed-provider-cannot-select-a-file',async()=>{
  const f=await funded();await f.s.root.close();const r=ports(f);assert.throws(()=>enter(tuple(),r.p));assert.equal(r.s.opens,0);
});
check('original-observer-service-admission-retires-new-activation-file-selection',async()=>{
  const f=await funded(),grant=f.m.activate();f.s.root.admitCommittedServiceGrant(grant.grantId);const r=ports(f);
  assert.throws(()=>enter(tuple(),r.p));assert.equal(r.s.opens,0);await f.s.root.close();
});
check('original-observer-tuple-is-not-exposed-by-public-provider-snapshots',async()=>{
  const f=await funded();f.s.root.selectOriginalActivationObserver(tuple());const raw=JSON.stringify(f.s.root.snapshot());
  assert.equal(raw.includes(tuple().observerFileName),false);assert.equal(raw.includes(tuple().recordKey),false);await f.s.root.close();
});
check('original-observer-selected-capability-is-forwarded-through-the-real-store-owner',async()=>{
  const f=owned({methods:F(['selectOriginalActivationObserver']),operation(name,args){assert.equal(name,'selectOriginalActivationObserver');assert.deepEqual(args,[tuple()]);return F(tuple());}});
  assert.throws(()=>f.owner.selectOriginalActivationObserver(tuple()));assert.equal(f.s.operatorCalls,0);await f.owner.start();
  assert.deepEqual(f.owner.selectOriginalActivationObserver(tuple()),tuple());assert.equal(f.s.operatorCalls,1);await f.owner.close();
  assert.throws(()=>f.owner.selectOriginalActivationObserver(tuple()));assert.equal(f.s.operatorCalls,1);
});
check('original-observer-extra-arguments-do-not-enter-the-store-owner-target',async()=>{
  const f=owned({methods:F(['selectOriginalActivationObserver'])});await f.owner.start();
  assert.throws(()=>f.owner.selectOriginalActivationObserver(tuple(),{}));assert.equal(f.s.operatorCalls,0);await f.owner.close();
});
check('original-observer-arbitrary-open-close-or-signing-ports-are-rejected',async()=>{
  const f=await funded(),r=ports(f);assert.throws(()=>enter(tuple(),F({...r.p,close:F(()=>{})})));assert.throws(()=>enter(tuple(),{...r.p}));
  assert.throws(()=>enter(tuple(),F({...r.p,select:r.p.check})));assert.deepEqual(r.s.trace,[]);await f.s.root.close();
});
export const originalObserverAdmissionDataCases=F(checks);
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const cases=[];for(const {id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??'unknown').slice(0,256)});break;}}
  const failed=cases.filter(c=>c.status==='FAIL').length;console.log(JSON.stringify({qualification:'G1_ORIGINAL_OBSERVER_PREOPENING_DATA',passed:cases.length-failed,failed,cases,
    observerOpenPorts:'DECLARED_MEMORY_ONLY',nativeExecutions:0,SDK:0,SQLite:0,sockets:0,keys:0,signatures:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,
    observerAuthentication:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED'}));if(failed)process.exitCode=1;
}
