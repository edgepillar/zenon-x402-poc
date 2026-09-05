import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHash,
  generateKeyPairSync,
  sign,
} from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs';
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
  SERVICE_CREDIT_HTTP_PATH,
  SERVICE_CREDIT_HTTP_ROUTE_ID,
  createServiceCreditHttpHandler,
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
const EXPIRY_WINDOW_MS = 60_000;
const TOTAL_UNITS = 7;
const FIXED_COST_UNITS = 2;
const CONTENT_TYPE = 'application/json';
const RESOURCE_URL = 'https://service.example/credits/fund';
const EMPTY_BODY_DIGEST = `sha256:${createHash('sha256')
  .update(Buffer.alloc(0))
  .digest('hex')}`;
const SPKI_ED25519_PREFIX_HEX = '302a300506032b6570032100';
const HANDLER_STORE_METHODS = Object.freeze([
  'load',
  'reserveRequest',
  'beginExecution',
  'completeExecution',
  'markOutcomeUnknown',
]);

function digest(fill) {
  return `sha256:${fill.repeat(64)}`;
}

function createCapabilityKey() {
  const pair = generateKeyPairSync('ed25519');
  const spki = pair.publicKey.export({ format: 'der', type: 'spki' });
  assert.equal(spki.subarray(0, -32).toString('hex'), SPKI_ED25519_PREFIX_HEX);
  return Object.freeze({
    privateKey: pair.privateKey,
    publicKey: spki.subarray(-32).toString('base64url'),
  });
}

function privateKeyRepresentations(privateKey) {
  const der = Buffer.from(privateKey.export({ format: 'der', type: 'pkcs8' }));
  const representations = [
    der,
    Buffer.from(der.toString('hex'), 'utf8'),
    Buffer.from(der.toString('base64'), 'utf8'),
    Buffer.from(der.toString('base64url'), 'utf8'),
  ];
  assert.equal(
    representations.every(value => Buffer.isBuffer(value) && value.length > 0),
    true,
  );
  return representations;
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

function trustedOffer() {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.reference',
    serviceId: 'service.reference',
    resourceId: 'resource.funding',
    resourceBinding: deriveServiceCreditResourceBinding({
      resourceId: 'resource.funding',
      resourceUrl: RESOURCE_URL,
    }),
    offerId: 'offer.reference',
    offerVersion: 1,
    costPolicyId: 'cost.fixed',
    fundingPolicyId: 'funding.exact.mock',
    fundingPolicyVersion: 1,
  };
}

function fundingIntent(holderId, capabilityCommitment, expiresAt) {
  return Object.freeze({
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    activationVersion: SERVICE_CREDIT_ACTIVATION_VERSION,
    providerId: 'provider.reference',
    serviceId: 'service.reference',
    resourceId: 'resource.funding',
    offerId: 'offer.reference',
    offerVersion: 1,
    holderId,
    capabilityCommitment,
    totalUnits: TOTAL_UNITS,
    expiresAt,
  });
}

function signedServiceRequest(capability, grantId, requestId) {
  const request = Object.freeze({
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    grantId,
    requestId,
    method: 'POST',
    routeId: SERVICE_CREDIT_HTTP_ROUTE_ID,
    canonicalBodyDigest: EMPTY_BODY_DIGEST,
    selectedContentType: CONTENT_TYPE,
    maxCostUnits: FIXED_COST_UNITS,
  });
  const proof = Object.freeze({
    proofVersion: SERVICE_CREDIT_CAPABILITY_PROOF_VERSION,
    grantId,
    requestId,
    publicKey: capability.publicKey,
    maxCostUnits: FIXED_COST_UNITS,
    signature: sign(
      null,
      createServiceCreditCapabilitySigningBytes(request),
      capability.privateKey,
    ).toString('base64url'),
  });
  const authorization = `ServiceCredit ${Buffer.from(
    canonicalJson(proof),
    'utf8',
  ).toString('base64url')}`;
  return Object.freeze({ authorization, proof, request });
}

function createStoreFacade(store) {
  const facade = Object.freeze({
    load: () => store.load(),
    reserveRequest: request => store.reserveRequest(request),
    beginExecution: reference => store.beginExecution(reference),
    completeExecution: input => store.completeExecution(input),
    markOutcomeUnknown: reference => store.markOutcomeUnknown(reference),
  });
  assert.deepEqual(Reflect.ownKeys(facade), HANDLER_STORE_METHODS);
  assert.equal(Object.isFrozen(facade), true);
  for (const forbidden of [
    'activateGrantFromTrustedRecord',
    'reconcileRequest',
    'releaseBeforeExecution',
  ]) {
    assert.equal(forbidden in facade, false);
  }
  return facade;
}

async function exchange(handler, authorization, protectedMaterial) {
  const request = Object.freeze({
    url: SERVICE_CREDIT_HTTP_PATH,
    method: 'POST',
    rawHeaders: Object.freeze(['Authorization', authorization, 'Content-Length', '0']),
  });
  const headers = Object.create(null);
  let body = null;
  const response = {
    destroyed: false,
    writableEnded: false,
    statusCode: 0,
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = String(value);
    },
    end(value) {
      this.writableEnded = true;
      body = Buffer.from(value);
    },
    destroy() {
      this.destroyed = true;
    },
  };

  await handler(request, response);
  assert.equal(response.destroyed, false);
  assert.equal(response.writableEnded, true);
  assert.equal(Buffer.isBuffer(body), true);
  const result = {
    statusCode: response.statusCode,
    headers: { ...headers },
    body,
  };
  assertMaterialAbsent(Buffer.concat([
    Buffer.from(JSON.stringify(result.headers), 'utf8'),
    Buffer.from('\n', 'utf8'),
    result.body,
  ]), protectedMaterial);
  return result;
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

function ledgerView(store, grantId) {
  const snapshot = store.load();
  return {
    snapshot,
    grant: snapshot.state.grants.find(candidate => candidate.grantId === grantId),
    requests: snapshot.state.requests.filter(candidate => candidate.grantId === grantId),
  };
}

function assertAccounting(store, grantId, expected) {
  const view = ledgerView(store, grantId);
  assert.equal(view.snapshot.revision, expected.revision);
  assert.equal(view.snapshot.state.grants.length, 1);
  assert.equal(view.grant.totalUnits, TOTAL_UNITS);
  assert.equal(view.grant.availableUnits, expected.availableUnits);
  assert.equal(view.grant.heldUnits, expected.heldUnits);
  assert.equal(view.grant.consumedUnits, expected.consumedUnits);
  assert.equal(view.grant.lifecycle, expected.lifecycle ?? GRANT_LIFECYCLE.ACTIVE);
  return view;
}

function requestFrom(store, grantId, requestId) {
  return ledgerView(store, grantId).requests.find(request => request.requestId === requestId) ?? null;
}

function createExecutionCallback(observer) {
  return identity => {
    observer.calls += 1;
    observer.inputs.push(identity);
    assert.deepEqual(Reflect.ownKeys(identity), ['executionId']);
    assert.equal(Object.isFrozen(identity), true);
    assert.equal(/^sha256:[0-9a-f]{64}$/.test(identity.executionId), true);
    if (observer.calls === 3) throw new Error('synthetic ambiguous execution');
    return {
      resultCode: observer.calls === 1 ? 'service.offline.a' : 'service.offline.b',
    };
  };
}

function assertMaterialAbsent(bytes, protectedMaterial) {
  assert.equal(Buffer.isBuffer(bytes), true);
  for (const material of protectedMaterial) {
    assert.equal(bytes.includes(material), false);
  }
}

test('offline funding composes once with durable service-credit execution and fail-closed replay', async t => {
  const originalConsoleDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'console');
  assert.equal(
    originalConsoleDescriptor !== undefined && Object.hasOwn(originalConsoleDescriptor, 'value'),
    true,
  );
  let consoleCallCount = 0;
  const countConsoleCall = () => { consoleCallCount += 1; };
  const consoleSink = new Proxy(Object.create(null), {
    get() { return countConsoleCall; },
  });
  t.after(() => {
    Object.defineProperty(globalThis, 'console', originalConsoleDescriptor);
  });
  // Test files are isolated by node:test. This observes console calls on this
  // composed module path, not arbitrary process, stdout, or operating-system writes.
  Object.defineProperty(globalThis, 'console', {
    ...originalConsoleDescriptor,
    value: consoleSink,
  });

  let store;
  const ownedDirectory = mkdtempSync(join(tmpdir(), 'service-credit-offline-'));
  t.after(() => {
    try { store?.close(); } catch {}
    rmSync(ownedDirectory, { recursive: true, force: true });
  });
  const directory = realpathSync(ownedDirectory);
  chmodSync(directory, 0o700);
  const clock = { value: NOW };
  const configuration = {
    databasePath: join(directory, 'ledger.sqlite'),
    allowedRoot: directory,
    deriveCost: () => FIXED_COST_UNITS,
    now: () => clock.value,
  };
  store = ServiceCreditSqliteStore.create(configuration);

  assert.equal(store.load().revision, 0);
  store.registerOffer(trustedOffer());
  assert.equal(store.load().revision, 1);

  const capability = createCapabilityKey();
  const capabilityCommitment = deriveServiceCreditCapabilityCommitment({
    publicKey: capability.publicKey,
  });
  const fundingClient = new MockExactZenonClient();
  const privateKeyMaterial = [
    ...privateKeyRepresentations(capability.privateKey),
    ...privateKeyRepresentations(fundingClient.privateKey),
  ];
  const fundingPublicKey = fundingClient.publicKey
    .export({ format: 'der', type: 'spki' })
    .subarray(-32)
    .toString('base64url');
  assert.equal(capability.privateKey !== fundingClient.privateKey, true);
  assert.equal(capability.publicKey !== fundingPublicKey, true);

  let settlementCalls = 0;
  const facilitator = new MockExactZenonFacilitator();
  const settlementVerifier = async (...input) => {
    settlementCalls += 1;
    return facilitator.settle(...input);
  };
  const activation = createMockServiceCreditActivation({
    store,
    verifySettlement: settlementVerifier,
    authorityProfile: {
      profileId: 'authority.mock.reference',
      profileVersion: 1,
      verifierVersion: 1,
      recordDigest: digest('d'),
    },
    now: () => clock.value,
  });
  const expiresAt = NOW + EXPIRY_WINDOW_MS;
  assert.equal(expiresAt > NOW && expiresAt - NOW === EXPIRY_WINDOW_MS, true);
  const intent = fundingIntent(fundingClient.address, capabilityCommitment, expiresAt);
  assert.deepEqual(Reflect.ownKeys(intent), [
    'modelVersion',
    'activationVersion',
    'providerId',
    'serviceId',
    'resourceId',
    'offerId',
    'offerVersion',
    'holderId',
    'capabilityCommitment',
    'totalUnits',
    'expiresAt',
  ]);
  assert.equal(intent.capabilityCommitment === capabilityCommitment, true);
  for (const forbidden of ['publicKey', 'privateKey', 'proof', 'signature', 'authorization']) {
    assert.equal(Object.hasOwn(intent, forbidden), false);
  }

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
  assert.equal(canonicalJson(paymentRequired.resource) === canonicalJson(prepared.resource), true);
  const paymentPayload = await fundingClient.createPaymentPayload(paymentRequired, requirement);
  assert.equal(
    paymentPayload.payload.transaction.data === paymentPayload.payload.intentDigest,
    true,
  );
  const activated = await activation.activate({
    intent,
    paymentRequired,
    paymentPayload,
  });
  const grantId = activated.grant.grantId;
  const activationView = assertAccounting(store, grantId, {
    revision: 2,
    availableUnits: 7,
    heldUnits: 0,
    consumedUnits: 0,
  });
  const persistedGrant = activationView.grant;
  assert.equal(persistedGrant.grantId === grantId, true);
  assert.equal(persistedGrant.activationId === activated.activation.activationId, true);
  assert.equal(persistedGrant.activation.activationId === activated.activation.activationId, true);
  assert.equal(persistedGrant.sourceSettlementId === activated.activation.sourceSettlementId, true);
  assert.equal(persistedGrant.transactionId === activated.activation.transactionId, true);
  assert.equal(new Set(activationView.snapshot.state.grants.map(value => value.grantId)).size, 1);
  assert.equal(
    new Set(activationView.snapshot.state.grants.map(value => value.activationId)).size,
    1,
  );
  assert.equal(
    new Set(activationView.snapshot.state.grants.map(value => value.sourceSettlementId)).size,
    1,
  );
  assert.equal(settlementCalls, 1);

  const signed = Object.freeze([
    signedServiceRequest(capability, grantId, 'request.offline.a'),
    signedServiceRequest(capability, grantId, 'request.offline.b'),
    signedServiceRequest(capability, grantId, 'request.offline.c'),
    signedServiceRequest(capability, grantId, 'request.offline.d'),
    signedServiceRequest(capability, grantId, 'request.offline.e'),
  ]);
  assert.equal(new Set(signed.map(value => value.request.requestId)).size, signed.length);
  assert.equal(new Set(signed.map(value => value.authorization)).size, signed.length);
  const protectedMaterial = Object.freeze([
    ...privateKeyMaterial,
    ...[
      paymentPayload.payload.transaction.publicKey,
      paymentPayload.payload.transaction.signature,
      capability.publicKey,
      ...signed.map(value => value.proof.signature),
      ...signed.map(value => canonicalJson(value.proof)),
      ...signed.map(value => value.authorization),
    ].map(value => Buffer.from(value, 'utf8')),
  ]);
  assert.equal(protectedMaterial.every(value => value.length > 0), true);

  const observer = { calls: 0, inputs: [] };
  const execute = createExecutionCallback(observer);
  const firstFacade = createStoreFacade(store);
  let handler = createServiceCreditHttpHandler({ store: firstFacade, execute });

  const firstA = await exchange(handler, signed[0].authorization, protectedMaterial);
  assert.equal(firstA.statusCode, 200);
  assert.deepEqual(parsed(firstA), { ok: true, resultCode: 'service.offline.a' });
  assertPrivateJson(firstA);
  assert.equal(requestFrom(store, grantId, signed[0].request.requestId).state, REQUEST_STATE.SUCCEEDED);
  assertAccounting(store, grantId, {
    revision: 5,
    availableUnits: 5,
    heldUnits: 0,
    consumedUnits: 2,
  });
  assert.equal(settlementCalls, 1);
  assert.equal(observer.calls, 1);

  const replayA = await exchange(handler, signed[0].authorization, protectedMaterial);
  assert.deepEqual(replayA, firstA);
  assertAccounting(store, grantId, {
    revision: 5,
    availableUnits: 5,
    heldUnits: 0,
    consumedUnits: 2,
  });
  assert.equal(settlementCalls, 1);
  assert.equal(observer.calls, 1);

  const firstB = await exchange(handler, signed[1].authorization, protectedMaterial);
  assert.equal(firstB.statusCode, 200);
  assert.deepEqual(parsed(firstB), { ok: true, resultCode: 'service.offline.b' });
  assertPrivateJson(firstB);
  assert.equal(requestFrom(store, grantId, signed[1].request.requestId).state, REQUEST_STATE.SUCCEEDED);
  assertAccounting(store, grantId, {
    revision: 8,
    availableUnits: 3,
    heldUnits: 0,
    consumedUnits: 4,
  });
  assert.equal(settlementCalls, 1);
  assert.equal(observer.calls, 2);

  const firstC = await exchange(handler, signed[2].authorization, protectedMaterial);
  assert.equal(firstC.statusCode, 409);
  assert.deepEqual(parsed(firstC), { error: 'request_unavailable' });
  assertPrivateJson(firstC);
  assert.equal(
    requestFrom(store, grantId, signed[2].request.requestId).state,
    REQUEST_STATE.OUTCOME_UNKNOWN,
  );
  assertAccounting(store, grantId, {
    revision: 11,
    availableUnits: 1,
    heldUnits: 2,
    consumedUnits: 4,
  });
  assert.equal(settlementCalls, 1);
  assert.equal(observer.calls, 3);

  store.close();
  store = ServiceCreditSqliteStore.openExisting(configuration);
  assertAccounting(store, grantId, {
    revision: 11,
    availableUnits: 1,
    heldUnits: 2,
    consumedUnits: 4,
  });
  const reopenedFacade = createStoreFacade(store);
  handler = createServiceCreditHttpHandler({ store: reopenedFacade, execute });

  const reopenedReplayA = await exchange(
    handler,
    signed[0].authorization,
    protectedMaterial,
  );
  assert.deepEqual(reopenedReplayA, firstA);
  const reopenedReplayC = await exchange(
    handler,
    signed[2].authorization,
    protectedMaterial,
  );
  assert.equal(reopenedReplayC.statusCode, 409);
  assert.deepEqual(parsed(reopenedReplayC), { error: 'request_unavailable' });
  assertPrivateJson(reopenedReplayC);
  assertAccounting(store, grantId, {
    revision: 11,
    availableUnits: 1,
    heldUnits: 2,
    consumedUnits: 4,
  });
  assert.equal(settlementCalls, 1);
  assert.equal(observer.calls, 3);

  const insufficientD = await exchange(handler, signed[3].authorization, protectedMaterial);
  assert.equal(insufficientD.statusCode, 403);
  assert.deepEqual(parsed(insufficientD), { error: 'credit_not_authorized' });
  assertPrivateJson(insufficientD);
  assert.equal(requestFrom(store, grantId, signed[3].request.requestId), null);
  assertAccounting(store, grantId, {
    revision: 11,
    availableUnits: 1,
    heldUnits: 2,
    consumedUnits: 4,
  });
  assert.equal(settlementCalls, 1);
  assert.equal(observer.calls, 3);

  clock.value = expiresAt + 1;
  const expiredE = await exchange(handler, signed[4].authorization, protectedMaterial);
  assert.equal(expiredE.statusCode, 403);
  assert.deepEqual(parsed(expiredE), { error: 'credit_not_authorized' });
  assertPrivateJson(expiredE);
  assert.equal(requestFrom(store, grantId, signed[4].request.requestId), null);
  assertAccounting(store, grantId, {
    revision: 12,
    availableUnits: 1,
    heldUnits: 2,
    consumedUnits: 4,
    lifecycle: GRANT_LIFECYCLE.EXPIRED,
  });
  assert.equal(settlementCalls, 1);
  assert.equal(observer.calls, 3);

  const postExpiryReplayA = await exchange(
    handler,
    signed[0].authorization,
    protectedMaterial,
  );
  assert.deepEqual(postExpiryReplayA, firstA);
  const finalView = assertAccounting(store, grantId, {
    revision: 12,
    availableUnits: 1,
    heldUnits: 2,
    consumedUnits: 4,
    lifecycle: GRANT_LIFECYCLE.EXPIRED,
  });
  assert.equal(finalView.requests.length, 3);
  assert.equal(settlementCalls, 1);
  assert.equal(observer.calls, 3);
  assert.equal(new Set(observer.inputs.map(value => value.executionId)).size, 3);

  for (const artifact of [
    JSON.stringify(finalView.snapshot),
    JSON.stringify(observer.inputs),
    JSON.stringify(activated),
  ]) {
    assertMaterialAbsent(Buffer.from(artifact, 'utf8'), protectedMaterial);
  }

  store.close();
  store = undefined;
  const regularFiles = readdirSync(ownedDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile());
  let scannedFiles = 0;
  for (const entry of regularFiles) {
    assertMaterialAbsent(readFileSync(join(ownedDirectory, entry.name)), protectedMaterial);
    scannedFiles += 1;
  }
  assert.equal(scannedFiles > 0, true);
  assert.equal(scannedFiles, regularFiles.length);
  assert.equal(consoleCallCount, 0);
});
