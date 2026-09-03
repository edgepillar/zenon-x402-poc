import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import * as sdk from 'znn-typescript-sdk';

import { runGateBBuyerWalletCli } from '../src/gate-b-buyer-wallet-cli.js';
import {
  createGateBBuyerWallet,
  parseGateBBuyerWalletBootstrap,
  runGateBBuyerWalletChild,
} from '../src/gate-b-buyer-wallet-child.js';
import { superviseGateBBuyerWalletChild } from '../src/gate-b-buyer-wallet-supervisor.js';
import {
  GATE_B_BUYER_WALLET_LEGACY_WORKSPACE_NAME,
  GATE_B_TESTNET_FAUCET_RECEIVE_LEGACY_STATE_NAME,
  selectGateBBuyerWalletWorkspace,
} from '../src/gate-b-buyer-wallet-selector.js';
import { parsePublicWsOnceRoleInput } from '../src/live-evidence-runner.js';

const TEST_ENTROPY = '00'.repeat(32);
const WORKSPACE_NAME = 'zenon-x402-gate-b-wallet';
const GENERATION_TOKEN = '09af'.repeat(8);

test('wallet selector preserves legacy placement and binds one exact generated sibling', () => {
  const supportRoot = '/private/synthetic/Application Support';
  const legacyRoot = join(supportRoot, WORKSPACE_NAME);
  const generatedRoot = join(supportRoot, `${WORKSPACE_NAME}-${GENERATION_TOKEN}`);
  const legacy = selectGateBBuyerWalletWorkspace(legacyRoot, supportRoot);
  const generated = selectGateBBuyerWalletWorkspace(generatedRoot, supportRoot);

  assert.equal(GATE_B_BUYER_WALLET_LEGACY_WORKSPACE_NAME, WORKSPACE_NAME);
  assert.equal(GATE_B_TESTNET_FAUCET_RECEIVE_LEGACY_STATE_NAME,
    'zenon-x402-gate-b-faucet-receive');
  assert.deepEqual(legacy, {
    generationToken: null,
    stateWorkspaceRoot: join(supportRoot,
      GATE_B_TESTNET_FAUCET_RECEIVE_LEGACY_STATE_NAME),
    walletWorkspaceRoot: legacyRoot,
  });
  assert.deepEqual(generated, {
    generationToken: GENERATION_TOKEN,
    stateWorkspaceRoot: join(supportRoot,
      `${GATE_B_TESTNET_FAUCET_RECEIVE_LEGACY_STATE_NAME}-${GENERATION_TOKEN}`),
    walletWorkspaceRoot: generatedRoot,
  });
  assert.equal(Object.isFrozen(legacy), true);
  assert.equal(Object.isFrozen(generated), true);

  const nonAsciiSupportRoot = '/private/synthetic/unicode-\u00e9/Application Support';
  const nonAsciiGeneratedRoot = join(
    nonAsciiSupportRoot,
    `${WORKSPACE_NAME}-${GENERATION_TOKEN}`,
  );
  assert.equal(
    selectGateBBuyerWalletWorkspace(
      nonAsciiGeneratedRoot,
      nonAsciiSupportRoot,
    ).walletWorkspaceRoot,
    nonAsciiGeneratedRoot,
  );

  for (const rejected of [
    `${generatedRoot}0`,
    join(supportRoot, `${WORKSPACE_NAME}-${GENERATION_TOKEN.toUpperCase()}`),
    join(supportRoot, `${WORKSPACE_NAME}-${GENERATION_TOKEN.slice(0, -1)}g`),
    join(supportRoot, `${WORKSPACE_NAME}-${'a'.repeat(31)}`),
    join(supportRoot, `${WORKSPACE_NAME}-${'a'.repeat(33)}`),
    join(supportRoot, `${WORKSPACE_NAME}-${'a'.repeat(16)}-${'b'.repeat(15)}`),
    join(supportRoot, 'nested', `${WORKSPACE_NAME}-${GENERATION_TOKEN}`),
    `${supportRoot}/../Application Support/${WORKSPACE_NAME}-${GENERATION_TOKEN}`,
  ]) {
    assert.throws(
      () => selectGateBBuyerWalletWorkspace(rejected, supportRoot),
      /gate_b_buyer_wallet_selector_invalid/,
    );
  }
});

async function fixture(t, workspaceName = WORKSPACE_NAME) {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'gate-b-wallet-')));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = join(temporary, 'Library', 'Application Support', workspaceName);
  await mkdir(root, { recursive: true, mode: 0o700 });
  await chmod(root, 0o700);
  return realpath(root);
}

async function additionalWorkspace(parent, label) {
  const root = join(parent, label, 'Library', 'Application Support', WORKSPACE_NAME);
  await mkdir(root, { recursive: true, mode: 0o700 });
  await chmod(root, 0o700);
  return realpath(root);
}

function deterministicSdk(counter = { random: 0, index: [] }) {
  return {
    KeyStore: {
      fromEntropy(entropy) {
        counter.random += 1;
        const wallet = sdk.KeyStore.fromEntropy(entropy);
        const original = wallet.getKeyPair.bind(wallet);
        wallet.getKeyPair = index => {
          counter.index.push(index);
          return original(index);
        };
        return wallet;
      },
    },
  };
}

function injectedSdk(root, counter, changes = {}) {
  const {
    actualCwdPath,
    afterEntropy,
    afterRandomness,
    afterReservations,
    applicationSupportRoot,
    decorateDirectoryHandle,
    decorateFileHandle,
    entropySource,
    openPrivateWorkspace,
    privateWorkspaceInjections = {},
    readDirectory,
    sdkLoader,
    useDefaultAcl = false,
    ...legacyPrivateChanges
  } = changes;
  const workspaceInjections = {
    platform: 'darwin',
    actualCwdPath: () => root,
    lstatActualCwd: () => lstat(root, { bigint: true }),
    openActualCwd: flags => open(root, flags),
    realpathActualCwd: () => realpath(root),
    ...(useDefaultAcl ? {} : { aclInspector: async () => true }),
    ...legacyPrivateChanges,
    ...privateWorkspaceInjections,
  };
  if (decorateFileHandle !== undefined) {
    workspaceInjections.decorateFileHandle = (handle, name) => decorateFileHandle(
      handle,
      name === 'buyer-wallet.json' ? 'wallet' : 'address',
    );
  }
  if (decorateDirectoryHandle !== undefined) {
    workspaceInjections.decorateDirectoryHandle = decorateDirectoryHandle;
  }
  const output = {
    actualCwdPath: actualCwdPath ?? (() => root),
    applicationSupportRoot: applicationSupportRoot ?? (() => dirname(root)),
    privateWorkspaceInjections: workspaceInjections,
    sdkLoader: sdkLoader ?? (async () => deterministicSdk(counter)),
    entropySource: entropySource ?? (async size => {
      assert.equal(size, 32);
      return Buffer.from(TEST_ENTROPY, 'hex');
    }),
    afterReservations: afterReservations ?? (async () => {}),
    afterEntropy: afterEntropy ?? afterRandomness ?? (async () => {}),
  };
  if (openPrivateWorkspace !== undefined) output.openPrivateWorkspace = openPrivateWorkspace;
  if (readDirectory !== undefined) output.readDirectory = readDirectory;
  return output;
}

function supervisorInjections(root, changes = {}) {
  return {
    applicationSupportRoot: () => dirname(root),
    ...changes,
  };
}

function defaultAclSdk(root, counter) {
  return {
    applicationSupportRoot: () => dirname(root),
    sdkLoader: async () => deterministicSdk(counter),
    entropySource: async size => {
      assert.equal(size, 32);
      return Buffer.from(TEST_ENTROPY, 'hex');
    },
  };
}

function waitForExit(child) {
  return new Promise((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', (code, signal) => resolveExit({ code, signal }));
  });
}

async function runSilent(executable, argv) {
  const child = spawn(executable, argv, { env: {}, stdio: 'ignore' });
  return waitForExit(child);
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
}

function wrapHandle(handle, changes = {}) {
  return {
    stat: options => handle.stat(options),
    chmod: value => handle.chmod(value),
    read: (...args) => handle.read(...args),
    write: (...args) => handle.write(...args),
    sync: () => handle.sync(),
    close: () => handle.close(),
    ...changes,
  };
}

class FakeChild extends EventEmitter {
  constructor(onRequest) {
    super();
    this.connected = true;
    this.onRequest = onRequest;
    this.bootstrap = new PassThrough();
    this.bootstrapChunks = [];
    this.bootstrap.on('data', chunk => this.bootstrapChunks.push(Buffer.from(chunk)));
    this.stdio = [null, null, null, null, this.bootstrap];
    this.kills = [];
    this.messages = [];
  }

  send(message, callback) {
    this.messages.push(message);
    queueMicrotask(() => {
      if (callback) callback();
      this.onRequest?.(this, message);
    });
    return true;
  }

  kill(signal) {
    this.kills.push(signal);
    queueMicrotask(() => this.emit('close', null, signal));
    return true;
  }
}

function successfulFork(captured) {
  return (modulePath, argv, options) => {
    const child = new FakeChild((current, message) => {
      if (message.type !== 'CREATE') return;
      queueMicrotask(() => {
        current.emit('message', { ipcVersion: 1, requestId: 1, type: 'CREATED' });
        current.emit('exit', 0, null);
        current.emit('close', 0, null);
      });
    });
    captured.push({ modulePath, argv, options, child });
    queueMicrotask(() => child.emit('message', {
      ipcVersion: 1,
      requestId: 1,
      type: 'READY',
    }));
    return child;
  };
}

test('wallet helper imports are inert in a fresh process and operator CLI imports no secret implementation', async () => {
  const repositoryRoot = new URL('..', import.meta.url);
  const targetUrls = [
    new URL('buyer-wallet.json', repositoryRoot),
    new URL('buyer-address.json', repositoryRoot),
  ];
  assert.deepEqual(await Promise.all(targetUrls.map(path => exists(path))), [false, false]);
  const before = await import('node:fs/promises').then(fs => Promise.all([
    fs.stat(new URL('../src/gate-b-buyer-wallet-cli.js', import.meta.url)),
    fs.stat(new URL('../src/gate-b-buyer-wallet-supervisor.js', import.meta.url)),
    fs.stat(new URL('../src/gate-b-buyer-wallet-child.js', import.meta.url)),
  ]));
  const child = spawn(process.execPath, [
    '--input-type=module',
    '--eval',
    "await Promise.all([import('./src/gate-b-buyer-wallet-cli.js'),import('./src/gate-b-buyer-wallet-supervisor.js'),import('./src/gate-b-buyer-wallet-child.js')]);",
  ], {
    cwd: new URL('..', import.meta.url),
    env: {},
    stdio: 'ignore',
  });
  assert.deepEqual(await waitForExit(child), { code: 0, signal: null });
  const after = await import('node:fs/promises').then(fs => Promise.all([
    fs.stat(new URL('../src/gate-b-buyer-wallet-cli.js', import.meta.url)),
    fs.stat(new URL('../src/gate-b-buyer-wallet-supervisor.js', import.meta.url)),
    fs.stat(new URL('../src/gate-b-buyer-wallet-child.js', import.meta.url)),
  ]));
  assert.deepEqual(after.map(value => value.mtimeMs), before.map(value => value.mtimeMs));
  assert.deepEqual(await Promise.all(targetUrls.map(path => exists(path))), [false, false]);
  const cliSource = await readFile(new URL('../src/gate-b-buyer-wallet-cli.js', import.meta.url),
    'utf8');
  assert.equal(cliSource.includes('gate-b-buyer-wallet-child'), false);
  assert.equal(cliSource.includes('znn-typescript-sdk'), false);
  assert.equal(cliSource.includes('mnemonic'), false);
});

test('CLI accepts only exact create grammar and emits only fixed output', async t => {
  const root = await fixture(t);
  const stdout = [];
  const stderr = [];
  let supervised;
  assert.equal(await runGateBBuyerWalletCli({
    argv: ['create', '--workspace', root],
    stdout: value => stdout.push(value),
    stderr: value => stderr.push(value),
    async supervise(value) {
      supervised = value;
      return { status: 'created' };
    },
  }), true);
  assert.equal(supervised, root);
  assert.deepEqual(stdout, ['GATE_B_BUYER_WALLET_CREATED\n']);
  assert.deepEqual(stderr, []);

  for (const argv of [
    [],
    ['create', '--workspace'],
    ['create', root, '--workspace'],
    ['create', '--workspace', 'relative'],
    ['create', '--workspace', root, '--extra'],
    ['run', '--workspace', root],
  ]) {
    const failures = [];
    assert.equal(await runGateBBuyerWalletCli({
      argv,
      stdout() { throw new Error('unexpected'); },
      stderr: value => failures.push(value),
      async supervise() { throw new Error('unexpected'); },
    }), false);
    assert.deepEqual(failures, ['GATE_B_BUYER_WALLET_CREATION_FAILED\n']);
  }
});

test('closed output descriptors cannot surface raw stream errors or stacks', async () => {
  const programs = [
    "import {closeSync} from 'node:fs';closeSync(2);const {runGateBBuyerWalletCli}=await import('./src/gate-b-buyer-wallet-cli.js');const ok=await runGateBBuyerWalletCli({argv:[]});process.exit(ok?2:0);",
    "import {closeSync} from 'node:fs';closeSync(1);const {runGateBBuyerWalletCli}=await import('./src/gate-b-buyer-wallet-cli.js');const ok=await runGateBBuyerWalletCli({argv:['create','--workspace','/synthetic'],supervise:async()=>({status:'created'})});process.exit(ok?2:0);",
  ];
  for (const program of programs) {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', program], {
      cwd: new URL('..', import.meta.url),
      env: {},
      stdio: 'ignore',
    });
    assert.deepEqual(await waitForExit(child), { code: 0, signal: null });
  }
});

test('supervisor isolates the child and accepts only enum IPC plus clean close', async t => {
  const root = await fixture(t);
  const captured = [];
  const childModule = join(root, 'fixed', 'fixed-child.js');
  const result = await superviseGateBBuyerWalletChild(root, supervisorInjections(root, {
    forkProcess: successfulFork(captured),
    childModule,
    timeoutMs: 1000,
  }));
  assert.deepEqual(result, { status: 'created' });
  assert.equal(captured.length, 1);
  assert.deepEqual(captured[0].argv, []);
  assert.deepEqual(captured[0].options.env, {});
  assert.deepEqual(captured[0].options.execArgv, []);
  assert.equal(captured[0].options.shell, false);
  assert.deepEqual(captured[0].options.stdio, ['ignore', 'ignore', 'ignore', 'ipc', 'pipe']);
  assert.equal(captured[0].options.cwd, root);
  assert.equal(captured[0].options.cwd === root, true);
});

test('real OS fork validates fd-4 bootstrap, empty requested env, IPC, and clean exit without a wallet', async t => {
  const root = await fixture(t);
  const result = await superviseGateBBuyerWalletChild(root, supervisorInjections(root, {
    childModule: fileURLToPath(new URL(
      '../test-support/gate-b-wallet-supervisor-child.js',
      import.meta.url,
    )),
    timeoutMs: 2000,
  }));
  assert.deepEqual(result, { status: 'created' });
  assert.equal(await exists(join(root, 'buyer-wallet.json')), false);
  assert.equal(await exists(join(root, 'buyer-address.json')), false);
});

test('supervisor rejects malformed, duplicate, late, signaled, and timed-out children', async t => {
  const root = await fixture(t);
  const childModule = join(root, 'fixed-child.js');
  const scenarios = [
    child => child.emit('message', { ipcVersion: 1, requestId: 1, type: 'BROKEN' }),
    child => {
      child.emit('message', { ipcVersion: 1, requestId: 1, type: 'READY' });
      child.emit('message', { ipcVersion: 1, requestId: 1, type: 'READY' });
    },
    child => {
      child.emit('message', { ipcVersion: 1, requestId: 1, type: 'READY' });
      child.emit('message', { ipcVersion: 1, requestId: 1, type: 'CREATED' });
      child.emit('message', { ipcVersion: 1, requestId: 1, type: 'CREATED' });
    },
    child => {
      child.emit('message', { ipcVersion: 1, requestId: 1, type: 'READY' });
      child.emit('message', { ipcVersion: 1, requestId: 1, type: 'CREATED' });
      child.emit('exit', null, 'SIGTERM');
    },
  ];
  for (const scenario of scenarios) {
    const child = new FakeChild();
    queueMicrotask(() => scenario(child));
    await assert.rejects(
      superviseGateBBuyerWalletChild(root, supervisorInjections(root, {
        forkProcess: () => child,
        childModule,
        timeoutMs: 100,
      })),
      /gate_b_buyer_wallet_supervisor_failed/,
    );
  }
  const child = new FakeChild();
  await assert.rejects(
    superviseGateBBuyerWalletChild(root, supervisorInjections(root, {
      forkProcess: () => child,
      childModule,
      timeoutMs: 5,
    })),
    /gate_b_buyer_wallet_supervisor_failed/,
  );
  assert.ok(child.kills.length >= 1);
});

test('supervisor escalates to SIGKILL and has a bounded no-close reap policy', async t => {
  const root = await fixture(t);
  const childModule = join(root, 'fixed-child.js');
  const forceClosed = new FakeChild();
  forceClosed.kill = function kill(signal) {
    this.kills.push(signal);
    if (signal === 'SIGKILL') queueMicrotask(() => this.emit('close', null, signal));
    return true;
  };
  await assert.rejects(
    superviseGateBBuyerWalletChild(root, supervisorInjections(root, {
      forkProcess: () => forceClosed,
      childModule,
      timeoutMs: 5,
    })),
    /gate_b_buyer_wallet_supervisor_failed/,
  );
  assert.deepEqual(forceClosed.kills, ['SIGTERM', 'SIGKILL']);

  const neverClosed = new FakeChild();
  neverClosed.kill = function kill(signal) {
    this.kills.push(signal);
    return true;
  };
  const started = Date.now();
  await assert.rejects(
    superviseGateBBuyerWalletChild(root, supervisorInjections(root, {
      forkProcess: () => neverClosed,
      childModule,
      timeoutMs: 5,
    })),
    /gate_b_buyer_wallet_supervisor_failed/,
  );
  assert.deepEqual(neverClosed.kills, ['SIGTERM', 'SIGKILL']);
  assert.equal(Date.now() - started < 3000, true);
});

test('supervisor abandons pathological handles without retaining IPC or late lifecycle work', async t => {
  const root = await fixture(t);
  const childModule = join(root, 'fixed-child.js');
  const child = new FakeChild();
  const references = { bootstrap: true, channel: true, child: true, ipc: true };
  const cleanup = { channelUnref: 0, childUnref: 0, disconnect: 0 };
  const originalDestroy = child.bootstrap.destroy.bind(child.bootstrap);
  child.bootstrap.destroy = (...args) => {
    references.bootstrap = false;
    return originalDestroy(...args);
  };
  child.channel = {
    unref() {
      cleanup.channelUnref += 1;
      references.channel = false;
    },
  };
  child.disconnect = function disconnect() {
    cleanup.disconnect += 1;
    references.ipc = false;
    this.connected = false;
    queueMicrotask(() => this.emit('disconnect'));
  };
  child.unref = function unref() {
    cleanup.childUnref += 1;
    references.child = false;
  };
  child.kill = function kill(signal) {
    this.kills.push(signal);
    return true;
  };
  const unhandled = [];
  const onUnhandled = reason => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  t.after(() => process.removeListener('unhandledRejection', onUnhandled));

  await rejectsFixedSupervisorFailure(superviseGateBBuyerWalletChild(
    root,
    supervisorInjections(root, {
      forkProcess: () => child,
      childModule,
      timeoutMs: 5,
    }),
  ));
  assert.deepEqual(child.kills, ['SIGTERM', 'SIGKILL']);
  assert.deepEqual(cleanup, { channelUnref: 1, childUnref: 1, disconnect: 1 });
  assert.deepEqual(references, { bootstrap: false, channel: false, child: false, ipc: false });
  assert.equal(child.bootstrap.destroyed, true);
  assert.equal(child.bootstrap.listenerCount('error'), 0);
  for (const event of ['error', 'disconnect', 'message', 'exit', 'close']) {
    assert.equal(child.listenerCount(event), 0);
  }

  const afterAbandonment = { cleanup: { ...cleanup }, kills: [...child.kills] };
  child.emit('exit', 0, null);
  child.emit('exit', 0, null);
  child.emit('close', 0, null);
  child.emit('close', 0, null);
  child.emit('disconnect');
  child.emit('disconnect');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual({ cleanup, kills: child.kills }, afterAbandonment);
  assert.deepEqual(unhandled, []);

  const successful = [];
  await superviseGateBBuyerWalletChild(root, supervisorInjections(root, {
    forkProcess: successfulFork(successful),
    childModule,
    timeoutMs: 1000,
  }));
  assert.equal(successful[0].child.bootstrap.destroyed, true);
  assert.equal(successful[0].child.bootstrap.listenerCount('error'), 0);
  for (const event of ['error', 'disconnect', 'message', 'exit', 'close']) {
    assert.equal(successful[0].child.listenerCount(event), 0);
  }
});

test('supervisor disables protocol actions before late reap-window events', async t => {
  const root = await fixture(t);
  const childModule = join(root, 'fixed-child.js');
  const effects = { rng: 0, sdk: 0 };
  let lateEvents = 0;
  const child = new FakeChild((_current, message) => {
    if (message.type !== 'CREATE') return;
    effects.sdk += 1;
    effects.rng += 1;
  });
  child.kill = function kill(signal) {
    this.kills.push(signal);
    if (signal === 'SIGTERM') {
      queueMicrotask(() => {
        const messages = [
          { ipcVersion: 1, requestId: 1, type: 'READY' },
          { ipcVersion: 1, requestId: 1, type: 'CREATED' },
          { ipcVersion: 1, requestId: 1, type: 'CREATED' },
        ];
        for (const message of messages) {
          lateEvents += 1;
          this.emit('message', message);
        }
        lateEvents += 1;
        this.emit('error', new Error(syntheticSecretCanary()));
        lateEvents += 1;
        this.emit('disconnect');
      });
    }
    return true;
  };
  const unhandled = [];
  const onUnhandled = reason => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  t.after(() => process.removeListener('unhandledRejection', onUnhandled));

  await rejectsFixedSupervisorFailure(superviseGateBBuyerWalletChild(
    root,
    supervisorInjections(root, {
      forkProcess: () => child,
      childModule,
      timeoutMs: 5,
    }),
  ));
  assert.equal(lateEvents, 5);
  assert.deepEqual(child.messages, []);
  assert.deepEqual(effects, { rng: 0, sdk: 0 });
  assert.deepEqual(child.kills, ['SIGTERM', 'SIGKILL']);
  assert.deepEqual(unhandled, []);
});

test('child accepts one exact control message and terminates on disconnect or duplication', async () => {
  const channel = new EventEmitter();
  channel.connected = true;
  const sent = [];
  channel.send = (message, callback) => {
    sent.push(message);
    queueMicrotask(() => callback());
    return true;
  };
  const exits = [];
  await runGateBBuyerWalletChild({
    channel,
    async readBootstrap() { return '/private/synthetic'; },
    async createWallet() { return { status: 'created' }; },
    forceExit(code) { exits.push(code); },
  });
  assert.equal(sent[0].type, 'READY');
  channel.emit('message', { ipcVersion: 1, requestId: 1, type: 'CREATE' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sent.map(message => message.type), ['READY', 'CREATED']);
  assert.deepEqual(exits, [0]);

  const disconnected = new EventEmitter();
  disconnected.connected = true;
  disconnected.send = (_message, callback) => {
    queueMicrotask(() => callback());
    return true;
  };
  const disconnectExits = [];
  await runGateBBuyerWalletChild({
    channel: disconnected,
    async readBootstrap() { return '/private/synthetic'; },
    async createWallet() { return { status: 'created' }; },
    forceExit(code) { disconnectExits.push(code); },
  });
  disconnected.emit('disconnect');
  assert.deepEqual(disconnectExits, [1]);

  const duplicate = new EventEmitter();
  duplicate.connected = true;
  duplicate.send = (_message, callback) => {
    queueMicrotask(() => callback());
    return true;
  };
  const duplicateExits = [];
  let releaseCreation;
  await runGateBBuyerWalletChild({
    channel: duplicate,
    async readBootstrap() { return '/private/synthetic'; },
    async createWallet() {
      await new Promise(resolve => { releaseCreation = resolve; });
      return { status: 'created' };
    },
    forceExit(code) { duplicateExits.push(code); },
  });
  duplicate.emit('message', { ipcVersion: 1, requestId: 1, type: 'CREATE' });
  duplicate.emit('message', { ipcVersion: 1, requestId: 1, type: 'CREATE' });
  releaseCreation();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(duplicateExits, [1]);
});

test('bootstrap parser accepts only the supervisor canonical shape', () => {
  assert.equal(
    parseGateBBuyerWalletBootstrap('{"workspaceRoot":"/private/synthetic"}'),
    '/private/synthetic',
  );
  for (const text of [
    '{}',
    '{"workspaceRoot":"relative"}',
    '{"workspaceRoot":"/one","workspaceRoot":"/two"}',
    ' {"workspaceRoot":"/private/synthetic"}',
    '{"workspaceRoot":"/private/synthetic","extra":true}',
  ]) {
    assert.throws(() => parseGateBBuyerWalletBootstrap(text),
      /gate_b_buyer_wallet_child_failed/);
  }
});

test('deterministic creation produces parser-compatible distinct owner-only files', async t => {
  const root = await fixture(t);
  const counter = { random: 0, index: [] };
  const result = await createGateBBuyerWallet(root, injectedSdk(root, counter));
  assert.deepEqual(result, { status: 'created' });
  assert.equal(counter.random, 1);
  assert.deepEqual(counter.index, [0]);

  const walletPath = join(root, 'buyer-wallet.json');
  const addressPath = join(root, 'buyer-address.json');
  const [walletStat, addressStat, walletText, addressText] = await Promise.all([
    lstat(walletPath, { bigint: true }),
    lstat(addressPath, { bigint: true }),
    readFile(walletPath, 'utf8'),
    readFile(addressPath, 'utf8'),
  ]);
  assert.equal(Number(walletStat.mode & 0o777n), 0o600);
  assert.equal(Number(addressStat.mode & 0o777n), 0o600);
  assert.equal(walletStat.nlink, 1n);
  assert.equal(addressStat.nlink, 1n);
  assert.equal(walletStat.isFile(), true);
  assert.equal(addressStat.isFile(), true);
  assert.equal(walletStat.dev === addressStat.dev && walletStat.ino === addressStat.ino, false);

  const parsedWallet = parsePublicWsOnceRoleInput(walletText, 'buyer-wallet');
  const addressRecord = JSON.parse(addressText);
  assert.deepEqual(Object.keys(addressRecord), ['addressVersion', 'address', 'accountIndex']);
  assert.equal(addressRecord.addressVersion, 1);
  assert.equal(addressRecord.accountIndex, 0);
  assert.equal(walletText.endsWith('\n'), true);
  assert.equal(addressText.endsWith('\n'), true);
  assert.equal(addressText.includes(parsedWallet.mnemonic), false);
  const independentlyDerived = sdk.KeyStore.fromMnemonic(parsedWallet.mnemonic)
    .getKeyPair(0).getAddress().toString();
  assert.equal(independentlyDerived === addressRecord.address, true);
});

test('generated wallet selection is independently bound, isolated, and one-shot', async t => {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'gate-b-wallet-generation-')));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const supportRoot = join(temporary, 'Library', 'Application Support');
  const legacyRoot = join(supportRoot, WORKSPACE_NAME);
  const generatedRoot = join(supportRoot, `${WORKSPACE_NAME}-${GENERATION_TOKEN}`);
  await mkdir(legacyRoot, { recursive: true, mode: 0o700 });
  await mkdir(generatedRoot, { mode: 0o700 });
  await chmod(legacyRoot, 0o700);
  await chmod(generatedRoot, 0o700);
  const legacyWallet = join(legacyRoot, 'buyer-wallet.json');
  const legacyAddress = join(legacyRoot, 'buyer-address.json');
  await writeFile(legacyWallet, 'preserved-wallet-evidence', { flag: 'wx', mode: 0o600 });
  await writeFile(legacyAddress, 'preserved-address-evidence', { flag: 'wx', mode: 0o600 });
  const legacyBefore = await Promise.all([
    readFile(legacyWallet),
    readFile(legacyAddress),
    lstat(legacyWallet, { bigint: true }),
    lstat(legacyAddress, { bigint: true }),
  ]);

  const captured = [];
  assert.deepEqual(await superviseGateBBuyerWalletChild(
    generatedRoot,
    supervisorInjections(generatedRoot, {
      childModule: join(temporary, 'fixed-wallet-child.js'),
      forkProcess: successfulFork(captured),
      timeoutMs: 1000,
    }),
  ), { status: 'created' });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].options.cwd, generatedRoot);

  const firstCounter = { random: 0, index: [] };
  let releaseReservations;
  let reservationsReady;
  const reservationBarrier = new Promise(resolveBarrier => {
    releaseReservations = resolveBarrier;
  });
  const ready = new Promise(resolveReady => { reservationsReady = resolveReady; });
  const first = createGateBBuyerWallet(generatedRoot, injectedSdk(
    generatedRoot,
    firstCounter,
    {
      async afterReservations() {
        reservationsReady();
        await reservationBarrier;
      },
    },
  ));
  await ready;
  const concurrentCounter = { random: 0, index: [] };
  await assert.rejects(createGateBBuyerWallet(
    generatedRoot,
    injectedSdk(generatedRoot, concurrentCounter),
  ));
  assert.equal(concurrentCounter.random, 0);
  releaseReservations();
  assert.deepEqual(await first, { status: 'created' });
  assert.equal(firstCounter.random, 1);
  await assert.rejects(createGateBBuyerWallet(
    generatedRoot,
    injectedSdk(generatedRoot, { random: 0, index: [] }),
  ));

  const legacyAfter = await Promise.all([
    readFile(legacyWallet),
    readFile(legacyAddress),
    lstat(legacyWallet, { bigint: true }),
    lstat(legacyAddress, { bigint: true }),
  ]);
  assert.deepEqual(legacyAfter.slice(0, 2), legacyBefore.slice(0, 2));
  assert.deepEqual(
    legacyAfter.slice(2).map(value => [value.dev, value.ino, value.size, value.mode]),
    legacyBefore.slice(2).map(value => [value.dev, value.ino, value.size, value.mode]),
  );

  const mismatchedRoot = join(supportRoot, `${WORKSPACE_NAME}-${'f'.repeat(32)}`);
  await mkdir(mismatchedRoot, { mode: 0o700 });
  await chmod(mismatchedRoot, 0o700);
  const mismatchCounter = { random: 0, index: [] };
  await assert.rejects(createGateBBuyerWallet(
    mismatchedRoot,
    injectedSdk(mismatchedRoot, mismatchCounter, {
      actualCwdPath: () => generatedRoot,
    }),
  ));
  assert.equal(mismatchCounter.random, 0);
});

test('creation reserves and verifies both files before invoking randomness', async t => {
  const root = await fixture(t);
  const counter = { random: 0, index: [] };
  let observed = false;
  await createGateBBuyerWallet(root, injectedSdk(root, counter, {
    async afterReservations() {
      const [walletStat, addressStat] = await Promise.all([
        lstat(join(root, 'buyer-wallet.json'), { bigint: true }),
        lstat(join(root, 'buyer-address.json'), { bigint: true }),
      ]);
      observed = walletStat.size === 0n && addressStat.size === 0n &&
        Number(walletStat.mode & 0o777n) === 0o600 &&
        Number(addressStat.mode & 0o777n) === 0o600 &&
        walletStat.nlink === 1n && addressStat.nlink === 1n;
    },
  }));
  assert.equal(observed, true);
  assert.equal(counter.random, 1);
});

test('ACL verification covers the workspace and both artifacts before randomness', async t => {
  const root = await fixture(t);
  const counter = { random: 0, index: [] };
  const observed = [];
  await createGateBBuyerWallet(root, injectedSdk(root, counter, {
    async aclInspector(_handle, expectedMode) {
      observed.push(expectedMode);
      return true;
    },
  }));
  assert.equal(observed.includes('drwx------'), true);
  assert.equal(observed.includes('-rw-------'), true);
  assert.equal(counter.random, 1);

  const rejected = await additionalWorkspace(root, 'acl-rejected');
  const rejectedCounter = { random: 0, index: [] };
  await assert.rejects(createGateBBuyerWallet(rejected, injectedSdk(rejected, rejectedCounter, {
    async aclInspector() { return false; },
  })), /gate_b_buyer_wallet_child_failed/);
  assert.equal(rejectedCounter.random, 0);
});

test('Darwin default ACL inspection accepts a clean deterministic workspace', async t => {
  if (process.platform !== 'darwin') return t.skip('Darwin-only ACL boundary');
  const root = await fixture(t);
  const counter = { random: 0, index: [] };
  const originalCwd = process.cwd();
  process.chdir(root);
  try {
    await createGateBBuyerWallet(root, defaultAclSdk(root, counter));
  } finally {
    process.chdir(originalCwd);
  }
  assert.equal(counter.random, 1);
});

test('Darwin default ACL inspection rejects an actual ACL before SDK randomness', async t => {
  if (process.platform !== 'darwin') return t.skip('Darwin-only ACL boundary');
  const parent = await fixture(t);
  const root = await additionalWorkspace(parent, 'acl-present');
  assert.deepEqual(
    await runSilent('/bin/chmod', ['+a', 'everyone deny delete', root]),
    { code: 0, signal: null },
  );
  const originalCwd = process.cwd();
  process.chdir(root);
  try {
    const counter = { random: 0, index: [] };
    await assert.rejects(createGateBBuyerWallet(
      root,
      defaultAclSdk(root, counter),
    ), /gate_b_buyer_wallet_child_failed/);
    assert.equal(counter.random, 0);
  } finally {
    process.chdir(originalCwd);
    assert.deepEqual(
      await runSilent('/bin/chmod', ['-N', root]),
      { code: 0, signal: null },
    );
  }
});

test('full-write loops and all file and directory sync barriers are exercised', async t => {
  const root = await fixture(t);
  const syncs = [];
  await createGateBBuyerWallet(root, injectedSdk(root, { random: 0, index: [] }, {
    decorateFileHandle(handle, label) {
      return wrapHandle(handle, {
        async write(bytes, offset, length, position) {
          return handle.write(bytes, offset, Math.min(length, 3), position);
        },
        async sync() {
          syncs.push(label);
          return handle.sync();
        },
      });
    },
    decorateDirectoryHandle(handle) {
      return wrapHandle(handle, {
        async sync() {
          syncs.push('directory');
          return handle.sync();
        },
      });
    },
  }));
  assert.deepEqual(syncs, [
    'directory', 'directory',
    'wallet', 'address',
    'directory', 'directory',
  ]);
});

test('unsafe workspace mode, ownership, canonical aliases, symlinks, and Git containment fail before RNG', async t => {
  const parent = await fixture(t);
  const cases = [];

  const unsafeMode = await additionalWorkspace(parent, 'unsafe-mode');
  await chmod(unsafeMode, 0o755);
  cases.push({ root: unsafeMode, injected: {} });

  const ownerMismatch = await additionalWorkspace(parent, 'owner-mismatch');
  cases.push({ root: ownerMismatch, injected: {
    getuid: () => (typeof process.getuid === 'function' ? process.getuid() + 1 : 1),
  } });

  const canonical = await additionalWorkspace(parent, 'canonical');
  cases.push({ root: `${canonical}/../${WORKSPACE_NAME}`, injected: {} });

  const symlinkTarget = join(parent, 'symlink-target');
  await mkdir(symlinkTarget, { mode: 0o700 });
  const symlinkRoot = await additionalWorkspace(parent, 'symlink-root');
  await rm(symlinkRoot, { recursive: true });
  await symlink(symlinkTarget, symlinkRoot);
  cases.push({ root: symlinkRoot, injected: {} });

  const gitParent = join(parent, 'git-parent');
  const gitChild = await additionalWorkspace(parent, 'git-parent');
  await mkdir(join(gitParent, '.git'), { recursive: true, mode: 0o700 });
  cases.push({ root: gitChild, injected: {} });

  for (const entry of cases) {
    const counter = { random: 0, index: [] };
    await assert.rejects(
      createGateBBuyerWallet(entry.root, injectedSdk(entry.root, counter, entry.injected)),
      /gate_b_buyer_wallet_child_failed/,
    );
    assert.equal(counter.random, 0);
  }
});

test('existing file, symlink, hard link, and zero-byte crash residue refuse before RNG', async t => {
  const parent = await fixture(t);
  const setups = [
    async root => writeFile(join(root, 'buyer-wallet.json'), 'existing', { mode: 0o600 }),
    async root => {
      const external = join(parent, 'symlink-source');
      await writeFile(external, 'external', { mode: 0o600 });
      await symlink(external, join(root, 'buyer-wallet.json'));
    },
    async root => {
      const external = join(parent, 'hardlink-source');
      await writeFile(external, 'external', { mode: 0o600 });
      await link(external, join(root, 'buyer-address.json'));
    },
    async root => writeFile(join(root, 'buyer-address.json'), '', { mode: 0o600 }),
  ];
  for (let index = 0; index < setups.length; index += 1) {
    const root = await additionalWorkspace(parent, `existing-${index}`);
    await setups[index](root);
    const counter = { random: 0, index: [] };
    await assert.rejects(
      createGateBBuyerWallet(root, injectedSdk(root, counter)),
      /gate_b_buyer_wallet_child_failed/,
    );
    assert.equal(counter.random, 0);
  }
});

test('second reservation failure preserves the first retained crash residue before RNG', async t => {
  const root = await fixture(t);
  const counter = { random: 0, index: [] };
  const { open: openPath } = await import('node:fs/promises');
  await assert.rejects(
    createGateBBuyerWallet(root, injectedSdk(root, counter, {
      async openPath(path, ...rest) {
        if (path === join(root, 'buyer-address.json')) {
          throw Object.assign(new Error('synthetic'), { code: 'EIO' });
        }
        return openPath(path, ...rest);
      },
    })),
    /gate_b_buyer_wallet_child_failed/,
  );
  assert.equal(counter.random, 0);
  const residue = await lstat(join(root, 'buyer-wallet.json'), { bigint: true });
  assert.equal(residue.isFile(), true);
  assert.equal(residue.size, 0n);
  assert.equal(Number(residue.mode & 0o777n), 0o600);
  assert.equal(await exists(join(root, 'buyer-address.json')), false);
  await assert.rejects(
    createGateBBuyerWallet(root, injectedSdk(root, counter)),
    /gate_b_buyer_wallet_child_failed/,
  );
  assert.equal(counter.random, 0);
});

test('write and sync failures preserve owner-only residue and block retries', async t => {
  const parent = await fixture(t);
  for (const failure of ['address-write', 'directory-sync']) {
    const root = await additionalWorkspace(parent, failure);
    const changes = failure === 'address-write'
      ? {
          decorateFileHandle(handle, label) {
            return wrapHandle(handle, label === 'address' ? {
              async write() { throw new Error('synthetic'); },
            } : {});
          },
        }
      : {
          decorateDirectoryHandle(handle) {
            return wrapHandle(handle, {
              async sync() { throw new Error('synthetic'); },
            });
          },
        };
    await assert.rejects(
      createGateBBuyerWallet(root, injectedSdk(root, { random: 0, index: [] }, changes)),
      /gate_b_buyer_wallet_child_failed/,
    );
    const [walletStat, addressStat] = await Promise.all([
      lstat(join(root, 'buyer-wallet.json'), { bigint: true }),
      lstat(join(root, 'buyer-address.json'), { bigint: true }),
    ]);
    assert.equal(Number(walletStat.mode & 0o777n), 0o600);
    assert.equal(Number(addressStat.mode & 0o777n), 0o600);
    const retryCounter = { random: 0, index: [] };
    await assert.rejects(
      createGateBBuyerWallet(root, injectedSdk(root, retryCounter)),
      /gate_b_buyer_wallet_child_failed/,
    );
    assert.equal(retryCounter.random, 0);
  }
});

test('workspace replacement after reservation fails before RNG and preserves crash residue', async t => {
  const parent = await fixture(t);
  const root = await additionalWorkspace(parent, 'workspace');
  const moved = join(parent, 'moved-workspace');
  const counter = { random: 0, index: [] };
  await assert.rejects(
    createGateBBuyerWallet(root, injectedSdk(root, counter, {
      async afterReservations() {
        await rename(root, moved);
        await mkdir(root, { mode: 0o700 });
      },
    })),
    /gate_b_buyer_wallet_child_failed/,
  );
  assert.equal(counter.random, 0);
  assert.equal(await exists(join(root, 'buyer-wallet.json')), false);
  assert.equal(await exists(join(root, 'buyer-address.json')), false);
  assert.equal(await exists(join(moved, 'buyer-wallet.json')), true);
  assert.equal(await exists(join(moved, 'buyer-address.json')), true);
});

test('target replacement failure never unlinks any retained or replacement inode', async t => {
  const root = await fixture(t);
  const displaced = join(root, 'displaced-wallet');
  await assert.rejects(
    createGateBBuyerWallet(root, injectedSdk(root, { random: 0, index: [] }, {
      async afterRandomness() {
        await rename(join(root, 'buyer-wallet.json'), displaced);
        await writeFile(join(root, 'buyer-wallet.json'), 'replacement', { mode: 0o600 });
      },
    })),
    /gate_b_buyer_wallet_child_failed/,
  );
  assert.equal(await readFile(join(root, 'buyer-wallet.json'), 'utf8'), 'replacement');
  assert.equal(await exists(displaced), true);
  assert.equal(await exists(join(root, 'buyer-address.json')), true);
});

test('post-wallet-write failure retains a protected parser-compatible recovery artifact', async t => {
  const root = await fixture(t);
  await assert.rejects(
    createGateBBuyerWallet(root, injectedSdk(root, { random: 0, index: [] }, {
      decorateFileHandle(handle, label) {
        return wrapHandle(handle, label === 'address' ? {
          async write() { throw new Error('synthetic'); },
        } : {});
      },
    })),
    /gate_b_buyer_wallet_child_failed/,
  );
  const walletPath = join(root, 'buyer-wallet.json');
  const before = await lstat(walletPath, { bigint: true });
  const parsed = parsePublicWsOnceRoleInput(await readFile(walletPath, 'utf8'), 'buyer-wallet');
  assert.equal(parsed.accountIndex, 0);
  assert.equal(Number(before.mode & 0o777n), 0o600);
  assert.equal(before.nlink, 1n);
  const after = await lstat(walletPath, { bigint: true });
  assert.equal(before.dev === after.dev && before.ino === after.ino, true);
});

test('helper path has no intended network invocation and SDK loading stays child-local', async () => {
  const paths = [
    new URL('../src/gate-b-buyer-wallet-cli.js', import.meta.url),
    new URL('../src/gate-b-buyer-wallet-supervisor.js', import.meta.url),
    new URL('../src/gate-b-buyer-wallet-child.js', import.meta.url),
  ];
  const sources = await Promise.all(paths.map(path => readFile(path, 'utf8')));
  const forbidden = [
    'node:http', 'node:https', 'node:net', 'node:dns',
    'fetch(', 'WebSocket', 'initialize(', 'publishRawTransaction',
  ];
  for (const source of sources) {
    for (const token of forbidden) assert.equal(source.includes(token), false);
  }
  assert.equal(sources[0].includes('znn-typescript-sdk'), false);
  assert.equal(sources[1].includes('znn-typescript-sdk'), false);
  assert.equal(sources[2].includes("import('znn-typescript-sdk')"), true);
});

test('lockfile-pinned SDK supports deterministic non-secret wallet construction smoke', async () => {
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(lock.packages['node_modules/znn-typescript-sdk'].version, '1.0.5');
  const wallet = sdk.KeyStore.fromEntropy(TEST_ENTROPY);
  const keyPair = wallet.getKeyPair(0);
  assert.equal(typeof wallet.mnemonic, 'string');
  assert.equal(wallet.mnemonic.length > 0, true);
  assert.equal(typeof keyPair.getAddress().toString(), 'string');
  keyPair.clear();
  for (const field of ['mnemonic', 'entropy', 'seed']) wallet[field] = '';
});

function syntheticSecretCanary() {
  return ['synthetic', 'secret', 'channel', 'sentinel'].join('-');
}

async function rejectsFixedChildFailure(promise) {
  await assert.rejects(promise, error => {
    assert.equal(error?.message, 'gate_b_buyer_wallet_child_failed');
    assert.equal(
      error?.stack,
      'GateBBuyerWalletChildError: gate_b_buyer_wallet_child_failed',
    );
    assert.equal(String(error).includes(syntheticSecretCanary()), false);
    return true;
  });
}

async function rejectsFixedSupervisorFailure(promise) {
  await assert.rejects(promise, error => {
    assert.equal(error?.message, 'gate_b_buyer_wallet_supervisor_failed');
    assert.equal(
      error?.stack,
      'GateBBuyerWalletSupervisorError: gate_b_buyer_wallet_supervisor_failed',
    );
    assert.equal(String(error).includes(syntheticSecretCanary()), false);
    return true;
  });
}

async function assertProtectedResidue(root, name, expectedSize) {
  const value = await lstat(join(root, name), { bigint: true });
  assert.equal(value.isFile(), true);
  assert.equal(Number(value.mode & 0o777n), 0o600);
  assert.equal(value.nlink, 1n);
  if (expectedSize !== undefined) assert.equal(value.size, BigInt(expectedSize));
  return value;
}

test('hardening reuses the shared capability and rejects non-allowlisted or nonempty workspaces before effects', async t => {
  const childSource = await readFile(
    new URL('../src/gate-b-buyer-wallet-child.js', import.meta.url),
    'utf8',
  );
  assert.equal(
    childSource.includes("from './gate-b-public-ws-private-workspace.js'"),
    true,
  );
  for (const duplicatedBoundary of [
    'inspectDarwinAcl', 'assertOutsideGit', 'O_EXCL', 'decorateDirectoryHandle',
  ]) {
    assert.equal(childSource.includes(duplicatedBoundary), false);
  }

  const first = await fixture(t);
  const wrongRoot = join(dirname(first), 'not-allowlisted');
  await mkdir(wrongRoot, { mode: 0o700 });
  const second = await fixture(t);
  await writeFile(join(second, 'unrelated-entry'), 'synthetic', { mode: 0o600 });
  for (const root of [wrongRoot, second]) {
    const counter = { random: 0, index: [] };
    const effects = { entropy: 0, reservations: 0, sdk: 0 };
    await rejectsFixedChildFailure(createGateBBuyerWallet(root, injectedSdk(root, counter, {
      applicationSupportRoot: () => dirname(first),
      decorateFileHandle(handle) {
        effects.reservations += 1;
        return handle;
      },
      async entropySource() {
        effects.entropy += 1;
        return Buffer.alloc(32);
      },
      async sdkLoader() {
        effects.sdk += 1;
        return deterministicSdk(counter);
      },
    })));
    assert.deepEqual(effects, { entropy: 0, reservations: 0, sdk: 0 });
  }
});

test('hardening keeps the exact private cwd and cleans malformed process handoffs without secret channels', async t => {
  const root = await fixture(t);
  const captured = [];
  const childModule = join(root, 'fixed-child.js');
  await superviseGateBBuyerWalletChild(root, supervisorInjections(root, {
    forkProcess: successfulFork(captured),
    childModule,
    timeoutMs: 1000,
  }));
  assert.equal(captured.length, 1);
  const record = captured[0];
  assert.deepEqual(record.argv, []);
  assert.equal(record.options.cwd, root);
  assert.deepEqual(record.options.env, {});
  assert.deepEqual(record.options.execArgv, []);
  assert.equal(record.options.shell, false);
  assert.deepEqual(record.options.stdio, ['ignore', 'ignore', 'ignore', 'ipc', 'pipe']);
  assert.deepEqual(record.child.messages, [{
    ipcVersion: 1,
    requestId: 1,
    type: 'CREATE',
  }]);
  const bootstrap = Buffer.concat(record.child.bootstrapChunks).toString('utf8');
  assert.deepEqual(JSON.parse(bootstrap), { workspaceRoot: root });
  assert.equal(JSON.stringify({
    argv: record.argv,
    cwd: record.options.cwd,
    env: record.options.env,
    execArgv: record.options.execArgv,
    ipc: record.child.messages,
    modulePath: record.modulePath,
    stdio: record.options.stdio,
  }).includes(syntheticSecretCanary()), false);
  assert.equal(bootstrap.includes(syntheticSecretCanary()), false);

  const malformed = new FakeChild();
  malformed.send = undefined;
  await rejectsFixedSupervisorFailure(superviseGateBBuyerWalletChild(
    root,
    supervisorInjections(root, {
      forkProcess: () => malformed,
      childModule,
      timeoutMs: 100,
    }),
  ));
  assert.equal(malformed.bootstrap.destroyed, true);
  assert.equal(malformed.kills.includes('SIGTERM'), true);
});

test('hardening requires both reservation directory syncs before SDK or entropy and closes all handles', async t => {
  for (const failedLabel of ['path', 'cwd']) {
    const root = await fixture(t);
    const counter = { random: 0, index: [] };
    const effects = { entropy: 0, sdk: 0 };
    const syncs = [];
    const closes = [];
    await rejectsFixedChildFailure(createGateBBuyerWallet(root, injectedSdk(root, counter, {
      decorateDirectoryHandle(handle, label) {
        return wrapHandle(handle, {
          async close() {
            closes.push(label);
            return handle.close();
          },
          async sync() {
            syncs.push(label);
            if (label === failedLabel) throw new Error(syntheticSecretCanary());
            return handle.sync();
          },
        });
      },
      decorateFileHandle(handle, label) {
        return wrapHandle(handle, {
          async close() {
            closes.push(label);
            return handle.close();
          },
        });
      },
      async entropySource() {
        effects.entropy += 1;
        return Buffer.alloc(32);
      },
      async sdkLoader() {
        effects.sdk += 1;
        return deterministicSdk(counter);
      },
    })));
    assert.deepEqual(syncs, ['path', 'cwd', 'path', 'cwd']);
    assert.deepEqual(effects, { entropy: 0, sdk: 0 });
    await assertProtectedResidue(root, 'buyer-wallet.json', 0);
    await assertProtectedResidue(root, 'buyer-address.json', 0);
    for (const label of ['wallet', 'address', 'path', 'cwd']) {
      assert.equal(closes.includes(label), true);
    }

    const retryEffects = { entropy: 0, sdk: 0 };
    await rejectsFixedChildFailure(createGateBBuyerWallet(root, injectedSdk(
      root,
      { random: 0, index: [] },
      {
        async entropySource() {
          retryEffects.entropy += 1;
          return Buffer.alloc(32);
        },
        async sdkLoader() {
          retryEffects.sdk += 1;
          return deterministicSdk();
        },
      },
    )));
    assert.deepEqual(retryEffects, { entropy: 0, sdk: 0 });
  }
});

test('hardening quarantines both artifacts on entropy throw or zero-byte write', async t => {
  for (const failure of ['entropy', 'zero-write']) {
    const root = await fixture(t);
    const counter = { random: 0, index: [] };
    const effects = { entropy: 0, sdk: 0 };
    const closes = [];
    await rejectsFixedChildFailure(createGateBBuyerWallet(root, injectedSdk(root, counter, {
      decorateDirectoryHandle(handle, label) {
        return wrapHandle(handle, {
          async close() {
            closes.push(label);
            return handle.close();
          },
        });
      },
      decorateFileHandle(handle, label) {
        return wrapHandle(handle, {
          async close() {
            closes.push(label);
            return handle.close();
          },
          async write(...args) {
            if (failure === 'zero-write' && label === 'wallet') {
              return { bytesWritten: 0, buffer: args[0] };
            }
            return handle.write(...args);
          },
        });
      },
      async entropySource(size) {
        effects.entropy += 1;
        if (failure === 'entropy') throw new Error(syntheticSecretCanary());
        return Buffer.alloc(size);
      },
      async sdkLoader() {
        effects.sdk += 1;
        return deterministicSdk(counter);
      },
    })));
    assert.deepEqual(effects, { entropy: 1, sdk: 1 });
    await assertProtectedResidue(root, 'buyer-wallet.json', 0);
    await assertProtectedResidue(root, 'buyer-address.json', 0);
    for (const label of ['wallet', 'address', 'path', 'cwd']) {
      assert.equal(closes.includes(label), true);
    }
  }
});

test('hardening preserves protected residue for prefix-write and file-sync failures on either artifact', async t => {
  const failures = [
    { kind: 'prefix', label: 'wallet' },
    { kind: 'prefix', label: 'address' },
    { kind: 'sync', label: 'wallet' },
    { kind: 'sync', label: 'address' },
  ];
  for (const failure of failures) {
    const root = await fixture(t);
    const counter = { random: 0, index: [] };
    let prefixed = false;
    await rejectsFixedChildFailure(createGateBBuyerWallet(root, injectedSdk(root, counter, {
      decorateFileHandle(handle, label) {
        return wrapHandle(handle, {
          async sync() {
            if (failure.kind === 'sync' && label === failure.label) {
              throw new Error(syntheticSecretCanary());
            }
            return handle.sync();
          },
          async write(bytes, offset, length, position) {
            if (failure.kind !== 'prefix' || label !== failure.label) {
              return handle.write(bytes, offset, length, position);
            }
            if (prefixed) throw new Error(syntheticSecretCanary());
            prefixed = true;
            return handle.write(bytes, offset, Math.min(length, 3), position);
          },
        });
      },
    })));
    const wallet = await assertProtectedResidue(root, 'buyer-wallet.json');
    const address = await assertProtectedResidue(root, 'buyer-address.json');
    assert.equal(wallet.size > 0n || address.size > 0n, true);

    const retry = { entropy: 0, sdk: 0 };
    await rejectsFixedChildFailure(createGateBBuyerWallet(root, injectedSdk(
      root,
      { random: 0, index: [] },
      {
        async entropySource() {
          retry.entropy += 1;
          return Buffer.alloc(32);
        },
        async sdkLoader() {
          retry.sdk += 1;
          return deterministicSdk();
        },
      },
    )));
    assert.deepEqual(retry, { entropy: 0, sdk: 0 });
  }
});

test('hardening treats either final retained-directory sync failure as quarantined', async t => {
  for (const failedLabel of ['path', 'cwd']) {
    const root = await fixture(t);
    const calls = { path: 0, cwd: 0 };
    await rejectsFixedChildFailure(createGateBBuyerWallet(root, injectedSdk(
      root,
      { random: 0, index: [] },
      {
        decorateDirectoryHandle(handle, label) {
          return wrapHandle(handle, {
            async sync() {
              calls[label] += 1;
              if (label === failedLabel && calls[label] === 2) {
                throw new Error(syntheticSecretCanary());
              }
              return handle.sync();
            },
          });
        },
      },
    )));
    assert.deepEqual(calls, { path: 2, cwd: 2 });
    const wallet = await assertProtectedResidue(root, 'buyer-wallet.json');
    const address = await assertProtectedResidue(root, 'buyer-address.json');
    assert.equal(wallet.size > 0n, true);
    assert.equal(address.size > 0n, true);
  }
});

test('hardening rejects post-reservation mode, ACL, symlink, hardlink, generation, and cwd drift before entropy', async t => {
  const scenarios = [
    root => ({ afterReservations: () => chmod(join(root, 'buyer-wallet.json'), 0o644) }),
    root => {
      let rejectAcl = false;
      return {
        afterReservations: async () => { rejectAcl = true; },
        privateWorkspaceInjections: {
          aclInspector: async target => !(rejectAcl && target === './buyer-wallet.json'),
        },
      };
    },
    root => {
      const displaced = join(root, 'displaced-wallet');
      return {
        async afterReservations() {
          await rename(join(root, 'buyer-wallet.json'), displaced);
          await symlink(displaced, join(root, 'buyer-wallet.json'));
        },
      };
    },
    root => ({
      afterReservations: () => link(
        join(root, 'buyer-wallet.json'),
        join(root, 'linked-wallet'),
      ),
    }),
    root => ({
      afterReservations: () => writeFile(
        join(root, 'buyer-wallet.json'),
        'synthetic-prefix',
        { mode: 0o600 },
      ),
    }),
    root => {
      const alternate = join(dirname(root), 'alternate-cwd');
      let reportedCwd = root;
      return {
        async afterReservations() {
          await mkdir(alternate, { mode: 0o700 });
          reportedCwd = alternate;
        },
        privateWorkspaceInjections: {
          actualCwdPath: () => reportedCwd,
        },
      };
    },
  ];
  for (const configure of scenarios) {
    const root = await fixture(t);
    const counter = { random: 0, index: [] };
    const effects = { entropy: 0, sdk: 0 };
    await rejectsFixedChildFailure(createGateBBuyerWallet(root, injectedSdk(root, counter, {
      ...configure(root),
      async entropySource() {
        effects.entropy += 1;
        return Buffer.alloc(32);
      },
      async sdkLoader() {
        effects.sdk += 1;
        return deterministicSdk(counter);
      },
    })));
    assert.deepEqual(effects, { entropy: 0, sdk: 0 });
  }
});

test('hardening permits retry only after retained proof that a first-open failure created no inode', async t => {
  const root = await fixture(t);
  const walletPath = join(root, 'buyer-wallet.json');
  const addressPath = join(root, 'buyer-address.json');
  const effects = { entropy: 0, sdk: 0 };
  const checkedAfterFailure = new Set();
  let firstOpenFailed = false;
  await rejectsFixedChildFailure(createGateBBuyerWallet(root, injectedSdk(
    root,
    { random: 0, index: [] },
    {
      async entropySource() {
        effects.entropy += 1;
        return Buffer.alloc(32);
      },
      async lstatPath(path, ...rest) {
        if (firstOpenFailed && (path === walletPath || path === addressPath)) {
          checkedAfterFailure.add(path);
        }
        return lstat(path, ...rest);
      },
      async openPath(path, ...rest) {
        if (!firstOpenFailed && path === walletPath) {
          firstOpenFailed = true;
          throw Object.assign(new Error(syntheticSecretCanary()), { code: 'EACCES' });
        }
        return open(path, ...rest);
      },
      async sdkLoader() {
        effects.sdk += 1;
        return deterministicSdk();
      },
    },
  )));
  assert.deepEqual(effects, { entropy: 0, sdk: 0 });
  assert.equal(checkedAfterFailure.has(walletPath), true);
  assert.equal(checkedAfterFailure.has(addressPath), true);
  assert.equal(await exists(walletPath), false);
  assert.equal(await exists(addressPath), false);

  const retryCounter = { random: 0, index: [] };
  assert.deepEqual(
    await createGateBBuyerWallet(root, injectedSdk(root, retryCounter)),
    { status: 'created' },
  );
  assert.equal(retryCounter.random, 1);
});

test('hardening retains ambiguous or inode-present reservation failures and permanently refuses retry', async t => {
  for (const failure of ['post-open-throw', 'post-open-decoration']) {
    const root = await fixture(t);
    const walletPath = join(root, 'buyer-wallet.json');
    const effects = { entropy: 0, sdk: 0 };
    const changes = {
      async entropySource() {
        effects.entropy += 1;
        return Buffer.alloc(32);
      },
      async sdkLoader() {
        effects.sdk += 1;
        return deterministicSdk();
      },
    };
    if (failure === 'post-open-throw') {
      changes.openPath = async (path, ...rest) => {
        const handle = await open(path, ...rest);
        if (path !== walletPath) return handle;
        await handle.close();
        throw new Error(syntheticSecretCanary());
      };
    } else {
      changes.decorateFileHandle = (handle, label) => {
        if (label === 'wallet') throw new Error(syntheticSecretCanary());
        return handle;
      };
    }
    await rejectsFixedChildFailure(createGateBBuyerWallet(
      root,
      injectedSdk(root, { random: 0, index: [] }, changes),
    ));
    assert.deepEqual(effects, { entropy: 0, sdk: 0 });
    await assertProtectedResidue(root, 'buyer-wallet.json', 0);

    const retry = { entropy: 0, sdk: 0 };
    await rejectsFixedChildFailure(createGateBBuyerWallet(root, injectedSdk(
      root,
      { random: 0, index: [] },
      {
        async entropySource() {
          retry.entropy += 1;
          return Buffer.alloc(32);
        },
        async sdkLoader() {
          retry.sdk += 1;
          return deterministicSdk();
        },
      },
    )));
    assert.deepEqual(retry, { entropy: 0, sdk: 0 });
  }
});

test('hardening source and documentation retain chain-neutral and threat-boundary nonclaims', async () => {
  const [childSource, supervisorSource, readme, security, plan] = await Promise.all([
    readFile(new URL('../src/gate-b-buyer-wallet-child.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/gate-b-buyer-wallet-supervisor.js', import.meta.url), 'utf8'),
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../SECURITY.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/IMPLEMENTATION_PLAN.md', import.meta.url), 'utf8'),
  ]);
  assert.equal(childSource.includes('openGateBPublicWsPrivateWorkspace'), true);
  assert.equal(childSource.includes("from 'node:crypto'"), true);
  assert.equal(childSource.includes('fromEntropy'), true);
  assert.equal(childSource.includes('newRandom'), false);
  for (const source of [childSource, supervisorSource]) {
    for (const token of [
      'node:http', 'node:https', 'node:net', 'node:dns', 'fetch(', 'WebSocket',
      'initialize(', 'publishRawTransaction', 'sendTransaction', 'testnet', 'mainnet',
    ]) {
      assert.equal(source.includes(token), false);
    }
  }
  for (const document of [readme, security, plan]) {
    assert.equal(document.includes('conclusively pre-effect'), true);
    assert.equal(document.includes('both fixed leaves are rechecked absent'), true);
    assert.match(document, /generic failure (?:line|result)/);
    assert.match(
      document,
      /(?:not|do not provide) all-or-nothing file-content atomicity/,
    );
    assert.equal(document.includes('hostile same-UID'), true);
    assert.equal(document.includes('kernel-unreapable process'), true);
    assert.equal(document.includes('backup and synchronization services'), true);
    assert.match(
      document,
      /cryptographically public(?: data)? but (?:remains )?operationally private and linkable/,
    );
    assert.equal(document.includes('chain-neutral'), true);
  }
});
