// Selected declared-store application behavior, not SQLite/restart qualification.
// No database, network, SDK, signing, payment, store close or runtime helper.
// Source guards read only the two reviewed modules, package.json and this entry.
import test, { after } from 'node:test';
import a from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ENTRY = "qualification/service-credit-custodied-owner-known-records.behavior.draft.mjs";
const SELF = fileURLToPath(import.meta.url), REPO = resolve(dirname(SELF),'..');
const SPECS = [
  [
    "src/service-credit-custodied-request-owner.js",
    37342,
    987,
    "1908c182d15028a7f9ae0f1b2dbd25e87b0753ab856d2f4949fef46a01a707cf"
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
a.equal(process.argv.length,2); a.equal(process.argv[1],SELF);
a.equal(process.versions.node,'24.19.0'); a.equal(process.platform,'darwin'); a.equal(process.arch,'arm64');
a.equal(process.env.P2_KNOWN_CUSTODY_OPT_IN,'synthetic-declared-known-records-only');
const PINS=JSON.parse(process.env.P2_KNOWN_CUSTODY_PINS);
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
const { createServiceCreditCustodiedRequestOwner: V2,
  createServiceCreditCustodiedRequestOwnerV3: V3 }=await import('../src/service-credit-custodied-request-owner.js');
const { captureOriginalServiceRequestCustody: CAPTURE, serializeOriginalServiceRequestCustody: SERIALIZE,
  captureOriginalServiceDispatchIntent: INTENT, serializeOriginalServiceDispatchIntent: SERIALIZE_INTENT }
  =await import('../src/service-credit-original-request-custody-contract.js');
const FUNDING='https://known-custody.invalid/funding', SERVICE='https://known-custody.invalid/service-credit/v1/execute';
const GRANT='synthetic-known-grant', HASH='a'.repeat(64), PREFIX='SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const POLICY=Object.freeze({policyVersion:1,maxRequests:2,serviceResourceUrl:SERVICE});
const BINDING=Object.freeze({fundingResourceUrl:FUNDING,paymentHash:HASH,network:'zenon:testnet'});
const OPTIONS={concurrency:false,timeout:5000};
function freeze(v) {
  if(v!==null&&typeof v==='object') { for(const item of Object.values(v)) freeze(item); Object.freeze(v); }
  return v;
}
function frozen(v) {
  if(v!==null&&typeof v==='object') { a.equal(Object.isFrozen(v),true); for(const item of Object.values(v)) frozen(item); }
}
function key(id) { return {grantId:GRANT,requestId:id}; }
function input(id,units=1) {
  return {grantId:GRANT,requestId:id,
    originalRequestJson:JSON.stringify({modelVersion:1,grantId:GRANT,requestId:id,method:'POST',
      routeId:'service-credit.execute.v1',canonicalBodyDigest:'sha256:'+sha(Buffer.alloc(0)),
      selectedContentType:'application/json',maxCostUnits:units}),
    originalBodyBase64:'',serviceResourceUrl:SERVICE};
}
function record(id,units=1) {
  const r=input(id,units);
  return CAPTURE({originalRequestJson:r.originalRequestJson,originalBodyBase64:r.originalBodyBase64,
    serviceResourceUrl:r.serviceResourceUrl},BINDING);
}
function intent(original,challenge='b') {
  return INTENT(original,{fundingRevision:3,challengeDigest:'sha256:'+challenge.repeat(64),
    paymentDigest:'sha256:'+'c'.repeat(64),custodyPolicy:POLICY});
}
function funding() {
  return freeze({revision:3,status:'BOUND',ambiguityLatched:false,resourceUrl:FUNDING,
    challengeHeader:'synthetic-opaque-challenge',paymentHeader:'synthetic-opaque-payment',paymentRequired:{},
    paymentPayload:{x402Version:2,resource:{},accepted:{},payload:{transaction:{hash:HASH},intentDigest:'declared'}},
    requirement:{scheme:'exact',network:'zenon:testnet',asset:'synthetic',amount:'1',payTo:'synthetic',
      maxTimeoutSeconds:30,extra:{}}});
}
function ownerError(error,suffix) {
  a.equal(Object.getPrototypeOf(error),TypeError.prototype); a.equal(error.code,PREFIX+suffix);
  a.equal(error.message,error.code); a.equal(error.stack,'TypeError: '+error.code); a.equal(Object.isFrozen(error),true);
  return true;
}
const throws=(fn,suffix)=>a.throws(fn,e=>ownerError(e,suffix));
const rejects=(promise,suffix)=>a.rejects(promise,e=>ownerError(e,suffix));
function fixture(t,version) {
  const f={version,records:new Map(),intents:new Map(),funding:funding(),calls:{load:0,get:0,retain:0,fence:0,intent:0,send:0,close:0}};
  const store={
    load(){a.equal(this,store);f.calls.load++;return f.funding;},
    getOriginalRequest(k){a.equal(this,store);f.calls.get++;return f.records.get(k.requestId)??null;},
    retainOriginalRequest(v){
      a.equal(this,store);f.calls.retain++;
      const r=CAPTURE({originalRequestJson:v.originalRequestJson,originalBodyBase64:v.originalBodyBase64,
        serviceResourceUrl:v.serviceResourceUrl},BINDING);
      a.equal(r.grantId,v.grantId);a.equal(r.requestId,v.requestId);a.equal(f.records.has(r.requestId),false);
      f.records.set(r.requestId,r);return r;
    },
    close(){f.calls.close++;throw Error('BORROWED_STORE_CLOSE_FORBIDDEN');},
  };
  if(version===3) Object.assign(store,{
    fenceOriginalDispatchIntent(k){
      a.equal(this,store);f.calls.fence++;a.equal(f.intents.has(k.requestId),false);
      const r=intent(f.records.get(k.requestId));f.intents.set(k.requestId,r);return r;
    },
    getOriginalDispatchIntent(k){a.equal(this,store);f.calls.intent++;return f.intents.get(k.requestId)??null;},
  });
  f.owner=(version===2?V2:V3)({store,fundingResourceUrl:FUNDING,custodyPolicy:POLICY,selectedGrantId:GRANT});
  frozen(f.owner);
  const expected=['submitOriginal','readOriginal','readOriginalRecoveryState',...(version===3?['readOriginalRecoveryKeys']:[]),'snapshot','close'];
  a.deepEqual(Object.keys(f.owner),expected);
  t.after(async()=>{await f.owner.close().then(v=>a.equal(v,undefined),e=>ownerError(e,'CLOSE_FAILED'));a.equal(f.calls.close,0);});
  return f;
}
async function submit(f,id) {
  a.equal(await f.owner.submitOriginal(input(id),r=>{
    f.calls.send++;frozen(r);a.equal(SERIALIZE(r),SERIALIZE(f.records.get(id)));
  }),undefined);
}
async function finish(f,held) {
  const p=f.owner.close();a.equal(p,f.owner.close());
  if(held) await rejects(p,'CLOSE_FAILED');else a.equal(await p,undefined);
  a.equal(p,f.owner.close());a.equal(f.owner.snapshot().closed,true);
  a.equal(f.owner.snapshot().closeOutcome,held?'UNKNOWN':'DRAINED');a.equal(f.calls.close,0);
}
async function held(f) {
  const before={...f.calls};a.equal(f.owner.snapshot().uncertainty.custody,true);
  a.equal(f.owner.snapshot().uncertainty.submission,false);a.equal(f.owner.snapshot().uncertainty.undrained,false);
  await rejects(f.owner.submitOriginal(input('never-dispatched'),()=>{f.calls.send++;}),'CUSTODY_OUTCOME_UNKNOWN');
  a.deepEqual(f.calls,before);await finish(f,true);
}
function data(state) {
  frozen(state);a.equal(state.authority,'NONE');a.equal(state.qualification,'UNQUALIFIED');
  a.equal(state.serviceOutcome,'NOT_ESTABLISHED');a.equal(state.funding.paymentHash,HASH);
}
function diagnostic(t,scenario,f,heldFlag) {
  const snap=f.owner.snapshot();a.equal(snap.recoveryAuthority,'NONE');a.equal(snap.serviceOutcome,'NOT_ESTABLISHED');
  a.equal(snap.uncertainty.custody,heldFlag);a.equal(f.calls.close,0);
  t.diagnostic(JSON.stringify({kind:'P2_KNOWN_CUSTODY',version:1,scenario,ownerVersion:f.version,
    submits:f.calls.send,retains:f.calls.retain,intentWrites:f.calls.fence,callbackCompletions:snap.counts.callbackCompletions,
    custodyUnknown:heldFlag,closeOutcome:snap.closeOutcome,storeCloseCalls:0,nativeSqliteFiles:0,
    networkCalls:0,realPaymentSigner:'DISABLED',serviceDelivery:'NOT_ESTABLISHED'}));
}
after(()=>a.deepEqual(sources(),sourceBefore));

test("V2 rejects disappearance of an original confirmed during submission",OPTIONS,async t=>{
  const f=fixture(t,2);await submit(f,'a');const saved=SERIALIZE(f.records.get('a'));
  a.equal(SERIALIZE(f.owner.readOriginal(key('a'))),saved);
  f.records.delete('a');throws(()=>f.owner.readOriginal(key('a')),'CUSTODY_OUTCOME_UNKNOWN');
  await held(f);diagnostic(t,'V2_SUBMITTED_ORIGINAL_DISAPPEARED',f,true);
});
test("V3 rejects disappearance of a confirmed dispatch intent without clearing uncertainty",OPTIONS,async t=>{
  const f=fixture(t,3);await submit(f,'a');
  const original=SERIALIZE(f.records.get('a')),oldIntent=SERIALIZE_INTENT(f.intents.get('a'));
  f.intents.delete('a');throws(()=>f.owner.readOriginalRecoveryState(key('a')),'CUSTODY_OUTCOME_UNKNOWN');
  a.equal(SERIALIZE(f.owner.readOriginal(key('a'))),original);
  f.intents.set('a',intent(f.records.get('a')));
  const restored=f.owner.readOriginalRecoveryState(key('a'));data(restored);
  a.equal(SERIALIZE_INTENT(restored.dispatchIntent),oldIntent);a.equal(restored.uncertainty.custody,true);
  await held(f);diagnostic(t,'V3_SUBMITTED_INTENT_DISAPPEARED',f,true);
});
test("V2 rejects disappearance of an original previously observed by recovery",OPTIONS,async t=>{
  const f=fixture(t,2);f.records.set('a',record('a'));data(f.owner.readOriginalRecoveryState(key('a')));
  f.records.delete('a');throws(()=>f.owner.readOriginalRecoveryState(key('a')),'CUSTODY_OUTCOME_UNKNOWN');
  await held(f);diagnostic(t,'V2_OBSERVED_ORIGINAL_DISAPPEARED',f,true);
});
test("V3 rejects a changed previously observed intent checksum",OPTIONS,async t=>{
  const f=fixture(t,3);f.records.set('a',record('a'));f.intents.set('a',intent(f.records.get('a')));
  data(f.owner.readOriginalRecoveryState(key('a')));const old=SERIALIZE_INTENT(f.intents.get('a'));
  f.intents.set('a',intent(f.records.get('a'),'d'));a.notEqual(SERIALIZE_INTENT(f.intents.get('a')),old);
  throws(()=>f.owner.readOriginalRecoveryState(key('a')),'CUSTODY_OUTCOME_UNKNOWN');
  await held(f);diagnostic(t,'V3_OBSERVED_INTENT_CHANGED',f,true);
});
test("V3 rejects a changed previously observed original checksum",OPTIONS,async t=>{
  const f=fixture(t,3);f.records.set('a',record('a'));f.intents.set('a',intent(f.records.get('a')));
  data(f.owner.readOriginalRecoveryState(key('a')));const old=SERIALIZE(f.records.get('a'));
  f.records.set('a',record('a',2));f.intents.set('a',intent(f.records.get('a')));a.notEqual(SERIALIZE(f.records.get('a')),old);
  throws(()=>f.owner.readOriginalRecoveryState(key('a')),'CUSTODY_OUTCOME_UNKNOWN');
  await held(f);diagnostic(t,'V3_OBSERVED_ORIGINAL_CHANGED',f,true);
});
test("unobserved absence and an original without observed intent stay valid data",OPTIONS,async t=>{
  const f=fixture(t,3);a.equal(f.owner.readOriginal(key('absent')),null);
  a.equal(f.owner.readOriginalRecoveryState(key('absent')),null);
  f.records.set('a',record('a'));
  for(let n=0;n<2;n++){const state=f.owner.readOriginalRecoveryState(key('a'));data(state);
    a.equal(state.dispatchIntent,null);a.equal(state.dispatchStatus,'NO_INTENT_RECORDED');}
  a.equal(f.owner.readOriginalRecoveryState(key('still-absent')),null);
  a.equal(f.owner.snapshot().uncertainty.custody,false);await finish(f,false);
  diagnostic(t,'UNOBSERVED_ABSENCE_AND_NO_INTENT',f,false);
});
test("recovery observations stay bounded by the configured custody capacity",OPTIONS,async t=>{
  const f=fixture(t,3);for(const id of ['a','b','c']) f.records.set(id,record(id));
  data(f.owner.readOriginalRecoveryState(key('a')));data(f.owner.readOriginalRecoveryState(key('b')));
  throws(()=>f.owner.readOriginalRecoveryState(key('c')),'CUSTODY_OUTCOME_UNKNOWN');
  await held(f);diagnostic(t,'OBSERVATION_CAPACITY_FENCE',f,true);
});
test("normal two-original V3 lifecycle preserves bytes counters and close behavior",OPTIONS,async t=>{
  const f=fixture(t,3);const before=JSON.stringify(f.funding);
  await submit(f,'a');await submit(f,'b');const originals=[...f.records.values()].map(r=>SERIALIZE(r));
  const intents=[...f.intents.values()].map(r=>SERIALIZE_INTENT(r));
  for(let n=0;n<2;n++) for(const id of ['a','b']){
    const state=f.owner.readOriginalRecoveryState(key(id));data(state);a.equal(state.dispatchStatus,'POSSIBLY_ATTEMPTED');
    a.equal(SERIALIZE(state.original),SERIALIZE(f.records.get(id)));a.equal(state.uncertainty.custody,false);
    a.equal(SERIALIZE(f.owner.readOriginal(key(id))),SERIALIZE(state.original));
  }
  a.deepEqual([...f.records.values()].map(r=>SERIALIZE(r)),originals);a.deepEqual([...f.intents.values()].map(r=>SERIALIZE_INTENT(r)),intents);
  a.equal(JSON.stringify(f.funding),before);
  const snap=f.owner.snapshot();a.equal(snap.trackedRequests,2);
  for(const field of ['retainCalls','readbackConfirmations','dispatchCalls','callbackCompletions','intentWrites','intentReadbackConfirmations']) a.equal(snap.counts[field],2);
  await finish(f,false);diagnostic(t,'NORMAL_TWO_ORIGINAL_LIFECYCLE',f,false);
});
