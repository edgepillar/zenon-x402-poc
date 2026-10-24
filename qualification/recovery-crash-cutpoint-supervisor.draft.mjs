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
import { createRecoveryCrashCutpointProtocol } from './recovery-crash-cutpoint-protocol.js';

const F = Object.freeze, IS_PROXY = utilTypes.isProxy, K = Reflect.ownKeys;
const ENTRY = resolve(dirname(fileURLToPath(import.meta.url)), 'recovery-crash-committed-intent.child.draft.mjs');
const OUT_LIMIT = 65536, ERR_LIMIT = 8192, MESSAGE_LIMIT = 65536;
const FILES = ['backend-committed-crash.sqlite', 'payer-committed-crash.sqlite'];
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
function entryPin(expected) {
  if (typeof expected !== 'string' || !HASH.test(expected)) refuse();
  noLinks(ENTRY); const s = lstatSync(ENTRY, { bigint: true }), before = identity(s);
  if (!s.isFile() || s.nlink !== 1n || s.uid !== BigInt(process.getuid()) || s.size < 1n || s.size > 131072n) refuse();
  const fd = openSync(ENTRY, constants.O_RDONLY | constants.O_NOFOLLOW), raw = Buffer.alloc(Number(s.size)+1);
  let used = 0;
  try {
    if (identity(fstatSync(fd,{bigint:true})).join(':') !== before.join(':')) refuse();
    while (used < raw.length) {
      const n = readSync(fd,raw,used,raw.length-used,null); if (!n) break; used += n;
    }
    if (used !== Number(s.size) || sha(raw.subarray(0,used)) !== expected
        || identity(fstatSync(fd,{bigint:true})).join(':') !== before.join(':')
        || identity(lstatSync(ENTRY,{bigint:true})).join(':') !== before.join(':')) refuse();
    return before;
  } finally { raw.fill(0); closeSync(fd); }
}
function profilePin(path,expected) {
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
    return before;
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
function captureWitness(text,summary,context,root) {
  if (typeof text!=='string' || text.length>32768 || Buffer.byteLength(text)>32768) refuse();
  const w=exact(JSON.parse(text),['witnessVersion','grantId','requestId','originalRequestJson',
    'authorizationHeader','serializedCheckpoint','checkpointPins','payerIdentity','backendIdentity']);
  if (JSON.stringify(w)!==text || w.witnessVersion!==1 || w.grantId!==summary.grantId
      || w.requestId!==summary.requestId || !IDENTIFIER.test(w.grantId) || !IDENTIFIER.test(w.requestId)
      || typeof w.originalRequestJson!=='string' || Buffer.byteLength(w.originalRequestJson)>4096
      || sha(w.originalRequestJson)!==summary.originalRequestSha256
      || typeof w.authorizationHeader!=='string' || !w.authorizationHeader.startsWith('ServiceCredit ')
      || Buffer.byteLength(w.authorizationHeader)>1024 || /[\r\n\0]/.test(w.authorizationHeader)
      || typeof w.serializedCheckpoint!=='string' || Buffer.byteLength(w.serializedCheckpoint)>32768
      || sha(w.serializedCheckpoint)!==context.checkpointSha256
      || sha(JSON.stringify(w.checkpointPins))!==context.checkpointPinsSha256) refuse();
  const request=exact(JSON.parse(w.originalRequestJson),['modelVersion','grantId','requestId','method',
    'routeId','canonicalBodyDigest','selectedContentType','maxCostUnits']);
  if(JSON.stringify(request)!==w.originalRequestJson || request.modelVersion!==1
      || request.grantId!==w.grantId || request.requestId!==w.requestId || request.method!=='POST'
      || request.routeId!=='service-credit.execute.v1' || request.selectedContentType!=='application/json'
      || request.maxCostUnits!==1 || request.canonicalBodyDigest!=='sha256:'+sha(Buffer.alloc(0)))refuse();
  for (const [name,wanted]of [[FILES[0],w.backendIdentity],[FILES[1],w.payerIdentity]]) {
    if (!Array.isArray(wanted) || wanted.length!==6
        || !wanted.every(v=>typeof v==='string' && /^[0-9]{1,24}$/.test(v))
        || !same(fileIdentity(root,name),wanted)) refuse();
  }
  return w; // Private only: never print, persist as public output or reconstruct from recovery SQL.
}
function launch(phase,root,profilePath,profileSha256) {
  return fork(ENTRY,[root,phase],{
    execPath:process.execPath,
    execArgv:['--no-addons','--disallow-code-generation-from-strings','--disable-proto=throw','--unhandled-rejections=strict'],
    cwd:root,detached:false,serialization:'json',stdio:['ignore','pipe','pipe','ipc'],
    env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',TZ:'UTC',NODE_DISABLE_COMPILE_CACHE:'1',
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
 * The closed child program is still a separate unfinished artifact. Missing
 * entry/profile refuses before fork. No result from protocol DATA tests proves
 * this native supervisor, SQLite recovery, SIGKILL handling or OS cleanup.
 */
export async function runOwnedCommittedIntentCrashPair(configuration) {
  if (arguments.length!==1 || process.version!=='v24.19.0' || process.platform!=='darwin'
      || process.arch!=='arm64' || typeof process.getuid!=='function') refuse();
  const c=exact(configuration,['scratchRoot','childEntrySha256','profilePath','profileSha256','context','seedInputJson']);
  if (typeof c.seedInputJson!=='string' || Buffer.byteLength(c.seedInputJson)>32768
      || typeof c.profileSha256!=='string' || !HASH.test(c.profileSha256)) refuse();
  const context=exact(c.context,['runId','sourceRowsSha256','paymentHash','checkpointSha256','checkpointPinsSha256']);
  if (!Object.values(context).every(v=>typeof v==='string' && HASH.test(v))) refuse();
  const rootId=privateRoot(c.scratchRoot),entryId=entryPin(c.childEntrySha256);
  const profileId=profilePin(c.profilePath,c.profileSha256);
  for (const name of FILES) for (const suffix of ['','-wal','-shm','-journal']) {
    try {lstatSync(join(c.scratchRoot,name+suffix));refuse();}
    catch(error) {if(error.code!=='ENOENT')throw error;}
  }
  let seed=null,recovery=null,protocol=null,witness=null,privateWitnessJson=null;
  let seedObservation=null,recoveryObservation=null,seedOwner=null,recoveryOwner=null;
  const unchanged=()=>{
    if (!same(privateRoot(c.scratchRoot),rootId) || !same(entryPin(c.childEntrySha256),entryId)
        || !same(profilePin(c.profilePath,c.profileSha256),profileId)) refuse();
  };
  const termination=o=>({pid:o.pid,code:o.code,signal:o.signal,stdoutComplete:o.stdoutComplete,
    stderrComplete:o.stderrComplete,ipcClosed:o.ipcClosed});
  try {
    unchanged();
    seed=launch('seed',c.scratchRoot,c.profilePath,c.profileSha256);
    seedOwner=observe(seed,(message,stop)=>{
      if (message.kind==='ORIGINAL_WITNESS') {
        const m=exact(message,['kind','summary','witnessJson']);
        protocol.captureOriginalWitness(m.summary);
        witness=captureWitness(m.witnessJson,m.summary,context,c.scratchRoot);
        privateWitnessJson=m.witnessJson;
        unchanged();
        seed.send({kind:'ORIGINAL_WITNESS_FIXED',runId:context.runId},error=>{if(error)stop();});
      } else if (message.kind==='COMMITTED_CUTPOINT') {
        const m=exact(message,['kind','summary']);protocol.captureCommittedCutpoint(m.summary);
        if (witness===null)refuse();
        for(const[name,id]of [[FILES[0],witness.backendIdentity],[FILES[1],witness.payerIdentity]])
          if(!same(fileIdentity(c.scratchRoot,name),id))refuse();
        unchanged();const selected=protocol.requestSeedKill();
        if(selected.pid!==seed.pid || selected.signal!=='SIGKILL')refuse();
        protocol.recordSeedKillResult(stop());
      } else refuse();
    },45000);
    protocol=createRecoveryCrashCutpointProtocol(context,seed.pid);
    seed.send({kind:'SEED_INPUT',context,seedInputJson:c.seedInputJson},error=>{if(error)seedOwner.stop();});
    seedObservation=await seedOwner.done;
    if(seedObservation.fault)refuse();
    protocol.recordSeedTermination(termination(seedObservation));
    unchanged();
    for(const[name,id]of [[FILES[0],witness.backendIdentity],[FILES[1],witness.payerIdentity]])
      if(!same(fileIdentity(c.scratchRoot,name),id))refuse();
    protocol.authorizeRecovery();
    recovery=launch('recover',c.scratchRoot,c.profilePath,c.profileSha256);
    recoveryOwner=observe(recovery,message=>{
      const m=exact(message,['kind','summary']);
      if(m.kind!=='RECOVERED_ORIGINAL')refuse();
      protocol.captureRecoveredOriginal(m.summary);
    },45000);
    protocol.registerRecoveryPid(recovery.pid);
    recovery.send({kind:'RECOVERY_INPUT',context,witnessJson:privateWitnessJson},error=>{if(error)recoveryOwner.stop();});
    recoveryObservation=await recoveryOwner.done;
    if(recoveryObservation.fault)refuse();
    protocol.recordRecoveryTermination(termination(recoveryObservation));
    unchanged();
    for(const[name,id]of [[FILES[0],witness.backendIdentity],[FILES[1],witness.payerIdentity]])
      if(!same(fileIdentity(c.scratchRoot,name),id))refuse();
    return F({status:'OBSERVED_PROCESS_PAIR_PROTOCOL_COMPLETE',protocol:protocol.snapshot(),
      seed:seedObservation,recovery:recoveryObservation,privateWitnessJson,
      selectedApplicationCrashQualified:false,physicalDurabilityQualified:false,authority:'NONE'});
  } catch {
    // A setup/send/admission exception after fork must not orphan the one
    // owned child. Await its SAME observation handle; never launch a replacement.
    if(seedOwner!==null && seedObservation===null){seedOwner.stop();seedObservation=await seedOwner.done;}
    if(recoveryOwner!==null && recoveryObservation===null){recoveryOwner.stop();recoveryObservation=await recoveryOwner.done;}
    // Observed children own their failure stop. No failed experiment is rerun,
    // no store/handle is force-closed, and no child-created file is cleaned here.
    return F({status:'FAILED_OR_UNKNOWN_PRESERVE_EVIDENCE',protocol:protocol===null?null:protocol.snapshot(),
      seed:seedObservation,recovery:recoveryObservation,privateWitnessJson,
      selectedApplicationCrashQualified:false,physicalDurabilityQualified:false,authority:'NONE'});
  } finally {configuration=null;witness=null;}
}
