// Selected opt-in V4 owned backend bindings on TWO new private synthetic SQLite files.
// Existing backend, V4 payer owner and sequential core; only declared socketless transport and backend deadlines.
// Keys/proofs stay in memory under the synthetic-capability exception. No SDK, network, real payment signer or pilot.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { lstatSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ENTRY = "qualification/service-credit-custodied-backend-v4-quarantine.behavior.draft.mjs";
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
    20144,
    430,
    "7d81de10b7bf375434e51a1d769f2e0005c9bea1d4ad01df863cb40480bb5011"
  ],
  [
    "src/service-credit-custodied-sqlite-http-client.js",
    19683,
    530,
    "06366488e679272170847af4929db3b3f782774022f97c748530ec73f729f0bc"
  ],
  [
    "src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js",
    64917,
    1687,
    "db4d3aca8c039e3433e49f6bafe42cbc4973e0f9478500dbe6cf36f53773232d"
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
    15827,
    490,
    "640d578e99f9cb21cf8d79ec870e676e3d9087ebee831e795b1b120b9860ddfb"
  ]
];
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], SELF);
assert.equal(process.versions.node, '24.19.0'); assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.env.P2_BACKEND_V4_OPT_IN, 'synthetic-native-backend-quarantine-v4-only');
const PINS = JSON.parse(process.env.P2_BACKEND_V4_PINS), scratch = process.env.SPV_TASK_SCRATCH;
assert.equal(typeof scratch, 'string'); assert.equal(resolve(scratch), scratch);
const scratchStat = lstatSync(scratch, { bigint: true });
assert.ok(scratchStat.isDirectory() && !scratchStat.isSymbolicLink());
assert.equal(scratchStat.uid, BigInt(process.getuid())); assert.equal(scratchStat.mode & 0o777n, 0o700n);
const FILES = ['backend-v4.sqlite', 'payer-v4.sqlite'];
for (const name of FILES) assert.throws(() => lstatSync(join(scratch, name)), { code: 'ENOENT' });
const ids = s => ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k => String(s[k]));
const sha = b => createHash('sha256').update(b).digest('hex');
function sources() {
  assert.equal(PINS.length, 20); assert.deepEqual(PINS.map(p => p.path), [...SPECS.map(p => p[0]), ENTRY]);
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


const { ServiceCreditSqliteStore: Backend } = await import('../src/service-credit-sqlite-store.js');
const {
 openServiceCreditCustodiedSqliteBackendSequentialRunnerV4: OPEN_RUNNER,
 openServiceCreditCustodiedSqliteBackendRecoveryClientV4: OPEN_READER,
 openServiceCreditCustodiedSqliteBackendClientV4: OPEN_CLIENT,
 openServiceCreditCustodiedSqliteBackendClientV3: OPEN_LEGACY,
} = await import('../src/service-credit-custodied-backend-recovery-client.js');
const { createZenonFundingPayerRecoveryCustodyQuarantineSqliteStoreV4: CREATE_PAYER }
 = await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const { createDurableServiceCreditHttpSession: SESSION } = await import('../src/service-credit-durable-http-session.js');
const { deriveServiceCreditCapabilityCommitment: COMMIT, createServiceCreditCapabilitySigningBytes: SIGNING_BYTES }
 = await import('../src/service-credit-capability.js');
const { DatabaseSync } = await import('node:sqlite');
const OPTIONS = { timeout: 5000, concurrency: false };
const FUNDING = 'https://backend-v4.invalid/funding';
const SERVICE = 'https://backend-v4.invalid/service-credit/v1/execute';
const POLICY = Object.freeze({ policyVersion: 1, maxRequests: 8, serviceResourceUrl: SERVICE });
const HASH = 'a'.repeat(64), EMPTY = 'sha256:' + sha(Buffer.alloc(0));
const RP = 'SERVICE_CREDIT_CUSTODIED_BACKEND_RECOVERY_';
const HP = 'SERVICE_CREDIT_CUSTODIED_HTTP_CLIENT_';
const XP = 'SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_';
const CP = 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_';
const keyOf = r => ({ grantId: r.grantId, requestId: r.requestId });
const f = { backend: null, session: null, key: null, active: null, frames: [], grant: null, stage: 0,
 requests: [], inputs: [], headers: [], handlers: [], order: [], mode: 'DROP_AFTER_COMMIT', deferred: null,
 queries: 0, queryChanges: 0, transportCalls: 0, endCalls: 0, unitCalls: 0,
 expectedUnknownCloses: 0, factoryRefusals: 0, proofs: 0, timerScheduled: 0, timerCancelled: 0,
 timerTokens: new Set(), bridgeFaults: 0, legacyRefusals: 0 };
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
function capability() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
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
function configuration(extra = {}) {
  return { databasePath: join(scratch, 'payer-v4.sqlite'), allowedRoot: scratch, backendStore: f.backend,
    fundingResourceUrl: FUNDING, custodyPolicy: POLICY, selectedGrantId: f.grant.grantId,
    deadlineMs: 2000, ...extra };
}

function rootView(c) { const v = c.snapshot(); return Object.hasOwn(v, 'connection') ? v.connection.client : v.client; }
function ownerView(c) { return rootView(c).client.owner; }
function payerStamp() {
 assert.equal(f.active, null);
 const path = join(scratch, 'payer-v4.sqlite'), st = lstatSync(path, { bigint: true });
 assert.ok(st.isFile() && !st.isSymbolicLink()); assert.equal(st.uid, BigInt(process.getuid()));
 assert.equal(st.dev, scratchStat.dev); assert.equal(st.nlink, 1n); assert.equal(st.mode & 0o777n, 0o600n);
 const db = new DatabaseSync(path, { readOnly: true, allowExtension: false,
  enableDoubleQuotedStringLiterals: false, enableForeignKeyConstraints: true, timeout: 0 });
 try {
  return {
   epoch: db.prepare('SELECT owner_epoch FROM payer_recovery_meta WHERE singleton=1').get().owner_epoch,
   meta: db.prepare('SELECT singleton,resource_url FROM payer_recovery_meta ORDER BY singleton').all(),
   state: db.prepare('SELECT * FROM payer_recovery_state ORDER BY singleton').all(),
   originals: db.prepare('SELECT * FROM original_service_requests ORDER BY grant_id,request_id').all(),
   intents: db.prepare('SELECT * FROM original_dispatch_intents ORDER BY grant_id,request_id').all(),
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
 for (const k of ['meta','state','policy','schema','userVersion','applicationId']) assert.deepEqual(after[k], before[k]);
 assert.equal(after.userVersion, 4); assert.equal(after.applicationId, 0x5a505252);
 const state = JSON.parse(after.state[0].envelope);
 assert.equal(state.paymentHeader, PAIR.paymentSignatureHeader); assert.equal(state.challengeHeader, PAIR.challenge.paymentRequiredHeader);
 for (const h of f.headers) assert.equal(JSON.stringify(after).includes(h), false);
}
function sameRows(before, after, delta) {
 sameFunding(before, after, delta);
 for (const k of ['originals','intents','quarantines']) assert.deepEqual(after[k], before[k]);
}
function retained(stamp) {
 assert.equal(stamp.originals.length, 1); assert.equal(stamp.intents.length, 1); assert.equal(stamp.quarantines.length, 1);
 const original = JSON.parse(stamp.originals[0].envelope), intent = JSON.parse(stamp.intents[0].envelope);
 assert.equal(original.grantId, f.grant.grantId); assert.equal(original.requestId, f.requests[0].requestId);
 assert.equal(original.originalRequestJson, JSON.stringify(f.requests[0])); assert.equal(original.originalBodyBase64, '');
 assert.equal(original.paymentHash, HASH); assert.equal(intent.paymentHash, HASH); assert.equal(intent.fundingRevision, 3);
 const q = JSON.parse(stamp.quarantines[0].envelope);
 assert.equal(q.grantId, f.grant.grantId); assert.equal(q.paymentHash, HASH);
 assert.equal(q.status, 'CUSTODY_OUTCOME_UNKNOWN'); assert.equal(q.authority, 'NONE'); assert.deepEqual(q.custodyPolicy, POLICY);
 for (const r of f.requests.slice(1)) {
  assert.equal(stamp.originals.some(v => v.request_id === r.requestId), false);
  assert.equal(stamp.intents.some(v => v.request_id === r.requestId), false);
  assert.equal(f.backend.getRequest(keyOf(r)), null);
 }
 const ledger = JSON.stringify(f.backend.load());
 for (const h of f.headers) assert.equal(ledger.includes(h), false);
 assert.equal(ledger.includes(f.key.publicKey.export({ format: 'jwk' }).x), false);
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
 assert.throws(() => rec.c.readOriginalBackendRecoveryState(keyOf(f.requests[0]), f.headers[0]), { code: RP + 'CLOSED' });
 if (rec.kind === 'runner') {
  assert.equal(rec.c.snapshot().runner.closeCalls, 1); assert.equal(rec.c.snapshot().runner.queuedReferences, 0);
  assert.equal(rec.c.snapshot().unknown, true); assert.equal(rec.c.snapshot().runner.storeOwnership, 'OWNED_EXISTING_V4_CUSTODY_QUARANTINE');
 }
 rec.done = true; f.active = null;
}
async function owned(kind, action) {
 assert.equal(f.active, null);
 const OPEN = kind === 'runner' ? OPEN_RUNNER : kind === 'reader' ? OPEN_READER : OPEN_CLIENT;
 const c = await OPEN(configuration(kind === 'reader' ? {} : { requestImpl }));
 const rec = { c, kind, seen: 0, started: false, done: false }; f.frames.push(rec); f.active = rec; frozen(c);
 try { return await action(c); } finally { await closeFrame(rec); }
}
function backendRead(c) {
 const before = f.backend.load(), queries = f.queries, calls = f.transportCalls, units = f.unitCalls;
 const v = c.readOriginalBackendRecoveryState(keyOf(f.requests[0]), f.headers[0]); frozen(v);
 assert.equal(v.status, 'CLIENT_RECONCILIATION_REQUIRED'); assert.equal(v.backend.status, 'CACHED_SUCCESS');
 assert.equal(v.backend.cachedResult.resultCode, 'synthetic-service-result');
 assert.equal(v.local.funding.status, 'BOUND'); assert.equal(v.local.funding.revision, 3);
 assert.equal(v.local.funding.paymentHash, HASH); assert.equal(v.local.original.originalRequestJson, JSON.stringify(f.requests[0]));
 assert.equal(v.local.dispatchStatus, 'POSSIBLY_ATTEMPTED'); assert.equal(v.local.uncertainty.custody, true);
 assert.equal(v.authority, 'NONE'); assert.equal(v.nextStep, 'RECONCILIATION_REQUIRED');
 for (const k of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed']) assert.equal(v[k], false);
 for (const k of ['executionAuthorized','paymentAuthorized','signingAuthorized']) assert.equal(v.backend[k], false);
 assert.equal(v.backend.deliveryStatus, 'NOT_ESTABLISHED'); assert.equal(v.serviceDelivery, 'NOT_ESTABLISHED');
 assert.equal(f.queries, queries + 1); assert.equal(f.transportCalls, calls); assert.equal(f.unitCalls, units);
 assert.deepEqual(f.backend.load(), before); assert.equal(f.queryChanges, 0);
 assert.equal(JSON.stringify(v).includes(f.headers[0]), false);
 return v;
}
function diagnostic(t, scenario) {
 assert.equal(f.active, null); assert.equal(f.timerTokens.size, 0); assert.equal(f.bridgeFaults, 0); assert.equal(f.queryChanges, 0);
 let writes = 0, confirms = 0;
 for (const r of f.frames) {
  assert.equal(r.done, true);
  writes += ownerView(r.c).counts.quarantineWrites; confirms += ownerView(r.c).counts.quarantineReadbackConfirmations;
 }
 t.diagnostic(JSON.stringify({ kind: 'P2_BACKEND_QUARANTINE_V4', version: 1, scenario,
  ownedOpens: f.frames.length, returnedStoreCloses: f.frames.length, expectedUnknownCloses: f.expectedUnknownCloses,
  declaredHttpRequests: f.transportCalls, bodylessEndCalls: f.endCalls, syntheticBackendCallbacks: f.unitCalls,
  backendOriginalQueries: f.queries, backendOriginalQueryChanges: f.queryChanges,
  quarantineWrites: writes, quarantineReadbackConfirmations: confirms,
  factoryRefusals: f.factoryRefusals, legacyV3Refusals: f.legacyRefusals,
  syntheticCapabilityKeyPairs: 1, syntheticCapabilityProofs: f.proofs,
  deadlineScheduled: f.timerScheduled, deadlineCancelled: f.timerCancelled, deadlineTokens: f.timerTokens.size,
  nativeSqliteFiles: 2, authority: 'NONE', serviceDelivery: 'NOT_ESTABLISHED', realPaymentSigner: 'DISABLED', networkCalls: 0 }));
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
  f.order.push(f.headers.indexOf(options.headers.Authorization));
  const req = emitter(true), mode = f.mode, headers = new Map();
  const serverResponse = {
    destroyed: false, writableEnded: false, statusCode: 0,
    setHeader(name, value) { headers.set(name, String(value)); },
    end(bytes) {
      assert.equal(serverResponse.writableEnded, false); serverResponse.writableEnded = true;
      assert.equal(serverResponse.statusCode, 200); assert.ok(Buffer.isBuffer(bytes)); assert.ok(bytes.length <= 512);
      if (mode === 'DROP_AFTER_COMMIT') { req.emit('error', Error('synthetic response loss')); return; }
      const res = emitter(false);
      res.raw.statusCode = serverResponse.statusCode;
      res.raw.rawHeaders = [...headers.entries()].flatMap(([name, value]) => [name, value]);
      res.raw.complete = false; onResponse(res.raw); res.emit('data', bytes);
      res.raw.complete = true; res.emit('end'); res.close(); req.close();
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
  f.backend = Backend.create({ databasePath: join(scratch, 'backend-v4.sqlite'), allowedRoot: scratch,
    deriveCost() { return 1; }, now() { return 1000; }, busyTimeoutMs: 50, maxStateBytes: 65536,
    maxOffers: 2, maxGrants: 2, maxRequests: 8, testHooks: {
      beforeBegin({ operation }) { if (operation === 'getOriginalRequestExecutionSnapshot') f.queries++; },
      beforeCommit({ operation, changed }) {
        if (operation === 'getOriginalRequestExecutionSnapshot' && changed) f.queryChanges++;
      },
    } });
  const offer = { modelVersion: 1, providerId: 'synthetic-provider', serviceId: 'synthetic-service',
    resourceId: 'synthetic-resource', resourceBinding: digest(1), offerId: 'backend-v4-offer', offerVersion: 1,
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
  f.requests = ['v4-first','v4-tail','v4-new'].map(request);
  f.headers = f.requests.map(proof);
  f.inputs = f.requests.map((r, i) => freeze({ grantId: r.grantId, requestId: r.requestId,
    originalRequestJson: JSON.stringify(r), originalBodyBase64: '', serviceResourceUrl: SERVICE,
    authorizationHeader: f.headers[i] }));
  const payer = CREATE_PAYER({ databasePath: join(scratch, 'payer-v4.sqlite'), allowedRoot: scratch,
    resourceUrl: FUNDING, custodyPolicy: POLICY });
  try { payer.prepare(PAIR); payer.fenceAttempt('PREPARED'); assert.equal(payer.finishAttempt('BOUND').revision, 3); }
  finally { payer.close(); }
  f.session = SESSION({ store: f.backend, admittedGrantId: f.grant.grantId, selectedDurationMs: 1000,
    execute() {
      f.unitCalls++;
      if (f.deferred !== null) { f.deferred.entered.resolve(undefined); return f.deferred.result.promise; }
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

after(async () => {
 try {
  await Promise.all(f.handlers);
  for (const r of f.frames) if (!r.started) await closeFrame(r);
  assert.equal(f.active, null); assert.equal(f.timerTokens.size, 0);
  if (f.session !== null) { const p = f.session.close(); assert.equal(p, f.session.close()); assert.equal(await p, undefined); }
 } finally {
  if (f.backend !== null) f.backend.close();
  f.backend = null; f.session = null; f.key = null; f.headers = null; f.inputs = null;
 }
 assert.deepEqual(sources(), sourceBefore); assert.equal(f.stage, 3);
});

test('V4 backend runner persists uncertainty after backend commit and stops its queued tail', OPTIONS, async t => {
 assert.equal(f.stage, 0);
 const before = payerStamp(), ledger = f.backend.load(); let calls = 0;
 await assert.rejects(OPEN_RUNNER(configuration()), { code: RP + 'INVALID_CONFIGURATION' }); f.factoryRefusals++;
 const getter = configuration();
 Object.defineProperty(getter, 'deadlineMs', { enumerable: true, get() { calls++; throw Error('forbidden getter'); } });
 await assert.rejects(OPEN_READER(getter), { code: RP + 'INVALID_CONFIGURATION' }); f.factoryRefusals++;
 const proxy = new Proxy(requestImpl, { apply() { calls++; throw Error('forbidden proxy'); } });
 await assert.rejects(OPEN_CLIENT(configuration({ requestImpl: proxy })), { code: RP + 'INVALID_CONFIGURATION' }); f.factoryRefusals++;
 assert.equal(calls, 0); sameRows(before, payerStamp(), 0); assert.deepEqual(f.backend.load(), ledger);
 await owned('runner', async c => {
  assert.equal(Object.hasOwn(c, 'submitOriginal'), false);
  assert.equal(c.snapshot().runner.storeOwnership, 'OWNED_EXISTING_V4_CUSTODY_QUARANTINE');
  const entries = [f.inputs[0], f.inputs[1]], p = c.runOriginals(entries);
  assert.equal(p, c.runOriginals(entries));
  await assert.rejects(p, { code: CP + 'RUN_FAILED' }); await Promise.all(f.handlers);
  const v = c.snapshot();
  assert.equal(v.runner.failure, 'ENTRY_REJECTED'); assert.equal(v.runner.attempted, 1);
  assert.equal(v.runner.completed, 0); assert.equal(v.runner.notAttempted, 1); assert.equal(v.runner.queuedReferences, 0);
  assert.equal(v.unknown, true); assert.equal(v.connection.unavailable, false);
  assert.equal(ownerView(c).custodyQuarantine.status, 'PERSISTED_UNKNOWN');
  assert.equal(ownerView(c).counts.quarantineWrites, 1); assert.equal(ownerView(c).counts.quarantineReadbackConfirmations, 1);
 });
 const stamp = payerStamp(); sameFunding(before, stamp, 1); retained(stamp);
 assert.equal(f.backend.getRequest(keyOf(f.requests[0])).state, 'SUCCEEDED');
 assert.equal(f.backend.getDurableExecutionSnapshot().executionState.executions.length, 1);
 assert.deepEqual(f.order, [0]); assert.equal(f.transportCalls, 1); assert.equal(f.unitCalls, 1);
 f.stage = 1; diagnostic(t, 'BACKEND_COMMIT_RESPONSE_LOSS_PERSISTS_GRANT_QUARANTINE');
});

test('V4 no-dispatch backend reader keeps cached success subordinate to persisted quarantine', OPTIONS, async t => {
 assert.equal(f.stage, 1); const before = payerStamp(), ledger = f.backend.load();
 await owned('reader', async c => {
  assert.deepEqual(Object.keys(c), ['readOriginal','readOriginalRecoveryState','readOriginalRecoveryKeys',
   'readOriginalBackendRecoveryState','snapshot','close']);
  for (const k of ['submitOriginal','runOriginals','requestImpl','sign','pay','store','backendStore']) assert.equal(Object.hasOwn(c, k), false);
  assert.equal(rootView(c).client.lastTransport, null);
  assert.equal(ownerView(c).custodyQuarantine.status, 'PERSISTED_UNKNOWN');
  assert.equal(ownerView(c).custodyQuarantine.writeAttempted, false);
  assert.equal(ownerView(c).uncertainty.custody, true); assert.equal(ownerView(c).uncertainty.submission, false);
  backendRead(c);
  const keys = c.readOriginalRecoveryKeys(); frozen(keys);
  assert.deepEqual(keys.keys, [keyOf(f.requests[0])]);
  for (const k of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed']) assert.equal(keys[k], false);
  assert.equal(ownerView(c).counts.quarantineWrites, 0); assert.equal(ownerView(c).counts.quarantineReadbackConfirmations, 0);
 });
 sameRows(before, payerStamp(), 1); retained(payerStamp()); assert.deepEqual(f.backend.load(), ledger);
 assert.equal(f.transportCalls, 1); assert.equal(f.unitCalls, 1);
 f.stage = 2; diagnostic(t, 'NO_DISPATCH_V4_READER_RETURNS_DATA_NOT_RELEASE_AUTHORITY');
});

test('V4 full backend client refuses new work while legacy V3 stays schema-separated', OPTIONS, async t => {
 assert.equal(f.stage, 2); const before = payerStamp(), ledger = f.backend.load();
 await owned('client', async c => {
  assert.equal(typeof c.submitOriginal, 'function'); assert.equal(Object.hasOwn(c, 'runOriginals'), false);
  backendRead(c);
  const counts = ownerView(c).counts;
  await assert.rejects(c.submitOriginal(f.inputs[2]), { code: HP + 'CUSTODY_OUTCOME_UNKNOWN' });
  assert.deepEqual(ownerView(c).counts, counts); assert.equal(rootView(c).client.lastTransport, null);
  assert.equal(ownerView(c).counts.quarantineWrites, 0); assert.equal(ownerView(c).counts.quarantineReadbackConfirmations, 0);
 });
 const after = payerStamp(); sameRows(before, after, 1); retained(after); assert.deepEqual(f.backend.load(), ledger);
 // Existing V3 is not silently upgraded or redirected to V4. Its refusal grants no migration/reset.
 await assert.rejects(OPEN_LEGACY(configuration({ requestImpl }))); f.legacyRefusals++;
 sameRows(after, payerStamp(), 0); assert.deepEqual(f.backend.load(), ledger);
 assert.equal(f.frames.length, 3); assert.equal(f.expectedUnknownCloses, 3);
 assert.equal(f.transportCalls, 1); assert.equal(f.endCalls, 1); assert.equal(f.unitCalls, 1);
 assert.equal(f.queries, 2); assert.equal(f.proofs, 3);
 assert.equal(f.timerScheduled, 1); assert.equal(f.timerCancelled, 1);
 f.stage = 3; diagnostic(t, 'V4_FULL_CLIENT_NO_NEW_DISPATCH_V3_NO_MIGRATION');
});
