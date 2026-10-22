// Selected current-owner / actual V3 SQLite integration over ONE new private file.
// A declared forwarding projection hides one already committed intent; the DB row
// is never deleted or corrupted. Same-process normal reopen is not process restart.
// No SDK, network, wallet, real payment, capability proof or signing operation.
import test, { after } from 'node:test';
import a from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ENTRY="qualification/service-credit-custodied-owner-known-records-native.behavior.draft.mjs";
const SELF=fileURLToPath(import.meta.url), REPO=resolve(dirname(SELF),'..');
const SPECS=[
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
    "src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js",
    57471,
    1536,
    "974f5e28f851b8504efb71cb800e71881f8d37965bad927be2d18c5f7324b224"
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
a.equal(process.argv.length,2); a.equal(process.argv[1],SELF);
a.equal(process.versions.node,'24.19.0'); a.equal(process.platform,'darwin'); a.equal(process.arch,'arm64');
a.equal(process.env.P2_NATIVE_KNOWN_OPT_IN,'synthetic-native-known-records-only');
const PINS=JSON.parse(process.env.P2_NATIVE_KNOWN_PINS), scratch=process.env.SPV_TASK_SCRATCH;
a.equal(typeof scratch,'string'); a.equal(resolve(scratch),scratch);
const scratchStat=lstatSync(scratch,{bigint:true});
a.ok(scratchStat.isDirectory()&&!scratchStat.isSymbolicLink());
a.equal(scratchStat.uid,BigInt(process.getuid())); a.equal(scratchStat.mode&0o777n,0o700n);
const DB=join(scratch,'payer.sqlite');
a.throws(()=>lstatSync(DB),{code:'ENOENT'});
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
const { createServiceCreditCustodiedRequestOwnerV3: OWNER }
  =await import('../src/service-credit-custodied-request-owner.js');
const { createZenonFundingPayerRecoveryDispatchIntentSqliteStoreV3: CREATE,
  openZenonFundingPayerRecoveryDispatchIntentSqliteStoreV3: OPEN }
  =await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const { serializeOriginalServiceRequestCustody: ORIGINAL, serializeOriginalServiceDispatchIntent: INTENT }
  =await import('../src/service-credit-original-request-custody-contract.js');
const { DatabaseSync }=await import('node:sqlite');
const FUNDING='https://native-known.invalid/funding', SERVICE='https://native-known.invalid/service-credit/v1/execute';
const GRANT='synthetic-native-known-grant', HASH='a'.repeat(64), PREFIX='SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const POLICY=Object.freeze({policyVersion:1,maxRequests:2,serviceResourceUrl:SERVICE});
const CONFIG=Object.freeze({databasePath:DB,allowedRoot:scratch,resourceUrl:FUNDING,custodyPolicy:POLICY});
const OPTIONS={concurrency:false,timeout:5000};
const f={native:null,owner:null,owners:[],hideIntent:false,dispatches:0,nativeCloses:0,borrowedCloseCalls:0,
  originalTexts:[],intentTexts:[],fundingText:null,fileIdentity:null,stamp:null,stage:0,
  calls:{load:0,get:0,retain:0,fence:0,intent:0}};
function frozen(v) {
  if(v!==null&&typeof v==='object'){a.equal(Object.isFrozen(v),true); for(const value of Object.values(v)) frozen(value);}
}
function key(id){return {grantId:GRANT,requestId:id};}
function input(id){
  return {grantId:GRANT,requestId:id,originalRequestJson:JSON.stringify({modelVersion:1,grantId:GRANT,
    requestId:id,method:'POST',routeId:'service-credit.execute.v1',canonicalBodyDigest:'sha256:'+sha(Buffer.alloc(0)),
    selectedContentType:'application/json',maxCostUnits:1}),originalBodyBase64:'',serviceResourceUrl:SERVICE};
}
function fundingPair(){
  const requirement={scheme:'exact',network:'zenon:testnet',asset:'synthetic-asset',amount:'1',payTo:'synthetic-payee',
    maxTimeoutSeconds:30,extra:{poc:true,settlement:'account-block',paymentFlow:'upfront',minimumMomentumConfirmations:2,
      zenonChain:{version:1,chainIdentifier:'42',genesisMomentumHash:'1'.repeat(64)}}};
  const required={x402Version:2,resource:{url:FUNDING},accepts:[requirement]};
  const payload={x402Version:2,resource:{url:FUNDING},accepted:requirement,
    payload:{transaction:{hash:HASH},intentDigest:'2'.repeat(64)}};
  return {challenge:{status:'PAYMENT_REQUIRED',resourceUrl:FUNDING,paymentRequired:required,
    paymentRequiredHeader:Buffer.from(JSON.stringify(required)).toString('base64')},
    paymentSignatureHeader:Buffer.from(JSON.stringify(payload)).toString('base64')};
}
function errorIs(error,suffix){a.equal(error.code,PREFIX+suffix);a.equal(error.message,error.code);return true;}
function nativeFile(){
  const st=lstatSync(DB,{bigint:true});
  a.ok(st.isFile()&&!st.isSymbolicLink());a.equal(st.uid,BigInt(process.getuid()));
  a.equal(st.dev,scratchStat.dev);a.equal(st.nlink,1n);a.equal(st.mode&0o777n,0o600n);
  if(f.fileIdentity===null) f.fileIdentity=ids(st).slice(0,6);
  else a.deepEqual(ids(st).slice(0,6),f.fileIdentity);
}
function createOwner(store){
  const owner=OWNER({store,fundingResourceUrl:FUNDING,custodyPolicy:POLICY,selectedGrantId:GRANT});
  f.owners.push(owner);f.owner=owner;frozen(owner);return owner;
}
function forwardingStore(){
  const native=f.native;
  return Object.freeze({
    load(){f.calls.load++;return native.load();},
    getOriginalRequest(k){f.calls.get++;return native.getOriginalRequest(k);},
    retainOriginalRequest(v){f.calls.retain++;return native.retainOriginalRequest(v);},
    fenceOriginalDispatchIntent(k){f.calls.fence++;return native.fenceOriginalDispatchIntent(k);},
    getOriginalDispatchIntent(k){
      f.calls.intent++;const actual=native.getOriginalDispatchIntent(k);
      // Only this declared projection lies; it still reads the committed native row.
      if(f.hideIntent&&k.requestId==='a'){a.notEqual(actual,null);return null;}return actual;
    },
    close(){f.borrowedCloseCalls++;throw Error('BORROWED_NATIVE_CLOSE_FORBIDDEN');},
  });
}
function recovery(owner,id,unknown){
  const state=owner.readOriginalRecoveryState(key(id));frozen(state);
  a.equal(state.dispatchStatus,'POSSIBLY_ATTEMPTED');a.notEqual(state.dispatchIntent,null);
  a.equal(state.uncertainty.custody,unknown);a.equal(state.uncertainty.submission,false);
  a.equal(state.uncertainty.undrained,false);a.equal(state.authority,'NONE');
  a.equal(state.qualification,'UNQUALIFIED');a.equal(state.serviceOutcome,'NOT_ESTABLISHED');
  a.equal(state.funding.paymentHash,HASH);a.equal(state.funding.revision,3);a.equal(state.funding.status,'BOUND');
  const n=id==='a'?0:1;a.equal(ORIGINAL(state.original),f.originalTexts[n]);
  a.equal(INTENT(state.dispatchIntent),f.intentTexts[n]);
  a.equal(ORIGINAL(owner.readOriginal(key(id))),f.originalTexts[n]);return state;
}
async function closeOwner(owner,unknown){
  const closing=owner.close();a.equal(closing,owner.close());
  if(unknown) await a.rejects(closing,e=>errorIs(e,'CLOSE_FAILED'));else a.equal(await closing,undefined);
  a.equal(closing,owner.close());a.equal(owner.snapshot().closed,true);
  a.equal(owner.snapshot().closeOutcome,unknown?'UNKNOWN':'DRAINED');a.equal(f.borrowedCloseCalls,0);
}
function closeNative(){a.notEqual(f.native,null);f.native.close();f.native=null;f.nativeCloses++;}
function sqlStamp(){
  // Never hold an independent SQL observer while the production store is open.
  a.equal(f.native,null);a.ok(f.owners.every(o=>o.snapshot().closed));nativeFile();
  const db=new DatabaseSync(DB,{readOnly:true,allowExtension:false,enableDoubleQuotedStringLiterals:false,
    enableForeignKeyConstraints:true,timeout:0});
  try {
    return {epoch:db.prepare('SELECT owner_epoch FROM payer_recovery_meta WHERE singleton=1').get().owner_epoch,
      meta:db.prepare('SELECT singleton,resource_url FROM payer_recovery_meta ORDER BY singleton').all(),
      state:db.prepare('SELECT * FROM payer_recovery_state ORDER BY singleton').all(),
      originals:db.prepare('SELECT * FROM original_service_requests ORDER BY grant_id,request_id').all(),
      intents:db.prepare('SELECT * FROM original_dispatch_intents ORDER BY grant_id,request_id').all(),
      policy:db.prepare('SELECT * FROM original_request_custody_policy ORDER BY singleton').all(),
      schema:db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all(),
      userVersion:db.prepare('PRAGMA user_version').get().user_version,
      applicationId:db.prepare('PRAGMA application_id').get().application_id};
  } finally {db.close();}
}
function diagnostic(t,scenario,unknown){
  const snap=f.owner.snapshot();a.equal(snap.recoveryAuthority,'NONE');a.equal(snap.durability,'NOT_ESTABLISHED');
  a.equal(snap.serviceOutcome,'NOT_ESTABLISHED');nativeFile();a.equal(f.borrowedCloseCalls,0);
  t.diagnostic(JSON.stringify({kind:'P2_NATIVE_KNOWN_CUSTODY',version:1,scenario,nativeSqliteFiles:1,
    originalRows:2,intentRows:2,declaredServiceCallbacks:f.dispatches,nativeCloseReturns:f.nativeCloses,
    borrowedStoreCloseCalls:0,custodyUnknown:unknown,networkCalls:0,syntheticSignatureOperations:0,
    realPaymentSigner:'DISABLED',serviceDelivery:'NOT_ESTABLISHED'}));
}
after(async()=>{
  try {
    for(const owner of f.owners) await closeOwner(owner,owner.snapshot().uncertainty.custody);
  } finally {if(f.native!==null) closeNative();}
  a.deepEqual(sources(),sourceBefore);a.equal(f.borrowedCloseCalls,0);a.equal(f.stage,3);
});

test('current owner commits two originals and intents through actual V3 SQLite',OPTIONS,async t=>{
  a.equal(f.stage,0);f.native=CREATE(CONFIG);nativeFile();a.equal(f.native.load(),null);
  const prepared=f.native.prepare(fundingPair());a.equal(prepared.status,'PREPARED');
  f.native.fenceAttempt('PREPARED');f.native.finishAttempt('BOUND');
  f.fundingText=JSON.stringify(f.native.load());a.equal(f.native.load().revision,3);
  const owner=createOwner(forwardingStore());
  for(const id of ['a','b']){
    a.equal(await owner.submitOriginal(input(id),record=>{
      f.dispatches++;frozen(record);a.equal(record.originalRequestJson,input(id).originalRequestJson);
      a.equal(record.originalBodyBase64,'');a.equal(record.paymentHash,HASH);
      a.equal(ORIGINAL(record),ORIGINAL(f.native.getOriginalRequest(key(id))));
    }),undefined);
    f.originalTexts.push(ORIGINAL(f.native.getOriginalRequest(key(id))));
    f.intentTexts.push(INTENT(f.native.getOriginalDispatchIntent(key(id))));
  }
  a.equal(f.dispatches,2);a.equal(f.calls.retain,2);a.equal(f.calls.fence,2);
  for(let n=0;n<2;n++) for(const id of ['a','b']) recovery(owner,id,false);
  a.equal(JSON.stringify(f.native.load()),f.fundingText);
  a.equal(owner.snapshot().trackedRequests,2);
  for(const k of ['retainCalls','readbackConfirmations','dispatchCalls','callbackCompletions','intentWrites',
    'intentReadbackConfirmations']) a.equal(owner.snapshot().counts[k],2);
  a.equal(owner.snapshot().uncertainty.custody,false);f.stage=1;
  diagnostic(t,'ACTUAL_V3_TWO_ORIGINAL_COMMIT',false);
});
test('known intent projection loss latches unknown without mutating native rows',OPTIONS,async t=>{
  a.equal(f.stage,1);const owner=f.owner;f.hideIntent=true;
  a.throws(()=>owner.readOriginalRecoveryState(key('a')),e=>errorIs(e,'CUSTODY_OUTCOME_UNKNOWN'));
  a.equal(owner.snapshot().uncertainty.custody,true);f.hideIntent=false;
  recovery(owner,'a',true);recovery(owner,'b',true);
  const before={...f.calls};await a.rejects(owner.submitOriginal(input('c'),()=>{f.dispatches++;}),
    e=>errorIs(e,'CUSTODY_OUTCOME_UNKNOWN'));
  a.deepEqual(f.calls,before);a.equal(f.dispatches,2);a.equal(JSON.stringify(f.native.load()),f.fundingText);
  await closeOwner(owner,true);
  a.deepEqual(['a','b'].map(id=>ORIGINAL(f.native.getOriginalRequest(key(id)))),f.originalTexts);
  a.deepEqual(['a','b'].map(id=>INTENT(f.native.getOriginalDispatchIntent(key(id)))),f.intentTexts);
  closeNative();f.stamp=sqlStamp();a.equal(f.stamp.epoch,1);a.equal(f.stamp.userVersion,3);
  a.equal(f.stamp.applicationId,0x5a505252);a.equal(f.stamp.originals.length,2);a.equal(f.stamp.intents.length,2);
  a.deepEqual(f.stamp.originals.map(r=>r.envelope),f.originalTexts);
  a.deepEqual(f.stamp.intents.map(r=>r.envelope),f.intentTexts);
  a.equal(f.stamp.state.length,1);a.equal(f.stamp.state[0].status,'BOUND');a.equal(f.stamp.state[0].revision,3);
  f.stage=2;diagnostic(t,'DECLARED_PROJECTION_LOSS_NATIVE_ROWS_RETAINED',true);
});
test('normal native reopen retains exact records but does not restore volatile unknown',OPTIONS,async t=>{
  a.equal(f.stage,2);f.native=OPEN(CONFIG);nativeFile();a.equal(JSON.stringify(f.native.load()),f.fundingText);
  const old=f.owner,owner=createOwner(f.native);a.equal(old.snapshot().uncertainty.custody,true);
  a.equal(owner.snapshot().trackedRequests,0);a.equal(owner.snapshot().uncertainty.custody,false);
  for(const id of ['a','b']) recovery(owner,id,false);
  a.equal(owner.readOriginalRecoveryState(key('never-observed')),null);
  for(const k of ['retainCalls','readbackConfirmations','dispatchCalls','callbackCompletions','intentWrites',
    'intentReadbackConfirmations']) a.equal(owner.snapshot().counts[k],0);
  a.equal(f.dispatches,2);await closeOwner(owner,false);
  // Borrowed native store remains usable until its fixture owner closes it.
  a.equal(JSON.stringify(f.native.load()),f.fundingText);closeNative();
  const after=sqlStamp();a.equal(after.epoch,f.stamp.epoch+1);
  for(const k of Object.keys(f.stamp).filter(k=>k!=='epoch')) a.deepEqual(after[k],f.stamp[k]);
  a.equal(f.nativeCloses,2);a.equal(old.snapshot().closeOutcome,'UNKNOWN');
  a.equal(owner.snapshot().closeOutcome,'DRAINED');f.stage=3;
  diagnostic(t,'SAME_PROCESS_REOPEN_DATA_NOT_RESTORED_UNCERTAINTY',false);
});

