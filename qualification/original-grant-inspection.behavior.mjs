// Pure DATA composition. Existing provider, ledger, channel and timer ports
// are memory fixtures, not SQL, native authentication or process recovery.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { createIssuedProviderStoreOwner } from '../src/issued-provider-store-owner.js';
import { decodeIssuedProviderControlCommand } from '../src/issued-provider-operator-control.js';
import { issuedOriginalGrantAdmissionDataFixture as fixture } from './issued-original-grant-admission.behavior.mjs';
import { issuedProviderCliDataFixture as control } from './issued-provider-cli.behavior.mjs';
import { issuedProviderRecoveryDataFlush as flush } from './issued-provider-recovery.behavior.mjs';

const F=Object.freeze,checks=[];
function check(id,run){checks.push(F({id,run}));}
function clone(v){return JSON.parse(JSON.stringify(v));}
function deep(v){if(v!==null&&typeof v==='object'){for(const value of Object.values(v))deep(value);F(v);}return v;}
function line(operation,id=operation,argument=null){return canonicalJson({version:1,id,operation,argument});}
async function known(options={}){const f=await fixture(options);f.ledger.activate();return f;}
async function held(f){assert.throws(()=>f.owner.inspectOriginalCommittedServiceGrant());assert.equal(f.owner.snapshot().held,true);await assert.rejects(f.owner.close());assert.equal(f.t.admissions,0);assert.equal(f.s.sessions+f.s.replaySessions,0);}
function powerless(r){assert.equal(r.authority,'NONE');assert.equal(r.grantAuthority,'NOT_REVALIDATED');assert.equal(r.deliveryLiability,'NOT_QUERIED');assert.equal(r.spendingReservation,'UNCHANGED');assert.equal(r.reconciliationRequired,true);for(const k of ['mayStartPayment','maySignPayment','mayDispatchService','mayActivateGrant'])assert.equal(r[k],false);}

check('original-grant-inspection-is-inert-and-takes-no-grant-or-payment-input',async()=>{
 const f=await fixture();assert.equal(f.t.lookups+f.t.admissions+f.t.loads,0);assert.throws(()=>f.owner.inspectOriginalCommittedServiceGrant('grant.foreign'));assert.equal(f.t.lookups,0);assert.equal(f.owner.snapshot().attempts,0);await f.owner.close();
});
check('original-grant-inspection-returns-existing-history-without-admission-or-dispatch',async()=>{
 const f=await known(),before=canonicalJson(f.ledger.m.exportState()),r=f.owner.inspectOriginalCommittedServiceGrant();powerless(r);assert.equal(r.status,'RECORDED');assert.equal(r.originalFunding.transactionId,'zenontx:'+f.root.snapshot().binding.transactionHash);assert.equal(f.t.admissions+f.s.sessions+f.s.replaySessions+f.s.debits+f.s.executions,0);assert.equal(f.owner.snapshot().admissionEntered,false);assert.equal(f.owner.snapshot().inspectionCalls,1);assert.equal(canonicalJson(f.ledger.m.exportState()),before);await f.owner.close();
});
check('original-grant-inspection-not-recorded-does-not-discharge-payment-or-liability',async()=>{
 const f=await fixture(),before=canonicalJson(f.ledger.m.exportState()),r=f.owner.inspectOriginalCommittedServiceGrant();powerless(r);assert.equal(r.status,'NOT_RECORDED');assert.equal(r.record,null);assert.equal(r.historicalObservation,true);assert.equal(f.t.admissions+f.s.sessions+f.f.s.SDK,0);assert.equal(canonicalJson(f.ledger.m.exportState()),before);await f.owner.close();
});
check('original-grant-inspection-preserves-revocation-expiry-and-all-unit-counters',async()=>{
 const f=await known(),g=f.ledger.m.exportState().grants[0];f.ledger.m.revokeGrant({grantId:g.grantId});const before=canonicalJson(f.ledger.m.exportState()),r=f.owner.inspectOriginalCommittedServiceGrant();powerless(r);assert.equal(r.record.storedLifecycle,'REVOKED');assert.equal(r.record.expiresAt,g.expiresAt);assert.equal(r.record.totalUnits,r.record.availableUnits+r.record.heldUnits+r.record.consumedUnits);assert.equal(canonicalJson(f.ledger.m.exportState()),before);assert.equal(f.t.admissions,0);await f.owner.close();
});
check('original-grant-inspection-result-is-detached-frozen-and-keeps-all-original-pins',async()=>{
 const f=await known(),r=f.owner.inspectOriginalCommittedServiceGrant();assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.record)&&Object.isFrozen(r.originalFunding)&&Object.isFrozen(r.originalFunding.chainProfile));assert.equal(Object.keys(r.originalFunding).length,14);assert.deepEqual(r.originalFunding,f.t.identity);assert.throws(()=>{r.record.availableUnits=1000;});assert.throws(()=>{r.mayDispatchService=true;});await f.owner.close();
});
check('original-grant-inspection-and-admission-share-the-existing-sixteen-attempt-budget',async()=>{
 const f=await known();for(let i=0;i<16;i++)powerless(f.owner.inspectOriginalCommittedServiceGrant());assert.throws(()=>f.owner.inspectOriginalCommittedServiceGrant());assert.throws(()=>f.owner.admitOriginalCommittedServiceGrant());assert.equal(f.owner.snapshot().attempts,16);assert.equal(f.t.lookups,16);assert.equal(f.t.admissions,0);assert.equal(f.owner.snapshot().held,false);await f.owner.close();
});
check('original-grant-inspection-does-not-implicitly-admit-but-allows-a-later-explicit-admission',async()=>{
 const f=await known(),r=f.owner.inspectOriginalCommittedServiceGrant();assert.equal(f.t.admissions,0);assert.equal(f.owner.snapshot().admissionEntered,false);const admitted=f.owner.admitOriginalCommittedServiceGrant();assert.equal(admitted.grantId,r.record.grantId);assert.equal(f.t.admissions,1);assert.equal(f.owner.snapshot().attempts,2);assert.throws(()=>f.owner.inspectOriginalCommittedServiceGrant());await f.owner.close();
});
check('original-grant-inspection-pending-exhausted-and-inflight-enter-no-history-reader',async()=>{
 for(const phase of ['PENDING','EXHAUSTED','FIRST_IN_FLIGHT','OBSERVATION_IN_FLIGHT']){const f=await fixture({provider:{phase}});assert.equal(f.owner.inspectOriginalCommittedServiceGrant().status,'NOT_READY');assert.equal(f.t.lookups+f.t.loads+f.t.outcomeReads+f.t.admissions,0);await f.owner.close();}
});
check('original-grant-inspection-independent-bound-and-outcome-pins-precede-lookup',async()=>{
 for(const key of ['boundRowDigest','outcomeRecordDigest']){const f=await known({configure(c){c.expectation={...c.expectation,[key]:'sha256:'+'0'.repeat(64)};}});await held(f);assert.equal(f.t.lookups,0);}
});
check('original-grant-inspection-row-or-outcome-drift-cannot-return-old-success',async()=>{
 for(const field of ['rows','raw']){const f=await known({lookup(base,owner,s,identity){const r=base.ledger.m.readOriginalFundingGrant(identity);if(field==='rows')base.f.s.rows=[];else base.f.s.raw+='\n';return r;}});await held(f);assert.equal(f.t.lookups,1);}
});
check('original-grant-inspection-same-provider-hash-is-rechecked-after-the-lookup',async()=>{
 const f=await known({view(base,owner,s){const v=base.root.snapshot();return s.lookups===0?v:F({...v,binding:F({...v.binding,transactionHash:'f'.repeat(64)})});}});await held(f);assert.equal(f.t.lookups,1);
});
check('original-grant-inspection-rejects-foreign-or-authoritative-history',async()=>{
 for(const change of [r=>{r.record.transactionId='zenontx:'+'f'.repeat(64);},r=>{r.mayDispatchService=true;}]){const f=await known({lookup(base,owner,s,identity){const r=clone(base.ledger.m.readOriginalFundingGrant(identity));change(r);return deep(r);}});await held(f);}
});
check('original-grant-inspection-accessors-are-not-invoked',async()=>{
 let hooks=0;const f=await known({lookup(base,owner,s,identity){const r={...base.ledger.m.readOriginalFundingGrant(identity)};Object.defineProperty(r,'record',{enumerable:true,get(){hooks++;throw Error('getter');}});return F(r);}});await held(f);assert.equal(hooks,0);
});
check('original-grant-inspection-observes-and-refuses-an-asynchronous-history-result',async()=>{
 const f=await known({lookup(){return Promise.reject(Error('declared lookup loss'));}});await held(f);await flush();assert.equal(f.t.lookups,1);
});
check('original-grant-inspection-fences-recursive-read-admission-and-manual-grant-entry',async()=>{
 let refused=0;const f=await known({lookup(base,owner,s,identity){for(const call of [()=>owner.inspectOriginalCommittedServiceGrant(),()=>owner.admitOriginalCommittedServiceGrant(),()=>owner.admitCommittedServiceGrant('grant.foreign')]){assert.throws(call);refused++;}return base.ledger.m.readOriginalFundingGrant(identity);}});powerless(f.owner.inspectOriginalCommittedServiceGrant());assert.equal(refused,3);assert.equal(f.t.lookups,1);assert.equal(f.t.admissions,0);await f.owner.close();
});
check('original-grant-inspection-close-during-lookup-remains-held-with-one-original-stop',async()=>{
 let closing;const f=await known({lookup(base,owner,s,identity){closing=owner.close();return base.ledger.m.readOriginalFundingGrant(identity);}});await held(f);await assert.rejects(closing);assert.equal(f.t.closeCalls,1);assert.equal(f.owner.snapshot().grantActivations,0);
});
check('original-grant-inspection-reconstructs-consumed-history-without-opening-a-session',async()=>{
 const first=await known();first.owner.admitOriginalCommittedServiceGrant();first.send(first.serviceRequest('retained'));await flush();const state=first.ledger.m.exportState();await first.owner.close();const next=await fixture({provider:{state}}),before=canonicalJson(next.ledger.m.exportState()),r=next.owner.inspectOriginalCommittedServiceGrant();powerless(r);assert.equal(r.record.consumedUnits,1);assert.equal(next.t.admissions+next.s.sessions+next.s.replaySessions+next.s.debits+next.s.executions+next.f.s.SDK,0);assert.equal(canonicalJson(next.ledger.m.exportState()),before);await next.owner.close();
});
check('original-grant-inspection-command-is-explicit-and-unavailable-in-fresh-mode',async()=>{
 for(const mode of ['RECORDED','JOURNAL','WITNESSED']){const r=decodeIssuedProviderControlCommand(line('READ_ORIGINAL_GRANT'),mode,16384);assert.equal(r.argument,null);}
 assert.throws(()=>decodeIssuedProviderControlCommand(line('READ_ORIGINAL_GRANT'),'FRESH',16384));for(const argument of [{grantId:'foreign'},{transactionHash:'a'.repeat(64)}])assert.throws(()=>decodeIssuedProviderControlCommand(line('READ_ORIGINAL_GRANT','bad',argument),'RECORDED',16384));
});
check('original-grant-inspection-control-composes-with-the-actual-memory-original-owner',async()=>{
 const f=await known(),c=control({mode:'RECORDED',input:[line('READ_ORIGINAL_GRANT'),line('CLOSE')],inspectOriginal:()=>f.owner.inspectOriginalCommittedServiceGrant()}),r=await c.owner.run();assert.equal(r.exitCode,0);assert.deepEqual(c.s.operations,['READ_ORIGINAL_GRANT']);const result=c.s.writes[1].result;powerless(result);assert.equal(result.status,'RECORDED');assert.equal(f.t.admissions+f.s.sessions+f.s.replaySessions,0);await f.owner.close();
});
check('original-grant-inspection-control-duplicate-id-never-repeats-the-read',async()=>{
 const c=control({mode:'RECORDED',input:[line('READ_ORIGINAL_GRANT','once'),line('READ_ORIGINAL_GRANT','once')]}),r=await c.owner.run();assert.equal(r.exitCode,1);assert.deepEqual(c.s.operations,['READ_ORIGINAL_GRANT']);
});
check('original-grant-inspection-lost-output-stays-held-without-automatic-read-or-admission',async()=>{
 const f=await known(),c=control({mode:'RECORDED',input:[line('READ_ORIGINAL_GRANT'),line('ADMIT_ORIGINAL')],inspectOriginal:()=>f.owner.inspectOriginalCommittedServiceGrant(),write(s){return s.writes.at(-1).operation==='READ_ORIGINAL_GRANT'?Promise.reject(Error('declared output loss')):Promise.resolve(undefined);}}),r=await c.owner.run();assert.equal(r.exitCode,4);assert.equal(r.outputOutcomeUnknown,true);assert.deepEqual(c.s.operations,['READ_ORIGINAL_GRANT']);assert.equal(f.t.lookups,1);assert.equal(f.t.admissions,0);await f.owner.close();
});
check('original-grant-inspection-owned-store-wrapper-preserves-zero-argument-read-only-routing',async()=>{
 let closed=false,reads=0,release=0;const empty=F({}),root=F({start:F(()=>Promise.resolve(F({status:'LISTENING'}))),close:F(()=>{closed=true;return Promise.resolve(undefined);}),
  inspectOriginalCommittedServiceGrant:F(()=>{reads++;return F({status:'NOT_RECORDED',authority:'NONE'});}),
  snapshot:F(()=>F({phase:closed?'CLOSED':'OPEN',uncertain:false,admissionRevoked:closed,activeOperations:0,fundingBusy:false,serviceOpening:false,fundingCloseDone:closed,serviceCloseDone:closed,queryCloseDone:closed,
   ingress:F({phase:closed?'CLOSED':'LISTENING',closeClean:closed?1:0,closeUncertain:0,trackedSockets:0,trackedRequests:0,trackedHandlers:0,ownedTimers:0}),funding:F({closed,active:false,held:false})}))});
 const owner=createIssuedProviderStoreOwner({methods:F(['inspectOriginalCommittedServiceGrant']),port:F({claim:F(()=>'CLAIMED'),openServiceStore:F(()=>empty),openIntakeStore:F(()=>F({})),openProvider:F(()=>Promise.resolve(root)),closeIntakeStore:F(()=>{}),closeServiceStore:F(()=>{}),release:F(()=>{release++;})})});
 assert.throws(()=>owner.inspectOriginalCommittedServiceGrant());await owner.start();assert.throws(()=>owner.inspectOriginalCommittedServiceGrant('foreign'));assert.equal(owner.inspectOriginalCommittedServiceGrant().authority,'NONE');assert.equal(reads,1);assert.equal(owner.snapshot().operationCalls,1);await owner.close();assert.equal(release,1);
});

export const originalGrantInspectionDataCases=F([...checks]);
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const cases=[];let current=null,reported=false;
 function report(){if(reported)return;reported=true;const failed=cases.filter(c=>c.status==='FAIL').length;console.log(JSON.stringify({qualification:'G2_ORIGINAL_GRANT_INSPECTION_DATA',passed:cases.length-failed,failed,cases,operationalPorts:'DECLARED_MEMORY_ONLY',modelStateReconstruction:true,nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,nativePersistence:'NOT_ESTABLISHED',nativeFreshProcess:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED'}));if(failed)process.exitCode=1;}
 function unsettled(){if(current!==null){cases.push({id:current,status:'FAIL',error:'UNSETTLED_DECLARED_DATA_PROMISE'});report();}}
 process.once('beforeExit',unsettled);for(const {id,run}of checks){current=id;try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??'unknown').slice(0,256)});}current=null;}
 process.off('beforeExit',unsettled);report();
}
