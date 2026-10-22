// Three selected V4 HTTP/native-store composition cases, using TWO new private synthetic files.
// Only declared request/response handles: no sockets, SDK, signatures, real funding or payment.
// No simultaneous independent SQL observer; normal same-process reopen is not process restart.
import test,{after} from 'node:test';
import a from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,openSync,closeSync,fstatSync,readSync,constants} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const ENTRY="qualification/service-credit-custodied-http-v4-quarantine.behavior.draft.mjs",SELF=fileURLToPath(import.meta.url),REPO=resolve(dirname(SELF),'..');
const SPECS=[
  [
    "src/service-credit-custodied-http-client.js",
    11597,
    307,
    "822627be1876fb609bad582b767694a60022d7bf9d7375bb2e7fb961c034e4ab"
  ],
  [
    "src/service-credit-custodied-sqlite-http-client.js",
    19683,
    530,
    "06366488e679272170847af4929db3b3f782774022f97c748530ec73f729f0bc"
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
    "package.json",
    1413,
    40,
    "8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"
  ]
];
a.equal(process.argv.length,2);a.equal(process.argv[1],SELF);
a.equal(process.versions.node,'24.19.0');a.equal(process.platform,'darwin');a.equal(process.arch,'arm64');
a.equal(process.env.P2_HTTP_QUARANTINE_V4_OPT_IN,'synthetic-native-http-quarantine-v4-only');
const PINS=JSON.parse(process.env.P2_HTTP_QUARANTINE_V4_PINS),scratch=process.env.SPV_TASK_SCRATCH;
a.equal(typeof scratch,'string');a.equal(resolve(scratch),scratch);
const scratchStat=lstatSync(scratch,{bigint:true});a.ok(scratchStat.isDirectory()&&!scratchStat.isSymbolicLink());
a.equal(scratchStat.uid,BigInt(process.getuid()));a.equal(scratchStat.mode&0o777n,0o700n);
const NAMES=['client-v3.sqlite','client-v4.sqlite'];
for(const name of NAMES)a.throws(()=>lstatSync(join(scratch,name)),{code:'ENOENT'});
const ids=s=>['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k=>String(s[k]));
const sha=b=>createHash('sha256').update(b).digest('hex');
function sources() {
  a.equal(PINS.length,9); a.deepEqual(PINS.map(p=>p.path),[...SPECS.map(s=>s[0]),ENTRY]);
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
    total+=used; a.ok(total<=262144); a.equal(used,p.bytes); a.equal(sha(bytes),p.sha256);
    a.equal(bytes.filter(n=>n===10).length,p.LF);
    if(index<SPECS.length) a.deepEqual([p.path,p.bytes,p.LF,p.sha256],SPECS[index]);
    return {path:p.path,bytes:p.bytes,sha256:p.sha256,identity:p.identity};
  });
}
const sourceBefore=sources();


const stores = await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const http = await import('../src/service-credit-custodied-http-client.js');
const owned = await import('../src/service-credit-custodied-sqlite-http-client.js');
const custody = await import('../src/service-credit-original-request-custody-contract.js');
const { DatabaseSync } = await import('node:sqlite');
const CREATE4 = stores.createZenonFundingPayerRecoveryCustodyQuarantineSqliteStoreV4;
const CREATE3 = stores.createZenonFundingPayerRecoveryDispatchIntentSqliteStoreV3;
const OPEN4 = owned.openServiceCreditCustodiedSqliteHttpClientV4;
const OPEN3 = owned.openServiceCreditCustodiedSqliteHttpClientV3;
const ORIGINAL = custody.serializeOriginalServiceRequestCustody;
const INTENT = custody.serializeOriginalServiceDispatchIntent;
const FUNDING = 'https://http-quarantine.invalid/funding';
const SERVICE = 'https://http-quarantine.invalid/service-credit/v1/execute';
const HASH = 'a'.repeat(64);
const POLICY = Object.freeze({ policyVersion: 1, maxRequests: 4, serviceResourceUrl: SERVICE });
const CP = 'SERVICE_CREDIT_CUSTODIED_HTTP_CLIENT_';
const OP = 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const RP = 'SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_';
const REPLY = Buffer.from('{"ok":true,"resultCode":"accepted"}');
const OPTIONS = { concurrency: false, timeout: 5000 };
const f = {
  store: null, root: null, roots: [], exchanges: [], sinks: [], identities: new Map(),
  createdStoreCloses: 0, requests: 0, replies: 0, uncertain: 0, blocked: 0, profileRefusals: 0,
  stage: 0, fundingText: null, originals: new Map(), intents: new Map(), stampA: null, stampB: null,
};
const key = (grantId, requestId) => ({ grantId, requestId });
function input(grantId, requestId) {
  const originalRequestJson = JSON.stringify({
    modelVersion: 1, grantId, requestId, method: 'POST', routeId: 'service-credit.execute.v1',
    canonicalBodyDigest: 'sha256:' + sha(Buffer.alloc(0)),
    selectedContentType: 'application/json', maxCostUnits: 1,
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
function rootConfig(name, grantId) {
  return { databasePath: join(scratch, name), allowedRoot: scratch, fundingResourceUrl: FUNDING,
    custodyPolicy: POLICY, selectedGrantId: grantId, requestImpl, deadlineMs: 2000 };
}
function nativeFile(name) {
  const st = lstatSync(join(scratch, name), { bigint: true });
  a.ok(st.isFile() && !st.isSymbolicLink()); a.equal(st.uid, BigInt(process.getuid()));
  a.equal(st.dev, scratchStat.dev); a.equal(st.nlink, 1n); a.equal(st.mode & 0o777n, 0o600n);
  const id = ids(st).slice(0, 6);
  if (f.identities.has(name)) a.deepEqual(id, f.identities.get(name)); else f.identities.set(name, id);
}
function wholeFile(name) {
  nativeFile(name);
  const p = join(scratch, name), st = lstatSync(p, { bigint: true }), before = ids(st);
  a.ok(st.size <= 131072n);
  const fd = openSync(p, constants.O_RDONLY | constants.O_NOFOLLOW), b = Buffer.alloc(Number(st.size) + 1);
  let used = 0;
  try {
    a.deepEqual(ids(fstatSync(fd, { bigint: true })), before);
    while (used < b.length) { const n = readSync(fd, b, used, b.length - used, null); if (!n) break; used += n; }
    a.deepEqual(ids(fstatSync(fd, { bigint: true })), before);
  } finally { closeSync(fd); }
  a.equal(used, Number(st.size)); a.deepEqual(ids(lstatSync(p, { bigint: true })), before);
  return { identity: before, sha256: sha(b.subarray(0, used)) };
}
function closeProducer() { f.store.close(); f.store = null; f.createdStoreCloses++; }
function make(name, grantId, factory = OPEN4) {
  a.equal(f.root, null); const root = factory(rootConfig(name, grantId)); f.roots.push(root); f.root = root; return root;
}
function observe(promise) {
  const state = { promise, settled: false };
  state.result = promise.then(value => { state.settled = true; return { value }; },
    error => { state.settled = true; return { error }; });
  f.sinks.push(state.result); return state;
}
async function pending(observed) {
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  a.equal(observed.settled, false);
}
function failure(result, prefix, code) {
  a.ok(Object.hasOwn(result, 'error')); a.equal(result.error.code, prefix + code);
  a.equal(result.error.message, result.error.code); a.equal(Object.isFrozen(result.error), true);
}
function success(result) { a.equal(Object.hasOwn(result, 'error'), false); a.equal(result.value, undefined); }
async function closeRoot(root, unknown) {
  const closing = observe(root.close()); a.equal(root.close(), closing.promise);
  const result = await closing.result;
  if (unknown) failure(result, RP, 'CHILD_OUTCOME_UNKNOWN'); else success(result);
  a.equal(root.close(), closing.promise);
  const s = root.snapshot();
  a.equal(s.resource.admissionClosed, true); a.equal(s.resource.phase, 'RELEASED');
  a.equal(s.resource.slotHeld, false); a.equal(s.resource.storeCloseAttempts, 1);
  a.equal(s.resource.storeCloseOutcome, 'RETURNED');
  a.equal(s.close.outcome, unknown ? 'CHILD_UNKNOWN' : 'DRAINED');
  a.equal(s.close.childOutcome, unknown ? 'REJECTED' : 'FULFILLED');
  a.equal(s.client.owner.closed, true); a.equal(s.client.owner.active, false);
  if (f.root === root) f.root = null;
}
function frozen(v) {
  if (v !== null && typeof v === 'object') {
    a.equal(Object.isFrozen(v), true); for (const x of Object.values(v)) frozen(x);
  }
}
function redacted(root, v4 = true) {
  const s = root.snapshot(); frozen(s);
  a.equal(s.resource.ownership, v4 ? 'OWNED_EXISTING_V4_CUSTODY_QUARANTINE' : 'OWNED_EXISTING_V3_DISPATCH_INTENT');
  a.equal(s.client.storeOwnership, 'BORROWED');
  const text = JSON.stringify(s);
  for (const secret of [FUNDING, SERVICE, HASH, 'ServiceCredit ', 'declared-public-key', 'declared-signature']) {
    a.equal(text.includes(secret), false);
  }
  a.equal(s.qualification, 'UNQUALIFIED');
  for (const field of ['actualPersistence','restart','currentAuthority','realReady','serviceDelivery','osCleanup']) {
    a.equal(s[field], 'NOT_ESTABLISHED');
  }
}
function remember(root, grantId, id) {
  const state = root.readOriginalRecoveryState(key(grantId, id)); frozen(state);
  f.originals.set(id, ORIGINAL(state.original)); f.intents.set(id, INTENT(state.dispatchIntent));
  a.equal(state.dispatchStatus, 'POSSIBLY_ATTEMPTED'); a.equal(state.authority, 'NONE');
  a.equal(state.serviceOutcome, 'NOT_ESTABLISHED');
  a.equal(state.original.originalRequestJson, input(grantId, id).originalRequestJson);
  a.equal(JSON.stringify(state.original).includes('declared-signature'), false);
  a.equal(JSON.stringify(state.original).includes('ServiceCredit '), false);
  return state;
}
function stamp(name) {
  a.equal(f.root, null); a.equal(f.store, null);
  a.ok(f.roots.every(r => r.snapshot().resource.storeCloseOutcome === 'RETURNED')); nativeFile(name);
  const db = new DatabaseSync(join(scratch, name), { readOnly: true, allowExtension: false,
    enableDoubleQuotedStringLiterals: false, enableForeignKeyConstraints: true, timeout: 0 });
  try {
    const userVersion = db.prepare('PRAGMA user_version').get().user_version;
    return {
      epoch: db.prepare('SELECT owner_epoch FROM payer_recovery_meta WHERE singleton=1').get().owner_epoch,
      meta: db.prepare('SELECT singleton,resource_url FROM payer_recovery_meta ORDER BY singleton').all(),
      state: db.prepare('SELECT * FROM payer_recovery_state ORDER BY singleton').all(),
      originals: db.prepare('SELECT * FROM original_service_requests ORDER BY grant_id,request_id').all(),
      intents: db.prepare('SELECT * FROM original_dispatch_intents ORDER BY grant_id,request_id').all(),
      quarantines: userVersion === 4 ? db.prepare('SELECT * FROM original_custody_quarantines ORDER BY grant_id').all() : [],
      policy: db.prepare('SELECT * FROM original_request_custody_policy').all(),
      schema: db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all(),
      userVersion, applicationId: db.prepare('PRAGMA application_id').get().application_id,
    };
  } finally { db.close(); }
}
function unchanged(before, after, newOriginal = false) {
  for (const field of ['meta','state','quarantines','policy','schema','userVersion','applicationId']) {
    a.deepEqual(after[field], before[field]);
  }
  if (!newOriginal) { a.deepEqual(after.originals, before.originals); a.deepEqual(after.intents, before.intents); }
}
class Handle {
  #listeners = new Map(); #closed = false;
  constructor() { this.destroys = []; }
  on(name, listener) {
    const list = this.#listeners.get(name) ?? []; list.push(listener); this.#listeners.set(name, list); return this;
  }
  emit(name, ...args) { for (const listener of (this.#listeners.get(name) ?? []).slice()) listener(...args); }
  forceClose() { if (!this.#closed) { this.#closed = true; this.emit('close'); } }
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
  f.requests++;
  const x = { url, options, callback, request: new Request(), response: new Response(),
    atRequest: f.root.snapshot(), receiver: this, argc: arguments.length };
  f.exchanges.push(x);
  return x.request;
}
async function exchange(root, grantId, id, uncertain) {
  const payload = input(grantId, id), op = observe(root.submitOriginal(payload)), x = f.exchanges.at(-1);
  a.equal(x.atRequest.client.owner.counts.dispatchCalls, uncertain ? 2 : 1);
  a.equal(x.atRequest.client.owner.counts.retainCalls, uncertain ? 2 : 1);
  a.equal(x.atRequest.client.owner.counts.intentReadbackConfirmations, uncertain ? 2 : 1);
  a.equal(x.atRequest.client.owner.counts.quarantineWrites, 0);
  a.equal(x.receiver, undefined); a.equal(x.argc, 3); a.equal(x.url, SERVICE);
  a.deepEqual(x.options, { method: 'POST', headers: { Authorization: payload.authorizationHeader }, agent: false,
    rejectUnauthorized: true, maxHeaderSize: 16384, insecureHTTPParser: false });
  a.equal(Object.isFrozen(x.options.headers), true); a.deepEqual(x.request.ends, [[]]); a.equal(x.request.writes, 0);
  if (uncertain) {
    x.response.statusCode = 503; x.callback(x.response); f.uncertain++;
    a.equal(x.request.destroys.length, 1); a.equal(x.response.destroys.length, 1);
  } else {
    x.callback(x.response); x.response.complete = true;
    x.response.emit('data', Buffer.from(REPLY)); x.response.emit('end'); f.replies++;
  }
  await pending(op); x.request.forceClose(); await pending(op); x.response.forceClose();
  const result = await op.result;
  if (uncertain) failure(result, OP, 'SUBMISSION_OUTCOME_UNKNOWN'); else success(result);
  const s = root.snapshot(); a.equal(s.client.lastTransport.timerArmed, false);
  a.equal(s.client.lastTransport.credentialReferenceReleased, true);
  a.equal(s.client.lastTransport.phase, uncertain ? 'UNKNOWN' : 'INTERFACE_COMPLETED');
  return remember(root, grantId, id);
}
function diagnostic(t, scenario) {
  t.diagnostic(JSON.stringify({
    kind: 'P2_HTTP_QUARANTINE_V4', version: 1, scenario,
    nativeSqliteFiles: f.identities.size, createdStoreCloses: f.createdStoreCloses,
    ownedStoreReturnedCloses: f.roots.filter(r => r.snapshot().resource.storeCloseOutcome === 'RETURNED').length,
    declaredHttpRequests: f.requests, validatedFakeReplies: f.replies, uncertainFakeResponses: f.uncertain,
    blockedFreshSubmits: f.blocked, wrongProfileRefusals: f.profileRefusals,
    automaticQuarantineWriteAttempts: f.roots.reduce((n,r) => n + (r.snapshot().client.owner.counts.quarantineWrites ?? 0), 0),
    confirmedQuarantineReadbacks: f.roots.reduce((n,r) => n + (r.snapshot().client.owner.counts.quarantineReadbackConfirmations ?? 0), 0),
    networkCalls: 0, syntheticSignatureOperations: 0, realPaymentSigner: 'DISABLED', serviceDelivery: 'NOT_ESTABLISHED',
  }));
}
after(async () => {
  try {
    for (const x of f.exchanges) { x.request.forceClose(); x.response.forceClose(); }
    for (const root of f.roots) {
      const s = root.snapshot();
      await closeRoot(root, s.close.childUncertainty || s.client.owner.uncertainty.custody
        || s.client.owner.uncertainty.submission || s.client.owner.uncertainty.undrained);
    }
    await Promise.all(f.sinks);
  } finally { if (f.store !== null) closeProducer(); }
  a.deepEqual(sources(), sourceBefore); a.equal(f.stage, 3);
});
test("V4 owned HTTP composition persists transport uncertainty before owned close", OPTIONS, async t => {
  a.equal(f.stage, 0);
  a.deepEqual(Object.keys(http).sort(), ['createServiceCreditCustodiedHttpClient',
    'createServiceCreditCustodiedHttpClientV3','createServiceCreditCustodiedHttpClientV4']);
  a.deepEqual(Object.keys(owned).sort(), ['openServiceCreditCustodiedSqliteHttpClient',
    'openServiceCreditCustodiedSqliteHttpClientV3','openServiceCreditCustodiedSqliteHttpClientV4']);
  f.store = CREATE4(config('client-v4.sqlite')); nativeFile('client-v4.sqlite');
  f.store.prepare(pair()); f.store.fenceAttempt('PREPARED'); f.store.finishAttempt('BOUND');
  f.fundingText = JSON.stringify(f.store.load()); closeProducer();
  const root = make('client-v4.sqlite', 'grant-a'); redacted(root);
  a.equal(root.snapshot().client.owner.custodyQuarantine.status, 'NOT_RECORDED');
  await exchange(root, 'grant-a', 'original-good', false);
  await exchange(root, 'grant-a', 'original-unknown', true);
  const q = root.snapshot().client.owner;
  a.equal(q.custodyQuarantine.status, 'PERSISTED_UNKNOWN'); a.equal(q.counts.quarantineWrites, 1);
  a.equal(q.counts.quarantineReadbackConfirmations, 1); a.equal(q.uncertainty.submission, true);
  redacted(root); await closeRoot(root, true); redacted(root);
  f.stampA = stamp('client-v4.sqlite'); a.equal(f.stampA.epoch, 2); a.equal(f.stampA.userVersion, 4);
  a.equal(f.stampA.originals.length, 2); a.equal(f.stampA.intents.length, 2); a.equal(f.stampA.quarantines.length, 1);
  const quarantine = JSON.parse(f.stampA.quarantines[0].envelope);
  a.equal(quarantine.grantId, 'grant-a'); a.equal(quarantine.status, 'CUSTODY_OUTCOME_UNKNOWN');
  a.equal(quarantine.authority, 'NONE'); a.equal(quarantine.paymentHash, HASH); a.deepEqual(quarantine.custodyPolicy, POLICY);
  for (const row of f.stampA.originals) a.equal(row.envelope, f.originals.get(row.request_id));
  for (const row of f.stampA.intents) a.equal(row.envelope, f.intents.get(row.request_id));
  f.stage = 1; diagnostic(t, 'OWNED_HTTP_UNKNOWN_LATCH_AND_DB_RELEASE');
});
test("fresh owned V4 reopen blocks quarantined HTTP dispatch and retains scoped metadata", OPTIONS, async t => {
  a.equal(f.stage, 1); const root = make('client-v4.sqlite', 'grant-a');
  a.equal(root.snapshot().client.owner.custodyQuarantine.status, 'PERSISTED_UNKNOWN');
  a.equal(root.snapshot().client.owner.custodyQuarantine.writeAttempted, false);
  a.equal(root.snapshot().client.lastTransport, null); const before = root.snapshot().client.owner.counts;
  failure(await observe(root.submitOriginal(input('grant-a','blocked-after-reopen'))).result, CP, 'CUSTODY_OUTCOME_UNKNOWN');
  f.blocked++; a.deepEqual(root.snapshot().client.owner.counts, before); a.equal(f.requests, 2);
  const keys = root.readOriginalRecoveryKeys(); frozen(keys);
  a.deepEqual(keys.keys, [key('grant-a','original-good'),key('grant-a','original-unknown')]);
  a.equal(keys.authority, 'NONE'); a.equal(keys.qualification, 'UNQUALIFIED');
  for (const k of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed']) a.equal(keys[k], false);
  for (const id of ['original-good','original-unknown']) {
    const state = root.readOriginalRecoveryState(key('grant-a',id));
    a.equal(ORIGINAL(state.original), f.originals.get(id)); a.equal(INTENT(state.dispatchIntent), f.intents.get(id));
    a.equal(state.uncertainty.custody, true); a.equal(state.dispatchStatus, 'POSSIBLY_ATTEMPTED');
  }
  const scoped = root.snapshot().client.owner.counts;
  a.throws(() => root.readOriginalRecoveryState(key('grant-b','foreign')), { code: OP + 'FOREIGN_GRANT' });
  a.deepEqual(root.snapshot().client.owner.counts, scoped); redacted(root); await closeRoot(root, true);
  const reopened = stamp('client-v4.sqlite'); a.equal(reopened.epoch, 3); unchanged(f.stampA, reopened);
  const other = make('client-v4.sqlite', 'grant-b');
  a.equal(other.snapshot().client.owner.custodyQuarantine.status, 'NOT_RECORDED');
  await exchange(other, 'grant-b', 'other-original', false); redacted(other); await closeRoot(other, false);
  f.stampA = stamp('client-v4.sqlite'); a.equal(f.stampA.epoch, 4); unchanged(reopened, f.stampA, true);
  a.equal(f.stampA.originals.length, 3); a.equal(f.stampA.intents.length, 3); a.equal(f.stampA.quarantines.length, 1);
  a.equal(f.requests, 3); f.stage = 2; diagnostic(t, 'NORMAL_REOPEN_SCOPED_QUARANTINE_NO_REPLAY');
});
test("V4 and V3 owned factories refuse wrong profiles without migrating closed files", OPTIONS, async t => {
  a.equal(f.stage, 2); f.store = CREATE3(config('client-v3.sqlite')); nativeFile('client-v3.sqlite'); closeProducer();
  const originalV3 = wholeFile('client-v3.sqlite'), originalV4 = wholeFile('client-v4.sqlite');
  for (const [factory,name] of [[OPEN4,'client-v3.sqlite'],[OPEN3,'client-v4.sqlite']]) {
    a.throws(() => factory(rootConfig(name,'grant-a')), { code: RP + 'ACQUISITION_FAILED' });
    a.deepEqual(wholeFile('client-v3.sqlite'), originalV3); a.deepEqual(wholeFile('client-v4.sqlite'), originalV4);
    f.profileRefusals++;
  }
  const control = make('client-v3.sqlite','grant-v3',OPEN3); redacted(control, false);
  a.equal(Object.hasOwn(control.snapshot().client.owner,'custodyQuarantine'), false);
  a.deepEqual(Object.keys(control.snapshot().client.owner.counts), ['loadReads','recordReads','retainCalls',
    'readbackConfirmations','dispatchCalls','callbackCompletions','intentWrites','intentReads','intentReadbackConfirmations']);
  await closeRoot(control, false); f.stampB = stamp('client-v3.sqlite');
  a.equal(f.stampB.epoch, 2); a.equal(f.stampB.userVersion, 3);
  a.equal(f.stampB.originals.length, 0); a.equal(f.stampB.intents.length, 0);
  a.equal(f.stampB.schema.some(row => row.name === 'original_custody_quarantines'), false);
  a.deepEqual(wholeFile('client-v4.sqlite'), originalV4); a.deepEqual(stamp('client-v4.sqlite'), f.stampA);
  a.equal(f.requests, 3); a.equal(f.profileRefusals, 2); a.equal(f.createdStoreCloses, 2);
  f.stage = 3; diagnostic(t, 'WRONG_PROFILE_NO_MIGRATION_AND_V3_CONTROL');
});
