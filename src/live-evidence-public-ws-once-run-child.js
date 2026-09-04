import { createReadStream } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { types as utilTypes } from 'node:util';

import {
  CURRENT_TESTNET_WSS_ONCE_POLICY,
  executeCurrentTestnetWssOnceRun,
  executePublicWsOnceRun,
  finalizeIndependentPublicWsOnce,
  parseIndependentPublicWsOnceSupervisorBootstrap,
  parseCurrentTestnetWssOnceSupervisorBootstrap,
  parsePublicWsOnceSupervisorBootstrap,
  preflightCurrentTestnetWssOnceRun,
  preflightPublicWsOnceRun,
} from './live-evidence-runner.js';

const IPC_VERSION = 1;
const REQUEST_ID = 1;
const FINALIZER_IPC_VERSION = 2;
const FINALIZER_REQUEST_ID = 81;
const FINALIZER_COMMAND = 'finalize-independent-public-ws-once';
const BOOTSTRAP_FD = 4;
const BOOTSTRAP_MAX_BYTES = 64 * 1024;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

function fail() {
  throw new Error('live_evidence_public_ws_once_child_failed');
}

function exactControlMessage(message, independentFinalizer) {
  if (!message || typeof message !== 'object' || IS_PROXY(message) ||
      ARRAY_IS_ARRAY(message) || GET_PROTOTYPE_OF(message) !== OBJECT_PROTOTYPE) fail();
  const fields = ['ipcVersion', 'requestId', 'type'];
  const keys = REFLECT_OWN_KEYS(message);
  if (keys.length !== fields.length) fail();
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(message, fields[index]);
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
  }
  if (independentFinalizer) {
    if (message.ipcVersion !== FINALIZER_IPC_VERSION ||
        message.requestId !== FINALIZER_REQUEST_ID || message.type !== 'FINALIZE') fail();
  } else if (message.ipcVersion !== IPC_VERSION || message.requestId !== REQUEST_ID ||
      (message.type !== 'PREFLIGHT' && message.type !== 'RUN')) fail();
  return message.type;
}

function exactOriginReleaseMessage(message) {
  if (!message || typeof message !== 'object' || IS_PROXY(message) ||
      ARRAY_IS_ARRAY(message) || GET_PROTOTYPE_OF(message) !== OBJECT_PROTOTYPE) fail();
  const fields = ['ipcVersion', 'requestId', 'type'];
  const keys = REFLECT_OWN_KEYS(message);
  if (keys.length !== fields.length) fail();
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(message, fields[index]);
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
  }
  if (message.ipcVersion !== IPC_VERSION || message.requestId !== 2 ||
      message.type !== 'ORIGIN_RELEASED') fail();
  return true;
}

function send(channel, type, requestId = REQUEST_ID, ipcVersion = IPC_VERSION) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      if (error) reject(new Error('live_evidence_public_ws_once_child_failed'));
      else resolve();
    };
    try {
      const accepted = channel.send({
        ipcVersion,
        requestId,
        type,
      }, finish);
      if (accepted === false && channel.connected === false) finish(new Error());
    } catch {
      finish(new Error());
    }
  });
}

async function readBootstrapFd() {
  const chunks = [];
  let total = 0;
  try {
    const stream = createReadStream(null, {
      fd: BOOTSTRAP_FD,
      autoClose: true,
      highWaterMark: 4096,
    });
    for await (const chunk of stream) {
      if (!Buffer.isBuffer(chunk)) fail();
      total += chunk.length;
      if (total < 1 || total > BOOTSTRAP_MAX_BYTES) fail();
      chunks.push(chunk);
    }
    if (total < 1) fail();
    const bytes = Buffer.concat(chunks, total);
    try {
      const text = bytes.toString('utf8');
      if (text.includes(`"command":"${FINALIZER_COMMAND}"`)) {
        return parseIndependentPublicWsOnceSupervisorBootstrap(text);
      }
      try {
        return parsePublicWsOnceSupervisorBootstrap(text);
      } catch {
        return parseCurrentTestnetWssOnceSupervisorBootstrap(text);
      }
    } finally {
      bytes.fill(0);
    }
  } catch {
    fail();
  } finally {
    for (let index = 0; index < chunks.length; index += 1) chunks[index].fill(0);
  }
}

function captureOptions(options) {
  if (!options || typeof options !== 'object' || IS_PROXY(options) ||
      ARRAY_IS_ARRAY(options) || GET_PROTOTYPE_OF(options) !== OBJECT_PROTOTYPE) fail();
  const allowed = [
    'channel', 'readBootstrap', 'preflight', 'execute', 'forceExit',
  ];
  const defaults = {
    channel: process,
    readBootstrap: readBootstrapFd,
    preflight: undefined,
    execute: undefined,
    forceExit: code => process.exit(code),
  };
  const keys = REFLECT_OWN_KEYS(options);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = typeof key === 'string'
      ? GET_OWN_PROPERTY_DESCRIPTOR(options, key)
      : undefined;
    if (!allowed.includes(key) || !descriptor || !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true) fail();
    defaults[key] = descriptor.value;
  }
  if (!defaults.channel || typeof defaults.channel.on !== 'function' ||
      typeof defaults.channel.send !== 'function' ||
      typeof defaults.readBootstrap !== 'function' ||
      (defaults.preflight !== undefined && typeof defaults.preflight !== 'function') ||
      (defaults.execute !== undefined && typeof defaults.execute !== 'function') ||
      typeof defaults.forceExit !== 'function') fail();
  return defaults;
}

export async function runPublicWsOnceExecutionChild(options = {}) {
  const dependencies = captureOptions(options);
  let handling = false;
  let finished = false;
  let originReleaseRequested = false;
  let originReleasePending;
  const terminate = code => {
    if (finished) return;
    finished = true;
    if (originReleasePending) {
      originReleasePending.reject(new Error('live_evidence_public_ws_once_child_failed'));
      originReleasePending = undefined;
    }
    try { Reflect.apply(dependencies.forceExit, undefined, [code]); } catch {}
  };
  try {
    const bootstrap = await Reflect.apply(dependencies.readBootstrap, undefined, []);
    const independentFinalizer = bootstrap.command === FINALIZER_COMMAND;
    const currentTestnetWss = !independentFinalizer && bootstrap.executionMode ===
      CURRENT_TESTNET_WSS_ONCE_POLICY.executionMode;
    const preflight = dependencies.preflight ?? (currentTestnetWss
      ? preflightCurrentTestnetWssOnceRun
      : preflightPublicWsOnceRun);
    const execute = dependencies.execute ?? (currentTestnetWss
      ? executeCurrentTestnetWssOnceRun
      : executePublicWsOnceRun);
    dependencies.channel.once('disconnect', () => terminate(1));
    dependencies.channel.on('message', async message => {
      if (finished) return;
      if (handling) {
        if (!originReleasePending) return terminate(1);
        try {
          exactOriginReleaseMessage(message);
          const pending = originReleasePending;
          originReleasePending = undefined;
          pending.resolve(true);
        } catch { terminate(1); }
        return;
      }
      handling = true;
      try {
        const type = exactControlMessage(message, independentFinalizer);
        if (type === 'PREFLIGHT') {
          const result = await Reflect.apply(preflight, undefined, [bootstrap]);
          if (finished) return;
          if (!result || result.valid !== true || REFLECT_OWN_KEYS(result).length !== 1) fail();
          await send(dependencies.channel, 'PREFLIGHT_VALID');
        } else if (type === 'RUN') {
          const beforeOriginBind = () => {
            if (originReleaseRequested || originReleasePending || finished) fail();
            originReleaseRequested = true;
            const acknowledgement = new Promise((resolve, reject) => {
              originReleasePending = { reject, resolve };
            });
            const requestSent = send(dependencies.channel, 'ORIGIN_RELEASE', 2);
            void requestSent.catch(() => terminate(1));
            return Promise.all([requestSent, acknowledgement]).then(() => true);
          };
          const result = await Reflect.apply(execute, undefined, [
            bootstrap,
            Object.freeze({ beforeOriginBind }),
          ]);
          if (finished) return;
          if (!originReleaseRequested || originReleasePending) fail();
          if (!result || result.status !== 'pending-independent-verification' ||
              result.evidenceEligible !== false || REFLECT_OWN_KEYS(result).length !== 2) fail();
          await send(dependencies.channel, 'PENDING');
        } else {
          const finalizerOptions = {
            endpointConfigPath: bootstrap.endpointConfigPath,
            operatorReviewPath: bootstrap.operatorReviewPath,
            workspaceRoot: bootstrap.workspaceRoot,
            runName: bootstrap.runName,
            attemptId: bootstrap.attemptId,
          };
          const result = await finalizeIndependentPublicWsOnce(finalizerOptions);
          if (finished) return;
          if (!result || result.status !== 'independent-verification-complete' ||
              REFLECT_OWN_KEYS(result).length !== 1) fail();
          await send(
            dependencies.channel,
            'FINALIZED',
            FINALIZER_REQUEST_ID,
            FINALIZER_IPC_VERSION,
          );
        }
        if (finished) return;
        terminate(0);
      } catch {
        terminate(1);
      }
    });
    await send(
      dependencies.channel,
      independentFinalizer ? 'FINALIZER_READY' : 'READY',
      independentFinalizer ? FINALIZER_REQUEST_ID : REQUEST_ID,
      independentFinalizer ? FINALIZER_IPC_VERSION : IPC_VERSION,
    );
  } catch {
    terminate(1);
  }
}

async function launch() {
  if (typeof process.argv[1] !== 'string' ||
      pathToFileURL(process.argv[1]).href !== import.meta.url) return;
  await runPublicWsOnceExecutionChild();
}

void launch().catch(() => {
  try { process.exit(1); } catch {}
});
