// Selected V4 quarantine store behavior over TWO new private synthetic files.
// Reuse the existing V3 owner without enabling an active client/default.
// One V4 DB and one V3 compatibility DB; never open an independent SQL observer
// while a production store is open. Normal reopen is not process restart.
// No SDK, network, wallet, capability signature, real funding or payment.
import test,{after} from 'node:test';
import a from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,openSync,closeSync,fstatSync,readSync,constants} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const ENTRY="qualification/service-credit-custody-quarantine-store-v4.behavior.draft.mjs",SELF=fileURLToPath(import.meta.url),REPO=resolve(dirname(SELF),'..');
const SPECS=[
  [
    "src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js",
    64917,
    1687,
    "db4d3aca8c039e3433e49f6bafe42cbc4973e0f9478500dbe6cf36f53773232d"
  ],
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
a.equal(process.env.P2_QUARANTINE_V4_OPT_IN,'synthetic-native-quarantine-v4-only');
const PINS=JSON.parse(process.env.P2_QUARANTINE_V4_PINS),scratch=process.env.SPV_TASK_SCRATCH;
a.equal(typeof scratch,'string');a.equal(resolve(scratch),scratch);
const scratchStat=lstatSync(scratch,{bigint:true});a.ok(scratchStat.isDirectory()&&!scratchStat.isSymbolicLink());
a.equal(scratchStat.uid,BigInt(process.getuid()));a.equal(scratchStat.mode&0o777n,0o700n);
const NAMES=['payer-v3.sqlite','payer-v4.sqlite'];
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
 openZenonFundingPayerRecoveryCustodyQuarantineSqliteStoreV4:OPEN4,
 createZenonFundingPayerRecoveryDispatchIntentSqliteStoreV3:CREATE3,
 openZenonFundingPayerRecoveryDispatchIntentSqliteStoreV3:OPEN3}
 =await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const {createServiceCreditCustodiedRequestOwnerV3:OWNER}
 =await import('../src/service-credit-custodied-request-owner.js');
const {serializeOriginalServiceRequestCustody:ORIGINAL,serializeOriginalServiceDispatchIntent:INTENT}
 =await import('../src/service-credit-original-request-custody-contract.js');
const {DatabaseSync}=await import('node:sqlite');
const FUNDING='https://custody-quarantine.invalid/funding',SERVICE='https://custody-quarantine.invalid/service-credit/v1/execute';
const POLICY=Object.freeze({policyVersion:1,maxRequests:4,serviceResourceUrl:SERVICE}),HASH='a'.repeat(64);
const STORE='ZENON_FUNDING_PAYER_RECOVERY_STORE_',OWNER_CODE='SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const OPTIONS={concurrency:false,timeout:5000};
const f={store:null,owners:[],closedStores:0,callbacks:0,blockedFreshSubmits:0,wrongVersions:0,
 corruptRefusals:0,getterCalls:0,stage:0,stamp:null,fundingText:null,originalA:null,intentA:null,
 quarantineText:null,identity:new Map(),corrupt:false};
function frozen(v){if(v!==null&&typeof v==='object'){a.equal(Object.isFrozen(v),true);for(const x of Object.values(v))frozen(x);}}
function canonical(v){if(v===null||typeof v!=='object')return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';}
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
function config(name='payer-v4.sqlite'){return {databasePath:join(scratch,name),allowedRoot:scratch,
 resourceUrl:FUNDING,custodyPolicy:POLICY};}
function nativeFile(name){const st=lstatSync(join(scratch,name),{bigint:true});
 a.ok(st.isFile()&&!st.isSymbolicLink());a.equal(st.uid,BigInt(process.getuid()));a.equal(st.dev,scratchStat.dev);
 a.equal(st.nlink,1n);a.equal(st.mode&0o777n,0o600n);
 const i=ids(st).slice(0,6);if(f.identity.has(name))a.deepEqual(i,f.identity.get(name));else f.identity.set(name,i);}
function wholeFile(name){nativeFile(name);const p=join(scratch,name),st=lstatSync(p,{bigint:true});
 a.ok(st.size<=131072n);const i=ids(st),fd=openSync(p,constants.O_RDONLY|constants.O_NOFOLLOW);
 const b=Buffer.alloc(Number(st.size)+1);let used=0;
 try{a.deepEqual(ids(fstatSync(fd,{bigint:true})),i);
 while(used<b.length){const n=readSync(fd,b,used,b.length-used,null);if(!n)break;used+=n;}
 a.deepEqual(ids(fstatSync(fd,{bigint:true})),i);}finally{closeSync(fd);}
 a.equal(used,Number(st.size));a.deepEqual(ids(lstatSync(p,{bigint:true})),i);return {identity:i,sha256:sha(b.subarray(0,used))};}
function owner(grantId){const o=OWNER({store:f.store,fundingResourceUrl:FUNDING,custodyPolicy:POLICY,selectedGrantId:grantId});
 f.owners.push(o);return o;}
async function closeOwner(o,unknown=false){const p=o.close();a.equal(p,o.close());
 if(unknown)await a.rejects(p,{code:OWNER_CODE+'CLOSE_FAILED'});else a.equal(await p,undefined);
 a.equal(p,o.close());a.equal(o.snapshot().closeOutcome,unknown?'UNKNOWN':'DRAINED');}
function closeStore(){a.notEqual(f.store,null);f.store.close();f.store=null;f.closedStores++;}
function storeThrows(fn,suffix){a.throws(fn,{code:STORE+suffix});}
function checkQuarantine(v,grantId){
 frozen(v);a.equal(v.custodyQuarantineVersion,1);a.equal(v.scope,'LOCAL_GRANT_CUSTODY_UNCERTAINTY');
 a.equal(v.grantId,grantId);a.equal(v.fundingResourceUrl,FUNDING);a.equal(v.paymentHash,HASH);
 a.equal(v.network,'zenon:testnet');a.deepEqual(v.custodyPolicy,POLICY);a.equal(v.status,'CUSTODY_OUTCOME_UNKNOWN');
 a.equal(v.authority,'NONE');for(const name of ['mayStartPayment','maySignPayment','mayDispatchService'])a.equal(v[name],false);
 const load=JSON.parse(f.fundingText);const digest=(domain,text)=>'sha256:'+createHash('sha256').update(domain).update('\0').update(text).digest('hex');
 a.equal(v.challengeDigest,digest('zenon-x402:payer-recovery-challenge-v1',load.challengeHeader));
 a.equal(v.paymentDigest,digest('zenon-x402:payer-recovery-payment-v1',load.paymentHeader));
 const core={...v};delete core.checksum;a.equal(v.checksum,digest('zenon-x402:grant-custody-quarantine-v1',canonical(core)));
}
function stamp(){
 a.equal(f.store,null);a.ok(f.owners.every(o=>o.snapshot().closed));nativeFile('payer-v4.sqlite');
 const db=new DatabaseSync(join(scratch,'payer-v4.sqlite'),{readOnly:true,allowExtension:false,
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
 applicationId:db.prepare('PRAGMA application_id').get().application_id};}finally{db.close();}
}
function unchangedCore(before,after){for(const k of ['meta','state','policy','schema','userVersion','applicationId'])a.deepEqual(after[k],before[k]);}
function diagnostic(t,scenario){
 t.diagnostic(JSON.stringify({kind:'P2_CUSTODY_QUARANTINE_V4',version:1,scenario,
 nativeSqliteFiles:f.identity.size,originalRows:f.stamp.originals.length,intentRows:f.stamp.intents.length,
 quarantineRows:f.stamp.quarantines.length,closedReturnedStores:f.closedStores,declaredServiceCallbacks:f.callbacks,
 blockedFreshSubmits:f.blockedFreshSubmits,wrongVersionRefusals:f.wrongVersions,corruptOpenRefusals:f.corruptRefusals,
 corruptionInjected:f.corrupt,networkCalls:0,syntheticSignatureOperations:0,realPaymentSigner:'DISABLED',
 serviceDelivery:'NOT_ESTABLISHED'}));
}
after(async()=>{try{for(const o of f.owners)await closeOwner(o,o.snapshot().uncertainty.custody);}
 finally{if(f.store!==null)closeStore();}
 a.deepEqual(sources(),sourceBefore);a.equal(f.stage,4);a.equal(f.getterCalls,0);});

test("V4 grant quarantine binds exact funding and idempotent insert-only metadata",OPTIONS,async t=>{
 a.equal(f.stage,0);f.store=CREATE4(config());nativeFile('payer-v4.sqlite');
 a.equal(f.store.getOriginalRequestCustodyQuarantine({grantId:'grant-a'}),null);
 storeThrows(()=>f.store.latchOriginalRequestCustodyQuarantine({grantId:'grant-a'}),'INVALID_TRANSITION');
 a.equal(f.store.load(),null);
 f.store.prepare(pair());f.store.fenceAttempt('PREPARED');f.store.finishAttempt('BOUND');
 f.fundingText=JSON.stringify(f.store.load());const o=owner('grant-a');
 a.equal(await o.submitOriginal(input('grant-a','original-a'),()=>{f.callbacks++;}),undefined);
 f.originalA=ORIGINAL(f.store.getOriginalRequest(key('grant-a','original-a')));
 f.intentA=INTENT(f.store.getOriginalDispatchIntent(key('grant-a','original-a')));await closeOwner(o);
 const q=f.store.latchOriginalRequestCustodyQuarantine({grantId:'grant-a'});checkQuarantine(q,'grant-a');
 f.quarantineText=canonical(q);a.equal(canonical(f.store.latchOriginalRequestCustodyQuarantine({grantId:'grant-a'})),f.quarantineText);
 a.equal(canonical(f.store.getOriginalRequestCustodyQuarantine({grantId:'grant-a'})),f.quarantineText);
 a.equal(JSON.stringify(f.store.load()),f.fundingText);
 a.equal(ORIGINAL(f.store.getOriginalRequest(key('grant-a','original-a'))),f.originalA);
 a.equal(INTENT(f.store.getOriginalDispatchIntent(key('grant-a','original-a'))),f.intentA);
 storeThrows(()=>f.store.fenceOriginalDispatchIntent(key('grant-a','original-a')),'CUSTODY_OUTCOME_UNKNOWN');
 closeStore();f.stamp=stamp();a.equal(f.stamp.epoch,1);a.equal(f.stamp.userVersion,4);
 a.equal(f.stamp.applicationId,0x5a505252);a.equal(f.stamp.quarantines.length,1);
 a.equal(f.stamp.quarantines[0].envelope,f.quarantineText);f.stage=1;
 diagnostic(t,'INSERT_ONLY_EXACT_FUNDING_BINDING');
});
test("normal V4 reopen blocks quarantined grant writes with a fresh existing owner",OPTIONS,async t=>{
 a.equal(f.stage,1);const before=f.stamp;f.store=OPEN4(config());
 a.equal(canonical(f.store.getOriginalRequestCustodyQuarantine({grantId:'grant-a'})),f.quarantineText);
 a.equal(JSON.stringify(f.store.load()),f.fundingText);const oa=owner('grant-a');
 a.equal(oa.snapshot().uncertainty.custody,false);
 const retained=oa.readOriginalRecoveryState(key('grant-a','original-a'));
 a.equal(retained.uncertainty.custody,false);a.equal(retained.authority,'NONE');
 a.equal(ORIGINAL(retained.original),f.originalA);a.equal(INTENT(retained.dispatchIntent),f.intentA);
 await a.rejects(oa.submitOriginal(input('grant-a','blocked-a'),()=>{f.callbacks++;}),
 {code:OWNER_CODE+'CUSTODY_OUTCOME_UNKNOWN'});f.blockedFreshSubmits++;
 a.equal(f.callbacks,1);a.equal(oa.snapshot().uncertainty.custody,true);await closeOwner(oa,true);
 a.equal(f.store.getOriginalRequest(key('grant-a','blocked-a')),null);
 a.equal(f.store.getOriginalDispatchIntent(key('grant-a','blocked-a')),null);
 a.equal(f.store.getOriginalRequestCustodyQuarantine({grantId:'grant-b'}),null);
 const ob=owner('grant-b');a.equal(await ob.submitOriginal(input('grant-b','original-b'),()=>{f.callbacks++;}),undefined);
 await closeOwner(ob);a.equal(f.callbacks,2);
 a.equal(canonical(f.store.getOriginalRequestCustodyQuarantine({grantId:'grant-a'})),f.quarantineText);
 a.equal(JSON.stringify(f.store.load()),f.fundingText);closeStore();
 f.stamp=stamp();unchangedCore(before,f.stamp);a.equal(f.stamp.epoch,2);
 a.equal(f.stamp.originals.length,2);a.equal(f.stamp.intents.length,2);a.equal(f.stamp.quarantines.length,1);
 a.deepEqual(f.stamp.quarantines,before.quarantines);
 a.equal(f.stamp.originals.find(r=>r.grant_id==='grant-a').envelope,f.originalA);
 a.equal(f.stamp.intents.find(r=>r.grant_id==='grant-a').envelope,f.intentA);
 f.stage=2;diagnostic(t,'REOPEN_RETAINS_SCOPED_WRITE_FENCE');
});
test("V4 quarantine capacity and V3 profile refusal preserve closed file bytes",OPTIONS,async t=>{
 a.equal(f.stage,2);const before=f.stamp;f.store=OPEN4(config());
 const bad={};Object.defineProperty(bad,'grantId',{enumerable:true,get(){f.getterCalls++;throw Error('NO_GETTER');}});
 storeThrows(()=>f.store.latchOriginalRequestCustodyQuarantine(bad),'INVALID_INPUT');
 storeThrows(()=>f.store.getOriginalRequestCustodyQuarantine({grantId:'grant-a',extra:1}),'INVALID_INPUT');
 for(const grantId of ['grant-b','grant-c','grant-d'])checkQuarantine(f.store.latchOriginalRequestCustodyQuarantine({grantId}),grantId);
 a.equal(canonical(f.store.latchOriginalRequestCustodyQuarantine({grantId:'grant-a'})),f.quarantineText);
 storeThrows(()=>f.store.latchOriginalRequestCustodyQuarantine({grantId:'grant-e'}),'CUSTODY_QUARANTINE_CAPACITY');
 a.equal(f.store.getOriginalRequestCustodyQuarantine({grantId:'grant-e'}),null);
 a.equal(JSON.stringify(f.store.load()),f.fundingText);closeStore();
 f.stamp=stamp();unchangedCore(before,f.stamp);a.equal(f.stamp.epoch,3);
 a.deepEqual(f.stamp.originals,before.originals);a.deepEqual(f.stamp.intents,before.intents);
 a.equal(f.stamp.quarantines.length,4);a.equal(f.getterCalls,0);
 f.store=CREATE3(config('payer-v3.sqlite'));nativeFile('payer-v3.sqlite');
 storeThrows(()=>f.store.getOriginalRequestCustodyQuarantine({grantId:'grant-a'}),'CUSTODY_QUARANTINE_NOT_ENABLED');closeStore();
 for(const [open,name]of [[OPEN4,'payer-v3.sqlite'],[OPEN3,'payer-v4.sqlite']]){
   const saved=wholeFile(name);storeThrows(()=>open(config(name)),'SCHEMA_UNSUPPORTED');
   a.deepEqual(wholeFile(name),saved);f.wrongVersions++;
 }
 a.equal(f.wrongVersions,2);f.stage=3;diagnostic(t,'BOUNDED_QUARANTINE_NO_VERSION_MIGRATION');
});
test("corrupt V4 quarantine metadata is refused before reopen epoch advancement",OPTIONS,t=>{
 a.equal(f.stage,3);a.equal(f.store,null);a.ok(f.owners.every(o=>o.snapshot().closed));
 const before=f.stamp,db=new DatabaseSync(join(scratch,'payer-v4.sqlite'),{readOnly:false,allowExtension:false,
 enableDoubleQuotedStringLiterals:false,enableForeignKeyConstraints:true,timeout:0});
 try{const changed=db.prepare('UPDATE original_custody_quarantines SET envelope=? WHERE grant_id=?').run('{}','grant-a');
 a.equal(changed.changes,1);}finally{db.close();}
 f.corrupt=true;const bytes=wholeFile('payer-v4.sqlite');
 storeThrows(()=>OPEN4(config()),'CORRUPT');f.corruptRefusals++;
 a.deepEqual(wholeFile('payer-v4.sqlite'),bytes);f.stamp=stamp();
 unchangedCore(before,f.stamp);a.equal(f.stamp.epoch,before.epoch);
 a.deepEqual(f.stamp.originals,before.originals);a.deepEqual(f.stamp.intents,before.intents);
 a.equal(f.stamp.quarantines.length,4);a.equal(f.stamp.quarantines.find(r=>r.grant_id==='grant-a').envelope,'{}');
 a.equal(f.closedStores,4);a.equal(f.corruptRefusals,1);f.stage=4;
 diagnostic(t,'CORRUPT_METADATA_FAILS_BEFORE_EPOCH_ADVANCE');
});
