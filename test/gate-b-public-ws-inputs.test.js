import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import * as sdk from 'znn-typescript-sdk';

import { canonicalJson } from '../src/canonical.js';
import {
  executeGateBPublicWsInputs,
  GateBPublicWsInputsChildError,
  runGateBPublicWsInputsChild,
} from '../src/gate-b-public-ws-inputs-child.js';
import { runGateBPublicWsInputsCli } from '../src/gate-b-public-ws-inputs-cli.js';
import {
  GateBPublicWsInputsLaunchError,
  launchGateBPublicWsInputs,
} from '../src/gate-b-public-ws-inputs-launcher.js';
import {
  frameGateBPublicWsInputsBootstrap,
  GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS,
  GATE_B_PUBLIC_WS_INPUT_LEAVES,
  GATE_B_PUBLIC_WS_INPUT_LIMITS,
  GATE_B_PUBLIC_WS_INPUT_OPERATIONS,
  GATE_B_PUBLIC_WS_INPUT_STATUS_LINES,
  GATE_B_QUICK_TUNNEL_HOSTNAME_POLICY,
  parseGateBProtectedEndpointSource,
  parseGateBPublicWsInputsFrame,
  parseGateBQuickTunnelHostnameSource,
  serializeGateBProtectedEndpointSource,
  serializeGateBQuickTunnelHostnameSource,
  serializeGateBPublicWsInputsBootstrap,
} from '../src/gate-b-public-ws-inputs-schema.js';
import { openGateBPublicWsPrivateWorkspace } from
  '../src/gate-b-public-ws-private-workspace.js';
import { superviseGateBPublicWsInputs } from '../src/gate-b-public-ws-inputs-supervisor.js';
import {
  parsePublicWsOnceAuthorization,
  parsePublicWsOnceRoleInput,
  parsePublicWsOnceRunConfig,
  preflightPublicWsOnceRun,
  publicWsOnceConfigDigest,
  PUBLIC_WS_ONCE_POLICY,
} from '../src/live-evidence-runner.js';
import {
  GATE_B_CURRENT_TESTNET_CHAIN_PROFILE,
  GATE_B_CURRENT_TESTNET_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  GATE_B_CURRENT_TESTNET_PROFILE_NAME,
  TESTNET_LIVE_ACKNOWLEDGEMENT,
} from '../src/zenon/operator-trusted-testnet-profile.js';

const ENDPOINT = 'ws://8.8.8.8:35998/';
const HOSTNAME = 'gatebfixture.trycloudflare.com';
const RUN_NAME = 'public-ws-once-20260901-01';
const REVISION = 'a'.repeat(40);
const TEST_ENTROPY = Buffer.from(Array.from({ length: 32 }, (_, index) => index + 1));

function prepareBootstrap(root, changes = {}) {
  return {
    schemaVersion: 1,
    operation: GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PREPARE,
    workspaceRoot: root,
    runName: RUN_NAME,
    acknowledgements: {
      live: GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.live,
      operatorTrust: GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.operatorTrust,
    },
    ...changes,
  };
}

function authorizeBootstrap(root, digest, changes = {}) {
  return {
    schemaVersion: 1,
    operation: GATE_B_PUBLIC_WS_INPUT_OPERATIONS.AUTHORIZE,
    workspaceRoot: root,
    runName: RUN_NAME,
    reviewedConfigDigest: digest,
    acknowledgements: {
      transportException: GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.transportException,
      payment: GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.payment,
      publication: GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.publication,
    },
    ...changes,
  };
}

function provisionBootstrap(root, endpoint = ENDPOINT) {
  return {
    schemaVersion: 1,
    operation: GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PROVISION_ENDPOINT,
    workspaceRoot: root,
    rpcEndpoint: endpoint,
  };
}

async function privateWrite(root, name, text) {
  const path = join(root, name);
  await writeFile(path, text, { mode: 0o600 });
  await chmod(path, 0o600);
  return path;
}

async function fixture(t, options = {}) {
  const temporary = await mkdtemp(join(tmpdir(), 'gate-b-inputs-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = await realpath(temporary);
  await chmod(root, 0o700);
  const wallet = sdk.KeyStore.fromEntropy(TEST_ENTROPY);
  const keyPair0 = wallet.getKeyPair(0);
  const keyPair1 = wallet.getKeyPair(1);
  const mnemonic = wallet.mnemonic;
  const payer = keyPair0.getAddress().toString();
  const payee = keyPair1.getAddress().toString();
  keyPair0.clear();
  keyPair1.clear();
  for (const field of ['mnemonic', 'entropy', 'seed']) wallet[field] = '';
  await privateWrite(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet,
    `${JSON.stringify({ secretVersion: 1, mnemonic, accountIndex: 0 })}\n`);
  await privateWrite(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerAddress,
    `${JSON.stringify({ addressVersion: 1, address: payer, accountIndex: 0 })}\n`);
  if (options.endpoint !== false) {
    await privateWrite(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.endpointSource,
      serializeGateBProtectedEndpointSource(ENDPOINT));
  }
  if (options.hostname !== false) {
    await privateWrite(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
      serializeGateBQuickTunnelHostnameSource(HOSTNAME));
  }
  return { root, payer, payee, mnemonic };
}

function workspaceInjections(root, overrides = {}) {
  return {
    platform: 'darwin',
    actualCwdPath: () => root,
    lstatActualCwd: () => lstat(root, { bigint: true }),
    openActualCwd: flags => open(root, flags),
    realpathActualCwd: () => realpath(root),
    aclInspector: async () => true,
    ...overrides,
  };
}

function operationInjections(root, overrides = {}) {
  return {
    ...workspaceInjections(root),
    sourceRevisionCapture: async () => REVISION,
    sourceTreeAttestor: async revision => revision === REVISION,
    ...overrides,
  };
}

function decorateDirectoryHandle(events, failureLabel) {
  return (handle, label) => ({
    stat: (...args) => handle.stat(...args),
    sync: (...args) => {
      events.push(`directory-sync:${label}`);
      if (label === failureLabel) return Promise.reject(new Error('private directory sync'));
      return handle.sync(...args);
    },
    close: (...args) => handle.close(...args),
  });
}

function decorateFileHandle(events) {
  return (handle, name) => ({
    stat: (...args) => handle.stat(...args),
    chmod: (...args) => handle.chmod(...args),
    read: (...args) => handle.read(...args),
    write: (...args) => {
      events.push(`file-write:${name}`);
      return handle.write(...args);
    },
    sync: (...args) => handle.sync(...args),
    close: (...args) => handle.close(...args),
  });
}

async function prepare(t, options = {}) {
  const context = await fixture(t, options.fixture);
  const attestation = { calls: 0 };
  const injected = operationInjections(context.root, {
    sourceTreeAttestor: async revision => {
      attestation.calls += 1;
      return revision === REVISION;
    },
    ...options.injections,
  });
  const result = await executeGateBPublicWsInputs(prepareBootstrap(context.root), injected);
  assert.deepEqual(result, { status: 'prepared' });
  return { ...context, attestation, injected };
}

async function configDigest(root) {
  const text = await readFile(join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig), 'utf8');
  return publicWsOnceConfigDigest(parsePublicWsOnceRunConfig(text));
}

async function expectRejected(promise) {
  await assert.rejects(promise, error => {
    assert.equal(error instanceof GateBPublicWsInputsChildError, true);
    assert.equal(error.message, 'gate_b_public_ws_inputs_child_failed');
    return true;
  });
}

function fakeSpawn(successLine, capture) {
  return (executable, argv, options) => {
    capture.executable = executable;
    capture.argv = argv;
    capture.options = options;
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdio = [null, child.stdout, child.stderr, new PassThrough()];
    child.kill = signal => {
      capture.killed = signal;
      return true;
    };
    const frameChunks = [];
    child.stdio[3].on('data', chunk => frameChunks.push(Buffer.from(chunk)));
    child.stdio[3].on('finish', () => {
      capture.frame = Buffer.concat(frameChunks);
      setImmediate(() => {
        child.stdout.end(successLine);
        child.stderr.end();
        child.emit('exit', 0, null);
        child.emit('close', 0, null);
      });
    });
    return child;
  };
}

function fakeFork(operation, capture) {
  const terminal = operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PROVISION_ENDPOINT
    ? 'ENDPOINT_PROVISIONED'
    : operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PREPARE
      ? 'INPUTS_PREPARED'
      : 'INPUTS_AUTHORIZED';
  return (modulePath, argv, options) => {
    capture.modulePath = modulePath;
    capture.argv = argv;
    capture.options = options;
    const child = new EventEmitter();
    child.connected = true;
    child.stdio = [null, null, null, null, new PassThrough()];
    child.kill = signal => {
      capture.killed = signal;
      return true;
    };
    child.send = (message, callback) => {
      capture.messages.push(message);
      setImmediate(() => {
        callback?.();
        if (message.type === 'EXECUTE') {
          child.emit('message', { ipcVersion: 1, requestId: 1, type: terminal });
          child.emit('exit', 0, null);
          child.emit('close', 0, null);
        }
      });
      return true;
    };
    const chunks = [];
    child.stdio[4].on('data', chunk => chunks.push(Buffer.from(chunk)));
    child.stdio[4].on('finish', () => {
      capture.frame = Buffer.concat(chunks);
      setImmediate(() => child.emit('message', {
        ipcVersion: 1,
        requestId: 1,
        type: 'READY',
      }));
    });
    return child;
  };
}

function controlledFork(capture) {
  return (_modulePath, _argv, _options) => {
    const child = new EventEmitter();
    const fd4 = new EventEmitter();
    child.connected = true;
    child.stdio = [null, null, null, null, fd4];
    child.send = (message, callback) => {
      capture.messages.push(message);
      capture.sendCallbacks.push(callback);
      return true;
    };
    child.kill = signal => {
      capture.killed = signal;
      setImmediate(() => child.emit('close', 1, signal));
      return true;
    };
    fd4.end = (frame, callback) => {
      capture.frame = Buffer.from(frame);
      capture.frameCallback = callback;
    };
    capture.child = child;
    return child;
  };
}

test('bootstrap framing is canonical, bounded, operation-bound, and deeply immutable', async t => {
  const { root } = await fixture(t);
  for (const bootstrap of [
    provisionBootstrap(root),
    prepareBootstrap(root),
    authorizeBootstrap(root, 'b'.repeat(64)),
  ]) {
    const frame = frameGateBPublicWsInputsBootstrap(bootstrap);
    assert.equal(frame.readUInt32BE(0), frame.length - 4);
    assert.equal(frame.length <= GATE_B_PUBLIC_WS_INPUT_LIMITS.frameBytes, true);
    const parsed = parseGateBPublicWsInputsFrame(frame, bootstrap.operation);
    assert.equal(parsed.operation, bootstrap.operation);
    assert.equal(Object.isFrozen(parsed), true);
    if (parsed.acknowledgements) assert.equal(Object.isFrozen(parsed.acknowledgements), true);
  }
});

test('bootstrap framing rejects extra, missing, duplicate, noncanonical, oversized, and trailing data', async t => {
  const { root } = await fixture(t);
  const valid = provisionBootstrap(root);
  assert.throws(() => serializeGateBPublicWsInputsBootstrap({ ...valid, extra: true }));
  assert.throws(() => serializeGateBPublicWsInputsBootstrap({ ...valid, rpcEndpoint: undefined }));
  const duplicate = Buffer.from(
    `{"operation":"PROVISION_ENDPOINT","operation":"PROVISION_ENDPOINT","rpcEndpoint":"${ENDPOINT}","schemaVersion":1,"workspaceRoot":${JSON.stringify(root)}}`,
  );
  const duplicateFrame = Buffer.alloc(duplicate.length + 4);
  duplicateFrame.writeUInt32BE(duplicate.length, 0);
  duplicate.copy(duplicateFrame, 4);
  assert.throws(() => parseGateBPublicWsInputsFrame(duplicateFrame));
  const validFrame = frameGateBPublicWsInputsBootstrap(valid);
  assert.throws(() => parseGateBPublicWsInputsFrame(Buffer.concat([validFrame, Buffer.from([0])])));
  const tooLarge = Buffer.alloc(GATE_B_PUBLIC_WS_INPUT_LIMITS.frameBytes + 1);
  tooLarge.writeUInt32BE(GATE_B_PUBLIC_WS_INPUT_LIMITS.bootstrapBytes + 1, 0);
  assert.throws(() => parseGateBPublicWsInputsFrame(tooLarge));
  const wrongLength = Buffer.from(validFrame);
  wrongLength.writeUInt32BE(validFrame.length, 0);
  assert.throws(() => parseGateBPublicWsInputsFrame(wrongLength));
  assert.throws(() => parseGateBPublicWsInputsFrame(validFrame, 'PREPARE'));
});

test('bootstrap acknowledgements and reviewed digest are exact', async t => {
  const { root } = await fixture(t);
  assert.throws(() => serializeGateBPublicWsInputsBootstrap(prepareBootstrap(root, {
    acknowledgements: { live: 'wrong', operatorTrust:
      GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.operatorTrust },
  })));
  assert.throws(() => serializeGateBPublicWsInputsBootstrap(authorizeBootstrap(
    root,
    'A'.repeat(64),
  )));
  assert.throws(() => serializeGateBPublicWsInputsBootstrap(authorizeBootstrap(
    root,
    'b'.repeat(64),
    { acknowledgements: {
      transportException: 'wrong',
      payment: GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.payment,
      publication: GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.publication,
    } },
  )));
});

test('pure source helpers own the exact canonical endpoint and hostname contracts', () => {
  const endpointBytes = serializeGateBProtectedEndpointSource(ENDPOINT);
  const endpoint = parseGateBProtectedEndpointSource(endpointBytes);
  assert.deepEqual(endpoint, {
    kind: 'gate-b-protected-endpoint-source',
    rpcEndpoint: ENDPOINT,
    schemaVersion: 1,
  });
  assert.equal(Object.isFrozen(endpoint), true);

  const hostnameBytes = serializeGateBQuickTunnelHostnameSource(HOSTNAME);
  const hostname = parseGateBQuickTunnelHostnameSource(hostnameBytes);
  assert.deepEqual(hostname, {
    hostname: HOSTNAME,
    kind: 'gate-b-quick-tunnel-hostname-source',
    schemaVersion: 1,
  });
  assert.equal(Object.isFrozen(hostname), true);
  assert.equal(Object.isFrozen(GATE_B_QUICK_TUNNEL_HOSTNAME_POLICY), true);
  assert.equal(GATE_B_QUICK_TUNNEL_HOSTNAME_POLICY.suffix, '.trycloudflare.com');

  for (const invalid of [
    'UPPER.trycloudflare.com',
    'a.b.trycloudflare.com',
    'xn--label.trycloudflare.com',
    'label.trycloudflare.com:443',
    'label.trycloudflare.com/path',
  ]) assert.throws(() => serializeGateBQuickTunnelHostnameSource(invalid));
  assert.throws(() => parseGateBQuickTunnelHostnameSource(Buffer.from(
    '{"hostname":"label.trycloudflare.com","hostname":"label.trycloudflare.com","kind":"gate-b-quick-tunnel-hostname-source","schemaVersion":1}\n',
  )));
  assert.throws(() => parseGateBProtectedEndpointSource(Buffer.concat([
    endpointBytes,
    Buffer.from(' '),
  ])));
});

test('shared private-workspace capability is opaque and directly composes with hostname helpers', async t => {
  const { root } = await fixture(t, { hostname: false });
  const events = [];
  const workspace = await openGateBPublicWsPrivateWorkspace(root, workspaceInjections(root, {
    decorateDirectoryHandle: decorateDirectoryHandle(events),
    decorateFileHandle: decorateFileHandle(events),
  }));
  try {
    assert.equal(Object.isFrozen(workspace), true);
    const [record] = await workspace.reserveOutputs([
      GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
    ]);
    assert.equal(Object.isFrozen(record), true);
    assert.deepEqual(Reflect.ownKeys(record), []);
    assert.deepEqual(events.slice(0, 2).sort(), [
      'directory-sync:cwd',
      'directory-sync:path',
    ]);
    const bytes = serializeGateBQuickTunnelHostnameSource(HOSTNAME);
    await workspace.write(record, bytes);
    await workspace.syncDirectories();
    const written = await workspace.read(record);
    assert.equal(parseGateBQuickTunnelHostnameSource(written).hostname, HOSTNAME);
    written.fill(0);
    bytes.fill(0);
  } finally {
    await workspace.close();
  }
});

test('launcher uses one literal operation argv, empty env, ignored stdin, and private FD3 only', async t => {
  const { root } = await fixture(t);
  const capture = {};
  const bootstrap = provisionBootstrap(root);
  const result = await launchGateBPublicWsInputs(bootstrap, {
    spawnProcess: fakeSpawn(GATE_B_PUBLIC_WS_INPUT_STATUS_LINES.PROVISION_ENDPOINT, capture),
    executable: '/fixed/node',
    cliModule: '/fixed/cli.js',
    timeoutMs: 1000,
  });
  assert.deepEqual(result, { status: 'endpoint-provisioned' });
  assert.equal(capture.executable, '/fixed/node');
  assert.deepEqual(capture.argv, ['/fixed/cli.js', 'PROVISION_ENDPOINT']);
  assert.deepEqual(capture.options.env, {});
  assert.deepEqual(capture.options.stdio, ['ignore', 'pipe', 'pipe', 'pipe']);
  assert.equal(capture.options.shell, false);
  assert.equal(JSON.stringify([capture.argv, capture.options.env]).includes(ENDPOINT), false);
  assert.equal(JSON.stringify([capture.argv, capture.options.env]).includes(root), false);
  assert.equal(parseGateBPublicWsInputsFrame(capture.frame).rpcEndpoint, ENDPOINT);
});

test('launcher rejects any nonfixed output without reflecting private bytes', async t => {
  const { root } = await fixture(t);
  const capture = {};
  await assert.rejects(
    launchGateBPublicWsInputs(provisionBootstrap(root), {
      spawnProcess: fakeSpawn(`leak:${ENDPOINT}\n`, capture),
      executable: '/fixed/node',
      cliModule: '/fixed/cli.js',
      timeoutMs: 1000,
    }),
    error => {
      assert.equal(error instanceof GateBPublicWsInputsLaunchError, true);
      assert.equal(error.message.includes(ENDPOINT), false);
      assert.equal(error.stack.includes(ENDPOINT), false);
      return true;
    },
  );
  const overflowCapture = {};
  await assert.rejects(launchGateBPublicWsInputs(provisionBootstrap(root), {
    spawnProcess: fakeSpawn(Buffer.alloc(129, 0x41), overflowCapture),
    executable: '/fixed/node',
    cliModule: '/fixed/cli.js',
    timeoutMs: 1000,
  }), GateBPublicWsInputsLaunchError);
});

test('CLI emits exactly one applicable fixed line and one fixed failure line', async () => {
  for (const [operation, status] of [
    ['PROVISION_ENDPOINT', 'endpoint-provisioned'],
    ['PREPARE', 'prepared'],
    ['AUTHORIZE', 'authorized'],
  ]) {
    const stdout = [];
    const stderr = [];
    assert.equal(await runGateBPublicWsInputsCli({
      argv: [operation],
      stdout: line => stdout.push(line),
      stderr: line => stderr.push(line),
      supervise: async () => ({ status }),
    }), true);
    assert.deepEqual(stdout, [GATE_B_PUBLIC_WS_INPUT_STATUS_LINES[operation]]);
    assert.deepEqual(stderr, []);
  }
  const stdout = [];
  const stderr = [];
  assert.equal(await runGateBPublicWsInputsCli({
    argv: ['PREPARE'],
    stdout: line => stdout.push(line),
    stderr: line => stderr.push(line),
    supervise: async () => { throw new Error(`private:${ENDPOINT}`); },
  }), false);
  assert.deepEqual(stdout, []);
  assert.deepEqual(stderr, [GATE_B_PUBLIC_WS_INPUT_STATUS_LINES.FAILURE]);
  assert.equal(stderr.join('').includes(ENDPOINT), false);
});

test('direct CLI invocation with no private/bootstrap frame on an open immediate-EOF-producing FD3 fails with only the fixed line', async () => {
  const cli = fileURLToPath(new URL('../src/gate-b-public-ws-inputs-cli.js', import.meta.url));
  const fd3 = await open('/dev/null', 'r');
  let result;
  try {
    result = spawnSync(process.execPath, [cli, 'PREPARE'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: {},
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe', fd3.fd],
      timeout: 5000,
    });
  } finally {
    await fd3.close();
  }
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, GATE_B_PUBLIC_WS_INPUT_STATUS_LINES.FAILURE);
});

test('supervisor forwards the exact frame on FD4 and IPC contains enums only', async t => {
  const { root } = await fixture(t);
  const bootstrap = prepareBootstrap(root);
  const frame = frameGateBPublicWsInputsBootstrap(bootstrap);
  const capture = { messages: [] };
  const result = await superviseGateBPublicWsInputs('PREPARE', {
    forkProcess: fakeFork('PREPARE', capture),
    childModule: '/fixed/child.js',
    readBootstrapFrame: async () => Buffer.from(frame),
    timeoutMs: 1000,
  });
  assert.deepEqual(result, { status: 'prepared' });
  assert.deepEqual(capture.argv, []);
  assert.equal(capture.options.cwd, root);
  assert.deepEqual(capture.options.env, {});
  assert.deepEqual(capture.options.execArgv, []);
  assert.deepEqual(capture.options.stdio, ['ignore', 'ignore', 'ignore', 'ipc', 'pipe']);
  assert.deepEqual(capture.messages, [{ ipcVersion: 1, requestId: 1, type: 'EXECUTE' }]);
  assert.equal(capture.frame.equals(frame), true);
  assert.equal(JSON.stringify(capture.messages).includes(root), false);
});

test('supervisor gates EXECUTE on both READY and completed FD4 frame EOF', async t => {
  await t.test('READY before write callback', async nested => {
    const { root } = await fixture(nested);
    const capture = { messages: [], sendCallbacks: [] };
    const pending = superviseGateBPublicWsInputs('PREPARE', {
      forkProcess: controlledFork(capture),
      childModule: '/fixed/child.js',
      readBootstrapFrame: async () => frameGateBPublicWsInputsBootstrap(prepareBootstrap(root)),
      timeoutMs: 1000,
    });
    await new Promise(resolve => setImmediate(resolve));
    capture.child.emit('message', { ipcVersion: 1, requestId: 1, type: 'READY' });
    assert.deepEqual(capture.messages, []);
    capture.frameCallback();
    assert.deepEqual(capture.messages, [{ ipcVersion: 1, requestId: 1, type: 'EXECUTE' }]);
    capture.sendCallbacks[0]?.();
    capture.child.emit('message', {
      ipcVersion: 1,
      requestId: 1,
      type: 'INPUTS_PREPARED',
    });
    capture.child.emit('exit', 0, null);
    capture.child.emit('close', 0, null);
    assert.deepEqual(await pending, { status: 'prepared' });
  });

  await t.test('write error after READY', async nested => {
    const { root } = await fixture(nested);
    const capture = { messages: [], sendCallbacks: [] };
    const pending = superviseGateBPublicWsInputs('PREPARE', {
      forkProcess: controlledFork(capture),
      childModule: '/fixed/child.js',
      readBootstrapFrame: async () => frameGateBPublicWsInputsBootstrap(prepareBootstrap(root)),
      timeoutMs: 1000,
    });
    await new Promise(resolve => setImmediate(resolve));
    capture.child.emit('message', { ipcVersion: 1, requestId: 1, type: 'READY' });
    capture.frameCallback(new Error('private write failure'));
    await assert.rejects(pending);
    assert.deepEqual(capture.messages, []);
  });

  await t.test('duplicate READY before completed frame', async nested => {
    const { root } = await fixture(nested);
    const capture = { messages: [], sendCallbacks: [] };
    const pending = superviseGateBPublicWsInputs('PREPARE', {
      forkProcess: controlledFork(capture),
      childModule: '/fixed/child.js',
      readBootstrapFrame: async () => frameGateBPublicWsInputsBootstrap(prepareBootstrap(root)),
      timeoutMs: 1000,
    });
    await new Promise(resolve => setImmediate(resolve));
    capture.child.emit('message', { ipcVersion: 1, requestId: 1, type: 'READY' });
    capture.child.emit('message', { ipcVersion: 1, requestId: 1, type: 'READY' });
    await assert.rejects(pending);
    assert.deepEqual(capture.messages, []);
  });

  await t.test('terminal before EXECUTE', async nested => {
    const { root } = await fixture(nested);
    const capture = { messages: [], sendCallbacks: [] };
    const pending = superviseGateBPublicWsInputs('PREPARE', {
      forkProcess: controlledFork(capture),
      childModule: '/fixed/child.js',
      readBootstrapFrame: async () => frameGateBPublicWsInputsBootstrap(prepareBootstrap(root)),
      timeoutMs: 1000,
    });
    await new Promise(resolve => setImmediate(resolve));
    capture.child.emit('message', {
      ipcVersion: 1,
      requestId: 1,
      type: 'INPUTS_PREPARED',
    });
    await assert.rejects(pending);
    assert.deepEqual(capture.messages, []);
  });
});

test('supervisor rejects malformed or operation-mismatched FD3 frames before forking', async t => {
  const { root } = await fixture(t);
  let forks = 0;
  const frame = frameGateBPublicWsInputsBootstrap(provisionBootstrap(root));
  for (const invalid of [Buffer.concat([frame, Buffer.from([0])]), frame]) {
    await assert.rejects(superviseGateBPublicWsInputs('PREPARE', {
      forkProcess: () => { forks += 1; },
      childModule: '/fixed/child.js',
      readBootstrapFrame: async () => Buffer.from(invalid),
      timeoutMs: 1000,
    }));
  }
  assert.equal(forks, 0);
});

test('child control channel accepts one request-correlated enum only', async t => {
  const { root } = await fixture(t);
  const channel = new EventEmitter();
  channel.connected = true;
  const sent = [];
  channel.send = (message, callback) => {
    sent.push(message);
    callback?.();
    return true;
  };
  const exits = [];
  await runGateBPublicWsInputsChild({
    channel,
    readBootstrap: async () => parseGateBPublicWsInputsFrame(
      frameGateBPublicWsInputsBootstrap(provisionBootstrap(root)),
    ),
    execute: async () => ({ status: 'endpoint-provisioned' }),
    forceExit: code => exits.push(code),
  });
  assert.deepEqual(sent, [{ ipcVersion: 1, requestId: 1, type: 'READY' }]);
  channel.emit('message', { ipcVersion: 1, requestId: 1, type: 'EXECUTE' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sent[1], { ipcVersion: 1, requestId: 1, type: 'ENDPOINT_PROVISIONED' });
  assert.deepEqual(exits, [0]);
});

test('real launcher, CLI, supervisor, and child provision offline through FD3 and FD4', {
  skip: process.platform !== 'darwin' ? 'production private workspace is macOS-only' : false,
}, async t => {
  const { root } = await fixture(t, { endpoint: false });
  const result = await launchGateBPublicWsInputs(provisionBootstrap(root));
  assert.deepEqual(result, { status: 'endpoint-provisioned' });
  const text = await readFile(join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.endpointSource), 'utf8');
  assert.equal(text, serializeGateBProtectedEndpointSource(ENDPOINT).toString('utf8'));
  assert.deepEqual(parsePublicWsOnceRoleInput(
    `${canonicalJson({ secretVersion: 2, rpcEndpoint: JSON.parse(text).rpcEndpoint })}\n`,
    'buyer-rpc',
  ), { secretVersion: 2, rpcEndpoint: ENDPOINT });
});

test('non-Darwin production gate fails before workspace effects with fixed external output', async t => {
  const { root } = await fixture(t, { endpoint: false });
  const stdout = [];
  const stderr = [];
  let workspaceOpenCalls = 0;
  const result = await runGateBPublicWsInputsCli({
    argv: ['PROVISION_ENDPOINT'],
    stdout: line => stdout.push(line),
    stderr: line => stderr.push(line),
    supervise: async () => executeGateBPublicWsInputs(
      provisionBootstrap(root),
      operationInjections(root, {
        platform: 'linux',
        openPath: async (...args) => {
          workspaceOpenCalls += 1;
          return open(...args);
        },
      }),
    ),
  });
  assert.equal(result, false);
  assert.deepEqual(stdout, []);
  assert.deepEqual(stderr, [GATE_B_PUBLIC_WS_INPUT_STATUS_LINES.FAILURE]);
  assert.equal(workspaceOpenCalls, 0);
  await assert.rejects(lstat(join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.endpointSource)));
});

test('PROVISION_ENDPOINT syncs both retained directories before first output byte', async t => {
  const { root } = await fixture(t, { endpoint: false });
  const events = [];
  assert.deepEqual(await executeGateBPublicWsInputs(
    provisionBootstrap(root),
    operationInjections(root, {
      decorateDirectoryHandle: decorateDirectoryHandle(events),
      decorateFileHandle: decorateFileHandle(events),
    }),
  ), { status: 'endpoint-provisioned' });
  const writeIndex = events.indexOf(
    `file-write:${GATE_B_PUBLIC_WS_INPUT_LEAVES.endpointSource}`,
  );
  assert.equal(events.indexOf('directory-sync:path') < writeIndex, true);
  assert.equal(events.indexOf('directory-sync:cwd') < writeIndex, true);
});

test('initial reservation directory-sync failures preserve restrictive residue without population', async t => {
  await t.test('PROVISION_ENDPOINT', async nested => {
    const { root } = await fixture(nested, { endpoint: false });
    const events = [];
    await expectRejected(executeGateBPublicWsInputs(
      provisionBootstrap(root),
      operationInjections(root, {
        decorateDirectoryHandle: decorateDirectoryHandle(events, 'path'),
        decorateFileHandle: decorateFileHandle(events),
      }),
    ));
    assert.equal(events.includes('directory-sync:path'), true);
    assert.equal(events.includes('directory-sync:cwd'), true);
    assert.equal(events.some(event => event.startsWith('file-write:')), false);
    const residue = await lstat(join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.endpointSource), {
      bigint: true,
    });
    assert.equal(residue.size, 0n);
    assert.equal(Number(residue.mode & 0o777n), 0o600);
  });

  await t.test('PREPARE', async nested => {
    const { root } = await fixture(nested);
    const events = [];
    const protectedInputs = new Set([
      GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerAddress,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.endpointSource,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
    ].map(name => join(root, name)));
    let protectedInputOpens = 0;
    let afterReservations = false;
    await expectRejected(executeGateBPublicWsInputs(
      prepareBootstrap(root),
      operationInjections(root, {
        decorateDirectoryHandle: decorateDirectoryHandle(events, 'path'),
        decorateFileHandle: decorateFileHandle(events),
        openPath: async (...args) => {
          if (protectedInputs.has(args[0])) protectedInputOpens += 1;
          return open(...args);
        },
        afterReservations: async () => { afterReservations = true; },
      }),
    ));
    assert.equal(events.includes('directory-sync:path'), true);
    assert.equal(events.includes('directory-sync:cwd'), true);
    assert.equal(protectedInputOpens, 0);
    assert.equal(afterReservations, false);
    assert.equal(events.some(event => event.startsWith('file-write:')), false);
    for (const name of [
      GATE_B_PUBLIC_WS_INPUT_LEAVES.payeeAddress,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc,
    ]) {
      const residue = await lstat(join(root, name), { bigint: true });
      assert.equal(residue.size, 0n);
      assert.equal(Number(residue.mode & 0o777n), 0o600);
    }
  });

  await t.test('post-open verification before opaque-record return', async nested => {
    const { root } = await fixture(nested);
    const events = [];
    const protectedInputs = new Set([
      GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerAddress,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.endpointSource,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
    ].map(name => join(root, name)));
    let protectedInputOpens = 0;
    let afterReservations = false;
    await expectRejected(executeGateBPublicWsInputs(
      prepareBootstrap(root),
      operationInjections(root, {
        aclInspector: async target =>
          target !== `./${GATE_B_PUBLIC_WS_INPUT_LEAVES.payeeAddress}`,
        decorateDirectoryHandle: decorateDirectoryHandle(events),
        decorateFileHandle: decorateFileHandle(events),
        openPath: async (...args) => {
          if (protectedInputs.has(args[0])) protectedInputOpens += 1;
          return open(...args);
        },
        afterReservations: async () => { afterReservations = true; },
      }),
    ));
    assert.equal(events.includes('directory-sync:path'), true);
    assert.equal(events.includes('directory-sync:cwd'), true);
    assert.equal(protectedInputOpens, 0);
    assert.equal(afterReservations, false);
    assert.equal(events.some(event => event.startsWith('file-write:')), false);
    const residue = await lstat(
      join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.payeeAddress),
      { bigint: true },
    );
    assert.equal(residue.size, 0n);
    assert.equal(residue.nlink, 1n);
    assert.equal(Number(residue.mode & 0o777n), 0o600);
  });
});

test('PROVISION_ENDPOINT validates public-WS v2 semantics and never overwrites', async t => {
  for (const endpoint of [
    'wss://8.8.8.8:35998/',
    'ws://127.0.0.1:35998/',
    'ws://8.8.8.8/',
    'ws://user@8.8.8.8:35998/',
    'ws://8.8.8.8:35998/path',
  ]) {
    await t.test(endpoint.split(':')[0], async nested => {
      const { root } = await fixture(nested, { endpoint: false });
      await expectRejected(executeGateBPublicWsInputs(
        provisionBootstrap(root, endpoint),
        operationInjections(root),
      ));
      await assert.rejects(lstat(join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.endpointSource)));
    });
  }
  const { root } = await fixture(t);
  const before = await readFile(join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.endpointSource));
  await expectRejected(executeGateBPublicWsInputs(
    provisionBootstrap(root),
    operationInjections(root),
  ));
  const after = await readFile(join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.endpointSource));
  assert.equal(after.equals(before), true);
});

test('PREPARE reserves four distinct outputs before reading wallet and never reserves authorization', async t => {
  const context = await fixture(t);
  const events = [];
  let reservationsObserved = false;
  let walletOpenedAfterReservations = false;
  const injected = operationInjections(context.root, {
    decorateDirectoryHandle: decorateDirectoryHandle(events),
    decorateFileHandle: decorateFileHandle(events),
    afterReservations: async () => {
      const stats = await Promise.all([
        'payee-address.json', 'run.json', 'buyer-rpc.json', 'facilitator-rpc.json',
      ].map(name => lstat(join(context.root, name), { bigint: true })));
      reservationsObserved = stats.every(stat => stat.size === 0n && stat.nlink === 1n &&
        Number(stat.mode & 0o777n) === 0o600);
      assert.deepEqual(events.slice(0, 2).sort(), [
        'directory-sync:cwd',
        'directory-sync:path',
      ]);
    },
    openPath: async (...args) => {
      if (args[0] === join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet)) {
        events.push('wallet-open');
        walletOpenedAfterReservations = reservationsObserved;
      }
      return open(...args);
    },
  });
  await executeGateBPublicWsInputs(prepareBootstrap(context.root), injected);
  assert.equal(reservationsObserved, true);
  assert.equal(walletOpenedAfterReservations, true);
  const initialSyncBoundary = Math.max(
    events.indexOf('directory-sync:path'),
    events.indexOf('directory-sync:cwd'),
  );
  assert.equal(events.indexOf('wallet-open') > initialSyncBoundary, true);
  assert.equal(events.findIndex(event => event.startsWith('file-write:')) > initialSyncBoundary, true);
  await assert.rejects(lstat(join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.authorization)));
  const stats = await Promise.all([
    'payee-address.json', 'run.json', 'buyer-rpc.json', 'facilitator-rpc.json',
  ].map(name => lstat(join(context.root, name), { bigint: true })));
  assert.equal(new Set(stats.map(stat => `${stat.dev}:${stat.ino}`)).size, 4);
});

test('PREPARE derives canonical account1 and freezes the exact Gate-B inputs', async t => {
  const context = await prepare(t);
  assert.equal(context.attestation.calls, 2);
  const payee = JSON.parse(await readFile(
    join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.payeeAddress), 'utf8',
  ));
  assert.deepEqual(payee, { address: context.payee, addressVersion: 1, accountIndex: 1 });
  assert.equal(payee.address === context.payer, false);
  assert.equal(sdk.Address.parse(payee.address).toString(), payee.address);
  const configuration = parsePublicWsOnceRunConfig(await readFile(
    join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig), 'utf8',
  ));
  const accepted = configuration.expectedPaymentRequired.accepts[0];
  assert.equal(configuration.sourceRevision, REVISION);
  assert.equal(configuration.profileName, GATE_B_CURRENT_TESTNET_PROFILE_NAME);
  assert.deepEqual(configuration.acknowledgements, {
    live: TESTNET_LIVE_ACKNOWLEDGEMENT,
    operatorTrust: GATE_B_CURRENT_TESTNET_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  });
  assert.equal(configuration.expectedPaymentRequired.resource.url, `https://${HOSTNAME}/paid`);
  assert.equal(accepted.network, 'zenon:testnet');
  assert.equal(accepted.asset, sdk.ZNN_ZTS.toString());
  assert.equal(accepted.amount, '1');
  assert.equal(accepted.payTo, context.payee);
  assert.equal(accepted.maxTimeoutSeconds, 60);
  assert.deepEqual(accepted.extra.zenonChain, GATE_B_CURRENT_TESTNET_CHAIN_PROFILE);
  assert.deepEqual(configuration.runtime, {
    listenPort: 41000,
    rpcTimeoutMs: 30000,
    maxRecoveryAttempts: 0,
    recoveryDelayMs: 0,
    maxRecoveryElapsedMs: 1,
  });
  const [buyerRpcText, facilitatorRpcText] = await Promise.all([
    readFile(join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc), 'utf8'),
    readFile(join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc), 'utf8'),
  ]);
  assert.equal(buyerRpcText, facilitatorRpcText);
  assert.deepEqual(parsePublicWsOnceRoleInput(buyerRpcText, 'buyer-rpc'), {
    rpcEndpoint: ENDPOINT,
    secretVersion: 2,
  });
});

test('PREPARE proves the stored account0 before emitting account1', async t => {
  const context = await fixture(t);
  const wrongPayer = sdk.Address.fromPublicKey(Buffer.alloc(32, 12)).toString();
  await privateWrite(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerAddress,
    `${JSON.stringify({ addressVersion: 1, address: wrongPayer, accountIndex: 0 })}\n`);
  await expectRejected(executeGateBPublicWsInputs(
    prepareBootstrap(context.root), operationInjections(context.root),
  ));
  assert.equal((await lstat(join(
    context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.payeeAddress,
  ))).size, 0);
});

test('PREPARE rejects hostname schema deviations and forbidden hostnames after quarantine', async t => {
  const invalidSources = [
    { hostname: 'UPPER.trycloudflare.com', kind: 'gate-b-quick-tunnel-hostname-source', schemaVersion: 1 },
    { hostname: 'a.b.trycloudflare.com', kind: 'gate-b-quick-tunnel-hostname-source', schemaVersion: 1 },
    { hostname: 'xn--label.trycloudflare.com', kind: 'gate-b-quick-tunnel-hostname-source', schemaVersion: 1 },
    { hostname: 'label.trycloudflare.com', kind: 'wrong', schemaVersion: 1 },
  ];
  for (const source of invalidSources) {
    await t.test(source.hostname, async nested => {
      const { root } = await fixture(nested);
      await writeFile(join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource),
        `${canonicalJson(source)}\n`, { mode: 0o600 });
      await expectRejected(executeGateBPublicWsInputs(
        prepareBootstrap(root), operationInjections(root),
      ));
      const residue = await lstat(join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.payeeAddress));
      assert.equal(residue.size, 0);
      await expectRejected(executeGateBPublicWsInputs(
        prepareBootstrap(root), operationInjections(root),
      ));
    });
  }
});

test('PREPARE collision quarantines before wallet read and cannot be retried', async t => {
  const { root } = await fixture(t);
  let walletOpened = false;
  let collisionCreated = false;
  const injected = operationInjections(root, {
    openPath: async (...args) => {
      if (args[0] === join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet)) walletOpened = true;
      const handle = await open(...args);
      if (!collisionCreated &&
          args[0] === join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.payeeAddress)) {
        collisionCreated = true;
        await privateWrite(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig, '{}\n');
      }
      return handle;
    },
  });
  await expectRejected(executeGateBPublicWsInputs(prepareBootstrap(root), injected));
  assert.equal(walletOpened, false);
  assert.equal((await lstat(join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.payeeAddress))).size, 0);
  await expectRejected(executeGateBPublicWsInputs(prepareBootstrap(root), injected));
});

test('PREPARE rejects hardlinks, symlinks, wrong modes, ACLs, and cwd identity changes', async t => {
  await t.test('hardlink', async nested => {
    const { root } = await fixture(nested);
    const address = join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerAddress);
    await unlink(address);
    await link(join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet), address);
    await expectRejected(executeGateBPublicWsInputs(
      prepareBootstrap(root), operationInjections(root),
    ));
  });
  await t.test('symlink', async nested => {
    const { root } = await fixture(nested);
    const hostname = join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource);
    await unlink(hostname);
    await symlink(GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerAddress, hostname);
    await expectRejected(executeGateBPublicWsInputs(
      prepareBootstrap(root), operationInjections(root),
    ));
  });
  await t.test('mode', async nested => {
    const { root } = await fixture(nested);
    await chmod(join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet), 0o644);
    await expectRejected(executeGateBPublicWsInputs(
      prepareBootstrap(root), operationInjections(root),
    ));
  });
  await t.test('acl', async nested => {
    const { root } = await fixture(nested);
    await expectRejected(executeGateBPublicWsInputs(prepareBootstrap(root),
      operationInjections(root, { aclInspector: async target => target !== '.' })));
  });
  await t.test('cwd', async nested => {
    const first = await fixture(nested);
    const second = await fixture(nested);
    await expectRejected(executeGateBPublicWsInputs(prepareBootstrap(first.root),
      operationInjections(first.root, {
        lstatActualCwd: () => lstat(second.root, { bigint: true }),
      })));
  });
});

test('retained cwd and workspace descriptors reject pathname replacement after reservation', async t => {
  const { root } = await fixture(t);
  const moved = `${root}-moved`;
  t.after(() => rm(moved, { recursive: true, force: true }));
  await expectRejected(executeGateBPublicWsInputs(prepareBootstrap(root),
    operationInjections(root, {
      afterReservations: async () => {
        await rename(root, moved);
        await mkdir(root, { mode: 0o700 });
      },
    })));
  assert.equal((await lstat(join(
    moved, GATE_B_PUBLIC_WS_INPUT_LEAVES.payeeAddress,
  ))).isFile(), true);
  await assert.rejects(lstat(join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig)));
});

test('short writes are completed and fsync failure leaves all PREPARE outputs quarantined', async t => {
  await t.test('short writes', async nested => {
    const { root } = await fixture(nested);
    const injected = operationInjections(root, {
      decorateFileHandle: (handle, name) => ({
        stat: (...args) => handle.stat(...args),
        chmod: (...args) => handle.chmod(...args),
        read: (...args) => handle.read(...args),
        write: (buffer, offset, _length, position) =>
          handle.write(buffer, offset, 1, position),
        sync: (...args) => handle.sync(...args),
        close: (...args) => handle.close(...args),
        name,
      }),
    });
    assert.deepEqual(await executeGateBPublicWsInputs(prepareBootstrap(root), injected), {
      status: 'prepared',
    });
  });
  await t.test('fsync failure', async nested => {
    const { root } = await fixture(nested);
    const injected = operationInjections(root, {
      decorateFileHandle: (handle, name) => ({
        stat: (...args) => handle.stat(...args),
        chmod: (...args) => handle.chmod(...args),
        read: (...args) => handle.read(...args),
        write: (...args) => handle.write(...args),
        sync: (...args) => name === GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc
          ? Promise.reject(new Error('private fsync detail'))
          : handle.sync(...args),
        close: (...args) => handle.close(...args),
      }),
    });
    await expectRejected(executeGateBPublicWsInputs(prepareBootstrap(root), injected));
    for (const name of [
      'payee-address.json', 'run.json', 'buyer-rpc.json', 'facilitator-rpc.json',
    ]) assert.equal((await lstat(join(root, name))).isFile(), true);
    await expectRejected(executeGateBPublicWsInputs(
      prepareBootstrap(root), operationInjections(root),
    ));
  });
});

test('concurrent PREPARE calls allow at most one completion and leave a consumed workspace', async t => {
  const { root } = await fixture(t);
  const results = await Promise.allSettled([
    executeGateBPublicWsInputs(prepareBootstrap(root), operationInjections(root)),
    executeGateBPublicWsInputs(prepareBootstrap(root), operationInjections(root)),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  await expectRejected(executeGateBPublicWsInputs(
    prepareBootstrap(root), operationInjections(root),
  ));
});

test('PREPARE source drift at either attestation fails closed with no authorization', async t => {
  await t.test('first', async nested => {
    const { root } = await fixture(nested);
    await expectRejected(executeGateBPublicWsInputs(prepareBootstrap(root),
      operationInjections(root, { sourceTreeAttestor: async () => false })));
    await assert.rejects(lstat(join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.payeeAddress)));
  });
  await t.test('second', async nested => {
    const { root } = await fixture(nested);
    let calls = 0;
    await expectRejected(executeGateBPublicWsInputs(prepareBootstrap(root),
      operationInjections(root, {
        sourceTreeAttestor: async () => {
          calls += 1;
          return calls === 1;
        },
      })));
    assert.equal(calls, 2);
    assert.equal((await lstat(join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig))).isFile(), true);
    await assert.rejects(lstat(join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.authorization)));
  });
});

test('PREPARE captures revision with fixed bounded non-helper Git plumbing', async t => {
  const { root } = await fixture(t);
  const calls = [];
  const result = await executeGateBPublicWsInputs(prepareBootstrap(root),
    operationInjections(root, {
      sourceRevisionCapture: undefined,
      gitRunner(executable, argv, options) {
        calls.push({ executable, argv, options });
        return { status: 0, signal: null, stdout: Buffer.from(`${REVISION}\n`) };
      },
    }));
  assert.deepEqual(result, { status: 'prepared' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].executable, '/usr/bin/git');
  assert.equal(calls[0].argv.includes('rev-parse'), true);
  assert.equal(calls[0].argv.includes('HEAD^{commit}'), true);
  assert.equal(calls[0].options.shell, false);
  assert.deepEqual(calls[0].options.stdio, ['ignore', 'pipe', 'ignore']);
  assert.equal(calls[0].options.env.GIT_CONFIG_NOSYSTEM, '1');
  assert.equal(calls[0].options.env.GIT_NO_LAZY_FETCH, '1');
  assert.equal(calls[0].options.env.GIT_NO_REPLACE_OBJECTS, '1');
});

test('AUTHORIZE binds reviewed config, endpoint, payee, intent, revision, run, and acknowledgements', async t => {
  const context = await prepare(t);
  const digest = await configDigest(context.root);
  const result = await executeGateBPublicWsInputs(
    authorizeBootstrap(context.root, digest),
    operationInjections(context.root),
  );
  assert.deepEqual(result, { status: 'authorized' });
  const authorization = parsePublicWsOnceAuthorization(await readFile(
    join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.authorization), 'utf8',
  ));
  assert.equal(authorization.configDigest, digest);
  assert.equal(authorization.runName, RUN_NAME);
  assert.equal(authorization.sourceRevision, REVISION);
  assert.equal(authorization.rpcEndpoint, ENDPOINT);
  assert.equal(authorization.transportException, PUBLIC_WS_ONCE_POLICY.transportException);
  assert.deepEqual(authorization.acknowledgements, {
    payment: PUBLIC_WS_ONCE_POLICY.paymentAcknowledgement,
    publication: PUBLIC_WS_ONCE_POLICY.publicationAcknowledgement,
  });
});

test('AUTHORIZE syncs its reservation before population and sync failure leaves zero residue', async t => {
  await t.test('ordering', async nested => {
    const context = await prepare(nested);
    const digest = await configDigest(context.root);
    const events = [];
    assert.deepEqual(await executeGateBPublicWsInputs(
      authorizeBootstrap(context.root, digest),
      operationInjections(context.root, {
        decorateDirectoryHandle: decorateDirectoryHandle(events),
        decorateFileHandle: decorateFileHandle(events),
      }),
    ), { status: 'authorized' });
    const writeIndex = events.indexOf(
      `file-write:${GATE_B_PUBLIC_WS_INPUT_LEAVES.authorization}`,
    );
    assert.equal(events.indexOf('directory-sync:path') < writeIndex, true);
    assert.equal(events.indexOf('directory-sync:cwd') < writeIndex, true);
  });

  await t.test('initial directory sync failure', async nested => {
    const context = await prepare(nested);
    const digest = await configDigest(context.root);
    const events = [];
    await expectRejected(executeGateBPublicWsInputs(
      authorizeBootstrap(context.root, digest),
      operationInjections(context.root, {
        decorateDirectoryHandle: decorateDirectoryHandle(events, 'path'),
        decorateFileHandle: decorateFileHandle(events),
      }),
    ));
    assert.equal(events.includes('directory-sync:path'), true);
    assert.equal(events.includes('directory-sync:cwd'), true);
    assert.equal(events.includes(
      `file-write:${GATE_B_PUBLIC_WS_INPUT_LEAVES.authorization}`,
    ), false);
    const residue = await lstat(
      join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.authorization),
      { bigint: true },
    );
    assert.equal(residue.size, 0n);
    assert.equal(Number(residue.mode & 0o777n), 0o600);
  });
});

test('AUTHORIZE rejects wrong digest, stale revision, changed sources, and changed prepared data', async t => {
  await t.test('wrong digest', async nested => {
    const context = await prepare(nested);
    await expectRejected(executeGateBPublicWsInputs(
      authorizeBootstrap(context.root, 'f'.repeat(64)), operationInjections(context.root),
    ));
    await assert.rejects(lstat(join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.authorization)));
  });
  await t.test('stale revision', async nested => {
    const context = await prepare(nested);
    await expectRejected(executeGateBPublicWsInputs(
      authorizeBootstrap(context.root, await configDigest(context.root)),
      operationInjections(context.root, {
        sourceRevisionCapture: async () => 'b'.repeat(40),
      }),
    ));
  });
  for (const [label, name, mutate] of [
    ['wallet', GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet, () => undefined],
    ['buyer address', GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerAddress, value => {
      value.address = sdk.Address.fromPublicKey(Buffer.alloc(32, 8)).toString();
    }],
    ['endpoint', GATE_B_PUBLIC_WS_INPUT_LEAVES.endpointSource, value => {
      value.rpcEndpoint = 'ws://8.8.4.4:35998/';
    }],
    ['hostname', GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource, value => {
      value.hostname = 'changed.trycloudflare.com';
    }],
    ['payee', GATE_B_PUBLIC_WS_INPUT_LEAVES.payeeAddress, value => {
      value.address = sdk.Address.fromPublicKey(Buffer.alloc(32, 9)).toString();
    }],
    ['config', GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig, value => {
      value.runtime.rpcTimeoutMs = 29999;
    }],
    ['rpc', GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc, value => {
      value.rpcEndpoint = 'ws://8.8.4.4:35998/';
    }],
  ]) {
    await t.test(label, async nested => {
      const context = await prepare(nested);
      let digest = await configDigest(context.root);
      const path = join(context.root, name);
      if (label === 'wallet') {
        const replacement = sdk.KeyStore.fromEntropy(Buffer.alloc(32, 19));
        await writeFile(path, `${JSON.stringify({
          secretVersion: 1,
          mnemonic: replacement.mnemonic,
          accountIndex: 0,
        })}\n`, { mode: 0o600 });
        for (const field of ['mnemonic', 'entropy', 'seed']) replacement[field] = '';
      } else {
        const value = JSON.parse(await readFile(path, 'utf8'));
        mutate(value);
        await writeFile(path, `${canonicalJson(value)}\n`, { mode: 0o600 });
      }
      if (label === 'config') digest = await configDigest(context.root);
      await expectRejected(executeGateBPublicWsInputs(
        authorizeBootstrap(context.root, digest), operationInjections(context.root),
      ));
      await assert.rejects(lstat(join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.authorization)));
    });
  }
});

test('AUTHORIZE source drift before reservation fails without residue', async t => {
  const context = await prepare(t);
  let attested = false;
  await expectRejected(executeGateBPublicWsInputs(
    authorizeBootstrap(context.root, await configDigest(context.root)),
    operationInjections(context.root, {
      beforeAuthorizationReservation: async () => { attested = true; },
      sourceTreeAttestor: async () => false,
    }),
  ));
  assert.equal(attested, true);
  await assert.rejects(lstat(join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.authorization)));
});

test('AUTHORIZE write failure leaves permanent authorization residue', async t => {
  const context = await prepare(t);
  const digest = await configDigest(context.root);
  const injected = operationInjections(context.root, {
    decorateFileHandle: (handle, name) => ({
      stat: (...args) => handle.stat(...args),
      chmod: (...args) => handle.chmod(...args),
      read: (...args) => handle.read(...args),
      write: (...args) => handle.write(...args),
      sync: (...args) => name === GATE_B_PUBLIC_WS_INPUT_LEAVES.authorization
        ? Promise.reject(new Error('private fsync detail'))
        : handle.sync(...args),
      close: (...args) => handle.close(...args),
    }),
  });
  await expectRejected(executeGateBPublicWsInputs(
    authorizeBootstrap(context.root, digest), injected,
  ));
  assert.equal((await lstat(join(
    context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.authorization,
  ))).isFile(), true);
  await expectRejected(executeGateBPublicWsInputs(
    authorizeBootstrap(context.root, digest), operationInjections(context.root),
  ));
});

test('generated five-file set reaches existing preflight without reading wallet contents', async t => {
  const context = await prepare(t);
  const digest = await configDigest(context.root);
  await executeGateBPublicWsInputs(
    authorizeBootstrap(context.root, digest), operationInjections(context.root),
  );
  const walletPath = join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet);
  const beforeWallet = await lstat(walletPath, { bigint: true });
  await unlink(walletPath);
  await writeFile(walletPath,
    'not-read-during-preflight\n', { mode: 0o600 });
  const afterWallet = await lstat(walletPath, { bigint: true });
  assert.equal(beforeWallet.dev === afterWallet.dev && beforeWallet.ino === afterWallet.ino, false);
  const result = await preflightPublicWsOnceRun({
    configPath: join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig),
    buyerRpcPath: join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc),
    buyerWalletPath: join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet),
    facilitatorRpcPath: join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc),
    authorizationPath: join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.authorization),
    workspaceRoot: context.root,
    runName: RUN_NAME,
    transportException: PUBLIC_WS_ONCE_POLICY.transportException,
  });
  assert.deepEqual(result, { valid: true });
  const authorization = JSON.parse(await readFile(
    join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.authorization), 'utf8',
  ));
  assert.equal(Object.hasOwn(authorization, 'payer'), false);
  assert.equal(Object.hasOwn(authorization, 'walletIdentity'), false);
});

test('parent and shared modules are import-safe and network-free with one source policy owner', async () => {
  const paths = [
    '../src/gate-b-public-ws-inputs-launcher.js',
    '../src/gate-b-public-ws-inputs-cli.js',
    '../src/gate-b-public-ws-inputs-supervisor.js',
    '../src/gate-b-public-ws-inputs-schema.js',
    '../src/gate-b-public-ws-private-workspace.js',
  ].map(path => new URL(path, import.meta.url));
  const sources = await Promise.all(paths.map(path => readFile(path, 'utf8')));
  const forbidden = [
    'znn-typescript-sdk', 'live-evidence-runner', 'node:http', 'node:https',
    'node:net', 'node:dns', 'fetch(', 'WebSocket', 'publishRawTransaction',
  ];
  for (const source of sources) {
    for (const token of forbidden) assert.equal(source.includes(token), false);
  }
  const childSource = await readFile(
    new URL('../src/gate-b-public-ws-inputs-child.js', import.meta.url), 'utf8',
  );
  assert.equal(childSource.includes("import('znn-typescript-sdk')"), true);
  assert.equal(childSource.includes("import('./live-evidence-runner.js')"), true);
  assert.equal(childSource.includes('node:http'), false);
  assert.equal(childSource.includes('node:https'), false);
  assert.equal(childSource.includes('node:net'), false);
  assert.equal(childSource.includes('node:dns'), false);
  assert.equal(childSource.includes('.trycloudflare.com'), false);
  assert.equal(childSource.includes('gate-b-quick-tunnel-hostname-source'), false);
  assert.equal(childSource.includes('gate-b-protected-endpoint-source'), false);
  const workspaceSource = sources[4];
  assert.equal(workspaceSource.includes('live-evidence-runner'), false);
  assert.equal(workspaceSource.includes('znn-typescript-sdk'), false);
});
