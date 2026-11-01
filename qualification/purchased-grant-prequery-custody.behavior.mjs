// Actual purchased-grant application over the existing declared memory ports.
// No SDK/core/SQL, socket, key/signature, nonce, native CLI or process owner.
import assert from 'node:assert/strict';
import { canonicalJson } from '../src/canonical.js';
import { purchasedGrantHandoffFixture, frozenData as frozen, copy } from './purchased-grant-handoff.fixture.mjs';

const F=Object.freeze,cases=[],owned=[];
function fixture(options){const f=purchasedGrantHandoffFixture(options);owned.push(f);return f;}
function check(id,work){cases.push({id,work});}
function counters(f){return {reads:f.reads,current:f.currentCalls,queries:f.queries,opens:f.opens,queryReads:f.queryReads,handoffs:f.handoffs,retains:f.retains};}
function unclaimed(f){const v=f.root.inspect(),q=v.grantQueryRecovery.purchasedGrantHandoff;
 assert.equal(v.held,true);assert.equal(v.lifecycle,'HELD');
 assert.equal(q.fundingReturned,true);assert.equal(q.handoffClaimed,false);
 assert.equal(q.queryActive,false);assert.equal(q.queryUnknown,false);assert.equal(q.purchaseMatched,false);
 assert.equal(q.maximumQueries,1);assert.equal(v.grantQueryRecovery.queryDispatchRequested,false);
 assert.equal(f.queries,0);assert.equal(f.opens,0);assert.equal(f.queryReads,0);assert.equal(f.handoffs,0);
 return v;
}
async function changedRead(transform){
 let armed=false;
 const f=fixture({read:s=>armed?transform(s.raw):s.raw});
 await f.fund();const before=counters(f),original=f.h.raw(),retained=f.raw;armed=true;
 await assert.rejects(f.handoff());
 unclaimed(f);assert.equal(f.reads,before.reads+1);assert.equal(f.retains,1);
 assert.equal(f.raw,retained);assert.equal(f.h.raw(),original);
 return {f,restore:()=>{armed=false;},before,original,retained};
}

check('prequery-malformed-custody-is-held-before-any-grant-lookup',async()=>{
 const {f}=await changedRead(text=>text+'x');await f.cleanup();
});
check('prequery-empty-known-read-is-held-before-any-grant-lookup',async()=>{
 const {f}=await changedRead(()=> '');await f.cleanup();
});
check('prequery-foreign-payment-record-is-held-with-original-funding-unchanged',async()=>{
 const {f}=await changedRead(text=>{const v=JSON.parse(text);v.paymentId='payment.other.synthetic';return canonicalJson(v);});await f.cleanup();
});
check('prequery-foreign-checkpoint-digest-is-held-without-another-proof-or-query',async()=>{
 const {f}=await changedRead(text=>{const v=JSON.parse(text);v.checkpointDigest='f'.repeat(64);return canonicalJson(v);});await f.cleanup();
});
check('prequery-foreign-query-digest-is-held-before-service-ownership',async()=>{
 const {f}=await changedRead(text=>{const v=JSON.parse(text);v.queryDigest='e'.repeat(64);return canonicalJson(v);});await f.cleanup();
});
check('prequery-exact-record-bytes-cannot-be-replaced-by-json-whitespace',async()=>{
 const {f}=await changedRead(text=>text+' ');await f.cleanup();
});
check('restoring-custody-bytes-does-not-thaw-a-held-handoff',async()=>{
 const {f,restore,original}=await changedRead(text=>text+'x');restore();const after=counters(f);
 await assert.rejects(f.handoff());assert.deepEqual(counters(f),after);unclaimed(f);assert.equal(f.h.raw(),original);await f.cleanup();
});
check('prequery-custody-failure-cannot-repeat-prepare-commit-or-funding',async()=>{
 const {f,restore,original}=await changedRead(text=>text+'x');restore();const after=counters(f);
 for(const work of [()=>f.prepare(),()=>f.commit(),()=>f.submit(),()=>f.handoff()])await assert.rejects(work());
 assert.deepEqual(counters(f),after);assert.equal(f.h.raw(),original);unclaimed(f);await f.cleanup();
});
check('known-custody-mismatch-close-joins-the-original-child-once-and-stays-held',async()=>{
 const {f}=await changedRead(text=>text+'x');const first=f.root.close(),second=f.root.close();assert.equal(first,second);
 await assert.rejects(first);assert.equal(f.clientCloses,1);unclaimed(f);await f.cleanup();assert.equal(f.clientCloses,1);
});
check('throwing-prequery-read-retains-existing-unknown-borrower-without-child-close',async()=>{
 let armed=false;const f=fixture({read:s=>{if(armed)throw new TypeError('DECLARED_READ_FAILURE');return s.raw;}});
 await f.fund();armed=true;await assert.rejects(f.handoff());const v=unclaimed(f);assert.equal(v.grantQueryRecovery.custodyUnknown,true);
 await assert.rejects(f.root.close());assert.equal(f.clientCloses,0);await f.cleanup();
});
check('nontext-prequery-receipt-is-held-without-entering-then-hooks',async()=>{
 let armed=false,hooks=0;const value=F(Object.defineProperty({},'then',{get(){hooks++;throw Error('UNREACHABLE');}}));
 const f=fixture({read:s=>armed?value:s.raw});await f.fund();armed=true;await assert.rejects(f.handoff());unclaimed(f);
 assert.equal(hooks,0);assert.equal(f.root.inspect().grantQueryRecovery.custodyUnknown,true);await f.cleanup();assert.equal(f.clientCloses,0);
});
check('prequery-current-owner-refusal-stays-held-without-competing-close',async()=>{
 let armed=false;const f=fixture({current:()=>{if(armed)throw new TypeError('DECLARED_CURRENT_REFUSAL');}});
 await f.fund();armed=true;await assert.rejects(f.handoff());unclaimed(f);await assert.rejects(f.root.close());assert.equal(f.clientCloses,0);
 // The declared unknown owner is deliberately not replaced or retried.
 f.h.input.destroy();f.h.output.destroy();
});
check('external-different-payment-input-is-refused-before-custody-without-poisoning-the-original',async()=>{
 const f=fixture();await f.fund();const before=counters(f),input=copy(f.h.handoff());input.originalPayment.expectedPins.binding.paymentHash='a'.repeat(64);
 await assert.rejects(f.handoff(frozen(input)));assert.deepEqual(counters(f),before);assert.equal(f.root.inspect().held,false);
 await f.handoff();assert.equal(f.queries,1);assert.equal(f.handoffs,1);await f.cleanup();
});
check('external-bad-grant-shape-does-not-claim-or-read-the-funded-original',async()=>{
 const f=fixture();await f.fund();const before=counters(f),input=copy(f.h.handoff());input.selectedGrantId='invalid';
 await assert.rejects(f.handoff(frozen(input)));assert.deepEqual(counters(f),before);assert.equal(f.root.inspect().held,false);
 await f.handoff();assert.equal(f.queries,1);await f.cleanup();
});
check('external-handoff-accessor-is-not-entered-or-confused-with-custody-corruption',async()=>{
 const f=fixture();await f.fund();let hooks=0;const input=copy(f.h.handoff()),before=counters(f);
 Object.defineProperty(input,'originalPayment',{enumerable:true,get(){hooks++;throw Error('UNREACHABLE');}});
 await assert.rejects(f.handoff(F(input)));assert.equal(hooks,0);assert.deepEqual(counters(f),before);assert.equal(f.root.inspect().held,false);
 await f.handoff();assert.equal(f.queries,1);await f.cleanup();
});
check('valid-original-handoff-retains-one-query-and-one-service-child',async()=>{
 const f=fixture();await f.fund();await f.handoff();const q=f.root.inspect().grantQueryRecovery.purchasedGrantHandoff;
 assert.equal(q.purchaseMatched,true);assert.equal(q.queryCloseObserved,true);assert.equal(f.queries,1);assert.equal(f.handoffs,1);assert.equal(f.retains,1);
 assert.equal(f.h.counts.funding,1);assert.equal(f.h.counts.grants,1);await assert.rejects(f.handoff());assert.equal(f.queries,1);await f.cleanup();
});
check('handoff-before-funding-is-a-preclaim-input-refusal-and-can-be-explicitly-corrected',async()=>{
 const f=fixture();const before=counters(f);await assert.rejects(f.root.handoffToService(F({})));assert.deepEqual(counters(f),before);assert.equal(f.root.inspect().held,false);
 await f.fund();await f.handoff();assert.equal(f.queries,1);assert.equal(f.retains,1);await f.cleanup();
});
check('postquery-custody-mismatch-retains-the-existing-held-result-and-no-service-child',async()=>{
 let armed=false;const f=fixture({read:s=>armed&&s.queries>0?s.raw+'x':s.raw});await f.fund();armed=true;
 await assert.rejects(f.handoff());const q=f.root.inspect().grantQueryRecovery.purchasedGrantHandoff;
 assert.equal(f.root.inspect().held,true);assert.equal(q.handoffClaimed,true);assert.equal(q.queryCloseObserved,true);
 assert.equal(f.queries,1);assert.equal(f.handoffs,0);await f.cleanup();
});

const results=[];
for(const {id,work}of cases){try{await work();results.push({id,status:'PASS'});}catch(error){results.push({id,status:'FAIL',errorType:error?.name??'UNKNOWN'});}}
for(const f of owned){try{await f.cleanup();}catch{}}
const failed=results.filter(c=>c.status!=='PASS').length;
process.stdout.write(JSON.stringify({qualification:'G1_PREQUERY_CUSTODY_HANDOFF_DATA',passed:results.length-failed,failed,cases:results,
 nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0})+'\n');
if(failed)process.exitCode=1;
