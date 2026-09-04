import { fork } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types as utilTypes } from 'node:util';

const IPC_VERSION = 1;
const REQUEST_ID = 1;
const FINALIZER_IPC_VERSION = 2;
const FINALIZER_REQUEST_ID = 81;
const FINALIZER_COMMAND = 'finalize-independent-public-ws-once';
const BOOTSTRAP_MAX_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_TIMEOUT_MS = 30 * 60 * 1000;
const CHILD_MODULE = fileURLToPath(
  new URL('./live-evidence-public-ws-once-run-child.js', import.meta.url),
);
const PUBLIC_WS_OPTION_FIELDS = Object.freeze([
  'configPath', 'buyerRpcPath', 'buyerWalletPath', 'facilitatorRpcPath',
  'authorizationPath', 'workspaceRoot', 'runName', 'transportException',
]);
const CURRENT_TESTNET_WSS_OPTION_FIELDS = Object.freeze([
  'configPath', 'buyerRpcPath', 'buyerWalletPath', 'facilitatorRpcPath',
  'authorizationPath', 'workspaceRoot', 'runName', 'executionMode',
]);
const INDEPENDENT_FINALIZER_OPTION_FIELDS = Object.freeze([
  'endpointConfigPath', 'operatorReviewPath', 'workspaceRoot', 'runName',
  'attemptId',
]);
const CURRENT_TESTNET_WSS_EXECUTION_MODE = 'current-testnet-wss-once-v1';
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const IS_PROMISE = utilTypes.isPromise;
const OBJECT_PROTOTYPE = Object.prototype;
const PROMISE_PROTOTYPE = Promise.prototype;
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

function exactMessage(
  message,
  expectedType,
  expectedRequestId = REQUEST_ID,
  expectedIpcVersion = IPC_VERSION,
) {
  if (!message || typeof message !== 'object' || IS_PROXY(message) ||
      ARRAY_IS_ARRAY(message) || GET_PROTOTYPE_OF(message) !== OBJECT_PROTOTYPE) fail();
  const fields = ['ipcVersion', 'requestId', 'type'];
  const keys = REFLECT_OWN_KEYS(message);
  if (keys.length !== fields.length) fail();
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(message, fields[index]);
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
  }
  if (message.ipcVersion !== expectedIpcVersion ||
      message.requestId !== expectedRequestId ||
      message.type !== expectedType) fail();
}

function exactNativePromise(value) {
  if (!IS_PROMISE(value) || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== PROMISE_PROTOTYPE ||
      GET_OWN_PROPERTY_DESCRIPTOR(value, 'then') !== undefined) fail();
  return value;
}

async function allowExistingDirectOriginBind() {
  return true;
}

function captureInjections(injected) {
  if (injected === undefined) return {
    forkProcess: fork,
    childModule: CHILD_MODULE,
    beforeOriginBind: allowExistingDirectOriginBind,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  if (!injected || typeof injected !== 'object' || IS_PROXY(injected) ||
      ARRAY_IS_ARRAY(injected) || GET_PROTOTYPE_OF(injected) !== OBJECT_PROTOTYPE) fail();
  const allowed = ['forkProcess', 'childModule', 'beforeOriginBind', 'timeoutMs'];
  const keys = REFLECT_OWN_KEYS(injected);
  const output = {
    forkProcess: fork,
    childModule: CHILD_MODULE,
    beforeOriginBind: allowExistingDirectOriginBind,
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
  if (typeof output.forkProcess !== 'function' || typeof output.beforeOriginBind !== 'function' ||
      IS_PROXY(output.beforeOriginBind) || typeof output.childModule !== 'string' ||
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
    const independentFinalizer = command === FINALIZER_COMMAND;
    if (!independentFinalizer && command !== 'preflight-public-ws-once' &&
        command !== 'run-public-ws-once') fail();
    if (!options || typeof options !== 'object' || IS_PROXY(options) ||
        ARRAY_IS_ARRAY(options) || GET_PROTOTYPE_OF(options) !== OBJECT_PROTOTYPE) fail();
    const fields = independentFinalizer
      ? INDEPENDENT_FINALIZER_OPTION_FIELDS
      : GET_OWN_PROPERTY_DESCRIPTOR(options, 'executionMode') !== undefined
        ? CURRENT_TESTNET_WSS_OPTION_FIELDS
        : PUBLIC_WS_OPTION_FIELDS;
    const snapshot = exactPlainDataObject(options, fields);
    if (fields === CURRENT_TESTNET_WSS_OPTION_FIELDS &&
        snapshot.executionMode !== CURRENT_TESTNET_WSS_EXECUTION_MODE) fail();
    const dependencies = captureInjections(injected);
    const bootstrap = independentFinalizer
      ? {
          bootstrapVersion: 1,
          command: FINALIZER_COMMAND,
          endpointConfigPath: snapshot.endpointConfigPath,
          operatorReviewPath: snapshot.operatorReviewPath,
          workspaceRoot: snapshot.workspaceRoot,
          runName: snapshot.runName,
          attemptId: snapshot.attemptId,
        }
      : snapshot;
    bootstrapBytes = Buffer.from(JSON.stringify(bootstrap), 'utf8');
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

    const expectedTerminal = independentFinalizer
      ? 'FINALIZED'
      : command === 'preflight-public-ws-once'
        ? 'PREFLIGHT_VALID'
        : 'PENDING';
    const requestType = independentFinalizer
      ? 'FINALIZE'
      : command === 'preflight-public-ws-once' ? 'PREFLIGHT' : 'RUN';
    const readyType = independentFinalizer ? 'FINALIZER_READY' : 'READY';
    const requestId = independentFinalizer ? FINALIZER_REQUEST_ID : REQUEST_ID;
    const ipcVersion = independentFinalizer ? FINALIZER_IPC_VERSION : IPC_VERSION;
    const terminal = await new Promise((resolveTerminal, rejectTerminal) => {
      let phase = 'ready';
      let terminalType;
      let originReleaseAcknowledged = false;
      let originReleaseRequested = false;
      let closed = false;
      let closeCode;
      let closeSignal;
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
            exactMessage(message, readyType, requestId, ipcVersion);
            phase = 'terminal';
            const accepted = child.send({
              ipcVersion,
              requestId,
              type: requestType,
            }, error => {
              if (error) finish(false);
            });
            if (accepted === false && child.connected === false) finish(false);
            return;
          }
          if (phase === 'terminal') {
            if (requestType === 'RUN' && !originReleaseRequested) {
              exactMessage(message, 'ORIGIN_RELEASE', 2);
              originReleaseRequested = true;
              const released = exactNativePromise(Reflect.apply(
                dependencies.beforeOriginBind,
                undefined,
                [],
              ));
              void released.then(value => {
                if (settled || phase !== 'terminal' || value !== true) return finish(false);
                try {
                  const accepted = child.send({
                    ipcVersion: IPC_VERSION,
                    requestId: 2,
                    type: 'ORIGIN_RELEASED',
                  }, error => {
                    if (error || settled) return finish(false);
                    originReleaseAcknowledged = true;
                    if (terminalType === expectedTerminal) {
                      phase = 'close';
                      if (closed && closeCode === 0 && closeSignal === null) finish(true);
                    }
                  });
                  if (accepted === false && child.connected === false) finish(false);
                } catch { finish(false); }
              }, () => finish(false));
              return;
            }
            if (terminalType !== undefined) fail();
            exactMessage(message, expectedTerminal, requestId, ipcVersion);
            if (requestType === 'RUN' && !originReleaseRequested) fail();
            terminalType = message.type;
            if (requestType !== 'RUN' || originReleaseAcknowledged) phase = 'close';
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
        closeCode = code;
        closeSignal = signal;
        if (code !== 0 || signal !== null || terminalType !== expectedTerminal) {
          return finish(false);
        }
        if (phase === 'terminal' && requestType === 'RUN' &&
            !originReleaseAcknowledged) return;
        if (phase !== 'close') return finish(false);
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
        : terminal === 'FINALIZED'
          ? 'independent-verification-complete'
          : 'pending-independent-verification',
    });
  } catch {
    if (Buffer.isBuffer(bootstrapBytes)) bootstrapBytes.fill(0);
    await reap(child, childClosed);
    fail();
  }
}
