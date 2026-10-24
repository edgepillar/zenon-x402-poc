/* PACED SOURCE V1. REAL parent entry; NEVER used by constructor DATA checks.
 * The full supervisor preloader must admit all source/package/root identities
 * before this entry. A separate new finite approval and managed launcher are
 * required. The bounded stdout record is PRIVATE, not a public qualification.
 */
import { Buffer } from 'node:buffer';
import { constants as C, lstatSync, fstatSync, openSync, readSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
const E=process.env,F=Object.freeze,NS='getPinnedNativeCapacityPacedSupervisorNamespaceSnapshotV1';
const nodeSha='dbedff294bab84a0a86c04e15fbcbeb1c97ca10bef1b32b0634cd24b36f62100',MAX=16777216;
let owned=null;
try {
  const d=Object.getOwnPropertyDescriptor(globalThis,NS);
  if(process.version!=='v24.19.0'||process.platform!=='darwin'||process.arch!=='arm64'
      ||process.argv.length!==3||process.argv[2]!==E.SPV_TASK_SCRATCH
      ||E.X402_NATIVE_CAPACITY_WORKLOAD_SELECTION!=='native-capacity-paced-workload-source-draft-v1'
      ||E.X402_NATIVE_CAPACITY_RUN_SCOPE!=='one-reviewed-native-capacity-paced-parent-v1'
      ||!d||!Object.hasOwn(d,'value')||d.writable||d.configurable||d.enumerable||typeof d.value!=='function'||!Object.isFrozen(d.value)
      ||!/^[0-9a-f]{64}$/.test(E.X402_NATIVE_CAPACITY_PLAN_SHA256||''))fail();
  const namespace=d.value(),rows=namespace.childProfiles;
  if(namespace.profileKind!=='NATIVE_CAPACITY_PACED_SUPERVISOR_NODE24_V1'||namespace.applicationFiles!==145||namespace.packageFiles!==404
      ||namespace.childApplicationFiles!==139||namespace.childPackageFiles!==404
      ||namespace.childSourceRowsSha256!=='d756740994aeb53ebeee47320d732583d96381dfa8c00e18a30f414e70a77027'
      ||namespace.nodeSha256!==nodeSha||namespace.rootIdentityFields!==5||namespace.rootIndependenceVerifiedAtAdmission!==true
      ||namespace.sourceTransforms!==0||namespace.nativeBuiltinAliases!==0||namespace.ordinaryInstalledNamespaceQualified!==false
      ||!Array.isArray(rows)||rows.length<2||rows.length>32)fail();
  const raw=readPrivate(E.X402_NATIVE_CAPACITY_PLAN_PATH,65536);
  if(hash(raw)!==E.X402_NATIVE_CAPACITY_PLAN_SHA256)fail();
  const plan=JSON.parse(raw.toString('ascii'));
  if(!raw.equals(Buffer.from(canonical(plan)+'\n','ascii')))fail();
  exact(plan,['context','plan','recordingLimits','laneProfiles','payeeAddress','commandBudgetMs','closeBudgetMs','pacing']);
  exact(plan.context,['runId']);
  if(plan.context.runId!==E.X402_NATIVE_CAPACITY_RUN_ID||!Array.isArray(plan.laneProfiles)||plan.laneProfiles.length*2!==rows.length)fail();
  const seen=new Set();
  for(const lane of plan.laneProfiles){
    exact(lane,['laneId','payerProfile','serviceProfile']);
    for(const [name,role]of [['payerProfile','PAYER'],['serviceProfile','SERVICE']]){
      const p=lane[name];exact(p,['path','sha256']);
      const matched=rows.find(r=>r.role===role&&r.laneId===lane.laneId&&r.path===p.path&&r.sha256===p.sha256);
      const key=role+'\0'+lane.laneId;
      if(!matched||seen.has(key))fail();seen.add(key);
    }
  }
  if(seen.size!==rows.length)fail();
  // This is the real source-owned pair/core adapter, not an injected workload.
  const {createNativeCapacityPacedWorkloadAdapter:CREATE}=await import('./capacity-native-paced-workload-adapter-v1.draft.mjs');
  const {captureServiceCreditCapacityPacedTimingEnvelopeData:CAPTURE_TIMING}=await import('../src/service-credit-capacity-paced-timing-trace-data.js');
  owned=CREATE(deepFreeze(plan));
  const result=await owned.run(),evidence=owned.privateEvidence();
  let pacedTimingData=null;
  try{
    const trace=owned.privatePacedTimingEvidence();
    pacedTimingData=CAPTURE_TIMING(F({trace,report:result.core,expected:F({
      plan:plan.plan,recordingLimits:plan.recordingLimits,laneCount:plan.laneProfiles.length,
      minimumStartGapMs:plan.pacing.minimumStartGapMs}),context:F({
      runId:plan.context.runId,sourceRowsSha256:namespace.sourceRowsSha256,
      childSourceRowsSha256:namespace.childSourceRowsSha256,laneIds:F(plan.laneProfiles.map(row=>row.laneId))})}));
  }catch{/* Unsafe/unavailable capture is UNKNOWN; do not invent a second trace. */}
  // Envelope v2 serializes the genuine inner parent trace ONLY inside the
  // paced capsule. Both independently computed check summaries remain present.
  const packed=F({pacedCaptureVersion:2,kind:'PRIVATE_PACED_NATIVE_CAPACITY_COMPONENT_CAPTURE_NOT_PRODUCTION',
    sourceRowsSha256:namespace.sourceRowsSha256,childSourceRowsSha256:namespace.childSourceRowsSha256,
    result,pacedTimingData,evidence:F(evidence.map(row=>F({
      laneId:row.laneId,pairSnapshot:row.pairSnapshot,serviceWriterIntervals:row.serviceWriterIntervals,
      serviceWriterAttribution:row.serviceWriterAttribution,
      serviceMeasurementWindow:row.serviceMeasurementWindow,
      payerOperationTimings:row.payerOperationTimings,privateStreams:F(row.privateStreams.map(stream=>F({
        role:stream.role,stdout:blob(stream.stdout,1024),stderr:blob(stream.stderr,8192)})))}))),
    nativeResourcesQualified:false,sustainableCapacityQualified:false,chainAuthenticated:false,productionQualified:false,authority:'NONE'});
  const bytes=Buffer.from(JSON.stringify(packed)+'\n');if(bytes.length>MAX)fail();
  await new Promise((yes,no)=>process.stdout.write(bytes,error=>error?no(error):yes()));
  process.exitCode=result.status==='OBSERVED_COMPONENT_ONLY'&&result.core.outcome==='OBSERVED_OWNERS_RETURNED'&&pacedTimingData?.status==='MATCHING_DECLARED_PACED_TRACE'&&pacedTimingData.check!==null&&pacedTimingData.parentCheck!==null?0:1;
  // Natural exit only: live children/timers remain real obligations. The owned
  // managed command's outer bound may stop its process group on UNKNOWN.
}catch{
  process.exitCode=1;
  // Do not retry, reopen SQL, re-sign, erase roots or manufacture EOF here.
  // The exact manager receipts/private role artifacts preserve actual failure.
  process.stderr.write('NATIVE_CAPACITY_PACED_V1_PARENT_FAILED_PRESERVE_OWNED_EVIDENCE\n');
}
function blob(raw,maximum){if(!Buffer.isBuffer(raw)||raw.length>maximum)fail();return F({bytes:raw.length,sha256:hash(raw),base64:raw.toString('base64')});}
function readPrivate(path,maximum){
  if(typeof path!=='string'||!path.startsWith('/')||resolve(path)!==path||path.length>4096)fail();
  for(let at=path;;at=dirname(at)){if(lstatSync(at).isSymbolicLink())fail();if(dirname(at)===at)break;}
  const s=lstatSync(path,{bigint:true}),before=identity(s);
  if(!s.isFile()||s.uid!==BigInt(process.getuid())||s.nlink!==1n||![0o400n,0o600n].includes(s.mode&0o7777n)||s.size<1n||s.size>BigInt(maximum))fail();
  const fd=openSync(path,C.O_RDONLY|C.O_NOFOLLOW);
  try{
    if(!same(identity(fstatSync(fd,{bigint:true})),before))fail();const bytes=Buffer.alloc(Number(s.size)+1);let used=0;
    while(used<bytes.length){const n=readSync(fd,bytes,used,bytes.length-used,null);if(n===0)break;used+=n;}
    if(used!==Number(s.size)||!same(identity(fstatSync(fd,{bigint:true})),before)||!same(identity(lstatSync(path,{bigint:true})),before))fail();
    return bytes.subarray(0,used);
  }finally{closeSync(fd);}
}
function identity(s){return[s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String);}
function same(a,b){return a.length===b.length&&a.every((v,i)=>v===b[i]);}
function exact(value,names){if(value===null||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype
    ||Reflect.ownKeys(value).length!==names.length||names.some(name=>!Object.hasOwn(value,name)))fail();}
function deepFreeze(value){if(value!==null&&typeof value==='object'){for(const child of Object.values(value))deepFreeze(child);F(value);}return value;}
function canonical(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return'['+value.map(canonical).join(',')+']';
  return'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';}
function hash(raw){return createHash('sha256').update(raw).digest('hex');}
function fail(){throw new TypeError('NATIVE_CAPACITY_PACED_V1_PARENT_REJECTED');}
