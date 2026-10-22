// Two selected V6 original-payment-bound diagnostic consumer cases on TWO new private synthetic SQLite files.
// One actual payer owner supplies backend reads and all existing diagnostic factories.
// Synthetic Ed25519 capability proofs stay in memory; no SDK, socket, payment signer,
// crash, fresh process, default cutover, authenticated delivery or pilot acceptance.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { lstatSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ENTRY = "qualification/service-credit-custodied-backend-original-payment-consumer-v6.behavior.draft.mjs";
const SELF = fileURLToPath(import.meta.url), REPO = resolve(dirname(SELF), '..');
const SPECS = [
  [
    "src/service-credit-custodied-backend-recovery-client.js",
    33016,
    668,
    "6c5e5d07a4ac96a72a2494a8e6efdec0a057e967ce887816f68eb53048b3c885"
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
    7754,
    180,
    "e3ac726602edd3d06137212a566772b5f66fde5d4b4b71c14b2b28d76b1f28fe"
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
    24572,
    560,
    "3448e5ee1c8408d47aa6ecdce9c7e133ee6515ba9ca929476ab5f433fb8f847d"
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
assert.equal(process.env.P2_BACKEND_CONSUMER_V6_OPT_IN, 'synthetic-native-backend-recovery-consumer-v6-only');
const PINS = JSON.parse(process.env.P2_BACKEND_CONSUMER_V6_PINS), scratch = process.env.SPV_TASK_SCRATCH;
assert.equal(typeof scratch, 'string'); assert.equal(resolve(scratch), scratch);
const scratchStat = lstatSync(scratch, { bigint: true });
assert.ok(scratchStat.isDirectory() && !scratchStat.isSymbolicLink());
assert.equal(scratchStat.uid, BigInt(process.getuid())); assert.equal(scratchStat.mode & 0o777n, 0o700n);
const FILES = ['backend-consumer-v6.sqlite', 'payer-consumer-v6.sqlite'];
for (const name of FILES) assert.throws(() => lstatSync(join(scratch, name)), { code: 'ENOENT' });
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
const sourceBefore = sources();


const { ServiceCreditSqliteStore: Backend } = await import('../src/service-credit-sqlite-store.js');
const {
 openServiceCreditCustodiedSqliteBackendRecoveryConsumerV6: OPEN_READER,
 openServiceCreditCustodiedSqliteBackendClientV6: OPEN_CLIENT,
} = await import('../src/service-credit-custodied-backend-recovery-client.js');
const { createZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6: CREATE_PAYER }
 = await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const { createDurableServiceCreditHttpSession: SESSION } = await import('../src/service-credit-durable-http-session.js');
const { deriveServiceCreditCapabilityCommitment: COMMIT, createServiceCreditCapabilitySigningBytes: SIGNING_BYTES }
 = await import('../src/service-credit-capability.js');
const { DatabaseSync } = await import('node:sqlite');
const { captureOriginalPaymentCheckpoint: CAPTURE, encodeOriginalPaymentCheckpoint: ENCODE }
 = await import('../src/service-credit-pilot-original-payment-checkpoint.js');
const OPTIONS = { timeout: 5000, concurrency: false };
const FUNDING = 'https://backend-consumer-v6.invalid/funding';
const SERVICE = 'https://backend-consumer-v6.invalid/service-credit/v1/execute';
const POLICY = Object.freeze({ policyVersion: 1, maxRequests: 8, serviceResourceUrl: SERVICE });
const HASH = 'a'.repeat(64), EMPTY = 'sha256:' + sha(Buffer.alloc(0));
const RP = 'SERVICE_CREDIT_CUSTODIED_BACKEND_RECOVERY_';
const HP = 'SERVICE_CREDIT_CUSTODIED_HTTP_CLIENT_';
const XP = 'SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_';
const OP = 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const keyOf = r => ({ grantId: r.grantId, requestId: r.requestId });
const f = { backend:null, session:null, key:null, active:null, frames:[], grant:null, stage:1,
 requests:[], inputs:[], headers:[], handlers:[], order:[], mode:'SUCCESS',
 queries:0, queryChanges:0, transportCalls:0, endCalls:0, unitCalls:0,
 expectedUnknownCloses:0, normalCloses:0, factoryRefusals:0, proofs:0,
 timerScheduled:0, timerCancelled:0, timerTokens:new Set(), bridgeFaults:0,
 strictReplies:0, beforeNextConfirmed:0, responseLosses:0, plans:[], collections:[],
 seedStamp:null, ledger:null, liveReadRefusals:0, declaredUpdates:0, backendReads:0, checkpointReads:0, checkpointClosedRefusals:0, checkpointPinRefusals:0 };
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
const PAIR = pairInput();
const captured = CAPTURE({
 binding: { requestId: 'consumer-v6-original-funding', paymentHash: HASH,
  origin: new URL(FUNDING).origin, contextId: 'consumer-v6-original-context' },
 originalBytes: { requestBody: '', paymentPayload: PAIR.paymentSignatureHeader,
  paymentRequirements: PAIR.challenge.paymentRequiredHeader,
  context: Buffer.from(' { "consumer": true, "spacing": "retained" }\n').toString('base64') },
});
const CHECKPOINT = captured.checkpoint, INDEPENDENT_PINS = captured.pins;
const SERIALIZED = ENCODE(CHECKPOINT);
function checkpointRead(c) {
 const value = c.readOriginalPaymentCheckpoint(INDEPENDENT_PINS); frozen(value);
 assert.deepEqual(value, CHECKPOINT); assert.equal(ENCODE(value), SERIALIZED);
 assert.equal(value.authorization, 'NONE'); f.checkpointReads++;
 return value;
}
function noCheckpointLeak(value) {
 const text = JSON.stringify(value);
 for (const raw of [SERIALIZED, CHECKPOINT.originalBytes.paymentPayload,
  CHECKPOINT.originalBytes.paymentRequirements, CHECKPOINT.originalBytes.context])
  assert.equal(text.includes(raw), false);
}
function configuration(extra = {}) {
  return { databasePath: join(scratch, 'payer-consumer-v6.sqlite'), allowedRoot: scratch, backendStore: f.backend,
    fundingResourceUrl: FUNDING, custodyPolicy: POLICY, selectedGrantId: f.grant.grantId,
    deadlineMs: 2000, ...extra };
}


function rootView(c) { return c.snapshot().client; }
function ownerView(c) { return rootView(c).client.owner; } // Fixture seed client ONLY.
function powerless(v) {
 frozen(v);
 for (const k of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed']) assert.equal(v[k],false);
 if (Object.hasOwn(v,'authority')) assert.equal(v.authority,'NONE');
 if (Object.hasOwn(v,'authorization')) assert.equal(v.authorization,'NONE');
}
function observe(index, fundingStatus='UNKNOWN', serviceStatus='OUTCOME_UNKNOWN') {
 return JSON.stringify({viewVersion:1,paymentHash:HASH,requestId:f.requests[index].requestId,fundingStatus,serviceStatus});
}
function catalogJson() {
 return JSON.stringify(f.requests.slice(0,2).map((r,i)=>({...keyOf(r),observationJson:observe(i)})));
}
async function openFrame(kind) {
 assert.equal(f.active,null);
 const c=await (kind==='consumer'?OPEN_READER:OPEN_CLIENT)(configuration(kind==='consumer'?{}:{requestImpl}));
 const rec={c,kind,unknown:true,seen:0,started:false,done:false};
 f.frames.push(rec);f.active=rec;frozen(c);return rec;
}
async function closeFrame(rec) {
 if(rec.started){assert.equal(rec.done,true);return;}
 rec.started=true;
 const p=rec.c.close();assert.equal(p,rec.c.close());
 await assert.rejects(p,{code:XP+'CHILD_OUTCOME_UNKNOWN'});f.expectedUnknownCloses++;
 const root=rootView(rec.c);
 assert.equal(root.resource.storeCloseAttempts,1);assert.equal(root.resource.storeCloseOutcome,'RETURNED');
 assert.equal(root.resource.phase,'RELEASED');assert.equal(root.resource.slotHeld,false);
 assert.equal(root.close.outcome,'CHILD_UNKNOWN');assert.equal(p,rec.c.close());
 rec.done=true;f.active=null;
}
function localState(v,index) {
 frozen(v);assert.equal(v.funding.status,'BOUND');assert.equal(v.funding.revision,3);
 assert.equal(v.funding.paymentHash,HASH);assert.equal(v.uncertainty.custody,true);
 assert.equal(v.dispatchStatus,'POSSIBLY_ATTEMPTED');assert.notEqual(v.dispatchIntent,null);
 assert.equal(v.original.originalRequestJson,JSON.stringify(f.requests[index]));
 assert.equal(v.responseStatus,index===0?'LOCAL_DECLARED_SUCCESS_RESPONSE_OBSERVED':'NOT_OBSERVED');
 if(index===0){assert.equal(v.responseObservation.resultCode,'synthetic-service-result');powerless(v.responseObservation);}
 else assert.equal(v.responseObservation,null);
 assert.equal(v.authority,'NONE');assert.equal(v.serviceOutcome,'NOT_ESTABLISHED');
 assert.equal(v.qualification,'UNQUALIFIED');
 // Existing local state has NO action flags; absence is not a false-flag DTO.
 for(const k of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed'])
  assert.equal(Object.hasOwn(v,k),false);
}
function statePlan(v,index) {
 powerless(v);localState(v.recoveryState,index);powerless(v.declaredPlan);
 assert.equal(v.nextStep,'RECONCILIATION_REQUIRED');assert.equal(v.closed,false);
 assert.equal(v.currentFundingUncertain,false);assert.equal(v.observedFundingUncertain,false);
 assert.equal(v.declaredPlan.fundingUncertain,true);assert.equal(v.declaredPlan.serviceUncertain,true);
}
function collection(v) {
 powerless(v);assert.equal(v.nextStep,'RECONCILIATION_REQUIRED');
 assert.equal(v.closed,false);assert.equal(v.unavailable,false);assert.equal(v.entries.length,2);
 assert.deepEqual(v.keys,f.requests.slice(0,2).map(keyOf));
 for(let i=0;i<2;i++)statePlan(v.entries[i].recoveryPlan,i);
}
function backendRead(c,index) {
 const ledger=f.backend.load(),queries=f.queries,transport=f.transportCalls,units=f.unitCalls;
 const v=c.readOriginalBackendRecoveryState(keyOf(f.requests[index]),f.headers[index],INDEPENDENT_PINS);
 powerless(v);localState(v.local,index);assert.equal(v.status,'CLIENT_RECONCILIATION_REQUIRED');
 assert.equal(v.backend.status,'CACHED_SUCCESS');assert.equal(v.backend.cachedResult.resultCode,'synthetic-service-result');
 assert.equal(v.backend.deliveryStatus,'NOT_ESTABLISHED');assert.equal(v.serviceDelivery,'NOT_ESTABLISHED');
 for(const k of ['executionAuthorized','paymentAuthorized','signingAuthorized'])assert.equal(v.backend[k],false);
 assert.equal(f.queries,queries+1);assert.equal(f.transportCalls,transport);assert.equal(f.unitCalls,units);
 assert.equal(f.queryChanges,0);assert.deepEqual(f.backend.load(),ledger);
 for(const h of f.headers)assert.equal(JSON.stringify(v).includes(h),false);
 f.backendReads++;return v;
}
function payerStamp() {
 assert.equal(f.active, null);
 const path = join(scratch, 'payer-consumer-v6.sqlite'), st = lstatSync(path, { bigint: true });
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
 assert.equal(state.paymentHeader, PAIR.paymentSignatureHeader); assert.equal(state.challengeHeader, PAIR.challenge.paymentRequiredHeader);
 assert.equal(after.checkpoint.length,1);assert.equal(after.checkpoint[0].singleton,1);
 assert.equal(after.checkpoint[0].envelope,SERIALIZED);
 for (const h of f.headers) assert.equal(JSON.stringify(after).includes(h), false);
}
function sameRows(before, after, delta) {
 sameFunding(before, after, delta);
 for (const k of ['originals','intents','observations','quarantines']) assert.deepEqual(after[k], before[k]);
}
function retained(stamp, ids, observedIds, quarantined) {
 assert.equal(stamp.originals.length, ids.length); assert.equal(stamp.intents.length, ids.length);
 assert.equal(stamp.observations.length, observedIds.length); assert.equal(stamp.quarantines.length, quarantined ? 1 : 0);
 for (const id of ids) {
  const request = f.requests.find(r => r.requestId === id);
  const original = JSON.parse(stamp.originals.find(r => r.request_id === id).envelope);
  const intent = JSON.parse(stamp.intents.find(r => r.request_id === id).envelope);
  assert.equal(original.originalRequestJson, JSON.stringify(request)); assert.equal(original.originalBodyBase64, '');
  assert.equal(original.paymentHash, HASH); assert.equal(intent.paymentHash, HASH); assert.equal(intent.fundingRevision, 3);
 }
 for (const row of stamp.observations) {
  assert.ok(observedIds.includes(row.request_id)); const record = JSON.parse(row.envelope);
  const expected='synthetic-service-result';
  assert.equal(record.responseJson,JSON.stringify({ok:true,resultCode:expected}));
  assert.equal(record.resultCode,expected);assert.equal(record.authority,'NONE');
  assert.equal(record.deliveryConfirmed, false);
 }
 if (quarantined) {
  const q = JSON.parse(stamp.quarantines[0].envelope);
  assert.equal(q.grantId, f.grant.grantId); assert.equal(q.paymentHash, HASH);
  assert.equal(q.status, 'CUSTODY_OUTCOME_UNKNOWN'); assert.equal(q.authority, 'NONE');
 }
 for (const r of f.requests.filter(r => !ids.includes(r.requestId))) {
  assert.equal(stamp.originals.some(v => v.request_id === r.requestId), false);
  assert.equal(stamp.intents.some(v => v.request_id === r.requestId), false); assert.equal(f.backend.getRequest(keyOf(r)), null);
 }
 const ledger = JSON.stringify(f.backend.load());
 for (const h of f.headers) { assert.equal(JSON.stringify(stamp).includes(h), false); assert.equal(ledger.includes(h), false); }
 assert.equal(ledger.includes(f.key.publicKey.export({ format: 'jwk' }).x), false);
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
  if (f.mode === 'SUCCESS') {
    assert.equal(counts.responseWrites, expected - 1); assert.equal(counts.responseReadbackConfirmations, expected - 1);
    if (expected === 2) f.beforeNextConfirmed++;
  }
  f.order.push(f.headers.indexOf(options.headers.Authorization));
  const req = emitter(true), mode = f.mode, headers = new Map();
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
before(() => {
  f.key = generateKeyPairSync('ed25519');
  const digest = n => 'sha256:' + String(n).repeat(64);
  f.backend = Backend.create({ databasePath: join(scratch, 'backend-consumer-v6.sqlite'), allowedRoot: scratch,
    deriveCost() { return 1; }, now() { return 1000; }, busyTimeoutMs: 50, maxStateBytes: 65536,
    maxOffers: 2, maxGrants: 2, maxRequests: 8, testHooks: {
      beforeBegin({operation}){if(operation==='getOriginalRequestExecutionSnapshot'){f.queries++;}},
      beforeCommit({ operation, changed }) {
        if (operation === 'getOriginalRequestExecutionSnapshot' && changed) f.queryChanges++;
      },
    } });
  const offer = { modelVersion: 1, providerId: 'synthetic-provider', serviceId: 'synthetic-service',
    resourceId: 'synthetic-resource', resourceBinding: digest(1), offerId: 'backend-v6-offer', offerVersion: 1,
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
  f.requests = ['consumer-first','consumer-lost','consumer-tail'].map(request);
  f.headers = f.requests.map(proof);
  f.inputs = f.requests.map((r, i) => freeze({ grantId: r.grantId, requestId: r.requestId,
    originalRequestJson: JSON.stringify(r), originalBodyBase64: '', serviceResourceUrl: SERVICE,
    authorizationHeader: f.headers[i] }));
  const payer = CREATE_PAYER({ databasePath: join(scratch, 'payer-consumer-v6.sqlite'), allowedRoot: scratch,
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
});


test('V6 recovery consumer couples original-payment custody to existing plans and actual backend DATA',OPTIONS,async()=>{
 assert.equal(f.stage,1);
 // Privileged synthetic fixture setup: one observed success, one committed reply
 // lost before observation, and one unattempted tail. This is NOT live funding.
 const seed=await openFrame('seed');
 try{
  assert.equal(await seed.c.submitOriginal(f.inputs[0]),undefined);await Promise.all(f.handlers);
  f.mode='DROP_AFTER_COMMIT';
  await assert.rejects(seed.c.submitOriginal(f.inputs[1]),{code:OP+'SUBMISSION_OUTCOME_UNKNOWN'});
  await Promise.all(f.handlers);
  assert.equal(ownerView(seed.c).counts.responseWrites,1);
  assert.equal(ownerView(seed.c).counts.quarantineWrites,1);
 }finally{await closeFrame(seed);}
 f.seedStamp=payerStamp();retained(f.seedStamp,['consumer-first','consumer-lost'],['consumer-first'],true);
 const grant=f.backend.getGrant(f.grant.grantId);
 assert.equal(grant.consumedUnits,2);assert.equal(grant.availableUnits,8);assert.equal(grant.heldUnits,0);
 assert.equal(f.backend.getDurableExecutionSnapshot().executionState.executions.length,2);
 assert.equal(f.backend.getRequest(keyOf(f.requests[2])),null);
 f.ledger=f.backend.load();const rec=await openFrame('consumer'),c=rec.c;
 assert.deepEqual(Object.keys(c),['readOriginal','readOriginalRecoveryState','readOriginalRecoveryKeys',
  'readOriginalBackendRecoveryState','readOriginalPaymentCheckpoint','createOriginalRecoveryPlan','createOriginalRecoveryStatePlan',
  'createOriginalRecoveryCollection','createOriginalRecoveryObservationCollection','snapshot','close']);
 for(const name of ['submitOriginal','runOriginals','requestImpl','root','store','backendStore','sign','pay'])
  assert.equal(Object.hasOwn(c,name),false);
 assert.equal(rootView(c).resource.slotHeld,true);assert.equal(rootView(c).resource.storeCloseAttempts,0);
 await assert.rejects(OPEN_READER(configuration()),{code:XP+'RESOURCE_BUSY'});f.factoryRefusals++;
 assert.equal(rootView(c).resource.slotHeld,true);assert.equal(rootView(c).resource.storeCloseAttempts,0);
 const initialQueries=f.queries,initialLedger=f.backend.load();
 assert.throws(()=>c.readOriginalPaymentCheckpoint(),{code:RP+'INVALID_INPUT'});
 assert.throws(()=>c.readOriginalBackendRecoveryState(keyOf(f.requests[0]),f.headers[0]),{code:RP+'INVALID_INPUT'});
 f.checkpointPinRefusals+=2;assert.equal(f.queries,initialQueries);
 assert.equal(c.snapshot().unavailable,false);
 checkpointRead(c);noCheckpointLeak(c.snapshot());
 assert.equal(rootView(c).runner.storeOwnership,'OWNED_EXISTING_V6_ORIGINAL_PAYMENT');
 const p=c.createOriginalRecoveryPlan(keyOf(f.requests[0]),observe(0));
 const s=c.createOriginalRecoveryStatePlan(keyOf(f.requests[1]),observe(1));
 const col=c.createOriginalRecoveryCollection(catalogJson());
 const obs=c.createOriginalRecoveryObservationCollection(catalogJson());
 f.plans.push(p,s);f.collections.push(col,obs);
 statePlan(p.getSnapshot(),0);statePlan(s.getSnapshot(),1);
 noCheckpointLeak(p.getSnapshot());noCheckpointLeak(s.getSnapshot());
 collection(col.getSnapshot());collection(obs.getSnapshot());
 noCheckpointLeak(col.getSnapshot());noCheckpointLeak(obs.getSnapshot());
 statePlan(p.observe(observe(0,'INCLUDED','SUCCEEDED')),0);
 statePlan(s.observe(observe(1,'INCLUDED','SUCCEEDED')),1);
 collection(obs.observeOriginal(keyOf(f.requests[1]),observe(1,'INCLUDED','SUCCEEDED')));
 f.declaredUpdates=3;
 assert.equal(p.getSnapshot().declaredPlan.view.phase,'RESULT_REPORTED');
 assert.equal(p.getSnapshot().declaredPlan.nextStep,'RECONCILE_FUNDING_AND_REQUEST');
 assert.equal(s.getSnapshot().declaredPlan.terminal,'SUCCEEDED');
 assert.equal(obs.getSnapshot().entries[1].recoveryPlan.declaredPlan.terminal,'SUCCEEDED');
 assert.equal(f.queries,initialQueries);assert.deepEqual(f.backend.load(),initialLedger);
 noCheckpointLeak(backendRead(c,0));noCheckpointLeak(backendRead(c,1));checkpointRead(c);
 for(let i=0;i<2;i++)localState(c.readOriginalRecoveryState(keyOf(f.requests[i])),i);
 assert.equal(c.readOriginalRecoveryState(keyOf(f.requests[2])),null);
 assert.equal(rootView(c).resource.storeCloseAttempts,0);assert.equal(c.snapshot().closed,false);
 assert.deepEqual(f.backend.load(),f.ledger);assert.equal(f.transportCalls,2);assert.equal(f.unitCalls,2);
 assert.equal(f.strictReplies,1);assert.equal(f.responseLosses,1);assert.deepEqual(f.order,[0,1]);
 assert.equal(f.proofs,3);f.stage=2;
});

test('V6 recovery consumer detaches cached plans after one UNKNOWN close without checkpoint leakage',OPTIONS,async t=>{
 assert.equal(f.stage,2);const rec=f.active,c=rec.c,plans=f.plans,collections=f.collections;
 const planCache=plans.map(p=>p.getSnapshot()),collectionCache=collections.map(p=>p.getSnapshot());
 const queryCount=f.queries;
 await closeFrame(rec);assert.equal(c.snapshot().closed,true);
 assert.throws(()=>c.readOriginalPaymentCheckpoint(INDEPENDENT_PINS),{code:RP+'CLOSED'});
 f.checkpointClosedRefusals++;noCheckpointLeak(c.snapshot());
 assert.throws(()=>c.readOriginalBackendRecoveryState(keyOf(f.requests[0]),f.headers[0],INDEPENDENT_PINS),{code:RP+'CLOSED'});
 for(const p of [...plans,...collections]){
  assert.throws(()=>p.getSnapshot(),{code:XP+'CLOSED'});f.liveReadRefusals++;
 }
 for(let i=0;i<plans.length;i++){
  const p=plans[i],v=p.close();powerless(v);noCheckpointLeak(v);
  assert.equal(v.closed,true);assert.equal(v.nextStep,'LOCALLY_CLOSED');
  assert.deepEqual(v.recoveryState,planCache[i].recoveryState);
  assert.equal(v,p.close());assert.equal(v,p.getSnapshot());
  assert.throws(()=>p.observe(observe(i)),{message:'CLIENT_PLAN_CLOSED'});
 }
 for(let i=0;i<collections.length;i++){
  const p=collections[i],v=p.close();powerless(v);noCheckpointLeak(v);
  assert.equal(v.closed,true);assert.equal(v.nextStep,'LOCALLY_CLOSED');
  assert.equal(v.snapshotKind,'DETACHED_HISTORICAL');assert.equal(v.unavailable,true);
  assert.equal(v.failureKind,'LIVE_READ_FAILED');assert.equal(v.childCloseAttempts,2);
  assert.equal(v.childCloseOutcome,'RETURNED');assert.deepEqual(v.entries,collectionCache[i].entries);
  assert.equal(v,p.close());assert.equal(v,p.getSnapshot());
 }
 assert.equal(f.queries,queryCount);assert.equal(rootView(c).resource.storeCloseAttempts,1);
 assert.deepEqual(f.backend.load(),f.ledger);const stamp=payerStamp();sameRows(f.seedStamp,stamp,1);
 retained(stamp,['consumer-first','consumer-lost'],['consumer-first'],true);
 assert.equal(f.transportCalls,2);assert.equal(f.unitCalls,2);assert.equal(f.expectedUnknownCloses,2);
 assert.equal(f.timerTokens.size,0);assert.equal(f.bridgeFaults,0);assert.equal(f.queryChanges,0);
 assert.equal(f.checkpointReads,2);assert.equal(f.checkpointClosedRefusals,1);assert.equal(f.checkpointPinRefusals,2);
 f.stage=3;
 t.diagnostic(JSON.stringify({kind:'P2_BACKEND_CONSUMER_V6',version:1,
  scenario:'ONE_V6_ORIGINAL_PAYMENT_OWNER_BACKEND_AND_EXISTING_DIAGNOSTICS_CACHED_UNKNOWN_CLOSE',
  checkpointMatched:true,independentPinsRequired:true,rawCheckpointAbsentFromDiagnostics:true,
  explicitCheckpointReads:f.checkpointReads,checkpointClosedReadRefusals:f.checkpointClosedRefusals,
  checkpointPinRefusals:f.checkpointPinRefusals,
  factoryRefusals:f.factoryRefusals,ownedOpens:f.frames.length,returnedStoreCloses:f.frames.length,
  expectedUnknownCloses:f.expectedUnknownCloses,rootCloseAttempts:f.frames.map(r=>rootView(r.c).resource.storeCloseAttempts),
  diagnosticFactories:4,declaredObservationUpdates:f.declaredUpdates,liveClosedReadRefusals:f.liveReadRefusals,
  detachedPlans:plans.length,detachedCollections:collections.length,backendOriginalQueries:f.queries,
  backendOriginalQueryChanges:f.queryChanges,declaredHttpRequests:f.transportCalls,bodylessEndCalls:f.endCalls,
  strictReplies:f.strictReplies,responseLosses:f.responseLosses,syntheticBackendCallbacks:f.unitCalls,
  backendExecutions:2,consumedUnits:2,availableUnits:8,heldUnits:0,originals:2,intents:2,responseObservations:1,
  grantQuarantines:1,unattemptedTail:true,payerConsumerOwnerEpochDelta:1,syntheticCapabilityKeyPairs:1,
  syntheticCapabilityProofs:f.proofs,deadlineScheduled:f.timerScheduled,deadlineCancelled:f.timerCancelled,
  deadlineTokens:f.timerTokens.size,nativeSqliteFiles:2,authority:'NONE',serviceDelivery:'NOT_ESTABLISHED',
  realPaymentSigner:'DISABLED',networkCalls:0}));
});

after(async t=>{
 let failure=null;
 try{
  await Promise.all(f.handlers);
  for(const p of [...f.plans,...f.collections])p.close();
  for(const r of f.frames)if(!r.started)await closeFrame(r);
  assert.equal(f.active,null);assert.equal(f.timerTokens.size,0);
  if(f.session!==null){const p=f.session.close();assert.equal(p,f.session.close());assert.equal(await p,undefined);}
 }catch(error){failure=error;t.diagnostic('CONSUMER_CLEANUP_FAILURE:'+String(error?.code??error?.message));}
 finally{
  try{if(f.backend!==null)f.backend.close();}catch(error){failure??=error;}
  f.backend=null;f.session=null;f.key=null;f.headers=null;f.inputs=null;
 }
 assert.deepEqual(sources(),sourceBefore);
 if(failure!==null)throw failure;
 assert.equal(f.stage,3);
});
