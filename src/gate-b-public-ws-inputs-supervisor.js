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
const CHILD_MODULE = fileURLToPath(new URL('./gate-b-public-ws-inputs-child.js', import.meta.url));
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const RELEASED_CHILDREN = new WeakSet();

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
    ? ownDataProperty(stdio, '4')
    : undefined;
  const channel = ownDataProperty(child, 'channel');
  return Object.freeze({
    channel,
    channelClose: dataProperty(channel, 'close'),
    channelUnref: dataProperty(channel, 'unref'),
    child,
    connected: ownDataProperty(child, 'connected'),
    disconnect: dataProperty(child, 'disconnect'),
    on: dataProperty(child, 'on'),
    once: dataProperty(child, 'once'),
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
      typeof snapshot.send !== 'function' || !snapshot.privateFd ||
      typeof snapshot.privateEnd !== 'function' ||
      typeof snapshot.privateOnce !== 'function' ||
      typeof snapshot.privateRemoveListener !== 'function') fail();
  return snapshot;
}

function destroyOwnedHandle(handle, destroy) {
  try {
    if (handle && typeof destroy === 'function') Reflect.apply(destroy, handle, []);
  } catch {}
}

function releaseOwnedChild(snapshot) {
  if (!snapshot || RELEASED_CHILDREN.has(snapshot.child)) return;
  RELEASED_CHILDREN.add(snapshot.child);
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

export async function superviseGateBPublicWsInputs(operation, injected) {
  let child;
  let childSnapshot;
  let frame;
  let detachOwned = () => {};
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
        detached: false,
        env: {},
        execArgv: [],
        shell: false,
        stdio: ['ignore', 'ignore', 'ignore', 'ipc', 'pipe'],
        windowsHide: true,
      },
    ]);
    childSnapshot = snapshotChild(child);
    exactChild(childSnapshot);

    const expectedTerminal = terminalType(operation);
    const terminal = await new Promise((resolveTerminal, rejectTerminal) => {
      let settled = false;
      let closed = false;
      let terminalMessage;
      let readyReceived = false;
      let frameWritten = false;
      let executeSent = false;
      let acceptingProtocol = true;
      let connected = childSnapshot.connected;
      const owned = [];
      const timer = setTimeout(() => finish(false), dependencies.timeoutMs);
      detachOwned = () => {
        for (let index = 0; index < owned.length; index += 1) {
          const [emitter, removeListener, event, handler] = owned[index];
          try { Reflect.apply(removeListener, emitter, [event, handler]); } catch {}
        }
        owned.length = 0;
      };
      const finish = success => {
        if (settled) return;
        settled = true;
        acceptingProtocol = false;
        clearTimeout(timer);
        detachOwned();
        if (success) resolveTerminal(terminalMessage);
        else rejectTerminal(new GateBPublicWsInputsSupervisorError());
      };
      const sendExecute = () => {
        if (!acceptingProtocol || settled || !readyReceived || !frameWritten || executeSent) return;
        executeSent = true;
        try {
          if (!acceptingProtocol) return;
          const accepted = Reflect.apply(childSnapshot.send, child, [{
            ipcVersion: IPC_VERSION,
            requestId: REQUEST_ID,
            type: 'EXECUTE',
          }, error => {
            if (!acceptingProtocol) return;
            if (error) finish(false);
          }]);
          if (accepted === false && connected === false) finish(false);
        } catch {
          finish(false);
        }
      };
      const onError = () => finish(false);
      const onDisconnect = () => {
        connected = false;
        if (!acceptingProtocol) return;
        if (terminalMessage !== expectedTerminal) finish(false);
      };
      const onMessage = message => {
        if (!acceptingProtocol) return;
        try {
          if (!executeSent) {
            exactMessage(message, 'READY');
            if (readyReceived) fail();
            readyReceived = true;
            if (!acceptingProtocol) return;
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
      };
      const onExit = (code, signal) => {
        if (!acceptingProtocol) return;
        if (code !== 0 || signal !== null || terminalMessage !== expectedTerminal ||
            !readyReceived || !frameWritten || !executeSent) finish(false);
      };
      const onClose = (code, signal) => {
        if (!acceptingProtocol) return;
        if (closed) return finish(false);
        closed = true;
        if (terminalMessage !== expectedTerminal || !readyReceived || !frameWritten ||
            !executeSent || code !== 0 || signal !== null) return finish(false);
        finish(true);
      };
      const onPrivateError = () => finish(false);
      for (const [emitter, event, handler] of [
        [child, 'error', onError],
        [child, 'disconnect', onDisconnect],
        [child, 'message', onMessage],
        [child, 'exit', onExit],
        [child, 'close', onClose],
      ]) {
        Reflect.apply(childSnapshot.on, emitter, [event, handler]);
        owned.push([emitter, childSnapshot.removeListener, event, handler]);
      }
      Reflect.apply(childSnapshot.privateOnce, childSnapshot.privateFd, [
        'error',
        onPrivateError,
      ]);
      owned.push([
        childSnapshot.privateFd,
        childSnapshot.privateRemoveListener,
        'error',
        onPrivateError,
      ]);
      Reflect.apply(childSnapshot.privateEnd, childSnapshot.privateFd, [frame, error => {
        if (!acceptingProtocol) return;
        if (frameWritten) return finish(false);
        frameWritten = error === undefined || error === null;
        if (!frameWritten) finish(false);
        else sendExecute();
      }]);
    });
    if (terminal !== expectedTerminal) fail();
    return Object.freeze({ status: successStatus(operation) });
  } catch {
    detachOwned();
    releaseOwnedChild(childSnapshot);
    fail();
  } finally {
    detachOwned();
    releaseOwnedChild(childSnapshot);
    if (Buffer.isBuffer(frame)) frame.fill(0);
  }
}
