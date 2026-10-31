// Real revision controller with declared synchronous CAS ports. Native SQL,
// native owner/HTTP binding, process fencing and physical release are unrun.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { createServiceCreditExecutionRevisionOwner as create,
 selectServiceCreditExecutionOwnershipClaim as selectClaim } from '../src/service-credit-execution-revision-owner.js';
import { issuedProviderRecoveryDataFixture as modelFixture } from './issued-provider-recovery.behavior.mjs';

const F=Object.freeze,checks=[];
function check(id,run){checks.push(F({id,run}));}
function fixture(options={},shared=null){
 const s=shared??{revision:0,ledgerState:F({declaredOpaqueLedger:true}),executionState:F({declaredOpaqueState:true}),claims:0,reads:0,entries:0,writes:0,known:F({declaredRefusal:true})};
 let owner;
 const port=F({readSnapshot:F(()=>{s.reads++;return options.read?options.read(s,owner):F({revision:s.revision,executionState:s.executionState});}),
  claim:F(input=>{s.claims++;if(options.claim)return options.claim(s,owner,input);
   const selected=selectClaim(F({revision:s.revision,ledgerState:s.ledgerState,executionState:s.executionState}),input.expectedRevision);
   if(selected.disposition!=='APPLIED')return F({disposition:selected.disposition,revision:s.revision,executionState:null});
   s.revision=selected.nextRevision;s.ledgerState=selected.ledgerState;s.executionState=selected.executionState;
   return F({disposition:'APPLIED',revision:s.revision,executionState:s.executionState});}),
  invoke:F((name,args)=>{s.entries++;if(options.invoke)return options.invoke(s,owner,name,args);
   if(name==='getRequest')return F({declaredHistoricalData:true});
   if(args[0].expectedRevision!==s.revision)return F({disposition:'STALE',revision:s.revision});
   s.revision++;s.writes++;return F({disposition:'APPLIED',revision:s.revision});}),
  knownRefusal:F(error=>options.known?options.known(s,owner,error):error===s.known)});
 owner=create(port);return {s,owner,port,claim(){return owner.call('getDurableExecutionSnapshot',[]);},
  write(name='prepareDurableExecution',extra={}){return owner.call(name,[{expectedRevision:owner.snapshot().revision,...extra}]);}};
}

check('revision-owner-construction-is-inert-with-no-reusable-economic-authority',()=>{
 const f=fixture();assert.equal(f.s.reads+f.s.claims+f.s.entries,0);assert.deepEqual(Object.keys(f.owner),['call','assertCurrent','snapshot']);
 assert.equal(f.owner.snapshot().authority,'NONE');assert.equal(f.owner.snapshot().automaticReclaim,false);assert.equal(f.owner.snapshot().revision,null);
});
check('revision-owner-first-initialized-read-claims-once-and-requires-readback',()=>{
 const f=fixture(),state=f.s.executionState,r=f.claim();assert.equal(r.revision,1);assert.equal(r.executionState,state);
 assert.equal(f.s.claims,1);assert.equal(f.s.reads,2);assert.equal(f.owner.snapshot().claimed,true);assert.equal(f.owner.snapshot().held,false);
});
check('revision-owner-disabled-execution-does-not-claim-or-initialize',()=>{
 const f=fixture();f.s.executionState=null;assert.equal(f.claim().executionState,null);assert.equal(f.s.claims,0);assert.equal(f.owner.snapshot().claimed,false);
 f.s.revision=4;f.s.executionState=F({declaredExplicitInitialization:true});assert.equal(f.claim().revision,5);assert.equal(f.s.claims,1);
});
check('revision-owner-repeated-current-reads-never-reclaim',()=>{
 const f=fixture();f.claim();for(let i=0;i<4;i++)assert.equal(f.claim().revision,1);assert.equal(f.s.claims,1);
});
check('revision-owner-second-worker-retires-the-first-reader-without-rebasing',()=>{
 const a=fixture();a.claim();const b=fixture({},a.s);b.claim();const reads=a.s.reads;
 assert.throws(()=>a.claim());assert.equal(a.owner.snapshot().held,true);assert.equal(a.owner.snapshot().revision,1);assert.equal(b.owner.snapshot().revision,2);
 assert.throws(()=>a.claim());assert.equal(a.s.reads,reads+1);assert.equal(a.s.claims,2);assert.equal(a.s.writes,0);
});
check('revision-owner-stale-writer-enters-only-cas-comparison-and-does-not-write',()=>{
 const a=fixture();a.claim();const b=fixture({},a.s);b.claim();assert.throws(()=>a.write());
 assert.equal(a.s.entries,1);assert.equal(a.s.writes,0);assert.equal(a.owner.snapshot().held,true);assert.equal(a.owner.snapshot().revision,1);
});
check('revision-owner-advances-only-on-exact-own-applied-receipts',()=>{
 const f=fixture();f.claim();const reads=f.s.reads;assert.equal(f.write().revision,2);assert.equal(f.s.reads,reads);
 assert.equal(f.owner.snapshot().revision,2);assert.equal(f.owner.assertCurrent(),undefined);assert.equal(f.s.claims,1);
});
check('revision-owner-unchanged-receipt-preserves-the-owned-revision',()=>{
 const f=fixture({invoke(s){return F({disposition:'UNCHANGED',revision:s.revision});}});f.claim();assert.equal(f.write().disposition,'UNCHANGED');
 assert.equal(f.owner.snapshot().revision,1);assert.equal(f.owner.snapshot().writes,0);assert.equal(f.owner.snapshot().held,false);
});
check('revision-owner-jumped-or-regressed-ack-cannot-advance-ownership',()=>{
 for(const delta of [-1,2]){const f=fixture({invoke(s){return F({disposition:'APPLIED',revision:s.revision+delta});}});f.claim();assert.throws(()=>f.write());assert.equal(f.owner.snapshot().held,true);}
});
check('revision-owner-stale-ack-cannot-use-a-later-snapshot-as-write-success',()=>{
 const f=fixture({invoke(s){s.revision++;return F({disposition:'STALE',revision:s.revision});}});f.claim();const reads=f.s.reads;
 assert.throws(()=>f.write());assert.equal(f.s.reads,reads);assert.throws(()=>f.claim());assert.equal(f.s.claims,1);
});
check('revision-owner-unknown-write-error-preserves-ambiguity-without-read-repair',()=>{
 const f=fixture({invoke(s){s.revision++;s.writes++;throw Error('declared lost commit response');}});f.claim();const reads=f.s.reads;
 assert.throws(()=>f.write());assert.equal(f.s.writes,1);assert.equal(f.s.reads,reads);assert.equal(f.owner.snapshot().held,true);assert.throws(()=>f.claim());
});
check('revision-owner-known-unchanged-refusal-keeps-its-prior-business-error',()=>{
 let reject=true;const f=fixture({invoke(s){if(reject)throw s.known;s.revision++;return F({disposition:'APPLIED',revision:s.revision});}});f.claim();
 assert.throws(()=>f.write(),error=>error===f.s.known);assert.equal(f.owner.snapshot().held,false);assert.equal(f.owner.snapshot().knownUnchangedRefusals,1);
 reject=false;assert.equal(f.write().revision,2);assert.equal(f.s.claims,1);
});
check('revision-owner-known-refusal-with-foreign-revision-is-still-retired',()=>{
 const f=fixture({invoke(s){s.revision++;throw s.known;}});f.claim();assert.throws(()=>f.write());assert.equal(f.owner.snapshot().held,true);assert.equal(f.owner.snapshot().revision,1);
});
check('revision-owner-nonboolean-error-classification-never-becomes-permission',()=>{
 const f=fixture({invoke(){throw Error('declared refusal');},known(){return Promise.resolve(true);}});f.claim();assert.throws(()=>f.write());assert.equal(f.owner.snapshot().held,true);
});
check('revision-owner-lost-claim-ack-cannot-be-repaired-by-seeing-its-revision',()=>{
 const f=fixture({claim(s){s.revision++;throw Error('declared lost claim acknowledgement');}});assert.throws(()=>f.claim());
 assert.equal(f.owner.snapshot().held,true);assert.equal(f.owner.snapshot().claimed,false);assert.equal(f.s.revision,1);assert.equal(f.s.claims,1);
 assert.throws(()=>f.claim());assert.equal(f.s.claims,1);
});
check('revision-owner-claim-requires-applied-exact-increment-and-nonnull-state',()=>{
 for(const change of [r=>r.disposition='UNCHANGED',r=>r.disposition='STALE',r=>r.revision+=2,r=>r.executionState=null]){
  const f=fixture({claim(s){const r={disposition:'APPLIED',revision:s.revision+1,executionState:s.executionState};change(r);return F(r);}});
  assert.throws(()=>f.claim());assert.equal(f.owner.snapshot().held,true);assert.equal(f.s.entries,0);
 }
});
check('revision-owner-claim-readback-mismatch-never-publishes-ownership',()=>{
 const f=fixture({read(s){if(s.claims)s.revision++;return F({revision:s.revision,executionState:s.executionState});}});assert.throws(()=>f.claim());
 assert.equal(f.owner.snapshot().claimed,false);assert.equal(f.owner.snapshot().held,true);assert.equal(f.s.entries,0);
});
check('revision-owner-promise-claim-is-not-awaited-or-promoted-later',async()=>{
 let resolve;const promise=new Promise(yes=>{resolve=yes;});const f=fixture({claim(){return promise;}});assert.throws(()=>f.claim());
 resolve(F({disposition:'APPLIED',revision:1,executionState:f.s.executionState}));await Promise.resolve();assert.equal(f.owner.snapshot().held,true);assert.equal(f.s.entries,0);
});
check('revision-owner-thenable-receipt-does-not-run-user-hooks',()=>{
 let hooks=0;const value=Object.defineProperty({},'then',{get(){hooks++;throw Error();}}),f=fixture({invoke(){return value;}});f.claim();assert.throws(()=>f.write());assert.equal(hooks,0);
});
check('revision-owner-reentrant-claim-does-not-acquire-a-second-claim',()=>{
 const f=fixture({claim(s,o){assert.throws(()=>o.call('getDurableExecutionSnapshot',[]));s.revision++;return F({disposition:'APPLIED',revision:s.revision,executionState:s.executionState});}});
 assert.throws(()=>f.claim());assert.equal(f.s.claims,1);assert.equal(f.owner.snapshot().held,true);
});
check('revision-owner-reentrant-writer-keeps-an-entered-write-held',()=>{
 const f=fixture({invoke(s,o){assert.throws(()=>o.call('getDurableExecutionSnapshot',[]));s.revision++;s.writes++;return F({disposition:'APPLIED',revision:s.revision});}});
 f.claim();assert.throws(()=>f.write());assert.equal(f.s.writes,1);assert.equal(f.owner.snapshot().held,true);
});
check('revision-owner-query-is-fenced-on-both-sides-of-the-read',()=>{
 const f=fixture({invoke(s){s.revision++;return F({declaredHistory:true});}});f.claim();assert.throws(()=>f.owner.call('getRequest',[{grantId:'grant.fixed',requestId:'request.fixed'}]));
 assert.equal(f.s.entries,1);assert.equal(f.owner.snapshot().held,true);
});
check('revision-owner-assert-current-stops-a-retired-worker-before-application-entry',()=>{
 const a=fixture();a.claim();const b=fixture({},a.s);b.claim();let entries=0;
 assert.throws(()=>{a.owner.assertCurrent();entries++;});assert.equal(entries,0);assert.equal(a.owner.snapshot().held,true);
});
check('revision-owner-input-accessors-never-run-or-enter-the-store',()=>{
 const f=fixture();f.claim();let hooks=0;const value=Object.defineProperty({},'expectedRevision',{enumerable:true,get(){hooks++;throw Error();}});
 assert.throws(()=>f.owner.call('prepareDurableExecution',[value]));assert.equal(hooks,0);assert.equal(f.s.entries,0);assert.equal(f.owner.snapshot().held,false);
});
check('revision-owner-snapshot-proxy-and-accessors-never-run-hooks',()=>{
 let hooks=0;const bad=Object.defineProperty({executionState:F({})},'revision',{enumerable:true,get(){hooks++;throw Error();}});F(bad);
 for(const value of [bad,new Proxy({}, {ownKeys(){hooks++;throw Error();}})]){
  const f=fixture({read(){return value;}});assert.throws(()=>f.claim());assert.equal(f.s.claims,0);assert.equal(f.owner.snapshot().held,true);
 }assert.equal(hooks,0);
});
check('revision-owner-rejects-unknown-method-and-direct-claim-dispatch',()=>{
 const f=fixture();for(const name of ['claimDurableExecutionOwnership','close','recoverDurableExecutionsAfterRestart','arbitrary'])assert.throws(()=>f.owner.call(name,[]));
 assert.equal(f.s.reads+f.s.claims+f.s.entries,0);assert.equal(f.owner.snapshot().held,false);
});
check('revision-owner-revision-exhaustion-cannot-wrap-or-reserve',()=>{
 const f=fixture();f.s.revision=Number.MAX_SAFE_INTEGER;assert.throws(()=>f.claim());assert.equal(f.s.claims,0);assert.equal(f.s.entries,0);assert.equal(f.owner.snapshot().held,true);
});
check('revision-owner-invalid-revisions-never-start-the-claim',()=>{
 for(const revision of [-0,-1,1.5,NaN,Infinity,1n]){const f=fixture();f.s.revision=revision;assert.throws(()=>f.claim());assert.equal(f.s.claims,0);}
});
check('revision-owner-port-accessors-and-proxies-are-refused-without-hooks',()=>{
 const f=fixture();let hooks=0;const port={...f.port};Object.defineProperty(port,'claim',{enumerable:true,get(){hooks++;throw Error();}});F(port);
 assert.throws(()=>create(port));assert.throws(()=>create(new Proxy({}, {ownKeys(){hooks++;throw Error();}})));assert.equal(hooks,0);
});
check('revision-owner-metadata-claim-preserves-the-actual-memory-credit-ledger',async()=>{
 const base=await modelFixture();base.ledger.activate();const ledger=base.ledger.m.exportState(),before=canonicalJson(ledger),f=fixture();f.s.ledgerState=ledger;f.claim();
 assert.equal(f.s.ledgerState,ledger);assert.equal(canonicalJson(f.s.ledgerState),before);assert.equal(f.owner.snapshot().authority,'NONE');assert.equal(base.s.debits+base.s.executions+base.f.s.SDK,0);await base.root.close();
});
check('revision-owner-retired-worker-cannot-reserve-from-the-actual-memory-ledger',async()=>{
 const base=await modelFixture();base.ledger.activate();const before=canonicalJson(base.ledger.m.exportState());let reservations=0;
 const a=fixture({invoke(s,o,name,args){if(args[0].expectedRevision!==s.revision)return F({disposition:'STALE',revision:s.revision});
  reservations++;base.ledger.m.reserveRequest(args[0].request);s.revision++;return F({disposition:'APPLIED',revision:s.revision});}});
 a.claim();const b=fixture({},a.s);b.claim();assert.throws(()=>a.write('prepareDurableExecution',{request:{declaredRejectedBeforeReservation:true}}));
 assert.equal(reservations,0);assert.equal(canonicalJson(base.ledger.m.exportState()),before);assert.equal(base.s.debits+base.s.executions,0);await base.root.close();
});
check('revision-owner-pure-claim-selector-retains-exact-ledger-and-execution-objects',()=>{
 const ledger=F({declaredUnits:100}),execution=F({declaredOriginalPending:true}),r=selectClaim(F({revision:7,ledgerState:ledger,executionState:execution}),7);
 assert.equal(r.disposition,'APPLIED');assert.equal(r.nextRevision,8);assert.equal(r.ledgerState,ledger);assert.equal(r.executionState,execution);assert.equal(r.authority,'NONE');
});
check('revision-owner-pure-claim-selector-stale-input-produces-no-write-candidate',()=>{
 const r=selectClaim(F({revision:8,ledgerState:F({}),executionState:F({})}),7);assert.equal(r.disposition,'STALE');assert.equal(r.nextRevision,null);assert.equal(r.ledgerState,null);assert.equal(r.executionState,null);
});
check('revision-owner-pure-claim-selector-does-not-initialize-a-disabled-contract',()=>{
 const r=selectClaim(F({revision:8,ledgerState:F({}),executionState:null}),8);assert.equal(r.disposition,'DISABLED');assert.equal(r.nextRevision,null);assert.equal(r.ledgerState,null);
});
check('revision-owner-pure-claim-selector-rejects-revision-exhaustion',()=>{
 assert.throws(()=>selectClaim(F({revision:Number.MAX_SAFE_INTEGER,ledgerState:F({}),executionState:F({})}),Number.MAX_SAFE_INTEGER));
});
check('revision-owner-pure-claim-selector-rejects-accessors-without-hooks',()=>{
 let hooks=0;const value={revision:0,ledgerState:F({})};Object.defineProperty(value,'executionState',{enumerable:true,get(){hooks++;throw Error();}});F(value);
 assert.throws(()=>selectClaim(value,0));assert.equal(hooks,0);
});

export const executionRevisionOwnerDataCases=F([...checks]);
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const cases=[];let current=null,reported=false;
 function report(){if(reported)return;reported=true;const failed=cases.filter(c=>c.status!=='PASS').length;
  console.log(JSON.stringify({qualification:'G2_EXECUTION_REVISION_OWNER_DATA',passed:cases.length-failed,failed,cases,ports:'DECLARED_SYNCHRONOUS_MEMORY_CAS_ONLY',
   actualRevisionController:true,memoryCreditModelComposition:true,nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
   nativeClaimTransaction:'NOT_ESTABLISHED',nativeOwnerBinding:'NOT_ESTABLISHED',crossProcessFencing:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED',G2:'OPEN'}));if(failed)process.exitCode=1;}
 function unsettled(){if(current!==null){cases.push({id:current,status:'FAIL',error:'UNSETTLED_DECLARED_DATA_PROMISE'});report();}}
 process.once('beforeExit',unsettled);for(const {id,run}of checks){current=id;try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??'unknown').slice(0,256)});}current=null;}
 process.off('beforeExit',unsettled);report();
}
