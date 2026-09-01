import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants, realpathSync } from 'node:fs';
import { lstat, open, opendir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types as utilTypes } from 'node:util';

const ERROR_CODE = 'public_ws_source_attestation_invalid';
const GIT_EXECUTABLE = '/usr/bin/git';
const GIT_REF_MAX_BYTES = 4096;
const GIT_MANIFEST_MAX_BYTES = 256 * 1024;
const GIT_TIMEOUT_MS = 5000;
const MAX_ENTRIES = 4096;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_PATH_BYTES = 4096;
const MAX_TRACKED_BYTES = 16 * 1024 * 1024;
const MAIN_BRANCH = 'main';
const REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SAFE_MODE = /^(100644|100755) blob ([0-9a-f]{40}|[0-9a-f]{64})$/;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

export class PublicWsSourceAttestationError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'PublicWsSourceAttestationError';
    this.code = ERROR_CODE;
    this.stack = `PublicWsSourceAttestationError: ${ERROR_CODE}`;
  }
}

function fail() {
  throw new PublicWsSourceAttestationError();
}

function exactInjections(value) {
  if (value === undefined) return {
    gitRunner: spawnSync,
    repositoryRoot: undefined,
  };
  if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
      GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const allowed = ['gitRunner', 'repositoryRoot'];
  const output = { gitRunner: spawnSync, repositoryRoot: undefined };
  const keys = REFLECT_OWN_KEYS(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = typeof key === 'string'
      ? GET_OWN_PROPERTY_DESCRIPTOR(value, key)
      : undefined;
    if (!allowed.includes(key) || !descriptor || !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true) fail();
    output[key] = descriptor.value;
  }
  if (typeof output.gitRunner !== 'function' ||
      (output.repositoryRoot !== undefined &&
        (typeof output.repositoryRoot !== 'string' || !isAbsolute(output.repositoryRoot)))) fail();
  return output;
}

function canonicalRepositoryRoot(injectedRoot) {
  try {
    const candidate = injectedRoot ?? fileURLToPath(new URL('../', import.meta.url));
    const root = realpathSync(candidate);
    if (typeof root !== 'string' || root.length === 0 || !isAbsolute(root) ||
        resolve(root) !== root) fail();
    return root;
  } catch {
    fail();
  }
}

function runBoundedGit(repositoryRoot, args, maximumBytes, runner) {
  let stdout;
  try {
    if (!ARRAY_IS_ARRAY(args) || !Number.isSafeInteger(maximumBytes) || maximumBytes < 1 ||
        typeof runner !== 'function') fail();
    const result = Reflect.apply(runner, undefined, [
      GIT_EXECUTABLE,
      [
        '--no-pager',
        '--no-optional-locks',
        '-c', 'color.ui=false',
        '-c', 'core.fsmonitor=false',
        '-c', 'core.untrackedCache=false',
        '-C', repositoryRoot,
        ...args,
      ],
      {
        env: {
          GIT_ATTR_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_NO_LAZY_FETCH: '1',
          GIT_NO_REPLACE_OBJECTS: '1',
          GIT_OPTIONAL_LOCKS: '0',
          GIT_PAGER: 'cat',
          GIT_PROTOCOL_FROM_USER: '0',
          GIT_TERMINAL_PROMPT: '0',
          LANG: 'C',
          LC_ALL: 'C',
        },
        encoding: null,
        input: undefined,
        killSignal: 'SIGKILL',
        maxBuffer: maximumBytes,
        shell: false,
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: GIT_TIMEOUT_MS,
        windowsHide: true,
      },
    ]);
    stdout = result?.stdout;
    if (!result || result.error !== undefined || result.status !== 0 ||
        result.signal !== null || !Buffer.isBuffer(stdout) || stdout.length > maximumBytes) fail();
    return stdout;
  } catch {
    if (Buffer.isBuffer(stdout)) stdout.fill(0);
    fail();
  }
}

function exactLine(bytes, expected) {
  const comparison = Buffer.from(`${expected}\n`, 'utf8');
  try {
    return Buffer.isBuffer(bytes) && bytes.equals(comparison);
  } finally {
    comparison.fill(0);
  }
}

function gitRevision(bytes) {
  try {
    if (!Buffer.isBuffer(bytes) || (bytes.length !== 41 && bytes.length !== 65) ||
        bytes[bytes.length - 1] !== 0x0a) fail();
    const value = bytes.subarray(0, bytes.length - 1).toString('ascii');
    if (!REVISION.test(value)) fail();
    return value;
  } catch {
    fail();
  }
}

function safePath(bytes) {
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > MAX_PATH_BYTES) fail();
    const value = UTF8_DECODER.decode(bytes);
    if (Buffer.byteLength(value, 'utf8') !== bytes.length || CONTROL.test(value) ||
        value.includes('\\') || value.startsWith('/') || value.endsWith('/') ||
        value.includes('//')) fail();
    const segments = value.split('/');
    if (segments.some(segment => segment.length === 0 || segment === '.' || segment === '..' ||
        segment.toLowerCase() === '.git')) {
      fail();
    }
    return value;
  } catch {
    fail();
  }
}

function parseManifest(bytes) {
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > GIT_MANIFEST_MAX_BYTES ||
        bytes[bytes.length - 1] !== 0x00) fail();
    const entries = [];
    const paths = new Set();
    let hashLength;
    let offset = 0;
    while (offset < bytes.length) {
      if (entries.length >= MAX_ENTRIES) fail();
      const terminal = bytes.indexOf(0x00, offset);
      if (terminal < 0 || terminal === offset) fail();
      const record = bytes.subarray(offset, terminal);
      const tab = record.indexOf(0x09);
      if (tab < 1 || record.indexOf(0x09, tab + 1) !== -1) fail();
      const prefix = record.subarray(0, tab).toString('ascii');
      const match = SAFE_MODE.exec(prefix);
      if (!match) fail();
      const path = safePath(record.subarray(tab + 1));
      if (paths.has(path)) fail();
      paths.add(path);
      if (hashLength === undefined) hashLength = match[2].length;
      if (match[2].length !== hashLength) fail();
      entries.push(Object.freeze({ mode: match[1], oid: match[2], path }));
      offset = terminal + 1;
    }
    if (entries.length < 1 || (hashLength !== 40 && hashLength !== 64)) fail();
    return Object.freeze({ entries: Object.freeze(entries), hashLength });
  } catch {
    fail();
  }
}

function sameStat(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size &&
    left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs &&
    left.mode === right.mode && left.nlink === right.nlink;
}

function blobOid(bytes, hashLength) {
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  try {
    return createHash(hashLength === 40 ? 'sha1' : 'sha256')
      .update(header)
      .update(bytes)
      .digest('hex');
  } finally {
    header.fill(0);
  }
}

async function assertParentDirectories(repositoryRoot, path, verified) {
  const segments = path.split('/');
  let cursor = repositoryRoot;
  for (let index = 0; index < segments.length - 1; index += 1) {
    cursor = join(cursor, segments[index]);
    if (verified.has(cursor)) continue;
    const stat = await lstat(cursor, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail();
    if (await realpath(cursor) !== cursor) fail();
    verified.add(cursor);
  }
}

async function attestTrackedFiles(repositoryRoot, manifest) {
  const parents = new Set();
  let totalBytes = 0;
  for (let index = 0; index < manifest.entries.length; index += 1) {
    const entry = manifest.entries[index];
    const target = join(repositoryRoot, ...entry.path.split('/'));
    const relativeTarget = relative(repositoryRoot, target);
    if (!relativeTarget || relativeTarget === '..' ||
        relativeTarget.startsWith(`..${sep}`) || isAbsolute(relativeTarget) ||
        target === repositoryRoot) fail();
    await assertParentDirectories(repositoryRoot, entry.path, parents);
    if (await realpath(target) !== target) fail();
    let handle;
    let bytes;
    try {
      const noFollow = fsConstants.O_NOFOLLOW ?? 0;
      handle = await open(target, fsConstants.O_RDONLY | noFollow);
      const before = await handle.stat({ bigint: true });
      const expectedMode = entry.mode === '100755' ? 0o755n : 0o644n;
      if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n ||
          (before.mode & 0o777n) !== expectedMode || before.size < 0n ||
          before.size > BigInt(MAX_FILE_BYTES)) fail();
      totalBytes += Number(before.size);
      if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_TRACKED_BYTES) fail();
      bytes = await handle.readFile();
      const after = await handle.stat({ bigint: true });
      const pathAfter = await lstat(target, { bigint: true });
      if (!Buffer.isBuffer(bytes) || BigInt(bytes.length) !== before.size ||
          !sameStat(before, after) || !sameStat(before, pathAfter) ||
          await realpath(target) !== target ||
          blobOid(bytes, manifest.hashLength) !== entry.oid) fail();
    } finally {
      if (Buffer.isBuffer(bytes)) bytes.fill(0);
      if (handle) {
        try { await handle.close(); } catch {}
      }
    }
  }
}

function trackedSourceDirectories(manifest) {
  const directories = new Set(['src']);
  for (let index = 0; index < manifest.entries.length; index += 1) {
    const path = manifest.entries[index].path;
    if (!path.startsWith('src/')) continue;
    const segments = path.split('/');
    let cursor = 'src';
    for (let segmentIndex = 1; segmentIndex < segments.length - 1; segmentIndex += 1) {
      cursor = `${cursor}/${segments[segmentIndex]}`;
      directories.add(cursor);
    }
  }
  return directories;
}

async function assertNoUntrackedSource(repositoryRoot, manifest) {
  const tracked = new Set(manifest.entries.map(entry => entry.path));
  const trackedDirectories = trackedSourceDirectories(manifest);
  const visit = async relativeDirectory => {
    const absoluteDirectory = join(repositoryRoot, ...relativeDirectory.split('/'));
    const directory = await opendir(absoluteDirectory);
    try {
      for await (const entry of directory) {
        const path = `${relativeDirectory}/${entry.name}`;
        safePath(Buffer.from(path, 'utf8'));
        const target = join(repositoryRoot, ...path.split('/'));
        const stat = await lstat(target, { bigint: true });
        if (entry.isSymbolicLink() || stat.isSymbolicLink()) fail();
        if (entry.isDirectory() && stat.isDirectory()) {
          if (!trackedDirectories.has(path)) fail();
          await visit(path);
        } else if (entry.isFile() && stat.isFile()) {
          if (!tracked.has(path)) fail();
        } else {
          fail();
        }
      }
    } finally {
      try { await directory.close(); } catch {}
    }
  };
  await visit('src');
}

export async function attestPublicWsOnceSourceTree(sourceRevision, injected) {
  const outputs = [];
  try {
    if (typeof sourceRevision !== 'string' || !REVISION.test(sourceRevision)) fail();
    const dependencies = exactInjections(injected);
    const repositoryRoot = canonicalRepositoryRoot(dependencies.repositoryRoot);
    const read = (args, maximumBytes = GIT_REF_MAX_BYTES) => {
      const output = runBoundedGit(
        repositoryRoot,
        args,
        maximumBytes,
        dependencies.gitRunner,
      );
      outputs.push(output);
      return output;
    };
    if (!exactLine(read(['rev-parse', '--show-toplevel']), repositoryRoot)) fail();
    if (!exactLine(
      read(['symbolic-ref', '--quiet', 'HEAD']),
      `refs/heads/${MAIN_BRANCH}`,
    )) fail();
    const head = gitRevision(read(['rev-parse', '--verify', 'HEAD^{commit}']));
    const main = gitRevision(read([
      'rev-parse', '--verify', `refs/heads/${MAIN_BRANCH}^{commit}`,
    ]));
    const tracking = gitRevision(read([
      'rev-parse', '--verify', `refs/remotes/origin/${MAIN_BRANCH}^{commit}`,
    ]));
    if (head !== main || head !== tracking || head !== sourceRevision) fail();
    const manifest = parseManifest(read(
      ['ls-tree', '-r', '-z', '--full-tree', head],
      GIT_MANIFEST_MAX_BYTES,
    ));
    if (manifest.hashLength !== head.length) fail();
    await attestTrackedFiles(repositoryRoot, manifest);
    await assertNoUntrackedSource(repositoryRoot, manifest);
    if (!exactLine(
      read(['symbolic-ref', '--quiet', 'HEAD']),
      `refs/heads/${MAIN_BRANCH}`,
    )) fail();
    const finalHead = gitRevision(read(['rev-parse', '--verify', 'HEAD^{commit}']));
    const finalMain = gitRevision(read([
      'rev-parse', '--verify', `refs/heads/${MAIN_BRANCH}^{commit}`,
    ]));
    const finalTracking = gitRevision(read([
      'rev-parse', '--verify', `refs/remotes/origin/${MAIN_BRANCH}^{commit}`,
    ]));
    if (finalHead !== head || finalMain !== head || finalTracking !== head) fail();
    return true;
  } catch {
    fail();
  } finally {
    for (let index = 0; index < outputs.length; index += 1) outputs[index].fill(0);
  }
}

export const PUBLIC_WS_SOURCE_ATTESTATION_LIMITS = Object.freeze({
  manifestBytes: GIT_MANIFEST_MAX_BYTES,
  entries: MAX_ENTRIES,
  fileBytes: MAX_FILE_BYTES,
  trackedBytes: MAX_TRACKED_BYTES,
});
