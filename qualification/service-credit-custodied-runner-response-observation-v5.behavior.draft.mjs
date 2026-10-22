// Six selected V5 borrowed/owned sequential cases on TWO new private synthetic SQLite files.
// Declared socketless HTTP handles and proof metadata only; no signature verification or payment.
// Normal close/reopen is not process restart, crash, native cleanup or delivery qualification.
import test,{after} from 'node:test';
import a from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,openSync,closeSync,fstatSync,readSync,constants} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const ENTRY="qualification/service-credit-custodied-runner-response-observation-v5.behavior.draft.mjs",SELF=fileURLToPath(import.meta.url),REPO=resolve(dirname(SELF),'..');
const SPECS=[
  [
    "src/service-credit-custodied-sequential-runner-core.js",
    15907,
    491,
    "1ea3bc77bc6f1ef7c5aef843f6d4f67109f3a7943a761c19e7dfcb37cfb84a0e"
  ],
  [
    "src/service-credit-custodied-sequential-runner.js",
    5773,
    121,
    "de0f3e143066f19ac3f3cab072abe8d250ea72b9fac9ad2c5bedb75110d7ec56"
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
  ]
];
a.equal(process.argv.length,2);a.equal(process.argv[1],SELF);
a.equal(process.versions.node,'24.19.0');a.equal(process.platform,'darwin');a.equal(process.arch,'arm64');
a.equal(process.env.P2_RUNNER_RESPONSE_OBSERVATION_V5_OPT_IN,'synthetic-native-runner-response-observation-v5-only');
const PINS=JSON.parse(process.env.P2_RUNNER_RESPONSE_OBSERVATION_V5_PINS),scratch=process.env.SPV_TASK_SCRATCH;
a.equal(typeof scratch,'string');a.equal(resolve(scratch),scratch);
const scratchStat=lstatSync(scratch,{bigint:true});a.ok(scratchStat.isDirectory()&&!scratchStat.isSymbolicLink());
a.equal(scratchStat.uid,BigInt(process.getuid()));a.equal(scratchStat.mode&0o777n,0o700n);
const NAMES=['runner-observed-v5.sqlite','runner-control-v4.sqlite'];
for(const name of NAMES)a.throws(()=>lstatSync(join(scratch,name)),{code:'ENOENT'});
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



const stores = await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const borrowed = await import('../src/service-credit-custodied-sequential-runner.js');
const owned = await import('../src/service-credit-custodied-sqlite-sequential-runner.js');
const custody = await import('../src/service-credit-original-request-custody-contract.js');
const { DatabaseSync } = await import('node:sqlite');
const CREATE4 = stores.createZenonFundingPayerRecoveryCustodyQuarantineSqliteStoreV4;
const CREATE5 = stores.createZenonFundingPayerRecoveryResponseObservationSqliteStoreV5;
const OPEN_STORE5 = stores.openZenonFundingPayerRecoveryResponseObservationSqliteStoreV5;
const BORROWED5 = borrowed.createServiceCreditCustodiedSequentialRunnerV5;
const OWNED4 = owned.openServiceCreditCustodiedSqliteSequentialRunnerV4;
const OWNED5 = owned.openServiceCreditCustodiedSqliteSequentialRunnerV5;
const ORIGINAL = custody.serializeOriginalServiceRequestCustody;
const INTENT = custody.serializeOriginalServiceDispatchIntent;
const FUNDING = 'https://runner-observation.invalid/funding';
const SERVICE = 'https://runner-observation.invalid/service-credit/v1/execute';
const HASH = 'a'.repeat(64), REPLY = Buffer.from('{"ok":true,"resultCode":"accepted"}');
const POLICY = Object.freeze({ policyVersion: 1, maxRequests: 12, serviceResourceUrl: SERVICE });
const P = 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_';
const RP = 'SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_';
const OP = 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const OPTIONS = { concurrency: false, timeout: 5000 };
const f = {
  store: null, current: null, runners: [], exchanges: [], sinks: [], identities: new Map(),
  createdStoreCloses: 0, requests: 0, replies: 0, uncertain: 0, failedRuns: 0,
  manualStoppedRuns: 0, identityReplayChecks: 0, getterCalls: 0, profileRefusals: 0, statePlans: 0, stage: 0, fundingText: null, stampA: null, stampB: null, maxActiveFakeRequests: 0,
};
const key = (grantId, requestId) => ({ grantId, requestId });
const sequence = e => e.owned ? e.runner.snapshot().runner : e.runner.snapshot();
function input(grantId, requestId) {
  const originalRequestJson = JSON.stringify({
    modelVersion: 1, grantId, requestId, method: 'POST', routeId: 'service-credit.execute.v1',
    canonicalBodyDigest: 'sha256:' + sha(Buffer.alloc(0)), selectedContentType: 'application/json', maxCostUnits: 1,
  });
  const proof = JSON.stringify({
    grantId, maxCostUnits: 1, proofVersion: 1, publicKey: 'declared-public-key',
    requestId, signature: 'declared-signature-' + requestId,
  });
  return { grantId, requestId, originalRequestJson, originalBodyBase64: '', serviceResourceUrl: SERVICE,
    authorizationHeader: 'ServiceCredit ' + Buffer.from(proof).toString('base64url') };
}
function pair() {
  const requirement = { scheme: 'exact', network: 'zenon:testnet', asset: 'synthetic-asset', amount: '1',
    payTo: 'synthetic-payee', maxTimeoutSeconds: 30, extra: { poc: true, settlement: 'account-block',
      paymentFlow: 'upfront', minimumMomentumConfirmations: 2, zenonChain: {
        version: 1, chainIdentifier: '42', genesisMomentumHash: '1'.repeat(64),
      } } };
  const required = { x402Version: 2, resource: { url: FUNDING }, accepts: [requirement] };
  const payload = { x402Version: 2, resource: { url: FUNDING }, accepted: requirement,
    payload: { transaction: { hash: HASH }, intentDigest: '2'.repeat(64) } };
  return { challenge: { status: 'PAYMENT_REQUIRED', resourceUrl: FUNDING, paymentRequired: required,
    paymentRequiredHeader: Buffer.from(JSON.stringify(required)).toString('base64') },
    paymentSignatureHeader: Buffer.from(JSON.stringify(payload)).toString('base64') };
}
function config(name) {
  return { databasePath: join(scratch, name), allowedRoot: scratch, resourceUrl: FUNDING, custodyPolicy: POLICY };
}
function seed(name, factory = CREATE5) {
  a.equal(f.store, null); f.store = factory(config(name)); nativeFile(name);
  f.store.prepare(pair()); f.store.fenceAttempt('PREPARED'); f.store.finishAttempt('BOUND');
  const text = JSON.stringify(f.store.load());
  if (f.fundingText === null) f.fundingText = text; else a.equal(text, f.fundingText);
}
function closeProducer() { f.store.close(); f.store = null; f.createdStoreCloses++; }
function nativeFile(name) {
  const st = lstatSync(join(scratch, name), { bigint: true });
  a.ok(st.isFile() && !st.isSymbolicLink()); a.equal(st.uid, BigInt(process.getuid()));
  a.equal(st.dev, scratchStat.dev); a.equal(st.nlink, 1n); a.equal(st.mode & 0o777n, 0o600n);
  const id = ids(st).slice(0, 6);
  if (f.identities.has(name)) a.deepEqual(id, f.identities.get(name)); else f.identities.set(name, id);
}
function makeBorrowed(grantId) {
  a.notEqual(f.store, null);
  const runner = BORROWED5({ store: f.store, fundingResourceUrl: FUNDING, custodyPolicy: POLICY,
    selectedGrantId: grantId, requestImpl, deadlineMs: 2000 });
  const e = { runner, owned: false, version: 5, closePromise: null }; f.runners.push(e); f.current = e; return e;
}
async function makeOwned(name, grantId, factory = OWNED5, version = 5) {
  a.equal(f.store, null); a.equal(f.current, null);
  const runner = await factory({ databasePath: join(scratch, name), allowedRoot: scratch, fundingResourceUrl: FUNDING,
    custodyPolicy: POLICY, selectedGrantId: grantId, requestImpl, deadlineMs: 2000 });
  const e = { runner, owned: true, version, closePromise: null }; f.runners.push(e); f.current = e; return e;
}
function observe(promise) {
  const state = { promise, settled: false };
  state.result = promise.then(value => { state.settled = true; return { value }; },
    error => { state.settled = true; return { error }; });
  f.sinks.push(state.result); return state;
}
function failure(result, prefix, code) {
  a.ok(Object.hasOwn(result, 'error')); a.equal(result.error.code, prefix + code);
  a.equal(result.error.message, result.error.code); a.equal(Object.isFrozen(result.error), true);
}
function success(result) { a.equal(Object.hasOwn(result, 'error'), false); a.equal(result.value, undefined); }
async function pending(observed) {
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); a.equal(observed.settled, false);
}
async function requests(count) {
  for (let i = 0; i < 64 && f.requests !== count; i++) await Promise.resolve();
  a.equal(f.requests, count);
}
async function closeRunner(e, unknown) {
  const promise = e.runner.close();
  if (e.closePromise === null) e.closePromise = promise; else a.equal(promise, e.closePromise);
  a.equal(e.runner.close(), promise);
  const result = await observe(promise).result;
  if (unknown) failure(result, e.owned ? RP : OP, e.owned ? 'CHILD_OUTCOME_UNKNOWN' : 'CLOSE_FAILED');
  else success(result);
  const s = sequence(e); a.equal(s.closed, true); a.equal(s.active, false); a.equal(s.closeCalls, 1);
  a.equal(s.closeOutcome, unknown ? 'REJECTED' : 'FULFILLED'); a.equal(s.queuedReferences, 0);
  if (e.owned) {
    const root = e.runner.snapshot();
    a.equal(root.resource.ownership, e.version === 5 ? 'OWNED_EXISTING_V5_RESPONSE_OBSERVATION' : 'OWNED_EXISTING_V4_CUSTODY_QUARANTINE');
    a.equal(s.storeOwnership, e.version === 5 ? 'OWNED_EXISTING_V5_RESPONSE_OBSERVATION' : 'OWNED_EXISTING_V4_CUSTODY_QUARANTINE');
    a.equal(root.resource.storeCloseAttempts, 1); a.equal(root.resource.storeCloseOutcome, 'RETURNED');
    a.equal(root.resource.phase, 'RELEASED'); a.equal(root.resource.slotHeld, false);
    a.equal(root.close.outcome, unknown ? 'CHILD_UNKNOWN' : 'DRAINED');
  } else a.equal(s.storeOwnership, 'BORROWED');
  if (f.current === e) f.current = null;
}
function frozen(v) {
  if (v !== null && typeof v === 'object') {
    a.equal(Object.isFrozen(v), true); for (const x of Object.values(v)) frozen(x);
  }
}
function redacted(e) {
  const s = e.runner.snapshot(); frozen(s);
  const text = JSON.stringify(s);
  for (const secret of [FUNDING, SERVICE, HASH, 'ServiceCredit ', 'declared-public-key', 'declared-signature']) {
    a.equal(text.includes(secret), false);
  }
  const seq = sequence(e);
  for (const field of ['serviceDelivery','currentAuthority','realReady','durability','restart','osCleanup']) {
    a.equal(seq[field], 'NOT_ESTABLISHED');
  }
  if (e.owned) a.equal(s.qualification, 'UNQUALIFIED');
}
function stamp(name) {
  a.equal(f.store, null); a.equal(f.current, null);
  a.ok(f.runners.every(e => sequence(e).closed && !sequence(e).active));
  a.ok(f.runners.filter(e => e.owned).every(e => e.runner.snapshot().resource.storeCloseOutcome === 'RETURNED'));
  nativeFile(name);
  const db = new DatabaseSync(join(scratch, name), { readOnly: true, allowExtension: false,
    enableDoubleQuotedStringLiterals: false, enableForeignKeyConstraints: true, timeout: 0 });
  try {
    const version = db.prepare('PRAGMA user_version').get().user_version;
    return {
      epoch: db.prepare('SELECT owner_epoch FROM payer_recovery_meta WHERE singleton=1').get().owner_epoch,
      meta: db.prepare('SELECT singleton,resource_url FROM payer_recovery_meta ORDER BY singleton').all(),
      state: db.prepare('SELECT * FROM payer_recovery_state ORDER BY singleton').all(),
      originals: db.prepare('SELECT * FROM original_service_requests ORDER BY grant_id,request_id').all(),
      intents: db.prepare('SELECT * FROM original_dispatch_intents ORDER BY grant_id,request_id').all(),
      quarantines: db.prepare('SELECT * FROM original_custody_quarantines ORDER BY grant_id').all(),
      observations: version === 5 ? db.prepare('SELECT * FROM original_response_observations ORDER BY grant_id,request_id').all() : [],
      policy: db.prepare('SELECT * FROM original_request_custody_policy').all(),
      schema: db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all(),
      userVersion: db.prepare('PRAGMA user_version').get().user_version,
      applicationId: db.prepare('PRAGMA application_id').get().application_id,
    };
  } finally { db.close(); }
}
function exactRows(stamp, expectedIds) {
  a.deepEqual(stamp.originals.map(row => row.request_id).sort(), expectedIds.slice().sort());
  a.deepEqual(stamp.intents.map(row => row.request_id).sort(), expectedIds.slice().sort());
  for (const row of stamp.originals) {
    const original = JSON.parse(row.envelope);
    a.equal(original.originalRequestJson, input(row.grant_id, row.request_id).originalRequestJson);
    a.equal(original.originalBodyBase64, ''); a.equal(original.paymentHash, HASH);
    a.equal(row.envelope.includes('declared-signature'), false);
  }
}
class Handle {
  #listeners = new Map();
  constructor() { this.destroys = []; this.closed = false; }
  on(name, listener) {
    const list = this.#listeners.get(name) ?? []; list.push(listener); this.#listeners.set(name, list); return this;
  }
  emit(name, ...args) { for (const listener of (this.#listeners.get(name) ?? []).slice()) listener(...args); }
  forceClose() { if (!this.closed) { this.closed = true; this.emit('close'); } }
  destroy(...args) { this.destroys.push(args); return this; }
}
class Request extends Handle {
  constructor() { super(); this.ends = []; this.writes = 0; }
  end(...args) { this.ends.push(args); return this; }
  write() { this.writes++; throw Error('BODY_WRITE_FORBIDDEN'); }
}
class Response extends Handle {
  constructor() {
    super(); this.complete = false; this.statusCode = 200;
    this.rawHeaders = ['Cache-Control','private, no-store, max-age=0','Content-Type','application/json',
      'Vary','Authorization','X-Content-Type-Options','nosniff','Content-Length',String(REPLY.length)];
  }
}
function requestImpl(url, options, callback) {
  const active = f.exchanges.filter(x => !x.request.closed || !x.response.closed).length + 1;
  f.maxActiveFakeRequests = Math.max(f.maxActiveFakeRequests, active); a.equal(active, 1); f.requests++;
  const atRequest = sequence(f.current);
  a.equal(atRequest.active, true);
  a.equal(atRequest.client.owner.counts.retainCalls, atRequest.attempted);
  a.equal(atRequest.client.owner.counts.intentReadbackConfirmations, atRequest.attempted);
  a.equal(atRequest.client.owner.counts.quarantineWrites, 0);
  const x = { url, options, callback, request: new Request(), response: new Response(), atRequest,
    receiver: this, argc: arguments.length };
  f.exchanges.push(x); return x.request;
}
async function respond(x, grantId, id, unknown, observedRun) {
  a.equal(x.receiver, undefined); a.equal(x.argc, 3); a.equal(x.url, SERVICE);
  a.deepEqual(x.options, { method: 'POST', headers: { Authorization: input(grantId,id).authorizationHeader },
    agent: false, rejectUnauthorized: true, maxHeaderSize: 16384, insecureHTTPParser: false });
  a.deepEqual(x.request.ends, [[]]); a.equal(x.request.writes, 0);
  if (unknown) {
    x.response.statusCode = 503; x.callback(x.response); f.uncertain++;
    a.equal(x.request.destroys.length, 1); a.equal(x.response.destroys.length, 1);
  } else {
    x.callback(x.response); x.response.complete = true;
    x.response.emit('data', Buffer.from(REPLY)); x.response.emit('end'); f.replies++;
  }
  await pending(observedRun); x.request.forceClose(); await pending(observedRun); x.response.forceClose();
}
async function failedRun(e, observedRun, planned, attempted, completed, failureKind = 'ENTRY_REJECTED') {
  failure(await observedRun.result, P, 'RUN_FAILED'); f.failedRuns++;
  const s = sequence(e);
  a.equal(s.planned, planned); a.equal(s.attempted, attempted); a.equal(s.completed, completed);
  a.equal(s.notAttempted, planned - attempted); a.equal(s.failure, failureKind);
  a.equal(s.outcome, 'RUN_FAILED'); a.equal(s.phase, 'FAILED'); a.equal(s.runSettled, true);
  a.equal(s.queuedReferences, 0); a.equal(s.closeCalls, 1); redacted(e);
}

function immutableFunding(before,after){for(const k of ['meta','state','policy','schema','userVersion','applicationId'])a.deepEqual(after[k],before[k]);}
function allRows(before,after){immutableFunding(before,after);for(const k of ['originals','intents','observations','quarantines'])a.deepEqual(after[k],before[k]);}
function originalState(runner,grantId,id,observed){
 const r=runner.readOriginalRecoveryState(key(grantId,id));frozen(r);a.equal(r.authority,'NONE');a.equal(r.serviceOutcome,'NOT_ESTABLISHED');
 a.equal(r.dispatchStatus,'POSSIBLY_ATTEMPTED');a.equal(r.responseStatus,observed?'LOCAL_DECLARED_SUCCESS_RESPONSE_OBSERVED':'NOT_OBSERVED');
 if(observed){a.equal(r.responseObservation.responseJson,REPLY.toString('utf8'));a.equal(r.responseObservation.authority,'NONE');
 a.equal(r.responseObservation.deliveryConfirmed,false);}else a.equal(r.responseObservation,null);return r;
}
function wholeFile(name){
 nativeFile(name);const path=join(scratch,name),st=lstatSync(path,{bigint:true}),id=ids(st);
 a.ok(st.size<=131072n);const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW),buf=Buffer.alloc(Number(st.size)+1);let used=0;
 try{a.deepEqual(ids(fstatSync(fd,{bigint:true})),id);while(used<buf.length){const n=readSync(fd,buf,used,buf.length-used,null);if(!n)break;used+=n;}a.deepEqual(ids(fstatSync(fd,{bigint:true})),id);}
 finally{closeSync(fd);}a.equal(used,Number(st.size));a.deepEqual(ids(lstatSync(path,{bigint:true})),id);return {identity:id,sha256:sha(buf.subarray(0,used))};
}
async function completedRun(e,run,planned){
 success(await run.result);const s=sequence(e);a.equal(s.planned,planned);a.equal(s.attempted,planned);a.equal(s.completed,planned);
 a.equal(s.phase,'COMPLETED');a.equal(s.outcome,'CALLBACKS_COMPLETED');a.equal(s.closeCalls,1);a.equal(s.queuedReferences,0);redacted(e);
 await closeRunner(e,false);
}
function diagnostic(t,scenario){
 const seqs=f.runners.map(sequence);
 t.diagnostic(JSON.stringify({kind:'P2_RUNNER_RESPONSE_OBSERVATION_V5',version:1,scenario,
 nativeSqliteFiles:f.identities.size,directStoreCloses:f.createdStoreCloses,
 borrowedRunners:f.runners.filter(e=>!e.owned).length,ownedRunners:f.runners.filter(e=>e.owned).length,
 ownedStoreReturnedCloses:f.runners.filter(e=>e.owned&&e.runner.snapshot().resource.storeCloseOutcome==='RETURNED').length,
 expectedUnknownOwnedCloses:f.runners.filter(e=>e.owned&&e.runner.snapshot().close.outcome==='CHILD_UNKNOWN').length,
 declaredHttpRequests:f.requests,validatedFakeReplies:f.replies,uncertainFakeResponses:f.uncertain,
 failedRuns:f.failedRuns,manualStoppedRuns:f.manualStoppedRuns,identityReplayChecks:f.identityReplayChecks,getterCalls:f.getterCalls,
 profileRefusals:f.profileRefusals,statePlans:f.statePlans,
 childSubmitAttempts:seqs.reduce((n,s)=>n+s.attempted,0),completedCallbacks:seqs.reduce((n,s)=>n+s.completed,0),
 responseReadbackConfirmations:seqs.reduce((n,s)=>n+(s.client.owner.counts.responseReadbackConfirmations??0),0),
 automaticQuarantineWrites:seqs.reduce((n,s)=>n+(s.client.owner.counts.quarantineWrites??0),0),
 maxActiveFakeRequests:f.maxActiveFakeRequests,networkCalls:0,syntheticSignatureOperations:0,realPaymentSigner:'DISABLED',serviceDelivery:'NOT_ESTABLISHED'}));
}
after(async()=>{
 try{
 for(const x of f.exchanges){x.request.forceClose();x.response.forceClose();}
 for(const e of f.runners)await closeRunner(e,sequence(e).unknown);
 await Promise.all(f.sinks);
 }finally{if(f.store!==null)closeProducer();}
 a.deepEqual(sources(),sourceBefore);a.equal(f.stage,6);a.equal(f.requests,7);a.equal(f.replies,6);
 a.equal(f.failedRuns,4);a.equal(f.manualStoppedRuns,1);a.equal(f.getterCalls,0);a.equal(f.maxActiveFakeRequests,1);
});

test('Borrowed V5 runner records two sequential replies and caches only the accepted array identity',OPTIONS,async t=>{
 a.equal(f.stage,0);seed(NAMES[0]);const e=makeBorrowed('grant-a');
 failure(await observe(e.runner.runOriginals([input('grant-foreign','bad')])).result,P,'INVALID_INPUT');
 a.equal(sequence(e).runClaimed,false);a.equal(f.requests,0);
 const batch=[input('grant-a','a1'),input('grant-a','a2')],run=observe(e.runner.runOriginals(batch));
 await requests(1);
 Object.defineProperty(batch,'0',{enumerable:true,configurable:true,get(){f.getterCalls++;throw Error('MUST_NOT_REREAD_ACCEPTED_ARRAY');}});
 a.equal(e.runner.runOriginals(batch),run.promise);f.identityReplayChecks++;
 failure(await observe(e.runner.runOriginals([input('grant-a','other')])).result,P,'ALREADY_RUN');
 await respond(f.exchanges[0],'grant-a','a1',false,run);await requests(2);
 a.equal(sequence(e).completed,1);a.equal(sequence(e).client.owner.counts.responseReadbackConfirmations,1);
 await respond(f.exchanges[1],'grant-a','a2',false,run);await completedRun(e,run,2);
 a.equal(e.runner.runOriginals(batch),run.promise);f.identityReplayChecks++;
 a.equal(f.createdStoreCloses,0);a.equal(JSON.stringify(f.store.load()),f.fundingText);
 a.equal(f.store.getOriginalResponseObservation(key('grant-a','a1')).responseJson,REPLY.toString('utf8'));
 a.equal(f.store.getOriginalResponseObservation(key('grant-a','a2')).responseJson,REPLY.toString('utf8'));
 const b=input('grant-b','b1');delete b.authorizationHeader;f.store.retainOriginalRequest(b);f.store.fenceOriginalDispatchIntent(key('grant-b','b1'));
 closeProducer();f.stampA=stamp(NAMES[0]);a.equal(f.stampA.epoch,1);a.equal(f.stampA.observations.length,2);a.equal(f.stampA.quarantines.length,0);
 exactRows(f.stampA,['a1','a2','b1']);f.stage=1;diagnostic(t,'BORROWED_V5_SEQUENTIAL_READBACK_AND_IDENTITY_RECEIPT');
});

test('Owned V5 normal reopen retains response observations without promoting diagnostic recovery authority',OPTIONS,async t=>{
 a.equal(f.stage,1);const e=await makeOwned(NAMES[0],'grant-a');
 originalState(e.runner,'grant-a','a1',true);originalState(e.runner,'grant-a','a2',true);
 const observation=JSON.stringify({viewVersion:1,paymentHash:HASH,requestId:'a1',fundingStatus:'INCLUDED',serviceStatus:'OUTCOME_UNKNOWN'});
 const plan=e.runner.createOriginalRecoveryStatePlan(key('grant-a','a1'),observation),view=plan.getSnapshot();frozen(view);
 a.equal(view.nextStep,'RECONCILIATION_REQUIRED');a.equal(view.authority,'NONE');a.equal(view.declaredPlan.terminal,null);
 a.equal(view.recoveryState.responseObservation.responseJson,REPLY.toString('utf8'));
 for(const k of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed'])a.equal(view[k],false);f.statePlans++;
 const batch=[input('grant-a','a3')],run=observe(e.runner.runOriginals(batch));await requests(3);
 await respond(f.exchanges[2],'grant-a','a3',false,run);await completedRun(e,run,1);
 const detached=plan.close();a.equal(plan.getSnapshot(),detached);a.equal(plan.close(),detached);a.equal(detached.closed,true);a.equal(detached.authority,'NONE');
 const next=stamp(NAMES[0]);a.equal(next.epoch,2);immutableFunding(f.stampA,next);
 for(const k of ['originals','intents','observations'])for(const row of f.stampA[k])a.deepEqual(next[k].find(r=>r.grant_id===row.grant_id&&r.request_id===row.request_id),row);
 a.equal(next.observations.length,3);a.equal(next.quarantines.length,0);f.stampA=next;
 f.stage=2;diagnostic(t,'OWNED_V5_NORMAL_REOPEN_AND_POWERLESS_STATE_PLAN');
});

test('Owned V5 runner preserves earlier response then stops queued work on strict HTTP UNKNOWN',OPTIONS,async t=>{
 a.equal(f.stage,2);const e=await makeOwned(NAMES[0],'grant-c');
 const batch=[input('grant-c','c1'),input('grant-c','c2'),input('grant-c','c3')],run=observe(e.runner.runOriginals(batch));await requests(4);
 await respond(f.exchanges[3],'grant-c','c1',false,run);await requests(5);
 await respond(f.exchanges[4],'grant-c','c2',true,run);await failedRun(e,run,3,2,1);await closeRunner(e,true);
 a.equal(e.runner.runOriginals(batch),run.promise);a.equal(sequence(e).client.owner.counts.responseReadbackConfirmations,1);
 const next=stamp(NAMES[0]);a.equal(next.epoch,3);immutableFunding(f.stampA,next);
 exactRows(next,['a1','a2','a3','b1','c1','c2']);a.equal(next.observations.length,4);
 a.equal(next.observations.some(r=>r.request_id==='c2'||r.request_id==='c3'),false);a.deepEqual(next.quarantines.map(r=>r.grant_id),['grant-c']);
 f.stampA=next;f.stage=3;diagnostic(t,'PARTIAL_RESPONSE_RETENTION_AND_UNKNOWN_QUEUE_STOP');
});

test('Reopened V5 runners refuse quarantined and unobserved-intent batches before HTTP',OPTIONS,async t=>{
 a.equal(f.stage,3);const first=await makeOwned(NAMES[0],'grant-c');originalState(first.runner,'grant-c','c1',true);originalState(first.runner,'grant-c','c2',false);
 const run=observe(first.runner.runOriginals([input('grant-c','later-c'),input('grant-c','never-c')]));await failedRun(first,run,2,1,0);await closeRunner(first,true);
 const reopened=stamp(NAMES[0]);a.equal(reopened.epoch,4);allRows(f.stampA,reopened);
 const second=await makeOwned(NAMES[0],'grant-b');a.equal(sequence(second).client.owner.counts.quarantineWrites,1);
 originalState(second.runner,'grant-b','b1',false);
 const runB=observe(second.runner.runOriginals([input('grant-b','later-b'),input('grant-b','never-b')]));await failedRun(second,runB,2,1,0);await closeRunner(second,true);
 a.equal(f.requests,5);const next=stamp(NAMES[0]);a.equal(next.epoch,5);immutableFunding(reopened,next);
 for(const k of ['originals','intents','observations'])a.deepEqual(next[k],reopened[k]);a.deepEqual(next.quarantines.map(r=>r.grant_id),['grant-b','grant-c']);
 f.stampA=next;f.stage=4;diagnostic(t,'REOPENED_UNKNOWN_AND_UNOBSERVED_INTENT_NO_DISPATCH');
});

test('Manual V5 close retains the started response but rejects partial run without quarantining queued work',OPTIONS,async t=>{
 a.equal(f.stage,4);f.store=OPEN_STORE5(config(NAMES[0]));const e=makeBorrowed('grant-d');
 const run=observe(e.runner.runOriginals([input('grant-d','d1'),input('grant-d','d2')]));await requests(6);
 const closing=observe(e.runner.close());e.closePromise=closing.promise;a.equal(e.runner.close(),closing.promise);a.equal(sequence(e).queuedReferences,0);
 await pending(closing);await respond(f.exchanges[5],'grant-d','d1',false,run);success(await closing.result);
 await failedRun(e,run,2,1,1,'CLOSE_REQUESTED');f.manualStoppedRuns++;await closeRunner(e,false);
 a.equal(sequence(e).unknown,false);a.equal(sequence(e).client.owner.counts.quarantineWrites,0);
 a.equal(f.store.getOriginalRequest(key('grant-d','d2')),null);a.equal(f.store.getOriginalRequestCustodyQuarantine({grantId:'grant-d'}),null);
 a.equal(f.store.getOriginalResponseObservation(key('grant-d','d1')).responseJson,REPLY.toString('utf8'));closeProducer();
 const next=stamp(NAMES[0]);a.equal(next.epoch,6);immutableFunding(f.stampA,next);
 a.equal(next.observations.length,5);a.deepEqual(next.quarantines,f.stampA.quarantines);exactRows(next,['a1','a2','a3','b1','c1','c2','d1']);
 f.stampA=next;f.stage=5;diagnostic(t,'MANUAL_PARTIAL_STOP_WITH_RETAINED_RESPONSE_NO_NEW_QUARANTINE');
});

test('V4 runner stays void-response compatible and cross-profile V5 acquisition does not adopt files',OPTIONS,async t=>{
 a.equal(f.stage,5);seed(NAMES[1],CREATE4);closeProducer();const v5=wholeFile(NAMES[0]),v4=wholeFile(NAMES[1]);
 const conf=(name,grantId)=>({databasePath:join(scratch,name),allowedRoot:scratch,fundingResourceUrl:FUNDING,custodyPolicy:POLICY,selectedGrantId:grantId,requestImpl,deadlineMs:2000});
 await a.rejects(OWNED5(conf(NAMES[1],'grant-v4')),{code:RP+'ACQUISITION_FAILED'});f.profileRefusals++;a.deepEqual(wholeFile(NAMES[1]),v4);
 await a.rejects(OWNED4(conf(NAMES[0],'grant-a')),{code:RP+'ACQUISITION_FAILED'});f.profileRefusals++;a.deepEqual(wholeFile(NAMES[0]),v5);
 const e=await makeOwned(NAMES[1],'grant-v4',OWNED4,4),run=observe(e.runner.runOriginals([input('grant-v4','v4')]));await requests(7);
 await respond(f.exchanges[6],'grant-v4','v4',false,run);await completedRun(e,run,1);
 a.equal(Object.hasOwn(sequence(e).client.owner.counts,'responseWrites'),false);
 const control=stamp(NAMES[1]);a.equal(control.epoch,2);a.equal(control.userVersion,4);a.equal(control.observations.length,0);a.equal(control.quarantines.length,0);
 exactRows(control,['v4']);a.deepEqual(wholeFile(NAMES[0]),v5);allRows(f.stampA,stamp(NAMES[0]));
 a.equal(f.createdStoreCloses,3);f.stage=6;diagnostic(t,'LEGACY_V4_CONTROL_AND_CROSS_PROFILE_NO_ADOPTION');
});
