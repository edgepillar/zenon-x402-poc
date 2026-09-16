import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { Server as HttpsServer } from 'node:https';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect as connectTls } from 'node:tls';

import {
  createServiceCreditBoundedNodeHttpsServerFactory,
} from '../src/service-credit-bounded-node-https-server-factory.js';
import {
  createServiceCreditBoundedHttpsIngressOwner,
} from '../src/service-credit-bounded-https-ingress-owner.js';

const CALLBACK_KEYS = Object.freeze([
  'connection',
  'secureConnection',
  'request',
  'checkContinue',
  'checkExpectation',
  'upgrade',
  'connect',
  'clientError',
  'tlsClientError',
  'dropRequest',
  'drop',
  'timeout',
  'listening',
  'close',
  'error',
]);

const SERVER_OPTION_KEYS = Object.freeze([
  'minVersion',
  'maxVersion',
  'ALPNProtocols',
  'requestCert',
  'handshakeTimeout',
  'maxHeaderSize',
  'insecureHTTPParser',
  'requireHostHeader',
  'joinDuplicateHeaders',
  'rejectNonStandardBodyWrites',
  'headersTimeout',
  'requestTimeout',
  'keepAliveTimeout',
  'maxHeadersCount',
  'maxRequestsPerSocket',
  'maxConnections',
  'timeout',
]);

const CODE = Object.freeze({
  invalidConfiguration:
    'SERVICE_CREDIT_BOUNDED_NODE_HTTPS_SERVER_FACTORY_INVALID_CONFIGURATION',
  invalidInvocation:
    'SERVICE_CREDIT_BOUNDED_NODE_HTTPS_SERVER_FACTORY_INVALID_INVOCATION',
  alreadyUsed:
    'SERVICE_CREDIT_BOUNDED_NODE_HTTPS_SERVER_FACTORY_ALREADY_USED',
  constructionFailed:
    'SERVICE_CREDIT_BOUNDED_NODE_HTTPS_SERVER_FACTORY_NATIVE_CONSTRUCTION_FAILED',
  setupFailed:
    'SERVICE_CREDIT_BOUNDED_NODE_HTTPS_SERVER_FACTORY_NATIVE_SETUP_FAILED',
  listenFailed:
    'SERVICE_CREDIT_BOUNDED_NODE_HTTPS_SERVER_FACTORY_LISTEN_FAILED',
  closeFailed:
    'SERVICE_CREDIT_BOUNDED_NODE_HTTPS_SERVER_FACTORY_CLOSE_FAILED',
});

const require = createRequire(import.meta.url);
const nativeHttpsModule = require('node:https');

function fixedFailure(code) {
  const error = new Error(code);
  error.name = 'SyntheticFactoryTestError';
  error.code = code;
  error.stack = `SyntheticFactoryTestError: ${code}`;
  return error;
}

function expectCode(callback, code) {
  let caught = null;
  try { callback(); } catch (error) { caught = error; }
  assert.notEqual(caught, null);
  assert.equal(caught.name, 'TypeError');
  assert.equal(caught.code, code);
  assert.equal(caught.message, code);
  assert.equal(caught.stack, `TypeError: ${code}`);
}

async function expectCodeAsync(callback, code) {
  let caught = null;
  try { await callback(); } catch (error) { caught = error; }
  assert.notEqual(caught, null);
  assert.equal(caught.name, 'TypeError');
  assert.equal(caught.code, code);
  assert.equal(caught.message, code);
  assert.equal(caught.stack, `TypeError: ${code}`);
}

function syntheticTlsMaterial() {
  const directory = mkdtempSync(join(tmpdir(), 'bounded-node-https-factory-'));
  chmodSync(directory, 0o700);
  const configPath = join(directory, 'tls.cnf');
  const keyPath = join(directory, 'key.pem');
  const certPath = join(directory, 'cert.pem');
  let key = null;
  let cert = null;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    key?.fill(0);
    cert?.fill(0);
    rmSync(directory, { recursive: true, force: true });
    cleaned = true;
  };
  try {
    writeFileSync(
      configPath,
      '[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=v3_req\n'
        + '[dn]\nCN=127.0.0.1\n'
        + '[v3_req]\nsubjectAltName=IP:127.0.0.1\nbasicConstraints=CA:FALSE\n'
        + 'keyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n',
      { encoding: 'utf8', mode: 0o600, flag: 'wx' },
    );
    const priorUmask = process.umask(0o077);
    let generated;
    try {
      generated = childProcess.spawnSync('/usr/bin/openssl', [
        'req', '-x509', '-newkey', 'ec', '-pkeyopt',
        'ec_paramgen_curve:prime256v1', '-sha256', '-nodes', '-days', '1',
        '-keyout', keyPath, '-out', certPath, '-config', configPath,
        '-extensions', 'v3_req',
      ], {
        env: {},
        encoding: 'utf8',
        timeout: 15_000,
        maxBuffer: 1024 * 1024,
      });
    } finally {
      process.umask(priorUmask);
    }
    if (generated.status !== 0 || generated.error !== undefined) {
      throw fixedFailure('SYNTHETIC_TLS_GENERATION_FAILED');
    }
    key = readFileSync(keyPath);
    cert = readFileSync(certPath);
    const parsed = new X509Certificate(cert);
    assert.equal(parsed.checkIP('127.0.0.1'), '127.0.0.1');
    return Object.freeze({ key, cert, cleanup });
  } catch {
    cleanup();
    throw fixedFailure('SYNTHETIC_TLS_MATERIAL_UNAVAILABLE');
  }
}

function listen(server, options) {
  return new Promise((resolve, reject) => {
    const onError = () => {
      server.off('listening', onListening);
      reject(fixedFailure('SYNTHETIC_PORT_RESERVATION_FAILED'));
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(options);
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error === undefined) resolve();
      else reject(fixedFailure('SYNTHETIC_PORT_RELEASE_FAILED'));
    });
  });
}

async function reservePort() {
  const reservation = createNetServer();
  await listen(reservation, { host: '127.0.0.1', port: 0, exclusive: true });
  const address = reservation.address();
  assert.equal(typeof address, 'object');
  assert.equal(Number.isSafeInteger(address.port) && address.port > 0, true);
  await closeServer(reservation);
  return address.port;
}

async function occupyPort() {
  const reservation = createNetServer();
  await listen(reservation, { host: '127.0.0.1', port: 0, exclusive: true });
  const address = reservation.address();
  assert.equal(typeof address, 'object');
  return Object.freeze({ reservation, port: address.port });
}

function serverOptions(overrides = {}) {
  return Object.freeze({
    minVersion: 'TLSv1.3',
    maxVersion: 'TLSv1.3',
    ALPNProtocols: Object.freeze(['http/1.1']),
    requestCert: false,
    handshakeTimeout: 500,
    maxHeaderSize: 4096,
    insecureHTTPParser: false,
    requireHostHeader: true,
    joinDuplicateHeaders: false,
    rejectNonStandardBodyWrites: true,
    headersTimeout: 500,
    requestTimeout: 800,
    keepAliveTimeout: 900,
    maxHeadersCount: 32,
    maxRequestsPerSocket: 1,
    maxConnections: 4,
    timeout: 900,
    ...overrides,
  });
}

function factoryConfiguration(port, material, overrides = {}) {
  return Object.freeze({
    bind: Object.freeze({ host: '127.0.0.1', port, exclusive: true }),
    tlsMaterial: Object.freeze({ key: material.key, cert: material.cert }),
    ...overrides,
  });
}

function callbackTable(events, behaviors = {}) {
  const result = {};
  for (const name of CALLBACK_KEYS) {
    result[name] = Object.freeze(function observedNativeHttpsEvent(...args) {
      events.push(name);
      if (behaviors[name] !== undefined) return behaviors[name](...args);
      return undefined;
    });
  }
  return Object.freeze(result);
}

function oneByteBufferWithOwnHooks(counters) {
  const value = Buffer.from([1]);
  for (const name of [
    'length',
    'byteLength',
    'byteOffset',
    'buffer',
    'constructor',
    'valueOf',
  ]) {
    Object.defineProperty(value, name, {
      configurable: true,
      enumerable: false,
      get() {
        counters[name] += 1;
        throw fixedFailure('SYNTHETIC_CALLER_BUFFER_HOOK');
      },
    });
  }
  Object.defineProperty(value, Symbol.toPrimitive, {
    configurable: true,
    enumerable: false,
    get() {
      counters.toPrimitive += 1;
      throw fixedFailure('SYNTHETIC_CALLER_BUFFER_HOOK');
    },
  });
  return value;
}

function bufferHookCounters() {
  return {
    length: 0,
    byteLength: 0,
    byteOffset: 0,
    buffer: 0,
    constructor: 0,
    valueOf: 0,
    toPrimitive: 0,
  };
}

async function importFactoryWithCountingNativeCreator(tag) {
  const originalCreateServer = nativeHttpsModule.createServer;
  let nativeCreateCount = 0;
  nativeHttpsModule.createServer = function countedNativeHttpsCreation() {
    nativeCreateCount += 1;
    throw fixedFailure('SYNTHETIC_NATIVE_CREATOR_MUST_REMAIN_INERT');
  };
  syncBuiltinESMExports();
  try {
    const loaded = await import(
      `../src/service-credit-bounded-node-https-server-factory.js?${tag}`
    );
    return Object.freeze({
      createFactory: loaded.createServiceCreditBoundedNodeHttpsServerFactory,
      nativeCreateCount: Object.freeze(() => nativeCreateCount),
    });
  } finally {
    nativeHttpsModule.createServer = originalCreateServer;
    syncBuiltinESMExports();
  }
}

function waitForObservedEvent(setup) {
  return new Promise(resolve => setup(Object.freeze(resolve)));
}

function tlsHttpExchange(port, cert, requestText = (
  'GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n'
), responseDeadlineMs = null) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let socket;
    let settled = false;
    let deadline = null;
    const finish = (operation, value) => {
      if (settled) return;
      settled = true;
      if (deadline !== null) clearTimeout(deadline);
      operation(value);
    };
    try {
      socket = connectTls({
        host: '127.0.0.1',
        port,
        ca: cert,
        rejectUnauthorized: true,
        ALPNProtocols: ['http/1.1'],
      });
    } catch {
      finish(reject, fixedFailure('SYNTHETIC_TLS_CONNECT_FAILED'));
      return;
    }
    if (responseDeadlineMs !== null) {
      deadline = setTimeout(() => {
        finish(reject, fixedFailure('SYNTHETIC_TLS_RESPONSE_DEADLINE'));
        try { socket.destroy(); } catch {}
      }, responseDeadlineMs);
    }
    socket.once('error', () => {
      finish(reject, fixedFailure('SYNTHETIC_TLS_CONNECT_FAILED'));
    });
    socket.once('secureConnect', () => {
      try { socket.end(requestText); }
      catch { finish(reject, fixedFailure('SYNTHETIC_TLS_WRITE_FAILED')); }
    });
    socket.on('data', chunk => chunks.push(Buffer.from(chunk)));
    socket.once('close', () => finish(resolve, Buffer.concat(chunks)));
  });
}

let material;

test.before(() => {
  material = syntheticTlsMaterial();
});

test.after(() => {
  material.cleanup();
});

test('construction captures exact frozen bind and material without creating a listener', async () => {
  const port = await reservePort();
  const key = Buffer.from(material.key);
  const cert = Buffer.from(material.cert);
  const factory = createServiceCreditBoundedNodeHttpsServerFactory(
    factoryConfiguration(port, { key, cert }),
  );
  assert.equal(typeof factory, 'function');
  assert.equal(Object.isFrozen(factory), true);
  key.fill(0);
  cert.fill(0);

  const proof = createNetServer();
  await listen(proof, { host: '127.0.0.1', port, exclusive: true });
  await closeServer(proof);
  expectCode(() => factory(), CODE.invalidInvocation);
});

test('key and certificate capture bypass every caller-owned byte-container hook', async () => {
  const isolated = await importFactoryWithCountingNativeCreator('caller-buffer-hooks');
  for (const field of ['key', 'cert']) {
    const counters = bufferHookCounters();
    const hooked = oneByteBufferWithOwnHooks(counters);
    const other = Buffer.from([2]);
    const key = field === 'key' ? hooked : other;
    const cert = field === 'cert' ? hooked : other;
    const factory = isolated.createFactory(Object.freeze({
      bind: Object.freeze({ host: '127.0.0.1', port: 1, exclusive: true }),
      tlsMaterial: Object.freeze({ key, cert }),
    }));
    assert.equal(typeof factory, 'function');
    assert.deepEqual(counters, bufferHookCounters());
    assert.equal(isolated.nativeCreateCount(), 0);
    expectCode(() => factory(), CODE.invalidInvocation);
    assert.deepEqual(counters, bufferHookCounters());
    assert.equal(isolated.nativeCreateCount(), 0);
  }
});

test('key and certificate Proxy rejection runs before prototype or property traps', async () => {
  const isolated = await importFactoryWithCountingNativeCreator('caller-buffer-proxies');
  for (const field of ['key', 'cert']) {
    const traps = {
      get: 0,
      getPrototypeOf: 0,
      getOwnPropertyDescriptor: 0,
      has: 0,
      ownKeys: 0,
      set: 0,
    };
    const target = Buffer.from([1]);
    const proxy = new Proxy(target, {
      get() { traps.get += 1; throw fixedFailure('SYNTHETIC_PROXY_TRAP'); },
      getPrototypeOf() {
        traps.getPrototypeOf += 1;
        throw fixedFailure('SYNTHETIC_PROXY_TRAP');
      },
      getOwnPropertyDescriptor() {
        traps.getOwnPropertyDescriptor += 1;
        throw fixedFailure('SYNTHETIC_PROXY_TRAP');
      },
      has() { traps.has += 1; throw fixedFailure('SYNTHETIC_PROXY_TRAP'); },
      ownKeys() { traps.ownKeys += 1; throw fixedFailure('SYNTHETIC_PROXY_TRAP'); },
      set() { traps.set += 1; throw fixedFailure('SYNTHETIC_PROXY_TRAP'); },
    });
    const other = Buffer.from([2]);
    expectCode(
      () => isolated.createFactory(Object.freeze({
        bind: Object.freeze({ host: '127.0.0.1', port: 1, exclusive: true }),
        tlsMaterial: Object.freeze({
          key: field === 'key' ? proxy : other,
          cert: field === 'cert' ? proxy : other,
        }),
      })),
      CODE.invalidConfiguration,
    );
    assert.deepEqual(traps, {
      get: 0,
      getPrototypeOf: 0,
      getOwnPropertyDescriptor: 0,
      has: 0,
      ownKeys: 0,
      set: 0,
    });
    assert.equal(isolated.nativeCreateCount(), 0);
  }
});

test('configuration rejects every widened or mutable authority shape', async () => {
  const port = await reservePort();
  const key = Buffer.from(material.key);
  const cert = Buffer.from(material.cert);
  const validBind = Object.freeze({ host: '127.0.0.1', port, exclusive: true });
  const validMaterial = Object.freeze({ key, cert });
  const invalid = [
    { bind: validBind, tlsMaterial: validMaterial },
    Object.freeze({ bind: { host: '127.0.0.1', port, exclusive: true }, tlsMaterial: validMaterial }),
    Object.freeze({ bind: validBind, tlsMaterial: { key, cert } }),
    Object.freeze({ bind: Object.freeze({ host: '127.0.0.1', port: 0, exclusive: true }), tlsMaterial: validMaterial }),
    Object.freeze({ bind: Object.freeze({ host: '127.0.0.1', port, exclusive: false }), tlsMaterial: validMaterial }),
    Object.freeze({ bind: validBind, tlsMaterial: Object.freeze({ key: new Uint8Array(key), cert }) }),
    Object.freeze({ bind: validBind, tlsMaterial: Object.freeze({ key: new Proxy(key, {}), cert }) }),
    Object.freeze({ bind: validBind, tlsMaterial: Object.freeze({ key: Buffer.from(new SharedArrayBuffer(key.length)), cert }) }),
    Object.freeze({ bind: validBind, tlsMaterial: Object.freeze({ key: Buffer.alloc(1024 * 1024 + 1), cert }) }),
    Object.freeze({ bind: validBind, tlsMaterial: Object.freeze({ key, cert: Buffer.alloc(0) }) }),
    Object.freeze({ bind: validBind, tlsMaterial: validMaterial, options: Object.freeze({}) }),
  ];
  for (const candidate of invalid) {
    expectCode(
      () => createServiceCreditBoundedNodeHttpsServerFactory(candidate),
      CODE.invalidConfiguration,
    );
  }
  let accessorInvoked = false;
  const accessorConfiguration = { bind: validBind };
  Object.defineProperty(accessorConfiguration, 'tlsMaterial', {
    enumerable: true,
    configurable: false,
    get() {
      accessorInvoked = true;
      return validMaterial;
    },
  });
  Object.freeze(accessorConfiguration);
  expectCode(
    () => createServiceCreditBoundedNodeHttpsServerFactory(accessorConfiguration),
    CODE.invalidConfiguration,
  );
  assert.equal(accessorInvoked, false);
  key.fill(0);
  cert.fill(0);
});

test('factory invocation is exact, one-use, and definite native construction failure is fixed', async () => {
  const port = await reservePort();
  const factory = createServiceCreditBoundedNodeHttpsServerFactory(
    factoryConfiguration(port, {
      key: Buffer.from('not-a-private-key'),
      cert: Buffer.from('not-a-certificate'),
    }),
  );
  const events = [];
  const callbacks = callbackTable(events);
  expectCode(() => factory(serverOptions(), callbacks), CODE.constructionFailed);
  assert.deepEqual(events, []);
  expectCode(() => factory(serverOptions(), callbacks), CODE.alreadyUsed);

  const validFactory = createServiceCreditBoundedNodeHttpsServerFactory(
    factoryConfiguration(await reservePort(), material),
  );
  expectCode(() => validFactory(serverOptions()), CODE.invalidInvocation);
  expectCode(() => validFactory(serverOptions(), callbacks), CODE.alreadyUsed);
});

test('captured material, policy, events, and frozen synchronous capability drive native HTTPS', async () => {
  const port = await reservePort();
  const key = Buffer.from(material.key);
  const cert = Buffer.from(material.cert);
  const clientCert = Buffer.from(cert);
  const events = [];
  let closeResolve;
  let startResolve;
  const closed = new Promise(resolve => { closeResolve = resolve; });
  const started = new Promise(resolve => { startResolve = resolve; });
  const callbacks = callbackTable(events, {
    secureConnection(socket) {
      assert.equal(socket.alpnProtocol, 'http/1.1');
      assert.equal(socket.getProtocol(), 'TLSv1.3');
    },
    request(_request, response) {
      response.statusCode = 204;
      response.end();
    },
    listening() { startResolve('LISTENING'); },
    error() { startResolve('ERROR'); },
    close() { closeResolve(); },
  });
  const factory = createServiceCreditBoundedNodeHttpsServerFactory(
    factoryConfiguration(port, { key, cert }),
  );
  key.fill(0);
  cert.fill(0);
  const capability = factory(serverOptions(), callbacks);
  assert.deepEqual(Reflect.ownKeys(capability), ['listen', 'close', 'closeAllConnections']);
  assert.equal(Object.isFrozen(capability), true);
  for (const operation of Object.values(capability)) assert.equal(Object.isFrozen(operation), true);
  assert.equal(capability.listen(), undefined);
  assert.equal(await started, 'LISTENING');
  const response = await tlsHttpExchange(port, clientCert);
  assert.equal(response.subarray(0, 12).toString('ascii'), 'HTTP/1.1 204');
  assert.equal(events.filter(name => name === 'connection').length, 1);
  assert.equal(events.filter(name => name === 'secureConnection').length, 1);
  assert.equal(events.filter(name => name === 'request').length, 1);
  assert.equal(capability.closeAllConnections(), undefined);
  assert.equal(capability.close(), undefined);
  await closed;
  assert.equal(events.filter(name => name === 'listening').length, 1);
  assert.equal(events.filter(name => name === 'close').length, 1);
  const terminalEventCount = events.length;
  await assert.rejects(
    tlsHttpExchange(port, clientCert),
    error => error?.code === 'SYNTHETIC_TLS_CONNECT_FAILED',
  );
  assert.equal(events.length, terminalEventCount);
  clientCert.fill(0);
});

test('the adapter maps exactly the owner event table and applies every fixed native policy', () => {
  const source = readFileSync(
    new URL('../src/service-credit-bounded-node-https-server-factory.js', import.meta.url),
    'utf8',
  );
  for (const eventName of CALLBACK_KEYS) {
    assert.equal(source.includes(`'${eventName}'`), true);
  }
  for (const optionName of SERVER_OPTION_KEYS) {
    assert.equal(source.includes(optionName), true);
  }
  for (const eventName of CALLBACK_KEYS.filter(name => name !== 'request')) {
    const registrations = source.match(new RegExp(
      `register\\('${eventName}', forwarders\\.${eventName}, (?:true|false)\\);`,
      'g',
    )) ?? [];
    assert.equal(registrations.length, 1);
  }
  assert.equal(
    (source.match(/nativeOptions,\s*forwarders\.request,/g) ?? []).length,
    1,
  );
  for (const required of [
    "import { createServer as createNativeHttpsServer, Server as NativeHttpsServer } from 'node:https';",
    'maxHeadersCount: capturedOptions.maxHeadersCount',
    'maxConnections: capturedOptions.maxConnections',
    'maxRequestsPerSocket: capturedOptions.maxRequestsPerSocket',
    'headersTimeout: capturedOptions.headersTimeout',
    'requestTimeout: capturedOptions.requestTimeout',
    'keepAliveTimeout: capturedOptions.keepAliveTimeout',
    'REFLECT_APPLY(SERVER_SET_TIMEOUT, server, [capturedOptions.timeout])',
    "register('close', forwarders.close, true);",
    "register('error', forwarders.error, false);",
  ]) assert.equal(source.includes(required), true);
  assert.doesNotMatch(
    source,
    /process\.env|node:fs|node:child_process|readFile|createSecureContext|SNICallback|keylog|pfx|passphrase|engine|Promise|\.then\s*\(/,
  );
});

test('test-owned native setup interruption is cleaned without publishing a capability', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(HttpsServer.prototype, 'setTimeout');
  const hadOwn = descriptor !== undefined;
  Object.defineProperty(HttpsServer.prototype, 'setTimeout', {
    value: function interruptedNativeSetup() {
      throw fixedFailure('SYNTHETIC_NATIVE_SETUP_INTERRUPTED');
    },
    enumerable: false,
    configurable: true,
    writable: true,
  });
  let createFaultedFactory;
  try {
    ({ createServiceCreditBoundedNodeHttpsServerFactory: createFaultedFactory } =
      await import('../src/service-credit-bounded-node-https-server-factory.js?setup-fault'));
  } finally {
    if (hadOwn) Object.defineProperty(HttpsServer.prototype, 'setTimeout', descriptor);
    else delete HttpsServer.prototype.setTimeout;
  }
  const port = await reservePort();
  const factory = createFaultedFactory(factoryConfiguration(port, material));
  expectCode(
    () => factory(serverOptions(), callbackTable([])),
    CODE.setupFailed,
  );
  const proof = createNetServer();
  await listen(proof, { host: '127.0.0.1', port, exclusive: true });
  await closeServer(proof);
});

test('module-evaluation-captured native dispatch is stable across later prototype drift', async () => {
  const port = await reservePort();
  const events = [];
  let closeResolve;
  let startResolve;
  const closed = new Promise(resolve => { closeResolve = resolve; });
  const started = new Promise(resolve => { startResolve = resolve; });
  const factory = createServiceCreditBoundedNodeHttpsServerFactory(
    factoryConfiguration(port, material),
  );
  const descriptor = Object.getOwnPropertyDescriptor(HttpsServer.prototype, 'setTimeout');
  const hadOwn = descriptor !== undefined;
  Object.defineProperty(HttpsServer.prototype, 'setTimeout', {
    value: function poisonedAfterImport() {
      throw fixedFailure('SYNTHETIC_POST_IMPORT_DRIFT');
    },
    enumerable: false,
    configurable: true,
    writable: true,
  });
  let capability;
  try {
    capability = factory(serverOptions(), callbackTable(events, {
      listening() { startResolve('LISTENING'); },
      error() { startResolve('ERROR'); },
      close() { closeResolve(); },
    }));
  } finally {
    if (hadOwn) Object.defineProperty(HttpsServer.prototype, 'setTimeout', descriptor);
    else delete HttpsServer.prototype.setTimeout;
  }
  assert.equal(capability.listen(), undefined);
  assert.equal(await started, 'LISTENING');
  assert.equal(capability.close(), undefined);
  await closed;
  assert.equal(events.filter(name => name === 'close').length, 1);
});

test('close-before-listen seals admission before observable native close', async () => {
  const closeDescriptor = Object.getOwnPropertyDescriptor(HttpsServer.prototype, 'close');
  const listenDescriptor = Object.getOwnPropertyDescriptor(HttpsServer.prototype, 'listen');
  let nativeCloseCount = 0;
  let nativeListenCount = 0;
  Object.defineProperty(HttpsServer.prototype, 'close', {
    value: function observedCloseBeforeListen() {
      nativeCloseCount += 1;
      return this;
    },
    enumerable: false,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(HttpsServer.prototype, 'listen', {
    value: function forbiddenListenAfterClose() {
      nativeListenCount += 1;
      return this;
    },
    enumerable: false,
    configurable: true,
    writable: true,
  });
  let createCloseGatedFactory;
  try {
    ({ createServiceCreditBoundedNodeHttpsServerFactory: createCloseGatedFactory } =
      await import('../src/service-credit-bounded-node-https-server-factory.js?close-admission'));
  } finally {
    if (closeDescriptor === undefined) delete HttpsServer.prototype.close;
    else Object.defineProperty(HttpsServer.prototype, 'close', closeDescriptor);
    if (listenDescriptor === undefined) delete HttpsServer.prototype.listen;
    else Object.defineProperty(HttpsServer.prototype, 'listen', listenDescriptor);
  }
  const factory = createCloseGatedFactory(
    factoryConfiguration(await reservePort(), material),
  );
  const capability = factory(serverOptions(), callbackTable([]));
  assert.equal(capability.close(), undefined);
  expectCode(() => capability.listen(), CODE.listenFailed);
  assert.equal(nativeCloseCount, 1);
  assert.equal(nativeListenCount, 0);
});

test('preterminal callbacks survive close request and terminal detachment precedes reentry', async () => {
  const closeDescriptor = Object.getOwnPropertyDescriptor(HttpsServer.prototype, 'close');
  let nativeCloseCount = 0;
  Object.defineProperty(HttpsServer.prototype, 'close', {
    value: function reentrantNativeClose() {
      nativeCloseCount += 1;
      this.emit('timeout', Object.freeze({}));
      this.emit('error', fixedFailure('SYNTHETIC_PRE_CLOSE_ERROR'));
      this.emit('close');
      this.emit('timeout', Object.freeze({}));
      this.emit('error', fixedFailure('SYNTHETIC_LATE_CLOSE_ERROR'));
      return this;
    },
    enumerable: false,
    configurable: true,
    writable: true,
  });
  let createTerminalFirstFactory;
  try {
    ({ createServiceCreditBoundedNodeHttpsServerFactory: createTerminalFirstFactory } =
      await import('../src/service-credit-bounded-node-https-server-factory.js?terminal-first'));
  } finally {
    if (closeDescriptor === undefined) delete HttpsServer.prototype.close;
    else Object.defineProperty(HttpsServer.prototype, 'close', closeDescriptor);
  }
  const events = [];
  let capability = null;
  const factory = createTerminalFirstFactory(
    factoryConfiguration(await reservePort(), material),
  );
  capability = factory(serverOptions(), callbackTable(events, {
    close() {
      assert.equal(capability.close(), undefined);
      assert.equal(capability.closeAllConnections(), undefined);
    },
  }));
  assert.equal(capability.close(), undefined);
  assert.deepEqual(events, ['timeout', 'error', 'close']);
  assert.equal(nativeCloseCount, 1);
  assert.equal(capability.close(), undefined);
  assert.equal(capability.closeAllConnections(), undefined);
  assert.deepEqual(events, ['timeout', 'error', 'close']);
});

test('later builtin export synchronization cannot replace the captured native creator', () => {
  const moduleHref = new URL(
    '../src/service-credit-bounded-node-https-server-factory.js',
    import.meta.url,
  ).href;
  const script = `
    import { createRequire, syncBuiltinESMExports } from 'node:module';
    const require = createRequire(import.meta.url);
    const https = require('node:https');
    const original = https.createServer;
    let capturedCalls = 0;
    let replacementCalls = 0;
    try {
      https.createServer = function capturedCreator() {
        capturedCalls += 1;
        throw new Error('captured');
      };
      syncBuiltinESMExports();
      const loaded = await import(${JSON.stringify(moduleHref)} + '?captured-creator-child');
      https.createServer = function replacementCreator() {
        replacementCalls += 1;
        throw new Error('replacement');
      };
      syncBuiltinESMExports();
      const key = Buffer.from([1]);
      const cert = Buffer.from([2]);
      const factory = loaded.createServiceCreditBoundedNodeHttpsServerFactory(Object.freeze({
        bind: Object.freeze({ host: '127.0.0.1', port: 1, exclusive: true }),
        tlsMaterial: Object.freeze({ key, cert }),
      }));
      const options = Object.freeze({
        minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3',
        ALPNProtocols: Object.freeze(['http/1.1']), requestCert: false,
        handshakeTimeout: 1, maxHeaderSize: 512, insecureHTTPParser: false,
        requireHostHeader: true, joinDuplicateHeaders: false,
        rejectNonStandardBodyWrites: true, headersTimeout: 1,
        requestTimeout: 1, keepAliveTimeout: 1, maxHeadersCount: 1,
        maxRequestsPerSocket: 1, maxConnections: 1, timeout: 1,
      });
      const names = ${JSON.stringify(CALLBACK_KEYS)};
      const callbacks = {};
      for (const name of names) callbacks[name] = Object.freeze(function callback() {});
      Object.freeze(callbacks);
      let code = null;
      try { factory(options, callbacks); } catch (error) { code = error.code; }
      if (
        code !== 'SERVICE_CREDIT_BOUNDED_NODE_HTTPS_SERVER_FACTORY_NATIVE_CONSTRUCTION_FAILED'
        || capturedCalls !== 1
        || replacementCalls !== 0
      ) process.exitCode = 1;
    } finally {
      https.createServer = original;
      syncBuiltinESMExports();
    }
  `;
  const result = childProcess.spawnSync(process.execPath, [
    '--input-type=module',
    '--eval',
    script,
  ], {
    stdio: 'ignore',
    timeout: 10_000,
  });
  assert.equal(result.status, 0);
  assert.equal(result.signal, null);
});

test('the adapter satisfies the ingress owner lifecycle without Promise return authority', async () => {
  const port = await reservePort();
  const clientCert = Buffer.from(material.cert);
  const downstreamEvents = [];
  const downstream = Object.freeze({
    handle: Object.freeze(function handle(_request, response, _context, completion) {
      downstreamEvents.push('handle');
      response.statusCode = 204;
      response.end();
      completion.success();
      return undefined;
    }),
    close: Object.freeze(function close(completion) {
      downstreamEvents.push('close');
      completion.success();
      return undefined;
    }),
  });
  const factory = createServiceCreditBoundedNodeHttpsServerFactory(
    factoryConfiguration(port, material),
  );
  const owner = createServiceCreditBoundedHttpsIngressOwner({
    origin: 'https://127.0.0.1',
    requestTargets: Object.freeze(['/service']),
    generation: Object.freeze({ generationId: 'focused.native.factory', generationVersion: 1 }),
    limits: Object.freeze({
      maxHeaderBytes: 4096,
      maxHeaderCount: 32,
      maxConcurrentSockets: 4,
      maxConnectionStarts: 16,
      maxConcurrentRequests: 4,
      maxRequestStarts: 16,
      tlsHandshakeDeadlineMs: 500,
      headerDeadlineMs: 500,
      requestResponseDeadlineMs: 800,
      idleSocketDeadlineMs: 900,
      startDeadlineMs: 1_000,
      closeGraceMs: 1_500,
      metricsCounterLimit: 128,
    }),
    downstream,
    deadlineRuntime: Object.freeze({
      schedule: Object.freeze((callback, milliseconds) => setTimeout(callback, milliseconds)),
      cancel: Object.freeze(handle => {
        clearTimeout(handle);
        return true;
      }),
    }),
    httpsServerFactory: factory,
  });
  assert.deepEqual(await owner.start(), { status: 'LISTENING' });
  const response = await tlsHttpExchange(
    port,
    clientCert,
    'POST /service HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\nConnection: close\r\n\r\n',
  );
  assert.equal(response.subarray(0, 12).toString('ascii'), 'HTTP/1.1 204');
  assert.deepEqual(await owner.close(), { status: 'CLOSED' });
  assert.deepEqual(downstreamEvents, ['handle', 'close']);
  assert.equal(owner.snapshotMetrics().closeClean, 1);
  clientCert.fill(0);
});

test('listener-stop at the connection-start budget preserves accepted TLS progress', async () => {
  const port = await reservePort();
  const clientCert = Buffer.from(material.cert);
  const downstreamEvents = [];
  const downstream = Object.freeze({
    handle: Object.freeze(function handle(_request, response, _context, completion) {
      downstreamEvents.push('handle');
      response.statusCode = 204;
      response.end();
      completion.success();
      return undefined;
    }),
    close: Object.freeze(function close(completion) {
      downstreamEvents.push('close');
      completion.success();
      return undefined;
    }),
  });
  const owner = createServiceCreditBoundedHttpsIngressOwner({
    origin: 'https://127.0.0.1',
    requestTargets: Object.freeze(['/service']),
    generation: Object.freeze({
      generationId: 'focused.native.factory.budget.stop',
      generationVersion: 1,
    }),
    limits: Object.freeze({
      maxHeaderBytes: 4096,
      maxHeaderCount: 32,
      maxConcurrentSockets: 1,
      maxConnectionStarts: 1,
      maxConcurrentRequests: 1,
      maxRequestStarts: 1,
      tlsHandshakeDeadlineMs: 500,
      headerDeadlineMs: 500,
      requestResponseDeadlineMs: 800,
      idleSocketDeadlineMs: 900,
      startDeadlineMs: 1_000,
      closeGraceMs: 1_500,
      metricsCounterLimit: 128,
    }),
    downstream,
    deadlineRuntime: Object.freeze({
      schedule: Object.freeze((callback, milliseconds) => setTimeout(callback, milliseconds)),
      cancel: Object.freeze(handle => {
        clearTimeout(handle);
        return true;
      }),
    }),
    httpsServerFactory: createServiceCreditBoundedNodeHttpsServerFactory(
      factoryConfiguration(port, material),
    ),
  });
  assert.deepEqual(await owner.start(), { status: 'LISTENING' });
  let response = null;
  let exchangeFailed = false;
  try {
    response = await tlsHttpExchange(
      port,
      clientCert,
      'POST /service HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\nConnection: close\r\n\r\n',
      3_000,
    );
  } catch {
    exchangeFailed = true;
  }
  let closeResult = null;
  try { closeResult = await owner.close(); } catch {}
  clientCert.fill(0);
  assert.equal(exchangeFailed, false);
  assert.equal(response.subarray(0, 12).toString('ascii'), 'HTTP/1.1 204');
  assert.deepEqual(closeResult, { status: 'CLOSED' });
  assert.deepEqual(downstreamEvents, ['handle', 'close']);
  assert.equal(owner.snapshotMetrics().closeClean, 1);
});

test('occupied fixed bind yields bounded ingress uncertainty without fabricated terminal evidence', async t => {
  const occupied = await occupyPort();
  t.after(async () => { await closeServer(occupied.reservation); });
  const deadlines = new Set();
  const owner = createServiceCreditBoundedHttpsIngressOwner({
    origin: 'https://127.0.0.1',
    requestTargets: Object.freeze(['/service']),
    generation: Object.freeze({ generationId: 'focused.native.bind.failure', generationVersion: 1 }),
    limits: Object.freeze({
      maxHeaderBytes: 4096,
      maxHeaderCount: 32,
      maxConcurrentSockets: 1,
      maxConnectionStarts: 4,
      maxConcurrentRequests: 1,
      maxRequestStarts: 4,
      tlsHandshakeDeadlineMs: 50,
      headerDeadlineMs: 50,
      requestResponseDeadlineMs: 80,
      idleSocketDeadlineMs: 100,
      startDeadlineMs: 100,
      closeGraceMs: 150,
      metricsCounterLimit: 64,
    }),
    downstream: Object.freeze({
      handle: Object.freeze((_request, _response, _context, completion) => {
        completion.failure();
      }),
      close: Object.freeze(completion => { completion.success(); }),
    }),
    deadlineRuntime: Object.freeze({
      schedule: Object.freeze((callback, milliseconds) => {
        let handle;
        handle = setTimeout(() => {
          deadlines.delete(handle);
          callback();
        }, milliseconds);
        deadlines.add(handle);
        return handle;
      }),
      cancel: Object.freeze(handle => {
        clearTimeout(handle);
        deadlines.delete(handle);
        return true;
      }),
    }),
    httpsServerFactory: createServiceCreditBoundedNodeHttpsServerFactory(
      factoryConfiguration(occupied.port, material),
    ),
  });
  await expectCodeAsync(() => owner.start(),
    'SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_OWNER_START_UNCERTAIN');
  await expectCodeAsync(() => owner.close(),
    'SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_OWNER_CLOSE_UNCERTAIN');
  const metrics = owner.snapshotMetrics();
  assert.equal(metrics.closeClean, 0);
  assert.equal(metrics.closeUncertain, 1);
  assert.equal(deadlines.size, 0);
});

test('source is default-off and installs no process-global observer or hidden authority path', () => {
  const source = readFileSync(
    new URL('../src/service-credit-bounded-node-https-server-factory.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    source,
    /node:(?:async_hooks|v8)|['"]async_hooks['"]|promiseHooks|createHook|AsyncLocalStorage/,
  );
  assert.doesNotMatch(
    source,
    /\bprocess\s*\.\s*(?:on|once|addListener|prependListener|prependOnceListener)\s*\(/,
  );
  assert.doesNotMatch(
    source,
    /unhandledRejection|rejectionHandled|multipleResolves|uncaughtExceptionMonitor/,
  );
  assert.doesNotMatch(
    source,
    /['"](?:authorization|forwarded|x-forwarded-for|remoteAddress|remotePort)['"]|\b(?:wallet|signer|payment|fetch|WebSocket)\b/iu,
  );
  assert.equal(existsSync(new URL('../src/service-credit-bounded-node-https-server-factory.js', import.meta.url)), true);
});
