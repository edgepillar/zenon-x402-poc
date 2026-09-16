import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash, generateKeyPairSync, sign, X509Certificate } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  chmodSync,
  accessSync,
  constants as fsConstants,
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { connect as connectNet, createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PassThrough } from 'node:stream';
import { connect as connectTls, rootCertificates as tlsRootCertificates } from 'node:tls';

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
import { createZenonDurableHttpComposition } from '../src/service-credit-zenon-durable-http-composition.js';
import { createServiceCreditAuthorization } from '../src/service-credit-client.js';
import {
  SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION,
  createServiceCreditExternalHolderGrantDescriptorSigningBytes,
} from '../src/service-credit-external-holder-grant-descriptor-handoff.js';
import {
  SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_BYTES,
  SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_PAIRS as
    EXTERNAL_HOLDER_HANDOFF_MAX_HEADER_COUNT,
  SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_REDEMPTION_BYTES as
    EXTERNAL_HOLDER_HANDOFF_MAX_REDEMPTION_BYTES,
} from '../src/service-credit-external-holder-grant-descriptor-handoff-http.js';
import {
  createServiceCreditExternalHolderGrantDescriptorHandoffHttpIngress,
} from '../src/service-credit-external-holder-grant-descriptor-handoff-http-ingress.js';
import {
  createServiceCreditBoundedHttpsIngressOwner,
} from '../src/service-credit-bounded-https-ingress-owner.js';
import {
  createServiceCreditBoundedNodeHttpsServerFactory,
} from '../src/service-credit-bounded-node-https-server-factory.js';
import {
  createServiceCreditZenonDurableHttpsRouter,
} from '../src/service-credit-zenon-durable-https-router.js';
import {
  SERVICE_CREDIT_HTTP_PATH,
  SERVICE_CREDIT_HTTP_ROUTE_ID,
} from '../src/service-credit-http.js';
import {
  SERVICE_CREDIT_MODEL_VERSION,
} from '../src/service-credit-model.js';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';
import {
  decodeB64Json,
  HEADERS,
  MAX_X402_HEADER_ENCODED_BYTES,
} from '../src/x402-wire.js';

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

function offer(resourceUrl = RESOURCE_URL) {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.reference',
    serviceId: 'service.reference',
    resourceId: 'resource.zenon.funding',
    resourceBinding: deriveServiceCreditResourceBinding({
      resourceId: 'resource.zenon.funding',
      resourceUrl,
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

function preliminaryChallenge(serviceStore, resourceUrl = RESOURCE_URL) {
  const activation = createZenonFundingEvidenceActivation({
    store: serviceStore,
    deriveFundingTerms: fundingTerms,
    verifyFundingEvidence: async () => {
      throw new Error('unused synthetic verifier');
    },
    authorityProfile: structuredClone(AUTHORITY.authorityProfile),
    now: () => NOW,
  });
  return activation.createFundingResource({ selection: selection(), resourceUrl });
}

function observerTarget(prepared, resourceUrl = RESOURCE_URL) {
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
    resourceBinding: offer(resourceUrl).resourceBinding,
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

function observerState(prepared, targetOverrides = {}, resourceUrl = RESOURCE_URL) {
  return createZenonFundingObserverState({
    observerPolicy: structuredClone(AUTHORITY.observerPolicy),
    authorityGeneration: structuredClone(AUTHORITY.authorityGeneration),
    chainProfile: structuredClone(AUTHORITY.chainProfile),
    confirmationPolicy: structuredClone(AUTHORITY.confirmationPolicy),
    target: { ...observerTarget(prepared, resourceUrl), ...targetOverrides },
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
  resourceUrl = RESOURCE_URL,
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
  serviceStore.registerOffer(offer(resourceUrl));
  const prepared = preliminaryChallenge(serviceStore, resourceUrl);
  const observerConfiguration = {
    databasePath: join(directory, 'observer.sqlite'),
    allowedRoot: directory,
    initialState: observerState(prepared, targetOverrides, resourceUrl),
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
    resourceUrl,
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
      resourceUrl,
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

function authorization(request, grant = undefined) {
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
  if (grant !== undefined) {
    return createServiceCreditAuthorization({
      grant: {
        grantId: grant.grantId,
        capabilityCommitment: grant.capabilityCommitment,
      },
      request,
      proof,
    });
  }
  return `ServiceCredit ${Buffer.from(canonicalJson(proof), 'utf8').toString('base64url')}`;
}

const EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH =
  '/test-only/service-credit/external-holder/grant-descriptor/challenge';
const EXTERNAL_HOLDER_HANDOFF_REDEEM_PATH =
  '/test-only/service-credit/external-holder/grant-descriptor/redeem';
const EXTERNAL_HOLDER_HANDOFF_CHALLENGE_LIFETIME_MS = 1_000;
const EXTERNAL_HOLDER_HANDOFF_MAX_CHALLENGE_RESPONSE_BYTES = 256;
const EXTERNAL_HOLDER_HANDOFF_MAX_REDEMPTION_RESPONSE_BYTES = 384;
const EXTERNAL_HOLDER_HANDOFF_FAILURE_BODY = '{"error":"unavailable"}';
const CANONICAL_CONTENT_LENGTH = /^(?:0|[1-9][0-9]*)$/;
const EXTERNAL_HOLDER_CHALLENGE_VALUE = /^[A-Za-z0-9_-]{43}$/;
const SERVICE_CREDIT_COMMITMENT = /^sha256:[0-9a-f]{64}$/;
const SERVICE_CREDIT_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function hasExactPlainDataShape(value, expectedKeys) {
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    return false;
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expectedKeys.length) return false;
  return expectedKeys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined
      && descriptor.enumerable
      && Object.hasOwn(descriptor, 'value');
  });
}

function parseCanonicalHandoffJson(body) {
  try {
    const text = body.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(body)) return null;
    const parsed = JSON.parse(text);
    return canonicalJson(parsed) === text ? parsed : null;
  } catch {
    return null;
  }
}

function isPublicHandoffChallenge(challenge) {
  return hasExactPlainDataShape(challenge, ['handoffVersion', 'challenge', 'expiresAtMs'])
    && challenge.handoffVersion
      === SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION
    && EXTERNAL_HOLDER_CHALLENGE_VALUE.test(challenge.challenge)
    && Number.isSafeInteger(challenge.expiresAtMs)
    && challenge.expiresAtMs > 0;
}

function parseHandoffChallengeResponse(body) {
  const challenge = parseCanonicalHandoffJson(body);
  if (!isPublicHandoffChallenge(challenge)) {
    throw syntheticHttpsFailure(SYNTHETIC_HTTPS_FAILURE.response);
  }
  return Object.freeze({
    handoffVersion: challenge.handoffVersion,
    challenge: challenge.challenge,
    expiresAtMs: challenge.expiresAtMs,
  });
}

function parseHandoffDescriptorResponse(body) {
  const descriptor = parseCanonicalHandoffJson(body);
  if (
    !hasExactPlainDataShape(descriptor, ['grantId', 'capabilityCommitment'])
    || !SERVICE_CREDIT_IDENTIFIER.test(descriptor.grantId)
    || !SERVICE_CREDIT_COMMITMENT.test(descriptor.capabilityCommitment)
  ) {
    throw syntheticHttpsFailure(SYNTHETIC_HTTPS_FAILURE.response);
  }
  return Object.freeze({
    grantId: descriptor.grantId,
    capabilityCommitment: descriptor.capabilityCommitment,
  });
}

function externalHolderRedemption(challenge, origin, holderSelection, signingOrigin = origin) {
  return {
    challenge,
    publicKey: CAPABILITY_KEYS.publicKey,
    signature: sign(
      null,
      createServiceCreditExternalHolderGrantDescriptorSigningBytes({
        ...challenge,
        origin: signingOrigin,
        selection: holderSelection,
      }),
      CAPABILITY_KEYS.privateKey,
    ).toString('base64url'),
  };
}

// Test-only TLS ingress; no production funding route or process restart is implied.
const SYNTHETIC_HTTPS_FAILURE = Object.freeze({
  prerequisite: 'SYNTHETIC_HTTPS_PREREQUISITE_UNAVAILABLE',
  material: 'SYNTHETIC_HTTPS_MATERIAL_UNAVAILABLE',
  generation: 'SYNTHETIC_HTTPS_GENERATION_FAILED',
  certificate: 'SYNTHETIC_HTTPS_CERTIFICATE_INVALID',
  listen: 'SYNTHETIC_HTTPS_LISTEN_FAILED',
  fixture: 'SYNTHETIC_HTTPS_FIXTURE_UNAVAILABLE',
  request: 'SYNTHETIC_HTTPS_REQUEST_FAILED',
  response: 'SYNTHETIC_HTTPS_RESPONSE_FAILED',
  deadline: 'SYNTHETIC_HTTPS_DEADLINE_EXCEEDED',
  close: 'SYNTHETIC_HTTPS_TRANSPORT_CLOSE_UNCERTAIN',
  ownerClose: 'SYNTHETIC_HTTPS_OWNER_CLOSE_UNCERTAIN',
  cleanup: 'SYNTHETIC_HTTPS_CLEANUP_UNCERTAIN',
});

function syntheticHttpsFailure(code) {
  const error = new Error(code);
  error.name = 'SyntheticHttpsPilotError';
  error.code = code;
  error.stack = `SyntheticHttpsPilotError: ${code}`;
  return error;
}

function isSyntheticHttpsFailure(error, code) {
  try {
    return error?.name === 'SyntheticHttpsPilotError'
      && error?.code === code
      && error?.message === code
      && error?.stack === `SyntheticHttpsPilotError: ${code}`;
  } catch { return false; }
}

function syntheticHttpsMaterial() {
  const executable = '/usr/bin/openssl';
  let directory = null;
  let root = null;
  let uid = null;
  const identity = (path, directoryExpected) => {
    const state = lstatSync(path);
    assert.equal(state.uid, uid);
    assert.equal(state.isSymbolicLink(), false);
    assert.equal(directoryExpected ? state.isDirectory() : state.isFile(), true);
    return { dev: state.dev, ino: state.ino, uid: state.uid, mode: state.mode & 0o777 };
  };
  const same = (path, expected, directoryExpected) =>
    assert.deepEqual(identity(path, directoryExpected), expected);
  const files = new Map();
  const capture = name => {
    const state = identity(join(directory, name), false);
    assert.equal(state.dev, root.dev);
    files.set(name, state);
    return state;
  };
  let key = null;
  let cert = null;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    assert.notEqual(root, null);
    same(directory, root, true);
    const found = readdirSync(directory);
    assert.equal(found.every(name => files.has(name)), true);
    for (const name of found) same(join(directory, name), files.get(name), false);
    key?.fill(0);
    cert?.fill(0);
    for (const name of ['key.pem', 'cert.pem', 'tls.cnf']) {
      if (!files.has(name)) continue;
      same(directory, root, true);
      same(join(directory, name), files.get(name), false);
      unlinkSync(join(directory, name));
    }
    same(directory, root, true);
    assert.deepEqual(readdirSync(directory), []);
    rmdirSync(directory);
    assert.equal(existsSync(directory), false);
    cleaned = true;
  };
  let failureCode = SYNTHETIC_HTTPS_FAILURE.prerequisite;
  try {
    const binary = lstatSync(executable);
    assert.equal(binary.isFile() && binary.uid === 0 && (binary.mode & 0o022) === 0, true);
    accessSync(executable, fsConstants.X_OK);
    uid = process.getuid();
    const privateParent = realpathSync(tmpdir());
    failureCode = SYNTHETIC_HTTPS_FAILURE.material;
    directory = mkdtempSync(join(privateParent, 'zenon-composition-tls-'));
    root = identity(directory, true);
    chmodSync(directory, 0o700);
    root = identity(directory, true);
    assert.equal(root.mode, 0o700);
    const configPath = join(directory, 'tls.cnf');
    const keyPath = join(directory, 'key.pem');
    const certPath = join(directory, 'cert.pem');
    writeFileSync(configPath,
      '[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=v3_req\n'
      + '[dn]\nCN=127.0.0.1\n'
      + '[v3_req]\nsubjectAltName=IP:127.0.0.1\nbasicConstraints=CA:FALSE\n'
      + 'keyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n',
      { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    capture('tls.cnf');
    failureCode = SYNTHETIC_HTTPS_FAILURE.generation;
    const previousUmask = process.umask(0o077);
    let generated;
    try {
      generated = childProcess.spawnSync(executable, [
        'req', '-x509', '-newkey', 'ec', '-pkeyopt',
        'ec_paramgen_curve:prime256v1', '-sha256', '-nodes', '-days', '1',
        '-keyout', keyPath, '-out', certPath, '-config', configPath, '-extensions', 'v3_req',
      ], { env: {}, encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024 });
    } finally {
      process.umask(previousUmask);
    }
    for (const name of ['key.pem', 'cert.pem']) {
      if (existsSync(join(directory, name))) capture(name);
    }
    if (generated.status !== 0 || generated.error !== undefined) {
      throw syntheticHttpsFailure(SYNTHETIC_HTTPS_FAILURE.generation);
    }
    failureCode = SYNTHETIC_HTTPS_FAILURE.certificate;
    assert.equal(files.get('key.pem').mode, 0o600);
    key = readFileSync(keyPath);
    cert = readFileSync(certPath);
    const parsed = new X509Certificate(cert);
    assert.equal(parsed.checkIP('127.0.0.1'), '127.0.0.1');
    const validityHours = (Date.parse(parsed.validTo) - Date.parse(parsed.validFrom)) / 3_600_000;
    assert.equal(validityHours > 0 && validityHours <= 24, true);
    return { key, cert, cleanup };
  } catch {
    if (directory !== null) {
      try { cleanup(); } catch { throw syntheticHttpsFailure(SYNTHETIC_HTTPS_FAILURE.cleanup); }
    }
    throw syntheticHttpsFailure(failureCode);
  }
}

function syntheticWrongPinnedCertificate() {
  try {
    const certificate = tlsRootCertificates[0];
    assert.equal(typeof certificate, 'string');
    const pinned = Buffer.from(certificate, 'ascii');
    new X509Certificate(pinned);
    return pinned;
  } catch {
    throw syntheticHttpsFailure(SYNTHETIC_HTTPS_FAILURE.certificate);
  }
}

async function reserveSyntheticHttpsLoopbackPort() {
  const reservation = createNetServer();
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      try { reservation.close(); } catch {}
      reject(syntheticHttpsFailure(SYNTHETIC_HTTPS_FAILURE.listen));
    };
    reservation.once('error', fail);
    try {
      reservation.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
        let address;
        try { address = reservation.address(); }
        catch { fail(); return; }
        if (
          address === null
          || typeof address !== 'object'
          || !Number.isSafeInteger(address.port)
          || address.port < 1
        ) {
          fail();
          return;
        }
        reservation.close(error => {
          if (settled) return;
          if (error !== undefined) { fail(); return; }
          settled = true;
          resolve(address.port);
        });
      });
    } catch { fail(); }
  });
}

function pinnedHttpsExchange({
  route,
  cert,
  path,
  method,
  body,
  headers,
  maximumResponseBytes,
  expectedStatus = null,
  expectedContentType = null,
  expectedCacheControl = null,
  requireContentLength = false,
  dispatchRequest = request => request.end(body),
}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let request = null;
    let responseStarted = false;
    let settled = false;
    let successfulResult = null;
    let requestClosed = false;
    const finishSuccess = () => {
      if (successfulResult !== null && requestClosed) resolve(successfulResult);
    };
    const fail = code => {
      if (settled) return;
      settled = true;
      try { request?.destroy(); } catch {}
      reject(syntheticHttpsFailure(code));
    };
    try {
      request = httpsRequest({
        hostname: '127.0.0.1',
        port: route.port,
        path,
        method,
        agent: false,
        ca: cert,
        rejectUnauthorized: true,
        ALPNProtocols: ['http/1.1'],
        headers: {
          ...(route.authority === undefined ? {} : { Host: route.authority }),
          ...headers,
        },
      }, response => {
        responseStarted = true;
        let verified;
        try { verified = response.socket.authorized === true; }
        catch { fail(SYNTHETIC_HTTPS_FAILURE.response); return; }
        const declaredLength = response.headers['content-length'];
        const validDeclaredLength = typeof declaredLength === 'string'
          && CANONICAL_CONTENT_LENGTH.test(declaredLength)
          && Number(declaredLength) <= maximumResponseBytes;
        if (
          !verified
          || (expectedStatus !== null && response.statusCode !== expectedStatus)
          || (expectedContentType !== null
            && response.headers['content-type'] !== expectedContentType)
          || (expectedCacheControl !== null
            && response.headers['cache-control'] !== expectedCacheControl)
          || (requireContentLength && !validDeclaredLength)
        ) {
          fail(SYNTHETIC_HTTPS_FAILURE.response);
          return;
        }
        response.on('data', chunk => {
          bytes += chunk.length;
          if (
            bytes > maximumResponseBytes
            || (validDeclaredLength && bytes > Number(declaredLength))
          ) {
            fail(SYNTHETIC_HTTPS_FAILURE.response);
            return;
          }
          chunks.push(chunk);
        });
        response.once('error', () => fail(SYNTHETIC_HTTPS_FAILURE.response));
        response.once('aborted', () => fail(SYNTHETIC_HTTPS_FAILURE.response));
        response.once('close', () => fail(SYNTHETIC_HTTPS_FAILURE.response));
        response.once('end', () => {
          if (settled) return;
          if (requireContentLength && bytes !== Number(declaredLength)) {
            fail(SYNTHETIC_HTTPS_FAILURE.response);
            return;
          }
          try {
            successfulResult = {
              verified,
              statusCode: response.statusCode,
              headers: response.headers,
              body: Buffer.concat(chunks),
            };
            settled = true;
            finishSuccess();
          } catch { fail(SYNTHETIC_HTTPS_FAILURE.response); }
        });
      });
      request.setTimeout(5_000, () => fail(SYNTHETIC_HTTPS_FAILURE.deadline));
      request.once('error', () => fail(SYNTHETIC_HTTPS_FAILURE.request));
      request.once('close', () => {
        requestClosed = true;
        if (!responseStarted) fail(SYNTHETIC_HTTPS_FAILURE.request);
        else finishSuccess();
      });
      dispatchRequest(request);
    } catch { fail(SYNTHETIC_HTTPS_FAILURE.request); }
  });
}

function httpsExchange(route, cert, authorizationValue = undefined) {
  return pinnedHttpsExchange({
    route,
    cert,
    path: route.path,
    method: 'POST',
    body: Buffer.alloc(0),
    headers: {
      'Content-Length': '0',
      Connection: 'close',
      ...(authorizationValue === undefined ? {} : { Authorization: authorizationValue }),
    },
    maximumResponseBytes: 16 * 1024,
  });
}

function handoffRequestHeaders(path, bodyLength, negativeHeaderOverrides = undefined) {
  const headers = {
    'Content-Length': String(bodyLength),
    Connection: 'close',
    ...(path === EXTERNAL_HOLDER_HANDOFF_REDEEM_PATH
      ? { 'Content-Type': 'application/json' }
      : {}),
  };
  if (negativeHeaderOverrides === undefined) return headers;
  for (const [name, value] of Object.entries(negativeHeaderOverrides)) {
    const existing = Object.keys(headers).find(
      headerName => headerName.toLowerCase() === name.toLowerCase(),
    );
    if (existing !== undefined) delete headers[existing];
    if (value !== null) headers[name] = value;
  }
  return headers;
}

function httpsHandoffExchange(route, cert, {
  path,
  body = Buffer.alloc(0),
  method = 'POST',
  negativeHeaderOverrides,
  expectedStatus,
  dispatchRequest,
}) {
  const maximumResponseBytes = path === EXTERNAL_HOLDER_HANDOFF_REDEEM_PATH
    ? EXTERNAL_HOLDER_HANDOFF_MAX_REDEMPTION_RESPONSE_BYTES
    : EXTERNAL_HOLDER_HANDOFF_MAX_CHALLENGE_RESPONSE_BYTES;
  return pinnedHttpsExchange({
    route,
    cert,
    path,
    method,
    body,
    headers: handoffRequestHeaders(path, body.length, negativeHeaderOverrides),
    maximumResponseBytes,
    expectedStatus,
    expectedContentType: 'application/json',
    expectedCacheControl: 'private, no-store, max-age=0',
    requireContentLength: true,
    ...(dispatchRequest === undefined ? {} : { dispatchRequest }),
  });
}

function beginPausedHandoffRedemption(route, cert, redemption) {
  const body = Buffer.from(canonicalJson(redemption), 'utf8');
  if (body.length < 2) throw syntheticHttpsFailure(SYNTHETIC_HTTPS_FAILURE.fixture);
  let resolveFirstWrite = null;
  const firstWrite = new Promise(resolve => { resolveFirstWrite = resolve; });
  const response = httpsHandoffExchange(route, cert, {
    path: EXTERNAL_HOLDER_HANDOFF_REDEEM_PATH,
    body,
    expectedStatus: 503,
    dispatchRequest(request) {
      request.write(body.subarray(0, 1), () => resolveFirstWrite());
    },
  });
  return Object.freeze({
    response,
    firstWrite,
  });
}

function rawPinnedTlsExchange(route, cert, requestBytes) {
  return new Promise((resolve, reject) => {
    let socket = null;
    let settled = false;
    let responseBytes = 0;
    let authenticated = false;
    let requestDispatched = false;
    const finish = callback => {
      if (settled) return;
      settled = true;
      callback();
    };
    try {
      socket = connectTls({
        host: '127.0.0.1',
        port: route.port,
        ca: cert,
        rejectUnauthorized: true,
        ALPNProtocols: ['http/1.1'],
      });
      socket.setTimeout(3_000, () => {
        try { socket.destroy(); } catch {}
        finish(() => reject(syntheticHttpsFailure(SYNTHETIC_HTTPS_FAILURE.deadline)));
      });
      socket.once('secureConnect', () => {
        try {
          if (socket.authorized !== true || socket.alpnProtocol !== 'http/1.1') {
            throw syntheticHttpsFailure(SYNTHETIC_HTTPS_FAILURE.request);
          }
          authenticated = true;
          requestDispatched = true;
          socket.end(requestBytes);
        }
        catch {
          try { socket.destroy(); } catch {}
          finish(() => reject(syntheticHttpsFailure(SYNTHETIC_HTTPS_FAILURE.request)));
        }
      });
      socket.on('data', chunk => {
        responseBytes += chunk.length;
        if (responseBytes > 16 * 1024) {
          try { socket.destroy(); } catch {}
          finish(() => reject(syntheticHttpsFailure(SYNTHETIC_HTTPS_FAILURE.response)));
        }
      });
      socket.once('error', () => {
        finish(() => {
          if (authenticated && requestDispatched) resolve(responseBytes);
          else reject(syntheticHttpsFailure(SYNTHETIC_HTTPS_FAILURE.request));
        });
      });
      socket.once('close', () => finish(() => {
        if (authenticated && requestDispatched) resolve(responseBytes);
        else reject(syntheticHttpsFailure(SYNTHETIC_HTTPS_FAILURE.request));
      }));
    } catch {
      try { socket?.destroy(); } catch {}
      finish(() => reject(syntheticHttpsFailure(SYNTHETIC_HTTPS_FAILURE.request)));
    }
  });
}

function assertHandoffUnavailableResponse(response) {
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.toString('utf8'), EXTERNAL_HOLDER_HANDOFF_FAILURE_BODY);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers.connection, 'close');
}

async function expectHandoffUnavailable(route, cert, request) {
  const response = await httpsHandoffExchange(route, cert, {
    ...request,
    expectedStatus: 503,
  });
  assertHandoffUnavailableResponse(response);
}

async function obtainExternalHolderChallenge(route, cert) {
  const response = await httpsHandoffExchange(route, cert, {
    path: EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH,
    expectedStatus: 200,
  });
  return parseHandoffChallengeResponse(response.body);
}

async function redeemExternalHolderDescriptor(route, cert, redemption) {
  const response = await httpsHandoffExchange(route, cert, {
    path: EXTERNAL_HOLDER_HANDOFF_REDEEM_PATH,
    body: Buffer.from(canonicalJson(redemption), 'utf8'),
    expectedStatus: 200,
  });
  return parseHandoffDescriptorResponse(response.body);
}

async function offlineHttpsPilot(t) {
  const tls = syntheticHttpsMaterial();
  // The fixed-port adapter contract requires this test-only release-before-use
  // reservation. Another local process could win the resulting allocation race.
  let bindPort;
  try { bindPort = await reserveSyntheticHttpsLoopbackPort(); }
  catch (error) {
    try { tls.cleanup(); }
    catch { throw syntheticHttpsFailure(SYNTHETIC_HTTPS_FAILURE.cleanup); }
    throw error;
  }
  const holderSelection = Object.freeze({ ...selection() });
  let context = null;
  let activeOwner = null;
  let handoffController = null;
  let handoffControllerClose = Promise.resolve();
  let handoffNow = NOW;
  let phase = 'UNAVAILABLE';
  let handlerAdmissions = 0;
  let ownerReads = 0;
  let ingressOwner = null;
  let factoryEntered = false;
  let factoryCompleted = false;
  const handoffEvents = new EventEmitter();
  const latchTimers = new Set();
  const outerDeadlineHandles = new Set();
  const controllerDeadlineHandles = new Set();
  const deadlineRuntimeFor = handles => Object.freeze({
    schedule: Object.freeze((callback, milliseconds) => {
      let handle = null;
      handle = setTimeout(() => {
        handles.delete(handle);
        callback();
      }, milliseconds);
      handles.add(handle);
      return handle;
    }),
    cancel: Object.freeze(handle => {
      clearTimeout(handle);
      handles.delete(handle);
      return true;
    }),
  });
  const outerDeadlineRuntime = deadlineRuntimeFor(outerDeadlineHandles);
  const controllerDeadlineRuntime = deadlineRuntimeFor(controllerDeadlineHandles);
  const waitForHandoffEvent = eventName => new Promise((resolve, reject) => {
    let deadline = null;
    const settle = (callback, value) => {
      handoffEvents.off(eventName, onEvent);
      if (deadline !== null) {
        clearTimeout(deadline);
        latchTimers.delete(deadline);
      }
      callback(value);
    };
    const onEvent = value => settle(resolve, value);
    handoffEvents.once(eventName, onEvent);
    deadline = setTimeout(
      () => settle(reject, syntheticHttpsFailure(SYNTHETIC_HTTPS_FAILURE.deadline)),
      3_000,
    );
    latchTimers.add(deadline);
  });
  const closeHandoff = () => {
    phase = 'UNAVAILABLE';
    const activeController = handoffController;
    handoffController = null;
    if (activeController !== null) handoffControllerClose = activeController.close();
    return handoffControllerClose;
  };
  t.after(async () => {
    // The production transport owner gates and closes its downstream router
    // before the durable owner and stores are closed by this outer composition.
    let ingressCloseFailed = false;
    try {
      if (ingressOwner !== null) await ingressOwner.close();
    } catch { ingressCloseFailed = true; }
    for (const deadline of latchTimers) clearTimeout(deadline);
    latchTimers.clear();
    handoffEvents.removeAllListeners();
    if (ingressOwner !== null) {
      const metrics = ingressOwner.snapshotMetrics();
      if (
        metrics.phase !== 'CLOSED'
        || metrics.trackedSockets !== 0
        || metrics.trackedRequests !== 0
        || metrics.trackedHandlers !== 0
        || metrics.ownedTimers !== 0
      ) ingressCloseFailed = true;
    }
    if (outerDeadlineHandles.size !== 0 || controllerDeadlineHandles.size !== 0) {
      ingressCloseFailed = true;
    }
    let ownerCloseFailed = false;
    for (const close of [
      () => activeOwner?.close(),
      () => context?.session?.close(),
      () => context?.serviceStore?.close(),
      () => context?.observerStore?.close(),
    ]) {
      try { await close(); } catch { ownerCloseFailed = true; }
    }
    try { tls.cleanup(); }
    catch { throw syntheticHttpsFailure(SYNTHETIC_HTTPS_FAILURE.cleanup); }
    if (ingressCloseFailed || ownerCloseFailed) {
      throw syntheticHttpsFailure(SYNTHETIC_HTTPS_FAILURE.ownerClose);
    }
  });
  let setupFailureCode = SYNTHETIC_HTTPS_FAILURE.listen;
  try {
    const routerResourceUrl = `https://127.0.0.1${SERVICE_CREDIT_HTTP_PATH}`;
    const downstream = createServiceCreditZenonDurableHttpsRouter(Object.freeze({
      requestTargets: Object.freeze({
        serviceCredit: SERVICE_CREDIT_HTTP_PATH,
        handoffChallenge: EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH,
        handoffRedemption: EXTERNAL_HOLDER_HANDOFF_REDEEM_PATH,
      }),
      getPhase: Object.freeze(() => phase),
      fundingComposition: Object.freeze({
        createFundingResource: Object.freeze(resource =>
          context.composition.createFundingResource(resource)),
      }),
      fundingResource: Object.freeze({
        selection: Object.freeze(selection()),
        resourceUrl: routerResourceUrl,
      }),
      durableComposition: Object.freeze({
        handle: Object.freeze((request, response) => {
          if (activeOwner === null) throw syntheticHttpsFailure(
            SYNTHETIC_HTTPS_FAILURE.fixture,
          );
          return activeOwner.handle(request, response);
        }),
      }),
      handoffController: Object.freeze({
        handle: Object.freeze((request, response, transportContext) => {
          if (handoffController === null) throw syntheticHttpsFailure(
            SYNTHETIC_HTTPS_FAILURE.fixture,
          );
          return handoffController.handle(request, response, transportContext);
        }),
        close: Object.freeze(() => closeHandoff()),
      }),
    }));
    const nativeHttpsServerFactory = createServiceCreditBoundedNodeHttpsServerFactory(
      Object.freeze({
        bind: Object.freeze({ host: '127.0.0.1', port: bindPort, exclusive: true }),
        tlsMaterial: Object.freeze({ key: tls.key, cert: tls.cert }),
      }),
    );
    const trustedHttpsServerFactory = Object.freeze((serverOptions, callbacks) => {
      factoryEntered = true;
      const observedCallbacks = Object.freeze({
        connection: Object.freeze(socket => {
          callbacks.connection(socket);
          handoffEvents.emit('raw-connection-accounted');
        }),
        secureConnection: Object.freeze(socket => {
          for (const property of ['alpnProtocol', 'servername']) {
            const descriptor = Object.getOwnPropertyDescriptor(socket, property);
            assert.notEqual(descriptor, undefined);
            assert.equal(Object.hasOwn(descriptor, 'value'), true);
          }
          callbacks.secureConnection(socket);
        }),
        request: callbacks.request,
        checkContinue: callbacks.checkContinue,
        checkExpectation: callbacks.checkExpectation,
        upgrade: callbacks.upgrade,
        connect: callbacks.connect,
        clientError: callbacks.clientError,
        tlsClientError: callbacks.tlsClientError,
        dropRequest: callbacks.dropRequest,
        drop: callbacks.drop,
        timeout: callbacks.timeout,
        listening: callbacks.listening,
        close: callbacks.close,
        error: callbacks.error,
      });
      const capability = nativeHttpsServerFactory(serverOptions, observedCallbacks);
      factoryCompleted = true;
      return capability;
    });
    setupFailureCode = SYNTHETIC_HTTPS_FAILURE.fixture;
    ingressOwner = createServiceCreditBoundedHttpsIngressOwner({
      origin: 'https://127.0.0.1',
      requestTargets: Object.freeze([
        EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH,
        EXTERNAL_HOLDER_HANDOFF_REDEEM_PATH,
        SERVICE_CREDIT_HTTP_PATH,
      ]),
      generation: Object.freeze({
        generationId: 'synthetic.offline.https.pilot',
        generationVersion: 1,
      }),
      limits: Object.freeze({
        maxHeaderBytes:
          SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_BYTES,
        maxHeaderCount: EXTERNAL_HOLDER_HANDOFF_MAX_HEADER_COUNT * 2,
        maxConcurrentSockets: 8,
        maxConnectionStarts: 256,
        maxConcurrentRequests: 8,
        maxRequestStarts: 192,
        tlsHandshakeDeadlineMs: 2_000,
        headerDeadlineMs: 2_000,
        requestResponseDeadlineMs: 4_000,
        idleSocketDeadlineMs: 5_000,
        startDeadlineMs: 3_000,
        closeGraceMs: 6_000,
        metricsCounterLimit: 10_000,
      }),
      downstream,
      deadlineRuntime: outerDeadlineRuntime,
      httpsServerFactory: trustedHttpsServerFactory,
    });
    setupFailureCode = SYNTHETIC_HTTPS_FAILURE.listen;
    try { await ingressOwner.start(); }
    catch {
      if (!factoryEntered) setupFailureCode = SYNTHETIC_HTTPS_FAILURE.fixture;
      else if (!factoryCompleted) setupFailureCode = SYNTHETIC_HTTPS_FAILURE.generation;
      else if (ingressOwner.snapshotMetrics().listenerErrors !== 0) {
        setupFailureCode = SYNTHETIC_HTTPS_FAILURE.response;
      }
      throw syntheticHttpsFailure(setupFailureCode);
    }
    const route = {
      origin: 'https://127.0.0.1',
      authority: '127.0.0.1',
      path: SERVICE_CREDIT_HTTP_PATH,
      port: bindPort,
    };
    setupFailureCode = SYNTHETIC_HTTPS_FAILURE.fixture;
    context = fixture(t, {
      stage: 'PREPARED',
      resourceUrl: routerResourceUrl,
    });
    phase = 'CHALLENGE';
    return {
      context,
      route,
      cert: tls.cert,
      holderSelection,
      activate(owner) {
        if (phase === 'ACTIVE' || handoffController !== null) {
          throw syntheticHttpsFailure(SYNTHETIC_HTTPS_FAILURE.fixture);
        }
        const ownerDescriptorForSelection = owner?.getActiveGrantDescriptorForSelection;
        if (typeof ownerDescriptorForSelection !== 'function') {
          throw syntheticHttpsFailure(SYNTHETIC_HTTPS_FAILURE.fixture);
        }
        // Count only delegation to the real durable owner's selection-aware operation.
        const countedOwnerDescriptorForSelection = Object.freeze(requestedSelection => {
          ownerReads += 1;
          return ownerDescriptorForSelection(requestedSelection);
        });
        let nextController = null;
        nextController = createServiceCreditExternalHolderGrantDescriptorHandoffHttpIngress({
          origin: route.origin,
          selection: holderSelection,
          challengeLifetimeMs: EXTERNAL_HOLDER_HANDOFF_CHALLENGE_LIFETIME_MS,
          now: Object.freeze(() => handoffNow),
          getActiveGrantDescriptorForSelection: countedOwnerDescriptorForSelection,
          challengeRequestTarget: EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH,
          redemptionRequestTarget: EXTERNAL_HOLDER_HANDOFF_REDEEM_PATH,
          admitRequest: Object.freeze(admission => {
            handlerAdmissions += 1;
            if (admission.operation === 'REDEMPTION') {
              handoffEvents.emit('redemption-admitted', admission.operation);
            }
            return phase === 'ACTIVE' && handoffController === nextController;
          }),
          deadlineRuntime: controllerDeadlineRuntime,
          bodyDeadlineMs: 2_000,
          responseDeadlineMs: 2_000,
          closeGraceMs: 3_000,
          metricsCounterLimit: Number.MAX_SAFE_INTEGER,
        });
        activeOwner = owner;
        handoffController = nextController;
        phase = 'ACTIVE';
      },
      quiesce() { return closeHandoff(); },
      waitForRedemptionAdmission() { return waitForHandoffEvent('redemption-admitted'); },
      async waitForSocketDrain() {
        for (let turn = 0; turn < 64; turn += 1) {
          if (ingressOwner.snapshotMetrics().trackedSockets === 0) return;
          await new Promise(resolve => setImmediate(resolve));
        }
        throw syntheticHttpsFailure(SYNTHETIC_HTTPS_FAILURE.deadline);
      },
      async closeWithUnresolvedPreHandshake() {
        const accounted = waitForHandoffEvent('raw-connection-accounted');
        const socket = connectNet({ host: '127.0.0.1', port: route.port });
        socket.once('error', () => {});
        const clientClosed = new Promise(resolve => { socket.once('close', resolve); });
        await accounted;
        const result = await ingressOwner.close();
        await clientClosed;
        return Object.freeze({ result, metrics: ingressOwner.snapshotMetrics() });
      },
      expireHandoffChallenge(publicChallenge) {
        if (
          !Number.isSafeInteger(publicChallenge?.expiresAtMs)
          || publicChallenge.expiresAtMs < handoffNow
        ) throw syntheticHttpsFailure(SYNTHETIC_HTTPS_FAILURE.fixture);
        handoffNow = publicChallenge.expiresAtMs;
      },
      handlerAdmissionCount: () => handlerAdmissions,
      ownerReadCount: () => ownerReads,
      ownedSocketCount: () => ingressOwner.snapshotMetrics().trackedSockets,
      pendingLatchCount: () =>
        latchTimers.size + outerDeadlineHandles.size + controllerDeadlineHandles.size,
      handlerFailureCount: () =>
        ingressOwner.snapshotMetrics().handlerFailures,
    };
  } catch { throw syntheticHttpsFailure(setupFailureCode); }
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

test('offline HTTPS synthetic material failure is sanitized and removes owned files', t => {
  let generatedDirectory = null;
  const mocked = t.mock.method(childProcess, 'spawnSync', (_executable, args) => {
    generatedDirectory = dirname(args[args.indexOf('-keyout') + 1]);
    return { status: null, error: new Error('synthetic spawn failure') };
  });
  let caught = null;
  let material = null;
  try {
    material = syntheticHttpsMaterial();
  } catch (error) {
    caught = error;
  } finally {
    mocked.mock.restore();
    if (material !== null) {
      try { material.cleanup(); }
      catch { throw syntheticHttpsFailure(SYNTHETIC_HTTPS_FAILURE.cleanup); }
    }
  }
  assert.equal(isSyntheticHttpsFailure(caught, SYNTHETIC_HTTPS_FAILURE.generation), true);
  assert.notEqual(generatedDirectory, null);
  assert.equal(existsSync(generatedDirectory), false);
});

test('offline HTTPS client request failure is sanitized', async () => {
  let caught = null;
  try {
    await httpsExchange({ port: -1, path: SERVICE_CREDIT_HTTP_PATH }, Buffer.alloc(0));
  } catch (error) {
    caught = error;
  }
  assert.equal(isSyntheticHttpsFailure(caught, SYNTHETIC_HTTPS_FAILURE.request), true);
});

test('offline HTTPS harness hands an external holder durable credit across owner reopen', async t => {
  const pilot = await offlineHttpsPilot(t);
  const { context, route, cert, holderSelection } = pilot;
  assert.notEqual(EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH, SERVICE_CREDIT_HTTP_PATH);
  assert.notEqual(EXTERNAL_HOLDER_HANDOFF_REDEEM_PATH, SERVICE_CREDIT_HTTP_PATH);
  assert.notEqual(
    EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH,
    EXTERNAL_HOLDER_HANDOFF_REDEEM_PATH,
  );
  assert.deepEqual(Reflect.ownKeys(holderSelection), [
    'offerId', 'offerVersion', 'holderId', 'capabilityCommitment',
  ]);
  assert.equal(Object.isFrozen(holderSelection), true);
  await expectHandoffUnavailable(route, cert, {
    path: EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH,
  });
  assert.equal(pilot.ownerReadCount(), 0);

  const fundingChallenge = await httpsExchange(route, cert);
  assert.equal(fundingChallenge.statusCode, 402);
  const paymentRequired = decodeB64Json(fundingChallenge.headers[HEADERS.PAYMENT_REQUIRED], {
    maxEncodedBytes: MAX_X402_HEADER_ENCODED_BYTES,
  });
  assert.deepEqual(paymentRequired, context.prepared.paymentRequired);
  assert.equal(paymentRequired.resource.url, context.resourceUrl);
  assert.equal((await httpsExchange(route, cert, 'ServiceCredit synthetic')).statusCode, 402);
  assert.equal(context.serviceStore.load().state.grants.length, 0);

  const observed = {};
  const makeSigner = await syntheticSigningOperation(t, context, 'READY', observed);
  const signer = makeSigner();
  assert.deepEqual(await signer.start(), { status: 'READY_COMMITTED' });
  assert.equal(observed.dispatches, 1);
  assert.equal(context.observerStore.load().outbox.status, 'READY');
  await signer.close();

  let callbacks = 0;
  const makeOwner = () => createZenonDurableHttpComposition({
    serviceCreditStore: context.serviceStore,
    fundingObserverStore: context.observerStore,
    authorityRecord: AUTHORITY_RECORD_TEXT,
    deriveFundingTerms: fundingTerms,
    now: () => NOW,
    durableExecution: {
      ledgerId: 'ledger.offline.https.pilot',
      policy: {
        policyId: 'execution.offline.https.pilot',
        policyVersion: 1,
        maxDurationMs: 1_000,
      },
      capacity: 8,
      selectedDurationMs: 1_000,
    },
    execute: () => {
      callbacks += 1;
      return { resultCode: 'offline.https.pilot.delivered' };
    },
    deadlineRuntime: passiveDeadlineRuntime(),
  });
  let owner = makeOwner();
  assert.deepEqual(await owner.start(activationInput(context)), { status: 'ACTIVE' });
  pilot.activate(owner);
  assert.equal(pilot.ownerReadCount(), 0);

  const wrongCertificate = syntheticWrongPinnedCertificate();
  try {
    const admissionsBeforeWrongPin = pilot.handlerAdmissionCount();
    await assert.rejects(
      httpsHandoffExchange(route, wrongCertificate, {
        path: EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH,
        expectedStatus: 200,
      }),
      error => isSyntheticHttpsFailure(error, SYNTHETIC_HTTPS_FAILURE.request),
    );
    assert.equal(pilot.handlerAdmissionCount(), admissionsBeforeWrongPin);
  } finally {
    wrongCertificate.fill(0);
  }

  const rawOuterIngressCases = [
    [
      'equal duplicate content length',
      `POST ${EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH} HTTP/1.1\r\n`
        + 'Host: 127.0.0.1\r\nContent-Length: 0\r\nContent-Length: 0\r\n'
        + 'Connection: close\r\n\r\n',
    ],
    [
      'conflicting duplicate content length',
      `POST ${EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH} HTTP/1.1\r\n`
        + 'Host: 127.0.0.1\r\nContent-Length: 0\r\nContent-Length: 1\r\n'
        + 'Connection: close\r\n\r\nx',
    ],
    [
      'content length with transfer encoding',
      `POST ${EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH} HTTP/1.1\r\n`
        + 'Host: 127.0.0.1\r\nContent-Length: 0\r\nTransfer-Encoding: chunked\r\n'
        + 'Connection: close\r\n\r\n0\r\n\r\n',
    ],
    [
      'malformed header delimiter',
      `POST ${EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH} HTTP/1.1\r\n`
        + 'Host : 127.0.0.1\r\nContent-Length: 0\r\nConnection: close\r\n\r\n',
    ],
    [
      'malformed line endings',
      `POST ${EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH} HTTP/1.1\n`
        + 'Host: 127.0.0.1\nContent-Length: 0\nConnection: close\n\n',
    ],
    [
      'oversized headers',
      `POST ${EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH} HTTP/1.1\r\n`
        + `Host: 127.0.0.1\r\nX-Pad: ${'x'.repeat(
          SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_BYTES,
        )}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`,
    ],
    [
      'http 1.0',
      `POST ${EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH} HTTP/1.0\r\n`
        + 'Host: 127.0.0.1\r\nContent-Length: 0\r\nConnection: close\r\n\r\n',
    ],
    [
      'expect',
      `POST ${EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH} HTTP/1.1\r\n`
        + 'Host: 127.0.0.1\r\nContent-Length: 0\r\nExpect: 100-continue\r\n'
        + 'Connection: close\r\n\r\n',
    ],
    [
      'upgrade',
      `GET ${EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH} HTTP/1.1\r\n`
        + 'Host: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: synthetic\r\n\r\n',
    ],
    [
      'connect',
      'CONNECT service.example:443 HTTP/1.1\r\nHost: service.example:443\r\n'
        + 'Connection: close\r\n\r\n',
    ],
    [
      'pipelined second request',
      `POST ${EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH}?first-rejected=1 HTTP/1.1\r\n`
        + 'Host: 127.0.0.1\r\nContent-Length: 0\r\nConnection: keep-alive\r\n\r\n'
        + `POST ${EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH} HTTP/1.1\r\n`
        + 'Host: 127.0.0.1\r\nContent-Length: 0\r\nConnection: close\r\n\r\n',
    ],
  ];
  for (const [name, rawRequest] of rawOuterIngressCases) await t.test(name, async () => {
    const admissionsBefore = pilot.handlerAdmissionCount();
    const responseBytes = await rawPinnedTlsExchange(route, cert, rawRequest);
    assert.equal(Number.isSafeInteger(responseBytes) && responseBytes >= 0, true);
    assert.equal(pilot.handlerAdmissionCount(), admissionsBefore);
  });
  for (const request of [
    { path: `${EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH}?not-accepted=1`, method: 'POST' },
    { path: EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH, method: 'GET' },
  ]) {
    await expectHandoffUnavailable(route, cert, request);
  }
  for (const [name, negativeHeaderOverrides] of [
    ['noncanonical content length', { 'Content-Length': '00' }],
    ['transfer encoding', { 'Transfer-Encoding': 'chunked' }],
    ['client expectation', { Expect: '100-continue' }],
    ['client upgrade', { Connection: 'Upgrade', Upgrade: 'synthetic' }],
    ['challenge content type', { 'Content-Type': 'application/json' }],
    [
      'raw header pair ceiling',
      Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`X-Bound-${index}`, 'x'])),
    ],
  ]) await t.test(name, async () => {
    try {
      await expectHandoffUnavailable(route, cert, {
        path: EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH,
        negativeHeaderOverrides,
      });
    } catch (error) {
      assert.equal(
        (name === 'transfer encoding' || name === 'client upgrade')
          && isSyntheticHttpsFailure(error, SYNTHETIC_HTTPS_FAILURE.request),
        true,
      );
    }
  });
  await expectHandoffUnavailable(route, cert, {
    path: EXTERNAL_HOLDER_HANDOFF_REDEEM_PATH,
    body: Buffer.from('{"unexpected":true}', 'utf8'),
  });
  await expectHandoffUnavailable(route, cert, {
    path: EXTERNAL_HOLDER_HANDOFF_REDEEM_PATH,
    body: Buffer.alloc(EXTERNAL_HOLDER_HANDOFF_MAX_REDEMPTION_BYTES + 1, 0x20),
  });
  assert.equal(pilot.ownerReadCount(), 0);

  const wrongOriginChallenge = await obtainExternalHolderChallenge(route, cert);
  const wrongOriginProof = externalHolderRedemption(
    wrongOriginChallenge,
    route.origin,
    holderSelection,
    'https://wrong-origin.invalid',
  );
  await expectHandoffUnavailable(route, cert, {
    path: EXTERNAL_HOLDER_HANDOFF_REDEEM_PATH,
    body: Buffer.from(canonicalJson(wrongOriginProof), 'utf8'),
  });
  assert.equal(pilot.ownerReadCount(), 0);

  const expiredChallenge = await obtainExternalHolderChallenge(route, cert);
  const expiredProof = externalHolderRedemption(
    expiredChallenge,
    route.origin,
    holderSelection,
  );
  pilot.expireHandoffChallenge(expiredChallenge);
  await expectHandoffUnavailable(route, cert, {
    path: EXTERNAL_HOLDER_HANDOFF_REDEEM_PATH,
    body: Buffer.from(canonicalJson(expiredProof), 'utf8'),
  });
  assert.equal(pilot.ownerReadCount(), 0);

  const holderChallenge = await obtainExternalHolderChallenge(route, cert);
  const holderProof = externalHolderRedemption(holderChallenge, route.origin, holderSelection);
  const holderProofBody = Buffer.from(canonicalJson(holderProof), 'utf8');
  for (const negativeHeaderOverrides of [
    { 'Content-Type': null },
    { 'Content-Type': ['application/json', 'application/json'] },
    { 'content-type': 'application/json' },
    { 'Content-Type': 'Application/Json' },
    { 'Content-Type': 'application/json; charset=utf-8' },
  ]) {
    await expectHandoffUnavailable(route, cert, {
      path: EXTERNAL_HOLDER_HANDOFF_REDEEM_PATH,
      body: holderProofBody,
      negativeHeaderOverrides,
    });
    assert.equal(pilot.ownerReadCount(), 0);
  }
  const grantDescriptor = await redeemExternalHolderDescriptor(
    route,
    cert,
    holderProof,
  );
  assert.deepEqual(Reflect.ownKeys(grantDescriptor), ['grantId', 'capabilityCommitment']);
  assert.equal(Object.getPrototypeOf(grantDescriptor), Object.prototype);
  assert.equal(Object.isFrozen(grantDescriptor), true);
  assert.equal(grantDescriptor.capabilityCommitment, holderSelection.capabilityCommitment);
  assert.equal(pilot.ownerReadCount(), 1);
  const durableGrantAfterHandoff = context.serviceStore.load().state.grants;
  assert.equal(durableGrantAfterHandoff.length, 1);
  assert.deepEqual({
    grantId: durableGrantAfterHandoff[0].grantId,
    capabilityCommitment: durableGrantAfterHandoff[0].capabilityCommitment,
  }, grantDescriptor);

  await expectHandoffUnavailable(route, cert, {
    path: EXTERNAL_HOLDER_HANDOFF_REDEEM_PATH,
    body: Buffer.from(canonicalJson(holderProof), 'utf8'),
  });
  assert.equal(pilot.ownerReadCount(), 1);

  const requestA = requestDescription(
    grantDescriptor.grantId,
    'request.offline.https.pilot.a',
  );
  const authorizationA = authorization(requestA, grantDescriptor);
  const first = await httpsExchange(route, cert, authorizationA);
  assert.equal(first.statusCode, 200);
  assert.equal(callbacks, 1);
  assert.equal(context.serviceStore.load().state.grants[0].consumedUnits, 2);
  const afterFirst = context.serviceStore.load();
  const replay = await httpsExchange(route, cert, authorizationA);
  assert.equal(replay.statusCode, 200);
  assert.deepEqual(replay.body, first.body);
  assert.deepEqual(context.serviceStore.load(), afterFirst);
  assert.equal(callbacks, 1);
  assert.equal(observed.dispatches, 1);

  // Only the durable owner and stores reopen; this same test listener stays bound.
  await pilot.quiesce();
  assert.equal((await httpsExchange(route, cert, authorizationA)).statusCode, 503);
  await expectHandoffUnavailable(route, cert, {
    path: EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH,
  });
  await expectHandoffUnavailable(route, cert, {
    path: EXTERNAL_HOLDER_HANDOFF_REDEEM_PATH,
    body: Buffer.from(canonicalJson(holderProof), 'utf8'),
  });
  assert.equal(pilot.ownerReadCount(), 1);
  await owner.close();
  await expectHandoffUnavailable(route, cert, {
    path: EXTERNAL_HOLDER_HANDOFF_CHALLENGE_PATH,
  });
  context.serviceStore = ServiceCreditSqliteStore.openExisting(context.serviceOpenConfiguration);
  context.observerStore = openZenonFundingObserverSqliteStore({
    databasePath: context.observerConfiguration.databasePath,
    allowedRoot: context.directory,
    expectedRecordKey: context.observerRecordKey,
    authorityRecord: AUTHORITY_RECORD_TEXT,
  });
  owner = makeOwner();
  assert.deepEqual(await owner.start(activationInput(context)), { status: 'ACTIVE' });
  pilot.activate(owner);
  const reopenedReplay = await httpsExchange(route, cert, authorizationA);
  assert.equal(reopenedReplay.statusCode, 200);
  assert.deepEqual(reopenedReplay.body, first.body);
  assert.equal(context.serviceStore.load().state.grants.length, 1);
  assert.equal(context.serviceStore.load().state.grants[0].consumedUnits, 2);
  assert.equal(callbacks, 1);
  const replaySigner = makeSigner();
  await assert.rejects(replaySigner.start(),
    error => error?.code === 'ZENON_FUNDING_PROVIDER_SIGNING_ATTESTATION_UNAVAILABLE');
  await replaySigner.close();
  assert.equal(observed.dispatches, 1);
  const requestB = requestDescription(
    grantDescriptor.grantId,
    'request.offline.https.pilot.b',
  );
  assert.equal(
    (await httpsExchange(route, cert, authorization(requestB, grantDescriptor))).statusCode,
    200,
  );
  assert.equal(context.serviceStore.load().state.grants[0].consumedUnits, 4);
  assert.equal(callbacks, 2);
  assert.equal(pilot.ownerReadCount(), 1);

  const raceChallenge = await obtainExternalHolderChallenge(route, cert);
  const raceProof = externalHolderRedemption(raceChallenge, route.origin, holderSelection);
  const redemptionAdmission = pilot.waitForRedemptionAdmission();
  const pausedRedemption = beginPausedHandoffRedemption(route, cert, raceProof);
  await pausedRedemption.firstWrite;
  assert.equal(await redemptionAdmission, 'REDEMPTION');
  const ownerReadsBeforeQuiesce = pilot.ownerReadCount();
  let controllerCloseSettled = false;
  const controllerClose = pilot.quiesce();
  controllerClose.then(() => { controllerCloseSettled = true; });
  await Promise.resolve();
  assert.equal(controllerCloseSettled, false);
  await pausedRedemption.response.then(
    response => assertHandoffUnavailableResponse(response),
    error => assert.equal(
      isSyntheticHttpsFailure(error, SYNTHETIC_HTTPS_FAILURE.request)
        || isSyntheticHttpsFailure(error, SYNTHETIC_HTTPS_FAILURE.response),
      true,
    ),
  );
  await controllerClose;
  assert.equal(controllerCloseSettled, true);
  await pilot.waitForSocketDrain();
  assert.equal(pilot.ownerReadCount(), ownerReadsBeforeQuiesce);
  assert.equal(pilot.ownedSocketCount(), 0);
  assert.equal(pilot.pendingLatchCount(), 0);
  assert.equal(pilot.handlerFailureCount(), 0);
  const ingressClose = await pilot.closeWithUnresolvedPreHandshake();
  assert.deepEqual(ingressClose.result, { status: 'CLOSED' });
  assert.equal(ingressClose.metrics.phase, 'CLOSED');
  assert.equal(ingressClose.metrics.closeClean, 1);
  assert.equal(ingressClose.metrics.closeUncertain, 0);
  assert.equal(ingressClose.metrics.trackedSockets, 0);
});

test('offline HTTPS harness denies credit for non-READY synthetic child outcomes', async t => {
  for (const [outcome, expected] of [
    ['APPROVAL_REQUIRED', 'APPROVAL_REQUIRED'],
    ['uncertain', 'SIGNER_OUTCOME_UNKNOWN'],
  ]) {
    await t.test(outcome, async t => {
      const pilot = await offlineHttpsPilot(t);
      const { context, route, cert } = pilot;
      assert.equal((await httpsExchange(route, cert)).statusCode, 402);
      const observed = {};
      const makeSigner = await syntheticSigningOperation(t, context, outcome, observed);
      const signer = makeSigner();
      assert.deepEqual(await signer.start(), { status: expected });
      assert.equal(context.observerStore.load().outbox.status, 'PREPARED');
      assert.equal(context.serviceStore.load().state.grants.length, 0);
      assert.equal((await httpsExchange(route, cert, 'ServiceCredit synthetic')).statusCode, 402);
      assert.equal(observed.dispatches, 1);
      assert.equal(pilot.handlerFailureCount(), 0);
      await signer.close();
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
