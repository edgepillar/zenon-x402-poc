// Actual ingress + shared limits; all server/socket/deadline interfaces below
// are declared DATA capabilities. No native listener, TLS, application timer,
// SDK, SQLite, key, signature, nonce, source transform or builtin alias.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServiceCreditBoundedHttpsIngressOwner as LEGACY,
  createServiceCreditBoundedHttpsIngressOwnerForOfficialX402 as OFFICIAL } from '../src/service-credit-bounded-https-ingress-owner.js';

assert.equal(process.version, 'v24.19.0'); assert.equal(process.platform, 'darwin');
assert.equal(process.arch, 'arm64'); assert.equal(process.argv.length, 2);
assert.equal(process.env.NODE_DISABLE_COMPILE_CACHE, '1');
assert.equal(process.env.X402_INGRESS_LIMITS_SELECTION, 'fourteen-actual-ingress-components');
assert.ok(process.permission && !process.permission.has('fs.write')
  && !process.permission.has('child') && !process.permission.has('worker'));
const freeze = Object.freeze, options = { concurrency: false, timeout: 2000 };
const constructors = [LEGACY, OFFICIAL], HOST = 'service.example:8443';
const totals = { entered: 0, completed: 0, constructionRefusals: 0, constructorsReturned: 0,
  declaredStarts: 0, declaredRequests: 0, declaredCloses: 0, getterCalls: 0, proxyTraps: 0 };
const valid = () => ({ maxHeaderBytes: 4096, maxHeaderCount: 16, maxConcurrentSockets: 3,
  maxConnectionStarts: 8, maxConcurrentRequests: 2, maxRequestStarts: 6,
  tlsHandshakeDeadlineMs: 100, headerDeadlineMs: 200, requestResponseDeadlineMs: 500,
  idleSocketDeadlineMs: 800, startDeadlineMs: 300, closeGraceMs: 1000, metricsCounterLimit: 10000 });
const fields = Object.keys(valid());
function fixture(limits, constructor = OFFICIAL) {
  const h = { owner: null, factoryCalls: 0, schedules: 0, cancels: 0, downstreamCalls: 0,
    downstreamCloses: 0, listens: 0, closes: 0, callbacks: null, serverOptions: null,
    timers: new Map(), delays: [], sockets: [] };
  h.configuration = { origin: 'https://' + HOST, requestTargets: ['/paid', '/service'],
    generation: freeze({ generationId: 'declared-shared-limits', generationVersion: 1 }), limits,
    downstream: freeze({
      handle: freeze((_request, response, _context, done) => {
        h.downstreamCalls++; response.statusCode = 204; response.end(); done.success();
      }),
      close: freeze(done => { h.downstreamCloses++; done.success(); }),
    }),
    deadlineRuntime: freeze({
      schedule: freeze((wake, delay) => {
        const token = freeze({ id: ++h.schedules }); h.timers.set(token, { wake, delay });
        h.delays.push(delay); return token;
      }),
      cancel: freeze(token => { h.cancels++; return h.timers.delete(token); }),
    }),
    httpsServerFactory: freeze((serverOptions, callbacks) => {
      h.factoryCalls++; h.callbacks = callbacks; h.serverOptions = serverOptions;
      return freeze({ listen: freeze(() => { h.listens++; callbacks.listening(); }),
        close: freeze(() => { h.closes++; callbacks.close(); }), closeAllConnections: freeze(() => {}) });
    }),
  };
  h.construct = () => { h.owner = constructor(h.configuration); totals.constructorsReturned++; return h.owner; };
  return h;
}
function untouched(h) {
  for (const key of ['factoryCalls','schedules','cancels','downstreamCalls','downstreamCloses','listens','closes'])
    assert.equal(h[key], 0);
  assert.equal(h.timers.size, 0);
}
function reject(limits) {
  for (const constructor of constructors) {
    const h = fixture(limits, constructor);
    assert.throws(h.construct, { code: 'SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_OWNER_INVALID_CONFIGURATION' });
    totals.constructionRefusals++; untouched(h); assert.equal(h.owner, null);
  }
}
async function close(h) {
  for (const socket of h.sockets) socket.destroy();
  const first = h.owner.close(); assert.equal(h.owner.close(), first);
  assert.deepEqual(await first, { status: 'CLOSED' }); totals.declaredCloses++;
  const view = h.owner.snapshotMetrics(); assert.equal(view.phase, 'CLOSED');
  for (const name of ['trackedSockets','trackedRequests','trackedHandlers','ownedTimers']) assert.equal(view[name], 0);
  assert.equal(h.timers.size, 0); assert.equal(h.downstreamCloses, 1);
}
async function accept(limits) {
  for (const constructor of constructors) {
    const h = fixture(limits, constructor); h.construct(); untouched(h);
    assert.equal(h.owner.snapshotMetrics().phase, 'DORMANT'); await close(h);
  }
}
async function start(h) {
  assert.deepEqual(await h.owner.start(), { status: 'LISTENING' }); totals.declaredStarts++;
  assert.equal(h.factoryCalls, 1); assert.equal(h.listens, 1);
}
class DeclaredSocket extends EventEmitter {
  constructor() {
    super(); this.encrypted = true; this.alpnProtocol = 'http/1.1'; this.servername = 'service.example';
    this.destroyed = false;
    Object.defineProperty(this, 'remoteAddress', { get() { throw Error('NETWORK_FIELD_FORBIDDEN'); } });
  }
  destroy() { if (!this.destroyed) { this.destroyed = true; this.emit('close'); } return this; }
}
class DeclaredRequest extends EventEmitter {
  constructor(socket, method, url, host = HOST) {
    super(); this.socket = socket; this.method = method; this.url = url; this.httpVersion = '1.1';
    this.rawHeaders = freeze(['Host',host,'Content-Length','0','Connection','close']); this.bodyTouches = 0;
    Object.defineProperty(this, 'headers', { get() { throw Error('NORMALIZED_HEADERS_FORBIDDEN'); } });
  }
  resume() { this.bodyTouches++; }
}
class DeclaredResponse extends EventEmitter {
  constructor(socket) {
    super(); this.socket = socket; this.statusCode = 0; this.headersSent = false;
    this.writableEnded = false; this.finished = false; this.destroyed = false; this.headers = Object.create(null);
  }
  setHeader(name, value) { assert.equal(this.headersSent, false); this.headers[String(name).toLowerCase()] = String(value); }
  end() { this.headersSent = true; this.writableEnded = true; this.finished = true; this.emit('finish'); }
  destroy() { if (!this.destroyed) { this.destroyed = true; this.emit('close'); } }
}
async function request(h, method, url, accepted = true, host = HOST) {
  const socket = new DeclaredSocket(); h.sockets.push(socket);
  h.callbacks.connection(socket); h.callbacks.secureConnection(socket);
  const message = new DeclaredRequest(socket, method, url, host), response = new DeclaredResponse(socket);
  const before = h.downstreamCalls; h.callbacks.request(message, response);
  await undefined; await undefined; totals.declaredRequests++;
  assert.equal(h.downstreamCalls - before, accepted ? 1 : 0);
  assert.equal(response.statusCode, accepted ? 204 : 503); assert.equal(message.bodyTouches, 0);
}
async function selected(name, callback) {
  let completed = false;
  await test(name, options, async () => {
    totals.entered++; await callback(); totals.completed++; completed = true;
  });
  if (!completed) throw Error('ACTUAL_INGRESS_LIMIT_CASE_FAILED_STOP');
}

await selected('both actual ingress factories admit the shared valid limits without operational callbacks', async () => {
  await accept(valid()); await accept(freeze(valid()));
});
await selected('the five-second response and one-second close mismatch fails before server and deadline entry', () => {
  reject({ ...valid(), headerDeadlineMs: 2000, requestResponseDeadlineMs: 5000, closeGraceMs: 1000 });
});
await selected('deadline relationships reject inversion and accept exact equality in both factories', async () => {
  for (const edit of [{ headerDeadlineMs: 501 }, { closeGraceMs: 499 }, { tlsHandshakeDeadlineMs: 801 }])
    reject({ ...valid(), ...edit });
  await accept({ ...valid(), headerDeadlineMs: 500, requestResponseDeadlineMs: 500, closeGraceMs: 500,
    tlsHandshakeDeadlineMs: 800, idleSocketDeadlineMs: 800 });
});
await selected('all thirteen numerical lower and upper bounds reach the real constructor rejection gate', () => {
  const bounds = [[512,65536],[1,256],[1,10000],[1,1000000],[1,10000],[1,1000000],
    [1,60000],[1,60000],[1,60000],[1,60000],[1,60000],[1,60000],[1,Number.MAX_SAFE_INTEGER]];
  for (let i = 0; i < fields.length; i++) for (const value of [bounds[i][0] - 1, bounds[i][1] + 1])
    reject({ ...valid(), [fields[i]]: value });
});
await selected('coherent minimum and maximum limits preserve real dormant close contracts', async () => {
  await accept({ maxHeaderBytes: 512, maxHeaderCount: 1, maxConcurrentSockets: 1, maxConnectionStarts: 1,
    maxConcurrentRequests: 1, maxRequestStarts: 1, tlsHandshakeDeadlineMs: 1, headerDeadlineMs: 1,
    requestResponseDeadlineMs: 1, idleSocketDeadlineMs: 1, startDeadlineMs: 1, closeGraceMs: 1, metricsCounterLimit: 34 });
  await accept({ maxHeaderBytes: 65536, maxHeaderCount: 256, maxConcurrentSockets: 10000, maxConnectionStarts: 1000000,
    maxConcurrentRequests: 10000, maxRequestStarts: 1000000, tlsHandshakeDeadlineMs: 60000, headerDeadlineMs: 60000,
    requestResponseDeadlineMs: 60000, idleSocketDeadlineMs: 60000, startDeadlineMs: 60000, closeGraceMs: 60000,
    metricsCounterLimit: Number.MAX_SAFE_INTEGER });
});
await selected('non-safe nonnumeric and coercible limit values invoke no user conversion', () => {
  const coercible = { valueOf() { totals.getterCalls++; throw Error('COERCION'); } };
  for (const field of fields) for (const value of [NaN,Infinity,-Infinity,1.5,-0,'1000',1000n,coercible])
    reject({ ...valid(), [field]: value });
  assert.equal(totals.getterCalls, 0);
});
await selected('missing extra symbol and hidden own fields cannot broaden the captured limit record', () => {
  for (const field of fields) { const limits = valid(); delete limits[field]; reject(limits); }
  reject({ ...valid(), extra: 1 });
  const symbol = valid(); delete symbol.closeGraceMs; symbol[Symbol('closeGraceMs')] = 1000; reject(symbol);
  const hidden = valid(); Object.defineProperty(hidden, 'closeGraceMs', { value: 1000, enumerable: false }); reject(hidden);
});
await selected('accessor proxy revoked and wrong-prototype limits are refused without input hooks', () => {
  for (const field of fields) {
    const limits = valid(); Object.defineProperty(limits, field, { enumerable: true,
      get() { totals.getterCalls++; throw Error('GETTER'); } }); reject(limits);
  }
  const proxy = new Proxy(valid(), { ownKeys() { totals.proxyTraps++; throw Error('TRAP'); },
    getPrototypeOf() { totals.proxyTraps++; throw Error('TRAP'); },
    getOwnPropertyDescriptor() { totals.proxyTraps++; throw Error('TRAP'); } });
  reject(proxy); const revoked = Proxy.revocable(valid(), {}); revoked.revoke(); reject(revoked.proxy);
  for (const value of [null,undefined,[],{},Object.assign(Object.create(null),valid()),Object.create(valid())]) reject(value);
  assert.equal(totals.getterCalls, 0); assert.equal(totals.proxyTraps, 0);
});
await selected('connection request and lifetime relationships are enforced before any capability entry', async () => {
  for (const edit of [{ maxConcurrentRequests: 4 }, { maxConnectionStarts: 2 },
    { maxRequestStarts: 1 }, { maxRequestStarts: 9 }]) reject({ ...valid(), ...edit });
  await accept({ ...valid(), maxConcurrentSockets: 3, maxConcurrentRequests: 3, maxRequestStarts: 3, maxConnectionStarts: 3 });
});
await selected('the exact connection plus request plus thirty-two metric reserve remains necessary and sufficient', async () => {
  reject({ ...valid(), metricsCounterLimit: 45 }); await accept({ ...valid(), metricsCounterLimit: 46 });
});
await selected('caller mutation after construction cannot replace captured server or deadline limits', async () => {
  for (const constructor of constructors) {
    const limits = valid(), before = { ...limits }, h = fixture(limits, constructor); h.construct(); untouched(h);
    for (const field of fields) limits[field] = 0;
    await start(h);
    for (const [name, value] of Object.entries({ handshakeTimeout: before.tlsHandshakeDeadlineMs,
      maxHeaderSize: before.maxHeaderBytes, headersTimeout: before.headerDeadlineMs,
      requestTimeout: before.requestResponseDeadlineMs, keepAliveTimeout: before.idleSocketDeadlineMs,
      maxHeadersCount: before.maxHeaderCount, maxConnections: before.maxConcurrentSockets }))
      assert.equal(h.serverOptions[name], value);
    await request(h, constructor === OFFICIAL ? 'GET' : 'POST', '/paid');
    await close(h); assert.ok(h.delays.includes(before.startDeadlineMs)); assert.ok(h.delays.includes(before.closeGraceMs));
  }
});
await selected('official GET and both POST profiles still dispatch only their exact declared methods', async () => {
  for (const [constructor,method,url] of [[OFFICIAL,'GET','/paid'],[OFFICIAL,'POST','/service'],[LEGACY,'POST','/paid']]) {
    const h = fixture(valid(),constructor); h.construct(); await start(h); await request(h,method,url); await close(h);
  }
});
await selected('the shared header-count limit still controls real request admission without a body read', async () => {
  for (const maxHeaderCount of [2,3]) {
    const h = fixture({ ...valid(), maxHeaderCount }); h.construct(); await start(h);
    await request(h,'GET','/paid',maxHeaderCount === 3); await close(h);
  }
});
await selected('legacy GET official POST-paid and foreign Host remain rejected after shared capture', async () => {
  for (const [constructor,method,host] of [[LEGACY,'GET',HOST],[OFFICIAL,'POST',HOST],[OFFICIAL,'GET','other.example']]) {
    const h = fixture(valid(),constructor); h.construct(); await start(h);
    await request(h,method,'/paid',false,host); await close(h);
  }
});
assert.equal(totals.entered,14); assert.equal(totals.completed,14);
assert.equal(totals.getterCalls,0); assert.equal(totals.proxyTraps,0);
console.log('# actual-ingress-shared-limits ' + JSON.stringify({ ...totals,
  scope: 'ACTUAL_INGRESS_SHARED_LIMITS_WITH_DECLARED_INTERFACES',
  nativeServerOrSocket: false, nativeTls: false, actualApplicationTimers: false,
  SDK: false, SQLite: false, signing: false, nonce: false,
  issuedGrantNativeQualified: false, sourceTransforms: 0, nativeAliases: 0, authority: 'NONE' }));
