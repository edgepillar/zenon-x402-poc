/*
 * CATALOG-BOUND OWNED SQLITE RECOVERY / FRESH READER DRAFT / NOT_RUN.
 * Two explicit fresh phases writer -> reader, one authored test per phase and
 * one NEW synthetic raw DB unit collection-main only. Preserve every old HOLD.
 * Writer seeds via current V3 factory: two selected originals, one validated
 * foreign original, one selected intent and literal declared BOUND revision3.
 * Reader receives immediate successful closed writer PID and complete physical
 * DB stamp before repository imports and first native open. Parent separately
 * verifies exit/TAP/drains/group absence/returned closes and exact stamp.
 * Reader uses actual current V3 owned runner plus the actual internal collection.
 * Construction/refresh/local detach and a live collection's read after real root
 * close are central controls. Collection unavailable is separate from drained
 * root/native close; cached historical detached DATA never supplies authority.
 * No child plan capability escapes the collection. No request callback runs.
 * Independent actual root close Promise/resource ownership stays unchanged.
 * Funding/rows/envelopes/intents are exact literal synthetic DATA. Declared
 * INCLUDED/SUCCEEDED observations never establish payment, ACK, delivery or READY.
 * Current store busy_timeout0 / locking_modeEXCLUSIVE / owner_epoch transaction
 * remain unchanged. No live auxiliary connection, write mutation, bypass, retry,
 * force-close, mode relaxation or corrupt-startup substitute is attempted.
 * Fault branch qualification is separate declared internal-interface evidence;
 * this real backend scope is graceful reopen + collection/closed-root lifecycle.
 * One live source-bound SQLite/store handle maximum. Source/API returned-close
 * observations do not prove C++ finalization, OS cleanup, hard cancellation,
 * ungraceful restart, power-loss durability, concurrent hostile-writer safety,
 * production recovery, main/CI, activation or native-chain provider readiness.
 * Native SQL .prepare is synthetic SQLite work, never a chain PREPARE.
 * DB plus optional DELETE journal <=2MiB; full physical live/closed stamps and
 * namespace checks. Raw DB/journal remain unregistered HOLD, not CAS/disposable.
 * Source13 plus self guarded0400/ASCII/independent physical clones before imports;
 * cleared env8, reader10. Node24.19.0/darwin, permissionsOFF, no addons/eval.
 * Stdout65536/stderr1048576/diagnostic4096, observations2s/test12s require separate
 * fixed unsaved caller/source/runtime/environment/storage admission review.
 * No Node/parser/import/SQL/task allocation occurred during this authoring.
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
 q(guarded.size,13);
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


ok(['writer','reader'].includes(phase));
q(fixtureRoot,join(scratch,'sqlite-recovery-collection-fixtures'));
const fixtureId=privateDirectory(fixtureRoot,scratchId.dev);
const initialNames=phase==='writer'?[]:['collection-main'];
same(readdirSync(fixtureRoot).sort(),initialNames);
const priorEnv=['SPV_RECOVERY_COLLECTION_WRITER_PID','SPV_RECOVERY_COLLECTION_INPUT_STAMP'];
same(Object.keys(process.env).sort(),[...baseEnv,...(phase==='reader'?priorEnv:[])].sort());
const STAMP_KEYS=['path','dev','ino','uid','mode','nlink','bytes','sha256','mtime_ns','ctime_ns'];
const initialStamps=new Map(),unitIds=new Map();
function databasePath(name){return join(fixtureRoot,name,'custody.sqlite');}
function unitFiles(name) {
 const path=join(fixtureRoot,name),ds=privateDirectory(path,fixtureId.dev);
 const id=[ds.dev,ds.ino];
 if(unitIds.has(name))same(id,unitIds.get(name));else unitIds.set(name,id);
 const names=readdirSync(path).sort();
 ok(names.length>=1&&names.length<=2);ok(names.includes('custody.sqlite'));
 let total=0n;
 for(const file of names) {
  ok(file==='custody.sqlite'||file==='custody.sqlite-journal');
  const fp=join(path,file);q(realpathSync(fp),fp);
  const s=lstatSync(fp,{bigint:true});
  ok(s.isFile());q(s.isSymbolicLink(),false);q(s.uid,uid);q(s.dev,fixtureId.dev);
  q(s.nlink,1n);q(s.mode&0o7777n,0o600n);ok(s.size>=0n&&s.size<=2097152n);total+=s.size;
 }
 ok(total<=2097152n,'DB_PLUS_JOURNAL_BOUND');
}
function dbStamp(name, live = false) {
 q(typeof live,'boolean');unitFiles(name);
 const unit=join(fixtureRoot,name),names=readdirSync(unit).sort();
 if(!live)same(names,['custody.sqlite']);
 function capture(file) {
  ok(file==='custody.sqlite'||file==='custody.sqlite-journal');
  const path=join(unit,file),{bytes,stat:s}=boundedBytes(path,2097152,0o600,fixtureId.dev);
  if(file==='custody.sqlite')ok(bytes.length>0);
  return {path,dev:s.dev.toString(),ino:s.ino.toString(),uid:s.uid.toString(),mode:'0o600',
   nlink:s.nlink.toString(),bytes:bytes.length,sha256:sha(bytes),mtime_ns:s.mtimeNs.toString(),
   ctime_ns:s.ctimeNs.toString()};
 }
 const database=capture('custody.sqlite');
 const journal=live&&names.includes('custody.sqlite-journal')?capture('custody.sqlite-journal'):null;
 same(readdirSync(unit).sort(),names,'LIVE_OR_CLOSED_NAMESPACE_STABLE');
 return live?{database,journal}:database;
}
function redact(s){const {path,...v}=s;ok(path.startsWith(fixtureRoot+'/'));return v;}

for(const name of initialNames)initialStamps.set(name,dbStamp(name));
let priorPid=null,priorInput=null;
if(phase==='reader'){
 const pid=process.env.SPV_RECOVERY_COLLECTION_WRITER_PID;
 ok(typeof pid==='string'&&/^[1-9][0-9]{0,9}$/.test(pid));priorPid=Number(pid);
 ok(Number.isSafeInteger(priorPid)&&priorPid>1&&priorPid<=2147483647);
 ok(priorPid!==process.pid&&priorPid!==process.ppid);
 const json=process.env.SPV_RECOVERY_COLLECTION_INPUT_STAMP;
 ok(typeof json==='string'&&json.length<=2048&&/^[\x20-\x7e]+$/.test(json));
 priorInput=JSON.parse(json);same(Object.keys(priorInput),STAMP_KEYS);q(JSON.stringify(priorInput),json);
 for(const key of ['dev','ino','uid','nlink','mtime_ns','ctime_ns'])
  ok(typeof priorInput[key]==='string'&&/^(?:0|[1-9][0-9]{0,19})$/.test(priorInput[key]));
 same(priorInput,initialStamps.get('collection-main'),'WRITER_FULL_STAMP_BEFORE_IMPORT_OR_OPEN');
}else for(const key of priorEnv)q(process.env[key],undefined);
const specs=[["../src/service-credit-http-execute-dispatch.js",27034,770,"254ba8eef5ea5efb3a1b901be09e9cb33afbc3cfcf63789ca4a23316b6180d1b"],["../src/service-credit-original-request-custody-contract.js",14051,356,"fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915"],["../src/service-credit-custodied-request-owner.js",34950,932,"35386cc84c281aee4636141171076b84aa139ae20c66e4366788927cef43f3ca"],["../src/service-credit-custodied-http-client.js",10755,292,"ddbc54faf4a14d95e6274bc9df27b7b49db251bab67c11b871cfb2f9e78b4f15"],["../src/service-credit-custodied-sequential-runner-core.js",15288,479,"36c99342bf9e47559e39535aefcde78acbbdd7fb210d42a77dbbb93c2fd9f8ff"],["../src/x402-wire.js",39886,934,"5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"],["../package.json",1413,40,"8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"],["../src/service-credit-custodied-sqlite-http-client.js",18540,511,"ea16d6ac5ce72d6434c06e98c52c324daf918dd570f15997cdc21e501f677f4e"],["../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js",57362,1534,"eafb5b71f082fd571a35fdf6d5a9b0c39b22c2559d39af49a824d53057e07614"],["../src/service-credit-pilot-client-plan.js",7483,181,"73ee3d739de85150039e733234cd0761c228d68de040d1e126902e808a259ac6"],["../src/service-credit-pilot-status-view.js",3202,60,"cf3822d8b9ec4eb4772452ed1888b96d398fd87c1ead44cd155a5acc1a6b66ed"],["../src/service-credit-custodied-sqlite-sequential-runner.js",20469,489,"24b0a62ac889574e3d9176e025d84f252c6c18796e57d2ea20de14497aeed0be"],["../src/service-credit-custodied-recovery-collection-core.js",13794,306,"51d06da70ecccd0cf8b38d650367d1ae903ea86010a5ebeadb682af98e4b890b"]];
const guarded=sourceGuard('service-credit-custodied-sqlite-recovery-collection-reopen.draft.mjs',
 '/*\n * CATALOG-BOUND OWNED SQLITE RECOVERY / FRESH READER DRAFT / NOT_RUN.\n');
const load=path=>import(guarded.get(path).url);
const B=await load('src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const R=await load('src/service-credit-custodied-sqlite-sequential-runner.js');
const C=await load('src/service-credit-original-request-custody-contract.js');
const wire=await load('src/x402-wire.js');
const {DatabaseSync}=await import('node:sqlite');
const STORE_CLOSE_DESCRIPTOR=Object.getOwnPropertyDescriptor(B.ZenonFundingPayerRecoverySqliteStore.prototype,'close');
const RAW_CLOSE_DESCRIPTOR=Object.getOwnPropertyDescriptor(DatabaseSync.prototype,'close');
const STORE_CLOSE=STORE_CLOSE_DESCRIPTOR.value,RAW_CLOSE=RAW_CLOSE_DESCRIPTOR.value;
const CREATE=B.createZenonFundingPayerRecoveryDispatchIntentSqliteStoreV3;
const OPEN_R=R.openServiceCreditCustodiedSqliteSequentialRunnerV3;
const SERIALIZE=C.serializeOriginalServiceRequestCustody,SERIALIZE_INTENT=C.serializeOriginalServiceDispatchIntent;
const ORIGINALS=[{"custodyVersion":1,"profile":"service-credit.execute.v1.empty-body","originalRequestJson":"{\"modelVersion\":1,\"grantId\":\"grant.discovery.own\",\"requestId\":\"request.discovery.a\",\"method\":\"POST\",\"routeId\":\"service-credit.execute.v1\",\"canonicalBodyDigest\":\"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\",\"selectedContentType\":\"application/json\",\"maxCostUnits\":7}","originalBodyBase64":"","serviceResourceUrl":"https://owned-plan.example.test/service-credit/v1/execute","fundingResourceUrl":"https://owned-plan.example.test/funding","paymentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","network":"zenon:testnet","grantId":"grant.discovery.own","requestId":"request.discovery.a","checksum":"sha256:3bcb4398b5b7ebb48c2e9201dbdd55a1437d23f40f8ed41f0811f0590cd107d5"},{"custodyVersion":1,"profile":"service-credit.execute.v1.empty-body","originalRequestJson":"{\"modelVersion\":1,\"grantId\":\"grant.discovery.own\",\"requestId\":\"request.discovery.b\",\"method\":\"POST\",\"routeId\":\"service-credit.execute.v1\",\"canonicalBodyDigest\":\"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\",\"selectedContentType\":\"application/json\",\"maxCostUnits\":7}","originalBodyBase64":"","serviceResourceUrl":"https://owned-plan.example.test/service-credit/v1/execute","fundingResourceUrl":"https://owned-plan.example.test/funding","paymentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","network":"zenon:testnet","grantId":"grant.discovery.own","requestId":"request.discovery.b","checksum":"sha256:f56f4bc7e4c86170293a1eeb8ee3a735b27e66eb99a3f4c338b524f9c1bb06be"},{"custodyVersion":1,"profile":"service-credit.execute.v1.empty-body","originalRequestJson":"{\"modelVersion\":1,\"grantId\":\"grant.discovery.foreign\",\"requestId\":\"request.discovery.foreign\",\"method\":\"POST\",\"routeId\":\"service-credit.execute.v1\",\"canonicalBodyDigest\":\"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\",\"selectedContentType\":\"application/json\",\"maxCostUnits\":7}","originalBodyBase64":"","serviceResourceUrl":"https://owned-plan.example.test/service-credit/v1/execute","fundingResourceUrl":"https://owned-plan.example.test/funding","paymentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","network":"zenon:testnet","grantId":"grant.discovery.foreign","requestId":"request.discovery.foreign","checksum":"sha256:e5df031eac1a5e4132ac76834537f5dacf17e9d64363effe07c053a09cd8d631"}];
const INTENT={"intentVersion":1,"profile":"service-credit.execute.v1.empty-body","state":"INTENT_RECORDED","grantId":"grant.discovery.own","requestId":"request.discovery.a","originalChecksum":"sha256:3bcb4398b5b7ebb48c2e9201dbdd55a1437d23f40f8ed41f0811f0590cd107d5","originalEnvelopeDigest":"sha256:4f8260444b414e890c5c8b8cb6199b1d49db54f6370140451f0cbda49cc793e3","fundingResourceUrl":"https://owned-plan.example.test/funding","paymentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","network":"zenon:testnet","fundingRevision":3,"challengeDigest":"sha256:d007aeb23c26fabb98f78e44f3170f03e8aaac8a102acb1781baec87c0bdb2c2","paymentDigest":"sha256:da2f3a176a188b5957737b81fe7f8299be5936786c73628721d0b893e8bc1c8e","custodyPolicyDigest":"sha256:33155d89c41e4150aa45e60dbf47d5dd1f81054682629d2a6721b0defd9777ce","checksum":"sha256:c98d8361a05aef0590a7193008e40d93340fa607c6ea45fcb2b75ab9104ec775"};
const LITERAL_FUNDING=[{"singleton":1,"revision":3,"status":"BOUND","ambiguity_latched":0,"challenge_digest":"sha256:d007aeb23c26fabb98f78e44f3170f03e8aaac8a102acb1781baec87c0bdb2c2","payment_digest":"sha256:da2f3a176a188b5957737b81fe7f8299be5936786c73628721d0b893e8bc1c8e","envelope":"{\"ambiguityLatched\":false,\"challengeHeader\":\"eyJ4NDAyVmVyc2lvbiI6MiwicmVzb3VyY2UiOnsidXJsIjoiaHR0cHM6Ly9vd25lZC1wbGFuLmV4YW1wbGUudGVzdC9mdW5kaW5nIn0sImFjY2VwdHMiOlt7InNjaGVtZSI6ImV4YWN0IiwibmV0d29yayI6Inplbm9uOnRlc3RuZXQiLCJhc3NldCI6ImRlY2xhcmVkLXRlc3QtYXNzZXQiLCJhbW91bnQiOiIxIiwicGF5VG8iOiJkZWNsYXJlZC10ZXN0LXBheWVlIiwibWF4VGltZW91dFNlY29uZHMiOjMwLCJleHRyYSI6eyJwb2MiOnRydWUsInNldHRsZW1lbnQiOiJhY2NvdW50LWJsb2NrIiwicGF5bWVudEZsb3ciOiJ1cGZyb250IiwiemVub25DaGFpbiI6eyJ2ZXJzaW9uIjoxLCJjaGFpbklkZW50aWZpZXIiOiI0MiIsImdlbmVzaXNNb21lbnR1bUhhc2giOiIxMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExIn19fV19\",\"checksum\":\"sha256:0ff685d8df1dbbc76a775ab2242731ffd54d27dfb99f94421942601c6d1719de\",\"paymentHeader\":\"eyJ4NDAyVmVyc2lvbiI6MiwicmVzb3VyY2UiOnsidXJsIjoiaHR0cHM6Ly9vd25lZC1wbGFuLmV4YW1wbGUudGVzdC9mdW5kaW5nIn0sImFjY2VwdGVkIjp7InNjaGVtZSI6ImV4YWN0IiwibmV0d29yayI6Inplbm9uOnRlc3RuZXQiLCJhc3NldCI6ImRlY2xhcmVkLXRlc3QtYXNzZXQiLCJhbW91bnQiOiIxIiwicGF5VG8iOiJkZWNsYXJlZC10ZXN0LXBheWVlIiwibWF4VGltZW91dFNlY29uZHMiOjMwLCJleHRyYSI6eyJwb2MiOnRydWUsInNldHRsZW1lbnQiOiJhY2NvdW50LWJsb2NrIiwicGF5bWVudEZsb3ciOiJ1cGZyb250IiwiemVub25DaGFpbiI6eyJ2ZXJzaW9uIjoxLCJjaGFpbklkZW50aWZpZXIiOiI0MiIsImdlbmVzaXNNb21lbnR1bUhhc2giOiIxMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExIn19fSwicGF5bG9hZCI6eyJ0cmFuc2FjdGlvbiI6eyJoYXNoIjoiYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYSJ9LCJpbnRlbnREaWdlc3QiOiIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyIn19\",\"resourceUrl\":\"https://owned-plan.example.test/funding\",\"revision\":3,\"schemaVersion\":1,\"status\":\"BOUND\"}"}];
const SCHEMA=[{"type":"table","name":"original_dispatch_intents","sql":"CREATE TABLE original_dispatch_intents(grant_id TEXT NOT NULL, request_id TEXT NOT NULL, envelope TEXT NOT NULL, PRIMARY KEY(grant_id,request_id), FOREIGN KEY(grant_id,request_id) REFERENCES original_service_requests(grant_id,request_id)) STRICT"},{"type":"table","name":"original_request_custody_policy","sql":"CREATE TABLE original_request_custody_policy(singleton INTEGER PRIMARY KEY CHECK(singleton = 1), policy_version INTEGER NOT NULL CHECK(policy_version = 1), max_requests INTEGER NOT NULL CHECK(max_requests >= 1 AND max_requests <= 1024), service_resource_url TEXT NOT NULL) STRICT"},{"type":"table","name":"original_service_requests","sql":"CREATE TABLE original_service_requests(grant_id TEXT NOT NULL, request_id TEXT NOT NULL, funding_singleton INTEGER NOT NULL CHECK(funding_singleton = 1) REFERENCES payer_recovery_state(singleton), payment_hash TEXT NOT NULL, network TEXT NOT NULL, service_resource_url TEXT NOT NULL, envelope TEXT NOT NULL, PRIMARY KEY(grant_id,request_id)) STRICT"},{"type":"table","name":"payer_recovery_meta","sql":"CREATE TABLE payer_recovery_meta(singleton INTEGER PRIMARY KEY CHECK(singleton = 1), resource_url TEXT NOT NULL, owner_epoch INTEGER NOT NULL CHECK(owner_epoch >= 0)) STRICT"},{"type":"table","name":"payer_recovery_state","sql":"CREATE TABLE payer_recovery_state(singleton INTEGER PRIMARY KEY CHECK(singleton = 1), revision INTEGER NOT NULL CHECK(revision >= 1), status TEXT NOT NULL CHECK(status IN ('PREPARED','ATTEMPT_FENCED','OUTCOME_UNKNOWN','BOUND','PAYMENT_REJECTED','PAYMENT_CONFLICT')), ambiguity_latched INTEGER NOT NULL CHECK(ambiguity_latched IN (0,1)), challenge_digest TEXT NOT NULL, payment_digest TEXT NOT NULL, envelope TEXT NOT NULL) STRICT"}];
const GOLDEN={"aggregate":{"funding":{"bytes":1976,"sha256":"18536b6e9dcb6d75a9804dc1c377ff832320bb3e7b82b82e00d2ce9b026e6663"},"policy":{"bytes":136,"sha256":"5fd70c8af778053d3bb6e8c8f07c2b99a3a70e5353a9acf591fa5f385d487525"},"rows":{"bytes":3736,"sha256":"d2113484576b66b38b34e1319e5c2608da8d48f3d69faf1d2715671477583650"},"intents":{"bytes":1046,"sha256":"3b8d8c6d3411f567d54bd677b14fe5fd791216397025ddfd76a4ad16c3a0d644"},"schema":{"bytes":1775,"sha256":"c19b2e769499977a4c5a52d3feb27c6fcdae270fbc08a776fc92dc6c500c7d5d"},"stable":{"bytes":8802,"sha256":"9700c229f588ab6cca99824213de750520c1ec0cbbcae08758b0b5dec163b66c"},"corruptRows":{"bytes":3736,"sha256":"f1efc3bfedbc48ecd9d6be8f546c2c11fb352da3e24fef39fe32c576343c8c0a"},"stableCorrupt":{"bytes":8802,"sha256":"ca0a964a0237130b3a43ebab4f0de2f3f0a917ba365f295e14c1773fc31b39b0"},"schema1":{"bytes":714,"sha256":"d72977fca12b50ad61ae6342bf96269850685b6cef46bcd4a5c7f310d45bdfe8"},"schema2":{"bytes":1469,"sha256":"3bc17a2ceca6e878b8dceb91f767cc0caf34edd19c952f8099f03eee590b08e2"}},"originals":[{"request":{"bytes":292,"sha256":"fd91baae70c667979ea87a6c0f8d82301e9ba6ce8caff2ece9ebf82b2f95bbe5"},"originalEnvelope":{"bytes":840,"sha256":"4f8260444b414e890c5c8b8cb6199b1d49db54f6370140451f0cbda49cc793e3"},"intentEnvelope":{"bytes":905,"sha256":"6499dce58e1a3f221ad66458c7db0b8e11d3dc79766f539b013a020df894a423"}},{"request":{"bytes":292,"sha256":"b78609b432a0ab1fa7f6fd155755763ac8edd3d3aad4c6f6b60e72da0756fe5c"},"originalEnvelope":{"bytes":840,"sha256":"516ddb670aa82be2dd7dbf56d6be482e054ee7082a08bd2b15e3fb81702b4b63"},"intentEnvelope":{"bytes":905,"sha256":"914d575d7bafcd8aaa0ebd4878f789830d272bc22164e75e21a57963d47fbf26"}},{"request":{"bytes":302,"sha256":"b2e139bdd7c45cf03d1df8a7fded92f0f1ee593f0e2b3cd08883441444668d98"},"originalEnvelope":{"bytes":860,"sha256":"e0417f02825c73f8ac0216eb637b1ed7da94c5a1db81fb8a7df2ca556ef64c56"},"intentEnvelope":{"bytes":915,"sha256":"fa3c1621fd67a4c9307990b11bd5ef3b65a0b037a5cbda589c9e9d5d3d1867eb"}}]};
const FUNDING=ORIGINALS[0].fundingResourceUrl,SERVICE=ORIGINALS[0].serviceResourceUrl;
const HASH=ORIGINALS[0].paymentHash,GRANT=ORIGINALS[0].grantId,EMPTY='grant.discovery.empty';
const POLICY={policyVersion:1,maxRequests:4,serviceResourceUrl:SERVICE};
const KEYS=ORIGINALS.map(v=>({grantId:v.grantId,requestId:v.requestId}));
const ENVELOPES=ORIGINALS.map(v=>JSON.stringify(v)),INTENT_ENVELOPE=canonical(INTENT);
const ROWS=[2,0,1].map(i=>({grant_id:KEYS[i].grantId,request_id:KEYS[i].requestId,
 funding_singleton:1,payment_hash:HASH,network:'zenon:testnet',service_resource_url:SERVICE,envelope:ENVELOPES[i]}));
const INTENTS=[{grant_id:GRANT,request_id:KEYS[0].requestId,envelope:INTENT_ENVELOPE}];
const COUNT_KEYS=['loadReads','recordReads','retainCalls','readbackConfirmations',
 'dispatchCalls','callbackCompletions','intentWrites','intentReads','intentReadbackConfirmations'];
const counts=values=>Object.fromEntries(COUNT_KEYS.map((key,i)=>[key,values[i]]));
const UNCERTAIN={custody:false,submission:false,undrained:false,declaredFundingAmbiguitySeen:false};
const XP='SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_',CP='SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_';
const entries=[],rootEvidence=[],collectionEvidence=[],semanticEvidence=[],diagnostics=[];
let slot=null,requestCalls=0,bodyPassed=false;
function requestImpl(){requestCalls++;throw new Error('REQUEST_CALLBACK_FORBIDDEN');}
function closed(){q(slot,null,'NATIVE_SLOT_UNKNOWN_HOLD');}
function descriptors(){
 same(Object.getOwnPropertyDescriptor(B.ZenonFundingPayerRecoverySqliteStore.prototype,'close'),STORE_CLOSE_DESCRIPTOR);
 same(Object.getOwnPropertyDescriptor(DatabaseSync.prototype,'close'),RAW_CLOSE_DESCRIPTOR);
}
function reserve(kind){
 closed();const e={kind,state:'PENDING',handle:null,closeAttempted:false,closeReturned:false};
 entries.push(e);slot=e;return e;
}
function hold(e,error){e.state='UNKNOWN_HOLD';e.failure=error;}
function closeAux(e){
 q(slot,e);q(e.state,'OPEN');q(e.closeAttempted,false);e.closeAttempted=true;
 try{
  descriptors();q(APPLY(e.kind==='readOnly'?RAW_CLOSE:STORE_CLOSE,e.handle,[]),undefined);
  if(e.kind==='readOnly')q(e.handle.isOpen,false);
  e.closeReturned=true;e.state='CLOSED';e.handle=null;slot=null;unitFiles('collection-main');
 }catch(error){hold(e,error);throw error;}
}
function auxiliary(kind,construct,work){
 const e=reserve(kind);
 try{e.handle=construct();e.state='OPEN';}catch(error){hold(e,error);throw error;}
 let value,problem;
 try{value=work(e.handle);}catch(error){problem=error;}
 try{closeAux(e);}catch(error){if(problem)throw new AggregateError([problem,error],'AUXILIARY_CLOSE_UNKNOWN');throw error;}
 if(problem)throw problem;return value;
}
function pairInput(){
 const requirement={scheme:'exact',network:'zenon:testnet',asset:'declared-test-asset',
  amount:'1',payTo:'declared-test-payee',maxTimeoutSeconds:30,
  extra:{poc:true,settlement:'account-block',paymentFlow:'upfront',
   zenonChain:{version:1,chainIdentifier:'42',genesisMomentumHash:'1'.repeat(64)}}};
 const required={x402Version:2,resource:{url:FUNDING},accepts:[requirement]};
 const payload={x402Version:2,resource:{url:FUNDING},accepted:requirement,
  payload:{transaction:{hash:HASH},intentDigest:'2'.repeat(64)}};
 return {challenge:{status:'PAYMENT_REQUIRED',resourceUrl:FUNDING,paymentRequired:required,
  paymentRequiredHeader:wire.encodeB64Json(required,{maxEncodedBytes:8192})},
  paymentSignatureHeader:wire.encodeB64Json(payload,{maxEncodedBytes:8192})};
}
const DECLARED=pairInput(),PAIR=B.captureZenonFundingPostV1PayerRecoveryPair(DECLARED,FUNDING);
for(let i=0;i<3;i++){
 q(SERIALIZE(ORIGINALS[i]),ENVELOPES[i]);same(C.parseOriginalServiceRequestCustody(ENVELOPES[i]),ORIGINALS[i]);
 q(sha(ENVELOPES[i]),GOLDEN.originals[i].originalEnvelope.sha256);
}
q(SERIALIZE_INTENT(INTENT),INTENT_ENVELOPE);q(sha(INTENT_ENVELOPE),GOLDEN.originals[0].intentEnvelope.sha256);
same(C.captureOriginalServiceDispatchIntent(ORIGINALS[0],{fundingRevision:3,
 challengeDigest:LITERAL_FUNDING[0].challenge_digest,paymentDigest:LITERAL_FUNDING[0].payment_digest,
 custodyPolicy:POLICY}),INTENT);
function fullFunding(value,revision,status){
 q(value.revision,revision);q(value.status,status);q(value.ambiguityLatched,false);
 q(value.resourceUrl,FUNDING);q(value.challengeHeader,PAIR.challengeHeader);q(value.paymentHeader,PAIR.paymentHeader);
 same(value.paymentRequired,PAIR.paymentRequired);same(value.paymentPayload,PAIR.paymentPayload);
 same(value.requirement,PAIR.requirement);
}
function seed(){
 closed();throws(()=>lstatSync(join(fixtureRoot,'collection-main')),error=>error.code==='ENOENT');
 mkdirSync(join(fixtureRoot,'collection-main'),{mode:0o700});
 const d=privateDirectory(join(fixtureRoot,'collection-main'),fixtureId.dev);unitIds.set('collection-main',[d.dev,d.ino]);
 same(readdirSync(join(fixtureRoot,'collection-main')),[]);
 auxiliary('seed',()=>CREATE({databasePath:databasePath('collection-main'),allowedRoot:join(fixtureRoot,'collection-main'),
  resourceUrl:FUNDING,custodyPolicy:POLICY}),store=>{
  fullFunding(store.prepare(DECLARED),1,'PREPARED');fullFunding(store.fenceAttempt('PREPARED'),2,'ATTEMPT_FENCED');
  fullFunding(store.finishAttempt('BOUND'),3,'BOUND');
  for(let i=0;i<3;i++)same(store.retainOriginalRequest({...KEYS[i],originalRequestJson:ORIGINALS[i].originalRequestJson,
   originalBodyBase64:'',serviceResourceUrl:SERVICE}),ORIGINALS[i]);
  same(store.fenceOriginalDispatchIntent(KEYS[0]),INTENT);
 });
}
function sqlView(epoch){
 closed();const before=dbStamp('collection-main');
 const result=auxiliary('readOnly',()=>new DatabaseSync(databasePath('collection-main'),{
  allowExtension:false,enableDoubleQuotedStringLiterals:false,enableForeignKeyConstraints:true,
  readOnly:true,timeout:0}),db=>{
  const all=sql=>db.prepare(sql).all().map(row=>({...row}));
  q(db.prepare('PRAGMA user_version').get().user_version,3);
  q(db.prepare('PRAGMA application_id').get().application_id,0x5a505252);
  const meta=all('SELECT * FROM payer_recovery_meta LIMIT 2');
  const funding=all('SELECT * FROM payer_recovery_state LIMIT 2');
  const policy=all('SELECT * FROM original_request_custody_policy LIMIT 2');
  const rows=all('SELECT * FROM original_service_requests ORDER BY grant_id,request_id LIMIT 9');
  const intents=all('SELECT * FROM original_dispatch_intents ORDER BY grant_id,request_id LIMIT 9');
  const schema=all("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name LIMIT 6");
  same(meta,[{singleton:1,resource_url:FUNDING,owner_epoch:epoch}]);same(funding,LITERAL_FUNDING);
  same(policy,[{singleton:1,policy_version:1,max_requests:4,service_resource_url:SERVICE}]);
  same(rows,ROWS);same(intents,INTENTS);same(schema,SCHEMA);
  for(const [table,n] of [['payer_recovery_meta',1],['payer_recovery_state',1],
   ['original_request_custody_policy',1],['original_service_requests',3],['original_dispatch_intents',1]])
   q(db.prepare('SELECT count(*) AS n FROM '+table).get().n,n);
  for(const row of rows)ok(C.parseOriginalServiceRequestCustody(row.envelope));
  const stable={meta:meta.map(row=>({singleton:row.singleton,resource_url:row.resource_url})),
   funding,policy,rows,schema,intents};
  q(sha(canonical(stable)),GOLDEN.aggregate.stable.sha256);
  return {epoch,stable:sha(canonical(stable)),rows:rows.length,intents:intents.length};
 });
 same(dbStamp('collection-main'),before,'CLOSED_SQL_READONLY_WHOLE_STAMP_UNCHANGED');semanticEvidence.push(result);
}
function owner(e){return e.handle.snapshot().runner.client.owner;}
async function openOwned(grant,kind){
 const e=reserve(kind);
 try{
  const promise=OPEN_R({databasePath:databasePath('collection-main'),allowedRoot:join(fixtureRoot,'collection-main'),
   fundingResourceUrl:FUNDING,custodyPolicy:POLICY,selectedGrantId:grant,requestImpl,deadlineMs:2000});
  const seen=await observe(promise);if(!seen.ok)throw seen.error;e.handle=seen.value;e.state='OPEN';
  ok(Object.isFrozen(e.handle));same(Object.keys(e.handle),['runOriginals','readOriginal','readOriginalRecoveryState',
   'readOriginalRecoveryKeys','createOriginalRecoveryPlan','createOriginalRecoveryStatePlan','close','snapshot',
   'createOriginalRecoveryCollection']);for(const fn of Object.values(e.handle))ok(Object.isFrozen(fn));
  same(owner(e).counts,counts([0,0,0,0,0,0,0,0,0]));return e;
 }catch(error){hold(e,error);throw error;}
}
async function closeOwned(e){
 q(slot,e);q(e.state,'OPEN');q(e.closeAttempted,false);e.closeAttempted=true;
 try{
  const before=owner(e).counts,promise=e.handle.close();e.promise=promise;q(e.handle.close(),promise);
  const seen=await observe(promise);if(!seen.ok)throw seen.error;q(seen.value,undefined);
  const view=e.handle.snapshot(),o=owner(e);same(o.counts,before);same(o.uncertainty,UNCERTAIN);
  q(o.closed,true);q(o.active,false);q(view.resource.phase,'RELEASED');q(view.resource.slotHeld,false);
  q(view.resource.storeCloseAttempts,1);q(view.resource.storeCloseOutcome,'RETURNED');
  q(view.close.outcome,'DRAINED');q(view.close.childOutcome,'FULFILLED');
  q(view.close.childUncertainty,false);q(view.close.unknownUndrained,false);
  q(view.runner.runClaimed,false);q(view.runner.attempted,0);q(view.runner.completed,0);
  q(view.runner.closeCalls,1);q(view.runner.closeOutcome,'FULFILLED');q(view.runner.client.lastTransport,null);
  q(view.unknown,false);e.closeReturned=true;e.state='CLOSED';slot=null;
  rootEvidence.push([e.kind,'DRAINED','RETURNED',1,before]);unitFiles('collection-main');
 }catch(error){hold(e,error);throw error;}
}
function observations(){return JSON.stringify([0,1].map(i=>({...KEYS[i],observationJson:JSON.stringify({
 viewVersion:1,paymentHash:HASH,requestId:KEYS[i].requestId,fundingStatus:'INCLUDED',serviceStatus:'SUCCEEDED'})})));}
function noAction(value){
 deepFrozen(value);q(value.authority,'NONE');q(value.qualification,'UNQUALIFIED');
 for(const key of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed'])q(value[key],false);
}
function collectionView(value,empty=false){
 noAction(value);q(value.closed,false);q(value.unavailable,false);q(value.snapshotKind,'COMPLETE_OWNED_READ');
 q(value.grantId,empty?EMPTY:GRANT);same(value.keys,empty?[]:KEYS.slice(0,2));
 same(value.funding,{revision:3,status:'BOUND',ambiguityLatched:false,fundingResourceUrl:FUNDING,
  paymentHash:HASH,network:'zenon:testnet'});same(value.uncertainty,UNCERTAIN);
 q(value.currentFundingUncertain,false);q(value.observedFundingUncertain,false);
 q(value.nextStep,empty?'NO_RETAINED_ORIGINALS':'RECONCILIATION_REQUIRED');
 q(value.entries.length,empty?0:2);
 for(let i=0;i<value.entries.length;i++){
  same(value.entries[i].key,KEYS[i]);const p=value.entries[i].recoveryPlan;noAction(p);
  same(p.recoveryState.original,ORIGINALS[i]);q(SERIALIZE(p.recoveryState.original),ENVELOPES[i]);
  same(p.recoveryState.funding,value.funding);same(p.recoveryState.uncertainty,UNCERTAIN);
  same(p.recoveryState.dispatchIntent,i===0?INTENT:null);
  q(p.recoveryState.dispatchStatus,i===0?'POSSIBLY_ATTEMPTED':'NO_INTENT_RECORDED');
  q(p.nextStep,i===0?'RECONCILIATION_REQUIRED':'REVIEW_CURRENT_AUTHORITY_FOR_ORIGINAL');
  q(p.declaredPlan.view.phase,'RESULT_REPORTED');q(p.declaredPlan.authorization,'NONE');
  for(const node of [p.declaredPlan,p.declaredPlan.view])
   for(const key of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed'])q(node[key],false);
 }
}
function localClose(c,last,unavailable=false){
 const history=c.close();noAction(history);q(history.entries,last.entries);q(history.funding,last.funding);
 q(history.closed,true);q(history.unavailable,unavailable);q(history.failureKind,unavailable?'LIVE_READ_FAILED':'NONE');
 q(history.childCloseAttempts,last.entries.length);q(history.childCloseOutcome,'RETURNED');
 q(history.snapshotKind,'DETACHED_HISTORICAL');q(history.nextStep,'LOCALLY_CLOSED');
 q(c.close(),history);q(c.getSnapshot(),history);
 throws(()=>c.close(undefined),error=>error.code===CP+'INVALID_INPUT');
 throws(()=>c.getSnapshot(undefined),error=>error.code===CP+'INVALID_INPUT');return history;
}
function stableRead(work){
 const before=dbStamp('collection-main',true),result=work();
 same(dbStamp('collection-main',true),before,'COLLECTION_WHOLE_LIVE_DB_JOURNAL_STAMP_UNCHANGED');return result;
}
async function writer(){seed();sqlView(1);}
async function reader(){
 same(dbStamp('collection-main'),priorInput,'EXACT_WRITER_STAMP_BEFORE_FIRST_NATIVE_OPEN');
 const e=await openOwned(GRANT,'selected');
 let detached=null,live=null,detachedHistory=null,last=null;
 try{
  const initial=owner(e).counts;
  throws(()=>e.handle.createOriginalRecoveryCollection(),error=>error.code===CP+'INVALID_INPUT');
  throws(()=>e.handle.createOriginalRecoveryCollection('[]',undefined),error=>error.code===CP+'INVALID_INPUT');
  throws(()=>e.handle.createOriginalRecoveryCollection(' '+observations()),error=>error.code===CP+'INVALID_INPUT');
  same(owner(e).counts,initial);
  stableRead(()=>throws(()=>e.handle.createOriginalRecoveryCollection('[]'),error=>error.code===CP+'INVALID_INPUT'));
  same(owner(e).counts,counts([2,1,0,0,0,0,0,0,0]));
  const partial=JSON.parse(observations());partial[1].observationJson='{}';
  stableRead(()=>throws(()=>e.handle.createOriginalRecoveryCollection(JSON.stringify(partial)),
   error=>error.message==='INVALID_STATUS_VIEW_INPUT'));
  same(owner(e).counts,counts([8,4,0,0,0,0,0,2,0]));
  same(owner(e).uncertainty,UNCERTAIN);q(e.handle.snapshot().resource.storeCloseAttempts,0);
  detached=stableRead(()=>e.handle.createOriginalRecoveryCollection(observations()));diagnostics.push(detached);
  last=stableRead(()=>detached.getSnapshot());collectionView(last);
  same(owner(e).counts,counts([28,14,0,0,0,0,0,8,0]));
  throws(()=>detached.getSnapshot(undefined),error=>error.code===CP+'INVALID_INPUT');
  throws(()=>detached.close(undefined),error=>error.code===CP+'INVALID_INPUT');
  detachedHistory=stableRead(()=>localClose(detached,last));same(owner(e).counts,counts([28,14,0,0,0,0,0,8,0]));
  q(e.handle.snapshot().resource.phase,'OPEN');q(e.handle.snapshot().resource.storeCloseAttempts,0);
  live=stableRead(()=>e.handle.createOriginalRecoveryCollection(observations()));diagnostics.push(live);
  last=stableRead(()=>live.getSnapshot());collectionView(last);
  same(owner(e).counts,counts([48,24,0,0,0,0,0,14,0]));
 }finally{
  if(e.state==='OPEN'&&!e.closeAttempted)await closeOwned(e);
 }
 q(e.state,'CLOSED');const before=owner(e).counts,afterRoot=dbStamp('collection-main');
 throws(()=>live.getSnapshot(),error=>error.code===XP+'CLOSED');
 throws(()=>live.getSnapshot(),error=>error.code===CP+'RECOVERY_COLLECTION_UNAVAILABLE');
 same(owner(e).counts,before);same(owner(e).uncertainty,UNCERTAIN);
 const history=localClose(live,last,true);same(owner(e).counts,before);
 q(detached.getSnapshot(),detachedHistory);q(detached.close(),detachedHistory);
 q(e.handle.close(),e.promise);q(e.handle.snapshot().resource.storeCloseAttempts,1);
 q(e.handle.snapshot().resource.phase,'RELEASED');q(e.handle.snapshot().close.outcome,'DRAINED');
 same(dbStamp('collection-main'),afterRoot,'POST_ROOT_DIAGNOSTIC_HISTORY_HAS_NO_NATIVE_OR_DB_EFFECT');
 collectionEvidence.push(['selected',2,'RECONCILIATION_REQUIRED',history.unavailable,
  history.childCloseAttempts,history.childCloseOutcome,owner(e).counts]);
 e.handle=null;e.promise=null;
 const empty=await openOwned(EMPTY,'empty');
 try{
  const c=stableRead(()=>empty.handle.createOriginalRecoveryCollection('[]'));diagnostics.push(c);
  const v=stableRead(()=>c.getSnapshot());collectionView(v,true);
  same(owner(empty).counts,counts([8,4,0,0,0,0,0,0,0]));
  const h=stableRead(()=>localClose(c,v));q(empty.handle.snapshot().resource.storeCloseAttempts,0);
  collectionEvidence.push(['empty',0,h.unavailable,h.childCloseAttempts,h.childCloseOutcome,owner(empty).counts]);
 }finally{if(empty.state==='OPEN'&&!empty.closeAttempted)await closeOwned(empty);}
 empty.handle=null;empty.promise=null;sqlView(3);
}
async function selected(t){
 const problems=[];
 try{if(phase==='writer')await writer();else await reader();}catch(error){problems.push(error);}
 finally{for(const c of diagnostics){try{c.close();}catch(error){problems.push(error);}}}
 if(problems.length)throw new AggregateError(problems,'SQLITE_COLLECTION_NOT_QUALIFIED');
 q(diagnostics.length,phase==='writer'?0:3);
 closed();descriptors();q(requestCalls,0);same(readdirSync(fixtureRoot),['collection-main']);
 const kinds=phase==='writer'?['seed','readOnly']:['selected','empty','readOnly'];
 same(entries.map(e=>e.kind),kinds);
 for(const e of entries){q(e.state,'CLOSED');q(e.closeAttempted,true);q(e.closeReturned,true);q(e.handle,null);}
 const a=privateDirectory(scratch),b=privateDirectory(fixtureRoot,a.dev);
 same([a.dev,a.ino],[scratchId.dev,scratchId.ino]);same([b.dev,b.ino],[fixtureId.dev,fixtureId.ino]);
 const final=redact(dbStamp('collection-main'));bodyPassed=true;
 const value={phase,pid:process.pid,ppid:process.ppid,priorPid,input:priorInput===null?null:redact(priorInput),
  final,entries:entries.map(e=>[e.kind,e.state,e.closeReturned]),roots:rootEvidence,
  collections:collectionEvidence,semantic:semanticEvidence,requestCalls,rawMutations:0,
  maxLiveHandles:1,liveMutationCoverage:'NOT_TESTED_EXCLUSIVE_STORE_CONTRACT',
  rawDisposition:'UNREGISTERED_HOLD',bodyPassed,qualification:'UNQUALIFIED',authority:'NONE',delivery:'NOT_ESTABLISHED'};
 const output=JSON.stringify(value);ok(Buffer.byteLength(output)<=4096);
 ok(!output.includes(scratch)&&!output.includes(fixtureRoot));t.diagnostic(output);
}
const TITLES={
 writer:'V3 collection writer retains literal selected and foreign originals with one reconciliation intent',
 reader:'fresh owned V3 recovery collection binds catalog and detaches history across actual root close',
};
test(TITLES[phase],{timeout:12000},selected);
