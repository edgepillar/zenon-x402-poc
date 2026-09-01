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
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import { parsePublicWsOnceRoleInput } from '../src/live-evidence-runner.js';

const TEST_ENTROPY = '00'.repeat(32);

async function fixture(t) {
  const temporary = await mkdtemp(join(tmpdir(), 'gate-b-wallet-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = await realpath(temporary);
  await chmod(root, 0o700);
  return root;
}

function deterministicSdk(counter = { random: 0, index: [] }) {
  return {
    KeyStore: {
      newRandom() {
        counter.random += 1;
        const wallet = sdk.KeyStore.fromEntropy(TEST_ENTROPY);
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

function injectedSdk(counter, changes = {}) {
  return {
    sdkLoader: async () => deterministicSdk(counter),
    aclInspector: async () => true,
    ...changes,
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
    this.stdio = [null, null, null, null, this.bootstrap];
    this.kills = [];
  }

  send(message, callback) {
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
    captured.push({ modulePath, argv, options });
    const child = new FakeChild((current, message) => {
      if (message.type !== 'CREATE') return;
      queueMicrotask(() => {
        current.emit('message', { ipcVersion: 1, requestId: 1, type: 'CREATED' });
        current.emit('exit', 0, null);
        current.emit('close', 0, null);
      });
    });
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
  const result = await superviseGateBBuyerWalletChild(root, {
    forkProcess: successfulFork(captured),
    childModule,
    timeoutMs: 1000,
  });
  assert.deepEqual(result, { status: 'created' });
  assert.equal(captured.length, 1);
  assert.deepEqual(captured[0].argv, []);
  assert.deepEqual(captured[0].options.env, {});
  assert.deepEqual(captured[0].options.execArgv, []);
  assert.equal(captured[0].options.shell, false);
  assert.deepEqual(captured[0].options.stdio, ['ignore', 'ignore', 'ignore', 'ipc', 'pipe']);
  assert.equal(captured[0].options.cwd, join(root, 'fixed'));
  assert.equal(captured[0].options.cwd === root, false);
});

test('real OS fork validates fd-4 bootstrap, empty requested env, IPC, and clean exit without a wallet', async t => {
  const root = await fixture(t);
  const result = await superviseGateBBuyerWalletChild(root, {
    childModule: fileURLToPath(new URL(
      '../test-support/gate-b-wallet-supervisor-child.js',
      import.meta.url,
    )),
    timeoutMs: 2000,
  });
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
      superviseGateBBuyerWalletChild(root, {
        forkProcess: () => child,
        childModule,
        timeoutMs: 100,
      }),
      /gate_b_buyer_wallet_supervisor_failed/,
    );
  }
  const child = new FakeChild();
  await assert.rejects(
    superviseGateBBuyerWalletChild(root, {
      forkProcess: () => child,
      childModule,
      timeoutMs: 5,
    }),
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
    superviseGateBBuyerWalletChild(root, {
      forkProcess: () => forceClosed,
      childModule,
      timeoutMs: 5,
    }),
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
    superviseGateBBuyerWalletChild(root, {
      forkProcess: () => neverClosed,
      childModule,
      timeoutMs: 5,
    }),
    /gate_b_buyer_wallet_supervisor_failed/,
  );
  assert.deepEqual(neverClosed.kills, ['SIGTERM', 'SIGKILL']);
  assert.equal(Date.now() - started < 3000, true);
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
  const result = await createGateBBuyerWallet(root, injectedSdk(counter));
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

test('creation reserves and verifies both files before invoking randomness', async t => {
  const root = await fixture(t);
  const counter = { random: 0, index: [] };
  let observed = false;
  await createGateBBuyerWallet(root, injectedSdk(counter, {
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
  await createGateBBuyerWallet(root, injectedSdk(counter, {
    async aclInspector(_handle, expectedMode) {
      observed.push(expectedMode);
      return true;
    },
  }));
  assert.equal(observed.includes('drwx------'), true);
  assert.equal(observed.includes('-rw-------'), true);
  assert.equal(counter.random, 1);

  const rejected = join(root, 'acl-rejected');
  await mkdir(rejected, { mode: 0o700 });
  const rejectedCounter = { random: 0, index: [] };
  await assert.rejects(createGateBBuyerWallet(rejected, injectedSdk(rejectedCounter, {
    async aclInspector() { return false; },
  })), /gate_b_buyer_wallet_child_failed/);
  assert.equal(rejectedCounter.random, 0);
});

test('Darwin default ACL inspection accepts a clean deterministic workspace', async t => {
  if (process.platform !== 'darwin') return t.skip('Darwin-only ACL boundary');
  const root = await fixture(t);
  const counter = { random: 0, index: [] };
  await createGateBBuyerWallet(root, {
    sdkLoader: async () => deterministicSdk(counter),
  });
  assert.equal(counter.random, 1);
});

test('Darwin default ACL inspection rejects an actual ACL before SDK randomness', async t => {
  if (process.platform !== 'darwin') return t.skip('Darwin-only ACL boundary');
  const parent = await fixture(t);
  const root = join(parent, 'acl-present');
  await mkdir(root, { mode: 0o700 });
  assert.deepEqual(
    await runSilent('/bin/chmod', ['+a', 'everyone deny delete', root]),
    { code: 0, signal: null },
  );
  try {
    const counter = { random: 0, index: [] };
    await assert.rejects(createGateBBuyerWallet(root, {
      sdkLoader: async () => deterministicSdk(counter),
    }), /gate_b_buyer_wallet_child_failed/);
    assert.equal(counter.random, 0);
  } finally {
    assert.deepEqual(
      await runSilent('/bin/chmod', ['-N', root]),
      { code: 0, signal: null },
    );
  }
});

test('full-write loops and all file and directory sync barriers are exercised', async t => {
  const root = await fixture(t);
  const syncs = [];
  await createGateBBuyerWallet(root, injectedSdk({ random: 0, index: [] }, {
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
  assert.deepEqual(syncs, ['wallet', 'address', 'directory']);
});

test('unsafe workspace mode, ownership, canonical aliases, symlinks, and Git containment fail before RNG', async t => {
  const parent = await fixture(t);
  const cases = [];

  const unsafeMode = join(parent, 'unsafe-mode');
  await mkdir(unsafeMode, { mode: 0o700 });
  await chmod(unsafeMode, 0o755);
  cases.push({ root: unsafeMode, injected: {} });

  const ownerMismatch = join(parent, 'owner-mismatch');
  await mkdir(ownerMismatch, { mode: 0o700 });
  cases.push({ root: ownerMismatch, injected: {
    getuid: () => (typeof process.getuid === 'function' ? process.getuid() + 1 : 1),
  } });

  const canonical = join(parent, 'canonical');
  await mkdir(canonical, { mode: 0o700 });
  cases.push({ root: `${canonical}/../canonical`, injected: {} });

  const symlinkTarget = join(parent, 'symlink-target');
  const symlinkRoot = join(parent, 'symlink-root');
  await mkdir(symlinkTarget, { mode: 0o700 });
  await symlink(symlinkTarget, symlinkRoot);
  cases.push({ root: symlinkRoot, injected: {} });

  const gitParent = join(parent, 'git-parent');
  const gitChild = join(gitParent, 'private');
  await mkdir(join(gitParent, '.git'), { recursive: true, mode: 0o700 });
  await mkdir(gitChild, { mode: 0o700 });
  cases.push({ root: gitChild, injected: {} });

  for (const entry of cases) {
    const counter = { random: 0, index: [] };
    await assert.rejects(
      createGateBBuyerWallet(entry.root, injectedSdk(counter, entry.injected)),
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
    const root = join(parent, `existing-${index}`);
    await mkdir(root, { mode: 0o700 });
    await setups[index](root);
    const counter = { random: 0, index: [] };
    await assert.rejects(
      createGateBBuyerWallet(root, injectedSdk(counter)),
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
    createGateBBuyerWallet(root, injectedSdk(counter, {
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
    createGateBBuyerWallet(root, injectedSdk(counter)),
    /gate_b_buyer_wallet_child_failed/,
  );
  assert.equal(counter.random, 0);
});

test('write and sync failures preserve owner-only residue and block retries', async t => {
  const parent = await fixture(t);
  for (const failure of ['address-write', 'directory-sync']) {
    const root = join(parent, failure);
    await mkdir(root, { mode: 0o700 });
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
      createGateBBuyerWallet(root, injectedSdk({ random: 0, index: [] }, changes)),
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
      createGateBBuyerWallet(root, injectedSdk(retryCounter)),
      /gate_b_buyer_wallet_child_failed/,
    );
    assert.equal(retryCounter.random, 0);
  }
});

test('workspace replacement after reservation fails before RNG and preserves crash residue', async t => {
  const parent = await fixture(t);
  const root = join(parent, 'workspace');
  const moved = join(parent, 'moved-workspace');
  await mkdir(root, { mode: 0o700 });
  const counter = { random: 0, index: [] };
  await assert.rejects(
    createGateBBuyerWallet(root, injectedSdk(counter, {
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
    createGateBBuyerWallet(root, injectedSdk({ random: 0, index: [] }, {
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
    createGateBBuyerWallet(root, injectedSdk({ random: 0, index: [] }, {
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
