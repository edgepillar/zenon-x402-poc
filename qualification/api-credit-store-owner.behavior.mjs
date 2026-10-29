// Actual admission kernel and outer application; no native store/package entry.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { apiCreditWireOwnerDataCases } from './api-credit-wire-owner.behavior.mjs';
import { closeApiCreditOperatorDataFixtures } from './api-credit-operator.behavior.mjs';
import { wireOwnerFileFixture as file,deferred } from './api-credit-wire-owner.fixture.mjs';
import { storeOwnerApplicationFixture as app } from './api-credit-store-owner.fixture.mjs';
import { createApiCreditWireOwnerGuard as createWire,inspectApiCreditWireOwnerGuard as wireView,requireCurrentApiCreditWireOwner as wire,
 createApiCreditStoreOwnerAdmission as create,validateApiCreditStoreOwnerAdmission as validate,
 requireApiCreditStoreOwnerStage as stage,inspectApiCreditStoreOwnerAdmission as inspect } from '../src/api-credit-wire-owner-guard.js';

const F=Object.freeze,STAGES=['DATABASE_ENTRY','EPOCH_ENTRY','COMMIT_ENTRY','STORE_RETURN','CLIENT_RETURN'];
const checks=[...apiCreditWireOwnerDataCases];function check(id,run){checks.push({id,run});}
function fixture(options={}){const r=file(options);r.guard=createWire({fileOwner:r.owner,clock:r.clock});r.admission=create(r.guard,1000);return r;}
function through(r,count=STAGES.length){for(let i=0;i<count;i++)stage(r.admission,STAGES[i]);}
function held(r){assert.equal(inspect(r.admission).held,true);assert.equal(wireView(r.guard).held,true);assert.throws(()=>create(r.guard,1000));}
async function drain(){for(let i=0;i<16;i++)await Promise.resolve();}
check('store-owner-construction-borrows-the-same-owner-without-method-or-clock-entry',()=>{
 const r=fixture();assert.equal(r.currentCalls+r.viewCalls+r.clockCalls,0);assert.deepEqual(Object.keys(r.admission),['apiCreditStoreOwnerAdmissionVersion']);
});
check('store-owner-closed-arguments-refuse-coercion-and-proxies-without-io',()=>{
 const r=file(),g=createWire({fileOwner:r.owner,clock:r.clock});let hooks=0;const value={valueOf(){hooks++;return 1;}};
 for(const n of [0,-1,60001,1.1,'1000',value])assert.throws(()=>create(g,n));assert.throws(()=>create(new Proxy({},{get(){hooks++;}}),1000));
 assert.equal(r.currentCalls+r.viewCalls+r.clockCalls+hooks,0);
});
check('store-owner-json-data-cannot-forge-or-reset-an-acquisition',()=>{
 const v=F({apiCreditStoreOwnerAdmissionVersion:1});assert.throws(()=>validate(v));assert.throws(()=>stage(v,'DATABASE_ENTRY'));assert.throws(()=>inspect(v));
});
check('store-owner-clean-stages-reread-current-owner-with-one-absolute-window',()=>{
 const r=fixture();for(let i=0;i<STAGES.length;i++){r.now=BigInt(i)*100000000n;stage(r.admission,STAGES[i]);}assert.equal(r.currentCalls,5);assert.equal(inspect(r.admission).complete,true);assert.equal(inspect(r.admission).checksPassed,5);
});
check('store-owner-skipped-or-repeated-stages-stay-held-without-native-effects',()=>{
 for(const duplicate of [false,true]){const r=fixture();if(duplicate)stage(r.admission,'DATABASE_ENTRY');assert.throws(()=>stage(r.admission,duplicate?'DATABASE_ENTRY':'EPOCH_ENTRY'));held(r);}
});
check('store-owner-overlapping-acquisitions-cannot-replace-the-selected-operation',()=>{
 const r=fixture();assert.throws(()=>create(r.guard,1000));assert.throws(()=>stage(r.admission,'DATABASE_ENTRY'));held(r);assert.equal(r.currentCalls,0);
});
check('store-owner-funding-and-service-use-distinct-completed-admissions-on-the-same-owner',()=>{
 const r=fixture();through(r);const previous=r.admission;r.admission=create(r.guard,1000);assert.notEqual(previous,r.admission);through(r);assert.equal(r.currentCalls,10);
});
check('store-owner-known-stale-owner-before-open-never-admits-database-entry',()=>{
 const r=fixture();r.current=false;assert.throws(()=>stage(r.admission,'DATABASE_ENTRY'));assert.equal(inspect(r.admission).checksPassed,0);held(r);
});
check('store-owner-loss-after-database-entry-vetoes-owner-epoch-update',()=>{
 const r=fixture();through(r,1);r.current=false;assert.throws(()=>stage(r.admission,'EPOCH_ENTRY'));assert.equal(inspect(r.admission).checksPassed,1);held(r);
});
check('store-owner-loss-after-epoch-update-vetoes-the-commit-call-site',()=>{
 const r=fixture();through(r,2);r.current=false;assert.throws(()=>stage(r.admission,'COMMIT_ENTRY'));assert.equal(inspect(r.admission).checksPassed,2);held(r);
});
check('store-owner-loss-after-commit-vetoes-store-return-without-undoing-history',()=>{
 const r=fixture();through(r,3);r.current=false;assert.throws(()=>stage(r.admission,'STORE_RETURN'));assert.equal(inspect(r.admission).checksPassed,3);held(r);
});
check('store-owner-loss-during-async-return-vetoes-client-exposure',async()=>{
 const r=fixture();through(r,4);await Promise.resolve();r.current=false;assert.throws(()=>stage(r.admission,'CLIENT_RETURN'));assert.equal(inspect(r.admission).complete,false);held(r);
});
check('store-owner-nonvoid-current-receipts-never-advance-the-stage',()=>{
 for(const value of [true,false,F({current:true}),{then(){throw Error('not entered');}}]){const r=fixture({current:()=>value});assert.throws(()=>stage(r.admission,'DATABASE_ENTRY'));assert.equal(inspect(r.admission).checksPassed,0);held(r);}
});
check('store-owner-async-current-receipts-are-drained-without-a-late-upgrade',async()=>{
 const late=deferred(),r=fixture({current:()=>late.promise});assert.throws(()=>stage(r.admission,'DATABASE_ENTRY'));late.resolve();await drain();held(r);assert.equal(r.currentCalls,1);
 const rejected=fixture({current:()=>Promise.reject(Error('declared async refusal'))});assert.throws(()=>stage(rejected.admission,'DATABASE_ENTRY'));await drain();held(rejected);
});
check('store-owner-reentry-cannot-advance-the-outer-or-inner-stage',()=>{
 let r;r=fixture({current:()=>{assert.throws(()=>stage(r.admission,'DATABASE_ENTRY'));}});assert.throws(()=>stage(r.admission,'DATABASE_ENTRY'));held(r);assert.equal(r.currentCalls,1);
});
check('store-owner-wire-entry-cannot-race-an-unfinished-store-admission',()=>{
 const r=fixture();stage(r.admission,'DATABASE_ENTRY');assert.throws(()=>wire(r.guard,250));held(r);assert.equal(r.currentCalls,1);
});
check('store-owner-invalid-clock-values-are-not-converted-into-an-acquisition-budget',()=>{
 for(const value of [0,-1n,'0',null]){const r=fixture({clock:()=>value});assert.throws(()=>stage(r.admission,'DATABASE_ENTRY'));held(r);assert.equal(r.currentCalls,0);}
});
check('store-owner-a-later-stage-cannot-renew-the-original-absolute-deadline',()=>{
 const r=fixture();stage(r.admission,'DATABASE_ENTRY');r.now=999000000n;stage(r.admission,'EPOCH_ENTRY');r.now=1000000000n;assert.throws(()=>stage(r.admission,'COMMIT_ENTRY'));held(r);assert.equal(r.currentCalls,2);
});
check('store-owner-current-read-latency-is-inside-the-same-stage-budget',()=>{
 const r=fixture({current:s=>{s.now=1000000000n;}});assert.throws(()=>stage(r.admission,'DATABASE_ENTRY'));held(r);assert.equal(inspect(r.admission).checksPassed,0);
});
check('store-owner-a-clock-regression-between-stages-is-sticky',()=>{
 const r=fixture();r.now=100n;stage(r.admission,'DATABASE_ENTRY');r.now=99n;assert.throws(()=>stage(r.admission,'EPOCH_ENTRY'));held(r);
});
check('store-owner-submillisecond-time-is-not-rounded-into-a-new-stage-window',()=>{
 const r=fixture();through(r,4);r.now=999999999n;stage(r.admission,'CLIENT_RETURN');assert.equal(inspect(r.admission).complete,true);
 const expired=fixture();through(expired,4);expired.now=1000000000n;assert.throws(()=>stage(expired.admission,'CLIENT_RETURN'));held(expired);
});
check('store-owner-inspection-is-historical-and-completion-is-not-reusable-authority',()=>{
 const r=fixture();through(r);const calls=r.currentCalls+r.clockCalls+r.viewCalls,v=inspect(r.admission);assert.equal(v.authority,'NONE');assert.equal(v.nativeExecutionEvidence,false);
 for(const k of ['owner','clock','deadline','database','close','reopen','dispatch'])assert.equal(Object.hasOwn(v,k),false);assert.equal(r.currentCalls+r.clockCalls+r.viewCalls,calls);
 validate(r.admission);assert.throws(()=>stage(r.admission,'CLIENT_RETURN'));held(r);
});
check('store-owner-actual-application-clean-child-opens-and-returns-only-after-current-checks',async()=>{
 const r=app(),run=r.run();await r.ready.promise;r.gate.resolve();await run;assert.equal(r.storeOpens,1);assert.equal(r.commits,1);assert.equal(r.facadesPublished,1);assert.equal(r.currentCalls,6);assert.equal(inspect(r.admission).complete,true);await r.close();
});
check('store-owner-actual-application-stale-after-await-enters-no-declared-store',async()=>{
 const r=app(),run=r.run();await r.ready.promise;const original=r.raw();r.current=false;r.gate.resolve();await assert.rejects(run);assert.equal(r.storeOpens,0);assert.equal(r.facadesPublished,0);assert.equal(r.raw(),original);assert.equal(r.closeCalls,0);await r.close().catch(()=>{});
});
check('store-owner-actual-application-revoked-file-enters-no-declared-store',async()=>{
 const r=app(),run=r.run();await r.ready.promise;r.revoked=true;r.gate.resolve();await assert.rejects(run);assert.equal(r.storeOpens,0);assert.equal(r.facadesPublished,0);assert.equal(r.closeCalls,0);await r.close().catch(()=>{});
});
check('store-owner-actual-application-epoch-refusal-preserves-the-entered-declared-owner',async()=>{
 const r=app({afterStage:(s,p)=>{if(p==='DATABASE_ENTRY')s.current=false;}}),run=r.run();await r.ready.promise;r.gate.resolve();await assert.rejects(run);assert.equal(r.storeOpens,1);assert.equal(r.epochWrites,0);assert.equal(r.commits,0);assert.equal(r.closeCalls,0);await r.close().catch(()=>{});
});
check('store-owner-actual-application-commit-refusal-cannot-publish-a-client',async()=>{
 const r=app({afterStage:(s,p)=>{if(p==='EPOCH_ENTRY')s.current=false;}}),run=r.run();await r.ready.promise;r.gate.resolve();await assert.rejects(run);assert.equal(r.epochWrites,1);assert.equal(r.commits,0);assert.equal(r.facadesPublished,0);assert.equal(r.closeCalls,0);await r.close().catch(()=>{});
});
check('store-owner-actual-application-return-refusal-never-erases-a-declared-commit',async()=>{
 const r=app({afterStage:(s,p)=>{if(p==='COMMIT_ENTRY')s.current=false;}}),run=r.run();await r.ready.promise;r.gate.resolve();await assert.rejects(run);assert.equal(r.commits,1);assert.equal(r.storesReturned,0);assert.equal(r.facadesPublished,0);assert.equal(r.closeCalls,0);await r.close().catch(()=>{});
});
check('store-owner-actual-application-async-return-loss-retains-original-reservation-without-reopen',async()=>{
 const r=app({waitForReturn:true}),run=r.run();await r.ready.promise;r.gate.resolve();await r.storeReady.promise;const original=r.raw(),store=r.retainedStore;r.current=false;r.returnGate.resolve();await assert.rejects(run);
 assert.equal(r.retainedStore,store);assert.equal(r.raw(),original);assert.equal(r.facadesPublished,0);assert.equal(r.closeCalls,0);r.current=true;await assert.rejects(r.run());assert.equal(r.storeOpens,1);assert.equal(r.commits,1);await r.close().catch(()=>{});
});
check('store-owner-actual-application-slow-acquisition-cannot-reset-the-window-on-return',async()=>{
 const r=app({waitForReturn:true}),run=r.run();await r.ready.promise;r.gate.resolve();await r.storeReady.promise;r.now=1000000000n;r.returnGate.resolve();await assert.rejects(run);assert.equal(r.facadesPublished,0);assert.equal(r.storeOpens,1);assert.equal(r.commits,1);assert.equal(r.closeCalls,0);await r.close().catch(()=>{});
});
check('store-owner-baseline-brand-validation-alone-does-not-recheck-an-owner-after-await',async()=>{
 const r=app({guarded:false}),run=r.run();await r.ready.promise;r.current=false;r.gate.resolve();await run;assert.equal(r.currentCalls,1);assert.equal(r.storeOpens,1);assert.equal(r.commits,1);assert.equal(r.facadesPublished,1);await r.close().catch(()=>{});
});
check('store-owner-baseline-brand-validation-alone-does-not-fence-a-revoked-file',async()=>{
 const r=app({guarded:false}),run=r.run();await r.ready.promise;r.revoked=true;r.gate.resolve();await run;assert.equal(r.currentCalls,1);assert.equal(r.storeOpens,1);assert.equal(r.commits,1);assert.equal(r.facadesPublished,1);await r.close().catch(()=>{});
});
export const apiCreditStoreOwnerDataCases=checks;
if(process.argv[1]===fileURLToPath(import.meta.url)){
const cases=[];for(const {id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??e)});}}
await closeApiCreditOperatorDataFixtures();const failed=cases.filter(c=>c.status!=='PASS').length;
console.log(JSON.stringify({qualification:'G2_STORE_OWNER_ADMISSION_DATA',passed:cases.length-failed,failed,cases,priorCases:apiCreditWireOwnerDataCases.length,
 actualOuterApplicationDataCompositions:8,baselineBrandOnlyDataControls:2,declaredStoreFileClockCasChildPortsOnly:true,nativeStoreAdaptersExecuted:false,
 nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
 atomicExternalDispatchFencing:'NOT_ESTABLISHED',nativeAcquisitionTiming:'NOT_ESTABLISHED',nativeDurability:'NOT_ESTABLISHED',Linux:'NOT_ESTABLISHED',fullG2:'NOT_ESTABLISHED'}));if(failed)process.exitCode=1;
}
