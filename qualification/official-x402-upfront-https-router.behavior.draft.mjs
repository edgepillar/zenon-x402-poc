// Current declared-callable router and constructor contracts only.
// No official SDK, native HTTPS/TLS/socket, SQLite, key, signature or payment.
// These ten cases do NOT qualify the application factory or full P1 flow.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { lstatSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOfficialUpfrontServiceCreditHttpsRouter as ROUTER }
  from '../src/x402-official-upfront-https-router.js';
import {
  createServiceCreditBoundedHttpsIngressOwner as LEGACY,
  createServiceCreditBoundedHttpsIngressOwnerForOfficialX402 as OFFICIAL_PROFILE,
} from '../src/service-credit-bounded-https-ingress-owner.js';

const SELF = fileURLToPath(import.meta.url), REPO = resolve(dirname(SELF), '..');
const LABELS = ['package.json', 'src/x402-official-https-request-binding.js',
  'src/x402-official-upfront-https-router.js', 'src/service-credit-bounded-https-ingress-owner.js',
  'qualification/official-x402-upfront-https-router.behavior.draft.mjs'];
assert.equal(process.versions.node, '24.19.0');
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], SELF);
assert.equal(process.env.X402_ROUTER_CONTRACT_OPT_IN, 'declared-callable-no-native-no-sdk');
const PINS = JSON.parse(process.env.X402_ROUTER_CONTRACT_PINS);
const ids = s => ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k => String(s[k]));
function sources() {
  assert.equal(PINS.length, 5); assert.deepEqual(PINS.map(p => p.path), LABELS);
  let total = 0;
  return PINS.map(p => {
    const file = join(REPO, p.path), s = lstatSync(file, { bigint: true });
    assert.ok(s.isFile() && !s.isSymbolicLink()); assert.equal(s.uid, BigInt(process.getuid()));
    assert.equal(s.nlink, 1n); assert.deepEqual(ids(s), p.identity); assert.ok(s.size <= 262144n);
    const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW), b = Buffer.alloc(Number(s.size) + 1);
    let used = 0;
    try {
      assert.deepEqual(ids(fstatSync(fd, { bigint: true })), p.identity);
      while (used < b.length) { const n = readSync(fd, b, used, b.length - used, null); if (!n) break; used += n; }
      assert.deepEqual(ids(fstatSync(fd, { bigint: true })), p.identity);
    } finally { closeSync(fd); }
    assert.deepEqual(ids(lstatSync(file, { bigint: true })), p.identity);
    assert.equal(used, Number(s.size)); const raw = b.subarray(0, used);
    total += raw.length; assert.ok(total <= 262144);
    assert.equal(raw.length, p.bytes); assert.equal(raw.filter(c => c === 10).length, p.LF);
    assert.equal(createHash('sha256').update(raw).digest('hex'), p.sha256);
    return { path: p.path, bytes: p.bytes, sha256: p.sha256, identity: p.identity };
  });
}
const before = sources(), OPTIONS = { timeout: 5000, concurrency: false };
const freeze = Object.freeze, ORIGIN = 'https://router-contract.invalid:8443';
const HEADER = Buffer.from('original payment DATA').toString('base64');
const OTHER = Buffer.from('changed payment DATA').toString('base64');
const contexts = [];
function capability() {
  let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function completion() {
  const p = capability(), counts = { success: 0, failure: 0 };
  const value = freeze({
    success: freeze(() => { counts.success++; p.resolve(true); }),
    failure: freeze(() => { counts.failure++; p.resolve(false); }),
  });
  return { value, counts, promise: p.promise };
}
function response(failEnd = false) {
  return { destroyed: false, writableEnded: false, statusCode: 200, headers: {}, body: null, writes: 0,
    setHeader: freeze(function setHeader(name, value) { this.headers[name.toLowerCase()] = value; }),
    end: freeze(function end(body) {
      this.writes++; if (failEnd) throw Error('DECLARED_RESPONSE_LOSS');
      this.body = body; this.writableEnded = true;
    }) };
}
function request(header = null) {
  return { method: 'GET', url: '/paid', httpVersion: '1.1', socket: { encrypted: true },
    rawHeaders: ['Host', 'router-contract.invalid:8443', 'Connection', 'close',
      ...(header === null ? [] : ['Payment-Signature', header])] };
}
function applicationInputError() {
  const error = new TypeError('declared exact application refusal');
  Object.defineProperty(error, 'code', { value: 'x402_official_selected_server_input_rejected' });
  return freeze(error);
}
function fixture({ succeeds = true, limit = 8 } = {}) {
  const f = { calls: 0, resumes: 0, pendingCloses: 0, serviceCalls: 0, serviceCloses: 0,
    phase: 'PENDING', hook: null, resumeHook: null, closeHook: null, router: null, closed: false };
  const pending = freeze({
    resume: freeze(async function resume() {
      f.resumes++;
      if (f.resumeHook !== null) await f.resumeHook();
      f.phase = succeeds ? 'SUCCEEDED' : 'PENDING_EXHAUSTED';
      return freeze({ settlement: freeze({ success: succeeds, transaction: 'a'.repeat(64),
        network: 'zenon:declared', publicationStatus: succeeds ? 'ACKNOWLEDGED' : 'UNKNOWN' }),
      headers: freeze({ 'PAYMENT-RESPONSE': Buffer.from(succeeds ? 'ack' : 'unknown').toString('base64') }) });
    }),
    close: freeze(function close() {
      f.pendingCloses++; return f.closeHook === null ? Promise.resolve() : f.closeHook();
    }),
    getSnapshot: freeze(() => freeze({ phase: f.phase })),
  });
  const official = freeze({
    processRequest: freeze(() => { throw Error('LEGACY_SCALAR_FORBIDDEN'); }),
    processHttpRequest: freeze(async function processHttpRequest(req) {
      f.calls++;
      const value = req.rawHeaders.at(-1);
      if (f.hook !== null) return f.hook(req, pending);
      if (value === OTHER) throw applicationInputError();
      return freeze({ type: 'payment-error', response: freeze({ status: 402,
        headers: freeze(value === HEADER ? { 'PAYMENT-RESPONSE': 'cGVuZGluZw==' } : { 'PAYMENT-REQUIRED': 'cmVxdWlyZWQ=' }),
        body: freeze({}) }), pending: value === HEADER ? pending : null });
    }),
    getSnapshot: freeze(() => freeze({ declared: true, calls: f.calls })),
  });
  const service = freeze({
    handle: freeze(async function handle(_request, res) {
      f.serviceCalls++; res.statusCode = 200; res.end('{"ok":true,"resultCode":"declared"}');
    }),
    close: freeze(async function close() { f.serviceCloses++; }),
  });
  f.router = ROUTER({ resourceUrl: ORIGIN + '/paid', officialServer: official,
    serviceSession: service, maxFundingPayments: limit });
  contexts.push(f); return f;
}
async function call(f, req, res = response()) {
  const done = completion();
  assert.equal(f.router.handle(req, res, freeze({ declaredOnly: true }), done.value), undefined);
  const clean = await done.promise;
  return { res, done, clean };
}
async function close(f, expected = true) {
  const done = completion(); assert.equal(f.router.close(done.value), undefined);
  assert.equal(await done.promise, expected); f.closed = true;
  assert.deepEqual(done.counts, { success: Number(expected), failure: Number(!expected) });
  return done;
}

test('router binds method target Host and zero-body before declared application calls', OPTIONS, async () => {
  const f = fixture(); let hooks = 0;
  const accessor = request(); Object.defineProperty(accessor, 'method', { enumerable: true, get() { hooks++; throw Error(); } });
  const proxy = new Proxy(request(), { get() { hooks++; throw Error(); } });
  for (const req of [{ ...request(), method: 'POST' }, { ...request(), url: '/paid?other=1' },
    { ...request(), rawHeaders: ['Host', 'other.invalid'] },
    { ...request(), rawHeaders: ['Host', 'router-contract.invalid:8443', 'Content-Length', '1'] },
    accessor, proxy]) {
    const result = await call(f, req); assert.equal(result.res.statusCode, 400); assert.equal(result.clean, true);
  }
  assert.equal(hooks, 0); assert.equal(f.calls, 0); assert.equal(f.serviceCalls, 0);
  assert.equal((await call(f, request())).res.statusCode, 402); assert.equal(f.calls, 1);
  await close(f);
});
test('router resumes only the retained pending tuple then caches its original acknowledgement', OPTIONS, async () => {
  const f = fixture();
  assert.equal((await call(f, request(HEADER))).res.statusCode, 402);
  const resumed = await call(f, request(HEADER)); assert.equal(resumed.res.statusCode, 200);
  const replay = await call(f, request(HEADER));
  assert.equal(replay.res.body, resumed.res.body); assert.deepEqual(replay.res.headers, resumed.res.headers);
  assert.deepEqual([f.calls, f.resumes, f.serviceCalls], [1,1,0]);
  assert.equal(f.router.snapshot().cachedReplies, 1); await close(f); assert.equal(f.pendingCloses, 1);
});
test('router retains exhausted pending receipt without resetting first-call or observer authority', OPTIONS, async () => {
  const f = fixture({ succeeds: false }); await call(f, request(HEADER));
  const exhausted = await call(f, request(HEADER)), replay = await call(f, request(HEADER));
  assert.equal(exhausted.res.statusCode, 402); assert.equal(replay.res.body, exhausted.res.body);
  assert.deepEqual([f.calls, f.resumes], [1,1]); await close(f);
});
test('changed-context application refusal leaves the original pending continuation available', OPTIONS, async () => {
  const f = fixture(); await call(f, request(HEADER));
  assert.equal((await call(f, request(OTHER))).res.statusCode, 400);
  assert.equal(f.router.snapshot().uncertain, false);
  assert.equal((await call(f, request(HEADER))).res.statusCode, 200);
  assert.deepEqual([f.calls, f.resumes], [2,1]); await close(f);
});
test('router bounds retained payment contexts and never substitutes a new payment on capacity', OPTIONS, async () => {
  const f = fixture({ limit: 1 }); await call(f, request(HEADER));
  assert.equal((await call(f, request(OTHER))).res.statusCode, 503);
  assert.equal(f.calls, 1); assert.equal((await call(f, request(HEADER))).res.statusCode, 200);
  assert.equal(f.resumes, 1); await close(f);
});
test('credit path delegates separately while a funding receipt never invokes the service', OPTIONS, async () => {
  const f = fixture(); await call(f, request(HEADER)); await call(f, request(HEADER));
  assert.equal(f.serviceCalls, 0);
  const req = { method: 'POST', url: '/service-credit/v1/execute' };
  assert.equal((await call(f, req)).res.statusCode, 200); assert.equal(f.serviceCalls, 1);
  await close(f); const late = await call(f, req);
  assert.equal(late.res.statusCode, 503); assert.equal(f.serviceCalls, 1); assert.equal(f.serviceCloses, 1);
});
test('response loss retains reply before write without a new funding invocation on the exact replay', OPTIONS, async () => {
  const f = fixture(); await call(f, request(HEADER));
  const lost = await call(f, request(HEADER), response(true)); assert.equal(lost.clean, false);
  const replay = await call(f, request(HEADER));
  assert.equal(replay.res.statusCode, 200); assert.deepEqual([f.calls, f.resumes], [1,1]);
  assert.equal(f.router.snapshot().uncertain, true); await close(f, false);
});
test('close drains late pending ownership and never writes or reports late success after revocation', OPTIONS, async () => {
  const f = fixture(), deferred = capability(), drain = capability(), draining = capability();
  f.hook = (_req, pending) => deferred.promise.then(() => ({ type: 'payment-error',
    response: { status: 402, headers: {}, body: {} }, pending }));
  f.closeHook = () => { draining.resolve(); return drain.promise; };
  const res = response(), handled = completion(), closing = completion();
  f.router.handle(request(HEADER), res, freeze({}), handled.value);
  f.router.close(closing.value); assert.equal(await handled.promise, false);
  assert.equal(f.router.snapshot().phase, 'CLOSING'); assert.equal(f.serviceCloses, 1);
  deferred.resolve(); await draining.promise;
  assert.equal(res.writes, 0); assert.equal(f.pendingCloses, 1);
  assert.equal(f.router.snapshot().phase, 'CLOSING'); drain.resolve();
  assert.equal(await closing.promise, false); f.closed = true;
  assert.equal(f.router.snapshot().phase, 'CLOSE_UNCERTAIN'); assert.equal(f.router.snapshot().activeOperations, 0);
});
test('an unusable SDK-shaped reply retains its pending owner for one close rather than leaking it', OPTIONS, async () => {
  const f = fixture();
  f.hook = (_req, pending) => ({ type: 'payment-error',
    response: { status: 402, headers: {}, body: { unsupported: () => {} } }, pending });
  assert.equal((await call(f, request(HEADER))).clean, false); assert.equal(f.pendingCloses, 0);
  await close(f, false); assert.equal(f.pendingCloses, 1);
});
test('explicit GET constructor and legacy POST constructor remain inert and share the existing close owner', OPTIONS, async () => {
  let factories = 0, downstreamCloses = 0;
  let deadlineId = 0;
  const deadlines = freeze({ schedule: freeze(() => freeze({ id: ++deadlineId })), cancel: freeze(() => true) });
  const downstream = freeze({ handle: freeze(() => { throw Error('NO_REQUEST_AT_CONSTRUCTION'); }),
    close: freeze(done => { downstreamCloses++; done.success(); }) });
  const limits = freeze({ maxHeaderBytes: 4096, maxHeaderCount: 16, maxConcurrentSockets: 3,
    maxConnectionStarts: 8, maxConcurrentRequests: 2, maxRequestStarts: 6,
    tlsHandshakeDeadlineMs: 100, headerDeadlineMs: 200, requestResponseDeadlineMs: 500,
    idleSocketDeadlineMs: 800, startDeadlineMs: 300, closeGraceMs: 1000, metricsCounterLimit: 10000 });
  const c = { origin: ORIGIN, requestTargets: freeze(['/paid', '/service-credit/v1/execute']),
    generation: freeze({ generationId: 'declared.native.profile', generationVersion: 1 }),
    limits, downstream, deadlineRuntime: deadlines,
    httpsServerFactory: freeze(() => { factories++; throw Error('NO_NATIVE_FACTORY'); }) };
  for (const factory of [LEGACY, OFFICIAL_PROFILE]) {
    const owner = factory(c); assert.equal(owner.snapshotMetrics().phase, 'DORMANT');
    const promise = owner.close(); assert.equal(owner.close(), promise); await promise;
    assert.equal(owner.snapshotMetrics().phase, 'CLOSED'); assert.equal(owner.snapshotMetrics().trackedSockets, 0);
  }
  assert.equal(factories, 0); assert.equal(downstreamCloses, 2);
  assert.throws(() => OFFICIAL_PROFILE({ ...c, requestTargets: freeze(['/service-credit/v1/execute']) }),
    { code: 'SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_OWNER_INVALID_CONFIGURATION' });
  assert.throws(() => OFFICIAL_PROFILE(), { code: 'SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_OWNER_INVALID_CONFIGURATION' });
});
after(async () => {
  for (const f of contexts) if (!f.closed) await close(f, !f.router.snapshot().uncertain);
  assert.deepEqual(sources(), before);
  console.log('# ' + JSON.stringify({ kind: 'OFFICIAL_X402_ROUTER_DECLARED_CONTRACT',
    version: 1, selectedCases: 10, actualOfficialSdk: false, actualApplicationFactory: false,
    nativeHttpsOrTls: false, nativeSocket: false, sql: false, keys: 0, signatures: 0,
    nonceSearch: 0, payments: 0, realPrepare: 0, declaredCallableSeamsOnly: true,
    fullP1: 'NOT_ESTABLISHED', serviceDelivery: 'NOT_ESTABLISHED' }));
});
