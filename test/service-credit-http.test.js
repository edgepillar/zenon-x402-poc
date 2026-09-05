import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  SERVICE_CREDIT_HTTP_PATH,
  SERVICE_CREDIT_HTTP_ROUTE_ID,
  createServiceCreditHttpHandler,
} from '../src/service-credit-http.js';
import {
  createServiceCreditCapabilitySigningBytes,
  deriveServiceCreditCapabilityCommitment,
} from '../src/service-credit-capability.js';
import {
  REQUEST_STATE,
  SERVICE_CREDIT_ACTIVATION_VERSION,
  SERVICE_CREDIT_MODEL_VERSION,
} from '../src/service-credit-model.js';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';

const NOW = 2_000_000_000_000;
const CONTENT_TYPE = 'application/json';
const EMPTY_BODY_DIGEST = `sha256:${createHash('sha256').update(Buffer.alloc(0)).digest('hex')}`;
const SPKI_ED25519_PREFIX_HEX = '302a300506032b6570032100';

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
    providerId: 'provider.reference',
    serviceId: 'service.reference',
    resourceId: 'resource.reference',
    resourceBinding: digest('e'),
    offerId: 'offer.reference',
    offerVersion: 1,
    costPolicyId: 'policy.fixed',
    fundingPolicyId: 'funding.fixed',
    fundingPolicyVersion: 1,
  };
}

function digest(fill) {
  return `sha256:${fill.repeat(64)}`;
}

function grant(keys, expiresAt, totalUnits) {
  return {
    activationVersion: SERVICE_CREDIT_ACTIVATION_VERSION,
    authorityProfileId: 'authority.mock.reference',
    authorityProfileVersion: 1,
    verifierVersion: 1,
    authorityRecordDigest: digest('d'),
    fundingPolicyId: 'funding.fixed',
    fundingPolicyVersion: 1,
    sourceSettlementId: 'settlement.reference.1',
    transactionId: `mocktx:${createHash('sha256').update('transaction.reference.1').digest('hex')}`,
    providerId: 'provider.reference',
    serviceId: 'service.reference',
    resourceId: 'resource.reference',
    resourceBinding: digest('e'),
    offerId: 'offer.reference',
    offerVersion: 1,
    holderId: 'holder.reference',
    capabilityCommitment: deriveServiceCreditCapabilityCommitment({ publicKey: keys.publicKey }),
    totalUnits,
    expiresAt,
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
    payee: 'payee.mock.1',
    payer: 'holder.reference',
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

function createLedger(t, overrides = {}) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'service-credit-http-')));
  chmodSync(directory, 0o700);
  const clock = { value: NOW };
  const keys = keyMaterial();
  const configuration = {
    databasePath: join(directory, 'ledger.sqlite'),
    allowedRoot: directory,
    deriveCost: overrides.deriveCost ?? (() => 3),
    now: () => clock.value,
    ...(overrides.testHooks ? { testHooks: overrides.testHooks } : {}),
  };
  const store = ServiceCreditSqliteStore.create(configuration);
  store.registerOffer(offer());
  const activeGrant = store.activateGrantFromTrustedRecord(grant(
    keys,
    overrides.expiresAt ?? NOW + 10_000,
    overrides.totalUnits ?? 10,
  ));
  t.after(() => {
    try {
      store.close();
    } catch {
      // Ambiguity seam tests intentionally quarantine their first connection.
    }
    rmSync(directory, { recursive: true, force: true });
  });
  return { activeGrant, clock, configuration, directory, keys, store };
}

function openLedger(ledger) {
  return ServiceCreditSqliteStore.openExisting({
    databasePath: ledger.configuration.databasePath,
    allowedRoot: ledger.configuration.allowedRoot,
    deriveCost: ledger.configuration.deriveCost,
    now: ledger.configuration.now,
  });
}

function requestDescription(grantId, overrides = {}) {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    grantId,
    requestId: 'request.reference.1',
    method: 'POST',
    routeId: SERVICE_CREDIT_HTTP_ROUTE_ID,
    canonicalBodyDigest: EMPTY_BODY_DIGEST,
    selectedContentType: CONTENT_TYPE,
    maxCostUnits: 3,
    ...overrides,
  };
}

function capabilityProof(keys, request, overrides = {}) {
  return {
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
    ...overrides,
  };
}

function authorization(keys, request, overrides = {}) {
  const proof = capabilityProof(keys, request, overrides);
  return `ServiceCredit ${Buffer.from(canonicalJson(proof), 'utf8').toString('base64url')}`;
}

function nonCanonicalAuthorization(keys, request) {
  const proof = capabilityProof(keys, request);
  return `ServiceCredit ${Buffer.from(JSON.stringify(proof), 'utf8').toString('base64url')}`;
}

async function listen(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return server.address().port;
}

function exchange(port, overrides = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      host: '127.0.0.1',
      port,
      method: overrides.method ?? 'POST',
      path: overrides.path ?? SERVICE_CREDIT_HTTP_PATH,
      headers: overrides.headers ?? {},
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    request.once('error', reject);
    if (overrides.body !== undefined) request.end(overrides.body);
    else request.end();
  });
}

function parsed(response) {
  return JSON.parse(response.body.toString('utf8'));
}

function assertPrivateJson(response) {
  assert.equal(response.headers['cache-control'], 'private, no-store, max-age=0');
  assert.equal(response.headers.vary, 'Authorization');
  assert.equal(response.headers['content-type'], CONTENT_TYPE);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(Number(response.headers['content-length']), response.body.length);
}

function handler(store, execute) {
  return createServiceCreditHttpHandler({ store, execute });
}

function storeFacade(store, overrides = {}) {
  return {
    load: () => store.load(),
    getGrant: grantId => store.getGrant(grantId),
    reserveRequest: request => store.reserveRequest(request),
    beginExecution: reference => store.beginExecution(reference),
    completeExecution: input => store.completeExecution(input),
    markOutcomeUnknown: reference => store.markOutcomeUnknown(reference),
    ...overrides,
  };
}

test('a valid proof executes only after a durable begin and replays byte-identically', async t => {
  const ledger = createLedger(t);
  const modelRequest = requestDescription(ledger.activeGrant.grantId);
  const header = authorization(ledger.keys, modelRequest);
  let calls = 0;
  const port = await listen(t, handler(ledger.store, identity => {
    calls += 1;
    assert.deepEqual(Reflect.ownKeys(identity), ['executionId']);
    assert.match(identity.executionId, /^sha256:[0-9a-f]{64}$/);
    assert.equal(Object.isFrozen(identity), true);
    assert.equal(JSON.stringify(identity).includes(ledger.activeGrant.grantId), false);
    const persisted = ledger.store.getRequest({
      grantId: modelRequest.grantId,
      requestId: modelRequest.requestId,
    });
    assert.equal(persisted.state, REQUEST_STATE.EXECUTING);
    return { resultCode: 'service.completed' };
  }));

  const first = await exchange(port, { headers: { Authorization: header } });
  assert.equal(first.statusCode, 200);
  assert.deepEqual(parsed(first), { ok: true, resultCode: 'service.completed' });
  assertPrivateJson(first);
  const succeeded = ledger.store.getRequest({
    grantId: modelRequest.grantId,
    requestId: modelRequest.requestId,
  });
  assert.equal(succeeded.state, REQUEST_STATE.SUCCEEDED);
  assert.deepEqual(succeeded.cachedResult, {
    statusCode: 200,
    contentType: CONTENT_TYPE,
    resultCode: 'service.completed',
  });

  const replay = await exchange(port, { headers: { Authorization: header } });
  assert.equal(calls, 1);
  assert.equal(replay.statusCode, first.statusCode);
  assert.deepEqual(replay.body, first.body);
  assert.equal(replay.headers['content-type'], first.headers['content-type']);
});

test('a reused requestId with changed signed identity returns a generic 409 without re-execution', async t => {
  const ledger = createLedger(t);
  const firstRequest = requestDescription(ledger.activeGrant.grantId);
  const changedRequest = requestDescription(ledger.activeGrant.grantId, { maxCostUnits: 4 });
  let calls = 0;
  const port = await listen(t, handler(ledger.store, () => {
    calls += 1;
    return { resultCode: 'service.completed' };
  }));
  const first = await exchange(port, {
    headers: { Authorization: authorization(ledger.keys, firstRequest) },
  });
  assert.equal(first.statusCode, 200);
  const conflict = await exchange(port, {
    headers: { Authorization: authorization(ledger.keys, changedRequest) },
  });
  assert.equal(conflict.statusCode, 409);
  assert.deepEqual(parsed(conflict), { error: 'request_unavailable' });
  assert.equal(calls, 1);
});

test('the route, method, and empty framing envelope are exact', async t => {
  const ledger = createLedger(t);
  const modelRequest = requestDescription(ledger.activeGrant.grantId);
  const auth = authorization(ledger.keys, modelRequest);
  let calls = 0;
  const port = await listen(t, handler(ledger.store, () => {
    calls += 1;
    return { resultCode: 'unexpected' };
  }));
  const cases = [
    [{ path: `${SERVICE_CREDIT_HTTP_PATH}?proof=elsewhere`, headers: { Authorization: auth } }, 404],
    [{ path: `${SERVICE_CREDIT_HTTP_PATH}/`, headers: { Authorization: auth } }, 404],
    [{ method: 'GET', headers: { Authorization: auth } }, 405],
    [{ headers: { Authorization: auth, 'Content-Type': CONTENT_TYPE } }, 400],
    [{ headers: { Authorization: auth, 'Content-Length': '00' } }, 400],
    [{ headers: { Authorization: auth, 'Content-Length': '1' }, body: 'x' }, 400],
    [{ headers: { Authorization: auth, 'Transfer-Encoding': 'chunked' } }, 400],
  ];
  for (const [input, expectedStatus] of cases) {
    const response = await exchange(port, input);
    assert.equal(response.statusCode, expectedStatus);
    assertPrivateJson(response);
  }
  assert.equal(calls, 0);

  const accepted = await exchange(port, {
    headers: { Authorization: auth, 'Content-Length': '0' },
  });
  assert.equal(accepted.statusCode, 200);
  assert.equal(calls, 1);
});

test('authorization is single, bounded, canonical, and accepted from no other channel', async t => {
  const ledger = createLedger(t);
  const modelRequest = requestDescription(ledger.activeGrant.grantId);
  const auth = authorization(ledger.keys, modelRequest);
  const port = await listen(t, handler(ledger.store, () => ({ resultCode: 'service.completed' })));
  const cases = [
    {},
    { Authorization: 'Bearer value' },
    { Authorization: `servicecredit ${auth.slice('ServiceCredit '.length)}` },
    { Authorization: 'ServiceCredit ***' },
    { Authorization: `ServiceCredit ${'A'.repeat(1_100)}` },
    { Authorization: nonCanonicalAuthorization(ledger.keys, modelRequest) },
    { Authorization: [auth, auth] },
    { Cookie: `authorization=${encodeURIComponent(auth)}` },
  ];
  for (const headers of cases) {
    const response = await exchange(port, { headers });
    assert.equal(response.statusCode, 401);
    assert.deepEqual(parsed(response), { error: 'unauthorized' });
    assert.equal(response.headers['www-authenticate'], 'ServiceCredit');
    assertPrivateJson(response);
  }
  assert.equal(ledger.store.getRequest({
    grantId: modelRequest.grantId,
    requestId: modelRequest.requestId,
  }), null);
});

test('proof tampering and every server-fixed request mismatch collapse to 401', async t => {
  const ledger = createLedger(t);
  const baseline = requestDescription(ledger.activeGrant.grantId);
  const validProof = capabilityProof(ledger.keys, baseline);
  const alteredSignature = `${validProof.signature.slice(0, -1)}${validProof.signature.endsWith('A') ? 'Q' : 'A'}`;
  const candidates = [
    authorization(ledger.keys, baseline, { signature: alteredSignature }),
    authorization(ledger.keys, baseline, { requestId: 'request.changed' }),
    authorization(ledger.keys, requestDescription(ledger.activeGrant.grantId, { method: 'GET' })),
    authorization(ledger.keys, requestDescription(ledger.activeGrant.grantId, { routeId: 'other.route' })),
    authorization(ledger.keys, requestDescription(ledger.activeGrant.grantId, {
      canonicalBodyDigest: `sha256:${'a'.repeat(64)}`,
    })),
    authorization(ledger.keys, requestDescription(ledger.activeGrant.grantId, {
      selectedContentType: 'text/plain',
    })),
  ];
  let calls = 0;
  const port = await listen(t, handler(ledger.store, () => {
    calls += 1;
    return { resultCode: 'unexpected' };
  }));
  for (const candidate of candidates) {
    const response = await exchange(port, { headers: { Authorization: candidate } });
    assert.equal(response.statusCode, 401);
    assert.deepEqual(parsed(response), { error: 'unauthorized' });
  }
  assert.equal(calls, 0);
});

test('unknown grants and malformed proof details are indistinguishable', async t => {
  const ledger = createLedger(t);
  const unknownKeys = keyMaterial();
  const unknownRequest = requestDescription('grant_unknown.reference');
  const unknown = authorization(unknownKeys, unknownRequest);
  const malformed = 'ServiceCredit eyJncmFudElkIjoibm90LWNhbm9uaWNhbCJ9';
  const port = await listen(t, handler(ledger.store, () => ({ resultCode: 'unexpected' })));
  const first = await exchange(port, { headers: { Authorization: unknown } });
  const second = await exchange(port, { headers: { Authorization: malformed } });
  assert.equal(first.statusCode, 401);
  assert.equal(second.statusCode, 401);
  assert.deepEqual(first.body, second.body);
});

test('one bounded startup admission snapshot prevents pre-authenticated store work', async t => {
  const ledger = createLedger(t);
  const calls = { load: 0, getGrant: 0, reserveRequest: 0 };
  const tracked = storeFacade(ledger.store, {
    load() {
      calls.load += 1;
      return ledger.store.load();
    },
    getGrant(grantId) {
      calls.getGrant += 1;
      return ledger.store.getGrant(grantId);
    },
    reserveRequest(request) {
      calls.reserveRequest += 1;
      return ledger.store.reserveRequest(request);
    },
  });
  const configured = handler(tracked, () => ({ resultCode: 'unexpected' }));
  assert.deepEqual(calls, { load: 1, getGrant: 0, reserveRequest: 0 });
  const port = await listen(t, configured);

  const unknownKeys = keyMaterial();
  const unknownRequest = requestDescription('grant_random.reference');
  const knownRequest = requestDescription(ledger.activeGrant.grantId);
  const proof = capabilityProof(ledger.keys, knownRequest);
  const badSignature = `${proof.signature.slice(0, -1)}${proof.signature.endsWith('A') ? 'Q' : 'A'}`;
  const responses = await Promise.all([
    exchange(port, {
      headers: { Authorization: authorization(unknownKeys, unknownRequest) },
    }),
    exchange(port, {
      headers: { Authorization: authorization(ledger.keys, knownRequest, {
        signature: badSignature,
      }) },
    }),
  ]);
  assert.deepEqual(responses.map(value => value.statusCode), [401, 401]);
  assert.deepEqual(calls, { load: 1, getGrant: 0, reserveRequest: 0 });
});

test('startup admission rejects Proxy and accessor grant records without value access', t => {
  const ledger = createLedger(t);
  for (const kind of ['proxy', 'accessor']) {
    let accessed = false;
    let candidate;
    if (kind === 'proxy') {
      candidate = new Proxy({}, {
        getPrototypeOf() {
          accessed = true;
          throw new Error('must-not-run');
        },
        getOwnPropertyDescriptor() {
          accessed = true;
          throw new Error('must-not-run');
        },
      });
    } else {
      candidate = {};
      Object.defineProperty(candidate, 'grantId', {
        enumerable: true,
        get() {
          accessed = true;
          throw new Error('must-not-run');
        },
      });
      Object.defineProperty(candidate, 'capabilityCommitment', {
        enumerable: true,
        value: ledger.activeGrant.capabilityCommitment,
      });
    }
    const snapshot = ledger.store.load();
    const hostile = {
      ...snapshot,
      state: {
        ...snapshot.state,
        grants: [candidate],
      },
    };
    const facade = storeFacade(ledger.store, { load: () => hostile });
    assert.throws(
      () => handler(facade, () => ({ resultCode: 'unexpected' })),
      /SERVICE_CREDIT_HTTP_INVALID_CONFIGURATION/,
    );
    assert.equal(accessed, false);
  }
});

test('the fixed request-start admission bound rejects excess proof work without store access', async t => {
  const ledger = createLedger(t);
  let reserveCalls = 0;
  const tracked = storeFacade(ledger.store, {
    reserveRequest(request) {
      reserveCalls += 1;
      return ledger.store.reserveRequest(request);
    },
  });
  const modelRequest = requestDescription(ledger.activeGrant.grantId);
  const proof = capabilityProof(ledger.keys, modelRequest);
  const badSignature = `${proof.signature.slice(0, -1)}${proof.signature.endsWith('A') ? 'Q' : 'A'}`;
  const auth = authorization(ledger.keys, modelRequest, { signature: badSignature });
  const port = await listen(t, handler(tracked, () => ({ resultCode: 'unexpected' })));
  const responses = await Promise.all(Array.from(
    { length: 80 },
    () => exchange(port, { headers: { Authorization: auth } }),
  ));
  const counts = responses.reduce((result, response) => {
    result.set(response.statusCode, (result.get(response.statusCode) ?? 0) + 1);
    return result;
  }, new Map());
  assert.equal(counts.get(401), 64);
  assert.equal(counts.get(503), 16);
  assert.equal(reserveCalls, 0);
  for (const response of responses) assertPrivateJson(response);
});

test('off-route, wrong-method, and malformed-framing traffic cannot consume proof admission', async t => {
  const ledger = createLedger(t);
  const modelRequest = requestDescription(ledger.activeGrant.grantId);
  const auth = authorization(ledger.keys, modelRequest);
  const port = await listen(t, handler(
    ledger.store,
    () => ({ resultCode: 'service.admitted' }),
  ));
  const irrelevant = [
    ...Array.from({ length: 24 }, () => ({ path: '/unrelated' })),
    ...Array.from({ length: 24 }, () => ({ method: 'GET' })),
    ...Array.from({ length: 24 }, () => ({
      headers: { 'Content-Type': CONTENT_TYPE },
    })),
  ];
  for (const input of irrelevant) await exchange(port, input);
  const response = await exchange(port, { headers: { Authorization: auth } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(parsed(response), { ok: true, resultCode: 'service.admitted' });
});

test('startup admission rejects duplicate capability commitments', t => {
  const ledger = createLedger(t);
  const snapshot = ledger.store.load();
  const first = snapshot.state.grants[0];
  const duplicate = structuredClone(first);
  const state = {
    ...snapshot.state,
    grants: [first, duplicate].sort((left, right) => left.grantId.localeCompare(right.grantId)),
  };
  const checksum = `sha256:${createHash('sha256').update(canonicalJson({
    revision: snapshot.revision,
    schemaVersion: snapshot.schemaVersion,
    state,
  })).digest('hex')}`;
  const hostile = {
    ...snapshot,
    state,
    checksum,
  };
  assert.throws(
    () => handler(
      storeFacade(ledger.store, { load: () => hostile }),
      () => ({ resultCode: 'unexpected' }),
    ),
    /SERVICE_CREDIT_HTTP_INVALID_CONFIGURATION/,
  );
});

test('the fixed execution ceiling rejects a new request pre-store while duplicates still converge', async t => {
  const ledger = createLedger(t, { totalUnits: 30 });
  const requests = Array.from({ length: 9 }, (_, index) => requestDescription(
    ledger.activeGrant.grantId,
    { requestId: `request.active.${index + 1}` },
  ));
  const releases = [];
  let startedResolve;
  const started = new Promise(resolve => { startedResolve = resolve; });
  let calls = 0;
  const port = await listen(t, handler(ledger.store, () => new Promise(resolve => {
    calls += 1;
    releases.push(() => resolve({ resultCode: 'service.active' }));
    if (calls === 8) startedResolve();
  })));
  const active = requests.slice(0, 8).map(modelRequest => exchange(port, {
    headers: { Authorization: authorization(ledger.keys, modelRequest) },
  }));
  await started;

  const excess = await exchange(port, {
    headers: { Authorization: authorization(ledger.keys, requests[8]) },
  });
  assert.equal(excess.statusCode, 503);
  assert.deepEqual(parsed(excess), { error: 'service_unavailable' });
  assert.equal(ledger.store.getRequest({
    grantId: requests[8].grantId,
    requestId: requests[8].requestId,
  }), null);
  const duplicate = exchange(port, {
    headers: { Authorization: authorization(ledger.keys, requests[0]) },
  });
  for (const release of releases) release();
  const completed = await Promise.all([...active, duplicate]);
  assert.equal(completed.every(response => response.statusCode === 200), true);
  assert.equal(calls, 8);
});

test('a grant activated after snapshot creation requires handler reconstruction', async t => {
  const ledger = createLedger(t, { totalUnits: 30 });
  const originalPort = await listen(t, handler(
    ledger.store,
    () => ({ resultCode: 'service.original' }),
  ));
  const newKeys = keyMaterial();
  const laterGrant = ledger.store.activateGrantFromTrustedRecord({
    ...grant(newKeys, NOW + 10_000, 10),
    sourceSettlementId: 'settlement.reference.2',
    transactionId: `mocktx:${createHash('sha256').update('transaction.reference.2').digest('hex')}`,
    holderId: 'holder.reference.2',
    payer: 'holder.reference.2',
  });
  const laterRequest = requestDescription(laterGrant.grantId, { requestId: 'request.later.1' });
  const auth = authorization(newKeys, laterRequest);
  const beforeReconstruction = await exchange(originalPort, {
    headers: { Authorization: auth },
  });
  assert.equal(beforeReconstruction.statusCode, 401);
  assert.equal(ledger.store.getRequest({
    grantId: laterRequest.grantId,
    requestId: laterRequest.requestId,
  }), null);

  const reconstructedPort = await listen(t, handler(
    ledger.store,
    () => ({ resultCode: 'service.reconstructed' }),
  ));
  const afterReconstruction = await exchange(reconstructedPort, {
    headers: { Authorization: auth },
  });
  assert.equal(afterReconstruction.statusCode, 200);
  assert.deepEqual(parsed(afterReconstruction), {
    ok: true,
    resultCode: 'service.reconstructed',
  });
});

test('server pricing enforces holder ceiling, available units, expiry, and revocation generically', async t => {
  const scenarios = [
    {
      name: 'cost ceiling',
      configure: ledger => requestDescription(ledger.activeGrant.grantId, { maxCostUnits: 2 }),
    },
    {
      name: 'insufficient units',
      ledger: { totalUnits: 2 },
      configure: ledger => requestDescription(ledger.activeGrant.grantId),
    },
    {
      name: 'expired grant',
      configure: ledger => {
        ledger.clock.value = NOW + 20_000;
        return requestDescription(ledger.activeGrant.grantId);
      },
    },
    {
      name: 'revoked grant',
      configure: ledger => {
        ledger.store.revokeGrant({ grantId: ledger.activeGrant.grantId });
        return requestDescription(ledger.activeGrant.grantId);
      },
    },
  ];
  let expectedBody;
  for (const scenario of scenarios) {
    await t.test(scenario.name, async child => {
      const ledger = createLedger(child, scenario.ledger);
      const modelRequest = scenario.configure(ledger);
      let calls = 0;
      const port = await listen(child, handler(ledger.store, () => {
        calls += 1;
        return { resultCode: 'unexpected' };
      }));
      const response = await exchange(port, {
        headers: { Authorization: authorization(ledger.keys, modelRequest) },
      });
      assert.equal(response.statusCode, 403);
      assert.deepEqual(parsed(response), { error: 'credit_not_authorized' });
      if (expectedBody) assert.deepEqual(response.body, expectedBody);
      expectedBody = response.body;
      assert.equal(calls, 0);
    });
  }
});

test('same-process concurrent retries converge on one execution and one result', async t => {
  const ledger = createLedger(t);
  const modelRequest = requestDescription(ledger.activeGrant.grantId);
  const auth = authorization(ledger.keys, modelRequest);
  let release;
  let startedResolve;
  const started = new Promise(resolve => { startedResolve = resolve; });
  const hold = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const port = await listen(t, handler(ledger.store, async () => {
    calls += 1;
    startedResolve();
    await hold;
    return { resultCode: 'service.concurrent' };
  }));

  const firstPromise = exchange(port, { headers: { Authorization: auth } });
  await started;
  const secondPromise = exchange(port, { headers: { Authorization: auth } });
  release();
  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.deepEqual(first.body, second.body);
  assert.equal(calls, 1);
});

test('different request IDs are never coalesced even when their model request digests match', async t => {
  const ledger = createLedger(t);
  const firstRequest = requestDescription(ledger.activeGrant.grantId, { requestId: 'request.first' });
  const secondRequest = requestDescription(ledger.activeGrant.grantId, { requestId: 'request.second' });
  const releases = [];
  let startedResolve;
  const started = new Promise(resolve => { startedResolve = resolve; });
  const executionIds = [];
  const port = await listen(t, handler(ledger.store, identity => new Promise(resolve => {
    executionIds.push(identity.executionId);
    releases.push(() => resolve({ resultCode: 'service.distinct' }));
    if (releases.length === 2) startedResolve();
  })));
  const firstPromise = exchange(port, {
    headers: { Authorization: authorization(ledger.keys, firstRequest) },
  });
  const secondPromise = exchange(port, {
    headers: { Authorization: authorization(ledger.keys, secondRequest) },
  });
  await started;
  for (const release of releases) release();
  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(new Set(executionIds).size, 2);
  const firstStored = ledger.store.getRequest({
    grantId: firstRequest.grantId,
    requestId: firstRequest.requestId,
  });
  const secondStored = ledger.store.getRequest({
    grantId: secondRequest.grantId,
    requestId: secondRequest.requestId,
  });
  assert.equal(firstStored.requestDigest, secondStored.requestDigest);
  assert.equal(firstStored.state, REQUEST_STATE.SUCCEEDED);
  assert.equal(secondStored.state, REQUEST_STATE.SUCCEEDED);
});

test('two handlers with separate durable-store connections never execute one request twice', async t => {
  const ledger = createLedger(t);
  const contender = openLedger(ledger);
  t.after(() => contender.close());
  const modelRequest = requestDescription(ledger.activeGrant.grantId);
  const auth = authorization(ledger.keys, modelRequest);
  let release;
  let startedResolve;
  const started = new Promise(resolve => { startedResolve = resolve; });
  const hold = new Promise(resolve => { release = resolve; });
  let firstCalls = 0;
  let secondCalls = 0;
  const firstPort = await listen(t, handler(ledger.store, async () => {
    firstCalls += 1;
    startedResolve();
    await hold;
    return { resultCode: 'service.first' };
  }));
  const secondPort = await listen(t, handler(contender, () => {
    secondCalls += 1;
    return { resultCode: 'service.second' };
  }));

  const firstPromise = exchange(firstPort, { headers: { Authorization: auth } });
  await started;
  const second = await exchange(secondPort, { headers: { Authorization: auth } });
  assert.equal(second.statusCode, 409);
  assert.deepEqual(parsed(second), { error: 'request_unavailable' });
  release();
  const first = await firstPromise;
  assert.equal(first.statusCode, 200);
  assert.equal(firstCalls, 1);
  assert.equal(secondCalls, 0);
});

function seedState(ledger, modelRequest, state) {
  const reference = {
    grantId: modelRequest.grantId,
    requestId: modelRequest.requestId,
  };
  ledger.store.reserveRequest(modelRequest);
  if (state === REQUEST_STATE.RESERVED) return;
  if (state === REQUEST_STATE.FAILED_RELEASED) {
    ledger.store.releaseBeforeExecution(reference);
    return;
  }
  ledger.store.beginExecution(reference);
  if (state === REQUEST_STATE.EXECUTING) return;
  if (state === REQUEST_STATE.OUTCOME_UNKNOWN) {
    ledger.store.markOutcomeUnknown(reference);
    return;
  }
  ledger.store.completeExecution({
    ...reference,
    cachedResult: {
      statusCode: 200,
      contentType: CONTENT_TYPE,
      resultCode: 'service.persisted',
    },
  });
}

test('all five persisted request states have fail-closed execution semantics', async t => {
  const expected = new Map([
    [REQUEST_STATE.RESERVED, 200],
    [REQUEST_STATE.EXECUTING, 409],
    [REQUEST_STATE.SUCCEEDED, 200],
    [REQUEST_STATE.FAILED_RELEASED, 409],
    [REQUEST_STATE.OUTCOME_UNKNOWN, 409],
  ]);
  for (const [state, statusCode] of expected) {
    await t.test(state, async child => {
      const ledger = createLedger(child);
      const modelRequest = requestDescription(ledger.activeGrant.grantId);
      seedState(ledger, modelRequest, state);
      let calls = 0;
      const port = await listen(child, handler(ledger.store, () => {
        calls += 1;
        return { resultCode: 'service.reserved' };
      }));
      const response = await exchange(port, {
        headers: { Authorization: authorization(ledger.keys, modelRequest) },
      });
      assert.equal(response.statusCode, statusCode);
      assert.equal(calls, state === REQUEST_STATE.RESERVED ? 1 : 0);
      if (state === REQUEST_STATE.SUCCEEDED) {
        assert.deepEqual(parsed(response), { ok: true, resultCode: 'service.persisted' });
      } else if (statusCode === 409) {
        assert.deepEqual(parsed(response), { error: 'request_unavailable' });
      }
    });
  }
});

test('callback failure and invalid callback results durably enter OUTCOME_UNKNOWN without release', async t => {
  const cases = [
    ['throw', () => { throw new Error('synthetic-private-detail'); }],
    ['extra field', () => ({ resultCode: 'service.invalid', detail: 'private-detail' })],
    ['invalid code', () => ({ resultCode: 'invalid result' })],
  ];
  for (const [name, execute] of cases) {
    await t.test(name, async child => {
      const ledger = createLedger(child);
      const modelRequest = requestDescription(ledger.activeGrant.grantId);
      const port = await listen(child, handler(ledger.store, execute));
      const response = await exchange(port, {
        headers: { Authorization: authorization(ledger.keys, modelRequest) },
      });
      assert.equal(response.statusCode, 409);
      assert.deepEqual(parsed(response), { error: 'request_unavailable' });
      const stored = ledger.store.getRequest({
        grantId: modelRequest.grantId,
        requestId: modelRequest.requestId,
      });
      assert.equal(stored.state, REQUEST_STATE.OUTCOME_UNKNOWN);
      const grantState = ledger.store.getGrant(modelRequest.grantId);
      assert.equal(grantState.heldUnits, 3);
      assert.equal(grantState.availableUnits, 7);
      assert.equal(response.body.includes(Buffer.from('synthetic-private-detail')), false);
      assert.equal(response.body.includes(Buffer.from('private-detail')), false);
    });
  }
});

test('begin commit ambiguity returns 503 and never authorizes application execution', async t => {
  let failBegin = true;
  const ledger = createLedger(t, {
    testHooks: {
      afterCommit({ operation }) {
        if (failBegin && operation === 'beginExecution') {
          failBegin = false;
          throw new Error('synthetic-private-detail');
        }
      },
    },
  });
  const modelRequest = requestDescription(ledger.activeGrant.grantId);
  let calls = 0;
  const port = await listen(t, handler(ledger.store, () => {
    calls += 1;
    return { resultCode: 'unexpected' };
  }));
  const response = await exchange(port, {
    headers: { Authorization: authorization(ledger.keys, modelRequest) },
  });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(parsed(response), { error: 'service_unavailable' });
  assert.equal(calls, 0);

  const reopened = openLedger(ledger);
  t.after(() => reopened.close());
  assert.equal(reopened.getRequest({
    grantId: modelRequest.grantId,
    requestId: modelRequest.requestId,
  }).state, REQUEST_STATE.EXECUTING);
});

test('complete commit ambiguity returns 503, then durable success replays without re-execution', async t => {
  let failComplete = true;
  const ledger = createLedger(t, {
    testHooks: {
      afterCommit({ operation }) {
        if (failComplete && operation === 'completeExecution') {
          failComplete = false;
          throw new Error('synthetic-private-detail');
        }
      },
    },
  });
  const modelRequest = requestDescription(ledger.activeGrant.grantId);
  const auth = authorization(ledger.keys, modelRequest);
  let calls = 0;
  const port = await listen(t, handler(ledger.store, () => {
    calls += 1;
    return { resultCode: 'service.ambiguous' };
  }));
  const first = await exchange(port, { headers: { Authorization: auth } });
  assert.equal(first.statusCode, 503);
  assert.deepEqual(parsed(first), { error: 'service_unavailable' });
  assert.equal(calls, 1);

  const reopened = openLedger(ledger);
  t.after(() => reopened.close());
  assert.equal(reopened.getRequest({
    grantId: modelRequest.grantId,
    requestId: modelRequest.requestId,
  }).state, REQUEST_STATE.SUCCEEDED);
  const replayPort = await listen(t, handler(reopened, () => {
    throw new Error('must-not-execute');
  }));
  const replay = await exchange(replayPort, { headers: { Authorization: auth } });
  assert.equal(replay.statusCode, 200);
  assert.deepEqual(parsed(replay), { ok: true, resultCode: 'service.ambiguous' });
});

test('responses and callback inputs exclude grant, settlement, balance, cost, and raw failures', async t => {
  const ledger = createLedger(t);
  const modelRequest = requestDescription(ledger.activeGrant.grantId);
  const protectedValues = [
    ledger.activeGrant.grantId,
    ledger.activeGrant.sourceSettlementId,
    ledger.activeGrant.transactionId,
    ledger.activeGrant.capabilityCommitment,
  ];
  let observed;
  const port = await listen(t, handler(ledger.store, value => {
    observed = value;
    return { resultCode: 'service.private' };
  }));
  const response = await exchange(port, {
    headers: { Authorization: authorization(ledger.keys, modelRequest) },
  });
  const serializedResponse = response.body.toString('utf8');
  const serializedCallback = JSON.stringify(observed);
  for (const protectedValue of protectedValues) {
    assert.equal(serializedResponse.includes(protectedValue), false);
    assert.equal(serializedCallback.includes(protectedValue), false);
  }
  assert.deepEqual(Reflect.ownKeys(observed), ['executionId']);
});

test('store reservation failures map to one generic 503 without raw diagnostics', async t => {
  const ledger = createLedger(t);
  const modelRequest = requestDescription(ledger.activeGrant.grantId);
  const base = {
    beginExecution() { throw new Error('unused'); },
    completeExecution() { throw new Error('unused'); },
    markOutcomeUnknown() { throw new Error('unused'); },
  };
  const stores = [{
    ...base,
    load() { return ledger.store.load(); },
    reserveRequest(request) {
      assert.equal(Object.isFrozen(request), true);
      throw new Error('synthetic-private-detail');
    },
  }];
  for (const store of stores) {
    const port = await listen(t, handler(store, () => ({ resultCode: 'unexpected' })));
    const response = await exchange(port, {
      headers: { Authorization: authorization(ledger.keys, modelRequest) },
    });
    assert.equal(response.statusCode, 503);
    assert.deepEqual(parsed(response), { error: 'service_unavailable' });
    assert.equal(response.body.includes(Buffer.from('synthetic-private-detail')), false);
  }
});

test('constructor rejects expanded configuration and the source stays isolated from payment code', () => {
  const inertStore = {
    load() {},
    getGrant() {},
    reserveRequest() {},
    beginExecution() {},
    completeExecution() {},
    markOutcomeUnknown() {},
  };
  assert.throws(
    () => createServiceCreditHttpHandler({
      store: inertStore,
      execute() {},
      activation: true,
    }),
    /SERVICE_CREDIT_HTTP_INVALID_CONFIGURATION/,
  );
  const source = readFileSync(new URL('../src/service-credit-http.js', import.meta.url), 'utf8');
  for (const forbidden of [
    'releaseBeforeExecution',
    'reconcileRequest',
    'activateGrantFromTrustedRecord',
    'x402-wire',
    'buyer.js',
    'server.js',
    'wallet',
    'rpc',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.equal(source.includes("'./service-credit-model.js'"), true);
  assert.equal(source.includes("'./service-credit-capability.js'"), true);
});
