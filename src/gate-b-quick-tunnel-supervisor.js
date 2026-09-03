import { spawn, spawnSync } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import { constants as fsConstants, createReadStream } from 'node:fs';
import {
  chmod,
  lstat,
  mkdtemp,
  open,
  readdir,
  realpath,
  rmdir,
} from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { types as utilTypes } from 'node:util';

import {
  GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST,
  GATE_B_QUICK_TUNNEL_HOSTNAME_PERSISTENCE_POLICY,
  GATE_B_QUICK_TUNNEL_RUNTIME_CONTROL_POLICY,
  GATE_B_QUICK_TUNNEL_TELEMETRY_POLICIES,
  matchesGateBQuickTunnelCanonicalVersionOutput,
  validateGateBQuickTunnelArtifactSelection,
  validateGateBQuickTunnelStableBinding,
} from './gate-b-quick-tunnel-artifact.js';
import {
  GATE_B_PUBLIC_WS_INPUT_LEAVES,
  parseGateBQuickTunnelHostnameSource,
  serializeGateBQuickTunnelHostnameSource,
} from './gate-b-public-ws-inputs-schema.js';
import { openGateBPublicWsPrivateWorkspace } from './gate-b-public-ws-private-workspace.js';
import {
  createGateBQuickTunnelIpcMessage,
  GATE_B_QUICK_TUNNEL_IPC_TYPES,
  GATE_B_QUICK_TUNNEL_LIMITS,
  parseGateBQuickTunnelBootstrapFrame,
  parseGateBQuickTunnelHttpSnapshot,
  parseGateBQuickTunnelIpcMessage,
  parseGateBQuickTunnelLsofSnapshot,
  parseGateBQuickTunnelReadyHttpSnapshot,
  parseGateBQuickTunnelStartupReadyHttpSnapshot,
} from './gate-b-quick-tunnel-schema.js';

const ERROR_CODE = 'gate_b_quick_tunnel_supervisor_failed';
const BOOTSTRAP_FD = 3;
const DEV_NULL = '/dev/null';
const LSOF_EXECUTABLE = '/usr/sbin/lsof';
const ORIGIN_PORT = 41000;
const OBSERVATION_GAP_MS = 250;
const STARTUP_READY_OBSERVATIONS = 3;
const STARTUP_TIMEOUT_MS = 60_000;
const CHECK_TIMEOUT_MS = 10_000;
const SHUTDOWN_TIMEOUT_MS = 10_000;
const HARD_LIFETIME_MS = 10 * 60_000;
const REAP_FORCE_MS = 500;
const RUNTIME_MAX_BYTES = 256 * 1024 * 1024;
const LSOF_MAX_BYTES = GATE_B_QUICK_TUNNEL_LIMITS.lsofBytes;
const VERSION_MAX_BYTES = 256;
const ACL_MAX_BYTES = 64 * 1024;
const ACL_COMPONENT_TIMEOUT_MS = 200;
const ACL_AGGREGATE_TIMEOUT_MS = 4_000;
const PATH_COMPONENT_MAX = 16;
const CLOUDFLARED_ARGV0 = GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST.executableBasename;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const ATTESTATIONS = new WeakMap();
const ATTESTATION_LAUNCHES = new WeakMap();
const EXECUTABLE_PATH_GUARDS = new WeakMap();
const RUNTIME_DIRECTORIES = new WeakMap();

const CLOUDFLARED_ARGUMENTS = Object.freeze([
  'tunnel',
  '--protocol', 'http2',
  '--config', DEV_NULL,
  '--origincert', DEV_NULL,
  '--credentials-file', DEV_NULL,
  '--no-autoupdate',
  '--no-prechecks',
  '--management-diagnostics=false',
  '--url', 'http://127.0.0.1:41000',
  '--metrics', '127.0.0.1:0',
]);

export class GateBQuickTunnelSupervisorError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBQuickTunnelSupervisorError';
    this.code = ERROR_CODE;
    this.stack = `GateBQuickTunnelSupervisorError: ${ERROR_CODE}`;
  }
}

function error() {
  return new GateBQuickTunnelSupervisorError();
}

function fail() {
  throw error();
}

function exactPlainObject(value, allowed) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
      GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const keys = REFLECT_OWN_KEYS(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = typeof key === 'string'
      ? GET_OWN_PROPERTY_DESCRIPTOR(value, key)
      : undefined;
    if (!allowed.includes(key) || !descriptor || !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true) fail();
  }
  return value;
}

function sameInode(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameGeneration(left, right) {
  return sameInode(left, right) && left.size === right.size &&
    left.mode === right.mode && left.nlink === right.nlink &&
    left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function exactExecutableIdentity(value, sourcePin) {
  exactPlainObject(value, [
    'ctimeNs', 'dev', 'digest', 'ino', 'mode', 'mtimeNs', 'nlink', 'size',
  ]);
  for (const field of ['ctimeNs', 'dev', 'ino', 'mode', 'mtimeNs', 'nlink', 'size']) {
    if (typeof value[field] !== 'bigint' || value[field] < 0n) fail();
  }
  if (value.nlink !== 1n || value.size < 1n || value.digest !== sourcePin) fail();
  return value;
}

function mode(stat) {
  return Number(stat.mode & 0o7777n);
}

function exactCurrentUid() {
  const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  if (!Number.isSafeInteger(uid) || uid < 0) fail();
  return uid;
}

function exactCanonicalPath(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 4096 ||
      /[\u0000-\u001f\u007f]/u.test(value) || !isAbsolute(value) ||
      resolve(value) !== value) fail();
  return value;
}

function executableStat(stat, uid) {
  const permissions = mode(stat);
  return stat && typeof stat.isFile === 'function' && stat.isFile() &&
    !stat.isSymbolicLink() && stat.uid === BigInt(uid) && stat.nlink === 1n &&
    stat.size >= 4096n && stat.size <= BigInt(RUNTIME_MAX_BYTES) &&
    permissions === 0o500;
}

function trustedParentStat(stat, uid, belowAnchor) {
  if (!stat || typeof stat.isDirectory !== 'function' || !stat.isDirectory() ||
      stat.isSymbolicLink() || typeof stat.uid !== 'bigint') return false;
  const permissions = mode(stat);
  if ((permissions & 0o6022) !== 0 || (permissions & 0o500) !== 0o500) return false;
  if (belowAnchor) return stat.uid === BigInt(uid) && permissions === 0o700;
  return stat.uid === 0n || stat.uid === BigInt(uid);
}

function pathParents(executablePath) {
  const reversed = [];
  let cursor = dirname(executablePath);
  while (true) {
    reversed.push(cursor);
    if (reversed.length > PATH_COMPONENT_MAX) fail();
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return reversed.reverse();
}

function permissionText(kind, permissions) {
  const bits = [0o400, 0o200, 0o100, 0o040, 0o020, 0o010, 0o004, 0o002, 0o001];
  const letters = ['r', 'w', 'x', 'r', 'w', 'x', 'r', 'w', 'x'];
  let output = kind === 'directory' ? 'd' : '-';
  for (let index = 0; index < bits.length; index += 1) {
    output += (permissions & bits[index]) === 0 ? '-' : letters[index];
  }
  return output;
}

function inspectDarwinAcl(
  { cwd, identity, kind, target, timeoutMs },
  spawnSyncProcess = spawnSync,
) {
  let stdout;
  let stderr;
  try {
    exactCanonicalPath(cwd);
    if ((kind !== 'directory' && kind !== 'file') ||
        (target !== '.' && target !== `./${CLOUDFLARED_ARGV0}`) ||
        (kind === 'directory') !== (target === '.') ||
        !identity || typeof identity.ino !== 'bigint' || identity.ino < 1n ||
        !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 ||
        timeoutMs > ACL_COMPONENT_TIMEOUT_MS ||
        typeof spawnSyncProcess !== 'function') fail();
    const args = ['-lide', target];
    const result = Reflect.apply(spawnSyncProcess, undefined, [
      '/bin/ls',
      args,
      {
        cwd,
        env: {},
        killSignal: 'SIGKILL',
        maxBuffer: ACL_MAX_BYTES,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: timeoutMs,
        windowsHide: true,
      },
    ]);
    stdout = result.stdout;
    stderr = result.stderr;
    if (result.error !== undefined || result.status !== 0 || result.signal !== null ||
        !Buffer.isBuffer(stdout) || !Buffer.isBuffer(stderr) || stderr.length !== 0 ||
        stdout.length < 12 || stdout.length > ACL_MAX_BYTES) fail();
    const expected = permissionText(kind, mode(identity));
    const lines = stdout.toString('utf8').split('\n');
    let matches = 0;
    for (const line of lines) {
      const candidate = /^\s*([0-9]+)\s+([-drwx]{10})([ +@])(?:\s|$)/u.exec(line);
      if (candidate?.[1] !== String(identity.ino)) continue;
      matches += 1;
      if (candidate[2] !== expected || candidate[3] === '+') fail();
    }
    if (matches !== 1) fail();
    return true;
  } catch {
    fail();
  } finally {
    if (Buffer.isBuffer(stdout)) stdout.fill(0);
    if (Buffer.isBuffer(stderr)) stderr.fill(0);
  }
}

function nativeMachO(header, architecture = process.arch) {
  if (!Buffer.isBuffer(header) || header.length !== 8 ||
      !header.subarray(0, 4).equals(Buffer.from([0xcf, 0xfa, 0xed, 0xfe]))) return false;
  const cpuType = header.readUInt32LE(4);
  if (architecture === 'arm64') return cpuType === 0x0100000c;
  if (architecture === 'x64') return cpuType === 0x01000007;
  return false;
}

function attestVersion(executablePath, spawnSyncProcess = spawnSync) {
  let stdout;
  let stderr;
  try {
    if (typeof spawnSyncProcess !== 'function') fail();
    const result = Reflect.apply(spawnSyncProcess, undefined, [
      executablePath,
      ['--version'],
      {
        argv0: CLOUDFLARED_ARGV0,
        cwd: '/',
        env: {},
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 2_000,
        killSignal: 'SIGKILL',
        maxBuffer: VERSION_MAX_BYTES,
        windowsHide: true,
      },
    ]);
    stdout = result.stdout;
    stderr = result.stderr;
    if (result.error !== undefined || result.status !== 0 || result.signal !== null ||
        !Buffer.isBuffer(stdout) || !Buffer.isBuffer(stderr) || stderr.length !== 0 ||
        stdout.length < 1 || stdout.length > VERSION_MAX_BYTES) fail();
    const line = stdout.toString('utf8');
    if (matchesGateBQuickTunnelCanonicalVersionOutput(line) !== true) fail();
    return true;
  } catch {
    fail();
  } finally {
    if (Buffer.isBuffer(stdout)) stdout.fill(0);
    if (Buffer.isBuffer(stderr)) stderr.fill(0);
  }
}

async function readExactFileHash(handle, size) {
  const hash = createHash('sha256');
  const chunk = Buffer.allocUnsafe(64 * 1024);
  let offset = 0;
  try {
    while (offset < size) {
      const length = Math.min(chunk.length, size - offset);
      const result = await handle.read(chunk, 0, length, offset);
      if (!result || !Number.isSafeInteger(result.bytesRead) ||
          result.bytesRead < 1 || result.bytesRead > length) fail();
      hash.update(chunk.subarray(0, result.bytesRead));
      chunk.fill(0, 0, result.bytesRead);
      offset += result.bytesRead;
    }
    const terminal = Buffer.alloc(1);
    try {
      const result = await handle.read(terminal, 0, 1, size);
      if (!result || result.bytesRead !== 0) fail();
    } finally {
      terminal.fill(0);
    }
    return hash.digest();
  } catch {
    fail();
  } finally {
    chunk.fill(0);
  }
}

function createAttestationLaunch() {
  const token = Object.freeze(Object.create(null));
  ATTESTATION_LAUNCHES.set(token, { stage: 'CREATED' });
  return token;
}

function executableDependencies(value) {
  const output = value ?? {
    architecture: process.arch,
    inspectExecutableAcl: inspectDarwinAcl,
    lstatExecutablePath: lstat,
    monotonicNow: () => performance.now(),
    openExecutablePath: open,
    platform: process.platform,
    readExecutableHash: readExactFileHash,
    realpathExecutablePath: realpath,
  };
  if (typeof output.architecture !== 'string' || typeof output.platform !== 'string') fail();
  for (const name of [
    'inspectExecutableAcl', 'lstatExecutablePath', 'openExecutablePath',
    'monotonicNow', 'readExecutableHash', 'realpathExecutablePath',
  ]) {
    if (typeof output[name] !== 'function') fail();
  }
  return output;
}

async function closeExecutablePathGuard(token) {
  const record = EXECUTABLE_PATH_GUARDS.get(token);
  if (!record || record.closed) return false;
  let failed = false;
  record.closed = true;
  const handles = [record.leaf?.handle];
  for (let index = record.parents.length - 1; index >= 0; index -= 1) {
    handles.push(record.parents[index]?.handle);
  }
  for (const handle of handles) {
    try { await handle?.close(); } catch { failed = true; }
  }
  if (record.leaf) {
    record.leaf.handle = undefined;
    record.leaf.identity = undefined;
    record.leaf.parentPath = undefined;
    record.leaf.path = undefined;
  }
  for (const parent of record.parents) {
    parent.handle = undefined;
    parent.identity = undefined;
    parent.path = undefined;
  }
  record.leaf = undefined;
  record.parents.length = 0;
  record.path = undefined;
  record.uid = undefined;
  EXECUTABLE_PATH_GUARDS.delete(token);
  if (failed) fail();
  return true;
}

async function openExecutablePathGuard(executablePath, dependencies) {
  const parents = [];
  let leaf;
  try {
    if (basename(executablePath) !== CLOUDFLARED_ARGV0) fail();
    const uid = exactCurrentUid();
    const {
      O_CLOEXEC = 0, O_DIRECTORY, O_NOFOLLOW, O_RDONLY,
    } = fsConstants;
    if (![O_CLOEXEC, O_DIRECTORY, O_NOFOLLOW, O_RDONLY].every(Number.isInteger) ||
        O_DIRECTORY === 0 || O_NOFOLLOW === 0) fail();
    const aclStarted = Reflect.apply(dependencies.monotonicNow, undefined, []);
    if (!Number.isFinite(aclStarted) || aclStarted < 0) fail();
    const aclDeadline = aclStarted + ACL_AGGREGATE_TIMEOUT_MS;
    if (!Number.isFinite(aclDeadline)) fail();
    const aclTimeout = () => {
      const now = Reflect.apply(dependencies.monotonicNow, undefined, []);
      if (!Number.isFinite(now) || now < aclStarted || now >= aclDeadline) fail();
      const remaining = Math.floor(aclDeadline - now);
      if (remaining < 1) fail();
      return Math.min(ACL_COMPONENT_TIMEOUT_MS, remaining);
    };
    let anchorFound = false;
    for (const parentPath of pathParents(executablePath)) {
      if (await Reflect.apply(dependencies.realpathExecutablePath, undefined, [parentPath]) !==
          parentPath) fail();
      const before = await Reflect.apply(dependencies.lstatExecutablePath, undefined, [
        parentPath, { bigint: true },
      ]);
      const anchor = !anchorFound && before?.uid === BigInt(uid) && mode(before) === 0o700;
      if (!trustedParentStat(before, uid, anchorFound || anchor)) fail();
      const handle = await Reflect.apply(dependencies.openExecutablePath, undefined, [
        parentPath, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC,
      ]);
      const parent = {
        belowAnchor: anchorFound || anchor,
        handle,
        identity: undefined,
        path: parentPath,
      };
      parents.push(parent);
      const opened = await handle.stat({ bigint: true });
      if (!trustedParentStat(opened, uid, anchorFound || anchor) ||
          !sameGeneration(before, opened)) fail();
      if (await Reflect.apply(dependencies.inspectExecutableAcl, undefined, [{
            cwd: parentPath,
            identity: opened,
            kind: 'directory',
            target: '.',
            timeoutMs: aclTimeout(),
          }]) !== true) fail();
      const afterPath = await Reflect.apply(dependencies.lstatExecutablePath, undefined, [
        parentPath, { bigint: true },
      ]);
      const afterHandle = await handle.stat({ bigint: true });
      if (await Reflect.apply(dependencies.realpathExecutablePath, undefined, [parentPath]) !==
          parentPath || !trustedParentStat(afterPath, uid, anchorFound || anchor) ||
          !trustedParentStat(afterHandle, uid, anchorFound || anchor) ||
          !sameGeneration(opened, afterPath) || !sameGeneration(opened, afterHandle)) fail();
      anchorFound ||= anchor;
      parent.belowAnchor = anchorFound;
      parent.identity = afterHandle;
    }
    if (!anchorFound || parents.length < 2) fail();
    const before = await Reflect.apply(dependencies.lstatExecutablePath, undefined, [
      executablePath, { bigint: true },
    ]);
    if (!executableStat(before, uid)) fail();
    const handle = await Reflect.apply(dependencies.openExecutablePath, undefined, [
      executablePath, O_RDONLY | O_NOFOLLOW | O_CLOEXEC,
    ]);
    leaf = {
      handle,
      identity: undefined,
      parentPath: dirname(executablePath),
      path: executablePath,
    };
    const opened = await handle.stat({ bigint: true });
    if (!executableStat(opened, uid) || !sameGeneration(before, opened)) fail();
    if (await Reflect.apply(dependencies.inspectExecutableAcl, undefined, [{
          cwd: dirname(executablePath),
          identity: opened,
          kind: 'file',
          target: `./${CLOUDFLARED_ARGV0}`,
          timeoutMs: aclTimeout(),
        }]) !== true) fail();
    const afterPath = await Reflect.apply(dependencies.lstatExecutablePath, undefined, [
      executablePath, { bigint: true },
    ]);
    const afterHandle = await handle.stat({ bigint: true });
    if (await Reflect.apply(dependencies.realpathExecutablePath, undefined, [executablePath]) !==
        executablePath || !executableStat(afterPath, uid) ||
        !executableStat(afterHandle, uid) || !sameGeneration(opened, afterPath) ||
        !sameGeneration(opened, afterHandle)) fail();
    leaf.identity = afterHandle;
    const token = Object.freeze(Object.create(null));
    EXECUTABLE_PATH_GUARDS.set(token, {
      closed: false,
      leaf,
      parents,
      path: executablePath,
      uid,
    });
    return token;
  } catch {
    try { await leaf?.handle?.close(); } catch {}
    for (let index = parents.length - 1; index >= 0; index -= 1) {
      try { await parents[index]?.handle?.close(); } catch {}
    }
    fail();
  }
}

async function assertExecutablePathGuard(token, dependencies) {
  const record = EXECUTABLE_PATH_GUARDS.get(token);
  if (!record || record.closed || !record.leaf || record.parents.length < 2 ||
      record.path !== record.leaf.path || record.leaf.parentPath !== dirname(record.path)) fail();
  for (const parent of record.parents) {
    if (await Reflect.apply(dependencies.realpathExecutablePath, undefined, [parent.path]) !==
        parent.path) fail();
    const pathState = await Reflect.apply(dependencies.lstatExecutablePath, undefined, [
      parent.path, { bigint: true },
    ]);
    const handleState = await parent.handle.stat({ bigint: true });
    if (!trustedParentStat(pathState, record.uid, parent.belowAnchor) ||
        !trustedParentStat(handleState, record.uid, parent.belowAnchor) ||
        !sameGeneration(parent.identity, pathState) ||
        !sameGeneration(parent.identity, handleState)) fail();
  }
  if (await Reflect.apply(dependencies.realpathExecutablePath, undefined, [record.path]) !==
      record.path) fail();
  const pathState = await Reflect.apply(dependencies.lstatExecutablePath, undefined, [
    record.path, { bigint: true },
  ]);
  const handleState = await record.leaf.handle.stat({ bigint: true });
  if (!executableStat(pathState, record.uid) || !executableStat(handleState, record.uid) ||
      !sameGeneration(record.leaf.identity, pathState) ||
      !sameGeneration(record.leaf.identity, handleState)) fail();
  return record;
}

async function inspectExecutable(
  executablePath,
  sourcePin,
  versionAttestor = attestVersion,
  retainedPathGuard,
  suppliedDependencies,
) {
  let pathGuard = retainedPathGuard;
  let createdGuard = false;
  let digest;
  let expected;
  try {
    exactCanonicalPath(executablePath);
    const dependencies = executableDependencies(suppliedDependencies);
    if (validateGateBQuickTunnelArtifactSelection({
      architecture: dependencies.architecture,
      platform: dependencies.platform,
      sourcePin,
    }) !== true) fail();
    if (pathGuard === undefined) {
      pathGuard = await openExecutablePathGuard(executablePath, dependencies);
      createdGuard = true;
    }
    const guarded = await assertExecutablePathGuard(pathGuard, dependencies);
    if (guarded.path !== executablePath) fail();
    const opened = guarded.leaf.identity;
    const handle = guarded.leaf.handle;
    const header = Buffer.alloc(8);
    try {
      const result = await handle.read(header, 0, header.length, 0);
      if (!result || result.bytesRead !== header.length ||
          !nativeMachO(header, dependencies.architecture)) fail();
    } finally {
      header.fill(0);
    }
    digest = await Reflect.apply(dependencies.readExecutableHash, undefined, [
      handle, Number(opened.size),
    ]);
    if (!Buffer.isBuffer(digest)) fail();
    expected = Buffer.from(sourcePin, 'hex');
    if (expected.length !== digest.length || !timingSafeEqual(digest, expected)) fail();
    await assertExecutablePathGuard(pathGuard, dependencies);
    if (typeof versionAttestor !== 'function' ||
        await Reflect.apply(versionAttestor, undefined, [executablePath]) !== true) fail();
    await assertExecutablePathGuard(pathGuard, dependencies);
    return {
      identity: {
        dev: opened.dev,
        ino: opened.ino,
        size: opened.size,
        mode: opened.mode,
        nlink: opened.nlink,
        mtimeNs: opened.mtimeNs,
        ctimeNs: opened.ctimeNs,
        digest: digest.toString('hex'),
      },
      pathGuard,
    };
  } catch {
    if (createdGuard) {
      try { await closeExecutablePathGuard(pathGuard); } catch {}
    }
    fail();
  } finally {
    if (Buffer.isBuffer(digest)) digest.fill(0);
    if (Buffer.isBuffer(expected)) expected.fill(0);
  }
}

async function attestExecutable(
  executablePath,
  sourcePin,
  previous,
  versionAttestor = attestVersion,
  launchToken,
  child,
  executableInspector = inspectExecutable,
  platform = process.platform,
  architecture = process.arch,
  executableInspectionDependencies,
) {
  try {
    if (validateGateBQuickTunnelArtifactSelection({
      architecture,
      platform,
      sourcePin,
    }) !== true || typeof executableInspector !== 'function') fail();
    const launch = ATTESTATION_LAUNCHES.get(launchToken);
    if (!launch) fail();
    if (previous === undefined) {
      if (launch.stage !== 'CREATED' || child !== undefined) fail();
      const inspected = await Reflect.apply(executableInspector, undefined, [
        executablePath,
        sourcePin,
        versionAttestor,
        undefined,
        executableInspectionDependencies,
      ]);
      let identity;
      let pathGuard;
      if (executableInspector === inspectExecutable) {
        exactPlainObject(inspected, ['identity', 'pathGuard']);
        identity = exactExecutableIdentity(inspected.identity, sourcePin);
        pathGuard = inspected.pathGuard;
        if (!EXECUTABLE_PATH_GUARDS.has(pathGuard)) fail();
      } else {
        identity = exactExecutableIdentity(inspected, sourcePin);
      }
      const token = Object.freeze(Object.create(null));
      const record = {
        child: undefined,
        identity,
        launchToken,
        path: executablePath,
        pathGuard,
        sourcePin,
        stage: 'PRE_SPAWN',
      };
      ATTESTATIONS.set(token, record);
      launch.attestationToken = token;
      launch.stage = 'PRE_SPAWN';
      return token;
    }
    const prior = ATTESTATIONS.get(previous);
    exactChild(child);
    if (launch.stage !== 'PRE_SPAWN' || launch.attestationToken !== previous ||
        !prior || prior.stage !== 'PRE_SPAWN' || prior.launchToken !== launchToken ||
        prior.path !== executablePath || prior.sourcePin !== sourcePin) fail();
    const inspected = await Reflect.apply(executableInspector, undefined, [
      executablePath,
      sourcePin,
      versionAttestor,
      prior.pathGuard,
      executableInspectionDependencies,
    ]);
    let identity;
    if (executableInspector === inspectExecutable) {
      exactPlainObject(inspected, ['identity', 'pathGuard']);
      if (inspected.pathGuard !== prior.pathGuard ||
          !EXECUTABLE_PATH_GUARDS.has(inspected.pathGuard)) fail();
      identity = exactExecutableIdentity(inspected.identity, sourcePin);
    } else {
      identity = exactExecutableIdentity(inspected, sourcePin);
    }
    if (!sameGeneration(prior.identity, identity) || prior.identity.digest !== identity.digest) {
      fail();
    }
    prior.child = child;
    prior.stage = 'POST_SPAWN';
    launch.child = child;
    launch.stage = 'POST_SPAWN';
    return previous;
  } catch {
    fail();
  }
}

async function assertAttestationPathGuard(
  launchToken,
  attestationToken,
  executableInspector,
  executableInspectionDependencies,
) {
  const launch = ATTESTATION_LAUNCHES.get(launchToken);
  const attestation = ATTESTATIONS.get(attestationToken);
  if (!launch || launch.stage !== 'PRE_SPAWN' ||
      launch.attestationToken !== attestationToken ||
      !attestation || attestation.stage !== 'PRE_SPAWN' ||
      attestation.launchToken !== launchToken) fail();
  if (executableInspector === inspectExecutable) {
    const dependencies = executableDependencies(executableInspectionDependencies);
    if (!attestation.pathGuard) fail();
    await assertExecutablePathGuard(attestation.pathGuard, dependencies);
  }
  return true;
}

function artifactBindingFromAttestation(
  launchToken,
  attestationToken,
  child,
  telemetryMode,
  telemetryAcknowledgement,
) {
  try {
    const launch = ATTESTATION_LAUNCHES.get(launchToken);
    const attestation = ATTESTATIONS.get(attestationToken);
    exactChild(child);
    if (!launch || launch.stage !== 'POST_SPAWN' ||
        launch.attestationToken !== attestationToken || launch.child !== child ||
        !attestation || attestation.stage !== 'POST_SPAWN' ||
        attestation.launchToken !== launchToken || attestation.child !== child) fail();
    const telemetry = GATE_B_QUICK_TUNNEL_TELEMETRY_POLICIES[telemetryMode];
    if (!telemetry || telemetry.acknowledgement !== telemetryAcknowledgement) fail();
    const manifest = GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST;
    const binding = Object.freeze({
      artifact: Object.freeze({
        architecture: manifest.architecture,
        archiveSha256: manifest.archiveSha256,
        asset: manifest.asset,
        executableSha256: manifest.executableSha256,
        manifestVersion: manifest.manifestVersion,
        platform: manifest.platform,
        release: manifest.release,
      }),
      hostnamePersistence: Object.freeze({
        ...GATE_B_QUICK_TUNNEL_HOSTNAME_PERSISTENCE_POLICY,
      }),
      runtimeControl: Object.freeze({ ...GATE_B_QUICK_TUNNEL_RUNTIME_CONTROL_POLICY }),
      telemetry: Object.freeze({ ...telemetry }),
    });
    if (validateGateBQuickTunnelStableBinding(binding) !== true) fail();
    attestation.stage = 'CONSUMED';
    launch.stage = 'CONSUMED';
    return binding;
  } catch {
    fail();
  }
}

function completeAttestationSourceWrite(launchToken, attestationToken) {
  try {
    const launch = ATTESTATION_LAUNCHES.get(launchToken);
    const attestation = ATTESTATIONS.get(attestationToken);
    if (!launch || launch.stage !== 'CONSUMED' ||
        launch.attestationToken !== attestationToken ||
        !attestation || attestation.stage !== 'CONSUMED' ||
        attestation.launchToken !== launchToken) fail();
    launch.stage = 'SOURCE_WRITTEN';
    attestation.stage = 'SOURCE_WRITTEN';
    return true;
  } catch {
    fail();
  }
}

async function verifyRetainedAttestation(
  launchToken,
  attestationToken,
  child,
  versionAttestor = attestVersion,
  executableInspector = inspectExecutable,
  platform = process.platform,
  architecture = process.arch,
  executableInspectionDependencies,
) {
  try {
    const launch = ATTESTATION_LAUNCHES.get(launchToken);
    const attestation = ATTESTATIONS.get(attestationToken);
    exactChild(child);
    if (!launch || launch.stage !== 'SOURCE_WRITTEN' ||
        launch.attestationToken !== attestationToken || launch.child !== child ||
        !attestation || attestation.stage !== 'SOURCE_WRITTEN' ||
        attestation.launchToken !== launchToken || attestation.child !== child) fail();
    if (validateGateBQuickTunnelArtifactSelection({
      architecture,
      platform,
      sourcePin: attestation.sourcePin,
    }) !== true || typeof executableInspector !== 'function') fail();
    const inspected = await Reflect.apply(executableInspector, undefined, [
      attestation.path,
      attestation.sourcePin,
      versionAttestor,
      attestation.pathGuard,
      executableInspectionDependencies,
    ]);
    let current;
    if (executableInspector === inspectExecutable) {
      exactPlainObject(inspected, ['identity', 'pathGuard']);
      if (inspected.pathGuard !== attestation.pathGuard ||
          !EXECUTABLE_PATH_GUARDS.has(inspected.pathGuard)) fail();
      current = exactExecutableIdentity(inspected.identity, attestation.sourcePin);
    } else {
      current = exactExecutableIdentity(inspected, attestation.sourcePin);
    }
    if (!sameGeneration(attestation.identity, current) ||
        attestation.identity.digest !== current.digest) fail();
    return true;
  } catch {
    fail();
  }
}

async function retireAttestationLaunch(launchToken) {
  const launch = ATTESTATION_LAUNCHES.get(launchToken);
  if (!launch || launch.stage === 'RETIRED') return false;
  const attestationToken = launch.attestationToken;
  const attestation = ATTESTATIONS.get(attestationToken);
  const pathGuard = attestation?.pathGuard;
  if (attestation) {
    attestation.child = undefined;
    attestation.identity = undefined;
    attestation.launchToken = undefined;
    attestation.path = undefined;
    attestation.pathGuard = undefined;
    attestation.sourcePin = undefined;
    attestation.stage = 'RETIRED';
  }
  launch.attestationToken = undefined;
  launch.stage = 'RETIRED';
  launch.child = undefined;
  if (attestationToken) ATTESTATIONS.delete(attestationToken);
  ATTESTATION_LAUNCHES.delete(launchToken);
  if (EXECUTABLE_PATH_GUARDS.has(pathGuard)) await closeExecutablePathGuard(pathGuard);
  return true;
}

async function assertDevNull() {
  let handle;
  try {
    const before = await lstat(DEV_NULL, { bigint: true });
    if (!before.isCharacterDevice() || before.isSymbolicLink()) fail();
    const { O_CLOEXEC = 0, O_NOFOLLOW, O_RDWR } = fsConstants;
    handle = await open(DEV_NULL, O_RDWR | O_NOFOLLOW | O_CLOEXEC);
    const opened = await handle.stat({ bigint: true });
    if (!opened.isCharacterDevice() || !sameGeneration(before, opened)) fail();
    const after = await lstat(DEV_NULL, { bigint: true });
    if (!sameGeneration(opened, after)) fail();
    return true;
  } catch {
    fail();
  } finally {
    try { await handle?.close(); } catch {}
  }
}

async function assertRuntimeDirectoryState(state) {
  const [canonical, pathStat, handleStat, entries] = await Promise.all([
    realpath(state.path),
    lstat(state.path, { bigint: true }),
    state.handle.stat({ bigint: true }),
    readdir(state.path),
  ]);
  if (canonical !== state.path || !pathStat.isDirectory() || pathStat.isSymbolicLink() ||
      pathStat.uid !== BigInt(state.uid) || mode(pathStat) !== 0o700 ||
      !sameGeneration(pathStat, state.identity) || !sameGeneration(pathStat, handleStat) ||
      !ARRAY_IS_ARRAY(entries) || entries.length !== 0) fail();
}

async function createRuntimeDirectory() {
  let path;
  let handle;
  try {
    path = await mkdtemp(join(tmpdir(), 'gate-b-quick-tunnel-'));
    await chmod(path, 0o700);
    path = await realpath(path);
    const uid = exactCurrentUid();
    const pathStat = await lstat(path, { bigint: true });
    const { O_DIRECTORY, O_NOFOLLOW, O_RDONLY } = fsConstants;
    handle = await open(path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW);
    const handleStat = await handle.stat({ bigint: true });
    if (!pathStat.isDirectory() || pathStat.isSymbolicLink() ||
        pathStat.uid !== BigInt(uid) || mode(pathStat) !== 0o700 ||
        !sameGeneration(pathStat, handleStat)) fail();
    const token = Object.freeze(Object.create(null));
    const state = { path, uid, identity: handleStat, handle, closed: false };
    RUNTIME_DIRECTORIES.set(token, state);
    await assertRuntimeDirectoryState(state);
    return token;
  } catch {
    try { await handle?.close(); } catch {}
    fail();
  }
}

function runtimeDirectoryPath(token) {
  const state = RUNTIME_DIRECTORIES.get(token);
  if (!state || state.closed) fail();
  return state.path;
}

async function removeRuntimeDirectory(token) {
  const state = RUNTIME_DIRECTORIES.get(token);
  if (!state || state.closed) fail();
  try {
    await assertRuntimeDirectoryState(state);
    await state.handle.close();
    state.closed = true;
    await rmdir(state.path);
    try {
      await lstat(state.path, { bigint: true });
      fail();
    } catch (candidate) {
      if (!candidate || candidate.code !== 'ENOENT') fail();
    }
    return true;
  } catch {
    fail();
  }
}

function sleep(milliseconds, signal) {
  return new Promise((resolveSleep, rejectSleep) => {
    if (signal?.aborted) return rejectSleep(error());
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', aborted);
      resolveSleep(true);
    }, milliseconds);
    const aborted = () => {
      clearTimeout(timer);
      rejectSleep(error());
    };
    signal?.addEventListener('abort', aborted, { once: true });
  });
}

async function readGateBQuickTunnelFrameFromFd(fd = BOOTSTRAP_FD) {
  const chunks = [];
  let total = 0;
  try {
    if (!Number.isSafeInteger(fd) || fd < 0) fail();
    const stream = createReadStream(null, { fd, autoClose: true, highWaterMark: 1024 });
    for await (const chunk of stream) {
      if (!Buffer.isBuffer(chunk)) fail();
      total += chunk.length;
      if (!Number.isSafeInteger(total) || total > GATE_B_QUICK_TUNNEL_LIMITS.frameBytes) fail();
      chunks.push(chunk);
    }
    if (total < 5) fail();
    return Buffer.concat(chunks, total);
  } catch {
    fail();
  } finally {
    for (const chunk of chunks) chunk.fill(0);
  }
}

function boundedChildOutput(chunks, state, chunk, maximum) {
  if (!Buffer.isBuffer(chunk)) fail();
  state.total += chunk.length;
  if (!Number.isSafeInteger(state.total) || state.total > maximum) {
    chunk.fill(0);
    fail();
  }
  chunks.push(chunk);
}

async function runLsof({ pid, signal }) {
  const chunks = [];
  const state = { total: 0 };
  let child;
  try {
    if (!Number.isSafeInteger(pid) || pid < 1 || !signal || typeof signal !== 'object') fail();
    child = spawn(LSOF_EXECUTABLE, [
      '-nP', '-a', '-p', String(pid), '-iTCP', '-sTCP:LISTEN', '-F0pftnPT',
    ], {
      cwd: '/',
      env: {},
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
      timeout: 2_000,
      killSignal: 'SIGKILL',
      windowsHide: true,
    });
    if (!child || typeof child.on !== 'function' || !child.stdout || !child.stderr) fail();
    child.stdout.on('data', chunk => {
      try { boundedChildOutput(chunks, state, chunk, LSOF_MAX_BYTES); }
      catch { try { child.kill('SIGKILL'); } catch {} }
    });
    let stderrBytes = 0;
    child.stderr.on('data', chunk => {
      if (Buffer.isBuffer(chunk)) {
        stderrBytes += chunk.length;
        chunk.fill(0);
      } else stderrBytes = 1;
    });
    const result = await new Promise((resolveChild, rejectChild) => {
      let exited = false;
      let exitCode;
      let exitSignal;
      let childError = false;
      child.on('error', () => { childError = true; });
      child.on('exit', (code, childSignal) => {
        exited = true;
        exitCode = code;
        exitSignal = childSignal;
      });
      child.on('close', (code, childSignal) => {
        if (childError || !exited || code !== exitCode || childSignal !== exitSignal ||
            (code !== 0 && code !== 1) || childSignal !== null || stderrBytes !== 0) {
          rejectChild(error());
        } else {
          resolveChild(code);
        }
      });
    });
    if ((result === 0 && state.total < 1) || (result === 1 && state.total !== 0)) fail();
    if (result === 1) return Buffer.alloc(0);
    return Buffer.concat(chunks, state.total);
  } catch {
    try { child?.kill('SIGKILL'); } catch {}
    fail();
  } finally {
    for (const chunk of chunks) chunk.fill(0);
  }
}

function normalizeHttpHeaders(rawHeaders, rawTrailers) {
  if (!ARRAY_IS_ARRAY(rawHeaders) || rawHeaders.length < 4 || rawHeaders.length > 8 ||
      rawHeaders.length % 2 !== 0 || !ARRAY_IS_ARRAY(rawTrailers) ||
      rawTrailers.length !== 0) fail();
  const values = new Map();
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index];
    const value = rawHeaders[index + 1];
    if (typeof name !== 'string' || typeof value !== 'string') fail();
    const lower = name.toLowerCase();
    if (!['connection', 'content-length', 'content-type', 'date'].includes(lower) ||
        values.has(lower)) fail();
    values.set(lower, value);
  }
  if (values.get('connection') !== 'close' ||
      values.get('content-type') !== 'text/plain; charset=utf-8' ||
      !/^(?:0|[1-9][0-9]{0,2})$/.test(values.get('content-length') ?? '') ||
      !values.has('date')) fail();
  const date = values.get('date');
  const parsedDate = new Date(date);
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toUTCString() !== date) fail();
  return [
    'Content-Type', values.get('content-type'),
    'Content-Length', values.get('content-length'),
  ];
}

async function httpGet({ port, path, signal }) {
  const chunks = [];
  let total = 0;
  let request;
  try {
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535 || port === ORIGIN_PORT ||
        (path !== '/quicktunnel' && path !== '/ready') ||
        !signal || typeof signal !== 'object') fail();
    return await new Promise((resolveResponse, rejectResponse) => {
      let settled = false;
      const finish = (candidate, failed = false) => {
        if (settled) return;
        settled = true;
        if (failed) rejectResponse(error());
        else resolveResponse(candidate);
      };
      request = httpRequest({
        agent: false,
        family: 4,
        headers: { 'Accept-Encoding': 'identity', Connection: 'close' },
        hostname: '127.0.0.1',
        joinDuplicateHeaders: false,
        maxHeaderSize: 4096,
        method: 'GET',
        path,
        port,
        protocol: 'http:',
        setHost: true,
        signal,
      }, response => {
        response.on('data', chunk => {
          if (!Buffer.isBuffer(chunk)) return finish(undefined, true);
          total += chunk.length;
          if (!Number.isSafeInteger(total) || total > 256) {
            chunk.fill(0);
            response.destroy();
            return finish(undefined, true);
          }
          chunks.push(chunk);
        });
        response.on('aborted', () => finish(undefined, true));
        response.on('error', () => finish(undefined, true));
        response.on('end', () => {
          try {
            if (!response.socket || response.socket.remoteAddress !== '127.0.0.1' ||
                response.socket.remotePort !== port) fail();
            const body = Buffer.concat(chunks, total);
            const normalized = normalizeHttpHeaders(response.rawHeaders, response.rawTrailers);
            finish({
              body,
              complete: response.complete,
              httpVersion: response.httpVersion,
              rawHeaders: normalized,
              rawTrailers: [],
              statusCode: response.statusCode,
            });
          } catch {
            finish(undefined, true);
          }
        });
      });
      request.setTimeout(2_000, () => request.destroy(error()));
      request.on('error', () => finish(undefined, true));
      request.end();
    });
  } catch {
    try { request?.destroy(); } catch {}
    fail();
  } finally {
    for (const chunk of chunks) chunk.fill(0);
  }
}

function exactIpc(value) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) ||
      typeof value.on !== 'function' || typeof value.removeListener !== 'function' ||
      typeof value.send !== 'function' || typeof value.disconnect !== 'function') fail();
  return value;
}

function exactInjections(value) {
  const output = {
    architecture: process.arch,
    platform: process.platform,
    ipc: process,
    readBootstrapFrame: () => readGateBQuickTunnelFrameFromFd(),
    openWorkspace: openGateBPublicWsPrivateWorkspace,
    inspectExecutable,
    inspectExecutableAcl: inspectDarwinAcl,
    lstatExecutablePath: lstat,
    monotonicNow: () => performance.now(),
    openExecutablePath: open,
    readExecutableHash: readExactFileHash,
    realpathExecutablePath: realpath,
    assertDevNull,
    createRuntimeDirectory,
    runtimeDirectoryPath,
    removeRuntimeDirectory,
    spawnProcess: spawn,
    spawnSyncProcess: spawnSync,
    scheduleTimer: setTimeout,
    cancelTimer: clearTimeout,
    runLsof,
    httpGet,
    sleep,
    startupTimeoutMs: STARTUP_TIMEOUT_MS,
    checkTimeoutMs: CHECK_TIMEOUT_MS,
    shutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS,
    hardLifetimeMs: HARD_LIFETIME_MS,
    observationGapMs: OBSERVATION_GAP_MS,
    reapForceMs: REAP_FORCE_MS,
  };
  if (value !== undefined) {
    exactPlainObject(value, Object.keys(output));
    for (const key of REFLECT_OWN_KEYS(value)) output[key] = value[key];
  }
  if (output.platform !== 'darwin' || output.architecture !== 'arm64') fail();
  exactIpc(output.ipc);
  for (const name of [
    'readBootstrapFrame', 'openWorkspace', 'inspectExecutable', 'assertDevNull',
    'inspectExecutableAcl', 'lstatExecutablePath', 'openExecutablePath',
    'monotonicNow', 'readExecutableHash', 'realpathExecutablePath',
    'createRuntimeDirectory', 'runtimeDirectoryPath', 'removeRuntimeDirectory',
    'spawnProcess', 'spawnSyncProcess', 'scheduleTimer', 'cancelTimer',
    'runLsof', 'httpGet', 'sleep',
  ]) {
    if (typeof output[name] !== 'function') fail();
  }
  for (const name of [
    'startupTimeoutMs', 'checkTimeoutMs', 'shutdownTimeoutMs', 'hardLifetimeMs',
    'observationGapMs', 'reapForceMs',
  ]) {
    if (!Number.isSafeInteger(output[name]) || output[name] < 1) fail();
  }
  if (output.startupTimeoutMs > STARTUP_TIMEOUT_MS ||
      output.checkTimeoutMs > CHECK_TIMEOUT_MS ||
      output.shutdownTimeoutMs > SHUTDOWN_TIMEOUT_MS ||
      output.hardLifetimeMs > HARD_LIFETIME_MS ||
      output.observationGapMs > OBSERVATION_GAP_MS ||
      output.reapForceMs > REAP_FORCE_MS ||
      output.reapForceMs >= output.shutdownTimeoutMs) fail();
  return output;
}

function exactChild(child) {
  if (!child || typeof child !== 'object' || typeof child.on !== 'function' ||
      typeof child.once !== 'function' || typeof child.kill !== 'function' ||
      !Number.isSafeInteger(child.pid) || child.pid < 1) fail();
  return child;
}

function assertLive(state) {
  if (!state.child || state.exitObserved || state.closeObserved ||
      (state.child.exitCode !== undefined && state.child.exitCode !== null) ||
      (state.child.signalCode !== undefined && state.child.signalCode !== null)) fail();
}

function sameObservation(left, right) {
  return sameObservationIdentity(left, right) && left.status === right.status &&
    left.readyConnections === right.readyConnections;
}

function sameObservationIdentity(left, right) {
  return left.pid === right.pid && left.port === right.port &&
    left.hostname === right.hostname && left.connectorId === right.connectorId;
}

function readyObservation(value) {
  return value?.status === 200 && value?.readyConnections === 1;
}

async function observe(state, signal, startup = false) {
  if (typeof startup !== 'boolean') fail();
  assertLive(state);
  const firstLsofBytes = await Reflect.apply(state.dependencies.runLsof, undefined, [{
    pid: state.child.pid,
    signal,
  }]);
  let secondLsofBytes;
  try {
    if (!Buffer.isBuffer(firstLsofBytes)) fail();
    if (firstLsofBytes.length === 0) {
      assertLive(state);
      if (startup) return undefined;
      fail();
    }
    const first = parseGateBQuickTunnelLsofSnapshot(firstLsofBytes, state.child.pid);
    assertLive(state);
    const quickSnapshot = await Reflect.apply(state.dependencies.httpGet, undefined, [{
      port: first.port,
      path: '/quicktunnel',
      signal,
    }]);
    let quick;
    try {
      quick = parseGateBQuickTunnelHttpSnapshot(quickSnapshot);
    } finally {
      if (Buffer.isBuffer(quickSnapshot?.body)) quickSnapshot.body.fill(0);
    }
    assertLive(state);
    const readySnapshot = await Reflect.apply(state.dependencies.httpGet, undefined, [{
      port: first.port,
      path: '/ready',
      signal,
    }]);
    let ready;
    try {
      ready = startup
        ? parseGateBQuickTunnelStartupReadyHttpSnapshot(readySnapshot)
        : parseGateBQuickTunnelReadyHttpSnapshot(readySnapshot);
    } finally {
      if (Buffer.isBuffer(readySnapshot?.body)) readySnapshot.body.fill(0);
    }
    assertLive(state);
    secondLsofBytes = await Reflect.apply(state.dependencies.runLsof, undefined, [{
      pid: state.child.pid,
      signal,
    }]);
    const second = parseGateBQuickTunnelLsofSnapshot(secondLsofBytes, state.child.pid);
    assertLive(state);
    if (first.port !== second.port) fail();
    return Object.freeze({
      connectorId: ready.connectorId,
      hostname: quick.hostname,
      pid: state.child.pid,
      port: first.port,
      readyConnections: ready.readyConnections,
      status: ready.status,
    });
  } catch {
    fail();
  } finally {
    if (Buffer.isBuffer(firstLsofBytes)) firstLsofBytes.fill(0);
    if (Buffer.isBuffer(secondLsofBytes)) secondLsofBytes.fill(0);
  }
}

function sendIpc(state, type, requestId, signal) {
  return new Promise((resolveSend, rejectSend) => {
    let settled = false;
    const timeoutMs = state.mode === 'STOPPING'
      ? state.dependencies.shutdownTimeoutMs
      : state.mode === 'CHECKING'
        ? state.dependencies.checkTimeoutMs
        : state.dependencies.startupTimeoutMs;
    const finish = (failed = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', aborted);
      if (failed) rejectSend(error());
      else resolveSend(true);
    };
    const aborted = () => finish(true);
    const timer = setTimeout(() => finish(true), timeoutMs);
    if (signal?.aborted) return finish(true);
    signal?.addEventListener('abort', aborted, { once: true });
    try {
      const accepted = state.dependencies.ipc.send(
        createGateBQuickTunnelIpcMessage(type, requestId),
        sendError => {
          finish(Boolean(sendError));
        },
      );
      if (accepted === false && state.dependencies.ipc.connected === false) finish(true);
    } catch {
      finish(true);
    }
  });
}

function boundedWait(dependencies, promise, timeoutMs) {
  return new Promise((resolveWait, rejectWait) => {
    let settled = false;
    let timer;
    const finish = (failed, value) => {
      if (settled) return;
      settled = true;
      try {
        if (timer !== undefined) {
          Reflect.apply(dependencies.cancelTimer, undefined, [timer]);
        }
      } catch {
        rejectWait(error());
        return;
      }
      if (failed) rejectWait(error());
      else resolveWait(value);
    };
    Promise.resolve(promise).then(
      value => finish(false, value),
      () => finish(true),
    );
    try {
      timer = Reflect.apply(dependencies.scheduleTimer, undefined, [
        () => finish(false, false),
        timeoutMs,
      ]);
    } catch {
      finish(true);
    }
  });
}

function shutdownBudgets(dependencies) {
  const terminateMs = Math.min(
    dependencies.reapForceMs,
    dependencies.shutdownTimeoutMs - 1,
  );
  return {
    forceMs: dependencies.shutdownTimeoutMs - terminateMs,
    terminateMs,
  };
}

function createChildState(state, child) {
  state.child = child;
  state.child = exactChild(state.child);
  state.spawnIdentityKnown = true;
  state.exitObserved = false;
  state.closeObserved = false;
  state.exitCode = undefined;
  state.exitSignal = undefined;
  state.closeCode = undefined;
  state.closeSignal = undefined;
  state.childClosedPromise = new Promise(resolveClosed => {
    state.resolveChildClosed = resolveClosed;
  });
  state.child.on('error', () => state.failController());
  state.child.on('exit', (code, signal) => {
    if (state.exitObserved) return state.failController();
    state.exitObserved = true;
    state.exitCode = code;
    state.exitSignal = signal;
    if (!state.stopping) state.failController();
  });
  state.child.on('close', (code, signal) => {
    if (state.closeObserved) return state.failController();
    state.closeObserved = true;
    state.closeCode = code;
    state.closeSignal = signal;
    state.resolveChildClosed(true);
    if (!state.stopping) state.failController();
  });
}

async function reapUnvalidatedChild(state) {
  const child = state.child;
  if (!child || (typeof child !== 'object' && typeof child !== 'function')) return false;
  let closed = false;
  let resolveClosed;
  const closedPromise = new Promise(resolve => { resolveClosed = resolve; });
  try {
    if (typeof child.once === 'function') {
      Reflect.apply(child.once, child, ['close', () => {
        closed = true;
        resolveClosed(true);
      }]);
    }
  } catch {}
  const directKill = signal => {
    try {
      if (typeof child.kill === 'function') Reflect.apply(child.kill, child, [signal]);
    } catch {}
  };
  const budgets = shutdownBudgets(state.dependencies);
  directKill('SIGTERM');
  await boundedWait(state.dependencies, closedPromise, budgets.terminateMs);
  if (!closed) {
    directKill('SIGKILL');
    await boundedWait(state.dependencies, closedPromise, budgets.forceMs);
  }
  return false;
}

async function stopChild(state) {
  if (!state.child) {
    if (state.spawnAttempted) fail();
    return true;
  }
  state.stopping = true;
  if (!state.spawnIdentityKnown) {
    await reapUnvalidatedChild(state);
    fail();
  }
  if (!state.closeObserved) {
    const budgets = shutdownBudgets(state.dependencies);
    try { state.child.kill('SIGTERM'); } catch {}
    const closed = await boundedWait(
      state.dependencies,
      state.childClosedPromise,
      budgets.terminateMs,
    );
    if (closed !== true) {
      try { state.child.kill('SIGKILL'); } catch {}
      const forced = await boundedWait(
        state.dependencies,
        state.childClosedPromise,
        budgets.forceMs,
      );
      if (forced !== true) fail();
    }
  }
  if (!state.exitObserved || !state.closeObserved) fail();
  return true;
}

async function cleanup(state) {
  if (state.cleanupPromise) return state.cleanupPromise;
  state.cleanupPromise = (async () => {
    let failed = false;
    try { await stopChild(state); } catch { failed = true; }
    if (state.runtimeDirectory) {
      if (!state.spawnAttempted || (state.spawnIdentityKnown && state.closeObserved)) {
        try {
          await Reflect.apply(state.dependencies.removeRuntimeDirectory, undefined, [
            state.runtimeDirectory,
          ]);
        } catch { failed = true; }
      } else {
        failed = true;
      }
    }
    if (state.attestationLaunch) {
      try {
        await retireAttestationLaunch(state.attestationLaunch);
      } catch { failed = true; }
    }
    try { await state.workspace?.close(); } catch { failed = true; }
    if (failed) fail();
    return true;
  })();
  return state.cleanupPromise;
}

function createStartupPollBudget(state) {
  assertLive(state);
  const startedAt = Reflect.apply(state.dependencies.monotonicNow, undefined, []);
  const deadline = startedAt + state.dependencies.startupTimeoutMs;
  const maximumAttempts = Math.ceil(
    state.dependencies.startupTimeoutMs / state.dependencies.observationGapMs,
  );
  if (!Number.isFinite(startedAt) || startedAt < 0 || !Number.isFinite(deadline) ||
      !Number.isSafeInteger(maximumAttempts) || maximumAttempts < 1) fail();
  return {
    child: state.child,
    deadline,
    lastObservedAt: startedAt,
    maximumAttempts,
    pid: state.child.pid,
  };
}

function startupRemaining(state, budget) {
  const now = Reflect.apply(state.dependencies.monotonicNow, undefined, []);
  if (!Number.isFinite(now) || now < budget.lastObservedAt || now >= budget.deadline) fail();
  budget.lastObservedAt = now;
  const remaining = Math.floor(budget.deadline - now);
  if (!Number.isSafeInteger(remaining) || remaining < 1) fail();
  return remaining;
}

async function startupGap(state, budget) {
  if (startupRemaining(state, budget) < state.dependencies.observationGapMs) fail();
  const slept = await Reflect.apply(state.dependencies.sleep, undefined, [
    state.dependencies.observationGapMs,
    state.startupAbort.signal,
  ]);
  if (slept !== true) fail();
  startupRemaining(state, budget);
}

function assertStartupActivation(state, budget, observation) {
  if (state.mode !== 'STARTING' || state.startupAbort.signal.aborted || state.settled ||
      state.stopping || state.cleanupPromise !== undefined || state.child !== budget.child ||
      state.child?.pid !== budget.pid || observation?.pid !== budget.pid ||
      !readyObservation(observation)) fail();
  assertLive(state);
  startupRemaining(state, budget);
}

function createCheckPollBudget(state, requestId, controller) {
  assertLive(state);
  const startedAt = Reflect.apply(state.dependencies.monotonicNow, undefined, []);
  const deadline = startedAt + state.dependencies.checkTimeoutMs;
  const maximumAttempts = Math.ceil(
    state.dependencies.checkTimeoutMs / state.dependencies.observationGapMs,
  );
  if (!Number.isFinite(startedAt) || startedAt < 0 || !Number.isFinite(deadline) ||
      !Number.isSafeInteger(maximumAttempts) || maximumAttempts < 1 ||
      state.mode !== 'CHECKING' || state.pendingCheckId !== requestId ||
      controller.signal.aborted) fail();
  return {
    child: state.child,
    deadline,
    lastObservedAt: startedAt,
    maximumAttempts,
    pid: state.child.pid,
  };
}

function checkRemaining(state, budget, requestId, controller) {
  if (state.mode !== 'CHECKING' || state.pendingCheckId !== requestId ||
      controller.signal.aborted || state.child !== budget.child ||
      state.child?.pid !== budget.pid) fail();
  assertLive(state);
  const now = Reflect.apply(state.dependencies.monotonicNow, undefined, []);
  if (!Number.isFinite(now) || now < budget.lastObservedAt || now >= budget.deadline) fail();
  budget.lastObservedAt = now;
  const remaining = Math.floor(budget.deadline - now);
  if (!Number.isSafeInteger(remaining) || remaining < 1) fail();
  return remaining;
}

async function checkGap(state, budget, requestId, controller) {
  if (checkRemaining(state, budget, requestId, controller) <
      state.dependencies.observationGapMs) fail();
  const slept = await Reflect.apply(state.dependencies.sleep, undefined, [
    state.dependencies.observationGapMs,
    controller.signal,
  ]);
  if (slept !== true) fail();
  checkRemaining(state, budget, requestId, controller);
}

async function initialReadiness(state, quickTunnel) {
  const budget = createStartupPollBudget(state);
  let provisional;
  let stableReady;
  let consecutiveReady = 0;
  for (let attempt = 0; attempt < budget.maximumAttempts; attempt += 1) {
    startupRemaining(state, budget);
    const candidate = await observe(state, state.startupAbort.signal, true);
    startupRemaining(state, budget);
    if (candidate === undefined) {
      stableReady = undefined;
      consecutiveReady = 0;
    } else {
      if (provisional !== undefined && !sameObservationIdentity(candidate, provisional)) fail();
      if (provisional === undefined) provisional = candidate;
      if (readyObservation(candidate)) {
        if (stableReady !== undefined && !sameObservation(stableReady, candidate)) fail();
        stableReady = candidate;
        consecutiveReady += 1;
        if (consecutiveReady === STARTUP_READY_OBSERVATIONS) break;
      } else {
        stableReady = undefined;
        consecutiveReady = 0;
      }
    }
    if (attempt + 1 >= budget.maximumAttempts) fail();
    await startupGap(state, budget);
  }
  if (stableReady === undefined ||
      consecutiveReady !== STARTUP_READY_OBSERVATIONS) fail();
  let source = serializeGateBQuickTunnelHostnameSource(stableReady.hostname, quickTunnel);
  try {
    await state.workspace.write(state.hostnameRecord, source);
    await state.workspace.syncDirectories();
  } finally {
    source.fill(0);
  }
  const reread = await state.workspace.read(state.hostnameRecord);
  try {
    const parsed = parseGateBQuickTunnelHostnameSource(reread);
    if (parsed.hostname !== stableReady.hostname ||
        validateGateBQuickTunnelStableBinding(parsed.quickTunnel) !== true) fail();
  } finally {
    reread.fill(0);
  }
  assertStartupActivation(state, budget, stableReady);
  if (completeAttestationSourceWrite(
    state.attestationLaunch,
    state.attestation,
  ) !== true) fail();
  state.pinned = stableReady;
  quickTunnel = undefined;
  return budget;
}

async function freshCheck(state, requestId, controller) {
  const timer = setTimeout(() => controller.abort(), state.dependencies.checkTimeoutMs);
  try {
    const budget = createCheckPollBudget(state, requestId, controller);
    let current;
    for (let attempt = 0; attempt < budget.maximumAttempts; attempt += 1) {
      checkRemaining(state, budget, requestId, controller);
      const candidate = await observe(state, controller.signal, true);
      checkRemaining(state, budget, requestId, controller);
      if (candidate === undefined) {
        current = undefined;
      } else {
        if (!sameObservationIdentity(candidate, state.pinned)) fail();
        if (readyObservation(candidate)) {
          current = candidate;
          break;
        }
        if (candidate.status !== 503 || candidate.readyConnections !== 0) fail();
        current = undefined;
      }
      if (attempt + 1 >= budget.maximumAttempts) fail();
      await checkGap(state, budget, requestId, controller);
    }
    if (current === undefined) fail();
    if (!sameObservation(current, state.pinned)) fail();
    const versionAttestor = executablePath => attestVersion(
      executablePath,
      state.dependencies.spawnSyncProcess,
    );
    if (await verifyRetainedAttestation(
      state.attestationLaunch,
      state.attestation,
      state.child,
      versionAttestor,
      state.dependencies.inspectExecutable,
      state.dependencies.platform,
      state.dependencies.architecture,
      state.dependencies,
    ) !== true) fail();
    await sendIpc(
      state,
      GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED,
      requestId,
      controller.signal,
    );
    if (state.mode !== 'CHECKING' || state.pendingCheckId !== requestId ||
        controller.signal.aborted) return;
    state.pendingCheckId = undefined;
    state.checkController = undefined;
    state.mode = 'ACTIVE_IDLE';
  } catch {
    if (state.mode === 'STOPPING' && controller.signal.aborted) return;
    state.failController();
  } finally {
    clearTimeout(timer);
  }
}

async function completeNormalStop(state, requestId) {
  await cleanup(state);
  await sendIpc(state, GATE_B_QUICK_TUNNEL_IPC_TYPES.STOPPED, requestId);
  if (state.mode !== 'STOPPING' || state.settled) return;
  const released = releaseIpc(state);
  state.mode = released ? 'STOPPED' : 'FAILED';
  state.settled = true;
  if (released) state.resolveController(true);
  else state.rejectController(error());
}

function releaseIpc(state) {
  if (state.ipcReleased) return state.ipcReleaseSucceeded;
  state.ipcReleased = true;
  const ipc = state.dependencies.ipc;
  let failed = false;
  try { Reflect.apply(ipc.removeListener, ipc, ['message', state.onMessage]); } catch {
    failed = true;
  }
  try { Reflect.apply(ipc.removeListener, ipc, ['disconnect', state.onDisconnect]); } catch {
    failed = true;
  }
  let channel;
  try { channel = ipc.channel; } catch { failed = true; }
  try {
    if (channel && typeof channel.unref === 'function') {
      Reflect.apply(channel.unref, channel, []);
    }
  } catch { failed = true; }
  state.intentionalDisconnect = true;
  let connected = true;
  try { connected = ipc.connected !== false; } catch { failed = true; }
  try {
    if (connected) Reflect.apply(ipc.disconnect, ipc, []);
  } catch { failed = true; }
  try {
    if (ipc.connected !== false) failed = true;
  } catch { failed = true; }
  state.ipcReleaseSucceeded = !failed;
  return state.ipcReleaseSucceeded;
}

async function startTunnel(state, bootstrap) {
  state.mode = 'STARTING';
  state.attestationLaunch = createAttestationLaunch();
  await Reflect.apply(state.dependencies.assertDevNull, undefined, []);
  state.runtimeDirectory = await Reflect.apply(
    state.dependencies.createRuntimeDirectory,
    undefined,
    [],
  );
  const runtimePath = Reflect.apply(
    state.dependencies.runtimeDirectoryPath,
    undefined,
    [state.runtimeDirectory],
  );
  exactCanonicalPath(runtimePath);
  const versionAttestor = executablePath => attestVersion(
    executablePath,
    state.dependencies.spawnSyncProcess,
  );
  state.attestation = await attestExecutable(
    bootstrap.cloudflaredExecutable,
    bootstrap.sourcePin,
    undefined,
    versionAttestor,
    state.attestationLaunch,
    undefined,
    state.dependencies.inspectExecutable,
    state.dependencies.platform,
    state.dependencies.architecture,
    state.dependencies,
  );
  await assertAttestationPathGuard(
    state.attestationLaunch,
    state.attestation,
    state.dependencies.inspectExecutable,
    state.dependencies,
  );
  state.spawnAttempted = true;
  state.child = Reflect.apply(state.dependencies.spawnProcess, undefined, [
    bootstrap.cloudflaredExecutable,
    [...CLOUDFLARED_ARGUMENTS],
    {
      argv0: CLOUDFLARED_ARGV0,
      cwd: runtimePath,
      detached: false,
      env: { HOME: runtimePath, TMPDIR: runtimePath },
      shell: false,
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
    },
  ]);
  createChildState(state, state.child);
  const after = await attestExecutable(
    bootstrap.cloudflaredExecutable,
    bootstrap.sourcePin,
    state.attestation,
    versionAttestor,
    state.attestationLaunch,
    state.child,
    state.dependencies.inspectExecutable,
    state.dependencies.platform,
    state.dependencies.architecture,
    state.dependencies,
  );
  if (after !== state.attestation) fail();
  const quickTunnel = artifactBindingFromAttestation(
    state.attestationLaunch,
    state.attestation,
    state.child,
    bootstrap.telemetryMode,
    bootstrap.telemetryAcknowledgement,
  );
  if (validateGateBQuickTunnelStableBinding(quickTunnel) !== true) fail();
  bootstrap = undefined;
  const startupBudget = await initialReadiness(state, quickTunnel);
  assertStartupActivation(state, startupBudget, state.pinned);
  clearTimeout(state.startupTimer);
  state.mode = 'ACTIVE_IDLE';
  state.hardLifetimeTimer = setTimeout(
    () => state.failController(),
    state.dependencies.hardLifetimeMs,
  );
  await sendIpc(state, GATE_B_QUICK_TUNNEL_IPC_TYPES.ACTIVE, 1);
}

export async function superviseGateBQuickTunnel(injected) {
  let frame;
  let bootstrap;
  const dependencies = exactInjections(injected);
  const state = {
    dependencies,
    mode: 'BOOTSTRAP',
    expectedRequestId: 2,
    pendingCheckId: undefined,
    checkController: undefined,
    startupAbort: new AbortController(),
    workspace: undefined,
    hostnameRecord: undefined,
    runtimeDirectory: undefined,
    attestationLaunch: undefined,
    attestation: undefined,
    child: undefined,
    spawnAttempted: false,
    spawnIdentityKnown: false,
    stopping: false,
    cleanupPromise: undefined,
    settled: false,
    intentionalDisconnect: false,
    ipcReleased: false,
    ipcReleaseSucceeded: undefined,
    onMessage: undefined,
    onDisconnect: undefined,
  };
  let resolveController;
  let rejectController;
  const controllerPromise = new Promise((resolve, reject) => {
    resolveController = resolve;
    rejectController = reject;
  });
  state.resolveController = resolveController;
  state.rejectController = rejectController;
  void controllerPromise.catch(() => {});
  state.failController = () => {
    if (state.settled || state.mode === 'FAILING') return;
    state.mode = 'FAILING';
    state.startupAbort.abort();
    state.checkController?.abort();
    clearTimeout(state.startupTimer);
    clearTimeout(state.hardLifetimeTimer);
    void cleanup(state).catch(() => {}).finally(() => {
      if (state.settled) return;
      state.mode = 'FAILED';
      state.settled = true;
      releaseIpc(state);
      rejectController(error());
    });
  };
  const onMessage = candidate => {
    let message;
    try { message = parseGateBQuickTunnelIpcMessage(candidate); }
    catch { state.failController(); return; }
    if (state.mode === 'WAIT_START') {
      if (message.type !== GATE_B_QUICK_TUNNEL_IPC_TYPES.START ||
          message.requestId !== 1) return state.failController();
      void startTunnel(state, bootstrap).catch(() => state.failController());
      bootstrap = undefined;
      return;
    }
    if (state.mode === 'ACTIVE_IDLE') {
      if (message.requestId !== state.expectedRequestId) return state.failController();
      if (message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK) {
        if (state.expectedRequestId >= Number.MAX_SAFE_INTEGER) {
          return state.failController();
        }
        state.expectedRequestId += 1;
        state.pendingCheckId = message.requestId;
        state.mode = 'CHECKING';
        state.checkController = new AbortController();
        void freshCheck(state, message.requestId, state.checkController);
        return;
      }
      if (message.type === GATE_B_QUICK_TUNNEL_IPC_TYPES.STOP) {
        state.mode = 'STOPPING';
        clearTimeout(state.hardLifetimeTimer);
        void completeNormalStop(state, message.requestId).catch(() => state.failController());
        return;
      }
      state.failController();
      return;
    }
    if (state.mode === 'CHECKING') {
      if (message.type !== GATE_B_QUICK_TUNNEL_IPC_TYPES.STOP ||
          message.requestId !== state.expectedRequestId) return state.failController();
      state.mode = 'STOPPING';
      state.pendingCheckId = undefined;
      state.checkController.abort();
      clearTimeout(state.hardLifetimeTimer);
      void completeNormalStop(state, message.requestId).catch(() => state.failController());
      return;
    }
    state.failController();
  };
  const onDisconnect = () => {
    if (!state.intentionalDisconnect && !state.settled) state.failController();
  };
  state.onMessage = onMessage;
  state.onDisconnect = onDisconnect;
  dependencies.ipc.on('message', onMessage);
  dependencies.ipc.on('disconnect', onDisconnect);
  state.startupTimer = setTimeout(() => state.failController(), dependencies.startupTimeoutMs);
  try {
    frame = await Reflect.apply(dependencies.readBootstrapFrame, undefined, []);
    if (!Buffer.isBuffer(frame)) fail();
    bootstrap = parseGateBQuickTunnelBootstrapFrame(frame);
    frame.fill(0);
    frame = undefined;
    state.workspace = await Reflect.apply(dependencies.openWorkspace, undefined, [
      bootstrap.workspaceRoot,
    ]);
    if (!state.workspace || typeof state.workspace.reserveOutputs !== 'function' ||
        typeof state.workspace.write !== 'function' ||
        typeof state.workspace.read !== 'function' ||
        typeof state.workspace.syncDirectories !== 'function' ||
        typeof state.workspace.close !== 'function') fail();
    const records = await state.workspace.reserveOutputs([
      GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
    ]);
    if (!ARRAY_IS_ARRAY(records) || records.length !== 1) fail();
    state.hostnameRecord = records[0];
    await state.workspace.syncDirectories();
    state.mode = 'WAIT_START';
    await sendIpc(state, GATE_B_QUICK_TUNNEL_IPC_TYPES.READY, 1);
    return await controllerPromise;
  } catch {
    state.failController();
    try { await controllerPromise; } catch {}
    fail();
  } finally {
    if (Buffer.isBuffer(frame)) frame.fill(0);
    bootstrap = undefined;
  }
}

async function runIfMain() {
  if (typeof process.argv[1] !== 'string' ||
      pathToFileURL(process.argv[1]).href !== import.meta.url) return;
  try {
    if (await superviseGateBQuickTunnel() !== true) process.exitCode = 1;
  } catch {
    process.exitCode = 1;
  }
}

void runIfMain().catch(() => {
  process.exitCode = 1;
});
