import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  attestPublicWsOnceSourceTree,
  PUBLIC_WS_SOURCE_ATTESTATION_LIMITS,
} from '../src/public-ws-source-attestation.js';

const REVISION = 'b'.repeat(40);
const GIT_ENVIRONMENT_KEYS = [
  'GIT_ATTR_NOSYSTEM',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_NOSYSTEM',
  'GIT_NO_LAZY_FETCH',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_OPTIONAL_LOCKS',
  'GIT_PAGER',
  'GIT_PROTOCOL_FROM_USER',
  'GIT_TERMINAL_PROMPT',
  'LANG',
  'LC_ALL',
].sort();

function blobOid(bytes, algorithm = 'sha1') {
  return createHash(algorithm)
    .update(Buffer.from(`blob ${bytes.length}\0`, 'utf8'))
    .update(bytes)
    .digest('hex');
}

function record(mode, oid, path) {
  return Buffer.from(`${mode} blob ${oid}\t${path}\0`, 'utf8');
}

function manifest(entries) {
  return Buffer.concat(entries.map(entry => record(entry.mode, entry.oid, entry.path)));
}

async function sourceFixture(t) {
  const temporary = await mkdtemp(join(tmpdir(), 'public-ws-source-attestation-'));
  const root = await realpath(temporary);
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  await mkdir(join(root, 'src'), { mode: 0o755 });
  const files = [
    {
      path: '.gitattributes',
      mode: '100644',
      bytes: Buffer.from('*.js filter=forbidden -text\n', 'utf8'),
    },
    {
      path: 'package.json',
      mode: '100644',
      bytes: Buffer.from('{"type":"module"}\n', 'utf8'),
    },
    {
      path: 'src/entry.js',
      mode: '100644',
      bytes: Buffer.from('export const value = 1;\n', 'utf8'),
    },
  ];
  for (const file of files) {
    const path = join(root, ...file.path.split('/'));
    await writeFile(path, file.bytes, { mode: 0o600 });
    await chmod(path, file.mode === '100755' ? 0o755 : 0o644);
    file.oid = blobOid(file.bytes);
  }
  return { root, files, manifest: manifest(files), revision: REVISION };
}

function snapshotGitRunner(fixture, changes = {}) {
  const calls = [];
  let forbiddenHelperInvoked = false;
  const runner = (executable, args, options) => {
    assert.equal(executable, '/usr/bin/git');
    assert.deepEqual(args.slice(0, 10), [
      '--no-pager',
      '--no-optional-locks',
      '-c', 'color.ui=false',
      '-c', 'core.fsmonitor=false',
      '-c', 'core.untrackedCache=false',
      '-C', fixture.root,
    ]);
    assert.equal(options.shell, false);
    assert.deepEqual(options.stdio, ['ignore', 'pipe', 'ignore']);
    assert.equal(options.encoding, null);
    assert.equal(options.input, undefined);
    assert.equal(options.killSignal, 'SIGKILL');
    assert.equal(options.windowsHide, true);
    assert.deepEqual(Object.keys(options.env).sort(), GIT_ENVIRONMENT_KEYS);
    assert.equal(options.env.GIT_CONFIG_GLOBAL, '/dev/null');
    assert.equal(options.env.GIT_CONFIG_NOSYSTEM, '1');
    assert.equal(options.env.GIT_NO_LAZY_FETCH, '1');
    assert.equal(options.env.GIT_NO_REPLACE_OBJECTS, '1');
    assert.equal(options.env.GIT_PROTOCOL_FROM_USER, '0');
    const command = args.slice(10).join(' ');
    calls.push(command);
    if (command.includes('status') || command.includes('diff') ||
        command.includes('hash-object') || command.includes('cat-file') ||
        command.includes('checkout')) {
      forbiddenHelperInvoked = true;
      throw new Error('forbidden private filter helper');
    }
    if (changes.missing === command ||
        (changes.detached === true && command === 'symbolic-ref --quiet HEAD')) {
      return {
        status: 1,
        signal: null,
        stdout: Buffer.from('private Git diagnostic path\n', 'utf8'),
      };
    }
    let output;
    if (command === 'rev-parse --show-toplevel') output = `${fixture.root}\n`;
    else if (command === 'symbolic-ref --quiet HEAD') {
      output = `refs/heads/${changes.branch ?? 'main'}\n`;
    } else if (command === 'rev-parse --verify HEAD^{commit}') {
      output = `${changes.head ?? fixture.revision}\n`;
    } else if (command === 'rev-parse --verify refs/heads/main^{commit}') {
      output = `${changes.main ?? fixture.revision}\n`;
    } else if (command === 'rev-parse --verify refs/remotes/origin/main^{commit}') {
      output = `${changes.tracking ?? fixture.revision}\n`;
    } else if (command === `ls-tree -r -z --full-tree ${changes.head ?? fixture.revision}`) {
      assert.equal(options.maxBuffer, PUBLIC_WS_SOURCE_ATTESTATION_LIMITS.manifestBytes);
      output = changes.manifest ?? fixture.manifest;
    } else {
      throw new Error('unexpected Git command');
    }
    const stdout = Buffer.isBuffer(output)
      ? Buffer.from(output)
      : Buffer.from(output, 'utf8');
    return { status: 0, signal: null, stdout };
  };
  return {
    runner,
    calls,
    get forbiddenHelperInvoked() { return forbiddenHelperInvoked; },
  };
}

function fixedFailure(error) {
  return error?.code === 'public_ws_source_attestation_invalid' &&
    error?.cause === undefined &&
    error?.stack ===
      'PublicWsSourceAttestationError: public_ws_source_attestation_invalid';
}

function runFixtureGit(args, capture = false) {
  const result = spawnSync('/usr/bin/git', args, {
    encoding: null,
    env: {
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
      HOME: '/dev/null',
      LANG: 'C',
      LC_ALL: 'C',
      PATH: '/usr/bin:/bin',
    },
    maxBuffer: 64 * 1024,
    shell: false,
    stdio: ['ignore', capture ? 'pipe' : 'ignore', 'ignore'],
    timeout: 5000,
  });
  if (result.status !== 0 || result.signal !== null || result.error !== undefined ||
      (capture && !Buffer.isBuffer(result.stdout))) {
    throw new Error('fixture_git_failed');
  }
  return capture ? result.stdout : undefined;
}

async function realGitFixture(t) {
  const temporary = await mkdtemp(join(tmpdir(), 'public-ws-source-real-git-'));
  const root = await realpath(temporary);
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  await mkdir(join(root, 'src'), { mode: 0o755 });
  await writeFile(join(root, '.gitattributes'), '*.js filter=forbidden -text\n', { mode: 0o600 });
  await writeFile(join(root, 'package.json'), '{"type":"module"}\n', { mode: 0o600 });
  await writeFile(join(root, 'src', 'entry.js'), 'export const value = 1;\n', { mode: 0o600 });
  for (const path of ['.gitattributes', 'package.json', 'src/entry.js']) {
    await chmod(join(root, ...path.split('/')), 0o644);
  }
  runFixtureGit(['init', '--initial-branch=main', root]);
  runFixtureGit(['-C', root, 'add', '--', '.gitattributes', 'package.json', 'src/entry.js']);
  runFixtureGit([
    '-C', root,
    '-c', 'user.name=source-attestation-fixture',
    '-c', 'user.email=source-attestation@example.invalid',
    '-c', 'commit.gpgsign=false',
    'commit', '-m', 'fixture',
  ]);
  runFixtureGit(['-C', root, 'update-ref', 'refs/remotes/origin/main', 'HEAD']);
  const revisionBytes = runFixtureGit(['-C', root, 'rev-parse', '--verify', 'HEAD'], true);
  const revision = revisionBytes.subarray(0, revisionBytes.length - 1).toString('ascii');
  revisionBytes.fill(0);
  return { root, revision };
}

async function attest(fixture, changes) {
  const git = snapshotGitRunner(fixture, changes);
  const result = await attestPublicWsOnceSourceTree(fixture.revision, {
    gitRunner: git.runner,
    repositoryRoot: fixture.root,
  });
  return { result, git };
}

test('raw attestation ignores repo filter declarations and invokes only bounded plumbing', async t => {
  const fixture = await sourceFixture(t);
  await mkdir(join(fixture.root, '.git'), { mode: 0o755 });
  await writeFile(
    join(fixture.root, '.git', 'config'),
    '[filter "forbidden"]\n\tclean = private-filter-helper\n\tsmudge = private-filter-helper\n',
    { mode: 0o600 },
  );
  const { result, git } = await attest(fixture);
  assert.equal(result, true);
  assert.equal(git.forbiddenHelperInvoked, false);
  assert.deepEqual(git.calls, [
    'rev-parse --show-toplevel',
    'symbolic-ref --quiet HEAD',
    'rev-parse --verify HEAD^{commit}',
    'rev-parse --verify refs/heads/main^{commit}',
    'rev-parse --verify refs/remotes/origin/main^{commit}',
    `ls-tree -r -z --full-tree ${fixture.revision}`,
    'symbolic-ref --quiet HEAD',
    'rev-parse --verify HEAD^{commit}',
    'rev-parse --verify refs/heads/main^{commit}',
    'rev-parse --verify refs/remotes/origin/main^{commit}',
  ]);
});

test('real Git local filter configuration is never executed by raw attestation', async t => {
  const fixture = await realGitFixture(t);
  runFixtureGit([
    '-C', fixture.root, 'config', '--local', 'filter.forbidden.clean', '/usr/bin/false',
  ]);
  runFixtureGit([
    '-C', fixture.root, 'config', '--local', 'filter.forbidden.smudge', '/usr/bin/false',
  ]);
  runFixtureGit([
    '-C', fixture.root, 'config', '--local', 'filter.forbidden.required', 'true',
  ]);
  assert.equal(await attestPublicWsOnceSourceTree(fixture.revision, {
    repositoryRoot: fixture.root,
  }), true);
});

test('real Git assume-unchanged and skip-worktree flags cannot hide raw-byte drift', async t => {
  const fixture = await realGitFixture(t);
  const path = join(fixture.root, 'src', 'entry.js');
  runFixtureGit(['-C', fixture.root, 'update-index', '--assume-unchanged', 'src/entry.js']);
  await writeFile(path, 'export const value = 2;\n');
  await chmod(path, 0o644);
  await assert.rejects(attestPublicWsOnceSourceTree(fixture.revision, {
    repositoryRoot: fixture.root,
  }), fixedFailure);

  await writeFile(path, 'export const value = 1;\n');
  await chmod(path, 0o644);
  runFixtureGit(['-C', fixture.root, 'update-index', '--no-assume-unchanged', 'src/entry.js']);
  runFixtureGit(['-C', fixture.root, 'update-index', '--skip-worktree', 'src/entry.js']);
  await writeFile(path, 'export const value = 3;\n');
  await chmod(path, 0o644);
  await assert.rejects(attestPublicWsOnceSourceTree(fixture.revision, {
    repositoryRoot: fixture.root,
  }), fixedFailure);
});

test('raw bytes are compared with HEAD regardless of index flags', async t => {
  const fixture = await sourceFixture(t);
  await writeFile(join(fixture.root, 'src', 'entry.js'), 'export const value = 2;\n');
  await chmod(join(fixture.root, 'src', 'entry.js'), 0o644);
  await assert.rejects(attest(fixture), fixedFailure);
});

test('tracked executable mode and path mismatches fail closed', async t => {
  const fixture = await sourceFixture(t);
  await chmod(join(fixture.root, 'src', 'entry.js'), 0o755);
  await assert.rejects(attest(fixture), fixedFailure);

  await chmod(join(fixture.root, 'src', 'entry.js'), 0o644);
  const missing = manifest(fixture.files.map(file => (
    file.path === 'src/entry.js' ? { ...file, path: 'src/missing.js' } : file
  )));
  await assert.rejects(attest(fixture, { manifest: missing }), fixedFailure);
});

test('tracked symlink and submodule manifest modes are rejected', async t => {
  const fixture = await sourceFixture(t);
  for (const mode of ['120000', '160000']) {
    const changed = Buffer.concat([
      fixture.manifest,
      record(mode, 'c'.repeat(40), `src/rejected-${mode}`),
    ]);
    await assert.rejects(attest(fixture, { manifest: changed }), fixedFailure);
  }
  await rm(join(fixture.root, 'src', 'entry.js'));
  await symlink('../package.json', join(fixture.root, 'src', 'entry.js'));
  await assert.rejects(attest(fixture), fixedFailure);
});

test('malformed, duplicate, unsafe, and overflowing manifests fail closed', async t => {
  const fixture = await sourceFixture(t);
  const entry = fixture.files[2];
  const malformed = [
    Buffer.from(`100644 blob ${entry.oid}\tsrc/entry.js`, 'utf8'),
    record('100664', entry.oid, 'src/entry.js'),
    Buffer.concat([
      record('100644', entry.oid, 'src/entry.js'),
      record('100644', entry.oid, 'src/entry.js'),
    ]),
    record('100644', entry.oid, 'src/../entry.js'),
    record('100644', entry.oid, '/src/entry.js'),
    record('100644', entry.oid, '.git/config'),
    Buffer.concat([
      record('100644', entry.oid, 'src/entry.js'),
      record('100644', 'd'.repeat(64), 'src/other.js'),
    ]),
  ];
  for (const candidate of malformed) {
    await assert.rejects(attest(fixture, { manifest: candidate }), fixedFailure);
  }
  await assert.rejects(attest(fixture, {
    manifest: Buffer.alloc(PUBLIC_WS_SOURCE_ATTESTATION_LIMITS.manifestBytes + 1, 0x61),
  }), fixedFailure);
});

test('every untracked src entry fails while non-source residue outside src is out of scope', async t => {
  const fixture = await sourceFixture(t);
  await writeFile(join(fixture.root, 'notes.md'), 'not executable\n', { mode: 0o600 });
  await chmod(join(fixture.root, 'notes.md'), 0o644);
  assert.equal((await attest(fixture)).result, true);

  await writeFile(join(fixture.root, 'src', '.DS_Store'), 'ignored residue\n', { mode: 0o600 });
  await assert.rejects(attest(fixture), fixedFailure);
  await rm(join(fixture.root, 'src', '.DS_Store'));

  await mkdir(join(fixture.root, 'src', 'unexpected'), { mode: 0o755 });
  await assert.rejects(attest(fixture), fixedFailure);
  await rm(join(fixture.root, 'src', 'unexpected'), { recursive: true });

  await writeFile(join(fixture.root, 'src', 'untracked.js'), 'throw new Error();\n', {
    mode: 0o600,
  });
  await chmod(join(fixture.root, 'src', 'untracked.js'), 0o644);
  await assert.rejects(attest(fixture), fixedFailure);
});

test('branch, ref, and configured revision mismatches fail with fixed output', async t => {
  const fixture = await sourceFixture(t);
  const failures = [
    { detached: true },
    { branch: 'different' },
    { head: 'c'.repeat(40) },
    { main: 'c'.repeat(40) },
    { tracking: 'c'.repeat(40) },
    { missing: 'rev-parse --verify refs/heads/main^{commit}' },
    { missing: 'rev-parse --verify refs/remotes/origin/main^{commit}' },
  ];
  for (const changes of failures) {
    await assert.rejects(attest(fixture, changes), fixedFailure);
  }
  const git = snapshotGitRunner(fixture);
  await assert.rejects(attestPublicWsOnceSourceTree('d'.repeat(40), {
    gitRunner: git.runner,
    repositoryRoot: fixture.root,
  }), fixedFailure);

  let rejected;
  try {
    await attestPublicWsOnceSourceTree(fixture.revision, {
      repositoryRoot: fixture.root,
      gitRunner: () => ({
        error: new Error('private path endpoint identity hash'),
        status: null,
        signal: null,
        stdout: Buffer.from('private source output\n'),
      }),
    });
  } catch (error) {
    rejected = error;
  }
  assert.equal(fixedFailure(rejected), true);
  assert.equal(String(rejected).includes('private'), false);
  assert.equal(rejected.stack.includes('private'), false);
});
