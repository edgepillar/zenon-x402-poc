// Two NORMAL-EXIT foreground processes on TWO new private synthetic SQLite files.
// Seed: two strict V6 responses, then backend commit/response loss and persistent quarantine.
// Recover: actual no-dispatch V6 backend reader with exact checkpoint/pins and synthetic PUBLIC proofs.
// Private key stays only in seed-process memory; no key serialization, re-signing, SDK or network.
// Witness is bounded private DATA, not authenticated authority, delivery or a restart guarantee.
// Not forced crash, power loss, OS restart, real credential custody, live payment recovery or physical durability.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { lstatSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ENTRY = "qualification/service-credit-custodied-backend-v6-process-checkpoint.behavior.draft.mjs";
const SELF = fileURLToPath(import.meta.url), REPO = resolve(dirname(SELF), '..');
const SPECS = [
  [
    "src/service-credit-custodied-backend-recovery-client.js",
    30113,
    609,
    "535071f8fe671c16eeb35ab25bf99f12c5d3aa1b9b0f07e0cbbcfb6345220e34"
  ],
  [
    "src/service-credit-sqlite-store.js",
    83516,
    2366,
    "eea4032830dc1f641c4832e0dab33066633ba487eaf19581e3295cf8810460f3"
  ],
  [
    "src/service-credit-durable-http-session.js",
    13978,
    425,
    "a0d6d1436cdb697f125fee2f4dc723a5ddcfd2ee7063b55d56fa006bb8ba69bf"
  ],
  [
    "package.json",
    1413,
    40,
    "8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"
  ],
  [
    "src/service-credit-custodied-http-client.js",
    12646,
    324,
    "35997f41c9a5162fe29ed56776181a1691c0a0a69c7dbdfe8b61785af3998145"
  ],
  [
    "src/service-credit-custodied-sqlite-http-client.js",
    22706,
    578,
    "a66cfeccbf4e4490d939d006525a400f7dd7eac56911080c54c38ccc8e3374cd"
  ],
  [
    "src/service-credit-pilot-original-payment-checkpoint.js",
    4003,
    89,
    "930905f31824a6cadc16dfb84572cd4dc38a81e2fce4569b73b6bef29dec97d1"
  ],
  [
    "src/service-credit-custodied-sqlite-recovery-reader.js",
    5907,
    139,
    "75c3331bde079c811debe066c629e8f61aea75d6973542b8d0648cf36045bf30"
  ],
  [
    "src/service-credit-backend-original-outcome-reader.js",
    7738,
    182,
    "dadd9cbfbdcc2ff4bb24252fed85a135d2ce17397e713b1917a109eb6b28938d"
  ],
  [
    "src/service-credit-custodied-sequential-runner-core.js",
    15983,
    492,
    "044477cb1300453f10bacf070037db175d08deec1d488549b34a5cb92e6328bd"
  ],
  [
    "src/service-credit-original-request-custody-contract.js",
    14051,
    356,
    "fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915"
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
    "src/service-credit-durable-execution-owner.js",
    40833,
    1301,
    "a63a795dda77489f7da0682d83a0683cf07240f83b803f449668cb687a956863"
  ],
  [
    "src/service-credit-http.js",
    32432,
    958,
    "c76a7f1864bdfcd0c26916bf28fba615c8aecf899d53e69467e3ebe7d3353d0d"
  ],
  [
    "src/service-credit-durable-session-close.js",
    2470,
    84,
    "5aae36a7da39ce5b7b9a8da8e9fbda88465cb1e4853dc791520a1df0ab87ede7"
  ],
  [
    "src/service-credit-custodied-request-owner.js",
    55155,
    1358,
    "2ba222760d4a922bf0466d95fd2671076b9d19b8c5fa4ea2cb3c66b1338562eb"
  ],
  [
    "src/service-credit-http-execute-dispatch.js",
    28104,
    790,
    "929881081b22b90b07d3d1c4dc8f873d4d81ee5ae84542d24b7534674f4eb9c0"
  ],
  [
    "src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js",
    83681,
    2042,
    "bea9e00aa6208f776561c975d54640dfb676168dd4d0b44d125c9dc684912c4a"
  ],
  [
    "src/service-credit-custodied-sqlite-sequential-runner.js",
    23370,
    542,
    "6a13fa59532928f707167431c4c769a110d1bba61df5b218db86354934110e6a"
  ],
  [
    "src/service-credit-capability.js",
    8284,
    256,
    "cb2b96d9a2e56c132dd1b4aca8f1c065b244ecd0e7e92f41ea3f4a8c969d17c3"
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
    "src/service-credit-pilot-status-view.js",
    3202,
    60,
    "cf3822d8b9ec4eb4772452ed1888b96d398fd87c1ead44cd155a5acc1a6b66ed"
  ]
];
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], SELF);
assert.equal(process.versions.node, '24.19.0'); assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.env.P2_BACKEND_V6_PROCESS_OPT_IN, 'synthetic-native-backend-v6-process-recovery-only');
const PINS = JSON.parse(process.env.P2_BACKEND_V6_PROCESS_PINS), scratch = process.env.SPV_TASK_SCRATCH;
assert.equal(typeof scratch, 'string'); assert.equal(resolve(scratch), scratch);
const scratchStat = lstatSync(scratch, { bigint: true });
assert.ok(scratchStat.isDirectory() && !scratchStat.isSymbolicLink());
assert.equal(scratchStat.uid, BigInt(process.getuid())); assert.equal(scratchStat.mode & 0o777n, 0o700n);
const FILES = ['backend-v6-process.sqlite', 'payer-v6-process.sqlite'];
const PHASE = process.env.P2_BACKEND_V6_PROCESS_PHASE;
assert.ok(PHASE === 'seed' || PHASE === 'recover');
const rawWitness = process.env.P2_BACKEND_V6_PROCESS_WITNESS;
assert.equal(typeof rawWitness, 'string'); assert.ok(Buffer.byteLength(rawWitness) <= 16384);
const W = JSON.parse(rawWitness);
if (PHASE === 'seed') {
 assert.equal(W, null);
 for (const name of FILES) assert.throws(() => lstatSync(join(scratch, name)), { code: 'ENOENT' });
}
const ids = s => ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k => String(s[k]));
const sha = b => createHash('sha256').update(b).digest('hex');
function sources() {
  assert.equal(PINS.length, 27); assert.deepEqual(PINS.map(p => p.path), [...SPECS.map(p => p[0]), ENTRY]);
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
    total += used; assert.ok(total <= 786432); assert.equal(sha(raw), p.sha256); assert.equal(raw.length, p.bytes);
    assert.equal(raw.filter(c => c === 10).length, p.LF);
    if (index < SPECS.length) assert.deepEqual([p.path, p.bytes, p.LF, p.sha256], SPECS[index]);
    return { path: p.path, bytes: p.bytes, sha256: p.sha256, identity: p.identity };
  });
}
function filePin(name) {
 assert.ok(FILES.includes(name));
 const path = join(scratch, name), s = lstatSync(path, { bigint: true });
 assert.ok(s.isFile() && !s.isSymbolicLink()); assert.equal(s.dev, scratchStat.dev);
 assert.equal(s.uid, BigInt(process.getuid())); assert.equal(s.nlink, 1n);
 assert.equal(s.mode & 0o777n, 0o600n); assert.ok(s.size > 0n && s.size <= 131072n);
 const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW), b = Buffer.alloc(Number(s.size) + 1);
 let used = 0;
 try {
  assert.deepEqual(ids(fstatSync(fd, { bigint: true })), ids(s));
  while (used < b.length) { const n = readSync(fd, b, used, b.length - used, null); if (!n) break; used += n; }
  assert.deepEqual(ids(fstatSync(fd, { bigint: true })), ids(s));
 } finally { closeSync(fd); }
 assert.deepEqual(ids(lstatSync(path, { bigint: true })), ids(s)); assert.equal(used, Number(s.size));
 return { path: name, bytes: used, sha256: sha(b.subarray(0, used)), identity: ids(s) };
}
const WITNESS_FIELDS = ['pid','grantId','originals','serializedCheckpoint','checkpointPins','ownerEpoch','payerRowsSha256','backendRowsSha256','files'];
if (PHASE === 'recover') {
 assert.ok(W && typeof W === 'object' && !Array.isArray(W));
 assert.deepEqual(Object.keys(W), WITNESS_FIELDS);
 assert.ok(Number.isSafeInteger(W.pid) && W.pid > 0); assert.notEqual(process.pid, W.pid);
 assert.ok(typeof W.grantId === 'string' && W.grantId.length > 0 && W.grantId.length <= 128);
 assert.ok(Array.isArray(W.originals));assert.equal(W.originals.length,3);
 for(const item of W.originals){
  assert.deepEqual(Object.keys(item),['originalRequestJson','authorizationHeader']);
  assert.ok(typeof item.originalRequestJson==='string'&&Buffer.byteLength(item.originalRequestJson)<=4096);
  assert.ok(typeof item.authorizationHeader==='string'&&item.authorizationHeader.startsWith('ServiceCredit '));
  assert.ok(Buffer.byteLength(item.authorizationHeader)<=1024);
 }
 assert.ok(typeof W.serializedCheckpoint === 'string' && Buffer.byteLength(W.serializedCheckpoint) <= 32768);
 assert.ok(W.checkpointPins && typeof W.checkpointPins === 'object' && !Array.isArray(W.checkpointPins));
 assert.deepEqual(Object.keys(W.checkpointPins), ['binding','digests']);
 assert.equal(W.ownerEpoch, 2);
 for (const k of ['payerRowsSha256','backendRowsSha256']) assert.match(W[k], /^[0-9a-f]{64}$/);
 assert.equal(W.files.length, 2);
 for (let i = 0; i < FILES.length; i++) assert.deepEqual(filePin(FILES[i]), W.files[i]);
}
const sourceBefore = sources();


const { ServiceCreditSqliteStore: Backend } = await import('../src/service-credit-sqlite-store.js');
const {
 openServiceCreditCustodiedSqliteBackendSequentialRunnerV6: OPEN_RUNNER,
 openServiceCreditCustodiedSqliteBackendRecoveryClientV6: OPEN_READER,
} = await import('../src/service-credit-custodied-backend-recovery-client.js');
const { createZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6: CREATE_PAYER }
 = await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const { createDurableServiceCreditHttpSession: SESSION } = await import('../src/service-credit-durable-http-session.js');
const { deriveServiceCreditCapabilityCommitment: COMMIT, createServiceCreditCapabilitySigningBytes: SIGNING_BYTES }
 = await import('../src/service-credit-capability.js');
const { DatabaseSync } = await import('node:sqlite');
const { captureOriginalPaymentCheckpoint: CAPTURE, encodeOriginalPaymentCheckpoint: ENCODE,
 restoreOriginalPaymentCheckpoint: RESTORE } = await import('../src/service-credit-pilot-original-payment-checkpoint.js');
const OPTIONS = { timeout: 5000, concurrency: false };
const FUNDING = 'https://backend-v6-process.invalid/funding';
const SERVICE = 'https://backend-v6-process.invalid/service-credit/v1/execute';
const POLICY = Object.freeze({ policyVersion: 1, maxRequests: 8, serviceResourceUrl: SERVICE });
const HASH = 'a'.repeat(64), EMPTY = 'sha256:' + sha(Buffer.alloc(0));
const RP = 'SERVICE_CREDIT_CUSTODIED_BACKEND_RECOVERY_';
const HP = 'SERVICE_CREDIT_CUSTODIED_HTTP_CLIENT_';
const XP = 'SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_';
const CP = 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_';
const keyOf = r => ({ grantId: r.grantId, requestId: r.requestId });
const f = { backend: null, session: null, key: null, active: null, frames: [], grant: null, stage: 0,
 requests: [], inputs: [], headers: [], handlers: [], order: [], 
 queries: 0, queryChanges: 0, transportCalls: 0, endCalls: 0, unitCalls: 0,
 expectedUnknownCloses: 0, factoryRefusals: 0, proofs: 0, timerScheduled: 0, timerCancelled: 0,
 timerTokens: new Set(), bridgeFaults: 0, strictReplies: 0, responseLosses: 0, beforeNextConfirmed: 0, checkpointReads: 0 };
function freeze(x) {
  if (x !== null && typeof x === 'object') { for (const v of Object.values(x)) freeze(v); Object.freeze(x); }
  return x;
}
function frozen(x) {
  if (x !== null && typeof x === 'object') { assert.ok(Object.isFrozen(x)); for (const v of Object.values(x)) frozen(v); }
}
function canonical(x) {
  if (x === null || typeof x !== 'object') return JSON.stringify(x);
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
}
function request(id) {
  return { modelVersion: 1, grantId: f.grant.grantId, requestId: id, method: 'POST',
    routeId: 'service-credit.execute.v1', canonicalBodyDigest: EMPTY, selectedContentType: 'application/json', maxCostUnits: 1 };
}
function proof(r) {
  f.proofs++;
  const raw = { proofVersion: 1, grantId: r.grantId, requestId: r.requestId,
    publicKey: f.key.publicKey.export({ format: 'jwk' }).x, maxCostUnits: r.maxCostUnits,
    signature: sign(null, SIGNING_BYTES(r), f.key.privateKey).toString('base64url') };
  return 'ServiceCredit ' + Buffer.from(canonical(raw)).toString('base64url');
}
function pairInput() {
  const requirement = { scheme: 'exact', network: 'zenon:testnet', asset: 'synthetic-asset',
    amount: '1', payTo: 'synthetic-payee', maxTimeoutSeconds: 30,
    extra: { poc: true, settlement: 'account-block', paymentFlow: 'upfront', minimumMomentumConfirmations: 2,
      zenonChain: { version: 1, chainIdentifier: '42', genesisMomentumHash: '1'.repeat(64) } } };
  const required = { x402Version: 2, resource: { url: FUNDING }, accepts: [requirement] };
  const payload = { x402Version: 2, resource: { url: FUNDING }, accepted: requirement,
    payload: { transaction: { hash: HASH }, intentDigest: '2'.repeat(64) } };
  return freeze({ challenge: { status: 'PAYMENT_REQUIRED', resourceUrl: FUNDING,
    paymentRequiredHeader: Buffer.from(JSON.stringify(required)).toString('base64'), paymentRequired: required },
    paymentSignatureHeader: Buffer.from(JSON.stringify(payload)).toString('base64') });
}
// Only seed declares this synthetic payment. Recovery consumes the exact retained
// checkpoint and independent pins from the first process, never a reconstructed pair.
const PAIR = PHASE === 'seed' ? pairInput() : null;
const captured = PHASE === 'seed' ? CAPTURE({
 binding: { requestId: 'v6-original-funding', paymentHash: HASH,
  origin: new URL(FUNDING).origin, contextId: 'v6-original-context' },
 originalBytes: { requestBody: '', paymentPayload: PAIR.paymentSignatureHeader,
  paymentRequirements: PAIR.challenge.paymentRequiredHeader,
  context: Buffer.from(' { "original": true, "spacing": "retained" }\n').toString('base64') },
}) : null;
const SERIALIZED = PHASE === 'seed' ? ENCODE(captured.checkpoint) : W.serializedCheckpoint;
const INDEPENDENT_PINS = PHASE === 'seed' ? captured.pins : freeze(W.checkpointPins);
const CHECKPOINT = RESTORE(SERIALIZED, INDEPENDENT_PINS);
assert.equal(CHECKPOINT.binding.paymentHash, HASH);
assert.equal(CHECKPOINT.binding.origin, new URL(FUNDING).origin);
assert.equal(CHECKPOINT.originalBytes.requestBody, '');
function checkpointRead(c) {
 const checkpoint = c.readOriginalPaymentCheckpoint(INDEPENDENT_PINS);
 frozen(checkpoint); assert.deepEqual(checkpoint, CHECKPOINT);
 assert.equal(ENCODE(checkpoint), SERIALIZED); assert.equal(checkpoint.authorization, 'NONE');
 f.checkpointReads++;
 return checkpoint;
}
function configuration(extra = {}) {
  return { databasePath: join(scratch, 'payer-v6-process.sqlite'), allowedRoot: scratch, backendStore: f.backend,
    fundingResourceUrl: FUNDING, custodyPolicy: POLICY, selectedGrantId: f.grant.grantId,
    deadlineMs: 2000, ...extra };
}

function rootView(c) { const v = c.snapshot(); return Object.hasOwn(v, 'connection') ? v.connection.client : v.client; }
function ownerView(c) { return rootView(c).client.owner; }
function payerStamp() {
 assert.equal(f.active, null);
 const path = join(scratch, 'payer-v6-process.sqlite'), st = lstatSync(path, { bigint: true });
 assert.ok(st.isFile() && !st.isSymbolicLink()); assert.equal(st.uid, BigInt(process.getuid()));
 assert.equal(st.dev, scratchStat.dev); assert.equal(st.nlink, 1n); assert.equal(st.mode & 0o777n, 0o600n);
 const db = new DatabaseSync(path, { readOnly: true, allowExtension: false,
  enableDoubleQuotedStringLiterals: false, enableForeignKeyConstraints: true, timeout: 0 });
 try {
  return {
   epoch: db.prepare('SELECT owner_epoch FROM payer_recovery_meta WHERE singleton=1').get().owner_epoch,
   meta: db.prepare('SELECT singleton,resource_url FROM payer_recovery_meta ORDER BY singleton').all(),
   state: db.prepare('SELECT * FROM payer_recovery_state ORDER BY singleton').all(),
   checkpoint: db.prepare('SELECT singleton,envelope FROM original_payment_checkpoint ORDER BY singleton').all(),
   originals: db.prepare('SELECT * FROM original_service_requests ORDER BY grant_id,request_id').all(),
   intents: db.prepare('SELECT * FROM original_dispatch_intents ORDER BY grant_id,request_id').all(),
   observations: db.prepare('SELECT * FROM original_response_observations ORDER BY grant_id,request_id').all(),
   quarantines: db.prepare('SELECT * FROM original_custody_quarantines ORDER BY grant_id').all(),
   policy: db.prepare('SELECT * FROM original_request_custody_policy ORDER BY singleton').all(),
   schema: db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all(),
   userVersion: db.prepare('PRAGMA user_version').get().user_version,
   applicationId: db.prepare('PRAGMA application_id').get().application_id,
  };
 } finally { db.close(); }
}
function sameFunding(before, after, delta) {
 assert.equal(after.epoch, before.epoch + delta);
 for (const k of ['meta','state','checkpoint','policy','schema','userVersion','applicationId']) assert.deepEqual(after[k], before[k]);
 assert.equal(after.userVersion, 6); assert.equal(after.applicationId, 0x5a505252);
 const state = JSON.parse(after.state[0].envelope);
 assert.equal(state.paymentHeader, CHECKPOINT.originalBytes.paymentPayload);
 assert.equal(state.challengeHeader, CHECKPOINT.originalBytes.paymentRequirements);
 assert.equal(after.checkpoint.length, 1); assert.equal(after.checkpoint[0].singleton, 1);
 assert.equal(after.checkpoint[0].envelope, SERIALIZED);
 for (const h of f.headers) assert.equal(JSON.stringify(after).includes(h), false);
}
function sameRows(before, after, delta) {
 sameFunding(before, after, delta);
 for (const k of ['originals','intents','observations','quarantines']) assert.deepEqual(after[k], before[k]);
}
function retained(stamp) {
 assert.equal(stamp.originals.length,3);assert.equal(stamp.intents.length,3);
 assert.equal(stamp.observations.length,2);assert.equal(stamp.quarantines.length,1);
 for(const request of f.requests.slice(0,3)){
  const original=JSON.parse(stamp.originals.find(r=>r.request_id===request.requestId).envelope);
  const intent=JSON.parse(stamp.intents.find(r=>r.request_id===request.requestId).envelope);
  assert.equal(original.originalRequestJson,JSON.stringify(request));assert.equal(original.originalBodyBase64,'');
  assert.equal(original.paymentHash,HASH);assert.equal(intent.paymentHash,HASH);assert.equal(intent.fundingRevision,3);
 }
 assert.deepEqual(stamp.observations.map(r=>r.request_id),['v6-first','v6-second']);
 for(const row of stamp.observations){const response=JSON.parse(row.envelope);
  assert.equal(response.responseJson,'{"ok":true,"resultCode":"synthetic-service-result"}');
  assert.equal(response.authority,'NONE');assert.equal(response.deliveryConfirmed,false);
 }
 const q=JSON.parse(stamp.quarantines[0].envelope);
 assert.equal(q.grantId,f.grant.grantId);assert.equal(q.paymentHash,HASH);
 assert.equal(q.status,'CUSTODY_OUTCOME_UNKNOWN');assert.equal(q.authority,'NONE');assert.deepEqual(q.custodyPolicy,POLICY);
 for(const r of f.requests.slice(3)){
  assert.equal(stamp.originals.some(v=>v.request_id===r.requestId),false);
  assert.equal(stamp.intents.some(v=>v.request_id===r.requestId),false);assert.equal(f.backend.getRequest(keyOf(r)),null);
 }
 const ledger=JSON.stringify(f.backend.load());
 for(const h of f.headers){assert.equal(ledger.includes(h),false);assert.equal(JSON.stringify(stamp).includes(h),false);}
 const proof=JSON.parse(Buffer.from(f.headers[0].slice('ServiceCredit '.length),'base64url').toString('utf8'));
 assert.equal(ledger.includes(proof.publicKey),false);
 const grant=f.backend.getGrant(f.grant.grantId);
 assert.equal(grant.consumedUnits,3);assert.equal(grant.availableUnits,7);assert.equal(grant.heldUnits,0);
}
async function closeFrame(rec) {
 if (rec.started) { assert.equal(rec.done, true); return; }
 rec.started = true;
 const p = rec.c.close(); assert.equal(rec.c.close(), p);
 await assert.rejects(p, { code: XP + 'CHILD_OUTCOME_UNKNOWN' });
 f.expectedUnknownCloses++;
 const root = rootView(rec.c);
 assert.equal(root.resource.storeCloseAttempts, 1); assert.equal(root.resource.storeCloseOutcome, 'RETURNED');
 assert.equal(root.resource.phase, 'RELEASED'); assert.equal(root.resource.slotHeld, false);
 assert.equal(root.close.outcome, 'CHILD_UNKNOWN'); assert.equal(p, rec.c.close());
 assert.throws(() => rec.c.readOriginalBackendRecoveryState(keyOf(f.requests[0]), f.headers[0], INDEPENDENT_PINS), { code: RP + 'CLOSED' });
 if (rec.kind === 'runner') {
  assert.equal(rec.c.snapshot().runner.closeCalls, 1); assert.equal(rec.c.snapshot().runner.queuedReferences, 0);
  assert.equal(rec.c.snapshot().unknown, true); assert.equal(rec.c.snapshot().runner.storeOwnership, 'OWNED_EXISTING_V6_ORIGINAL_PAYMENT');
 }
 rec.done = true; f.active = null;
}
async function owned(kind, action) {
 assert.equal(f.active, null);
 const OPEN = kind === 'runner' ? OPEN_RUNNER : OPEN_READER;
 const c = await OPEN(configuration(kind === 'reader' ? {} : { requestImpl }));
 const rec = { c, kind, seen: 0, started: false, done: false }; f.frames.push(rec); f.active = rec; frozen(c);
 try { return await action(c); } finally { await closeFrame(rec); }
}
function backendRead(c,index) {
 const before = f.backend.load(), queries = f.queries, calls = f.transportCalls, units = f.unitCalls;
 const v = c.readOriginalBackendRecoveryState(keyOf(f.requests[index]), f.headers[index], INDEPENDENT_PINS); frozen(v);
 assert.equal(v.status, 'CLIENT_RECONCILIATION_REQUIRED'); assert.equal(v.backend.status, 'CACHED_SUCCESS');
 assert.equal(v.backend.cachedResult.resultCode, 'synthetic-service-result');
 assert.equal(v.local.funding.status, 'BOUND'); assert.equal(v.local.funding.revision, 3);
 assert.equal(v.local.funding.paymentHash, HASH); assert.equal(v.local.original.originalRequestJson, JSON.stringify(f.requests[index]));
 assert.equal(v.local.dispatchStatus, 'POSSIBLY_ATTEMPTED'); assert.equal(v.local.uncertainty.custody, true);
 assert.equal(v.local.responseStatus,index<2?'LOCAL_DECLARED_SUCCESS_RESPONSE_OBSERVED':'NOT_OBSERVED');
 if(index<2){assert.equal(v.local.responseObservation.resultCode,'synthetic-service-result');assert.equal(v.local.responseObservation.deliveryConfirmed,false);}
 else assert.equal(v.local.responseObservation,null);
 assert.equal(v.authority, 'NONE'); assert.equal(v.nextStep, 'RECONCILIATION_REQUIRED');
 for (const k of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed']) assert.equal(v[k], false);
 for (const k of ['executionAuthorized','paymentAuthorized','signingAuthorized']) assert.equal(v.backend[k], false);
 assert.equal(v.backend.deliveryStatus, 'NOT_ESTABLISHED'); assert.equal(v.serviceDelivery, 'NOT_ESTABLISHED');
 assert.equal(f.queries, queries + 1); assert.equal(f.transportCalls, calls); assert.equal(f.unitCalls, units);
 assert.deepEqual(f.backend.load(), before); assert.equal(f.queryChanges, 0);
 assert.equal(JSON.stringify(v).includes(f.headers[index]), false);
 return v;
}

function payerRows(stamp) {
 const { epoch, ...rest } = stamp;
 return rest;
}
const digestData = value => sha(Buffer.from(canonical(value)));
function backendStamp() {
 const path = join(scratch, 'backend-v6-process.sqlite'); filePin('backend-v6-process.sqlite');
 const db = new DatabaseSync(path, { readOnly: true, allowExtension: false,
  enableDoubleQuotedStringLiterals: false, enableForeignKeyConstraints: true, timeout: 0 });
 try {
  return {
   rows: db.prepare('SELECT * FROM service_credit_ledger ORDER BY singleton').all(),
   schema: db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all(),
   userVersion: db.prepare('PRAGMA user_version').get().user_version,
   applicationId: db.prepare('PRAGMA application_id').get().application_id,
  };
 } finally { db.close(); }
}
function backendOptions() {
 return { databasePath: join(scratch, 'backend-v6-process.sqlite'), allowedRoot: scratch,
  deriveCost() { return 1; }, now() { return 1000; }, busyTimeoutMs: 50, maxStateBytes: 65536,
  maxOffers: 2, maxGrants: 2, maxRequests: 8, testHooks: {
   beforeBegin({ operation }) { if (operation === 'getOriginalRequestExecutionSnapshot') f.queries++; },
   beforeCommit({ operation, changed }) {
    if (operation === 'getOriginalRequestExecutionSnapshot' && changed) f.queryChanges++;
   },
  } };
}
async function closeBackend() {
 await Promise.all(f.handlers);
 if (f.session !== null) {
  const p = f.session.close(); assert.equal(p, f.session.close()); assert.equal(await p, undefined);
  f.session = null;
 }
 assert.equal(f.active, null); assert.equal(f.timerTokens.size, 0);
 assert.notEqual(f.backend, null); f.backend.close(); f.backend = null;
}
function complete(t) {
 assert.equal(f.backend, null); assert.equal(f.session, null); assert.equal(f.active, null);
 assert.equal(f.checkpointReads, PHASE === 'seed' ? 1 : 2);
 assert.equal(f.timerTokens.size, 0); assert.equal(f.bridgeFaults, 0); assert.equal(f.queryChanges, 0);
 const stamp = payerStamp(), backend = backendStamp();
 const body = JSON.stringify(stamp) + JSON.stringify(backend);
 for (const h of f.headers) assert.equal(body.includes(h), false);
 let writes = 0, confirms = 0, responseWrites = 0, responseConfirms = 0;
 for (const r of f.frames) {
  assert.equal(r.done, true); writes += ownerView(r.c).counts.quarantineWrites;
  confirms += ownerView(r.c).counts.quarantineReadbackConfirmations;
  responseWrites+=ownerView(r.c).counts.responseWrites;responseConfirms+=ownerView(r.c).counts.responseReadbackConfirmations;
 }
 const witness = {
  pid: process.pid, grantId: f.grant.grantId,
  originals:f.requests.slice(0,3).map((r,i)=>({originalRequestJson:JSON.stringify(r),authorizationHeader:f.headers[i]})),
  serializedCheckpoint: SERIALIZED, checkpointPins: INDEPENDENT_PINS,
  ownerEpoch: stamp.epoch, payerRowsSha256: digestData(payerRows(stamp)),
  backendRowsSha256: digestData(backend), files: FILES.map(filePin),
 };
 if (PHASE === 'recover') {
  assert.equal(witness.grantId,W.grantId);assert.deepEqual(witness.originals,W.originals);
  assert.equal(witness.serializedCheckpoint,W.serializedCheckpoint);
  assert.deepEqual(witness.checkpointPins,W.checkpointPins);
  assert.equal(witness.files[0].sha256,W.files[0].sha256);
  assert.equal(witness.ownerEpoch, W.ownerEpoch + 1);
  assert.equal(witness.payerRowsSha256, W.payerRowsSha256);
  assert.equal(witness.backendRowsSha256, W.backendRowsSha256);
  for (let i = 0; i < FILES.length; i++) {
   assert.deepEqual(witness.files[i].identity.slice(0, 6), W.files[i].identity.slice(0, 6));
  }
 }
 f.key = null; // Drop fixture references only; no memory-erasure guarantee.
 assert.deepEqual(sources(), sourceBefore); f.stage = 1;
 t.diagnostic(JSON.stringify({
  kind: 'P2_BACKEND_V6_PROCESS_RECOVERY', version: 1, phase: PHASE, pid: process.pid,
  previousPid: W?.pid ?? null, witness,
  originalCheckpointSame: true, checkpointSha256: sha(Buffer.from(SERIALIZED)),
  checkpointPinsSha256: digestData(INDEPENDENT_PINS), explicitCheckpointReads: f.checkpointReads,
  ownedOpens: f.frames.length, returnedStoreCloses: f.frames.length,
  expectedUnknownCloses: f.expectedUnknownCloses,
  declaredHttpRequests: f.transportCalls, bodylessEndCalls: f.endCalls, syntheticBackendCallbacks: f.unitCalls,
  backendOriginalQueries: f.queries, backendOriginalQueryChanges: f.queryChanges,
  quarantineWrites: writes, quarantineReadbackConfirmations: confirms,
  responseWrites,responseReadbackConfirmations:responseConfirms,strictReplies:f.strictReplies,responseLosses:f.responseLosses,beforeNextResponseConfirmations:f.beforeNextConfirmed,
  syntheticCapabilityKeyPairs: PHASE === 'seed' ? 1 : 0, syntheticCapabilityProofs: f.proofs,
  deadlineScheduled: f.timerScheduled, deadlineCancelled: f.timerCancelled, deadlineTokens: f.timerTokens.size,
  nativeSqliteFiles: 2, preOpenFullBytesAndIdentityMatched: PHASE === 'recover',
  originalPublicProofReusedNotRegenerated: PHASE === 'recover',
  authority: 'NONE', serviceDelivery: 'NOT_ESTABLISHED', realPaymentSigner: 'DISABLED', networkCalls: 0,
 }));
}
function emitter(request) {
  const listeners = new Map(); let closed = false, ended = false, endAction = null;
  const raw = {
    on(name, fn) {
      assert.equal(typeof name, 'string'); assert.equal(typeof fn, 'function');
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn); return raw;
    },
    destroy() { if (!closed) { closed = true; emit('close'); } },
    ...(request ? { end(...args) {
      assert.equal(args.length, 0); assert.equal(ended, false); ended = true; f.endCalls++;
      assert.equal(typeof endAction, 'function'); endAction();
    } } : {}),
  };
  function emit(name, ...args) { for (const fn of listeners.get(name) ?? []) fn(...args); }
  return { raw, emit, setEnd(fn) { endAction = fn; }, close() { raw.destroy(); } };
}
function requestImpl(url, options, onResponse) {
  f.transportCalls++;
  assert.equal(url, SERVICE);
  assert.equal(options.method, 'POST'); assert.equal(options.agent, false); assert.equal(options.rejectUnauthorized, true);
  assert.equal(options.maxHeaderSize, 16384); assert.equal(options.insecureHTTPParser, false);
  assert.deepEqual(Object.keys(options.headers), ['Authorization']);
  assert.ok(f.headers.includes(options.headers.Authorization));
  const counts = ownerView(f.active.c).counts, expected = ++f.active.seen;
  assert.equal(counts.retainCalls, expected); assert.equal(counts.readbackConfirmations, expected);
  assert.equal(counts.intentWrites, expected); assert.equal(counts.intentReadbackConfirmations, expected);
  assert.equal(counts.dispatchCalls, expected);
  assert.equal(counts.responseWrites,expected-1);assert.equal(counts.responseReadbackConfirmations,expected-1);
  if(expected>1)f.beforeNextConfirmed++;
  f.order.push(f.headers.indexOf(options.headers.Authorization));
  const req = emitter(true), mode = f.headers.indexOf(options.headers.Authorization)===2?'DROP_AFTER_COMMIT':'SUCCESS', headers = new Map();
  const serverResponse = {
    destroyed: false, writableEnded: false, statusCode: 0,
    setHeader(name, value) { headers.set(name, String(value)); },
    end(bytes) {
      assert.equal(serverResponse.writableEnded, false); serverResponse.writableEnded = true;
      assert.equal(serverResponse.statusCode, 200); assert.ok(Buffer.isBuffer(bytes)); assert.ok(bytes.length <= 512);
      if (mode === 'DROP_AFTER_COMMIT') { f.responseLosses++; req.emit('error', Error('synthetic response loss')); return; }
      const res = emitter(false);
      res.raw.statusCode = serverResponse.statusCode;
      res.raw.rawHeaders = [...headers.entries()].flatMap(([name, value]) => [name, value]);
      res.raw.complete = false; onResponse(res.raw); res.emit('data', bytes);
      res.raw.complete = true; res.emit('end'); f.strictReplies++; res.close(); req.close();
    },
    destroy() { serverResponse.destroyed = true; req.emit('error', Error('synthetic server response failure')); },
  };
  req.setEnd(() => {
    const incoming = { url: '/service-credit/v1/execute', method: 'POST',
      rawHeaders: ['Authorization', options.headers.Authorization] };
    const handled = f.session.handle(incoming, serverResponse);
    f.handlers.push(handled);
    f.handlers.push(handled.then(() => { assert.equal(serverResponse.writableEnded, true); },
      () => { f.bridgeFaults++; req.emit('error', Error('synthetic handler failure')); }));
  });
  return req.raw;
}

function seedFixture() {
  f.key = generateKeyPairSync('ed25519');
  const digest = n => 'sha256:' + String(n).repeat(64);
  f.backend = Backend.create({ databasePath: join(scratch, 'backend-v6-process.sqlite'), allowedRoot: scratch,
    deriveCost() { return 1; }, now() { return 1000; }, busyTimeoutMs: 50, maxStateBytes: 65536,
    maxOffers: 2, maxGrants: 2, maxRequests: 8, testHooks: {
      beforeBegin({ operation }) { if (operation === 'getOriginalRequestExecutionSnapshot') f.queries++; },
      beforeCommit({ operation, changed }) {
        if (operation === 'getOriginalRequestExecutionSnapshot' && changed) f.queryChanges++;
      },
    } });
  const offer = { modelVersion: 1, providerId: 'synthetic-provider', serviceId: 'synthetic-service',
    resourceId: 'synthetic-resource', resourceBinding: digest(1), offerId: 'backend-v6-process-offer', offerVersion: 1,
    costPolicyId: 'synthetic-unit', fundingPolicyId: 'synthetic-funding', fundingPolicyVersion: 1 };
  f.backend.registerOffer(offer);
  // Privileged controlled seeding, NOT verified funding or an authenticated live activation.
  f.grant = f.backend.activateGrantFromTrustedRecord({
    activationVersion: 2, evidenceVersion: 1, inclusionAuthorizationDigest: digest(7),
    authorityProfileId: 'synthetic-authority', authorityProfileVersion: 1, verifierVersion: 1,
    authorityRecordDigest: digest(2), fundingPolicyId: offer.fundingPolicyId, fundingPolicyVersion: 1,
    sourceSettlementId: 'synthetic-dispatch-settlement', transactionId: 'zenontx:' + HASH,
    providerId: offer.providerId, serviceId: offer.serviceId, resourceId: offer.resourceId,
    resourceBinding: offer.resourceBinding, offerId: offer.offerId, offerVersion: 1,
    holderId: 'synthetic-holder', capabilityCommitment: COMMIT({ publicKey: f.key.publicKey.export({ format: 'jwk' }).x }),
    totalUnits: 10, expiresAt: 100000, scheme: 'exact', paymentFlow: 'upfront', network: 'zenon:testnet',
    chainProfile: { version: 1, chainIdentifier: '42', genesisMomentumHash: '1'.repeat(64) },
    asset: 'synthetic-asset', amount: '1', payee: 'synthetic-payee', payer: 'synthetic-holder',
    paymentResourceDigest: digest(3), paymentRequirementDigest: digest(4), paymentIntentDigest: digest(5),
    grantFundingCommitment: digest(6), evidenceState: 'MOMENTUM_INCLUDED',
    confirmationPolicy: { policyId: 'zenon.authenticated-momentum-inclusion', policyVersion: 1, minimumConfirmations: 2 },
  });
  f.backend.initializeDurableExecution({ expectedRevision: f.backend.load().revision, ledgerId: 'synthetic-dispatch-ledger',
    policy: { policyId: 'synthetic-deadline', policyVersion: 1, maxDurationMs: 1000 }, capacity: 8 });
  f.requests = ['v6-first','v6-second','v6-lost','v6-tail'].map(request);
  f.headers = f.requests.map(proof);
  f.inputs = f.requests.map((r, i) => freeze({ grantId: r.grantId, requestId: r.requestId,
    originalRequestJson: JSON.stringify(r), originalBodyBase64: '', serviceResourceUrl: SERVICE,
    authorizationHeader: f.headers[i] }));
  const payer = CREATE_PAYER({ databasePath: join(scratch, 'payer-v6-process.sqlite'), allowedRoot: scratch,
    resourceUrl: FUNDING, custodyPolicy: POLICY });
  try { payer.prepareWithOriginalPaymentCheckpoint({
   pair: PAIR, serializedCheckpoint: SERIALIZED, expectedPins: INDEPENDENT_PINS }); payer.fenceAttempt('PREPARED'); assert.equal(payer.finishAttempt('BOUND').revision, 3); }
  finally { payer.close(); }
  f.session = SESSION({ store: f.backend, admittedGrantId: f.grant.grantId, selectedDurationMs: 1000,
    execute() {
      f.unitCalls++;
      return { resultCode: 'synthetic-service-result' };
    },
    deadlineRuntime: {
      monotonicNowNs() { return 0n; },
      schedule(callback, delayMs) {
        assert.equal(typeof callback, 'function'); assert.ok(Number.isSafeInteger(delayMs) && delayMs > 0);
        const token = {}; f.timerTokens.add(token); f.timerScheduled++; return token;
      },
      cancel(token) { assert.equal(f.timerTokens.delete(token), true); f.timerCancelled++; },
    } });
}

after(async () => {
 try {
  await Promise.all(f.handlers);
  for (const r of f.frames) if (!r.started) await closeFrame(r);
  if (f.backend !== null) await closeBackend();
 } finally {
  f.key = null; f.headers = null; f.inputs = null;
 }
 assert.deepEqual(sources(), sourceBefore); assert.equal(f.stage, 1);
});


if(PHASE==='seed')test('seed V6 process closes original-payment custody with observed and unknown response DATA',OPTIONS,async t=>{
 seedFixture();const before=payerStamp();
 await owned('runner',async c=>{
  assert.equal(Object.hasOwn(c,'submitOriginal'),false);
  assert.equal(c.snapshot().runner.storeOwnership,'OWNED_EXISTING_V6_ORIGINAL_PAYMENT');
  checkpointRead(c);
  const batch=[f.inputs[0],f.inputs[1],f.inputs[2],f.inputs[3]],p=c.runOriginals(batch);assert.equal(c.runOriginals(batch),p);
  await assert.rejects(p,{code:CP+'RUN_FAILED'});await Promise.all(f.handlers);
  const v=c.snapshot();assert.equal(v.runner.failure,'ENTRY_REJECTED');assert.equal(v.runner.attempted,3);
  assert.equal(v.runner.completed,2);assert.equal(v.runner.notAttempted,1);assert.equal(v.runner.queuedReferences,0);
  assert.equal(v.unknown,true);assert.equal(v.connection.unavailable,false);
  assert.equal(ownerView(c).counts.responseWrites,2);assert.equal(ownerView(c).counts.responseReadbackConfirmations,2);
  assert.equal(ownerView(c).counts.quarantineWrites,1);assert.equal(ownerView(c).counts.quarantineReadbackConfirmations,1);
 });
 const stamp=payerStamp();sameFunding(before,stamp,1);retained(stamp);assert.equal(stamp.epoch,2);
 assert.equal(f.backend.getDurableExecutionSnapshot().executionState.executions.length,3);
 assert.deepEqual(f.order,[0,1,2]);assert.equal(f.transportCalls,3);assert.equal(f.unitCalls,3);
 assert.equal(f.queries,0);assert.equal(f.proofs,4);assert.equal(f.timerScheduled,3);assert.equal(f.timerCancelled,3);
 assert.equal(f.strictReplies,2);assert.equal(f.responseLosses,1);assert.equal(f.beforeNextConfirmed,2);
 await closeBackend();complete(t);
});

if(PHASE==='recover')test('fresh V6 process reuses original-payment checkpoint and public proofs without dispatch or signing',OPTIONS,async t=>{
 f.grant={grantId:W.grantId};f.requests=W.originals.map(r=>JSON.parse(r.originalRequestJson));
 f.headers=W.originals.map(r=>r.authorizationHeader);
 for(let i=0;i<3;i++){assert.equal(JSON.stringify(f.requests[i]),W.originals[i].originalRequestJson);assert.equal(f.requests[i].grantId,W.grantId);}
 assert.deepEqual(f.requests.map(r=>r.requestId),['v6-first','v6-second','v6-lost']);
 const beforePayer=payerStamp(),beforeBackend=backendStamp();
 assert.equal(beforePayer.epoch,W.ownerEpoch);assert.equal(digestData(payerRows(beforePayer)),W.payerRowsSha256);
 assert.equal(digestData(beforeBackend),W.backendRowsSha256);
 f.backend=Backend.openExisting(backendOptions());
 for(const r of f.requests){const actual=f.backend.getRequest(keyOf(r));assert.equal(actual.state,'SUCCEEDED');
  assert.equal(actual.cachedResult.resultCode,'synthetic-service-result');}
 assert.equal(f.backend.getDurableExecutionSnapshot().executionState.executions.length,3);retained(beforePayer);
 await owned('reader',async c=>{
  assert.deepEqual(Object.keys(c),['readOriginal','readOriginalRecoveryState','readOriginalRecoveryKeys','readOriginalBackendRecoveryState','readOriginalPaymentCheckpoint','snapshot','close']);
  for(const k of ['submitOriginal','runOriginals','requestImpl','sign','pay','store','backendStore'])assert.equal(Object.hasOwn(c,k),false);
  assert.equal(rootView(c).client.lastTransport,null);assert.equal(ownerView(c).custodyQuarantine.status,'PERSISTED_UNKNOWN');
  assert.equal(ownerView(c).custodyQuarantine.writeAttempted,false);assert.equal(ownerView(c).uncertainty.custody,true);
  assert.equal(ownerView(c).uncertainty.submission,false);
  checkpointRead(c);
  for(let i=0;i<3;i++){const v=backendRead(c,i);assert.equal(v.local.original.originalRequestJson,W.originals[i].originalRequestJson);}
  checkpointRead(c);
  const keys=c.readOriginalRecoveryKeys();frozen(keys);
  assert.deepEqual(keys.keys.map(r=>r.requestId),['v6-first','v6-lost','v6-second']);
  for(const k of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed'])assert.equal(keys[k],false);
  assert.equal(ownerView(c).counts.quarantineWrites,0);assert.equal(ownerView(c).counts.quarantineReadbackConfirmations,0);
  assert.equal(ownerView(c).counts.responseWrites,0);assert.equal(ownerView(c).counts.responseReadbackConfirmations,0);
 });
 sameRows(beforePayer,payerStamp(),1);assert.deepEqual(backendStamp(),beforeBackend);retained(payerStamp());
 assert.equal(f.transportCalls,0);assert.equal(f.endCalls,0);assert.equal(f.unitCalls,0);assert.equal(f.queries,3);
 assert.equal(f.proofs,0);assert.equal(f.key,null);assert.equal(f.session,null);
 assert.equal(f.timerScheduled,0);assert.equal(f.timerCancelled,0);
 await closeBackend();complete(t);
});

