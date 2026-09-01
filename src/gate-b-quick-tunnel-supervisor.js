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
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { types as utilTypes } from 'node:util';

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
} from './gate-b-quick-tunnel-schema.js';

const ERROR_CODE = 'gate_b_quick_tunnel_supervisor_failed';
const BOOTSTRAP_FD = 3;
const DEV_NULL = '/dev/null';
const LSOF_EXECUTABLE = '/usr/sbin/lsof';
const ORIGIN_PORT = 41000;
const OBSERVATION_GAP_MS = 250;
const STARTUP_TIMEOUT_MS = 60_000;
const CHECK_TIMEOUT_MS = 10_000;
const SHUTDOWN_TIMEOUT_MS = 10_000;
const HARD_LIFETIME_MS = 10 * 60_000;
const REAP_FORCE_MS = 500;
const RUNTIME_MAX_BYTES = 256 * 1024 * 1024;
const LSOF_MAX_BYTES = GATE_B_QUICK_TUNNEL_LIMITS.lsofBytes;
const VERSION_MAX_BYTES = 256;
const CLOUDFLARED_VERSION_OUTPUT =
  /^cloudflared version 2026\.8\.2 \(built [A-Za-z0-9:+._ -]{1,96}\)\n$/;
const CLOUDFLARED_ARGV0 = 'cloudflared';
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const ATTESTATIONS = new WeakMap();
const RUNTIME_DIRECTORIES = new WeakMap();

const CLOUDFLARED_ARGUMENTS = Object.freeze([
  'tunnel',
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
      value.includes('\0') || !isAbsolute(value) || resolve(value) !== value) fail();
  return value;
}

function executableStat(stat, uid) {
  const permissions = mode(stat);
  return stat && typeof stat.isFile === 'function' && stat.isFile() &&
    !stat.isSymbolicLink() && stat.uid === BigInt(uid) && stat.nlink === 1n &&
    stat.size >= 4096n && stat.size <= BigInt(RUNTIME_MAX_BYTES) &&
    (permissions & 0o100) !== 0 && (permissions & 0o6022) === 0;
}

function nativeMachO(header) {
  if (!Buffer.isBuffer(header) || header.length !== 8 ||
      !header.subarray(0, 4).equals(Buffer.from([0xcf, 0xfa, 0xed, 0xfe]))) return false;
  const cpuType = header.readUInt32LE(4);
  if (process.arch === 'arm64') return cpuType === 0x0100000c;
  if (process.arch === 'x64') return cpuType === 0x01000007;
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
    if (!CLOUDFLARED_VERSION_OUTPUT.test(line)) fail();
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

async function attestExecutable(
  executablePath,
  sourcePin,
  previous,
  versionAttestor = attestVersion,
) {
  let handle;
  let digest;
  let expected;
  try {
    exactCanonicalPath(executablePath);
    if (typeof sourcePin !== 'string' || !/^[0-9a-f]{64}$/.test(sourcePin) ||
        await realpath(executablePath) !== executablePath) fail();
    const uid = exactCurrentUid();
    const before = await lstat(executablePath, { bigint: true });
    if (!executableStat(before, uid)) fail();
    const { O_CLOEXEC = 0, O_NOFOLLOW, O_RDONLY } = fsConstants;
    if (![O_CLOEXEC, O_NOFOLLOW, O_RDONLY].every(Number.isInteger) || O_NOFOLLOW === 0) fail();
    handle = await open(executablePath, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
    const opened = await handle.stat({ bigint: true });
    if (!executableStat(opened, uid) || !sameGeneration(before, opened)) fail();
    const header = Buffer.alloc(8);
    try {
      const result = await handle.read(header, 0, header.length, 0);
      if (!result || result.bytesRead !== header.length || !nativeMachO(header)) fail();
    } finally {
      header.fill(0);
    }
    digest = await readExactFileHash(handle, Number(opened.size));
    expected = Buffer.from(sourcePin, 'hex');
    if (expected.length !== digest.length || !timingSafeEqual(digest, expected)) fail();
    if (typeof versionAttestor !== 'function' ||
        await Reflect.apply(versionAttestor, undefined, [executablePath]) !== true) fail();
    const afterHandle = await handle.stat({ bigint: true });
    const afterPath = await lstat(executablePath, { bigint: true });
    if (!sameGeneration(opened, afterHandle) || !sameGeneration(opened, afterPath)) fail();
    const identity = {
      dev: opened.dev,
      ino: opened.ino,
      size: opened.size,
      mode: opened.mode,
      nlink: opened.nlink,
      mtimeNs: opened.mtimeNs,
      ctimeNs: opened.ctimeNs,
      digest: digest.toString('hex'),
    };
    if (previous !== undefined) {
      const prior = ATTESTATIONS.get(previous);
      if (!prior || prior.path !== executablePath ||
          !sameGeneration(prior.identity, identity) || prior.identity.digest !== identity.digest) {
        fail();
      }
      return previous;
    }
    const token = Object.freeze(Object.create(null));
    ATTESTATIONS.set(token, { path: executablePath, identity });
    return token;
  } catch {
    fail();
  } finally {
    try { await handle?.close(); } catch {}
    if (Buffer.isBuffer(digest)) digest.fill(0);
    if (Buffer.isBuffer(expected)) expected.fill(0);
  }
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
            code !== 0 || childSignal !== null || stderrBytes !== 0) rejectChild(error());
        else resolveChild(true);
      });
    });
    if (result !== true || state.total < 1) fail();
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
  if (!value || typeof value !== 'object' || typeof value.on !== 'function' ||
      typeof value.send !== 'function' || typeof value.disconnect !== 'function') fail();
  return value;
}

function exactInjections(value) {
  const output = {
    platform: process.platform,
    ipc: process,
    readBootstrapFrame: () => readGateBQuickTunnelFrameFromFd(),
    openWorkspace: openGateBPublicWsPrivateWorkspace,
    attestExecutable,
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
  if (output.platform !== 'darwin') fail();
  exactIpc(output.ipc);
  for (const name of [
    'readBootstrapFrame', 'openWorkspace', 'attestExecutable', 'assertDevNull',
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
  return left.port === right.port && left.hostname === right.hostname &&
    left.connectorId === right.connectorId;
}

async function observe(state, signal) {
  assertLive(state);
  const firstLsofBytes = await Reflect.apply(state.dependencies.runLsof, undefined, [{
    pid: state.child.pid,
    signal,
  }]);
  let secondLsofBytes;
  try {
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
      ready = parseGateBQuickTunnelReadyHttpSnapshot(readySnapshot);
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
      port: first.port,
      hostname: quick.hostname,
      connectorId: ready.connectorId,
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
    try { await state.workspace?.close(); } catch { failed = true; }
    if (failed) fail();
    return true;
  })();
  return state.cleanupPromise;
}

async function initialReadiness(state, bootstrap) {
  const first = await observe(state, state.startupAbort.signal);
  await Reflect.apply(state.dependencies.sleep, undefined, [
    state.dependencies.observationGapMs,
    state.startupAbort.signal,
  ]);
  const second = await observe(state, state.startupAbort.signal);
  if (!sameObservation(first, second)) fail();
  let source = serializeGateBQuickTunnelHostnameSource(first.hostname);
  try {
    await state.workspace.write(state.hostnameRecord, source);
    await state.workspace.syncDirectories();
  } finally {
    source.fill(0);
  }
  await Reflect.apply(state.dependencies.sleep, undefined, [
    state.dependencies.observationGapMs,
    state.startupAbort.signal,
  ]);
  const final = await observe(state, state.startupAbort.signal);
  if (!sameObservation(first, final)) fail();
  const reread = await state.workspace.read(state.hostnameRecord);
  try {
    const parsed = parseGateBQuickTunnelHostnameSource(reread);
    if (parsed.hostname !== first.hostname) fail();
  } finally {
    reread.fill(0);
  }
  state.pinned = first;
  bootstrap = undefined;
  return true;
}

async function freshCheck(state, requestId, controller) {
  const timer = setTimeout(() => controller.abort(), state.dependencies.checkTimeoutMs);
  try {
    const current = await observe(state, controller.signal);
    if (state.mode !== 'CHECKING' || state.pendingCheckId !== requestId ||
        controller.signal.aborted) return;
    if (!sameObservation(current, state.pinned)) fail();
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
  state.intentionalDisconnect = true;
  Reflect.apply(state.dependencies.ipc.disconnect, state.dependencies.ipc, []);
  if (!state.settled) {
    state.settled = true;
    state.resolveController(true);
  }
}

async function startTunnel(state, bootstrap) {
  state.mode = 'STARTING';
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
  state.attestation = await Reflect.apply(state.dependencies.attestExecutable, undefined, [
    bootstrap.cloudflaredExecutable,
    bootstrap.sourcePin,
    undefined,
    versionAttestor,
  ]);
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
  const after = await Reflect.apply(state.dependencies.attestExecutable, undefined, [
    bootstrap.cloudflaredExecutable,
    bootstrap.sourcePin,
    state.attestation,
    versionAttestor,
  ]);
  if (after !== state.attestation) fail();
  bootstrap = undefined;
  await initialReadiness(state);
  state.mode = 'ACTIVE_IDLE';
  clearTimeout(state.startupTimer);
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
    child: undefined,
    spawnAttempted: false,
    spawnIdentityKnown: false,
    stopping: false,
    cleanupPromise: undefined,
    settled: false,
    intentionalDisconnect: false,
  };
  let resolveController;
  let rejectController;
  const controllerPromise = new Promise((resolve, reject) => {
    resolveController = resolve;
    rejectController = reject;
  });
  state.resolveController = resolveController;
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
      state.settled = true;
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
  dependencies.ipc.on('message', onMessage);
  dependencies.ipc.on('disconnect', () => {
    if (!state.intentionalDisconnect && !state.settled) state.failController();
  });
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
