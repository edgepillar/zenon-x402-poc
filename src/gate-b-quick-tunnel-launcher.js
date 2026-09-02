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

function dataProperty(value, name) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function') ||
      IS_PROXY(value)) return undefined;
  let current = value;
  while (current !== null) {
    if (IS_PROXY(current)) return undefined;
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(current, name);
    if (descriptor) return HAS_OWN(descriptor, 'value') ? descriptor.value : undefined;
    current = GET_PROTOTYPE_OF(current);
  }
  return undefined;
}

function ownDataProperty(value, name) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function') ||
      IS_PROXY(value)) return undefined;
  const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, name);
  return descriptor && HAS_OWN(descriptor, 'value') ? descriptor.value : undefined;
}

function snapshotChild(child) {
  if (!child || (typeof child !== 'object' && typeof child !== 'function') ||
      IS_PROXY(child)) return undefined;
  const stdio = ownDataProperty(child, 'stdio');
  const privateFd = ARRAY_IS_ARRAY(stdio) && !IS_PROXY(stdio)
    ? ownDataProperty(stdio, '3')
    : undefined;
  const channel = ownDataProperty(child, 'channel');
  return Object.freeze({
    channel,
    channelClose: dataProperty(channel, 'close'),
    channelUnref: dataProperty(channel, 'unref'),
    child,
    connected: ownDataProperty(child, 'connected'),
    disconnect: dataProperty(child, 'disconnect'),
    kill: dataProperty(child, 'kill'),
    on: dataProperty(child, 'on'),
    once: dataProperty(child, 'once'),
    pid: retainedDetachedGroupId(child),
    privateDestroy: dataProperty(privateFd, 'destroy'),
    privateEnd: dataProperty(privateFd, 'end'),
    privateFd,
    privateOnce: dataProperty(privateFd, 'once'),
    privateRemoveListener: dataProperty(privateFd, 'removeListener'),
    removeListener: dataProperty(child, 'removeListener'),
    send: dataProperty(child, 'send'),
    unref: dataProperty(child, 'unref'),
  });
}

function exactChild(snapshot) {
  if (!snapshot || typeof snapshot.on !== 'function' ||
      typeof snapshot.once !== 'function' || typeof snapshot.removeListener !== 'function' ||
      typeof snapshot.send !== 'function' || typeof snapshot.kill !== 'function' ||
      !Number.isSafeInteger(snapshot.pid) || snapshot.pid < 1 ||
      !snapshot.privateFd || typeof snapshot.privateEnd !== 'function' ||
      typeof snapshot.privateOnce !== 'function' ||
      typeof snapshot.privateRemoveListener !== 'function') fail();
  return snapshot;
}

function leaseRecord(lease) {
  const record = LEASE_RECORDS.get(lease);
  if (!record) fail();
  return record;
}

function clearTimer(timer) {
  if (timer !== undefined) clearTimeout(timer);
}

function destroyOwnedHandle(handle, destroy) {
  try {
    if (handle && typeof destroy === 'function') Reflect.apply(destroy, handle, []);
  } catch {}
}

function releaseOwnedChild(record) {
  if (record.ownedChildReleased) return;
  record.ownedChildReleased = true;
  if (ARRAY_IS_ARRAY(record.ownedListeners)) {
    for (let index = 0; index < record.ownedListeners.length; index += 1) {
      const [emitter, removeListener, event, handler] = record.ownedListeners[index];
      try { Reflect.apply(removeListener, emitter, [event, handler]); } catch {}
    }
    record.ownedListeners.length = 0;
  }
  const snapshot = record.childSnapshot;
  destroyOwnedHandle(snapshot.privateFd, snapshot.privateDestroy);
  try {
    if (record.connected === true && typeof snapshot.disconnect === 'function') {
      Reflect.apply(snapshot.disconnect, snapshot.child, []);
      record.connected = false;
    }
  } catch {}
  try {
    if (typeof snapshot.channelClose === 'function') {
      Reflect.apply(snapshot.channelClose, snapshot.channel, []);
    }
  } catch {}
  try {
    if (typeof snapshot.channelUnref === 'function') {
      Reflect.apply(snapshot.channelUnref, snapshot.channel, []);
    }
  } catch {}
  try {
    if (typeof snapshot.unref === 'function') Reflect.apply(snapshot.unref, snapshot.child, []);
  } catch {}
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

async function reapUnvalidatedChild(snapshot, dependencies, authoritativeGroup) {
  if (!snapshot) return false;
  let onClose;
  try {
    const groupId = snapshot.pid;
    if (authoritativeGroup && groupId !== undefined) {
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
    let closed = false;
    let resolveClosed;
    const closedPromise = new Promise(resolve => { resolveClosed = resolve; });
    if (typeof snapshot.once === 'function') {
      onClose = () => {
        closed = true;
        resolveClosed(true);
      };
      Reflect.apply(snapshot.once, snapshot.child, ['close', onClose]);
    }
    const directKill = signal => {
      try {
        if (typeof snapshot.kill === 'function') {
          Reflect.apply(snapshot.kill, snapshot.child, [signal]);
        }
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
  } catch {
    return false;
  } finally {
    if (onClose && typeof snapshot.removeListener === 'function') {
      try {
        Reflect.apply(snapshot.removeListener, snapshot.child, ['close', onClose]);
      } catch {}
    }
    destroyOwnedHandle(snapshot.privateFd, snapshot.privateDestroy);
    try {
      if (snapshot.connected === true && typeof snapshot.disconnect === 'function') {
        Reflect.apply(snapshot.disconnect, snapshot.child, []);
      }
    } catch {}
    try {
      if (typeof snapshot.channelClose === 'function') {
        Reflect.apply(snapshot.channelClose, snapshot.channel, []);
      }
    } catch {}
    try {
      if (typeof snapshot.channelUnref === 'function') {
        Reflect.apply(snapshot.channelUnref, snapshot.channel, []);
      }
    } catch {}
    try {
      if (typeof snapshot.unref === 'function') {
        Reflect.apply(snapshot.unref, snapshot.child, []);
      }
    } catch {}
  }
}

function beginInheritedChildCleanup(record) {
  if (record.reapPromise) return record.reapPromise;
  record.reapPromise = new Promise(resolve => {
    let finished = false;
    let closed = record.closeObserved;
    let forceTimer;
    let abandonTimer;
    const snapshot = record.childSnapshot;
    const onClose = () => {
      closed = true;
      finish(true);
    };
    const finish = observed => {
      if (finished) return;
      finished = true;
      clearTimer(forceTimer);
      clearTimer(abandonTimer);
      try {
        Reflect.apply(snapshot.removeListener, snapshot.child, ['close', onClose]);
      } catch {}
      releaseOwnedChild(record);
      resolve(observed === true && closed === true);
    };
    const directKill = signal => {
      try { Reflect.apply(snapshot.kill, snapshot.child, [signal]); } catch {}
    };
    if (closed) {
      finish(true);
      return;
    }
    try { Reflect.apply(snapshot.once, snapshot.child, ['close', onClose]); } catch {
      finish(false);
      return;
    }
    directKill('SIGTERM');
    forceTimer = setTimeout(() => {
      if (!closed) directKill('SIGKILL');
    }, record.dependencies.reapForceMs);
    abandonTimer = setTimeout(() => finish(false), record.dependencies.reapAbandonMs);
  });
  return record.reapPromise;
}

function failRecord(record) {
  if (record.state === 'FAILING' || record.state === 'CLOSED_FAILED' ||
      record.state === 'QUARANTINED' || record.state === 'STOPPED') return;
  record.state = 'FAILING';
  clearTimer(record.startupTimer);
  clearTimer(record.shutdownTimer);
  clearTimer(record.hardLifetimeTimer);
  rejectPendingCheck(record);
  if (!record.authoritativeGroup) {
    void beginInheritedChildCleanup(record).then(closed => {
      if (record.state === 'STOPPED') return;
      record.state = closed ? 'CLOSED_FAILED' : 'QUARANTINED';
      if (!record.launchSettled) {
        record.launchSettled = true;
        record.rejectLaunch(error());
      }
      settleClosureFailure(record);
    });
    return;
  }
  releaseOwnedChild(record);
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
  if (record.state === 'FAILING' || record.state === 'CLOSED_FAILED' ||
      record.state === 'QUARANTINED' || record.state === 'STOPPED' ||
      record.state === 'REAPING') return false;
  try {
    const accepted = Reflect.apply(record.childSnapshot.send, record.child, [message, sendError => {
      if (record.state === 'FAILING' || record.state === 'CLOSED_FAILED' ||
          record.state === 'QUARANTINED' || record.state === 'STOPPED' ||
          record.state === 'REAPING') return;
      if (sendError) failRecord(record);
    }]);
    if (accepted === false && record.connected === false) {
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
    if (!record.authoritativeGroup) {
      record.state = 'STOPPED';
      releaseOwnedChild(record);
      if (!record.closureSettled) {
        record.closureSettled = true;
        record.resolveClosure(true);
      }
      return;
    }
    record.state = 'REAPING';
    releaseOwnedChild(record);
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
  if (record.state === 'FAILING' || record.state === 'CLOSED_FAILED' ||
      record.state === 'QUARANTINED' || record.state === 'STOPPED' ||
      record.state === 'REAPING') return;
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
  const onError = () => failRecord(record);
  const onDisconnect = () => {
    record.connected = false;
    if (!record.stoppedMessageConfirmed) failRecord(record);
  };
  const onMessageEvent = candidate => onMessage(record, candidate);
  const onExit = (code, signal) => {
    if (record.exitObserved) return failRecord(record);
    record.exitObserved = true;
    record.exitCode = code;
    record.exitSignal = signal;
    if (record.state !== 'STOPPING' || !record.stoppedMessageConfirmed ||
        code !== 0 || signal !== null) failRecord(record);
  };
  const onClose = (code, signal) => {
    if (record.closeObserved) return failRecord(record);
    record.closeObserved = true;
    record.closeCode = code;
    record.closeSignal = signal;
    maybeSettleClosed(record);
  };
  for (const [event, handler] of [
    ['error', onError],
    ['disconnect', onDisconnect],
    ['message', onMessageEvent],
    ['exit', onExit],
    ['close', onClose],
  ]) {
    Reflect.apply(record.childSnapshot.on, record.child, [event, handler]);
    record.ownedListeners.push([
      record.child,
      record.childSnapshot.removeListener,
      event,
      handler,
    ]);
  }
}

async function launchGateBQuickTunnelInternal(bootstrap, injected, authoritativeGroup) {
  let frame;
  let record;
  let dependencies;
  let retainedChild;
  let retainedSnapshot;
  try {
    dependencies = exactInjections(injected);
    frame = frameGateBQuickTunnelBootstrap(bootstrap);
    const workspaceRoot = bootstrap.workspaceRoot;
    retainedChild = Reflect.apply(dependencies.forkProcess, undefined, [
      dependencies.supervisorModule,
      [],
      {
        cwd: workspaceRoot,
        detached: authoritativeGroup,
        env: {},
        execArgv: [],
        execPath: dependencies.executable,
        shell: false,
        stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'ipc'],
        windowsHide: true,
      },
    ]);
    retainedSnapshot = snapshotChild(retainedChild);
    const childSnapshot = exactChild(retainedSnapshot);
    const child = childSnapshot.child;
    const groupId = childSnapshot.pid;
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
      childSnapshot,
      connected: childSnapshot.connected,
      authoritativeGroup,
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
      ownedListeners: [],
      ownedChildReleased: false,
    };
    LEASE_RECORDS.set(lease, record);
    attachLifecycle(record);
    record.startupTimer = setTimeout(
      () => failRecord(record),
      dependencies.startupTimeoutMs,
    );
    const onPrivateError = () => failRecord(record);
    Reflect.apply(childSnapshot.privateOnce, childSnapshot.privateFd, [
      'error',
      onPrivateError,
    ]);
    record.ownedListeners.push([
      childSnapshot.privateFd,
      childSnapshot.privateRemoveListener,
      'error',
      onPrivateError,
    ]);
    Reflect.apply(childSnapshot.privateEnd, childSnapshot.privateFd, [frame, frameError => {
      if (record.state === 'FAILING' || record.state === 'CLOSED_FAILED' ||
          record.state === 'QUARANTINED' || record.state === 'STOPPED' ||
          record.state === 'REAPING') return;
      if (record.frameWritten || frameError) return failRecord(record);
      record.frameWritten = true;
      frame.fill(0);
      frame = undefined;
      maybeSendStart(record);
    }]);
    return await launchPromise;
  } catch {
    if (record) {
      failRecord(record);
      try { await record.reapPromise; } catch {}
    } else if (retainedSnapshot && dependencies) {
      await reapUnvalidatedChild(retainedSnapshot, dependencies, authoritativeGroup);
    }
    fail();
  } finally {
    if (Buffer.isBuffer(frame)) frame.fill(0);
  }
}

export function launchGateBQuickTunnel(bootstrap, injected) {
  return launchGateBQuickTunnelInternal(bootstrap, injected, true);
}

export function launchGateBQuickTunnelInInheritedProcessGroup(bootstrap, injected) {
  return launchGateBQuickTunnelInternal(bootstrap, injected, false);
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
