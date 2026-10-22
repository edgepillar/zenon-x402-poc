// Six selected V5 owner/native-store cases on TWO new private synthetic files.
// Trusted callback DATA, not HTTP delivery. Normal close/reopen, not a process/crash test.
// Deliberate forwarding faults occur after native writes or alter read projections only.
// No network, keys, signatures, SDK, install, wallet, real payment or default/HTTP wiring.
import test,{after} from 'node:test';
import a from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,openSync,closeSync,fstatSync,readSync,constants} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const ENTRY="qualification/service-credit-custodied-owner-response-observation-v5.behavior.draft.mjs",SELF=fileURLToPath(import.meta.url),REPO=resolve(dirname(SELF),'..');
const SPECS=[
  [
    "src/service-credit-custodied-request-owner.js",
    55155,
    1358,
    "2ba222760d4a922bf0466d95fd2671076b9d19b8c5fa4ea2cb3c66b1338562eb"
  ],
  [
    "src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js",
    76152,
    1904,
    "3b77ec2e17293f9cc0de75147c84c50aa34563e6bcfb1917da06a4ecb3f3b2c9"
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
a.equal(process.env.P2_OWNER_RESPONSE_OBSERVATION_V5_OPT_IN,'synthetic-native-owner-response-observation-v5-only');
const PINS=JSON.parse(process.env.P2_OWNER_RESPONSE_OBSERVATION_V5_PINS),scratch=process.env.SPV_TASK_SCRATCH;
a.equal(typeof scratch,'string');a.equal(resolve(scratch),scratch);
const scratchStat=lstatSync(scratch,{bigint:true});a.ok(scratchStat.isDirectory()&&!scratchStat.isSymbolicLink());
a.equal(scratchStat.uid,BigInt(process.getuid()));a.equal(scratchStat.mode&0o777n,0o700n);
const NAMES=['observed-owner-v5.sqlite','control-owner-v4.sqlite'];
for(const name of NAMES)a.throws(()=>lstatSync(join(scratch,name)),{code:'ENOENT'});
const ids=s=>['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k=>String(s[k]));
const sha=b=>createHash('sha256').update(b).digest('hex');
function sources() {
  a.equal(PINS.length,6); a.deepEqual(PINS.map(p=>p.path),[...SPECS.map(s=>s[0]),ENTRY]);
  let total=0;
  return PINS.map((p,index)=>{
    const path=join(REPO,p.path), st=lstatSync(path,{bigint:true});
    a.ok(st.isFile()&&!st.isSymbolicLink()); a.equal(st.uid,BigInt(process.getuid())); a.equal(st.nlink,1n);
    a.ok(st.size>0n&&st.size<=131072n); a.deepEqual(ids(st),p.identity);
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
    total+=used; a.ok(total<=262144); a.equal(used,p.bytes); a.equal(sha(bytes),p.sha256);
    a.equal(bytes.filter(n=>n===10).length,p.LF);
    if(index<SPECS.length) a.deepEqual([p.path,p.bytes,p.LF,p.sha256],SPECS[index]);
    return {path:p.path,bytes:p.bytes,sha256:p.sha256,identity:p.identity};
  });
}
const sourceBefore=sources();


const {createZenonFundingPayerRecoveryResponseObservationSqliteStoreV5:CREATE5,
 openZenonFundingPayerRecoveryResponseObservationSqliteStoreV5:OPEN5,
 createZenonFundingPayerRecoveryCustodyQuarantineSqliteStoreV4:CREATE4}
 =await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const {createServiceCreditCustodiedRequestOwnerV4:OWNER4,createServiceCreditCustodiedRequestOwnerV5:OWNER5}
 =await import('../src/service-credit-custodied-request-owner.js');
const {serializeOriginalServiceRequestCustody:ORIGINAL,serializeOriginalServiceDispatchIntent:INTENT}
 =await import('../src/service-credit-original-request-custody-contract.js');
const {DatabaseSync}=await import('node:sqlite');
const FUNDING='https://owner-observation.invalid/funding',SERVICE='https://owner-observation.invalid/service-credit/v1/execute';
const POLICY=Object.freeze({policyVersion:1,maxRequests:12,serviceResourceUrl:SERVICE}),HASH='a'.repeat(64);
const OWNER_CODE='SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_',OPTIONS={concurrency:false,timeout:5000};
const METHODS=['load','getOriginalRequest','retainOriginalRequest','fenceOriginalDispatchIntent',
 'getOriginalDispatchIntent','listOriginalRequestKeys','getOriginalRequestCustodyQuarantine',
 'latchOriginalRequestCustodyQuarantine','recordOriginalResponseObservation','getOriginalResponseObservation',
 'listUnobservedOriginalDispatchKeys'];
const f={store:null,owners:[],closedOwners:new WeakSet(),closedStores:0,callbacks:0,blocked:0,
 closeOk:0,closeUnknown:0,factoryRefusals:0,getterCalls:0,stage:0,identity:new Map(),originals:new Map(),
 intents:new Map(),funding:null,firstStamp:null,controlPin:null,afterCommitThrows:0,missingReadbacks:0,
 foreignResponses:0,accessorResponses:0,lostWitnessResponses:0};
const key=(grantId,requestId)=>({grantId,requestId}),A1=key('grant-a','a1'),A2=key('grant-a','a2'),A3=key('grant-a','a3'),B1=key('grant-b','b1');
const success=code=>JSON.stringify({ok:true,resultCode:code});
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
function config(name){return {databasePath:join(scratch,name),allowedRoot:scratch,resourceUrl:FUNDING,custodyPolicy:POLICY};}
function bound(){f.store.prepare(pair());f.store.fenceAttempt('PREPARED');f.store.finishAttempt('BOUND');
 a.equal(f.store.load().revision,3);a.equal(f.store.load().status,'BOUND');const text=JSON.stringify(f.store.load());
 if(f.funding===null)f.funding=text;else a.equal(text,f.funding);}
function nativeFile(name){const st=lstatSync(join(scratch,name),{bigint:true});
 a.ok(st.isFile()&&!st.isSymbolicLink());a.equal(st.uid,BigInt(process.getuid()));a.equal(st.dev,scratchStat.dev);
 a.equal(st.nlink,1n);a.equal(st.mode&0o777n,0o600n);
 const i=ids(st).slice(0,6);if(f.identity.has(name))a.deepEqual(i,f.identity.get(name));else f.identity.set(name,i);}
function frozen(v){if(v!==null&&typeof v==='object'){a.equal(Object.isFrozen(v),true);for(const x of Object.values(v))frozen(x);}}
function forward(native,overrides={}){const result={};for(const name of METHODS)result[name]=(...args)=>native[name](...args);
 return Object.freeze({...result,...overrides});}
function owner(grantId,store=f.store,factory=OWNER5){const o=factory({store,fundingResourceUrl:FUNDING,
 custodyPolicy:POLICY,selectedGrantId:grantId});f.owners.push(o);return o;}
function constructorRefused(store){a.throws(()=>OWNER5({store,fundingResourceUrl:FUNDING,
 custodyPolicy:POLICY,selectedGrantId:'grant-a'}),{code:OWNER_CODE+'INVALID_CONFIGURATION'});f.factoryRefusals++;}
async function closeOwner(o,unknown=false){const p=o.close();a.equal(p,o.close());
 if(unknown)await a.rejects(p,{code:OWNER_CODE+'CLOSE_FAILED'});else a.equal(await p,undefined);
 a.equal(p,o.close());a.equal(o.snapshot().closeOutcome,unknown?'UNKNOWN':'DRAINED');
 if(!f.closedOwners.has(o)){f.closedOwners.add(o);if(unknown)f.closeUnknown++;else f.closeOk++;}}
function closeStore(){a.notEqual(f.store,null);f.store.close();f.store=null;f.closedStores++;}
function remember(k){const label=k.grantId+':'+k.requestId;
 f.originals.set(label,ORIGINAL(f.store.getOriginalRequest(k)));f.intents.set(label,INTENT(f.store.getOriginalDispatchIntent(k)));}
function exactRecovery(o,k,observed,custody=false){const r=o.readOriginalRecoveryState(k),label=k.grantId+':'+k.requestId;frozen(r);
 a.equal(ORIGINAL(r.original),f.originals.get(label));a.equal(INTENT(r.dispatchIntent),f.intents.get(label));
 a.equal(r.dispatchStatus,'POSSIBLY_ATTEMPTED');a.equal(r.uncertainty.custody,custody);
 a.equal(r.authority,'NONE');a.equal(r.serviceOutcome,'NOT_ESTABLISHED');
 a.equal(r.responseStatus,observed?'LOCAL_DECLARED_SUCCESS_RESPONSE_OBSERVED':'NOT_OBSERVED');
 if(observed){const p=r.responseObservation;a.equal(p.grantId,k.grantId);a.equal(p.requestId,k.requestId);
 a.equal(p.scope,'LOCAL_DECLARED_HTTP_SUCCESS_RESPONSE');a.equal(p.authority,'NONE');a.equal(p.serviceDelivery,'NOT_ESTABLISHED');
 for(const name of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed'])a.equal(p[name],false);
 a.equal(p.originalDigest,'sha256:'+createHash('sha256').update('zenon-x402:response-observation-original-v1').update('\0').update(ORIGINAL(r.original)).digest('hex'));
 a.equal(p.dispatchIntentDigest,'sha256:'+createHash('sha256').update('zenon-x402:response-observation-intent-v1').update('\0').update(INTENT(r.dispatchIntent)).digest('hex'));
 }else a.equal(r.responseObservation,null);return r;}
async function rejectedSubmit(o,k,code){const before=o.snapshot().counts;
 await a.rejects(o.submitOriginal(input(k.grantId,k.requestId),()=>{f.callbacks++;}),{code:OWNER_CODE+code});f.blocked++;
 a.deepEqual(o.snapshot().counts,before);}
function checkQ(o,written){const s=o.snapshot();a.equal(s.custodyQuarantine.status,'PERSISTED_UNKNOWN');
 a.equal(s.custodyQuarantine.writeAttempted,written);a.equal(s.counts.quarantineWrites,written?1:0);
 a.equal(s.counts.quarantineReadbackConfirmations,written?1:0);
 a.equal(s.custodyQuarantine.authority,'NONE');for(const name of ['mayStartPayment','maySignPayment','mayDispatchService'])a.equal(s.custodyQuarantine[name],false);}
function stamp(name){a.equal(f.store,null);a.ok(f.owners.every(o=>o.snapshot().closed));nativeFile(name);
 const db=new DatabaseSync(join(scratch,name),{readOnly:true,allowExtension:false,
 enableDoubleQuotedStringLiterals:false,enableForeignKeyConstraints:true,timeout:0});
 try{const v=db.prepare('PRAGMA user_version').get().user_version;
 return {epoch:db.prepare('SELECT owner_epoch FROM payer_recovery_meta WHERE singleton=1').get().owner_epoch,
 meta:db.prepare('SELECT singleton,resource_url FROM payer_recovery_meta ORDER BY singleton').all(),
 state:db.prepare('SELECT * FROM payer_recovery_state ORDER BY singleton').all(),
 originals:db.prepare('SELECT * FROM original_service_requests ORDER BY grant_id,request_id').all(),
 intents:db.prepare('SELECT * FROM original_dispatch_intents ORDER BY grant_id,request_id').all(),
 observations:v===5?db.prepare('SELECT * FROM original_response_observations ORDER BY grant_id,request_id').all():[],
 quarantines:db.prepare('SELECT * FROM original_custody_quarantines ORDER BY grant_id').all(),
 policy:db.prepare('SELECT * FROM original_request_custody_policy').all(),
 schema:db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all(),
 userVersion:v,applicationId:db.prepare('PRAGMA application_id').get().application_id};}finally{db.close();}}
function filePin(name){nativeFile(name);const path=join(scratch,name),st=lstatSync(path,{bigint:true}),fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW),raw=Buffer.alloc(Number(st.size)+1);let used=0;
 try{a.deepEqual(ids(fstatSync(fd,{bigint:true})),ids(st));while(used<raw.length){const n=readSync(fd,raw,used,raw.length-used,null);if(!n)break;used+=n;}
 a.deepEqual(ids(fstatSync(fd,{bigint:true})),ids(st));}finally{closeSync(fd);}
 a.equal(used,Number(st.size));a.deepEqual(ids(lstatSync(path,{bigint:true})),ids(st));return {bytes:used,sha256:sha(raw.subarray(0,used)),identity:ids(st)};}
function immutableFundingRows(before,after){for(const name of ['meta','state','policy','schema','userVersion','applicationId'])a.deepEqual(after[name],before[name]);}
function diagnostic(t,scenario){t.diagnostic(JSON.stringify({kind:'P2_OWNER_RESPONSE_OBSERVATION_V5',version:1,scenario,
 nativeSqliteFiles:f.identity.size,closedReturnedStores:f.closedStores,declaredServiceCallbacks:f.callbacks,blockedFreshOrReplaySubmits:f.blocked,
 successfulOwnerCloses:f.closeOk,expectedUnknownOwnerCloses:f.closeUnknown,factoryRefusals:f.factoryRefusals,
 automaticQuarantineWrites:f.owners.reduce((n,o)=>n+(o.snapshot().counts.quarantineWrites??0),0),
 confirmedResponseReadbacks:f.owners.reduce((n,o)=>n+(o.snapshot().counts.responseReadbackConfirmations??0),0),
 afterCommitForwardingThrows:f.afterCommitThrows,missingReadbackRefusals:f.missingReadbacks,
 foreignResponseRefusals:f.foreignResponses,accessorResponseRefusals:f.accessorResponses,lostWitnessRefusals:f.lostWitnessResponses,
 getterCalls:f.getterCalls,networkCalls:0,syntheticSignatureOperations:0,realPaymentSigner:'DISABLED',serviceDelivery:'NOT_ESTABLISHED'}));}
after(async()=>{try{for(const o of f.owners){const u=o.snapshot().uncertainty;
 await closeOwner(o,u.custody||u.submission||u.undrained);}}finally{if(f.store!==null)closeStore();}
 a.deepEqual(sources(),sourceBefore);a.equal(f.stage,6);a.equal(f.callbacks,9);a.equal(f.closedStores,6);
 a.equal(f.closeOk,4);a.equal(f.closeUnknown,7);a.equal(f.getterCalls,0);});

test('V5 owner confirms bound response readback before callback completion and refuses implicit replay',OPTIONS,async t=>{
 a.equal(f.stage,0);f.store=CREATE5(config(NAMES[0]));nativeFile(NAMES[0]);bound();
 const native=f.store,base=forward(native),hostile={...base};Object.defineProperty(hostile,'getOriginalResponseObservation',{enumerable:true,get(){f.getterCalls++;return base.getOriginalResponseObservation;}});
 constructorRefused(Object.freeze(hostile));
 constructorRefused(forward(native,{recordOriginalResponseObservation:new Proxy(()=>{f.getterCalls++;},{apply(){f.getterCalls++;}})}));
 constructorRefused(forward(native,{listUnobservedOriginalDispatchKeys:()=>Promise.resolve(Object.freeze([]))}));
 constructorRefused(forward(native,{listUnobservedOriginalDispatchKeys:()=>Object.freeze([Object.freeze(B1)])}));
 a.equal(native.getOriginalRequestCustodyQuarantine({grantId:'grant-a'}),null);a.equal(native.listOriginalRequestKeys().length,0);
 const o=owner('grant-a');
 await rejectedSubmit(o,key('grant-b','foreign'),'FOREIGN_GRANT');
 a.equal(await o.submitOriginal(input(A1.grantId,A1.requestId),async original=>{f.callbacks++;frozen(original);
 a.notEqual(native.getOriginalDispatchIntent(A1),null);a.equal(native.getOriginalResponseObservation(A1),null);return success('a1');}),undefined);
 a.equal(o.snapshot().phase,'CALLBACK_COMPLETED');a.equal(o.snapshot().counts.responseWrites,1);
 a.equal(o.snapshot().counts.responseReadbackConfirmations,1);remember(A1);exactRecovery(o,A1,true);
 const before=o.snapshot().counts;
 await a.rejects(o.submitOriginal(input(A1.grantId,A1.requestId),()=>{f.callbacks++;}),{code:OWNER_CODE+'RECOVERY_REQUIRED'});f.blocked++;
 a.equal(o.snapshot().counts.responseWrites,before.responseWrites);a.equal(o.snapshot().counts.dispatchCalls,1);
 a.equal(native.getOriginalRequestCustodyQuarantine({grantId:'grant-a'}),null);
 await closeOwner(o);a.equal(JSON.stringify(native.load()),f.funding);f.stage=1;diagnostic(t,'WRITE_READBACK_BEFORE_COMPLETION_NO_REPLAY');
});

test('V5 drain and normal reopen preserve observations without clearing intents or adopting foreign pending work',OPTIONS,async t=>{
 a.equal(f.stage,1);const o=owner('grant-a');let resolveReply;
 const reply=new Promise(resolve=>{resolveReply=resolve;});
 const submitted=o.submitOriginal(input(A2.grantId,A2.requestId),()=>{f.callbacks++;return reply;});
 a.equal(o.snapshot().active,true);a.equal(f.store.getOriginalResponseObservation(A2),null);
 const closing=o.close();a.equal(closing,o.close());a.equal(o.snapshot().closeOutcome,'WAITING');
 resolveReply(success('a2'));a.equal(await submitted,undefined);a.equal(await closing,undefined);await closeOwner(o);remember(A2);
 f.store.retainOriginalRequest(input(B1.grantId,B1.requestId));f.store.fenceOriginalDispatchIntent(B1);remember(B1);
 closeStore();const before=stamp(NAMES[0]);a.equal(before.epoch,1);a.equal(before.observations.length,2);a.equal(before.quarantines.length,0);
 f.store=OPEN5(config(NAMES[0]));const reopened=owner('grant-a');
 exactRecovery(reopened,A1,true);exactRecovery(reopened,A2,true);a.equal(reopened.snapshot().uncertainty.custody,false);
 a.equal(await reopened.submitOriginal(input(A3.grantId,A3.requestId),async()=>{f.callbacks++;return success('a3');}),undefined);
 remember(A3);exactRecovery(reopened,A3,true);a.equal(f.store.getOriginalRequestCustodyQuarantine({grantId:'grant-a'}),null);
 await closeOwner(reopened);closeStore();const after=stamp(NAMES[0]);a.equal(after.epoch,before.epoch+1);immutableFundingRows(before,after);
 for(const row of before.originals)a.deepEqual(after.originals.find(r=>r.grant_id===row.grant_id&&r.request_id===row.request_id),row);
 for(const row of before.intents)a.deepEqual(after.intents.find(r=>r.grant_id===row.grant_id&&r.request_id===row.request_id),row);
 a.equal(after.observations.length,3);a.equal(after.quarantines.length,0);f.firstStamp=after;
 f.stage=2;diagnostic(t,'DRAIN_THEN_NORMAL_REOPEN_SELECTED_GRANT_ONLY');
});

test('V4 callback semantics remain distinct and incompatible V5 owner probing does not quarantine V4',OPTIONS,async t=>{
 a.equal(f.stage,2);f.store=CREATE4(config(NAMES[1]));nativeFile(NAMES[1]);bound();const o=owner('grant-v4',f.store,OWNER4);
 a.equal(await o.submitOriginal(input('grant-v4','v4'),()=>{f.callbacks++;}),undefined);a.equal(o.snapshot().phase,'CALLBACK_COMPLETED');
 a.equal(Object.hasOwn(o.snapshot().counts,'responseWrites'),false);
 a.equal(Object.hasOwn(o.readOriginalRecoveryState(key('grant-v4','v4')),'responseObservation'),false);
 const before=JSON.stringify(f.store.load());constructorRefused(f.store);
 a.equal(JSON.stringify(f.store.load()),before);a.equal(f.store.getOriginalRequestCustodyQuarantine({grantId:'grant-a'}),null);
 a.equal(f.store.getOriginalRequestCustodyQuarantine({grantId:'grant-v4'}),null);await closeOwner(o);closeStore();
 const control=stamp(NAMES[1]);a.equal(control.userVersion,4);a.equal(control.quarantines.length,0);a.equal(control.observations.length,0);
 f.controlPin=filePin(NAMES[1]);f.stage=3;diagnostic(t,'V4_UNCHANGED_CALLBACK_PROFILE_READ_ONLY_V5_REFUSAL');
});

test('V5 startup quarantines a retained unobserved intent before any new dispatch or retention',OPTIONS,async t=>{
 a.equal(f.stage,3);f.store=OPEN5(config(NAMES[0]));const o=owner('grant-b');checkQ(o,true);
 a.equal(o.snapshot().counts.dispatchCalls,0);a.equal(o.snapshot().counts.retainCalls,0);
 exactRecovery(o,B1,false,true);
 await rejectedSubmit(o,key('grant-b','new-b'),'CUSTODY_OUTCOME_UNKNOWN');
 await rejectedSubmit(o,B1,'CUSTODY_OUTCOME_UNKNOWN');await closeOwner(o,true);closeStore();
 const after=stamp(NAMES[0]);a.equal(after.epoch,f.firstStamp.epoch+1);immutableFundingRows(f.firstStamp,after);
 for(const name of ['originals','intents','observations'])a.deepEqual(after[name],f.firstStamp[name]);
 a.deepEqual(after.quarantines.map(r=>r.grant_id),['grant-b']);a.deepEqual(filePin(NAMES[1]),f.controlPin);
 f.stage=4;diagnostic(t,'RETAINED_UNOBSERVED_INTENT_STARTUP_FENCE');
});

test('V5 void invalid and unobservable callback replies remain UNKNOWN without response synthesis',OPTIONS,async t=>{
 a.equal(f.stage,4);f.store=OPEN5(config(NAMES[0]));
 for(const [grant,id,kind] of [['grant-c','c1','void'],['grant-d','d1','invalid'],['grant-e','e1','bare']]){
 const o=owner(grant),k=key(grant,id);
 await a.rejects(o.submitOriginal(input(grant,id),()=>{f.callbacks++;
 if(kind==='void')return undefined;if(kind==='invalid')return Promise.resolve('{"ok":true,"resultCode":"x","extra":true}');
 return success('bare');}),{code:OWNER_CODE+'SUBMISSION_OUTCOME_UNKNOWN'});
 remember(k);a.equal(f.store.getOriginalResponseObservation(k),null);checkQ(o,true);
 a.equal(o.snapshot().counts.responseWrites,0);a.equal(o.snapshot().counts.callbackCompletions,0);
 a.equal(o.snapshot().uncertainty.undrained,kind==='bare');
 await rejectedSubmit(o,key(grant,'later'),'SUBMISSION_OUTCOME_UNKNOWN');await closeOwner(o,true);
 }
 closeStore();const after=stamp(NAMES[0]);a.equal(after.epoch,4);a.equal(after.observations.length,3);
 a.equal(after.originals.length,7);a.equal(after.intents.length,7);a.equal(after.quarantines.length,4);
 a.deepEqual(filePin(NAMES[1]),f.controlPin);f.stage=5;diagnostic(t,'INVALID_REPLY_NO_SUCCESS_SYNTHESIS_OR_RETRY');
});

test('V5 post-commit and readback faults retain observations but never report confirmed completion',OPTIONS,async t=>{
 a.equal(f.stage,5);f.store=OPEN5(config(NAMES[0]));const native=f.store;
 const fk=key('grant-f','f1'),gk=key('grant-g','g1');
 const afterCommit=forward(native,{recordOriginalResponseObservation(value){native.recordOriginalResponseObservation(value);
 f.afterCommitThrows++;throw Error('DECLARED_FORWARDER_AFTER_COMMIT');}});
 const missing=forward(native,{getOriginalResponseObservation(){f.missingReadbacks++;return null;}});
 for(const [k,store] of [[fk,afterCommit],[gk,missing]]){
 const o=owner(k.grantId,store);await a.rejects(o.submitOriginal(input(k.grantId,k.requestId),async()=>{f.callbacks++;return success(k.requestId);}),
 {code:OWNER_CODE+'SUBMISSION_OUTCOME_UNKNOWN'});remember(k);checkQ(o,true);
 a.notEqual(native.getOriginalResponseObservation(k),null);a.equal(o.snapshot().counts.responseWrites,1);
 a.equal(o.snapshot().counts.responseReadbackConfirmations,0);a.equal(o.snapshot().counts.callbackCompletions,0);
 await rejectedSubmit(o,key(k.grantId,'later'),'SUBMISSION_OUTCOME_UNKNOWN');await closeOwner(o,true);
 }
 let mode='normal';
 const projected=forward(native,{getOriginalResponseObservation(k){
 if(mode==='foreign')return native.getOriginalResponseObservation(fk);
 if(mode==='getter'){const record={...native.getOriginalResponseObservation(k)};
 Object.defineProperty(record,'checksum',{enumerable:true,get(){f.getterCalls++;return 'forbidden';}});return Object.freeze(record);}
 if(mode==='null')return null;return native.getOriginalResponseObservation(k);}});
 const o=owner('grant-a',projected);exactRecovery(o,A1,true);
 mode='foreign';a.throws(()=>o.readOriginalRecoveryState(A1),{code:OWNER_CODE+'CUSTODY_OUTCOME_UNKNOWN'});f.foreignResponses++;
 mode='getter';a.throws(()=>o.readOriginalRecoveryState(A1),{code:OWNER_CODE+'CUSTODY_OUTCOME_UNKNOWN'});f.accessorResponses++;
 mode='normal';exactRecovery(o,A1,true,true);mode='null';
 a.throws(()=>o.readOriginalRecoveryState(A1),{code:OWNER_CODE+'CUSTODY_OUTCOME_UNKNOWN'});f.lostWitnessResponses++;
 checkQ(o,true);await closeOwner(o,true);a.equal(JSON.stringify(native.load()),f.funding);
 closeStore();const after=stamp(NAMES[0]);a.equal(after.epoch,5);immutableFundingRows(f.firstStamp,after);
 a.equal(after.originals.length,9);a.equal(after.intents.length,9);a.equal(after.observations.length,5);
 a.deepEqual(after.quarantines.map(r=>r.grant_id),['grant-a','grant-b','grant-c','grant-d','grant-e','grant-f','grant-g']);
 for(const [label,text]of f.originals){const [grantId,requestId]=label.split(':');
 a.equal(after.originals.find(r=>r.grant_id===grantId&&r.request_id===requestId).envelope,text);}
 for(const [label,text]of f.intents){const [grantId,requestId]=label.split(':');
 a.equal(after.intents.find(r=>r.grant_id===grantId&&r.request_id===requestId).envelope,text);}
 a.deepEqual(filePin(NAMES[1]),f.controlPin);a.equal(f.getterCalls,0);
 f.stage=6;diagnostic(t,'POST_COMMIT_READBACK_BINDING_AND_WITNESS_FENCES');
});
