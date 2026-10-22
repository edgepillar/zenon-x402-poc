// Two separately selected phases across TWO foreground Node processes, one NEW synthetic V4 SQLite file.
// Normal process exit/new process only, not a crash, kill, power-loss or OS-restart experiment.
// Phase2 consumes bounded digest/identity DATA from the fully joined phase1 outcome, never an authority grant.
// Private process/file diagnostics must not be copied into public reports. No network, SDK or signatures.
import test,{after} from 'node:test';
import a from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,openSync,closeSync,fstatSync,readSync,constants} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const ENTRY="qualification/service-credit-v4-fresh-process-quarantine.behavior.draft.mjs",SELF=fileURLToPath(import.meta.url),REPO=resolve(dirname(SELF),'..');
const SPECS=[
  [
    "src/service-credit-custodied-sequential-runner-core.js",
    15827,
    490,
    "640d578e99f9cb21cf8d79ec870e676e3d9087ebee831e795b1b120b9860ddfb"
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
a.equal(process.env.P2_V4_PROCESS_OPT_IN,'synthetic-native-fresh-process-v4-only');
const PINS=JSON.parse(process.env.P2_V4_PROCESS_PINS),scratch=process.env.SPV_TASK_SCRATCH;
a.equal(typeof scratch,'string');a.equal(resolve(scratch),scratch);
const scratchStat=lstatSync(scratch,{bigint:true});a.ok(scratchStat.isDirectory()&&!scratchStat.isSymbolicLink());
a.equal(scratchStat.uid,BigInt(process.getuid()));a.equal(scratchStat.mode&0o777n,0o700n);
const ids=s=>['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k=>String(s[k]));
const sha=b=>createHash('sha256').update(b).digest('hex');
function sources() {
  a.equal(PINS.length,15); a.deepEqual(PINS.map(p=>p.path),[...SPECS.map(s=>s[0]),ENTRY]);
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




const PHASE = process.env.P2_V4_PROCESS_PHASE, EXPECTED = JSON.parse(process.env.P2_V4_PROCESS_WITNESS);
a.ok(PHASE === 'seed' || PHASE === 'recover');
const NAME = 'continuity-v4.sqlite', PATH = join(scratch, NAME);
const hashPattern = /^[0-9a-f]{64}$/;
function nativeFile() {
  const st = lstatSync(PATH, { bigint: true });
  a.ok(st.isFile() && !st.isSymbolicLink()); a.equal(st.uid, BigInt(process.getuid()));
  a.equal(st.dev, scratchStat.dev); a.equal(st.nlink, 1n); a.equal(st.mode & 0o777n, 0o600n);
  return st;
}
function filePin() {
  const st = nativeFile(), before = ids(st);
  a.ok(st.size > 0n && st.size <= 131072n);
  const fd = openSync(PATH, constants.O_RDONLY | constants.O_NOFOLLOW), b = Buffer.alloc(Number(st.size) + 1);
  let used = 0;
  try {
    a.deepEqual(ids(fstatSync(fd, { bigint: true })), before);
    while (used < b.length) { const n = readSync(fd, b, used, b.length - used, null); if (!n) break; used += n; }
    a.deepEqual(ids(fstatSync(fd, { bigint: true })), before);
  } finally { closeSync(fd); }
  a.equal(used, Number(st.size)); a.deepEqual(ids(nativeFile()), before);
  return { bytes: used, sha256: sha(b.subarray(0, used)), identity: before };
}
const DIGEST_FIELDS = ['coreSha256','originalSha256','intentSha256','quarantineSha256','fundingSha256'];
const WITNESS_FIELDS = ['pid','ownerEpoch','fileBytes','fileSha256','fileIdentity',...DIGEST_FIELDS];
let beforeOpen = null;
if (PHASE === 'seed') {
  a.equal(EXPECTED, null); a.throws(() => lstatSync(PATH), { code: 'ENOENT' });
} else {
  a.deepEqual(Object.keys(EXPECTED), WITNESS_FIELDS);
  a.ok(Number.isSafeInteger(EXPECTED.pid) && EXPECTED.pid > 0); a.notEqual(process.pid, EXPECTED.pid);
  a.equal(EXPECTED.ownerEpoch, 2); a.ok(EXPECTED.fileBytes > 0 && EXPECTED.fileBytes <= 131072);
  a.ok(hashPattern.test(EXPECTED.fileSha256));
  a.equal(EXPECTED.fileIdentity.length, 9);
  for (const n of EXPECTED.fileIdentity) a.ok(typeof n === 'string' && /^[0-9]{1,24}$/.test(n));
  for (const k of DIGEST_FIELDS) a.ok(hashPattern.test(EXPECTED[k]));
  beforeOpen = filePin();
  a.deepEqual(beforeOpen, { bytes: EXPECTED.fileBytes, sha256: EXPECTED.fileSha256, identity: EXPECTED.fileIdentity });
}
const stores = await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const owned = await import('../src/service-credit-custodied-sqlite-sequential-runner.js');
const custody = await import('../src/service-credit-original-request-custody-contract.js');
const { DatabaseSync } = await import('node:sqlite');
const CREATE4 = stores.createZenonFundingPayerRecoveryCustodyQuarantineSqliteStoreV4;
const OPEN4 = owned.openServiceCreditCustodiedSqliteSequentialRunnerV4;
const ORIGINAL = custody.serializeOriginalServiceRequestCustody, INTENT = custody.serializeOriginalServiceDispatchIntent;
const FUNDING = 'https://process-quarantine.invalid/funding';
const SERVICE = 'https://process-quarantine.invalid/service-credit/v1/execute';
const HASH = 'a'.repeat(64), GRANT = 'grant-process', ORIGINAL_ID = 'original-one';
const POLICY = Object.freeze({ policyVersion: 1, maxRequests: 2, serviceResourceUrl: SERVICE });
const P = 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_', RP = 'SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_';
const OPTIONS = { concurrency: false, timeout: 5000 };
const f = { store: null, runner: null, exchanges: [], sinks: [], requests: 0, closed: false, stage: false };
function input(requestId) {
  const originalRequestJson = JSON.stringify({
    modelVersion: 1, grantId: GRANT, requestId, method: 'POST', routeId: 'service-credit.execute.v1',
    canonicalBodyDigest: 'sha256:' + sha(Buffer.alloc(0)), selectedContentType: 'application/json', maxCostUnits: 1,
  });
  const proof = JSON.stringify({ grantId: GRANT, maxCostUnits: 1, proofVersion: 1,
    publicKey: 'declared-public-key', requestId, signature: 'declared-signature-' + requestId });
  return { grantId: GRANT, requestId, originalRequestJson, originalBodyBase64: '', serviceResourceUrl: SERVICE,
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
function observe(promise) {
  const item = { promise, settled: false };
  item.result = promise.then(value => { item.settled = true; return { value }; },
    error => { item.settled = true; return { error }; });
  f.sinks.push(item.result); return item;
}
function failed(result, prefix, code) {
  a.ok(Object.hasOwn(result, 'error')); a.equal(result.error.code, prefix + code);
  a.equal(result.error.message, result.error.code); a.equal(Object.isFrozen(result.error), true);
}
async function pending(item) {
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); a.equal(item.settled, false);
}
function frozen(v) {
  if (v !== null && typeof v === 'object') {
    a.equal(Object.isFrozen(v), true); for (const x of Object.values(v)) frozen(x);
  }
}
class Handle {
  #listeners = new Map();
  constructor() { this.closed = false; this.destroys = []; }
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
    super(); this.statusCode = 503; this.complete = false;
    this.rawHeaders = ['Cache-Control','private, no-store, max-age=0','Content-Type','application/json',
      'Vary','Authorization','X-Content-Type-Options','nosniff','Content-Length','1'];
  }
}
function requestImpl(url, options, callback) {
  f.requests++; a.equal(PHASE, 'seed'); a.equal(url, SERVICE); a.equal(arguments.length, 3); a.equal(this, undefined);
  a.deepEqual(options, { method: 'POST', headers: { Authorization: input(ORIGINAL_ID).authorizationHeader },
    agent: false, rejectUnauthorized: true, maxHeaderSize: 16384, insecureHTTPParser: false });
  const seq = f.runner.snapshot().runner;
  a.equal(seq.client.owner.counts.readbackConfirmations, 1);
  a.equal(seq.client.owner.counts.intentReadbackConfirmations, 1);
  const x = { callback, request: new Request(), response: new Response() };
  f.exchanges.push(x); return x.request;
}
async function openRunner() {
  f.runner = await OPEN4({ databasePath: PATH, allowedRoot: scratch, fundingResourceUrl: FUNDING,
    custodyPolicy: POLICY, selectedGrantId: GRANT, requestImpl, deadlineMs: 2000 });
}
async function closeRunner() {
  const p = f.runner.close(); a.equal(f.runner.close(), p);
  failed(await observe(p).result, RP, 'CHILD_OUTCOME_UNKNOWN');
  const view = f.runner.snapshot();
  a.equal(view.resource.storeCloseAttempts, 1); a.equal(view.resource.storeCloseOutcome, 'RETURNED');
  a.equal(view.resource.phase, 'RELEASED'); a.equal(view.resource.slotHeld, false);
  a.equal(view.close.outcome, 'CHILD_UNKNOWN'); a.equal(view.runner.queuedReferences, 0);
  a.equal(view.runner.closeCalls, 1); a.equal(view.runner.closeOutcome, 'REJECTED');
  a.equal(p, f.runner.close()); f.closed = true;
}
function snapshotSql() {
  a.equal(f.store, null); a.equal(f.closed, true);
  const db = new DatabaseSync(PATH, { readOnly: true, allowExtension: false,
    enableDoubleQuotedStringLiterals: false, enableForeignKeyConstraints: true, timeout: 0 });
  try {
    const epoch = db.prepare('SELECT owner_epoch FROM payer_recovery_meta WHERE singleton=1').get().owner_epoch;
    const core = {
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
    a.equal(core.userVersion, 4); a.equal(core.applicationId, 0x5a505252);
    a.equal(core.state.length, 1); a.equal(core.originals.length, 1);
    a.equal(core.intents.length, 1); a.equal(core.quarantines.length, 1);
    const original = JSON.parse(core.originals[0].envelope);
    a.equal(original.grantId, GRANT); a.equal(original.requestId, ORIGINAL_ID); a.equal(original.paymentHash, HASH);
    a.equal(original.originalRequestJson, input(ORIGINAL_ID).originalRequestJson); a.equal(original.originalBodyBase64, '');
    a.equal(core.originals[0].envelope.includes('declared-signature'), false);
    const q = JSON.parse(core.quarantines[0].envelope);
    a.equal(q.grantId, GRANT); a.equal(q.status, 'CUSTODY_OUTCOME_UNKNOWN'); a.equal(q.authority, 'NONE');
    a.equal(q.paymentHash, HASH); a.deepEqual(q.custodyPolicy, POLICY);
    return { epoch, coreSha256: sha(Buffer.from(JSON.stringify(core))),
      originalSha256: sha(Buffer.from(core.originals[0].envelope)),
      intentSha256: sha(Buffer.from(core.intents[0].envelope)),
      quarantineSha256: sha(Buffer.from(core.quarantines[0].envelope)),
      fundingSha256: sha(Buffer.from(JSON.stringify(core.state))) };
  } finally { db.close(); }
}
function diagnostic(t, sql, file) {
  const view = f.runner.snapshot(), owner = view.runner.client.owner;
  // PRIVATE diagnostic: process IDs and physical identity stay out of public reports.
  t.diagnostic(JSON.stringify({
    kind: 'P2_V4_FRESH_PROCESS', version: 1, phase: PHASE, pid: process.pid,
    previousPid: PHASE === 'seed' ? null : EXPECTED.pid, ownerEpoch: sql.epoch,
    fileBytes: file.bytes, fileSha256: file.sha256, fileIdentity: file.identity,
    coreSha256: sql.coreSha256, originalSha256: sql.originalSha256, intentSha256: sql.intentSha256,
    quarantineSha256: sql.quarantineSha256, fundingSha256: sql.fundingSha256,
    beforeOpenFileSha256: beforeOpen === null ? null : beforeOpen.sha256,
    preOpenFullBytesAndIdentityMatched: PHASE === 'recover', nativeSqliteFiles: 1,
    childSubmitAttempts: view.runner.attempted, declaredHttpRequests: f.requests, expectedRunRejections: 1,
    ownedStoreReturnedCloses: view.resource.storeCloseAttempts, quarantineWrites: owner.counts.quarantineWrites,
    quarantineReadbackConfirmations: owner.counts.quarantineReadbackConfirmations,
    closeOutcome: view.close.outcome, quarantineStatus: owner.custodyQuarantine.status,
    authority: 'NONE', networkCalls: 0, syntheticSignatureOperations: 0,
    realPaymentSigner: 'DISABLED', serviceDelivery: 'NOT_ESTABLISHED',
  }));
}
after(async () => {
  try {
    for (const x of f.exchanges) { x.request.forceClose(); x.response.forceClose(); }
    if (f.runner !== null) await closeRunner();
    await Promise.all(f.sinks);
  } finally { if (f.store !== null) { f.store.close(); f.store = null; } }
  a.deepEqual(sources(), sourceBefore); a.equal(f.stage, true);
});
if (PHASE === 'seed') {
  test("seed process persists V4 quarantine and closes the original synthetic store", OPTIONS, async t => {
    f.store = CREATE4({ databasePath: PATH, allowedRoot: scratch, resourceUrl: FUNDING, custodyPolicy: POLICY });
    f.store.prepare(pair()); f.store.fenceAttempt('PREPARED'); f.store.finishAttempt('BOUND');
    a.equal(f.store.load().revision, 3); f.store.close(); f.store = null;
    await openRunner();
    const batch = [input(ORIGINAL_ID)], run = observe(f.runner.runOriginals(batch));
    a.equal(f.requests, 1); const x = f.exchanges[0];
    a.deepEqual(x.request.ends, [[]]); a.equal(x.request.writes, 0);
    x.callback(x.response); a.equal(x.request.destroys.length, 1); a.equal(x.response.destroys.length, 1);
    await pending(run); x.request.forceClose(); await pending(run); x.response.forceClose();
    failed(await run.result, P, 'RUN_FAILED'); await closeRunner();
    const view = f.runner.snapshot(), owner = view.runner.client.owner;
    a.equal(view.runner.attempted, 1); a.equal(view.runner.completed, 0);
    a.equal(owner.custodyQuarantine.status, 'PERSISTED_UNKNOWN'); a.equal(owner.custodyQuarantine.writeAttempted, true);
    a.equal(owner.counts.quarantineWrites, 1); a.equal(owner.counts.quarantineReadbackConfirmations, 1);
    a.equal(view.runner.client.lastTransport.timerArmed, false);
    const sql = snapshotSql(); a.equal(sql.epoch, 2); const file = filePin();
    f.stage = true; diagnostic(t, sql, file);
  });
} else {
  test("fresh process restores the same V4 quarantine without new HTTP dispatch", OPTIONS, async t => {
    await openRunner();
    const initial = f.runner.snapshot().runner.client;
    a.equal(initial.lastTransport, null); a.equal(initial.owner.custodyQuarantine.status, 'PERSISTED_UNKNOWN');
    a.equal(initial.owner.custodyQuarantine.writeAttempted, false);
    a.equal(initial.owner.uncertainty.custody, true); a.equal(initial.owner.uncertainty.submission, false);
    const state = f.runner.readOriginalRecoveryState({ grantId: GRANT, requestId: ORIGINAL_ID }); frozen(state);
    a.equal(state.funding.status, 'BOUND'); a.equal(state.funding.revision, 3); a.equal(state.funding.paymentHash, HASH);
    a.equal(state.uncertainty.custody, true); a.equal(state.dispatchStatus, 'POSSIBLY_ATTEMPTED');
    a.equal(state.authority, 'NONE'); a.equal(state.qualification, 'UNQUALIFIED');
    a.equal(sha(Buffer.from(ORIGINAL(state.original))), EXPECTED.originalSha256);
    a.equal(sha(Buffer.from(INTENT(state.dispatchIntent))), EXPECTED.intentSha256);
    const keys = f.runner.readOriginalRecoveryKeys(); frozen(keys);
    a.deepEqual(keys.keys, [{ grantId: GRANT, requestId: ORIGINAL_ID }]);
    for (const k of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed']) a.equal(keys[k], false);
    const counts = f.runner.snapshot().runner.client.owner.counts;
    const run = observe(f.runner.runOriginals([input('after-process-reopen')]));
    failed(await run.result, P, 'RUN_FAILED'); a.equal(f.requests, 0);
    a.deepEqual(f.runner.snapshot().runner.client.owner.counts, counts); await closeRunner();
    const owner = f.runner.snapshot().runner.client.owner;
    a.equal(owner.counts.quarantineWrites, 0); a.equal(owner.counts.quarantineReadbackConfirmations, 0);
    const sql = snapshotSql(); a.equal(sql.epoch, EXPECTED.ownerEpoch + 1);
    for (const k of DIGEST_FIELDS) a.equal(sql[k], EXPECTED[k]);
    const file = filePin(); a.deepEqual(file.identity.slice(0, 6), EXPECTED.fileIdentity.slice(0, 6));
    a.notEqual(file.sha256, EXPECTED.fileSha256); f.stage = true; diagnostic(t, sql, file);
  });
}
