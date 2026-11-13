// Actual stored and purchased recovery profile/owner code. Every lifecycle and
// guard port is declared memory DATA; paths and proof fields are inert strings.
import assert from 'node:assert/strict';
import { storedGrantQueryDataFixture } from './stored-grant-query.behavior.mjs';
import { purchasedGrantRecoveryData, captured } from './purchased-grant-recovery.fixture.mjs';
import { resolveApiCreditStoredGrantQueryOwner as resolveOwner } from '../src/api-credit-stored-grant-query-owner.js';

const F=Object.freeze,DEFINE=Object.defineProperty,D=Object.getOwnPropertyDescriptor;
const SPECIES=D(Promise,Symbol.species),EVERY=D(Array.prototype,'every');
const stages=['before-open','after-open','before-read','after-read','before-projection',
  'after-projection','before-cleanup','after-close','after-closed-view'];
const cases=[],results=[],admission={};
function check(id,run){cases.push({id,run});}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function flush(){for(let i=0;i<12;i++)await Promise.resolve();}
function fixture(options={}){
  const version=options.version??2,d=version===3?purchasedGrantRecoveryData():storedGrantQueryDataFixture(),profile=captured(d.envelope);
  const s={opens:0,reads:0,views:0,current:0,revokes:0,closes:0,guards:[],trace:[],phase:'OPEN',fault:false,hooks:0};
  const counts=()=>[s.opens,s.reads,s.views,s.current,s.revokes,s.closes];
  const owner=F({grantQueryCustody:F({read:F(id=>{s.reads++;s.trace.push('READ');assert.equal(id,d.row.paymentId);return d.raw;})}),
    inspect:F(()=>{s.views++;s.trace.push('VIEW:'+s.phase);return F({spendingFileOwnerVersion:1,lifecycle:s.phase,held:false,busy:false,
      backendClosed:s.phase!=='OPEN',databaseOpen:s.phase!=='CLOSED',physicalCloseEntered:s.phase==='CLOSED',physicalCloseReturned:s.phase==='CLOSED'});}),
    assertCurrent:F(()=>{s.current++;s.trace.push('CURRENT');}),
    revoke:F(()=>{s.revokes++;s.trace.push('REVOKE');s.phase='REVOKED';}),
    close:F(()=>{s.closes++;s.trace.push('CLOSE');s.phase='CLOSED';})});
  const ports=F({openFile:F(configuration=>{s.opens++;s.trace.push('OPEN');assert.equal(configuration.storageProfile.mode,'OPEN_EXISTING');return owner;})});
  const receipt=deferred();
  const guard=F(()=>{
    s.guards.push({counts:counts(),trace:s.trace.slice()});
    if(s.guards.length!==options.at)return;
    s.fault=true;
    if(options.kind==='THROW')throw Error('DECLARED_SYNCHRONOUS_REVOCATION');
    if(options.kind==='FALSE')return false;
    if(options.kind==='NULL')return null;
    if(options.kind==='THENABLE')return F(DEFINE({},'then',{get(){s.hooks++;throw Error('OPAQUE_THEN');}}));
    if(options.kind==='PROXY')return new Proxy({}, {get(){s.hooks++;throw Error('OPAQUE_GET');},
      getPrototypeOf(){s.hooks++;throw Error('OPAQUE_PROTOTYPE');},ownKeys(){s.hooks++;throw Error('OPAQUE_KEYS');}});
    if(options.kind==='SPECIES')DEFINE(Promise,Symbol.species,{...SPECIES,get(){s.hooks++;return Promise;}});
    else if(options.kind==='ARRAY')DEFINE(Array.prototype,'every',{...EVERY,value(){s.hooks++;throw Error('BORROWED_ARRAY_METHOD');}});
    else assert.equal(options.kind,'PROMISE');
    return receipt.promise;
  });
  return {d,profile,s,counts,receipt,run:()=>resolveOwner(F({profile,ports,requireOpening:guard}))};
}

for(const version of [2,3])check('stored-opening-void-guard-preserves-v'+version+'-profile-and-one-close',()=>{
  const f=fixture({version}),out=f.run(),ready=version===3?out.profile:out;
  assert.equal(ready.queryDigest,f.d.captured.queryDigest);assert.equal(ready.proof.signature,f.d.profile.query.proof.signature);
  assert.equal(f.s.opens,1);assert.equal(f.s.reads,1);assert.equal(f.s.revokes,1);assert.equal(f.s.closes,1);
  assert.equal(f.s.phase,'CLOSED');assert.equal(f.s.guards.length,stages.length);
  if(version===3)assert.equal(out.purchasedGrantRecoveryVersion,1);
  admission[version]=F(Object.fromEntries(stages.map((name,i)=>[name,f.s.guards[i]])));
});
check('stored-opening-sync-revocation-before-open-acquires-no-file',()=>{
  const f=fixture({at:1,kind:'THROW'});assert.throws(f.run);assert.equal(f.s.fault,true);assert.deepEqual(f.counts(),[0,0,0,0,0,0]);
});
check('stored-opening-sync-revocation-after-read-keeps-known-quiescent-cleanup',()=>{
  const point=admission[3]['after-read'],f=fixture({version:3,at:4,kind:'THROW'});
  assert.throws(f.run);assert.equal(f.s.fault,true);assert.equal(f.s.guards.length,4);
  assert.equal(f.s.reads,point.counts[1]);assert.equal(f.s.revokes,1);assert.equal(f.s.closes,1);assert.equal(f.s.phase,'CLOSED');
});
async function unknown(stage,kind,version=2){
  const at=stages.indexOf(stage)+1,point=admission[version][stage],f=fixture({version,at,kind});
  try{assert.throws(f.run);}finally{
    if(kind==='SPECIES')DEFINE(Promise,Symbol.species,SPECIES);
    if(kind==='ARRAY')DEFINE(Array.prototype,'every',EVERY);
  }
  assert.equal(f.s.fault,true);assert.equal(f.s.guards.length,at);
  // No lifecycle port or ready-profile publication follows the opaque guard.
  assert.deepEqual(f.counts(),point.counts);assert.deepEqual(f.s.trace,point.trace);assert.equal(f.s.hooks,0);
  if(kind==='PROMISE'&&at%2===0)f.receipt.reject(Error('DECLARED_LATE_GUARD_REJECTION'));
  else f.receipt.resolve(undefined);
  await flush();assert.deepEqual(f.counts(),point.counts);assert.deepEqual(f.s.trace,point.trace);assert.equal(f.s.hooks,0);
}
for(const stage of stages)check('stored-opening-unjoined-guard-stops-'+stage,()=>unknown(stage,'PROMISE'));
check('stored-opening-purchased-profile-receipt-stops-after-read',()=>unknown('after-read','PROMISE',3));
for(const [kind,stage]of [['FALSE','before-open'],['NULL','after-open'],['THENABLE','after-open'],
  ['PROXY','after-open'],['SPECIES','after-open'],['ARRAY','after-open']]){
  check('stored-opening-nonvoid-'+kind.toLowerCase()+'-retains-without-hooks',()=>unknown(stage,kind));
}
// Nine boundary cases plus the purchased case and six distinct receipt kinds
// retain exactly sixteen frames. The production bound is never reset/enlarged.
check('stored-opening-sixteen-held-frames-refuse-new-owner-acquisition',()=>{
  const f=fixture();assert.throws(f.run);assert.equal(f.s.fault,false);assert.equal(f.s.guards.length,0);
  assert.deepEqual(f.counts(),[0,0,0,0,0,0]);
});

let active=null,reported=false;
function report(){
  if(reported)return;reported=true;const failed=results.filter(row=>row.status!=='PASS').length;
  process.stdout.write(JSON.stringify({qualification:'G2_STORED_GRANT_OPENING_GUARD_DATA',passed:results.length-failed,failed,cases:results,
    retainedUnknownFrameLimit:16,ownerLifecycleGuardPorts:'DECLARED_MEMORY_ONLY',nativeExecutions:0,SDK:0,SQLite:0,
    keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,
    signatureFields:'EXISTING_UNAUTHENTICATED_DATA_ONLY',freshProcess:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED',G0G5Acceptance:'OPEN'})+'\n');
  if(failed)process.exitCode=1;
}
function unsettled(){if(active!==null){results.push({id:active,status:'FAIL',error:'UNSETTLED_DECLARED_PROMISE'});report();}}
process.once('beforeExit',unsettled);
for(const {id,run}of cases){active=id;try{await run();results.push({id,status:'PASS'});}catch(value){results.push({id,status:'FAIL',errorType:value?.name??'UNKNOWN'});}active=null;}
process.off('beforeExit',unsettled);report();
