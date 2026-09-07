import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
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
  ServiceCreditActivationError,
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
} from '../src/service-credit-http.js';
import * as serviceCreditComposition from '../src/service-credit-composition.js';
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
const { createServiceCreditCompositionOwner } = serviceCreditComposition;
const TEST_PROMISE = Promise;
const TEST_PROMISE_RESOLVE = Promise.resolve;
const TEST_PROMISE_THEN = Promise.prototype.then;
const TEST_REFLECT_APPLY = Reflect.apply;
const TEST_ACTIVATION_OPTIONS = new WeakMap();

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

function authorityProfile() {
  return {
    profileId: 'authority.mock.reference',
    profileVersion: 1,
    verifierVersion: 1,
    recordDigest: digest('d'),
  };
}

function ownedStore(t, options = {}) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'service-credit-owner-')));
  chmodSync(directory, 0o700);
  const configuration = {
    databasePath: join(directory, 'ledger.sqlite'),
    allowedRoot: directory,
    deriveCost: () => FIXED_COST_UNITS,
    now: () => NOW,
    ...options,
  };
  const state = { store: ServiceCreditSqliteStore.create(configuration) };
  state.store.registerOffer(trustedOffer());
  t.after(() => {
    try { state.store?.close(); } catch {}
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    configuration,
    directory,
    get store() { return state.store; },
    replaceStore(next) { state.store = next; },
  };
}

function activationFor(store, verifySettlement, now = () => NOW) {
  const activationOptions = {
    verifySettlement,
    authorityProfile: authorityProfile(),
    now,
  };
  const activation = createMockServiceCreditActivation({
    store,
    ...activationOptions,
  });
  TEST_ACTIVATION_OPTIONS.set(activation, activationOptions);
  return activation;
}

function optionsForActivation(activation) {
  const options = TEST_ACTIVATION_OPTIONS.get(activation);
  assert.notEqual(options, undefined);
  return options;
}

async function paymentFor(
  owner,
  capability = createCapabilityKey(),
  expiresAt = NOW + EXPIRY_WINDOW_MS,
) {
  const client = new MockExactZenonClient();
  const intent = fundingIntent(
    client.address,
    deriveServiceCreditCapabilityCommitment({ publicKey: capability.publicKey }),
    expiresAt,
  );
  const requirement = fundingRequirement();
  const prepared = owner.createFundingResource({
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
  return Object.freeze({
    capability,
    client,
    intent,
    paymentPayload,
    paymentRequired,
    prepared,
    requirement,
  });
}

function activationInput(payment) {
  return {
    intent: payment.intent,
    paymentRequired: payment.paymentRequired,
    paymentPayload: payment.paymentPayload,
  };
}

function deferred() {
  let resolve;
  const promise = new TEST_PROMISE(value => { resolve = value; });
  return Object.freeze({ promise, resolve });
}

function withinTimeout(value, label, milliseconds = 1_000) {
  return new TEST_PROMISE((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out: ${label}`)), milliseconds);
    const promise = TEST_REFLECT_APPLY(TEST_PROMISE_RESOLVE, TEST_PROMISE, [value]);
    TEST_REFLECT_APPLY(TEST_PROMISE_THEN, promise, [
      result => {
        clearTimeout(timer);
        resolve(result);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    ]);
  });
}

async function expectCode(operation, code, forbiddenDetail = undefined) {
  let captured;
  await assert.rejects(operation, error => {
    captured = error;
    return true;
  });
  const rendered = `${captured?.name}:${captured?.message}:${captured?.stack}`;
  if (forbiddenDetail !== undefined) {
    assert.equal(rendered.includes(forbiddenDetail), false);
  }
  assert.equal(captured?.code, code);
  assert.equal(captured?.message, code);
}

function assertUnavailable(response) {
  assert.equal(response.statusCode, 503);
  assert.deepEqual(parsed(response), { error: 'service_unavailable' });
  assertPrivateJson(response);
}

function expectSynchronousCode(operation, code) {
  assert.throws(operation, error => {
    assert.equal(error?.code, code);
    assert.equal(error?.message, code);
    return true;
  });
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
  const activationOptions = {
    verifySettlement: settlementVerifier,
    authorityProfile: {
      profileId: 'authority.mock.reference',
      profileVersion: 1,
      verifierVersion: 1,
      recordDigest: digest('d'),
    },
    now: () => clock.value,
  };
  const observer = { calls: 0, inputs: [] };
  const execute = createExecutionCallback(observer);
  let owner = createServiceCreditCompositionOwner({ store, activationOptions, execute });
  const initialHandle = owner.handle;
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
  const prepared = owner.createFundingResource({
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
  const activated = await owner.activateFunding({
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

  assert.equal(owner.handle, initialHandle);
  let handler = owner.handle;

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
  const reopenedActivationOptions = {
    verifySettlement: settlementVerifier,
    authorityProfile: {
      profileId: 'authority.mock.reference',
      profileVersion: 1,
      verifierVersion: 1,
      recordDigest: digest('d'),
    },
    now: () => clock.value,
  };
  owner = createServiceCreditCompositionOwner({
    store,
    activationOptions: reopenedActivationOptions,
    execute,
  });
  assert.notEqual(owner.handle, initialHandle);
  handler = owner.handle;

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

  const blockedD = await exchange(handler, signed[3].authorization, protectedMaterial);
  assertUnavailable(blockedD);
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
  const blockedE = await exchange(handler, signed[4].authorization, protectedMaterial);
  assertUnavailable(blockedE);
  assert.equal(requestFrom(store, grantId, signed[4].request.requestId), null);
  assertAccounting(store, grantId, {
    revision: 11,
    availableUnits: 1,
    heldUnits: 2,
    consumedUnits: 4,
    lifecycle: GRANT_LIFECYCLE.ACTIVE,
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
    revision: 11,
    availableUnits: 1,
    heldUnits: 2,
    consumedUnits: 4,
    lifecycle: GRANT_LIFECYCLE.ACTIVE,
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

test('composition surface is exact, frozen, stable, and captures trusted behavior once', async t => {
  const ledger = ownedStore(t);
  const facilitator = new MockExactZenonFacilitator();
  let verifierCalls = 0;
  const activation = activationFor(ledger.store, async (...args) => {
    verifierCalls += 1;
    return facilitator.settle(...args);
  });
  const observer = { calls: 0, inputs: [] };
  const execute = identity => {
    observer.calls += 1;
    observer.inputs.push(identity);
    return { resultCode: 'service.capture' };
  };
  const activationOptions = optionsForActivation(activation);
  const options = { store: ledger.store, activationOptions, execute };
  const listenerEvents = ['SIGINT', 'SIGTERM', 'uncaughtException', 'unhandledRejection'];
  const listenersBefore = listenerEvents.map(name => process.listenerCount(name));
  const serversBefore = process._getActiveHandles()
    .filter(handle => handle?.constructor?.name === 'Server').length;
  const owner = createServiceCreditCompositionOwner(options);
  const handle = owner.handle;

  assert.deepEqual(Object.keys(serviceCreditComposition), [
    'createServiceCreditCompositionOwner',
  ]);
  assert.deepEqual(Reflect.ownKeys(owner), [
    'createFundingResource',
    'activateFunding',
    'handle',
  ]);
  assert.equal(Object.isFrozen(owner), true);
  assert.equal(Object.isFrozen(owner.createFundingResource), true);
  assert.equal(Object.isFrozen(owner.activateFunding), true);
  assert.equal(Object.isFrozen(owner.handle), true);
  assert.equal(Object.hasOwn(owner.createFundingResource, 'prototype'), false);
  assert.equal(Object.hasOwn(owner.activateFunding, 'prototype'), false);
  assert.equal(Object.hasOwn(owner.handle, 'prototype'), false);
  for (const forbidden of [
    'store',
    'activation',
    'execute',
    'load',
    'activateGrantFromTrustedRecord',
    'reconcileRequest',
    'releaseBeforeExecution',
    'revokeGrant',
    'state',
    'handlerFactory',
    'testHooks',
  ]) {
    assert.equal(Object.hasOwn(owner, forbidden), false);
  }

  let replacementCalls = 0;
  options.execute = () => {
    replacementCalls += 1;
    throw new Error('replacement execute must remain unreachable');
  };
  ledger.store.load = () => {
    replacementCalls += 1;
    throw new Error('replacement load must remain unreachable');
  };
  activationOptions.verifySettlement = () => {
    replacementCalls += 1;
    throw new Error('replacement verifier must remain unreachable');
  };
  activationOptions.now = () => {
    replacementCalls += 1;
    throw new Error('replacement clock must remain unreachable');
  };
  activationOptions.authorityProfile = null;
  options.activationOptions = null;

  const payment = await paymentFor(owner);
  const activated = await owner.activateFunding(activationInput(payment));
  const signed = signedServiceRequest(
    payment.capability,
    activated.grant.grantId,
    'request.capture',
  );
  const response = await exchange(owner.handle, signed.authorization, [
    Buffer.from(signed.authorization, 'utf8'),
  ]);

  assert.equal(owner.handle, handle);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(parsed(response), { ok: true, resultCode: 'service.capture' });
  assertPrivateJson(response);
  assert.equal(replacementCalls, 0);
  assert.equal(verifierCalls, 1);
  assert.equal(facilitator.records.size, 1);
  assert.equal(observer.calls, 1);
  assert.deepEqual(Reflect.ownKeys(observer.inputs[0]), ['executionId']);
  assert.equal(Object.isFrozen(observer.inputs[0]), true);
  assert.deepEqual(
    listenerEvents.map(name => process.listenerCount(name)),
    listenersBefore,
  );
  assert.equal(
    process._getActiveHandles().filter(value => value?.constructor?.name === 'Server').length,
    serversBefore,
  );
});

test('composition rejects accessor, Proxy, poison-key, expanded, and incompatible dependencies', t => {
  const ledger = ownedStore(t);
  const facilitator = new MockExactZenonFacilitator();
  const activation = activationFor(ledger.store, facilitator.settle.bind(facilitator));
  const activationOptions = optionsForActivation(activation);
  const execute = () => ({ resultCode: 'service.unused' });
  const invalidCode = 'SERVICE_CREDIT_COMPOSITION_INVALID_CONFIGURATION';

  expectSynchronousCode(
    () => createServiceCreditCompositionOwner({
      store: ledger.store,
      activationOptions,
      execute,
      extra: 1,
    }),
    invalidCode,
  );

  let trapCalls = 0;
  const proxiedOptions = new Proxy({ store: ledger.store, activationOptions, execute }, {
    get() { trapCalls += 1; throw new Error('proxy detail'); },
    ownKeys() { trapCalls += 1; throw new Error('proxy detail'); },
  });
  expectSynchronousCode(() => createServiceCreditCompositionOwner(proxiedOptions), invalidCode);
  assert.equal(trapCalls, 0);

  let accessorCalls = 0;
  const accessorOptions = { store: ledger.store, activationOptions };
  Object.defineProperty(accessorOptions, 'execute', {
    enumerable: true,
    get() { accessorCalls += 1; throw new Error('accessor detail'); },
  });
  expectSynchronousCode(() => createServiceCreditCompositionOwner(accessorOptions), invalidCode);
  assert.equal(accessorCalls, 0);

  const poisonOptions = { store: ledger.store, activationOptions, execute };
  Object.defineProperty(poisonOptions, '__proto__', {
    enumerable: true,
    value: null,
  });
  expectSynchronousCode(() => createServiceCreditCompositionOwner(poisonOptions), invalidCode);
  expectSynchronousCode(
    () => createServiceCreditCompositionOwner({
      store: new Proxy(ledger.store, {}),
      activationOptions,
      execute,
    }),
    invalidCode,
  );
  expectSynchronousCode(
    () => createServiceCreditCompositionOwner({
      store: ledger.store,
      activationOptions: new Proxy(activationOptions, {}),
      execute,
    }),
    invalidCode,
  );
  expectSynchronousCode(
    () => createServiceCreditCompositionOwner({
      store: ledger.store,
      activationOptions,
      execute: new Proxy(execute, {}),
    }),
    invalidCode,
  );
  expectSynchronousCode(
    () => createServiceCreditCompositionOwner({
      store: {
        load: ServiceCreditSqliteStore.prototype.load,
        reserveRequest: ServiceCreditSqliteStore.prototype.reserveRequest,
        beginExecution: ServiceCreditSqliteStore.prototype.beginExecution,
        completeExecution: ServiceCreditSqliteStore.prototype.completeExecution,
        markOutcomeUnknown: ServiceCreditSqliteStore.prototype.markOutcomeUnknown,
      },
      activationOptions,
      execute,
    }),
    invalidCode,
  );
  const accessorActivationOptions = {
    authorityProfile: authorityProfile(),
    now: () => NOW,
  };
  Object.defineProperty(accessorActivationOptions, 'verifySettlement', {
    enumerable: true,
    get() { accessorCalls += 1; throw new Error('verifier accessor detail'); },
  });
  expectSynchronousCode(
    () => createServiceCreditCompositionOwner({
      store: ledger.store,
      activationOptions: accessorActivationOptions,
      execute,
    }),
    invalidCode,
  );
  assert.equal(accessorCalls, 0);

  const expandedActivationOptions = { ...activationOptions, extra: 1 };
  expectSynchronousCode(
    () => createServiceCreditCompositionOwner({
      store: ledger.store,
      activationOptions: expandedActivationOptions,
      execute,
    }),
    invalidCode,
  );
  const poisonActivationOptions = { ...activationOptions };
  Object.defineProperty(poisonActivationOptions, '__proto__', {
    enumerable: true,
    value: null,
  });
  expectSynchronousCode(
    () => createServiceCreditCompositionOwner({
      store: ledger.store,
      activationOptions: poisonActivationOptions,
      execute,
    }),
    invalidCode,
  );
  expectSynchronousCode(
    () => createServiceCreditCompositionOwner({
      store: ledger.store,
      activationOptions: {
        ...activationOptions,
        verifySettlement: new Proxy(activationOptions.verifySettlement, {}),
      },
      execute,
    }),
    invalidCode,
  );

  const accessorStore = Object.create(ServiceCreditSqliteStore.prototype);
  Object.defineProperty(accessorStore, 'load', {
    enumerable: true,
    get() { accessorCalls += 1; throw new Error('store accessor detail'); },
  });
  expectSynchronousCode(
    () => createServiceCreditCompositionOwner({
      store: accessorStore,
      activationOptions,
      execute,
    }),
    invalidCode,
  );
  assert.equal(accessorCalls, 0);

  function ordinaryExecute() {
    return { resultCode: 'service.ordinary-function' };
  }
  const ordinaryOwner = createServiceCreditCompositionOwner({
    store: ledger.store,
    activationOptions,
    execute: ordinaryExecute,
  });
  assert.deepEqual(Reflect.ownKeys(ordinaryOwner), [
    'createFundingResource',
    'activateFunding',
    'handle',
  ]);
});

test('racing requests keep the old snapshot while exact activations serialize and converge', async t => {
  const ledger = ownedStore(t);
  const facilitator = new MockExactZenonFacilitator();
  const started = deferred();
  const release = deferred();
  let hold = false;
  let verifierCalls = 0;
  let activeVerifiers = 0;
  let maximumActiveVerifiers = 0;
  const activation = activationFor(ledger.store, async (...args) => {
    verifierCalls += 1;
    activeVerifiers += 1;
    maximumActiveVerifiers = Math.max(maximumActiveVerifiers, activeVerifiers);
    try {
      if (hold) {
        started.resolve();
        await release.promise;
      }
      return await facilitator.settle(...args);
    } finally {
      activeVerifiers -= 1;
    }
  });
  const observer = { calls: 0 };
  const owner = createServiceCreditCompositionOwner({
    store: ledger.store,
    activationOptions: optionsForActivation(activation),
    execute: () => {
      observer.calls += 1;
      return { resultCode: 'service.race' };
    },
  });
  const handle = owner.handle;
  const payment = await paymentFor(owner);

  const seeded = await activation.activate(activationInput(payment));
  const seededRevision = ledger.store.getMetadata().revision;
  const signed = signedServiceRequest(
    payment.capability,
    seeded.grant.grantId,
    'request.race',
  );
  const protectedMaterial = [Buffer.from(signed.authorization, 'utf8')];
  const before = await exchange(handle, signed.authorization, protectedMaterial);
  assert.equal(before.statusCode, 401);
  assert.deepEqual(parsed(before), { error: 'unauthorized' });
  assertPrivateJson(before);

  hold = true;
  const firstReplay = owner.activateFunding(activationInput(payment));
  const secondReplay = owner.activateFunding(activationInput(payment));
  await withinTimeout(started.promise, 'first serialized activation start');
  assert.equal(verifierCalls, 2);
  assert.equal(activeVerifiers, 1);
  const racing = await exchange(handle, signed.authorization, protectedMaterial);
  assert.equal(racing.statusCode, 401);
  assert.deepEqual(parsed(racing), { error: 'unauthorized' });
  assertPrivateJson(racing);
  assert.equal(observer.calls, 0);

  release.resolve();
  const [first, second] = await withinTimeout(
    Promise.all([firstReplay, secondReplay]),
    'serialized activation completion',
  );
  assert.deepEqual(first, seeded);
  assert.deepEqual(second, seeded);
  assert.equal(owner.handle, handle);
  assert.equal(maximumActiveVerifiers, 1);
  assert.equal(verifierCalls, 3);
  assert.equal(facilitator.records.size, 1);
  assert.equal(ledger.store.getMetadata().revision, seededRevision);

  const served = await exchange(handle, signed.authorization, protectedMaterial);
  const replayed = await exchange(handle, signed.authorization, protectedMaterial);
  assert.equal(served.statusCode, 200);
  assert.deepEqual(parsed(served), { ok: true, resultCode: 'service.race' });
  assert.deepEqual(replayed, served);
  assert.equal(observer.calls, 1);
  assertAccounting(ledger.store, seeded.grant.grantId, {
    revision: seededRevision + 3,
    availableUnits: 5,
    heldUnits: 0,
    consumedUnits: 2,
  });
});

test('definite activation rejection neither swaps nor latches admission', async t => {
  let loadOperations = 0;
  const ledger = ownedStore(t, {
    testHooks: {
      beforeBegin({ operation }) {
        if (operation === 'load') loadOperations += 1;
      },
    },
  });
  const facilitator = new MockExactZenonFacilitator();
  let verifierCalls = 0;
  const activation = activationFor(ledger.store, async (...args) => {
    verifierCalls += 1;
    return facilitator.settle(...args);
  });
  let executeCalls = 0;
  const owner = createServiceCreditCompositionOwner({
    store: ledger.store,
    activationOptions: optionsForActivation(activation),
    execute: () => {
      executeCalls += 1;
      return { resultCode: 'service.after-rejection' };
    },
  });
  const handle = owner.handle;
  const payment = await paymentFor(owner);
  const changed = structuredClone(payment.paymentPayload);
  changed.payload.intentDigest = '0'.repeat(64);
  await expectCode(
    () => owner.activateFunding({
      intent: payment.intent,
      paymentRequired: payment.paymentRequired,
      paymentPayload: changed,
    }),
    'SERVICE_CREDIT_ACTIVATION_REJECTED',
  );
  assert.equal(loadOperations, 1);
  assert.equal(verifierCalls, 0);
  assert.equal(executeCalls, 0);
  assert.equal(owner.handle, handle);

  const activated = await owner.activateFunding(activationInput(payment));
  assert.equal(loadOperations, 2);
  assert.equal(verifierCalls, 1);
  assert.equal(facilitator.records.size, 1);
  assert.equal(owner.handle, handle);
  const signed = signedServiceRequest(
    payment.capability,
    activated.grant.grantId,
    'request.after-rejection',
  );
  const response = await exchange(handle, signed.authorization, [
    Buffer.from(signed.authorization, 'utf8'),
  ]);
  assert.equal(response.statusCode, 200);
  assert.equal(executeCalls, 1);
});

test('unresolved execution admission survives grant activation and owner reconstruction', async t => {
  const ledger = ownedStore(t);
  const facilitator = new MockExactZenonFacilitator();
  const activation = activationFor(
    ledger.store,
    facilitator.settle.bind(facilitator),
  );
  let executeCalls = 0;
  const owner = createServiceCreditCompositionOwner({
    store: ledger.store,
    activationOptions: optionsForActivation(activation),
    execute: () => {
      executeCalls += 1;
      if (executeCalls === 1) throw new Error('synthetic-private-detail');
      return { resultCode: 'service.must-not-run' };
    },
  });
  const blockerPayment = await paymentFor(owner);
  const blockerGrant = await owner.activateFunding(activationInput(blockerPayment));
  const blocker = signedServiceRequest(
    blockerPayment.capability,
    blockerGrant.grant.grantId,
    'request.blocker',
  );
  const unknown = await exchange(owner.handle, blocker.authorization, [
    Buffer.from(blocker.authorization, 'utf8'),
  ]);
  assert.equal(unknown.statusCode, 409);
  assert.equal(executeCalls, 1);

  const laterPayment = await paymentFor(owner);
  const laterGrant = await owner.activateFunding(activationInput(laterPayment));
  const later = signedServiceRequest(
    laterPayment.capability,
    laterGrant.grant.grantId,
    'request.later-grant',
  );
  const blockedAfterActivation = await exchange(owner.handle, later.authorization, [
    Buffer.from(later.authorization, 'utf8'),
  ]);
  assertUnavailable(blockedAfterActivation);
  assert.equal(executeCalls, 1);

  ledger.store.close();
  const reopened = ServiceCreditSqliteStore.openExisting({
    databasePath: ledger.configuration.databasePath,
    allowedRoot: ledger.configuration.allowedRoot,
    deriveCost: () => FIXED_COST_UNITS,
    now: () => NOW,
  });
  ledger.replaceStore(reopened);
  const freshFacilitator = new MockExactZenonFacilitator();
  const freshActivation = activationFor(
    reopened,
    freshFacilitator.settle.bind(freshFacilitator),
  );
  let recoveredCalls = 0;
  const recoveredOwner = createServiceCreditCompositionOwner({
    store: reopened,
    activationOptions: optionsForActivation(freshActivation),
    execute: () => {
      recoveredCalls += 1;
      return { resultCode: 'service.must-not-run' };
    },
  });
  const blockedAfterReopen = await exchange(recoveredOwner.handle, later.authorization, [
    Buffer.from(later.authorization, 'utf8'),
  ]);
  assertUnavailable(blockedAfterReopen);
  assert.equal(recoveredCalls, 0);
  assert.equal(freshFacilitator.records.size, 0);
});

test('OUTCOME_UNKNOWN latches all authority and a validated new owner admits persisted state', async t => {
  let armed = false;
  const ledger = ownedStore(t, {
    testHooks: {
      afterCommit({ operation, changed }) {
        if (armed && changed && operation === 'activateGrantFromTrustedRecord') {
          throw new Error('synthetic ambiguous commit detail');
        }
      },
    },
  });
  const facilitator = new MockExactZenonFacilitator();
  let verifierCalls = 0;
  const activation = activationFor(ledger.store, async (...args) => {
    verifierCalls += 1;
    return facilitator.settle(...args);
  });
  let executeCalls = 0;
  const execute = () => {
    executeCalls += 1;
    return { resultCode: 'service.reopened' };
  };
  const owner = createServiceCreditCompositionOwner({
    store: ledger.store,
    activationOptions: optionsForActivation(activation),
    execute,
  });
  const handle = owner.handle;
  const payment = await paymentFor(owner);
  armed = true;
  const first = owner.activateFunding(activationInput(payment));
  const queued = owner.activateFunding(activationInput(payment));
  await expectCode(() => first, 'SERVICE_CREDIT_ACTIVATION_OUTCOME_UNKNOWN');
  await expectCode(() => queued, 'SERVICE_CREDIT_ACTIVATION_OUTCOME_UNKNOWN');
  await expectCode(
    () => owner.activateFunding(activationInput(payment)),
    'SERVICE_CREDIT_ACTIVATION_OUTCOME_UNKNOWN',
  );
  await expectCode(
    async () => owner.createFundingResource({
      intent: payment.intent,
      requirement: payment.requirement,
      resourceUrl: RESOURCE_URL,
    }),
    'SERVICE_CREDIT_ACTIVATION_OUTCOME_UNKNOWN',
  );
  assert.equal(verifierCalls, 1);
  assert.equal(facilitator.records.size, 1);
  assert.equal(executeCalls, 0);

  const unavailable = await exchange(handle, 'ServiceCredit c2VjcmV0', [
    Buffer.from('secret', 'utf8'),
  ]);
  assertUnavailable(unavailable);
  assert.equal(executeCalls, 0);

  ledger.store.close();
  const reopenedConfiguration = {
    databasePath: ledger.configuration.databasePath,
    allowedRoot: ledger.configuration.allowedRoot,
    deriveCost: () => FIXED_COST_UNITS,
    now: () => NOW,
  };
  const reopened = ServiceCreditSqliteStore.openExisting(reopenedConfiguration);
  ledger.replaceStore(reopened);
  const persisted = reopened.load();
  assert.equal(persisted.state.grants.length, 1);
  const freshFacilitator = new MockExactZenonFacilitator();
  const freshActivation = activationFor(reopened, freshFacilitator.settle.bind(freshFacilitator));
  const recoveredOwner = createServiceCreditCompositionOwner({
    store: reopened,
    activationOptions: optionsForActivation(freshActivation),
    execute,
  });
  assert.notEqual(recoveredOwner.handle, handle);
  const signed = signedServiceRequest(
    payment.capability,
    persisted.state.grants[0].grantId,
    'request.reopened-owner',
  );
  const recovered = await exchange(recoveredOwner.handle, signed.authorization, [
    Buffer.from(signed.authorization, 'utf8'),
  ]);
  assert.equal(recovered.statusCode, 200);
  assert.deepEqual(parsed(recovered), { ok: true, resultCode: 'service.reopened' });
  assert.equal(executeCalls, 1);
  assert.equal(freshFacilitator.records.size, 0);
});

test('committed activation plus handler rebuild failure latches activated-unavailable', async t => {
  const diagnostic = 'synthetic private rebuild diagnostic';
  let armed = false;
  let failNextLoad = false;
  const ledger = ownedStore(t, {
    testHooks: {
      beforeBegin({ operation }) {
        if (failNextLoad && operation === 'load') {
          failNextLoad = false;
          throw new Error(diagnostic);
        }
      },
      afterCommit({ operation, changed }) {
        if (armed && changed && operation === 'activateGrantFromTrustedRecord') {
          failNextLoad = true;
        }
      },
    },
  });
  const facilitator = new MockExactZenonFacilitator();
  let verifierCalls = 0;
  const activation = activationFor(ledger.store, async (...args) => {
    verifierCalls += 1;
    return facilitator.settle(...args);
  });
  let executeCalls = 0;
  const owner = createServiceCreditCompositionOwner({
    store: ledger.store,
    activationOptions: optionsForActivation(activation),
    execute: () => {
      executeCalls += 1;
      return { resultCode: 'service.must-not-run' };
    },
  });
  const payment = await paymentFor(owner);
  armed = true;
  const first = owner.activateFunding(activationInput(payment));
  const queued = owner.activateFunding(activationInput(payment));
  await expectCode(
    () => withinTimeout(first, 'activated-unavailable activation'),
    'SERVICE_CREDIT_COMPOSITION_ACTIVATED_UNAVAILABLE',
    diagnostic,
  );
  await expectCode(
    () => withinTimeout(queued, 'queued activated-unavailable propagation'),
    'SERVICE_CREDIT_COMPOSITION_ACTIVATED_UNAVAILABLE',
    diagnostic,
  );
  const persisted = ledger.store.load();
  assert.equal(persisted.state.grants.length, 1);
  assert.equal(verifierCalls, 1);
  assert.equal(facilitator.records.size, 1);
  await expectCode(
    () => owner.activateFunding(activationInput(payment)),
    'SERVICE_CREDIT_COMPOSITION_ACTIVATED_UNAVAILABLE',
  );
  await expectCode(
    async () => owner.createFundingResource({
      intent: payment.intent,
      requirement: payment.requirement,
      resourceUrl: RESOURCE_URL,
    }),
    'SERVICE_CREDIT_COMPOSITION_ACTIVATED_UNAVAILABLE',
  );
  assert.equal(verifierCalls, 1);
  const signed = signedServiceRequest(
    payment.capability,
    persisted.state.grants[0].grantId,
    'request.activated-unavailable',
  );
  const response = await exchange(owner.handle, signed.authorization, [
    Buffer.from(signed.authorization, 'utf8'),
    Buffer.from(diagnostic, 'utf8'),
  ]);
  assertUnavailable(response);
  assert.equal(executeCalls, 0);
});

test('inactive exact replays converge without disabling unrelated active grants', async t => {
  await t.test('revoked grant replay', async t => {
    const ledger = ownedStore(t);
    const facilitator = new MockExactZenonFacilitator();
    let verifierCalls = 0;
    const activation = activationFor(ledger.store, async (...args) => {
      verifierCalls += 1;
      return facilitator.settle(...args);
    });
    let executeCalls = 0;
    const owner = createServiceCreditCompositionOwner({
      store: ledger.store,
      activationOptions: optionsForActivation(activation),
      execute: () => {
        executeCalls += 1;
        return { resultCode: 'service.revoked-replay-peer' };
      },
    });
    const inactivePayment = await paymentFor(owner);
    const activePayment = await paymentFor(owner);
    const inactiveGrant = await owner.activateFunding(activationInput(inactivePayment));
    const activeGrant = await owner.activateFunding(activationInput(activePayment));
    const revoked = ledger.store.revokeGrant({ grantId: inactiveGrant.grant.grantId });
    assert.equal(revoked.lifecycle, GRANT_LIFECYCLE.REVOKED);

    const replay = await withinTimeout(
      owner.activateFunding(activationInput(inactivePayment)),
      'revoked activation replay',
    );
    assert.equal(replay.grant.lifecycle, GRANT_LIFECYCLE.REVOKED);
    assert.deepEqual(replay.grant, ledger.store.getGrant(inactiveGrant.grant.grantId));
    assert.equal(verifierCalls, 3);
    assert.equal(facilitator.records.size, 2);

    const activeSigned = signedServiceRequest(
      activePayment.capability,
      activeGrant.grant.grantId,
      'request.peer-after-revoked-replay',
    );
    const served = await exchange(owner.handle, activeSigned.authorization, [
      Buffer.from(activeSigned.authorization, 'utf8'),
    ]);
    assert.equal(served.statusCode, 200);
    assert.deepEqual(parsed(served), { ok: true, resultCode: 'service.revoked-replay-peer' });

    const inactiveSigned = signedServiceRequest(
      inactivePayment.capability,
      inactiveGrant.grant.grantId,
      'request.revoked-replay',
    );
    const denied = await exchange(owner.handle, inactiveSigned.authorization, [
      Buffer.from(inactiveSigned.authorization, 'utf8'),
    ]);
    assert.equal(denied.statusCode, 403);
    assert.deepEqual(parsed(denied), { error: 'credit_not_authorized' });
    assert.equal(executeCalls, 1);
  });

  await t.test('durably expired grant replay', async t => {
    const clock = { value: NOW };
    const ledger = ownedStore(t, { now: () => clock.value });
    const facilitator = new MockExactZenonFacilitator();
    let verifierCalls = 0;
    const activation = activationFor(ledger.store, async (...args) => {
      verifierCalls += 1;
      return facilitator.settle(...args);
    }, () => clock.value);
    let executeCalls = 0;
    const owner = createServiceCreditCompositionOwner({
      store: ledger.store,
      activationOptions: optionsForActivation(activation),
      execute: () => {
        executeCalls += 1;
        return { resultCode: 'service.expired-replay-peer' };
      },
    });
    const expiredPayment = await paymentFor(
      owner,
      createCapabilityKey(),
      NOW + EXPIRY_WINDOW_MS,
    );
    const activePayment = await paymentFor(
      owner,
      createCapabilityKey(),
      NOW + (EXPIRY_WINDOW_MS * 2),
    );
    const expiredGrant = await owner.activateFunding(activationInput(expiredPayment));
    const activeGrant = await owner.activateFunding(activationInput(activePayment));
    clock.value = NOW + EXPIRY_WINDOW_MS;
    assert.equal(
      ledger.store.getGrant(expiredGrant.grant.grantId).lifecycle,
      GRANT_LIFECYCLE.EXPIRED,
    );
    clock.value = NOW;

    const replay = await withinTimeout(
      owner.activateFunding(activationInput(expiredPayment)),
      'expired activation replay',
    );
    assert.equal(replay.grant.lifecycle, GRANT_LIFECYCLE.EXPIRED);
    assert.deepEqual(replay.grant, ledger.store.getGrant(expiredGrant.grant.grantId));
    assert.equal(verifierCalls, 3);
    assert.equal(facilitator.records.size, 2);

    const activeSigned = signedServiceRequest(
      activePayment.capability,
      activeGrant.grant.grantId,
      'request.peer-after-expired-replay',
    );
    const served = await exchange(owner.handle, activeSigned.authorization, [
      Buffer.from(activeSigned.authorization, 'utf8'),
    ]);
    assert.equal(served.statusCode, 200);
    assert.deepEqual(parsed(served), { ok: true, resultCode: 'service.expired-replay-peer' });

    const expiredSigned = signedServiceRequest(
      expiredPayment.capability,
      expiredGrant.grant.grantId,
      'request.expired-replay',
    );
    const denied = await exchange(owner.handle, expiredSigned.authorization, [
      Buffer.from(expiredSigned.authorization, 'utf8'),
    ]);
    assert.equal(denied.statusCode, 403);
    assert.deepEqual(parsed(denied), { error: 'credit_not_authorized' });
    assert.equal(executeCalls, 1);
  });
});

test('an in-flight callback can finish after an outcome-unknown latch while later requests fail closed', async t => {
  let armed = false;
  const ledger = ownedStore(t, {
    testHooks: {
      afterCommit({ operation, changed }) {
        if (armed && changed && operation === 'activateGrantFromTrustedRecord') {
          throw new Error('private in-flight ambiguity detail');
        }
      },
    },
  });
  const facilitator = new MockExactZenonFacilitator();
  const activation = activationFor(
    ledger.store,
    facilitator.settle.bind(facilitator),
  );
  const callbackStarted = deferred();
  const releaseCallback = deferred();
  let executeCalls = 0;
  let callbackFinished = false;
  const owner = createServiceCreditCompositionOwner({
    store: ledger.store,
    activationOptions: optionsForActivation(activation),
    execute: async () => {
      executeCalls += 1;
      callbackStarted.resolve();
      await releaseCallback.promise;
      callbackFinished = true;
      return { resultCode: 'service.in-flight-before-latch' };
    },
  });
  const servingPayment = await paymentFor(owner);
  const latchingPayment = await paymentFor(owner);
  const servingGrant = await owner.activateFunding(activationInput(servingPayment));
  const inFlightSigned = signedServiceRequest(
    servingPayment.capability,
    servingGrant.grant.grantId,
    'request.in-flight-before-latch',
  );
  const protectedMaterial = [Buffer.from(inFlightSigned.authorization, 'utf8')];
  const inFlight = exchange(owner.handle, inFlightSigned.authorization, protectedMaterial);
  await withinTimeout(callbackStarted.promise, 'application callback start');
  assert.equal(executeCalls, 1);

  armed = true;
  await expectCode(
    () => withinTimeout(
      owner.activateFunding(activationInput(latchingPayment)),
      'outcome-unknown while request is in flight',
    ),
    'SERVICE_CREDIT_ACTIVATION_OUTCOME_UNKNOWN',
    'private in-flight ambiguity detail',
  );
  const laterSigned = signedServiceRequest(
    servingPayment.capability,
    servingGrant.grant.grantId,
    'request.after-in-flight-latch',
  );
  const later = await withinTimeout(
    exchange(owner.handle, laterSigned.authorization, [
      Buffer.from(laterSigned.authorization, 'utf8'),
    ]),
    'post-latch request',
  );
  assertUnavailable(later);
  assert.equal(executeCalls, 1);

  releaseCallback.resolve();
  const completed = await withinTimeout(inFlight, 'in-flight request completion');
  assertUnavailable(completed);
  assert.equal(executeCalls, 1);
  assert.equal(callbackFinished, true);
});

test('verifier throws, rejects, and non-Promise thenables are definite non-latching failures', async t => {
  const cases = [
    { name: 'synchronous throw', mode: 'throw' },
    { name: 'asynchronous rejection', mode: 'reject' },
    { name: 'non-Promise thenable', mode: 'thenable' },
  ];
  for (const entry of cases) {
    await t.test(entry.name, async t => {
      const diagnostic = `private verifier ${entry.mode} detail`;
      const ledger = ownedStore(t);
      const facilitator = new MockExactZenonFacilitator();
      let mode = 'success';
      let verifierCalls = 0;
      let thenCalls = 0;
      const activation = activationFor(ledger.store, (...args) => {
        verifierCalls += 1;
        if (mode === 'throw') throw new Error(diagnostic);
        if (mode === 'reject') {
          return new TEST_PROMISE((resolve, reject) => reject(new Error(diagnostic)));
        }
        if (mode === 'thenable') {
          return {
            then() {
              thenCalls += 1;
              throw new Error(diagnostic);
            },
          };
        }
        return facilitator.settle(...args);
      });
      let executeCalls = 0;
      const owner = createServiceCreditCompositionOwner({
        store: ledger.store,
        activationOptions: optionsForActivation(activation),
        execute: () => {
          executeCalls += 1;
          return { resultCode: 'service.peer-after-verifier-failure' };
        },
      });
      const activePayment = await paymentFor(owner);
      const failingPayment = await paymentFor(owner);
      const activeGrant = await owner.activateFunding(activationInput(activePayment));
      mode = entry.mode;

      await expectCode(
        () => withinTimeout(
          owner.activateFunding(activationInput(failingPayment)),
          `${entry.name} activation failure`,
        ),
        'SERVICE_CREDIT_ACTIVATION_REJECTED',
        diagnostic,
      );
      await expectCode(
        () => withinTimeout(
          owner.activateFunding(activationInput(failingPayment)),
          `${entry.name} explicit retry`,
        ),
        'SERVICE_CREDIT_ACTIVATION_REJECTED',
        diagnostic,
      );
      assert.equal(verifierCalls, 3);
      assert.equal(thenCalls, 0);
      assert.equal(facilitator.records.size, 1);

      const signed = signedServiceRequest(
        activePayment.capability,
        activeGrant.grant.grantId,
        `request.peer-after-${entry.mode}`,
      );
      const served = await exchange(owner.handle, signed.authorization, [
        Buffer.from(signed.authorization, 'utf8'),
        Buffer.from(diagnostic, 'utf8'),
      ]);
      assert.equal(served.statusCode, 200);
      assert.deepEqual(parsed(served), {
        ok: true,
        resultCode: 'service.peer-after-verifier-failure',
      });
      assert.equal(executeCalls, 1);
    });
  }
});

test('one process cannot reuse an owned exact store or bypass a latched owner', async t => {
  const ownedCode = 'SERVICE_CREDIT_COMPOSITION_DEPENDENCY_OWNED';
  let armed = false;
  const firstLedger = ownedStore(t, {
    testHooks: {
      afterCommit({ operation, changed }) {
        if (armed && changed && operation === 'activateGrantFromTrustedRecord') {
          throw new Error('private ownership ambiguity detail');
        }
      },
    },
  });
  const firstFacilitator = new MockExactZenonFacilitator();
  let verifierCalls = 0;
  let activeVerifiers = 0;
  let maximumActiveVerifiers = 0;
  const firstActivation = activationFor(firstLedger.store, async (...args) => {
    verifierCalls += 1;
    activeVerifiers += 1;
    maximumActiveVerifiers = Math.max(maximumActiveVerifiers, activeVerifiers);
    try {
      return await firstFacilitator.settle(...args);
    } finally {
      activeVerifiers -= 1;
    }
  });
  const firstOwner = createServiceCreditCompositionOwner({
    store: firstLedger.store,
    activationOptions: optionsForActivation(firstActivation),
    execute: () => ({ resultCode: 'service.owned' }),
  });

  expectSynchronousCode(
    () => createServiceCreditCompositionOwner({
      store: firstLedger.store,
      activationOptions: {
        ...optionsForActivation(firstActivation),
      },
      execute: () => ({ resultCode: 'service.duplicate' }),
    }),
    ownedCode,
  );

  const secondLedger = ownedStore(t);
  const secondFacilitator = new MockExactZenonFacilitator();
  const secondActivation = activationFor(
    secondLedger.store,
    secondFacilitator.settle.bind(secondFacilitator),
  );
  const secondOwner = createServiceCreditCompositionOwner({
    store: secondLedger.store,
    activationOptions: optionsForActivation(secondActivation),
    execute: () => ({ resultCode: 'service.independent' }),
  });
  assert.deepEqual(Reflect.ownKeys(secondOwner), [
    'createFundingResource',
    'activateFunding',
    'handle',
  ]);

  const payment = await paymentFor(firstOwner);
  armed = true;
  await expectCode(
    () => firstOwner.activateFunding(activationInput(payment)),
    'SERVICE_CREDIT_ACTIVATION_OUTCOME_UNKNOWN',
  );
  expectSynchronousCode(
    () => createServiceCreditCompositionOwner({
      store: firstLedger.store,
      activationOptions: {
        ...optionsForActivation(firstActivation),
      },
      execute: () => ({ resultCode: 'service.latch-bypass' }),
    }),
    ownedCode,
  );
  assert.equal(verifierCalls, 1);
  assert.equal(maximumActiveVerifiers, 1);
  assert.equal(activeVerifiers, 0);

  let failInitialLoad = true;
  const failedLedger = ownedStore(t, {
    testHooks: {
      beforeBegin({ operation }) {
        if (failInitialLoad && operation === 'load') {
          failInitialLoad = false;
          throw new Error('private failed construction detail');
        }
      },
    },
  });
  const failedFacilitator = new MockExactZenonFacilitator();
  const failedActivation = activationFor(
    failedLedger.store,
    failedFacilitator.settle.bind(failedFacilitator),
  );
  expectSynchronousCode(
    () => createServiceCreditCompositionOwner({
      store: failedLedger.store,
      activationOptions: optionsForActivation(failedActivation),
      execute: () => ({ resultCode: 'service.failed-construction' }),
    }),
    'SERVICE_CREDIT_COMPOSITION_INVALID_CONFIGURATION',
  );
  expectSynchronousCode(
    () => createServiceCreditCompositionOwner({
      store: failedLedger.store,
      activationOptions: optionsForActivation(failedActivation),
      execute: () => ({ resultCode: 'service.failed-bypass' }),
    }),
    ownedCode,
  );

  const invalidAdapterLedger = ownedStore(t);
  expectSynchronousCode(
    () => createServiceCreditCompositionOwner({
      store: invalidAdapterLedger.store,
      activationOptions: {
        verifySettlement: failedFacilitator.settle.bind(failedFacilitator),
        authorityProfile: null,
        now: () => NOW,
      },
      execute: () => ({ resultCode: 'service.invalid-adapter-construction' }),
    }),
    'SERVICE_CREDIT_COMPOSITION_INVALID_CONFIGURATION',
  );
  expectSynchronousCode(
    () => createServiceCreditCompositionOwner({
      store: invalidAdapterLedger.store,
      activationOptions: optionsForActivation(failedActivation),
      execute: () => ({ resultCode: 'service.invalid-adapter-bypass' }),
    }),
    ownedCode,
  );
});

test('captured native Promise operations preserve ordering and latched rejection', async t => {
  const NativePromise = globalThis.Promise;
  const nativeThen = NativePromise.prototype.then;
  const promiseDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Promise');
  const resolveDescriptor = Object.getOwnPropertyDescriptor(NativePromise, 'resolve');
  const rejectDescriptor = Object.getOwnPropertyDescriptor(NativePromise, 'reject');
  const thenDescriptor = Object.getOwnPropertyDescriptor(NativePromise.prototype, 'then');
  const restore = () => {
    Object.defineProperty(globalThis, 'Promise', promiseDescriptor);
    Object.defineProperty(NativePromise, 'resolve', resolveDescriptor);
    Object.defineProperty(NativePromise, 'reject', rejectDescriptor);
    Object.defineProperty(NativePromise.prototype, 'then', thenDescriptor);
  };
  t.after(restore);

  const orderedLedger = ownedStore(t);
  const orderedFacilitator = new MockExactZenonFacilitator();
  const started = deferred();
  const release = deferred();
  let verifierCalls = 0;
  let activeVerifiers = 0;
  let maximumActiveVerifiers = 0;
  const orderedActivation = activationFor(orderedLedger.store, async (...args) => {
    verifierCalls += 1;
    activeVerifiers += 1;
    maximumActiveVerifiers = Math.max(maximumActiveVerifiers, activeVerifiers);
    try {
      if (verifierCalls === 1) {
        started.resolve();
        await release.promise;
      }
      return await orderedFacilitator.settle(...args);
    } finally {
      activeVerifiers -= 1;
    }
  });
  const orderedOwner = createServiceCreditCompositionOwner({
    store: orderedLedger.store,
    activationOptions: optionsForActivation(orderedActivation),
    execute: () => ({ resultCode: 'service.promise-order' }),
  });
  const orderedPayment = await paymentFor(orderedOwner);

  let unknownArmed = false;
  const unknownLedger = ownedStore(t, {
    testHooks: {
      afterCommit({ operation, changed }) {
        if (unknownArmed && changed && operation === 'activateGrantFromTrustedRecord') {
          throw new Error('private Promise ambiguity detail');
        }
      },
    },
  });
  const unknownFacilitator = new MockExactZenonFacilitator();
  let unknownVerifierCalls = 0;
  const unknownActivation = activationFor(unknownLedger.store, (...args) => {
    unknownVerifierCalls += 1;
    return unknownFacilitator.settle(...args);
  });
  const unknownOwner = createServiceCreditCompositionOwner({
    store: unknownLedger.store,
    activationOptions: optionsForActivation(unknownActivation),
    execute: () => ({ resultCode: 'service.promise-latch' }),
  });
  const unknownPayment = await paymentFor(unknownOwner);

  function PoisonPromise() {
    throw new Error('global Promise replacement reached');
  }
  const poison = () => { throw new Error('mutable Promise operation reached'); };
  Object.defineProperty(globalThis, 'Promise', { ...promiseDescriptor, value: PoisonPromise });
  Object.defineProperty(NativePromise, 'resolve', { ...resolveDescriptor, value: poison });
  Object.defineProperty(NativePromise, 'reject', { ...rejectDescriptor, value: poison });
  Object.defineProperty(NativePromise.prototype, 'then', { ...thenDescriptor, value: poison });

  let first;
  let second;
  assert.doesNotThrow(() => {
    first = orderedOwner.activateFunding(activationInput(orderedPayment));
    second = orderedOwner.activateFunding(activationInput(orderedPayment));
  });
  assert.equal(Object.getPrototypeOf(first), NativePromise.prototype);
  assert.equal(Object.getPrototypeOf(second), NativePromise.prototype);
  await withinTimeout(started.promise, 'Promise-tampering activation start');
  assert.equal(verifierCalls, 1);
  assert.equal(activeVerifiers, 1);
  release.resolve();
  const firstResult = await withinTimeout(first, 'first Promise-tampering activation');
  const secondResult = await withinTimeout(second, 'second Promise-tampering activation');
  assert.deepEqual(secondResult, firstResult);
  assert.equal(maximumActiveVerifiers, 1);
  assert.equal(verifierCalls, 2);
  assert.equal(orderedFacilitator.records.size, 1);

  unknownArmed = true;
  let unknownError;
  try {
    await withinTimeout(
      unknownOwner.activateFunding(activationInput(unknownPayment)),
      'Promise-tampering outcome-unknown activation',
    );
  } catch (error) {
    unknownError = error;
  }
  assert.equal(unknownError?.code, 'SERVICE_CREDIT_ACTIVATION_OUTCOME_UNKNOWN');
  assert.equal(unknownError?.message, 'SERVICE_CREDIT_ACTIVATION_OUTCOME_UNKNOWN');
  const rejected = unknownOwner.activateFunding(activationInput(unknownPayment));
  assert.equal(Object.getPrototypeOf(rejected), NativePromise.prototype);
  assert.equal(rejected instanceof NativePromise, true);
  let rejectedCode = null;
  await Reflect.apply(nativeThen, rejected, [
    () => { rejectedCode = 'fulfilled'; },
    error => { rejectedCode = error?.code; },
  ]);
  assert.equal(rejectedCode, 'SERVICE_CREDIT_ACTIVATION_OUTCOME_UNKNOWN');
  assert.equal(unknownVerifierCalls, 1);
  restore();
});

test('verifier reentry rejects promptly without blocking ordinary external concurrency', async t => {
  const runDescriptor = Object.getOwnPropertyDescriptor(AsyncLocalStorage.prototype, 'run');
  const getStoreDescriptor = Object.getOwnPropertyDescriptor(
    AsyncLocalStorage.prototype,
    'getStore',
  );
  const restore = () => {
    Object.defineProperty(AsyncLocalStorage.prototype, 'run', runDescriptor);
    Object.defineProperty(AsyncLocalStorage.prototype, 'getStore', getStoreDescriptor);
  };
  t.after(restore);

  const ledger = ownedStore(t);
  const facilitator = new MockExactZenonFacilitator();
  let owner;
  let reentryInput;
  let verifierCalls = 0;
  let nestedPromise;
  let nestedOutcome;
  const activation = activationFor(ledger.store, async (...args) => {
    verifierCalls += 1;
    if (verifierCalls === 1) {
      nestedPromise = owner.activateFunding(reentryInput);
      const observedNested = Reflect.apply(Promise.prototype.then, nestedPromise, [
        () => ({ state: 'fulfilled' }),
        error => ({ state: 'rejected', code: error?.code }),
      ]);
      nestedOutcome = await withinTimeout(
        observedNested,
        'reentrant activation rejection',
        250,
      );
    }
    return facilitator.settle(...args);
  });
  owner = createServiceCreditCompositionOwner({
    store: ledger.store,
    activationOptions: optionsForActivation(activation),
    execute: () => ({ resultCode: 'service.reentry' }),
  });
  const payment = await paymentFor(owner);
  reentryInput = activationInput(payment);

  const poison = () => { throw new Error('mutable async-context method reached'); };
  Object.defineProperty(AsyncLocalStorage.prototype, 'run', {
    ...runDescriptor,
    value: poison,
  });
  Object.defineProperty(AsyncLocalStorage.prototype, 'getStore', {
    ...getStoreDescriptor,
    value: poison,
  });
  const outer = await withinTimeout(
    owner.activateFunding(reentryInput),
    'outer activation after reentry rejection',
  );
  if (nestedPromise) {
    try { await withinTimeout(nestedPromise, 'nested activation rejection'); } catch {}
  }
  restore();

  assert.match(outer.grant.grantId, /^grant_[0-9a-f]{64}$/);
  assert.deepEqual(nestedOutcome, {
    state: 'rejected',
    code: 'SERVICE_CREDIT_COMPOSITION_REENTRANT_ACTIVATION',
  });
  assert.equal(verifierCalls, 1);
  assert.equal(facilitator.records.size, 1);
  assert.equal(ledger.store.getMetadata().revision, 2);
});

test('cross-owner verifier reentry rejects before a distinct owner can form a queue cycle', async t => {
  const firstLedger = ownedStore(t);
  const secondLedger = ownedStore(t);
  const firstFacilitator = new MockExactZenonFacilitator();
  const secondFacilitator = new MockExactZenonFacilitator();
  let firstOwner;
  let secondOwner;
  let firstInput;
  let secondInput;
  let firstVerifierCalls = 0;
  let secondVerifierCalls = 0;
  let crossOwnerOutcome;
  let cycleOutcome;
  let queuedCycle;

  const firstActivation = activationFor(firstLedger.store, async (...args) => {
    firstVerifierCalls += 1;
    if (firstVerifierCalls === 1) {
      const nested = secondOwner.activateFunding(secondInput);
      const observed = TEST_REFLECT_APPLY(TEST_PROMISE_THEN, nested, [
        () => ({ state: 'fulfilled' }),
        error => ({ state: 'rejected', code: error?.code }),
      ]);
      crossOwnerOutcome = await withinTimeout(
        observed,
        'cross-owner reentrant activation',
        500,
      );
    }
    return firstFacilitator.settle(...args);
  });
  const secondActivation = activationFor(secondLedger.store, async (...args) => {
    secondVerifierCalls += 1;
    if (secondVerifierCalls === 1) {
      queuedCycle = firstOwner.activateFunding(firstInput);
      const observed = TEST_REFLECT_APPLY(TEST_PROMISE_THEN, queuedCycle, [
        () => ({ state: 'fulfilled' }),
        error => ({ state: 'rejected', code: error?.code }),
      ]);
      try {
        cycleOutcome = await withinTimeout(observed, 'cross-owner queue cycle', 150);
      } catch {
        cycleOutcome = { state: 'timeout' };
      }
    }
    return secondFacilitator.settle(...args);
  });
  firstOwner = createServiceCreditCompositionOwner({
    store: firstLedger.store,
    activationOptions: optionsForActivation(firstActivation),
    execute: () => ({ resultCode: 'service.cross-owner-first' }),
  });
  secondOwner = createServiceCreditCompositionOwner({
    store: secondLedger.store,
    activationOptions: optionsForActivation(secondActivation),
    execute: () => ({ resultCode: 'service.cross-owner-second' }),
  });
  const firstPayment = await paymentFor(firstOwner);
  const secondPayment = await paymentFor(secondOwner);
  firstInput = activationInput(firstPayment);
  secondInput = activationInput(secondPayment);

  const outer = await withinTimeout(
    firstOwner.activateFunding(firstInput),
    'outer cross-owner activation',
  );
  if (queuedCycle !== undefined) {
    try { await withinTimeout(queuedCycle, 'drain cross-owner cycle'); } catch {}
  }
  assert.match(outer.grant.grantId, /^grant_[0-9a-f]{64}$/);
  assert.deepEqual(crossOwnerOutcome, {
    state: 'rejected',
    code: 'SERVICE_CREDIT_COMPOSITION_REENTRANT_ACTIVATION',
  });
  assert.equal(cycleOutcome, undefined);
  assert.equal(firstVerifierCalls, 1);
  assert.equal(secondVerifierCalls, 0);
  assert.equal(firstFacilitator.records.size, 1);
  assert.equal(secondFacilitator.records.size, 0);
});

test('replacement admission trusts fresh mutable counters during replay-request interleaving', async t => {
  const callbackStarted = deferred();
  const releaseCallback = deferred();
  let interleaveOnLoad = false;
  let interleaver;
  let completionInput;
  const ledger = ownedStore(t, {
    testHooks: {
      beforeBegin({ operation }) {
        if (interleaveOnLoad && operation === 'load') {
          interleaveOnLoad = false;
          interleaver.completeExecution(completionInput);
        }
      },
    },
  });
  const facilitator = new MockExactZenonFacilitator();
  let verifierCalls = 0;
  const activation = activationFor(ledger.store, async (...args) => {
    verifierCalls += 1;
    return facilitator.settle(...args);
  });
  let executeCalls = 0;
  const owner = createServiceCreditCompositionOwner({
    store: ledger.store,
    activationOptions: optionsForActivation(activation),
    execute: async () => {
      executeCalls += 1;
      if (executeCalls === 1) {
        callbackStarted.resolve();
        await releaseCallback.promise;
      }
      return { resultCode: 'service.replay-counter-race' };
    },
  });
  const payment = await paymentFor(owner);
  const activated = await owner.activateFunding(activationInput(payment));
  const firstSigned = signedServiceRequest(
    payment.capability,
    activated.grant.grantId,
    'request.counter-race-first',
  );
  const firstRequest = exchange(owner.handle, firstSigned.authorization, [
    Buffer.from(firstSigned.authorization, 'utf8'),
  ]);
  await withinTimeout(callbackStarted.promise, 'counter-race callback start');
  interleaver = ServiceCreditSqliteStore.openExisting({
    databasePath: ledger.configuration.databasePath,
    allowedRoot: ledger.configuration.allowedRoot,
    deriveCost: () => FIXED_COST_UNITS,
    now: () => NOW,
  });
  t.after(() => {
    try { interleaver.close(); } catch {}
  });
  completionInput = {
    grantId: activated.grant.grantId,
    requestId: 'request.counter-race-first',
    cachedResult: {
      statusCode: 200,
      contentType: CONTENT_TYPE,
      resultCode: 'service.replay-counter-race',
    },
  };
  interleaveOnLoad = true;
  let replay;
  let replayError;
  try {
    replay = await withinTimeout(
      owner.activateFunding(activationInput(payment)),
      'activation replay racing request completion',
    );
  } catch (error) {
    replayError = error;
  } finally {
    releaseCallback.resolve();
  }
  const firstResponse = await withinTimeout(firstRequest, 'counter-race request completion');
  if (replayError !== undefined) throw replayError;
  assert.equal(firstResponse.statusCode, 200);
  assert.equal(replay.grant.heldUnits, FIXED_COST_UNITS);
  assert.equal(replay.grant.consumedUnits, 0);
  const persisted = ledger.store.getGrant(activated.grant.grantId);
  assert.equal(persisted.heldUnits, 0);
  assert.equal(persisted.consumedUnits, FIXED_COST_UNITS);
  assert.equal(verifierCalls, 2);
  assert.equal(facilitator.records.size, 1);

  const laterSigned = signedServiceRequest(
    payment.capability,
    activated.grant.grantId,
    'request.counter-race-later',
  );
  const later = await exchange(owner.handle, laterSigned.authorization, [
    Buffer.from(laterSigned.authorization, 'utf8'),
  ]);
  assert.equal(later.statusCode, 200);
  assert.equal(executeCalls, 2);
});

test('Promise species mutation cannot bypass serialized activation or fixed rejection', async t => {
  const NativePromise = globalThis.Promise;
  const nativeResolve = NativePromise.resolve;
  const nativeThen = NativePromise.prototype.then;
  const speciesDescriptor = Object.getOwnPropertyDescriptor(NativePromise, Symbol.species);
  const restoreSpecies = () => {
    Object.defineProperty(NativePromise, Symbol.species, speciesDescriptor);
  };
  t.after(restoreSpecies);
  const earlySettled = TEST_REFLECT_APPLY(nativeResolve, NativePromise, [undefined]);
  function EarlySettledSpecies(executor) {
    executor(() => undefined, () => undefined);
    return earlySettled;
  }
  const installHostileSpecies = () => {
    Object.defineProperty(NativePromise, Symbol.species, {
      configurable: true,
      enumerable: speciesDescriptor.enumerable,
      value: EarlySettledSpecies,
      writable: true,
    });
  };

  const orderedLedger = ownedStore(t);
  const orderedFacilitator = new MockExactZenonFacilitator();
  const firstStarted = deferred();
  const releaseFirst = deferred();
  let verifierCalls = 0;
  let activeVerifiers = 0;
  let maximumActiveVerifiers = 0;
  const orderedActivation = activationFor(orderedLedger.store, async (...args) => {
    verifierCalls += 1;
    activeVerifiers += 1;
    maximumActiveVerifiers = Math.max(maximumActiveVerifiers, activeVerifiers);
    try {
      if (verifierCalls === 1) {
        firstStarted.resolve();
        await releaseFirst.promise;
      }
      return await orderedFacilitator.settle(...args);
    } finally {
      activeVerifiers -= 1;
    }
  });
  const orderedOwner = createServiceCreditCompositionOwner({
    store: orderedLedger.store,
    activationOptions: optionsForActivation(orderedActivation),
    execute: () => ({ resultCode: 'service.species-order' }),
  });
  const orderedPayment = await paymentFor(orderedOwner);

  installHostileSpecies();
  const first = orderedOwner.activateFunding(activationInput(orderedPayment));
  const second = orderedOwner.activateFunding(activationInput(orderedPayment));
  restoreSpecies();
  await withinTimeout(firstStarted.promise, 'species first activation start');
  await new TEST_PROMISE(resolve => setImmediate(resolve));
  releaseFirst.resolve();
  const firstResult = await withinTimeout(first, 'species first activation completion');
  const secondResult = await withinTimeout(second, 'species second activation completion');
  assert.deepEqual(secondResult, firstResult);
  assert.equal(verifierCalls, 2);
  assert.equal(maximumActiveVerifiers, 1);
  assert.equal(orderedFacilitator.records.size, 1);

  let unknownArmed = false;
  const unknownLedger = ownedStore(t, {
    testHooks: {
      afterCommit({ operation, changed }) {
        if (unknownArmed && changed && operation === 'activateGrantFromTrustedRecord') {
          throw new Error('private species ambiguity detail');
        }
      },
    },
  });
  const unknownFacilitator = new MockExactZenonFacilitator();
  let unknownVerifierCalls = 0;
  const unknownActivation = activationFor(unknownLedger.store, (...args) => {
    unknownVerifierCalls += 1;
    return unknownFacilitator.settle(...args);
  });
  const unknownOwner = createServiceCreditCompositionOwner({
    store: unknownLedger.store,
    activationOptions: optionsForActivation(unknownActivation),
    execute: () => ({ resultCode: 'service.species-latch' }),
  });
  const unknownPayment = await paymentFor(unknownOwner);
  unknownArmed = true;
  await expectCode(
    () => unknownOwner.activateFunding(activationInput(unknownPayment)),
    'SERVICE_CREDIT_ACTIVATION_OUTCOME_UNKNOWN',
  );

  installHostileSpecies();
  const rejected = unknownOwner.activateFunding(activationInput(unknownPayment));
  restoreSpecies();
  assert.equal(Object.getPrototypeOf(rejected), NativePromise.prototype);
  let rejectedCode;
  await TEST_REFLECT_APPLY(nativeThen, rejected, [
    () => { rejectedCode = 'fulfilled'; },
    error => { rejectedCode = error?.code; },
  ]);
  assert.equal(rejectedCode, 'SERVICE_CREDIT_ACTIVATION_OUTCOME_UNKNOWN');
  assert.equal(unknownVerifierCalls, 1);
});

test('owner construction rejects external and mixed activation authority', t => {
  const firstLedger = ownedStore(t);
  const secondLedger = ownedStore(t);
  const facilitator = new MockExactZenonFacilitator();
  const externalActivation = activationFor(
    firstLedger.store,
    facilitator.settle.bind(facilitator),
  );
  const activationOptions = {
    verifySettlement: facilitator.settle.bind(facilitator),
    authorityProfile: authorityProfile(),
    now: () => NOW,
  };
  const execute = () => ({ resultCode: 'service.internal-activation' });
  const invalidCode = 'SERVICE_CREDIT_COMPOSITION_INVALID_CONFIGURATION';

  expectSynchronousCode(
    () => createServiceCreditCompositionOwner({
      store: secondLedger.store,
      activation: externalActivation,
      execute,
    }),
    invalidCode,
  );
  expectSynchronousCode(
    () => createServiceCreditCompositionOwner({
      store: firstLedger.store,
      activation: externalActivation,
      activationOptions,
      execute,
    }),
    invalidCode,
  );
  const owner = createServiceCreditCompositionOwner({
    store: firstLedger.store,
    activationOptions,
    execute,
  });
  assert.deepEqual(Reflect.ownKeys(owner), [
    'createFundingResource',
    'activateFunding',
    'handle',
  ]);
  assert.equal(facilitator.records.size, 0);
});

test('captured activation-error identity and Set membership preserve outcome-unknown latching', async t => {
  const setHasDescriptor = Object.getOwnPropertyDescriptor(Set.prototype, 'has');
  const hasInstanceDescriptor = Object.getOwnPropertyDescriptor(
    ServiceCreditActivationError,
    Symbol.hasInstance,
  );
  const restore = () => {
    Object.defineProperty(Set.prototype, 'has', setHasDescriptor);
    if (hasInstanceDescriptor === undefined) {
      delete ServiceCreditActivationError[Symbol.hasInstance];
    } else {
      Object.defineProperty(
        ServiceCreditActivationError,
        Symbol.hasInstance,
        hasInstanceDescriptor,
      );
    }
  };
  t.after(restore);
  const cases = [
    { name: 'class identity override', hasInstance: () => false },
    { name: 'Set membership override', hasInstance: () => true },
  ];

  for (const entry of cases) {
    await t.test(entry.name, async t => {
      let armed = false;
      const ledger = ownedStore(t, {
        testHooks: {
          afterCommit({ operation, changed }) {
            if (armed && changed && operation === 'activateGrantFromTrustedRecord') {
              throw new Error('private classifier ambiguity detail');
            }
          },
        },
      });
      const facilitator = new MockExactZenonFacilitator();
      let verifierCalls = 0;
      const activation = activationFor(ledger.store, (...args) => {
        verifierCalls += 1;
        return facilitator.settle(...args);
      });
      const owner = createServiceCreditCompositionOwner({
        store: ledger.store,
        activationOptions: optionsForActivation(activation),
        execute: () => ({ resultCode: 'service.classifier-latch' }),
      });
      const payment = await paymentFor(owner);
      const originalSetHas = setHasDescriptor.value;
      Object.defineProperty(Set.prototype, 'has', {
        ...setHasDescriptor,
        value(value) {
          if (
            entry.name === 'Set membership override'
            && value === 'SERVICE_CREDIT_ACTIVATION_OUTCOME_UNKNOWN'
          ) {
            return false;
          }
          return TEST_REFLECT_APPLY(originalSetHas, this, [value]);
        },
      });
      Object.defineProperty(ServiceCreditActivationError, Symbol.hasInstance, {
        configurable: true,
        value: entry.hasInstance,
      });
      armed = true;
      await expectCode(
        () => owner.activateFunding(activationInput(payment)),
        'SERVICE_CREDIT_ACTIVATION_OUTCOME_UNKNOWN',
        'private classifier ambiguity detail',
      );
      restore();
      await expectCode(
        () => owner.activateFunding(activationInput(payment)),
        'SERVICE_CREDIT_ACTIVATION_OUTCOME_UNKNOWN',
      );
      assert.equal(verifierCalls, 1);
    });
  }
});

test('captured Object authority intrinsics preserve freezing and outcome-unknown latching', async t => {
  const freezeDescriptor = Object.getOwnPropertyDescriptor(Object, 'freeze');
  const hasOwnDescriptor = Object.getOwnPropertyDescriptor(Object, 'hasOwn');
  const isFrozenDescriptor = Object.getOwnPropertyDescriptor(Object, 'isFrozen');
  const originalFreeze = freezeDescriptor.value;
  const originalHasOwn = hasOwnDescriptor.value;
  const originalIsFrozen = isFrozenDescriptor.value;
  const restore = () => {
    Object.defineProperty(Object, 'freeze', freezeDescriptor);
    Object.defineProperty(Object, 'hasOwn', hasOwnDescriptor);
    Object.defineProperty(Object, 'isFrozen', isFrozenDescriptor);
  };
  t.after(restore);
  let compositionFreezeCalls = 0;
  let compositionHasOwnCalls = 0;
  let compositionIsFrozenCalls = 0;
  let activationOptions;
  let execute;

  Object.defineProperty(Object, 'freeze', {
    ...freezeDescriptor,
    value(value) {
      let keys = [];
      try { keys = Reflect.ownKeys(value); } catch {}
      if (
        keys.length === 5
        && ['load', 'reserveRequest', 'beginExecution', 'completeExecution', 'markOutcomeUnknown']
          .every(key => keys.includes(key))
      ) {
        compositionFreezeCalls += 1;
      }
      if (
        keys.length === 3
        && ['createFundingResource', 'activateFunding', 'handle']
          .every(key => keys.includes(key))
      ) {
        compositionFreezeCalls += 1;
      }
      return TEST_REFLECT_APPLY(originalFreeze, Object, [value]);
    },
  });
  Object.defineProperty(Object, 'hasOwn', {
    ...hasOwnDescriptor,
    value(value, key) {
      if (key === 'value' && (value?.value === activationOptions || value?.value === execute)) {
        compositionHasOwnCalls += 1;
      }
      return TEST_REFLECT_APPLY(originalHasOwn, Object, [value, key]);
    },
  });
  Object.defineProperty(Object, 'isFrozen', {
    ...isFrozenDescriptor,
    value(value) {
      let keys = [];
      try { keys = Reflect.ownKeys(value); } catch {}
      if (keys.length === 2 && keys.includes('activation') && keys.includes('grant')) {
        compositionIsFrozenCalls += 1;
      }
      return TEST_REFLECT_APPLY(originalIsFrozen, Object, [value]);
    },
  });

  let armed = false;
  const ledger = ownedStore(t, {
    testHooks: {
      afterCommit({ operation, changed }) {
        if (armed && changed && operation === 'activateGrantFromTrustedRecord') {
          throw new Error('private Object intrinsic ambiguity detail');
        }
      },
    },
  });
  const facilitator = new MockExactZenonFacilitator();
  const activation = activationFor(
    ledger.store,
    facilitator.settle.bind(facilitator),
  );
  activationOptions = {
    verifySettlement: facilitator.settle.bind(facilitator),
    authorityProfile: authorityProfile(),
    now: () => NOW,
  };
  execute = () => ({ resultCode: 'service.object-intrinsics' });
  const owner = createServiceCreditCompositionOwner({
    store: ledger.store,
    activationOptions,
    execute,
  });
  assert.equal(originalIsFrozen(owner), true);
  assert.equal(originalIsFrozen(owner.createFundingResource), true);
  assert.equal(originalIsFrozen(owner.activateFunding), true);
  assert.equal(originalIsFrozen(owner.handle), true);
  const payment = await paymentFor(owner);
  armed = true;
  await expectCode(
    () => owner.activateFunding(activationInput(payment)),
    'SERVICE_CREDIT_ACTIVATION_OUTCOME_UNKNOWN',
    'private Object intrinsic ambiguity detail',
  );
  restore();
  await expectCode(
    () => owner.activateFunding(activationInput(payment)),
    'SERVICE_CREDIT_ACTIVATION_OUTCOME_UNKNOWN',
  );
  assert.equal(compositionFreezeCalls, 0);
  assert.equal(compositionHasOwnCalls, 0);
  assert.equal(compositionIsFrozenCalls, 0);
});
