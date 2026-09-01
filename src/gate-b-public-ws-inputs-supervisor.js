import { fork } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types as utilTypes } from 'node:util';

import {
  GATE_B_PUBLIC_WS_INPUT_LIMITS,
  GATE_B_PUBLIC_WS_INPUT_OPERATIONS,
  parseGateBPublicWsInputsFrame,
} from './gate-b-public-ws-inputs-schema.js';

const ERROR_CODE = 'gate_b_public_ws_inputs_supervisor_failed';
const IPC_VERSION = 1;
const REQUEST_ID = 1;
const BOOTSTRAP_FD = 3;
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 60_000;
const REAP_FORCE_MS = 250;
const REAP_ABANDON_MS = 1250;
const CHILD_MODULE = fileURLToPath(new URL('./gate-b-public-ws-inputs-child.js', import.meta.url));
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

export class GateBPublicWsInputsSupervisorError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBPublicWsInputsSupervisorError';
    this.code = ERROR_CODE;
    this.stack = `GateBPublicWsInputsSupervisorError: ${ERROR_CODE}`;
  }
}

function fail() {
  throw new GateBPublicWsInputsSupervisorError();
}

function exactOperation(value) {
  if (!Object.values(GATE_B_PUBLIC_WS_INPUT_OPERATIONS).includes(value)) fail();
  return value;
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

function terminalType(operation) {
  if (operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PROVISION_ENDPOINT) {
    return 'ENDPOINT_PROVISIONED';
  }
  if (operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PREPARE) return 'INPUTS_PREPARED';
  if (operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.AUTHORIZE) return 'INPUTS_AUTHORIZED';
  fail();
}

function successStatus(operation) {
  if (operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PROVISION_ENDPOINT) {
    return 'endpoint-provisioned';
  }
  if (operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PREPARE) return 'prepared';
  if (operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.AUTHORIZE) return 'authorized';
  fail();
}

export async function readGateBPublicWsInputsFrameFromFd(fd = BOOTSTRAP_FD) {
  const chunks = [];
  let total = 0;
  try {
    if (!Number.isSafeInteger(fd) || fd < 0) fail();
    const stream = createReadStream(null, {
      fd,
      autoClose: true,
      highWaterMark: 1024,
    });
    for await (const chunk of stream) {
      if (!Buffer.isBuffer(chunk)) fail();
      total += chunk.length;
      if (!Number.isSafeInteger(total) || total > GATE_B_PUBLIC_WS_INPUT_LIMITS.frameBytes) {
        fail();
      }
      chunks.push(chunk);
    }
    if (total < 5) fail();
    return Buffer.concat(chunks, total);
  } catch {
    fail();
  } finally {
    for (let index = 0; index < chunks.length; index += 1) chunks[index].fill(0);
  }
}

function exactInjections(value) {
  const output = {
    forkProcess: fork,
    childModule: CHILD_MODULE,
    readBootstrapFrame: () => readGateBPublicWsInputsFrameFromFd(),
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  if (value === undefined) return output;
  if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
      GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const allowed = ['forkProcess', 'childModule', 'readBootstrapFrame', 'timeoutMs'];
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
  if (typeof output.forkProcess !== 'function' ||
      typeof output.childModule !== 'string' || !isAbsolute(output.childModule) ||
      typeof output.readBootstrapFrame !== 'function' ||
      !Number.isSafeInteger(output.timeoutMs) || output.timeoutMs < 1 ||
      output.timeoutMs > MAX_TIMEOUT_MS) fail();
  return output;
}

async function reap(child, alreadyClosed) {
  if (alreadyClosed || !child || typeof child.once !== 'function') return;
  await new Promise(resolveReap => {
    let finished = false;
    let forceTimer;
    let abandonTimer;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(forceTimer);
      clearTimeout(abandonTimer);
      resolveReap();
    };
    child.once('close', done);
    forceTimer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
    }, REAP_FORCE_MS);
    abandonTimer = setTimeout(done, REAP_ABANDON_MS);
    try { child.kill('SIGTERM'); } catch {}
  });
}

export async function superviseGateBPublicWsInputs(operation, injected) {
  let child;
  let childClosed = false;
  let frame;
  try {
    operation = exactOperation(operation);
    const dependencies = exactInjections(injected);
    frame = await Reflect.apply(dependencies.readBootstrapFrame, undefined, []);
    if (!Buffer.isBuffer(frame)) fail();
    const bootstrap = parseGateBPublicWsInputsFrame(frame, operation);

    child = Reflect.apply(dependencies.forkProcess, undefined, [
      dependencies.childModule,
      [],
      {
        cwd: bootstrap.workspaceRoot,
        env: {},
        execArgv: [],
        shell: false,
        stdio: ['ignore', 'ignore', 'ignore', 'ipc', 'pipe'],
        windowsHide: true,
      },
    ]);
    if (!child || typeof child.on !== 'function' || typeof child.send !== 'function' ||
        typeof child.kill !== 'function' || !ARRAY_IS_ARRAY(child.stdio) ||
        !child.stdio[4] || typeof child.stdio[4].end !== 'function') fail();

    const expectedTerminal = terminalType(operation);
    const terminal = await new Promise((resolveTerminal, rejectTerminal) => {
      let settled = false;
      let closed = false;
      let terminalMessage;
      let readyReceived = false;
      let frameWritten = false;
      let executeSent = false;
      const timer = setTimeout(() => finish(false), dependencies.timeoutMs);
      const finish = success => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (success) resolveTerminal(terminalMessage);
        else rejectTerminal(new GateBPublicWsInputsSupervisorError());
      };
      const sendExecute = () => {
        if (settled || !readyReceived || !frameWritten || executeSent) return;
        executeSent = true;
        try {
          const accepted = child.send({
            ipcVersion: IPC_VERSION,
            requestId: REQUEST_ID,
            type: 'EXECUTE',
          }, error => {
            if (error) finish(false);
          });
          if (accepted === false && child.connected === false) finish(false);
        } catch {
          finish(false);
        }
      };
      child.on('error', () => finish(false));
      child.on('disconnect', () => {
        if (terminalMessage !== expectedTerminal) finish(false);
      });
      child.on('message', message => {
        try {
          if (!executeSent) {
            exactMessage(message, 'READY');
            if (readyReceived) fail();
            readyReceived = true;
            sendExecute();
            return;
          }
          if (terminalMessage === undefined) {
            exactMessage(message, expectedTerminal);
            terminalMessage = message.type;
            return;
          }
          finish(false);
        } catch {
          finish(false);
        }
      });
      child.on('exit', (code, signal) => {
        if (code !== 0 || signal !== null || terminalMessage !== expectedTerminal ||
            !readyReceived || !frameWritten || !executeSent) finish(false);
      });
      child.on('close', (code, signal) => {
        childClosed = true;
        if (closed) return finish(false);
        closed = true;
        if (terminalMessage !== expectedTerminal || !readyReceived || !frameWritten ||
            !executeSent || code !== 0 || signal !== null) return finish(false);
        finish(true);
      });
      child.stdio[4].once('error', () => finish(false));
      child.stdio[4].end(frame, error => {
        if (frameWritten) return finish(false);
        frameWritten = error === undefined || error === null;
        if (!frameWritten) finish(false);
        else sendExecute();
      });
    });
    if (terminal !== expectedTerminal) fail();
    return Object.freeze({ status: successStatus(operation) });
  } catch {
    await reap(child, childClosed);
    fail();
  } finally {
    if (Buffer.isBuffer(frame)) frame.fill(0);
  }
}
