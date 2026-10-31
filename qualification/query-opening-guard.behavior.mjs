// Actual original-query owner/coordinator with declared transport/clock ports.
// Wire proofs and transaction fields are unauthenticated DATA, never signatures.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { originalGrantQueryDataFixture as fixture,
 originalGrantQueryCoordinatorDataFixture as coordinator } from './original-grant-query-cli.behavior.mjs';
const F=Object.freeze,checks=[];
function check(id,run){checks.push(F({id,run}));}
async function flush(){for(let i=0;i<16;i++)await Promise.resolve();}
function pending(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function noAuthority(result){assert.equal(result.authority,'NONE');assert.equal(result.reconciliationRequired,true);assert.equal(result.spendingReservation,'UNCHANGED');
 for(const key of ['mayStartPayment','maySignPayment','mayDispatchService','mayActivateGrant'])assert.equal(result[key],false);assert.equal(result.nativeResourceRelease,'NOT_ESTABLISHED');}
async function beforeOpen(value){const f=fixture({guardResult:()=>value});await assert.rejects(f.run());await flush();assert.equal(f.s.opens,0);assert.equal(f.s.reads,0);assert.equal(f.s.closes,0);assert.equal(f.s.cancelled,1);return f;}
check('query-opening-guard-void-contract-keeps-one-query-and-closed-history',async()=>{
 const f=fixture(),result=await f.run();noAuthority(result);assert.equal(f.s.opens,1);assert.equal(f.s.reads,1);assert.equal(f.s.closes,1);assert.equal(f.s.cancelled,1);
});
check('query-opening-guard-true-is-not-synchronous-void',async()=>{await beforeOpen(true);});
check('query-opening-guard-false-is-not-synchronous-void',async()=>{await beforeOpen(false);});
check('query-opening-guard-null-is-not-synchronous-void',async()=>{await beforeOpen(null);});
check('query-opening-guard-other-primitives-never-open-transport',async()=>{for(const value of [0,'',1n,Symbol('declared')])await beforeOpen(value);});
check('query-opening-guard-an-already-resolved-promise-is-not-joined-admission',async()=>{await beforeOpen(Promise.resolve(undefined));});
check('query-opening-guard-late-promise-resolution-cannot-repair-the-first-refusal',async()=>{
 const g=pending(),f=await beforeOpen(g.promise);g.resolve(undefined);await flush();assert.equal(f.s.opens,0);assert.throws(f.run);
});
check('query-opening-guard-late-promise-rejection-is-observed-without-authority',async()=>{
 const g=pending(),f=await beforeOpen(g.promise);g.reject(Error('declared late guard failure'));await flush();assert.equal(f.s.opens,0);assert.equal(f.s.closes,0);
});
check('query-opening-guard-thenable-result-never-runs-its-hook',async()=>{
 let hooks=0;const value=F({get then(){hooks++;throw Error('unselected');}});await beforeOpen(value);assert.equal(hooks,0);
});
check('query-opening-guard-proxy-result-never-runs-proxy-traps',async()=>{
 let hooks=0;const value=new Proxy({}, {get(){hooks++;throw Error();},getPrototypeOf(){hooks++;throw Error();},ownKeys(){hooks++;throw Error();}});await beforeOpen(value);assert.equal(hooks,0);
});
check('query-opening-guard-native-promise-own-then-is-not-read',async()=>{
 let hooks=0;const value=Promise.resolve(undefined);Object.defineProperty(value,'then',{get(){hooks++;throw Error();}});await beforeOpen(value);assert.equal(hooks,0);
});
check('query-opening-guard-expiry-during-the-guard-prevents-first-open',async()=>{
 const f=fixture({guardResult(s){s.timers[0].callback();return undefined;}});await assert.rejects(f.run());assert.equal(f.s.opens,0);assert.equal(f.s.reads,0);assert.equal(f.s.closes,0);
});
check('query-opening-guard-expiry-during-the-clock-prevents-first-open',async()=>{
 let fired=false;const f=fixture({clock(s){if(s.timers.length&&!fired){fired=true;s.timers[0].callback();}return s.now;}});
 await assert.rejects(f.run());assert.equal(f.s.opens,0);assert.equal(f.s.reads,0);assert.equal(f.s.closes,0);
});
check('query-opening-guard-nonvoid-after-open-closes-that-known-owner-without-read',async()=>{
 const f=fixture({guardResult:s=>s.opens?true:undefined});await assert.rejects(f.run());await flush();assert.equal(f.s.opens,1);assert.equal(f.s.reads,0);assert.equal(f.s.closes,1);
});
check('query-opening-guard-nonvoid-after-initial-view-prevents-query-entry',async()=>{
 const f=fixture({guardResult:s=>s.snapshots?false:undefined});await assert.rejects(f.run());await flush();assert.equal(f.s.opens,1);assert.equal(f.s.reads,0);assert.equal(f.s.closes,1);
});
check('query-opening-guard-nonvoid-after-read-withholds-history-with-one-close',async()=>{
 const f=fixture({guardResult:s=>s.reads?null:undefined});await assert.rejects(f.run());await flush();assert.equal(f.s.reads,1);assert.equal(f.s.closes,1);assert.throws(f.run);
});
check('query-opening-guard-nonvoid-after-close-cannot-publish-a-clean-result',async()=>{
 const f=fixture({guardResult:s=>s.closed?F({declaredLateReceipt:true}):undefined});await assert.rejects(f.run());await flush();assert.equal(f.s.reads,1);assert.equal(f.s.closes,1);
});
check('query-opening-guard-expiry-during-closed-owner-check-cannot-publish-history',async()=>{
 let fired=false;const f=fixture({guardResult(s){if(s.closed&&!fired){fired=true;s.timers[0].callback();}return undefined;}});
 await assert.rejects(f.run());await flush();assert.equal(f.s.reads,1);assert.equal(f.s.closes,1);
});
check('query-opening-guard-negative-initial-clock-refuses-before-timer-or-open',async()=>{
 const f=fixture({clock:()=>-1n});await assert.rejects(f.run());assert.equal(f.s.opens,0);assert.equal(f.s.timers.length,0);assert.equal(f.s.cancelled,0);
});
check('query-opening-guard-parent-coordinator-withholds-output-for-async-admission',async()=>{
 const f=coordinator({owner:{guardResult:()=>Promise.resolve(undefined)}}),result=await f.run();assert.equal(result.status,'CLOSE_UNKNOWN');assert.equal(result.exitCode,4);
 assert.equal(f.r.writes.length,0);assert.equal(f.r.owned.s.opens,0);assert.equal(f.r.owned.s.reads,0);assert.equal(f.r.closes,1);
});
check('query-opening-guard-parent-coordinator-withholds-output-for-clock-reentry',async()=>{
 let fired=false;const f=coordinator({owner:{clock(s){if(s.timers.length&&!fired){fired=true;s.timers[0].callback();}return s.now;}}}),result=await f.run();
 assert.equal(result.status,'CLOSE_UNKNOWN');assert.equal(result.exitCode,4);assert.equal(f.r.writes.length,0);assert.equal(f.r.owned.s.opens,0);assert.equal(f.r.closes,1);
});
check('query-opening-guard-valid-nonnegative-monotonic-time-keeps-original-output',async()=>{
 const f=fixture();f.s.now=1n;const result=await f.run();noAuthority(result);assert.equal(result.paymentHash,f.c.query.originalFunding.transactionId.slice(8));assert.equal(f.s.reads,1);
});
check('query-opening-guard-invokes-the-captured-guard-with-no-receiver-or-arguments',async()=>{
 let calls=0;const guard=F(function(){assert.equal(this,undefined);assert.equal(arguments.length,0);calls++;}),f=fixture({},null,guard);
 noAuthority(await f.run());assert.ok(calls>0);assert.equal(f.s.reads,1);
});
check('query-opening-guard-a-consumed-profile-cannot-retry-after-refusal',async()=>{
 let valid=false;const f=fixture({guardResult:()=>valid?undefined:true});await assert.rejects(f.run());valid=true;assert.throws(f.run);assert.equal(f.s.opens,0);
});
export const queryOpeningGuardDataCases=F([...checks]);
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const cases=[];let current=null,reported=false;
 function report(){if(reported)return;reported=true;const failed=cases.filter(c=>c.status!=='PASS').length;
  console.log(JSON.stringify({qualification:'G2_QUERY_OPENING_GUARD_DATA',passed:cases.length-failed,failed,cases,
   actualQueryOwnerAndCoordinator:true,ports:'DECLARED_TRANSPORT_GUARD_CLOCK_ONLY',transactionFields:'UNAUTHENTICATED_DATA',
   nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
   nativeQueryExecuted:false,nativePhysicalRelease:'NOT_ESTABLISHED',crossProcessFencing:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED',G2:'OPEN'}));if(failed)process.exitCode=1;}
 function unsettled(){if(current!==null){cases.push({id:current,status:'FAIL',error:'UNSETTLED_DECLARED_DATA_PROMISE'});report();}}
 process.once('beforeExit',unsettled);for(const {id,run}of checks){current=id;try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??'unknown').slice(0,256)});}current=null;}
 process.off('beforeExit',unsettled);report();
}
