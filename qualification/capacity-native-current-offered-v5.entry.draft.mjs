/* CURRENT PACKED OFFERED V4. REAL entry; NEVER imported by SOURCE/DATA or syntax checks.
 * The full supervisor preloader must admit all source/package/root identities
 * before this entry. A separate new finite approval and managed launcher are
 * required. The bounded stdout record is PRIVATE, not a public qualification.
 */
import { Buffer } from 'node:buffer';
import { constants as C, lstatSync, fstatSync, openSync, readSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
const E=process.env,F=Object.freeze,NS='getPinnedNativeCapacityCurrentOfferedSupervisorNamespaceSnapshotV5';
const nodeSha='dbedff294bab84a0a86c04e15fbcbeb1c97ca10bef1b32b0634cd24b36f62100',MAX=16777216;
let owned=null;
try {
  const d=Object.getOwnPropertyDescriptor(globalThis,NS);
  if(process.version!=='v24.19.0'||process.platform!=='darwin'||process.arch!=='arm64'
      ||process.argv.length!==3||process.argv[2]!==E.SPV_TASK_SCRATCH
      ||E.X402_NATIVE_CAPACITY_WORKLOAD_SELECTION!=='native-capacity-current-offered-workload-source-draft-v5'
      ||E.X402_NATIVE_CAPACITY_RUN_SCOPE!=='one-reviewed-native-capacity-current-offered-parent-v5'
      ||!d||!Object.hasOwn(d,'value')||d.writable||d.configurable||d.enumerable||typeof d.value!=='function'||!Object.isFrozen(d.value)
      ||!/^[0-9a-f]{64}$/.test(E.X402_NATIVE_CAPACITY_PLAN_SHA256||''))fail();
  const namespace=d.value(),rows=namespace.childProfiles;
  if(namespace.profileKind!=='NATIVE_CAPACITY_CURRENT_OFFERED_SUPERVISOR_NODE24_V5'||namespace.applicationFiles!==174||namespace.packageFiles!==404
      ||namespace.childApplicationFiles!==163||namespace.childPackageFiles!==404
      ||namespace.childSourceRowsSha256!=='92646a2cf5edf717a1d24468fa6277c48c4f59f43db5b6e607b6071acc79c2b2'
      ||namespace.nodeSha256!==nodeSha||namespace.rootIdentityFields!==5||namespace.rootIndependenceVerifiedAtAdmission!==true
      ||namespace.sourceTransforms!==0||namespace.nativeBuiltinAliases!==0||namespace.ordinaryInstalledNamespaceQualified!==false
      ||!Array.isArray(rows)||rows.length<2||rows.length>32)fail();
  const raw=readPrivate(E.X402_NATIVE_CAPACITY_PLAN_PATH,65536);
  if(hash(raw)!==E.X402_NATIVE_CAPACITY_PLAN_SHA256)fail();
  const plan=JSON.parse(raw.toString('ascii'));
  if(!raw.equals(Buffer.from(canonical(plan)+'\n','ascii')))fail();
  exact(plan,['context','plan','recordingLimits','laneProfiles','payeeAddress','commandBudgetMs','closeBudgetMs']);
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
  const {captureServiceCreditCapacityOfferedPlanData:PLAN_DATA}=await import('../src/service-credit-capacity-offered-plan-data.js');
  const finiteSourcePlan=PLAN_DATA({plan:plan.plan,recordingLimits:plan.recordingLimits,laneCount:plan.laneProfiles.length,
    commandBudgetMs:plan.commandBudgetMs,closeBudgetMs:plan.closeBudgetMs});
  // This is the real source-owned pair/core adapter, not an injected workload.
  const {createNativeCapacityCurrentOfferedAdapterV6:CREATE}=await import('./capacity-native-current-offered-adapter-v6.draft.mjs');
  owned=CREATE(deepFreeze(plan));
  const result=await owned.run(),evidence=owned.privateEvidence();
  // Preserve the original result and child evidence once. This owner has no
  // old parentTimingEvidence API; missing evidence must not be fabricated.
  const m=result.core?.offeredMeasurement,selected=plan.laneProfiles.map(row=>row.laneId);
  const wholeWindowObserved=result.nativeOfferedCapacityWorkloadAdapterVersion===6
    &&result.status==='OBSERVED_COMPONENT_ONLY'&&result.core?.outcome==='OBSERVED_SOURCE_OWNERS_RETURNED'
    &&result.core.fundingEntries===selected.length&&result.core.fundingBalanceChecks===selected.length
    &&result.core.warmupEntries===selected.length*plan.plan.warmupCallsPerLane
    &&result.core.pendingPrefixOriginals===0&&result.core.pendingPrefixLedger===0
    &&result.core.pendingFundingBalanceReads===0&&result.core.pendingOwnerCloses===0&&result.core.measurementPending===false
    &&result.core.lanes.length===selected.length&&result.core.lanes.every(row=>row.funded===true
      &&row.warmupCompleted===plan.plan.warmupCallsPerLane&&row.closeEntered===true&&row.closeOutcome==='RETURNED')
    &&m?.outcome==='OBSERVED_SOURCES_SETTLED'&&m.stopReason==='WINDOW_EXPIRED'
    &&m.scheduledSlots===finiteSourcePlan.globalScheduledOffers
    &&m.scheduledSlots===m.sourceEntries+m.busyRejectedOffers+m.schedulerMissedSlots+m.withdrawnSlots
    &&m.withdrawnSlots===0&&m.pendingOriginalOperations===0&&m.pendingLedgerObservations===0&&m.pendingControlObservations===0
    &&m.opensObserved===selected.length&&m.stopsObserved===selected.length&&m.balanceChecks===2*selected.length
    &&result.lanes.length===selected.length&&result.lanes.every((row,i)=>row.laneId===selected[i]
      &&row.balanceReadsEntered===3&&row.pendingBalanceReads===0&&row.serviceWriterTraceBeforeCloseObserved===true
      &&row.measurementUnknown===false&&row.closeStatus==='RETURNED'&&row.held===false)
    &&evidence.length===selected.length&&evidence.every((row,i)=>row.laneId===selected[i]
      &&row.pairSnapshot?.phase==='CLOSED'&&row.pairSnapshot.held===false&&row.pairSnapshot.activeOperation===false
      &&row.pairSnapshot.freshBalanceReads===3&&row.pairSnapshot.historicalCloseStatus==='CLOSED'
      &&row.pairSnapshot.launchAttempts===2&&row.pairSnapshot.launchUnknown===false
      &&row.privateStreams.length===2&&new Set(row.privateStreams.map(stream=>stream.role)).size===2);
  const packed=F({offeredCaptureVersion:3,kind:'PRIVATE_CURRENT_OFFERED_NATIVE_CAPACITY_COMPONENT_CAPTURE_NOT_PRODUCTION',
    sourceRowsSha256:namespace.sourceRowsSha256,childSourceRowsSha256:namespace.childSourceRowsSha256,
    result,finiteSourcePlan,wholeWindowObserved,evidence:F(evidence.map(row=>F({
      laneId:row.laneId,pairSnapshot:row.pairSnapshot,serviceWriterIntervals:row.serviceWriterIntervals,
      serviceWriterAttribution:row.serviceWriterAttribution,serviceMeasurementWindow:row.serviceMeasurementWindow,
      payerOperationTimings:row.payerOperationTimings,privateStreams:F(row.privateStreams.map(stream=>F({
        role:stream.role,stdout:blob(stream.stdout,1024),stderr:blob(stream.stderr,8192)})))}))),
    arrivalModel:'FIXED_NOMINAL_CALENDAR_NO_QUEUE_OR_CATCHUP',
    parentAndServiceWindowsAligned:false,nativeEventsAuthenticated:false,
    nativeResourcesQualified:false,sustainableCapacityQualified:false,chainAuthenticated:false,productionQualified:false,authority:'NONE'});
  const bytes=Buffer.from(JSON.stringify(packed)+'\n');if(bytes.length>MAX)fail();
  await new Promise((yes,no)=>process.stdout.write(bytes,error=>error?no(error):yes()));
  process.exitCode=wholeWindowObserved?0:1;
  // Natural exit only: live children/timers remain real obligations. The owned
  // managed command's outer bound may stop its process group on UNKNOWN.
}catch{
  process.exitCode=1;
  // Do not retry, reopen SQL, re-sign, erase roots or manufacture EOF here.
  // The exact manager receipts/private role artifacts preserve actual failure.
  // Request only the original owned stop; no replacement budget or forced exit.
  // A missing native close remains the manager's original UNKNOWN obligation.
  if(owned!==null)try{owned.stop().then(()=>undefined,()=>undefined);}catch{/* Preserve failed stop observation. */}
  process.stderr.write('NATIVE_CAPACITY_CURRENT_OFFERED_V4_PARENT_FAILED_PRESERVE_OWNED_EVIDENCE\n');
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
function fail(){throw new TypeError('NATIVE_CAPACITY_CURRENT_OFFERED_V4_PARENT_REJECTED');}
