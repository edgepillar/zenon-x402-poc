import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';

import * as quickTunnelLauncher from '../src/gate-b-quick-tunnel-launcher.js';
import {
  assertGateBQuickTunnelReady,
  launchGateBQuickTunnel,
  launchGateBQuickTunnelInInheritedProcessGroup,
  stopGateBQuickTunnel,
  waitGateBQuickTunnelClosed,
} from '../src/gate-b-quick-tunnel-launcher.js';
import { superviseGateBQuickTunnel } from '../src/gate-b-quick-tunnel-supervisor.js';

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
} from '../src/gate-b-quick-tunnel-schema.js';

const WORKSPACE_ROOT = '/private/tmp/gate-b-quick-tunnel-fixture';
const EXECUTABLE = '/usr/local/bin/cloudflared-fixture';
const SOURCE_PIN = 'a'.repeat(64);
const HOSTNAME = 'schema-fixture.trycloudflare.com';
const CONNECTOR_ID = '11111111-2222-4333-8444-555555555555';
const FIXTURE_DATE = 'Mon, 01 Jan 2024 00:00:00 GMT';

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
    `p${pid}\0\nf9\0tIPv4\0n127.0.0.1:${port}\0PTCP\0TST=LISTEN\0\n`,
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

test('lsof parser rejects wrong identity, socket kind, state, address, or listener count', () => {
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
    Buffer.from(valid.toString('latin1').replace('\0tIPv4', '\0\ntIPv4'), 'latin1'),
    Buffer.from(valid.toString('latin1').replace(
      '\0tIPv4\0n127.0.0.1:43210\0PTCP\0',
      '\0tIPv4\0PTCP\0n127.0.0.1:43210\0',
    ), 'latin1'),
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
  const attestationToken = Object.freeze(Object.create(null));
  const state = {
    order,
    ipc,
    child,
    workspaceRecord,
    runtimeToken,
    attestationToken,
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
    assertDevNull: async () => { order.push('devnull'); return true; },
    async attestExecutable(path, pin, previous, versionAttestor) {
      state.attestCalls.push([path, pin, previous]);
      order.push(previous === undefined ? 'attest:before' : 'attest:after');
      assert.equal(await versionAttestor(path), true);
      return previous === undefined ? attestationToken : previous;
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
        `{"status":200,"readyConnections":1,"connectorId":"${state.connectorId}"}`,
        'utf8',
      );
      return snapshot(body);
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
      '--config', '/dev/null',
      '--origincert', '/dev/null',
      '--credentials-file', '/dev/null',
      '--no-autoupdate',
      '--no-prechecks',
      '--management-diagnostics=false',
      '--url', 'http://127.0.0.1:41000',
      '--metrics', '127.0.0.1:0',
    ]);
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

    await t.test('connector changes after the durable source write', async () => {
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
      assert.equal(harness.state.sourceWrites, 1);
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

test('attestation replacement after spawn fails closed and reaps before cleanup', async () => {
  const harness = supervisorHarness({
    async attestExecutable(path, pin, previous) {
      harness.state.attestCalls.push([path, pin, previous]);
      harness.state.order.push(previous === undefined ? 'attest:before' : 'attest:after');
      return Object.freeze(Object.create(null));
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
