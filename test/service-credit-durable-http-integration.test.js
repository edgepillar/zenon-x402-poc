import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncResource } from 'node:async_hooks';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { chmodSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalJson } from '../src/canonical.js';
import {
  MockExactZenonClient,
  MockExactZenonFacilitator,
} from '../src/mock-payment.js';
import {
  createMockServiceCreditActivation,
  deriveServiceCreditResourceBinding,
} from '../src/service-credit-activation.js';
import {
  SERVICE_CREDIT_CAPABILITY_PROOF_VERSION,
  createServiceCreditCapabilitySigningBytes,
  deriveServiceCreditCapabilityCommitment,
} from '../src/service-credit-capability.js';
import {
  createDurableServiceCreditHttpSession,
} from '../src/service-credit-durable-http-session.js';
import {
  SERVICE_CREDIT_HTTP_PATH,
  SERVICE_CREDIT_HTTP_ROUTE_ID,
} from '../src/service-credit-http.js';
import {
  GRANT_LIFECYCLE,
  REQUEST_STATE,
  SERVICE_CREDIT_ACTIVATION_VERSION,
  SERVICE_CREDIT_MODEL_VERSION,
} from '../src/service-credit-model.js';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';
import {
  MOCK_NETWORK,
  MOCK_ZENON_CHAIN_PROFILE,
  makePaymentRequired,
} from '../src/x402-wire.js';

const NOW = 2_000_000_000_000;
const TOTAL_UNITS = 7;
const COST_UNITS = 2;
const DURATION_MS = 1_000;
const CONTENT_TYPE = 'application/json';
const RESOURCE_URL = 'https://service.example/durable-session/fund';
const EMPTY_BODY_DIGEST = `sha256:${createHash('sha256').update(Buffer.alloc(0)).digest('hex')}`;
const SPKI_ED25519_PREFIX_HEX = '302a300506032b6570032100';

function digest(fill) {
  return `sha256:${fill.repeat(64)}`;
}

function capabilityKey() {
  const pair = generateKeyPairSync('ed25519');
  const publicDer = pair.publicKey.export({ format: 'der', type: 'spki' });
  assert.equal(publicDer.subarray(0, -32).toString('hex'), SPKI_ED25519_PREFIX_HEX);
  return Object.freeze({
    privateKey: pair.privateKey,
    publicKey: publicDer.subarray(-32).toString('base64url'),
  });
}

function offer(label = 'integration') {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: `provider.${label}`,
    serviceId: `service.${label}`,
    resourceId: `resource.${label}`,
    resourceBinding: deriveServiceCreditResourceBinding({
      resourceId: `resource.${label}`,
      resourceUrl: RESOURCE_URL,
    }),
    offerId: `offer.${label}`,
    offerVersion: 1,
    costPolicyId: `cost.${label}`,
    fundingPolicyId: `funding.${label}`,
    fundingPolicyVersion: 1,
  };
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

function fundingIntent(storeOffer, holderId, capabilityCommitment) {
  return Object.freeze({
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    activationVersion: SERVICE_CREDIT_ACTIVATION_VERSION,
    providerId: storeOffer.providerId,
    serviceId: storeOffer.serviceId,
    resourceId: storeOffer.resourceId,
    offerId: storeOffer.offerId,
    offerVersion: storeOffer.offerVersion,
    holderId,
    capabilityCommitment,
    totalUnits: TOTAL_UNITS,
    expiresAt: NOW + 60_000,
  });
}

function signedRequest(capability, grantId, requestId, overrides = {}) {
  const request = Object.freeze({
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    grantId,
    requestId,
    method: 'POST',
    routeId: SERVICE_CREDIT_HTTP_ROUTE_ID,
    canonicalBodyDigest: EMPTY_BODY_DIGEST,
    selectedContentType: CONTENT_TYPE,
    maxCostUnits: COST_UNITS,
    ...overrides,
  });
  const proof = Object.freeze({
    proofVersion: SERVICE_CREDIT_CAPABILITY_PROOF_VERSION,
    grantId: request.grantId,
    requestId: request.requestId,
    publicKey: capability.publicKey,
    maxCostUnits: request.maxCostUnits,
    signature: sign(
      null,
      createServiceCreditCapabilitySigningBytes(request),
      capability.privateKey,
    ).toString('base64url'),
  });
  return Object.freeze({
    authorization: `ServiceCredit ${Buffer.from(canonicalJson(proof), 'utf8').toString('base64url')}`,
    request,
  });
}

function passiveDeadlineRuntime() {
  return {
    monotonicNowNs: () => 0n,
    schedule: () => Object.freeze({}),
    cancel: () => undefined,
  };
}

function createSession(store, execute, deadlineRuntime = passiveDeadlineRuntime()) {
  return createDurableServiceCreditHttpSession({
    store,
    execute,
    deadlineRuntime,
    selectedDurationMs: DURATION_MS,
  });
}

async function fundedLedger(t, options = {}) {
  const ownedDirectory = mkdtempSync(join(tmpdir(), 'service-credit-durable-http-integration-'));
  const directory = realpathSync(ownedDirectory);
  chmodSync(directory, 0o700);
  const clock = { value: NOW };
  const cleanConfiguration = {
    databasePath: join(directory, 'ledger.sqlite'),
    allowedRoot: directory,
    deriveCost: () => COST_UNITS,
    now: () => clock.value,
  };
  const configuration = options.testHooks === undefined
    ? cleanConfiguration
    : { ...cleanConfiguration, testHooks: options.testHooks };
  const stores = [];
  const store = ServiceCreditSqliteStore.create(configuration);
  stores.push(store);
  t.after(() => {
    for (const candidate of stores) {
      try { candidate.close(); } catch {}
    }
    rmSync(directory, { recursive: true, force: true });
  });

  const registeredOffer = store.registerOffer(offer(options.label));
  const capability = capabilityKey();
  const client = new MockExactZenonClient();
  const facilitator = new MockExactZenonFacilitator();
  let settlementCalls = 0;
  let activationCalls = 0;
  const activation = createMockServiceCreditActivation({
    store,
    verifySettlement: async (...args) => {
      settlementCalls += 1;
      return facilitator.settle(...args);
    },
    authorityProfile: {
      profileId: 'authority.mock.integration',
      profileVersion: 1,
      verifierVersion: 1,
      recordDigest: digest('d'),
    },
    now: () => clock.value,
  });
  const intent = fundingIntent(
    registeredOffer,
    client.address,
    deriveServiceCreditCapabilityCommitment({ publicKey: capability.publicKey }),
  );
  const requirement = fundingRequirement();
  const prepared = activation.createFundingResource({
    intent,
    requirement,
    resourceUrl: RESOURCE_URL,
  });
  const paymentRequired = makePaymentRequired({
    resourceUrl: prepared.resource.url,
    tags: prepared.resource.tags,
    requirement,
  });
  const paymentPayload = await client.createPaymentPayload(paymentRequired, requirement);
  activationCalls += 1;
  const activated = await activation.activate({ intent, paymentRequired, paymentPayload });
  const initialized = store.initializeDurableExecution({
    expectedRevision: store.getMetadata().revision,
    ledgerId: `ledger.${options.label ?? 'integration'}`,
    policy: {
      policyId: 'execution.integration',
      policyVersion: 1,
      maxDurationMs: DURATION_MS,
    },
    capacity: 8,
  });

  return {
    activated,
    activationCalls: () => activationCalls,
    capability,
    cleanConfiguration,
    clock,
    facilitator,
    initialized,
    open() {
      const reopened = ServiceCreditSqliteStore.openExisting(cleanConfiguration);
      stores.push(reopened);
      return reopened;
    },
    settlementCalls: () => settlementCalls,
    store,
  };
}

function parsed(response) {
  return JSON.parse(response.body.toString('utf8'));
}

function assertPrivateJson(response) {
  assert.equal(response.headers['cache-control'], 'private, no-store, max-age=0');
  assert.equal(response.headers['content-type'], CONTENT_TYPE);
  assert.equal(response.headers.vary, 'Authorization');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(Number(response.headers['content-length']), response.body.length);
}

function ledgerView(store, grantId) {
  const snapshot = store.load();
  const grant = snapshot.state.grants.find(candidate => candidate.grantId === grantId);
  const requests = snapshot.state.requests.filter(candidate => candidate.grantId === grantId);
  return { grant, requests, snapshot };
}

function assertAccounting(store, grantId, expected) {
  const view = ledgerView(store, grantId);
  assert.equal(view.snapshot.state.grants.length, 1);
  assert.equal(view.grant.lifecycle, GRANT_LIFECYCLE.ACTIVE);
  assert.equal(view.grant.totalUnits, TOTAL_UNITS);
  assert.equal(view.grant.availableUnits, expected.availableUnits);
  assert.equal(view.grant.heldUnits, expected.heldUnits ?? 0);
  assert.equal(view.grant.consumedUnits, expected.consumedUnits);
  return view;
}

async function openTransport(t, handler) {
  const server = createServer(handler);
  t.after(() => {
    try { server.close(); } catch {}
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

function transportExchange(server, authorization) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      host: '127.0.0.1',
      port: address.port,
      path: SERVICE_CREDIT_HTTP_PATH,
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Length': '0' },
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    request.once('error', reject);
    request.end();
  });
}

function startTransportExchange(server, authorization) {
  const address = server.address();
  let client;
  const done = new Promise(resolve => {
    client = httpRequest({
      host: '127.0.0.1',
      port: address.port,
      path: SERVICE_CREDIT_HTTP_PATH,
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Length': '0' },
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve({
        disconnected: false,
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    client.once('error', () => resolve({ disconnected: true }));
    client.end();
  });
  return Object.freeze({ client, done });
}

function closeTransport(server) {
  return new Promise((resolve, reject) => {
    server.close(error => error === undefined ? resolve() : reject(error));
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return Object.freeze({ promise, reject, resolve });
}

function controlledDeadlineRuntime(initialNowNs = 0n) {
  let nowNs = initialNowNs;
  const scheduled = new Set();
  const runtime = {
    monotonicNowNs: () => nowNs,
    schedule(callback, delayMs) {
      const handle = { callback, delayMs };
      scheduled.add(handle);
      return handle;
    },
    cancel(handle) {
      scheduled.delete(handle);
    },
  };
  return Object.freeze({
    runtime: Object.freeze(runtime),
    setNowNs(value) { nowNs = value; },
    fireNext() {
      const [handle] = scheduled;
      assert.notEqual(handle, undefined);
      scheduled.delete(handle);
      handle.callback();
    },
    scheduledCount() { return scheduled.size; },
  });
}

function startDirectExchange(handler, authorization, overrides = {}) {
  const request = Object.freeze({
    url: overrides.url ?? SERVICE_CREDIT_HTTP_PATH,
    method: overrides.method ?? 'POST',
    rawHeaders: Object.freeze(overrides.rawHeaders ?? [
      'Authorization', authorization, 'Content-Length', '0',
    ]),
  });
  const headers = Object.create(null);
  let body = null;
  const response = {
    destroyed: false,
    writableEnded: false,
    statusCode: 0,
    setHeader(name, value) {
      if (typeof overrides.onSetHeader === 'function') overrides.onSetHeader(this, name, value);
      headers[String(name).toLowerCase()] = String(value);
    },
    end(value) {
      this.writableEnded = true;
      body = Buffer.from(value);
    },
    destroy() { this.destroyed = true; },
  };
  const done = Promise.resolve(handler(request, response)).then(() => ({
    statusCode: response.statusCode,
    headers: { ...headers },
    body,
    destroyed: response.destroyed,
    writableEnded: response.writableEnded,
  }));
  return { done, response };
}

test('one mock settlement funds three restart-safe durable HTTP executions without double charge', async t => {
  const ledger = await fundedLedger(t, { label: 'vertical' });
  const grantId = ledger.activated.grant.grantId;
  const signed = [
    signedRequest(ledger.capability, grantId, 'request.integration.a'),
    signedRequest(ledger.capability, grantId, 'request.integration.b'),
    signedRequest(ledger.capability, grantId, 'request.integration.c'),
  ];
  let callbackCalls = 0;
  const execute = () => {
    callbackCalls += 1;
    return { resultCode: `service.integration.${callbackCalls}` };
  };
  let session = createSession(ledger.store, execute);
  let transport = await openTransport(t, session.handle);

  const firstA = await transportExchange(transport, signed[0].authorization);
  assert.equal(firstA.statusCode, 200);
  assertPrivateJson(firstA);
  const replayA = await transportExchange(transport, signed[0].authorization);
  assert.equal(replayA.statusCode, 200);
  assert.deepEqual(replayA.body, firstA.body);
  const firstB = await transportExchange(transport, signed[1].authorization);
  assert.equal(firstB.statusCode, 200);
  assertPrivateJson(firstB);
  assertAccounting(ledger.store, grantId, { availableUnits: 3, consumedUnits: 4 });
  assert.equal(callbackCalls, 2);

  const closeOrder = [];
  await closeTransport(transport);
  closeOrder.push('transport');
  await session.close();
  closeOrder.push('session');
  ledger.store.close();
  closeOrder.push('store');
  assert.deepEqual(closeOrder, ['transport', 'session', 'store']);

  const reopened = ledger.open();
  session = createSession(reopened, execute);
  transport = await openTransport(t, session.handle);
  const beforeReplay = reopened.load();
  const reopenedA = await transportExchange(transport, signed[0].authorization);
  const reopenedB = await transportExchange(transport, signed[1].authorization);
  assert.equal(reopenedA.statusCode, 200);
  assert.equal(reopenedB.statusCode, 200);
  assert.deepEqual(reopenedA.body, firstA.body);
  assert.deepEqual(reopenedB.body, firstB.body);
  assert.deepEqual(reopened.load(), beforeReplay);
  assert.equal(callbackCalls, 2);

  const firstC = await transportExchange(transport, signed[2].authorization);
  assert.equal(firstC.statusCode, 200);
  assert.deepEqual(parsed(firstC), { ok: true, resultCode: 'service.integration.3' });
  assertPrivateJson(firstC);
  const final = assertAccounting(reopened, grantId, { availableUnits: 1, consumedUnits: 6 });
  assert.equal(final.requests.length, 3);
  assert.equal(final.requests.every(request => request.state === REQUEST_STATE.SUCCEEDED), true);
  assert.equal(new Set(final.requests.map(request => request.requestId)).size, 3);
  const durable = reopened.getDurableExecutionSnapshot();
  assert.equal(durable.executionState.executions.length, 3);
  assert.equal(
    durable.executionState.executions.every(execution => (
      execution.terminalClassification === 'SUCCEEDED'
      && /^sha256:[0-9a-f]{64}$/.test(execution.resultCommitment)
      && !Object.hasOwn(execution, 'cachedResult')
    )),
    true,
  );
  assert.deepEqual(Reflect.ownKeys(parsed(firstC)), ['ok', 'resultCode']);
  assert.equal(ledger.settlementCalls(), 1);
  assert.equal(ledger.activationCalls(), 1);
  assert.equal(ledger.facilitator.records.size, 1);
  assert.equal(callbackCalls, 3);

  await closeTransport(transport);
  await session.close();
  reopened.close();
});

test('callback-context close racing an independent close does not brick admission shutdown', async t => {
  const ledger = await fundedLedger(t, { label: 'close-race' });
  const signed = signedRequest(
    ledger.capability,
    ledger.activated.grant.grantId,
    'request.integration.close-race',
  );
  const release = deferred();
  const entered = deferred();
  const externalScope = new AsyncResource('durable-http-external-close');
  t.after(() => externalScope.emitDestroy());
  let session;
  let callbackCloseOutcome;
  let externalClose;
  session = createSession(ledger.store, async () => {
    callbackCloseOutcome = session.close().then(
      () => ({ status: 'RESOLVED' }),
      error => ({ status: 'REJECTED', message: error.message }),
    );
    externalClose = externalScope.runInAsyncScope(() => session.close());
    entered.resolve();
    await release.promise;
    return { resultCode: 'service.integration.close-race' };
  });

  const exchange = startDirectExchange(session.handle, signed.authorization);
  await entered.promise;
  release.resolve();
  const response = await exchange.done;
  assert.equal(response.statusCode, 200);
  assert.deepEqual(await callbackCloseOutcome, {
    status: 'REJECTED',
    message: 'SERVICE_CREDIT_DURABLE_HTTP_SESSION_CLOSE_FAILED',
  });
  await externalClose;
  const afterClose = await startDirectExchange(session.handle, signed.authorization).done;
  assert.equal(afterClose.statusCode, 503);
  assert.equal(ledger.store.getRequest({
    grantId: signed.request.grantId,
    requestId: signed.request.requestId,
  }).state, REQUEST_STATE.SUCCEEDED);
});

test('representative malformed durable HTTP admission is byte-stable and effect-free', async t => {
  const ledger = await fundedLedger(t, { label: 'malformed' });
  const signed = signedRequest(
    ledger.capability,
    ledger.activated.grant.grantId,
    'request.integration.malformed',
  );
  let callbackCalls = 0;
  const session = createSession(ledger.store, () => {
    callbackCalls += 1;
    return { resultCode: 'unexpected' };
  });
  const before = ledger.store.load();
  const beforeRevision = ledger.store.getMetadata().revision;
  const response = await startDirectExchange(session.handle, signed.authorization, {
    rawHeaders: [
      'Authorization', signed.authorization,
      'Authorization', signed.authorization,
      'Content-Length', '0',
    ],
  }).done;

  assert.equal(response.statusCode, 401);
  assertPrivateJson(response);
  assert.equal(response.headers['www-authenticate'], 'ServiceCredit');
  assert.deepEqual(parsed(response), { error: 'unauthorized' });
  assert.equal(callbackCalls, 0);
  assert.equal(ledger.store.getMetadata().revision, beforeRevision);
  assert.deepEqual(ledger.store.load(), before);
  await session.close();
});

test('real socket disconnects around durable success never cause double execution or debit', async t => {
  await t.test('disconnect before terminal persistence', async child => {
    const completed = deferred();
    let armed = false;
    const ledger = await fundedLedger(child, {
      label: 'disconnect-before',
      testHooks: {
        afterCommit({ operation }) {
          if (armed && operation === 'completeDurableExecution') completed.resolve();
        },
      },
    });
    const signed = signedRequest(
      ledger.capability,
      ledger.activated.grant.grantId,
      'request.integration.disconnect-before',
    );
    const entered = deferred();
    const release = deferred();
    const handled = deferred();
    let callbackCalls = 0;
    const session = createSession(ledger.store, async () => {
      callbackCalls += 1;
      entered.resolve();
      await release.promise;
      return { resultCode: 'service.integration.disconnect-before' };
    });
    const transport = await openTransport(child, async (request, response) => {
      await session.handle(request, response);
      handled.resolve();
    });

    armed = true;
    const exchange = startTransportExchange(transport, signed.authorization);
    await entered.promise;
    exchange.client.destroy();
    const disconnected = await exchange.done;
    assert.equal(disconnected.disconnected, true);
    release.resolve();
    await completed.promise;
    await handled.promise;
    armed = false;

    assert.equal(callbackCalls, 1);
    assertAccounting(ledger.store, signed.request.grantId, {
      availableUnits: 5,
      consumedUnits: 2,
    });
    const durableRevision = ledger.store.getMetadata().revision;
    const replay = await transportExchange(transport, signed.authorization);
    assert.equal(replay.statusCode, 200);
    assert.deepEqual(parsed(replay), {
      ok: true,
      resultCode: 'service.integration.disconnect-before',
    });
    assert.equal(callbackCalls, 1);
    assert.equal(ledger.store.getMetadata().revision, durableRevision);
    await closeTransport(transport);
    await session.close();
  });

  await t.test('disconnect after durable success', async child => {
    let client = null;
    let armed = false;
    const ledger = await fundedLedger(child, {
      label: 'disconnect-after',
      testHooks: {
        afterCommit({ operation }) {
          if (armed && operation === 'completeDurableExecution') client.destroy();
        },
      },
    });
    const signed = signedRequest(
      ledger.capability,
      ledger.activated.grant.grantId,
      'request.integration.disconnect-after',
    );
    const handled = deferred();
    let callbackCalls = 0;
    const session = createSession(ledger.store, () => {
      callbackCalls += 1;
      return { resultCode: 'service.integration.disconnect-after' };
    });
    const transport = await openTransport(child, async (request, response) => {
      await session.handle(request, response);
      handled.resolve();
    });

    const exchange = startTransportExchange(transport, signed.authorization);
    client = exchange.client;
    armed = true;
    const disconnected = await exchange.done;
    await handled.promise;
    armed = false;
    assert.equal(disconnected.disconnected, true);
    assert.equal(callbackCalls, 1);
    assertAccounting(ledger.store, signed.request.grantId, {
      availableUnits: 5,
      consumedUnits: 2,
    });
    const durableRevision = ledger.store.getMetadata().revision;
    const replay = await transportExchange(transport, signed.authorization);
    assert.equal(replay.statusCode, 200);
    assert.deepEqual(parsed(replay), {
      ok: true,
      resultCode: 'service.integration.disconnect-after',
    });
    assert.equal(callbackCalls, 1);
    assert.equal(ledger.store.getMetadata().revision, durableRevision);
    await closeTransport(transport);
    await session.close();
  });
});

test('durable commit ambiguity at the HTTP boundary never returns false success or retries', async t => {
  for (const target of [
    'prepareDurableExecution',
    'persistDurableExecutionFence',
    'completeDurableExecution',
  ]) {
    for (const boundary of ['beforeCommit', 'afterCommit']) {
      await t.test(`${target}-${boundary}`, async child => {
      let armed = false;
      let targetAttempts = 0;
      const hook = ({ operation }) => {
        if (armed && operation === target) {
          targetAttempts += 1;
          throw new Error('synthetic private hook detail');
        }
      };
      const ledger = await fundedLedger(child, {
        label: `ambiguity-${target}-${boundary}`,
        testHooks: { [boundary]: hook },
      });
      const signed = signedRequest(
        ledger.capability,
        ledger.activated.grant.grantId,
        `request.integration.ambiguity-${target}-${boundary}`,
      );
      let callbackCalls = 0;
      const session = createSession(ledger.store, () => {
        callbackCalls += 1;
        return { resultCode: `service.integration.ambiguity-${boundary}` };
      });

      armed = true;
      const first = await startDirectExchange(session.handle, signed.authorization).done;
      assert.equal(first.statusCode, 503);
      assert.deepEqual(parsed(first), { error: 'service_unavailable' });
      const second = await startDirectExchange(session.handle, signed.authorization).done;
      armed = false;
      assert.equal(second.statusCode, 503);
      assert.equal(targetAttempts, 1);
      assert.equal(callbackCalls, target === 'completeDurableExecution' ? 1 : 0);
      await session.close();

      const reopened = ledger.open();
      const snapshotBeforeReplay = reopened.getDurableExecutionSnapshot();
      const noDurableRequest = target === 'prepareDurableExecution' && boundary === 'beforeCommit';
      assert.equal(snapshotBeforeReplay.executionState.executions.length, noDurableRequest ? 0 : 1);
      if (noDurableRequest) {
        assert.equal(reopened.getRequest({
          grantId: signed.request.grantId,
          requestId: signed.request.requestId,
        }), null);
        reopened.close();
        return;
      }
      const executionBeforeReplay = snapshotBeforeReplay.executionState.executions[0];
      assert.equal(executionBeforeReplay.request.requestId, signed.request.requestId);
      assert.equal(
        executionBeforeReplay.terminalClassification,
        target === 'completeDurableExecution' && boundary === 'afterCommit'
          ? 'SUCCEEDED'
          : 'NONE',
      );
      assert.equal(
        reopened.getRequest({
          grantId: signed.request.grantId,
          requestId: signed.request.requestId,
        }).state,
        target === 'completeDurableExecution' && boundary === 'afterCommit'
          ? REQUEST_STATE.SUCCEEDED
          : REQUEST_STATE.EXECUTING,
      );

      let replayCallbacks = 0;
      const replaySession = createSession(reopened, () => {
        replayCallbacks += 1;
        return { resultCode: 'unexpected' };
      });
      const replay = await startDirectExchange(replaySession.handle, signed.authorization).done;
      assert.equal(
        replay.statusCode,
        target === 'completeDurableExecution' && boundary === 'afterCommit' ? 200 : 503,
      );
      assert.equal(replayCallbacks, 0);
      const snapshotAfterReplay = reopened.getDurableExecutionSnapshot();
      assert.equal(snapshotAfterReplay.revision, snapshotBeforeReplay.revision);
      assert.equal(
        snapshotAfterReplay.executionState.executions[0].executionId,
        executionBeforeReplay.executionId,
      );
      await replaySession.close();
      reopened.close();
      });
    }
  }
});

test('deadline unknown returns fixed 503 and drains a late rejection without later mutation', async t => {
  const runtime = controlledDeadlineRuntime();
  const ledger = await fundedLedger(t, { label: 'deadline-late-rejection' });
  const signed = signedRequest(
    ledger.capability,
    ledger.activated.grant.grantId,
    'request.integration.deadline-late-rejection',
  );
  const callback = deferred();
  const entered = deferred();
  const unhandled = [];
  const onUnhandled = () => { unhandled.push(true); };
  process.on('unhandledRejection', onUnhandled);
  t.after(() => process.removeListener('unhandledRejection', onUnhandled));
  let callbackCalls = 0;
  let aborts = 0;
  const session = createSession(ledger.store, identity => {
    callbackCalls += 1;
    identity.signal.addEventListener('abort', () => { aborts += 1; }, { once: true });
    entered.resolve();
    return callback.promise;
  }, runtime.runtime);

  const exchange = startDirectExchange(session.handle, signed.authorization);
  await entered.promise;
  assert.equal(runtime.scheduledCount(), 1);
  ledger.clock.value = NOW + DURATION_MS;
  runtime.setNowNs(BigInt(DURATION_MS) * 1_000_000n);
  runtime.fireNext();
  const response = await exchange.done;
  assert.equal(response.statusCode, 503);
  assert.deepEqual(parsed(response), { error: 'service_unavailable' });
  assert.equal(callbackCalls, 1);
  assert.equal(aborts, 1);
  const durableRevision = ledger.store.getMetadata().revision;

  let closeSettled = false;
  const closing = session.close();
  closing.then(() => { closeSettled = true; });
  await Promise.resolve();
  assert.equal(closeSettled, false);
  callback.reject(new Error('synthetic private late rejection'));
  await closing;
  await Promise.resolve();
  assert.equal(closeSettled, true);
  assert.equal(unhandled.length, 0);
  assert.equal(ledger.store.getMetadata().revision, durableRevision);
  assert.equal(ledger.store.getRequest({
    grantId: signed.request.grantId,
    requestId: signed.request.requestId,
  }).state, REQUEST_STATE.OUTCOME_UNKNOWN);
});

test('an interfering administrative revision fails closed without retry or result claim', async t => {
  let armed = false;
  let completionAttempts = 0;
  const ledger = await fundedLedger(t, {
    label: 'admin-revision',
    testHooks: {
      beforeBegin({ operation }) {
        if (armed && operation === 'completeDurableExecution') completionAttempts += 1;
      },
    },
  });
  const competingStore = ledger.open();
  const signed = signedRequest(
    ledger.capability,
    ledger.activated.grant.grantId,
    'request.integration.admin-revision',
  );
  const entered = deferred();
  const release = deferred();
  let callbackCalls = 0;
  const session = createSession(ledger.store, async () => {
    callbackCalls += 1;
    entered.resolve();
    await release.promise;
    return { resultCode: 'service.integration.admin-revision' };
  });

  armed = true;
  const exchange = startDirectExchange(session.handle, signed.authorization);
  await entered.promise;
  competingStore.registerOffer(offer('admin-revision-write'));
  const interferedRevision = competingStore.getMetadata().revision;
  release.resolve();
  const response = await exchange.done;
  armed = false;
  assert.equal(response.statusCode, 503);
  assert.deepEqual(parsed(response), { error: 'service_unavailable' });
  assert.equal(callbackCalls, 1);
  assert.equal(completionAttempts, 1);
  assert.equal(ledger.store.getMetadata().revision, interferedRevision);
  assertAccounting(ledger.store, signed.request.grantId, {
    availableUnits: 5,
    heldUnits: 2,
    consumedUnits: 0,
  });
  assert.equal(ledger.store.getRequest({
    grantId: signed.request.grantId,
    requestId: signed.request.requestId,
  }).state, REQUEST_STATE.EXECUTING);
  const revisionBeforeReplay = ledger.store.getMetadata().revision;
  const replay = await startDirectExchange(session.handle, signed.authorization).done;
  assert.equal(replay.statusCode, 503);
  assert.equal(callbackCalls, 1);
  assert.equal(completionAttempts, 1);
  assert.equal(ledger.store.getMetadata().revision, revisionBeforeReplay);
  await session.close();
  competingStore.close();
});

test('two durable HTTP sessions converge an overlapping identical request through cached replay', async t => {
  const ledger = await fundedLedger(t, { label: 'duplicate-handles' });
  const secondStore = ledger.open();
  const signed = signedRequest(
    ledger.capability,
    ledger.activated.grant.grantId,
    'request.integration.duplicate-handles',
  );
  const entered = deferred();
  const release = deferred();
  let callbackCalls = 0;
  const execute = async () => {
    callbackCalls += 1;
    entered.resolve();
    await release.promise;
    return { resultCode: 'service.integration.duplicate-handles' };
  };
  const firstSession = createSession(ledger.store, execute);
  const secondSession = createSession(secondStore, execute);

  const first = startDirectExchange(firstSession.handle, signed.authorization);
  await entered.promise;
  const loser = await startDirectExchange(secondSession.handle, signed.authorization).done;
  assert.equal(loser.statusCode, 503);
  assert.deepEqual(parsed(loser), { error: 'service_unavailable' });
  release.resolve();
  const winner = await first.done;
  assert.equal(winner.statusCode, 200);
  assert.equal(callbackCalls, 1);
  const durableRevision = ledger.store.getMetadata().revision;
  const replay = await startDirectExchange(secondSession.handle, signed.authorization).done;
  assert.equal(replay.statusCode, 200);
  assert.deepEqual(replay.body, winner.body);
  assert.equal(callbackCalls, 1);
  assert.equal(secondStore.getMetadata().revision, durableRevision);
  assertAccounting(secondStore, signed.request.grantId, {
    availableUnits: 5,
    consumedUnits: 2,
  });
  assert.equal(
    secondStore.getDurableExecutionSnapshot().executionState.executions.length,
    1,
  );
  await firstSession.close();
  await secondSession.close();
  secondStore.close();
});

test('callback-context close rejects before an already-pending external close can be reused', async t => {
  const ledger = await fundedLedger(t, { label: 'external-close-first' });
  const signed = signedRequest(
    ledger.capability,
    ledger.activated.grant.grantId,
    'request.integration.external-close-first',
  );
  const entered = deferred();
  const attemptCallbackClose = deferred();
  const callbackCloseIssued = deferred();
  const boundedRelease = deferred();
  let callbackCloseOutcome = null;
  let session;
  session = createSession(ledger.store, async () => {
    entered.resolve();
    await attemptCallbackClose.promise;
    const observed = session.close().then(
      () => ({ status: 'RESOLVED' }),
      error => ({ status: 'REJECTED', message: error.message }),
    );
    callbackCloseIssued.resolve();
    callbackCloseOutcome = await Promise.race([
      observed,
      boundedRelease.promise.then(() => ({ status: 'PENDING' })),
    ]);
    return { resultCode: 'service.integration.external-close-first' };
  });

  const exchange = startDirectExchange(session.handle, signed.authorization);
  await entered.promise;
  const externalClose = session.close();
  attemptCallbackClose.resolve();
  await callbackCloseIssued.promise;
  await Promise.resolve();
  await Promise.resolve();
  boundedRelease.resolve();
  const response = await exchange.done;
  await externalClose;

  assert.deepEqual(callbackCloseOutcome, {
    status: 'REJECTED',
    message: 'SERVICE_CREDIT_DURABLE_HTTP_SESSION_CLOSE_FAILED',
  });
  assert.equal(response.statusCode, 200);
  assert.equal(ledger.store.getRequest({
    grantId: signed.request.grantId,
    requestId: signed.request.requestId,
  }).state, REQUEST_STATE.SUCCEEDED);
});
