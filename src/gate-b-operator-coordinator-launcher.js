import { spawn } from 'node:child_process';
import { dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types as utilTypes } from 'node:util';

import {
  GATE_B_OPERATOR_COORDINATOR_IPC_TYPES,
  GATE_B_OPERATOR_COORDINATOR_LIMITS,
  GATE_B_OPERATOR_COORDINATOR_STATUS_LINES,
  createGateBOperatorCoordinatorIpcMessage,
  frameGateBOperatorCoordinatorBootstrap,
  frameGateBOperatorCoordinatorReview,
  parseGateBOperatorCoordinatorIpcMessage,
} from './gate-b-operator-coordinator-schema.js';

const ERROR_CODE = 'gate_b_operator_coordinator_launch_failed';
const CLI_MODULE = fileURLToPath(new URL('./gate-b-operator-coordinator-cli.js', import.meta.url));
const WATCHDOG_MODULE = fileURLToPath(new URL('./gate-b-operator-watchdog.js', import.meta.url));
const REAPER_MODULE = fileURLToPath(new URL('./gate-b-operator-reaper.js', import.meta.url));
const REAP_FORCE_MS = 500;
const REAP_ABANDON_MS = 2000;
const SETUP_TIMEOUT_MS = 1_000;
const TERMINAL_WAIT_MS = 4_000;
const WATCHDOG_START_MAGIC = 0x47425354;
const REAPER_TARGET_MAGIC = 0x47425250;
const OUTPUT_MAX_BYTES = 512;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROMISE = utilTypes.isPromise;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const RECORDS = new WeakMap();
const WATCHDOG_RECORDS = new WeakMap();

export class GateBOperatorCoordinatorLaunchError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBOperatorCoordinatorLaunchError';
    this.code = ERROR_CODE;
    this.stack = `GateBOperatorCoordinatorLaunchError: ${ERROR_CODE}`;
  }
}

function fail() {
  throw new GateBOperatorCoordinatorLaunchError();
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

function exactNativePromise(value) {
  if (!IS_PROMISE(value) || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== Promise.prototype ||
      GET_OWN_PROPERTY_DESCRIPTOR(value, 'then') !== undefined) fail();
  return value;
}

function exactPartialOptions(value, allowed) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
      GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const output = {};
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
  return output;
}

function defaultKillProcessGroup(pid, signal) {
  process.kill(-pid, signal);
}

function defaultProbeProcessGroup(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error && error.code === 'ESRCH') return false;
    if (error && error.code === 'EPERM') return true;
    throw error;
  }
}

function captureDependencies(injected, defaultModule = CLI_MODULE) {
  const supplied = injected === undefined ? {} : exactPartialOptions(injected, [
    'cliModule', 'executable', 'gracefulStopMs', 'killProcessGroup', 'lifetimeMs', 'platform',
    'probeProcessGroup', 'reapAbandonMs', 'reapForceMs', 'spawnProcess',
  ]);
  const output = {
    cliModule: supplied.cliModule ?? defaultModule,
    executable: supplied.executable ?? process.execPath,
    gracefulStopMs: supplied.gracefulStopMs ??
      GATE_B_OPERATOR_COORDINATOR_LIMITS.gracefulStopMs,
    killProcessGroup: supplied.killProcessGroup ?? defaultKillProcessGroup,
    lifetimeMs: supplied.lifetimeMs ?? GATE_B_OPERATOR_COORDINATOR_LIMITS.lifetimeMs,
    platform: supplied.platform ?? process.platform,
    probeProcessGroup: supplied.probeProcessGroup ?? defaultProbeProcessGroup,
    reapAbandonMs: supplied.reapAbandonMs ?? REAP_ABANDON_MS,
    reapForceMs: supplied.reapForceMs ?? REAP_FORCE_MS,
    spawnProcess: supplied.spawnProcess ?? spawn,
  };
  if (typeof output.executable !== 'string' || !isAbsolute(output.executable) ||
      typeof output.cliModule !== 'string' || !isAbsolute(output.cliModule) ||
      typeof output.spawnProcess !== 'function' ||
      typeof output.killProcessGroup !== 'function' ||
      typeof output.probeProcessGroup !== 'function' ||
      output.platform !== 'darwin' ||
      !Number.isSafeInteger(output.lifetimeMs) || output.lifetimeMs < 1 ||
      output.lifetimeMs > GATE_B_OPERATOR_COORDINATOR_LIMITS.lifetimeMs ||
      !Number.isSafeInteger(output.gracefulStopMs) || output.gracefulStopMs < 1 ||
      output.gracefulStopMs > GATE_B_OPERATOR_COORDINATOR_LIMITS.gracefulStopMs ||
      !Number.isSafeInteger(output.reapForceMs) || output.reapForceMs < 1 ||
      output.reapForceMs > REAP_FORCE_MS ||
      !Number.isSafeInteger(output.reapAbandonMs) || output.reapAbandonMs < 1 ||
      output.reapAbandonMs > REAP_ABANDON_MS ||
      output.reapForceMs >= output.reapAbandonMs) fail();
  return Object.freeze(output);
}

function captureGroupId(child) {
  if (!child || typeof child !== 'object' || IS_PROXY(child)) fail();
  const pid = ownDataProperty(child, 'pid');
  if (!Number.isSafeInteger(pid) || pid < 1) fail();
  return pid;
}

function snapshotChild(child, groupId) {
  if (!child || typeof child !== 'object' || IS_PROXY(child)) fail();
  const stdio = ownDataProperty(child, 'stdio');
  const privatePipe = ARRAY_IS_ARRAY(stdio) && !IS_PROXY(stdio)
    ? ownDataProperty(stdio, '3')
    : undefined;
  const lifetimePipe = ARRAY_IS_ARRAY(stdio) && !IS_PROXY(stdio)
    ? ownDataProperty(stdio, '5')
    : undefined;
  const stdout = ownDataProperty(child, 'stdout');
  const stderr = ownDataProperty(child, 'stderr');
  const channel = ownDataProperty(child, 'channel');
  const pid = ownDataProperty(child, 'pid');
  const snapshot = Object.freeze({
    channel,
    channelClose: dataProperty(channel, 'close'),
    channelUnref: dataProperty(channel, 'unref'),
    child,
    connected: ownDataProperty(child, 'connected'),
    disconnect: dataProperty(child, 'disconnect'),
    on: dataProperty(child, 'on'),
    pid,
    lifetimeDestroy: dataProperty(lifetimePipe, 'destroy'),
    lifetimeEnd: dataProperty(lifetimePipe, 'end'),
    lifetimePipe,
    privateDestroy: dataProperty(privatePipe, 'destroy'),
    privateEnd: dataProperty(privatePipe, 'end'),
    privateOnce: dataProperty(privatePipe, 'once'),
    privatePipe,
    privateRemoveListener: dataProperty(privatePipe, 'removeListener'),
    privateWrite: dataProperty(privatePipe, 'write'),
    removeListener: dataProperty(child, 'removeListener'),
    send: dataProperty(child, 'send'),
    stderr,
    stderrDestroy: dataProperty(stderr, 'destroy'),
    stderrOn: dataProperty(stderr, 'on'),
    stderrRemoveListener: dataProperty(stderr, 'removeListener'),
    stdout,
    stdoutDestroy: dataProperty(stdout, 'destroy'),
    stdoutOn: dataProperty(stdout, 'on'),
    stdoutRemoveListener: dataProperty(stdout, 'removeListener'),
    unref: dataProperty(child, 'unref'),
  });
  if (snapshot.pid !== groupId) fail();
  for (const key of [
    'on', 'removeListener', 'send', 'privateEnd', 'privateOnce', 'lifetimeEnd',
    'privateRemoveListener', 'privateWrite', 'stderrOn', 'stderrRemoveListener',
    'stdoutOn', 'stdoutRemoveListener',
  ]) if (typeof snapshot[key] !== 'function') fail();
  return snapshot;
}

async function proveGroupAbsent(groupId, dependencies) {
  const alive = Reflect.apply(dependencies.probeProcessGroup, undefined, [groupId]);
  if (typeof alive !== 'boolean' || alive) fail();
  return true;
}

async function reapGroup(groupId, dependencies) {
  await new Promise((resolve, reject) => {
    let settled = false;
    let probeTimer;
    let forceTimer;
    let abandonTimer;
    const finish = success => {
      if (settled) return;
      settled = true;
      clearInterval(probeTimer);
      clearTimeout(forceTimer);
      clearTimeout(abandonTimer);
      if (success) resolve(true);
      else reject(new GateBOperatorCoordinatorLaunchError());
    };
    const probe = () => {
      try {
        const alive = Reflect.apply(dependencies.probeProcessGroup, undefined, [groupId]);
        if (typeof alive !== 'boolean') return finish(false);
        if (!alive) {
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
        Reflect.apply(dependencies.killProcessGroup, undefined, [groupId, name]);
      } catch {
        if (probe() !== false) finish(false);
        return;
      }
      if (!settled) probe();
    };
    if (probe() !== true) return;
    signal('SIGTERM');
    if (settled) return;
    probeTimer = setInterval(probe, Math.min(10, dependencies.reapForceMs));
    forceTimer = setTimeout(() => {
      if (probe() === true) signal('SIGKILL');
    }, dependencies.reapForceMs);
    abandonTimer = setTimeout(() => {
      if (probe() === true) finish(false);
    }, dependencies.reapAbandonMs);
  });
  return proveGroupAbsent(groupId, dependencies);
}

function createCapability(record) {
  const capability = Object.freeze(Object.create(null));
  RECORDS.set(capability, record);
  return capability;
}

function recordFor(capability) {
  const record = RECORDS.get(capability);
  if (!record) fail();
  return record;
}

function appendOutput(record, streamName, chunk) {
  if (!Buffer.isBuffer(chunk) || record.terminalSettled) fail();
  const state = record[streamName];
  state.total += chunk.length;
  if (!Number.isSafeInteger(state.total) || state.total > OUTPUT_MAX_BYTES) {
    chunk.fill(0);
    fail();
  }
  const parts = [...state.chunks, chunk];
  const partialTotal = parts.reduce((sum, value) => sum + value.length, 0);
  let combined = Buffer.concat(parts, partialTotal);
  chunk.fill(0);
  for (let index = 0; index < state.chunks.length; index += 1) state.chunks[index].fill(0);
  state.chunks = [];
  while (true) {
    const newline = combined.indexOf(0x0a);
    if (newline < 0) break;
    const line = combined.subarray(0, newline + 1).toString('utf8');
    state.lines.push(line);
    const remainder = Buffer.from(combined.subarray(newline + 1));
    combined.fill(0);
    combined = remainder;
  }
  if (combined.length > 0) state.chunks.push(combined);
  else combined.fill(0);
}

function exactLineCount(record, stream, expected, count) {
  const state = record[stream];
  return state.lines.length === count && state.lines[count - 1] === expected &&
    state.chunks.length === 0;
}

function releaseChild(record) {
  if (!record || record.released) return;
  record.released = true;
  for (const [emitter, remove, event, handler] of record.ownedHandlers) {
    try { Reflect.apply(remove, emitter, [event, handler]); } catch {}
  }
  record.ownedHandlers.length = 0;
  for (const [handle, destroy] of [
    [record.snapshot.stdout, record.snapshot.stdoutDestroy],
    [record.snapshot.stderr, record.snapshot.stderrDestroy],
    [record.snapshot.privatePipe, record.snapshot.privateDestroy],
    [record.snapshot.lifetimePipe, record.snapshot.lifetimeDestroy],
  ]) {
    try { if (typeof destroy === 'function') Reflect.apply(destroy, handle, []); } catch {}
  }
  try {
    if (record.snapshot.connected === true && typeof record.snapshot.disconnect === 'function') {
      Reflect.apply(record.snapshot.disconnect, record.snapshot.child, []);
    }
  } catch {}
  try {
    if (typeof record.snapshot.channelClose === 'function') {
      Reflect.apply(record.snapshot.channelClose, record.snapshot.channel, []);
    }
  } catch {}
  try {
    if (typeof record.snapshot.channelUnref === 'function') {
      Reflect.apply(record.snapshot.channelUnref, record.snapshot.channel, []);
    }
  } catch {}
  try {
    if (typeof record.snapshot.unref === 'function') {
      Reflect.apply(record.snapshot.unref, record.snapshot.child, []);
    }
  } catch {}
  for (const state of [record.stdoutState, record.stderrState]) {
    for (let index = 0; index < state.chunks.length; index += 1) {
      try { state.chunks[index].fill(0); } catch {}
    }
    state.chunks.length = 0;
    state.lines.length = 0;
    state.total = 0;
  }
}

function rejectMilestones(record) {
  const error = new GateBOperatorCoordinatorLaunchError();
  if (record.rejectLaunch) record.rejectLaunch(error);
  if (record.rejectReview) record.rejectReview(error);
}

function settleTerminal(record, status) {
  if (record.terminalSettled) return;
  record.terminalSettled = true;
  record.acceptingProtocol = false;
  clearTimeout(record.lifetimeTimer);
  clearTimeout(record.stopWatchdog);
  record.state = status;
  rejectMilestones(record);
  releaseChild(record);
  record.resolveClosed(status);
  if (record.resolveStop) record.resolveStop(status);
}

function quarantineAndReap(record) {
  if (record.terminalWork) return record.terminalWork;
  record.acceptingProtocol = false;
  record.state = 'STOPPING';
  record.terminalWork = (async () => {
    if (record.authoritativeGroup) {
      try { await reapGroup(record.groupId, record.dependencies); } catch {}
    }
    settleTerminal(record, 'QUARANTINED');
    return 'QUARANTINED';
  })();
  return record.terminalWork;
}

function checkMilestones(record) {
  if (!record.acceptingProtocol || record.terminalSettled) return;
  if (record.state === 'LAUNCHING' && record.bootstrapWritten && record.reviewIpc &&
      exactLineCount(
        record,
        'stdoutState',
        GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.REVIEW_REQUIRED,
        1,
      ) && record.stderrState.lines.length === 0 && record.stderrState.chunks.length === 0) {
    record.state = 'REVIEW_REQUIRED';
    record.resolveLaunch(record.capability);
    return;
  }
  if (record.state === 'REVIEW_SUBMITTED' && record.reviewWritten && record.preflightIpc &&
      exactLineCount(
        record,
        'stdoutState',
        GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.PREFLIGHT_VALID,
        2,
      ) && record.stderrState.lines.length === 0 && record.stderrState.chunks.length === 0) {
    record.state = 'PREFLIGHT_VALID';
    record.resolveReview('PREFLIGHT_VALID');
  }
}

function sendStop(record) {
  if (record.stopSent || record.terminalSettled) return;
  record.stopSent = true;
  record.state = 'STOPPING';
  try {
    Reflect.apply(record.snapshot.send, record.snapshot.child, [
      createGateBOperatorCoordinatorIpcMessage(
        GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.STOP,
      ),
      error => { if (record.acceptingProtocol && error) void quarantineAndReap(record); },
    ]);
  } catch {
    void quarantineAndReap(record);
  }
  try {
    Reflect.apply(record.snapshot.privateEnd, record.snapshot.privatePipe, [error => {
      if (record.acceptingProtocol && error) void quarantineAndReap(record);
    }]);
  } catch {}
  record.stopWatchdog = setTimeout(() => {
    if (!record.terminalSettled) void quarantineAndReap(record);
  }, record.dependencies.gracefulStopMs);
}

function installHandlers(record) {
  const child = record.snapshot.child;
  const listen = (emitter, on, remove, event, handler) => {
    Reflect.apply(on, emitter, [event, handler]);
    record.ownedHandlers.push([emitter, remove, event, handler]);
  };
  const onError = () => { if (record.acceptingProtocol) void quarantineAndReap(record); };
  const onDisconnect = () => {
    if (record.acceptingProtocol && !record.finalIpc) void quarantineAndReap(record);
  };
  const onStdout = chunk => {
    if (!record.acceptingProtocol) {
      try { if (Buffer.isBuffer(chunk)) chunk.fill(0); } catch {}
      return;
    }
    try { appendOutput(record, 'stdoutState', chunk); checkMilestones(record); } catch {
      void quarantineAndReap(record);
    }
  };
  const onStderr = chunk => {
    if (!record.acceptingProtocol) {
      try { if (Buffer.isBuffer(chunk)) chunk.fill(0); } catch {}
      return;
    }
    try {
      appendOutput(record, 'stderrState', chunk);
      if (record.stderrState.lines.length > 1) fail();
    } catch {
      void quarantineAndReap(record);
    }
  };
  const onMessage = message => {
    if (!record.acceptingProtocol) return;
    if (exactFieldlessMessage(message, 'REVIEW_OPENED')) {
      if (record.state !== 'REVIEW_OPENING' || record.reviewOpenAck) {
        void quarantineAndReap(record);
        return;
      }
      record.reviewOpenAck = true;
      return;
    }
    let parsed;
    try { parsed = parseGateBOperatorCoordinatorIpcMessage(message); } catch {
      void quarantineAndReap(record);
      return;
    }
    if (parsed.type === GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.REVIEW_REQUIRED &&
        record.state === 'LAUNCHING' && !record.reviewIpc) {
      record.reviewIpc = true;
      checkMilestones(record);
      return;
    }
    if (parsed.type === GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.PREFLIGHT_VALID &&
        record.state === 'REVIEW_SUBMITTED' && !record.preflightIpc) {
      record.preflightIpc = true;
      checkMilestones(record);
      return;
    }
    if ((parsed.type === GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.STOPPED ||
         parsed.type === GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.QUARANTINED) &&
        record.state === 'STOPPING' && !record.finalIpc) {
      record.finalIpc = parsed.type;
      return;
    }
    void quarantineAndReap(record);
  };
  const onExit = (code, signal) => {
    if (!record.acceptingProtocol || record.exitSeen) {
      if (record.acceptingProtocol) void quarantineAndReap(record);
      return;
    }
    record.exitSeen = true;
    record.exitCode = code;
    record.exitSignal = signal;
  };
  const onClose = (code, signal) => {
    if (!record.acceptingProtocol || record.closeSeen) return;
    record.closeSeen = true;
    record.acceptingProtocol = false;
    clearTimeout(record.stopWatchdog);
    const expectedCleanLineCount = record.preflightIpc ? 3 : record.reviewIpc ? 2 : 1;
    const candidateClean = record.exitSeen && code === record.exitCode &&
      signal === record.exitSignal && code === 0 && signal === null &&
      record.finalIpc === GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.STOPPED &&
      exactLineCount(
        record,
        'stdoutState',
        GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.CLOSED,
        expectedCleanLineCount,
      ) && record.stderrState.lines.length === 0 && record.stderrState.chunks.length === 0;
    const stdoutBeforeQuarantine = record.stdoutState.chunks.length === 0 && (
      record.stdoutState.lines.length === 0 ||
      (record.stdoutState.lines.length === 1 &&
        record.stdoutState.lines[0] ===
          GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.REVIEW_REQUIRED) ||
      (record.stdoutState.lines.length === 2 &&
        record.stdoutState.lines[0] ===
          GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.REVIEW_REQUIRED &&
        record.stdoutState.lines[1] ===
          GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.PREFLIGHT_VALID)
    );
    const candidateQuarantine = record.finalIpc ===
        GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.QUARANTINED &&
      stdoutBeforeQuarantine &&
      exactLineCount(
        record,
        'stderrState',
        GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.QUARANTINED,
        1,
      );
    record.terminalWork = (async () => {
      let absent = !record.authoritativeGroup;
      if (record.authoritativeGroup) {
        try {
          absent = await proveGroupAbsent(record.groupId, record.dependencies);
          if (!absent) {
            await reapGroup(record.groupId, record.dependencies);
            absent = await proveGroupAbsent(record.groupId, record.dependencies);
          }
        } catch {
          try { await reapGroup(record.groupId, record.dependencies); } catch {}
          try { absent = await proveGroupAbsent(record.groupId, record.dependencies); } catch {}
        }
      }
      if (candidateClean && absent) settleTerminal(record, 'CLOSED');
      else {
        if (record.authoritativeGroup && !absent) {
          try { await reapGroup(record.groupId, record.dependencies); } catch {}
        }
        settleTerminal(record, candidateQuarantine ? 'QUARANTINED' : 'QUARANTINED');
      }
    })();
  };
  listen(child, record.snapshot.on, record.snapshot.removeListener, 'error', onError);
  listen(child, record.snapshot.on, record.snapshot.removeListener, 'disconnect', onDisconnect);
  listen(child, record.snapshot.on, record.snapshot.removeListener, 'message', onMessage);
  listen(child, record.snapshot.on, record.snapshot.removeListener, 'exit', onExit);
  listen(child, record.snapshot.on, record.snapshot.removeListener, 'close', onClose);
  listen(
    record.snapshot.stdout,
    record.snapshot.stdoutOn,
    record.snapshot.stdoutRemoveListener,
    'data',
    onStdout,
  );
  listen(
    record.snapshot.stderr,
    record.snapshot.stderrOn,
    record.snapshot.stderrRemoveListener,
    'data',
    onStderr,
  );
  const onPrivateError = () => {
    if (record.acceptingProtocol) void quarantineAndReap(record);
  };
  Reflect.apply(record.snapshot.privateOnce, record.snapshot.privatePipe, [
    'error', onPrivateError,
  ]);
  record.ownedHandlers.push([
    record.snapshot.privatePipe,
    record.snapshot.privateRemoveListener,
    'error',
    onPrivateError,
  ]);
}

function launchGateBOperatorProcess(
  bootstrap,
  injected,
  defaultModule,
  authoritativeGroup = true,
) {
  let frame;
  let child;
  let groupId;
  let snapshot;
  let dependencies;
  try {
    frame = frameGateBOperatorCoordinatorBootstrap(bootstrap);
    dependencies = captureDependencies(injected, defaultModule);
    child = Reflect.apply(dependencies.spawnProcess, undefined, [
      dependencies.executable,
      [dependencies.cliModule],
      {
        cwd: dirname(dependencies.cliModule),
        detached: authoritativeGroup,
        env: {},
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'ipc', 'pipe'],
        windowsHide: true,
      },
    ]);
    groupId = captureGroupId(child);
    snapshot = snapshotChild(child, groupId);
    let resolveLaunch;
    let rejectLaunch;
    let resolveReview;
    let rejectReview;
    let resolveClosed;
    const launchPromise = new Promise((resolve, reject) => {
      resolveLaunch = resolve;
      rejectLaunch = reject;
    });
    const reviewPromise = new Promise((resolve, reject) => {
      resolveReview = resolve;
      rejectReview = reject;
    });
    void reviewPromise.catch(() => {});
    const closedPromise = new Promise(resolve => { resolveClosed = resolve; });
    const record = {
      acceptingProtocol: true,
      bootstrapWriteCallbackSeen: false,
      bootstrapWritten: false,
      capability: undefined,
      child,
      closeSeen: false,
      dependencies,
      exitCode: undefined,
      exitSeen: false,
      exitSignal: undefined,
      finalIpc: undefined,
      groupId,
      authoritativeGroup,
      launchPromise,
      lifetimeTimer: undefined,
      ownedHandlers: [],
      preflightIpc: false,
      rejectLaunch,
      rejectReview,
      released: false,
      resolveClosed,
      resolveLaunch,
      resolveReview,
      resolveStop: undefined,
      reviewIpc: false,
      reviewOpenAck: false,
      reviewWriteCallbackSeen: false,
      reviewWritten: false,
      reviewPromise,
      snapshot,
      state: 'LAUNCHING',
      stderrState: { chunks: [], lines: [], total: 0 },
      stdoutState: { chunks: [], lines: [], total: 0 },
      stopPromise: undefined,
      stopSent: false,
      stopWatchdog: undefined,
      terminalSettled: false,
      terminalWork: undefined,
      closedPromise,
    };
    record.capability = createCapability(record);
    installHandlers(record);
    record.lifetimeTimer = setTimeout(() => {
      if (!record.terminalSettled) sendStop(record);
    }, dependencies.lifetimeMs);
    const bootstrapFrame = frame;
    Reflect.apply(snapshot.privateWrite, snapshot.privatePipe, [bootstrapFrame, error => {
      if (record.bootstrapWriteCallbackSeen) {
        if (record.acceptingProtocol) void quarantineAndReap(record);
        return;
      }
      record.bootstrapWriteCallbackSeen = true;
      bootstrapFrame.fill(0);
      frame = undefined;
      if (!record.acceptingProtocol) return;
      if (error) void quarantineAndReap(record);
      else {
        record.bootstrapWritten = true;
        checkMilestones(record);
      }
    }]);
    return launchPromise;
  } catch {
    if (Buffer.isBuffer(frame)) frame.fill(0);
    if (authoritativeGroup && Number.isSafeInteger(groupId) && groupId > 0 && dependencies) {
      return reapGroup(groupId, dependencies).then(
        () => { throw new GateBOperatorCoordinatorLaunchError(); },
        () => { throw new GateBOperatorCoordinatorLaunchError(); },
      );
    }
    return Promise.reject(new GateBOperatorCoordinatorLaunchError());
  }
}

function captureWatchdogDependencies(injected) {
  const supplied = injected === undefined ? {} : exactPartialOptions(injected, [
    'executable', 'gracefulStopMs', 'killProcessGroup', 'lifetimeMs', 'platform',
    'probeProcessGroup', 'reapAbandonMs', 'reapForceMs', 'reaperModule',
    'setupTimeoutMs', 'spawnProcess', 'terminalWaitMs', 'watchdogModule',
  ]);
  const output = {
    executable: supplied.executable ?? process.execPath,
    gracefulStopMs: supplied.gracefulStopMs ??
      GATE_B_OPERATOR_COORDINATOR_LIMITS.gracefulStopMs,
    killProcessGroup: supplied.killProcessGroup ?? defaultKillProcessGroup,
    lifetimeMs: supplied.lifetimeMs ?? GATE_B_OPERATOR_COORDINATOR_LIMITS.lifetimeMs,
    platform: supplied.platform ?? process.platform,
    probeProcessGroup: supplied.probeProcessGroup ?? defaultProbeProcessGroup,
    reapAbandonMs: supplied.reapAbandonMs ?? REAP_ABANDON_MS,
    reapForceMs: supplied.reapForceMs ?? REAP_FORCE_MS,
    reaperModule: supplied.reaperModule ?? REAPER_MODULE,
    setupTimeoutMs: supplied.setupTimeoutMs ?? SETUP_TIMEOUT_MS,
    spawnProcess: supplied.spawnProcess ?? spawn,
    terminalWaitMs: supplied.terminalWaitMs ?? TERMINAL_WAIT_MS,
    watchdogModule: supplied.watchdogModule ?? WATCHDOG_MODULE,
  };
  if (typeof output.executable !== 'string' || !isAbsolute(output.executable) ||
      typeof output.watchdogModule !== 'string' || !isAbsolute(output.watchdogModule) ||
      typeof output.reaperModule !== 'string' || !isAbsolute(output.reaperModule) ||
      typeof output.spawnProcess !== 'function' ||
      typeof output.killProcessGroup !== 'function' ||
      typeof output.probeProcessGroup !== 'function' || output.platform !== 'darwin' ||
      !Number.isSafeInteger(output.lifetimeMs) || output.lifetimeMs < 1 ||
      output.lifetimeMs > GATE_B_OPERATOR_COORDINATOR_LIMITS.lifetimeMs ||
      !Number.isSafeInteger(output.gracefulStopMs) || output.gracefulStopMs < 1 ||
      output.gracefulStopMs > GATE_B_OPERATOR_COORDINATOR_LIMITS.gracefulStopMs ||
      !Number.isSafeInteger(output.reapForceMs) || output.reapForceMs < 1 ||
      output.reapForceMs > REAP_FORCE_MS ||
      !Number.isSafeInteger(output.reapAbandonMs) || output.reapAbandonMs < 1 ||
      output.reapAbandonMs > REAP_ABANDON_MS ||
      output.reapForceMs >= output.reapAbandonMs ||
      !Number.isSafeInteger(output.setupTimeoutMs) || output.setupTimeoutMs < 1 ||
      output.setupTimeoutMs > SETUP_TIMEOUT_MS ||
      !Number.isSafeInteger(output.terminalWaitMs) || output.terminalWaitMs < 1 ||
      output.terminalWaitMs > TERMINAL_WAIT_MS) fail();
  return Object.freeze(output);
}

function snapshotSiblingChild(child, groupId, role) {
  if (!child || typeof child !== 'object' || IS_PROXY(child)) fail();
  const stdio = ownDataProperty(child, 'stdio');
  if (!ARRAY_IS_ARRAY(stdio) || IS_PROXY(stdio)) fail();
  const firstPipe = ownDataProperty(stdio, '3');
  const secondPipe = ownDataProperty(stdio, '4');
  const thirdPipe = role === 'watchdog' ? ownDataProperty(stdio, '5') : undefined;
  const stdout = role === 'watchdog' ? ownDataProperty(child, 'stdout') : undefined;
  const stderr = role === 'watchdog' ? ownDataProperty(child, 'stderr') : undefined;
  const channel = ownDataProperty(child, 'channel');
  const snapshot = Object.freeze({
    channel,
    channelClose: dataProperty(channel, 'close'),
    channelUnref: dataProperty(channel, 'unref'),
    child,
    connected: ownDataProperty(child, 'connected'),
    disconnect: dataProperty(child, 'disconnect'),
    firstDestroy: dataProperty(firstPipe, 'destroy'),
    firstEnd: dataProperty(firstPipe, 'end'),
    firstPipe,
    firstRemoveListener: dataProperty(firstPipe, 'removeListener'),
    firstWrite: dataProperty(firstPipe, 'write'),
    groupId,
    on: dataProperty(child, 'on'),
    removeListener: dataProperty(child, 'removeListener'),
    role,
    secondDestroy: dataProperty(secondPipe, 'destroy'),
    secondEnd: dataProperty(secondPipe, 'end'),
    secondPipe,
    secondRemoveListener: dataProperty(secondPipe, 'removeListener'),
    secondWrite: dataProperty(secondPipe, 'write'),
    send: dataProperty(child, 'send'),
    stderr,
    stderrDestroy: dataProperty(stderr, 'destroy'),
    stderrOn: dataProperty(stderr, 'on'),
    stderrRemoveListener: dataProperty(stderr, 'removeListener'),
    stdout,
    stdoutDestroy: dataProperty(stdout, 'destroy'),
    stdoutOn: dataProperty(stdout, 'on'),
    stdoutRemoveListener: dataProperty(stdout, 'removeListener'),
    thirdDestroy: dataProperty(thirdPipe, 'destroy'),
    thirdEnd: dataProperty(thirdPipe, 'end'),
    thirdPipe,
    unref: dataProperty(child, 'unref'),
  });
  if (ownDataProperty(child, 'pid') !== groupId) fail();
  for (const key of ['on', 'removeListener', 'send', 'firstEnd', 'secondEnd']) {
    if (typeof snapshot[key] !== 'function') fail();
  }
  if (role === 'watchdog') {
    for (const key of [
      'firstWrite', 'secondWrite', 'thirdEnd', 'stdoutOn', 'stdoutRemoveListener',
      'stderrOn', 'stderrRemoveListener',
    ]) if (typeof snapshot[key] !== 'function') fail();
  } else if (role !== 'reaper' || typeof snapshot.firstWrite !== 'function') fail();
  return snapshot;
}

function exactFieldlessMessage(value, type) {
  return value && typeof value === 'object' && !IS_PROXY(value) &&
    GET_PROTOTYPE_OF(value) === OBJECT_PROTOTYPE &&
    REFLECT_OWN_KEYS(value).length === 1 && ownDataProperty(value, 'type') === type;
}

function createDeferred(rejecting = false) {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  if (rejecting) void promise.catch(() => {});
  return { promise, reject, resolve };
}

function siblingRecordFor(capability) {
  return WATCHDOG_RECORDS.get(capability);
}

function releaseSiblingRecord(record) {
  if (!record || record.released) return;
  record.released = true;
  for (const [emitter, remove, event, handler] of record.ownedHandlers) {
    try { Reflect.apply(remove, emitter, [event, handler]); } catch {}
  }
  record.ownedHandlers.length = 0;
  for (const snapshot of [record.watchdog, record.reaper]) {
    if (!snapshot) continue;
    for (const [handle, destroy] of [
      [snapshot.firstPipe, snapshot.firstDestroy],
      [snapshot.secondPipe, snapshot.secondDestroy],
      [snapshot.thirdPipe, snapshot.thirdDestroy],
      [snapshot.stdout, snapshot.stdoutDestroy],
      [snapshot.stderr, snapshot.stderrDestroy],
    ]) {
      try { if (typeof destroy === 'function') Reflect.apply(destroy, handle, []); } catch {}
    }
    try {
      if (typeof snapshot.disconnect === 'function') {
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
      if (typeof snapshot.unref === 'function') Reflect.apply(snapshot.unref, snapshot.child, []);
    } catch {}
  }
  for (const state of [record.stdoutState, record.stderrState]) {
    for (const chunk of state.chunks) {
      try { chunk.fill(0); } catch {}
    }
    state.chunks.length = 0;
    state.lines.length = 0;
    state.total = 0;
  }
  if (Buffer.isBuffer(record.targetFrame)) record.targetFrame.fill(0);
  if (Buffer.isBuffer(record.startFrame)) record.startFrame.fill(0);
}

function rejectSiblingMilestones(record) {
  const error = new GateBOperatorCoordinatorLaunchError();
  record.setupDeferred.reject(error);
  record.bootstrapDeferred?.reject(error);
  record.reviewDeferred?.reject(error);
}

function settleSiblingTerminal(record, status) {
  if (record.terminalSettled) return;
  record.terminalSettled = true;
  record.state = status;
  clearTimeout(record.setupTimer);
  clearTimeout(record.lifetimeTimer);
  clearTimeout(record.stopTimer);
  rejectSiblingMilestones(record);
  releaseSiblingRecord(record);
  record.closedDeferred.resolve(status);
  record.stopDeferred?.resolve(status);
}

function waitForSibling(record, predicate, timeoutMs) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearInterval(interval);
      clearTimeout(timer);
      resolve(value);
    };
    const probe = () => {
      try { if (predicate()) finish(true); } catch { finish(false); }
    };
    const interval = setInterval(probe, Math.min(10, timeoutMs));
    const timer = setTimeout(() => finish(false), timeoutMs);
    probe();
  });
}

function sendSiblingMessage(snapshot, type, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ok ? resolve(true) : reject(new GateBOperatorCoordinatorLaunchError());
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    try {
      Reflect.apply(snapshot.send, snapshot.child, [Object.freeze({ type }), error => {
        finish(error == null);
      }]);
    } catch { finish(false); }
  });
}

async function proveSiblingGroupsAbsent(record) {
  try {
    await proveGroupAbsent(record.watchdog.groupId, record.dependencies);
    await proveGroupAbsent(record.reaper.groupId, record.dependencies);
    await proveGroupAbsent(record.watchdog.groupId, record.dependencies);
    await proveGroupAbsent(record.reaper.groupId, record.dependencies);
    return true;
  } catch { return false; }
}

function cleanWatchdogCandidate(record) {
  const expectedLines = record.preflightIpc ? 3 : record.reviewIpc ? 2 : 1;
  return !record.protocolFault && record.watchdogExitSeen && record.watchdogCloseSeen &&
    record.watchdogExitCode === 0 && record.watchdogExitSignal === null &&
    record.watchdogCloseCode === record.watchdogExitCode &&
    record.watchdogCloseSignal === record.watchdogExitSignal &&
    record.finalIpc === GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.STOPPED &&
    exactLineCount(
      record,
      'stdoutState',
      GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.CLOSED,
      expectedLines,
    ) && record.stderrState.lines.length === 0 && record.stderrState.chunks.length === 0;
}

async function reconcileSiblingRecord(record, cleanRequested) {
  let reaperProof = false;
  let serialized = record.reaperArmed && !record.reaperLost;
  if (serialized) {
    record.state = 'CLEANING_REAPER';
    try {
      record.cleanupSent = true;
      await sendSiblingMessage(record.reaper, 'CLEANUP', record.dependencies.setupTimeoutMs);
      const absentSeen = await waitForSibling(
        record,
        () => record.reaperAbsent || record.reaperLost,
        record.dependencies.terminalWaitMs,
      );
      serialized = absentSeen && record.reaperAbsent && !record.reaperLost;
      if (serialized) {
        const watchdogAlive = Reflect.apply(
          record.dependencies.probeProcessGroup,
          undefined,
          [record.watchdog.groupId],
        );
        if (watchdogAlive !== false) serialized = false;
      }
      if (serialized) {
        const reaperClosed = await waitForSibling(
          record,
          () => record.reaperExitSeen && record.reaperCloseSeen,
          record.dependencies.terminalWaitMs,
        );
        reaperProof = reaperClosed && record.reaperExitCode === 0 &&
          record.reaperExitSignal === null &&
          record.reaperCloseCode === record.reaperExitCode &&
          record.reaperCloseSignal === record.reaperExitSignal;
      }
    } catch { serialized = false; }
  }

  if (!serialized || !reaperProof) {
    record.reaperLost = true;
    try { await reapGroup(record.reaper.groupId, record.dependencies); } catch {}
    await waitForSibling(
      record,
      () => record.reaperExitSeen && record.reaperCloseSeen,
      record.dependencies.terminalWaitMs,
    );
    try {
      const watchdogAlive = Reflect.apply(
        record.dependencies.probeProcessGroup,
        undefined,
        [record.watchdog.groupId],
      );
      if (watchdogAlive === true) await reapGroup(record.watchdog.groupId, record.dependencies);
      else if (watchdogAlive !== false) throw new GateBOperatorCoordinatorLaunchError();
    } catch {
      try { await reapGroup(record.watchdog.groupId, record.dependencies); } catch {}
    }
  }

  const watchdogClosed = await waitForSibling(
    record,
    () => record.watchdogExitSeen && record.watchdogCloseSeen,
    record.dependencies.terminalWaitMs,
  );
  const groupsAbsent = await proveSiblingGroupsAbsent(record);
  const clean = cleanRequested && serialized && reaperProof && watchdogClosed && groupsAbsent &&
    cleanWatchdogCandidate(record);
  settleSiblingTerminal(record, clean ? 'CLOSED' : 'QUARANTINED');
  return clean ? 'CLOSED' : 'QUARANTINED';
}

function beginSiblingCleanup(record, cleanRequested = false) {
  if (record.terminalWork) return record.terminalWork;
  record.cleanRequested = cleanRequested;
  record.cleanupOriginState = record.state;
  clearTimeout(record.setupTimer);
  clearTimeout(record.lifetimeTimer);
  clearTimeout(record.stopTimer);
  rejectSiblingMilestones(record);
  record.terminalWork = reconcileSiblingRecord(record, cleanRequested).catch(() => {
    settleSiblingTerminal(record, 'QUARANTINED');
    return 'QUARANTINED';
  });
  return record.terminalWork;
}

function checkSiblingMilestones(record) {
  if (record.terminalSettled || record.terminalWork) return;
  if (record.reaperLost) {
    void beginSiblingCleanup(record);
    return;
  }
  if (record.state === 'WAIT_WATCHDOG_START' && record.startWritten &&
      record.startedIpc) {
    record.state = 'AWAITING_BOOTSTRAP';
    clearTimeout(record.setupTimer);
    record.setupDeferred.resolve(record.capability);
    return;
  }
  if (record.state === 'BOOTSTRAP_SUBMITTED' && record.bootstrapWritten &&
      record.reviewIpc && exactLineCount(
        record,
        'stdoutState',
        GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.REVIEW_REQUIRED,
        1,
      ) && record.stderrState.lines.length === 0 && record.stderrState.chunks.length === 0) {
    record.state = 'REVIEW_REQUIRED';
    record.bootstrapDeferred.resolve(record.capability);
    return;
  }
  if (record.state === 'REVIEW_SUBMITTED' && record.reviewWritten &&
      record.preflightIpc && exactLineCount(
        record,
        'stdoutState',
        GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.PREFLIGHT_VALID,
        2,
      ) && record.stderrState.lines.length === 0 && record.stderrState.chunks.length === 0) {
    record.state = 'PREFLIGHT_VALID';
    record.reviewDeferred.resolve('PREFLIGHT_VALID');
  }
}

function sendWatchdogStart(record) {
  if (record.startSent || record.terminalWork || record.reaperLost) {
    if (record.reaperLost && !record.terminalWork) void beginSiblingCleanup(record);
    return;
  }
  record.startSent = true;
  record.state = 'WAIT_WATCHDOG_START';
  clearTimeout(record.setupTimer);
  record.setupTimer = setTimeout(() => void beginSiblingCleanup(record),
    record.dependencies.setupTimeoutMs);
  const frame = Buffer.alloc(4);
  frame.writeUInt32BE(WATCHDOG_START_MAGIC, 0);
  record.startFrame = frame;
  try {
    Reflect.apply(record.watchdog.firstEnd, record.watchdog.firstPipe, [frame, error => {
      if (record.startCallbackSeen) return void beginSiblingCleanup(record);
      record.startCallbackSeen = true;
      frame.fill(0);
      record.startFrame = undefined;
      if (record.terminalWork) return;
      if (error) void beginSiblingCleanup(record);
      else {
        record.startWritten = true;
        checkSiblingMilestones(record);
      }
    }]);
  } catch {
    frame.fill(0);
    record.startFrame = undefined;
    void beginSiblingCleanup(record);
  }
}

function checkReaperReady(record) {
  if (record.terminalWork || record.state !== 'WAIT_REAPER_READY' ||
      record.reaperLost || !record.reaperReady || !record.targetWritten) return;
  record.reaperArmed = true;
  sendWatchdogStart(record);
}

function installSiblingHandlers(record) {
  const listen = (emitter, on, remove, event, handler) => {
    Reflect.apply(on, emitter, [event, handler]);
    record.ownedHandlers.push([emitter, remove, event, handler]);
  };
  const poison = () => { if (!record.terminalSettled) void beginSiblingCleanup(record); };
  const onWatchdogOutput = (streamName, chunk) => {
    if (record.terminalSettled) {
      try { if (Buffer.isBuffer(chunk)) chunk.fill(0); } catch {}
      return;
    }
    if (record.terminalWork) {
      if (record.cleanupOriginState !== 'STOPPING' || record.watchdogCloseSeen) {
        try { if (Buffer.isBuffer(chunk)) chunk.fill(0); } catch {}
        return;
      }
      try {
        appendOutput(record, streamName, chunk);
        if (record.stdoutState.lines.length > 3 || record.stderrState.lines.length > 1) fail();
      } catch { record.protocolFault = true; }
      return;
    }
    if (record.state === 'WAIT_REAPER_READY' || record.state === 'WAIT_WATCHDOG_START' ||
        record.state === 'AWAITING_BOOTSTRAP') {
      try { if (Buffer.isBuffer(chunk)) chunk.fill(0); } catch {}
      poison();
      return;
    }
    try {
      appendOutput(record, streamName, chunk);
      if (streamName === 'stderrState' && record.stderrState.lines.length > 1) fail();
      checkSiblingMilestones(record);
    } catch { poison(); }
  };
  const onWatchdogMessage = message => {
    if (record.terminalSettled) return;
    if (record.reaperLost) return poison();
    if (record.terminalWork) {
      let parsed;
      try { parsed = parseGateBOperatorCoordinatorIpcMessage(message); } catch {
        record.protocolFault = true;
        return;
      }
      if ((parsed.type === GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.STOPPED ||
           parsed.type === GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.QUARANTINED) &&
          record.cleanupOriginState === 'STOPPING' && !record.finalIpc) {
        record.finalIpc = parsed.type;
      } else {
        record.protocolFault = true;
      }
      return;
    }
    if (exactFieldlessMessage(message, 'BOOTSTRAP_OPENED')) {
      if (record.state !== 'BOOTSTRAP_OPENING' || record.bootstrapOpenAck) return poison();
      record.bootstrapOpenAck = true;
      return;
    }
    if (exactFieldlessMessage(message, 'REVIEW_OPENED')) {
      if (record.state !== 'REVIEW_OPENING' || record.reviewOpenAck) return poison();
      record.reviewOpenAck = true;
      return;
    }
    if (exactFieldlessMessage(message, 'STARTED')) {
      if (record.state !== 'WAIT_WATCHDOG_START' || record.startedIpc) return poison();
      record.startedIpc = true;
      checkSiblingMilestones(record);
      return;
    }
    let parsed;
    try { parsed = parseGateBOperatorCoordinatorIpcMessage(message); } catch { return poison(); }
    if (parsed.type === GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.REVIEW_REQUIRED &&
        record.state === 'BOOTSTRAP_SUBMITTED' && !record.reviewIpc) {
      record.reviewIpc = true;
      checkSiblingMilestones(record);
      return;
    }
    if (parsed.type === GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.PREFLIGHT_VALID &&
        record.state === 'REVIEW_SUBMITTED' && !record.preflightIpc) {
      record.preflightIpc = true;
      checkSiblingMilestones(record);
      return;
    }
    if ((parsed.type === GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.STOPPED ||
         parsed.type === GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.QUARANTINED) &&
        record.state === 'STOPPING' && !record.finalIpc) {
      record.finalIpc = parsed.type;
      return;
    }
    poison();
  };
  const onWatchdogExit = (code, signal) => {
    if (record.watchdogExitSeen) return poison();
    record.watchdogExitSeen = true;
    record.watchdogExitCode = code;
    record.watchdogExitSignal = signal;
    void beginSiblingCleanup(record, record.state === 'STOPPING');
  };
  const onWatchdogClose = (code, signal) => {
    if (record.watchdogCloseSeen) return;
    record.watchdogCloseSeen = true;
    record.watchdogCloseCode = code;
    record.watchdogCloseSignal = signal;
    const clean = record.state === 'STOPPING' && cleanWatchdogCandidate(record);
    void beginSiblingCleanup(record, clean);
  };
  const onWatchdogDisconnect = () => {
    if (!record.finalIpc) {
      if (record.terminalWork) record.protocolFault = true;
      else poison();
    }
  };
  const onReaperMessage = message => {
    if (record.terminalSettled) return;
    if (exactFieldlessMessage(message, 'READY')) {
      if (record.state !== 'WAIT_REAPER_READY' || record.reaperReady || record.reaperLost) {
        return poison();
      }
      record.reaperReady = true;
      checkReaperReady(record);
      return;
    }
    if (exactFieldlessMessage(message, 'ABSENT')) {
      if (record.state !== 'CLEANING_REAPER' || !record.cleanupSent ||
          record.reaperAbsent) {
        record.reaperLost = true;
        poison();
        return;
      }
      try {
        const alive = Reflect.apply(
          record.dependencies.probeProcessGroup,
          undefined,
          [record.watchdog.groupId],
        );
        if (alive !== false) {
          record.reaperLost = true;
          return;
        }
      } catch {
        record.reaperLost = true;
        return;
      }
      record.reaperAbsent = true;
      try {
        if (typeof record.reaper.secondDestroy === 'function') {
          Reflect.apply(record.reaper.secondDestroy, record.reaper.secondPipe, []);
        }
      } catch { record.reaperLost = true; }
      return;
    }
    record.reaperLost = true;
    poison();
  };
  const onReaperExit = (code, signal) => {
    if (record.reaperExitSeen) return poison();
    record.reaperExitSeen = true;
    record.reaperExitCode = code;
    record.reaperExitSignal = signal;
    if (!record.reaperAbsent) {
      record.reaperLost = true;
      poison();
    }
  };
  const onReaperClose = (code, signal) => {
    if (record.reaperCloseSeen) return;
    record.reaperCloseSeen = true;
    record.reaperCloseCode = code;
    record.reaperCloseSignal = signal;
    if (!record.reaperAbsent) {
      record.reaperLost = true;
      poison();
    }
  };
  const onReaperDisconnect = () => {
    if (!record.reaperAbsent) {
      record.reaperLost = true;
      poison();
    }
  };

  listen(record.watchdog.child, record.watchdog.on, record.watchdog.removeListener,
    'error', poison);
  listen(record.watchdog.child, record.watchdog.on, record.watchdog.removeListener,
    'disconnect', onWatchdogDisconnect);
  listen(record.watchdog.child, record.watchdog.on, record.watchdog.removeListener,
    'message', onWatchdogMessage);
  listen(record.watchdog.child, record.watchdog.on, record.watchdog.removeListener,
    'exit', onWatchdogExit);
  listen(record.watchdog.child, record.watchdog.on, record.watchdog.removeListener,
    'close', onWatchdogClose);
  listen(record.watchdog.stdout, record.watchdog.stdoutOn,
    record.watchdog.stdoutRemoveListener, 'data', chunk => onWatchdogOutput('stdoutState', chunk));
  listen(record.watchdog.stderr, record.watchdog.stderrOn,
    record.watchdog.stderrRemoveListener, 'data', chunk => onWatchdogOutput('stderrState', chunk));
  listen(record.reaper.child, record.reaper.on, record.reaper.removeListener,
    'error', () => { record.reaperLost = true; poison(); });
  listen(record.reaper.child, record.reaper.on, record.reaper.removeListener,
    'disconnect', onReaperDisconnect);
  listen(record.reaper.child, record.reaper.on, record.reaper.removeListener,
    'message', onReaperMessage);
  listen(record.reaper.child, record.reaper.on, record.reaper.removeListener,
    'exit', onReaperExit);
  listen(record.reaper.child, record.reaper.on, record.reaper.removeListener,
    'close', onReaperClose);
}

function writeReaperTarget(record) {
  const frame = Buffer.alloc(8);
  frame.writeUInt32BE(REAPER_TARGET_MAGIC, 0);
  frame.writeUInt32BE(record.watchdog.groupId, 4);
  record.targetFrame = frame;
  try {
    Reflect.apply(record.reaper.firstEnd, record.reaper.firstPipe, [frame, error => {
      if (record.targetCallbackSeen) return void beginSiblingCleanup(record);
      record.targetCallbackSeen = true;
      frame.fill(0);
      record.targetFrame = undefined;
      if (record.terminalWork) return;
      if (error) void beginSiblingCleanup(record);
      else {
        record.targetWritten = true;
        checkReaperReady(record);
      }
    }]);
  } catch {
    frame.fill(0);
    record.targetFrame = undefined;
    void beginSiblingCleanup(record);
  }
}

function createWatchdogRecord(dependencies, watchdog, reaper) {
  const setupDeferred = createDeferred();
  const closedDeferred = createDeferred();
  const record = {
    bootstrapCallbackSeen: false,
    bootstrapDeferred: undefined,
    bootstrapOpenAck: false,
    bootstrapWritten: false,
    capability: undefined,
    cleanupSent: false,
    closedDeferred,
    dependencies,
    finalIpc: undefined,
    lifetimeTimer: undefined,
    ownedHandlers: [],
    preflightIpc: false,
    protocolFault: false,
    protocolEnded: false,
    reaper,
    reaperAbsent: false,
    reaperArmed: false,
    reaperCloseCode: undefined,
    reaperCloseSeen: false,
    reaperCloseSignal: undefined,
    reaperExitCode: undefined,
    reaperExitSeen: false,
    reaperExitSignal: undefined,
    reaperLost: false,
    reaperReady: false,
    released: false,
    reviewCallbackSeen: false,
    reviewDeferred: undefined,
    reviewIpc: false,
    reviewOpenAck: false,
    reviewWritten: false,
    setupDeferred,
    setupTimer: undefined,
    startCallbackSeen: false,
    startedIpc: false,
    startFrame: undefined,
    startSent: false,
    startWritten: false,
    state: 'WAIT_REAPER_READY',
    stderrState: { chunks: [], lines: [], total: 0 },
    stdoutState: { chunks: [], lines: [], total: 0 },
    stopDeferred: undefined,
    stopPromise: undefined,
    stopSent: false,
    stopTimer: undefined,
    targetCallbackSeen: false,
    targetFrame: undefined,
    targetWritten: false,
    terminalSettled: false,
    terminalWork: undefined,
    watchdog,
    watchdogCloseCode: undefined,
    watchdogCloseSeen: false,
    watchdogCloseSignal: undefined,
    watchdogExitCode: undefined,
    watchdogExitSeen: false,
    watchdogExitSignal: undefined,
  };
  record.capability = Object.freeze(Object.create(null));
  WATCHDOG_RECORDS.set(record.capability, record);
  installSiblingHandlers(record);
  record.setupTimer = setTimeout(() => void beginSiblingCleanup(record),
    dependencies.setupTimeoutMs);
  writeReaperTarget(record);
  return record;
}

function sendSiblingStop(record) {
  if (record.stopSent || record.terminalSettled || record.terminalWork) return;
  record.stopSent = true;
  record.state = 'STOPPING';
  try {
    Reflect.apply(record.watchdog.send, record.watchdog.child, [
      createGateBOperatorCoordinatorIpcMessage(GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.STOP),
      error => { if (error && !record.terminalWork) void beginSiblingCleanup(record); },
    ]);
  } catch { void beginSiblingCleanup(record); }
  if (!record.protocolEnded) {
    record.protocolEnded = true;
    try {
      Reflect.apply(record.watchdog.secondEnd, record.watchdog.secondPipe, [error => {
        if (error && !record.terminalWork) void beginSiblingCleanup(record);
      }]);
    } catch { void beginSiblingCleanup(record); }
  }
  record.stopTimer = setTimeout(() => void beginSiblingCleanup(record),
    record.dependencies.gracefulStopMs);
}

export function launchGateBOperatorCoordinator(bootstrap, injected = undefined) {
  return launchGateBOperatorProcess(bootstrap, injected, CLI_MODULE);
}

export async function launchGateBOperatorWatchdogSetup(injected = undefined) {
  let dependencies;
  let watchdogGroupId;
  let reaperGroupId;
  let record;
  try {
    dependencies = captureWatchdogDependencies(injected);
    const watchdogChild = Reflect.apply(dependencies.spawnProcess, undefined, [
      dependencies.executable,
      [dependencies.watchdogModule],
      {
        cwd: dirname(dependencies.watchdogModule),
        detached: true,
        env: {},
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe', 'ipc'],
        windowsHide: true,
      },
    ]);
    watchdogGroupId = captureGroupId(watchdogChild);
    const watchdog = snapshotSiblingChild(watchdogChild, watchdogGroupId, 'watchdog');
    const reaperChild = Reflect.apply(dependencies.spawnProcess, undefined, [
      dependencies.executable,
      [dependencies.reaperModule],
      {
        cwd: dirname(dependencies.reaperModule),
        detached: true,
        env: {},
        shell: false,
        stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe', 'ipc'],
        windowsHide: true,
      },
    ]);
    reaperGroupId = captureGroupId(reaperChild);
    if (reaperGroupId === watchdogGroupId) fail();
    const reaper = snapshotSiblingChild(reaperChild, reaperGroupId, 'reaper');
    record = createWatchdogRecord(dependencies, watchdog, reaper);
    return await record.setupDeferred.promise;
  } catch {
    if (record) {
      try { await beginSiblingCleanup(record); } catch {}
      try { await record.closedDeferred.promise; } catch {}
    } else {
      if (dependencies && Number.isSafeInteger(reaperGroupId) && reaperGroupId > 0) {
        try { await reapGroup(reaperGroupId, dependencies); } catch {}
      }
      if (dependencies && Number.isSafeInteger(watchdogGroupId) && watchdogGroupId > 0) {
        try { await reapGroup(watchdogGroupId, dependencies); } catch {}
      }
    }
    throw new GateBOperatorCoordinatorLaunchError();
  }
}

export function submitGateBOperatorBootstrap(capability, bootstrap) {
  const record = siblingRecordFor(capability);
  if (!record) {
    const ordinary = RECORDS.get(capability);
    if (ordinary && !ordinary.terminalSettled) void quarantineAndReap(ordinary);
    return Promise.reject(new GateBOperatorCoordinatorLaunchError());
  }
  if (record.state !== 'AWAITING_BOOTSTRAP' || record.terminalSettled ||
      record.terminalWork || record.reaperLost || record.bootstrapDeferred) {
    if (!record.terminalSettled) void beginSiblingCleanup(record);
    return Promise.reject(new GateBOperatorCoordinatorLaunchError());
  }
  let frame;
  try {
    frame = frameGateBOperatorCoordinatorBootstrap(bootstrap);
    record.bootstrapDeferred = createDeferred(true);
    record.state = 'BOOTSTRAP_OPENING';
    record.lifetimeTimer = setTimeout(() => sendSiblingStop(record),
      record.dependencies.lifetimeMs);
    const bootstrapFrame = frame;
    void (async () => {
      try {
        await sendSiblingMessage(
          record.watchdog,
          'BOOTSTRAP_OPEN',
          record.dependencies.setupTimeoutMs,
        );
        const opened = await waitForSibling(
          record,
          () => record.bootstrapOpenAck || Boolean(record.terminalWork),
          record.dependencies.setupTimeoutMs,
        );
        if (!opened || !record.bootstrapOpenAck || record.terminalWork ||
            record.reaperLost || record.state !== 'BOOTSTRAP_OPENING') fail();
        record.state = 'BOOTSTRAP_SUBMITTED';
        Reflect.apply(record.watchdog.secondWrite, record.watchdog.secondPipe,
          [bootstrapFrame, error => {
            if (record.bootstrapCallbackSeen) return void beginSiblingCleanup(record);
            record.bootstrapCallbackSeen = true;
            bootstrapFrame.fill(0);
            frame = undefined;
            if (record.terminalWork) return;
            if (error) void beginSiblingCleanup(record);
            else {
              record.bootstrapWritten = true;
              checkSiblingMilestones(record);
            }
          }]);
      } catch {
        bootstrapFrame.fill(0);
        frame = undefined;
        void beginSiblingCleanup(record);
      }
    })();
    return record.bootstrapDeferred.promise;
  } catch {
    if (Buffer.isBuffer(frame)) frame.fill(0);
    void beginSiblingCleanup(record);
    return Promise.reject(new GateBOperatorCoordinatorLaunchError());
  }
}

export function launchGateBOperatorCoordinatorInInheritedProcessGroup(
  bootstrap,
  injected = undefined,
) {
  return launchGateBOperatorProcess(bootstrap, injected, CLI_MODULE, false);
}

export function submitGateBOperatorCoordinatorReview(capability, review) {
  const sibling = siblingRecordFor(capability);
  if (sibling) {
    if (sibling.state !== 'REVIEW_REQUIRED' || sibling.terminalSettled ||
        sibling.terminalWork || sibling.reaperLost || sibling.reviewDeferred) {
      if (!sibling.terminalSettled) void beginSiblingCleanup(sibling);
      return Promise.reject(new GateBOperatorCoordinatorLaunchError());
    }
    let frame;
    try {
      frame = frameGateBOperatorCoordinatorReview(review);
      sibling.reviewDeferred = createDeferred(true);
      sibling.state = 'REVIEW_OPENING';
      sibling.protocolEnded = true;
      const reviewFrame = frame;
      void (async () => {
        try {
          await sendSiblingMessage(
            sibling.watchdog,
            'REVIEW_OPEN',
            sibling.dependencies.setupTimeoutMs,
          );
          const opened = await waitForSibling(
            sibling,
            () => sibling.reviewOpenAck || Boolean(sibling.terminalWork),
            sibling.dependencies.setupTimeoutMs,
          );
          if (!opened || !sibling.reviewOpenAck || sibling.terminalWork ||
              sibling.reaperLost || sibling.state !== 'REVIEW_OPENING') fail();
          sibling.state = 'REVIEW_SUBMITTED';
          Reflect.apply(sibling.watchdog.secondEnd, sibling.watchdog.secondPipe,
            [reviewFrame, error => {
              if (sibling.reviewCallbackSeen) return void beginSiblingCleanup(sibling);
              sibling.reviewCallbackSeen = true;
              reviewFrame.fill(0);
              frame = undefined;
              if (sibling.terminalWork) return;
              if (error) void beginSiblingCleanup(sibling);
              else {
                sibling.reviewWritten = true;
                checkSiblingMilestones(sibling);
              }
            }]);
        } catch {
          reviewFrame.fill(0);
          frame = undefined;
          void beginSiblingCleanup(sibling);
        }
      })();
      return sibling.reviewDeferred.promise;
    } catch {
      if (Buffer.isBuffer(frame)) frame.fill(0);
      void beginSiblingCleanup(sibling);
      return Promise.reject(new GateBOperatorCoordinatorLaunchError());
    }
  }

  const record = recordFor(capability);
  if (record.state !== 'REVIEW_REQUIRED' || record.terminalSettled) {
    if (record.terminalSettled) return Promise.reject(new GateBOperatorCoordinatorLaunchError());
    return quarantineAndReap(record).then(() => {
      throw new GateBOperatorCoordinatorLaunchError();
    });
  }
  let frame;
  try {
    frame = frameGateBOperatorCoordinatorReview(review);
    record.state = 'REVIEW_OPENING';
    const reviewFrame = frame;
    void (async () => {
      try {
        await sendSiblingMessage(
          record.snapshot,
          'REVIEW_OPEN',
          record.dependencies.gracefulStopMs,
        );
        const opened = await waitForSibling(
          record,
          () => record.reviewOpenAck || !record.acceptingProtocol,
          record.dependencies.gracefulStopMs,
        );
        if (!opened || !record.reviewOpenAck || !record.acceptingProtocol ||
            record.state !== 'REVIEW_OPENING') fail();
        record.state = 'REVIEW_SUBMITTED';
        Reflect.apply(record.snapshot.privateEnd, record.snapshot.privatePipe,
          [reviewFrame, error => {
            if (record.reviewWriteCallbackSeen) {
              if (record.acceptingProtocol) void quarantineAndReap(record);
              return;
            }
            record.reviewWriteCallbackSeen = true;
            reviewFrame.fill(0);
            frame = undefined;
            if (!record.acceptingProtocol) return;
            if (error) void quarantineAndReap(record);
            else {
              record.reviewWritten = true;
              checkMilestones(record);
            }
          }]);
      } catch {
        reviewFrame.fill(0);
        frame = undefined;
        void quarantineAndReap(record);
      }
    })();
    return record.reviewPromise;
  } catch {
    if (Buffer.isBuffer(frame)) frame.fill(0);
    void quarantineAndReap(record);
    return Promise.reject(new GateBOperatorCoordinatorLaunchError());
  }
}

export function getGateBOperatorCoordinatorStatus(capability) {
  const sibling = siblingRecordFor(capability);
  const record = sibling ?? recordFor(capability);
  if (record.state === 'REVIEW_REQUIRED' || record.state === 'PREFLIGHT_VALID' ||
      record.state === 'CLOSED' || record.state === 'QUARANTINED') return record.state;
  fail();
}

export function stopGateBOperatorCoordinator(capability) {
  const sibling = siblingRecordFor(capability);
  if (sibling) {
    if (sibling.stopPromise) return sibling.stopPromise;
    if (sibling.terminalSettled) return Promise.resolve(sibling.state);
    sibling.stopDeferred = createDeferred();
    sibling.stopPromise = sibling.stopDeferred.promise;
    sendSiblingStop(sibling);
    return sibling.stopPromise;
  }
  const record = recordFor(capability);
  if (record.stopPromise) return record.stopPromise;
  if (record.terminalSettled) return Promise.resolve(record.state);
  record.stopPromise = new Promise(resolve => { record.resolveStop = resolve; });
  sendStop(record);
  return record.stopPromise;
}

export function waitGateBOperatorCoordinatorClosed(capability) {
  const sibling = siblingRecordFor(capability);
  return sibling ? sibling.closedDeferred.promise : recordFor(capability).closedPromise;
}
