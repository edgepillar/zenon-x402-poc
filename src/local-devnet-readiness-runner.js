import { Buffer } from 'node:buffer';
import {
  close as fsClose,
  constants as fsConstants,
  fstat as fsFstat,
  open as fsOpen,
  read as fsRead,
} from 'node:fs';
import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import { Readable } from 'node:stream';
import { TextDecoder, types as utilTypes } from 'node:util';
import { Worker } from 'node:worker_threads';

import {
  OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT,
  createOperatorTrustedLocalDevnetPolicy,
  parseOperatorTrustedLocalDevnetProfileArtifact,
} from './zenon/operator-trusted-local-devnet-profile.js';

const ERROR_MESSAGE = 'local_devnet_readiness_failed';
const ARTIFACT_MAX_BYTES = 16 * 1024;
const OUTPUT_MAX_BYTES = 64 * 1024;
const REAP_TIMEOUT_MS = 2_000;
const REQUEST_PREFIX = 'LDR1\u0000START\u00001\u0000';
const RESPONSE_READY = 'LDR1\u0000READY\u00001';
const RESPONSE_FAILED = 'LDR1\u0000FAILED\u00001';
const EXPECTED_KEYS = Object.freeze([
  'acknowledgement',
  'artifactFileName',
  'rpcUrl',
  'timeoutMs',
]);
const FILENAME = /^[a-z0-9][a-z0-9_-]{0,122}\.json$/;
const LOOPBACK_URL = /^ws:\/\/(?:127\.0\.0\.1|\[::1\]):([1-9][0-9]{0,4})\/$/;
const GENERATION_FIELDS = Object.freeze([
  'dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs',
]);

const APPLY = Reflect.apply;
const ARRAY_INCLUDES = Array.prototype.includes;
const ARRAY_IS_ARRAY = Array.isArray;
const BIG_INT = BigInt;
const BUFFER_ALLOC = Buffer.alloc;
const BUFFER_BYTE_LENGTH = Buffer.byteLength;
const CLEAR_TIMEOUT = clearTimeout;
const CLOSE = fsClose;
const CREATE = Object.create;
const DEFINE_PROPERTY = Object.defineProperty;
const ERROR = Error;
const EVENT_ON = EventEmitter.prototype.on;
const EVENT_ONCE = EventEmitter.prototype.once;
const EVENT_REMOVE_LISTENER = EventEmitter.prototype.removeListener;
const FSTAT = fsFstat;
const FREEZE = Object.freeze;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const GET_UID = process.getuid;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const NUMBER = Number;
const NUMBER_CONSTRUCTOR = Number;
const NUMBER_IS_INTEGER = Number.isInteger;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const OBJECT = Object;
const OBJECT_PROTOTYPE = Object.prototype;
const OPEN = fsOpen;
const PERFORMANCE = performance;
const PERFORMANCE_NOW = performance.now;
const PROMISE = Promise;
const PROMISE_REJECT = Promise.reject;
const PROMISE_THEN = Promise.prototype.then;
const READ = fsRead;
const REFLECT_CONSTRUCT = Reflect.construct;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const REGEXP_EXEC = RegExp.prototype.exec;
const SET_TIMEOUT = setTimeout;
const STREAM_RESUME = Readable.prototype.resume;
const STRING_CHAR_CODE_AT = String.prototype.charCodeAt;
const TEXT_DECODER_DECODE = TextDecoder.prototype.decode;
const WORKER_CONSTRUCTOR = Worker;
const WORKER_POST_MESSAGE = Worker.prototype.postMessage;
const WORKER_TERMINATE = Worker.prototype.terminate;
const WORKER_UNREF = Worker.prototype.unref;
const READINESS_WORKER_URL = new URL('./local-devnet-readiness-worker.js', import.meta.url);
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const EMPTY_WORKER_LIST = apply(FREEZE, OBJECT, [[]]);
const EMPTY_WORKER_ENV = apply(FREEZE, OBJECT, [apply(CREATE, undefined, [null])]);

const OPEN_FLAGS_AVAILABLE = apply(NUMBER_IS_INTEGER, NUMBER_CONSTRUCTOR, [fsConstants.O_RDONLY]) &&
  apply(NUMBER_IS_INTEGER, NUMBER_CONSTRUCTOR, [fsConstants.O_NOFOLLOW]) &&
  apply(NUMBER_IS_INTEGER, NUMBER_CONSTRUCTOR, [fsConstants.O_NONBLOCK]);
const OPEN_FLAGS = OPEN_FLAGS_AVAILABLE
  ? fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK
  : 0;
const MODE_TYPE_MASK = BigInt(fsConstants.S_IFMT);
const MODE_REGULAR = BigInt(fsConstants.S_IFREG);

let invocationActive = false;
let parentPoisoned = false;

function readinessError() {
  const error = apply(REFLECT_CONSTRUCT, undefined, [ERROR, [ERROR_MESSAGE]]);
  apply(DEFINE_PROPERTY, undefined, [error, 'name', {
    configurable: false,
    enumerable: false,
    value: 'LocalDevnetReadinessError',
    writable: false,
  }]);
  apply(DEFINE_PROPERTY, undefined, [error, 'stack', {
    configurable: false,
    enumerable: false,
    value: undefined,
    writable: false,
  }]);
  return error;
}

function fail() {
  throw readinessError();
}

function apply(functionValue, receiver, args) {
  return APPLY(APPLY, undefined, [functionValue, receiver, args]);
}

function isProxy(value) {
  return apply(IS_PROXY, undefined, [value]);
}

function descriptor(value, key) {
  let result;
  try {
    result = apply(GET_OWN_PROPERTY_DESCRIPTOR, undefined, [value, key]);
  } catch {
    fail();
  }
  if (!result || !apply(HAS_OWN, undefined, [result, 'value'])) fail();
  return result;
}

function nullRecord(entries) {
  const record = apply(CREATE, undefined, [null]);
  for (let index = 0; index < entries.length; index += 1) {
    const key = entries[index][0];
    const value = entries[index][1];
    apply(DEFINE_PROPERTY, undefined, [record, key, {
      configurable: false,
      enumerable: true,
      value,
      writable: false,
    }]);
  }
  return record;
}

function appendArray(values, value) {
  apply(DEFINE_PROPERTY, undefined, [values, values.length, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  }]);
}

function fixedIncludes(values, candidate) {
  return apply(ARRAY_INCLUDES, values, [candidate]);
}

function promise(executor) {
  return apply(REFLECT_CONSTRUCT, undefined, [PROMISE, [executor]]);
}

function promiseThen(value, fulfilled, rejected) {
  return apply(PROMISE_THEN, value, [fulfilled, rejected]);
}

function promiseRaceTwo(left, right) {
  return promise((resolve, reject) => {
    promiseThen(left, resolve, reject);
    promiseThen(right, resolve, reject);
  });
}

function promiseAllVoid(values) {
  return promise(resolve => {
    let remaining = values.length;
    let valid = true;
    if (remaining === 0) {
      resolve(true);
      return;
    }
    const complete = succeeded => {
      if (succeeded !== true) valid = false;
      remaining -= 1;
      if (remaining === 0) resolve(valid);
    };
    for (let index = 0; index < values.length; index += 1) {
      try {
        promiseThen(values[index], () => complete(true), () => complete(false));
      } catch {
        complete(false);
      }
    }
  });
}

function exactOptions(value) {
  if (value === null || typeof value !== 'object' || isProxy(value) || apply(ARRAY_IS_ARRAY, undefined, [value])) {
    fail();
  }
  let prototype;
  let keys;
  try {
    prototype = apply(GET_PROTOTYPE_OF, undefined, [value]);
    keys = apply(REFLECT_OWN_KEYS, undefined, [value]);
  } catch {
    fail();
  }
  if (prototype !== OBJECT_PROTOTYPE && prototype !== null) fail();
  if (!apply(ARRAY_IS_ARRAY, undefined, [keys]) || keys.length !== EXPECTED_KEYS.length) fail();
  const entries = [];
  for (let index = 0; index < EXPECTED_KEYS.length; index += 1) {
    const key = EXPECTED_KEYS[index];
    if (!apply(HAS_OWN, undefined, [value, key])) fail();
    appendArray(entries, [key, descriptor(value, key).value]);
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== 'string' || !fixedIncludes(EXPECTED_KEYS, key)) fail();
  }
  return nullRecord(entries);
}

function asciiString(value, maximumBytes) {
  if (typeof value !== 'string') fail();
  const length = apply(BUFFER_BYTE_LENGTH, Buffer, [value, 'utf8']);
  if (length < 1 || length > maximumBytes || length !== value.length) fail();
  for (let index = 0; index < value.length; index += 1) {
    if (apply(STRING_CHAR_CODE_AT, value, [index]) > 0x7f) fail();
  }
  return value;
}

function validateFileName(value) {
  asciiString(value, 128);
  const match = apply(REGEXP_EXEC, FILENAME, [value]);
  if (match === null) fail();
  return value;
}

function validateLoopbackUrl(value) {
  asciiString(value, 128);
  const match = apply(REGEXP_EXEC, LOOPBACK_URL, [value]);
  if (match === null) fail();
  const portDescriptor = descriptor(match, '1');
  const port = apply(NUMBER, undefined, [portDescriptor.value]);
  if (!apply(NUMBER_IS_SAFE_INTEGER, NUMBER_CONSTRUCTOR, [port]) ||
      port < 1 || port > 65_535 || port === 80) fail();
  return value;
}

function validateTimeout(value) {
  if (typeof value !== 'number' || !apply(NUMBER_IS_SAFE_INTEGER, NUMBER_CONSTRUCTOR, [value]) ||
      value < 1_000 || value > 30_000) fail();
  return value;
}

function validateAcknowledgement(value) {
  if (value !== OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT) fail();
  return value;
}

function boxed(value) {
  return nullRecord([['value', value]]);
}

function openDescriptor(fileName) {
  return promise((resolve, reject) => {
    apply(OPEN, undefined, [fileName, OPEN_FLAGS, (error, fd) => {
      if (error || !apply(NUMBER_IS_INTEGER, NUMBER_CONSTRUCTOR, [fd])) reject(readinessError());
      else resolve(fd);
    }]);
  });
}

function statDescriptor(fd) {
  return promise((resolve, reject) => {
    apply(FSTAT, undefined, [fd, { bigint: true }, (error, stats) => {
      if (error || stats === null || typeof stats !== 'object') {
        reject(readinessError());
        return;
      }
      try {
        const entries = [];
        for (let index = 0; index < GENERATION_FIELDS.length; index += 1) {
          const field = GENERATION_FIELDS[index];
          appendArray(entries, [field, descriptor(stats, field).value]);
        }
        resolve(nullRecord(entries));
      } catch {
        reject(readinessError());
      }
    }]);
  });
}

function readDescriptor(fd, buffer, offset, length, position) {
  return promise((resolve, reject) => {
    apply(READ, undefined, [fd, buffer, offset, length, position, (error, bytesRead) => {
      if (error || !apply(NUMBER_IS_INTEGER, NUMBER_CONSTRUCTOR, [bytesRead])) reject(readinessError());
      else resolve(bytesRead);
    }]);
  });
}

function closeDescriptor(fd) {
  return promise((resolve, reject) => {
    apply(CLOSE, undefined, [fd, error => {
      if (error) reject(readinessError());
      else resolve(true);
    }]);
  });
}

function isFile(mode) {
  return (mode & MODE_TYPE_MASK) === MODE_REGULAR;
}

function validateGeneration(generation) {
  if (typeof GET_UID !== 'function') fail();
  const uid = apply(GET_UID, undefined, []);
  if (!apply(NUMBER_IS_SAFE_INTEGER, NUMBER_CONSTRUCTOR, [uid])) fail();
  if (!isFile(generation.mode) || generation.nlink !== 1n ||
      generation.uid !== apply(BIG_INT, undefined, [uid]) ||
      generation.size < 1n || generation.size > apply(BIG_INT, undefined, [ARTIFACT_MAX_BYTES]) ||
      (generation.mode & 0o022n) !== 0n || (generation.mode & 0o7000n) !== 0n) fail();
}

function sameGeneration(left, right) {
  for (let index = 0; index < GENERATION_FIELDS.length; index += 1) {
    const key = GENERATION_FIELDS[index];
    if (left[key] !== right[key]) return false;
  }
  return true;
}

async function readArtifactFile(fileName) {
  if (!OPEN_FLAGS_AVAILABLE) fail();
  let fd;
  let closeFailed = false;
  try {
    fd = await openDescriptor(fileName);
    const before = await statDescriptor(fd);
    validateGeneration(before);
    const size = apply(NUMBER, undefined, [before.size]);
    const buffer = apply(BUFFER_ALLOC, Buffer, [size]);
    let offset = 0;
    while (offset < size) {
      const bytesRead = await readDescriptor(fd, buffer, offset, size - offset, offset);
      if (bytesRead === 0) fail();
      offset += bytesRead;
    }
    const extra = apply(BUFFER_ALLOC, Buffer, [1]);
    const appendedBytesRead = await readDescriptor(fd, extra, 0, 1, size);
    if (appendedBytesRead !== 0) fail();
    const after = await statDescriptor(fd);
    validateGeneration(after);
    if (!sameGeneration(before, after)) fail();
    let text;
    try {
      text = apply(TEXT_DECODER_DECODE, UTF8_DECODER, [buffer]);
    } catch {
      fail();
    }
    return text;
  } finally {
    if (fd !== undefined) {
      try {
        await closeDescriptor(fd);
      } catch {
        closeFailed = true;
      }
    }
    if (closeFailed) fail();
  }
}

function now() {
  return apply(PERFORMANCE_NOW, PERFORMANCE, []);
}

function boundedDelay(milliseconds, callback) {
  return apply(SET_TIMEOUT, undefined, [callback, milliseconds]);
}

function clearDelay(timer) {
  if (timer !== undefined) apply(CLEAR_TIMEOUT, undefined, [timer]);
}

function waitForStreamClose(stream) {
  return promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(true);
    };
    apply(EVENT_ONCE, stream, ['close', finish]);
  });
}

async function waitBounded(operationPromise, milliseconds) {
  let timer;
  const timeout = promise(resolve => {
    timer = boundedDelay(milliseconds, () => resolve(false));
  });
  try {
    const outcome = await promiseRaceTwo(
      promiseThen(operationPromise, value => value === true, () => false),
      timeout,
    );
    return outcome === true;
  } finally {
    clearDelay(timer);
  }
}

async function reapWorker(state) {
  let termination;
  try {
    termination = apply(WORKER_TERMINATE, state.worker, []);
  } catch {
    termination = apply(PROMISE_REJECT, PROMISE, [readinessError()]);
  }
  const resources = promiseAllVoid([
    termination,
    state.exitPromise,
    state.stdoutClosed,
    state.stderrClosed,
  ]);
  const reaped = await waitBounded(resources, REAP_TIMEOUT_MS);
  if (!reaped) {
    parentPoisoned = true;
    try { apply(WORKER_UNREF, state.worker, []); } catch {}
    try { apply(STREAM_RESUME, state.stdout, []); } catch {}
    try { apply(STREAM_RESUME, state.stderr, []); } catch {}
    fail();
  }
}

async function runWorker(frame, timeoutMs) {
  let worker;
  try {
    const options = apply(FREEZE, OBJECT, [nullRecord([
      ['argv', EMPTY_WORKER_LIST],
      ['env', EMPTY_WORKER_ENV],
      ['execArgv', EMPTY_WORKER_LIST],
      ['name', 'local-devnet-readiness'],
      ['stderr', true],
      ['stdin', false],
      ['stdout', true],
      ['trackUnmanagedFds', true],
    ])]);
    worker = apply(REFLECT_CONSTRUCT, undefined, [WORKER_CONSTRUCTOR, [READINESS_WORKER_URL, options]]);
  } catch {
    fail();
  }

  const state = {
    exited: false,
    stderr: worker.stderr,
    stderrClosed: waitForStreamClose(worker.stderr),
    stdout: worker.stdout,
    stdoutClosed: waitForStreamClose(worker.stdout),
    worker,
  };
  state.exitPromise = promise(resolve => {
    apply(EVENT_ONCE, worker, ['exit', () => {
      state.exited = true;
      resolve(true);
    }]);
  });

  let outputBytes = 0;
  let outputOverflow = false;
  let protocolViolation = false;
  let resolveTerminal;
  let terminal = false;
  let workerFailure = false;
  let sent = false;
  const terminalPromise = promise(resolve => { resolveTerminal = resolve; });
  const finish = value => {
    if (terminal) return;
    terminal = true;
    resolveTerminal(value);
  };
  const onData = chunk => {
    const length = chunk && typeof chunk.length === 'number' ? chunk.length : OUTPUT_MAX_BYTES + 1;
    outputBytes += length;
    if (outputBytes > OUTPUT_MAX_BYTES) {
      outputOverflow = true;
      finish(false);
    }
  };
  const onMessage = message => {
    if (terminal) {
      protocolViolation = true;
      return;
    }
    if (typeof message !== 'string' ||
        (message !== RESPONSE_READY && message !== RESPONSE_FAILED)) {
      protocolViolation = true;
      finish(false);
      return;
    }
    finish(message === RESPONSE_READY);
  };
  const onOnline = () => {
    if (terminal || sent) {
      finish(false);
      return;
    }
    sent = true;
    try {
      apply(WORKER_POST_MESSAGE, worker, [frame]);
    } catch {
      finish(false);
    }
  };
  const onFailure = () => {
    workerFailure = true;
    finish(false);
  };
  const onExit = () => { if (!terminal) finish(false); };

  let timeout;
  let ready = false;
  try {
    apply(EVENT_ON, state.stdout, ['data', onData]);
    apply(EVENT_ON, state.stderr, ['data', onData]);
    apply(EVENT_ON, worker, ['message', onMessage]);
    apply(EVENT_ON, worker, ['messageerror', onFailure]);
    apply(EVENT_ON, worker, ['error', onFailure]);
    apply(EVENT_ON, worker, ['online', onOnline]);
    apply(EVENT_ON, worker, ['exit', onExit]);
    apply(STREAM_RESUME, state.stdout, []);
    apply(STREAM_RESUME, state.stderr, []);
    const timeoutPromise = promise(resolve => {
      timeout = boundedDelay(timeoutMs, () => resolve(false));
    });
    ready = await promiseRaceTwo(terminalPromise, timeoutPromise);
  } catch {
    workerFailure = true;
  } finally {
    clearDelay(timeout);
    try {
      await reapWorker(state);
    } finally {
      const removals = [
        [state.stdout, 'data', onData],
        [state.stderr, 'data', onData],
        [worker, 'message', onMessage],
        [worker, 'messageerror', onFailure],
        [worker, 'error', onFailure],
        [worker, 'online', onOnline],
        [worker, 'exit', onExit],
      ];
      for (let index = 0; index < removals.length; index += 1) {
        try {
          apply(EVENT_REMOVE_LISTENER, removals[index][0], [removals[index][1], removals[index][2]]);
        } catch {
          workerFailure = true;
        }
      }
    }
  }
  if (ready !== true || outputOverflow || protocolViolation || workerFailure) fail();
  return true;
}

export async function runOperatorTrustedLocalDevnetReadiness(options) {
  if (invocationActive || parentPoisoned) fail();
  invocationActive = true;
  try {
    const snapshot = exactOptions(options);
    const acknowledgement = validateAcknowledgement(snapshot.acknowledgement);
    const timeoutMs = validateTimeout(snapshot.timeoutMs);
    const rpcUrl = validateLoopbackUrl(snapshot.rpcUrl);
    const artifactFileName = validateFileName(snapshot.artifactFileName);
    const artifactText = await readArtifactFile(artifactFileName);
    const artifact = parseOperatorTrustedLocalDevnetProfileArtifact(artifactText);
    if (artifact.acknowledgement !== acknowledgement) fail();
    createOperatorTrustedLocalDevnetPolicy(artifact);
    asciiString(artifactText, ARTIFACT_MAX_BYTES);
    const frame = `${REQUEST_PREFIX}${timeoutMs}\u0000${rpcUrl.length}\u0000${artifactText.length}\u0000${rpcUrl}${artifactText}`;
    const result = await runWorker(frame, timeoutMs);
    if (result !== true) fail();
    return true;
  } catch {
    throw readinessError();
  } finally {
    invocationActive = false;
  }
}
