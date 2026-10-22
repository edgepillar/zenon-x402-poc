// Four selected V5 no-dispatch reader cases on ONE new private synthetic SQLite file.
// Originals/intents and one local response observation are declared seed DATA, not a transport receipt.
// Normal owned close/reopen only; no network, SDK, keys/signatures, payment, crash or process restart.
import test,{before,after} from 'node:test';
import a from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,openSync,closeSync,fstatSync,readSync,constants} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const ENTRY="qualification/service-credit-custodied-sqlite-recovery-reader-v5.behavior-v2.draft.mjs",SELF=fileURLToPath(import.meta.url),REPO=resolve(dirname(SELF),'..');
const SPECS=[
  [
    "src/service-credit-custodied-sequential-runner-core.js",
    15907,
    491,
    "1ea3bc77bc6f1ef7c5aef843f6d4f67109f3a7943a761c19e7dfcb37cfb84a0e"
  ],
  [
    "src/service-credit-custodied-sqlite-sequential-runner.js",
    23370,
    542,
    "6a13fa59532928f707167431c4c769a110d1bba61df5b218db86354934110e6a"
  ],
  [
    "src/service-credit-custodied-sqlite-http-client.js",
    20887,
    550,
    "e7a8f3f7acdf9346d2b74a3d2918874b66e036b3dad0a363862dcc7119b68702"
  ],
  [
    "src/service-credit-custodied-http-client.js",
    12646,
    324,
    "35997f41c9a5162fe29ed56776181a1691c0a0a69c7dbdfe8b61785af3998145"
  ],
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
    "src/service-credit-http-execute-dispatch.js",
    28104,
    790,
    "929881081b22b90b07d3d1c4dc8f873d4d81ee5ae84542d24b7534674f4eb9c0"
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
    "src/service-credit-pilot-client-plan.js",
    7483,
    181,
    "73ee3d739de85150039e733234cd0761c228d68de040d1e126902e808a259ac6"
  ],
  [
    "src/service-credit-pilot-status-view.js",
    3202,
    60,
    "cf3822d8b9ec4eb4772452ed1888b96d398fd87c1ead44cd155a5acc1a6b66ed"
  ],
  [
    "src/service-credit-custodied-recovery-collection-core.js",
    13794,
    306,
    "51d06da70ecccd0cf8b38d650367d1ae903ea86010a5ebeadb682af98e4b890b"
  ],
  [
    "src/service-credit-custodied-recovery-observation-collection-core.js",
    8579,
    213,
    "36b7cece2d436cbfcac5f4299dd6bd30e5eede6ebb2ebe769ae7bf3a6f1a72b4"
  ],
  [
    "package.json",
    1413,
    40,
    "8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"
  ],
  [
    "src/service-credit-custodied-sqlite-recovery-reader.js",
    5907,
    139,
    "75c3331bde079c811debe066c629e8f61aea75d6973542b8d0648cf36045bf30"
  ]
];
a.equal(process.argv.length,2);a.equal(process.argv[1],SELF);
a.equal(process.versions.node,'24.19.0');a.equal(process.platform,'darwin');a.equal(process.arch,'arm64');
a.equal(process.env.P2_READER_RESPONSE_OBSERVATION_V5_OPT_IN,'synthetic-native-no-dispatch-reader-v5-only');
const PINS=JSON.parse(process.env.P2_READER_RESPONSE_OBSERVATION_V5_PINS),scratch=process.env.SPV_TASK_SCRATCH;
a.equal(typeof scratch,'string');a.equal(resolve(scratch),scratch);
const scratchStat=lstatSync(scratch,{bigint:true});a.ok(scratchStat.isDirectory()&&!scratchStat.isSymbolicLink());
a.equal(scratchStat.uid,BigInt(process.getuid()));a.equal(scratchStat.mode&0o777n,0o700n);
const ids=s=>['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k=>String(s[k]));
const sha=b=>createHash('sha256').update(b).digest('hex');
function sources() {
  a.equal(PINS.length,16); a.deepEqual(PINS.map(p=>p.path),[...SPECS.map(s=>s[0]),ENTRY]);
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
    total+=used; a.ok(total<=393216); a.equal(used,p.bytes); a.equal(sha(bytes),p.sha256);
    a.equal(bytes.filter(n=>n===10).length,p.LF);
    if(index<SPECS.length) a.deepEqual([p.path,p.bytes,p.LF,p.sha256],SPECS[index]);
    return {path:p.path,bytes:p.bytes,sha256:p.sha256,identity:p.identity};
  });
}
const sourceBefore=sources();

const NAME='reader-observed-v5.sqlite',PATH=join(scratch,NAME);
a.throws(()=>lstatSync(PATH),{code:'ENOENT'});
const stores=await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const readers=await import('../src/service-credit-custodied-sqlite-recovery-reader.js');
const {DatabaseSync}=await import('node:sqlite');
const CREATE=stores.createZenonFundingPayerRecoveryResponseObservationSqliteStoreV5;
const OPEN=readers.openServiceCreditCustodiedSqliteRecoveryReaderV5,OPEN4=readers.openServiceCreditCustodiedSqliteRecoveryReaderV4;
const P='SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_',RP='SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_';
const OP='SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const FUNDING='https://reader-v5.invalid/funding',SERVICE='https://reader-v5.invalid/service-credit/v1/execute';
const HASH='a'.repeat(64),A=Object.freeze({grantId:'grant-observed',requestId:'observed-original'});
const B=Object.freeze({grantId:'grant-unobserved',requestId:'unobserved-original'});
const POLICY=Object.freeze({policyVersion:1,maxRequests:4,serviceResourceUrl:SERVICE});
const RESPONSE='{"ok":true,"resultCode":"seeded-local-result"}';
const METHODS=['readOriginal','readOriginalRecoveryState','readOriginalRecoveryKeys','createOriginalRecoveryPlan',
 'createOriginalRecoveryStatePlan','createOriginalRecoveryCollection','createOriginalRecoveryObservationCollection','close','snapshot'];
const OPTIONS={timeout:5000,concurrency:false};
const f={store:null,current:null,frames:[],plans:[],collections:[],stamp:null,stage:0,seedCloses:0,normalCloses:0,
 unknownCloses:0,configRefusals:0,profileRefusals:0,foreignRefusals:0,catalogRefusals:0,successInputs:0,
 rootReadFailures:0,unavailableRefusals:0,recoveryCollections:0,observationCollections:0};
function frozen(v){if(v!==null&&typeof v==='object'){a.equal(Object.isFrozen(v),true);for(const x of Object.values(v))frozen(x);}}
function powerless(v,field='authority'){
 frozen(v);a.equal(v[field],'NONE');a.equal(v.qualification,'UNQUALIFIED');
 for(const k of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed'])a.equal(v[k],false);
}
function configuration(key=A){return {databasePath:PATH,allowedRoot:scratch,fundingResourceUrl:FUNDING,
 custodyPolicy:POLICY,selectedGrantId:key.grantId,deadlineMs:2000};}
function original(key){return JSON.stringify({modelVersion:1,...key,method:'POST',routeId:'service-credit.execute.v1',
 canonicalBodyDigest:'sha256:'+sha(Buffer.alloc(0)),selectedContentType:'application/json',maxCostUnits:1});}
function pair(){
 const requirement={scheme:'exact',network:'zenon:testnet',asset:'synthetic-asset',amount:'1',payTo:'synthetic-payee',
 maxTimeoutSeconds:30,extra:{poc:true,settlement:'account-block',paymentFlow:'upfront',minimumMomentumConfirmations:2,
 zenonChain:{version:1,chainIdentifier:'42',genesisMomentumHash:'1'.repeat(64)}}};
 const required={x402Version:2,resource:{url:FUNDING},accepts:[requirement]};
 const payload={x402Version:2,resource:{url:FUNDING},accepted:requirement,payload:{transaction:{hash:HASH},intentDigest:'2'.repeat(64)}};
 return {challenge:{status:'PAYMENT_REQUIRED',resourceUrl:FUNDING,paymentRequired:required,
 paymentRequiredHeader:Buffer.from(JSON.stringify(required)).toString('base64')},
 paymentSignatureHeader:Buffer.from(JSON.stringify(payload)).toString('base64')};
}
const PAIR=pair();
const observation=(key,successful)=>JSON.stringify({viewVersion:1,paymentHash:HASH,requestId:key.requestId,
 fundingStatus:successful?'INCLUDED':'UNKNOWN',serviceStatus:successful?'SUCCEEDED':'OUTCOME_UNKNOWN'});
const initial=key=>JSON.stringify([{...key,observationJson:observation(key,false)}]);
function nativeIdentity(){
 const st=lstatSync(PATH,{bigint:true});a.ok(st.isFile()&&!st.isSymbolicLink());a.equal(st.uid,BigInt(process.getuid()));
 a.equal(st.dev,scratchStat.dev);a.equal(st.nlink,1n);a.equal(st.mode&0o777n,0o600n);return ids(st);
}
function wholeFile(){
 const id=nativeIdentity(),fd=openSync(PATH,constants.O_RDONLY|constants.O_NOFOLLOW),buf=Buffer.alloc(Number(id[6])+1);let used=0;
 try{a.deepEqual(ids(fstatSync(fd,{bigint:true})),id);while(used<buf.length){const n=readSync(fd,buf,used,buf.length-used,null);if(!n)break;used+=n;}
 a.deepEqual(ids(fstatSync(fd,{bigint:true})),id);}finally{closeSync(fd);}
 a.equal(used,Number(id[6]));a.deepEqual(nativeIdentity(),id);return {identity:id,sha256:sha(buf.subarray(0,used))};
}
function stamp(){
 a.equal(f.store,null);a.equal(f.current,null);nativeIdentity();
 const db=new DatabaseSync(PATH,{readOnly:true,allowExtension:false,enableDoubleQuotedStringLiterals:false,
 enableForeignKeyConstraints:true,timeout:0});
 try{
 const v={
 epoch:db.prepare('SELECT owner_epoch FROM payer_recovery_meta WHERE singleton=1').get().owner_epoch,
 meta:db.prepare('SELECT singleton,resource_url FROM payer_recovery_meta ORDER BY singleton').all(),
 state:db.prepare('SELECT * FROM payer_recovery_state ORDER BY singleton').all(),
 policy:db.prepare('SELECT * FROM original_request_custody_policy').all(),
 originals:db.prepare('SELECT * FROM original_service_requests ORDER BY grant_id,request_id').all(),
 intents:db.prepare('SELECT * FROM original_dispatch_intents ORDER BY grant_id,request_id').all(),
 observations:db.prepare('SELECT * FROM original_response_observations ORDER BY grant_id,request_id').all(),
 quarantines:db.prepare('SELECT * FROM original_custody_quarantines ORDER BY grant_id').all(),
 schema:db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all(),
 userVersion:db.prepare('PRAGMA user_version').get().user_version,
 applicationId:db.prepare('PRAGMA application_id').get().application_id};
 a.equal(v.userVersion,5);a.equal(v.applicationId,0x5a505252);a.equal(v.originals.length,2);a.equal(v.intents.length,2);
 a.equal(v.observations.length,1);a.equal(JSON.parse(v.observations[0].envelope).responseJson,RESPONSE);
 for(const key of [A,B])a.equal(JSON.parse(v.originals.find(r=>r.grant_id===key.grantId).envelope).originalRequestJson,original(key));
 const funding=JSON.parse(v.state[0].envelope);a.equal(funding.challengeHeader,PAIR.challenge.paymentRequiredHeader);
 a.equal(funding.paymentHeader,PAIR.paymentSignatureHeader);return v;
 }finally{db.close();}
}
function unchanged(before,after,epochs,newQuarantine=false){
 a.equal(after.epoch,before.epoch+epochs);
 for(const k of Object.keys(before))if(k!=='epoch'&&!(newQuarantine&&k==='quarantines'))a.deepEqual(after[k],before[k]);
 if(newQuarantine){a.equal(before.quarantines.length,0);a.equal(after.quarantines.length,1);
 const q=JSON.parse(after.quarantines[0].envelope);a.equal(q.grantId,B.grantId);a.equal(q.status,'CUSTODY_OUTCOME_UNKNOWN');a.equal(q.authority,'NONE');}
}
const owner=reader=>reader.snapshot().runner.client.owner;
function surface(rec){
 const reader=rec.reader;frozen(reader);a.deepEqual(Reflect.ownKeys(reader),METHODS);
 for(const fn of Object.values(reader)){a.equal(typeof fn,'function');a.equal(Object.isFrozen(fn),true);}
 for(const k of ['submitOriginal','runOriginals','requestImpl','root','store','owner','sign','pay','recordOriginalResponseObservation'])
 a.equal(Object.hasOwn(reader,k),false);
 const v=reader.snapshot();a.equal(v.runner.storeOwnership,'OWNED_EXISTING_V5_RESPONSE_OBSERVATION');
 a.equal(v.runner.planned,0);a.equal(v.runner.attempted,0);a.equal(v.runner.runClaimed,false);a.equal(v.runner.client.lastTransport,null);
 a.equal(v.unknown,rec.unknown);a.equal(v.qualification,'UNQUALIFIED');
 const o=owner(reader);a.equal(o.custodyQuarantine.status,rec.unknown?'PERSISTED_UNKNOWN':'NOT_RECORDED');
 a.equal(o.counts.retainCalls,0);a.equal(o.counts.intentWrites,0);a.equal(o.counts.responseWrites,0);
 for(const secret of [FUNDING,SERVICE,HASH,'seeded-local-result'])a.equal(JSON.stringify(v).includes(secret),false);
}
function recovery(state,key,quarantined){
 frozen(state);a.equal(state.authority,'NONE');a.equal(state.qualification,'UNQUALIFIED');a.equal(state.serviceOutcome,'NOT_ESTABLISHED');
 a.equal(state.funding.status,'BOUND');a.equal(state.funding.revision,3);a.equal(state.funding.paymentHash,HASH);
 a.equal(state.original.originalRequestJson,original(key));a.equal(state.original.originalBodyBase64,'');
 a.equal(state.dispatchStatus,'POSSIBLY_ATTEMPTED');a.notEqual(state.dispatchIntent,null);
 a.equal(state.uncertainty.custody,quarantined);a.equal(state.uncertainty.submission,false);
 a.equal(state.responseStatus,key===A?'LOCAL_DECLARED_SUCCESS_RESPONSE_OBSERVED':'NOT_OBSERVED');
 if(key===A){const r=state.responseObservation;frozen(r);a.equal(r.responseJson,RESPONSE);a.equal(r.authority,'NONE');
 for(const k of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed'])a.equal(r[k],false);
 a.equal(r.serviceDelivery,'NOT_ESTABLISHED');}else a.equal(state.responseObservation,null);
}
function planView(v,key,quarantined){powerless(v);a.equal(v.nextStep,'RECONCILIATION_REQUIRED');
 recovery(v.recoveryState,key,quarantined);powerless(v.declaredPlan,'authorization');a.equal(v.currentFundingUncertain,false);}
function collectionView(v,key,quarantined){powerless(v);a.equal(v.nextStep,'RECONCILIATION_REQUIRED');a.deepEqual(v.keys,[key]);
 a.equal(v.entries.length,1);planView(v.entries[0].recoveryPlan,key,quarantined);}
function plan(api){const rec={api,closed:false};f.plans.push(rec);return rec;}
function closePlan(rec){if(rec.closed)return;const v=rec.api.close();powerless(v);a.equal(v.closed,true);a.equal(v.nextStep,'LOCALLY_CLOSED');
 a.equal(rec.api.close(),v);a.equal(rec.api.getSnapshot(),v);rec.closed=true;}
function collection(api,observationFacade){const rec={api,observationFacade,closed:false};f.collections.push(rec);
 if(observationFacade)f.observationCollections++;else f.recoveryCollections++;return rec;}
function closeCollection(rec){if(rec.closed)return rec.history;const v=rec.api.close();powerless(v);a.equal(v.closed,true);
 a.equal(v.snapshotKind,'DETACHED_HISTORICAL');a.equal(v.nextStep,'LOCALLY_CLOSED');a.equal(v.childCloseAttempts,1);
 a.equal(v.childCloseOutcome,'RETURNED');a.equal(rec.api.close(),v);a.equal(rec.api.getSnapshot(),v);
 rec.closed=true;rec.history=v;return v;}
async function closeReader(rec){
 if(rec.started){a.equal(rec.closed,true);return;}rec.started=true;const p=rec.reader.close();a.equal(rec.reader.close(),p);
 if(rec.unknown){await a.rejects(p,{code:RP+'CHILD_OUTCOME_UNKNOWN'});f.unknownCloses++;}
 else{a.equal(await p,undefined);f.normalCloses++;}
 const v=rec.reader.snapshot();a.equal(v.close.outcome,rec.unknown?'CHILD_UNKNOWN':'DRAINED');
 a.equal(v.resource.phase,'RELEASED');a.equal(v.resource.slotHeld,false);a.equal(v.resource.storeCloseAttempts,1);
 a.equal(v.resource.storeCloseOutcome,'RETURNED');a.equal(v.runner.closeCalls,1);a.equal(v.runner.queuedReferences,0);
 a.equal(rec.reader.close(),p);a.throws(()=>rec.reader.readOriginalRecoveryState(rec.key),{code:RP+'CLOSED'});
 rec.closed=true;f.current=null;
}
async function withReader(key,unknown,action){
 a.equal(f.current,null);const reader=await OPEN(configuration(key));
 const rec={reader,key,unknown,closed:false,started:false};f.frames.push(rec);f.current=rec;surface(rec);
 try{return await action(reader,rec);}finally{await closeReader(rec);}
}
function diagnostic(t,scenario){
 a.equal(f.current,null);for(const rec of f.frames){a.equal(rec.closed,true);surface(rec);}
 const counts=f.frames.map(rec=>owner(rec.reader).counts);
 t.diagnostic(JSON.stringify({kind:'P2_NO_DISPATCH_READER_V5',version:1,scenario,nativeSqliteFiles:1,seedStoreReturnedCloses:f.seedCloses,
 ownedReaders:f.frames.length,ownedStoreReturnedCloses:f.frames.length,normalCloses:f.normalCloses,expectedUnknownCloses:f.unknownCloses,
 metadataPlans:f.plans.length,recoveryCollections:f.recoveryCollections,observationCollections:f.observationCollections,
 declaredSuccessDataInputs:f.successInputs,configurationRefusals:f.configRefusals,profileRefusals:f.profileRefusals,
 foreignGrantRefusals:f.foreignRefusals,catalogRefusals:f.catalogRefusals,postRootCollectionReadFailures:f.rootReadFailures,
 latchedUnavailableRefusals:f.unavailableRefusals,ownedQuarantineWrites:counts.reduce((n,c)=>n+c.quarantineWrites,0),
 ownedQuarantineReadbackConfirmations:counts.reduce((n,c)=>n+c.quarantineReadbackConfirmations,0),
 responseObservationsRetained:1,requestAttempts:0,transportCreated:false,authority:'NONE',serviceDelivery:'NOT_ESTABLISHED',
 realPaymentSigner:'DISABLED',networkCalls:0,syntheticSignatureOperations:0}));
}
before(()=>{
 f.store=CREATE({databasePath:PATH,allowedRoot:scratch,resourceUrl:FUNDING,custodyPolicy:POLICY});
 try{
 f.store.prepare(PAIR);f.store.fenceAttempt('PREPARED');a.equal(f.store.finishAttempt('BOUND').revision,3);
 for(const key of [A,B]){f.store.retainOriginalRequest({...key,originalRequestJson:original(key),originalBodyBase64:'',serviceResourceUrl:SERVICE});
 f.store.fenceOriginalDispatchIntent(key);}
 const r=f.store.recordOriginalResponseObservation({...A,responseJson:RESPONSE});a.equal(r.responseJson,RESPONSE);
 }finally{f.store.close();f.store=null;f.seedCloses++;}
 f.stamp=stamp();a.equal(f.stamp.epoch,1);a.equal(f.stamp.quarantines.length,0);
});
after(async()=>{
 try{for(const rec of f.plans)closePlan(rec);for(const rec of f.collections)closeCollection(rec);
 for(const rec of f.frames)if(!rec.started)await closeReader(rec);}
 finally{if(f.store!==null){f.store.close();f.store=null;}}
 a.deepEqual(sources(),sourceBefore);a.equal(f.stage,4);
});

test('V5 no-dispatch reader exposes observed response DATA without acquiring a transport capability',OPTIONS,async t=>{
 a.equal(f.stage,0);let getters=0,traps=0;
 await a.rejects(OPEN(),{code:P+'INVALID_CONFIGURATION'});f.configRefusals++;
 const extra=configuration();Object.defineProperty(extra,'requestImpl',{enumerable:true,get(){getters++;throw Error('FORBIDDEN_GETTER');}});
 await a.rejects(OPEN(extra),{code:P+'INVALID_CONFIGURATION'});f.configRefusals++;
 const proxy=new Proxy(configuration(),{ownKeys(){traps++;throw Error('FORBIDDEN_PROXY');}});
 await a.rejects(OPEN(proxy),{code:P+'INVALID_CONFIGURATION'});f.configRefusals++;
 await a.rejects(OPEN(configuration(),undefined),{code:P+'INVALID_CONFIGURATION'});f.configRefusals++;
 a.equal(getters,0);a.equal(traps,0);unchanged(f.stamp,stamp(),0);
 const bytes=wholeFile();await a.rejects(OPEN4(configuration()),{code:RP+'ACQUISITION_FAILED'});f.profileRefusals++;
 a.deepEqual(wholeFile(),bytes);unchanged(f.stamp,stamp(),0);
 await withReader(A,false,async reader=>{
 recovery(reader.readOriginalRecoveryState(A),A,false);a.equal(reader.readOriginal(A).originalRequestJson,original(A));
 const keys=reader.readOriginalRecoveryKeys();powerless(keys);a.deepEqual(keys.keys,[A]);
 a.throws(()=>reader.readOriginalRecoveryState(B),{code:OP+'FOREIGN_GRANT'});f.foreignRefusals++;
 a.equal(owner(reader).custodyQuarantine.writeAttempted,false);
 });
 const now=stamp();unchanged(f.stamp,now,1);f.stamp=now;f.stage=1;diagnostic(t,'V5_ATTENUATED_OBSERVED_RESPONSE_AND_NO_PROFILE_ADOPTION');
});

test('V5 response-bound plans and catalog retain declared success without action authority',OPTIONS,async t=>{
 a.equal(f.stage,1);
 await withReader(A,false,async reader=>{
 const p=plan(reader.createOriginalRecoveryPlan(A,observation(A,false)));planView(p.api.getSnapshot(),A,false);
 const changed=p.api.observe(observation(A,true));f.successInputs++;planView(changed,A,false);
 a.equal(changed.declaredPlan.terminal,'SUCCEEDED');a.equal(changed.declaredPlan.nextStep,'RECONCILE_FUNDING_AND_REQUEST');
 a.equal(changed.declaredPlan.fundingUncertain,true);a.equal(changed.declaredPlan.serviceUncertain,true);
 const q=plan(reader.createOriginalRecoveryStatePlan(A,observation(A,true)));f.successInputs++;
 planView(q.api.getSnapshot(),A,false);a.equal(q.api.getSnapshot().declaredPlan.nextStep,'READ_ORIGINAL_RESULT_ONLY');
 const c=collection(reader.createOriginalRecoveryCollection(initial(A)),false);collectionView(c.api.getSnapshot(),A,false);
 a.throws(()=>reader.createOriginalRecoveryCollection('[]'),{code:P+'INVALID_INPUT'});f.catalogRefusals++;
 const detached=closeCollection(c);a.equal(detached.unavailable,false);a.equal(detached.entries[0].recoveryPlan.closed,false);
 recovery(detached.entries[0].recoveryPlan.recoveryState,A,false);
 closePlan(p);closePlan(q);a.equal(reader.snapshot().resource.storeCloseAttempts,0);
 });
 const now=stamp();unchanged(f.stamp,now,1);f.stamp=now;f.stage=2;diagnostic(t,'V5_OBSERVED_RESPONSE_DOES_NOT_PROMOTE_DECLARED_SUCCESS');
});

test('V5 reader quarantines a selected unobserved intent and preserves UNKNOWN across normal reopen',OPTIONS,async t=>{
 a.equal(f.stage,2);
 await withReader(B,true,async reader=>{
 recovery(reader.readOriginalRecoveryState(B),B,true);const keys=reader.readOriginalRecoveryKeys();powerless(keys);a.deepEqual(keys.keys,[B]);
 a.equal(owner(reader).custodyQuarantine.writeAttempted,true);a.equal(owner(reader).counts.quarantineWrites,1);
 a.equal(owner(reader).counts.quarantineReadbackConfirmations,1);
 });
 const first=stamp();unchanged(f.stamp,first,1,true);f.stamp=first;
 await withReader(B,true,async reader=>{
 recovery(reader.readOriginalRecoveryState(B),B,true);a.equal(owner(reader).custodyQuarantine.writeAttempted,false);
 a.equal(owner(reader).counts.quarantineWrites,0);a.equal(owner(reader).counts.quarantineReadbackConfirmations,0);
 });
 const now=stamp();unchanged(f.stamp,now,1);f.stamp=now;f.stage=3;diagnostic(t,'V5_UNOBSERVED_INTENT_QUARANTINE_PERSISTS_WITHOUT_DISPATCH');
});

test('V5 reader root close fences observation collections and retains response history only',OPTIONS,async t=>{
 a.equal(f.stage,3);
 await withReader(A,false,async(reader,frame)=>{
 const rec=collection(reader.createOriginalRecoveryObservationCollection(initial(A)),true);
 collectionView(rec.api.getSnapshot(),A,false);
 const changed=rec.api.observeOriginal(A,observation(A,true));f.successInputs++;collectionView(changed,A,false);
 a.equal(changed.entries[0].recoveryPlan.declaredPlan.terminal,'SUCCEEDED');
 await closeReader(frame);
 a.throws(()=>rec.api.getSnapshot(),{code:RP+'CLOSED'});f.rootReadFailures++;
 a.throws(()=>rec.api.getSnapshot(),{code:P+'RECOVERY_OBSERVATION_COLLECTION_UNAVAILABLE'});f.unavailableRefusals++;
 const history=closeCollection(rec);a.equal(history.unavailable,true);a.equal(history.failureKind,'LIVE_READ_FAILED');
 a.equal(history.observationFailureKind,'WHOLE_REFRESH_FAILED');a.equal(history.observationCloseOutcome,'RETURNED');
 recovery(history.entries[0].recoveryPlan.recoveryState,A,false);
 a.throws(()=>rec.api.observeOriginal(A,observation(A,true)),{code:P+'RECOVERY_OBSERVATION_COLLECTION_CLOSED'});
 });
 const now=stamp();unchanged(f.stamp,now,1);f.stamp=now;a.equal(now.epoch,6);f.stage=4;
 diagnostic(t,'V5_ROOT_CLOSE_DETACHES_POWERLESS_RESPONSE_HISTORY');
});
