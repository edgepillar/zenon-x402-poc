import { Buffer } from 'node:buffer';
import { ChildProcess, spawn } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { types as utilTypes } from 'node:util';

import { createFixedPayerSettlementDispatcher } from './fixed-payer-settlement-dispatcher.js';
import {
  FIXED_PAYER_SETTLEMENT_STARTUP_STDERR_BOUNDARY as STARTUP_STDERR_BOUNDARY,
  FIXED_PAYER_SETTLEMENT_STARTUP_STDOUT_BOUNDARY as STARTUP_STDOUT_BOUNDARY,
} from './fixed-payer-settlement-child-startup.js';

const CHILD_ENTRYPOINT = fileURLToPath(new URL(
  './fixed-payer-settlement-child-startup.js',
  import.meta.url,
));
const EXECUTABLE = process.execPath;
const IPC_VERSION = 2;
const OFFLINE_TEST_MODE = '--fixed-payer-offline-test-v2';
const LABELS = Object.freeze(['A', 'B']);
const SHARD_IDS = Object.freeze(['payer-shard-a', 'payer-shard-b']);
const GENERATIONS = Object.freeze(['fixture-generation-a', 'fixture-generation-b']);
const AUTHORITY_FIELDS = Object.freeze([
  'shards', 'startupTimeoutMs', 'terminateGraceMs', 'terminateForceMs',
]);
const SHARD_FIELDS = Object.freeze(['shardId', 'payer', 'generation', 'privateRoot']);
const OWNER_FIELDS = Object.freeze([
  'authority', 'routing', 'requestTimeoutMs', 'maxOperationsPerShard',
]);
const READY_FIELDS = Object.freeze([
  'ipcVersion', 'type', 'correlationId', 'shardId', 'payer', 'generation',
  'journalSchemaVersion', 'journalRevision',
]);
const COMMITTED_FIELDS = Object.freeze([
  'ipcVersion', 'type', 'correlationId', 'shardId', 'payer', 'generation',
]);
const MAX_PATH_BYTES = 4096;
const MAX_STARTUP_TIMEOUT_MS = 30_000;
const MAX_TERMINATE_TIMEOUT_MS = 5_000;
const MAX_OUTPUT_BYTES = 256;
const PUBLICATION_MARKER = 'PUBLICATION_BOUNDARY';
const SAFE_ASCII = /^[\x21-\x7e]+$/;
const OFFLINE_AUTHORITIES = new WeakMap();
const CONSUMED_AUTHORITIES = new WeakSet();
const ARRAY_IS_ARRAY = Array.isArray;
const GET_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OWN_KEYS = Reflect.ownKeys;

export const FIXED_PAYER_SETTLEMENT_OWNER_ERROR_CODES = Object.freeze({
  INVALID_CONFIGURATION: 'FIXED_PAYER_SETTLEMENT_OWNER_INVALID_CONFIGURATION',
  AUTHORITY_REQUIRED: 'FIXED_PAYER_SETTLEMENT_OWNER_AUTHORITY_REQUIRED',
  AUTHORITY_CONSUMED: 'FIXED_PAYER_SETTLEMENT_OWNER_AUTHORITY_CONSUMED',
  STARTUP_FAILED: 'FIXED_PAYER_SETTLEMENT_OWNER_STARTUP_FAILED',
  STARTUP_TIMEOUT: 'FIXED_PAYER_SETTLEMENT_OWNER_STARTUP_TIMEOUT',
  CLEANUP_UNCERTAIN: 'FIXED_PAYER_SETTLEMENT_OWNER_CLEANUP_UNCERTAIN',
  RETIRED: 'FIXED_PAYER_SETTLEMENT_OWNER_RETIRED',
});
const CODES = FIXED_PAYER_SETTLEMENT_OWNER_ERROR_CODES;

export class FixedPayerSettlementOwnerError extends Error {
  constructor(code) {
    super(code);
    this.name = 'FixedPayerSettlementOwnerError';
    this.code = code;
    this.stack = `FixedPayerSettlementOwnerError: ${code}`;
  }
}

function fail(code) {
  throw new FixedPayerSettlementOwnerError(code);
}

function exactRecord(value, fields, code) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
      GET_PROTOTYPE(value) !== Object.prototype) fail(code);
  const keys = OWN_KEYS(value);
  if (keys.length !== fields.length || keys.some(key =>
    typeof key !== 'string' || !fields.includes(key))) fail(code);
  const captured = Object.create(null);
  for (const field of fields) {
    const descriptor = GET_DESCRIPTOR(value, field);
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail(code);
    captured[field] = descriptor.value;
  }
  return captured;
}

function exactArray(value, length, code) {
  if (!ARRAY_IS_ARRAY(value) || IS_PROXY(value) || GET_PROTOTYPE(value) !== Array.prototype ||
      value.length !== length || OWN_KEYS(value).length !== length + 1) fail(code);
  const captured = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = GET_DESCRIPTOR(value, String(index));
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail(code);
    captured.push(descriptor.value);
  }
  return captured;
}

function safeAscii(value, maximum, code) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum ||
      Buffer.byteLength(value, 'utf8') > maximum || !SAFE_ASCII.test(value)) fail(code);
  return value;
}

function absolutePath(value, code) {
  if (typeof value !== 'string' || value.length < 1 ||
      Buffer.byteLength(value, 'utf8') > MAX_PATH_BYTES || value.includes('\0') ||
      !isAbsolute(value) || resolve(value) !== value) fail(code);
  return value;
}

function positiveTimeout(value, maximum, code) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail(code);
  return value;
}

function removeListener(target, event, listener) {
  try { target.removeListener(event, listener); } catch {}
}

function exactReady(message, descriptor) {
  if (!message || typeof message !== 'object' || IS_PROXY(message) || ARRAY_IS_ARRAY(message) ||
      GET_PROTOTYPE(message) !== Object.prototype) return false;
  const keys = OWN_KEYS(message);
  if (keys.length !== READY_FIELDS.length) return false;
  for (const field of READY_FIELDS) {
    const property = GET_DESCRIPTOR(message, field);
    if (!property || !HAS_OWN(property, 'value') || property.enumerable !== true) return false;
  }
  return message.ipcVersion === IPC_VERSION && message.type === 'READY' &&
    message.correlationId === `${descriptor.generation}:${descriptor.shardId}:startup` &&
    message.shardId === descriptor.shardId && message.payer === descriptor.payer &&
    message.generation === descriptor.generation && message.journalSchemaVersion === 1 &&
    message.journalRevision === 0;
}

function exactCommitted(message, descriptor) {
  if (!message || typeof message !== 'object' || IS_PROXY(message) || ARRAY_IS_ARRAY(message) ||
      GET_PROTOTYPE(message) !== Object.prototype) return false;
  const keys = OWN_KEYS(message);
  if (keys.length !== COMMITTED_FIELDS.length) return false;
  for (const field of COMMITTED_FIELDS) {
    const property = GET_DESCRIPTOR(message, field);
    if (!property || !HAS_OWN(property, 'value') || property.enumerable !== true) return false;
  }
  return message.ipcVersion === IPC_VERSION && message.type === 'STARTUP_COMMITTED' &&
    message.correlationId === `${descriptor.generation}:${descriptor.shardId}:startup-commit` &&
    message.shardId === descriptor.shardId && message.payer === descriptor.payer &&
    message.generation === descriptor.generation;
}

function startupCommitFrame(descriptor) {
  return Object.freeze({
    ipcVersion: IPC_VERSION,
    type: 'STARTUP_COMMIT',
    correlationId: `${descriptor.generation}:${descriptor.shardId}:startup-commit`,
    shardId: descriptor.shardId,
    payer: descriptor.payer,
    generation: descriptor.generation,
  });
}

function bounded(promise, milliseconds) {
  return new Promise(resolvePromise => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolvePromise(false);
    }, milliseconds);
    promise.then(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(true);
    }, () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(false);
    });
  });
}

function authorityConfiguration(options) {
  const captured = exactRecord(options, AUTHORITY_FIELDS, CODES.INVALID_CONFIGURATION);
  const shards = exactArray(captured.shards, 2, CODES.INVALID_CONFIGURATION)
    .map((value, index) => {
      const shard = exactRecord(value, SHARD_FIELDS, CODES.INVALID_CONFIGURATION);
      if (shard.shardId !== SHARD_IDS[index] || shard.generation !== GENERATIONS[index]) {
        fail(CODES.INVALID_CONFIGURATION);
      }
      const payer = safeAscii(shard.payer, 128, CODES.INVALID_CONFIGURATION);
      const privateRoot = absolutePath(shard.privateRoot, CODES.INVALID_CONFIGURATION);
      return Object.freeze({
        label: LABELS[index],
        shardId: shard.shardId,
        payer,
        generation: shard.generation,
        privateRoot,
      });
    });
  if (shards[0].payer === shards[1].payer ||
      shards[0].privateRoot === shards[1].privateRoot) fail(CODES.INVALID_CONFIGURATION);
  return Object.freeze({
    shards: Object.freeze(shards),
    startupTimeoutMs: positiveTimeout(
      captured.startupTimeoutMs,
      MAX_STARTUP_TIMEOUT_MS,
      CODES.INVALID_CONFIGURATION,
    ),
    terminateGraceMs: positiveTimeout(
      captured.terminateGraceMs,
      MAX_TERMINATE_TIMEOUT_MS,
      CODES.INVALID_CONFIGURATION,
    ),
    terminateForceMs: positiveTimeout(
      captured.terminateForceMs,
      MAX_TERMINATE_TIMEOUT_MS,
      CODES.INVALID_CONFIGURATION,
    ),
  });
}

export function createFixedPayerSettlementOfflineTestAuthority(options) {
  if (arguments.length !== 1) fail(CODES.INVALID_CONFIGURATION);
  const configuration = authorityConfiguration(options);
  const authority = Object.freeze({ type: 'OFFLINE_TEST' });
  OFFLINE_AUTHORITIES.set(authority, configuration);
  return authority;
}

function ownerConfiguration(options) {
  const captured = exactRecord(options, OWNER_FIELDS, CODES.INVALID_CONFIGURATION);
  const authority = captured.authority;
  const authorityConfigurationValue = OFFLINE_AUTHORITIES.get(authority);
  if (authorityConfigurationValue === undefined) fail(CODES.AUTHORITY_REQUIRED);
  if (CONSUMED_AUTHORITIES.has(authority)) fail(CODES.AUTHORITY_CONSUMED);
  if (!captured.routing || typeof captured.routing !== 'object' ||
      IS_PROXY(captured.routing)) fail(CODES.INVALID_CONFIGURATION);
  positiveTimeout(captured.requestTimeoutMs, 30_000, CODES.INVALID_CONFIGURATION);
  if (!Number.isSafeInteger(captured.maxOperationsPerShard) ||
      captured.maxOperationsPerShard < 1 || captured.maxOperationsPerShard > 256) {
    fail(CODES.INVALID_CONFIGURATION);
  }
  CONSUMED_AUTHORITIES.add(authority);
  return Object.freeze({
    authority: authorityConfigurationValue,
    routing: captured.routing,
    requestTimeoutMs: captured.requestTimeoutMs,
    maxOperationsPerShard: captured.maxOperationsPerShard,
  });
}

function childSnapshot(record) {
  return Object.freeze({
    label: record.descriptor.label,
    ready: record.ready,
    committed: record.committed,
    stdoutBoundary: record.stdoutBoundary,
    stderrBoundary: record.stderrBoundary,
    exitObserved: record.exitObserved,
    closeObserved: record.closeObserved,
  });
}

function ownerSnapshot(state) {
  return Object.freeze({
    phase: state.phase,
    startedChildren: state.children.length,
    dispatcherExposed: state.dispatcher !== null,
    cleanupUncertain: state.cleanupUncertain,
    markerDisposition: 'NOT_REMOVED',
    rootDisposition: 'NOT_REMOVED',
    children: Object.freeze(state.children.map(childSnapshot)),
  });
}

function shutdownResult(quarantined) {
  return Object.freeze({
    closed: true,
    exactReaping: true,
    quarantined,
    markerDisposition: 'NOT_REMOVED',
    rootDisposition: 'NOT_REMOVED',
  });
}

function unexpectedOwnedChild(state) {
  if (state.shutdownRequested) return;
  if (state.phase === 'STARTING') {
    state.startupClean = false;
    state.rejectStartup?.(CODES.STARTUP_FAILED);
    return;
  }
  if (state.phase === 'READY') beginQuarantine(state);
}

function maybeCompleteStartup(state) {
  if (state.phase !== 'STARTING' || !state.startupClean || state.children.length !== 2 ||
      !state.children.every(record => record.ready && record.commitSent &&
        record.commitSendReturned && record.commitAccepted && record.commitCallbackOk &&
        record.committed && record.stdoutBoundary && record.stderrBoundary)) return;
  state.resolveStartup?.();
}

function sendStartupCommit(state, record) {
  record.commitSent = true;
  const callback = error => {
    record.commitCallbackCount += 1;
    if (record.commitCallbackCount !== 1 || (error !== undefined && error !== null)) {
      unexpectedOwnedChild(state);
      return;
    }
    record.commitCallbackOk = true;
    maybeCompleteStartup(state);
  };
  let accepted;
  try {
    accepted = record.child.send(startupCommitFrame(record.descriptor), callback);
  } catch {
    record.commitSendReturned = true;
    unexpectedOwnedChild(state);
    return;
  }
  record.commitSendReturned = true;
  if (accepted !== true) {
    unexpectedOwnedChild(state);
    return;
  }
  record.commitAccepted = true;
  maybeCompleteStartup(state);
}

function beginStartupCommit(state) {
  if (state.commitStarted || state.readyCount !== 2 || state.phase !== 'STARTING') return;
  state.commitStarted = true;
  for (const record of state.children) sendStartupCommit(state, record);
}

function attachOwnedChild(state, child, descriptor) {
  if (!(child instanceof ChildProcess) || typeof child.kill !== 'function' ||
      typeof child.send !== 'function' || typeof child.on !== 'function' ||
      !child.stdout || !child.stderr) fail(CODES.STARTUP_FAILED);
  let resolveExit;
  let resolveClose;
  const record = {
    child,
    descriptor,
    journalIdentity: Object.freeze({}),
    ready: false,
    commitSent: false,
    commitSendReturned: false,
    commitAccepted: false,
    commitCallbackCount: 0,
    commitCallbackOk: false,
    committed: false,
    stdoutBoundary: false,
    stderrBoundary: false,
    exitObserved: false,
    closeObserved: false,
    stdoutBytes: 0,
    stdoutBuffer: '',
    stderrBytes: 0,
    stderrBuffer: '',
    publicationSeen: false,
    deferredStdout: [],
    deferredStdoutBytes: 0,
    deferredStdoutOverflow: false,
    deferredStderr: false,
    terminalListenersRemoved: false,
    exitPromise: new Promise(resolvePromise => { resolveExit = resolvePromise; }),
    closePromise: new Promise(resolvePromise => { resolveClose = resolvePromise; }),
    resolveExit,
    resolveClose,
  };
  state.children.push(record);

  const consumeBoundary = (chunk, stream) => {
    const stdout = stream === 'stdout';
    const boundaryField = stdout ? 'stdoutBoundary' : 'stderrBoundary';
    const bytesField = stdout ? 'stdoutBytes' : 'stderrBytes';
    const bufferField = stdout ? 'stdoutBuffer' : 'stderrBuffer';
    const expected = stdout ? STARTUP_STDOUT_BOUNDARY : STARTUP_STDERR_BOUNDARY;
    if (!record.commitSent || record[boundaryField]) {
      unexpectedOwnedChild(state);
      return;
    }
    record[bytesField] += chunk.length;
    if (record[bytesField] > Buffer.byteLength(expected, 'utf8')) {
      unexpectedOwnedChild(state);
      return;
    }
    const text = chunk.toString('utf8');
    if (/[^\x0a\x20-\x7e]/u.test(text)) {
      unexpectedOwnedChild(state);
      return;
    }
    record[bufferField] += text;
    if (!expected.startsWith(record[bufferField])) {
      unexpectedOwnedChild(state);
      return;
    }
    if (record[bufferField] === expected) {
      record[boundaryField] = true;
      record[bytesField] = 0;
      record[bufferField] = '';
      maybeCompleteStartup(state);
    }
  };
  const runtimeStdout = chunk => {
    record.stdoutBytes += chunk.length;
    if (record.stdoutBytes > MAX_OUTPUT_BYTES) {
      unexpectedOwnedChild(state);
      return;
    }
    const text = chunk.toString('utf8');
    if (/[^\x0a\x20-\x7e]/u.test(text)) {
      unexpectedOwnedChild(state);
      return;
    }
    record.stdoutBuffer += text;
    if (record.stdoutBuffer.includes(PUBLICATION_MARKER)) record.publicationSeen = true;
    if (chunk.length > 0) unexpectedOwnedChild(state);
  };
  record.onMessage = message => {
    if (!record.ready) {
      if (!exactReady(message, descriptor)) {
        unexpectedOwnedChild(state);
        return;
      }
      record.ready = true;
      state.readyCount += 1;
      beginStartupCommit(state);
      return;
    }
    if (!record.committed) {
      if (!record.commitSent || !exactCommitted(message, descriptor)) {
        unexpectedOwnedChild(state);
        return;
      }
      record.committed = true;
      state.committedCount += 1;
      maybeCompleteStartup(state);
      return;
    }
    if (state.phase === 'STARTING') {
      unexpectedOwnedChild(state);
      return;
    }
    if (typeof message !== 'string') unexpectedOwnedChild(state);
  };
  record.onError = () => unexpectedOwnedChild(state);
  record.onDisconnect = () => unexpectedOwnedChild(state);
  record.onExit = () => {
    if (!record.exitObserved) {
      record.exitObserved = true;
      record.resolveExit();
    }
    unexpectedOwnedChild(state);
  };
  record.onClose = () => {
    if (!record.closeObserved) {
      record.closeObserved = true;
      record.resolveClose();
    }
    unexpectedOwnedChild(state);
  };
  record.onStdout = chunk => {
    if (!record.stdoutBoundary) {
      consumeBoundary(chunk, 'stdout');
      return;
    }
    if (state.phase === 'STARTING') {
      record.deferredStdoutBytes += chunk.length;
      if (record.deferredStdoutBytes > MAX_OUTPUT_BYTES) {
        record.deferredStdoutOverflow = true;
      } else {
        record.deferredStdout.push(Buffer.from(chunk));
      }
      return;
    }
    runtimeStdout(chunk);
  };
  record.onStderr = chunk => {
    if (!record.stderrBoundary) {
      consumeBoundary(chunk, 'stderr');
      return;
    }
    if (state.phase === 'STARTING') {
      record.deferredStderr = true;
      return;
    }
    unexpectedOwnedChild(state);
  };
  record.onStreamError = () => {
    unexpectedOwnedChild(state);
  };
  child.on('message', record.onMessage);
  child.on('error', record.onError);
  child.on('disconnect', record.onDisconnect);
  child.on('exit', record.onExit);
  child.on('close', record.onClose);
  child.stdout.on('data', record.onStdout);
  child.stderr.on('data', record.onStderr);
  child.stdout.on('error', record.onStreamError);
  child.stderr.on('error', record.onStreamError);
  return record;
}

function removeTerminalListeners(record) {
  if (record.terminalListenersRemoved) return;
  record.terminalListenersRemoved = true;
  removeListener(record.child, 'message', record.onMessage);
  removeListener(record.child, 'error', record.onError);
  removeListener(record.child, 'disconnect', record.onDisconnect);
  removeListener(record.child, 'exit', record.onExit);
  removeListener(record.child, 'close', record.onClose);
  removeListener(record.child.stdout, 'data', record.onStdout);
  removeListener(record.child.stderr, 'data', record.onStderr);
  removeListener(record.child.stdout, 'error', record.onStreamError);
  removeListener(record.child.stderr, 'error', record.onStreamError);
  if (record.onPostMessage !== undefined) {
    removeListener(record.child, 'message', record.onPostMessage);
  }
}

function observeDispatcherQuarantine(state) {
  if (state.dispatcher === null || state.shutdownRequested || state.phase !== 'READY') return;
  let statuses;
  try {
    statuses = state.dispatcher.retirementStatus();
  } catch {
    beginQuarantine(state);
    return;
  }
  if (statuses.some(status => status.quarantined)) beginQuarantine(state);
}

function createOwnedDispatcherFacade(state) {
  const dispatcher = state.dispatcher;
  const facade = {
    async settle(paymentPayload, requirements, paymentRequired) {
      observeDispatcherQuarantine(state);
      try {
        return await Reflect.apply(dispatcher.settle, dispatcher, arguments);
      } finally {
        observeDispatcherQuarantine(state);
      }
    },
    async markDeliveryPending(settlement, acceptedRequirement) {
      observeDispatcherQuarantine(state);
      try {
        return await Reflect.apply(dispatcher.markDeliveryPending, dispatcher, arguments);
      } finally {
        observeDispatcherQuarantine(state);
      }
    },
    async markDelivered(settlement, cachedResponse) {
      observeDispatcherQuarantine(state);
      try {
        return await Reflect.apply(dispatcher.markDelivered, dispatcher, arguments);
      } finally {
        observeDispatcherQuarantine(state);
      }
    },
    retire() {
      observeDispatcherQuarantine(state);
      const normalRetirement = state.phase === 'READY' && !state.shutdownRequested &&
        state.lossCleanupPromise === null;
      const retirement = Reflect.apply(dispatcher.retire, dispatcher, arguments);
      if (normalRetirement && state.phase === 'READY' && !state.shutdownRequested) {
        beginNormalRetirement(state);
      }
      return retirement;
    },
    retirementStatus() {
      const statuses = Reflect.apply(dispatcher.retirementStatus, dispatcher, arguments);
      observeDispatcherQuarantine(state);
      return statuses;
    },
  };
  for (const method of Object.values(facade)) Object.freeze(method);
  return Object.freeze(facade);
}

async function terminateOwnedChildren(state, quarantined) {
  state.shutdownRequested = true;
  let retirement = Promise.resolve();
  if (state.dispatcher !== null) {
    try { retirement = state.dispatcher.retire(); } catch { retirement = Promise.reject(); }
  }
  void retirement.catch(() => {});
  const reaped = Promise.all(state.children.map(record =>
    Promise.all([record.exitPromise, record.closePromise])));
  void reaped.catch(() => {});
  for (const record of state.children) {
    if (!record.exitObserved) {
      try { record.child.kill('SIGTERM'); } catch {}
    }
  }
  if (!await bounded(reaped, state.configuration.authority.terminateGraceMs)) {
    for (const record of state.children) {
      if (!record.exitObserved) {
        try { record.child.kill('SIGKILL'); } catch {}
      }
    }
  }
  if (!await bounded(reaped, state.configuration.authority.terminateForceMs)) {
    state.cleanupUncertain = true;
    state.phase = 'CLEANUP_UNCERTAIN';
    fail(CODES.CLEANUP_UNCERTAIN);
  }
  if (!state.children.every(record => record.exitObserved && record.closeObserved) ||
      !await bounded(retirement, state.configuration.authority.terminateForceMs)) {
    state.cleanupUncertain = true;
    state.phase = 'CLEANUP_UNCERTAIN';
    fail(CODES.CLEANUP_UNCERTAIN);
  }
  for (const record of state.children) removeTerminalListeners(record);
  return shutdownResult(quarantined);
}

function beginNormalRetirement(state) {
  if (state.shutdownPromise !== null) return state.shutdownPromise;
  state.phase = 'RETIRING';
  state.shutdownPromise = terminateOwnedChildren(state, false).then(
    result => {
      state.phase = 'CLOSED';
      return result;
    },
    () => {
      state.phase = 'CLEANUP_UNCERTAIN';
      throw new FixedPayerSettlementOwnerError(CODES.CLEANUP_UNCERTAIN);
    },
  );
  void state.shutdownPromise.catch(() => {});
  return state.shutdownPromise;
}

function beginQuarantine(state) {
  if (state.lossCleanupPromise !== null || state.shutdownRequested) return;
  state.phase = 'QUARANTINED';
  if (state.dispatcher !== null) {
    try { state.dispatcher.retire(); } catch {}
  }
  state.lossCleanupPromise = terminateOwnedChildren(state, true).then(
    result => {
      state.phase = 'QUARANTINED';
      return result;
    },
    () => {
      state.phase = 'CLEANUP_UNCERTAIN';
      throw new FixedPayerSettlementOwnerError(CODES.CLEANUP_UNCERTAIN);
    },
  );
  void state.lossCleanupPromise.catch(() => {});
  state.shutdownPromise = state.lossCleanupPromise;
}

function spawnOwnedChild(state, descriptor) {
  let child;
  try {
    child = spawn(
      EXECUTABLE,
      [CHILD_ENTRYPOINT, OFFLINE_TEST_MODE, descriptor.label, descriptor.privateRoot],
      {
        cwd: descriptor.privateRoot,
        env: Object.create(null),
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      },
    );
  } catch {
    fail(CODES.STARTUP_FAILED);
  }
  return attachOwnedChild(state, child, descriptor);
}

async function performStartup(state) {
  state.phase = 'STARTING';
  const startedAt = performance.now();
  let timer;
  let startupFailure = CODES.STARTUP_FAILED;
  try {
    const barrier = new Promise((resolvePromise, rejectPromise) => {
      let settled = false;
      state.resolveStartup = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolvePromise();
      };
      state.rejectStartup = code => {
        if (settled) return;
        settled = true;
        startupFailure = code;
        clearTimeout(timer);
        rejectPromise(new FixedPayerSettlementOwnerError(code));
      };
      timer = setTimeout(
        () => state.rejectStartup(CODES.STARTUP_TIMEOUT),
        state.configuration.authority.startupTimeoutMs,
      );
    });
    void barrier.catch(() => {});
    for (const descriptor of state.configuration.authority.shards) {
      spawnOwnedChild(state, descriptor);
    }
    await barrier;
    if (!state.startupClean ||
        state.children.some(record => !record.ready || !record.commitSent ||
          !record.commitSendReturned || !record.commitAccepted || !record.commitCallbackOk ||
          record.commitCallbackCount !== 1 || !record.committed || !record.stdoutBoundary ||
          !record.stderrBoundary || record.stdoutBytes !== 0 || record.stdoutBuffer !== '' ||
          record.stderrBytes !== 0 || record.stderrBuffer !== '' || record.publicationSeen)) {
      startupFailure = CODES.STARTUP_FAILED;
      fail(startupFailure);
    }
    if (performance.now() - startedAt >= state.configuration.authority.startupTimeoutMs ||
        state.children.length !== 2 ||
        !state.children.every(record => record.ready && record.committed &&
          record.stdoutBoundary && record.stderrBoundary && !record.exitObserved &&
          !record.closeObserved && record.child.connected === true)) {
      startupFailure = CODES.STARTUP_TIMEOUT;
      fail(startupFailure);
    }
    const shards = state.children.map(record => ({
      shardId: record.descriptor.shardId,
      payer: record.descriptor.payer,
      generation: record.descriptor.generation,
      owner: record.child,
      channel: record.child,
      journalIdentity: record.journalIdentity,
    }));
    state.dispatcher = createFixedPayerSettlementDispatcher({
      routing: state.configuration.routing,
      shards,
      requestTimeoutMs: state.configuration.requestTimeoutMs,
      maxOperationsPerShard: state.configuration.maxOperationsPerShard,
    });
    for (const record of state.children) {
      record.onPostMessage = () => { observeDispatcherQuarantine(state); };
      record.child.on('message', record.onPostMessage);
    }
    state.dispatcherFacade = createOwnedDispatcherFacade(state);
    state.phase = 'READY';
    for (const record of state.children) {
      if (record.deferredStdoutOverflow) {
        unexpectedOwnedChild(state);
      } else {
        for (const chunk of record.deferredStdout) record.onStdout(chunk);
      }
      if (record.deferredStderr) unexpectedOwnedChild(state);
      record.deferredStdout.length = 0;
    }
    return state.dispatcherFacade;
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof FixedPayerSettlementOwnerError) startupFailure = error.code;
    else startupFailure = CODES.STARTUP_FAILED;
    state.rejectStartup?.(startupFailure);
    let cleanup;
    try {
      cleanup = terminateOwnedChildren(state, true);
      state.shutdownPromise = cleanup;
      await cleanup;
    } catch {
      state.phase = 'CLEANUP_UNCERTAIN';
      throw new FixedPayerSettlementOwnerError(CODES.CLEANUP_UNCERTAIN);
    }
    state.phase = 'FAILED';
    throw new FixedPayerSettlementOwnerError(
      startupFailure === CODES.STARTUP_TIMEOUT ? CODES.STARTUP_TIMEOUT : CODES.STARTUP_FAILED,
    );
  } finally {
    state.resolveStartup = null;
    state.rejectStartup = null;
  }
}

export function createFixedPayerSettlementOwner(options) {
  if (arguments.length !== 1) fail(CODES.INVALID_CONFIGURATION);
  const configuration = ownerConfiguration(options);
  const state = {
    configuration,
    phase: 'IDLE',
    children: [],
    readyCount: 0,
    committedCount: 0,
    commitStarted: false,
    startupClean: true,
    dispatcher: null,
    dispatcherFacade: null,
    cleanupUncertain: false,
    shutdownRequested: false,
    resolveStartup: null,
    rejectStartup: null,
    startPromise: null,
    shutdownPromise: null,
    lossCleanupPromise: null,
  };
  const start = function start() {
    if (arguments.length !== 0) fail(CODES.INVALID_CONFIGURATION);
    if (state.startPromise === null) {
      if (state.phase !== 'IDLE') {
        state.startPromise = Promise.reject(new FixedPayerSettlementOwnerError(CODES.RETIRED));
        void state.startPromise.catch(() => {});
      } else {
        state.startPromise = performStartup(state);
        void state.startPromise.catch(() => {});
      }
    }
    return state.startPromise;
  };
  const shutdown = function shutdown() {
    if (arguments.length !== 0) fail(CODES.INVALID_CONFIGURATION);
    if (state.shutdownPromise !== null) return state.shutdownPromise;
    if (state.phase === 'IDLE') {
      state.shutdownRequested = true;
      state.phase = 'CLOSED';
      state.shutdownPromise = Promise.resolve(shutdownResult(false));
      return state.shutdownPromise;
    }
    if (state.phase === 'STARTING') {
      state.rejectStartup?.(CODES.STARTUP_FAILED);
      const requestedShutdown = Promise.resolve(state.startPromise).then(
        () => {
          state.shutdownPromise = null;
          return shutdown();
        },
        () => {
          if (state.cleanupUncertain) {
            throw new FixedPayerSettlementOwnerError(CODES.CLEANUP_UNCERTAIN);
          }
          return shutdownResult(true);
        },
      );
      void requestedShutdown.catch(() => {});
      state.shutdownPromise = requestedShutdown;
      return requestedShutdown;
    }
    if (state.phase === 'QUARANTINED' || state.phase === 'CLEANUP_UNCERTAIN' ||
        state.phase === 'FAILED') {
      if (state.lossCleanupPromise !== null) return state.lossCleanupPromise;
      state.shutdownPromise = Promise.resolve(shutdownResult(true));
      return state.shutdownPromise;
    }
    if (state.phase === 'CLOSED') {
      state.shutdownPromise = Promise.resolve(shutdownResult(false));
      return state.shutdownPromise;
    }
    return beginNormalRetirement(state);
  };
  const status = function status() {
    if (arguments.length !== 0) fail(CODES.INVALID_CONFIGURATION);
    return ownerSnapshot(state);
  };
  Object.freeze(start);
  Object.freeze(shutdown);
  Object.freeze(status);
  return Object.freeze({ start, shutdown, status });
}
