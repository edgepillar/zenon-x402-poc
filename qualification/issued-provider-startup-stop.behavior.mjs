// Actual stop selector and operator control, with declared memory-only owners,
// readers and timers. No native launcher, process signal or resource is used.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createIssuedProviderStartupStop as create } from '../src/issued-provider-startup-stop.js';
import { createIssuedProviderOperatorControl as control } from '../src/issued-provider-operator-control.js';

const F=Object.freeze,checks=[];
function check(id,run){checks.push({id,run});}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function flush(){for(let i=0;i<32;i++)await Promise.resolve();}
function fixture(options={}){
 const input=deferred(),trace=[],writes=[],tokens=[];let closed=false,channelClosed=false,auxClosed=false,bootstrap=0;
 const startup=create(F(()=>{bootstrap++;return Promise.resolve(undefined);}));
 const ports=F({startProvider:F(()=>{startup.check();trace.push('start');return options.start??Promise.resolve(F({status:'LISTENING'}));}),
  inspectProvider:F(()=>F({phase:closed?'CLOSED':'OPEN',held:false,released:closed,activeOperations:0})),
  closeProvider:F(()=>{trace.push('provider-close');closed=true;return Promise.resolve(options.closeResult);}),
  resumeOriginalSettlement:F(()=>{startup.check();trace.push('resume');return options.operation??Promise.resolve(F({status:'PENDING'}));}),
  activateOriginalCommittedFunding:F(()=>{startup.check();throw Error('unselected');}),inspectOriginalCommittedServiceGrant:F(()=>{startup.check();throw Error('unselected');}),admitOriginalCommittedServiceGrant:F(()=>{startup.check();throw Error('unselected');}),
  reconcileOriginalFunding:F(()=>{startup.check();throw Error('unselected');}),recoverOriginalFundingFirstResult:F(()=>{startup.check();throw Error('unselected');}),
  inspectOriginalFundingHistory:F(()=>{startup.check();throw Error('unselected');}),
  readCommand:F(()=>{trace.push('read');return input.promise;}),writeResult:F(value=>{writes.push(JSON.parse(value));return Promise.resolve(undefined);}),
  closeChannel:F(()=>{trace.push('channel-close');channelClosed=true;input.resolve(null);return Promise.resolve(undefined);}),
  inspectChannel:F(()=>F({lifecycle:channelClosed?'CLOSED':'OPEN',held:false,reading:false,writing:false,writeCallbackPending:false,inputClosed:channelClosed,outputClosed:channelClosed,historicalClose:channelClosed?'FULFILLED_UNDEFINED':'NOT_REQUESTED'})),
  closeAuxiliary:F(()=>{trace.push('aux-close');auxClosed=true;return Promise.resolve(undefined);}),inspectAuxiliary:F(()=>F({closed:auxClosed,held:false,active:false})),clock:F(()=>0n),
  armTimer:F((ms,callback)=>{const token={ms,callback,cancelled:false};tokens.push(token);return token;}),cancelTimer:F(token=>{token.cancelled=true;})});
 const owner=control({mode:'FRESH',limits:{maxCommands:8,maxLineBytes:4096,maxInputBytes:32768,maxOutputBytes:32768,closeWaitMs:100},operationBudgetMs:1000,ports});
 startup.attachControl(owner.close);return {startup,owner,input,trace,writes,tokens,bootstrap:()=>bootstrap};
}

check('provider-startup-stop-is-inert-and-does-not-subscribe-or-acquire',()=>{let calls=0;const s=create(F(()=>{calls++;return Promise.resolve();}));s.check();assert.equal(calls,0);assert.deepEqual(s.inspect(),{stopped:false,held:false,controlAttached:false,selected:'NONE',settlement:'NOT_REQUESTED',physicalRelease:'NOT_ESTABLISHED',authority:'NONE'});});
check('provider-startup-stop-rejects-unfrozen-and-proxy-callbacks-without-entry',()=>{let calls=0;const fn=()=>{calls++;};assert.throws(()=>create(fn));assert.throws(()=>create(new Proxy(F(fn),{apply(){calls++;}})));assert.equal(calls,0);});
check('provider-startup-stop-caches-before-reentrant-original-close',async()=>{let calls=0,reentered,s;s=create(F(()=>{calls++;assert.throws(()=>s.check());reentered=s.requestStop();return Promise.resolve();}));const p=s.requestStop();assert.equal(reentered,p);assert.equal(s.requestStop(),p);await p;assert.equal(calls,1);assert.equal(s.inspect().selected,'BOOTSTRAP');});
check('provider-startup-stop-notifies-before-original-close-settles',async()=>{const close=deferred(),s=create(F(()=>close.promise));const p=s.requestStop();await s.whenRequested;assert.equal(s.inspect().settlement,'PENDING');assert.throws(()=>s.check());close.resolve();await p;assert.equal(s.inspect().settlement,'FULFILLED_UNDEFINED');assert.equal(s.inspect().physicalRelease,'NOT_ESTABLISHED');});
check('provider-startup-stop-before-acquisition-prevents-all-later-entries',async()=>{const s=create(F(()=>Promise.resolve())),entries=[];await s.requestStop();for(const name of ['profile','tls','journal','witness','application','channel'])assert.throws(()=>{s.check();entries.push(name);});assert.deepEqual(entries,[]);});
check('provider-startup-stop-during-profile-read-denies-secret-and-store-entry',async()=>{const read=deferred(),s=create(F(()=>{read.resolve('declared public data');return Promise.resolve();}));let entered=false;const original=read.promise.then(()=>{s.check();entered=true;});await s.requestStop();await assert.rejects(original);assert.equal(entered,false);});
check('provider-startup-stop-keeps-original-journal-promise-and-blocks-late-success',async()=>{const journal=deferred(),s=create(F(()=>Promise.resolve()));let roles=0;const original=journal.promise.then(()=>{s.check();roles++;});await s.requestStop();journal.resolve(F({records:F([])}));await assert.rejects(original);assert.equal(roles,0);assert.equal(s.inspect().stopped,true);});
check('provider-startup-stop-late-journal-rejection-never-restarts-read',async()=>{const journal=deferred(),s=create(F(()=>Promise.resolve()));let reads=1;const observed=journal.promise.then(()=>{s.check();},()=>{assert.throws(()=>s.check());});await s.requestStop();journal.reject(Error('declared original read loss'));await observed;assert.equal(reads,1);});
check('provider-startup-stop-control-handoff-is-inert-and-one-shot',()=>{let a=0,b=0;const s=create(F(()=>{a++;return Promise.resolve();}));s.attachControl(F(()=>{b++;return Promise.resolve();}));assert.throws(()=>s.attachControl(F(()=>Promise.resolve())));s.check();assert.equal(a+b,0);assert.equal(s.inspect().controlAttached,true);});
check('provider-startup-stop-after-handoff-selects-only-same-control',async()=>{let a=0,b=0;const close=deferred(),s=create(F(()=>{a++;return Promise.resolve();}));s.attachControl(F(()=>{b++;return close.promise;}));const p=s.requestStop();assert.equal(s.requestStop(),p);close.resolve();await p;assert.equal(a,0);assert.equal(b,1);assert.equal(s.inspect().selected,'CONTROL');});
check('provider-startup-stop-before-handoff-refuses-late-control-without-entry',async()=>{let late=0;const s=create(F(()=>Promise.resolve()));await s.requestStop();assert.throws(()=>s.attachControl(F(()=>{late++;return Promise.resolve();})));assert.equal(late,0);assert.equal(s.inspect().controlAttached,false);});
check('provider-startup-stop-rejects-thenable-without-reading-then',async()=>{let getters=0;const value={get then(){getters++;throw Error('unentered');}},s=create(F(()=>value));await assert.rejects(s.requestStop());assert.equal(getters,0);assert.equal(s.inspect().held,true);});
check('provider-startup-stop-rejects-own-promise-then-accessor-without-entry',async()=>{let getters=0;const p=Promise.resolve();Object.defineProperty(p,'then',{get(){getters++;throw Error('unentered');}});const s=create(F(()=>p));await assert.rejects(s.requestStop());assert.equal(getters,0);assert.equal(s.inspect().held,true);});
check('provider-startup-stop-wrong-close-result-remains-held-and-cached',async()=>{let calls=0;const s=create(F(()=>{calls++;return Promise.resolve(true);})),p=s.requestStop();await assert.rejects(p);assert.equal(s.requestStop(),p);assert.equal(calls,1);assert.equal(s.inspect().settlement,'REJECTED');assert.throws(()=>s.check());});
check('provider-startup-stop-synchronous-close-loss-retains-held',async()=>{const s=create(F(()=>{throw Error('declared stop loss');}));await assert.rejects(s.requestStop());assert.equal(s.inspect().held,true);assert.equal(s.inspect().selected,'BOOTSTRAP');});
check('provider-startup-stop-asynchronous-close-loss-does-not-select-fallback',async()=>{let bootstrap=0;const s=create(F(()=>{bootstrap++;return Promise.resolve();}));s.attachControl(F(()=>Promise.reject(Error('declared control loss'))));await assert.rejects(s.requestStop());assert.equal(bootstrap,0);assert.equal(s.inspect().held,true);});
check('provider-startup-stop-pending-close-has-no-retry-or-implicit-release',async()=>{const close=deferred();let calls=0;const s=create(F(()=>{calls++;return close.promise;})),p=s.requestStop();await flush();assert.equal(s.requestStop(),p);assert.equal(calls,1);assert.equal(s.inspect().settlement,'PENDING');close.resolve();await p;assert.throws(()=>s.check());});
check('provider-startup-stop-refuses-extra-arguments-without-state-change',()=>{const s=create(F(()=>Promise.resolve()));assert.throws(()=>s.requestStop('SIGTERM'));assert.throws(()=>s.check(true));assert.throws(()=>s.inspect(true));assert.throws(()=>s.attachControl(F(()=>Promise.resolve()),true));assert.equal(s.inspect().stopped,false);});
check('provider-startup-stop-control-before-run-closes-same-owners-without-start',async()=>{const f=fixture();await f.startup.requestStop();assert.equal(f.bootstrap(),0);assert.deepEqual(f.trace,['provider-close','aux-close','channel-close']);assert.throws(()=>f.owner.run());assert.equal(f.writes.length,0);});
check('provider-startup-stop-during-start-blocks-late-listening-and-output',async()=>{const start=deferred(),f=fixture({start:start.promise}),work=f.owner.run();await flush();await f.startup.requestStop();start.resolve(F({status:'LISTENING'}));const r=await work;assert.equal(r.exitCode,4);assert.deepEqual(f.trace,['start','provider-close','aux-close','channel-close']);assert.equal(f.writes.length,0);assert.equal(f.bootstrap(),0);});
check('provider-startup-stop-open-control-unblocks-original-input-and-closes-once',async()=>{const f=fixture(),work=f.owner.run();await flush();const before=f.writes.length;await f.startup.requestStop();const r=await work;assert.equal(r.exitCode,0);assert.equal(f.writes.length,before);assert.equal(f.trace.filter(v=>v==='provider-close').length,1);assert.equal(f.trace.filter(v=>v==='channel-close').length,1);assert.equal(f.bootstrap(),0);assert.equal(f.tokens.every(t=>t.cancelled),true);});
check('provider-startup-stop-unknown-control-close-retains-auxiliary-no-bootstrap-fallback',async()=>{const f=fixture({closeResult:true}),work=f.owner.run();await flush();await assert.rejects(f.startup.requestStop());const r=await work;assert.equal(r.exitCode,4);assert.equal(f.trace.includes('aux-close'),false);assert.equal(f.trace.filter(v=>v==='channel-close').length,1);assert.equal(f.bootstrap(),0);assert.equal(f.startup.inspect().held,true);});

export const issuedProviderStartupStopDataCases=F([...checks]);
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const cases=[];let current=null,reported=false;
 function report(){if(reported)return;reported=true;const failed=cases.filter(c=>c.status==='FAIL').length;console.log(JSON.stringify({qualification:'G2_ISSUED_PROVIDER_STARTUP_STOP_DATA',passed:cases.length-failed,failed,cases,
  declaredPorts:'MEMORY_ONLY_BOOTSTRAP_PROVIDER_CHANNEL_TIMER_JOURNAL',nativeExecutions:0,SDK:0,SQLite:0,sockets:0,signals:0,keys:0,signatures:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,physicalRelease:'NOT_ESTABLISHED',nativeAcceptance:'NOT_ESTABLISHED'}));if(failed)process.exitCode=1;}
 process.once('beforeExit',()=>{if(cases.length!==checks.length){cases.push({id:current??'incomplete',status:'FAIL',error:'UNSETTLED_DATA_PROMISE'});report();process.exitCode=1;}});
 for(const c of checks){current=c.id;try{await c.run();cases.push({id:c.id,status:'PASS'});}catch{cases.push({id:c.id,status:'FAIL',error:'DATA_ASSERTION'});}}
 report();
}
