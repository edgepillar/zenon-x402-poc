import { fork } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types as utilTypes } from 'node:util';

const IPC_VERSION = 1;
const REQUEST_ID = 1;
const BOOTSTRAP_MAX_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_TIMEOUT_MS = 30 * 60 * 1000;
const CHILD_MODULE = fileURLToPath(
  new URL('./live-evidence-public-ws-once-run-child.js', import.meta.url),
);
const OPTION_FIELDS = Object.freeze([
  'configPath', 'buyerRpcPath', 'buyerWalletPath', 'facilitatorRpcPath',
  'authorizationPath', 'workspaceRoot', 'runName', 'transportException',
]);
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

function fail() {
  throw new Error('live_evidence_public_ws_once_supervisor_failed');
}

function exactPlainDataObject(value, fields) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
      GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const keys = REFLECT_OWN_KEYS(value);
  if (keys.length !== fields.length) fail();
  const output = {};
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, field);
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true ||
        typeof descriptor.value !== 'string' || descriptor.value.length === 0 ||
        Buffer.byteLength(descriptor.value, 'utf8') > 4096 ||
        descriptor.value.includes('\0')) fail();
    Object.defineProperty(output, field, {
      value: descriptor.value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== 'string' || !fields.includes(keys[index])) fail();
  }
  return output;
}

function exactMessage(message, expectedType) {
  if (!message || typeof message !== 'object' || IS_PROXY(message) ||
      ARRAY_IS_ARRAY(message) || GET_PROTOTYPE_OF(message) !== OBJECT_PROTOTYPE) fail();
  const fields = ['ipcVersion', 'requestId', 'type'];
  const keys = REFLECT_OWN_KEYS(message);
  if (keys.length !== fields.length) fail();
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(message, fields[index]);
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
  }
  if (message.ipcVersion !== IPC_VERSION || message.requestId !== REQUEST_ID ||
      message.type !== expectedType) fail();
}

function captureInjections(injected) {
  if (injected === undefined) return {
    forkProcess: fork,
    childModule: CHILD_MODULE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  if (!injected || typeof injected !== 'object' || IS_PROXY(injected) ||
      ARRAY_IS_ARRAY(injected) || GET_PROTOTYPE_OF(injected) !== OBJECT_PROTOTYPE) fail();
  const allowed = ['forkProcess', 'childModule', 'timeoutMs'];
  const keys = REFLECT_OWN_KEYS(injected);
  const output = {
    forkProcess: fork,
    childModule: CHILD_MODULE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = typeof key === 'string'
      ? GET_OWN_PROPERTY_DESCRIPTOR(injected, key)
      : undefined;
    if (!allowed.includes(key) || !descriptor || !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true) fail();
    output[key] = descriptor.value;
  }
  if (typeof output.forkProcess !== 'function' || typeof output.childModule !== 'string' ||
      !isAbsolute(output.childModule) || !Number.isSafeInteger(output.timeoutMs) ||
      output.timeoutMs < 1 || output.timeoutMs > MAX_TIMEOUT_MS) fail();
  return output;
}

async function reap(child, alreadyClosed) {
  if (alreadyClosed || !child || typeof child.once !== 'function') return;
  await new Promise(resolve => {
    let finished = false;
    let forceTimer;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(forceTimer);
      resolve();
    };
    child.once('close', done);
    forceTimer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
    }, 1000);
    try { child.kill('SIGTERM'); } catch {}
  });
}

export async function supervisePublicWsOnceChild(command, options, injected) {
  let child;
  let childClosed = false;
  let bootstrapBytes;
  try {
    if (command !== 'preflight-public-ws-once' && command !== 'run-public-ws-once') fail();
    const snapshot = exactPlainDataObject(options, OPTION_FIELDS);
    const dependencies = captureInjections(injected);
    bootstrapBytes = Buffer.from(JSON.stringify(snapshot), 'utf8');
    if (bootstrapBytes.length < 1 || bootstrapBytes.length > BOOTSTRAP_MAX_BYTES) fail();

    child = Reflect.apply(dependencies.forkProcess, undefined, [
      dependencies.childModule,
      [],
      {
        cwd: snapshot.workspaceRoot,
        stdio: ['ignore', 'ignore', 'ignore', 'ipc', 'pipe'],
        env: {},
        execArgv: [],
      },
    ]);
    if (!child || typeof child.on !== 'function' || typeof child.send !== 'function' ||
        !ARRAY_IS_ARRAY(child.stdio) || !child.stdio[4] ||
        typeof child.stdio[4].end !== 'function') fail();

    const expectedTerminal = command === 'preflight-public-ws-once'
      ? 'PREFLIGHT_VALID'
      : 'PENDING';
    const requestType = command === 'preflight-public-ws-once' ? 'PREFLIGHT' : 'RUN';
    const terminal = await new Promise((resolveTerminal, rejectTerminal) => {
      let phase = 'ready';
      let terminalType;
      let closed = false;
      let settled = false;
      const timer = setTimeout(() => finish(false), dependencies.timeoutMs);
      const finish = success => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (success) resolveTerminal(terminalType);
        else rejectTerminal(new Error('live_evidence_public_ws_once_supervisor_failed'));
      };
      child.on('error', () => finish(false));
      child.on('disconnect', () => {
        if (phase !== 'close') finish(false);
      });
      child.on('message', message => {
        try {
          if (phase === 'ready') {
            exactMessage(message, 'READY');
            phase = 'terminal';
            const accepted = child.send({
              ipcVersion: IPC_VERSION,
              requestId: REQUEST_ID,
              type: requestType,
            }, error => {
              if (error) finish(false);
            });
            if (accepted === false && child.connected === false) finish(false);
            return;
          }
          if (phase === 'terminal') {
            exactMessage(message, expectedTerminal);
            terminalType = message.type;
            phase = 'close';
            return;
          }
          finish(false);
        } catch {
          finish(false);
        }
      });
      child.on('exit', (code, signal) => {
        if (code !== 0 || signal !== null) finish(false);
      });
      child.on('close', (code, signal) => {
        childClosed = true;
        if (closed) return finish(false);
        closed = true;
        if (phase !== 'close' || terminalType !== expectedTerminal ||
            code !== 0 || signal !== null) return finish(false);
        finish(true);
      });
      child.stdio[4].once('error', () => finish(false));
      child.stdio[4].end(bootstrapBytes, error => {
        bootstrapBytes.fill(0);
        bootstrapBytes = undefined;
        if (error) finish(false);
      });
    });
    if (terminal !== expectedTerminal) fail();
    return Object.freeze({
      status: terminal === 'PREFLIGHT_VALID'
        ? 'preflight-valid'
        : 'pending-independent-verification',
    });
  } catch {
    if (Buffer.isBuffer(bootstrapBytes)) bootstrapBytes.fill(0);
    await reap(child, childClosed);
    fail();
  }
}
