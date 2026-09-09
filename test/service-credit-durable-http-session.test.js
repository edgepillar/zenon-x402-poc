import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createDurableServiceCreditHttpSession,
} from '../src/service-credit-durable-http-session.js';
import {
  createServiceCreditCapabilitySigningBytes,
  deriveServiceCreditCapabilityCommitment,
} from '../src/service-credit-capability.js';
import * as serviceCreditHttp from '../src/service-credit-http.js';
import {
  SERVICE_CREDIT_HTTP_PATH,
  SERVICE_CREDIT_HTTP_ROUTE_ID,
} from '../src/service-credit-http.js';
import {
  SERVICE_CREDIT_ACTIVATION_VERSION,
  SERVICE_CREDIT_MODEL_VERSION,
} from '../src/service-credit-model.js';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';

const NOW = 2_000_000_000_000;
const CONTENT_TYPE = 'application/json';
const NATIVE_FREEZE = Object.freeze;
const NATIVE_DEFINE_PROPERTY = Object.defineProperty;
const NATIVE_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const NATIVE_DELETE_PROPERTY = Reflect.deleteProperty;
const EMPTY_BODY_DIGEST = `sha256:${createHash('sha256').update(Buffer.alloc(0)).digest('hex')}`;
const SPKI_ED25519_PREFIX_HEX = '302a300506032b6570032100';

function digest(fill) {
  return `sha256:${fill.repeat(64)}`;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function keyMaterial() {
  const pair = generateKeyPairSync('ed25519');
  const spki = pair.publicKey.export({ format: 'der', type: 'spki' });
  assert.equal(spki.subarray(0, -32).toString('hex'), SPKI_ED25519_PREFIX_HEX);
  return {
    privateKey: pair.privateKey,
    publicKey: spki.subarray(-32).toString('base64url'),
  };
}

function offer() {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.session',
    serviceId: 'service.session',
    resourceId: 'resource.session',
    resourceBinding: digest('e'),
    offerId: 'offer.session',
    offerVersion: 1,
    costPolicyId: 'cost.session',
    fundingPolicyId: 'funding.session',
    fundingPolicyVersion: 1,
  };
}

function grant(keys) {
  return {
    activationVersion: SERVICE_CREDIT_ACTIVATION_VERSION,
    authorityProfileId: 'authority.mock.session',
    authorityProfileVersion: 1,
    verifierVersion: 1,
    authorityRecordDigest: digest('d'),
    fundingPolicyId: 'funding.session',
    fundingPolicyVersion: 1,
    sourceSettlementId: 'settlement.session',
    transactionId: `mocktx:${createHash('sha256').update('transaction.session').digest('hex')}`,
    providerId: 'provider.session',
    serviceId: 'service.session',
    resourceId: 'resource.session',
    resourceBinding: digest('e'),
    offerId: 'offer.session',
    offerVersion: 1,
    holderId: 'holder.session',
    capabilityCommitment: deriveServiceCreditCapabilityCommitment({ publicKey: keys.publicKey }),
    totalUnits: 7,
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
    amount: '1',
    payee: 'payee.mock.session',
    payer: 'holder.session',
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

function requestDescription(grantId, overrides = {}) {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    grantId,
    requestId: 'request.session.a',
    method: 'POST',
    routeId: SERVICE_CREDIT_HTTP_ROUTE_ID,
    canonicalBodyDigest: EMPTY_BODY_DIGEST,
    selectedContentType: CONTENT_TYPE,
    maxCostUnits: 2,
    ...overrides,
  };
}

function authorization(keys, request) {
  const proof = {
    proofVersion: 1,
    grantId: request.grantId,
    requestId: request.requestId,
    publicKey: keys.publicKey,
    maxCostUnits: request.maxCostUnits,
    signature: sign(
      null,
      createServiceCreditCapabilitySigningBytes(request),
      keys.privateKey,
    ).toString('base64url'),
  };
  return `ServiceCredit ${Buffer.from(canonicalJson(proof), 'utf8').toString('base64url')}`;
}

function passiveDeadlineRuntime() {
  return {
    monotonicNowNs: () => 0n,
    schedule: () => Object.freeze({}),
    cancel: () => undefined,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}

function createLedger(t, overrides = {}) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'service-credit-session-')));
  chmodSync(directory, 0o700);
  const clock = { value: NOW, increment: false };
  const configuration = {
    databasePath: join(directory, 'ledger.sqlite'),
    allowedRoot: directory,
    deriveCost: () => 2,
    now: () => {
      const value = clock.value;
      if (clock.increment) clock.value += 1;
      return value;
    },
  };
  const keys = keyMaterial();
  const store = ServiceCreditSqliteStore.create(configuration);
  t.after(() => {
    try { store.close(); } catch {}
    rmSync(directory, { recursive: true, force: true });
  });
  store.registerOffer(offer());
  const activeGrant = store.activateGrantFromTrustedRecord(grant(keys));
  if (overrides.initialize !== false) {
    store.initializeDurableExecution({
      expectedRevision: store.getMetadata().revision,
      ledgerId: 'ledger.session',
      policy: {
        policyId: 'execution.session',
        policyVersion: 1,
        maxDurationMs: overrides.maxDurationMs ?? 1_000,
      },
      capacity: 8,
    });
  }
  return { activeGrant, clock, keys, store };
}

function requestEnvelope(auth, overrides = {}) {
  const rawHeaders = Object.hasOwn(overrides, 'rawHeaders')
    ? overrides.rawHeaders
    : (auth === null
      ? ['Content-Length', '0']
      : ['Authorization', auth, 'Content-Length', '0']);
  return NATIVE_FREEZE({
    url: overrides.url ?? SERVICE_CREDIT_HTTP_PATH,
    method: overrides.method ?? 'POST',
    rawHeaders: NATIVE_FREEZE(rawHeaders),
  });
}

function exchange(handle, auth, overrides = {}) {
  const request = requestEnvelope(auth, overrides);
  const headers = Object.create(null);
  let body;
  const response = {
    destroyed: false,
    writableEnded: false,
    statusCode: 0,
    setHeader(name, value) { headers[String(name).toLowerCase()] = String(value); },
    end(value) {
      this.writableEnded = true;
      body = Buffer.from(value);
    },
    destroy() { this.destroyed = true; },
  };
  return handle(request, response).then(() => ({
    statusCode: response.statusCode,
    headers: { ...headers },
    body,
  }));
}

function parsed(response) {
  return JSON.parse(response.body.toString('utf8'));
}

function assertPrivateJson(response) {
  assert.equal(response.headers['cache-control'], 'private, no-store, max-age=0');
  assert.equal(response.headers['content-type'], CONTENT_TYPE);
  assert.equal(response.headers.vary, 'Authorization');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['content-length'], String(response.body.length));
}

function createSession(store, execute, overrides = {}) {
  return createDurableServiceCreditHttpSession({
    store,
    execute,
    deadlineRuntime: passiveDeadlineRuntime(),
    selectedDurationMs: 1_000,
    ...overrides,
  });
}

test('the durable HTTP session succeeds and exact replay is byte-identical without another debit', async t => {
  const ledger = createLedger(t);
  const request = requestDescription(ledger.activeGrant.grantId);
  const auth = authorization(ledger.keys, request);
  let calls = 0;
  const session = createSession(ledger.store, identity => {
    calls += 1;
    assert.deepEqual(Reflect.ownKeys(identity), ['executionId', 'signal']);
    assert.equal(Object.isFrozen(identity), true);
    return { resultCode: 'service.session.a' };
  });
  assert.deepEqual(Reflect.ownKeys(session), ['handle', 'close']);
  assert.equal(Object.isFrozen(session), true);
  assert.equal(Object.isFrozen(session.handle), true);
  assert.equal(Object.isFrozen(session.close), true);

  const first = await exchange(session.handle, auth);
  assert.equal(first.statusCode, 200);
  assert.deepEqual(parsed(first), { ok: true, resultCode: 'service.session.a' });
  const afterFirst = ledger.store.load();
  const replay = await exchange(session.handle, auth);
  assert.equal(replay.statusCode, 200);
  assert.deepEqual(replay.body, first.body);
  assert.deepEqual(ledger.store.load(), afterFirst);
  assert.equal(calls, 1);
  assert.equal(afterFirst.state.grants[0].availableUnits, 5);
  assert.equal(afterFirst.state.grants[0].consumedUnits, 2);
  await session.close();
});

test('the only shared HTTP seam is non-authorizing and forged run injection is rejected', async t => {
  assert.equal(
    Object.hasOwn(serviceCreditHttp, 'createServiceCreditDurableHttpAdapter'),
    false,
  );
  assert.equal(typeof serviceCreditHttp.createServiceCreditHttpAdmission, 'function');
  const ledger = createLedger(t);
  assert.throws(
    () => createDurableServiceCreditHttpSession({
      store: ledger.store,
      execute: () => ({ resultCode: 'service.session.real' }),
      deadlineRuntime: passiveDeadlineRuntime(),
      selectedDurationMs: 1_000,
      run: () => Object.freeze({
        status: 'SUCCEEDED',
        cachedResult: Object.freeze({
          statusCode: 200,
          contentType: CONTENT_TYPE,
          resultCode: 'service.session.forged',
        }),
      }),
    }),
    /SERVICE_CREDIT_DURABLE_HTTP_SESSION_INVALID_CONFIGURATION/,
  );
});

test('shared admission returns only a deeply frozen normalized request without durable authority', async t => {
  const ledger = createLedger(t);
  const request = requestDescription(ledger.activeGrant.grantId);
  const input = requestEnvelope(authorization(ledger.keys, request));
  const before = ledger.store.load();
  const admission = serviceCreditHttp.createServiceCreditHttpAdmission({ store: ledger.store });
  const decision = admission.admit(input);

  assert.deepEqual(Reflect.ownKeys(decision), ['status', 'request']);
  assert.equal(Object.isFrozen(decision), true);
  assert.equal(decision.status, 'AUTHORIZED');
  assert.deepEqual(Reflect.ownKeys(decision.request), [
    'modelVersion',
    'grantId',
    'requestId',
    'method',
    'routeId',
    'canonicalBodyDigest',
    'selectedContentType',
    'maxCostUnits',
  ]);
  assert.equal(Object.isFrozen(decision.request), true);
  assert.deepEqual(decision.request, request);
  for (const forbidden of [
    'executionId',
    'outcome',
    'response',
    'statusCode',
    'cachedResult',
    'authorization',
    'permission',
  ]) {
    assert.equal(Object.hasOwn(decision, forbidden), false);
    assert.equal(Object.hasOwn(decision.request, forbidden), false);
  }
  assert.deepEqual(ledger.store.load(), before);
});

test('post-import admission intrinsic poisoning cannot turn rejection into authorization', async t => {
  const ledger = createLedger(t);
  const unknownKeys = keyMaterial();
  const request = requestDescription('grant.session.unknown');
  const auth = authorization(unknownKeys, request);
  const forgedRequest = NATIVE_FREEZE({ ...request });
  const forgedGrant = NATIVE_FREEZE({
    grantId: request.grantId,
    capabilityCommitment: deriveServiceCreditCapabilityCommitment({
      publicKey: unknownKeys.publicKey,
    }),
  });
  const admission = serviceCreditHttp.createServiceCreditHttpAdmission({ store: ledger.store });
  let calls = 0;
  const session = createSession(ledger.store, () => {
    calls += 1;
    return { resultCode: 'unexpected' };
  });
  const before = ledger.store.load();
  const beforeRevision = ledger.store.getMetadata().revision;
  const originalFreeze = Object.freeze;
  const originalMapGet = Map.prototype.get;
  let freezeHooks = 0;
  let mapHooks = 0;
  const forgedDecision = NATIVE_FREEZE({ status: 'AUTHORIZED', request: forgedRequest });
  t.after(() => {
    Object.freeze = originalFreeze;
    Map.prototype.get = originalMapGet;
  });
  Object.freeze = value => {
    freezeHooks += 1;
    if (value?.status === 'UNAUTHORIZED') return forgedDecision;
    return NATIVE_FREEZE(value);
  };
  Map.prototype.get = function poisonedGet() {
    mapHooks += 1;
    return forgedGrant;
  };

  const direct = admission.admit(requestEnvelope(auth));
  assert.deepEqual(direct, { status: 'UNAUTHORIZED', request: null });
  assert.equal(Object.isFrozen(direct), true);
  const response = await exchange(session.handle, auth);
  Object.freeze = originalFreeze;
  Map.prototype.get = originalMapGet;

  assert.equal(response.statusCode, 401);
  assert.deepEqual(parsed(response), { error: 'unauthorized' });
  assert.equal(response.headers['www-authenticate'], 'ServiceCredit');
  assertPrivateJson(response);
  assert.equal(freezeHooks, 0);
  assert.equal(mapHooks, 0);
  assert.equal(calls, 0);
  assert.equal(ledger.store.getMetadata().revision, beforeRevision);
  assert.deepEqual(ledger.store.load(), before);
  await session.close();
});

test('durable request rejection preserves legacy route, method, framing, and authorization responses', async t => {
  const ledger = createLedger(t);
  const request = requestDescription(ledger.activeGrant.grantId);
  const auth = authorization(ledger.keys, request);
  let calls = 0;
  const session = createSession(ledger.store, () => {
    calls += 1;
    return { resultCode: 'unexpected' };
  });
  const before = ledger.store.load();
  const cases = [
    [auth, { url: `${SERVICE_CREDIT_HTTP_PATH}/` }, 404, null, null],
    [auth, { method: 'GET' }, 405, 'allow', 'POST'],
    [auth, {
      rawHeaders: ['Authorization', auth, 'Content-Type', CONTENT_TYPE, 'Content-Length', '0'],
    }, 400, null, null],
    [auth, {
      rawHeaders: ['Authorization', auth, 'Authorization', auth, 'Content-Length', '0'],
    }, 401, 'www-authenticate', 'ServiceCredit'],
    ['ServiceCredit invalid', {}, 401, 'www-authenticate', 'ServiceCredit'],
  ];

  for (const [candidate, overrides, expectedStatus, headerName, headerValue] of cases) {
    const response = await exchange(session.handle, candidate, overrides);
    assert.equal(response.statusCode, expectedStatus);
    assertPrivateJson(response);
    if (headerName !== null) assert.equal(response.headers[headerName], headerValue);
  }
  assert.equal(calls, 0);
  assert.deepEqual(ledger.store.load(), before);
  await session.close();
});

test('durable initialization and persisted duration policy are checked before ownership', async t => {
  await t.test('uninitialized', async child => {
    const ledger = createLedger(child, { initialize: false });
    const before = ledger.store.load();
    let calls = 0;
    assert.throws(
      () => createSession(ledger.store, () => { calls += 1; }),
      /SERVICE_CREDIT_DURABLE_HTTP_SESSION_INVALID_CONFIGURATION/,
    );
    assert.deepEqual(ledger.store.load(), before);
    assert.equal(calls, 0);
  });

  await t.test('duration above policy', async child => {
    const ledger = createLedger(child, { maxDurationMs: 100 });
    const before = ledger.store.load();
    assert.throws(
      () => createSession(ledger.store, () => ({ resultCode: 'unexpected' }), {
        selectedDurationMs: 101,
      }),
      /SERVICE_CREDIT_DURABLE_HTTP_SESSION_INVALID_CONFIGURATION/,
    );
    assert.deepEqual(ledger.store.load(), before);
    const valid = createSession(
      ledger.store,
      () => ({ resultCode: 'service.session.valid' }),
      { selectedDurationMs: 100 },
    );
    await valid.close();
  });
});

test('post-import dispatch poisoning cannot forge durable success or alter accounting', async t => {
  const ledger = createLedger(t);
  const request = requestDescription(ledger.activeGrant.grantId);
  const auth = authorization(ledger.keys, request);
  let calls = 0;
  const session = createSession(ledger.store, () => {
    calls += 1;
    return { resultCode: 'service.session.authentic' };
  });
  const originalApply = Reflect.apply;
  let poisonCalls = 0;
  let forgedRunDispatches = 0;
  t.after(() => { Reflect.apply = originalApply; });
  Reflect.apply = (target, thisArgument, argumentsList) => {
    poisonCalls += 1;
    if (target.name === 'run') {
      forgedRunDispatches += 1;
      return Object.freeze({
        status: 'SUCCEEDED',
        cachedResult: Object.freeze({
          statusCode: 200,
          contentType: CONTENT_TYPE,
          resultCode: 'service.session.forged',
        }),
      });
    }
    return originalApply(target, thisArgument, argumentsList);
  };

  const response = await exchange(session.handle, auth);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(parsed(response), { ok: true, resultCode: 'service.session.authentic' });
  assert.equal(calls, 1);
  assert.equal(poisonCalls >= 1, true);
  assert.equal(forgedRunDispatches, 0);
  const state = ledger.store.load();
  assert.equal(state.state.grants[0].consumedUnits, 2);
  assert.equal(state.state.grants[0].availableUnits, 5);
  await session.close();
});

test('inherited toJSON poisoning cannot forge durable success response bytes or replay', async t => {
  const ledger = createLedger(t);
  const request = requestDescription(ledger.activeGrant.grantId, {
    requestId: 'request.session.to-json',
  });
  const auth = authorization(ledger.keys, request);
  let calls = 0;
  const session = createSession(ledger.store, () => {
    calls += 1;
    return { resultCode: 'service.session.authentic-to-json' };
  });
  const originalDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(
    Object.prototype,
    'toJSON',
  );
  let hookCalls = 0;
  t.after(() => {
    if (originalDescriptor === undefined) {
      NATIVE_DELETE_PROPERTY(Object.prototype, 'toJSON');
    } else {
      NATIVE_DEFINE_PROPERTY(Object.prototype, 'toJSON', originalDescriptor);
    }
  });
  NATIVE_DEFINE_PROPERTY(Object.prototype, 'toJSON', {
    value() {
      hookCalls += 1;
      return { ok: false, resultCode: 'service.session.forged-to-json' };
    },
    enumerable: false,
    writable: true,
    configurable: true,
  });

  const first = await exchange(session.handle, auth);
  assert.equal(first.statusCode, 200);
  assert.equal(
    first.body.toString('utf8'),
    '{"ok":true,"resultCode":"service.session.authentic-to-json"}',
  );
  const afterFirst = ledger.store.load();
  const afterFirstRevision = ledger.store.getMetadata().revision;
  const replay = await exchange(session.handle, auth);
  assert.equal(replay.statusCode, 200);
  assert.deepEqual(replay.body, first.body);
  assert.equal(calls, 1);
  assert.equal(hookCalls, 0);
  assert.deepEqual(ledger.store.load(), afterFirst);
  assert.equal(ledger.store.getMetadata().revision, afterFirstRevision);
  await session.close();
});

test('changed request identity maps only to the fixed conflict response', async t => {
  const ledger = createLedger(t);
  const first = requestDescription(ledger.activeGrant.grantId);
  const changed = requestDescription(ledger.activeGrant.grantId, { maxCostUnits: 3 });
  let calls = 0;
  const session = createSession(ledger.store, () => {
    calls += 1;
    return { resultCode: 'service.session.conflict' };
  });
  assert.equal((await exchange(session.handle, authorization(ledger.keys, first))).statusCode, 200);
  const response = await exchange(session.handle, authorization(ledger.keys, changed));
  assert.equal(response.statusCode, 409);
  assert.deepEqual(parsed(response), { error: 'request_unavailable' });
  assert.equal(calls, 1);
  await session.close();
});

test('busy and unknown owner outcomes map to fixed unavailable responses without retries', async t => {
  await t.test('busy duplicate converges through later replay', async child => {
    const ledger = createLedger(child);
    const started = deferred();
    const release = deferred();
    let calls = 0;
    const session = createSession(ledger.store, async () => {
      calls += 1;
      started.resolve();
      await release.promise;
      return { resultCode: 'service.session.busy' };
    });
    const firstRequest = requestDescription(ledger.activeGrant.grantId);
    const first = exchange(session.handle, authorization(ledger.keys, firstRequest));
    await started.promise;
    const busy = await exchange(session.handle, authorization(ledger.keys, firstRequest));
    assert.equal(busy.statusCode, 503);
    assert.deepEqual(parsed(busy), { error: 'service_unavailable' });
    release.resolve();
    const completed = await first;
    assert.equal(completed.statusCode, 200);
    assert.equal(calls, 1);
    const afterCompletion = ledger.store.load();
    const replay = await exchange(session.handle, authorization(ledger.keys, firstRequest));
    assert.equal(replay.statusCode, 200);
    assert.deepEqual(replay.body, completed.body);
    assert.deepEqual(ledger.store.load(), afterCompletion);
    assert.equal(calls, 1);
    await session.close();
  });

  await t.test('unknown', async child => {
    const ledger = createLedger(child);
    let calls = 0;
    const session = createSession(ledger.store, () => {
      calls += 1;
      throw new Error('synthetic private detail');
    });
    const request = requestDescription(ledger.activeGrant.grantId);
    const response = await exchange(session.handle, authorization(ledger.keys, request));
    assert.equal(response.statusCode, 503);
    assert.deepEqual(parsed(response), { error: 'service_unavailable' });
    assert.equal(response.body.includes(Buffer.from('synthetic private detail')), false);
    assert.equal(calls, 1);
    await session.close();
  });
});

test('deadline equality maps NOT_INVOKED to 409 without invoking the callback', async t => {
  const ledger = createLedger(t);
  ledger.clock.increment = true;
  let calls = 0;
  const session = createSession(ledger.store, () => {
    calls += 1;
    return { resultCode: 'unexpected' };
  }, { selectedDurationMs: 1 });
  const request = requestDescription(ledger.activeGrant.grantId);
  const response = await exchange(session.handle, authorization(ledger.keys, request));
  assert.equal(response.statusCode, 409);
  assert.deepEqual(parsed(response), { error: 'request_unavailable' });
  assert.equal(calls, 0);
  await session.close();
});

test('close is idempotent, rejects new admission, and leaves the borrowed store open', async t => {
  const ledger = createLedger(t);
  let calls = 0;
  const session = createSession(ledger.store, () => {
    calls += 1;
    return { resultCode: 'unexpected' };
  });
  const firstClose = session.close();
  const secondClose = session.close();
  assert.equal(firstClose, secondClose);
  await firstClose;
  const request = requestDescription(ledger.activeGrant.grantId);
  const response = await exchange(session.handle, authorization(ledger.keys, request));
  assert.equal(response.statusCode, 503);
  assert.deepEqual(parsed(response), { error: 'service_unavailable' });
  assert.equal(calls, 0);
  assert.equal(Number.isSafeInteger(ledger.store.getMetadata().revision), true);
});

test('callback-context close rejection does not poison a later external close', async t => {
  const ledger = createLedger(t);
  let session;
  let callbackCloseRejected = false;
  session = createSession(ledger.store, async () => {
    await assert.rejects(session.close(), error => {
      callbackCloseRejected = true;
      assert.equal(error.message, 'SERVICE_CREDIT_DURABLE_HTTP_SESSION_CLOSE_FAILED');
      return true;
    });
    return { resultCode: 'service.session.close-context' };
  });
  const request = requestDescription(ledger.activeGrant.grantId);
  const response = await exchange(session.handle, authorization(ledger.keys, request));
  assert.equal(response.statusCode, 200);
  assert.equal(callbackCloseRejected, true);
  await session.close();
  const afterClose = await exchange(session.handle, authorization(ledger.keys, request));
  assert.equal(afterClose.statusCode, 503);
  assert.equal(Number.isSafeInteger(ledger.store.getMetadata().revision), true);
});
