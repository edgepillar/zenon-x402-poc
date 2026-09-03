import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';

import {
  GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST,
  GATE_B_QUICK_TUNNEL_HOSTNAME_PERSISTENCE_POLICY,
  GATE_B_QUICK_TUNNEL_RUNTIME_CONTROL_POLICY,
  GATE_B_QUICK_TUNNEL_TELEMETRY_POLICIES,
  validateGateBQuickTunnelArtifactIdentity,
  validateGateBQuickTunnelStableBinding,
} from '../src/gate-b-quick-tunnel-artifact.js';
import * as artifactModule from '../src/gate-b-quick-tunnel-artifact.js';
import {
  parseGateBQuickTunnelHostnameSource,
  validateGateBQuickTunnelHostname,
} from '../src/gate-b-public-ws-inputs-schema.js';
import * as quickTunnelLauncher from '../src/gate-b-quick-tunnel-launcher.js';
import {
  assertGateBQuickTunnelReady,
  launchGateBQuickTunnel,
  launchGateBQuickTunnelInInheritedProcessGroup,
  stopGateBQuickTunnel,
  waitGateBQuickTunnelClosed,
} from '../src/gate-b-quick-tunnel-launcher.js';
import { superviseGateBQuickTunnel } from '../src/gate-b-quick-tunnel-supervisor.js';
import * as supervisorModule from '../src/gate-b-quick-tunnel-supervisor.js';

import {
  createGateBQuickTunnelIpcMessage,
  frameGateBQuickTunnelBootstrap,
  GATE_B_QUICK_TUNNEL_IPC_TYPES,
  GATE_B_QUICK_TUNNEL_LIMITS,
  GATE_B_QUICK_TUNNEL_OPERATIONS,
  GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS,
  GATE_B_QUICK_TUNNEL_TELEMETRY_MODES,
  parseGateBQuickTunnelBootstrapFrame,
  parseGateBQuickTunnelHttpSnapshot,
  parseGateBQuickTunnelIpcMessage,
  parseGateBQuickTunnelLsofSnapshot,
  parseGateBQuickTunnelReadyHttpSnapshot,
  parseGateBQuickTunnelStartupReadyHttpSnapshot,
} from '../src/gate-b-quick-tunnel-schema.js';

const WORKSPACE_ROOT = '/private/tmp/gate-b-quick-tunnel-fixture';
const EXECUTABLE = '/usr/local/bin/cloudflared-fixture';
const SOURCE_PIN = GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST.executableSha256;
const HOSTNAME = 'schema-fixture.trycloudflare.com';
const CONNECTOR_ID = '11111111-2222-4333-8444-555555555555';
const NIL_CONNECTOR_ID = '00000000-0000-0000-0000-000000000000';
const FIXTURE_DATE = 'Mon, 01 Jan 2024 00:00:00 GMT';

test('canonical artifact manifest accepts only the evidenced non-floating macOS arm64 tuple', () => {
  const manifest = GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST;
  assert.equal(Object.isFrozen(manifest), true);
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.release, '2026.8.2');
  assert.equal(manifest.platform, 'darwin');
  assert.equal(manifest.architecture, 'arm64');
  assert.equal(manifest.asset, 'cloudflared-darwin-arm64.tgz');
  assert.equal(manifest.executableBasename, 'cloudflared');
  assert.match(manifest.archiveSha256, /^[0-9a-f]{64}$/);
  assert.match(manifest.executableSha256, /^[0-9a-f]{64}$/);
  assert.equal(
    GATE_B_QUICK_TUNNEL_HOSTNAME_PERSISTENCE_POLICY.lifetime,
    'persists-with-protected-one-shot-workspace-beyond-lease-closure',
  );
  assert.equal(validateGateBQuickTunnelArtifactIdentity({
    architecture: manifest.architecture,
    archiveSha256: manifest.archiveSha256,
    asset: manifest.asset,
    executableSha256: manifest.executableSha256,
    manifestVersion: manifest.manifestVersion,
    platform: manifest.platform,
    release: manifest.release,
  }), true);
  for (const changes of [
    { architecture: 'x64' },
    { platform: 'linux' },
    { release: 'latest' },
    { release: '2026.8.1' },
    { asset: 'cloudflared-darwin-amd64.tgz' },
    { archiveSha256: '0'.repeat(64) },
    { executableSha256: '0'.repeat(64) },
  ]) {
    assert.throws(() => validateGateBQuickTunnelArtifactIdentity({
      architecture: manifest.architecture,
      archiveSha256: manifest.archiveSha256,
      asset: manifest.asset,
      executableSha256: manifest.executableSha256,
      manifestVersion: manifest.manifestVersion,
      platform: manifest.platform,
      release: manifest.release,
      ...changes,
    }));
  }
});

test('artifact authority has no public plain-object or token-resolution factory', () => {
  for (const name of [
    'createGateBQuickTunnelArtifactIdentityFromAttestation',
    'createGateBQuickTunnelStableBinding',
    'artifactBindingFromAttestation',
    'attestExecutable',
    'createAttestationLaunch',
  ]) {
    assert.equal(Object.hasOwn(artifactModule, name), false);
    assert.equal(Object.hasOwn(supervisorModule, name), false);
  }
});

function bootstrap(changes = {}) {
  return {
    telemetryAcknowledgement:
      GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS.ACCEPT_POSSIBLE_ERROR_TELEMETRY,
    cloudflaredExecutable: EXECUTABLE,
    operation: GATE_B_QUICK_TUNNEL_OPERATIONS.START,
    schemaVersion: 1,
    sourcePin: SOURCE_PIN,
    telemetryMode: GATE_B_QUICK_TUNNEL_TELEMETRY_MODES.ACCEPT_POSSIBLE_ERROR_TELEMETRY,
    workspaceRoot: WORKSPACE_ROOT,
    ...changes,
  };
}

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
    ['artifact-manifest-version', value => { value.artifact.manifestVersion = 2; }],
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

test('stable binding rejects mutation of every artifact, runtime, persistence, and telemetry field', () => {
  assert.equal(validateGateBQuickTunnelStableBinding(canonicalQuickTunnelBinding()), true);
  for (const [name, mutate] of quickTunnelBindingMutations()) {
    const candidate = structuredClone(canonicalQuickTunnelBinding());
    mutate(candidate);
    assert.throws(
      () => validateGateBQuickTunnelStableBinding(candidate),
      undefined,
      name,
    );
  }
});

function snapshot(body, changes = {}) {
  return {
    body,
    complete: true,
    httpVersion: '1.1',
    rawHeaders: [
      'Content-Type', 'text/plain; charset=utf-8',
      'Content-Length', String(body.length),
    ],
    rawTrailers: [],
    statusCode: 200,
    ...changes,
  };
}

function accessorObject(source, field) {
  const value = { ...source };
  const original = value[field];
  Object.defineProperty(value, field, {
    enumerable: true,
    get: () => original,
  });
  return value;
}

function lsofFixture(pid, port) {
  return Buffer.from(
    `p${pid}\0\nf9\0tIPv4\0PTCP\0n127.0.0.1:${port}\0` +
      'TST=LISTEN\0TQR=0\0TQS=0\0\n',
    'ascii',
  );
}

const LAUNCH_ERROR = {
  code: 'gate_b_quick_tunnel_launch_failed',
  message: 'gate_b_quick_tunnel_launch_failed',
  name: 'GateBQuickTunnelLaunchError',
};

class ControlledPrivateFd extends PassThrough {
  constructor() {
    super();
    this.frame = undefined;
    this.pending = undefined;
    this.on('data', () => {});
  }

  end(chunk, callback) {
    if (this.pending || !Buffer.isBuffer(chunk) || typeof callback !== 'function') {
      throw new Error('invalid synthetic private-FD write');
    }
    this.frame = Buffer.from(chunk);
    this.pending = { callback, chunk };
    return this;
  }

  release() {
    if (!this.pending) throw new Error('missing synthetic private-FD write');
    const { callback, chunk } = this.pending;
    this.pending = undefined;
    return super.end(chunk, callback);
  }
}

class SyntheticChild extends EventEmitter {
  constructor(pid = 43210) {
    super();
    this.pid = pid;
    this.connected = true;
    this.privateFd = new ControlledPrivateFd();
    this.stdio = [null, null, null, this.privateFd, null];
    this.sent = [];
    this.killSignals = [];
    this.groupAlive = true;
    this.disconnectCalls = 0;
    this.unrefCalls = 0;
    this.channelCloseCalls = 0;
    this.channelUnrefCalls = 0;
    this.channel = {
      close: () => { this.channelCloseCalls += 1; },
      unref: () => { this.channelUnrefCalls += 1; },
    };
  }

  send(message, callback) {
    this.sent.push(message);
    if (typeof callback === 'function') queueMicrotask(() => callback(null));
    return true;
  }

  kill(signal) {
    this.killSignals.push(signal);
    return true;
  }

  disconnect() {
    this.disconnectCalls += 1;
    this.connected = false;
  }

  unref() {
    this.unrefCalls += 1;
  }
}

function launcherHarness(changes = {}) {
  const child = new SyntheticChild();
  const forkCalls = [];
  const groupKills = [];
  const injected = {
    executable: '/usr/local/bin/node-fixture',
    forkProcess(...args) {
      forkCalls.push(args);
      return child;
    },
    hardLifetimeMs: 500,
    killProcessGroup(pid, signal) {
      groupKills.push([pid, signal]);
      if (signal === 'SIGKILL') child.groupAlive = false;
    },
    platform: 'darwin',
    probeProcessGroup(pid) {
      assert.equal(pid, child.pid);
      return child.groupAlive;
    },
    maxRequestId: 100,
    reapAbandonMs: 40,
    reapForceMs: 10,
    shutdownTimeoutMs: 200,
    startupTimeoutMs: 200,
    supervisorModule: '/private/tmp/gate-b-quick-tunnel-supervisor-fixture.js',
    ...changes,
  };
  return { child, forkCalls, groupKills, injected };
}

function launcherDeadlineTimers() {
  let nextId = 1;
  const active = new Map();
  const cancelled = [];
  return {
    active,
    cancelled,
    cancelTimer(id) {
      cancelled.push(id);
      active.delete(id);
    },
    fire(id) {
      const callback = active.get(id);
      if (!callback) return false;
      active.delete(id);
      callback();
      return true;
    },
    scheduleTimer(callback, milliseconds) {
      const id = nextId;
      nextId += 1;
      active.set(id, callback);
      return id;
    },
  };
}

function tick() {
  return new Promise(resolve => setImmediate(resolve));
}

async function eventually(predicate, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) return;
    await tick();
  }
  assert.fail('synthetic launcher condition did not settle');
}

async function activateLauncher(harness, readyBeforeFrame = false) {
  const launchPromise = launchGateBQuickTunnel(bootstrap(), harness.injected);
  await eventually(() => harness.forkCalls.length === 1);
  if (readyBeforeFrame) {
    harness.child.emit('message', createGateBQuickTunnelIpcMessage(
      GATE_B_QUICK_TUNNEL_IPC_TYPES.READY,
      1,
    ));
    assert.equal(harness.child.sent.length, 0);
  }
  harness.child.privateFd.release();
  if (!readyBeforeFrame) {
    harness.child.emit('message', createGateBQuickTunnelIpcMessage(
      GATE_B_QUICK_TUNNEL_IPC_TYPES.READY,
      1,
    ));
  }
  await eventually(() => harness.child.sent.length === 1);
  assert.deepEqual(harness.child.sent[0], createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
    1,
  ));
  harness.child.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.ACTIVE,
    1,
  ));
  return { launchPromise, lease: await launchPromise };
}

async function activateInheritedLauncher(harness) {
  const launchPromise = launchGateBQuickTunnelInInheritedProcessGroup(
    bootstrap(),
    harness.injected,
  );
  await eventually(() => harness.forkCalls.length === 1);
  harness.child.privateFd.release();
  harness.child.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.READY,
    1,
  ));
  await eventually(() => harness.child.sent.length === 1);
  harness.child.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.ACTIVE,
    1,
  ));
  return { launchPromise, lease: await launchPromise };
}

function emitSuccessfulClosure(child, requestId) {
  child.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.STOPPED,
    requestId,
  ));
  child.groupAlive = false;
  child.emit('exit', 0, null);
  child.emit('close', 0, null);
}

async function closeFailedChild(child) {
  child.groupAlive = false;
  child.emit('close', null, 'SIGTERM');
  await tick();
}

test('bootstrap frame is canonical, bounded, exact-EOF, and frozen on parse', () => {
  const frame = frameGateBQuickTunnelBootstrap(bootstrap());
  assert.equal(frame.readUInt32BE(0), frame.length - 4);
  assert.ok(frame.length <= GATE_B_QUICK_TUNNEL_LIMITS.frameBytes);
  const parsed = parseGateBQuickTunnelBootstrapFrame(frame);
  assert.deepEqual(parsed, bootstrap());
  assert.equal(Object.isFrozen(parsed), true);
  assert.throws(() => parseGateBQuickTunnelBootstrapFrame(Buffer.concat([
    frame,
    Buffer.from([0]),
  ])));
  assert.throws(() => parseGateBQuickTunnelBootstrapFrame(frame.subarray(0, frame.length - 1)));
});

test('bootstrap accepts exactly both approved telemetry acknowledgement pairs', () => {
  const external = bootstrap({
    telemetryAcknowledgement:
      GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS.EXTERNAL_SENTRY_EGRESS_CONTROL_ATTESTED,
    telemetryMode:
      GATE_B_QUICK_TUNNEL_TELEMETRY_MODES.EXTERNAL_SENTRY_EGRESS_CONTROL_ATTESTED,
  });
  assert.deepEqual(parseGateBQuickTunnelBootstrapFrame(
    frameGateBQuickTunnelBootstrap(external),
  ), external);
  for (const value of [
    bootstrap({
      telemetryAcknowledgement:
        GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS.EXTERNAL_SENTRY_EGRESS_CONTROL_ATTESTED,
    }),
    bootstrap({
      telemetryMode:
        GATE_B_QUICK_TUNNEL_TELEMETRY_MODES.EXTERNAL_SENTRY_EGRESS_CONTROL_ATTESTED,
    }),
  ]) assert.throws(() => frameGateBQuickTunnelBootstrap(value));
});

test('bootstrap rejects proxies, accessors, symbols, extras, and noncanonical paths', () => {
  const withSymbol = bootstrap();
  withSymbol[Symbol('extra')] = true;
  for (const value of [
    new Proxy(bootstrap(), {}),
    accessorObject(bootstrap(), 'sourcePin'),
    withSymbol,
    bootstrap({ extra: true }),
    bootstrap({ protocol: 'quic' }),
    bootstrap({ workspaceRoot: '/private/tmp/../tmp/gate-b-quick-tunnel-fixture' }),
    bootstrap({ cloudflaredExecutable: 'cloudflared-fixture' }),
    bootstrap({ sourcePin: 'A'.repeat(64) }),
    bootstrap({ sourcePin: 'a'.repeat(63) }),
  ]) assert.throws(() => frameGateBQuickTunnelBootstrap(value));
});

test('bootstrap parser rejects noncanonical JSON and invalid framing lengths', () => {
  const frame = frameGateBQuickTunnelBootstrap(bootstrap());
  const payload = frame.subarray(4);
  const reordered = Buffer.from(
    JSON.stringify({
      ...bootstrap(),
      telemetryAcknowledgement: bootstrap().telemetryAcknowledgement,
    }),
    'utf8',
  );
  const reorderedFrame = Buffer.alloc(4 + reordered.length);
  reorderedFrame.writeUInt32BE(reordered.length, 0);
  reordered.copy(reorderedFrame, 4);
  assert.notEqual(reordered.toString('utf8'), payload.toString('utf8'));
  assert.throws(() => parseGateBQuickTunnelBootstrapFrame(reorderedFrame));
  const zero = Buffer.alloc(4);
  assert.throws(() => parseGateBQuickTunnelBootstrapFrame(zero));
  const tooLarge = Buffer.alloc(GATE_B_QUICK_TUNNEL_LIMITS.frameBytes + 1);
  tooLarge.writeUInt32BE(tooLarge.length - 4, 0);
  assert.throws(() => parseGateBQuickTunnelBootstrapFrame(tooLarge));
});

test('IPC messages use exact enums, descriptors, version, and positive safe request IDs', () => {
  let requestId = 0;
  for (const type of Object.values(GATE_B_QUICK_TUNNEL_IPC_TYPES)) {
    requestId += 1;
    const message = createGateBQuickTunnelIpcMessage(type, requestId);
    assert.deepEqual(message, { ipcVersion: 1, requestId, type });
    assert.equal(Object.isFrozen(message), true);
    assert.deepEqual(parseGateBQuickTunnelIpcMessage(message, type, requestId), message);
  }
  for (const requestIdValue of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createGateBQuickTunnelIpcMessage(
      GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
      requestIdValue,
    ));
  }
});

test('IPC parser rejects mismatches, proxies, accessors, symbols, and extra fields', () => {
  const message = createGateBQuickTunnelIpcMessage(GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK, 7);
  const withSymbol = { ...message };
  withSymbol[Symbol('extra')] = true;
  for (const value of [
    { ...message, type: 'FAILED' },
    { ...message, extra: true },
    new Proxy({ ...message }, {}),
    accessorObject(message, 'requestId'),
    withSymbol,
  ]) assert.throws(() => parseGateBQuickTunnelIpcMessage(value));
  assert.throws(() => parseGateBQuickTunnelIpcMessage(
    message,
    GATE_B_QUICK_TUNNEL_IPC_TYPES.READY,
  ));
  assert.throws(() => parseGateBQuickTunnelIpcMessage(
    message,
    GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK,
    8,
  ));
});

test('lsof parser accepts one exact process-owned IPv4 loopback TCP listener', () => {
  const pid = 4321;
  const port = 43210;
  const bytes = lsofFixture(pid, port);
  const result = parseGateBQuickTunnelLsofSnapshot(bytes, pid);
  assert.deepEqual(result, { address: '127.0.0.1', pid, port });
  assert.equal(Object.isFrozen(result), true);
});

test('lsof parser accepts canonical nonzero Darwin TCP queue fields', () => {
  const pid = 4321;
  const port = 43210;
  const bytes = Buffer.from(
    lsofFixture(pid, port).toString('latin1')
      .replace('TQR=0', 'TQR=12')
      .replace('TQS=0', 'TQS=34'),
    'latin1',
  );
  assert.deepEqual(parseGateBQuickTunnelLsofSnapshot(bytes, pid), {
    address: '127.0.0.1', pid, port,
  });
});

test('lsof parser rejects malformed, contradictory, duplicate, extra, or wrong listeners', () => {
  const pid = 4321;
  const valid = lsofFixture(pid, 43210);
  for (const bytes of [
    Buffer.from(valid.toString('latin1').replace(`p${pid}`, `p${pid + 1}`), 'latin1'),
    Buffer.from(valid.toString('latin1').replace('tIPv4', 'tIPv6'), 'latin1'),
    Buffer.from(valid.toString('latin1').replace('PTCP', 'PUDP'), 'latin1'),
    Buffer.from(valid.toString('latin1').replace('127.0.0.1', '0.0.0.0'), 'latin1'),
    Buffer.from(valid.toString('latin1').replace('TST=LISTEN', 'TST=ESTABLISHED'), 'latin1'),
    lsofFixture(pid, 41000),
    Buffer.concat([valid, valid]),
    valid.subarray(0, valid.length - 1),
    Buffer.from(valid.toString('latin1').replace('\0\nf9', '\nf9'), 'latin1'),
    Buffer.from(valid.toString('latin1').replace('f9\0', 'f09\0'), 'latin1'),
    Buffer.from(valid.toString('latin1').replace(
      'f9\0',
      `f${'9'.repeat(32)}\0`,
    ), 'latin1'),
    Buffer.from(valid.toString('latin1').replace('\0tIPv4', '\0\ntIPv4'), 'latin1'),
    Buffer.from(valid.toString('latin1').replace(
      '\0tIPv4\0PTCP\0n127.0.0.1:43210\0',
      '\0tIPv4\0n127.0.0.1:43210\0PTCP\0',
    ), 'latin1'),
    Buffer.from(valid.toString('latin1').replace('PTCP\0', 'PTCP\0PTCP\0'), 'latin1'),
    Buffer.from(valid.toString('latin1').replace(
      'n127.0.0.1:43210\0',
      'n127.0.0.1:43210\0n127.0.0.1:43210\0',
    ), 'latin1'),
    Buffer.from(valid.toString('latin1').replace(
      'TST=LISTEN\0',
      'TST=LISTEN\0TST=ESTABLISHED\0',
    ), 'latin1'),
    Buffer.from(valid.toString('latin1').replace('TQR=0\0', 'TQR=0\0TQR=1\0'), 'latin1'),
    Buffer.from(valid.toString('latin1').replace('TQS=0\0', 'TQS=0\0TQS=1\0'), 'latin1'),
    Buffer.from(valid.toString('latin1').replace('TQR=0', 'TQR=00'), 'latin1'),
    Buffer.from(valid.toString('latin1').replace('TQS=0', 'TQS=-1'), 'latin1'),
    Buffer.from(valid.toString('latin1').replace('TQS=0\0', 'TQS=0\0TF=EXTRA\0'), 'latin1'),
  ]) assert.throws(() => parseGateBQuickTunnelLsofSnapshot(bytes, pid));
  assert.throws(() => parseGateBQuickTunnelLsofSnapshot(
    Buffer.alloc(GATE_B_QUICK_TUNNEL_LIMITS.lsofBytes + 1),
    pid,
  ));
});

test('quick-tunnel HTTP parser accepts exact complete normalized response', () => {
  const body = Buffer.from(`{"hostname":"${HOSTNAME}"}`, 'utf8');
  const result = parseGateBQuickTunnelHttpSnapshot(snapshot(body));
  assert.deepEqual(result, { hostname: HOSTNAME });
  assert.equal(Object.isFrozen(result), true);
});

test('shared hostname validator rejects coercion and hostile objects without evaluating them', () => {
  for (const hostname of [
    'a.trycloudflare.com',
    '0.trycloudflare.com',
    `${'a'.repeat(63)}.trycloudflare.com`,
    HOSTNAME,
  ]) assert.equal(validateGateBQuickTunnelHostname(hostname), true);

  for (const hostname of [
    '.trycloudflare.com',
    '-a.trycloudflare.com',
    'a-.trycloudflare.com',
    `${'a'.repeat(64)}.trycloudflare.com`,
    'A.trycloudflare.com',
    'a.b.trycloudflare.com',
    'xn--fixture.trycloudflare.com',
    'fixture.example.com',
    'fixture.trycloudflare.com:443',
    'fixture.trycloudflare.com/path',
    'fixture.trycloudflare.com\n',
    '',
  ]) assert.throws(() => validateGateBQuickTunnelHostname(hostname));

  let reads = 0;
  const hostile = new Proxy({}, {
    get() { reads += 1; throw new Error('synthetic getter'); },
    getOwnPropertyDescriptor() { reads += 1; throw new Error('synthetic descriptor'); },
    getPrototypeOf() { reads += 1; throw new Error('synthetic prototype'); },
    ownKeys() { reads += 1; throw new Error('synthetic keys'); },
  });
  const coercible = {};
  Object.defineProperty(coercible, Symbol.toPrimitive, {
    get() { reads += 1; throw new Error('synthetic coercion'); },
  });
  for (const value of [hostile, coercible, new String(HOSTNAME), null, undefined, 1]) {
    assert.throws(() => validateGateBQuickTunnelHostname(value));
  }
  assert.equal(reads, 0);
});

test('ready HTTP parser accepts status 200, one connection, and canonical nonnil UUID', () => {
  const body = Buffer.from(
    `{"status":200,"readyConnections":1,"connectorId":"${CONNECTOR_ID}"}`,
    'utf8',
  );
  const result = parseGateBQuickTunnelReadyHttpSnapshot(snapshot(body));
  assert.deepEqual(result, {
    connectorId: CONNECTOR_ID,
    readyConnections: 1,
    status: 200,
  });
  assert.equal(Object.isFrozen(result), true);
});

test('startup ready parser accepts only exact 200/one or 503/zero readiness states', () => {
  const readyBody = Buffer.from(
    `{"status":200,"readyConnections":1,"connectorId":"${CONNECTOR_ID}"}`,
    'utf8',
  );
  const pendingBody = Buffer.from(
    `{"status":503,"readyConnections":0,"connectorId":"${CONNECTOR_ID}"}`,
    'utf8',
  );
  assert.deepEqual(parseGateBQuickTunnelStartupReadyHttpSnapshot(snapshot(readyBody)), {
    connectorId: CONNECTOR_ID,
    readyConnections: 1,
    status: 200,
  });
  assert.deepEqual(parseGateBQuickTunnelStartupReadyHttpSnapshot(snapshot(pendingBody, {
    statusCode: 503,
  })), {
    connectorId: CONNECTOR_ID,
    readyConnections: 0,
    status: 503,
  });
  assert.throws(() => parseGateBQuickTunnelReadyHttpSnapshot(snapshot(pendingBody, {
    statusCode: 503,
  })));
  for (const value of [
    snapshot(pendingBody),
    snapshot(pendingBody, { statusCode: 502 }),
    snapshot(Buffer.from(
      `{"status":503,"readyConnections":1,"connectorId":"${CONNECTOR_ID}"}`,
      'utf8',
    ), { statusCode: 503 }),
    snapshot(Buffer.from(
      `{"status":503,"readyConnections":0,"connectorId":"${NIL_CONNECTOR_ID}"}`,
      'utf8',
    ), { statusCode: 503 }),
    snapshot(Buffer.from(
      `{"readyConnections":0,"status":503,"connectorId":"${CONNECTOR_ID}"}`,
      'utf8',
    ), { statusCode: 503 }),
  ]) assert.throws(() => parseGateBQuickTunnelStartupReadyHttpSnapshot(value));
});

test('HTTP parsers reject status, version, completion, bounds, framing, and extra fields', () => {
  const body = Buffer.from(`{"hostname":"${HOSTNAME}"}`, 'utf8');
  for (const value of [
    snapshot(body, { statusCode: 503 }),
    snapshot(body, { httpVersion: '2.0' }),
    snapshot(body, { complete: false }),
    snapshot(body, { extra: true }),
    snapshot(Buffer.alloc(GATE_B_QUICK_TUNNEL_LIMITS.httpBodyBytes + 1)),
  ]) assert.throws(() => parseGateBQuickTunnelHttpSnapshot(value));
  const withSymbol = snapshot(body);
  withSymbol[Symbol('extra')] = true;
  assert.throws(() => parseGateBQuickTunnelHttpSnapshot(withSymbol));
  assert.throws(() => parseGateBQuickTunnelHttpSnapshot(new Proxy(snapshot(body), {})));
  assert.throws(() => parseGateBQuickTunnelHttpSnapshot(accessorObject(snapshot(body), 'body')));
});

test('HTTP parsers require exact ordered semantic headers and no trailers or encoding', () => {
  const body = Buffer.from(`{"hostname":"${HOSTNAME}"}`, 'utf8');
  for (const rawHeaders of [
    ['Content-Length', String(body.length), 'Content-Type', 'text/plain; charset=utf-8'],
    ['Content-Type', 'text/plain; charset=utf-8', 'Content-Length', `0${body.length}`],
    ['Content-Type', 'application/json', 'Content-Length', String(body.length)],
    [
      'Content-Type', 'text/plain; charset=utf-8',
      'Content-Length', String(body.length),
      'Content-Encoding', 'gzip',
    ],
    [
      'Content-Type', 'text/plain; charset=utf-8',
      'Content-Length', String(body.length),
      'Content-Length', String(body.length),
    ],
  ]) assert.throws(() => parseGateBQuickTunnelHttpSnapshot(snapshot(body, { rawHeaders })));
  assert.throws(() => parseGateBQuickTunnelHttpSnapshot(snapshot(body, {
    rawTrailers: ['X-Fixture', 'value'],
  })));
  assert.throws(() => parseGateBQuickTunnelHttpSnapshot(snapshot(body, {
    rawHeaders: new Proxy([...snapshot(body).rawHeaders], {}),
  })));
});

test('quick-tunnel parser rejects noncanonical JSON and unsupported hostnames', () => {
  for (const body of [
    Buffer.from(`{ "hostname": "${HOSTNAME}" }`, 'utf8'),
    Buffer.from(`{"hostname":"UPPER.trycloudflare.com"}`, 'utf8'),
    Buffer.from(`{"hostname":"a.b.trycloudflare.com"}`, 'utf8'),
    Buffer.from(`{"hostname":"xn--fixture.trycloudflare.com"}`, 'utf8'),
    Buffer.from(`{"hostname":"${HOSTNAME}","extra":true}`, 'utf8'),
  ]) assert.throws(() => parseGateBQuickTunnelHttpSnapshot(snapshot(body)));
});

test('ready parser rejects alternate key order, nil/noncanonical UUID, and connection variance', () => {
  for (const body of [
    Buffer.from(
      `{"connectorId":"${CONNECTOR_ID}","readyConnections":1,"status":200}`,
      'utf8',
    ),
    Buffer.from(
      '{"status":200,"readyConnections":1,"connectorId":"00000000-0000-0000-0000-000000000000"}',
      'utf8',
    ),
    Buffer.from(
      '{"status":200,"readyConnections":0,"connectorId":"11111111-2222-4333-8444-555555555555"}',
      'utf8',
    ),
    Buffer.from(
      '{"status":200,"readyConnections":2,"connectorId":"11111111-2222-4333-8444-555555555555"}',
      'utf8',
    ),
    Buffer.from(
      '{"status":200,"readyConnections":1,"connectorId":"11111111222243338444555555555555"}',
      'utf8',
    ),
  ]) assert.throws(() => parseGateBQuickTunnelReadyHttpSnapshot(snapshot(body)));
});

test('synthetic Date is not part of normalized semantic headers', () => {
  const body = Buffer.from(`{"hostname":"${HOSTNAME}"}`, 'utf8');
  assert.throws(() => parseGateBQuickTunnelHttpSnapshot(snapshot(body, {
    rawHeaders: [
      'Date', FIXTURE_DATE,
      'Content-Type', 'text/plain; charset=utf-8',
      'Content-Length', String(body.length),
    ],
  })));
});

test('launcher exports only the reviewed public lifecycle surface', () => {
  assert.deepEqual(Object.keys(quickTunnelLauncher).sort(), [
    'GateBQuickTunnelLaunchError',
    'assertGateBQuickTunnelReady',
    'launchGateBQuickTunnel',
    'launchGateBQuickTunnelInInheritedProcessGroup',
    'stopGateBQuickTunnel',
    'waitGateBQuickTunnelClosed',
  ]);
});

test('coordinator-only inherited launcher is non-detached and never signals or probes a group',
  async t => {
    await t.test('clean', async () => {
      const harness = launcherHarness({
        killProcessGroup() { assert.fail('inherited mode must not signal a group'); },
        probeProcessGroup() { assert.fail('inherited mode must not probe a group'); },
      });
      const { lease } = await activateInheritedLauncher(harness);
      assert.equal(harness.forkCalls[0][2].detached, false);
      const closure = stopGateBQuickTunnel(lease);
      emitSuccessfulClosure(harness.child, 2);
      assert.equal(await closure, true);
      assert.deepEqual(harness.child.killSignals, []);
    });

    await t.test('failure', async () => {
      const harness = launcherHarness({
        killProcessGroup() { assert.fail('inherited mode must not signal a group'); },
        probeProcessGroup() { assert.fail('inherited mode must not probe a group'); },
      });
      const { lease } = await activateInheritedLauncher(harness);
      const closure = waitGateBQuickTunnelClosed(lease);
      harness.child.emit('message', {});
      await eventually(() => harness.child.killSignals.length === 1);
      assert.deepEqual(harness.child.killSignals, ['SIGTERM']);
      harness.child.emit('exit', null, 'SIGTERM');
      harness.child.emit('close', null, 'SIGTERM');
      await assert.rejects(closure, LAUNCH_ERROR);
    });
  });

test('launcher uses the workspace cwd and exact detached private-FD contract', async () => {
  const harness = launcherHarness();
  const launchPromise = launchGateBQuickTunnel(bootstrap(), harness.injected);
  await eventually(() => harness.forkCalls.length === 1);

  harness.child.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.READY,
    1,
  ));
  assert.equal(harness.child.sent.length, 0);
  assert.deepEqual(
    parseGateBQuickTunnelBootstrapFrame(harness.child.privateFd.frame),
    bootstrap(),
  );

  const [modulePath, argv, options] = harness.forkCalls[0];
  assert.equal(modulePath, harness.injected.supervisorModule);
  assert.deepEqual(argv, []);
  assert.deepEqual(options, {
    cwd: WORKSPACE_ROOT,
    detached: true,
    env: {},
    execArgv: [],
    execPath: harness.injected.executable,
    shell: false,
    stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'ipc'],
    windowsHide: true,
  });

  harness.child.privateFd.release();
  await eventually(() => harness.child.sent.length === 1);
  assert.deepEqual(harness.child.sent[0], createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
    1,
  ));
  harness.child.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.ACTIVE,
    1,
  ));
  const lease = await launchPromise;
  assert.equal(Object.getPrototypeOf(lease), null);
  assert.deepEqual(Reflect.ownKeys(lease), []);
  assert.equal(Object.isFrozen(lease), true);

  const publicChannels = JSON.stringify({
    argv,
    env: options.env,
    ipc: harness.child.sent,
  });
  for (const privateValue of [
    EXECUTABLE,
    SOURCE_PIN,
    bootstrap().telemetryAcknowledgement,
    bootstrap().telemetryMode,
  ]) assert.equal(publicChannels.includes(privateValue), false);

  const closure = stopGateBQuickTunnel(lease);
  assert.deepEqual(harness.child.sent.at(-1), createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.STOP,
    2,
  ));
  emitSuccessfulClosure(harness.child, 2);
  assert.equal(await closure, true);

  const forged = Object.freeze(Object.create(null));
  await assert.rejects(assertGateBQuickTunnelReady(forged), LAUNCH_ERROR);
  await assert.rejects(stopGateBQuickTunnel(forged), LAUNCH_ERROR);
  await assert.rejects(waitGateBQuickTunnelClosed(forged), LAUNCH_ERROR);
});

test('launcher rejects ACTIVE before the READY and START join completes', async () => {
  const harness = launcherHarness();
  const launchPromise = launchGateBQuickTunnel(bootstrap(), harness.injected);
  const observedLaunchFailure = assert.rejects(launchPromise, LAUNCH_ERROR);
  await eventually(() => harness.forkCalls.length === 1);
  harness.child.privateFd.release();
  harness.child.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.ACTIVE,
    1,
  ));
  await eventually(() => harness.groupKills.length === 1);
  await closeFailedChild(harness.child);
  await observedLaunchFailure;
  assert.deepEqual(harness.child.sent, []);
});

test('sequential readiness checks use fresh IDs and a concurrent check consumes none', async () => {
  const harness = launcherHarness();
  const { lease } = await activateLauncher(harness);

  const first = assertGateBQuickTunnelReady(lease);
  assert.deepEqual(harness.child.sent.at(-1), createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK,
    2,
  ));
  const concurrent = assertGateBQuickTunnelReady(lease);
  await assert.rejects(concurrent, LAUNCH_ERROR);
  assert.equal(harness.child.sent.length, 2);
  harness.child.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED,
    2,
  ));
  assert.equal(await first, true);

  const second = assertGateBQuickTunnelReady(lease);
  assert.deepEqual(harness.child.sent.at(-1), createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK,
    3,
  ));
  harness.child.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED,
    3,
  ));
  assert.equal(await second, true);

  const closure = stopGateBQuickTunnel(lease);
  emitSuccessfulClosure(harness.child, 4);
  assert.equal(await closure, true);
});

test('launcher CHECK deadline has one deterministic success-or-timeout winner', async t => {
  await t.test('CHECKED wins and cancels the deadline', async () => {
    const timers = launcherDeadlineTimers();
    const harness = launcherHarness({
      cancelTimer: timers.cancelTimer,
      checkTimeoutMs: 25,
      scheduleTimer: timers.scheduleTimer,
    });
    const { lease } = await activateLauncher(harness);
    const check = assertGateBQuickTunnelReady(lease);
    const [timerId] = timers.active.keys();
    assert.equal(timers.active.size, 1);
    harness.child.emit('message', createGateBQuickTunnelIpcMessage(
      GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED,
      2,
    ));
    assert.equal(await check, true);
    assert.deepEqual(timers.cancelled, [timerId]);
    assert.equal(timers.fire(timerId), false);
    assert.deepEqual(harness.groupKills, []);

    const closure = stopGateBQuickTunnel(lease);
    emitSuccessfulClosure(harness.child, 3);
    assert.equal(await closure, true);
  });

  await t.test('deadline wins, rejects once, and makes late CHECKED inert', async () => {
    const timers = launcherDeadlineTimers();
    const harness = launcherHarness({
      cancelTimer: timers.cancelTimer,
      checkTimeoutMs: 25,
      scheduleTimer: timers.scheduleTimer,
    });
    const { lease } = await activateLauncher(harness);
    const closure = waitGateBQuickTunnelClosed(lease);
    const check = assertGateBQuickTunnelReady(lease);
    const [timerId] = timers.active.keys();
    assert.equal(timers.fire(timerId), true);
    await assert.rejects(check, LAUNCH_ERROR);
    await eventually(() => harness.groupKills.length === 1);
    harness.child.groupAlive = false;
    await assert.rejects(closure, LAUNCH_ERROR);
    assert.equal(stopGateBQuickTunnel(lease), closure);
    assert.equal(waitGateBQuickTunnelClosed(lease), closure);
    assert.equal(timers.fire(timerId), false);
    const effects = {
      disconnects: harness.child.disconnectCalls,
      kills: harness.groupKills.length,
      sends: harness.child.sent.length,
    };
    harness.child.emit('message', createGateBQuickTunnelIpcMessage(
      GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED,
      2,
    ));
    harness.child.emit('disconnect');
    assert.deepEqual({
      disconnects: harness.child.disconnectCalls,
      kills: harness.groupKills.length,
      sends: harness.child.sent.length,
    }, effects);
  });
});

test('malformed, stale, duplicate, and wrong-field IPC all fail closed', async t => {
  const candidates = [
    {},
    createGateBQuickTunnelIpcMessage(GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED, 1),
    createGateBQuickTunnelIpcMessage(GATE_B_QUICK_TUNNEL_IPC_TYPES.ACTIVE, 1),
    { ipcVersion: 1, requestId: 2, type: GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED,
      unexpected: true },
  ];
  for (let index = 0; index < candidates.length; index += 1) {
    await t.test(`candidate ${index + 1}`, async () => {
      const harness = launcherHarness();
      const { lease } = await activateLauncher(harness);
      const closure = waitGateBQuickTunnelClosed(lease);
      harness.child.emit('message', candidates[index]);
      await assert.rejects(closure, LAUNCH_ERROR);
      assert.deepEqual(harness.groupKills[0], [harness.child.pid, 'SIGTERM']);
      await closeFailedChild(harness.child);
    });
  }
});

test('idle stop is idempotent and closure waits for STOPPED, exit, and close', async () => {
  const harness = launcherHarness();
  const { lease } = await activateLauncher(harness);
  const first = stopGateBQuickTunnel(lease);
  const second = stopGateBQuickTunnel(lease);
  const waited = waitGateBQuickTunnelClosed(lease);
  assert.equal(first, second);
  assert.equal(first, waited);
  assert.deepEqual(harness.child.sent.at(-1), createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.STOP,
    2,
  ));
  assert.equal(harness.child.sent.length, 2);

  let settled = false;
  void first.then(() => { settled = true; });
  harness.child.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.STOPPED,
    2,
  ));
  await tick();
  assert.equal(settled, false);
  harness.child.emit('exit', 0, null);
  await tick();
  assert.equal(settled, false);
  harness.child.emit('close', 0, null);
  assert.equal(await first, true);
  assert.equal(settled, true);
});

test('normal STOP waits for exact supervisor-group exhaustion after leader close', async () => {
  const harness = launcherHarness({ reapAbandonMs: 40, reapForceMs: 5 });
  const { lease } = await activateLauncher(harness);
  const closure = stopGateBQuickTunnel(lease);
  let settled = false;
  void closure.then(() => { settled = true; });
  harness.child.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.STOPPED,
    2,
  ));
  harness.child.emit('exit', 0, null);
  harness.child.emit('close', 0, null);
  await tick();
  assert.equal(settled, false);
  assert.deepEqual(harness.groupKills[0], [harness.child.pid, 'SIGTERM']);
  await new Promise(resolve => setTimeout(resolve, 12));
  await eventually(() => harness.groupKills.length === 2);
  assert.deepEqual(harness.groupKills[1], [harness.child.pid, 'SIGKILL']);
  assert.equal(await closure, true);
});

test('normal STOP rejects when exact supervisor-group exhaustion cannot be proved', async () => {
  const harness = launcherHarness({
    killProcessGroup(pid, signal) {
      harness.groupKills.push([pid, signal]);
    },
    reapAbandonMs: 15,
    reapForceMs: 5,
  });
  const { lease } = await activateLauncher(harness);
  const closure = stopGateBQuickTunnel(lease);
  harness.child.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.STOPPED,
    2,
  ));
  harness.child.emit('exit', 0, null);
  harness.child.emit('close', 0, null);
  await assert.rejects(closure, LAUNCH_ERROR);
  assert.deepEqual(harness.groupKills, [
    [harness.child.pid, 'SIGTERM'],
    [harness.child.pid, 'SIGKILL'],
  ]);
});

test('stop during CHECK rejects it and uses the immediately following request ID', async () => {
  const harness = launcherHarness();
  const { lease } = await activateLauncher(harness);
  const check = assertGateBQuickTunnelReady(lease);
  const closure = stopGateBQuickTunnel(lease);
  await assert.rejects(check, LAUNCH_ERROR);
  assert.deepEqual(harness.child.sent.slice(-2), [
    createGateBQuickTunnelIpcMessage(GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK, 2),
    createGateBQuickTunnelIpcMessage(GATE_B_QUICK_TUNNEL_IPC_TYPES.STOP, 3),
  ]);
  emitSuccessfulClosure(harness.child, 3);
  assert.equal(await closure, true);
});

test('a late CHECKED response after STOP fails the lease closed', async () => {
  const harness = launcherHarness();
  const { lease } = await activateLauncher(harness);
  const check = assertGateBQuickTunnelReady(lease);
  const closure = stopGateBQuickTunnel(lease);
  await assert.rejects(check, LAUNCH_ERROR);
  harness.child.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED,
    2,
  ));
  await assert.rejects(closure, LAUNCH_ERROR);
  assert.deepEqual(harness.groupKills[0], [harness.child.pid, 'SIGTERM']);
  await closeFailedChild(harness.child);
});

test('maxRequestId reserves the final available ID for STOP', async () => {
  const harness = launcherHarness({ maxRequestId: 3 });
  const { lease } = await activateLauncher(harness);
  const check = assertGateBQuickTunnelReady(lease);
  assert.deepEqual(harness.child.sent.at(-1), createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK,
    2,
  ));
  harness.child.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED,
    2,
  ));
  assert.equal(await check, true);
  const countBeforeRejectedCheck = harness.child.sent.length;
  await assert.rejects(assertGateBQuickTunnelReady(lease), LAUNCH_ERROR);
  assert.equal(harness.child.sent.length, countBeforeRejectedCheck);
  const closure = stopGateBQuickTunnel(lease);
  assert.deepEqual(harness.child.sent.at(-1), createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.STOP,
    3,
  ));
  emitSuccessfulClosure(harness.child, 3);
  assert.equal(await closure, true);
});

test('a synchronous CHECK send failure rejects both readiness and lifecycle promises',
  async () => {
    const harness = launcherHarness();
    const { lease } = await activateLauncher(harness);
    const closure = waitGateBQuickTunnelClosed(lease);
    harness.child.send = () => {
      harness.child.connected = false;
      return false;
    };
    const check = assertGateBQuickTunnelReady(lease);
    await assert.rejects(check, LAUNCH_ERROR);
    await assert.rejects(closure, LAUNCH_ERROR);
    await closeFailedChild(harness.child);
  });

test('unexpected exit, disconnect, and zero exit without STOPPED fail closed', async t => {
  await t.test('unexpected exit', async () => {
    const harness = launcherHarness();
    const { lease } = await activateLauncher(harness);
    const closure = waitGateBQuickTunnelClosed(lease);
    harness.child.emit('exit', 1, null);
    await assert.rejects(closure, LAUNCH_ERROR);
    await closeFailedChild(harness.child);
  });
  await t.test('unexpected disconnect', async () => {
    const harness = launcherHarness();
    const { lease } = await activateLauncher(harness);
    const closure = waitGateBQuickTunnelClosed(lease);
    harness.child.connected = false;
    harness.child.emit('disconnect');
    await assert.rejects(closure, LAUNCH_ERROR);
    await closeFailedChild(harness.child);
  });
  await t.test('zero exit without STOPPED', async () => {
    const harness = launcherHarness();
    const { lease } = await activateLauncher(harness);
    const closure = stopGateBQuickTunnel(lease);
    harness.child.emit('exit', 0, null);
    await assert.rejects(closure, LAUNCH_ERROR);
    await closeFailedChild(harness.child);
  });
});

test('hard lifetime and shutdown deadlines fail closed with bounded injected timers', async t => {
  await t.test('hard lifetime', async () => {
    const harness = launcherHarness({ hardLifetimeMs: 10 });
    const { lease } = await activateLauncher(harness);
    await assert.rejects(waitGateBQuickTunnelClosed(lease), LAUNCH_ERROR);
    assert.deepEqual(harness.groupKills[0], [harness.child.pid, 'SIGTERM']);
    await closeFailedChild(harness.child);
  });
  await t.test('shutdown', async () => {
    const harness = launcherHarness({ hardLifetimeMs: 100, shutdownTimeoutMs: 10 });
    const { lease } = await activateLauncher(harness);
    const closure = stopGateBQuickTunnel(lease);
    await assert.rejects(closure, LAUNCH_ERROR);
    assert.deepEqual(harness.groupKills[0], [harness.child.pid, 'SIGTERM']);
    await closeFailedChild(harness.child);
  });
});

test('failed lifecycle reaps the exact process group with TERM then KILL', async () => {
  const harness = launcherHarness({ reapForceMs: 5, reapAbandonMs: 30 });
  const { lease } = await activateLauncher(harness);
  const closure = waitGateBQuickTunnelClosed(lease);
  harness.child.emit('message', {});
  await assert.rejects(closure, LAUNCH_ERROR);
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.deepEqual(harness.groupKills, [
    [harness.child.pid, 'SIGTERM'],
    [harness.child.pid, 'SIGKILL'],
  ]);
  assert.deepEqual(harness.child.killSignals, []);
  await closeFailedChild(harness.child);
});

test('failure cleanup outlives leader close until hostile descendants are gone', async () => {
  const harness = launcherHarness({ reapForceMs: 5, reapAbandonMs: 30 });
  const { lease } = await activateLauncher(harness);
  const closure = waitGateBQuickTunnelClosed(lease);
  harness.child.emit('message', {});
  harness.child.emit('close', null, 'SIGTERM');
  await assert.rejects(closure, LAUNCH_ERROR);
  await new Promise(resolve => setTimeout(resolve, 12));
  await eventually(() => harness.groupKills.length === 2);
  assert.deepEqual(harness.groupKills, [
    [harness.child.pid, 'SIGTERM'],
    [harness.child.pid, 'SIGKILL'],
  ]);
  assert.equal(harness.child.groupAlive, false);
});

test('failure abandonment releases owned handles and listeners while preserving caller listeners',
  async () => {
    const harness = launcherHarness({ reapForceMs: 5, reapAbandonMs: 30 });
    const callerMessage = () => {};
    const callerDisconnect = () => {};
    const callerExit = () => {};
    const callerClose = () => {};
    harness.child.on('message', callerMessage);
    harness.child.on('disconnect', callerDisconnect);
    harness.child.on('exit', callerExit);
    harness.child.on('close', callerClose);
    const { lease } = await activateLauncher(harness);
    const closure = waitGateBQuickTunnelClosed(lease);
    harness.child.emit('message', {});
    await assert.rejects(closure, LAUNCH_ERROR);
    assert.equal(harness.child.privateFd.destroyed, true);
    assert.equal(harness.child.disconnectCalls, 1);
    assert.equal(harness.child.channelCloseCalls >= 1, true);
    assert.equal(harness.child.channelUnrefCalls >= 1, true);
    assert.equal(harness.child.unrefCalls, 1);
    assert.deepEqual(harness.child.listeners('message'), [callerMessage]);
    assert.deepEqual(harness.child.listeners('disconnect'), [callerDisconnect]);
    assert.deepEqual(harness.child.listeners('exit'), [callerExit]);
    assert.deepEqual(harness.child.listeners('close'), [callerClose]);
    const sentAfterClosure = harness.child.sent.length;
    harness.child.emit('message', createGateBQuickTunnelIpcMessage(
      GATE_B_QUICK_TUNNEL_IPC_TYPES.READY,
      1,
    ));
    harness.child.emit('disconnect');
    harness.child.emit('exit', 0, null);
    harness.child.emit('close', 0, null);
    assert.equal(harness.child.sent.length, sentAfterClosure);
  });

test('unproved group abandonment still releases owned state and leaves late events inert',
  async () => {
    const harness = launcherHarness({
      killProcessGroup(pid, signal) {
        harness.groupKills.push([pid, signal]);
      },
      probeProcessGroup: () => true,
      reapForceMs: 5,
      reapAbandonMs: 15,
    });
    const callerMessage = () => {};
    const callerDisconnect = () => {};
    const callerExit = () => {};
    const callerClose = () => {};
    harness.child.on('message', callerMessage);
    harness.child.on('disconnect', callerDisconnect);
    harness.child.on('exit', callerExit);
    harness.child.on('close', callerClose);
    const { lease } = await activateLauncher(harness);
    const closure = waitGateBQuickTunnelClosed(lease);
    harness.child.emit('message', {});
    await assert.rejects(closure, LAUNCH_ERROR);
    assert.deepEqual(harness.groupKills, [
      [harness.child.pid, 'SIGTERM'],
      [harness.child.pid, 'SIGKILL'],
    ]);
    assert.equal(harness.child.privateFd.destroyed, true);
    assert.equal(harness.child.disconnectCalls, 1);
    assert.equal(harness.child.channelCloseCalls >= 1, true);
    assert.equal(harness.child.channelUnrefCalls >= 1, true);
    assert.equal(harness.child.unrefCalls, 1);
    assert.deepEqual(harness.child.listeners('message'), [callerMessage]);
    assert.deepEqual(harness.child.listeners('disconnect'), [callerDisconnect]);
    assert.deepEqual(harness.child.listeners('exit'), [callerExit]);
    assert.deepEqual(harness.child.listeners('close'), [callerClose]);
    const sentAfterClosure = harness.child.sent.length;
    harness.child.emit('message', createGateBQuickTunnelIpcMessage(
      GATE_B_QUICK_TUNNEL_IPC_TYPES.READY,
      1,
    ));
    harness.child.emit('disconnect');
    harness.child.emit('exit', 0, null);
    harness.child.emit('close', 0, null);
    assert.equal(harness.child.sent.length, sentAfterClosure);
    assert.equal(harness.groupKills.length, 2);
  });

test('malformed detached fork return with a usable PGID gets exact-group cleanup', async () => {
  const directKills = [];
  const harness = launcherHarness();
  const retained = {
    kill(signal) {
      directKills.push(signal);
      return true;
    },
    once() {},
    pid: harness.child.pid,
  };
  harness.injected.forkProcess = () => retained;
  await assert.rejects(launchGateBQuickTunnel(bootstrap(), harness.injected), LAUNCH_ERROR);
  assert.deepEqual(harness.groupKills, [
    [harness.child.pid, 'SIGTERM'],
    [harness.child.pid, 'SIGKILL'],
  ]);
  assert.deepEqual(directKills, []);
});

test('malformed detached fork return with unusable identity never signals a guessed group',
  async () => {
    const directKills = [];
    let pidReads = 0;
    const retained = {
      kill(signal) {
        directKills.push(signal);
        return true;
      },
      once() {},
    };
    Object.defineProperty(retained, 'pid', {
      enumerable: true,
      get() {
        pidReads += 1;
        return 45678;
      },
    });
    const harness = launcherHarness({ forkProcess: () => retained });
    await assert.rejects(launchGateBQuickTunnel(bootstrap(), harness.injected), LAUNCH_ERROR);
    assert.equal(pidReads, 0);
    assert.deepEqual(harness.groupKills, []);
    assert.deepEqual(directKills, ['SIGTERM', 'SIGKILL']);
  });

test('proxy detached fork return is rejected without property access or guessed cleanup',
  async () => {
    let proxyReads = 0;
    const retained = new Proxy({}, {
      get() {
        proxyReads += 1;
        throw new Error('synthetic proxy access');
      },
    });
    const harness = launcherHarness({ forkProcess: () => retained });
    await assert.rejects(launchGateBQuickTunnel(bootstrap(), harness.injected), LAUNCH_ERROR);
    assert.equal(proxyReads, 0);
    assert.deepEqual(harness.groupKills, []);
  });

test('accessor-backed malformed fork returns are never evaluated during cleanup', async t => {
  for (const field of ['on', 'stdio', 'channel', 'connected']) {
    await t.test(field, async () => {
      let getterReads = 0;
      const directKills = [];
      const retained = new EventEmitter();
      retained.pid = 43210;
      retained.send = () => true;
      retained.kill = signal => { directKills.push(signal); return true; };
      retained.stdio = [null, null, null, new ControlledPrivateFd(), null];
      retained.connected = true;
      retained.channel = { close() {}, unref() {} };
      Object.defineProperty(retained, field, {
        configurable: true,
        get() {
          getterReads += 1;
          throw new Error('synthetic accessor');
        },
      });
      const callerClose = () => {};
      EventEmitter.prototype.on.call(retained, 'close', callerClose);
      const harness = launcherHarness({ forkProcess: () => retained });
      const pending = launchGateBQuickTunnel(bootstrap(), harness.injected);
      if (field === 'channel' || field === 'connected') {
        await tick();
        retained.emit('error', new Error('synthetic lifecycle failure'));
      }
      await assert.rejects(pending, LAUNCH_ERROR);
      assert.equal(getterReads, 0);
      assert.deepEqual(harness.groupKills, [
        [retained.pid, 'SIGTERM'],
        [retained.pid, 'SIGKILL'],
      ]);
      assert.deepEqual(directKills, []);
      assert.deepEqual(retained.listeners('close'), [callerClose]);
    });
  }

  await t.test('no safe identity', async () => {
    let getterReads = 0;
    const directKills = [];
    const retained = {
      kill(signal) { directKills.push(signal); return true; },
    };
    Object.defineProperty(retained, 'once', {
      get() {
        getterReads += 1;
        throw new Error('synthetic accessor');
      },
    });
    const harness = launcherHarness({ forkProcess: () => retained });
    await assert.rejects(launchGateBQuickTunnel(bootstrap(), harness.injected), LAUNCH_ERROR);
    assert.equal(getterReads, 0);
    assert.deepEqual(harness.groupKills, []);
    assert.deepEqual(directKills, ['SIGTERM', 'SIGKILL']);
  });
});

test('launcher rejects non-Darwin before any fork or process cleanup effect', async () => {
  const harness = launcherHarness({ platform: 'linux' });
  await assert.rejects(launchGateBQuickTunnel(bootstrap(), harness.injected), LAUNCH_ERROR);
  assert.equal(harness.forkCalls.length, 0);
  assert.deepEqual(harness.groupKills, []);
  assert.deepEqual(harness.child.killSignals, []);
});

test('launcher rejects proxy, accessor, symbol, extra, and inherited injections', async () => {
  const accessor = {};
  Object.defineProperty(accessor, 'forkProcess', {
    enumerable: true,
    get: () => () => new SyntheticChild(),
  });
  const withSymbol = {};
  withSymbol[Symbol('extra')] = true;
  const inherited = Object.create({ startupTimeoutMs: 1 });
  const candidates = [
    new Proxy({}, {}),
    accessor,
    withSymbol,
    { extra: true },
    inherited,
    [],
  ];
  for (const value of candidates) {
    await assert.rejects(launchGateBQuickTunnel(bootstrap(), value), LAUNCH_ERROR);
  }
});

class SupervisorIpc extends EventEmitter {
  constructor(order) {
    super();
    this.connected = true;
    this.sent = [];
    this.order = order;
    this.disconnectCalls = 0;
    this.channelUnrefCalls = 0;
    this.channel = {
      unref: () => {
        this.channelUnrefCalls += 1;
        this.order.push('ipc:unref');
      },
    };
    this.stallType = undefined;
    this.stalledCallbacks = [];
  }

  send(message, callback) {
    this.sent.push(message);
    this.order.push(`ipc:${message.type}:${message.requestId}`);
    if (message.type === this.stallType) {
      this.stalledCallbacks.push(callback);
      return true;
    }
    if (typeof callback === 'function') queueMicrotask(() => callback(null));
    return true;
  }

  disconnect() {
    this.disconnectCalls += 1;
    this.connected = false;
    this.order.push('ipc:disconnect');
    queueMicrotask(() => this.emit('disconnect'));
  }

  releaseStalled() {
    for (const callback of this.stalledCallbacks.splice(0)) {
      if (typeof callback === 'function') callback(null);
    }
  }
}

class SupervisorChild extends EventEmitter {
  constructor(order, pid = 54321) {
    super();
    this.order = order;
    this.pid = pid;
    this.exitCode = null;
    this.signalCode = null;
    this.killSignals = [];
    this.closed = false;
  }

  kill(signal) {
    this.killSignals.push(signal);
    this.order.push(`child:kill:${signal}`);
    if (!this.closed) {
      this.closed = true;
      queueMicrotask(() => {
        this.signalCode = signal;
        this.emit('exit', null, signal);
        this.order.push('child:exit');
        this.emit('close', null, signal);
        this.order.push('child:close');
      });
    }
    return true;
  }

  unexpectedExit(code = 1, signal = null) {
    if (this.closed) return;
    this.closed = true;
    this.exitCode = code;
    this.signalCode = signal;
    this.emit('exit', code, signal);
    this.order.push('child:unexpected-exit');
    this.emit('close', code, signal);
    this.order.push('child:unexpected-close');
  }
}

function syntheticTimers() {
  let nextId = 1;
  const active = new Map();
  const cancelled = [];
  const fired = [];
  const scheduled = [];
  return {
    active,
    cancelled,
    fired,
    scheduled,
    cancelTimer(id) {
      cancelled.push(id);
      active.delete(id);
    },
    fireNext() {
      const entry = active.entries().next();
      if (entry.done) throw new Error('missing synthetic timer');
      const [id, callback] = entry.value;
      active.delete(id);
      fired.push(id);
      callback();
    },
    scheduleTimer(callback, milliseconds) {
      const id = nextId;
      nextId += 1;
      scheduled.push(milliseconds);
      active.set(id, callback);
      return id;
    },
  };
}

function supervisorHarness(changes = {}) {
  const order = [];
  const ipc = new SupervisorIpc(order);
  const child = new SupervisorChild(order);
  const workspaceRecord = Object.freeze(Object.create(null));
  const runtimeToken = Object.freeze(Object.create(null));
  const state = {
    order,
    ipc,
    child,
    workspaceRecord,
    runtimeToken,
    reserveCalls: 0,
    sourceWrites: 0,
    sourceReads: 0,
    sourceBytes: undefined,
    syncCalls: 0,
    lsofCalls: 0,
    httpCalls: [],
    attestCalls: [],
    versionCalls: [],
    versionOutput: 'cloudflared version 2026.8.2 (built fixture)\n',
    spawnCalls: [],
    runtimeRemoved: 0,
    hostname: HOSTNAME,
    connectorId: CONNECTOR_ID,
    readyStatus: 200,
    readyConnections: 1,
    metricsPort: 43210,
    blockHttp: false,
    blockedHttp: false,
  };
  const workspace = Object.freeze({
    async reserveOutputs(names) {
      state.reserveCalls += 1;
      order.push('workspace:reserve');
      assert.deepEqual(names, ['quick-tunnel-hostname-source.json']);
      return Object.freeze([workspaceRecord]);
    },
    async write(record, bytes) {
      assert.equal(record, workspaceRecord);
      state.sourceWrites += 1;
      order.push('workspace:write');
      state.sourceBytes = Buffer.from(bytes);
      return true;
    },
    async read(record) {
      assert.equal(record, workspaceRecord);
      state.sourceReads += 1;
      order.push('workspace:read');
      return Buffer.from(state.sourceBytes);
    },
    async syncDirectories() {
      state.syncCalls += 1;
      order.push('workspace:sync');
      return true;
    },
    async close() {
      order.push('workspace:close');
      return true;
    },
  });
  const injections = {
    architecture: 'arm64',
    assertDevNull: async () => { order.push('devnull'); return true; },
    async inspectExecutable(path, pin, versionAttestor) {
      state.attestCalls.push([path, pin]);
      order.push(state.attestCalls.length === 1
        ? 'attest:before'
        : state.attestCalls.length === 2 ? 'attest:after' : 'attest:retained');
      assert.equal(await versionAttestor(path), true);
      return {
        ctimeNs: 1n,
        dev: 2n,
        digest: pin,
        ino: 3n,
        mode: 0o100500n,
        mtimeNs: 4n,
        nlink: 1n,
        size: 5n,
      };
    },
    checkTimeoutMs: 200,
    async createRuntimeDirectory() {
      order.push('runtime:create');
      return runtimeToken;
    },
    hardLifetimeMs: 500,
    async httpGet({ port, path, signal }) {
      state.httpCalls.push([port, path]);
      order.push(`http:${path}`);
      if (state.blockHttp) {
        state.blockedHttp = true;
        return new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('synthetic abort')), {
            once: true,
          });
        });
      }
      if (path === '/quicktunnel') {
        const body = Buffer.from(`{"hostname":"${state.hostname}"}`, 'utf8');
        return snapshot(body);
      }
      const body = Buffer.from(
        `{"status":${state.readyStatus},"readyConnections":${state.readyConnections},` +
          `"connectorId":"${state.connectorId}"}`,
        'utf8',
      );
      return snapshot(body, { statusCode: state.readyStatus });
    },
    ipc,
    observationGapMs: 1,
    async openWorkspace(root) {
      assert.equal(root, WORKSPACE_ROOT);
      order.push('workspace:open');
      return workspace;
    },
    platform: 'darwin',
    async readBootstrapFrame() {
      order.push('bootstrap:read');
      return frameGateBQuickTunnelBootstrap(bootstrap());
    },
    reapForceMs: 10,
    async removeRuntimeDirectory(token) {
      assert.equal(token, runtimeToken);
      assert.equal(child.closed, true);
      state.runtimeRemoved += 1;
      order.push('runtime:remove');
      return true;
    },
    async runLsof({ pid, signal }) {
      assert.equal(pid, child.pid);
      assert.equal(signal.aborted, false);
      state.lsofCalls += 1;
      order.push('lsof');
      return lsofFixture(pid, state.metricsPort);
    },
    runtimeDirectoryPath(token) {
      assert.equal(token, runtimeToken);
      return '/private/tmp/gate-b-quick-tunnel-runtime-fixture';
    },
    shutdownTimeoutMs: 200,
    async sleep(milliseconds, signal) {
      assert.equal(milliseconds, 1);
      assert.equal(signal.aborted, false);
      order.push('sleep');
      return true;
    },
    spawnProcess(...args) {
      state.spawnCalls.push(args);
      order.push('spawn');
      return child;
    },
    spawnSyncProcess(...args) {
      state.versionCalls.push(args);
      order.push('version');
      return {
        signal: null,
        status: 0,
        stderr: Buffer.alloc(0),
        stdout: Buffer.from(state.versionOutput, 'utf8'),
      };
    },
    startupTimeoutMs: 200,
    ...changes,
  };
  return { state, injections, workspace };
}

function guardedExecutableSupervisorHarness(changes = {}) {
  const executablePath = changes.executablePath ?? '/trusted/private/runtime/cloudflared';
  const uid = typeof process.getuid === 'function' ? process.getuid() : 501;
  let nextFd = 20;
  const closedHandles = [];
  const aclCalls = [];
  const identities = new Map();
  const makeStat = ({ directory, ino, permissions, owner = uid, size = 4096n }) => ({
    ctimeNs: 1n,
    dev: 1n,
    gid: BigInt(owner),
    ino: BigInt(ino),
    mode: BigInt((directory ? 0o040000 : 0o100000) | permissions),
    mtimeNs: 1n,
    nlink: 1n,
    size: directory ? 0n : size,
    uid: BigInt(owner),
    isDirectory: () => directory,
    isFile: () => !directory,
    isSymbolicLink: () => false,
  });
  identities.set('/', makeStat({ directory: true, ino: 1, owner: 0, permissions: 0o755 }));
  identities.set('/trusted', makeStat({
    directory: true, ino: 2, owner: 0, permissions: 0o755,
  }));
  identities.set('/trusted/private', makeStat({
    directory: true, ino: 3, permissions: 0o700,
  }));
  identities.set('/trusted/private/runtime', makeStat({
    directory: true, ino: 4, permissions: 0o700,
  }));
  identities.set(executablePath, makeStat({
    directory: false, ino: 5, permissions: 0o500,
  }));
  const handles = [];
  const harness = supervisorHarness({
    async readBootstrapFrame() {
      return frameGateBQuickTunnelBootstrap(bootstrap({
        cloudflaredExecutable: executablePath,
      }));
    },
  });
  const order = harness.state.order;
  delete harness.injections.inspectExecutable;
  harness.injections.inspectExecutableAcl = async request => {
    aclCalls.push({ ...request });
    order.push(`acl:${request.kind}:${request.cwd}`);
    if (typeof changes.aclResult === 'function') return changes.aclResult(request);
    return true;
  };
  harness.injections.lstatExecutablePath = async path => {
    order.push(`lstat:${path}`);
    const state = identities.get(path);
    if (!state) throw new Error('synthetic missing path');
    return state;
  };
  harness.injections.openExecutablePath = async path => {
    order.push(`open:${path}`);
    const identity = identities.get(path);
    if (!identity) throw new Error('synthetic missing path');
    const captured = identity;
    const fd = nextFd;
    nextFd += 1;
    const handle = {
      fd,
      async close() {
        if (closedHandles.includes(fd)) throw new Error('synthetic duplicate close');
        closedHandles.push(fd);
        order.push(`close:${path}`);
      },
      async read(buffer, offset, length) {
        if (path !== executablePath || offset !== 0 || length !== 8) {
          throw new Error('synthetic unexpected read');
        }
        Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x0c, 0x00, 0x00, 0x01])
          .copy(buffer, offset);
        return { bytesRead: 8 };
      },
      async stat() { return captured; },
    };
    handles.push(handle);
    return handle;
  };
  harness.injections.readExecutableHash = async () => Buffer.from(SOURCE_PIN, 'hex');
  harness.injections.realpathExecutablePath = async path => {
    order.push(`realpath:${path}`);
    if (changes.symlinkParent === path) return `${path}-resolved`;
    return path;
  };
  const originalSpawn = harness.injections.spawnProcess;
  harness.injections.spawnProcess = (...args) => {
    order.push('spawn:runtime');
    changes.beforeSpawn?.({ executablePath, identities });
    return originalSpawn(...args);
  };
  return {
    ...harness,
    aclCalls,
    closedHandles,
    executablePath,
    handles,
    identities,
    order,
  };
}

async function startSupervisor(harness) {
  const promise = superviseGateBQuickTunnel(harness.injections);
  await eventually(() => harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.READY));
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
    1,
  ));
  await eventually(() => harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.ACTIVE));
  return { promise };
}

async function stopSupervisor(harness, requestId) {
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.STOP,
    requestId,
  ));
  await eventually(() => harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.STOPPED &&
    message.requestId === requestId));
}

test('supervisor reserves durably before fixed version/child policies and observations',
  async () => {
    const harness = supervisorHarness();
    const { promise: supervision } = await startSupervisor(harness);
    const { state, injections } = harness;
    assert.equal(state.reserveCalls, 1);
    assert.equal(state.syncCalls, 2);
    assert.equal(state.sourceWrites, 1);
    assert.equal(state.sourceReads, 1);
    assert.equal(state.lsofCalls, 6);
    assert.deepEqual(state.httpCalls, [
      [state.metricsPort, '/quicktunnel'], [state.metricsPort, '/ready'],
      [state.metricsPort, '/quicktunnel'], [state.metricsPort, '/ready'],
      [state.metricsPort, '/quicktunnel'], [state.metricsPort, '/ready'],
    ]);
    assert.ok(state.order.indexOf('workspace:reserve') < state.order.indexOf('devnull'));
    assert.ok(state.order.indexOf('workspace:sync') < state.order.indexOf('devnull'));
    assert.ok(state.order.indexOf('attest:before') < state.order.indexOf('spawn'));
    assert.ok(state.order.indexOf('spawn') < state.order.indexOf('attest:after'));
    assert.ok(state.order.indexOf('version') < state.order.indexOf('spawn'));
    assert.ok(state.order.lastIndexOf('version') > state.order.indexOf('spawn'));
    assert.ok(state.order.indexOf('workspace:write') < state.order.indexOf('workspace:read'));
    assert.ok(state.order.indexOf('workspace:read') < state.order.indexOf('ipc:ACTIVE:1'));

    assert.equal(state.spawnCalls.length, 1);
    const [executable, argv, options] = state.spawnCalls[0];
    assert.equal(executable, EXECUTABLE);
    assert.deepEqual(argv, [
      'tunnel',
      '--protocol', 'http2',
      '--config', '/dev/null',
      '--origincert', '/dev/null',
      '--credentials-file', '/dev/null',
      '--no-autoupdate',
      '--no-prechecks',
      '--management-diagnostics=false',
      '--url', 'http://127.0.0.1:41000',
      '--metrics', '127.0.0.1:0',
    ]);
    assert.equal(argv.includes('quic'), false);
    assert.equal(argv.includes('auto'), false);
    const runtimePath = injections.runtimeDirectoryPath(state.runtimeToken);
    assert.deepEqual(options, {
      argv0: 'cloudflared',
      cwd: runtimePath,
      detached: false,
      env: { HOME: runtimePath, TMPDIR: runtimePath },
      shell: false,
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
    });
    assert.equal(state.attestCalls.length, 2);
    assert.ok(state.order.indexOf('attest:after') <
      state.order.indexOf('workspace:write'));
    const parsedSource = parseGateBQuickTunnelHostnameSource(state.sourceBytes);
    assert.equal(parsedSource.schemaVersion, 2);
    assert.equal(validateGateBQuickTunnelStableBinding(parsedSource.quickTunnel), true);
    assert.deepEqual(parsedSource.quickTunnel, canonicalQuickTunnelBinding());
    const persistedText = state.sourceBytes.toString('utf8');
    assert.equal(parsedSource.quickTunnel.runtimeControl.processTopology,
      'non-detached-child-of-retained-supervisor');
    assert.equal(persistedText.includes('watchdog'), false);
    for (const prohibited of [
      EXECUTABLE, WORKSPACE_ROOT, String(state.child.pid), 'device', 'inode',
      'signer', 'diagnostic',
    ]) assert.equal(persistedText.includes(prohibited), false);
    assert.equal(state.versionCalls.length, 2);
    for (const [versionExecutable, versionArgv, versionOptions] of state.versionCalls) {
      assert.equal(versionExecutable, EXECUTABLE);
      assert.deepEqual(versionArgv, ['--version']);
      assert.deepEqual(versionOptions, {
        argv0: 'cloudflared',
        cwd: '/',
        env: {},
        killSignal: 'SIGKILL',
        maxBuffer: 256,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 2_000,
        windowsHide: true,
      });
    }
    const childVisibleText = JSON.stringify({
      tunnel: {
        argv: [options.argv0, ...argv],
        options,
      },
      ipc: state.ipc.sent,
      versions: state.versionCalls.map(([, versionArgv, versionOptions]) => ({
        argv: [versionOptions.argv0, ...versionArgv],
        options: versionOptions,
        output: state.versionOutput,
      })),
    });
    for (const privateValue of [
      WORKSPACE_ROOT, EXECUTABLE, SOURCE_PIN, HOSTNAME, CONNECTOR_ID,
      bootstrap().telemetryAcknowledgement, bootstrap().telemetryMode,
    ]) assert.equal(childVisibleText.includes(privateValue), false);

    await stopSupervisor(harness, 2);
    assert.equal(await supervision, true);
    assert.equal(state.runtimeRemoved, 1);
    assert.ok(state.order.indexOf('child:close') < state.order.indexOf('runtime:remove'));
    assert.ok(state.order.indexOf('runtime:remove') < state.order.indexOf('ipc:STOPPED:2'));
    assert.ok(state.order.indexOf('ipc:STOPPED:2') < state.order.indexOf('ipc:unref'));
    assert.ok(state.order.indexOf('ipc:unref') < state.order.indexOf('ipc:disconnect'));
    assert.equal(state.ipc.disconnectCalls, 1);
    assert.equal(state.ipc.channelUnrefCalls, 1);
    assert.equal(state.ipc.listenerCount('message'), 0);
    assert.equal(state.ipc.listenerCount('disconnect'), 0);
  });

test('supervisor emits no ACTIVE while the first readiness observation is blocked', async () => {
  const harness = supervisorHarness();
  harness.state.blockHttp = true;
  const supervision = superviseGateBQuickTunnel(harness.injections);
  await eventually(() => harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.READY));
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
    1,
  ));
  await eventually(() => harness.state.blockedHttp);
  assert.equal(harness.state.sourceWrites, 0);
  assert.equal(harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.ACTIVE), false);
  harness.state.ipc.connected = false;
  harness.state.ipc.emit('disconnect');
  await assert.rejects(supervision);
  assert.equal(harness.state.runtimeRemoved, 1);
});

test('a deferred source reread cannot send ACTIVE after startup timeout or disconnect cleanup',
  async t => {
    for (const trigger of ['timeout', 'disconnect']) {
      await t.test(trigger, async () => {
        const harness = supervisorHarness({
          startupTimeoutMs: trigger === 'timeout' ? 50 : 200,
        });
        const originalOpenWorkspace = harness.injections.openWorkspace;
        let markReadStarted;
        let releaseRead;
        const readStarted = new Promise(resolve => { markReadStarted = resolve; });
        const readGate = new Promise(resolve => { releaseRead = resolve; });
        harness.injections.openWorkspace = async root => {
          const workspace = await originalOpenWorkspace(root);
          return Object.freeze({
            ...workspace,
            async read(record) {
              assert.equal(record, harness.state.workspaceRecord);
              harness.state.sourceReads += 1;
              harness.state.order.push('workspace:read:deferred');
              markReadStarted(true);
              await readGate;
              return Buffer.from(harness.state.sourceBytes);
            },
          });
        };
        const supervision = superviseGateBQuickTunnel(harness.injections);
        await eventually(() => harness.state.ipc.sent.some(message =>
          message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.READY));
        harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
          GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
          1,
        ));
        await readStarted;
        if (trigger === 'disconnect') {
          harness.state.ipc.connected = false;
          harness.state.ipc.emit('disconnect');
        }
        await assert.rejects(supervision);
        assert.equal(harness.state.runtimeRemoved, 1);
        assert.equal(harness.state.ipc.sent.some(message =>
          message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.ACTIVE), false);
        releaseRead(true);
        await tick();
        await tick();
        assert.equal(harness.state.ipc.sent.some(message =>
          message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.ACTIVE), false);
        assert.ok(harness.state.order.indexOf('child:close') <
          harness.state.order.indexOf('runtime:remove'));
      });
    }
  });

test('startup waits through initial listener absence, then requires three stable observations',
  async () => {
    const harness = supervisorHarness();
    const originalRunLsof = harness.injections.runLsof;
    let absent = 2;
    harness.injections.runLsof = async options => {
      if (absent === 0) return originalRunLsof(options);
      assert.equal(options.pid, harness.state.child.pid);
      assert.equal(options.signal.aborted, false);
      absent -= 1;
      harness.state.lsofCalls += 1;
      harness.state.order.push('lsof');
      return Buffer.alloc(0);
    };
    const { promise: supervision } = await startSupervisor(harness);
    assert.equal(harness.state.lsofCalls, 8);
    assert.equal(harness.state.httpCalls.length, 6);
    assert.equal(harness.state.order.filter(entry => entry === 'sleep').length, 4);
    assert.equal(harness.state.sourceWrites, 1);
    await stopSupervisor(harness, 2);
    assert.equal(await supervision, true);
  });

test('startup preserves identity across exact 503/zero transients before three ready successes',
  async () => {
    const harness = supervisorHarness();
    const originalHttpGet = harness.injections.httpGet;
    let readyCalls = 0;
    harness.injections.httpGet = async options => {
      if (options.path === '/ready') {
        readyCalls += 1;
        harness.state.readyStatus = readyCalls <= 2 ? 503 : 200;
        harness.state.readyConnections = readyCalls <= 2 ? 0 : 1;
      }
      return originalHttpGet(options);
    };
    const { promise: supervision } = await startSupervisor(harness);
    assert.equal(readyCalls, 5);
    assert.equal(harness.state.lsofCalls, 10);
    assert.equal(harness.state.httpCalls.length, 10);
    assert.equal(harness.state.order.filter(entry => entry === 'sleep').length, 4);
    assert.equal(harness.state.sourceWrites, 1);
    await stopSupervisor(harness, 2);
    assert.equal(await supervision, true);
  });

test('startup rejects identity drift between exact 503/zero transient observations', async () => {
  const harness = supervisorHarness();
  const originalHttpGet = harness.injections.httpGet;
  let readyCalls = 0;
  harness.injections.httpGet = async options => {
    if (options.path === '/ready') {
      readyCalls += 1;
      harness.state.readyStatus = 503;
      harness.state.readyConnections = 0;
      if (readyCalls === 2) {
        harness.state.connectorId = '22222222-3333-4444-8555-666666666666';
      }
    }
    return originalHttpGet(options);
  };
  const supervision = superviseGateBQuickTunnel(harness.injections);
  await eventually(() => harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.READY));
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
    1,
  ));
  await assert.rejects(supervision);
  assert.equal(readyCalls, 2);
  assert.equal(harness.state.sourceWrites, 0);
  assert.equal(harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.ACTIVE), false);
  assert.equal(harness.state.runtimeRemoved, 1);
});

test('startup rejects a non-503 non-ready response without polling', async () => {
  const harness = supervisorHarness();
  harness.state.readyStatus = 502;
  harness.state.readyConnections = 0;
  const supervision = superviseGateBQuickTunnel(harness.injections);
  await eventually(() => harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.READY));
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
    1,
  ));
  await assert.rejects(supervision);
  assert.equal(harness.state.lsofCalls, 1);
  assert.equal(harness.state.httpCalls.length, 2);
  assert.equal(harness.state.order.includes('sleep'), false);
  assert.equal(harness.state.sourceWrites, 0);
  assert.equal(harness.state.runtimeRemoved, 1);
});

test('a 503/zero reconnect resets readiness before three new stable observations', async () => {
  const harness = supervisorHarness();
  const originalHttpGet = harness.injections.httpGet;
  let readyCalls = 0;
  harness.injections.httpGet = async options => {
    if (options.path === '/ready') {
      readyCalls += 1;
      harness.state.readyStatus = readyCalls === 2 ? 503 : 200;
      harness.state.readyConnections = readyCalls === 2 ? 0 : 1;
    }
    return originalHttpGet(options);
  };
  const { promise: supervision } = await startSupervisor(harness);
  assert.equal(readyCalls, 5);
  assert.equal(harness.state.lsofCalls, 10);
  assert.equal(harness.state.httpCalls.length, 10);
  assert.equal(harness.state.order.filter(entry => entry === 'sleep').length, 4);
  assert.equal(harness.state.sourceWrites, 1);
  await stopSupervisor(harness, 2);
  assert.equal(await supervision, true);
});

test('startup no-listener polling has a deterministic deadline-derived attempt bound',
  async () => {
    let now = 0;
    const harness = supervisorHarness({
      monotonicNow: () => now,
      observationGapMs: 1,
      startupTimeoutMs: 3,
    });
    harness.injections.runLsof = async ({ pid, signal }) => {
      assert.equal(pid, harness.state.child.pid);
      assert.equal(signal.aborted, false);
      harness.state.lsofCalls += 1;
      harness.state.order.push('lsof');
      return Buffer.alloc(0);
    };
    harness.injections.sleep = async (milliseconds, signal) => {
      assert.equal(milliseconds, 1);
      assert.equal(signal.aborted, false);
      now += milliseconds;
      harness.state.order.push('sleep');
      return true;
    };
    const supervision = superviseGateBQuickTunnel(harness.injections);
    await eventually(() => harness.state.ipc.sent.some(message =>
      message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.READY));
    harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
      GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
      1,
    ));
    await assert.rejects(supervision);
    assert.equal(harness.state.lsofCalls, 3);
    assert.equal(harness.state.order.filter(entry => entry === 'sleep').length, 2);
    assert.equal(harness.state.httpCalls.length, 0);
    assert.equal(harness.state.sourceWrites, 0);
    assert.equal(harness.state.runtimeRemoved, 1);
  });

test('startup rejects malformed listener evidence without retrying', async () => {
  const harness = supervisorHarness();
  harness.injections.runLsof = async ({ pid, signal }) => {
    assert.equal(pid, harness.state.child.pid);
    assert.equal(signal.aborted, false);
    harness.state.lsofCalls += 1;
    harness.state.order.push('lsof');
    return Buffer.from('malformed\n', 'ascii');
  };
  const supervision = superviseGateBQuickTunnel(harness.injections);
  await eventually(() => harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.READY));
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
    1,
  ));
  await assert.rejects(supervision);
  assert.equal(harness.state.lsofCalls, 1);
  assert.equal(harness.state.order.includes('sleep'), false);
  assert.equal(harness.state.sourceWrites, 0);
  assert.equal(harness.state.runtimeRemoved, 1);
});

test('startup rejects a non-buffer absence without retrying', async () => {
  const harness = supervisorHarness();
  harness.injections.runLsof = async ({ pid, signal }) => {
    assert.equal(pid, harness.state.child.pid);
    assert.equal(signal.aborted, false);
    harness.state.lsofCalls += 1;
    harness.state.order.push('lsof');
    return '';
  };
  const supervision = superviseGateBQuickTunnel(harness.injections);
  await eventually(() => harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.READY));
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
    1,
  ));
  await assert.rejects(supervision);
  assert.equal(harness.state.lsofCalls, 1);
  assert.equal(harness.state.order.includes('sleep'), false);
  assert.equal(harness.state.sourceWrites, 0);
  assert.equal(harness.state.runtimeRemoved, 1);
});

test('startup reconnect tolerates a temporary listener loss before three stable observations',
  async () => {
    const harness = supervisorHarness();
    const originalRunLsof = harness.injections.runLsof;
    harness.injections.runLsof = async options => {
      if (harness.state.lsofCalls !== 2) return originalRunLsof(options);
      assert.equal(options.pid, harness.state.child.pid);
      assert.equal(options.signal.aborted, false);
      harness.state.lsofCalls += 1;
      harness.state.order.push('lsof');
      return Buffer.alloc(0);
    };
    const { promise: supervision } = await startSupervisor(harness);
    assert.equal(harness.state.lsofCalls, 9);
    assert.equal(harness.state.httpCalls.length, 8);
    assert.equal(harness.state.order.filter(entry => entry === 'sleep').length, 4);
    assert.equal(harness.state.sourceWrites, 1);
    assert.ok(harness.state.order.lastIndexOf('lsof') <
      harness.state.order.indexOf('workspace:write'));
    await stopSupervisor(harness, 2);
    assert.equal(await supervision, true);
  });

test('startup reconnect rejects recovered listener identity drift before persistence', async () => {
  const harness = supervisorHarness();
  const originalRunLsof = harness.injections.runLsof;
  harness.injections.runLsof = async options => {
    if (harness.state.lsofCalls !== 2) return originalRunLsof(options);
    assert.equal(options.pid, harness.state.child.pid);
    assert.equal(options.signal.aborted, false);
    harness.state.lsofCalls += 1;
    harness.state.order.push('lsof');
    harness.state.metricsPort += 1;
    return Buffer.alloc(0);
  };
  const supervision = superviseGateBQuickTunnel(harness.injections);
  await eventually(() => harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.READY));
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
    1,
  ));
  await assert.rejects(supervision);
  assert.equal(harness.state.lsofCalls, 5);
  assert.equal(harness.state.httpCalls.length, 4);
  assert.equal(harness.state.order.filter(entry => entry === 'sleep').length, 2);
  assert.equal(harness.state.sourceWrites, 0);
  assert.equal(harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.ACTIVE), false);
  assert.equal(harness.state.runtimeRemoved, 1);
});

test('startup rejects persistent listener disappearance within its original attempt budget',
  async () => {
    let now = 0;
    const harness = supervisorHarness({
      monotonicNow: () => now,
      observationGapMs: 1,
      startupTimeoutMs: 5,
    });
    const originalRunLsof = harness.injections.runLsof;
    harness.injections.runLsof = async options => {
      if (harness.state.lsofCalls < 2) return originalRunLsof(options);
      assert.equal(options.pid, harness.state.child.pid);
      assert.equal(options.signal.aborted, false);
      harness.state.lsofCalls += 1;
      harness.state.order.push('lsof');
      return Buffer.alloc(0);
    };
    harness.injections.sleep = async (milliseconds, signal) => {
      assert.equal(milliseconds, 1);
      assert.equal(signal.aborted, false);
      now += milliseconds;
      harness.state.order.push('sleep');
      return true;
    };
    const supervision = superviseGateBQuickTunnel(harness.injections);
    await eventually(() => harness.state.ipc.sent.some(message =>
      message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.READY));
    harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
      GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
      1,
    ));
    await assert.rejects(supervision);
    assert.equal(harness.state.lsofCalls, 6);
    assert.equal(harness.state.httpCalls.length, 2);
    assert.equal(harness.state.order.filter(entry => entry === 'sleep').length, 4);
    assert.equal(harness.state.sourceWrites, 0);
    assert.equal(harness.state.runtimeRemoved, 1);
  });

test('startup child exit during no-listener polling fails closed and cleans up', async () => {
  const harness = supervisorHarness();
  harness.injections.runLsof = async ({ pid, signal }) => {
    assert.equal(pid, harness.state.child.pid);
    assert.equal(signal.aborted, false);
    harness.state.lsofCalls += 1;
    harness.state.order.push('lsof');
    return Buffer.alloc(0);
  };
  harness.injections.sleep = async (milliseconds, signal) => {
    assert.equal(milliseconds, 1);
    assert.equal(signal.aborted, false);
    harness.state.order.push('sleep');
    harness.state.child.unexpectedExit();
    return true;
  };
  const supervision = superviseGateBQuickTunnel(harness.injections);
  await eventually(() => harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.READY));
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
    1,
  ));
  await assert.rejects(supervision);
  assert.equal(harness.state.lsofCalls, 1);
  assert.equal(harness.state.sourceWrites, 0);
  assert.equal(harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.ACTIVE), false);
  assert.equal(harness.state.runtimeRemoved, 1);
});

test('startup observation drift fails before ACTIVE and preserves one-shot source semantics',
  async t => {
    await t.test('listener changes inside one observation', async () => {
      const harness = supervisorHarness();
      const originalRunLsof = harness.injections.runLsof;
      harness.injections.runLsof = async options => {
        const bytes = await originalRunLsof(options);
        if (harness.state.lsofCalls === 1) harness.state.metricsPort += 1;
        return bytes;
      };
      const supervision = superviseGateBQuickTunnel(harness.injections);
      await eventually(() => harness.state.ipc.sent.some(message =>
        message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.READY));
      harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
        GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
        1,
      ));
      await assert.rejects(supervision);
      assert.equal(harness.state.sourceWrites, 0);
      assert.equal(harness.state.ipc.sent.some(message =>
        message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.ACTIVE), false);
    });

    await t.test('connector changes before the third stable observation', async () => {
      const harness = supervisorHarness();
      const originalHttpGet = harness.injections.httpGet;
      harness.injections.httpGet = async options => {
        const snapshotValue = await originalHttpGet(options);
        if (harness.state.httpCalls.length === 4) {
          harness.state.connectorId = '22222222-3333-4444-8555-666666666666';
        }
        return snapshotValue;
      };
      const supervision = superviseGateBQuickTunnel(harness.injections);
      await eventually(() => harness.state.ipc.sent.some(message =>
        message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.READY));
      harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
        GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
        1,
      ));
      await assert.rejects(supervision);
      assert.equal(harness.state.sourceWrites, 0);
      assert.equal(harness.state.sourceReads, 0);
      assert.equal(harness.state.ipc.sent.some(message =>
        message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.ACTIVE), false);
    });
  });

test('each supervisor CHECK performs a fresh complete pinned observation', async () => {
  const harness = supervisorHarness();
  const { promise: supervision } = await startSupervisor(harness);
  const lsofBefore = harness.state.lsofCalls;
  const httpBefore = harness.state.httpCalls.length;
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK,
    2,
  ));
  await eventually(() => harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED && message.requestId === 2));
  assert.equal(harness.state.lsofCalls - lsofBefore, 2);
  assert.equal(harness.state.httpCalls.length - httpBefore, 2);
  assert.equal(harness.state.sourceWrites, 1);
  assert.equal(harness.state.sourceReads, 1);

  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK,
    3,
  ));
  await eventually(() => harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED && message.requestId === 3));
  assert.equal(harness.state.lsofCalls - lsofBefore, 4);
  assert.equal(harness.state.httpCalls.length - httpBefore, 4);
  assert.equal(harness.state.sourceWrites, 1);
  await stopSupervisor(harness, 4);
  assert.equal(await supervision, true);
});

test('a fresh CHECK that differs from the pinned tunnel identity fails closed', async () => {
  const harness = supervisorHarness();
  const { promise: supervision } = await startSupervisor(harness);
  harness.state.hostname = 'changed-fixture.trycloudflare.com';
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK,
    2,
  ));
  await assert.rejects(supervision);
  assert.equal(harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED), false);
  assert.equal(harness.state.sourceWrites, 1);
  assert.equal(harness.state.runtimeRemoved, 1);
});

test('a fresh CHECK rejects the startup-only 503/zero readiness state', async () => {
  const harness = supervisorHarness();
  const { promise: supervision } = await startSupervisor(harness);
  harness.state.readyStatus = 503;
  harness.state.readyConnections = 0;
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK,
    2,
  ));
  await assert.rejects(supervision);
  assert.equal(harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED), false);
  assert.equal(harness.state.sourceWrites, 1);
  assert.equal(harness.state.runtimeRemoved, 1);
});

test('supervisor STOP preempts a CHECK, aborts its probe, and suppresses CHECKED', async () => {
  const harness = supervisorHarness();
  const { promise: supervision } = await startSupervisor(harness);
  harness.state.blockHttp = true;
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK,
    2,
  ));
  await eventually(() => harness.state.blockedHttp);
  await stopSupervisor(harness, 3);
  assert.equal(await supervision, true);
  assert.equal(harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED && message.requestId === 2), false);
});

test('supervisor close waits cancel every synthetic shutdown timer', async t => {
  await t.test('TERM close clears its pending timer', async () => {
    const timers = syntheticTimers();
    const harness = supervisorHarness({
      cancelTimer: timers.cancelTimer,
      scheduleTimer: timers.scheduleTimer,
      shutdownTimeoutMs: 50,
    });
    const { promise: supervision } = await startSupervisor(harness);
    await stopSupervisor(harness, 2);
    assert.equal(await supervision, true);
    assert.deepEqual(timers.scheduled, [10]);
    assert.equal(timers.fired.length, 0);
    assert.equal(timers.cancelled.length, 1);
    assert.equal(timers.active.size, 0);
  });

  await t.test('forced close stays inside one outer budget with no stale timer', async () => {
    const timers = syntheticTimers();
    const harness = supervisorHarness({
      cancelTimer: timers.cancelTimer,
      scheduleTimer: timers.scheduleTimer,
      shutdownTimeoutMs: 50,
    });
    const { promise: supervision } = await startSupervisor(harness);
    harness.state.child.kill = signal => {
      harness.state.child.killSignals.push(signal);
      harness.state.order.push(`child:kill:${signal}`);
      if (signal === 'SIGKILL' && !harness.state.child.closed) {
        harness.state.child.closed = true;
        queueMicrotask(() => {
          harness.state.child.signalCode = signal;
          harness.state.child.emit('exit', null, signal);
          harness.state.order.push('child:exit');
          harness.state.child.emit('close', null, signal);
          harness.state.order.push('child:close');
        });
      }
      return true;
    };
    harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
      GATE_B_QUICK_TUNNEL_IPC_TYPES.STOP,
      2,
    ));
    await eventually(() => timers.active.size === 1);
    timers.fireNext();
    await eventually(() => harness.state.ipc.sent.some(message =>
      message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.STOPPED));
    assert.equal(await supervision, true);
    assert.deepEqual(harness.state.child.killSignals, ['SIGTERM', 'SIGKILL']);
    assert.deepEqual(timers.scheduled, [10, 40]);
    assert.equal(timers.fired.length, 1);
    assert.equal(timers.cancelled.length, 2);
    assert.equal(timers.active.size, 0);
  });
});

test('a stalled CHECKED callback remains on the CHECK deadline and fails closed', async () => {
  const harness = supervisorHarness({ checkTimeoutMs: 8 });
  const { promise: supervision } = await startSupervisor(harness);
  harness.state.ipc.stallType = GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED;
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK,
    2,
  ));
  await eventually(() => harness.state.ipc.stalledCallbacks.length === 1);
  await assert.rejects(supervision);
  assert.equal(harness.state.runtimeRemoved, 1);
  assert.equal(harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.STOPPED), false);
  harness.state.ipc.releaseStalled();
});

test('STOP preempts a CHECK whose CHECKED callback is stalled', async () => {
  const harness = supervisorHarness();
  const { promise: supervision } = await startSupervisor(harness);
  harness.state.ipc.stallType = GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED;
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK,
    2,
  ));
  await eventually(() => harness.state.ipc.stalledCallbacks.length === 1);
  await stopSupervisor(harness, 3);
  assert.equal(await supervision, true);
  harness.state.ipc.releaseStalled();
  assert.equal(harness.state.runtimeRemoved, 1);
});

test('an actual overlapping CHECK fails closed without a stale CHECKED response', async () => {
  const harness = supervisorHarness();
  const { promise: supervision } = await startSupervisor(harness);
  harness.state.blockHttp = true;
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK,
    2,
  ));
  await eventually(() => harness.state.blockedHttp);
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK,
    3,
  ));
  await assert.rejects(supervision);
  assert.equal(harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED), false);
  assert.equal(harness.state.runtimeRemoved, 1);
});

test('supervisor rejects stale IDs, overlapping commands, and late CHECKED messages', async t => {
  for (const [name, candidate] of [
    ['stale check', createGateBQuickTunnelIpcMessage(
      GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK, 3)],
    ['unexpected checked', createGateBQuickTunnelIpcMessage(
      GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED, 2)],
    ['extra field', { ipcVersion: 1, requestId: 2,
      type: GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK, extra: true }],
  ]) {
    await t.test(name, async () => {
      const harness = supervisorHarness();
      const { promise: supervision } = await startSupervisor(harness);
      harness.state.ipc.emit('message', candidate);
      await assert.rejects(supervision);
      assert.equal(harness.state.ipc.sent.some(message =>
        message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.STOPPED), false);
      assert.equal(harness.state.runtimeRemoved, 1);
    });
  }
});

test('production path guard rejects leaf ACL and hostile parent-chain authority before spawn',
  async t => {
    const cases = [
      ['leaf ACL', () => guardedExecutableSupervisorHarness({
        aclResult: request => request.kind !== 'file',
      })],
      ['parent ACL', () => guardedExecutableSupervisorHarness({
        aclResult: request => request.cwd !== '/trusted/private',
      })],
      ['writable parent', () => {
        const harness = guardedExecutableSupervisorHarness();
        harness.identities.get('/trusted').mode = BigInt(0o040775);
        return harness;
      }],
      ['wrong leaf mode', () => {
        const harness = guardedExecutableSupervisorHarness();
        harness.identities.get(harness.executablePath).mode = BigInt(0o100700);
        return harness;
      }],
      ['wrong canonical basename', () => guardedExecutableSupervisorHarness({
        executablePath: '/trusted/private/runtime/cloudflared-copy',
      })],
      ['missing private anchor', () => {
        const harness = guardedExecutableSupervisorHarness();
        harness.identities.get('/trusted/private').mode = BigInt(0o040755);
        harness.identities.get('/trusted/private/runtime').mode = BigInt(0o040755);
        return harness;
      }],
      ['other-owner parent', () => {
        const harness = guardedExecutableSupervisorHarness();
        harness.identities.get('/trusted').uid = 99999n;
        return harness;
      }],
      ['wrong descendant mode', () => {
        const harness = guardedExecutableSupervisorHarness();
        harness.identities.get('/trusted/private/runtime').mode = BigInt(0o040755);
        return harness;
      }],
      ['symlink parent', () => {
        const harness = guardedExecutableSupervisorHarness();
        harness.identities.get('/trusted').isSymbolicLink = () => true;
        return harness;
      }],
      ['noncanonical parent realpath', () => guardedExecutableSupervisorHarness({
        symlinkParent: '/trusted',
      })],
    ];
    for (const [name, createHarness] of cases) {
      await t.test(name, async () => {
        const harness = createHarness();
        const supervision = superviseGateBQuickTunnel(harness.injections);
        await eventually(() => harness.state.ipc.sent.some(message =>
          message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.READY));
        harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
          GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
          1,
        ));
        await assert.rejects(supervision);
        assert.equal(harness.state.spawnCalls.length, 0);
        assert.equal(harness.state.sourceWrites, 0);
        assert.equal(harness.closedHandles.length, harness.handles.length);
        for (const request of harness.aclCalls) {
          assert.equal(
            request.target === '.' || request.target === './cloudflared',
            true,
          );
          assert.equal(request.target.includes(harness.executablePath), false);
        }
      });
    }
  });

test('production path guard catches pre-spawn parent generation drift with zero authority',
  async () => {
    const harness = guardedExecutableSupervisorHarness();
    let mutated = false;
    const baseAcl = harness.injections.inspectExecutableAcl;
    harness.injections.inspectExecutableAcl = async request => {
      const accepted = await baseAcl(request);
      if (!mutated && request.kind === 'file') {
        mutated = true;
        const original = harness.identities.get('/trusted/private');
        harness.identities.set('/trusted/private', {
          ...original,
          ctimeNs: original.ctimeNs + 1n,
        });
      }
      return accepted;
    };
    const supervision = superviseGateBQuickTunnel(harness.injections);
    await eventually(() => harness.state.ipc.sent.some(message =>
      message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.READY));
    harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
      GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
      1,
    ));
    await assert.rejects(supervision);
    assert.equal(mutated, true);
    assert.equal(harness.state.spawnCalls.length, 0);
    assert.equal(harness.state.sourceWrites, 0);
    assert.equal(harness.closedHandles.length, harness.handles.length);
  });

test('production path guard brackets spawn and reaps on parent generation replacement', async () => {
  const harness = guardedExecutableSupervisorHarness({
    beforeSpawn({ identities }) {
      const original = identities.get('/trusted/private');
      identities.set('/trusted/private', { ...original, ctimeNs: original.ctimeNs + 1n });
    },
  });
  const supervision = superviseGateBQuickTunnel(harness.injections);
  await eventually(() => harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.READY));
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
    1,
  ));
  await assert.rejects(supervision);
  assert.equal(harness.state.spawnCalls.length, 1);
  assert.equal(harness.state.sourceWrites, 0);
  assert.deepEqual(harness.state.child.killSignals, ['SIGTERM']);
  assert.equal(harness.closedHandles.length, harness.handles.length);
  const spawnIndex = harness.order.indexOf('spawn:runtime');
  assert.notEqual(spawnIndex, -1);
  assert.equal(harness.order.slice(0, spawnIndex).some(entry =>
    entry === 'acl:file:/trusted/private/runtime'), true);
  assert.equal(harness.order.slice(spawnIndex + 1).some(entry =>
    entry === 'lstat:/trusted/private'), true);
});

test('production path guard proves ACL once, rechecks by stat, and closes every descriptor',
  async () => {
    const harness = guardedExecutableSupervisorHarness();
    const { promise: supervision } = await startSupervisor(harness);
    assert.equal(harness.closedHandles.length, 0);
    assert.equal(harness.aclCalls.length, 5);
    assert.equal(harness.aclCalls.every(request =>
      Number.isSafeInteger(request.timeoutMs) &&
      request.timeoutMs >= 1 && request.timeoutMs <= 200), true);
    harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
      GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK,
      2,
    ));
    await eventually(() => harness.state.ipc.sent.some(message =>
      message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED &&
      message.requestId === 2));
    assert.equal(harness.aclCalls.length, 5);
    await stopSupervisor(harness, 3);
    assert.equal(await supervision, true);
    assert.equal(harness.handles.length, 5);
    assert.equal(harness.closedHandles.length, harness.handles.length);
    const lastClose = Math.max(...harness.order.map((entry, index) =>
      entry.startsWith('close:') ? index : -1));
    assert.ok(lastClose < harness.state.order.indexOf('ipc:STOPPED:3'));
  });

test('production path guard enforces one aggregate ACL deadline before spawn', async () => {
  const harness = guardedExecutableSupervisorHarness();
  let now = -1_000;
  harness.injections.monotonicNow = () => {
    now += 1_000;
    return now;
  };
  const supervision = superviseGateBQuickTunnel(harness.injections);
  await eventually(() => harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.READY));
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
    1,
  ));
  await assert.rejects(supervision);
  assert.equal(harness.aclCalls.length, 3);
  assert.equal(harness.handles.length, 4);
  assert.equal(harness.aclCalls.every(request => request.timeoutMs === 200), true);
  assert.equal(now, 4_000);
  assert.equal(harness.state.spawnCalls.length, 0);
  assert.equal(harness.state.sourceWrites, 0);
  assert.equal(harness.closedHandles.length, harness.handles.length);
});

test('retained production path guard rejects CHECK-time parent drift and cannot reuse source authority',
  async () => {
    const harness = guardedExecutableSupervisorHarness();
    const { promise: supervision } = await startSupervisor(harness);
    const original = harness.identities.get('/trusted/private');
    harness.identities.set('/trusted/private', {
      ...original,
      ctimeNs: original.ctimeNs + 1n,
    });
    harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
      GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK,
      2,
    ));
    await assert.rejects(supervision);
    assert.equal(harness.state.sourceWrites, 1);
    assert.equal(harness.state.ipc.sent.some(message =>
      message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED), false);
    assert.deepEqual(harness.state.child.killSignals, ['SIGTERM']);
    assert.equal(harness.closedHandles.length, harness.handles.length);
  });

test('ACL inspection selects only fixed dot or canonical leaf targets with bounded output',
  async () => {
    const source = await readFile(
      new URL('../src/gate-b-quick-tunnel-supervisor.js', import.meta.url),
      'utf8',
    );
    const acl = /function inspectDarwinAcl[\s\S]*?\n}/.exec(source)?.[0] ?? '';
    assert.match(acl, /target !== '\.' && target !== `\.\/\$\{CLOUDFLARED_ARGV0}`/);
    assert.match(acl, /const args = \['-lide', target\]/);
    assert.doesNotMatch(acl, /\['-lie'\]/);
    assert.match(acl, /maxBuffer: ACL_MAX_BYTES/);
    assert.match(acl, /timeout: timeoutMs/);
    assert.match(acl, /stdout\.fill\(0\)/);
    assert.match(acl, /stderr\.fill\(0\)/);
    assert.match(source, /const ACL_COMPONENT_TIMEOUT_MS = 200/);
    assert.match(source, /const ACL_AGGREGATE_TIMEOUT_MS = 4_000/);
    assert.match(source, /const PATH_COMPONENT_MAX = 16/);
    const retainedAssertion = /async function assertExecutablePathGuard[\s\S]*?\n}/
      .exec(source)?.[0] ?? '';
    assert.doesNotMatch(retainedAssertion, /inspectExecutableAcl/);
  });

test('attestation replacement after spawn fails closed and reaps before cleanup', async () => {
  let calls = 0;
  const harness = supervisorHarness({
    async inspectExecutable(path, pin, versionAttestor) {
      calls += 1;
      assert.equal(await versionAttestor(path), true);
      return {
        ctimeNs: BigInt(calls),
        dev: 2n,
        digest: pin,
        ino: 3n,
        mode: 0o100500n,
        mtimeNs: 4n,
        nlink: 1n,
        size: 5n,
      };
    },
  });
  const supervision = superviseGateBQuickTunnel(harness.injections);
  await eventually(() => harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.READY));
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
    1,
  ));
  await assert.rejects(supervision);
  assert.equal(harness.state.sourceWrites, 0);
  assert.equal(harness.state.child.killSignals.length, 1);
  assert.equal(harness.state.runtimeRemoved, 1);
  assert.ok(harness.state.order.indexOf('child:close') <
    harness.state.order.indexOf('runtime:remove'));
});

test('unsupported artifact selection fails before inspection, spawn, or source authority', async () => {
  let inspections = 0;
  const harness = supervisorHarness({
    async inspectExecutable() {
      inspections += 1;
      assert.fail('unsupported selection must not inspect');
    },
    async readBootstrapFrame() {
      return frameGateBQuickTunnelBootstrap(bootstrap({ sourcePin: '0'.repeat(64) }));
    },
  });
  const supervision = superviseGateBQuickTunnel(harness.injections);
  await eventually(() => harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.READY));
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
    1,
  ));
  await assert.rejects(supervision);
  assert.equal(inspections, 0);
  assert.equal(harness.state.spawnCalls.length, 0);
  assert.equal(harness.state.sourceWrites, 0);
});

test('retained executable drift poisons CHECK before CHECKED or token reuse', async () => {
  let calls = 0;
  const harness = supervisorHarness({
    async inspectExecutable(path, pin, versionAttestor) {
      calls += 1;
      assert.equal(await versionAttestor(path), true);
      return {
        ctimeNs: calls < 3 ? 1n : 2n,
        dev: 2n,
        digest: pin,
        ino: 3n,
        mode: 0o100500n,
        mtimeNs: 4n,
        nlink: 1n,
        size: 5n,
      };
    },
  });
  const { promise: supervision } = await startSupervisor(harness);
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK,
    2,
  ));
  await assert.rejects(supervision);
  assert.equal(calls, 3);
  assert.equal(harness.state.sourceWrites, 1);
  assert.equal(harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED), false);
});

test('hostile inspection lookalikes cannot mint a source or evaluate getters', async () => {
  let reads = 0;
  const lookalike = {
    ctimeNs: 1n,
    dev: 2n,
    digest: SOURCE_PIN,
    ino: 3n,
    mode: 0o100500n,
    mtimeNs: 4n,
    nlink: 1n,
  };
  Object.defineProperty(lookalike, 'size', {
    enumerable: true,
    get() { reads += 1; return 5n; },
  });
  const harness = supervisorHarness({ inspectExecutable: async () => lookalike });
  const supervision = superviseGateBQuickTunnel(harness.injections);
  await eventually(() => harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.READY));
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
    1,
  ));
  await assert.rejects(supervision);
  assert.equal(reads, 0);
  assert.equal(harness.state.spawnCalls.length, 0);
  assert.equal(harness.state.sourceWrites, 0);
});

test('attestation retirement clears retained child, path, pin, generation, and token links',
  async () => {
    const source = await readFile(
      new URL('../src/gate-b-quick-tunnel-supervisor.js', import.meta.url),
      'utf8',
    );
    const retirement = /function retireAttestationLaunch[\s\S]*?return true;\n}/
      .exec(source)?.[0] ?? '';
    for (const field of [
      'attestation.child = undefined',
      'attestation.identity = undefined',
      'attestation.launchToken = undefined',
      'attestation.path = undefined',
      'attestation.sourcePin = undefined',
      'launch.attestationToken = undefined',
      'launch.child = undefined',
    ]) assert.equal(retirement.includes(field), true, field);
    assert.match(retirement, /launch\.stage === 'RETIRED'\) return false/);
    assert.match(retirement, /ATTESTATIONS\.delete\(attestationToken\)/);
    assert.match(retirement, /ATTESTATION_LAUNCHES\.delete\(launchToken\)/);
  });

test('an ambiguous spawn result preserves the private runtime quarantine', async t => {
  await t.test('throw leaves no return handle and quarantines', async () => {
    const harness = supervisorHarness({
      spawnProcess() { throw new Error('synthetic'); },
    });
    const supervision = superviseGateBQuickTunnel(harness.injections);
    await eventually(() => harness.state.ipc.sent.some(message =>
      message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.READY));
    harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
      GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
      1,
    ));
    await assert.rejects(supervision);
    assert.equal(harness.state.runtimeRemoved, 0);
  });

  await t.test('malformed return is retained for direct cleanup and quarantined', async () => {
    const directKills = [];
    const retained = {
      kill(signal) {
        directKills.push(signal);
        return true;
      },
      once() {},
    };
    const harness = supervisorHarness({ spawnProcess: () => retained });
    const supervision = superviseGateBQuickTunnel(harness.injections);
    await eventually(() => harness.state.ipc.sent.some(message =>
      message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.READY));
    harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
      GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
      1,
    ));
    await assert.rejects(supervision);
    assert.equal(harness.state.runtimeRemoved, 0);
    assert.deepEqual(directKills, ['SIGTERM', 'SIGKILL']);
    assert.equal(harness.state.ipc.sent.some(message =>
      message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.ACTIVE ||
      message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.STOPPED), false);
  });
});

test('a bounded fresh-CHECK timeout fails closed and reaps before cleanup', async () => {
  const harness = supervisorHarness({ checkTimeoutMs: 5 });
  const { promise: supervision } = await startSupervisor(harness);
  harness.state.blockHttp = true;
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK,
    2,
  ));
  await assert.rejects(supervision);
  assert.equal(harness.state.ipc.sent.some(message =>
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED ||
    message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.STOPPED), false);
  assert.equal(harness.state.runtimeRemoved, 1);
  assert.ok(harness.state.order.indexOf('child:close') <
    harness.state.order.indexOf('runtime:remove'));
  assert.equal(harness.state.ipc.connected, false);
  assert.equal(harness.state.ipc.disconnectCalls, 1);
  assert.equal(harness.state.ipc.channelUnrefCalls, 1);
  assert.equal(harness.state.ipc.listenerCount('message'), 0);
  assert.equal(harness.state.ipc.listenerCount('disconnect'), 0);
  const effects = harness.state.order.length;
  harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK,
    3,
  ));
  harness.state.ipc.emit('disconnect');
  await tick();
  assert.equal(harness.state.order.length, effects);
});

test('reservation and source-write failures preserve one-shot behavior without runtime retry',
  async t => {
    await t.test('reservation failure', async () => {
      let reserveCalls = 0;
      let effectCalls = 0;
      const harness = supervisorHarness({
        async assertDevNull() { effectCalls += 1; return true; },
        async openWorkspace() {
          return Object.freeze({
            async reserveOutputs() { reserveCalls += 1; throw new Error('synthetic'); },
            async write() { throw new Error('unreachable'); },
            async read() { throw new Error('unreachable'); },
            async syncDirectories() { throw new Error('unreachable'); },
            async close() { return true; },
          });
        },
      });
      await assert.rejects(superviseGateBQuickTunnel(harness.injections));
      assert.equal(reserveCalls, 1);
      assert.equal(effectCalls, 0);
      assert.equal(harness.state.spawnCalls.length, 0);
    });
    await t.test('source write failure', async () => {
      let writes = 0;
      const harness = supervisorHarness();
      const originalOpen = harness.injections.openWorkspace;
      harness.injections.openWorkspace = async root => {
        const workspace = await originalOpen(root);
        return Object.freeze({
          ...workspace,
          async write() { writes += 1; throw new Error('synthetic'); },
        });
      };
      const supervision = superviseGateBQuickTunnel(harness.injections);
      await eventually(() => harness.state.ipc.sent.some(message =>
        message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.READY));
      harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
        GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
        1,
      ));
      await assert.rejects(supervision);
      assert.equal(writes, 1);
      assert.equal(harness.state.ipc.sent.some(message =>
        message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.ACTIVE), false);
    });
  });

test('non-Darwin and malformed injections fail before frame or workspace effects', async () => {
  let reads = 0;
  await assert.rejects(superviseGateBQuickTunnel({
    platform: 'linux',
    readBootstrapFrame: async () => { reads += 1; return Buffer.alloc(0); },
  }));
  assert.equal(reads, 0);
  const accessor = {};
  Object.defineProperty(accessor, 'platform', {
    enumerable: true,
    get: () => 'darwin',
  });
  const symbol = {};
  symbol[Symbol('extra')] = true;
  for (const value of [new Proxy({}, {}), accessor, symbol, { extra: true }, []]) {
    await assert.rejects(superviseGateBQuickTunnel(value));
  }
});

test('unexpected child loss and runtime cleanup uncertainty reject without STOPPED', async t => {
  await t.test('unexpected child loss', async () => {
    const harness = supervisorHarness();
    const { promise: supervision } = await startSupervisor(harness);
    harness.state.child.unexpectedExit();
    await assert.rejects(supervision);
    assert.equal(harness.state.ipc.sent.some(message =>
      message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.STOPPED), false);
  });
  await t.test('runtime cleanup uncertainty', async () => {
    const harness = supervisorHarness({
      async removeRuntimeDirectory() { throw new Error('synthetic'); },
    });
    const { promise: supervision } = await startSupervisor(harness);
    harness.state.ipc.emit('message', createGateBQuickTunnelIpcMessage(
      GATE_B_QUICK_TUNNEL_IPC_TYPES.STOP,
      2,
    ));
    await assert.rejects(supervision);
    assert.equal(harness.state.ipc.sent.some(message =>
      message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.STOPPED), false);
  });
});

test('quick-tunnel modules are import-safe and contain no wallet, RPC, or payment coupling',
  async () => {
    const paths = [
      new URL('../src/gate-b-quick-tunnel-schema.js', import.meta.url),
      new URL('../src/gate-b-quick-tunnel-launcher.js', import.meta.url),
      new URL('../src/gate-b-quick-tunnel-supervisor.js', import.meta.url),
    ];
    const sources = await Promise.all(paths.map(path => readFile(path, 'utf8')));
    const combined = sources.join('\n');
    for (const forbidden of [
      'znn-typescript-sdk', 'live-evidence-runner', 'buyer-wallet',
      'signTransaction', 'sendTransaction', 'SUBMISSION_ARMED',
    ]) assert.equal(combined.includes(forbidden), false);
    assert.equal(combined.includes('void runIfMain()'), true);
  });

test('quick-tunnel source and documentation retain the privacy and nonclaim boundary',
  async () => {
    const codePaths = [
      new URL('../src/gate-b-quick-tunnel-schema.js', import.meta.url),
      new URL('../src/gate-b-quick-tunnel-launcher.js', import.meta.url),
      new URL('../src/gate-b-quick-tunnel-supervisor.js', import.meta.url),
    ];
    const [code, readme, plan] = await Promise.all([
      Promise.all(codePaths.map(path => readFile(path, 'utf8'))).then(parts => parts.join('\n')),
      readFile(new URL('../README.md', import.meta.url), 'utf8'),
      readFile(new URL('../docs/IMPLEMENTATION_PLAN.md', import.meta.url), 'utf8'),
    ]);
    assert.equal(/\b[0-9a-f]{64}\b/.test(code), false);
    assert.equal(code.includes('process.env.'), false);
    for (const text of [readme, plan]) {
      assert.equal(text.includes('cannot verify firewall truth') ||
        text.includes('cannot inspect or prove firewall state'), true);
      assert.equal(text.includes('Issue #45'), true);
      assert.equal(text.includes('no live-evidence claim') ||
        text.includes('creates no tunnel'), true);
    }
  });

test('binding documentation fixes provenance, policy, cutover, rollback, and scope claims',
  async () => {
    const documents = await Promise.all([
      readFile(new URL('../README.md', import.meta.url), 'utf8'),
      readFile(new URL('../SECURITY.md', import.meta.url), 'utf8'),
      readFile(new URL('../docs/IMPLEMENTATION_PLAN.md', import.meta.url), 'utf8'),
    ]);
    for (const document of documents) {
      for (const claim of [
        'official-release-derived byte identity',
        'fixed executable basename `cloudflared`',
        'current-user-owned mode `0500`',
        'root-to-leaf canonical symlink-free parent chain',
        'current-user mode-`0700` anchor',
        '200-millisecond per-call cap and four-second aggregate deadline',
        'later pre-spawn, post-spawn, and `CHECK` guard checks are stat-only',
        'two-second timeout targets only the trusted direct leader',
        'does not prove arbitrary descendant absence',
        'Outer whole-group lifecycle cleanup and the hard lifetime provide the eventual bound',
        'not proof of vendor signing',
        'The runtime verifier proves byte identity, not acquisition history',
        'provides no download, update, or fallback path',
        'cannot verify firewall truth or telemetry disablement',
        'non-detached runtime child of the retained supervisor',
        'Same-process module plumbing remains trusted',
        'moves the token from `POST_SPAWN` to `CONSUMED`',
        'moves it from `CONSUMED` to `SOURCE_WRITTEN`',
        'strict cutover',
        'hostname source v1',
        'exceptional runner v1',
        'authorization v1',
        'no migration or in-place workspace upgrade',
        'fresh one-shot workspace',
        'affected workspace remains quarantined',
        'exactly fourteen paths',
        'GATE_B_CONTROLLER_PREFLIGHT_VALID_RUN_NOT_AUTHORIZED',
        'adds no new RUN entry point, invocation, authority, effect transition, selector, or execution behavior',
        'tightens the existing exceptional RUN/preflight validation',
      ]) assert.equal(document.includes(claim), true, claim);
      assert.doesNotMatch(document, /zenon-x402-public-ws-once-config-v1/);
      assert.doesNotMatch(document, /(?:opens all|opens exactly|the) five protected files/);
      assert.doesNotMatch(document, /(?:or|no) RUN (?:path|change)/);
      assert.doesNotMatch(document, /runtime[- ]download(?:ed)?[^.]{0,80}fail/i);
      assert.doesNotMatch(document, /non-group\/world-writable, no-setid/);
      assert.doesNotMatch(document, /bounded fixed-argument version probe/);
    }
  });
