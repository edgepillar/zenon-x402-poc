import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  chmod,
  link,
  lstat,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { canonicalJson } from '../src/canonical.js';
import {
  GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST,
  GATE_B_QUICK_TUNNEL_HOSTNAME_PERSISTENCE_POLICY,
  GATE_B_QUICK_TUNNEL_RUNTIME_CONTROL_POLICY,
  GATE_B_QUICK_TUNNEL_TELEMETRY_POLICIES,
} from '../src/gate-b-quick-tunnel-artifact.js';
import {
  GATE_B_PUBLIC_WS_INPUT_LEAVES,
  GATE_B_RESET_EPOCH_V4_HANDOFF_COMPLETION_MANIFEST,
  serializeGateBQuickTunnelHostnameSource,
} from '../src/gate-b-public-ws-inputs-schema.js';
import {
  completeGateBResetEpochV4FreshInputsFromQuickTunnelLease,
  generateGateBResetEpochV4FreshInputs,
  GateBResetEpochV4FreshInputOwnerError,
} from '../src/gate-b-reset-epoch-v4-fresh-input-owner.js';
import {
  launchGateBQuickTunnel,
  stopGateBQuickTunnel,
} from '../src/gate-b-quick-tunnel-launcher.js';
import {
  createGateBQuickTunnelIpcMessage,
  GATE_B_QUICK_TUNNEL_IPC_TYPES,
  GATE_B_QUICK_TUNNEL_OPERATIONS,
  GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS,
  GATE_B_QUICK_TUNNEL_TELEMETRY_MODES,
} from '../src/gate-b-quick-tunnel-schema.js';
import {
  prepareGateBResetEpochV4Review,
} from '../src/gate-b-reset-epoch-v4-review.js';
import {
  executeResetEpochWssOnceRun,
  preflightResetEpochWssOnceRun,
  RESET_EPOCH_WSS_ONCE_POLICY,
} from '../src/live-evidence-runner.js';
import {
  HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE,
  HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
  HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
  TESTNET_LIVE_ACKNOWLEDGEMENT,
} from '../src/zenon/operator-trusted-testnet-profile.js';

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GENERATORS = [
  0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3,
];
const SYNTHETIC_ASSET = 'zts1znnxxxxxxxxxxxxx9z4ulx';
const HOSTNAME = 'synthetic-fresh-input-owner.trycloudflare.com';
const OTHER_HOSTNAME = 'synthetic-other-fresh-owner.trycloudflare.com';
const RUN_NAME = 'synthetic-reset-epoch-v4-fresh-input-owner';
const ERROR_CODE = 'gate_b_reset_epoch_v4_fresh_input_owner_invalid';
const PENDING_MARKER_LEAF = '.reset-epoch-v4-handoff-pending';
const COMPLETION_MANIFEST_LEAF =
  GATE_B_RESET_EPOCH_V4_HANDOFF_COMPLETION_MANIFEST.leaf;
const PENDING_MARKER_BYTES = Buffer.from(
  'GATE_B_RESET_EPOCH_V4_HANDOFF_PENDING_V1\n',
  'utf8',
);
const FAKE_WALLET_BYTES = Buffer.from(
  'SYNTHETIC_FAKE_WALLET_BYTES_NOT_A_KEY\n',
  'utf8',
);

const INPUT_LEAVES = [
  GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
];
const ALL_LEAVES = [
  ...INPUT_LEAVES,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval,
];
const PENDING_ALL_LEAVES = [PENDING_MARKER_LEAF, ...ALL_LEAVES];
const COMPLETE_ALL_LEAVES = [...PENDING_ALL_LEAVES, COMPLETION_MANIFEST_LEAF];

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
    3, 0, 26,
    ...words,
    0, 0, 0, 0, 0, 0,
  ]) ^ 1;
  const checksum = [];
  for (let index = 0; index < 6; index += 1) {
    checksum.push((polymod >>> (5 * (5 - index))) & 31);
  }
  return `z1${[...words, ...checksum].map(value => BECH32_CHARSET[value]).join('')}`;
}

const SYNTHETIC_PAYER = syntheticUserAddress(47);
const SYNTHETIC_PAYEE = syntheticUserAddress(113);

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

function runConfig(changes = {}) {
  return {
    runnerVersion: 4,
    executionMode: RESET_EPOCH_WSS_ONCE_POLICY.executionMode,
    eventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
    rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
    sourceRevision: 'f'.repeat(40),
    profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
    payer: SYNTHETIC_PAYER,
    acknowledgements: {
      live: TESTNET_LIVE_ACKNOWLEDGEMENT,
      operatorTrust:
        PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
      wss: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT,
    },
    expectedPaymentRequired: {
      x402Version: 2,
      resource: {
        url: `https://${HOSTNAME}/paid`,
        description: 'Synthetic source-only fresh-input-owner fixture',
        mimeType: 'application/json',
      },
      accepts: [{
        scheme: 'exact',
        network: 'zenon:testnet',
        asset: SYNTHETIC_ASSET,
        amount: '1',
        payTo: SYNTHETIC_PAYEE,
        maxTimeoutSeconds: 60,
        extra: {
          paymentFlow: 'upfront',
          poc: true,
          settlement: 'account-block',
          zenonChain: { ...PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE },
        },
      }],
    },
    quickTunnel: quickTunnelBinding(),
    runtime: {
      listenPort: 41000,
      rpcTimeoutMs: 1000,
      maxRecoveryAttempts: 0,
      recoveryDelayMs: 0,
      maxRecoveryElapsedMs: 1000,
    },
    ...changes,
  };
}

function approval(review, changes = {}) {
  return {
    approvalVersion: 1,
    approvalType: RESET_EPOCH_WSS_ONCE_POLICY.approvalType,
    executionMode: review.executionMode,
    eventId: review.eventId,
    runName: review.runName,
    sourceRevision: review.sourceRevision,
    profileName: review.profileName,
    payer: review.payer,
    configDigest: review.configDigest,
    paymentIntentDigest: review.paymentIntentDigest,
    rpcEndpoint: review.rpcEndpoint,
    quickTunnel: structuredClone(review.quickTunnel),
    acknowledgements: {
      oneUseResetLive: RESET_EPOCH_WSS_ONCE_POLICY.oneUseApproval,
      payment: RESET_EPOCH_WSS_ONCE_POLICY.paymentAcknowledgement,
      publication: RESET_EPOCH_WSS_ONCE_POLICY.publicationAcknowledgement,
    },
    ...changes,
  };
}

function canonicalText(value) {
  return `${canonicalJson(value)}\n`;
}

function inputBuffers(hostname = HOSTNAME) {
  const rpcBytes = Buffer.from(canonicalText({
    rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
    secretVersion: 4,
  }), 'utf8');
  return [
    Buffer.from(FAKE_WALLET_BYTES),
    rpcBytes,
    Buffer.from(rpcBytes),
    serializeGateBQuickTunnelHostnameSource(hostname, quickTunnelBinding()),
  ];
}

async function fixture(t) {
  const temporary = await mkdtemp(join(tmpdir(), 'gate-b-reset-v4-fresh-owner-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = await realpath(temporary);
  await chmod(root, 0o700);
  const config = runConfig();
  const runConfigJson = canonicalText(config);
  const review = prepareGateBResetEpochV4Review(runConfigJson, RUN_NAME);
  const approvalJson = canonicalText(approval(review));
  return {
    root,
    config,
    runConfigJson,
    review,
    approvalJson,
    inputs: inputBuffers(),
  };
}

function counters() {
  return {
    directorySyncs: 0,
    fileSyncs: new Map(),
    openCounts: new Map(),
    writeBuffers: [],
    writeCounts: new Map(),
  };
}

function decorateDirectoryHandle(counts, syncHook) {
  return (handle, name) => ({
    stat: (...args) => handle.stat(...args),
    async sync(...args) {
      counts.directorySyncs += 1;
      const result = await handle.sync(...args);
      if (syncHook) await syncHook(name);
      return result;
    },
    close: (...args) => handle.close(...args),
  });
}

function decorateFileHandle(counts, hooks = {}) {
  return (handle, name) => ({
    stat: (...args) => handle.stat(...args),
    chmod: (...args) => hooks.chmod
      ? hooks.chmod({ args, handle, name })
      : handle.chmod(...args),
    read: (...args) => handle.read(...args),
    async write(...args) {
      counts.writeCounts.set(name, (counts.writeCounts.get(name) ?? 0) + 1);
      counts.writeBuffers.push(args[0]);
      if (hooks.write) return hooks.write({ args, handle, name });
      return handle.write(...args);
    },
    async sync(...args) {
      counts.fileSyncs.set(name, (counts.fileSyncs.get(name) ?? 0) + 1);
      if (hooks.sync) return hooks.sync({ args, handle, name });
      return handle.sync(...args);
    },
    close: (...args) => handle.close(...args),
  });
}

function workspaceInjections(root, counts, overrides = {}) {
  return {
    platform: 'darwin',
    actualCwdPath: () => root,
    lstatActualCwd: () => lstat(root, { bigint: true }),
    openActualCwd: flags => open(root, flags),
    realpathActualCwd: () => realpath(root),
    aclInspector: async () => true,
    decorateDirectoryHandle: decorateDirectoryHandle(counts),
    decorateFileHandle: decorateFileHandle(counts),
    ...overrides,
  };
}

function ownerArguments(context, overrides = {}) {
  const inputs = overrides.inputs ?? context.inputs;
  return [
    inputs[0],
    inputs[1],
    inputs[2],
    inputs[3],
    overrides.runConfigJson ?? context.runConfigJson,
    overrides.approvalJson ?? context.approvalJson,
    overrides.reviewedConfigDigest ?? context.review.configDigest,
    overrides.runName ?? RUN_NAME,
    context.root,
    overrides.injected,
  ];
}

function handoffArguments(context, lease, overrides = {}) {
  const inputs = overrides.inputs ?? context.inputs;
  return [
    inputs[0],
    inputs[1],
    inputs[2],
    overrides.runConfigJson ?? context.runConfigJson,
    overrides.approvalJson ?? context.approvalJson,
    overrides.reviewedConfigDigest ?? context.review.configDigest,
    overrides.runName ?? RUN_NAME,
    context.root,
    lease,
    overrides.injected,
  ];
}

function resetEpochRunOptions(context) {
  return {
    configPath: join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig),
    buyerRpcPath: join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc),
    buyerWalletPath: join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet),
    facilitatorRpcPath: join(
      context.root,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc,
    ),
    approvalPath: join(
      context.root,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval,
    ),
    workspaceRoot: context.root,
    runName: RUN_NAME,
    executionMode: RESET_EPOCH_WSS_ONCE_POLICY.executionMode,
  };
}

class SyntheticPrivateFd extends PassThrough {
  constructor() {
    super();
    this.pending = undefined;
    this.on('data', () => {});
  }

  end(chunk, callback) {
    if (this.pending || !Buffer.isBuffer(chunk) || typeof callback !== 'function') {
      throw new Error('invalid synthetic private-FD write');
    }
    this.pending = { callback, chunk: Buffer.from(chunk) };
    return this;
  }

  release() {
    if (!this.pending) throw new Error('missing synthetic private-FD write');
    const { callback, chunk } = this.pending;
    this.pending = undefined;
    return super.end(chunk, callback);
  }
}

class SyntheticQuickTunnelChild extends EventEmitter {
  constructor(onCheck) {
    super();
    this.pid = 43210;
    this.connected = true;
    this.privateFd = new SyntheticPrivateFd();
    this.stdio = [null, null, null, this.privateFd, null];
    this.sent = [];
    this.groupAlive = true;
    this.checks = 0;
    this.onCheck = onCheck;
    this.channel = { close() {}, unref() {} };
  }

  send(message, callback) {
    this.sent.push(message);
    if (typeof callback === 'function') queueMicrotask(() => callback(null));
    if (message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK) {
      this.checks += 1;
      const check = this.checks;
      queueMicrotask(async () => {
        await this.onCheck?.(check);
        this.emit('message', createGateBQuickTunnelIpcMessage(
          GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED,
          message.requestId,
        ));
      });
    }
    if (message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.STOP) {
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

  kill() { return true; }

  disconnect() { this.connected = false; }

  unref() {}
}

async function eventually(predicate, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail('synthetic quick-tunnel condition did not settle');
}

async function retainedQuickTunnelLease(t, context, onCheck, options = {}) {
  const child = new SyntheticQuickTunnelChild(onCheck);
  const manifest = GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST;
  const launch = launchGateBQuickTunnel({
    cloudflaredExecutable: '/private/tmp/cloudflared-fixture',
    operation: GATE_B_QUICK_TUNNEL_OPERATIONS.START,
    schemaVersion: 1,
    sourcePin: manifest.executableSha256,
    telemetryAcknowledgement:
      GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS.ACCEPT_POSSIBLE_ERROR_TELEMETRY,
    telemetryMode:
      GATE_B_QUICK_TUNNEL_TELEMETRY_MODES.ACCEPT_POSSIBLE_ERROR_TELEMETRY,
    workspaceRoot: context.root,
  }, {
    checkTimeoutMs: 500,
    executable: '/private/tmp/node-fixture',
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
    supervisorModule: '/private/tmp/quick-tunnel-supervisor-fixture.js',
  });
  await eventually(() => child.privateFd.pending !== undefined);
  child.privateFd.release();
  child.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.READY,
    1,
  ));
  await eventually(() => child.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.START));
  if (options.writeHostname !== false) {
    await writeHostnameSource(context, { exclusive: true });
  }
  child.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.ACTIVE,
    1,
  ));
  const lease = await launch;
  t.after(async () => {
    try { await stopGateBQuickTunnel(lease); } catch {}
  });
  return { child, lease };
}

async function writeHostnameSource(context, { exclusive = false } = {}) {
  const path = join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource);
  await writeFile(path, context.inputs[3], {
    flag: exclusive ? 'wx' : 'w',
    mode: 0o600,
  });
  await chmod(path, 0o600);
  return path;
}

async function expectFailure(promise) {
  await assert.rejects(promise, error => {
    assert.equal(error instanceof GateBResetEpochV4FreshInputOwnerError, true);
    assert.equal(error.code, ERROR_CODE);
    assert.equal(error.message, ERROR_CODE);
    assert.equal(error.cause, undefined);
    assert.equal(error.stack, `GateBResetEpochV4FreshInputOwnerError: ${ERROR_CODE}`);
    return true;
  });
}

async function assertMissing(path) {
  await assert.rejects(lstat(path), error => error?.code === 'ENOENT');
}

function mode(stat) {
  return stat.mode & 0o777n;
}

function generation(stat) {
  return {
    ctimeNs: stat.ctimeNs,
    dev: stat.dev,
    gid: stat.gid,
    ino: stat.ino,
    mode: stat.mode,
    mtimeNs: stat.mtimeNs,
    nlink: stat.nlink,
    size: stat.size,
    uid: stat.uid,
  };
}

function manifestGeneration(stat) {
  return {
    ctimeNs: stat.ctimeNs.toString(10),
    dev: stat.dev.toString(10),
    gid: stat.gid.toString(10),
    ino: stat.ino.toString(10),
    mode: stat.mode.toString(10),
    mtimeNs: stat.mtimeNs.toString(10),
    nlink: stat.nlink.toString(10),
    size: stat.size.toString(10),
    uid: stat.uid.toString(10),
  };
}

function bytesSha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readCompletionManifest(context) {
  const text = await readFile(join(context.root, COMPLETION_MANIFEST_LEAF), 'utf8');
  const manifest = JSON.parse(text);
  assert.equal(text, canonicalText(manifest));
  assert.deepEqual(Object.keys(manifest).sort(), [
    'completionManifestVersion',
    'kind',
    'markerGeneration',
    'protectedRecords',
    'reviewedConfigDigest',
    'runName',
  ]);
  assert.equal(
    manifest.completionManifestVersion,
    GATE_B_RESET_EPOCH_V4_HANDOFF_COMPLETION_MANIFEST.version,
  );
  assert.equal(manifest.kind, GATE_B_RESET_EPOCH_V4_HANDOFF_COMPLETION_MANIFEST.kind);
  assert.equal(manifest.runName, RUN_NAME);
  assert.equal(manifest.reviewedConfigDigest, context.review.configDigest);
  return manifest;
}

async function assertCompletionManifestMatchesWorkspace(context) {
  const manifest = await readCompletionManifest(context);
  const markerStat = await lstat(join(context.root, PENDING_MARKER_LEAF), {
    bigint: true,
  });
  assert.deepEqual(manifest.markerGeneration, manifestGeneration(markerStat));
  assert.equal(Array.isArray(manifest.protectedRecords), true);
  assert.equal(manifest.protectedRecords.length, 6);
  assert.deepEqual(
    manifest.protectedRecords.map(record => record.leaf),
    ALL_LEAVES,
  );
  for (let index = 0; index < ALL_LEAVES.length; index += 1) {
    const leaf = ALL_LEAVES[index];
    const record = manifest.protectedRecords[index];
    assert.deepEqual(Object.keys(record).sort(), [
      'bytesSha256',
      'generation',
      'leaf',
    ]);
    const bytes = await readFile(join(context.root, leaf));
    const stat = await lstat(join(context.root, leaf), { bigint: true });
    assert.equal(record.bytesSha256, bytesSha256(bytes));
    assert.deepEqual(record.generation, manifestGeneration(stat));
    bytes.fill(0);
  }
  return manifest;
}

async function assertLegacyRejectedBeforeEffects(context) {
  const runOptions = resetEpochRunOptions(context);
  await assert.rejects(preflightResetEpochWssOnceRun(runOptions));
  const effects = {
    attestation: 0,
    facilitator: 0,
    payment: 0,
    wallet: 0,
  };
  await assert.rejects(executeResetEpochWssOnceRun(runOptions, {
    async sourceTreeAttestor() {
      effects.attestation += 1;
      return false;
    },
    operations: {
      async probeBuyerReadiness() { effects.payment += 1; },
      async probePublicEndpoint() { effects.payment += 1; },
      async startFacilitator() { effects.facilitator += 1; },
      async readBuyerWallet() { effects.wallet += 1; },
      async paidFetch() { effects.payment += 1; },
    },
  }));
  assert.deepEqual(effects, {
    attestation: 0,
    facilitator: 0,
    payment: 0,
    wallet: 0,
  });
  await assertMissing(join(context.root, 'PUBLIC_WS_ONCE_CONSUMED'));
  await assertMissing(join(context.root, RUN_NAME));
}

test('requires an explicit private workspace path before reserving inputs', async t => {
  const context = await fixture(t);
  await expectFailure(generateGateBResetEpochV4FreshInputs(
    ...ownerArguments(context).slice(0, 8),
  ));
  assert.deepEqual(await readdir(context.root), []);
});

test('preserves the original empty-workspace API and fixed non-authorizing result', async t => {
  const context = await fixture(t);
  const counts = counters();
  const originals = context.inputs.map(value => Buffer.from(value));
  const injected = workspaceInjections(context.root, counts);
  let networkCalls = 0;
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value() {
      networkCalls += 1;
      throw new Error('network sentinel');
    },
    writable: true,
  });

  let result;
  try {
    result = await generateGateBResetEpochV4FreshInputs(
      ...ownerArguments(context, { injected }),
    );
  } finally {
    if (fetchDescriptor) Object.defineProperty(globalThis, 'fetch', fetchDescriptor);
    else delete globalThis.fetch;
  }

  assert.deepEqual(result, {
    status: 'source_only_fresh_inputs_and_outputs_written_non_authorizing',
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(networkCalls, 0);
  assert.deepEqual((await readdir(context.root)).sort(), [...ALL_LEAVES].sort());
  for (let index = 0; index < INPUT_LEAVES.length; index += 1) {
    assert.deepEqual(
      await readFile(join(context.root, INPUT_LEAVES[index])),
      originals[index],
    );
    assert.deepEqual(context.inputs[index], originals[index]);
  }
  assert.equal(
    await readFile(join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig), 'utf8'),
    context.runConfigJson,
  );
  assert.equal(
    await readFile(
      join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval),
      'utf8',
    ),
    context.approvalJson,
  );
  const stats = await Promise.all(ALL_LEAVES.map(name => lstat(
    join(context.root, name),
    { bigint: true },
  )));
  assert.equal(stats.every(value => value.isFile()), true);
  assert.equal(stats.every(value => value.nlink === 1n), true);
  assert.equal(stats.every(value => mode(value) === 0o600n), true);
  assert.equal(new Set(stats.map(value => `${value.dev}:${value.ino}`)).size, 6);
  assert.equal(counts.writeBuffers.length >= 6, true);
  assert.equal(
    counts.writeBuffers.every(value => value.every(byte => byte === 0)),
    true,
  );
  assert.equal(counts.directorySyncs >= 8, true);

  const source = await readFile(
    new URL('../src/gate-b-reset-epoch-v4-fresh-input-owner.js', import.meta.url),
    'utf8',
  );
  assert.equal(/node:(?:http|https|net|tls)|\bfetch\b/.test(source), false);
});

test('same retained lease returns one opaque capability and retains complete eight-leaf exclusion',
  async t => {
    const context = await fixture(t);
    const { child, lease } = await retainedQuickTunnelLease(t, context);
    const hostnamePath = join(
      context.root,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
    );
    const hostnameGeneration = generation(await lstat(hostnamePath, { bigint: true }));
    const counts = counters();
    const result = await completeGateBResetEpochV4FreshInputsFromQuickTunnelLease(
      ...handoffArguments(context, lease, {
        injected: workspaceInjections(context.root, counts),
      }),
    );

    assert.equal(Object.getPrototypeOf(result), null);
    assert.deepEqual(Reflect.ownKeys(result), []);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(child.checks >= 6, true);
    assert.deepEqual((await readdir(context.root)).sort(), [...COMPLETE_ALL_LEAVES].sort());
    assert.deepEqual(generation(await lstat(hostnamePath, { bigint: true })),
      hostnameGeneration);
    for (let index = 0; index < INPUT_LEAVES.length; index += 1) {
      assert.deepEqual(
        await readFile(join(context.root, INPUT_LEAVES[index])),
        context.inputs[index],
      );
    }
    assert.equal(
      await readFile(join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig), 'utf8'),
      context.runConfigJson,
    );
    assert.equal(
      await readFile(
        join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval),
        'utf8',
      ),
      context.approvalJson,
    );
    assert.deepEqual(
      await readFile(join(context.root, PENDING_MARKER_LEAF)),
      PENDING_MARKER_BYTES,
    );
    await assertCompletionManifestMatchesWorkspace(context);
    const exclusionStats = await Promise.all([
      PENDING_MARKER_LEAF,
      COMPLETION_MANIFEST_LEAF,
    ].map(name => lstat(join(context.root, name), { bigint: true })));
    assert.equal(exclusionStats.every(value => value.isFile()), true);
    assert.equal(exclusionStats.every(value => value.nlink === 1n), true);
    assert.equal(exclusionStats.every(value => mode(value) === 0o600n), true);
    await assertLegacyRejectedBeforeEffects(context);
    const markerGeneration = generation(exclusionStats[0]);

    await expectFailure(completeGateBResetEpochV4FreshInputsFromQuickTunnelLease(
      ...handoffArguments(context, lease, {
        injected: workspaceInjections(context.root, counters()),
      }),
    ));
    assert.deepEqual((await readdir(context.root)).sort(), [...COMPLETE_ALL_LEAVES].sort());
    assert.deepEqual(
      generation(await lstat(join(context.root, PENDING_MARKER_LEAF), { bigint: true })),
      markerGeneration,
    );
  });

test('completion manifest binds retained bytes and generations against later simple tampering',
  async t => {
    const context = await fixture(t);
    const { lease } = await retainedQuickTunnelLease(t, context);
    const capability = await completeGateBResetEpochV4FreshInputsFromQuickTunnelLease(
      ...handoffArguments(context, lease, {
        injected: workspaceInjections(context.root, counters()),
      }),
    );
    assert.equal(Object.isFrozen(capability), true);
    await assertCompletionManifestMatchesWorkspace(context);
    const manifestBefore = await readFile(join(context.root, COMPLETION_MANIFEST_LEAF));
    const walletPath = join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet);
    const changed = await readFile(walletPath);
    changed[0] ^= 0x01;
    await writeFile(walletPath, changed, { mode: 0o600 });
    await chmod(walletPath, 0o600);
    changed.fill(0);

    await assert.rejects(assertCompletionManifestMatchesWorkspace(context));
    assert.deepEqual(
      await readFile(join(context.root, COMPLETION_MANIFEST_LEAF)),
      manifestBefore,
    );
    await assertLegacyRejectedBeforeEffects(context);
    manifestBefore.fill(0);
  });

test('v4 handoff has no marker deletion capability or post-deletion status', async () => {
  const [workspaceSource, ownerSource, security] = await Promise.all([
    readFile(
      new URL('../src/gate-b-public-ws-private-workspace.js', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../src/gate-b-reset-epoch-v4-fresh-input-owner.js', import.meta.url),
      'utf8',
    ),
    readFile(new URL('../SECURITY.md', import.meta.url), 'utf8'),
  ]);
  for (const source of [workspaceSource, ownerSource]) {
    assert.equal(/unlinkPendingMarker|commitResetEpochV4HandoffPendingMarker/u.test(source), false);
    assert.equal(/commit_directory_sync_ambiguous_non_authorizing/u.test(source), false);
  }
  assert.equal(/\bimport\s*\{[^}]*\bunlink\b[^}]*\}\s*from\s*'node:fs\/promises'/u
    .test(workspaceSource), false);
  assert.match(security, /marker is permanent and is never unlinked or renamed/u);
  assert.match(security, /legacy exact-six preflight and runner reject both the seven-leaf pending workspace and the eight-leaf completed workspace/u);
  assert.match(security, /No live v4 consumer or post-completion validator exists in this patch/u);
  assert.match(security, /require the successfully returned process-local capability/u);
});

test('rejects a correctly shaped preseeded hostname without same-workspace lease provenance',
  async t => {
    await t.test('forged lease', async t => {
      const context = await fixture(t);
      await writeHostnameSource(context);
      const forged = Object.freeze(Object.create(null));
      await expectFailure(completeGateBResetEpochV4FreshInputsFromQuickTunnelLease(
        ...handoffArguments(context, forged, {
          injected: workspaceInjections(context.root, counters()),
        }),
      ));
      assert.deepEqual(await readdir(context.root), [
        GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
      ]);
    });

    await t.test('lease retained for another workspace', async t => {
      const source = await fixture(t);
      const target = await fixture(t);
      await writeHostnameSource(target);
      const { lease } = await retainedQuickTunnelLease(t, source);
      await expectFailure(completeGateBResetEpochV4FreshInputsFromQuickTunnelLease(
        ...handoffArguments(target, lease, {
          injected: workspaceInjections(target.root, counters()),
        }),
      ));
      assert.deepEqual(await readdir(target.root), [
        GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
      ]);
    });
  });

test('rejects hostname generation drift and pathname replacement during handoff', async t => {
  for (const replacement of [false, true]) {
    await t.test(replacement ? 'pathname replacement' : 'same-byte generation drift',
      async t => {
        const context = await fixture(t);
        const { lease } = await retainedQuickTunnelLease(t, context);
        const hostnamePath = join(
          context.root,
          GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
        );
        const counts = counters();
        let changed = false;
        const injected = workspaceInjections(context.root, counts, {
          decorateDirectoryHandle: decorateDirectoryHandle(counts, async () => {
            if (changed) return;
            changed = true;
            if (replacement) await unlink(hostnamePath);
            await writeFile(hostnamePath, context.inputs[3], { mode: 0o600 });
            await chmod(hostnamePath, 0o600);
          }),
        });
        await expectFailure(completeGateBResetEpochV4FreshInputsFromQuickTunnelLease(
          ...handoffArguments(context, lease, { injected }),
        ));
        assert.equal(changed, true);
        await assertMissing(join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig));
        await assertMissing(join(
          context.root,
          GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval,
        ));
      });
  }
});

test('final premanifest lease check rejects altered bytes or generations across all seven leaves',
  async t => {
    for (const leaf of PENDING_ALL_LEAVES) {
      await t.test(leaf, async t => {
        const context = await fixture(t);
        let allLeafChecks = 0;
        let changed = false;
        const { lease } = await retainedQuickTunnelLease(t, context, async () => {
          const leaves = (await readdir(context.root)).sort();
          if (JSON.stringify(leaves) !==
              JSON.stringify([...PENDING_ALL_LEAVES].sort())) return;
          allLeafChecks += 1;
          if (allLeafChecks !== 2) return;
          const path = join(context.root, leaf);
          const exactBytes = await readFile(path);
          if (leaf === GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet) {
            exactBytes[0] ^= 0x01;
          }
          await writeFile(path, exactBytes, { mode: 0o600 });
          await chmod(path, 0o600);
          exactBytes.fill(0);
          changed = true;
        });
        await expectFailure(completeGateBResetEpochV4FreshInputsFromQuickTunnelLease(
          ...handoffArguments(context, lease, {
            injected: workspaceInjections(context.root, counters()),
          }),
        ));
        assert.equal(changed, true);
        assert.equal(allLeafChecks, 2);
        await assertMissing(join(context.root, COMPLETION_MANIFEST_LEAF));
      });
    }
  });

test('precommit lease failure with six valid ordinary leaves retains pending exclusion and no legacy authority',
  async t => {
    const context = await fixture(t);
    let child;
    let failedLate = false;
    const retained = await retainedQuickTunnelLease(t, context, async () => {
      if (failedLate) return;
      const leaves = await readdir(context.root);
      if (!ALL_LEAVES.every(leaf => leaves.includes(leaf))) return;
      failedLate = true;
      child.connected = false;
      child.emit('disconnect');
    });
    child = retained.child;

    await expectFailure(completeGateBResetEpochV4FreshInputsFromQuickTunnelLease(
      ...handoffArguments(context, retained.lease, {
        injected: workspaceInjections(context.root, counters()),
      }),
    ));
    assert.equal(failedLate, true);

    await assertLegacyRejectedBeforeEffects(context);

    const replacement = await retainedQuickTunnelLease(
      t,
      context,
      undefined,
      { writeHostname: false },
    );
    await expectFailure(completeGateBResetEpochV4FreshInputsFromQuickTunnelLease(
      ...handoffArguments(context, replacement.lease, {
        injected: workspaceInjections(context.root, counters()),
      }),
    ));

    assert.deepEqual(
      await readFile(join(context.root, PENDING_MARKER_LEAF)),
      PENDING_MARKER_BYTES,
    );
    assert.deepEqual((await readdir(context.root)).sort(),
      [...PENDING_ALL_LEAVES].sort());
  });

test('pending-marker reserve, write, file-sync, and directory-sync faults retain exclusion',
  async t => {
    const cases = [
      {
        name: 'reservation after exclusive create',
        inject(context, counts, triggered) {
          const markerPath = join(context.root, PENDING_MARKER_LEAF);
          return workspaceInjections(context.root, counts, {
            async openPath(path, flags, createMode) {
              if (!triggered.value && path === markerPath) {
                triggered.value = true;
                const handle = await open(path, flags, createMode);
                await handle.close();
                throw Object.assign(new Error('marker reservation sentinel'), { code: 'EIO' });
              }
              return open(path, flags, createMode);
            },
          });
        },
      },
      {
        name: 'marker write',
        inject(context, counts, triggered) {
          return workspaceInjections(context.root, counts, {
            decorateFileHandle: decorateFileHandle(counts, {
              write({ args, handle, name }) {
                if (!triggered.value && name === PENDING_MARKER_LEAF) {
                  triggered.value = true;
                  throw new Error('marker write sentinel');
                }
                return handle.write(...args);
              },
            }),
          });
        },
      },
      {
        name: 'marker file sync',
        inject(context, counts, triggered) {
          return workspaceInjections(context.root, counts, {
            decorateFileHandle: decorateFileHandle(counts, {
              async sync({ args, handle, name }) {
                const result = await handle.sync(...args);
                if (!triggered.value && name === PENDING_MARKER_LEAF) {
                  triggered.value = true;
                  throw new Error('marker file sync sentinel');
                }
                return result;
              },
            }),
          });
        },
      },
      {
        name: 'marker directory sync',
        inject(context, counts, triggered) {
          return workspaceInjections(context.root, counts, {
            decorateDirectoryHandle: decorateDirectoryHandle(counts, async () => {
              if (triggered.value) return;
              try {
                const bytes = await readFile(join(context.root, PENDING_MARKER_LEAF));
                const complete = bytes.equals(PENDING_MARKER_BYTES);
                bytes.fill(0);
                if (!complete) return;
              } catch {
                return;
              }
              triggered.value = true;
              throw new Error('marker directory sync sentinel');
            }),
          });
        },
      },
    ];

    for (const entry of cases) {
      await t.test(entry.name, async subtest => {
        const context = await fixture(subtest);
        const { lease } = await retainedQuickTunnelLease(subtest, context);
        const counts = counters();
        const triggered = { value: false };
        await expectFailure(completeGateBResetEpochV4FreshInputsFromQuickTunnelLease(
          ...handoffArguments(context, lease, {
            injected: entry.inject(context, counts, triggered),
          }),
        ));
        assert.equal(triggered.value, true);
        const markerStat = await lstat(
          join(context.root, PENDING_MARKER_LEAF),
          { bigint: true },
        );
        assert.equal(markerStat.isFile(), true);
        assert.equal(markerStat.nlink, 1n);
        assert.equal(mode(markerStat), 0o600n);
        await assert.rejects(
          preflightResetEpochWssOnceRun(resetEpochRunOptions(context)),
        );
        await assertMissing(join(context.root, 'PUBLIC_WS_ONCE_CONSUMED'));
        await assertMissing(join(context.root, RUN_NAME));
      });
    }
  });

test('manifest reserve, write, file-sync, and directory-sync ambiguity never grants legacy authority',
  async t => {
    const cases = [
      {
        name: 'exclusive reserve after create',
        expectedCalls: 1,
        inject(context, counts, triggered) {
          const manifestPath = join(context.root, COMPLETION_MANIFEST_LEAF);
          return workspaceInjections(context.root, counts, {
            async openPath(path, flags, createMode) {
              if (!triggered.value && path === manifestPath) {
                triggered.value = true;
                triggered.calls += 1;
                const handle = await open(path, flags, createMode);
                await handle.close();
                throw Object.assign(new Error('manifest reserve sentinel'), { code: 'EIO' });
              }
              return open(path, flags, createMode);
            },
          });
        },
      },
      {
        name: 'reserve directory sync',
        expectedCalls: 2,
        inject(context, counts, triggered) {
          return workspaceInjections(context.root, counts, {
            decorateDirectoryHandle: decorateDirectoryHandle(counts, async () => {
              try {
                const stat = await lstat(join(context.root, COMPLETION_MANIFEST_LEAF), {
                  bigint: true,
                });
                if (stat.size !== 0n) return;
              } catch {
                return;
              }
              triggered.value = true;
              triggered.calls += 1;
              throw new Error('manifest reserve directory sync sentinel');
            }),
          });
        },
      },
      {
        name: 'ambiguous write',
        expectedCalls: 1,
        inject(context, counts, triggered) {
          return workspaceInjections(context.root, counts, {
            decorateFileHandle: decorateFileHandle(counts, {
              async write({ args, handle, name }) {
                const result = await handle.write(...args);
                if (!triggered.value && name === COMPLETION_MANIFEST_LEAF) {
                  triggered.value = true;
                  triggered.calls += 1;
                  throw new Error('manifest write sentinel');
                }
                return result;
              },
            }),
          });
        },
      },
      {
        name: 'ambiguous file sync',
        expectedCalls: 1,
        inject(context, counts, triggered) {
          return workspaceInjections(context.root, counts, {
            decorateFileHandle: decorateFileHandle(counts, {
              async sync({ args, handle, name }) {
                const result = await handle.sync(...args);
                if (!triggered.value && name === COMPLETION_MANIFEST_LEAF) {
                  triggered.value = true;
                  triggered.calls += 1;
                  throw new Error('manifest file sync sentinel');
                }
                return result;
              },
            }),
          });
        },
      },
      {
        name: 'ambiguous completion directory sync',
        expectedCalls: 2,
        inject(context, counts, triggered) {
          return workspaceInjections(context.root, counts, {
            decorateDirectoryHandle: decorateDirectoryHandle(counts, async () => {
              try {
                const stat = await lstat(join(context.root, COMPLETION_MANIFEST_LEAF), {
                  bigint: true,
                });
                if (stat.size < 2n) return;
              } catch {
                return;
              }
              triggered.value = true;
              triggered.calls += 1;
              throw new Error('manifest completion directory sync sentinel');
            }),
          });
        },
      },
    ];

    for (const entry of cases) {
      await t.test(entry.name, async subtest => {
        const context = await fixture(subtest);
        const { lease } = await retainedQuickTunnelLease(subtest, context);
        const counts = counters();
        const triggered = { calls: 0, value: false };
        await expectFailure(completeGateBResetEpochV4FreshInputsFromQuickTunnelLease(
          ...handoffArguments(context, lease, {
            injected: entry.inject(context, counts, triggered),
          }),
        ));
        assert.equal(triggered.value, true);
        assert.equal(triggered.calls, entry.expectedCalls);
        assert.deepEqual(
          (await readdir(context.root)).sort(),
          [...COMPLETE_ALL_LEAVES].sort(),
        );
        assert.deepEqual(
          await readFile(join(context.root, PENDING_MARKER_LEAF)),
          PENDING_MARKER_BYTES,
        );
        await assertLegacyRejectedBeforeEffects(context);
        const beforeRetry = await Promise.all(COMPLETE_ALL_LEAVES.map(async leaf => ({
          generation: generation(await lstat(join(context.root, leaf), { bigint: true })),
          leaf,
        })));
        await expectFailure(completeGateBResetEpochV4FreshInputsFromQuickTunnelLease(
          ...handoffArguments(context, lease, {
            injected: workspaceInjections(context.root, counters()),
          }),
        ));
        assert.deepEqual(
          await Promise.all(COMPLETE_ALL_LEAVES.map(async leaf => ({
            generation: generation(await lstat(join(context.root, leaf), { bigint: true })),
            leaf,
          }))),
          beforeRetry,
        );
      });
    }
  });

test('rejects extra leaves before creating any handoff inputs or outputs', async t => {
  const context = await fixture(t);
  const extraPath = join(context.root, 'unexpected-synthetic');
  await writeFile(extraPath, 'SYNTHETIC_EXTRA\n', { mode: 0o600 });
  await chmod(extraPath, 0o600);
  const { lease } = await retainedQuickTunnelLease(t, context);
  const counts = counters();
  await expectFailure(completeGateBResetEpochV4FreshInputsFromQuickTunnelLease(
    ...handoffArguments(context, lease, {
      injected: workspaceInjections(context.root, counts),
    }),
  ));
  assert.deepEqual((await readdir(context.root)).sort(), [
    GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
    'unexpected-synthetic',
  ].sort());
  assert.equal(counts.writeCounts.size, 0);
});

test('collision consumes the one-use handoff and blocks retry', async t => {
  const context = await fixture(t);
  const { lease } = await retainedQuickTunnelLease(t, context);
  const collisionPath = join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet);
  const collisionBytes = Buffer.from('SYNTHETIC_COLLISION_RESIDUE\n', 'utf8');
  const counts = counters();
  let collided = false;
  const injected = workspaceInjections(context.root, counts, {
    async openPath(path, flags, createMode) {
      if (!collided && path === collisionPath) {
        collided = true;
        await writeFile(path, collisionBytes, { mode: 0o600 });
        await chmod(path, 0o600);
      }
      return open(path, flags, createMode);
    },
  });
  await expectFailure(completeGateBResetEpochV4FreshInputsFromQuickTunnelLease(
    ...handoffArguments(context, lease, { injected }),
  ));
  assert.equal(collided, true);
  assert.deepEqual(await readFile(collisionPath), collisionBytes);

  await expectFailure(completeGateBResetEpochV4FreshInputsFromQuickTunnelLease(
    ...handoffArguments(context, lease, {
      injected: workspaceInjections(context.root, counters()),
    }),
  ));
  assert.deepEqual(await readFile(collisionPath), collisionBytes);
  await assertMissing(join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig));
});

test('partial handoff write leaves restrictive residue and blocks retry', async t => {
  const context = await fixture(t);
  const { lease } = await retainedQuickTunnelLease(t, context);
  const counts = counters();
  let failedWrite = false;
  const injected = workspaceInjections(context.root, counts, {
    decorateFileHandle: decorateFileHandle(counts, {
      write({ args, handle, name }) {
        if (!failedWrite && name === GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc) {
          failedWrite = true;
          throw new Error('synthetic handoff write failure');
        }
        return handle.write(...args);
      },
    }),
  });
  await expectFailure(completeGateBResetEpochV4FreshInputsFromQuickTunnelLease(
    ...handoffArguments(context, lease, { injected }),
  ));
  assert.equal(failedWrite, true);
  assert.deepEqual(
    await readFile(join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet)),
    context.inputs[0],
  );
  assert.equal((await lstat(
    join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc),
    { bigint: true },
  )).size, 0n);
  assert.equal((await lstat(
    join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc),
    { bigint: true },
  )).size, 0n);
  await assertMissing(join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig));

  await expectFailure(completeGateBResetEpochV4FreshInputsFromQuickTunnelLease(
    ...handoffArguments(context, lease, {
      injected: workspaceInjections(context.root, counters()),
    }),
  ));
});

test('copies caller buffers before asynchronous work and does not wipe caller ownership', async t => {
  const context = await fixture(t);
  const counts = counters();
  const originals = context.inputs.map(value => Buffer.from(value));
  let mutated = false;
  const injected = workspaceInjections(context.root, counts, {
    async openPath(path, flags, createMode) {
      if (!mutated && path === join(context.root, INPUT_LEAVES[0])) {
        mutated = true;
        for (const input of context.inputs) input.fill(0x78);
      }
      return open(path, flags, createMode);
    },
  });

  await generateGateBResetEpochV4FreshInputs(
    ...ownerArguments(context, { injected }),
  );
  assert.equal(mutated, true);
  for (let index = 0; index < INPUT_LEAVES.length; index += 1) {
    assert.deepEqual(
      await readFile(join(context.root, INPUT_LEAVES[index])),
      originals[index],
    );
    assert.equal(context.inputs[index].every(byte => byte === 0x78), true);
  }
});

test('rejects malformed, noncanonical, historical, mixed, and cross-bound inputs before mutation',
  async t => {
    const context = await fixture(t);
    const historical = runConfig({
      eventId: HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
      profileName: HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
    });
    historical.expectedPaymentRequired.accepts[0].extra.zenonChain = {
      ...HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE,
    };
    const mixedInputs = inputBuffers();
    mixedInputs[2] = Buffer.from(canonicalText({
      rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
      secretVersion: 3,
    }), 'utf8');
    const mismatchInputs = inputBuffers(OTHER_HOSTNAME);
    const cases = [
      ['non-Buffer wallet', { inputs: [new Uint8Array([1]), ...context.inputs.slice(1)] }],
      ['oversized wallet', {
        inputs: [Buffer.alloc((64 * 1024) + 1, 0x78), ...context.inputs.slice(1)],
      }],
      ['malformed buyer RPC', {
        inputs: [context.inputs[0], Buffer.from('{}\n'), ...context.inputs.slice(2)],
      }],
      ['mixed RPC generation', { inputs: mixedInputs }],
      ['hostname cross-binding mismatch', { inputs: mismatchInputs }],
      ['noncanonical approval', {
        approvalJson: `${JSON.stringify(approval(context.review), null, 2)}\n`,
      }],
      ['historical reset epoch', { runConfigJson: canonicalText(historical) }],
      ['unknown run field', {
        runConfigJson: canonicalText({ ...context.config, unknown: true }),
      }],
    ];

    for (const [name, overrides] of cases) {
      await t.test(name, async () => {
        const counts = counters();
        let filesystemOpens = 0;
        const injected = workspaceInjections(context.root, counts, {
          openPath(...args) {
            filesystemOpens += 1;
            return open(...args);
          },
        });
        await expectFailure(generateGateBResetEpochV4FreshInputs(
          ...ownerArguments(context, { ...overrides, injected }),
        ));
        assert.equal(filesystemOpens, 0);
        assert.equal(counts.directorySyncs, 0);
        assert.deepEqual(await readdir(context.root), []);
      });
    }
  });

test('rejects stale, unexpected, linked, and unsafe workspace state without overwrite', async t => {
  await t.test('stale required leaf', async t => {
    const context = await fixture(t);
    const stale = Buffer.from('SYNTHETIC_STALE_INPUT_RESIDUE\n');
    const path = join(context.root, INPUT_LEAVES[0]);
    await writeFile(path, stale, { mode: 0o600 });
    await chmod(path, 0o600);
    const counts = counters();
    await expectFailure(generateGateBResetEpochV4FreshInputs(
      ...ownerArguments(context, {
        injected: workspaceInjections(context.root, counts),
      }),
    ));
    assert.deepEqual(await readFile(path), stale);
    assert.deepEqual(await readdir(context.root), [INPUT_LEAVES[0]]);
    assert.equal(counts.writeCounts.size, 0);
  });

  await t.test('unexpected symlink', async t => {
    const context = await fixture(t);
    await symlink('missing-synthetic-target', join(context.root, 'unexpected-synthetic'));
    const counts = counters();
    await expectFailure(generateGateBResetEpochV4FreshInputs(
      ...ownerArguments(context, {
        injected: workspaceInjections(context.root, counts),
      }),
    ));
    assert.equal((await lstat(join(context.root, 'unexpected-synthetic'))).isSymbolicLink(), true);
    assert.equal(counts.writeCounts.size, 0);
  });

  await t.test('hard-linked stale leaf', async t => {
    const context = await fixture(t);
    const source = join(context.root, 'synthetic-hardlink-source');
    await writeFile(source, FAKE_WALLET_BYTES, { mode: 0o600 });
    await chmod(source, 0o600);
    await link(source, join(context.root, INPUT_LEAVES[0]));
    const counts = counters();
    await expectFailure(generateGateBResetEpochV4FreshInputs(
      ...ownerArguments(context, {
        injected: workspaceInjections(context.root, counts),
      }),
    ));
    assert.equal((await lstat(source, { bigint: true })).nlink, 2n);
    assert.equal(counts.writeCounts.size, 0);
  });

  await t.test('wrong workspace mode', async t => {
    const context = await fixture(t);
    await chmod(context.root, 0o755);
    const counts = counters();
    await expectFailure(generateGateBResetEpochV4FreshInputs(
      ...ownerArguments(context, {
        injected: workspaceInjections(context.root, counts),
      }),
    ));
    assert.deepEqual(await readdir(context.root), []);
    assert.equal(counts.writeCounts.size, 0);
  });
});

test('leaves consumed restrictive residue after reservation, write, or output failure', async t => {
  await t.test('partial input reservation', async t => {
    const context = await fixture(t);
    const counts = counters();
    let attempts = 0;
    const failedPath = join(context.root, INPUT_LEAVES[2]);
    const injected = workspaceInjections(context.root, counts, {
      async openPath(path, flags, createMode) {
        if (path === failedPath) {
          attempts += 1;
          throw Object.assign(new Error('reservation sentinel'), { code: 'EIO' });
        }
        return open(path, flags, createMode);
      },
    });
    await expectFailure(generateGateBResetEpochV4FreshInputs(
      ...ownerArguments(context, { injected }),
    ));
    assert.equal(attempts, 1);
    assert.deepEqual((await readdir(context.root)).sort(), INPUT_LEAVES.slice(0, 2).sort());
    for (const name of INPUT_LEAVES.slice(0, 2)) {
      const stat = await lstat(join(context.root, name), { bigint: true });
      assert.equal(stat.size, 0n);
      assert.equal(stat.nlink, 1n);
      assert.equal(mode(stat), 0o600n);
    }
  });

  await t.test('partial input write', async t => {
    const context = await fixture(t);
    const counts = counters();
    let attempts = 0;
    const injected = workspaceInjections(context.root, counts, {
      decorateFileHandle: decorateFileHandle(counts, {
        write({ args, handle, name }) {
          if (name === INPUT_LEAVES[1]) {
            attempts += 1;
            throw new Error('write sentinel');
          }
          return handle.write(...args);
        },
      }),
    });
    await expectFailure(generateGateBResetEpochV4FreshInputs(
      ...ownerArguments(context, { injected }),
    ));
    assert.equal(attempts, 1);
    assert.deepEqual((await readdir(context.root)).sort(), [...INPUT_LEAVES].sort());
    assert.deepEqual(await readFile(join(context.root, INPUT_LEAVES[0])), context.inputs[0]);
    for (const name of INPUT_LEAVES.slice(1)) {
      assert.equal((await lstat(join(context.root, name), { bigint: true })).size, 0n);
    }
  });

  await t.test('output reservation failure', async t => {
    const context = await fixture(t);
    const counts = counters();
    let attempts = 0;
    const failedPath = join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig);
    const injected = workspaceInjections(context.root, counts, {
      async openPath(path, flags, createMode) {
        if (path === failedPath) {
          attempts += 1;
          throw Object.assign(new Error('output sentinel'), { code: 'EIO' });
        }
        return open(path, flags, createMode);
      },
    });
    await expectFailure(generateGateBResetEpochV4FreshInputs(
      ...ownerArguments(context, { injected }),
    ));
    assert.equal(attempts, 1);
    assert.deepEqual((await readdir(context.root)).sort(), [...INPUT_LEAVES].sort());
    for (let index = 0; index < INPUT_LEAVES.length; index += 1) {
      assert.deepEqual(
        await readFile(join(context.root, INPUT_LEAVES[index])),
        context.inputs[index],
      );
    }
    await assertMissing(join(
      context.root,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval,
    ));
  });
});

test('rejects same-byte pathname replacement and wrong created-file mode', async t => {
  await t.test('pathname replacement', async t => {
    const context = await fixture(t);
    const counts = counters();
    let inputWrites = 0;
    let replaced = false;
    const replacedPath = join(context.root, INPUT_LEAVES[1]);
    const injected = workspaceInjections(context.root, counts, {
      decorateFileHandle: decorateFileHandle(counts, {
        async write({ args, handle, name }) {
          const result = await handle.write(...args);
          if (INPUT_LEAVES.includes(name)) inputWrites += 1;
          return result;
        },
      }),
      decorateDirectoryHandle: decorateDirectoryHandle(counts, async () => {
        if (!replaced && inputWrites === 4) {
          replaced = true;
          await unlink(replacedPath);
          await writeFile(replacedPath, context.inputs[1], { mode: 0o600 });
          await chmod(replacedPath, 0o600);
        }
      }),
    });
    await expectFailure(generateGateBResetEpochV4FreshInputs(
      ...ownerArguments(context, { injected }),
    ));
    assert.equal(replaced, true);
    assert.deepEqual((await readdir(context.root)).sort(), [...INPUT_LEAVES].sort());
    await assertMissing(join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig));
  });

  await t.test('wrong created-file mode', async t => {
    const context = await fixture(t);
    const counts = counters();
    let changed = false;
    const injected = workspaceInjections(context.root, counts, {
      decorateFileHandle: decorateFileHandle(counts, {
        async chmod({ args, handle, name }) {
          if (!changed && name === INPUT_LEAVES[0]) {
            changed = true;
            return handle.chmod(0o644);
          }
          return handle.chmod(...args);
        },
      }),
    });
    await expectFailure(generateGateBResetEpochV4FreshInputs(
      ...ownerArguments(context, { injected }),
    ));
    assert.equal(changed, true);
    const stat = await lstat(join(context.root, INPUT_LEAVES[0]), { bigint: true });
    assert.equal(mode(stat), 0o644n);
    assert.deepEqual(await readdir(context.root), [INPUT_LEAVES[0]]);
  });
});
