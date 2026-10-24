// SOURCE DRAFT: owned native-process coordination, never imported/executed by CI.
// The separate committed-intent SQLite child program and its full current graph
// must be completed/pinned/reviewed before this coordinator may be qualified.
// Existing V3 clean permission does NOT authorize this two-child/SIGKILL scope.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { fork } from 'node:child_process';
import { lstatSync, openSync, fstatSync, closeSync, readSync, constants } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout, clearTimeout } from 'node:timers';
import { types as utilTypes } from 'node:util';
import { createRecoveryCrashCutpointProtocol } from './recovery-crash-cutpoint-protocol-v2.js';
import { restoreOriginalPaymentCheckpoint } from '../src/service-credit-pilot-original-payment-checkpoint.js';

const F = Object.freeze, IS_PROXY = utilTypes.isProxy, K = Reflect.ownKeys;
const ENTRY = resolve(dirname(fileURLToPath(import.meta.url)), 'recovery-crash-committed-intent.child.draft.mjs');
const PRELOAD = resolve(dirname(fileURLToPath(import.meta.url)), 'recovery-crash-full-namespace.preload.draft.mjs');
const OUT_LIMIT = 65536, ERR_LIMIT = 8192, MESSAGE_LIMIT = 65536;
// Keep the actual issued application's principal paths. Do not introduce a
// smaller substitute pair just to make an otherwise different case pass.
const FILES = ['native-issued-service.sqlite', 'native-issued-payer-v6.sqlite'];
const HASH = /^[0-9a-f]{64}$/, IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function refuse() { throw new TypeError('OWNED_RECOVERY_CRASH_PAIR_REFUSED'); }
function exact(value, fields) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || Object.getPrototypeOf(value) !== Object.prototype || K(value).length !== fields.length) refuse();
  const result = {};
  for (const name of fields) {
    const d = Object.getOwnPropertyDescriptor(value, name);
    if (!d || !Object.hasOwn(d, 'value') || d.enumerable !== true) refuse();
    Object.defineProperty(result, name, { value: d.value, enumerable: true });
  }
  return F(result);
}
const identity = s => [s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String);
function noLinks(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || resolve(path) !== path) refuse();
  for (let at = path;; at = dirname(at)) {
    if (lstatSync(at).isSymbolicLink()) refuse();
    if (dirname(at) === at) break;
  }
}
function privateRoot(path) {
  noLinks(path); const s = lstatSync(path, { bigint: true });
  if (!s.isDirectory() || s.uid !== BigInt(process.getuid()) || (s.mode & 0o7777n) !== 0o700n) refuse();
  return identity(s).slice(0,6);
}
function entryPin(expected,file=ENTRY) {
  if (typeof expected !== 'string' || !HASH.test(expected)) refuse();
  noLinks(file); const s = lstatSync(file, { bigint: true }), before = identity(s);
  if (!s.isFile() || s.nlink !== 1n || s.uid !== BigInt(process.getuid()) || s.size < 1n || s.size > 131072n) refuse();
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW), raw = Buffer.alloc(Number(s.size)+1);
  let used = 0;
  try {
    if (identity(fstatSync(fd,{bigint:true})).join(':') !== before.join(':')) refuse();
    while (used < raw.length) {
      const n = readSync(fd,raw,used,raw.length-used,null); if (!n) break; used += n;
    }
    if (used !== Number(s.size) || sha(raw.subarray(0,used)) !== expected
        || identity(fstatSync(fd,{bigint:true})).join(':') !== before.join(':')
        || identity(lstatSync(file,{bigint:true})).join(':') !== before.join(':')) refuse();
    return before;
  } finally { raw.fill(0); closeSync(fd); }
}
function profilePin(path,expected,describe=false) {
  noLinks(path); const s=lstatSync(path,{bigint:true}),before=identity(s);
  if(!s.isFile() || s.uid!==BigInt(process.getuid()) || s.nlink!==1n
      || (s.mode&0o077n)!==0n || s.size<1n || s.size>524288n)refuse();
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW),raw=Buffer.alloc(Number(s.size)+1);
  let used=0;
  try {
    if(!same(identity(fstatSync(fd,{bigint:true})),before))refuse();
    while(used<raw.length){const n=readSync(fd,raw,used,raw.length-used,null);if(!n)break;used+=n;}
    if(used!==Number(s.size) || sha(raw.subarray(0,used))!==expected
        || !same(identity(fstatSync(fd,{bigint:true})),before)
        || !same(identity(lstatSync(path,{bigint:true})),before))refuse();
    if(!describe)return before;
    const profile=JSON.parse(raw.subarray(0,used).toString('ascii'));
    if(profile.profileVersion!==1||profile.profileKind!=='OFFICIAL_ISSUED_FULL_GRAPH_CRASH_PAIR_NODE24_V1'
        ||profile.baselineManifestSha256!=='51ffb5b0ff0052523c1b7f3d75fa24e9be27e60ca3bcc09236b1f439096aaed1'
        ||profile.sourceTransform!==false||profile.ordinaryInstalledNamespace!==false
        ||!Array.isArray(profile.inputs)||profile.inputs.length<525||profile.inputs.length>660)refuse();
    const applicationFiles=profile.inputs.filter(r=>typeof r.logicalPath==='string'&&r.logicalPath.startsWith('app/')).length;
    const packageFiles=profile.inputs.filter(r=>typeof r.logicalPath==='string'&&r.logicalPath.startsWith('packages/')).length;
    const declaredSourceBytes=profile.inputs.reduce((n,r)=>n+r.bytes,0);
    if(applicationFiles<121||applicationFiles>256||packageFiles!==404
        ||!Number.isSafeInteger(declaredSourceBytes)||declaredSourceBytes<1||declaredSourceBytes>6291456)refuse();
    return F({identity:before,plan:F({sourceRowsSha256:profile.sourceRowsSha256,applicationFiles,packageFiles,
      inputs:profile.inputs.length,declaredSourceBytes})});
  } finally {raw.fill(0);closeSync(fd);}
}
function same(first,second) { return first.join(':') === second.join(':'); }
function fileIdentity(root,name) {
  const path=join(root,name); noLinks(path); const s=lstatSync(path,{bigint:true});
  if (!s.isFile() || s.dev!==lstatSync(root,{bigint:true}).dev || s.nlink!==1n || s.uid!==BigInt(process.getuid())
      || (s.mode&0o7777n)!==0o600n || s.size<1n || s.size>1048576n) refuse();
  return identity(s).slice(0,6);
}
function boundedWire(value) {
  // IPC comes only from the pinned owned child, not arbitrary caller getters.
  const text=JSON.stringify(value);
  if (typeof text!=='string' || text.length>MESSAGE_LIMIT || Buffer.byteLength(text)>MESSAGE_LIMIT) refuse();
  return value;
}
function boundedText(text,maximum){
  if(typeof text!=='string'||text.length>maximum||Buffer.byteLength(text)>maximum)refuse();
}
function captureFundingWitness(text,summary){
  boundedText(text,32768);
  const w=exact(JSON.parse(text),['witnessVersion','fundingResourceUrl','serviceResourceUrl','transactionHash',
    'paymentRequiredHeader','paymentSignatureHeader','serializedCheckpoint','checkpointPins','nowEpochMs']);
  if(JSON.stringify(w)!==text||w.witnessVersion!==2||w.transactionHash!==summary.paymentHash
      ||typeof w.serializedCheckpoint!=='string'||sha(w.serializedCheckpoint)!==summary.checkpointSha256
      ||sha(JSON.stringify(w.checkpointPins))!==summary.checkpointPinsSha256
      ||!Number.isSafeInteger(w.nowEpochMs)||w.nowEpochMs<1||w.nowEpochMs>Number.MAX_SAFE_INTEGER-60000)refuse();
  const checkpoint=restoreOriginalPaymentCheckpoint(w.serializedCheckpoint,w.checkpointPins);
  if(checkpoint.binding.paymentHash!==w.transactionHash
      ||checkpoint.originalBytes.paymentPayload!==w.paymentSignatureHeader
      ||checkpoint.originalBytes.paymentRequirements!==w.paymentRequiredHeader)refuse();
  const funding=new URL(w.fundingResourceUrl),service=new URL(w.serviceResourceUrl);
  if(funding.protocol!=='https:'||funding.hostname!=='127.0.0.1'||funding.pathname!=='/funding'
      ||funding.search||funding.hash||funding.username||funding.password
      ||service.origin!==funding.origin||service.pathname!=='/service-credit/v1/execute'
      ||service.search||service.hash||service.username||service.password
      ||checkpoint.binding.origin!==funding.origin)refuse();
  const payload=JSON.parse(Buffer.from(w.paymentSignatureHeader,'base64').toString('utf8'));
  if(payload?.payload?.transaction?.hash!==w.transactionHash)refuse();
  return w; // Independent seed bytes, never learned again from recovery SQL.
}
function captureWitness(text,summary,fundingText,root){
  boundedText(text,16384);
  const w=exact(JSON.parse(text),['witnessVersion','grantId','requestId','originalRequestJson',
    'authorizationHeader','fundingWitnessSha256','payerIdentity','backendIdentity']);
  if(JSON.stringify(w)!==text||w.witnessVersion!==2||w.grantId!==summary.grantId||w.requestId!==summary.requestId
      ||!IDENTIFIER.test(w.grantId)||!IDENTIFIER.test(w.requestId)||w.fundingWitnessSha256!==sha(fundingText)
      ||typeof w.originalRequestJson!=='string'||Buffer.byteLength(w.originalRequestJson)>4096
      ||sha(w.originalRequestJson)!==summary.originalRequestSha256
      ||typeof w.authorizationHeader!=='string'||!w.authorizationHeader.startsWith('ServiceCredit ')
      ||Buffer.byteLength(w.authorizationHeader)>1024||/[\r\n\0]/.test(w.authorizationHeader))refuse();
  const request=exact(JSON.parse(w.originalRequestJson),['modelVersion','grantId','requestId','method',
    'routeId','canonicalBodyDigest','selectedContentType','maxCostUnits']);
  if(JSON.stringify(request)!==w.originalRequestJson||request.modelVersion!==1
      ||request.grantId!==w.grantId||request.requestId!==w.requestId||request.method!=='POST'
      ||request.routeId!=='service-credit.execute.v1'||request.selectedContentType!=='application/json'
      ||request.maxCostUnits!==2||request.canonicalBodyDigest!=='sha256:'+sha(Buffer.alloc(0)))refuse();
  for(const[name,wanted]of [[FILES[0],w.backendIdentity],[FILES[1],w.payerIdentity]]){
    if(!Array.isArray(wanted)||wanted.length!==6||!wanted.every(v=>typeof v==='string'&&/^[0-9]{1,24}$/.test(v))
        ||!same(fileIdentity(root,name),wanted))refuse();
  }
  return w;
}
function namespace(value,mode,context,plan){
  const n=exact(value,['profileKind','profileVersion','mode','sourceRowsSha256','applicationFiles','packageFiles',
    'inputsVerifiedBeforeCase','declaredSourceBytes','baselineApplication117Preserved','baselinePackages404Preserved',
    'resolveCalls','bareImportOverrideHits','declaredFilesResolved','sourceTransforms','nativeBuiltinAliases',
    'ordinaryInstalledNamespaceQualified','nativeOsNetworkSandbox']);
  if(n.profileKind!=='OFFICIAL_ISSUED_FULL_GRAPH_CRASH_PAIR_NODE24_V1'||n.profileVersion!==1||n.mode!==mode
      ||n.sourceRowsSha256!==context.sourceRowsSha256||n.applicationFiles!==plan.applicationFiles
      ||n.packageFiles!==plan.packageFiles||n.inputsVerifiedBeforeCase!==plan.inputs
      ||n.declaredSourceBytes!==plan.declaredSourceBytes||n.baselineApplication117Preserved!==true
      ||n.baselinePackages404Preserved!==true||n.sourceTransforms!==0||n.nativeBuiltinAliases!==0
      ||n.ordinaryInstalledNamespaceQualified!==false||n.nativeOsNetworkSandbox!==false)refuse();
  for(const key of ['resolveCalls','bareImportOverrideHits','declaredFilesResolved'])
    if(!Number.isSafeInteger(n[key])||n[key]<0||n[key]>8192)refuse();
  return n;
}
function effectCeilings(value,seed){
  const fields=['walletKeys','transactionSignatures','capabilityKeys','capabilitySignatures','providerKeys','providerSignatures',
    'referenceCandidates','producerCandidateReservation','fixedVerificationReservation','aggregateCandidateReservation',
    'independentPinFiles','readonlySqliteOpens','fundingPosts','serviceExecutions','foreignGrantRefusals',
    'sdkPrepareBlock','realPayment'];
  const e=exact(value,fields);
  for(const key of fields.slice(0,-2))if(!Number.isSafeInteger(e[key])||e[key]<0)refuse();
  if(e.sdkPrepareBlock!==false||e.realPayment!==false||e.readonlySqliteOpens!==4)refuse();
  const wanted=seed?{walletKeys:1,transactionSignatures:1,capabilityKeys:2,capabilitySignatures:2,providerKeys:1,providerSignatures:2,
    independentPinFiles:2,fundingPosts:1,serviceExecutions:1,foreignGrantRefusals:1}
    :{walletKeys:0,transactionSignatures:0,capabilityKeys:0,capabilitySignatures:0,providerKeys:0,providerSignatures:0,
      independentPinFiles:0,fundingPosts:0,serviceExecutions:0,foreignGrantRefusals:0};
  if(Object.keys(wanted).some(k=>e[k]!==wanted[k]))refuse();
  if(seed){
    if(e.referenceCandidates<1||e.referenceCandidates>32768||e.producerCandidateReservation!==4096
        ||e.fixedVerificationReservation!==16384
        ||e.aggregateCandidateReservation!==e.referenceCandidates+4096+16384
        ||e.aggregateCandidateReservation>65536)refuse();
  }else if(['referenceCandidates','producerCandidateReservation','fixedVerificationReservation','aggregateCandidateReservation'].some(k=>e[k]!==0))refuse();
  return e;
}
function launch(phase,root,profilePath,profileSha256) {
  return fork(ENTRY,[root,phase],{
    execPath:process.execPath,
    execArgv:['--no-addons','--disallow-code-generation-from-strings','--disable-proto=throw','--unhandled-rejections=strict','--import='+PRELOAD],
    cwd:root,detached:false,serialization:'json',stdio:['ignore','pipe','pipe','ipc'],
    env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',TZ:'UTC',NODE_DISABLE_COMPILE_CACHE:'1',
      WS_NO_BUFFER_UTIL:'1',WS_NO_UTF_8_VALIDATE:'1',X402_ISSUED_NATIVE_VERTICAL_SELECTION:'current-native-issued-post-source-draft-v1',
      SPV_TASK_SCRATCH:root,X402_RECOVERY_CRASH_CHILD_SELECTION:'one-owned-committed-intent-source-draft',
      X402_RECOVERY_CRASH_PROFILE_PATH:profilePath,X402_RECOVERY_CRASH_PROFILE_SHA256:profileSha256},
  });
}
function observe(child,onMessage,timeoutMs) {
  let exit=null,closed=false,disconnected=false,fault=false,killSent=false;
  const output={stdout:[],stderr:[]},seen={stdout:0,stderr:0},ended={stdout:false,stderr:false};
  const overflow={stdout:false,stderr:false};
  function stop() {
    if (closed || exit!==null || killSent || !Number.isSafeInteger(child.pid)) return false;
    killSent=true;
    try { return child.kill('SIGKILL')===true; } catch { fault=true;return false; }
  }
  const done=new Promise(resolveDone=>{
    const timer=setTimeout(()=>{fault=true;stop();},timeoutMs);
    for (const name of ['stdout','stderr']) {
      const stream=child[name],limit=name==='stdout'?OUT_LIMIT:ERR_LIMIT;
      stream.on('data',chunk=>{
        if (!Buffer.isBuffer(chunk) || seen[name]+chunk.length>limit) {overflow[name]=true;fault=true;stop();return;}
        seen[name]+=chunk.length;output[name].push(Buffer.from(chunk));
      });
      stream.once('end',()=>{ended[name]=true;});
      stream.on('error',()=>{fault=true;stop();});
    }
    child.on('message',message=>{
      if (fault) return;
      try {onMessage(boundedWire(message),stop);}
      catch {fault=true;stop();}
    });
    child.on('error',()=>{fault=true;stop();});
    child.once('disconnect',()=>{disconnected=true;});
    child.once('exit',(code,signal)=>{exit={code,signal};});
    child.once('close',(code,signal)=>{
      clearTimeout(timer);closed=true;
      // 'exit' alone is deliberately insufficient; retain EOF/channel facts.
      const agree=exit!==null && code===exit.code && signal===exit.signal;
      const stdout=Buffer.concat(output.stdout,seen.stdout),stderr=Buffer.concat(output.stderr,seen.stderr);
      resolveDone(F({pid:child.pid,code,signal,stdoutComplete:agree&&ended.stdout&&!overflow.stdout,
        stderrComplete:agree&&ended.stderr&&!overflow.stderr,
        ipcClosed:disconnected,fault:fault||!agree,killSent,stdout,stderr}));
    });
  });
  return F({done,stop});
}

/**
 * Internal source-draft coordinator, no command-line/autostart entry.
 * Requires a separately reviewed native allowance and managed scratch before
 * use. Source/namespace/manager/runtime/mount/quota guards belong to the pinned
 * launcher and mandatory child profile; an environment string is NOT approval.
 * At most one seed and one recovery process; signals target only these exact
 * ChildProcess objects, including bounded failure-only stops, never a PID scan.
 *
 * The actual child/namespace sources are authored; their complete source
 * inventory and managed launcher/native qualification remain unfinished.
 * Missing entry/preload/profile refuses before fork. No DATA result proves
 * this native supervisor, SQLite recovery, SIGKILL handling or OS cleanup.
 */
export async function runOwnedCommittedIntentCrashPair(configuration){
  if(arguments.length!==1||process.version!=='v24.19.0'||process.platform!=='darwin'
      ||process.arch!=='arm64'||typeof process.getuid!=='function')refuse();
  const c=exact(configuration,['scratchRoot','childEntrySha256','childPreloadSha256','profilePath','profileSha256','context','seedInputJson']);
  if(c.seedInputJson!=='{"seedInputVersion":1,"maximumCutpointWaitMs":5000}'
      ||typeof c.profileSha256!=='string'||!HASH.test(c.profileSha256))refuse();
  const context=exact(c.context,['runId','sourceRowsSha256']);
  if(!Object.values(context).every(v=>typeof v==='string'&&HASH.test(v)))refuse();
  const rootId=privateRoot(c.scratchRoot),entryId=entryPin(c.childEntrySha256),preloadId=entryPin(c.childPreloadSha256,PRELOAD);
  const described=profilePin(c.profilePath,c.profileSha256,true),profileId=described.identity,plan=described.plan;
  if(plan.sourceRowsSha256!==context.sourceRowsSha256)refuse();
  for(const name of FILES)for(const suffix of ['','-wal','-shm','-journal']){
    try{lstatSync(join(c.scratchRoot,name+suffix));refuse();}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  let seed=null,recovery=null,protocol=null,funding=null,witness=null;
  let privateFundingWitnessJson=null,privateWitnessJson=null,seedEvidence=null,recoveryEvidence=null;
  let seedObservation=null,recoveryObservation=null,seedOwner=null,recoveryOwner=null,seedBoot=false,recoveryBoot=false;
  const unchanged=()=>{
    if(!same(privateRoot(c.scratchRoot),rootId)||!same(entryPin(c.childEntrySha256),entryId)
        ||!same(entryPin(c.childPreloadSha256,PRELOAD),preloadId)||!same(profilePin(c.profilePath,c.profileSha256),profileId))refuse();
  };
  const termination=o=>({pid:o.pid,code:o.code,signal:o.signal,stdoutComplete:o.stdoutComplete,
    stderrComplete:o.stderrComplete,ipcClosed:o.ipcClosed});
  const originalsUnchanged=()=>{
    if(witness===null)refuse();
    for(const[name,id]of [[FILES[0],witness.backendIdentity],[FILES[1],witness.payerIdentity]])
      if(!same(fileIdentity(c.scratchRoot,name),id))refuse();
  };
  try{
    unchanged();seed=launch('seed',c.scratchRoot,c.profilePath,c.profileSha256);
    seedOwner=observe(seed,(message,stop)=>{
      if(message.kind==='CHILD_BOOT_READY'){
        const m=exact(message,['kind','mode','namespace']);
        if(seedBoot||m.mode!=='seed')refuse();namespace(m.namespace,'seed',context,plan);seedBoot=true;
        seed.send({kind:'SEED_INPUT',context,seedInputJson:c.seedInputJson},error=>{if(error)stop();});
      }else if(message.kind==='FUNDING_ORIGINAL_WITNESS'){
        const m=exact(message,['kind','summary','witnessJson']);if(!seedBoot)refuse();
        protocol.captureFundingOriginalWitness(m.summary);funding=captureFundingWitness(m.witnessJson,m.summary);
        privateFundingWitnessJson=m.witnessJson;unchanged();
        seed.send({kind:'FUNDING_ORIGINAL_FIXED',runId:context.runId},error=>{if(error)stop();});
      }else if(message.kind==='ORIGINAL_WITNESS'){
        const m=exact(message,['kind','summary','witnessJson']);if(funding===null)refuse();
        protocol.captureOriginalWitness(m.summary);
        witness=captureWitness(m.witnessJson,m.summary,privateFundingWitnessJson,c.scratchRoot);
        privateWitnessJson=JSON.stringify({funding,service:witness});boundedText(privateWitnessJson,65536);unchanged();
        seed.send({kind:'ORIGINAL_WITNESS_FIXED',runId:context.runId},error=>{if(error)stop();});
      }else if(message.kind==='COMMITTED_CUTPOINT'){
        const m=exact(message,['kind','summary','namespace','effects']);protocol.captureCommittedCutpoint(m.summary);
        seedEvidence=F({namespace:namespace(m.namespace,'seed',context,plan),effects:effectCeilings(m.effects,true)});
        originalsUnchanged();unchanged();const chosen=protocol.requestSeedKill();
        if(chosen.pid!==seed.pid||chosen.signal!=='SIGKILL')refuse();
        protocol.recordSeedKillResult(stop());
      }else refuse();
    },45000);
    protocol=createRecoveryCrashCutpointProtocol(context,seed.pid);
    seedObservation=await seedOwner.done;if(seedObservation.fault)refuse();
    protocol.recordSeedTermination(termination(seedObservation));unchanged();originalsUnchanged();protocol.authorizeRecovery();
    recovery=launch('recover',c.scratchRoot,c.profilePath,c.profileSha256);
    recoveryOwner=observe(recovery,message=>{
      if(message.kind==='CHILD_BOOT_READY'){
        const m=exact(message,['kind','mode','namespace']);
        if(recoveryBoot||m.mode!=='recover')refuse();namespace(m.namespace,'recover',context,plan);recoveryBoot=true;
        recovery.send({kind:'RECOVERY_INPUT',context,witnessJson:privateWitnessJson},error=>{if(error)recoveryOwner.stop();});
      }else{
        const m=exact(message,['kind','summary','namespace','effects']);
        if(!recoveryBoot||m.kind!=='RECOVERED_ORIGINAL')refuse();
        protocol.captureRecoveredOriginal(m.summary);
        recoveryEvidence=F({namespace:namespace(m.namespace,'recover',context,plan),effects:effectCeilings(m.effects,false)});
      }
    },45000);
    protocol.registerRecoveryPid(recovery.pid);
    recoveryObservation=await recoveryOwner.done;if(recoveryObservation.fault)refuse();
    protocol.recordRecoveryTermination(termination(recoveryObservation));unchanged();originalsUnchanged();
    return F({status:'OBSERVED_PROCESS_PAIR_PROTOCOL_COMPLETE',protocol:protocol.snapshot(),seed:seedObservation,recovery:recoveryObservation,
      seedEvidence,recoveryEvidence,privateFundingWitnessJson,privateWitnessJson,
      selectedApplicationCrashQualified:false,physicalDurabilityQualified:false,authority:'NONE'});
  }catch{
    if(seedOwner!==null&&seedObservation===null){seedOwner.stop();seedObservation=await seedOwner.done;}
    if(recoveryOwner!==null&&recoveryObservation===null){recoveryOwner.stop();recoveryObservation=await recoveryOwner.done;}
    return F({status:'FAILED_OR_UNKNOWN_PRESERVE_EVIDENCE',protocol:protocol===null?null:protocol.snapshot(),
      seed:seedObservation,recovery:recoveryObservation,seedEvidence,recoveryEvidence,privateFundingWitnessJson,privateWitnessJson,
      selectedApplicationCrashQualified:false,physicalDurabilityQualified:false,authority:'NONE'});
  }finally{configuration=null;funding=null;witness=null;}
}
