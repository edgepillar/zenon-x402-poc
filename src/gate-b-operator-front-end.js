import { types as utilTypes } from 'node:util';
import { pathToFileURL } from 'node:url';

import {
  GATE_B_OPERATOR_COORDINATOR_LIMITS,
  GATE_B_OPERATOR_COORDINATOR_STATUS_LINES,
  frameGateBOperatorCoordinatorBootstrap,
  frameGateBOperatorCoordinatorReview,
  parseGateBOperatorCoordinatorBootstrapFrame,
  parseGateBOperatorCoordinatorReviewFrame,
} from './gate-b-operator-coordinator-schema.js';
import {
  launchGateBOperatorWatchdogSetup,
  stopGateBOperatorCoordinator,
  submitGateBOperatorBootstrap,
  submitGateBOperatorCoordinatorReview,
  waitGateBOperatorCoordinatorClosed,
} from './gate-b-operator-coordinator-launcher.js';

const ERROR_CODE = 'gate_b_operator_front_end_failed';
const PHASE_1_REQUIRED = 'GATE_B_OPERATOR_PHASE_1_INPUT_REQUIRED\n';
const OUTPUT_TIMEOUT_MS = 1_000;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROMISE = utilTypes.isPromise;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

export class GateBOperatorFrontEndError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBOperatorFrontEndError';
    this.code = ERROR_CODE;
    this.stack = `GateBOperatorFrontEndError: ${ERROR_CODE}`;
  }
}

function fail() { throw new GateBOperatorFrontEndError(); }

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

function exactPartialOptions(value, allowed) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
      GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const output = {};
  for (const key of REFLECT_OWN_KEYS(value)) {
    const descriptor = typeof key === 'string'
      ? GET_OWN_PROPERTY_DESCRIPTOR(value, key)
      : undefined;
    if (!allowed.includes(key) || !descriptor || !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true) fail();
    output[key] = descriptor.value;
  }
  return output;
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

function captureDependencies(options) {
  const supplied = options === undefined ? {} : exactPartialOptions(options, [
    'argv', 'channel', 'errorOutput', 'input', 'launchSetup', 'output', 'outputTimeoutMs',
    'phase1TimeoutMs', 'phase2TimeoutMs', 'stopCoordinator', 'submitBootstrap',
    'submitReview', 'waitClosed',
  ]);
  const channel = supplied.channel ?? process;
  const input = supplied.input ?? process.stdin;
  const output = supplied.output ?? process.stdout;
  const errorOutput = supplied.errorOutput ?? process.stderr;
  const argv = supplied.argv ?? process.argv.slice(2);
  if (!ARRAY_IS_ARRAY(argv) || IS_PROXY(argv) || argv.length !== 0 ||
      REFLECT_OWN_KEYS(argv).length !== 1 || !input || IS_PROXY(input)) fail();
  const dependencies = {
    argv,
    channel,
    errorOutput,
    input,
    launchSetup: supplied.launchSetup ?? launchGateBOperatorWatchdogSetup,
    output,
    outputTimeoutMs: supplied.outputTimeoutMs ?? OUTPUT_TIMEOUT_MS,
    phase1TimeoutMs: supplied.phase1TimeoutMs ??
      GATE_B_OPERATOR_COORDINATOR_LIMITS.initialFrameTimeoutMs,
    phase2TimeoutMs: supplied.phase2TimeoutMs ??
      GATE_B_OPERATOR_COORDINATOR_LIMITS.reviewFrameTimeoutMs,
    stopCoordinator: supplied.stopCoordinator ?? stopGateBOperatorCoordinator,
    submitBootstrap: supplied.submitBootstrap ?? submitGateBOperatorBootstrap,
    submitReview: supplied.submitReview ?? submitGateBOperatorCoordinatorReview,
    waitClosed: supplied.waitClosed ?? waitGateBOperatorCoordinatorClosed,
    inputOn: dataProperty(input, 'on'),
    inputRemoveListener: dataProperty(input, 'removeListener'),
    inputResume: dataProperty(input, 'resume'),
    inputPause: dataProperty(input, 'pause'),
    inputSetRawMode: dataProperty(input, 'setRawMode'),
    channelOn: dataProperty(channel, 'on'),
    channelRemoveListener: dataProperty(channel, 'removeListener'),
    outputWrite: dataProperty(output, 'write'),
    errorOutputWrite: dataProperty(errorOutput, 'write'),
  };
  for (const key of [
    'launchSetup', 'stopCoordinator', 'submitBootstrap', 'submitReview', 'waitClosed', 'inputOn',
    'inputRemoveListener', 'inputResume', 'inputPause', 'inputSetRawMode', 'channelOn',
    'channelRemoveListener', 'outputWrite', 'errorOutputWrite',
  ]) if (typeof dependencies[key] !== 'function') fail();
  for (const value of [dependencies.outputTimeoutMs, dependencies.phase1TimeoutMs,
    dependencies.phase2TimeoutMs]) {
    if (!Number.isSafeInteger(value) || value < 1) fail();
  }
  const raw = dataProperty(input, 'isRaw');
  if (typeof raw !== 'boolean' || dataProperty(input, 'isTTY') !== true) fail();
  return Object.freeze({ ...dependencies, originalRaw: raw });
}

function canonicalInput(bytes, frameValue, parseFrame, maximum) {
  let frame;
  let text;
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length < 2 || bytes.length > maximum ||
        bytes.includes(0x00)) fail();
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const parsed = JSON.parse(text);
    frame = frameValue(parsed);
    const length = frame.readUInt32BE(0);
    if (length !== bytes.length || !frame.subarray(4).equals(bytes)) fail();
    return parseFrame(frame);
  } catch {
    fail();
  } finally {
    if (Buffer.isBuffer(frame)) frame.fill(0);
    text = undefined;
  }
}

function writeFixed(dependencies, line, error = false) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let callbackSeen = false;
    const finish = success => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (success) resolve(true);
      else reject(new GateBOperatorFrontEndError());
    };
    const timer = setTimeout(() => finish(false), dependencies.outputTimeoutMs);
    try {
      const target = error ? dependencies.errorOutput : dependencies.output;
      const writer = error ? dependencies.errorOutputWrite : dependencies.outputWrite;
      Reflect.apply(writer, target, [line, callbackError => {
        if (callbackSeen) return finish(false);
        callbackSeen = true;
        finish(callbackError === undefined || callbackError === null);
      }]);
    } catch { finish(false); }
  });
}

function createTtyInput(dependencies, onCancel) {
  let phase = 'LOCKED';
  let maximum = 0;
  let chunks = [];
  let total = 0;
  let resolveLine;
  let rejectLine;
  let timer;
  let terminal = false;
  let restorationFailed = false;
  const clear = () => {
    clearTimeout(timer);
    for (const chunk of chunks) { try { chunk.fill(0); } catch {} }
    chunks = [];
    total = 0;
  };
  const restore = () => {
    try {
      Reflect.apply(dependencies.inputSetRawMode, dependencies.input,
        [dependencies.originalRaw]);
      if (dataProperty(dependencies.input, 'isRaw') !== dependencies.originalRaw) fail();
      return true;
    } catch {
      restorationFailed = true;
      onCancel();
      return false;
    }
  };
  const reject = () => {
    if (terminal) return;
    phase = 'FAILED';
    clear();
    restore();
    rejectLine?.(new GateBOperatorFrontEndError());
    onCancel();
  };
  const onData = chunk => {
    if (!Buffer.isBuffer(chunk) || terminal || phase !== 'READING') {
      try { if (Buffer.isBuffer(chunk)) chunk.fill(0); } catch {}
      reject();
      return;
    }
    if (chunk.includes(0x03)) {
      chunk.fill(0);
      reject();
      return;
    }
    let terminator = -1;
    for (let index = 0; index < chunk.length; index += 1) {
      const byte = chunk[index];
      if (byte === 0x0a || byte === 0x0d) { terminator = index; break; }
      if (byte < 0x20 || byte === 0x7f) {
        chunk.fill(0);
        reject();
        return;
      }
    }
    if (terminator >= 0 && terminator !== chunk.length - 1) {
      chunk.fill(0);
      reject();
      return;
    }
    const body = terminator >= 0 ? chunk.subarray(0, terminator) : chunk;
    total += body.length;
    if (!Number.isSafeInteger(total) || total > maximum) {
      chunk.fill(0);
      reject();
      return;
    }
    if (body.length > 0) chunks.push(Buffer.from(body));
    chunk.fill(0);
    if (terminator < 0) return;
    phase = 'LOCKED';
    clearTimeout(timer);
    const output = Buffer.concat(chunks, total);
    if (!restore()) {
      output.fill(0);
      reject();
      return;
    }
    for (const owned of chunks) owned.fill(0);
    chunks = [];
    total = 0;
    resolveLine(output);
  };
  const onEnd = reject;
  const onError = reject;
  Reflect.apply(dependencies.inputOn, dependencies.input, ['data', onData]);
  Reflect.apply(dependencies.inputOn, dependencies.input, ['end', onEnd]);
  Reflect.apply(dependencies.inputOn, dependencies.input, ['error', onError]);
  Reflect.apply(dependencies.inputOn, dependencies.input, ['close', onEnd]);
  return Object.freeze({
    cancel() { reject(); },
    close() {
      if (terminal) return !restorationFailed;
      terminal = true;
      clear();
      const restored = restore();
      try { Reflect.apply(dependencies.inputPause, dependencies.input, []); } catch {}
      for (const [event, handler] of [
        ['data', onData], ['end', onEnd], ['error', onError], ['close', onEnd],
      ]) {
        try { Reflect.apply(dependencies.inputRemoveListener, dependencies.input,
          [event, handler]); } catch {}
      }
      return restored && !restorationFailed;
    },
    read(limit, timeoutMs) {
      if (terminal || phase !== 'LOCKED') fail();
      maximum = limit;
      phase = 'READING';
      const promise = new Promise((resolve, rejectPromise) => {
        resolveLine = resolve;
        rejectLine = rejectPromise;
      });
      timer = setTimeout(reject, timeoutMs);
      Reflect.apply(dependencies.inputSetRawMode, dependencies.input, [true]);
      Reflect.apply(dependencies.inputResume, dependencies.input, []);
      return promise;
    },
  });
}

export async function runGateBOperatorFrontEnd(options = undefined) {
  let dependencies;
  let tty;
  let capability;
  let launchWork;
  let stopWork;
  let stopping = false;
  let cancelled = false;
  let terminalLineWritten = false;
  const requestStop = () => { stopping = true; };
  const requestCancel = () => { cancelled = true; stopping = true; };
  const cleanup = async () => {
    requestStop();
    tty?.close();
    if (!capability && launchWork) {
      try { capability = await launchWork; } catch {}
    }
    if (capability && !stopWork) {
      stopWork = (async () => {
        let stopped;
        let closed;
        try { stopped = await callAsync(
          dependencies.stopCoordinator,
          undefined,
          [capability],
        ); } catch {}
        try { closed = await callAsync(
          dependencies.waitClosed,
          undefined,
          [capability],
        ); } catch {}
        return stopped === 'CLOSED' && closed === 'CLOSED';
      })();
    }
    return stopWork ? await stopWork : capability === undefined;
  };
  let onControl;
  try {
    dependencies = captureDependencies(options);
    onControl = () => { requestCancel(); tty?.cancel(); void cleanup(); };
    for (const event of ['SIGINT', 'SIGTERM', 'disconnect']) {
      Reflect.apply(dependencies.channelOn, dependencies.channel, [event, onControl]);
    }
    launchWork = callAsync(dependencies.launchSetup, undefined, []);
    capability = await launchWork;
    if (cancelled) fail();
    tty = createTtyInput(dependencies, requestCancel);
    await writeFixed(dependencies, PHASE_1_REQUIRED);
    if (cancelled) fail();
    const phase1 = await tty.read(
      GATE_B_OPERATOR_COORDINATOR_LIMITS.bootstrapBytes,
      dependencies.phase1TimeoutMs,
    );
    let bootstrap;
    try {
      bootstrap = canonicalInput(
        phase1,
        frameGateBOperatorCoordinatorBootstrap,
        parseGateBOperatorCoordinatorBootstrapFrame,
        GATE_B_OPERATOR_COORDINATOR_LIMITS.bootstrapBytes,
      );
    } finally { phase1.fill(0); }
    if (cancelled) fail();
    const submittedCapability = await callAsync(
      dependencies.submitBootstrap,
      undefined,
      [capability, bootstrap],
    );
    bootstrap = undefined;
    if (submittedCapability !== capability) fail();
    if (cancelled) fail();
    await writeFixed(dependencies, GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.REVIEW_REQUIRED);
    if (cancelled) fail();
    const phase2 = await tty.read(
      GATE_B_OPERATOR_COORDINATOR_LIMITS.reviewBytes,
      dependencies.phase2TimeoutMs,
    );
    let review;
    try {
      review = canonicalInput(
        phase2,
        frameGateBOperatorCoordinatorReview,
        parseGateBOperatorCoordinatorReviewFrame,
        GATE_B_OPERATOR_COORDINATOR_LIMITS.reviewBytes,
      );
    } finally { phase2.fill(0); }
    if (cancelled) fail();
    const preflight = await callAsync(
      dependencies.submitReview,
      undefined,
      [capability, review],
    );
    review = undefined;
    if (preflight !== 'PREFLIGHT_VALID') fail();
    if (cancelled) fail();
    await writeFixed(dependencies, GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.PREFLIGHT_VALID);
    if (cancelled) fail();
    if (await cleanup() !== true || tty.close() !== true || cancelled) fail();
    await writeFixed(dependencies, GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.CLOSED);
    if (cancelled) fail();
    terminalLineWritten = true;
    return true;
  } catch {
    if (dependencies) await cleanup();
    if (dependencies && !terminalLineWritten) {
      try {
        await writeFixed(
          dependencies,
          GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.QUARANTINED,
          true,
        );
        terminalLineWritten = true;
      } catch {}
    }
    return false;
  } finally {
    tty?.close();
    if (dependencies && onControl) {
      for (const event of ['SIGINT', 'SIGTERM', 'disconnect']) {
        try { Reflect.apply(dependencies.channelRemoveListener, dependencies.channel,
          [event, onControl]); } catch {}
      }
    }
  }
}

async function launchDirect() {
  if (typeof process.argv[1] !== 'string' ||
      pathToFileURL(process.argv[1]).href !== import.meta.url) return;
  process.exitCode = await runGateBOperatorFrontEnd() ? 0 : 1;
}

void launchDirect().catch(() => { process.exitCode = 1; });

export const GATE_B_OPERATOR_FRONT_END_PHASE_1_REQUIRED = PHASE_1_REQUIRED;
