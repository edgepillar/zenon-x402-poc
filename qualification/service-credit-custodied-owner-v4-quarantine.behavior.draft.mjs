// Five selected opt-in V4 owner/native-store cases on TWO new private synthetic files.
// No default/HTTP wiring, SDK, network, signatures, wallet, real payment or actual process restart.
// Fault injection changes a forwarding projection or throws AFTER native COMMIT; raw rows remain intact.
// Independent SQL observation occurs only after all production owners and stores are closed.
import test,{after} from 'node:test';
import a from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,openSync,closeSync,fstatSync,readSync,constants} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const ENTRY="qualification/service-credit-custodied-owner-v4-quarantine.behavior.draft.mjs",SELF=fileURLToPath(import.meta.url),REPO=resolve(dirname(SELF),'..');
const SPECS=[
  [
    "src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js",
    64917,
    1687,
    "db4d3aca8c039e3433e49f6bafe42cbc4973e0f9478500dbe6cf36f53773232d"
  ],
  [
    "src/service-credit-custodied-request-owner.js",
    44517,
    1136,
    "4f3f20195a0ec26be38e9b80e658dfccfd9477daff758a9717e819f3b55c04b2"
  ],
  [
    "src/service-credit-original-request-custody-contract.js",
    14051,
    356,
    "fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915"
  ],
  [
    "src/x402-wire.js",
    39886,
    934,
    "5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"
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
a.equal(process.env.P2_OWNER_QUARANTINE_V4_OPT_IN,'synthetic-native-owner-quarantine-v4-only');
const PINS=JSON.parse(process.env.P2_OWNER_QUARANTINE_V4_PINS),scratch=process.env.SPV_TASK_SCRATCH;
a.equal(typeof scratch,'string');a.equal(resolve(scratch),scratch);
const scratchStat=lstatSync(scratch,{bigint:true});a.ok(scratchStat.isDirectory()&&!scratchStat.isSymbolicLink());
a.equal(scratchStat.uid,BigInt(process.getuid()));a.equal(scratchStat.mode&0o777n,0o700n);
const NAMES=['owner-a.sqlite','owner-b.sqlite'];
for(const name of NAMES)a.throws(()=>lstatSync(join(scratch,name)),{code:'ENOENT'});
const ids=s=>['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k=>String(s[k]));
const sha=b=>createHash('sha256').update(b).digest('hex');
function sources() {
  a.equal(PINS.length,6); a.deepEqual(PINS.map(p=>p.path),[...SPECS.map(s=>s[0]),ENTRY]);
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
    total+=used; a.ok(total<=196608); a.equal(used,p.bytes); a.equal(sha(bytes),p.sha256);
    a.equal(bytes.filter(n=>n===10).length,p.LF);
    if(index<SPECS.length) a.deepEqual([p.path,p.bytes,p.LF,p.sha256],SPECS[index]);
    return {path:p.path,bytes:p.bytes,sha256:p.sha256,identity:p.identity};
  });
}
const sourceBefore=sources();

const {createZenonFundingPayerRecoveryCustodyQuarantineSqliteStoreV4:CREATE4,
 openZenonFundingPayerRecoveryCustodyQuarantineSqliteStoreV4:OPEN4}
 =await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const {createServiceCreditCustodiedRequestOwnerV3:OWNER3,createServiceCreditCustodiedRequestOwnerV4:OWNER4}
 =await import('../src/service-credit-custodied-request-owner.js');
const {serializeOriginalServiceRequestCustody:ORIGINAL,serializeOriginalServiceDispatchIntent:INTENT}
 =await import('../src/service-credit-original-request-custody-contract.js');
const {DatabaseSync}=await import('node:sqlite');
const FUNDING='https://owner-quarantine.invalid/funding',SERVICE='https://owner-quarantine.invalid/service-credit/v1/execute';
const POLICY=Object.freeze({policyVersion:1,maxRequests:4,serviceResourceUrl:SERVICE}),HASH='a'.repeat(64);
const OWNER_CODE='SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_',OPTIONS={concurrency:false,timeout:5000};
const f={store:null,owners:[],closedStores:0,callbacks:0,blocked:0,stage:0,events:[],
 identity:new Map(),fundingText:null,originals:new Map(),intents:new Map(),stampA:null,stampB:null,closedB:null};
const key=(grantId,requestId)=>({grantId,requestId});
function input(grantId,id){return {grantId,requestId:id,originalRequestJson:JSON.stringify({modelVersion:1,
 grantId,requestId:id,method:'POST',routeId:'service-credit.execute.v1',canonicalBodyDigest:'sha256:'+sha(Buffer.alloc(0)),
 selectedContentType:'application/json',maxCostUnits:1}),originalBodyBase64:'',serviceResourceUrl:SERVICE};}
function pair(){const requirement={scheme:'exact',network:'zenon:testnet',asset:'synthetic-asset',amount:'1',
 payTo:'synthetic-payee',maxTimeoutSeconds:30,extra:{poc:true,settlement:'account-block',paymentFlow:'upfront',
 minimumMomentumConfirmations:2,zenonChain:{version:1,chainIdentifier:'42',genesisMomentumHash:'1'.repeat(64)}}};
 const required={x402Version:2,resource:{url:FUNDING},accepts:[requirement]};
 const payload={x402Version:2,resource:{url:FUNDING},accepted:requirement,
 payload:{transaction:{hash:HASH},intentDigest:'2'.repeat(64)}};
 return {challenge:{status:'PAYMENT_REQUIRED',resourceUrl:FUNDING,paymentRequired:required,
 paymentRequiredHeader:Buffer.from(JSON.stringify(required)).toString('base64')},
 paymentSignatureHeader:Buffer.from(JSON.stringify(payload)).toString('base64')};}
function config(name,extra={}){return {databasePath:join(scratch,name),allowedRoot:scratch,
 resourceUrl:FUNDING,custodyPolicy:POLICY,...extra};}
function bound(){f.store.prepare(pair());f.store.fenceAttempt('PREPARED');f.store.finishAttempt('BOUND');
 a.equal(f.store.load().revision,3);a.equal(f.store.load().status,'BOUND');
 const text=JSON.stringify(f.store.load());if(f.fundingText===null)f.fundingText=text;else a.equal(text,f.fundingText);}
function nativeFile(name){const st=lstatSync(join(scratch,name),{bigint:true});
 a.ok(st.isFile()&&!st.isSymbolicLink());a.equal(st.uid,BigInt(process.getuid()));a.equal(st.dev,scratchStat.dev);
 a.equal(st.nlink,1n);a.equal(st.mode&0o777n,0o600n);
 const i=ids(st).slice(0,6);if(f.identity.has(name))a.deepEqual(i,f.identity.get(name));else f.identity.set(name,i);}
function frozen(v){if(v!==null&&typeof v==='object'){a.equal(Object.isFrozen(v),true);for(const x of Object.values(v))frozen(x);}}
function owner(grantId,store=f.store,factory=OWNER4){const o=factory({store,fundingResourceUrl:FUNDING,
 custodyPolicy:POLICY,selectedGrantId:grantId});f.owners.push(o);return o;}
async function closeOwner(o,unknown=false){const p=o.close();a.equal(p,o.close());
 if(unknown)await a.rejects(p,{code:OWNER_CODE+'CLOSE_FAILED'});else a.equal(await p,undefined);
 a.equal(p,o.close());a.equal(o.snapshot().closeOutcome,unknown?'UNKNOWN':'DRAINED');}
function closeStore(){a.notEqual(f.store,null);f.store.close();f.store=null;f.closedStores++;}
function checkQ(o,status,written,confirmed){const s=o.snapshot();frozen(s.custodyQuarantine);
 a.equal(s.custodyQuarantine.status,status);a.equal(s.custodyQuarantine.writeAttempted,written);
 a.equal(s.custodyQuarantine.evidence,'TRUSTED_STORE_QUARANTINE_INTERFACE');
 a.equal(s.custodyQuarantine.qualification,'UNQUALIFIED');a.equal(s.custodyQuarantine.authority,'NONE');
 for(const k of ['mayStartPayment','maySignPayment','mayDispatchService'])a.equal(s.custodyQuarantine[k],false);
 a.equal(s.counts.quarantineWrites,written?1:0);a.equal(s.counts.quarantineReadbackConfirmations,confirmed);}
function remember(grantId,id){f.originals.set(grantId,ORIGINAL(f.store.getOriginalRequest(key(grantId,id))));
 f.intents.set(grantId,INTENT(f.store.getOriginalDispatchIntent(key(grantId,id))));}
function exactRecovery(o,grantId,id,custody){const r=o.readOriginalRecoveryState(key(grantId,id));frozen(r);
 a.equal(ORIGINAL(r.original),f.originals.get(grantId));a.equal(INTENT(r.dispatchIntent),f.intents.get(grantId));
 a.equal(r.dispatchStatus,'POSSIBLY_ATTEMPTED');a.equal(r.uncertainty.custody,custody);
 a.equal(r.authority,'NONE');a.equal(r.serviceOutcome,'NOT_ESTABLISHED');return r;}
async function blocked(o,grantId,id,submission=false){const before=o.snapshot().counts;
 await a.rejects(o.submitOriginal(input(grantId,id),()=>{f.callbacks++;}),
 {code:OWNER_CODE+(submission?'SUBMISSION_OUTCOME_UNKNOWN':'CUSTODY_OUTCOME_UNKNOWN')});f.blocked++;
 a.deepEqual(o.snapshot().counts,before);}
function stamp(name){a.equal(f.store,null);a.ok(f.owners.every(o=>o.snapshot().closed));nativeFile(name);
 const db=new DatabaseSync(join(scratch,name),{readOnly:true,allowExtension:false,
 enableDoubleQuotedStringLiterals:false,enableForeignKeyConstraints:true,timeout:0});
 try{return {epoch:db.prepare('SELECT owner_epoch FROM payer_recovery_meta WHERE singleton=1').get().owner_epoch,
 meta:db.prepare('SELECT singleton,resource_url FROM payer_recovery_meta ORDER BY singleton').all(),
 state:db.prepare('SELECT * FROM payer_recovery_state ORDER BY singleton').all(),
 originals:db.prepare('SELECT * FROM original_service_requests ORDER BY grant_id,request_id').all(),
 intents:db.prepare('SELECT * FROM original_dispatch_intents ORDER BY grant_id,request_id').all(),
 quarantines:db.prepare('SELECT * FROM original_custody_quarantines ORDER BY grant_id').all(),
 policy:db.prepare('SELECT * FROM original_request_custody_policy').all(),
 schema:db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all(),
 userVersion:db.prepare('PRAGMA user_version').get().user_version,
 applicationId:db.prepare('PRAGMA application_id').get().application_id};}finally{db.close();}}
function sameRows(before,after){for(const k of ['meta','state','originals','intents','quarantines','policy','schema',
 'userVersion','applicationId'])a.deepEqual(after[k],before[k]);}
function diagnostic(t,scenario){t.diagnostic(JSON.stringify({kind:'P2_OWNER_QUARANTINE_V4',version:1,scenario,
 nativeSqliteFiles:f.identity.size,closedReturnedStores:f.closedStores,declaredServiceCallbacks:f.callbacks,
 blockedFreshSubmits:f.blocked,automaticQuarantineWriteAttempts:f.owners.reduce((n,o)=>n+(o.snapshot().counts.quarantineWrites??0),0),
 confirmedQuarantineReadbacks:f.owners.reduce((n,o)=>n+(o.snapshot().counts.quarantineReadbackConfirmations??0),0),
 networkCalls:0,syntheticSignatureOperations:0,realPaymentSigner:'DISABLED',serviceDelivery:'NOT_ESTABLISHED'}));}
after(async()=>{try{for(const o of f.owners){const u=o.snapshot().uncertainty;
 await closeOwner(o,u.custody||u.submission||u.undrained);}}finally{if(f.store!==null)closeStore();}
 a.deepEqual(sources(),sourceBefore);a.equal(f.stage,5);});

test("V4 automatically commits callback uncertainty before reporting rejection",OPTIONS,async t=>{
 a.equal(f.stage,0);f.store=CREATE4(config('owner-a.sqlite',{testHooks:{afterCommit(name){
 if(name==='latchOriginalRequestCustodyQuarantine')f.events.push('quarantine-commit');}}}));
 nativeFile('owner-a.sqlite');bound();const oa=owner('grant-a');
 checkQ(oa,'NOT_RECORDED',false,0);a.equal(oa.snapshot().counts.quarantineReads,1);
 await a.rejects(oa.submitOriginal(input('grant-a','original-a'),()=>{f.callbacks++;f.events.push('callback-rejected');
 return Promise.reject(Error('SYNTHETIC_CALLBACK_FAILURE'));}),{code:OWNER_CODE+'SUBMISSION_OUTCOME_UNKNOWN'});
 f.events.push('rejection-observed');a.deepEqual(f.events,['callback-rejected','quarantine-commit','rejection-observed']);
 checkQ(oa,'PERSISTED_UNKNOWN',true,1);a.equal(oa.snapshot().uncertainty.submission,true);
 a.equal(oa.snapshot().uncertainty.custody,false);a.equal(oa.snapshot().uncertainty.undrained,false);
 const q=f.store.getOriginalRequestCustodyQuarantine({grantId:'grant-a'});frozen(q);a.equal(q.grantId,'grant-a');
 a.equal(q.status,'CUSTODY_OUTCOME_UNKNOWN');a.equal(q.paymentHash,HASH);a.deepEqual(q.custodyPolicy,POLICY);
 remember('grant-a','original-a');await closeOwner(oa,true);
 a.equal(JSON.stringify(f.store.load()),f.fundingText); // borrowed store remains open
 const ob=owner('grant-b');a.equal(await ob.submitOriginal(input('grant-b','original-b'),()=>{f.callbacks++;}),undefined);
 checkQ(ob,'NOT_RECORDED',false,0);remember('grant-b','original-b');await closeOwner(ob);
 a.equal(f.store.getOriginalRequestCustodyQuarantine({grantId:'grant-b'}),null);
 const legacy=owner('legacy-grant',f.store,OWNER3);a.equal(Object.hasOwn(legacy.snapshot(),'custodyQuarantine'),false);
 a.deepEqual(Object.keys(legacy.snapshot().counts),['loadReads','recordReads','retainCalls','readbackConfirmations',
 'dispatchCalls','callbackCompletions','intentWrites','intentReads','intentReadbackConfirmations']);
 await closeOwner(legacy);a.equal(f.callbacks,2);f.stage=1;diagnostic(t,'AUTO_SUBMISSION_UNKNOWN_BEFORE_REJECTION');
});
test("V4 automatically quarantines observed original loss without deleting native rows",OPTIONS,async t=>{
 a.equal(f.stage,1);const native=f.store;let missing=false;
 const projection={};
 for(const name of ['load','retainOriginalRequest','fenceOriginalDispatchIntent','getOriginalDispatchIntent',
 'listOriginalRequestKeys','getOriginalRequestCustodyQuarantine','latchOriginalRequestCustodyQuarantine']){
 projection[name]=(...args)=>native[name](...args);}
 projection.getOriginalRequest=(k)=>{const r=native.getOriginalRequest(k);
 return missing&&k.grantId==='grant-c'&&k.requestId==='original-c'?null:r;};
 const oc=owner('grant-c',projection);
 a.equal(await oc.submitOriginal(input('grant-c','original-c'),()=>{f.callbacks++;}),undefined);
 remember('grant-c','original-c');missing=true;const before=f.events.length;
 a.throws(()=>oc.readOriginalRecoveryState(key('grant-c','original-c')),{code:OWNER_CODE+'CUSTODY_OUTCOME_UNKNOWN'});
 f.events.push('custody-error-observed');a.deepEqual(f.events.slice(before),['quarantine-commit','custody-error-observed']);
 checkQ(oc,'PERSISTED_UNKNOWN',true,1);a.equal(oc.snapshot().uncertainty.custody,true);
 a.equal(oc.snapshot().uncertainty.submission,false);missing=false;exactRecovery(oc,'grant-c','original-c',true);
 await blocked(oc,'grant-c','blocked-c');a.equal(f.store.getOriginalRequest(key('grant-c','blocked-c')),null);
 checkQ(oc,'PERSISTED_UNKNOWN',true,1);await closeOwner(oc,true);closeStore();f.stampA=stamp('owner-a.sqlite');
 a.equal(f.stampA.epoch,1);a.equal(f.stampA.userVersion,4);a.equal(f.stampA.applicationId,0x5a505252);
 a.equal(f.stampA.originals.length,3);a.equal(f.stampA.intents.length,3);
 a.deepEqual(f.stampA.quarantines.map(r=>r.grant_id),['grant-a','grant-c']);
 for(const r of f.stampA.originals)a.equal(r.envelope,f.originals.get(r.grant_id));
 for(const r of f.stampA.intents)a.equal(r.envelope,f.intents.get(r.grant_id));
 f.stage=2;diagnostic(t,'AUTO_CUSTODY_UNKNOWN_EXACT_ROWS_RETAINED');
});
test("fresh V4 owners restore persisted quarantine after a normal reopen",OPTIONS,async t=>{
 a.equal(f.stage,2);f.store=OPEN4(config('owner-a.sqlite'));a.equal(JSON.stringify(f.store.load()),f.fundingText);
 for(const grantId of ['grant-a','grant-c']){const o=owner(grantId);checkQ(o,'PERSISTED_UNKNOWN',false,0);
 a.equal(o.snapshot().uncertainty.custody,true);a.equal(o.snapshot().uncertainty.submission,false);
 a.equal(o.snapshot().counts.quarantineReads,1);await blocked(o,grantId,'new-after-reopen');
 exactRecovery(o,grantId,'original-'+grantId.slice(-1),true);checkQ(o,'PERSISTED_UNKNOWN',false,0);await closeOwner(o,true);}
 const ob=owner('grant-b');checkQ(ob,'NOT_RECORDED',false,0);exactRecovery(ob,'grant-b','original-b',false);
 await closeOwner(ob);closeStore();const next=stamp('owner-a.sqlite');a.equal(next.epoch,2);sameRows(f.stampA,next);
 f.stampA=next;f.stage=3;diagnostic(t,'NORMAL_REOPEN_RESTORES_QUARANTINE_NOT_HISTORICAL_CAUSE');
});
test("post-commit quarantine failure stays UNKNOWN without a second automatic write",OPTIONS,async t=>{
 a.equal(f.stage,3);let afterCommitCalls=0;
 f.store=CREATE4(config('owner-b.sqlite',{testHooks:{afterCommit(name){
 if(name==='latchOriginalRequestCustodyQuarantine'){afterCommitCalls++;f.events.push('unknown-quarantine-commit');
 throw Error('SYNTHETIC_POST_COMMIT_FAILURE');}}}}));nativeFile('owner-b.sqlite');bound();
 const old=owner('grant-d'),before=f.events.length;
 await a.rejects(old.submitOriginal(input('grant-d','original-d'),()=>{f.callbacks++;f.events.push('callback-d-rejected');
 return Promise.reject(Error('SYNTHETIC_CALLBACK_FAILURE'));}),{code:OWNER_CODE+'SUBMISSION_OUTCOME_UNKNOWN'});
 f.events.push('unknown-rejection-observed');
 a.deepEqual(f.events.slice(before),['callback-d-rejected','unknown-quarantine-commit','unknown-rejection-observed']);
 checkQ(old,'PERSISTENCE_UNKNOWN',true,0);a.equal(old.snapshot().uncertainty.submission,true);
 a.equal(old.snapshot().uncertainty.custody,false);a.equal(afterCommitCalls,1);
 await blocked(old,'grant-d','blocked-d',true);await closeOwner(old,true);a.equal(afterCommitCalls,1);
 f.closedB=f.store;closeStore();f.stampB=stamp('owner-b.sqlite');
 a.equal(f.stampB.epoch,1);a.equal(f.stampB.originals.length,1);a.equal(f.stampB.intents.length,1);
 a.equal(f.stampB.quarantines.length,1);a.equal(f.stampB.quarantines[0].grant_id,'grant-d');
 a.equal(JSON.parse(f.stampB.quarantines[0].envelope).status,'CUSTODY_OUTCOME_UNKNOWN');
 f.originals.set('grant-d',f.stampB.originals[0].envelope);f.intents.set('grant-d',f.stampB.intents[0].envelope);
 f.store=OPEN4(config('owner-b.sqlite'));const fresh=owner('grant-d');
 checkQ(fresh,'PERSISTED_UNKNOWN',false,0);await blocked(fresh,'grant-d','blocked-fresh-d');
 exactRecovery(fresh,'grant-d','original-d',true);checkQ(old,'PERSISTENCE_UNKNOWN',true,0);
 a.equal(JSON.stringify(f.store.load()),f.fundingText);await closeOwner(fresh,true);closeStore();
 const next=stamp('owner-b.sqlite');a.equal(next.epoch,2);sameRows(f.stampB,next);f.stampB=next;
 a.equal(afterCommitCalls,1);f.stage=4;diagnostic(t,'POST_COMMIT_UNKNOWN_NO_AUTOMATIC_RETRY');
});
test("unavailable initial quarantine read holds a V4 owner without writing",OPTIONS,async t=>{
 a.equal(f.stage,4);a.equal(f.store,null);const o=owner('grant-d',f.closedB);
 checkQ(o,'PERSISTENCE_UNKNOWN',false,0);a.equal(o.snapshot().uncertainty.custody,true);
 a.equal(o.snapshot().counts.quarantineReads,1);a.equal(o.snapshot().counts.loadReads,0);
 await blocked(o,'grant-d','never-retained');await closeOwner(o,true);
 checkQ(o,'PERSISTENCE_UNKNOWN',false,0);a.equal(o.snapshot().counts.quarantineReads,1);
 const next=stamp('owner-b.sqlite');a.deepEqual(next,f.stampB);a.equal(f.closedStores,4);
 a.equal(f.callbacks,4);a.equal(f.blocked,6);f.stage=5;diagnostic(t,'INITIAL_READ_UNKNOWN_ZERO_WRITES');
});

