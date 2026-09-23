import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { checkServerIdentity } from 'node:tls';
import { Readable } from 'node:stream';
import { Buffer } from 'node:buffer';
import { TextDecoder, types as utilTypes } from 'node:util';
import { runInThisContext } from 'node:vm';
import test from 'node:test';

import {
  createZenonFundingHttpsReadTransportOwner,
} from '../src/service-credit-zenon-funding-https-read-transport-owner.js';
import {
  createZenonFundingJsonRpcReadTransport,
} from '../src/service-credit-zenon-funding-json-rpc-read-transport.js';

const CORE_URL = new URL('../src/zenon/bounded-json-rpc-https-exchange-owner.js', import.meta.url);
const OWNER_URL = new URL('../src/service-credit-zenon-funding-https-read-transport-owner.js', import.meta.url);
const OWNER_PREFIX = 'zenon_funding_https_read_transport_owner_';
const ADAPTER_PREFIX = 'zenon_funding_json_rpc_read_transport_';
const HOST = 'rpc.synthetic-public.org';
const ADDRESS = '8.8.8.8';
const FRONTIER = 'ledger.getFrontierMomentum';
const MOMENTUM = 'ledger.getMomentumByHash';
const HEIGHT = 'ledger.getMomentumsByHeight';
const BLOCK = 'ledger.getAccountBlockByHash';
const HASH_A = 'ab'.repeat(32);
const HASH_B = '22'.repeat(32);

const CORE_IMPORTS = [
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
];
const OWNER_IMPORTS = [
  "import { types as utilTypes } from 'node:util';",
  "import {",
  "  createBoundedJsonRpcHttpsExchangeOwner,",
  "} from './zenon/bounded-json-rpc-https-exchange-owner.js';",
  "import {",
  "  createZenonFundingJsonRpcReadTransport,",
  "} from './service-credit-zenon-funding-json-rpc-read-transport.js';",
];
const CORE_BINDINGS = [
  'HttpsAgent', 'httpsRequest', 'ClientRequest', 'IncomingMessage', 'Socket',
  'TLSSocket', 'checkServerIdentity', 'EventEmitter', 'Readable', 'Buffer',
  'TextDecoder', 'utilTypes', 'performance', 'setTimeout', 'clearTimeout',
];
const OWNER_BINDINGS = [
  'utilTypes', 'createBoundedJsonRpcHttpsExchangeOwner',
  'createZenonFundingJsonRpcReadTransport',
];

function frozen(value) {
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) frozen(item);
    Object.freeze(value);
  }
  return value;
}
function configuration(overrides = {}, route = {}) {
  return frozen({
    route: {
      hostname: HOST,
      path: '/rpc',
      ipv4Address: ADDRESS,
      ...route,
    },
    timeoutMs: 100,
    closeGraceMs: 20,
    ...overrides,
  });
}
function request(method = FRONTIER, params = []) {
  return frozen({ method, params });
}
function response(id, result = '{}') {
  return '{"jsonrpc":"2.0","id":' + String(id) + ',"result":' + result + '}';
}
function ownerError(error, kind) {
  assert.equal(error?.code, OWNER_PREFIX + kind);
  assert.equal(Object.isFrozen(error), true);
  assert.deepEqual(Object.keys(error), ['code']);
  assert.equal(Object.hasOwn(error, 'cause'), false);
  assert.equal(
    error.message,
    'Zenon funding HTTPS read transport owner ' + kind.replaceAll('_', ' '),
  );
  assert.equal(
    error.stack,
    (kind === 'configuration_rejected' ? 'TypeError' : 'Error') + ': ' + error.message,
  );
  return true;
}
function adapterError(kind) {
  return error => error?.code === ADAPTER_PREFIX + kind
    && Object.hasOwn(error, 'cause') === false;
}
function readSource(url) {
  return readFileSync(url, 'utf8');
}
function evaluateSource(source, imports, exported, replacement, bindingNames, bindings) {
  const importBlock = imports.join('\n') + '\n';
  assert.equal(source.startsWith(importBlock), true);
  assert.equal(source.split(exported).length, 2);
  const policy = source.slice(importBlock.length);
  assert.doesNotMatch(policy, /^import\s/m);
  assert.equal((policy.match(/^export\s/gm) ?? []).length, 1);
  const linked = policy.replace(exported, replacement);
  return runInThisContext(
    "(function(" + bindingNames.join(',') + ") { 'use strict';\n"
      + linked + '\nreturn ' + replacement.slice('function '.length) + ';\n})',
  )(...bindings);
}
function evaluate(bindings) {
  const coreName = 'createBoundedJsonRpcHttpsExchangeOwner';
  const core = evaluateSource(
    readSource(CORE_URL),
    CORE_IMPORTS,
    'export function ' + coreName,
    'function ' + coreName,
    CORE_BINDINGS,
    bindings.slice(0, CORE_BINDINGS.length),
  );
  const ownerName = 'createZenonFundingHttpsReadTransportOwner';
  return evaluateSource(
    readSource(OWNER_URL),
    OWNER_IMPORTS,
    'export function ' + ownerName,
    'function ' + ownerName,
    OWNER_BINDINGS,
    [bindings[11], core, bindings[CORE_BINDINGS.length]],
  );
}

function harness() {
  let now = 0;
  const h = {
    requests: [],
    agents: [],
    sockets: [],
    responses: [],
    timers: [],
    bodies: [],
    hooks: {},
  };
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
    destroy() {
      this.destroyCalls += 1;
      this.destroyed = true;
      h.hooks.socketDestroy?.(this);
      return this;
    }
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
    constructor() {
      super();
      this.flowing = false;
      this.queued = [];
      this.resumeCalls = 0;
    }
    resume() {
      this.resumeCalls += 1;
      this.flowing = true;
      while (this.queued.length > 0 && !this.destroyed) {
        const args = this.queued.shift();
        super.emit(...args);
      }
      return this;
    }
    emit(name, ...args) {
      if (!this.flowing && (name === 'data' || name === 'end')) {
        this.queued.push([name, ...args]);
        return false;
      }
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
      this.rawHeaders = [
        'Content-Type', 'application/json',
        'Content-Length', String(Buffer.byteLength(text)),
        'Connection', 'close',
      ];
      this.rawTrailers = [];
      this.complete = false;
      this.destroyed = false;
      this.destroyCalls = 0;
      Object.assign(this, changes);
      h.responses.push(this);
    }
    destroy() {
      this.destroyCalls += 1;
      this.destroyed = true;
      return this;
    }
  }
  class FakeRequest extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.reusedSocket = false;
      this.destroyed = false;
      this.destroyCalls = 0;
      h.requests.push(this);
    }
    end(body) {
      h.bodies.push(Buffer.from(body));
      h.hooks.end?.(this, body);
      return this;
    }
    destroy() {
      this.destroyCalls += 1;
      this.destroyed = true;
      return this;
    }
  }
  class FakeAgent {
    constructor(options) {
      this.options = options;
      this.destroyCalls = 0;
      h.agents.push(this);
    }
    destroy() { this.destroyCalls += 1; }
  }
  function nativeRequest(options) {
    const req = new FakeRequest(options);
    return h.hooks.request?.(req, options) ?? req;
  }
  function timer(callback, delay) {
    const handle = {
      callback,
      delay,
      at: now + delay,
      cancelled: false,
      fired: false,
    };
    h.timers.push(handle);
    return handle;
  }
  function clearTimer(handle) { handle.cancelled = true; }

  h.factory = evaluate([
    FakeAgent,
    nativeRequest,
    FakeRequest,
    FakeResponse,
    FakeSocket,
    FakeTlsSocket,
    checkServerIdentity,
    EventEmitter,
    FakeReadable,
    Buffer,
    TextDecoder,
    utilTypes,
    { now: () => now },
    timer,
    clearTimer,
    createZenonFundingJsonRpcReadTransport,
  ]);
  h.create = config => h.factory(config ?? configuration());
  h.advance = delta => {
    now += delta;
    for (let turns = 0; turns < 100; turns += 1) {
      const next = h.timers.find(item => !item.cancelled && !item.fired && item.at <= now);
      if (!next) return;
      next.fired = true;
      next.callback();
    }
    assert.fail('bounded timer loop exceeded');
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
  h.headers = (text, changes = {}, index = h.requests.length - 1) => {
    const res = new FakeResponse(text, changes);
    h.requests[index].testResponse = res;
    h.requests[index].emit('response', res);
    return res;
  };
  h.end = (text, index = h.requests.length - 1) => {
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
  h.complete = (text, index = h.requests.length - 1) => {
    h.secure(index);
    h.headers(text, {}, index);
    h.end(text, index);
    h.closeEvents(index);
  };
  return h;
}

test('funding HTTPS owner constructs inertly with one exact frozen interface', async () => {
  const h = harness();
  const owner = h.create();
  assert.deepEqual(Object.keys(owner), ['transport', 'close']);
  assert.deepEqual(Object.keys(owner.transport), ['callRead']);
  for (const value of [owner, owner.transport, owner.transport.callRead, owner.close]) {
    assert.equal(Object.isFrozen(value), true);
  }
  assert.equal(h.requests.length + h.agents.length + h.timers.length, 0);
  const actual = await import(OWNER_URL.href);
  assert.deepEqual(Object.keys(actual), ['createZenonFundingHttpsReadTransportOwner']);
  await owner.close();
});

test('public funding configuration rejects hostile and noncanonical route input inertly', async () => {
  const h = harness();
  let traps = 0;
  const proxy = new Proxy({}, {
    ownKeys() { traps += 1; throw new Error('private trap'); },
    getPrototypeOf() { traps += 1; throw new Error('private trap'); },
  });
  const accessor = Object.freeze(Object.defineProperty(
    { timeoutMs: 100, closeGraceMs: 20 },
    'route',
    {
      enumerable: true,
      get() { traps += 1; throw new Error('private getter'); },
    },
  ));
  const invalid = [
    null,
    {},
    { ...configuration() },
    proxy,
    accessor,
    Object.freeze({ ...configuration(), route: proxy }),
    configuration({}, { hostname: 'localhost' }),
    configuration({}, { hostname: 'RPC.PUBLIC.ORG' }),
    configuration({}, { path: '/rpc?token=x' }),
    configuration({}, { path: '/a/../b' }),
    configuration({}, { ipv4Address: '127.0.0.1' }),
    configuration({}, { ipv4Address: '192.168.1.1' }),
    configuration({ timeoutMs: 0 }),
    configuration({ closeGraceMs: 60001 }),
  ];
  for (const value of invalid) {
    assert.throws(() => h.factory(value), error => ownerError(error, 'configuration_rejected'));
  }
  assert.throws(
    () => h.factory(configuration(), true),
    error => ownerError(error, 'configuration_rejected'),
  );
  assert.equal(traps, 0);
  assert.equal(h.requests.length + h.agents.length + h.timers.length, 0);
});

test('funding calls retain exact pinned TLS, route, framing and fresh-agent options', async () => {
  const h = harness();
  const owner = h.create();
  const pending = owner.transport.callRead(request());
  assert.equal(h.requests.length, 1);
  assert.equal(h.agents.length, 1);
  const req = h.requests[0];
  assert.equal(req.options.protocol, 'https:');
  assert.equal(req.options.hostname, HOST);
  assert.equal(req.options.port, 443);
  assert.equal(req.options.path, '/rpc');
  assert.equal(req.options.method, 'POST');
  assert.equal(req.options.family, 4);
  assert.equal(req.options.autoSelectFamily, false);
  assert.equal(req.options.servername, HOST);
  assert.equal(req.options.rejectUnauthorized, true);
  assert.equal(req.options.checkServerIdentity, checkServerIdentity);
  assert.equal(req.options.minVersion, 'TLSv1.3');
  assert.equal(req.options.maxVersion, 'TLSv1.3');
  assert.deepEqual(req.options.ALPNProtocols, ['http/1.1']);
  assert.equal(req.options.maxHeaderSize, 16384);
  assert.equal(req.options.insecureHTTPParser, false);
  assert.equal(req.options.joinDuplicateHeaders, false);
  assert.deepEqual(h.agents[0].options, {
    keepAlive: false,
    maxSockets: 1,
    maxTotalSockets: 1,
    maxFreeSockets: 0,
    maxCachedSessions: 0,
  });
  assert.deepEqual(JSON.parse(h.bodies[0].toString()), {
    jsonrpc: '2.0',
    id: 1,
    method: FRONTIER,
    params: [],
  });
  let lookup;
  req.options.lookup(HOST, { all: false }, (...items) => { lookup = items; });
  assert.deepEqual(lookup, [null, ADDRESS, 4]);
  h.complete(response(1, '{"height":1}'));
  assert.equal(await pending, '{"height":1}');
  await owner.close();
});

test('funding wrapper carries only the four bounded methods through six handoffs', async () => {
  const h = harness();
  const owner = h.create();
  const inputs = [
    request(FRONTIER, []),
    request(MOMENTUM, [HASH_A]),
    request(HEIGHT, [2, 64]),
    request(BLOCK, [HASH_B]),
    request(FRONTIER, []),
    request(MOMENTUM, [HASH_B]),
  ];
  for (let index = 0; index < inputs.length; index += 1) {
    const pending = owner.transport.callRead(inputs[index]);
    h.complete(response(index + 1));
    assert.equal(await pending, '{}');
  }
  assert.deepEqual(h.bodies.map(body => JSON.parse(body).method), [
    FRONTIER, MOMENTUM, HEIGHT, BLOCK, FRONTIER, MOMENTUM,
  ]);
  await assert.rejects(owner.transport.callRead(request()), adapterError('exhausted'));
  assert.equal(h.requests.length, 6);
  assert.equal(h.agents.length, 6);
  assert.equal(new Set(h.sockets).size, 6);
  await owner.close();
});

test('funding profile errors are cause-free without leaking route or transport details', async () => {
  const h = harness();
  const owner = h.create();
  await assert.rejects(
    owner.close('unexpected'),
    error => ownerError(error, 'configuration_rejected'),
  );
  const second = h.create();
  const pending = second.transport.callRead(request());
  let lookupError;
  h.requests[0].options.lookup('different.public.org', {}, error => {
    lookupError = error;
  });
  assert.equal(ownerError(lookupError, 'unavailable'), true);
  h.closeEvents();
  h.advance(20);
  await assert.rejects(pending, adapterError('unavailable'));
  await second.close();
  await owner.close();
});

test('TLS identity drift and invalid response framing fail before result admission', async () => {
  const tls = harness();
  const tlsOwner = tls.create();
  const tlsPending = tlsOwner.transport.callRead(request());
  tls.secure(0, { authorized: false });
  tls.closeEvents();
  await assert.rejects(tlsPending, adapterError('unavailable'));
  await tlsOwner.close();

  const framing = harness();
  const framingOwner = framing.create();
  const framingPending = framingOwner.transport.callRead(request());
  framing.secure();
  framing.headers(response(1), { statusCode: 302 });
  framing.closeEvents();
  await assert.rejects(framingPending, adapterError('unavailable'));
  await framingOwner.close();
});

test('unproven request closure makes funding close permanently uncertain', async () => {
  const h = harness();
  const owner = h.create();
  const pending = owner.transport.callRead(request());
  const closing = owner.close();
  h.advance(20);
  await assert.rejects(pending, adapterError('unavailable'));
  await assert.rejects(closing, error => ownerError(error, 'close_uncertain'));
  assert.equal(owner.close(), closing);
  await assert.rejects(owner.transport.callRead(request()), adapterError('unavailable'));
});

test('funding HTTPS wrapper owns no activation, credential, wallet or generic method authority', () => {
  const source = readSource(OWNER_URL);
  assert.deepEqual([...source.matchAll(/from '([^']+)';/g)].map(match => match[1]), [
    'node:util',
    './zenon/bounded-json-rpc-https-exchange-owner.js',
    './service-credit-zenon-funding-json-rpc-read-transport.js',
  ]);
  assert.doesNotMatch(
    source,
    /node:(?:https?|http2|net|tls|dns|fs)|process\.env|globalThis|fetch\s*\(|\.listen\s*\(/,
  );
  assert.doesNotMatch(
    source,
    /\b(?:wallet|keystore|mnemonic|sign|publish|settle|activateGrant|credit)\s*\(/i,
  );
  assert.doesNotMatch(source, /ledger\.|embedded\./);
});
