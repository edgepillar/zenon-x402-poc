/*
 * CATALOG-BOUND OWNED RECOVERY COLLECTION / INTERNAL INTERFACE DRAFT / NOT_RUN.
 * One fresh core phase, one authored test, finite declared synchronous children.
 * This imports the actual internal component used by the V3 owned binding and
 * the actual pure declared planner. It does not import/open SQLite or the owned
 * runner and does not qualify actual backend fault, native close or concurrency.
 * Exact counters cover all-or-nothing catalog/child/catalog publication, full
 * envelope/intent identity, coherent revisions, UNKNOWN/history separation,
 * fail-closed no-retry after fault, partial construction release and cached close.
 * Synthetic originals are literal source DATA; observations supply no authority.
 * Child close counters are diagnostic only; no root/store/transport/submit/close
 * capability enters the actual core. Source guards precede repository imports.
 * NativeHandles0 means no SQLite/store handles, not zero OS file descriptors.
 * No Node, parser, import, test or task allocation occurred during authoring.
 */
import test from 'node:test';
import { equal as q, deepEqual as same, ok, throws } from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { closeSync, constants as FS, fstatSync, lstatSync, mkdirSync, openSync,
 readSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';
import { setTimeout as delay, clearTimeout as cancelDelay } from 'node:timers';
q(process.argv.length, 3);
q(process.versions.node, '24.19.0'); q(process.platform, 'darwin');
ok(process.execArgv.includes('--no-addons'));
ok(process.execArgv.includes('--disallow-code-generation-from-strings'));
q(process.execArgv.some(v => /^--(?:experimental-permission|permission|allow-fs)(?:=|-|$)/.test(v)), false);
const phase = process.argv[2], uid = BigInt(process.getuid());
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const stamp = s => [s.dev,s.ino,s.uid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs];
const APPLY = Reflect.apply, THEN = Promise.prototype.then;
function physicalDirectory(path) {
 q(typeof path, 'string'); ok(path.length > 0 && path.length < 3800);
 ok(isAbsolute(path) && !path.includes('\0')); q(resolve(path), path);
 let current = path;
 for (let depth = 0; ; depth++) {
  ok(depth < 128); const s = lstatSync(current, { bigint: true });
  ok(s.isDirectory()); q(s.isSymbolicLink(), false); q(realpathSync(current), current);
  const parent = dirname(current); if (parent === current) break; current = parent;
 }
 return lstatSync(path, { bigint: true });
}
function privateDirectory(path, device) {
 const s = physicalDirectory(path); q(s.uid, uid); q(s.mode & 0o7777n, 0o700n);
 if (device !== undefined) q(s.dev, device); return s;
}
function boundedBytes(path, cap, mode, device) {
 physicalDirectory(dirname(path)); q(realpathSync(path), path);
 const pre = lstatSync(path, { bigint: true });
 ok(pre.isFile()); q(pre.isSymbolicLink(), false); q(pre.uid, uid);
 q(pre.dev, device); q(pre.nlink, 1n); q(pre.mode & 0o7777n, BigInt(mode));
 ok(pre.size >= 0n && pre.size <= BigInt(cap)); ok(FS.O_NOFOLLOW);
 const fd = openSync(path, FS.O_RDONLY | FS.O_NOFOLLOW);
 let bytes;
 try {
  same(stamp(fstatSync(fd, { bigint: true })), stamp(pre));
  bytes = Buffer.alloc(Number(pre.size)); let at = 0;
  while (at < bytes.length) { const n = readSync(fd,bytes,at,bytes.length-at,at); ok(n > 0); at += n; }
  q(readSync(fd,Buffer.alloc(1),0,1,bytes.length),0);
  same(stamp(fstatSync(fd, { bigint: true })), stamp(pre));
 } finally { closeSync(fd); }
 same(stamp(lstatSync(path, { bigint: true })), stamp(pre)); q(realpathSync(path), path);
 return { bytes, stat: pre };
}
const scratch = process.env.SPV_TASK_SCRATCH, scratchId = privateDirectory(scratch);
const fixtureRoot = process.env.SPV_SQLITE_FIXTURE_ROOT;
q(process.env.PATH, '/usr/bin:/bin'); q(process.env.LC_ALL, 'C');
q(process.env.TMPDIR, fixtureRoot); q(process.env.SQLITE_TMPDIR, fixtureRoot);
q(process.env.NODE_TEST_WORKER_ID, '1');
q(process.env.__CF_USER_TEXT_ENCODING, '0x' + Number(uid).toString(16).toUpperCase() + ':0:0');
const baseEnv = ['PATH','LC_ALL','__CF_USER_TEXT_ENCODING','SPV_TASK_SCRATCH',
 'SPV_SQLITE_FIXTURE_ROOT','TMPDIR','SQLITE_TMPDIR','NODE_TEST_WORKER_ID'];
function sourceGuard(filename, prefix) {
 const path = fileURLToPath(import.meta.url);
 q(path, join(scratch,'repo/qualification',filename));
 const self = boundedBytes(path,65536,0o400,scratchId.dev).bytes;
 ok(self.length > 0 && self.every(v => v < 128) && self.at(-1) === 10);
 ok(self.toString('ascii').startsWith(prefix)); ok(self.toString('ascii').split('\n').length-1 <= 2000);
 const guarded = new Map();
 for (const [relative,length,LF,hash] of specs) {
  const url = new URL(relative,import.meta.url);
  const bytes = boundedBytes(fileURLToPath(url),65536,0o400,scratchId.dev).bytes;
  q(bytes.length,length); q(sha(bytes),hash);
  ok(bytes.every(v => v < 128) && bytes.at(-1) === 10);
  const text = bytes.toString('ascii'); q(text.split('\n').length-1,LF);
  guarded.set(relative.slice(3),{ url:url.href, text });
 }
 q(guarded.size,6);
 const packageData = JSON.parse(guarded.get('package.json').text);
 q(packageData.type,'module'); q(packageData.engines.node,'>=24');
 return guarded;
}
function deepFrozen(value, depth = 0) {
 ok(depth < 12);
 if (value === null || typeof value !== 'object') return;
 q(types.isProxy(value),false); q(types.isPromise(value),false); ok(Object.isFrozen(value));
 for (const d of Object.values(Object.getOwnPropertyDescriptors(value))) {
  ok(Object.hasOwn(d,'value')); q(d.writable,false); q(d.configurable,false); deepFrozen(d.value,depth+1);
 }
}
function canonical(v) {
 if (v === null || typeof v !== 'object') return JSON.stringify(v);
 if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
 return '{' + Object.keys(v).sort().map(k => JSON.stringify(k)+':'+canonical(v[k])).join(',') + '}';
}
async function observe(promise) {
 ok(types.isPromise(promise)); q(Object.getPrototypeOf(promise),Promise.prototype);
 let timer;
 const seen = APPLY(THEN,promise,[value=>({ok:true,value}),error=>({ok:false,error})]);
 const timeout = new Promise((yes,no) => { timer = delay(()=>no(new Error('OBSERVATION_UNKNOWN_NO_CANCEL')),2000); });
 try { return await Promise.race([seen,timeout]); } finally { cancelDelay(timer); }
}

const EXPECTED_ROWS=[["arity",[0,0,0,0],false,"NO_COLLECTION"],["json",[0,0,0,0],false,"NO_COLLECTION"],["canonical",[0,0,0,0],false,"NO_COLLECTION"],["field",[0,0,0,0],false,"NO_COLLECTION"],["duplicate",[0,0,0,0],false,"NO_COLLECTION"],["foreign",[0,0,0,0],false,"NO_COLLECTION"],["order",[1,0,0,0],false,"NO_COLLECTION"],["missing",[1,0,0,0],false,"NO_COLLECTION"],["extra",[1,0,0,0],false,"NO_COLLECTION"],["nine",[0,0,0,0],false,"NO_COLLECTION"],["units",[0,0,0,0],false,"NO_COLLECTION"],["utf8",[0,0,0,0],false,"NO_COLLECTION"],["observation",[0,0,0,0],false,"NO_COLLECTION"],["intent",[4,2,4,2],false,"RETURNED"],["empty",[4,0,0,0],false,"RETURNED"],["eight",[4,8,16,8],false,"RETURNED"],["revisions",[8,2,8,2],false,"RETURNED"],["empty-history",[4,0,0,0],false,"RETURNED"],["historical",[4,2,4,2],false,"RETURNED"],["partial-build",[1,2,0,1],false,"NO_COLLECTION"],["cleanup-unknown",[1,2,0,1],false,"NO_COLLECTION"],["initial-view",[1,2,2,2],false,"NO_COLLECTION"],["initial-bookend",[2,2,2,2],false,"NO_COLLECTION"],["partial-dto",[1,2,0,1],false,"NO_COLLECTION"],["child-shape",[1,2,0,2],false,"NO_COLLECTION"],["child-get",[1,2,0,2],false,"NO_COLLECTION"],["catalog-limit",[1,0,0,0],false,"NO_COLLECTION"],["initial-read",[1,0,0,0],false,"NO_COLLECTION"],["membership",[5,2,4,2],true,"RETURNED"],["bookend-member",[6,2,6,2],true,"RETURNED"],["regression",[5,2,4,2],true,"RETURNED"],["identity",[5,2,4,2],true,"RETURNED"],["same-revision",[5,2,4,2],true,"RETURNED"],["child-view",[5,2,6,2],true,"RETURNED"],["child-uncertainty",[5,2,6,2],true,"RETURNED"],["original",[5,2,6,2],true,"RETURNED"],["intent-lost",[5,2,5,2],true,"RETURNED"],["intent-added",[5,2,5,2],true,"RETURNED"],["partial-read",[5,2,6,2],true,"RETURNED"],["root-read",[5,2,4,2],true,"RETURNED"],["close-unknown",[4,2,4,2],true,"UNKNOWN"]];

q(phase,'core');
q(fixtureRoot,join(scratch,'recovery-collection-core-fixtures'));
const fixtureId=privateDirectory(fixtureRoot,scratchId.dev);
same(readdirSync(fixtureRoot),[]);
same(Object.keys(process.env).sort(),baseEnv.slice().sort());
const specs=[["../src/service-credit-custodied-recovery-collection-core.js",13794,306,"51d06da70ecccd0cf8b38d650367d1ae903ea86010a5ebeadb682af98e4b890b"],["../src/service-credit-custodied-sequential-runner-core.js",15288,479,"36c99342bf9e47559e39535aefcde78acbbdd7fb210d42a77dbbb93c2fd9f8ff"],["../src/service-credit-original-request-custody-contract.js",14051,356,"fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915"],["../src/service-credit-pilot-client-plan.js",7483,181,"73ee3d739de85150039e733234cd0761c228d68de040d1e126902e808a259ac6"],["../src/service-credit-pilot-status-view.js",3202,60,"cf3822d8b9ec4eb4772452ed1888b96d398fd87c1ead44cd155a5acc1a6b66ed"],["../package.json",1413,40,"8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"]];
const guarded=sourceGuard('service-credit-custodied-recovery-collection-core.draft.mjs',
 '/*\n * CATALOG-BOUND OWNED RECOVERY COLLECTION / INTERNAL INTERFACE DRAFT / NOT_RUN.\n');
const K=await import(guarded.get('src/service-credit-custodied-recovery-collection-core.js').url);
const C=await import(guarded.get('src/service-credit-original-request-custody-contract.js').url);
const P=await import(guarded.get('src/service-credit-pilot-client-plan.js').url);
const CREATE=K.createServiceCreditCustodiedRecoveryCollectionCore;
const ORIGINALS=[{"custodyVersion":1,"profile":"service-credit.execute.v1.empty-body","originalRequestJson":"{\"modelVersion\":1,\"grantId\":\"grant.discovery.own\",\"requestId\":\"request.discovery.a\",\"method\":\"POST\",\"routeId\":\"service-credit.execute.v1\",\"canonicalBodyDigest\":\"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\",\"selectedContentType\":\"application/json\",\"maxCostUnits\":7}","originalBodyBase64":"","serviceResourceUrl":"https://owned-plan.example.test/service-credit/v1/execute","fundingResourceUrl":"https://owned-plan.example.test/funding","paymentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","network":"zenon:testnet","grantId":"grant.discovery.own","requestId":"request.discovery.a","checksum":"sha256:3bcb4398b5b7ebb48c2e9201dbdd55a1437d23f40f8ed41f0811f0590cd107d5"},{"custodyVersion":1,"profile":"service-credit.execute.v1.empty-body","originalRequestJson":"{\"modelVersion\":1,\"grantId\":\"grant.discovery.own\",\"requestId\":\"request.discovery.b\",\"method\":\"POST\",\"routeId\":\"service-credit.execute.v1\",\"canonicalBodyDigest\":\"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\",\"selectedContentType\":\"application/json\",\"maxCostUnits\":7}","originalBodyBase64":"","serviceResourceUrl":"https://owned-plan.example.test/service-credit/v1/execute","fundingResourceUrl":"https://owned-plan.example.test/funding","paymentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","network":"zenon:testnet","grantId":"grant.discovery.own","requestId":"request.discovery.b","checksum":"sha256:f56f4bc7e4c86170293a1eeb8ee3a735b27e66eb99a3f4c338b524f9c1bb06be"},{"custodyVersion":1,"profile":"service-credit.execute.v1.empty-body","originalRequestJson":"{\"modelVersion\":1,\"grantId\":\"grant.discovery.own\",\"requestId\":\"request.discovery.c\",\"method\":\"POST\",\"routeId\":\"service-credit.execute.v1\",\"canonicalBodyDigest\":\"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\",\"selectedContentType\":\"application/json\",\"maxCostUnits\":7}","originalBodyBase64":"","serviceResourceUrl":"https://owned-plan.example.test/service-credit/v1/execute","fundingResourceUrl":"https://owned-plan.example.test/funding","paymentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","network":"zenon:testnet","grantId":"grant.discovery.own","requestId":"request.discovery.c","checksum":"sha256:51d391677d41c5cd67550be4c7d880a94833cccf3dccf0abfe038ebcbd6d6323"},{"custodyVersion":1,"profile":"service-credit.execute.v1.empty-body","originalRequestJson":"{\"modelVersion\":1,\"grantId\":\"grant.discovery.own\",\"requestId\":\"request.discovery.d\",\"method\":\"POST\",\"routeId\":\"service-credit.execute.v1\",\"canonicalBodyDigest\":\"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\",\"selectedContentType\":\"application/json\",\"maxCostUnits\":7}","originalBodyBase64":"","serviceResourceUrl":"https://owned-plan.example.test/service-credit/v1/execute","fundingResourceUrl":"https://owned-plan.example.test/funding","paymentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","network":"zenon:testnet","grantId":"grant.discovery.own","requestId":"request.discovery.d","checksum":"sha256:424ccd9e008c21c3fb1284d03dc9a1962bf518a105d9b6b7502f9d4698592393"},{"custodyVersion":1,"profile":"service-credit.execute.v1.empty-body","originalRequestJson":"{\"modelVersion\":1,\"grantId\":\"grant.discovery.own\",\"requestId\":\"request.discovery.e\",\"method\":\"POST\",\"routeId\":\"service-credit.execute.v1\",\"canonicalBodyDigest\":\"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\",\"selectedContentType\":\"application/json\",\"maxCostUnits\":7}","originalBodyBase64":"","serviceResourceUrl":"https://owned-plan.example.test/service-credit/v1/execute","fundingResourceUrl":"https://owned-plan.example.test/funding","paymentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","network":"zenon:testnet","grantId":"grant.discovery.own","requestId":"request.discovery.e","checksum":"sha256:f34852ddfbf26c8ab72c3d8985862e83872ebcfea8b6efd19768d65e89614962"},{"custodyVersion":1,"profile":"service-credit.execute.v1.empty-body","originalRequestJson":"{\"modelVersion\":1,\"grantId\":\"grant.discovery.own\",\"requestId\":\"request.discovery.f\",\"method\":\"POST\",\"routeId\":\"service-credit.execute.v1\",\"canonicalBodyDigest\":\"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\",\"selectedContentType\":\"application/json\",\"maxCostUnits\":7}","originalBodyBase64":"","serviceResourceUrl":"https://owned-plan.example.test/service-credit/v1/execute","fundingResourceUrl":"https://owned-plan.example.test/funding","paymentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","network":"zenon:testnet","grantId":"grant.discovery.own","requestId":"request.discovery.f","checksum":"sha256:b391290f7491499e1e7fdbba8201e19901ae79d79dd339bbd08ce0d54a6e404f"},{"custodyVersion":1,"profile":"service-credit.execute.v1.empty-body","originalRequestJson":"{\"modelVersion\":1,\"grantId\":\"grant.discovery.own\",\"requestId\":\"request.discovery.g\",\"method\":\"POST\",\"routeId\":\"service-credit.execute.v1\",\"canonicalBodyDigest\":\"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\",\"selectedContentType\":\"application/json\",\"maxCostUnits\":7}","originalBodyBase64":"","serviceResourceUrl":"https://owned-plan.example.test/service-credit/v1/execute","fundingResourceUrl":"https://owned-plan.example.test/funding","paymentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","network":"zenon:testnet","grantId":"grant.discovery.own","requestId":"request.discovery.g","checksum":"sha256:6139bdec1625330d8d80c4d37f4ad1e4fe042887a48245539ed0fc2f86965539"},{"custodyVersion":1,"profile":"service-credit.execute.v1.empty-body","originalRequestJson":"{\"modelVersion\":1,\"grantId\":\"grant.discovery.own\",\"requestId\":\"request.discovery.h\",\"method\":\"POST\",\"routeId\":\"service-credit.execute.v1\",\"canonicalBodyDigest\":\"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\",\"selectedContentType\":\"application/json\",\"maxCostUnits\":7}","originalBodyBase64":"","serviceResourceUrl":"https://owned-plan.example.test/service-credit/v1/execute","fundingResourceUrl":"https://owned-plan.example.test/funding","paymentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","network":"zenon:testnet","grantId":"grant.discovery.own","requestId":"request.discovery.h","checksum":"sha256:ae8f4abed6a4560bb97fdfc9bba82511047bb5dc04ab522103a56d5aa041f5f5"}];
const INTENT={"intentVersion":1,"profile":"service-credit.execute.v1.empty-body","state":"INTENT_RECORDED","grantId":"grant.discovery.own","requestId":"request.discovery.a","originalChecksum":"sha256:3bcb4398b5b7ebb48c2e9201dbdd55a1437d23f40f8ed41f0811f0590cd107d5","originalEnvelopeDigest":"sha256:4f8260444b414e890c5c8b8cb6199b1d49db54f6370140451f0cbda49cc793e3","fundingResourceUrl":"https://owned-plan.example.test/funding","paymentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","network":"zenon:testnet","fundingRevision":3,"challengeDigest":"sha256:d007aeb23c26fabb98f78e44f3170f03e8aaac8a102acb1781baec87c0bdb2c2","paymentDigest":"sha256:da2f3a176a188b5957737b81fe7f8299be5936786c73628721d0b893e8bc1c8e","custodyPolicyDigest":"sha256:33155d89c41e4150aa45e60dbf47d5dd1f81054682629d2a6721b0defd9777ce","checksum":"sha256:c98d8361a05aef0590a7193008e40d93340fa607c6ea45fcb2b75ab9104ec775"};
const GRANT=ORIGINALS[0].grantId,HASH=ORIGINALS[0].paymentHash,FUNDING=ORIGINALS[0].fundingResourceUrl;
const KEYS=ORIGINALS.map(v=>Object.freeze({grantId:v.grantId,requestId:v.requestId}));
const PREFIX='SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_';
const FAULT=Object.freeze(new Error('DECLARED_INTERFACE_FAULT'));
const rows=[],units=[],collections=[];
function freeze(value){if(value!==null&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;}
for(const v of ORIGINALS){
 q(C.serializeOriginalServiceRequestCustody(v),JSON.stringify(v));
 same(C.captureOriginalServiceRequestCustody({originalRequestJson:v.originalRequestJson,
  originalBodyBase64:v.originalBodyBase64,serviceResourceUrl:v.serviceResourceUrl},
 {fundingResourceUrl:FUNDING,paymentHash:HASH,network:'zenon:testnet'}),v);
}
q(C.serializeOriginalServiceDispatchIntent(INTENT),canonical(INTENT));
function funding(revision=3,status='BOUND',ambiguityLatched=false){
 return freeze({revision,status,ambiguityLatched,fundingResourceUrl:FUNDING,paymentHash:HASH,network:'zenon:testnet'});
}
function observation(index){return JSON.stringify({viewVersion:1,paymentHash:HASH,
 requestId:KEYS[index].requestId,fundingStatus:'INCLUDED',serviceStatus:'SUCCEEDED'});}
function input(e){return JSON.stringify(e.keys.map((key,index)=>({...key,observationJson:observation(index)})));}
function refusal(run,expected){
 let caught;try{run();}catch(error){caught=error;}ok(caught!==undefined);
 if(expected==='DECLARED_INTERFACE_FAULT')q(caught,FAULT);
 else if(expected==='INVALID_STATUS_VIEW_INPUT')q(caught.message,expected);
 else{q(Object.getPrototypeOf(caught),TypeError.prototype);q(caught.code,PREFIX+expected);
  q(caught.message,PREFIX+expected);q(caught.stack,'TypeError: '+PREFIX+expected);ok(Object.isFrozen(caught));}
 return caught;
}
function unit(count=2,withIntent=true){
 const e={keys:KEYS.slice(0,count),catalogCalls:0,createCalls:0,reads:0,closes:0,
  childUnits:[],rootCloses:0,funding:funding(),uncertainty:freeze({custody:false,submission:false,
  undrained:false,declaredFundingAmbiguitySeen:false}),withIntent,catalogOverrides:new Map(),
  failCreate:-1,failRead:-1,failClose:-1,failCatalog:-1,childFundingIndex:-1,
  childFunding:null,childUncertaintyIndex:-1,childUncertainty:null,childOriginalIndex:-1,childOriginal:null};
 e.catalogKeys=e.keys;
 e.readCatalog=()=>{
  e.catalogCalls++;if(e.catalogCalls===e.failCatalog)throw FAULT;
  const over=e.catalogOverrides.get(e.catalogCalls)||{};
  return freeze({grantId:GRANT,keys:over.keys||e.catalogKeys,funding:over.funding||e.funding,
   uncertainty:over.uncertainty||e.uncertainty,evidence:'LOCAL_STORE_DECLARED_RECOVERY_KEYS',
   qualification:'UNQUALIFIED',authority:'NONE',serviceOutcome:'NOT_ESTABLISHED',
   mayStartPayment:false,maySignPayment:false,mayDispatchService:false,deliveryConfirmed:false});
 };
 e.createStatePlan=(key,json)=>{
  const index=e.createCalls++;same(key,e.keys[index]);if(index===e.failCreate)throw FAULT;
  const declared=P.createServiceCreditPilotClientPlan(JSON.stringify({viewVersion:1,paymentHash:HASH,
   requestId:key.requestId}),json);
  const child={index,reads:0,closes:0,observed:false,closed:false};e.childUnits.push(child);
  function getSnapshot(){
   child.reads++;e.reads++;if(index===e.failRead)throw FAULT;
   const f=index===e.childFundingIndex?e.childFunding:e.funding;
   const u=index===e.childUncertaintyIndex?e.childUncertainty:e.uncertainty;
   const original=index===e.childOriginalIndex?e.childOriginal:ORIGINALS[index];
   const intent=e.withIntent&&index===0?INTENT:null;
   child.observed=child.observed||f.status==='OUTCOME_UNKNOWN';
   return freeze({recoveryState:{original,funding:f,uncertainty:u,dispatchIntent:intent,
    dispatchStatus:intent===null?'NO_INTENT_RECORDED':'POSSIBLY_ATTEMPTED',
    evidence:'LOCAL_STORE_DECLARED_RECOVERY_STATE',qualification:'UNQUALIFIED',
    authority:'NONE',serviceOutcome:'NOT_ESTABLISHED'},
    declaredPlan:declared.getSnapshot(),currentFundingUncertain:f.status==='OUTCOME_UNKNOWN',
    observedFundingUncertain:child.observed,closed:false,
    nextStep:intent===null?'REVIEW_CURRENT_AUTHORITY_FOR_ORIGINAL':'RECONCILIATION_REQUIRED',
    evidence:'OWNED_LOCAL_RECOVERY_BOUND_PLAN',qualification:'UNQUALIFIED',authority:'NONE',
    mayStartPayment:false,maySignPayment:false,mayDispatchService:false,deliveryConfirmed:false});
  }
  function close(){
   q(child.closed,false);child.closed=true;child.closes++;e.closes++;
   if(index===e.failClose)throw FAULT;return declared.close();
  }
  return freeze({observe:()=>{throw new Error('OBSERVE_ESCAPE_FORBIDDEN');},getSnapshot,close});
 };
 e.config={readCatalog:e.readCatalog,createStatePlan:e.createStatePlan,selectedGrantId:GRANT};
 units.push(e);return e;
}
function open(e,text=input(e)){const c=CREATE(e.config,text);collections.push(c);
 same(Object.keys(c),['getSnapshot','close']);ok(Object.isFrozen(c));
 for(const fn of Object.values(c))ok(Object.isFrozen(fn));return c;}
function vector(e){return [e.catalogCalls,e.createCalls,e.reads,e.closes];}
function flags(v){
 deepFrozen(v);q(v.authority,'NONE');q(v.qualification,'UNQUALIFIED');
 for(const key of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed'])q(v[key],false);
 for(const entry of v.entries){const p=entry.recoveryPlan;q(p.authority,'NONE');
  q(p.recoveryState.authority,'NONE');q(p.declaredPlan.authorization,'NONE');
  for(const node of [p,p.declaredPlan,p.declaredPlan.view])
   for(const key of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed'])q(node[key],false);}
}
function finish(name,e,c,last,expected,unavailable=false,unknownClose=false){
 const before=[e.catalogCalls,e.createCalls,e.reads],history=c.close();flags(history);
 q(history.closed,true);q(history.unavailable,unavailable||unknownClose);
 q(history.snapshotKind,'DETACHED_HISTORICAL');q(history.nextStep,'LOCALLY_CLOSED');
 q(history.failureKind,unknownClose?'LOCAL_CLOSE_UNKNOWN':unavailable?'LIVE_READ_FAILED':'NONE');
 q(history.childCloseOutcome,unknownClose?'UNKNOWN':'RETURNED');
 q(history.childCloseAttempts,e.childUnits.length);q(history.entries,last.entries);
 q(history.funding,last.funding);q(history.uncertainty,last.uncertainty);
 q(c.close(),history);q(c.getSnapshot(),history);
 refusal(()=>c.close(undefined),'INVALID_INPUT');refusal(()=>c.getSnapshot(undefined),'INVALID_INPUT');
 same([e.catalogCalls,e.createCalls,e.reads],before);same(vector(e),expected);
 for(const child of e.childUnits){q(child.closed,true);q(child.closes,1);}
 q(e.rootCloses,0);rows.push([name,expected,history.unavailable,history.childCloseOutcome]);return history;
}
function badInput(name,make,expected=[0,0,0,0]){
 const e=unit();refusal(()=>open(e,make(e)),'INVALID_INPUT');same(vector(e),expected);
 q(e.rootCloses,0);rows.push([name,expected,false,'NO_COLLECTION']);
}
function failureCase(name,configure,expected,code){
 const e=unit();configure(e);refusal(()=>open(e),code);same(vector(e),expected);
 for(const child of e.childUnits){q(child.closes,1);q(child.closed,true);}
 q(e.rootCloses,0);rows.push([name,expected,false,'NO_COLLECTION']);
}
function liveFault(name,configure,expected,code,withIntent=true){
 const e=unit(2,withIntent),c=open(e),last=c.getSnapshot();configure(e);
 refusal(()=>c.getSnapshot(),code);const before=vector(e);
 refusal(()=>c.getSnapshot(),'RECOVERY_COLLECTION_UNAVAILABLE');same(vector(e),before);
 return finish(name,e,c,last,expected,true);
}
function selected(t){
 const errors=[];
 try{
  const arity=unit();refusal(()=>CREATE(arity.config),'INVALID_INPUT');
  refusal(()=>CREATE(arity.config,input(arity),undefined),'INVALID_INPUT');same(vector(arity),[0,0,0,0]);
  rows.push(['arity',[0,0,0,0],false,'NO_COLLECTION']);
  badInput('json',()=>'{');
  badInput('canonical',e=>' '+input(e));
  badInput('field',e=>JSON.stringify(e.keys.map((key,i)=>({...key,observationJson:observation(i),extra:0}))));
  badInput('duplicate',e=>JSON.stringify([0,0].map(i=>({...e.keys[i],observationJson:observation(i)}))));
  badInput('foreign',()=>JSON.stringify([{grantId:'grant.discovery.foreign',requestId:'request.discovery.foreign',
   observationJson:observation(0)}]));
  badInput('order',e=>JSON.stringify(JSON.parse(input(e)).reverse()),[1,0,0,0]);
  badInput('missing',e=>JSON.stringify(JSON.parse(input(e)).slice(0,1)),[1,0,0,0]);
  badInput('extra',e=>JSON.stringify([...JSON.parse(input(e)),{...KEYS[2],observationJson:observation(2)}]),[1,0,0,0]);
  badInput('nine',()=>JSON.stringify(Array.from({length:9},(_,i)=>({grantId:GRANT,
   requestId:'request.limit.'+i,observationJson:'{}'}))));
  badInput('units',()=>'"'+'x'.repeat(65535)+'"');
  badInput('utf8',()=>'"'+'\u20ac'.repeat(22000)+'"');
  badInput('observation',e=>JSON.stringify(e.keys.map((key,i)=>({...key,
   observationJson:i===0?'x'.repeat(1025):observation(i)}))));
  for(const [name,count,intent] of [['intent',2,true],['empty',0,false],['eight',8,false]]){
   const e=unit(count,intent),c=open(e);refusal(()=>c.getSnapshot(undefined),'INVALID_INPUT');
   refusal(()=>c.close(undefined),'INVALID_INPUT');const v=c.getSnapshot();flags(v);
   q(v.keys.length,count);q(v.nextStep,intent?'RECONCILIATION_REQUIRED':count===0?
    'NO_RETAINED_ORIGINALS':'REVIEW_CURRENT_AUTHORITY_FOR_ORIGINALS');
   for(let i=0;i<count;i++){same(v.entries[i].recoveryPlan.recoveryState.original,ORIGINALS[i]);
    q(v.entries[i].recoveryPlan.declaredPlan.view.phase,'RESULT_REPORTED');}
   finish(name,e,c,v,[4,count,2*count,count]);
  }
  const advance=unit(2,false),ac=open(advance);
  advance.funding=funding(4);let av=ac.getSnapshot();q(av.funding.revision,4);
  advance.funding=funding(5,'OUTCOME_UNKNOWN',true);
  advance.uncertainty=freeze({...advance.uncertainty,declaredFundingAmbiguitySeen:true});
  av=ac.getSnapshot();q(av.currentFundingUncertain,true);q(av.observedFundingUncertain,true);
  q(av.nextStep,'RECONCILE_EXISTING_FUNDING');flags(av);
  advance.funding=funding(6,'BOUND',true);av=ac.getSnapshot();
  q(av.currentFundingUncertain,false);q(av.observedFundingUncertain,true);
  q(av.nextStep,'REVIEW_PRIOR_FUNDING_UNCERTAINTY');finish('revisions',advance,ac,av,[8,2,8,2]);
  const empty=unit(0,false);empty.funding=funding(3,'OUTCOME_UNKNOWN',true);
  empty.uncertainty=freeze({...empty.uncertainty,declaredFundingAmbiguitySeen:true});
  const ec=open(empty);empty.funding=funding(4,'BOUND',true);const ev=ec.getSnapshot();
  q(ev.currentFundingUncertain,false);q(ev.observedFundingUncertain,true);
  finish('empty-history',empty,ec,ev,[4,0,0,0]);
  const hist=unit(2,false);hist.funding=funding(3,'BOUND',true);
  hist.uncertainty=freeze({...hist.uncertainty,declaredFundingAmbiguitySeen:true});
  const hc=open(hist),hv=hc.getSnapshot();q(hv.currentFundingUncertain,false);
  q(hv.observedFundingUncertain,false);q(hv.nextStep,'REVIEW_HISTORICAL_FUNDING_AMBIGUITY');
  finish('historical',hist,hc,hv,[4,2,4,2]);
  failureCase('partial-build',e=>{e.failCreate=1;},[1,2,0,1],'DECLARED_INTERFACE_FAULT');
  failureCase('cleanup-unknown',e=>{e.failCreate=1;e.failClose=0;},[1,2,0,1],'RECOVERY_COLLECTION_CLEANUP_UNKNOWN');
  failureCase('initial-view',e=>{e.childFundingIndex=1;e.childFunding=funding(4);},
   [1,2,2,2],'RECOVERY_COLLECTION_VIEW_CHANGED');
  failureCase('initial-bookend',e=>{e.catalogOverrides.set(2,{funding:funding(4)});},
   [2,2,2,2],'RECOVERY_COLLECTION_VIEW_CHANGED');
  failureCase('partial-dto',e=>{e.config.createStatePlan=(key,json)=>e.createStatePlan(key,
   key.requestId===KEYS[1].requestId?'{}':json);},[1,2,0,1],'INVALID_STATUS_VIEW_INPUT');
  failureCase('child-shape',e=>{e.config.createStatePlan=(key,json)=>{
   const child=e.createStatePlan(key,json);return key.requestId===KEYS[1].requestId?
    Object.freeze({...child,extra:0}):child;};},[1,2,0,2],'INVALID_INPUT');
  failureCase('child-get',e=>{e.config.createStatePlan=(key,json)=>{
   const child=e.createStatePlan(key,json);return key.requestId===KEYS[1].requestId?
    Object.freeze({...child,getSnapshot:0}):child;};},[1,2,0,2],'RECOVERY_COLLECTION_CHILD_INVALID');
  failureCase('catalog-limit',e=>{e.catalogKeys=Array.from({length:9},(_,i)=>
   ({grantId:GRANT,requestId:'request.limit.'+i}));},[1,0,0,0],'RECOVERY_COLLECTION_LIMIT');
  failureCase('initial-read',e=>{e.failCatalog=1;},[1,0,0,0],'DECLARED_INTERFACE_FAULT');
  liveFault('membership',e=>{e.catalogKeys=[...e.keys,KEYS[2]];},[5,2,4,2],'RECOVERY_COLLECTION_MEMBERSHIP_CHANGED');
  liveFault('bookend-member',e=>{e.catalogOverrides.set(6,{keys:e.keys.slice().reverse()});},
   [6,2,6,2],'RECOVERY_COLLECTION_MEMBERSHIP_CHANGED');
  liveFault('regression',e=>{e.funding=funding(2);},[5,2,4,2],'FUNDING_REVISION_REGRESSION');
  liveFault('identity',e=>{e.funding=freeze({...funding(4),paymentHash:'b'.repeat(64)});},
   [5,2,4,2],'RECOVERY_COLLECTION_FUNDING_CHANGED');
  liveFault('same-revision',e=>{e.funding=funding(3,'OUTCOME_UNKNOWN',true);},
   [5,2,4,2],'RECOVERY_COLLECTION_FUNDING_CHANGED');
  liveFault('child-view',e=>{e.childFundingIndex=1;e.childFunding=funding(4);},
   [5,2,6,2],'RECOVERY_COLLECTION_VIEW_CHANGED');
  liveFault('child-uncertainty',e=>{e.childUncertaintyIndex=1;e.childUncertainty=freeze({...e.uncertainty,custody:true});},
   [5,2,6,2],'RECOVERY_COLLECTION_VIEW_CHANGED');
  liveFault('original',e=>{e.childOriginalIndex=1;e.childOriginal=ORIGINALS[0];},
   [5,2,6,2],'ORIGINAL_BINDING_CHANGED');
  liveFault('intent-lost',e=>{e.withIntent=false;},[5,2,5,2],'DISPATCH_INTENT_BINDING_CHANGED');
  liveFault('intent-added',e=>{e.withIntent=true;},[5,2,5,2],'DISPATCH_INTENT_BINDING_CHANGED',false);
  const partial=liveFault('partial-read',e=>{e.funding=funding(4);e.failRead=1;},
   [5,2,6,2],'DECLARED_INTERFACE_FAULT',false);q(partial.funding.revision,3);
  liveFault('root-read',e=>{e.failCatalog=5;},[5,2,4,2],'DECLARED_INTERFACE_FAULT');
  const ce=unit(),cc=open(ce),cv=cc.getSnapshot();ce.failClose=0;
  finish('close-unknown',ce,cc,cv,[4,2,4,2],false,true);
 }catch(error){errors.push(error);}
 finally{for(const c of collections){try{c.close();}catch(error){errors.push(error);}}}
 if(errors.length)throw new AggregateError(errors,'COLLECTION_INTERFACE_NOT_QUALIFIED');
 same(rows,EXPECTED_ROWS);for(const e of units){q(e.rootCloses,0);
  for(const child of e.childUnits)q(child.closes,1);}
 same(readdirSync(fixtureRoot),[]);
 const a=privateDirectory(scratch),b=privateDirectory(fixtureRoot,a.dev);
 same([a.dev,a.ino],[scratchId.dev,scratchId.ino]);same([b.dev,b.ino],[fixtureId.dev,fixtureId.ino]);
 const value={phase,pid:process.pid,ppid:process.ppid,controls:rows,
  nativeHandles:0,rootCloses:0,requestCalls:0,qualification:'INTERFACE_ONLY_UNQUALIFIED',
  authority:'NONE',delivery:'NOT_ESTABLISHED',bodyPassed:true};
 const output=JSON.stringify(value);ok(Buffer.byteLength(output)<=4096);
 ok(!output.includes(scratch)&&!output.includes(fixtureRoot));t.diagnostic(output);
}
test('catalog-bound recovery collection owns complete diagnostic lifecycle over declared internal operations',
 {timeout:12000},selected);
