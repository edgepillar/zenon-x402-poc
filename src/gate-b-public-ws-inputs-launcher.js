import { spawn } from 'node:child_process';
import { dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types as utilTypes } from 'node:util';

import {
  frameGateBPublicWsInputsBootstrap,
  GATE_B_PUBLIC_WS_INPUT_OPERATIONS,
  GATE_B_PUBLIC_WS_INPUT_STATUS_LINES,
} from './gate-b-public-ws-inputs-schema.js';

const ERROR_CODE = 'gate_b_public_ws_inputs_launch_failed';
const CLI_MODULE = fileURLToPath(new URL('./gate-b-public-ws-inputs-cli.js', import.meta.url));
const OUTPUT_MAX_BYTES = 128;
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 60_000;
const REAP_FORCE_MS = 250;
const REAP_ABANDON_MS = 1250;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

export class GateBPublicWsInputsLaunchError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBPublicWsInputsLaunchError';
    this.code = ERROR_CODE;
    this.stack = `GateBPublicWsInputsLaunchError: ${ERROR_CODE}`;
  }
}

function fail() {
  throw new GateBPublicWsInputsLaunchError();
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
    spawnProcess: spawn,
    executable: process.execPath,
    cliModule: CLI_MODULE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    platform: process.platform,
    killProcessGroup,
    probeProcessGroup,
    reapForceMs: REAP_FORCE_MS,
    reapAbandonMs: REAP_ABANDON_MS,
  };
  if (value !== undefined) {
    if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
        GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
    const allowed = [
      'spawnProcess', 'executable', 'cliModule', 'timeoutMs', 'platform',
      'killProcessGroup', 'probeProcessGroup', 'reapForceMs', 'reapAbandonMs',
    ];
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
  if (typeof output.spawnProcess !== 'function' ||
      typeof output.killProcessGroup !== 'function' ||
      typeof output.probeProcessGroup !== 'function' ||
      typeof output.executable !== 'string' || !isAbsolute(output.executable) ||
      typeof output.cliModule !== 'string' || !isAbsolute(output.cliModule) ||
      !Number.isSafeInteger(output.timeoutMs) || output.timeoutMs < 1 ||
      output.timeoutMs > MAX_TIMEOUT_MS ||
      !Number.isSafeInteger(output.reapForceMs) || output.reapForceMs < 1 ||
      output.reapForceMs > REAP_FORCE_MS ||
      !Number.isSafeInteger(output.reapAbandonMs) || output.reapAbandonMs < 1 ||
      output.reapAbandonMs > REAP_ABANDON_MS ||
      output.reapForceMs >= output.reapAbandonMs || output.platform !== 'darwin') fail();
  return output;
}

function appendBounded(chunks, chunk, state) {
  if (!Buffer.isBuffer(chunk)) fail();
  state.total += chunk.length;
  if (!Number.isSafeInteger(state.total) || state.total > OUTPUT_MAX_BYTES) {
    chunk.fill(0);
    fail();
  }
  chunks.push(chunk);
}

function exactOutput(chunks, total, expected) {
  const bytes = Buffer.concat(chunks, total);
  const comparison = Buffer.from(expected, 'utf8');
  try {
    return bytes.equals(comparison);
  } finally {
    bytes.fill(0);
    comparison.fill(0);
  }
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

function exactChild(child) {
  if (!child || typeof child !== 'object' || IS_PROXY(child)) fail();
  const on = dataProperty(child, 'on');
  const removeListener = dataProperty(child, 'removeListener');
  const stdout = dataProperty(child, 'stdout');
  const stderr = dataProperty(child, 'stderr');
  const stdio = dataProperty(child, 'stdio');
  const privateFd = ARRAY_IS_ARRAY(stdio) && !IS_PROXY(stdio)
    ? dataProperty(stdio, '3')
    : undefined;
  const stdoutOn = dataProperty(stdout, 'on');
  const stdoutRemoveListener = dataProperty(stdout, 'removeListener');
  const stderrOn = dataProperty(stderr, 'on');
  const stderrRemoveListener = dataProperty(stderr, 'removeListener');
  const privateEnd = dataProperty(privateFd, 'end');
  const privateOnce = dataProperty(privateFd, 'once');
  const privateRemoveListener = dataProperty(privateFd, 'removeListener');
  if (typeof on !== 'function' || typeof dataProperty(child, 'once') !== 'function' ||
      typeof removeListener !== 'function' || retainedDetachedGroupId(child) === undefined ||
      typeof stdoutOn !== 'function' || typeof stdoutRemoveListener !== 'function' ||
      typeof stderrOn !== 'function' || typeof stderrRemoveListener !== 'function' ||
      typeof privateEnd !== 'function' || typeof privateOnce !== 'function' ||
      typeof privateRemoveListener !== 'function') fail();
  const channel = dataProperty(child, 'channel');
  return Object.freeze({
    channel,
    channelClose: dataProperty(channel, 'close'),
    channelUnref: dataProperty(channel, 'unref'),
    child,
    childDisconnect: dataProperty(child, 'disconnect'),
    childUnref: dataProperty(child, 'unref'),
    connected: dataProperty(child, 'connected'),
    on,
    privateDestroy: dataProperty(privateFd, 'destroy'),
    privateEnd,
    privateFd,
    privateOnce,
    privateRemoveListener,
    removeListener,
    stderr,
    stderrDestroy: dataProperty(stderr, 'destroy'),
    stderrOn,
    stderrRemoveListener,
    stdout,
    stdoutDestroy: dataProperty(stdout, 'destroy'),
    stdoutOn,
    stdoutRemoveListener,
  });
}

async function proveGroupAbsent(groupId, dependencies) {
  const alive = Reflect.apply(dependencies.probeProcessGroup, undefined, [groupId]);
  if (typeof alive !== 'boolean' || alive) fail();
  return true;
}

async function reapProcessGroup(groupId, dependencies) {
  await new Promise((resolveReap, rejectReap) => {
    let finished = false;
    let probeTimer;
    let forceTimer;
    let abandonTimer;
    const finish = success => {
      if (finished) return;
      finished = true;
      clearInterval(probeTimer);
      clearTimeout(forceTimer);
      clearTimeout(abandonTimer);
      if (success) resolveReap(true);
      else rejectReap(new GateBPublicWsInputsLaunchError());
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
      if (!finished) probe();
    };
    if (probe() !== true) return;
    signal('SIGTERM');
    if (finished) return;
    probeTimer = setInterval(
      probe,
      Math.max(1, Math.min(10, dependencies.reapForceMs)),
    );
    forceTimer = setTimeout(() => {
      if (probe() === true) signal('SIGKILL');
    }, dependencies.reapForceMs);
    abandonTimer = setTimeout(() => {
      if (probe() === true) finish(false);
    }, dependencies.reapAbandonMs);
  });
  return proveGroupAbsent(groupId, dependencies);
}

function destroyOwnedHandle(handle, destroy) {
  try {
    if (handle && typeof destroy === 'function') Reflect.apply(destroy, handle, []);
  } catch {}
}

function releaseOwnedChild(record, handlers) {
  if (!record) return;
  if (handlers) {
    for (const [emitter, removeListener, event, handler] of handlers) {
      try { Reflect.apply(removeListener, emitter, [event, handler]); } catch {}
    }
  }
  destroyOwnedHandle(record.stdout, record.stdoutDestroy);
  destroyOwnedHandle(record.stderr, record.stderrDestroy);
  destroyOwnedHandle(record.privateFd, record.privateDestroy);
  try {
    if (record.connected === true && typeof record.childDisconnect === 'function') {
      Reflect.apply(record.childDisconnect, record.child, []);
    }
  } catch {}
  try {
    if (typeof record.channelClose === 'function') {
      Reflect.apply(record.channelClose, record.channel, []);
    }
  } catch {}
  try {
    if (typeof record.channelUnref === 'function') {
      Reflect.apply(record.channelUnref, record.channel, []);
    }
  } catch {}
  try {
    if (typeof record.childUnref === 'function') {
      Reflect.apply(record.childUnref, record.child, []);
    }
  } catch {}
}

function successStatus(operation) {
  if (operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PROVISION_ENDPOINT) {
    return 'endpoint-provisioned';
  }
  if (operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PREPARE) return 'prepared';
  if (operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.AUTHORIZE) return 'authorized';
  fail();
}

export async function launchGateBPublicWsInputs(bootstrap, injected) {
  const stdoutChunks = [];
  const stderrChunks = [];
  const stdoutState = { total: 0 };
  const stderrState = { total: 0 };
  let child;
  let childRecord;
  let retainedChild;
  let groupId;
  let dependencies;
  let frame;
  const ownedHandlers = [];
  try {
    dependencies = exactInjections(injected);
    frame = frameGateBPublicWsInputsBootstrap(bootstrap);
    const operation = bootstrap.operation;
    const expectedLine = GATE_B_PUBLIC_WS_INPUT_STATUS_LINES[operation];
    if (typeof expectedLine !== 'string') fail();

    retainedChild = Reflect.apply(dependencies.spawnProcess, undefined, [
      dependencies.executable,
      [dependencies.cliModule, operation],
      {
        cwd: dirname(dependencies.cliModule),
        detached: true,
        env: {},
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    ]);
    groupId = retainedDetachedGroupId(retainedChild);
    childRecord = exactChild(retainedChild);
    child = childRecord.child;
    if (groupId === undefined) fail();

    const result = await new Promise((resolveResult, rejectResult) => {
      let settled = false;
      let exited = false;
      let exitCode;
      let exitSignal;
      let frameWritten = false;
      const timer = setTimeout(() => finish(false), dependencies.timeoutMs);
      const finish = success => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (success) resolveResult(true);
        else rejectResult(new GateBPublicWsInputsLaunchError());
      };
      const onError = () => finish(false);
      const onStdout = chunk => {
        if (settled) return;
        try { appendBounded(stdoutChunks, chunk, stdoutState); } catch { finish(false); }
      };
      const onStderr = chunk => {
        if (settled) return;
        try { appendBounded(stderrChunks, chunk, stderrState); } catch { finish(false); }
      };
      const onExit = (code, signal) => {
        if (settled) return;
        if (exited) return finish(false);
        exited = true;
        exitCode = code;
        exitSignal = signal;
      };
      const onClose = (code, signal) => {
        if (settled) return;
        if (!exited || code !== exitCode || signal !== exitSignal || !frameWritten ||
            code !== 0 || signal !== null || stderrState.total !== 0 ||
            !exactOutput(stdoutChunks, stdoutState.total, expectedLine)) return finish(false);
        finish(true);
      };
      Reflect.apply(childRecord.on, child, ['error', onError]);
      Reflect.apply(childRecord.stdoutOn, childRecord.stdout, ['data', onStdout]);
      Reflect.apply(childRecord.stderrOn, childRecord.stderr, ['data', onStderr]);
      Reflect.apply(childRecord.on, child, ['exit', onExit]);
      Reflect.apply(childRecord.on, child, ['close', onClose]);
      ownedHandlers.push(
        [child, childRecord.removeListener, 'error', onError],
        [childRecord.stdout, childRecord.stdoutRemoveListener, 'data', onStdout],
        [childRecord.stderr, childRecord.stderrRemoveListener, 'data', onStderr],
        [child, childRecord.removeListener, 'exit', onExit],
        [child, childRecord.removeListener, 'close', onClose],
      );
      const onPrivateError = () => finish(false);
      Reflect.apply(childRecord.privateOnce, childRecord.privateFd, ['error', onPrivateError]);
      ownedHandlers.push([
        childRecord.privateFd,
        childRecord.privateRemoveListener,
        'error',
        onPrivateError,
      ]);
      Reflect.apply(childRecord.privateEnd, childRecord.privateFd, [frame, error => {
        if (settled) return;
        frameWritten = error === undefined || error === null;
        if (!frameWritten) finish(false);
      }]);
    });
    if (result !== true) fail();
    await proveGroupAbsent(groupId, dependencies);
    return Object.freeze({ status: successStatus(operation) });
  } catch {
    if (groupId !== undefined && dependencies) {
      try { await reapProcessGroup(groupId, dependencies); } catch {}
    }
    fail();
  } finally {
    releaseOwnedChild(childRecord, ownedHandlers);
    if (Buffer.isBuffer(frame)) frame.fill(0);
    for (let index = 0; index < stdoutChunks.length; index += 1) stdoutChunks[index].fill(0);
    for (let index = 0; index < stderrChunks.length; index += 1) stderrChunks[index].fill(0);
  }
}
