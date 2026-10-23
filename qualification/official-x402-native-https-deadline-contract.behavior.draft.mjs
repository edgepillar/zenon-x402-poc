// Network-free regression for the planned native fixture's deadline DATA.
// Reading the native fixture as text does not parse or execute that program.
// No native factory, official SDK, socket, TLS, SQL, key or signature is used.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { lstatSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createServiceCreditBoundedHttpsIngressOwner as LEGACY,
  createServiceCreditBoundedHttpsIngressOwnerForOfficialX402 as OFFICIAL,
} from '../src/service-credit-bounded-https-ingress-owner.js';

const SELF = fileURLToPath(import.meta.url), REPO = resolve(dirname(SELF), '..');
const ENTRY = 'qualification/official-x402-native-https-deadline-contract.behavior.draft.mjs';
const DATA = 'qualification/official-x402-native-https-pending.behavior.draft.mjs';
const LABELS = ['package.json', 'src/x402-official-https-request-binding.js',
  'src/service-credit-bounded-https-ingress-owner.js', DATA, ENTRY];
assert.equal(process.versions.node, '24.19.0'); assert.equal(process.argv.length, 2);
assert.equal(process.argv[1], SELF);
assert.equal(process.env.X402_NATIVE_DEADLINE_OPT_IN, 'dormant-source-bound-deadlines-only');
const PINS = JSON.parse(process.env.X402_NATIVE_DEADLINE_PINS);
const ids = s => ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k => String(s[k]));
function sources() {
  assert.equal(PINS.length, 5); assert.deepEqual(PINS.map(p => p.path), LABELS);
  let total = 0, fixtureText = null;
  const rows = PINS.map(p => {
    const filename = join(REPO, p.path), s = lstatSync(filename, { bigint: true });
    assert.ok(s.isFile() && !s.isSymbolicLink()); assert.equal(s.uid, BigInt(process.getuid()));
    assert.equal(s.nlink, 1n); assert.deepEqual(ids(s), p.identity); assert.ok(s.size <= 262144n);
    const fd = openSync(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
    const raw = Buffer.alloc(Number(s.size) + 1); let used = 0;
    try {
      assert.deepEqual(ids(fstatSync(fd, { bigint: true })), p.identity);
      while (used < raw.length) { const n = readSync(fd, raw, used, raw.length - used, null); if (!n) break; used += n; }
      assert.deepEqual(ids(fstatSync(fd, { bigint: true })), p.identity);
    } finally { closeSync(fd); }
    assert.deepEqual(ids(lstatSync(filename, { bigint: true })), p.identity);
    assert.equal(used, Number(s.size)); const bytes = raw.subarray(0, used);
    total += used; assert.ok(total <= 262144);
    assert.equal(used, p.bytes); assert.equal(bytes.filter(c => c === 10).length, p.LF);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), p.sha256);
    if (p.path === DATA) fixtureText = bytes.toString('utf8');
    return { path: p.path, bytes: p.bytes, sha256: p.sha256, identity: p.identity };
  });
  return { rows, fixtureText };
}
const BEFORE = sources(), freeze = Object.freeze, OPTIONS = { timeout: 5000, concurrency: false };
const KEYS = ['maxHeaderBytes','maxHeaderCount','maxConcurrentSockets','maxConnectionStarts',
  'maxConcurrentRequests','maxRequestStarts','tlsHandshakeDeadlineMs','headerDeadlineMs',
  'requestResponseDeadlineMs','idleSocketDeadlineMs','startDeadlineMs','closeGraceMs','metricsCounterLimit'];
const dataLimits = {};
for (const key of KEYS) {
  // Only bounded numeric literals from the pinned text, never eval, a JS parser,
  // imported native-fixture code or a copied native factory.
  const matches = [...BEFORE.fixtureText.matchAll(new RegExp('\\b' + key + ': ([0-9]{1,16})\\b', 'g'))];
  assert.equal(matches.length, 1); dataLimits[key] = Number(matches[0][1]);
  assert.ok(Number.isSafeInteger(dataLimits[key]));
}
freeze(dataLimits);
let factories = 0, handles = 0, closes = 0, nextTimer = 0;
const timers = new Set(), owners = [];
const deadlines = freeze({
  schedule: freeze(() => { const token = freeze({ id: ++nextTimer }); timers.add(token); return token; }),
  cancel: freeze(token => timers.delete(token)),
});
function configuration(limits) {
  return {
    origin: 'https://127.0.0.1:44447',
    requestTargets: freeze(['/paid', '/service-credit/v1/execute']),
    generation: freeze({ generationId: 'deadline.contract', generationVersion: 1 }),
    limits: freeze({ ...limits }),
    downstream: freeze({
      handle: freeze(() => { handles++; throw Error('NO_NATIVE_REQUEST'); }),
      close: freeze(done => { closes++; done.success(); }),
    }),
    deadlineRuntime: deadlines,
    httpsServerFactory: freeze(() => { factories++; throw Error('NO_NATIVE_FACTORY'); }),
  };
}
async function dormant(factory, limits) {
  const owner = factory(configuration(limits)); owners.push(owner);
  assert.equal(owner.snapshotMetrics().phase, 'DORMANT');
  const closing = owner.close(); assert.equal(owner.close(), closing); await closing;
  const metrics = owner.snapshotMetrics(); assert.equal(metrics.phase, 'CLOSED');
  for (const key of ['trackedSockets','trackedRequests','trackedHandlers','ownedTimers']) assert.equal(metrics[key], 0);
}
test('source-bound native fixture deadlines construct dormant and close without native authority', OPTIONS, async () => {
  assert.equal(dataLimits.requestResponseDeadlineMs, 2000); assert.equal(dataLimits.closeGraceMs, 3000);
  for (const factory of [LEGACY, OFFICIAL]) await dormant(factory, dataLimits);
  assert.equal(factories, 0); assert.equal(handles, 0); assert.equal(closes, 2); assert.equal(timers.size, 0);
});
test('shorter close grace is refused before any listener downstream or deadline call', OPTIONS, () => {
  const before = { factories, handles, closes, nextTimer };
  for (const factory of [LEGACY, OFFICIAL])
    assert.throws(() => factory(configuration({ ...dataLimits, closeGraceMs: 1000 })),
      { code: 'SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_OWNER_INVALID_CONFIGURATION' });
  assert.deepEqual({ factories, handles, closes, nextTimer }, before);
  assert.equal(timers.size, 0);
});
test('equal request and close deadlines preserve the existing accepted boundary', OPTIONS, async () => {
  for (const factory of [LEGACY, OFFICIAL])
    await dormant(factory, { ...dataLimits, closeGraceMs: dataLimits.requestResponseDeadlineMs });
  assert.equal(factories, 0); assert.equal(handles, 0); assert.equal(closes, 4); assert.equal(timers.size, 0);
});
after(async () => {
  for (const owner of owners) await owner.close();
  assert.deepEqual(sources(), BEFORE);
  console.log('# ' + JSON.stringify({ kind: 'OFFICIAL_X402_NATIVE_DEADLINE_DORMANT_CONTRACT',
    version: 1, selectedCases: 3, nativeFixtureReadAsTextOnly: true, nativeFixtureParsedOrExecuted: false,
    intendedRequestDeadlineMs: 2000, intendedCloseGraceMs: 3000, rejectedCloseGraceMs: 1000,
    dormantOwnersClosed: 4, nativeFactoryCalls: factories, requestCalls: handles,
    actualOfficialSdk: false, nativeSockets: 0, tls: false, SQL: 0, keys: 0, signatures: 0,
    fullP1: 'NOT_ESTABLISHED', nativeHttpsQualification: 'NOT_ESTABLISHED' }));
});

