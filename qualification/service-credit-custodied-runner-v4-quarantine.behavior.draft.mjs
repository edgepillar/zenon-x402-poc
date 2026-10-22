// Four selected V4 borrowed/owned runner cases on TWO new private synthetic V4 SQLite files.
// Declared HTTP handles only: no sockets, real proofs, SDK, signatures, payment or process restart.
// Independent SQL observation follows production close; no historical/user database is opened.
import test,{after} from 'node:test';
import a from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,openSync,closeSync,fstatSync,readSync,constants} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const ENTRY="qualification/service-credit-custodied-runner-v4-quarantine.behavior.draft.mjs",SELF=fileURLToPath(import.meta.url),REPO=resolve(dirname(SELF),'..');
const SPECS=[
  [
    "src/service-credit-custodied-sequential-runner-core.js",
    15827,
    490,
    "640d578e99f9cb21cf8d79ec870e676e3d9087ebee831e795b1b120b9860ddfb"
  ],
  [
    "src/service-credit-custodied-sequential-runner.js",
    4967,
    107,
    "47db104e64ab9f54113aedc2b16ea923379c9de490e9ced670b9fecb4881a41d"
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
  ]
];
a.equal(process.argv.length,2);a.equal(process.argv[1],SELF);
a.equal(process.versions.node,'24.19.0');a.equal(process.platform,'darwin');a.equal(process.arch,'arm64');
a.equal(process.env.P2_RUNNER_QUARANTINE_V4_OPT_IN,'synthetic-native-runner-quarantine-v4-only');
const PINS=JSON.parse(process.env.P2_RUNNER_QUARANTINE_V4_PINS),scratch=process.env.SPV_TASK_SCRATCH;
a.equal(typeof scratch,'string');a.equal(resolve(scratch),scratch);
const scratchStat=lstatSync(scratch,{bigint:true});a.ok(scratchStat.isDirectory()&&!scratchStat.isSymbolicLink());
a.equal(scratchStat.uid,BigInt(process.getuid()));a.equal(scratchStat.mode&0o777n,0o700n);
const NAMES=['borrowed-v4.sqlite','owned-v4.sqlite'];
for(const name of NAMES)a.throws(()=>lstatSync(join(scratch,name)),{code:'ENOENT'});
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



const stores = await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const borrowed = await import('../src/service-credit-custodied-sequential-runner.js');
const owned = await import('../src/service-credit-custodied-sqlite-sequential-runner.js');
const custody = await import('../src/service-credit-original-request-custody-contract.js');
const { DatabaseSync } = await import('node:sqlite');
const CREATE4 = stores.createZenonFundingPayerRecoveryCustodyQuarantineSqliteStoreV4;
const BORROWED4 = borrowed.createServiceCreditCustodiedSequentialRunnerV4;
const OWNED4 = owned.openServiceCreditCustodiedSqliteSequentialRunnerV4;
const ORIGINAL = custody.serializeOriginalServiceRequestCustody;
const INTENT = custody.serializeOriginalServiceDispatchIntent;
const FUNDING = 'https://runner-quarantine.invalid/funding';
const SERVICE = 'https://runner-quarantine.invalid/service-credit/v1/execute';
const HASH = 'a'.repeat(64), REPLY = Buffer.from('{"ok":true,"resultCode":"accepted"}');
const POLICY = Object.freeze({ policyVersion: 1, maxRequests: 4, serviceResourceUrl: SERVICE });
const P = 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_';
const RP = 'SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_';
const OP = 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const OPTIONS = { concurrency: false, timeout: 5000 };
const f = {
  store: null, current: null, runners: [], exchanges: [], sinks: [], identities: new Map(),
  createdStoreCloses: 0, requests: 0, replies: 0, uncertain: 0, failedRuns: 0,
  manualStoppedRuns: 0, stage: 0, fundingText: null, stampA: null, stampB: null, maxActiveFakeRequests: 0,
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
function seed(name) {
  a.equal(f.store, null); f.store = CREATE4(config(name)); nativeFile(name);
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
  const runner = BORROWED4({ store: f.store, fundingResourceUrl: FUNDING, custodyPolicy: POLICY,
    selectedGrantId: grantId, requestImpl, deadlineMs: 2000 });
  const e = { runner, owned: false, closePromise: null }; f.runners.push(e); f.current = e; return e;
}
async function makeOwned(name, grantId) {
  a.equal(f.store, null); a.equal(f.current, null);
  const runner = await OWNED4({ databasePath: join(scratch, name), allowedRoot: scratch, fundingResourceUrl: FUNDING,
    custodyPolicy: POLICY, selectedGrantId: grantId, requestImpl, deadlineMs: 2000 });
  const e = { runner, owned: true, closePromise: null }; f.runners.push(e); f.current = e; return e;
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
    a.equal(root.resource.ownership, 'OWNED_EXISTING_V4_CUSTODY_QUARANTINE');
    a.equal(s.storeOwnership, 'OWNED_EXISTING_V4_CUSTODY_QUARANTINE');
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
    return {
      epoch: db.prepare('SELECT owner_epoch FROM payer_recovery_meta WHERE singleton=1').get().owner_epoch,
      meta: db.prepare('SELECT singleton,resource_url FROM payer_recovery_meta ORDER BY singleton').all(),
      state: db.prepare('SELECT * FROM payer_recovery_state ORDER BY singleton').all(),
      originals: db.prepare('SELECT * FROM original_service_requests ORDER BY grant_id,request_id').all(),
      intents: db.prepare('SELECT * FROM original_dispatch_intents ORDER BY grant_id,request_id').all(),
      quarantines: db.prepare('SELECT * FROM original_custody_quarantines ORDER BY grant_id').all(),
      policy: db.prepare('SELECT * FROM original_request_custody_policy').all(),
      schema: db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all(),
      userVersion: db.prepare('PRAGMA user_version').get().user_version,
      applicationId: db.prepare('PRAGMA application_id').get().application_id,
    };
  } finally { db.close(); }
}
function unchanged(before, after, newOriginal = false) {
  for (const field of ['meta','state','quarantines','policy','schema','userVersion','applicationId']) {
    a.deepEqual(after[field], before[field]);
  }
  if (!newOriginal) { a.deepEqual(after.originals, before.originals); a.deepEqual(after.intents, before.intents); }
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
function diagnostic(t, scenario) {
  const seqs = f.runners.map(sequence);
  t.diagnostic(JSON.stringify({
    kind: 'P2_RUNNER_QUARANTINE_V4', version: 1, scenario, nativeSqliteFiles: f.identities.size,
    createdStoreCloses: f.createdStoreCloses, borrowedRunners: f.runners.filter(e => !e.owned).length,
    ownedStoreReturnedCloses: f.runners.filter(e => e.owned && e.runner.snapshot().resource.storeCloseOutcome === 'RETURNED').length,
    ownedUnknownCloses: f.runners.filter(e => e.owned && e.runner.snapshot().close.outcome === 'CHILD_UNKNOWN').length,
    declaredHttpRequests: f.requests, validatedFakeReplies: f.replies, uncertainFakeResponses: f.uncertain,
    failedRuns: f.failedRuns, manualStoppedRuns: f.manualStoppedRuns,
    childSubmitAttempts: seqs.reduce((n,s) => n + s.attempted, 0),
    completedCallbacks: seqs.reduce((n,s) => n + s.completed, 0),
    queuedNotAttempted: seqs.reduce((n,s) => n + s.notAttempted, 0),
    automaticQuarantineWriteAttempts: seqs.reduce((n,s) => n + s.client.owner.counts.quarantineWrites, 0),
    confirmedQuarantineReadbacks: seqs.reduce((n,s) => n + s.client.owner.counts.quarantineReadbackConfirmations, 0),
    maxActiveFakeRequests: f.maxActiveFakeRequests, networkCalls: 0, syntheticSignatureOperations: 0,
    realPaymentSigner: 'DISABLED', serviceDelivery: 'NOT_ESTABLISHED',
  }));
}
after(async () => {
  try {
    for (const x of f.exchanges) { x.request.forceClose(); x.response.forceClose(); }
    for (const e of f.runners) await closeRunner(e, sequence(e).unknown);
    await Promise.all(f.sinks);
  } finally { if (f.store !== null) closeProducer(); }
  a.deepEqual(sources(), sourceBefore); a.equal(f.stage, 4);
});
test("borrowed V4 runner stops queued originals after persistent HTTP uncertainty", OPTIONS, async t => {
  a.equal(f.stage, 0);
  a.deepEqual(Object.keys(borrowed).sort(), ['createServiceCreditCustodiedSequentialRunner',
    'createServiceCreditCustodiedSequentialRunnerV3','createServiceCreditCustodiedSequentialRunnerV4']);
  seed('borrowed-v4.sqlite');
  const e = makeBorrowed('grant-a'), batch = [input('grant-a','borrowed-good'),
    input('grant-a','borrowed-unknown'),input('grant-a','borrowed-queued')];
  const run = observe(e.runner.runOriginals(batch)); await requests(1);
  await respond(f.exchanges[0], 'grant-a','borrowed-good',false,run); await requests(2);
  a.equal(sequence(e).completed, 1);
  await respond(f.exchanges[1], 'grant-a','borrowed-unknown',true,run);
  await failedRun(e,run,3,2,1); a.equal(sequence(e).client.owner.custodyQuarantine.status,'PERSISTED_UNKNOWN');
  a.equal(e.runner.runOriginals(batch),run.promise);
  failure(await observe(e.runner.runOriginals(batch.slice())).result,P,'ALREADY_RUN');
  await closeRunner(e,true); a.equal(f.requests,2); a.equal(f.createdStoreCloses,0);
  a.equal(JSON.stringify(f.store.load()),f.fundingText);
  a.equal(f.store.getOriginalRequestCustodyQuarantine({grantId:'grant-a'}).status,'CUSTODY_OUTCOME_UNKNOWN');
  a.equal(f.store.getOriginalRequest(key('grant-a','borrowed-queued')),null);
  closeProducer(); f.stampA=stamp('borrowed-v4.sqlite');
  a.equal(f.stampA.epoch,1); a.equal(f.stampA.quarantines.length,1);
  exactRows(f.stampA,['borrowed-good','borrowed-unknown']); f.stage=1;
  diagnostic(t,'BORROWED_V4_QUEUE_STOPS_WITH_STORE_STILL_BORROWED');
});
test("owned V4 runner preserves partial completion and UNKNOWN after automatic DB release", OPTIONS, async t => {
  a.equal(f.stage,1); seed('owned-v4.sqlite'); closeProducer();
  const e=await makeOwned('owned-v4.sqlite','grant-b');
  const batch=[input('grant-b','owned-good'),input('grant-b','owned-unknown'),input('grant-b','owned-queued')];
  const run=observe(e.runner.runOriginals(batch)); await requests(3);
  await respond(f.exchanges[2],'grant-b','owned-good',false,run); await requests(4);
  await respond(f.exchanges[3],'grant-b','owned-unknown',true,run);
  await failedRun(e,run,3,2,1); await closeRunner(e,true);
  a.equal(e.runner.runOriginals(batch),run.promise); a.equal(f.requests,4);
  f.stampB=stamp('owned-v4.sqlite'); a.equal(f.stampB.epoch,2); a.equal(f.stampB.quarantines.length,1);
  a.equal(f.stampB.quarantines[0].grant_id,'grant-b');
  exactRows(f.stampB,['owned-good','owned-unknown']); f.stage=2;
  diagnostic(t,'OWNED_V4_UNKNOWN_IS_NOT_ERASED_BY_DB_RELEASE');
});
test("reopened V4 runner retains reconciliation metadata and dispatches no quarantined batch", OPTIONS, async t => {
  a.equal(f.stage,2); const e=await makeOwned('owned-v4.sqlite','grant-b');
  const initial=sequence(e); a.equal(initial.client.owner.custodyQuarantine.status,'PERSISTED_UNKNOWN');
  a.equal(initial.client.owner.custodyQuarantine.writeAttempted,false);
  a.equal(initial.client.lastTransport,null);
  const keys=e.runner.readOriginalRecoveryKeys(); frozen(keys);
  a.deepEqual(keys.keys,[key('grant-b','owned-good'),key('grant-b','owned-unknown')]);
  const state=e.runner.readOriginalRecoveryState(key('grant-b','owned-unknown'));
  a.equal(state.uncertainty.custody,true); a.equal(state.authority,'NONE');
  a.equal(ORIGINAL(state.original),f.stampB.originals.find(r=>r.request_id==='owned-unknown').envelope);
  a.equal(INTENT(state.dispatchIntent),f.stampB.intents.find(r=>r.request_id==='owned-unknown').envelope);
  const observation=JSON.stringify({viewVersion:1,paymentHash:HASH,requestId:'owned-unknown',
    fundingStatus:'INCLUDED',serviceStatus:'SUCCEEDED'});
  const plan=e.runner.createOriginalRecoveryStatePlan(key('grant-b','owned-unknown'),observation);
  const diagnosticState=plan.getSnapshot(); frozen(diagnosticState);
  a.equal(diagnosticState.nextStep,'RECONCILIATION_REQUIRED');
  a.equal(diagnosticState.recoveryState.uncertainty.custody,true); a.equal(diagnosticState.authority,'NONE');
  for(const k of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed']) a.equal(diagnosticState[k],false);
  const counts=sequence(e).client.owner.counts;
  const batch=[input('grant-b','after-reopen')], run=observe(e.runner.runOriginals(batch));
  await failedRun(e,run,1,1,0); a.equal(f.requests,4);
  a.deepEqual(sequence(e).client.owner.counts,counts); await closeRunner(e,true);
  const detached=plan.close(); a.equal(plan.close(),detached); a.equal(plan.getSnapshot(),detached);
  a.equal(detached.closed,true); a.equal(detached.nextStep,'LOCALLY_CLOSED'); a.equal(detached.authority,'NONE');
  const next=stamp('owned-v4.sqlite'); a.equal(next.epoch,3); unchanged(f.stampB,next); f.stampB=next;
  f.stage=3; diagnostic(t,'REOPENED_QUARANTINE_METADATA_NEVER_BECOMES_SEND_AUTHORITY');
});
test("manual V4 close stops queued work without manufacturing a grant quarantine", OPTIONS, async t => {
  a.equal(f.stage,3); const before=f.stampA, e=await makeOwned('borrowed-v4.sqlite','grant-c');
  const batch=[input('grant-c','manual-first'),input('grant-c','manual-queued')];
  const run=observe(e.runner.runOriginals(batch)); await requests(5);
  const closing=observe(e.runner.close()); e.closePromise=closing.promise;
  a.equal(e.runner.close(),closing.promise); a.equal(sequence(e).queuedReferences,0);
  a.equal(e.runner.snapshot().resource.storeCloseAttempts,0);
  await pending(run); await pending(closing);
  await respond(f.exchanges[4],'grant-c','manual-first',false,run);
  success(await closing.result); await failedRun(e,run,2,1,1,'CLOSE_REQUESTED');
  f.manualStoppedRuns++; a.equal(sequence(e).unknown,false);
  a.equal(sequence(e).client.owner.counts.quarantineWrites,0); await closeRunner(e,false);
  const next=stamp('borrowed-v4.sqlite'); a.equal(next.epoch,2); unchanged(before,next,true);
  exactRows(next,['borrowed-good','borrowed-unknown','manual-first']);
  a.equal(next.quarantines.length,1); a.equal(next.quarantines[0].grant_id,'grant-a');
  const fresh=await makeOwned('borrowed-v4.sqlite','grant-c');
  a.equal(sequence(fresh).client.owner.custodyQuarantine.status,'NOT_RECORDED');
  a.equal(sequence(fresh).runClaimed,false); await closeRunner(fresh,false);
  f.stampA=stamp('borrowed-v4.sqlite'); a.equal(f.stampA.epoch,3); unchanged(next,f.stampA);
  a.equal(f.requests,5); a.equal(f.createdStoreCloses,2); a.equal(f.maxActiveFakeRequests,1);
  f.stage=4; diagnostic(t,'MANUAL_PARTIAL_STOP_IS_NOT_PERSISTED_CUSTODY_UNCERTAINTY');
});
