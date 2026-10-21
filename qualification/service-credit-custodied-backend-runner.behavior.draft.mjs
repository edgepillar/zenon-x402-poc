// Selected P2 backend-bound sequential runner on TWO new private synthetic SQLite files.
// Actual existing V3 payer/store, sequential core, backend session and execution owner.
// Socketless request/response handles and backend deadline runtime are DECLARED.
// No real HTTP/HTTPS, SDK, wallet, payment signer, provider or process restart.
// Only in-memory synthetic capability keys/proofs; funding/activation is declared.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { lstatSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ENTRY = 'qualification/service-credit-custodied-backend-runner.behavior.draft.mjs';
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
assert.equal(process.env.P2_BACKEND_RUNNER_OPT_IN, 'synthetic-native-backend-sequential-only');
const PINS = JSON.parse(process.env.P2_BACKEND_RUNNER_PINS), scratch = process.env.SPV_TASK_SCRATCH;
assert.equal(typeof scratch, 'string'); assert.equal(resolve(scratch), scratch);
const scratchStat = lstatSync(scratch, { bigint: true });
assert.ok(scratchStat.isDirectory() && !scratchStat.isSymbolicLink());
assert.equal(scratchStat.uid, BigInt(process.getuid())); assert.equal(scratchStat.mode & 0o777n, 0o700n);
const FILES = ['backend.sqlite', 'payer.sqlite'];
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
const { openServiceCreditCustodiedSqliteBackendSequentialRunnerV3: OPEN }
  = await import('../src/service-credit-custodied-backend-recovery-client.js');
const { createZenonFundingPayerRecoveryDispatchIntentSqliteStoreV3: CREATE_PAYER }
  = await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const { createDurableServiceCreditHttpSession: SESSION } = await import('../src/service-credit-durable-http-session.js');
const { deriveServiceCreditCapabilityCommitment: COMMIT, createServiceCreditCapabilitySigningBytes: SIGNING_BYTES }
  = await import('../src/service-credit-capability.js');
const { serializeOriginalServiceRequestCustody: SERIALIZE,
  serializeOriginalServiceDispatchIntent: SERIALIZE_INTENT }
  = await import('../src/service-credit-original-request-custody-contract.js');
const { DatabaseSync } = await import('node:sqlite');
const OPTIONS = { timeout: 5000, concurrency: false };
const FUNDING = 'https://backend-runner.invalid/funding';
const SERVICE = 'https://backend-runner.invalid/service-credit/v1/execute';
const POLICY = Object.freeze({ policyVersion: 1, maxRequests: 8, serviceResourceUrl: SERVICE });
const HASH = 'a'.repeat(64), EMPTY = 'sha256:' + sha(Buffer.alloc(0));
const RP = 'SERVICE_CREDIT_CUSTODIED_BACKEND_RECOVERY_';
const OP = 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const HP = 'SERVICE_CREDIT_CUSTODIED_HTTP_CLIENT_';
const XP = 'SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_';
const CP = 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_';
const keyOf = r => ({ grantId: r.grantId, requestId: r.requestId });
const f = { backend: null, session: null, key: null, active: null, clients: [], grant: null,
  requests: [], inputs: [], headers: [], handlers: [], order: [], mode: 'DELIVER', deferred: null,
  queries: 0, queryChanges: 0, transportCalls: 0, endCalls: 0, unitCalls: 0,
  closeFulfilled: 0, closeRejectedExpected: 0, unexpectedCloseFailures: 0,
  factoryRefusals: 0, proofs: 0, timerScheduled: 0, timerCancelled: 0,
  timerTokens: new Set(), bridgeFaults: 0, backendClosedByFixture: false };
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
  return { databasePath: join(scratch, 'payer.sqlite'), allowedRoot: scratch, backendStore: f.backend,
    fundingResourceUrl: FUNDING, custodyPolicy: POLICY, selectedGrantId: f.grant.grantId,
    deadlineMs: 2000, ...extra };
}
function rootView(c) { return c.snapshot().connection.client; }
function ownerView(c) { return rootView(c).client.owner; }
function checkSurface(c) {
  frozen(c);
  assert.deepEqual(Object.keys(c), ['runOriginals','readOriginal','readOriginalRecoveryState',
    'readOriginalRecoveryKeys','readOriginalBackendRecoveryState','snapshot','close']);
  for (const name of ['submitOriginal','store','backendStore','requestImpl','create','recover','sign','pay']) {
    assert.equal(Object.hasOwn(c, name), false);
  }
  const v = c.snapshot();
  assert.equal(v.storeOwnership, 'PAYER_OWNED_BACKEND_BORROWED');
  assert.equal(v.authority, 'NONE'); assert.equal(v.serviceDelivery, 'NOT_ESTABLISHED');
  assert.equal(v.serviceDispatchCapability, 'EXPLICIT_SEQUENTIAL_BATCH_ONLY');
  assert.equal(v.connection.serviceDispatchCapability, 'EXPLICIT_CALLER_TRANSPORT_ONLY');
  assert.equal(v.runner.storeOwnership, 'OWNED_EXISTING_V3_DISPATCH_INTENT');
  for (const k of ['currentAuthority','realReady','restart','physicalDurability','pilot']) assert.equal(v[k], 'NOT_ESTABLISHED');
}
function payerStamp() {
  assert.equal(f.active, null);
  const path = join(scratch, 'payer.sqlite'), st = lstatSync(path, { bigint: true });
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
      policy: db.prepare('SELECT * FROM original_request_custody_policy ORDER BY singleton').all(),
      schema: db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all(),
      userVersion: db.prepare('PRAGMA user_version').get().user_version,
      applicationId: db.prepare('PRAGMA application_id').get().application_id,
    };
  } finally { db.close(); }
}
function sameFundingSchema(before, after, epochDelta) {
  assert.equal(after.epoch, before.epoch + epochDelta);
  for (const k of ['meta','state','policy','schema','userVersion','applicationId']) assert.deepEqual(after[k], before[k]);
  assert.equal(after.userVersion, 3); assert.equal(after.applicationId, 0x5a505252);
  const state = JSON.parse(after.state[0].envelope);
  assert.equal(state.paymentHeader, PAIR.paymentSignatureHeader);
  assert.equal(state.challengeHeader, PAIR.challenge.paymentRequiredHeader);
  for (const header of f.headers) assert.equal(JSON.stringify(after).includes(header), false);
}
function sameAllRows(before, after, epochDelta) {
  sameFundingSchema(before, after, epochDelta);
  assert.deepEqual(after.originals, before.originals); assert.deepEqual(after.intents, before.intents);
}
function retained(stamp, index) {
  const r = f.requests[index], row = stamp.originals.find(v => v.request_id === r.requestId);
  const intent = stamp.intents.find(v => v.request_id === r.requestId);
  assert.ok(row); assert.ok(intent);
  const record = JSON.parse(row.envelope), fence = JSON.parse(intent.envelope);
  assert.equal(record.originalRequestJson, JSON.stringify(r)); assert.equal(record.originalBodyBase64, '');
  assert.equal(record.paymentHash, HASH); assert.equal(record.network, 'zenon:testnet');
  assert.equal(fence.fundingRevision, 3); assert.equal(fence.paymentHash, HASH);
  assert.equal(JSON.stringify(stamp).includes(f.headers[index]), false);
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
    handled.then(() => { assert.equal(serverResponse.writableEnded, true); },
      () => { f.bridgeFaults++; req.emit('error', Error('synthetic handler failure')); });
  });
  return req.raw;
}
async function closeClient(rec) {
  if (rec.started) { assert.equal(rec.finished, true); return; }
  rec.started = true;
  const promise = rec.c.close(); assert.equal(promise, rec.c.close()); assert.ok(promise instanceof Promise);
  assert.throws(() => rec.c.readOriginalBackendRecoveryState(keyOf(f.requests[0]), f.headers[0]), { code: RP + 'CLOSED' });
  if (rec.expectUnknown) {
    await assert.rejects(promise, { code: XP + 'CHILD_OUTCOME_UNKNOWN' }); f.closeRejectedExpected++;
  } else {
    assert.equal(await promise, undefined); f.closeFulfilled++;
  }
  assert.equal(promise, rec.c.close());
  const snap = rootView(rec.c);
  assert.equal(snap.resource.phase, 'RELEASED'); assert.equal(snap.resource.slotHeld, false);
  assert.equal(snap.resource.storeCloseAttempts, 1); assert.equal(snap.resource.storeCloseOutcome, 'RETURNED');
  assert.equal(snap.close.outcome, rec.expectUnknown ? 'CHILD_UNKNOWN' : 'DRAINED');
  assert.equal(rec.c.snapshot().runner.closeCalls, 1);
  if (rec.batch === null) await assert.rejects(rec.c.runOriginals([f.inputs[0]]), { code: CP + 'CLOSED' });
  else assert.equal(rec.c.runOriginals(rec.batch), rec.run);
  rec.finished = true; f.active = null;
}
async function owned(expectUnknown, fn) {
  assert.equal(f.active, null);
  const c = await OPEN(configuration({ requestImpl }));
  const rec = { c, expectUnknown, started: false, finished: false, seen: 0, batch: null, run: null };
  f.clients.push(rec); f.active = rec; checkSurface(c);
  try { return await fn(c); } finally { await closeClient(rec); }
}
function batch(c, indexes) {
  assert.equal(f.active.c, c); assert.equal(f.active.batch, null);
  const entries = Object.freeze(indexes.map(i => f.inputs[i]));
  f.active.batch = entries;
  const operation = c.runOriginals(entries); f.active.run = operation;
  assert.equal(operation, c.runOriginals(entries));
  return operation;
}
function read(c, index, expectedStatus, expectedQueries = 1) {
  const before = f.backend.load(), queries = f.queries, calls = f.transportCalls, units = f.unitCalls;
  const v = c.readOriginalBackendRecoveryState(keyOf(f.requests[index]), f.headers[index]);
  assert.equal(v.status, expectedStatus); frozen(v); assert.equal(v.authority, 'NONE');
  for (const k of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed']) assert.equal(v[k], false);
  assert.equal(v.serviceDelivery, 'NOT_ESTABLISHED'); assert.equal(v.currentAuthority, 'NOT_ESTABLISHED');
  assert.equal(v.nextStep, 'RECONCILIATION_REQUIRED');
  assert.equal(f.queries - queries, expectedQueries); assert.equal(f.transportCalls, calls); assert.equal(f.unitCalls, units);
  assert.deepEqual(f.backend.load(), before); assert.equal(f.queryChanges, 0);
  assert.equal(JSON.stringify(v).includes(f.headers[index]), false);
  return v;
}
function diagnostic(t, scenario) {
  assert.equal(f.active, null); assert.equal(f.timerTokens.size, 0);
  assert.equal(f.bridgeFaults, 0); assert.equal(f.queryChanges, 0); assert.equal(f.unexpectedCloseFailures, 0);
  const totals = { retainCalls: 0, intentWrites: 0, dispatchCalls: 0 };
  for (const rec of f.clients) {
    assert.equal(rec.finished, true); checkSurface(rec.c);
    for (const k of Object.keys(totals)) totals[k] += ownerView(rec.c).counts[k];
  }
  t.diagnostic(JSON.stringify({ kind: 'P2_BACKEND_RUNNER', version: 1, scenario,
    requestCalls: f.transportCalls, bodylessEndCalls: f.endCalls, syntheticServiceCallbacks: f.unitCalls,
    backendOriginalQueries: f.queries, ownedOpens: f.clients.length,
    storeCloseReturns: f.clients.filter(r => r.finished).length,
    closeFulfilled: f.closeFulfilled, expectedCloseRejections: f.closeRejectedExpected,
    expectedFactoryRefusals: f.factoryRefusals, syntheticProofs: f.proofs,
    nativeRetains: totals.retainCalls, nativeIntentWrites: totals.intentWrites, serviceDispatches: totals.dispatchCalls,
    deadlineScheduled: f.timerScheduled, deadlineCancelled: f.timerCancelled, deadlineTokens: f.timerTokens.size,
    runnerHistory: f.clients.map(rec => {
      const v = rec.c.snapshot().runner;
      return { planned: v.planned, attempted: v.attempted, completed: v.completed, notAttempted: v.notAttempted,
        queuedReferences: v.queuedReferences, closeCalls: v.closeCalls, outcome: v.outcome, failure: v.failure };
    }),
    transportOrder: [...f.order],
    nativeSqliteFiles: 2, declaredNoSocketTransport: true, declaredBackendDeadline: true,
    realPaymentSigner: 'DISABLED', networkCalls: 0, serviceDelivery: 'NOT_ESTABLISHED' }));
}
before(() => {
  f.key = generateKeyPairSync('ed25519');
  const digest = n => 'sha256:' + String(n).repeat(64);
  f.backend = Backend.create({ databasePath: join(scratch, 'backend.sqlite'), allowedRoot: scratch,
    deriveCost() { return 1; }, now() { return 1000; }, busyTimeoutMs: 50, maxStateBytes: 65536,
    maxOffers: 2, maxGrants: 2, maxRequests: 8, testHooks: {
      beforeBegin({ operation }) { if (operation === 'getOriginalRequestExecutionSnapshot') f.queries++; },
      beforeCommit({ operation, changed }) {
        if (operation === 'getOriginalRequestExecutionSnapshot' && changed) f.queryChanges++;
      },
    } });
  const offer = { modelVersion: 1, providerId: 'synthetic-provider', serviceId: 'synthetic-service',
    resourceId: 'synthetic-resource', resourceBinding: digest(1), offerId: 'backend-runner-offer', offerVersion: 1,
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
  f.requests = ['runner-first','runner-second','runner-unknown','runner-manual','runner-never-started'].map(request);
  f.headers = f.requests.map(proof);
  f.inputs = f.requests.map((r, i) => freeze({ grantId: r.grantId, requestId: r.requestId,
    originalRequestJson: JSON.stringify(r), originalBodyBase64: '', serviceResourceUrl: SERVICE,
    authorizationHeader: f.headers[i] }));
  const payer = CREATE_PAYER({ databasePath: join(scratch, 'payer.sqlite'), allowedRoot: scratch,
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
  if (f.deferred !== null) f.deferred.result.resolve({ resultCode: 'synthetic-service-result' });
  await Promise.all(f.handlers);
  for (const rec of f.clients) if (!rec.started) await closeClient(rec);
  assert.equal(f.active, null); assert.equal(f.timerTokens.size, 0);
  const closed = f.session.close(); assert.equal(closed, f.session.close()); assert.equal(await closed, undefined);
  f.backend.close(); f.backendClosedByFixture = true;
  f.backend = null; f.session = null; f.key = null; f.headers = null;
  assert.deepEqual(sources(), sourceBefore);
});

test('backend runner captures explicit transport and rejects an invalid batch before native writes', OPTIONS, async t => {
  const before = payerStamp(); let getterCalls = 0;
  await assert.rejects(OPEN(configuration()), { code: RP + 'INVALID_CONFIGURATION' }); f.factoryRefusals++;
  const getter = configuration({ requestImpl });
  Object.defineProperty(getter, 'requestImpl', { enumerable: true, get() { getterCalls++; throw Error('forbidden getter'); } });
  await assert.rejects(OPEN(getter), { code: RP + 'INVALID_CONFIGURATION' }); f.factoryRefusals++;
  const proxy = new Proxy(requestImpl, { apply() { getterCalls++; throw Error('forbidden proxy'); } });
  await assert.rejects(OPEN(configuration({ requestImpl: proxy })), { code: RP + 'INVALID_CONFIGURATION' }); f.factoryRefusals++;
  assert.equal(getterCalls, 0);
  await owned(false, async c => {
    await assert.rejects(c.runOriginals([f.inputs[0], f.inputs[0]]), { code: CP + 'INVALID_INPUT' });
    assert.equal(c.snapshot().runner.runClaimed, false);
    assert.equal(ownerView(c).counts.retainCalls, 0); assert.equal(f.transportCalls, 0);
    read(c, 0, 'CLIENT_ORIGINAL_NOT_RECORDED', 0);
  });
  sameAllRows(before, payerStamp(), 1); assert.equal(f.transportCalls, 0); assert.equal(f.unitCalls, 0);
  diagnostic(t, 'EXPLICIT_TRANSPORT_AND_BATCH_PREFLIGHT');
});
test('backend runner executes two originals sequentially through the actual backend lifecycle', OPTIONS, async t => {
  const before = payerStamp();
  await owned(false, async c => {
    assert.equal(await batch(c, [0, 1]), undefined);
    const v = c.snapshot();
    assert.equal(v.runner.outcome, 'CALLBACKS_COMPLETED'); assert.equal(v.runner.completed, 2);
    assert.equal(v.runner.attempted, 2); assert.equal(v.runner.notAttempted, 0);
    assert.equal(v.runner.queuedReferences, 0); assert.equal(v.runner.closeCalls, 1);
    assert.equal(v.unknown, false); assert.equal(v.connection.closed, true);
    assert.equal(v.connection.client.resource.phase, 'RELEASED');
    assert.equal(v.serviceDelivery, 'NOT_ESTABLISHED'); assert.equal(v.authority, 'NONE');
    assert.deepEqual(f.order, [0, 1]); assert.equal(f.unitCalls, 2);
  });
  const after = payerStamp(); sameFundingSchema(before, after, 1);
  assert.equal(after.originals.length, 2); assert.equal(after.intents.length, 2); retained(after, 0); retained(after, 1);
  for (const i of [0, 1]) assert.equal(f.backend.getRequest(keyOf(f.requests[i])).state, 'SUCCEEDED');
  assert.equal(f.backend.getDurableExecutionSnapshot().executionState.executions.length, 2);
  diagnostic(t, 'ACTUAL_TWO_ORIGINAL_SEQUENTIAL_BATCH');
});
test('backend runner reopens exact recovery data and stops a retained-original batch before transport', OPTIONS, async t => {
  const before = payerStamp(), ledger = f.backend.load();
  await owned(false, async c => {
    for (const i of [0, 1]) {
      const v = read(c, i, 'CACHED_SUCCESS');
      assert.equal(v.backend.cachedResult.resultCode, 'synthetic-service-result');
      assert.equal(v.local.dispatchStatus, 'POSSIBLY_ATTEMPTED');
    }
    await assert.rejects(batch(c, [0, 2]), { code: CP + 'RUN_FAILED' });
    const v = c.snapshot().runner;
    assert.equal(v.failure, 'ENTRY_REJECTED'); assert.equal(v.attempted, 1);
    assert.equal(v.completed, 0); assert.equal(v.notAttempted, 1); assert.equal(v.queuedReferences, 0);
    assert.equal(ownerView(c).counts.retainCalls, 0); assert.equal(rootView(c).client.lastTransport, null);
  });
  sameAllRows(before, payerStamp(), 1); assert.deepEqual(f.backend.load(), ledger);
  assert.equal(f.transportCalls, 2); assert.equal(f.unitCalls, 2);
  diagnostic(t, 'REOPEN_CACHED_DATA_AND_RETAINED_ORIGINAL_FENCE');
});
test('backend runner stops queued work after response loss following an actual backend commit', OPTIONS, async t => {
  const before = payerStamp(); f.mode = 'DROP_AFTER_COMMIT';
  await owned(true, async c => {
    await assert.rejects(batch(c, [2, 3]), { code: CP + 'RUN_FAILED' });
    const v = c.snapshot();
    assert.equal(v.runner.failure, 'ENTRY_REJECTED'); assert.equal(v.runner.attempted, 1);
    assert.equal(v.runner.completed, 0); assert.equal(v.runner.notAttempted, 1);
    assert.equal(v.runner.queuedReferences, 0); assert.equal(v.unknown, true);
    assert.equal(ownerView(c).uncertainty.submission, true);
    assert.equal(rootView(c).client.lastTransport.phase, 'UNKNOWN');
    assert.equal(rootView(c).resource.storeCloseOutcome, 'RETURNED');
  });
  f.mode = 'DELIVER';
  const after = payerStamp(); sameFundingSchema(before, after, 1);
  assert.equal(after.originals.length, 3); assert.equal(after.intents.length, 3);
  for (let i = 0; i < 3; i++) retained(after, i);
  assert.equal(after.originals.some(r => r.request_id === f.requests[3].requestId), false);
  assert.equal(f.backend.getRequest(keyOf(f.requests[2])).state, 'SUCCEEDED');
  assert.equal(f.backend.getRequest(keyOf(f.requests[3])), null);
  assert.equal(f.transportCalls, 3); assert.equal(f.unitCalls, 3);
  diagnostic(t, 'UNKNOWN_FIRST_STOPS_QUEUED_TAIL');
});
test('backend runner keeps the original non-replayable after unknown reopen without attempting the tail', OPTIONS, async t => {
  const before = payerStamp(), ledger = f.backend.load();
  await owned(false, async c => {
    const v = read(c, 2, 'CACHED_SUCCESS');
    assert.equal(v.local.dispatchStatus, 'POSSIBLY_ATTEMPTED'); assert.equal(v.deliveryConfirmed, false);
    assert.equal(v.local.uncertainty.submission, false); // Live flag is NOT a durable transport receipt.
    await assert.rejects(batch(c, [2, 3]), { code: CP + 'RUN_FAILED' });
    assert.equal(c.snapshot().runner.notAttempted, 1); assert.equal(ownerView(c).counts.dispatchCalls, 0);
  });
  sameAllRows(before, payerStamp(), 1); assert.deepEqual(f.backend.load(), ledger);
  assert.equal(f.transportCalls, 3); assert.equal(f.unitCalls, 3);
  diagnostic(t, 'UNKNOWN_REOPEN_RETAINS_ORIGINAL_NO_REPLAY');
});
test('backend runner close drains one active original and fences the queued next request', OPTIONS, async t => {
  const before = payerStamp();
  await owned(false, async c => {
    const deferred = { entered: capability(), result: capability() };
    f.deferred = deferred;
    const operation = batch(c, [3, 4]);
    const observedRun = assert.rejects(operation, { code: CP + 'RUN_FAILED' });
    operation.then(() => undefined, error => { deferred.entered.reject(error); });
    try {
      await deferred.entered.promise;
      const queries = f.queries;
      assert.throws(() => c.readOriginalBackendRecoveryState(keyOf(f.requests[0]), f.headers[0]), { code: RP + 'BUSY' });
      assert.equal(f.queries, queries); assert.equal(c.snapshot().connection.unavailable, false);
      const closing = c.close(); assert.equal(closing, c.close());
      let settled = false; closing.then(() => { settled = true; }, () => { settled = true; });
      assert.equal(c.snapshot().runner.queuedReferences, 0); assert.equal(c.snapshot().runner.notAttempted, 1);
      assert.throws(() => c.readOriginalBackendRecoveryState(keyOf(f.requests[0]), f.headers[0]), { code: RP + 'CLOSED' });
      assert.equal(settled, false);
      deferred.result.resolve({ resultCode: 'synthetic-service-result' });
      await observedRun; assert.equal(await closing, undefined); await Promise.all(f.handlers);
      const v = c.snapshot();
      assert.equal(v.runner.failure, 'CLOSE_REQUESTED'); assert.equal(v.runner.attempted, 1);
      assert.equal(v.runner.completed, 1); assert.equal(v.runner.notAttempted, 1);
      assert.equal(v.runner.closeCalls, 1); assert.equal(v.connection.client.resource.storeCloseAttempts, 1);
      assert.equal(v.unknown, false); assert.equal(v.serviceDelivery, 'NOT_ESTABLISHED');
    } finally {
      // Fence queued-next before releasing a held callback, even if an earlier
      // assertion failed. Observe the original run/close/handler outcomes; this
      // is not a cancellation, native-cleanup or hard-lifetime guarantee.
      const draining = c.close();
      deferred.result.resolve({ resultCode: 'synthetic-service-result' });
      try { await Promise.all([observedRun, draining, ...f.handlers]); }
      finally { f.deferred = null; }
    }
  });
  const after = payerStamp(); sameFundingSchema(before, after, 1);
  assert.equal(after.originals.length, 4); assert.equal(after.intents.length, 4);
  for (let i = 0; i < 4; i++) retained(after, i);
  assert.equal(after.originals.some(r => r.request_id === f.requests[4].requestId), false);
  assert.equal(f.backend.getRequest(keyOf(f.requests[3])).state, 'SUCCEEDED');
  assert.equal(f.backend.getRequest(keyOf(f.requests[4])), null);
  assert.equal(after.epoch, 7);
  assert.equal(f.backend.getDurableExecutionSnapshot().executionState.executions.length, 4);
  assert.deepEqual(f.order, [0, 1, 2, 3]);
  assert.equal(f.transportCalls, 4); assert.equal(f.endCalls, 4); assert.equal(f.unitCalls, 4);
  assert.equal(f.closeFulfilled, 5); assert.equal(f.closeRejectedExpected, 1);
  assert.equal(f.clients.length, 6); assert.equal(f.queries, 3); assert.equal(f.proofs, 5);
  assert.equal(f.timerScheduled, 4); assert.equal(f.timerCancelled, 4);
  diagnostic(t, 'MANUAL_CLOSE_DRAINS_ACTIVE_AND_FENCES_NEXT');
});
