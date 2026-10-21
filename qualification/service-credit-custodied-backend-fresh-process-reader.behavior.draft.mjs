// Different-process data-only recovery for the current backend-bound reader.
// Opens only the TWO new SQLite files seeded by the preceding process.
// No capability key/proof generation, transport, session, payment or signing.
// Persisted intent is data, not reconstructed response certainty or authority.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ENTRY = 'qualification/service-credit-custodied-backend-fresh-process-reader.behavior.draft.mjs';
const SELF = fileURLToPath(import.meta.url), REPO = resolve(dirname(SELF), '..');
const SPECS = [
  [
    "src/service-credit-sqlite-store.js",
    83516,
    2366,
    "eea4032830dc1f641c4832e0dab33066633ba487eaf19581e3295cf8810460f3"
  ],
  [
    "src/service-credit-model.js",
    55461,
    1580,
    "7ff7e3d88ab8c3b38a0073541533fbdb7a0d9f2be42f337ac35f6a3b05615c3a"
  ],
  [
    "src/service-credit-execution-contract.js",
    30258,
    956,
    "298f8e74885e1c507953c0fcf7874832f815296746e6bacbdac97a425f1a6c73"
  ],
  [
    "src/service-credit-http.js",
    32432,
    958,
    "c76a7f1864bdfcd0c26916bf28fba615c8aecf899d53e69467e3ebe7d3353d0d"
  ],
  [
    "src/service-credit-capability.js",
    8284,
    256,
    "cb2b96d9a2e56c132dd1b4aca8f1c065b244ecd0e7e92f41ea3f4a8c969d17c3"
  ],
  [
    "package.json",
    1413,
    40,
    "8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"
  ],
  [
    "src/service-credit-backend-original-outcome-reader.js",
    7738,
    182,
    "dadd9cbfbdcc2ff4bb24252fed85a135d2ce17397e713b1917a109eb6b28938d"
  ],
  [
    "src/service-credit-custodied-http-client.js",
    10755,
    292,
    "ddbc54faf4a14d95e6274bc9df27b7b49db251bab67c11b871cfb2f9e78b4f15"
  ],
  [
    "src/service-credit-custodied-request-owner.js",
    35073,
    938,
    "6e7493a4859d48530820e68a4a19a513aad014ffc1048b42965a3ad36ae7c5f7"
  ],
  [
    "src/service-credit-original-request-custody-contract.js",
    14051,
    356,
    "fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915"
  ],
  [
    "src/service-credit-http-execute-dispatch.js",
    27034,
    770,
    "254ba8eef5ea5efb3a1b901be09e9cb33afbc3cfcf63789ca4a23316b6180d1b"
  ],
  [
    "src/service-credit-custodied-backend-recovery-client.js",
    18190,
    398,
    "31d3ad19504c0d2a4046433bbbbd55e4115bafe15c8cc8e8ef73cfee095e0193"
  ],
  [
    "src/service-credit-custodied-sqlite-http-client.js",
    18540,
    511,
    "ea16d6ac5ce72d6434c06e98c52c324daf918dd570f15997cdc21e501f677f4e"
  ],
  [
    "src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js",
    57471,
    1536,
    "974f5e28f851b8504efb71cb800e71881f8d37965bad927be2d18c5f7324b224"
  ],
  [
    "src/x402-wire.js",
    39886,
    934,
    "5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"
  ],
  [
    "src/service-credit-durable-http-session.js",
    13978,
    425,
    "a0d6d1436cdb697f125fee2f4dc723a5ddcfd2ee7063b55d56fa006bb8ba69bf"
  ],
  [
    "src/service-credit-durable-execution-owner.js",
    40833,
    1301,
    "a63a795dda77489f7da0682d83a0683cf07240f83b803f449668cb687a956863"
  ],
  [
    "src/service-credit-durable-session-close.js",
    2470,
    84,
    "5aae36a7da39ce5b7b9a8da8e9fbda88465cb1e4853dc791520a1df0ab87ede7"
  ],
  [
    "src/service-credit-custodied-sequential-runner-core.js",
    15749,
    489,
    "42b5f7d7f1f8318ff50dd79d1729d93220c51ab95a7449610d44de91916c7914"
  ]
];
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], SELF);
assert.equal(process.versions.node, '24.19.0');
assert.equal(process.env.P2_PROCESS_OPT_IN, 'synthetic-native-reader-continuity-only');
assert.equal(process.env.P2_PROCESS_ROLE, 'READER');
const PINS = JSON.parse(process.env.P2_PROCESS_PINS), scratch = process.env.SPV_TASK_SCRATCH;
assert.equal(typeof scratch, 'string'); assert.equal(resolve(scratch), scratch);
const scratchStat = lstatSync(scratch, { bigint: true });
assert.ok(scratchStat.isDirectory() && !scratchStat.isSymbolicLink());
assert.equal(scratchStat.uid, BigInt(process.getuid())); assert.equal(scratchStat.mode & 0o777n, 0o700n);
const FILES = ['backend.sqlite', 'payer.sqlite'];

const ids = s => ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k => String(s[k]));
const sha = b => createHash('sha256').update(b).digest('hex');
function sources() {
  assert.equal(PINS.length, 21); assert.deepEqual(PINS.map(p => p.path), [...SPECS.map(p => p[0]), "qualification/service-credit-custodied-backend-fresh-process-seed.behavior.draft.mjs", "qualification/service-credit-custodied-backend-fresh-process-reader.behavior.draft.mjs"]);
  let total = 0;
  return PINS.map((p, index) => {
    const name = join(REPO, p.path), stat = lstatSync(name, { bigint: true });
    assert.ok(stat.isFile() && !stat.isSymbolicLink()); assert.equal(stat.uid, BigInt(process.getuid()));
    assert.equal(stat.nlink, 1n); assert.ok(stat.size > 0n && stat.size <= 131072n); assert.deepEqual(ids(stat), p.identity);
    const fd = openSync(name, constants.O_RDONLY | constants.O_NOFOLLOW), data = Buffer.alloc(Number(stat.size) + 1);
    let used = 0;
    try {
      assert.deepEqual(ids(fstatSync(fd, { bigint: true })), p.identity);
      while (used < data.length) { const n = readSync(fd, data, used, data.length - used, null); if (!n) break; used += n; }
      assert.deepEqual(ids(fstatSync(fd, { bigint: true })), p.identity);
    } finally { closeSync(fd); }
    assert.deepEqual(ids(lstatSync(name, { bigint: true })), p.identity); assert.equal(used, Number(stat.size));
    const raw = data.subarray(0, used); assert.equal(raw.includes(0), false); assert.equal(raw.some(c => c > 127), false);
    total += used; assert.ok(total <= 655360); assert.equal(sha(raw), p.sha256); assert.equal(raw.length, p.bytes);
    assert.equal(raw.filter(c => c === 10).length, p.LF);
    if (index < SPECS.length) assert.deepEqual([p.path, p.bytes, p.LF, p.sha256], SPECS[index]);
    return { path: p.path, bytes: p.bytes, sha256: p.sha256, identity: p.identity };
  });
}
const sourceBefore = sources();

const CHECKPOINT = JSON.parse(process.env.P2_PROCESS_CHECKPOINT);
const DB_PINS = JSON.parse(process.env.P2_PROCESS_DATABASE_PINS);
assert.deepEqual(Object.keys(CHECKPOINT).sort(), ['protocol','seedPid','payerEpoch',
  'payerContentSha256','backendContentSha256','originalCount','intentCount','backendCallbacks',
  'seedLiveSubmissionUnknown','sourceGraphSha256'].sort());
assert.equal(CHECKPOINT.protocol, 'P2_BACKEND_READER_CONTINUITY_V1');
assert.ok(Number.isSafeInteger(CHECKPOINT.seedPid) && CHECKPOINT.seedPid > 0);
assert.notEqual(process.pid, CHECKPOINT.seedPid);
assert.equal(CHECKPOINT.payerEpoch, 2); assert.equal(CHECKPOINT.originalCount, 2);
assert.equal(CHECKPOINT.intentCount, 2); assert.equal(CHECKPOINT.backendCallbacks, 2);
assert.equal(CHECKPOINT.seedLiveSubmissionUnknown, true);
for (const k of ['payerContentSha256','backendContentSha256','sourceGraphSha256']) {
  assert.match(CHECKPOINT[k], /^[0-9a-f]{64}$/);
}
assert.deepEqual(DB_PINS.map(p => p.path), FILES);
for (const p of DB_PINS) {
  assert.deepEqual(Object.keys(p).sort(), ['path','bytes','LF','sha256','gitBlob','identity'].sort());
  const name = join(scratch, p.path), st = lstatSync(name, { bigint: true });
  assert.ok(st.isFile() && !st.isSymbolicLink()); assert.equal(st.uid, BigInt(process.getuid()));
  assert.equal(st.dev, scratchStat.dev); assert.equal(st.nlink, 1n); assert.equal(st.mode & 0o777n, 0o600n);
  assert.ok(st.size > 0n && st.size <= 131072n); assert.deepEqual(ids(st), p.identity);
  const fd = openSync(name, constants.O_RDONLY | constants.O_NOFOLLOW), bytes = Buffer.alloc(Number(st.size) + 1);
  let used = 0;
  try {
    assert.deepEqual(ids(fstatSync(fd, { bigint: true })), p.identity);
    while (used < bytes.length) { const n = readSync(fd, bytes, used, bytes.length - used, null); if (!n) break; used += n; }
    assert.deepEqual(ids(fstatSync(fd, { bigint: true })), p.identity);
  } finally { closeSync(fd); }
  assert.deepEqual(ids(lstatSync(name, { bigint: true })), p.identity);
  assert.equal(used, Number(st.size)); assert.equal(used, p.bytes); assert.equal(sha(bytes.subarray(0,used)), p.sha256);
}
const { ServiceCreditSqliteStore: Backend } = await import('../src/service-credit-sqlite-store.js');
const { openServiceCreditCustodiedSqliteBackendRecoveryClientV3: OPEN }
  = await import('../src/service-credit-custodied-backend-recovery-client.js');
const { serializeOriginalServiceRequestCustody: SERIALIZE,
  serializeOriginalServiceDispatchIntent: SERIALIZE_INTENT }
  = await import('../src/service-credit-original-request-custody-contract.js');
const { DatabaseSync } = await import('node:sqlite');
const OPTIONS = { timeout: 5000, concurrency: false };
const FUNDING = 'https://backend-process.invalid/funding';
const SERVICE = 'https://backend-process.invalid/service-credit/v1/execute';
const POLICY = Object.freeze({ policyVersion: 1, maxRequests: 8, serviceResourceUrl: SERVICE });
const HASH = 'a'.repeat(64), EMPTY = 'sha256:' + sha(Buffer.alloc(0));
const f = { client: null, backend: null, rawBefore: null, catalog: null, grantId: null,
  clientClosed: false, backendClosed: false, checkpoint: null, catalogCount: 0,
  stateReads: 0, originalReads: 0, closeReturns: 0, submissionUnknownObserved: null };
function canonical(x) {
  if (x === null || typeof x !== 'object') return JSON.stringify(x);
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
}
function hashValue(x) { return sha(Buffer.from(canonical(x))); }
function frozen(x) {
  if (x !== null && typeof x === 'object') { assert.ok(Object.isFrozen(x)); for (const v of Object.values(x)) frozen(v); }
}
function database(name, collect) {
  const path = join(scratch,name), st = lstatSync(path, { bigint: true });
  assert.ok(st.isFile() && !st.isSymbolicLink()); assert.equal(st.uid, BigInt(process.getuid()));
  assert.equal(st.dev, scratchStat.dev); assert.equal(st.nlink, 1n); assert.equal(st.mode & 0o777n, 0o600n);
  const db = new DatabaseSync(path, { readOnly: true, allowExtension: false,
    enableDoubleQuotedStringLiterals: false, enableForeignKeyConstraints: true, timeout: 0 });
  try { return collect(db); } finally { db.close(); }
}
function payerStamp() {
  assert.ok(f.client === null || f.clientClosed);
  return database('payer.sqlite', db => ({
    epoch: db.prepare('SELECT owner_epoch FROM payer_recovery_meta WHERE singleton=1').get().owner_epoch,
    meta: db.prepare('SELECT singleton,resource_url FROM payer_recovery_meta ORDER BY singleton').all(),
    state: db.prepare('SELECT * FROM payer_recovery_state ORDER BY singleton').all(),
    originals: db.prepare('SELECT * FROM original_service_requests ORDER BY grant_id,request_id').all(),
    intents: db.prepare('SELECT * FROM original_dispatch_intents ORDER BY grant_id,request_id').all(),
    policy: db.prepare('SELECT * FROM original_request_custody_policy ORDER BY singleton').all(),
    schema: db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all(),
    userVersion: db.prepare('PRAGMA user_version').get().user_version,
    applicationId: db.prepare('PRAGMA application_id').get().application_id,
  }));
}
function payerContent(x) { const { epoch, ...stable } = x; return stable; }
function backendStamp() {
  assert.ok(f.backend === null || f.backendClosed);
  return database('backend.sqlite', db => ({
    ledger: db.prepare('SELECT * FROM service_credit_ledger ORDER BY singleton').all(),
    schema: db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all(),
    userVersion: db.prepare('PRAGMA user_version').get().user_version,
    applicationId: db.prepare('PRAGMA application_id').get().application_id,
  }));
}
function request(id) {
  return { modelVersion: 1, grantId: f.grantId, requestId: id, method: 'POST',
    routeId: 'service-credit.execute.v1', canonicalBodyDigest: EMPTY, selectedContentType: 'application/json', maxCostUnits: 1 };
}
const keyOf = requestId => ({ grantId: f.grantId, requestId });
function owner() { return f.client.snapshot().client.client.owner; }
function diagnostic(t, scenario, checkpoint = null) {
  const counts = owner().counts;
  t.diagnostic(JSON.stringify({ kind: 'P2_PROCESS_CONTINUITY', version: 1, role: 'READER', scenario,
    pid: process.pid, seedPid: CHECKPOINT.seedPid, catalogCount: f.catalogCount,
    stateReads: f.stateReads, originalReads: f.originalReads, nativeRetains: counts.retainCalls,
    nativeIntents: counts.intentWrites, nativeDispatches: counts.dispatchCalls,
    closeReturns: f.closeReturns, submissionUnknownObserved: f.submissionUnknownObserved,
    syntheticProofs: 0, nativeSqliteFiles: 2, networkCalls: 0, realPaymentSigner: 'DISABLED',
    serviceDelivery: 'NOT_ESTABLISHED', checkpoint }));
}
before(() => {
  assert.equal(hashValue(PINS.map(p => ({ path:p.path, bytes:p.bytes, sha256:p.sha256 }))), CHECKPOINT.sourceGraphSha256);
  f.rawBefore = { payer: payerStamp(), backend: backendStamp() };
  assert.equal(f.rawBefore.payer.epoch, CHECKPOINT.payerEpoch);
  assert.equal(hashValue(payerContent(f.rawBefore.payer)), CHECKPOINT.payerContentSha256);
  assert.equal(hashValue(f.rawBefore.backend), CHECKPOINT.backendContentSha256);
  assert.equal(f.rawBefore.payer.originals.length, 2); assert.equal(f.rawBefore.payer.intents.length, 2);
  f.grantId = f.rawBefore.payer.originals[0].grant_id;
  assert.equal(typeof f.grantId, 'string');
  assert.ok(f.rawBefore.payer.originals.every(r => r.grant_id === f.grantId));
});
after(async () => {
  if (f.client !== null && !f.clientClosed) { assert.equal(await f.client.close(), undefined); f.clientClosed = true; }
  if (f.backend !== null && !f.backendClosed) { f.backend.close(); f.backendClosed = true; }
  assert.deepEqual(sources(), sourceBefore);
});
test('fresh-process reader opens existing native files through the no-dispatch backend connection', OPTIONS, async t => {
  f.backend = Backend.openExisting({ databasePath: join(scratch,'backend.sqlite'), allowedRoot: scratch,
    deriveCost() { return 1; }, now() { return 1000; }, busyTimeoutMs: 50,
    maxStateBytes: 65536, maxOffers: 2, maxGrants: 2, maxRequests: 8 });
  f.client = await OPEN({ databasePath: join(scratch,'payer.sqlite'), allowedRoot: scratch,
    backendStore: f.backend, fundingResourceUrl: FUNDING, custodyPolicy: POLICY,
    selectedGrantId: f.grantId, deadlineMs: 2000 });
  frozen(f.client);
  assert.deepEqual(Object.keys(f.client), ['readOriginal','readOriginalRecoveryState','readOriginalRecoveryKeys',
    'readOriginalBackendRecoveryState','snapshot','close']);
  for (const name of ['submitOriginal','runOriginals','requestImpl','store','backendStore','prepare','sign','pay']) {
    assert.equal(Object.hasOwn(f.client,name), false);
  }
  const snapshot = f.client.snapshot();
  assert.equal(snapshot.storeOwnership,'PAYER_OWNED_BACKEND_BORROWED');
  assert.equal(snapshot.authority,'NONE'); assert.equal(snapshot.serviceDelivery,'NOT_ESTABLISHED');
  assert.equal(Object.hasOwn(snapshot,'serviceDispatchCapability'),false);
  f.catalog = f.client.readOriginalRecoveryKeys(); f.catalogCount++;
  frozen(f.catalog); assert.deepEqual(f.catalog.keys,[keyOf('process-first'),keyOf('process-second-unknown')]);
  assert.equal(f.catalog.authority,'NONE');
  for (const name of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed']) assert.equal(f.catalog[name],false);
  assert.equal(f.catalog.funding.status,'BOUND'); assert.equal(f.catalog.funding.revision,3);
  assert.equal(f.catalog.funding.paymentHash,HASH); // Declared fixture row, not real funding authority.
  diagnostic(t,'EXISTING_FILES_NO_DISPATCH_READER');
});
test('fresh-process reader preserves original bytes and intent without reconstructing response certainty', OPTIONS, async t => {
  for (const id of ['process-first','process-second-unknown']) {
    const state = f.client.readOriginalRecoveryState(keyOf(id)); f.stateReads++;
    const original = f.client.readOriginal(keyOf(id)); f.originalReads++;
    frozen(state); frozen(original);
    const raw = f.rawBefore.payer.originals.find(r => r.request_id === id);
    const intent = f.rawBefore.payer.intents.find(r => r.request_id === id);
    assert.equal(SERIALIZE(state.original),raw.envelope);
    assert.equal(SERIALIZE(original),raw.envelope);
    assert.equal(SERIALIZE_INTENT(state.dispatchIntent),intent.envelope);
    assert.equal(state.original.originalRequestJson,JSON.stringify(request(id)));
    assert.equal(state.original.originalBodyBase64,''); assert.equal(state.original.paymentHash,HASH);
    assert.equal(state.dispatchStatus,'POSSIBLY_ATTEMPTED'); assert.equal(state.funding.revision,3);
    assert.equal(state.funding.status,'BOUND'); assert.equal(state.authority,'NONE');
    assert.equal(state.serviceOutcome,'NOT_ESTABLISHED');
    assert.equal(state.uncertainty.submission,false); // Prior live flag is NOT a durable transport receipt.
  }
  f.submissionUnknownObserved = owner().uncertainty.submission;
  assert.equal(f.submissionUnknownObserved,false); assert.equal(CHECKPOINT.seedLiveSubmissionUnknown,true);
  assert.equal(f.client.snapshot().client.client.lastTransport,null);
  assert.equal(owner().counts.retainCalls,0); assert.equal(owner().counts.intentWrites,0); assert.equal(owner().counts.dispatchCalls,0);
  diagnostic(t,'EXACT_ORIGINAL_INTENT_AND_UNCERTAINTY_LIMIT');
});
test('fresh-process reader closes once with only owner epoch advanced and backend data unchanged', OPTIONS, async t => {
  const closing=f.client.close(); assert.equal(closing,f.client.close()); assert.equal(await closing,undefined);
  f.closeReturns++; f.clientClosed=true;
  assert.equal(closing,f.client.close());
  const snapshot=f.client.snapshot().client;
  assert.equal(snapshot.resource.phase,'RELEASED'); assert.equal(snapshot.resource.slotHeld,false);
  assert.equal(snapshot.resource.storeCloseAttempts,1); assert.equal(snapshot.resource.storeCloseOutcome,'RETURNED');
  assert.equal(snapshot.close.outcome,'DRAINED');
  assert.equal(f.backend.getDurableExecutionSnapshot().executionState.executions.length,2);
  for (const id of ['process-first','process-second-unknown']) assert.equal(f.backend.getRequest(keyOf(id)).state,'SUCCEEDED');
  f.backend.close(); f.backendClosed=true;
  const after={payer:payerStamp(),backend:backendStamp()};
  assert.equal(after.payer.epoch,CHECKPOINT.payerEpoch+1);
  assert.equal(hashValue(payerContent(after.payer)),CHECKPOINT.payerContentSha256);
  assert.equal(hashValue(after.backend),CHECKPOINT.backendContentSha256);
  assert.equal(after.payer.originals.length,2); assert.equal(after.payer.intents.length,2);
  assert.equal(after.payer.userVersion,3); assert.equal(after.payer.applicationId,0x5a505252);
  for (const p of DB_PINS) assert.deepEqual(ids(lstatSync(join(scratch,p.path), { bigint: true })).slice(0,6),p.identity.slice(0,6));
  f.checkpoint={ protocol:'P2_BACKEND_READER_CONTINUITY_V1',seedPid:CHECKPOINT.seedPid,readerPid:process.pid,
    payerEpochBefore:CHECKPOINT.payerEpoch,payerEpochAfter:after.payer.epoch,
    payerContentSha256:hashValue(payerContent(after.payer)),backendContentSha256:hashValue(after.backend),
    originalCount:after.payer.originals.length,intentCount:after.payer.intents.length,
    priorLiveUnknownReconstructed:false,backendExecutions:2,sourceGraphSha256:CHECKPOINT.sourceGraphSha256 };
  diagnostic(t,'NATIVE_CLOSE_EPOCH_ONLY_AND_STABLE_BACKEND',f.checkpoint);
});
