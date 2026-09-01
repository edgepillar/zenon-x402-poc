import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import * as sdk from 'znn-typescript-sdk';

import { paymentIntentDigest } from '../src/canonical.js';
import { runPublicWsOnceRunnerCli } from '../src/live-evidence-public-ws-once-cli.js';
import {
  runLiveEvidenceFacilitatorWorker,
  startLiveEvidenceFacilitatorWorker,
} from '../src/live-evidence-facilitator-worker.js';
import {
  executePublicWsOnceRun,
  parseLiveRoleInput,
  parsePublicWsOnceAuthorization,
  parsePublicWsOnceIndependentVerification,
  parsePublicWsOnceRoleInput,
  parsePublicWsOnceRunConfig,
  persistPublicWsOnceConsumedMarker,
  preflightPublicWsOnceRun,
  PUBLIC_WS_ONCE_POLICY,
} from '../src/live-evidence-runner.js';
import {
  createLiveEvidenceObserver,
  recordLiveEvidencePhase,
} from '../src/live-observation.js';
import {
  assertOperatorTrustedChainPolicy,
  observeOperatorTrustedChainPolicy,
} from '../src/zenon/operator-trusted-chain-policy.js';
import {
  GATE_B_CURRENT_TESTNET_CHAIN_PROFILE,
  GATE_B_CURRENT_TESTNET_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  GATE_B_CURRENT_TESTNET_PROFILE_NAME,
  GATE_B_CURRENT_TESTNET_PROVENANCE,
  GATE_B_CURRENT_TESTNET_SDK_NETWORK_ID,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
  OPERATOR_TRUST_ACKNOWLEDGEMENT,
  TESTNET_LIVE_ACKNOWLEDGEMENT,
  isGateBCurrentTestnetPolicy,
  selectGateBCurrentTestnetPolicy,
  selectOperatorTrustedTestnetPolicy,
} from '../src/zenon/operator-trusted-testnet-profile.js';
import { computeBlockHash, preflightZenonPayment } from '../src/zenon-payment.js';

const ENDPOINT = 'ws://8.8.8.8:35998/';
const RESOURCE_URL = 'https://evidence.zenon.network/paid';
const UTC = '2026-09-01T00:00:00.000Z';
const FIXTURE_CONFIGURATIONS = new WeakMap();
const SYNTHETIC_GENERATION = Object.freeze({
  dev: '1',
  ino: '2',
  size: '3',
  mtimeNs: '4',
  ctimeNs: '5',
});
const PHASES = Object.freeze({
  buyer: Object.freeze([
    'buyer_owner_wait_started',
    'buyer_owner_acquired',
    'buyer_readiness_started',
    'buyer_readiness_finished',
    'prepare_block_started',
    'prepare_block_finished',
    'buyer_owner_released',
  ]),
  facilitator: Object.freeze([
    'facilitator_owner_wait_started',
    'facilitator_owner_acquired',
    'facilitator_readiness_started',
    'facilitator_readiness_finished',
    'publication_started',
    'publication_acknowledged',
    'inclusion_wait_started',
    'momentum_inclusion_observed',
    'facilitator_owner_released',
    'delivery_started',
    'delivery_finished',
  ]),
});

function paymentRequired() {
  return {
    x402Version: 2,
    resource: {
      url: RESOURCE_URL,
      description: 'Zenon x402 PoC protected resource',
      mimeType: 'application/json',
    },
    accepts: [{
      scheme: 'exact',
      network: 'zenon:testnet',
      asset: sdk.ZNN_ZTS.toString(),
      amount: '1',
      payTo: sdk.Address.fromPublicKey(Buffer.alloc(32, 31)).toString(),
      maxTimeoutSeconds: 60,
      extra: {
        paymentFlow: 'upfront',
        poc: true,
        settlement: 'account-block',
        zenonChain: { ...GATE_B_CURRENT_TESTNET_CHAIN_PROFILE },
      },
    }],
  };
}

function config() {
  return {
    runnerVersion: 1,
    sourceRevision: 'b'.repeat(40),
    profileName: GATE_B_CURRENT_TESTNET_PROFILE_NAME,
    acknowledgements: {
      live: TESTNET_LIVE_ACKNOWLEDGEMENT,
      operatorTrust: GATE_B_CURRENT_TESTNET_OPERATOR_TRUST_ACKNOWLEDGEMENT,
    },
    expectedPaymentRequired: paymentRequired(),
    runtime: {
      listenPort: 41000,
      rpcTimeoutMs: 1000,
      maxRecoveryAttempts: 0,
      recoveryDelayMs: 0,
      maxRecoveryElapsedMs: 1000,
    },
  };
}

function authorization(configuration, endpoint = ENDPOINT, changes = {}) {
  return {
    authorizationVersion: 1,
    transportException: PUBLIC_WS_ONCE_POLICY.transportException,
    runName: 'single-public-ws-run',
    sourceRevision: configuration.sourceRevision,
    profileName: configuration.profileName,
    paymentIntentDigest: paymentIntentDigest(
      configuration.expectedPaymentRequired,
      configuration.expectedPaymentRequired.accepts[0],
    ),
    rpcEndpoint: endpoint,
    acknowledgements: {
      payment: PUBLIC_WS_ONCE_POLICY.paymentAcknowledgement,
      publication: PUBLIC_WS_ONCE_POLICY.publicationAcknowledgement,
    },
    ...changes,
  };
}

async function fixture(t, changes = {}) {
  const created = await mkdtemp(join(tmpdir(), 'public-ws-once-'));
  t.after(() => rm(created, { recursive: true, force: true }));
  const root = await realpath(created);
  await chmod(root, 0o700);
  const workspaceRoot = join(root, 'workspace');
  await mkdir(workspaceRoot, { mode: 0o700 });
  const configuration = changes.config ?? config();
  const paths = {
    configPath: join(workspaceRoot, 'run.json'),
    buyerRpcPath: join(workspaceRoot, 'buyer-rpc.json'),
    buyerWalletPath: join(workspaceRoot, 'buyer-wallet.json'),
    facilitatorRpcPath: join(workspaceRoot, 'facilitator-rpc.json'),
    authorizationPath: join(workspaceRoot, 'authorization.json'),
  };
  await writeFile(paths.configPath, `${JSON.stringify(configuration)}\n`, { mode: 0o600 });
  await writeFile(
    paths.buyerRpcPath,
    `${JSON.stringify({ secretVersion: 2, rpcEndpoint: changes.buyerEndpoint ?? ENDPOINT })}\n`,
    { mode: 0o600 },
  );
  await writeFile(
    paths.buyerWalletPath,
    changes.walletText ?? 'not-read-during-preflight\n',
    { mode: 0o600 },
  );
  await writeFile(
    paths.facilitatorRpcPath,
    `${JSON.stringify({
      secretVersion: 2,
      rpcEndpoint: changes.facilitatorEndpoint ?? ENDPOINT,
    })}\n`,
    { mode: 0o600 },
  );
  const authorizationValue = changes.authorization ?? authorization(configuration);
  await writeFile(
    paths.authorizationPath,
    `${JSON.stringify(authorizationValue)}\n`,
    { mode: 0o600 },
  );
  const options = {
    ...paths,
    workspaceRoot,
    runName: 'single-public-ws-run',
    transportException: PUBLIC_WS_ONCE_POLICY.transportException,
  };
  FIXTURE_CONFIGURATIONS.set(options, configuration);
  return options;
}

function fixtureConfiguration(options) {
  const value = FIXTURE_CONFIGURATIONS.get(options);
  assert.ok(value);
  return value;
}

function fixedObserver() {
  let monotonicMs = 0;
  return createLiveEvidenceObserver({
    utcNow: () => UTC,
    monotonicNow: () => {
      monotonicMs += 1;
      return monotonicMs;
    },
  });
}

function observations(role) {
  const observer = fixedObserver();
  return PHASES[role].map(phase => recordLiveEvidencePhase(observer, role, phase));
}

async function validOutcome(configuration) {
  const keyPair = sdk.KeyPair.fromPrivateKey(randomBytes(32));
  try {
    const required = structuredClone(configuration.expectedPaymentRequired);
    const accepted = required.accepts[0];
    const intentDigest = paymentIntentDigest(required, accepted);
    const block = sdk.AccountBlockTemplate.send(
      sdk.Address.parse(accepted.payTo),
      sdk.TokenStandard.parse(accepted.asset),
      BigInt(accepted.amount),
    );
    block.chainIdentifier = Number(GATE_B_CURRENT_TESTNET_CHAIN_PROFILE.chainIdentifier);
    block.address = keyPair.getAddress();
    block.height = 1;
    block.momentumAcknowledged = new sdk.HashHeight(
      sdk.Hash.digest(Buffer.from('public ws once acknowledged momentum')),
      1,
    );
    block.data = Buffer.from(intentDigest, 'hex');
    block.fusedPlasma = 0;
    block.difficulty = 0;
    block.nonce = '0'.repeat(16);
    block.publicKey = keyPair.getPublicKey();
    block.hash = computeBlockHash(block, sdk);
    block.signature = keyPair.sign(block.hash.getBytes());
    const paymentPayload = {
      x402Version: 2,
      resource: structuredClone(required.resource),
      accepted: structuredClone(accepted),
      payload: { transaction: block.toJson(), intentDigest },
    };
    const preflight = await preflightZenonPayment(paymentPayload, accepted, required);
    const confirmationDetail = {
      numConfirmations: 1,
      momentumHeight: 2,
      momentumHash: sdk.Hash.digest(Buffer.from('public ws once inclusion momentum')).toString(),
      momentumTimestamp: 1,
    };
    const body = {
      ok: true,
      message: 'paid resource unlocked',
      network: accepted.network,
      payer: preflight.payer,
      transaction: preflight.transactionHash,
      generatedAt: UTC,
    };
    const outcome = {
      kind: 'delivered',
      paymentPayload,
      paymentRequired: required,
      settlement: {
        success: true,
        network: accepted.network,
        transaction: preflight.transactionHash,
        payer: preflight.payer,
        state: 'MOMENTUM_INCLUDED',
      },
      buyerObservations: observations('buyer'),
      initialObservedAt: UTC,
      final: {
        status: 200,
        contentType: 'application/json; charset=utf-8',
        cacheControl: 'private, no-store, max-age=0',
        vary: 'PAYMENT-SIGNATURE',
        bodyText: JSON.stringify(body, null, 2),
      },
    };
    const record = {
      authorizationKey: preflight.authorizationKey,
      transactionHash: preflight.transactionHash,
      chainProfile: structuredClone(preflight.chainProfile),
      intentDigest,
      resourceIdentity: structuredClone(required.resource),
      resourceDigest: preflight.resourceDigest,
      payer: preflight.payer,
      signedAccountBlock: structuredClone(paymentPayload.payload.transaction),
      evidenceState: 'MOMENTUM_INCLUDED',
      momentumEvidence: { observedAt: UTC, confirmationDetail },
      deliveryState: 'DELIVERED',
      cachedResponse: {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body,
      },
      createdAt: UTC,
      updatedAt: UTC,
    };
    return { outcome, record };
  } finally {
    keyPair.clear();
  }
}

function fixedFailure(error) {
  return error?.code === 'live_evidence_run_invalid' && error?.cause === undefined;
}

test('current Gate-B profile is distinct, branded, and never cross-pairs with historical policy', async () => {
  assert.equal(GATE_B_CURRENT_TESTNET_SDK_NETWORK_ID, '3');
  assert.notEqual(
    GATE_B_CURRENT_TESTNET_CHAIN_PROFILE.chainIdentifier,
    GATE_B_CURRENT_TESTNET_SDK_NETWORK_ID,
  );
  assert.equal(GATE_B_CURRENT_TESTNET_PROVENANCE.publicGenesisDerivationCompleted, false);
  assert.equal(GATE_B_CURRENT_TESTNET_PROVENANCE.independentlyVerified, false);
  const current = selectGateBCurrentTestnetPolicy(
    GATE_B_CURRENT_TESTNET_PROFILE_NAME,
    GATE_B_CURRENT_TESTNET_OPERATOR_TRUST_ACKNOWLEDGEMENT,
    TESTNET_LIVE_ACKNOWLEDGEMENT,
  );
  const historical = selectOperatorTrustedTestnetPolicy(
    OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
    OPERATOR_TRUST_ACKNOWLEDGEMENT,
    TESTNET_LIVE_ACKNOWLEDGEMENT,
  );
  assert.equal(isGateBCurrentTestnetPolicy(current), true);
  assert.equal(isGateBCurrentTestnetPolicy(historical), false);
  assert.equal(assertOperatorTrustedChainPolicy(current, current.chainProfile()), current);
  assert.equal(assertOperatorTrustedChainPolicy(historical, historical.chainProfile()), historical);
  assert.throws(() => assertOperatorTrustedChainPolicy(
    current,
    OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE,
  ));
  assert.throws(() => assertOperatorTrustedChainPolicy(
    historical,
    GATE_B_CURRENT_TESTNET_CHAIN_PROFILE,
  ));
  assert.equal(GATE_B_CURRENT_TESTNET_PROVENANCE.sameSourceReproduced, true);
  const context = heightTwoHash => ({
    expectedChainProfile: current.chainProfile(),
    frontierMomentum: {
      chainIdentifier: Number(GATE_B_CURRENT_TESTNET_CHAIN_PROFILE.chainIdentifier),
      height: 2,
      hash: '8'.repeat(64),
    },
    zenon: {
      ledger: {
        getMomentumsByHeight: () => ({
          count: 2,
          list: [{
            version: 1,
            chainIdentifier: Number(GATE_B_CURRENT_TESTNET_CHAIN_PROFILE.chainIdentifier),
            height: 2,
            hash: heightTwoHash,
            previousHash: GATE_B_CURRENT_TESTNET_CHAIN_PROFILE.genesisMomentumHash,
          }],
        }),
      },
    },
  });
  const evidence = await observeOperatorTrustedChainPolicy(
    current,
    context(GATE_B_CURRENT_TESTNET_PROVENANCE.observationHash),
  );
  assert.equal(evidence.remoteChainAuthenticated, false);
  assert.deepEqual(evidence.chainProfile, GATE_B_CURRENT_TESTNET_CHAIN_PROFILE);
  await assert.rejects(observeOperatorTrustedChainPolicy(current, context('7'.repeat(64))));
});

test('public WS parser is a closed v2 numeric-public-IP lane and generic roles remain WSS-only', () => {
  assert.deepEqual(
    parsePublicWsOnceRoleInput(
      `${JSON.stringify({ secretVersion: 2, rpcEndpoint: ENDPOINT })}\n`,
      'buyer-rpc',
    ),
    { secretVersion: 2, rpcEndpoint: ENDPOINT },
  );
  assert.throws(() => parseLiveRoleInput(
    `${JSON.stringify({ secretVersion: 2, rpcEndpoint: ENDPOINT })}\n`,
    'buyer-rpc',
  ));
  const invalid = [
    'wss://8.8.8.8:35998/',
    'ws://rpc.example.org:35998/',
    'ws://127.0.0.1:35998/',
    'ws://10.0.0.1:35998/',
    'ws://192.0.2.1:35998/',
    'ws://224.0.0.1:35998/',
    'ws://user@8.8.8.8:35998/',
    'ws://8.8.8.8:35998/?query=1',
    'ws://8.8.8.8:35998/#fragment',
    'ws://8.8.8.8:35998/%2f',
    'ws://8.8.8.8:35998/path',
    'ws://8.8.8.8:35998',
    'ws://8.8.8.8:80/',
    'ws://008.008.008.008:35998/',
  ];
  for (const endpoint of invalid) {
    assert.throws(() => parsePublicWsOnceRoleInput(
      `${JSON.stringify({ secretVersion: 2, rpcEndpoint: endpoint })}\n`,
      'facilitator-rpc',
    ));
  }
  assert.throws(() => parsePublicWsOnceRoleInput(
    `${JSON.stringify({ secretVersion: 1, rpcEndpoint: ENDPOINT })}\n`,
    'buyer-rpc',
  ));
});

test('config and authorization require exact current profile, zero recovery, and exact acknowledgements', () => {
  const valid = config();
  assert.deepEqual(parsePublicWsOnceRunConfig(`${JSON.stringify(valid)}\n`), valid);
  for (const mutate of [
    value => { value.profileName = OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME; },
    value => { value.runtime.maxRecoveryAttempts = 1; },
    value => { value.runtime.recoveryDelayMs = 1; },
    value => { value.acknowledgements.operatorTrust = OPERATOR_TRUST_ACKNOWLEDGEMENT; },
    value => { value.expectedPaymentRequired.accepts[0].extra.zenonChain =
      { ...OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE }; },
  ]) {
    const candidate = structuredClone(valid);
    mutate(candidate);
    assert.throws(() => parsePublicWsOnceRunConfig(`${JSON.stringify(candidate)}\n`));
  }
  const approved = authorization(valid);
  assert.deepEqual(
    parsePublicWsOnceAuthorization(`${JSON.stringify(approved)}\n`),
    approved,
  );
  for (const mutate of [
    value => { value.acknowledgements.payment = 'wrong'; },
    value => { value.acknowledgements.publication = 'wrong'; },
    value => { value.profileName = OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME; },
    value => { value.paymentIntentDigest = '0'.repeat(63); },
    value => { value.extra = true; },
  ]) {
    const candidate = structuredClone(approved);
    mutate(candidate);
    assert.throws(() => parsePublicWsOnceAuthorization(`${JSON.stringify(candidate)}\n`));
  }
});

test('preflight validates five distinct protected files without reading wallet contents', async t => {
  const options = await fixture(t);
  assert.deepEqual(await preflightPublicWsOnceRun(options), { valid: true });
  const mismatched = await fixture(t, { facilitatorEndpoint: 'ws://8.8.4.4:35998/' });
  await assert.rejects(preflightPublicWsOnceRun(mismatched), fixedFailure);
  const wrongRun = await fixture(t, {
    authorization: authorization(config(), ENDPOINT, { runName: 'different-run' }),
  });
  await assert.rejects(preflightPublicWsOnceRun(wrongRun), fixedFailure);
  const wrongIntentConfig = config();
  const wrongIntent = authorization(wrongIntentConfig, ENDPOINT, {
    paymentIntentDigest: '0'.repeat(64),
  });
  const wrongIntentFixture = await fixture(t, {
    config: wrongIntentConfig,
    authorization: wrongIntent,
  });
  await assert.rejects(preflightPublicWsOnceRun(wrongIntentFixture), fixedFailure);
});

test('preflight rejects mode, hardlink, and protected-file alias failures', async t => {
  const modeFixture = await fixture(t);
  await chmod(modeFixture.authorizationPath, 0o644);
  await assert.rejects(preflightPublicWsOnceRun(modeFixture), fixedFailure);

  const hardlinkFixture = await fixture(t);
  await rm(hardlinkFixture.facilitatorRpcPath);
  await link(hardlinkFixture.buyerRpcPath, hardlinkFixture.facilitatorRpcPath);
  await assert.rejects(preflightPublicWsOnceRun(hardlinkFixture), fixedFailure);

  const aliasFixture = await fixture(t);
  aliasFixture.authorizationPath = aliasFixture.buyerRpcPath;
  await assert.rejects(preflightPublicWsOnceRun(aliasFixture), fixedFailure);
});

test('fixed workspace marker is exclusive, durable, globally one-shot, and partial existence consumes', async t => {
  const options = await fixture(t);
  const attempts = await Promise.allSettled([
    persistPublicWsOnceConsumedMarker(options.workspaceRoot),
    persistPublicWsOnceConsumedMarker(options.workspaceRoot),
  ]);
  assert.equal(attempts.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter(item => item.status === 'rejected').length, 1);
  const marker = join(options.workspaceRoot, 'PUBLIC_WS_ONCE_CONSUMED');
  const stat = await lstat(marker);
  assert.equal(stat.isFile(), true);
  assert.equal(stat.mode & 0o777, 0o600);
  await assert.rejects(preflightPublicWsOnceRun(options), fixedFailure);

  const partial = await fixture(t);
  await writeFile(
    join(partial.workspaceRoot, 'PUBLIC_WS_ONCE_CONSUMED'),
    'partial\n',
    { mode: 0o600 },
  );
  await assert.rejects(preflightPublicWsOnceRun(partial), fixedFailure);
});

test('one-shot execution consumes before effects and produces pending-only sanitized metadata', async t => {
  const options = await fixture(t, {
    walletText: '{"secretVersion":1,"mnemonic":"offline-placeholder-only","accountIndex":0}\n',
  });
  const configuration = fixtureConfiguration(options);
  const candidate = await validOutcome(configuration);
  const outcome = candidate.outcome;
  const effectOrder = [];
  const controller = {
    async start() { effectOrder.push('worker-start'); },
    async snapshotObservations() {
      return { evidenceEligible: true, events: observations('facilitator') };
    },
    async closeAndSnapshot() {
      return {
        quiescent: true,
        schemaVersion: 1,
        revision: 5,
        records: [structuredClone(candidate.record)],
      };
    },
    async terminate() { effectOrder.push('terminate'); },
  };
  const operations = {
    async probeBuyerReadiness() {
      const marker = await readFile(join(options.workspaceRoot, 'PUBLIC_WS_ONCE_CONSUMED'), 'utf8');
      assert.equal(marker, 'PUBLIC_WS_ONCE_CONSUMED\n');
      effectOrder.push('buyer-readiness');
    },
    async startFacilitator({ recovery }) {
      assert.equal(recovery, false);
      effectOrder.push('worker-create');
      return controller;
    },
    async probePublicEndpoint() { effectOrder.push('public-endpoint'); },
    async readBuyerWallet() {
      effectOrder.push('wallet');
      return { mnemonic: 'offline-placeholder-only', accountIndex: 0 };
    },
    async paidFetch({ openWallet, onChallenge }) {
      await onChallenge(configuration.expectedPaymentRequired);
      await openWallet();
      effectOrder.push('payment');
      return outcome;
    },
  };
  const result = await executePublicWsOnceRun(options, {
    operations,
    lifecycleObserver: fixedObserver(),
  });
  assert.deepEqual(result, {
    status: 'pending-independent-verification',
    evidenceEligible: false,
  });
  assert.equal(effectOrder[0], 'buyer-readiness');
  const runDirectory = join(options.workspaceRoot, options.runName);
  const entries = await readdir(runDirectory);
  assert.deepEqual(entries, ['pending-independent-verification']);
  const pendingDirectory = join(runDirectory, 'pending-independent-verification');
  assert.deepEqual((await readdir(pendingDirectory)).sort(), [
    'PENDING_INDEPENDENT_VERIFICATION',
    'metadata.json',
  ]);
  const metadataText = await readFile(join(pendingDirectory, 'metadata.json'), 'utf8');
  const metadata = JSON.parse(metadataText);
  assert.deepEqual(Object.keys(metadata), [
    'candidateVersion', 'status', 'publicationEligible', 'transport',
    'independentVerification', 'nonClaims',
  ]);
  assert.equal(metadata.status, 'PENDING_INDEPENDENT_VERIFICATION');
  assert.equal(metadata.publicationEligible, false);
  assert.deepEqual(metadata.transport, {
    scheme: 'ws',
    confidentiality: false,
    peerAuthenticated: false,
    operatorRiskAccepted: true,
    endpointDisclosed: false,
  });
  assert.equal(metadataText.includes(ENDPOINT), false);
  assert.equal(/\b[0-9a-f]{64}\b/.test(metadataText), false);
  assert.equal(entries.includes('evidence'), false);
});

test('pending state cross-binding rejects every mismatched payment or delivery record', async t => {
  const cases = [
    ['settlement', candidate => { candidate.outcome.settlement.transaction = '0'.repeat(64); }],
    ['profile', candidate => { candidate.record.chainProfile.chainIdentifier = '0'; }],
    ['intent', candidate => { candidate.record.intentDigest = '0'.repeat(64); }],
    ['resource', candidate => { candidate.record.resourceIdentity.url = 'https://invalid.example/other'; }],
    ['signed block', candidate => { candidate.record.signedAccountBlock.nonce = '1'.repeat(16); }],
    ['cached response', candidate => { candidate.record.cachedResponse.body.message = 'different'; }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async subtest => {
      const options = await fixture(subtest, {
        walletText: '{"secretVersion":1,"mnemonic":"offline-placeholder-only","accountIndex":0}\n',
      });
      const configuration = fixtureConfiguration(options);
      const candidate = await validOutcome(configuration);
      mutate(candidate);
      const controller = {
        async start() {},
        async snapshotObservations() {
          return { evidenceEligible: true, events: observations('facilitator') };
        },
        async closeAndSnapshot() {
          return {
            quiescent: true,
            schemaVersion: 1,
            revision: 5,
            records: [structuredClone(candidate.record)],
          };
        },
        async terminate() {},
      };
      const operations = {
        async probeBuyerReadiness() {},
        async startFacilitator({ recovery }) {
          assert.equal(recovery, false);
          return controller;
        },
        async probePublicEndpoint() {},
        async readBuyerWallet() {
          return { mnemonic: 'offline-placeholder-only', accountIndex: 0 };
        },
        async paidFetch({ openWallet, onChallenge }) {
          await onChallenge(configuration.expectedPaymentRequired);
          await openWallet();
          return candidate.outcome;
        },
      };
      await assert.rejects(executePublicWsOnceRun(options, {
        operations,
        lifecycleObserver: fixedObserver(),
      }), fixedFailure);
      assert.equal(
        (await lstat(join(options.workspaceRoot, 'PUBLIC_WS_ONCE_CONSUMED'))).isFile(),
        true,
      );
      assert.equal((await lstat(join(options.workspaceRoot, options.runName))).isDirectory(), true);
      await assert.rejects(
        lstat(join(options.workspaceRoot, options.runName, 'pending-independent-verification')),
        error => error?.code === 'ENOENT',
      );
    });
  }
});

test('unknown outcome hard-stops without recovery, replacement, or cleanup', async t => {
  const options = await fixture(t, {
    walletText: '{"secretVersion":1,"mnemonic":"offline-placeholder-only","accountIndex":0}\n',
  });
  let reconciliations = 0;
  let starts = 0;
  const controller = {
    async start() { starts += 1; },
    async snapshotObservations() { return { evidenceEligible: false, events: [] }; },
    async closeAndSnapshot() { throw new Error('must not close as success'); },
    async terminate() {},
  };
  const operations = {
    async probeBuyerReadiness() {},
    async probePublicEndpoint() {},
    async startFacilitator({ recovery }) {
      assert.equal(recovery, false);
      return controller;
    },
    async readBuyerWallet() { return { mnemonic: 'offline-placeholder-only', accountIndex: 0 }; },
    async paidFetch({ onChallenge }) {
      await onChallenge(fixtureConfiguration(options).expectedPaymentRequired);
      return { kind: 'recovery', owner: {}, buyerObservations: [] };
    },
    async reconcilePayment() { reconciliations += 1; },
  };
  await assert.rejects(executePublicWsOnceRun(options, {
    operations,
    lifecycleObserver: fixedObserver(),
  }), fixedFailure);
  assert.equal(starts, 1);
  assert.equal(reconciliations, 0);
  assert.equal((await lstat(join(options.workspaceRoot, 'PUBLIC_WS_ONCE_CONSUMED'))).isFile(), true);
  assert.equal((await lstat(join(options.workspaceRoot, options.runName))).isDirectory(), true);
});

test('worker protocol uses an exact internal public-WS mode and rejects confusion', async () => {
  let startMessage;
  const child = new EventEmitter();
  child.connected = true;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.send = (message, callback) => {
    callback?.();
    if (message.type === 'START_PUBLIC_WS_ONCE') {
      startMessage = structuredClone(message);
      setImmediate(() => child.emit('message', {
        ipcVersion: 1,
        requestId: message.requestId,
        type: 'READY',
      }));
    } else if (message.type === 'STOP') {
      setImmediate(() => {
        child.emit('message', {
          ipcVersion: 1,
          requestId: message.requestId,
          type: 'STOPPED',
          snapshot: null,
        });
        setImmediate(() => {
          child.emit('exit', 0, null);
          child.emit('close', 0, null);
        });
      });
    }
    return true;
  };
  child.disconnect = () => { child.connected = false; };
  child.kill = () => true;
  const controller = await startLiveEvidenceFacilitatorWorker({
    config: config(),
    facilitatorRpcFd: 0,
    facilitatorRpcGeneration: SYNTHETIC_GENERATION,
    workspaceRoot: 'protected',
    journalDirectory: 'protected/journal',
    recovery: false,
    executionMode: PUBLIC_WS_ONCE_POLICY.executionMode,
    forkProcess: () => child,
  });
  await controller.start();
  assert.equal(startMessage.type, 'START_PUBLIC_WS_ONCE');
  assert.equal(startMessage.executionMode, PUBLIC_WS_ONCE_POLICY.executionMode);
  assert.equal(startMessage.recovery, false);
  assert.equal(startMessage.config.profileName, GATE_B_CURRENT_TESTNET_PROFILE_NAME);
  assert.equal(JSON.stringify(startMessage).includes(ENDPOINT), false);
  await controller.exit();

  const replies = [];
  const channel = new EventEmitter();
  channel.connected = true;
  channel.send = (message, callback) => {
    replies.push(message);
    callback?.();
    return true;
  };
  channel.disconnect = () => { channel.connected = false; };
  await runLiveEvidenceFacilitatorWorker({
    channel,
    start: async () => { throw new Error('must not start'); },
    shutdownTimeoutMs: 1000,
    forceExit: () => {},
  });
  channel.emit('message', {
    ipcVersion: 1,
    requestId: 1,
    type: 'START_PUBLIC_WS_ONCE',
    config: config(),
    facilitatorRpcGeneration: SYNTHETIC_GENERATION,
    workspaceRoot: 'protected',
    journalDirectory: 'protected/journal',
    recovery: true,
    executionMode: PUBLIC_WS_ONCE_POLICY.executionMode,
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(replies, [{
    ipcVersion: 1,
    requestId: 1,
    type: 'FAILED',
    code: 'live_evidence_worker_failed',
  }]);
});

test('manual independent-verification gate rejects unavailable, same-route, and mismatch records', () => {
  const valid = {
    verificationVersion: 1,
    runName: 'single-public-ws-run',
    route: 'different-operator-wss-or-https',
    sameEndpoint: false,
    sameOperatorRoute: false,
    exactBlockConfirmed: true,
    paymentIntentBindingConfirmed: true,
    momentumInclusionConfirmed: true,
  };
  assert.deepEqual(
    parsePublicWsOnceIndependentVerification(
      `${JSON.stringify(valid)}\n`,
      valid.runName,
    ),
    valid,
  );
  for (const mutate of [
    value => { value.sameEndpoint = true; },
    value => { value.sameOperatorRoute = true; },
    value => { value.exactBlockConfirmed = false; },
    value => { value.paymentIntentBindingConfirmed = false; },
    value => { value.momentumInclusionConfirmed = false; },
    value => { value.runName = 'different-run'; },
  ]) {
    const candidate = structuredClone(valid);
    mutate(candidate);
    assert.throws(() => parsePublicWsOnceIndependentVerification(
      `${JSON.stringify(candidate)}\n`,
      valid.runName,
    ));
  }
  assert.throws(() => parsePublicWsOnceIndependentVerification('', valid.runName));
});

test('dedicated CLI has exact commands and fixed endpoint-free output', async () => {
  const flags = [
    '--config', 'config.json',
    '--buyer-rpc', 'buyer-rpc.json',
    '--buyer-wallet', 'buyer-wallet.json',
    '--facilitator-rpc', 'facilitator-rpc.json',
    '--authorization', 'authorization.json',
    '--workspace', 'workspace',
    '--run-name', 'single-public-ws-run',
    '--transport-exception', PUBLIC_WS_ONCE_POLICY.transportException,
  ];
  const stdout = [];
  const stderr = [];
  assert.equal(await runPublicWsOnceRunnerCli({
    argv: ['preflight-public-ws-once', ...flags],
    stdout: value => { stdout.push(value); },
    stderr: value => { stderr.push(value); },
    preflight: async () => ({ valid: true }),
    execute: async () => { throw new Error('not used'); },
  }), true);
  assert.deepEqual(stdout, ['LIVE_EVIDENCE_PUBLIC_WS_ONCE_PREFLIGHT_VALID\n']);
  assert.deepEqual(stderr, []);
  stdout.length = 0;
  assert.equal(await runPublicWsOnceRunnerCli({
    argv: ['run-public-ws-once', ...flags],
    stdout: value => { stdout.push(value); },
    stderr: value => { stderr.push(value); },
    preflight: async () => { throw new Error('not used'); },
    execute: async () => ({
      status: 'pending-independent-verification',
      evidenceEligible: false,
    }),
  }), true);
  assert.deepEqual(stdout, [
    'LIVE_EVIDENCE_PUBLIC_WS_ONCE_PENDING_INDEPENDENT_VERIFICATION\n',
  ]);
  assert.deepEqual(stderr, []);
  stdout.length = 0;
  assert.equal(await runPublicWsOnceRunnerCli({
    argv: ['run', ...flags],
    stdout: value => { stdout.push(value); },
    stderr: value => { stderr.push(value); },
  }), false);
  assert.deepEqual(stdout, []);
  assert.deepEqual(stderr, ['LIVE_EVIDENCE_PUBLIC_WS_ONCE_FAILED\n']);
});
