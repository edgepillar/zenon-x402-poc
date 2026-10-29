// Actual profile/output codecs and coordinator; clock, timer, query and FIFO
// ports are declared memory DATA. No native channel, SQL, SDK or socket runs.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { fundingGrantCustodyDataFixture } from './funding-grant-custody.behavior.mjs';
import { storedGrantQueryDataFixture } from './stored-grant-query.behavior.mjs';
import { captureApiCreditCliArguments as argv } from '../src/api-credit-cli-arguments.js';
import { runApiCreditOriginalGrantQueryCoordinator as coordinate } from '../src/api-credit-recovery-inspection-coordinator.js';
import { consumeApiCreditOriginalGrantQueryProfile as consume,releaseApiCreditOriginalGrantQueryProfile as release } from '../src/api-credit-original-grant-query-profile.js';
import { captureApiCreditOriginalGrantQueryOutput as output } from '../src/api-credit-original-grant-query-owner.js';
import { createServiceCreditOriginalFundingGrantResult as history } from '../src/service-credit-original-funding-grant.js';

const F=Object.freeze,checks=[];
function check(id,run){checks.push({id,run});}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function flush(){for(let i=0;i<32;i++)await Promise.resolve();}
function fixture(options={}){
  const d=fundingGrantCustodyDataFixture(),s={now:0n,timers:[],cancels:[],reads:0,queries:0,writes:[],closes:0,views:0,closed:false,held:false,reading:false,writing:false,trace:[]};
  const result=output(F({apiCreditOriginalGrantQueryVersion:1,fundingResourceUrl:d.f.resourceUrl,paymentHash:d.packet.transactionHash,requestId:d.profile.query.requestId,
    checkpointDigest:d.captured.checkpointDigest,queryDigest:d.captured.queryDigest,history:history(d.profile.originalFunding,null),transportCloseObserved:true,
    localPayerStore:'NOT_OPENED',historicalObservation:true,reconciliationRequired:true,spendingReservation:'UNCHANGED',mayStartPayment:false,maySignPayment:false,
    mayDispatchService:false,mayActivateGrant:false,nativeResourceRelease:'NOT_ESTABLISHED',authority:'NONE'}));
  const ports=F({readProfile:F(g=>{g();s.reads++;return Promise.resolve(options.text??d.text);}),
    inspectOriginal:F((profile,g)=>{g();s.queries++;consume(profile);release(profile);return Promise.resolve(result);}),
    writeResult:F((line,g)=>{g();s.writes.push(line);return Promise.resolve(undefined);}),
    close:F(()=>{s.closes++;s.trace.push('close');if(options.close)return options.close(s);s.closed=true;return Promise.resolve(undefined);}),
    inspect:F(()=>{s.views++;s.trace.push('view');const v=F({lifecycle:s.closed?'CLOSED':'OPEN',held:s.held,reading:s.reading,writing:s.writing});return options.view?options.view(s,v):v;}),
    clock:F(()=>s.now),armTimer:F((budget,callback)=>{const t={kind:s.timers.length===0?'startup':'close',budget,callback};s.timers.push(t);s.trace.push('arm:'+t.kind);return options.arm?options.arm(s,t):t;}),
    cancelTimer:F(t=>{s.cancels.push(t);s.trace.push('cancel:'+t?.kind);if(options.cancel)return options.cancel(s,t);})});
  return {d,s,result,run:()=>coordinate({arguments:argv(['--funding-grant-query-fd','3','--output-fd','6','--bootstrap-ms','1000']),ports})};
}
function noAuthority(r){assert.equal(r.authority,'NONE');assert.equal(r.mayStartPayment,false);assert.equal(r.maySignPayment,false);assert.equal(r.mayDispatchService,false);assert.equal(r.automaticRetry,false);assert.equal(r.nativeResourceRelease,'NOT_ESTABLISHED');}
async function unknown(f){const r=await f.run();assert.equal(r.exitCode,4);assert.equal(r.status,'CLOSE_UNKNOWN');assert.equal(f.s.closes,1);noAuthority(r);return r;}

check('channel-close-clean-requires-two-known-timer-cancels-and-fresh-closed-views',async()=>{const f=fixture(),r=await f.run();assert.equal(r.exitCode,0);assert.equal(f.s.queries,1);assert.equal(f.s.writes.length,1);assert.equal(f.s.closes,1);assert.deepEqual(f.s.cancels.map(t=>t.kind),['startup','close']);assert.equal(new Set(f.s.cancels).size,2);assert.equal(r.channelClosedObserved,true);noAuthority(r);});
check('channel-close-stored-profile-uses-the-same-coordinator-and-result-binding',async()=>{const d=storedGrantQueryDataFixture(),f=fixture({text:canonicalJson(d.envelope)}),r=await f.run();assert.equal(r.exitCode,0);assert.equal(f.s.queries,1);assert.equal(JSON.parse(f.s.writes[0]).queryDigest,d.captured.queryDigest);assert.equal(f.s.closes,1);noAuthority(r);});
check('channel-close-known-invalid-profile-remains-bootstrap-refusal-after-clean-shutdown',async()=>{const f=fixture({text:'{}'}),r=await f.run();assert.equal(r.exitCode,1);assert.equal(r.status,'BOOTSTRAP_REFUSED');assert.equal(f.s.queries,0);assert.equal(f.s.writes.length,0);assert.equal(f.s.closes,1);assert.equal(r.channelClosedObserved,true);noAuthority(r);});
check('channel-close-startup-timer-retirement-consumes-the-single-close-window',async()=>{const f=fixture({cancel(s,t){if(t.kind==='startup')s.now=20000000n;}}),r=await f.run();assert.equal(r.exitCode,0);assert.deepEqual(f.s.timers.map(t=>t.budget),[1000,980]);assert.equal(f.s.closes,1);});
check('channel-close-known-pending-shutdown-may-settle-once-within-the-same-window',async()=>{const p=deferred(),f=fixture({close(){return p.promise;}}),run=f.run();await flush();assert.equal(f.s.closes,1);assert.equal(f.s.timers.length,2);f.s.closed=true;p.resolve(undefined);const r=await run;assert.equal(r.exitCode,0);assert.equal(f.s.closes,1);assert.equal(f.s.writes.length,1);});

// Exactly sixteen uncertain coordinator frames are retained by this suite.
// The production limit stays sixteen; no reset or larger limit is used.
check('channel-close-nonvoid-startup-timer-cancel-cannot-report-success',async()=>{const f=fixture({cancel(s,t){if(t.kind==='startup')return false;}});await unknown(f);assert.equal(f.s.queries,1);});
check('channel-close-late-startup-cancel-promise-cannot-repair-unknown',async()=>{const p=deferred(),f=fixture({cancel(s,t){if(t.kind==='startup')return p.promise;}}),r=await unknown(f);const before=canonicalJson(r);p.resolve(undefined);await flush();assert.equal(canonicalJson(r),before);assert.equal(f.s.closes,1);});
check('channel-close-throwing-startup-cancel-retains-unknown-with-one-channel-stop',async()=>{await unknown(fixture({cancel(s,t){if(t.kind==='startup')throw Error('declared cancel failure');}}));});
check('channel-close-nonvoid-close-timer-cancel-is-not-a-clean-receipt',async()=>{const f=fixture({cancel(s,t){if(t.kind==='close')return true;}}),r=await unknown(f);assert.equal(r.channelClosedObserved,false);});
check('channel-close-rejected-cancel-promise-is-observed-without-cleanup-retry',async()=>{const f=fixture({cancel(s,t){if(t.kind==='close')return Promise.reject(Error('declared rejected cancel'));}});await unknown(f);await flush();assert.equal(f.s.cancels.length,2);});
check('channel-close-throwing-close-timer-cancel-cannot-repeat-or-renew-the-close',async()=>{const f=fixture({cancel(s,t){if(t.kind==='close')throw Error('declared cancel failure');}});await unknown(f);assert.equal(f.s.timers.length,2);assert.equal(f.s.cancels.length,2);});
check('channel-close-held-view-created-during-cancel-is-rechecked-before-success',async()=>{const f=fixture({cancel(s,t){if(t.kind==='close')s.held=true;}}),r=await unknown(f);assert.equal(r.channelClosedObserved,false);});
check('channel-close-cancel-reaching-the-exact-deadline-cannot-renew-the-window',async()=>{const f=fixture({cancel(s,t){if(t.kind==='close')s.now=1000000000n;}});await unknown(f);assert.equal(f.s.timers.length,2);});
check('channel-close-clock-regression-during-cancel-is-sticky-unknown',async()=>{await unknown(fixture({cancel(s,t){if(t.kind==='close')s.now=-1n;}}));});
check('channel-close-reentrant-expiry-during-cancel-cannot-publish-provisional-clean',async()=>{const f=fixture({cancel(s,t){if(t.kind==='close')t.callback();}});await unknown(f);assert.equal(f.s.cancels.length,2);});
check('channel-close-accessor-closed-view-is-refused-without-calling-getters',async()=>{let hooks=0;const f=fixture({view(s,v){if(!s.closed)return v;const x={...v};Object.defineProperty(x,'held',{enumerable:true,get(){hooks++;throw Error();}});return F(x);}});await unknown(f);assert.equal(hooks,0);});
check('channel-close-opaque-close-thenable-is-not-assimilated-or-retried',async()=>{let hooks=0;const opaque=F(Object.defineProperty({},'then',{get(){hooks++;throw Error();}})),f=fixture({close(s){s.closed=true;return opaque;}});await unknown(f);assert.equal(hooks,0);});
check('channel-close-expiry-during-timer-arm-retires-the-returned-handle-once',async()=>{const p=deferred(),f=fixture({close(){return p.promise;},arm(s,t){if(t.kind==='close')t.callback();return t;}});await unknown(f);assert.deepEqual(f.s.cancels.map(t=>t.kind),['startup','close']);f.s.closed=true;p.resolve(undefined);await flush();assert.equal(f.s.closes,1);});
check('channel-close-opaque-arm-promise-is-held-without-using-it-as-a-timer-handle',async()=>{const f=fixture({arm(s,t){return t.kind==='close'?Promise.resolve(F({declaredOpaqueTimer:true})):t;}});await unknown(f);assert.equal(f.s.cancels.length,1);});
check('channel-close-expired-pending-stop-stays-unknown-after-late-clean-return',async()=>{const p=deferred(),f=fixture({close(){return p.promise;}}),run=f.run();await flush();f.s.now=1000000000n;f.s.timers[1].callback();const r=await run;assert.equal(r.exitCode,4);const before=canonicalJson(r);f.s.closed=true;p.resolve(undefined);await flush();assert.equal(canonicalJson(r),before);assert.equal(f.s.closes,1);assert.equal(f.s.writes.length,1);noAuthority(r);});
check('channel-close-microtask-gap-after-cancel-requires-a-fresh-post-await-view',async()=>{const f=fixture({cancel(s,t){if(t.kind==='close')Promise.resolve().then(()=>{s.held=true;});}}),r=await unknown(f);assert.equal(r.channelClosedObserved,false);assert.equal(f.s.closes,1);});

export const apiCreditRecoveryChannelCloseDataCases=F([...checks]);
if(process.argv[1]!==undefined&&fileURLToPath(import.meta.url)===process.argv[1]){
  const cases=[];let current=null,reported=false;
  function report(){if(reported)return;reported=true;const failed=cases.filter(r=>r.status!=='PASS').length;
    console.log(JSON.stringify({qualification:'G2_API_CREDIT_RECOVERY_CHANNEL_CLOSE_DATA',passed:cases.length-failed,failed,cases,
      actualProfileOutputCodecsAndCoordinator:true,queryClockTimerAndChannelPorts:'DECLARED_MEMORY_ONLY',signatureData:'UNAUTHENTICATED_EXISTING_FIELDS',
      nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
      nativeChannelRelease:'NOT_ESTABLISHED',freshProcess:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED'}));if(failed)process.exitCode=1;}
  function unsettled(){if(current!==null){cases.push({id:current,status:'FAIL',error:'UNSETTLED_DECLARED_DATA_PROMISE'});report();}}
  process.once('beforeExit',unsettled);
  for(const {id,run}of checks){current=id;try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??'unknown').slice(0,256)});}current=null;}
  process.off('beforeExit',unsettled);report();
}
