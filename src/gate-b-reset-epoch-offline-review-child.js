import { createWriteStream } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { types as utilTypes } from 'node:util';

import { canonicalJson } from './canonical.js';
import {
  GATE_B_OPERATOR_REVIEW_CHILD_IPC_TYPES,
  createGateBOperatorReviewChildIpcMessage,
  frameGateBOperatorReviewResult,
  parseGateBOperatorReviewChildIpcMessage,
} from './gate-b-operator-coordinator-schema.js';
import {
  GATE_B_PUBLIC_WS_INPUT_LEAVES,
  parseGateBQuickTunnelHostnameSource,
} from './gate-b-public-ws-inputs-schema.js';
import { openGateBPublicWsPrivateWorkspace } from './gate-b-public-ws-private-workspace.js';
import {
  GATE_B_RESET_EPOCH_OFFLINE_PREFLIGHT,
  gateBResetEpochOfflineConfigDigest,
  gateBResetEpochOfflinePaymentIntentDigest,
  parseGateBResetEpochOfflineRunConfig,
} from './gate-b-reset-epoch-offline-preflight.js';
import { attestPublicWsOnceSourceTree } from './public-ws-source-attestation.js';

const ERROR_CODE = 'gate_b_reset_epoch_offline_cross_check_failed';
const REVIEW_RESULT_FD = 4;
const ARRAY_IS_ARRAY = Array.isArray;
const DEFINE_PROPERTY = Object.defineProperty;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROMISE = utilTypes.isPromise;
const IS_PROXY = utilTypes.isProxy;
const NATIVE_PROMISE = Promise;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const NATIVE_PROMISE_CONSTRUCTOR_DESCRIPTOR = Object.freeze({
  configurable: false,
  enumerable: false,
  value: NATIVE_PROMISE,
  writable: false,
});

export class GateBResetEpochOfflineCrossCheckError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBResetEpochOfflineCrossCheckError';
    this.code = ERROR_CODE;
    this.stack = `GateBResetEpochOfflineCrossCheckError: ${ERROR_CODE}`;
  }
}

function fail() {
  throw new GateBResetEpochOfflineCrossCheckError();
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

function exactPlainObject(value, fields) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
      GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const keys = REFLECT_OWN_KEYS(value);
  if (keys.length !== fields.length) fail();
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, fields[index]);
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== 'string' || !fields.includes(keys[index])) fail();
  }
  return value;
}

function exactArray(value, length) {
  if (!ARRAY_IS_ARRAY(value) || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== Array.prototype || value.length !== length ||
      REFLECT_OWN_KEYS(value).length !== length + 1) fail();
  for (let index = 0; index < length; index += 1) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, String(index));
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
  }
  return value;
}

function pinNativePromiseConstructor(promise) {
  REFLECT_APPLY(DEFINE_PROPERTY, Object, [
    promise,
    'constructor',
    NATIVE_PROMISE_CONSTRUCTOR_DESCRIPTOR,
  ]);
  return promise;
}

function exactNativePromise(value) {
  if (!IS_PROMISE(value) || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== NATIVE_PROMISE.prototype ||
      GET_OWN_PROPERTY_DESCRIPTOR(value, 'then') !== undefined) fail();
  return pinNativePromiseConstructor(value);
}

function callAsync(fn, receiver, args) {
  if (typeof fn !== 'function') fail();
  return exactNativePromise(REFLECT_APPLY(fn, receiver, args));
}

function captureDependencies(injected) {
  const output = {
    attestSourceTree: attestPublicWsOnceSourceTree,
    beforeFinalVerification: async () => {},
    cwd: () => process.cwd(),
    openWorkspace: openGateBPublicWsPrivateWorkspace,
    workspaceInjections: undefined,
  };
  if (injected !== undefined) {
    const supplied = exactPlainObject(injected, Object.keys(output));
    for (const key of Object.keys(output)) output[key] = supplied[key];
  }
  for (const key of [
    'attestSourceTree', 'beforeFinalVerification', 'cwd', 'openWorkspace',
  ]) if (typeof output[key] !== 'function') fail();
  return Object.freeze(output);
}

function snapshotWorkspace(workspace) {
  if (!workspace || typeof workspace !== 'object' || IS_PROXY(workspace)) fail();
  const snapshot = Object.freeze({
    assertAbsent: dataProperty(workspace, 'assertAbsent'),
    assertDistinct: dataProperty(workspace, 'assertDistinct'),
    close: dataProperty(workspace, 'close'),
    openInputs: dataProperty(workspace, 'openInputs'),
    read: dataProperty(workspace, 'read'),
    verify: dataProperty(workspace, 'verify'),
  });
  for (const key of Object.keys(snapshot)) {
    if (typeof snapshot[key] !== 'function') fail();
  }
  return snapshot;
}

export async function crossCheckGateBResetEpochOfflineConfiguration(injected) {
  const dependencies = captureDependencies(injected);
  const buffers = [];
  let workspace;
  let snapshot;
  let result;
  let invalid = false;
  try {
    const root = REFLECT_APPLY(dependencies.cwd, undefined, []);
    if (typeof root !== 'string' || root.length < 1) fail();
    workspace = await callAsync(dependencies.openWorkspace, undefined, [
      root,
      dependencies.workspaceInjections,
    ]);
    snapshot = snapshotWorkspace(workspace);
    await callAsync(snapshot.assertAbsent, workspace, [[
      GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.resetEpochOfflinePreflightReceipt,
    ]]);
    const names = [
      GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig,
    ];
    const records = await callAsync(snapshot.openInputs, workspace, [names]);
    exactArray(records, names.length);
    if (REFLECT_APPLY(snapshot.assertDistinct, workspace, [records]) !== true) fail();
    const hostnameBytes = await callAsync(snapshot.read, workspace, [records[0]]);
    const configBytes = await callAsync(snapshot.read, workspace, [records[1]]);
    if (!Buffer.isBuffer(hostnameBytes) || !Buffer.isBuffer(configBytes)) fail();
    buffers.push(hostnameBytes, configBytes);
    const hostnameSource = parseGateBQuickTunnelHostnameSource(hostnameBytes);
    const config = parseGateBResetEpochOfflineRunConfig(configBytes.toString('utf8'));
    if (config.expectedPaymentRequired.resource.url !==
          `https://${hostnameSource.hostname}/paid` ||
        canonicalJson(config.quickTunnel) !== canonicalJson(hostnameSource.quickTunnel)) fail();
    const configDigest = gateBResetEpochOfflineConfigDigest(config);
    const intentDigest = gateBResetEpochOfflinePaymentIntentDigest(config);
    if (await callAsync(dependencies.attestSourceTree, undefined,
      [config.sourceRevision]) !== true) fail();
    await callAsync(dependencies.beforeFinalVerification, undefined, []);
    for (let index = 0; index < records.length; index += 1) {
      if (await callAsync(snapshot.verify, workspace, [records[index]]) !== true) fail();
    }
    await callAsync(snapshot.assertAbsent, workspace, [[
      GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.resetEpochOfflinePreflightReceipt,
    ]]);
    if (await callAsync(dependencies.attestSourceTree, undefined,
      [config.sourceRevision]) !== true) fail();
    result = Object.freeze({
      configDigest,
      hostname: hostnameSource.hostname,
      independentReview: GATE_B_RESET_EPOCH_OFFLINE_PREFLIGHT.independentReview,
      payee: config.expectedPaymentRequired.accepts[0].payTo,
      payer: config.payer,
      paymentIntentDigest: intentDigest,
      resultVersion: 5,
      sourceRevision: config.sourceRevision,
      type: GATE_B_RESET_EPOCH_OFFLINE_PREFLIGHT.crossCheckClassification,
    });
  } catch {
    invalid = true;
  } finally {
    for (let index = 0; index < buffers.length; index += 1) {
      try { buffers[index].fill(0); } catch {}
    }
    if (workspace && snapshot) {
      try {
        if (await callAsync(snapshot.close, workspace, []) !== true) invalid = true;
      } catch {
        invalid = true;
      }
    }
  }
  if (invalid || !result) fail();
  return result;
}

function writeResultFrame(frame, fd = REVIEW_RESULT_FD) {
  return pinNativePromiseConstructor(new NATIVE_PROMISE((resolve, reject) => {
    let settled = false;
    const stream = createWriteStream(null, { fd, autoClose: true });
    const finish = success => {
      if (settled) return;
      settled = true;
      if (success) resolve(true);
      else reject(new GateBResetEpochOfflineCrossCheckError());
    };
    stream.once('error', () => finish(false));
    stream.end(frame, error => finish(error === undefined || error === null));
  }));
}

export async function runGateBResetEpochOfflineCrossCheckChild(options = undefined) {
  const supplied = options === undefined ? {} : exactPlainObject(options, [
    'channel', 'crossCheck', 'writeResult',
  ]);
  const channel = supplied.channel ?? process;
  const crossCheck = supplied.crossCheck ??
    crossCheckGateBResetEpochOfflineConfiguration;
  const writeResult = supplied.writeResult ?? writeResultFrame;
  const on = dataProperty(channel, 'on');
  const removeListener = dataProperty(channel, 'removeListener');
  const send = dataProperty(channel, 'send');
  if (typeof on !== 'function' || typeof removeListener !== 'function' ||
      typeof send !== 'function' || typeof crossCheck !== 'function' ||
      typeof writeResult !== 'function') fail();
  let accepting = true;
  let started = false;
  let terminal = false;
  const sendMessage = type => pinNativePromiseConstructor(new NATIVE_PROMISE(
    (resolve, reject) => {
      if (!accepting && type !== GATE_B_OPERATOR_REVIEW_CHILD_IPC_TYPES.STOPPED) {
        reject(new GateBResetEpochOfflineCrossCheckError());
        return;
      }
      try {
        REFLECT_APPLY(send, channel, [createGateBOperatorReviewChildIpcMessage(type), error => {
          if (error) reject(new GateBResetEpochOfflineCrossCheckError());
          else resolve(true);
        }]);
      } catch {
        reject(new GateBResetEpochOfflineCrossCheckError());
      }
    },
  ));
  let resolveTerminal;
  const terminalPromise = pinNativePromiseConstructor(new NATIVE_PROMISE(resolve => {
    resolveTerminal = resolve;
  }));
  const finish = success => {
    if (terminal) return;
    terminal = true;
    accepting = false;
    try { REFLECT_APPLY(removeListener, channel, ['message', onMessage]); } catch {}
    resolveTerminal(success);
  };
  const onMessage = message => {
    if (!accepting || terminal) return;
    let parsed;
    try { parsed = parseGateBOperatorReviewChildIpcMessage(message); } catch {
      finish(false);
      return;
    }
    if (parsed.type === GATE_B_OPERATOR_REVIEW_CHILD_IPC_TYPES.STOP) {
      accepting = false;
      void sendMessage(GATE_B_OPERATOR_REVIEW_CHILD_IPC_TYPES.STOPPED).then(
        () => finish(true),
        () => finish(false),
      );
      return;
    }
    if (parsed.type !== GATE_B_OPERATOR_REVIEW_CHILD_IPC_TYPES.REVIEW || started) {
      finish(false);
      return;
    }
    started = true;
    let pending;
    try { pending = exactNativePromise(REFLECT_APPLY(crossCheck, undefined, [])); } catch {
      finish(false);
      return;
    }
    void pending.then(async reviewed => {
      if (!accepting || terminal) return;
      let frame;
      try {
        frame = frameGateBOperatorReviewResult(reviewed);
        await exactNativePromise(REFLECT_APPLY(writeResult, undefined, [frame]));
        if (!accepting || terminal) return;
        await sendMessage(GATE_B_OPERATOR_REVIEW_CHILD_IPC_TYPES.REVIEWED);
        finish(true);
      } catch {
        finish(false);
      } finally {
        if (Buffer.isBuffer(frame)) frame.fill(0);
      }
    }, () => finish(false));
  };
  REFLECT_APPLY(on, channel, ['message', onMessage]);
  try {
    await sendMessage(GATE_B_OPERATOR_REVIEW_CHILD_IPC_TYPES.READY);
  } catch {
    finish(false);
  }
  return terminalPromise;
}

async function launch() {
  if (typeof process.argv[1] !== 'string' ||
      pathToFileURL(process.argv[1]).href !== import.meta.url ||
      typeof process.send !== 'function') return;
  const success = await runGateBResetEpochOfflineCrossCheckChild();
  process.exitCode = success ? 0 : 1;
  try { process.disconnect(); } catch {}
}

void launch().catch(() => {
  process.exitCode = 1;
});
