import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync as nodeSpawnSync } from 'node:child_process';

const nativeDirectory = fileURLToPath(new URL('../native/provider-attestor/', import.meta.url));
const fakeSource = join(nativeDirectory, 'tests/disposable_token_bootstrap_fd_fake_main.c');
const ignoredSIGCHLDLauncherSource = join(nativeDirectory,
  'tests/ignored_sigchld_launcher_main.c');

function sanitizedBootstrapFailure(category) {
  const error = new Error(category);
  error.stack = category;
  return error;
}

function test(name, callback) {
  return nodeTest(name, async t => {
    try { return await callback(t); } catch {
      throw sanitizedBootstrapFailure(`synthetic collector case failed: ${name}`);
    }
  });
}

function macOnlyTest(name, callback) {
  return test(name, t => {
    if (process.platform !== 'darwin') {
      t.skip('native provider attestor GUI harness is macOS-only');
      return;
    }
    return callback(t);
  });
}

function spawnSync(...args) {
  try {
    const result = nodeSpawnSync(...args);
    if (result === null || result === undefined || result.error !== undefined) {
      throw sanitizedBootstrapFailure('synthetic collector fixture spawn failed');
    }
    return result;
  } catch {
    throw sanitizedBootstrapFailure('synthetic collector fixture spawn failed');
  }
}

function samePrivateDirectory(observed, expected) {
  return observed.isDirectory() && !observed.isSymbolicLink()
    && observed.uid === process.getuid() && (observed.mode & 0o7777) === 0o700
    && observed.dev === expected.dev && observed.ino === expected.ino;
}

function assertFixedCollectorResult(result, code, status) {
  if (result?.code !== code || result.stdout !== status || result.stderr !== '') {
    throw sanitizedBootstrapFailure('synthetic collector response mismatch');
  }
}

function pinnedDigest(path) {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}

function fixture(t, mode = 0) {
  const directory = mkdtempSync('/private/tmp/pa-bootstrap-collector-offline-');
  const createdDirectory = lstatSync(directory);
  const tag = randomBytes(8).toString('hex');
  const root = `/private/tmp/ProviderAttestorSyntheticBootstrap-${tag}`;
  assert.equal(existsSync(root), false, 'synthetic root collision');
  let createdRoot = null;
  t.after(() => {
    try {
      if (createdRoot !== null) {
        if (!samePrivateDirectory(lstatSync(root), createdRoot)) {
          throw sanitizedBootstrapFailure('synthetic collector cleanup failed');
        }
        rmSync(root, { recursive: true });
      }
      if (!samePrivateDirectory(lstatSync(directory), createdDirectory)) {
        throw sanitizedBootstrapFailure('synthetic collector cleanup failed');
      }
      rmSync(directory, { recursive: true });
    } catch {
      throw sanitizedBootstrapFailure('synthetic collector cleanup failed');
    }
  });
  const claimCreatedRoot = () => {
    const current = lstatSync(root);
    assert.ok(current.isDirectory() && !current.isSymbolicLink()
      && current.uid === process.getuid() && (current.mode & 0o7777) === 0o700,
    'synthetic root ownership failed');
    createdRoot = { dev: current.dev, ino: current.ino };
  };
  const fake = join(directory, 'synthetic-bootstrap');
  const module = join(directory, 'synthetic-module');
  const compiled = spawnSync('/usr/bin/xcrun', [
    '--sdk', 'macosx', 'clang', '-std=c11', '-Wall', '-Wextra', '-Werror',
    '-DPA_TESTING=1', '-DPA_GUI_BOOTSTRAP_OFFLINE_TEST=1',
    `-DPA_FAKE_BOOTSTRAP_MODE=${mode}`, fakeSource, '-o', fake,
  ], { encoding: 'utf8' });
  assert.equal(compiled.status, 0, 'offline fixture compile failed');
  writeFileSync(module, 'synthetic non-module bytes', { mode: 0o600, flag: 'wx' });
  const pins = join(directory, 'synthetic-pins.h');
  const definitions = {
    PA_GUI_BOOTSTRAP_EXECUTABLE_PATH: fake,
    PA_GUI_BOOTSTRAP_EXECUTABLE_SHA256: pinnedDigest(fake),
    PA_GUI_BOOTSTRAP_MODULE_PATH: module,
    PA_GUI_BOOTSTRAP_MODULE_SHA256: pinnedDigest(module),
    PA_GUI_BOOTSTRAP_ROOT_TAG: tag,
  };
  writeFileSync(pins, Object.entries(definitions)
    .map(([name, value]) => `#define ${name} ${JSON.stringify(value)}\n`).join(''),
  { mode: 0o600, flag: 'wx' });
  const build = join(directory, 'build');
  const made = spawnSync('/usr/bin/make', [
    '-C', nativeDirectory, 'disposable-token-bootstrap-synthetic-gui-fake-ui-test',
    `BUILD_DIR=${build}`, `BOOTSTRAP_GUI_PINS_HEADER=${pins}`,
  ], { encoding: 'utf8' });
  assert.equal(made.status, 0, 'offline collector compile failed');
  return { directory, fake, module, pins, build, root, claimCreatedRoot, executable: join(build,
    'provider-attestor-disposable-token-bootstrap-synthetic-gui-fake-ui-test') };
}

function compileIgnoredSIGCHLDLauncher(directory, mode) {
  const launcher = join(directory, `synthetic-sigchld-launcher-${mode}`);
  const compiled = spawnSync('/usr/bin/xcrun', [
    '--sdk', 'macosx', 'clang', '-std=c11', '-Wall', '-Wextra', '-Werror',
    '-DPA_TESTING=1', '-DPA_GUI_BOOTSTRAP_OFFLINE_TEST=1',
    `-DPA_IGNORED_SIGCHLD_MODE=${mode}`,
    ignoredSIGCHLDLauncherSource, '-o', launcher,
  ], { encoding: 'utf8' });
  assert.equal(compiled.status, 0, 'offline SIGCHLD launcher compile failed');
  return launcher;
}

function invoke(executable, pinBytes, launcher = null) {
  return new Promise((resolve, reject) => {
    let child;
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      try { child?.kill('SIGKILL'); } catch {}
      reject(sanitizedBootstrapFailure('synthetic collector child spawn failed'));
    };
    try {
      child = spawn(launcher ?? executable, launcher === null ? [] : [executable], {
        env: {}, stdio: ['ignore', 'pipe', 'pipe', 'ignore', 'ignore', 'ignore', 'pipe'],
      });
    } catch { fail(); return; }
    const stdout = [];
    const stderr = [];
    try {
      child.on('error', fail);
      child.stdout.on('error', fail);
      child.stderr.on('error', fail);
      child.stdio[6].on('error', fail);
      child.stdout.on('data', data => stdout.push(data));
      child.stderr.on('data', data => stderr.push(data));
      child.on('close', (code, signal) => {
        if (settled) return;
        try {
          const result = {
            code, signal, stdout: Buffer.concat(stdout).toString('utf8'),
            stderr: Buffer.concat(stderr).toString('utf8'),
          };
          settled = true;
          resolve(result);
        } catch { fail(); }
      });
      child.stdio[6].end(pinBytes);
    } catch { fail(); }
  });
}

const validSyntheticPIN = () => Buffer.alloc(16, 49);

test('synthetic collector child spawn failure exposes only a fixed category', async () => {
  await assert.rejects(
    invoke('/nonexistent/synthetic-bootstrap-child', Buffer.alloc(0)),
    error => error?.message === 'synthetic collector child spawn failed'
      && error.stack === 'synthetic collector child spawn failed',
  );
  assert.throws(() => spawnSync('/nonexistent/synthetic-compiler', [], {
    encoding: 'utf8',
  }), error => error?.message === 'synthetic collector fixture spawn failed'
    && error.stack === 'synthetic collector fixture spawn failed');
  assert.throws(() => assertFixedCollectorResult({
    code: 0, stdout: 'synthetic private output', stderr: 'synthetic private diagnostic',
  }, 0, 'BOOTSTRAP_GUI=PASS\n'),
  error => error?.message === 'synthetic collector response mismatch'
    && error.stack === 'synthetic collector response mismatch');
});

macOnlyTest('synthetic collector cancels and refuses malformed PIN before root creation', async t => {
  const target = fixture(t);
  for (const [input, status] of [
    [Buffer.alloc(0), 'BOOTSTRAP_GUI=CANCELLED\n'],
    [Buffer.alloc(15, 49), 'BOOTSTRAP_GUI=REFUSED\n'],
    [Buffer.alloc(16, 65), 'BOOTSTRAP_GUI=REFUSED\n'],
    [Buffer.alloc(17, 49), 'BOOTSTRAP_GUI=REFUSED\n'],
  ]) {
    const run = await invoke(target.executable, input);
    assertFixedCollectorResult(run, 3, status);
    assert.equal(run.signal, null);
    assert.equal(existsSync(target.root), false);
  }
});

macOnlyTest('synthetic collector accepts exact one-shot FD5/FD4 and refuses replay', async t => {
  const target = fixture(t);
  const first = await invoke(target.executable, validSyntheticPIN());
  assertFixedCollectorResult(first, 0, 'BOOTSTRAP_GUI=PASS\n');
  target.claimCreatedRoot();
  const metadata = join(target.root, 'bootstrap-metadata.bin');
  assert.equal(statSync(metadata).size, 64);
  assert.equal(statSync(target.root).mode & 0o7777, 0o700);
  assert.equal(statSync(metadata).mode & 0o7777, 0o600);
  const replay = await invoke(target.executable, validSyntheticPIN());
  assertFixedCollectorResult(replay, 3, 'BOOTSTRAP_GUI=REFUSED\n');
  assert.equal(statSync(metadata).size, 64);
});

for (const [mode, label] of [[1, 'ignored'], [2, 'no-cldwait']]) {
  macOnlyTest(`synthetic collector restores waitable SIGCHLD after inherited ${label} disposition`, async t => {
    const target = fixture(t);
    const launcher = compileIgnoredSIGCHLDLauncher(target.directory, mode);
    const first = await invoke(target.executable, validSyntheticPIN(), launcher);
    assertFixedCollectorResult(first, 0, 'BOOTSTRAP_GUI=PASS\n');
    target.claimCreatedRoot();
    const replay = await invoke(target.executable, validSyntheticPIN(), launcher);
    assertFixedCollectorResult(replay, 3, 'BOOTSTRAP_GUI=REFUSED\n');
  });

  macOnlyTest(`synthetic timeout under inherited ${label} disposition preserves root and witness`, async t => {
    const target = fixture(t, 4);
    const launcher = compileIgnoredSIGCHLDLauncher(target.directory, mode);
    let witness;
    try {
      witness = spawn('/bin/sleep', ['5'], { stdio: 'ignore', env: {} });
      witness.on('error', () => {});
    } catch { throw sanitizedBootstrapFailure('synthetic witness spawn failed'); }
    try {
      const first = await invoke(target.executable, validSyntheticPIN(), launcher);
      assertFixedCollectorResult(first, 3, 'BOOTSTRAP_GUI=UNKNOWN\n');
      target.claimCreatedRoot();
      assert.doesNotThrow(() => process.kill(witness.pid, 0),
        'collector must not signal an unrelated live process');
      const replay = await invoke(target.executable, validSyntheticPIN(), launcher);
      assertFixedCollectorResult(replay, 3, 'BOOTSTRAP_GUI=REFUSED\n');
    } finally {
      witness.kill('SIGTERM');
    }
  });
}

for (const [mode, label] of [[1, 'short'], [2, 'extra'], [3, 'failure'],
  [4, 'timeout'], [5, 'nonzero exit after complete FD4']]) {
  macOnlyTest(`synthetic collector preserves one-shot root on ${label} child outcome`, async t => {
    const target = fixture(t, mode);
    const first = await invoke(target.executable, validSyntheticPIN());
    assertFixedCollectorResult(first, 3, 'BOOTSTRAP_GUI=UNKNOWN\n');
    target.claimCreatedRoot();
    assert.equal(existsSync(target.root), true);
    assert.equal(existsSync(join(target.root, 'bootstrap-metadata.bin')), false);
    const second = await invoke(target.executable, validSyntheticPIN());
    assertFixedCollectorResult(second, 3, 'BOOTSTRAP_GUI=REFUSED\n');
  });
}

macOnlyTest('synthetic collector refuses wrong fixed image digest before PIN input', async t => {
  const target = fixture(t);
  writeFileSync(target.module, 'changed synthetic module bytes');
  const run = await invoke(target.executable, validSyntheticPIN());
  assertFixedCollectorResult(run, 3, 'BOOTSTRAP_GUI=REFUSED\n');
  assert.equal(existsSync(target.root), false);
});

macOnlyTest('synthetic collector refuses wrong fixed executable digest before PIN input', async t => {
  const target = fixture(t);
  writeFileSync(target.fake, 'changed synthetic executable bytes');
  const run = await invoke(target.executable, validSyntheticPIN());
  assertFixedCollectorResult(run, 3, 'BOOTSTRAP_GUI=REFUSED\n');
  assert.equal(existsSync(target.root), false);
});

macOnlyTest('synthetic collector refuses an extended ACL on a pinned-image ancestor', async t => {
  const target = fixture(t);
  const marked = spawnSync('/bin/chmod', ['+a', 'everyone allow read', target.directory], {
    env: {}, encoding: 'utf8',
  });
  assert.equal(marked.status, 0, 'synthetic ACL fixture creation failed');
  const run = await invoke(target.executable, validSyntheticPIN());
  assertFixedCollectorResult(run, 3, 'BOOTSTRAP_GUI=REFUSED\n');
  assert.equal(existsSync(target.root), false);
});

macOnlyTest('real AppKit collector compiles with synthetic pins but is never launched', t => {
  const target = fixture(t);
  const built = spawnSync('/usr/bin/make', [
    '-C', nativeDirectory, 'disposable-token-bootstrap-synthetic-gui',
    `BUILD_DIR=${target.build}`, `BOOTSTRAP_GUI_PINS_HEADER=${target.pins}`,
  ], { encoding: 'utf8' });
  assert.equal(built.status, 0, 'manual collector compile failed');
  const missingPins = spawnSync('/usr/bin/make', [
    '-C', nativeDirectory, 'disposable-token-bootstrap-synthetic-gui',
    `BUILD_DIR=${target.build}`,
  ], { encoding: 'utf8' });
  assert.notEqual(missingPins.status, 0, 'cached binary must not bypass required pin header');
});
