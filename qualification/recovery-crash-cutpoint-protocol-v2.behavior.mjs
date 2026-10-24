// Actual protocol DATA only. All child messages and process events are DECLARED.
// No child spawn/signal, SQLite, filesystem writes, key/signature or native crash.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecoveryCrashCutpointProtocol as CREATE } from './recovery-crash-cutpoint-protocol-v2.js';
assert.equal(process.version, 'v24.19.0'); assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.env.X402_CRASH_PROTOCOL_DATA_SELECTION, 'twenty-four-owned-full-flow-cutpoint-v2-data-cases');
assert.equal(process.env.NODE_DISABLE_COMPILE_CACHE, '1');
assert.ok(process.permission && !process.permission.has('child') && !process.permission.has('worker')
  && !process.permission.has('fs.write'));
for (const name of ['NODE_OPTIONS','NODE_PATH','NODE_TEST_CONTEXT','NODE_V8_COVERAGE']) assert.equal(process.env[name], undefined);
const F = Object.freeze, SEED = 12345, RECOVERY = 12346, CODE = 'RECOVERY_CRASH_CUTPOINT_PROTOCOL_REJECTED';
const H = n => String(n).repeat(64), clone = value => JSON.parse(JSON.stringify(value));
const context = () => ({ runId: H(1), sourceRowsSha256: H(2) });
function funding() { return { protocolVersion:2,event:'FUNDING_ORIGINAL_FIXED_BEFORE_SUBMISSION',
  runId:H(1),sourceRowsSha256:H(2),pid:SEED,paymentHash:H(3),checkpointSha256:H(4),checkpointPinsSha256:H(5) }; }
function original(event = 'ORIGINALS_FIXED_BEFORE_DISPATCH', pid = SEED) {
  const c = context(); return { protocolVersion: 2, event, runId: c.runId, sourceRowsSha256: c.sourceRowsSha256, pid,
    grantId: 'synthetic.grant', requestId: 'synthetic.original', originalRequestSha256: H(6),
    paymentHash: H(3), checkpointSha256: H(4), checkpointPinsSha256: H(5) };
}
function ready() { return { ...original('BACKEND_COMMITTED_BEFORE_RESPONSE'), ownerEpoch: 2,
  retainedOriginals: 1, dispatchIntents: 1, responseObservations: 0, backendExecutions: 1,
  consumedUnits: 2, availableUnits: 8, payerCloseRequested: false, backendCloseRequested: false }; }
function recovered() { return { ...ready(), event: 'RECOVERED_ORIGINAL_NO_DISPATCH', pid: RECOVERY,
  ownerEpoch: 3, samePhysicalFiles: true, backendStatus: 'CACHED_SUCCESS',
  clientStatus: 'CLIENT_RECONCILIATION_REQUIRED', quarantine: 'PERSISTED_UNKNOWN',
  recoveryDispatches: 0, recoverySignatures: 0, payerCloseRequested: true, backendCloseRequested: true,
  payerStoreCloseOutcome: 'RETURNED', payerOwnerCloseOutcome: 'CHILD_UNKNOWN',
  backendStoreCloseOutcome: 'RETURNED', cachedOwnerClosePromise: true, authority: 'NONE', deliveryConfirmed: false }; }
const terminated = (pid, signal, code) => ({ pid, signal, code, stdoutComplete: true, stderrComplete: true, ipcClosed: true });
function make(stage = 'STARTED') {
  const p = CREATE(context(), SEED);
  if (stage === 'STARTED') return p;
  p.captureFundingOriginalWitness(funding()); if(stage==='FUNDING')return p;
  p.captureOriginalWitness(original()); if (stage === 'ORIGINAL') return p;
  p.captureCommittedCutpoint(ready()); if (stage === 'READY') return p;
  p.requestSeedKill(); if (stage === 'KILL_REQUESTED') return p;
  p.recordSeedKillResult(true); if (stage === 'KILL_ACCEPTED') return p;
  p.recordSeedTermination(terminated(SEED, 'SIGKILL', null)); if (stage === 'SEED_TERMINATED') return p;
  p.authorizeRecovery(); if (stage === 'RECOVERY_AUTHORIZED') return p;
  p.registerRecoveryPid(RECOVERY); if (stage === 'RECOVERY_STARTED') return p;
  p.captureRecoveredOriginal(recovered()); if (stage === 'RECOVERY_OBSERVED') return p;
  p.recordRecoveryTermination(terminated(RECOVERY, null, 0)); return p;
}
let entered = 0, completed = 0, refused = 0, hooks = 0;
function rejects(p, work) {
  assert.throws(work, error => error instanceof TypeError && Object.isFrozen(error) && error.code === CODE
    && error.stack === 'TypeError: ' + CODE);
  refused++; assert.equal(p.snapshot().phase, 'FAILED');
}
async function chosen(name, work) {
  let done = false;
  await test(name, { concurrency: false, timeout: 2000 }, () => { entered++; work(); completed++; done = true; });
  if (!done) throw Error('CRASH_PROTOCOL_DATA_CASE_FAILED_STOP');
}
await chosen('constructor detaches exact context and never gains native action authority', () => {
  const c = context(), p = CREATE(c, SEED); c.runId = H(9);
  p.captureFundingOriginalWitness(funding());
  const captured = p.captureOriginalWitness(original()); assert.ok(Object.isFrozen(captured));
  const view = p.snapshot(); assert.equal(view.nativeEventsAuthenticated, false); assert.equal(view.authority, 'NONE');
  assert.equal(view.nativeCrashQualified, false); assert.equal(view.mayDispatchService, false);
});
await chosen('complete declared protocol retains CHILD_UNKNOWN rather than native release or delivery', () => {
  const p = make('COMPLETE'), v = p.snapshot(); assert.equal(v.phase, 'DECLARED_PROTOCOL_COMPLETE');
  assert.equal(v, p.snapshot()); assert.equal(v.payerOwnerCloseOutcome, 'CHILD_UNKNOWN');
  assert.equal(v.physicalDurabilityQualified, false); assert.equal(v.deliveryConfirmed, false);
});
await chosen('a ready marker cannot replace the independently fixed pre-dispatch original', () => {
  const p = make(); rejects(p, () => p.captureCommittedCutpoint(ready()));
});
await chosen('no kill is available before the exact committed cutpoint', () => {
  for (const stage of ['STARTED','ORIGINAL']) { const p = make(stage); rejects(p, () => p.requestSeedKill()); }
});
await chosen('witness original payment and source commitments stay exact', () => {
  for (const key of ['runId','sourceRowsSha256','paymentHash','checkpointSha256','checkpointPinsSha256']) {
    const p = make('FUNDING'), m = original(); m[key] = H(9); rejects(p, () => p.captureOriginalWitness(m));
  }
});
await chosen('ready cannot substitute another grant request or original bytes', () => {
  for (const key of ['grantId','requestId','originalRequestSha256']) {
    const p = make('ORIGINAL'), m = ready(); m[key] = key === 'originalRequestSha256' ? H(9) : 'foreign.original';
    rejects(p, () => p.captureCommittedCutpoint(m));
  }
});
await chosen('all three durable facts precede interruption without an observed response', () => {
  for (const [key, value] of [['retainedOriginals',0],['dispatchIntents',0],['backendExecutions',0],
    ['responseObservations',1],['consumedUnits',3],['availableUnits',7]]) {
    const p = make('ORIGINAL'), m = ready(); m[key] = value; rejects(p, () => p.captureCommittedCutpoint(m));
  }
});
await chosen('an already requested graceful close is not the abrupt open-owner cutpoint', () => {
  for (const key of ['payerCloseRequested','backendCloseRequested']) {
    const p = make('ORIGINAL'), m = ready(); m[key] = true; rejects(p, () => p.captureCommittedCutpoint(m));
  }
});
await chosen('kill is one-shot and a failed native kill request prevents recovery', () => {
  const a = make('READY'); assert.deepEqual(a.requestSeedKill(), { pid: SEED, signal: 'SIGKILL' });
  rejects(a, () => a.requestSeedKill());
  const b = make('KILL_REQUESTED'); rejects(b, () => b.recordSeedKillResult(false));
  assert.equal(b.snapshot().recoveryAuthorized, false);
});
await chosen('a normal seed exit or a different signal cannot masquerade as the selected crash', () => {
  for (const [signal, code] of [[null,0],['SIGTERM',null],['SIGKILL',1]]) {
    const p = make('KILL_ACCEPTED'); rejects(p, () => p.recordSeedTermination(terminated(SEED, signal, code)));
  }
});
await chosen('complete stream EOF and IPC closure are required in addition to seed exit', () => {
  for (const key of ['stdoutComplete','stderrComplete','ipcClosed']) {
    const p = make('KILL_ACCEPTED'), m = terminated(SEED, 'SIGKILL', null); m[key] = false;
    rejects(p, () => p.recordSeedTermination(m));
  }
});
await chosen('recovery authorization cannot race the original process termination', () => {
  for (const stage of ['STARTED','ORIGINAL','READY','KILL_REQUESTED','KILL_ACCEPTED']) {
    const p = make(stage); rejects(p, () => p.authorizeRecovery());
  }
});
await chosen('a different owned recovery PID is registered exactly once', () => {
  for (const value of [SEED,0,-1,1.5,true,2147483648]) {
    const p = make('RECOVERY_AUTHORIZED'); rejects(p, () => p.registerRecoveryPid(value));
  }
  const p = make('RECOVERY_STARTED'); rejects(p, () => p.registerRecoveryPid(RECOVERY + 1));
});
await chosen('recovery must retain exact originals and increment only the owner epoch once', () => {
  for (const [key, value] of [['originalRequestSha256',H(9)],['checkpointSha256',H(9)],
    ['checkpointPinsSha256',H(9)],['ownerEpoch',2],['ownerEpoch',4],['samePhysicalFiles',false]]) {
    const p = make('RECOVERY_STARTED'), m = recovered(); m[key] = value; rejects(p, () => p.captureRecoveredOriginal(m));
  }
});
await chosen('cached backend success never clears quarantine or creates a response receipt', () => {
  for (const [key,value] of [['backendStatus','NOT_RECORDED'],['clientStatus','CACHED_SUCCESS'],
    ['quarantine','NONE'],['responseObservations',1],['dispatchIntents',2],['consumedUnits',3]]) {
    const p = make('RECOVERY_STARTED'), m = recovered(); m[key] = value; rejects(p, () => p.captureRecoveredOriginal(m));
  }
});
await chosen('recovery cannot dispatch sign declare delivery or upgrade the unknown close', () => {
  for (const [key,value] of [['recoveryDispatches',1],['recoverySignatures',1],['authority','GRANT'],
    ['deliveryConfirmed',true],['payerOwnerCloseOutcome','CLOSED'],['cachedOwnerClosePromise',false],
    ['payerStoreCloseOutcome','UNKNOWN'],['backendStoreCloseOutcome','UNKNOWN']]) {
    const p = make('RECOVERY_STARTED'), m = recovered(); m[key] = value; rejects(p, () => p.captureRecoveredOriginal(m));
  }
});
await chosen('recovery output is insufficient without its distinct complete zero exit', () => {
  const a = make('RECOVERY_STARTED'); rejects(a, () => a.recordRecoveryTermination(terminated(RECOVERY,null,0)));
  for (const patch of [{pid:SEED},{code:1},{signal:'SIGTERM'},{stdoutComplete:false},{stderrComplete:false},{ipcClosed:false}]) {
    const p = make('RECOVERY_OBSERVED'); rejects(p, () => p.recordRecoveryTermination({ ...terminated(RECOVERY,null,0), ...patch }));
  }
});
await chosen('descriptors proxies unknown fields and raw error text never invoke caller hooks', () => {
  const trap = () => { hooks++; throw Error('PRIVATE_DETAIL_MUST_NOT_ESCAPE'); };
  const a = make('FUNDING'), getter = original(); Object.defineProperty(getter,'grantId',{get:trap,enumerable:true});
  rejects(a, () => a.captureOriginalWitness(getter));
  const b = make('FUNDING'), proxy = new Proxy(original(), {ownKeys:trap,getPrototypeOf:trap,getOwnPropertyDescriptor:trap});
  rejects(b, () => b.captureOriginalWitness(proxy));
  const c = make('FUNDING'); rejects(c, () => c.captureOriginalWitness({ ...original(), privateDetail:'PRIVATE_DETAIL_MUST_NOT_ESCAPE' }));
  assert.equal(hooks,0);
});
await chosen('wrong arity duplicate events and PID substitution cannot reset a failed sequence', () => {
  const a = make('FUNDING'); rejects(a, () => a.captureOriginalWitness(original(), true));
  rejects(a, () => a.captureOriginalWitness(original()));
  const b = make('ORIGINAL'); rejects(b, () => b.captureOriginalWitness(original()));
  const c = make('FUNDING'), m = original(); m.pid = RECOVERY; rejects(c, () => c.captureOriginalWitness(m));
});
await chosen('non-integer and exhausted owner epochs are refused before spending a kill', () => {
  for (const value of [0,true,2.5,-0,Number.MAX_SAFE_INTEGER]) {
    const p = make('ORIGINAL'), m = ready(); m.ownerEpoch = value;
    rejects(p, () => p.captureCommittedCutpoint(m)); assert.equal(p.snapshot().killRequested,false);
  }
});
await chosen('funding originals are fixed before service selection rather than guessed by the parent', () => {
  const p=make(); assert.equal(p.snapshot().fundingOriginalFixedBeforeSubmission,false);
  const m=funding(),locked=p.captureFundingOriginalWitness(m);m.paymentHash=H(9);
  assert.equal(locked.paymentHash,H(3));assert.equal(p.snapshot().fundingOriginalFixedBeforeSubmission,true);
  assert.equal(p.snapshot().originalCheckpointRetained,true);
  assert.equal(p.captureOriginalWitness(original()).paymentHash,H(3));
});
await chosen('malformed early funding descriptors and old-version events cannot open a phase', () => {
  for(const patch of [{protocolVersion:1},{paymentHash:'bad'},{checkpointSha256:''},{checkpointPinsSha256:false},{extra:true}]) {
    const p=make();rejects(p,()=>p.captureFundingOriginalWitness({...funding(),...patch}));
  }
  const p=make(),m=funding();Object.defineProperty(m,'paymentHash',{enumerable:true,get(){hooks++;throw Error('HOOK');}});
  rejects(p,()=>p.captureFundingOriginalWitness(m));assert.equal(hooks,0);
  assert.throws(()=>CREATE({...context(),paymentHash:H(3)},SEED),{code:CODE});
});
await chosen('funding witness is one-shot and cannot be renewed after service selection or kill', () => {
  for(const stage of ['FUNDING','ORIGINAL','READY','KILL_REQUESTED','KILL_ACCEPTED','RECOVERY_STARTED']) {
    const p=make(stage);rejects(p,()=>p.captureFundingOriginalWitness(funding()));
  }
});
await chosen('the actual P1 two-unit debit is not normalized into the older one-unit example', () => {
  for(const phase of ['ready','recover']) {
    const p=make(phase==='ready'?'ORIGINAL':'RECOVERY_STARTED'),m=phase==='ready'?ready():recovered();
    m.consumedUnits=1;m.availableUnits=9;
    rejects(p,()=>phase==='ready'?p.captureCommittedCutpoint(m):p.captureRecoveredOriginal(m));
  }
  assert.equal(make('COMPLETE').snapshot().protocolVersion,2);
});
assert.equal(entered,24); assert.equal(completed,24); assert.equal(hooks,0);
console.log('# recovery-crash-protocol-v2-data ' + JSON.stringify({ entered,completed,refused,hooks,
  protocolVersion:2,actualProtocol:true,eventsDeclared:true,childProcesses:0,signals:0,SQLite:false,keysOrSignatures:false,
  nativeCrashQualified:false,authority:'NONE' }));
