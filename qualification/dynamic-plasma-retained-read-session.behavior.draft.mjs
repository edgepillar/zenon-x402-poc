/* Real retained-session lifecycle and RPC wires, declared owner callbacks only.
 * No native HTTPS owner, SDK, SQLite, crypto, key, signing, nonce or network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRetainedDynamicPlasmaReadSessionCore as SESSION } from '../src/zenon/dynamic-plasma-retained-read-session-core.js';
import { selectBoundedJsonRpcReadAdmissionProfile as PROFILE, createBoundedJsonRpcReadAdmission as ADMIT } from '../src/zenon/bounded-json-rpc-read-admission.js';
import { createDynamicPlasmaJsonRpcReadTransport as DPWIRE } from '../src/zenon/dynamic-plasma-json-rpc-read-transport.js';
import { createZenonAccountStateReadTransport as ACCOUNTWIRE } from '../src/zenon/dynamic-plasma-account-state-read-transport.js';
import { createRetainedAccountStateExchangeGate as ACCOUNTGATE } from '../src/zenon/dynamic-plasma-retained-account-exchange-gate.js';

const DP = 'dynamic_plasma_retained_candidate', ACCOUNT = 'zenon_account_state_retained_candidate';
const OPTIONS = { timeout:5000, concurrency:false };
const totals = { declaredReads:0, declaredCloseStarts:0, hooks:0, maximalWireReads:0 };
const frozen = Object.freeze;
const raw = Object.freeze({ original:'same request object' });
function deferred() {
  let resolve, reject; const promise = new Promise((yes,no) => { resolve=yes; reject=no; });
  promise.catch(() => undefined); return { promise, resolve, reject };
}
function rejected(value) { const p=Promise.reject(value); p.catch(() => undefined); return p; }
function dangerous(value) {
  const fail=() => { totals.hooks++; throw Error('FORBIDDEN_HOOK'); };
  return new Proxy(value,{get:fail,getPrototypeOf:fail,ownKeys:fail,getOwnPropertyDescriptor:fail,apply:fail});
}
function isError(kind) {
  return e => {
    assert.ok(e instanceof TypeError && Object.isFrozen(e));
    assert.equal(e.code,'retained_dynamic_plasma_read_session_'+kind);
    assert.equal(e.stack,'TypeError: '+e.code); assert.equal(Object.hasOwn(e,'cause'),false); return true;
  };
}
function fixture({ reads=[], closes=[] }={}) {
  const seen=[[],[],[]], closeCounts=[0,0,0], readCounts=[0,0,0];
  const results=[Promise.resolve('first'),Promise.resolve('second'),Promise.resolve('account')];
  const closing=[Promise.resolve(undefined),Promise.resolve(undefined),Promise.resolve(undefined)];
  const owners=[];
  for(let i=0;i<3;i++) {
    const read=frozen(function read(request) {
      readCounts[i]++; totals.declaredReads++; seen[i].push(request);
      return reads[i] ? reads[i](request) : results[i];
    });
    const close=frozen(function close() {
      closeCounts[i]++; totals.declaredCloseStarts++;
      return closes[i] ? closes[i]() : closing[i];
    });
    owners.push(i<2 ? frozen({ transport:frozen({callRead:read}),close,requestBudget:PROFILE(DP) })
      : frozen({ exchange:read,close,requestBudget:PROFILE(ACCOUNT) }));
  }
  const options=frozen({firstOwner:owners[0],secondOwner:owners[1],accountOwner:owners[2]});
  const session=SESSION(options);
  return {session,options,owners,seen,results,closing,readCounts,closeCounts,
    capabilities:[session.readOptions.transports[0].callRead,session.readOptions.transports[1].callRead,session.readOptions.accountExchange]};
}
const tick=async()=>{ await undefined; await undefined; };

await test('construction captures all three owners without reads or closes and exposes exact preparer readOptions',OPTIONS,()=>{
  const f=fixture(),o=f.session.readOptions;
  assert.deepEqual(Object.keys(o),['transports','accountExchange']);
  assert.equal(o.transports.length,2); assert.deepEqual(f.closeCounts,[0,0,0]); assert.deepEqual(f.readCounts,[0,0,0]);
  assert.ok(Object.isFrozen(f.session)&&Object.isFrozen(o)&&Object.isFrozen(o.transports));
  assert.deepEqual(Object.keys(f.session),['readOptions','close','inspect']);
  assert.equal(f.session.inspect().lifecycle,'OPEN');
});
await test('each guarded read forwards the original request and original owned Promise with no outcome inspection',OPTIONS,()=>{
  const f=fixture();
  for(let i=0;i<3;i++) { assert.equal(f.capabilities[i](raw),f.results[i]); assert.equal(f.seen[i][0],raw); }
  assert.deepEqual(f.closeCounts,[0,0,0]);
});
await test('invalid frozen shapes and owner accessors or proxies refuse before any callback or hook',OPTIONS,()=>{
  const f=fixture();
  for(const value of [null,{},[],dangerous(f.options),{...f.options},frozen({...f.options,extra:true})])
    assert.throws(()=>SESSION(value),isError('configuration_rejected'));
  const getter=frozen({get firstOwner(){totals.hooks++;return f.owners[0];},secondOwner:f.owners[1],accountOwner:f.owners[2]});
  assert.throws(()=>SESSION(getter),isError('configuration_rejected'));
  assert.deepEqual(f.closeCounts,[0,0,0]); assert.deepEqual(f.readCounts,[0,0,0]); assert.equal(totals.hooks,0);
});
await test('profile clones floating budgets and legacy thirteen-slot owners cannot impersonate the selected retained contract',OPTIONS,()=>{
  const f=fixture();
  for(const profile of [PROFILE('dynamic_plasma'),frozen({...PROFILE(DP)}),frozen({maximumRequests:1000}),dangerous({})]) {
    const first=frozen({...f.owners[0],requestBudget:profile});
    assert.throws(()=>SESSION(frozen({...f.options,firstOwner:first})),isError('configuration_rejected'));
  }
  assert.equal(totals.hooks,0); assert.deepEqual(f.closeCounts,[0,0,0]);
});
await test('aliasing owner methods is refused before a shared callback could be counted as independent custody',OPTIONS,()=>{
  const f=fixture(), second=frozen({...f.owners[1],close:f.owners[0].close});
  assert.throws(()=>SESSION(frozen({...f.options,secondOwner:second})),isError('configuration_rejected'));
  assert.throws(()=>SESSION(f.options,1),isError('configuration_rejected'));
  assert.deepEqual(f.closeCounts,[0,0,0]);
});
await test('one cached close starts all three callbacks synchronously before any pending close resolves',OPTIONS,async()=>{
  const waits=[deferred(),deferred(),deferred()],f=fixture({closes:waits.map(w=>()=>w.promise)});
  const p=f.session.close(); assert.equal(f.session.close(),p); assert.deepEqual(f.closeCounts,[1,1,1]);
  assert.equal(f.session.inspect().lifecycle,'CLOSING'); assert.equal(f.session.inspect().closeSettled,0);
  waits[2].resolve();waits[0].resolve();await tick();assert.equal(f.session.inspect().lifecycle,'CLOSING');
  waits[1].resolve();assert.equal(await p,undefined);assert.equal(f.session.inspect().lifecycle,'CLOSED');
  assert.equal(f.session.close(),p); assert.deepEqual(f.closeCounts,[1,1,1]);
});
await test('retained readOptions are closed immediately while close settlement is still pending',OPTIONS,async()=>{
  const wait=deferred(),f=fixture({closes:[()=>wait.promise]});
  const p=f.session.close();
  const failures=f.capabilities.map(read=>read(raw));
  assert.ok(failures.every(value=>value===failures[0]));for(const value of failures)await assert.rejects(value,isError('unavailable'));
  assert.deepEqual(f.readCounts,[0,0,0]);wait.resolve();await p;
  await assert.rejects(f.capabilities[0](raw),isError('unavailable'));
});
await test('active read abortion is requested before waiting on that read and does not manufacture an operation result',OPTIONS,async()=>{
  const read=deferred(),reason=dangerous({private:'not inspected'});let f;
  f=fixture({reads:[()=>read.promise],closes:[()=>{read.reject(reason);return Promise.resolve(undefined);}]});
  const p=f.capabilities[0](raw);p.catch(()=>undefined);
  const close=f.session.close();assert.deepEqual(f.closeCounts,[1,1,1]);
  // Avoid assert.rejects' async bridge assimilating the hostile raw reason.
  await p.then(()=>assert.fail('must reject'),error=>{assert.equal(error,reason);return undefined;});await close;
  assert.equal(f.session.inspect().operationOutcome,'NOT_ESTABLISHED');assert.equal(totals.hooks,0);
});
await test('one rejected close permanently rejects the cached session close without suppressing the other two requests',OPTIONS,async()=>{
  const wait=deferred(),reason=dangerous({private:'not inspected'}),f=fixture({closes:[()=>rejected(reason),()=>wait.promise]});
  const p=f.session.close();await assert.rejects(p,isError('close_unknown'));
  assert.deepEqual(f.closeCounts,[1,1,1]);assert.equal(f.session.inspect().lifecycle,'CLOSE_OUTCOME_UNKNOWN');
  wait.resolve();await tick();await assert.rejects(f.session.close(),isError('close_unknown'));
  assert.equal(f.session.close(),p);assert.equal(f.session.inspect().closeUncertaintyLatched,true);assert.equal(totals.hooks,0);
});
await test('late successful closes update observations but cannot promote a failed close or reopen admission',OPTIONS,async()=>{
  const waits=[deferred(),deferred(),deferred()],f=fixture({closes:waits.map(w=>()=>w.promise)});
  const p=f.session.close();waits[0].reject('declared failure');await assert.rejects(p,isError('close_unknown'));
  waits[1].resolve();waits[2].resolve();await tick();
  const status=f.session.inspect();assert.equal(status.closeSettled,3);assert.equal(status.closeFulfilledUndefined,2);
  assert.equal(status.lifecycle,'CLOSE_OUTCOME_UNKNOWN');await assert.rejects(f.capabilities[2](raw),isError('unavailable'));
});
await test('successful-looking close objects and raw outcomes are not interpreted or accepted as undefined',OPTIONS,async()=>{
  for(const value of [frozen({status:'CLOSED'}),frozen({get status(){totals.hooks++;throw Error('STATUS');}}),true,'CLOSED',null]) {
    const f=fixture({closes:[()=>Promise.resolve(value)]});await assert.rejects(f.session.close(),isError('close_unknown'));
    assert.equal(f.session.inspect().lifecycle,'CLOSE_OUTCOME_UNKNOWN');
  }
  assert.equal(totals.hooks,0);
});
await test('thenables and proxy close Promises are rejected without invoking any then or proxy hook',OPTIONS,async()=>{
  const thenable=frozen({get then(){totals.hooks++;throw Error('THEN');}});
  for(const value of [thenable,dangerous(Promise.resolve(undefined))]) {
    const f=fixture({closes:[()=>value]});await assert.rejects(f.session.close(),isError('close_unknown'));
    assert.deepEqual(f.closeCounts,[1,1,1]);
  }
  assert.equal(totals.hooks,0);
});
await test('decorated and subclassed Promise close mechanics are not assimilated or silently accepted',OPTIONS,async()=>{
  const decorated=Promise.resolve(undefined);
  Object.defineProperty(decorated,'then',{get(){totals.hooks++;throw Error('THEN');}});
  class Derived extends Promise {}
  for(const value of [decorated,new Derived(resolve=>resolve(undefined))]) {
    const f=fixture({closes:[()=>value]});await assert.rejects(f.session.close(),isError('close_unknown'));
  }
  assert.equal(totals.hooks,0);
});
await test('direct dependency on the public close Promise is refused instead of deadlocking the session',OPTIONS,async()=>{
  let f;f=fixture({closes:[()=>f.session.close()]});
  const p=f.session.close();await assert.rejects(p,isError('close_unknown'));assert.deepEqual(f.closeCounts,[1,1,1]);
});
await test('one shared close Promise cannot masquerade as two independent owner settlements',OPTIONS,async()=>{
  const shared=Promise.resolve(undefined),f=fixture({closes:[()=>shared,()=>shared]});
  await assert.rejects(f.session.close(),isError('close_unknown'));assert.deepEqual(f.closeCounts,[1,1,1]);
  assert.equal(f.session.inspect().closeUncertaintyLatched,true);
});
await test('close callback reentry sees closed admission before it can issue any read',OPTIONS,async()=>{
  let f,refused;f=fixture({closes:[()=>{refused=f.capabilities[1](raw);return Promise.resolve(undefined);}]});
  await f.session.close();await assert.rejects(refused,isError('unavailable'));assert.deepEqual(f.readCounts,[0,0,0]);
});
await test('a synchronous read failure is scrubbed and closes every owner without inspecting the raw reason',OPTIONS,async()=>{
  const reason=dangerous({private:'not inspected'}),f=fixture({reads:[()=>{throw reason;}]});
  await assert.rejects(f.capabilities[0](raw),isError('unavailable'));await f.session.close();
  assert.deepEqual(f.closeCounts,[1,1,1]);assert.deepEqual(f.readCounts,[1,0,0]);assert.equal(totals.hooks,0);
});
await test('a synchronous close throw still requests the remaining owners and never exposes the raw failure',OPTIONS,async()=>{
  const f=fixture({closes:[()=>{throw dangerous({});}]});
  await assert.rejects(f.session.close(),isError('close_unknown'));assert.deepEqual(f.closeCounts,[1,1,1]);
  assert.equal(totals.hooks,0);
});
await test('wrong close arity cannot consume closure while wrong read arity fails closed for the entire session',OPTIONS,async()=>{
  const f=fixture();await assert.rejects(f.session.close(1),isError('input_rejected'));
  assert.deepEqual(f.closeCounts,[0,0,0]);assert.equal(f.session.inspect().lifecycle,'OPEN');
  await assert.rejects(f.capabilities[2](),isError('unavailable'));await f.session.close();
  assert.deepEqual(f.closeCounts,[1,1,1]);assert.equal(f.session.inspect().readRefused,true);
});
await test('Object then runtime drift produces permanent close uncertainty without invoking the hook',OPTIONS,async()=>{
  const f=fixture();let p;
  try {Object.defineProperty(Object.prototype,'then',{configurable:true,get(){totals.hooks++;throw Error('THEN');}});p=f.session.close();}
  finally {delete Object.prototype.then;}
  await assert.rejects(p,isError('close_unknown'));await assert.rejects(f.session.close(),isError('close_unknown'));
  assert.deepEqual(f.closeCounts,[1,1,1]);assert.equal(totals.hooks,0);
});
await test('Promise then descriptor drift is rejected before attaching any borrowed reaction',OPTIONS,async()=>{
  const f=fixture(),prior=Object.getOwnPropertyDescriptor(Promise.prototype,'then');let p;
  try {Object.defineProperty(Promise.prototype,'then',{configurable:true,get(){totals.hooks++;throw Error('THEN');}});p=f.session.close();}
  finally {Object.defineProperty(Promise.prototype,'then',prior);}
  await assert.rejects(p,isError('close_unknown'));assert.equal(totals.hooks,0);assert.deepEqual(f.closeCounts,[1,1,1]);
});
await test('inspection snapshots are detached frozen DATA and never claim native cleanup or store lifetime',OPTIONS,async()=>{
  const f=fixture(),before=f.session.inspect();await f.session.close();const after=f.session.inspect();
  assert.equal(Object.getPrototypeOf(before),null);assert.ok(Object.isFrozen(before));
  assert.equal(before.closeRequested,0);assert.equal(after.closeRequested,3);
  assert.equal(after.storeLifetime,'NOT_OWNED');assert.equal(after.nativeResourceCleanup,'NOT_QUALIFIED');
  assert.equal(after.authority,'NONE');assert.equal(after.automaticRetry,false);
  assert.throws(()=>f.session.inspect(1),isError('input_rejected'));
});
await test('an untrusted borrowed read result is forwarded by identity not transformed into an accepted owner Promise',OPTIONS,()=>{
  const value=dangerous({}),f=fixture({reads:[()=>value]});
  assert.equal(f.capabilities[0](raw),value);assert.equal(totals.hooks,0);
});

function payerAddress() {
  const alphabet='qpzry9x8gf2tvdw0s3jn54khce6mua7l',words=[];
  let accumulator=0,bits=0,checksum=1;
  for(const byte of [0,...Array(19).fill(7)]) {
    accumulator=(accumulator<<8)|byte;bits+=8;
    while(bits>=5){bits-=5;words.push((accumulator>>>bits)&31);}
  }
  for(const word of [3,0,26,...words,0,0,0,0,0,0]) {
    const top=checksum>>>25;checksum=((checksum&0x1ffffff)<<5)^word;
    for(const [i,g]of [0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3].entries())if((top>>>i)&1)checksum^=g;
  }
  checksum=(checksum^1)>>>0;
  return 'z1'+words.map(w=>alphabet[w]).join('')+Array.from({length:6},(_,i)=>alphabet[(checksum>>>(5*(5-i)))&31]).join('');
}
function wireFixture() {
  const owners=[],seen=[[],[],[]],admissions=[ADMIT(DP),ADMIT(DP),ADMIT(ACCOUNT)],closeCounts=[0,0,0];
  for(let i=0;i<3;i++){
    let closed=false;const closing=Promise.resolve(undefined);
    const close=frozen(function close(){if(!closed){closed=true;closeCounts[i]++;totals.declaredCloseStarts++;}return closing;});
    const exchange=frozen(function exchange(text){
      if(closed||!admissions[i].claim())return rejected(new Error('DECLARED_CLOSED_OR_EXHAUSTED'));
      totals.declaredReads++;seen[i].push(text);const packet=JSON.parse(text);
      return Promise.resolve('{"jsonrpc":"2.0","id":'+packet.id+',"result":null}');
    });
    if(i<2)owners.push(frozen({transport:DPWIRE({exchange}),close,requestBudget:PROFILE(DP)}));
    else owners.push(frozen({...ACCOUNTGATE(frozen({exchange,close})),requestBudget:PROFILE(ACCOUNT)}));
  }
  return {session:SESSION(frozen({firstOwner:owners[0],secondOwner:owners[1],accountOwner:owners[2]})),seen,admissions,closeCounts};
}
await test('actual RPC wires and admission counters complete six maximal thirteen-read DP cycles plus eighteen account reads without recreation',OPTIONS,async()=>{
  const f=wireFixture(),payer=payerAddress(),account=ACCOUNTWIRE({exchange:f.session.readOptions.accountExchange});
  const quote=frozen({address:payer,blockType:2,toAddress:payer,data:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='});
  const req=(method,params=[])=>frozen({method,params:frozen(params)});
  const cycle=[req('ledger.getFrontierMomentum'),req('ledger.getMomentumsByHeight',[2,1]),
    ...Array.from({length:8},(_,i)=>req('embedded.spork.getAll',[i,128])),
    req('embedded.plasma.getVariables'),req('embedded.plasma.getRequiredPoWForAccountBlock',[quote]),req('ledger.getFrontierMomentum')];
  assert.equal(cycle.length,13);
  for(let c=0;c<6;c++){
    for(let endpoint=0;endpoint<2;endpoint++)for(const request of cycle)
      assert.equal(await f.session.readOptions.transports[endpoint].callRead(request),'null');
    for(const method of ['ledger.getFrontierAccountBlock','ledger.getAccountInfoByAddress','ledger.getFrontierAccountBlock'])
      assert.equal(await account.callRead(req(method,[payer])),'null');
    assert.equal(f.session.inspect().lifecycle,'OPEN');assert.deepEqual(f.closeCounts,[0,0,0]);
  }
  assert.deepEqual(f.seen.map(v=>v.length),[78,78,18]);totals.maximalWireReads=174;
  for(let i=0;i<3;i++){
    assert.equal(f.admissions[i].snapshot().remaining,0);
    for(let id=1;id<=f.seen[i].length;id++)assert.equal(JSON.parse(f.seen[i][id-1]).id,id);
  }
  await f.session.close();assert.deepEqual(f.closeCounts,[1,1,1]);
  assert.equal(f.session.inspect().lifecycle,'CLOSED');
  const before=f.seen.map(v=>v.length);
  await assert.rejects(f.session.readOptions.transports[0].callRead(cycle[0]),isError('unavailable'));
  assert.deepEqual(f.seen.map(v=>v.length),before);
});
console.log('# retained-read-session-components '+JSON.stringify({cases:24,...totals,nativeHttpsOwnerImported:false,
  nativeConnections:0,SDK:0,SQLite:0,cryptoOperations:0,keys:0,signatures:0,nonceEvaluations:0,newTasks:0,newScratch:0,
  realCollectorOrPreparerInvoked:false,fullNativeRetainedFundingQualified:false}));
