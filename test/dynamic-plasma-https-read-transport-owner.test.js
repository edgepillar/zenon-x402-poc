import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { ClientRequest as NativeClientRequest, IncomingMessage as NativeIncomingMessage } from 'node:http';
import { Duplex, Readable } from 'node:stream';
import { checkServerIdentity } from 'node:tls';
import { TextDecoder, types as utilTypes } from 'node:util';
import { runInThisContext } from 'node:vm';
import nodeTest from 'node:test';
import { createDynamicPlasmaJsonRpcReadTransport } from '../src/zenon/dynamic-plasma-json-rpc-read-transport.js';
import { createDynamicPlasmaObservationCollector } from '../src/zenon/dynamic-plasma-observation-collector.js';
import { normalizeDynamicPlasmaObservation } from '../src/zenon/dynamic-plasma-observation-normalizer.js';

const OWNER_URL = new URL('../src/zenon/dynamic-plasma-https-read-transport-owner.js', import.meta.url);
const OWNER_PREFIX = 'dynamic_plasma_https_read_transport_owner_';
const ADAPTER_PREFIX = 'dynamic_plasma_json_rpc_read_transport_';
const HOST = 'rpc.synthetic-public.org';
const ADDRESS = '8.8.8.8';
const FRONTIER = 'ledger.getFrontierMomentum';
const HEIGHT = 'ledger.getMomentumsByHeight';
const SPORK = 'embedded.spork.getAll';
const VARIABLES = 'embedded.plasma.getVariables';
const QUOTE = 'embedded.plasma.getRequiredPoWForAccountBlock';
const MAX_BODY = 1052672;
const IMPORTS = [
  "import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';",
  "import { ClientRequest, IncomingMessage } from 'node:http';",
  "import { Socket } from 'node:net';",
  "import { TLSSocket, checkServerIdentity } from 'node:tls';",
  "import { EventEmitter } from 'node:events';",
  "import { Readable } from 'node:stream';",
  "import { Buffer } from 'node:buffer';",
  "import { TextDecoder, types as utilTypes } from 'node:util';",
  "import { performance } from 'node:perf_hooks';",
  "import { setTimeout, clearTimeout } from 'node:timers';",
  "import { createDynamicPlasmaJsonRpcReadTransport } from './dynamic-plasma-json-rpc-read-transport.js';",
];
const BINDINGS = [
  'HttpsAgent', 'httpsRequest', 'ClientRequest', 'IncomingMessage', 'Socket', 'TLSSocket',
  'checkServerIdentity', 'EventEmitter', 'Readable', 'Buffer', 'TextDecoder', 'utilTypes', 'performance',
  'setTimeout', 'clearTimeout', 'createDynamicPlasmaJsonRpcReadTransport',
];

function fixedFailure(detail) {
  const error = new Error(`HTTPS_READ_OWNER_TEST_FAILED_${detail}`);
  error.stack = error.message;
  return error;
}
function test(name, run) {
  return nodeTest(name, { concurrency: false }, async t => {
    try { await run(t); }
    catch (error) {
      if (error?.message === 'HTTPS_READ_OWNER_TEST_FAILED_MODULE_ABSENT') throw error;
      const location = /dynamic-plasma-https-read-transport-owner\.test\.js:(\d+):/
        .exec(typeof error?.stack === 'string' ? error.stack : '');
      throw fixedFailure(location?.[1] ?? 'ASSERTION');
    }
  });
}
function sourceText() {
  try { return readFileSync(OWNER_URL, 'utf8'); }
  catch { throw fixedFailure('MODULE_ABSENT'); }
}
function frozen(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}
function configuration(overrides = {}, route = {}) {
  return frozen({ route: { hostname: HOST, path: '/rpc', ipv4Address: ADDRESS, ...route }, timeoutMs: 100, closeGraceMs: 20, ...overrides });
}
function request(method = FRONTIER, params = []) { return frozen({ method, params }); }
function response(id = 1, result = '{}') { return `{"jsonrpc":"2.0","id":${id},"result":${result}}`; }
function codeIs(code) { return error => error?.code === code; }
function ownerError(error, kind) {
  assert.equal(error.code, OWNER_PREFIX + kind);
  assert.equal(Object.isFrozen(error), true);
  assert.deepEqual(Object.keys(error), ['code']);
  assert.equal(Object.hasOwn(error, 'cause'), false);
  assert.equal(error.message, `Dynamic Plasma HTTPS read transport owner ${kind.replaceAll('_', ' ')}`);
  assert.equal(error.stack, `${kind === 'configuration_rejected' ? 'TypeError' : 'Error'}: ${error.message}`);
  assert.equal(Object.getOwnPropertyNames(error).every(key => ['message', 'stack', 'code'].includes(key)), true);
  assert.equal(JSON.stringify(error).includes(HOST), false);
  assert.equal(JSON.stringify(error).includes(ADDRESS), false);
  return true;
}

// Only native import linkage and the single ESM export keyword are removed.
// No initializer, policy, counter, limit, branch, or lifecycle code is replaced.
// Synchronous evaluation also permits initial-intrinsic poison probes without
// entrusting an asynchronous module loader to the deliberately poisoned realm.
function evaluate(bindings) {
  const source = sourceText();
  const importBlock = IMPORTS.join('\n') + '\n';
  assert.equal(source.startsWith(importBlock), true);
  for (const line of IMPORTS) assert.equal(source.split(line).length, 2);
  const exported = 'export function createDynamicPlasmaHttpsReadTransportOwner';
  assert.equal(source.split(exported).length, 2);
  const policy = source.slice(importBlock.length);
  assert.doesNotMatch(policy, /^import\s/m);
  assert.equal((policy.match(/^export\s/gm) ?? []).length, 1);
  const linked = policy.replace(exported, 'function createDynamicPlasmaHttpsReadTransportOwner');
  assert.equal(linked.replace('function createDynamicPlasmaHttpsReadTransportOwner', exported), policy);
  return runInThisContext(`(function(${BINDINGS.join(',')}) { 'use strict';\n${linked}\nreturn createDynamicPlasmaHttpsReadTransportOwner;\n})`)(...bindings);
}

function harness({ flowControlled = true, nativeResponse = false } = {}) {
  let now = 0;
  const h = { requests: [], agents: [], sockets: [], responses: [], timers: [], bodies: [], events: [], hooks: {} };
  class FakeSocket extends EventEmitter {
    constructor() {
      super();
      this.nativeAddress = ADDRESS;
      this.nativeFamily = 'IPv4';
      this.nativePort = 443;
      this.destroyed = false;
      this.destroyCalls = 0;
    }
    get remoteAddress() { return this.nativeAddress; }
    get remoteFamily() { return this.nativeFamily; }
    get remotePort() { return this.nativePort; }
    destroy() { this.destroyCalls += 1; this.destroyed = true; h.hooks.socketDestroy?.(this); return this; }
  }
  class FakeTlsSocket extends FakeSocket {
    constructor() {
      super();
      this.authorized = true;
      this.authorizationError = null;
      this.encrypted = true;
      this.alpnProtocol = 'http/1.1';
      this.servername = HOST;
      this.nativeProtocol = 'TLSv1.3';
      this.nativeReused = false;
      h.sockets.push(this);
    }
    getProtocol() { return this.nativeProtocol; }
    isSessionReused() { return this.nativeReused; }
  }
  class FakeReadable extends EventEmitter {
    constructor() { super(); this.flowing = !flowControlled; this.queued = []; this.resumeCalls = 0; }
    resume() {
      this.resumeCalls += 1; this.flowing = true; h.hooks.resume?.(this);
      while (this.queued.length > 0 && !this.destroyed) {
        const args = this.queued.shift(); super.emit(...args);
      }
      return this;
    }
    emit(name, ...args) {
      if (!this.flowing && (name === 'data' || name === 'end')) { this.queued.push([name, ...args]); return false; }
      return super.emit(name, ...args);
    }
  }
  class FakeResponse extends FakeReadable {
    constructor(text, changes = {}) {
      super();
      this.httpVersion = '1.1';
      this.httpVersionMajor = 1;
      this.httpVersionMinor = 1;
      this.statusCode = 200;
      this.rawHeaders = ['Content-Type', 'application/json', 'Content-Length', String(Buffer.byteLength(text)), 'Connection', 'close'];
      this.rawTrailers = [];
      this.complete = false;
      this.destroyed = false;
      this.destroyCalls = 0;
      Object.assign(this, changes);
      h.responses.push(this);
      h.hooks.response?.(this);
    }
    destroy() { this.destroyCalls += 1; this.destroyed = true; h.hooks.responseDestroy?.(this); return this; }
  }
  class FakeRequest extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.reusedSocket = false;
      this.destroyed = false;
      this.destroyCalls = 0;
      this.writableEnded = false;
      h.requests.push(this);
    }
    end(body) { h.bodies.push(Buffer.from(body)); this.writableEnded = true; h.hooks.end?.(this, body); return this; }
    destroy() { this.destroyCalls += 1; this.destroyed = true; h.hooks.requestDestroy?.(this); return this; }
  }
  class FakeAgent {
    constructor(options) { this.options = options; this.destroyCalls = 0; h.agents.push(this); h.hooks.agent?.(this); }
    destroy() { this.destroyCalls += 1; h.hooks.agentDestroy?.(this); }
  }
  function nativeRequest(options) {
    h.events.push('request');
    const req = new FakeRequest(options);
    return h.hooks.request?.(req, options) ?? req;
  }
  function timer(callback, delay) {
    const handle = { callback, delay, at: now + delay, cancelled: false, fired: false };
    h.timers.push(handle);
    h.hooks.timer?.(handle);
    return handle;
  }
  function clearTimer(handle) { handle.cancelled = true; h.hooks.clearTimer?.(handle); }
  h.factory = evaluate([
    FakeAgent, nativeRequest, FakeRequest, nativeResponse ? NativeIncomingMessage : FakeResponse, FakeSocket, FakeTlsSocket,
    checkServerIdentity, EventEmitter, nativeResponse ? Readable : FakeReadable, Buffer, TextDecoder, utilTypes,
    { now() { h.hooks.now?.(); return now; } }, timer, clearTimer, createDynamicPlasmaJsonRpcReadTransport,
  ]);
  h.create = config => h.factory(config ?? configuration());
  h.advance = (delta, fire = true) => {
    now += delta;
    if (!fire) return;
    for (let iterations = 0; iterations < 100; iterations += 1) {
      const next = h.timers.find(value => !value.cancelled && !value.fired && value.at <= now);
      if (!next) return;
      next.fired = true;
      next.callback();
    }
    throw fixedFailure('TIMER_LOOP');
  };
  h.attach = (index = h.requests.length - 1, changes = {}) => {
    const socket = new FakeTlsSocket();
    Object.assign(socket, changes);
    h.requests[index].testSocket = socket;
    h.requests[index].emit('socket', socket);
    return socket;
  };
  h.secure = (index = h.requests.length - 1, changes = {}) => {
    const socket = h.requests[index].testSocket ?? h.attach(index, changes);
    Object.assign(socket, changes);
    socket.emit('secureConnect');
    return socket;
  };
  h.headers = (text = response(h.requests.length), changes = {}, index = h.requests.length - 1) => {
    const res = new FakeResponse(text, changes);
    h.requests[index].testResponse = res;
    h.requests[index].emit('response', res);
    return res;
  };
  h.end = (text = response(h.requests.length), index = h.requests.length - 1) => {
    const res = h.requests[index].testResponse ?? h.headers(text, {}, index);
    res.emit('data', Buffer.from(text));
    res.complete = true;
    res.emit('end');
  };
  h.closeEvents = (index = h.requests.length - 1) => {
    const req = h.requests[index];
    req.testResponse?.emit('close');
    req.emit('close');
    req.testSocket?.emit('close', false);
  };
  h.complete = (text = response(h.requests.length), index = h.requests.length - 1) => {
    h.secure(index);
    h.headers(text, {}, index);
    h.end(text, index);
    h.closeEvents(index);
  };
  h.cleanup = async owner => {
    const closing = owner.close();
    for (let index = 0; index < h.requests.length; index += 1) h.closeEvents(index);
    h.advance(60001);
    try { await closing; } catch (error) { ownerError(error, 'close_uncertain'); }
  };
  h.assertDrained = () => {
    assert.equal(h.timers.filter(value => !value.cancelled && !value.fired).length, 0);
    const sinks = [];
    for (const resource of [...h.requests, ...h.responses, ...h.sockets]) {
      assert.deepEqual(resource.eventNames(), ['error']);
      const listeners = resource.listeners('error');
      assert.equal(listeners.length, 1);
      sinks.push(listeners[0]);
      assert.doesNotThrow(() => resource.emit('error', new Error('synthetic private diagnostic')));
    }
    if (sinks.length > 0) assert.equal(sinks.every(sink => sink === sinks[0]), true);
  };
  return h;
}

async function rejected(h, owner, action) {
  const pending = owner.transport.callRead(request());
  action();
  await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
  await h.cleanup(owner);
  h.assertDrained();
}
async function tick() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }

test('import, native linkage and frozen construction are inert with exactly one production export', async () => {
  const h = harness();
  const owner = h.create();
  assert.deepEqual(Object.keys(owner), ['transport', 'close']);
  assert.deepEqual(Object.keys(owner.transport), ['callRead']);
  for (const value of [owner, owner.transport, owner.transport.callRead, owner.close]) assert.equal(Object.isFrozen(value), true);
  assert.equal(h.requests.length + h.agents.length + h.timers.length, 0);
  const actual = await import(OWNER_URL.href);
  assert.deepEqual(Object.keys(actual), ['createDynamicPlasmaHttpsReadTransportOwner']);
  await owner.close();
  assert.equal(h.requests.length + h.agents.length + h.timers.length, 0);
});

test('factory exact frozen shapes reject proxies, accessors, symbols and extra arguments without capabilities', () => {
  const h = harness();
  let traps = 0;
  const proxy = new Proxy({}, { ownKeys() { traps += 1; return []; }, getPrototypeOf() { traps += 1; return Object.prototype; } });
  const accessor = Object.freeze(Object.defineProperty({ timeoutMs: 100, closeGraceMs: 20 }, 'route', { enumerable: true, get() { traps += 1; return configuration().route; } }));
  const variants = [null, undefined, {}, { ...configuration() }, proxy, accessor,
    Object.freeze({ ...configuration(), route: proxy }),
    Object.freeze({ ...configuration(), route: { ...configuration().route } }),
    Object.freeze({ ...configuration(), [Symbol('extra')]: true }),
    Object.freeze({ ...configuration(), headers: {} }),
    Object.freeze(Object.assign(Object.create(null), configuration())),
  ];
  for (const value of variants) assert.throws(() => h.factory(value), error => ownerError(error, 'configuration_rejected'));
  assert.throws(() => h.factory(configuration(), proxy), error => ownerError(error, 'configuration_rejected'));
  assert.equal(traps, 0);
  assert.equal(h.requests.length + h.agents.length + h.timers.length, 0);
});

for (const field of ['timeoutMs', 'closeGraceMs']) {
  test(`${field} accepts only bounded canonical safe millisecond integers`, async () => {
    const h = harness();
    for (const value of [0, -0, -1, 60001, 1.1, NaN, Infinity, '1', 1n]) {
      assert.throws(() => h.create(configuration({ [field]: value })), error => ownerError(error, 'configuration_rejected'));
    }
    for (const value of [1, 60000]) await h.create(configuration({ [field]: value })).close();
    assert.equal(h.requests.length + h.agents.length + h.timers.length, 0);
  });
}

test('hostname canonical and special-use boundaries fail closed without normalization or lookup', async () => {
  const h = harness();
  const invalid = ['', 'localhost', 'node.localhost', 'node.local', 'node.home.arpa', 'node.arpa', 'node.invalid', 'node.test', 'node.example', 'node.onion', 'node.alt', 'NODE.org', 'node.org.', '-node.org', 'node-.org', 'node..org', 'node_1.org', 'node.org:443', 'user@node.org', 'https://node.org', '8.8.8.8', '123.456', 'nödé.org', `${'a'.repeat(64)}.org`, `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(62)}`];
  for (const hostname of invalid) assert.throws(() => h.create(configuration({}, { hostname })), error => ownerError(error, 'configuration_rejected'));
  for (const hostname of ['a.org', 'xn--synthetic-label.org', `${'a'.repeat(63)}.org`, `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`]) await h.create(configuration({}, { hostname })).close();
  assert.equal(h.requests.length, 0);
});

test('origin-form path boundaries reject ambiguous encoding, segments, credentials and authorities', async () => {
  const h = harness();
  const invalid = ['', '//node.org/rpc', '/a//b', '/.', '/..', '/a/./b', '/a/../b', '/rpc?', '/rpc?token=x', '/rpc#x', '/%2f', '/a\\b', '/ a', '/\t', '/\r\n', '/é', 'rpc', `/${'a'.repeat(2048)}`];
  for (const path of invalid) assert.throws(() => h.create(configuration({}, { path })), error => ownerError(error, 'configuration_rejected'));
  for (const path of ['/', '/rpc', '/a/b/', '/a-._~!$&\'()*+,;=:@', `/${'a'.repeat(2047)}`]) await h.create(configuration({}, { path })).close();
  assert.equal(h.requests.length, 0);
});

test('IPv4 special-use ranges and noncanonical representations are rejected at both boundaries', async () => {
  const h = harness();
  const invalid = ['0.0.0.0', '0.255.255.255', '10.0.0.0', '10.255.255.255', '100.64.0.0', '100.127.255.255', '127.0.0.0', '127.255.255.255', '169.254.0.0', '169.254.255.255', '172.16.0.0', '172.31.255.255', '192.0.0.0', '192.0.0.255', '192.0.2.0', '192.0.2.255', '192.88.99.0', '192.88.99.255', '192.168.0.0', '192.168.255.255', '198.18.0.0', '198.19.255.255', '198.51.100.0', '198.51.100.255', '203.0.113.0', '203.0.113.255', '224.0.0.0', '239.255.255.255', '240.0.0.0', '255.255.255.255', '08.8.8.8', '8.8.8', '8.8.8.8.', '8.8.8.256', '8.8.8.-1', '8.8.8.8:443', '0x08080808', '134744072', '::1', '::ffff:8.8.8.8', ' 8.8.8.8', '8.8.8.8\n'];
  for (const ipv4Address of invalid) assert.throws(() => h.create(configuration({}, { ipv4Address })), error => ownerError(error, 'configuration_rejected'));
  for (const ipv4Address of ['1.1.1.1', '9.255.255.255', '11.0.0.0', '100.63.255.255', '100.128.0.0', '126.255.255.255', '128.0.0.0', '169.253.255.255', '169.255.0.0', '172.15.255.255', '172.32.0.0', '198.17.255.255', '198.20.0.0', '223.255.255.255']) await h.create(configuration({}, { ipv4Address })).close();
  assert.equal(h.requests.length, 0);
});

test('one canonical request uses the exact pinned HTTPS TLS and framing capabilities with no DNS', async () => {
  const h = harness();
  const owner = h.create();
  const pending = owner.transport.callRead(request());
  assert.equal(utilTypes.isPromise(pending), true);
  assert.equal(Object.getPrototypeOf(pending), Promise.prototype);
  assert.deepEqual(Object.getOwnPropertyNames(pending), []);
  assert.equal(h.requests.length, 1);
  const options = h.requests[0].options;
  assert.equal(options.protocol, 'https:');
  assert.equal(options.hostname, HOST);
  assert.equal(options.port, 443);
  assert.equal(options.path, '/rpc');
  assert.equal(options.method, 'POST');
  assert.equal(options.family, 4);
  assert.equal(options.autoSelectFamily, false);
  assert.equal(options.servername, HOST);
  assert.equal(options.rejectUnauthorized, true);
  assert.equal(options.checkServerIdentity, checkServerIdentity);
  assert.equal(options.minVersion, 'TLSv1.3');
  assert.equal(options.maxVersion, 'TLSv1.3');
  assert.deepEqual(options.ALPNProtocols, ['http/1.1']);
  assert.equal(options.maxHeaderSize, 16384);
  assert.equal(options.insecureHTTPParser, false);
  assert.equal(options.joinDuplicateHeaders, false);
  assert.equal(options.agent, h.agents[0]);
  assert.equal(h.agents[0].options.keepAlive, false);
  assert.equal(h.agents[0].options.maxCachedSessions, 0);
  const body = h.bodies[0].toString('ascii');
  assert.equal(body, '{"jsonrpc":"2.0","id":1,"method":"ledger.getFrontierMomentum","params":[]}');
  assert.deepEqual(options.headers, { Host: HOST, 'Content-Type': 'application/json', Accept: 'application/json', 'Content-Length': String(body.length), Connection: 'close' });
  assert.equal(Object.isFrozen(options.headers), true);
  const addresses = [];
  options.lookup(HOST, { family: 4 }, (error, address, family) => { assert.equal(error, null); addresses.push([address, family]); });
  assert.deepEqual(addresses, [[ADDRESS, 4]]);
  h.complete();
  assert.equal(await pending, '{}');
  await h.cleanup(owner);
  h.assertDrained();
});

test('success is withheld until exact socket close and uses a fresh socket and agent for every read', async () => {
  const h = harness();
  const owner = h.create();
  const first = owner.transport.callRead(request());
  let settled = false;
  first.then(() => { settled = true; });
  h.secure(); h.headers(); h.end();
  await tick();
  assert.equal(settled, false);
  await assert.rejects(owner.transport.callRead(request()), codeIs(ADAPTER_PREFIX + 'busy'));
  h.closeEvents();
  assert.equal(await first, '{}');
  const second = owner.transport.callRead(request(VARIABLES));
  assert.equal(h.requests.length, 2);
  h.complete(response(2));
  assert.equal(await second, '{}');
  assert.notEqual(h.agents[0], h.agents[1]);
  assert.notEqual(h.sockets[0], h.sockets[1]);
  assert.equal(h.agents.every(agent => agent.destroyCalls === 1), true);
  await h.cleanup(owner); h.assertDrained();
});

for (const [name, changes] of [
  ['unauthorized', { authorized: false }], ['wrong peer', { nativeAddress: '1.1.1.1' }],
  ['mapped peer', { nativeAddress: '::ffff:8.8.8.8' }], ['wrong family', { nativeFamily: 'IPv6' }],
  ['wrong port', { nativePort: 8443 }], ['wrong SNI', { servername: 'other.synthetic-public.org' }],
  ['wrong ALPN', { alpnProtocol: 'h2' }], ['missing ALPN', { alpnProtocol: false }],
  ['old TLS', { nativeProtocol: 'TLSv1.2' }], ['session reuse', { nativeReused: true }],
]) test(`TLS ${name} is terminal and never falls back`, async () => {
  const h = harness(); const owner = h.create();
  await rejected(h, owner, () => h.secure(0, changes));
  await assert.rejects(owner.transport.callRead(request()), codeIs(ADAPTER_PREFIX + 'unavailable'));
  assert.equal(h.requests.length, 1);
});

for (const status of [100, 101, 201, 204, 301, 302, 307, 308, 400, 401, 429, 500]) {
  test(`non-success HTTP status class case ${status} cannot return evidence`, async () => {
    const h = harness(); const owner = h.create();
    await rejected(h, owner, () => { h.secure(); h.headers(response(), { statusCode: status }); });
  });
}

for (const contentType of ['application/json', 'application/json; charset=utf-8']) {
  test(`exact supported JSON media type ${contentType.includes(';') ? 'with charset' : 'without charset'} succeeds`, async () => {
    const h = harness(); const owner = h.create(); const pending = owner.transport.callRead(request());
    h.secure(); h.headers(response(), { rawHeaders: ['Content-Type', contentType, 'Content-Length', String(Buffer.byteLength(response()))] });
    h.end(); h.closeEvents(); assert.equal(await pending, '{}'); await h.cleanup(owner); h.assertDrained();
  });
}

for (const [name, headers] of [
  ['missing length', ['Content-Type', 'application/json']],
  ['missing type', ['Content-Length', '38']],
  ['duplicate length', ['Content-Type', 'application/json', 'Content-Length', '38', 'content-length', '38']],
  ['conflicting length', ['Content-Type', 'application/json', 'Content-Length', '38', 'Content-Length', '39']],
  ['duplicate type', ['Content-Type', 'application/json', 'content-type', 'application/json', 'Content-Length', '38']],
  ['chunking', ['Content-Type', 'application/json', 'Content-Length', '38', 'Transfer-Encoding', 'chunked']],
  ['identity encoding', ['Content-Type', 'application/json', 'Content-Length', '38', 'Content-Encoding', 'identity']],
  ['compression', ['Content-Type', 'application/json', 'Content-Length', '38', 'Content-Encoding', 'gzip']],
  ['trailer declaration', ['Content-Type', 'application/json', 'Content-Length', '38', 'Trailer', 'x-proof']],
  ['upgrade header', ['Content-Type', 'application/json', 'Content-Length', '38', 'Upgrade', 'websocket']],
  ['media type case', ['Content-Type', 'Application/JSON', 'Content-Length', '38']],
  ['media type spacing', ['Content-Type', 'application/json;charset=utf-8', 'Content-Length', '38']],
  ['length leading zero', ['Content-Type', 'application/json', 'Content-Length', '038']],
  ['length signed', ['Content-Type', 'application/json', 'Content-Length', '+38']],
  ['length fraction', ['Content-Type', 'application/json', 'Content-Length', '38.0']],
  ['length zero', ['Content-Type', 'application/json', 'Content-Length', '0']],
  ['length over cap', ['Content-Type', 'application/json', 'Content-Length', String(MAX_BODY + 1)]],
  ['header injection', ['Content-Type', 'application/json', 'Content-Length', '38', 'x-proof', 'value\r\nother: value']],
]) test(`raw framing rejects ${name}`, async () => {
  const h = harness(); const owner = h.create();
  await rejected(h, owner, () => { h.secure(); h.headers(response(), { rawHeaders: headers }); });
});

test('merged header getters and raw header accessors/proxies are never inspected', async () => {
  const h = harness(); const owner = h.create(); let reads = 0;
  const pending = owner.transport.callRead(request()); h.secure();
  const res = h.headers();
  Object.defineProperty(res, 'headers', { get() { reads += 1; throw new Error('private header'); } });
  h.end(); h.closeEvents(); assert.equal(await pending, '{}'); assert.equal(reads, 0);
  await h.cleanup(owner); h.assertDrained();
  const bad = harness(); const other = bad.create();
  await rejected(bad, other, () => {
    bad.secure();
    const raw = ['Content-Type', 'application/json', 'Content-Length', '38'];
    Object.defineProperty(raw, '1', { get() { reads += 1; throw new Error('private header'); } });
    bad.headers(response(), { rawHeaders: raw });
  });
  assert.equal(reads, 0);
});

test('raw header pair and byte budgets reject exact boundary plus one', async () => {
  for (const over of [false, true]) {
    const h = harness(); const owner = h.create(); const pending = owner.transport.callRead(request()); h.secure();
    const raw = ['Content-Type', 'application/json', 'Content-Length', String(response().length)];
    for (let index = 0; index < (over ? 63 : 62); index += 1) raw.push(`x-${index}`, 'a');
    h.headers(response(), { rawHeaders: raw });
    if (!over) { h.end(); h.closeEvents(); assert.equal(await pending, '{}'); }
    else await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
    await h.cleanup(owner); h.assertDrained();
  }
  for (const over of [false, true]) {
    const h = harness(); const owner = h.create(); const pending = owner.transport.callRead(request()); h.secure();
    const raw = ['Content-Type', 'application/json', 'Content-Length', String(response().length), 'x-padding', ''];
    const used = raw.reduce((sum, value) => sum + value.length, 2) + raw.length / 2 * 4;
    raw[5] = 'a'.repeat(16384 - used + Number(over));
    h.headers(response(), { rawHeaders: raw });
    if (!over) { h.end(); h.closeEvents(); assert.equal(await pending, '{}'); }
    else await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
    await h.cleanup(owner); h.assertDrained();
  }
});

for (const attack of ['underrun', 'overrun', 'incomplete', 'trailers', 'invalid UTF8', 'BOM', 'HTTP version', 'early close', 'duplicate response', 'duplicate end', 'data after end']) {
  test(`response body attack ${attack} is terminal without successful text`, async () => {
    const h = harness(); const owner = h.create(); const pending = owner.transport.callRead(request()); h.secure();
    const text = response();
    const res = h.headers(text, attack === 'HTTP version' ? { httpVersion: '2.0', httpVersionMajor: 2, httpVersionMinor: 0 } : {});
    if (attack === 'HTTP version') { /* refusal happened at headers */ }
    else if (attack === 'early close') res.emit('close');
    else if (attack === 'duplicate response') h.requests[0].emit('response', res);
    else {
      const bytes = attack === 'invalid UTF8' ? Buffer.alloc(text.length, 255)
        : attack === 'BOM' ? Buffer.from('\ufeff' + text.slice(3))
          : Buffer.from(attack === 'underrun' ? text.slice(0, -1) : attack === 'overrun' ? text + ' ' : text);
      res.emit('data', bytes);
      res.complete = attack !== 'incomplete';
      if (attack === 'trailers') res.rawTrailers = ['x-proof', 'untrusted'];
      res.emit('end');
      if (attack === 'duplicate end') res.emit('end');
      if (attack === 'data after end') res.emit('data', Buffer.from('x'));
    }
    h.closeEvents();
    await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
    await h.cleanup(owner); h.assertDrained();
  });
}

test('UTF8 chunk boundaries preserve exact uint64 lexemes and raw JSON whitespace', async () => {
  const h = harness(); const owner = h.create(); const pending = owner.transport.callRead(request()); h.secure();
  const result = '{ "chainIdentifier":18446744073709551615,"text":"é" }';
  const wire = response(1, result); const bytes = Buffer.from(wire);
  const res = h.headers(wire);
  for (let index = 0; index < bytes.length; index += 1) res.emit('data', bytes.subarray(index, index + 1));
  res.complete = true; res.emit('end'); h.closeEvents();
  assert.equal(await pending, result); await h.cleanup(owner); h.assertDrained();
});

test('bounded envelope exact cap reaches the adapter unchanged and cap plus one is refused by the owner', async () => {
  const h = harness(); const owner = h.create(); const pending = owner.transport.callRead(request()); h.secure();
  // The envelope permits bounded trailing whitespace; the adapter still owns
  // its independent result/parser limits and accepts only its exact envelope.
  const wire = response() + ' '.repeat(MAX_BODY - response().length);
  h.headers(wire); h.end(wire); h.closeEvents(); assert.equal(await pending, '{}');
  await h.cleanup(owner); h.assertDrained();
  const bad = harness(); const other = bad.create();
  await rejected(bad, other, () => { bad.secure(); bad.headers('x', { rawHeaders: ['Content-Type', 'application/json', 'Content-Length', String(MAX_BODY + 1)] }); });
});

for (const event of ['information', 'continue', 'upgrade', 'connect', 'timeout', 'error', 'abort']) {
  test(`unexpected native request ${event} event cannot advance evidence`, async () => {
    const h = harness(); const owner = h.create();
    await rejected(h, owner, () => h.requests[0].emit(event, new Error('private native detail')));
  });
}

for (const phase of ['before socket', 'handshake', 'headers', 'partial body', 'body ended']) {
  test(`absolute deadline at ${phase} fails permanently even with late completion`, async () => {
    const h = harness(); const owner = h.create(); const pending = owner.transport.callRead(request());
    if (phase !== 'before socket') h.attach();
    if (['headers', 'partial body', 'body ended'].includes(phase)) h.secure();
    if (['partial body', 'body ended'].includes(phase)) h.headers();
    if (phase === 'partial body') h.requests[0].testResponse.emit('data', Buffer.from('{'));
    if (phase === 'body ended') h.end();
    h.advance(100);
    await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
    h.closeEvents();
    await assert.rejects(owner.transport.callRead(request()), codeIs(ADAPTER_PREFIX + 'unavailable'));
    assert.equal(h.requests.length, 1); await h.cleanup(owner); h.assertDrained();
  });
}

test('delayed deadline callback cannot admit body or socket closure beyond the absolute deadline', async () => {
  const h = harness(); const owner = h.create(); const pending = owner.transport.callRead(request());
  h.secure(); h.headers(); h.end(); h.advance(101, false); h.closeEvents();
  await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
  await h.cleanup(owner); h.assertDrained();
});

for (const phase of ['inert', 'before socket', 'handshake', 'headers', 'partial body', 'body ended']) {
  test(`close at ${phase} denies admission synchronously and returns one cached prehandled native promise`, async () => {
    const h = harness(); const owner = h.create();
    let pending;
    if (phase !== 'inert') pending = owner.transport.callRead(request());
    if (['handshake', 'headers', 'partial body', 'body ended'].includes(phase)) h.attach();
    if (['headers', 'partial body', 'body ended'].includes(phase)) h.secure();
    if (['partial body', 'body ended'].includes(phase)) h.headers();
    if (phase === 'partial body') h.requests[0].testResponse.emit('data', Buffer.from('{'));
    if (phase === 'body ended') h.end();
    const closing = owner.close();
    assert.equal(closing, owner.close());
    assert.equal(utilTypes.isPromise(closing), true);
    assert.equal(Object.getPrototypeOf(closing), Promise.prototype);
    assert.deepEqual(Object.getOwnPropertyNames(closing), []);
    const count = h.requests.length;
    if (pending) await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
    await assert.rejects(owner.transport.callRead(request()), codeIs(ADAPTER_PREFIX + 'unavailable'));
    assert.equal(h.requests.length, count);
    if (pending) h.closeEvents();
    h.advance(20);
    assert.equal(await closing, undefined);
    assert.equal(owner.close(), closing);
    h.assertDrained();
  });
}

test('close argument rejection does not inspect input, activate close, or consume the valid cached close', async () => {
  const h = harness(); const owner = h.create(); let traps = 0;
  const hostile = new Proxy({}, { get() { traps += 1; throw new Error('private'); }, ownKeys() { traps += 1; return []; } });
  await assert.rejects(owner.close(hostile), error => ownerError(error, 'configuration_rejected'));
  const pending = owner.transport.callRead(request()); h.complete(); assert.equal(await pending, '{}');
  assert.equal(traps, 0); await h.cleanup(owner); h.assertDrained();
});

test('missing socket-close evidence permanently rejects close and late events never rehabilitate it', async () => {
  const h = harness(); const owner = h.create(); const pending = owner.transport.callRead(request()); h.secure();
  const late = h.sockets[0].listeners('close').slice();
  const closing = owner.close(); h.requests[0].emit('close'); h.advance(20);
  await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
  await assert.rejects(closing, error => ownerError(error, 'close_uncertain'));
  for (const callback of late) callback(false);
  assert.equal(owner.close(), closing);
  await assert.rejects(owner.close(), error => ownerError(error, 'close_uncertain'));
  h.assertDrained();
});

test('late socket assignment during no-socket cleanup requires its own close evidence', async () => {
  const h = harness(); const owner = h.create(); const pending = owner.transport.callRead(request());
  const closing = owner.close(); h.requests[0].emit('close');
  const socket = h.attach(); assert.equal(socket.destroyCalls, 1);
  h.advance(20);
  await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
  await assert.rejects(closing, error => ownerError(error, 'close_uncertain'));
  socket.emit('close'); await assert.rejects(owner.close(), error => ownerError(error, 'close_uncertain'));
  h.assertDrained();
});

test('request fourteen performs no native construction and the lifetime budget never resets', async () => {
  const h = harness(); const owner = h.create();
  for (let index = 1; index <= 13; index += 1) {
    const pending = owner.transport.callRead(request()); h.complete(response(index)); assert.equal(await pending, '{}');
  }
  const before = [h.requests.length, h.agents.length, h.timers.length];
  await assert.rejects(owner.transport.callRead(request()), codeIs(ADAPTER_PREFIX + 'unavailable'));
  await assert.rejects(owner.transport.callRead(request()), codeIs(ADAPTER_PREFIX + 'unavailable'));
  assert.deepEqual([h.requests.length, h.agents.length, h.timers.length], before);
  await h.cleanup(owner); h.assertDrained();
});

test('one-active admission and native reentrancy cannot create a second request', async () => {
  const h = harness(); const owner = h.create(); let nested;
  h.hooks.request = () => { nested = owner.transport.callRead(request()); };
  const pending = owner.transport.callRead(request());
  await assert.rejects(nested, codeIs(ADAPTER_PREFIX + 'busy'));
  assert.equal(h.requests.length, 1); h.complete(); assert.equal(await pending, '{}');
  await h.cleanup(owner); h.assertDrained();
});

test('synchronous close inside native request construction drains the returned generation without evidence', async () => {
  const h = harness(); const owner = h.create(); let closing;
  h.hooks.request = () => { closing = owner.close(); };
  const pending = owner.transport.callRead(request());
  await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
  assert.equal(h.requests[0].destroyCalls, 1); h.closeEvents(); h.advance(20);
  await closing; h.assertDrained();
});

test('native-returned proxies and event accessors invoke no hostile getters or traps', async () => {
  let traps = 0;
  const h = harness(); const owner = h.create();
  h.hooks.request = req => new Proxy(req, { get() { traps += 1; throw new Error('private'); }, getPrototypeOf() { traps += 1; return null; } });
  const pending = owner.transport.callRead(request());
  await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
  const closing = owner.close(); h.advance(20);
  await assert.rejects(closing, error => ownerError(error, 'close_uncertain'));
  assert.equal(traps, 0);
  const other = harness(); const second = other.create();
  await rejected(other, second, () => {
    const socket = other.attach();
    Object.defineProperty(socket, 'authorized', { get() { traps += 1; throw new Error('private'); }, configurable: true });
    socket.emit('secureConnect');
  });
  assert.equal(traps, 0);
});

test('initial Object then and noncanonical Promise structure reject construction without capability calls', () => {
  const original = Object.getOwnPropertyDescriptor(Object.prototype, 'then');
  const constructor = Object.getOwnPropertyDescriptor(Promise.prototype, 'constructor');
  let getters = 0;
  try {
    Object.defineProperty(Object.prototype, 'then', { configurable: true, get() { getters += 1; throw new Error('private'); } });
    const h = harness(); assert.throws(() => h.create(), error => ownerError(error, 'configuration_rejected'));
    assert.equal(h.requests.length + h.agents.length + h.timers.length, 0);
  } finally { if (original === undefined) delete Object.prototype.then; else Object.defineProperty(Object.prototype, 'then', original); }
  try {
    Object.defineProperty(Promise.prototype, 'constructor', { configurable: true, get() { getters += 1; throw new Error('private'); } });
    const h = harness(); assert.throws(() => h.create(), error => ownerError(error, 'configuration_rejected'));
    assert.equal(h.requests.length + h.agents.length + h.timers.length, 0);
  } finally { Object.defineProperty(Promise.prototype, 'constructor', constructor); }
  assert.equal(getters, 0);
});

for (const drift of ['inherited then', 'constructor', 'species']) {
  test(`post-construction ${drift} drift is prehandled and terminal without accessor reads`, async () => {
    const h = harness(); const owner = h.create(); let getters = 0; const unhandled = [];
    const objectThen = Object.getOwnPropertyDescriptor(Object.prototype, 'then');
    const ctor = Object.getOwnPropertyDescriptor(Promise.prototype, 'constructor');
    const species = Object.getOwnPropertyDescriptor(Promise, Symbol.species);
    const observe = () => { unhandled.push(true); };
    process.on('unhandledRejection', observe);
    h.hooks.request = () => {
      const descriptor = { configurable: true, get() { getters += 1; throw new Error('private intrinsic'); } };
      if (drift === 'inherited then') Object.defineProperty(Object.prototype, 'then', descriptor);
      if (drift === 'constructor') Object.defineProperty(Promise.prototype, 'constructor', descriptor);
      if (drift === 'species') Object.defineProperty(Promise, Symbol.species, descriptor);
    };
    let pending;
    try { pending = owner.transport.callRead(request()); }
    finally {
      if (objectThen === undefined) delete Object.prototype.then; else Object.defineProperty(Object.prototype, 'then', objectThen);
      Object.defineProperty(Promise.prototype, 'constructor', ctor);
      Object.defineProperty(Promise, Symbol.species, species);
    }
    try {
      await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
      await h.cleanup(owner);
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(unhandled.length, 0); assert.equal(getters, 0); assert.equal(h.requests.length, 1);
      await assert.rejects(owner.transport.callRead(request()), codeIs(ADAPTER_PREFIX + 'unavailable'));
    } finally { process.off('unhandledRejection', observe); }
  });
}

test('owned prehandled promises tolerate unread runtime symbols and preserve adapter admission failures', async () => {
  const h = harness(); const owner = h.create(); let getters = 0;
  const pending = owner.transport.callRead(request());
  Object.defineProperty(pending, Symbol('runtime marker'), { get() { getters += 1; throw new Error('private symbol'); } });
  await assert.rejects(owner.transport.callRead(request()), codeIs(ADAPTER_PREFIX + 'busy'));
  h.complete(); assert.equal(await pending, '{}');
  await assert.rejects(owner.transport.callRead({ method: FRONTIER, params: [] }), codeIs(ADAPTER_PREFIX + 'input_rejected'));
  assert.equal(getters, 0); assert.equal(h.requests.length, 1); await h.cleanup(owner); h.assertDrained();
});

test('static source owns no importer, credential, environment, resolver, persistence or wallet capabilities', () => {
  const source = sourceText();
  assert.equal((source.match(/^export\s/gm) ?? []).length, 1);
  assert.doesNotMatch(source, /node:(?:fs|dns|child_process|worker_threads)|process\.(?:env|on)|globalThis|fetch\s*\(|new URL\s*\(|\.listen\s*\(|console\.|readFile|writeFile|setInterval|sign\s*\(|prepareBlock|publishRawTransaction|wallet|keystore|mnemonic/i);
  assert.doesNotMatch(source, /(?:https?:\/\/|ws:\/\/|8\.8\.8\.8|rpc\.synthetic-public\.org)/);
  assert.match(source, /UNSIGNED/);
  assert.match(source, /strings.*eras|eras.*strings/i);
});

function fixtureAddress(byte) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const bytes = [0, ...Array(19).fill(byte)];
  const words = []; let acc = 0; let bits = 0;
  for (const value of bytes) { acc = (acc << 8) | value; bits += 8; while (bits >= 5) { bits -= 5; words.push((acc >>> bits) & 31); } }
  let checksum = 1;
  for (const word of [3, 0, 26, ...words, 0, 0, 0, 0, 0, 0]) {
    const top = checksum >>> 25; checksum = ((checksum & 0x1ffffff) << 5) ^ word;
    for (const [index, generator] of [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3].entries()) if ((top >>> index) & 1) checksum ^= generator;
  }
  checksum = (checksum ^ 1) >>> 0;
  return 'z1' + [...words, ...Array.from({ length: 6 }, (_, index) => (checksum >>> (5 * (5 - index))) & 31)].map(word => alphabet[word]).join('');
}
const USER = fixtureAddress(17);
const RECIPIENT = fixtureAddress(34);
const GENESIS = '11'.repeat(32);
const LIBP2P = '01'.repeat(32);
const DYNAMIC = '02'.repeat(32);
function collectorInput() {
  return {
    phase: 'UNSIGNED', expectedChainProfile: { version: 1, chainIdentifier: '73404', genesisMomentumHash: GENESIS },
    compiledSporkIds: { dynamicPlasmaId: DYNAMIC, libp2pId: LIBP2P },
    quoteRequest: { address: USER, blockType: 2, toAddress: RECIPIENT, data: Buffer.alloc(32, 7).toString('base64') },
  };
}
function momentum(overrides = {}) {
  return {
    version: 2, chainIdentifier: 73404, hash: '33'.repeat(32), previousHash: '44'.repeat(32),
    height: 42, timestamp: 1234, data: '', content: [], changesHash: '55'.repeat(32),
    publicKey: Buffer.alloc(32, 6).toString('base64'), signature: Buffer.alloc(64, 8).toString('base64'),
    nextFusionPrice: 1200, nextWorkPrice: 1100, producer: USER, ...overrides,
  };
}
function replies(count = 2) {
  const sporks = Array.from({ length: count }, (_, index) => ({
    id: index === 0 ? LIBP2P : index === 1 ? DYNAMIC : index.toString(16).padStart(64, '0'),
    name: index === 0 ? 'libp2p' : index === 1 ? 'dynamic-plasma' : `fixture-${index}`,
    description: 'Synthetic.', activated: index !== 0, enforcementHeight: 10,
  }));
  return [
    momentum(), { count: 42, list: [momentum({ version: 1, height: 2, hash: '22'.repeat(32), previousHash: GENESIS, nextFusionPrice: 0, nextWorkPrice: 0 })] },
    ...Array.from({ length: Math.max(1, Math.ceil(count / 128)) }, (_, index) => ({ count, list: sporks.slice(index * 128, (index + 1) * 128) })),
    { MaxBasePlasmaInMomentum: 4200000, FusedPlasmaTarget: 1050000, PowPlasmaTarget: 1050000, MaxPriceChangePercent: 10, PriceChangeDenominator: 20 },
    { availablePlasma: 10000, basePlasma: 21000, requiredDifficulty: 20901000 }, momentum(),
  ];
}
function composition(first = replies(), second = replies(), failFirst = false) {
  const log = [];
  const endpoints = [first, second].map((values, endpoint) => {
    const h = harness(); const owner = h.create();
    h.hooks.end = (req, body) => {
      const parsed = JSON.parse(body.toString());
      log.push({ endpoint, ...parsed });
      if (endpoint === 0 && failFirst) { req.emit('error', new Error('private source failure')); return; }
      const raw = values[parsed.id - 1];
      assert.notEqual(raw, undefined);
      h.complete(response(parsed.id, typeof raw === 'string' ? raw : JSON.stringify(raw)));
    };
    return { h, owner };
  });
  return {
    endpoints, log,
    collector: createDynamicPlasmaObservationCollector({ transports: endpoints.map(value => value.owner.transport) }),
    async close() { for (const { h, owner } of endpoints) { await h.cleanup(owner); h.assertDrained(); } },
  };
}

test('owner adapter collector normalizer preserve all five methods, order, identical quote and DP_ACTIVE', async () => {
  const h = composition();
  const output = await h.collector.collect(collectorInput());
  assert.equal(normalizeDynamicPlasmaObservation(output).classification, 'DP_ACTIVE');
  assert.deepEqual(h.log.map(item => item.endpoint), [...Array(6).fill(0), ...Array(6).fill(1)]);
  assert.deepEqual(h.log.slice(0, 6).map(item => item.method), [FRONTIER, HEIGHT, SPORK, VARIABLES, QUOTE, FRONTIER]);
  assert.deepEqual(h.log.filter(item => item.method === QUOTE).map(item => item.params[0]), [collectorInput().quoteRequest, collectorInput().quoteRequest]);
  assert.equal(Object.isFrozen(output), true);
  assert.equal(Object.hasOwn(output, 'quoteRequest'), false);
  await h.close();
});

test('full eight-page collector pagination consumes exactly thirteen fresh requests per owner', async () => {
  const h = composition(replies(1024), replies(1024));
  const output = await h.collector.collect(collectorInput());
  assert.notEqual(output.endpointObservations[0], null); assert.notEqual(output.endpointObservations[1], null);
  assert.equal(h.log.length, 26);
  for (const endpoint of [0, 1]) assert.deepEqual(h.log.filter(item => item.endpoint === endpoint && item.method === SPORK).map(item => item.params), Array.from({ length: 8 }, (_, index) => [index, 128]));
  await h.close();
});

test('mandatory UNSIGNED refusal performs no native owner I/O', async () => {
  const h = composition();
  await assert.rejects(h.collector.collect({ ...collectorInput(), phase: 'SIGNED' }));
  assert.equal(h.log.length, 0);
  assert.equal(h.endpoints.every(({ h: native }) => native.requests.length + native.agents.length + native.timers.length === 0), true);
  await h.close();
});

test('PRE_DP and valid endpoint disagreement remain normalizer decisions', async () => {
  const legacy = replies(); legacy[0] = momentum({ version: 1, nextFusionPrice: 0, nextWorkPrice: 0 });
  legacy[5] = legacy[0]; legacy[2].list[1].activated = false; legacy[4].requiredDifficulty = 16500000;
  const pre = composition(legacy, legacy); assert.equal(normalizeDynamicPlasmaObservation(await pre.collector.collect(collectorInput())).classification, 'PRE_DP'); await pre.close();
  const second = replies(); second[4].requiredDifficulty += 1;
  const disagree = composition(replies(), second);
  assert.equal(normalizeDynamicPlasmaObservation(await disagree.collector.collect(collectorInput())).reason, 'ENDPOINT_OBSERVATION_MISMATCH'); await disagree.close();
});

test('owner failure leaves A null and B cannot replace A or authorize signing', async () => {
  const h = composition(replies(), replies(), true);
  const output = await h.collector.collect(collectorInput());
  assert.equal(output.endpointObservations[0], null); assert.notEqual(output.endpointObservations[1], null);
  assert.equal(h.log.filter(item => item.endpoint === 0).length, 1);
  assert.equal(h.log.filter(item => item.endpoint === 1).length, 6);
  assert.equal(normalizeDynamicPlasmaObservation(output).classification, 'UNAVAILABLE');
  assert.deepEqual(Object.keys(output), ['expectedChainProfile', 'compiledSporkIds', 'endpointObservations']);
  await h.close();
});

test('downstream numeric and parser limits remain effective after native byte transport', async () => {
  for (const invalid of ['9007199254740992', '01100', '11e2', '1100.0']) {
    const first = replies(); first[0] = JSON.stringify(first[0]).replace('"nextWorkPrice":1100', `"nextWorkPrice":${invalid}`);
    const h = composition(first);
    const output = await h.collector.collect(collectorInput());
    assert.equal(output.endpointObservations[0], null); assert.notEqual(output.endpointObservations[1], null); await h.close();
  }
  const first = replies(); first[0] = JSON.stringify(first[0]).replace('"data":""', `"data":"${'x'.repeat(65537)}"`);
  const h = composition(first); assert.equal((await h.collector.collect(collectorInput())).endpointObservations[0], null); await h.close();
});

test('synchronous native destruction cannot skip agent teardown or settle before cleanup completes', async () => {
  const h = harness(); const owner = h.create(); const pending = owner.transport.callRead(request());
  h.secure(); h.headers();
  h.hooks.requestDestroy = req => { req.emit('close'); req.testSocket.emit('close', false); };
  h.end();
  assert.equal(await pending, '{}');
  assert.equal(h.agents[0].destroyCalls, 1);
  assert.equal(h.responses[0].destroyCalls, 1);
  assert.equal(h.sockets[0].destroyCalls, 1);
  await h.cleanup(owner); h.assertDrained();
});

for (const resource of ['socket', 'request without socket']) {
  test(`delayed close-grace timer cannot accept a late ${resource} close`, async () => {
    const h = harness(); const owner = h.create(); const pending = owner.transport.callRead(request());
    if (resource === 'socket') h.secure();
    const closing = owner.close(); h.advance(21, false); h.closeEvents(); h.advance(0);
    await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
    await assert.rejects(closing, error => ownerError(error, 'close_uncertain'));
    h.assertDrained();
  });
}

test('a duplicate distinct response is itself destroyed and retains only the stateless error sink', async () => {
  const h = harness(); const owner = h.create(); const pending = owner.transport.callRead(request());
  h.secure(); h.headers(); h.headers();
  await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
  assert.equal(h.responses[1].destroyCalls, 1);
  await h.cleanup(owner); h.assertDrained();
});

test('duplicate delivery of the same socket does not duplicate destruction or tombstone listeners', async () => {
  const h = harness(); const owner = h.create(); const pending = owner.transport.callRead(request());
  const socket = h.attach(); h.requests[0].emit('socket', socket);
  await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
  assert.equal(socket.destroyCalls, 1);
  await h.cleanup(owner); h.assertDrained();
});

test('a throwing pinned-lookup callback is never called twice or used as fallback', async () => {
  const h = harness(); const owner = h.create(); const pending = owner.transport.callRead(request());
  let callbacks = 0;
  h.requests[0].options.lookup(HOST, { family: 4 }, () => { callbacks += 1; throw new Error('private callback'); });
  assert.equal(callbacks, 1);
  await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
  await h.cleanup(owner); h.assertDrained();
});

test('captured validation does not dynamically dispatch an inherited array iterator', async () => {
  const h = harness(); const config = configuration(); let reads = 0; let owner;
  const original = Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator);
  try {
    Object.defineProperty(Array.prototype, Symbol.iterator, { configurable: true, get() { reads += 1; throw new Error('private iterator'); } });
    owner = h.factory(config);
  } finally { Object.defineProperty(Array.prototype, Symbol.iterator, original); }
  assert.equal(reads, 0); await owner.close();
});

test('captured header normalization does not dispatch a replacement string intrinsic', async () => {
  const h = harness(); const owner = h.create(); const pending = owner.transport.callRead(request());
  const original = String.fromCharCode; let calls = 0;
  try {
    String.fromCharCode = () => { calls += 1; throw new Error('private intrinsic'); };
    h.complete();
  } finally { String.fromCharCode = original; }
  assert.equal(await pending, '{}'); assert.equal(calls, 0); await h.cleanup(owner); h.assertDrained();
});

test('owned outgoing bytes are erased only after proven closure and then all listeners are detached', async () => {
  const h = harness(); const owner = h.create(); let owned;
  h.hooks.end = (req, bytes) => { owned = bytes; };
  const pending = owner.transport.callRead(request()); h.secure(); h.headers(); h.end();
  assert.equal(owned.some(byte => byte !== 0), true);
  h.closeEvents(); assert.equal(await pending, '{}');
  assert.equal(owned.every(byte => byte === 0), true);
  await h.cleanup(owner); h.assertDrained();
});

// Native HTTPS makes an ordinary intermediate options object. No option or
// header key may therefore inherit a post-import setter, even when the owner
// itself constructs every property without invoking that setter.
for (const key of [
  'protocol', 'hostname', 'port', 'path', 'method', 'family', 'autoSelectFamily',
  'lookup', 'servername', 'rejectUnauthorized', 'checkServerIdentity',
  'minVersion', 'maxVersion', 'ALPNProtocols', 'agent', 'headers', 'setHost',
  'maxHeaderSize', 'insecureHTTPParser', 'joinDuplicateHeaders',
  'keepAlive', 'maxSockets', 'maxTotalSockets', 'maxFreeSockets', 'maxCachedSessions',
  'Host', 'Content-Type', 'Accept', 'Content-Length', 'Connection',
  'unrelatedInstrumentation',
]) {
  test(`post-import inherited ${key} setter rejects factory and call admission without native work`, async () => {
    const h = harness(); const owner = h.create(); const config = configuration(); const input = request();
    const original = Object.getOwnPropertyDescriptor(Object.prototype, key);
    let setters = 0; let factoryError; let accidentallyCreated; let pending;
    try {
      Object.defineProperty(Object.prototype, key, { configurable: true, set() { setters += 1; throw new Error('private setter'); } });
      try { accidentallyCreated = h.factory(config); } catch (error) { factoryError = error; }
      pending = owner.transport.callRead(input);
    } finally {
      if (original === undefined) delete Object.prototype[key]; else Object.defineProperty(Object.prototype, key, original);
    }
    if (h.requests.length !== 0) h.complete();
    if (accidentallyCreated) await accidentallyCreated.close();
    await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
    assert.equal(ownerError(factoryError, 'configuration_rejected'), true);
    assert.equal(setters, 0);
    assert.equal(h.requests.length + h.agents.length + h.timers.length, 0);
    // Owner-only drift can consume the adapter's opaque ID, but cannot consume
    // a native owner attempt. Restoration never reopens this owner's admission.
    await assert.rejects(owner.transport.callRead(input), codeIs(ADAPTER_PREFIX + 'unavailable'));
    await owner.close();
    const replacement = h.create(); const next = replacement.transport.callRead(input);
    assert.equal(JSON.parse(h.bodies[0].toString()).id, 1);
    h.complete(); assert.equal(await next, '{}'); await h.cleanup(replacement); h.assertDrained();
  });
}

for (const change of ['delete', 'value', 'flags', 'symbol']) {
  test(`complete Object prototype baseline rejects ${change} drift without calling replaced authority`, async () => {
    const h = harness(); const owner = h.create(); const input = request();
    const key = change === 'symbol' ? Symbol('unrelated prototype marker') : 'toString';
    const original = Object.getOwnPropertyDescriptor(Object.prototype, key);
    let reads = 0; let pending;
    try {
      if (change === 'delete') delete Object.prototype[key];
      if (change === 'value') Object.defineProperty(Object.prototype, key, { ...original, value() { reads += 1; throw new Error('private replacement'); } });
      if (change === 'flags') Object.defineProperty(Object.prototype, key, { ...original, enumerable: !original.enumerable });
      if (change === 'symbol') Object.defineProperty(Object.prototype, key, { configurable: true, get() { reads += 1; throw new Error('private symbol'); } });
      pending = owner.transport.callRead(input);
    } finally {
      if (original === undefined) delete Object.prototype[key]; else Object.defineProperty(Object.prototype, key, original);
    }
    if (h.requests.length !== 0) h.complete();
    await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
    assert.equal(reads, 0); assert.equal(h.requests.length + h.agents.length + h.timers.length, 0);
    await assert.rejects(owner.transport.callRead(input), codeIs(ADAPTER_PREFIX + 'unavailable'));
    await owner.close();
  });
}

for (const boundary of ['agent construction', 'request construction', 'response settlement', 'cleanup settlement']) {
  test(`unrelated Object prototype drift during ${boundary} prevents evidence and same-owner reuse`, async () => {
    const h = harness(); const owner = h.create(); let pending; let reads = 0;
    const install = () => { Object.defineProperty(Object.prototype, 'ownerUnrelatedDrift', { configurable: true, get() { reads += 1; throw new Error('private drift'); } }); };
    try {
      if (boundary === 'agent construction') h.hooks.agent = install;
      if (boundary === 'request construction') h.hooks.request = install;
      pending = owner.transport.callRead(request());
      if (boundary === 'response settlement') { h.secure(); h.headers(); install(); h.end(); }
      if (boundary === 'cleanup settlement') { h.secure(); h.headers(); h.end(); install(); h.closeEvents(); }
    } finally { delete Object.prototype.ownerUnrelatedDrift; }
    if (h.requests.length !== 0) h.closeEvents();
    await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
    assert.equal(reads, 0);
    assert.equal(h.requests.length, boundary === 'agent construction' ? 0 : 1);
    await assert.rejects(owner.transport.callRead(request()), codeIs(ADAPTER_PREFIX + 'unavailable'));
    await h.cleanup(owner); h.assertDrained();
  });
}

for (const key of ['get', 'set']) {
  test(`sanitized configuration and cleanup never read inherited descriptor ${key} accessors`, async () => {
    const h = harness(); const owner = h.create(); const config = configuration(); let reads = 0; let factoryError; let escaped;
    const pending = owner.transport.callRead(request()); h.secure();
    const poison = Object.assign(Object.create(null), { configurable: true, get() { reads += 1; throw new Error('private descriptor accessor'); } });
    try {
      Object.defineProperty(Object.prototype, key, poison);
      try { h.factory(config); } catch (error) { factoryError = error; }
      try { owner.close(); } catch (error) { escaped = error; }
    } finally { delete Object.prototype[key]; }
    assert.equal(reads, 0);
    assert.equal(escaped, undefined);
    assert.equal(ownerError(factoryError, 'configuration_rejected'), true);
    await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
    await h.cleanup(owner); h.assertDrained();
  });
}

for (const operation of ['requestDestroy', 'responseDestroy', 'socketDestroy', 'agentDestroy', 'clearTimer']) {
  test(`native ${operation} failure cannot report certain closure or successful evidence`, async () => {
    const h = harness(); const owner = h.create(); const pending = owner.transport.callRead(request());
    h.secure(); h.headers(); h.hooks[operation] = () => { throw new Error('private cleanup'); };
    h.end(); h.closeEvents();
    await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
    const closing = owner.close(); h.advance(20);
    await assert.rejects(closing, error => ownerError(error, 'close_uncertain'));
    assert.equal(owner.close(), closing);
    await assert.rejects(owner.transport.callRead(request()), codeIs(ADAPTER_PREFIX + 'unavailable'));
    h.assertDrained();
  });
}

test('missing request-close evidence without any socket is permanently close-uncertain', async () => {
  const h = harness(); const owner = h.create(); const pending = owner.transport.callRead(request());
  const closing = owner.close(); h.advance(20);
  await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
  await assert.rejects(closing, error => ownerError(error, 'close_uncertain'));
  h.requests[0].emit('close'); await assert.rejects(owner.close(), error => ownerError(error, 'close_uncertain'));
  h.assertDrained();
});

test('retained callbacks and canceled timers from a retired generation cannot change a later read', async () => {
  const h = harness(); const owner = h.create(); const first = owner.transport.callRead(request());
  h.secure(); h.headers();
  const callbacks = [...h.requests[0].listeners('response'), ...h.sockets[0].listeners('close')];
  const timers = h.timers.map(handle => handle.callback);
  h.end(); h.closeEvents(); assert.equal(await first, '{}');
  const second = owner.transport.callRead(request()); let settled = false;
  second.then(() => { settled = true; });
  for (const callback of timers) callback();
  // A retired response callback can only drain an independently supplied
  // native object; it cannot attach it to or settle the active generation.
  callbacks[1](false);
  await tick(); assert.equal(settled, false);
  h.complete(response(2)); assert.equal(await second, '{}');
  await h.cleanup(owner); h.assertDrained();
});

for (const boundary of ['now', 'timer', 'agent', 'end']) {
  test(`reentrant close during native ${boundary} cannot admit any later native construction`, async () => {
    const h = harness(); const owner = h.create(); let closing;
    h.hooks[boundary] = () => { closing = owner.close(); };
    const pending = owner.transport.callRead(request());
    await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
    assert.equal(h.requests.length, boundary === 'end' ? 1 : 0);
    assert.equal(h.agents.length, boundary === 'agent' || boundary === 'end' ? 1 : 0);
    assert.equal(h.agents.every(agent => agent.destroyCalls === 1), true);
    if (h.requests.length) h.closeEvents();
    h.advance(20); await closing; h.assertDrained();
  });
}

test('slow partial responses never reset the absolute deadline or become later evidence', async () => {
  const h = harness(); const owner = h.create(); const pending = owner.transport.callRead(request());
  h.secure(); const res = h.headers();
  for (let index = 0; index < 9; index += 1) { h.advance(10); res.emit('data', Buffer.from(' ')); }
  h.advance(10); res.emit('data', Buffer.from(response()));
  await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
  await h.cleanup(owner); h.assertDrained();
});

test('an early native deadline callback reschedules only the remaining absolute budget', async () => {
  const h = harness(); const owner = h.create(); const pending = owner.transport.callRead(request());
  const first = h.timers[0]; first.fired = true; h.advance(10, false); first.callback();
  assert.equal(h.timers[1].delay, 90);
  h.complete(); assert.equal(await pending, '{}'); await h.cleanup(owner); h.assertDrained();
});

test('initial Promise species descriptor shape is checked without invoking an accessor', () => {
  const original = Object.getOwnPropertyDescriptor(Promise, Symbol.species); let reads = 0;
  try {
    Object.defineProperty(Promise, Symbol.species, { configurable: true, get() { reads += 1; throw new Error('private species'); } });
    const h = harness(); assert.throws(() => h.create(), error => ownerError(error, 'configuration_rejected'));
    assert.equal(h.requests.length + h.agents.length + h.timers.length, 0);
  } finally { Object.defineProperty(Promise, Symbol.species, original); }
  assert.equal(reads, 0);
});

test('inert close under inherited then drift stays prehandled and cached without getter execution', async () => {
  const h = harness(); const owner = h.create(); let reads = 0; let closing; let invalid;
  try {
    Object.defineProperty(Object.prototype, 'then', { configurable: true, get() { reads += 1; throw new Error('private inherited then'); } });
    invalid = owner.close({}); closing = owner.close(); assert.equal(owner.close(), closing);
  } finally { delete Object.prototype.then; }
  await assert.rejects(invalid, error => ownerError(error, 'configuration_rejected'));
  await assert.rejects(closing, error => ownerError(error, 'close_uncertain'));
  assert.equal(h.requests.length + h.agents.length + h.timers.length, 0); assert.equal(reads, 0);
  assert.equal(owner.close(), closing);
});

for (const reserved of ['internal', 'example.com', 'example.net', 'example.org']) {
  test(`public hostname guard rejects exact and every subdomain form of reserved ${reserved}`, async () => {
    const h = harness();
    for (const name of [reserved, `node.${reserved}`, `a.node.${reserved}`, reserved.toUpperCase(), `node.${reserved.toUpperCase()}`]) {
      assert.throws(() => h.create(configuration({}, { hostname: name })), error => ownerError(error, 'configuration_rejected'));
    }
    for (const name of reserved === 'internal' ? ['internalish.org', 'node.notinternal', 'internal.public.org'] : [`not${reserved}`, `${reserved}.public.org`]) {
      await h.create(configuration({}, { hostname: name })).close();
    }
    assert.equal(h.requests.length + h.agents.length + h.timers.length, 0);
  });
}

for (const first of ['request', 'socket']) {
  test(`successful evidence waits for both closure proofs when ${first} closes first`, async () => {
    const h = harness(); const owner = h.create(); const pending = owner.transport.callRead(request()); let settled = false;
    pending.then(() => { settled = true; }, () => { settled = true; });
    h.secure(); h.headers(); h.end();
    const req = h.requests[0]; const socket = h.sockets[0];
    if (first === 'request') req.emit('close'); else socket.emit('close', false);
    await tick(); const premature = settled;
    // Duplicate first-proof events still cannot substitute for the second.
    if (first === 'request') req.emit('close'); else socket.emit('close', false);
    if (first === 'request') socket.emit('close', false); else req.emit('close');
    assert.equal(await pending, '{}'); assert.equal(premature, false);
    await h.cleanup(owner); h.assertDrained();
  });
}

for (const missing of ['request', 'socket']) {
  for (const activeClose of [false, true]) {
    test(`missing ${missing} closure proof ${activeClose ? 'during explicit close' : 'after body end'} settles permanently uncertain`, async () => {
      const h = harness(); const owner = h.create(); const pending = owner.transport.callRead(request());
      h.secure(); if (!activeClose) { h.headers(); h.end(); }
      const closing = activeClose ? owner.close() : null;
      if (missing === 'request') h.sockets[0].emit('close', false); else h.requests[0].emit('close');
      h.advance(20);
      const cached = closing ?? owner.close();
      // Observe settlement explicitly: the missing-proof case must reject,
      // never remain pending when the grace callback has already fired.
      let state = 'pending'; cached.then(() => { state = 'fulfilled'; }, () => { state = 'rejected'; });
      await tick(); assert.equal(state, 'rejected');
      await assert.rejects(cached, error => ownerError(error, 'close_uncertain'));
      await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
      h.closeEvents(); assert.equal(owner.close(), cached);
      await assert.rejects(owner.close(), error => ownerError(error, 'close_uncertain'));
      await assert.rejects(owner.transport.callRead(request()), codeIs(ADAPTER_PREFIX + 'unavailable'));
      h.assertDrained();
    });
  }
}

test('flow-controlled native double requires the owner to start consumption after all guards exist', async () => {
  const h = harness({ flowControlled: true }); const owner = h.create(); const pending = owner.transport.callRead(request());
  h.secure(); const res = h.headers();
  h.end();
  if (res.resumeCalls === 0) { h.advance(100); h.closeEvents(); }
  else h.closeEvents();
  assert.equal(await pending, '{}'); assert.equal(res.resumeCalls, 1);
  await h.cleanup(owner); h.assertDrained();
});

test('real IncomingMessage from an in-memory HTTP parser needs no auxiliary response consumer', async () => {
  const h = harness({ nativeResponse: true }); const owner = h.create();
  const pending = owner.transport.callRead(request()); h.secure();
  h.hooks.requestDestroy = req => req.emit('close');
  h.hooks.socketDestroy = socket => socket.emit('close', false);
  let connectionCalls = 0; let incoming; let nativeRequest; const ownerListeners = [];
  const wire = new Duplex({ read() {}, write(chunk, encoding, callback) { callback(); } });
  wire.on('error', () => {});
  try {
    nativeRequest = new NativeClientRequest({
      method: 'POST', host: HOST, path: '/rpc',
      createConnection() { connectionCalls += 1; return wire; },
    });
    nativeRequest.on('error', () => {});
    nativeRequest.on('response', res => {
      incoming = res;
      assert.equal(Object.getPrototypeOf(res), NativeIncomingMessage.prototype);
      assert.equal(res.listenerCount('data'), 0); assert.equal(res.listenerCount('readable'), 0);
      const before = new Set(res.eventNames().flatMap(name => res.listeners(name)));
      h.requests[0].emit('response', res);
      for (const name of res.eventNames()) for (const listener of res.listeners(name)) if (!before.has(listener)) ownerListeners.push([name, listener]);
      assert.equal(res.listenerCount('data'), 1); assert.equal(res.listenerCount('readable'), 0);
    });
    nativeRequest.end();
    await new Promise(resolve => setImmediate(resolve));
    const text = response();
    wire.push(Buffer.from(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(text)}\r\nConnection: close\r\n\r\n${text}`));
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(connectionCalls, 1); assert.notEqual(incoming, undefined);
    const beganFlowing = incoming.readableFlowing === true;
    if (!beganFlowing) h.advance(100);
    assert.equal(await pending, '{}'); assert.equal(beganFlowing, true);
    for (const [name, listener] of ownerListeners) assert.equal(incoming.listeners(name).includes(listener), false);
    await h.cleanup(owner); h.assertDrained();
  } finally {
    nativeRequest?.destroy(); wire.destroy();
    await h.cleanup(owner);
  }
});

test('captured resume sees every guard and synchronous body delivery remains generation-bound', async () => {
  const h = harness({ flowControlled: true }); const owner = h.create(); let nested; let guardsPresent = false;
  h.hooks.requestDestroy = req => req.emit('close');
  h.hooks.socketDestroy = socket => socket.emit('close', false);
  h.hooks.resume = res => {
    guardsPresent = ['data', 'end', 'close', 'error', 'aborted'].every(name => res.listenerCount(name) === 1);
    nested = owner.transport.callRead(request());
    res.emit('data', Buffer.from(response())); res.complete = true; res.emit('end');
  };
  const pending = owner.transport.callRead(request()); h.secure(); const res = h.headers();
  if (res.resumeCalls === 0) h.advance(100);
  assert.equal(await pending, '{}'); assert.equal(guardsPresent, true);
  await assert.rejects(nested, codeIs(ADAPTER_PREFIX + 'busy'));
  assert.equal(h.requests.length, 1); assert.equal(res.resumeCalls, 1);
  h.hooks.resume = undefined; res.resume(); assert.equal(h.requests.length, 1);
  await h.cleanup(owner); h.assertDrained();
});

for (const change of ['close', 'timeout', 'prototype drift', 'throw']) {
  test(`native resume ${change} cannot release synchronous evidence before returning safely`, async () => {
    const h = harness({ flowControlled: true }); const owner = h.create(); let escaped; let resumed = false;
    h.hooks.requestDestroy = req => req.emit('close');
    h.hooks.socketDestroy = socket => socket.emit('close', false);
    h.hooks.resume = res => {
      resumed = true;
      res.emit('data', Buffer.from(response())); res.complete = true; res.emit('end');
      if (change === 'close') owner.close();
      if (change === 'timeout') h.advance(100, false);
      if (change === 'prototype drift') Object.defineProperty(Object.prototype, 'resumeDrift', { configurable: true, value: true });
      if (change === 'throw') throw new Error('private resume failure');
    };
    const pending = owner.transport.callRead(request()); h.secure();
    try { h.headers(); } catch (error) { escaped = error; }
    finally { delete Object.prototype.resumeDrift; }
    if (!resumed) h.advance(100);
    await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
    assert.equal(resumed, true); assert.equal(escaped, undefined);
    await h.cleanup(owner); h.assertDrained();
  });
}

for (const beforeFlow of ['close', 'timeout', 'prototype drift']) {
  test(`${beforeFlow} before response flow invokes no captured resume`, async () => {
    const h = harness({ flowControlled: true }); const owner = h.create(); const pending = owner.transport.callRead(request()); h.secure();
    let res;
    try {
      if (beforeFlow === 'close') owner.close();
      if (beforeFlow === 'timeout') h.advance(100, false);
      if (beforeFlow === 'prototype drift') Object.defineProperty(Object.prototype, 'beforeFlowDrift', { configurable: true, value: true });
      res = h.headers();
    } finally { delete Object.prototype.beforeFlowDrift; }
    h.closeEvents(); h.advance(100);
    await assert.rejects(pending, codeIs(ADAPTER_PREFIX + 'unavailable'));
    assert.equal(res.resumeCalls, 0); await h.cleanup(owner); h.assertDrained();
  });
}

test('captured readable flow never reads response-owned resume or on accessors', async () => {
  const h = harness({ flowControlled: true }); const owner = h.create(); let reads = 0;
  h.hooks.response = res => {
    for (const key of ['resume', 'on']) Object.defineProperty(res, key, { get() { reads += 1; throw new Error('private response method'); } });
  };
  const pending = owner.transport.callRead(request()); h.secure(); const res = h.headers(); h.end();
  if (res.resumeCalls === 0) h.advance(100);
  h.closeEvents(); assert.equal(await pending, '{}'); assert.equal(reads, 0); assert.equal(res.resumeCalls, 1);
  await h.cleanup(owner); h.assertDrained();
});

test('native ClientRequest and IncomingMessage close ordering completes over an in-memory Duplex only', async () => {
  let now = 0; let connections = 0; let wire; let nativeRequest; let incoming; let owner;
  const timers = []; const closed = []; let observed = 'pending';
  // TLS/peer fields are isolated doubles; HTTP parsing, readable consumption,
  // request destruction and request/socket close ordering are authentic Node.
  class ParserSocket extends Duplex {
    constructor() {
      super({ read() {}, write(chunk, encoding, callback) { callback(); } });
      this.authorized = true; this.encrypted = true; this.servername = HOST; this.alpnProtocol = 'http/1.1';
    }
    // net.Socket supplies a boolean on close; a generic Duplex does not.
    emit(name, ...args) { return name === 'close' && args.length === 0 ? super.emit(name, false) : super.emit(name, ...args); }
    get remoteAddress() { return ADDRESS; }
    get remoteFamily() { return 'IPv4'; }
    get remotePort() { return 443; }
    getProtocol() { return 'TLSv1.3'; }
    isSessionReused() { return false; }
  }
  class PrivateAgent { destroy() { wire?.destroy(); } }
  const factory = evaluate([
    PrivateAgent,
    options => {
      wire = new ParserSocket(); wire.on('error', () => {});
      nativeRequest = new NativeClientRequest({
        method: options.method, host: options.hostname, path: options.path, headers: options.headers,
        createConnection() { connections += 1; return wire; },
      });
      nativeRequest.on('error', () => {});
      nativeRequest.once('socket', () => queueMicrotask(() => wire.emit('secureConnect')));
      nativeRequest.once('response', res => { incoming = res; assert.equal(res.listenerCount('data'), 0); });
      nativeRequest.once('close', () => closed.push('request'));
      wire.once('close', () => closed.push('socket'));
      return nativeRequest;
    },
    NativeClientRequest, NativeIncomingMessage, ParserSocket, ParserSocket,
    checkServerIdentity, EventEmitter, Readable, Buffer, TextDecoder, utilTypes, { now: () => now },
    (callback, delay) => { const handle = { callback, delay, cancelled: false }; timers.push(handle); return handle; },
    handle => { handle.cancelled = true; }, createDynamicPlasmaJsonRpcReadTransport,
  ]);
  try {
    owner = factory(configuration());
    const pending = owner.transport.callRead(request());
    pending.then(() => { observed = 'fulfilled'; }, () => { observed = 'rejected'; });
    await new Promise(resolve => setImmediate(resolve));
    const text = response();
    wire.push(Buffer.from(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(text)}\r\nConnection: close\r\n\r\n${text}`));
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(observed, 'fulfilled'); assert.equal(await pending, '{}');
    assert.equal(connections, 1); assert.deepEqual(new Set(closed), new Set(['request', 'socket']));
    assert.equal(incoming.readableEnded, true); assert.equal(incoming.listenerCount('data'), 0);
    assert.equal(timers.every(handle => handle.cancelled), true);
    await owner.close();
  } finally {
    nativeRequest?.destroy(); wire?.destroy();
    const closing = owner?.close(); now = 200;
    for (const handle of timers) if (!handle.cancelled) { handle.cancelled = true; handle.callback(); }
    if (closing) await closing.catch(() => {});
  }
});
