// Current-main SQLite regression for the published close latch.
// One corrected local synthetic case; no SDK, network, signature or chain payment.
// The preceding closed FAILURE keeps its first passed case and genuine second
// failure. That passed case is NOT selected here. Only canonical test-proof
// ordering and the one-case fixture cardinality change; production stays fixed.
// The immutable Oct19 SQLite graph used the previous 15288-byte core; this entry
// binds the published 15749-byte core and real existing-only V2 root instead.
// Same-process reopen and source-bound API close returns are NOT crash,
// native-finalizer, durability, real authority or live-pilot qualification.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { lstatSync, realpathSync, readdirSync, openSync, readSync, fstatSync, closeSync, constants } from 'node:fs';
import { dirname, isAbsolute, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { setTimeout as timer, clearTimeout as cancelTimer } from 'node:timers';

const SELF = fileURLToPath(import.meta.url);
const PREFIX = 'X402_P2_CLOSE_LATCH_';
assert.equal(process.env[PREFIX + 'OPT_IN'], 'reviewed-managed-synthetic-only');
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], SELF);
assert.equal(process.versions.node, '24.19.0');
const NativePromise = Promise, nativeThen = Promise.prototype.then, apply = Reflect.apply;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const identity = s => ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k => String(s[k]));
const repo = resolve(dirname(SELF), '..');
const SPECS = [
  {
    "path": "src/service-credit-custodied-sqlite-http-client.js",
    "bytes": 18540,
    "LF": 511,
    "sha256": "ea16d6ac5ce72d6434c06e98c52c324daf918dd570f15997cdc21e501f677f4e"
  },
  {
    "path": "src/service-credit-custodied-sqlite-sequential-runner.js",
    "bytes": 21467,
    "LF": 510,
    "sha256": "9378a09dfd23c6ad5e093971d16c5aad62c19b5f3cce353bb199f037df64d7e0"
  },
  {
    "path": "src/service-credit-custodied-recovery-observation-collection-core.js",
    "bytes": 8579,
    "LF": 213,
    "sha256": "36b7cece2d436cbfcac5f4299dd6bd30e5eede6ebb2ebe769ae7bf3a6f1a72b4"
  },
  {
    "path": "src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js",
    "bytes": 57459,
    "LF": 1536,
    "sha256": "9c925f241effbfec0bf014ff284e834c4d5679c4ea7224f83a6354cde6cffdaf"
  },
  {
    "path": "src/x402-wire.js",
    "bytes": 39886,
    "LF": 934,
    "sha256": "5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"
  },
  {
    "path": "src/service-credit-pilot-client-plan.js",
    "bytes": 7483,
    "LF": 181,
    "sha256": "73ee3d739de85150039e733234cd0761c228d68de040d1e126902e808a259ac6"
  },
  {
    "path": "src/service-credit-pilot-status-view.js",
    "bytes": 3202,
    "LF": 60,
    "sha256": "cf3822d8b9ec4eb4772452ed1888b96d398fd87c1ead44cd155a5acc1a6b66ed"
  },
  {
    "path": "src/service-credit-custodied-recovery-collection-core.js",
    "bytes": 13794,
    "LF": 306,
    "sha256": "51d06da70ecccd0cf8b38d650367d1ae903ea86010a5ebeadb682af98e4b890b"
  },
  {
    "path": "src/service-credit-http-execute-dispatch.js",
    "bytes": 27034,
    "LF": 770,
    "sha256": "254ba8eef5ea5efb3a1b901be09e9cb33afbc3cfcf63789ca4a23316b6180d1b"
  },
  {
    "path": "src/service-credit-original-request-custody-contract.js",
    "bytes": 14051,
    "LF": 356,
    "sha256": "fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915"
  },
  {
    "path": "src/service-credit-custodied-request-owner.js",
    "bytes": 35073,
    "LF": 938,
    "sha256": "6e7493a4859d48530820e68a4a19a513aad014ffc1048b42965a3ad36ae7c5f7"
  },
  {
    "path": "src/service-credit-custodied-http-client.js",
    "bytes": 10755,
    "LF": 292,
    "sha256": "ddbc54faf4a14d95e6274bc9df27b7b49db251bab67c11b871cfb2f9e78b4f15"
  },
  {
    "path": "src/service-credit-custodied-sequential-runner-core.js",
    "bytes": 15749,
    "LF": 489,
    "sha256": "42b5f7d7f1f8318ff50dd79d1729d93220c51ab95a7449610d44de91916c7914"
  },
  {
    "path": "package.json",
    "bytes": 1413,
    "LF": 40,
    "sha256": "8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"
  }
];
const manifest = JSON.parse(process.env[PREFIX + 'SOURCE_PINS'] || 'null');
assert.ok(Array.isArray(manifest)); assert.equal(manifest.length, SPECS.length + 1);
assert.deepEqual(manifest.map(p => p.path), [...SPECS.map(p => p.path), 'qualification/service-credit-custodied-sqlite-current-close-latch-corrected.behavior.draft.mjs']);
function noLinks(path) {
  for (let at = path;; at = dirname(at)) {
    assert.equal(lstatSync(at).isSymbolicLink(), false);
    if (dirname(at) === at) break;
  }
}
function readPinned(pin) {
  const path = join(repo, pin.path); noLinks(path);
  const before = lstatSync(path, { bigint: true });
  assert.ok(before.isFile()); assert.equal(before.uid, BigInt(process.getuid()));
  assert.equal(before.nlink, 1n); assert.ok(before.size > 0n && before.size <= 65536n);
  assert.deepEqual(identity(before), pin.identity);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes;
  try {
    assert.deepEqual(identity(fstatSync(fd, { bigint: true })), pin.identity);
    bytes = Buffer.alloc(Number(before.size)); let offset = 0;
    while (offset < bytes.length) {
      const got = readSync(fd, bytes, offset, bytes.length - offset, null);
      assert.ok(got > 0); offset += got;
    }
    assert.equal(readSync(fd, Buffer.alloc(1), 0, 1, null), 0);
    assert.deepEqual(identity(fstatSync(fd, { bigint: true })), pin.identity);
  } finally { closeSync(fd); }
  assert.deepEqual(identity(lstatSync(path, { bigint: true })), pin.identity);
  assert.equal(sha(bytes), pin.sha256); assert.equal(bytes.length, pin.bytes);
  assert.equal(bytes.toString('ascii').split('\n').length - 1, pin.LF);
  assert.equal(bytes.includes(0) || /[^\x00-\x7f]/.test(bytes.toString('utf8')), false);
  return bytes;
}
function sourceCheck() {
  for (let i = 0; i < SPECS.length; i++) {
    const spec = SPECS[i], pin = manifest[i];
    for (const k of ['path','bytes','LF','sha256']) assert.equal(pin[k], spec[k]);
    readPinned(pin);
  }
  readPinned(manifest.at(-1));
}
sourceCheck();
const scratch = process.env.SPV_TASK_SCRATCH;
assert.ok(typeof scratch === 'string' && isAbsolute(scratch) && resolve(scratch) === scratch);
noLinks(scratch);
const roots = JSON.parse(process.env[PREFIX + 'ROOTS'] || 'null');
assert.ok(Array.isArray(roots)); assert.equal(roots.length, 1);
function rootCheck(root, empty = false) {
  assert.ok(typeof root.path === 'string' && isAbsolute(root.path) && resolve(root.path) === root.path);
  assert.equal(dirname(root.path), scratch); noLinks(root.path);
  const stat = lstatSync(root.path, { bigint: true });
  assert.ok(stat.isDirectory()); assert.equal(stat.uid, BigInt(process.getuid()));
  assert.equal(stat.mode & 0o7777n, 0o700n);
  assert.deepEqual([String(stat.dev), String(stat.ino)], root.identity);
  if (empty) assert.deepEqual(readdirSync(root.path), []);
}
roots.forEach(r => rootCheck(r, true));

const { DatabaseSync } = await import('node:sqlite');
const { createZenonFundingPayerRecoveryCustodySqliteStoreV2: CREATE_STORE }
  = await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const { openServiceCreditCustodiedSqliteSequentialRunner: OPEN }
  = await import('../src/service-credit-custodied-sqlite-sequential-runner.js');
const { serializeOriginalServiceRequestCustody: SERIALIZE }
  = await import('../src/service-credit-original-request-custody-contract.js');
const wire = await import('../src/x402-wire.js');
const FUNDING = 'https://synthetic.invalid/funding';
const SERVICE = 'https://synthetic.invalid/service-credit/v1/execute';
const GRANT = 'grant.close';
const HASH = 'a'.repeat(64), NETWORK = 'zenon:testnet';
const BODY_DIGEST = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const REPLY = Buffer.from('{"ok":true,"resultCode":"accepted"}', 'utf8');
const CONFIG = { timeout: 5000, concurrency: false };
const fixtures = [];
let activeNative = 0, unknownNative = false, peakNative = 0;
function reserve() {
  assert.equal(unknownNative, false); assert.equal(activeNative, 0);
  activeNative++; peakNative = Math.max(peakNative, activeNative);
}
function returned() { assert.equal(activeNative, 1); activeNative--; }
function hold() { unknownNative = true; }

function observed(promise) {
  const state = { promise, settled: false, result: null, sink: null };
  state.sink = apply(nativeThen, promise, [
    value => { state.settled = true; return state.result = { ok: true, value }; },
    error => { state.settled = true; return state.result = { ok: false, error }; },
  ]);
  return state;
}
function wait(promise) {
  return new NativePromise((yes, no) => {
    const deadline = timer(() => no(new Error('FINITE_WAIT_EXPIRED_NOT_CANCELLATION')), 2000);
    apply(nativeThen, promise, [
      value => { cancelTimer(deadline); yes(value); },
      error => { cancelTimer(deadline); no(error); },
    ]);
  });
}
async function pending(state) {
  await NativePromise.resolve(); await NativePromise.resolve(); await NativePromise.resolve();
  assert.equal(state.settled, false);
}
function policy() { return { policyVersion: 1, maxRequests: 2, serviceResourceUrl: SERVICE }; }
function original(requestId = 'request.one', maxCostUnits = 7) {
  return { grantId: GRANT, requestId, originalRequestJson: JSON.stringify({
    modelVersion: 1, grantId: GRANT, requestId, method: 'POST', routeId: 'service-credit.execute.v1',
    canonicalBodyDigest: BODY_DIGEST, selectedContentType: 'application/json', maxCostUnits,
  }), originalBodyBase64: '', serviceResourceUrl: SERVICE };
}
function submission(requestId = 'request.one', cost = 7) {
  const o = original(requestId, cost);
  const proof = { grantId: GRANT, maxCostUnits: cost, proofVersion: 1,
    publicKey: 'declared-public-key', requestId, signature: 'declared-signature-' + requestId };
  // Required by the actual dispatcher's validateAuthorization canonical JSON.
  assert.deepEqual(Object.keys(proof), ['grantId', 'maxCostUnits', 'proofVersion', 'publicKey', 'requestId', 'signature']);
  return { ...o, authorizationHeader: 'ServiceCredit ' + Buffer.from(JSON.stringify(proof)).toString('base64url') };
}
function key(value = original()) { return { grantId: value.grantId, requestId: value.requestId }; }
function pair() {
  const requirement = { scheme: 'exact', network: NETWORK, asset: 'declared-test-asset', amount: '1',
    payTo: 'declared-test-payee', maxTimeoutSeconds: 30,
    extra: { poc: true, settlement: 'account-block', paymentFlow: 'upfront',
      zenonChain: { version: 1, chainIdentifier: '42', genesisMomentumHash: '1'.repeat(64) } } };
  const paymentRequired = { x402Version: 2, resource: { url: FUNDING }, accepts: [requirement] };
  const payload = { x402Version: 2, resource: { url: FUNDING }, accepted: requirement,
    payload: { transaction: { hash: HASH }, intentDigest: '2'.repeat(64) } };
  return { challenge: { status: 'PAYMENT_REQUIRED', resourceUrl: FUNDING, paymentRequired,
    paymentRequiredHeader: wire.encodeB64Json(paymentRequired, { maxEncodedBytes: 8192 }) },
    paymentSignatureHeader: wire.encodeB64Json(payload, { maxEncodedBytes: 8192 }) };
}
class Emitter {
  listeners = new Map(); fixtureClosed = false;
  on(event, fn) { const list = this.listeners.get(event) || []; list.push(fn); this.listeners.set(event, list); return this; }
  emit(event, ...args) { for (const fn of (this.listeners.get(event) || []).slice()) fn(...args); }
  forceClose() { if (!this.fixtureClosed) { this.fixtureClosed = true; this.emit('close'); } }
}
class Handle extends Emitter {
  destroyCalls = 0; endCalls = 0; writeCalls = 0;
  destroy(...args) { assert.equal(args.length, 0); this.destroyCalls++; return this; }
  end(...args) { assert.equal(args.length, 0); this.endCalls++; return this; }
  write() { this.writeCalls++; throw new Error('BODY_WRITE_FORBIDDEN'); }
}
function fixture(index) {
  assert.equal(fixtures.length, index); assert.equal(activeNative, 0); assert.equal(unknownNative, false);
  const root = roots[index]; rootCheck(root, true);
  const f = { root, path: join(root.path, 'custody.sqlite'), owners: [], exchanges: [], calls: [],
    rawOpens: 0, rawCloses: 0, seedOpens: 0, seedCloses: 0, ownedOpens: 0, ownedCloses: 0 };
  f.requestImpl = function requestImpl(url, options, onResponse) {
    assert.equal(this, undefined); assert.equal(arguments.length, 3); assert.equal(url, SERVICE);
    assert.equal(f.exchanges.length, 0, 'no queued or replay dispatch');
    f.calls.push({ url, options });
    const request = new Handle(), response = new Handle();
    response.statusCode = 200; response.complete = false;
    response.rawHeaders = ['Cache-Control', 'private, no-store, max-age=0',
      'Content-Type', 'application/json', 'Vary', 'Authorization', 'X-Content-Type-Options', 'nosniff',
      'Content-Length', String(REPLY.length)];
    const exchange = { request, response, onResponse }; f.exchanges.push(exchange); return request;
  };
  fixtures.push(f); return f;
}
function checkedFile(f) {
  rootCheck(f.root);
  const stat = lstatSync(f.path, { bigint: true });
  assert.ok(stat.isFile()); assert.equal(stat.isSymbolicLink(), false);
  assert.equal(stat.uid, BigInt(process.getuid())); assert.equal(stat.nlink, 1n);
  assert.equal(stat.mode & 0o7777n, 0o600n); assert.ok(stat.size > 0n && stat.size <= 2097152n);
  assert.equal(realpathSync(f.path), f.path);
  assert.deepEqual(readdirSync(f.root.path), ['custody.sqlite'], 'all native sidecars must be absent after known closes');
  return stat;
}
function raw(f) {
  checkedFile(f); reserve(); let db = null;
  try {
    db = new DatabaseSync(f.path, { readOnly: true, enableForeignKeyConstraints: true,
      enableDoubleQuotedStringLiterals: false, allowExtension: false }); f.rawOpens++;
    return {
      sqliteVersion: db.prepare('SELECT sqlite_version() AS version').get().version,
      version: db.prepare('PRAGMA user_version').get().user_version,
      schema: db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all(),
      meta: db.prepare('SELECT * FROM payer_recovery_meta').all(),
      funding: db.prepare('SELECT * FROM payer_recovery_state').all(),
      policy: db.prepare('SELECT * FROM original_request_custody_policy').all(),
      originals: db.prepare('SELECT * FROM original_service_requests ORDER BY grant_id,request_id LIMIT 3').all(),
    };
  } catch (error) { if (db === null) hold(); throw error; }
  finally {
    if (db !== null) {
      try { db.close(); f.rawCloses++; returned(); }
      catch (error) { hold(); throw error; }
    }
  }
}
function seed(f, originals = []) {
  assert.equal(originals.length <= 1, true); reserve(); let store = null;
  try {
    store = CREATE_STORE({ databasePath: f.path, allowedRoot: f.root.path, resourceUrl: FUNDING, custodyPolicy: policy() });
    f.seedOpens++;
    // LOCAL declared synthetic SQLite state; never a chain PREPARE or payment.
    store.prepare(pair()); store.fenceAttempt('PREPARED'); store.finishAttempt('BOUND');
    for (const o of originals) store.retainOriginalRequest(o);
    f.funding = store.load(); assert.equal(f.funding.status, 'BOUND');
  } catch (error) { if (store === null) hold(); throw error; }
  finally {
    if (store !== null) {
      try { store.close(); f.seedCloses++; returned(); }
      catch (error) { hold(); throw error; }
    }
  }
  f.baseline = raw(f); assert.equal(f.baseline.version, 2); assert.equal(f.baseline.meta[0].owner_epoch, 1);
  assert.equal(f.baseline.originals.length, originals.length);
}
async function open(f) {
  reserve(); let root;
  try {
    root = await OPEN({ databasePath: f.path, allowedRoot: f.root.path, fundingResourceUrl: FUNDING,
      custodyPolicy: policy(), selectedGrantId: GRANT, requestImpl: f.requestImpl, deadlineMs: 2000 });
  } catch (error) { hold(); throw error; }
  f.ownedOpens++;
  const entry = { root, closing: null, released: false }; f.owners.push(entry);
  return entry;
}
function close(entry) {
  if (entry.closing === null) entry.closing = observed(entry.root.close());
  return entry.closing;
}
async function finish(f, entry) {
  const state = close(entry), result = await wait(state.sink), view = entry.root.snapshot();
  const known = view.resource.storeCloseAttempts === 1 && view.resource.storeCloseOutcome === 'RETURNED'
    && view.resource.phase === 'RELEASED' && view.resource.slotHeld === false;
  if (!known) { hold(); throw new Error('OWNED_DB_CLOSE_NOT_KNOWN'); }
  if (!entry.released) { entry.released = true; f.ownedCloses++; returned(); }
  assert.equal(result.ok, true); assert.equal(result.value, undefined);
  assert.strictEqual(entry.root.close(), state.promise);
  assert.equal(view.runner.closeCalls, 1); assert.equal(view.runner.closeOutcome, 'FULFILLED');
  assert.equal(view.close.outcome, 'DRAINED'); assert.equal(view.unknownUndrained, false);
  return view;
}
function assertRows(f, snapshot, originals, epoch) {
  assert.equal(snapshot.sqliteVersion, f.baseline.sqliteVersion);
  assert.equal(snapshot.version, 2); assert.deepEqual(snapshot.schema, f.baseline.schema);
  assert.deepEqual(snapshot.funding, f.baseline.funding); assert.deepEqual(snapshot.policy, f.baseline.policy);
  assert.equal(snapshot.meta.length, 1); assert.equal(snapshot.meta[0].resource_url, FUNDING);
  assert.equal(snapshot.meta[0].owner_epoch, epoch); assert.equal(snapshot.originals.length, originals.length);
  for (const o of originals) {
    const row = snapshot.originals.find(r => r.grant_id === o.grantId && r.request_id === o.requestId); assert.ok(row);
    const saved = JSON.parse(row.envelope);
    assert.equal(saved.originalRequestJson, o.originalRequestJson);
    assert.equal(saved.originalBodyBase64, ''); assert.equal(saved.paymentHash, HASH);
    assert.equal(saved.network, NETWORK); assert.equal(saved.serviceResourceUrl, SERVICE);
    assert.equal(SERIALIZE(saved), row.envelope);
    assert.equal(row.envelope.includes('ServiceCredit '), false);
    assert.equal(row.envelope.includes('declared-signature'), false);
  }
}
function redacted(f, view) {
  const text = JSON.stringify(view);
  for (const value of [f.path, f.root.path, FUNDING, SERVICE, HASH, GRANT, 'ServiceCredit ', 'declared-signature'])
    assert.equal(text.includes(value), false);
  assert.equal(view.qualification, 'UNQUALIFIED'); assert.equal(view.serviceDelivery, 'NOT_ESTABLISHED');
  assert.equal(view.currentAuthority, 'NOT_ESTABLISHED'); assert.equal(view.restart, 'NOT_ESTABLISHED');
}
async function cleanup(f) {
  for (const x of f.exchanges) { x.request.forceClose(); x.response.forceClose(); }
  for (const entry of f.owners) if (!entry.released) await finish(f, entry);
  assert.equal(activeNative, 0); assert.equal(unknownNative, false);
  checkedFile(f);
}
function diagnostic(t, f, final) {
  const logical = { schema: final.schema, funding: final.funding, policy: final.policy, originals: final.originals };
  t.diagnostic(JSON.stringify({ kind: 'CURRENT_SQLITE_CLOSE_LATCH', version: 1,
    sourceBound: true, seedOpens: f.seedOpens, seedCloses: f.seedCloses, rawOpens: f.rawOpens, rawCloses: f.rawCloses,
    ownedOpens: f.ownedOpens, ownedCloses: f.ownedCloses, activeNative, unknownNative, peakNative,
    requestCalls: f.calls.length, originalRows: final.originals.length, ownerEpoch: final.meta[0].owner_epoch,
    semanticRowsSha256: sha(Buffer.from(JSON.stringify(logical))), nativeInterception: false,
    sqliteVersion: final.sqliteVersion,
    sameProcessOnly: true, serviceDelivery: 'NOT_ESTABLISHED', authority: 'NONE' }));
}

test('current SQLite close latch fences the queued original until captured drain then reopens exact custody without replay', CONFIG, async t => {
  const f = fixture(0); t.after(() => cleanup(f)); seed(f);
  const entry = await open(f), batch = [submission(), submission('request.two', 8)];
  const running = observed(entry.root.runOriginals(batch)); assert.equal(f.exchanges.length, 1);
  const x = f.exchanges[0]; x.onResponse(x.response);
  const closing = close(entry); assert.strictEqual(entry.root.close(), closing.promise);
  let view = entry.root.snapshot();
  assert.equal(view.runner.closed, true); assert.equal(view.runner.queuedReferences, 0);
  assert.equal(view.runner.closeCalls, 1); assert.equal(view.resource.storeCloseAttempts, 0);
  assert.strictEqual(entry.root.runOriginals(batch), running.promise);
  await assert.rejects(entry.root.runOriginals([submission('request.other')]),
    { code: 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_ALREADY_RUN' });
  x.response.complete = true; x.response.emit('data', Buffer.from(REPLY)); x.response.emit('end');
  x.request.forceClose(); await pending(closing); await pending(running);
  assert.equal(entry.root.snapshot().resource.storeCloseAttempts, 0);
  assert.equal(f.calls.length, 1); x.response.forceClose();
  view = await finish(f, entry);
  const failed = await wait(running.sink); assert.equal(failed.ok, false);
  assert.equal(failed.error.code, 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_RUN_FAILED');
  assert.equal(view.runner.failure, 'CLOSE_REQUESTED'); assert.equal(view.runner.planned, 2);
  assert.equal(view.runner.attempted, 1); assert.equal(view.runner.completed, 1); assert.equal(view.runner.notAttempted, 1);
  assert.equal(view.unknown, false); redacted(f, view);
  const first = raw(f); assertRows(f, first, [original()], 2); const retained = first.originals[0].envelope;
  const second = await open(f); assert.equal(SERIALIZE(second.root.readOriginal(key())), retained);
  const replay = observed(second.root.runOriginals([submission()]));
  const refusal = await wait(replay.sink); assert.equal(refusal.ok, false);
  assert.equal(refusal.error.code, 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_RUN_FAILED');
  await finish(f, second); assert.equal(f.calls.length, 1);
  const final = raw(f); assertRows(f, final, [original()], 3);
  assert.equal(final.originals[0].envelope, retained);
  assert.equal(second.root.snapshot().runner.client.owner.counts.dispatchCalls, 0);
  diagnostic(t, f, final);
});

after(() => {
  assert.equal(fixtures.length, 1); assert.equal(activeNative, 0); assert.equal(unknownNative, false);
  assert.equal(peakNative, 1); sourceCheck();
});
