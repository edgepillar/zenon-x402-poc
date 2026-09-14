import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { chmodSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodeTest from 'node:test';
import * as sdk from 'znn-typescript-sdk';

import { canonicalJson, paymentIntentDigest } from '../src/canonical.js';
import { deriveServiceCreditResourceBinding } from '../src/service-credit-activation.js';
import {
  createServiceCreditCapabilitySigningBytes,
  deriveServiceCreditCapabilityCommitment,
} from '../src/service-credit-capability.js';
import { createServiceCreditAuthorization } from '../src/service-credit-client.js';
import {
  createDurableServiceCreditHttpSession,
} from '../src/service-credit-durable-http-session.js';
import {
  SERVICE_CREDIT_HTTP_PATH,
  SERVICE_CREDIT_HTTP_ROUTE_ID,
} from '../src/service-credit-http.js';
import { SERVICE_CREDIT_MODEL_VERSION } from '../src/service-credit-model.js';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';
import {
  createZenonFundingComposition,
} from '../src/service-credit-zenon-funding-composition.js';
import {
  createZenonFundingIntakeHttpAdapter,
  ZENON_FUNDING_INTAKE_HTTP_MAX_PAYMENT_SIGNATURE_BYTES,
} from '../src/service-credit-zenon-funding-intake-http.js';
import {
  createZenonFundingIntakeSqliteStore,
  deriveZenonFundingIntakeSelectionKey,
  openZenonFundingIntakeSqliteStore,
} from '../src/service-credit-zenon-funding-intake-sqlite-store.js';
import {
  openZenonFundingObserverSqliteStore,
} from '../src/service-credit-zenon-funding-observer-sqlite-store.js';
import {
  ZENON_FUNDING_OBSERVER_STATUS,
} from '../src/service-credit-zenon-funding-observer-state.js';
import {
  createZenonFundingProviderAttestationSigningBytes,
  parseZenonFundingProviderAttestationAuthorityRecord,
} from '../src/service-credit-zenon-funding-provider-attestation.js';
import { decodeB64Json } from '../src/x402-wire.js';

const NOW = 2_000_000_000_000;
const ATTESTATION_NOW = 2_000_000_000;
const RESOURCE_URL = 'https://service.example/credits/zenon-fund';
const REQUEST_TARGET = '/credits/zenon-fund';
const LEDGER_DOMAIN = 'service-credit-zenon-intake-to-credit-offline-test-v1';
const INITIAL_HEIGHT = 10;
const EMPTY_BODY_DIGEST = `sha256:${createHash('sha256')
  .update(Buffer.alloc(0)).digest('hex')}`;

function testFailure(stage) {
  const code = `SERVICE_CREDIT_ZENON_INTAKE_TO_CREDIT_OFFLINE_TEST_FAILED_${stage}`;
  const error = new Error(code);
  error.stack = `Error: ${code}`;
  return error;
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
const WRONG_CAPABILITY_KEYS = keyMaterial();
const CHAIN_PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '7',
  genesisMomentumHash: createHash('sha256')
    .update('intake-to-credit-genesis').digest('hex'),
});

function digest(label) {
  return `sha256:${createHash('sha256')
    .update(`intake-to-credit:${label}`).digest('hex')}`;
}

const AUTHORITY_RECORD = canonicalJson({
  authorityRecordVersion: 1,
  authorityProfileId: 'zenon.provider-attestation',
  authorityProfileVersion: 1,
  verifierVersion: 1,
  providerAuthorityId: 'provider.intake-to-credit.offline',
  generationId: 'provider.intake-to-credit.offline.generation',
  generationVersion: 1,
  keyId: 'provider.intake-to-credit.offline.key',
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
  bootstrapCheckpoint: {
    height: INITIAL_HEIGHT,
    hash: createHash('sha256').update('intake-to-credit-bootstrap').digest('hex'),
  },
  sourcePolicyCommitment: digest('source-policy'),
  maximumAttestationBytes: 4096,
  maximumCanonicalBytes: 524288,
  maximumInitialAgeSeconds: 300,
  maximumFutureSkewSeconds: 5,
  maximumValiditySeconds: 300,
});
const AUTHORITY = parseZenonFundingProviderAttestationAuthorityRecord(AUTHORITY_RECORD);

function keyAddress(byte) {
  const key = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, byte));
  try { return key.getAddress().toString(); } finally { key.clear(); }
}

function selection() {
  return {
    offerId: 'offer.intake-to-credit.offline',
    offerVersion: 1,
    holderId: keyAddress(17),
    capabilityCommitment: deriveServiceCreditCapabilityCommitment({
      publicKey: CAPABILITY_KEYS.publicKey,
    }),
  };
}

function offer() {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.intake-to-credit.offline',
    serviceId: 'service.intake-to-credit.offline',
    resourceId: 'resource.intake-to-credit.offline',
    resourceBinding: deriveServiceCreditResourceBinding({
      resourceId: 'resource.intake-to-credit.offline',
      resourceUrl: RESOURCE_URL,
    }),
    offerId: 'offer.intake-to-credit.offline',
    offerVersion: 1,
    costPolicyId: 'cost.fixed',
    fundingPolicyId: 'funding.exact.intake-to-credit.offline',
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
      asset: sdk.ZNN_ZTS.toString(),
      amount: '1',
      payTo: keyAddress(18),
      maxTimeoutSeconds: 30,
      extra: {
        paymentFlow: 'upfront',
        poc: true,
        settlement: 'account-block',
        zenonChain: structuredClone(CHAIN_PROFILE),
        minimumMomentumConfirmations: AUTHORITY.confirmationPolicy.minimumConfirmations,
      },
    },
  };
}

async function syntheticSignedPayment(paymentRequired, variation) {
  const originalChainId = sdk.Zenon.getChainIdentifier();
  sdk.Zenon.setChainID(7);
  const zenon = sdk.Zenon.getInstance();
  const originalLedger = zenon.ledger;
  const originalEmbedded = zenon.embedded;
  const payer = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, 17));
  const payee = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, 18));
  try {
    zenon.ledger = {
      getFrontierAccountBlock: async () => null,
      getFrontierMomentum: async () => ({
        hash: sdk.Hash.digest(Buffer.from(`intake-to-credit-momentum-${variation}`)),
        height: 1,
      }),
    };
    zenon.embedded = {
      plasma: {
        getRequiredPoWForAccountBlock: async () => ({
          requiredDifficulty: 0,
          basePlasma: 0,
        }),
      },
    };
    const accepted = paymentRequired.accepts[0];
    const block = sdk.AccountBlockTemplate.send(payee.getAddress(), sdk.ZNN_ZTS, 1n);
    const intentDigest = paymentIntentDigest(paymentRequired, accepted);
    block.data = Buffer.from(intentDigest, 'hex');
    const signed = await zenon.prepareBlock(block, payer);
    return {
      x402Version: 2,
      resource: structuredClone(paymentRequired.resource),
      accepted: structuredClone(accepted),
      payload: { transaction: signed.toJson(), intentDigest },
    };
  } finally {
    payer.clear();
    payee.clear();
    zenon.ledger = originalLedger;
    zenon.embedded = originalEmbedded;
    sdk.Zenon.setChainID(originalChainId);
  }
}

function encodePayment(payment) {
  return Buffer.from(JSON.stringify(payment), 'utf8').toString('base64');
}

function intakeExchange(handle, paymentHeader = null) {
  const rawHeaders = paymentHeader === null
    ? ['Host', 'ignored.invalid']
    : ['Host', 'ignored.invalid', 'PAYMENT-SIGNATURE', paymentHeader];
  const request = Object.freeze({
    method: 'GET',
    url: REQUEST_TARGET,
    rawHeaders: Object.freeze(rawHeaders),
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
    headers: { ...headers },
    body,
  }));
}

function paymentRequiredFrom(response) {
  return decodeB64Json(response.headers['payment-required'], {
    maxEncodedBytes: ZENON_FUNDING_INTAKE_HTTP_MAX_PAYMENT_SIGNATURE_BYTES,
  });
}

function momentumHash(height) {
  return createHash('sha256')
    .update(`intake-to-credit-observer-momentum-${height}`).digest('hex');
}

function reachThreshold(store) {
  const before = store.load().state;
  const frontier = {
    height: before.checkpoint.height + before.confirmationPolicy.minimumConfirmations,
    hash: momentumHash(
      before.checkpoint.height + before.confirmationPolicy.minimumConfirmations,
    ),
  };
  const planned = store.planBackfill({
    expectedRevision: before.revision,
    frontier,
  });
  let previousHash = planned.plan.startCheckpoint.hash;
  const momentums = [];
  for (
    let height = planned.plan.fromHeight;
    height <= planned.plan.throughHeight;
    height += 1
  ) {
    const hash = momentumHash(height);
    momentums.push({
      height,
      hash,
      previousHash,
      members: height === planned.plan.fromHeight
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
  assert.equal(
    observed.state.status,
    ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED,
  );
  return observed;
}

function signedProviderEnvelope(request) {
  const issuedAt = ATTESTATION_NOW;
  const validUntil = issuedAt + 120;
  const signingBytes = createZenonFundingProviderAttestationSigningBytes({
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
    signature: sign(null, signingBytes, PROVIDER_KEYS.privateKey).toString('base64url'),
  };
}

function requestDescription(grantId) {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    grantId,
    requestId: 'request.intake-to-credit.offline.a',
    method: 'POST',
    routeId: SERVICE_CREDIT_HTTP_ROUTE_ID,
    canonicalBodyDigest: EMPTY_BODY_DIGEST,
    selectedContentType: 'application/json',
    maxCostUnits: 2,
  };
}

function serviceAuthorization(keys, request, grant = null) {
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
  if (grant !== null) {
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

function serviceExchange(handle, authorization) {
  const request = Object.freeze({
    url: SERVICE_CREDIT_HTTP_PATH,
    method: 'POST',
    rawHeaders: Object.freeze([
      'Authorization', authorization,
      'Content-Length', '0',
    ]),
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
    headers: { ...headers },
    body,
  }));
}

function passiveDeadlineRuntime() {
  return {
    monotonicNowNs: () => 0n,
    schedule: () => Object.freeze({}),
    cancel: () => undefined,
  };
}

nodeTest(
  'listenerless intake reaches one durable credit and replays safely across restart',
  async t => {
    let stage = 'SETUP';
    let directory = null;
    let adapter = null;
    let intakeStore = null;
    let observerStore = null;
    let serviceStore = null;
    let session = null;

    t.after(async () => {
      try {
        try { await session?.close(); } catch {}
        try { await adapter?.close(); } catch {}
        try { observerStore?.close(); } catch {}
        try { intakeStore?.close(); } catch {}
        try { serviceStore?.close(); } catch {}
        if (directory !== null) rmSync(directory, { recursive: true, force: true });
      } catch {
        throw testFailure('CLEANUP');
      }
    });

    try {
      directory = realpathSync(mkdtempSync(join(tmpdir(), 'zenon-intake-to-credit-')));
      chmodSync(directory, 0o700);
      const serviceConfiguration = {
        databasePath: join(directory, 'service-credit.sqlite'),
        allowedRoot: directory,
        deriveCost: () => 2,
        now: () => NOW,
      };
      const intakeConfiguration = {
        databasePath: join(directory, 'funding-intake.sqlite'),
        allowedRoot: directory,
        ledgerDomain: LEDGER_DOMAIN,
        maxChallenges: 4,
      };
      const fixedSelection = selection();
      const selectionKey = deriveZenonFundingIntakeSelectionKey({
        ledgerDomain: LEDGER_DOMAIN,
        selection: fixedSelection,
      });
      let policyCalls = 0;
      let policyAllowed = true;

      serviceStore = ServiceCreditSqliteStore.create(serviceConfiguration);
      serviceStore.registerOffer(offer());
      intakeStore = createZenonFundingIntakeSqliteStore(intakeConfiguration);

      const makeAdapter = () => createZenonFundingIntakeHttpAdapter({
        store: intakeStore,
        serviceCreditStore: serviceStore,
        authorityRecord: AUTHORITY_RECORD,
        deriveFundingTerms: input => {
          policyCalls += 1;
          if (!policyAllowed) throw testFailure('POLICY_REPLAY');
          return fundingTerms(input);
        },
        now: () => NOW,
        observerRoot: directory,
        observerCatchUp: {
          maximumPageEntries: 4,
          maximumBackfillSpan: 8,
          maximumMembersPerMomentum: 4,
        },
        selection: fixedSelection,
        resourceUrl: RESOURCE_URL,
      });
      const selectionRow = () => intakeStore.loadBySelectionKey(selectionKey);
      const intakeResponses = [];

      stage = 'ISSUE';
      adapter = makeAdapter();
      assert.deepEqual(adapter.recover(), { status: 'RECOVERED' });
      const challengeResponse = await intakeExchange(adapter.handle);
      intakeResponses.push(challengeResponse);
      assert.equal(challengeResponse.statusCode, 402);
      assert.equal(challengeResponse.body.toString('utf8'), 'Payment Required');
      const issuedRow = selectionRow();
      assert.equal(issuedRow.status, 'ISSUED');
      assert.equal(
        challengeResponse.headers['payment-required'],
        issuedRow.issue.frame.paymentRequiredHeader,
      );
      assert.equal(challengeResponse.body.toString('utf8'), issuedRow.issue.frame.body);
      const challengeReplay = await intakeExchange(adapter.handle);
      intakeResponses.push(challengeReplay);
      assert.equal(challengeReplay.statusCode, 402);
      assert.deepEqual(challengeReplay.body, challengeResponse.body);
      assert.equal(
        challengeReplay.headers['payment-required'],
        challengeResponse.headers['payment-required'],
      );
      assert.equal(policyCalls, 1);

      stage = 'SIGN_PAYMENT';
      const paymentRequired = paymentRequiredFrom(challengeResponse);
      assert.deepEqual(paymentRequired, issuedRow.issue.challenge.paymentRequired);
      const payment = await syntheticSignedPayment(paymentRequired, 1);
      const changedPayment = await syntheticSignedPayment(paymentRequired, 2);
      assert.notEqual(
        payment.payload.transaction.hash,
        changedPayment.payload.transaction.hash,
      );
      const paymentHeader = encodePayment(payment);
      const changedPaymentHeader = encodePayment(changedPayment);
      assert.equal(
        Buffer.byteLength(paymentHeader, 'utf8')
          < ZENON_FUNDING_INTAKE_HTTP_MAX_PAYMENT_SIGNATURE_BYTES,
        true,
      );

      stage = 'BIND';
      const boundResponse = await intakeExchange(adapter.handle, paymentHeader);
      intakeResponses.push(boundResponse);
      assert.equal(boundResponse.statusCode, 202);
      assert.equal(boundResponse.body.toString('utf8'), 'BOUND');
      assert.equal(Object.hasOwn(boundResponse.headers, 'payment-response'), false);
      const boundRow = structuredClone(selectionRow());
      assert.equal(boundRow.status, 'BOUND');
      assert.equal(boundRow.binding.transactionHash, payment.payload.transaction.hash);
      assert.equal(
        boundRow.binding.observerTarget.transactionId,
        `zenontx:${payment.payload.transaction.hash}`,
      );
      assert.equal(serviceStore.load().state.grants.length, 0);
      const changedResponse = await intakeExchange(adapter.handle, changedPaymentHeader);
      intakeResponses.push(changedResponse);
      assert.equal(changedResponse.statusCode, 409);
      assert.deepEqual(selectionRow(), boundRow);
      assert.equal(intakeStore.loadBound().length, 1);
      assert.equal(serviceStore.load().state.grants.length, 0);

      stage = 'INTAKE_RESTART';
      await adapter.close();
      adapter = null;
      intakeStore.close();
      intakeStore = null;
      serviceStore.close();
      serviceStore = null;
      stage = 'INTAKE_RESTART_REOPEN_STORES';
      serviceStore = ServiceCreditSqliteStore.openExisting(serviceConfiguration);
      intakeStore = openZenonFundingIntakeSqliteStore(intakeConfiguration);
      policyAllowed = false;
      adapter = makeAdapter();
      stage = 'INTAKE_RESTART_BEFORE_RECOVERY';
      const beforeRecovery = await intakeExchange(adapter.handle, paymentHeader);
      intakeResponses.push(beforeRecovery);
      assert.equal(beforeRecovery.statusCode, 503);
      stage = 'INTAKE_RESTART_RECOVER';
      assert.deepEqual(adapter.recover(), { status: 'RECOVERED' });
      stage = 'INTAKE_RESTART_BOUND_REPLAY';
      const boundReplay = await intakeExchange(adapter.handle, paymentHeader);
      intakeResponses.push(boundReplay);
      assert.equal(boundReplay.statusCode, 202);
      assert.deepEqual(boundReplay.body, boundResponse.body);
      stage = 'INTAKE_RESTART_UNSIGNED';
      const unsignedAfterBound = await intakeExchange(adapter.handle);
      intakeResponses.push(unsignedAfterBound);
      assert.equal(unsignedAfterBound.statusCode, 409);
      stage = 'INTAKE_RESTART_CHANGED_PAYMENT';
      const changedAfterRestart = await intakeExchange(
        adapter.handle,
        changedPaymentHeader,
      );
      intakeResponses.push(changedAfterRestart);
      assert.equal(changedAfterRestart.statusCode, 409);
      stage = 'INTAKE_RESTART_RETAINED_STATE';
      const retainedRow = structuredClone(selectionRow());
      assert.deepEqual(retainedRow, boundRow);
      assert.equal(intakeStore.loadBound().length, 1);
      assert.equal(policyCalls, 1);
      assert.equal(serviceStore.load().state.grants.length, 0);
      for (const response of intakeResponses) assert.notEqual(response.statusCode, 200);
      await adapter.close();
      adapter = null;
      intakeStore.close();
      intakeStore = null;

      stage = 'OBSERVER_READY';
      observerStore = openZenonFundingObserverSqliteStore({
        databasePath: join(directory, retainedRow.binding.observerFileName),
        allowedRoot: directory,
        expectedRecordKey: retainedRow.binding.observerRecordKey,
        authorityRecord: AUTHORITY_RECORD,
      });
      const loadedObserver = observerStore.load();
      assert.equal(loadedObserver.recordKey, retainedRow.binding.observerRecordKey);
      assert.deepEqual(loadedObserver.state.target, retainedRow.binding.observerTarget);
      const threshold = reachThreshold(observerStore);
      assert.equal(observerStore.load().outbox.status, 'PREPARED');
      const attestationRequest = observerStore.peekPreparedAttestation();
      const committed = observerStore.commitAuthenticatedEnvelope({
        expectedObserverRevision: threshold.state.revision,
        expectedOutboxRevision: 1,
        attestationId: attestationRequest.attestationId,
        envelope: signedProviderEnvelope(attestationRequest),
        nowEpochSeconds: ATTESTATION_NOW,
      });
      assert.equal(committed.disposition, 'READY');
      assert.equal(observerStore.load().outbox.status, 'READY');
      const verifiedEvidence = observerStore.matchReadyFundingEvidence(
        committed.fundingEvidence,
      );
      assert.equal(
        verifiedEvidence.transactionId,
        retainedRow.binding.observerTarget.transactionId,
      );
      const readySnapshot = canonicalJson(
        observerStore.projectCommittedFundingEvidence(),
      );
      assert.equal(serviceStore.load().state.grants.length, 0);

      stage = 'ACTIVATE';
      const activationInput = {
        intent: structuredClone(retainedRow.issue.challenge.activationIntent),
        paymentRequired: structuredClone(retainedRow.issue.challenge.paymentRequired),
      };
      let composition = createZenonFundingComposition({
        serviceCreditStore: serviceStore,
        fundingObserverStore: observerStore,
        authorityRecord: AUTHORITY_RECORD,
        deriveFundingTerms: fundingTerms,
        now: () => NOW,
      });
      const activated = await composition.activateCommittedFunding(activationInput);
      assert.equal(serviceStore.load().state.grants.length, 1);
      const activationReplay = await composition.activateCommittedFunding(activationInput);
      assert.equal(activationReplay.activation.activationId, activated.activation.activationId);
      assert.equal(activationReplay.grant.grantId, activated.grant.grantId);
      assert.equal(serviceStore.load().state.grants.length, 1);
      assert.equal(
        canonicalJson(observerStore.projectCommittedFundingEvidence()),
        readySnapshot,
      );

      serviceStore.initializeDurableExecution({
        expectedRevision: serviceStore.getMetadata().revision,
        ledgerId: 'ledger.intake-to-credit.offline',
        policy: {
          policyId: 'execution.intake-to-credit.offline',
          policyVersion: 1,
          maxDurationMs: 1_000,
        },
        capacity: 8,
      });

      stage = 'DURABLE_SESSION';
      let executionCalls = 0;
      const makeSession = () => createDurableServiceCreditHttpSession({
        store: serviceStore,
        execute: () => {
          executionCalls += 1;
          return { resultCode: 'intake-to-credit.offline.delivered' };
        },
        deadlineRuntime: passiveDeadlineRuntime(),
        selectedDurationMs: 1_000,
      });
      session = makeSession();
      const request = requestDescription(activated.grant.grantId);
      const authorization = serviceAuthorization(
        CAPABILITY_KEYS,
        request,
        activated.grant,
      );
      const wrongAuthorization = serviceAuthorization(
        WRONG_CAPABILITY_KEYS,
        request,
      );
      const beforeWrongCapability = serviceStore.load();
      const wrongCapability = await serviceExchange(session.handle, wrongAuthorization);
      assert.equal(wrongCapability.statusCode, 401);
      assert.equal(executionCalls, 0);
      assert.deepEqual(serviceStore.load(), beforeWrongCapability);

      const first = await serviceExchange(session.handle, authorization);
      assert.equal(first.statusCode, 200);
      assert.equal(executionCalls, 1);
      const afterFirst = serviceStore.load();
      assert.equal(afterFirst.state.grants.length, 1);
      assert.equal(afterFirst.state.grants[0].consumedUnits, 2);
      assert.equal(afterFirst.state.grants[0].availableUnits, 8);
      const replay = await serviceExchange(session.handle, authorization);
      assert.equal(replay.statusCode, 200);
      assert.deepEqual(replay.body, first.body);
      assert.deepEqual(serviceStore.load(), afterFirst);
      assert.equal(executionCalls, 1);

      stage = 'DURABLE_RESTART';
      await session.close();
      session = null;
      observerStore.close();
      observerStore = null;
      serviceStore.close();
      serviceStore = null;
      serviceStore = ServiceCreditSqliteStore.openExisting(serviceConfiguration);
      observerStore = openZenonFundingObserverSqliteStore({
        databasePath: join(directory, retainedRow.binding.observerFileName),
        allowedRoot: directory,
        expectedRecordKey: retainedRow.binding.observerRecordKey,
        authorityRecord: AUTHORITY_RECORD,
      });
      composition = createZenonFundingComposition({
        serviceCreditStore: serviceStore,
        fundingObserverStore: observerStore,
        authorityRecord: AUTHORITY_RECORD,
        deriveFundingTerms: fundingTerms,
        now: () => NOW,
      });
      const reopenedActivation = await composition.activateCommittedFunding(activationInput);
      assert.equal(reopenedActivation.activation.activationId, activated.activation.activationId);
      assert.equal(reopenedActivation.grant.grantId, activated.grant.grantId);
      const reopenedBeforeReplay = serviceStore.load();
      assert.equal(reopenedBeforeReplay.state.grants.length, 1);
      assert.equal(reopenedBeforeReplay.state.grants[0].consumedUnits, 2);
      assert.equal(
        canonicalJson(observerStore.projectCommittedFundingEvidence()),
        readySnapshot,
      );
      session = makeSession();
      const reopenedReplay = await serviceExchange(session.handle, authorization);
      assert.equal(reopenedReplay.statusCode, 200);
      assert.deepEqual(reopenedReplay.body, first.body);
      assert.deepEqual(serviceStore.load(), reopenedBeforeReplay);
      assert.equal(executionCalls, 1);
      assert.equal(serviceStore.load().state.grants.length, 1);
    } catch {
      throw testFailure(stage);
    }
  },
);
