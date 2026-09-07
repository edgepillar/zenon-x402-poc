import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { Server, request as httpRequest } from 'node:http';
import { connect as netConnect } from 'node:net';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

import { createServiceCreditAuthorization } from '../src/service-credit-client.js';
import {
  SERVICE_CREDIT_CAPABILITY_PROOF_VERSION,
  createServiceCreditCapabilitySigningBytes,
  deriveServiceCreditCapabilityCommitment,
} from '../src/service-credit-capability.js';
import { createServiceCreditCompositionOwner } from '../src/service-credit-composition.js';
import {
  MockExactZenonClient,
  MockExactZenonFacilitator,
} from '../src/mock-payment.js';
import { deriveServiceCreditResourceBinding } from '../src/service-credit-activation.js';
import {
  SERVICE_CREDIT_HTTP_PATH,
  SERVICE_CREDIT_HTTP_ROUTE_ID,
} from '../src/service-credit-http.js';
import {
  REQUEST_STATE,
  SERVICE_CREDIT_ACTIVATION_VERSION,
  SERVICE_CREDIT_MODEL_VERSION,
} from '../src/service-credit-model.js';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';
import { createServiceCreditLoopbackServer } from '../src/service-credit-loopback-server.js';
import {
  MOCK_NETWORK,
  MOCK_ZENON_CHAIN_PROFILE,
  makePaymentRequired,
} from '../src/x402-wire.js';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TEST_DIRECTORY, '..');
const MODULE_PATH = join(ROOT, 'src', 'service-credit-loopback-server.js');
const MODULE_URL = pathToFileURL(MODULE_PATH).href;
const NOW = 2_000_000_000_000;
const COST_UNITS = 2;
const TOTAL_UNITS = 7;
const CONTENT_TYPE = 'application/json';
const EMPTY_BODY_DIGEST = `sha256:${createHash('sha256')
  .update(Buffer.alloc(0))
  .digest('hex')}`;
const SPKI_ED25519_PREFIX_HEX = '302a300506032b6570032100';
const SUCCESS_BODY = Buffer.from('{"ok":true,"resultCode":"service.loopback.completed"}', 'utf8');
const FUNDING_RESOURCE_URL = 'https://service.example/loopback/fund';
const MODULE_EDGE_PARSER = [
  "import { readFileSync } from 'node:fs';",
  "import { SourceTextModule } from 'node:vm';",
  "const parsed = new SourceTextModule(readFileSync(0, 'utf8'));",
  'process.stdout.write(JSON.stringify(',
  'parsed.moduleRequests.map(request => request.specifier)',
  '));',
].join('');
const DYNAMIC_IMPORT_GUARD = /\bimport(?:(?:\s+)|(?:\/\*[\s\S]*?\*\/)|(?:\/\/[^\r\n\u2028\u2029]*(?:\r\n?|\n|\u2028|\u2029|$)))*\(/u;

function digest(fill) {
  return `sha256:${fill.repeat(64)}`;
}

function keyMaterial() {
  const pair = generateKeyPairSync('ed25519');
  const spki = pair.publicKey.export({ format: 'der', type: 'spki' });
  assert.equal(spki.subarray(0, -32).toString('hex') === SPKI_ED25519_PREFIX_HEX, true);
  return Object.freeze({
    privateKey: pair.privateKey,
    publicKey: spki.subarray(-32).toString('base64url'),
  });
}

function offer() {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.loopback',
    serviceId: 'service.loopback',
    resourceId: 'resource.loopback',
    resourceBinding: digest('e'),
    offerId: 'offer.loopback',
    offerVersion: 1,
    costPolicyId: 'policy.fixed',
    fundingPolicyId: 'funding.fixed',
    fundingPolicyVersion: 1,
  };
}

function grant(keys) {
  return {
    activationVersion: SERVICE_CREDIT_ACTIVATION_VERSION,
    authorityProfileId: 'authority.mock.loopback',
    authorityProfileVersion: 1,
    verifierVersion: 1,
    authorityRecordDigest: digest('d'),
    fundingPolicyId: 'funding.fixed',
    fundingPolicyVersion: 1,
    sourceSettlementId: 'settlement.loopback.synthetic',
    transactionId: `mocktx:${createHash('sha256').update('loopback.synthetic').digest('hex')}`,
    providerId: 'provider.loopback',
    serviceId: 'service.loopback',
    resourceId: 'resource.loopback',
    resourceBinding: digest('e'),
    offerId: 'offer.loopback',
    offerVersion: 1,
    holderId: 'holder.loopback',
    capabilityCommitment: deriveServiceCreditCapabilityCommitment({ publicKey: keys.publicKey }),
    totalUnits: TOTAL_UNITS,
    expiresAt: NOW + 60_000,
    scheme: 'exact',
    paymentFlow: 'upfront',
    network: 'zenon:mock',
    chainProfile: {
      version: 1,
      chainIdentifier: Number.MAX_SAFE_INTEGER.toString(),
      genesisMomentumHash: '0'.repeat(64),
    },
    asset: 'zts1mockasset',
    amount: '7',
    payee: 'payee.loopback',
    payer: 'holder.loopback',
    paymentResourceDigest: digest('4'),
    paymentRequirementDigest: digest('2'),
    paymentIntentDigest: digest('1'),
    grantFundingCommitment: digest('3'),
    evidenceState: 'MOMENTUM_INCLUDED',
    confirmationPolicy: {
      policyId: 'mock.momentum-included',
      policyVersion: 1,
      minimumConfirmations: 1,
    },
  };
}

function signedRequest(keys, activeGrant, requestId) {
  const request = Object.freeze({
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    grantId: activeGrant.grantId,
    requestId,
    method: 'POST',
    routeId: SERVICE_CREDIT_HTTP_ROUTE_ID,
    canonicalBodyDigest: EMPTY_BODY_DIGEST,
    selectedContentType: CONTENT_TYPE,
    maxCostUnits: COST_UNITS,
  });
  const signingBytes = createServiceCreditCapabilitySigningBytes(request);
  let signature;
  try {
    signature = sign(null, signingBytes, keys.privateKey).toString('base64url');
  } finally {
    signingBytes.fill(0);
  }
  const proof = Object.freeze({
    proofVersion: SERVICE_CREDIT_CAPABILITY_PROOF_VERSION,
    grantId: request.grantId,
    requestId: request.requestId,
    publicKey: keys.publicKey,
    maxCostUnits: request.maxCostUnits,
    signature,
  });
  const authorization = createServiceCreditAuthorization({
    grant: {
      grantId: activeGrant.grantId,
      capabilityCommitment: activeGrant.capabilityCommitment,
    },
    request,
    proof,
  });
  return Object.freeze({ authorization, proof, request });
}

function createReopenedOwner(t, execute) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'service-credit-loopback-')));
  chmodSync(directory, 0o700);
  const configuration = {
    databasePath: join(directory, 'ledger.sqlite'),
    allowedRoot: directory,
    deriveCost: () => COST_UNITS,
    now: () => NOW,
  };
  const keys = keyMaterial();
  let store = ServiceCreditSqliteStore.create(configuration);
  store.registerOffer(offer());
  const activeGrant = store.activateGrantFromTrustedRecord(grant(keys));
  store.close();
  store = ServiceCreditSqliteStore.openExisting(configuration);
  const owner = createServiceCreditCompositionOwner({
    store,
    activationOptions: {
      verifySettlement: async () => {
        throw new Error('unreachable synthetic verifier');
      },
      authorityProfile: {
        profileId: 'authority.mock.loopback',
        profileVersion: 1,
        verifierVersion: 1,
        recordDigest: digest('d'),
      },
      now: () => NOW,
    },
    execute,
  });
  t.after(() => {
    try { store.close(); } catch {}
    rmSync(directory, { recursive: true, force: true });
  });
  return Object.freeze({ activeGrant, keys, owner, store });
}

function errorCode(operation, expected) {
  return assert.rejects(operation, error => {
    assert.equal(error?.name, 'ServiceCreditLoopbackError');
    assert.equal(error?.code, expected);
    assert.equal(error?.message, expected);
    assert.equal(error?.stack, `ServiceCreditLoopbackError: ${expected}`);
    assert.equal(Object.hasOwn(error, 'cause'), false);
    return true;
  });
}

function portFrom(descriptor) {
  const parsed = new URL(descriptor.origin);
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.protocol, 'http:');
  assert.equal(parsed.pathname, '/');
  assert.equal(parsed.search, '');
  assert.equal(parsed.hash, '');
  const port = Number(parsed.port);
  assert.equal(Number.isSafeInteger(port) && port > 0 && port <= 65_535, true);
  return port;
}

function exchange(descriptor, options = {}) {
  return new Promise((resolveExchange, rejectExchange) => {
    const request = httpRequest({
      host: '127.0.0.1',
      port: portFrom(descriptor),
      method: options.method ?? 'POST',
      path: options.path ?? descriptor.path,
      headers: options.headers ?? {},
      agent: false,
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolveExchange(Object.freeze({
        statusCode: response.statusCode,
        headers: Object.freeze({ ...response.headers }),
        body: Buffer.concat(chunks),
      })));
    });
    request.once('error', rejectExchange);
    if (options.body !== undefined) request.end(options.body);
    else request.end();
  });
}

function rawExchange(port, payload, timeoutMilliseconds = 1_000) {
  return new Promise(resolveExchange => {
    const chunks = [];
    let capturedBytes = 0;
    let settled = false;
    const socket = netConnect({ host: '127.0.0.1', port });
    const finish = kind => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { socket.destroy(); } catch {}
      resolveExchange(Object.freeze({ kind, body: Buffer.concat(chunks) }));
    };
    const timeout = setTimeout(() => finish('timeout'), timeoutMilliseconds);
    socket.once('connect', () => socket.write(payload));
    socket.on('data', chunk => {
      if (capturedBytes >= 8_192) return;
      const remaining = 8_192 - capturedBytes;
      chunks.push(chunk.subarray(0, remaining));
      capturedBytes += Math.min(chunk.length, remaining);
    });
    socket.once('end', () => finish('end'));
    socket.once('close', () => finish('close'));
    socket.once('error', () => finish('error'));
  });
}

function privateResponse(response, statusCode, body) {
  assert.equal(response.statusCode, statusCode);
  assert.equal(response.body.equals(body), true);
  assert.equal(response.headers['cache-control'], 'private, no-store, max-age=0');
  assert.equal(response.headers['content-type'], CONTENT_TYPE);
  assert.equal(response.headers.vary, 'Authorization');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers.connection, 'close');
  assert.equal(response.headers.date, undefined);
  assert.equal(Number(response.headers['content-length']), response.body.length);
}

function basicHandler(observer = undefined) {
  return async (_request, response) => {
    if (observer) observer.calls += 1;
    response.statusCode = 200;
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader('Content-Type', CONTENT_TYPE);
    response.setHeader('Vary', 'Authorization');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Length', 2);
    response.end('{}');
  };
}

function deferred() {
  let resolveDeferred;
  const promise = new Promise(resolvePromise => { resolveDeferred = resolvePromise; });
  return Object.freeze({ promise, resolve: resolveDeferred });
}

function staticImportSpecifiers(source) {
  const parsed = spawnSync(process.execPath, [
    '--no-warnings',
    '--experimental-vm-modules',
    '--input-type=module',
    '--eval',
    MODULE_EDGE_PARSER,
  ], {
    encoding: 'utf8',
    input: source,
  });
  assert.equal(parsed.status, 0);
  assert.doesNotMatch(source, DYNAMIC_IMPORT_GUARD);
  return JSON.parse(parsed.stdout);
}

function importClosure(entry) {
  const visited = new Set();
  const external = new Set();
  const pending = [entry];
  while (pending.length > 0) {
    const current = pending.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    const source = readFileSync(current, 'utf8');
    for (const specifier of staticImportSpecifiers(source)) {
      if (!specifier.startsWith('.')) {
        external.add(specifier);
        continue;
      }
      const target = resolve(dirname(current), specifier);
      const sourceRelative = relative(join(ROOT, 'src'), target);
      assert.equal(
        sourceRelative !== ''
          && sourceRelative !== '..'
          && !sourceRelative.startsWith('../')
          && !isAbsolute(sourceRelative),
        true,
      );
      pending.push(target);
    }
  }
  return Object.freeze({ external, visited });
}

function fundingRequirement() {
  return {
    scheme: 'exact',
    network: MOCK_NETWORK,
    asset: 'zts1mockasset',
    amount: '7',
    payTo: 'mock-payee',
    maxTimeoutSeconds: 30,
    extra: {
      paymentFlow: 'upfront',
      poc: true,
      settlement: 'account-block',
      zenonChain: { ...MOCK_ZENON_CHAIN_PROFILE },
    },
  };
}

function activationOffer() {
  return {
    ...offer(),
    resourceBinding: deriveServiceCreditResourceBinding({
      resourceId: 'resource.loopback',
      resourceUrl: FUNDING_RESOURCE_URL,
    }),
  };
}

function fundingIntent(holderId, capabilityCommitment) {
  return Object.freeze({
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    activationVersion: SERVICE_CREDIT_ACTIVATION_VERSION,
    providerId: 'provider.loopback',
    serviceId: 'service.loopback',
    resourceId: 'resource.loopback',
    offerId: 'offer.loopback',
    offerVersion: 1,
    holderId,
    capabilityCommitment,
    totalUnits: TOTAL_UNITS,
    expiresAt: NOW + 60_000,
  });
}

async function createLatchedOwner(t, latch) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'service-credit-loopback-latch-')));
  chmodSync(directory, 0o700);
  let armed = false;
  let failNextLoad = false;
  const store = ServiceCreditSqliteStore.create({
    databasePath: join(directory, 'ledger.sqlite'),
    allowedRoot: directory,
    deriveCost: () => COST_UNITS,
    now: () => NOW,
    testHooks: {
      beforeBegin({ operation }) {
        if (failNextLoad && operation === 'load') {
          failNextLoad = false;
          throw new Error('synthetic private load detail');
        }
      },
      afterCommit({ operation, changed }) {
        if (!armed || !changed || operation !== 'activateGrantFromTrustedRecord') return;
        if (latch === 'unknown') throw new Error('synthetic private commit detail');
        failNextLoad = true;
      },
    },
  });
  store.registerOffer(activationOffer());
  const facilitator = new MockExactZenonFacilitator();
  let settlementCalls = 0;
  let executionCalls = 0;
  const owner = createServiceCreditCompositionOwner({
    store,
    activationOptions: {
      verifySettlement: async (...input) => {
        settlementCalls += 1;
        return facilitator.settle(...input);
      },
      authorityProfile: {
        profileId: 'authority.mock.loopback',
        profileVersion: 1,
        verifierVersion: 1,
        recordDigest: digest('d'),
      },
      now: () => NOW,
    },
    execute: () => {
      executionCalls += 1;
      return { resultCode: 'service.must-not-run' };
    },
  });
  const capability = keyMaterial();
  const client = new MockExactZenonClient();
  const intent = fundingIntent(
    client.address,
    deriveServiceCreditCapabilityCommitment({ publicKey: capability.publicKey }),
  );
  const requirement = fundingRequirement();
  const prepared = owner.createFundingResource({
    intent,
    requirement,
    resourceUrl: FUNDING_RESOURCE_URL,
  });
  const paymentRequired = makePaymentRequired({
    resourceUrl: prepared.resource.url,
    tags: prepared.resource.tags,
    requirement,
  });
  const paymentPayload = await client.createPaymentPayload(paymentRequired, requirement);
  armed = true;
  const expected = latch === 'unknown'
    ? 'SERVICE_CREDIT_ACTIVATION_OUTCOME_UNKNOWN'
    : 'SERVICE_CREDIT_COMPOSITION_ACTIVATED_UNAVAILABLE';
  await assert.rejects(
    () => owner.activateFunding({ intent, paymentRequired, paymentPayload }),
    error => error?.code === expected && error?.message === expected,
  );
  t.after(() => {
    try { store.close(); } catch {}
    rmSync(directory, { recursive: true, force: true });
  });
  return Object.freeze({
    owner,
    settlementCalls: () => settlementCalls,
    executionCalls: () => executionCalls,
  });
}

test('module export exists and import plus factory are inert', async () => {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'service-credit-loopback-import-')));
  chmodSync(parent, 0o700);
  try {
    const program = `import{readdirSync}from'node:fs';await import('node:http');const before=process.getActiveResourcesInfo().sort();const listeners=process.eventNames().map(n=>[String(n),process.listenerCount(n)]);const m=await import(${JSON.stringify(MODULE_URL)});const api=m.createServiceCreditLoopbackServer({handler:async()=>{}});const after=process.getActiveResourcesInfo().sort();const finalListeners=process.eventNames().map(n=>[String(n),process.listenerCount(n)]);process.stdout.write(JSON.stringify({exports:Object.keys(m),api:Object.keys(api),resources:JSON.stringify(before)===JSON.stringify(after),listeners:JSON.stringify(listeners)===JSON.stringify(finalListeners),entries:readdirSync(${JSON.stringify(parent)}).length}));`;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', program], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: parent },
    });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    const observed = JSON.parse(result.stdout);
    assert.deepEqual(observed.exports, ['createServiceCreditLoopbackServer']);
    assert.deepEqual(observed.api, ['start', 'close']);
    assert.equal(observed.resources, true);
    assert.equal(observed.listeners, true);
    assert.equal(observed.entries, 0);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('configuration is exact, descriptor-safe, and hook-free', async t => {
  const invalid = [undefined, null, {}, [], Object.create(null), { handler: basicHandler(), extra: true }];
  for (const [index, value] of invalid.entries()) {
    await t.test(String(index), () => {
      assert.throws(() => createServiceCreditLoopbackServer(value), error => {
        assert.equal(error?.code, 'SERVICE_CREDIT_LOOPBACK_INVALID_CONFIGURATION');
        return true;
      });
    });
  }
  assert.throws(
    () => createServiceCreditLoopbackServer({ handler: basicHandler() }, undefined),
    error => error?.code === 'SERVICE_CREDIT_LOOPBACK_INVALID_CONFIGURATION',
  );
  let getterCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, 'handler', {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error('private accessor detail');
    },
  });
  assert.throws(
    () => createServiceCreditLoopbackServer(accessor),
    error => error?.code === 'SERVICE_CREDIT_LOOPBACK_INVALID_CONFIGURATION',
  );
  assert.equal(getterCalls, 0);
  let proxyCalls = 0;
  const proxy = new Proxy({ handler: basicHandler() }, {
    ownKeys() {
      proxyCalls += 1;
      throw new Error('private proxy detail');
    },
  });
  assert.throws(
    () => createServiceCreditLoopbackServer(proxy),
    error => error?.code === 'SERVICE_CREDIT_LOOPBACK_INVALID_CONFIGURATION',
  );
  assert.equal(proxyCalls, 0);
  assert.throws(
    () => createServiceCreditLoopbackServer({ handler: new Proxy(basicHandler(), {}) }),
    error => error?.code === 'SERVICE_CREDIT_LOOPBACK_INVALID_CONFIGURATION',
  );
  const symbolConfiguration = { handler: basicHandler() };
  symbolConfiguration[Symbol('hidden')] = true;
  assert.throws(
    () => createServiceCreditLoopbackServer(symbolConfiguration),
    error => error?.code === 'SERVICE_CREDIT_LOOPBACK_INVALID_CONFIGURATION',
  );
});

test('start binds one exact bounded IPv4 loopback server and close is final', async t => {
  const originalListen = Server.prototype.listen;
  const originalClose = Server.prototype.close;
  let capturedServer;
  let capturedOptions;
  let closeCalls = 0;
  t.mock.method(Server.prototype, 'listen', function instrumentedListen(options, callback) {
    capturedServer = this;
    capturedOptions = { ...options };
    return Reflect.apply(originalListen, this, [options, callback]);
  });
  t.mock.method(Server.prototype, 'close', function instrumentedClose(callback) {
    closeCalls += 1;
    return Reflect.apply(originalClose, this, [callback]);
  });
  const beforeServerHandles = process._getActiveHandles().filter(value => value instanceof Server).length;
  const api = createServiceCreditLoopbackServer({ handler: basicHandler() });
  assert.equal(Object.isFrozen(api), true);
  assert.deepEqual(Reflect.ownKeys(api), ['start', 'close']);
  assert.equal(Object.isFrozen(api.start), true);
  assert.equal(Object.isFrozen(api.close), true);
  const firstPromise = api.start();
  const concurrentPromise = api.start();
  assert.equal(firstPromise === concurrentPromise, true);
  const descriptor = await firstPromise;
  assert.equal(await concurrentPromise === descriptor, true);
  assert.equal(await api.start() === descriptor, true);
  assert.equal(Object.isFrozen(descriptor), true);
  assert.deepEqual(Reflect.ownKeys(descriptor), ['origin', 'path']);
  assert.equal(descriptor.path, SERVICE_CREDIT_HTTP_PATH);
  const boundPort = portFrom(descriptor);
  assert.deepEqual(capturedOptions, {
    host: '127.0.0.1',
    port: 0,
    exclusive: true,
    reusePort: false,
    backlog: 8,
  });
  assert.equal(capturedServer.maxHeadersCount, 8);
  assert.equal(capturedServer.maxConnections, 8);
  assert.equal(capturedServer.maxRequestsPerSocket, 1);
  assert.equal(capturedServer.headersTimeout, 2_000);
  assert.equal(capturedServer.requestTimeout, 3_000);
  assert.equal(capturedServer.timeout, 5_000);
  await errorCode(() => api.start('unexpected'), 'SERVICE_CREDIT_LOOPBACK_INVALID_INVOCATION');
  const firstClose = api.close();
  const repeatedClose = api.close();
  assert.equal(firstClose === repeatedClose, true);
  await firstClose;
  assert.equal(closeCalls, 1);
  assert.equal(capturedServer.listening, false);
  assert.equal(capturedServer.address(), null);
  const postClose = await rawExchange(
    boundPort,
    `GET ${SERVICE_CREDIT_HTTP_PATH} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n`,
    250,
  );
  assert.equal(postClose.kind === 'error' || postClose.kind === 'close', true);
  assert.equal(postClose.body.length, 0);
  await errorCode(() => api.start(), 'SERVICE_CREDIT_LOOPBACK_UNAVAILABLE');
  await new Promise(resolveDelay => setTimeout(resolveDelay, 25));
  const afterServerHandles = process._getActiveHandles().filter(value => value instanceof Server).length;
  assert.equal(afterServerHandles, beforeServerHandles);
});

test('close before start is shared, permanent, and never binds', async () => {
  const api = createServiceCreditLoopbackServer({ handler: basicHandler() });
  await errorCode(() => api.close('unexpected'), 'SERVICE_CREDIT_LOOPBACK_INVALID_INVOCATION');
  const first = api.close();
  const second = api.close();
  assert.equal(first === second, true);
  await first;
  await errorCode(() => api.start(), 'SERVICE_CREDIT_LOOPBACK_UNAVAILABLE');
});

test('wrong-arity start and close calls leave NEW and STARTED lifecycle unchanged', async t => {
  const closableFromNew = createServiceCreditLoopbackServer({ handler: basicHandler() });
  await errorCode(
    () => closableFromNew.start(undefined),
    'SERVICE_CREDIT_LOOPBACK_INVALID_INVOCATION',
  );
  await errorCode(
    () => closableFromNew.close(undefined),
    'SERVICE_CREDIT_LOOPBACK_INVALID_INVOCATION',
  );
  await closableFromNew.close();
  await errorCode(() => closableFromNew.start(), 'SERVICE_CREDIT_LOOPBACK_UNAVAILABLE');

  const observer = { calls: 0 };
  const startableFromNew = createServiceCreditLoopbackServer({ handler: basicHandler(observer) });
  t.after(() => startableFromNew.close().catch(() => {}));
  await errorCode(
    () => startableFromNew.start('unexpected'),
    'SERVICE_CREDIT_LOOPBACK_INVALID_INVOCATION',
  );
  await errorCode(
    () => startableFromNew.close('unexpected'),
    'SERVICE_CREDIT_LOOPBACK_INVALID_INVOCATION',
  );
  const descriptor = await startableFromNew.start();
  await errorCode(
    () => startableFromNew.start('unexpected'),
    'SERVICE_CREDIT_LOOPBACK_INVALID_INVOCATION',
  );
  await errorCode(
    () => startableFromNew.close('unexpected'),
    'SERVICE_CREDIT_LOOPBACK_INVALID_INVOCATION',
  );
  privateResponse(await exchange(descriptor), 200, Buffer.from('{}', 'utf8'));
  assert.equal(observer.calls, 1);
  assert.equal(await startableFromNew.start() === descriptor, true);
  await startableFromNew.close();
});

test('silent listen fails within the fixed startup deadline and quarantines permanently', async t => {
  const nativeSetTimeout = globalThis.setTimeout;
  let createdServer;
  let listenCalls = 0;
  let closeCalls = 0;
  let unrefCalls = 0;
  let handlerCalls = 0;
  let lateListenCallback;
  const observedStartupDelays = [];
  t.mock.method(globalThis, 'setTimeout', function acceleratedDeadline(callback, milliseconds, ...args) {
    if (milliseconds === 2_000) {
      observedStartupDelays.push(milliseconds);
      return Reflect.apply(nativeSetTimeout, globalThis, [callback, 10, ...args]);
    }
    return Reflect.apply(nativeSetTimeout, globalThis, [callback, milliseconds, ...args]);
  });
  t.mock.method(Server.prototype, 'listen', function silentListen(_options, callback) {
    createdServer = this;
    lateListenCallback = callback;
    listenCalls += 1;
    return this;
  });
  t.mock.method(Server.prototype, 'close', function observedClose(callback) {
    closeCalls += 1;
    queueMicrotask(() => callback?.(new Error('synthetic private not-listening detail')));
    return this;
  });
  t.mock.method(Server.prototype, 'unref', function observedUnref() {
    unrefCalls += 1;
    return this;
  });
  const api = createServiceCreditLoopbackServer({
    handler: async () => { handlerCalls += 1; },
  });
  const outcome = await Promise.race([
    api.start().then(
      () => 'unexpected-success',
      error => error?.code,
    ),
    new Promise(resolveGuard => nativeSetTimeout(() => resolveGuard('guard-timeout'), 250)),
  ]);
  assert.equal(outcome, 'SERVICE_CREDIT_LOOPBACK_START_FAILED');
  await errorCode(() => api.start(), 'SERVICE_CREDIT_LOOPBACK_UNAVAILABLE');
  await errorCode(() => api.close(), 'SERVICE_CREDIT_LOOPBACK_CLOSE_UNCERTAIN');
  lateListenCallback();
  await new Promise(resolveImmediate => setImmediate(resolveImmediate));
  assert.deepEqual(observedStartupDelays, [2_000]);
  assert.equal(listenCalls, 1);
  assert.equal(closeCalls, 1);
  assert.equal(unrefCalls >= 1, true);
  assert.equal(handlerCalls, 0);
  assert.equal(process._getActiveHandles().includes(createdServer), false);
});

test('close during silent startup cancels the deadline and completes one-shot shutdown', async t => {
  const nativeSetTimeout = globalThis.setTimeout;
  let createdServer;
  let listenCalls = 0;
  let closeCalls = 0;
  let handlerCalls = 0;
  let lateListenCallback;
  t.mock.method(globalThis, 'setTimeout', function acceleratedDeadline(callback, milliseconds, ...args) {
    if (milliseconds === 2_000) {
      return Reflect.apply(nativeSetTimeout, globalThis, [callback, 10, ...args]);
    }
    return Reflect.apply(nativeSetTimeout, globalThis, [callback, milliseconds, ...args]);
  });
  t.mock.method(Server.prototype, 'listen', function silentListen(_options, callback) {
    createdServer = this;
    lateListenCallback = callback;
    listenCalls += 1;
    return this;
  });
  t.mock.method(Server.prototype, 'close', function observedClose(callback) {
    closeCalls += 1;
    queueMicrotask(() => callback?.(new Error('synthetic private not-listening detail')));
    return this;
  });
  const api = createServiceCreditLoopbackServer({
    handler: async () => { handlerCalls += 1; },
  });
  const starting = api.start();
  const closing = api.close();
  assert.equal(closeCalls, 1);
  await errorCode(() => starting, 'SERVICE_CREDIT_LOOPBACK_UNAVAILABLE');
  await Promise.race([
    closing,
    new Promise((_, rejectGuard) => nativeSetTimeout(
      () => rejectGuard(new Error('bounded close guard')),
      250,
    )),
  ]);
  assert.equal(closing === api.close(), true);
  lateListenCallback();
  await new Promise(resolveDelay => nativeSetTimeout(resolveDelay, 25));
  assert.equal(listenCalls, 1);
  assert.equal(closeCalls, 1);
  assert.equal(handlerCalls, 0);
  await errorCode(() => api.start(), 'SERVICE_CREDIT_LOOPBACK_UNAVAILABLE');
  assert.equal(process._getActiveHandles().includes(createdServer), false);
});

test('close racing startup blocks publication and performs one shutdown', async () => {
  const api = createServiceCreditLoopbackServer({ handler: basicHandler() });
  const start = api.start();
  const close = api.close();
  await errorCode(() => start, 'SERVICE_CREDIT_LOOPBACK_UNAVAILABLE');
  await close;
  assert.equal(close === api.close(), true);
  await errorCode(() => api.start(), 'SERVICE_CREDIT_LOOPBACK_UNAVAILABLE');
});

test('real reopened owner executes three requests and one replay through the client codec', async t => {
  const execution = { calls: 0 };
  const ledger = createReopenedOwner(t, () => {
    execution.calls += 1;
    return { resultCode: 'service.loopback.completed' };
  });
  const api = createServiceCreditLoopbackServer({ handler: ledger.owner.handle });
  t.after(() => api.close().catch(() => {}));
  const descriptor = await api.start();
  const signed = [
    signedRequest(ledger.keys, ledger.activeGrant, 'request.loopback.a'),
    signedRequest(ledger.keys, ledger.activeGrant, 'request.loopback.b'),
    signedRequest(ledger.keys, ledger.activeGrant, 'request.loopback.c'),
  ];
  const protectedMaterial = signed.flatMap(value => [
    Buffer.from(value.authorization, 'utf8'),
    Buffer.from(value.proof.publicKey, 'utf8'),
    Buffer.from(value.proof.signature, 'utf8'),
    Buffer.from(value.proof.grantId, 'utf8'),
    Buffer.from(value.proof.requestId, 'utf8'),
  ]);
  const first = await exchange(descriptor, { headers: { Authorization: signed[0].authorization } });
  const replay = await exchange(descriptor, { headers: { Authorization: signed[0].authorization } });
  const second = await exchange(descriptor, { headers: { Authorization: signed[1].authorization } });
  const third = await exchange(descriptor, { headers: { Authorization: signed[2].authorization } });
  for (const response of [first, replay, second, third]) {
    privateResponse(response, 200, SUCCESS_BODY);
    const rendered = Buffer.concat([
      Buffer.from(JSON.stringify(response.headers), 'utf8'),
      response.body,
    ]);
    assert.equal(protectedMaterial.every(value => !rendered.includes(value)), true);
  }
  assert.equal(first.body.equals(replay.body), true);
  assert.equal(JSON.stringify(first.headers) === JSON.stringify(replay.headers), true);
  assert.equal(execution.calls, 3);
  const snapshot = ledger.store.load();
  const active = ledger.store.getGrant(ledger.activeGrant.grantId);
  assert.equal(snapshot.revision, 11);
  assert.equal(snapshot.state.offers.length, 1);
  assert.equal(snapshot.state.grants.length, 1);
  assert.equal(snapshot.state.requests.length, 3);
  assert.equal(snapshot.state.requests.every(value => value.state === REQUEST_STATE.SUCCEEDED), true);
  assert.equal(active.totalUnits, 7);
  assert.equal(active.availableUnits, 1);
  assert.equal(active.heldUnits, 0);
  assert.equal(active.consumedUnits, 6);
  assert.equal(active.totalUnits === active.availableUnits + active.heldUnits + active.consumedUnits, true);
  await api.close();
});

test('transport prechecks and handler framing reject malformed authority', async t => {
  const execution = { calls: 0 };
  const ledger = createReopenedOwner(t, () => {
    execution.calls += 1;
    return { resultCode: 'service.loopback.completed' };
  });
  const signed = signedRequest(ledger.keys, ledger.activeGrant, 'request.loopback.boundary');
  const api = createServiceCreditLoopbackServer({ handler: ledger.owner.handle });
  t.after(() => api.close().catch(() => {}));
  const descriptor = await api.start();
  const port = portFrom(descriptor);
  const duplicate = await exchange(descriptor, {
    headers: { Authorization: [signed.authorization, signed.authorization] },
  });
  privateResponse(duplicate, 401, Buffer.from('{"error":"unauthorized"}', 'utf8'));
  const framed = await exchange(descriptor, {
    headers: { Authorization: signed.authorization, 'Content-Length': '1' },
    body: 'x',
  });
  privateResponse(framed, 400, Buffer.from('{"error":"invalid_request"}', 'utf8'));
  assert.equal(execution.calls, 0);
  const rawCases = [
    'GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nBad Header\r\n\r\n',
    `POST ${SERVICE_CREDIT_HTTP_PATH} HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Large: ${'a'.repeat(2_100)}\r\n\r\n`,
    `POST ${SERVICE_CREDIT_HTTP_PATH} HTTP/1.1\r\nHost: 127.0.0.1\r\n${Array.from({ length: 9 }, (_, index) => `X-Bound-${index}: x\r\n`).join('')}\r\n`,
    `POST ${SERVICE_CREDIT_HTTP_PATH} HTTP/1.1\r\nHost: 127.0.0.1\r\nExpect: 100-continue\r\nContent-Length: 1\r\n\r\nx`,
    `POST ${SERVICE_CREDIT_HTTP_PATH} HTTP/1.1\r\nHost: 127.0.0.1\r\nExpect: unsupported\r\nContent-Length: 0\r\n\r\n`,
    `GET ${SERVICE_CREDIT_HTTP_PATH} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: synthetic\r\n\r\n`,
    `CONNECT 127.0.0.1:${port} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n`,
  ];
  for (const payload of rawCases) {
    const result = await rawExchange(port, payload);
    assert.equal(result.kind !== 'timeout', true);
    assert.equal(result.body.includes(Buffer.from('400 Bad Request', 'ascii')), true);
    assert.equal(result.body.includes(Buffer.from(signed.authorization, 'utf8')), false);
  }
  const slowHeader = await rawExchange(
    port,
    `POST ${SERVICE_CREDIT_HTTP_PATH} HTTP/1.1\r\nHo`,
    3_000,
  );
  assert.equal(slowHeader.kind !== 'timeout', true);
  assert.equal(slowHeader.body.includes(Buffer.from('400 Bad Request', 'ascii')), true);
  assert.equal(execution.calls, 0);
  await api.close();
});

test('composition quarantine outcomes remain fixed across real loopback transport', async t => {
  for (const latch of ['unknown', 'unavailable']) {
    await t.test(latch, async nested => {
      const latched = await createLatchedOwner(nested, latch);
      const api = createServiceCreditLoopbackServer({ handler: latched.owner.handle });
      nested.after(() => api.close().catch(() => {}));
      const descriptor = await api.start();
      const response = await exchange(descriptor, {
        headers: { Authorization: 'ServiceCredit invalid' },
      });
      privateResponse(response, 503, Buffer.from('{"error":"service_unavailable"}', 'utf8'));
      assert.equal(latched.settlementCalls(), 1);
      assert.equal(latched.executionCalls(), 0);
      await api.close();
    });
  }
});

test('pipelining invokes a trusted handler at most once per socket', async t => {
  const observer = { calls: 0 };
  const api = createServiceCreditLoopbackServer({ handler: basicHandler(observer) });
  t.after(() => api.close().catch(() => {}));
  const descriptor = await api.start();
  const payload = [
    `GET ${SERVICE_CREDIT_HTTP_PATH} HTTP/1.1`,
    'Host: 127.0.0.1',
    '',
    `GET ${SERVICE_CREDIT_HTTP_PATH} HTTP/1.1`,
    'Host: 127.0.0.1',
    '',
    '',
  ].join('\r\n');
  const result = await rawExchange(portFrom(descriptor), payload);
  assert.equal(result.kind !== 'timeout', true);
  assert.equal(observer.calls, 1);
  await api.close();
});

test('the ninth concurrent connection gains no handler authority', async t => {
  const observer = { calls: 0 };
  const api = createServiceCreditLoopbackServer({ handler: basicHandler(observer) });
  t.after(() => api.close().catch(() => {}));
  const descriptor = await api.start();
  const port = portFrom(descriptor);
  const held = [];
  try {
    for (let index = 0; index < 8; index += 1) {
      const socket = netConnect({ host: '127.0.0.1', port });
      held.push(socket);
      await new Promise((resolveConnect, rejectConnect) => {
        socket.once('connect', resolveConnect);
        socket.once('error', rejectConnect);
      });
    }
    await new Promise(resolveImmediate => setImmediate(resolveImmediate));
    const ninth = await rawExchange(
      port,
      `GET ${SERVICE_CREDIT_HTTP_PATH} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n`,
    );
    assert.equal(ninth.kind !== 'timeout', true);
    assert.equal(observer.calls, 0);
  } finally {
    for (const socket of held) {
      try { socket.destroy(); } catch {}
    }
  }
  await api.close();
});

test('unexpected handler throw or rejection returns fixed 503 and quarantines transport', async t => {
  for (const kind of ['throw', 'reject']) {
    await t.test(kind, async nested => {
      const privateDetail = 'synthetic private handler detail';
      const handler = kind === 'throw'
        ? () => { throw new Error(privateDetail); }
        : () => Promise.reject(new Error(privateDetail));
      const api = createServiceCreditLoopbackServer({ handler });
      const descriptor = await api.start();
      const response = await exchange(descriptor);
      privateResponse(response, 503, Buffer.from('{"error":"service_unavailable"}', 'utf8'));
      assert.equal(response.body.includes(Buffer.from(privateDetail, 'utf8')), false);
      await errorCode(() => api.close(), 'SERVICE_CREDIT_LOOPBACK_CLOSE_UNCERTAIN');
      await errorCode(() => api.start(), 'SERVICE_CREDIT_LOOPBACK_UNAVAILABLE');
      nested.after(() => api.close().catch(() => {}));
    });
  }
});

test('close waits for an in-flight real handler that settles within grace', async t => {
  const started = deferred();
  const release = deferred();
  let executionCalls = 0;
  let applicationCompleted = false;
  const beforeServerHandles = process._getActiveHandles().filter(value => value instanceof Server).length;
  const ledger = createReopenedOwner(t, async () => {
    executionCalls += 1;
    started.resolve();
    await release.promise;
    applicationCompleted = true;
    return { resultCode: 'service.loopback.completed' };
  });
  const api = createServiceCreditLoopbackServer({ handler: ledger.owner.handle });
  const descriptor = await api.start();
  const port = portFrom(descriptor);
  const signed = signedRequest(ledger.keys, ledger.activeGrant, 'request.loopback.close-grace');
  const pendingExchange = exchange(descriptor, {
    headers: { Authorization: signed.authorization },
  });
  await started.promise;
  const executing = ledger.store.load();
  assert.equal(executing.revision, 4);
  assert.equal(executing.state.requests.length, 1);
  assert.equal(executing.state.requests[0].state, REQUEST_STATE.EXECUTING);
  assert.equal(applicationCompleted, false);

  let closeSettled = false;
  const closeOperation = api.close();
  const closing = closeOperation.finally(() => { closeSettled = true; });
  assert.equal(closeOperation === api.close(), true);
  await new Promise(resolveImmediate => setImmediate(resolveImmediate));
  assert.equal(closeSettled, false);
  assert.equal(applicationCompleted, false);
  assert.equal(ledger.store.load().state.requests[0].state, REQUEST_STATE.EXECUTING);

  release.resolve();
  const response = await pendingExchange;
  privateResponse(response, 200, SUCCESS_BODY);
  await closing;
  assert.equal(closeSettled, true);
  assert.equal(applicationCompleted, true);
  assert.equal(executionCalls, 1);
  const completed = ledger.store.load();
  const active = ledger.store.getGrant(ledger.activeGrant.grantId);
  assert.equal(completed.revision, 5);
  assert.equal(completed.state.requests.length, 1);
  assert.equal(completed.state.requests[0].state, REQUEST_STATE.SUCCEEDED);
  assert.equal(active.totalUnits, 7);
  assert.equal(active.availableUnits, 5);
  assert.equal(active.heldUnits, 0);
  assert.equal(active.consumedUnits, 2);
  const postClose = await rawExchange(
    port,
    `GET ${SERVICE_CREDIT_HTTP_PATH} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n`,
    250,
  );
  assert.equal(postClose.kind === 'error' || postClose.kind === 'close', true);
  assert.equal(postClose.body.length, 0);
  ledger.store.close();
  await new Promise(resolveImmediate => setImmediate(resolveImmediate));
  const afterServerHandles = process._getActiveHandles().filter(value => value instanceof Server).length;
  assert.equal(afterServerHandles, beforeServerHandles);
});

test('pending handler makes close uncertain without claiming cancellation', async t => {
  const started = deferred();
  const release = deferred();
  let completed = false;
  const api = createServiceCreditLoopbackServer({
    handler: async (_request, response) => {
      started.resolve();
      await release.promise;
      completed = true;
      try { response.end('{}'); } catch {}
    },
  });
  const descriptor = await api.start();
  const pendingExchange = exchange(descriptor).catch(() => null);
  await started.promise;
  const firstClose = api.close();
  assert.equal(firstClose === api.close(), true);
  await errorCode(() => firstClose, 'SERVICE_CREDIT_LOOPBACK_CLOSE_UNCERTAIN');
  assert.equal(completed, false);
  release.resolve();
  await new Promise(resolveImmediate => setImmediate(resolveImmediate));
  assert.equal(completed, true);
  await pendingExchange;
  await errorCode(() => api.start(), 'SERVICE_CREDIT_LOOPBACK_UNAVAILABLE');
  t.after(() => api.close().catch(() => {}));
});

test('bind and address-validation faults fail closed without rebinding', async t => {
  await t.test('bind fault', async nested => {
    nested.mock.method(Server.prototype, 'listen', function failingListen() {
      this.emit('error', new Error('private bind detail'));
      return this;
    });
    const api = createServiceCreditLoopbackServer({ handler: basicHandler() });
    const first = api.start();
    await errorCode(() => first, 'SERVICE_CREDIT_LOOPBACK_START_FAILED');
    await errorCode(() => api.start(), 'SERVICE_CREDIT_LOOPBACK_UNAVAILABLE');
    await errorCode(() => api.close(), 'SERVICE_CREDIT_LOOPBACK_CLOSE_UNCERTAIN');
  });
  await t.test('address fault after partial bind', async nested => {
    nested.mock.method(Server.prototype, 'address', () => ({
      address: '0.0.0.0',
      family: 'IPv4',
      port: 1,
    }));
    const api = createServiceCreditLoopbackServer({ handler: basicHandler() });
    await errorCode(() => api.start(), 'SERVICE_CREDIT_LOOPBACK_START_FAILED');
    await errorCode(() => api.start(), 'SERVICE_CREDIT_LOOPBACK_UNAVAILABLE');
    await errorCode(() => api.close(), 'SERVICE_CREDIT_LOOPBACK_CLOSE_UNCERTAIN');
  });
});

test('source closure, active paths, output, package surface, and docs stay bounded', () => {
  const source = readFileSync(MODULE_PATH, 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.deepEqual(imports, ['node:http', 'node:util', './service-credit-http.js']);
  assert.doesNotMatch(source, /\b(?:fetch|WebSocket|wallet|rpc|child_process|worker_threads)\b/i);
  assert.doesNotMatch(source, /console\.|process\.(?:stdout|stderr)/);
  assert.match(source, /host: BIND_ADDRESS/);
  assert.match(source, /port: 0/);
  assert.match(source, /exclusive: true/);
  assert.match(source, /reusePort: false/);
  assert.match(source, /connectionsCheckingInterval: CONNECTION_CHECK_INTERVAL_MS/);
  assert.match(source, /STARTUP_DEADLINE_MS = 2_000/);
  assert.match(source, /SERVICE_CREDIT_LOOPBACK_INVALID_INVOCATION/);
  const closure = importClosure(MODULE_PATH);
  assert.deepEqual(
    [...closure.visited].map(path => relative(ROOT, path)).sort(),
    [
      'src/service-credit-capability.js',
      'src/service-credit-http.js',
      'src/service-credit-loopback-server.js',
      'src/service-credit-model.js',
    ],
  );
  assert.deepEqual(
    [...closure.external].sort(),
    ['node:crypto', 'node:http', 'node:perf_hooks', 'node:util'],
  );
  for (const relativePath of [
    'src/resource-server.js',
    'src/server-cli.js',
    'src/buyer.js',
    'src/buyer-cli.js',
    'src/service-credit-demo.js',
    'src/service-credit-demo-cli.js',
  ]) {
    assert.equal(
      readFileSync(join(ROOT, relativePath), 'utf8').includes('service-credit-loopback-server'),
      false,
    );
  }
  const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.deepEqual(
    Object.entries(packageJson.scripts).filter(([, value]) => value.includes('loopback')),
    [[
      'demo:service-credit-loopback',
      'node src/service-credit-loopback-demo-cli.js',
    ]],
  );
  assert.equal(
    Object.values(packageJson.scripts).some(
      value => value.includes('service-credit-loopback-server'),
    ),
    false,
  );
  for (const [name, command] of Object.entries(packageJson.scripts)) {
    if (name === 'demo:service-credit-loopback') continue;
    assert.equal(command.includes('service-credit-loopback-demo'), false);
  }
  assert.equal(readdirSync(ROOT).includes('service-credit-loopback-server'), false);
  for (const relativePath of ['README.md', 'SECURITY.md', 'docs/IMPLEMENTATION_PLAN.md']) {
    const document = readFileSync(join(ROOT, relativePath), 'utf8');
    for (const required of [
      'plaintext',
      'unauthenticated',
      '127.0.0.1',
      'routing metadata',
      'not authentication',
      'same-host',
      'per-process',
      'callback',
      'SERVICE_CREDIT_LOOPBACK_CLOSE_UNCERTAIN',
      'disposable synthetic authorization material',
      'authenticated transport',
      'Abrupt',
    ]) {
      assert.equal(document.includes(required), true);
    }
  }
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const security = readFileSync(join(ROOT, 'SECURITY.md'), 'utf8');
  const plan = readFileSync(join(ROOT, 'docs/IMPLEMENTATION_PLAN.md'), 'utf8');
  assert.equal(
    readme.includes('transport owner itself has no package script or active CLI'),
    true,
  );
  assert.equal(
    readme.includes('only the isolated synthetic loopback demo below composes it'),
    true,
  );
  assert.equal(readme.includes('fixed two-second deadline'), true);
  assert.equal(readme.includes('not a benchmark'), true);
  assert.equal(readme.includes('performs no wallet, RPC, blockchain, live settlement, or live x402 operation'), true);
  assert.equal(security.includes('caller must successfully await `server.close()`'), true);
  assert.equal(security.includes('leaves lifecycle state unchanged'), true);
  assert.equal(security.includes('callback cancellation'), true);
  assert.equal(security.includes('preserves and quarantines the higher-level store and ledger'), true);
  assert.equal(security.includes('not a benchmark'), true);
  assert.equal(plan.includes('generic handler cannot enforce credential provenance'), true);
  assert.equal(plan.includes('separately named, separately reviewed future milestone'), true);
  assert.equal(plan.includes('removing only `src/service-credit-loopback-server.js`'), true);
  assert.equal(plan.includes('leaves the listener-free demo, transport owner, active runtime, and persisted schema unchanged'), true);
});
