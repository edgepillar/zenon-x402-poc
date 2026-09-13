import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PassThrough } from 'node:stream';

import {
  createZenonFundingComposition,
  ZenonFundingCompositionError,
} from '../src/service-credit-zenon-funding-composition.js';
import {
  createZenonFundingEvidenceActivation,
} from '../src/service-credit-zenon-funding-evidence.js';
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
import {
  createZenonFundingProviderSigningChildResponse,
  frameZenonFundingProviderSigningChildResponse,
  parseZenonFundingProviderSigningChildRequestFrame,
} from '../src/service-credit-zenon-provider-signing-child-protocol.js';
import {
  deriveServiceCreditResourceBinding,
} from '../src/service-credit-activation.js';
import {
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
  SERVICE_CREDIT_MODEL_VERSION,
} from '../src/service-credit-model.js';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';

const NOW = 2_000_000_000_000;
const ATTESTATION_NOW = 2_000_000_000;
const INITIAL_HEIGHT = 10;
const INITIAL_HASH = createHash('sha256').update('composition-bootstrap').digest('hex');
const TRANSACTION_HASH = createHash('sha256').update('composition-transaction').digest('hex');
const EMPTY_BODY_DIGEST = `sha256:${createHash('sha256').update(Buffer.alloc(0)).digest('hex')}`;
const RESOURCE_DIGEST_DOMAIN = 'zenon-x402-service-credit-payment-resource-v1';
const REQUIREMENT_DIGEST_DOMAIN = 'zenon-x402-service-credit-payment-requirement-v1';
const RESOURCE_URL = 'https://service.example/credits/zenon-fund';
const CHAIN_PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '12345',
  genesisMomentumHash: createHash('sha256').update('composition-genesis').digest('hex'),
});

function digest(label) {
  return `sha256:${createHash('sha256').update(`composition:${label}`).digest('hex')}`;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function domainCommitment(domain, value) {
  return `sha256:${createHash('sha256')
    .update(domain)
    .update('\0')
    .update(canonicalJson(value))
    .digest('hex')}`;
}

function keyMaterial() {
  const pair = generateKeyPairSync('ed25519');
  const spki = pair.publicKey.export({ format: 'der', type: 'spki' });
  return {
    privateKey: pair.privateKey,
    publicKey: spki.subarray(-32).toString('base64url'),
  };
}

const PROVIDER_KEYS = keyMaterial();
const CAPABILITY_KEYS = keyMaterial();
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
    policyId: 'zenon.injected-observer',
    policyVersion: 1,
    verifierVersion: 1,
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
const AUTHORITY = parseZenonFundingProviderAttestationAuthorityRecord(
  AUTHORITY_RECORD_TEXT,
);
let signingBridgeImportSequence = 0;

function privateDirectoryFor(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'zenon-composition-')));
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
      resourceId: 'resource.zenon.funding',
      resourceUrl: RESOURCE_URL,
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
      scheme: 'exact',
      network: 'zenon:testnet',
      asset: 'zts1syntheticasset',
      amount: '7',
      payTo: 'z1syntheticpayee',
      maxTimeoutSeconds: 30,
      extra: {
        paymentFlow: 'upfront',
        poc: true,
        settlement: 'account-block',
        zenonChain: structuredClone(AUTHORITY.chainProfile),
        minimumMomentumConfirmations: AUTHORITY.confirmationPolicy.minimumConfirmations,
      },
    },
  };
}

function selection() {
  return {
    offerId: 'offer.zenon.reference',
    offerVersion: 1,
    holderId: 'z1syntheticpayer',
    capabilityCommitment: deriveServiceCreditCapabilityCommitment({
      publicKey: CAPABILITY_KEYS.publicKey,
    }),
  };
}

function preliminaryChallenge(serviceStore) {
  const activation = createZenonFundingEvidenceActivation({
    store: serviceStore,
    deriveFundingTerms: fundingTerms,
    verifyFundingEvidence: async () => {
      throw new Error('unused synthetic verifier');
    },
    authorityProfile: structuredClone(AUTHORITY.authorityProfile),
    now: () => NOW,
  });
  return activation.createFundingResource({ selection: selection(), resourceUrl: RESOURCE_URL });
}

function observerTarget(prepared) {
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
    paymentResourceDigest: domainCommitment(
      RESOURCE_DIGEST_DOMAIN,
      prepared.paymentRequired.resource,
    ),
    paymentRequirementDigest: domainCommitment(REQUIREMENT_DIGEST_DOMAIN, accepted),
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

function observerState(prepared, targetOverrides = {}) {
  return createZenonFundingObserverState({
    observerPolicy: structuredClone(AUTHORITY.observerPolicy),
    authorityGeneration: structuredClone(AUTHORITY.authorityGeneration),
    chainProfile: structuredClone(AUTHORITY.chainProfile),
    confirmationPolicy: structuredClone(AUTHORITY.confirmationPolicy),
    target: { ...observerTarget(prepared), ...targetOverrides },
    checkpoint: structuredClone(AUTHORITY.bootstrapCheckpoint),
    catchUp: {
      maximumPageEntries: 4,
      maximumBackfillSpan: 8,
      maximumMembersPerMomentum: 4,
    },
  });
}

function momentumHash(height) {
  return createHash('sha256').update(`composition-momentum-${height}`).digest('hex');
}

function reachThreshold(store) {
  const before = store.load().state;
  const frontier = {
    height: INITIAL_HEIGHT + 3,
    hash: momentumHash(INITIAL_HEIGHT + 3),
  };
  const planned = store.planBackfill({ expectedRevision: before.revision, frontier });
  let previousHash = planned.plan.startCheckpoint.hash;
  const momentums = [];
  for (let height = planned.plan.fromHeight; height <= planned.plan.throughHeight; height += 1) {
    const hash = momentumHash(height);
    momentums.push({
      height,
      hash,
      previousHash,
      members: height === INITIAL_HEIGHT + 1
        ? [{
          transactionId: before.target.transactionId,
          targetBindingDigest: before.targetBindingDigest,
        }]
        : [],
    });
    previousHash = hash;
  }
  const advanced = store.applyPage({
    expectedRevision: before.revision,
    plan: planned.plan,
    momentums,
  });
  const receipt = advanced.state.catchUp.lastAppliedPage;
  const observed = store.applyInclusion({
    expectedRevision: advanced.state.revision,
    target: structuredClone(advanced.state.target),
    observation: {
      status: 'FOUND',
      transactionId: advanced.state.target.transactionId,
      targetBindingDigest: advanced.state.targetBindingDigest,
      momentumHeight: receipt.targetMembership.momentumHeight,
      momentumHash: receipt.targetMembership.momentumHash,
      pageDigest: receipt.pageDigest,
    },
  });
  assert.equal(observed.state.status, ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED);
  return observed;
}

function signedEnvelope(request, overrides = {}) {
  const issuedAt = overrides.issuedAt ?? ATTESTATION_NOW;
  const validUntil = overrides.validUntil ?? issuedAt + 120;
  const bytes = createZenonFundingProviderAttestationSigningBytes({
    request,
    issuedAt,
    validUntil,
  });
  return {
    envelopeVersion: 1,
    attestationId: request.attestationId,
    keyId: AUTHORITY.keyId,
    issuedAt,
    validUntil,
    signature: sign(null, bytes, PROVIDER_KEYS.privateKey).toString('base64url'),
  };
}

async function syntheticSigningOperation(t, context, outcome, observed) {
  const executablePath = join(context.directory, 'synthetic-signing-child');
  writeFileSync(executablePath, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  chmodSync(executablePath, 0o700);
  const signerExecutable = {
    executablePath: realpathSync(executablePath),
    executableDigest: `sha256:${createHash('sha256')
      .update(readFileSync(executablePath)).digest('hex')}`,
    protocolVersion: 1,
  };
  const spawn = () => {
    observed.dispatches = (observed.dispatches ?? 0) + 1;
    const child = new EventEmitter();
    const request = new PassThrough();
    const response = new PassThrough();
    child.stdio = [null, null, null, request, response];
    child.kill = signal => {
      queueMicrotask(() => child.emit('close', null, signal));
      return true;
    };
    const chunks = [];
    request.on('data', chunk => chunks.push(Buffer.from(chunk)));
    request.once('finish', () => {
      try {
        const wire = parseZenonFundingProviderSigningChildRequestFrame(
          Buffer.concat(chunks), AUTHORITY,
        );
        observed.request = wire.attestationRequest;
        if (outcome === 'uncertain') {
          response.end(Buffer.from([0, 0, 0, 1, 0]));
        } else {
          response.end(frameZenonFundingProviderSigningChildResponse(
            createZenonFundingProviderSigningChildResponse({
              protocolVersion: 1,
              messageType: 'zenon-funding-provider-signing-response',
              operationId: wire.operationId,
              status: outcome,
              reasonCode: outcome === 'APPROVAL_REQUIRED'
                ? 'OPERATOR_APPROVAL_REQUIRED' : null,
              envelope: outcome === 'READY' ? signedEnvelope(wire.attestationRequest) : null,
            }),
          ));
        }
        queueMicrotask(() => child.emit('close', 0, null));
      } catch {
        child.emit('error', new Error('synthetic child failure'));
      }
    });
    return child;
  };
  const restore = t.mock.method(childProcess, 'spawn', spawn);
  let createOperation;
  try {
    signingBridgeImportSequence += 1;
    ({ createZenonFundingProviderSigningOperation: createOperation } = await import(
      `../src/service-credit-zenon-provider-signing-operation.js?bridge=${signingBridgeImportSequence}`
    ));
  } finally {
    restore.mock.restore();
  }
  const makeOwner = () => createOperation({
    fundingObserverStore: context.observerStore,
    authorityRecord: AUTHORITY_RECORD_TEXT,
    signerExecutable,
    now: () => ATTESTATION_NOW,
    deadlineRuntime: {
      schedule(callback, delayMs) { return setTimeout(callback, delayMs); },
      cancel(handle) { clearTimeout(handle); },
    },
    timeoutMs: 1_000,
    maximumResponseBytes: 16 * 1024,
  });
  return makeOwner;
}

function setObserverStage(store, stage) {
  if (stage === 'NONE') return null;
  const threshold = reachThreshold(store);
  if (stage === 'PREPARED') return { threshold, request: store.peekPreparedAttestation() };
  const request = store.peekPreparedAttestation();
  const ready = store.commitAuthenticatedEnvelope({
    expectedObserverRevision: threshold.state.revision,
    expectedOutboxRevision: 1,
    attestationId: request.attestationId,
    envelope: signedEnvelope(request),
    nowEpochSeconds: ATTESTATION_NOW,
  });
  if (stage === 'READY') return { threshold, request, ready };
  if (stage === 'INVALIDATED') {
    store.planBackfill({
      expectedRevision: threshold.state.revision,
      frontier: {
        height: threshold.state.checkpoint.height,
        hash: createHash('sha256').update('replacement-momentum').digest('hex'),
      },
    });
    return null;
  }
  if (stage === 'EQUIVOCATED') {
    store.commitAuthenticatedEnvelope({
      expectedObserverRevision: threshold.state.revision,
      expectedOutboxRevision: 2,
      attestationId: request.attestationId,
      envelope: signedEnvelope(request, {
        issuedAt: ATTESTATION_NOW + 1,
        validUntil: ATTESTATION_NOW + 121,
      }),
      nowEpochSeconds: ATTESTATION_NOW + 1,
    });
    return null;
  }
  throw new Error('unknown synthetic stage');
}

function fixture(t, {
  stage = 'READY',
  serviceHooks = undefined,
  targetOverrides = {},
  skipOwnerChallenge = false,
} = {}) {
  const directory = privateDirectoryFor(t);
  const serviceConfiguration = {
    databasePath: join(directory, 'service-credit.sqlite'),
    allowedRoot: directory,
    deriveCost: () => 2,
    now: () => NOW,
    ...(serviceHooks === undefined ? {} : { testHooks: serviceHooks }),
  };
  const serviceOpenConfiguration = {
    databasePath: serviceConfiguration.databasePath,
    allowedRoot: directory,
    deriveCost: () => 2,
    now: () => NOW,
  };
  const serviceStore = ServiceCreditSqliteStore.create(serviceConfiguration);
  serviceStore.registerOffer(offer());
  const prepared = preliminaryChallenge(serviceStore);
  const observerConfiguration = {
    databasePath: join(directory, 'observer.sqlite'),
    allowedRoot: directory,
    initialState: observerState(prepared, targetOverrides),
    authorityRecord: AUTHORITY_RECORD_TEXT,
  };
  const observerStore = createZenonFundingObserverSqliteStore(observerConfiguration);
  const context = {
    directory,
    serviceConfiguration,
    serviceOpenConfiguration,
    observerConfiguration,
    serviceStore,
    observerStore,
    observerRecordKey: observerStore.load().recordKey,
    prepared,
    composition: null,
    session: null,
  };
  context.composition = createZenonFundingComposition({
    serviceCreditStore: context.serviceStore,
    fundingObserverStore: context.observerStore,
    authorityRecord: AUTHORITY_RECORD_TEXT,
    deriveFundingTerms: fundingTerms,
    now: () => NOW,
  });
  if (!skipOwnerChallenge) {
    const fromOwner = context.composition.createFundingResource({
      selection: selection(),
      resourceUrl: RESOURCE_URL,
    });
    assert.deepEqual(fromOwner, prepared);
  }
  context.stageResult = setObserverStage(context.observerStore, stage);
  t.after(async () => {
    try { await context.session?.close(); } catch {}
    try { context.serviceStore?.close(); } catch {}
    try { context.observerStore?.close(); } catch {}
  });
  return context;
}

function activationInput(context) {
  return {
    intent: structuredClone(context.prepared.activationIntent),
    paymentRequired: structuredClone(context.prepared.paymentRequired),
  };
}

function expectCode(operation, code) {
  assert.throws(operation, error => {
    assert.equal(error instanceof ZenonFundingCompositionError, true);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.equal(error.stack, `ZenonFundingCompositionError: ${code}`);
    return true;
  });
}

async function expectCodeAsync(operation, code) {
  await assert.rejects(Promise.resolve().then(operation), error => {
    assert.equal(error instanceof ZenonFundingCompositionError, true);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.equal(error.stack, `ZenonFundingCompositionError: ${code}`);
    return true;
  });
}

function passiveDeadlineRuntime() {
  return {
    monotonicNowNs: () => 0n,
    schedule: () => Object.freeze({}),
    cancel: () => undefined,
  };
}

function requestDescription(grantId, requestId) {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    grantId,
    requestId,
    method: 'POST',
    routeId: SERVICE_CREDIT_HTTP_ROUTE_ID,
    canonicalBodyDigest: EMPTY_BODY_DIGEST,
    selectedContentType: 'application/json',
    maxCostUnits: 2,
  };
}

function authorization(request) {
  const proof = {
    proofVersion: 1,
    grantId: request.grantId,
    requestId: request.requestId,
    publicKey: CAPABILITY_KEYS.publicKey,
    maxCostUnits: request.maxCostUnits,
    signature: sign(
      null,
      createServiceCreditCapabilitySigningBytes(request),
      CAPABILITY_KEYS.privateKey,
    ).toString('base64url'),
  };
  return `ServiceCredit ${Buffer.from(canonicalJson(proof), 'utf8').toString('base64url')}`;
}

function exchange(handle, auth) {
  const request = Object.freeze({
    url: SERVICE_CREDIT_HTTP_PATH,
    method: 'POST',
    rawHeaders: Object.freeze(['Authorization', auth, 'Content-Length', '0']),
  });
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
    headers,
    body,
  }));
}

test('composition import is inert and the owner exports only two operations', () => {
  const source = readFileSync(
    new URL('../src/service-credit-zenon-funding-composition.js', import.meta.url),
    'utf8',
  );
  for (const forbidden of [
    'node:net', 'node:http', 'node:https', 'WebSocket', 'privateKey',
    'createServer(', 'listen(', 'process.env', 'sign(', 'generateKeyPair',
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
  assert.equal(source.includes('projectCommittedFundingEvidence'), true);
  assert.equal(source.includes('matchReadyFundingEvidence'), true);
});

test('constructor binds exact unadorned stores and returns a frozen private owner', t => {
  const context = fixture(t, { stage: 'NONE' });
  assert.deepEqual(Reflect.ownKeys(context.composition), [
    'createFundingResource',
    'activateCommittedFunding',
  ]);
  assert.equal(Object.isFrozen(context.composition), true);
  for (const forbidden of [
    'serviceCreditStore', 'fundingObserverStore', 'authorityRecord', 'verifier',
    'matcher', 'outbox', 'activateGrantFromTrustedRecord',
  ]) {
    assert.equal(Object.hasOwn(context.composition, forbidden), false);
  }
});

test('prototype-only store lookalikes fail during construction', t => {
  const context = fixture(t, { stage: 'NONE' });
  for (const [serviceCreditStore, fundingObserverStore] of [
    [Object.create(ServiceCreditSqliteStore.prototype), context.observerStore],
    [context.serviceStore, Object.create(ZenonFundingObserverSqliteStore.prototype)],
  ]) {
    expectCode(
      () => createZenonFundingComposition({
        serviceCreditStore,
        fundingObserverStore,
        authorityRecord: AUTHORITY_RECORD_TEXT,
        deriveFundingTerms: fundingTerms,
        now: () => NOW,
      }),
      'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_INVALID_CONFIGURATION',
    );
  }
});

test('challenge issuance requires a currently open observer before policy effects', t => {
  const context = fixture(t, { stage: 'NONE' });
  let policyCalls = 0;
  const owner = createZenonFundingComposition({
    serviceCreditStore: context.serviceStore,
    fundingObserverStore: context.observerStore,
    authorityRecord: AUTHORITY_RECORD_TEXT,
    deriveFundingTerms: input => {
      policyCalls += 1;
      return fundingTerms(input);
    },
    now: () => NOW,
  });
  context.observerStore.close();
  expectCode(
    () => owner.createFundingResource({ selection: selection(), resourceUrl: RESOURCE_URL }),
    'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REJECTED',
  );
  assert.equal(policyCalls, 0);
  assert.equal(context.serviceStore.load().state.grants.length, 0);
});

test('committed observer corruption after construction returns no challenge', t => {
  const context = fixture(t, { stage: 'NONE', skipOwnerChallenge: true });
  let policyCalls = 0;
  context.composition = createZenonFundingComposition({
    serviceCreditStore: context.serviceStore,
    fundingObserverStore: context.observerStore,
    authorityRecord: AUTHORITY_RECORD_TEXT,
    deriveFundingTerms: input => {
      policyCalls += 1;
      return fundingTerms(input);
    },
    now: () => NOW,
  });
  const database = new DatabaseSync(context.observerConfiguration.databasePath);
  database.prepare(
    'UPDATE zenon_funding_observer_state SET envelope = ? WHERE singleton = 1',
  ).run('{}');
  database.close();
  expectCode(
    () => context.composition.createFundingResource({
      selection: selection(),
      resourceUrl: RESOURCE_URL,
    }),
    'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REJECTED',
  );
  assert.equal(policyCalls, 0);
  assert.equal(context.serviceStore.load().state.grants.length, 0);
});

test('observer closure or method replacement during policy evaluation returns no challenge', t => {
  for (const action of ['close', 'replace-method']) {
    t.test(action, t => {
      const context = fixture(t, { stage: 'NONE' });
      let armed = false;
      const owner = createZenonFundingComposition({
        serviceCreditStore: context.serviceStore,
        fundingObserverStore: context.observerStore,
        authorityRecord: AUTHORITY_RECORD_TEXT,
        deriveFundingTerms: input => {
          if (armed) {
            if (action === 'close') {
              context.observerStore.close();
            } else {
              Object.defineProperty(context.observerStore, 'load', {
                configurable: true,
                value: () => ({ forged: true }),
              });
            }
          }
          return fundingTerms(input);
        },
        now: () => NOW,
      });
      armed = true;
      expectCode(
        () => owner.createFundingResource({ selection: selection(), resourceUrl: RESOURCE_URL }),
        action === 'close'
          ? 'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REJECTED'
          : 'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_INVALID_CONFIGURATION',
      );
      if (action === 'replace-method') delete context.observerStore.load;
      assert.equal(context.serviceStore.load().state.grants.length, 0);
    });
  }
});

test('challenge issuance allows live nonterminal outboxes and rejects terminal outboxes', t => {
  for (const stage of ['NONE', 'PREPARED', 'READY', 'INVALIDATED', 'EQUIVOCATED']) {
    t.test(stage, t => {
      const context = fixture(t, { stage });
      const operation = () => context.composition.createFundingResource({
        selection: selection(),
        resourceUrl: RESOURCE_URL,
      });
      if (stage === 'NONE' || stage === 'PREPARED' || stage === 'READY') {
        assert.deepEqual(operation(), context.prepared);
      } else {
        expectCode(
          operation,
          'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REJECTED',
        );
      }
      assert.equal(context.serviceStore.load().state.grants.length, 0);
    });
  }
});

test('complete READY-to-grant flow survives direct durable HTTP replay and reopen', async t => {
  const context = fixture(t);
  const readyBefore = canonicalJson(context.observerStore.projectCommittedFundingEvidence());
  const activated = await context.composition.activateCommittedFunding(activationInput(context));
  assert.equal(context.serviceStore.load().state.grants.length, 1);
  assert.equal(canonicalJson(context.observerStore.projectCommittedFundingEvidence()), readyBefore);

  context.serviceStore.initializeDurableExecution({
    expectedRevision: context.serviceStore.getMetadata().revision,
    ledgerId: 'ledger.composition',
    policy: {
      policyId: 'execution.composition',
      policyVersion: 1,
      maxDurationMs: 1_000,
    },
    capacity: 8,
  });
  let executionCalls = 0;
  context.session = createDurableServiceCreditHttpSession({
    store: context.serviceStore,
    execute: () => {
      executionCalls += 1;
      return { resultCode: 'composition.resource.delivered' };
    },
    deadlineRuntime: passiveDeadlineRuntime(),
    selectedDurationMs: 1_000,
  });
  const firstRequest = requestDescription(activated.grant.grantId, 'request.composition.a');
  const first = await exchange(context.session.handle, authorization(firstRequest));
  const afterFirst = context.serviceStore.load();
  const replay = await exchange(context.session.handle, authorization(firstRequest));
  assert.equal(first.statusCode, 200);
  assert.deepEqual(replay.body, first.body);
  assert.deepEqual(context.serviceStore.load(), afterFirst);
  assert.equal(executionCalls, 1);
  await context.session.close();
  context.session = null;

  context.serviceStore.close();
  context.observerStore.close();
  context.serviceStore = ServiceCreditSqliteStore.openExisting(context.serviceOpenConfiguration);
  context.observerStore = openZenonFundingObserverSqliteStore({
    databasePath: context.observerConfiguration.databasePath,
    allowedRoot: context.directory,
    expectedRecordKey: context.observerRecordKey,
    authorityRecord: AUTHORITY_RECORD_TEXT,
  });
  context.composition = createZenonFundingComposition({
    serviceCreditStore: context.serviceStore,
    fundingObserverStore: context.observerStore,
    authorityRecord: AUTHORITY_RECORD_TEXT,
    deriveFundingTerms: fundingTerms,
    now: () => NOW,
  });
  const reconciled = await context.composition.activateCommittedFunding(activationInput(context));
  assert.equal(reconciled.activation.activationId, activated.activation.activationId);
  assert.equal(reconciled.grant.grantId, activated.grant.grantId);
  assert.equal(context.serviceStore.load().state.grants.length, 1);

  context.session = createDurableServiceCreditHttpSession({
    store: context.serviceStore,
    execute: () => {
      executionCalls += 1;
      return { resultCode: 'composition.resource.delivered' };
    },
    deadlineRuntime: passiveDeadlineRuntime(),
    selectedDurationMs: 1_000,
  });
  const secondRequest = requestDescription(activated.grant.grantId, 'request.composition.b');
  const second = await exchange(context.session.handle, authorization(secondRequest));
  assert.equal(second.statusCode, 200);
  assert.equal(executionCalls, 2);
  assert.equal(context.serviceStore.load().state.grants[0].consumedUnits, 4);
  assert.equal(canonicalJson(context.observerStore.projectCommittedFundingEvidence()), readyBefore);
});

test('synthetic signing child commits one READY-to-grant lifecycle across reopen', async t => {
  const context = fixture(t, { stage: 'PREPARED' });
  const observed = {};
  const makeOwner = await syntheticSigningOperation(t, context, 'READY', observed);
  const owner = makeOwner();
  const first = owner.start();
  assert.strictEqual(owner.start(), first);
  assert.deepEqual(await first, { status: 'READY_COMMITTED' });
  assert.equal(observed.dispatches, 1);
  assert.equal(canonicalJson(observed.request), canonicalJson(context.stageResult.request));
  assert.equal(context.observerStore.load().outbox.status, 'READY');
  assert.equal(context.serviceStore.load().state.grants.length, 0);

  const activated = await context.composition.activateCommittedFunding(activationInput(context));
  assert.equal(context.serviceStore.load().state.grants.length, 1);
  await owner.close();
  context.serviceStore.close();
  context.observerStore.close();
  context.serviceStore = ServiceCreditSqliteStore.openExisting(context.serviceOpenConfiguration);
  context.observerStore = openZenonFundingObserverSqliteStore({
    databasePath: context.observerConfiguration.databasePath,
    allowedRoot: context.directory,
    expectedRecordKey: context.observerRecordKey,
    authorityRecord: AUTHORITY_RECORD_TEXT,
  });
  context.composition = createZenonFundingComposition({
    serviceCreditStore: context.serviceStore,
    fundingObserverStore: context.observerStore,
    authorityRecord: AUTHORITY_RECORD_TEXT,
    deriveFundingTerms: fundingTerms,
    now: () => NOW,
  });
  const replayOwner = makeOwner();
  await assert.rejects(
    replayOwner.start(),
    error => error?.code === 'ZENON_FUNDING_PROVIDER_SIGNING_ATTESTATION_UNAVAILABLE',
  );
  await replayOwner.close();
  assert.equal(observed.dispatches, 1);
  const replay = await context.composition.activateCommittedFunding(activationInput(context));
  assert.equal(replay.activation.activationId, activated.activation.activationId);
  assert.equal(replay.grant.grantId, activated.grant.grantId);
  assert.equal(context.observerStore.load().outbox.status, 'READY');
  assert.equal(context.serviceStore.load().state.grants.length, 1);
  assert.equal(observed.dispatches, 1);
});

test('non-READY and uncertain synthetic child outcomes create no grant', async t => {
  for (const [outcome, expected] of [
    ['APPROVAL_REQUIRED', 'APPROVAL_REQUIRED'],
    ['uncertain', 'SIGNER_OUTCOME_UNKNOWN'],
  ]) {
    await t.test(outcome, async t => {
      const context = fixture(t, { stage: 'PREPARED' });
      const before = context.serviceStore.load();
      const observed = {};
      const makeOwner = await syntheticSigningOperation(t, context, outcome, observed);
      const owner = makeOwner();
      const first = owner.start();
      assert.deepEqual(await first, { status: expected });
      assert.strictEqual(owner.start(), first);
      assert.equal(observed.dispatches, 1);
      assert.equal(context.observerStore.load().outbox.status, 'PREPARED');
      await expectCodeAsync(
        () => context.composition.activateCommittedFunding(activationInput(context)),
        'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_NOT_READY',
      );
      assert.deepEqual(context.serviceStore.load(), before);
      assert.equal(context.serviceStore.load().state.grants.length, 0);
      await owner.close();
    });
  }
});

test('non-READY outbox states fail before any service-credit grant mutation', async t => {
  for (const stage of ['NONE', 'PREPARED', 'INVALIDATED', 'EQUIVOCATED']) {
    await t.test(stage, async t => {
      const context = fixture(t, { stage });
      const before = context.serviceStore.load();
      await expectCodeAsync(
        () => context.composition.activateCommittedFunding(activationInput(context)),
        'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_NOT_READY',
      );
      assert.deepEqual(context.serviceStore.load(), before);
      assert.equal(context.serviceStore.load().state.grants.length, 0);
    });
  }
});

test('caller cannot inject any privileged evidence or authority surface', async t => {
  const context = fixture(t);
  for (const [name, extra] of [
    ['artifact', { fundingEvidence: context.observerStore.projectCommittedFundingEvidence() }],
    ['authority', { authorityRecord: AUTHORITY_RECORD_TEXT }],
    ['key', { publicKey: PROVIDER_KEYS.publicKey }],
    ['verifier', { verifyFundingEvidence: async () => ({}) }],
    ['state', { observerState: context.observerStore.load().state }],
    ['matcher', { matchReadyFundingEvidence: () => ({}) }],
    ['outbox', { outbox: { status: 'READY' } }],
    ['store', { store: context.serviceStore }],
    ['grant', { activateGrantFromTrustedRecord: () => ({}) }],
    ['plain-ws', { authenticated: true }],
  ]) {
    await t.test(name, async () => {
      await expectCodeAsync(
        () => context.composition.activateCommittedFunding({
          ...activationInput(context),
          ...extra,
        }),
        'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_INVALID_INPUT',
      );
      assert.equal(context.serviceStore.load().state.grants.length, 0);
    });
  }
});

test('authority, policy, offer, intent, requirement, and target drift fail closed', async t => {
  const context = fixture(t);
  const mutations = [
    input => { input.intent.totalUnits += 1; },
    input => { input.intent.offerVersion += 1; },
    input => { input.intent.capabilityCommitment = digest('other-capability'); },
    input => { input.paymentRequired.accepts[0].amount = '8'; },
    input => { input.paymentRequired.accepts[0].asset = 'zts1otherasset'; },
    input => { input.paymentRequired.accepts[0].payTo = 'z1otherpayee'; },
    input => { input.paymentRequired.resource.url = 'https://service.example/other'; },
    input => { input.paymentRequired.accepts[0].extra.zenonChain.chainIdentifier = '12346'; },
  ];
  for (const mutate of mutations) {
    const input = activationInput(context);
    mutate(input);
    await expectCodeAsync(
      () => context.composition.activateCommittedFunding(input),
      'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REJECTED',
    );
    assert.equal(context.serviceStore.load().state.grants.length, 0);
  }

  const changedAuthority = JSON.parse(AUTHORITY_RECORD_TEXT);
  changedAuthority.sourcePolicyCommitment = digest('rotated-source-policy');
  expectCode(
    () => createZenonFundingComposition({
      serviceCreditStore: context.serviceStore,
      fundingObserverStore: context.observerStore,
      authorityRecord: canonicalJson(changedAuthority),
      deriveFundingTerms: fundingTerms,
      now: () => NOW,
    }),
    'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_INVALID_CONFIGURATION',
  );
});

test('payable challenge must match the observer store immutable target', async t => {
  for (const [name, targetOverrides] of [
    ['payer', { payer: 'z1otherpayer' }],
    ['payee', { payee: 'z1otherpayee' }],
    ['asset', { asset: 'zts1otherasset' }],
    ['amount', { amount: '8' }],
    ['units', { totalUnits: 11 }],
    ['expiry', { expiresAt: NOW + 60_001 }],
    ['resource', { paymentResourceDigest: digest('other-resource') }],
    ['requirement', { paymentRequirementDigest: digest('other-requirement') }],
    ['intent', { paymentIntentDigest: digest('other-intent') }],
    ['capability', { capabilityCommitment: digest('other-capability') }],
    ['funding', { grantFundingCommitment: digest('other-funding') }],
  ]) {
    await t.test(name, t => {
      const context = fixture(t, {
        stage: 'NONE',
        targetOverrides,
        skipOwnerChallenge: true,
      });
      expectCode(
        () => context.composition.createFundingResource({
          selection: selection(),
          resourceUrl: RESOURCE_URL,
        }),
        'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REJECTED',
      );
      assert.equal(context.serviceStore.load().state.grants.length, 0);
      assert.equal(context.observerStore.load().outbox.status, 'NONE');
    });
  }
});

test('invalidation between READY projection and committed match creates no grant', async t => {
  const context = fixture(t);
  let armed = false;
  let fired = false;
  const racingPolicy = input => {
    const result = fundingTerms(input);
    if (armed && !fired) {
      fired = true;
      const state = context.observerStore.load().state;
      context.observerStore.planBackfill({
        expectedRevision: state.revision,
        frontier: {
          height: state.checkpoint.height,
          hash: createHash('sha256').update('projection-match-replacement').digest('hex'),
        },
      });
    }
    return result;
  };
  context.composition = createZenonFundingComposition({
    serviceCreditStore: context.serviceStore,
    fundingObserverStore: context.observerStore,
    authorityRecord: AUTHORITY_RECORD_TEXT,
    deriveFundingTerms: racingPolicy,
    now: () => NOW,
  });
  armed = true;
  await expectCodeAsync(
    () => context.composition.activateCommittedFunding(activationInput(context)),
    'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REJECTED',
  );
  assert.equal(fired, true);
  assert.equal(context.observerStore.load().outbox.status, 'INVALIDATED');
  assert.equal(context.serviceStore.load().state.grants.length, 0);
});

test('equivocation between READY projection and committed match creates no grant', async t => {
  const context = fixture(t);
  let armed = false;
  let fired = false;
  const racingPolicy = input => {
    const result = fundingTerms(input);
    if (armed && !fired) {
      fired = true;
      const state = context.observerStore.load().state;
      context.observerStore.commitAuthenticatedEnvelope({
        expectedObserverRevision: state.revision,
        expectedOutboxRevision: 2,
        attestationId: context.stageResult.request.attestationId,
        envelope: signedEnvelope(context.stageResult.request, {
          issuedAt: ATTESTATION_NOW + 1,
          validUntil: ATTESTATION_NOW + 121,
        }),
        nowEpochSeconds: ATTESTATION_NOW + 1,
      });
    }
    return result;
  };
  context.composition = createZenonFundingComposition({
    serviceCreditStore: context.serviceStore,
    fundingObserverStore: context.observerStore,
    authorityRecord: AUTHORITY_RECORD_TEXT,
    deriveFundingTerms: racingPolicy,
    now: () => NOW,
  });
  armed = true;
  await expectCodeAsync(
    () => context.composition.activateCommittedFunding(activationInput(context)),
    'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REJECTED',
  );
  assert.equal(fired, true);
  assert.equal(context.observerStore.load().outbox.status, 'EQUIVOCATED');
  assert.equal(context.serviceStore.load().state.grants.length, 0);
});

test('exact concurrent activation shares one operation and changed completed binding conflicts', async t => {
  const context = fixture(t);
  const input = activationInput(context);
  const firstPromise = context.composition.activateCommittedFunding(input);
  const replayPromise = context.composition.activateCommittedFunding(structuredClone(input));
  assert.equal(firstPromise, replayPromise);
  const changedWhileActive = activationInput(context);
  changedWhileActive.intent.totalUnits += 1;
  expectCode(
    () => context.composition.activateCommittedFunding(changedWhileActive),
    'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_BUSY',
  );
  const [first, replay] = await Promise.all([firstPromise, replayPromise]);
  assert.deepEqual(replay, first);
  assert.equal(context.serviceStore.load().state.grants.length, 1);
  const changed = activationInput(context);
  changed.intent.totalUnits += 1;
  await expectCodeAsync(
    () => context.composition.activateCommittedFunding(changed),
    'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_CONFLICT',
  );
  assert.equal(context.serviceStore.load().state.grants.length, 1);
});

test('commit ambiguity returns no success, latches the owner, and reopen replay reconciles', async t => {
  let armed = false;
  const context = fixture(t, {
    serviceHooks: {
      afterCommit({ operation, changed }) {
        if (armed && changed && operation === 'activateGrantFromTrustedRecord') {
          throw new Error('synthetic commit-boundary failure');
        }
      },
    },
  });
  const input = activationInput(context);
  armed = true;
  await expectCodeAsync(
    () => context.composition.activateCommittedFunding(input),
    'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_OUTCOME_UNKNOWN',
  );
  expectCode(
    () => context.composition.createFundingResource({
      selection: selection(),
      resourceUrl: RESOURCE_URL,
    }),
    'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_LATCHED',
  );
  await expectCodeAsync(
    () => context.composition.activateCommittedFunding(input),
    'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_LATCHED',
  );

  context.serviceStore.close();
  context.observerStore.close();
  context.serviceStore = ServiceCreditSqliteStore.openExisting(context.serviceOpenConfiguration);
  context.observerStore = openZenonFundingObserverSqliteStore({
    databasePath: context.observerConfiguration.databasePath,
    allowedRoot: context.directory,
    expectedRecordKey: context.observerRecordKey,
    authorityRecord: AUTHORITY_RECORD_TEXT,
  });
  context.composition = createZenonFundingComposition({
    serviceCreditStore: context.serviceStore,
    fundingObserverStore: context.observerStore,
    authorityRecord: AUTHORITY_RECORD_TEXT,
    deriveFundingTerms: fundingTerms,
    now: () => NOW,
  });
  const reconciled = await context.composition.activateCommittedFunding(input);
  assert.equal(reconciled.grant.totalUnits, 10);
  assert.equal(context.serviceStore.load().state.grants.length, 1);
  assert.notEqual(context.observerStore.projectCommittedFundingEvidence(), null);
});

test('hostile inputs and trusted-callback reentrancy fail with fixed codes and no grant', async t => {
  const context = fixture(t);
  const hostile = [
    new Proxy(activationInput(context), {}),
    Object.defineProperty({}, 'intent', { enumerable: true, get() { throw new Error('getter'); } }),
    { intent: { then() {} }, paymentRequired: {} },
    { intent: { oversized: 'x'.repeat(300_000) }, paymentRequired: {} },
  ];
  const cyclic = activationInput(context);
  cyclic.intent.self = cyclic.intent;
  hostile.push(cyclic);
  for (const input of hostile) {
    await expectCodeAsync(
      () => context.composition.activateCommittedFunding(input),
      'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_INVALID_INPUT',
    );
  }
  assert.equal(context.serviceStore.load().state.grants.length, 0);

  let owner;
  let armed = false;
  const reentrantPolicy = input => {
    if (armed) {
      owner.createFundingResource({ selection: selection(), resourceUrl: RESOURCE_URL });
    }
    return fundingTerms(input);
  };
  owner = createZenonFundingComposition({
    serviceCreditStore: context.serviceStore,
    fundingObserverStore: context.observerStore,
    authorityRecord: AUTHORITY_RECORD_TEXT,
    deriveFundingTerms: reentrantPolicy,
    now: () => NOW,
  });
  armed = true;
  expectCode(
    () => owner.createFundingResource({ selection: selection(), resourceUrl: RESOURCE_URL }),
    'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REENTRANT_OPERATION',
  );
  assert.equal(context.serviceStore.load().state.grants.length, 0);
});

test('throwing and asynchronous provider policies cannot become activation authority', t => {
  const context = fixture(t, { stage: 'NONE' });
  for (const policy of [
    () => { throw new Error('synthetic policy failure'); },
    async input => fundingTerms(input),
    () => ({ then() {} }),
  ]) {
    const owner = createZenonFundingComposition({
      serviceCreditStore: context.serviceStore,
      fundingObserverStore: context.observerStore,
      authorityRecord: AUTHORITY_RECORD_TEXT,
      deriveFundingTerms: policy,
      now: () => NOW,
    });
    expectCode(
      () => owner.createFundingResource({ selection: selection(), resourceUrl: RESOURCE_URL }),
      'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_REJECTED',
    );
  }
  assert.equal(context.serviceStore.load().state.grants.length, 0);
});

test('facades, proxies, shadowed methods, and post-construction replacement reject', t => {
  const context = fixture(t, { stage: 'NONE' });
  const base = {
    authorityRecord: AUTHORITY_RECORD_TEXT,
    deriveFundingTerms: fundingTerms,
    now: () => NOW,
  };
  for (const stores of [
    {
      serviceCreditStore: new Proxy(context.serviceStore, {}),
      fundingObserverStore: context.observerStore,
    },
    {
      serviceCreditStore: context.serviceStore,
      fundingObserverStore: new Proxy(context.observerStore, {}),
    },
    {
      serviceCreditStore: {
        getOffer: context.serviceStore.getOffer.bind(context.serviceStore),
        activateGrantFromTrustedRecord:
          context.serviceStore.activateGrantFromTrustedRecord.bind(context.serviceStore),
      },
      fundingObserverStore: context.observerStore,
    },
  ]) {
    expectCode(
      () => createZenonFundingComposition({ ...stores, ...base }),
      'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_INVALID_CONFIGURATION',
    );
  }

  Object.defineProperty(context.observerStore, 'projectCommittedFundingEvidence', {
    configurable: true,
    value: () => ({ forged: true }),
  });
  expectCode(
    () => context.composition.activateCommittedFunding(activationInput(context)),
    'SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_INVALID_CONFIGURATION',
  );
  delete context.observerStore.projectCommittedFundingEvidence;
});

test('production composition contains no outbox consumption or cross-store transaction claim', () => {
  const source = readFileSync(
    new URL('../src/service-credit-zenon-funding-composition.js', import.meta.url),
    'utf8',
  );
  for (const forbidden of [
    'commitAuthenticatedEnvelope', 'peekPreparedAttestation', 'BEGIN IMMEDIATE',
    'markConsumed', 'consumeOutbox', 'exactly-once', 'canonical chain truth',
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
});
