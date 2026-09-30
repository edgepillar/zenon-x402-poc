/**
 * ISOLATED OFFLINE NONCE PRODUCTION ONLY.
 *
 * This owner runs one fixed child artifact and verifies its candidate against
 * the original copied scope. It provides no chain/freshness authentication,
 * runtime capability, authorization, publication, or retry behavior.
 */

import childProcess from 'node:child_process';
import fs from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { types as utilTypes } from 'node:util';

import { verifyOfflineZenonNonceProof } from './offline-nonce-proof-verifier.js';

const SPAWN = childProcess.spawn;
const REALPATH_SYNC = fs.realpathSync;
const STAT_SYNC = fs.statSync;
const READ_FILE_SYNC = fs.readFileSync;
const ACCESS_SYNC = fs.accessSync;
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_INCLUDES = Array.prototype.includes;
const BUFFER_ALLOC = Buffer.alloc;
const BUFFER_FROM = Buffer.from;
const BUFFER_IS_BUFFER = Buffer.isBuffer;
const CLEAR_TIMEOUT = globalThis.clearTimeout;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const JSON_PARSE = JSON.parse;
const NATIVE_PROMISE = Promise;
const NATIVE_SET_TIMEOUT = globalThis.setTimeout;
const OBJECT_CREATE = Object.create;
const OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_IS = Object.is;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;

const INPUT_FIELDS = OBJECT_FREEZE([
  'payer',
  'previousAccountHash',
  'difficulty',
]);
const TRUST = OBJECT_FREEZE({
  sourceAuthentication: 'NOT_ESTABLISHED',
  chainAuthentication: 'NOT_ESTABLISHED',
  canonicality: 'NOT_ESTABLISHED',
  finality: 'NOT_ESTABLISHED',
  liveFreshness: 'NOT_ESTABLISHED',
  signingAuthorization: 'NOT_ESTABLISHED',
});
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GENERATORS = OBJECT_FREEZE([
  0x3b6a57b2,
  0x26508e6d,
  0x1ea119fa,
  0x3d4233dd,
  0x2a1462b3,
]);
const ADDRESS_LENGTH = 40;
const HASH_HEX_LENGTH = 64;
const REQUEST_BYTES = 65;
const RESPONSE_HEADER_BYTES = 7;
const RESPONSE_MAXIMUM_BYTES = 29;
const PROTOCOL_VERSION = 1;
const REQUEST_MAGIC = BUFFER_FROM('ZNI1', 'ascii');
const RESPONSE_MAGIC = BUFFER_FROM('ZNO1', 'ascii');
const FRAME_READY = 1;
const FRAME_WRAPPER_INVOKED = 2;
const FRAME_SUCCESS = 3;
const FRAME_REJECTION = 4;
const CHILD_DEADLINE_MS = 3_000;
const FIXED_ERROR_MESSAGE = 'Offline Zenon nonce production rejected';
const INPUT_REJECTED = 'OFFLINE_ZENON_NONCE_PRODUCER_INPUT_REJECTED';
const OUTCOME_UNKNOWN = 'OFFLINE_ZENON_NONCE_PRODUCER_OUTCOME_UNKNOWN';
const INVALID_CANDIDATE = 'OFFLINE_ZENON_NONCE_PRODUCER_INVALID_CANDIDATE';
const CHILD_REJECTED = 'OFFLINE_ZENON_NONCE_PRODUCER_CHILD_REJECTED';
const NETWORK_BOUNDARY = 'TRUSTED_ARTIFACT_JS_DENIAL_FACADE_NOT_OS_SANDBOX';
const DEPENDENCY_NAMES = OBJECT_FREEZE([
  '@noble/ed25519',
  '@noble/hashes',
  '@open-rpc/client-js',
  'bech32',
  'create-hmac',
  'ed25519-hd-key',
  'eventemitter3',
  'isomorphic-ws',
  'rpc-websockets',
  'tweetnacl',
  'uuid',
  'ws',
  'znn-typescript-sdk',
]);

function configurationRejected() {
  const error = new Error(FIXED_ERROR_MESSAGE);
  OBJECT_DEFINE_PROPERTY(error, 'stack', { value: undefined });
  throw error;
}

function canonicalFile(url) {
  try {
    const path = fileURLToPath(url);
    if (!isAbsolute(path)) configurationRejected();
    const canonical = REFLECT_APPLY(REALPATH_SYNC, fs, [path]);
    if (!isAbsolute(canonical) || !REFLECT_APPLY(STAT_SYNC, fs, [canonical]).isFile()) {
      configurationRejected();
    }
    return canonical;
  } catch {
    configurationRejected();
  }
}

function canonicalDirectory(url) {
  try {
    const path = fileURLToPath(url);
    if (!isAbsolute(path)) configurationRejected();
    const canonical = REFLECT_APPLY(REALPATH_SYNC, fs, [path]);
    if (!isAbsolute(canonical) || !REFLECT_APPLY(STAT_SYNC, fs, [canonical]).isDirectory()) {
      configurationRejected();
    }
    return canonical;
  } catch {
    configurationRejected();
  }
}

function canonicalExecutable(value) {
  try {
    if (typeof value !== 'string' || value.length === 0 || value.length > 4_096 ||
        value.includes('\0') || !isAbsolute(value)) configurationRejected();
    const canonical = REFLECT_APPLY(REALPATH_SYNC, fs, [value]);
    const state = REFLECT_APPLY(STAT_SYNC, fs, [canonical]);
    if (!isAbsolute(canonical) || !state.isFile()) configurationRejected();
    REFLECT_APPLY(ACCESS_SYNC, fs, [canonical, fs.constants.X_OK]);
    return canonical;
  } catch {
    configurationRejected();
  }
}

const EXECUTABLE = canonicalExecutable(process.execPath);
const CHILD_PATH = canonicalFile(new URL('./offline-pow-producer-child.js', import.meta.url));
const CHILD_CWD = canonicalDirectory(new URL('./', import.meta.url));
const PACKAGE_PATH = canonicalFile(new URL('../../../package.json', import.meta.url));
const DEPENDENCY_PATHS = DEPENDENCY_NAMES.map(name => canonicalDirectory(
  new URL(`../../../node_modules/${name}/`, import.meta.url),
));
const READ_ALLOWANCES = OBJECT_FREEZE([
  ...new Set([CHILD_PATH, PACKAGE_PATH, ...DEPENDENCY_PATHS]),
]);
const CHILD_ARGUMENTS = OBJECT_FREEZE([
  '--permission',
  ...READ_ALLOWANCES.map(path => `--allow-fs-read=${path}`),
  CHILD_PATH,
]);
const SDK_PACKAGE_PATH = canonicalFile(
  new URL('../../../node_modules/znn-typescript-sdk/package.json', import.meta.url),
);
let SDK_VERSION;
try {
  const manifest = REFLECT_APPLY(JSON_PARSE, JSON, [
    REFLECT_APPLY(READ_FILE_SYNC, fs, [SDK_PACKAGE_PATH, 'utf8']),
  ]);
  SDK_VERSION = manifest?.version;
} catch {
  configurationRejected();
}
if (SDK_VERSION !== '1.0.5') configurationRejected();

function setTimeout(callback, milliseconds) {
  return REFLECT_APPLY(NATIVE_SET_TIMEOUT, globalThis, [callback, milliseconds]);
}

function clearTimeout(handle) {
  REFLECT_APPLY(CLEAR_TIMEOUT, globalThis, [handle]);
}

function exactInputRecord(input) {
  if ((input !== null && typeof input === 'object') || typeof input === 'function') {
    if (REFLECT_APPLY(IS_PROXY, undefined, [input])) rejectInput();
  }
  if (input === null || typeof input !== 'object' ||
      REFLECT_APPLY(ARRAY_IS_ARRAY, undefined, [input]) ||
      REFLECT_APPLY(GET_PROTOTYPE_OF, Object, [input]) !== OBJECT_PROTOTYPE) rejectInput();

  const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [input]);
  if (keys.length !== INPUT_FIELDS.length) rejectInput();
  for (const key of keys) {
    if (typeof key !== 'string' ||
        !REFLECT_APPLY(ARRAY_INCLUDES, INPUT_FIELDS, [key])) rejectInput();
  }

  const snapshot = REFLECT_APPLY(OBJECT_CREATE, Object, [null]);
  for (const field of INPUT_FIELDS) {
    const descriptor = REFLECT_APPLY(GET_OWN_PROPERTY_DESCRIPTOR, Object, [input, field]);
    if (!descriptor || descriptor.enumerable !== true || !HAS_OWN(descriptor, 'value')) {
      rejectInput();
    }
    snapshot[field] = descriptor.value;
  }
  return snapshot;
}

function lowercaseHex(value, length) {
  if (typeof value !== 'string' || value.length !== length) rejectInput();
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const decimal = code >= 48 && code <= 57;
    const lowercase = code >= 97 && code <= 102;
    if (!decimal && !lowercase) rejectInput();
  }
}

function bech32Polymod(values) {
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let index = 0; index < BECH32_GENERATORS.length; index += 1) {
      if ((top >>> index) & 1) checksum ^= BECH32_GENERATORS[index];
    }
  }
  return checksum >>> 0;
}

function canonicalPayerCore(value) {
  if (typeof value !== 'string' || value.length !== ADDRESS_LENGTH ||
      value.charCodeAt(0) !== 122 || value.charCodeAt(1) !== 49) rejectInput();
  const words = [];
  for (let index = 2; index < value.length; index += 1) {
    const decoded = BECH32_CHARSET.indexOf(value[index]);
    if (decoded < 0) rejectInput();
    words.push(decoded);
  }
  if (bech32Polymod([3, 0, 26, ...words]) !== 1) rejectInput();

  const output = [];
  let accumulator = 0;
  let bits = 0;
  for (const word of words.slice(0, -6)) {
    accumulator = ((accumulator << 5) | word) & 0xfff;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      output.push((accumulator >>> bits) & 0xff);
    }
  }
  if (bits >= 5 || ((accumulator << (8 - bits)) & 0xff) !== 0 ||
      output.length !== 20 || output[0] !== 0) rejectInput();
  return REFLECT_APPLY(BUFFER_FROM, Buffer, [output]);
}

function sanitizedError(code, lifecycle, ErrorType = Error) {
  const error = new ErrorType(FIXED_ERROR_MESSAGE);
  OBJECT_DEFINE_PROPERTY(error, 'stack', {
    configurable: false,
    enumerable: false,
    value: undefined,
    writable: false,
  });
  OBJECT_DEFINE_PROPERTY(error, 'code', {
    configurable: false,
    enumerable: true,
    value: code,
    writable: false,
  });
  if (lifecycle !== undefined) {
    OBJECT_DEFINE_PROPERTY(error, 'lifecycle', {
      configurable: false,
      enumerable: true,
      value: lifecycle,
      writable: false,
    });
  }
  return OBJECT_FREEZE(error);
}

function rejectInput() {
  throw sanitizedError(INPUT_REJECTED, undefined, TypeError);
}

function copiedScope(input) {
  const record = exactInputRecord(input);
  const payerCore = canonicalPayerCore(record.payer);
  try {
    lowercaseHex(record.previousAccountHash, HASH_HEX_LENGTH);
    if (!REFLECT_APPLY(NUMBER_IS_SAFE_INTEGER, Number, [record.difficulty]) ||
        record.difficulty <= 0 ||
        REFLECT_APPLY(OBJECT_IS, Object, [record.difficulty, -0])) rejectInput();
    return {
      payerCore,
      scope: OBJECT_FREEZE({
        payer: record.payer,
        previousAccountHash: record.previousAccountHash,
        difficulty: record.difficulty,
      }),
    };
  } catch (error) {
    payerCore.fill(0);
    throw error;
  }
}

function requestFrame(payerCore, scope) {
  const frame = REFLECT_APPLY(BUFFER_ALLOC, Buffer, [REQUEST_BYTES]);
  REQUEST_MAGIC.copy(frame, 0);
  frame[4] = PROTOCOL_VERSION;
  payerCore.copy(frame, 5);
  const previous = REFLECT_APPLY(BUFFER_FROM, Buffer, [scope.previousAccountHash, 'hex']);
  try {
    previous.copy(frame, 25);
    frame.writeBigUInt64BE(BigInt(scope.difficulty), 57);
    return frame;
  } finally {
    previous.fill(0);
  }
}

function inspectProtocol(buffer, length, overflow) {
  const observation = {
    exact: false,
    ready: false,
    wrapper: false,
    terminal: 'NOT_OBSERVED_OR_UNKNOWN',
    nonce: null,
  };
  let offset = 0;
  let expected = FRAME_READY;
  while (offset < length) {
    if (length - offset < RESPONSE_HEADER_BYTES) return observation;
    if (!buffer.subarray(offset, offset + 4).equals(RESPONSE_MAGIC) ||
        buffer[offset + 4] !== PROTOCOL_VERSION) return observation;
    const type = buffer[offset + 5];
    const payloadLength = buffer[offset + 6];
    const end = offset + RESPONSE_HEADER_BYTES + payloadLength;
    if (end > length || type !== expected) return observation;

    if (type === FRAME_READY) {
      if (payloadLength !== 0) return observation;
      observation.ready = true;
      expected = FRAME_WRAPPER_INVOKED;
    } else if (type === FRAME_WRAPPER_INVOKED) {
      if (payloadLength !== 0) return observation;
      observation.wrapper = true;
      expected = 0;
    } else if (type === FRAME_SUCCESS) {
      if (payloadLength !== 8 || !observation.ready || !observation.wrapper) return observation;
      observation.terminal = 'SUCCESS';
      observation.nonce = BUFFER_FROM(buffer.subarray(offset + RESPONSE_HEADER_BYTES, end));
      expected = -1;
    } else if (type === FRAME_REJECTION) {
      if (payloadLength !== 0 || !observation.ready || !observation.wrapper) return observation;
      observation.terminal = 'REJECTION';
      expected = -1;
    } else {
      return observation;
    }
    offset = end;
    if (expected === 0) {
      if (offset >= length) return observation;
      const nextType = buffer[offset + 5];
      if (nextType !== FRAME_SUCCESS && nextType !== FRAME_REJECTION) return observation;
      expected = nextType;
    } else if (expected === -1 && offset !== length) {
      return observation;
    }
  }
  observation.exact = !overflow && expected === -1 && offset === length;
  return observation;
}

function processExitLabel(state) {
  if (!state.exitObserved) return 'NOT_OBSERVED';
  if (state.exitSignal !== null) return 'SIGNALLED';
  if (state.exitCode === 0) return 'ZERO';
  return 'NONZERO';
}

function lifecycle(status, state, protocol) {
  return OBJECT_FREEZE({
    status,
    attemptCount: 1,
    ready: protocol?.ready === true ? 'OBSERVED' : 'NOT_OBSERVED_OR_UNKNOWN',
    wrapperInvocation: protocol?.wrapper === true
      ? 'JS_WRAPPER_INVOKED'
      : 'NOT_OBSERVED_OR_UNKNOWN',
    nativeOrWasmEntry: 'NOT_ESTABLISHED',
    terminal: protocol?.terminal ?? 'NOT_OBSERVED_OR_UNKNOWN',
    processExit: processExitLabel(state),
    processClose: state.closeObserved ? 'OBSERVED' : 'NOT_OBSERVED',
    stdioClose: state.requestPresent && state.responsePresent &&
      state.requestClosed && state.responseClosed
      ? 'OBSERVED'
      : 'NOT_OBSERVED',
    termination: state.termination,
    retry: 'NOT_PERFORMED',
    networkBoundary: protocol?.ready === true
      ? NETWORK_BOUNDARY
      : 'NOT_OBSERVED_OR_UNKNOWN',
  });
}

function successResult(scope, nonce, completedLifecycle) {
  return OBJECT_FREEZE({
    qualification: 'OFFLINE_NONCE_PRODUCER_ONLY',
    status: 'VALID',
    nonce,
    recordedProofScope: OBJECT_FREEZE({
      payer: scope.payer,
      previousAccountHash: scope.previousAccountHash,
      difficulty: scope.difficulty,
    }),
    lifecycle: completedLifecycle,
    trust: OBJECT_FREEZE({ ...TRUST }),
  });
}

function produceAttempt(scope, payerCore) {
  let outbound;
  try {
    outbound = requestFrame(payerCore, scope);
  } finally {
    payerCore.fill(0);
  }
  return new NATIVE_PROMISE((resolve, reject) => {
    const response = REFLECT_APPLY(BUFFER_ALLOC, Buffer, [RESPONSE_MAXIMUM_BYTES + 1]);
    const state = {
      childError: false,
      closeCode: undefined,
      closeObserved: false,
      closeSignal: undefined,
      deadline: false,
      exitCode: undefined,
      exitObserved: false,
      exitSignal: undefined,
      inputError: false,
      outputEnded: false,
      outputError: false,
      overflow: false,
      requestClosed: false,
      requestFinished: false,
      requestPresent: false,
      responseClosed: false,
      responsePresent: false,
      settled: false,
      storedBytes: 0,
      termination: 'NOT_REQUESTED',
    };
    let child;
    let request;
    let output;
    let requestClosePromise = NATIVE_PROMISE.resolve();
    let responseClosePromise = NATIVE_PROMISE.resolve();
    let resolveRequestClose;
    let resolveResponseClose;
    let outboundCleared = false;

    function clearOutbound() {
      if (outboundCleared) return;
      outboundCleared = true;
      outbound.fill(0);
    }

    function terminateOwnedChild() {
      if (state.termination !== 'NOT_REQUESTED' || child === undefined ||
          state.closeObserved || state.exitObserved) return;
      state.termination = 'REQUESTED';
      try {
        if (child.kill('SIGKILL') !== true) state.termination = 'FAILED';
      } catch {
        state.termination = 'FAILED';
      }
    }

    function onDeadline() {
      state.deadline = true;
      terminateOwnedChild();
    }

    const deadline = setTimeout(onDeadline, CHILD_DEADLINE_MS);

    try {
      child = REFLECT_APPLY(SPAWN, childProcess, [
        EXECUTABLE,
        [...CHILD_ARGUMENTS],
        {
          cwd: CHILD_CWD,
          detached: false,
          env: REFLECT_APPLY(OBJECT_CREATE, Object, [null]),
          shell: false,
          stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      ]);
    } catch {
      clearTimeout(deadline);
      clearOutbound();
      response.fill(0);
      reject(sanitizedError(OUTCOME_UNKNOWN, lifecycle('OUTCOME_UNKNOWN', state)));
      return;
    }

    try {
      request = child.stdio[3];
      output = child.stdio[4];
    } catch {
      state.inputError = true;
      state.outputError = true;
    }

    if (request instanceof Writable) {
      state.requestPresent = true;
      requestClosePromise = new NATIVE_PROMISE(resolveClose => {
        resolveRequestClose = resolveClose;
      });
      request.once('finish', () => {
        state.requestFinished = true;
        clearOutbound();
      });
      request.once('close', () => {
        state.requestClosed = true;
        clearOutbound();
        resolveRequestClose();
      });
      request.on('error', () => {
        state.inputError = true;
        terminateOwnedChild();
      });
    } else {
      state.inputError = true;
      state.requestClosed = true;
      clearOutbound();
    }

    if (output instanceof Readable) {
      state.responsePresent = true;
      responseClosePromise = new NATIVE_PROMISE(resolveClose => {
        resolveResponseClose = resolveClose;
      });
      output.on('data', chunk => {
        if (!REFLECT_APPLY(BUFFER_IS_BUFFER, Buffer, [chunk])) {
          state.outputError = true;
          terminateOwnedChild();
          return;
        }
        const available = response.length - state.storedBytes;
        const copied = Math.min(available, chunk.length);
        if (copied > 0) chunk.copy(response, state.storedBytes, 0, copied);
        state.storedBytes += copied;
        if (copied !== chunk.length || state.storedBytes > RESPONSE_MAXIMUM_BYTES) {
          state.overflow = true;
          terminateOwnedChild();
        }
      });
      output.once('end', () => {
        state.outputEnded = true;
      });
      output.once('close', () => {
        state.responseClosed = true;
        resolveResponseClose();
      });
      output.on('error', () => {
        state.outputError = true;
        terminateOwnedChild();
      });
    } else {
      state.outputError = true;
      state.responseClosed = true;
    }

    child.once('error', () => {
      state.childError = true;
      terminateOwnedChild();
    });
    child.once('exit', (code, signal) => {
      state.exitObserved = true;
      state.exitCode = code;
      state.exitSignal = signal;
    });
    child.once('close', (code, signal) => {
      state.closeObserved = true;
      state.closeCode = code;
      state.closeSignal = signal;
      clearTimeout(deadline);
      if (request instanceof Writable && !state.requestClosed) {
        try { request.destroy(); } catch { state.inputError = true; }
      }
      if (output instanceof Readable && !state.responseClosed) {
        try { output.destroy(); } catch { state.outputError = true; }
      }
      void NATIVE_PROMISE.all([requestClosePromise, responseClosePromise])
        .then(() => complete());
    });

    if (!(request instanceof Writable) || !(output instanceof Readable)) {
      terminateOwnedChild();
    } else {
      try {
        request.end(outbound);
      } catch {
        state.inputError = true;
        clearOutbound();
        terminateOwnedChild();
      }
    }

    function complete() {
      if (state.settled) return;
      state.settled = true;
      clearOutbound();
      const protocol = inspectProtocol(response, state.storedBytes, state.overflow);
      const nonceBytes = protocol.nonce;
      let nonce;
      if (nonceBytes !== null) nonce = nonceBytes.toString('hex');
      response.fill(0);
      nonceBytes?.fill(0);

      const cleanTransport = !state.childError && !state.deadline &&
        !state.inputError && !state.outputError && !state.overflow &&
        state.requestFinished && state.requestClosed && state.outputEnded &&
        state.responseClosed && state.exitObserved && state.exitCode === 0 &&
        state.exitSignal === null && state.closeObserved && state.closeCode === 0 &&
        state.closeSignal === null && state.termination === 'NOT_REQUESTED';

      if (!cleanTransport || !protocol.exact) {
        reject(sanitizedError(
          OUTCOME_UNKNOWN,
          lifecycle('OUTCOME_UNKNOWN', state, protocol),
        ));
        return;
      }
      if (protocol.terminal === 'REJECTION') {
        reject(sanitizedError(
          CHILD_REJECTED,
          lifecycle('REJECTED', state, protocol),
        ));
        return;
      }
      if (protocol.terminal !== 'SUCCESS' || typeof nonce !== 'string') {
        reject(sanitizedError(
          OUTCOME_UNKNOWN,
          lifecycle('OUTCOME_UNKNOWN', state, protocol),
        ));
        return;
      }

      let verification;
      try {
        verification = verifyOfflineZenonNonceProof({
          payer: scope.payer,
          previousAccountHash: scope.previousAccountHash,
          difficulty: scope.difficulty,
          nonce,
        });
      } catch {
        reject(sanitizedError(
          OUTCOME_UNKNOWN,
          lifecycle('OUTCOME_UNKNOWN', state, protocol),
        ));
        return;
      }
      const verifiedScope = verification.recordedProofScope;
      if (verification.status !== 'VALID' ||
          verifiedScope.payer !== scope.payer ||
          verifiedScope.previousAccountHash !== scope.previousAccountHash ||
          verifiedScope.difficulty !== scope.difficulty) {
        reject(sanitizedError(
          INVALID_CANDIDATE,
          lifecycle('REJECTED', state, protocol),
        ));
        return;
      }
      resolve(successResult(
        scope,
        nonce,
        lifecycle('COMPLETED', state, protocol),
      ));
    }
  });
}

export function produceOfflineZenonNonce(input) {
  if (arguments.length !== 1) rejectInput();
  const copied = copiedScope(input);
  return produceAttempt(copied.scope, copied.payerCore);
}
