import { createServer, Socket } from 'node:net';
import { pathToFileURL } from 'node:url';
import { types as utilTypes } from 'node:util';

const ERROR_CODE = 'gate_b_operator_origin_guard_failed';
const HOST = '127.0.0.1';
const PORT = 41000;
const TARGET_MAGIC = 0x47424f47;
const TARGET_BYTES = 8;
const SEND_TIMEOUT_MS = 1_000;
const SETUP_TIMEOUT_MS = 2_000;
const BIND_TIMEOUT_MS = 1_000;
const RESPONSE_TIMEOUT_MS = 500;
const CLOSE_TIMEOUT_MS = 1_000;
const FORCE_MS = 500;
const ABSENCE_MS = 2_000;
const MAX_CONNECTIONS = 32;
const DENIAL_RESPONSE = 'HTTP/1.1 503 Service Unavailable\r\n' +
  'Content-Length: 0\r\n' +
  'Connection: close\r\n' +
  'Cache-Control: no-store\r\n\r\n';
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const RECORDS = new WeakMap();

export class GateBOperatorOriginGuardError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBOperatorOriginGuardError';
    this.code = ERROR_CODE;
    this.stack = `GateBOperatorOriginGuardError: ${ERROR_CODE}`;
  }
}

function fail() {
  throw new GateBOperatorOriginGuardError();
}

function exactFieldless(value, type) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) ||
      Object.getPrototypeOf(value) !== OBJECT_PROTOTYPE) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 1 || keys[0] !== 'type') return false;
  const descriptor = Object.getOwnPropertyDescriptor(value, 'type');
  return Boolean(descriptor && Object.hasOwn(descriptor, 'value') &&
    descriptor.value === type);
}

function exactAddress(server, expectedPort) {
  let address;
  try { address = server.address(); } catch { fail(); }
  if (!address || typeof address !== 'object' || IS_PROXY(address) ||
      Array.isArray(address) || address.address !== HOST ||
      address.family !== 'IPv4' || !Number.isSafeInteger(address.port) ||
      address.port < 1 || address.port > 65_535 ||
      (expectedPort !== 0 && address.port !== expectedPort)) fail();
  return Object.freeze({ address: HOST, family: 'IPv4', port: address.port });
}

function snapshotServer(server) {
  if (!server || typeof server !== 'object' || IS_PROXY(server)) fail();
  const output = {
    address: server.address,
    close: server.close,
    on: server.on,
    once: server.once,
    removeListener: server.removeListener,
  };
  for (const value of Object.values(output)) if (typeof value !== 'function') fail();
  return Object.freeze(output);
}

function destroySocket(socket) {
  try { socket.destroy(); } catch {}
}

function registerServer(server, expectedPort) {
  const methods = snapshotServer(server);
  const sockets = new Set();
  const faultListeners = new Set();
  const record = {
    address: undefined,
    capability: Object.freeze(Object.create(null)),
    closePromise: undefined,
    closed: false,
    faulted: false,
    faultListeners,
    methods,
    server,
    sockets,
  };
  const fault = () => {
    if (record.closed || record.faulted) return;
    record.faulted = true;
    for (const listener of [...faultListeners]) {
      try { listener(); } catch {}
    }
  };
  const onConnection = socket => {
    if (!socket || typeof socket !== 'object' || record.closed || record.faulted ||
        sockets.size >= MAX_CONNECTIONS) {
      destroySocket(socket);
      return;
    }
    sockets.add(socket);
    const release = () => sockets.delete(socket);
    try {
      socket.once('close', release);
      socket.once('error', () => destroySocket(socket));
      socket.setTimeout(RESPONSE_TIMEOUT_MS, () => destroySocket(socket));
      socket.pause();
      socket.end(DENIAL_RESPONSE);
    } catch {
      release();
      destroySocket(socket);
    }
  };
  Reflect.apply(methods.on, server, ['connection', onConnection]);
  Reflect.apply(methods.on, server, ['error', fault]);
  record.onConnection = onConnection;
  record.onFault = fault;
  record.address = exactAddress(server, expectedPort);
  RECORDS.set(record.capability, record);
  return record.capability;
}

async function bind(port) {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) fail();
  const server = createServer({ allowHalfOpen: false, pauseOnConnect: true });
  let settled = false;
  try {
    await new Promise((resolve, reject) => {
      const finish = ok => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        server.removeListener('error', onError);
        ok ? resolve(true) : reject(new GateBOperatorOriginGuardError());
      };
      const onError = () => finish(false);
      const timer = setTimeout(() => finish(false), BIND_TIMEOUT_MS);
      server.once('error', onError);
      try {
        server.listen({
          exclusive: true,
          host: HOST,
          port,
          reusePort: false,
        }, () => finish(true));
      } catch { finish(false); }
    });
    return registerServer(server, port);
  } catch {
    try { server.close(); } catch {}
    throw new GateBOperatorOriginGuardError();
  }
}

export function createGateBOperatorOriginGuard() {
  return bind(PORT);
}

export function createGateBOperatorOriginGuardForTest(port) {
  return bind(port);
}

export function adoptGateBOperatorOriginGuard(handle) {
  return registerServer(handle, PORT);
}

export function getGateBOperatorOriginGuardAddress(capability) {
  const record = RECORDS.get(capability);
  if (!record || record.closed || record.faulted) fail();
  const current = exactAddress(record.server, record.address.port);
  if (current.address !== record.address.address || current.family !== record.address.family ||
      current.port !== record.address.port) fail();
  return record.address;
}

export function getGateBOperatorOriginGuardHandle(capability) {
  const record = RECORDS.get(capability);
  if (!record || record.closed || record.faulted) fail();
  getGateBOperatorOriginGuardAddress(capability);
  return record.server;
}

export function observeGateBOperatorOriginGuardFault(capability, listener) {
  const record = RECORDS.get(capability);
  if (!record || record.closed || typeof listener !== 'function' || IS_PROXY(listener)) fail();
  record.faultListeners.add(listener);
  if (record.faulted) queueMicrotask(listener);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    record.faultListeners.delete(listener);
  };
}

export function closeGateBOperatorOriginGuard(capability) {
  const record = RECORDS.get(capability);
  if (!record) return Promise.reject(new GateBOperatorOriginGuardError());
  if (record.closePromise) return record.closePromise;
  record.closePromise = new Promise(resolve => {
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      record.closed = true;
      for (const socket of [...record.sockets]) destroySocket(socket);
      record.sockets.clear();
      record.faultListeners.clear();
      try {
        Reflect.apply(record.methods.removeListener, record.server,
          ['connection', record.onConnection]);
        Reflect.apply(record.methods.removeListener, record.server, ['error', record.onFault]);
      } catch {}
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), CLOSE_TIMEOUT_MS);
    for (const socket of [...record.sockets]) destroySocket(socket);
    try {
      Reflect.apply(record.methods.close, record.server, [error => finish(error == null)]);
    } catch { finish(false); }
  });
  return record.closePromise;
}

function groupAlive(target) {
  try { process.kill(-target, 0); return true; }
  catch (error) {
    if (error?.code === 'ESRCH') return false;
    if (error?.code === 'EPERM') return true;
    throw error;
  }
}

async function waitAbsent(target, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (!groupAlive(target)) return true;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return !groupAlive(target);
}

async function reap(target) {
  if (!groupAlive(target)) return true;
  try { process.kill(-target, 'SIGTERM'); } catch (error) {
    if (error?.code !== 'ESRCH') return false;
  }
  if (await waitAbsent(target, FORCE_MS)) return true;
  try { process.kill(-target, 'SIGKILL'); } catch (error) {
    if (error?.code !== 'ESRCH') return false;
  }
  return waitAbsent(target, ABSENCE_MS);
}

function readTarget(signal) {
  return new Promise((resolve, reject) => {
    const stream = new Socket({
      fd: 3,
      readable: true,
      writable: false,
    });
    const chunks = [];
    let settled = false;
    let total = 0;
    const finish = (ok, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      stream.removeListener('data', onData);
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onFailure);
      stream.removeListener('close', onFailure);
      for (const chunk of chunks) chunk.fill(0);
      stream.destroy();
      ok ? resolve(value) : reject(new GateBOperatorOriginGuardError());
    };
    const onAbort = () => finish(false);
    const onFailure = () => finish(false);
    const onData = chunk => {
      if (!Buffer.isBuffer(chunk) || total + chunk.length > TARGET_BYTES) {
        if (Buffer.isBuffer(chunk)) chunk.fill(0);
        finish(false);
        return;
      }
      chunks.push(Buffer.from(chunk));
      total += chunk.length;
      chunk.fill(0);
    };
    const onEnd = () => {
      if (total !== TARGET_BYTES) return finish(false);
      const frame = Buffer.concat(chunks, total);
      try {
        if (frame.readUInt32BE(0) !== TARGET_MAGIC) return finish(false);
        const target = frame.readUInt32BE(4);
        if (!Number.isSafeInteger(target) || target < 2 || target === process.pid) {
          return finish(false);
        }
        finish(true, target);
      } finally { frame.fill(0); }
    };
    signal.addEventListener('abort', onAbort, { once: true });
    stream.on('data', onData);
    stream.once('end', onEnd);
    stream.once('error', onFailure);
    stream.once('close', onFailure);
    if (signal.aborted) onAbort();
  });
}

function send(type) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ok ? resolve(true) : reject(new GateBOperatorOriginGuardError());
    };
    const timer = setTimeout(() => finish(false), SEND_TIMEOUT_MS);
    try { process.send(Object.freeze({ type }), error => finish(error == null)); }
    catch { finish(false); }
  });
}

async function protectiveResidue() {
  await new Promise(() => {});
}

async function waitForTargetAbsenceOrOwners(target, ownersGone) {
  const ownerMarker = Object.freeze(Object.create(null));
  for (;;) {
    if (!groupAlive(target)) return true;
    const outcome = await Promise.race([
      ownersGone.then(() => ownerMarker),
      new Promise(resolve => setTimeout(resolve, 10)),
    ]);
    if (outcome === ownerMarker) return false;
  }
}

export async function runGateBOperatorOriginGuard() {
  if (process.argv.length !== 2 || typeof process.send !== 'function') return false;
  let capability;
  let stopObserving;
  let outerLifetime;
  let reaperLifetime;
  let ready = false;
  let cleanupRequested = false;
  let poisoned = false;
  let setupAborted = false;
  let target;
  let resolveArmed;
  let resolveActivation;
  let resolveOuterGone;
  let resolveReaperGone;
  let cleanupAuthority = false;
  const armed = new Promise(resolve => { resolveArmed = resolve; });
  const activation = new Promise(resolve => { resolveActivation = resolve; });
  const outerGone = new Promise(resolve => { resolveOuterGone = resolve; });
  const reaperGone = new Promise(resolve => { resolveReaperGone = resolve; });
  const ownersGone = Promise.all([outerGone, reaperGone]);
  const targetReadController = new AbortController();
  const abortSetup = () => {
    if (ready) return;
    if (!setupAborted) {
      setupAborted = true;
      resolveArmed(false);
      resolveActivation(true);
      try { targetReadController.abort(); } catch {}
    }
    resolveActivation(true);
  };
  void ownersGone.then(() => resolveActivation(true));
  const loseOuter = () => { resolveOuterGone(true); if (!ready) abortSetup(); };
  const loseReaper = () => { resolveReaperGone(true); if (!ready) abortSetup(); };
  const takeCleanupAuthority = () => {
    if (cleanupAuthority) return false;
    cleanupAuthority = true;
    return true;
  };
  const onOuterData = () => { poisoned = true; loseOuter(); };
  const onReaperData = () => { poisoned = true; loseReaper(); };
  const onSignal = () => { if (ready) resolveActivation(true); else abortSetup(); };
  const onMessage = (message, handle) => {
    if (exactFieldless(message, 'ARM_ORIGIN_GUARD') && handle !== undefined) {
      if (capability || ready || setupAborted) {
        poisoned = true;
        abortSetup();
        return;
      }
      try {
        capability = adoptGateBOperatorOriginGuard(handle);
        stopObserving = observeGateBOperatorOriginGuardFault(capability, () => {
          poisoned = true;
          resolveActivation(true);
        });
        resolveArmed(true);
      } catch {
        poisoned = true;
        resolveArmed(false);
        abortSetup();
      }
      return;
    }
    if (exactFieldless(message, 'CLEANUP') && handle === undefined && ready &&
        !cleanupRequested) {
      cleanupRequested = true;
      resolveActivation(true);
      return;
    }
    poisoned = true;
    abortSetup();
  };
  const onDisconnect = loseOuter;
  let setupTimer;
  try {
    outerLifetime = new Socket({ fd: 4, readable: true, writable: false });
    reaperLifetime = new Socket({ fd: 5, readable: true, writable: false });
    outerLifetime.on('data', onOuterData);
    outerLifetime.on('end', loseOuter);
    outerLifetime.on('close', loseOuter);
    outerLifetime.on('error', loseOuter);
    reaperLifetime.on('data', onReaperData);
    reaperLifetime.on('end', loseReaper);
    reaperLifetime.on('close', loseReaper);
    reaperLifetime.on('error', loseReaper);
    process.on('message', onMessage);
    process.on('disconnect', onDisconnect);
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    setupTimer = setTimeout(abortSetup, SETUP_TIMEOUT_MS);
    target = await readTarget(targetReadController.signal);
    if (setupAborted) throw new GateBOperatorOriginGuardError();
    if (!groupAlive(target)) throw new GateBOperatorOriginGuardError();
    const armedOk = await Promise.race([armed, activation.then(() => false)]);
    if (!armedOk || !capability || poisoned) {
      throw new GateBOperatorOriginGuardError();
    }
    if (setupAborted) throw new GateBOperatorOriginGuardError();
    ready = true;
    clearTimeout(setupTimer);
    await send('READY');
    await activation;
    let absent = !groupAlive(target);
    if (!absent) absent = await waitForTargetAbsenceOrOwners(target, ownersGone);
    if (!absent) {
      if (!takeCleanupAuthority()) await protectiveResidue();
      absent = await reap(target);
    }
    if (!absent || groupAlive(target)) {
      await protectiveResidue();
      return false;
    }
    if (await closeGateBOperatorOriginGuard(capability) !== true) {
      await protectiveResidue();
      return false;
    }
    if (cleanupRequested && !poisoned && process.connected) await send('ABSENT');
    return true;
  } catch {
    if (capability) {
      if (!target) await protectiveResidue();
      let absent = false;
      try {
        absent = !groupAlive(target);
        if (!absent) absent = await waitForTargetAbsenceOrOwners(target, ownersGone);
        if (!absent) {
          if (!takeCleanupAuthority()) await protectiveResidue();
          absent = await reap(target);
        }
        absent = absent && !groupAlive(target);
      } catch { absent = false; }
      if (!absent) await protectiveResidue();
      try {
        if (await closeGateBOperatorOriginGuard(capability) !== true) {
          await protectiveResidue();
        }
      } catch { await protectiveResidue(); }
    } else if (target) {
      let ownersJoined = false;
      try {
        ownersJoined = await Promise.race([
          ownersGone.then(() => true),
          new Promise(resolve => setTimeout(() => resolve(false), SETUP_TIMEOUT_MS)),
        ]);
      } catch {}
      if (ownersJoined) {
        let absent = false;
        try {
          if (!takeCleanupAuthority()) await protectiveResidue();
          absent = (!groupAlive(target) || await reap(target)) && !groupAlive(target);
        } catch { absent = false; }
        if (!absent) await protectiveResidue();
      }
    }
    return false;
  } finally {
    clearTimeout(setupTimer);
    try { stopObserving?.(); } catch {}
    outerLifetime?.destroy();
    reaperLifetime?.destroy();
    process.removeListener('message', onMessage);
    process.removeListener('disconnect', onDisconnect);
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }
}

async function direct() {
  if (typeof process.argv[1] !== 'string' ||
      pathToFileURL(process.argv[1]).href !== import.meta.url) return;
  process.exitCode = await runGateBOperatorOriginGuard() ? 0 : 1;
  try { process.disconnect(); } catch {}
}

void direct().catch(() => { process.exitCode = 1; });

export const GATE_B_OPERATOR_ORIGIN_DENIAL_RESPONSE = DENIAL_RESPONSE;
export const GATE_B_OPERATOR_ORIGIN_GUARD_HOST = HOST;
export const GATE_B_OPERATOR_ORIGIN_GUARD_PORT = PORT;
export const GATE_B_OPERATOR_ORIGIN_GUARD_TARGET_MAGIC = TARGET_MAGIC;
