// Selected SDK/SQL/socket-free close-owner cases. No actual native transport,
// TLS, SQLite, SDK, wallet/capability key, signer, nonce or application timer.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTRY = 'qualification/service-credit-native-client-close-owner.behavior.draft.mjs';
const SPECS = [
  {
    "path": "package.json",
    "bytes": 2677,
    "LF": 40,
    "sha256": "cb4364b57d7918682d68dd00b10a5c35c26ec6af2118a0d70353df2f3324c65f"
  },
  {
    "path": "src/service-credit-native-client-close-owner.js",
    "bytes": 7170,
    "LF": 149,
    "sha256": "00366016a37cf71234cb305e860b5d3f406c97f6b6a7af8569ae76726b759c91"
  }
];
const SELF = fileURLToPath(import.meta.url), REPO = resolve(dirname(SELF), '..');
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], SELF);
assert.equal(process.versions.node, '24.19.0'); assert.equal(process.platform, 'darwin');
assert.equal(process.arch, 'arm64'); assert.equal(process.env.X402_CLOSE_CORE_OPT_IN, 'sdk-sql-socket-free-close-core-only');
const PINS = JSON.parse(process.env.X402_CLOSE_CORE_PINS);
const sha = b => createHash('sha256').update(b).digest('hex');
const ids = s => ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k => String(s[k]));
function sources() {
  assert.equal(PINS.length, 3);
  assert.deepEqual(PINS.map(p => p.path), [...SPECS.map(p => p.path), ENTRY]);
  return PINS.map((p, index) => {
    const path = join(REPO, p.path), before = lstatSync(path, { bigint: true });
    assert.ok(before.isFile() && !before.isSymbolicLink()); assert.equal(before.nlink, 1n);
    assert.equal(before.uid, BigInt(process.getuid())); assert.deepEqual(ids(before), p.identity);
    const raw = readFileSync(path); assert.equal(raw.length, p.bytes); assert.equal(sha(raw), p.sha256);
    assert.equal(raw.filter(c => c === 10).length, p.LF);
    assert.deepEqual(ids(lstatSync(path, { bigint: true })), p.identity);
    if (index < SPECS.length) for (const k of ['path','bytes','LF','sha256']) assert.equal(p[k], SPECS[index][k]);
    return [p.path, p.bytes, p.sha256, p.identity];
  });
}
const before = sources();
const { createNativeHttpsClientCloseOwner: CREATE } = await import('../src/service-credit-native-client-close-owner.js');
const freeze = Object.freeze, CLOSE_UNKNOWN = 'service_credit_native_https_client_close_unknown';
const INPUT = 'service_credit_native_client_close_input_rejected';
const ZERO = { requests: 0, sockets: 0, timers: 0 };
let constructed = 0;
function fixture(counts = ZERO) {
  const f = { counts: { ...counts }, reads: 0, releases: 0, readOverride: null, releaseOverride: null, owner: null };
  const config = {
    readObservedCounts() { f.reads++; return f.readOverride === null ? freeze({ ...f.counts }) : f.readOverride(); },
    releaseLocalMaterial() { f.releases++; return f.releaseOverride === null ? undefined : f.releaseOverride(); },
  };
  f.config = config; f.owner = CREATE(config); constructed++; return f;
}
const fails = promise => assert.rejects(promise, { code: CLOSE_UNKNOWN });
function assertUnknown(f, released) {
  const s = f.owner.snapshot();
  assert.equal(s.phase, 'CLOSE_UNKNOWN'); assert.equal(s.unknown, true);
  assert.equal(s.closePromiseOutcome, 'CLOSE_UNKNOWN');
  assert.equal(s.localMaterialRelease.attempts, released ? 1 : 0);
}
test('close construction is inert and has no native effects', () => {
  const f = fixture(); assert.equal(f.reads, 0); assert.equal(f.releases, 0);
  const s = f.owner.snapshot();
  assert.equal(s.phase, 'OPEN'); assert.equal(s.closeRequested, false);
  assert.equal(s.nativeIoPerformed, false); assert.equal(s.authority, 'NONE');
  assert.equal(s.osPhysicalDrain, 'NOT_ESTABLISHED');
});
test('beginClose caches before any trusted callback or observation', async () => {
  const f = fixture(), p = f.owner.beginClose();
  assert.equal(f.owner.beginClose(), p); assert.equal(f.reads, 0); assert.equal(f.releases, 0);
  assert.equal(f.owner.snapshot().phase, 'CLOSING'); f.owner.observe(); await p;
});
test('zero actual observations return the frozen legacy clean receipt once', async () => {
  const f = fixture(), p = f.owner.beginClose(); f.owner.observe(); const result = await p;
  assert.deepEqual(result, { phase: 'CLOSED', trackedRequests: 0, trackedSockets: 0, ownedTimers: 0,
    serviceDelivery: 'NOT_ESTABLISHED' });
  assert.ok(Object.isFrozen(result)); assert.equal(f.releases, 1); assert.equal(f.reads, 2);
  for (let i = 0; i < 8; i++) f.owner.observe();
  assert.equal(f.releases, 1); assert.equal(f.owner.beginClose(), p);
  assert.equal(f.owner.snapshot().phase, 'CLOSED');
});
for (const field of ['requests','sockets','timers']) {
  test('a remaining ' + field + ' observation fences local material release', async () => {
    const f = fixture({ ...ZERO, [field]: 1 }), p = f.owner.beginClose();
    f.owner.observe(); assert.equal(f.releases, 0);
    assert.equal(f.owner.snapshot().closePromiseOutcome, 'PENDING');
    f.counts[field] = 0; f.owner.observe(); await p; assert.equal(f.releases, 1);
  });
}
test('preexisting UNKNOWN is not repaired by a zero-count close', async () => {
  const f = fixture(); f.owner.markUnknown(); const p = f.owner.beginClose(), failed = fails(p);
  f.owner.observe(); await failed; assertUnknown(f, true);
  assert.equal(f.owner.snapshot().localMaterialRelease.outcome, 'RETURNED');
});
test('a grace deadline cannot create an unrequested close', () => {
  const f = fixture(); assert.throws(() => f.owner.deadlineExpired(), {
    code: 'service_credit_native_client_close_close_not_requested' });
  assert.equal(f.owner.snapshot().phase, 'OPEN'); assert.equal(f.reads, 0);
});
test('deadline UNKNOWN settles promptly while late native observations can release once', async () => {
  const f = fixture({ requests: 1, sockets: 1, timers: 0 }), p = f.owner.beginClose(), failed = fails(p);
  f.owner.deadlineExpired(); await failed; assertUnknown(f, false); assert.equal(f.releases, 0);
  f.counts.requests = 0; f.owner.observe(); assert.equal(f.releases, 0);
  f.counts.sockets = 0; f.owner.observe(); assert.equal(f.releases, 1);
  assertUnknown(f, true); assert.equal(f.owner.snapshot().quiescenceObserved, true);
  assert.equal(f.owner.snapshot().localMaterialRelease.outcome, 'RETURNED');
  assert.equal(f.owner.beginClose(), p); await fails(p);
});
test('repeated deadlines never retry release or heal the cached rejection', async () => {
  const f = fixture({ ...ZERO, timers: 1 }), p = f.owner.beginClose(), failed = fails(p);
  f.owner.deadlineExpired(); await failed; f.counts.timers = 0; f.owner.observe();
  for (let i = 0; i < 8; i++) f.owner.deadlineExpired();
  assert.equal(f.releases, 1); assertUnknown(f, true); await fails(p);
});
test('an observation failure can later clean up but never become CLOSED', async () => {
  const f = fixture(); f.readOverride = () => { throw Error('DECLARED_READ_FAILURE'); };
  const p = f.owner.beginClose(), failed = fails(p); f.owner.observe(); await failed;
  assertUnknown(f, false); assert.equal(f.owner.snapshot().lastObservedCounts, null);
  f.readOverride = null; f.owner.observe(); assertUnknown(f, true); assert.equal(f.releases, 1);
});
test('proxy count records are rejected without invoking their traps', async () => {
  const f = fixture(); let traps = 0;
  f.readOverride = () => new Proxy({}, { ownKeys() { traps++; throw Error('TRAP'); },
    getPrototypeOf() { traps++; throw Error('TRAP'); } });
  const p = f.owner.beginClose(), failed = fails(p); f.owner.observe(); await failed;
  assert.equal(traps, 0); assertUnknown(f, false);
});
test('count getters are rejected without invocation', async () => {
  const f = fixture(); let gets = 0; const value = { sockets: 0, timers: 0 };
  Object.defineProperty(value, 'requests', { enumerable: true, get() { gets++; return 0; } });
  f.readOverride = () => freeze(value);
  const p = f.owner.beginClose(), failed = fails(p); f.owner.observe(); await failed;
  assert.equal(gets, 0); assertUnknown(f, false);
});
test('unfrozen observations cannot establish quiescence', async () => {
  const f = fixture(); f.readOverride = () => ({ ...ZERO });
  const p = f.owner.beginClose(), failed = fails(p); f.owner.observe(); await failed; assertUnknown(f, false);
});
test('invalid count numbers are never interpreted as clean observations', async () => {
  for (const bad of [-1, -0, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '0', 0n]) {
    const f = fixture(); f.readOverride = () => freeze({ ...ZERO, requests: bad });
    const p = f.owner.beginClose(), failed = fails(p); f.owner.observe(); await failed;
    assertUnknown(f, false); assert.equal(f.releases, 0);
  }
});
test('release exceptions stay UNKNOWN and are never retried', async () => {
  const f = fixture(); f.releaseOverride = () => { throw Error('DECLARED_RELEASE_FAILURE'); };
  const p = f.owner.beginClose(), failed = fails(p); f.owner.observe(); await failed;
  for (let i = 0; i < 8; i++) f.owner.observe();
  assert.equal(f.releases, 1); assertUnknown(f, true);
  assert.equal(f.owner.snapshot().localMaterialRelease.outcome, 'UNKNOWN');
});
test('non-void release results are rejected without thenable assimilation', async () => {
  let thenGets = 0; const thenable = {};
  Object.defineProperty(thenable, 'then', { get() { thenGets++; throw Error('TRAP'); } });
  for (const result of [true, 0, null, {}, Promise.resolve(), thenable]) {
    const f = fixture(); f.releaseOverride = () => result;
    const p = f.owner.beginClose(), failed = fails(p); f.owner.observe(); await failed; f.owner.observe();
    assertUnknown(f, true); assert.equal(f.releases, 1);
    assert.equal(f.owner.snapshot().localMaterialRelease.outcome, 'UNKNOWN');
  }
  assert.equal(thenGets, 0);
});
test('release reentrancy cannot duplicate cleanup or produce a clean verdict', async () => {
  const f = fixture(); f.releaseOverride = () => { f.owner.observe(); };
  const p = f.owner.beginClose(), failed = fails(p); f.owner.observe(); await failed;
  assert.equal(f.releases, 1); assertUnknown(f, true);
  assert.equal(f.owner.snapshot().localMaterialRelease.outcome, 'RETURNED');
});
test('read reentrancy remains bounded and preserves UNKNOWN', async () => {
  const f = fixture(); let once = false;
  f.readOverride = () => { if (!once) { once = true; f.owner.observe(); } return freeze({ ...ZERO }); };
  const p = f.owner.beginClose(), failed = fails(p); f.owner.observe(); await failed;
  assert.equal(f.reads, 2); assert.equal(f.releases, 1); assertUnknown(f, true);
});
test('UNKNOWN discovered during release is not overwritten by its return', async () => {
  const f = fixture(); f.releaseOverride = () => { f.owner.markUnknown(); };
  const p = f.owner.beginClose(), failed = fails(p); f.owner.observe(); await failed; assertUnknown(f, true);
});
test('new observed work after release remains uncertain without a second release', async () => {
  const f = fixture(); f.releaseOverride = () => { f.counts.sockets = 1; };
  const p = f.owner.beginClose(), failed = fails(p); f.owner.observe(); await failed;
  assert.equal(f.owner.snapshot().quiescenceObserved, false);
  f.counts.sockets = 0; f.owner.observe(); assert.equal(f.releases, 1); assertUnknown(f, true);
});
test('mutating configuration cannot replace the privately captured capabilities', async () => {
  const f = fixture();
  f.config.readObservedCounts = () => { throw Error('REPLACED_READ'); };
  f.config.releaseLocalMaterial = () => { throw Error('REPLACED_RELEASE'); };
  const p = f.owner.beginClose(); f.owner.observe(); await p; assert.equal(f.releases, 1);
});
test('late UNKNOWN downgrades current state without rewriting historical settlement', async () => {
  const f = fixture(), p = f.owner.beginClose(); f.owner.observe(); const receipt = await p;
  f.owner.markUnknown();
  const view = f.owner.snapshot();
  assert.equal(view.phase, 'CLOSE_UNKNOWN'); assert.equal(view.unknown, true);
  assert.equal(view.closePromiseOutcome, 'CLOSED'); assert.equal(await p, receipt);
  f.owner.observe(); assert.equal(f.owner.snapshot().phase, 'CLOSE_UNKNOWN'); assert.equal(f.releases, 1);
});
test('a cancelled grace callback after a clean settlement is inert', async () => {
  const f = fixture(), p = f.owner.beginClose(); f.owner.observe(); await p;
  const before = f.owner.snapshot(); f.owner.deadlineExpired(); assert.deepEqual(f.owner.snapshot(), before);
});
test('invalid method arities do not consume close or invoke callbacks', async () => {
  const f = fixture();
  for (const method of Object.values(f.owner)) assert.throws(() => method(1), { code: INPUT });
  assert.equal(f.reads, 0); assert.equal(f.releases, 0); assert.equal(f.owner.snapshot().phase, 'OPEN');
  const p = f.owner.beginClose(); f.owner.observe(); await p;
});
test('configuration accessors and proxies are rejected without invocation', () => {
  let calls = 0;
  const proxy = new Proxy({}, { ownKeys() { calls++; throw Error('TRAP'); } });
  assert.throws(() => CREATE(proxy), { code: INPUT });
  const getter = { releaseLocalMaterial() {} };
  Object.defineProperty(getter, 'readObservedCounts', { enumerable: true, get() { calls++; return () => ZERO; } });
  assert.throws(() => CREATE(getter), { code: INPUT }); assert.equal(calls, 0);
  for (const bad of [null, [], Object.create(null), {}, { readObservedCounts: true, releaseLocalMaterial() {} }])
    assert.throws(() => CREATE(bad), { code: INPUT });
});
test('snapshots are frozen observations and expose no retained callback data', async () => {
  const f = fixture(), secret = 'DECLARED_PRIVATE_MATERIAL_NOT_FOR_SNAPSHOTS';
  f.config.readObservedCounts.secret = secret;
  const p = f.owner.beginClose(); f.owner.observe(); await p;
  const snapshot = f.owner.snapshot();
  assert.ok(Object.isFrozen(snapshot)); assert.ok(Object.isFrozen(snapshot.lastObservedCounts));
  assert.ok(Object.isFrozen(snapshot.localMaterialRelease)); assert.equal(JSON.stringify(snapshot).includes(secret), false);
  assert.equal(snapshot.serviceDelivery, 'NOT_ESTABLISHED'); assert.equal(snapshot.nativeIoPerformed, false);
});
after(() => {
  assert.deepEqual(sources(), before);
  console.log('# close-core-scope ' + JSON.stringify({ kind: 'SDK_SQL_SOCKET_FREE_CLOSE_OWNER',
    sourceInputs: before.length, constructedOwners: constructed, actualNativeTransportImports: 0,
    applicationTimers: 0, sockets: 0, SQLiteConnections: 0, SDK: 0, keyGeneration: 0,
    signing: 0, nonceSearch: 0, newScratch: 0, NodeChildren: 0, fullP1: 'NOT_ESTABLISHED' }));
});

