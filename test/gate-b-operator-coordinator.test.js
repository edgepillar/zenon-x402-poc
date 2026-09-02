import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { connect, createServer } from 'node:net';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PassThrough } from 'node:stream';

import { canonicalJson } from '../src/canonical.js';
import {
  GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST,
  GATE_B_QUICK_TUNNEL_HOSTNAME_PERSISTENCE_POLICY,
  GATE_B_QUICK_TUNNEL_RUNTIME_CONTROL_POLICY,
  GATE_B_QUICK_TUNNEL_TELEMETRY_POLICIES,
} from '../src/gate-b-quick-tunnel-artifact.js';
import {
  GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS,
  GATE_B_OPERATOR_COORDINATOR_LIMITS,
  GATE_B_OPERATOR_COORDINATOR_STATUS_LINES,
  GATE_B_OPERATOR_ORIGIN_RELEASE_IPC_TYPES,
  createGateBOperatorOriginReleaseIpcMessage,
  frameGateBOperatorCoordinatorBootstrap,
  frameGateBOperatorCoordinatorReview,
  frameGateBOperatorCoordinatorRun,
  parseGateBOperatorCoordinatorBootstrapFrame,
  parseGateBOperatorCoordinatorReviewFrame,
  parseGateBOperatorCoordinatorRunFrame,
  parseGateBOperatorReviewResultFrame,
  createGateBOperatorCoordinatorIpcMessage,
  frameGateBOperatorReviewResult,
} from '../src/gate-b-operator-coordinator-schema.js';
import {
  createGateBOperatorCoordinatorFrameReader,
  launchGateBOperatorConfigReview,
  runGateBOperatorCoordinatorCli,
} from '../src/gate-b-operator-coordinator-cli.js';
import {
  getGateBOperatorCoordinatorStatus,
  launchGateBOperatorCoordinator,
  launchGateBOperatorWatchdogSetup,
  stopGateBOperatorCoordinator,
  submitGateBOperatorBootstrap,
  submitGateBOperatorCoordinatorReview,
  submitGateBOperatorCoordinatorRun,
  confirmGateBOperatorCoordinatorOriginReleased,
  waitGateBOperatorCoordinatorOriginReleaseRequest,
  waitGateBOperatorCoordinatorClosed,
} from '../src/gate-b-operator-coordinator-launcher.js';
import {
  GATE_B_OPERATOR_ORIGIN_DENIAL_RESPONSE,
  GATE_B_OPERATOR_ORIGIN_GUARD_HOST,
  GATE_B_OPERATOR_ORIGIN_GUARD_PORT,
  GATE_B_OPERATOR_ORIGIN_GUARD_TARGET_MAGIC,
  closeGateBOperatorOriginGuard,
  createGateBOperatorOriginGuard,
  createGateBOperatorOriginGuardForTest,
  getGateBOperatorOriginGuardAddress,
  getGateBOperatorOriginGuardHandle,
  observeGateBOperatorOriginGuardFault,
} from '../src/gate-b-operator-origin-guard.js';
import {
  GATE_B_OPERATOR_REVIEW_LEAVES,
  independentGateBOperatorConfigDigest,
  reviewGateBOperatorConfiguration,
  runGateBOperatorConfigReviewChild,
  validateIndependentGateBOperatorConfig,
} from '../src/gate-b-operator-config-review-child.js';
import {
  GATE_B_OPERATOR_FRONT_END_PHASE_1_REQUIRED,
  GATE_B_OPERATOR_FRONT_END_PHASE_3_REQUIRED,
  runGateBOperatorFrontEnd,
} from '../src/gate-b-operator-front-end.js';
import {
  GATE_B_PUBLIC_WS_INPUT_LEAVES,
  serializeGateBProtectedEndpointSource,
  serializeGateBQuickTunnelHostnameSource,
} from '../src/gate-b-public-ws-inputs-schema.js';
import {
  parsePublicWsOnceRunConfig,
  publicWsOnceConfigDigest,
} from '../src/live-evidence-runner.js';
import {
  GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS,
  GATE_B_QUICK_TUNNEL_TELEMETRY_MODES,
} from '../src/gate-b-quick-tunnel-schema.js';
import {
  GATE_B_CURRENT_TESTNET_CHAIN_PROFILE,
  GATE_B_CURRENT_TESTNET_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  GATE_B_CURRENT_TESTNET_PROFILE_NAME,
  TESTNET_LIVE_ACKNOWLEDGEMENT,
} from '../src/zenon/operator-trusted-testnet-profile.js';

const WORKSPACE_ROOT = '/private/tmp/gate-b-operator-coordinator-fixture';

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

test('watchdog ownership exposes setup and one-time bootstrap as separate capabilities', () => {
  assert.equal(typeof launchGateBOperatorWatchdogSetup, 'function');
  assert.equal(typeof submitGateBOperatorBootstrap, 'function');
});

test('origin guard owns an injected numeric IPv4 loopback socket and writes only fixed denial',
  async () => {
    const guard = await createGateBOperatorOriginGuardForTest(0);
    try {
      const address = getGateBOperatorOriginGuardAddress(guard);
      assert.equal(address.address, '127.0.0.1');
      assert.equal(address.family, 'IPv4');
      assert.equal(Number.isSafeInteger(address.port) && address.port > 0, true);
      const received = [];
      const socket = connect({ host: address.address, port: address.port });
      socket.on('data', chunk => received.push(chunk));
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('bounded timeout')), 1000);
        socket.once('close', () => {
          clearTimeout(timer);
          resolve(true);
        });
        socket.once('error', reject);
        socket.end('request-derived-private-fixture');
      });
      assert.equal(Buffer.concat(received).toString('ascii'),
        GATE_B_OPERATOR_ORIGIN_DENIAL_RESPONSE);
      for (const chunk of received) chunk.fill(0);
    } finally {
      assert.equal(await closeGateBOperatorOriginGuard(guard), true);
    }
  });

test('origin denial is request-independent and bounds slow and overloaded connections',
  { timeout: 5000 }, async () => {
    const guard = await createGateBOperatorOriginGuardForTest(0);
    const sockets = [];
    try {
      const address = getGateBOperatorOriginGuardAddress(guard);
      const observe = socket => {
        sockets.push(socket);
        const chunks = [];
        const closed = new Promise(resolve => {
          socket.once('error', () => resolve(true));
          socket.once('close', () => resolve(true));
        });
        socket.on('data', chunk => chunks.push(chunk));
        return { chunks, closed, socket };
      };

      const slow = observe(connect({ host: address.address, port: address.port }));
      await withinBound(slow.closed, 1500, 'slow denial close');
      assert.equal(Buffer.concat(slow.chunks).toString('ascii'),
        GATE_B_OPERATOR_ORIGIN_DENIAL_RESPONSE);
      for (const chunk of slow.chunks) chunk.fill(0);

      const overloaded = Array.from({ length: 40 }, () => {
        const item = observe(connect({ host: address.address, port: address.port }));
        item.socket.pause();
        return item;
      });
      await Promise.all(overloaded.map(item => new Promise(resolve => {
        if (item.socket.readyState === 'open' || item.socket.destroyed) return resolve(true);
        item.socket.once('connect', () => resolve(true));
        item.socket.once('error', () => resolve(true));
      })));
      for (const item of overloaded) item.socket.resume();
      await withinBound(Promise.all(overloaded.map(item => item.closed)),
        1500, 'overload denial close');
      const responses = overloaded.map(item => Buffer.concat(item.chunks).toString('ascii'));
      assert.equal(responses.every(value => value === '' ||
        value === GATE_B_OPERATOR_ORIGIN_DENIAL_RESPONSE), true);
      assert.equal(responses.some(value => value === ''), true);
      for (const item of overloaded) for (const chunk of item.chunks) chunk.fill(0);
    } finally {
      for (const socket of sockets) socket.destroy();
      assert.equal(await closeGateBOperatorOriginGuard(guard), true);
    }
  });

async function requestFixedOriginDenial() {
  const chunks = [];
  const socket = connect({
    host: GATE_B_OPERATOR_ORIGIN_GUARD_HOST,
    port: GATE_B_OPERATOR_ORIGIN_GUARD_PORT,
  });
  socket.on('data', chunk => chunks.push(chunk));
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('bounded timeout')), 1000);
      socket.once('close', () => {
        clearTimeout(timer);
        resolve(true);
      });
      socket.once('error', reject);
      socket.end('ignored');
    });
    const value = Buffer.concat(chunks).toString('ascii');
    assert.equal(value, GATE_B_OPERATOR_ORIGIN_DENIAL_RESPONSE);
  } finally {
    socket.destroy();
    for (const chunk of chunks) chunk.fill(0);
  }
}

test('production origin guard is byte-tied to the quick-tunnel fixed IPv4 origin', async () => {
  assert.equal(GATE_B_OPERATOR_ORIGIN_GUARD_HOST, '127.0.0.1');
  assert.equal(GATE_B_OPERATOR_ORIGIN_GUARD_PORT, 41000);
  const [guardSource, tunnelSource] = await Promise.all([
    readFile(new URL('../src/gate-b-operator-origin-guard.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/gate-b-quick-tunnel-supervisor.js', import.meta.url), 'utf8'),
  ]);
  assert.match(guardSource, /server\.listen\(\{[\s\S]*exclusive: true,[\s\S]*host: HOST,[\s\S]*port,[\s\S]*reusePort: false,/);
  assert.doesNotMatch(guardSource, /0\.0\.0\.0|::|reusePort: true/);
  assert.match(guardSource, /const MAX_CONNECTIONS = 32;/);
  assert.match(guardSource, /const RESPONSE_TIMEOUT_MS = 500;/);
  assert.doesNotMatch(guardSource, /socket\.on\(['"]data['"]|console\.|readFile|createReadStream|buyer-wallet|publishRawTransaction/);
  assert.match(tunnelSource, /const ORIGIN_PORT = 41000;/);
  assert.match(tunnelSource, /'--url', 'http:\/\/127\.0\.0\.1:41000'/);
});

test('an unrelated loopback listener rejects setup before any child can spawn',
  { timeout: 5000 }, async () => {
    const unrelated = createServer();
    await new Promise((resolve, reject) => {
      unrelated.once('error', reject);
      unrelated.listen({ host: '127.0.0.1', port: 0, exclusive: true }, resolve);
    });
    const address = unrelated.address();
    assert.equal(address && typeof address === 'object', true);
    let spawnCount = 0;
    try {
      await assert.rejects(launchGateBOperatorWatchdogSetup({
        closeOriginGuard: closeGateBOperatorOriginGuard,
        createOriginGuard: () => createGateBOperatorOriginGuardForTest(address.port),
        executable: process.execPath,
        getOriginGuardAddress: getGateBOperatorOriginGuardAddress,
        getOriginGuardHandle: getGateBOperatorOriginGuardHandle,
        killProcessGroup() {},
        observeOriginGuardFault: observeGateBOperatorOriginGuardFault,
        originGuardModule: '/private/tmp/gate-b-origin-guard-fixture.js',
        platform: 'darwin',
        probeProcessGroup: () => false,
        reaperModule: '/private/tmp/gate-b-reaper-fixture.js',
        spawnProcess() { spawnCount += 1; throw new Error('forbidden'); },
        testOnlyOriginPort: address.port,
        watchdogModule: '/private/tmp/gate-b-watchdog-fixture.js',
      }));
      assert.equal(spawnCount, 0);
    } finally {
      await new Promise(resolve => unrelated.close(() => resolve(true)));
    }
  });

function bootstrap(changes = {}) {
  return {
    acknowledgements: {
      live: GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS.live,
      operatorTrust: GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS.operatorTrust,
    },
    quickTunnel: {
      cloudflaredExecutable: '/usr/local/bin/gate-b-tunnel-fixture',
      sourcePin: GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST.executableSha256,
      telemetryAcknowledgement:
        GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS
          .ACCEPT_POSSIBLE_ERROR_TELEMETRY,
      telemetryMode:
        GATE_B_QUICK_TUNNEL_TELEMETRY_MODES.ACCEPT_POSSIBLE_ERROR_TELEMETRY,
    },
    rpcEndpoint: 'ws://192.0.2.10:35998/',
    runName: 'gate-b-operator-coordinator-fixture',
    schemaVersion: 1,
    workspaceRoot: WORKSPACE_ROOT,
    ...changes,
  };
}

function review(changes = {}) {
  return {
    acknowledgements: {
      payment: GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS.payment,
      publication: GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS.publication,
      transportException:
        GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS.transportException,
    },
    schemaVersion: 1,
    ...changes,
  };
}

function runAuthorization(changes = {}) {
  return {
    acknowledgement: GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS.run,
    schemaVersion: 1,
    ...changes,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, reject, resolve };
}

class FakeAddress {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

class FakeAsset {
  toString() { return 'zts-fixture-native-asset'; }
}

const FAKE_SDK = Object.freeze({
  Address: Object.freeze({
    parse(value) {
      if (typeof value !== 'string' || !value.startsWith('z1')) throw new Error('invalid');
      return new FakeAddress(value);
    },
  }),
  ZNN_ZTS: Object.freeze(new FakeAsset()),
});

function runConfig(changes = {}) {
  const value = {
    runnerVersion: 2,
    sourceRevision: 'a'.repeat(40),
    profileName: GATE_B_CURRENT_TESTNET_PROFILE_NAME,
    acknowledgements: {
      live: TESTNET_LIVE_ACKNOWLEDGEMENT,
      operatorTrust: GATE_B_CURRENT_TESTNET_OPERATOR_TRUST_ACKNOWLEDGEMENT,
    },
    quickTunnel: canonicalQuickTunnelBinding(),
    expectedPaymentRequired: {
      x402Version: 2,
      resource: {
        url: 'https://fixture.trycloudflare.com/paid',
        description: 'Zenon x402 PoC protected resource',
        mimeType: 'application/json',
      },
      accepts: [{
        scheme: 'exact',
        network: 'zenon:testnet',
        asset: 'zts-fixture-native-asset',
        amount: '1',
        payTo: 'z1payee-fixture',
        maxTimeoutSeconds: 60,
        extra: {
          paymentFlow: 'upfront',
          poc: true,
          settlement: 'account-block',
          zenonChain: { ...GATE_B_CURRENT_TESTNET_CHAIN_PROFILE },
        },
      }],
    },
    runtime: {
      listenPort: 41000,
      rpcTimeoutMs: 30000,
      maxRecoveryAttempts: 0,
      recoveryDelayMs: 0,
      maxRecoveryElapsedMs: 1,
    },
  };
  return Object.assign(value, changes);
}

function jsonLine(value, canonical = true) {
  return Buffer.from(`${canonical ? canonicalJson(value) : JSON.stringify(value)}\n`, 'utf8');
}

function reviewFiles(config = runConfig()) {
  const endpoint = 'ws://8.8.8.8:35998/';
  const rpc = jsonLine({ secretVersion: 2, rpcEndpoint: endpoint });
  return new Map([
    [GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerAddress, jsonLine({
      addressVersion: 1,
      address: 'z1buyer-fixture',
      accountIndex: 0,
    }, false)],
    [GATE_B_PUBLIC_WS_INPUT_LEAVES.endpointSource,
      serializeGateBProtectedEndpointSource(endpoint)],
    [GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
      serializeGateBQuickTunnelHostnameSource(
        'fixture.trycloudflare.com',
        canonicalQuickTunnelBinding(),
      )],
    [GATE_B_PUBLIC_WS_INPUT_LEAVES.payeeAddress, jsonLine({
      addressVersion: 1,
      address: 'z1payee-fixture',
      accountIndex: 1,
    })],
    [GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig, jsonLine(config)],
    [GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc, Buffer.from(rpc)],
    [GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc, Buffer.from(rpc)],
  ]);
}

function reviewHarness({ files = reviewFiles(), beforeFinalVerification } = {}) {
  const events = [];
  const versions = new Map([...files.keys()].map(name => [name, 1]));
  const records = new Map([...files.keys()].map(name => [name, Object.freeze({
    name,
    version: 1,
  })]));
  const workspace = {
    async assertAbsent(names) {
      assert.deepEqual(names, [GATE_B_PUBLIC_WS_INPUT_LEAVES.authorization]);
      events.push('authorization:absent');
    },
    assertDistinct(values) {
      assert.equal(new Set(values).size, values.length);
      events.push('distinct');
      return true;
    },
    async close() { events.push('close'); },
    async openInputs(names) {
      assert.deepEqual(names, GATE_B_OPERATOR_REVIEW_LEAVES);
      assert.equal(names.includes(GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet), false);
      events.push(...names.map(name => `open:${name}`));
      return names.map(name => records.get(name));
    },
    async read(record) {
      events.push(`read:${record.name}`);
      return Buffer.from(files.get(record.name));
    },
    async verify(record) {
      if (versions.get(record.name) !== record.version) throw new Error('changed');
      events.push(`verify:${record.name}`);
    },
  };
  const injected = {
    attestSourceTree: async () => {
      events.push('attest');
      return true;
    },
    beforeFinalVerification: beforeFinalVerification ?? (async () => {
      events.push('before-final');
    }),
    cwd: () => WORKSPACE_ROOT,
    openWorkspace: async () => workspace,
    sdk: FAKE_SDK,
    workspaceInjections: undefined,
  };
  return { events, files, injected, records, versions, workspace };
}

test('operator coordinator framing is canonical, exact, and phase-specific', () => {
  const initial = frameGateBOperatorCoordinatorBootstrap(bootstrap());
  const second = frameGateBOperatorCoordinatorReview(review());
  const third = frameGateBOperatorCoordinatorRun(runAuthorization());
  assert.deepEqual(parseGateBOperatorCoordinatorBootstrapFrame(initial), bootstrap());
  assert.deepEqual(parseGateBOperatorCoordinatorReviewFrame(second), review());
  assert.deepEqual(parseGateBOperatorCoordinatorRunFrame(third), runAuthorization());
  assert.ok(initial.length <= GATE_B_OPERATOR_COORDINATOR_LIMITS.bootstrapFrameBytes);
  assert.ok(second.length <= GATE_B_OPERATOR_COORDINATOR_LIMITS.reviewFrameBytes);
  assert.ok(third.length <= GATE_B_OPERATOR_COORDINATOR_LIMITS.runFrameBytes);

  for (const candidate of [
    initial.subarray(0, initial.length - 1),
    Buffer.concat([initial, Buffer.from([0])]),
    Buffer.from(initial).fill(0, 0, 4),
  ]) assert.throws(() => parseGateBOperatorCoordinatorBootstrapFrame(candidate));

  assert.throws(() => parseGateBOperatorCoordinatorBootstrapFrame(second));
  assert.throws(() => parseGateBOperatorCoordinatorReviewFrame(initial));
  assert.throws(() => parseGateBOperatorCoordinatorRunFrame(second));
});

test('review frame contains exactly three acknowledgements and no config-bearing fields', () => {
  for (const candidate of [
    { ...review(), runName: 'forbidden' },
    { ...review(), reviewedConfigDigest: 'b'.repeat(64) },
    { ...review(), config: {} },
  ]) assert.throws(() => frameGateBOperatorCoordinatorReview(candidate));
});

test('one non-TTY stream rejects early input and accepts three phase-gated frames', async () => {
  const earlyStream = new PassThrough();
  const earlyReader = createGateBOperatorCoordinatorFrameReader(earlyStream, {
    initialTimeoutMs: 1000,
    reviewTimeoutMs: 1000,
  });
  earlyStream.write(Buffer.concat([
    frameGateBOperatorCoordinatorBootstrap(bootstrap()),
    frameGateBOperatorCoordinatorReview(review()),
  ]));
  await assert.rejects(earlyReader.readInitial());

  const stream = new PassThrough();
  const reader = createGateBOperatorCoordinatorFrameReader(stream, {
    initialTimeoutMs: 1000,
    reviewTimeoutMs: 1000,
    runTimeoutMs: 1000,
  });
  stream.write(frameGateBOperatorCoordinatorBootstrap(bootstrap()));
  assert.deepEqual(
    parseGateBOperatorCoordinatorBootstrapFrame(await reader.readInitial()),
    bootstrap(),
  );
  reader.openReviewPhase();
  stream.write(frameGateBOperatorCoordinatorReview(review()));
  assert.deepEqual(
    parseGateBOperatorCoordinatorReviewFrame(await reader.readReview()),
    review(),
  );
  reader.openRunPhase();
  stream.end(frameGateBOperatorCoordinatorRun(runAuthorization()));
  assert.deepEqual(
    parseGateBOperatorCoordinatorRunFrame(await reader.readRun()),
    runAuthorization(),
  );
});

test('private frame stream rejects EOF, error, timeout, duplicate calls, and TTY input', async t => {
  await t.test('initial-eof', async () => {
    const stream = new PassThrough();
    const reader = createGateBOperatorCoordinatorFrameReader(stream, {
      initialTimeoutMs: 1000, reviewTimeoutMs: 1000,
    });
    stream.end(frameGateBOperatorCoordinatorBootstrap(bootstrap()).subarray(0, 7));
    await assert.rejects(reader.readInitial());
  });

  await t.test('stream-error', async () => {
    const stream = new PassThrough();
    const reader = createGateBOperatorCoordinatorFrameReader(stream, {
      initialTimeoutMs: 1000, reviewTimeoutMs: 1000,
    });
    stream.emit('error', new Error('synthetic'));
    await assert.rejects(reader.readInitial());
  });

  await t.test('initial-timeout', async () => {
    const stream = new PassThrough();
    const reader = createGateBOperatorCoordinatorFrameReader(stream, {
      initialTimeoutMs: 5, reviewTimeoutMs: 1000,
    });
    await assert.rejects(reader.readInitial());
  });

  await t.test('review-timeout', async () => {
    const stream = new PassThrough();
    const reader = createGateBOperatorCoordinatorFrameReader(stream, {
      initialTimeoutMs: 1000, reviewTimeoutMs: 5,
    });
    stream.write(frameGateBOperatorCoordinatorBootstrap(bootstrap()));
    await reader.readInitial();
    reader.openReviewPhase();
    const pending = reader.readReview();
    await assert.rejects(pending);
  });

  await t.test('duplicate-lifecycle-calls', async () => {
    const stream = new PassThrough();
    const reader = createGateBOperatorCoordinatorFrameReader(stream, {
      initialTimeoutMs: 1000, reviewTimeoutMs: 1000,
    });
    const initial = reader.readInitial();
    assert.throws(() => reader.readInitial());
    stream.write(frameGateBOperatorCoordinatorBootstrap(bootstrap()));
    await initial;
    reader.openReviewPhase();
    assert.throws(() => reader.openReviewPhase());
    const second = reader.readReview();
    assert.throws(() => reader.readReview());
    stream.write(frameGateBOperatorCoordinatorReview(review()));
    await second;
    reader.openRunPhase();
    assert.throws(() => reader.openRunPhase());
    const third = reader.readRun();
    assert.throws(() => reader.readRun());
    stream.end(frameGateBOperatorCoordinatorRun(runAuthorization()));
    await third;
  });

  await t.test('tty', () => {
    const stream = new PassThrough();
    stream.isTTY = true;
    assert.throws(() => createGateBOperatorCoordinatorFrameReader(stream, {
      initialTimeoutMs: 1000, reviewTimeoutMs: 1000,
    }));
  });
});

test('status lines remain byte exact and distinguish one pending run', () => {
  assert.deepEqual(GATE_B_OPERATOR_COORDINATOR_STATUS_LINES, {
    REVIEW_REQUIRED: 'GATE_B_CONTROLLER_REVIEW_REQUIRED_RUN_NOT_AUTHORIZED\n',
    PREFLIGHT_VALID: 'GATE_B_CONTROLLER_PREFLIGHT_VALID_RUN_NOT_AUTHORIZED\n',
    PENDING: 'GATE_B_CONTROLLER_PENDING_INDEPENDENT_VERIFICATION\n',
    CLOSED: 'GATE_B_CONTROLLER_CLOSED_RUN_NOT_EXECUTED\n',
    CLOSED_PENDING: 'GATE_B_CONTROLLER_CLOSED_PENDING_INDEPENDENT_VERIFICATION\n',
    QUARANTINED: 'GATE_B_CONTROLLER_FAILED_WORKSPACE_QUARANTINED\n',
  });
});

test('framing rejects truncation, oversize, invalid UTF-8, duplicates, and early Phase 3', async t => {
  const initial = frameGateBOperatorCoordinatorBootstrap(bootstrap());
  const second = frameGateBOperatorCoordinatorReview(review());
  const malformed = [
    initial.subarray(0, 3),
    Buffer.concat([Buffer.from([0, 0, 32, 1]), Buffer.alloc(32)]),
    Buffer.concat([Buffer.from([0, 0, 0, 2]), Buffer.from([0xc3, 0x28])]),
    (() => {
      const body = Buffer.from('{"schemaVersion":1,"schemaVersion":1}', 'utf8');
      const value = Buffer.alloc(4 + body.length);
      value.writeUInt32BE(body.length, 0);
      body.copy(value, 4);
      return value;
    })(),
    Buffer.concat([second, Buffer.from([0])]),
  ];
  for (const [index, candidate] of malformed.entries()) {
    await t.test(`malformed-${index}`, () => {
      assert.throws(() => parseGateBOperatorCoordinatorReviewFrame(candidate));
    });
  }

  await t.test('early-third-frame', async () => {
    const stream = new PassThrough();
    const reader = createGateBOperatorCoordinatorFrameReader(stream, {
      initialTimeoutMs: 1000,
      reviewTimeoutMs: 1000,
    });
    stream.write(initial);
    await reader.readInitial();
    reader.openReviewPhase();
    stream.end(Buffer.concat([second, second]));
    await assert.rejects(reader.readReview());
  });
});

test('schema rejects proxies, accessors, symbols, sparse arrays, custom prototypes, boxed values, and thenables', () => {
  const accessor = bootstrap();
  Object.defineProperty(accessor, 'runName', {
    enumerable: true,
    get: () => 'hidden',
  });
  const symbol = bootstrap();
  symbol[Symbol('extra')] = true;
  const inherited = Object.assign(Object.create({ hidden: true }), bootstrap());
  for (const candidate of [
    new Proxy(bootstrap(), {}),
    accessor,
    symbol,
    inherited,
    { ...bootstrap(), then() {} },
    new String('boxed'),
  ]) assert.throws(() => frameGateBOperatorCoordinatorBootstrap(candidate));

  const acknowledgements = [];
  acknowledgements.length = 3;
  const sparse = review({ acknowledgements });
  assert.throws(() => frameGateBOperatorCoordinatorReview(sparse));
});

test('independent reviewer opens exactly seven non-wallet leaves and returns only a private digest result', async () => {
  const context = reviewHarness();
  const result = await reviewGateBOperatorConfiguration(context.injected);
  assert.deepEqual(Object.keys(result).sort(), ['configDigest', 'resultVersion', 'type']);
  assert.equal(result.type, 'REVIEW_VALID');
  assert.equal(result.resultVersion, 1);
  assert.match(result.configDigest, /^[0-9a-f]{64}$/);
  assert.equal(
    context.events.some(value => value.includes(GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet)),
    false,
  );
  assert.equal(
    context.events.filter(value => value.startsWith('open:')).length,
    7,
  );
  assert.equal(context.events.filter(value => value === 'attest').length, 2);
  assert.equal(context.events.filter(value => value === 'authorization:absent').length, 2);
});

test('independent digest matches the normative implementation across each mutable config subtree', () => {
  const variants = [];
  const source = runConfig();
  variants.push(source);
  const revision = structuredClone(source);
  revision.sourceRevision = 'b'.repeat(40);
  variants.push(revision);
  const resource = structuredClone(source);
  resource.expectedPaymentRequired.resource.description = 'Alternate fixture description';
  variants.push(resource);
  const mime = structuredClone(source);
  mime.expectedPaymentRequired.resource.mimeType = 'application/problem+json';
  variants.push(mime);
  const route = structuredClone(source);
  route.expectedPaymentRequired.resource.url = 'https://alternate.trycloudflare.com/paid';
  variants.push(route);
  const accepted = structuredClone(source);
  accepted.expectedPaymentRequired.accepts[0].amount = '2';
  variants.push(accepted);
  const payee = structuredClone(source);
  payee.expectedPaymentRequired.accepts[0].payTo = 'z1alternate-payee-fixture';
  variants.push(payee);
  const runtime = structuredClone(source);
  runtime.runtime.listenPort = 41001;
  runtime.runtime.rpcTimeoutMs = 29999;
  runtime.runtime.maxRecoveryElapsedMs = 2;
  variants.push(runtime);
  for (const value of variants) {
    const normative = parsePublicWsOnceRunConfig(`${canonicalJson(value)}\n`);
    assert.equal(
      independentGateBOperatorConfigDigest(value),
      publicWsOnceConfigDigest(normative),
    );
  }
});

test('independent reviewer rejects every frozen semantic mutation before authorization', async t => {
  const mutations = [
    ['runner-version', value => { value.runnerVersion = 1; }],
    ['revision', value => { value.sourceRevision = 'invalid'; }],
    ['profile', value => { value.profileName = 'other'; }],
    ['live-ack', value => { value.acknowledgements.live = 'other'; }],
    ['operator-ack', value => { value.acknowledgements.operatorTrust = 'other'; }],
    ['x402-version', value => { value.expectedPaymentRequired.x402Version = 3; }],
    ['resource-url', value => { value.expectedPaymentRequired.resource.url = 'https://other.invalid/paid'; }],
    ['resource-description', value => { value.expectedPaymentRequired.resource.description = 'other'; }],
    ['resource-mime', value => { value.expectedPaymentRequired.resource.mimeType = 'text/plain'; }],
    ['offer-count', value => { value.expectedPaymentRequired.accepts.push(structuredClone(value.expectedPaymentRequired.accepts[0])); }],
    ['scheme', value => { value.expectedPaymentRequired.accepts[0].scheme = 'other'; }],
    ['network', value => { value.expectedPaymentRequired.accepts[0].network = 'other'; }],
    ['asset', value => { value.expectedPaymentRequired.accepts[0].asset = 'other'; }],
    ['amount', value => { value.expectedPaymentRequired.accepts[0].amount = '2'; }],
    ['payee', value => { value.expectedPaymentRequired.accepts[0].payTo = 'z1other'; }],
    ['timeout', value => { value.expectedPaymentRequired.accepts[0].maxTimeoutSeconds = 59; }],
    ['flow', value => { value.expectedPaymentRequired.accepts[0].extra.paymentFlow = 'other'; }],
    ['poc', value => { value.expectedPaymentRequired.accepts[0].extra.poc = false; }],
    ['settlement', value => { value.expectedPaymentRequired.accepts[0].extra.settlement = 'other'; }],
    ['chain-version', value => { value.expectedPaymentRequired.accepts[0].extra.zenonChain.version = 2; }],
    ['chain-id', value => { value.expectedPaymentRequired.accepts[0].extra.zenonChain.chainIdentifier = '0'; }],
    ['chain-anchor', value => { value.expectedPaymentRequired.accepts[0].extra.zenonChain.genesisMomentumHash = '0'.repeat(64); }],
    ['listen-port', value => { value.runtime.listenPort = 41001; }],
    ['rpc-timeout', value => { value.runtime.rpcTimeoutMs = 29999; }],
    ['recovery-attempts', value => { value.runtime.maxRecoveryAttempts = 1; }],
    ['recovery-delay', value => { value.runtime.recoveryDelayMs = 1; }],
    ['recovery-elapsed', value => { value.runtime.maxRecoveryElapsedMs = 2; }],
    ...quickTunnelBindingMutations().map(([name, mutate]) => [
      `quick-tunnel-${name}`,
      value => mutate(value.quickTunnel),
    ]),
    ['root-extra', value => { value.extra = true; }],
    ['resource-extra', value => { value.expectedPaymentRequired.resource.serviceName = 'other'; }],
    ['accepted-extra', value => { value.expectedPaymentRequired.accepts[0].other = true; }],
  ];
  for (const [name, mutate] of mutations) {
    await t.test(name, async () => {
      const config = runConfig();
      mutate(config);
      const context = reviewHarness({ files: reviewFiles(config) });
      await assert.rejects(reviewGateBOperatorConfiguration(context.injected));
      assert.equal(context.events.includes('authorization:reserved'), false);
    });
  }
});

test('review detects post-read generation change and source-attestation failure', async t => {
  await t.test('generation-change', async () => {
    let context;
    context = reviewHarness({
      beforeFinalVerification: async () => {
        context.versions.set(GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig, 2);
      },
    });
    await assert.rejects(reviewGateBOperatorConfiguration(context.injected));
  });
  await t.test('attestation-failure', async () => {
    const context = reviewHarness();
    context.injected.attestSourceTree = async () => false;
    await assert.rejects(reviewGateBOperatorConfiguration(context.injected));
  });
});

test('independent reviewer rejects cross-file mismatch, authorization presence, and record aliasing', async t => {
  const mutations = [
    ['buyer-equals-payee', files => {
      files.set(GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerAddress, jsonLine({
        addressVersion: 1, address: 'z1payee-fixture', accountIndex: 0,
      }, false));
    }],
    ['endpoint-source-mismatch', files => {
      files.set(
        GATE_B_PUBLIC_WS_INPUT_LEAVES.endpointSource,
        serializeGateBProtectedEndpointSource('ws://8.8.4.4:35998/'),
      );
    }],
    ['facilitator-rpc-mismatch', files => {
      files.set(GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc, jsonLine({
        secretVersion: 2, rpcEndpoint: 'ws://8.8.4.4:35998/',
      }));
    }],
    ['hostname-resource-mismatch', files => {
      files.set(
        GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
        serializeGateBQuickTunnelHostnameSource(
          'alternate.trycloudflare.com',
          canonicalQuickTunnelBinding(),
        ),
      );
    }],
    ['hostname-binding-mismatch', files => {
      const quickTunnel = canonicalQuickTunnelBinding();
      quickTunnel.telemetry = {
        ...GATE_B_QUICK_TUNNEL_TELEMETRY_POLICIES
          .EXTERNAL_SENTRY_EGRESS_CONTROL_ATTESTED,
      };
      files.set(
        GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
        serializeGateBQuickTunnelHostnameSource(
          'fixture.trycloudflare.com',
          quickTunnel,
        ),
      );
    }],
    ['payee-offer-mismatch', files => {
      files.set(GATE_B_PUBLIC_WS_INPUT_LEAVES.payeeAddress, jsonLine({
        addressVersion: 1, address: 'z1alternate-payee', accountIndex: 1,
      }));
    }],
    ['rpc-schema-mismatch', files => {
      files.set(GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc, jsonLine({
        secretVersion: 1, rpcEndpoint: 'ws://8.8.8.8:35998/',
      }));
    }],
  ];
  for (const [name, mutate] of mutations) {
    await t.test(name, async () => {
      const files = reviewFiles();
      mutate(files);
      const context = reviewHarness({ files });
      await assert.rejects(reviewGateBOperatorConfiguration(context.injected));
    });
  }

  await t.test('authorization-present', async () => {
    const context = reviewHarness();
    context.workspace.assertAbsent = async () => { throw new Error('present'); };
    await assert.rejects(reviewGateBOperatorConfiguration(context.injected));
  });

  await t.test('record-alias', async () => {
    const context = reviewHarness();
    const aliased = context.records.get(GATE_B_OPERATOR_REVIEW_LEAVES[0]);
    context.workspace.openInputs = async names => names.map(() => aliased);
    await assert.rejects(reviewGateBOperatorConfiguration(context.injected));
  });
});

test('in-memory independent validator rejects hostile containers without getter or thenable evaluation', () => {
  const context = {
    asset: 'zts-fixture-native-asset',
    hostname: 'fixture.trycloudflare.com',
    payee: 'z1payee-fixture',
    quickTunnel: canonicalQuickTunnelBinding(),
  };
  const accessor = runConfig();
  let reads = 0;
  Object.defineProperty(accessor, 'runtime', {
    enumerable: true,
    get() { reads += 1; return runConfig().runtime; },
  });
  for (const candidate of [
    new Proxy(runConfig(), {}),
    accessor,
    Object.assign(Object.create({ hidden: true }), runConfig()),
    { ...runConfig(), then() { reads += 1; } },
  ]) assert.throws(() => validateIndependentGateBOperatorConfig(candidate, context));
  assert.equal(reads, 0);
});

class FakeChannel extends EventEmitter {
  constructor() {
    super();
    this.sent = [];
  }

  send(message, callback) {
    this.sent.push(structuredClone(message));
    queueMicrotask(() => callback?.(null));
    if (message.type === 'REVIEW_REQUIRED') {
      setImmediate(() => this.emit('message', { type: 'REVIEW_OPEN' }));
    }
    if (message.type === 'RELEASE_ORIGIN') {
      setImmediate(() => this.emit('message', {
        ipcVersion: 1,
        requestId: 1,
        type: 'ORIGIN_RELEASED',
      }));
    }
    return true;
  }
}

function cliHarness(changes = {}) {
  const channel = new FakeChannel();
  const events = [];
  const lines = [];
  const capability = Object.freeze(Object.create(null));
  let status = 'GATE_B_CONTROLLER_REVIEW_REQUIRED_RUN_NOT_AUTHORIZED';
  let runSucceeded = false;
  let stopCalls = 0;
  let waitCalls = 0;
  const reader = Object.freeze({
    close() { events.push('reader:close'); return true; },
    openReviewPhase() { events.push('reader:review-open'); return true; },
    openRunPhase() { events.push('reader:run-open'); return true; },
    readInitial() {
      events.push('reader:initial');
      return Promise.resolve(frameGateBOperatorCoordinatorBootstrap(bootstrap()));
    },
    readReview() {
      events.push('reader:review');
      return Promise.resolve(frameGateBOperatorCoordinatorReview(review()));
    },
    readRun() {
      events.push('reader:run');
      return Promise.resolve(frameGateBOperatorCoordinatorRun(runAuthorization()));
    },
  });
  const options = {
    argv: [],
    authorizeController: async (candidate, supplied) => {
      assert.equal(candidate, capability);
      assert.deepEqual(Object.keys(supplied).sort(), [
        'acknowledgements', 'reviewedConfigDigest', 'schemaVersion',
      ]);
      events.push('controller:authorize');
      status = 'GATE_B_CONTROLLER_PREFLIGHT_VALID_RUN_NOT_AUTHORIZED';
      return status;
    },
    channel,
    createFrameReader() { return reader; },
    getControllerStatus(candidate) {
      assert.equal(candidate, capability);
      return status;
    },
    inputStream: Object.freeze({}),
    lifetimeMs: 1000,
    prepareController: async supplied => {
      assert.deepEqual(supplied, bootstrap());
      events.push('controller:prepare');
      return capability;
    },
    reviewConfiguration: async (_root, supplied) => {
      assert.equal(supplied.signal instanceof AbortSignal, true);
      events.push('review');
      return Object.freeze({
        configDigest: 'b'.repeat(64),
        resultVersion: 1,
        type: 'REVIEW_VALID',
      });
    },
    runController: async (candidate, supplied, beforeOriginBind) => {
      assert.equal(candidate, capability);
      assert.deepEqual(supplied, runAuthorization());
      events.push('controller:run');
      assert.equal(await beforeOriginBind(), true);
      events.push('controller:origin-released');
      runSucceeded = true;
      status = 'GATE_B_CONTROLLER_PENDING_INDEPENDENT_VERIFICATION';
      return status;
    },
    stderr: async line => { lines.push(['stderr', line]); return true; },
    stdout: async line => { lines.push(['stdout', line]); return true; },
    stopController: candidate => {
      assert.equal(candidate, capability);
      stopCalls += 1;
      events.push('controller:stop');
      status = runSucceeded
        ? 'GATE_B_CONTROLLER_CLOSED_PENDING_INDEPENDENT_VERIFICATION'
        : 'GATE_B_CONTROLLER_CLOSED_RUN_NOT_EXECUTED';
      return Promise.resolve(status);
    },
    waitControllerClosed: candidate => {
      assert.equal(candidate, capability);
      waitCalls += 1;
      events.push('controller:wait');
      return Promise.resolve(runSucceeded
        ? 'GATE_B_CONTROLLER_CLOSED_PENDING_INDEPENDENT_VERIFICATION'
        : 'GATE_B_CONTROLLER_CLOSED_RUN_NOT_EXECUTED');
    },
    ...changes,
  };
  return {
    channel,
    events,
    lines,
    options,
    reader,
    state: {
      get stopCalls() { return stopCalls; },
      get waitCalls() { return waitCalls; },
    },
  };
}

async function waitFor(check, timeoutMs = 250) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() <= deadline) {
    if (check()) return;
    const remainingMs = deadline - performance.now();
    if (remainingMs <= 0) break;
    await new Promise(resolve => setTimeout(resolve, Math.min(5, remainingMs)));
  }
  assert.fail('bounded condition not reached');
}

test('waitFor yields to zero and short timers without the legacy immediate seam',
  { concurrency: false }, async () => {
    const originalSetImmediate = globalThis.setImmediate;
    let immediateCalls = 0;
    globalThis.setImmediate = () => {
      immediateCalls += 1;
      throw new Error('legacy immediate seam invoked');
    };
    try {
      async function legacyWaitFor(check, attempts = 50) {
        for (let index = 0; index < attempts; index += 1) {
          if (check()) return;
          await new Promise(resolve => setImmediate(resolve));
        }
        assert.fail('bounded condition not reached');
      }

      await assert.rejects(legacyWaitFor(() => false), {
        message: 'legacy immediate seam invoked',
      });
      assert.equal(immediateCalls, 1);

      immediateCalls = 0;
      let zeroTimerFired = false;
      let shortTimerFired = false;
      setTimeout(() => { zeroTimerFired = true; }, 0);
      setTimeout(() => { shortTimerFired = true; }, 10);
      await waitFor(() => zeroTimerFired && shortTimerFired, 100);
      assert.equal(zeroTimerFired, true);
      assert.equal(shortTimerFired, true);
      assert.equal(immediateCalls, 0);
    } finally {
      globalThis.setImmediate = originalSetImmediate;
    }
  });

test('coordinator CLI retains one process across review, preflight, STOP, and exact closure', async () => {
  const context = cliHarness();
  const pending = runGateBOperatorCoordinatorCli(context.options);
  await waitFor(() => context.channel.sent.some(message =>
    message.type === 'PREFLIGHT_VALID'));
  assert.deepEqual(context.events.slice(0, 6), [
    'reader:initial',
    'controller:prepare',
    'reader:review-open',
    'reader:review',
    'review',
    'controller:authorize',
  ]);
  context.channel.emit('message', createGateBOperatorCoordinatorIpcMessage('STOP'));
  assert.equal(await pending, true);
  assert.equal(context.state.stopCalls, 1);
  assert.equal(context.state.waitCalls, 1);
  assert.deepEqual(context.lines, [
    ['stdout', GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.REVIEW_REQUIRED],
    ['stdout', GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.PREFLIGHT_VALID],
    ['stdout', GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.CLOSED],
  ]);
  assert.deepEqual(context.channel.sent.map(message => message.type), [
    'REVIEW_REQUIRED', 'REVIEW_OPENED', 'PREFLIGHT_VALID', 'STOPPED',
  ]);
});

test('coordinator CLI accepts one distinct Phase 3 only after preflight and origin release',
  async () => {
    const context = cliHarness();
    const pending = runGateBOperatorCoordinatorCli(context.options);
    await waitFor(() => context.channel.sent.some(message =>
      message.type === 'PREFLIGHT_VALID'));
    context.channel.emit('message', { type: 'RUN_OPEN' });
    await waitFor(() => context.channel.sent.some(message => message.type === 'PENDING'));
    assert.deepEqual(context.events.filter(event => event.startsWith('controller:') ||
      event === 'reader:run-open' || event === 'reader:run'), [
      'controller:prepare',
      'controller:authorize',
      'reader:run-open',
      'reader:run',
      'controller:run',
      'controller:origin-released',
    ]);
    context.channel.emit('message', createGateBOperatorCoordinatorIpcMessage('STOP'));
    assert.equal(await pending, true);
    assert.deepEqual(context.lines, [
      ['stdout', GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.REVIEW_REQUIRED],
      ['stdout', GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.PREFLIGHT_VALID],
      ['stdout', GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.PENDING],
      ['stdout', GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.CLOSED_PENDING],
    ]);
    assert.deepEqual(context.channel.sent.map(message => message.type), [
      'REVIEW_REQUIRED', 'REVIEW_OPENED', 'PREFLIGHT_VALID', 'RUN_OPENED',
      'RELEASE_ORIGIN', 'PENDING', 'STOPPED',
    ]);
  });

test('STOP during review, authorize, and synchronous prepare reentrancy disables later actions', async t => {
  await t.test('review', async () => {
    const entered = deferred();
    const held = deferred();
    const context = cliHarness({
      reviewConfiguration() {
        entered.resolve(true);
        return held.promise;
      },
    });
    const pending = runGateBOperatorCoordinatorCli(context.options);
    await entered.promise;
    context.channel.emit('message', createGateBOperatorCoordinatorIpcMessage('STOP'));
    held.resolve(Object.freeze({
      configDigest: 'b'.repeat(64), resultVersion: 1, type: 'REVIEW_VALID',
    }));
    assert.equal(await pending, true);
    assert.equal(context.events.includes('controller:authorize'), false);
    assert.equal(context.state.stopCalls, 1);
    assert.equal(context.state.waitCalls, 1);
  });

  await t.test('authorize', async () => {
    const entered = deferred();
    const held = deferred();
    const context = cliHarness({
      authorizeController() {
        entered.resolve(true);
        return held.promise;
      },
    });
    const pending = runGateBOperatorCoordinatorCli(context.options);
    await entered.promise;
    context.channel.emit('message', createGateBOperatorCoordinatorIpcMessage('STOP'));
    held.resolve('GATE_B_CONTROLLER_FAILED_WORKSPACE_QUARANTINED');
    assert.equal(await pending, true);
    assert.equal(context.state.stopCalls, 1);
    assert.equal(context.state.waitCalls, 1);
  });

  await t.test('synchronous-prepare-reentrancy', async () => {
    let context;
    context = cliHarness({
      prepareController() {
        context.channel.emit('message', createGateBOperatorCoordinatorIpcMessage('STOP'));
        return Promise.resolve(Object.freeze(Object.create(null)));
      },
      getControllerStatus: () => 'GATE_B_CONTROLLER_REVIEW_REQUIRED_RUN_NOT_AUTHORIZED',
      stopController: () => Promise.resolve('GATE_B_CONTROLLER_CLOSED_RUN_NOT_EXECUTED'),
      waitControllerClosed: () => Promise.resolve('GATE_B_CONTROLLER_CLOSED_RUN_NOT_EXECUTED'),
    });
    assert.equal(await runGateBOperatorCoordinatorCli(context.options), true);
    assert.equal(context.events.includes('review'), false);
  });
});

test('coordinator process termination and disconnect controls stop and wait exactly once', async t => {
  for (const event of ['SIGTERM', 'SIGINT', 'disconnect']) {
    await t.test(event, async () => {
      const entered = deferred();
      const held = deferred();
      const context = cliHarness({
        reviewConfiguration() {
          entered.resolve(true);
          return held.promise;
        },
      });
      const pending = runGateBOperatorCoordinatorCli(context.options);
      await entered.promise;
      context.channel.emit(event);
      held.resolve(Object.freeze({
        configDigest: 'b'.repeat(64), resultVersion: 1, type: 'REVIEW_VALID',
      }));
      const clean = await pending;
      assert.equal(clean, event === 'disconnect' ? false : true);
      assert.equal(context.events.includes('controller:authorize'), false);
      assert.equal(context.state.stopCalls, 1);
      assert.equal(context.state.waitCalls, 1);
      assert.equal(context.channel.listenerCount(event), 0);
    });
  }
});

test('coordinator rejects hostile thenables without evaluating then and emits fixed quarantine only', async () => {
  let reads = 0;
  const hostile = {};
  Object.defineProperty(hostile, 'then', {
    get() { reads += 1; return () => {}; },
  });
  const context = cliHarness({ prepareController: () => hostile });
  assert.equal(await runGateBOperatorCoordinatorCli(context.options), false);
  assert.equal(reads, 0);
  assert.deepEqual(context.lines, [[
    'stderr', GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.QUARANTINED,
  ]]);
  assert.deepEqual(context.channel.sent.map(message => message.type), ['QUARANTINED']);
});

test('coordinator opens frame two only after the fixed line, enum, and private barrier',
  async () => {
  const context = cliHarness();
  const original = context.reader;
  context.options.createFrameReader = () => Object.freeze({
    close: original.close,
    readInitial: original.readInitial,
    readReview: original.readReview,
    readRun: original.readRun,
    openReviewPhase() {
      assert.deepEqual(context.lines, [[
        'stdout', GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.REVIEW_REQUIRED,
      ]]);
      assert.deepEqual(context.channel.sent.map(message => message.type), ['REVIEW_REQUIRED']);
      return original.openReviewPhase();
    },
    openRunPhase: original.openRunPhase,
  });
  const pending = runGateBOperatorCoordinatorCli(context.options);
  await waitFor(() => context.channel.sent.some(message =>
    message.type === 'PREFLIGHT_VALID'));
  context.channel.emit('message', createGateBOperatorCoordinatorIpcMessage('STOP'));
  assert.equal(await pending, true);
});

test('review phase opens before the private barrier acknowledgement callback settles',
  async () => {
    const input = new PassThrough();
    const lifecycleEntered = deferred();
    const lifecycleReleased = deferred();
    const acknowledgementEntered = deferred();
    const acknowledgementReleased = deferred();
    const channel = new FakeChannel();
    channel.send = function send(message, callback) {
      this.sent.push(structuredClone(message));
      if (message.type === 'REVIEW_REQUIRED') {
        lifecycleEntered.resolve(true);
        void lifecycleReleased.promise.then(() => callback?.(null));
      } else if (message.type === 'REVIEW_OPENED') {
        acknowledgementEntered.resolve(true);
        void acknowledgementReleased.promise.then(() => callback?.(null));
      } else {
        queueMicrotask(() => callback?.(null));
      }
      return true;
    };
    const context = cliHarness({
      channel,
      createFrameReader: stream => createGateBOperatorCoordinatorFrameReader(stream),
      inputStream: input,
    });
    const pending = runGateBOperatorCoordinatorCli(context.options);
    input.write(frameGateBOperatorCoordinatorBootstrap(bootstrap()));
    await lifecycleEntered.promise;
    channel.emit('message', { type: 'REVIEW_OPEN' });
    await acknowledgementEntered.promise;
    input.write(frameGateBOperatorCoordinatorReview(review()));
    await new Promise(resolve => setImmediate(resolve));
    lifecycleReleased.resolve(true);
    acknowledgementReleased.resolve(true);
    await waitFor(() => channel.sent.some(message =>
      message.type === 'PREFLIGHT_VALID' || message.type === 'QUARANTINED'));
    if (channel.sent.some(message => message.type === 'PREFLIGHT_VALID')) {
      channel.emit('message', createGateBOperatorCoordinatorIpcMessage('STOP'));
    }
    assert.equal(await pending, true);
    assert.deepEqual(channel.sent.map(message => message.type), [
      'REVIEW_REQUIRED', 'REVIEW_OPENED', 'PREFLIGHT_VALID', 'STOPPED',
    ]);
  });

test('post-review mismatch and malformed control quarantine without preflight authority', async t => {
  await t.test('digest-mismatch', async () => {
    const context = cliHarness({
      authorizeController: async () => {
        context.events.push('controller:authorize-mismatch');
        return 'GATE_B_CONTROLLER_FAILED_WORKSPACE_QUARANTINED';
      },
    });
    assert.equal(await runGateBOperatorCoordinatorCli(context.options), false);
    assert.equal(context.lines.some(([, line]) =>
      line === GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.PREFLIGHT_VALID), false);
    assert.equal(context.state.stopCalls, 1);
    assert.equal(context.state.waitCalls, 1);
  });

  await t.test('malformed-control-during-review', async () => {
    const entered = deferred();
    const held = deferred();
    const context = cliHarness({
      reviewConfiguration() {
        entered.resolve(true);
        return held.promise;
      },
    });
    const pending = runGateBOperatorCoordinatorCli(context.options);
    await entered.promise;
    context.channel.emit('message', { ipcVersion: 1, type: 'UNEXPECTED' });
    held.resolve(Object.freeze({
      configDigest: 'b'.repeat(64), resultVersion: 1, type: 'REVIEW_VALID',
    }));
    assert.equal(await pending, false);
    const sentBeforeLateEvent = context.channel.sent.length;
    context.channel.emit('message', createGateBOperatorCoordinatorIpcMessage('STOP'));
    assert.equal(context.channel.sent.length, sentBeforeLateEvent);
    assert.equal(context.events.includes('controller:authorize'), false);
  });
});

test('review child emits only enum lifecycle and one private result frame', async () => {
  const channel = new FakeChannel();
  const frames = [];
  const pending = runGateBOperatorConfigReviewChild({
    channel,
    review: () => Promise.resolve(Object.freeze({
      configDigest: 'b'.repeat(64), resultVersion: 1, type: 'REVIEW_VALID',
    })),
    writeResult: frame => {
      frames.push(Buffer.from(frame));
      return Promise.resolve(true);
    },
  });
  await waitFor(() => channel.sent.some(message => message.type === 'READY'));
  channel.emit('message', { ipcVersion: 1, type: 'REVIEW' });
  assert.equal(await pending, true);
  assert.deepEqual(channel.sent.map(message => message.type), ['READY', 'REVIEWED']);
  assert.equal(frames.length, 1);
  assert.equal(parseGateBOperatorReviewResultFrame(frames[0]).type, 'REVIEW_VALID');
  frames[0].fill(0);
});

test('review child STOP and malformed lifecycle prevent late result publication', async t => {
  await t.test('stop-during-review', async () => {
    const channel = new FakeChannel();
    const held = deferred();
    let writes = 0;
    const pending = runGateBOperatorConfigReviewChild({
      channel,
      review: () => held.promise,
      writeResult: () => { writes += 1; return Promise.resolve(true); },
    });
    await waitFor(() => channel.sent.some(message => message.type === 'READY'));
    channel.emit('message', { ipcVersion: 1, type: 'REVIEW' });
    channel.emit('message', { ipcVersion: 1, type: 'STOP' });
    assert.equal(await pending, true);
    held.resolve(Object.freeze({
      configDigest: 'b'.repeat(64), resultVersion: 1, type: 'REVIEW_VALID',
    }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(writes, 0);
    assert.deepEqual(channel.sent.map(message => message.type), ['READY', 'STOPPED']);
  });

  await t.test('duplicate-review', async () => {
    const channel = new FakeChannel();
    const held = deferred();
    const pending = runGateBOperatorConfigReviewChild({
      channel,
      review: () => held.promise,
      writeResult: () => Promise.resolve(true),
    });
    await waitFor(() => channel.sent.some(message => message.type === 'READY'));
    channel.emit('message', { ipcVersion: 1, type: 'REVIEW' });
    channel.emit('message', { ipcVersion: 1, type: 'REVIEW' });
    assert.equal(await pending, false);
    held.resolve(Object.freeze({
      configDigest: 'b'.repeat(64), resultVersion: 1, type: 'REVIEW_VALID',
    }));
  });

  await t.test('hostile-thenable', async () => {
    const channel = new FakeChannel();
    let reads = 0;
    const hostile = {};
    Object.defineProperty(hostile, 'then', {
      get() { reads += 1; return () => {}; },
    });
    const pending = runGateBOperatorConfigReviewChild({
      channel,
      review: () => hostile,
      writeResult: () => Promise.resolve(true),
    });
    await waitFor(() => channel.sent.some(message => message.type === 'READY'));
    channel.emit('message', { ipcVersion: 1, type: 'REVIEW' });
    assert.equal(await pending, false);
    assert.equal(reads, 0);
  });
});

function fakeReviewChild(mode = 'success') {
  const child = new EventEmitter();
  child.pid = 41001;
  child.connected = true;
  child.channel = Object.freeze({ close() {}, unref() {} });
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const result = new PassThrough();
  child.stdio = [null, child.stdout, child.stderr, null, result];
  child.kill = signal => {
    child.signals ??= [];
    child.signals.push(signal);
    return true;
  };
  child.disconnect = () => { child.connected = false; child.emit('disconnect'); };
  child.send = (message, callback) => {
    queueMicrotask(() => callback?.(null));
    if (message.type === 'REVIEW') {
      queueMicrotask(() => {
        if (mode === 'noise') {
          child.stdout.write('noise');
          return;
        }
        if (mode === 'malformed') {
          child.emit('message', { ipcVersion: 1, type: 'OTHER' });
          return;
        }
        if (mode === 'duplicate-ready') {
          child.emit('message', { ipcVersion: 1, type: 'READY' });
          return;
        }
        if (mode === 'overflow') {
          result.end(Buffer.alloc(GATE_B_OPERATOR_COORDINATOR_LIMITS.resultFrameBytes + 1));
          return;
        }
        const frame = frameGateBOperatorReviewResult({
          configDigest: 'b'.repeat(64),
          resultVersion: 1,
          type: 'REVIEW_VALID',
        });
        if (mode === 'trailing-result') result.end(Buffer.concat([frame, frame]));
        else if (mode !== 'missing-result-eof') result.end(frame);
        else result.write(frame);
        child.emit('message', mode === 'wrong-enum'
          ? createGateBOperatorCoordinatorIpcMessage('STOP')
          : { ipcVersion: 1, type: 'REVIEWED' });
        if (mode === 'wrong-enum') return;
        if (mode === 'duplicate-reviewed') {
          child.emit('message', { ipcVersion: 1, type: 'REVIEWED' });
          return;
        }
        if (mode === 'missing-close') return;
        setImmediate(() => {
          const code = mode === 'nonzero' ? 1 : 0;
          child.emit('exit', code, null);
          child.emit('close', code, null);
        });
      });
    }
    return true;
  };
  queueMicrotask(() => {
    if (mode === 'early-result') result.write(frameGateBOperatorReviewResult({
      configDigest: 'b'.repeat(64), resultVersion: 1, type: 'REVIEW_VALID',
    }));
    child.emit('message', { ipcVersion: 1, type: 'READY' });
  });
  return child;
}

test('review-child launcher requires a single private result frame, exact enum, clean exit, and silence', async t => {
  await t.test('success', async () => {
    const child = fakeReviewChild();
    const result = await launchGateBOperatorConfigReview(WORKSPACE_ROOT, {
      childModule: '/private/tmp/gate-b-review-fixture.js',
      forkProcess: () => child,
      signal: new AbortController().signal,
      timeoutMs: 1000,
    });
    assert.equal(result.type, 'REVIEW_VALID');
  });
  for (const mode of [
    'noise', 'malformed', 'wrong-enum', 'nonzero', 'duplicate-ready',
    'duplicate-reviewed', 'early-result', 'overflow', 'trailing-result',
    'missing-result-eof', 'missing-close',
  ]) {
    await t.test(mode, async () => {
      const child = fakeReviewChild(mode);
      await assert.rejects(launchGateBOperatorConfigReview(WORKSPACE_ROOT, {
        childModule: '/private/tmp/gate-b-review-fixture.js',
        forkProcess: () => child,
        signal: new AbortController().signal,
        timeoutMs: mode === 'missing-close' ? 20 : 1000,
      }));
    });
  }

  await t.test('abort', async () => {
    const child = fakeReviewChild('missing-close');
    const controller = new AbortController();
    const pending = launchGateBOperatorConfigReview(WORKSPACE_ROOT, {
      childModule: '/private/tmp/gate-b-review-fixture.js',
      forkProcess: () => child,
      signal: controller.signal,
      timeoutMs: 1000,
    });
    controller.abort();
    await assert.rejects(pending);
  });

  await t.test('hostile-signal-getter', () => {
    let reads = 0;
    const hostile = {
      addEventListener() {},
      removeEventListener() {},
      get aborted() { reads += 1; return false; },
    };
    assert.throws(() => launchGateBOperatorConfigReview(WORKSPACE_ROOT, {
      childModule: '/private/tmp/gate-b-review-fixture.js',
      forkProcess: () => fakeReviewChild(),
      signal: hostile,
      timeoutMs: 1000,
    }));
    assert.equal(reads, 0);
  });
});

function fakeCoordinatorProcess(changes = {}) {
  const child = new EventEmitter();
  child.pid = 42001;
  child.connected = true;
  child.channel = Object.freeze({ close() {}, unref() {} });
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const privatePipe = new PassThrough();
  const lifetimePipe = new PassThrough();
  child.stdio = [null, child.stdout, child.stderr, privatePipe, null, lifetimePipe];
  child.disconnect = () => { child.connected = false; };
  child.unref = () => {};
  let inputPhase = 0;
  let pendingRun = false;
  privatePipe.on('data', chunk => {
    if (inputPhase === 0) {
      parseGateBOperatorCoordinatorBootstrapFrame(chunk);
      inputPhase = 1;
      queueMicrotask(() => {
        child.stdout.write(GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.REVIEW_REQUIRED);
        child.emit('message', createGateBOperatorCoordinatorIpcMessage('REVIEW_REQUIRED'));
      });
    } else if (inputPhase === 1) {
      parseGateBOperatorCoordinatorReviewFrame(chunk);
      inputPhase = 2;
      queueMicrotask(() => {
        child.stdout.write(GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.PREFLIGHT_VALID);
        child.emit('message', createGateBOperatorCoordinatorIpcMessage('PREFLIGHT_VALID'));
      });
    } else {
      parseGateBOperatorCoordinatorRunFrame(chunk);
      inputPhase = 3;
      queueMicrotask(() => child.emit('message',
        createGateBOperatorOriginReleaseIpcMessage(
          GATE_B_OPERATOR_ORIGIN_RELEASE_IPC_TYPES.RELEASE_ORIGIN,
        )));
    }
  });
  child.send = (message, callback) => {
    if (message.type === 'ORIGIN_RELEASED' &&
        changes.ambiguousOriginReleaseAcknowledgement === true) {
      setImmediate(() => {
        pendingRun = true;
        child.stdout.write(GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.PENDING);
        child.emit('message', createGateBOperatorCoordinatorIpcMessage('PENDING'));
        callback?.(new Error('fixture'));
      });
      return true;
    }
    queueMicrotask(() => callback?.(null));
    if (message.type === 'REVIEW_OPEN') {
      setImmediate(() => child.emit('message', { type: 'REVIEW_OPENED' }));
    }
    if (message.type === 'RUN_OPEN') {
      setImmediate(() => child.emit('message', { type: 'RUN_OPENED' }));
    }
    if (message.type === 'ORIGIN_RELEASED') {
      setImmediate(() => {
        pendingRun = true;
        child.stdout.write(GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.PENDING);
        child.emit('message', createGateBOperatorCoordinatorIpcMessage('PENDING'));
      });
    }
    if (message.type === 'STOP') {
      queueMicrotask(() => {
        child.stdout.write(pendingRun
          ? GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.CLOSED_PENDING
          : GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.CLOSED);
        child.emit('message', createGateBOperatorCoordinatorIpcMessage('STOPPED'));
        child.emit('exit', 0, null);
        child.emit('close', 0, null);
      });
    }
    return true;
  };
  return child;
}

function fakeSiblingOwnerProcesses(changes = {}) {
  const events = [];
  const emitted = [];
  const alive = new Map([[43001, true], [43002, true], [43003, true]]);
  const originGuard = Object.freeze(Object.create(null));
  const originHandle = new EventEmitter();
  const originAddress = Object.freeze({ address: '127.0.0.1', family: 'IPv4', port: 41000 });
  let originFault;
  let outerGuardClosed = false;
  const watchdog = new EventEmitter();
  watchdog.pid = 43001;
  watchdog.connected = true;
  watchdog.channel = Object.freeze({ close() {}, unref() {} });
  watchdog.stdout = new PassThrough();
  watchdog.stderr = new PassThrough();
  const startPipe = new PassThrough();
  const protocolPipe = new PassThrough();
  const watchdogLifetime = new PassThrough();
  watchdog.stdio = [
    null, watchdog.stdout, watchdog.stderr, startPipe, protocolPipe, watchdogLifetime, null,
  ];
  watchdog.disconnect = () => { watchdog.connected = false; };
  watchdog.unref = () => {};

  const reaper = new EventEmitter();
  reaper.pid = 43002;
  reaper.connected = true;
  reaper.channel = Object.freeze({ close() {}, unref() {} });
  const targetPipe = new PassThrough();
  const reaperLifetime = new PassThrough();
  reaper.stdio = [null, null, null, targetPipe, reaperLifetime, null, null];
  reaper.disconnect = () => { reaper.connected = false; };
  reaper.unref = () => {};

  const guard = new EventEmitter();
  guard.pid = 43003;
  guard.connected = true;
  guard.channel = Object.freeze({ close() {}, unref() {} });
  const guardTargetPipe = new PassThrough();
  const guardOuterLifetime = new PassThrough();
  const guardReaperLifetime = new PassThrough();
  guard.stdio = [
    null, null, null, guardTargetPipe, guardOuterLifetime, guardReaperLifetime, null,
  ];
  guard.disconnect = () => { guard.connected = false; };
  guard.unref = () => {};
  if (changes.recordTargetCallback === true) {
    const targetEnd = targetPipe.end;
    targetPipe.end = function end(chunk, callback) {
      return Reflect.apply(targetEnd, this, [chunk, error => {
        if (changes.holdTargetCallback === true) {
          events.push('TARGET_CALLBACK_HELD');
          changes.releaseTargetCallback = () => {
            events.push('TARGET_CALLBACK');
            callback?.(error);
          };
        } else {
          events.push('TARGET_CALLBACK');
          callback?.(error);
        }
      }]);
    };
  }

  let startBytes = Buffer.alloc(0);
  startPipe.on('data', chunk => {
    startBytes = Buffer.concat([startBytes, chunk]);
    chunk.fill(0);
  });
  startPipe.on('end', () => {
    events.push('START');
    assert.equal(startBytes.length, 4);
    assert.equal(startBytes.readUInt32BE(0), 0x47425354);
    startBytes.fill(0);
    queueMicrotask(() => {
      emitted.push({ source: 'watchdog', value: { type: 'STARTED' } });
      watchdog.emit('message', { type: 'STARTED' });
    });
  });

  let protocolPhase = 0;
  let pendingRun = false;
  protocolPipe.on('data', chunk => {
    if (protocolPhase === 0) {
      events.push('BOOTSTRAP');
      parseGateBOperatorCoordinatorBootstrapFrame(chunk);
      protocolPhase = 1;
      queueMicrotask(() => {
        watchdog.stdout.write(GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.REVIEW_REQUIRED);
        const value = createGateBOperatorCoordinatorIpcMessage('REVIEW_REQUIRED');
        emitted.push({ source: 'watchdog', value });
        watchdog.emit('message', value);
      });
    } else if (protocolPhase === 1) {
      events.push('REVIEW');
      parseGateBOperatorCoordinatorReviewFrame(chunk);
      protocolPhase = 2;
      queueMicrotask(() => {
        watchdog.stdout.write(GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.PREFLIGHT_VALID);
        const value = createGateBOperatorCoordinatorIpcMessage('PREFLIGHT_VALID');
        emitted.push({ source: 'watchdog', value });
        watchdog.emit('message', value);
      });
    } else {
      events.push('RUN');
      parseGateBOperatorCoordinatorRunFrame(chunk);
      protocolPhase = 3;
      queueMicrotask(() => {
        const value = createGateBOperatorOriginReleaseIpcMessage(
          GATE_B_OPERATOR_ORIGIN_RELEASE_IPC_TYPES.RELEASE_ORIGIN,
        );
        emitted.push({ source: 'watchdog', value });
        watchdog.emit('message', value);
      });
    }
  });

  let targetBytes = Buffer.alloc(0);
  let reaperTargetAccepted = false;
  let reaperHandleAccepted = false;
  const maybeReaperReady = () => {
    if (!reaperTargetAccepted || !reaperHandleAccepted || changes.reaperReady === false) return;
    queueMicrotask(() => {
      emitted.push({ source: 'reaper', value: { type: 'READY' } });
      reaper.emit('message', { type: 'READY' });
    });
  };
  targetPipe.on('data', chunk => {
    targetBytes = Buffer.concat([targetBytes, chunk]);
    chunk.fill(0);
  });
  targetPipe.on('end', () => {
    events.push('TARGET');
    assert.equal(targetBytes.length, 8);
    assert.equal(targetBytes.readUInt32BE(0), 0x47425250);
    assert.equal(targetBytes.readUInt32BE(4), watchdog.pid);
    targetBytes.fill(0);
    reaperTargetAccepted = true;
    if (changes.publicBeforeReady === true) queueMicrotask(() => {
      watchdog.stdout.write(GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.REVIEW_REQUIRED);
      watchdog.emit('message', createGateBOperatorCoordinatorIpcMessage('REVIEW_REQUIRED'));
    });
    maybeReaperReady();
  });

  let guardTargetBytes = Buffer.alloc(0);
  let guardTargetAccepted = false;
  let guardHandleAccepted = false;
  const maybeGuardReady = () => {
    if (!guardTargetAccepted || !guardHandleAccepted || changes.guardReady === false) return;
    queueMicrotask(() => {
      emitted.push({ source: 'guard', value: { type: 'READY' } });
      guard.emit('message', { type: 'READY' });
    });
  };
  guardTargetPipe.on('data', chunk => {
    guardTargetBytes = Buffer.concat([guardTargetBytes, chunk]);
    chunk.fill(0);
  });
  guardTargetPipe.on('end', () => {
    events.push('GUARD_TARGET');
    assert.equal(guardTargetBytes.length, 8);
    assert.equal(guardTargetBytes.readUInt32BE(0), 0x47424f47);
    assert.equal(guardTargetBytes.readUInt32BE(4), watchdog.pid);
    guardTargetBytes.fill(0);
    guardTargetAccepted = true;
    maybeGuardReady();
  });

  watchdog.send = (message, callback) => {
    events.push(`WATCHDOG_${message.type}`);
    if (message.type === 'ORIGIN_RELEASED') {
      queueMicrotask(() => {
        events.push('WATCHDOG_ORIGIN_RELEASED_CALLBACK');
        callback?.(null);
      });
      setImmediate(() => {
        pendingRun = true;
        events.push('WATCHDOG_PENDING');
        watchdog.stdout.write(GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.PENDING);
        const value = createGateBOperatorCoordinatorIpcMessage('PENDING');
        emitted.push({ source: 'watchdog', value });
        watchdog.emit('message', value);
      });
      return true;
    }
    queueMicrotask(() => callback?.(null));
    if (message.type === 'BOOTSTRAP_OPEN' || message.type === 'REVIEW_OPEN' ||
        message.type === 'RUN_OPEN') {
      const allowed = message.type === 'BOOTSTRAP_OPEN'
        ? changes.bootstrapOpenAck !== false
        : message.type === 'REVIEW_OPEN'
          ? changes.reviewOpenAck !== false
          : changes.runOpenAck !== false;
      if (allowed) setImmediate(() => {
        watchdog.emit('message', { type: `${message.type}ED` });
        if (changes.duplicateOpenAck === message.type) {
          watchdog.emit('message', { type: `${message.type}ED` });
        }
      });
    }
    if (message.type === 'STOP' && changes.watchdogHang !== true) {
      setTimeout(() => {
        if (changes.exitBeforeFinalProtocol === true) {
          alive.set(watchdog.pid, false);
          watchdog.emit('exit', 0, null);
        }
        watchdog.stdout.write(pendingRun
          ? GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.CLOSED_PENDING
          : GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.CLOSED);
        const value = createGateBOperatorCoordinatorIpcMessage('STOPPED');
        emitted.push({ source: 'watchdog', value });
        watchdog.emit('message', value);
        if (changes.exitBeforeFinalProtocol !== true) {
          alive.set(watchdog.pid, false);
          watchdog.emit('exit', 0, null);
        }
        if (changes.holdWatchdogClose === true) {
          changes.releaseWatchdogClose = () => watchdog.emit('close', 0, null);
        } else {
          watchdog.emit('close', 0, null);
        }
      }, 0);
    }
    return true;
  };
  reaper.send = (message, handleOrCallback, options, transferCallback) => {
    const callback = typeof handleOrCallback === 'function'
      ? handleOrCallback
      : transferCallback;
    events.push(`REAPER_${message.type}`);
    if (message.type === 'ARM_ORIGIN_GUARD') {
      assert.equal(handleOrCallback, originHandle);
      assert.deepEqual(options, { keepOpen: true });
      reaperHandleAccepted = true;
      const finish = () => callback?.(changes.reaperHandleError ? new Error('fixture') : null);
      if (changes.holdReaperHandleCallback === true) {
        changes.releaseReaperHandleCallback = finish;
      } else queueMicrotask(finish);
      maybeReaperReady();
      return true;
    }
    queueMicrotask(() => callback?.(null));
    if (message.type === 'RELEASE_ORIGIN') {
      const mode = changes.reaperOriginReleaseAcknowledgement ?? 'valid';
      if (mode !== 'missing') setImmediate(() => {
        if (mode === 'malformed') {
          events.push('REAPER_ORIGIN_RELEASE_MALFORMED');
          reaper.emit('message', { ipcVersion: 1, requestId: 1, type: 'MALFORMED' });
          return;
        }
        events.push('REAPER_ORIGIN_RELEASED_ACK');
        const value = createGateBOperatorOriginReleaseIpcMessage(
          GATE_B_OPERATOR_ORIGIN_RELEASE_IPC_TYPES.ORIGIN_RELEASED,
        );
        emitted.push({ source: 'reaper', value });
        reaper.emit('message', value);
        if (mode === 'duplicate') {
          events.push('REAPER_ORIGIN_RELEASED_DUPLICATE');
          reaper.emit('message', value);
        }
      });
      return true;
    }
    if (message.type === 'CLEANUP' && changes.reaperHang !== true) {
      setTimeout(() => {
        if (changes.falseAbsent !== true && alive.get(watchdog.pid) === true) {
          alive.set(watchdog.pid, false);
          watchdog.emit('exit', null, 'SIGTERM');
          watchdog.emit('close', null, 'SIGTERM');
        }
        emitted.push({ source: 'reaper', value: { type: 'ABSENT' } });
        reaper.emit('message', { type: 'ABSENT' });
        alive.set(reaper.pid, false);
        reaper.emit('exit', 0, null);
        reaper.emit('close', 0, null);
      }, 0);
    }
    return true;
  };
  guard.send = (message, handleOrCallback, options, transferCallback) => {
    const callback = typeof handleOrCallback === 'function'
      ? handleOrCallback
      : transferCallback;
    events.push(`GUARD_${message.type}`);
    if (message.type === 'ARM_ORIGIN_GUARD') {
      assert.equal(handleOrCallback, originHandle);
      assert.deepEqual(options, { keepOpen: true });
      guardHandleAccepted = true;
      const finish = () => callback?.(changes.guardHandleError ? new Error('fixture') : null);
      if (changes.holdGuardHandleCallback === true) {
        changes.releaseGuardHandleCallback = finish;
      } else queueMicrotask(finish);
      maybeGuardReady();
      return true;
    }
    queueMicrotask(() => callback?.(null));
    if (message.type === 'RELEASE_ORIGIN') {
      const mode = changes.guardOriginReleaseAcknowledgement ?? 'valid';
      if (mode !== 'missing') setImmediate(() => {
        if (mode === 'malformed') {
          events.push('GUARD_ORIGIN_RELEASE_MALFORMED');
          guard.emit('message', { ipcVersion: 1, requestId: 1, type: 'MALFORMED' });
          return;
        }
        events.push('GUARD_ORIGIN_RELEASED_ACK');
        const value = createGateBOperatorOriginReleaseIpcMessage(
          GATE_B_OPERATOR_ORIGIN_RELEASE_IPC_TYPES.ORIGIN_RELEASED,
        );
        emitted.push({ source: 'guard', value });
        guard.emit('message', value);
        if (mode === 'duplicate') {
          events.push('GUARD_ORIGIN_RELEASED_DUPLICATE');
          guard.emit('message', value);
        }
      });
      return true;
    }
    if (message.type === 'CLEANUP' && changes.guardHang !== true) {
      setTimeout(() => {
        emitted.push({ source: 'guard', value: { type: 'ABSENT' } });
        guard.emit('message', { type: 'ABSENT' });
        alive.set(guard.pid, false);
        guard.emit('exit', 0, null);
        guard.emit('close', 0, null);
      }, 0);
    }
    return true;
  };

  const spawnCalls = [];
  return {
    alive,
    closeOriginGuard: async candidate => {
      assert.equal(candidate, originGuard);
      if (outerGuardClosed) return true;
      events.push('OUTER_GUARD_CLOSE');
      if (changes.outerGuardCloseReject === true) throw new Error('fixture');
      if (changes.outerGuardCloseFailure === true) return false;
      outerGuardClosed = true;
      return true;
    },
    createOriginGuard: async () => {
      events.push('BIND_ORIGIN');
      if (changes.originBindFailure) throw new Error('fixture');
      return originGuard;
    },
    emitted,
    events,
    getOriginGuardAddress(candidate) {
      assert.equal(candidate, originGuard);
      return originAddress;
    },
    getOriginGuardHandle(candidate) {
      assert.equal(candidate, originGuard);
      return originHandle;
    },
    guard,
    originGuard,
    originHandle,
    observeOriginGuardFault(candidate, listener) {
      assert.equal(candidate, originGuard);
      originFault = listener;
      return () => { if (originFault === listener) originFault = undefined; };
    },
    triggerOriginFault() { originFault?.(); },
    reaper,
    spawnCalls,
    spawnProcess(executable, args, options) {
      spawnCalls.push({ executable, args, options });
      return spawnCalls.length === 1 ? watchdog : spawnCalls.length === 2 ? guard : reaper;
    },
    terminate(groupId, signal) {
      events.push(`SIGNAL_${groupId}_${signal}`);
      if (alive.get(groupId) !== true) return;
      if (groupId === reaper.pid && signal === 'SIGTERM' && changes.ignoreReaperTerm) return;
      if (groupId === watchdog.pid && signal === 'SIGTERM' && changes.ignoreWatchdogTerm) return;
      if (groupId === guard.pid && signal === 'SIGTERM' && changes.ignoreGuardTerm) return;
      alive.set(groupId, false);
      const child = groupId === watchdog.pid ? watchdog :
        groupId === reaper.pid ? reaper : guard;
      child.emit('exit', null, signal);
      child.emit('close', null, signal);
    },
    watchdog,
  };
}

function fakeSiblingOwnerOptions(fixture, changes = {}) {
  return {
    closeOriginGuard: fixture.closeOriginGuard,
    createOriginGuard: fixture.createOriginGuard,
    executable: process.execPath,
    getOriginGuardAddress: fixture.getOriginGuardAddress,
    getOriginGuardHandle: fixture.getOriginGuardHandle,
    gracefulStopMs: 40,
    killProcessGroup: (groupId, signal) => fixture.terminate(groupId, signal),
    lifetimeMs: 1000,
    observeOriginGuardFault: fixture.observeOriginGuardFault,
    originGuardModule: '/private/tmp/gate-b-origin-guard-fixture.js',
    platform: 'darwin',
    probeProcessGroup: groupId => fixture.alive.get(groupId) ?? false,
    reapAbandonMs: 30,
    reapForceMs: 10,
    reaperModule: '/private/tmp/gate-b-reaper-fixture.js',
    setupTimeoutMs: 30,
    spawnProcess: fixture.spawnProcess,
    terminalWaitMs: 40,
    watchdogModule: '/private/tmp/gate-b-watchdog-fixture.js',
    ...changes,
  };
}

async function prepareSiblingOwnerForRun(fixture) {
  const capability = await launchGateBOperatorWatchdogSetup(
    fakeSiblingOwnerOptions(fixture, {
      originReleaseTimeoutMs: 60,
      setupTimeoutMs: 100,
      terminalWaitMs: 100,
    }),
  );
  assert.equal(await submitGateBOperatorBootstrap(capability, bootstrap()), capability);
  assert.equal(await submitGateBOperatorCoordinatorReview(capability, review()),
    'PREFLIGHT_VALID');
  return capability;
}

test('launcher owns one detached group and exposes a phase-separated opaque lifecycle', async () => {
  const child = fakeCoordinatorProcess();
  const spawnCalls = [];
  const capability = await launchGateBOperatorCoordinator(bootstrap(), {
    cliModule: '/private/tmp/gate-b-operator-coordinator-cli-fixture.js',
    executable: process.execPath,
    killProcessGroup() { assert.fail('clean closure must not signal'); },
    lifetimeMs: 1000,
    platform: 'darwin',
    probeProcessGroup: () => false,
    reapAbandonMs: 1000,
    reapForceMs: 100,
    spawnProcess(executable, args, options) {
      spawnCalls.push({ executable, args, options });
      return child;
    },
  });
  assert.equal(Object.getPrototypeOf(capability), null);
  assert.equal(Object.isFrozen(capability), true);
  assert.equal(getGateBOperatorCoordinatorStatus(capability), 'REVIEW_REQUIRED');
  assert.equal(await submitGateBOperatorCoordinatorReview(capability, review()), 'PREFLIGHT_VALID');
  assert.equal(getGateBOperatorCoordinatorStatus(capability), 'PREFLIGHT_VALID');
  assert.equal(await stopGateBOperatorCoordinator(capability), 'CLOSED');
  assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'CLOSED');
  assert.equal(getGateBOperatorCoordinatorStatus(capability), 'CLOSED');
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].executable, process.execPath);
  assert.equal(spawnCalls[0].args.length, 1);
  assert.equal(spawnCalls[0].options.detached, true);
  assert.equal(spawnCalls[0].options.shell, false);
  assert.deepEqual(spawnCalls[0].options.env, {});
  assert.deepEqual(spawnCalls[0].options.stdio,
    ['ignore', 'pipe', 'pipe', 'pipe', 'ipc', 'pipe']);
});

function ordinaryRunLauncherOptions(child, changes = {}) {
  return {
    cliModule: '/private/tmp/gate-b-operator-coordinator-cli-fixture.js',
    executable: process.execPath,
    gracefulStopMs: 100,
    killProcessGroup() {},
    lifetimeMs: 10_000,
    platform: 'darwin',
    probeProcessGroup: () => false,
    reapAbandonMs: 20,
    reapForceMs: 5,
    spawnProcess: () => child,
    ...changes,
  };
}

test('production RUN API permits the watchdog submit-then-immediate-release-wait order',
  async () => {
    const child = fakeCoordinatorProcess();
    const capability = await launchGateBOperatorCoordinator(
      bootstrap(), ordinaryRunLauncherOptions(child),
    );
    assert.equal(await submitGateBOperatorCoordinatorReview(capability, review()),
      'PREFLIGHT_VALID');
    const runWork = submitGateBOperatorCoordinatorRun(capability, runAuthorization());
    const releaseWork = waitGateBOperatorCoordinatorOriginReleaseRequest(capability);
    assert.equal(await releaseWork, true);
    assert.equal(await confirmGateBOperatorCoordinatorOriginReleased(capability), true);
    assert.equal(await runWork, 'PENDING');
    assert.equal(getGateBOperatorCoordinatorStatus(capability), 'PENDING');
    assert.equal(await stopGateBOperatorCoordinator(capability), 'CLOSED_PENDING');
    assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'CLOSED_PENDING');
  });

test('RUN opening failure and timeout reject the immediate waiter without release authority',
  { timeout: 12_000 }, async t => {
    for (const mode of ['failure', 'timeout']) await t.test(mode, async () => {
      const child = fakeCoordinatorProcess();
      const send = child.send;
      const sent = [];
      child.send = (message, callback) => {
        sent.push(message.type);
        if (message.type === 'RUN_OPEN') {
          queueMicrotask(() => callback?.(mode === 'failure' ? new Error('fixture') : null));
          return true;
        }
        return Reflect.apply(send, child, [message, callback]);
      };
      const capability = await launchGateBOperatorCoordinator(
        bootstrap(), ordinaryRunLauncherOptions(child),
      );
      assert.equal(await submitGateBOperatorCoordinatorReview(capability, review()),
        'PREFLIGHT_VALID');
      const runWork = submitGateBOperatorCoordinatorRun(capability, runAuthorization());
      const releaseWork = waitGateBOperatorCoordinatorOriginReleaseRequest(capability);
      await assert.rejects(releaseWork);
      await assert.rejects(runWork);
      await assert.rejects(confirmGateBOperatorCoordinatorOriginReleased(capability));
      assert.equal(sent.includes('ORIGIN_RELEASED'), false);
      assert.equal(child.stdout.readableLength, 0);
      assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'QUARANTINED');
    });
  });

test('ambiguous origin-release acknowledgement cannot resolve RUN success', async () => {
  const child = fakeCoordinatorProcess({ ambiguousOriginReleaseAcknowledgement: true });
  const capability = await launchGateBOperatorCoordinator(
    bootstrap(), ordinaryRunLauncherOptions(child),
  );
  assert.equal(await submitGateBOperatorCoordinatorReview(capability, review()),
    'PREFLIGHT_VALID');
  const runWork = submitGateBOperatorCoordinatorRun(capability, runAuthorization());
  assert.equal(await waitGateBOperatorCoordinatorOriginReleaseRequest(capability), true);
  await assert.rejects(confirmGateBOperatorCoordinatorOriginReleased(capability));
  await assert.rejects(runWork);
  assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'QUARANTINED');
});

test('outer setup owns detached sibling groups and submits bootstrap only after READY then START',
  async () => {
    const fixture = fakeSiblingOwnerProcesses();
    const signals = [];
    const options = fakeSiblingOwnerOptions(fixture, {
      killProcessGroup(groupId, signal) {
        signals.push([groupId, signal]);
        fixture.alive.set(groupId, false);
      },
      lifetimeMs: 1000,
      reapAbandonMs: 1000,
      reapForceMs: 100,
      setupTimeoutMs: 1000,
      terminalWaitMs: 1000,
    });
    const capability = await launchGateBOperatorWatchdogSetup(options);
    assert.deepEqual(fixture.events.slice(-1), ['START']);
    assert.equal(fixture.events[0], 'BIND_ORIGIN');
    assert.equal(fixture.events.includes('TARGET'), true);
    assert.equal(fixture.events.includes('GUARD_TARGET'), true);
    assert.equal(fixture.events.includes('REAPER_ARM_ORIGIN_GUARD'), true);
    assert.equal(fixture.events.includes('GUARD_ARM_ORIGIN_GUARD'), true);
    assert.equal(fixture.spawnCalls.length, 3);
    assert.deepEqual(fixture.spawnCalls.map(call => call.args.length), [1, 1, 1]);
    assert.deepEqual(fixture.spawnCalls.map(call => call.options.detached), [true, true, true]);
    assert.deepEqual(fixture.spawnCalls.map(call => call.options.env), [{}, {}, {}]);
    assert.deepEqual(fixture.spawnCalls[0].options.stdio,
      ['ignore', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe', 'ipc']);
    assert.deepEqual(fixture.spawnCalls[1].options.stdio,
      ['ignore', 'ignore', 'ignore', 'pipe', 'pipe', 'pipe', 'ipc']);
    assert.equal(fixture.spawnCalls[2].options.stdio[5], fixture.guard.stdio[5]);
    assert.deepEqual(fixture.spawnCalls[2].options.stdio.slice(0, 5),
      ['ignore', 'ignore', 'ignore', 'pipe', 'pipe']);
    assert.equal(fixture.spawnCalls[2].options.stdio[6], 'ipc');

    assert.equal(await submitGateBOperatorBootstrap(capability, bootstrap()), capability);
    assert.equal(fixture.events.indexOf('START') <
      fixture.events.indexOf('WATCHDOG_BOOTSTRAP_OPEN'), true);
    assert.equal(fixture.events.indexOf('WATCHDOG_BOOTSTRAP_OPEN') <
      fixture.events.indexOf('BOOTSTRAP'), true);
    assert.equal(getGateBOperatorCoordinatorStatus(capability), 'REVIEW_REQUIRED');
    assert.equal(await submitGateBOperatorCoordinatorReview(capability, review()),
      'PREFLIGHT_VALID');
    assert.equal(await stopGateBOperatorCoordinator(capability), 'CLOSED');
    assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'CLOSED');
    assert.equal(fixture.events.filter(value => value === 'REAPER_CLEANUP').length, 1);
    assert.equal(fixture.events.filter(value => value === 'GUARD_CLEANUP').length, 1);
    assert.deepEqual(signals, []);
    assert.equal(fixture.alive.get(43001), false);
    assert.equal(fixture.alive.get(43002), false);
    assert.equal(fixture.alive.get(43003), false);
    for (const { source, value } of fixture.emitted) {
      if (source === 'reaper' || source === 'guard' || value.type === 'STARTED') {
        assert.deepEqual(Reflect.ownKeys(value), ['type']);
      }
      assert.equal(Reflect.ownKeys(value).some(key => key === 'pid' || key === 'groupId'), false);
    }
  });

test('outer Phase-3 release joins both holders and one outer close before confirmation',
  async () => {
    const fixture = fakeSiblingOwnerProcesses();
    const capability = await prepareSiblingOwnerForRun(fixture);

    assert.equal(await submitGateBOperatorCoordinatorRun(capability, runAuthorization()),
      'PENDING');

    const guardAck = fixture.events.indexOf('GUARD_ORIGIN_RELEASED_ACK');
    const reaperAck = fixture.events.indexOf('REAPER_ORIGIN_RELEASED_ACK');
    const outerClose = fixture.events.indexOf('OUTER_GUARD_CLOSE');
    const confirmation = fixture.events.indexOf('WATCHDOG_ORIGIN_RELEASED');
    const confirmationCallback = fixture.events.indexOf(
      'WATCHDOG_ORIGIN_RELEASED_CALLBACK',
    );
    const pending = fixture.events.indexOf('WATCHDOG_PENDING');
    assert.equal(guardAck >= 0 && reaperAck >= 0, true);
    assert.equal(outerClose > guardAck && outerClose > reaperAck, true);
    assert.equal(confirmation > outerClose, true);
    assert.equal(confirmationCallback > confirmation, true);
    assert.equal(pending > confirmationCallback, true);
    assert.equal(fixture.events.filter(value => value === 'OUTER_GUARD_CLOSE').length, 1);
    assert.equal(fixture.events.filter(value => value === 'GUARD_RELEASE_ORIGIN').length, 1);
    assert.equal(fixture.events.filter(value => value === 'REAPER_RELEASE_ORIGIN').length, 1);

    assert.equal(await stopGateBOperatorCoordinator(capability), 'CLOSED_PENDING');
    assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'CLOSED_PENDING');
    assert.equal(fixture.events.filter(value => value === 'OUTER_GUARD_CLOSE').length, 1);
  });

test('outer Phase-3 missing, malformed, or duplicate holder acknowledgement quarantines',
  async t => {
    for (const holder of ['guard', 'reaper']) {
      for (const mode of ['missing', 'malformed', 'duplicate']) {
        await t.test(`${holder}-${mode}`, async () => {
          const fixture = fakeSiblingOwnerProcesses({
            [`${holder}OriginReleaseAcknowledgement`]: mode,
          });
          const capability = await prepareSiblingOwnerForRun(fixture);
          const runWork = submitGateBOperatorCoordinatorRun(
            capability,
            runAuthorization(),
          );

          await assert.rejects(runWork);
          assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'QUARANTINED');
          assert.equal(fixture.events.includes('WATCHDOG_ORIGIN_RELEASED'), false);
          assert.equal(fixture.events.includes('WATCHDOG_PENDING'), false);
        });
      }
    }
  });

test('outer Phase-3 close false or rejection after both acknowledgements quarantines',
  async t => {
    for (const [name, changes] of [
      ['false', { outerGuardCloseFailure: true }],
      ['rejection', { outerGuardCloseReject: true }],
    ]) await t.test(name, async () => {
      const fixture = fakeSiblingOwnerProcesses(changes);
      const capability = await prepareSiblingOwnerForRun(fixture);
      const runWork = submitGateBOperatorCoordinatorRun(capability, runAuthorization());

      await assert.rejects(runWork);
      assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'QUARANTINED');
      assert.equal(fixture.events.includes('GUARD_ORIGIN_RELEASED_ACK'), true);
      assert.equal(fixture.events.includes('REAPER_ORIGIN_RELEASED_ACK'), true);
      assert.equal(fixture.events.filter(value => value === 'OUTER_GUARD_CLOSE').length, 1);
      assert.equal(fixture.events.includes('WATCHDOG_ORIGIN_RELEASED'), false);
      assert.equal(fixture.events.includes('WATCHDOG_PENDING'), false);
    });
  });

test('outer rejects wildcard, IPv6, and wrong-port guard identities before spawning', async t => {
  for (const [name, address] of [
    ['wildcard', { address: '0.0.0.0', family: 'IPv4', port: 41000 }],
    ['ipv6', { address: '::1', family: 'IPv6', port: 41000 }],
    ['wrong-port', { address: '127.0.0.1', family: 'IPv4', port: 41001 }],
  ]) await t.test(name, async () => {
    const fixture = fakeSiblingOwnerProcesses();
    await assert.rejects(launchGateBOperatorWatchdogSetup(fakeSiblingOwnerOptions(fixture, {
      getOriginGuardAddress: () => Object.freeze(address),
    })));
    assert.equal(fixture.spawnCalls.length, 0);
    assert.deepEqual(fixture.events, ['BIND_ORIGIN', 'OUTER_GUARD_CLOSE']);
  });
});

test('watchdog START waits for both holder READY frames and successful handle callbacks',
  async t => {
    for (const [name, heldKey, releaseKey] of [
      ['reaper-callback', 'holdReaperHandleCallback', 'releaseReaperHandleCallback'],
      ['guard-callback', 'holdGuardHandleCallback', 'releaseGuardHandleCallback'],
    ]) await t.test(name, async () => {
      const changes = { [heldKey]: true };
      const fixture = fakeSiblingOwnerProcesses(changes);
      const pending = launchGateBOperatorWatchdogSetup(fakeSiblingOwnerOptions(fixture, {
        setupTimeoutMs: 1000,
        terminalWaitMs: 1000,
      }));
      await waitFor(() => typeof changes[releaseKey] === 'function');
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(fixture.events.includes('START'), false);
      changes[releaseKey]();
      const capability = await pending;
      assert.equal(fixture.events.includes('START'), true);
      assert.equal(await stopGateBOperatorCoordinator(capability), 'CLOSED');
    });

    await t.test('failed-transfer', async () => {
      const fixture = fakeSiblingOwnerProcesses({ guardHandleError: true });
      await assert.rejects(launchGateBOperatorWatchdogSetup(fakeSiblingOwnerOptions(fixture)));
      assert.equal(fixture.events.includes('START'), false);
      assert.equal(fixture.events.includes('BOOTSTRAP'), false);
    });
  });

test('canonical phase bytes wait for exact one-shot private OPEN acknowledgements', async () => {
  const changes = { bootstrapOpenAck: false, reviewOpenAck: false };
  const fixture = fakeSiblingOwnerProcesses(changes);
  const capability = await launchGateBOperatorWatchdogSetup(
    fakeSiblingOwnerOptions(fixture),
  );
  const submitted = submitGateBOperatorBootstrap(capability, bootstrap());
  await waitFor(() => fixture.events.includes('WATCHDOG_BOOTSTRAP_OPEN'));
  assert.equal(fixture.events.includes('BOOTSTRAP'), false);
  fixture.watchdog.emit('message', { type: 'BOOTSTRAP_OPENED' });
  assert.equal(await submitted, capability);

  const reviewed = submitGateBOperatorCoordinatorReview(capability, review());
  await waitFor(() => fixture.events.includes('WATCHDOG_REVIEW_OPEN'));
  assert.equal(fixture.events.includes('REVIEW'), false);
  fixture.watchdog.emit('message', { type: 'REVIEW_OPENED' });
  assert.equal(await reviewed, 'PREFLIGHT_VALID');
  assert.equal(await stopGateBOperatorCoordinator(capability), 'CLOSED');
});

test('early, duplicate, and stale private OPEN acknowledgements poison captured owners',
  async t => {
    await t.test('early', async () => {
      const fixture = fakeSiblingOwnerProcesses();
      const capability = await launchGateBOperatorWatchdogSetup(
        fakeSiblingOwnerOptions(fixture),
      );
      fixture.watchdog.emit('message', { type: 'BOOTSTRAP_OPENED' });
      assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'QUARANTINED');
      assert.equal(fixture.events.includes('BOOTSTRAP'), false);
    });

    await t.test('duplicate', async () => {
      const fixture = fakeSiblingOwnerProcesses({ duplicateOpenAck: 'BOOTSTRAP_OPEN' });
      const capability = await launchGateBOperatorWatchdogSetup(
        fakeSiblingOwnerOptions(fixture),
      );
      await assert.rejects(submitGateBOperatorBootstrap(capability, bootstrap()));
      assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'QUARANTINED');
    });

    await t.test('stale-after-submit', async () => {
      const fixture = fakeSiblingOwnerProcesses();
      const capability = await launchGateBOperatorWatchdogSetup(
        fakeSiblingOwnerOptions(fixture),
      );
      await submitGateBOperatorBootstrap(capability, bootstrap());
      fixture.watchdog.emit('message', { type: 'BOOTSTRAP_OPENED' });
      assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'QUARANTINED');
    });
  });

test('duplicate bootstrap submission poisons the setup capability and closes all groups',
  async () => {
    const fixture = fakeSiblingOwnerProcesses();
    const options = fakeSiblingOwnerOptions(fixture, {
      killProcessGroup(groupId) { fixture.alive.set(groupId, false); },
      reapAbandonMs: 1000,
      reapForceMs: 100,
      setupTimeoutMs: 1000,
      terminalWaitMs: 1000,
    });
    const capability = await launchGateBOperatorWatchdogSetup(options);
    const submitted = submitGateBOperatorBootstrap(capability, bootstrap());
    await assert.rejects(submitGateBOperatorBootstrap(capability, bootstrap()));
    await assert.rejects(submitted);
    assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'QUARANTINED');
  });

test('malformed and wrong-capability bootstrap submissions poison only captured owners',
  async () => {
    const fixture = fakeSiblingOwnerProcesses();
    const setup = await launchGateBOperatorWatchdogSetup(fakeSiblingOwnerOptions(fixture));
    await assert.rejects(submitGateBOperatorBootstrap(setup, { schemaVersion: 1 }));
    assert.equal(await waitGateBOperatorCoordinatorClosed(setup), 'QUARANTINED');

    const child = fakeCoordinatorProcess();
    const ordinary = await launchGateBOperatorCoordinator(bootstrap(), {
      cliModule: '/private/tmp/gate-b-operator-coordinator-cli-fixture.js',
      executable: process.execPath,
      killProcessGroup() {},
      lifetimeMs: 1000,
      platform: 'darwin',
      probeProcessGroup: () => false,
      reapAbandonMs: 30,
      reapForceMs: 10,
      spawnProcess: () => child,
    });
    await assert.rejects(submitGateBOperatorBootstrap(ordinary, bootstrap()));
    assert.equal(await waitGateBOperatorCoordinatorClosed(ordinary), 'QUARANTINED');
  });

test('pre-READY loss never sends START and outer cleanup terminates reaper before watchdog',
  async () => {
    const fixture = fakeSiblingOwnerProcesses({
      ignoreReaperTerm: true,
      ignoreWatchdogTerm: true,
      reaperReady: false,
    });
    await assert.rejects(launchGateBOperatorWatchdogSetup(fakeSiblingOwnerOptions(fixture)));
    assert.equal(fixture.events.includes('START'), false);
    assert.equal(fixture.events.includes('BOOTSTRAP'), false);
    const reaperTerm = fixture.events.indexOf('SIGNAL_43002_SIGTERM');
    const reaperKill = fixture.events.indexOf('SIGNAL_43002_SIGKILL');
    const watchdogTerm = fixture.events.indexOf('SIGNAL_43001_SIGTERM');
    const watchdogKill = fixture.events.indexOf('SIGNAL_43001_SIGKILL');
    assert.equal(reaperTerm >= 0 && reaperKill > reaperTerm, true);
    assert.equal(watchdogTerm > reaperKill && watchdogKill > watchdogTerm, true);
    assert.equal(fixture.alive.get(43001), false);
    assert.equal(fixture.alive.get(43002), false);
  });

test('setup rejection keeps one cleanup owner and never targets a late recycled group',
  async () => {
    const fixture = fakeSiblingOwnerProcesses({
      ignoreReaperTerm: true,
      ignoreWatchdogTerm: true,
      reaperReady: false,
    });
    const falseProbes = new Map();
    await assert.rejects(launchGateBOperatorWatchdogSetup(fakeSiblingOwnerOptions(fixture, {
      probeProcessGroup(groupId) {
        const alive = fixture.alive.get(groupId) ?? false;
        if (alive) return true;
        const count = (falseProbes.get(groupId) ?? 0) + 1;
        falseProbes.set(groupId, count);
        if (count >= 5) {
          fixture.alive.set(groupId, true);
          return true;
        }
        return false;
      },
    })));
    assert.deepEqual(fixture.events.filter(event => event.startsWith('SIGNAL_')), [
      'SIGNAL_43002_SIGTERM',
      'SIGNAL_43002_SIGKILL',
      'SIGNAL_43001_SIGTERM',
      'SIGNAL_43001_SIGKILL',
      'SIGNAL_43003_SIGTERM',
    ]);
    assert.equal(falseProbes.get(43001), 5);
    assert.equal(falseProbes.get(43002), 3);
    assert.equal(falseProbes.get(43003), 4);
  });

test('unsolicited ABSENT before the target callback poisons before READY or START', async () => {
  const changes = {
    holdTargetCallback: true,
    reaperReady: false,
    recordTargetCallback: true,
  };
  const fixture = fakeSiblingOwnerProcesses(changes);
  const pending = launchGateBOperatorWatchdogSetup(fakeSiblingOwnerOptions(fixture, {
    setupTimeoutMs: 1000,
  }));
  await waitFor(() => typeof changes.releaseTargetCallback === 'function');
  fixture.reaper.emit('message', { type: 'ABSENT' });
  changes.releaseTargetCallback();
  fixture.reaper.emit('message', { type: 'READY' });
  let capability;
  try { capability = await pending; } catch {}
  if (capability) await stopGateBOperatorCoordinator(capability);
  assert.equal(capability, undefined);
  assert.equal(fixture.events.includes('START'), false);
  assert.equal(fixture.events.includes('BOOTSTRAP'), false);
});

test('unsolicited ABSENT after the target callback poisons before a later READY', async () => {
  const changes = { reaperReady: false, recordTargetCallback: true };
  const fixture = fakeSiblingOwnerProcesses(changes);
  const pending = launchGateBOperatorWatchdogSetup(fakeSiblingOwnerOptions(fixture, {
    setupTimeoutMs: 1000,
  }));
  await waitFor(() => fixture.events.includes('TARGET_CALLBACK'));
  fixture.reaper.emit('message', { type: 'ABSENT' });
  fixture.reaper.emit('message', { type: 'READY' });
  let capability;
  try { capability = await pending; } catch {}
  if (capability) await stopGateBOperatorCoordinator(capability);
  assert.equal(capability, undefined);
  assert.equal(fixture.events.includes('START'), false);
});

test('unsolicited ABSENT after setup prevents bootstrap and later milestones', async () => {
  const fixture = fakeSiblingOwnerProcesses();
  const capability = await launchGateBOperatorWatchdogSetup(
    fakeSiblingOwnerOptions(fixture),
  );
  fixture.reaper.emit('message', { type: 'ABSENT' });
  let accepted = false;
  try {
    await submitGateBOperatorBootstrap(capability, bootstrap());
    accepted = true;
  } catch {}
  if (accepted) fixture.reaper.emit('error', new Error('fixture'));
  assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'QUARANTINED');
  assert.equal(accepted, false);
  assert.equal(fixture.events.includes('BOOTSTRAP'), false);
});

test('public watchdog bytes cannot substitute for private START before reaper READY', async () => {
  const fixture = fakeSiblingOwnerProcesses({ publicBeforeReady: true });
  await assert.rejects(launchGateBOperatorWatchdogSetup(fakeSiblingOwnerOptions(fixture)));
  assert.equal(fixture.events.includes('START'), false);
  assert.equal(fixture.events.includes('BOOTSTRAP'), false);
  assert.equal(fixture.alive.get(43001), false);
  assert.equal(fixture.alive.get(43002), false);
});

test('post-READY reaper loss is terminal and outer takes over the captured watchdog group',
  async () => {
    const fixture = fakeSiblingOwnerProcesses();
    const capability = await launchGateBOperatorWatchdogSetup(fakeSiblingOwnerOptions(fixture));
    fixture.alive.set(43002, false);
    fixture.reaper.emit('exit', 1, null);
    fixture.reaper.emit('close', 1, null);
    assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'QUARANTINED');
    assert.equal(fixture.events.includes('SIGNAL_43001_SIGTERM'), true);
    assert.equal(fixture.alive.get(43001), false);
  });

test('post-READY guard loss poisons while reaper and outer retain origin custody', async () => {
  const fixture = fakeSiblingOwnerProcesses();
  const capability = await launchGateBOperatorWatchdogSetup(fakeSiblingOwnerOptions(fixture));
  fixture.alive.set(43003, false);
  fixture.guard.emit('exit', 1, null);
  fixture.guard.emit('close', 1, null);
  assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'QUARANTINED');
  assert.equal(fixture.events.includes('REAPER_CLEANUP'), true);
  assert.equal(fixture.events.indexOf('REAPER_CLEANUP') <
    fixture.events.indexOf('OUTER_GUARD_CLOSE'), true);
  assert.equal(fixture.alive.get(43001), false);
  assert.equal(fixture.alive.get(43002), false);
  assert.equal(fixture.alive.get(43003), false);
});

test('simultaneous reaper and guard loss leaves outer custody until watchdog proof', async () => {
  const fixture = fakeSiblingOwnerProcesses({ ignoreWatchdogTerm: true });
  const capability = await launchGateBOperatorWatchdogSetup(fakeSiblingOwnerOptions(fixture));
  fixture.alive.set(43002, false);
  fixture.alive.set(43003, false);
  fixture.reaper.emit('exit', null, 'SIGKILL');
  fixture.reaper.emit('close', null, 'SIGKILL');
  fixture.guard.emit('exit', null, 'SIGKILL');
  fixture.guard.emit('close', null, 'SIGKILL');
  assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'QUARANTINED');
  const watchdogTerm = fixture.events.indexOf('SIGNAL_43001_SIGTERM');
  const watchdogKill = fixture.events.indexOf('SIGNAL_43001_SIGKILL');
  const outerClose = fixture.events.indexOf('OUTER_GUARD_CLOSE');
  assert.equal(watchdogTerm >= 0 && watchdogKill > watchdogTerm, true);
  assert.equal(outerClose > watchdogKill, true);
  assert.equal(fixture.alive.get(43001), false);
});

test('watchdog crash activates the armed reaper without concurrent outer group signalling',
  async () => {
    const fixture = fakeSiblingOwnerProcesses();
    const capability = await launchGateBOperatorWatchdogSetup(fakeSiblingOwnerOptions(fixture));
    fixture.alive.set(43001, false);
    fixture.watchdog.emit('exit', 1, null);
    fixture.watchdog.emit('close', 1, null);
    assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'QUARANTINED');
    assert.equal(fixture.events.includes('REAPER_CLEANUP'), true);
    assert.equal(fixture.events.some(value => value.startsWith('SIGNAL_43001_')), false);
  });

test('watchdog exit starts reaper cleanup before held close and clean adjudication waits',
  async () => {
    const changes = { holdWatchdogClose: true };
    const fixture = fakeSiblingOwnerProcesses(changes);
    const capability = await launchGateBOperatorWatchdogSetup(
      fakeSiblingOwnerOptions(fixture),
    );
    await submitGateBOperatorBootstrap(capability, bootstrap());
    await submitGateBOperatorCoordinatorReview(capability, review());
    const stopped = stopGateBOperatorCoordinator(capability);
    await waitFor(() => typeof changes.releaseWatchdogClose === 'function');
    await new Promise(resolve => setImmediate(resolve));
    const cleanupBeforeClose = fixture.events.includes('REAPER_CLEANUP');
    let settledBeforeClose = false;
    void stopped.then(() => { settledBeforeClose = true; });
    await new Promise(resolve => setImmediate(resolve));
    const observedSettledBeforeClose = settledBeforeClose;
    changes.releaseWatchdogClose();
    assert.equal(await stopped, 'CLOSED');
    assert.equal(cleanupBeforeClose, true);
    assert.equal(observedSettledBeforeClose, false);
  });

test('clean watchdog exit retains bounded final output and STOPPED until delayed close',
  async () => {
    const changes = { exitBeforeFinalProtocol: true, holdWatchdogClose: true };
    const fixture = fakeSiblingOwnerProcesses(changes);
    const capability = await launchGateBOperatorWatchdogSetup(
      fakeSiblingOwnerOptions(fixture),
    );
    await submitGateBOperatorBootstrap(capability, bootstrap());
    await submitGateBOperatorCoordinatorReview(capability, review());
    const stopped = stopGateBOperatorCoordinator(capability);
    await waitFor(() => typeof changes.releaseWatchdogClose === 'function');
    assert.equal(fixture.events.includes('REAPER_CLEANUP'), true);
    changes.releaseWatchdogClose();
    assert.equal(await stopped, 'CLOSED');
    assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'CLOSED');
  });

test('reaper hang after clean watchdog exit quarantines before outer reaper takeover', async () => {
  const fixture = fakeSiblingOwnerProcesses({ reaperHang: true });
  const capability = await launchGateBOperatorWatchdogSetup(fakeSiblingOwnerOptions(fixture));
  await submitGateBOperatorBootstrap(capability, bootstrap());
  await submitGateBOperatorCoordinatorReview(capability, review());
  assert.equal(await stopGateBOperatorCoordinator(capability), 'QUARANTINED');
  assert.equal(fixture.events.includes('REAPER_CLEANUP'), true);
  assert.equal(fixture.events.includes('SIGNAL_43002_SIGTERM'), true);
  assert.equal(fixture.alive.get(43001), false);
  assert.equal(fixture.alive.get(43002), false);
});

test('false ABSENT cannot hide a hung watchdog and forces serialized outer TERM then KILL',
  async () => {
    const fixture = fakeSiblingOwnerProcesses({
      falseAbsent: true,
      ignoreWatchdogTerm: true,
      watchdogHang: true,
    });
    const capability = await launchGateBOperatorWatchdogSetup(fakeSiblingOwnerOptions(fixture));
    assert.equal(await stopGateBOperatorCoordinator(capability), 'QUARANTINED');
    const cleanup = fixture.events.indexOf('REAPER_CLEANUP');
    const watchdogTerm = fixture.events.indexOf('SIGNAL_43001_SIGTERM');
    const watchdogKill = fixture.events.indexOf('SIGNAL_43001_SIGKILL');
    assert.equal(cleanup >= 0 && watchdogTerm > cleanup && watchdogKill > watchdogTerm, true);
    assert.equal(fixture.alive.get(43001), false);
    assert.equal(fixture.alive.get(43002), false);
  });

test('launcher STOP watchdog quarantines and reaps a child that ignores STOP', async () => {
  const child = fakeCoordinatorProcess();
  const signals = [];
  let groupAlive = true;
  child.send = (_message, callback) => {
    queueMicrotask(() => callback?.(null));
    return true;
  };
  const capability = await launchGateBOperatorCoordinator(bootstrap(), {
    cliModule: '/private/tmp/gate-b-operator-coordinator-cli-fixture.js',
    executable: process.execPath,
    killProcessGroup(_pid, signal) {
      signals.push(signal);
      groupAlive = false;
    },
    lifetimeMs: 1000,
    gracefulStopMs: 20,
    platform: 'darwin',
    probeProcessGroup: () => groupAlive,
    reapAbandonMs: 20,
    reapForceMs: 5,
    spawnProcess: () => child,
  });
  assert.equal(await stopGateBOperatorCoordinator(capability), 'QUARANTINED');
  assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'QUARANTINED');
  assert.deepEqual(signals, ['SIGTERM']);
  child.emit('message', createGateBOperatorCoordinatorIpcMessage('STOPPED'));
  child.emit('exit', 0, null);
  child.emit('close', 0, null);
  assert.equal(getGateBOperatorCoordinatorStatus(capability), 'QUARANTINED');
});

test('launcher allows cleanup beyond the reap window when it remains inside the graceful STOP window', async () => {
  const child = fakeCoordinatorProcess();
  const signals = [];
  let groupAlive = true;
  child.send = (message, callback) => {
    queueMicrotask(() => callback?.(null));
    if (message.type === 'STOP') {
      setTimeout(() => {
        groupAlive = false;
        child.stdout.write(GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.CLOSED);
        child.emit('message', createGateBOperatorCoordinatorIpcMessage('STOPPED'));
        child.emit('exit', 0, null);
        child.emit('close', 0, null);
      }, 30);
    }
    return true;
  };
  const capability = await launchGateBOperatorCoordinator(bootstrap(), {
    cliModule: '/private/tmp/gate-b-operator-coordinator-cli-fixture.js',
    executable: process.execPath,
    gracefulStopMs: 80,
    killProcessGroup(_pid, signal) { signals.push(signal); },
    lifetimeMs: 1000,
    platform: 'darwin',
    probeProcessGroup: () => groupAlive,
    reapAbandonMs: 10,
    reapForceMs: 5,
    spawnProcess: () => child,
  });
  assert.equal(await stopGateBOperatorCoordinator(capability), 'CLOSED');
  assert.deepEqual(signals, []);
});

test('launcher joins milestones to successful private-pipe write completion', async () => {
  const child = fakeCoordinatorProcess();
  const pipe = child.stdio[3];
  const write = pipe.write;
  let writeCount = 0;
  let finishBootstrap;
  let finishReview;
  pipe.write = function controlledWrite(chunk, callback) {
    writeCount += 1;
    const phase = writeCount;
    return Reflect.apply(write, this, [chunk, () => {
      if (phase === 1) finishBootstrap = callback;
      else finishReview = callback;
    }]);
  };
  const launch = launchGateBOperatorCoordinator(bootstrap(), {
    cliModule: '/private/tmp/gate-b-operator-coordinator-cli-fixture.js',
    executable: process.execPath,
    gracefulStopMs: 100,
    killProcessGroup() { assert.fail('clean closure must not signal'); },
    lifetimeMs: 1000,
    platform: 'darwin',
    probeProcessGroup: () => false,
    reapAbandonMs: 20,
    reapForceMs: 5,
    spawnProcess: () => child,
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof finishBootstrap, 'function');
  let launchSettled = false;
  void launch.then(() => { launchSettled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(launchSettled, false);
  finishBootstrap(null);
  const capability = await launch;
  const reviewed = submitGateBOperatorCoordinatorReview(capability, review());
  await waitFor(() => typeof finishReview === 'function', 500);
  assert.equal(typeof finishReview, 'function');
  let reviewSettled = false;
  void reviewed.then(() => { reviewSettled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reviewSettled, false);
  finishReview(null);
  assert.equal(await reviewed, 'PREFLIGHT_VALID');
  assert.equal(await stopGateBOperatorCoordinator(capability), 'CLOSED');
});

test('private-pipe callback failure and duplication quarantine before authority', async t => {
  await t.test('bootstrap-callback-failure', async () => {
    const child = fakeCoordinatorProcess();
    const pipe = child.stdio[3];
    const write = pipe.write;
    let finishBootstrap;
    pipe.write = function controlledWrite(chunk, callback) {
      return Reflect.apply(write, this, [chunk, () => { finishBootstrap = callback; }]);
    };
    let groupAlive = true;
    const pending = launchGateBOperatorCoordinator(bootstrap(), {
      cliModule: '/private/tmp/gate-b-operator-coordinator-cli-fixture.js',
      executable: process.execPath,
      gracefulStopMs: 100,
      killProcessGroup() { groupAlive = false; },
      lifetimeMs: 1000,
      platform: 'darwin',
      probeProcessGroup: () => groupAlive,
      reapAbandonMs: 20,
      reapForceMs: 5,
      spawnProcess: () => child,
    });
    await waitFor(() => typeof finishBootstrap === 'function');
    finishBootstrap(new Error('synthetic'));
    await assert.rejects(pending);
  });

  await t.test('bootstrap-callback-duplicate', async () => {
    const child = fakeCoordinatorProcess();
    const pipe = child.stdio[3];
    const write = pipe.write;
    let finishBootstrap;
    pipe.write = function controlledWrite(chunk, callback) {
      return Reflect.apply(write, this, [chunk, () => { finishBootstrap = callback; }]);
    };
    let groupAlive = true;
    const pending = launchGateBOperatorCoordinator(bootstrap(), {
      cliModule: '/private/tmp/gate-b-operator-coordinator-cli-fixture.js',
      executable: process.execPath,
      gracefulStopMs: 100,
      killProcessGroup() { groupAlive = false; },
      lifetimeMs: 1000,
      platform: 'darwin',
      probeProcessGroup: () => groupAlive,
      reapAbandonMs: 20,
      reapForceMs: 5,
      spawnProcess: () => child,
    });
    await waitFor(() => typeof finishBootstrap === 'function');
    finishBootstrap(null);
    const capability = await pending;
    finishBootstrap(null);
    assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'QUARANTINED');
  });

  await t.test('review-callback-failure', async () => {
    const child = fakeCoordinatorProcess();
    const pipe = child.stdio[3];
    const write = pipe.write;
    let writeCount = 0;
    let finishReview;
    pipe.write = function controlledWrite(chunk, callback) {
      writeCount += 1;
      const phase = writeCount;
      return Reflect.apply(write, this, [chunk, error => {
        if (phase === 1) callback?.(error);
        else finishReview = callback;
      }]);
    };
    let groupAlive = true;
    const capability = await launchGateBOperatorCoordinator(bootstrap(), {
      cliModule: '/private/tmp/gate-b-operator-coordinator-cli-fixture.js',
      executable: process.execPath,
      gracefulStopMs: 100,
      killProcessGroup() { groupAlive = false; },
      lifetimeMs: 1000,
      platform: 'darwin',
      probeProcessGroup: () => groupAlive,
      reapAbandonMs: 20,
      reapForceMs: 5,
      spawnProcess: () => child,
    });
    const pending = submitGateBOperatorCoordinatorReview(capability, review());
    await waitFor(() => typeof finishReview === 'function', 500);
    finishReview(new Error('synthetic'));
    await assert.rejects(pending);
    assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'QUARANTINED');
  });
});

test('duplicate review submission poisons the active submission and rejects after cleanup', async () => {
  const child = fakeCoordinatorProcess();
  const pipe = child.stdio[3];
  const write = pipe.write;
  let writeCount = 0;
  let finishReview;
  pipe.write = function controlledWrite(chunk, callback) {
    writeCount += 1;
    const phase = writeCount;
    return Reflect.apply(write, this, [chunk, error => {
      if (phase === 1) callback?.(error);
      else finishReview = callback;
    }]);
  };
  let groupAlive = true;
  const capability = await launchGateBOperatorCoordinator(bootstrap(), {
    cliModule: '/private/tmp/gate-b-operator-coordinator-cli-fixture.js',
    executable: process.execPath,
    gracefulStopMs: 100,
    killProcessGroup() { groupAlive = false; },
    lifetimeMs: 1000,
    platform: 'darwin',
    probeProcessGroup: () => groupAlive,
    reapAbandonMs: 20,
    reapForceMs: 5,
    spawnProcess: () => child,
  });
  const first = submitGateBOperatorCoordinatorReview(capability, review());
  const duplicate = submitGateBOperatorCoordinatorReview(capability, review());
  await assert.rejects(duplicate);
  await assert.rejects(first);
  assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'QUARANTINED');
  finishReview?.(null);
  child.emit('message', createGateBOperatorCoordinatorIpcMessage('PREFLIGHT_VALID'));
  assert.equal(getGateBOperatorCoordinatorStatus(capability), 'QUARANTINED');
});

test('launcher rejects an unusable coordinator PID before returning a capability', async () => {
  const child = fakeCoordinatorProcess();
  child.pid = 0;
  await assert.rejects(launchGateBOperatorCoordinator(bootstrap(), {
    cliModule: '/private/tmp/gate-b-operator-coordinator-cli-fixture.js',
    executable: process.execPath,
    killProcessGroup() {},
    lifetimeMs: 1000,
    platform: 'darwin',
    probeProcessGroup: () => false,
    reapAbandonMs: 20,
    reapForceMs: 5,
    spawnProcess: () => child,
  }));
});

test('launcher retains a valid PGID before later spawn-shape validation and reaps on failure', async () => {
  const child = fakeCoordinatorProcess();
  child.stdout = Object.freeze({});
  const signals = [];
  let groupAlive = true;
  await assert.rejects(launchGateBOperatorCoordinator(bootstrap(), {
    cliModule: '/private/tmp/gate-b-operator-coordinator-cli-fixture.js',
    executable: process.execPath,
    killProcessGroup(_pid, signal) {
      signals.push(signal);
      groupAlive = false;
    },
    lifetimeMs: 1000,
    platform: 'darwin',
    probeProcessGroup: () => groupAlive,
    reapAbandonMs: 20,
    reapForceMs: 5,
    spawnProcess: () => child,
  }));
  assert.deepEqual(signals, ['SIGTERM']);
});

test('real CLI fork with private-pipe EOF fails before controller or operational effects and leaves no referenced handles',
  { timeout: 10_000 }, async () => {
    const modulePath = fileURLToPath(
      new URL('../src/gate-b-operator-coordinator-cli.js', import.meta.url),
    );
    const child = spawn(process.execPath, [modulePath], {
      cwd: dirname(modulePath),
      detached: true,
      env: {},
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'ipc'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.stdio[3].end();
    const closed = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('bounded timeout')), 5000);
      child.once('close', (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });
    const outcome = await closed;
    assert.equal(outcome.code, 1);
    assert.equal(outcome.signal, null);
    assert.equal(Buffer.concat(stdout).length, 0);
    assert.equal(
      Buffer.concat(stderr).toString('utf8'),
      GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.QUARANTINED,
    );
    assert.throws(() => process.kill(-child.pid, 0), error => error?.code === 'ESRCH');
    for (const chunks of [stdout, stderr]) {
      for (const chunk of chunks) chunk.fill(0);
    }
  });

test('coordinator launcher direct import is inert after the front-end becomes the sole entrypoint',
  { timeout: 10_000 }, async () => {
    const modulePath = fileURLToPath(
      new URL('../src/gate-b-operator-coordinator-launcher.js', import.meta.url),
    );
    const child = spawn(process.execPath, [modulePath], {
      cwd: dirname(modulePath),
      detached: false,
      env: {},
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.stdin.end();
    const outcome = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('bounded timeout')), 5000);
      child.once('close', (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });
    assert.deepEqual(outcome, { code: 0, signal: null });
    assert.equal(Buffer.concat(stdout).length, 0);
    assert.equal(Buffer.concat(stderr).length, 0);
    for (const chunks of [stdout, stderr]) {
      for (const chunk of chunks) chunk.fill(0);
    }
  });

async function waitForGroupAbsent(groupId, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { process.kill(-groupId, 0); } catch (error) {
      if (error?.code === 'ESRCH') return true;
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return false;
}

function withinBound(promise, timeoutMs, label = 'bounded') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
    promise.then(value => {
      clearTimeout(timer);
      resolve(value);
    }, () => {
      clearTimeout(timer);
      reject(new Error(`${label} failure`));
    });
  });
}

function observePrivatePipeSettlement(stream, timeoutMs = 3000) {
  const errorCodes = [];
  let cleanupArmed = false;
  let closed = false;
  let resolveCleanup;
  const cleanupClosed = new Promise(resolve => { resolveCleanup = resolve; });
  const onCleanupError = () => {};
  const onCleanupClose = () => {
    closed = true;
    stream.removeListener('error', onCleanupError);
    resolveCleanup(true);
  };
  const armCleanup = () => {
    if (cleanupArmed || closed) return;
    cleanupArmed = true;
    stream.on('error', onCleanupError);
    stream.once('close', onCleanupClose);
  };
  const settled = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stream.removeListener('error', onError);
      stream.removeListener('close', onClose);
      armCleanup();
      reject(new Error('private pipe settlement timeout'));
    }, timeoutMs);
    const onError = error => errorCodes.push(error?.code);
    const onClose = () => {
      clearTimeout(timer);
      closed = true;
      stream.removeListener('error', onError);
      stream.removeListener('close', onClose);
      resolveCleanup(true);
      resolve(Object.freeze([...errorCodes]));
    };
    stream.on('error', onError);
    stream.once('close', onClose);
  });
  stream.resume();
  return Object.freeze({
    cleanup() {
      if (closed) return cleanupClosed;
      armCleanup();
      try { stream.destroy(); } catch {}
      return cleanupClosed;
    },
    settled,
  });
}

function assertExpectedPrivatePipeSettlement(errorCodes) {
  assert.equal(errorCodes.length === 0 ||
    (errorCodes.length === 1 &&
      (errorCodes[0] === 'ECONNRESET' || errorCodes[0] === 'EPIPE')), true);
}

function observeDetachedFixture(child, {
  hasIpc = true,
  privatePipes = [],
  requireClose = true,
  timeoutMs = 8000,
} = {}) {
  assert.equal(Number.isSafeInteger(child.pid) && child.pid > 1, true);
  const groupId = child.pid;
  const pipeStates = privatePipes.map(() => 'pending');
  const pipeObservers = privatePipes.map(stream =>
    observePrivatePipeSettlement(stream, timeoutMs));
  const pipeSettlements = pipeObservers.map((observer, index) => observer.settled.then(
    value => {
      pipeStates[index] = 'closed';
      return { ok: true, value };
    },
    () => {
      pipeStates[index] = 'timeout';
      return { ok: false };
    },
  ));
  const childErrors = [];
  let disconnected = hasIpc !== true || child.connected !== true;
  let resolveDisconnected;
  const ipcDisconnected = new Promise(resolve => {
    resolveDisconnected = resolve;
    if (disconnected) resolve(true);
  });
  const onDisconnect = () => {
    disconnected = true;
    resolveDisconnected(true);
  };
  if (!disconnected) child.once('disconnect', onDisconnect);
  let closeObserved = false;
  const exited = new Promise(resolve => {
    child.once('exit', (code, signal) => resolve(Object.freeze({ code, signal })));
  });
  let closeOutcome;
  let resolveClosed;
  const closed = new Promise(resolve => { resolveClosed = resolve; });
  const onError = error => childErrors.push(error?.code);
  const onClose = (code, signal) => {
    closeObserved = true;
    closeOutcome = Object.freeze({ code, signal });
    child.removeListener('error', onError);
    if (!disconnected && child.connected !== true) {
      child.removeListener('disconnect', onDisconnect);
      onDisconnect();
    }
    resolveClosed(closeOutcome);
  };
  child.on('error', onError);
  child.once('close', onClose);
  const retireCloseObservers = () => {
    child.removeListener('close', onClose);
    child.removeListener('error', onError);
    child.removeListener('disconnect', onDisconnect);
  };
  let joined;
  const closePrivatePipes = () => {
    for (const stream of privatePipes) {
      if (stream.destroyed === true) continue;
      try { stream.destroy(); } catch {}
    }
  };
  const join = async ({ requireNaturalPipeSettlement = true } = {}) => {
    if (joined) return joined;
    joined = (async () => {
      let timer;
      const bounded = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error(
          `detached fixture settlement timeout ` +
          `close=${closeObserved} ipc=${disconnected} pipes=${pipeStates.join(',')}`,
        )), timeoutMs);
        Promise.all([
          requireClose ? closed : exited,
          ipcDisconnected,
          ...pipeSettlements,
        ]).then(resolve, reject);
      });
      const [outcome, , ...pipes] = await bounded.finally(() => clearTimeout(timer));
      assert.deepEqual(childErrors, []);
      assert.equal(disconnected, true);
      assert.equal(child.connected, false);
      if (requireNaturalPipeSettlement) {
        assert.equal(pipes.every(record => record.ok), true);
        for (const record of pipes) assertExpectedPrivatePipeSettlement(record.value);
      }
      assert.equal(await waitForGroupAbsent(groupId, timeoutMs), true);
      if (!requireClose) {
        retireCloseObservers();
        if (closeObserved) assert.deepEqual(closeOutcome, outcome);
      }
      return Object.freeze({ outcome, pipeSettlements: Object.freeze(pipes) });
    })();
    return joined;
  };
  return Object.freeze({
    closePrivatePipes,
    async cleanup() {
      if (!await waitForGroupAbsent(groupId, 100)) {
        try { process.kill(-groupId, 'SIGKILL'); } catch (error) {
          if (error?.code !== 'ESRCH') throw error;
        }
      }
      assert.equal(await waitForGroupAbsent(groupId, 1000), true);
      closePrivatePipes();
      await Promise.all(pipeObservers.map(observer => observer.cleanup()));
      try {
        const [outcome] = await withinBound(Promise.all([
          requireClose ? closed : exited,
          ipcDisconnected,
        ]), timeoutMs, 'detached fixture cleanup join');
        assert.deepEqual(childErrors, []);
        assert.equal(disconnected, true);
        assert.equal(child.connected, false);
        if (!requireClose && closeObserved) assert.deepEqual(closeOutcome, outcome);
        return Object.freeze({ outcome });
      } finally {
        retireCloseObservers();
      }
    },
    exited: () => withinBound(exited, timeoutMs, 'detached fixture exit'),
    settled: join,
  });
}

function writePrivateTargetFrame(stream, magic, target) {
  const frame = Buffer.alloc(8);
  frame.writeUInt32BE(magic, 0);
  frame.writeUInt32BE(target, 4);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (ok, error) => {
      if (settled) return;
      settled = true;
      stream.removeListener('error', onError);
      frame.fill(0);
      ok ? resolve(true) : reject(error);
    };
    const onError = error => finish(false, error);
    stream.once('error', onError);
    try { stream.end(frame, () => finish(true)); }
    catch (error) { finish(false, error); }
  });
}

test('real inert watchdog self-cleans silently when outer liveness ends before START',
  { timeout: 10_000 }, async () => {
    const watchdog = fileURLToPath(new URL('../src/gate-b-operator-watchdog.js', import.meta.url));
    const child = spawn(process.execPath, [watchdog], {
      cwd: dirname(watchdog), detached: true, env: {}, shell: false,
      stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe', 'ipc'],
    });
    const fixture = observeDetachedFixture(child, {
      privatePipes: child.stdio.slice(3, 6),
      timeoutMs: 5000,
    });
    const stdout = [];
    const stderr = [];
    const messages = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('message', message => messages.push(message));
    try {
      await new Promise(resolve => setTimeout(resolve, 50));
      child.stdio[3].destroy();
      child.stdio[4].destroy();
      child.stdio[5].destroy();
      const { outcome } = await fixture.settled();
      assert.deepEqual(outcome, { code: 1, signal: null });
      assert.equal(Buffer.concat(stdout).length, 0);
      assert.equal(Buffer.concat(stderr).length, 0);
      assert.deepEqual(messages, []);
      assert.equal(await waitForGroupAbsent(child.pid), true);
    } finally {
      await fixture.cleanup();
      for (const chunks of [stdout, stderr]) for (const chunk of chunks) chunk.fill(0);
    }
  });

test('outer liveness loss retains the same listener in reaper and guard until target absence',
  { timeout: 15_000 }, async () => {
    const hostile = fileURLToPath(new URL(
      '../test-support/gate-b-operator-coordinator-hostile-child.js',
      import.meta.url,
    ));
    const reaperModule = fileURLToPath(new URL(
      '../src/gate-b-operator-reaper.js', import.meta.url,
    ));
    const guardModule = fileURLToPath(new URL(
      '../src/gate-b-operator-origin-guard.js', import.meta.url,
    ));
    const target = spawn(process.execPath, [hostile, 'runtime'], {
      cwd: dirname(hostile), detached: true, env: {}, shell: false,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const targetFixture = observeDetachedFixture(target);
    let reaper;
    let guard;
    let reaperFixture;
    let guardFixture;
    let parentGuard;
    const waitReady = child => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('bounded timeout')), 3000);
      child.on('message', message => {
        if (message?.type !== 'READY') return;
        clearTimeout(timer);
        resolve(true);
      });
    });
    const sendHandle = (child, handle) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('bounded timeout')), 1000);
      child.send({ type: 'ARM_ORIGIN_GUARD' }, handle, { keepOpen: true }, error => {
        clearTimeout(timer);
        error ? reject(error) : resolve(true);
      });
    });
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('bounded timeout')), 2000);
        target.on('message', message => {
          if (message?.type !== 'HOSTILE_READY_runtime') return;
          clearTimeout(timer);
          resolve(true);
        });
      });
      parentGuard = await createGateBOperatorOriginGuard();
      guard = spawn(process.execPath, [guardModule], {
        cwd: dirname(guardModule), detached: true, env: {}, shell: false,
        stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe', 'pipe', 'ipc'],
      });
      guardFixture = observeDetachedFixture(guard, {
        privatePipes: guard.stdio.slice(3, 6),
      });
      reaper = spawn(process.execPath, [reaperModule], {
        cwd: dirname(reaperModule), detached: true, env: {}, shell: false,
        stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe', guard.stdio[5], 'ipc'],
      });
      reaperFixture = observeDetachedFixture(reaper, {
        privatePipes: reaper.stdio.slice(3, 5),
      });
      guard.stdio[5].destroy();
      const guardReady = waitReady(guard);
      const reaperReady = waitReady(reaper);
      const reaperFrame = Buffer.alloc(8);
      reaperFrame.writeUInt32BE(0x47425250, 0);
      reaperFrame.writeUInt32BE(target.pid, 4);
      reaper.stdio[3].end(reaperFrame, () => reaperFrame.fill(0));
      const guardFrame = Buffer.alloc(8);
      guardFrame.writeUInt32BE(GATE_B_OPERATOR_ORIGIN_GUARD_TARGET_MAGIC, 0);
      guardFrame.writeUInt32BE(target.pid, 4);
      guard.stdio[3].end(guardFrame, () => guardFrame.fill(0));
      const handle = getGateBOperatorOriginGuardHandle(parentGuard);
      await Promise.all([sendHandle(reaper, handle), sendHandle(guard, handle)]);
      await Promise.all([reaperReady, guardReady]);
      guard.stdio[3].destroy();
      assert.equal(await closeGateBOperatorOriginGuard(parentGuard), true);
      parentGuard = undefined;
      await assert.rejects(createGateBOperatorOriginGuard());
      reaper.stdio[4].destroy();
      guard.stdio[4].destroy();
      await Promise.all([
        targetFixture.exited(),
        reaperFixture.exited(),
        guardFixture.exited(),
      ]);
      reaperFixture.closePrivatePipes();
      guardFixture.closePrivatePipes();
      await Promise.all([
        targetFixture.settled(),
        reaperFixture.settled(),
        guardFixture.settled(),
      ]);
      assert.equal(await waitForGroupAbsent(target.pid, 6000), true);
      assert.equal(await waitForGroupAbsent(reaper.pid, 6000), true);
      assert.equal(await waitForGroupAbsent(guard.pid, 6000), true);
      const rebound = await createGateBOperatorOriginGuard();
      assert.equal(await closeGateBOperatorOriginGuard(rebound), true);
    } finally {
      if (parentGuard) await closeGateBOperatorOriginGuard(parentGuard);
      await Promise.all([
        reaperFixture?.cleanup(),
        guardFixture?.cleanup(),
        targetFixture.cleanup(),
      ].filter(Boolean));
    }
  });

test('guard alone retains the listener through TERM-resistant cleanup after outer and reaper loss',
  { timeout: 15_000 }, async () => {
    const hostile = fileURLToPath(new URL(
      '../test-support/gate-b-operator-coordinator-hostile-child.js',
      import.meta.url,
    ));
    const reaperModule = fileURLToPath(new URL(
      '../src/gate-b-operator-reaper.js', import.meta.url,
    ));
    const guardModule = fileURLToPath(new URL(
      '../src/gate-b-operator-origin-guard.js', import.meta.url,
    ));
    const target = spawn(process.execPath, [hostile, 'runtime'], {
      cwd: dirname(hostile), detached: true, env: {}, shell: false,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const targetFixture = observeDetachedFixture(target);
    const targetMessages = [];
    let reaper;
    let guard;
    let reaperFixture;
    let guardFixture;
    let parentGuard;
    const waitReady = child => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('bounded timeout')), 3000);
      child.on('message', message => {
        if (message?.type !== 'READY') return;
        clearTimeout(timer);
        resolve(true);
      });
    });
    const sendHandle = (child, handle) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('bounded timeout')), 1000);
      child.send({ type: 'ARM_ORIGIN_GUARD' }, handle, { keepOpen: true }, error => {
        clearTimeout(timer);
        error ? reject(error) : resolve(true);
      });
    });
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('bounded timeout')), 2000);
        target.on('message', message => {
          if (typeof message?.type === 'string') targetMessages.push(message.type);
          if (message?.type !== 'HOSTILE_READY_runtime') return;
          clearTimeout(timer);
          resolve(true);
        });
      });
      const targetTerm = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('bounded timeout')), 4000);
        const observe = message => {
          if (message?.type !== 'HOSTILE_TERM_runtime') return;
          clearTimeout(timer);
          target.removeListener('message', observe);
          resolve(true);
        };
        target.on('message', observe);
      });
      parentGuard = await createGateBOperatorOriginGuard();
      guard = spawn(process.execPath, [guardModule], {
        cwd: dirname(guardModule), detached: true, env: {}, shell: false,
        stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe', 'pipe', 'ipc'],
      });
      guardFixture = observeDetachedFixture(guard, {
        privatePipes: guard.stdio.slice(3, 6),
      });
      reaper = spawn(process.execPath, [reaperModule], {
        cwd: dirname(reaperModule), detached: true, env: {}, shell: false,
        stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe', guard.stdio[5], 'ipc'],
      });
      reaperFixture = observeDetachedFixture(reaper, {
        privatePipes: reaper.stdio.slice(3, 5),
      });
      const guardReady = waitReady(guard);
      const reaperReady = waitReady(reaper);
      const reaperFrame = Buffer.alloc(8);
      reaperFrame.writeUInt32BE(0x47425250, 0);
      reaperFrame.writeUInt32BE(target.pid, 4);
      reaper.stdio[3].end(reaperFrame, () => reaperFrame.fill(0));
      const guardFrame = Buffer.alloc(8);
      guardFrame.writeUInt32BE(GATE_B_OPERATOR_ORIGIN_GUARD_TARGET_MAGIC, 0);
      guardFrame.writeUInt32BE(target.pid, 4);
      guard.stdio[3].end(guardFrame, () => guardFrame.fill(0));
      const handle = getGateBOperatorOriginGuardHandle(parentGuard);
      await Promise.all([sendHandle(reaper, handle), sendHandle(guard, handle)]);
      await Promise.all([reaperReady, guardReady]);
      guard.stdio[3].destroy();
      assert.equal(await closeGateBOperatorOriginGuard(parentGuard), true);
      parentGuard = undefined;
      await assert.rejects(createGateBOperatorOriginGuard());

      process.kill(-reaper.pid, 'SIGKILL');
      const reaperExit = await reaperFixture.exited();
      reaperFixture.closePrivatePipes();
      const reaperRecord = await reaperFixture.settled();
      assert.deepEqual(reaperRecord.outcome, reaperExit);
      assert.deepEqual(reaperRecord.outcome, { code: null, signal: 'SIGKILL' });
      assert.equal(await waitForGroupAbsent(reaper.pid), true);
      guard.stdio[5].destroy();
      await assert.rejects(createGateBOperatorOriginGuard());
      await requestFixedOriginDenial();

      guard.stdio[4].destroy();
      await targetTerm;
      await assert.rejects(createGateBOperatorOriginGuard());
      const [targetExit, guardExit] = await Promise.all([
        targetFixture.exited(),
        guardFixture.exited(),
      ]);
      guardFixture.closePrivatePipes();
      const [targetRecord, guardRecord] = await Promise.all([
        targetFixture.settled(),
        guardFixture.settled(),
      ]);
      assert.deepEqual(targetRecord.outcome, targetExit);
      assert.deepEqual(guardRecord.outcome, guardExit);
      assert.deepEqual(targetRecord.outcome, { code: null, signal: 'SIGKILL' });
      assert.deepEqual(guardRecord.outcome, { code: 0, signal: null });
      assert.equal(guard.connected, false);
      assert.equal(guard.exitCode, 0);
      assert.equal(guard.signalCode, null);
      assert.equal(await waitForGroupAbsent(target.pid), true);
      assert.equal(await waitForGroupAbsent(guard.pid), true);
      await new Promise(resolve => setTimeout(resolve, 850));
      assert.equal(targetMessages.includes('HOSTILE_LATE_runtime'), false);
      const rebound = await createGateBOperatorOriginGuard();
      assert.equal(await closeGateBOperatorOriginGuard(rebound), true);
    } finally {
      if (parentGuard) await closeGateBOperatorOriginGuard(parentGuard);
      await Promise.all([
        reaperFixture?.cleanup(),
        guardFixture?.cleanup(),
        targetFixture.cleanup(),
      ].filter(Boolean));
    }
  });

test('reaper setup deadline aborts a missing-handle wait and removes the captured target',
  { timeout: 12_000 }, async () => {
    const hostile = fileURLToPath(new URL(
      '../test-support/gate-b-operator-coordinator-hostile-child.js',
      import.meta.url,
    ));
    const reaperModule = fileURLToPath(new URL(
      '../src/gate-b-operator-reaper.js', import.meta.url,
    ));
    const target = spawn(process.execPath, [hostile, 'runtime'], {
      cwd: dirname(hostile), detached: true, env: {}, shell: false,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const targetFixture = observeDetachedFixture(target);
    let reaper;
    let reaperFixture;
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('bounded timeout')), 2000);
        target.on('message', message => {
          if (message?.type !== 'HOSTILE_READY_runtime') return;
          clearTimeout(timer);
          resolve(true);
        });
      });
      reaper = spawn(process.execPath, [reaperModule], {
        cwd: dirname(reaperModule), detached: true, env: {}, shell: false,
        stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe', 'ignore', 'ipc'],
      });
      reaperFixture = observeDetachedFixture(reaper, {
        privatePipes: reaper.stdio.slice(3, 5),
      });
      const frame = Buffer.alloc(8);
      frame.writeUInt32BE(0x47425250, 0);
      frame.writeUInt32BE(target.pid, 4);
      reaper.stdio[3].end(frame, () => frame.fill(0));
      const exitOutcome = await reaperFixture.exited();
      reaperFixture.closePrivatePipes();
      const { outcome } = await reaperFixture.settled();
      assert.deepEqual(outcome, exitOutcome);
      assert.deepEqual(outcome, { code: 1, signal: null });
      await targetFixture.settled();
      assert.equal(await waitForGroupAbsent(target.pid), true);
      assert.equal(await waitForGroupAbsent(reaper.pid), true);
    } finally {
      await Promise.all([
        reaperFixture?.cleanup(),
        targetFixture.cleanup(),
      ].filter(Boolean));
    }
  });

test('reaper missing-handle setup aborts on outer EOF, disconnect, and TERM',
  { timeout: 20_000 }, async t => {
    const hostile = fileURLToPath(new URL(
      '../test-support/gate-b-operator-coordinator-hostile-child.js',
      import.meta.url,
    ));
    const reaperModule = fileURLToPath(new URL(
      '../src/gate-b-operator-reaper.js', import.meta.url,
    ));
    for (const [name, activate] of [
      ['outer-eof', child => child.stdio[4].destroy()],
      ['disconnect', child => child.disconnect()],
      ['term', child => child.kill('SIGTERM')],
    ]) await t.test(name, async () => {
      const target = spawn(process.execPath, [hostile, 'runtime'], {
        cwd: dirname(hostile), detached: true, env: {}, shell: false,
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });
      const targetFixture = observeDetachedFixture(target);
      let reaper;
      let reaperFixture;
      const messages = [];
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('bounded timeout')), 2000);
          target.on('message', message => {
            if (typeof message?.type === 'string') messages.push(message.type);
            if (message?.type !== 'HOSTILE_READY_runtime') return;
            clearTimeout(timer);
            resolve(true);
          });
        });
        const targetTerm = new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('bounded timeout')), 3000);
          const observe = message => {
            if (message?.type !== 'HOSTILE_TERM_runtime') return;
            clearTimeout(timer);
            target.removeListener('message', observe);
            resolve(true);
          };
          target.on('message', observe);
        });
        reaper = spawn(process.execPath, [reaperModule], {
          cwd: dirname(reaperModule), detached: true, env: {}, shell: false,
          stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe', 'ignore', 'ipc'],
        });
        reaperFixture = observeDetachedFixture(reaper, {
          privatePipes: reaper.stdio.slice(3, 5),
          requireClose: name !== 'disconnect',
        });
        const frame = Buffer.alloc(8);
        frame.writeUInt32BE(0x47425250, 0);
        frame.writeUInt32BE(target.pid, 4);
        reaper.stdio[3].end(frame, () => frame.fill(0));
        await new Promise(resolve => setTimeout(resolve, 100));
        activate(reaper);
        await targetTerm;
        const [targetExit, reaperExit] = await Promise.all([
          targetFixture.exited(),
          reaperFixture.exited(),
        ]);
        reaperFixture.closePrivatePipes();
        const [targetRecord, reaperRecord] = await Promise.all([
          targetFixture.settled(),
          reaperFixture.settled(),
        ]);
        assert.deepEqual(targetRecord.outcome, targetExit);
        assert.deepEqual(reaperRecord.outcome, reaperExit);
        assert.deepEqual(targetRecord.outcome, { code: null, signal: 'SIGKILL' });
        assert.deepEqual(reaperRecord.outcome, { code: 1, signal: null });
        assert.equal(reaper.connected, false);
        assert.equal(reaper.exitCode, 1);
        assert.equal(reaper.signalCode, null);
        assert.equal(messages.includes('HOSTILE_TERM_runtime'), true);
        await new Promise(resolve => setTimeout(resolve, 850));
        assert.equal(messages.includes('HOSTILE_LATE_runtime'), false);
        assert.equal(await waitForGroupAbsent(target.pid), true);
        assert.equal(await waitForGroupAbsent(reaper.pid), true);
      } finally {
        await Promise.all([
          reaperFixture?.cleanup(),
          targetFixture.cleanup(),
        ].filter(Boolean));
      }
    });
  });

test('guard aborts a missing-handle wait when both independent owners are gone',
  { timeout: 12_000 }, async () => {
    const hostile = fileURLToPath(new URL(
      '../test-support/gate-b-operator-coordinator-hostile-child.js',
      import.meta.url,
    ));
    const guardModule = fileURLToPath(new URL(
      '../src/gate-b-operator-origin-guard.js', import.meta.url,
    ));
    const target = spawn(process.execPath, [hostile, 'runtime'], {
      cwd: dirname(hostile), detached: true, env: {}, shell: false,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const targetFixture = observeDetachedFixture(target);
    let guard;
    let guardFixture;
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('bounded timeout')), 2000);
        target.on('message', message => {
          if (message?.type !== 'HOSTILE_READY_runtime') return;
          clearTimeout(timer);
          resolve(true);
        });
      });
      guard = spawn(process.execPath, [guardModule], {
        cwd: dirname(guardModule), detached: true, env: {}, shell: false,
        stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe', 'pipe', 'ipc'],
      });
      guardFixture = observeDetachedFixture(guard, {
        privatePipes: guard.stdio.slice(3, 6),
      });
      const frame = Buffer.alloc(8);
      frame.writeUInt32BE(GATE_B_OPERATOR_ORIGIN_GUARD_TARGET_MAGIC, 0);
      frame.writeUInt32BE(target.pid, 4);
      guard.stdio[3].end(frame, () => frame.fill(0));
      await new Promise(resolve => setTimeout(resolve, 100));
      guard.stdio[4].destroy();
      guard.stdio[5].destroy();
      const [targetExit, guardExit] = await Promise.all([
        targetFixture.exited(),
        guardFixture.exited(),
      ]);
      guardFixture.closePrivatePipes();
      const { outcome } = await guardFixture.settled();
      assert.deepEqual(outcome, guardExit);
      assert.deepEqual(outcome, { code: 1, signal: null });
      assert.deepEqual((await targetFixture.settled()).outcome, targetExit);
      assert.equal(await waitForGroupAbsent(target.pid), true);
      assert.equal(await waitForGroupAbsent(guard.pid), true);
    } finally {
      await Promise.all([
        guardFixture?.cleanup(),
        targetFixture.cleanup(),
      ].filter(Boolean));
    }
  });

test('ambiguous guard setup remains a fixed-denial protective quarantine',
  { timeout: 10_000 }, async () => {
    const guardModule = fileURLToPath(new URL(
      '../src/gate-b-operator-origin-guard.js', import.meta.url,
    ));
    let guard;
    let guardFixture;
    let parentGuard;
    try {
      parentGuard = await createGateBOperatorOriginGuard();
      guard = spawn(process.execPath, [guardModule], {
        cwd: dirname(guardModule), detached: true, env: {}, shell: false,
        stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe', 'pipe', 'ipc'],
      });
      guardFixture = observeDetachedFixture(guard, {
        privatePipes: guard.stdio.slice(3, 6),
      });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('bounded timeout')), 1000);
        guard.send(
          { type: 'ARM_ORIGIN_GUARD' },
          getGateBOperatorOriginGuardHandle(parentGuard),
          { keepOpen: true },
          error => {
            clearTimeout(timer);
            error ? reject(error) : resolve(true);
          },
        );
      });
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(await closeGateBOperatorOriginGuard(parentGuard), true);
      parentGuard = undefined;
      await requestFixedOriginDenial();
      guard.stdio[4].destroy();
      guard.stdio[5].destroy();
      await new Promise(resolve => setTimeout(resolve, 2300));
      assert.equal(await waitForGroupAbsent(guard.pid, 50), false);
      await assert.rejects(createGateBOperatorOriginGuard());
      await requestFixedOriginDenial();
      process.kill(-guard.pid, 'SIGKILL');
      const exitOutcome = await guardFixture.exited();
      guardFixture.closePrivatePipes();
      assert.deepEqual((await guardFixture.settled()).outcome, {
        code: null,
        signal: 'SIGKILL',
      });
      assert.deepEqual(exitOutcome, { code: null, signal: 'SIGKILL' });
      assert.equal(await waitForGroupAbsent(guard.pid), true);
      guard.stdio[3].destroy();
      const rebound = await createGateBOperatorOriginGuard();
      assert.equal(await closeGateBOperatorOriginGuard(rebound), true);
    } finally {
      if (parentGuard) await closeGateBOperatorOriginGuard(parentGuard);
      if (guardFixture) await guardFixture.cleanup();
    }
  });

test('outer alone retains fixed denial after reaper and guard loss until watchdog proof',
  { timeout: 15_000 }, async () => {
    const hostile = fileURLToPath(new URL(
      '../test-support/gate-b-operator-coordinator-hostile-child.js',
      import.meta.url,
    ));
    const children = [];
    const signals = [];
    let denialDuringCleanup;
    let rebindDuringCleanup;
    let capability;
    try {
      capability = await launchGateBOperatorWatchdogSetup({
        killProcessGroup(groupId, signal) {
          const role = children.findIndex(child => child.pid === groupId);
          signals.push([role, signal]);
          if (role === 0 && signal === 'SIGTERM') {
            denialDuringCleanup = requestFixedOriginDenial();
            rebindDuringCleanup = createGateBOperatorOriginGuard().then(
              async value => {
                await closeGateBOperatorOriginGuard(value);
                return false;
              },
              () => true,
            );
          }
          process.kill(-groupId, signal);
        },
        platform: 'darwin',
        probeProcessGroup(groupId) {
          try { process.kill(-groupId, 0); return true; } catch (error) {
            if (error?.code === 'ESRCH') return false;
            if (error?.code === 'EPERM') return true;
            throw error;
          }
        },
        reapAbandonMs: 1200,
        reapForceMs: 200,
        setupTimeoutMs: 1000,
        spawnProcess(executable, args, options) {
          const child = spawn(executable, args, options);
          children.push(child);
          return child;
        },
        terminalWaitMs: 3000,
        watchdogModule: hostile,
      });
      assert.equal(children.length, 3);
      process.kill(-children[2].pid, 'SIGKILL');
      process.kill(-children[1].pid, 'SIGKILL');
      assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'QUARANTINED');
      assert.equal(typeof denialDuringCleanup?.then, 'function');
      assert.equal(await denialDuringCleanup, undefined);
      assert.equal(await rebindDuringCleanup, true);
      assert.equal(signals.some(([role, signal]) => role === 0 && signal === 'SIGTERM'), true);
      assert.equal(signals.some(([role, signal]) => role === 0 && signal === 'SIGKILL'), true);
      for (const child of children) assert.equal(await waitForGroupAbsent(child.pid), true);
      await new Promise(resolve => setTimeout(resolve, 850));
      for (const child of children) assert.equal(await waitForGroupAbsent(child.pid, 50), true);
      const rebound = await createGateBOperatorOriginGuard();
      assert.equal(await closeGateBOperatorOriginGuard(rebound), true);
    } finally {
      for (const child of children) {
        if (!Number.isSafeInteger(child.pid) || await waitForGroupAbsent(child.pid, 100)) continue;
        try { process.kill(-child.pid, 'SIGKILL'); } catch {}
        await waitForGroupAbsent(child.pid, 1000);
      }
    }
  });

test('fixed reaper rejects partial and mismatched private targets before activation',
  { timeout: 10_000 }, async t => {
    const reaper = fileURLToPath(new URL('../src/gate-b-operator-reaper.js', import.meta.url));
    for (const [name, frame] of [
      ['partial', Buffer.from([0x47, 0x42, 0x52])],
      ['mismatched', (() => {
        const value = Buffer.alloc(8);
        value.writeUInt32BE(0x47425251, 0);
        value.writeUInt32BE(0, 4);
        return value;
      })()],
    ]) await t.test(name, async () => {
      let frameCleared = false;
      const clearFrame = () => {
        if (frameCleared) return;
        frameCleared = true;
        frame.fill(0);
      };
      const child = spawn(process.execPath, [reaper], {
        cwd: dirname(reaper), detached: true, env: {}, shell: false,
        stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe', 'ipc'],
      });
      const messages = [];
      child.on('message', message => messages.push(message));
      const fixture = observeDetachedFixture(child, {
        privatePipes: child.stdio.slice(3, 5),
        timeoutMs: 3000,
      });
      try {
        child.stdio[3].end(frame, clearFrame);
        const { outcome, pipeSettlements } = await fixture.settled();
        assert.equal(pipeSettlements.length, 2);
        assert.deepEqual(outcome, { code: 1, signal: null });
        assert.deepEqual(messages, []);
        assert.equal(await waitForGroupAbsent(child.pid), true);
      } finally {
        clearFrame();
        await fixture.cleanup();
      }
    });
  });

test('reaper alone retains denial after joined readiness and outer plus guard hard loss',
  { timeout: 15_000 }, async () => {
    const hostile = fileURLToPath(new URL(
      '../test-support/gate-b-operator-coordinator-hostile-child.js',
      import.meta.url,
    ));
    const reaperModule = fileURLToPath(new URL(
      '../src/gate-b-operator-reaper.js',
      import.meta.url,
    ));
    const guardModule = fileURLToPath(new URL(
      '../src/gate-b-operator-origin-guard.js',
      import.meta.url,
    ));
    const target = spawn(process.execPath, [hostile, 'runtime'], {
      cwd: dirname(hostile), detached: true, env: {}, shell: false,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const targetFixture = observeDetachedFixture(target);
    const targetMessages = [];
    const guardMessages = [];
    const reaperMessages = [];
    let guard;
    let reaper;
    let guardFixture;
    let reaperFixture;
    let parentGuard;
    const holderReady = (child, messages) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('bounded timeout')), 3000);
      child.on('message', message => {
        messages.push(message);
        if (message?.type !== 'READY') return;
        clearTimeout(timer);
        resolve(true);
      });
    });
    const sendHandle = (child, handle) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('bounded timeout')), 1000);
      child.send({ type: 'ARM_ORIGIN_GUARD' }, handle, { keepOpen: true }, error => {
        clearTimeout(timer);
        error ? reject(error) : resolve(true);
      });
    });
    try {
      const targetReady = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('bounded timeout')), 2000);
        target.on('message', message => {
          if (typeof message?.type === 'string') targetMessages.push(message.type);
          if (message?.type !== 'HOSTILE_READY_runtime') return;
          clearTimeout(timer);
          resolve(true);
        });
      });
      const targetTerm = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('bounded timeout')), 5000);
        const observe = message => {
          if (message?.type !== 'HOSTILE_TERM_runtime') return;
          clearTimeout(timer);
          target.removeListener('message', observe);
          resolve(true);
        };
        target.on('message', observe);
      });
      await targetReady;

      parentGuard = await createGateBOperatorOriginGuard();
      guard = spawn(process.execPath, [guardModule], {
        cwd: dirname(guardModule), detached: true, env: {}, shell: false,
        stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe', 'pipe', 'ipc'],
      });
      guardFixture = observeDetachedFixture(guard, {
        privatePipes: guard.stdio.slice(3, 6),
      });
      const guardReady = holderReady(guard, guardMessages);

      reaper = spawn(process.execPath, [reaperModule], {
        cwd: dirname(reaperModule), detached: true, env: {}, shell: false,
        stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe', guard.stdio[5], 'ipc'],
      });
      reaperFixture = observeDetachedFixture(reaper, {
        privatePipes: reaper.stdio.slice(3, 5),
      });
      const reaperClosed = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('bounded timeout')), 7000);
        reaper.once('error', reject);
        reaper.once('close', (code, signal) => {
          clearTimeout(timer);
          let targetGroupAbsent = false;
          try { process.kill(-target.pid, 0); } catch (error) {
            if (error?.code === 'ESRCH') targetGroupAbsent = true;
            else return reject(error);
          }
          resolve({ code, signal, targetGroupAbsent });
        });
      });
      const reaperReady = holderReady(reaper, reaperMessages);
      guard.stdio[5].destroy();

      const handle = getGateBOperatorOriginGuardHandle(parentGuard);
      await Promise.all([
        writePrivateTargetFrame(reaper.stdio[3], 0x47425250, target.pid),
        writePrivateTargetFrame(
          guard.stdio[3],
          GATE_B_OPERATOR_ORIGIN_GUARD_TARGET_MAGIC,
          target.pid,
        ),
        sendHandle(reaper, handle),
        sendHandle(guard, handle),
      ]);
      await Promise.all([reaperReady, guardReady]);
      assert.deepEqual(guardMessages.map(message => message?.type), ['READY']);
      assert.deepEqual(reaperMessages.map(message => message?.type), ['READY']);
      assert.equal([...guardMessages, ...reaperMessages].every(message =>
        Reflect.ownKeys(message).length === 1 &&
        Reflect.ownKeys(message)[0] === 'type'), true);

      process.kill(-guard.pid, 'SIGKILL');
      const guardExit = await guardFixture.exited();
      guardFixture.closePrivatePipes();
      const guardRecord = await guardFixture.settled();
      assert.deepEqual(guardRecord.outcome, guardExit);
      assert.deepEqual(guardRecord.outcome, { code: null, signal: 'SIGKILL' });
      assert.equal(await waitForGroupAbsent(guard.pid), true);
      assert.equal(await closeGateBOperatorOriginGuard(parentGuard), true);
      parentGuard = undefined;

      await requestFixedOriginDenial();
      await assert.rejects(createGateBOperatorOriginGuard());

      reaper.stdio[4].destroy();
      await targetTerm;
      assert.doesNotThrow(() => process.kill(-target.pid, 0));
      await requestFixedOriginDenial();
      await assert.rejects(createGateBOperatorOriginGuard());
      await new Promise(resolve => setTimeout(resolve, 200));
      assert.doesNotThrow(() => process.kill(-target.pid, 0));
      await requestFixedOriginDenial();
      await assert.rejects(createGateBOperatorOriginGuard());

      assert.deepEqual((await targetFixture.settled()).outcome, {
        code: null,
        signal: 'SIGKILL',
      });
      assert.equal(await waitForGroupAbsent(target.pid), true);
      await reaperFixture.exited();
      reaperFixture.closePrivatePipes();
      const [closedRecord, reaperRecord] = await Promise.all([
        reaperClosed,
        reaperFixture.settled(),
      ]);
      assert.deepEqual(closedRecord, {
        code: 0,
        signal: null,
        targetGroupAbsent: true,
      });
      assert.deepEqual(reaperRecord.outcome, { code: 0, signal: null });
      assert.equal(await waitForGroupAbsent(reaper.pid), true);
      assert.deepEqual(reaperMessages.map(message => message?.type), ['READY']);
      assert.equal(reaperMessages.some(message => message?.type === 'ABSENT'), false);
      await new Promise(resolve => setTimeout(resolve, 850));
      assert.equal(targetMessages.includes('HOSTILE_TERM_runtime'), true);
      assert.equal(targetMessages.includes('HOSTILE_LATE_runtime'), false);

      const rebound = await createGateBOperatorOriginGuard();
      assert.equal(await closeGateBOperatorOriginGuard(rebound), true);
    } finally {
      if (parentGuard) await closeGateBOperatorOriginGuard(parentGuard);
      await Promise.all([
        reaperFixture?.cleanup(),
        guardFixture?.cleanup(),
        targetFixture.cleanup(),
      ].filter(Boolean));
    }
  });

test('reaper alone retains the listener and emits ABSENT only after target-group proof',
  { timeout: 10_000 }, async () => {
    const hostile = fileURLToPath(new URL(
      '../test-support/gate-b-operator-coordinator-hostile-child.js',
      import.meta.url,
    ));
    const reaperModule = fileURLToPath(new URL(
      '../src/gate-b-operator-reaper.js',
      import.meta.url,
    ));
    const target = spawn(process.execPath, [hostile, 'runtime'], {
      cwd: dirname(hostile), detached: true, env: {}, shell: false,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const targetFixture = observeDetachedFixture(target);
    let reaper;
    let reaperFixture;
    let parentGuard;
    const targetMessages = [];
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('bounded timeout')), 2000);
        target.on('message', message => {
          if (typeof message?.type === 'string') targetMessages.push(message.type);
          if (message?.type !== 'HOSTILE_READY_runtime') return;
          clearTimeout(timer);
          resolve(true);
        });
      });
      parentGuard = await createGateBOperatorOriginGuard();
      reaper = spawn(process.execPath, [reaperModule], {
        cwd: dirname(reaperModule), detached: true, env: {}, shell: false,
        stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe', 'ignore', 'ipc'],
      });
      reaperFixture = observeDetachedFixture(reaper, {
        privatePipes: reaper.stdio.slice(3, 5),
      });
      const messages = [];
      const ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('bounded timeout')), 2000);
        reaper.on('message', message => {
          messages.push(message);
          if (message?.type !== 'READY') return;
          clearTimeout(timer);
          resolve(true);
        });
      });
      const frame = Buffer.alloc(8);
      frame.writeUInt32BE(0x47425250, 0);
      frame.writeUInt32BE(target.pid, 4);
      reaper.stdio[3].end(frame, () => frame.fill(0));
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('bounded timeout')), 1000);
        reaper.send(
          { type: 'ARM_ORIGIN_GUARD' },
          getGateBOperatorOriginGuardHandle(parentGuard),
          { keepOpen: true },
          error => {
            clearTimeout(timer);
            error ? reject(error) : resolve(true);
          },
        );
      });
      await ready;
      assert.equal(await closeGateBOperatorOriginGuard(parentGuard), true);
      parentGuard = undefined;
      await assert.rejects(createGateBOperatorOriginGuard());
      await requestFixedOriginDenial();
      const absent = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('bounded timeout')), 4000);
        const observe = message => {
          if (message?.type !== 'ABSENT') return;
          clearTimeout(timer);
          reaper.removeListener('message', observe);
          resolve(true);
        };
        reaper.on('message', observe);
      });
      reaper.send({ type: 'CLEANUP' });
      await waitFor(() => targetMessages.includes('HOSTILE_TERM_runtime'), 2000);
      await assert.rejects(createGateBOperatorOriginGuard());
      await absent;
      assert.deepEqual((await targetFixture.settled()).outcome, {
        code: null,
        signal: 'SIGKILL',
      });
      assert.throws(() => process.kill(-target.pid, 0), error => error?.code === 'ESRCH');
      reaper.stdio[4].destroy();
      const exitOutcome = await reaperFixture.exited();
      reaperFixture.closePrivatePipes();
      const { outcome } = await reaperFixture.settled();
      assert.deepEqual(outcome, exitOutcome);
      assert.deepEqual(outcome, { code: 0, signal: null });
      assert.deepEqual(messages.map(message => message.type), ['READY', 'ABSENT']);
      assert.equal(messages.every(message =>
        Reflect.ownKeys(message).length === 1 && Reflect.ownKeys(message)[0] === 'type'), true);
      assert.equal(await waitForGroupAbsent(reaper.pid), true);
      assert.equal(targetMessages.includes('HOSTILE_TERM_runtime'), true);
      await new Promise(resolve => setTimeout(resolve, 850));
      assert.equal(targetMessages.includes('HOSTILE_LATE_runtime'), false);
    } finally {
      if (parentGuard) await closeGateBOperatorOriginGuard(parentGuard);
      await Promise.all([
        reaperFixture?.cleanup(),
        targetFixture.cleanup(),
      ].filter(Boolean));
    }
  });

test('real hostile coordinator and same-group descendant are reaped as one quarantined PGID',
  { timeout: 10_000 }, async () => {
    const hostileModule = fileURLToPath(new URL(
      '../test-support/gate-b-operator-coordinator-hostile-child.js',
      import.meta.url,
    ));
    let groupId;
    const observed = [];
    await assert.rejects(launchGateBOperatorCoordinator(bootstrap(), {
      cliModule: hostileModule,
      executable: process.execPath,
      killProcessGroup(pid, signal) { process.kill(-pid, signal); },
      lifetimeMs: 1000,
      platform: 'darwin',
      probeProcessGroup(pid) {
        try { process.kill(-pid, 0); return true; } catch (error) {
          if (error?.code === 'ESRCH') return false;
          if (error?.code === 'EPERM') return true;
          throw error;
        }
      },
      reapAbandonMs: 1500,
      reapForceMs: 500,
      spawnProcess(executable, args, options) {
        const child = spawn(executable, args, options);
        child.on('message', message => {
          if (typeof message?.type === 'string') observed.push(message.type);
        });
        groupId = child.pid;
        return child;
      },
    }));
    assert.equal(Number.isSafeInteger(groupId), true);
    assert.throws(() => process.kill(-groupId, 0), error => error?.code === 'ESRCH');
    assert.equal(observed.includes('HOSTILE_READY'), true);
    assert.equal(observed.some(type => type.startsWith('HOSTILE_TERM_')), true);
    await new Promise(resolve => setTimeout(resolve, 850));
    assert.equal(observed.some(type => type.startsWith('HOSTILE_LATE_')), false);
  });

test('source boundary has fixed module launch, no shell or ad hoc code, and no run/payment seam', async () => {
  const files = [
    '../src/gate-b-operator-coordinator-launcher.js',
    '../src/gate-b-operator-coordinator-cli.js',
    '../src/gate-b-operator-config-review-child.js',
    '../src/gate-b-operator-front-end.js',
    '../src/gate-b-operator-watchdog.js',
    '../src/gate-b-operator-reaper.js',
    '../src/gate-b-operator-origin-guard.js',
  ];
  const source = (await Promise.all(files.map(file => readFile(
    new URL(file, import.meta.url),
    'utf8',
  )))).join('\n');
  for (const token of [
    "'-e'", 'shell: true', 'process.env', 'runPublicWsOnce', 'executePublicWsOnce',
    'paidFetch', 'publishRawTransaction', 'createGateBBuyerWallet', 'buyer-wallet.json',
  ]) assert.equal(source.includes(token), false);
  const cliSource = await readFile(
    new URL('../src/gate-b-operator-coordinator-cli.js', import.meta.url),
    'utf8',
  );
  assert.match(cliSource, /prepareGateBPublicWsInputsForReviewInInheritedProcessGroup/);
  const launcherSource = await readFile(
    new URL('../src/gate-b-operator-coordinator-launcher.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(launcherSource, /createGateBOperatorCoordinatorFrameReader/);
  assert.doesNotMatch(launcherSource, /pathToFileURL/);
  assert.doesNotMatch(launcherSource, /fstatSync/);
  const watchdogSource = await readFile(
    new URL('../src/gate-b-operator-watchdog.js', import.meta.url),
    'utf8',
  );
  assert.match(watchdogSource, /createGateBOperatorCoordinatorFrameReader/);
  assert.match(watchdogSource, /pathToFileURL/);
  assert.doesNotMatch(watchdogSource, /REAPER_MODULE|REAPER_READY|process\.(?:pid|ppid)/);
  const schemaSource = await readFile(
    new URL('../src/gate-b-operator-coordinator-schema.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(schemaSource, /REAPER_READY|groupId/);
  const frontEndSource = await readFile(
    new URL('../src/gate-b-operator-front-end.js', import.meta.url),
    'utf8',
  );
  assert.match(frontEndSource, /launchGateBOperatorWatchdogSetup/);
  assert.match(frontEndSource, /submitGateBOperatorBootstrap/);
  assert.doesNotMatch(frontEndSource, /launchGateBOperatorWatchdog\b/);
  assert.match(watchdogSource,
    /exactFieldlessControl\(candidate, 'BOOTSTRAP_OPEN'\)[\s\S]{0,700}createReadStream/);
  assert.match(watchdogSource,
    /exactFieldlessControl\(candidate, 'REVIEW_OPEN'\)[\s\S]{0,500}openReviewPhase/);
  assert.match(launcherSource, /'BOOTSTRAP_OPEN'[\s\S]{0,1000}bootstrapOpenAck/);
  assert.match(launcherSource, /'REVIEW_OPEN'[\s\S]{0,1000}reviewOpenAck/);
});

test('documentation limits terminal recovery to exact Node controls and Boolean raw state',
  async () => {
    const documents = await Promise.all([
      '../README.md', '../SECURITY.md', '../docs/IMPLEMENTATION_PLAN.md',
    ].map(file => readFile(new URL(file, import.meta.url), 'utf8')));
    for (const document of documents) {
      assert.doesNotMatch(document, /every catchable|exact restoration of (?:the )?(?:prior|original) terminal mode|prior terminal state must be exactly restored/i);
      assert.match(document, /captured Node `isRaw` Boolean/);
      assert.match(document, /`SIGINT`, `SIGTERM`, process `disconnect`/);
      assert.match(document, /raw-mode control-byte rejection/);
      assert.match(document, /`SIGKILL` or `SIGSTOP`/);
      assert.match(document, /`SIGHUP`, `SIGQUIT`, or `SIGTSTP`/);
      assert.match(document, /no echo and captured Boolean raw-state recovery/);
      assert.match(document, /not complete termios equivalence/);
    }
  });

test('documentation distinguishes pre-run custody from the bounded Phase-3 exception',
  async () => {
    const documents = await Promise.all([
      '../README.md', '../SECURITY.md', '../docs/IMPLEMENTATION_PLAN.md',
    ].map(file => readFile(new URL(file, import.meta.url), 'utf8')));
    for (const document of documents) {
      assert.match(document, /exactly `127\.0\.0\.1:41000` as an exclusive IPv4 listener/);
      assert.match(document, /same kernel listening socket, not three independent binds/);
      assert.match(document, /All three holders actively accept/);
      assert.match(document, /watchdog, guard and reaper (?:are|remain) three detached siblings/);
      assert.doesNotMatch(document, /Both siblings have distinct outer-liveness descriptors/);
      assert.match(document, /holder `READY` covers only the child-observable/);
      assert.match(document, /separately joins both holder `READY` frames with both target-write callbacks and both handle-transfer callbacks/);
      assert.doesNotMatch(document, /`READY`[^\n]{0,300}(?:means|requires)[^\n]{0,300}(?:successful )?handle-transfer callback/i);
      assert.match(document, /fixed raw-TCP HTTP 503 denial/);
      assert.match(document, /zero-length body, `Connection: close`, `Cache-Control: no-store`/);
      assert.match(document, /Every accepted connection is ended with the fixed denial; idle, failed or over-limit sockets are destroyed/);
      assert.doesNotMatch(document, /malformed[^\n]{0,80}(?:is|are) destroyed/i);
      assert.match(document, /intentional pre-RUN loopback network effect/);
      assert.match(document, /After the outer has joined both holder `READY` frames with both target-write and handle-transfer callbacks, any surviving holder preserves fixed-denial port custody/);
      assert.doesNotMatch(document, /(?:^|\n)Any surviving holder preserves fixed-denial port custody/m);
      assert.doesNotMatch(document, /inert (?:watchdog )?group under (?:the )?(?:listener's )?protective (?:listener )?custody/i);
      assert.match(document, /Module imports(?: and offline validation)? (?:are|remain) inert/);
      assert.match(document, /(?:Offline validation uses only synthetic processes and local loopback; it invokes no live tunnel, external-network endpoint|offline validation remain inert and invoke no live tunnel, external endpoint), RPC, wallet, funding, signing, payment, publication or RUN effect/i);
      assert.doesNotMatch(document, /This offline-tested slice performed none of those effects|Import and local tests invoke no live tunnel, network/);
      assert.match(document, /bounded testnet-only close\/rebind exception/);
      assert.match(document, /not the production listener-handoff design/);
      assert.match(document, /guard and reaper close and acknowledge their listener copies, then the outer closes its copy once/);
      assert.match(document, /Only after the existing facilitator exclusively binds the exact loopback port, public-route health succeeds, and the exact expected 402 is observed may lazy wallet opening, signing and the one payment proceed/);
      assert.match(document, /competing bind, a holder-release timeout, or a facilitator bind timeout quarantines before wallet access/);
      assert.match(document, /If delivery of `ORIGIN_RELEASED` is ambiguous, the one-use latch remains burned and the sender quarantines with no retry or replacement/);
      assert.match(document, /watchdog may already have consumed the message and downstream effects, including the exact payment, may already have occurred/);
      assert.match(document, /Subsequent reconciliation is limited to that exact attempt and payment/);
      assert.doesNotMatch(document, /ambiguous acknowledgement quarantines before wallet access/);
      assert.match(document, /trusted host kernel, root and same-UID processes remain inside the security boundary/);
      assert.match(document, /deliberate availability gap removes guard fallback during the run/);
      assert.match(document, /crash recovery cannot preserve the earlier fixed-denial listener/);
      assert.match(document, /same kernel listener with no close\/rebind gap/);
      assert.match(document, /retire every active fixed-denial acceptor/);
      assert.match(document, /retain the guard as the 503 fallback on server loss/);
      assert.match(document, /default-off, non-production, never publishes, and does not close Issue #45/);
      assert.doesNotMatch(document, /passive (?:copy|holder)/i);
    }
    assert.match(documents[2], /previously merged coordinator base was confined to exactly nineteen paths/);
    assert.match(documents[2], /This origin-port correction changes exactly seven paths/);
  });

function fakeOperatorTty() {
  const stream = new PassThrough();
  Object.defineProperties(stream, {
    isRaw: { configurable: false, enumerable: true, writable: true, value: false },
    isTTY: { configurable: false, enumerable: true, writable: false, value: true },
    setRawMode: {
      configurable: true,
      enumerable: true,
      writable: false,
      value(value) {
        this.isRaw = value;
        this.emit('raw-mode-change', value);
        return this;
      },
    },
  });
  return stream;
}

test('operator front-end accepts three canonical no-echo phases and restores the TTY', async () => {
  const input = fakeOperatorTty();
  const channel = new EventEmitter();
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  const lines = [];
  output.on('data', chunk => lines.push(chunk.toString('utf8')));
  const capability = Object.freeze(Object.create(null));
  let stops = 0;
  const pending = runGateBOperatorFrontEnd({
    argv: [], channel, errorOutput, input, output,
    outputTimeoutMs: 100, phase1TimeoutMs: 1000, phase2TimeoutMs: 1000,
    phase3TimeoutMs: 1000,
    launchSetup: async () => capability,
    submitBootstrap: async (candidate, value) => {
      assert.equal(candidate, capability);
      assert.deepEqual(value, bootstrap());
      return capability;
    },
    submitReview: async (candidate, value) => {
      assert.equal(candidate, capability);
      assert.deepEqual(value, review());
      return 'PREFLIGHT_VALID';
    },
    submitRun: async (candidate, value) => {
      assert.equal(candidate, capability);
      assert.deepEqual(value, runAuthorization());
      return 'PENDING';
    },
    stopCoordinator: async candidate => {
      assert.equal(candidate, capability);
      stops += 1;
      return 'CLOSED_PENDING';
    },
    waitClosed: async candidate => candidate === capability ? 'CLOSED_PENDING' : 'FAILED',
  });
  await waitFor(() => lines.includes(GATE_B_OPERATOR_FRONT_END_PHASE_1_REQUIRED) && input.isRaw);
  input.write(Buffer.from(`${canonicalJson(bootstrap())}\r`, 'utf8'));
  await waitFor(() =>
    lines.includes(GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.REVIEW_REQUIRED) && input.isRaw);
  input.write(Buffer.from(`${canonicalJson(review())}\r`, 'utf8'));
  await waitFor(() => lines.includes(GATE_B_OPERATOR_FRONT_END_PHASE_3_REQUIRED) && input.isRaw);
  input.write(Buffer.from(`${canonicalJson(runAuthorization())}\r`, 'utf8'));
  assert.equal(await pending, true);
  assert.equal(input.isRaw, false);
  assert.equal(stops, 1);
  assert.deepEqual(lines, [
    GATE_B_OPERATOR_FRONT_END_PHASE_1_REQUIRED,
    GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.REVIEW_REQUIRED,
    GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.PREFLIGHT_VALID,
    GATE_B_OPERATOR_FRONT_END_PHASE_3_REQUIRED,
    GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.PENDING,
    GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.CLOSED_PENDING,
  ]);
  assert.equal(errorOutput.readableLength, 0);
});

test('held prompt callbacks cannot start phase clocks before near-boundary input', async () => {
  const input = fakeOperatorTty();
  const channel = new EventEmitter();
  const callbacks = new Map();
  const output = {
    write(line, callback) {
      if (line === GATE_B_OPERATOR_FRONT_END_PHASE_1_REQUIRED ||
          line === GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.REVIEW_REQUIRED) {
        callbacks.set(line, callback);
      } else {
        queueMicrotask(() => callback(null));
      }
      return true;
    },
  };
  const errorOutput = new PassThrough();
  const capability = Object.freeze(Object.create(null));
  let bootstrapSubmissions = 0;
  let reviewSubmissions = 0;
  let runSubmissions = 0;
  const pending = runGateBOperatorFrontEnd({
    argv: [], channel, errorOutput, input, output,
    outputTimeoutMs: 200, phase1TimeoutMs: 30, phase2TimeoutMs: 30,
    phase3TimeoutMs: 1000,
    launchSetup: async () => capability,
    submitBootstrap: async () => { bootstrapSubmissions += 1; return capability; },
    submitReview: async () => { reviewSubmissions += 1; return 'PREFLIGHT_VALID'; },
    submitRun: async () => { runSubmissions += 1; return 'PENDING'; },
    stopCoordinator: async () => 'CLOSED_PENDING',
    waitClosed: async () => 'CLOSED_PENDING',
  });
  await waitFor(() => callbacks.has(GATE_B_OPERATOR_FRONT_END_PHASE_1_REQUIRED));
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(input.isRaw, false);
  assert.equal(bootstrapSubmissions, 0);
  const phase1Reading = new Promise(resolve => {
    input.once('raw-mode-change', value => {
      assert.equal(value, true);
      resolve();
    });
  });
  callbacks.get(GATE_B_OPERATOR_FRONT_END_PHASE_1_REQUIRED)(null);
  await phase1Reading;
  await new Promise(resolve => setTimeout(resolve, 20));
  input.write(Buffer.from(`${canonicalJson(bootstrap())}\r`, 'utf8'));

  await waitFor(() => callbacks.has(
    GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.REVIEW_REQUIRED));
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(input.isRaw, false);
  assert.equal(reviewSubmissions, 0);
  const phase2Reading = new Promise(resolve => {
    input.once('raw-mode-change', value => {
      assert.equal(value, true);
      resolve();
    });
  });
  callbacks.get(GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.REVIEW_REQUIRED)(null);
  await phase2Reading;
  await new Promise(resolve => setTimeout(resolve, 20));
  input.write(Buffer.from(`${canonicalJson(review())}\r`, 'utf8'));
  await waitFor(() => input.isRaw === true);
  input.write(Buffer.from(`${canonicalJson(runAuthorization())}\r`, 'utf8'));
  assert.equal(await pending, true);
  assert.equal(bootstrapSubmissions, 1);
  assert.equal(reviewSubmissions, 1);
  assert.equal(runSubmissions, 1);
});

test('operator front-end rejects non-TTY input before coordinator effects', async () => {
  let launches = 0;
  const input = new PassThrough();
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  const success = await runGateBOperatorFrontEnd({
    argv: [], channel: new EventEmitter(), errorOutput, input, output,
    launchSetup: async () => { launches += 1; },
    outputTimeoutMs: 20, phase1TimeoutMs: 20, phase2TimeoutMs: 20,
    stopCoordinator: async () => 'CLOSED',
    submitBootstrap: async () => Object.freeze(Object.create(null)),
    submitReview: async () => 'PREFLIGHT_VALID',
    waitClosed: async () => 'CLOSED',
  });
  assert.equal(success, false);
  assert.equal(launches, 0);
});

test('operator front-end rejects phase-two bytes delivered while bootstrap submission is pending',
  async () => {
  const input = fakeOperatorTty();
  const channel = new EventEmitter();
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  let releaseSubmit;
  const capability = Object.freeze(Object.create(null));
  let stops = 0;
  const pending = runGateBOperatorFrontEnd({
    argv: [], channel, errorOutput, input, output,
    outputTimeoutMs: 100, phase1TimeoutMs: 1000, phase2TimeoutMs: 1000,
    launchSetup: async () => capability,
    submitBootstrap: () => new Promise(resolve => { releaseSubmit = resolve; }),
    submitReview: async () => assert.fail('early bytes must prevent review'),
    stopCoordinator: async () => { stops += 1; return 'CLOSED'; },
    waitClosed: async () => 'CLOSED',
  });
  await waitFor(() => input.isRaw === true);
  input.write(Buffer.from(`${canonicalJson(bootstrap())}\r`, 'utf8'));
  await waitFor(() => typeof releaseSubmit === 'function');
  input.write(Buffer.from(`${canonicalJson(review())}\r`, 'utf8'));
  releaseSubmit(capability);
  assert.equal(await pending, false);
  assert.equal(stops, 1);
  assert.equal(input.isRaw, false);
});

test('operator front-end quarantines when exact TTY restoration cannot be proved', async () => {
  const input = fakeOperatorTty();
  Object.defineProperty(input, 'setRawMode', {
    configurable: false,
    enumerable: true,
    writable: false,
    value(value) {
      if (value === false) throw new TypeError('restore failed');
      this.isRaw = value;
      return this;
    },
  });
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  let setups = 0;
  let submissions = 0;
  const capability = Object.freeze(Object.create(null));
  const pending = runGateBOperatorFrontEnd({
    argv: [], channel: new EventEmitter(), errorOutput, input, output,
    outputTimeoutMs: 100, phase1TimeoutMs: 1000, phase2TimeoutMs: 1000,
    launchSetup: async () => { setups += 1; return capability; },
    submitBootstrap: async () => { submissions += 1; return capability; },
    submitReview: async () => 'PREFLIGHT_VALID',
    stopCoordinator: async () => 'CLOSED',
    waitClosed: async () => 'CLOSED',
  });
  await waitFor(() => input.isRaw === true);
  input.write(Buffer.from(`${canonicalJson(bootstrap())}\r`, 'utf8'));
  assert.equal(await pending, false);
  assert.equal(setups, 1);
  assert.equal(submissions, 0);
  assert.equal(errorOutput.read().toString('utf8'),
    GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.QUARANTINED);
});

test('operator front-end raw Ctrl-C and repeated controls restore state and preserve listeners',
  async () => {
    const input = fakeOperatorTty();
    const channel = new EventEmitter();
    const caller = () => {};
    channel.on('SIGTERM', caller);
    const output = new PassThrough();
    const errorOutput = new PassThrough();
    let setups = 0;
    const capability = Object.freeze(Object.create(null));
    const pending = runGateBOperatorFrontEnd({
      argv: [], channel, errorOutput, input, output,
      outputTimeoutMs: 100, phase1TimeoutMs: 1000, phase2TimeoutMs: 1000,
      launchSetup: async () => { setups += 1; return capability; },
      submitBootstrap: async () => capability,
      submitReview: async () => 'PREFLIGHT_VALID',
      stopCoordinator: async () => 'CLOSED',
      waitClosed: async () => 'CLOSED',
    });
    await waitFor(() => input.isRaw === true);
    input.write(Buffer.from([0x03]));
    channel.emit('SIGTERM');
    channel.emit('SIGTERM');
    assert.equal(await pending, false);
    assert.equal(input.isRaw, false);
    assert.equal(setups, 1);
    assert.deepEqual(channel.listeners('SIGTERM'), [caller]);
  });

test('operator front-end settles phase-two cancellation once and rejects late data', async () => {
  const input = fakeOperatorTty();
  const channel = new EventEmitter();
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  const capability = Object.freeze(Object.create(null));
  let stops = 0;
  let reviews = 0;
  const pending = runGateBOperatorFrontEnd({
    argv: [], channel, errorOutput, input, output,
    outputTimeoutMs: 100, phase1TimeoutMs: 1000, phase2TimeoutMs: 1000,
    launchSetup: async () => capability,
    submitBootstrap: async () => capability,
    submitReview: async () => { reviews += 1; return 'PREFLIGHT_VALID'; },
    stopCoordinator: async () => { stops += 1; return 'CLOSED'; },
    waitClosed: async () => 'CLOSED',
  });
  await waitFor(() => input.isRaw === true);
  input.write(Buffer.from(`${canonicalJson(bootstrap())}\r`, 'utf8'));
  await waitFor(() => input.isRaw === true);
  channel.emit('SIGINT');
  channel.emit('SIGTERM');
  input.write(Buffer.from(`${canonicalJson(review())}\r`, 'utf8'));
  assert.equal(await pending, false);
  assert.equal(input.isRaw, false);
  assert.equal(stops, 1);
  assert.equal(reviews, 0);
});

test('signal during held preflight output callback cannot later produce clean closure', async () => {
  const input = fakeOperatorTty();
  const channel = new EventEmitter();
  const lines = [];
  let heldCallback;
  const output = {
    write(line, callback) {
      lines.push(line);
      if (line === GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.PREFLIGHT_VALID) {
        heldCallback = callback;
      } else queueMicrotask(() => callback(null));
      return true;
    },
  };
  const errorOutput = new PassThrough();
  const capability = Object.freeze(Object.create(null));
  const pending = runGateBOperatorFrontEnd({
    argv: [], channel, errorOutput, input, output,
    outputTimeoutMs: 1000, phase1TimeoutMs: 1000, phase2TimeoutMs: 1000,
    launchSetup: async () => capability,
    submitBootstrap: async () => capability,
    submitReview: async () => 'PREFLIGHT_VALID',
    stopCoordinator: async () => 'CLOSED',
    waitClosed: async () => 'CLOSED',
  });
  await waitFor(() => input.isRaw === true);
  input.write(Buffer.from(`${canonicalJson(bootstrap())}\r`, 'utf8'));
  await waitFor(() => input.isRaw === true);
  input.write(Buffer.from(`${canonicalJson(review())}\r`, 'utf8'));
  await waitFor(() => typeof heldCallback === 'function');
  channel.emit('SIGTERM');
  heldCallback(null);
  heldCallback(null);
  assert.equal(await pending, false);
  assert.equal(lines.includes(GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.CLOSED), false);
});

test('direct non-TTY front-end rejects before setup descendants or setup status',
  { timeout: 10_000 }, async () => {
    const frontEnd = fileURLToPath(new URL(
      '../src/gate-b-operator-front-end.js',
      import.meta.url,
    ));
    const child = spawn(process.execPath, [frontEnd], {
      cwd: dirname(frontEnd), detached: false, env: {}, shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.stdin.end(`${canonicalJson(bootstrap())}\n${canonicalJson(review())}\n`);
    const outcome = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('bounded timeout')), 5000);
      child.once('close', (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });
    assert.deepEqual(outcome, { code: 1, signal: null });
    assert.equal(stdout, '');
    assert.equal(stderr, '');
  });

test('actual OS PTY suppresses canonical input echo and restores terminal state',
  { timeout: 10_000, skip: process.platform !== 'darwin' }, async () => {
    const fixture = fileURLToPath(new URL(
      '../test-support/gate-b-operator-front-end-fixture.js',
      import.meta.url,
    ));
    const first = canonicalJson(bootstrap());
    const second = canonicalJson(review());
    const third = canonicalJson(runAuthorization());
    const expectProgram = [
      `spawn ${process.execPath} ${fixture}`,
      `expect ${JSON.stringify(GATE_B_OPERATOR_FRONT_END_PHASE_1_REQUIRED.trim())}`,
      'after 100',
      `send -- ${JSON.stringify(`${first}\r`)}`,
      `expect ${JSON.stringify(GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.REVIEW_REQUIRED.trim())}`,
      'after 100',
      `send -- ${JSON.stringify(`${second}\r`)}`,
      `expect ${JSON.stringify(GATE_B_OPERATOR_FRONT_END_PHASE_3_REQUIRED.trim())}`,
      'after 100',
      `send -- ${JSON.stringify(`${third}\r`)}`,
      `expect ${JSON.stringify(GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.CLOSED_PENDING.trim())}`,
      'set outcome [wait]',
      'exit [lindex $outcome 3]',
    ].join('; ');
    const child = spawn('/usr/bin/expect', ['-c', expectProgram], {
      cwd: dirname(fixture), detached: false, env: {}, shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    const outcome = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('bounded timeout')), 5000);
      child.once('close', (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });
    assert.equal(stderr, '');
    assert.equal(stdout.includes(first), false);
    assert.equal(stdout.includes(second), false);
    assert.equal(stdout.includes(third), false);
    assert.equal(stdout.includes(
      GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.CLOSED_PENDING.trim()), true);
    assert.deepEqual(outcome, { code: 0, signal: null });
  });
