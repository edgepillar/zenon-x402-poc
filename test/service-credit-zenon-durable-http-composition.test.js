import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createZenonDurableHttpComposition,
  ZenonDurableHttpCompositionError,
} from '../src/service-credit-zenon-durable-http-composition.js';
import { createZenonFundingComposition } from '../src/service-credit-zenon-funding-composition.js';
import { createZenonFundingEvidenceActivation } from '../src/service-credit-zenon-funding-evidence.js';
import {
  createZenonFundingObserverState,
  ZENON_FUNDING_OBSERVER_STATUS,
} from '../src/service-credit-zenon-funding-observer-state.js';
import {
  createZenonFundingObserverSqliteStore,
  openZenonFundingObserverSqliteStore,
  ZenonFundingObserverSqliteStore,
} from '../src/service-credit-zenon-funding-observer-sqlite-store.js';
import {
  createZenonFundingProviderAttestationSigningBytes,
  parseZenonFundingProviderAttestationAuthorityRecord,
} from '../src/service-credit-zenon-funding-provider-attestation.js';
import { deriveServiceCreditResourceBinding } from '../src/service-credit-activation.js';
import {
  createServiceCreditCapabilitySigningBytes,
  deriveServiceCreditCapabilityCommitment,
} from '../src/service-credit-capability.js';
import { SERVICE_CREDIT_HTTP_PATH, SERVICE_CREDIT_HTTP_ROUTE_ID } from '../src/service-credit-http.js';
import { SERVICE_CREDIT_MODEL_VERSION } from '../src/service-credit-model.js';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';

const NOW = 2_000_000_000_000;
const ATTESTATION_NOW = 2_000_000_000;
const INITIAL_HEIGHT = 10;
const INITIAL_HASH = createHash('sha256').update('runtime-bootstrap').digest('hex');
const TRANSACTION_HASH = createHash('sha256').update('runtime-transaction').digest('hex');
const RESOURCE_URL = 'https://service.example/credits/zenon-fund';
const EMPTY_BODY_DIGEST = `sha256:${createHash('sha256').update(Buffer.alloc(0)).digest('hex')}`;
const EXECUTION = Object.freeze({
  ledgerId: 'ledger.zenon.runtime',
  policy: Object.freeze({
    policyId: 'execution.zenon.runtime',
    policyVersion: 1,
    maxDurationMs: 1_000,
  }),
  capacity: 8,
  selectedDurationMs: 1_000,
});
const CHAIN_PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '12345',
  genesisMomentumHash: createHash('sha256').update('runtime-genesis').digest('hex'),
});

function digest(label) {
  return `sha256:${createHash('sha256').update(`runtime:${label}`).digest('hex')}`;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function commitment(domain, value) {
  return `sha256:${createHash('sha256').update(domain).update('\0')
    .update(canonicalJson(value)).digest('hex')}`;
}

function keys() {
  const pair = generateKeyPairSync('ed25519');
  const spki = pair.publicKey.export({ format: 'der', type: 'spki' });
  return { privateKey: pair.privateKey, publicKey: spki.subarray(-32).toString('base64url') };
}

const PROVIDER_KEYS = keys();
const CAPABILITY_KEYS = keys();
const AUTHORITY_RECORD_TEXT = canonicalJson({
  authorityRecordVersion: 1,
  authorityProfileId: 'zenon.provider-attestation',
  authorityProfileVersion: 1,
  verifierVersion: 1,
  providerAuthorityId: 'provider.reference',
  generationId: 'provider.attestation.generation',
  generationVersion: 1,
  keyId: 'provider.attestation.key',
  algorithm: 'Ed25519',
  publicKey: PROVIDER_KEYS.publicKey,
  network: 'zenon:testnet',
  chainProfile: CHAIN_PROFILE,
  observerPolicy: {
    policyId: 'zenon.injected-observer', policyVersion: 1, verifierVersion: 1,
  },
  confirmationPolicy: {
    policyId: 'zenon.authenticated-momentum-inclusion',
    policyVersion: 1,
    minimumConfirmations: 3,
  },
  bootstrapCheckpoint: { height: INITIAL_HEIGHT, hash: INITIAL_HASH },
  sourcePolicyCommitment: digest('source-policy'),
  maximumAttestationBytes: 4096,
  maximumCanonicalBytes: 524288,
  maximumInitialAgeSeconds: 300,
  maximumFutureSkewSeconds: 5,
  maximumValiditySeconds: 300,
});
const AUTHORITY = parseZenonFundingProviderAttestationAuthorityRecord(AUTHORITY_RECORD_TEXT);

function privateDirectoryFor(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'zenon-runtime-')));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function offer() {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.reference',
    serviceId: 'service.reference',
    resourceId: 'resource.zenon.funding',
    resourceBinding: deriveServiceCreditResourceBinding({
      resourceId: 'resource.zenon.funding', resourceUrl: RESOURCE_URL,
    }),
    offerId: 'offer.zenon.reference',
    offerVersion: 1,
    costPolicyId: 'cost.fixed',
    fundingPolicyId: 'funding.exact.zenon.observer',
    fundingPolicyVersion: 1,
  };
}

function fundingTerms(input) {
  return {
    fundingPolicyId: input.offer.fundingPolicyId,
    fundingPolicyVersion: input.offer.fundingPolicyVersion,
    totalUnits: 10,
    expiresAt: NOW + 60_000,
    requirement: {
      scheme: 'exact', network: 'zenon:testnet', asset: 'zts1syntheticasset',
      amount: '7', payTo: 'z1syntheticpayee', maxTimeoutSeconds: 30,
      extra: {
        paymentFlow: 'upfront', poc: true, settlement: 'account-block',
        zenonChain: structuredClone(AUTHORITY.chainProfile),
        minimumMomentumConfirmations: AUTHORITY.confirmationPolicy.minimumConfirmations,
      },
    },
  };
}

function selection() {
  return {
    offerId: 'offer.zenon.reference', offerVersion: 1, holderId: 'z1syntheticpayer',
    capabilityCommitment: deriveServiceCreditCapabilityCommitment({
      publicKey: CAPABILITY_KEYS.publicKey,
    }),
  };
}

function challenge(store) {
  const activation = createZenonFundingEvidenceActivation({
    store,
    deriveFundingTerms: fundingTerms,
    verifyFundingEvidence: async () => { throw new Error('unused'); },
    authorityProfile: structuredClone(AUTHORITY.authorityProfile),
    now: () => NOW,
  });
  return activation.createFundingResource({ selection: selection(), resourceUrl: RESOURCE_URL });
}

function target(prepared) {
  const accepted = prepared.paymentRequired.accepts[0];
  const tags = prepared.paymentRequired.resource.tags;
  return {
    transactionId: `zenontx:${TRANSACTION_HASH}`,
    payer: prepared.activationIntent.holderId,
    payee: accepted.payTo,
    asset: accepted.asset,
    amount: accepted.amount,
    scheme: accepted.scheme,
    paymentFlow: accepted.extra.paymentFlow,
    settlement: accepted.extra.settlement,
    network: accepted.network,
    providerId: prepared.activationIntent.providerId,
    serviceId: prepared.activationIntent.serviceId,
    resourceId: prepared.activationIntent.resourceId,
    resourceBinding: offer().resourceBinding,
    paymentResourceDigest: commitment(
      'zenon-x402-service-credit-payment-resource-v1', prepared.paymentRequired.resource,
    ),
    paymentRequirementDigest: commitment(
      'zenon-x402-service-credit-payment-requirement-v1', accepted,
    ),
    paymentIntentDigest: `sha256:${createHash('sha256').update(canonicalJson({
      x402Version: prepared.paymentRequired.x402Version,
      resource: prepared.paymentRequired.resource,
      accepted,
    })).digest('hex')}`,
    offerId: prepared.activationIntent.offerId,
    offerVersion: prepared.activationIntent.offerVersion,
    fundingPolicyId: offer().fundingPolicyId,
    fundingPolicyVersion: offer().fundingPolicyVersion,
    capabilityCommitment: prepared.activationIntent.capabilityCommitment,
    totalUnits: prepared.activationIntent.totalUnits,
    expiresAt: prepared.activationIntent.expiresAt,
    grantFundingCommitment: `sha256:${tags[1]}${tags[2]}`,
  };
}

function initialObserverState(prepared) {
  return createZenonFundingObserverState({
    observerPolicy: structuredClone(AUTHORITY.observerPolicy),
    authorityGeneration: structuredClone(AUTHORITY.authorityGeneration),
    chainProfile: structuredClone(AUTHORITY.chainProfile),
    confirmationPolicy: structuredClone(AUTHORITY.confirmationPolicy),
    target: target(prepared),
    checkpoint: structuredClone(AUTHORITY.bootstrapCheckpoint),
    catchUp: { maximumPageEntries: 4, maximumBackfillSpan: 8, maximumMembersPerMomentum: 4 },
  });
}

function momentumHash(height) {
  return createHash('sha256').update(`runtime-momentum-${height}`).digest('hex');
}

function reachThreshold(store) {
  const before = store.load().state;
  const frontier = { height: INITIAL_HEIGHT + 3, hash: momentumHash(INITIAL_HEIGHT + 3) };
  const planned = store.planBackfill({ expectedRevision: before.revision, frontier });
  let previousHash = planned.plan.startCheckpoint.hash;
  const momentums = [];
  for (let height = planned.plan.fromHeight; height <= planned.plan.throughHeight; height += 1) {
    const hash = momentumHash(height);
    momentums.push({
      height, hash, previousHash,
      members: height === INITIAL_HEIGHT + 1
        ? [{ transactionId: before.target.transactionId, targetBindingDigest: before.targetBindingDigest }]
        : [],
    });
    previousHash = hash;
  }
  const advanced = store.applyPage({ expectedRevision: before.revision, plan: planned.plan, momentums });
  const receipt = advanced.state.catchUp.lastAppliedPage;
  const observed = store.applyInclusion({
    expectedRevision: advanced.state.revision,
    target: structuredClone(advanced.state.target),
    observation: {
      status: 'FOUND', transactionId: advanced.state.target.transactionId,
      targetBindingDigest: advanced.state.targetBindingDigest,
      momentumHeight: receipt.targetMembership.momentumHeight,
      momentumHash: receipt.targetMembership.momentumHash,
      pageDigest: receipt.pageDigest,
    },
  });
  assert.equal(observed.state.status, ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED);
  return observed;
}

function envelope(request, overrides = {}) {
  const issuedAt = overrides.issuedAt ?? ATTESTATION_NOW;
  const validUntil = overrides.validUntil ?? issuedAt + 120;
  const bytes = createZenonFundingProviderAttestationSigningBytes({ request, issuedAt, validUntil });
  return {
    envelopeVersion: 1, attestationId: request.attestationId, keyId: AUTHORITY.keyId,
    issuedAt, validUntil,
    signature: sign(null, bytes, PROVIDER_KEYS.privateKey).toString('base64url'),
  };
}

function moveObserver(store, stage) {
  if (stage === 'NONE') return null;
  const threshold = reachThreshold(store);
  const request = store.peekPreparedAttestation();
  if (stage === 'PREPARED') return { threshold, request };
  store.commitAuthenticatedEnvelope({
    expectedObserverRevision: threshold.state.revision,
    expectedOutboxRevision: 1,
    attestationId: request.attestationId,
    envelope: envelope(request),
    nowEpochSeconds: ATTESTATION_NOW,
  });
  if (stage === 'READY') return { threshold, request };
  if (stage === 'INVALIDATED') {
    const state = store.load().state;
    store.planBackfill({
      expectedRevision: state.revision,
      frontier: { height: state.checkpoint.height, hash: digest('replacement').slice(7) },
    });
    return { threshold, request };
  }
  if (stage === 'EQUIVOCATED') {
    store.commitAuthenticatedEnvelope({
      expectedObserverRevision: threshold.state.revision,
      expectedOutboxRevision: 2,
      attestationId: request.attestationId,
      envelope: envelope(request, { issuedAt: ATTESTATION_NOW + 1, validUntil: ATTESTATION_NOW + 121 }),
      nowEpochSeconds: ATTESTATION_NOW + 1,
    });
    return { threshold, request };
  }
  throw new Error('unknown stage');
}

function deadlineRuntime() {
  return {
    monotonicNowNs: () => 0n,
    schedule: () => Object.freeze({}),
    cancel: () => undefined,
  };
}

function fixture(t, overrides = {}) {
  const directory = privateDirectoryFor(t);
  const serviceConfiguration = {
    databasePath: join(directory, 'service.sqlite'), allowedRoot: directory,
    deriveCost: () => 2, now: () => NOW,
    ...(overrides.maxRequests === undefined ? {} : { maxRequests: overrides.maxRequests }),
    ...(overrides.serviceHooks === undefined ? {} : { testHooks: overrides.serviceHooks }),
  };
  const serviceOpenConfiguration = {
    databasePath: serviceConfiguration.databasePath, allowedRoot: directory,
    deriveCost: () => 2, now: () => NOW,
    ...(overrides.maxRequests === undefined ? {} : { maxRequests: overrides.maxRequests }),
  };
  const serviceStore = ServiceCreditSqliteStore.create(serviceConfiguration);
  serviceStore.registerOffer(offer());
  const prepared = challenge(serviceStore);
  const observerConfiguration = {
    databasePath: join(directory, 'observer.sqlite'), allowedRoot: directory,
    initialState: initialObserverState(prepared), authorityRecord: AUTHORITY_RECORD_TEXT,
  };
  const observerStore = createZenonFundingObserverSqliteStore(observerConfiguration);
  const stage = overrides.stage ?? 'READY';
  const stageResult = moveObserver(observerStore, stage);
  const context = {
    directory, serviceOpenConfiguration, observerConfiguration, prepared,
    serviceStore, observerStore, observerRecordKey: observerStore.load().recordKey,
    stageResult, owner: null,
  };
  context.options = {
    serviceCreditStore: serviceStore,
    fundingObserverStore: observerStore,
    authorityRecord: AUTHORITY_RECORD_TEXT,
    deriveFundingTerms: overrides.deriveFundingTerms ?? fundingTerms,
    now: overrides.now ?? (() => NOW),
    durableExecution: structuredClone(overrides.durableExecution ?? EXECUTION),
    execute: overrides.execute ?? (() => ({ resultCode: 'runtime.resource.delivered' })),
    deadlineRuntime: overrides.deadlineRuntime ?? deadlineRuntime(),
  };
  if (overrides.createOwner ?? stage === 'READY') {
    context.owner = createZenonDurableHttpComposition(context.options);
  }
  t.after(async () => {
    try { await context.owner?.close(); } catch {}
    try { context.observerStore?.close(); } catch {}
    try { context.serviceStore?.close(); } catch {}
  });
  return context;
}

function reopen(context, overrides = {}) {
  context.serviceStore = ServiceCreditSqliteStore.openExisting(context.serviceOpenConfiguration);
  context.observerStore = openZenonFundingObserverSqliteStore({
    databasePath: context.observerConfiguration.databasePath,
    allowedRoot: context.directory,
    expectedRecordKey: context.observerRecordKey,
    authorityRecord: AUTHORITY_RECORD_TEXT,
  });
  context.options = {
    ...context.options,
    serviceCreditStore: context.serviceStore,
    fundingObserverStore: context.observerStore,
    ...overrides,
  };
  context.owner = createZenonDurableHttpComposition(context.options);
  return context.owner;
}

function activationInput(context) {
  return {
    intent: structuredClone(context.prepared.activationIntent),
    paymentRequired: structuredClone(context.prepared.paymentRequired),
  };
}

function requestDescription(grantId, requestId) {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION, grantId, requestId, method: 'POST',
    routeId: SERVICE_CREDIT_HTTP_ROUTE_ID, canonicalBodyDigest: EMPTY_BODY_DIGEST,
    selectedContentType: 'application/json', maxCostUnits: 2,
  };
}

function authorization(request) {
  const proof = {
    proofVersion: 1, grantId: request.grantId, requestId: request.requestId,
    publicKey: CAPABILITY_KEYS.publicKey, maxCostUnits: request.maxCostUnits,
    signature: sign(null, createServiceCreditCapabilitySigningBytes(request), CAPABILITY_KEYS.privateKey)
      .toString('base64url'),
  };
  return `ServiceCredit ${Buffer.from(canonicalJson(proof), 'utf8').toString('base64url')}`;
}

function exchange(handle, auth) {
  const request = Object.freeze({
    url: SERVICE_CREDIT_HTTP_PATH, method: 'POST',
    rawHeaders: Object.freeze(['Authorization', auth, 'Content-Length', '0']),
  });
  const headers = Object.create(null);
  let body;
  const response = {
    destroyed: false, writableEnded: false, statusCode: 0,
    setHeader(name, value) { headers[String(name).toLowerCase()] = String(value); },
    end(value) { this.writableEnded = true; body = Buffer.from(value); },
    destroy() { this.destroyed = true; },
  };
  return handle(request, response).then(() => ({ statusCode: response.statusCode, headers, body }));
}

function expectCode(operation, code) {
  assert.throws(operation, error => {
    assert.equal(error instanceof ZenonDurableHttpCompositionError, true);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.equal(error.stack, `ZenonDurableHttpCompositionError: ${code}`);
    return true;
  });
}

async function expectCodeAsync(operation, code) {
  await assert.rejects(Promise.resolve().then(operation), error => {
    assert.equal(error instanceof ZenonDurableHttpCompositionError, true);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.equal(error.stack, `ZenonDurableHttpCompositionError: ${code}`);
    return true;
  });
}

test('import is inert and production source has no active or private-key capability', () => {
  const source = readFileSync(new URL('../src/service-credit-zenon-durable-http-composition.js', import.meta.url), 'utf8');
  for (const forbidden of [
    'node:fs', 'node:net', 'node:http', 'node:https', 'WebSocket', 'privateKey',
    'createServer(', '.listen(', 'process.env', 'generateKeyPair', 'sign(',
    'commitAuthenticatedEnvelope', 'peekPreparedAttestation', 'markConsumed',
  ]) assert.equal(source.includes(forbidden), false);
});

test('READY construction is read-only and exposes only the frozen lifecycle surface', t => {
  const context = fixture(t);
  assert.deepEqual(Reflect.ownKeys(context.owner), ['start', 'handle', 'close']);
  assert.equal(Object.isFrozen(context.owner), true);
  assert.equal(context.serviceStore.load().state.grants.length, 0);
  assert.equal(context.serviceStore.getDurableExecutionSnapshot().executionState, null);
  for (const key of ['serviceCreditStore', 'fundingObserverStore', 'authorityRecord', 'outbox', 'matcher', 'verifier', 'grant', 'session']) {
    assert.equal(Object.hasOwn(context.owner, key), false);
  }
});

test('construction invokes no provider, clock, application, deadline, or scheduling callback', t => {
  const calls = { policy: 0, now: 0, execute: 0, monotonic: 0, schedule: 0, cancel: 0 };
  const context = fixture(t, {
    deriveFundingTerms(input) { calls.policy += 1; return fundingTerms(input); },
    now() { calls.now += 1; return NOW; },
    execute() { calls.execute += 1; return { resultCode: 'unexpected' }; },
    deadlineRuntime: {
      monotonicNowNs() { calls.monotonic += 1; return 0n; },
      schedule() { calls.schedule += 1; return Object.freeze({}); },
      cancel() { calls.cancel += 1; },
    },
  });
  assert.notEqual(context.owner, null);
  assert.deepEqual(calls, { policy: 0, now: 0, execute: 0, monotonic: 0, schedule: 0, cancel: 0 });
});

test('NONE, PREPARED, INVALIDATED, and EQUIVOCATED reject before ledger mutation', async t => {
  for (const stage of ['NONE', 'PREPARED', 'INVALIDATED', 'EQUIVOCATED']) {
    await t.test(stage, t => {
      const context = fixture(t, { stage, createOwner: false });
      const before = context.serviceStore.load();
      expectCode(
        () => createZenonDurableHttpComposition(context.options),
        'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_NOT_READY',
      );
      assert.deepEqual(context.serviceStore.load(), before);
    });
  }
});

test('READY startup drives listener-free HTTP replay and restart without duplicate debit', async t => {
  let calls = 0;
  const context = fixture(t, { execute: () => { calls += 1; return { resultCode: 'runtime.resource.delivered' }; } });
  const readyBefore = canonicalJson(context.observerStore.projectCommittedFundingEvidence());
  assert.deepEqual(await context.owner.start(activationInput(context)), { status: 'ACTIVE' });
  const grantId = context.serviceStore.load().state.grants[0].grantId;
  const requestA = requestDescription(grantId, 'request.runtime.a');
  const first = await exchange(context.owner.handle, authorization(requestA));
  const afterFirst = context.serviceStore.load();
  const replay = await exchange(context.owner.handle, authorization(requestA));
  assert.equal(first.statusCode, 200);
  assert.deepEqual(replay.body, first.body);
  assert.deepEqual(context.serviceStore.load(), afterFirst);
  assert.equal(calls, 1);
  await context.owner.close();
  context.owner = null;
  reopen(context, { execute: () => { calls += 1; return { resultCode: 'runtime.resource.delivered' }; } });
  assert.deepEqual(await context.owner.start(activationInput(context)), { status: 'ACTIVE' });
  const requestB = requestDescription(grantId, 'request.runtime.b');
  assert.equal((await exchange(context.owner.handle, authorization(requestB))).statusCode, 200);
  assert.equal(calls, 2);
  assert.equal(context.serviceStore.load().state.grants[0].consumedUnits, 4);
  assert.equal(canonicalJson(context.observerStore.projectCommittedFundingEvidence()), readyBefore);
});

test('handle is unavailable before ACTIVE and after CLOSED', async t => {
  const context = fixture(t);
  const before = await exchange(context.owner.handle, 'forbidden');
  assert.equal(before.statusCode, 503);
  assert.deepEqual(JSON.parse(before.body.toString('utf8')), { error: 'service_unavailable' });
  await context.owner.close();
  assert.equal((await exchange(context.owner.handle, 'forbidden')).statusCode, 503);
  await expectCodeAsync(() => context.owner.start(activationInput(context)),
    'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_CLOSED');
});

test('exact concurrent start shares one native Promise; changed input conflicts without a queue', async t => {
  const context = fixture(t);
  const input = activationInput(context);
  const first = context.owner.start(input);
  const replay = context.owner.start(structuredClone(input));
  assert.equal(first, replay);
  assert.equal(Object.getPrototypeOf(first), Promise.prototype);
  const changed = activationInput(context);
  changed.intent.totalUnits += 1;
  expectCode(() => context.owner.start(changed), 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_CONFLICT');
  await first;
  assert.equal(context.owner.start(structuredClone(input)), first);
  assert.equal(context.serviceStore.load().state.grants.length, 1);
});

test('durable execution grammar and hard bounds reject before activation', async t => {
  const invalidConfigurations = [
    { ...EXECUTION, ledgerId: 'ledger://invalid' },
    { ...EXECUTION, ledgerId: 'x'.repeat(129) },
    { ...EXECUTION, capacity: 100_001 },
    { ...EXECUTION, capacity: 0 },
    { ...EXECUTION, selectedDurationMs: 0 },
    { ...EXECUTION, selectedDurationMs: EXECUTION.policy.maxDurationMs + 1 },
    { ...EXECUTION, policy: { ...EXECUTION.policy, policyId: 'policy://invalid' } },
    { ...EXECUTION, policy: { ...EXECUTION.policy, policyVersion: 0 } },
    { ...EXECUTION, policy: { ...EXECUTION.policy, maxDurationMs: 0 } },
  ];
  for (let index = 0; index < invalidConfigurations.length; index += 1) {
    await t.test(`invalid-${index}`, t => {
      const context = fixture(t, { createOwner: false });
      expectCode(() => createZenonDurableHttpComposition({
        ...context.options,
        durableExecution: invalidConfigurations[index],
      }), 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_INVALID_CONFIGURATION');
      assert.equal(context.serviceStore.load().state.grants.length, 0);
      assert.equal(context.serviceStore.getDurableExecutionSnapshot().executionState, null);
    });
  }
});

test('service-store request capacity rejects before grant activation', async t => {
  const context = fixture(t, { maxRequests: 4 });
  await expectCodeAsync(
    () => context.owner.start(activationInput(context)),
    'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_INVALID_CONFIGURATION',
  );
  assert.equal(context.serviceStore.load().state.grants.length, 0);
  assert.equal(context.serviceStore.getDurableExecutionSnapshot().executionState, null);
  assert.equal((await exchange(context.owner.handle, 'forbidden')).statusCode, 503);
});

test('durable configuration is detached before caller aliases can change', async t => {
  const context = fixture(t, { createOwner: false });
  const durableExecution = structuredClone(EXECUTION);
  context.owner = createZenonDurableHttpComposition({
    ...context.options,
    durableExecution,
  });
  durableExecution.ledgerId = 'ledger.changed.after-capture';
  durableExecution.capacity = 1;
  durableExecution.selectedDurationMs = 1;
  durableExecution.policy.policyId = 'policy.changed.after-capture';
  durableExecution.policy.maxDurationMs = 1;
  assert.deepEqual(await context.owner.start(activationInput(context)), { status: 'ACTIVE' });
  const executionState = context.serviceStore.getDurableExecutionSnapshot().executionState;
  assert.equal(executionState.ledgerId, EXECUTION.ledgerId);
  assert.equal(executionState.capacity, EXECUTION.capacity);
  assert.deepEqual(executionState.policy, EXECUTION.policy);
});

test('ordinary pre-activation failure never claims an activated grant', async t => {
  const context = fixture(t, {
    deriveFundingTerms() { throw new Error('synthetic policy failure'); },
  });
  const input = activationInput(context);
  await expectCodeAsync(
    () => context.owner.start(input),
    'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_NOT_READY',
  );
  await expectCodeAsync(
    () => context.owner.start(input),
    'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_NOT_READY',
  );
  assert.equal(context.serviceStore.load().state.grants.length, 0);
  assert.deepEqual(
    context.serviceStore.getDurableExecutionSnapshot().executionState.executions,
    [],
  );
  assert.equal((await exchange(context.owner.handle, 'forbidden')).statusCode, 503);
});

test('payment and chain binding drift fails before grant after harmless preinitialization', async t => {
  const mutations = [
    input => { input.intent.totalUnits += 1; },
    input => { input.intent.offerVersion += 1; },
    input => { input.paymentRequired.accepts[0].amount = '8'; },
    input => { input.paymentRequired.accepts[0].asset = 'zts1changedasset'; },
    input => { input.paymentRequired.accepts[0].payTo = 'z1changedpayee'; },
    input => { input.paymentRequired.resource.url = 'https://service.example/changed'; },
    input => { input.paymentRequired.accepts[0].extra.zenonChain.chainIdentifier = '12346'; },
  ];
  for (let index = 0; index < mutations.length; index += 1) {
    await t.test(`binding-${index}`, async t => {
      const context = fixture(t);
      const input = activationInput(context);
      mutations[index](input);
      await expectCodeAsync(() => context.owner.start(input),
        'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_NOT_READY');
      assert.equal(context.serviceStore.load().state.grants.length, 0);
      const executionState = context.serviceStore.getDurableExecutionSnapshot().executionState;
      assert.equal(executionState.ledgerId, EXECUTION.ledgerId);
      assert.deepEqual(executionState.executions, []);
    });
  }
});

test('late observer invalidation creates no grant and exposes no handler', async t => {
  const context = fixture(t);
  const state = context.observerStore.load().state;
  context.observerStore.planBackfill({
    expectedRevision: state.revision,
    frontier: { height: state.checkpoint.height, hash: digest('late-replacement').slice(7) },
  });
  await expectCodeAsync(() => context.owner.start(activationInput(context)),
    'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_NOT_READY');
  assert.equal(context.serviceStore.load().state.grants.length, 0);
  assert.equal((await exchange(context.owner.handle, 'forbidden')).statusCode, 503);
});

test('invalidation or valid equivocation between READY preflight and matching creates no grant', async t => {
  for (const conflict of ['invalidation', 'equivocation']) {
    await t.test(conflict, async t => {
      let context;
      let armed = false;
      let fired = false;
      const policy = input => {
        const result = fundingTerms(input);
        if (armed && !fired) {
          fired = true;
          const state = context.observerStore.load().state;
          if (conflict === 'invalidation') {
            context.observerStore.planBackfill({
              expectedRevision: state.revision,
              frontier: {
                height: state.checkpoint.height,
                hash: digest('match-race-replacement').slice(7),
              },
            });
          } else {
            context.observerStore.commitAuthenticatedEnvelope({
              expectedObserverRevision: state.revision,
              expectedOutboxRevision: 2,
              attestationId: context.stageResult.request.attestationId,
              envelope: envelope(context.stageResult.request, {
                issuedAt: ATTESTATION_NOW + 1,
                validUntil: ATTESTATION_NOW + 121,
              }),
              nowEpochSeconds: ATTESTATION_NOW + 1,
            });
          }
        }
        return result;
      };
      context = fixture(t, { deriveFundingTerms: policy });
      armed = true;
      await expectCodeAsync(() => context.owner.start(activationInput(context)),
        'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_NOT_READY');
      assert.equal(fired, true);
      assert.equal(context.serviceStore.load().state.grants.length, 0);
      assert.deepEqual(
        context.serviceStore.getDurableExecutionSnapshot().executionState.executions,
        [],
      );
    });
  }
});

for (const scenario of [
  {
    name: 'activation commit ambiguity',
    operation: 'activateGrantFromTrustedRecord',
    phase: 'afterCommit',
    code: 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_RECOVERY_REQUIRED',
  },
  {
    name: 'initialization pre-commit failure',
    operation: 'initializeDurableExecution',
    phase: 'beforeCommit',
    code: 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_PRE_ACTIVATION_UNAVAILABLE',
  },
  {
    name: 'initialization commit ambiguity',
    operation: 'initializeDurableExecution',
    phase: 'afterCommit',
    code: 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_RECOVERY_REQUIRED',
  },
]) {
  test(`${scenario.name} exposes no handler and exact reopen converges`, async t => {
    let armed = false;
    const hooks = {
      [scenario.phase]({ operation, changed }) {
        if (armed && changed && operation === scenario.operation) throw new Error('synthetic boundary');
      },
    };
    const context = fixture(t, { serviceHooks: hooks });
    const input = activationInput(context);
    armed = true;
    await expectCodeAsync(() => context.owner.start(input), scenario.code);
    assert.equal((await exchange(context.owner.handle, 'forbidden')).statusCode, 503);
    if (scenario.code === 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_RECOVERY_REQUIRED') {
      await expectCodeAsync(
        () => context.owner.close(),
        'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_RECOVERY_REQUIRED',
      );
    } else {
      await context.owner.close();
    }
    context.owner = null;
    reopen(context);
    assert.deepEqual(await context.owner.start(input), { status: 'ACTIVE' });
    assert.equal(context.serviceStore.load().state.grants.length, 1);
    assert.equal(context.serviceStore.getDurableExecutionSnapshot().executionState.ledgerId, EXECUTION.ledgerId);
  });
}

test('close cannot mask activation or initialization commit ambiguity', async t => {
  for (const operation of ['activateGrantFromTrustedRecord', 'initializeDurableExecution']) {
    await t.test(operation, async t => {
      let context;
      let armed = false;
      let closing = null;
      const hooks = {
        afterCommit({ operation: observed, changed }) {
          if (armed && changed && observed === operation) {
            closing = context.owner.close();
            throw new Error('synthetic boundary');
          }
        },
      };
      context = fixture(t, { serviceHooks: hooks });
      const input = activationInput(context);
      armed = true;
      const starting = context.owner.start(input);
      await expectCodeAsync(
        () => starting,
        'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_RECOVERY_REQUIRED',
      );
      assert.notEqual(closing, null);
      assert.equal(context.owner.close(), closing);
      await expectCodeAsync(
        () => closing,
        'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_RECOVERY_REQUIRED',
      );
      await expectCodeAsync(
        () => context.owner.start(input),
        'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_RECOVERY_REQUIRED',
      );
      assert.equal((await exchange(context.owner.handle, 'forbidden')).statusCode, 503);
      assert.throws(() => context.serviceStore.load());
      assert.throws(() => context.observerStore.load());

      context.owner = null;
      reopen(context);
      assert.deepEqual(await context.owner.start(input), { status: 'ACTIVE' });
      assert.equal(context.serviceStore.load().state.grants.length, 1);
    });
  }
});

test('exact existing durable initialization is reused; changed config rejects', async t => {
  const exact = fixture(t, { createOwner: false });
  exact.serviceStore.initializeDurableExecution({
    expectedRevision: exact.serviceStore.getMetadata().revision,
    ledgerId: EXECUTION.ledgerId, policy: structuredClone(EXECUTION.policy), capacity: EXECUTION.capacity,
  });
  exact.owner = createZenonDurableHttpComposition(exact.options);
  assert.deepEqual(await exact.owner.start(activationInput(exact)), { status: 'ACTIVE' });

  const changed = fixture(t, { createOwner: false });
  changed.serviceStore.initializeDurableExecution({
    expectedRevision: changed.serviceStore.getMetadata().revision,
    ledgerId: 'ledger.changed.runtime', policy: structuredClone(EXECUTION.policy), capacity: EXECUTION.capacity,
  });
  expectCode(() => createZenonDurableHttpComposition(changed.options),
    'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_INVALID_CONFIGURATION');
});

test('unresolved or sealed durable generations reject before runtime ownership', async t => {
  for (const terminal of ['unresolved', 'sealed']) {
    await t.test(terminal, async t => {
      const context = fixture(t, { createOwner: false });
      const funding = createZenonFundingComposition({
        serviceCreditStore: context.serviceStore,
        fundingObserverStore: context.observerStore,
        authorityRecord: AUTHORITY_RECORD_TEXT,
        deriveFundingTerms: fundingTerms,
        now: () => NOW,
      });
      const activated = await funding.activateCommittedFunding(activationInput(context));
      const initialized = context.serviceStore.initializeDurableExecution({
        expectedRevision: context.serviceStore.getMetadata().revision,
        ledgerId: EXECUTION.ledgerId,
        policy: structuredClone(EXECUTION.policy),
        capacity: EXECUTION.capacity,
      });
      const prepared = context.serviceStore.prepareDurableExecution({
        expectedRevision: initialized.revision,
        request: requestDescription(activated.grant.grantId, `request.${terminal}`),
        selectedDurationMs: EXECUTION.selectedDurationMs,
      });
      if (terminal === 'sealed') {
        const fenced = context.serviceStore.persistDurableExecutionFence({
          expectedRevision: prepared.revision,
          executionId: prepared.execution.executionId,
        });
        context.serviceStore.markDurableExecutionUnknown({
          expectedRevision: fenced.revision,
          executionId: fenced.execution.executionId,
          reason: 'LOST_CONTROL',
        });
      }
      expectCode(() => createZenonDurableHttpComposition(context.options),
        'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_INVALID_CONFIGURATION');
    });
  }
});

test('session construction failure after activation is terminal and never silently retries', async t => {
  const runtime = deadlineRuntime();
  let armed = false;
  const policy = input => {
    if (armed) Object.defineProperty(runtime.schedule, 'then', { value() {} });
    return fundingTerms(input);
  };
  const context = fixture(t, { deriveFundingTerms: policy, deadlineRuntime: runtime });
  armed = true;
  await expectCodeAsync(() => context.owner.start(activationInput(context)),
    'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_ACTIVATED_UNAVAILABLE');
  assert.equal(context.serviceStore.load().state.grants.length, 1);
  assert.equal((await exchange(context.owner.handle, 'forbidden')).statusCode, 503);
  await expectCodeAsync(() => context.owner.start(activationInput(context)),
    'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_ACTIVATED_UNAVAILABLE');
  const closing = context.owner.close();
  assert.equal(context.owner.close(), closing);
  await expectCodeAsync(
    () => closing,
    'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_ACTIVATED_UNAVAILABLE',
  );
});

test('close gates new admission and waits for active callback settlement', async t => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const context = fixture(t, {
    execute: async () => { calls += 1; await pending; return { resultCode: 'runtime.resource.delivered' }; },
  });
  await context.owner.start(activationInput(context));
  const grantId = context.serviceStore.load().state.grants[0].grantId;
  const active = exchange(context.owner.handle, authorization(requestDescription(grantId, 'request.pending')));
  await new Promise(resolve => setImmediate(resolve));
  const firstClose = context.owner.close();
  assert.equal(context.owner.close(), firstClose);
  assert.equal((await exchange(context.owner.handle, authorization(requestDescription(grantId, 'request.denied')))).statusCode, 503);
  assert.equal(calls, 1);
  release();
  assert.equal((await active).statusCode, 200);
  await firstClose;
});

test('close during STARTING prevents ACTIVE publication and closes both stores', async t => {
  const context = fixture(t);
  const starting = context.owner.start(activationInput(context));
  const closing = context.owner.close();
  await expectCodeAsync(() => starting, 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_CLOSED');
  await closing;
  assert.equal((await exchange(context.owner.handle, 'forbidden')).statusCode, 503);
  await expectCodeAsync(() => context.owner.start(activationInput(context)),
    'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_CLOSED');
});

test('callback reentrant close is fixed-error and later external close succeeds', async t => {
  let observed = null;
  let owner;
  const context = fixture(t, {
    execute: async () => {
      try { await owner.close(); } catch (error) { observed = error.code; }
      return { resultCode: 'runtime.resource.delivered' };
    },
  });
  owner = context.owner;
  await owner.start(activationInput(context));
  const grantId = context.serviceStore.load().state.grants[0].grantId;
  assert.equal((await exchange(owner.handle, authorization(requestDescription(grantId, 'request.reentrant')))).statusCode, 200);
  assert.equal(observed, 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_CLOSE_FAILED');
  assert.equal((await exchange(owner.handle, authorization(
    requestDescription(grantId, 'request.after-reentrant-close'),
  ))).statusCode, 503);
  await owner.close();
});

test('prototype fakes, proxies, facades, hostile values, and method replacement fail closed', async t => {
  const context = fixture(t);
  for (const override of [
    { serviceCreditStore: Object.create(ServiceCreditSqliteStore.prototype) },
    { fundingObserverStore: Object.create(ZenonFundingObserverSqliteStore.prototype) },
    { serviceCreditStore: new Proxy(context.serviceStore, {}) },
    { fundingObserverStore: new Proxy(context.observerStore, {}) },
    { serviceCreditStore: { getDurableExecutionSnapshot() {} } },
  ]) expectCode(() => createZenonDurableHttpComposition({ ...context.options, ...override }),
    'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_INVALID_CONFIGURATION');

  const hostile = [
    new Proxy(activationInput(context), {}),
    Object.defineProperty({}, 'intent', { enumerable: true, get() { throw new Error('getter'); } }),
    { intent: { then() {} }, paymentRequired: {} },
    { intent: { oversized: 'x'.repeat(300_000) }, paymentRequired: {} },
  ];
  const cyclic = activationInput(context);
  cyclic.intent.self = cyclic.intent;
  hostile.push(cyclic);
  for (const input of hostile) expectCode(() => context.owner.start(input),
    'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_INVALID_INPUT');
  Object.defineProperty(context.serviceStore, 'getDurableExecutionSnapshot', {
    configurable: true, value: () => ({ forged: true }),
  });
  await expectCodeAsync(() => context.owner.start(activationInput(context)),
    'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_PRE_ACTIVATION_UNAVAILABLE');
  delete context.serviceStore.getDurableExecutionSnapshot;
  assert.equal(context.serviceStore.load().state.grants.length, 0);
  assert.equal(context.serviceStore.getDurableExecutionSnapshot().executionState, null);
});

test('post-activation invalidation cannot claw back issued or consumed credit', async t => {
  const context = fixture(t);
  await context.owner.start(activationInput(context));
  const grantId = context.serviceStore.load().state.grants[0].grantId;
  assert.equal((await exchange(context.owner.handle, authorization(requestDescription(grantId, 'request.before-reorg')))).statusCode, 200);
  const before = context.serviceStore.load().state.grants[0];
  const state = context.observerStore.load().state;
  context.observerStore.planBackfill({
    expectedRevision: state.revision,
    frontier: { height: state.checkpoint.height, hash: digest('post-activation-reorg').slice(7) },
  });
  assert.equal(context.observerStore.projectCommittedFundingEvidence(), null);
  assert.deepEqual(context.serviceStore.load().state.grants[0], before);
  assert.equal(before.consumedUnits, 2);
});

test('production owner contains no listener, source, outbox consumption, or cross-store transaction', () => {
  const source = readFileSync(new URL('../src/service-credit-zenon-durable-http-composition.js', import.meta.url), 'utf8');
  for (const forbidden of [
    'BEGIN IMMEDIATE', 'markConsumed', 'consumeOutbox', 'commitAuthenticatedEnvelope',
    'createServer', '.listen(', 'WebSocket', "from './wallet", 'privateKey', 'exactly-once',
  ]) assert.equal(source.includes(forbidden), false);
});

test('unavailable responses never share mutable body aliases', async t => {
  const context = fixture(t);
  let firstBody = null;
  const firstResponse = {
    destroyed: false,
    writableEnded: false,
    statusCode: 0,
    setHeader() {},
    end(value) {
      this.writableEnded = true;
      firstBody = value;
      value.fill(0x78);
    },
    destroy() { this.destroyed = true; },
  };
  await context.owner.handle(Object.freeze({}), firstResponse);
  assert.equal(Buffer.isBuffer(firstBody), true);
  const second = await exchange(context.owner.handle, 'forbidden');
  assert.equal(second.statusCode, 503);
  assert.equal(second.body.toString('utf8'), '{"error":"service_unavailable"}');
});
