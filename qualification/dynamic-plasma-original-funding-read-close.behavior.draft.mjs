/* Actual cooperative close join + actual retained read-session core.
 * All resource callbacks are declared in-process fixtures. No SDK/SQL/network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOriginalFundingReadCloseCoordinator as JOIN } from '../src/zenon/dynamic-plasma-original-funding-read-close.js';
import { createRetainedDynamicPlasmaReadSessionCore as READ_SESSION } from '../src/zenon/dynamic-plasma-retained-read-session-core.js';
import { selectBoundedJsonRpcReadAdmissionProfile as PROFILE } from '../src/zenon/bounded-json-rpc-read-admission.js';

const frozen=Object.freeze, OPTIONS={timeout:5000,concurrency:false};
const totals={readCloseCalls:0,operationSnapshots:0,declaredFundingCloses:0,guardCalls:0,hooks:0,joinedReadOwnerCloses:0};
const CLOSED=frozen({status:'CLOSED'});
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});promise.catch(()=>undefined);return{promise,resolve,reject};}
function rejected(reason){const p=Promise.reject(reason);p.catch(()=>undefined);return p;}
function dangerous(value){const fail=()=>{totals.hooks++;throw Error('FORBIDDEN_HOOK');};return new Proxy(value,{get:fail,getPrototypeOf:fail,ownKeys:fail,getOwnPropertyDescriptor:fail,apply:fail});}
const tick=async()=>{await undefined;await undefined;};
function error(kind){return value=>{assert.ok(value instanceof TypeError&&Object.isFrozen(value));assert.equal(value.code,'original_funding_read_close_'+kind);assert.equal(value.stack,'TypeError: '+value.code);assert.equal(Object.hasOwn(value,'cause'),false);return true;};}
function fixture({read,operation=null,funding,guard,readCallback,snapshotCallback,fundingCallback}={}){
 const counts={read:0,snapshot:0,funding:0,guard:0},trace=[];
 const readPromise=read===undefined?Promise.resolve(undefined):read;
 const fundingPromise=funding===undefined?Promise.resolve(CLOSED):funding;
 const callbacks=frozen({
  startReadClose:frozen(function startReadClose(){counts.read++;totals.readCloseCalls++;trace.push('READ_CLOSE');return readCallback?readCallback():readPromise;}),
  snapshotOperation:frozen(function snapshotOperation(){counts.snapshot++;totals.operationSnapshots++;trace.push('SNAPSHOT');return snapshotCallback?snapshotCallback():operation;}),
  closeFunding:frozen(function closeFunding(){counts.funding++;totals.declaredFundingCloses++;trace.push('FUNDING_CLOSE');return fundingCallback?fundingCallback():fundingPromise;}),
  canCloseFunding:frozen(function canCloseFunding(){counts.guard++;totals.guardCalls++;trace.push('GUARD');return guard?guard():true;})
 });
 return{join:JOIN(callbacks),callbacks,counts,trace,readPromise,fundingPromise};
}
await test('construction is inert and reserves one frozen prehandled public Promise before any resource callback',OPTIONS,()=>{
 const f=fixture();assert.deepEqual(f.counts,{read:0,snapshot:0,funding:0,guard:0});
 assert.deepEqual(Object.keys(f.join),['promise','start','inspect']);assert.ok(Object.isFrozen(f.join)&&Object.isFrozen(f.join.promise));
 assert.equal(f.join.inspect().lifecycle,'OPEN');assert.equal(f.join.inspect().started,false);
});
await test('invalid configuration proxies getters and mutable callbacks refuse without touching any capability',OPTIONS,()=>{
 const f=fixture();
 for(const value of [null,{},[],dangerous(f.callbacks),{...f.callbacks},frozen({...f.callbacks,extra:true})])assert.throws(()=>JOIN(value),error('configuration_rejected'));
 const getter=frozen({...f.callbacks,get startReadClose(){totals.hooks++;throw Error('GETTER');}});
 assert.throws(()=>JOIN(getter),error('configuration_rejected'));
 assert.throws(()=>JOIN(frozen({...f.callbacks,startReadClose:()=>Promise.resolve()})),error('configuration_rejected'));
 assert.throws(()=>JOIN(frozen({...f.callbacks,startReadClose:dangerous(f.callbacks.startReadClose)})),error('configuration_rejected'));
 assert.equal(totals.hooks,0);assert.deepEqual(f.counts,{read:0,snapshot:0,funding:0,guard:0});
});
await test('one cached start requests read close before the operation snapshot and never repeats either callback',OPTIONS,async()=>{
 const f=fixture(),p=f.join.start();assert.equal(p,f.join.promise);assert.equal(f.join.start(),p);
 assert.deepEqual(f.trace.slice(0,2),['READ_CLOSE','SNAPSHOT']);
 const result=await p;assert.equal(result.lifecycle,'CLOSED');assert.equal(result.operationOutcome,'NOT_ESTABLISHED');
 assert.equal(result.authority,'NONE');assert.equal(f.counts.read,1);assert.equal(f.counts.snapshot,1);assert.equal(f.counts.funding,1);
});
await test('settling the active operation first cannot release funding while read close is still pending',OPTIONS,async()=>{
 const reads=deferred(),operation=deferred(),funding=deferred(),f=fixture({read:reads.promise,operation:operation.promise,funding:funding.promise});
 const p=f.join.start();assert.equal(f.counts.funding,0);
 operation.resolve(frozen({get status(){totals.hooks++;throw Error('UNREAD_STATUS');}}));
 await tick();assert.equal(f.join.inspect().operationSettled,true);assert.equal(f.counts.funding,0);
 reads.reject('declared read uncertainty');await assert.rejects(p,error('close_unknown'));
 assert.equal(f.counts.funding,0);
});
await test('both clean read close and active-operation settlement are required before the real funding-close callback slot',OPTIONS,async()=>{
 const reads=deferred(),operation=deferred(),funding=deferred(),f=fixture({read:reads.promise,operation:operation.promise,funding:funding.promise});
 const p=f.join.start();operation.resolve(undefined);await tick();assert.equal(f.counts.funding,0);
 reads.resolve(undefined);await tick();assert.equal(f.counts.funding,1);assert.equal(f.join.inspect().fundingCloseSettled,false);
 funding.resolve(CLOSED);const result=await p;assert.equal(result.fundingClose,'CLOSED');assert.equal(f.counts.guard,2);
});
await test('clean read close alone never bypasses an unresolved active operation',OPTIONS,async()=>{
 const operation=deferred(),f=fixture({operation:operation.promise}),p=f.join.start();
 await tick();assert.equal(f.join.inspect().readCloseClean,true);assert.equal(f.counts.funding,0);
 operation.resolve(undefined);await p;assert.equal(f.counts.funding,1);
});
await test('an active-operation rejection is joined without inspecting raw properties or calling it payment success',OPTIONS,async()=>{
 const operation=deferred(),reason=dangerous({private:'must remain unread'}),f=fixture({operation:operation.promise});
 const p=f.join.start();operation.reject(reason);const result=await p;
 assert.equal(f.counts.funding,1);assert.equal(result.operationOutcome,'NOT_ESTABLISHED');assert.equal(totals.hooks,0);
});
await test('one rejected read close permanently vetoes funding release even after the operation later settles',OPTIONS,async()=>{
 const reads=deferred(),operation=deferred(),f=fixture({read:reads.promise,operation:operation.promise}),p=f.join.start();
 reads.reject(dangerous({}));await assert.rejects(p,error('close_unknown'));operation.resolve(undefined);await tick();
 assert.equal(f.counts.funding,0);assert.equal(f.join.start(),p);assert.equal(f.join.inspect().stage,'HELD');assert.equal(totals.hooks,0);
});
await test('a synchronous read-close throw is scrubbed and cannot reach the operation snapshot or funding close',OPTIONS,async()=>{
 const f=fixture({readCallback:()=>{throw dangerous({});}});await assert.rejects(f.join.start(),error('close_unknown'));
 assert.deepEqual(f.counts,{read:1,snapshot:0,funding:0,guard:0});assert.equal(totals.hooks,0);
});
await test('thenables proxies and non-undefined read-close outcomes never become a close permit',OPTIONS,async()=>{
 const thenable=frozen({get then(){totals.hooks++;throw Error('THEN');}});
 for(const read of [thenable,dangerous(Promise.resolve(undefined)),Promise.resolve(frozen({status:'CLOSED'}))]){
  const f=fixture({read});await assert.rejects(f.join.start(),error('close_unknown'));assert.equal(f.counts.funding,0);
 }
 assert.equal(totals.hooks,0);
});
await test('a failed snapshot still requests read close first but holds funding lifetime',OPTIONS,async()=>{
 const f=fixture({snapshotCallback:()=>{throw dangerous({});}});await assert.rejects(f.join.start(),error('close_unknown'));
 assert.equal(f.counts.read,1);assert.equal(f.counts.snapshot,1);assert.equal(f.counts.funding,0);assert.equal(totals.hooks,0);
});
await test('unsafe active-operation handles are refused without reading their then property',OPTIONS,async()=>{
 const thenable=frozen({get then(){totals.hooks++;throw Error('THEN');}});
 for(const operation of [undefined,thenable,dangerous(Promise.resolve(undefined)),frozen({done:true})]){
  const f=fixture({snapshotCallback:()=>operation});await assert.rejects(f.join.start(),error('close_unknown'));assert.equal(f.counts.funding,0);
 }
 assert.equal(totals.hooks,0);
});
await test('direct public-close dependencies and read-close operation aliases are rejected rather than deadlocked',OPTIONS,async()=>{
 let f;f=fixture({readCallback:()=>f.join.promise});await assert.rejects(f.join.start(),error('close_unknown'));
 let g;g=fixture({snapshotCallback:()=>g.join.promise});await assert.rejects(g.join.start(),error('close_unknown'));
 const shared=Promise.resolve(undefined),h=fixture({read:shared,operation:shared});await assert.rejects(h.join.start(),error('close_unknown'));
 assert.equal(f.counts.funding+g.counts.funding+h.counts.funding,0);
});
await test('a false or throwing source-owner guard vetoes the funding close entry without a retry',OPTIONS,async()=>{
 for(const guard of [()=>false,()=>{throw dangerous({});},()=>frozen({allowed:true})]){
  const f=fixture({guard});const p=f.join.start();await assert.rejects(p,error('close_unknown'));assert.equal(f.counts.funding,0);
  assert.equal(f.join.start(),p);assert.equal(f.counts.guard,1);
 }
 assert.equal(totals.hooks,0);
});
await test('source-owner drift after funding-close entry makes the result unknown even if CLOSED arrives',OPTIONS,async()=>{
 let allowed=true;const f=fixture({guard:()=>allowed,fundingCallback:()=>{allowed=false;return Promise.resolve(CLOSED);}});
 const p=f.join.start();await assert.rejects(p,error('close_unknown'));allowed=true;await tick();
 assert.equal(f.counts.funding,1);assert.equal(f.join.inspect().lifecycle,'CLOSE_OUTCOME_UNKNOWN');await assert.rejects(f.join.start(),error('close_unknown'));
});
await test('funding-close throws and rejections are scrubbed and never retried',OPTIONS,async()=>{
 for(const fundingCallback of [()=>{throw dangerous({});},()=>rejected(dangerous({}))]){
  const f=fixture({fundingCallback}),p=f.join.start();await assert.rejects(p,error('close_unknown'));
  assert.equal(f.join.start(),p);assert.equal(f.counts.funding,1);
 }
 assert.equal(totals.hooks,0);
});
await test('a funding-close Promise cannot alias the read close operation or reserved public close',OPTIONS,async()=>{
 let f;f=fixture({fundingCallback:()=>f.join.promise});await assert.rejects(f.join.start(),error('close_unknown'));
 let g;g=fixture({fundingCallback:()=>g.readPromise});await assert.rejects(g.join.start(),error('close_unknown'));
 const active=Promise.resolve(undefined),h=fixture({operation:active,fundingCallback:()=>active});await assert.rejects(h.join.start(),error('close_unknown'));
 assert.equal(f.counts.funding+g.counts.funding+h.counts.funding,3);
});
await test('CLOSED is read only from frozen own DATA; accessor or proxy close outcomes are never inspected',OPTIONS,async()=>{
 const getter=frozen({get status(){totals.hooks++;throw Error('STATUS');}});
 for(const value of [getter,frozen({status:'OPEN'}),{status:'CLOSED'},null,'CLOSED']){
  const f=fixture({funding:Promise.resolve(value)});await assert.rejects(f.join.start(),error('close_unknown'));
 }
 const f=fixture({fundingCallback:()=>dangerous({})});await assert.rejects(f.join.start(),error('close_unknown'));
 assert.equal(totals.hooks,0);
});
await test('runtime then drift still requests read stop but never reaches funding close or a new reaction hook',OPTIONS,async()=>{
 const f=fixture();let p;
 try{Object.defineProperty(Object.prototype,'then',{configurable:true,get(){totals.hooks++;throw Error('THEN');}});p=f.join.start();}
 finally{delete Object.prototype.then;}
 await assert.rejects(p,error('close_unknown'));assert.equal(f.counts.read,1);assert.equal(f.counts.funding,0);assert.equal(totals.hooks,0);
});
await test('reentrant close callbacks see the same reserved Promise and cannot start duplicate release',OPTIONS,async()=>{
 let f;let nested;f=fixture({readCallback:()=>{nested=f.join.start();return Promise.resolve(undefined);}});
 const p=f.join.start();await p;assert.equal(nested,p);assert.equal(f.counts.read,1);assert.equal(f.counts.funding,1);
});
await test('wrong start arity is inert and inspection is detached frozen non-authoritative DATA',OPTIONS,async()=>{
 const f=fixture(),before=f.join.inspect();await assert.rejects(f.join.start(1),error('input_rejected'));
 assert.equal(f.counts.read,0);await f.join.start();const after=f.join.inspect();
 assert.equal(before.started,false);assert.equal(after.started,true);assert.equal(Object.getPrototypeOf(after),null);assert.ok(Object.isFrozen(after));
 assert.equal(after.nativeResourceCleanup,'NOT_QUALIFIED');assert.equal(after.authority,'NONE');
 assert.throws(()=>f.join.inspect(1),error('input_rejected'));
});

function readSessionFixture({abortRead=null}={}){
 const waits=[deferred(),deferred(),deferred()],closeCounts=[0,0,0],owners=[];
 for(let i=0;i<3;i++){
  const read=frozen(function read(){return Promise.resolve('declared');});
  const close=frozen(function close(){
   closeCounts[i]++;totals.joinedReadOwnerCloses++;
   if(i===0&&abortRead)abortRead();
   return waits[i].promise;
  });
  owners.push(i<2?frozen({transport:frozen({callRead:read}),close,requestBudget:PROFILE('dynamic_plasma_retained_candidate')})
    :frozen({exchange:read,close,requestBudget:PROFILE('zenon_account_state_retained_candidate')}));
 }
 const session=READ_SESSION(frozen({firstOwner:owners[0],secondOwner:owners[1],accountOwner:owners[2]}));
 return{session,waits,closeCounts};
}
await test('actual read-session close starts all three owner closes before a joined active operation can settle',OPTIONS,async()=>{
 const r=readSessionFixture(),operation=deferred(),f=fixture({readCallback:r.session.close,operation:operation.promise}),p=f.join.start();
 assert.deepEqual(r.closeCounts,[1,1,1]);assert.equal(f.counts.funding,0);
 await assert.rejects(r.session.readOptions.transports[0].callRead(frozen({})),{code:'retained_dynamic_plasma_read_session_unavailable'});
 r.waits[0].resolve();r.waits[1].resolve();operation.resolve();await tick();assert.equal(f.counts.funding,0);
 r.waits[2].resolve();await p;assert.equal(f.counts.funding,1);assert.equal(r.session.inspect().lifecycle,'CLOSED');
});
await test('actual read-session uncertainty vetoes declared funding close after all later read and operation settlements',OPTIONS,async()=>{
 const r=readSessionFixture(),operation=deferred(),f=fixture({readCallback:r.session.close,operation:operation.promise}),p=f.join.start();
 r.waits[0].reject('declared uncertain');await assert.rejects(p,error('close_unknown'));
 r.waits[1].resolve();r.waits[2].resolve();operation.resolve();await tick();
 assert.equal(f.counts.funding,0);assert.equal(r.session.inspect().lifecycle,'CLOSE_OUTCOME_UNKNOWN');assert.equal(f.join.inspect().held,true);
});
await test('actual read-session abort can release a pending operation without converting its failure into success',OPTIONS,async()=>{
 const operation=deferred(),r=readSessionFixture({abortRead:()=>operation.reject(dangerous({}))});
 const f=fixture({readCallback:r.session.close,operation:operation.promise}),p=f.join.start();
 assert.deepEqual(r.closeCounts,[1,1,1]);for(const wait of r.waits)wait.resolve();
 const result=await p;assert.equal(result.operationOutcome,'NOT_ESTABLISHED');assert.equal(f.counts.funding,1);assert.equal(totals.hooks,0);
});
console.log('# original-funding-read-close-components '+JSON.stringify({cases:24,...totals,
 SDK:0,SQLite:0,nativeHTTPS:0,cryptoOperations:0,keys:0,signatures:0,nonceEvaluations:0,
 newTasks:0,newScratch:0,newRoots:0,actualSubmissionOwnerImported:false,fullV3FundingQualified:false}));
