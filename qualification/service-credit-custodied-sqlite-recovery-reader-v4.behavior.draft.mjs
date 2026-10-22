// Selected V4 no-dispatch recovery adapter over ONE new private synthetic SQLite file.
// Explicit synthetic quarantine seeding is DATA setup, not an automatic-uncertainty or live-payment experiment.
// Existing owned V4 runner/plans/collections only; no transport, SDK, signing, backend, process restart or pilot.
import test,{before,after} from 'node:test';
import a from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,openSync,closeSync,fstatSync,readSync,constants} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const ENTRY="qualification/service-credit-custodied-sqlite-recovery-reader-v4.behavior.draft.mjs",SELF=fileURLToPath(import.meta.url),REPO=resolve(dirname(SELF),'..');
const SPECS=[
  [
    "src/service-credit-custodied-sequential-runner-core.js",
    15827,
    490,
    "640d578e99f9cb21cf8d79ec870e676e3d9087ebee831e795b1b120b9860ddfb"
  ],
  [
    "src/service-credit-custodied-sqlite-sequential-runner.js",
    22418,
    526,
    "a9e8abba40f9430ae3e31a32fe9e9f9b6c129d26d34a2f5f9984d2cf805da5c4"
  ],
  [
    "src/service-credit-custodied-sqlite-http-client.js",
    19683,
    530,
    "06366488e679272170847af4929db3b3f782774022f97c748530ec73f729f0bc"
  ],
  [
    "src/service-credit-custodied-http-client.js",
    11597,
    307,
    "822627be1876fb609bad582b767694a60022d7bf9d7375bb2e7fb961c034e4ab"
  ],
  [
    "src/service-credit-custodied-request-owner.js",
    44517,
    1136,
    "4f3f20195a0ec26be38e9b80e658dfccfd9477daff758a9717e819f3b55c04b2"
  ],
  [
    "src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js",
    64917,
    1687,
    "db4d3aca8c039e3433e49f6bafe42cbc4973e0f9478500dbe6cf36f53773232d"
  ],
  [
    "src/service-credit-http-execute-dispatch.js",
    27034,
    770,
    "254ba8eef5ea5efb3a1b901be09e9cb33afbc3cfcf63789ca4a23316b6180d1b"
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
    3987,
    97,
    "beda55abe29c986c4b79f5870ba13234fa39495150dd3edd3a284e4bc64ad843"
  ]
];
a.equal(process.argv.length,2);a.equal(process.argv[1],SELF);
a.equal(process.versions.node,'24.19.0');a.equal(process.platform,'darwin');a.equal(process.arch,'arm64');
a.equal(process.env.P2_READER_V4_OPT_IN,'synthetic-native-no-dispatch-reader-v4-only');
const PINS=JSON.parse(process.env.P2_READER_V4_PINS),scratch=process.env.SPV_TASK_SCRATCH;
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
    total+=used; a.ok(total<=393216); a.equal(used,p.bytes); a.equal(sha(bytes),p.sha256);
    a.equal(bytes.filter(n=>n===10).length,p.LF);
    if(index<SPECS.length) a.deepEqual([p.path,p.bytes,p.LF,p.sha256],SPECS[index]);
    return {path:p.path,bytes:p.bytes,sha256:p.sha256,identity:p.identity};
  });
}
const sourceBefore=sources();





const NAME = 'reader-v4.sqlite', PATH = join(scratch,NAME);
a.throws(() => lstatSync(PATH), {code:'ENOENT'});
const stores = await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const readers = await import('../src/service-credit-custodied-sqlite-recovery-reader.js');
const {DatabaseSync} = await import('node:sqlite');
const CREATE = stores.createZenonFundingPayerRecoveryCustodyQuarantineSqliteStoreV4;
const OPEN = readers.openServiceCreditCustodiedSqliteRecoveryReaderV4;
const P = 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_', XP = 'SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_';
const FUNDING = 'https://reader-v4.invalid/funding', SERVICE = 'https://reader-v4.invalid/service-credit/v1/execute';
const HASH = 'a'.repeat(64), KEY = Object.freeze({grantId:'grant-reader',requestId:'original-reader'});
const POLICY = Object.freeze({policyVersion:1,maxRequests:2,serviceResourceUrl:SERVICE});
const ORIGINAL_JSON = JSON.stringify({modelVersion:1,...KEY,method:'POST',routeId:'service-credit.execute.v1',
 canonicalBodyDigest:'sha256:'+sha(Buffer.alloc(0)),selectedContentType:'application/json',maxCostUnits:1});
const METHODS = ['readOriginal','readOriginalRecoveryState','readOriginalRecoveryKeys','createOriginalRecoveryPlan',
 'createOriginalRecoveryStatePlan','createOriginalRecoveryCollection','createOriginalRecoveryObservationCollection','close','snapshot'];
const OPTIONS = {timeout:5000,concurrency:false};
const f = {store:null,current:null,frames:[],plans:[],collections:[],stamp:null,stage:0,seedCloses:0,
 configRefusals:0,catalogRefusals:0,rootReadFailures:0,unavailableRefusals:0,successData:0,unknownCloses:0,
 recoveryCollections:0,observationCollections:0};
function frozen(value) {
 if(value!==null&&typeof value==='object'){a.equal(Object.isFrozen(value),true);for(const v of Object.values(value))frozen(v);}
}
function powerless(value,field='authority') {
 frozen(value);a.equal(value[field],'NONE');a.equal(value.qualification,'UNQUALIFIED');
 for(const k of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed'])a.equal(value[k],false);
}
function configuration() {
 return {databasePath:PATH,allowedRoot:scratch,fundingResourceUrl:FUNDING,custodyPolicy:POLICY,
  selectedGrantId:KEY.grantId,deadlineMs:2000};
}
function pair() {
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
const PAIR = pair();
const observation = (fundingStatus,serviceStatus) => JSON.stringify({viewVersion:1,paymentHash:HASH,
 requestId:KEY.requestId,fundingStatus,serviceStatus});
const UNKNOWN = observation('UNKNOWN','OUTCOME_UNKNOWN'), SUCCESS = observation('INCLUDED','SUCCEEDED');
const INITIAL = JSON.stringify([{...KEY,observationJson:UNKNOWN}]);
function stamp() {
 a.equal(f.current,null);
 const st=lstatSync(PATH,{bigint:true});a.ok(st.isFile()&&!st.isSymbolicLink());
 a.equal(st.uid,BigInt(process.getuid()));a.equal(st.dev,scratchStat.dev);a.equal(st.nlink,1n);a.equal(st.mode&0o777n,0o600n);
 const db=new DatabaseSync(PATH,{readOnly:true,allowExtension:false,enableDoubleQuotedStringLiterals:false,
  enableForeignKeyConstraints:true,timeout:0});
 try {
  const value={
   epoch:db.prepare('SELECT owner_epoch FROM payer_recovery_meta WHERE singleton=1').get().owner_epoch,
   meta:db.prepare('SELECT singleton,resource_url FROM payer_recovery_meta ORDER BY singleton').all(),
   state:db.prepare('SELECT * FROM payer_recovery_state ORDER BY singleton').all(),
   policy:db.prepare('SELECT * FROM original_request_custody_policy').all(),
   originals:db.prepare('SELECT * FROM original_service_requests ORDER BY grant_id,request_id').all(),
   intents:db.prepare('SELECT * FROM original_dispatch_intents ORDER BY grant_id,request_id').all(),
   quarantines:db.prepare('SELECT * FROM original_custody_quarantines ORDER BY grant_id').all(),
   schema:db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all(),
   userVersion:db.prepare('PRAGMA user_version').get().user_version,
   applicationId:db.prepare('PRAGMA application_id').get().application_id,
  };
  a.equal(value.userVersion,4);a.equal(value.applicationId,0x5a505252);
  for(const k of ['state','policy','originals','intents','quarantines'])a.equal(value[k].length,1);
  a.equal(JSON.parse(value.originals[0].envelope).originalRequestJson,ORIGINAL_JSON);
  a.equal(JSON.parse(value.intents[0].envelope).fundingRevision,3);
  const q=JSON.parse(value.quarantines[0].envelope);
  a.equal(q.grantId,KEY.grantId);a.equal(q.paymentHash,HASH);a.equal(q.status,'CUSTODY_OUTCOME_UNKNOWN');a.equal(q.authority,'NONE');
  const funding=JSON.parse(value.state[0].envelope);
  a.equal(funding.challengeHeader,PAIR.challenge.paymentRequiredHeader);a.equal(funding.paymentHeader,PAIR.paymentSignatureHeader);
  return value;
 } finally {db.close();}
}
function unchanged(before,after,epochs) {
 a.equal(after.epoch,before.epoch+epochs);
 for(const k of Object.keys(before))if(k!=='epoch')a.deepEqual(after[k],before[k]);
}
function owner(reader) {return reader.snapshot().runner.client.owner;}
function surface(reader) {
 frozen(reader);a.deepEqual(Reflect.ownKeys(reader),METHODS);
 for(const fn of Object.values(reader)){a.equal(typeof fn,'function');a.equal(Object.isFrozen(fn),true);}
 for(const k of ['submitOriginal','runOriginals','requestImpl','root','store','owner','sign','pay'])a.equal(Object.hasOwn(reader,k),false);
 const v=reader.snapshot();a.equal(v.unknown,true);a.equal(v.runner.storeOwnership,'OWNED_EXISTING_V4_CUSTODY_QUARANTINE');
 a.equal(v.runner.attempted,0);a.equal(v.runner.planned,0);a.equal(v.runner.runClaimed,false);
 a.equal(v.runner.client.lastTransport,null);a.equal(owner(reader).custodyQuarantine.status,'PERSISTED_UNKNOWN');
 a.equal(owner(reader).custodyQuarantine.writeAttempted,false);
 a.equal(owner(reader).counts.quarantineWrites,0);a.equal(owner(reader).counts.quarantineReadbackConfirmations,0);
}
function recovery(state) {
 frozen(state);a.equal(state.authority,'NONE');a.equal(state.qualification,'UNQUALIFIED');
 a.equal(state.funding.status,'BOUND');a.equal(state.funding.revision,3);a.equal(state.funding.paymentHash,HASH);
 a.equal(state.original.originalRequestJson,ORIGINAL_JSON);a.equal(state.original.originalBodyBase64,'');
 a.equal(state.dispatchStatus,'POSSIBLY_ATTEMPTED');a.notEqual(state.dispatchIntent,null);
 a.equal(state.uncertainty.custody,true);a.equal(state.uncertainty.submission,false);
}
function planView(value) {
 powerless(value);a.equal(value.nextStep,'RECONCILIATION_REQUIRED');recovery(value.recoveryState);
 a.equal(value.currentFundingUncertain,false);powerless(value.declaredPlan,'authorization');
}
function collectionView(value) {
 powerless(value);a.equal(value.nextStep,'RECONCILIATION_REQUIRED');a.deepEqual(value.keys,[KEY]);
 a.equal(value.uncertainty.custody,true);a.equal(value.entries.length,1);
 a.deepEqual(value.entries[0].key,KEY);planView(value.entries[0].recoveryPlan);
}
function newPlan(api) {const rec={api,closed:false};f.plans.push(rec);return rec;}
function closePlan(rec) {
 if(rec.closed)return;
 const value=rec.api.close();powerless(value);a.equal(value.closed,true);a.equal(value.nextStep,'LOCALLY_CLOSED');
 a.equal(rec.api.close(),value);a.equal(rec.api.getSnapshot(),value);rec.closed=true;
}
function newCollection(api,observationFacade) {
 const rec={api,closed:false,observationFacade};f.collections.push(rec);
 if(observationFacade)f.observationCollections++;else f.recoveryCollections++;
 return rec;
}
function closeCollection(rec) {
 if(rec.closed)return rec.history;
 const value=rec.api.close();powerless(value);a.equal(value.closed,true);a.equal(value.snapshotKind,'DETACHED_HISTORICAL');
 a.equal(value.nextStep,'LOCALLY_CLOSED');a.equal(value.childCloseAttempts,1);a.equal(value.childCloseOutcome,'RETURNED');
 a.equal(value.entries[0].recoveryPlan.closed,false);
 a.equal(rec.api.close(),value);a.equal(rec.api.getSnapshot(),value);rec.closed=true;rec.history=value;return value;
}
async function closeReader(rec) {
 if(rec.started){a.equal(rec.closed,true);return;}
 rec.started=true;
 const p=rec.reader.close();a.equal(rec.reader.close(),p);
 await a.rejects(p,{code:XP+'CHILD_OUTCOME_UNKNOWN'});f.unknownCloses++;
 const v=rec.reader.snapshot();a.equal(v.close.outcome,'CHILD_UNKNOWN');
 a.equal(v.resource.phase,'RELEASED');a.equal(v.resource.slotHeld,false);
 a.equal(v.resource.storeCloseAttempts,1);a.equal(v.resource.storeCloseOutcome,'RETURNED');
 a.equal(v.runner.closeCalls,1);a.equal(v.runner.queuedReferences,0);a.equal(v.unknown,true);
 a.equal(rec.reader.close(),p);a.throws(()=>rec.reader.readOriginalRecoveryState(KEY),{code:XP+'CLOSED'});
 rec.closed=true;f.current=null;
}
async function withReader(action) {
 a.equal(f.current,null);const reader=await OPEN(configuration()),rec={reader,started:false,closed:false};
 f.frames.push(rec);f.current=rec;surface(reader);
 try{return await action(reader,rec);}finally{await closeReader(rec);}
}
function diagnostic(t,scenario) {
 a.equal(f.current,null);
 for(const rec of f.frames){a.equal(rec.closed,true);surface(rec.reader);}
 t.diagnostic(JSON.stringify({kind:'P2_NO_DISPATCH_READER_V4',version:1,scenario,
  nativeSqliteFiles:1,seedStoreReturnedCloses:f.seedCloses,ownedReaders:f.frames.length,
  ownedStoreReturnedCloses:f.frames.length,expectedUnknownCloses:f.unknownCloses,
  metadataPlans:f.plans.length,recoveryCollections:f.recoveryCollections,observationCollections:f.observationCollections,
  declaredSuccessDataInputs:f.successData,configurationRefusals:f.configRefusals,catalogRefusals:f.catalogRefusals,
  postRootReadFailures:f.rootReadFailures,latchedUnavailableRefusals:f.unavailableRefusals,
  ownedQuarantineWrites:0,ownedQuarantineReadbackConfirmations:0,requestAttempts:0,transportCreated:false,
  authority:'NONE',serviceDelivery:'NOT_ESTABLISHED',realPaymentSigner:'DISABLED',networkCalls:0,syntheticSignatureOperations:0}));
}
before(()=>{
 f.store=CREATE({databasePath:PATH,allowedRoot:scratch,resourceUrl:FUNDING,custodyPolicy:POLICY});
 try{
  f.store.prepare(PAIR);f.store.fenceAttempt('PREPARED');a.equal(f.store.finishAttempt('BOUND').revision,3);
  f.store.retainOriginalRequest({...KEY,originalRequestJson:ORIGINAL_JSON,originalBodyBase64:'',serviceResourceUrl:SERVICE});
  f.store.fenceOriginalDispatchIntent(KEY);
  a.equal(f.store.latchOriginalRequestCustodyQuarantine({grantId:KEY.grantId}).status,'CUSTODY_OUTCOME_UNKNOWN');
 }finally{f.store.close();f.store=null;f.seedCloses++;}
 f.stamp=stamp();a.equal(f.stamp.epoch,1);
});
after(async()=>{
 try{
  for(const rec of f.plans)closePlan(rec);
  for(const rec of f.collections)closeCollection(rec);
  for(const rec of f.frames)if(!rec.started)await closeReader(rec);
 }finally{if(f.store!==null){f.store.close();f.store=null;}}
 a.deepEqual(sources(),sourceBefore);a.equal(f.stage,3);
});

test('V4 no-dispatch reader exposes only owned recovery operations and preserves UNKNOWN close',OPTIONS,async t=>{
 a.equal(f.stage,0);let getters=0,traps=0;
 await a.rejects(OPEN(),{code:P+'INVALID_CONFIGURATION'});f.configRefusals++;
 const extra=configuration();Object.defineProperty(extra,'requestImpl',{enumerable:true,get(){getters++;throw Error('FORBIDDEN_GETTER');}});
 await a.rejects(OPEN(extra),{code:P+'INVALID_CONFIGURATION'});f.configRefusals++;
 const proxy=new Proxy(configuration(),{ownKeys(){traps++;throw Error('FORBIDDEN_PROXY');}});
 await a.rejects(OPEN(proxy),{code:P+'INVALID_CONFIGURATION'});f.configRefusals++;
 a.equal(getters,0);a.equal(traps,0);unchanged(f.stamp,stamp(),0);
 await withReader(async reader=>{
  recovery(reader.readOriginalRecoveryState(KEY));
  const keys=reader.readOriginalRecoveryKeys();powerless(keys);a.deepEqual(keys.keys,[KEY]);
  const rec=newPlan(reader.createOriginalRecoveryPlan(KEY,UNKNOWN));planView(rec.api.getSnapshot());closePlan(rec);
 });
 const now=stamp();unchanged(f.stamp,now,1);f.stamp=now;f.stage=1;
 diagnostic(t,'V4_ATTENUATED_SURFACE_AND_CACHED_UNKNOWN_CLOSE');
});

test('V4 reader plans and whole-catalog collection keep declared success powerless',OPTIONS,async t=>{
 a.equal(f.stage,1);
 await withReader(async reader=>{
  const p=newPlan(reader.createOriginalRecoveryStatePlan(KEY,SUCCESS));f.successData++;
  const value=p.api.getSnapshot();planView(value);a.equal(value.declaredPlan.terminal,'SUCCEEDED');
  a.equal(value.declaredPlan.nextStep,'READ_ORIGINAL_RESULT_ONLY');
  const rec=newCollection(reader.createOriginalRecoveryCollection(INITIAL),false);
  collectionView(rec.api.getSnapshot());
  a.throws(()=>reader.createOriginalRecoveryCollection('[]'),{code:P+'INVALID_INPUT'});f.catalogRefusals++;
  collectionView(rec.api.getSnapshot());
  const detached=closeCollection(rec);a.equal(detached.unavailable,false);
  // Diagnostic-child close is not root/native close.
  a.equal(reader.snapshot().resource.storeCloseAttempts,0);recovery(reader.readOriginalRecoveryState(KEY));
  closePlan(p);
 });
 const now=stamp();unchanged(f.stamp,now,1);f.stamp=now;f.stage=2;
 diagnostic(t,'V4_DECLARED_SUCCESS_DOES_NOT_CLEAR_OWNED_QUARANTINE');
});

test('V4 observation collection latches after root close and retains detached history only',OPTIONS,async t=>{
 a.equal(f.stage,2);
 await withReader(async(reader,frame)=>{
  const rec=newCollection(reader.createOriginalRecoveryObservationCollection(INITIAL),true);
  collectionView(rec.api.getSnapshot());
  const value=rec.api.observeOriginal(KEY,SUCCESS);f.successData++;collectionView(value);
  a.equal(value.entries[0].recoveryPlan.declaredPlan.terminal,'SUCCEEDED');
  await closeReader(frame);
  a.throws(()=>rec.api.getSnapshot(),{code:XP+'CLOSED'});f.rootReadFailures++;
  a.throws(()=>rec.api.getSnapshot(),{code:P+'RECOVERY_OBSERVATION_COLLECTION_UNAVAILABLE'});f.unavailableRefusals++;
  const detached=closeCollection(rec);
  a.equal(detached.unavailable,true);a.equal(detached.failureKind,'LIVE_READ_FAILED');
  a.equal(detached.observationFailureKind,'WHOLE_REFRESH_FAILED');a.equal(detached.observationCloseOutcome,'RETURNED');
  a.equal(detached.entries[0].recoveryPlan.recoveryState.uncertainty.custody,true);
  a.throws(()=>rec.api.observeOriginal(KEY,SUCCESS),{code:P+'RECOVERY_OBSERVATION_COLLECTION_CLOSED'});
  a.throws(()=>rec.api.observeOriginal({grantId:KEY.grantId,requestId:'foreign'},SUCCESS),
   {code:P+'RECOVERY_OBSERVATION_COLLECTION_MEMBER_NOT_FOUND'});
 });
 const now=stamp();unchanged(f.stamp,now,1);f.stamp=now;
 a.equal(f.stamp.epoch,4);a.equal(f.unknownCloses,3);f.stage=3;
 diagnostic(t,'V4_ROOT_CLOSE_FENCES_OBSERVATIONS_WITHOUT_RETRY_OR_AUTHORITY');
});
