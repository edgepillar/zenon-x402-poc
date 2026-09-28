import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  chmod,
  lstat,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { canonicalJson, paymentIntentDigest } from '../src/canonical.js';
import {
  GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST,
  GATE_B_QUICK_TUNNEL_HOSTNAME_PERSISTENCE_POLICY,
  GATE_B_QUICK_TUNNEL_RUNTIME_CONTROL_POLICY,
  GATE_B_QUICK_TUNNEL_TELEMETRY_POLICIES,
} from '../src/gate-b-quick-tunnel-artifact.js';
import {
  GATE_B_PUBLIC_WS_INPUT_LEAVES,
  serializeGateBQuickTunnelHostnameSource,
} from '../src/gate-b-public-ws-inputs-schema.js';
import {
  GateBResetEpochExactSixNativeAdapterError,
  getGateBResetEpochExactSixNativeStatus,
  prepareGateBResetEpochExactSixNativeForReview,
  readGateBResetEpochExactSixNativeFailureStage,
  stopGateBResetEpochExactSixNative,
  validateGateBResetEpochExactSixNativeOfflineCrossCheck,
  waitGateBResetEpochExactSixNativeClosed,
} from '../src/gate-b-reset-epoch-exact-six-native-adapter.js';
import {
  createGateBQuickTunnelIpcMessage,
  GATE_B_QUICK_TUNNEL_IPC_TYPES,
  GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS,
  GATE_B_QUICK_TUNNEL_TELEMETRY_MODES,
} from '../src/gate-b-quick-tunnel-schema.js';
import {
  GATE_B_OPERATOR_COORDINATOR_STATUS_LINES,
  GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_IPC_TYPE,
  GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES,
  frameGateBOperatorCoordinatorBootstrap,
  frameGateBOperatorCoordinatorReview,
} from '../src/gate-b-operator-coordinator-schema.js';
import { runGateBOperatorCoordinatorCli } from
  '../src/gate-b-operator-coordinator-cli.js';
import {
  GATE_B_RESET_EPOCH_OFFLINE_PREFLIGHT,
  GATE_B_RESET_EPOCH_OFFLINE_PROVENANCE,
  gateBResetEpochOfflineConfigDigest,
  gateBResetEpochOfflinePaymentIntentDigest,
  parseGateBResetEpochOfflinePreflightReceipt,
  parseGateBResetEpochOfflineRoleInput,
  parseGateBResetEpochOfflineRunConfig,
} from '../src/gate-b-reset-epoch-offline-preflight.js';
import {
  crossCheckGateBResetEpochOfflineConfiguration,
} from '../src/gate-b-reset-epoch-offline-review-child.js';
import {
  openGateBPublicWsPrivateWorkspace,
} from '../src/gate-b-public-ws-private-workspace.js';
import {
  preflightResetEpochWssOnceRun,
  resetEpochWssOnceConfigDigest,
  RESET_EPOCH_WSS_ONCE_POLICY,
} from '../src/live-evidence-runner.js';
import {
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
  TESTNET_LIVE_ACKNOWLEDGEMENT,
} from '../src/zenon/operator-trusted-testnet-profile.js';

const MODE = 'reset-epoch-exact-six-native-v1';
const RUN_NAME = 'synthetic-reset-epoch-exact-six-native';
const HOSTNAME = 'synthetic-reset-native.trycloudflare.com';
const SOURCE_REVISION = 'a'.repeat(40);
const ERROR_CODE = 'gate_b_reset_epoch_exact_six_native_adapter_invalid';
const REVIEW_REQUIRED = 'GATE_B_CONTROLLER_REVIEW_REQUIRED_RUN_NOT_AUTHORIZED';
const OFFLINE_RECEIPT_VALID =
  'GATE_B_CONTROLLER_OFFLINE_PREFLIGHT_RECEIPT_VALID_RUN_NOT_AUTHORIZED';
const CLOSED = 'GATE_B_CONTROLLER_CLOSED_RUN_NOT_EXECUTED';
const QUARANTINED = 'GATE_B_CONTROLLER_FAILED_WORKSPACE_QUARANTINED';
const ASSET = 'zts1znnxxxxxxxxxxxxx9z4ulx';
const EXACT_SIX = Object.freeze([
  GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.resetEpochOfflinePreflightReceipt,
]);

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GENERATORS = [
  0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3,
];

function bech32Polymod(values) {
  let checksum = 1;
  for (const value of values) {
    const high = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let bit = 0; bit < BECH32_GENERATORS.length; bit += 1) {
      if ((high >>> bit) & 1) checksum ^= BECH32_GENERATORS[bit];
    }
  }
  return checksum;
}

function syntheticUserAddress(seed) {
  const payload = Uint8Array.from(
    { length: 20 },
    (_, index) => index === 0 ? 0 : (seed + index) & 0xff,
  );
  const words = [];
  let accumulator = 0;
  let bits = 0;
  for (const byte of payload) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push((accumulator >>> bits) & 31);
    }
  }
  if (bits > 0) words.push((accumulator << (5 - bits)) & 31);
  const polymod = bech32Polymod([
    3, 0, 26, ...words, 0, 0, 0, 0, 0, 0,
  ]) ^ 1;
  const checksum = [];
  for (let index = 0; index < 6; index += 1) {
    checksum.push((polymod >>> (5 * (5 - index))) & 31);
  }
  return `z1${[...words, ...checksum].map(value => BECH32_CHARSET[value]).join('')}`;
}

const PAYER = syntheticUserAddress(41);
const PAYEE = syntheticUserAddress(109);
const OTHER_PAYER = syntheticUserAddress(77);

function policyPreflight(overrides = {}) {
  return canonicalJson({
    policySelection: {
      eventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
      liveAcknowledgement: TESTNET_LIVE_ACKNOWLEDGEMENT,
      operatorTrustAcknowledgement:
        PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
      profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
      rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
      wssAcknowledgement:
        PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT,
      ...overrides,
    },
    preflightVersion: 1,
  });
}

function bootstrap(root, changes = {}) {
  return {
    mode: MODE,
    payeeAddress: PAYEE,
    policyPreflight: policyPreflight(),
    quickTunnel: {
      cloudflaredExecutable: '/private/tmp/cloudflared-synthetic-fixture',
      sourcePin: GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST.executableSha256,
      telemetryAcknowledgement:
        GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS
          .ACCEPT_POSSIBLE_ERROR_TELEMETRY,
      telemetryMode:
        GATE_B_QUICK_TUNNEL_TELEMETRY_MODES.ACCEPT_POSSIBLE_ERROR_TELEMETRY,
    },
    runName: RUN_NAME,
    schemaVersion: 5,
    workspaceRoot: root,
    ...changes,
  };
}

function review(config, changes = {}) {
  return {
    acknowledgements: {
      offlineReceipt:
        GATE_B_RESET_EPOCH_OFFLINE_PREFLIGHT.acknowledgements.offlineReceipt,
      operatorAssertion:
        GATE_B_RESET_EPOCH_OFFLINE_PREFLIGHT.acknowledgements.operatorAssertion,
      payeeOwnership:
        GATE_B_RESET_EPOCH_OFFLINE_PREFLIGHT.acknowledgements.payeeOwnership,
    },
    reviewedConfigDigest: gateBResetEpochOfflineConfigDigest(config),
    reviewedPayee: PAYEE,
    reviewedPayer: PAYER,
    reviewedPaymentIntentDigest: gateBResetEpochOfflinePaymentIntentDigest(config),
    schemaVersion: 5,
    ...changes,
  };
}

function liveApproval(config) {
  return {
    acknowledgements: {
      oneUseResetLive: RESET_EPOCH_WSS_ONCE_POLICY.oneUseApproval,
      payment: RESET_EPOCH_WSS_ONCE_POLICY.paymentAcknowledgement,
      publication: RESET_EPOCH_WSS_ONCE_POLICY.publicationAcknowledgement,
    },
    approvalType: RESET_EPOCH_WSS_ONCE_POLICY.approvalType,
    approvalVersion: 1,
    configDigest: resetEpochWssOnceConfigDigest(config),
    eventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
    executionMode: RESET_EPOCH_WSS_ONCE_POLICY.executionMode,
    payer: config.payer,
    paymentIntentDigest: paymentIntentDigest(
      config.expectedPaymentRequired,
      config.expectedPaymentRequired.accepts[0],
    ),
    profileName: config.profileName,
    quickTunnel: config.quickTunnel,
    rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
    runName: RUN_NAME,
    sourceRevision: config.sourceRevision,
  };
}

function livePreflightOptions(root) {
  return {
    approvalPath: join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval),
    buyerRpcPath: join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc),
    buyerWalletPath: join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet),
    configPath: join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig),
    executionMode: RESET_EPOCH_WSS_ONCE_POLICY.executionMode,
    facilitatorRpcPath: join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc),
    runName: RUN_NAME,
    workspaceRoot: root,
  };
}

function quickTunnelBinding() {
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
  };
}

class SyntheticPrivateFd extends PassThrough {
  constructor(onFrame) {
    super();
    this.onFrame = onFrame;
    this.on('data', () => {});
  }

  end(chunk, callback) {
    const copied = Buffer.from(chunk);
    const result = super.end(copied, error => {
      callback?.(error);
      if (!error) queueMicrotask(this.onFrame);
    });
    copied.fill(0);
    return result;
  }
}

class SyntheticQuickTunnelChild extends EventEmitter {
  constructor(root, counters, options = {}) {
    super();
    this.pid = 43120;
    this.connected = true;
    this.channel = { close() {}, unref() {} };
    this.groupAlive = true;
    this.root = root;
    this.counters = counters;
    this.failAfterSourceWrite = options.failAfterSourceWrite === true;
    this.invalidHostnameSource = options.invalidHostnameSource === true;
    this.omitSourceStage = options.omitSourceStage === true;
    this.duplicateSourceStage = options.duplicateSourceStage === true;
    this.privateFd = new SyntheticPrivateFd(() => {
      this.emit('message', createGateBQuickTunnelIpcMessage(
        GATE_B_QUICK_TUNNEL_IPC_TYPES.READY,
        1,
      ));
    });
    this.stdio = [null, null, null, this.privateFd, null];
  }

  send(message, callback) {
    this.counters.tunnelMessages.push(message.type);
    queueMicrotask(() => callback?.(null));
    if (message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.START) {
      queueMicrotask(async () => {
        const bytes = this.invalidHostnameSource
          ? Buffer.from('{}\n')
          : serializeGateBQuickTunnelHostnameSource(HOSTNAME, quickTunnelBinding());
        try {
          await writeFile(
            join(this.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource),
            bytes,
            { flag: 'wx', mode: 0o600 },
          );
          await chmod(
            join(this.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource),
            0o600,
          );
          if (!this.omitSourceStage) {
            const sourceStage = createGateBQuickTunnelIpcMessage(
              GATE_B_QUICK_TUNNEL_IPC_TYPES.HOSTNAME_SOURCE_WRITTEN,
              message.requestId,
            );
            this.emit('message', sourceStage);
            if (this.duplicateSourceStage) this.emit('message', sourceStage);
          }
          if (this.failAfterSourceWrite) {
            this.emit('error', new Error('synthetic'));
            return;
          }
          this.emit('message', createGateBQuickTunnelIpcMessage(
            GATE_B_QUICK_TUNNEL_IPC_TYPES.ACTIVE,
            message.requestId,
          ));
        } finally {
          bytes.fill(0);
        }
      });
    }
    if (message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK) {
      this.counters.readinessChecks += 1;
      queueMicrotask(() => this.emit('message', createGateBQuickTunnelIpcMessage(
        GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED,
        message.requestId,
      )));
    }
    if (message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.STOP) {
      this.counters.stopMessages += 1;
      queueMicrotask(() => {
        this.emit('message', createGateBQuickTunnelIpcMessage(
          GATE_B_QUICK_TUNNEL_IPC_TYPES.STOPPED,
          message.requestId,
        ));
        this.groupAlive = false;
        this.emit('exit', 0, null);
        this.emit('close', 0, null);
      });
    }
    return true;
  }

  disconnect() { this.connected = false; }
  kill() { return true; }
  unref() {}
}

function fakeSdk(counters, phase2Payer) {
  return Object.freeze({
    Address: Object.freeze({
      parse(value) {
        return Object.freeze({ toString() { return value; } });
      },
    }),
    KeyStore: Object.freeze({
      fromEntropy(entropy) {
        assert.match(entropy, /^[0-9a-f]{64}$/u);
        counters.entropyConversions += 1;
        return {
          mnemonic: 'synthetic-not-a-real-wallet-secret',
          getKeyPair(index) {
            counters.keyPairIndexes.push(index);
            assert.equal(index, 0);
            return {
              getAddress() {
                return Object.freeze({
                  toString() { return PAYER; },
                });
              },
              sign() {
                counters.signCalls += 1;
                throw new Error('signing poison');
              },
              clear() { counters.keyClears += 1; },
            };
          },
        };
      },
      fromMnemonic() {
        counters.mnemonicRederivations += 1;
        return {
          getKeyPair(index) {
            counters.keyPairIndexes.push(index);
            assert.equal(index, 0);
            return {
              getAddress() {
                return Object.freeze({ toString() { return phase2Payer; } });
              },
              sign() {
                counters.signCalls += 1;
                throw new Error('signing poison');
              },
              clear() { counters.keyClears += 1; },
            };
          },
        };
      },
    }),
    ZNN_ZTS: Object.freeze({ toString() { return ASSET; } }),
  });
}

function decorateDirectoryHandle(counters, closeFailure) {
  return (handle, name) => {
    counters.rawHandles.push(handle);
    return {
      stat: (...args) => handle.stat(...args),
      sync: (...args) => handle.sync(...args),
      async close(...args) {
        const label = `directory:${name}`;
        counters.closeAttempts.push(label);
        if (closeFailure === label) throw new Error('close poison');
        counters.underlyingCloseAttempts.push(label);
        return handle.close(...args);
      },
    };
  };
}

function decorateFileHandle(counters, closeFailure, mutateWalletReadBuffer, writeFailure) {
  return (handle, name) => {
    counters.rawHandles.push(handle);
    return {
      stat: (...args) => handle.stat(...args),
      chmod: (...args) => handle.chmod(...args),
      async read(...args) {
        if (name === GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet) {
          if (args[3] === 0) counters.walletReads += 1;
        }
        const result = await handle.read(...args);
        if (name === GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet &&
            mutateWalletReadBuffer === true && args[3] === 0 && result.bytesRead > 0 &&
            counters.walletMutations === 0) {
          args[0][args[1]] ^= 1;
          counters.walletMutations += 1;
        }
        return result;
      },
      write: (...args) => {
        if (writeFailure === name) throw new Error('write poison');
        return handle.write(...args);
      },
      sync: (...args) => handle.sync(...args),
      async close(...args) {
        const label = `file:${name}`;
        counters.closeAttempts.push(label);
        if (closeFailure === label) throw new Error('close poison');
        counters.underlyingCloseAttempts.push(label);
        return handle.close(...args);
      },
    };
  };
}

async function fixture(t, changes = {}) {
  const {
    closeFailure,
    failAfterSourceWrite = false,
    duplicateSourceStage = false,
    invalidHostnameSource = false,
    mutateWalletReadBuffer = false,
    phase2Payer = PAYER,
    omitSourceStage = false,
    reservationFault,
    writeFailure,
    ...dependencyChanges
  } = changes;
  const temporary = await mkdtemp(join(tmpdir(), 'gate-b-reset-native-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = await realpath(temporary);
  await chmod(root, 0o700);
  const counters = {
    attestationCalls: 0,
    closeAttempts: [],
    entropyConversions: 0,
    keyPairIndexes: [],
    keyClears: 0,
    mnemonicRederivations: 0,
    readinessChecks: 0,
    rawHandles: [],
    signCalls: 0,
    stopMessages: 0,
    tunnelMessages: [],
    underlyingCloseAttempts: [],
    walletReads: 0,
    walletMutations: 0,
    exclusiveLeafAttempts: [],
  };
  t.after(async () => {
    await Promise.allSettled(counters.rawHandles.map(handle => handle.close()));
  });
  const child = new SyntheticQuickTunnelChild(root, counters, {
    failAfterSourceWrite,
    duplicateSourceStage,
    invalidHostnameSource,
    omitSourceStage,
  });
  const workspaceInjections = {
    aclInspector: async () => true,
    actualCwdPath: () => root,
    decorateDirectoryHandle: decorateDirectoryHandle(counters, closeFailure),
    decorateFileHandle: decorateFileHandle(
      counters,
      closeFailure,
      mutateWalletReadBuffer,
      writeFailure,
    ),
    lstatActualCwd: () => lstat(root, { bigint: true }),
    openActualCwd: flags => open(root, flags),
    openPath: async (path, ...args) => {
      const leaf = Object.values(GATE_B_PUBLIC_WS_INPUT_LEAVES)
        .find(candidate => path === join(root, candidate));
      if (leaf !== undefined) counters.exclusiveLeafAttempts.push(leaf);
      if ((reservationFault === 'BEFORE_WALLET' &&
            leaf === GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet) ||
          (reservationFault === 'AFTER_WALLET' &&
            leaf === GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc)) {
        throw new Error('reservation poison');
      }
      return open(path, ...args);
    },
    platform: 'darwin',
    realpathActualCwd: () => realpath(root),
  };
  const injected = {
    attestSourceTree: async revision => {
      counters.attestationCalls += 1;
      return revision === SOURCE_REVISION;
    },
    captureSourceRevision: async () => SOURCE_REVISION,
    entropySource: size => Buffer.alloc(size, 0x5a),
    platform: 'darwin',
    privateWorkspaceInjections: workspaceInjections,
    quickTunnelInjections: {
      checkTimeoutMs: 500,
      executable: '/private/tmp/node-synthetic-fixture',
      forkProcess: () => child,
      hardLifetimeMs: 5_000,
      killProcessGroup(pid, signal) {
        assert.equal(pid, child.pid);
        if (signal === 'SIGKILL') child.groupAlive = false;
      },
      maxRequestId: 100,
      platform: 'darwin',
      probeProcessGroup: pid => {
        assert.equal(pid, child.pid);
        return child.groupAlive;
      },
      reapAbandonMs: 40,
      reapForceMs: 10,
      shutdownTimeoutMs: 500,
      startupTimeoutMs: 500,
      supervisorModule: '/private/tmp/quick-tunnel-supervisor-synthetic-fixture.js',
    },
    sdkLoader: async () => fakeSdk(counters, phase2Payer),
    ...dependencyChanges,
  };
  return { child, counters, injected, root, workspaceInjections };
}

async function prepare(t, changes = {}) {
  const context = await fixture(t, changes);
  context.capability = await prepareGateBResetEpochExactSixNativeForReview(
    bootstrap(context.root),
    context.injected,
  );
  return context;
}

async function crossCheckBundle(context) {
  const config = parseGateBResetEpochOfflineRunConfig(await readFile(
    join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig),
    'utf8',
  ));
  const crossCheck = await crossCheckGateBResetEpochOfflineConfiguration({
    attestSourceTree: async revision => revision === SOURCE_REVISION,
    beforeFinalVerification: async () => {},
    cwd: () => context.root,
    openWorkspace: openGateBPublicWsPrivateWorkspace,
    workspaceInjections: context.workspaceInjections,
  });
  return {
    config,
    crossCheck,
    operator: review(config),
  };
}

function assertAdapterError(error) {
  assert.equal(error instanceof GateBResetEpochExactSixNativeAdapterError, true);
  assert.equal(error.code, ERROR_CODE);
  assert.equal(error.message, ERROR_CODE);
  assert.equal(error.cause, undefined);
  assert.equal(error.stack, `GateBResetEpochExactSixNativeAdapterError: ${ERROR_CODE}`);
  return true;
}

async function assertExactPrivateLeaves(root, expected) {
  const leaves = (await readdir(root)).sort();
  assert.deepEqual(leaves, [...expected].sort());
  const stats = await Promise.all(leaves.map(leaf => lstat(join(root, leaf), {
    bigint: true,
  })));
  assert.equal(stats.every(stat => stat.isFile() && !stat.isSymbolicLink()), true);
  assert.equal(stats.every(stat => stat.nlink === 1n), true);
  assert.equal(stats.every(stat => (stat.mode & 0o777n) === 0o600n), true);
  assert.equal(new Set(stats.map(stat => `${stat.dev}:${stat.ino}`)).size, leaves.length);
}

async function capturePreparationFailure(t, changes) {
  const context = await fixture(t, changes);
  let observed;
  await assert.rejects(
    prepareGateBResetEpochExactSixNativeForReview(
      bootstrap(context.root),
      context.injected,
    ),
    candidate => {
      observed = candidate;
      return assertAdapterError(candidate);
    },
  );
  return { context, observed };
}

test('missing native diagnostic send callback cannot delay quarantine cleanup',
  { timeout: 4_000 }, async t => {
    const { context, observed } = await capturePreparationFailure(t, {
      failAfterSourceWrite: true,
    });
    assert.equal(
      readGateBResetEpochExactSixNativeFailureStage(observed),
      GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.HOSTNAME_SOURCE_WRITTEN,
    );

    const channel = new EventEmitter();
    const sent = [];
    const lines = [];
    const forbiddenCalls = [];
    const capability = Object.freeze(Object.create(null));
    let status = REVIEW_REQUIRED;
    let stopCalls = 0;
    let stopCallsAtDiagnosticSend;
    let validateCalls = 0;
    let waitCalls = 0;
    channel.send = (message, callback) => {
      sent.push(structuredClone(message));
      if (message.type === GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_IPC_TYPE) {
        stopCallsAtDiagnosticSend = stopCalls;
        return true;
      }
      queueMicrotask(() => callback?.(null));
      if (message.type === 'REVIEW_REQUIRED') {
        setImmediate(() => channel.emit('message', { type: 'REVIEW_OPEN' }));
      }
      return true;
    };
    const unused = name => async () => {
      forbiddenCalls.push(name);
      throw new Error('unexpected test dependency');
    };
    const reviewInput = {
      acknowledgements: {
        offlineReceipt:
          GATE_B_RESET_EPOCH_OFFLINE_PREFLIGHT.acknowledgements.offlineReceipt,
        operatorAssertion:
          GATE_B_RESET_EPOCH_OFFLINE_PREFLIGHT.acknowledgements.operatorAssertion,
        payeeOwnership:
          GATE_B_RESET_EPOCH_OFFLINE_PREFLIGHT.acknowledgements.payeeOwnership,
      },
      reviewedConfigDigest: 'a'.repeat(64),
      reviewedPayee: PAYEE,
      reviewedPayer: PAYER,
      reviewedPaymentIntentDigest: 'b'.repeat(64),
      schemaVersion: 5,
    };
    const reader = Object.freeze({
      close() { return true; },
      openReviewPhase() { return true; },
      openRunPhase() { forbiddenCalls.push('open-run'); return true; },
      readInitial() {
        return Promise.resolve(frameGateBOperatorCoordinatorBootstrap(
          bootstrap(context.root),
        ));
      },
      readReview() {
        return Promise.resolve(frameGateBOperatorCoordinatorReview(reviewInput));
      },
      readRun() {
        forbiddenCalls.push('read-run');
        return Promise.reject(new Error('unexpected run read'));
      },
    });
    const pending = runGateBOperatorCoordinatorCli({
      argv: [],
      authorizeController: unused('legacy-authorize'),
      channel,
      createFrameReader: () => reader,
      crossCheckResetConfiguration: async () => { throw observed; },
      getControllerStatus: unused('legacy-status'),
      getResetControllerStatus: candidate => {
        assert.equal(candidate, capability);
        return status;
      },
      inputStream: Object.freeze({}),
      lifetimeMs: 1_000,
      prepareController: unused('legacy-prepare'),
      prepareResetController: async () => capability,
      reviewConfiguration: unused('legacy-review'),
      runController: unused('run-controller'),
      stderr: async line => { lines.push(['stderr', line]); return true; },
      stdout: async line => { lines.push(['stdout', line]); return true; },
      stopController: unused('legacy-stop'),
      stopResetController: candidate => {
        assert.equal(candidate, capability);
        stopCalls += 1;
        status = CLOSED;
        return Promise.resolve(CLOSED);
      },
      validateResetController: async () => {
        validateCalls += 1;
        return OFFLINE_RECEIPT_VALID;
      },
      waitControllerClosed: unused('legacy-wait'),
      waitResetControllerClosed: candidate => {
        assert.equal(candidate, capability);
        waitCalls += 1;
        return Promise.resolve(CLOSED);
      },
    });
    const deadline = Symbol('deadline');
    let deadlineTimer;
    const outcome = await Promise.race([
      pending,
      new Promise(resolve => {
        deadlineTimer = setTimeout(
          () => resolve(deadline),
          1_000,
        );
      }),
    ]);
    clearTimeout(deadlineTimer);

    assert.notEqual(outcome, deadline);
    assert.equal(outcome, false);
    assert.equal(stopCallsAtDiagnosticSend, 1);
    assert.equal(stopCalls, 1);
    assert.equal(waitCalls, 1);
    assert.equal(validateCalls, 0);
    assert.deepEqual(forbiddenCalls, []);
    assert.deepEqual(lines, [
      ['stdout', GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.REVIEW_REQUIRED],
      ['stderr', GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.QUARANTINED],
    ]);
    assert.deepEqual(sent.map(message => message.type), [
      'REVIEW_REQUIRED',
      'REVIEW_OPENED',
      GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_IPC_TYPE,
      'QUARANTINED',
    ]);
  });

test('fixed failure stages distinguish the post-hostname wallet reservation windows',
  async t => {
    for (const [name, changes] of [
      ['missing source stage', { omitSourceStage: true }],
      ['duplicate source stage', { duplicateSourceStage: true }],
    ]) {
      await t.test(`${name} resolves to UNKNOWN`, async subtest => {
        const { context, observed } = await capturePreparationFailure(subtest, changes);
        assert.equal(
          readGateBResetEpochExactSixNativeFailureStage(observed),
          GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.UNKNOWN,
        );
        await assertExactPrivateLeaves(context.root, [
          GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
        ]);
        assert.equal(context.counters.entropyConversions, 0);
        assert.equal(context.counters.signCalls, 0);
      });
    }

    await t.test('source write confirmed before ACTIVE remains a lower bound', async subtest => {
      const { context, observed } = await capturePreparationFailure(subtest, {
        failAfterSourceWrite: true,
      });
      assert.equal(
        readGateBResetEpochExactSixNativeFailureStage(observed),
        GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.HOSTNAME_SOURCE_WRITTEN,
      );
      await assertExactPrivateLeaves(context.root, [
        GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
      ]);
      assert.equal(context.counters.entropyConversions, 0);
      assert.equal(context.counters.signCalls, 0);
    });

    await t.test('ACTIVE and handoff precede hostname parsing', async subtest => {
      const { context, observed } = await capturePreparationFailure(subtest, {
        invalidHostnameSource: true,
      });
      assert.equal(
        readGateBResetEpochExactSixNativeFailureStage(observed),
        GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.HOSTNAME_HANDOFF_VERIFIED,
      );
      await assertExactPrivateLeaves(context.root, [
        GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
      ]);
      assert.equal(context.counters.entropyConversions, 0);
      assert.equal(context.counters.stopMessages, 1);
    });

    await t.test('verified hostname precedes entropy conversion', async subtest => {
      const { context, observed } = await capturePreparationFailure(subtest, {
        entropySource() { throw new Error('entropy poison'); },
      });
      assert.equal(
        readGateBResetEpochExactSixNativeFailureStage(observed),
        GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.HOSTNAME_SOURCE_VERIFIED,
      );
      await assertExactPrivateLeaves(context.root, [
        GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
      ]);
      assert.equal(context.counters.signCalls, 0);
    });

    await t.test('fault before the wallet reservation leaves no wallet leaf', async subtest => {
      const { context, observed } = await capturePreparationFailure(subtest, {
        reservationFault: 'BEFORE_WALLET',
      });
      assert.equal(
        readGateBResetEpochExactSixNativeFailureStage(observed),
        GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.WALLET_MATERIAL_DERIVED,
      );
      await assertExactPrivateLeaves(context.root, [
        GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
      ]);
      assert.equal(context.counters.exclusiveLeafAttempts.filter(
        leaf => leaf === GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet).length, 1);
      assert.equal(context.counters.signCalls, 0);
    });

    await t.test('fault after the first exclusive reservation retains one empty wallet leaf',
      async subtest => {
        const { context, observed } = await capturePreparationFailure(subtest, {
          reservationFault: 'AFTER_WALLET',
        });
        assert.equal(
          readGateBResetEpochExactSixNativeFailureStage(observed),
          GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.WALLET_LEAF_RESERVED,
        );
        await assertExactPrivateLeaves(context.root, [
          GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet,
          GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
        ]);
        assert.equal((await readFile(join(
          context.root,
          GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet,
        ))).length, 0);
        assert.equal(context.counters.exclusiveLeafAttempts.filter(
          leaf => leaf === GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet).length, 1);
        assert.equal(context.counters.exclusiveLeafAttempts.filter(
          leaf => leaf === GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc).length, 1);
        assert.equal(context.counters.signCalls, 0);
      });
  });

test('failure stages are private branded evidence and never caller-forgeable', async t => {
  const { observed } = await capturePreparationFailure(t, {
    entropySource() { throw new Error('entropy poison'); },
  });
  assert.equal('stage' in observed, false);
  assert.equal(JSON.stringify(observed).includes('HOSTNAME'), false);
  assert.equal(
    readGateBResetEpochExactSixNativeFailureStage(
      new GateBResetEpochExactSixNativeAdapterError(),
    ),
    GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.UNKNOWN,
  );
  assert.equal(
    readGateBResetEpochExactSixNativeFailureStage(Object.freeze({
      stage: GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.OFFLINE_RECEIPT_COMMITTED,
    })),
    GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.UNKNOWN,
  );
});

test('receipt reservation failure stays nonauthorizing, one-shot, and privacy-safe',
  async t => {
    const context = await prepare(t, {
      writeFailure: GATE_B_PUBLIC_WS_INPUT_LEAVES.resetEpochOfflinePreflightReceipt,
    });
    const reviewed = await crossCheckBundle(context);
    let observed;
    await assert.rejects(
      validateGateBResetEpochExactSixNativeOfflineCrossCheck(
        context.capability,
        reviewed.operator,
        reviewed.crossCheck,
      ),
      candidate => {
        observed = candidate;
        return assertAdapterError(candidate);
      },
    );
    assert.equal(
      readGateBResetEpochExactSixNativeFailureStage(observed),
      GATE_B_RESET_EPOCH_NATIVE_DIAGNOSTIC_STAGES.OFFLINE_RECEIPT_RESERVED,
    );
    assert.equal(await waitGateBResetEpochExactSixNativeClosed(context.capability), QUARANTINED);
    await assertExactPrivateLeaves(context.root, EXACT_SIX);
    assert.equal((await readFile(join(
      context.root,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.resetEpochOfflinePreflightReceipt,
    ))).length, 0);
    assert.equal(context.counters.exclusiveLeafAttempts.filter(
      leaf => leaf ===
        GATE_B_PUBLIC_WS_INPUT_LEAVES.resetEpochOfflinePreflightReceipt).length, 1);
    assert.equal(context.counters.signCalls, 0);
  });

test('real SDK accepts deterministic synthetic entropy without signing or network use', async t => {
  const context = await prepare(t, {
    sdkLoader: () => import('znn-typescript-sdk'),
  });
  assert.equal(
    getGateBResetEpochExactSixNativeStatus(context.capability),
    REVIEW_REQUIRED,
  );
  assert.equal(context.counters.signCalls, 0);
  assert.equal(await stopGateBResetEpochExactSixNative(context.capability), CLOSED);
});

test('creates one opaque same-process adapter capability and pauses at review', async t => {
  const context = await prepare(t);
  assert.equal(Object.getPrototypeOf(context.capability), null);
  assert.equal(Object.isFrozen(context.capability), true);
  assert.deepEqual(Reflect.ownKeys(context.capability), []);
  assert.equal(
    getGateBResetEpochExactSixNativeStatus(context.capability),
    REVIEW_REQUIRED,
  );
  await assertExactPrivateLeaves(context.root, EXACT_SIX.slice(0, 5));
  assert.equal(context.counters.walletReads, 0);
  assert.equal(context.counters.signCalls, 0);
  assert.equal(context.counters.stopMessages, 0);
  assert.equal(context.counters.readinessChecks >= 1, true);
  assert.equal(await stopGateBResetEpochExactSixNative(context.capability), CLOSED);
  assert.equal(await waitGateBResetEpochExactSixNativeClosed(context.capability), CLOSED);
  assert.equal(context.counters.stopMessages, 1);
});

test('writes only a nonauthorizing offline receipt after operator input and a child cross-check',
  async t => {
    const context = await prepare(t);
    const reviewed = await crossCheckBundle(context);
    const result = await validateGateBResetEpochExactSixNativeOfflineCrossCheck(
      context.capability,
      reviewed.operator,
      reviewed.crossCheck,
    );
    assert.equal(result, OFFLINE_RECEIPT_VALID);
    assert.equal(
      getGateBResetEpochExactSixNativeStatus(context.capability),
      OFFLINE_RECEIPT_VALID,
    );
    await assertExactPrivateLeaves(context.root, EXACT_SIX);
    assert.equal(context.counters.walletReads, 1);
    assert.equal(context.counters.mnemonicRederivations, 1);
    assert.deepEqual(context.counters.keyPairIndexes, [0, 0]);
    assert.equal(context.counters.signCalls, 0);
    assert.equal(context.counters.readinessChecks >= 2, true);

    const { config } = reviewed;
    assert.equal(config.sourceRevision, SOURCE_REVISION);
    assert.equal(config.payer, PAYER);
    assert.equal(config.expectedPaymentRequired.accepts[0].payTo, PAYEE);
    assert.equal(config.expectedPaymentRequired.resource.url, `https://${HOSTNAME}/paid`);
    for (const leaf of [
      GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc,
    ]) {
      const role = leaf === GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc
        ? 'buyer-rpc'
        : 'facilitator-rpc';
      parseGateBResetEpochOfflineRoleInput(
        await readFile(join(context.root, leaf), 'utf8'),
        role,
      );
    }
    const receipt = parseGateBResetEpochOfflinePreflightReceipt(await readFile(
      join(context.root,
        GATE_B_PUBLIC_WS_INPUT_LEAVES.resetEpochOfflinePreflightReceipt),
      'utf8',
    ));
    assert.equal(receipt.configDigest, reviewed.operator.reviewedConfigDigest);
    assert.equal(receipt.paymentIntentDigest,
      reviewed.operator.reviewedPaymentIntentDigest);
    assert.equal(receipt.runName, RUN_NAME);
    assert.equal(receipt.runAuthorization, 'RUN_NOT_AUTHORIZED');
    assert.equal(receipt.futureLiveConsumerEligible, false);
    assert.equal(receipt.livePaymentDecision, 'NO_GO');
    assert.equal(receipt.independentReview, 'NOT_PROVEN');
    assert.equal(
      receipt.crossCheckClassification,
      'OPERATOR_TRUSTED_NONAUTHORITATIVE_CROSS_CHECK',
    );
    await assert.rejects(readFile(
      join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval),
    ));
    assert.equal(await stopGateBResetEpochExactSixNative(context.capability), CLOSED);
    assert.equal(await waitGateBResetEpochExactSixNativeClosed(context.capability), CLOSED);
    assert.equal(context.counters.stopMessages, 1);
    await assertExactPrivateLeaves(context.root, EXACT_SIX);
  });

test('a forged plain cross-check object cannot make the receipt claim independent authority',
  async t => {
    const context = await prepare(t);
    const reviewed = await crossCheckBundle(context);
    const forgedPlainObject = { ...reviewed.crossCheck };
    assert.equal(await validateGateBResetEpochExactSixNativeOfflineCrossCheck(
      context.capability,
      reviewed.operator,
      forgedPlainObject,
    ), OFFLINE_RECEIPT_VALID);
    const receipt = parseGateBResetEpochOfflinePreflightReceipt(await readFile(
      join(context.root,
        GATE_B_PUBLIC_WS_INPUT_LEAVES.resetEpochOfflinePreflightReceipt),
      'utf8',
    ));
    assert.equal(receipt.independentReview, 'NOT_PROVEN');
    assert.equal(
      receipt.crossCheckClassification,
      'OPERATOR_TRUSTED_NONAUTHORITATIVE_CROSS_CHECK',
    );
    assert.equal(receipt.runAuthorization, 'RUN_NOT_AUTHORIZED');
    assert.equal(receipt.futureLiveConsumerEligible, false);
    assert.equal(receipt.livePaymentDecision, 'NO_GO');
    for (const provenanceClassification of Object.values(
      GATE_B_RESET_EPOCH_OFFLINE_PROVENANCE,
    )) {
      const variant = parseGateBResetEpochOfflinePreflightReceipt(
        `${canonicalJson({ ...receipt, provenanceClassification })}\n`,
      );
      assert.equal(variant.independentReview, 'NOT_PROVEN');
      assert.equal(
        variant.crossCheckClassification,
        'OPERATOR_TRUSTED_NONAUTHORITATIVE_CROSS_CHECK',
      );
      assert.equal(variant.runAuthorization, 'RUN_NOT_AUTHORIZED');
      assert.equal(variant.futureLiveConsumerEligible, false);
      assert.equal(variant.livePaymentDecision, 'NO_GO');
    }
    assert.equal(await stopGateBResetEpochExactSixNative(context.capability), CLOSED);
  });

test('the fixed spawned child returns an operator-trusted nonauthoritative cross-check',
  { timeout: 10_000 }, async t => {
    const context = await prepare(t);
    const config = parseGateBResetEpochOfflineRunConfig(await readFile(
      join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig),
      'utf8',
    ));
    const { launchGateBResetEpochOfflineCrossCheck } = await import(
      '../src/gate-b-operator-coordinator-cli.js'
    );
    const childModule = fileURLToPath(new URL(
      '../test-support/gate-b-schema5-offline-review-child.js',
      import.meta.url,
    ));
    const crossChecked = await launchGateBResetEpochOfflineCrossCheck(
      context.root,
      { childModule, timeoutMs: 2000 },
    );
    assert.deepEqual(crossChecked, {
      configDigest: gateBResetEpochOfflineConfigDigest(config),
      hostname: HOSTNAME,
      independentReview: 'NOT_PROVEN',
      payee: PAYEE,
      payer: PAYER,
      paymentIntentDigest: gateBResetEpochOfflinePaymentIntentDigest(config),
      resultVersion: 5,
      sourceRevision: SOURCE_REVISION,
      type: 'OPERATOR_TRUSTED_NONAUTHORITATIVE_CROSS_CHECK',
    });
    assert.equal(await validateGateBResetEpochExactSixNativeOfflineCrossCheck(
      context.capability,
      review(config),
      crossChecked,
    ), OFFLINE_RECEIPT_VALID);
    assert.equal(await stopGateBResetEpochExactSixNative(context.capability), CLOSED);
  });

test('forged, copied, and replayed capabilities cannot substitute for retained authority',
  async t => {
    const context = await prepare(t);
    const reviewed = await crossCheckBundle(context);
    const forged = Object.freeze(Object.create(null));
    const copied = Object.freeze(Object.assign(Object.create(null), context.capability));
    for (const candidate of [forged, copied]) {
      assert.throws(
        () => getGateBResetEpochExactSixNativeStatus(candidate),
        assertAdapterError,
      );
      await assert.rejects(
        validateGateBResetEpochExactSixNativeOfflineCrossCheck(
          candidate,
          reviewed.operator,
          reviewed.crossCheck,
        ),
        assertAdapterError,
      );
    }
    const first = validateGateBResetEpochExactSixNativeOfflineCrossCheck(
      context.capability,
      reviewed.operator,
      reviewed.crossCheck,
    );
    await assert.rejects(
      validateGateBResetEpochExactSixNativeOfflineCrossCheck(
        context.capability,
        reviewed.operator,
        reviewed.crossCheck,
      ),
      assertAdapterError,
    );
    await assert.rejects(first, assertAdapterError);
    assert.equal(
      getGateBResetEpochExactSixNativeStatus(context.capability),
      QUARANTINED,
    );
    assert.equal(await stopGateBResetEpochExactSixNative(context.capability), QUARANTINED);
    assert.equal(
      await waitGateBResetEpochExactSixNativeClosed(context.capability),
      QUARANTINED,
    );
    assert.equal(context.counters.stopMessages, 1);
  });

test('bad review consumes the workspace without retry, deletion, or wallet read', async t => {
  const context = await prepare(t);
  const reviewed = await crossCheckBundle(context);
  const invalid = review(reviewed.config, {
    acknowledgements: {
      ...reviewed.operator.acknowledgements,
      operatorAssertion: 'NOT_ACCEPTED',
    },
  });
  await assert.rejects(
    validateGateBResetEpochExactSixNativeOfflineCrossCheck(
      context.capability,
      invalid,
      reviewed.crossCheck,
    ),
    assertAdapterError,
  );
  assert.equal(
    getGateBResetEpochExactSixNativeStatus(context.capability),
    QUARANTINED,
  );
  await assertExactPrivateLeaves(context.root, EXACT_SIX.slice(0, 5));
  assert.equal(context.counters.walletReads, 0);
  assert.equal(context.counters.signCalls, 0);
  assert.equal(await stopGateBResetEpochExactSixNative(context.capability), QUARANTINED);
  assert.equal(context.counters.stopMessages, 1);
  await assert.rejects(
    validateGateBResetEpochExactSixNativeOfflineCrossCheck(
      context.capability,
      reviewed.operator,
      reviewed.crossCheck,
    ),
    assertAdapterError,
  );
  await assertExactPrivateLeaves(context.root, EXACT_SIX.slice(0, 5));
});

test('pre-existing exact-six, v3, and v4 residue fail before tunnel launch', async t => {
  for (const leaf of [
    ...EXACT_SIX,
    GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval,
    '.gate-b-reset-epoch-v3-reserved',
    '.reset-epoch-v4-handoff-pending',
    '.reset-epoch-v4-handoff-complete.json',
  ]) await t.test(leaf, async t => {
    const context = await fixture(t);
    await writeFile(join(context.root, leaf), 'synthetic-residue\n', { mode: 0o600 });
    await chmod(join(context.root, leaf), 0o600);
    await assert.rejects(
      prepareGateBResetEpochExactSixNativeForReview(
        bootstrap(context.root),
        context.injected,
      ),
      assertAdapterError,
    );
    assert.deepEqual(await readdir(context.root), [leaf]);
    assert.deepEqual(context.counters.tunnelMessages, []);
    assert.equal(context.counters.walletReads, 0);
  });
});

test('undefined attestation fulfillment never becomes preflight authority', async t => {
  const context = await fixture(t, {
    attestSourceTree: async () => undefined,
  });
  await assert.rejects(
    prepareGateBResetEpochExactSixNativeForReview(
      bootstrap(context.root),
      context.injected,
    ),
    assertAdapterError,
  );
  assert.deepEqual(await readdir(context.root), []);
  assert.deepEqual(context.counters.tunnelMessages, []);
});

test('Phase 1 derives only payer index zero and rejects an equal public payee', async t => {
  const context = await fixture(t);
  await assert.rejects(
    prepareGateBResetEpochExactSixNativeForReview(
      bootstrap(context.root, { payeeAddress: PAYER }),
      context.injected,
    ),
    assertAdapterError,
  );
  assert.deepEqual(context.counters.keyPairIndexes, [0]);
  assert.equal(context.counters.keyPairIndexes.includes(1), false);
  assert.equal(context.counters.signCalls, 0);
  assert.equal(context.counters.stopMessages, 1);
});

test('Phase 2 rejects operator or cross-check binding mismatches before receipt write',
  async t => {
    for (const [name, mutate] of [
      ['operator-config-digest', bundle => {
        bundle.operator.reviewedConfigDigest = 'b'.repeat(64);
      }],
      ['operator-payee', bundle => { bundle.operator.reviewedPayee = OTHER_PAYER; }],
      ['cross-check-intent-digest', bundle => {
        bundle.crossCheck.paymentIntentDigest = 'b'.repeat(64);
      }],
      ['cross-check-hostname', bundle => {
        bundle.crossCheck.hostname = 'different.trycloudflare.com';
      }],
    ]) await t.test(name, async t => {
      const context = await prepare(t);
      const reviewed = await crossCheckBundle(context);
      reviewed.operator = structuredClone(reviewed.operator);
      reviewed.crossCheck = structuredClone(reviewed.crossCheck);
      mutate(reviewed);
      await assert.rejects(
        validateGateBResetEpochExactSixNativeOfflineCrossCheck(
          context.capability,
          reviewed.operator,
          reviewed.crossCheck,
        ),
        assertAdapterError,
      );
      assert.equal(
        getGateBResetEpochExactSixNativeStatus(context.capability),
        QUARANTINED,
      );
      await assert.rejects(readFile(join(
        context.root,
        GATE_B_PUBLIC_WS_INPUT_LEAVES.resetEpochOfflinePreflightReceipt,
      )));
    });
  });

test('Phase 2 rejects a post-read wallet-buffer mutation; on-disk mutation is unproven',
  async t => {
    const context = await prepare(t, { mutateWalletReadBuffer: true });
    const reviewed = await crossCheckBundle(context);
    await assert.rejects(
      validateGateBResetEpochExactSixNativeOfflineCrossCheck(
        context.capability,
        reviewed.operator,
        reviewed.crossCheck,
      ),
      assertAdapterError,
    );
    assert.equal(context.counters.walletReads, 1);
    assert.equal(context.counters.walletMutations, 1);
    assert.equal(getGateBResetEpochExactSixNativeStatus(context.capability), QUARANTINED);
    await assert.rejects(readFile(join(
      context.root,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.resetEpochOfflinePreflightReceipt,
    )));
  });

test('Phase 2 quarantines a separate-handle in-place wallet overwrite', async t => {
  const unchanged = await prepare(t);
  const unchangedReviewed = await crossCheckBundle(unchanged);
  assert.equal(
    await validateGateBResetEpochExactSixNativeOfflineCrossCheck(
      unchanged.capability,
      unchangedReviewed.operator,
      unchangedReviewed.crossCheck,
    ),
    OFFLINE_RECEIPT_VALID,
  );
  assert.equal(unchanged.counters.signCalls, 0);
  assert.equal(await stopGateBResetEpochExactSixNative(unchanged.capability), CLOSED);
  assert.equal(
    await waitGateBResetEpochExactSixNativeClosed(unchanged.capability),
    CLOSED,
  );

  const context = await prepare(t);
  const reviewed = await crossCheckBundle(context);
  const walletPath = join(
    context.root,
    GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet,
  );
  const before = await lstat(walletPath, { bigint: true });
  let originalBytes;
  let overwrittenBytes;
  let observedBytes;
  try {
    originalBytes = await readFile(walletPath);
    overwrittenBytes = Buffer.from(originalBytes);
    assert.equal(overwrittenBytes.length > 0, true);
    overwrittenBytes[0] ^= 1;
    assert.equal(overwrittenBytes.equals(originalBytes), false);

    const overwriteHandle = await open(walletPath, 'r+');
    try {
      const opened = await overwriteHandle.stat({ bigint: true });
      assert.equal(opened.dev, before.dev);
      assert.equal(opened.ino, before.ino);
      assert.equal(opened.size, before.size);
      let offset = 0;
      while (offset < overwrittenBytes.length) {
        const result = await overwriteHandle.write(
          overwrittenBytes,
          offset,
          overwrittenBytes.length - offset,
          offset,
        );
        assert.equal(
          Number.isSafeInteger(result.bytesWritten) && result.bytesWritten > 0,
          true,
        );
        offset += result.bytesWritten;
      }
      await overwriteHandle.sync();
    } finally {
      await overwriteHandle.close();
    }

    const after = await lstat(walletPath, { bigint: true });
    assert.equal(after.dev, before.dev);
    assert.equal(after.ino, before.ino);
    assert.equal(after.size, before.size);
    observedBytes = await readFile(walletPath);
    assert.equal(observedBytes.length, originalBytes.length);
    assert.equal(observedBytes.equals(originalBytes), false);
    assert.equal(observedBytes.equals(overwrittenBytes), true);
  } finally {
    originalBytes?.fill(0);
    overwrittenBytes?.fill(0);
    observedBytes?.fill(0);
  }

  await assert.rejects(
    validateGateBResetEpochExactSixNativeOfflineCrossCheck(
      context.capability,
      reviewed.operator,
      reviewed.crossCheck,
    ),
    assertAdapterError,
  );
  assert.equal(
    getGateBResetEpochExactSixNativeStatus(context.capability),
    QUARANTINED,
  );
  await assertExactPrivateLeaves(context.root, EXACT_SIX.slice(0, 5));
  assert.equal(context.counters.signCalls, 0);
  assert.equal(await stopGateBResetEpochExactSixNative(context.capability), QUARANTINED);
  assert.equal(
    await waitGateBResetEpochExactSixNativeClosed(context.capability),
    QUARANTINED,
  );
});

test('Phase 2 rejects wallet rederivation to a mismatched payer', async t => {
  const context = await prepare(t, { phase2Payer: OTHER_PAYER });
  const reviewed = await crossCheckBundle(context);
  await assert.rejects(
    validateGateBResetEpochExactSixNativeOfflineCrossCheck(
      context.capability,
      reviewed.operator,
      reviewed.crossCheck,
    ),
    assertAdapterError,
  );
  assert.equal(context.counters.walletReads, 1);
  assert.equal(context.counters.mnemonicRederivations, 1);
  assert.deepEqual(context.counters.keyPairIndexes, [0, 0]);
  assert.equal(getGateBResetEpochExactSixNativeStatus(context.capability), QUARANTINED);
});

test('workspace close latches one failure while attempting every first-pass descriptor',
  async t => {
    for (const closeFailure of [
      `file:${GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet}`,
      'directory:path',
      'directory:cwd',
    ]) await t.test(closeFailure.replace(':', '-'), async t => {
      const context = await fixture(t, { closeFailure });
      const workspace = await openGateBPublicWsPrivateWorkspace(
        context.root,
        context.workspaceInjections,
      );
      await workspace.reserveOutputs([GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet]);
      const first = workspace.close();
      const concurrent = workspace.close();
      assert.strictEqual(concurrent, first);
      const firstFailure = await first.then(
        () => assert.fail('close unexpectedly succeeded'),
        error => error,
      );
      const repeated = workspace.close();
      assert.strictEqual(repeated, first);
      const repeatedFailure = await repeated.then(
        () => assert.fail('repeated close unexpectedly succeeded'),
        error => error,
      );
      assert.strictEqual(repeatedFailure, firstFailure);
      assert.equal(firstFailure.code, 'gate_b_public_ws_private_workspace_invalid');
      assert.deepEqual(context.counters.closeAttempts, [
        `file:${GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet}`,
        'directory:path',
        'directory:cwd',
      ]);
      assert.equal(
        context.counters.underlyingCloseAttempts.includes(closeFailure),
        false,
      );
    });
  });

test('workspace close attempts every descriptor and quarantines on any close failure',
  async t => {
    for (const closeFailure of [
      `file:${GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet}`,
      'directory:path',
      'directory:cwd',
    ]) await t.test(closeFailure.replace(':', '-'), async t => {
      const context = await prepare(t, { closeFailure });
      const first = stopGateBResetEpochExactSixNative(context.capability);
      assert.strictEqual(stopGateBResetEpochExactSixNative(context.capability), first);
      assert.equal(await first, QUARANTINED);
      assert.strictEqual(stopGateBResetEpochExactSixNative(context.capability), first);
      assert.equal(await first, QUARANTINED);
      assert.equal(
        await waitGateBResetEpochExactSixNativeClosed(context.capability),
        QUARANTINED,
      );
      assert.equal(context.counters.closeAttempts.length, 7);
      assert.equal(context.counters.closeAttempts.includes('directory:path'), true);
      assert.equal(context.counters.closeAttempts.includes('directory:cwd'), true);
      assert.equal(
        context.counters.underlyingCloseAttempts.includes(closeFailure),
        false,
      );
      assert.equal(context.counters.stopMessages, 1);
    });
  });

test('validated dependency promises are pinned before adversarial constructor species access',
  async t => {
    let constructorReads = 0;
    const context = await fixture(t, {
      attestSourceTree(revision) {
        const promise = Promise.resolve(revision === SOURCE_REVISION);
        Object.defineProperty(promise, 'constructor', {
          configurable: true,
          enumerable: false,
          get() {
            constructorReads += 1;
            throw new Error('constructor species poison');
          },
        });
        return promise;
      },
    });
    const capability = await prepareGateBResetEpochExactSixNativeForReview(
      bootstrap(context.root),
      context.injected,
    );
    assert.equal(constructorReads, 0);
    assert.equal(await stopGateBResetEpochExactSixNative(capability), CLOSED);
  });

test('an unreplaceable hostile promise constructor fails closed without species access',
  async t => {
    let constructorReads = 0;
    const context = await fixture(t, {
      attestSourceTree(revision) {
        const promise = Promise.resolve(revision === SOURCE_REVISION);
        Object.defineProperty(promise, 'constructor', {
          configurable: false,
          enumerable: false,
          get() {
            constructorReads += 1;
            throw new Error('constructor species poison');
          },
        });
        return promise;
      },
    });
    await assert.rejects(
      prepareGateBResetEpochExactSixNativeForReview(
        bootstrap(context.root),
        context.injected,
      ),
      assertAdapterError,
    );
    assert.equal(constructorReads, 0);
    assert.deepEqual(context.counters.tunnelMessages, []);
  });

test('live preflight accepts six live leaves then rejects an extra offline receipt by namespace',
  async t => {
    for (const variant of ['zero', 'partial', 'full']) {
      await t.test(variant, async subtest => {
        const context = await prepare(subtest);
        const reviewed = await crossCheckBundle(context);
        assert.equal(await validateGateBResetEpochExactSixNativeOfflineCrossCheck(
          context.capability,
          reviewed.operator,
          reviewed.crossCheck,
        ), OFFLINE_RECEIPT_VALID);
        const receiptPath = join(
          context.root,
          GATE_B_PUBLIC_WS_INPUT_LEAVES.resetEpochOfflinePreflightReceipt,
        );
        const receiptBytes = await readFile(receiptPath);
        try {
          parseGateBResetEpochOfflinePreflightReceipt(receiptBytes.toString('utf8'));
          assert.equal(await stopGateBResetEpochExactSixNative(context.capability), CLOSED);
          await rm(receiptPath);
          await writeFile(
            join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval),
            `${canonicalJson(liveApproval(reviewed.config))}\n`,
            { mode: 0o600 },
          );
          const options = livePreflightOptions(context.root);
          assert.deepEqual(await preflightResetEpochWssOnceRun(options), { valid: true });
          const extra = variant === 'zero'
            ? Buffer.alloc(0)
            : variant === 'partial'
              ? receiptBytes.subarray(0, Math.max(1, Math.floor(receiptBytes.length / 2)))
              : receiptBytes;
          await writeFile(receiptPath, extra, { mode: 0o600 });
          await assert.rejects(preflightResetEpochWssOnceRun(options));
          assert.deepEqual(await readFile(receiptPath), extra);
          await assert.rejects(lstat(join(context.root, 'PUBLIC_WS_ONCE_CONSUMED')));
          await assert.rejects(lstat(join(context.root, RUN_NAME)));
        } finally {
          receiptBytes.fill(0);
        }
      });
    }
  });

test('adapter promises are native and pinned before public handoff', async t => {
  const context = await fixture(t);
  const pending = prepareGateBResetEpochExactSixNativeForReview(
    bootstrap(context.root),
    context.injected,
  );
  assert.equal(Object.getPrototypeOf(pending), Promise.prototype);
  assert.deepEqual(Object.getOwnPropertyDescriptor(pending, 'constructor'), {
    configurable: false,
    enumerable: false,
    value: Promise,
    writable: false,
  });
  const capability = await pending;
  const closed = stopGateBResetEpochExactSixNative(capability);
  assert.equal(Object.getPrototypeOf(closed), Promise.prototype);
  assert.deepEqual(Object.getOwnPropertyDescriptor(closed, 'constructor'), {
    configurable: false,
    enumerable: false,
    value: Promise,
    writable: false,
  });
  assert.equal(await closed, CLOSED);
});

test('module exposes no RUN, origin-release, runner-child, payment, or publication surface',
  async () => {
    const [module, source] = await Promise.all([
      import('../src/gate-b-reset-epoch-exact-six-native-adapter.js'),
      readFile(
        new URL('../src/gate-b-reset-epoch-exact-six-native-adapter.js', import.meta.url),
        'utf8',
      ),
    ]);
    assert.deepEqual(Object.keys(module).sort(), [
      'GateBResetEpochExactSixNativeAdapterError',
      'getGateBResetEpochExactSixNativeStatus',
      'prepareGateBResetEpochExactSixNativeForReview',
      'readGateBResetEpochExactSixNativeFailureStage',
      'stopGateBResetEpochExactSixNative',
      'validateGateBResetEpochExactSixNativeOfflineCrossCheck',
      'waitGateBResetEpochExactSixNativeClosed',
    ]);
    assert.doesNotMatch(source,
      /executeResetEpochWssOnceRun|submitGateBOperatorCoordinatorRun|live-evidence-runner/u);
    assert.doesNotMatch(source,
      /parseResetEpochWssOnceApproval|preflightResetEpochWssOnceRun/u);
    assert.doesNotMatch(source, /origin-release|RELEASE_ORIGIN|ORIGIN_RELEASED/iu);
    assert.doesNotMatch(source, /live-evidence-public-ws-once-(?:supervisor|run-child)/u);
    assert.doesNotMatch(source, /paidFetch|publishRawTransaction|signAndSend|sign\(/u);
    assert.doesNotMatch(source, /\b(?:WebSocket|fetch|sendRawTransaction|sendTransaction)\b/u);
    assert.doesNotMatch(source, /gate-b-reset-epoch-(?:v4|operator-v3|filesystem-preflight-v3)/u);
  });
