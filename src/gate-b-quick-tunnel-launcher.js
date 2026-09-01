import { fork } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types as utilTypes } from 'node:util';

import {
  createGateBQuickTunnelIpcMessage,
  frameGateBQuickTunnelBootstrap,
  GATE_B_QUICK_TUNNEL_IPC_TYPES,
  parseGateBQuickTunnelIpcMessage,
} from './gate-b-quick-tunnel-schema.js';

const ERROR_CODE = 'gate_b_quick_tunnel_launch_failed';
const SUPERVISOR_MODULE = fileURLToPath(
  new URL('./gate-b-quick-tunnel-supervisor.js', import.meta.url),
);
const STARTUP_TIMEOUT_MS = 60_000;
const SHUTDOWN_TIMEOUT_MS = 10_000;
const HARD_LIFETIME_MS = 10 * 60_000;
const REAP_FORCE_MS = 500;
const REAP_ABANDON_MS = 2_000;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const LEASE_RECORDS = new WeakMap();

export class GateBQuickTunnelLaunchError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBQuickTunnelLaunchError';
    this.code = ERROR_CODE;
    this.stack = `GateBQuickTunnelLaunchError: ${ERROR_CODE}`;
  }
}

function error() {
  return new GateBQuickTunnelLaunchError();
}

function fail() {
  throw error();
}

function killProcessGroup(pid, signal) {
  process.kill(-pid, signal);
}

function probeProcessGroup(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (candidate) {
    if (candidate && candidate.code === 'ESRCH') return false;
    throw candidate;
  }
}

function exactInjections(value) {
  const output = {
    platform: process.platform,
    forkProcess: fork,
    executable: process.execPath,
    supervisorModule: SUPERVISOR_MODULE,
    killProcessGroup,
    probeProcessGroup,
    startupTimeoutMs: STARTUP_TIMEOUT_MS,
    shutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS,
    hardLifetimeMs: HARD_LIFETIME_MS,
    reapForceMs: REAP_FORCE_MS,
    reapAbandonMs: REAP_ABANDON_MS,
    maxRequestId: Number.MAX_SAFE_INTEGER,
  };
  if (value !== undefined) {
    if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
        GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
    const allowed = Object.keys(output);
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
  }
  for (const name of ['forkProcess', 'killProcessGroup', 'probeProcessGroup']) {
    if (typeof output[name] !== 'function') fail();
  }
  for (const name of ['executable', 'supervisorModule']) {
    if (typeof output[name] !== 'string' || !isAbsolute(output[name])) fail();
  }
  for (const name of [
    'startupTimeoutMs', 'shutdownTimeoutMs', 'hardLifetimeMs',
    'reapForceMs', 'reapAbandonMs', 'maxRequestId',
  ]) {
    if (!Number.isSafeInteger(output[name]) || output[name] < 1) fail();
  }
  if (output.startupTimeoutMs > STARTUP_TIMEOUT_MS ||
      output.shutdownTimeoutMs > SHUTDOWN_TIMEOUT_MS ||
      output.hardLifetimeMs > HARD_LIFETIME_MS ||
      output.reapForceMs > REAP_FORCE_MS ||
      output.reapAbandonMs > REAP_ABANDON_MS ||
      output.reapForceMs >= output.reapAbandonMs ||
      output.maxRequestId < 2 || output.maxRequestId > Number.MAX_SAFE_INTEGER) fail();
  if (output.platform !== 'darwin') fail();
  return output;
}

function retainedDetachedGroupId(child) {
  if (!child || (typeof child !== 'object' && typeof child !== 'function') ||
      IS_PROXY(child)) return undefined;
  const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(child, 'pid');
  if (!descriptor || !HAS_OWN(descriptor, 'value') ||
      !Number.isSafeInteger(descriptor.value) || descriptor.value < 1) return undefined;
  return descriptor.value;
}

function exactChild(child) {
  if (!child || typeof child !== 'object' || typeof child.on !== 'function' ||
      typeof child.once !== 'function' ||
      typeof child.send !== 'function' || typeof child.kill !== 'function' ||
      retainedDetachedGroupId(child) === undefined ||
      !ARRAY_IS_ARRAY(child.stdio) || !child.stdio[3] ||
      typeof child.stdio[3].end !== 'function' ||
      typeof child.stdio[3].once !== 'function') fail();
  return child;
}

function leaseRecord(lease) {
  const record = LEASE_RECORDS.get(lease);
  if (!record) fail();
  return record;
}

function clearTimer(timer) {
  if (timer !== undefined) clearTimeout(timer);
}

function rejectPendingCheck(record) {
  if (!record.pendingCheck) return;
  const pending = record.pendingCheck;
  record.pendingCheck = null;
  pending.reject(error());
}

function settleClosureFailure(record) {
  if (record.closureSettled) return;
  record.closureSettled = true;
  record.rejectClosure(error());
}

function beginGroupReap(record) {
  if (record.reapPromise) return record.reapPromise;
  record.reapPromise = new Promise((resolve, reject) => {
    let finished = false;
    let probeTimer;
    let forceTimer;
    let abandonTimer;
    const finish = succeeded => {
      if (finished) return;
      finished = true;
      clearInterval(probeTimer);
      clearTimer(forceTimer);
      clearTimer(abandonTimer);
      if (succeeded) resolve(true);
      else reject(error());
    };

    const probe = () => {
      try {
        const alive = Reflect.apply(
          record.dependencies.probeProcessGroup,
          undefined,
          [record.groupId],
        );
        if (typeof alive !== 'boolean') return finish(false);
        if (!alive) {
          record.groupExhausted = true;
          finish(true);
          return false;
        }
        return true;
      } catch {
        finish(false);
        return undefined;
      }
    };

    const signal = name => {
      try {
        Reflect.apply(record.dependencies.killProcessGroup, undefined, [
          record.groupId,
          name,
        ]);
      } catch {
        if (probe() !== false) finish(false);
        return;
      }
      if (!finished) probe();
    };

    if (probe() !== true) return;
    signal('SIGTERM');
    if (finished) return;
    const intervalMs = Math.max(1, Math.min(10, record.dependencies.reapForceMs));
    probeTimer = setInterval(probe, intervalMs);
    forceTimer = setTimeout(() => {
      if (probe() === true) signal('SIGKILL');
    }, record.dependencies.reapForceMs);
    abandonTimer = setTimeout(() => {
      if (probe() === true) finish(false);
    }, record.dependencies.reapAbandonMs);
  });
  return record.reapPromise;
}

async function reapUnvalidatedChild(child, dependencies) {
  if (!child || (typeof child !== 'object' && typeof child !== 'function')) return false;
  if (!IS_PROXY(child)) {
    const groupId = retainedDetachedGroupId(child);
    if (groupId !== undefined) {
      const reapRecord = {
        dependencies,
        groupId,
        groupExhausted: false,
        reapPromise: undefined,
      };
      try {
        await beginGroupReap(reapRecord);
        return reapRecord.groupExhausted === true;
      } catch {
        return false;
      }
    }
  }
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
  directKill('SIGTERM');
  await Promise.race([
    closedPromise,
    new Promise(resolve => setTimeout(resolve, dependencies.reapForceMs)),
  ]);
  if (!closed) directKill('SIGKILL');
  await Promise.race([
    closedPromise,
    new Promise(resolve => setTimeout(resolve, dependencies.reapAbandonMs)),
  ]);
  return false;
}

function failRecord(record) {
  if (record.state === 'FAILING' || record.state === 'CLOSED_FAILED' ||
      record.state === 'QUARANTINED' || record.state === 'STOPPED') return;
  record.state = 'FAILING';
  clearTimer(record.startupTimer);
  clearTimer(record.shutdownTimer);
  clearTimer(record.hardLifetimeTimer);
  rejectPendingCheck(record);
  if (!record.launchSettled) {
    record.launchSettled = true;
    record.rejectLaunch(error());
  }
  void beginGroupReap(record).then(() => {
    if (record.state !== 'STOPPED') {
      record.state = 'CLOSED_FAILED';
      settleClosureFailure(record);
    }
  }).catch(() => {
    if (record.state !== 'STOPPED') {
      record.state = 'QUARANTINED';
      settleClosureFailure(record);
    }
  });
}

function sendMessage(record, message) {
  if (record.state === 'FAILING' || record.state === 'CLOSED_FAILED') return false;
  try {
    const accepted = record.child.send(message, sendError => {
      if (sendError) failRecord(record);
    });
    if (accepted === false && record.child.connected === false) {
      failRecord(record);
      return false;
    }
    return true;
  } catch {
    failRecord(record);
    return false;
  }
}

function maybeSendStart(record) {
  if (record.state !== 'BOOTSTRAP_JOIN' || !record.readyReceived ||
      !record.frameWritten || record.startSent) return;
  record.startSent = true;
  record.state = 'ACTIVE_PENDING';
  sendMessage(record, createGateBQuickTunnelIpcMessage(
    GATE_B_QUICK_TUNNEL_IPC_TYPES.START,
    1,
  ));
}

function maybeSettleClosed(record) {
  if (!record.closeObserved) return;
  if (record.state === 'STOPPING' && record.stoppedMessageConfirmed &&
      record.exitObserved && record.exitCode === 0 && record.exitSignal === null &&
      record.closeCode === 0 && record.closeSignal === null) {
    clearTimer(record.shutdownTimer);
    clearTimer(record.hardLifetimeTimer);
    record.state = 'REAPING';
    void beginGroupReap(record).then(() => {
      if (record.state !== 'REAPING' || !record.groupExhausted) return failRecord(record);
      record.state = 'STOPPED';
      if (!record.closureSettled) {
        record.closureSettled = true;
        record.resolveClosure(true);
      }
    }).catch(() => failRecord(record));
    return;
  }
  failRecord(record);
}

function onMessage(record, candidate) {
  let message;
  try {
    message = parseGateBQuickTunnelIpcMessage(candidate);
  } catch {
    failRecord(record);
    return;
  }
  if (record.state === 'BOOTSTRAP_JOIN') {
    if (message.type !== GATE_B_QUICK_TUNNEL_IPC_TYPES.READY ||
        message.requestId !== 1 || record.readyReceived) return failRecord(record);
    record.readyReceived = true;
    maybeSendStart(record);
    return;
  }
  if (record.state === 'ACTIVE_PENDING') {
    if (message.type !== GATE_B_QUICK_TUNNEL_IPC_TYPES.ACTIVE ||
        message.requestId !== 1) return failRecord(record);
    clearTimer(record.startupTimer);
    record.state = 'ACTIVE_IDLE';
    record.hardLifetimeTimer = setTimeout(
      () => failRecord(record),
      record.dependencies.hardLifetimeMs,
    );
    if (record.launchSettled) return failRecord(record);
    record.launchSettled = true;
    record.resolveLaunch(record.lease);
    return;
  }
  if (record.state === 'CHECKING') {
    if (!record.pendingCheck ||
        message.type !== GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECKED ||
        message.requestId !== record.pendingCheck.requestId) return failRecord(record);
    const pending = record.pendingCheck;
    record.pendingCheck = null;
    record.state = 'ACTIVE_IDLE';
    pending.resolve(true);
    return;
  }
  if (record.state === 'STOPPING') {
    if (message.type !== GATE_B_QUICK_TUNNEL_IPC_TYPES.STOPPED ||
        message.requestId !== record.stopRequestId || record.stoppedMessageConfirmed) {
      return failRecord(record);
    }
    record.stoppedMessageConfirmed = true;
    maybeSettleClosed(record);
    return;
  }
  failRecord(record);
}

function attachLifecycle(record) {
  record.child.on('error', () => failRecord(record));
  record.child.on('disconnect', () => {
    if (!record.stoppedMessageConfirmed) failRecord(record);
  });
  record.child.on('message', candidate => onMessage(record, candidate));
  record.child.on('exit', (code, signal) => {
    if (record.exitObserved) return failRecord(record);
    record.exitObserved = true;
    record.exitCode = code;
    record.exitSignal = signal;
    if (record.state !== 'STOPPING' || !record.stoppedMessageConfirmed ||
        code !== 0 || signal !== null) failRecord(record);
  });
  record.child.on('close', (code, signal) => {
    if (record.closeObserved) return failRecord(record);
    record.closeObserved = true;
    record.closeCode = code;
    record.closeSignal = signal;
    maybeSettleClosed(record);
  });
}

export async function launchGateBQuickTunnel(bootstrap, injected) {
  let frame;
  let record;
  let dependencies;
  let retainedChild;
  try {
    dependencies = exactInjections(injected);
    frame = frameGateBQuickTunnelBootstrap(bootstrap);
    const workspaceRoot = bootstrap.workspaceRoot;
    retainedChild = Reflect.apply(dependencies.forkProcess, undefined, [
      dependencies.supervisorModule,
      [],
      {
        cwd: workspaceRoot,
        detached: true,
        env: {},
        execArgv: [],
        execPath: dependencies.executable,
        shell: false,
        stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'ipc'],
        windowsHide: true,
      },
    ]);
    const child = exactChild(retainedChild);
    const groupId = retainedDetachedGroupId(child);
    if (groupId === undefined) fail();
    bootstrap = undefined;

    let resolveLaunch;
    let rejectLaunch;
    const launchPromise = new Promise((resolve, reject) => {
      resolveLaunch = resolve;
      rejectLaunch = reject;
    });
    let resolveClosure;
    let rejectClosure;
    const closurePromise = new Promise((resolve, reject) => {
      resolveClosure = resolve;
      rejectClosure = reject;
    });
    void closurePromise.catch(() => {});
    const lease = Object.freeze(Object.create(null));
    record = {
      child,
      groupId,
      dependencies,
      lease,
      closurePromise,
      resolveClosure,
      rejectClosure,
      resolveLaunch,
      rejectLaunch,
      state: 'BOOTSTRAP_JOIN',
      lastIssuedRequestId: 1,
      pendingCheck: null,
      stopRequestId: undefined,
      stopSent: false,
      readyReceived: false,
      startSent: false,
      frameWritten: false,
      launchSettled: false,
      closureSettled: false,
      stoppedMessageConfirmed: false,
      exitObserved: false,
      closeObserved: false,
      exitCode: undefined,
      exitSignal: undefined,
      closeCode: undefined,
      closeSignal: undefined,
      groupExhausted: false,
      startupTimer: undefined,
      shutdownTimer: undefined,
      hardLifetimeTimer: undefined,
      reapPromise: undefined,
    };
    LEASE_RECORDS.set(lease, record);
    attachLifecycle(record);
    record.startupTimer = setTimeout(
      () => failRecord(record),
      dependencies.startupTimeoutMs,
    );
    child.stdio[3].once('error', () => failRecord(record));
    child.stdio[3].end(frame, frameError => {
      if (record.frameWritten || frameError) return failRecord(record);
      record.frameWritten = true;
      frame.fill(0);
      frame = undefined;
      maybeSendStart(record);
    });
    return await launchPromise;
  } catch {
    if (record) {
      failRecord(record);
      try { await record.reapPromise; } catch {}
    } else if (retainedChild && dependencies) {
      await reapUnvalidatedChild(retainedChild, dependencies);
    }
    fail();
  } finally {
    if (Buffer.isBuffer(frame)) frame.fill(0);
  }
}

export function assertGateBQuickTunnelReady(lease) {
  let record;
  try {
    record = leaseRecord(lease);
    if (record.state !== 'ACTIVE_IDLE' || record.pendingCheck ||
        record.lastIssuedRequestId >= record.dependencies.maxRequestId - 1) fail();
    const requestId = record.lastIssuedRequestId + 1;
    let resolveCheck;
    let rejectCheck;
    const promise = new Promise((resolve, reject) => {
      resolveCheck = resolve;
      rejectCheck = reject;
    });
    void promise.catch(() => {});
    record.pendingCheck = {
      requestId,
      promise,
      resolve: resolveCheck,
      reject: rejectCheck,
    };
    record.lastIssuedRequestId = requestId;
    record.state = 'CHECKING';
    sendMessage(record, createGateBQuickTunnelIpcMessage(
      GATE_B_QUICK_TUNNEL_IPC_TYPES.CHECK,
      requestId,
    ));
    return promise;
  } catch {
    return Promise.reject(error());
  }
}

export function stopGateBQuickTunnel(lease) {
  let record;
  try {
    record = leaseRecord(lease);
    if (record.stopSent || record.state === 'STOPPING' || record.state === 'STOPPED' ||
        record.state === 'FAILING' || record.state === 'CLOSED_FAILED') {
      return record.closurePromise;
    }
    if (record.state !== 'ACTIVE_IDLE' && record.state !== 'CHECKING') fail();
    if (record.lastIssuedRequestId >= record.dependencies.maxRequestId) fail();
    if (record.state === 'CHECKING') rejectPendingCheck(record);
    record.stopRequestId = record.lastIssuedRequestId + 1;
    record.lastIssuedRequestId = record.stopRequestId;
    record.stopSent = true;
    record.state = 'STOPPING';
    clearTimer(record.hardLifetimeTimer);
    record.shutdownTimer = setTimeout(
      () => failRecord(record),
      record.dependencies.shutdownTimeoutMs,
    );
    sendMessage(record, createGateBQuickTunnelIpcMessage(
      GATE_B_QUICK_TUNNEL_IPC_TYPES.STOP,
      record.stopRequestId,
    ));
    return record.closurePromise;
  } catch {
    if (record) failRecord(record);
    return Promise.reject(error());
  }
}

export function waitGateBQuickTunnelClosed(lease) {
  try {
    return leaseRecord(lease).closurePromise;
  } catch {
    return Promise.reject(error());
  }
}
