// Selected declared-store behavior for the private known-record witness index.
// No SQL, SDK, network, payment, signature, work producer or timing benchmark.
// Full-capacity recovery reads exercise 1024 distinct keys, not service TPS.
import test, { after } from 'node:test';
import a from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ENTRY="qualification/service-credit-custodied-owner-known-index.behavior.draft.mjs";
const SELF=fileURLToPath(import.meta.url),REPO=resolve(dirname(SELF),'..');
const SPECS=[
  [
    "src/service-credit-custodied-request-owner.js",
    37513,
    986,
    "01e3dd01a8f3cd408b6d5df0938994b7ca704d778d8ea7c144b40ca264163a3d"
  ],
  [
    "src/service-credit-original-request-custody-contract.js",
    14051,
    356,
    "fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915"
  ],
  [
    "package.json",
    1413,
    40,
    "8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"
  ]
];
a.equal(process.argv.length,2);a.equal(process.argv[1],SELF);
a.equal(process.versions.node,'24.19.0');a.equal(process.platform,'darwin');a.equal(process.arch,'arm64');
a.equal(process.env.P2_KNOWN_INDEX_OPT_IN,'synthetic-declared-known-index-only');
const PINS=JSON.parse(process.env.P2_KNOWN_INDEX_PINS);
const ids=s=>['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k=>String(s[k]));
const sha=b=>createHash('sha256').update(b).digest('hex');
function sources() {
  a.equal(PINS.length,4); a.deepEqual(PINS.map(p=>p.path),[...SPECS.map(s=>s[0]),ENTRY]);
  let total=0;
  return PINS.map((p,index)=>{
    const path=join(REPO,p.path), st=lstatSync(path,{bigint:true});
    a.ok(st.isFile()&&!st.isSymbolicLink()); a.equal(st.uid,BigInt(process.getuid())); a.equal(st.nlink,1n);
    a.ok(st.size>0n&&st.size<=65536n); a.deepEqual(ids(st),p.identity);
    const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW), raw=Buffer.alloc(Number(st.size)+1);
    let used=0;
    try {
      a.deepEqual(ids(fstatSync(fd,{bigint:true})),p.identity);
      while(used<raw.length) { const n=readSync(fd,raw,used,raw.length-used,null); if(!n) break; used+=n; }
      a.deepEqual(ids(fstatSync(fd,{bigint:true})),p.identity);
    } finally { closeSync(fd); }
    a.deepEqual(ids(lstatSync(path,{bigint:true})),p.identity); a.equal(used,Number(st.size));
    const bytes=raw.subarray(0,used);
    a.equal(bytes.includes(0),false); a.equal(bytes.some(n=>n>127),false);
    total+=used; a.ok(total<=98304); a.equal(used,p.bytes); a.equal(sha(bytes),p.sha256);
    a.equal(bytes.filter(n=>n===10).length,p.LF);
    if(index<SPECS.length) a.deepEqual([p.path,p.bytes,p.LF,p.sha256],SPECS[index]);
    return {path:p.path,bytes:p.bytes,sha256:p.sha256,identity:p.identity};
  });
}
const sourceBefore=sources();
const {createServiceCreditCustodiedRequestOwner:V2,createServiceCreditCustodiedRequestOwnerV3:V3}
  =await import('../src/service-credit-custodied-request-owner.js');
const {captureOriginalServiceRequestCustody:CAPTURE,serializeOriginalServiceRequestCustody:SERIALIZE,
  captureOriginalServiceDispatchIntent:CAPTURE_INTENT,serializeOriginalServiceDispatchIntent:SERIALIZE_INTENT}
  =await import('../src/service-credit-original-request-custody-contract.js');
const FUNDING='https://known-index.invalid/funding',SERVICE='https://known-index.invalid/service-credit/v1/execute';
const GRANT='synthetic-index-grant',HASH='a'.repeat(64),PREFIX='SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const BINDING=Object.freeze({fundingResourceUrl:FUNDING,paymentHash:HASH,network:'zenon:testnet'});
const OPTIONS={concurrency:false,timeout:5000};
function freeze(v){if(v!==null&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
function frozen(v){if(v!==null&&typeof v==='object'){a.equal(Object.isFrozen(v),true);for(const x of Object.values(v))frozen(x);}}
const key=id=>({grantId:GRANT,requestId:id});
function input(id,units=1){return {grantId:GRANT,requestId:id,
  originalRequestJson:JSON.stringify({modelVersion:1,grantId:GRANT,requestId:id,method:'POST',
    routeId:'service-credit.execute.v1',canonicalBodyDigest:'sha256:'+sha(Buffer.alloc(0)),
    selectedContentType:'application/json',maxCostUnits:units}),
  originalBodyBase64:'',serviceResourceUrl:SERVICE};}
function original(id,units=1){const v=input(id,units);return CAPTURE({originalRequestJson:v.originalRequestJson,
  originalBodyBase64:v.originalBodyBase64,serviceResourceUrl:SERVICE},BINDING);}
function intent(f,record){return CAPTURE_INTENT(record,{fundingRevision:3,challengeDigest:'sha256:'+'b'.repeat(64),
  paymentDigest:'sha256:'+'c'.repeat(64),custodyPolicy:f.policy});}
function funding(){return freeze({revision:3,status:'BOUND',ambiguityLatched:false,resourceUrl:FUNDING,
  challengeHeader:'synthetic-opaque-challenge',paymentHeader:'synthetic-opaque-payment',paymentRequired:{},
  paymentPayload:{x402Version:2,resource:{},accepted:{},payload:{transaction:{hash:HASH},intentDigest:'declared'}},
  requirement:{scheme:'exact',network:'zenon:testnet',asset:'synthetic',amount:'1',payTo:'synthetic',
    maxTimeoutSeconds:30,extra:{}}});}
function errorIs(e,suffix){a.equal(Object.getPrototypeOf(e),TypeError.prototype);a.equal(e.code,PREFIX+suffix);
  a.equal(e.message,e.code);a.equal(e.stack,'TypeError: '+e.code);a.equal(Object.isFrozen(e),true);return true;}
const throws=(fn,suffix)=>a.throws(fn,e=>errorIs(e,suffix));
const rejects=(p,suffix)=>a.rejects(p,e=>errorIs(e,suffix));
function fixture(t,version,maxRequests){
  const f={version,policy:Object.freeze({policyVersion:1,maxRequests,serviceResourceUrl:SERVICE}),
    records:new Map(),intents:new Map(),funding:funding(),known:new Set(),stateReads:0,
    calls:{load:0,get:0,retain:0,fence:0,intent:0,send:0,close:0}};
  const store={
    load(){a.equal(this,store);f.calls.load++;return f.funding;},
    getOriginalRequest(k){a.equal(this,store);f.calls.get++;return f.records.get(k.requestId)??null;},
    retainOriginalRequest(v){
      a.equal(this,store);f.calls.retain++;a.equal(f.records.has(v.requestId),false);
      const r=original(v.requestId);a.equal(v.grantId,GRANT);a.equal(v.originalRequestJson,r.originalRequestJson);
      a.equal(v.originalBodyBase64,'');a.equal(v.serviceResourceUrl,SERVICE);f.records.set(r.requestId,r);return r;
    },
    close(){f.calls.close++;throw Error('BORROWED_STORE_CLOSE_FORBIDDEN');},
  };
  if(version===3) Object.assign(store,{
    fenceOriginalDispatchIntent(k){a.equal(this,store);f.calls.fence++;a.equal(f.intents.has(k.requestId),false);
      const r=intent(f,f.records.get(k.requestId));f.intents.set(k.requestId,r);return r;},
    getOriginalDispatchIntent(k){a.equal(this,store);f.calls.intent++;return f.intents.get(k.requestId)??null;},
  });
  f.owner=(version===2?V2:V3)({store,fundingResourceUrl:FUNDING,custodyPolicy:f.policy,selectedGrantId:GRANT});
  frozen(f.owner);
  a.deepEqual(Object.keys(f.owner),['submitOriginal','readOriginal','readOriginalRecoveryState',
    ...(version===3?['readOriginalRecoveryKeys']:[]),'snapshot','close']);
  t.after(async()=>{const held=f.owner.snapshot().uncertainty.custody;
    await finish(f,held);a.equal(f.calls.close,0);});
  return f;
}
function observe(f,id,unknown=false){
  const v=f.owner.readOriginalRecoveryState(key(id));frozen(v);
  a.equal(v.original.requestId,id);a.equal(SERIALIZE(v.original),SERIALIZE(f.records.get(id)));
  a.equal(v.authority,'NONE');a.equal(v.qualification,'UNQUALIFIED');a.equal(v.serviceOutcome,'NOT_ESTABLISHED');
  a.equal(v.funding.paymentHash,HASH);a.equal(v.funding.revision,3);a.equal(v.funding.status,'BOUND');
  a.equal(v.uncertainty.custody,unknown);a.equal(v.uncertainty.submission,false);a.equal(v.uncertainty.undrained,false);
  if(f.version===3){const expected=f.intents.get(id)??null;
    a.equal(v.dispatchStatus,expected===null?'NO_INTENT_RECORDED':'POSSIBLY_ATTEMPTED');
    a.equal(v.dispatchIntent===null?null:SERIALIZE_INTENT(v.dispatchIntent),
      expected===null?null:SERIALIZE_INTENT(expected));}
  f.known.add(id);f.stateReads++;return v;
}
async function finish(f,held){
  const p=f.owner.close();a.equal(p,f.owner.close());
  if(held)await rejects(p,'CLOSE_FAILED');else a.equal(await p,undefined);
  a.equal(p,f.owner.close());a.equal(f.owner.snapshot().closed,true);
  a.equal(f.owner.snapshot().closeOutcome,held?'UNKNOWN':'DRAINED');a.equal(f.calls.close,0);
}
async function held(f){
  a.equal(f.owner.snapshot().uncertainty.custody,true);
  const before={...f.calls};await rejects(f.owner.submitOriginal(input('not-dispatched'),()=>{f.calls.send++;}),
    'CUSTODY_OUTCOME_UNKNOWN');a.deepEqual(f.calls,before);await finish(f,true);
}
function diagnostic(t,scenario,f,unknown){
  const snap=f.owner.snapshot();a.equal(snap.recoveryAuthority,'NONE');a.equal(snap.durability,'NOT_ESTABLISHED');
  a.equal(snap.uncertainty.custody,unknown);a.equal(f.calls.close,0);
  t.diagnostic(JSON.stringify({kind:'P2_KNOWN_INDEX',version:1,scenario,ownerVersion:f.version,
    maxRequests:f.policy.maxRequests,distinctValidatedKeys:f.known.size,successfulRecoveryStateReads:f.stateReads,
    submits:f.calls.send,retains:f.calls.retain,intentWrites:f.calls.fence,custodyUnknown:unknown,
    closeOutcome:snap.closeOutcome,storeCloseCalls:0,nativeSqliteFiles:0,networkCalls:0,
    syntheticSignatureOperations:0,realPaymentSigner:'DISABLED',serviceDelivery:'NOT_ESTABLISHED'}));
}
after(()=>a.deepEqual(sources(),sourceBefore));
for(const version of [2,3]) test(["V2 maximum-capacity witness index preserves reverse reads and capacity refusal","V3 maximum-capacity witness index preserves original and intent checksums","full index upgrades one known intent without allocating another witness slot","indexed original checksum changes remain sticky after restored data","prototype-named request ids and foreign grants preserve the normal V3 lifecycle"][version-2],OPTIONS,async t=>{
  const f=fixture(t,version,1024),ids=[];
  for(let n=0;n<1024;n++){const id='r'+String(n).padStart(4,'0');ids.push(id);
    const r=original(id);f.records.set(id,r);if(version===3)f.intents.set(id,intent(f,r));}
  const fundingBefore=JSON.stringify(f.funding);
  for(const id of ids)observe(f,id);
  for(let n=ids.length-1;n>=0;n--)observe(f,ids[n]);
  a.equal(f.known.size,1024);a.equal(f.stateReads,2048);
  a.equal(f.owner.readOriginalRecoveryState(key('never-observed')),null);
  const extra=original('overflow');f.records.set('overflow',extra);
  if(version===3)f.intents.set('overflow',intent(f,extra));
  throws(()=>f.owner.readOriginalRecoveryState(key('overflow')),'CUSTODY_OUTCOME_UNKNOWN');
  observe(f,ids[0],true);a.equal(JSON.stringify(f.funding),fundingBefore);
  a.equal(f.calls.retain,0);a.equal(f.calls.fence,0);a.equal(f.calls.send,0);await held(f);
  diagnostic(t,version===2?'V2_FULL_CAPACITY_INDEX':'V3_FULL_CAPACITY_INDEX',f,true);
});
test("full index upgrades one known intent without allocating another witness slot",OPTIONS,async t=>{
  const f=fixture(t,3,1);f.records.set('constructor',original('constructor'));
  observe(f,'constructor');observe(f,'constructor');
  f.intents.set('constructor',intent(f,f.records.get('constructor')));
  const text=SERIALIZE_INTENT(f.intents.get('constructor'));
  observe(f,'constructor');observe(f,'constructor');
  a.equal(SERIALIZE(f.owner.readOriginal(key('constructor'))),SERIALIZE(f.records.get('constructor')));
  f.intents.delete('constructor');
  throws(()=>f.owner.readOriginalRecoveryState(key('constructor')),'CUSTODY_OUTCOME_UNKNOWN');
  f.intents.set('constructor',intent(f,f.records.get('constructor')));observe(f,'constructor',true);
  a.equal(SERIALIZE_INTENT(f.intents.get('constructor')),text);a.equal(f.known.size,1);
  a.equal(f.stateReads,5);await held(f);diagnostic(t,'FULL_INDEX_SAME_KEY_INTENT_UPGRADE',f,true);
});
test("indexed original checksum changes remain sticky after restored data",OPTIONS,async t=>{
  const f=fixture(t,3,2);
  for(const id of ['constructor','toString']){const r=original(id);f.records.set(id,r);f.intents.set(id,intent(f,r));observe(f,id);}
  const oldOriginal=f.records.get('toString'),oldIntent=f.intents.get('toString');
  const changed=original('toString',2);a.notEqual(SERIALIZE(changed),SERIALIZE(oldOriginal));
  f.records.set('toString',changed);f.intents.set('toString',intent(f,changed));
  throws(()=>f.owner.readOriginalRecoveryState(key('toString')),'CUSTODY_OUTCOME_UNKNOWN');
  f.records.set('toString',oldOriginal);f.intents.set('toString',oldIntent);observe(f,'toString',true);
  a.equal(f.known.size,2);a.equal(f.stateReads,3);await held(f);
  diagnostic(t,'INDEXED_CHECKSUM_CHANGE_STICKY',f,true);
});
test("prototype-named request ids and foreign grants preserve the normal V3 lifecycle",OPTIONS,async t=>{
  const f=fixture(t,3,2),before={...f.calls};
  throws(()=>f.owner.readOriginalRecoveryState({grantId:'foreign-grant',requestId:'constructor'}),'FOREIGN_GRANT');
  a.deepEqual(f.calls,before);a.equal(f.owner.snapshot().uncertainty.custody,false);
  for(const id of ['constructor','toString']){
    a.equal(await f.owner.submitOriginal(input(id),r=>{f.calls.send++;frozen(r);
      a.equal(SERIALIZE(r),SERIALIZE(f.records.get(id)));}),undefined);
  }
  for(let n=0;n<2;n++)for(const id of ['constructor','toString'])observe(f,id);
  const snap=f.owner.snapshot();a.equal(snap.trackedRequests,2);a.equal(f.stateReads,4);
  for(const field of ['retainCalls','readbackConfirmations','dispatchCalls','callbackCompletions','intentWrites',
    'intentReadbackConfirmations'])a.equal(snap.counts[field],2);
  a.equal(f.owner.readOriginalRecoveryState(key('never-observed')),null);
  await finish(f,false);diagnostic(t,'SCOPED_PROTOTYPE_NAMES_NORMAL_SUBMISSIONS',f,false);
});
