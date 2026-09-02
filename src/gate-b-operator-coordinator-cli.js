import { fork } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { types as utilTypes } from 'node:util';

import {
  authorizeAndPreflightGateBPublicWsInputs,
  getGateBPublicWsInputsControllerStatus,
  prepareGateBPublicWsInputsForReviewInInheritedProcessGroup,
  stopGateBPublicWsInputsController,
  waitGateBPublicWsInputsControllerClosed,
} from './gate-b-public-ws-inputs-controller.js';
import {
  GATE_B_OPERATOR_COORDINATOR_IPC_TYPES,
  GATE_B_OPERATOR_COORDINATOR_LIMITS,
  GATE_B_OPERATOR_COORDINATOR_STATUS_LINES,
  GATE_B_OPERATOR_REVIEW_CHILD_IPC_TYPES,
  createGateBOperatorCoordinatorIpcMessage,
  frameGateBOperatorReviewResult,
  createGateBOperatorReviewChildIpcMessage,
  parseGateBOperatorCoordinatorBootstrapFrame,
  parseGateBOperatorCoordinatorIpcMessage,
  parseGateBOperatorCoordinatorReviewFrame,
  parseGateBOperatorReviewChildIpcMessage,
  parseGateBOperatorReviewResultFrame,
} from './gate-b-operator-coordinator-schema.js';

const ERROR_CODE = 'gate_b_operator_coordinator_cli_failed';
const INPUT_FD = 3;
const REVIEW_RESULT_FD = 4;
const REVIEW_CHILD_MODULE = fileURLToPath(
  new URL('./gate-b-operator-config-review-child.js', import.meta.url),
);
const CONTROLLER_REVIEW_REQUIRED =
  'GATE_B_CONTROLLER_REVIEW_REQUIRED_RUN_NOT_AUTHORIZED';
const CONTROLLER_PREFLIGHT_VALID =
  'GATE_B_CONTROLLER_PREFLIGHT_VALID_RUN_NOT_AUTHORIZED';
const CONTROLLER_CLOSED = 'GATE_B_CONTROLLER_CLOSED_RUN_NOT_EXECUTED';
const CONTROLLER_QUARANTINED = 'GATE_B_CONTROLLER_FAILED_WORKSPACE_QUARANTINED';
const REVIEW_FORCE_MS = 500;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROMISE = utilTypes.isPromise;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

export class GateBOperatorCoordinatorCliError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBOperatorCoordinatorCliError';
    this.code = ERROR_CODE;
    this.stack = `GateBOperatorCoordinatorCliError: ${ERROR_CODE}`;
  }
}

function fail() {
  throw new GateBOperatorCoordinatorCliError();
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

function exactFieldlessControl(value, type) {
  return value && typeof value === 'object' && !IS_PROXY(value) &&
    GET_PROTOTYPE_OF(value) === OBJECT_PROTOTYPE &&
    REFLECT_OWN_KEYS(value).length === 1 && ownDataProperty(value, 'type') === type;
}

function snapshotAbortSignal(signal) {
  if (!signal || typeof signal !== 'object' || IS_PROXY(signal)) fail();
  const abortedDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(AbortSignal.prototype, 'aborted');
  const addEventListener = dataProperty(AbortSignal.prototype, 'addEventListener');
  const removeEventListener = dataProperty(AbortSignal.prototype, 'removeEventListener');
  if (!abortedDescriptor || typeof abortedDescriptor.get !== 'function' ||
      typeof addEventListener !== 'function' || typeof removeEventListener !== 'function') fail();
  const getAborted = () => {
    let aborted;
    try { aborted = Reflect.apply(abortedDescriptor.get, signal, []); } catch { fail(); }
    if (typeof aborted !== 'boolean') fail();
    return aborted;
  };
  getAborted();
  return Object.freeze({ addEventListener, getAborted, removeEventListener, signal });
}

function exactNativePromise(value) {
  if (!IS_PROMISE(value) || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== Promise.prototype ||
      GET_OWN_PROPERTY_DESCRIPTOR(value, 'then') !== undefined) fail();
  return value;
}

function callAsync(fn, receiver, args) {
  if (typeof fn !== 'function') fail();
  return exactNativePromise(Reflect.apply(fn, receiver, args));
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

function exactTimeout(value, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail();
  return value;
}

export function createGateBOperatorCoordinatorFrameReader(stream, options = undefined) {
  const supplied = options === undefined ? {} : exactPartialOptions(options, [
    'initialTimeoutMs', 'reviewTimeoutMs',
  ]);
  const initialTimeoutMs = exactTimeout(
    supplied.initialTimeoutMs ?? GATE_B_OPERATOR_COORDINATOR_LIMITS.initialFrameTimeoutMs,
    GATE_B_OPERATOR_COORDINATOR_LIMITS.initialFrameTimeoutMs,
  );
  const reviewTimeoutMs = exactTimeout(
    supplied.reviewTimeoutMs ?? GATE_B_OPERATOR_COORDINATOR_LIMITS.reviewFrameTimeoutMs,
    GATE_B_OPERATOR_COORDINATOR_LIMITS.reviewFrameTimeoutMs,
  );
  if (!stream || typeof stream !== 'object' || IS_PROXY(stream) ||
      ownDataProperty(stream, 'isTTY') === true) fail();
  const on = dataProperty(stream, 'on');
  const removeListener = dataProperty(stream, 'removeListener');
  const destroy = dataProperty(stream, 'destroy');
  if (typeof on !== 'function' || typeof removeListener !== 'function') fail();

  let phase = 'INITIAL';
  let current = Buffer.alloc(0);
  let expected;
  let initialFrame;
  let reviewFrame;
  let terminalError;
  let initialRead = false;
  let reviewRead = false;
  let reviewOpened = false;
  let initialTimer;
  let reviewTimer;
  let resolveInitial;
  let rejectInitial;
  let resolveReview;
  let rejectReview;
  const initialPromise = new Promise((resolve, reject) => {
    resolveInitial = resolve;
    rejectInitial = reject;
  });
  const reviewPromise = new Promise((resolve, reject) => {
    resolveReview = resolve;
    rejectReview = reject;
  });
  void initialPromise.catch(() => {});
  void reviewPromise.catch(() => {});
  const detach = () => {
    for (const [event, handler] of [
      ['data', onData], ['end', onEnd], ['error', onFailure], ['close', onClose],
    ]) {
      try { Reflect.apply(removeListener, stream, [event, handler]); } catch {}
    }
  };
  const clearCurrent = () => {
    try { current.fill(0); } catch {}
    current = Buffer.alloc(0);
    expected = undefined;
  };
  const failReader = () => {
    if (terminalError) return;
    terminalError = new GateBOperatorCoordinatorCliError();
    phase = 'FAILED';
    clearTimeout(initialTimer);
    clearTimeout(reviewTimer);
    clearCurrent();
    try { if (Buffer.isBuffer(initialFrame)) initialFrame.fill(0); } catch {}
    try { if (Buffer.isBuffer(reviewFrame)) reviewFrame.fill(0); } catch {}
    initialFrame = undefined;
    reviewFrame = undefined;
    detach();
    try { if (typeof destroy === 'function') Reflect.apply(destroy, stream, []); } catch {}
    rejectInitial(terminalError);
    rejectReview(terminalError);
  };
  function onFailure() { failReader(); }
  function onClose() {
    if (phase !== 'COMPLETE' && phase !== 'FAILED') failReader();
  }
  function onEnd() {
    if (phase === 'REVIEW_COMPLETE' && Buffer.isBuffer(reviewFrame)) {
      phase = 'COMPLETE';
      clearTimeout(reviewTimer);
      detach();
      resolveReview(reviewFrame);
      return;
    }
    failReader();
  }
  function onData(chunk) {
    if (!Buffer.isBuffer(chunk) || phase === 'WAIT_REVIEW' || phase === 'REVIEW_COMPLETE' ||
        phase === 'COMPLETE' || phase === 'FAILED') {
      try { if (Buffer.isBuffer(chunk)) chunk.fill(0); } catch {}
      failReader();
      return;
    }
    const maximum = phase === 'INITIAL'
      ? GATE_B_OPERATOR_COORDINATOR_LIMITS.bootstrapFrameBytes
      : GATE_B_OPERATOR_COORDINATOR_LIMITS.reviewFrameBytes;
    if (current.length + chunk.length > maximum) {
      try { chunk.fill(0); } catch {}
      failReader();
      return;
    }
    const combined = Buffer.concat([current, chunk], current.length + chunk.length);
    current.fill(0);
    chunk.fill(0);
    current = combined;
    if (expected === undefined && current.length >= 4) {
      const payloadLength = current.readUInt32BE(0);
      if (payloadLength < 1 || payloadLength > maximum - 4) return failReader();
      expected = payloadLength + 4;
    }
    if (expected === undefined || current.length < expected) return;
    if (current.length !== expected) return failReader();
    const completed = Buffer.from(current);
    clearCurrent();
    if (phase === 'INITIAL') {
      phase = 'WAIT_REVIEW';
      clearTimeout(initialTimer);
      initialFrame = completed;
      resolveInitial(initialFrame);
    } else {
      phase = 'REVIEW_COMPLETE';
      reviewFrame = completed;
    }
  }
  Reflect.apply(on, stream, ['data', onData]);
  Reflect.apply(on, stream, ['end', onEnd]);
  Reflect.apply(on, stream, ['error', onFailure]);
  Reflect.apply(on, stream, ['close', onClose]);
  initialTimer = setTimeout(failReader, initialTimeoutMs);

  return Object.freeze({
    close() {
      if (phase === 'COMPLETE') {
        detach();
        try { if (typeof destroy === 'function') Reflect.apply(destroy, stream, []); } catch {}
        return true;
      }
      failReader();
      return false;
    },
    openReviewPhase() {
      if (terminalError || phase !== 'WAIT_REVIEW' || reviewOpened) fail();
      reviewOpened = true;
      phase = 'REVIEW';
      reviewTimer = setTimeout(failReader, reviewTimeoutMs);
      return true;
    },
    readInitial() {
      if (initialRead) fail();
      initialRead = true;
      return initialPromise;
    },
    readReview() {
      if (!reviewOpened || reviewRead) fail();
      reviewRead = true;
      return reviewPromise;
    },
  });
}

function snapshotReviewChild(child) {
  if (!child || typeof child !== 'object' || IS_PROXY(child)) fail();
  const stdio = ownDataProperty(child, 'stdio');
  const resultPipe = ARRAY_IS_ARRAY(stdio) && !IS_PROXY(stdio)
    ? ownDataProperty(stdio, String(REVIEW_RESULT_FD))
    : undefined;
  const stdout = ownDataProperty(child, 'stdout');
  const stderr = ownDataProperty(child, 'stderr');
  const channel = ownDataProperty(child, 'channel');
  const snapshot = Object.freeze({
    channel,
    child,
    connected: ownDataProperty(child, 'connected'),
    disconnect: dataProperty(child, 'disconnect'),
    kill: dataProperty(child, 'kill'),
    on: dataProperty(child, 'on'),
    removeListener: dataProperty(child, 'removeListener'),
    resultPipe,
    resultOn: dataProperty(resultPipe, 'on'),
    resultRemoveListener: dataProperty(resultPipe, 'removeListener'),
    send: dataProperty(child, 'send'),
    stderr,
    stderrOn: dataProperty(stderr, 'on'),
    stderrRemoveListener: dataProperty(stderr, 'removeListener'),
    stdout,
    stdoutOn: dataProperty(stdout, 'on'),
    stdoutRemoveListener: dataProperty(stdout, 'removeListener'),
  });
  for (const key of [
    'on', 'removeListener', 'kill', 'send', 'resultOn', 'resultRemoveListener',
    'stderrOn', 'stderrRemoveListener', 'stdoutOn', 'stdoutRemoveListener',
  ]) if (typeof snapshot[key] !== 'function') fail();
  return snapshot;
}

function destroyReviewChild(snapshot) {
  if (!snapshot) return;
  try { Reflect.apply(snapshot.kill, snapshot.child, ['SIGTERM']); } catch {}
  const force = setTimeout(() => {
    try { Reflect.apply(snapshot.kill, snapshot.child, ['SIGKILL']); } catch {}
  }, REVIEW_FORCE_MS);
  if (typeof force.unref === 'function') force.unref();
}

export function launchGateBOperatorConfigReview(workspaceRoot, injected = undefined) {
  if (typeof workspaceRoot !== 'string' || !isAbsolute(workspaceRoot)) fail();
  const supplied = injected === undefined ? {} : exactPartialOptions(injected, [
    'childModule', 'forkProcess', 'signal', 'timeoutMs',
  ]);
  const childModule = supplied.childModule ?? REVIEW_CHILD_MODULE;
  const forkProcess = supplied.forkProcess ?? fork;
  const signal = supplied.signal;
  const signalSnapshot = signal === undefined ? undefined : snapshotAbortSignal(signal);
  const timeoutMs = exactTimeout(
    supplied.timeoutMs ?? GATE_B_OPERATOR_COORDINATOR_LIMITS.reviewChildTimeoutMs,
    GATE_B_OPERATOR_COORDINATOR_LIMITS.reviewChildTimeoutMs,
  );
  if (typeof childModule !== 'string' || !isAbsolute(childModule) ||
      typeof forkProcess !== 'function') fail();
  return new Promise((resolve, reject) => {
    let child;
    let snapshot;
    let settled = false;
    let accepting = true;
    let ready = false;
    let reviewSent = false;
    let reviewed = false;
    let resultEnded = false;
    let exitSeen = false;
    let exitCode;
    let exitSignal;
    let total = 0;
    const chunks = [];
    const owned = [];
    let timer;
    const detach = () => {
      for (const [emitter, remove, event, handler] of owned) {
        try { Reflect.apply(remove, emitter, [event, handler]); } catch {}
      }
      owned.length = 0;
    };
    const clear = () => {
      for (let index = 0; index < chunks.length; index += 1) {
        try { chunks[index].fill(0); } catch {}
      }
    };
    const finish = (success, value) => {
      if (settled) return;
      settled = true;
      accepting = false;
      clearTimeout(timer);
      detach();
      clear();
      if (!success) destroyReviewChild(snapshot);
      if (success) resolve(value);
      else reject(new GateBOperatorCoordinatorCliError());
    };
    const onAbort = () => finish(false);
    try {
      child = Reflect.apply(forkProcess, undefined, [
        childModule,
        [],
        {
          cwd: workspaceRoot,
          detached: false,
          env: {},
          execArgv: [],
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe', 'ipc', 'pipe'],
          windowsHide: true,
        },
      ]);
      snapshot = snapshotReviewChild(child);
      const listen = (emitter, onMethod, remove, event, handler) => {
        Reflect.apply(onMethod, emitter, [event, handler]);
        owned.push([emitter, remove, event, handler]);
      };
      const failEvent = () => finish(false);
      const onDisconnect = () => {
        if (accepting && !reviewed) finish(false);
      };
      const onOutput = chunk => {
        try { if (Buffer.isBuffer(chunk)) chunk.fill(0); } catch {}
        finish(false);
      };
      const onResult = chunk => {
        if (!accepting || !reviewSent || !Buffer.isBuffer(chunk)) {
          try { if (Buffer.isBuffer(chunk)) chunk.fill(0); } catch {}
          return finish(false);
        }
        total += chunk.length;
        if (!Number.isSafeInteger(total) ||
            total > GATE_B_OPERATOR_COORDINATOR_LIMITS.resultFrameBytes) {
          chunk.fill(0);
          return finish(false);
        }
        chunks.push(chunk);
      };
      const onResultEnd = () => {
        if (!accepting || !reviewSent || resultEnded) return finish(false);
        resultEnded = true;
      };
      const onMessage = message => {
        if (!accepting) return;
        let parsed;
        try { parsed = parseGateBOperatorReviewChildIpcMessage(message); } catch {
          finish(false);
          return;
        }
        if (!ready) {
          if (parsed.type !== GATE_B_OPERATOR_REVIEW_CHILD_IPC_TYPES.READY) {
            finish(false);
            return;
          }
          ready = true;
          try {
            reviewSent = true;
            Reflect.apply(snapshot.send, child, [
              createGateBOperatorReviewChildIpcMessage(
                GATE_B_OPERATOR_REVIEW_CHILD_IPC_TYPES.REVIEW,
              ),
              error => { if (accepting && error) finish(false); },
            ]);
          } catch {
            finish(false);
          }
          return;
        }
        if (parsed.type !== GATE_B_OPERATOR_REVIEW_CHILD_IPC_TYPES.REVIEWED || reviewed) {
          finish(false);
          return;
        }
        reviewed = true;
      };
      const onExit = (code, childSignal) => {
        if (!accepting || exitSeen) return finish(false);
        exitSeen = true;
        exitCode = code;
        exitSignal = childSignal;
      };
      const onClose = (code, childSignal) => {
        if (!accepting || !exitSeen || code !== exitCode || childSignal !== exitSignal ||
            code !== 0 || childSignal !== null || !ready || !reviewSent || !reviewed ||
            !resultEnded || total < 5) return finish(false);
        let frame;
        try {
          frame = Buffer.concat(chunks, total);
          const result = parseGateBOperatorReviewResultFrame(frame);
          finish(true, result);
        } catch {
          finish(false);
        } finally {
          try { if (Buffer.isBuffer(frame)) frame.fill(0); } catch {}
        }
      };
      listen(child, snapshot.on, snapshot.removeListener, 'error', failEvent);
      listen(child, snapshot.on, snapshot.removeListener, 'disconnect', onDisconnect);
      listen(child, snapshot.on, snapshot.removeListener, 'message', onMessage);
      listen(child, snapshot.on, snapshot.removeListener, 'exit', onExit);
      listen(child, snapshot.on, snapshot.removeListener, 'close', onClose);
      listen(snapshot.stdout, snapshot.stdoutOn, snapshot.stdoutRemoveListener, 'data', onOutput);
      listen(snapshot.stderr, snapshot.stderrOn, snapshot.stderrRemoveListener, 'data', onOutput);
      listen(snapshot.resultPipe, snapshot.resultOn, snapshot.resultRemoveListener, 'data', onResult);
      listen(snapshot.resultPipe, snapshot.resultOn, snapshot.resultRemoveListener, 'end', onResultEnd);
      listen(snapshot.resultPipe, snapshot.resultOn, snapshot.resultRemoveListener, 'error', failEvent);
      if (signalSnapshot !== undefined) {
        Reflect.apply(signalSnapshot.addEventListener, signalSnapshot.signal, [
          'abort', onAbort, { once: true },
        ]);
        owned.push([
          signalSnapshot.signal,
          signalSnapshot.removeEventListener,
          'abort',
          onAbort,
        ]);
        if (signalSnapshot.getAborted()) {
          finish(false);
          return;
        }
      }
      timer = setTimeout(() => finish(false), timeoutMs);
    } catch {
      finish(false);
    }
  });
}

function captureCliDependencies(options) {
  const supplied = options === undefined ? {} : exactPartialOptions(options, [
    'argv', 'authorizeController', 'channel', 'createFrameReader', 'getControllerStatus',
    'inputStream', 'lifetimeMs', 'prepareController', 'reviewConfiguration',
    'stderr', 'stdout', 'stopController', 'waitControllerClosed',
  ]);
  const output = {
    argv: supplied.argv ?? process.argv.slice(2),
    authorizeController: supplied.authorizeController ??
      authorizeAndPreflightGateBPublicWsInputs,
    channel: supplied.channel ?? process,
    createFrameReader: supplied.createFrameReader ??
      createGateBOperatorCoordinatorFrameReader,
    getControllerStatus: supplied.getControllerStatus ??
      getGateBPublicWsInputsControllerStatus,
    inputStream: supplied.inputStream ?? createReadStream(null, {
      fd: INPUT_FD,
      autoClose: true,
      highWaterMark: 1024,
    }),
    lifetimeMs: supplied.lifetimeMs ?? GATE_B_OPERATOR_COORDINATOR_LIMITS.lifetimeMs,
    prepareController: supplied.prepareController ??
      prepareGateBPublicWsInputsForReviewInInheritedProcessGroup,
    reviewConfiguration: supplied.reviewConfiguration ?? launchGateBOperatorConfigReview,
    stderr: supplied.stderr ?? (async line => {
      process.stderr.write(line);
      return true;
    }),
    stdout: supplied.stdout ?? (async line => {
      process.stdout.write(line);
      return true;
    }),
    stopController: supplied.stopController ?? stopGateBPublicWsInputsController,
    waitControllerClosed: supplied.waitControllerClosed ??
      waitGateBPublicWsInputsControllerClosed,
  };
  if (!ARRAY_IS_ARRAY(output.argv) || IS_PROXY(output.argv) || output.argv.length !== 0 ||
      REFLECT_OWN_KEYS(output.argv).length !== 1) fail();
  exactTimeout(output.lifetimeMs, GATE_B_OPERATOR_COORDINATOR_LIMITS.lifetimeMs);
  for (const key of [
    'authorizeController', 'createFrameReader', 'getControllerStatus', 'prepareController',
    'reviewConfiguration', 'stderr', 'stdout', 'stopController', 'waitControllerClosed',
  ]) if (typeof output[key] !== 'function') fail();
  const channelOn = dataProperty(output.channel, 'on');
  const channelRemoveListener = dataProperty(output.channel, 'removeListener');
  const channelSend = dataProperty(output.channel, 'send');
  if (typeof channelOn !== 'function' || typeof channelRemoveListener !== 'function' ||
      typeof channelSend !== 'function') fail();
  return Object.freeze({
    ...output,
    channelOn,
    channelRemoveListener,
    channelSend,
  });
}

export async function runGateBOperatorCoordinatorCli(options = undefined) {
  let dependencies;
  let reader;
  let readerMethods;
  let capability;
  let controllerStopPromise;
  let controllerWaitPromise;
  let stopping = false;
  let terminal = false;
  let quarantine = false;
  let acceptingControl = true;
  let reviewOpenState = 'LOCKED';
  let resolveReviewOpen;
  const reviewOpened = new Promise(resolve => { resolveReviewOpen = resolve; });
  const reviewAbort = new AbortController();
  let resolveStop;
  const stopRequested = new Promise(resolve => { resolveStop = resolve; });
  const beginControllerStop = () => {
    if (!capability || controllerStopPromise) return;
    try {
      controllerStopPromise = callAsync(dependencies.stopController, undefined, [capability]);
      controllerWaitPromise = callAsync(
        dependencies.waitControllerClosed,
        undefined,
        [capability],
      );
    } catch {
      quarantine = true;
    }
  };
  const requestStop = () => {
    if (stopping || terminal) return;
    stopping = true;
    acceptingControl = false;
    try { reviewAbort.abort(); } catch {}
    beginControllerStop();
    resolveStop(true);
  };
  let onMessage;
  let onDisconnect;
  let onSignal;
  let lifetimeTimer;
  const sendLifecycle = type => new Promise((resolve, reject) => {
    try {
      Reflect.apply(dependencies.channelSend, dependencies.channel, [
        createGateBOperatorCoordinatorIpcMessage(type),
        error => {
          if (error) reject(new GateBOperatorCoordinatorCliError());
          else resolve(true);
        },
      ]);
    } catch {
      reject(new GateBOperatorCoordinatorCliError());
    }
  });
  const sendControl = type => new Promise((resolve, reject) => {
    try {
      Reflect.apply(dependencies.channelSend, dependencies.channel, [
        Object.freeze({ type }),
        error => {
          if (error) reject(new GateBOperatorCoordinatorCliError());
          else resolve(true);
        },
      ]);
    } catch {
      reject(new GateBOperatorCoordinatorCliError());
    }
  });
  const emitLine = (writer, line) => callAsync(writer, undefined, [line]);
  const finalize = async () => {
    requestStop();
    beginControllerStop();
    let closed = capability === undefined && !quarantine;
    if (controllerStopPromise && controllerWaitPromise) {
      try {
        const [stopped, waited] = await Promise.all([
          controllerStopPromise,
          controllerWaitPromise,
        ]);
        closed = stopped === CONTROLLER_CLOSED && waited === CONTROLLER_CLOSED;
        if (stopped === CONTROLLER_QUARANTINED || waited === CONTROLLER_QUARANTINED) {
          quarantine = true;
        }
      } catch {
        quarantine = true;
      }
    } else if (capability !== undefined) {
      quarantine = true;
    }
    const clean = closed && !quarantine;
    try {
      await emitLine(
        clean ? dependencies.stdout : dependencies.stderr,
        clean
          ? GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.CLOSED
          : GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.QUARANTINED,
      );
      await sendLifecycle(clean
        ? GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.STOPPED
        : GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.QUARANTINED);
    } catch {
      return false;
    }
    terminal = true;
    return clean;
  };
  try {
    dependencies = captureCliDependencies(options);
    onMessage = message => {
      if (!acceptingControl || terminal) return;
      if (exactFieldlessControl(message, 'REVIEW_OPEN')) {
        if (reviewOpenState !== 'WAITING' || !reader || !readerMethods) {
          quarantine = true;
          requestStop();
          return;
        }
        try {
          Reflect.apply(readerMethods.openReviewPhase, reader, []);
          reviewOpenState = 'OPEN';
          void sendControl('REVIEW_OPENED').then(
            () => resolveReviewOpen(true),
            () => { quarantine = true; requestStop(); },
          );
        } catch {
          quarantine = true;
          requestStop();
        }
        return;
      }
      let parsed;
      try { parsed = parseGateBOperatorCoordinatorIpcMessage(message); } catch {
        quarantine = true;
        requestStop();
        return;
      }
      if (parsed.type !== GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.STOP) {
        quarantine = true;
      }
      requestStop();
    };
    onSignal = () => { requestStop(); };
    onDisconnect = () => {
      quarantine = true;
      requestStop();
    };
    Reflect.apply(dependencies.channelOn, dependencies.channel, ['message', onMessage]);
    Reflect.apply(dependencies.channelOn, dependencies.channel, ['SIGINT', onSignal]);
    Reflect.apply(dependencies.channelOn, dependencies.channel, ['SIGTERM', onSignal]);
    Reflect.apply(dependencies.channelOn, dependencies.channel, ['disconnect', onDisconnect]);
    lifetimeTimer = setTimeout(requestStop, dependencies.lifetimeMs);
    reader = Reflect.apply(dependencies.createFrameReader, undefined, [
      dependencies.inputStream,
    ]);
    if (!reader || typeof reader !== 'object' || IS_PROXY(reader)) fail();
    readerMethods = Object.freeze({
      close: dataProperty(reader, 'close'),
      openReviewPhase: dataProperty(reader, 'openReviewPhase'),
      readInitial: dataProperty(reader, 'readInitial'),
      readReview: dataProperty(reader, 'readReview'),
    });
    for (const method of Object.values(readerMethods)) {
      if (typeof method !== 'function') fail();
    }
    const initialFrame = await callAsync(readerMethods.readInitial, reader, []);
    let bootstrap;
    try { bootstrap = parseGateBOperatorCoordinatorBootstrapFrame(initialFrame); } finally {
      try { if (Buffer.isBuffer(initialFrame)) initialFrame.fill(0); } catch {}
    }
    if (stopping) return await finalize();
    capability = await callAsync(dependencies.prepareController, undefined, [bootstrap]);
    if (stopping) return await finalize();
    if (Reflect.apply(dependencies.getControllerStatus, undefined, [capability]) !==
        CONTROLLER_REVIEW_REQUIRED) {
      quarantine = true;
      return await finalize();
    }
    await emitLine(
      dependencies.stdout,
      GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.REVIEW_REQUIRED,
    );
    reviewOpenState = 'WAITING';
    await sendLifecycle(GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.REVIEW_REQUIRED);
    await Promise.race([
      reviewOpened,
      stopRequested.then(() => { throw new GateBOperatorCoordinatorCliError(); }),
    ]);
    const reviewFrame = await callAsync(readerMethods.readReview, reader, []);
    let review;
    try { review = parseGateBOperatorCoordinatorReviewFrame(reviewFrame); } finally {
      try { if (Buffer.isBuffer(reviewFrame)) reviewFrame.fill(0); } catch {}
    }
    if (stopping) return await finalize();
    const reviewedCandidate = await callAsync(dependencies.reviewConfiguration, undefined, [
      bootstrap.workspaceRoot,
      { signal: reviewAbort.signal },
    ]);
    let reviewedFrame;
    let reviewed;
    try {
      reviewedFrame = frameGateBOperatorReviewResult(reviewedCandidate);
      reviewed = parseGateBOperatorReviewResultFrame(reviewedFrame);
    } finally {
      if (Buffer.isBuffer(reviewedFrame)) reviewedFrame.fill(0);
    }
    if (stopping) return await finalize();
    const authorization = await callAsync(dependencies.authorizeController, undefined, [
      capability,
      {
        acknowledgements: review.acknowledgements,
        reviewedConfigDigest: reviewed.configDigest,
        schemaVersion: 1,
      },
    ]);
    if (stopping) return await finalize();
    if (authorization !== CONTROLLER_PREFLIGHT_VALID ||
        Reflect.apply(dependencies.getControllerStatus, undefined, [capability]) !==
          CONTROLLER_PREFLIGHT_VALID) {
      quarantine = true;
      return await finalize();
    }
    await emitLine(
      dependencies.stdout,
      GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.PREFLIGHT_VALID,
    );
    await sendLifecycle(GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.PREFLIGHT_VALID);
    await stopRequested;
    return await finalize();
  } catch {
    quarantine = true;
    if (!dependencies) return false;
    return await finalize();
  } finally {
    acceptingControl = false;
    clearTimeout(lifetimeTimer);
    try {
      if (dependencies && onMessage) {
        for (const [event, handler] of [
          ['message', onMessage],
          ['SIGINT', onSignal],
          ['SIGTERM', onSignal],
          ['disconnect', onDisconnect],
        ]) Reflect.apply(
          dependencies.channelRemoveListener,
          dependencies.channel,
          [event, handler],
        );
      }
    } catch {}
    try {
      if (reader && readerMethods) Reflect.apply(readerMethods.close, reader, []);
    } catch {}
  }
}

async function launch() {
  if (typeof process.argv[1] !== 'string' ||
      pathToFileURL(process.argv[1]).href !== import.meta.url ||
      typeof process.send !== 'function') return;
  const clean = await runGateBOperatorCoordinatorCli();
  process.exitCode = clean ? 0 : 1;
  try { process.disconnect(); } catch {}
}

void launch().catch(() => {
  process.exitCode = 1;
});
