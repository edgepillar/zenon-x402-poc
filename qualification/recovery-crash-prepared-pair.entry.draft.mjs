/*
 * SOURCE DRAFT: dedicated PREPARED-before-executor managed command entry.
 * Never imported/run by CI or by DATA profile tests. An explicit selection
 * label is not native permission, an OS sandbox, or a production safety claim.
 * The reviewed managed launcher must pin this file and all five parent inputs
 * BEFORE command entry. Complete private capture goes to bounded stdout once;
 * it is not a public report and must not be printed/exported without review.
 */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { constants,openSync,closeSync,readSync,lstatSync,fstatSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';

const E=process.env,KIND='OFFICIAL_ISSUED_PREPARED_CRASH_PAIR_PARENT_CONTROL_V1';
const PREFIX='app/qualification/',ENTRY=PREFIX+'recovery-crash-prepared-pair.entry.draft.mjs';
const SUPERVISOR=PREFIX+'recovery-crash-prepared-supervisor.draft.mjs';
const PROTOCOL=PREFIX+'recovery-crash-prepared-cutpoint-protocol.js';
const NAMES=[ENTRY,SUPERVISOR,PROTOCOL,'app/src/service-credit-pilot-original-payment-checkpoint.js','app/package.json'].sort();
const SEAL='31fe255b2862dfd2eb0647b8a8b34f9bd4d48e4a6b3afec65846b0a0889ec6b9';
const HASH=/^[0-9a-f]{64}$/,LIMIT=524288,F=Object.freeze;
const sha=raw=>createHash('sha256').update(raw).digest('hex');
function refuse(){throw new TypeError('RECOVERY_PREPARED_CRASH_PARENT_ENTRY_REFUSED');}
function exact(value,names){
  if(value===null||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype
      ||Reflect.ownKeys(value).length!==names.length||names.some(n=>!Object.hasOwn(value,n)))refuse();
}
function id(s){return[s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String);}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function readOwned(file,cap,expected,privateMode=false){
  if(typeof file!=='string'||!file.startsWith('/')||file.length>4096)refuse();
  for(let at=file;;at=dirname(at)){if(lstatSync(at).isSymbolicLink())refuse();if(dirname(at)===at)break;}
  const before=lstatSync(file,{bigint:true}),identity=id(before);
  if(!before.isFile()||before.uid!==BigInt(process.getuid())||before.nlink!==1n||before.size<1n||before.size>BigInt(cap)
      ||expected&&!same(identity,expected)||privateMode&&(before.mode&0o077n)!==0n)refuse();
  const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    if(!same(id(fstatSync(fd,{bigint:true})),identity))refuse();
    const bytes=Buffer.alloc(Number(before.size)+1);let used=0;
    while(used<bytes.length){const n=readSync(fd,bytes,used,bytes.length-used,null);if(!n)break;used+=n;}
    if(used!==Number(before.size)||!same(id(fstatSync(fd,{bigint:true})),identity)
        ||!same(id(lstatSync(file,{bigint:true})),identity))refuse();
    return bytes.subarray(0,used);
  }finally{closeSync(fd);}
}
if(process.version!=='v24.19.0'||process.platform!=='darwin'||process.arch!=='arm64'
    ||process.argv.length!==3||process.argv[2]!==E.SPV_TASK_SCRATCH
    ||E.X402_RECOVERY_CRASH_PARENT_SELECTION!=='one-owned-prepared-crash-pair-source-draft-v1'
    ||E.NODE_DISABLE_COMPILE_CACHE!=='1'||E.NODE_OPTIONS!==undefined||E.NODE_PATH!==undefined
    ||E.NODE_TEST_CONTEXT!==undefined||E.NODE_V8_COVERAGE!==undefined
    ||!HASH.test(E.X402_RECOVERY_CRASH_RUN_ID||'')
    ||!HASH.test(E.X402_RECOVERY_CRASH_PARENT_PROFILE_SHA256||'')
    ||!HASH.test(E.X402_RECOVERY_CRASH_PROFILE_SHA256||''))refuse();
const flags=['--no-addons','--disallow-code-generation-from-strings','--disable-proto=throw','--unhandled-rejections=strict'];
if(!same(process.execArgv,flags))refuse();
const raw=readOwned(E.X402_RECOVERY_CRASH_PARENT_PROFILE_PATH,32768,undefined,true);
if(sha(raw)!==E.X402_RECOVERY_CRASH_PARENT_PROFILE_SHA256)refuse();
const profile=JSON.parse(raw.toString('ascii'));
exact(profile,['profileVersion','profileKind','entryURL','inputs','sourceRowsSha256','childEntrySha256','childPreloadSha256']);
if(profile.profileVersion!==1||profile.profileKind!==KIND||profile.sourceRowsSha256!==SEAL
    ||profile.entryURL!==import.meta.url||!HASH.test(profile.childEntrySha256)||!HASH.test(profile.childPreloadSha256)
    ||!Array.isArray(profile.inputs)||profile.inputs.length!==5)refuse();
const byName=new Map(),seenURLs=new Set();
for(const row of profile.inputs){
  exact(row,['logicalPath','url','bytes','LF','sha256','gitBlob','identity']);
  const u=new URL(row.url);
  if(!NAMES.includes(row.logicalPath)||byName.has(row.logicalPath)||seenURLs.has(row.url)
      ||u.protocol!=='file:'||u.host||u.search||u.hash||pathToFileURL(fileURLToPath(u)).href!==row.url
      ||!Number.isSafeInteger(row.bytes)||row.bytes<1||row.bytes>131072
      ||!Number.isSafeInteger(row.LF)||row.LF<0||row.LF>row.bytes
      ||!HASH.test(row.sha256)||!/^[0-9a-f]{40}$/.test(row.gitBlob)
      ||!Array.isArray(row.identity)||row.identity.length!==9
      ||!row.identity.every(v=>typeof v==='string'&&/^[0-9]{1,24}$/.test(v)))refuse();
  const bytes=readOwned(fileURLToPath(u),131072,row.identity);let LF=0;
  for(const byte of bytes)if(byte===10)LF++;
  if(bytes.length!==row.bytes||LF!==row.LF||sha(bytes)!==row.sha256
      ||createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')!==row.gitBlob)refuse();
  byName.set(row.logicalPath,row);seenURLs.add(row.url);
}
if(byName.size!==5||byName.get(ENTRY).url!==import.meta.url
    ||byName.get(SUPERVISOR).sha256!=='d6fa6668ccea2f7f9b911aa1131d8840bb8cbfe211287df2eab18edde4d78e66'
    ||byName.get(PROTOCOL).sha256!=='e84d4ddf642f5a63bde0e17a4cb65b5bb1c4ee7f31a0e3cf917287741331131f')refuse();
const rootURL=new URL('../',import.meta.url); // Parent entry is in qualification/.
for(const row of byName.values()){
  if(new URL(row.logicalPath.slice(4),rootURL).href!==row.url)refuse();
}
function blob(bytes,cap){
  if(!Buffer.isBuffer(bytes)||bytes.length>cap)refuse();
  return F({bytes:bytes.length,sha256:sha(bytes),base64:bytes.toString('base64')});
}
function textBlob(text,cap){
  if(text===null)return null;
  if(typeof text!=='string')refuse();
  return blob(Buffer.from(text),cap);
}
function child(value){
  if(value===null)return null;
  const {pid,code,signal,stdoutComplete,stderrComplete,ipcClosed,fault,killSent,stdout,stderr}=value;
  return F({pid,code,signal,stdoutComplete,stderrComplete,ipcClosed,fault,killSent,
    stdout:blob(stdout,65536),stderr:blob(stderr,8192)});
}
try{
  // No application/SDK import: the exact parent graph is builtins, protocol and
  // original-payment checkpoint DATA. Only its later owned forks are effectful.
  const {runOwnedPreparedIntentCrashPair:RUN}=await import(byName.get(SUPERVISOR).url);
  const result=await RUN(F({scratchRoot:process.argv[2],childEntrySha256:profile.childEntrySha256,
    childPreloadSha256:profile.childPreloadSha256,profilePath:E.X402_RECOVERY_CRASH_PROFILE_PATH,
    profileSha256:E.X402_RECOVERY_CRASH_PROFILE_SHA256,
    context:F({runId:E.X402_RECOVERY_CRASH_RUN_ID,sourceRowsSha256:SEAL}),
    seedInputJson:"{\"seedInputVersion\":1,\"cutpointKind\":\"PREPARED_BEFORE_EXECUTOR\",\"maximumCutpointWaitMs\":5000}"}));
  const packed=F({captureVersion:1,kind:'OWNED_ISSUED_PREPARED_CRASH_PAIR_PRIVATE_CAPTURE_NOT_PRODUCTION',
    cutpointKind:'PREPARED_BEFORE_EXECUTOR',
    status:result.status,sourceRowsSha256:SEAL,protocol:result.protocol,seed:child(result.seed),recovery:child(result.recovery),
    seedEvidence:result.seedEvidence,recoveryEvidence:result.recoveryEvidence,
    privateFundingWitness:textBlob(result.privateFundingWitnessJson,32768),
    privateOriginalWitness:textBlob(result.privateWitnessJson,65536),
    selectedApplicationCrashQualified:false,physicalDurabilityQualified:false,authority:'NONE'});
  const bytes=Buffer.from(JSON.stringify(packed)+'\n');
  if(bytes.length>LIMIT)refuse();
  await new Promise((yes,no)=>process.stdout.write(bytes,error=>error?no(error):yes()));
  process.exitCode=result.status==='OBSERVED_PREPARED_PROCESS_PAIR_PROTOCOL_COMPLETE'?0:1;
  // Natural parent exit only. The managed command still owns timeout/group
  // failure handling; zero exit alone never proves stream or child completion.
}catch{
  process.exitCode=1;
  process.stderr.write('RECOVERY_PREPARED_CRASH_PARENT_FAILED_RETAIN_PRIVATE_CAPTURE\n');
}


