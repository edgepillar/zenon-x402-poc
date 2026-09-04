import test from 'node:test';
import assert from 'node:assert/strict';
import { fork as forkProcess } from 'node:child_process';
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
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import * as sdk from 'znn-typescript-sdk';

import { canonicalJson, paymentIntentDigest, sha256Hex } from '../src/canonical.js';
import {
  GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST,
  GATE_B_QUICK_TUNNEL_HOSTNAME_PERSISTENCE_POLICY,
  GATE_B_QUICK_TUNNEL_RUNTIME_CONTROL_POLICY,
  GATE_B_QUICK_TUNNEL_TELEMETRY_POLICIES,
} from '../src/gate-b-quick-tunnel-artifact.js';
import {
  GATE_B_PUBLIC_WS_INPUT_LEAVES,
  GATE_B_CURRENT_TESTNET_WSS_ENDPOINT,
  serializeGateBQuickTunnelHostnameSource,
} from '../src/gate-b-public-ws-inputs-schema.js';
import { runPublicWsOnceRunnerCli } from '../src/live-evidence-public-ws-once-cli.js';
import { runPublicWsOnceExecutionChild } from '../src/live-evidence-public-ws-once-run-child.js';
import { supervisePublicWsOnceChild } from '../src/live-evidence-public-ws-once-supervisor.js';
import {
  assertLiveEvidenceFacilitatorController,
  runLiveEvidenceFacilitatorWorker,
  startLiveEvidenceFacilitatorWorker,
} from '../src/live-evidence-facilitator-worker.js';
import {
  executeCurrentTestnetWssOnceRun,
  executePublicWsOnceRun,
  currentTestnetWssOnceConfigDigest,
  CURRENT_TESTNET_WSS_ONCE_POLICY,
  parseCurrentTestnetWssOnceAuthorization,
  parseCurrentTestnetWssOnceRoleInput,
  parseCurrentTestnetWssOnceRunConfig,
  parseLiveRoleInput,
  parsePublicWsOnceAuthorization,
  parsePublicWsOnceIndependentVerification,
  parsePublicWsOnceRoleInput,
  parsePublicWsOnceRunConfig,
  persistPublicWsOnceConsumedMarker,
  preflightPublicWsOnceRun,
  preflightCurrentTestnetWssOnceRun,
  publicWsOnceConfigDigest,
  PUBLIC_WS_ONCE_POLICY,
} from '../src/live-evidence-runner.js';
import {
  assembleLiveEvidenceBundle,
  parseLiveEvidenceFragment,
  verifyLiveEvidenceBundle,
} from '../src/live-evidence.js';
import {
  createLiveEvidenceObserver,
  recordLiveEvidencePhase,
} from '../src/live-observation.js';
import { EVIDENCE_STATES, SettlementJournal } from '../src/settlement-journal.js';
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
const HOSTNAME = 'evidence.trycloudflare.com';
const RESOURCE_URL = `https://${HOSTNAME}/paid`;
const UTC = '2026-09-01T00:00:00.000Z';
const FIXTURE_CONFIGURATIONS = new WeakMap();
const SYNTHETIC_GENERATION = Object.freeze({
  dev: '1',
  ino: '2',
  size: '3',
  mtimeNs: '4',
  ctimeNs: '5',
});
const SYNTHETIC_DIRECTORY_IDENTITY = Object.freeze({ dev: '1', ino: '2' });
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

function canonicalQuickTunnelBinding(changes = {}) {
  const manifest = GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST;
  return {
    artifact: {
      architecture: manifest.architecture,
      archiveSha256: manifest.archiveSha256,
      asset: manifest.asset,
      executableSha256: manifest.executableSha256,
      manifestVersion: manifest.manifestVersion,
      platform: manifest.platform,
      release: manifest.release,
    },
    hostnamePersistence: { ...GATE_B_QUICK_TUNNEL_HOSTNAME_PERSISTENCE_POLICY },
    runtimeControl: { ...GATE_B_QUICK_TUNNEL_RUNTIME_CONTROL_POLICY },
    telemetry: {
      ...GATE_B_QUICK_TUNNEL_TELEMETRY_POLICIES.ACCEPT_POSSIBLE_ERROR_TELEMETRY,
    },
    ...changes,
  };
}

function quickTunnelBindingMutations() {
  return [
    ['artifact-architecture', value => { value.artifact.architecture = 'x64'; }],
    ['artifact-archive', value => { value.artifact.archiveSha256 = '0'.repeat(64); }],
    ['artifact-asset', value => { value.artifact.asset = 'alternate.tgz'; }],
    ['artifact-executable', value => { value.artifact.executableSha256 = '0'.repeat(64); }],
    ['artifact-version', value => { value.artifact.manifestVersion = 2; }],
    ['artifact-platform', value => { value.artifact.platform = 'linux'; }],
    ['artifact-release', value => { value.artifact.release = 'latest'; }],
    ['persistence-lifetime', value => { value.hostnamePersistence.lifetime = 'different'; }],
    ['persistence-version', value => { value.hostnamePersistence.policyVersion = 2; }],
    ['persistence-storage', value => { value.hostnamePersistence.storage = 'different'; }],
    ['runtime-auto-update', value => { value.runtimeControl.autoUpdate = 'different'; }],
    ['runtime-configuration', value => { value.runtimeControl.configuration = 'different'; }],
    ['runtime-credentials', value => { value.runtimeControl.credentials = 'different'; }],
    ['runtime-diagnostics', value => { value.runtimeControl.managementDiagnostics = 'different'; }],
    ['runtime-origin-certificate', value => { value.runtimeControl.originCertificate = 'different'; }],
    ['runtime-version', value => { value.runtimeControl.policyVersion = 2; }],
    ['runtime-prechecks', value => { value.runtimeControl.prechecks = 'different'; }],
    ['runtime-topology', value => { value.runtimeControl.processTopology = 'different'; }],
    ['runtime-storage', value => { value.runtimeControl.runtimeStorage = 'different'; }],
    ['telemetry-acknowledgement', value => { value.telemetry.acknowledgement = 'different'; }],
    ['telemetry-classification', value => { value.telemetry.classification = 'disabled'; }],
    ['telemetry-mode', value => { value.telemetry.mode = 'DISABLED'; }],
  ];
}

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
    runnerVersion: 2,
    sourceRevision: 'b'.repeat(40),
    profileName: GATE_B_CURRENT_TESTNET_PROFILE_NAME,
    acknowledgements: {
      live: TESTNET_LIVE_ACKNOWLEDGEMENT,
      operatorTrust: GATE_B_CURRENT_TESTNET_OPERATOR_TRUST_ACKNOWLEDGEMENT,
    },
    quickTunnel: canonicalQuickTunnelBinding(),
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
    authorizationVersion: 2,
    transportException: PUBLIC_WS_ONCE_POLICY.transportException,
    runName: 'single-public-ws-run',
    sourceRevision: configuration.sourceRevision,
    profileName: configuration.profileName,
    configDigest: publicWsOnceConfigDigest(configuration),
    paymentIntentDigest: paymentIntentDigest(
      configuration.expectedPaymentRequired,
      configuration.expectedPaymentRequired.accepts[0],
    ),
    rpcEndpoint: endpoint,
    quickTunnel: configuration.quickTunnel,
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
  const currentTestnetWss = changes.currentTestnetWss === true;
  const configuration = changes.config ?? (currentTestnetWss
    ? currentTestnetWssConfig()
    : config());
  const defaultRpcEndpoint = currentTestnetWss
    ? GATE_B_CURRENT_TESTNET_WSS_ENDPOINT
    : ENDPOINT;
  const rpcSecretVersion = currentTestnetWss ? 3 : 2;
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
    `${JSON.stringify({
      secretVersion: rpcSecretVersion,
      rpcEndpoint: changes.buyerEndpoint ?? defaultRpcEndpoint,
    })}\n`,
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
      secretVersion: rpcSecretVersion,
      rpcEndpoint: changes.facilitatorEndpoint ?? defaultRpcEndpoint,
    })}\n`,
    { mode: 0o600 },
  );
  const authorizationValue = changes.authorization ?? (currentTestnetWss
    ? currentTestnetWssAuthorization(configuration)
    : authorization(configuration));
  await writeFile(
    paths.authorizationPath,
    `${JSON.stringify(authorizationValue)}\n`,
    { mode: 0o600 },
  );
  await writeFile(
    join(workspaceRoot, GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource),
    changes.hostnameSourceBytes ?? serializeGateBQuickTunnelHostnameSource(
      changes.hostname ?? HOSTNAME,
      changes.quickTunnel ?? configuration.quickTunnel,
    ),
    { mode: 0o600 },
  );
  const options = {
    ...paths,
    workspaceRoot,
    runName: currentTestnetWss
      ? 'single-current-testnet-wss-run'
      : 'single-public-ws-run',
    ...(currentTestnetWss
      ? { executionMode: CURRENT_TESTNET_WSS_ONCE_POLICY.executionMode }
      : { transportException: PUBLIC_WS_ONCE_POLICY.transportException }),
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

function journalInputFromRecord(record) {
  return {
    authorizationKey: record.authorizationKey,
    transactionHash: record.transactionHash,
    chainProfile: structuredClone(record.chainProfile),
    intentDigest: record.intentDigest,
    resourceIdentity: structuredClone(record.resourceIdentity),
    resourceDigest: record.resourceDigest,
    payer: record.payer,
    signedAccountBlock: structuredClone(record.signedAccountBlock),
  };
}

async function createRetainedProductionState(runDirectory, record) {
  await writeFile(join(runDirectory, 'SUBMISSION_ARMED'), 'SUBMISSION_ARMED\n', {
    mode: 0o600,
  });
  const journal = new SettlementJournal({
    directory: join(runDirectory, 'journal'),
    allowedRoot: runDirectory,
    clock: () => new Date(UTC),
  });
  assert.deepEqual(await journal.load(), { schemaVersion: 1, revision: 0, records: [] });
  await journal.putValidated(journalInputFromRecord(record));
  await journal.updateEvidence(
    record.authorizationKey,
    record.transactionHash,
    EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
  );
  await journal.updateEvidence(
    record.authorizationKey,
    record.transactionHash,
    EVIDENCE_STATES.MOMENTUM_INCLUDED,
    record.momentumEvidence,
  );
  await journal.markDeliveryPending(record.authorizationKey, record.transactionHash);
  await journal.markDelivered(
    record.authorizationKey,
    record.transactionHash,
    record.cachedResponse,
  );
  return journal;
}

function successfulPublicWsExecution(options, candidate, afterState = async () => {}) {
  let journal;
  const controller = {
    async preload() {},
    async start() {},
    async snapshotObservations() {
      return { evidenceEligible: true, events: observations('facilitator') };
    },
    async closeAndSnapshot() {
      const snapshot = await journal.load();
      return { quiescent: true, ...snapshot };
    },
    async terminate() {},
  };
  return {
    sourceTreeAttestor: async () => true,
    operations: {
      async probeBuyerReadiness() {},
      async startFacilitator() {
        const runDirectory = join(options.workspaceRoot, options.runName);
        journal = await createRetainedProductionState(runDirectory, candidate.record);
        await afterState(runDirectory);
        return controller;
      },
      async probePublicEndpoint() {},
      async readBuyerWallet() {
        return { mnemonic: 'offline-placeholder-only', accountIndex: 0 };
      },
      async paidFetch({ openWallet, onChallenge }) {
        await onChallenge(fixtureConfiguration(options).expectedPaymentRequired);
        await openWallet();
        return candidate.outcome;
      },
    },
    lifecycleObserver: fixedObserver(),
  };
}

async function assertPrivateTestFile(path) {
  const stat = await lstat(path);
  assert.equal(stat.isFile(), true);
  assert.equal(stat.isSymbolicLink(), false);
  assert.equal(stat.nlink, 1);
  assert.equal(stat.mode & 0o777, 0o600);
}

async function assertPrivateTestDirectory(path) {
  const stat = await lstat(path);
  assert.equal(stat.isDirectory(), true);
  assert.equal(stat.isSymbolicLink(), false);
  assert.equal(stat.mode & 0o777, 0o700);
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

test('config and authorization require exact profile, digest, recovery, and acknowledgements', () => {
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
    value => { value.configDigest = '0'.repeat(63); },
    value => { value.configDigest = 'A'.repeat(64); },
    value => { value.paymentIntentDigest = '0'.repeat(63); },
    value => { value.extra = true; },
  ]) {
    const candidate = structuredClone(approved);
    mutate(candidate);
    assert.throws(() => parsePublicWsOnceAuthorization(`${JSON.stringify(candidate)}\n`));
  }
});

test('authorization config digest changes across every mutable config subtree', () => {
  const baseline = config();
  const baselineDigest = publicWsOnceConfigDigest(baseline);
  const parsed = parsePublicWsOnceRunConfig(`${JSON.stringify(baseline)}\n`);
  assert.equal(
    baselineDigest,
    sha256Hex(`zenon-x402-public-ws-once-config-v2\n${canonicalJson(parsed)}`),
  );
  const validMutations = [
    value => { value.sourceRevision = 'c'.repeat(40); },
    value => { value.expectedPaymentRequired.resource.description = 'different'; },
    value => { value.expectedPaymentRequired.accepts[0].amount = '2'; },
    value => { value.runtime.listenPort += 1; },
    value => { value.runtime.rpcTimeoutMs += 1; },
    value => { value.runtime.maxRecoveryElapsedMs += 1; },
  ];
  for (const mutate of validMutations) {
    const candidate = structuredClone(baseline);
    mutate(candidate);
    assert.notEqual(publicWsOnceConfigDigest(candidate), baselineDigest);
  }
  const boundMutations = [
    value => { value.quickTunnel.artifact.release = '2026.8.1'; },
    value => { value.quickTunnel.telemetry.classification = 'different'; },
    value => { value.quickTunnel.runtimeControl.autoUpdate = 'different'; },
    value => { value.quickTunnel.hostnamePersistence.lifetime = 'different'; },
  ];
  for (const mutate of boundMutations) {
    const candidate = structuredClone(baseline);
    mutate(candidate);
    assert.throws(() => publicWsOnceConfigDigest(candidate));
    assert.notEqual(
      sha256Hex(`zenon-x402-public-ws-once-config-v2\n${canonicalJson(candidate)}`),
      baselineDigest,
    );
  }
});

test('preflight validates six distinct protected files without reading wallet contents', async t => {
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

test('preflight rejects valid config mutations against one frozen authorization', async t => {
  const baseline = config();
  const approved = authorization(baseline);
  const mutations = [
    ['runner version', value => { value.runnerVersion = 1; }],
    ['revision', value => { value.sourceRevision = 'c'.repeat(40); }],
    ['profile', value => { value.profileName = OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME; }],
    ['live acknowledgement', value => { value.acknowledgements.live = 'different'; }],
    ['trust acknowledgement', value => { value.acknowledgements.operatorTrust = 'different'; }],
    ['requirement', value => { value.expectedPaymentRequired.accepts[0].amount = '2'; }],
    ['resource', value => { value.expectedPaymentRequired.resource.description = 'different'; }],
    ['listen port', value => { value.runtime.listenPort += 1; }],
    ['RPC timeout', value => { value.runtime.rpcTimeoutMs += 1; }],
    ['recovery attempts', value => { value.runtime.maxRecoveryAttempts = 1; }],
    ['recovery delay', value => { value.runtime.recoveryDelayMs = 1; }],
    ['recovery elapsed bound', value => { value.runtime.maxRecoveryElapsedMs += 1; }],
  ];
  for (const [name, mutate] of mutations) {
    await t.test(name, async subtest => {
      const candidate = structuredClone(baseline);
      mutate(candidate);
      const options = await fixture(subtest, {
        config: candidate,
        authorization: approved,
      });
      await assert.rejects(preflightPublicWsOnceRun(options), fixedFailure);
    });
  }
});

test('strict cutover rejects every old-v1 and mixed source, config, authorization chain', async t => {
  const baseline = config();
  const approved = authorization(baseline);
  const v2Source = serializeGateBQuickTunnelHostnameSource(
    HOSTNAME,
    baseline.quickTunnel,
  );
  const v1Source = Buffer.from(`${canonicalJson({
    hostname: HOSTNAME,
    kind: 'gate-b-quick-tunnel-hostname-source',
    schemaVersion: 1,
  })}\n`, 'utf8');
  for (let mask = 0; mask < 7; mask += 1) {
    await t.test(`old-or-mixed-${mask + 1}`, async subtest => {
      const sourceV2 = (mask & 1) !== 0;
      const configV2 = (mask & 2) !== 0;
      const authorizationV2 = (mask & 4) !== 0;
      const candidateConfig = structuredClone(baseline);
      if (!configV2) {
        candidateConfig.runnerVersion = 1;
        delete candidateConfig.quickTunnel;
      }
      const candidateAuthorization = structuredClone(approved);
      if (!authorizationV2) {
        candidateAuthorization.authorizationVersion = 1;
        delete candidateAuthorization.quickTunnel;
      }
      const options = await fixture(subtest, {
        authorization: candidateAuthorization,
        config: candidateConfig,
        hostnameSourceBytes: sourceV2 ? v2Source : v1Source,
      });
      await assert.rejects(preflightPublicWsOnceRun(options), fixedFailure);
    });
  }
});

test('preflight rejects every bound field mutation at each source, config, and authorization layer',
  async t => {
    for (const layer of ['source', 'config', 'authorization']) {
      for (const [name, mutate] of quickTunnelBindingMutations()) {
        await t.test(`${layer}-${name}`, async subtest => {
          const configuration = config();
          const approved = authorization(configuration);
          let sourceBinding = structuredClone(configuration.quickTunnel);
          if (layer === 'source') mutate(sourceBinding);
          if (layer === 'config') mutate(configuration.quickTunnel);
          if (layer === 'authorization') mutate(approved.quickTunnel);
          const hostnameSourceBytes = Buffer.from(`${canonicalJson({
            hostname: HOSTNAME,
            kind: 'gate-b-quick-tunnel-hostname-source',
            quickTunnel: sourceBinding,
            schemaVersion: 2,
          })}\n`, 'utf8');
          const options = await fixture(subtest, {
            authorization: approved,
            config: configuration,
            hostnameSourceBytes,
          });
          await assert.rejects(preflightPublicWsOnceRun(options), fixedFailure);
        });
      }
    }
  });

test('preflight accepts either exact honest telemetry policy and rejects cross-layer pairing',
  async t => {
    const external = canonicalQuickTunnelBinding();
    external.telemetry = {
      ...GATE_B_QUICK_TUNNEL_TELEMETRY_POLICIES.EXTERNAL_SENTRY_EGRESS_CONTROL_ATTESTED,
    };
    const matchingConfig = config();
    matchingConfig.quickTunnel = external;
    const matching = await fixture(t, {
      config: matchingConfig,
      authorization: authorization(matchingConfig),
      quickTunnel: external,
    });
    assert.deepEqual(await preflightPublicWsOnceRun(matching), { valid: true });

    const mismatched = await fixture(t, {
      quickTunnel: external,
    });
    await assert.rejects(preflightPublicWsOnceRun(mismatched), fixedFailure);
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

test('source drift at the first check prevents module loading, consumption, and effects', async t => {
  const options = await fixture(t);
  let checks = 0;
  let moduleLoads = 0;
  let effects = 0;
  await assert.rejects(executePublicWsOnceRun(options, {
    sourceTreeAttestor: async () => {
      checks += 1;
      throw new Error('private first-check drift detail');
    },
    repositoryModuleLoader: async () => {
      moduleLoads += 1;
      return {
        assertLiveEvidenceFacilitatorController,
        startLiveEvidenceFacilitatorWorker,
      };
    },
    operations: {
      async probeBuyerReadiness() { effects += 1; },
      async probePublicEndpoint() { effects += 1; },
      async startFacilitator() { effects += 1; },
      async readBuyerWallet() { effects += 1; },
      async paidFetch() { effects += 1; },
    },
  }), fixedFailure);
  assert.equal(checks, 1);
  assert.equal(moduleLoads, 0);
  assert.equal(effects, 0);
  await assert.rejects(
    lstat(join(options.workspaceRoot, 'PUBLIC_WS_ONCE_CONSUMED')),
    error => error?.code === 'ENOENT',
  );
});

test('source drift after the last parent module load fails before consumption or effects', async t => {
  const options = await fixture(t);
  let checks = 0;
  let moduleLoads = 0;
  let effects = 0;
  await assert.rejects(executePublicWsOnceRun(options, {
    sourceTreeAttestor: async () => {
      checks += 1;
      if (checks === 2) throw new Error('private Git drift detail');
      return true;
    },
    repositoryModuleLoader: async () => {
      moduleLoads += 1;
      return {
        assertLiveEvidenceFacilitatorController,
        startLiveEvidenceFacilitatorWorker,
      };
    },
    operations: {
      async probeBuyerReadiness() { effects += 1; },
      async probePublicEndpoint() { effects += 1; },
      async startFacilitator() { effects += 1; },
      async readBuyerWallet() { effects += 1; },
      async paidFetch() { effects += 1; },
    },
  }), fixedFailure);
  assert.equal(checks, 2);
  assert.equal(moduleLoads, 1);
  assert.equal(effects, 0);
  await assert.rejects(
    lstat(join(options.workspaceRoot, 'PUBLIC_WS_ONCE_CONSUMED')),
    error => error?.code === 'ENOENT',
  );
  await assert.rejects(
    lstat(join(options.workspaceRoot, options.runName)),
    error => error?.code === 'ENOENT',
  );
});

test('source drift at the third check reaps the preloaded child before RPC effects', async t => {
  const options = await fixture(t);
  let checks = 0;
  let workerCreates = 0;
  let preloads = 0;
  let starts = 0;
  let effects = 0;
  let terminations = 0;
  const controller = {
    async preload() { preloads += 1; },
    async start() { starts += 1; },
    async snapshotObservations() { effects += 1; },
    async closeAndSnapshot() { effects += 1; },
    async terminate() { terminations += 1; },
  };
  await assert.rejects(executePublicWsOnceRun(options, {
    sourceTreeAttestor: async () => {
      checks += 1;
      if (checks === 3) throw new Error('private final-check drift detail');
      return true;
    },
    operations: {
      async probeBuyerReadiness() { effects += 1; },
      async probePublicEndpoint() { effects += 1; },
      async startFacilitator() {
        workerCreates += 1;
        return controller;
      },
      async readBuyerWallet() { effects += 1; },
      async paidFetch() { effects += 1; },
    },
  }), fixedFailure);
  assert.equal(checks, 3);
  assert.equal(workerCreates, 1);
  assert.equal(preloads, 1);
  assert.equal(starts, 0);
  assert.equal(effects, 0);
  assert.equal(terminations, 1);
  assert.equal((await lstat(join(options.workspaceRoot, 'PUBLIC_WS_ONCE_CONSUMED'))).isFile(), true);
  assert.equal((await lstat(join(options.workspaceRoot, options.runName))).isDirectory(), true);
});

test('preload failure reaps the idle child and retains the consumed attempt', async t => {
  const options = await fixture(t);
  let checks = 0;
  let starts = 0;
  let effects = 0;
  let terminations = 0;
  const controller = {
    async preload() { throw new Error('private preload failure detail'); },
    async start() { starts += 1; },
    async snapshotObservations() { effects += 1; },
    async closeAndSnapshot() { effects += 1; },
    async terminate() { terminations += 1; },
  };
  await assert.rejects(executePublicWsOnceRun(options, {
    sourceTreeAttestor: async () => {
      checks += 1;
      return true;
    },
    operations: {
      async probeBuyerReadiness() { effects += 1; },
      async probePublicEndpoint() { effects += 1; },
      async startFacilitator() { return controller; },
      async readBuyerWallet() { effects += 1; },
      async paidFetch() { effects += 1; },
    },
  }), fixedFailure);
  assert.equal(checks, 2);
  assert.equal(starts, 0);
  assert.equal(effects, 0);
  assert.equal(terminations, 1);
  assert.equal((await lstat(join(options.workspaceRoot, 'PUBLIC_WS_ONCE_CONSUMED'))).isFile(), true);
  assert.equal((await lstat(join(options.workspaceRoot, options.runName))).isDirectory(), true);
});

test('fixed workspace marker is exclusive, durable, and one-attempt within an unchanged workspace', async t => {
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

test('workspace rename and replacement fail closed before every later effect boundary', async t => {
  for (const phase of ['after-consumed-marker', 'after-run-directory']) {
    await t.test(phase, async subtest => {
      const options = await fixture(subtest);
      const original = `${options.workspaceRoot}-original`;
      let replaced = false;
      await assert.rejects(executePublicWsOnceRun(options, {
        sourceTreeAttestor: async () => true,
        operations: {},
        workspaceBoundaryObserver: async observedPhase => {
          if (observedPhase !== phase || replaced) return;
          replaced = true;
          await rename(options.workspaceRoot, original);
          await mkdir(options.workspaceRoot, { mode: 0o700 });
        },
      }), fixedFailure);
      assert.equal(replaced, true);
      assert.equal((await lstat(join(original, 'PUBLIC_WS_ONCE_CONSUMED'))).isFile(), true);
    });
  }
});

test('run-directory rename and replacement fails closed before RPC or wallet effects', async t => {
  const options = await fixture(t);
  let effects = 0;
  let replaced = false;
  const runDirectory = join(options.workspaceRoot, options.runName);
  const moved = join(options.workspaceRoot, `${options.runName}-original`);
  const controller = {
    async preload() {},
    async start() { effects += 1; },
    async snapshotObservations() { effects += 1; },
    async closeAndSnapshot() { effects += 1; },
    async terminate() {},
  };
  await assert.rejects(executePublicWsOnceRun(options, {
    sourceTreeAttestor: async () => true,
    operations: {
      async probeBuyerReadiness() { effects += 1; },
      async probePublicEndpoint() { effects += 1; },
      async startFacilitator() { return controller; },
      async readBuyerWallet() { effects += 1; },
      async paidFetch() { effects += 1; },
    },
    workspaceBoundaryObserver: async phase => {
      if (phase !== 'before-final-source-attestation' || replaced) return;
      replaced = true;
      await rename(runDirectory, moved);
      await mkdir(runDirectory, { mode: 0o700 });
    },
  }), fixedFailure);
  assert.equal(replaced, true);
  assert.equal(effects, 0);
  assert.equal((await lstat(join(options.workspaceRoot, 'PUBLIC_WS_ONCE_CONSUMED'))).isFile(), true);
});

test('late workspace namespace replacement fails closed before pending success', async t => {
  for (const phase of ['after-paid-fetch', 'after-pending-candidate', 'after-pending-state']) {
    await t.test(phase, async subtest => {
      const options = await fixture(subtest, {
        walletText: '{"secretVersion":1,"mnemonic":"offline-placeholder-only","accountIndex":0}\n',
      });
      const candidate = await validOutcome(fixtureConfiguration(options));
      const moved = `${options.workspaceRoot}-original`;
      let replaced = false;
      await assert.rejects(executePublicWsOnceRun(options, {
        ...successfulPublicWsExecution(options, candidate),
        workspaceBoundaryObserver: async observedPhase => {
          if (observedPhase !== phase || replaced) return;
          replaced = true;
          await rename(options.workspaceRoot, moved);
          await mkdir(options.workspaceRoot, { mode: 0o700 });
        },
      }), fixedFailure);
      assert.equal(replaced, true);
      assert.equal((await lstat(join(moved, 'PUBLIC_WS_ONCE_CONSUMED'))).isFile(), true);
    });
  }
});

test('late run-directory namespace replacement fails closed before pending success', async t => {
  for (const phase of ['after-paid-fetch', 'after-pending-candidate', 'after-pending-state']) {
    await t.test(phase, async subtest => {
      const options = await fixture(subtest, {
        walletText: '{"secretVersion":1,"mnemonic":"offline-placeholder-only","accountIndex":0}\n',
      });
      const candidate = await validOutcome(fixtureConfiguration(options));
      const runDirectory = join(options.workspaceRoot, options.runName);
      const moved = join(options.workspaceRoot, `${options.runName}-original`);
      let replaced = false;
      await assert.rejects(executePublicWsOnceRun(options, {
        ...successfulPublicWsExecution(options, candidate),
        workspaceBoundaryObserver: async observedPhase => {
          if (observedPhase !== phase || replaced) return;
          replaced = true;
          await rename(runDirectory, moved);
          await mkdir(runDirectory, { mode: 0o700 });
        },
      }), fixedFailure);
      assert.equal(replaced, true);
      assert.equal((await lstat(moved)).isDirectory(), true);
      assert.equal(
        (await lstat(join(options.workspaceRoot, 'PUBLIC_WS_ONCE_CONSUMED'))).isFile(),
        true,
      );
    });
  }
});

test('release, exclusive bind, and public-health failures precede wallet and publication effects',
  async t => {
    for (const mode of ['release-ambiguous', 'bind-failure', 'public-health-failure']) {
      await t.test(mode, async subtest => {
        const options = await fixture(subtest, {
          walletText: '{"secretVersion":1,"mnemonic":"offline-placeholder-only","accountIndex":0}\n',
        });
        const effects = [];
        const controller = {
          async preload() { effects.push('preload'); },
          async start() {
            effects.push('bind');
            if (mode === 'bind-failure') throw new Error('fixture');
          },
          async snapshotObservations() { effects.push('snapshot'); },
          async closeAndSnapshot() { effects.push('close'); },
          async terminate() { effects.push('terminate'); },
        };
        await assert.rejects(executePublicWsOnceRun(options, {
          beforeOriginBind: async () => {
            effects.push('release');
            return mode !== 'release-ambiguous';
          },
          sourceTreeAttestor: async () => true,
          operations: {
            async probeBuyerReadiness() { effects.push('buyer-readiness'); },
            async probePublicEndpoint() {
              effects.push('public-health');
              if (mode === 'public-health-failure') throw new Error('fixture');
            },
            async startFacilitator() { effects.push('create'); return controller; },
            async readBuyerWallet() { effects.push('wallet'); },
            async paidFetch() { effects.push('payment'); },
          },
        }), fixedFailure);
        assert.equal(effects.includes('wallet'), false);
        assert.equal(effects.includes('payment'), false);
        assert.equal(effects.includes('snapshot'), false);
        assert.equal(effects.includes('close'), false);
        assert.equal((await lstat(join(
          options.workspaceRoot, 'PUBLIC_WS_ONCE_CONSUMED',
        ))).isFile(), true);
        await assert.rejects(lstat(join(
          options.workspaceRoot,
          options.runName,
          'pending-independent-verification',
        )));
      });
    }
  });

test('workspace-scoped execution consumes before effects and retains exact private pending capture state', async t => {
  const options = await fixture(t, {
    walletText: '{"secretVersion":1,"mnemonic":"offline-placeholder-only","accountIndex":0}\n',
  });
  const configuration = fixtureConfiguration(options);
  const candidate = await validOutcome(configuration);
  const outcome = candidate.outcome;
  const effectOrder = [];
  let sourceChecks = 0;
  let journal;
  const controller = {
    async preload() { effectOrder.push('worker-preload'); },
    async start() { effectOrder.push('worker-start'); },
    async snapshotObservations() {
      return { evidenceEligible: true, events: observations('facilitator') };
    },
    async closeAndSnapshot() {
      const snapshot = await journal.load();
      return {
        quiescent: true,
        schemaVersion: snapshot.schemaVersion,
        revision: snapshot.revision,
        records: snapshot.records,
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
      journal = await createRetainedProductionState(
        join(options.workspaceRoot, options.runName),
        candidate.record,
      );
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
      effectOrder.push('challenge-402');
      await openWallet();
      effectOrder.push('payment');
      return outcome;
    },
  };
  const result = await executePublicWsOnceRun(options, {
    beforeOriginBind: async () => {
      effectOrder.push('origin-release');
      return true;
    },
    sourceTreeAttestor: async () => {
      sourceChecks += 1;
      effectOrder.push(`source-check-${sourceChecks}`);
      return true;
    },
    repositoryModuleLoader: async () => {
      effectOrder.push('parent-module-load');
      return {
        assertLiveEvidenceFacilitatorController,
        startLiveEvidenceFacilitatorWorker,
      };
    },
    operations,
    lifecycleObserver: fixedObserver(),
  });
  assert.deepEqual(result, {
    status: 'pending-independent-verification',
    evidenceEligible: false,
  });
  assert.deepEqual(effectOrder.slice(0, 8), [
    'source-check-1', 'parent-module-load', 'source-check-2', 'worker-create',
    'worker-preload', 'source-check-3', 'buyer-readiness', 'origin-release',
  ]);
  assert.equal(effectOrder[8], 'worker-start');
  assert.equal(effectOrder.indexOf('worker-start') <
    effectOrder.indexOf('public-endpoint'), true);
  assert.equal(effectOrder.indexOf('public-endpoint') <
    effectOrder.indexOf('challenge-402'), true);
  assert.equal(effectOrder.indexOf('challenge-402') < effectOrder.indexOf('wallet'), true);
  assert.equal(effectOrder.indexOf('wallet') < effectOrder.indexOf('payment'), true);
  const runDirectory = join(options.workspaceRoot, options.runName);
  assert.deepEqual((await readdir(options.workspaceRoot)).sort(), [
    basename(options.authorizationPath),
    basename(options.buyerRpcPath),
    basename(options.buyerWalletPath),
    basename(options.configPath),
    basename(options.facilitatorRpcPath),
    GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
    'PUBLIC_WS_ONCE_CONSUMED',
    options.runName,
  ].sort());
  const entries = await readdir(runDirectory);
  assert.deepEqual(entries.sort(), [
    'SUBMISSION_ARMED', 'journal', 'pending-independent-verification',
  ]);
  assert.deepEqual((await readdir(join(runDirectory, 'journal'))).sort(), [
    '.settlement-journal.initialized', 'settlement-journal.json',
  ]);
  const pendingDirectory = join(runDirectory, 'pending-independent-verification');
  assert.deepEqual((await readdir(pendingDirectory)).sort(), [
    'PENDING_INDEPENDENT_VERIFICATION',
    'capture',
    'metadata.json',
  ]);
  const metadataText = await readFile(join(pendingDirectory, 'metadata.json'), 'utf8');
  const metadata = JSON.parse(metadataText);
  assert.deepEqual(Object.keys(metadata), [
    'candidateVersion', 'status', 'publicationEligible', 'transport',
    'independentVerification', 'privateCapture', 'nonClaims',
  ]);
  assert.equal(metadata.status, 'PENDING_INDEPENDENT_VERIFICATION');
  assert.equal(metadata.publicationEligible, false);
  assert.deepEqual(metadata.privateCapture, {
    complete: true,
    independentlyVerified: false,
    publicBundleProduced: false,
    fragmentCount: 5,
  });
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
  assert.equal(entries.includes('COMPLETE'), false);
  const captureDirectory = join(pendingDirectory, 'capture');
  const captureNames = ['manifest', 'chain', 'http', 'journal', 'timing'];
  assert.deepEqual((await readdir(captureDirectory)).sort(),
    captureNames.map(name => `${name}.json`).sort());
  const fragments = {};
  let rawCapture = '';
  for (const name of captureNames) {
    const text = await readFile(join(captureDirectory, `${name}.json`), 'utf8');
    rawCapture += text;
    fragments[name] = parseLiveEvidenceFragment(
      text,
      name,
    );
  }
  assert.equal(rawCapture.includes(ENDPOINT), false);
  assert.equal(rawCapture.includes(options.workspaceRoot), false);
  assert.equal(rawCapture.includes('offline-placeholder-only'), false);
  for (const path of [
    options.configPath,
    options.buyerRpcPath,
    options.buyerWalletPath,
    options.facilitatorRpcPath,
    options.authorizationPath,
  ]) assert.equal(rawCapture.includes(path), false);
  for (const directory of [
    options.workspaceRoot,
    runDirectory,
    join(runDirectory, 'journal'),
    pendingDirectory,
    captureDirectory,
  ]) await assertPrivateTestDirectory(directory);
  for (const path of [
    options.configPath,
    options.buyerRpcPath,
    options.buyerWalletPath,
    options.facilitatorRpcPath,
    options.authorizationPath,
    join(options.workspaceRoot, 'PUBLIC_WS_ONCE_CONSUMED'),
    join(runDirectory, 'SUBMISSION_ARMED'),
    join(runDirectory, 'journal', '.settlement-journal.initialized'),
    join(runDirectory, 'journal', 'settlement-journal.json'),
    join(pendingDirectory, 'metadata.json'),
    join(pendingDirectory, 'PENDING_INDEPENDENT_VERIFICATION'),
    ...captureNames.map(name => join(captureDirectory, `${name}.json`)),
  ]) await assertPrivateTestFile(path);
  const independent = {
    verificationVersion: 1,
    runName: options.runName,
    route: 'different-operator-wss-or-https',
    sameEndpoint: false,
    sameOperatorRoute: false,
    exactBlockConfirmed: true,
    paymentIntentBindingConfirmed: true,
    momentumInclusionConfirmed: true,
  };
  assert.deepEqual(parsePublicWsOnceIndependentVerification(
    `${JSON.stringify(independent)}\n`,
    options.runName,
  ), independent);
  const bundle = await assembleLiveEvidenceBundle(fragments);
  assert.deepEqual(
    await verifyLiveEvidenceBundle(bundle),
    { valid: true, evidenceVersion: 1 },
  );
});

test('successful validation rejects unexpected retained-tree entries and produces no bundle', async t => {
  const options = await fixture(t, {
    walletText: '{"secretVersion":1,"mnemonic":"offline-placeholder-only","accountIndex":0}\n',
  });
  const configuration = fixtureConfiguration(options);
  const candidate = await validOutcome(configuration);
  let journal;
  const controller = {
    async preload() {},
    async start() {},
    async snapshotObservations() {
      return { evidenceEligible: true, events: observations('facilitator') };
    },
    async closeAndSnapshot() {
      const snapshot = await journal.load();
      return { quiescent: true, ...snapshot };
    },
    async terminate() {},
  };
  await assert.rejects(executePublicWsOnceRun(options, {
    sourceTreeAttestor: async () => true,
    operations: {
      async probeBuyerReadiness() {},
      async startFacilitator() {
        const runDirectory = join(options.workspaceRoot, options.runName);
        journal = await createRetainedProductionState(runDirectory, candidate.record);
        await writeFile(join(runDirectory, 'unexpected'), 'unexpected\n', { mode: 0o600 });
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
    },
    lifecycleObserver: fixedObserver(),
  }), fixedFailure);
  const entries = await readdir(join(options.workspaceRoot, options.runName));
  assert.equal(entries.includes('evidence'), false);
  assert.equal(entries.includes('COMPLETE'), false);
  assert.equal(entries.includes('pending-independent-verification'), false);
});

test('successful validation rejects unexpected journal entries', async t => {
  const options = await fixture(t, {
    walletText: '{"secretVersion":1,"mnemonic":"offline-placeholder-only","accountIndex":0}\n',
  });
  const candidate = await validOutcome(fixtureConfiguration(options));
  const injected = successfulPublicWsExecution(options, candidate, async runDirectory => {
    await writeFile(
      join(runDirectory, 'journal', 'unexpected'),
      'unexpected\n',
      { mode: 0o600 },
    );
  });
  await assert.rejects(executePublicWsOnceRun(options, injected), fixedFailure);
  const runDirectory = join(options.workspaceRoot, options.runName);
  assert.equal((await readdir(runDirectory)).includes('pending-independent-verification'), false);
  assert.equal((await readdir(runDirectory)).includes('evidence'), false);
  assert.equal((await readdir(runDirectory)).includes('COMPLETE'), false);
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
        async preload() {},
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
        sourceTreeAttestor: async () => true,
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
    async preload() {},
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
    sourceTreeAttestor: async () => true,
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
  let preloadMessage;
  const child = new EventEmitter();
  child.connected = true;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.send = (message, callback) => {
    callback?.();
    if (message.type === 'PRELOAD') {
      preloadMessage = structuredClone(message);
      setImmediate(() => child.emit('message', {
        ipcVersion: 1,
        requestId: message.requestId,
        type: 'PRELOADED',
      }));
    } else if (message.type === 'START_PUBLIC_WS_ONCE') {
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
    workspaceIdentity: SYNTHETIC_DIRECTORY_IDENTITY,
    runDirectoryIdentity: SYNTHETIC_DIRECTORY_IDENTITY,
    forkProcess: () => child,
  });
  await controller.preload();
  assert.deepEqual(preloadMessage, { ipcVersion: 1, requestId: 1, type: 'PRELOAD' });
  assert.equal(startMessage, undefined);
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
  let startCalls = 0;
  await runLiveEvidenceFacilitatorWorker({
    channel,
    start: async () => {
      startCalls += 1;
      throw new Error('must not start');
    },
    shutdownTimeoutMs: 1000,
    forceExit: () => {},
  });
  channel.emit('message', {
    ipcVersion: 1,
    requestId: 1,
    type: 'PRELOAD',
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(replies, [{
    ipcVersion: 1,
    requestId: 1,
    type: 'PRELOADED',
  }]);
  assert.equal(startCalls, 0);
  channel.emit('message', {
    ipcVersion: 1,
    requestId: 2,
    type: 'START_PUBLIC_WS_ONCE',
    config: config(),
    facilitatorRpcGeneration: SYNTHETIC_GENERATION,
    workspaceRoot: 'protected',
    journalDirectory: 'protected/journal',
    recovery: true,
    executionMode: PUBLIC_WS_ONCE_POLICY.executionMode,
    workspaceIdentity: SYNTHETIC_DIRECTORY_IDENTITY,
    runDirectoryIdentity: SYNTHETIC_DIRECTORY_IDENTITY,
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(replies.slice(1), [{
    ipcVersion: 1,
    requestId: 2,
    type: 'FAILED',
    code: 'live_evidence_worker_failed',
  }]);
  assert.equal(startCalls, 0);
});

test('public preload is mandatory, single-use, and cannot enter ordinary WSS start', async t => {
  const publicStart = requestId => ({
    ipcVersion: 1,
    requestId,
    type: 'START_PUBLIC_WS_ONCE',
    config: config(),
    facilitatorRpcGeneration: SYNTHETIC_GENERATION,
    workspaceRoot: 'protected',
    journalDirectory: 'protected/journal',
    recovery: false,
    executionMode: PUBLIC_WS_ONCE_POLICY.executionMode,
    workspaceIdentity: SYNTHETIC_DIRECTORY_IDENTITY,
    runDirectoryIdentity: SYNTHETIC_DIRECTORY_IDENTITY,
  });
  const ordinaryStart = requestId => ({
    ipcVersion: 1,
    requestId,
    type: 'START',
    config: config(),
    facilitatorRpcGeneration: SYNTHETIC_GENERATION,
    workspaceRoot: 'protected',
    journalDirectory: 'protected/journal',
    recovery: false,
  });
  const cases = [
    ['missing preload', [publicStart(1)]],
    ['ordinary start after preload', [
      { ipcVersion: 1, requestId: 1, type: 'PRELOAD' },
      ordinaryStart(2),
    ]],
    ['duplicate preload', [
      { ipcVersion: 1, requestId: 1, type: 'PRELOAD' },
      { ipcVersion: 1, requestId: 2, type: 'PRELOAD' },
    ]],
  ];
  for (const [name, messages] of cases) {
    await t.test(name, async () => {
      const replies = [];
      let starts = 0;
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
        start: async () => { starts += 1; },
        shutdownTimeoutMs: 1000,
        forceExit: () => {},
      });
      for (const message of messages) {
        channel.emit('message', message);
        await new Promise(resolve => setImmediate(resolve));
      }
      assert.equal(starts, 0);
      assert.equal(replies.at(-1).type, 'FAILED');
      assert.equal(replies.at(-1).code, 'live_evidence_worker_failed');
    });
  }
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
    supervise: async command => {
      assert.equal(command, 'preflight-public-ws-once');
      return { status: 'preflight-valid' };
    },
  }), true);
  assert.deepEqual(stdout, ['LIVE_EVIDENCE_PUBLIC_WS_ONCE_PREFLIGHT_VALID\n']);
  assert.deepEqual(stderr, []);
  stdout.length = 0;
  assert.equal(await runPublicWsOnceRunnerCli({
    argv: ['run-public-ws-once', ...flags],
    stdout: value => { stdout.push(value); },
    stderr: value => { stderr.push(value); },
    supervise: async command => {
      assert.equal(command, 'run-public-ws-once');
      return { status: 'pending-independent-verification' };
    },
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

test('source freshness failure cannot escape the fixed CLI output contract', async () => {
  const stdout = [];
  const stderr = [];
  const ok = await runPublicWsOnceRunnerCli({
    argv: [
      'run-public-ws-once',
      '--config', 'config.json',
      '--buyer-rpc', 'buyer-rpc.json',
      '--buyer-wallet', 'buyer-wallet.json',
      '--facilitator-rpc', 'facilitator-rpc.json',
      '--authorization', 'authorization.json',
      '--workspace', 'workspace',
      '--run-name', 'single-public-ws-run',
      '--transport-exception', PUBLIC_WS_ONCE_POLICY.transportException,
    ],
    stdout: value => { stdout.push(value); },
    stderr: value => { stderr.push(value); },
    supervise: async () => {
      throw new Error('revision path identity environment endpoint hash secret');
    },
  });
  assert.equal(ok, false);
  assert.deepEqual(stdout, []);
  assert.deepEqual(stderr, ['LIVE_EVIDENCE_PUBLIC_WS_ONCE_FAILED\n']);
});

test('operator-facing supervisor modules do not import the runner or SDK', async () => {
  const sources = await Promise.all([
    readFile(fileURLToPath(
      new URL('../src/live-evidence-public-ws-once-cli.js', import.meta.url),
    ), 'utf8'),
    readFile(fileURLToPath(
      new URL('../src/live-evidence-public-ws-once-supervisor.js', import.meta.url),
    ), 'utf8'),
  ]);
  for (const source of sources) {
    assert.equal(source.includes('live-evidence-runner'), false);
    assert.equal(source.includes('znn-typescript-sdk'), false);
  }
});

test('supervised CLI suppresses child console and direct standard-stream output', async t => {
  const options = await fixture(t);
  const flags = [
    '--config', options.configPath,
    '--buyer-rpc', options.buyerRpcPath,
    '--buyer-wallet', options.buyerWalletPath,
    '--facilitator-rpc', options.facilitatorRpcPath,
    '--authorization', options.authorizationPath,
    '--workspace', options.workspaceRoot,
    '--run-name', options.runName,
    '--transport-exception', options.transportException,
  ];
  const stdout = [];
  const stderr = [];
  const childModule = fileURLToPath(
    new URL('./fixtures/public-ws-once-noisy-child.js', import.meta.url),
  );
  assert.equal(await runPublicWsOnceRunnerCli({
    argv: ['run-public-ws-once', ...flags],
    stdout: value => { stdout.push(value); },
    stderr: value => { stderr.push(value); },
    supervisorInjections: { childModule, forkProcess, timeoutMs: 5000 },
  }), true);
  assert.deepEqual(stdout, [
    'LIVE_EVIDENCE_PUBLIC_WS_ONCE_PENDING_INDEPENDENT_VERIFICATION\n',
  ]);
  assert.deepEqual(stderr, []);
});

test('supervisor uses the fixed spawn and bounded bootstrap/control contracts', async t => {
  const options = await fixture(t);
  const childModule = fileURLToPath(
    new URL('./fixtures/public-ws-once-noisy-child.js', import.meta.url),
  );
  const bootstrapChunks = [];
  let invocation;
  const requests = [];
  let originReleaseCalls = 0;
  const child = new EventEmitter();
  child.connected = true;
  child.stdio = [null, null, null, null, new PassThrough()];
  child.stdio[4].on('data', chunk => bootstrapChunks.push(Buffer.from(chunk)));
  child.stdio[4].once('finish', () => {
    setImmediate(() => child.emit('message', {
      ipcVersion: 1,
      requestId: 1,
      type: 'READY',
    }));
  });
  child.send = (message, callback) => {
    requests.push(structuredClone(message));
    callback?.();
    setImmediate(() => {
      if (message.type === 'RUN') {
        child.emit('message', { ipcVersion: 1, requestId: 2, type: 'ORIGIN_RELEASE' });
      } else if (message.type === 'ORIGIN_RELEASED') {
        child.emit('message', { ipcVersion: 1, requestId: 1, type: 'PENDING' });
        child.connected = false;
        child.emit('exit', 0, null);
        child.emit('close', 0, null);
      }
    });
    return true;
  };
  child.kill = () => true;
  const result = await supervisePublicWsOnceChild('run-public-ws-once', options, {
    childModule,
    beforeOriginBind: async () => {
      originReleaseCalls += 1;
      return true;
    },
    timeoutMs: 1000,
    forkProcess: (modulePath, args, forkOptions) => {
      invocation = { modulePath, args, forkOptions };
      return child;
    },
  });
  assert.deepEqual(result, { status: 'pending-independent-verification' });
  assert.equal(invocation.modulePath, childModule);
  assert.deepEqual(invocation.args, []);
  assert.equal(invocation.forkOptions.cwd, options.workspaceRoot);
  assert.deepEqual(invocation.forkOptions.stdio, ['ignore', 'ignore', 'ignore', 'ipc', 'pipe']);
  assert.deepEqual(invocation.forkOptions.env, {});
  assert.deepEqual(invocation.forkOptions.execArgv, []);
  assert.deepEqual(JSON.parse(Buffer.concat(bootstrapChunks).toString('utf8')), options);
  assert.equal(originReleaseCalls, 1);
  assert.deepEqual(requests, [
    { ipcVersion: 1, requestId: 1, type: 'RUN' },
    { ipcVersion: 1, requestId: 2, type: 'ORIGIN_RELEASED' },
  ]);
});

function syntheticSupervisorChild(mode) {
  const child = new EventEmitter();
  child.connected = true;
  child.stdio = [null, null, null, null, new PassThrough()];
  let closed = false;
  const close = (code, signal = null) => {
    if (closed) return;
    closed = true;
    child.connected = false;
    child.emit('exit', code, signal);
    child.emit('close', code, signal);
  };
  child.send = (message, callback) => {
    callback?.();
    setImmediate(() => {
      if (message.type === 'RUN') {
        child.emit('message', { ipcVersion: 1, requestId: 2, type: 'ORIGIN_RELEASE' });
        return;
      }
      if (message.type !== 'ORIGIN_RELEASED') return;
      if (mode === 'malformed') {
        child.emit('message', {
          ipcVersion: 1,
          requestId: 1,
          type: 'PENDING',
          unexpected: true,
        });
        return;
      }
      if (mode === 'stale-request') {
        child.emit('message', { ipcVersion: 1, requestId: 2, type: 'PENDING' });
        return;
      }
      if (mode === 'disconnect') {
        child.connected = false;
        child.emit('disconnect');
        return;
      }
      child.emit('message', { ipcVersion: 1, requestId: 1, type: 'PENDING' });
      if (mode === 'duplicate') {
        child.emit('message', { ipcVersion: 1, requestId: 1, type: 'PENDING' });
        close(0);
      } else if (mode === 'nonzero') {
        close(1);
      } else if (mode === 'signal') {
        close(null, 'SIGTERM');
      }
    });
    return true;
  };
  child.kill = () => {
    close(null, 'SIGTERM');
    return true;
  };
  child.stdio[4].once('finish', () => {
    setImmediate(() => child.emit('message', {
      ipcVersion: 1,
      requestId: 1,
      type: 'READY',
    }));
  });
  return child;
}

test('supervisor rejects malformed, duplicate, stale, disconnected, and unclean children', async t => {
  const options = await fixture(t);
  for (const mode of [
    'duplicate', 'malformed', 'stale-request', 'disconnect', 'nonzero', 'signal',
  ]) {
    await assert.rejects(supervisePublicWsOnceChild(
      'run-public-ws-once',
      options,
      {
        forkProcess: () => syntheticSupervisorChild(mode),
        childModule: fileURLToPath(
          new URL('./fixtures/public-ws-once-noisy-child.js', import.meta.url),
        ),
        timeoutMs: 1000,
      },
    ));
  }
});

test('CLI maps supervised child failure to one fixed line', async t => {
  const options = await fixture(t);
  const flags = [
    '--config', options.configPath,
    '--buyer-rpc', options.buyerRpcPath,
    '--buyer-wallet', options.buyerWalletPath,
    '--facilitator-rpc', options.facilitatorRpcPath,
    '--authorization', options.authorizationPath,
    '--workspace', options.workspaceRoot,
    '--run-name', options.runName,
    '--transport-exception', options.transportException,
  ];
  const stdout = [];
  const stderr = [];
  assert.equal(await runPublicWsOnceRunnerCli({
    argv: ['run-public-ws-once', ...flags],
    stdout: value => { stdout.push(value); },
    stderr: value => { stderr.push(value); },
    supervisorInjections: {
      forkProcess: () => syntheticSupervisorChild('malformed'),
      childModule: fileURLToPath(
        new URL('./fixtures/public-ws-once-noisy-child.js', import.meta.url),
      ),
      timeoutMs: 1000,
    },
  }), false);
  assert.deepEqual(stdout, []);
  assert.deepEqual(stderr, ['LIVE_EVIDENCE_PUBLIC_WS_ONCE_FAILED\n']);
});

test('execution child terminates fail closed when its supervisor disconnects', async t => {
  const options = await fixture(t);
  const channel = new EventEmitter();
  channel.connected = true;
  const sent = [];
  channel.send = (message, callback) => {
    sent.push(message);
    callback?.();
    return true;
  };
  let exitCode;
  await runPublicWsOnceExecutionChild({
    channel,
    readBootstrap: async () => options,
    preflight: async () => ({ valid: true }),
    execute: async () => new Promise(() => {}),
    forceExit: code => { exitCode = code; },
  });
  assert.deepEqual(sent, [{ ipcVersion: 1, requestId: 1, type: 'READY' }]);
  channel.emit('message', { ipcVersion: 1, requestId: 1, type: 'RUN' });
  await new Promise(resolve => setImmediate(resolve));
  channel.connected = false;
  channel.emit('disconnect');
  assert.equal(exitCode, 1);
});

test('execution child rejects malformed, stale, extra, and concurrent control IPC', async t => {
  const options = await fixture(t);
  const invalidMessages = [
    { ipcVersion: 1, requestId: 1, type: 'UNKNOWN' },
    { ipcVersion: 1, requestId: 2, type: 'RUN' },
    { ipcVersion: 1, requestId: 1, type: 'RUN', unexpected: true },
  ];
  for (const message of invalidMessages) {
    const channel = new EventEmitter();
    channel.connected = true;
    channel.send = (_value, callback) => {
      callback?.();
      return true;
    };
    let calls = 0;
    let exitCode;
    await runPublicWsOnceExecutionChild({
      channel,
      readBootstrap: async () => options,
      preflight: async () => { calls += 1; },
      execute: async () => { calls += 1; },
      forceExit: code => { exitCode = code; },
    });
    channel.emit('message', message);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 0);
    assert.equal(exitCode, 1);
  }

  const channel = new EventEmitter();
  channel.connected = true;
  const sent = [];
  channel.send = (message, callback) => {
    sent.push(structuredClone(message));
    callback?.();
    return true;
  };
  let calls = 0;
  let exitCode;
  await runPublicWsOnceExecutionChild({
    channel,
    readBootstrap: async () => options,
    preflight: async () => ({ valid: true }),
    execute: async () => {
      calls += 1;
      channel.emit('message', { ipcVersion: 1, requestId: 1, type: 'RUN' });
      return { status: 'pending-independent-verification', evidenceEligible: false };
    },
    forceExit: code => { exitCode = code; },
  });
  channel.emit('message', { ipcVersion: 1, requestId: 1, type: 'RUN' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.equal(exitCode, 1);
  assert.deepEqual(sent, [{ ipcVersion: 1, requestId: 1, type: 'READY' }]);
});

function currentTestnetWssConfig(changes = {}) {
  return {
    ...config(),
    runnerVersion: 3,
    executionMode: CURRENT_TESTNET_WSS_ONCE_POLICY.executionMode,
    rpcEndpoint: GATE_B_CURRENT_TESTNET_WSS_ENDPOINT,
    ...changes,
  };
}

function currentTestnetWssAuthorization(configuration, changes = {}) {
  return {
    authorizationVersion: 3,
    executionMode: CURRENT_TESTNET_WSS_ONCE_POLICY.executionMode,
    runName: 'single-current-testnet-wss-run',
    sourceRevision: configuration.sourceRevision,
    profileName: configuration.profileName,
    configDigest: currentTestnetWssOnceConfigDigest(configuration),
    paymentIntentDigest: paymentIntentDigest(
      configuration.expectedPaymentRequired,
      configuration.expectedPaymentRequired.accepts[0],
    ),
    rpcEndpoint: GATE_B_CURRENT_TESTNET_WSS_ENDPOINT,
    quickTunnel: configuration.quickTunnel,
    acknowledgements: {
      payment: CURRENT_TESTNET_WSS_ONCE_POLICY.paymentAcknowledgement,
      publication: CURRENT_TESTNET_WSS_ONCE_POLICY.publicationAcknowledgement,
    },
    ...changes,
  };
}

test('current-testnet WSS parsers are exact, version-disjoint, and digest-bound', () => {
  const configuration = currentTestnetWssConfig();
  const encodedConfig = `${JSON.stringify(configuration)}\n`;
  assert.deepEqual(parseCurrentTestnetWssOnceRunConfig(encodedConfig), configuration);
  assert.throws(() => parsePublicWsOnceRunConfig(encodedConfig));
  assert.throws(() => parseCurrentTestnetWssOnceRunConfig(`${JSON.stringify(config())}\n`));

  const wssRpc = `${JSON.stringify({
    secretVersion: 3,
    rpcEndpoint: GATE_B_CURRENT_TESTNET_WSS_ENDPOINT,
  })}\n`;
  assert.equal(parseCurrentTestnetWssOnceRoleInput(wssRpc, 'buyer-rpc').secretVersion, 3);
  assert.throws(() => parsePublicWsOnceRoleInput(wssRpc, 'buyer-rpc'));
  assert.throws(() => parseLiveRoleInput(wssRpc, 'buyer-rpc'));
  assert.throws(() => parseCurrentTestnetWssOnceRoleInput(`${JSON.stringify({
    secretVersion: 2,
    rpcEndpoint: ENDPOINT,
  })}\n`, 'buyer-rpc'));

  for (const rpcEndpoint of [
    'wss://rpc.testnet.zenon.info',
    'ws://rpc.testnet.zenon.info/',
    'https://rpc.testnet.zenon.info/',
    'wss://rpc.testnet.zenon.info:443/',
    'wss://user:pass@rpc.testnet.zenon.info/',
    'wss://rpc.testnet.zenon.info/path',
    'wss://rpc.testnet.zenon.info/?q=1',
    'wss://rpc.testnet.zenon.info/#f',
    'wss://rpc%2etestnet.zenon.info/',
    'wss://RPC.testnet.zenon.info/',
  ]) assert.throws(() => parseCurrentTestnetWssOnceRoleInput(`${JSON.stringify({
    secretVersion: 3,
    rpcEndpoint,
  })}\n`, 'buyer-rpc'));

  const authorizationValue = currentTestnetWssAuthorization(configuration);
  assert.deepEqual(parseCurrentTestnetWssOnceAuthorization(
    `${JSON.stringify(authorizationValue)}\n`,
  ), authorizationValue);
  assert.throws(() => parsePublicWsOnceAuthorization(
    `${JSON.stringify(authorizationValue)}\n`,
  ));
  assert.throws(() => parseCurrentTestnetWssOnceAuthorization(
    `${JSON.stringify(authorization(config()))}\n`,
  ));
  assert.equal(Object.hasOwn(authorizationValue, 'transportException'), false);

  const baseline = currentTestnetWssOnceConfigDigest(configuration);
  for (const mutation of [
    value => { value.sourceRevision = 'c'.repeat(40); },
    value => { value.runtime.rpcTimeoutMs += 1; },
    value => { value.expectedPaymentRequired.accepts[0].amount = '2'; },
  ]) {
    const changed = structuredClone(configuration);
    mutation(changed);
    assert.notEqual(currentTestnetWssOnceConfigDigest(changed), baseline);
  }
  const invalidTunnel = structuredClone(configuration);
  invalidTunnel.quickTunnel.hostnamePersistence.storage = 'other';
  assert.throws(() => currentTestnetWssOnceConfigDigest(invalidTunnel));
  assert.notEqual(baseline, sha256Hex(
    `zenon-x402-public-ws-once-config-v2\n${canonicalJson(configuration)}`,
  ));
});

test('current-testnet WSS execution preserves the one-shot and truthful-evidence boundaries',
  async t => {
    const options = await fixture(t, {
      currentTestnetWss: true,
      walletText: '{"secretVersion":1,"mnemonic":"offline-placeholder-only","accountIndex":0}\n',
    });
    const configuration = fixtureConfiguration(options);
    const candidate = await validOutcome(configuration);
    const events = [];
    let journal;
    const controller = {
      async preload() { events.push('preload'); },
      async start() { events.push('facilitator-start'); },
      async snapshotObservations() {
        return { evidenceEligible: true, events: observations('facilitator') };
      },
      async closeAndSnapshot() {
        const snapshot = await journal.load();
        return { quiescent: true, ...snapshot };
      },
      async terminate() { events.push('terminate'); },
    };
    const injected = {
      sourceTreeAttestor: async () => true,
      lifecycleObserver: fixedObserver(),
      operations: {
        async probeBuyerReadiness() { events.push('buyer-ready'); },
        async startFacilitator({ recovery }) {
          assert.equal(recovery, false);
          journal = await createRetainedProductionState(
            join(options.workspaceRoot, options.runName),
            candidate.record,
          );
          events.push('facilitator-create');
          return controller;
        },
        async probePublicEndpoint() { events.push('public-ready'); },
        async readBuyerWallet() {
          events.push('wallet-read');
          return { mnemonic: 'offline-placeholder-only', accountIndex: 0 };
        },
        async paidFetch({ openWallet, onChallenge }) {
          await onChallenge(configuration.expectedPaymentRequired);
          events.push('challenge');
          await openWallet();
          events.push('payment');
          return candidate.outcome;
        },
      },
    };
    assert.deepEqual(await executeCurrentTestnetWssOnceRun(options, injected), {
      status: 'pending-independent-verification',
      evidenceEligible: false,
    });
    assert.equal(events.indexOf('public-ready') < events.indexOf('challenge'), true);
    assert.equal(events.indexOf('challenge') < events.indexOf('wallet-read'), true);
    assert.equal(events.indexOf('wallet-read') < events.indexOf('payment'), true);
    assert.equal((await lstat(join(
      options.workspaceRoot,
      'PUBLIC_WS_ONCE_CONSUMED',
    ))).isFile(), true);

    const metadataText = await readFile(join(
      options.workspaceRoot,
      options.runName,
      'pending-independent-verification',
      'metadata.json',
    ), 'utf8');
    const metadata = JSON.parse(metadataText);
    assert.equal(metadata.candidateVersion, 2);
    assert.equal(metadata.publicationEligible, false);
    assert.deepEqual(metadata.transport, {
      scheme: 'wss',
      confidentialityInTransit: true,
      tlsServerNameAuthenticated: true,
      chainIdentityAuthenticated: false,
      operatorTrustRequired: true,
      endpointDisclosed: false,
    });
    assert.equal(Object.values(metadata.nonClaims).every(value => value === false), true);
    assert.equal(metadataText.includes(GATE_B_CURRENT_TESTNET_WSS_ENDPOINT), false);
    assert.equal(metadataText.includes('authenticated chain'), false);

    const effectCount = events.length;
    await assert.rejects(
      executeCurrentTestnetWssOnceRun(options, injected),
      fixedFailure,
    );
    assert.equal(events.length, effectCount);
    await assert.rejects(executePublicWsOnceRun(options, injected), fixedFailure);
    assert.equal(events.length, effectCount);
  });

test('current-testnet WSS worker uses a distinct start message and rejects mode confusion',
  async () => {
    const sent = [];
    const child = new EventEmitter();
    child.connected = true;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.send = (message, callback) => {
      sent.push(structuredClone(message));
      callback?.();
      setImmediate(() => {
        if (message.type === 'PRELOAD') {
          child.emit('message', {
            ipcVersion: 1,
            requestId: message.requestId,
            type: 'PRELOADED',
          });
        } else if (message.type === 'START_CURRENT_TESTNET_WSS_ONCE') {
          child.emit('message', {
            ipcVersion: 1,
            requestId: message.requestId,
            type: 'READY',
          });
        } else if (message.type === 'STOP') {
          child.emit('message', {
            ipcVersion: 1,
            requestId: message.requestId,
            type: 'STOPPED',
            snapshot: null,
          });
          child.connected = false;
          child.emit('disconnect');
          child.emit('exit', 0, null);
          child.emit('close', 0, null);
        }
      });
      return true;
    };
    child.disconnect = () => { child.connected = false; };
    child.kill = () => true;
    const controller = await startLiveEvidenceFacilitatorWorker({
      config: currentTestnetWssConfig(),
      facilitatorRpcFd: 0,
      facilitatorRpcGeneration: SYNTHETIC_GENERATION,
      workspaceRoot: 'protected',
      journalDirectory: 'protected/journal',
      recovery: false,
      executionMode: CURRENT_TESTNET_WSS_ONCE_POLICY.executionMode,
      workspaceIdentity: SYNTHETIC_DIRECTORY_IDENTITY,
      runDirectoryIdentity: SYNTHETIC_DIRECTORY_IDENTITY,
      forkProcess: () => child,
    });
    await controller.preload();
    await controller.start();
    assert.equal(sent[1].type, 'START_CURRENT_TESTNET_WSS_ONCE');
    assert.equal(sent[1].executionMode, CURRENT_TESTNET_WSS_ONCE_POLICY.executionMode);
    assert.equal(sent[1].recovery, false);
    assert.equal(Object.hasOwn(sent[1], 'transportException'), false);
    await controller.exit();

    const replies = [];
    const channel = new EventEmitter();
    channel.connected = true;
    channel.send = (message, callback) => {
      replies.push(structuredClone(message));
      callback?.();
      return true;
    };
    channel.disconnect = () => { channel.connected = false; };
    let starts = 0;
    await runLiveEvidenceFacilitatorWorker({
      channel,
      start: async () => { starts += 1; },
      shutdownTimeoutMs: 1000,
      forceExit: () => {},
    });
    channel.emit('message', { ipcVersion: 1, requestId: 1, type: 'PRELOAD' });
    await new Promise(resolve => setImmediate(resolve));
    channel.emit('message', {
      ipcVersion: 1,
      requestId: 2,
      type: 'START_CURRENT_TESTNET_WSS_ONCE',
      config: currentTestnetWssConfig(),
      facilitatorRpcGeneration: SYNTHETIC_GENERATION,
      workspaceRoot: 'protected',
      journalDirectory: 'protected/journal',
      recovery: false,
      executionMode: PUBLIC_WS_ONCE_POLICY.executionMode,
      workspaceIdentity: SYNTHETIC_DIRECTORY_IDENTITY,
      runDirectoryIdentity: SYNTHETIC_DIRECTORY_IDENTITY,
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(starts, 0);
    assert.equal(replies.at(-1).type, 'FAILED');
  });

test('supervisor preserves the closed WSS bootstrap without command or IPC expansion',
  async t => {
    const options = await fixture(t, { currentTestnetWss: true });
    const bootstrapChunks = [];
    const requests = [];
    const child = new EventEmitter();
    child.connected = true;
    child.stdio = [null, null, null, null, new PassThrough()];
    child.stdio[4].on('data', chunk => bootstrapChunks.push(Buffer.from(chunk)));
    child.stdio[4].once('finish', () => {
      setImmediate(() => child.emit('message', {
        ipcVersion: 1,
        requestId: 1,
        type: 'READY',
      }));
    });
    child.send = (message, callback) => {
      requests.push(structuredClone(message));
      callback?.();
      if (message.type === 'PREFLIGHT') setImmediate(() => {
        child.emit('message', {
          ipcVersion: 1,
          requestId: 1,
          type: 'PREFLIGHT_VALID',
        });
        child.connected = false;
        child.emit('exit', 0, null);
        child.emit('close', 0, null);
      });
      return true;
    };
    child.kill = () => true;
    const result = await supervisePublicWsOnceChild(
      'preflight-public-ws-once',
      options,
      {
        childModule: fileURLToPath(
          new URL('./fixtures/public-ws-once-noisy-child.js', import.meta.url),
        ),
        forkProcess: () => child,
        timeoutMs: 1000,
      },
    );
    assert.deepEqual(result, { status: 'preflight-valid' });
    assert.deepEqual(JSON.parse(Buffer.concat(bootstrapChunks).toString('utf8')), options);
    assert.deepEqual(requests, [{ ipcVersion: 1, requestId: 1, type: 'PREFLIGHT' }]);
    await assert.rejects(supervisePublicWsOnceChild(
      'preflight-public-ws-once',
      { ...options, transportException: PUBLIC_WS_ONCE_POLICY.transportException },
      { forkProcess: () => { assert.fail('must reject before fork'); } },
    ));

    let proxyReads = 0;
    const hostileProxy = new Proxy({}, {
      getOwnPropertyDescriptor() {
        proxyReads += 1;
        throw new Error('must not inspect hostile options');
      },
    });
    await assert.rejects(supervisePublicWsOnceChild(
      'preflight-public-ws-once',
      hostileProxy,
      { forkProcess: () => { assert.fail('must reject before fork'); } },
    ));
    assert.equal(proxyReads, 0);

    let accessorReads = 0;
    const hostileAccessor = { ...options };
    Object.defineProperty(hostileAccessor, 'executionMode', {
      enumerable: true,
      get() {
        accessorReads += 1;
        return CURRENT_TESTNET_WSS_ONCE_POLICY.executionMode;
      },
    });
    await assert.rejects(supervisePublicWsOnceChild(
      'preflight-public-ws-once',
      hostileAccessor,
      { forkProcess: () => { assert.fail('must reject before fork'); } },
    ));
    assert.equal(accessorReads, 0);
  });

test('documentation and the operator-trusted record preserve the quarantined live boundary without weakening evidence v1',
  async () => {
    const [readme, security, plan, operatorRecordText] = await Promise.all([
      readFile(new URL('../README.md', import.meta.url), 'utf8'),
      readFile(new URL('../SECURITY.md', import.meta.url), 'utf8'),
      readFile(new URL('../docs/IMPLEMENTATION_PLAN.md', import.meta.url), 'utf8'),
      readFile(new URL(
        '../docs/evidence/gate-b-operator-trusted-observation-2026-09-04.json',
        import.meta.url,
      ), 'utf8'),
    ]);
    const heading = 'Observed Gate-B run boundary (2026-09-04)';
    const slice = (document, endMarker) => {
      const start = document.indexOf(heading);
      const end = document.indexOf(endMarker, start);
      assert.notEqual(start, -1);
      assert.notEqual(end, -1);
      assert.equal(end > start, true);
      return document.slice(start, end);
    };
    const observedSections = [
      slice(readme, '\nThe older `preflight-public-ws-once`'),
      slice(security, '\nThe optional macOS local buyer-wallet helper'),
      slice(plan, '\nThe older plaintext transport exception'),
    ];
    for (const section of observedSections) {
      assert.match(section, /Issue #45 remains open/);
      assert.match(section, /quarantin/i);
      assert.doesNotMatch(
        section,
        /(?:\/Users\/|\/home\/|[A-Za-z]:\\\\|BEGIN PRIVATE KEY|mnemonic|seed phrase|private key|wallet secret|RPC credential|access token)/iu,
      );
    }

    const combinedObserved = observedSections.join('\n');
    assert.doesNotMatch(
      readme,
      /Publication remains a separate manual gate\.|No evidence is uploaded or made public\./,
    );
    assert.doesNotMatch(
      security,
      /Until that gate passes, no artifact may be published/,
    );
    assert.match(
      readme,
      /Publication of the five retained private fragments or any evidence-version-1 bundle remains a separate manual gate\./,
    );
    assert.match(
      readme,
      /The exceptional runner itself uploads or publishes nothing/,
    );
    assert.match(
      security,
      /neither those private fragments nor an evidence-version-1 bundle may be published/,
    );
    for (const document of [readme, security]) {
      assert.match(document, /operator-trusted same-route projection/);
      assert.match(document, /human-reviewed/);
      assert.match(document, /not evidence version 1 and (?:is )?not independently verified/);
    }
    for (const invariant of [
      /x402 v2 `exact` upfront payment/,
      /one atomic unit of ZNN/,
      /Chain 73404/,
      /`fusedPlasma` 0/,
      /difficulty 34,764,000/,
      /24,375 ms/,
      /schema 1|schema-1/,
      /revision 5/,
      /`MOMENTUM_INCLUDED` \/ `DELIVERED`/,
      /exact six-field protected response body|exact six-field response body/,
      /account-height advance/,
      /one-atomic-unit debit/,
      /exact signed-block identity and payment-intent\/resource bindings/,
      /later Momentum/,
      /freshly generated, dedicated, disposable testnet wallet/i,
      /publish-RPC acknowledgement interval (?:was|of) 238 ms/i,
      /uninterrupted, non-recovery inner runner path/i,
      /post-run read-only comparison/i,
      /not protocol reconciliation/i,
      /no retry, resubmission, or replacement-payment authority/i,
      /non-recovery inner runner reached[\s\S]*outer (?:operator )?front end/i,
      /`PENDING_INDEPENDENT_VERIFICATION`/,
      /`GATE_B_CONTROLLER_FAILED_WORKSPACE_QUARANTINED`/,
      /human-approved different-operator-route observation/,
      /accepted strict independent-review assertion record/,
      /separate publication authorization/,
      /cleanup-quarantine addendum kept outside the version-1 JSON bundle/,
      /protocol finality/,
      /authenticated chain identity/,
      /recipient receive or spendability/,
      /facilitator authorship/,
      /independent(?:ly attested)? HTTP (?:attestation|exchange)/,
      /clean shutdown is not claimed|No .* clean shutdown is claimed/,
      /evidence-version-1 bundle publication/i,
      /operator-trusted (?:same-route observation )?record/i,
      /explicitly not evidence version 1/i,
      /human disclosure review and merge/i,
      /bounded operator-trusted Path-B acceptance|bounded Path-B acceptance criteria/i,
      /publication hold (?:is not retroactively reinterpreted|remains binding)/i,
    ]) {
      assert.match(combinedObserved, invariant);
    }
    assert.doesNotMatch(
      plan,
      /\| Public-testnet Gate B \| `WS_ONCE_OFFLINE_TESTED` \| `NOT_EXECUTED` \| `ISSUE_45_OPEN` \|/,
    );
    assert.match(
      plan,
      /\| Public-testnet Gate B \| `WS_ONCE_OFFLINE_TESTED` \| `LIVE_CAPTURE_RETAINED` \| `PENDING_INDEPENDENT_REVIEW_WORKSPACE_QUARANTINED` \|/,
    );

    const verificationStart = readme.indexOf('#### How to verify the x402 binding');
    const verificationEnd = readme.indexOf('\n### Experimental chain profile', verificationStart);
    assert.notEqual(verificationStart, -1);
    assert.notEqual(verificationEnd, -1);
    assert.equal(verificationEnd > verificationStart, true);
    const verification = readme.slice(verificationStart, verificationEnd);
    for (const invariant of [
      /ordinary included `UserSend` account block/,
      /This PoC's x402-intent commitment/,
      /exact 32-byte value in `accountBlock\.data`/,
      /paymentIntentDigest\(paymentRequired, accepted\)/,
      /SHA-256\(UTF-8\(canonicalJson/,
      /sorts object keys recursively while preserving array order/,
      /SDK and RPC JSON representations encode those bytes as canonical Base64/,
      /Explorer rendering may vary or omit the field/,
      /paymentRequired\.accepts\[selectedIndex\]/,
      /Reproducing this byte comparison requires a public manifest/,
      /exact `paymentRequired` object and its exact `selectedIndex`/,
      /Do not apply semantic defaults or value normalization/,
      /`paymentRequired\.accepts` to contain exactly one offer and `selectedIndex` to equal 0/,
      /proves only data\/preimage byte equality/,
      /does not validate the account-block signature/,
      /version-1 live-evidence verifier/,
      /records and orders declared initial 402 and final 200 observations/,
      /`http\.initial` contains only the status and observation time/,
      /cannot prove that the observed 402 carried the exact `paymentRequired` object/,
      /exact six-field protected response body/,
      /does not independently establish|Neither[\s\S]*independently establishes/,
    ]) {
      assert.match(verification, invariant);
    }
    assert.doesNotMatch(
      verification,
      /(?:\/Users\/|\/home\/|[A-Za-z]:\\\\|BEGIN PRIVATE KEY|mnemonic|seed phrase|private key|wallet secret|RPC credential|access token)/iu,
    );

    const operatorRecord = JSON.parse(operatorRecordText);
    assert.deepEqual(Object.keys(operatorRecord), [
      'recordVersion', 'recordType', 'evidenceV1Bundle', 'issue',
      'publicationClassification', 'retainedFragmentProjections', 'nonClaims',
    ]);
    assert.equal(operatorRecord.recordVersion, 1);
    assert.equal(operatorRecord.recordType, 'operator-trusted-same-route-live-observation');
    assert.equal(operatorRecord.evidenceV1Bundle, false);
    assert.equal(operatorRecord.issue, 'edgepillar/zenon-x402-poc#45');
    assert.equal(Object.hasOwn(operatorRecord, 'evidenceVersion'), false);
    assert.equal(Object.hasOwn(operatorRecord, 'integrity'), false);

    assert.deepEqual(operatorRecord.publicationClassification, {
      trustModel: 'operator-trusted',
      routeRelationship: 'same-route',
      independentOperatorVerification: false,
    });

    const projections = operatorRecord.retainedFragmentProjections;
    assert.deepEqual(Object.keys(projections), [
      'manifest', 'chain', 'http', 'journal', 'timing',
    ]);
    for (const type of Object.keys(projections)) {
      assert.equal(projections[type].fragmentVersion, 1);
      assert.equal(projections[type].fragmentType, type);
    }

    const manifest = projections.manifest;
    assert.deepEqual(Object.keys(manifest), ['fragmentVersion', 'fragmentType', 'payment']);
    assert.deepEqual(Object.keys(manifest.payment), [
      'paymentRequired', 'selectedIndex', 'intentDigest',
    ]);
    const { paymentRequired, selectedIndex } = manifest.payment;
    assert.equal(paymentRequired.x402Version, 2);
    assert.equal(paymentRequired.accepts.length, 1);
    assert.equal(selectedIndex, 0);
    const accepted = paymentRequired.accepts[selectedIndex];
    assert.equal(accepted.scheme, 'exact');
    assert.equal(accepted.extra.paymentFlow, 'upfront');
    assert.equal(accepted.amount, '1');

    const chainProjection = projections.chain;
    assert.deepEqual(Object.keys(chainProjection), ['fragmentVersion', 'fragmentType', 'chain']);
    assert.deepEqual(Object.keys(chainProjection.chain), ['accountBlock', 'confirmation']);
    const accountBlockKeys = [
      'version', 'chainIdentifier', 'blockType', 'hash', 'height',
      'momentumAcknowledged', 'address', 'toAddress', 'amount', 'tokenStandard',
      'data', 'fusedPlasma', 'difficulty',
    ];
    const accountBlock = chainProjection.chain.accountBlock;
    assert.deepEqual(Object.keys(accountBlock), accountBlockKeys);
    assert.deepEqual(Object.keys(accountBlock.momentumAcknowledged), ['height']);
    assert.deepEqual(Object.keys(chainProjection.chain.confirmation), [
      'observedAt', 'numConfirmations', 'momentumHeight', 'momentumTimestamp',
    ]);

    const httpProjection = projections.http;
    assert.deepEqual(Object.keys(httpProjection), ['fragmentVersion', 'fragmentType', 'http']);
    const http = httpProjection.http;
    assert.deepEqual(Object.keys(http), ['initial', 'final']);
    assert.deepEqual(Object.keys(http.initial), ['status', 'observedAt']);
    assert.deepEqual(Object.keys(http.final), [
      'status', 'observedAt', 'paymentResponse', 'contentType', 'cacheControl',
      'vary', 'bodyText',
    ]);
    assert.equal(http.initial.status, 402);
    assert.equal(http.final.status, 200);
    const responseBody = JSON.parse(http.final.bodyText);
    assert.deepEqual(Object.keys(responseBody), [
      'ok', 'message', 'network', 'payer', 'transaction', 'generatedAt',
    ]);

    const journalProjection = projections.journal;
    assert.deepEqual(Object.keys(journalProjection), [
      'fragmentVersion', 'fragmentType', 'journal',
    ]);
    const journal = journalProjection.journal;
    assert.deepEqual(Object.keys(journal), [
      'sourceSchemaVersion', 'sourceRevision', 'activeRecordCount',
      'tombstoneCount', 'record',
    ]);
    assert.deepEqual(Object.keys(journal.record), [
      'transactionHash', 'chainProfile', 'intentDigest', 'resourceIdentity',
      'resourceDigest', 'payer', 'signedAccountBlock', 'evidenceState',
      'momentumEvidence', 'deliveryState', 'cachedResponse', 'createdAt', 'updatedAt',
    ]);
    assert.deepEqual(Object.keys(journal.record.signedAccountBlock), accountBlockKeys);

    const timingProjection = projections.timing;
    assert.deepEqual(Object.keys(timingProjection), [
      'fragmentVersion', 'fragmentType', 'timing',
    ]);
    assert.deepEqual(Object.keys(timingProjection.timing), ['events', 'durationsMs']);

    const expectedIntent = paymentIntentDigest(paymentRequired, accepted);
    assert.equal(manifest.payment.intentDigest, expectedIntent);
    assert.equal(journal.record.intentDigest, expectedIntent);
    assert.equal(/^[0-9a-f]{64}$/.test(accountBlock.hash), true);
    assert.equal(Buffer.from(accountBlock.data, 'base64').length, 32);
    assert.equal(Buffer.from(accountBlock.data, 'base64').toString('base64'), accountBlock.data);
    assert.equal(Buffer.from(accountBlock.data, 'base64').toString('hex'), expectedIntent);
    assert.equal(sha256Hex(paymentRequired.resource), journal.record.resourceDigest);
    assert.equal(canonicalJson(paymentRequired.resource), canonicalJson(journal.record.resourceIdentity));

    assert.deepEqual(journal.record.signedAccountBlock, accountBlock);
    assert.equal(http.final.paymentResponse.transaction, accountBlock.hash);
    assert.equal(responseBody.transaction, accountBlock.hash);
    assert.equal(journal.record.transactionHash, accountBlock.hash);
    assert.equal(accepted.amount, accountBlock.amount);
    assert.equal(accepted.asset, accountBlock.tokenStandard);
    assert.equal(accepted.payTo, accountBlock.toAddress);
    assert.equal(http.final.paymentResponse.payer, accountBlock.address);
    assert.equal(responseBody.payer, accountBlock.address);
    assert.equal(journal.record.payer, accountBlock.address);
    assert.equal(http.final.paymentResponse.network, accepted.network);
    assert.equal(responseBody.network, accepted.network);
    assert.equal(String(accountBlock.chainIdentifier), accepted.extra.zenonChain.chainIdentifier);
    assert.equal(journal.record.chainProfile.chainIdentifier,
      accepted.extra.zenonChain.chainIdentifier);
    assert.equal(journal.record.chainProfile.genesisMomentumHash,
      accepted.extra.zenonChain.genesisMomentumHash);

    const confirmation = chainProjection.chain.confirmation;
    const journalConfirmation = journal.record.momentumEvidence.confirmationDetail;
    assert.equal(journal.record.momentumEvidence.observedAt, confirmation.observedAt);
    assert.equal(journalConfirmation.numConfirmations, confirmation.numConfirmations);
    assert.equal(journalConfirmation.momentumHeight, confirmation.momentumHeight);
    assert.equal(journalConfirmation.momentumTimestamp, confirmation.momentumTimestamp);
    assert.equal(http.final.paymentResponse.success, true);
    assert.equal(http.final.paymentResponse.state, journal.record.evidenceState);
    assert.equal(journal.record.evidenceState, 'MOMENTUM_INCLUDED');
    assert.equal(journal.record.deliveryState, 'DELIVERED');
    assert.equal(journal.activeRecordCount, 1);
    assert.equal(journal.tombstoneCount, 0);
    assert.equal(journal.record.cachedResponse.status, http.final.status);
    assert.equal(journal.record.cachedResponse.headers['content-type'], http.final.contentType);
    assert.equal(canonicalJson(journal.record.cachedResponse.body), canonicalJson(responseBody));

    const events = timingProjection.timing.events;
    const expectedPhases = [
      'challenge_request_started', 'challenge_402_received',
      'buyer_owner_wait_started', 'buyer_owner_acquired', 'buyer_readiness_started',
      'buyer_readiness_finished', 'prepare_block_started', 'prepare_block_finished',
      'buyer_owner_released', 'facilitator_owner_wait_started',
      'facilitator_owner_acquired', 'facilitator_readiness_started',
      'facilitator_readiness_finished', 'publication_started',
      'publication_acknowledged', 'inclusion_wait_started',
      'momentum_inclusion_observed', 'facilitator_owner_released',
      'delivery_started', 'delivery_finished', 'paid_response_received',
    ];
    assert.deepEqual(events.map(event => event.phase), expectedPhases);
    assert.deepEqual(events.map(event => event.sequence), expectedPhases.map((_, index) => index));
    for (const event of events) assert.deepEqual(Object.keys(event), [
      'sequence', 'phase', 'role', 'clockDomain', 'utc', 'monotonicMs',
    ]);
    const byPhase = new Map(events.map(event => [event.phase, event]));
    const elapsed = (start, end) => {
      const first = byPhase.get(start);
      const last = byPhase.get(end);
      assert.equal(first.clockDomain, last.clockDomain);
      assert.equal(last.monotonicMs >= first.monotonicMs, true);
      return last.monotonicMs - first.monotonicMs;
    };
    const derivedDurations = {
      challenge: elapsed('challenge_request_started', 'challenge_402_received'),
      total: elapsed('challenge_402_received', 'paid_response_received'),
      buyerOwnerWait: elapsed('buyer_owner_wait_started', 'buyer_owner_acquired'),
      buyerOwnerHeld: elapsed('buyer_owner_acquired', 'buyer_owner_released'),
      buyerReadiness: elapsed('buyer_readiness_started', 'buyer_readiness_finished'),
      prepareBlock: elapsed('prepare_block_started', 'prepare_block_finished'),
      facilitatorOwnerWait: elapsed(
        'facilitator_owner_wait_started', 'facilitator_owner_acquired',
      ),
      facilitatorOwnerHeld: elapsed(
        'facilitator_owner_acquired', 'facilitator_owner_released',
      ),
      facilitatorReadiness: elapsed(
        'facilitator_readiness_started', 'facilitator_readiness_finished',
      ),
      publication: elapsed('publication_started', 'publication_acknowledged'),
      inclusionWait: elapsed('inclusion_wait_started', 'momentum_inclusion_observed'),
      delivery: elapsed('delivery_started', 'delivery_finished'),
    };
    assert.deepEqual(timingProjection.timing.durationsMs, derivedDurations);
    assert.equal(http.initial.observedAt, byPhase.get('challenge_402_received').utc);
    assert.equal(http.final.observedAt, byPhase.get('paid_response_received').utc);
    assert.equal(confirmation.observedAt, byPhase.get('momentum_inclusion_observed').utc);
    assert.equal(Date.parse(http.final.observedAt) - Date.parse(http.initial.observedAt),
      derivedDurations.total);

    assert.deepEqual(Object.keys(operatorRecord.nonClaims), [
      'authenticatedChainIdentity', 'canonicalRemoteChainIdentity',
      'verifiedFrontierLineage', 'irreversibleFinality', 'facilitatorAuthorship',
      'facilitatorPublicationProven', 'chainObservationIndependentlyAttested',
      'httpExchangeIndependentlyAttested', 'buyerReceiptCryptographicallyProven',
      'recipientReceiveObserved', 'recipientSpendabilityEstablished',
      'initial402BodyOrHeaderCaptured', 'cleanShutdown', 'release', 'activation',
      'productionReadiness',
    ]);
    assert.equal(Object.values(operatorRecord.nonClaims).every(value => value === false), true);

    assert.doesNotMatch(
      operatorRecordText,
      /(?:\/Users\/|\/home\/|[A-Za-z]:\\\\|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|mnemonic|seed phrase|private key|wallet secret|password|RPC credential|access token|authorizationKey|rawPayment|recoveryOwner|stack trace)/iu,
    );
    assert.doesNotMatch(operatorRecordText, /wss?:\/\/(?:rpc\.|(?:\d{1,3}\.){3})/iu);
    for (const forbiddenKey of [
      'signature', 'publicKey', 'nonce', 'previousHash', 'rawPayment',
      'recoveryOwner', 'rpcEndpoint', 'executionBoundary', 'trustBoundary',
      'outerClosureProven', 'workspaceQuarantined', 'postRunComparison',
      'recoveryAttempted', 'transport', 'tlsServerNameAuthenticated',
      'sameRouteCorroboration', 'explorerUrl', 'assetSymbol', 'observedDate',
    ]) assert.equal(operatorRecordText.includes(`\"${forbiddenKey}\"`), false);
  });
