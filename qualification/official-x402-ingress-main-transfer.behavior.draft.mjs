// Selected actual ingress regressions for the main transfer; declared interfaces only.
// No SDK, SQL, native socket/server/TLS, application timer, key, signing or nonce.
// The separate V4 native result remains bound to its own executed graph.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTRY = 'qualification/official-x402-ingress-main-transfer.behavior.draft.mjs';
const SPECS = [
  {
    "path": "package.json",
    "bytes": 2677,
    "LF": 40,
    "sha256": "cb4364b57d7918682d68dd00b10a5c35c26ec6af2118a0d70353df2f3324c65f"
  },
  {
    "path": "src/service-credit-bounded-https-ingress-owner.js",
    "bytes": 143191,
    "LF": 4092,
    "sha256": "3ba52fb8f33e332a30297dc93e9e6162e4c1d957b3fda1bdf61090ac57d0971a"
  },
  {
    "path": "src/x402-official-https-request-binding.js",
    "bytes": 5085,
    "LF": 99,
    "sha256": "dabf215408887bd0d2ba346085c5ab2df13f724e8759b7a98b71b09c8dc8d692"
  }
];
const SELF = fileURLToPath(import.meta.url), REPO = resolve(dirname(SELF), '..');
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], SELF);
assert.equal(process.versions.node, '24.19.0'); assert.equal(process.platform, 'darwin');
assert.equal(process.arch, 'arm64');
assert.equal(process.env.X402_INGRESS_TRANSFER_OPT_IN, 'declared-ingress-only-no-sdk-sql-socket-timer');
const PINS = JSON.parse(process.env.X402_INGRESS_TRANSFER_PINS);
const sha = b => createHash('sha256').update(b).digest('hex');
const ids = s => ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k => String(s[k]));
function sources() {
  assert.equal(PINS.length, 4);
  assert.deepEqual(PINS.map(p => p.path), [...SPECS.map(p => p.path), ENTRY]);
  return PINS.map((p, index) => {
    const path = join(REPO, p.path), s = lstatSync(path, { bigint: true });
    assert.ok(s.isFile() && !s.isSymbolicLink()); assert.equal(s.nlink, 1n);
    assert.equal(s.uid, BigInt(process.getuid())); assert.deepEqual(ids(s), p.identity);
    const raw = readFileSync(path); assert.equal(raw.length, p.bytes); assert.equal(sha(raw), p.sha256);
    assert.equal(raw.filter(c => c === 10).length, p.LF);
    assert.deepEqual(ids(lstatSync(path, { bigint: true })), p.identity);
    if (index < SPECS.length) for (const k of ['path','bytes','LF','sha256']) assert.equal(p[k], SPECS[index][k]);
    return [p.path,p.bytes,p.sha256,p.identity];
  });
}
const before = sources();
const { createServiceCreditBoundedHttpsIngressOwner: LEGACY,
  createServiceCreditBoundedHttpsIngressOwnerForOfficialX402: OFFICIAL }
  = await import('../src/service-credit-bounded-https-ingress-owner.js');
const freeze = Object.freeze, ORIGIN = 'https://service.example:8443', HOST = 'service.example:8443';
const LIMITS = freeze({ maxHeaderBytes: 4096, maxHeaderCount: 16, maxConcurrentSockets: 3,
  maxConnectionStarts: 8, maxConcurrentRequests: 2, maxRequestStarts: 6,
  tlsHandshakeDeadlineMs: 100, headerDeadlineMs: 200, requestResponseDeadlineMs: 500,
  idleSocketDeadlineMs: 800, startDeadlineMs: 300, closeGraceMs: 1000, metricsCounterLimit: 10000 });
const fixtures = [], names = [];
function selected(name, callback) { names.push(name); test(name, callback); }
class DeclaredSocket extends EventEmitter {
  constructor() {
    super(); this.encrypted = true; this.alpnProtocol = 'http/1.1'; this.servername = 'service.example';
    this.destroyed = false; this.destroyCalls = 0;
    Object.defineProperty(this, 'remoteAddress', { get() { throw Error('NETWORK_FIELD_FORBIDDEN'); } });
  }
  destroy() { this.destroyCalls++; if (!this.destroyed) { this.destroyed = true; this.emit('close'); } return this; }
}
class DeclaredRequest extends EventEmitter {
  constructor(socket, c = {}) {
    super(); this.socket = socket; this.method = c.method ?? 'GET'; this.url = c.url ?? '/paid';
    this.httpVersion = '1.1'; this.rawHeaders = freeze(c.rawHeaders ?? ['Host',HOST,'Content-Length','0','Connection','close']);
    this.bodyTouches = 0;
    Object.defineProperty(this, 'headers', { get() { throw Error('NORMALIZED_HEADERS_FORBIDDEN'); } });
  }
  resume() { this.bodyTouches++; }
}
class DeclaredResponse extends EventEmitter {
  constructor(socket) {
    super(); this.socket = socket; this.statusCode = 0; this.headersSent = false;
    this.writableEnded = false; this.finished = false; this.destroyed = false;
    this.headers = Object.create(null);
  }
  setHeader(name, value) { assert.equal(this.headersSent, false); this.headers[String(name).toLowerCase()] = String(value); }
  end() { this.headersSent = true; this.writableEnded = true; this.finished = true; this.emit('finish'); }
  destroy() { if (!this.destroyed) { this.destroyed = true; this.emit('close'); } }
}
function fixture(create = OFFICIAL, requestTargets = ['/paid','/service']) {
  const f = { owner: null, callbacks: null, factoryCalls: 0, listens: 0, closes: 0,
    schedules: 0, cancels: 0, handles: 0, downstreamCloses: 0, calls: [], sockets: [],
    timers: new Map(), scheduleHook: null, disposed: false };
  const runtime = freeze({
    schedule: freeze((wake, milliseconds) => {
      const token = freeze({ index: ++f.schedules }); f.timers.set(token, { wake,milliseconds });
      if (f.scheduleHook !== null) f.scheduleHook(milliseconds); return token;
    }),
    cancel: freeze(token => { f.cancels++; return f.timers.delete(token); }),
  });
  const options = { origin: ORIGIN, requestTargets,
    generation: freeze({ generationId: 'declared-main-transfer', generationVersion: 1 }),
    limits: LIMITS, deadlineRuntime: runtime,
    downstream: freeze({
      handle: freeze((request, response, _context, done) => {
        f.handles++; f.calls.push([request.method,request.url]);
        response.statusCode = 204; response.end(); done.success();
      }),
      close: freeze(done => { f.downstreamCloses++; done.success(); }),
    }),
    httpsServerFactory: freeze((_options, callbacks) => {
      f.factoryCalls++; f.callbacks = callbacks;
      return freeze({ listen: freeze(() => { f.listens++; callbacks.listening(); }),
        close: freeze(() => { f.closes++; callbacks.close(); }),
        closeAllConnections: freeze(() => {}) });
    }),
  };
  f.options = options; f.owner = create(options); fixtures.push(f); return f;
}
async function start(f) { assert.deepEqual(await f.owner.start(), { status: 'LISTENING' }); return f; }
function connect(f) {
  const socket = new DeclaredSocket(); f.sockets.push(socket);
  f.callbacks.connection(socket); f.callbacks.secureConnection(socket); assert.equal(socket.destroyed, false);
  return socket;
}
async function dispose(f, unknown = false) {
  for (const socket of f.sockets) socket.destroy();
  const closing = f.owner.close(); assert.equal(f.owner.close(), closing);
  if (unknown) await assert.rejects(closing, { code: 'SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_OWNER_CLOSE_UNCERTAIN' });
  else assert.deepEqual(await closing, { status: 'CLOSED' });
  const view = f.owner.snapshotMetrics(); assert.equal(view.phase, unknown ? 'CLOSE_UNCERTAIN' : 'CLOSED');
  for (const key of ['trackedSockets','trackedRequests','trackedHandlers','ownedTimers']) assert.equal(view[key], 0);
  assert.equal(f.timers.size, 0); f.disposed = true; return view;
}
async function exercise(c) {
  const f = await start(fixture(c.legacy ? LEGACY : OFFICIAL)), socket = connect(f);
  if (c.encrypted === false) socket.encrypted = false;
  const request = new DeclaredRequest(socket,c), response = new DeclaredResponse(socket);
  f.callbacks.request(request,response); await Promise.resolve(); await Promise.resolve();
  assert.equal(f.handles, c.accept ? 1 : 0); assert.equal(request.bodyTouches, 0);
  assert.equal(f.owner.snapshotMetrics().requestsAdmitted, c.accept ? 1 : 0);
  assert.equal(response.statusCode, c.accept ? 204 : 503);
  if (c.accept) assert.deepEqual(f.calls, [[c.method ?? 'GET',c.url ?? '/paid']]);
  await dispose(f);
}
selected('both real factories construct inertly without invoking declared server or deadlines', async () => {
  for (const create of [LEGACY,OFFICIAL]) {
    const f = fixture(create); assert.equal(f.factoryCalls, 0); assert.equal(f.schedules, 0);
    assert.equal(f.owner.snapshotMetrics().phase, 'DORMANT'); await dispose(f);
  }
});
selected('official profile requires its exact paid target before any factory capability', () => {
  assert.throws(() => fixture(OFFICIAL,['/service']),
    { code: 'SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_OWNER_INVALID_CONFIGURATION' });
});
const cases = [
  { name: 'official exact GET paid is admitted', accept: true },
  { name: 'official POST service remains admitted', method: 'POST', url: '/service', accept: true },
  { name: 'legacy POST paid remains admitted without selecting the official profile', legacy: true, method: 'POST', accept: true },
  { name: 'legacy GET paid is still rejected', legacy: true },
  { name: 'official POST paid is rejected', method: 'POST' },
  { name: 'official GET service is rejected', url: '/service' },
  { name: 'official PUT paid is rejected', method: 'PUT' },
  { name: 'official query target is rejected', url: '/paid?x=1' },
  { name: 'official trailing-slash target is rejected', url: '/paid/' },
  { name: 'official encoded target is rejected', url: '/%70aid' },
  { name: 'wrong Host is rejected before downstream', rawHeaders: ['Host','other.example','Connection','close'] },
  { name: 'duplicate Host is rejected before downstream', rawHeaders: ['Host',HOST,'host',HOST,'Connection','close'] },
  { name: 'nonzero GET body framing is rejected without a body read', rawHeaders: ['Host',HOST,'Content-Length','1','Connection','close'] },
  { name: 'transfer encoding is rejected without a body read', rawHeaders: ['Host',HOST,'Transfer-Encoding','chunked','Connection','close'] },
  { name: 'Expect is rejected without delegating', rawHeaders: ['Host',HOST,'Expect','100-continue','Connection','close'] },
  { name: 'Upgrade is rejected without delegating', rawHeaders: ['Host',HOST,'Upgrade','h2c','Connection','close'] },
  { name: 'missing declared encryption is rejected before official admission', encrypted: false },
  { name: 'duplicate payment header is rejected before official admission', rawHeaders: ['Host',HOST,'Payment-Signature','a','payment-signature','b','Connection','close'] },
  { name: 'whitespace payment header is rejected before official admission', rawHeaders: ['Host',HOST,'Payment-Signature','declared proof','Connection','close'] },
];
for (const c of cases) selected(c.name, () => exercise(c));
for (const [name,mutate] of [
  ['method', request => { request.method = 'POST'; }],
  ['target', request => { request.url = '/service'; }],
  ['Host', request => { request.rawHeaders = freeze(['Host','other.example','Connection','close']); }],
]) selected('response capability cannot mutate '+name+' past the final official gate', async () => {
  const f = await start(fixture()), socket = connect(f), request = new DeclaredRequest(socket);
  const response = new DeclaredResponse(socket), original = response.setHeader; let changes = 0;
  response.setHeader = function(...args) {
    if (changes === 0) { changes++; mutate(request); }
    return Reflect.apply(original,this,args);
  };
  f.callbacks.request(request,response); await Promise.resolve(); await Promise.resolve();
  assert.equal(changes, 1); assert.equal(f.handles, 0); assert.equal(request.bodyTouches, 0);
  assert.equal(f.owner.snapshotMetrics().requestsAdmitted, 0); assert.equal(socket.destroyed, true);
  await dispose(f,true);
});
selected('deadline capability cannot change GET framing before downstream', async () => {
  const f = await start(fixture()), socket = connect(f), request = new DeclaredRequest(socket);
  const response = new DeclaredResponse(socket); let changes = 0;
  f.scheduleHook = milliseconds => { if (milliseconds === LIMITS.requestResponseDeadlineMs) {
    changes++; request.rawHeaders = freeze(['Host',HOST,'Content-Length','1','Connection','close']);
  } };
  f.callbacks.request(request,response); await Promise.resolve(); await Promise.resolve();
  assert.equal(changes, 1); assert.equal(f.handles, 0); assert.equal(request.bodyTouches, 0);
  assert.equal(f.owner.snapshotMetrics().requestsAdmitted, 0); await dispose(f,true);
});
selected('caller target-array mutation cannot broaden the captured official profile', async () => {
  const targets = ['/paid','/service'], f = fixture(OFFICIAL,targets);
  targets[0] = '/other'; targets.push('/evil'); await start(f);
  const good = connect(f); f.callbacks.request(new DeclaredRequest(good),new DeclaredResponse(good));
  await Promise.resolve(); await Promise.resolve();
  const bad = connect(f), request = new DeclaredRequest(bad,{ url: '/evil' });
  f.callbacks.request(request,new DeclaredResponse(bad)); await Promise.resolve(); await Promise.resolve();
  assert.equal(f.handles, 1); assert.equal(request.bodyTouches, 0); assert.deepEqual(f.calls, [['GET','/paid']]);
  await dispose(f);
});
selected('closed official ingress keeps cached close and detached late callbacks inert', async () => {
  const f = await start(fixture()), socket = connect(f), request = new DeclaredRequest(socket);
  const response = new DeclaredResponse(socket);
  f.callbacks.request(request,response); await Promise.resolve(); await Promise.resolve();
  const terminal = await dispose(f), beforeCalls = f.handles;
  assert.equal(Object.isFrozen(terminal), true);
  f.callbacks.request(request,response); f.callbacks.secureConnection(socket);
  assert.equal(f.owner.snapshotMetrics(), terminal); assert.equal(f.handles, beforeCalls);
});
assert.equal(names.length, 27); assert.equal(new Set(names).size, names.length);
after(async () => {
  for (const f of fixtures) if (!f.disposed) {
    for (const socket of f.sockets) socket.destroy();
    try { await f.owner.close(); } catch {}
  }
  assert.deepEqual(sources(),before);
  process.stdout.write('# '+JSON.stringify({ kind: 'Q72_DECLARED_INGRESS_MAIN_TRANSFER_COMPONENT',
    selectedCases: names.length, declaredOwners: fixtures.length, actualIngressModule: true,
    nativeServer: 0, nativeSockets: 0, TLS: 0, SDK: 0, SQLite: 0, applicationTimers: 0,
    keys: 0, signatures: 0, nonce: 0, NodeChildren: 0, newTasks: 0, newScratch: 0,
    nativeV4Reused: false, nativeHostImported: false, physicalDrain: 'NOT_ESTABLISHED' })+'\n');
});
