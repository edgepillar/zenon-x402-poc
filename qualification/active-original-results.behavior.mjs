// Actual local owners and recorded provider core, with declared memory
// ledger/session/proof/channel ports. No native store, SDK or HTTP runs here.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { createIssuedOriginalResultGrantBinding as resultBinding, createIssuedRecordedResultGrantBinding as inactiveBinding } from '../src/issued-recorded-result-grant-binding.js';
import { decodeIssuedProviderControlCommand as decode } from '../src/issued-provider-operator-control.js';
import { issuedOriginalGrantAdmissionDataFixture as fixture } from './issued-original-grant-admission.behavior.mjs';
import { issuedProviderCliDataFixture as control } from './issued-provider-cli.behavior.mjs';
import { issuedProviderRecoveryDataFlush as flush } from './issued-provider-recovery.behavior.mjs';

const F=Object.freeze,checks=[];
function check(id,run){checks.push(F({id,run}));}
function clone(value){return JSON.parse(JSON.stringify(value));}
function deep(value){if(value!==null&&typeof value==='object'){for(const v of Object.values(value))deep(v);F(value);}return value;}
function line(operation,id=operation,argument=null){return canonicalJson({version:1,id,operation,argument});}
async function known(lifecycle='ACTIVE',options={}){
 const f=await fixture(options),grant=f.ledger.activate();if(lifecycle==='REVOKED')f.ledger.m.revokeGrant({grantId:grant.grantId});if(lifecycle==='EXPIRED')f.ledger.setNow(1000);
 const stored=f.ledger.m.getGrant(grant.grantId),c=f.config.funding.intake;return {...f,grant:stored,hash:f.root.snapshot().binding.transactionHash,bindingOptions:{issuedFrame:f.f.x.d.config.issuedFrame,resourceUrl:c.resourceUrl,selection:c.selection}};
}
async function original(outcome='SUCCEEDED',count=1){
 const first=await known();if(outcome==='SUCCEEDED'){first.owner.admitOriginalCommittedServiceGrant();for(let i=0;i<count;i++){first.send(first.serviceRequest('original.'+i));await flush();}}
 else{const request={modelVersion:1,grantId:first.grant.grantId,requestId:'original.0',method:'POST',routeId:'api.fixed',canonicalBodyDigest:'sha256:'+'a'.repeat(64),selectedContentType:'application/json',maxCostUnits:1};
  first.ledger.m.reserveRequest(request);first.ledger.m.beginExecution({grantId:first.grant.grantId,requestId:'original.0'});if(outcome==='OUTCOME_UNKNOWN')first.ledger.m.markOutcomeUnknown({grantId:first.grant.grantId,requestId:'original.0'});}
 const state=first.ledger.m.exportState();await first.owner.close();const next=await fixture({provider:{state}});return {first,next,grantId:first.grant.grantId};
}
async function held(f){assert.throws(()=>f.owner.admitOriginalCommittedServiceGrantResults());assert.equal(f.owner.snapshot().held,true);await assert.rejects(f.owner.close());assert.equal(f.t.admissions,0);}

check('active-original-results-binding-is-explicit-and-inactive-default-stays-strict',async()=>{
 const f=await known();assert.throws(()=>inactiveBinding(f.bindingOptions).captureCommittedGrant(f.grant,f.grant.grantId,f.hash));const r=resultBinding(f.bindingOptions).captureCommittedGrant(f.grant,f.grant.grantId,f.hash);assert.equal(r.serviceMode,'RECORDED_RESULT_ONLY');assert.equal(r.authority,'NONE');assert.equal(r.grantActivation,'NONE');await f.owner.close();
});
check('active-original-results-binding-accepts-all-three-original-lifecycles-without-refresh',async()=>{
 for(const lifecycle of ['ACTIVE','EXPIRED','REVOKED']){const f=await known(lifecycle),before=canonicalJson(f.ledger.m.exportState()),binding=resultBinding(f.bindingOptions);assert.equal(binding.captureCommittedGrant(f.grant,f.grant.grantId,f.hash).serviceMode,'RECORDED_RESULT_ONLY');assert.throws(()=>binding.captureCommittedGrant(f.grant,f.grant.grantId,f.hash));assert.equal(canonicalJson(f.ledger.m.exportState()),before);await f.owner.close();}
});
check('active-original-results-binding-keeps-original-payer-scheme-flow-and-identity',async()=>{
 const f=await known();for(const change of [g=>{g.activation.payer='foreign';},g=>{g.activation.scheme='other';},g=>{g.activation.paymentFlow='other';},g=>{g.activation.paymentIntentDigest='sha256:'+'f'.repeat(64);},g=>{g.availableUnits++;}]){const g=clone(f.grant);change(g);assert.throws(()=>resultBinding(f.bindingOptions).captureCommittedGrant(deep(g),f.grant.grantId,f.hash));}await f.owner.close();
});
check('active-original-results-binding-refuses-caller-mode-clock-and-getter-options',async()=>{
 const f=await known();let calls=0;const c={...f.bindingOptions};Object.defineProperty(c,'now',{enumerable:true,get(){calls++;throw Error();}});assert.throws(()=>resultBinding(c));assert.equal(calls,0);assert.throws(()=>resultBinding({...f.bindingOptions,mode:'DURABLE_EXECUTION'}));assert.throws(()=>resultBinding(f.bindingOptions,true));await f.owner.close();
});
check('active-original-results-opens-only-the-recorded-reader-for-an-active-grant',async()=>{
 const f=await known(),before=canonicalJson(f.ledger.m.exportState()),r=f.owner.admitOriginalCommittedServiceGrantResults();assert.equal(r.serviceMode,'RECORDED_RESULT_ONLY');assert.equal(r.history.record.storedLifecycle,'ACTIVE');assert.equal(f.t.admissions,0);assert.equal(f.t.resultAdmissions,1);assert.equal(f.s.sessions,1);assert.equal(f.s.replaySessions,1);assert.equal(f.s.debits+f.s.executions+f.f.s.SDK,0);assert.equal(canonicalJson(f.ledger.m.exportState()),before);await f.owner.close();
});
check('active-original-results-rejects-new-request-ids-without-debit-or-execution',async()=>{
 const f=await known();f.owner.admitOriginalCommittedServiceGrantResults();const before=canonicalJson(f.ledger.m.exportState());for(let i=0;i<4;i++){const r=f.send(f.serviceRequest('new.'+i));await flush();assert.equal(r.res.statusCode,409);}assert.equal(f.s.debits+f.s.executions,0);assert.equal(canonicalJson(f.ledger.m.exportState()),before);await f.owner.close();
});
check('active-original-results-reconstructed-success-replays-canonical-cache-with-no-new-effect',async()=>{
 const {next,grantId}=await original();const admitted=next.owner.admitOriginalCommittedServiceGrantResults();assert.equal(admitted.grantId,grantId);assert.equal(admitted.history.record.storedLifecycle,'ACTIVE');const before=canonicalJson(next.ledger.m.exportState());for(let i=0;i<2;i++){const r=next.send(next.serviceRequest('original.0'));await flush();assert.equal(r.res.statusCode,200);assert.equal(r.res.body,'{"ok":true,"resultCode":"result.fixed"}');}assert.equal(next.s.debits+next.s.executions+next.f.s.SDK,0);assert.equal(next.ledger.m.getGrant(grantId).consumedUnits,1);assert.equal(canonicalJson(next.ledger.m.exportState()),before);await next.owner.close();assert.equal(next.s.resultReaderCloses,1);
});
check('active-original-results-preserves-one-hundred-consumed-units-and-can-still-replay',async()=>{
 const {next,grantId}=await original('SUCCEEDED',100);next.owner.admitOriginalCommittedServiceGrantResults();const before=canonicalJson(next.ledger.m.exportState()),r=next.send(next.serviceRequest('original.0'));await flush();assert.equal(r.res.statusCode,200);assert.equal(next.ledger.m.getGrant(grantId).consumedUnits,100);assert.equal(next.ledger.m.getGrant(grantId).availableUnits,0);assert.equal(next.s.debits+next.s.executions,0);assert.equal(canonicalJson(next.ledger.m.exportState()),before);await next.owner.close();
});
check('active-original-results-unknown-and-unfinished-originals-remain-unavailable-and-held',async()=>{
 for(const state of ['OUTCOME_UNKNOWN','EXECUTING']){const {next,grantId}=await original(state);next.owner.admitOriginalCommittedServiceGrantResults();const before=canonicalJson(next.ledger.m.exportState()),r=next.send(next.serviceRequest('original.0'));await flush();assert.equal(r.res.statusCode,503);assert.equal(next.ledger.m.getGrant(grantId).heldUnits,1);assert.equal(next.s.debits+next.s.executions,0);assert.equal(canonicalJson(next.ledger.m.exportState()),before);await next.owner.close();}
});
check('active-original-results-does-not-disable-normal-admission-and-new-metered-calls',async()=>{
 const f=await known(),r=f.owner.admitOriginalCommittedServiceGrant();assert.equal(r.serviceMode,'DURABLE_EXECUTION');assert.equal(f.t.resultAdmissions,0);const reply=f.send(f.serviceRequest('new.normal'));await flush();assert.equal(reply.res.statusCode,200);assert.equal(f.s.replaySessions,0);assert.equal(f.s.debits,1);assert.equal(f.s.executions,1);await f.owner.close();
});
check('active-original-results-cannot-upgrade-or-open-a-second-session',async()=>{
 const f=await known();f.owner.admitOriginalCommittedServiceGrantResults();assert.throws(()=>f.owner.admitOriginalCommittedServiceGrant());assert.throws(()=>f.owner.admitOriginalCommittedServiceGrantResults());assert.throws(()=>f.owner.admitCommittedServiceGrant(f.grant.grantId));assert.equal(f.s.sessions,1);assert.equal(f.s.replaySessions,1);assert.equal(f.t.resultAdmissions,1);await f.owner.close();
});
check('active-original-results-root-rejects-unknown-mode-and-extra-arguments-before-store-read',async()=>{
 const f=await known();assert.throws(()=>f.root.admitCommittedServiceGrant(f.grant.grantId,'DURABLE_EXECUTION'));assert.throws(()=>f.root.admitCommittedServiceGrant(f.grant.grantId,'RECORDED_RESULT_ONLY','extra'));assert.equal(f.s.grantReads,0);assert.equal(f.root.snapshot().serviceAdmissionAttempts,0);await f.owner.close();
});
check('active-original-results-takes-no-caller-grant-id-or-payment',async()=>{
 const f=await known();assert.throws(()=>f.owner.admitOriginalCommittedServiceGrantResults(f.grant.grantId));assert.equal(f.t.lookups+f.t.resultAdmissions,0);assert.equal(f.owner.snapshot().attempts,0);await f.owner.close();
});
check('active-original-results-absent-record-and-pending-state-never-open-a-session',async()=>{
 const f=await fixture(),r=f.owner.admitOriginalCommittedServiceGrantResults();assert.equal(r.status,'NOT_READY');assert.equal(r.history.status,'NOT_RECORDED');assert.equal(f.t.resultAdmissions+f.t.admissions+f.s.sessions,0);await f.owner.close();for(const phase of ['PENDING','EXHAUSTED','FIRST_IN_FLIGHT','OBSERVATION_IN_FLIGHT']){const p=await fixture({provider:{phase}});assert.equal(p.owner.admitOriginalCommittedServiceGrantResults().status,'NOT_READY');assert.equal(p.t.lookups+p.t.resultAdmissions+p.t.admissions,0);await p.owner.close();}
});
check('active-original-results-shares-read-and-admission-budget-without-resetting-it',async()=>{
 const f=await known();for(let i=0;i<15;i++)assert.equal(f.owner.inspectOriginalCommittedServiceGrant().status,'RECORDED');assert.equal(f.owner.admitOriginalCommittedServiceGrantResults().status,'ADMITTED');assert.equal(f.owner.snapshot().attempts,16);assert.equal(f.owner.snapshot().resultAdmissionCalls,1);assert.throws(()=>f.owner.admitOriginalCommittedServiceGrant());await f.owner.close();
});
check('active-original-results-independent-bound-and-outcome-pins-precede-lookup',async()=>{
 for(const key of ['boundRowDigest','outcomeRecordDigest']){const f=await known('ACTIVE',{configure(c){c.expectation={...c.expectation,[key]:'sha256:'+'0'.repeat(64)};}});await held(f);assert.equal(f.t.lookups+f.t.resultAdmissions,0);}
});
check('active-original-results-provider-or-row-drift-stops-before-result-admission',async()=>{
 const changed=await known('ACTIVE',{view(base,owner,s){const v=base.root.snapshot();return s.lookups===0?v:F({...v,binding:F({...v.binding,transactionHash:'f'.repeat(64)})});}});await held(changed);assert.equal(changed.t.resultAdmissions,0);
 const rows=await known('ACTIVE',{lookup(base,owner,s,identity){const r=base.ledger.m.readOriginalFundingGrant(identity);base.f.s.rows=[];return r;}});await held(rows);assert.equal(rows.t.resultAdmissions,0);
});
check('active-original-results-a-miswired-execution-admission-is-never-accepted',async()=>{
 const f=await known('ACTIVE',{admitResults(base,owner,s,id){return base.root.admitCommittedServiceGrant(id);}});await held(f);assert.equal(f.t.resultAdmissions,1);assert.equal(f.s.replaySessions,0);assert.equal(f.owner.snapshot().admittedGrantId,null);assert.equal(f.root.snapshot().phase,'CLOSED');assert.equal(f.s.debits+f.s.executions,0);
});
check('active-original-results-lost-admission-receipt-is-not-retried-or-upgraded',async()=>{
 const f=await known('ACTIVE',{admitResults(base,owner,s,id){base.root.admitCommittedServiceGrant(id,'RECORDED_RESULT_ONLY');throw Error('declared receipt loss');}});await held(f);assert.equal(f.t.resultAdmissions,1);assert.equal(f.s.replaySessions,1);assert.throws(()=>f.owner.admitOriginalCommittedServiceGrant());assert.throws(()=>f.owner.admitOriginalCommittedServiceGrantResults());assert.equal(f.t.resultAdmissions,1);
});
check('active-original-results-close-during-history-lookup-fences-both-admission-paths',async()=>{
 let closing;const f=await known('ACTIVE',{lookup(base,owner,s,identity){closing=owner.close();return base.ledger.m.readOriginalFundingGrant(identity);}});await held(f);await assert.rejects(closing);assert.equal(f.t.resultAdmissions,0);assert.equal(f.t.closeCalls,1);
});
check('active-original-results-command-is-recorded-only-and-rejects-caller-arguments',async()=>{
 for(const mode of ['RECORDED','JOURNAL','WITNESSED'])assert.equal(decode(line('ADMIT_ORIGINAL_RESULTS'),mode,16384).argument,null);assert.throws(()=>decode(line('ADMIT_ORIGINAL_RESULTS'),'FRESH',16384));assert.throws(()=>decode(line('ADMIT_ORIGINAL_RESULTS','bad',{grantId:'foreign'}),'RECORDED',16384));const f=control({mode:'FRESH',input:[line('ADMIT_ORIGINAL_RESULTS')]}),r=await f.owner.run();assert.equal(r.exitCode,1);assert.deepEqual(f.s.operations,[]);
});
check('active-original-results-command-routes-to-the-actual-local-result-admission-owner',async()=>{
 const f=await known(),c=control({mode:'RECORDED',input:[line('ADMIT_ORIGINAL_RESULTS'),line('CLOSE')],admitOriginalResults:()=>f.owner.admitOriginalCommittedServiceGrantResults()}),r=await c.owner.run();assert.equal(r.exitCode,0);assert.deepEqual(c.s.operations,['ADMIT_ORIGINAL_RESULTS']);assert.equal(c.s.writes[1].result.serviceMode,'RECORDED_RESULT_ONLY');assert.equal(f.t.admissions,0);assert.equal(f.t.resultAdmissions,1);await f.owner.close();
});
check('active-original-results-lost-command-output-never-enters-the-next-admission',async()=>{
 const f=await known(),c=control({mode:'RECORDED',input:[line('ADMIT_ORIGINAL_RESULTS'),line('ADMIT_ORIGINAL')],admitOriginalResults:()=>f.owner.admitOriginalCommittedServiceGrantResults(),write(s){return s.writes.at(-1).operation==='ADMIT_ORIGINAL_RESULTS'?Promise.reject(Error('declared output loss')):Promise.resolve(undefined);}}),r=await c.owner.run();assert.equal(r.exitCode,4);assert.equal(r.outputOutcomeUnknown,true);assert.deepEqual(c.s.operations,['ADMIT_ORIGINAL_RESULTS']);assert.equal(f.t.resultAdmissions,1);assert.equal(f.t.admissions,0);await f.owner.close();
});
check('active-original-results-duplicate-command-id-never-repeats-admission',async()=>{
 const c=control({mode:'RECORDED',input:[line('ADMIT_ORIGINAL_RESULTS','once'),line('ADMIT_ORIGINAL_RESULTS','once')]}),r=await c.owner.run();assert.equal(r.exitCode,1);assert.deepEqual(c.s.operations,['ADMIT_ORIGINAL_RESULTS']);
});

export const activeOriginalResultsDataCases=F([...checks]);
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const cases=[];let current=null,reported=false;
 function report(){if(reported)return;reported=true;const failed=cases.filter(c=>c.status==='FAIL').length;console.log(JSON.stringify({qualification:'G2_ACTIVE_ORIGINAL_RESULTS_DATA',passed:cases.length-failed,failed,cases,operationalPorts:'DECLARED_MEMORY_ONLY',activationMetadata:'SYNTHETIC_UNAUTHENTICATED',modelStateReconstruction:true,nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,nativePersistence:'NOT_ESTABLISHED',nativeFreshProcess:'NOT_ESTABLISHED',native100CallScenario:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED'}));if(failed)process.exitCode=1;}
 function unsettled(){if(current!==null){cases.push({id:current,status:'FAIL',error:'UNSETTLED_DECLARED_DATA_PROMISE'});report();}}
 process.once('beforeExit',unsettled);for(const {id,run}of checks){current=id;try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id:current,status:'FAIL',error:String(e?.message??'unknown').slice(0,256)});}current=null;}
 process.off('beforeExit',unsettled);report();
}
