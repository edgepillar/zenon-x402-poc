import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  link,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { types as utilTypes } from 'node:util';
import { Worker } from 'node:worker_threads';

import { canonicalJson } from '../src/canonical.js';
import {
  OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT,
  OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_LANE,
  OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_NON_CLAIMS,
} from '../src/zenon/operator-trusted-local-devnet-profile.js';
import {
  runOperatorTrustedLocalDevnetReadiness,
} from '../src/local-devnet-readiness-runner.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const CLI_PATH = join(ROOT, 'src', 'local-devnet-readiness-runner-cli.js');
const WORKER_URL = new URL('../src/local-devnet-readiness-worker.js', import.meta.url);
const HOOK_URL = new URL('./fixtures/local-devnet-readiness-sdk-hook.js', import.meta.url);
const SUCCESS_LINE = 'LOCAL_DEVNET_READINESS_READY\n';
const FAILURE_LINE = 'LOCAL_DEVNET_READINESS_FAILED\n';
const PROTOCOL_READY = 'LDR1\u0000READY\u00001';
const PROTOCOL_FAILED = 'LDR1\u0000FAILED\u00001';
const TEST_PROCESS_TIMEOUT_MS = 10_000;
const TEST_REAP_TIMEOUT_MS = 2_000;
const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const APPLY = Reflect.apply;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const WEAK_SET_ADD = WeakSet.prototype.add;
const WEAK_SET_HAS = WeakSet.prototype.has;
const repeated = character => character.repeat(64);
const revision = character => character.repeat(40);

function descriptorSafeErrorCode(error) {
  if (error === null || (typeof error !== 'object' && typeof error !== 'function') ||
      APPLY(IS_PROXY, undefined, [error])) return undefined;
  let descriptor;
  try {
    descriptor = APPLY(GET_OWN_PROPERTY_DESCRIPTOR, undefined, [error, 'code']);
  } catch {
    return undefined;
  }
  if (!descriptor || !APPLY(HAS_OWN, undefined, [descriptor, 'value']) ||
      typeof descriptor.value !== 'string') return undefined;
  return descriptor.value;
}

function fixtureLifecycleError(code) {
  const error = new Error('test_fixture_lifecycle_failure');
  Object.defineProperty(error, 'code', {
    configurable: false,
    enumerable: false,
    value: code,
    writable: false,
  });
  return error;
}

function observeSettlement(value) {
  return Promise.resolve(value).then(
    result => ({ settled: true, result }),
    () => ({ rejected: true, settled: true }),
  );
}

async function settleWithin(observed, timeoutMs) {
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve({ settled: false }), timeoutMs);
  });
  try {
    return await Promise.race([observed, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function terminateWorkerBounded(worker) {
  const outcome = await settleWithin(observeSettlement(worker.terminate()), TEST_REAP_TIMEOUT_MS);
  if (outcome.settled !== true || outcome.rejected === true) {
    worker.unref();
    throw new Error('worker_cleanup_failed');
  }
}

function registerWorkerCleanup(t, worker) {
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await terminateWorkerBounded(worker);
  };
  t.after(cleanup);
  return cleanup;
}

async function waitForWorkerMessage(worker, timeoutMs = TEST_PROCESS_TIMEOUT_MS) {
  const observed = observeSettlement(new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
  }));
  const outcome = await settleWithin(observed, timeoutMs);
  if (outcome.settled !== true || outcome.rejected === true) {
    throw new Error('worker_message_failed');
  }
  return outcome.result;
}

function artifactValue() {
  return {
    artifactVersion: 1,
    lane: OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_LANE,
    acknowledgement: OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT,
    chainProfile: {
      version: 1,
      chainIdentifier: '69',
      genesisMomentumHash: repeated('a'),
    },
    heightTwo: {
      version: 1,
      chainIdentifier: 69,
      height: 2,
      hash: repeated('b'),
      previousHash: repeated('a'),
    },
    provenance: {
      generator: {
        repository: '0x3639/testnet',
        revision: revision('c'),
      },
      nodeRuntime: {
        sourceRepository: 'zenon-network/go-zenon',
        sourceRevision: revision('d'),
        containerImageDigest: `sha256:${repeated('e')}`,
      },
    },
    nonClaims: { ...OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_NON_CLAIMS },
  };
}

function artifactText(value = artifactValue()) {
  return `${canonicalJson(value)}\n`;
}

function makeMomentum({ height, hash, previousHash }) {
  return {
    version: 1,
    chainIdentifier: 69,
    hash,
    previousHash,
    height,
    timestamp: 0,
    data: '',
    content: [],
    changesHash: repeated('1'),
    publicKey: '',
    signature: '',
    producer: 'z1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsggv2f',
  };
}

async function privateDirectory(t) {
  const root = await import('node:fs/promises').then(({ mkdtemp }) =>
    mkdtemp(join(tmpdir(), 'readiness-runner-')));
  await chmod(root, 0o700);
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  return root;
}

async function writeArtifact(root, name = 'local-devnet.json', text = artifactText()) {
  await writeFile(join(root, name), text, { mode: 0o600, flag: 'wx' });
  return name;
}

function numericLoopbackUrl(port, ipv6 = false) {
  return ipv6
    ? `ws://[::1]:${port}/`
    : `ws://127.0.0.1:${port}/`;
}

function runnerOptions(artifactFileName, rpcUrl, timeoutMs = 5_000) {
  return {
    artifactFileName,
    rpcUrl,
    acknowledgement: OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT,
    timeoutMs,
  };
}

async function withCwd(directory, operation) {
  const previous = process.cwd();
  process.chdir(directory);
  try {
    return await operation();
  } finally {
    process.chdir(previous);
  }
}

async function createRpcNode(t, {
  closeAfterOpen = false,
  hang = false,
  serverErrorAfterListen = false,
  setupError = false,
  socketErrorPhase = 'none',
} = {}) {
  const calls = [];
  let connections = 0;
  let cleanupStarted = false;
  let cleanupUsed = false;
  let protocolFailure = false;
  let unexpectedServerFailure = false;
  let unexpectedSocketFailure = false;
  const expectedTeardownSockets = new WeakSet();
  const sockets = new Set();
  const markExpectedTeardown = socket => {
    APPLY(WEAK_SET_ADD, expectedTeardownSockets, [socket]);
  };
  const expectsTeardown = socket => APPLY(WEAK_SET_HAS, expectedTeardownSockets, [socket]);
  const results = {
    'stats.networkInfo': {
    numPeers: 1,
    self: { publicKey: 'local-peer', ip: 'loopback' },
    peers: [],
    },
    'stats.syncInfo': { state: 2, currentHeight: 8, targetHeight: 8 },
    'ledger.getFrontierMomentum': makeMomentum({
      height: 8,
      hash: repeated('f'),
      previousHash: repeated('a'),
    }),
    'ledger.getMomentumsByHeight': {
      count: 8,
      list: [makeMomentum({ height: 2, hash: repeated('b'), previousHash: repeated('a') })],
    },
  };
  const frame = value => {
    const payload = Buffer.from(JSON.stringify(value), 'utf8');
    if (payload.length < 126) return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
    if (payload.length <= 0xffff) {
      const header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(payload.length, 2);
      return Buffer.concat([header, payload]);
    }
    throw new Error('test_websocket_payload_too_large');
  };
  const server = createServer((_request, response) => {
    response.statusCode = 400;
    response.end();
  });
  const recordServerLifecycleError = () => {
    unexpectedServerFailure = true;
  };
  const handleUpgrade = (request, socket, initial) => {
    const onSocketError = error => {
      const code = descriptorSafeErrorCode(error);
      const expectedTransportFailure = expectsTeardown(socket) &&
        (code === 'ECONNRESET' || code === 'EPIPE');
      if (!expectedTransportFailure) unexpectedSocketFailure = true;
    };
    const rejectProtocol = () => {
      protocolFailure = true;
      socket.destroy();
    };
    socket.on('error', onSocketError);
    sockets.add(socket);
    if (cleanupStarted) markExpectedTeardown(socket);
    socket.once('close', () => {
      sockets.delete(socket);
      socket.removeListener('error', onSocketError);
    });
    const key = request.headers['sec-websocket-key'];
    if (typeof key !== 'string') {
      rejectProtocol();
      return;
    }
    const accept = createHash('sha1').update(`${key}${WEBSOCKET_GUID}`).digest('base64');
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n'));
    connections += 1;
    if (socketErrorPhase === 'before-teardown') {
      socket.emit('error', fixtureLifecycleError('ECONNRESET'));
    }
    if (closeAfterOpen) {
      markExpectedTeardown(socket);
      socket.destroy();
      return;
    }
    let buffered = initial;
    const consume = chunk => {
      buffered = Buffer.concat([buffered, chunk]);
      while (buffered.length >= 2) {
        const first = buffered[0];
        const second = buffered[1];
        let length = second & 0x7f;
        let offset = 2;
        if ((second & 0x80) === 0 || (first & 0x80) === 0) {
          rejectProtocol();
          return;
        }
        if (length === 126) {
          if (buffered.length < 4) return;
          length = buffered.readUInt16BE(2);
          offset = 4;
        } else if (length === 127) {
          if (buffered.length < 10 || buffered.readUInt32BE(2) !== 0) {
            rejectProtocol();
            return;
          }
          length = buffered.readUInt32BE(6);
          offset = 10;
        }
        if (buffered.length < offset + 4 + length) return;
        const mask = buffered.subarray(offset, offset + 4);
        const payload = Buffer.from(buffered.subarray(offset + 4, offset + 4 + length));
        buffered = buffered.subarray(offset + 4 + length);
        for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];
        const opcode = first & 0x0f;
        if (opcode === 8) {
          markExpectedTeardown(socket);
          socket.end(Buffer.from([0x88, 0]));
          return;
        }
        if (opcode === 9) {
          socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload]));
          continue;
        }
        if (opcode !== 1) {
          rejectProtocol();
          return;
        }
        let requestValue;
        try {
          requestValue = JSON.parse(payload.toString('utf8'));
        } catch {
          rejectProtocol();
          return;
        }
        const method = requestValue?.method;
        const params = requestValue?.params;
        if (typeof method !== 'string' || !Object.hasOwn(results, method)) {
          rejectProtocol();
          return;
        }
        calls.push([method, params]);
        if (!hang) {
          socket.write(
            frame({ jsonrpc: '2.0', id: requestValue.id, result: results[method] }),
            error => {
              if (error !== undefined && error !== null) onSocketError(error);
              else if (method === 'ledger.getMomentumsByHeight') markExpectedTeardown(socket);
            },
          );
        }
      }
    };
    socket.on('data', consume);
    if (initial.length > 0) consume(Buffer.alloc(0));
  };
  server.on('upgrade', handleUpgrade);
  let setupErrorListener;
  let setupListeningListener;
  const listening = observeSettlement(new Promise((resolve, reject) => {
    setupErrorListener = () => {
      server.removeListener('listening', setupListeningListener);
      reject(new Error('test_websocket_listen_failed'));
    };
    setupListeningListener = () => {
      server.removeListener('error', setupErrorListener);
      server.on('error', recordServerLifecycleError);
      resolve(true);
    };
    server.once('listening', setupListeningListener);
    server.once('error', setupErrorListener);
    if (setupError) server.emit('error', fixtureLifecycleError('EADDRINUSE'));
    else server.listen(0, '127.0.0.1');
  }));
  const listeningOutcome = await settleWithin(listening, TEST_REAP_TIMEOUT_MS);
  if (listeningOutcome.settled !== true || listeningOutcome.rejected === true) {
    server.removeListener('listening', setupListeningListener);
    server.removeListener('error', setupErrorListener);
    server.removeListener('upgrade', handleUpgrade);
    throw new Error('test_websocket_listen_failed');
  }
  if (serverErrorAfterListen) {
    server.emit('error', fixtureLifecycleError('EIO'));
  }
  const cleanup = async () => {
    if (cleanupUsed) return;
    cleanupUsed = true;
    cleanupStarted = true;
    for (const socket of sockets) {
      markExpectedTeardown(socket);
      if (socketErrorPhase === 'during-teardown') {
        socket.emit('error', fixtureLifecycleError('ECONNRESET'));
      }
      socket.destroy();
    }
    const closed = observeSettlement(new Promise(resolve => server.close(resolve)));
    const closeOutcome = await settleWithin(closed, TEST_REAP_TIMEOUT_MS);
    server.removeListener('error', recordServerLifecycleError);
    server.removeListener('upgrade', handleUpgrade);
    if (closeOutcome.settled !== true || closeOutcome.rejected === true) {
      throw new Error('test_websocket_close_failed');
    }
    if (protocolFailure || unexpectedServerFailure || unexpectedSocketFailure) {
      throw new Error('test_websocket_protocol_failed');
    }
  };
  t.after(cleanup);
  const address = server.address();
  return {
    calls,
    close: cleanup,
    get connections() { return connections; },
    url: numericLoopbackUrl(address.port),
  };
}

function requestFrame(artifact, url, timeoutMs = 2_000) {
  return `LDR1\u0000START\u00001\u0000${timeoutMs}\u0000${Buffer.byteLength(url)}\u0000${Buffer.byteLength(artifact)}\u0000${url}${artifact}`;
}

async function directFixtureWorker(t, mode, { timeoutMs = 2_000 } = {}) {
  const shared = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 7);
  const worker = new Worker(WORKER_URL, {
    argv: [],
    env: {},
    execArgv: ['--import', fileURLToPath(HOOK_URL)],
    stderr: true,
    stdout: true,
    workerData: { mode, counter: shared },
  });
  const cleanup = registerWorkerCleanup(t, worker);
  worker.stdout.resume();
  worker.stderr.resume();
  worker.postMessage(requestFrame(
    artifactText(),
    numericLoopbackUrl(1),
    timeoutMs,
  ));
  let message;
  try {
    message = await waitForWorkerMessage(worker, timeoutMs + TEST_REAP_TIMEOUT_MS);
  } finally {
    await cleanup();
  }
  return {
    counter: new Int32Array(shared),
    message,
  };
}

async function runCli(args, { cwd, hook = false }) {
  const childArgs = hook
    ? ['--import', fileURLToPath(HOOK_URL), CLI_PATH, ...args]
    : [CLI_PATH, ...args];
  const child = spawn(process.execPath, childArgs, {
    cwd,
    env: {},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const observed = observeSettlement(new Promise((resolve, reject) => {
    child.once('close', (code, signal) => resolve({ code, signal }));
    child.once('error', reject);
  }));
  let outcome = await settleWithin(observed, TEST_PROCESS_TIMEOUT_MS);
  if (outcome.settled !== true) {
    try { child.kill('SIGTERM'); } catch {}
    outcome = await settleWithin(observed, TEST_REAP_TIMEOUT_MS);
  }
  if (outcome.settled !== true) {
    try { child.kill('SIGKILL'); } catch {}
    outcome = await settleWithin(observed, TEST_REAP_TIMEOUT_MS);
  }
  if (outcome.settled !== true || outcome.rejected === true) {
    child.unref();
    throw new Error('cli_cleanup_failed');
  }
  return { ...outcome.result, stdout, stderr };
}

test('modules are import-safe and expose only the primitive runner API', async () => {
  const runner = await import('../src/local-devnet-readiness-runner.js');
  const cli = await import('../src/local-devnet-readiness-runner-cli.js');
  const worker = await import('../src/local-devnet-readiness-worker.js');
  assert.deepEqual(Object.keys(runner), ['runOperatorTrustedLocalDevnetReadiness']);
  assert.deepEqual(Object.keys(cli), []);
  assert.deepEqual(Object.keys(worker), []);
});

test('opaque options reject hostile containers and hooks before work', async () => {
  let traps = 0;
  const hostile = new Proxy({}, { ownKeys() { traps += 1; return []; } });
  await assert.rejects(runOperatorTrustedLocalDevnetReadiness(hostile));
  assert.equal(traps, 0);

  for (const key of ['artifactFileName', 'rpcUrl', 'acknowledgement', 'timeoutMs']) {
    let getters = 0;
    const options = runnerOptions('missing.json', numericLoopbackUrl(1));
    Object.defineProperty(options, key, {
      enumerable: true,
      get() { getters += 1; return undefined; },
    });
    await assert.rejects(runOperatorTrustedLocalDevnetReadiness(options));
    assert.equal(getters, 0);
  }
});

test('preflight rejects missing, extra, inherited, symbol, boxed, and overlapping inputs', async () => {
  const base = runnerOptions('missing.json', numericLoopbackUrl(1));
  for (const mutate of [
    value => { delete value.timeoutMs; },
    value => { value.extra = true; },
    value => { Object.defineProperty(value, Symbol('extra'), { value: true }); },
    value => { value.timeoutMs = new Number(2_000); },
    value => { value.rpcUrl = new String(numericLoopbackUrl(1)); },
  ]) {
    const value = { ...base };
    mutate(value);
    await assert.rejects(runOperatorTrustedLocalDevnetReadiness(value));
  }
  const inherited = Object.create({ timeoutMs: 2_000 });
  Object.assign(inherited, base);
  delete inherited.timeoutMs;
  await assert.rejects(runOperatorTrustedLocalDevnetReadiness(inherited));
});

test('acknowledgement, timeout, and filename grammar fail closed', async () => {
  const invalid = [
    { ...runnerOptions('missing.json', numericLoopbackUrl(1)), acknowledgement: 'wrong' },
    { ...runnerOptions('missing.json', numericLoopbackUrl(1)), timeoutMs: 999 },
    { ...runnerOptions('missing.json', numericLoopbackUrl(1)), timeoutMs: 30_001 },
    { ...runnerOptions('../missing.json', numericLoopbackUrl(1)) },
    { ...runnerOptions('UPPER.json', numericLoopbackUrl(1)) },
    { ...runnerOptions('bad.name.json', numericLoopbackUrl(1)) },
    { ...runnerOptions('bad%20name.json', numericLoopbackUrl(1)) },
  ];
  for (const options of invalid) await assert.rejects(runOperatorTrustedLocalDevnetReadiness(options));
});

test('URL grammar accepts only canonical numeric loopback literals', async t => {
  const root = await privateDirectory(t);
  const artifact = await writeArtifact(root);
  const invalid = [
    'ws://localhost:1/',
    'wss://127.0.0.1:1/',
    'ws://127.0.0.2:1/',
    'ws://127.0.0.1/',
    'ws://127.0.0.1:80/',
    'ws://[::1]:80/',
    'ws://127.0.0.1:01/',
    'ws://127.0.0.1:65536/',
    'ws://127.0.0.1:1/path',
    'ws://127.0.0.1:1/?query',
    'ws://127.0.0.1:1/#fragment',
    'ws://user@127.0.0.1:1/',
    'ws://[::ffff:127.0.0.1]:1/',
    'ws://[::1%25zone]:1/',
    'WS://127.0.0.1:1/',
    'ws://2130706433:1/',
  ];
  await withCwd(root, async () => {
    for (const rpcUrl of invalid) {
      await assert.rejects(runOperatorTrustedLocalDevnetReadiness(runnerOptions(artifact, rpcUrl, 1_000)));
    }
  });
});

test('artifact descriptor rejects symlink, hardlink, directory, unsafe mode, empty, and oversize', async t => {
  const root = await privateDirectory(t);
  const source = await writeArtifact(root, 'source.json');
  await symlink(source, join(root, 'symbolic.json'));
  await link(join(root, source), join(root, 'linked.json'));
  await mkdir(join(root, 'directory.json'), { mode: 0o700 });
  await writeFile(join(root, 'empty.json'), '', { mode: 0o600 });
  await writeFile(join(root, 'oversize.json'), 'x'.repeat(16_385), { mode: 0o600 });
  await writeFile(join(root, 'unsafe.json'), artifactText(), { mode: 0o622 });
  await chmod(join(root, 'unsafe.json'), 0o622);
  await withCwd(root, async () => {
    for (const name of ['source.json', 'symbolic.json', 'linked.json', 'directory.json', 'empty.json', 'oversize.json', 'unsafe.json']) {
      await assert.rejects(runOperatorTrustedLocalDevnetReadiness(
        runnerOptions(name, numericLoopbackUrl(1), 1_000),
      ));
    }
  });
});

test('noncanonical and forged artifacts fail before Worker creation', async t => {
  const root = await privateDirectory(t);
  const bad = artifactValue();
  bad.nonClaims.fourNodeTopologyVerified = true;
  await writeArtifact(root, 'forged.json', artifactText(bad));
  await writeFile(join(root, 'noncanonical.json'), `${JSON.stringify(artifactValue(), null, 2)}\n`, { mode: 0o600 });
  await withCwd(root, async () => {
    await assert.rejects(runOperatorTrustedLocalDevnetReadiness(
      runnerOptions('forged.json', numericLoopbackUrl(1), 1_000),
    ));
    await assert.rejects(runOperatorTrustedLocalDevnetReadiness(
      runnerOptions('noncanonical.json', numericLoopbackUrl(1), 1_000),
    ));
  });
});

test('post-import intrinsic poisoning cannot bypass parent validation', async () => {
  const original = Object.getOwnPropertyDescriptor(Object.prototype, 'then');
  let hooks = 0;
  try {
    Object.defineProperty(Object.prototype, 'then', {
      configurable: true,
      get() { hooks += 1; return undefined; },
    });
    const rejection = runOperatorTrustedLocalDevnetReadiness({});
    assert.equal(hooks, 0);
    await assert.rejects(rejection);
  } finally {
    if (original) Object.defineProperty(Object.prototype, 'then', original);
    else delete Object.prototype.then;
  }


  const originals = {
    arrayIncludes: Array.prototype.includes,
    getOwnPropertyDescriptor: Object.getOwnPropertyDescriptor,
    numberIsSafeInteger: Number.isSafeInteger,
    reflectOwnKeys: Reflect.ownKeys,
    regexpExec: RegExp.prototype.exec,
  };
  let intrinsicHooks = 0;
  let rejection;
  try {
    const hostile = () => { intrinsicHooks += 1; throw new Error('hostile intrinsic'); };
    Array.prototype.includes = hostile;
    Object.getOwnPropertyDescriptor = hostile;
    Number.isSafeInteger = hostile;
    Reflect.ownKeys = hostile;
    RegExp.prototype.exec = hostile;
    rejection = runOperatorTrustedLocalDevnetReadiness(
      runnerOptions('missing.json', numericLoopbackUrl(1)),
    );
  } finally {
    Array.prototype.includes = originals.arrayIncludes;
    Object.getOwnPropertyDescriptor = originals.getOwnPropertyDescriptor;
    Number.isSafeInteger = originals.numberIsSafeInteger;
    Reflect.ownKeys = originals.reflectOwnKeys;
    RegExp.prototype.exec = originals.regexpExec;
  }
  await assert.rejects(rejection);
  assert.equal(intrinsicHooks, 0);
});

test('Worker protocol rejects malformed and nonprimitive messages', async t => {
  for (const message of [
    {},
    [],
    'bad',
    'LDR1\u0000START\u00002\u00001000\u00000\u00000\u0000',
    requestFrame(artifactText(), numericLoopbackUrl(80), 1_000),
    requestFrame(artifactText(), numericLoopbackUrl(80, true), 1_000),
  ]) {
    const worker = new Worker(WORKER_URL, { argv: [], env: {}, execArgv: [], stderr: true, stdout: true });
    const cleanup = registerWorkerCleanup(t, worker);
    worker.stdout.resume();
    worker.stderr.resume();
    worker.postMessage(message);
    try {
      assert.equal(await waitForWorkerMessage(worker), PROTOCOL_FAILED);
    } finally {
      await cleanup();
    }
  }
});

test('Worker protocol rejects a concurrent replayed START frame', async t => {
  const shared = new SharedArrayBuffer(4);
  const worker = new Worker(WORKER_URL, {
    argv: [],
    env: {},
    execArgv: ['--import', fileURLToPath(HOOK_URL)],
    stderr: true,
    stdout: true,
    workerData: { mode: 'hung-promise', counter: shared },
  });
  const cleanup = registerWorkerCleanup(t, worker);
  worker.stdout.resume();
  worker.stderr.resume();
  worker.postMessage(requestFrame(artifactText(), numericLoopbackUrl(1), 1_000));
  worker.postMessage(requestFrame(artifactText(), numericLoopbackUrl(1), 1_000));
  try {
    assert.equal(await waitForWorkerMessage(worker), PROTOCOL_FAILED);
    assert.equal(Atomics.load(new Int32Array(shared), 0), 0);
  } finally {
    await cleanup();
  }
});

test('production Worker path is not configurable or fixture-reachable', async () => {
  const source = await readFile(join(ROOT, 'src', 'local-devnet-readiness-runner.js'), 'utf8');
  assert.match(source, /new URL\('\.\/local-devnet-readiness-worker\.js', import\.meta\.url\)/);
  assert.doesNotMatch(source, /workerData|sdk-hook|sdk-fixture|process\.env|execArgv:\s*\[[^\]]+\]/);
});

test('real pinned SDK performs one connection and exactly four ordered readiness reads', async t => {
  const root = await privateDirectory(t);
  const artifact = await writeArtifact(root);
  const node = await createRpcNode(t);
  const result = await withCwd(root, () =>
    runOperatorTrustedLocalDevnetReadiness(runnerOptions(artifact, node.url)));
  assert.equal(result, true);
  assert.equal(typeof result, 'boolean');
  assert.equal(node.connections, 1);
  assert.deepEqual(node.calls.map(([name]) => name), [
    'stats.networkInfo',
    'stats.syncInfo',
    'ledger.getFrontierMomentum',
    'ledger.getMomentumsByHeight',
  ]);
  assert.deepEqual(node.calls[3][1], [2, 1]);
});

test('reconnect is disabled after an unexpected socket close', async t => {
  const root = await privateDirectory(t);
  const artifact = await writeArtifact(root);
  const node = await createRpcNode(t, { closeAfterOpen: true });
  await withCwd(root, async () => {
    await assert.rejects(runOperatorTrustedLocalDevnetReadiness(
      runnerOptions(artifact, node.url, 1_000),
    ));
  });
  await new Promise(resolve => setTimeout(resolve, 1_100));
  assert.equal(node.connections, 1);
});

test('fixture contains reset only after an explicit teardown boundary', async t => {
  const root = await privateDirectory(t);
  const artifact = await writeArtifact(root);
  const expectedNode = await createRpcNode(t, { socketErrorPhase: 'during-teardown' });
  await withCwd(root, async () => {
    assert.equal(await runOperatorTrustedLocalDevnetReadiness(
      runnerOptions(artifact, expectedNode.url),
    ), true);
  });
  await expectedNode.close();

  const unexpectedNode = await createRpcNode(t, { socketErrorPhase: 'before-teardown' });
  await withCwd(root, async () => {
    assert.equal(await runOperatorTrustedLocalDevnetReadiness(
      runnerOptions(artifact, unexpectedNode.url),
    ), true);
  });
  await assert.rejects(unexpectedNode.close());
});

test('fixture distinguishes setup errors from post-listen lifecycle errors', async t => {
  await assert.rejects(createRpcNode(t, { setupError: true }));
  const node = await createRpcNode(t, { serverErrorAfterListen: true });
  await assert.rejects(node.close());
});

test('method Proxy and accessor are rejected before invocation', async t => {
  for (const mode of ['method-proxy', 'accessor-method']) {
    const result = await directFixtureWorker(t, mode);
    assert.equal(result.message, PROTOCOL_FAILED);
    assert.equal(Atomics.load(result.counter, 0), 0);
  }
});

test('result Proxy, accessor, thenable, subclass, and cross-realm values are zero-hook failures', async t => {
  for (const mode of [
    'result-proxy',
    'accessor-result',
    'thenable-result',
    'subclass-result',
    'cross-realm-result',
    'promise-subclass',
    'promise-proxy',
    'cross-realm-promise',
    'primitive-result',
    'prototype-then',
  ]) {
    const result = await directFixtureWorker(t, mode);
    assert.equal(result.message, PROTOCOL_FAILED);
    assert.equal(Atomics.load(result.counter, 0), 0);
  }
});

test('only genuine native Promise SDK lifecycle results succeed', async t => {
  const result = await directFixtureWorker(t, 'valid-native-promise');
  assert.equal(result.message, PROTOCOL_READY);
  assert.deepEqual(Array.from(result.counter), [0, 1, 1, 1, 1, 1, 1]);
});

test('initialization rejects nonnative promises and wrong fulfillment after one best-effort close', async t => {
  for (const mode of [
    'initialize-sync',
    'initialize-thenable',
    'initialize-promise-proxy',
    'initialize-promise-subclass',
    'initialize-cross-realm-promise',
    'initialize-wrong-fulfillment',
  ]) {
    const result = await directFixtureWorker(t, mode);
    assert.equal(result.message, PROTOCOL_FAILED);
    assert.equal(Atomics.load(result.counter, 0), 0);
    assert.equal(Atomics.load(result.counter, 1), 1);
    assert.equal(Atomics.load(result.counter, 6), 1);
  }
});

test('all readiness reads require exact native same-realm Promises', async t => {
  for (const mode of [
    'sync-values',
    'thenable-result',
    'promise-subclass',
    'promise-proxy',
    'cross-realm-promise',
    'primitive-result',
  ]) {
    const result = await directFixtureWorker(t, mode);
    assert.equal(result.message, PROTOCOL_FAILED);
    assert.equal(Atomics.load(result.counter, 0), 0);
    assert.equal(Atomics.load(result.counter, 1), 1);
    assert.equal(Atomics.load(result.counter, 2), 1);
    assert.equal(Atomics.load(result.counter, 6), 1);
  }
});

test('nested Hash core and API receiver substitutes are zero-hook failures', async t => {
  for (const mode of [
    'hash-core-proxy',
    'stats-receiver-proxy',
    'ledger-receiver-proxy',
    'stats-receiver-accessor',
    'ledger-receiver-accessor',
  ]) {
    const result = await directFixtureWorker(t, mode);
    assert.equal(result.message, PROTOCOL_FAILED);
    assert.equal(Atomics.load(result.counter, 0), 0);
  }
});

test('timeout and hung promise return failure and destroy the Worker', async t => {
  const result = await directFixtureWorker(t, 'hung-promise', { timeoutMs: 1_000 });
  assert.equal(result.message, PROTOCOL_FAILED);
});

test('close throw and close noncompletion never report readiness', async t => {
  for (const mode of ['close-throw', 'close-hang', 'close-promise', 'close-value']) {
    const result = await directFixtureWorker(t, mode, { timeoutMs: 1_000 });
    assert.equal(result.message, PROTOCOL_FAILED);
  }
});

test('overlap is rejected and sequential invocations remain fresh', async t => {
  const root = await privateDirectory(t);
  const artifact = await writeArtifact(root);
  const node = await createRpcNode(t, { hang: true });
  const healthyNode = await createRpcNode(t);
  await withCwd(root, async () => {
    const first = runOperatorTrustedLocalDevnetReadiness(runnerOptions(artifact, node.url, 1_000));
    await assert.rejects(runOperatorTrustedLocalDevnetReadiness(
      runnerOptions(artifact, node.url, 1_000),
    ));
    await assert.rejects(first);
    assert.equal(await runOperatorTrustedLocalDevnetReadiness(
      runnerOptions(artifact, healthyNode.url, 5_000),
    ), true);
  });
  assert.equal(healthyNode.connections, 1);
});

test('CLI success is exact and SDK output is discarded', async t => {
  const root = await privateDirectory(t);
  const artifact = await writeArtifact(root);
  const node = await createRpcNode(t);
  const result = await runCli([
    '--timeout-ms', '5000',
    '--acknowledgement', OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT,
    '--rpc-url', node.url,
    '--artifact-file', artifact,
  ], { cwd: root });
  assert.deepEqual(result, { code: 0, signal: null, stdout: SUCCESS_LINE, stderr: '' });
});

test('CLI failure, duplicate, unknown, alias, and missing flags are exact', async t => {
  const root = await privateDirectory(t);
  const cases = [
    [],
    ['--unknown', 'value'],
    ['--artifact-file=bad.json'],
    ['--artifact-file', 'missing.json', '--artifact-file', 'again.json'],
  ];
  for (const args of cases) {
    const result = await runCli(args, { cwd: root });
    assert.deepEqual(result, { code: 1, signal: null, stdout: '', stderr: FAILURE_LINE });
  }
});

test('CLI rejects Proxy argv with zero hooks and handles broken or short writers once', async t => {
  const root = await privateDirectory(t);
  const proxyResult = await runCli([
    '--artifact-file', 'proxy-argv.json',
    '--rpc-url', numericLoopbackUrl(1),
    '--acknowledgement', OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT,
    '--timeout-ms', '1000',
  ], { cwd: root, hook: true });
  assert.deepEqual(proxyResult, { code: 1, signal: null, stdout: '', stderr: FAILURE_LINE });

  const node = await createRpcNode(t);
  for (const artifact of ['broken-writer.json', 'short-writer.json']) {
    await writeArtifact(root, artifact);
    const result = await runCli([
      '--artifact-file', artifact,
      '--rpc-url', node.url,
      '--acknowledgement', OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT,
      '--timeout-ms', '5000',
    ], { cwd: root, hook: true });
    assert.deepEqual(result, { code: 1, signal: null, stdout: '', stderr: FAILURE_LINE });
  }
});

test('source boundary contains no payment capability, SDK global mutation, environment, or fixture import', async () => {
  const paths = [
    'src/local-devnet-readiness-runner.js',
    'src/local-devnet-readiness-worker.js',
    'src/local-devnet-readiness-runner-cli.js',
  ];
  const sources = await Promise.all(paths.map(path => readFile(join(ROOT, path), 'utf8')));
  const joined = sources.join('\n');
  for (const forbidden of [
    'KeyStore', 'prepareBlock', 'publishRawTransaction', 'SettlementJournal',
    'resourceHandler', 'process.env', 'setNetworkID', 'setChainID', 'getInstance',
    'local-devnet-readiness-sdk-hook', 'local-devnet-readiness-sdk-fixture',
  ]) assert.doesNotMatch(joined, new RegExp(forbidden));
  assert.match(sources[1], /assertZenonNodeReady/);
});

test('descriptor implementation includes exact owner, generation, mode, and close gates', async () => {
  const source = await readFile(join(ROOT, 'src', 'local-devnet-readiness-runner.js'), 'utf8');
  for (const token of [
    'O_NOFOLLOW', 'O_NONBLOCK', 'O_RDONLY', 'getuid', 'nlink', 'mtimeNs', 'ctimeNs',
    'bytesRead', 'isFile', 'close', '0o022', '0o7000',
  ]) assert.match(source, new RegExp(token));
});

test('parent and Worker both reject the explicit WebSocket default port', async () => {
  const sources = await Promise.all([
    'src/local-devnet-readiness-runner.js',
    'src/local-devnet-readiness-worker.js',
  ].map(path => readFile(join(ROOT, path), 'utf8')));
  for (const source of sources) assert.match(source, /port === 80/);
});

test('documentation preserves readiness-only and Issue 45 boundaries', async () => {
  const documents = await Promise.all([
    'README.md', 'SECURITY.md', 'docs/IMPLEMENTATION_PLAN.md',
  ].map(path => readFile(join(ROOT, path), 'utf8')));
  for (const document of documents) {
    assert.match(document, /readiness/i);
    assert.match(document, /Issue #45|#45/);
    assert.match(document, /fourNodeTopologyVerified.*false|topology.*unverified/is);
    assert.match(document, /does not.*(release|activate|close)/is);
    assert.match(document, /non-default-port/);
    assert.match(document, /trailing slash/i);
    assert.match(document, /hostname|DNS/i);
    assert.match(document, /port.*80|80.*port/is);
  }
});
